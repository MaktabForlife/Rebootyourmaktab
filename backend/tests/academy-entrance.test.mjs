import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildEntrance, REBOOT_PILOT_PROGRAM_ID, programRoles, lessonTimes } from '../src/academy/entrance.js';
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
assert.deepEqual(visitor.personalTimetable, []);
assert(visitor.timetable.length > 0);
assert(visitor.timetable.every(row => !row.information && !row.joinUrl && !row.relevant));
assert(visitor.timetable.every(row => !row.meetingGroup && !row.subjectName && !row.moduleName), 'Visitors receive no protected room or lesson metadata');
assert(!JSON.stringify(visitor).includes('LEARNER-DEMO'));
assert(!JSON.stringify(visitor).includes('Course teacher'));
assert(!loaded.includes('COURSE1'), 'The gateway never loads legacy Reboot');
const student = await buildEntrance({ ...args, user: account('LEARNER-DEMO') });
assert.equal(student.student, true);
assert.deepEqual(student.personalActivities.find(row => row.id === first.program.id).roles, ['STUDENT']);
assert.deepEqual(student.personalActivities.find(row => row.id === second.program.id).roles, ['TEACHER']);
assert(student.timetable.some(row => row.kind === 'PROGRAM' && row.involvement === 'student'));
assert(student.timetable.every(row => !row.joinUrl), 'Home must never contain joining links');
assert(student.personalTimetable.some(row => row.kind === 'PROGRAM'));
assert(student.personalTimetable.some(row => row.kind === 'COURSE'));
assert(student.personalTimetable.every(row => row.relevant && row.status === 'SCHEDULED' && !row.joinUrl));
assert(!student.personalTimetable.some(row => row.activityId === second.program.id), 'An unassigned teaching role does not make every lesson personal');
for (let i = 1; i < student.personalTimetable.length; i++) assert(student.personalTimetable[i - 1].startsAt <= student.personalTimetable[i].startsAt);

const detailed = await buildEntrance({ ...args, user: account('LEARNER-DEMO'), input: { id: first.program.id } });
assert.deepEqual(detailed.activity.classes.map(row => row.id), ['CLASS-1']);
assert.equal(detailed.activity.curriculum[0].name, 'Tafseer');
assert(detailed.activity.timetable.some(row => row.joinUrl?.includes('zoom.us')));
const otherPage = await buildEntrance({ ...args, user: account('LEARNER-DEMO'), input: { id: 'SUB1' } });
assert.deepEqual(otherPage.personalTimetable, detailed.personalTimetable, 'Every activity shows the same integrated personal Academy timetable');
assert.deepEqual(otherPage.personalActivities, detailed.personalActivities, 'The subscription strip must retain all Programs and Courses');
assert.equal(detailed.personalActivities.length, student.personalActivities.length);
assert(detailed.personalTimetable.some(row => row.kind === 'COURSE'));
assert(otherPage.personalTimetable.some(row => row.kind === 'PROGRAM'));
const multiProgramArgs = { ...args, user: account('LEARNER-DEMO'), rolesByProgram: { ...rolesByProgram,
  [second.program.id]: [{ AccountID: 'LEARNER-DEMO', Active: true, Roles: ['STUDENT'] }] } };
const firstProgramPage = await buildEntrance({ ...multiProgramArgs, input: { id: first.program.id } });
const secondProgramPage = await buildEntrance({ ...multiProgramArgs, input: { id: second.program.id } });
assert.deepEqual(firstProgramPage.personalTimetable, secondProgramPage.personalTimetable);
assert.deepEqual(new Set(firstProgramPage.personalTimetable.filter(row => row.kind === 'PROGRAM').map(row => row.activityId)), new Set([first.program.id, second.program.id]));
const revokedCourseTables = structuredClone(tables);
revokedCourseTables.GlobalSubjectAccessMatrix = [];
const revokedCourse = await buildEntrance({ ...args, tables: revokedCourseTables, user: account('LEARNER-DEMO'), input: { id: first.program.id } });
assert(!revokedCourse.personalTimetable.some(row => row.kind === 'COURSE'), 'Revoked Course access removes its lessons and joining links');
const targetLesson = detailed.personalTimetable.find(row => row.kind === 'PROGRAM');
for (const [offset, canJoin] of [[-300001, false], [-300000, true], [0, true], [3599999, true], [3600000, false]]) {
  const view = await buildEntrance({ ...args, now: new Date(targetLesson.startsAt + offset), user: account('LEARNER-DEMO'),
    input: { id: first.program.id, startDate: targetLesson.date } });
  const event = view.personalTimetable.find(row => row.activityId === targetLesson.activityId && row.startsAt === targetLesson.startsAt);
  assert.equal(Boolean(event?.joinUrl), canJoin, `Program join boundary ${offset}`);
}
const courseLesson = detailed.personalTimetable.find(row => row.kind === 'COURSE');
for (const [offset, canJoin] of [[-300001, false], [-300000, true], [0, true], [3599999, true], [3600000, false]]) {
  const view = await buildEntrance({ ...args, now: new Date(courseLesson.startsAt + offset), user: account('LEARNER-DEMO'),
    input: { id: first.program.id, startDate: courseLesson.date } });
  const event = view.personalTimetable.find(row => row.kind === 'COURSE' && row.startsAt === courseLesson.startsAt);
  assert.equal(Boolean(event?.joinUrl), canJoin, `Course join boundary ${offset}`);
}
const cancelledTables = structuredClone(tables);
cancelledTables.GlobalTimetableSessionLifecycle.push({ SessionLifecycleID: 'GLIFE1', SessionID: 'GS1', PublicationID: 'GPUB1', Status: 'CANCELLED' });
const cancelledCourse = await buildEntrance({ ...args, tables: cancelledTables, user: account('LEARNER-DEMO'), input: { id: first.program.id } });
assert(!cancelledCourse.personalTimetable.some(row => row.kind === 'COURSE'), 'Cancelled Courses must not enter the personal timetable');
const overnight = lessonTimes({ date: '2026-10-05', startTime: '23:58', endTime: '00:30', timezone: 'Asia/Riyadh' });
assert.equal(new Date(overnight.joinAvailableAt).toISOString(), '2026-10-05T20:53:00.000Z');
assert.equal(new Date(overnight.endsAt).toISOString(), '2026-10-05T21:30:00.000Z');
assert.equal(new Date(lessonTimes({ date: '2026-10-05', startTime: '09:00', endTime: '10:00', timezone: 'America/New_York' }).startsAt).toISOString(), '2026-10-05T13:00:00.000Z');
assert(Number.isNaN(lessonTimes({ date: '2026-03-08', startTime: '02:30', endTime: '03:30', timezone: 'America/New_York' }).startsAt));
assert.equal(detailed.activity.tools.attendance, '');
assert.equal(detailed.activity.tools.resources, '');
const teacher = await buildEntrance({ ...args, user: account('TEACHER-1') });
assert(teacher.timetable.some(row => row.kind === 'PROGRAM' && row.involvement === 'teacher'));
assert(teacher.timetable.some(row => row.kind === 'COURSE' && row.involvement === 'teacher'));
const teacherView = await buildEntrance({ ...args, user: account('TEACHER-1'), input: { id: first.program.id } });
assert.match(teacherView.activity.tools.attendance, new RegExp(encodeURIComponent(first.program.id)));
assert.equal(teacherView.activity.tools.manage, '', 'Teacher grants cannot bypass the management service');
assert.equal(teacherView.activity.tools.resources, '', 'Do not substitute the Program-wide editor for assigned-class Library management');
assert.equal(teacherView.activity.tools.users, '');
const hod = await buildEntrance({ ...args, user: account('HOD'), input: { id: first.program.id } });
assert.equal(hod.activity.tools.manage, '', 'HOD management remains pending while its backend is Global Admin only');
assert(hod.activity.tools.attendance);
assert.equal(hod.activity.tools.resources, '', 'Program admins also require the assigned-class Library editor');
assert.equal(hod.activity.tools.users, '', 'The existing User management service is Global Admin only');
const admin = await buildEntrance({ ...args, user: account('ADMIN', 'GLOBAL_ADMIN'), input: { id: first.program.id } });
assert.equal(admin.globalAdmin, true);
assert(admin.activity.tools.manage && admin.activity.tools.timetableBuilder);
assert.equal(admin.activity.tools.users, '/users/');
for (const view of [teacherView, hod, admin]) {
  for (const [tool, href] of Object.entries(view.activity.tools)) {
    if (!href || ['library', 'users'].includes(tool)) continue;
    const url = new URL(href, 'https://academy.test');
    assert.equal(url.searchParams.get('program'), first.program.id, `${tool} must carry the parameter its screen reads`);
    assert.equal(url.searchParams.has('id'), false);
  }
}
const outsider = await buildEntrance({ ...args, user: account('OUTSIDER'), input: { id: first.program.id } });
assert.equal(outsider.activity.curriculum.length, 0);
assert.equal(outsider.activity.classes.length, 0);
assert(outsider.activity.timetable.every(row => !row.joinUrl && !row.information));
assert.deepEqual(outsider.personalTimetable, []);
assert(outsider.activity.timetable.every(row => !row.meetingGroup), 'An unauthorised account receives no room grouping metadata');
assert.equal(admin.personalTimetable.length, visitor.timetable.filter(row => row.status === 'SCHEDULED').length, 'Global Admin sees every published Academy lesson');
assert.deepEqual(new Set(admin.personalTimetable.map(row => row.activityId)), new Set([first.program.id, second.program.id, 'SUB1']));
assert(admin.personalTimetable.every(row => row.information?.length && !row.involvement), 'Global oversight includes detail without labelling the admin as a participant');
const adminOtherPage = await buildEntrance({ ...args, user: account('ADMIN', 'GLOBAL_ADMIN'), input: { id: second.program.id } });
assert.deepEqual(adminOtherPage.personalTimetable, admin.personalTimetable, 'Global Admin retains the entire schedule across Program pages');
assert.deepEqual(hod.personalTimetable, [], 'Program Admin oversight remains limited to enrolled or assigned lessons');
for (const target of [admin.personalTimetable.find(row => row.kind === 'PROGRAM'), admin.personalTimetable.find(row => row.kind === 'COURSE')]) {
  for (const [offset, canJoin] of [[-300001, false], [-300000, true], [0, true], [3599999, true], [3600000, false]]) {
    const view = await buildEntrance({ ...args, now: new Date(target.startsAt + offset), user: account('ADMIN', 'GLOBAL_ADMIN'),
      input: { id: first.program.id, startDate: target.date } });
    const event = view.personalTimetable.find(row => row.activityId === target.activityId && row.startsAt === target.startsAt);
    assert.equal(Boolean(event?.joinUrl), canJoin, `Global Admin ${target.kind} join boundary ${offset}`);
  }
}
const cancelledAdmin = await buildEntrance({ ...args, tables: cancelledTables, user: account('ADMIN', 'GLOBAL_ADMIN'), input: { id: first.program.id } });
assert(!cancelledAdmin.personalTimetable.some(row => row.kind === 'COURSE'), 'Global Admin excludes cancelled lessons');
await assert.rejects(buildEntrance({ ...args, user: account('REMOVED', 'GLOBAL_ADMIN') }), error => error.status === 401);
const earlyAdmin = await buildEntrance({ ...args, now:new Date('2026-09-30T08:00:00Z'), user:account('ADMIN','GLOBAL_ADMIN'), input:{id:first.program.id} });
assert(earlyAdmin.personalTimetable.every(row=>row.meetingGroup && !row.joinUrl), 'Room grouping is available before joining opens without releasing joining URLs');
const roomKeys=earlyAdmin.personalTimetable.filter(row=>row.kind==='PROGRAM').map(row=>row.meetingGroup);
assert.equal(new Set(roomKeys).size,1,'Programs using the same room share a request-local group');
assert.notEqual(earlyAdmin.personalTimetable.find(row=>row.kind==='COURSE').meetingGroup,roomKeys[0],'Different rooms have different groups');
assert(!JSON.stringify(earlyAdmin).includes('https://example.zoom.us/j/123456789'));
const sharedRoomTables=structuredClone(tables);
sharedRoomTables.PublishedGlobalTimetableSessions[0].ZoomLink='https://example.zoom.us/j/123456789';
const sharedRooms=await buildEntrance({...args,tables:sharedRoomTables,now:new Date('2026-09-30T08:00:00Z'),user:account('ADMIN','GLOBAL_ADMIN'),input:{id:first.program.id}});
assert.equal(new Set(sharedRooms.personalTimetable.map(row=>row.meetingGroup)).size,1,'Course and Program lessons sharing a room can be combined');
const expired = structuredClone(first.data);
expired.tables.ProgramEnrollments[0].EndDate = '2026-09-29';
const formerStudent = await buildEntrance({ ...args, user: account('LEARNER-DEMO'), input: { id: first.program.id }, loadProgram: async () => expired });
assert(formerStudent.activity.timetable.every(row => !row.joinUrl && !row.relevant));
assert(!formerStudent.personalTimetable.some(row => row.kind === 'PROGRAM'));
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
