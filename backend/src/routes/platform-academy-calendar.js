/* M4L V102.12.8 - Academic Calendar responsive batch administration and editable Holiday overrides. */

import { getAuthUser as defaultGetAuthUser } from "../lib/auth.js";
import {
  ACADEMY_CALENDAR_EVENT_TYPES,
  buildAcademyCalendarEvents,
  isHiddenIslamicEvent,
  mapAcademyCalendarRow,
  normalizeTeachingImpact,
  validateAcademyCalendarRecord
} from "../lib/academy-calendar.js";
import { batchUpdateGoogleSheetValues as defaultBatchUpdateGoogleSheetValues } from "../lib/google-sheets.js";
import { json } from "../lib/http.js";
import { getPlatformSpreadsheetId as defaultGetPlatformSpreadsheetId, readPlatformSheet as defaultReadPlatformSheet } from "../lib/platform-sheet.js";
import { isActivePlatformValue, normalizePlatformIdentifier, PLATFORM_SHEET_HEADERS } from "../lib/platform-schema.js";

const CALENDAR_SCHEMA_VERSIONS = new Set(["102.0.8", "102.0.9", "102.0.10", "102.0.11", "102.0.12"]);
const GENERATED_PUBLIC_HOLIDAY_PREFIX = "SA-PUBLIC-HOLIDAY-";

// Storage dependencies are scoped to this service instance, never shared between requests.
export function createAcademyCalendarEndpoints(storage = {}) {
  const getAuthUser = storage.getAuthUser || defaultGetAuthUser;
  const batchUpdateGoogleSheetValues = storage.batchUpdateGoogleSheetValues || defaultBatchUpdateGoogleSheetValues;
  const getPlatformSpreadsheetId = storage.getPlatformSpreadsheetId || defaultGetPlatformSpreadsheetId;
  const readPlatformSheet = storage.readPlatformSheet || defaultReadPlatformSheet;

async function getAcademyCalendarAdminEndpoint(request, env) {
  const permission = await requireCalendarAdmin(request, env);
  if (!permission.ok) return permission.response;
  try {
    const body = await readBody(request);
    const year = normalizeYear(body.year);
    const tables = await readCalendarTables(env);
    requireCalendarSchema(tables.PlatformConfig);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    return json({
      success: true,
      service: "academy-calendar",
      version: "102.12.8",
      year,
      events: buildAcademyCalendarEvents(tables.AcademyCalendar, startDate, endDate),
      storedEvents: tables.AcademyCalendar.map(mapAcademyCalendarRow)
        .filter(event => !isHiddenIslamicEvent(event))
        .filter(event => event.startDate.slice(0, 4) === String(year) || event.endDate.slice(0, 4) === String(year))
    });
  } catch (error) {
    return calendarError(error, env);
  }
}

async function saveAcademyCalendarBatchEndpoint(request, env) {
  const permission = await requireCalendarAdmin(request, env);
  if (!permission.ok) return permission.response;
  try {
    const body = await readBody(request);
    const changes = Array.isArray(body.changes) ? body.changes : [];
    if (changes.length > 100) throw clientError("Save no more than 100 Academic Calendar changes at once", 400);
    if (!changes.length) return json({ success: true, message: "No Academic Calendar changes requested", changed: 0, events: [] });

    const tables = await readCalendarTables(env);
    requireCalendarSchema(tables.PlatformConfig);
    const timestamp = new Date().toISOString();
    const seen = new Set();
    const calendarWrites = [];
    const auditRows = [];
    const responseEvents = [];
    let nextCalendarRow = nextRowNumber(tables.AcademyCalendar);

    const allocateRecord = (record, rowNumber, auditAction, auditTargetId, changedFields) => {
      validateAcademyCalendarRecord(record);
      const targetRow = rowNumber || nextCalendarRow++;
      calendarWrites.push(valueWrite("AcademyCalendar", targetRow, recordToRow(record, PLATFORM_SHEET_HEADERS.AcademyCalendar)));
      auditRows.push(auditRow(permission, timestamp, auditAction, auditTargetId || record.CalendarEventID, changedFields));
      return { ...record, _rowNumber: targetRow };
    };

    for (const rawChange of changes) {
      const change = rawChange && typeof rawChange === "object" ? rawChange : {};
      const eventId = clean(change.eventId || change.calendarEventId);
      const generatedPublicHolidayDate = generatedPublicHolidayDateFromId(eventId);
      const existing = eventId && !generatedPublicHolidayDate ? uniqueCalendarEvent(tables.AcademyCalendar, eventId) : null;
      const eventType = normalizePlatformIdentifier(existing?.EventType || change.eventType || "TERM");
      if (!ACADEMY_CALENDAR_EVENT_TYPES.includes(eventType)) throw clientError("EventType must be TERM, ISLAMIC_DAY or PUBLIC_HOLIDAY", 400);
      if (!existing && !generatedPublicHolidayDate && !["TERM", "PUBLIC_HOLIDAY"].includes(eventType)) {
        throw clientError("New Academy Calendar entries must be Terms or Public Holidays", 400);
      }
      const identity = eventId || `NEW:${eventType}:${clean(change.startDate)}:${clean(change.description)}`;
      if (seen.has(identity)) throw clientError("The same Academic Calendar record cannot be changed twice in one save", 400);
      seen.add(identity);

      if (eventType === "PUBLIC_HOLIDAY") {
        const active = readBoolean(change.active, existing ? isActivePlatformValue(existing.Active) : true);
        const requestedDate = clean(change.startDate ?? existing?.StartDate ?? generatedPublicHolidayDate);
        const description = clean(change.description ?? existing?.Description ?? "Public Holiday") || "Public Holiday";
        if (!requestedDate) throw clientError("Holiday date is required", 400);

        if (generatedPublicHolidayDate) {
          if (active && requestedDate === generatedPublicHolidayDate && description === "Public Holiday") continue;
          const suppression = newCalendarRecord({
            eventType: "PUBLIC_HOLIDAY", description: "Public Holiday",
            startDate: generatedPublicHolidayDate, endDate: generatedPublicHolidayDate,
            alternateDate: "", teachingImpact: "NO_TEACHING", active: false, timestamp, permission
          });
          allocateRecord(
            suppression, 0,
            active ? "MOVE_ACADEMY_PUBLIC_HOLIDAY" : "DELETE_ACADEMY_PUBLIC_HOLIDAY",
            `${GENERATED_PUBLIC_HOLIDAY_PREFIX}${generatedPublicHolidayDate}`,
            ["Description", "StartDate", "Active"]
          );
          if (active) {
            const override = newCalendarRecord({
              eventType: "PUBLIC_HOLIDAY", description,
              startDate: requestedDate, endDate: requestedDate,
              alternateDate: "", teachingImpact: "NO_TEACHING", active: true, timestamp, permission
            });
            const visible = allocateRecord(override, 0, "CREATE_ACADEMY_PUBLIC_HOLIDAY_OVERRIDE", override.CalendarEventID, ["Description", "StartDate", "Active"]);
            responseEvents.push(mapAcademyCalendarRow(visible));
          } else {
            responseEvents.push(mapAcademyCalendarRow(suppression));
          }
          continue;
        }

        if (existing) {
          const record = {
            ...existing,
            Description: description,
            StartDate: requestedDate,
            EndDate: requestedDate,
            AlternateDate: "",
            TeachingImpact: "NO_TEACHING",
            Active: active,
            ModifiedByAccountID: permission.user.accountid,
            ModifiedByAccountName: permission.user.username,
            ModifiedDate: timestamp
          };
          validateAcademyCalendarRecord(record);
          const changedFields = changedRecordFields(existing, record, ["Description", "StartDate", "EndDate", "Active"]);
          if (!changedFields.length) continue;
          const saved = allocateRecord(record, existing._rowNumber, active ? "UPDATE_ACADEMY_PUBLIC_HOLIDAY" : "DELETE_ACADEMY_PUBLIC_HOLIDAY", record.CalendarEventID, changedFields);
          responseEvents.push(mapAcademyCalendarRow(saved));
          continue;
        }

        if (!active) throw clientError("A new Holiday must be active", 400);
        const record = newCalendarRecord({
          eventType: "PUBLIC_HOLIDAY", description,
          startDate: requestedDate, endDate: requestedDate,
          alternateDate: "", teachingImpact: "NO_TEACHING", active: true, timestamp, permission
        });
        const saved = allocateRecord(record, 0, "CREATE_ACADEMY_PUBLIC_HOLIDAY", record.CalendarEventID, ["EventType", "Description", "StartDate", "Active"]);
        responseEvents.push(mapAcademyCalendarRow(saved));
        continue;
      }

      const description = eventType === "ISLAMIC_DAY" ? clean(existing?.Description) : clean(change.description ?? existing?.Description);
      const startDate = clean(change.startDate ?? existing?.StartDate);
      const endDate = eventType === "ISLAMIC_DAY" ? startDate : clean(change.endDate ?? existing?.EndDate ?? startDate);
      const alternateDate = eventType === "ISLAMIC_DAY" ? clean(existing?.AlternateDate) : "";
      const teachingImpact = eventType === "ISLAMIC_DAY" ? "INFORMATION" : normalizeTeachingImpact(change.teachingImpact ?? existing?.TeachingImpact ?? "INFORMATION");
      const active = eventType === "ISLAMIC_DAY"
        ? isActivePlatformValue(existing?.Active)
        : readBoolean(change.active, existing ? isActivePlatformValue(existing.Active) : true);
      const record = existing ? {
        ...existing,
        Description: description,
        StartDate: startDate,
        EndDate: endDate,
        AlternateDate: alternateDate,
        TeachingImpact: teachingImpact,
        Active: active,
        ModifiedByAccountID: permission.user.accountid,
        ModifiedByAccountName: permission.user.username,
        ModifiedDate: timestamp
      } : newCalendarRecord({ eventType, description, startDate, endDate, alternateDate, teachingImpact, active, timestamp, permission });
      validateAcademyCalendarRecord(record);
      const changedFields = existing
        ? changedRecordFields(existing, record, eventType === "ISLAMIC_DAY" ? ["StartDate", "EndDate"] : ["Description", "StartDate", "EndDate", "Active"])
        : ["EventType", "Description", "StartDate", "EndDate", "TeachingImpact", "Active"];
      if (!changedFields.length) continue;
      const saved = allocateRecord(
        record,
        existing?._rowNumber || 0,
        existing ? "UPDATE_ACADEMY_CALENDAR_EVENT" : "CREATE_ACADEMY_CALENDAR_EVENT",
        record.CalendarEventID,
        changedFields
      );
      responseEvents.push(mapAcademyCalendarRow(saved));
    }

    if (!calendarWrites.length) {
      return json({ success: true, message: "No Academic Calendar changes requested", changed: 0, events: [] });
    }
    const writes = [...calendarWrites];
    if (auditRows.length) writes.push(rangeWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), auditRows));
    await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
    return json({
      success: true,
      message: `${calendarWrites.length} Academic Calendar change${calendarWrites.length === 1 ? "" : "s"} saved`,
      changed: calendarWrites.length,
      events: responseEvents
    });
  } catch (error) {
    return calendarError(error, env);
  }
}

async function saveAcademyCalendarEventEndpoint(request, env) {
  const permission = await requireCalendarAdmin(request, env);
  if (!permission.ok) return permission.response;
  try {
    const body = await readBody(request);
    const tables = await readCalendarTables(env);
    requireCalendarSchema(tables.PlatformConfig);
    const eventId = clean(body.eventId || body.calendarEventId);
    const generatedPublicHolidayDate = generatedPublicHolidayDateFromId(eventId);
    const existing = eventId && !generatedPublicHolidayDate ? uniqueCalendarEvent(tables.AcademyCalendar, eventId) : null;
    const eventType = normalizePlatformIdentifier(existing?.EventType || body.eventType || "TERM");
    if (!ACADEMY_CALENDAR_EVENT_TYPES.includes(eventType)) throw clientError("EventType must be TERM, ISLAMIC_DAY or PUBLIC_HOLIDAY", 400);
    if (!existing && !generatedPublicHolidayDate && !["TERM", "PUBLIC_HOLIDAY"].includes(eventType)) {
      throw clientError("New Academy Calendar entries must be Terms or Public Holidays", 400);
    }

    if (eventType === "PUBLIC_HOLIDAY") {
      return await savePublicHoliday({ body, tables, permission, existing, generatedPublicHolidayDate, env });
    }

    const description = eventType === "ISLAMIC_DAY"
      ? clean(existing?.Description)
      : clean(body.description || existing?.Description);
    const startDate = clean(body.startDate || existing?.StartDate);
    const endDate = eventType === "ISLAMIC_DAY"
      ? startDate
      : clean(body.endDate || existing?.EndDate || startDate);
    const alternateDate = eventType === "ISLAMIC_DAY"
      ? clean(existing?.AlternateDate)
      : "";
    const teachingImpact = eventType === "ISLAMIC_DAY"
      ? "INFORMATION"
      : normalizeTeachingImpact(body.teachingImpact ?? existing?.TeachingImpact ?? "INFORMATION");
    const active = readBoolean(body.active, existing ? isActivePlatformValue(existing.Active) : true);
    const timestamp = new Date().toISOString();

    const record = existing ? {
      ...existing,
      Description: description,
      StartDate: startDate,
      EndDate: endDate,
      AlternateDate: alternateDate,
      TeachingImpact: teachingImpact,
      Active: active,
      ModifiedByAccountID: permission.user.accountid,
      ModifiedByAccountName: permission.user.username,
      ModifiedDate: timestamp
    } : newCalendarRecord({
      eventType,
      description,
      startDate,
      endDate,
      alternateDate,
      teachingImpact,
      active,
      timestamp,
      permission
    });
    validateAcademyCalendarRecord(record);

    const rowNumber = existing?._rowNumber || nextRowNumber(tables.AcademyCalendar);
    const changedFields = existing
      ? ["Description", "StartDate", "EndDate", "Active"]
      : ["EventType", "Description", "StartDate", "EndDate", "TeachingImpact", "Active"];
    const audit = auditRow(permission, timestamp, existing ? "UPDATE_ACADEMY_CALENDAR_EVENT" : "CREATE_ACADEMY_CALENDAR_EVENT", record.CalendarEventID, changedFields);

    await batchUpdateGoogleSheetValues(env, [
      valueWrite("AcademyCalendar", rowNumber, recordToRow(record, PLATFORM_SHEET_HEADERS.AcademyCalendar)),
      valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), audit)
    ], { spreadsheetId: getPlatformSpreadsheetId(env) });

    return json({ success: true, event: mapAcademyCalendarRow({ ...record, _rowNumber: rowNumber }) });
  } catch (error) {
    return calendarError(error, env);
  }
}

async function savePublicHoliday({ body, tables, permission, existing, generatedPublicHolidayDate, env }) {
  const timestamp = new Date().toISOString();
  const active = readBoolean(body.active, existing ? isActivePlatformValue(existing.Active) : true);
  const requestedDate = clean(body.startDate || existing?.StartDate || generatedPublicHolidayDate);
  const description = clean(body.description || existing?.Description || "Public Holiday") || "Public Holiday";
  if (!requestedDate) throw clientError("Holiday date is required", 400);
  const records = [];
  const actionFields = ["Description", "StartDate", "Active"];
  let auditAction = "UPDATE_ACADEMY_PUBLIC_HOLIDAY";

  if (generatedPublicHolidayDate) {
    if (active && requestedDate === generatedPublicHolidayDate && description === "Public Holiday") {
      return json({
        success: true,
        unchanged: true,
        event: {
          id: `${GENERATED_PUBLIC_HOLIDAY_PREFIX}${generatedPublicHolidayDate}`,
          eventType: "PUBLIC_HOLIDAY",
          description,
          startDate: generatedPublicHolidayDate,
          endDate: generatedPublicHolidayDate,
          teachingImpact: "NO_TEACHING",
          active: true,
          source: "SA_PUBLIC_HOLIDAY",
          editable: true,
          derived: true
        }
      });
    }

    records.push(newCalendarRecord({
      eventType: "PUBLIC_HOLIDAY",
      description: "Public Holiday",
      startDate: generatedPublicHolidayDate,
      endDate: generatedPublicHolidayDate,
      alternateDate: "",
      teachingImpact: "NO_TEACHING",
      active: false,
      timestamp,
      permission
    }));
    auditAction = active ? "MOVE_ACADEMY_PUBLIC_HOLIDAY" : "DELETE_ACADEMY_PUBLIC_HOLIDAY";

    if (active) {
      records.push(newCalendarRecord({
        eventType: "PUBLIC_HOLIDAY",
        description,
        startDate: requestedDate,
        endDate: requestedDate,
        alternateDate: "",
        teachingImpact: "NO_TEACHING",
        active: true,
        timestamp,
        permission
      }));
    }
  } else if (existing) {
    const record = {
      ...existing,
      Description: description,
      StartDate: requestedDate,
      EndDate: requestedDate,
      AlternateDate: "",
      TeachingImpact: "NO_TEACHING",
      Active: active,
      ModifiedByAccountID: permission.user.accountid,
      ModifiedByAccountName: permission.user.username,
      ModifiedDate: timestamp
    };
    validateAcademyCalendarRecord(record);
    records.push(record);
    if (!active) auditAction = "DELETE_ACADEMY_PUBLIC_HOLIDAY";
  } else {
    const record = newCalendarRecord({
      eventType: "PUBLIC_HOLIDAY",
      description,
      startDate: requestedDate,
      endDate: requestedDate,
      alternateDate: "",
      teachingImpact: "NO_TEACHING",
      active: true,
      timestamp,
      permission
    });
    validateAcademyCalendarRecord(record);
    records.push(record);
    auditAction = "CREATE_ACADEMY_PUBLIC_HOLIDAY";
  }

  records.forEach(validateAcademyCalendarRecord);
  const firstRow = nextRowNumber(tables.AcademyCalendar);
  const writes = records.map((record, index) => {
    const rowNumber = existing ? existing._rowNumber : firstRow + index;
    return valueWrite("AcademyCalendar", rowNumber, recordToRow(record, PLATFORM_SHEET_HEADERS.AcademyCalendar));
  });
  const auditTargetId = records.at(-1)?.CalendarEventID || existing?.CalendarEventID || `${GENERATED_PUBLIC_HOLIDAY_PREFIX}${generatedPublicHolidayDate}`;
  writes.push(valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), auditRow(permission, timestamp, auditAction, auditTargetId, actionFields)));

  await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
  const visibleRecord = active ? records.at(-1) : records[0];
  return json({ success: true, event: mapAcademyCalendarRow({ ...visibleRecord, _rowNumber: existing?._rowNumber || firstRow }) });
}

function newCalendarRecord({ eventType, description, startDate, endDate, alternateDate, teachingImpact, active, timestamp, permission }) {
  return {
    CalendarEventID: createId("ACEVT"),
    EventType: eventType,
    Description: description,
    StartDate: startDate,
    EndDate: endDate,
    AlternateDate: alternateDate,
    TeachingImpact: teachingImpact,
    Active: active,
    CreatedDate: timestamp,
    CreatedByAccountID: permission.user.accountid,
    CreatedByAccountName: permission.user.username,
    ModifiedByAccountID: "",
    ModifiedByAccountName: "",
    ModifiedDate: ""
  };
}

function auditRow(permission, timestamp, action, targetId, changedFields) {
  return [
    createId("AUDIT"), timestamp, permission.user.accountid, permission.user.username, permission.user.role,
    permission.user.courseid || "", action, "ACADEMY_CALENDAR_EVENT", targetId, JSON.stringify(changedFields)
  ];
}

async function requireCalendarAdmin(request, env) {
  if (request.method !== "POST") return { ok: false, response: json({ success: false, error: "Method not allowed" }, 405) };
  const user = await getAuthUser(request, env);
  if (!user) return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  const role = normalizePlatformIdentifier(user.role);
  const allowed = (user.type === "account" && ["ADMIN", "GLOBAL_ADMIN"].includes(role)) || (user.type === "admin" && role === "ADMIN");
  if (!allowed) return { ok: false, response: json({ success: false, error: "ADMIN or GLOBAL_ADMIN authority is required" }, 403) };
  return { ok: true, user: { accountid: clean(user.accountid || user.adminid), username: clean(user.username || "Admin"), role, courseid: clean(user.courseid) } };
}

async function readCalendarTables(env) {
  const [calendar, config, audit] = await Promise.all([
    readPlatformSheet(env, "AcademyCalendar"), readPlatformSheet(env, "PlatformConfig"), readPlatformSheet(env, "PlatformAuditLog")
  ]);
  return { AcademyCalendar: calendar, PlatformConfig: config, PlatformAuditLog: audit };
}

function requireCalendarSchema(configRows) {
  const matches = (configRows || []).filter(row => normalizePlatformIdentifier(row.ConfigKey) === "PLATFORMSCHEMAVERSION");
  const version = clean(matches[0]?.ConfigValue);
  if (matches.length !== 1 || !CALENDAR_SCHEMA_VERSIONS.has(version)) throw new Error("Academic Calendar requires PlatformSchemaVersion 102.0.8, 102.0.9, 102.0.10, 102.0.11 or 102.0.12");
}

function uniqueCalendarEvent(rows, id) {
  const normalized = normalizePlatformIdentifier(id);
  const matches = (rows || []).filter(row => normalizePlatformIdentifier(row.CalendarEventID) === normalized);
  if (matches.length === 0) throw clientError("Academy Calendar event was not found", 404);
  if (matches.length > 1) throw clientError("Academy Calendar event is duplicated", 409);
  return matches[0];
}

function generatedPublicHolidayDateFromId(id) {
  const value = clean(id);
  if (!value.startsWith(GENERATED_PUBLIC_HOLIDAY_PREFIX)) return "";
  const date = value.slice(GENERATED_PUBLIC_HOLIDAY_PREFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeYear(value) {
  const year = Number(value || new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 2025 || year > 2100) throw clientError("Calendar year is invalid", 400);
  return year;
}

function readBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  return ["TRUE", "YES", "1", "ACTIVE"].includes(normalizePlatformIdentifier(value));
}

function clientError(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function calendarError(error, env) { return json({ success: false, error: error?.status ? error.message : "Academy Calendar request failed", detail: env?.DEBUG_ERRORS === "true" ? String(error?.message || error) : undefined }, Number(error?.status) || 503); }
function clean(value) { return String(value ?? "").trim(); }
function changedRecordFields(existing, next, keys) { return keys.filter(key => String(existing?.[key] ?? "") !== String(next?.[key] ?? "")); }
function rangeWrite(sheetName, startRow, rows) { const width = rows[0]?.length || PLATFORM_SHEET_HEADERS[sheetName]?.length || 1; const endRow = startRow + rows.length - 1; return { range: `'${sheetName}'!A${startRow}:${columnName(width)}${endRow}`, majorDimension: "ROWS", values: rows }; }
function recordToRow(record, headers) { return headers.map(header => record?.[header] ?? ""); }
function nextRowNumber(rows) { return Math.max(1, ...(rows || []).map(row => Number(row?._rowNumber) || 1)) + 1; }
function valueWrite(sheetName, rowNumber, row) { return { range: `'${sheetName}'!A${rowNumber}:${columnName(row.length)}${rowNumber}`, majorDimension: "ROWS", values: [row] }; }
function columnName(number) { let n = Number(number), out = ""; while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); } return out; }
function createId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
async function readBody(request) { try { return await request.json(); } catch { return {}; } }

  return { getAcademyCalendarAdminEndpoint, saveAcademyCalendarBatchEndpoint, saveAcademyCalendarEventEndpoint };
}

export const { getAcademyCalendarAdminEndpoint, saveAcademyCalendarBatchEndpoint, saveAcademyCalendarEventEndpoint } = createAcademyCalendarEndpoints();
