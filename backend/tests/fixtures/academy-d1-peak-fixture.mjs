import {flowFixture,appendRecord,setCell} from './academy-d1-fixture.mjs';
import {withLearningSource} from './academy-d1-learning-fixture.mjs';
import {fixtureTab,PROGRAM_IDS} from './academy-migration-fixture.mjs';
import {PROGRAM_SCHEMA} from '../../src/programs/model.js';

// Synthetic busy Academy, never copied from live learners. Every learner has
// the same first-Program lesson; additional memberships exercise other scopes.
export async function peakFixture(count=200) {
  const {snapshot,policy}=await flowFixture(count);withLearningSource(snapshot);
  const ids=[...PROGRAM_IDS,...[3,4,5].map(n=>`PRG-${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`)];
  const template=structuredClone(snapshot.workbooks[1]);
  const books=ids.map((id,index)=>{
    const n=index+1;
    let source=JSON.stringify(template).replaceAll(PROGRAM_IDS[0],id).replaceAll('class-1',`class-${n}`).replaceAll('synthetic_program_1',`synthetic_program_${n}`)
      .replaceAll('program-publication-1',`program-publication-${n}`).replaceAll('RULE-flow-1',`RULE-flow-${n}`);
    for(const prefix of ['PS','LVL','MOD','RES'])source=source.replaceAll(`${prefix}-11111111-1111-4111-8111-111111111111`,`${prefix}-${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`);
    const book=JSON.parse(source),tab=book.tabs.find(t=>t.title==='ProgramManagementState'),column=tab.rows[0].indexOf('SnapshotJSON'),state=JSON.parse(tab.rows[1][column]);
    state.ProgramEnrollments=[];
    for(let i=1;i<=count;i++)if(index===0||i%4===index-1)state.ProgramEnrollments.push({EnrollmentID:`peak-${n}-${i}`,CourseID:id,ClassID:`class-${n}`,AccountID:`account-${String(i).padStart(4,'0')}`,Active:true});
    tab.rows[1][column]=JSON.stringify(state);return book;
  });
  snapshot.workbooks=[snapshot.workbooks[0],...books,...snapshot.workbooks.filter(b=>b.kind==='LEGACY')];
  for(let index=2;index<ids.length;index++) {
    appendRecord(snapshot,'CourseRegistry',{CourseID:ids[index],CourseName:`Synthetic Program ${index+1}`,SpreadsheetID:`synthetic_program_${index+1}`,Active:false,SchemaVersion:PROGRAM_SCHEMA});
    const definitions=fixtureTab(snapshot,'ProgramDefinitions'),row=definitions.rows[1].slice();row[definitions.rows[0].indexOf('CourseID')]=ids[index];definitions.rows.push(row);
    appendRecord(snapshot,'AcademyAccessScopes',{ScopeKey:'PROGRAM:'+ids[index],ScopeType:'PROGRAM',ScopeID:ids[index],ReviewStatus:'CONFIRMED',AccessModel:'PAID',MigrationStage:'SETUP'});
  }
  // Registry compatibility Active=FALSE is deliberate; reviewed policy and
  // publication establish the five operational Programs, as in the real source.
  policy.activeProgramIds=ids;
  const matrix=fixtureTab(snapshot,'AcademyAccessMatrix');matrix.rows[0]=[...matrix.rows[0].slice(0,3),...ids.map(id=>'PROGRAM:'+id)];
  for(let i=1;i<=count;i++)matrix.rows[i]=[`account-${String(i).padStart(4,'0')}`,`Synthetic learner ${i}`,'ACTIVE',
    ...ids.map((_,j)=>i===1?'USER':i===3?'TEACHER':j===0?(i===4?'ADMIN':i===5?'SENIOR':i===6?'SENIOR|TEACHER':'STUDENT'):i%4===j-1?'STUDENT':'USER')];
  // Both free and paid Course projections are present in the requested week.
  for(const name of ['GlobalSubjectList','GlobalModuleList','GlobalSubjectAccessPolicy','GlobalSubjectRuns','GlobalTimetablePublications','GlobalTimetableRunState','PublishedGlobalTimetableSessions']) {
    const tab=fixtureTab(snapshot,name),row=tab.rows[1].map(v=>typeof v==='string'?v.replaceAll('subject-1','subject-2').replaceAll('module-1','module-2').replaceAll('run-1','run-2').replaceAll('publication-1','publication-2').replaceAll('session-1','session-2'):v);tab.rows.push(row);
  }
  setCell(snapshot,'GlobalSubjectAccessPolicy',2,'AccessModel','PAID');
  const sessions=fixtureTab(snapshot,'PublishedGlobalTimetableSessions'),rows=sessions.rows.slice(1);sessions.rows.length=1;
  for(const [index,base] of rows.entries())for(let day=1;day<=7;day++) {
    const row=base.slice();for(const [field,value] of Object.entries({PublishedSessionID:`peak-course-${index+1}-${day}`,SourceSessionID:`peak-source-${index+1}-${day}`,SessionDate:`2026-10-0${day}`}))row[sessions.rows[0].indexOf(field)]=value;sessions.rows.push(row);
  }
  for(let i=1;i<=2;i++)setCell(snapshot,'GlobalTimetablePublications',i,'SessionCount',7);
  fixtureTab(snapshot,'GlobalSubjectAccessMatrix').rows=[['AccountID','subject-1','subject-2'],...Array.from({length:count},(_,i)=>[`account-${String(i+1).padStart(4,'0')}`,true,(i+1)%2===0])];
  for(let month=1;month<=12;month++)for(const day of [1,8,15,22])appendRecord(snapshot,'AcademyCalendar',{CalendarEventID:`peak-calendar-${month}-${day}`,EventType:'TERM',Description:'Synthetic academic period',StartDate:`2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,EndDate:`2026-${String(month).padStart(2,'0')}-${String(day+3).padStart(2,'0')}`,TeachingImpact:'INFORMATION',Active:true});
  return {snapshot,policy};
}
