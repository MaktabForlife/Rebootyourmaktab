import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { userProfilesFixture } from '../../scripts/user-profiles-fixtures.mjs';
import { profileService } from '../src/profiles/service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
const source=await readFile(new URL('../../js/m4l-user-profiles.js',import.meta.url),'utf8');
const markup=await readFile(new URL('../../users/index.html',import.meta.url),'utf8');
const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const f=userProfilesFixture(),service=profileService(f.repository),coordinator=timetableCoordinator(f.journal,async()=>({service,user:f.authorize()}));
await coordinator.run('save',{mode:'matrix-prepare',operationId:crypto.randomUUID()},'token');
const elements=new Map(),storage=new Map(),requests=[],timers=[];
let afterSaveReadFailure=false,readFailure=null;
function element(id){assert(ids.has(id),`Missing element ${id}`);if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',classList:{toggle(){}},focus(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
const context={console,URLSearchParams,structuredClone,crypto,location:{search:'?program=PRG-DEMO&account=PERSON',host:'test.invalid',origin:'https://test.invalid'},document:{getElementById:element},localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{M4L_CONFIG:{API_BASE:''},addEventListener(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},fetch:async(url,options)=>{
 const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
 if(action==='get'&&readFailure){const failure=readFailure;readFailure=null;return {ok:false,status:503,json:async()=>({success:false,error:'Temporary spreadsheet limit',...failure})};}
 try{
  const result=['save','recover'].includes(action)?await coordinator.run(action,body,'token'):await service.read(action,body);
  if(action==='save'&&afterSaveReadFailure){afterSaveReadFailure=false;readFailure={code:'SHEETS_RATE_LIMITED',retryable:true,retryAfterMs:60000};}
  return {ok:true,status:200,json:async()=>({success:true,...result})};
 }catch(error){return {ok:false,status:error.status||503,json:async()=>({success:false,error:error.message,code:error.code,currentRecord:error.currentRecord,rowRevision:error.rowRevision,entryKey:error.entryKey})};}
}};
const settled=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,2));};
const click=async id=>{element(id).onclick();await settled();};
const rowClick=async attrs=>{element('up-users').onclick({target:{closest:()=>({dataset:attrs})}});await settled();};
const scopeClick=async attrs=>{if(attrs['data-save-roles'])return rowClick({save:'PERSON'});await rowClick({editScope:attrs.editScope,account:'PERSON'});};
const choose=(dataset,checked=true)=>element('up-users').onchange({target:{dataset,checked}});
const name=value=>element('up-users').oninput({target:{dataset:{name:''},value}});
const submit=async()=>element('up-save').hidden?click('up-save-all'):click('up-save');
const editProfile=async()=>rowClick({profile:'PERSON'});
const runTimer=async()=>{assert(timers.length);timers.shift().fn();await settled();};
vm.runInNewContext(source,context);await settled();
assert.match(element('up-users').innerHTML,/Active/);assert.match(element('up-users').innerHTML,/>None ▾<\/button>/);assert.match(element('up-head').innerHTML,/Free|Paid/);
assert.equal(requests.filter(r=>r.action==='get').length,1);
await editProfile();name('Kept across navigation');element('up-search').oninput({target:{value:'No match'}});
assert.equal(element('up-draft-notice').hidden,false);await click('up-return');assert.match(element('up-users').innerHTML,/Kept across navigation/);
await click('up-refresh');assert.match(element('up-users').innerHTML,/Kept across navigation/);
// A real page reload restores the draft before any render can remove session storage.
vm.runInNewContext(source,context);await settled();assert.match(element('up-users').innerHTML,/Kept across navigation/);
await submit();assert.equal(f.tables.UserAccounts[1].DisplayName,'Kept across navigation');
await scopeClick({editScope:'PROGRAM:PRG-DEMO'});choose({role:'TEACHER'});choose({role:'STUDENT'});
assert.match(element('up-users').innerHTML,/data-role="STUDENT" checked/);
assert(!element('up-users').innerHTML.includes('paid subscription'));
await scopeClick({editScope:'SUBJECT:PAID'}); // A clean cell in the saved user's row also closes.
await scopeClick({'data-save-roles':true});
assert(!element('up-users').innerHTML.includes('up-role-choices'));
assert.match(element('up-users').innerHTML,/Student · Teacher ▾/);
let directory=await service.read('get');
assert.deepEqual(directory.accounts[1].assignments.find(g=>g.scopeId==='PRG-DEMO').roles,['STUDENT','TEACHER']);
element('up-head').onclick({target:{closest:()=>({dataset:{policy:'PROGRAM:PRG-DEMO'}})}});
element('up-head').onchange({target:{dataset:{accessModel:''},value:'FREE'}});
await submit();assert.match(element('up-message').textContent,/entire program/);
element('up-head').onchange({target:{dataset:{policyConfirm:''},checked:true}});await submit();
assert.equal((await service.read('get')).scopes.find(s=>s.id==='PRG-DEMO').accessModel,'FREE');
// A confirmed save followed by quota exhaustion retries reads, never the confirmed write.
await click('up-add');name('New user despite refresh failure');afterSaveReadFailure=true;await submit();
assert.equal(element('up-pending').hidden,true);assert.equal(element('up-add').disabled,false);
assert.match(element('up-users').innerHTML,/data-edit-scope="PROGRAM:PRG-DEMO"/);
assert.match(element('up-message').textContent,/Saved/);assert.equal(timers[0].ms,60000);
const confirmedWrites=requests.filter(r=>r.action==='save').length;
await scopeClick({editScope:'PROGRAM:PRG-DEMO'});choose({role:'SENIOR'});
await runTimer();assert.equal(requests.filter(r=>r.action==='save').length,confirmedWrites);
assert.match(element('up-users').innerHTML,/data-role="SENIOR" checked/);
await scopeClick({'data-save-roles':true});
// Unknown acknowledgement: restore/retry the exact operation after reloading, once only.
await editProfile();name('Lost acknowledgement');f.failNext('after');await submit();
assert.equal(element('up-pending').hidden,false);const retryRequest=requests.filter(r=>r.action==='save').at(-1).body;
assert.equal(f.tables.UserAccounts[1].DisplayName,'Lost acknowledgement');
timers.length=0;vm.runInNewContext(source,context);await settled();
assert.deepEqual(requests.filter(r=>r.action==='save').at(-1).body,retryRequest);
assert.equal(element('up-pending').hidden,true);
assert.equal(f.tables.AcademyProfileOperations.filter(r=>r.OperationID===retryRequest.operationId).length,1);
// An independently changed record needs an explicit choice and never silently overwrites.
await editProfile();name('My proposed name');f.tables.UserAccounts[1].DisplayName='Other administrator name';
await submit();assert.equal(element('up-conflict').hidden,false);assert.match(element('up-comparison').innerHTML,/My proposed name/);assert.match(element('up-comparison').innerHTML,/Other administrator name/);assert.match(element('up-comparison').innerHTML,/Your proposed entry/);assert(!element('up-comparison').innerHTML.includes('<table'));
assert(!ids.has('up-keep-mine'));assert.equal(element('up-save-all').disabled,false);
await click('up-save-all');assert.equal(f.tables.UserAccounts[1].DisplayName,'My proposed name');
// Separate status preserves all subject/program roles and subscriptions.
const grants=structuredClone([f.tables.UserCourseAccess,f.tables.AcademySubjectRoles,f.tables.GlobalSubjectAccessMatrix]);
await editProfile();element('up-users').onchange({target:{dataset:{active:''},value:'false'}});await submit();
assert.equal(f.tables.UserAccounts[1].Active,false);assert.deepEqual([f.tables.UserCourseAccess,f.tables.AcademySubjectRoles,f.tables.GlobalSubjectAccessMatrix],grants);
assert.match(element('up-users').innerHTML,/Inactive/);
// Recovery of a different interrupted write must not change this request's hash.
directory=await service.read('get');const other={mode:'profile',accountId:'OWNER',creating:false,displayName:'Updated administrator',active:true,baseRevision:directory.accounts[0].revision,operationId:crypto.randomUUID()};
f.failNext('before');await assert.rejects(coordinator.run('save',other,'token'));
await editProfile();name('After earlier recovery');await submit();
assert.equal(element('up-pending').hidden,false);const pendingRequest=requests.filter(r=>r.action==='save').at(-1).body;
await click('up-retry');assert.equal(element('up-pending').hidden,true);assert.equal(f.tables.UserAccounts[1].DisplayName,'After earlier recovery');
assert.deepEqual(requests.filter(r=>r.action==='save').at(-1).body,pendingRequest);
assert(!Object.hasOwn(pendingRequest,'needsRecovery'));
console.log('Shared profiles UI: matrix rows, combined roles, independent inactive status, preserved drafts, stable retries, post-save quota recovery and conflict review passed.');

// Several users and role cells are retained and committed by Save all in one write.
await editProfile();name('Batch person');element('up-users').onchange({target:{dataset:{active:''},value:'true'}});
await rowClick({profile:'OWNER'});name('Batch owner');
await scopeClick({editScope:'PROGRAM:PRG-DEMO'});choose({role:'ADMIN'});
await scopeClick({editScope:'SUBJECT:PAID'}); // Opened but unchanged; Save all should close it too.
assert.match(element('up-users').innerHTML,/Batch person/);assert.match(element('up-users').innerHTML,/Batch owner/);
assert.match(element('up-users').innerHTML,/data-save="PERSON"/);
const writesBefore=requests.filter(r=>r.action==='save').length;await click('up-save-all');
assert.equal(requests.filter(r=>r.action==='save').length,writesBefore+1);
assert.equal(requests.filter(r=>r.action==='save').at(-1).body.mode,'batch');
assert.equal(f.tables.UserAccounts[0].DisplayName,'Batch owner');assert.equal(f.tables.UserAccounts[1].DisplayName,'Batch person');
assert.match(f.tables.AcademyAccessMatrix[1]['PROGRAM:PRG-DEMO'],/ADMIN/);
assert(!element('up-users').innerHTML.includes('up-role-choices'));
assert.match(element('up-users').innerHTML,/Student · Teacher · Senior · Admin ▾/);
assert.match(element('up-users').innerHTML,/data-view="PERSON"/);assert.match(element('up-users').innerHTML,/data-share="PERSON"/);assert.match(element('up-users').innerHTML,/data-copy="PERSON"/);
assert(!element('up-head').innerHTML.includes('>Global subject<'));
await click('up-add');name('Zebra new user');await submit();
assert(element('up-users').innerHTML.indexOf('Zebra new user')<element('up-users').innerHTML.indexOf('Batch owner'));
await click('up-refresh');assert(element('up-users').innerHTML.indexOf('Zebra new user')<element('up-users').innerHTML.indexOf('Batch owner'));
console.log('Profiles UI: multi-user Save all, row icons, cleaned headings and session-pinned new users passed.');

await rowClick({view:'PERSON'});
assert.equal(element('up-profile-dialog').open,true);
assert.match(element('up-profile-title').textContent,/Login link/);
assert.match(element('up-profile-body').innerHTML,/https:\/\/test.invalid\/account\//);
assert(!element('up-profile-body').innerHTML.includes('saved profile details'));
await click('up-profile-close');assert.equal(element('up-profile-dialog').open,false);
await editProfile();assert.equal(element('up-save').hidden,true);
assert(!markup.includes('>Save row<'));
console.log('Profile actions: login link dialog and individual saves through row icons passed.');

// One Free/Paid policy update makes several open role drafts stale together.
await rowClick({editScope:'PROGRAM:PRG-DEMO',account:'PERSON'});choose({role:'TEACHER'},false);
await rowClick({editScope:'PROGRAM:PRG-DEMO',account:'OWNER'});choose({role:'STUDENT'});
directory=await service.read('get');const scope=directory.scopes.find(s=>s.id==='PRG-DEMO');
await coordinator.run('save',{mode:'matrix-policy',scopeType:'PROGRAM',scopeId:'PRG-DEMO',accessModel:'PAID',policyConfirmed:true,baseRevision:scope.revision,operationId:crypto.randomUUID()},'token');
await click('up-save-all');assert.equal(element('up-conflict').hidden,false);assert.equal(element('up-save-all').disabled,false);
const conflictWrites=requests.filter(r=>r.action==='save').length;
await click('up-save-all');assert.equal(requests.filter(r=>r.action==='save').length,conflictWrites+1);
assert.equal(element('up-conflict').hidden,true);
directory=await service.read('get');
assert(!directory.accounts[1].assignments.find(g=>g.scopeId==='PRG-DEMO').roles.includes('TEACHER'));
assert(directory.accounts[0].assignments.find(g=>g.scopeId==='PRG-DEMO').roles.includes('STUDENT'));
console.log('Profiles UI: one Save all resolves a shared policy revision for multiple role drafts.');

// Global Admin always carries Program Admin in every scope. Additional roles
// stay editable without copying the automatic grant into a scoped save.
{
  const elements=new Map(),requests=[],storage=new Map();
  const data={prepared:true,teacherDesignationEditable:true,reviewCount:0,policyEditable:false,roles:['STUDENT','TEACHER','PROGRAM_ADMIN'],
    scopes:[{type:'PROGRAM',id:'P',name:'Program',prepared:true,rolesEditable:true,policyEditable:false,active:true,revision:'scope-p'},
      {type:'SUBJECT',id:'C',name:'Course',prepared:true,rolesEditable:true,policyEditable:false,active:true,revision:'scope-c'}],
    accounts:[{accountId:'GLOBAL',displayName:'Synthetic Global Admin',active:true,academyAdmin:true,academyTeacher:false,revision:'profile',
      assignments:['PROGRAM','SUBJECT'].map((scopeType,i)=>({accountId:'GLOBAL',scopeType,scopeId:i?'C':'P',roles:[],inheritedRoles:['PROGRAM_ADMIN'],displayRoles:['PROGRAM_ADMIN'],revision:'grant-'+i}))}]};
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',classList:{toggle(){}},focus(){},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);};
  vm.runInNewContext(source,{...context,document:{getElementById:element},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{
    const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
    if(action==='save'&&body.mode==='profile'){data.accounts[0].academyTeacher=body.academyTeacher;return {ok:true,status:200,json:async()=>({success:true,profile:data.accounts[0]})};}
    if(action==='save'){const g=data.accounts[0].assignments.find(g=>g.scopeType===body.scopeType);g.roles=[...body.roles];return {ok:true,status:200,json:async()=>({success:true,assignment:g})};}
    return {ok:true,status:200,json:async()=>({success:true,...data})};
  }});await settled();
  assert.equal((element('up-users').innerHTML.match(/>Program Admin ▾/g)||[]).length,2);
  for(const scope of ['PROGRAM:P','SUBJECT:C']) {
    element('up-users').onclick({target:{closest:()=>({dataset:{editScope:scope,account:'GLOBAL'}})}});await settled();
    assert.match(element('up-users').innerHTML,/data-role="PROGRAM_ADMIN" checked[^>]*disabled/);
    assert(!element('up-users').innerHTML.includes('data-default-user'));
    const [scopeType]=scope.split(':');
    element('up-users').onchange({target:{dataset:{role:'TEACHER',account:'GLOBAL',scope},checked:true}});
    element('up-save-all').onclick();await settled();
    assert.equal(requests.filter(r=>r.action==='save').at(-1).body.scopeType,scopeType);
    assert.deepEqual(requests.filter(r=>r.action==='save').at(-1).body.roles,['TEACHER']);
    assert.match(element('up-users').innerHTML,/>Program Admin · Teacher ▾/);
  }
  assert.doesNotMatch(element('up-users').innerHTML,/data-global-teacher/);
  element('up-global-status').onclick();
  element('up-global-results').onclick({target:{closest:()=>({dataset:{globalUser:'GLOBAL'}})}});
  assert.equal(element('up-global-name').textContent,'Synthetic Global Admin');
  const assignments=JSON.stringify(data.accounts[0].assignments);
  element('up-global-teacher').onchange({target:{checked:true}});
  element('up-save-all').onclick();await settled();
  const designation=requests.filter(r=>r.action==='save').at(-1).body;assert.equal(designation.mode,'profile');assert.equal(designation.academyTeacher,true);assert.equal(designation.academyAdmin,undefined);assert.equal(data.accounts[0].academyAdmin,true);assert.equal(JSON.stringify(data.accounts[0].assignments),assignments);
  assert.equal(element('up-global-teacher').checked,true);
}
console.log('Profiles UI: automatic Program Admin for Global Admins survives additional Program and Course role edits.');
