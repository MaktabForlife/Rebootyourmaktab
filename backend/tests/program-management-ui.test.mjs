import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
const source=await readFile(new URL('../../js/m4l-program-management.js',import.meta.url),'utf8');
const f=timetableFixture(),service=timetableService(f.repository,f.program);
const coordinator=timetableCoordinator(f.journal,async()=>({service,user:{accountid:'ADMIN'}}));
const markup=await readFile(new URL('../../programs/manage.html',import.meta.url),'utf8');
const elementIds=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
const elements=new Map(),storage=new Map(),requests=[];
let renameConflict=false;let failing=0,failReadAfterSave=false,serviceFailure=null,holdDelays=false;const delays=[],scheduled=[],readFailures=[];
function element(id){assert(elementIds.has(id),`Missing HTML element ${id}`);if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',listeners:{},classList:{toggle(){}},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(type,fn){this.listeners[type]=fn;}});return elements.get(id);}
const context={console,URL,URLSearchParams,structuredClone,crypto,setTimeout:(fn,ms)=>{if(ms>=1000){delays.push(ms);if(holdDelays){scheduled.push({fn,ms});return scheduled.length;}return setTimeout(fn,0);}return setTimeout(fn,ms);},location:{search:'?program='+f.program.id},localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:element,addEventListener(){}},window:{M4L_CONFIG:{API_BASE:''},M4L_PROGRAM_OVERVIEW:{build:()=>[]},addEventListener(){}},fetch:async(url,options)=>{
  const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
  try{
    if(action==='manage-get'&&readFailures.length){const error=readFailures.shift();return {ok:false,status:503,json:async()=>({success:false,error:'Simulated read failure',...error})};}
    if(action==='manage-save'&&serviceFailure){const error=serviceFailure;serviceFailure=null;return {ok:false,status:503,json:async()=>({success:false,error:'Simulated service failure',...error})};}
    if(action==='manage-save'&&failing){failing--;throw new Error('Offline');}
    if(action==='manage-get'&&failReadAfterSave==='ready'){failReadAfterSave=false;throw new Error('Refresh unavailable');}
    if(url.includes('/academy-subjects/')&&action==='save'&&body.mode==='rename'){
      const row=f.shared.subjects.find(s=>s.SubjectID===body.subjectId);
      if(renameConflict){renameConflict=false;row.SubjectName='Other subject name';row.Revision='renamed-elsewhere';return {ok:false,status:409,json:async()=>({success:false,error:'The subject name changed elsewhere.',code:'ROW_CHANGED',currentRecord:row,rowRevision:row.Revision})};}
      assert.equal(body.baseRevision,row.Revision);row.SubjectName=body.subjectName;row.Revision='renamed';return {ok:true,status:200,json:async()=>({success:true,subject:row})};
    }
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
assert.match(element('pm-overview').innerHTML,/<td data-label="Module"><strong>Maariful Quran · Demo module<\/strong>/);
assert(!element('pm-overview').innerHTML.includes('data-rollup="module:'),'Module rows appear directly under their collapsed subject/level');
assert(!/<details[^>]*\sopen[ >]/.test(element('pm-overview').innerHTML),'Every overview group starts collapsed');
assert.deepEqual(requests.map(r=>r.action),['manage-get'],'Overview loads in a single request');
element('pm-overview').listeners.toggle({target:{dataset:{rollup:'subject:PS-TAFSEER'},open:true}});
element('pm-search').oninput({target:{value:'Demo'}});
assert.match(element('pm-overview').innerHTML,/data-rollup="subject:PS-TAFSEER" open/);
assert.match(element('pm-overview').innerHTML,/data-module-edit="MOD-DEMO"/);
element('pm-overview').onclick({target:{closest:()=>button({moduleEdit:'MOD-DEMO'})}});
assert.equal(element('pm-caption').textContent,'Modules');
assert.match(element('pm-rows').innerHTML,/value="Maariful Quran · Demo module"/);
await clickRow({'data-cancel':true});
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'classes'}})}});
element('pm-add').onclick();input('Name','Preserved draft');input('ZoomLink','https://zoom.us/j/555?pwd=class');
assert.match(element('pm-rows').innerHTML,/data-field="ZoomLink"/);assert.match(element('pm-head').innerHTML,/Zoom link/);
// Browse Learners without losing or saving the Classes draft.
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'profiles'}})}});
assert.equal(element('pm-caption').textContent,'User profiles');assert.equal(element('pm-draft-notice').hidden,false);
assert.match(element('pm-rows').innerHTML,/Demo learner/);assert(!element('pm-rows').innerHTML.includes('Preserved draft'));
assert.equal(element('pm-editor').disabled,true,'Other sections are readable while a draft is unfinished');
element('pm-return').onclick();assert.match(element('pm-rows').innerHTML,/Preserved draft/);
await element('pm-reload').onclick();assert.match(element('pm-rows').innerHTML,/Preserved draft/);
assert.match(element('pm-message').textContent,/unsaved entry is kept/);
failing=1;await clickRow({'data-save':true});
let rows=(await service.read('manage-get')).rows.classes;const saved=rows.find(r=>r.Name==='Preserved draft');assert(saved);assert.equal(saved.ZoomLink,'https://zoom.us/j/555?pwd=class');
let writes=requests.filter(r=>r.action==='manage-save');assert.equal(writes.at(-1).body.operationId,writes.at(-2).body.operationId);
assert.equal(rows.filter(r=>r.Name==='Preserved draft').length,1);
assert.match(element('pm-rows').innerHTML,/href="https:\/\/zoom.us\/j\/555\?pwd=class"/);
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
assert.match(element('pm-message').textContent,/Row saved/);assert.equal(element('pm-pending').hidden,true);
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Browser reload draft');
await element('pm-reload').onclick();
// An interrupted server-side write is completed automatically and replayed exactly once.
await clickRow({edit:saved.ClassID});input('Name','Recovered server write');f.failNext('after');await clickRow({'data-save':true});
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Recovered server write');
assert.equal(element('pm-pending').hidden,true);
console.log('Management UI: post-save refresh failure and lost server acknowledgement recovery passed.');

// The public tabs are fixed; memberships remain accessible through a user profile.
assert.deepEqual([...element('pm-tabs').innerHTML.matchAll(/data-tab="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map(m=>[m[1],m[2]]),[['overview','Overview'],['modules','Modules'],['subjects','Subjects'],['classes','Classes'],['profiles','User profiles']]);
assert(!element('pm-tabs').innerHTML.includes('<small>'));
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'profiles'}})}});
assert.match(element('pm-rows').innerHTML,/Teacher/);assert.match(element('pm-rows').innerHTML,/Student/);
assert.equal(element('pm-add').hidden,true);
await clickRow({userMemberships:'LEARNER-DEMO'});
assert.equal(element('pm-caption').textContent,'Class memberships');
assert.equal(element('pm-add').disabled,false);assert.equal(element('pm-editor').disabled,false);
assert.match(element('pm-rows').innerHTML,/Year 1/);
element('pm-add').onclick();input('StartDate','2027-01-01');
assert.match(element('pm-rows').innerHTML,/data-field="AccountID"[^>]*disabled/);
element('pm-profiles-back').onclick();assert.equal(element('pm-draft-notice').hidden,false);
element('pm-return').onclick();assert.match(element('pm-rows').innerHTML,/2027-01-01/);
await clickRow({'data-cancel':true});
console.log('Management UI: five tabs, account roles and profile-scoped class membership editor passed.');

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
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'profiles'}})}});
assert.equal(element('pm-caption').textContent,'User profiles');
await element('pm-retry').onclick();
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Access restored','Retry from another tab must still save the original kind');
assert.equal(element('pm-caption').textContent,'Classes');
console.log('Management UI: bounded rate-limit backoff and safe pending-save navigation passed.');

// Quota exhaustion after a confirmed write retries reads only, without freezing a new draft.
holdDelays=true;
const quota={code:'SHEETS_RATE_LIMITED',retryable:true,retryAfterMs:60000,reference:'test-refresh-reference'};
await clickRow({edit:saved.ClassID});input('Name','Saved during quota limit');
readFailures.push(quota);const beforeQuota=requests.length;
await clickRow({'data-save':true});
assert.equal(element('pm-pending').hidden,true);
assert.match(element('pm-rows').innerHTML,/Saved during quota limit/,'Display the acknowledged row before refresh succeeds');
assert.match(element('pm-refresh-status').textContent,/automatically in 60 seconds/);
assert.match(element('pm-refresh-status').textContent,/test-refresh-reference/);
assert.equal(scheduled.length,1);assert.equal(scheduled[0].ms,60000);
assert.equal(element('pm-editor').disabled,false,'Typing is available during cooldown');
assert.equal(element('pm-reload').disabled,true);
await clickRow({edit:saved.ClassID});input('Name','Next unsaved entry');
const duringWait=requests.length;
await element('pm-reload').onclick();await clickRow({'data-save':true});
assert.equal(requests.length,duringWait,'Manual clicks do not defeat the quota cooldown');
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'profiles'}})}});
assert.equal(element('pm-caption').textContent,'User profiles');
scheduled.shift().fn();await settled();
assert.equal(element('pm-refresh-status').hidden,true);
element('pm-return').onclick();assert.match(element('pm-rows').innerHTML,/Next unsaved entry/);
assert.equal(requests.slice(beforeQuota).filter(r=>r.action==='manage-save').length,1,'Never resend a confirmed write');
assert.equal(requests.slice(beforeQuota).filter(r=>r.action==='recover').length,0,'Read recovery must not replay writes');
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Saved during quota limit');
await clickRow({'data-save':true});
assert.equal(element('pm-conflict').hidden,true,'A new draft uses the acknowledged row revision');
assert.equal((await service.read('manage-get')).rows.classes.find(r=>r.ClassID===saved.ClassID).Name,'Next unsaved entry');

// Repeated quota failures stop after two delayed reads; explicit refresh starts a new attempt.
readFailures.push(quota,quota,quota);const beforePersistent=requests.length;
await element('pm-reload').onclick();scheduled.shift().fn();await settled();scheduled.shift().fn();await settled();
assert.equal(scheduled.length,0);assert.match(element('pm-refresh-status').textContent,/Automatic refresh has stopped/);
assert.equal(element('pm-reload').disabled,false);
assert.equal(requests.slice(beforePersistent).filter(r=>r.action==='manage-get').length,3);
await element('pm-reload').onclick();assert.equal(element('pm-refresh-status').hidden,true);

// Spreadsheet access/configuration failures do not produce a retry loop.
readFailures.push({code:'SHEETS_ACCESS_FAILED',retryable:false});
await element('pm-reload').onclick();assert.equal(scheduled.length,0);
assert.match(element('pm-refresh-status').textContent,/Simulated read failure/);
await element('pm-reload').onclick();
console.log('Management UI: acknowledged row retained, read-only automatic recovery, preserved concurrent draft, cooldown and bounded retries passed.');

// Standard levels save atomically with a module, including when the follow-up read is limited.
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'modules'}})}});
await clickRow({edit:'MOD-DEMO'});
for(const name of ['Beginner','Intermediate','Advanced'])assert.match(element('pm-rows').innerHTML,new RegExp(`value="standard:${name}"`));
assert.match(element('pm-rows').innerHTML,/>No level<\/option>/);
input('LevelID','standard:Beginner');readFailures.push(quota);
await clickRow({'data-save':true});
assert.match(element('pm-rows').innerHTML,/<td data-label="Level \(optional\)">Beginner<\/td>/,'The acknowledged level name is available before refresh');
assert(!element('pm-rows').innerHTML.includes('standard:Beginner'));
scheduled.shift().fn();await settled();
let management=await service.read('manage-get');
assert.equal(management.rows.levels.length,1);assert.equal(management.rows.levels[0].Name,'Beginner');
// Per-class progress is edited in the Modules row; module fields and other classes remain unchanged.
await clickRow({progressModule:'MOD-DEMO'});
assert.equal(element('pm-caption').textContent,'Modules');
assert.match(element('pm-head').innerHTML,/>Class progress<\/th>/);
assert.match(element('pm-rows').innerHTML,/Save status/);
assert(!element('pm-rows').innerHTML.includes('data-field="Name"'));
input('ClassID','CLASS-1');input('Status','COMPLETED');
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'subjects'}})}});
assert.equal(element('pm-draft-notice').hidden,false);
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'modules'}})}});
assert.match(element('pm-rows').innerHTML,/value="COMPLETED" selected/);
vm.runInNewContext(source,context);await settled();
assert.match(element('pm-rows').innerHTML,/value="COMPLETED" selected/,'Progress draft restored after browser reload');
await clickRow({'data-save':true});
await clickRow({progressModule:'MOD-DEMO'});
assert(!element('pm-rows').innerHTML.includes('<option value="CLASS-1"'),'Add status excludes classes already recorded');
input('ClassID','CLASS-2');input('Status','ACTIVE');await clickRow({'data-save':true});
management=await service.read('manage-get');
assert.equal(management.rows.progress.find(p=>p.ClassID==='CLASS-1').Status,'COMPLETED');
assert.equal(management.rows.progress.find(p=>p.ClassID==='CLASS-2').Status,'ACTIVE');
assert.equal(management.rows.modules[0].Active,true);
await clickRow({progressModule:'MOD-DEMO',progressClass:'CLASS-1'});
assert.match(element('pm-rows').innerHTML,/data-field="ClassID"[^>]*disabled/);
input('Status','INACTIVE');await clickRow({'data-save':true});
management=await service.read('manage-get');
assert.equal(management.rows.progress.find(p=>p.ClassID==='CLASS-2').Status,'ACTIVE');
// The Modules add action creates a module even after editing class progress.
element('pm-add').onclick();assert.match(element('pm-rows').innerHTML,/data-field="Name"/);await clickRow({'data-cancel':true});
console.log('Management UI: standard level acknowledgement, inline per-class status, protected identities, draft navigation and reload passed.');

// Drafts from the removed sections can still be completed or cancelled after the upgrade.
for(const [kind,record,destination] of [
  ['levels',{LevelID:'LVL-OLD-DRAFT',ProgramSubjectID:'PS-TAFSEER',Name:'Unfinished old level',SortOrder:0,Active:true},'Modules'],
  ['teachers',{AccountID:'TEACHER-1',Active:true},'User profiles']
]){
  storage.set(`m4l-management-pending:${f.program.id}:draft`,JSON.stringify({kind,edit:{record,creating:true,originalId:record.LevelID||record.AccountID}}));
  vm.runInNewContext(source,context);await settled();
  assert.match(element('pm-section-note').textContent,/earlier unfinished entry is kept/);
  assert.equal(element('pm-add').hidden,true);
  assert(!element('pm-tabs').innerHTML.includes(`data-tab="${kind}"`));
  await clickRow({'data-cancel':true});assert.equal(element('pm-caption').textContent,destination);
}
console.log('Management UI: upgrade retains drafts from removed sections without restoring their tabs.');

// A draft standard selection keeps its label when another module creates that level meanwhile.
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'modules'}})}});
await clickRow({edit:'MOD-DEMO'});input('LevelID','standard:Intermediate');
management=await service.read('manage-get');
await coordinator.run('manage-save',{id:f.program.id,operationId:crypto.randomUUID(),kind:'modules',creating:true,baseRowRevision:management.emptyRowRevision,record:{ProgramModuleID:'MOD-OTHER',ProgramSubjectID:'PS-TAFSEER',LevelID:'standard:Intermediate',Name:'Other administrator module',Active:true}},'token');
await element('pm-reload').onclick();
assert.match(element('pm-rows').innerHTML,/value="standard:Intermediate" selected>Intermediate<\/option>/);
assert(!element('pm-rows').innerHTML.includes('Unavailable: standard:'));
await clickRow({'data-save':true});
management=await service.read('manage-get');
assert.equal(management.rows.modules.find(r=>r.ProgramModuleID==='MOD-DEMO').LevelID,management.rows.modules.find(r=>r.ProgramModuleID==='MOD-OTHER').LevelID);
assert.equal(management.rows.levels.filter(r=>r.Name==='Intermediate').length,1);
console.log('Management UI: refreshed standard-level draft keeps its label and reuses the newly created level.');

// Existing shared subjects expose a name editor with independent conflict protection.
f.shared.subjects[0].Revision='subject-before';await element('pm-reload').onclick();await settled();
element('pm-tabs').onclick({target:{closest:()=>({dataset:{tab:'subjects'}})}});
await clickRow({edit:'PS-TAFSEER'});assert.match(element('pm-rows').innerHTML,/data-field="SubjectName"/);
input('SubjectName','Renamed subject');renameConflict=true;await clickRow({'data-save':''});
assert.equal(element('pm-conflict').hidden,false);assert.match(element('pm-conflict-details').innerHTML,/Other subject name/);assert.match(element('pm-conflict-details').innerHTML,/Renamed subject/);
await element('pm-use-mine').onclick();await settled();assert.equal(f.shared.subjects[0].SubjectName,'Renamed subject');
const renameRequest=requests.findLast(r=>r.body.mode==='rename');assert.equal(renameRequest.body.subjectId,'TAFSEER');assert.equal(renameRequest.body.baseRevision,'renamed-elsewhere');
console.log('Management subject rename: editable name, stable ID and explicit conflict review passed.');
