import { DatabaseSync } from 'node:sqlite';
import { nativeBinding } from '../../tools/academy-migration/native-d1.mjs';
export { nativeBinding } from '../../tools/academy-migration/native-d1.mjs';
import { migrationFixture, fixtureTab, PROGRAM_IDS } from './academy-migration-fixture.mjs';
import { buildOperationalImport, importOperationalPlan } from '../../tools/academy-migration/operational.mjs';
import { POLICY_FORMAT } from '../../tools/academy-migration/plan.mjs';
import { createSaltedPinHash } from '../../src/lib/auth.js';

export const policyFor = () => ({format:POLICY_FORMAT,environment:'local',accounts:'ACTIVE_ONLY',records:'ACTIVE_ONLY',archived:'EXCLUDE',websiteVisibility:'PUBLISHED_CONTENT_ONLY',activeProgramIds:[...PROGRAM_IDS],excludedCourseIds:['legacy-1']});
export const setCell=(s,table,row,field,value,book=0)=>{const t=fixtureTab(s,table,book);t.rows[row][t.rows[0].indexOf(field)]=value;};
export const appendRecord=(s,name,record,book=0)=>{const t=fixtureTab(s,name,book);t.rows.push(t.rows[0].map(h=>record[h] ?? ''));};
export async function flowFixture(count=12) {
  const snapshot=migrationFixture(count+1);
  const hash=await createSaltedPinHash('1234','synthetic-pin-secret');
  const accounts=fixtureTab(snapshot,'UserAccounts');
  for(const row of accounts.rows.slice(1).filter(r=>r.length))row[accounts.rows[0].indexOf('PINHash')]=hash;
  setCell(snapshot,'GlobalSubjectRuns',1,'Timezone','Africa/Johannesburg');
  appendRecord(snapshot,'PlatformConfig',{ConfigKey:'PlatformTimezone',ConfigValue:'Africa/Johannesburg'});
  const columns=PROGRAM_IDS.map(id=>`PROGRAM:${id}`);
  fixtureTab(snapshot,'AcademyAccessMatrix').rows=[['AccountID','UserName','Status',...columns]];
  fixtureTab(snapshot,'AcademyAccessScopes').rows.length=1;
  fixtureTab(snapshot,'AcademyAccessReview').rows.length=1;
  for(const [i,scope] of columns.entries())appendRecord(snapshot,'AcademyAccessScopes',{ScopeKey:scope,ScopeType:'PROGRAM',ScopeID:PROGRAM_IDS[i],ReviewStatus:'CONFIRMED',AccessModel:'PAID',MigrationStage:'SETUP'});
  for(let i=1;i<=count;i++) {
    const account=`account-${String(i).padStart(4,'0')}`;
    const roles=i===1?['USER','USER']:i===3?['TEACHER','STUDENT']:i===4?['ADMIN','USER']:i===5?['SENIOR','USER']:i===6?['SENIOR|TEACHER','USER']:i%2===0?['STUDENT','USER']:['USER','STUDENT'];
    fixtureTab(snapshot,'AcademyAccessMatrix').rows.push([account,`Synthetic learner ${i}`,'ACTIVE',...roles]);
  }
  if(count>=6)appendRecord(snapshot,'AcademyAccessReview',{ReviewID:`account-0006|${columns[0]}`,AccountID:'account-0006',ScopeKey:columns[0],ReviewStatus:'REQUIRED',SourceValue:'SENIOR|TEACHER'});
  for(let book=1;book<=2;book++) {
    const t=fixtureTab(snapshot,'ProgramTimetablePublications',book),index=t.rows[0].indexOf('SnapshotJSON'),value=JSON.parse(t.rows[1][index]);
    value.timezone='Africa/Johannesburg';
    value.rules=[{id:`RULE-flow-${book}`,teacherId:'account-0003',teacherIds:['account-0003'],teacherName:'Synthetic teacher',teacherNames:['Synthetic teacher'],classIds:[`class-${book}`],classNames:['Synthetic class'],weekdays:[0,1,2,3,4,5,6],startTime:'10:00',endTime:'11:00',moduleName:'Synthetic lesson',effectiveZoomLink:'https://zoom.us/j/00000000000',zoomSource:'LESSON'}];
    t.rows[1][index]=JSON.stringify(value);
  }
  for(const [name,value] of Object.entries({SessionCount:1,RunName:'Synthetic run',SubjectName:'Synthetic subject',Timezone:'Africa/Johannesburg',PublishStartDate:'2026-10-01',PublishEndDate:'2026-10-31'}))setCell(snapshot,'GlobalTimetablePublications',1,name,value);
  for(const [name,value] of Object.entries({SourceSessionID:'source-session-1',RunName:'Synthetic run',SubjectName:'Synthetic subject',ModuleName:'Synthetic module',TeacherName:'Synthetic teacher',Timezone:'Africa/Johannesburg'}))setCell(snapshot,'PublishedGlobalTimetableSessions',1,name,value);
  return {snapshot,policy:policyFor()};
}
export async function fixtureDatabase(count=12,edit=()=>{}) {
  const {snapshot,policy}=await flowFixture(count),db=new DatabaseSync(':memory:');
  edit(snapshot);
  importOperationalPlan(db,await buildOperationalImport(snapshot,policy));
  const queries=[],attempts=new Map();
  const env={ENVIRONMENT:'local',ACADEMY_D1_MODE:'REHEARSAL',ACADEMY_DB:nativeBinding(db,queries),PIN_SECRET:'synthetic-pin-secret',SESSION_SECRET:'synthetic-session-secret',
    AUTH_LOGIN_RATE_LIMITER:{limit:async({key})=>{const n=(attempts.get(key)||0)+1;attempts.set(key,n);return {success:n<=5};}}};
  return {snapshot,policy,db,env,queries};
}
