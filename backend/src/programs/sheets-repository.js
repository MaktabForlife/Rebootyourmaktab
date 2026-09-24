/* M4L V105.1 - Sheets adapter; no domain decisions in transport code. */
import { batchUpdateGoogleSpreadsheet, readGoogleSpreadsheetSheetProperties, readGoogleSheetValues } from "../lib/google-sheets.js";
import { getPlatformSpreadsheetId, readPlatformSheet } from "../lib/platform-sheet.js";
import { PLATFORM_SHEET_HEADERS } from "../lib/platform-schema.js";
import { DEFINITION_HEADERS, IDENTITY_HEADERS, parseTable, problem, clean } from "./model.js";

const rowData = row => ({ values: row.map(value => ({ userEnteredValue: typeof value === "boolean"
  ? { boolValue: value } : typeof value === "number" ? { numberValue: value } : { stringValue: String(value ?? "") } })) });
const ordered = (record, headers) => headers.map(header => record[header] ?? "");

export function sheetsProgramRepository(env) {
  const platformId = getPlatformSpreadsheetId(env);
  const properties = id => readGoogleSpreadsheetSheetProperties(env, { spreadsheetId: id });
  const rows = (id, title) => readGoogleSheetValues(env, `'${title}'!A:ZZ`, { spreadsheetId: id });
  const batch = (id, requests) => batchUpdateGoogleSpreadsheet(env, requests, { spreadsheetId: id });

  async function ensureTable(id, title, headers, initialRows = []) {
    const sheets = await properties(id);
    const found = sheets.find(sheet => sheet.title === title);
    if (found) {
      const existing = await rows(id, title);
      // Never overwrite a partial/populated sheet, even if its first row is blank.
      if (existing.some(row => row.some(value => clean(value)))) {
        parseTable(existing, headers, title);
        return;
      }
      await batch(id, [{ updateCells: { start: { sheetId: found.sheetId, rowIndex: 0, columnIndex: 0 },
        rows: [headers, ...initialRows].map(rowData), fields: "userEnteredValue" } }]);
      return;
    }
    const sheetId = Math.max(0, ...sheets.map(sheet => sheet.sheetId)) + 1;
    await batch(id, [
      { addSheet: { properties: { sheetId, title, gridProperties: { frozenRowCount: 1 } } } },
      { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: [headers, ...initialRows].map(rowData), fields: "userEnteredValue" } }
    ]);
  }

  return {
    platformId,
    protectedIds: [platformId, clean(env.GOOGLE_SPREADSHEET_ID)].filter(Boolean),
    registry: () => readPlatformSheet(env, "CourseRegistry"),
    async definitions() {
      if (!(await properties(platformId)).some(sheet => sheet.title === "ProgramDefinitions")) return null;
      const values = await rows(platformId, "ProgramDefinitions");
      return values.some(row => row.some(value => clean(value))) ? parseTable(values, DEFINITION_HEADERS, "ProgramDefinitions") : null;
    },
    preparePlatform: () => ensureTable(platformId, "ProgramDefinitions", DEFINITION_HEADERS),
    async inspectTarget(id) {
      const sheets = await properties(id);
      const found = sheets.some(sheet => sheet.title === "ProgramIdentity");
      const values = found ? await rows(id, "ProgramIdentity") : [];
      return { titles: sheets.map(sheet => sheet.title), identity: values.some(row => row.some(value => clean(value)))
        ? parseTable(values, IDENTITY_HEADERS, "ProgramIdentity") : [] };
    },
    async prepareTarget(id, courseId, schema) {
      await ensureTable(id, "ProgramIdentity", IDENTITY_HEADERS, [[courseId, schema]]);
      const records = parseTable(await rows(id, "ProgramIdentity"), IDENTITY_HEADERS, "ProgramIdentity");
      // A header-only interrupted setup is repairable. No populated row is replaced.
      if (records.length === 0) {
        const sheet = (await properties(id)).find(item => item.title === "ProgramIdentity");
        await batch(id, [{ updateCells: { start: { sheetId: sheet.sheetId, rowIndex: 1, columnIndex: 0 },
          rows: [[courseId, schema]].map(rowData), fields: "userEnteredValue" } }]);
      }
    },
    async commit(registry, config, audit, creating) {
      // Appends avoid assigning an unoccupied row from a stale row count. Updates
      // use row coordinates only after resolving the stable ID in this request.
      const sheets = await properties(platformId);
      await readPlatformSheet(env, "PlatformAuditLog");
      const write = (title, headers, record, append) => {
        const sheetId = sheets.find(sheet => sheet.title === title)?.sheetId;
        if (!Number.isInteger(sheetId)) throw problem(`Missing ${title}. Validate the Platform spreadsheet.`, 409);
        const data = [rowData(ordered(record, headers))];
        return append ? { appendCells: { sheetId, rows: data, fields: "userEnteredValue" } }
          : { updateCells: { start: { sheetId, rowIndex: record._rowNumber - 1, columnIndex: 0 }, rows: data, fields: "userEnteredValue" } };
      };
      await batch(platformId, [
        write("CourseRegistry", PLATFORM_SHEET_HEADERS.CourseRegistry, registry, creating),
        write("ProgramDefinitions", DEFINITION_HEADERS, config, creating),
        write("PlatformAuditLog", PLATFORM_SHEET_HEADERS.PlatformAuditLog, audit, true)
      ]);
    }
  };
}
