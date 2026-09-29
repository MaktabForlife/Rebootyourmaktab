import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
const source=await readFile(new URL('../../js/m4l-program-management.js',import.meta.url),'utf8');
const f=timetableFixture(),service=timetableService(f.repository,f.program);
const coordinator=timetableCoordinator(f.journal,async()=>({service,user:{accountid:'ADMIN'}}));
const elements=new Map(),storage=new Map(),requests=[];
let failing=0,failReadAfterSave=false,serviceFailure=null;const delays=[];
function element(id){if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',listeners:{},classList:{toggle(){}},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(type,fn){this.listeners[type]=fn;}});return elements.get(id);}
const context={console,URLSearchParams,structuredClone,crypto,setTimeout:(fn,ms)=>{if(ms>=1000){delays.push(ms);return setTimeout(fn,0);}return setTimeout(fn,ms);},location:{search:'?program='+f.program.id},localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:element,addEventListener(){}},window:{M4L_CONFIG:{API_BASE:''},M4L_PROGRAM_OVERVIEW:{build:()=>[]},addEventListener(){}},fetch:async(url,options)=>{
  const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
  try{
    if(action==='manage-save'&&serviceFailure){const error=serviceFailure;serviceFailure=null;return {ok:false,status:503,json:async()=>({success:false,error:'Simulated service failure',...error})};}
    if(action==='manage-save'&&failing){failing--;throw new Error('Offline');}
    if(action==='manage-get'&&failReadAfterSave==='ready'){failReadAfterSave=false;throw new Error('Refresh unavailable');}
    const result=['manage-save','recover'].includes(action)?await coordinator.run(action,body,'token'):await service.read(action,body);
    if(action==='manage-save'&&failReadAfterSave===true)failReadAfterSave='ready';
    return {ok:true,status:200,json:async()=>({success:true,coordinatorAvailable:true,...result})};
  }catch(error){if(!error.publicMessage)throw error;return {ok:false,status:error.status,json:async()=>({success:false,error:error.message,code:error.code,currentRecord:error.currentRecord,rowRevision:error.rowRevision})};}
}};
vm.runInNewContext(await readFile(new URL('../../js/m4l-program-overview.js',import.meta.url),'utf8'),context);
vm.runInNewContext(source,context);
async function settled(){for(let i=0;i<15;i++)await new Promise(resolve=>setTimeout(resolve,2));}
function button(attrs){return {dataset:attrs,hasAttribute:name=>Object.hasOwn(attrs,name)};}
async function clickRow(attrs){element('pm-rows').onclick({target:{closest:()=>button(attrs)}});await settled();}
function input(key,value){element('pm-rows').listeners.input({target:{dataset:{field:key},value}});}
async function external(record){const view=await service.read('manage-get');await coordinator.run('manage-save',{id:f.program.id,kind:'classes',record,creating:false,revision:view.revision,baseRowRevision:view.rowRevisions.classes[record.ClassID],operationId:crypto.randomUUID()},'token');}
await settled();
assert.match(element('pm-overview').innerHTML,/data-rollup="subject:PS-TAFSEER"/);
assert.match(element('pm-overview').innerHTML,/data-rollup="module:MOD-DEMO"/);
assert(!/<details[^>]*\sopen[ >]/.test(element('pm-overview').innerHTML),'Every overview group starts collapsed');
assert.deepEqual(requests.map(r=>r.action),['manage-get'],'Overview loads in a single request');
element('pm-overview').listeners.toggle({target:{dataset:{rollup:'subject:PS-TAFSEER'},open:true}});
element('pm-search').oninput({target:{value:'Demo'}});
assert.match(element('pm-overview').innerHTML,/data-rollup="subject:PS-TAFSEER" open/);
assert(!/data-rollup="module:MOD-DEMO" open/.test(element('pm-overview').innerHTML),'Opening a subject does not expand modules');
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'classes'}})}});
element('pm-add').onclick();input('Name','Preserved draft');
// Browse Learners without losing or saving the Classes draft.
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'enrollments'}})}});
assert.equal(element('pm-caption').textContent,'Learners');assert.equal(element('pm-draft-notice').hidden,false);
assert.match(element('pm-rows').innerHTML,/Demo learner/);assert(!element('pm-rows').innerHTML.includes('Preserved draft'));
assert.equal(element('pm-editor').disabled,true,'Other sections are readable while a draft is unfinished');
element('pm-return').onclick();assert.match(element('pm-rows').innerHTML,/Preserved draft/);
await element('pm-reload').onclick();assert.match(element('pm-rows').innerHTML,/Preserved draft/);
assert.match(element('pm-message').textContent,/unsaved entry is kept/);
failing=1;await clickRow({'data-save':true});
let rows=(await service.read('manage-get')).rows.classes;const saved=rows.find(r=>r.Name==='Preserved draft');assert(saved);
let writes=requests.filter(r=>r.action==='manage-save');assert.equal(writes.at(-1).body.operationId,writes.at(-2).body.operationId);
assert.equal(rows.filter(r=>r.Name==='Preserved draft').length,1);
// Independent fields are merged automatically, even after refreshing with a draft.
await clickRow({edit:saved.ClassID});input('Name','My new name');await external({...saved,AcademicYear:'2027'});
await element('pm-reload').onclick();await clickRow({'data-save':true});
let row=(await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID);
assert.equal(row.Name,'My new name');assert.equal(row.AcademicYear,'2027');
// Same-field changes require a clear explicit choice; refresh never grants overwrite permission.
await clickRow({edit:saved.ClassID});input('Name','My conflicting name');await external({...row,Name:'Other administrator'});
await clickRow({'data-save':true});assert.equal(element('pm-conflict').hidden,false);assert.equal(element('pm-use-mine').disabled,false);
assert.match(element('pm-conflict-details').innerHTML,/My conflicting name/);assert.match(element('pm-conflict-details').innerHTML,/Other administrator/);
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Other administrator');
await element('pm-use-mine').onclick();assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'My conflicting name');
// Persistent outage keeps the same pending operation, then a later retry completes it once.
await clickRow({edit:saved.ClassID});input('Name','Retry later');failing=2;await clickRow({'data-save':true});assert.equal(element('pm-pending').hidden,false);
const operation=requests.filter(r=>r.action==='manage-save').at(-1).body.operationId;
await element('pm-retry').onclick();assert.equal(requests.filter(r=>r.action==='manage-save').at(-1).body.operationId,operation);
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Retry later');
assert.equal(element('pm-pending').hidden,true);
// Unsaved typing is restored when the page itself reloads.
await clickRow({edit:saved.ClassID});input('Name','Browser reload draft');vm.runInNewContext(source,context);await settled();
assert.match(element('pm-rows').innerHTML,/Browser reload draft/);
console.log('Management UI: preserved refresh/reload, automatic retry, stable operation IDs, field merge and explicit conflict choice passed.');

// A save confirmed by the server stays confirmed even if its subsequent refresh fails.
failReadAfterSave=true;await clickRow({'data-save':true});
assert.match(element('pm-message').textContent,/row was saved/);assert.equal(element('pm-pending').hidden,true);
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Browser reload draft');
await element('pm-reload').onclick();
// An interrupted server-side write is completed automatically and replayed exactly once.
await clickRow({edit:saved.ClassID});input('Name','Recovered server write');f.failNext('after');await clickRow({'data-save':true});
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Recovered server write');
assert.equal(element('pm-pending').hidden,true);
console.log('Management UI: post-save refresh failure and lost server acknowledgement recovery passed.');

// Teachers see eligible accounts only; learner records remain accessible once the draft is saved.
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'teachers'}})}});element('pm-add').onclick();
assert.match(element('pm-rows').innerHTML,/Demo teacher A/);
assert(!element('pm-rows').innerHTML.includes('Demo learner'),'A learner-only account is not a teaching candidate');
await clickRow({'data-cancel':true});
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'enrollments'}})}});
assert.equal(element('pm-add').disabled,false);assert.equal(element('pm-editor').disabled,false);
console.log('Management UI: collapsed hierarchy, single-request overview, accessible Learners and role-filtered teachers passed.');

// A rate-limit response pauses before retrying the same operation; access failures stay pending.
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'classes'}})}});
await clickRow({edit:saved.ClassID});input('Name','Backoff saved');
serviceFailure={code:'SHEETS_RATE_LIMITED',retryable:true,retryAfterMs:60000};
await clickRow({'data-save':true});assert(delays.includes(60000));
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Backoff saved');
await clickRow({edit:saved.ClassID});input('Name','Access restored');
serviceFailure={code:'SHEETS_ACCESS_FAILED',retryable:false};const beforeAccess=requests.length;
await clickRow({'data-save':true});assert.equal(element('pm-pending').hidden,false);
assert.equal(requests.slice(beforeAccess).filter(r=>r.action==='recover').length,0,'Do not retry a configuration/access failure automatically');
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'enrollments'}})}});
assert.equal(element('pm-caption').textContent,'Learners');
await element('pm-retry').onclick();
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Access restored','Retry from another tab must still save the original kind');
assert.equal(element('pm-caption').textContent,'Classes');
console.log('Management UI: bounded rate-limit backoff and safe pending-save navigation passed.');
