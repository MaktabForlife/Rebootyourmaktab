import { createHash } from 'node:crypto';
import { PLATFORM_SHEET_HEADERS, validatePlatformSheetRows, isActivePlatformValue } from '../../src/lib/platform-schema.js';
import { DEFINITION_HEADERS, IDENTITY_HEADERS, PROGRAM_SCHEMA, parseTable, key } from '../../src/programs/model.js';
import { TIMETABLE_HEADERS } from '../../src/programs/timetable-model.js';
import { managementState } from '../../src/programs/management-model.js';
import { programService } from '../../src/programs/service.js';
import { ACADEMY_HEADERS, MATRIX_BASE, parseRoles } from '../../src/profiles/academy-access.js';
import { ACADEMY_SUBJECT_HEADERS } from '../../src/programs/academy-subjects.js';

export const FORMAT = 'maktab-academy-snapshot/v1';
export const REQUIRED_PLATFORM = Object.freeze([
  'UserAccounts', 'PlatformConfig', 'UserCourseAccess', 'CourseRegistry',
  'GlobalSubjectList', 'GlobalModuleList', 'GlobalSubjectAccessMatrix', 'GlobalSubjectAccessPolicy',
  'GlobalSubjectRuns', 'GlobalTimetableRunState', 'GlobalTimetablePublications',
  'GlobalTimetableSessionLifecycle', 'PublishedGlobalTimetableSessions'
]);
const own = (value, name) => Object.hasOwn(value, name);
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const sheetId = value => typeof value === 'string' && /^[\w-]{10,160}$/.test(value);
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(name => `${JSON.stringify(name)}:${stableJSON(value[name])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sha256 = value => createHash('sha256').update(stableJSON(value)).digest('hex');
export class SnapshotError extends Error {
  constructor(code, location = {}) {
    super(code);
    this.name = 'SnapshotError';
    this.code = code;
    // Only coordinates and known field names; never source IDs, names or cell values.
    this.location = Object.fromEntries(Object.entries(location).filter(([name, value]) =>
      ['book', 'tab', 'row'].includes(name) ? Number.isSafeInteger(value) && value >= 0
        : ['table', 'field'].includes(name) && typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value)));
  }
}
export function requireCondition(condition, code, location) {
  if (!condition) throw new SnapshotError(code, location);
}
function safeParse(parse, location) {
  try { return parse(); }
  catch { throw new SnapshotError('INCOMPATIBLE_SOURCE_SCHEMA', location); }
}
function unique(records, field, location) {
  const seen = new Set();
  for (const row of records) {
    const value = key(row[field]);
    requireCondition(value && !seen.has(value), 'MISSING_OR_DUPLICATE_ID', { ...location, field, row: row._rowNumber });
    seen.add(value);
  }
  return seen;
}
function references(records, field, targets, location, optional = false) {
  for (const row of records) {
    const value = key(row[field]);
    requireCondition((optional && !value) || targets.has(value), 'BROKEN_REFERENCE', { ...location, field, row: row._rowNumber });
  }
}
function tableMap(book) { return new Map(book.tabs.map((tab, index) => [tab.title, { ...tab, index }])); }
function records(map, name, bookIndex, headers) {
  const tab = map.get(name);
  requireCondition(tab, 'MISSING_REQUIRED_TABLE', { book: bookIndex, table: name });
  // Runtime validators support historical Global timetable column extensions.
  const parsed = safeParse(() => headers
    ? parseTable(tab.rows, headers, name)
    : validatePlatformSheetRows(name, tab.rows), { book: bookIndex, table: name });
  // Runtime platform parsing compresses blank rows; retain actual source coordinates here.
  const rowNumbers = tab.rows.slice(1).map((row, i) => row.some(v => String(v ?? '').trim()) ? i + 2 : null).filter(Boolean);
  return parsed.map((row, i) => ({ ...row, _rowNumber: rowNumbers[i] }));
}
function validateBook(book, bookIndex) {
  const location = { book: bookIndex };
  requireCondition(object(book) && ['PLATFORM', 'PROGRAM', 'LEGACY'].includes(book.kind)
    && sheetId(book.spreadsheetId) && Array.isArray(book.tabs), 'INVALID_WORKBOOK', location);
  requireCondition(Object.keys(book).every(n => ['kind', 'spreadsheetId', 'courseId', 'inventory', 'tabs'].includes(n)), 'UNKNOWN_WORKBOOK_FIELD', location);
  requireCondition(Array.isArray(book.inventory) && stableJSON(book.inventory) === stableJSON(book.tabs.map(tab => ({ sheetId: tab?.sheetId, title: tab?.title }))), 'TAB_INVENTORY_COVERAGE_MISMATCH', location);
  requireCondition(book.kind === 'PLATFORM' ? !own(book, 'courseId') : nonempty(book.courseId), 'INVALID_WORKBOOK_IDENTITY', location);
  const titles = new Set(), ids = new Set();
  for (const [tabIndex, tab] of book.tabs.entries()) {
    const at = { book: bookIndex, tab: tabIndex };
    requireCondition(object(tab) && nonempty(tab.title) && Number.isSafeInteger(tab.sheetId) && tab.sheetId >= 0
      && Array.isArray(tab.rows) && !titles.has(tab.title) && !ids.has(tab.sheetId), 'INVALID_OR_DUPLICATE_TAB', at);
    requireCondition(Object.keys(tab).every(n => ['sheetId', 'title', 'rows'].includes(n)), 'UNKNOWN_TAB_FIELD', at);
    titles.add(tab.title); ids.add(tab.sheetId);
    for (const [index, row] of tab.rows.entries()) {
      requireCondition(Array.isArray(row) && row.every(cell => cell === null || typeof cell === 'string'
        || typeof cell === 'boolean' || (typeof cell === 'number' && Number.isFinite(cell))), 'INVALID_CELL', { ...at, row: index + 1 });
      // Leave room for metadata under D1's 2,000,000-byte row limit.
      requireCondition(Buffer.byteLength(JSON.stringify(row)) <= 1_900_000, 'ROW_EXCEEDS_D1_STAGING_LIMIT', { ...at, row: index + 1 });
    }
  }
}

export async function validateSnapshot(snapshot) {
  requireCondition(object(snapshot) && snapshot.format === FORMAT && ['development', 'local'].includes(snapshot.environment)
    && snapshot.consistency === 'ONLINE_NON_ATOMIC' && timestamp(snapshot.startedAt) && timestamp(snapshot.completedAt)
    && Date.parse(snapshot.completedAt) >= Date.parse(snapshot.startedAt)
    && Array.isArray(snapshot.workbooks) && snapshot.workbooks.length > 0, 'INVALID_SNAPSHOT_ENVELOPE');
  requireCondition(Object.keys(snapshot).every(n => ['format', 'environment', 'consistency', 'startedAt', 'completedAt', 'workbooks'].includes(n)), 'UNKNOWN_SNAPSHOT_FIELD');
  snapshot.workbooks.forEach(validateBook);
  requireCondition(snapshot.workbooks[0].kind === 'PLATFORM'
    && snapshot.workbooks.filter(b => b.kind === 'PLATFORM').length === 1, 'PLATFORM_MUST_BE_FIRST');
  requireCondition(new Set(snapshot.workbooks.map(b => b.spreadsheetId)).size === snapshot.workbooks.length, 'DUPLICATE_WORKBOOK_MAPPING');
  const platform = tableMap(snapshot.workbooks[0]), tables = {};
  for (const name of REQUIRED_PLATFORM) tables[name] = records(platform, name, 0);
  for (const name of platform.keys()) {
    if (own(PLATFORM_SHEET_HEADERS, name) && !own(tables, name)) tables[name] = records(platform, name, 0);
    const headers = ACADEMY_HEADERS[name] || ACADEMY_SUBJECT_HEADERS[name];
    if (headers) tables[name] = records(platform, name, 0, headers);
  }
  if (platform.has('ProgramDefinitions')) tables.ProgramDefinitions = records(platform, 'ProgramDefinitions', 0, DEFINITION_HEADERS);
  const accounts = unique(tables.UserAccounts, 'AccountID', { book: 0, table: 'UserAccounts' });
  unique(tables.UserAccounts, 'UniqueID', { book: 0, table: 'UserAccounts' });
  for (const row of tables.UserAccounts) {
    requireCondition(nonempty(row.DisplayName) && (!key(row.PlatformRole) || key(row.PlatformRole) === 'GLOBAL_ADMIN'), 'INVALID_ACCOUNT', { book: 0, table: 'UserAccounts', row: row._rowNumber });
    requireCondition(!isActivePlatformValue(row.PINSetup) || nonempty(row.PINHash), 'MISSING_PIN_HASH', { book: 0, table: 'UserAccounts', row: row._rowNumber });
  }
  const registry = tables.CourseRegistry;
  const courses = unique(registry, 'CourseID', { book: 0, table: 'CourseRegistry' });
  unique(registry, 'SpreadsheetID', { book: 0, table: 'CourseRegistry' });
  const subjects = unique(tables.GlobalSubjectList, 'SubjectID', { book: 0, table: 'GlobalSubjectList' });
  const modules = unique(tables.GlobalModuleList, 'ModuleID', { book: 0, table: 'GlobalModuleList' });
  const runs = unique(tables.GlobalSubjectRuns, 'RunID', { book: 0, table: 'GlobalSubjectRuns' });
  const publications = unique(tables.GlobalTimetablePublications, 'PublicationID', { book: 0, table: 'GlobalTimetablePublications' });
  for (const [name, field, targets, optional] of [
    ['UserCourseAccess', 'AccountID', accounts], ['UserCourseAccess', 'CourseID', courses],
    ['GlobalSubjectAccessMatrix', 'AccountID', accounts], ['GlobalModuleList', 'SubjectID', subjects],
    ['GlobalSubjectAccessPolicy', 'SubjectID', subjects], ['GlobalSubjectRuns', 'SubjectID', subjects],
    ['GlobalTimetableRunState', 'RunID', runs], ['GlobalTimetableRunState', 'CurrentPublicationID', publications, true],
    ['GlobalTimetablePublications', 'RunID', runs], ['GlobalTimetablePublications', 'SubjectID', subjects],
    ['PublishedGlobalTimetableSessions', 'PublicationID', publications], ['PublishedGlobalTimetableSessions', 'RunID', runs],
    ['PublishedGlobalTimetableSessions', 'SubjectID', subjects], ['PublishedGlobalTimetableSessions', 'ModuleID', modules, true],
    ['PublishedGlobalTimetableSessions', 'TeacherAccountID', accounts, true]
  ]) references(tables[name], field, targets, { book: 0, table: name }, optional);
  unique(tables.UserCourseAccess, 'AccessID', { book: 0, table: 'UserCourseAccess' });
  unique(tables.GlobalSubjectAccessMatrix, 'AccountID', { book: 0, table: 'GlobalSubjectAccessMatrix' });
  for (const row of tables.UserCourseAccess) requireCondition(['ADMIN', 'SENIOR', 'TEACHER', 'STUDENT'].includes(key(row.Role)), 'UNKNOWN_SOURCE_ROLE', { book: 0, table: 'UserCourseAccess', row: row._rowNumber });
  const matrixNames = ['AcademyAccessMatrix', 'AcademyAccessScopes', 'AcademyAccessReview'];
  const matrixCount = matrixNames.filter(n => platform.has(n)).length;
  requireCondition(matrixCount === 0 || matrixCount === 3, 'PARTIAL_ACADEMY_ACCESS_SETUP');
  let pendingRoleReviews = 0;
  if (matrixCount) {
    const headers = platform.get('AcademyAccessMatrix').rows[0];
    requireCondition(Array.isArray(headers) && JSON.stringify(headers.slice(0, 3)) === JSON.stringify(MATRIX_BASE)
      && new Set(headers).size === headers.length, 'INVALID_ACADEMY_MATRIX_HEADERS');
    const matrix = records(platform, 'AcademyAccessMatrix', 0, headers);
    const scopes = unique(tables.AcademyAccessScopes, 'ScopeKey', { book: 0, table: 'AcademyAccessScopes' });
    unique(matrix, 'AccountID', { book: 0, table: 'AcademyAccessMatrix' });
    references(matrix, 'AccountID', accounts, { book: 0, table: 'AcademyAccessMatrix' });
    references(tables.AcademyAccessReview, 'AccountID', accounts, { book: 0, table: 'AcademyAccessReview' });
    references(tables.AcademyAccessReview, 'ScopeKey', scopes, { book: 0, table: 'AcademyAccessReview' });
    for (const column of headers.slice(3)) requireCondition(scopes.has(key(column)), 'MATRIX_SCOPE_NOT_DECLARED');
    for (const row of matrix) for (const column of headers.slice(3)) safeParse(() => parseRoles(row[column]), { book: 0, table: 'AcademyAccessMatrix', row: row._rowNumber });
    pendingRoleReviews = tables.AcademyAccessReview.filter(r => key(r.ReviewStatus) === 'REQUIRED').length;
  }
  requireCondition(registry.every(r => !String(r.SchemaVersion).includes('-program') || r.SchemaVersion === PROGRAM_SCHEMA), 'UNSUPPORTED_PROGRAM_SCHEMA');
  // Reuse current Program configuration rules without contacting Sheets.
  await safeProgramList(registry, tables.ProgramDefinitions);
  requireCondition(snapshot.workbooks.length === registry.length + 1, 'WORKBOOK_COVERAGE_MISMATCH');
  const seenCourses = new Set();
  let programCount = 0, legacyCount = 0, enrollments = 0, programPublications = 0;
  for (const [bookIndex, book] of snapshot.workbooks.entries()) {
    if (!bookIndex) continue;
    const entry = registry.find(r => key(r.CourseID) === key(book.courseId));
    requireCondition(entry && !seenCourses.has(key(book.courseId)) && entry.SpreadsheetID === book.spreadsheetId, 'UNREGISTERED_OR_MISMATCHED_WORKBOOK', { book: bookIndex });
    seenCourses.add(key(book.courseId));
    const generic = entry.SchemaVersion === PROGRAM_SCHEMA;
    requireCondition(book.kind === (generic ? 'PROGRAM' : 'LEGACY'), 'WRONG_WORKBOOK_KIND', { book: bookIndex });
    if (!generic) { legacyCount++; continue; }
    programCount++;
    const map = tableMap(book), data = {};
    const identity = records(map, 'ProgramIdentity', bookIndex, IDENTITY_HEADERS);
    requireCondition(identity.length === 1 && identity[0].CourseID === entry.CourseID && identity[0].SchemaVersion === PROGRAM_SCHEMA, 'PROGRAM_IDENTITY_MISMATCH', { book: bookIndex });
    for (const [name, headers] of Object.entries(TIMETABLE_HEADERS)) {
      if (!map.has(name)) continue; // Unprepared features remain unprepared.
      const oldResources = name === 'ProgramResources' && JSON.stringify(map.get(name).rows[0]) === JSON.stringify(headers.slice(0, 11));
      data[name] = records(map, name, bookIndex, oldResources ? headers.slice(0, 11) : headers);
      unique(data[name], headers[0], { book: bookIndex, table: name });
      if (headers.includes('CourseID')) for (const row of data[name]) requireCondition(row.CourseID === entry.CourseID, 'CROSS_PROGRAM_ROW', { book: bookIndex, table: name, row: row._rowNumber });
    }
    const current = safeParse(() => managementState({ tables: data }, { id: entry.CourseID }), { book: bookIndex, table: 'ProgramManagementState' }).snapshot;
    const classes = unique(current.ProgramClasses, 'ClassID', { book: bookIndex, table: 'ProgramClasses' });
    references(current.ProgramEnrollments, 'AccountID', accounts, { book: bookIndex, table: 'ProgramEnrollments' });
    references(current.ProgramEnrollments, 'ClassID', classes, { book: bookIndex, table: 'ProgramEnrollments' });
    references(current.ProgramTeachers, 'AccountID', accounts, { book: bookIndex, table: 'ProgramTeachers' });
    const published = unique(data.ProgramTimetablePublications || [], 'PublicationID', { book: bookIndex, table: 'ProgramTimetablePublications' });
    references(data.ProgramTimetableState || [], 'CurrentPublicationID', published, { book: bookIndex, table: 'ProgramTimetableState' }, true);
    for (const [name, rows] of Object.entries(data)) {
      for (const field of ['SnapshotJSON', 'DraftJSON', 'ResultJSON']) for (const row of rows) if (row[field])
        safeParse(() => JSON.parse(row[field]), { book: bookIndex, table: name, field, row: row._rowNumber });
    }
    enrollments += current.ProgramEnrollments.length;
    programPublications += published.size;
  }
  const checks = { workbooks: snapshot.workbooks.length, tables: snapshot.workbooks.reduce((n,b) => n+b.tabs.length, 0),
    rows: snapshot.workbooks.reduce((n,b) => n+b.tabs.reduce((sum,t) => sum+t.rows.length, 0), 0),
    accounts: accounts.size, registeredActivities: registry.length, programs: programCount, legacyWorkbooks: legacyCount,
    enrollments, programPublications, globalPublications: publications.size, pendingRoleReviews };
  return { format: FORMAT, environment: snapshot.environment, snapshotSha256: sha256(snapshot),
    snapshotValidation: 'PASS', cutoverReady: false, checks };
}
async function safeProgramList(registry, definitions) {
  try { await programService({ registry: async () => registry, definitions: async () => definitions || null }).list(); }
  catch { throw new SnapshotError('INVALID_PROGRAM_CONFIGURATION'); }
}
