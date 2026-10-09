import {
  appendGoogleSheetValues,
  batchUpdateGoogleSheetValues,
  readGoogleSheetValues
} from "./google-sheets.js";

export const SYSTEM_CONFIG_SHEET = "SystemConfig";
export const STUDENT_LOGIN_BASE_KEY = "StudentLoginBaseUrl";
export const WEEKLY_PLANNER_DRIVE_FOLDER_ID_KEY = "WeeklyPlannerDriveFolderId";
export const WEEKLY_PLANNER_DRIVE_FOLDER_LABEL_KEY = "WeeklyPlannerDriveFolderLabel";
export const PROGRAM_LIBRARY_DRIVE_FOLDER_ID_KEY = "ProgramLibraryDriveFolderId";
export const PROGRAM_LIBRARY_PREVIOUS_FOLDER_IDS_KEY = "ProgramLibraryPreviousFolderIds";
export const GLOBAL_ZOOM_LINK_KEY = "GlobalZoomLink";
export const TIMETABLE_LIVE_SOURCE_KEY = "TimetableLiveSource";
export const TIMETABLE_SOURCE_TEACHER_ASSIGN = "TEACHER_ASSIGN";
export const TIMETABLE_SOURCE_PUBLISHED = "PUBLISHED_TIMETABLE";
export const DEFAULT_WEEKLY_PLANNER_DRIVE_FOLDER_LABEL = "Weekly Planner";

const SYSTEM_CONFIG_RANGE = `${SYSTEM_CONFIG_SHEET}!A:E`;
const DRIVE_FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;

export async function readSystemConfigRows(env) {
  return readGoogleSheetValues(env, SYSTEM_CONFIG_RANGE);
}

export function getSystemConfigValue(rows, key) {
  const targetKey = clean(key);

  if (!targetKey || !Array.isArray(rows)) return "";

  const row = rows.find(item => clean(item?.[0]) === targetKey);
  return row ? clean(row[1]) : "";
}

export function findSystemConfigRowIndexes(rows, key) {
  const targetKey = clean(key);
  const indexes = [];

  if (!targetKey || !Array.isArray(rows)) return indexes;

  rows.forEach((row, index) => {
    if (clean(row?.[0]) === targetKey) {
      indexes.push(index);
    }
  });

  return indexes;
}

export function getTimetableLiveSource(rows) {
  const matches = findSystemConfigRowIndexes(rows, TIMETABLE_LIVE_SOURCE_KEY);

  if (matches.length > 1) {
    throw new Error(`SystemConfig contains duplicate ${TIMETABLE_LIVE_SOURCE_KEY} rows`);
  }

  const value = matches.length === 1
    ? getSystemConfigValue(rows, TIMETABLE_LIVE_SOURCE_KEY)
    : TIMETABLE_SOURCE_TEACHER_ASSIGN;
  const normalized = clean(value).toUpperCase();

  if (normalized === TIMETABLE_SOURCE_TEACHER_ASSIGN || normalized === TIMETABLE_SOURCE_PUBLISHED) {
    return normalized;
  }

  throw new Error(
    `${TIMETABLE_LIVE_SOURCE_KEY} must be ${TIMETABLE_SOURCE_TEACHER_ASSIGN} or ${TIMETABLE_SOURCE_PUBLISHED}`
  );
}

export async function upsertSystemConfigValues(env, valuesByKey, options = {}) {
  const entries = valuesByKey instanceof Map
    ? Array.from(valuesByKey.entries())
    : Object.entries(valuesByKey || {});
  const rows = Array.isArray(options.rows)
    ? options.rows
    : await readSystemConfigRows(env);
  const updatedAt = clean(options.updatedAt) || new Date().toISOString();
  const updatedBy = clean(options.updatedBy) || "SYSTEM";
  const updatedByName = clean(options.updatedByName) || updatedBy;
  const updates = [];
  const appends = [];

  for (const [rawKey, rawValue] of entries) {
    const key = clean(rawKey);
    if (!key) continue;

    const rowIndexes = findSystemConfigRowIndexes(rows, key);

    if (rowIndexes.length > 1) {
      return {
        ok: false,
        status: 409,
        error: `SystemConfig contains duplicate ${key} rows`
      };
    }

    const value = clean(rawValue);

    if (rowIndexes.length === 1) {
      const sheetRow = rowIndexes[0] + 1;
      updates.push({
        range: `${SYSTEM_CONFIG_SHEET}!B${sheetRow}:E${sheetRow}`,
        majorDimension: "ROWS",
        values: [[value, updatedAt, updatedBy, updatedByName]]
      });
    } else {
      appends.push([key, value, updatedAt, updatedBy, updatedByName]);
    }
  }

  if (updates.length > 0) {
    await batchUpdateGoogleSheetValues(env, updates);
  }

  if (appends.length > 0) {
    await appendGoogleSheetValues(env, `${SYSTEM_CONFIG_SHEET}!A:E`, appends);
  }

  return { ok: true, updatedAt, updatedBy, updatedByName };
}

export async function getStudentLoginBaseUrl(env) {
  const rows = await readSystemConfigRows(env);
  const storedValue = getSystemConfigValue(rows, STUDENT_LOGIN_BASE_KEY);
  const fallbackValue = clean(env?.M4L_STUDENT_LOGIN_BASE);
  const value = storedValue || fallbackValue;

  if (!value) {
    throw new Error("Student login URL is not configured in System Settings");
  }

  return normalizeStudentLoginBaseUrl(value);
}

export function normalizeStudentLoginBaseUrl(value) {
  const text = clean(value);

  if (!text) {
    throw new Error("Student login URL is required");
  }

  let url;

  try {
    url = new URL(text);
  } catch {
    throw new Error("Enter a valid Student login URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Student login URL must use https://");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("Student login URL cannot contain credentials, a query or a fragment");
  }

  url.pathname = ensureTrailingSlash(url.pathname || "/");
  return url.toString();
}

export function normalizeGlobalZoomLink(value) {
  const text = clean(value);

  if (!text) return "";

  let url;

  try {
    url = new URL(text);
  } catch {
    throw new Error("Enter a valid global Zoom link");
  }

  if (url.protocol !== "https:") {
    throw new Error("Global Zoom link must use https://");
  }

  if (url.username || url.password) {
    throw new Error("Global Zoom link cannot contain credentials");
  }

  return url.toString();
}

export function extractGoogleDriveFolderId(value) {
  const text = clean(value);

  if (!text) {
    throw new Error("Weekly Planner Google Drive folder is required");
  }

  if (DRIVE_FOLDER_ID_PATTERN.test(text)) {
    return text;
  }

  let url;

  try {
    url = new URL(text);
  } catch {
    throw new Error("Enter a valid Google Drive folder URL or folder ID");
  }

  if (url.protocol !== "https:" || url.hostname !== "drive.google.com") {
    throw new Error("Enter a Google Drive folder URL or folder ID");
  }

  const folderPathMatch = url.pathname.match(/\/drive\/folders\/([A-Za-z0-9_-]+)/);
  const candidate = folderPathMatch ? folderPathMatch[1] : clean(url.searchParams.get("id"));

  if (!DRIVE_FOLDER_ID_PATTERN.test(candidate)) {
    throw new Error("The Google Drive folder URL does not contain a valid folder ID");
  }

  return candidate;
}

export function buildGoogleDriveFolderUrl(folderId) {
  const safeFolderId = extractGoogleDriveFolderId(folderId);
  return `https://drive.google.com/drive/folders/${encodeURIComponent(safeFolderId)}`;
}

function ensureTrailingSlash(value) {
  const text = String(value || "");
  return text.endsWith("/") ? text : `${text}/`;
}

function clean(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}
