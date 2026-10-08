import assert from 'node:assert/strict';
import { attendanceService } from '../src/programs/attendance-service.js';
import { scheduledLessons, dayView, lessonRoster, readRegisters } from '../src/programs/attendance-model.js';
import { attendanceRepository } from '../src/programs/attendance-repository.js';
import { ATTENDANCE_HEADERS } from '../src/programs/attendance-model.js';
import { WEEKLY_SCHEMA } from '../src/programs/weekly-timetable.js';
import { readWeeklyDraft } from '../src/programs/weekly-timetable.js';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';

const date='2026-10-06',program={id:'PRG-11111111-1111-4111-8111-111111111111',name:'Alimiyah',status:'DRAFT',spreadsheetId:'private-sheet-id'};
const rules=['READ','WRITE'].map((name,index)=>({id:`RULE-${name}`,moduleId:`MOD-${name}`,moduleName:name,subjectName:'Arabic',
  weekdays:[2],startTime:index?'10:00':'09:00',endTime:index?'11:00':'10:00',classIds:['CLS-1'],classNames:['Level 1'],teacherId:'TEACHER',teacherName:'Teacher'}));
const snapshot={schema:WEEKLY_SCHEMA,format:WEEKLY_SCHEMA,programId:program.id,programName:program.name,effectiveFrom:'2026-10-01',rules,
  breaks:[{id:'BREAK-1',label:'Break',weekdays:[2],startTime:'11:00',endTime:'11:15'}]};
rules[0].teacherIds=['TEACHER','CO_TEACHER'];
rules[0].teacherNames=['Teacher','Co-teacher'];
const publications=[{PublicationID:'PUB-1',CourseID:program.id,VersionNo:1,PublishedDate:'2026-09-30',PublishedByAccountID:'ADMIN',SnapshotJSON:JSON.stringify(snapshot)}];
const lessonRows=scheduledLessons(publications,program,date);
assert.equal(lessonRows.length,2,'Timetable breaks have no attendance register');
assert.deepEqual(lessonRows[0].teacherNames,['Teacher','Co-teacher']);
assert.equal(scheduledLessons(publications,program,'2026-10-07').length,0);
assert.deepEqual(lessonRoster(lessonRows[0],[{active:true,classId:'CLS-1',accountId:'LEARNER',startDate:'',endDate:''},{active:true,classId:'CLS-1',accountId:'LEARNER',startDate:'',endDate:''}],
  [{AccountID:'LEARNER',DisplayName:'Learner',Active:true,Roles:['STUDENT']}],date),[{accountId:'LEARNER',name:'Learner'}]);

const tables={ProgramAttendanceRegisters:[],ProgramAttendanceMarks:[],ProgramAttendanceOperations:[]};
const source={prepared:true,tables:{ProgramTimetablePublications:publications}};
const repository={
  async load(){return {prepared:true,source,tables};},
  accounts:async()=>[{AccountID:'LEARNER',DisplayName:'Learner',Active:true,Roles:['STUDENT']}],
  timetable:{catalog:async()=>({enrollments:[{active:true,classId:'CLS-1',accountId:'LEARNER',startDate:'',endDate:''}]})},
  plan:(_data,items)=>items,
  async apply(items){for(const item of items)tables[item.table].push(item.record);}
};
const service=attendanceService(repository,program,()=>new Date('2026-10-06T09:00:00Z'));
const admin={role:'GLOBAL_ADMIN',accountid:'ADMIN'};
const coTeacher={role:'ACCOUNT',accountid:'CO_TEACHER',programRoles:['TEACHER']};
const coTeacherView=await service.read(date,coTeacher);
assert.deepEqual(coTeacherView.lessons.map(row=>row.lesson.anchor),['RULE-READ@2']);
assert.equal((await service.plan('save',{date,scope:'day',exceptions:{},operationId:crypto.randomUUID()},coTeacher,'co-teacher-hash')).result.submittedLessons,1);
let view=await service.read(date,admin);
assert.deepEqual(view.program,{id:program.id,name:program.name},'Attendance responses do not expose the Program spreadsheet ID');
assert.equal(view.complete,false);
assert.equal(view.learners[0].status,'UNKNOWN','Unsubmitted lessons do not count as Present');
const first=await service.plan('save',{date,scope:'lesson',anchor:'RULE-READ@2',exceptions:{'RULE-READ@2':[{accountId:'LEARNER',status:'ABSENT'}]},operationId:crypto.randomUUID()},admin,'first-hash');
await service.apply(first.plan);
view=await service.read(date,admin);
assert.equal(view.submittedLessons,1);
assert.equal(view.learners[0].status,'UNKNOWN','A partly submitted day remains unknown');
assert.equal(view.lessons[1].marks[0].status,null);
const second=await service.plan('save',{date,scope:'day',exceptions:{},operationId:crypto.randomUUID()},admin,'second-hash');
assert.equal(second.result.submittedLessons,1,'Submit all skips previously submitted lesson registers');
await service.apply(second.plan);
view=await service.read(date,admin);
assert.equal(view.complete,true);
assert.equal(view.learners[0].status,'PARTIAL');
assert.deepEqual(view.lessons.map(row=>row.marks[0].status),['ABSENT','PRESENT']);
assert.equal(tables.ProgramAttendanceRegisters.length,2);
assert.equal(tables.ProgramAttendanceMarks.length,2);
assert.equal(tables.ProgramAttendanceOperations.length,2);
assert.throws(()=>readRegisters(tables.ProgramAttendanceRegisters,tables.ProgramAttendanceMarks.slice(1),program.id),/missing learner marks/);
assert.equal(await service.receipt(tables.ProgramAttendanceOperations[1].OperationID,'second-hash').then(row=>row.replayed),true);
await assert.rejects(()=>service.plan('save',{date,scope:'day',exceptions:{},operationId:crypto.randomUUID()},admin,'third-hash'),/already been submitted/);
await assert.rejects(()=>service.plan('save',{date:'2026-10-05',scope:'day',exceptions:{},operationId:crypto.randomUUID()},admin,'fourth-hash'),/current Program day/);
assert.equal(dayView(date,lessonRows,new Map(),()=>[{accountId:'LEARNER',name:'Learner'}]).learners[0].status,'UNKNOWN');
const properties=Object.keys(ATTENDANCE_HEADERS).map((title,sheetId)=>({title,sheetId,rowCount:1000}));
const bulk=attendanceRepository({},program).plan({prepared:true,properties,tables:Object.fromEntries(properties.map(row=>[row.title,[]]))},[
  {table:'ProgramAttendanceRegisters',record:tables.ProgramAttendanceRegisters[0]},
  {table:'ProgramAttendanceRegisters',record:tables.ProgramAttendanceRegisters[1]},
  {table:'ProgramAttendanceMarks',record:tables.ProgramAttendanceMarks[0]},
  {table:'ProgramAttendanceMarks',record:tables.ProgramAttendanceMarks[1]},
  {table:'ProgramAttendanceOperations',record:tables.ProgramAttendanceOperations[0]}
]);
assert.equal(bulk.requests.length,3,'One contiguous write per attendance table');
assert.equal(bulk.requests[0].updateCells.start.rowIndex,1,'The first data row is below the header');
assert.equal(bulk.requests[0].updateCells.rows.length,2,'Both lesson registers are saved in the same batch');
assert.equal(bulk.requests[1].updateCells.rows.length,2,'Learner marks are not overwritten by a second lesson');
const fixture=timetableFixture();fixture.repository.hasAttendanceOn=async selected=>selected===date;
const timetable=timetableService(fixture.repository,fixture.program,()=>new Date('2026-10-06T09:00:00Z'));
await assert.rejects(()=>timetable.plan('publish',{revision:'',effectiveFrom:date,draft:readWeeklyDraft(fixture.draft).draft,operationId:crypto.randomUUID()},admin,'publication-hash'),
  /Attendance has already been submitted today/);
console.log('Program attendance: scheduled lessons, enrollment, unknown registers, one/all submission, partial day, retry receipt and current-day limit passed.');
