import assert from 'node:assert/strict';
import { validateTimetable,normalizeDraft,publishedOccurrences,payloadHash } from '../src/programs/timetable-model.js';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
const clone=structuredClone;
const f=timetableFixture(), check=d=>validateTimetable(d,f.catalog,f.program);
let result=check(f.draft);
assert.equal(result.valid,true);assert.equal(result.occurrences.length,4);assert.deepEqual(result.occurrences[0].classIds,['CLASS-1','CLASS-2']);assert.equal(result.occurrences[0].levelName,'');
assert.equal(result.occurrences[0].startInstant,Date.parse('2026-09-21T10:00:00Z'));
let d=clone(f.draft);d.exceptions=[{id:'EX-CANCEL',ruleId:'RULE-DEMO',originalDate:'2026-09-21',action:'CANCEL'},{id:'EX-MOVE',ruleId:'RULE-DEMO',originalDate:'2026-09-23',action:'MOVE',date:'2026-09-24',startTime:'15:00',endTime:'16:00'}];
result=check(d);assert(result.valid);assert.equal(result.occurrences[0].status,'CANCELLED');assert.equal(result.occurrences[1].anchor,'RULE-DEMO@2026-09-23');assert.equal(result.occurrences[1].date,'2026-09-24');
const snap=clone(result.snapshot);f.catalog.modules[0].name='Renamed';f.catalog.teachers[0].active=false;
assert.equal(publishedOccurrences(snap)[1].moduleName,'Maariful Quran · Demo module');assert.equal(publishedOccurrences(snap)[1].teacherName,'Demo teacher A');f.catalog.modules[0].name='Maariful Quran · Demo module';f.catalog.teachers[0].active=true;
d=clone(f.draft);d.rules.push({...clone(d.rules[0]),id:'RULE-OVERLAP'});result=check(d);assert.equal(result.valid,false);assert.deepEqual(result.conflicts[0].reasons,['Teacher overlap','Class overlap','Known learner membership overlap']);
d.rules[0].classIds=['CLASS-1'];d.rules[1].classIds=['CLASS-2'];d.rules[1].teacherId='TEACHER-2';result=check(d);assert.deepEqual(result.conflicts[0].reasons,['Known learner membership overlap']);
f.catalog.enrollments[1].endDate='2026-09-20';assert(check(d).valid);f.catalog.enrollments[1].endDate='';
d.rules[1].startTime='14:00';d.rules[1].endTime='15:00';assert(check(d).valid);
d=clone(f.draft);d.rules[0].kind='EXPLICIT';d.rules[0].endDate=d.rules[0].startDate;assert.equal(check(d).occurrences.length,1);
d=clone(f.draft);d.rules[0].moduleId='unknown';assert.equal(check(d).valid,false);
f.catalog.modules[0].levelId='LEVEL-1';f.catalog.levels.push({id:'LEVEL-1',programSubjectId:'WRONG',name:'Level 1',active:true});assert.equal(check(f.draft).valid,false);f.catalog.levels[0].programSubjectId='PS-TAFSEER';assert(check(f.draft).valid);f.catalog.modules[0].levelId='';f.catalog.levels=[];
d=clone(f.draft);d.rules[0].classIds=[];assert.equal(check(d).valid,false);assert.doesNotThrow(()=>normalizeDraft(d));
d=clone(f.draft);d.timezone='Mars/Unknown';assert.equal(check(d).valid,false);
d=clone(f.draft);d.endDate='2028-01-01';assert.equal(check(d).valid,false);
d=clone(f.draft);d.startDate='2026-02-30';assert.equal(check(d).valid,false);
for(const [date,start,end] of [['2026-03-08','02:00','03:00'],['2026-11-01','01:00','02:00']]){d=clone(f.draft);Object.assign(d,{timezone:'America/New_York',startDate:date,endDate:date});Object.assign(d.rules[0],{kind:'EXPLICIT',startDate:date,endDate:date,startTime:start,endTime:end});assert.equal(check(d).valid,false,'DST ambiguity/gap fails closed');}
d=clone(f.draft);d.rules.push(clone(d.rules[0]));assert.throws(()=>check(d),/unique/);
d=clone(f.draft);d.exceptions=[{id:'EX-BAD',ruleId:'RULE-DEMO',originalDate:'2026-09-22',action:'CANCEL'}];assert.equal(check(d).valid,false);
let authorized=true,opens=0;
const user={accountid:'ADMIN-TEST'};
const open=async()=>{opens++;if(!authorized)throw new Error('revoked');return {user,service:timetableService(f.repository,f.program)};};
let coordinator=timetableCoordinator(f.journal,open);
const input=(revision,draft=f.draft)=>({id:f.program.id,operationId:crypto.randomUUID(),revision,draft:clone(draft)});
let first=input('');let saved=await coordinator.run('save',first,'token');assert(saved.revision);assert.equal(f.tables.ProgramTimetablePublications.length,0);assert.equal((await timetableService(f.repository,f.program).read('published')).publication,null);
assert((await coordinator.run('save',first,'token')).replayed);
await assert.rejects(coordinator.run('save',{...first,draft:{...first.draft,timezone:'UTC'}},'token'),/different edits/);
const competing=[input(saved.revision),input(saved.revision)];
const outcomes=await Promise.allSettled(competing.map(i=>coordinator.run('publish',i,'token')));assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);assert.equal(f.tables.ProgramTimetablePublications.length,1);
const published=(await timetableService(f.repository,f.program).read('published')).publication;assert.equal(published.version,1);
let latest=await timetableService(f.repository,f.program).read('get');d=clone(f.draft);d.rules[0].startTime='12:00';saved=await coordinator.run('save',input(latest.revision,d),'token');assert.equal((await timetableService(f.repository,f.program).read('published')).publication.occurrences[0].startTime,'13:00');
// Crash before commit, recreate coordinator with persisted intent, then recover.
f.failNext('before');const retry=input(saved.revision,d);await assert.rejects(coordinator.run('publish',retry,'token'),/Injected/);assert(await f.journal.get());coordinator=timetableCoordinator(f.journal,open);
await assert.rejects(coordinator.run('save',input(saved.revision),'token'),/recovery/);
authorized=false;await assert.rejects(coordinator.run('recover',{id:f.program.id},'token'),/revoked/);assert(await f.journal.get());authorized=true;
const recovered=await coordinator.run('recover',{id:f.program.id},'token');assert.equal(recovered.version,2);assert.equal(f.tables.ProgramTimetablePublications.length,2);assert.equal(await f.journal.get(),null);
assert((await coordinator.run('publish',retry,'token')).replayed);
// A response lost AFTER the atomic batch is recovered through the receipt.
f.failNext('after');const lost=input(recovered.revision);await assert.rejects(coordinator.run('publish',lost,'token'),/lost response/);const before=f.plans.length;coordinator=timetableCoordinator(f.journal,open);const replay=await coordinator.run('publish',lost,'token');assert(replay.replayed);assert.equal(f.plans.length,before);assert.equal(f.tables.ProgramTimetablePublications.length,3);
// Simulate an old network write arriving after a newer save: append-only state wins.
const oldPlan=clone(f.plans[0]);const newest=await coordinator.run('save',input(replay.revision,d),'token');await f.repository.apply(oldPlan);assert.equal((await timetableService(f.repository,f.program).read('get')).revision,newest.revision);
assert.equal((await timetableService(f.repository,f.program).read('history')).publications[0].snapshot.rules[0].startTime,'13:00');
assert(opens>=14);
// Invalid publication creates neither intent nor history.
d=clone(f.draft);d.rules[0].teacherId='missing';await assert.rejects(coordinator.run('publish',input(newest.revision,d),'token'),/Publication blocked/);assert.equal(await f.journal.get(),null);
assert.equal(await payloadHash({a:1,b:2}),await payloadHash({b:2,a:1}));
console.log('Program timetable: domain, DST, conflict, snapshot, concurrent publication, stale save, crash recovery and late-write tests passed.');
