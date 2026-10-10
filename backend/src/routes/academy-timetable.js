/* M4L V104.5.4 - Academy timetable resolves Course-labelled explicit and derived Global Course publications. */

import { getAuthUser } from "../lib/auth.js";
import { buildAcademyCalendarEvents } from "../lib/academy-calendar.js";
import { canAccountAccessGlobalSubject, dateInTimezone, hasActiveGlobalSubjectSubscription, isValidIanaTimezone } from "../lib/global-subject-delivery.js";
import { resolveCurrentPublishedGlobalTimetable } from "../lib/global-timetable.js";
import { batchReadGoogleSheetValues } from "../lib/google-sheets.js";
import { json } from "../lib/http.js";
import {
  readPlatformSheets
} from "../lib/platform-sheet.js";
import {
  isActivePlatformValue,
  normalizePlatformIdentifier
} from "../lib/platform-schema.js";
import {
  PUBLISHED_TIMETABLE_SESSION_SHEET,
  TIMETABLE_PUBLICATION_SHEET,
  TIMETABLE_STATE_SHEET,
  resolveCurrentPublishedTimetable
} from "../lib/timetable-publication.js";
import { buildTimetableResponse } from "./timetable.js";
import {
  getSystemConfigValue,
  getTimetableLiveSource,
  GLOBAL_ZOOM_LINK_KEY,
  TIMETABLE_SOURCE_PUBLISHED,
} from "../lib/system-config.js";

const FULL_RANGE = "A:ZZ";
const DEFAULT_VIEW_DAYS = 2;
const MAX_VIEW_DAYS = 14;
const COURSE_ROLE_ORDER = Object.freeze({ ADMIN: 1, SENIOR: 2, TEACHER: 3, STUDENT: 4 });
const DAY_INDEX = Object.freeze({ SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 });
const DAY_ALIASES = Object.freeze({
  SUNDAY: "SUN", SUN: "SUN",
  MONDAY: "MON", MON: "MON",
  TUESDAY: "TUE", TUE: "TUE", TUES: "TUE",
  WEDNESDAY: "WED", WED: "WED",
  THURSDAY: "THU", THU: "THU", THUR: "THU", THURS: "THU",
  FRIDAY: "FRI", FRI: "FRI",
  SATURDAY: "SAT", SAT: "SAT"
});

export async function getAcademyTimetableEndpoint(request, env) {
  try {
    const authUser = await getAuthUser(request, env);
    if (!authUser || authUser.type !== "account") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await readJsonBody(request);
    const platform = await loadPlatformAcademyState(env);
    const account = platform.accounts.find(row => (
      normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(authUser.accountid)
    ));
    if (!account || !isActivePlatformValue(account.Active)) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const timezone = resolvePlatformTimezone(platform.config);
    const now = new Date();
    const clock = academyClockInTimezone(now, timezone);
    const viewStart = validIsoDate(body.startDate) ? String(body.startDate).trim() : clock.date;
    const viewDays = resolveAcademyViewDays(body.days);
    const viewEnd = addDays(viewStart, viewDays - 1);
    const weeks = academyWeeksForRange(viewStart, viewEnd, timezone, now);
    const week = weeks[0];
    const isGlobalAdmin = normalizePlatformIdentifier(account.PlatformRole) === "GLOBAL_ADMIN";
    const memberships = platform.courseAccess.filter(row => (
      normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(account.AccountID) &&
      isActivePlatformValue(row.Active)
    ));

    const activePrograms = platform.courses.filter(row => isActivePlatformValue(row.Active));
    const programLoads = await Promise.all(activePrograms.map(async course => {
      try {
        const events = await loadProgramEvents(env, course, memberships, {
          account,
          isGlobalAdmin,
          weeks,
          currentDate: clock.date,
          currentMinutes: clock.minutes
        });
        return {
          events,
          warning: null
        };
      } catch (error) {
        return {
          events: [],
          warning: {
            code: "PROGRAM_TIMETABLE_UNAVAILABLE",
            program: String(course.CourseName || course.CourseID || "Program").trim(),
            message: "This Program timetable is temporarily unavailable."
          }
        };
      }
    }));
    const programEvents = programLoads.flatMap(result => result.events);
    const warnings = programLoads.map(result => result.warning).filter(Boolean);

    const globalRange = {
      start: week.start,
      end: weeks[weeks.length - 1].end,
      today: clock.date
    };
    const globalEvents = buildGlobalCourseEvents(platform, account, {
      isGlobalAdmin,
      week: globalRange,
      currentDate: clock.date,
      currentMinutes: clock.minutes
    });
    const sessions = [...programEvents, ...globalEvents]
      .filter(event => String(event.date || "") >= viewStart && String(event.date || "") <= viewEnd)
      .sort(compareAcademyEvents)
      .map((event, index) => ({ ...event, eventKey: `AE${String(index + 1).padStart(4, "0")}` }));
    const calendarEvents = buildAcademyCalendarEvents(platform.academyCalendar, viewStart, viewEnd);

    return json({
      success: true,
      version: "104.5.4",
      timezone,
      weekStart: week.start,
      weekEnd: weeks[weeks.length - 1].end,
      viewStart,
      viewEnd,
      viewDays,
      today: clock.date,
      sessions,
      calendarEvents,
      warnings,
      count: sessions.length
    });
  } catch (error) {
    console.error("Academy timetable failed", error);
    return json({
      success: false,
      error: "The Academy timetable could not be loaded.",
      code: "ACADEMY_TIMETABLE_UNAVAILABLE",
      retryable: true,
      sessions: []
    }, 503);
  }
}

async function loadPlatformAcademyState(env) {
  const tables = await readPlatformSheets(env, [
    "PlatformConfig",
    "UserAccounts",
    "CourseRegistry",
    "UserCourseAccess",
    "GlobalSubjectList",
    "GlobalSubjectAccessPolicy",
    "GlobalSubjectAccessMatrix",
    "GlobalSubjectRuns",
    "GlobalTimetableRunState",
    "GlobalTimetablePublications",
    "GlobalTimetableSessionLifecycle",
    "PublishedGlobalTimetableSessions",
    "AcademyCalendar"
  ]);
  return {
    config: tables.PlatformConfig,
    accounts: tables.UserAccounts,
    courses: tables.CourseRegistry,
    courseAccess: tables.UserCourseAccess,
    subjects: tables.GlobalSubjectList,
    policies: tables.GlobalSubjectAccessPolicy,
    matrix: tables.GlobalSubjectAccessMatrix,
    runs: tables.GlobalSubjectRuns,
    academyCalendar: tables.AcademyCalendar,
    GlobalTimetableRunState: tables.GlobalTimetableRunState,
    GlobalTimetablePublications: tables.GlobalTimetablePublications,
    GlobalTimetableSessionLifecycle: tables.GlobalTimetableSessionLifecycle,
    PublishedGlobalTimetableSessions: tables.PublishedGlobalTimetableSessions
  };
}

async function loadProgramEvents(env, course, memberships, options) {
  const spreadsheetId = String(course.SpreadsheetID || "").trim();
  if (!spreadsheetId) return [];
  const courseId = String(course.CourseID || "").trim();
  const courseName = String(course.CourseName || courseId || "Program").trim();
  const courseMemberships = memberships.filter(row => (
    normalizePlatformIdentifier(row.CourseID) === normalizePlatformIdentifier(courseId)
  ));
  const accessPlan = buildProgramAccessPlan(courseMemberships, options);
  const profileRanges = ["SystemConfig!A:E"];
  if (accessPlan.needsStudent) profileRanges.push("StudentRecords!A:K");
  if (accessPlan.needsStaff) profileRanges.push("AdminRecords!A:ZZ");
  const profileSets = await batchReadGoogleSheetValues(env, profileRanges, { spreadsheetId });
  let profileIndex = 0;
  const systemRows = profileSets[profileIndex++] || [];
  const studentRows = accessPlan.needsStudent ? (profileSets[profileIndex++] || []) : [];
  const accessAdminRows = accessPlan.needsStaff ? (profileSets[profileIndex++] || []) : [];
  const access = resolveProgramAccess(courseMemberships, options, {
    studentRows,
    adminRows: accessAdminRows
  });
  const liveSource = getTimetableLiveSource(systemRows);
  const globalZoomLink = getSystemConfigValue(systemRows, GLOBAL_ZOOM_LINK_KEY);
  let sessions = [];

  if (liveSource === TIMETABLE_SOURCE_PUBLISHED) {
    const [stateRows, publicationRows, snapshotRows] = await batchReadGoogleSheetValues(env, [
      `${TIMETABLE_STATE_SHEET}!${FULL_RANGE}`,
      `${TIMETABLE_PUBLICATION_SHEET}!${FULL_RANGE}`,
      `${PUBLISHED_TIMETABLE_SESSION_SHEET}!${FULL_RANGE}`
    ], { spreadsheetId });
    const current = resolveCurrentPublishedTimetable({ stateRows, publicationRows, publishedSessionRows: snapshotRows }, courseId, {
      requireCurrentHeaders: true,
      requireDisplayValues: true
    });
    if (!current.ok) return [];
    sessions = current.sessions.map(item => ({
      dayofweek: item.dayofweek,
      starttime: item.starttime,
      endtime: item.endtime,
      subjectname: item.subjectname,
      modulename: item.modulename,
      groupno: item.groupno,
      teacherid: item.teacherid,
      teachername: item.teachername,
      zoomlink: item.zoomlink
    }));
  } else {
    const legacyRanges = ["TeacherAssign!A:ZZ"];
    const reuseAccessAdmins = accessPlan.needsStaff;
    if (!reuseAccessAdmins) legacyRanges.push("AdminRecords!A:ZZ");
    legacyRanges.push("SubjectList!A:ZZ", "ModuleList!A:ZZ");
    const legacySets = await batchReadGoogleSheetValues(env, legacyRanges, { spreadsheetId });
    let legacyIndex = 0;
    const teacherRows = legacySets[legacyIndex++] || [];
    const adminRows = reuseAccessAdmins ? accessAdminRows : (legacySets[legacyIndex++] || []);
    const subjectRows = legacySets[legacyIndex++] || [];
    const moduleRows = legacySets[legacyIndex++] || [];
    const transformed = buildTimetableResponse(teacherRows, {
      adminRows,
      subjectRows,
      moduleRows,
      globalZoomLink,
      globalZoomConfigured: Boolean(globalZoomLink),
      groupNo: "ALL",
      teacherId: "ALL",
      allGroupsStudent: true,
      showGroupLabels: true
    });
    if (!transformed.success) return [];
    sessions = transformed.sessions;
  }

  const weeks = Array.isArray(options.weeks) && options.weeks.length ? options.weeks : [];
  return weeks.flatMap(week => sessions.map(session => programSessionToAcademyEvent(session, {
    courseId,
    courseName,
    access,
    week,
    globalZoomLink,
    currentDate: options.currentDate,
    currentMinutes: options.currentMinutes
  })).filter(Boolean));
}

function buildProgramAccessPlan(memberships, options) {
  if (options.isGlobalAdmin) {
    return { needsStudent: false, needsStaff: false };
  }

  const candidates = (Array.isArray(memberships) ? memberships : [])
    .filter(row => isActivePlatformValue(row.Active) && COURSE_ROLE_ORDER[normalizePlatformIdentifier(row.Role)]);
  return {
    needsStudent: candidates.some(row => normalizePlatformIdentifier(row.Role) === "STUDENT"),
    needsStaff: candidates.some(row => ["ADMIN", "SENIOR", "TEACHER"].includes(normalizePlatformIdentifier(row.Role)))
  };
}

function resolveProgramAccess(memberships, options, profiles = {}) {
  if (options.isGlobalAdmin) {
    return { level: "GLOBAL_ADMIN", roles: new Set(["GLOBAL_ADMIN"]), studentGroup: "", teacherIds: new Set() };
  }

  const candidates = (Array.isArray(memberships) ? memberships : [])
    .filter(row => isActivePlatformValue(row.Active) && COURSE_ROLE_ORDER[normalizePlatformIdentifier(row.Role)]);
  if (!candidates.length) {
    return { level: "NONE", roles: new Set(), studentGroup: "", teacherIds: new Set() };
  }

  const needsStudent = candidates.some(row => normalizePlatformIdentifier(row.Role) === "STUDENT");
  const needsStaff = candidates.some(row => ["ADMIN", "SENIOR", "TEACHER"].includes(normalizePlatformIdentifier(row.Role)));
  const studentRows = needsStudent ? (profiles.studentRows || []) : [];
  const adminRows = needsStaff ? (profiles.adminRows || []) : [];

  if (needsStudent) {
    assertAcademyLegacyHeaders(studentRows?.[0], [
      [0, "StudentID"],
      [3, "UniqueID"],
      [6, "ClassGroup"],
      [10, "Active"]
    ], "StudentRecords");
  }
  if (needsStaff) {
    assertAcademyLegacyHeaders(adminRows?.[0], [
      [0, "AdminID"],
      [2, "UniqueID"],
      [5, "Role"],
      [7, "Active"]
    ], "AdminRecords");
  }

  const accountUniqueId = normalizePlatformIdentifier(options.account?.UniqueID);
  const validated = [];
  for (const membership of candidates) {
    const role = normalizePlatformIdentifier(membership.Role);
    const courseRecordId = normalizePlatformIdentifier(membership.CourseRecordID);
    if (!courseRecordId || !accountUniqueId) continue;

    if (role === "STUDENT") {
      const matches = studentRows.slice(1).filter(row => normalizePlatformIdentifier(row?.[0]) === courseRecordId);
      if (matches.length !== 1) continue;
      const row = matches[0];
      if (
        normalizePlatformIdentifier(row?.[3]) !== accountUniqueId ||
        !isActivePlatformValue(row?.[10])
      ) continue;
      validated.push({ role, courseRecordId, studentGroup: String(row?.[6] ?? "").trim() });
      continue;
    }

    if (["ADMIN", "SENIOR", "TEACHER"].includes(role)) {
      const matches = adminRows.slice(1).filter(row => normalizePlatformIdentifier(row?.[0]) === courseRecordId);
      if (matches.length !== 1) continue;
      const row = matches[0];
      if (
        normalizePlatformIdentifier(row?.[2]) !== accountUniqueId ||
        normalizePlatformIdentifier(row?.[5]) !== role ||
        !isActivePlatformValue(row?.[7])
      ) continue;
      validated.push({ role, courseRecordId, studentGroup: "" });
    }
  }

  if (!validated.length) {
    return { level: "NONE", roles: new Set(), studentGroup: "", teacherIds: new Set() };
  }

  const roles = new Set(validated.map(item => item.role));
  const teacherIds = new Set(validated
    .filter(item => ["ADMIN", "SENIOR", "TEACHER"].includes(item.role))
    .map(item => item.courseRecordId));
  const student = validated.find(item => item.role === "STUDENT");
  const studentGroup = String(student?.studentGroup ?? "").trim();
  const level = [...roles].sort((a, b) => COURSE_ROLE_ORDER[a] - COURSE_ROLE_ORDER[b])[0] || "NONE";
  return { level, roles, studentGroup, teacherIds };
}

function assertAcademyLegacyHeaders(headers, required, sheetName) {
  const row = Array.isArray(headers) ? headers : [];
  for (const [index, expected] of required) {
    if (normalizeAcademyHeader(row[index]) !== normalizeAcademyHeader(expected)) {
      throw new Error(`${sheetName} header mismatch`);
    }
  }
}

function normalizeAcademyHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function programSessionToAcademyEvent(session, options) {
  const date = dayOfWeekDate(options.week.start, session.dayofweek);
  if (!date) return null;
  const group = String(session.groupno || "ALL").trim() || "ALL";
  const teacherId = normalizePlatformIdentifier(session.teacherid);
  const access = options.access;
  let visibilityLevel = "LABEL";
  let relevant = false;

  if (access.level === "GLOBAL_ADMIN") {
    visibilityLevel = "DETAIL";
  } else if (access.roles.has("ADMIN") || access.roles.has("SENIOR") || access.roles.has("TEACHER")) {
    visibilityLevel = "DETAIL";
    relevant = access.teacherIds.has(teacherId);
  } else if (access.roles.has("STUDENT")) {
    const groupKey = normalizePlatformIdentifier(group);
    const studentGroup = normalizePlatformIdentifier(access.studentGroup);
    const matches = studentGroup === "0" || groupKey === "ALL" || (studentGroup && groupKey === studentGroup);
    if (matches) {
      visibilityLevel = "DETAIL";
      relevant = true;
    }
  }

  const startTime = normalizeStoredTime(session.starttime);
  const endTime = normalizeStoredTime(session.endtime);
  const isCurrent = isAcademySessionCurrent({
    date,
    startTime,
    endTime,
    status: "SCHEDULED"
  }, options.currentDate, options.currentMinutes);
  const canOpenZoom = visibilityLevel === "DETAIL" && relevant && isCurrent;
  const base = {
    kind: "PROGRAM",
    date,
    startTime,
    endTime,
    visibilityLevel,
    relevant,
    isCurrent,
    canOpenZoom,
    status: "SCHEDULED",
    title: visibilityLevel === "DETAIL"
      ? String(session.subjectname || options.courseName).trim()
      : options.courseName
  };
  if (visibilityLevel !== "DETAIL") return base;

  return {
    ...base,
    programName: options.courseName,
    subjectName: String(session.subjectname || "").trim(),
    moduleName: String(session.modulename || "").trim(),
    group: group,
    teacherName: String(session.teachername || "").trim(),
    zoomLink: canOpenZoom ? String(session.zoomlink || options.globalZoomLink || "").trim() : ""
  };
}

function canAccountAccessGlobalCourse({ account, run, subject, policyRows, accessRows }) {
  const accessModel = normalizePlatformIdentifier(run?.AccessModel);
  if (accessModel === "FREE") return Boolean(account && isActivePlatformValue(account.Active));
  if (accessModel === "PAID") {
    // V103.1.0.5 transition: the unified per-Course role matrix lands in V103.2.
    // Until then, PAID must never inherit a FREE Global Subject policy. Require
    // an explicit existing matrix entitlement for the linked Global Subject.
    if (!account || !subject || !isActivePlatformValue(account.Active) || !isActivePlatformValue(subject.Active)) return false;
    return hasActiveGlobalSubjectSubscription(accessRows, account.AccountID, subject.SubjectID);
  }
  // Pre-migration 102.0.8 rows keep the established Global Subject policy behaviour.
  return canAccountAccessGlobalSubject({ account, subject, policyRows, accessRows });
}

export function buildGlobalCourseEvents(platform, account, options) {
  const subjectMap = new Map(platform.subjects.map(subject => [normalizePlatformIdentifier(subject.SubjectID), subject]));
  const output = [];

  for (const run of platform.runs) {
    const runId = normalizePlatformIdentifier(run?.RunID);
    if (!runId || !isActivePlatformValue(run.Active)) continue;
    const subject = subjectMap.get(normalizePlatformIdentifier(run.SubjectID));
    if (!subject || !isActivePlatformValue(subject.Active)) continue;

    const resolved = resolveCurrentPublishedGlobalTimetable(platform, runId, {
      startDate: options.week.start,
      endDate: options.week.end
    });
    if (!resolved.ok) continue;

    const policyAccess = canAccountAccessGlobalCourse({
      account,
      run,
      subject,
      policyRows: platform.policies,
      accessRows: platform.matrix
    });
    const lifecycleBySession = new Map((resolved.lifecycles || []).map(item => [normalizePlatformIdentifier(item?.sessionid), item]));
    // Course identity is the primary Academy label. Prefer the immutable
    // publication/snapshot display value so a later draft rename cannot rewrite
    // an already-published timetable. Older explicit publications may not have
    // RunName on the publication row, so fall back to the immutable session copy.
    const publishedCourseName = String(
      resolved.publication?.runname ||
      resolved.sessions.find(item => String(item?.runname || "").trim())?.runname ||
      run.RunName ||
      subject.SubjectName ||
      "Global Course"
    ).trim();
    for (const session of resolved.sessions) {
      if (session.sessiondate < options.week.start || session.sessiondate > options.week.end) continue;
      const assignedTeacher = options.allowAssignedTeacher !== false && normalizePlatformIdentifier(session.teacheraccountid) === normalizePlatformIdentifier(account.AccountID);
      const detail = options.isGlobalAdmin || policyAccess || assignedTeacher;
      const lifecycle = lifecycleBySession.get(normalizePlatformIdentifier(session.sourcesessionid));
      const status = normalizePlatformIdentifier(lifecycle?.status || "SCHEDULED") || "SCHEDULED";
      const relevant = assignedTeacher || policyAccess;
      const isCurrent = isAcademySessionCurrent({
        date: session.sessiondate,
        startTime: session.starttime,
        endTime: session.endtime,
        status
      }, options.currentDate, options.currentMinutes);
      const canOpenZoom = detail && relevant && status === "SCHEDULED" && isCurrent;
      const base = {
        kind: "GLOBAL",
        date: session.sessiondate,
        startTime: session.starttime,
        endTime: session.endtime,
        visibilityLevel: detail ? "DETAIL" : "LABEL",
        relevant,
        isCurrent,
        canOpenZoom,
        status,
        title: publishedCourseName
      };
      if (!detail) {
        output.push(base);
        continue;
      }
      output.push({
        ...base,
        subjectName: session.subjectname,
        moduleName: session.modulename,
        teacherName: session.teachername,
        sessionDescription: session.sessiondescription || "",
        zoomLink: canOpenZoom ? session.zoomlink : ""
      });
    }
  }
  return output;
}

export function resolveAcademyViewDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_VIEW_DAYS;
  return Math.min(parsed, MAX_VIEW_DAYS);
}

export function academyWeeksForRange(startDate, endDate, timezone, now = new Date()) {
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || endDate < startDate) {
    throw new Error("Academy timetable range is invalid");
  }
  const weeks = [];
  let cursor = resolveAcademyWeek(startDate, timezone, now);
  while (cursor.start <= endDate) {
    weeks.push(cursor);
    const nextStart = addDays(cursor.end, 1);
    if (nextStart > endDate) break;
    cursor = resolveAcademyWeek(nextStart, timezone, now);
  }
  return weeks;
}

export function academyClockInTimezone(now, timezone) {
  if (!isValidIanaTimezone(timezone)) throw new Error("PlatformTimezone is invalid");
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error("Academy timetable requires a valid current time");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Object.freeze({
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: (Number(values.hour) * 60) + Number(values.minute)
  });
}

export function isAcademySessionCurrent(session, currentDate, currentMinutes) {
  if (normalizePlatformIdentifier(session?.status || "SCHEDULED") !== "SCHEDULED") return false;
  if (!currentDate || String(session?.date || "") !== String(currentDate)) return false;
  if (!Number.isFinite(Number(currentMinutes))) return false;
  const start = timeToMinutes(session?.startTime);
  const end = timeToMinutes(session?.endTime);
  if (start === null || end === null || start === end) return false;
  const nowMinutes = Number(currentMinutes);
  if (end > start) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

export function resolveAcademyWeek(requestedStart, timezone, now = new Date()) {
  if (!isValidIanaTimezone(timezone)) throw new Error("PlatformTimezone is invalid");
  const today = dateInTimezone(now, timezone);
  const start = validIsoDate(requestedStart) ? mondayForDate(String(requestedStart)) : mondayForDate(today);
  return Object.freeze({ start, end: addDays(start, 6), today });
}

function resolvePlatformTimezone(configRows) {
  const matches = configRows.filter(row => normalizePlatformIdentifier(row.ConfigKey) === "PLATFORMTIMEZONE");
  if (matches.length !== 1) throw new Error("PlatformTimezone must resolve exactly once");
  const timezone = String(matches[0].ConfigValue || "").trim();
  if (!isValidIanaTimezone(timezone)) throw new Error("PlatformTimezone is invalid");
  return timezone;
}

function dayOfWeekDate(weekStart, value) {
  const alias = DAY_ALIASES[normalizePlatformIdentifier(value)];
  if (!alias) return "";
  const mondayIndex = DAY_INDEX[alias] === 0 ? 6 : DAY_INDEX[alias] - 1;
  return addDays(weekStart, mondayIndex);
}

function mondayForDate(dateText) {
  const date = parseDate(dateText);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return formatDate(date);
}

function addDays(dateText, days) {
  const date = parseDate(dateText);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return formatDate(date);
}

function parseDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function validIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return formatDate(parseDate(text)) === text;
}

function normalizeStoredTime(value) {
  const text = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : text;
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
}

function compareAcademyEvents(left, right) {
  return String(left.date || "").localeCompare(String(right.date || "")) ||
    academyEventTimeSortValue(left.startTime) - academyEventTimeSortValue(right.startTime) ||
    String(left.startTime || "").localeCompare(String(right.startTime || "")) ||
    String(left.title || "").localeCompare(String(right.title || ""));
}

function academyEventTimeSortValue(value) {
  const match = /^(\d{1,2})(?::|h)(\d{2})/.exec(String(value || "").trim());
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return Number.MAX_SAFE_INTEGER;
  }
  return (hour * 60) + minute;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}
