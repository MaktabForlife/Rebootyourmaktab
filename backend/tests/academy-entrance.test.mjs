import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildEntrance, REBOOT_PILOT_PROGRAM_ID, programRoles } from '../src/academy/entrance.js';
import { academyEntranceEndpoint } from '../src/routes/academy-entrance.js';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import { readWeeklyDraft, validateWeeklyTimetable } from '../src/programs/weekly-timetable.js';

// Synthetic records only; production account and learner data are never needed here.
function source(id) {
  const f = timetableFixture();
  const previous = f.program.id;
  f.program = { ...f.program, id, name: id === REBOOT_PILOT_PROGRAM_ID ? 'Reboot (Pilot)' : 'Second Program',
    mode: 'PROGRAM', capabilities: { attendance: true } };
  for (const rows of Object.values(f.tables)) for (const row of rows) if (row.CourseID === previous) row.CourseID = id;
  f.catalog.subjects.forEach(row => { row.courseId = id; });
  f.catalog.classes.forEach(row => { row.courseId = id; });
  f.catalog.enrollments.forEach(row => { row.courseId = id; });
  f.tables.ProgramEnrollments.splice(1); // The student only belongs to one of the two combined classes.
  const snapshot = validateWeeklyTimetable(readWeeklyDraft(f.draft).draft, f.catalog, f.program, '2026-09-29').snapshot;
  snapshot.effectiveFrom = '2026-09-29';
  f.tables.ProgramTimetablePublications.push({ PublicationID: 'PUB1', VersionNo: 1, CourseID: id,
    PublishedDate: '2026-09-29T00:00:00Z', SnapshotJSON: JSON.stringify(snapshot) });
  return { program: f.program, data: { prepared: true, tables: f.tables, subjects: f.shared.subjects } };
}
const first = source(REBOOT_PILOT_PROGRAM_ID), second = source('PRG-second');
const tables = Object.fromEntries(['UserAccounts', 'PlatformConfig', 'GlobalSubjectList', 'GlobalModuleList',
  'GlobalSubjectAccessPolicy', 'GlobalSubjectAccessMatrix', 'GlobalSubjectRuns', 'GlobalTimetableRunState',
  'GlobalTimetablePublications', 'GlobalTimetableSessionLifecycle', 'PublishedGlobalTimetableSessions'].map(name => [name, []]));
tables.PlatformConfig = [{ ConfigKey: 'PlatformTimezone', ConfigValue: 'Asia/Riyadh' }];
tables.UserAccounts = ['LEARNER-DEMO', 'TEACHER-1', 'HOD', 'ADMIN', 'OUTSIDER'].map(AccountID => ({ AccountID, Active: true }));
tables.GlobalSubjectList = [{ SubjectID: 'SUB1', SubjectName: 'Salaah', Active: true }];
tables.GlobalModuleList = [{ ModuleID: 'MOD1', SubjectID: 'SUB1', ModuleName: 'Purification', Active: true }];
tables.GlobalSubjectAccessPolicy = [{ SubjectID: 'SUB1', AccessModel: 'SUBSCRIPTION', Active: true }];
tables.GlobalSubjectAccessMatrix = [{ AccountID: 'LEARNER-DEMO', _subjectAccess: { SUB1: true } }];
tables.GlobalSubjectRuns = [{ RunID: 'RUN1', SubjectID: 'SUB1', RunName: 'Salaah workshop', Active: true,
  StartDate: '2026-09-01', EndDate: '2026-12-31', Timezone: 'Asia/Riyadh', AccessModel: 'PAID' }];
tables.GlobalTimetableRunState = [{ RunID: 'RUN1', Stage: 'PUBLISHED', CurrentPublicationID: 'GPUB1' }];
tables.GlobalTimetablePublications = [{ PublicationID: 'GPUB1', RunID: 'RUN1', SubjectID: 'SUB1', VersionNo: 1,
  PublishedDate: '2026-09-01T00:00:00Z', PublishedByAccountID: 'ADMIN', PublishedByAccountName: 'Admin', SessionCount: 1 }];
tables.PublishedGlobalTimetableSessions = [{ PublishedSessionID: 'GPS1', PublicationID: 'GPUB1', SourceSessionID: 'GS1',
  RunID: 'RUN1', SubjectID: 'SUB1', ModuleID: 'MOD1', SessionDate: '2026-09-30', StartTime: '13:00', EndTime: '14:00',
  TeacherAccountID: 'TEACHER-1', TeacherName: 'Course teacher', ZoomLink: 'https://zoom.test/course',
  PublishedDate: '2026-09-01T00:00:00Z', PublishedByAccountID: 'ADMIN', PublishedByAccountName: 'Admin',
  SubjectName: 'Salaah', ModuleName: 'Purification', RunName: 'Salaah workshop', Timezone: 'Asia/Riyadh' }];
const grants = [{ AccountID: 'LEARNER-DEMO', Active: true, Roles: ['STUDENT'] },
  { AccountID: 'TEACHER-1', Active: true, Roles: ['TEACHER'] }, { AccountID: 'HOD', Active: true, Roles: ['ADMIN'] }];
const rolesByProgram = { [first.program.id]: grants, [second.program.id]: [{ AccountID: 'LEARNER-DEMO', Active: true, Roles: ['TEACHER'] }] };
const loaded = [];
const args = { tables, rolesByProgram, programs: [first.program, second.program,
  { id: 'COURSE1', name: 'Legacy Reboot', mode: 'LEGACY', status: 'ACTIVE' }], now: new Date('2026-09-30T11:30:00Z'),
  loadProgram: async program => { loaded.push(program.id); return structuredClone(program.id === first.program.id ? first.data : second.data); } };
const account = (accountid, role = 'STUDENT') => ({ type: 'account', accountid, role });
const visitor = await buildEntrance(args);
assert.equal(visitor.activities.find(row => row.id === REBOOT_PILOT_PROGRAM_ID).name, 'Reboot');
assert(visitor.activities.some(row => row.kind === 'COURSE' && row.name === 'Salaah'));
assert.equal(visitor.personalActivities.length, 0);
assert(visitor.timetable.length > 0);
assert(visitor.timetable.every(row => !row.information && !row.joinUrl && !row.relevant));
assert(!JSON.stringify(visitor).includes('LEARNER-DEMO'));
assert(!JSON.stringify(visitor).includes('Course teacher'));
assert(!loaded.includes('COURSE1'), 'The gateway never loads legacy Reboot');
const student = await buildEntrance({ ...args, user: account('LEARNER-DEMO') });
assert.equal(student.student, true);
assert.deepEqual(student.personalActivities.find(row => row.id === first.program.id).roles, ['STUDENT']);
assert.deepEqual(student.personalActivities.find(row => row.id === second.program.id).roles, ['TEACHER']);
assert(student.timetable.some(row => row.kind === 'PROGRAM' && row.involvement === 'student'));
assert(student.timetable.every(row => !row.joinUrl), 'Home must never contain joining links');
const detailed = await buildEntrance({ ...args, user: account('LEARNER-DEMO'), input: { id: first.program.id } });
assert.deepEqual(detailed.activity.classes.map(row => row.id), ['CLASS-1']);
assert.equal(detailed.activity.curriculum[0].name, 'Tafseer');
assert(detailed.activity.timetable.some(row => row.joinUrl?.includes('zoom.us')));
assert.equal(detailed.activity.tools.attendance, '');
const teacher = await buildEntrance({ ...args, user: account('TEACHER-1') });
assert(teacher.timetable.some(row => row.kind === 'PROGRAM' && row.involvement === 'teacher'));
assert(teacher.timetable.some(row => row.kind === 'COURSE' && row.involvement === 'teacher'));
const teacherView = await buildEntrance({ ...args, user: account('TEACHER-1'), input: { id: first.program.id } });
assert.match(teacherView.activity.tools.attendance, new RegExp(encodeURIComponent(first.program.id)));
assert.equal(teacherView.activity.tools.manage, '', 'Teacher grants cannot bypass the management service');
const hod = await buildEntrance({ ...args, user: account('HOD'), input: { id: first.program.id } });
assert.equal(hod.activity.tools.manage, '', 'HOD management remains pending while its backend is Global Admin only');
assert(hod.activity.tools.attendance);
const admin = await buildEntrance({ ...args, user: account('ADMIN', 'GLOBAL_ADMIN'), input: { id: first.program.id } });
assert.equal(admin.globalAdmin, true);
assert(admin.activity.tools.manage && admin.activity.tools.timetableBuilder);
const outsider = await buildEntrance({ ...args, user: account('OUTSIDER'), input: { id: first.program.id } });
assert.equal(outsider.activity.curriculum.length, 0);
assert.equal(outsider.activity.classes.length, 0);
assert(outsider.activity.timetable.every(row => !row.joinUrl && !row.information));
const expired = structuredClone(first.data);
expired.tables.ProgramEnrollments[0].EndDate = '2026-09-29';
const formerStudent = await buildEntrance({ ...args, user: account('LEARNER-DEMO'), input: { id: first.program.id }, loadProgram: async () => expired });
assert(formerStudent.activity.timetable.every(row => !row.joinUrl && !row.relevant));
assert.deepEqual(programRoles(account('LEARNER-DEMO'), [{ AccountID: 'LEARNER-DEMO', Active: false, Roles: ['STUDENT'] }]), []);
const unavailable = await buildEntrance({ ...args, loadProgram: async () => { throw Error('private sheet error'); } });
assert(unavailable.warnings.length);
assert(!JSON.stringify(unavailable).includes('private sheet error'));
await assert.rejects(buildEntrance({ ...args, input: { startDate: '2026-02-30' } }));
await assert.rejects(buildEntrance({ ...args, input: { id: 'COURSE1' } }), error => error.status === 404);
await assert.rejects(buildEntrance({ ...args, user: account('REMOVED') }), error => error.status === 401);
const writesBefore = JSON.stringify(first.data);
await buildEntrance(args);
assert.equal(JSON.stringify(first.data), writesBefore, 'The entrance does not write Program data');
for (const [method, body, expected] of [['GET', undefined, 405], ['POST', '{', 400], ['POST', '[]', 400], ['POST', 'x'.repeat(2049), 413]]) {
  const response = await academyEntranceEndpoint(new Request('https://test/api/academy/entrance', { method, body }), {});
  assert.equal(response.status, expected);
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
const html = await readFile(new URL('../../academy/index.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /sample completion|connection plan|demo role/i);
assert.match(html, /ummabbadacademy\.com/);
assert.match(html, /Coming soon/);
assert.match(html, /lesson-information/);
console.log('Academy entrance: public redaction, published Programs/Courses, mixed roles, current joins, isolated tools, revoked access and read-only boundaries passed.');
