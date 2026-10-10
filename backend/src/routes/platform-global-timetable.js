/* M4L V104.5.4 - Derived-by-default Courses with explicit sessions and materialised exceptions. */

import { getAuthUser as defaultGetAuthUser } from "../lib/auth.js";
import { buildAcademyCalendarEvents, noTeachingEventsOnDates } from "../lib/academy-calendar.js";
import {
  COURSE_SCHEDULE_MODE_DERIVED,
  COURSE_SCHEDULE_MODE_EXPLICIT,
  deriveCourseScheduleOccurrences,
  derivedOccurrenceAnchor,
  GLOBAL_SESSION_KIND_EXCEPTION,
  GLOBAL_SESSION_KIND_EXPLICIT,
  normalizeCourseScheduleMode,
  normalizeGlobalSessionKind,
  parseCourseScheduleDefinition,
  ruleOccursOnDate,
  serializeCourseScheduleDefinition,
  validateCourseScheduleRuleConflicts
} from "../lib/global-course-scheduling.js";
import {
  activeGlobalTimetableSessionsForRun,
  generateSessionDates,
  GLOBAL_TIMETABLE_DEVELOPMENT_STAGE,
  GLOBAL_TIMETABLE_PUBLISHED_STAGE,
  mapGlobalTimetablePublication,
  mapGlobalTimetableRunState,
  mapGlobalTimetableSession,
  mapPublishedGlobalTimetableSession,
  sessionWithinRun,
  validateIsoDate,
  validateTimeRange
} from "../lib/global-timetable.js";
import { mapGlobalSubjectRun } from "../lib/global-subject-delivery.js";
import {
  GLOBAL_SESSION_STATUS_CANCELLED,
  GLOBAL_SESSION_STATUS_RESCHEDULED,
  GLOBAL_SESSION_STATUS_SCHEDULED,
  GLOBAL_SESSION_STATUSES,
  lifecycleNeedsTeacher,
  mapGlobalTimetableSessionLifecycle,
  normalizeGlobalSessionStatus,
  resolveCurrentSessionLifecycle
} from "../lib/global-timetable-lifecycle.js";
import { batchUpdateGoogleSheetValues as defaultBatchUpdateGoogleSheetValues } from "../lib/google-sheets.js";
import { json } from "../lib/http.js";
import { getPlatformSpreadsheetId as defaultGetPlatformSpreadsheetId, readPlatformSheet as defaultReadPlatformSheet } from "../lib/platform-sheet.js";
import {
  isActivePlatformValue,
  normalizePlatformIdentifier,
  PLATFORM_SHEET_HEADERS
} from "../lib/platform-schema.js";

const MAX_ZOOM_LINK_LENGTH = 1000;
const MAX_SESSION_DESCRIPTION_LENGTH = 400;
const HTTPS_URL_PATTERN = /^https:\/\//i;
const TIMETABLE_SCHEMA_VERSIONS = new Set(["102.0.7", "102.0.8", "102.0.9", "102.0.10", "102.0.11", "102.0.12"]);

// Storage dependencies are scoped to this service instance, never shared between requests.
export function createGlobalTimetableEndpoints(storage = {}) {
  const getAuthUser = storage.getAuthUser || defaultGetAuthUser;
  const batchUpdateGoogleSheetValues = storage.batchUpdateGoogleSheetValues || defaultBatchUpdateGoogleSheetValues;
  const getPlatformSpreadsheetId = storage.getPlatformSpreadsheetId || defaultGetPlatformSpreadsheetId;
  const readPlatformSheet = storage.readPlatformSheet || defaultReadPlatformSheet;

async function getPlatformGlobalTimetableEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const tables = await readGlobalTimetableTables(env);
    const publishedSourceIds = publishedSourceIdSet(tables.PublishedGlobalTimetableSessions);
    return json({
      success: true,
      service: "platform-global-timetable",
      version: "104.5.4",
      courseScheduleSchemaReady: tables.GlobalSubjectRuns._courseScheduleSchemaReady === true && tables.GlobalTimetableSessions._courseScheduleSchemaReady === true && tables.GlobalTimetableSessions._sessionDescriptionSchemaReady === true && tables.GlobalTimetableRunState._draftPublishWindowSchemaReady === true && tables.GlobalTimetablePublications._courseScheduleSchemaReady === true && tables.PublishedGlobalTimetableSessions._courseScheduleSchemaReady === true && tables.PublishedGlobalTimetableSessions._sessionDescriptionSchemaReady === true,
      globalTimetableVersion: readGlobalTimetableVersion(tables.PlatformConfig).value,
      subjects: tables.GlobalSubjectList.map(mapSubject),
      modules: tables.GlobalModuleList.map(mapModule),
      runs: tables.GlobalSubjectRuns.map(run => mapGlobalSubjectRun(run)),
      teachers: tables.UserAccounts.filter(row => isActivePlatformValue(row.Active)).map(mapTeacherAccount),
      sessions: tables.GlobalTimetableSessions.map(row => enrichSession(
        mapGlobalTimetableSession(row, publishedSourceIds), tables
      )),
      states: tables.GlobalTimetableRunState.map(mapGlobalTimetableRunState),
      publications: tables.GlobalTimetablePublications.map(mapGlobalTimetablePublication),
      lifecycles: tables.GlobalTimetableSessionLifecycle
        .filter(row => !clean(row.PublicationID))
        .map(mapGlobalTimetableSessionLifecycle),
      publishedLifecycles: tables.GlobalTimetableSessionLifecycle
        .filter(row => clean(row.PublicationID))
        .map(mapGlobalTimetableSessionLifecycle),
      publishedSessions: tables.PublishedGlobalTimetableSessions.map(mapPublishedGlobalTimetableSession),
      calendarEvents: timetableCalendarEvents(tables)
    });
  } catch (error) {
    return globalTimetableError(error, env);
  }
}

async function generatePlatformGlobalTimetableSessionsEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const runId = clean(body.runId || body.runid);
    const moduleId = clean(body.moduleId || body.moduleid);
    const teacherAccountId = clean(body.teacherAccountId || body.teacheraccountid);
    const startTime = normalizeSubmittedTime(body.startTime || body.starttime);
    const endTime = normalizeSubmittedTime(body.endTime || body.endtime);
    const zoomLink = clean(body.zoomLink || body.zoomlink);
    const sessionDescription = normalizeSessionDescription(body.sessionDescription ?? body.sessiondescription);
    const weekdays = Array.isArray(body.weekdays) ? body.weekdays : [];
    const requestedGenerationStart = clean(body.generationStartDate || body.generationstartdate || body.scheduleStartDate || body.schedulestartdate);
    const requestedGenerationEnd = clean(body.generationEndDate || body.generationenddate || body.scheduleEndDate || body.scheduleenddate);
    const skipExistingEquivalent = body.skipExistingEquivalent === true;

    if (!runId) throw clientError("RunID is required", 400);
    if (!validateTimeRange(startTime, endTime)) throw clientError("StartTime and EndTime require a valid increasing HH:MM range", 400);
    validateZoomLink(zoomLink);

    const tables = await readGlobalTimetableTables(env);
    const run = activeRun(tables, runId);
    if (normalizeCourseScheduleMode(run.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT) !== COURSE_SCHEDULE_MODE_EXPLICIT) {
      throw clientError("DERIVED Courses store recurring rules and materialise only exceptions; switch to EXPLICIT to generate exact sessions", 409);
    }
    requireEditableGlobalTimetable(tables, run.RunID);
    const subject = activeSubject(tables, run.SubjectID);
    const module = resolveModule(tables, moduleId, subject.SubjectID, { requireActive: true });
    const teacher = optionalActiveTeacher(tables, teacherAccountId);
    const runStartDate = clean(run.StartDate);
    const runEndDate = clean(run.EndDate);
    const ongoing = !runStartDate && !runEndDate;
    let generationStartDate = runStartDate;
    let generationEndDate = runEndDate;
    if (ongoing) {
      generationStartDate = requestedGenerationStart;
      generationEndDate = requestedGenerationEnd;
      if (!validateIsoDate(generationStartDate) || !validateIsoDate(generationEndDate) || generationEndDate < generationStartDate) {
        throw clientError("Ongoing courses require valid Generate from and Generate through dates for schedule generation", 400);
      }
    }
    const dates = generateSessionDates(generationStartDate, generationEndDate, weekdays);
    if (!dates.length) throw clientError("The selected weekdays do not occur inside this schedule window", 400);

    const datesToCreate = [];
    for (const sessionDate of dates) {
      const candidate = {
        runId: run.RunID,
        sessionDate,
        startTime,
        endTime,
        moduleId: module ? clean(module.ModuleID) : "",
        teacherAccountId: clean(teacher?.AccountID),
        zoomLink
      };
      if (skipExistingEquivalent && hasEquivalentScheduledSession(
        tables.GlobalTimetableSessions, candidate, tables.GlobalTimetableSessionLifecycle
      )) {
        continue;
      }
      if (hasActiveSlotConflict(tables.GlobalTimetableSessions, candidate, tables.GlobalTimetableSessionLifecycle)) {
        throw clientError(`An active session already overlaps ${sessionDate} ${startTime}-${endTime}`, 409);
      }
      datesToCreate.push(sessionDate);
    }

    const timestamp = new Date().toISOString();
    const records = datesToCreate.map(sessionDate => ({
      SessionID: createPlatformId("GTS"),
      RunID: clean(run.RunID),
      SubjectID: clean(subject.SubjectID),
      ModuleID: module ? clean(module.ModuleID) : "",
      SessionDate: sessionDate,
      StartTime: startTime,
      EndTime: endTime,
      TeacherAccountID: clean(teacher?.AccountID),
      ZoomLink: zoomLink,
      SessionDescription: sessionDescription,
      Active: true,
      CreatedDate: timestamp,
      CreatedByAccountID: permission.user.accountid,
      CreatedByAccountName: permission.user.username,
      ModifiedByAccountID: "",
      ModifiedByAccountName: "",
      ModifiedDate: "",
      SessionKind: GLOBAL_SESSION_KIND_EXPLICIT,
      ScheduleRuleKey: "",
      OccurrenceDate: ""
    }));

    const calendarWarnings = noTeachingEventsOnDates(tables.AcademyCalendar, datesToCreate);
    if (records.length) await writeGeneratedSessions(env, permission.user, tables, run, records, timestamp);
    const publishedSourceIds = publishedSourceIdSet(tables.PublishedGlobalTimetableSessions);
    return json({
      success: true,
      message: records.length
        ? `${records.length} exact-dated global timetable session${records.length === 1 ? "" : "s"} generated`
        : "The selected recurring schedule is already prepared for this window",
      sessions: records.map(row => enrichSession(mapGlobalTimetableSession(row, publishedSourceIds), tables)),
      calendarWarnings,
      state: developmentStateForResponse(tables, run.RunID)
    });
  } catch (error) {
    return globalTimetableMutationError(error, env);
  }
}

async function materializePlatformGlobalTimetableExceptionEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const runId = clean(body.runId || body.runid);
    const scheduleRuleKey = clean(body.scheduleRuleKey || body.schedulerulekey || body.ruleKey || body.rulekey);
    const occurrenceDate = clean(body.occurrenceDate || body.occurrencedate);
    if (!runId) throw clientError("RunID is required", 400);

    const tables = await readGlobalTimetableTables(env);
    const run = activeRun(tables, runId);
    if (normalizeCourseScheduleMode(run.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT) !== COURSE_SCHEDULE_MODE_DERIVED) {
      throw clientError("Session exceptions can only be materialised for a DERIVED Course", 409);
    }
    requireEditableGlobalTimetable(tables, run.RunID);
    const subject = activeSubject(tables, run.SubjectID);
    const rules = parseRunScheduleRules(run);
    let baseRule = null;
    if (scheduleRuleKey) {
      const matches = rules.filter(rule => normalizePlatformIdentifier(rule.rulekey) === normalizePlatformIdentifier(scheduleRuleKey));
      if (matches.length !== 1) throw clientError("ScheduleRuleKey does not resolve to exactly one recurring rule", 409);
      baseRule = matches[0];
      if (!validateIsoDate(occurrenceDate) || !ruleOccursOnDate(baseRule, occurrenceDate) || !sessionWithinRun({ SessionDate: occurrenceDate }, run)) {
        throw clientError("OccurrenceDate must identify a real derived occurrence for this Course", 400);
      }
      const duplicate = tables.GlobalTimetableSessions.some(row => (
        isActivePlatformValue(row.Active) &&
        normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(run.RunID) &&
        normalizeGlobalSessionKind(row.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXCEPTION &&
        derivedOccurrenceAnchor(row.ScheduleRuleKey, row.OccurrenceDate) === derivedOccurrenceAnchor(scheduleRuleKey, occurrenceDate)
      ));
      if (duplicate) throw clientError("This derived occurrence already has a materialised exception", 409);
    }

    const sessionDate = clean(body.sessionDate || body.sessiondate) || occurrenceDate;
    const startTime = normalizeSubmittedTime(body.startTime || body.starttime || baseRule?.starttime);
    const endTime = normalizeSubmittedTime(body.endTime || body.endtime || baseRule?.endtime);
    const moduleId = clean(body.moduleId ?? body.moduleid ?? baseRule?.moduleid);
    const teacherAccountId = clean(body.teacherAccountId ?? body.teacheraccountid ?? baseRule?.teacheraccountid);
    const zoomLink = clean(body.zoomLink ?? body.zoomlink ?? baseRule?.zoomlink);
    const sessionDescription = normalizeSessionDescription(body.sessionDescription ?? body.sessiondescription);
    const status = normalizeGlobalSessionStatus(body.status || GLOBAL_SESSION_STATUS_SCHEDULED);
    if (![GLOBAL_SESSION_STATUS_SCHEDULED, GLOBAL_SESSION_STATUS_CANCELLED].includes(status)) {
      throw clientError("Derived exceptions must be SCHEDULED or CANCELLED", 400);
    }
    if (!baseRule && status === GLOBAL_SESSION_STATUS_CANCELLED) {
      throw clientError("A CANCELLED exception must be linked to a derived occurrence", 400);
    }
    if (!validateIsoDate(sessionDate) || !sessionWithinRun({ SessionDate: sessionDate }, run)) {
      throw clientError("Exception SessionDate must be within the selected Course", 400);
    }
    if (!validateTimeRange(startTime, endTime)) throw clientError("Exception requires a valid increasing HH:MM time range", 400);
    validateZoomLink(zoomLink);
    const module = resolveModule(tables, moduleId, subject.SubjectID, { requireActive: false });
    const teacher = optionalActiveTeacher(tables, teacherAccountId);
    const timestamp = new Date().toISOString();
    const record = {
      SessionID: createPlatformId("GTS"),
      RunID: clean(run.RunID),
      SubjectID: clean(subject.SubjectID),
      ModuleID: clean(module?.ModuleID),
      SessionDate: sessionDate,
      StartTime: startTime,
      EndTime: endTime,
      TeacherAccountID: clean(teacher?.AccountID),
      ZoomLink: zoomLink,
      SessionDescription: sessionDescription,
      Active: true,
      CreatedDate: timestamp,
      CreatedByAccountID: permission.user.accountid,
      CreatedByAccountName: permission.user.username,
      ModifiedByAccountID: "",
      ModifiedByAccountName: "",
      ModifiedDate: "",
      SessionKind: GLOBAL_SESSION_KIND_EXCEPTION,
      ScheduleRuleKey: scheduleRuleKey,
      OccurrenceDate: baseRule ? occurrenceDate : ""
    };
    const lifecycleMutation = buildCurrentLifecycleMutation(tables, record.SessionID, { status }, permission.user, timestamp, { force: status !== GLOBAL_SESSION_STATUS_SCHEDULED });
    const stagedTables = {
      ...tables,
      GlobalTimetableSessions: [...tables.GlobalTimetableSessions, record],
      GlobalTimetableSessionLifecycle: lifecycleMutation ? [...tables.GlobalTimetableSessionLifecycle, lifecycleMutation.record] : tables.GlobalTimetableSessionLifecycle
    };
    const validationStart = baseRule && occurrenceDate < sessionDate ? occurrenceDate : sessionDate;
    const validationEnd = baseRule && occurrenceDate > sessionDate ? occurrenceDate : sessionDate;
    const effective = buildDerivedSourceOccurrences(stagedTables, run, validationStart, validationEnd);
    validateEffectiveDerivedConflicts(effective);

    const writes = [
      valueWrite("GlobalTimetableSessions", nextRowNumber(tables.GlobalTimetableSessions), recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessions))
    ];
    if (lifecycleMutation) writes.push(lifecycleMutation.write);
    const stateMutation = buildDevelopmentStateMutation(tables, run.RunID, permission.user, timestamp);
    if (stateMutation) writes.push(stateMutation.write);
    const audits = [auditRow(permission.user, timestamp, "MATERIALIZE_GLOBAL_COURSE_EXCEPTION", "GLOBAL_TIMETABLE_SESSION", record.SessionID,
      ["RunID", "SessionKind", "ScheduleRuleKey", "OccurrenceDate", "SessionDate", "StartTime", "EndTime", "ModuleID", "TeacherAccountID", "ZoomLink", "SessionDescription", "Status"] )];
    if (lifecycleMutation) audits.push(lifecycleMutation.audit);
    if (stateMutation) audits.push(stateMutation.audit);
    writes.push(rangeWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), audits));
    await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });

    return json({
      success: true,
      message: baseRule ? "Derived occurrence exception created" : "One-off Course session created",
      session: enrichSession(mapGlobalTimetableSession(record, publishedSourceIdSet(tables.PublishedGlobalTimetableSessions)), tables),
      lifecycle: lifecycleMutation ? mapGlobalTimetableSessionLifecycle(lifecycleMutation.record) : resolveCurrentSessionLifecycle([], record.SessionID),
      calendarWarnings: noTeachingEventsOnDates(tables.AcademyCalendar, [sessionDate])
    });
  } catch (error) {
    return globalTimetableMutationError(error, env);
  }
}

async function savePlatformGlobalTimetableSessionEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const sessionId = clean(body.sessionId || body.sessionid);
    if (!sessionId) throw clientError("SessionID is required", 400);

    const tables = await readGlobalTimetableTables(env);
    const existing = uniqueRecord(tables.GlobalTimetableSessions, "SessionID", sessionId, "Global timetable session");
    const run = activeRun(tables, existing.RunID);
    requireEditableGlobalTimetable(tables, run.RunID);
    const subject = activeSubject(tables, run.SubjectID);
    const moduleId = clean(body.moduleId ?? body.moduleid ?? existing.ModuleID);
    const sessionDate = clean(body.sessionDate || body.sessiondate || existing.SessionDate);
    const startTime = normalizeSubmittedTime(body.startTime || body.starttime || existing.StartTime);
    const endTime = normalizeSubmittedTime(body.endTime || body.endtime || existing.EndTime);
    const teacherAccountId = clean(body.teacherAccountId ?? body.teacheraccountid ?? existing.TeacherAccountID);
    const zoomLink = clean(body.zoomLink ?? body.zoomlink ?? existing.ZoomLink);
    const sessionDescription = normalizeSessionDescription(body.sessionDescription ?? body.sessiondescription ?? existing.SessionDescription);
    const active = readBoolean(body.active, isActivePlatformValue(existing.Active));
    const existingLifecycle = resolveCurrentSessionLifecycle(tables.GlobalTimetableSessionLifecycle, existing.SessionID);
    const requestedStatus = normalizeGlobalSessionStatus(body.status || existingLifecycle.status);
    if (!GLOBAL_SESSION_STATUSES.includes(requestedStatus)) throw clientError("Session status is invalid", 400);
    if (existingLifecycle.status === GLOBAL_SESSION_STATUS_RESCHEDULED && requestedStatus !== GLOBAL_SESSION_STATUS_RESCHEDULED) {
      throw clientError("A rescheduled source session keeps its RESCHEDULED status; edit the linked replacement instead", 409);
    }

    if (!validateIsoDate(sessionDate) || !sessionWithinRun({ SessionDate: sessionDate }, run)) {
      throw clientError("SessionDate must be a valid date within the selected run", 400);
    }
    if (!validateTimeRange(startTime, endTime)) throw clientError("StartTime and EndTime require a valid increasing HH:MM range", 400);
    validateZoomLink(zoomLink);
    const module = resolveModule(tables, moduleId, subject.SubjectID, { requireActive: false });
    const teacher = optionalActiveTeacher(tables, teacherAccountId);

    if (active && requestedStatus === GLOBAL_SESSION_STATUS_SCHEDULED && hasActiveSlotConflict(tables.GlobalTimetableSessions, {
      runId: run.RunID,
      sessionDate,
      startTime,
      endTime,
      excludeSessionId: existing.SessionID
    }, tables.GlobalTimetableSessionLifecycle)) {
      throw clientError("This edit overlaps another scheduled session in the same course", 409);
    }

    const timestamp = new Date().toISOString();
    const record = {
      ...existing,
      ModuleID: module ? clean(module.ModuleID) : "",
      SessionDate: sessionDate,
      StartTime: startTime,
      EndTime: endTime,
      TeacherAccountID: clean(teacher?.AccountID),
      ZoomLink: zoomLink,
      SessionDescription: sessionDescription,
      Active: active,
      ModifiedByAccountID: permission.user.accountid,
      ModifiedByAccountName: permission.user.username,
      ModifiedDate: timestamp
    };
    const changedFields = changedRecordFields(existing, record, [
      "ModuleID", "SessionDate", "StartTime", "EndTime", "TeacherAccountID", "ZoomLink", "SessionDescription", "Active"
    ]);
    const lifecycleMutation = buildCurrentLifecycleMutation(tables, existing.SessionID, {
      status: requestedStatus,
      rescheduledFromSessionId: existingLifecycle.rescheduledfromsessionid,
      rescheduledToSessionId: existingLifecycle.rescheduledtosessionid
    }, permission.user, timestamp);

    if (normalizeCourseScheduleMode(run.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT) === COURSE_SCHEDULE_MODE_DERIVED) {
      const stagedSessions = tables.GlobalTimetableSessions.map(row => (
        normalizePlatformIdentifier(row.SessionID) === normalizePlatformIdentifier(existing.SessionID) ? { ...record } : { ...row }
      ));
      const stagedLifecycles = stageLifecycleMutation(tables.GlobalTimetableSessionLifecycle, lifecycleMutation);
      validateDerivedMutationConflicts({ ...tables, GlobalTimetableSessions: stagedSessions, GlobalTimetableSessionLifecycle: stagedLifecycles }, run, [
        existing.OccurrenceDate, existing.SessionDate, record.OccurrenceDate, record.SessionDate
      ]);
    }

    if (!changedFields.length && !lifecycleMutation) {
      return json({
        success: true,
        message: "No global timetable session changes requested",
        session: enrichSession(mapGlobalTimetableSession(existing, publishedSourceIdSet(tables.PublishedGlobalTimetableSessions)), tables),
        lifecycle: existingLifecycle
      });
    }

    await writeSessionUpdate(env, permission.user, tables, run, existing, record, changedFields, lifecycleMutation, timestamp);
    return json({
      success: true,
      message: requestedStatus === GLOBAL_SESSION_STATUS_CANCELLED ? "Session marked CANCELLED" : "Global timetable session updated",
      session: enrichSession(mapGlobalTimetableSession(record, publishedSourceIdSet(tables.PublishedGlobalTimetableSessions)), tables),
      lifecycle: lifecycleMutation ? mapGlobalTimetableSessionLifecycle(lifecycleMutation.record) : existingLifecycle
    });
  } catch (error) {
    return globalTimetableMutationError(error, env);
  }
}

async function savePlatformGlobalTimetableSessionBatchEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const runId = clean(body.runId || body.runid);
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (!runId) throw clientError("RunID is required", 400);
    if (changes.length > 100) throw clientError("Save no more than 100 session changes at once", 400);
    if (!changes.length) return json({ success: true, message: "No session changes requested", changed: 0, sessions: [], lifecycles: [], calendarWarnings: [] });

    const tables = await readGlobalTimetableTables(env);
    const run = activeRun(tables, runId);
    requireEditableGlobalTimetable(tables, run.RunID);
    const subject = activeSubject(tables, run.SubjectID);
    const timestamp = new Date().toISOString();
    const stagedSessions = tables.GlobalTimetableSessions.map(row => ({ ...row }));
    const stagedLifecycles = tables.GlobalTimetableSessionLifecycle.map(row => ({ ...row }));
    const seen = new Set();
    const mutations = [];
    let nextLifecycleRow = nextRowNumber(stagedLifecycles);

    for (const rawChange of changes) {
      const change = rawChange && typeof rawChange === "object" ? rawChange : {};
      const sessionId = clean(change.sessionId || change.sessionid);
      if (!sessionId) throw clientError("Every session change requires SessionID", 400);
      const sessionKey = normalizePlatformIdentifier(sessionId);
      if (seen.has(sessionKey)) throw clientError("The same session cannot be changed twice in one save", 400);
      seen.add(sessionKey);

      const existingIndex = stagedSessions.findIndex(row => normalizePlatformIdentifier(row.SessionID) === sessionKey);
      if (existingIndex < 0) throw clientError(`Session ${sessionId} was not found`, 404);
      const existing = stagedSessions[existingIndex];
      if (normalizePlatformIdentifier(existing.RunID) !== normalizePlatformIdentifier(run.RunID)) {
        throw clientError("Every session change must belong to the selected course", 409);
      }

      const existingLifecycle = resolveCurrentSessionLifecycle(stagedLifecycles, existing.SessionID);
      if (existingLifecycle.status === GLOBAL_SESSION_STATUS_RESCHEDULED) {
        throw clientError("A historical RESCHEDULED source session cannot be edited; edit its replacement session instead", 409);
      }
      const requestedStatus = normalizeGlobalSessionStatus(change.status || existingLifecycle.status);
      if (![GLOBAL_SESSION_STATUS_SCHEDULED, GLOBAL_SESSION_STATUS_CANCELLED].includes(requestedStatus)) {
        throw clientError("Session status must be SCHEDULED or CANCELLED", 400);
      }

      const moduleId = clean(change.moduleId ?? change.moduleid ?? existing.ModuleID);
      const sessionDate = clean(change.sessionDate ?? change.sessiondate ?? existing.SessionDate);
      const startTime = normalizeSubmittedTime(change.startTime ?? change.starttime ?? existing.StartTime);
      const endTime = normalizeSubmittedTime(change.endTime ?? change.endtime ?? existing.EndTime);
      const teacherAccountId = clean(change.teacherAccountId ?? change.teacheraccountid ?? existing.TeacherAccountID);
      const zoomLink = clean(change.zoomLink ?? change.zoomlink ?? existing.ZoomLink);
      const sessionDescription = normalizeSessionDescription(change.sessionDescription ?? change.sessiondescription ?? existing.SessionDescription);
      const active = readBoolean(change.active, isActivePlatformValue(existing.Active));

      if (!validateIsoDate(sessionDate) || !sessionWithinRun({ SessionDate: sessionDate }, run)) {
        throw clientError(`Session ${sessionId} date must be within the selected course`, 400);
      }
      if (!validateTimeRange(startTime, endTime)) throw clientError(`Session ${sessionId} requires a valid increasing HH:MM time range`, 400);
      validateZoomLink(zoomLink);
      const module = resolveModule(tables, moduleId, subject.SubjectID, { requireActive: false });
      const teacher = optionalActiveTeacher(tables, teacherAccountId);

      const record = {
        ...existing,
        ModuleID: module ? clean(module.ModuleID) : "",
        SessionDate: sessionDate,
        StartTime: startTime,
        EndTime: endTime,
        TeacherAccountID: clean(teacher?.AccountID),
        ZoomLink: zoomLink,
        SessionDescription: sessionDescription,
        Active: active,
        ModifiedByAccountID: permission.user.accountid,
        ModifiedByAccountName: permission.user.username,
        ModifiedDate: timestamp
      };
      const changedFields = changedRecordFields(existing, record, [
        "ModuleID", "SessionDate", "StartTime", "EndTime", "TeacherAccountID", "ZoomLink", "SessionDescription", "Active"
      ]);
      const stagedTables = { ...tables, GlobalTimetableSessionLifecycle: stagedLifecycles };
      const lifecycleMutation = buildCurrentLifecycleMutation(stagedTables, existing.SessionID, {
        status: requestedStatus,
        rescheduledFromSessionId: existingLifecycle.rescheduledfromsessionid,
        rescheduledToSessionId: existingLifecycle.rescheduledtosessionid
      }, permission.user, timestamp);

      if (!changedFields.length && !lifecycleMutation) continue;
      stagedSessions[existingIndex] = record;

      let lifecycleRowNumber = 0;
      if (lifecycleMutation) {
        lifecycleRowNumber = lifecycleMutation.existingRowNumber || nextLifecycleRow++;
        const stagedLifecycleRecord = { ...lifecycleMutation.record, _rowNumber: lifecycleRowNumber };
        const lifecycleIndex = stagedLifecycles.findIndex(row => Number(row._rowNumber) === Number(lifecycleRowNumber));
        if (lifecycleIndex >= 0) stagedLifecycles[lifecycleIndex] = stagedLifecycleRecord;
        else stagedLifecycles.push(stagedLifecycleRecord);
      }
      mutations.push({ existing, record, changedFields, lifecycleMutation, lifecycleRowNumber });
    }

    if (!mutations.length) {
      return json({ success: true, message: "No session changes requested", changed: 0, sessions: [], lifecycles: [], calendarWarnings: [] });
    }

    // Validate conflicts against the complete proposed timetable, not change-by-change.
    // This allows safe swaps/moves that would fail if each row were written separately.
    for (const mutation of mutations) {
      const lifecycle = resolveCurrentSessionLifecycle(stagedLifecycles, mutation.record.SessionID);
      if (!isActivePlatformValue(mutation.record.Active) || lifecycle.status !== GLOBAL_SESSION_STATUS_SCHEDULED) continue;
      if (hasActiveSlotConflict(stagedSessions, {
        runId: run.RunID,
        sessionDate: clean(mutation.record.SessionDate),
        startTime: normalizeSubmittedTime(mutation.record.StartTime),
        endTime: normalizeSubmittedTime(mutation.record.EndTime),
        excludeSessionId: mutation.record.SessionID
      }, stagedLifecycles)) {
        throw clientError(`Session ${mutation.record.SessionID} overlaps another scheduled session in this course`, 409);
      }
    }

    if (normalizeCourseScheduleMode(run.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT) === COURSE_SCHEDULE_MODE_DERIVED) {
      validateDerivedMutationConflicts({ ...tables, GlobalTimetableSessions: stagedSessions, GlobalTimetableSessionLifecycle: stagedLifecycles }, run,
        mutations.flatMap(mutation => [
          mutation.existing.OccurrenceDate, mutation.existing.SessionDate,
          mutation.record.OccurrenceDate, mutation.record.SessionDate
        ])
      );
    }

    const writes = [];
    const audits = [];
    for (const mutation of mutations) {
      if (mutation.changedFields.length) {
        writes.push(valueWrite("GlobalTimetableSessions", mutation.existing._rowNumber, recordToRow(mutation.record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessions)));
        audits.push(auditRow(permission.user, timestamp, "UPDATE_GLOBAL_TIMETABLE_SESSION", "GLOBAL_TIMETABLE_SESSION", mutation.record.SessionID, mutation.changedFields));
      }
      if (mutation.lifecycleMutation) {
        writes.push(valueWrite(
          "GlobalTimetableSessionLifecycle",
          mutation.lifecycleRowNumber,
          recordToRow(mutation.lifecycleMutation.record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessionLifecycle)
        ));
        audits.push(mutation.lifecycleMutation.audit);
      }
    }
    const stateMutation = buildDevelopmentStateMutation(tables, run.RunID, permission.user, timestamp);
    if (stateMutation) {
      writes.push(stateMutation.write);
      audits.push(stateMutation.audit);
    }
    if (audits.length) writes.push(rangeWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), audits));

    // All validation above completes before this single Google Sheets batch write.
    await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
    const publishedSourceIds = publishedSourceIdSet(tables.PublishedGlobalTimetableSessions);
    const savedSessions = mutations.map(mutation => enrichSession(mapGlobalTimetableSession(mutation.record, publishedSourceIds), tables));
    const savedLifecycles = mutations.map(mutation => resolveCurrentSessionLifecycle(stagedLifecycles, mutation.record.SessionID));
    const warningDates = mutations
      .filter(mutation => resolveCurrentSessionLifecycle(stagedLifecycles, mutation.record.SessionID).status === GLOBAL_SESSION_STATUS_SCHEDULED)
      .map(mutation => clean(mutation.record.SessionDate));
    const calendarWarnings = noTeachingEventsOnDates(tables.AcademyCalendar, warningDates);

    return json({
      success: true,
      message: `${mutations.length} session change${mutations.length === 1 ? "" : "s"} saved`,
      changed: mutations.length,
      sessions: savedSessions,
      lifecycles: savedLifecycles,
      calendarWarnings
    });
  } catch (error) {
    return globalTimetableMutationError(error, env);
  }
}

async function revisePlatformGlobalTimetableEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;
  try {
    const body = await request.json();
    const runId = clean(body.runId || body.runid);
    if (!runId) throw clientError("RunID is required", 400);
    const tables = await readGlobalTimetableTables(env);
    const run = activeRun(tables, runId);
    const matches = tables.GlobalTimetableRunState.filter(row => normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(run.RunID));
    if (matches.length !== 1) throw clientError("Published course requires exactly one timetable state row", 409);
    const state = mapGlobalTimetableRunState(matches[0]);
    if (state.stage !== GLOBAL_TIMETABLE_PUBLISHED_STAGE || !state.currentpublicationid) {
      return json({ success: true, message: "Course timetable is already in DEVELOPMENT", state });
    }
    const timestamp = new Date().toISOString();
    const mutation = buildDevelopmentStateMutation(tables, run.RunID, permission.user, timestamp);
    if (!mutation) return json({ success: true, message: "Course timetable is already in DEVELOPMENT", state });
    await batchUpdateGoogleSheetValues(env, [
      mutation.write,
      valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), mutation.audit)
    ], { spreadsheetId: getPlatformSpreadsheetId(env) });
    return json({
      success: true,
      message: "Revision opened. Published timetable remains unchanged until you publish the revision.",
      state: { runid: clean(run.RunID), stage: GLOBAL_TIMETABLE_DEVELOPMENT_STAGE, currentpublicationid: state.currentpublicationid }
    });
  } catch (error) {
    return globalTimetableMutationError(error, env);
  }
}

async function reschedulePlatformGlobalTimetableSessionEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;
  try {
    const body = await request.json();
    const sourceSessionId = clean(body.sessionId || body.sessionid || body.sourceSessionId);
    if (!sourceSessionId) throw clientError("SessionID is required", 400);
    const tables = await readGlobalTimetableTables(env);
    const source = uniqueRecord(tables.GlobalTimetableSessions, "SessionID", sourceSessionId, "Global timetable session");
    if (normalizeGlobalSessionKind(source.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXCEPTION) {
      throw clientError("Derived Course exceptions are moved by editing the materialised exception, not by creating a rescheduled replacement", 409);
    }
    const sourceLifecycle = resolveCurrentSessionLifecycle(tables.GlobalTimetableSessionLifecycle, source.SessionID);
    if (sourceLifecycle.status === GLOBAL_SESSION_STATUS_RESCHEDULED || sourceLifecycle.rescheduledtosessionid) {
      throw clientError("This session is already rescheduled", 409);
    }
    const run = activeRun(tables, source.RunID);
    requireEditableGlobalTimetable(tables, run.RunID);
    const subject = activeSubject(tables, run.SubjectID);
    const sessionDate = clean(body.sessionDate || body.sessiondate);
    const startTime = normalizeSubmittedTime(body.startTime || body.starttime);
    const endTime = normalizeSubmittedTime(body.endTime || body.endtime);
    const moduleId = clean(body.moduleId ?? body.moduleid ?? source.ModuleID);
    const teacherAccountId = clean(body.teacherAccountId ?? body.teacheraccountid ?? source.TeacherAccountID);
    const zoomLink = clean(body.zoomLink ?? body.zoomlink ?? source.ZoomLink);
    const sessionDescription = normalizeSessionDescription(body.sessionDescription ?? body.sessiondescription ?? source.SessionDescription);
    if (!validateIsoDate(sessionDate) || !sessionWithinRun({ SessionDate: sessionDate }, run)) {
      throw clientError("Replacement date must be within the course dates", 400);
    }
    if (!validateTimeRange(startTime, endTime)) throw clientError("Replacement time requires a valid increasing HH:MM range", 400);
    validateZoomLink(zoomLink);
    const module = resolveModule(tables, moduleId, subject.SubjectID, { requireActive: false });
    const teacher = optionalActiveTeacher(tables, teacherAccountId);
    if (hasActiveSlotConflict(tables.GlobalTimetableSessions, {
      runId: run.RunID, sessionDate, startTime, endTime, excludeSessionId: source.SessionID
    }, tables.GlobalTimetableSessionLifecycle)) {
      throw clientError("Replacement overlaps another scheduled session in the same course", 409);
    }
    const timestamp = new Date().toISOString();
    const replacement = {
      SessionID: createPlatformId("GTS"), RunID: clean(run.RunID), SubjectID: clean(subject.SubjectID),
      ModuleID: module ? clean(module.ModuleID) : "", SessionDate: sessionDate, StartTime: startTime, EndTime: endTime,
      TeacherAccountID: clean(teacher?.AccountID), ZoomLink: zoomLink, SessionDescription: sessionDescription, Active: true,
      CreatedDate: timestamp, CreatedByAccountID: permission.user.accountid, CreatedByAccountName: permission.user.username,
      ModifiedByAccountID: "", ModifiedByAccountName: "", ModifiedDate: "",
      SessionKind: normalizeGlobalSessionKind(source.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT),
      ScheduleRuleKey: normalizeGlobalSessionKind(source.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXCEPTION ? clean(source.ScheduleRuleKey) : "",
      OccurrenceDate: normalizeGlobalSessionKind(source.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXCEPTION ? clean(source.OccurrenceDate) : ""
    };
    const sourceLifecycleMutation = buildCurrentLifecycleMutation(tables, source.SessionID, {
      status: GLOBAL_SESSION_STATUS_RESCHEDULED,
      rescheduledFromSessionId: sourceLifecycle.rescheduledfromsessionid,
      rescheduledToSessionId: replacement.SessionID
    }, permission.user, timestamp, { force: true });
    const replacementLifecycleMutation = buildCurrentLifecycleMutation(tables, replacement.SessionID, {
      status: GLOBAL_SESSION_STATUS_SCHEDULED,
      rescheduledFromSessionId: source.SessionID,
      rescheduledToSessionId: ""
    }, permission.user, timestamp, { force: true });
    await writeRescheduledSession(env, permission.user, tables, run, source, replacement, sourceLifecycleMutation, replacementLifecycleMutation, timestamp);
    return json({
      success: true,
      message: "Session rescheduled. Publish the revision to make the change current for students.",
      sourceLifecycle: mapGlobalTimetableSessionLifecycle(sourceLifecycleMutation.record),
      replacement: enrichSession(mapGlobalTimetableSession(replacement, publishedSourceIdSet(tables.PublishedGlobalTimetableSessions)), tables),
      replacementLifecycle: mapGlobalTimetableSessionLifecycle(replacementLifecycleMutation.record)
    });
  } catch (error) {
    return globalTimetableMutationError(error, env);
  }
}

async function publishPlatformGlobalTimetableEndpoint(request, env) {
  const permission = await requireGlobalTimetableAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const runId = clean(body.runId || body.runid);
    const requestedPublishStart = clean(body.publishStartDate || body.publishstartdate);
    const requestedPublishEnd = clean(body.publishEndDate || body.publishenddate);
    if (!runId) throw clientError("RunID is required", 400);

    const tables = await readGlobalTimetableTables(env);
    const run = activeRun(tables, runId);
    const subject = activeSubject(tables, run.SubjectID);
    const scheduleMode = normalizeCourseScheduleMode(run.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT);
    const ongoing = !clean(run.StartDate) && !clean(run.EndDate);
    let publishStartDate = clean(run.StartDate);
    let publishEndDate = clean(run.EndDate);
    if (ongoing) {
      const stateMatches = tables.GlobalTimetableRunState.filter(row => normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(run.RunID));
      if (stateMatches.length !== 1) throw clientError("ONGOING Course requires exactly one saved timetable draft state before publication", 409);
      publishStartDate = clean(stateMatches[0].DraftPublishStartDate);
      publishEndDate = clean(stateMatches[0].DraftPublishEndDate);
      if (!validateIsoDate(publishStartDate) || !validateIsoDate(publishEndDate) || publishEndDate < publishStartDate) {
        throw clientError("Ongoing Course publication requires a saved Publish From and Publish Through window", 409);
      }
      if ((requestedPublishStart && requestedPublishStart !== publishStartDate) || (requestedPublishEnd && requestedPublishEnd !== publishEndDate)) {
        throw clientError("Save the ONGOING Course publication window before publishing", 409);
      }
    } else if (!validateIsoDate(publishStartDate) || !validateIsoDate(publishEndDate) || publishEndDate < publishStartDate) {
      throw clientError("FIXED Course publication requires valid Course Start and End dates", 409);
    }

    let sessions = [];
    let sourceSessionsForSnapshot = [];
    let sessionLifecycles = new Map();
    let scheduleDefinitionSnapshot = "[]";

    if (scheduleMode === COURSE_SCHEDULE_MODE_DERIVED) {
      const rules = parseRunScheduleRules(run);
      if (!rules.length) throw clientError("A DERIVED Course requires at least one recurring schedule rule before publication", 409);
      validateDerivedExceptionWindow(tables, run, publishStartDate, publishEndDate);
      const effective = buildDerivedSourceOccurrences(tables, run, publishStartDate, publishEndDate);
      validateEffectiveDerivedPublication(tables, run, subject, effective);
      sessions = effective.map(item => item.session);
      sessionLifecycles = new Map(effective.map(item => [normalizePlatformIdentifier(item.session.SessionID), item.lifecycle]));
      sourceSessionsForSnapshot = derivedExceptionRowsForPublication(tables, run, publishStartDate, publishEndDate);
      scheduleDefinitionSnapshot = buildPublishedScheduleDefinition(tables, run, subject, rules);
    } else {
      const allActiveSessions = activeGlobalTimetableSessionsForRun(tables.GlobalTimetableSessions, run.RunID)
        .filter(session => normalizeGlobalSessionKind(session.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXPLICIT);
      sessions = allActiveSessions.filter(session => (
        clean(session.SessionDate) >= publishStartDate && clean(session.SessionDate) <= publishEndDate && sessionWithinRun(session, run)
      ));
      if (!sessions.length) throw clientError("Publish requires at least one active explicit session in the selected Course publication window", 409);
      sessionLifecycles = validateSessionsForPublication(tables, run, subject, sessions);
      sourceSessionsForSnapshot = sessions;
    }
    if (!sessions.length) throw clientError("Publish requires at least one Course occurrence in the selected publication window", 409);

    const timestamp = new Date().toISOString();
    const versionNo = Math.max(0, ...tables.GlobalTimetablePublications
      .filter(row => normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(run.RunID))
      .map(row => Number(row.VersionNo) || 0)) + 1;
    const publicationId = createPlatformId("GTPUB");
    const publication = {
      PublicationID: publicationId,
      RunID: clean(run.RunID),
      SubjectID: clean(subject.SubjectID),
      VersionNo: versionNo,
      PublishedDate: timestamp,
      PublishedByAccountID: permission.user.accountid,
      PublishedByAccountName: permission.user.username,
      SessionCount: sessions.length,
      ScheduleMode: scheduleMode,
      PublishStartDate: publishStartDate,
      PublishEndDate: publishEndDate,
      ScheduleDefinition: scheduleDefinitionSnapshot,
      RunName: clean(run.RunName),
      SubjectName: clean(subject.SubjectName),
      Timezone: clean(run.Timezone)
    };
    const { snapshots, lifecycleSnapshots } = buildSnapshotRows(
      tables, publication, run, subject, sourceSessionsForSnapshot, sessionLifecycles, permission.user, timestamp
    );

    await writePublication(env, permission.user, tables, run, publication, snapshots, lifecycleSnapshots, timestamp);
    return json({
      success: true,
      message: `${scheduleMode === COURSE_SCHEDULE_MODE_DERIVED ? "Derived" : "Explicit"} Course publication ${versionNo} created (${sessions.length} occurrence${sessions.length === 1 ? "" : "s"})`,
      publication: mapGlobalTimetablePublication(publication),
      sessions: scheduleMode === COURSE_SCHEDULE_MODE_EXPLICIT ? snapshots.map(mapPublishedGlobalTimetableSession) : [],
      exceptionSnapshots: scheduleMode === COURSE_SCHEDULE_MODE_DERIVED ? snapshots.map(mapPublishedGlobalTimetableSession) : [],
      globalTimetableVersion: readGlobalTimetableVersion(tables.PlatformConfig).value + 1
    });
  } catch (error) {
    return globalTimetableMutationError(error, env);
  }
}

async function requireGlobalTimetableAdmin(request, env) {
  if (request.method !== "POST") {
    return { ok: false, response: json({ success: false, error: "Method not allowed" }, 405) };
  }
  const user = await getAuthUser(request, env);
  if (!user) return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  const authority = normalizePlatformIdentifier(user.role);
  if (user.type !== "account" || !["ADMIN", "GLOBAL_ADMIN"].includes(authority)) {
    return { ok: false, response: json({ success: false, error: "ADMIN or GLOBAL_ADMIN authority is required" }, 403) };
  }
  return {
    ok: true,
    user: {
      accountid: clean(user.accountid),
      username: clean(user.username || "Global Admin"),
      role: authority,
      courseid: clean(user.courseid)
    }
  };
}

async function readGlobalTimetableTables(env) {
  const names = [
    "GlobalSubjectList",
    "GlobalModuleList",
    "GlobalSubjectRuns",
    "UserAccounts",
    "GlobalTimetableSessions",
    "GlobalTimetableRunState",
    "GlobalTimetablePublications",
    "PublishedGlobalTimetableSessions",
    "GlobalTimetableSessionLifecycle",
    "AcademyCalendar",
    "PlatformConfig",
    "PlatformAuditLog"
  ];
  const entries = await Promise.all(names.map(async name => [name, await readPlatformSheet(env, name)]));
  const tables = Object.fromEntries(entries);
  requireGlobalTimetableSchema(tables.PlatformConfig);
  return tables;
}

function requireGlobalTimetableSchema(configRows) {
  const matches = (configRows || []).filter(row => (
    normalizePlatformIdentifier(row.ConfigKey) === "PLATFORMSCHEMAVERSION"
  ));
  const version = clean(matches[0]?.ConfigValue);
  if (matches.length !== 1 || !TIMETABLE_SCHEMA_VERSIONS.has(version)) {
    throw new Error("Global timetable requires PlatformSchemaVersion 102.0.7, 102.0.8, 102.0.9, 102.0.10, 102.0.11 or 102.0.12");
  }
}

async function writeGeneratedSessions(env, user, tables, run, records, timestamp) {
  const writes = [];
  const firstRow = nextRowNumber(tables.GlobalTimetableSessions);
  if (records.length) {
    writes.push(rangeWrite("GlobalTimetableSessions", firstRow, records.map(record => recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessions))));
  }
  const stateMutation = buildDevelopmentStateMutation(tables, run.RunID, user, timestamp);
  if (stateMutation) writes.push(stateMutation.write);

  const auditRows = records.map(record => auditRow(user, timestamp, "GENERATE_GLOBAL_TIMETABLE_SESSION", "GLOBAL_TIMETABLE_SESSION", record.SessionID,
    ["RunID", "SubjectID", "ModuleID", "SessionDate", "StartTime", "EndTime", "TeacherAccountID", "ZoomLink", "SessionDescription", "Active"]));
  if (stateMutation) auditRows.push(stateMutation.audit);
  if (auditRows.length) writes.push(rangeWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), auditRows));
  await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
}

async function writeSessionUpdate(env, user, tables, run, existing, record, changedFields, lifecycleMutation, timestamp) {
  const writes = [
    valueWrite("GlobalTimetableSessions", existing._rowNumber, recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessions))
  ];
  if (lifecycleMutation) writes.push(lifecycleMutation.write);
  const stateMutation = buildDevelopmentStateMutation(tables, run.RunID, user, timestamp);
  if (stateMutation) writes.push(stateMutation.write);
  const audits = [];
  if (changedFields.length) {
    audits.push(auditRow(user, timestamp, "UPDATE_GLOBAL_TIMETABLE_SESSION", "GLOBAL_TIMETABLE_SESSION", record.SessionID, changedFields));
  }
  if (lifecycleMutation) audits.push(lifecycleMutation.audit);
  if (stateMutation) audits.push(stateMutation.audit);
  if (audits.length) writes.push(rangeWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), audits));
  await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
}

async function writeRescheduledSession(env, user, tables, run, source, replacement, sourceLifecycleMutation, replacementLifecycleMutation, timestamp) {
  const stateMutation = buildDevelopmentStateMutation(tables, run.RunID, user, timestamp);
  let nextLifecycleRow = nextRowNumber(tables.GlobalTimetableSessionLifecycle);
  const lifecycleWrite = mutation => {
    const rowNumber = mutation.existingRowNumber || nextLifecycleRow++;
    return valueWrite("GlobalTimetableSessionLifecycle", rowNumber,
      recordToRow(mutation.record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessionLifecycle));
  };
  const writes = [
    valueWrite("GlobalTimetableSessions", nextRowNumber(tables.GlobalTimetableSessions), recordToRow(replacement, PLATFORM_SHEET_HEADERS.GlobalTimetableSessions)),
    lifecycleWrite(sourceLifecycleMutation),
    lifecycleWrite(replacementLifecycleMutation)
  ];
  if (stateMutation) writes.push(stateMutation.write);
  const audits = [
    auditRow(user, timestamp, "RESCHEDULE_GLOBAL_TIMETABLE_SESSION", "GLOBAL_TIMETABLE_SESSION", source.SessionID,
      ["Status", "RescheduledToSessionID"]),
    auditRow(user, timestamp, "CREATE_RESCHEDULED_GLOBAL_TIMETABLE_SESSION", "GLOBAL_TIMETABLE_SESSION", replacement.SessionID,
      ["RunID", "SubjectID", "ModuleID", "SessionDate", "StartTime", "EndTime", "TeacherAccountID", "ZoomLink", "SessionDescription", "Active", "RescheduledFromSessionID"])
  ];
  if (stateMutation) audits.push(stateMutation.audit);
  writes.push(rangeWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), audits));
  await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
}

async function writePublication(env, user, tables, run, publication, snapshots, lifecycleSnapshots, timestamp) {
  const version = readGlobalTimetableVersion(tables.PlatformConfig);
  const nextVersion = version.value + 1;
  const stateWrite = buildPublishedStateWrite(tables, run.RunID, publication.PublicationID, user, timestamp);
  const writes = [
    valueWrite("GlobalTimetablePublications", nextRowNumber(tables.GlobalTimetablePublications), recordToRow(publication, PLATFORM_SHEET_HEADERS.GlobalTimetablePublications))
  ];
  if (snapshots.length) {
    writes.push(rangeWrite("PublishedGlobalTimetableSessions", nextRowNumber(tables.PublishedGlobalTimetableSessions), snapshots.map(record => recordToRow(record, PLATFORM_SHEET_HEADERS.PublishedGlobalTimetableSessions))));
  }
  if (lifecycleSnapshots.length) {
    writes.push(rangeWrite("GlobalTimetableSessionLifecycle", nextRowNumber(tables.GlobalTimetableSessionLifecycle), lifecycleSnapshots.map(record => recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessionLifecycle))));
  }
  writes.push(
    stateWrite.write,
    {
      range: `'PlatformConfig'!B${version.rowNumber}:E${version.rowNumber}`,
      majorDimension: "ROWS",
      values: [[nextVersion, timestamp, user.accountid, user.username]]
    },
    valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), auditRow(
      user, timestamp, "PUBLISH_GLOBAL_TIMETABLE", "GLOBAL_TIMETABLE_PUBLICATION", publication.PublicationID,
      ["RunID", "SubjectID", "VersionNo", "PublishedDate", "SessionCount", "ScheduleMode", "PublishStartDate", "PublishEndDate", "ScheduleDefinition"]
    ))
  );
  await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
}

function buildSnapshotRows(tables, publication, run, subject, sessions, sessionLifecycles, user, timestamp) {
  const snapshots = [];
  const lifecycleSnapshots = [];
  for (const session of [...sessions].sort((a, b) => `${clean(a.SessionDate)} ${clean(a.StartTime)}`.localeCompare(`${clean(b.SessionDate)} ${clean(b.StartTime)}`))) {
    const module = resolveModule(tables, session.ModuleID, subject.SubjectID, { requireActive: false });
    const lifecycle = sessionLifecycles.get(normalizePlatformIdentifier(session.SessionID)) || resolveCurrentSessionLifecycle(tables.GlobalTimetableSessionLifecycle, session.SessionID);
    const teacher = optionalActiveTeacher(tables, session.TeacherAccountID);
    snapshots.push({
      PublishedSessionID: createPlatformId("GTPSESSION"),
      PublicationID: publication.PublicationID,
      SourceSessionID: clean(session.SessionID),
      RunID: clean(run.RunID),
      SubjectID: clean(subject.SubjectID),
      ModuleID: module ? clean(module.ModuleID) : "",
      SessionDate: clean(session.SessionDate),
      StartTime: normalizeSubmittedTime(session.StartTime),
      EndTime: normalizeSubmittedTime(session.EndTime),
      TeacherAccountID: clean(teacher?.AccountID),
      ZoomLink: clean(session.ZoomLink),
      PublishedDate: timestamp,
      PublishedByAccountID: user.accountid,
      PublishedByAccountName: user.username,
      RunName: clean(run.RunName),
      SubjectName: clean(subject.SubjectName),
      ModuleName: module ? clean(module.ModuleName) : "",
      TeacherName: clean(teacher?.DisplayName) || "TBA",
      Timezone: clean(run.Timezone),
      SessionKind: normalizeGlobalSessionKind(session.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT),
      ScheduleRuleKey: clean(session.ScheduleRuleKey),
      OccurrenceDate: clean(session.OccurrenceDate),
      SessionDescription: clean(session.SessionDescription)
    });
    lifecycleSnapshots.push({
      SessionLifecycleID: createPlatformId("GTLIFE"),
      SessionID: clean(session.SessionID),
      PublicationID: publication.PublicationID,
      Status: normalizeGlobalSessionStatus(lifecycle.status),
      RescheduledFromSessionID: clean(lifecycle.rescheduledfromsessionid),
      RescheduledToSessionID: clean(lifecycle.rescheduledtosessionid),
      CreatedDate: timestamp,
      CreatedByAccountID: user.accountid,
      CreatedByAccountName: user.username,
      ModifiedByAccountID: "",
      ModifiedByAccountName: "",
      ModifiedDate: ""
    });
  }
  return { snapshots, lifecycleSnapshots };
}

function requireEditableGlobalTimetable(tables, runId) {
  const matches = tables.GlobalTimetableRunState.filter(row => (
    normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(runId)
  ));
  if (matches.length > 1) throw clientError("Global timetable run has duplicate state rows", 409);
  if (!matches.length) return;
  const stage = normalizePlatformIdentifier(matches[0].Stage);
  if (stage === GLOBAL_TIMETABLE_PUBLISHED_STAGE) {
    throw clientError("Revise timetable before modifying a published course", 409);
  }
  if (stage && stage !== GLOBAL_TIMETABLE_DEVELOPMENT_STAGE) {
    throw clientError("Global timetable run has an invalid stage", 409);
  }
}

function buildDevelopmentStateMutation(tables, runId, user, timestamp) {
  const matches = tables.GlobalTimetableRunState.filter(row => (
    normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(runId)
  ));
  if (matches.length > 1) throw clientError("Global timetable run has duplicate state rows", 409);
  const existing = matches[0] || null;
  if (existing && normalizePlatformIdentifier(existing.Stage) === GLOBAL_TIMETABLE_DEVELOPMENT_STAGE) return null;
  const record = existing ? {
    ...existing,
    Stage: GLOBAL_TIMETABLE_DEVELOPMENT_STAGE,
    CurrentPublicationID: clean(existing.CurrentPublicationID),
    ModifiedByAccountID: user.accountid,
    ModifiedByAccountName: user.username,
    ModifiedDate: timestamp
  } : {
    RunID: clean(runId),
    Stage: GLOBAL_TIMETABLE_DEVELOPMENT_STAGE,
    CurrentPublicationID: "",
    DraftPublishStartDate: "",
    DraftPublishEndDate: "",
    CreatedDate: timestamp,
    CreatedByAccountID: user.accountid,
    CreatedByAccountName: user.username,
    ModifiedByAccountID: "",
    ModifiedByAccountName: "",
    ModifiedDate: ""
  };
  const action = existing ? "UPDATE_GLOBAL_TIMETABLE_STATE" : "CREATE_GLOBAL_TIMETABLE_STATE";
  return {
    write: valueWrite("GlobalTimetableRunState", existing?._rowNumber || nextRowNumber(tables.GlobalTimetableRunState), recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableRunState)),
    audit: auditRow(user, timestamp, action, "GLOBAL_TIMETABLE_RUN_STATE", clean(runId), ["Stage", "CurrentPublicationID"])
  };
}

function buildPublishedStateWrite(tables, runId, publicationId, user, timestamp) {
  const matches = tables.GlobalTimetableRunState.filter(row => (
    normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(runId)
  ));
  if (matches.length > 1) throw clientError("Global timetable run has duplicate state rows", 409);
  const existing = matches[0] || null;
  const record = existing ? {
    ...existing,
    Stage: GLOBAL_TIMETABLE_PUBLISHED_STAGE,
    CurrentPublicationID: publicationId,
    ModifiedByAccountID: user.accountid,
    ModifiedByAccountName: user.username,
    ModifiedDate: timestamp
  } : {
    RunID: clean(runId),
    Stage: GLOBAL_TIMETABLE_PUBLISHED_STAGE,
    CurrentPublicationID: publicationId,
    CreatedDate: timestamp,
    CreatedByAccountID: user.accountid,
    CreatedByAccountName: user.username,
    ModifiedByAccountID: "",
    ModifiedByAccountName: "",
    ModifiedDate: ""
  };
  return {
    write: valueWrite("GlobalTimetableRunState", existing?._rowNumber || nextRowNumber(tables.GlobalTimetableRunState), recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableRunState)),
    record
  };
}

function parseRunScheduleRules(run) {
  let rules;
  try {
    rules = parseCourseScheduleDefinition(run.ScheduleDefinition || "[]");
    validateCourseScheduleRuleConflicts(rules);
  } catch (error) {
    throw clientError(clean(error?.message) || "Course recurring schedule definition is invalid", 409);
  }
  return rules;
}

function buildDerivedSourceOccurrences(tables, run, startDate, endDate) {
  const rules = parseRunScheduleRules(run);
  const subjectId = clean(run.SubjectID);
  const runId = clean(run.RunID);
  const base = deriveCourseScheduleOccurrences(rules, startDate, endDate, { runid: runId, subjectid: subjectId });
  const exceptions = activeGlobalTimetableSessionsForRun(tables.GlobalTimetableSessions, runId)
    .filter(row => normalizeGlobalSessionKind(row.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXCEPTION);

  const anchored = new Map();
  const extras = [];
  for (const exception of exceptions) {
    const anchor = derivedOccurrenceAnchor(exception.ScheduleRuleKey, exception.OccurrenceDate);
    if (anchor) {
      if (anchored.has(anchor)) throw clientError("A derived Course contains duplicate exceptions for one occurrence", 409);
      anchored.set(anchor, exception);
    } else {
      extras.push(exception);
    }
  }

  const output = [];
  const addedExact = new Set();
  for (const occurrence of base) {
    const anchor = derivedOccurrenceAnchor(occurrence.schedulerulekey, occurrence.occurrencedate);
    const exception = anchored.get(anchor);
    if (exception) {
      if (clean(exception.SessionDate) >= startDate && clean(exception.SessionDate) <= endDate) {
        const lifecycle = resolveCurrentSessionLifecycle(tables.GlobalTimetableSessionLifecycle, exception.SessionID);
        output.push({ session: exception, lifecycle });
        addedExact.add(normalizePlatformIdentifier(exception.SessionID));
      }
      continue;
    }
    const raw = derivedOccurrenceRaw(occurrence);
    output.push({ session: raw, lifecycle: resolveCurrentSessionLifecycle([], raw.SessionID) });
  }

  for (const exception of [...extras, ...anchored.values()]) {
    const key = normalizePlatformIdentifier(exception.SessionID);
    if (addedExact.has(key)) continue;
    if (clean(exception.SessionDate) < startDate || clean(exception.SessionDate) > endDate) continue;
    output.push({ session: exception, lifecycle: resolveCurrentSessionLifecycle(tables.GlobalTimetableSessionLifecycle, exception.SessionID) });
    addedExact.add(key);
  }
  return output.sort((a, b) => `${clean(a.session.SessionDate)} ${normalizeSubmittedTime(a.session.StartTime)} ${clean(a.session.SessionID)}`
    .localeCompare(`${clean(b.session.SessionDate)} ${normalizeSubmittedTime(b.session.StartTime)} ${clean(b.session.SessionID)}`));
}

function derivedOccurrenceRaw(occurrence) {
  return {
    SessionID: clean(occurrence.sessionid),
    RunID: clean(occurrence.runid),
    SubjectID: clean(occurrence.subjectid),
    ModuleID: clean(occurrence.moduleid),
    SessionDate: clean(occurrence.sessiondate),
    StartTime: normalizeSubmittedTime(occurrence.starttime),
    EndTime: normalizeSubmittedTime(occurrence.endtime),
    TeacherAccountID: clean(occurrence.teacheraccountid),
    ZoomLink: clean(occurrence.zoomlink),
    Active: true,
    CreatedDate: "",
    CreatedByAccountID: "",
    CreatedByAccountName: "",
    ModifiedByAccountID: "",
    ModifiedByAccountName: "",
    ModifiedDate: "",
    SessionKind: "DERIVED",
    ScheduleRuleKey: clean(occurrence.schedulerulekey),
    OccurrenceDate: clean(occurrence.occurrencedate)
  };
}

function stageLifecycleMutation(rows, mutation) {
  const staged = (rows || []).map(row => ({ ...row }));
  if (!mutation) return staged;
  const rowNumber = mutation.existingRowNumber || nextRowNumber(staged);
  const record = { ...mutation.record, _rowNumber: rowNumber };
  const index = staged.findIndex(row => Number(row._rowNumber) === Number(rowNumber));
  if (index >= 0) staged[index] = record;
  else staged.push(record);
  return staged;
}

function validateDerivedMutationConflicts(tables, run, dates) {
  const validDates = [...new Set((dates || []).map(clean).filter(validateIsoDate))].sort();
  if (!validDates.length) return true;
  const effective = buildDerivedSourceOccurrences(tables, run, validDates[0], validDates[validDates.length - 1]);
  return validateEffectiveDerivedConflicts(effective);
}

function validateEffectiveDerivedConflicts(effective) {
  const scheduled = effective.filter(item => normalizeGlobalSessionStatus(item.lifecycle?.status) === GLOBAL_SESSION_STATUS_SCHEDULED);
  for (let leftIndex = 0; leftIndex < scheduled.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < scheduled.length; rightIndex += 1) {
      const left = scheduled[leftIndex].session;
      const right = scheduled[rightIndex].session;
      if (clean(left.SessionDate) !== clean(right.SessionDate)) continue;
      const leftStart = normalizeSubmittedTime(left.StartTime);
      const leftEnd = normalizeSubmittedTime(left.EndTime);
      const rightStart = normalizeSubmittedTime(right.StartTime);
      const rightEnd = normalizeSubmittedTime(right.EndTime);
      if (leftStart < rightEnd && rightStart < leftEnd) {
        throw clientError(`Derived Course sessions overlap on ${clean(left.SessionDate)}`, 409);
      }
    }
  }
  return true;
}

function validateEffectiveDerivedPublication(tables, run, subject, effective) {
  validateEffectiveDerivedConflicts(effective);
  const sourceIds = new Set();
  for (const item of effective) {
    const session = item.session;
    const sourceId = normalizePlatformIdentifier(session.SessionID);
    if (!sourceId || sourceIds.has(sourceId)) throw clientError("Derived Course contains duplicate occurrence IDs", 409);
    sourceIds.add(sourceId);
    if (normalizePlatformIdentifier(session.RunID) !== normalizePlatformIdentifier(run.RunID) ||
        normalizePlatformIdentifier(session.SubjectID) !== normalizePlatformIdentifier(subject.SubjectID)) {
      throw clientError("Derived Course occurrence has an invalid run/subject relationship", 409);
    }
    if (!sessionWithinRun(session, run)) throw clientError("Derived Course occurrence falls outside its Course dates", 409);
    if (!validateTimeRange(session.StartTime, session.EndTime)) throw clientError("Derived Course occurrence has an invalid time range", 409);
    resolveModule(tables, session.ModuleID, subject.SubjectID, { requireActive: false });
    if (lifecycleNeedsTeacher(item.lifecycle)) optionalActiveTeacher(tables, session.TeacherAccountID);
    validateZoomLink(session.ZoomLink);
  }
  return true;
}

function validateDerivedExceptionWindow(tables, run, startDate, endDate) {
  const rules = parseRunScheduleRules(run);
  const rulesByKey = new Map(rules.map(rule => [normalizePlatformIdentifier(rule.rulekey), rule]));
  const exceptions = activeGlobalTimetableSessionsForRun(tables.GlobalTimetableSessions, run.RunID)
    .filter(row => normalizeGlobalSessionKind(row.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXCEPTION);
  const anchors = new Set();
  for (const exception of exceptions) {
    const ruleKey = normalizePlatformIdentifier(exception.ScheduleRuleKey);
    const occurrenceDate = clean(exception.OccurrenceDate);
    if (!ruleKey && !occurrenceDate) continue;
    const rule = rulesByKey.get(ruleKey);
    if (!rule || !validateIsoDate(occurrenceDate) || !ruleOccursOnDate(rule, occurrenceDate) || !sessionWithinRun({ SessionDate: occurrenceDate }, run)) {
      throw clientError("A materialised Course exception no longer resolves to a valid recurring occurrence", 409);
    }
    const anchor = derivedOccurrenceAnchor(ruleKey, occurrenceDate);
    if (anchors.has(anchor)) throw clientError("A derived Course contains duplicate exceptions for one occurrence", 409);
    anchors.add(anchor);
    if (occurrenceDate >= startDate && occurrenceDate <= endDate) {
      const actualDate = clean(exception.SessionDate);
      if (actualDate < startDate || actualDate > endDate) {
        throw clientError("A Course exception moves an occurrence outside the selected publication window; widen the publication window", 409);
      }
    }
  }
  return true;
}

function derivedExceptionRowsForPublication(tables, run, startDate, endDate) {
  return activeGlobalTimetableSessionsForRun(tables.GlobalTimetableSessions, run.RunID)
    .filter(row => normalizeGlobalSessionKind(row.SessionKind, GLOBAL_SESSION_KIND_EXPLICIT) === GLOBAL_SESSION_KIND_EXCEPTION)
    .filter(row => {
      const occurrenceDate = clean(row.OccurrenceDate);
      const actualDate = clean(row.SessionDate);
      return (occurrenceDate && occurrenceDate >= startDate && occurrenceDate <= endDate) ||
        (actualDate >= startDate && actualDate <= endDate);
    });
}

function buildPublishedScheduleDefinition(tables, run, subject, rules) {
  const enriched = rules.map(rule => {
    const module = resolveModule(tables, rule.moduleid, subject.SubjectID, { requireActive: false });
    const teacher = optionalActiveTeacher(tables, rule.teacheraccountid);
    validateZoomLink(rule.zoomlink);
    return {
      ...rule,
      modulename: clean(module?.ModuleName),
      teachername: clean(teacher?.DisplayName) || "TBA"
    };
  });
  return serializeCourseScheduleDefinition(enriched, { includeDisplayValues: true });
}

function validateSessionsForPublication(tables, run, subject, sessions) {
  const sourceIds = new Set();
  const slots = new Set();
  const lifecycles = new Map();
  for (const session of sessions) {
    const sourceId = normalizePlatformIdentifier(session.SessionID);
    if (!sourceId || sourceIds.has(sourceId)) throw clientError("Global timetable contains duplicate source SessionID values", 409);
    sourceIds.add(sourceId);
    if (normalizePlatformIdentifier(session.RunID) !== normalizePlatformIdentifier(run.RunID) ||
        normalizePlatformIdentifier(session.SubjectID) !== normalizePlatformIdentifier(subject.SubjectID)) {
      throw clientError("Global timetable session has an invalid run/subject relationship", 409);
    }
    if (!sessionWithinRun(session, run)) throw clientError("Global timetable session falls outside its course dates", 409);
    if (!validateTimeRange(session.StartTime, session.EndTime)) throw clientError("Global timetable session has an invalid time range", 409);
    resolveModule(tables, session.ModuleID, subject.SubjectID, { requireActive: false });
    const lifecycle = resolveCurrentSessionLifecycle(tables.GlobalTimetableSessionLifecycle, session.SessionID);
    lifecycles.set(sourceId, lifecycle);
    optionalActiveTeacher(tables, session.TeacherAccountID);
    validateZoomLink(session.ZoomLink);
    if (lifecycle.status === GLOBAL_SESSION_STATUS_SCHEDULED) {
      const slot = `${clean(session.SessionDate)}|${normalizeSubmittedTime(session.StartTime)}|${normalizeSubmittedTime(session.EndTime)}`;
      if (slots.has(slot)) throw clientError("Global timetable contains duplicate scheduled date/time slots", 409);
      slots.add(slot);
    }
    if (lifecycle.status === GLOBAL_SESSION_STATUS_RESCHEDULED && !normalizePlatformIdentifier(lifecycle.rescheduledtosessionid)) {
      throw clientError("A RESCHEDULED session must link to its replacement session", 409);
    }
  }
  for (const [sessionId, lifecycle] of lifecycles) {
    if (lifecycle.status !== GLOBAL_SESSION_STATUS_RESCHEDULED) continue;
    const replacementId = normalizePlatformIdentifier(lifecycle.rescheduledtosessionid);
    if (!sourceIds.has(replacementId)) {
      throw clientError(`Rescheduled session ${sessionId} points to a replacement that is not active in this course`, 409);
    }
    const replacementLifecycle = lifecycles.get(replacementId);
    if (normalizePlatformIdentifier(replacementLifecycle?.rescheduledfromsessionid) !== sessionId) {
      throw clientError("Rescheduled session linkage is inconsistent", 409);
    }
  }
  return lifecycles;
}

function timetableCalendarEvents(tables) {
  const dates = [
    ...(tables.GlobalTimetableSessions || []).flatMap(row => [clean(row.SessionDate), clean(row.OccurrenceDate)]),
    ...(tables.GlobalSubjectRuns || []).flatMap(run => [clean(run.StartDate), clean(run.EndDate)]),
    ...(tables.AcademyCalendar || []).flatMap(row => [clean(row.StartDate), clean(row.EndDate)])
  ].filter(validateIsoDate).sort();
  if (!dates.length) return [];
  return buildAcademyCalendarEvents(tables.AcademyCalendar || [], dates[0], dates[dates.length - 1]);
}

function activeRun(tables, runId) {
  const run = uniqueRecord(tables.GlobalSubjectRuns, "RunID", runId, "Global subject run");
  if (!isActivePlatformValue(run.Active)) throw clientError("Global timetable requires an active global-subject run", 409);
  return run;
}

function activeSubject(tables, subjectId) {
  const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
  if (!isActivePlatformValue(subject.Active)) throw clientError("Global timetable requires an active global subject", 409);
  return subject;
}

function resolveModule(tables, moduleId, subjectId, { requireActive = false } = {}) {
  if (!clean(moduleId)) return null;
  const module = uniqueRecord(tables.GlobalModuleList, "ModuleID", moduleId, "Global module");
  if (normalizePlatformIdentifier(module.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
    throw clientError("Module does not belong to this global subject", 409);
  }
  if (requireActive && !isActivePlatformValue(module.Active)) throw clientError("Global timetable requires an active module", 409);
  return module;
}

function activeTeacher(tables, accountId) {
  const teacher = uniqueRecord(tables.UserAccounts, "AccountID", accountId, "Teacher account");
  if (!isActivePlatformValue(teacher.Active)) throw clientError("Teacher account must be active", 409);
  return teacher;
}

function optionalActiveTeacher(tables, accountId) {
  if (!clean(accountId)) return null;
  return activeTeacher(tables, accountId);
}

function hasEquivalentScheduledSession(rows, {
  runId, sessionDate, startTime, endTime, moduleId = "", teacherAccountId = "", zoomLink = ""
}, lifecycleRows = []) {
  const runKey = normalizePlatformIdentifier(runId);
  const moduleKey = normalizePlatformIdentifier(moduleId);
  const teacherKey = normalizePlatformIdentifier(teacherAccountId);
  const zoom = clean(zoomLink);
  return (rows || []).some(row => {
    if (!isActivePlatformValue(row.Active)) return false;
    if (normalizePlatformIdentifier(row.RunID) !== runKey) return false;
    if (clean(row.SessionDate) !== clean(sessionDate)) return false;
    const lifecycle = resolveCurrentSessionLifecycle(lifecycleRows, row.SessionID);
    if (lifecycle.status !== GLOBAL_SESSION_STATUS_SCHEDULED) return false;
    return normalizeSubmittedTime(row.StartTime) === startTime
      && normalizeSubmittedTime(row.EndTime) === endTime
      && normalizePlatformIdentifier(row.ModuleID) === moduleKey
      && normalizePlatformIdentifier(row.TeacherAccountID) === teacherKey
      && clean(row.ZoomLink) === zoom;
  });
}

function hasActiveSlotConflict(rows, { runId, sessionDate, startTime, endTime, excludeSessionId = "" }, lifecycleRows = []) {
  const runKey = normalizePlatformIdentifier(runId);
  const exclude = normalizePlatformIdentifier(excludeSessionId);
  return (rows || []).some(row => {
    if (!isActivePlatformValue(row.Active)) return false;
    if (normalizePlatformIdentifier(row.RunID) !== runKey) return false;
    if (exclude && normalizePlatformIdentifier(row.SessionID) === exclude) return false;
    const lifecycle = resolveCurrentSessionLifecycle(lifecycleRows, row.SessionID);
    if (lifecycle.status !== GLOBAL_SESSION_STATUS_SCHEDULED) return false;
    if (clean(row.SessionDate) !== clean(sessionDate)) return false;
    const rowStart = normalizeSubmittedTime(row.StartTime);
    const rowEnd = normalizeSubmittedTime(row.EndTime);
    return rowStart < endTime && startTime < rowEnd;
  });
}

function buildCurrentLifecycleMutation(tables, sessionId, requested, user, timestamp, options = {}) {
  const sessionKey = normalizePlatformIdentifier(sessionId);
  const matches = tables.GlobalTimetableSessionLifecycle.filter(row => (
    !clean(row.PublicationID) && normalizePlatformIdentifier(row.SessionID) === sessionKey
  ));
  if (matches.length > 1) throw clientError("Global timetable session has duplicate current lifecycle rows", 409);
  const existing = matches[0] || null;
  const status = normalizeGlobalSessionStatus(requested?.status);
  const fromId = clean(requested?.rescheduledFromSessionId);
  const toId = clean(requested?.rescheduledToSessionId);
  const current = existing ? mapGlobalTimetableSessionLifecycle(existing) : resolveCurrentSessionLifecycle([], sessionId);
  const changed = options.force === true || current.status !== status ||
    clean(current.rescheduledfromsessionid) !== fromId || clean(current.rescheduledtosessionid) !== toId;
  if (!changed) return null;
  const record = existing ? {
    ...existing,
    Status: status,
    RescheduledFromSessionID: fromId,
    RescheduledToSessionID: toId,
    ModifiedByAccountID: user.accountid,
    ModifiedByAccountName: user.username,
    ModifiedDate: timestamp
  } : {
    SessionLifecycleID: createPlatformId("GTLIFE"),
    SessionID: clean(sessionId),
    PublicationID: "",
    Status: status,
    RescheduledFromSessionID: fromId,
    RescheduledToSessionID: toId,
    CreatedDate: timestamp,
    CreatedByAccountID: user.accountid,
    CreatedByAccountName: user.username,
    ModifiedByAccountID: "",
    ModifiedByAccountName: "",
    ModifiedDate: ""
  };
  const changedFields = ["Status"];
  if (fromId || clean(existing?.RescheduledFromSessionID)) changedFields.push("RescheduledFromSessionID");
  if (toId || clean(existing?.RescheduledToSessionID)) changedFields.push("RescheduledToSessionID");
  return {
    record,
    existingRowNumber: existing?._rowNumber || 0,
    write: valueWrite("GlobalTimetableSessionLifecycle", existing?._rowNumber || nextRowNumber(tables.GlobalTimetableSessionLifecycle), recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableSessionLifecycle)),
    audit: auditRow(user, timestamp, existing ? "UPDATE_GLOBAL_TIMETABLE_SESSION_LIFECYCLE" : "CREATE_GLOBAL_TIMETABLE_SESSION_LIFECYCLE", "GLOBAL_TIMETABLE_SESSION_LIFECYCLE", record.SessionLifecycleID, changedFields)
  };
}

function publishedSourceIdSet(rows) {
  return new Set((rows || []).map(row => normalizePlatformIdentifier(row.SourceSessionID)).filter(Boolean));
}

function readGlobalTimetableVersion(configRows) {
  const matches = (configRows || []).filter(row => (
    normalizePlatformIdentifier(row.ConfigKey) === "GLOBALTIMETABLEVERSION"
  ));
  const value = Number(matches[0]?.ConfigValue);
  if (matches.length !== 1 || !Number.isInteger(value) || value < 1) {
    throw new Error("PlatformConfig GlobalTimetableVersion must resolve exactly once as a positive integer");
  }
  return { value, rowNumber: matches[0]._rowNumber };
}

function mapSubject(record) {
  return { subjectid: clean(record.SubjectID), subjectname: clean(record.SubjectName), active: isActivePlatformValue(record.Active) };
}
function mapModule(record) {
  return { moduleid: clean(record.ModuleID), subjectid: clean(record.SubjectID), modulename: clean(record.ModuleName), active: isActivePlatformValue(record.Active) };
}
function mapTeacherAccount(record) {
  return { accountid: clean(record.AccountID), displayname: clean(record.DisplayName), active: isActivePlatformValue(record.Active) };
}
function enrichSession(session, tables) {
  const run = findById(tables.GlobalSubjectRuns, "RunID", session.runid);
  const subject = findById(tables.GlobalSubjectList, "SubjectID", session.subjectid);
  const module = session.moduleid ? findById(tables.GlobalModuleList, "ModuleID", session.moduleid) : null;
  const teacher = findById(tables.UserAccounts, "AccountID", session.teacheraccountid);
  return Object.freeze({
    ...session,
    runname: clean(run?.RunName),
    subjectname: clean(subject?.SubjectName),
    modulename: clean(module?.ModuleName),
    teachername: clean(teacher?.DisplayName),
    timezone: clean(run?.Timezone)
  });
}

function developmentStateForResponse(tables, runId) {
  const existing = tables.GlobalTimetableRunState.find(row => normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(runId));
  return {
    runid: clean(runId),
    stage: GLOBAL_TIMETABLE_DEVELOPMENT_STAGE,
    currentpublicationid: clean(existing?.CurrentPublicationID),
    draftpublishstartdate: clean(existing?.DraftPublishStartDate),
    draftpublishenddate: clean(existing?.DraftPublishEndDate)
  };
}

function uniqueRecord(records, key, value, label) {
  const normalized = normalizePlatformIdentifier(value);
  if (!normalized) throw clientError(`${label} ID is required`, 400);
  const matches = (records || []).filter(record => normalizePlatformIdentifier(record[key]) === normalized);
  if (matches.length === 0) throw clientError(`${label} was not found`, 404);
  if (matches.length > 1) throw clientError(`${label} is duplicated`, 409);
  return matches[0];
}
function findById(records, key, value) {
  const normalized = normalizePlatformIdentifier(value);
  return (records || []).find(record => normalizePlatformIdentifier(record[key]) === normalized) || null;
}
function changedRecordFields(existing, next, keys) {
  return keys.filter(key => String(existing?.[key] ?? "") !== String(next?.[key] ?? ""));
}
function recordToRow(record, headers) {
  return headers.map(header => record?.[header] ?? "");
}
function auditRow(user, timestamp, action, recordType, recordId, changedFields) {
  return [
    createPlatformId("AUDIT"), timestamp, user.accountid, user.username, user.role,
    user.role === "GLOBAL_ADMIN" ? "" : user.courseid,
    action, recordType, recordId, JSON.stringify(changedFields)
  ];
}
function valueWrite(sheetName, rowNumber, row) {
  return {
    range: `'${sheetName}'!A${rowNumber}:${columnName(row.length)}${rowNumber}`,
    majorDimension: "ROWS",
    values: [row]
  };
}
function rangeWrite(sheetName, startRow, rows) {
  const width = rows[0]?.length || PLATFORM_SHEET_HEADERS[sheetName]?.length || 1;
  const endRow = startRow + rows.length - 1;
  return {
    range: `'${sheetName}'!A${startRow}:${columnName(width)}${endRow}`,
    majorDimension: "ROWS",
    values: rows
  };
}
function nextRowNumber(records) {
  return Math.max(1, ...(records || []).map(record => Number(record._rowNumber) || 1)) + 1;
}
function validateZoomLink(value) {
  const link = clean(value);
  if (!link) return;
  if (link.length > MAX_ZOOM_LINK_LENGTH || !HTTPS_URL_PATTERN.test(link)) {
    throw clientError("ZoomLink must be blank or a valid HTTPS URL", 400);
  }
}
function normalizeSessionDescription(value) {
  const description = clean(value);
  if (description.length > MAX_SESSION_DESCRIPTION_LENGTH) {
    throw clientError(`SessionDescription must be ${MAX_SESSION_DESCRIPTION_LENGTH} characters or fewer`, 400);
  }
  return description;
}
function normalizeSubmittedTime(value) {
  const text = clean(value);
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return text;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}
function readBoolean(value, fallback) {
  if (value === true || value === false) return value;
  const normalized = normalizePlatformIdentifier(value);
  if (["TRUE", "YES", "ACTIVE", "1"].includes(normalized)) return true;
  if (["FALSE", "NO", "INACTIVE", "0"].includes(normalized)) return false;
  if (fallback !== null && fallback !== undefined) return fallback;
  throw clientError("Active must be true or false", 400);
}
function createPlatformId(prefix) {
  const uuid = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}
function columnName(columnNumber) {
  let value = columnNumber;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}
function clientError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function globalTimetableMutationError(error, env) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    return json({ success: false, error: clean(error.message) }, error.status);
  }
  return globalTimetableError(error, env);
}
function globalTimetableError(error, env) {
  const response = { success: false, error: "Global timetable service is not ready" };
  if (String(env.M4L_ACCOUNT_AUTH_DIAGNOSTICS || "").trim().toLowerCase() === "true") {
    response.detail = clean(error?.message || "Global timetable service error").replace(/[\r\n\t]+/g, " ").slice(0, 220);
  }
  return json(response, 503);
}
function clean(value) {
  return String(value ?? "").trim();
}

  return { getPlatformGlobalTimetableEndpoint, generatePlatformGlobalTimetableSessionsEndpoint, materializePlatformGlobalTimetableExceptionEndpoint, savePlatformGlobalTimetableSessionEndpoint, savePlatformGlobalTimetableSessionBatchEndpoint, revisePlatformGlobalTimetableEndpoint, reschedulePlatformGlobalTimetableSessionEndpoint, publishPlatformGlobalTimetableEndpoint };
}

export const { getPlatformGlobalTimetableEndpoint, generatePlatformGlobalTimetableSessionsEndpoint, materializePlatformGlobalTimetableExceptionEndpoint, savePlatformGlobalTimetableSessionEndpoint, savePlatformGlobalTimetableSessionBatchEndpoint, revisePlatformGlobalTimetableEndpoint, reschedulePlatformGlobalTimetableSessionEndpoint, publishPlatformGlobalTimetableEndpoint } = createGlobalTimetableEndpoints();
