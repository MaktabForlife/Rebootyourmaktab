import assert from 'node:assert/strict';
import { normalizeZoomLink,lessonZoom } from '../src/programs/zoom-links.js';
import { readWeeklyDraft,validateWeeklyTimetable,publicationRecord } from '../src/programs/weekly-timetable.js';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
const classLink='https://example.zoom.us/j/111?pwd=class',lessonLink='https://example.zoom.us/j/222?pwd=lesson';
assert.equal(normalizeZoomLink('  '+classLink+'  '),classLink);assert.equal(normalizeZoomLink(''),'');
for(const bad of ['javascript:alert(1)','data:text/html,Hi','http://zoom.us/j/123','https://user:password@zoom.us/j/1','https://zoom.us/\nj/1',{},'https://zoom.us/'+ 'x'.repeat(2048)])assert.throws(()=>normalizeZoomLink(bad));
const classes=new Map([['C1',{zoomLink:classLink}],['C2',{zoomLink:'https://zoom.us/j/333'}]]);
assert.deepEqual(lessonZoom({zoomLink:'',classIds:['C1']},classes),{zoomLink:classLink,zoomSource:'CLASS'});
assert.deepEqual(lessonZoom({zoomLink:lessonLink,classIds:['C1','C2']},classes),{zoomLink:lessonLink,zoomSource:'LESSON'});
assert.throws(()=>lessonZoom({zoomLink:'',classIds:['C1','C2']},classes),/shared lesson/);
const f=timetableFixture(),service=timetableService(f.repository,f.program,()=>new Date('2026-09-29T09:00:00Z'));
const coordinator=timetableCoordinator(f.journal,async()=>({service,user:{accountid:'ADMIN'}}));
async function saveClass(id,url){const view=await service.read('manage-get'),record={...view.rows.classes.find(c=>c.ClassID===id),...(url===undefined?{}:{ZoomLink:url})};return coordinator.run('manage-save',{id:f.program.id,operationId:crypto.randomUUID(),kind:'classes',record,baseRowRevision:view.rowRevisions.classes[id],creating:false},'token');}
const change=(revision,draft)=>({id:f.program.id,operationId:crypto.randomUUID(),revision,draft});
await saveClass('CLASS-1',classLink);
let view=await service.read('get');assert.equal(view.catalog.classes[0].zoomLink,classLink);
let draft=readWeeklyDraft(f.draft).draft;draft.rules[0].classIds=['CLASS-1'];draft.rules[0].zoomLink='';
let preview=await service.read('preview',{draft});assert(preview.valid);assert.equal(preview.occurrences[0].zoomLink,classLink);assert.equal(preview.occurrences[0].zoomSource,'CLASS');
const pub=await coordinator.run('publish',change(view.revision,draft),'token');
const original=f.tables.ProgramTimetablePublications[0].SnapshotJSON;
await saveClass('CLASS-1','https://zoom.us/j/444');
assert.equal((await service.read('published')).publication.occurrences[0].zoomLink,classLink);
assert.equal(f.tables.ProgramTimetablePublications[0].SnapshotJSON,original);
assert.equal((await service.read('preview',{draft})).occurrences[0].zoomLink,'https://zoom.us/j/444');
// Old class editors omitting the new field preserve it; clearing is explicit.
let mg=await service.read('manage-get'),record={...mg.rows.classes[0]};delete record.ZoomLink;
await coordinator.run('manage-save',{id:f.program.id,operationId:crypto.randomUUID(),kind:'classes',record,baseRowRevision:mg.rowRevisions.classes[record.ClassID],creating:false},'token');
assert.equal((await service.read('get')).catalog.classes[0].zoomLink,'https://zoom.us/j/444');
await assert.rejects(saveClass('CLASS-1','javascript:alert(1)'),/https/);
await saveClass('CLASS-1','');assert.equal((await service.read('get')).catalog.classes[0].zoomLink,'');
// Lesson save/retry and cached-client omission retain the override.
draft.rules[0].zoomLink=lessonLink;draft.rules[0].classIds=['CLASS-1','CLASS-2'];
const request=change(pub.revision,draft);f.failNext('after');await assert.rejects(coordinator.run('save',request,'token'));
const replay=await coordinator.run('save',request,'token');assert(replay.replayed);
assert.equal((await service.read('get')).draft.rules[0].zoomLink,lessonLink);
let cached=structuredClone(draft);delete cached.rules[0].zoomLink;
await assert.rejects(coordinator.run('save',change(replay.revision,{format:draft.format,rules:{}}),'token'),error=>Boolean(error.publicMessage));
let oldSave=await coordinator.run('save',change(replay.revision,cached),'token');
assert.equal((await service.read('get')).draft.rules[0].zoomLink,lessonLink);
const datedCached=structuredClone(f.draft);delete datedCached.rules[0].zoomLink;
oldSave=await coordinator.run('save',change(oldSave.revision,datedCached),'token');
assert.equal((await service.read('get')).draft.rules[0].zoomLink,lessonLink);
preview=await service.read('preview',{draft});assert.equal(preview.occurrences[0].zoomLink,lessonLink);
const missing=structuredClone(draft);missing.rules[0].zoomLink='';
assert(!(await service.read('preview',{draft:missing})).valid);await assert.rejects(coordinator.run('publish',change(oldSave.revision,missing),'token'),/Publication blocked/);
const second=await coordinator.run('publish',change(oldSave.revision,draft),'token');
assert.equal((await service.read('published')).publication.occurrences[0].zoomSource,'LESSON');
draft.rules[0].zoomLink='javascript:bad';preview=await service.read('preview',{draft});assert(!preview.valid);assert(preview.issues.some(i=>i.field==='zoomLink'));
// Old snapshots never acquire links from today's class defaults.
const oldSnapshot=JSON.parse(original);for(const row of oldSnapshot.rules){delete row.zoomLink;delete row.effectiveZoomLink;delete row.zoomSource;}
const oldRecord={...f.tables.ProgramTimetablePublications[0],SnapshotJSON:JSON.stringify(oldSnapshot)};
assert.equal(publicationRecord(oldRecord,f.program).occurrences[0].zoomLink,'');
console.log('Program Zoom: safe URLs, class fallback, lesson priority, snapshot isolation, explicit clearing and retry preservation passed.');
