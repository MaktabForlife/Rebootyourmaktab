import { batchReadGoogleSheetValues, readGoogleSpreadsheetSheetProperties } from '../../src/lib/google-sheets.js';
import { validatePlatformSheetRows } from '../../src/lib/platform-schema.js';
import { PROGRAM_SCHEMA } from '../../src/programs/model.js';
import { FORMAT, SnapshotError, requireCondition } from './snapshot.mjs';

// Export only values. It is not a backup of formulas, formatting or Drive files.
export async function captureSnapshot(env, { environment = 'development', readWorkbook = googleWorkbook, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  requireCondition(['development', 'local'].includes(environment), 'PRODUCTION_CAPTURE_DISABLED');
  const startedAt = new Date().toISOString();
  const platform = await readWorkbook(env, env.PLATFORM_SPREADSHEET_ID);
  const registryTab = platform.tabs.find(t => t.title === 'CourseRegistry');
  let registry;
  try { registry = validatePlatformSheetRows('CourseRegistry', registryTab?.rows); }
  catch { throw new SnapshotError('INVALID_REGISTRY_FOR_EXPORT'); }
  requireCondition(registry.every(r => typeof r.SpreadsheetID === 'string' && /^[\w-]{10,160}$/.test(r.SpreadsheetID)), 'INVALID_REGISTRY_FOR_EXPORT');
  const ids = [env.PLATFORM_SPREADSHEET_ID, ...registry.map(r => r.SpreadsheetID)];
  requireCondition(new Set(ids).size === ids.length, 'DUPLICATE_WORKBOOK_MAPPING');
  const workbooks = [{ kind: 'PLATFORM', spreadsheetId: env.PLATFORM_SPREADSHEET_ID, ...platform }];
  for (const row of registry) {
    // Keep source reads sequential and spread out. A 429 aborts the capture;
    // the shared Sheets client does not immediately retry that response.
    await pause(2500);
    const captured = await readWorkbook(env, row.SpreadsheetID);
    workbooks.push({ kind: row.SchemaVersion === PROGRAM_SCHEMA ? 'PROGRAM' : 'LEGACY',
      courseId: row.CourseID, spreadsheetId: row.SpreadsheetID, ...captured });
  }
  return { format: FORMAT, environment, consistency: 'ONLINE_NON_ATOMIC', startedAt,
    completedAt: new Date().toISOString(), workbooks };
}
async function googleWorkbook(env, spreadsheetId) {
  requireCondition(typeof spreadsheetId === 'string' && /^[\w-]{10,160}$/.test(spreadsheetId), 'INVALID_SPREADSHEET_ID');
  const target = { spreadsheetId };
  const sheets = await readGoogleSpreadsheetSheetProperties(env, target);
  const tabs = [];
  // Quote titles to disambiguate named ranges. Whole-tab A1 ranges avoid an
  // A:ZZ cutoff, including existing wide access matrices and unknown tabs.
  for (let offset = 0; offset < sheets.length; offset += 25) {
    const group = sheets.slice(offset, offset + 25);
    if (offset) await new Promise(resolve => setTimeout(resolve, 2500));
    const rows = await batchReadGoogleSheetValues(env, group.map(s => `'${s.title.replaceAll("'", "''")}'`), target);
    group.forEach((sheet, i) => tabs.push({ sheetId: sheet.sheetId, title: sheet.title, rows: rows[i] }));
  }
  return { inventory: sheets.map(s => ({ sheetId: s.sheetId, title: s.title })), tabs };
}
