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
  timetable:{catalog:async()=>({classes:[{id:'CLS-1',name:'Level 1',active:true,classTeacherId:'TEACHER'}],enrollments:[{active:true,classId:'CLS-1',accountId:'LEARNER',startDate:'',endDate:''}]})},
  plan:(_data,items)=>items,
  async apply(items){for(const item of items)tables[item.table].push(item.record);}
};
let clock='2026-10-06T09:00:00Z';
const service=attendanceService(repository,program,()=>new Date(clock));
const admin={role:'GLOBAL_ADMIN',accountid:'ADMIN'};
const coTeacher={role:'ACCOUNT',accountid:'CO_TEACHER',programRoles:['TEACHER']};
const coTeacherView=await service.read(date,coTeacher);
assert.deepEqual(coTeacherView.lessons.map(row=>row.lesson.anchor),['RULE-READ@2']);
assert.deepEqual(coTeacherView.classes.map(row=>row.name),['Level 1']);
assert.equal((await service.plan('save',{date,scope:'day',exceptions:{},operationId:crypto.randomUUID()},coTeacher,'co-teacher-hash')).result.submittedLessons,1);
let view=await service.read(date,admin);
assert.deepEqual(view.program,{id:program.id,name:program.name},'Attendance responses do not expose the Program spreadsheet ID');
assert.equal(view.complete,false);
assert.equal(view.classes.length,1);
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
const oldRegister=view.lessons[0].registerId;
clock='2026-10-07T09:00:00Z';
const edit=await service.plan('save',{date,scope:'lesson',classId:'CLS-1',anchor:'RULE-READ@2',
  baseRegisterIds:{'RULE-READ@2':oldRegister},
  exceptions:{'RULE-READ@2':[{accountId:'LEARNER',status:'EXCUSED'}]},operationId:crypto.randomUUID()},admin,'edit-hash');
assert.equal(edit.result.editedLessons,1,'Teachers can amend a submitted register on an earlier day');
await service.apply(edit.plan);
view=await service.read(date,admin);
assert.equal(view.lessons[0].marks[0].status,'EXCUSED');
assert.equal(view.lessons[0].submitted,true);
assert.equal(tables.ProgramAttendanceRegisters.length,3,'The original submission remains in the audit history');
await assert.rejects(()=>service.plan('save',{date,scope:'lesson',classId:'CLS-1',anchor:'RULE-READ@2',
  baseRegisterIds:{'RULE-READ@2':oldRegister},exceptions:{},operationId:crypto.randomUUID()},admin,'stale-hash'),/changed/);
await assert.rejects(()=>service.plan('save',{date:'2026-10-07',scope:'lesson',anchor:'RULE-READ@2',exceptions:{},operationId:crypto.randomUUID()},admin,'fourth-hash'),/No published lessons/);
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

const sharedRule={...rules[0],classIds:['CLS-1','CLS-2'],classNames:['Level 1','Level 2']};
const sharedSnapshot={...snapshot,rules:[sharedRule]};
const sharedPublications=[{...publications[0],SnapshotJSON:JSON.stringify(sharedSnapshot)}];
const sharedTables={ProgramAttendanceRegisters:[],ProgramAttendanceMarks:[],ProgramAttendanceOperations:[]};
const sharedAccounts=[
  {AccountID:'LEARNER',DisplayName:'Learner 1',Active:true,Roles:['STUDENT']},
  {AccountID:'LEARNER-2',DisplayName:'Learner 2',Active:true,Roles:['STUDENT']}
];
const sharedCatalog={
  classes:[{id:'CLS-1',name:'Level 1',active:true,classTeacherId:'CLASS-TEACHER'},
    {id:'CLS-2',name:'Level 2',active:true,classTeacherId:'OTHER-TEACHER'}],
  enrollments:[{active:true,classId:'CLS-1',accountId:'LEARNER',startDate:'',endDate:''},
    {active:true,classId:'CLS-2',accountId:'LEARNER-2',startDate:'',endDate:''}]
};
const sharedRepository={
  async load(){return {prepared:true,source:{prepared:true,tables:{ProgramTimetablePublications:sharedPublications}},tables:sharedTables};},
  accounts:async()=>sharedAccounts,
  timetable:{catalog:async()=>sharedCatalog},
  plan:(_data,items)=>items,
  async apply(items){for(const item of items)sharedTables[item.table].push(item.record);}
};
const sharedService=attendanceService(sharedRepository,program,()=>new Date('2026-10-06T09:00:00Z'));
const classTeacher={role:'ACCOUNT',accountid:'CLASS-TEACHER',programRoles:['TEACHER']};
let sharedView=await sharedService.read(date,admin);
assert.deepEqual(sharedView.classes.map(row=>row.name),['Level 1','Level 2']);
assert.deepEqual(sharedView.lessons.map(row=>row.lesson.anchor),['RULE-READ@2::CLS-1','RULE-READ@2::CLS-2']);
assert.deepEqual((await sharedService.read(date,classTeacher)).classes.map(row=>row.name),['Level 1'],
  'A class teacher sees their class even when another teacher teaches its lesson');
const classOne=await sharedService.plan('save',{date,classId:'CLS-1',scope:'day',exceptions:{},
  operationId:crypto.randomUUID()},classTeacher,'class-one');
await sharedService.apply(classOne.plan);
sharedView=await sharedService.read(date,admin);
assert.equal(sharedView.submittedLessons,1);
assert.equal(sharedView.lessons[0].submitted,true);
assert.equal(sharedView.lessons[1].submitted,false,'Submitting one class leaves another class unknown');
assert.equal(sharedTables.ProgramAttendanceMarks.length,1,'Only the selected class learner is saved');
await assert.rejects(()=>sharedService.plan('save',{date,classId:'CLS-2',scope:'day',exceptions:{},
  operationId:crypto.randomUUID()},classTeacher,'wrong-class'),/unavailable/);

const legacyLesson=scheduledLessons(sharedPublications,program,date)[0];
const legacyRegister={RegisterID:'REG-LEGACY',CourseID:program.id,AttendanceDate:date,PublicationID:legacyLesson.publicationId,
  LessonAnchor:legacyLesson.anchor,LessonJSON:JSON.stringify(legacyLesson),LearnerCount:2,
  SubmittedDate:'2026-10-06T08:00:00Z',SubmittedByAccountID:'ADMIN',OperationID:'OLD'};
const legacyRepository={...sharedRepository,async load(){return {prepared:true,
  source:{prepared:true,tables:{ProgramTimetablePublications:sharedPublications}},
  tables:{ProgramAttendanceRegisters:[legacyRegister],ProgramAttendanceMarks:[
    {MarkID:'MARK-OLD-1',RegisterID:'REG-LEGACY',AccountID:'LEARNER',DisplayName:'Learner 1',Status:'PRESENT'},
    {MarkID:'MARK-OLD-2',RegisterID:'REG-LEGACY',AccountID:'LEARNER-2',DisplayName:'Learner 2',Status:'ABSENT'}],
    ProgramAttendanceOperations:[]}};}};
const legacyView=await attendanceService(legacyRepository,program,()=>new Date('2026-10-06T09:00:00Z')).read(date,admin);
assert.equal(legacyView.classes.at(-1).name,'Combined earlier register');
assert.deepEqual(legacyView.lessons[0].marks.map(row=>row.status),['PRESENT','ABSENT'],
  'Old shared registers retain their actual roster without projecting later class assignments');
assert.equal((await attendanceService(legacyRepository,program,()=>new Date('2026-10-06T09:00:00Z')).read(date,classTeacher)).lessons[0].lesson.classId,
  'COMBINED','A class teacher can review an earlier combined register for their class');
console.log('Program attendance: class columns, permissions, class-scoped submission, editable history and combined legacy registers passed.');
