import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {nativeBinding,setCell} from './fixtures/academy-d1-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1AccountTimetable} from '../src/academy/d1/account-timetable.js';

const base='/api/admin/platform/global/',profiles='/api/admin/platform/user-profiles/';
async function post(env,path,input={},token=''){
  const r=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:r.status,body:await r.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const change=(env,token,active,revision,extra={})=>post(env,base+'access/save',{accountId:'account-0002',subjectId:'subject-1',active,workflowRevision:revision,operationId:crypto.randomUUID(),...extra},token);
const view=(env,token)=>post(env,base+'get',{},token).then(ok);
async function use(fn){
  const f=await courseFixture(s=>setCell(s,'PublishedGlobalTimetableSessions',1,'ZoomLink','https://zoom.us/j/12345678901')),original=globalThis.fetch;let outbound=0;
  f.db.exec(readFileSync(new URL('../migrations/academy/0007_course_subscriptions.sql',import.meta.url),'utf8'));
  globalThis.fetch=async()=>{outbound++;throw Error('External requests forbidden');};
  try{await fn(f);assert.equal(outbound,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally{globalThis.fetch=original;f.db.close();}
}
const paid=db=>db.exec("UPDATE course_settings SET legacy_access_model='PAID'; UPDATE course_run_access SET access_model='PAID'");
const evidence=db=>db.prepare('SELECT * FROM legacy_access_evidence ORDER BY evidence_id').all();
function importedGrant(db){db.exec("INSERT INTO legacy_access_evidence SELECT 'subscription-source',run_id,'account-0002','COURSE:subject-1','LEGACY_SUBSCRIPTION',1,'CONFIRMED','synthetic fixture' FROM migration_runs LIMIT 1");}

test('Course grants preserve source evidence and Program roles; only Global Admin can change paid access',()=>use(async({env,db,queries})=>{
  const token=await login(env),initial=await view(env,token),before=evidence(db),roles=db.prepare('SELECT * FROM role_assignments').all();
  assert.equal(initial.capabilities.subscriptionManagement,true);
  assert.equal(db.prepare('SELECT count(*) n FROM course_subscription_decisions').get().n,0);
  assert.equal((await change(env,token,true,initial.workflowRevision)).body.code,'FREE_COURSE_ACCESS');
  paid(db);
  const beforeDirectory=ok(await post(env,profiles+'get',{},token));
  const courseGrant=data=>data.accounts.find(a=>a.accountId==='account-0002').assignments.find(a=>a.scopeId==='subject-1');
  assert.deepEqual(courseGrant(beforeDirectory).displayRoles,[],'a paid Course with no subscription shows no student role');
  for(const id of ['0003','0004'])assert.equal((await change(env,await login(env,id),true,initial.workflowRevision)).status,403);
  assert.equal((await change(env,token,'true',initial.workflowRevision)).status,400);
  assert.equal((await change(env,token,true,initial.workflowRevision,{accountId:'missing'})).status,404);
  const start=queries.length,saved=ok(await change(env,token,true,initial.workflowRevision,{accountId:'ACCOUNT-0002',subjectId:'SUBJECT-1'}));
  assert.ok(queries.length-start<=50,'Subscription save stays within the normal query budget.');
  assert.equal(saved.changed,true);assert.equal(saved.access.accountid,'account-0002');
  const current=await view(env,token);assert.equal(current.subjectAccessMatrix.rows.find(r=>r.accountid==='account-0002').values['subject-1'],true);
  const directory=ok(await post(env,profiles+'get',{},token));
  assert.equal(directory.scopes.find(s=>s.id==='subject-1').accessModel,'PAID');
  assert.equal(directory.accounts.find(a=>a.accountId==='account-0001').assignments.find(a=>a.scopeId==='subject-1').accessAllowed,true);
  assert.equal(directory.accounts.find(a=>a.accountId==='account-0002').assignments.find(a=>a.scopeId==='subject-1').accessAllowed,true);
  assert.deepEqual(directory.accounts.find(a=>a.accountId==='account-0001').assignments.find(a=>a.scopeId==='subject-1').displayRoles,['PROGRAM_ADMIN']);
  assert.deepEqual(courseGrant(directory).displayRoles,['STUDENT'],'a Course subscriber is visibly a Student');
  assert.deepEqual(courseGrant(directory).roles,['STUDENT'],'Course subscribers can now be edited through the same role controls as Programs');
  assert.notEqual(courseGrant(directory).revision,courseGrant(beforeDirectory).revision,'a concurrent access change must invalidate a stale Course role edit');
  assert.equal((await change(env,token,false,initial.workflowRevision)).body.code,'WORKFLOW_CHANGED');
  const revoked=ok(await change(env,token,false,current.workflowRevision));assert.equal(revoked.changed,true);
  assert.equal(ok(await post(env,profiles+'get',{},token)).accounts.find(a=>a.accountId==='account-0002').assignments.find(a=>a.scopeId==='subject-1').accessAllowed,false);
  assert.deepEqual(courseGrant(ok(await post(env,profiles+'get',{},token))).displayRoles,[],'revoked subscriptions no longer display Student');
  assert.deepEqual(evidence(db),before);assert.deepEqual(db.prepare('SELECT * FROM role_assignments').all(),roles);
  assert.equal(db.prepare('SELECT count(*) n FROM academy_admissions').get().n,0);
  assert.ok(!JSON.stringify(saved).includes('pin_hash'));
}));

test('explicit revocation overrides imported subscriptions and remains possible after deactivation',()=>use(async({env,db})=>{
  importedGrant(db);paid(db);const before=evidence(db),token=await login(env),initial=await view(env,token);
  assert.equal(initial.subjectAccessMatrix.rows.find(r=>r.accountid==='account-0002').values['subject-1'],true);
  db.exec("UPDATE accounts SET active=0 WHERE account_id='account-0002'; UPDATE activities SET active=0,lifecycle='ARCHIVED' WHERE activity_key='COURSE:subject-1'");
  assert.equal((await change(env,token,true,initial.workflowRevision)).body.code,'INACTIVE_COURSE_ACCOUNT');
  const revoked=ok(await change(env,token,false,initial.workflowRevision));assert.equal(revoked.changed,true);
  db.exec("UPDATE legacy_access_evidence SET source_effective=1 WHERE evidence_id='subscription-source'");
  assert.equal(db.prepare('SELECT count(*) n FROM effective_course_subscriptions').get().n,0);
  db.exec("UPDATE accounts SET active=1 WHERE account_id='account-0002'; UPDATE activities SET active=1,lifecycle='ACTIVE' WHERE activity_key='COURSE:subject-1'");
  ok(await change(env,token,true,revoked.workflowRevision));assert.equal(db.prepare('SELECT count(*) n FROM effective_course_subscriptions').get().n,1);
  assert.deepEqual(evidence(db),before);
}));

test('subscription decisions, audits and retry receipts commit together and recover a lost acknowledgement',()=>use(async({env,db})=>{
  paid(db);const token=await login(env),initial=await view(env,token),input={accountId:'account-0002',subjectId:'subject-1',active:true,workflowRevision:initial.workflowRevision,operationId:crypto.randomUUID()};
  db.exec("CREATE TRIGGER fail_subscription_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='COURSE_SUBSCRIPTIONS' BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END");
  assert.equal((await post(env,base+'access/save',input,token)).status,503);
  assert.equal(db.prepare('SELECT count(*) n FROM course_subscription_decisions').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
  assert.equal((await view(env,token)).workflowRevision,initial.workflowRevision);db.exec('DROP TRIGGER fail_subscription_audit');
  const binding=nativeBinding(db);let lose=true;
  const wrapped={...binding,batch:async statements=>{const result=await binding.batch(statements);if(lose&&db.prepare('SELECT 1 FROM operation_receipts WHERE operation_id=?').get(input.operationId)){lose=false;throw Error('Lost acknowledgement');}return result;}};
  const saved=ok(await post({...env,ACADEMY_DB:{withSession:()=>wrapped}},base+'access/save',input,token));assert.equal(saved.replayed,true);
  assert.equal(ok(await post(env,base+'access/save',input,token)).replayed,true);
  assert.equal((await post(env,base+'access/save',{...input,active:false},token)).body.code,'OPERATION_ID_REUSED');
  db.exec("INSERT INTO global_role_assignments(assignment_id,account_id,role,active,review_state) VALUES('second-admin','account-0008','GLOBAL_ADMIN',1,'CONFIRMED')");
  assert.equal((await post(env,base+'access/save',input,await login(env,'0008'))).body.code,'OPERATION_ID_REUSED');
  assert.equal(db.prepare('SELECT revision FROM course_subscription_decisions').get().revision,1);
  const race=await Promise.all([true,false].map(active=>change(env,token,active,saved.workflowRevision)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
}));

test('subscription authority is checked inside its write transaction',()=>use(async({env,db})=>{
  paid(db);const token=await login(env),initial=await view(env,token),binding=nativeBinding(db);let revoke=true;
  const wrapped={...binding,batch:async statements=>{if(revoke&&statements.length===6){revoke=false;db.exec('UPDATE global_role_assignments SET active=0');}return binding.batch(statements);}};
  assert.equal((await change({...env,ACADEMY_DB:{withSession:()=>wrapped}},token,true,initial.workflowRevision)).status,401);
  assert.equal(db.prepare('SELECT count(*) n FROM course_subscription_decisions').get().n,0);
}));

test('existing sessions immediately gain and lose paid lesson details and protected Library files',()=>use(async({env,db})=>{
  paid(db);const admin=await login(env),student=await login(env,'0002'),initial=await view(env,admin);
  db.exec("INSERT INTO course_resources(activity_key,resource_id,module_id,name,resource_type,resource_link,active) VALUES('COURSE:subject-1','subscription-book','module-1','Subscriber book','EBOOK','https://pub-d0f00cecdced454598b794da754a3939.r2.dev/Resources/Book.pdf',1)");
  const key='COURSE:subject-1:EBOOK:subscription-book',library=()=>post(env,'/api/academy/library/access',{resourceId:key},student);
  const timetable=async()=>{const r=academyD1Repository(env),state=await r.byId('account-0002');return d1AccountTimetable(r,{state,user:{type:'account',accountid:'account-0002',role:'STUDENT'}},{startDate:'2026-10-09'},new Date('2026-10-09T08:30:00Z'));};
  const lesson=t=>(t.sessions.find(s=>s.kind==='GLOBAL'));
  assert.equal(lesson(await timetable()).visibilityLevel,'LABEL');assert.equal((await library()).status,403);
  let heads=0;const object={etag:'synthetic',size:3,httpMetadata:{contentType:'application/pdf'},writeHttpMetadata:h=>h.set('Content-Type','application/pdf')};
  env.MEDIA_BUCKET={head:async()=>{heads++;return object;},get:async()=>({...object,body:new Response('PDF').body})};
  const granted=ok(await change(env,admin,true,initial.workflowRevision));
  assert.equal(lesson(await timetable()).visibilityLevel,'DETAIL');assert.equal(lesson(await timetable()).canOpenZoom,true);
  assert.ok(ok(await post(env,'/api/academy/entrance',{startDate:'2026-10-09'},student)).personalTimetable.some(s=>s.kind==='COURSE'));
  const ticket=ok(await library());assert.equal((await worker.fetch(new Request(ticket.url),env)).status,200);
  ok(await change(env,admin,false,granted.workflowRevision));const before=heads;
  assert.equal((await worker.fetch(new Request(ticket.url),env)).status,403);assert.equal(heads,before);
  assert.equal(lesson(await timetable()).visibilityLevel,'LABEL');assert.equal(lesson(await timetable()).canOpenZoom,false);
  assert.equal(ok(await post(env,'/api/account/session',{},student)).sessionStore,'D1','Independent Program session remains authorised.');
}));

test('a Course-only account needs current free or paid Course access; revocation ends its old context',()=>use(async({env,db})=>{
  paid(db);db.exec("UPDATE role_assignments SET active=0 WHERE account_id='account-0002'; UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0002'");
  const admin=await login(env),initial=await view(env,admin);
  assert.equal((await post(env,'/api/account/login',{uniqueid:'login-0002',pin:'1234'})).body.code,'NO_CONTEXT');
  const saved=ok(await change(env,admin,true,initial.workflowRevision)),student=await login(env,'0002');
  assert.equal(ok(await post(env,'/api/account/session',{},student)).context.scope,'GLOBAL');
  ok(await change(env,admin,false,saved.workflowRevision));assert.equal((await post(env,'/api/account/session',{},student)).status,401);
  assert.equal((await post(env,'/api/account/login',{uniqueid:'login-0002',pin:'1234'})).body.code,'NO_CONTEXT');
}));

test('Course access screen enables paid toggles and retries the same decision after an uncertain response',()=>use(async({env,db})=>{
  paid(db);const token=await login(env),elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},querySelectorAll:()=>[],querySelector:()=>null});return elements.get(id);};
  const calls=[];let uncertain=true;
  const apiPost=async(path,input={},auth=token)=>{calls.push({path,input});const result=(await post(env,path,input,auth||token)).body;if(uncertain&&path===base+'access/save'&&result.success){uncertain=false;return {success:false,retryable:true,error:'Uncertain response'};}return result;};
  const window={showScreen:()=>true,M4LAuth:{apiPost}},context={window,apiPost,state:{token,user:{type:'account',role:'GLOBAL_ADMIN',platformrole:'GLOBAL_ADMIN'}},crypto,Date,Map,Set,console,alert(){},document:{addEventListener(){},getElementById:element,querySelectorAll:()=>[],querySelector:()=>null}};
  let code=readFileSync(new URL('../../js/m4l-global-curriculum.js',import.meta.url),'utf8'),at=code.indexOf('  window.M4LGlobalCurriculum =');
  code=code.slice(0,at)+'  window.testAccess=saveAccessToggle;window.testSelectTab=selectTab;\n'+code.slice(at);vm.runInNewContext(code,context);
  assert.equal(await window.M4LGlobalCurriculum.show(),true);window.testSelectTab('access');
  const markup=()=>[...elements.values()].map(e=>e.innerHTML).join('');
  const toggle=()=>markup().match(/<input[^>]*data-account-id="account-0002"[^>]*>/)[0];
  assert.ok(!toggle().includes('disabled'));assert.ok(!markup().includes('Subscription editing is not available yet'));
  const input={dataset:{accountId:'account-0002',subjectId:'subject-1'},checked:true,disabled:false};
  assert.equal(await window.testAccess(input),false);assert.equal(input.checked,false);input.checked=true;
  assert.equal(await window.testAccess(input),true);assert.equal(input.disabled,false);
  const writes=calls.filter(c=>c.path===base+'access/save');assert.equal(writes[0].input.operationId,writes[1].input.operationId);
  input.checked=false;assert.equal(await window.testAccess(input),true);assert.equal(db.prepare('SELECT active FROM course_subscription_decisions').get().active,0);
  input.checked=true;assert.equal(await window.testAccess(input),true);
  db.exec("UPDATE accounts SET active=0 WHERE account_id='account-0002'");await window.M4LGlobalCurriculum.load(true);window.testSelectTab('access');assert.ok(!toggle().includes('disabled'));
  input.checked=false;assert.equal(await window.testAccess(input),true);assert.equal(input.disabled,true,'An inactive account cannot be granted access again after revocation.');
  db.exec("UPDATE course_settings SET legacy_access_model='FREE'");await window.M4LGlobalCurriculum.load(true);window.testSelectTab('access');assert.ok(toggle().includes('disabled'));
}));
