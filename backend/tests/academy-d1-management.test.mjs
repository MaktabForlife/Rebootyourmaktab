import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
const schema=readFileSync(new URL('../migrations/academy/0004_management_transactions.sql',import.meta.url),'utf8');
const profilePath='/api/admin/platform/user-profiles/';
const programPath='/api/admin/platform/program-timetable/';
const registryPath='/api/admin/platform/programs/';
async function post(env,path,input={},token='') {
  const response=await worker.fetch(new Request(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input)}),env);
  return {status:response.status,body:await response.json()};
}
const signIn=(env,id='0001')=>post(env,'/api/account/login',{uniqueid:`login-${id}`,pin:'1234'});
async function use(fn) {
  const f=await fixtureDatabase();f.db.exec(schema);const previous=globalThis.fetch;let outbound=0;
  globalThis.fetch=async()=>{outbound++;throw Error('External services prohibited');};
  try {await fn(f);assert.equal(outbound,0);assert.deepEqual(f.db.prepare('SELECT * FROM academy_write_guards').all(),[]);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}
  finally{globalThis.fetch=previous;f.db.close();}
}
async function view(env,token,id=PROGRAM_IDS[0]) {const result=await post(env,programPath+'manage-get',{id,includeOverview:true},token);assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
const classEdit=(data,name='Changed class')=>({id:data.program.id,kind:'classes',record:{...data.rows.classes[0],Name:name},creating:false,baseRowRevision:data.rowRevisions.classes[data.rows.classes[0].ClassID],operationId:crypto.randomUUID()});

test('approved Senior-to-Teacher and Admin-to-Program-Admin mapping stays scoped',()=>use(async({env,db})=>{
  const admin=await signIn(env,'0004'),senior=await signIn(env,'0005');
  assert.equal(admin.body.context.role,'PROGRAM_ADMIN');assert.equal(senior.body.context.role,'TEACHER');
  const allowed=await view(env,admin.body.token);assert.equal(allowed.managementEditable,true);
  assert.ok(allowed.accounts.every(a=>a.Roles.length));
  assert.equal((await post(env,programPath+'manage-save',classEdit(allowed,'Program Admin class'),admin.body.token)).status,200);
  assert.equal(db.prepare("SELECT authority FROM audit_events WHERE record_kind='PROGRAM_MANAGEMENT'").get().authority,'PROGRAM_ADMIN');
  assert.equal((await post(env,programPath+'manage-get',{id:PROGRAM_IDS[1]},admin.body.token)).status,403);
  assert.equal((await post(env,profilePath+'get',{},admin.body.token)).status,403);
  assert.equal((await post(env,programPath+'manage-save',classEdit(allowed),senior.body.token)).status,403);
  const home=await post(env,'/api/academy/entrance',{id:PROGRAM_IDS[0],startDate:'2026-10-09'},admin.body.token);
  assert.equal(home.status,200);assert.ok(home.body.activity.roles.includes('PROGRAM_ADMIN'));assert.ok(home.body.activity.tools.manage);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM role_assignments WHERE role='PROGRAM_ADMIN'").get().n,0,'mapping keeps original import evidence intact');
}));

test('class saves are atomic, replayable and protect newer edits',()=>use(async({env,db})=>{
  const signed=await signIn(env),token=signed.body.token,data=await view(env,token),input=classEdit(data);
  const first=await post(env,programPath+'manage-save',input,token);assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal((await post(env,programPath+'manage-save',input,token)).body.replayed,true);
  const next=classEdit(await view(env,token),'Latest class');assert.equal((await post(env,programPath+'manage-save',next,token)).status,200);
  const stale=await post(env,programPath+'manage-save',{...input,operationId:crypto.randomUUID(),record:{...input.record,Name:'Stale class'}},token);
  assert.equal(stale.status,409);assert.equal(stale.body.code,'ROW_CHANGED');assert.equal(stale.body.currentRecord.Name,'Latest class');
  assert.equal((await post(env,programPath+'manage-save',input,token)).body.record.Name,'Changed class');
  assert.equal(db.prepare('SELECT name FROM classes WHERE activity_key=? AND class_id=?').get(`PROGRAM:${data.program.id}`,input.record.ClassID).name,'Latest class');
  assert.equal((await post(env,programPath+'manage-save',{...input,record:{...input.record,Name:'Different payload'}},token)).body.code,'OPERATION_ID_REUSED');
  assert.equal(db.prepare("SELECT count(*) AS n FROM operation_receipts WHERE dataset_key='PROGRAM_MANAGEMENT'").get().n,2);
}));

test('concurrent edits to one class cannot overwrite each other; unrelated rows merge',()=>use(async({env})=>{
  const token=(await signIn(env)).body.token,data=await view(env,token);
  const results=await Promise.all(['First','Second'].map(name=>post(env,programPath+'manage-save',classEdit(data,name),token)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const refreshed=await view(env,token),classes=[0,1].map(i=>({id:refreshed.program.id,kind:'classes',creating:true,record:{ClassID:`CLS-${crypto.randomUUID()}`,Name:`New class ${i}`,Active:true,TeacherAccountID:'',ZoomLink:'',AcademicYear:''},baseRowRevision:refreshed.emptyRowRevision,operationId:crypto.randomUUID()}));
  const added=await Promise.all(classes.map(input=>post(env,programPath+'manage-save',input,token)));
  assert.deepEqual(added.map(r=>r.status),[200,200]);
}));

test('new profiles, role grants and class assignment use existing UI contracts',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token,directory=(await post(env,profilePath+'get',{},token)).body;
  assert.deepEqual(directory.roles,['STUDENT','TEACHER','PROGRAM_ADMIN']);assert.equal(directory.reviewCount,1,'an unconfirmed mixed-role source cell remains pending');
  const owner=directory.accounts.find(a=>a.accountId==='account-0001');
  assert.equal(owner.academyAdmin,true);
  assert.ok(owner.assignments.every(a=>a.displayRoles.length===1&&a.displayRoles[0]==='PROGRAM_ADMIN'),'Academy-wide authority is visible in every Program and Course');
  assert.ok(!directory.roles.includes('GLOBAL_ADMIN'),'Global Admin cannot be granted or removed through a Program role editor');
  assert.ok(directory.accounts.find(a=>a.accountId==='account-0004').assignments.some(a=>a.displayRoles.includes('PROGRAM_ADMIN')),'scoped administrators retain their Program role label');
  assert.ok(!JSON.stringify(directory).includes('pin_hash'));assert.ok(!JSON.stringify(directory).includes('login-0002'));
  const id=crypto.randomUUID(),create={mode:'profile',accountId:id,displayName:'New learner',active:true,creating:true,baseRevision:directory.emptyRevision,operationId:crypto.randomUUID()};
  const created=await post(env,profilePath+'save',create,token);assert.equal(created.status,200,JSON.stringify(created.body));assert.match(created.body.loginPath,/^\/account\/[0-9a-f]{32}$/);
  assert.equal((await post(env,profilePath+'save',create,token)).body.replayed,true);
  let data=(await post(env,profilePath+'get',{},token)).body;
  const scope=data.scopes.find(s=>s.type==='PROGRAM'&&s.id===PROGRAM_IDS[0]),a=data.accounts.find(a=>a.accountId===id),assignment=a.assignments.find(g=>g.scopeId===scope.id);
  const grant={mode:'matrix-roles',accountId:id,scopeType:'PROGRAM',scopeId:scope.id,roles:['STUDENT'],baseRevision:assignment.revision,scopeRevision:scope.revision,operationId:crypto.randomUUID()};
  assert.equal((await post(env,profilePath+'save',grant,token)).status,200);
  data=await view(env,token);const assign={id:scope.id,kind:'student-class',record:{AccountID:id,ClassID:data.rows.classes[0].ClassID},baseRowRevision:data.studentClassRevisions[id],operationId:crypto.randomUUID()};
  assert.equal((await post(env,programPath+'manage-save',assign,token)).status,200);
  assert.equal((await post(env,programPath+'manage-save',assign,token)).body.replayed,true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM class_memberships WHERE account_id=? AND active=1').get(id).n,1);
  assert.equal((await post(env,profilePath+'save',{...grant,roles:['GLOBAL_ADMIN'],operationId:crypto.randomUUID()},token)).status,409,'stale grant rejected before escalation');
  const latest=(await post(env,profilePath+'get',{},token)).body.accounts.find(a=>a.accountId===id).assignments.find(g=>g.scopeId===scope.id);
  const escalation=await post(env,profilePath+'save',{...grant,baseRevision:latest.revision,roles:['GLOBAL_ADMIN'],operationId:crypto.randomUUID()},token);
  assert.equal(escalation.status,400);assert.equal(escalation.body.code,'INVALID_ROLE');
}));

test('student class batches keep all rows atomic and never duplicate an enrollment on retry',()=>use(async({env,db})=>{
  db.prepare("INSERT INTO classes(activity_key,class_id,name,active) VALUES(?,?,?,1)").run(`PROGRAM:${PROGRAM_IDS[0]}`,'CLS-test-destination','Destination class');
  const token=(await signIn(env)).body.token,data=await view(env,token),classId='CLS-test-destination';
  const changes=['account-0002','account-0008'].map(AccountID=>({AccountID,ClassID:classId,baseRowRevision:data.studentClassRevisions[AccountID]}));
  const base={id:data.program.id,kind:'student-classes',changes,operationId:crypto.randomUUID()};
  const count=()=>db.prepare('SELECT count(*) AS n FROM class_memberships').get().n,before=count();
  const invalid=await post(env,programPath+'manage-save',{...base,changes:[changes[0],{...changes[1],ClassID:'missing-class'}]},token);
  assert.equal(invalid.status,400);assert.equal(count(),before);assert.equal(db.prepare('SELECT count(*) AS n FROM operation_receipts').get().n,0);
  const saved=await post(env,programPath+'manage-save',base,token);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.records.length,2);
  assert.equal((await post(env,programPath+'manage-save',base,token)).body.replayed,true);
  for(const entry of changes)assert.equal(db.prepare('SELECT count(*) AS n FROM class_memberships WHERE account_id=? AND active=1').get(entry.AccountID).n,1);
  const stale=await post(env,programPath+'manage-save',{...base,operationId:crypto.randomUUID()},token);
  assert.equal(stale.status,409);assert.equal(stale.body.entryKey,'account-0002');
}));

test('disabling a profile ends existing sessions while preserving identity and enrolment history',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token,student=(await signIn(env,'0002')).body.token;
  const data=(await post(env,profilePath+'get',{},token)).body,account=data.accounts.find(a=>a.accountId==='account-0002');
  const before=db.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(account.accountId).login_link_id;
  const membershipCount=db.prepare('SELECT count(*) AS n FROM class_memberships WHERE account_id=?').get(account.accountId).n;
  const saved=await post(env,profilePath+'save',{mode:'profile',accountId:account.accountId,displayName:'Updated learner',active:false,creating:false,baseRevision:account.revision,operationId:crypto.randomUUID()},token);
  assert.equal(saved.status,200);assert.equal((await post(env,'/api/account/session',{},student)).status,401);
  assert.equal(db.prepare('SELECT login_link_id FROM accounts WHERE account_id=?').get(account.accountId).login_link_id,before);
  assert.equal(db.prepare('SELECT count(*) AS n FROM class_memberships WHERE account_id=?').get(account.accountId).n,membershipCount);
}));

test('explicit role edits supersede mapped evidence and immediately remove old sessions',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token,mapped=(await signIn(env,'0004')).body.token;
  const data=(await post(env,profilePath+'get',{},token)).body,scope=data.scopes.find(s=>s.id===PROGRAM_IDS[0]),account=data.accounts.find(a=>a.accountId==='account-0004'),assignment=account.assignments.find(a=>a.scopeId===scope.id);
  const input={mode:'matrix-roles',accountId:account.accountId,scopeType:'PROGRAM',scopeId:scope.id,roles:['TEACHER'],baseRevision:assignment.revision,scopeRevision:scope.revision,operationId:crypto.randomUUID()};
  assert.equal((await post(env,profilePath+'save',input,token)).status,200);
  assert.equal(db.prepare("SELECT status FROM role_import_reviews WHERE account_id='account-0004'").get().status,'CONFIRMED');
  assert.equal((await post(env,programPath+'manage-get',{id:scope.id},mapped)).status,401);
  assert.equal((await signIn(env,'0004')).body.context.role,'TEACHER');
}));

test('profile batch failure rolls back every entry; self-disable and inactive grants are rejected',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token,data=(await post(env,profilePath+'get',{},token)).body;
  const self=data.accounts.find(a=>a.accountId==='account-0001');
  assert.equal((await post(env,profilePath+'save',{mode:'profile',accountId:self.accountId,displayName:self.displayName,active:false,creating:false,baseRevision:self.revision,operationId:crypto.randomUUID()},token)).status,409);
  const account=data.accounts.find(a=>a.accountId==='account-0002'),scope=data.scopes.find(s=>s.id===PROGRAM_IDS[0]),grant=account.assignments.find(g=>g.scopeId===scope.id);
  const batch={mode:'batch',operationId:crypto.randomUUID(),entries:[{mode:'profile',accountId:account.accountId,displayName:'Must roll back',active:false,creating:false,baseRevision:account.revision},{mode:'matrix-roles',accountId:account.accountId,scopeType:scope.type,scopeId:scope.id,roles:['STUDENT','TEACHER'],baseRevision:grant.revision,scopeRevision:scope.revision}]};
  assert.equal((await post(env,profilePath+'save',batch,token)).status,400);
  assert.notEqual(db.prepare('SELECT display_name FROM accounts WHERE account_id=?').get(account.accountId).display_name,'Must roll back');
  assert.equal(db.prepare('SELECT count(*) AS n FROM operation_receipts').get().n,0);
}));

test('D1 Program registry supports draft creation, activation and archive without a spreadsheet',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token,id=`PRG-${crypto.randomUUID()}`,create={id,name:'New Program',durationYears:2,timezone:'Africa/Johannesburg',status:'DRAFT',operationId:crypto.randomUUID()};
  const result=await post(env,registryPath+'create',create,token);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.program.status,'DRAFT');
  assert.equal((await post(env,registryPath+'create',create,token)).body.replayed,true);
  const activate={...create,status:'ACTIVE',revision:result.body.program.revision,operationId:crypto.randomUUID()};
  assert.equal((await post(env,registryPath+'save',activate,token)).status,200);
  assert.equal(db.prepare('SELECT website_visible FROM activities WHERE activity_key=?').get(`PROGRAM:${id}`).website_visible,0,'activation alone never publishes lessons');
  const all=(await post(env,registryPath+'list',{},token)).body;assert.ok(all.programs.some(p=>p.id===id&&p.status==='ACTIVE'));
  const archive={...activate,status:'ARCHIVED',revision:'2',operationId:crypto.randomUUID()};assert.equal((await post(env,registryPath+'save',archive,token)).status,200);
  const data=await view(env,token,id);assert.equal(data.managementEditable,false);
  assert.equal((await post(env,programPath+'manage-save',{id,kind:'classes',creating:true,record:{ClassID:`CLS-${crypto.randomUUID()}`,Name:'Blocked',Active:true},baseRowRevision:data.emptyRowRevision,operationId:crypto.randomUUID()},token)).status,409);
}));

test('actual write failures leave no rows or receipts, and a lost acknowledgement replays',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token,data=await view(env,token),input=classEdit(data,'Atomic class');
  db.exec("CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='PROGRAM_MANAGEMENT' BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  assert.equal((await post(env,programPath+'manage-save',input,token)).status,503);
  assert.notEqual(db.prepare('SELECT name FROM classes WHERE class_id=?').get(input.record.ClassID).name,'Atomic class');
  assert.equal(db.prepare('SELECT count(*) AS n FROM operation_receipts').get().n,0);db.exec('DROP TRIGGER reject_test_audit');
  const original=env.ACADEMY_DB,session=original.withSession(),sql=new WeakMap();let lost=false;
  function tagged(stmt,source){sql.set(stmt,source);const bind=stmt.bind;stmt.bind=(...args)=>tagged(bind(...args),source);return stmt;}
  env.ACADEMY_DB={withSession:()=>({...session,prepare:source=>tagged(session.prepare(source),source),batch:async statements=>{const result=await session.batch(statements);if(!lost&&sql.get(statements[0])?.includes('INSERT INTO academy_write_guards')){lost=true;throw Error('Lost acknowledgement');}return result;}})};
  const saved=await post(env,programPath+'manage-save',input,token);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.replayed,true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM operation_receipts').get().n,1);
}));

test('administrator authority removed after planning blocks the whole transaction',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token,data=await view(env,token),input=classEdit(data,'Unauthorised change'),session=env.ACADEMY_DB.withSession(),sql=new WeakMap();let removed=false;
  function tagged(stmt,source){sql.set(stmt,source);const bind=stmt.bind;stmt.bind=(...args)=>tagged(bind(...args),source);return stmt;}
  env.ACADEMY_DB={withSession:()=>({...session,prepare:source=>tagged(session.prepare(source),source),batch:async statements=>{if(!removed&&sql.get(statements[0])?.includes('INSERT INTO academy_write_guards')){removed=true;db.exec("UPDATE global_role_assignments SET active=0 WHERE account_id='account-0001'");db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,'account-0001',?,'PROGRAM_ADMIN',1,'CONFIRMED')").run(crypto.randomUUID(),`PROGRAM:${PROGRAM_IDS[0]}`);}return session.batch(statements);}})};
  assert.equal((await post(env,programPath+'manage-save',input,token)).status,401);
  assert.notEqual(db.prepare('SELECT name FROM classes WHERE class_id=?').get(input.record.ClassID).name,'Unauthorised change');
  assert.equal(db.prepare('SELECT count(*) AS n FROM operation_receipts').get().n,0);
}));

test('the existing profile, Program setup and management screens work with the D1 HTTP contracts',()=>use(async({env,db})=>{
  const token=(await signIn(env)).body.token;
  const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setTimeout(resolve,2));};
  function screen(markupPath,scriptPath,search='',initialState={}) {
    const markup=readFileSync(new URL(markupPath,import.meta.url),'utf8'),ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),elements=new Map(),storage=new Map(),requests=[];
    function element(id) {
      assert.ok(ids.has(id),`Missing HTML element ${id}`);
      if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',listeners:{},classList:{toggle(){}},focus(){},showModal(){},close(){},scrollIntoView(){},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(type,fn){this.listeners[type]=fn;}});
      return elements.get(id);
    }
    for(const [key,value] of Object.entries(initialState))storage.set(`m4l-user-profiles:localhost:${key}`,JSON.stringify(value));
    const context={console,URL,URLSearchParams,structuredClone,crypto,setTimeout,clearTimeout,
      location:{search,host:'localhost',origin:'http://localhost'},window:{M4L_CONFIG:{API_BASE:''},addEventListener(){},M4L_PROGRAM_OVERVIEW:{build:()=>[]}},
      localStorage:{getItem:()=>token},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
      document:{getElementById:element,querySelector:()=>({focus(){}}),addEventListener(type,fn){if(type==='DOMContentLoaded')fn();}},
      fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return worker.fetch(new Request(new URL(url,'http://localhost'),options),env);}
    };
    vm.runInNewContext(readFileSync(new URL(scriptPath,import.meta.url),'utf8'),context);
    return {element,requests};
  }
  const profiles=screen('../../users/index.html','../../js/m4l-user-profiles.js');await settle();
  assert.match(profiles.element('up-users').innerHTML,/Program Admin/);
  assert.ok(!profiles.element('up-head').innerHTML.includes('data-policy='),'D1 policy labels are informational');
  assert.ok(!profiles.element('up-head').innerHTML.includes('Review setting'),'read-only policies must not request a review');
  assert.match(profiles.element('up-users').innerHTML,/input data-name data-account="account-0002"/);
  assert.match(profiles.element('up-users').innerHTML,/select data-active data-account="account-0002"/);
  assert.equal(profiles.element('up-save-all').disabled,true,'opening the sheet must not stage profile writes');
  assert.match(profiles.element('up-users').innerHTML,/Global Admin/);
  assert.match(profiles.element('up-users').innerHTML,/>None ▾<\/button>/);
  const globalBefore=db.prepare("SELECT * FROM global_role_assignments WHERE account_id='account-0001'").all();
  const ownerDirectory=(await post(env,profilePath+'get',{},token)).body,ownerScope=ownerDirectory.scopes.find(s=>s.type==='PROGRAM');
  profiles.element('up-users').onclick({target:{closest:()=>({dataset:{editScope:`PROGRAM:${ownerScope.id}`,account:'account-0001'}})}});
  assert.match(profiles.element('up-users').innerHTML,/Program Admin is automatic for Global Admins/);
  assert.ok(!profiles.element('up-users').innerHTML.includes('data-role="GLOBAL_ADMIN"'));
  profiles.element('up-users').onchange({target:{dataset:{role:'TEACHER',account:'account-0001',scope:`PROGRAM:${ownerScope.id}`},checked:true}});
  await profiles.element('up-save-all').onclick();await settle();
  const latestOwner=(await post(env,profilePath+'get',{},token)).body.accounts.find(a=>a.accountId==='account-0001');
  assert.ok(latestOwner.assignments.find(a=>a.scopeId===ownerScope.id).roles.includes('TEACHER'));
  assert.deepEqual(latestOwner.assignments.find(a=>a.scopeId===ownerScope.id).displayRoles,['PROGRAM_ADMIN','TEACHER']);
  assert.deepEqual(db.prepare("SELECT * FROM global_role_assignments WHERE account_id='account-0001'").all(),globalBefore,'saving an additional Program role must preserve Academy-wide authority');
  // Existing cells can be edited immediately, without opening a separate editor.
  const directName=(account,value)=>profiles.element('up-users').oninput({target:{dataset:{name:'',account},value}});
  const directStatus=(account,value)=>profiles.element('up-users').onchange({target:{dataset:{active:'',account},value}});
  const rolesBefore=db.prepare("SELECT * FROM role_assignments WHERE account_id='account-0002' ORDER BY assignment_id").all();
  directName('account-0002','Directly edited learner');directStatus('account-0002','false');
  assert.equal(profiles.element('up-save-all').disabled,false);
  assert.equal(profiles.element('up-unsaved').textContent,'1 user with unsaved changes');
  await profiles.element('up-save-all').onclick();await settle();
  assert.equal(db.prepare("SELECT display_name FROM accounts WHERE account_id='account-0002'").get().display_name,'Directly edited learner');
  assert.equal(db.prepare("SELECT active FROM accounts WHERE account_id='account-0002'").get().active,0);
  assert.deepEqual(db.prepare("SELECT * FROM role_assignments WHERE account_id='account-0002' ORDER BY assignment_id").all(),rolesBefore,'inactivating a profile preserves roles');
  directStatus('account-0002','true');await profiles.element('up-save-all').onclick();await settle();
  assert.equal(profiles.element('up-conflict').hidden,true,'repeat profile save must use the latest revision');
  directName('account-0002','Discarded name');directName('account-0003','Another discarded name');
  profiles.element('up-cancel').onclick();
  assert.equal(profiles.element('up-save-all').disabled,true,'Discard all clears every profile draft');
  assert.ok(!profiles.element('up-users').innerHTML.includes('Discarded name'));
  profiles.element('up-add').onclick();
  profiles.element('up-users').oninput({target:{dataset:{name:''},value:'Screen-created learner'}});
  await profiles.element('up-save-all').onclick();await settle();
  assert.equal(db.prepare("SELECT count(*) AS n FROM accounts WHERE display_name='Screen-created learner'").get().n,1);
  // Real D1 role edits through the current UI: first save, repeat save and
  // a genuinely stale edit retained across refresh must have distinct outcomes.
  const directory=(await post(env,profilePath+'get',{},token)).body;
  const learner=directory.accounts.find(a=>a.accountId==='account-0002');
  const scope=directory.scopes.find(s=>s.type==='PROGRAM'&&s.id===PROGRAM_IDS[0]);
  const editRole=()=>profiles.element('up-users').onclick({target:{closest:()=>({dataset:{editScope:`PROGRAM:${scope.id}`,account:learner.accountId}})}});
  const chooseRole=(role,checked)=>profiles.element('up-users').onchange({target:{dataset:{role,account:learner.accountId,scope:`PROGRAM:${scope.id}`},checked}});
  editRole();chooseRole('TEACHER',true);
  await profiles.element('up-save-all').onclick();await settle();
  assert.equal(profiles.element('up-conflict').hidden,true,'first role save must not report a conflict');
  assert.match(profiles.element('up-users').innerHTML,/Student · Teacher/);
  editRole();chooseRole('STUDENT',false);
  await profiles.element('up-save-all').onclick();await settle();
  assert.equal(profiles.element('up-conflict').hidden,true,'repeat role save must use the acknowledged revision');
  const beforeConflict=(await post(env,profilePath+'get',{},token)).body;
  const savedAssignment=beforeConflict.accounts.find(a=>a.accountId===learner.accountId).assignments.find(g=>g.scopeType==='PROGRAM'&&g.scopeId===scope.id);
  editRole();chooseRole('PROGRAM_ADMIN',true);
  const external=await post(env,profilePath+'save',{mode:'matrix-roles',accountId:learner.accountId,scopeType:'PROGRAM',scopeId:scope.id,roles:['STUDENT'],baseRevision:savedAssignment.revision,scopeRevision:scope.revision,operationId:crypto.randomUUID()},token);
  assert.equal(external.status,200,JSON.stringify(external.body));
  await profiles.element('up-refresh').onclick();await settle();
  await profiles.element('up-save-all').onclick();await settle();
  assert.equal(profiles.element('up-conflict').hidden,false,'refresh must retain the stale draft for explicit review');
  assert.match(profiles.element('up-comparison').innerHTML,/Student/);
  assert.match(profiles.element('up-comparison').innerHTML,/Teacher · Program Admin/);
  // An open role conflict must not prevent editing a different profile cell.
  directName('account-0003','Teacher edited during review');
  await profiles.element('up-refresh').onclick();await settle();
  assert.match(profiles.element('up-users').innerHTML,/Teacher edited during review/);
  assert.equal(profiles.element('up-conflict').hidden,false);
  await profiles.element('up-save-all').onclick();await settle();
  assert.equal(profiles.element('up-conflict').hidden,true);
  const reviewed=(await post(env,profilePath+'get',{},token)).body.accounts.find(a=>a.accountId===learner.accountId).assignments.find(g=>g.scopeType==='PROGRAM'&&g.scopeId===scope.id);
  assert.deepEqual(reviewed.roles,['TEACHER','PROGRAM_ADMIN']);
  assert.equal(db.prepare("SELECT display_name FROM accounts WHERE account_id='account-0003'").get().display_name,'Teacher edited during review');
  const legacyDraft={mode:'matrix-roles',accountId:learner.accountId,scopeType:'PROGRAM',scopeId:scope.id,roles:['ADMIN','PROGRAM_ADMIN'],baseRevision:reviewed.revision,scopeRevision:scope.revision,originalValue:JSON.stringify(reviewed.roles)};
  const restored=screen('../../users/index.html','../../js/m4l-user-profiles.js','',{edit:legacyDraft});await settle();
  assert.match(restored.element('up-users').innerHTML,/data-role="PROGRAM_ADMIN" checked/);
  await restored.element('up-save-all').onclick();await settle();
  assert.deepEqual(restored.requests.find(r=>r.url.endsWith('/save')).body.roles,['PROGRAM_ADMIN'],'pre-migration unsaved Program drafts use the approved role names');
  // Even an old invalid pending operation must be retried byte-for-byte, not translated.
  const pending={...legacyDraft,operationId:crypto.randomUUID()};
  const uncertain=screen('../../users/index.html','../../js/m4l-user-profiles.js','',{edit:legacyDraft,pending});await settle();
  assert.deepEqual(uncertain.requests.find(r=>r.url.endsWith('/save')).body,pending);
  const builder=screen('../../programs/index.html','../../js/m4l-program-builder.js');await settle();
  assert.equal(builder.element('program-store-label').textContent,'Records');
  assert.match(builder.element('program-rows').innerHTML,/value="ACTIVE" selected/);
  assert.ok(!builder.element('program-rows').innerHTML.includes('docs.google.com'));
  assert.ok(!builder.element('program-detail').innerHTML.includes('href="/programs/timetable.html'));
  const management=screen('../../programs/manage.html','../../js/m4l-program-management.js',`?program=${PROGRAM_IDS[0]}&tab=classes`);await settle();
  assert.equal(management.element('pm-editor').disabled,false,'active D1 Programs allow management');
  assert.equal(management.element('pm-timetable').hidden,true);
  assert.equal(management.element('pm-library').hidden,true);
  const classId=db.prepare('SELECT class_id FROM classes WHERE activity_key=?').get(`PROGRAM:${PROGRAM_IDS[0]}`).class_id;
  const button=attrs=>({dataset:attrs,hasAttribute:name=>Object.hasOwn(attrs,name)});
  management.element('pm-rows').onclick({target:{closest:()=>button({edit:classId})}});
  management.element('pm-rows').listeners.input({target:{dataset:{field:'Name'},value:'Screen-updated class'}});
  management.element('pm-rows').onclick({target:{closest:()=>button({'data-save':true})}});await settle();
  assert.equal(db.prepare('SELECT name FROM classes WHERE class_id=?').get(classId).name,'Screen-updated class');
  assert.ok(management.requests.every(r=>r.url.endsWith('/manage-get')||r.url.endsWith('/manage-save')),'no unsupported timetable or Sheets requests');
}));
