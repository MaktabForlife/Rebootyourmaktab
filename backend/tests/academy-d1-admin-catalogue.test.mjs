import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';

const profiles='/api/admin/platform/user-profiles/',catalogue='/api/admin/platform/learning-catalogue/get';
async function post(env,path,input={},token=''){
  const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:response.status,body:await response.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const directory=async(env,token)=>ok(await post(env,profiles+'get',{},token));
const edit=async(env,token,id,changes)=>{const d=await directory(env,token),a=d.accounts.find(a=>a.accountId==='account-'+id);return {mode:'profile',accountId:a.accountId,creating:false,displayName:a.displayName,active:a.active,baseRevision:a.revision,...changes,operationId:crypto.randomUUID()};};
async function use(fn){
  const f=await courseFixture();for(const name of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
  f.db.exec("INSERT INTO subject_catalog VALUES('ACADEMY:subject-1','ACADEMY','subject-1','Synthetic shared subject',1); UPDATE program_subjects SET subject_key='ACADEMY:subject-1'");
  f.db.exec(readFileSync(new URL('../migrations/academy/0010_shared_module_catalogue.sql',import.meta.url),'utf8'));
  const previous=globalThis.fetch;let outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('External services forbidden');};
  try{await fn(f);assert.equal(outbound,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{globalThis.fetch=previous;f.db.close();}
}

test('Global Admin designation grants all current and new areas; removal preserves scoped roles and credentials',()=>use(async({env,db})=>{
  const owner=await login(env),originalRoles=db.prepare("SELECT * FROM role_assignments WHERE account_id='account-0002'").all(),credentials=db.prepare("SELECT * FROM account_credentials WHERE account_id='account-0002'").get();
  const d=await directory(env,owner);assert.equal(d.adminDesignationEditable,true);assert.equal(d.currentAccountId,'account-0001');
  const grant=await edit(env,owner,'0002',{academyAdmin:true});const saved=ok(await post(env,profiles+'save',grant,owner));
  assert.equal(saved.profile.academyAdmin,true);assert.ok(saved.profile.assignments.every(g=>g.displayRoles.includes('PROGRAM_ADMIN')));
  assert.equal(ok(await post(env,profiles+'save',grant,owner)).replayed,true);
  const promoted=await login(env,'0002');ok(await post(env,catalogue,{},promoted));ok(await post(env,profiles+'get',{},promoted));
  const created=ok(await post(env,'/api/admin/platform/programs/create',{id:'PRG-'+crypto.randomUUID(),name:'New Program',durationYears:1,timezone:'Africa/Johannesburg',status:'DRAFT',operationId:crypto.randomUUID()},owner));
  assert.ok((await directory(env,promoted)).accounts.find(a=>a.accountId==='account-0002').assignments.find(g=>g.scopeId===created.program.id).displayRoles.includes('PROGRAM_ADMIN'));
  ok(await post(env,profiles+'save',await edit(env,owner,'0002',{academyAdmin:false}),owner));
  assert.ok((await post(env,catalogue,{},promoted)).status>=401);
  const after=(await directory(env,owner)).accounts.find(a=>a.accountId==='account-0002');assert.equal(after.academyAdmin,false);assert.ok(after.assignments.every(g=>!g.inheritedRoles.length));
  assert.deepEqual(db.prepare("SELECT * FROM role_assignments WHERE account_id='account-0002'").all(),originalRoles);assert.deepEqual(db.prepare("SELECT * FROM account_credentials WHERE account_id='account-0002'").get(),credentials);
  assert.ok(db.prepare("SELECT changed_fields_json FROM audit_events WHERE record_kind='USER_PROFILES'").all().every(r=>r.changed_fields_json.includes('GlobalAdmin')));
}));

test('Global Admin edits enforce authority, own-admin protection, active accounts and stale revisions atomically',()=>use(async({env,db})=>{
  const owner=await login(env),student=await login(env,'0002'),scoped=await login(env,'0004');
  const input=await edit(env,owner,'0002',{academyAdmin:true});
  for(const token of ['',student,scoped])assert.ok((await post(env,profiles+'save',input,token)).status>=401);
  assert.equal((await post(env,profiles+'save',await edit(env,owner,'0001',{academyAdmin:false}),owner)).body.code,'OWN_ADMIN_CHANGE');
  assert.equal((await post(env,profiles+'save',await edit(env,owner,'0002',{academyAdmin:'true'}),owner)).status,400);
  assert.equal((await post(env,profiles+'save',await edit(env,owner,'0002',{academyAdmin:true,active:false}),owner)).status,400);
  ok(await post(env,profiles+'save',input,owner));assert.equal((await post(env,profiles+'save',{...input,academyAdmin:false,operationId:crypto.randomUUID()},owner)).body.code,'ROW_CHANGED');
  const originalName=db.prepare("SELECT display_name FROM accounts WHERE account_id='account-0003'").get().display_name;
  const entries=[await edit(env,owner,'0003',{displayName:'Must roll back',academyAdmin:true}),await edit(env,owner,'0001',{academyAdmin:false})];
  assert.equal((await post(env,profiles+'save',{mode:'batch',entries,operationId:crypto.randomUUID()},owner)).status,409);
  assert.equal(db.prepare("SELECT display_name FROM accounts WHERE account_id='account-0003'").get().display_name,originalName);assert.equal(db.prepare("SELECT count(*) n FROM global_role_assignments WHERE account_id='account-0003' AND active=1").get().n,0);
}));

test('authority revoked after planning cannot grant a new Global Admin',()=>use(async({env,db})=>{
  const owner=await login(env),input=await edit(env,owner,'0002',{academyAdmin:true}),session=env.ACADEMY_DB.withSession(),sql=new WeakMap();let removed=false;
  function tagged(statement,source){sql.set(statement,source);const bind=statement.bind;statement.bind=(...args)=>tagged(bind(...args),source);return statement;}
  env.ACADEMY_DB={withSession:()=>({...session,prepare:source=>tagged(session.prepare(source),source),batch:async statements=>{if(!removed&&sql.get(statements[0])?.includes('INSERT INTO academy_write_guards')){removed=true;db.exec("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'");}return session.batch(statements);}})};
  assert.equal((await post(env,profiles+'save',input,owner)).status,401);
  assert.equal(db.prepare("SELECT count(*) n FROM global_role_assignments WHERE account_id='account-0002' AND active=1").get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
}));

test('new Global Admin profile uses existing identity and read-only catalogue rejects all scoped users',()=>use(async({env,db})=>{
  const owner=await login(env),d=await directory(env,owner),id=crypto.randomUUID();
  const created=ok(await post(env,profiles+'save',{mode:'profile',creating:true,accountId:id,displayName:'New administrator',active:true,academyAdmin:true,academyTeacher:true,baseRevision:d.emptyRevision,operationId:crypto.randomUUID()},owner));
  assert.equal(created.profile.academyAdmin,true);assert.equal(created.profile.academyTeacher,true);assert.match(created.loginPath,/^\/account\//);
  assert.equal(db.prepare('SELECT pin_setup FROM account_credentials WHERE account_id=?').get(id).pin_setup,0);
  const before=db.prepare('SELECT version FROM academy_write_state').get().version,data=ok(await post(env,catalogue,{},owner));assert.equal(db.prepare('SELECT version FROM academy_write_state').get().version,before);
  for(const value of ['pin_hash','login_link_id','drive_file_id','login-0002'])assert.ok(!JSON.stringify(data).includes(value));
  assert.ok(data.subjects.length);assert.equal(data.modulesReady,true);assert.ok(data.modules.some(m=>m.usedIn.some(a=>a.kind==='PROGRAM')));assert.ok(data.modules.some(m=>m.usedIn.some(a=>a.kind==='COURSE')));
  for(const token of ['',await login(env,'0002'),await login(env,'0003'),await login(env,'0004')])assert.ok((await post(env,catalogue,{},token)).status>=401);
}));
const moduleSave='/api/admin/platform/learning-catalogue/module/save';
test('shared Subject/Module definitions are reused across Programs and Courses; edits preserve published lessons and resource IDs',()=>use(async({env,db})=>{
  const owner=await login(env),read=async()=>ok(await post(env,catalogue,{},owner));
  const publications=db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all(),lessons=db.prepare('SELECT * FROM published_lessons ORDER BY activity_key,publication_id,lesson_anchor').all(),resources=db.prepare('SELECT * FROM program_resources').all();
  let data=await read();const subject=data.subjects.find(s=>s.Active),module=data.modules.find(m=>m.usedIn.some(a=>a.kind==='PROGRAM')),program=module.usedIn.find(a=>a.kind==='PROGRAM');
  assert.equal(module.subjectId,subject.SubjectID);assert.ok(!('areaKey' in module));
  ok(await post(env,'/api/admin/platform/academy-subjects/save',{mode:'rename',subjectId:subject.SubjectID,subjectName:'Updated shared subject',baseRevision:subject.Revision,operationId:crypto.randomUUID()},owner));
  assert.equal((await read()).modules.find(m=>m.id===module.id).subjectName,'Updated shared subject');
  const update={id:module.id,name:'Updated shared module',subjectId:module.subjectId,active:true,baseRevision:module.revision,operationId:crypto.randomUUID()};
  ok(await post(env,moduleSave,update,owner));assert.equal(ok(await post(env,moduleSave,update,owner)).replayed,true);
  assert.equal(db.prepare('SELECT name FROM modules WHERE activity_key=?').get('PROGRAM:'+program.id).name,'Updated shared module');
  assert.equal((await post(env,moduleSave,{...update,operationId:crypto.randomUUID()},owner)).body.code,'ROW_CHANGED');
  data=await read();const added=ok(await post(env,moduleSave,{name:'Reusable module',subjectId:subject.SubjectID,active:true,baseRevision:data.emptyRevision,operationId:crypto.randomUUID()},owner)).module;
  assert.deepEqual((await read()).modules.find(m=>m.id===added.id).usedIn,[]);
  const view=ok(await post(env,'/api/admin/platform/program-timetable/manage-get',{id:program.id},owner)),ps=view.rows.subjects[0];
  assert.ok(view.sharedModules.some(m=>m.id===added.id));
  const linked=ok(await post(env,'/api/admin/platform/program-timetable/manage-save',{id:program.id,kind:'modules',creating:true,record:{ProgramModuleID:'MOD-'+crypto.randomUUID(),ProgramSubjectID:ps.ProgramSubjectID,LevelID:'',Name:added.name,SortOrder:3,Active:true},baseRowRevision:view.emptyRowRevision,operationId:crypto.randomUUID()},owner));
  assert.equal(db.prepare('SELECT academy_module_id FROM academy_module_usage WHERE module_id=?').get(linked.record.ProgramModuleID).academy_module_id,added.id);
  const options=ok(await post(env,'/api/admin/platform/courses/list',{},owner));assert.ok(options.categories.some(c=>c.key==='MODULE:ACADEMY:'+added.id));
  const details={name:'Classified Course',categoryKey:'MODULE:ACADEMY:'+added.id,weekdays:[],sessions:[]};
  const created=ok(await post(env,'/api/admin/platform/courses/save',{details,operationId:crypto.randomUUID()},owner));
  assert.deepEqual(new Set((await read()).modules.find(m=>m.id===added.id).usedIn.map(a=>a.kind)),new Set(['PROGRAM','COURSE']));
  const current=(await read()).modules.find(m=>m.id===added.id);
  ok(await post(env,moduleSave,{id:added.id,name:added.name,subjectId:added.subjectId,active:false,baseRevision:current.revision,operationId:crypto.randomUUID()},owner));
  assert.equal((await read()).modules.find(m=>m.id===added.id).usedIn.length,2);
  assert.equal(db.prepare('SELECT active FROM modules WHERE module_id=?').get(linked.record.ProgramModuleID).active,1);
  assert.equal(ok(await post(env,'/api/admin/platform/courses/get',created,owner)).course.details.categoryKey,details.categoryKey);
  assert.deepEqual(db.prepare('SELECT * FROM timetable_publications ORDER BY activity_key,publication_id').all(),publications);
  assert.deepEqual(db.prepare('SELECT * FROM published_lessons ORDER BY activity_key,publication_id,lesson_anchor').all(),lessons);assert.deepEqual(db.prepare('SELECT * FROM program_resources').all(),resources);
}));

test('shared Module writes require Global Admin, active Subject, valid revision and unique names',()=>use(async({env})=>{
 const owner=await login(env),data=ok(await post(env,catalogue,{},owner)),subject=data.subjects[0],module=data.modules.find(m=>m.subjectId);
 const input={name:module.name,subjectId:subject.SubjectID,active:true,baseRevision:data.emptyRevision,operationId:crypto.randomUUID()};
 assert.equal((await post(env,moduleSave,input,await login(env,'0004'))).status,403);
 assert.equal((await post(env,moduleSave,input,owner)).status,409);
 assert.equal((await post(env,moduleSave,{...input,subjectId:''},owner)).status,400);
 assert.equal((await post(env,moduleSave,{...input,name:'Other',active:'true'},owner)).status,400);
 assert.equal((await post(env,moduleSave,{...input,name:'Other',baseRevision:'stale'},owner)).body.code,'ROW_CHANGED');
}));

test('catalogue migration deduplicates shared definitions, excludes inactive usage and leaves Course parents unresolved',async()=>{
 const f=await courseFixture();try{
  for(const n of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+n,import.meta.url),'utf8'));
  const m=f.db.prepare('SELECT * FROM modules WHERE program_subject_id IS NOT NULL').get();
  f.db.prepare('INSERT INTO modules(activity_key,module_id,program_subject_id,level_id,name,sort_order,active) VALUES(?,?,?,?,?,?,1)').run(m.activity_key,'same-definition',m.program_subject_id,m.level_id,'  '+m.name.toUpperCase()+'  ',2);
  f.db.prepare('INSERT INTO modules(activity_key,module_id,program_subject_id,name,sort_order,active) VALUES(?,?,?,?,1,0)').run(m.activity_key,'inactive-module',m.program_subject_id,'Excluded module');
  const references=f.db.prepare('SELECT module_id FROM program_resources').all(),published=f.db.prepare('SELECT snapshot_json FROM timetable_publications').all();
  f.db.exec(readFileSync(new URL('../migrations/academy/0010_shared_module_catalogue.sql',import.meta.url),'utf8'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM academy_module_usage WHERE activity_key=?').get(m.activity_key).n,2);
  assert.equal(f.db.prepare('SELECT count(DISTINCT academy_module_id) n FROM academy_module_usage WHERE activity_key=?').get(m.activity_key).n,1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM academy_module_catalogue WHERE name='Excluded module'").get().n,0);
  assert.ok(f.db.prepare('SELECT * FROM academy_module_catalogue WHERE subject_key IS NULL').all().length);
  assert.deepEqual(f.db.prepare('SELECT module_id FROM program_resources').all(),references);assert.deepEqual(f.db.prepare('SELECT snapshot_json FROM timetable_publications').all(),published);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.db.close();}
});
