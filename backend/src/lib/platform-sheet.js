/* M4L V105.1 - Keep generic Program setup out of legacy course routing. */

import { batchReadGoogleSheetValues, readGoogleSheetValues } from "./google-sheets.js";
import {
  authorityRank,
  isGlobalAdminAccount,
  isActivePlatformValue,
  normalizePlatformIdentifier,
  PLATFORM_SHEET_HEADERS,
  validatePlatformSheetRows
} from "./platform-schema.js";

export function getPlatformSpreadsheetId(env) {
  const spreadsheetId = String(env.PLATFORM_SPREADSHEET_ID || "").trim();
  if (!spreadsheetId) {
    throw new Error("Missing PLATFORM_SPREADSHEET_ID Worker variable");
  }
  return spreadsheetId;
}

export function getPlatformSheetReadRange(sheetName) {
  const headers = PLATFORM_SHEET_HEADERS[sheetName];
  if (!headers) {
    throw new Error(`Unknown Platform Sheet tab: ${sheetName}`);
  }

  const lastColumn = sheetName === "GlobalSubjectAccessMatrix" ? "ZZ" : columnName(headers.length);
  return `${quoteSheetName(sheetName)}!A:${lastColumn}`;
}

export async function readPlatformSheet(env, sheetName) {
  const rows = await readGoogleSheetValues(
    env,
    getPlatformSheetReadRange(sheetName),
    { spreadsheetId: getPlatformSpreadsheetId(env) }
  );
  return validatePlatformSheetRows(sheetName, rows);
}

export async function readPlatformSheets(env, sheetNames) {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
    throw new Error("Platform batch read requires at least one Sheet tab");
  }

  const normalizedNames = sheetNames.map(name => String(name || "").trim());
  if (normalizedNames.some(name => !name)) {
    throw new Error("Platform batch read Sheet names cannot be empty");
  }
  const uniqueNames = [...new Set(normalizedNames)];
  if (uniqueNames.length !== normalizedNames.length) {
    throw new Error("Platform batch read Sheet names must be unique");
  }

  const ranges = normalizedNames.map(getPlatformSheetReadRange);
  const rowSets = await batchReadGoogleSheetValues(env, ranges, {
    spreadsheetId: getPlatformSpreadsheetId(env)
  });
  const tables = {};
  normalizedNames.forEach((sheetName, index) => {
    tables[sheetName] = validatePlatformSheetRows(sheetName, rowSets[index] || []);
  });
  return tables;
}

export async function resolveActiveCourseRegistration(env, courseId) {
  const requestedCourseID = normalizePlatformIdentifier(courseId);
  if (!requestedCourseID) {
    throw new Error("CourseID is required");
  }

  const matches = (await readPlatformSheet(env, "CourseRegistry")).filter(record => (
    normalizePlatformIdentifier(record.CourseID) === requestedCourseID
  ));

  if (matches.length !== 1) {
    throw new Error("Course registry lookup did not resolve exactly one course");
  }

  const course = matches[0];
  if (String(course.SchemaVersion || "").includes("-program")) {
    throw new Error("Program teaching is not enabled in this release");
  }
  if (!isActivePlatformValue(course.Active)) {
    throw new Error("Course is inactive");
  }

  const spreadsheetId = String(course.SpreadsheetID || "").trim();
  if (!spreadsheetId) {
    throw new Error("Course registry entry is missing SpreadsheetID");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId)) {
    throw new Error("Course registry SpreadsheetID has an invalid format");
  }

  return Object.freeze({
    courseId: String(course.CourseID || "").trim(),
    courseName: String(course.CourseName || "").trim(),
    spreadsheetId,
    schemaVersion: String(course.SchemaVersion || "").trim()
  });
}

export function selectAutomaticCourseContext(accessRecords) {
  const active = (Array.isArray(accessRecords) ? accessRecords : []).filter(record => (
    isActivePlatformValue(record.Active) && authorityRank(record.Role) !== Number.POSITIVE_INFINITY
  ));
  if (active.length === 0) {
    throw new Error("Account has no active course access");
  }

  const highestRank = Math.min(...active.map(record => authorityRank(record.Role)));
  const candidates = active.filter(record => authorityRank(record.Role) === highestRank);
  if (candidates.length === 1) {
    return normalizeContext(candidates[0]);
  }

  const usedCandidates = candidates
    .map(record => ({ record, timestamp: parseTimestamp(record.LastUsedDate) }))
    .filter(item => item.timestamp !== null)
    .sort((left, right) => right.timestamp - left.timestamp);
  if (usedCandidates.length > 0) {
    const latestTimestamp = usedCandidates[0].timestamp;
    const latest = usedCandidates.filter(item => item.timestamp === latestTimestamp);
    if (latest.length !== 1) {
      throw new Error("Highest-authority course access has an ambiguous LastUsedDate");
    }
    return normalizeContext(latest[0].record);
  }

  const defaults = candidates.filter(record => isActivePlatformValue(record.IsDefault));
  if (defaults.length !== 1) {
    throw new Error("Highest-authority course access requires exactly one default context");
  }
  return normalizeContext(defaults[0]);
}

export function selectAutomaticAccountContext(accountRecord, accessRecords) {
  if (isGlobalAdminAccount(accountRecord)) {
    return Object.freeze({
      accessId: "",
      accountId: String(accountRecord.AccountID || "").trim(),
      courseId: "",
      courseRecordId: "",
      role: "GLOBAL_ADMIN",
      scope: "PLATFORM"
    });
  }

  return Object.freeze({
    ...selectAutomaticCourseContext(accessRecords),
    scope: "COURSE"
  });
}

export function assertActiveCourseRoleMembership(accessRecords, accountId, courseId, role) {
  const requestedAccountID = normalizePlatformIdentifier(accountId);
  const requestedCourseID = normalizePlatformIdentifier(courseId);
  const requestedRole = normalizePlatformIdentifier(role);
  if (!requestedAccountID || !requestedCourseID || authorityRank(requestedRole) === Number.POSITIVE_INFINITY) {
    throw new Error("AccountID, CourseID and a valid role are required");
  }

  const matches = (Array.isArray(accessRecords) ? accessRecords : []).filter(record => (
    normalizePlatformIdentifier(record.AccountID) === requestedAccountID &&
    normalizePlatformIdentifier(record.CourseID) === requestedCourseID &&
    normalizePlatformIdentifier(record.Role) === requestedRole &&
    isActivePlatformValue(record.Active)
  ));
  if (matches.length !== 1) {
    throw new Error("Active course-role membership did not resolve exactly once");
  }
  return normalizeContext(matches[0]);
}

export function assertActiveGlobalSubjectAccess(accessRecords, accountId, subjectId) {
  const requestedAccountID = normalizePlatformIdentifier(accountId);
  const requestedSubjectID = normalizePlatformIdentifier(subjectId);
  if (!requestedAccountID || !requestedSubjectID) {
    throw new Error("AccountID and global SubjectID are required");
  }

  const matches = (Array.isArray(accessRecords) ? accessRecords : []).filter(record => (
    normalizePlatformIdentifier(record.AccountID) === requestedAccountID &&
    normalizePlatformIdentifier(record.SubjectID) === requestedSubjectID &&
    isActivePlatformValue(record.Active)
  ));
  if (matches.length !== 1) {
    throw new Error("Active global-subject access did not resolve exactly once");
  }

  const access = matches[0];
  const subjectAccessId = String(access.SubjectAccessID || "").trim();
  if (!subjectAccessId) {
    throw new Error("Active global-subject access is missing SubjectAccessID");
  }
  return Object.freeze({
    subjectAccessId,
    accountId: String(access.AccountID || "").trim(),
    subjectId: String(access.SubjectID || "").trim()
  });
}

export function assertCourseContextAccess(
  accountRecord,
  accessRecords,
  accountId,
  courseId,
  role
) {
  const requestedAccountID = normalizePlatformIdentifier(accountId);
  const requestedCourseID = normalizePlatformIdentifier(courseId);
  const accountRecordID = normalizePlatformIdentifier(accountRecord?.AccountID);
  if (!requestedAccountID || !requestedCourseID || requestedAccountID !== accountRecordID) {
    throw new Error("AccountID and CourseID must match the authenticated account context");
  }

  if (isGlobalAdminAccount(accountRecord)) {
    return Object.freeze({
      accessId: "",
      accountId: String(accountRecord.AccountID || "").trim(),
      courseId: String(courseId || "").trim(),
      courseRecordId: "",
      role: "GLOBAL_ADMIN",
      scope: "COURSE"
    });
  }

  return Object.freeze({
    ...assertActiveCourseRoleMembership(accessRecords, accountId, courseId, role),
    scope: "COURSE"
  });
}

function normalizeContext(record) {
  return Object.freeze({
    accessId: String(record.AccessID || "").trim(),
    accountId: String(record.AccountID || "").trim(),
    courseId: String(record.CourseID || "").trim(),
    courseRecordId: String(record.CourseRecordID || "").trim(),
    role: normalizePlatformIdentifier(record.Role)
  });
}

function parseTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function quoteSheetName(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
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
