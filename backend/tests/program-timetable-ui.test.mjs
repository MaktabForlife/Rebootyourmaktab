import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {timetableFixture} from '../../scripts/program-timetable-fixtures.mjs';
import {readWeeklyDraft} from '../src/programs/weekly-timetable.js';
import {timetableService} from '../src/programs/timetable-service.js';
import {timetableCoordinator} from '../src/programs/timetable-coordination.js';
const source=await readFile(new URL('../../js/m4l-program-timetable.js',import.meta.url),'utf8'),markup=await readFile(new URL('../../programs/timetable.html',import.meta.url),'utf8');
assert.match(markup,/<th>Subject \/ Module<\/th><th>Classes<\/th><th>Teacher<\/th><th>Weekdays<\/th><th>Start<\/th><th>End<\/th>/);
assert(!/Classes learning together|<th>Pattern|First date|Last date|Publication window|tt-exceptions/.test(markup));
assert.equal([...markup.matchAll(/type="date"/g)].length,1);
const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),elements=new Map(),storage=new Map(),requests=[];
const f=timetableFixture(),service=timetableService(f.repository,f.program,()=>new Date('2026-09-29T09:00:00Z')),coordinator=timetableCoordinator(f.journal,async()=>({service,user:{accountid:'ADMIN'}}));
f.catalog.classes[0].zoomLink='https://zoom.us/j/111';
const draft=readWeeklyDraft(f.draft).draft;draft.rules[0].teacherId='';
await coordinator.run('save',{id:f.program.id,draft,revision:'',operationId:crypto.randomUUID()},'token');
function element(id){assert(ids.has(id),`Missing ${id}`);if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',events:{},classList:{toggle(){}},addEventListener(event,fn){this.events[event]=fn;}});return elements.get(id);}
const context={console,URL,Image:class{constructor(){this.complete=false;}},URLSearchParams,structuredClone,crypto,location:{search:`?program=${f.program.id}`},document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{M4L_CONFIG:{API_BASE:''},M4L_TIMEZONES:{options:z=>`<option>${z}</option>`,defaultZone:'Asia/Riyadh'},addEventListener(){}},fetch:async(url,options)=>{
 const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
 try{const result=['save','publish','recover','prepare'].includes(action)?await coordinator.run(action,body,'token'):await service.read(action,body);return {ok:true,status:200,json:async()=>({success:true,coordinatorAvailable:true,...result})};}
 catch(error){return {ok:false,status:error.status||503,json:async()=>({success:false,error:error.message})};}
}};
const settled=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setTimeout(r,2));};
const click=async id=>{await element(id).onclick();await settled();};
function edit(field,value){const target={dataset:{field},value,closest:()=>({dataset:{row:'RULE-DEMO'}})};element('tt-editor').events.input({target});element('tt-editor').events.focusout({target});return target.value;}
context.window.M4L_TIMETABLE_PRESENTATION ||= {model:()=>({}),html:()=>'<span>Lesson Zoom</span>',canvases:()=>[]};
vm.runInNewContext(source,context);await settled();
assert.match(element('tt-rules').innerHTML,/<summary>Year 1 · Demo, Year 2 · Demo<\/summary>/);
assert.match(element('tt-rules').innerHTML,/data-field="zoomLink"/);
assert.match(element('tt-rules').innerHTML,/Not assigned \(optional\)/);
assert(!/data-field="kind"|data-field="startDate"|data-field="endDate"/.test(element('tt-rules').innerHTML));
for(const [input,expected] of [['845','08h45'],['0845','08h45'],['8h45','08h45'],['8:45','08h45'],['1015','10h15'],['000','00h00']])assert.equal(edit('startTime',input),expected);
edit('zoomLink','');await click('tt-preview');assert.match(element('tt-validation').innerHTML,/shared lesson Zoom link/);assert.equal(element('tt-publish').disabled,true);
edit('zoomLink','https://zoom.us/j/222?pwd=test');
edit('startTime','845');assert.equal(edit('endTime','1015'),'10h15');
// Unfinished rows survive navigation, without changing the stored server revision.
context.window.M4L_TIMETABLE_PRESENTATION ||= {model:()=>({}),html:()=>'<span>Lesson Zoom</span>',canvases:()=>[]};
vm.runInNewContext(source,context);await settled();assert.match(element('tt-rules').innerHTML,/value="08h45"/);assert.match(element('tt-rules').innerHTML,/value="10h15"/);
await click('tt-preview');assert.equal(element('tt-publish-options').hidden,false);assert.equal(element('tt-effective-from').value,'2026-09-29');
assert.match(element('tt-validation').innerHTML,/Weekly timetable checked/);assert(!/authorised active teacher/.test(element('tt-validation').innerHTML));
assert.match(element('tt-occurrences').innerHTML,/Not assigned/);
assert.match(element('tt-occurrences').innerHTML,/href="https:\/\/zoom.us\/j\/222\?pwd=test"/);assert.match(element('tt-calendar').innerHTML,/Lesson Zoom/);
await click('tt-publish');assert.equal(element('tt-live-state').textContent,'In effect · Version 1');
let request=requests.filter(r=>r.action==='publish').at(-1).body;
assert.equal(request.effectiveFrom,'2026-09-29');assert.equal(request.draft.rules[0].startTime,'08:45');assert.equal(request.draft.rules[0].teacherId,'');assert(!('effectiveFrom' in request.draft));
edit('startTime','900');await click('tt-preview');element('tt-effective-from').oninput({target:{value:'2026-10-05'}});assert.equal(element('tt-publish').disabled,true);await click('tt-preview');
f.failNext('after');await click('tt-publish');assert.equal(element('tt-pending').hidden,false);const retry=requests.filter(r=>r.action==='publish').at(-1).body;
context.window.M4L_TIMETABLE_PRESENTATION ||= {model:()=>({}),html:()=>'<span>Lesson Zoom</span>',canvases:()=>[]};
vm.runInNewContext(source,context);await settled();await click('tt-retry');
assert.deepEqual(requests.filter(r=>r.action==='publish').at(-1).body,retry);
assert.equal(element('tt-pending').hidden,true);assert.match(element('tt-live-state').textContent,/In effect · Version 1 · Version 2 from 2026-10-05/);
assert.equal(f.tables.ProgramTimetablePublications.filter(p=>p.OperationID===retry.operationId).length,1);
await click('tt-history');assert.match(element('tt-history-list').innerHTML,/Scheduled/);
element('tt-history-list').onclick({target:{dataset:{history:f.tables.ProgramTimetablePublications[0].PublicationID}}});assert.equal(element('tt-publish-options').hidden,true);
edit('startTime','0860');await click('tt-preview');assert.match(element('tt-validation').innerHTML,/same-day time range/);assert.equal(element('tt-publish').disabled,true);
console.log('Timetable UI: column layout, shorthand time entry, optional teachers, retained drafts, effective-date publication and exact retry passed.');

// Removing the lesson override on a single-class lesson restores its class link.
edit('startTime','845');
const summary={textContent:''},hint={innerHTML:''},row={dataset:{row:'RULE-DEMO'},querySelector:()=>hint};
element('tt-editor').events.input({target:{dataset:{class:'CLASS-2'},checked:false,closest:selector=>selector==='details'?{querySelector:()=>summary}:row}});
edit('zoomLink','');await click('tt-preview');
assert.match(element('tt-occurrences').innerHTML,/href="https:\/\/zoom.us\/j\/111"/);assert.match(element('tt-occurrences').innerHTML,/>https:\/\/zoom.us\/j\/111<\/a>/);
assert.equal(element('tt-publish').disabled,false);
// Malformed links never become executable anchors in draft hints or previews.
edit('zoomLink','javascript:alert(1)');await click('tt-preview');assert.equal(element('tt-publish').disabled,true);assert(!element('tt-occurrences').innerHTML.includes('href="javascript:'));
console.log('Zoom UI: lesson editing, combined-class requirement, single-class fallback and safe meeting links passed.');

// Copying a publication preserves original snapshots and protects an unfinished draft.
const firstPublication=structuredClone(f.tables.ProgramTimetablePublications[0]);
edit('zoomLink','https://zoom.us/j/333');
await click('tt-history');
assert.match(element('tt-history-list').innerHTML,/Edit as new version/);
element('tt-history-list').onclick({target:{dataset:{reuse:firstPublication.PublicationID}}});await settled();
assert.equal(element('tt-reuse-warning').hidden,false);
await click('tt-reuse-keep');assert.equal(element('tt-reuse-warning').hidden,true);
await click('tt-save');
element('tt-history-list').onclick({target:{dataset:{reuse:firstPublication.PublicationID}}});await settled();
assert.match(element('tt-rules').innerHTML,/https:\/\/zoom.us\/j\/222\?pwd=test/);
await click('tt-preview');await click('tt-publish');
assert.equal(f.tables.ProgramTimetablePublications.length,3);assert.deepEqual(f.tables.ProgramTimetablePublications[0],firstPublication);
console.log('Timetable reuse: protected unfinished draft, preserved Zoom snapshot and new immutable publication passed.');

// A break and visual settings survive saves, reloads and publication reuse.
context.window.M4L_TIMETABLE_PRESENTATION.model=()=>({columns:[{id:1,label:'Monday'}],rows:[{key:'10:15|10:30',label:'10h15 - 10h30'}]});
await click('tt-add-break');
let local=JSON.parse(storage.get(`m4l-timetable-draft:${f.program.id}`)),breakId=local.draft.breaks[0].id;
function editBreak(field,value){element('tt-editor').events.input({target:{dataset:{field},value,closest:()=>({dataset:{row:breakId}})}});}
editBreak('label','Morning break');editBreak('startTime','1015');editBreak('endTime','1030');
element('tt-editor').events.input({target:{dataset:{day:'1'},checked:true,closest:()=>({dataset:{row:breakId}})}});
await click('tt-preview');assert.equal(element('tt-publish').disabled,false);assert.match(element('tt-calendar').innerHTML,/Lesson Zoom/);
await click('tt-adjust');
element('tt-layout').events.input({target:{id:'tt-alignment',value:'left',dataset:{}}});
element('tt-layout').events.input({target:{id:'',value:'220',dataset:{width:'time'}}});
element('tt-layout').events.input({target:{id:'',value:'120',dataset:{height:'10:15|10:30'}}});
assert.equal(element('tt-save').disabled,false);
await click('tt-publish');const newest=f.tables.ProgramTimetablePublications.at(-1),snap=JSON.parse(newest.SnapshotJSON);
assert.equal(snap.breaks[0].label,'Morning break');assert.equal(snap.layout.columnWidths.time,220);assert.equal(snap.layout.alignment,'left');
await click('tt-history');element('tt-history-list').onclick({target:{dataset:{history:newest.PublicationID}}});assert.equal(element('tt-adjust').hidden,true);
element('tt-history-list').onclick({target:{dataset:{reuse:newest.PublicationID}}});await settled();
local=JSON.parse(storage.get(`m4l-timetable-draft:${f.program.id}`));assert.equal(local.draft.breaks[0].label,'Morning break');assert.equal(local.draft.layout.rowHeights['10:15|10:30'],120);
console.log('Timetable UI: breaks and layout inputs persist in immutable publications and copied drafts.');
