import { PLATFORM_SHEET_HEADERS } from '../../src/lib/platform-schema.js';
import { DEFINITION_HEADERS, IDENTITY_HEADERS, PROGRAM_SCHEMA } from '../../src/programs/model.js';
import { TIMETABLE_HEADERS } from '../../src/programs/timetable-model.js';
import { ACADEMY_HEADERS, MATRIX_BASE } from '../../src/profiles/academy-access.js';
import { FORMAT } from '../../tools/academy-migration/snapshot.mjs';

export const PROGRAM_IDS = ['PRG-11111111-1111-4111-8111-111111111111', 'PRG-22222222-2222-4222-8222-222222222222'];
const timestamp = '2026-10-09T08:00:00.000Z';
const values = (headers, record) => headers.map(h => record[h] ?? '');
export function migrationFixture(count = 200) {
  const platform = new Map(Object.entries(PLATFORM_SHEET_HEADERS).map(([name, headers]) => [name, [headers.slice()]]));
  const add = (name, record) => platform.get(name).push(values(platform.get(name)[0], record));
  for (let i = 1; i <= count; i++) {
    const suffix = String(i).padStart(4, '0');
    add('UserAccounts', { AccountID: `account-${suffix}`, DisplayName: `Synthetic learner ${i}`, UniqueID: `login-${suffix}`,
      PINSetup: true, PINHash: `SYNTHETIC-HASH-${suffix}`, Active: i !== count, PlatformRole: i === 1 ? 'GLOBAL_ADMIN' : '', CreatedDate: timestamp });
    add('UserCourseAccess', { AccessID: `access-${suffix}`, AccountID: `account-${suffix}`, CourseID: PROGRAM_IDS[i % 2],
      Role: i === 2 ? 'SENIOR' : i === 3 ? 'TEACHER' : 'STUDENT', Active: true });
  }
  // Source blank rows must survive and must not shift account coordinates.
  platform.get('UserAccounts').splice(2, 0, []);
  add('GlobalSubjectList', { SubjectID: 'subject-1', SubjectName: 'Synthetic subject', Active: true });
  add('GlobalModuleList', { ModuleID: 'module-1', SubjectID: 'subject-1', ModuleName: 'Synthetic module', Active: true });
  add('GlobalSubjectAccessPolicy', { SubjectPolicyID: 'policy-1', SubjectID: 'subject-1', AccessModel: 'FREE', Active: true });
  add('GlobalSubjectRuns', { RunID: 'run-1', SubjectID: 'subject-1', RunName: 'Synthetic run', Active: true });
  add('GlobalTimetablePublications', { PublicationID: 'publication-1', RunID: 'run-1', SubjectID: 'subject-1', VersionNo: 1 });
  add('GlobalTimetableRunState', { RunID: 'run-1', CurrentPublicationID: 'publication-1' });
  add('PublishedGlobalTimetableSessions', { PublishedSessionID: 'session-1', PublicationID: 'publication-1', RunID: 'run-1',
    SubjectID: 'subject-1', ModuleID: 'module-1', TeacherAccountID: 'account-0003', SessionDate: '2026-10-09', StartTime: '10:00', EndTime: '11:00' });
  platform.set('ProgramDefinitions', [DEFINITION_HEADERS.slice()]);
  for (const [index, id] of PROGRAM_IDS.entries()) {
    add('CourseRegistry', { CourseID: id, CourseName: `Synthetic Program ${index+1}`, SpreadsheetID: `synthetic_program_${index+1}`, Active: false, SchemaVersion: PROGRAM_SCHEMA });
    platform.get('ProgramDefinitions').push(values(DEFINITION_HEADERS, { CourseID: id, DurationYears: 3, Timezone: 'Africa/Johannesburg', Status: 'DRAFT', Revision: 'synthetic-revision' }));
  }
  add('CourseRegistry', { CourseID: 'legacy-1', CourseName: 'Synthetic legacy activity', SpreadsheetID: 'synthetic_legacy_1', Active: true, SchemaVersion: 'legacy-v1' });
  for (const [name, headers] of Object.entries(ACADEMY_HEADERS)) platform.set(name, [headers.slice()]);
  const scope = `PROGRAM:${PROGRAM_IDS[0]}`;
  platform.set('AcademyAccessMatrix', [[...MATRIX_BASE, scope], ['account-0002', 'Synthetic learner 2', 'ACTIVE', 'SENIOR|TEACHER']]);
  add('AcademyAccessScopes', { ScopeKey: scope, ScopeType: 'PROGRAM', ScopeID: PROGRAM_IDS[0], ReviewStatus: 'REQUIRED' });
  add('AcademyAccessReview', { ReviewID: 'review-1', AccountID: 'account-0002', ScopeKey: scope, ReviewStatus: 'REQUIRED', SourceValue: 'SENIOR|TEACHER' });
  const workbooks = [{ kind: 'PLATFORM', spreadsheetId: 'synthetic_platform_1',
    tabs: [...platform].map(([title, rows], sheetId) => ({ title, sheetId, rows })) }];
  for (const [index, id] of PROGRAM_IDS.entries()) {
    const tables = Object.fromEntries(Object.entries(TIMETABLE_HEADERS).map(([name, headers]) => [name, [headers.slice()]]));
    const current = { ProgramSubjects: [], ProgramLevels: [], ProgramModules: [], ProgramTasks: [], ProgramResources: [],
      ProgramClasses: [{ ClassID: `class-${index+1}`, CourseID: id, Name: 'Synthetic class', Active: true }],
      ProgramEnrollments: [], ProgramTeachers: [{ AccountID: 'account-0003', Active: true }], ProgramModuleProgress: [], ProgramLibraryRoots: [] };
    for (let i = 1; i <= count; i++) if (i % 2 === index) current.ProgramEnrollments.push({ EnrollmentID: `enrollment-${i}`, CourseID: id,
      ClassID: `class-${index+1}`, AccountID: `account-${String(i).padStart(4, '0')}`, Active: true });
    tables.ProgramManagementState.push(values(TIMETABLE_HEADERS.ProgramManagementState, { Revision: 'management-1', CourseID: id,
      Sequence: 1, SnapshotJSON: JSON.stringify(current) }));
    tables.ProgramTimetablePublications.push(values(TIMETABLE_HEADERS.ProgramTimetablePublications, { PublicationID: `program-publication-${index+1}`,
      CourseID: id, VersionNo: 1, SnapshotJSON: JSON.stringify({ programId: id, schema: '105.3.2.2-weekly', format: '105.3.2.2-weekly', effectiveFrom: '2026-10-01', rules: [] }) }));
    tables.ProgramTimetableState.push(values(TIMETABLE_HEADERS.ProgramTimetableState, { Revision: 'draft-1', CourseID: id,
      Sequence: 1, CurrentPublicationID: `program-publication-${index+1}`, DraftJSON: JSON.stringify({ rules: [], exceptions: [] }) }));
    workbooks.push({ kind: 'PROGRAM', courseId: id, spreadsheetId: `synthetic_program_${index+1}`,
      tabs: [{ title: 'ProgramIdentity', sheetId: 0, rows: [IDENTITY_HEADERS.slice(), [id, PROGRAM_SCHEMA]] },
        ...Object.entries(tables).map(([title, rows], i) => ({ title, rows, sheetId: i+1 })),
        { title: 'Unknown future tab', sheetId: 100, rows: [['future', 'value'], ['preserve', false], [], ['零', null, 7]] }] });
  }
  workbooks.push({ kind: 'LEGACY', courseId: 'legacy-1', spreadsheetId: 'synthetic_legacy_1',
    tabs: [{ title: 'Old operational records', sheetId: 0, rows: [['Identifier', 'Value'], ['legacy-record-1', 'preserve exactly']] }] });
  for (const book of workbooks) book.inventory = book.tabs.map(t => ({ sheetId: t.sheetId, title: t.title }));
  return { format: FORMAT, environment: 'local', consistency: 'ONLINE_NON_ATOMIC', startedAt: timestamp, completedAt: timestamp, workbooks };
}
export const fixtureTab = (snapshot, name, book = 0) => snapshot.workbooks[book].tabs.find(t => t.title === name);
