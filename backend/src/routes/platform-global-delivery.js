/* M4L V104.5.3 - Global Courses metadata, access, derived scheduling and staged schema migrations. */

import { getAuthUser as defaultGetAuthUser } from "../lib/auth.js";
import {
  countActiveGlobalSubjectSubscriptions,
  deriveGlobalSubjectRunStatus,
  GLOBAL_SUBJECT_ACCESS_MODELS,
  isValidIanaTimezone,
  mapGlobalSubjectRun,
  resolveGlobalSubjectAccessPolicy,
  strongestGlobalSubjectDeliveryStatus,
  validateIsoDate
} from "../lib/global-subject-delivery.js";
import { batchUpdateGoogleSheetValues as defaultBatchUpdateGoogleSheetValues } from "../lib/google-sheets.js";
import {
  COURSE_SCHEDULE_MODE_DERIVED,
  COURSE_SCHEDULE_MODE_EXPLICIT,
  COURSE_SCHEDULE_MODES,
  normalizeCourseScheduleMode,
  parseCourseScheduleDefinition,
  serializeCourseScheduleDefinition,
  validateCourseScheduleRuleConflicts
} from "../lib/global-course-scheduling.js";
import { json } from "../lib/http.js";
import {
  getPlatformSpreadsheetId as defaultGetPlatformSpreadsheetId,
  readPlatformSheet as defaultReadPlatformSheet
} from "../lib/platform-sheet.js";
import {
  isActivePlatformValue,
  normalizePlatformIdentifier,
  PLATFORM_SHEET_HEADERS
} from "../lib/platform-schema.js";

const ACCESS_MODELS = new Set(GLOBAL_SUBJECT_ACCESS_MODELS);
const MAX_RUN_NAME_LENGTH = 160;
const PLATFORM_TIMEZONE_CONFIG_KEY = "PLATFORMTIMEZONE";
const COURSE_ACCESS_SCHEMA_VERSION = "102.0.9";
const LEGACY_COURSE_ACCESS_SCHEMA_VERSION = "102.0.8";
const COURSE_ACCESS_MODELS = new Set(["FREE", "PAID"]);
const COURSE_SCHEDULE_SCHEMA_VERSION = "102.0.12";
const LEGACY_COURSE_SCHEDULE_SCHEMA_VERSIONS = new Set(["102.0.9", "102.0.10", "102.0.11"]);
const COURSE_SCHEDULE_MODE_SET = new Set(COURSE_SCHEDULE_MODES);
const HTTPS_URL_PATTERN = /^https:\/\//i;

// Storage dependencies are scoped to this service instance, never shared between requests.
export function createGlobalDeliveryEndpoints(storage = {}) {
  const getAuthUser = storage.getAuthUser || defaultGetAuthUser;
  const batchUpdateGoogleSheetValues = storage.batchUpdateGoogleSheetValues || defaultBatchUpdateGoogleSheetValues;
  const getPlatformSpreadsheetId = storage.getPlatformSpreadsheetId || defaultGetPlatformSpreadsheetId;
  const readPlatformSheet = storage.readPlatformSheet || defaultReadPlatformSheet;

async function getPlatformGlobalDeliveryEndpoint(request, env) {
  const permission = await requireDeliveryAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const tables = await readDeliveryTables(env);
    const now = new Date();
    return json({
      success: true,
      service: "platform-global-delivery",
      globalCurriculumVersion: readGlobalCurriculumVersion(tables.PlatformConfig).value,
      platformTimezone: readPlatformTimezone(tables.PlatformConfig),
      platformSchemaVersion: readPlatformSchemaVersion(tables.PlatformConfig).value,
      courseAccessSchemaReady: tables.GlobalSubjectRuns._courseAccessSchemaReady === true,
      courseScheduleSchemaReady: tables.GlobalSubjectRuns._courseScheduleSchemaReady === true && tables.GlobalTimetableSessions._courseScheduleSchemaReady === true && tables.GlobalTimetableSessions._sessionDescriptionSchemaReady === true && tables.GlobalTimetableRunState._draftPublishWindowSchemaReady === true && readPlatformSchemaVersion(tables.PlatformConfig).value === COURSE_SCHEDULE_SCHEMA_VERSION,
      subjects: tables.GlobalSubjectList.map(subject => mapDeliverySubject(subject, tables, now)),
      policies: tables.GlobalSubjectAccessPolicy.map(mapPolicy),
      runs: tables.GlobalSubjectRuns.map(run => mapCourseRun(run, tables, now))
    });
  } catch (error) {
    return deliveryError(error, env);
  }
}

async function savePlatformGlobalSubjectPolicyEndpoint(request, env) {
  const permission = await requireDeliveryAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const subjectId = clean(body.subjectId || body.subjectid);
    const accessModel = normalizePlatformIdentifier(body.accessModel || body.accessmodel);
    if (!subjectId) throw clientError("Global SubjectID is required", 400);
    if (!ACCESS_MODELS.has(accessModel)) {
      throw clientError("AccessModel must be FREE or SUBSCRIPTION", 400);
    }

    const tables = await readDeliveryTables(env);
    const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
    const subjectKey = normalizePlatformIdentifier(subject.SubjectID);
    const activeMatches = tables.GlobalSubjectAccessPolicy.filter(policy => (
      normalizePlatformIdentifier(policy.SubjectID) === subjectKey && isActivePlatformValue(policy.Active)
    ));
    if (activeMatches.length > 1) {
      throw clientError("Global subject has duplicate active access policies; run Platform validation", 409);
    }

    const timestamp = new Date().toISOString();
    const existing = activeMatches[0] || null;
    if (existing && normalizePlatformIdentifier(existing.AccessModel) === accessModel) {
      return json({
        success: true,
        message: `Global subject is already ${accessModel}`,
        policy: mapPolicy(existing),
        dependencies: subjectDependencies(tables, subject.SubjectID)
      });
    }

    const record = existing ? {
      ...existing,
      AccessModel: accessModel,
      Active: true,
      ModifiedByAccountID: permission.user.accountid,
      ModifiedByAccountName: permission.user.username,
      ModifiedDate: timestamp
    } : {
      SubjectPolicyID: createPlatformId("GSPOL"),
      SubjectID: clean(subject.SubjectID),
      AccessModel: accessModel,
      Active: true,
      CreatedDate: timestamp,
      CreatedByAccountID: permission.user.accountid,
      CreatedByAccountName: permission.user.username,
      ModifiedByAccountID: "",
      ModifiedByAccountName: "",
      ModifiedDate: ""
    };

    await writeDeliveryMutation(env, permission.user, tables, {
      sheetName: "GlobalSubjectAccessPolicy",
      rowNumber: existing?._rowNumber || nextRowNumber(tables.GlobalSubjectAccessPolicy),
      record,
      action: existing ? "UPDATE_GLOBAL_SUBJECT_ACCESS_POLICY" : "CREATE_GLOBAL_SUBJECT_ACCESS_POLICY",
      recordType: "GLOBAL_SUBJECT_ACCESS_POLICY",
      recordId: record.SubjectPolicyID,
      changedFields: existing ? ["AccessModel"] : ["SubjectID", "AccessModel", "Active"],
      timestamp
    });

    return json({
      success: true,
      message: `Global subject access set to ${accessModel}`,
      policy: mapPolicy(record),
      dependencies: subjectDependencies(tables, subject.SubjectID)
    });
  } catch (error) {
    return deliveryMutationError(error, env);
  }
}

async function savePlatformGlobalSubjectRunEndpoint(request, env) {
  const permission = await requireDeliveryAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const runId = clean(body.runId || body.runid);
    const subjectId = clean(body.subjectId || body.subjectid);
    const runName = clean(body.runName || body.runname);
    let startDate = clean(body.startDate || body.startdate);
    let endDate = clean(body.endDate || body.enddate);
    const requestedTimezone = clean(body.timezone);
    const requestedActive = readBoolean(body.active, runId ? null : true);
    const requestedAccessModel = normalizePlatformIdentifier(body.accessModel || body.accessmodel);
    const requestedScheduleMode = normalizePlatformIdentifier(body.scheduleMode || body.schedulemode);
    const hasScheduleDefinition = Object.prototype.hasOwnProperty.call(body, "scheduleDefinition") || Object.prototype.hasOwnProperty.call(body, "scheduledefinition");
    const requestedScheduleDefinition = body.scheduleDefinition ?? body.scheduledefinition;
    const hasDraftPublishStart = Object.prototype.hasOwnProperty.call(body, "draftPublishStartDate") || Object.prototype.hasOwnProperty.call(body, "draftpublishstartdate");
    const hasDraftPublishEnd = Object.prototype.hasOwnProperty.call(body, "draftPublishEndDate") || Object.prototype.hasOwnProperty.call(body, "draftpublishenddate");
    const requestedDraftPublishStart = clean(body.draftPublishStartDate ?? body.draftpublishstartdate);
    const requestedDraftPublishEnd = clean(body.draftPublishEndDate ?? body.draftpublishenddate);
    const requestedOngoing = body.ongoing === undefined
      ? (!startDate && !endDate)
      : readBoolean(body.ongoing, false);

    if (!subjectId) throw clientError("Global SubjectID is required", 400);
    if (!runName) throw clientError("Run name is required", 400);
    if (runName.length > MAX_RUN_NAME_LENGTH) throw clientError("Run name is too long", 400);
    if (requestedOngoing) {
      startDate = "";
      endDate = "";
    } else {
      if (!validateIsoDate(startDate) || !validateIsoDate(endDate)) {
        throw clientError("StartDate and EndDate must use YYYY-MM-DD unless the course is Ongoing", 400);
      }
      if (endDate < startDate) throw clientError("EndDate cannot precede StartDate", 400);
    }

    const tables = await readDeliveryTables(env);
    const platformTimezone = readPlatformTimezone(tables.PlatformConfig);
    const courseAccessSchemaReady = tables.GlobalSubjectRuns._courseAccessSchemaReady === true;
    const courseScheduleSchemaReady = tables.GlobalSubjectRuns._courseScheduleSchemaReady === true && tables.GlobalTimetableSessions._courseScheduleSchemaReady === true && tables.GlobalTimetableSessions._sessionDescriptionSchemaReady === true && tables.GlobalTimetableRunState._draftPublishWindowSchemaReady === true && readPlatformSchemaVersion(tables.PlatformConfig).value === COURSE_SCHEDULE_SCHEMA_VERSION;
    if (!courseAccessSchemaReady) {
      throw clientError("Run the V103.1.0.5 Course access migration before saving Courses", 409);
    }
    if (!courseScheduleSchemaReady) {
      throw clientError("Run the V104.5 Course scheduling migration before saving Courses", 409);
    }
    const timezone = existingTimezoneCandidate(runId, tables.GlobalSubjectRuns) || requestedTimezone || platformTimezone;
    if (!isValidIanaTimezone(timezone)) throw clientError("Platform timezone is invalid", 409);
    const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
    if (requestedActive && !isActivePlatformValue(subject.Active)) {
      throw clientError("An active run requires an active global subject", 409);
    }
    const existing = runId
      ? uniqueRecord(tables.GlobalSubjectRuns, "RunID", runId, "Global subject run")
      : null;
    const stateMatches = runId ? tables.GlobalTimetableRunState.filter(row => (
      normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(runId)
    )) : [];
    if (stateMatches.length > 1) throw clientError("Course has duplicate timetable-state rows", 409);
    const existingState = stateMatches[0] || null;
    const draftWindowTouched = requestedOngoing
      ? (hasDraftPublishStart || hasDraftPublishEnd)
      : Boolean(clean(existingState?.DraftPublishStartDate) || clean(existingState?.DraftPublishEndDate));
    const draftPublishStartDate = requestedOngoing
      ? (hasDraftPublishStart ? requestedDraftPublishStart : clean(existingState?.DraftPublishStartDate))
      : "";
    const draftPublishEndDate = requestedOngoing
      ? (hasDraftPublishEnd ? requestedDraftPublishEnd : clean(existingState?.DraftPublishEndDate))
      : "";
    if (draftWindowTouched && requestedOngoing) {
      const hasDraftWindow = Boolean(draftPublishStartDate || draftPublishEndDate);
      if (hasDraftWindow && (!validateIsoDate(draftPublishStartDate) || !validateIsoDate(draftPublishEndDate) || draftPublishEndDate < draftPublishStartDate)) {
        throw clientError("ONGOING Course draft publication window requires both Publish From and Publish Through dates, or both blank", 400);
      }
    }
    const accessModel = requestedAccessModel || resolveCourseAccessModel(existing, tables);
    if (!COURSE_ACCESS_MODELS.has(accessModel)) {
      throw clientError("Course AccessModel must be FREE or PAID", 400);
    }
    const scheduleMode = requestedScheduleMode
      ? normalizeCourseScheduleMode(requestedScheduleMode, "")
      : normalizeCourseScheduleMode(existing?.ScheduleMode, runId ? COURSE_SCHEDULE_MODE_EXPLICIT : COURSE_SCHEDULE_MODE_DERIVED);
    if (!COURSE_SCHEDULE_MODE_SET.has(scheduleMode) || (requestedScheduleMode && scheduleMode !== requestedScheduleMode)) {
      throw clientError("Course ScheduleMode must be DERIVED or EXPLICIT", 400);
    }
    let scheduleDefinition = clean(existing?.ScheduleDefinition) || "[]";
    if (hasScheduleDefinition) {
      scheduleDefinition = normalizeCourseScheduleDefinitionForSave(requestedScheduleDefinition, tables, subject);
    } else if (!existing) {
      scheduleDefinition = "[]";
    }
    if (existing) {
      if (normalizePlatformIdentifier(existingState?.Stage) === "PUBLISHED") {
        const wouldChange = [
          [existing.RunName, runName], [existing.StartDate, startDate], [existing.EndDate, endDate],
          [normalizePlatformIdentifier(existing.AccessModel), accessModel],
          [normalizeCourseScheduleMode(existing.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT), scheduleMode],
          [clean(existing.ScheduleDefinition) || "[]", scheduleDefinition],
          [clean(existingState?.DraftPublishStartDate), draftPublishStartDate],
          [clean(existingState?.DraftPublishEndDate), draftPublishEndDate],
          [String(isActivePlatformValue(existing.Active)), String(requestedActive)]
        ].some(([left, right]) => String(left ?? "") !== String(right ?? ""));
        if (wouldChange) throw clientError("Revise timetable before modifying a published course", 409);
      }
    }
    if (
      existing &&
      normalizePlatformIdentifier(existing.SubjectID) !== normalizePlatformIdentifier(subject.SubjectID)
    ) {
      throw clientError("A run cannot be moved to a different global subject", 409);
    }

    // V103.1.0.5: fixed Course dates describe the current delivery window, not the lifetime
    // of the reusable Course. Historical sessions from earlier deliveries remain preserved.

    const timestamp = new Date().toISOString();
    const record = existing ? {
      ...existing,
      RunName: runName,
      StartDate: startDate,
      EndDate: endDate,
      Timezone: timezone,
      Active: requestedActive,
      ModifiedByAccountID: permission.user.accountid,
      ModifiedByAccountName: permission.user.username,
      ModifiedDate: timestamp,
      AccessModel: courseAccessSchemaReady ? accessModel : clean(existing.AccessModel),
      ScheduleMode: scheduleMode,
      ScheduleDefinition: scheduleDefinition
    } : {
      RunID: createPlatformId("GSRUN"),
      SubjectID: clean(subject.SubjectID),
      RunName: runName,
      StartDate: startDate,
      EndDate: endDate,
      Timezone: timezone,
      Active: requestedActive,
      CreatedDate: timestamp,
      CreatedByAccountID: permission.user.accountid,
      CreatedByAccountName: permission.user.username,
      ModifiedByAccountID: "",
      ModifiedByAccountName: "",
      ModifiedDate: "",
      AccessModel: courseAccessSchemaReady ? accessModel : "",
      ScheduleMode: scheduleMode,
      ScheduleDefinition: scheduleDefinition
    };

    const changedFields = existing
      ? changedRecordFields(existing, record, ["RunName", "StartDate", "EndDate", "Timezone", "Active", "AccessModel", "ScheduleMode", "ScheduleDefinition"])
      : ["SubjectID", "RunName", "StartDate", "EndDate", "Timezone", "Active", "AccessModel", "ScheduleMode", "ScheduleDefinition"];
    const draftWindowChanged = draftWindowTouched && (
      clean(existingState?.DraftPublishStartDate) !== draftPublishStartDate ||
      clean(existingState?.DraftPublishEndDate) !== draftPublishEndDate
    );
    if (existing && changedFields.length === 0 && !draftWindowChanged) {
      return json({
        success: true,
        message: "No global-subject run changes requested",
        run: mapCourseRun(existing, tables),
        dependencies: subjectDependencies(tables, subject.SubjectID)
      });
    }

    await writeDeliveryMutation(env, permission.user, tables, {
      sheetName: "GlobalSubjectRuns",
      rowNumber: existing?._rowNumber || nextRowNumber(tables.GlobalSubjectRuns),
      record,
      action: existing ? "UPDATE_GLOBAL_SUBJECT_RUN" : "CREATE_GLOBAL_SUBJECT_RUN",
      recordType: "GLOBAL_SUBJECT_RUN",
      recordId: record.RunID,
      changedFields,
      timestamp,
      timetableStateDirty: changedFields.some(field => ["ScheduleMode", "ScheduleDefinition", "StartDate", "EndDate"].includes(field)) || draftWindowChanged,
      draftWindowTouched,
      draftPublishStartDate,
      draftPublishEndDate
    });

    const responseRun = mapCourseRun(record, tables);
    return json({
      success: true,
      message: existing ? "Global-subject run updated" : "Global-subject run created",
      run: Object.freeze({
        ...responseRun,
        draftpublishstartdate: requestedOngoing ? draftPublishStartDate : "",
        draftpublishenddate: requestedOngoing ? draftPublishEndDate : ""
      }),
      dependencies: subjectDependencies(tables, subject.SubjectID)
    });
  } catch (error) {
    return deliveryMutationError(error, env);
  }
}

async function migratePlatformGlobalCourseAccessEndpoint(request, env) {
  const permission = await requireDeliveryAdmin(request, env);
  if (!permission.ok) return permission.response;
  if (permission.user.role !== "GLOBAL_ADMIN") {
    return json({ success: false, error: "GLOBAL_ADMIN authority is required for the Course access schema migration" }, 403);
  }
  try {
    const body = await request.json();
    const commit = body.commit === true;
    const tables = await readDeliveryTables(env);
    const schema = readPlatformSchemaVersion(tables.PlatformConfig);
    const ready = tables.GlobalSubjectRuns._courseAccessSchemaReady === true;
    const proposed = tables.GlobalSubjectRuns.map(run => ({
      runid: clean(run.RunID),
      runname: clean(run.RunName),
      subjectid: clean(run.SubjectID),
      accessmodel: resolveCourseAccessModel(run, tables)
    }));
    if (!commit) {
      return json({
        success: true,
        canCommit: !ready || schema.value !== COURSE_ACCESS_SCHEMA_VERSION,
        courseAccessSchemaReady: ready,
        platformSchemaVersion: schema.value,
        targetPlatformSchemaVersion: COURSE_ACCESS_SCHEMA_VERSION,
        courseCount: proposed.length,
        courses: proposed,
        confirmationText: "MIGRATE COURSES"
      });
    }
    if (normalizePlatformIdentifier(body.confirmation) !== "MIGRATE COURSES") {
      throw clientError("Enter MIGRATE COURSES to confirm the Course access migration", 400);
    }
    if (ready && schema.value === COURSE_ACCESS_SCHEMA_VERSION) {
      return json({ success: true, message: "Course FREE/PAID access schema is already current", courseAccessSchemaReady: true, platformSchemaVersion: schema.value });
    }
    if (![LEGACY_COURSE_ACCESS_SCHEMA_VERSION, COURSE_ACCESS_SCHEMA_VERSION].includes(schema.value)) {
      throw clientError(`Course access migration supports PlatformSchemaVersion ${LEGACY_COURSE_ACCESS_SCHEMA_VERSION} or ${COURSE_ACCESS_SCHEMA_VERSION}`, 409);
    }
    const timestamp = new Date().toISOString();
    // Keep the V103.1 Course-access migration at its historical 14-column boundary.
    // V104.5 adds ScheduleMode/ScheduleDefinition only in the separate scheduling migration.
    const runHeaders = PLATFORM_SHEET_HEADERS.GlobalSubjectRuns.slice(0, 14);
    const runRows = tables.GlobalSubjectRuns.map(run => ({ ...run, AccessModel: resolveCourseAccessModel(run, tables) }));
    const writes = [{
      range: `'GlobalSubjectRuns'!A1:${columnName(runHeaders.length)}${Math.max(1, runRows.length + 1)}`,
      majorDimension: "ROWS",
      values: [runHeaders, ...runRows.map(record => recordToRow(record, runHeaders))]
    }, {
      range: `'PlatformConfig'!B${schema.rowNumber}:E${schema.rowNumber}`,
      majorDimension: "ROWS",
      values: [[COURSE_ACCESS_SCHEMA_VERSION, timestamp, permission.user.accountid, permission.user.username]]
    }, valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), [
      createPlatformId("AUDIT"), timestamp, permission.user.accountid, permission.user.username,
      permission.user.role, "", "MIGRATE_GLOBAL_COURSE_ACCESS_MODEL", "PLATFORM_SCHEMA",
      COURSE_ACCESS_SCHEMA_VERSION, JSON.stringify(["GlobalSubjectRuns.AccessModel", "PlatformSchemaVersion"])
    ])];
    await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
    return json({
      success: true,
      message: `${runRows.length} Course access value${runRows.length === 1 ? "" : "s"} prepared as FREE/PAID`,
      courseAccessSchemaReady: true,
      platformSchemaVersion: COURSE_ACCESS_SCHEMA_VERSION,
      migrated: runRows.length
    });
  } catch (error) {
    return deliveryMutationError(error, env);
  }
}

async function migratePlatformGlobalCourseSchedulingEndpoint(request, env) {
  const permission = await requireDeliveryAdmin(request, env);
  if (!permission.ok) return permission.response;
  if (permission.user.role !== "GLOBAL_ADMIN") {
    return json({ success: false, error: "GLOBAL_ADMIN authority is required for the V104.5 Course scheduling migration" }, 403);
  }
  try {
    const body = await request.json();
    const commit = body.commit === true;
    const tables = await readDeliveryTables(env);
    const [publications, publishedSessions] = await Promise.all([
      readPlatformSheet(env, "GlobalTimetablePublications"),
      readPlatformSheet(env, "PublishedGlobalTimetableSessions")
    ]);
    const schema = readPlatformSchemaVersion(tables.PlatformConfig);
    const ready = tables.GlobalSubjectRuns._courseScheduleSchemaReady === true &&
      tables.GlobalTimetableSessions._courseScheduleSchemaReady === true &&
      tables.GlobalTimetableSessions._sessionDescriptionSchemaReady === true &&
      publications._courseScheduleSchemaReady === true &&
      publishedSessions._courseScheduleSchemaReady === true &&
      publishedSessions._sessionDescriptionSchemaReady === true &&
      tables.GlobalTimetableRunState._draftPublishWindowSchemaReady === true &&
      schema.value === COURSE_SCHEDULE_SCHEMA_VERSION;
    const proposed = tables.GlobalSubjectRuns.map(run => ({
      runid: clean(run.RunID),
      runname: clean(run.RunName),
      schedulemode: normalizeCourseScheduleMode(run.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT),
      existingSourceSessions: tables.GlobalTimetableSessions.filter(row => normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(run.RunID)).length
    }));

    if (!commit) {
      return json({
        success: true,
        canCommit: !ready,
        courseScheduleSchemaReady: ready,
        platformSchemaVersion: schema.value,
        targetPlatformSchemaVersion: COURSE_SCHEDULE_SCHEMA_VERSION,
        courseCount: proposed.length,
        courses: proposed,
        existingCourseModesPreserved: true,
        existingCoursesPreservedAs: schema.value === "102.0.9" ? COURSE_SCHEDULE_MODE_EXPLICIT : "CURRENT",
        newCourseDefault: COURSE_SCHEDULE_MODE_DERIVED,
        confirmationText: "MIGRATE COURSE SCHEDULING"
      });
    }
    if (normalizePlatformIdentifier(body.confirmation) !== "MIGRATE COURSE SCHEDULING") {
      throw clientError("Enter MIGRATE COURSE SCHEDULING to confirm the V104.5 Course scheduling migration", 400);
    }
    if (ready) {
      return json({
        success: true,
        message: "V104.5.3 Course scheduling schema is already current",
        courseScheduleSchemaReady: true,
        platformSchemaVersion: schema.value
      });
    }
    if (!LEGACY_COURSE_SCHEDULE_SCHEMA_VERSIONS.has(schema.value)) {
      throw clientError("V104.5 Course scheduling migration requires PlatformSchemaVersion 102.0.9, 102.0.10 or 102.0.11", 409);
    }
    if (tables.GlobalSubjectRuns._courseAccessSchemaReady !== true) {
      throw clientError("Complete the Course FREE/PAID migration before V104.5 Course scheduling", 409);
    }

    const timestamp = new Date().toISOString();
    const runRows = tables.GlobalSubjectRuns.map(run => ({
      ...run,
      ScheduleMode: normalizeCourseScheduleMode(run.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT),
      ScheduleDefinition: clean(run.ScheduleDefinition) || "[]"
    }));
    const sourceRows = tables.GlobalTimetableSessions.map(session => ({
      ...session,
      SessionKind: normalizePlatformIdentifier(session.SessionKind) || "EXPLICIT",
      ScheduleRuleKey: clean(session.ScheduleRuleKey),
      OccurrenceDate: clean(session.OccurrenceDate),
      SessionDescription: clean(session.SessionDescription)
    }));
    const snapshotByPublication = new Map();
    for (const snapshot of publishedSessions) {
      const key = normalizePlatformIdentifier(snapshot.PublicationID);
      if (!key) continue;
      if (!snapshotByPublication.has(key)) snapshotByPublication.set(key, []);
      snapshotByPublication.get(key).push(snapshot);
    }
    const runById = new Map(runRows.map(run => [normalizePlatformIdentifier(run.RunID), run]));
    const subjectById = new Map(tables.GlobalSubjectList.map(subject => [normalizePlatformIdentifier(subject.SubjectID), subject]));
    const publicationRows = publications.map(publication => {
      const snapshots = snapshotByPublication.get(normalizePlatformIdentifier(publication.PublicationID)) || [];
      const dates = snapshots.map(row => clean(row.SessionDate)).filter(validateIsoDate).sort();
      const first = snapshots[0] || {};
      const run = runById.get(normalizePlatformIdentifier(publication.RunID));
      const subject = subjectById.get(normalizePlatformIdentifier(publication.SubjectID));
      return {
        ...publication,
        ScheduleMode: normalizeCourseScheduleMode(publication.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT),
        PublishStartDate: clean(publication.PublishStartDate) || dates[0] || clean(run?.StartDate),
        PublishEndDate: clean(publication.PublishEndDate) || dates.at(-1) || clean(run?.EndDate),
        ScheduleDefinition: clean(publication.ScheduleDefinition) || "[]",
        RunName: clean(publication.RunName) || clean(first.RunName) || clean(run?.RunName),
        SubjectName: clean(publication.SubjectName) || clean(first.SubjectName) || clean(subject?.SubjectName),
        Timezone: clean(publication.Timezone) || clean(first.Timezone) || clean(run?.Timezone)
      };
    });
    const publishedRows = publishedSessions.map(snapshot => ({
      ...snapshot,
      SessionKind: normalizePlatformIdentifier(snapshot.SessionKind) || "EXPLICIT",
      ScheduleRuleKey: clean(snapshot.ScheduleRuleKey),
      OccurrenceDate: clean(snapshot.OccurrenceDate),
      SessionDescription: clean(snapshot.SessionDescription)
    }));
    const publicationById = new Map(publicationRows.map(publication => [normalizePlatformIdentifier(publication.PublicationID), publication]));
    const stateRows = tables.GlobalTimetableRunState.map(state => {
      const run = runById.get(normalizePlatformIdentifier(state.RunID));
      const ongoing = run && !clean(run.StartDate) && !clean(run.EndDate);
      const publication = publicationById.get(normalizePlatformIdentifier(state.CurrentPublicationID));
      return {
        ...state,
        DraftPublishStartDate: clean(state.DraftPublishStartDate) || (ongoing ? clean(publication?.PublishStartDate) : ""),
        DraftPublishEndDate: clean(state.DraftPublishEndDate) || (ongoing ? clean(publication?.PublishEndDate) : "")
      };
    });

    const writes = [
      fullTableWrite("GlobalSubjectRuns", runRows),
      fullTableWrite("GlobalTimetableSessions", sourceRows),
      fullTableWrite("GlobalTimetableRunState", stateRows),
      fullTableWrite("GlobalTimetablePublications", publicationRows),
      fullTableWrite("PublishedGlobalTimetableSessions", publishedRows),
      {
        range: `'PlatformConfig'!B${schema.rowNumber}:E${schema.rowNumber}`,
        majorDimension: "ROWS",
        values: [[COURSE_SCHEDULE_SCHEMA_VERSION, timestamp, permission.user.accountid, permission.user.username]]
      },
      valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), [
        createPlatformId("AUDIT"), timestamp, permission.user.accountid, permission.user.username,
        permission.user.role, "", "MIGRATE_GLOBAL_COURSE_SCHEDULING", "PLATFORM_SCHEMA",
        COURSE_SCHEDULE_SCHEMA_VERSION,
        JSON.stringify([
          "GlobalSubjectRuns.ScheduleMode", "GlobalSubjectRuns.ScheduleDefinition",
          "GlobalTimetableSessions.SessionKind", "GlobalTimetableSessions.ScheduleRuleKey", "GlobalTimetableSessions.OccurrenceDate", "GlobalTimetableSessions.SessionDescription",
          "GlobalTimetableRunState.DraftPublishStartDate", "GlobalTimetableRunState.DraftPublishEndDate",
          "GlobalTimetablePublications.ScheduleMode", "GlobalTimetablePublications.PublishStartDate", "GlobalTimetablePublications.PublishEndDate", "GlobalTimetablePublications.ScheduleDefinition",
          "PublishedGlobalTimetableSessions.SessionKind", "PublishedGlobalTimetableSessions.ScheduleRuleKey", "PublishedGlobalTimetableSessions.OccurrenceDate", "PublishedGlobalTimetableSessions.SessionDescription",
          "PlatformSchemaVersion"
        ])
      ])
    ];
    await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
    return json({
      success: true,
      message: schema.value === "102.0.9"
        ? `${runRows.length} existing Course${runRows.length === 1 ? "" : "s"} preserved as EXPLICIT; new Courses now default to DERIVED`
        : (schema.value === "102.0.11"
          ? "V104.5.3 Course scheduling updated with authoritative ONGOING draft publication windows; existing publications were preserved"
          : "V104.5 Course scheduling updated; existing Course modes and publications were preserved"),
      courseScheduleSchemaReady: true,
      platformSchemaVersion: COURSE_SCHEDULE_SCHEMA_VERSION,
      migrated: runRows.length
    });
  } catch (error) {
    return deliveryMutationError(error, env);
  }
}

function fullTableWrite(sheetName, records) {
  const headers = PLATFORM_SHEET_HEADERS[sheetName];
  return {
    range: `'${sheetName}'!A1:${columnName(headers.length)}${Math.max(1, records.length + 1)}`,
    majorDimension: "ROWS",
    values: [headers, ...records.map(record => recordToRow(record, headers))]
  };
}

async function requireDeliveryAdmin(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  const authority = normalizePlatformIdentifier(user.role);
  if (user.type !== "account" || !["ADMIN", "GLOBAL_ADMIN"].includes(authority)) {
    return {
      ok: false,
      response: json({ success: false, error: "ADMIN or GLOBAL_ADMIN authority is required" }, 403)
    };
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

async function readDeliveryTables(env) {
  const names = [
    "GlobalSubjectList",
    "GlobalModuleList",
    "UserAccounts",
    "GlobalSubjectAccessPolicy",
    "GlobalSubjectRuns",
    "GlobalSubjectAccessMatrix",
    "GlobalTimetableSessions",
    "GlobalTimetableRunState",
    "GlobalResources",
    "PlatformConfig",
    "PlatformAuditLog"
  ];
  const entries = await Promise.all(names.map(async name => [name, await readPlatformSheet(env, name)]));
  return Object.fromEntries(entries);
}

async function writeDeliveryMutation(env, user, tables, mutation) {
  const version = readGlobalCurriculumVersion(tables.PlatformConfig);
  const nextVersion = version.value + 1;
  const headers = PLATFORM_SHEET_HEADERS[mutation.sheetName];
  const auditRow = [
    createPlatformId("AUDIT"),
    mutation.timestamp,
    user.accountid,
    user.username,
    user.role,
    user.role === "GLOBAL_ADMIN" ? "" : user.courseid,
    mutation.action,
    mutation.recordType,
    mutation.recordId,
    JSON.stringify(mutation.changedFields)
  ];
  const writes = [
    valueWrite(mutation.sheetName, mutation.rowNumber, recordToRow(mutation.record, headers)),
    {
      range: `'PlatformConfig'!B${version.rowNumber}:E${version.rowNumber}`,
      majorDimension: "ROWS",
      values: [[nextVersion, mutation.timestamp, user.accountid, user.username]]
    }
  ];
  const audits = [auditRow];
  if (mutation.timetableStateDirty && mutation.record?.RunID) {
    const stateMutation = buildCourseDevelopmentStateMutation(tables, mutation.record.RunID, user, mutation.timestamp, {
      draftWindowTouched: mutation.draftWindowTouched === true,
      draftPublishStartDate: clean(mutation.draftPublishStartDate),
      draftPublishEndDate: clean(mutation.draftPublishEndDate)
    });
    if (stateMutation) {
      writes.push(stateMutation.write);
      audits.push(stateMutation.audit);
    }
  }
  writes.push(rangeWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), audits));
  await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
}

function normalizeCourseScheduleDefinitionForSave(value, tables, subject) {
  let rules;
  try {
    rules = parseCourseScheduleDefinition(value || [], {
      createRuleKey: () => createPlatformId("GCRULE")
    });
    validateCourseScheduleRuleConflicts(rules);
  } catch (error) {
    throw clientError(error.message || "Course schedule definition is invalid", 400);
  }
  for (const rule of rules) {
    if (rule.moduleid) {
      const matches = tables.GlobalModuleList.filter(row => normalizePlatformIdentifier(row.ModuleID) === normalizePlatformIdentifier(rule.moduleid));
      if (matches.length !== 1 || normalizePlatformIdentifier(matches[0].SubjectID) !== normalizePlatformIdentifier(subject.SubjectID) || !isActivePlatformValue(matches[0].Active)) {
        throw clientError("Every derived Course module must be active and belong to the selected Global Subject", 409);
      }
    }
    if (rule.teacheraccountid) {
      const matches = tables.UserAccounts.filter(row => normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(rule.teacheraccountid));
      if (matches.length !== 1 || !isActivePlatformValue(matches[0].Active)) {
        throw clientError("Every derived Course teacher must be an active central account", 409);
      }
    }
    if (rule.zoomlink && !HTTPS_URL_PATTERN.test(rule.zoomlink)) {
      throw clientError("Course schedule Zoom links must be blank or HTTPS URLs", 400);
    }
  }
  return serializeCourseScheduleDefinition(rules);
}

function buildCourseDevelopmentStateMutation(tables, runId, user, timestamp, options = {}) {
  const matches = (tables.GlobalTimetableRunState || []).filter(row => normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(runId));
  if (matches.length > 1) throw clientError("Course has duplicate timetable-state rows", 409);
  const existing = matches[0] || null;
  const nextDraftStart = options.draftWindowTouched ? clean(options.draftPublishStartDate) : clean(existing?.DraftPublishStartDate);
  const nextDraftEnd = options.draftWindowTouched ? clean(options.draftPublishEndDate) : clean(existing?.DraftPublishEndDate);
  const alreadyDevelopment = existing && normalizePlatformIdentifier(existing.Stage) === "DEVELOPMENT";
  const sameWindow = clean(existing?.DraftPublishStartDate) === nextDraftStart && clean(existing?.DraftPublishEndDate) === nextDraftEnd;
  if (alreadyDevelopment && sameWindow) return null;
  const record = existing ? {
    ...existing,
    Stage: "DEVELOPMENT",
    CurrentPublicationID: clean(existing.CurrentPublicationID),
    DraftPublishStartDate: nextDraftStart,
    DraftPublishEndDate: nextDraftEnd,
    ModifiedByAccountID: user.accountid,
    ModifiedByAccountName: user.username,
    ModifiedDate: timestamp
  } : {
    RunID: clean(runId), Stage: "DEVELOPMENT", CurrentPublicationID: "",
    DraftPublishStartDate: nextDraftStart, DraftPublishEndDate: nextDraftEnd,
    CreatedDate: timestamp, CreatedByAccountID: user.accountid, CreatedByAccountName: user.username,
    ModifiedByAccountID: "", ModifiedByAccountName: "", ModifiedDate: ""
  };
  return {
    write: valueWrite("GlobalTimetableRunState", existing?._rowNumber || nextRowNumber(tables.GlobalTimetableRunState), recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalTimetableRunState)),
    audit: [createPlatformId("AUDIT"), timestamp, user.accountid, user.username, user.role, user.role === "GLOBAL_ADMIN" ? "" : user.courseid,
      existing ? "UPDATE_GLOBAL_TIMETABLE_STATE" : "CREATE_GLOBAL_TIMETABLE_STATE", "GLOBAL_TIMETABLE_RUN_STATE", clean(runId), JSON.stringify(["Stage", "CurrentPublicationID", "DraftPublishStartDate", "DraftPublishEndDate"])]
  };
}

function readPlatformSchemaVersion(configRows) {
  const matches = (configRows || []).filter(row => normalizePlatformIdentifier(row.ConfigKey) === "PLATFORMSCHEMAVERSION");
  const value = clean(matches[0]?.ConfigValue);
  if (matches.length !== 1 || !value) throw new Error("PlatformConfig PlatformSchemaVersion must resolve exactly once");
  return { value, rowNumber: matches[0]._rowNumber };
}

function resolveCourseAccessModel(run, tables) {
  const explicit = normalizePlatformIdentifier(run?.AccessModel);
  if (COURSE_ACCESS_MODELS.has(explicit)) return explicit;
  const subjectId = clean(run?.SubjectID);
  const subjectPolicy = resolveGlobalSubjectAccessPolicy(tables?.GlobalSubjectAccessPolicy || [], subjectId).accessModel;
  return subjectPolicy === "FREE" ? "FREE" : "PAID";
}

function mapCourseRun(run, tables, now = new Date()) {
  const state = (tables?.GlobalTimetableRunState || []).find(row => (
    normalizePlatformIdentifier(row.RunID) === normalizePlatformIdentifier(run?.RunID)
  ));
  return Object.freeze({
    ...mapGlobalSubjectRun(run, now),
    accessmodel: resolveCourseAccessModel(run, tables),
    schedulemode: normalizeCourseScheduleMode(run?.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT),
    scheduledefinition: parseCourseScheduleDefinition(run?.ScheduleDefinition || "[]"),
    draftpublishstartdate: clean(state?.DraftPublishStartDate),
    draftpublishenddate: clean(state?.DraftPublishEndDate)
  });
}

function mapDeliverySubject(subject, tables, now) {
  const subjectId = clean(subject.SubjectID);
  const policy = resolveGlobalSubjectAccessPolicy(tables.GlobalSubjectAccessPolicy, subjectId);
  return {
    subjectid: subjectId,
    subjectname: clean(subject.SubjectName),
    active: isActivePlatformValue(subject.Active),
    accessmodel: policy.accessModel,
    policyconfigured: policy.configured,
    modulecount: tables.GlobalModuleList.filter(row => normalizePlatformIdentifier(row.SubjectID) === normalizePlatformIdentifier(subjectId)).length,
    deliverystatus: strongestGlobalSubjectDeliveryStatus(tables.GlobalSubjectRuns, subjectId, now),
    dependencies: subjectDependencies(tables, subjectId)
  };
}

function mapPolicy(policy) {
  return {
    subjectpolicyid: clean(policy.SubjectPolicyID),
    subjectid: clean(policy.SubjectID),
    accessmodel: normalizePlatformIdentifier(policy.AccessModel) || "SUBSCRIPTION",
    active: isActivePlatformValue(policy.Active)
  };
}

function subjectDependencies(tables, subjectId) {
  const requested = normalizePlatformIdentifier(subjectId);
  return {
    subscriptions: countActiveGlobalSubjectSubscriptions(tables.GlobalSubjectAccessMatrix, requested),
    resources: tables.GlobalResources.filter(row => normalizePlatformIdentifier(row.SubjectID) === requested).length,
    runs: tables.GlobalSubjectRuns.filter(row => normalizePlatformIdentifier(row.SubjectID) === requested).length
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

function changedRecordFields(existing, next, keys) {
  return keys.filter(key => String(existing?.[key] ?? "") !== String(next?.[key] ?? ""));
}

function readGlobalCurriculumVersion(configRows) {
  const matches = (configRows || []).filter(row => (
    normalizePlatformIdentifier(row.ConfigKey) === "GLOBALCURRICULUMVERSION"
  ));
  const value = Number(matches[0]?.ConfigValue);
  if (matches.length !== 1 || !Number.isInteger(value) || value < 1) {
    throw new Error("PlatformConfig GlobalCurriculumVersion must resolve exactly once as a positive integer");
  }
  return { value, rowNumber: matches[0]._rowNumber };
}

function readPlatformTimezone(configRows) {
  const matches = (configRows || []).filter(row => normalizePlatformIdentifier(row.ConfigKey) === PLATFORM_TIMEZONE_CONFIG_KEY);
  if (matches.length !== 1) throw new Error("PlatformConfig PlatformTimezone must resolve exactly once");
  const timezone = clean(matches[0].ConfigValue);
  if (!isValidIanaTimezone(timezone)) throw new Error("PlatformConfig PlatformTimezone must be a valid IANA timezone");
  return timezone;
}

function existingTimezoneCandidate(runId, runRows) {
  if (!clean(runId)) return "";
  const key = normalizePlatformIdentifier(runId);
  const matches = (runRows || []).filter(row => normalizePlatformIdentifier(row.RunID) === key);
  return matches.length === 1 ? clean(matches[0].Timezone) : "";
}

function recordToRow(record, headers) {
  return headers.map(header => record?.[header] ?? "");
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

function clientError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function deliveryMutationError(error, env) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    return json({ success: false, error: clean(error.message) }, error.status);
  }
  return deliveryError(error, env);
}

function deliveryError(error, env) {
  const response = { success: false, error: "Global-subject Delivery service is not ready" };
  if (String(env.M4L_ACCOUNT_AUTH_DIAGNOSTICS || "").trim().toLowerCase() === "true") {
    response.detail = clean(error?.message || "Delivery service error").replace(/[\r\n\t]+/g, " ").slice(0, 180);
  }
  return json(response, 503);
}

function clean(value) {
  return String(value ?? "").trim();
}

  return { getPlatformGlobalDeliveryEndpoint, savePlatformGlobalSubjectPolicyEndpoint, savePlatformGlobalSubjectRunEndpoint, migratePlatformGlobalCourseAccessEndpoint, migratePlatformGlobalCourseSchedulingEndpoint };
}

export const { getPlatformGlobalDeliveryEndpoint, savePlatformGlobalSubjectPolicyEndpoint, savePlatformGlobalSubjectRunEndpoint, migratePlatformGlobalCourseAccessEndpoint, migratePlatformGlobalCourseSchedulingEndpoint } = createGlobalDeliveryEndpoints();
