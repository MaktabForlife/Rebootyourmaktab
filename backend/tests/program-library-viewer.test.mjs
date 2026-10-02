import assert from 'node:assert/strict';
import { currentProgramEnrollment, programViewerRole, visibleProgramResources, requireVisibleProgramResource } from '../src/programs/library-viewer.js';

const program={id:'PRG-DEMO',timezone:'Africa/Johannesburg'};
const on=new Date('2026-10-02T10:00:00Z');
const tables={
  ProgramClasses:[{ClassID:'CLASS-1',CourseID:program.id,Active:true}],
  ProgramEnrollments:[{EnrollmentID:'ENR-1',CourseID:program.id,ClassID:'CLASS-1',AccountID:'STUDENT-1',StartDate:'2026-01-01',EndDate:'2026-12-31',Active:true}],
  ProgramSubjects:[{ProgramSubjectID:'PS-1',CourseID:program.id,SubjectID:'ARABIC',Active:true}],
  ProgramLevels:[{LevelID:'LVL-1',ProgramSubjectID:'PS-1',Name:'Level 1',Active:true}],
  ProgramModules:[{ProgramModuleID:'MOD-1',ProgramSubjectID:'PS-1',LevelID:'LVL-1',Name:'Grammar',Active:true}],
  ProgramTasks:[{TaskID:'TASK-1',CourseID:program.id,ProgramSubjectID:'PS-1',ProgramModuleID:'MOD-1',Name:'Read',Active:true}],
  ProgramResources:[
    {ResourceID:'RES-1',CourseID:program.id,ProgramSubjectID:'PS-1',LevelID:'LVL-1',ProgramModuleID:'MOD-1',TaskID:'TASK-1',ResourceType:'EBOOK',Name:'Grammar book',Description:'Core text',DriveFileID:'private-file',CoverDriveFileID:'private-cover',Author:'A. Author',Active:true},
    {ResourceID:'RES-2',CourseID:program.id,ProgramSubjectID:'PS-1',LevelID:'LVL-1',ProgramModuleID:'MOD-1',TaskID:'',ResourceType:'AUDIO',Name:'Archived audio',DriveFileID:'private-audio',Active:false},
    {ResourceID:'RES-3',CourseID:program.id,ProgramSubjectID:'PS-1',LevelID:'LVL-1',ProgramModuleID:'MOD-1',TaskID:'',ResourceType:'VIDEO',Name:'Video',DriveFileID:'private-video',Active:true}
  ]
};
const data={tables};
const shared=[{SubjectID:'ARABIC',SubjectName:'Arabic',Active:true}];
const student={accountid:'STUDENT-1',role:'STUDENT'};
const roles=[{AccountID:'STUDENT-1',Active:true,Roles:['STUDENT']}];

assert.equal(currentProgramEnrollment(tables,program,student.accountid,on),true);
assert.equal(programViewerRole(student,roles,tables,program,on),'STUDENT');
assert.equal(programViewerRole({accountid:'OTHER',role:'STUDENT'},roles,tables,program,on),'');
assert.equal(programViewerRole({accountid:'STAFF-1',role:'STUDENT'},[{AccountID:'STAFF-1',Active:true,Roles:['TEACHER']}],tables,program,on),'TEACHER');
assert.equal(programViewerRole({accountid:'ADMIN',role:'GLOBAL_ADMIN'},[],tables,program,on),'GLOBAL_ADMIN');
const visible=visibleProgramResources(data,program,shared);
assert.deepEqual(visible.map(row=>row.id),['RES-1','RES-3']);
assert.equal(visible[0].subjectName,'Arabic');
assert.equal(visible[0].hasCover,true);
assert.equal(JSON.stringify(visible).includes('private-file'),false,'The catalogue must not contain Drive IDs');
assert.equal(requireVisibleProgramResource(data,program,shared,'RES-1').DriveFileID,'private-file');
assert.throws(()=>requireVisibleProgramResource(data,program,shared,'RES-2'),/unavailable/);

tables.ProgramEnrollments[0].Active=false;
assert.equal(programViewerRole(student,roles,tables,program,on),'');
tables.ProgramEnrollments[0].Active=true;
tables.ProgramClasses[0].Active=false;
assert.equal(programViewerRole(student,roles,tables,program,on),'');
tables.ProgramClasses[0].Active=true;
tables.ProgramEnrollments[0].EndDate='2026-09-30';
assert.equal(programViewerRole(student,roles,tables,program,on),'');
tables.ProgramEnrollments[0].EndDate='2026-12-31';
tables.ProgramModules[0].Active=false;
assert.deepEqual(visibleProgramResources(data,program,shared),[]);
tables.ProgramModules[0].Active=true;
shared[0].Active=false;
assert.deepEqual(visibleProgramResources(data,program,shared),[]);

console.log('Program Library viewer access and catalogue tests passed.');
