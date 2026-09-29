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
function element(id){assert(ids.has(id),`Missing element ${id}`);if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',classList:{toggle(){}},focus(){}});return elements.get(id);}
const context={console,URLSearchParams,structuredClone,crypto,location:{search:'?program=PRG-DEMO&account=PERSON',host:'test.invalid',origin:'https://test.invalid'},document:{getElementById:element},localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{M4L_CONFIG:{API_BASE:''},addEventListener(){}},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},fetch:async(url,options)=>{
 const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
 if(action==='get'&&readFailure){const failure=readFailure;readFailure=null;return {ok:false,status:503,json:async()=>({success:false,error:'Temporary spreadsheet limit',...failure})};}
 try{
  const result=['save','recover'].includes(action)?await coordinator.run(action,body,'token'):await service.read(action,body);
  if(action==='save'&&afterSaveReadFailure){afterSaveReadFailure=false;readFailure={code:'SHEETS_RATE_LIMITED',retryable:true,retryAfterMs:60000};}
  return {ok:true,status:200,json:async()=>({success:true,...result})};
 }catch(error){return {ok:false,status:error.status||503,json:async()=>({success:false,error:error.message,code:error.code,currentRecord:error.currentRecord,rowRevision:error.rowRevision})};}
}};
const settled=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,2));};
const click=async id=>{element(id).onclick();await settled();};
const rowClick=async attrs=>{element('up-users').onclick({target:{closest:()=>({dataset:attrs})}});await settled();};
const scopeClick=async attrs=>{if(attrs['data-save-roles'])return click('up-save');await rowClick({editScope:attrs.editScope,account:'PERSON'});};
const choose=(dataset,checked=true)=>element('up-users').onchange({target:{dataset,checked}});
const name=value=>element('up-users').oninput({target:{dataset:{name:''},value}});
const submit=async()=>click('up-save');
const editProfile=async()=>rowClick({profile:'PERSON'});
const runTimer=async()=>{assert(timers.length);timers.shift().fn();await settled();};
vm.runInNewContext(source,context);await settled();
assert.match(element('up-users').innerHTML,/Active/);assert.match(element('up-users').innerHTML,/User/);assert.match(element('up-head').innerHTML,/Free|Paid/);
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
await scopeClick({'data-save-roles':true});
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
await submit();assert.equal(element('up-conflict').hidden,false);assert.match(element('up-comparison').innerHTML,/My proposed name/);assert.match(element('up-comparison').innerHTML,/Other administrator name/);
await click('up-keep-mine');assert.equal(f.tables.UserAccounts[1].DisplayName,'My proposed name');
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
