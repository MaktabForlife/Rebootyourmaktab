import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';

const admin='/api/admin/platform/',program=admin+'program-timetable/',course=admin+'global/';
async function post(env,path,input={},token='') {
  const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:response.status,body:await response.json()};
}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'}));
async function use(fn) {
  const fixture=await courseFixture(),previous=globalThis.fetch;let external=0;
  fixture.db.exec(readFileSync(new URL('../migrations/academy/0007_course_subscriptions.sql',import.meta.url),'utf8'));
  globalThis.fetch=async()=>{external++;throw Error('External requests prohibited');};
  try {await fn(fixture);assert.equal(external,0);assert.deepEqual(fixture.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(fixture.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally {globalThis.fetch=previous;fixture.db.close();}
}
const globalReads=[
  [admin+'user-profiles/get',{}],[admin+'academy-subjects/get',{}],
  [course+'get',{}],[course+'delivery/get',{}],[course+'timetable/get',{}],
  [admin+'calendar/get',{year:2026}]
];

test('Global Admin alone can read every management area and edit Program, Course and user records',()=>use(async({env,db})=>{
  db.exec("DELETE FROM role_assignments WHERE account_id='account-0001'; DELETE FROM role_import_reviews WHERE account_id='account-0001'; DELETE FROM legacy_access_evidence WHERE account_id='account-0001'");
  db.exec("UPDATE course_settings SET legacy_access_model='PAID'; UPDATE course_run_access SET access_model='PAID'");
  const signed=await login(env),token=signed.token;
  assert.deepEqual(signed.contexts.map(c=>[c.scope,c.role]),[['PLATFORM','GLOBAL_ADMIN']]);
  for(const [path,input] of globalReads)ok(await post(env,path,input,token));
  const directory=ok(await post(env,admin+'user-profiles/get',{},token));
  assert.equal(directory.accounts.length,db.prepare('SELECT count(*) n FROM accounts').get().n);
  const globalProfile=directory.accounts.find(a=>a.accountId==='account-0001');
  assert.equal(globalProfile.academyAdmin,true);
  for(const grant of globalProfile.assignments) {
    assert.deepEqual(grant.roles,[]);
    assert.deepEqual(grant.inheritedRoles,['PROGRAM_ADMIN']);
    assert.deepEqual(grant.displayRoles,['PROGRAM_ADMIN']);
  }
  const home=ok(await post(env,'/api/academy/entrance',{startDate:'2026-10-09'},token));
  assert.ok(home.personalActivities.some(a=>a.kind==='PROGRAM'));
  assert.ok(home.personalActivities.some(a=>a.kind==='COURSE'));
  assert.ok(home.personalActivities.every(a=>a.roles.includes('PROGRAM_ADMIN')&&a.roles.includes('GLOBAL_ADMIN')));
  const registry=ok(await post(env,admin+'programs/list',{},token));assert.equal(registry.programs.length,PROGRAM_IDS.length);
  for(const id of PROGRAM_IDS) {
    for(const action of ['manage-get','get','history','published'])ok(await post(env,program+action,{id,date:'2026-10-09'},token));
    ok(await post(env,'/api/program-attendance/get',{id,date:'2026-10-09'},token));
  }
  const before=ok(await post(env,program+'manage-get',{id:PROGRAM_IDS[1]},token)),row=before.rows.classes[0];
  ok(await post(env,program+'manage-save',{id:PROGRAM_IDS[1],kind:'classes',creating:false,record:{...row,Name:'Global Admin edited class'},baseRowRevision:before.rowRevisions.classes[row.ClassID],operationId:crypto.randomUUID()},token));
  const current=ok(await post(env,course+'get',{},token));
  const renamed=ok(await post(env,course+'subject/save',{subjectId:'subject-1',subjectName:'Global Admin edited Course',active:true,workflowRevision:current.workflowRevision,operationId:crypto.randomUUID()},token));
  ok(await post(env,course+'access/save',{subjectId:'subject-1',accountId:'account-0002',active:true,workflowRevision:renamed.workflowRevision,operationId:crypto.randomUUID()},token));
  const account=directory.accounts.find(a=>a.accountId==='account-0003');
  ok(await post(env,admin+'user-profiles/save',{mode:'profile',accountId:account.accountId,displayName:'Global Admin edited user',active:true,creating:false,baseRevision:account.revision,operationId:crypto.randomUUID()},token));
  assert.equal(db.prepare('SELECT count(*) n FROM role_assignments WHERE account_id=?').get('account-0001').n,0,'Academy authority does not need a role copied into every activity');
  assert.equal(db.prepare('SELECT count(*) n FROM effective_course_subscriptions WHERE account_id=?').get('account-0001').n,0,'Global Admin does not need a Course subscription');
  assert.equal(db.prepare('SELECT name FROM activities WHERE activity_key=?').get('COURSE:subject-1').name,'Global Admin edited Course');
  const publicOnly={...env,ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY'};
  assert.equal((await post(publicOnly,admin+'program-library/manage',{id:PROGRAM_IDS[0]},token)).body.code,'PRIVATE_MEDIA_NOT_ENABLED','Existing private-media rollout rules remain in force');
}));

test('Global Admin automatically administers new Programs and Courses without copied assignments',()=>use(async({env,db})=>{
  db.exec("DELETE FROM role_assignments WHERE account_id='account-0001'; DELETE FROM role_import_reviews WHERE account_id='account-0001'; DELETE FROM legacy_access_evidence WHERE account_id='account-0001'");
  const token=(await login(env)).token,id='PRG-'+crypto.randomUUID();
  ok(await post(env,admin+'programs/create',{id,name:'New automatic Program',timezone:'Africa/Johannesburg',durationYears:1,status:'DRAFT',operationId:crypto.randomUUID()},token));
  const current=ok(await post(env,course+'get',{},token));
  const created=ok(await post(env,course+'subject/save',{subjectName:'New automatic Course',active:true,workflowRevision:current.workflowRevision,operationId:crypto.randomUUID()},token));
  const scopes=[['PROGRAM',id],['SUBJECT',created.subject.subjectid]];
  let directory=ok(await post(env,admin+'user-profiles/get',{},token));
  for(const [type,scopeId] of scopes) {
    const profile=directory.accounts.find(a=>a.accountId==='account-0001'),grant=profile.assignments.find(g=>g.scopeType===type&&g.scopeId===scopeId),scope=directory.scopes.find(s=>s.type===type&&s.id===scopeId);
    assert.deepEqual(grant.inheritedRoles,['PROGRAM_ADMIN']);
    assert.deepEqual(grant.displayRoles,['PROGRAM_ADMIN']);
    const saved=ok(await post(env,admin+'user-profiles/save',{mode:'matrix-roles',accountId:profile.accountId,scopeType:type,scopeId,roles:[],baseRevision:grant.revision,scopeRevision:scope.revision,operationId:crypto.randomUUID()},token));
    assert.deepEqual(saved.assignment.roles,[]);
    assert.deepEqual(saved.assignment.displayRoles,['PROGRAM_ADMIN']);
    directory=ok(await post(env,admin+'user-profiles/get',{},token));
  }
  ok(await post(env,program+'manage-get',{id},token));
  assert.ok(ok(await post(env,course+'get',{},token)).subjects.some(s=>s.subjectid===created.subject.subjectid));
  assert.equal(db.prepare("SELECT count(*) n FROM role_assignments WHERE account_id='account-0001' AND active=1").get().n,0);
  db.exec("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'");
  assert.equal((await post(env,program+'manage-get',{id},token)).status,401);
  assert.equal((await post(env,course+'get',{},token)).status,401);
}));

test('Global Admin can inspect stored inactive users and archived activities; removal ends existing access',()=>use(async({env,db})=>{
  const token=(await login(env)).token;
  db.exec("UPDATE accounts SET active=0 WHERE account_id='account-0002'");
  db.prepare("UPDATE activities SET active=0,lifecycle='ARCHIVED' WHERE activity_key=?").run('PROGRAM:'+PROGRAM_IDS[1]);
  db.exec("UPDATE activities SET active=0,lifecycle='ARCHIVED' WHERE activity_key='COURSE:subject-1'");
  const directory=ok(await post(env,admin+'user-profiles/get',{},token));
  assert.equal(directory.accounts.find(a=>a.accountId==='account-0002').active,false);
  assert.equal(ok(await post(env,program+'manage-get',{id:PROGRAM_IDS[1]},token)).program.status,'ARCHIVED');
  assert.ok(ok(await post(env,course+'get',{},token)).subjects.some(s=>s.subjectid==='subject-1'&&!s.active));
  db.exec("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'");
  for(const [path,input] of globalReads)assert.equal((await post(env,path,input,token)).status,401,'Removed authority must not survive in a token: '+path);
}));

test('Program Admin in every Program does not grant Academy-wide management access',()=>use(async({env,db})=>{
  for(const id of PROGRAM_IDS)db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,'account-0004',?,'PROGRAM_ADMIN',1,'CONFIRMED')").run(crypto.randomUUID(),'PROGRAM:'+id);
  const signed=await login(env,'0004'),token=signed.token;
  assert.ok(!signed.contexts.some(c=>c.role==='GLOBAL_ADMIN'));
  for(const [path,input] of globalReads)assert.equal((await post(env,path,input,token)).status,403,'Scoped roles must not become Global Admin: '+path);
  for(const id of PROGRAM_IDS)ok(await post(env,program+'manage-get',{id},token));
}));
