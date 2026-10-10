import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {nativeBinding,setCell,appendRecord} from './fixtures/academy-d1-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1Entrance} from '../src/academy/d1/entrance.js';

const base='/api/admin/platform/global/',profiles='/api/admin/platform/user-profiles/';
async function post(env,path,input={},token='') {
  const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:response.status,body:await response.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'}));
const view=async(env,token)=>ok(await post(env,base+'get',{},token));
const write=(env,token,path,input,revision)=>post(env,path,{...input,workflowRevision:revision,operationId:crypto.randomUUID()},token);
const directory=async(env,token)=>ok(await post(env,profiles+'get',{},token));
const assignment=(d,id,scope='subject-1')=>d.accounts.find(a=>a.accountId==='account-'+id).assignments.find(a=>a.scopeType==='SUBJECT'&&a.scopeId===scope);
async function grant(env,token,id,roles,scope='subject-1',draft) {
  const data=draft||await directory(env,token),current=assignment(data,id,scope),area=data.scopes.find(s=>s.type==='SUBJECT'&&s.id===scope);
  return post(env,profiles+'save',{mode:'matrix-roles',accountId:'account-'+id,scopeType:'SUBJECT',scopeId:scope,roles,baseRevision:current.revision,scopeRevision:area.revision,operationId:crypto.randomUUID()},token);
}
async function use(fn) {
  const f=await courseFixture(s=>{
    setCell(s,'PublishedGlobalTimetableSessions',1,'ZoomLink','https://zoom.us/j/12345678901');
    setCell(s,'GlobalTimetablePublications',1,'SessionCount',2);
    appendRecord(s,'PublishedGlobalTimetableSessions',{PublishedSessionID:'session-2',SourceSessionID:'source-session-2',PublicationID:'publication-1',RunID:'run-1',SubjectID:'subject-1',RunName:'Synthetic run',SubjectName:'Synthetic subject',ModuleName:'Synthetic module',TeacherName:'Other synthetic teacher',Timezone:'Africa/Johannesburg',ModuleID:'module-1',TeacherAccountID:'account-0005',SessionDate:'2026-10-10',StartTime:'10:00',EndTime:'11:00',ZoomLink:'https://zoom.us/j/12345678901'});
  }),original=globalThis.fetch;let external=0;
  f.db.exec(readFileSync(new URL('../migrations/academy/0007_course_subscriptions.sql',import.meta.url),'utf8'));
  f.db.exec("UPDATE course_settings SET legacy_access_model='PAID'; UPDATE course_run_access SET access_model='PAID'");
  globalThis.fetch=async()=>{external++;throw Error('External requests forbidden');};
  try {await fn(f);assert.equal(external,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally {globalThis.fetch=original;f.db.close();}
}

test('Global Admin can edit all Course roles; Student revocation reconciles imported access and stale drafts',()=>use(async({env,db})=>{
  const admin=(await login(env)).token,before=await directory(env,admin);
  assert.equal(before.scopes.find(s=>s.type==='SUBJECT').rolesEditable,true);
  const accountAdmin=assignment(before,'0001');assert.ok(accountAdmin.displayRoles.includes('PROGRAM_ADMIN'));assert.deepEqual(accountAdmin.inheritedRoles,['PROGRAM_ADMIN']);
  const saved=ok(await grant(env,admin,'0002',['STUDENT','TEACHER']));assert.deepEqual(saved.assignment.roles,['STUDENT','TEACHER']);
  const current=await view(env,admin);assert.equal(current.subjectAccessMatrix.rows.find(r=>r.accountid==='account-0002').values['subject-1'],true);
  assert.equal((await grant(env,admin,'0002',[],undefined,before)).body.code,'ROW_CHANGED');
  const d=await directory(env,admin);ok(await write(env,admin,base+'access/save',{accountId:'account-0002',subjectId:'subject-1',active:false},current.workflowRevision));
  assert.deepEqual(assignment(await directory(env,admin),'0002').roles,['TEACHER']);
  assert.equal((await grant(env,admin,'0002',[],undefined,d)).body.code,'ROW_CHANGED');
  db.exec("INSERT INTO legacy_access_evidence SELECT 'imported-course-grant',run_id,'account-0002','COURSE:subject-1','LEGACY_SUBSCRIPTION',1,'CONFIRMED','synthetic fixture' FROM migration_runs LIMIT 1; DELETE FROM course_subscription_decisions");
  assert.ok(assignment(await directory(env,admin),'0002').roles.includes('STUDENT'));
  ok(await grant(env,admin,'0002',[]));assert.equal(db.prepare("SELECT source_effective FROM legacy_access_evidence WHERE evidence_id='imported-course-grant'").get().source_effective,1);
  assert.equal(db.prepare("SELECT count(*) n FROM effective_course_subscriptions WHERE account_id='account-0002'").get().n,0);
  assert.deepEqual(assignment(await directory(env,admin),'0002').roles,[]);
  assert.equal((await grant(env,admin,'0002',['GLOBAL_ADMIN'])).body.code,'INVALID_ROLE');
  ok(await grant(env,admin,'0001',[]));assert.deepEqual(assignment(await directory(env,admin),'0001').displayRoles,['PROGRAM_ADMIN']);
}));

test('Course-only Student and Teacher contexts work; their timetable stays personal and revocation is immediate',()=>use(async({env,db})=>{
  const admin=(await login(env)).token;
  db.exec("UPDATE role_assignments SET active=0 WHERE account_id IN ('account-0002','account-0003'); UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id IN ('account-0002','account-0003')");
  for(const [id,roles] of [['0002',['STUDENT']],['0003',['TEACHER']]]) {
    ok(await grant(env,admin,id,roles));const session=await login(env,id);assert.equal(session.context.scope,'GLOBAL');assert.equal(session.context.courseId,'subject-1');assert.equal(session.context.role,roles[0]);
    assert.match(ok(await post(env,'/api/account/global-workspace',{},session.token)).workspace.path,/#activity\/COURSE\/subject-1/);
    assert.equal((await post(env,base+'get',{},session.token)).status,403);
    const repository=academyD1Repository(env),state=await repository.byId('account-'+id);
    const home=await d1Entrance(repository,state,{type:'account',accountid:'account-'+id,role:roles[0]},{startDate:'2026-10-09'},new Date('2026-10-09T08:55:00Z'));
    assert.deepEqual(home.personalActivities.find(a=>a.kind==='COURSE').roles,roles);
    const rows=home.personalTimetable.filter(r=>r.kind==='COURSE');assert.equal(rows.length,id==='0003'?1:2);assert.equal(rows[0].summarize,false);assert.equal(rows[0].involvement,id==='0003'?'teacher':'student');
    assert.ok(rows[0].joinUrl);assert.ok(home.activityPages.find(a=>a.kind==='COURSE').curriculum.length);
    ok(await grant(env,admin,id,[]));assert.equal((await post(env,'/api/account/session',{},session.token)).status,401);
  }
}));

test('revoking a Course Teacher removes lesson access even while an independent Program session remains valid',()=>use(async({env})=>{
  const admin=(await login(env)).token,teacher=(await login(env,'0003')).token;
  ok(await grant(env,admin,'0003',['TEACHER']));
  const entrance=async()=>ok(await post(env,'/api/academy/entrance',{startDate:'2026-10-09'},teacher));
  const before=await entrance();assert.equal(before.personalTimetable.filter(r=>r.kind==='COURSE').length,1);
  ok(await grant(env,admin,'0003',[]));
  const after=await entrance();assert.equal(after.personalTimetable.filter(r=>r.kind==='COURSE').length,0);
  assert.ok(!after.personalActivities.some(a=>a.kind==='COURSE'));
  assert.ok(after.timetable.filter(r=>r.kind==='COURSE').every(r=>!r.joinUrl&&!r.meetingGroup&&!r.information));
  ok(await post(env,'/api/account/session',{},teacher));
}));

test('Course Program Admin manages only assigned Courses, including scheduling and access, without Global Admin power',()=>use(async({env,db})=>{
  const global=(await login(env)).token,initial=await view(env,global);
  const other=ok(await write(env,global,base+'subject/save',{subjectName:'Other Course',active:true},initial.workflowRevision)).subject.subjectid;
  ok(await grant(env,global,'0008',['PROGRAM_ADMIN']));const session=await login(env,'0008'),token=session.token;
  assert.equal(session.courseManagement,true);assert.ok(!session.contexts.some(c=>c.role==='GLOBAL_ADMIN'));
  const current=await view(env,token);assert.deepEqual(current.subjects.map(s=>s.subjectid),['subject-1']);assert.equal(current.capabilities.courseCreation,false);
  for(const path of [profiles+'get','/api/admin/platform/academy-subjects/get','/api/admin/platform/calendar/get'])assert.equal((await post(env,path,{},token)).status,403);
  assert.equal((await write(env,token,base+'subject/save',{subjectName:'Forbidden Course',active:true},current.workflowRevision)).status,403);
  assert.ok((await write(env,token,base+'module/save',{subjectId:other,moduleName:'Forbidden module',sortOrder:2,active:true},current.workflowRevision)).status>=400);
  assert.equal((await write(env,token,base+'access/save',{subjectId:other,accountId:'account-0002',active:true},current.workflowRevision)).status,403);
  let saved=ok(await write(env,token,base+'module/save',{subjectId:'subject-1',moduleName:'Owned module',sortOrder:2,active:true},current.workflowRevision));
  saved=ok(await write(env,token,base+'access/save',{subjectId:'subject-1',accountId:'account-0002',active:true},saved.workflowRevision));
  const rule={rulekey:'scoped-rule',days:['MON'],starttime:'12:00',endtime:'13:00',moduleid:'module-1',teacheraccountid:'account-0003',zoomlink:'https://zoom.us/j/12345678901'};
  saved=ok(await write(env,token,base+'run/save',{subjectId:'subject-1',runName:'Scoped run',startDate:'2026-10-12',endDate:'2026-10-12',active:true,accessModel:'PAID',scheduleMode:'DERIVED',scheduleDefinition:[rule]},saved.workflowRevision));
  const runId=saved.run.runid;saved=ok(await write(env,token,base+'timetable/publish',{runId},saved.workflowRevision));
  const table=ok(await post(env,base+'timetable/get',{},token));assert.ok(table.publications.some(p=>p.runid===runId));
  const repository=academyD1Repository(env),state=await repository.byId('account-0008');
  const home=await d1Entrance(repository,state,{type:'account',accountid:'account-0008',role:'PROGRAM_ADMIN'},{startDate:'2026-10-09'},new Date('2026-10-09T08:55:00Z'));
  assert.ok(home.personalTimetable.some(r=>r.kind==='COURSE'&&r.summarize&&r.joinUrl));assert.ok(!home.personalActivities.some(a=>a.id===other));
  assert.equal(home.globalAdmin,false);
  ok(await grant(env,global,'0008',[]));assert.equal((await post(env,base+'get',{},token)).status,401);
}));

test('Course role batches roll back on failure, replay safely, and scoped authority is checked inside the write',()=>use(async({env,db})=>{
  const admin=(await login(env)).token,d=await directory(env,admin),area=d.scopes.find(s=>s.type==='SUBJECT'),entry=id=>({mode:'matrix-roles',accountId:'account-'+id,scopeType:'SUBJECT',scopeId:area.id,roles:['TEACHER'],baseRevision:assignment(d,id).revision,scopeRevision:area.revision});
  const input={mode:'batch',entries:[entry('0002'),entry('0008')],operationId:crypto.randomUUID()};
  db.exec("CREATE TRIGGER fail_course_role BEFORE INSERT ON role_assignments WHEN NEW.activity_key='COURSE:subject-1' AND NEW.account_id='account-0008' BEGIN SELECT RAISE(ABORT,'Synthetic failure'); END");
  assert.equal((await post(env,profiles+'save',input,admin)).status,503);assert.deepEqual(assignment(await directory(env,admin),'0002').roles,[]);
  db.exec('DROP TRIGGER fail_course_role');ok(await post(env,profiles+'save',input,admin));assert.equal(ok(await post(env,profiles+'save',input,admin)).replayed,true);
  ok(await grant(env,admin,'0008',['PROGRAM_ADMIN']));const token=(await login(env,'0008')).token,current=await view(env,token),binding=nativeBinding(db);let revoke=true;
  const guards=new WeakSet(),track=(statement,sql)=>{if(sql.startsWith('INSERT INTO academy_write_guards'))guards.add(statement);const bind=statement.bind;statement.bind=(...values)=>track(bind(...values),sql);return statement;};
  const wrapped={...binding,prepare:sql=>track(binding.prepare(sql),sql),batch:async statements=>{if(revoke&&statements.some(s=>guards.has(s))){revoke=false;db.exec("UPDATE role_assignments SET active=0 WHERE account_id='account-0008' AND role='PROGRAM_ADMIN'");}return binding.batch(statements);}};
  const denied=await write({...env,ACADEMY_DB:{withSession:()=>wrapped}},token,base+'module/save',{subjectId:'subject-1',moduleName:'Must roll back',sortOrder:2,active:true},current.workflowRevision);
  assert.equal(denied.status,401);assert.equal(db.prepare("SELECT count(*) n FROM modules WHERE name='Must roll back'").get().n,0);
}));
