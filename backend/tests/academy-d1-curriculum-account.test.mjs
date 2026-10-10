import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {nativeBinding,setCell} from './fixtures/academy-d1-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1AccountTimetable} from '../src/academy/d1/account-timetable.js';

const base='/api/admin/platform/global/',subjects='/api/admin/platform/academy-subjects/',management='/api/admin/platform/program-timetable/';
async function post(env,path,input={},token=''){
  const r=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:r.status,body:await r.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const write=(env,path,input,token,revision)=>post(env,path,{...input,workflowRevision:revision,operationId:crypto.randomUUID()},token);
const batch=name=>({subjects:[{clientKey:'new-subject',subjectName:name,accessModel:'SUBSCRIPTION',active:true}],modules:[{clientKey:'new-module',subjectClientKey:'new-subject',moduleName:'First module',sortOrder:1,active:true}]});
async function use(fn,edit){
  const f=await courseFixture(edit),original=globalThis.fetch;let outbound=0;
  globalThis.fetch=async()=>{outbound++;throw Error('Unexpected external request');};
  try{await fn(f);assert.equal(outbound,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally{globalThis.fetch=original;f.db.close();}
}

test('Global Curriculum creates subjects, modules and tasks atomically without creating subscriptions',()=>use(async({env,db,queries})=>{
  const token=await login(env),initial=ok(await post(env,base+'get',{},token)),evidence=db.prepare('SELECT * FROM legacy_access_evidence ORDER BY evidence_id').all();
  assert.equal(initial.service,'platform-global-management');assert.equal(initial.capabilities.subscriptionManagement,false);
  assert.ok(!JSON.stringify(initial).includes('pin_hash'));assert.ok(!JSON.stringify(initial).includes('login-0002'));
  for(const id of ['0003','0004','0005'])assert.equal((await post(env,base+'get',{},await login(env,id))).status,403);
  const input={...batch('New Global Subject'),globalCurriculumVersion:initial.globalCurriculumVersion,workflowRevision:initial.workflowRevision,operationId:crypto.randomUUID()};
  input.subjects.push(...Array.from({length:19},(_,i)=>({clientKey:'subject-'+i,subjectName:'Batch Subject '+i,active:true,accessModel:'SUBSCRIPTION'})));
  const queryStart=queries.length;
  let saved=ok(await post(env,base+'subjects/save-batch',input,token));
  assert.ok(queries.length-queryStart<=50,'A subject batch must stay within the normal query budget.');
  const subject=saved.subjects[0].subjectid,module=saved.modules[0].moduleid;
  assert.equal(saved.modules[0].subjectid,subject);assert.equal(ok(await post(env,base+'subjects/save-batch',input,token)).replayed,true);
  assert.equal(db.prepare('SELECT legacy_access_model FROM course_settings WHERE activity_key=?').get('COURSE:'+subject).legacy_access_model,'PAID');
  assert.deepEqual(db.prepare('SELECT * FROM legacy_access_evidence ORDER BY evidence_id').all(),evidence);
  saved=ok(await write(env,base+'task/save',{subjectId:subject,moduleId:module,taskName:'First task',active:true},token,saved.workflowRevision));
  assert.equal(db.prepare('SELECT module_id FROM tasks WHERE task_id=?').get(saved.task.taskid).module_id,module);
  const current=ok(await post(env,base+'get',{},token));assert.ok(current.tasks.some(t=>t.taskid===saved.task.taskid));
  assert.equal((await write(env,base+'module/save',{moduleId:module,subjectId:'subject-1',moduleName:'Moved',sortOrder:1,active:true},token,current.workflowRevision)).status,409);
  assert.equal((await write(env,base+'subject/save',{subjectId:subject,subjectName:'Stale rename',active:true},token,initial.workflowRevision)).body.code,'WORKFLOW_CHANGED');
  assert.equal((await post(env,base+'access/save',{accountId:'account-0002',subjectId:subject,active:true},token)).status,501);
  assert.equal((await post(env,base+'resources/save-batch',{},token)).status,501);
  assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,2);
  const publication=db.prepare("SELECT snapshot_json FROM timetable_publications WHERE pattern='COURSE'").get().snapshot_json;
  ok(await write(env,base+'subject/save',{subjectId:'subject-1',subjectName:'Archived Global Subject',active:false},token,current.workflowRevision));
  assert.equal(db.prepare("SELECT active FROM subject_catalog WHERE subject_key='GLOBAL_REFERENCE:subject-1'").get().active,0);
  assert.equal(db.prepare("SELECT snapshot_json FROM timetable_publications WHERE pattern='COURSE'").get().snapshot_json,publication);
  assert.ok(!ok(await post(env,'/api/academy/entrance',{startDate:'2026-10-09'},token)).activities.some(a=>a.kind==='COURSE'&&a.id==='subject-1'));
}));

test('shared Academy subject create, reuse and rename preserve catalogue identity and Program links',()=>use(async({env,db})=>{
  const token=await login(env),create={mode:'create',subjectName:'  Shared   Subject  ',operationId:crypto.randomUUID()};
  const added=ok(await post(env,subjects+'save',create,token));assert.equal(added.subject.SubjectName,'Shared Subject');assert.ok(added.subject.Revision);
  assert.equal(ok(await post(env,subjects+'save',create,token)).replayed,true);
  const reused=ok(await post(env,subjects+'save',{...create,subjectName:'shared subject',operationId:crypto.randomUUID()},token));assert.equal(reused.subject.SubjectID,added.subject.SubjectID);
  const view=ok(await post(env,management+'manage-get',{id:PROGRAM_IDS[0]},token));assert.equal(view.sharedSubjectsEditable,true);assert.equal(view.sharedSubjectImportAvailable,false);
  const link={id:PROGRAM_IDS[0],kind:'subjects',creating:true,record:{ProgramSubjectID:'PS-new-catalogue-link',SubjectID:added.subject.SubjectID,Active:true},baseRowRevision:view.emptyRowRevision,referenceRevision:view.referenceRevision,operationId:crypto.randomUUID()};
  ok(await post(env,management+'manage-save',link,token));
  const rename={mode:'rename',subjectId:added.subject.SubjectID,subjectName:'Renamed Shared Subject',baseRevision:added.subject.Revision,operationId:crypto.randomUUID()};
  const changed=ok(await post(env,subjects+'save',rename,token));assert.notEqual(changed.subject.Revision,added.subject.Revision);
  const latest=ok(await post(env,management+'manage-get',{id:PROGRAM_IDS[0]},token));
  assert.equal(latest.sharedSubjects.find(s=>s.SubjectID===added.subject.SubjectID).SubjectName,'Renamed Shared Subject');
  assert.equal(latest.rows.subjects.find(s=>s.ProgramSubjectID==='PS-new-catalogue-link').SubjectID,added.subject.SubjectID);
  const stale=await post(env,subjects+'save',{...rename,subjectName:'Stale',operationId:crypto.randomUUID()},token);
  assert.equal(stale.body.code,'ROW_CHANGED');assert.equal(stale.body.currentRecord.SubjectName,'Renamed Shared Subject');
  const admin=await login(env,'0004');
  assert.equal((await post(env,subjects+'save',{...create,operationId:crypto.randomUUID()},admin)).status,403);
  assert.equal(ok(await post(env,management+'manage-get',{id:PROGRAM_IDS[0]},admin)).sharedSubjectsEditable,false);
  assert.equal((await post(env,subjects+'import-preview',{},token)).status,501);
  assert.equal(db.prepare("SELECT count(*) n FROM subject_catalog WHERE name='Renamed Shared Subject'").get().n,1);
}));

test('curriculum failures roll back new parents, children, audits and receipts; lost acknowledgements replay',()=>use(async({env,db})=>{
  const token=await login(env),initial=ok(await post(env,base+'get',{},token)),audits=db.prepare('SELECT count(*) n FROM audit_events').get().n;
  const input={...batch('Atomic Subject'),workflowRevision:initial.workflowRevision,operationId:crypto.randomUUID()};
  db.exec("CREATE TRIGGER fail_curriculum_child BEFORE INSERT ON modules WHEN NEW.name='First module' BEGIN SELECT RAISE(ABORT,'Synthetic child failure'); END");
  assert.equal((await post(env,base+'subjects/save-batch',input,token)).status,503);
  assert.equal(db.prepare("SELECT count(*) n FROM activities WHERE name='Atomic Subject'").get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,audits);
  db.exec('DROP TRIGGER fail_curriculum_child');
  const binding=nativeBinding(db);let lose=true;
  const wrapped={...binding,batch:async statements=>{const result=await binding.batch(statements);if(lose&&db.prepare('SELECT 1 FROM operation_receipts WHERE operation_id=?').get(input.operationId)){lose=false;throw Error('Lost acknowledgement');}return result;}};
  assert.equal(ok(await post({...env,ACADEMY_DB:{withSession:()=>wrapped}},base+'subjects/save-batch',input,token)).replayed,true);
  assert.equal(db.prepare("SELECT count(*) n FROM activities WHERE name='Atomic Subject'").get().n,1);
  const outcomes=await Promise.all(['First rename','Second rename'].map(subjectName=>write(env,base+'subject/save',{subjectId:'subject-1',subjectName,active:true},token,'1')));
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
}));

test('shared subject authority is checked inside the transaction',()=>use(async({env,db})=>{
  const token=await login(env),binding=nativeBinding(db);let revoke=true;
  const wrapped={...binding,batch:async statements=>{if(revoke&&statements.length===6){revoke=false;db.exec('UPDATE global_role_assignments SET active=0');}return binding.batch(statements);}};
  const result=await post({...env,ACADEMY_DB:{withSession:()=>wrapped}},subjects+'save',{mode:'create',subjectName:'Denied subject',operationId:crypto.randomUUID()},token);
  assert.equal(result.status,401);assert.equal(db.prepare("SELECT count(*) n FROM subject_catalog WHERE name='Denied subject'").get().n,0);
}));

test('older account timetable shares paid privacy, timed joining and a bounded 14-day range',()=>use(async({env,db})=>{
  const token=await login(env,'0002');assert.equal((await post(env,'/api/academy/timetable',{})).status,401);
  assert.equal(ok(await post(env,'/api/academy/timetable',{startDate:'2026-10-09',days:14},token)).viewEnd,'2026-10-22');
  assert.equal((await post(env,'/api/academy/timetable',{days:15},token)).status,400);
  assert.equal((await post(env,'/api/academy/timetable',{startDate:'2026-02-30'},token)).status,400);
  db.exec("UPDATE course_run_access SET access_model='PAID'");
  const repository=academyD1Repository(env),state=await repository.byLogin('login-0002'),auth={state,user:{type:'account',accountid:state.account.account_id,role:state.contexts[0].role}};
  const current=await d1AccountTimetable(repository,auth,{startDate:'2026-10-09',days:2},new Date('2026-10-09T08:30:00Z'));
  const course=current.sessions.find(s=>s.kind==='GLOBAL');assert.equal(course.visibilityLevel,'LABEL');assert.equal(course.relevant,false);assert.ok(!course.zoomLink&&!course.teacherName&&!course.moduleName);
  const own=current.sessions.find(s=>s.kind==='PROGRAM'&&s.relevant);assert.equal(own.visibilityLevel,'DETAIL');assert.equal(own.canOpenZoom,true);assert.ok(own.zoomLink);
  assert.ok(current.sessions.filter(s=>!s.relevant).every(s=>!s.zoomLink));
  for(const instant of ['2026-10-09T07:54:00Z','2026-10-09T09:00:00Z'])assert.ok((await d1AccountTimetable(repository,auth,{startDate:'2026-10-09'},new Date(instant))).sessions.every(s=>!s.zoomLink));
  const teacherState=await repository.byLogin('login-0003');
  const teaching=await d1AccountTimetable(repository,{state:teacherState,user:{type:'account',accountid:'account-0003',role:'TEACHER'}},{startDate:'2026-10-09'},new Date('2026-10-09T08:30:00Z'));
  assert.ok(teaching.sessions.some(s=>s.kind==='GLOBAL'&&s.relevant&&s.canOpenZoom));
  const workspace=ok(await post(env,'/api/account/workspace',{},token));assert.equal(workspace.sessionStore,'D1');assert.match(workspace.workspace.path,/^\/academy\/#activity\/PROGRAM\//);
  assert.equal((await post(env,'/api/account/global-workspace',{},token)).status,403);
},snapshot=>setCell(snapshot,'PublishedGlobalTimetableSessions',1,'ZoomLink','https://zoom.us/j/12345678901')));

test('existing Global Curriculum script loads D1 and reuses its retry identifier after an uncertain save',()=>use(async({env,db})=>{
  const token=await login(env),elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},querySelectorAll:()=>[],querySelector:()=>null});return elements.get(id);};
  const calls=[];let uncertain=true;
  const apiPost=async(path,input={},auth=token)=>{calls.push({path,input});const result=(await post(env,path,input,auth||token)).body;if(uncertain&&path===base+'subjects/save-batch'&&result.success){uncertain=false;return {success:false,retryable:true,error:'Uncertain response'};}return result;};
  const window={showScreen:()=>true,M4LAuth:{apiPost}},context={window,apiPost,state:{token,user:{type:'account',role:'GLOBAL_ADMIN',platformrole:'GLOBAL_ADMIN'}},crypto,Date,Map,Set,console,alert(){},document:{addEventListener(){},getElementById:element,querySelectorAll:()=>[],querySelector:()=>null}};
  let code=readFileSync(new URL('../../js/m4l-global-curriculum.js',import.meta.url),'utf8'),at=code.indexOf('  window.M4LGlobalCurriculum =');
  code=code.slice(0,at)+'  window.testWorkflowPost=workflowPost;window.testSelectTab=selectTab;\n'+code.slice(at);vm.runInNewContext(code,context);
  assert.equal(await window.M4LGlobalCurriculum.show(),true);
  const input=batch('Browser Subject');assert.equal((await window.testWorkflowPost(base+'subjects/save-batch',input,token)).success,false);
  assert.equal((await window.testWorkflowPost(base+'subjects/save-batch',input,token)).replayed,true);
  const writes=calls.filter(c=>c.path===base+'subjects/save-batch');assert.equal(writes[0].input.operationId,writes[1].input.operationId);
  assert.equal(db.prepare("SELECT count(*) n FROM activities WHERE name='Browser Subject'").get().n,1);
  window.testSelectTab('access');assert.ok([...elements.values()].some(e=>e.innerHTML.includes('Subscription editing is not available yet')));
  window.testSelectTab('resources');assert.ok([...elements.values()].some(e=>e.innerHTML.includes('Global Resource editing is not available yet')));
}));
