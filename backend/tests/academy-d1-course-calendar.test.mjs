import {test} from 'node:test';
import assert from 'node:assert/strict';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {learningFixture} from './fixtures/academy-d1-learning-fixture.mjs';
import {appendRecord,nativeBinding} from './fixtures/academy-d1-fixture.mjs';
import {fixtureTab} from './fixtures/academy-migration-fixture.mjs';
import {verifyCourseCalendarPlan,importCourseCalendarPlan} from '../tools/academy-migration/course-calendar.mjs';
import worker from '../src/worker.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const base='/api/admin/platform/global/',cal='/api/admin/platform/calendar/';
const post=async(env,path,input={},token='')=>{const r=await worker.fetch(new Request(`https://academy.invalid${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input)}),env);return {status:r.status,body:await r.json()};};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,suffix='0001')=>ok(await post(env,'/api/account/login',{uniqueid:`login-${suffix}`,pin:'1234'})).token;
const change=async(env,path,input,token,revision)=>post(env,path,{...input,workflowRevision:revision,operationId:crypto.randomUUID()},token);
const rule={rulekey:'rule-course-1',days:['MON','TUE','WED','THU','FRI','SAT','SUN'],starttime:'12:00',endtime:'13:00',moduleid:'module-1',teacheraccountid:'account-0003',zoomlink:'https://zoom.us/j/12345678901'};
const runInput=(extra={})=>({subjectId:'subject-1',runName:'New course',startDate:'2026-10-10',endDate:'2026-10-17',active:true,accessModel:'FREE',scheduleMode:'DERIVED',scheduleDefinition:[rule],...extra});
async function use(fn,edit){const f=await courseFixture(edit),original=globalThis.fetch;let external=0;globalThis.fetch=async()=>{external++;throw Error('Unexpected external service');};
  try{await fn(f);assert.equal(external,0);assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{globalThis.fetch=original;f.db.close();}}

test('Course and calendar workflows require verified supplemental data and Global Admin authority',async()=>{
  const f=await learningFixture();try{const token=await login(f.env);assert.equal((await post(f.env,base+'delivery/get',{},token)).body.code,'COURSE_IMPORT_REQUIRED');f.db.exec(readFileSync(new URL('../migrations/academy/0006_course_calendar_workflows.sql',import.meta.url),'utf8'));assert.equal((await post(f.env,'/api/academy/entrance',{},token)).body.code,'COURSE_IMPORT_REQUIRED');}finally{f.db.close();}
  await use(async({env,db})=>{
    for(const suffix of ['0003','0004','0005']){const token=await login(env,suffix);for(const path of [base+'delivery/get',base+'timetable/get',cal+'get',base+'run/save'])assert.equal((await post(env,path,{},token)).status,403);}
    const token=await login(env);
    assert.equal(ok(await post(env,base+'delivery/get',{},token)).subjects[0].dependencies.subscriptions,2);
    db.prepare('UPDATE accounts SET active=0 WHERE account_id=?').run('account-0004');
    assert.equal(ok(await post(env,base+'delivery/get',{},token)).subjects[0].dependencies.subscriptions,1);
  },snapshot=>{fixtureTab(snapshot,'GlobalSubjectAccessMatrix').rows=[['AccountID','subject-1'],['account-0002',true],['account-0004',true],['account-0005',false]];});
});
test('derived Course creation, publishing, immutable history and Home respect per-run paid access',()=>use(async({env,db,queries})=>{
  const admin=await login(env),student=await login(env,'0002'),get=ok(await post(env,base+'delivery/get',{},admin));
  const save=ok(await change(env,base+'run/save',runInput({accessModel:'PAID'}),admin,get.workflowRevision));
  const runId=save.run.runid,input={runId,workflowRevision:save.workflowRevision,operationId:crypto.randomUUID()};
  const before=queries.length,published=ok(await post(env,base+'timetable/publish',input,admin));
  assert.ok(queries.length-before<=50,`Publication used ${queries.length-before} queries`);
  assert.equal(published.publication.sessioncount,8);
  assert.equal(db.prepare('SELECT count(*) n FROM published_lessons WHERE publication_id=?').get(published.publication.publicationid).n,8);
  assert.equal(db.prepare('SELECT count(*) n FROM published_lesson_teachers WHERE publication_id=?').get(published.publication.publicationid).n,8);
  assert.equal(ok(await post(env,base+'timetable/publish',input,admin)).replayed,true);
  assert.equal((await post(env,base+'timetable/publish',{...input,runId:'run-1'},admin)).body.code,'OPERATION_ID_REUSED');
  assert.throws(()=>db.prepare('DELETE FROM timetable_publications WHERE publication_id=?').run(published.publication.publicationid),/immutable/);
  const home=ok(await post(env,'/api/academy/entrance',{startDate:'2026-10-10',id:'subject-1'},student));
  const locked=home.timetable.filter(s=>s.offeringId===runId);assert.equal(locked.length,7);assert.ok(locked.every(s=>!s.relevant&&!s.meetingGroup&&!s.joinUrl&&!s.moduleName));
  const revised=ok(await change(env,base+'timetable/revise',{runId},admin,published.workflowRevision));
  const free=ok(await change(env,base+'run/save',runInput({runId,accessModel:'FREE'}),admin,revised.workflowRevision));
  const opened=ok(await post(env,'/api/academy/entrance',{startDate:'2026-10-10'},student));assert.ok(opened.personalTimetable.some(s=>s.offeringId===runId));
  assert.equal((await change(env,base+'run/save',runInput({runId}),admin,get.workflowRevision)).body.code,'WORKFLOW_CHANGED');
  assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,4);
  assert.ok(free.workflowRevision);
}));
test('explicit Course generation, cancellation, rescheduling and publication use the shared rules',()=>use(async({env,db})=>{
  const token=await login(env),initial=ok(await post(env,base+'delivery/get',{},token));
  let current=ok(await change(env,base+'run/save',runInput({scheduleMode:'EXPLICIT',scheduleDefinition:[]}),token,initial.workflowRevision));const runId=current.run.runid;
  current=ok(await change(env,base+'timetable/generate',{runId,weekdays:['MON'],startTime:'10:00',endTime:'11:00',teacherAccountId:'account-0003',moduleId:'module-1'},token,current.workflowRevision));
  const sessionId=current.sessions[0].sessionid;
  current=ok(await change(env,base+'timetable/session/reschedule',{sessionId,sessionDate:'2026-10-13',startTime:'11:00',endTime:'12:00',teacherAccountId:'account-0003'},token,current.workflowRevision));
  current=ok(await change(env,base+'timetable/publish',{runId},token,current.workflowRevision));
  const table=ok(await post(env,base+'timetable/get',{},token));assert.ok(table.publishedLifecycles.some(s=>s.sessionid===sessionId&&s.status==='RESCHEDULED'));
  assert.equal(db.prepare('SELECT count(*) n FROM course_draft_lifecycle').get().n,2);
  assert.ok(current.publication.publicationid);
}));
test('derived exceptions preserve published snapshots until republishing and reject overlapping slots',()=>use(async({env,db})=>{
  const token=await login(env),initial=ok(await post(env,base+'delivery/get',{},token));
  let current=ok(await change(env,base+'run/save',runInput(),token,initial.workflowRevision));const runId=current.run.runid;
  current=ok(await change(env,base+'timetable/session/materialize',{runId,scheduleRuleKey:rule.rulekey,occurrenceDate:'2026-10-12',status:'CANCELLED'},token,current.workflowRevision));
  current=ok(await change(env,base+'timetable/publish',{runId},token,current.workflowRevision));
  assert.ok(db.prepare('SELECT 1 FROM lesson_lifecycle WHERE publication_id=? AND status=?').get(current.publication.publicationid,'CANCELLED'));
  assert.ok(db.prepare('SELECT 1 FROM published_lessons WHERE publication_id=? AND status=?').get(current.publication.publicationid,'CANCELLED'));
  assert.equal((await change(env,base+'timetable/session/materialize',{runId,sessionDate:'2026-10-12',startTime:'12:15',endTime:'12:45'},token,current.workflowRevision)).status,409);
}));
test('calendar term edits and generated-holiday moves are atomic, replayable and visible on Home',()=>use(async({env,db})=>{
  const token=await login(env),initial=ok(await post(env,cal+'get',{year:2026},token));
  const input={changes:[{eventType:'TERM',description:'Term 4',startDate:'2026-10-10',endDate:'2026-11-30',teachingImpact:'INFORMATION',active:true},{eventType:'PUBLIC_HOLIDAY',eventId:'SA-PUBLIC-HOLIDAY-2026-12-25',startDate:'2026-12-24',description:'Moved holiday',active:true}],workflowRevision:initial.workflowRevision,operationId:crypto.randomUUID()};
  const saved=ok(await post(env,cal+'batch-save',input,token));assert.equal(saved.changed,3);assert.equal(ok(await post(env,cal+'batch-save',input,token)).replayed,true);
  const calendar=ok(await post(env,cal+'get',{year:2026},token));assert.ok(!calendar.events.some(e=>e.id==='SA-PUBLIC-HOLIDAY-2026-12-25'));assert.ok(calendar.events.some(e=>e.startDate==='2026-12-24'&&e.description==='Moved holiday'));
  assert.ok(ok(await post(env,'/api/academy/entrance',{startDate:'2026-10-10'},token)).calendarEvents.some(e=>e.description==='Term 4'));
  const bad=await change(env,cal+'batch-save',{changes:[{eventType:'TERM',description:'Invalid',startDate:'2026-02-30',endDate:'2026-03-01'}]},token,saved.workflowRevision);assert.equal(bad.status,400);
  assert.equal(db.prepare('SELECT count(*) n FROM academy_calendar_events').get().n,3);
}));
test('source import excludes archived events, preserves only removed holiday dates and verifies exact content',async()=>{
  const f=await courseFixture(s=>{
    appendRecord(s,'AcademyCalendar',{CalendarEventID:'inactive-term',EventType:'TERM',Description:'Archived',StartDate:'2026-01-01',EndDate:'2026-01-03',TeachingImpact:'INFORMATION',Active:false});
    appendRecord(s,'AcademyCalendar',{CalendarEventID:'removed-holiday',EventType:'PUBLIC_HOLIDAY',Description:'Deleted',StartDate:'2026-12-25',EndDate:'2026-12-25',TeachingImpact:'NO_TEACHING',Active:false});
    appendRecord(s,'AcademyCalendar',{CalendarEventID:'active-term',EventType:'TERM',Description:'Active',StartDate:'2026-10-10',EndDate:'2026-10-11',TeachingImpact:'INFORMATION',Active:true});
  });try{
    assert.equal(f.course.summary.excludedInactiveCalendarEvents,2);assert.equal(f.course.summary.calendarEvents,1);assert.equal(verifyCourseCalendarPlan(f.db,f.course).contentVerification,'PASS');
    assert.throws(()=>importCourseCalendarPlan(f.db,f.course),/COURSE_ALREADY_IMPORTED/);
    const token=await login(f.env),calendar=ok(await post(f.env,cal+'get',{year:2026},token));assert.ok(!calendar.events.some(e=>e.startDate==='2026-12-25'));
    f.db.exec("UPDATE academy_calendar_events SET description='Changed'");assert.throws(()=>verifyCourseCalendarPlan(f.db,f.course),/COURSE_IMPORT_CONTENT_MISMATCH/);
  }finally{f.db.close();}
});

test('competing writes cannot overwrite one another, and failures roll back metadata, audit and receipts',()=>use(async({env,db})=>{
  const token=await login(env),initial=ok(await post(env,base+'delivery/get',{},token));
  const inputs=['First','Second'].map(runName=>({...runInput({runName}),workflowRevision:initial.workflowRevision,operationId:crypto.randomUUID()}));
  const results=await Promise.all(inputs.map(input=>post(env,base+'run/save',input,token)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(db.prepare('SELECT count(*) n FROM course_runs').get().n,2);
  const version=db.prepare('SELECT version FROM academy_write_state').get().version;
  const receipts=db.prepare('SELECT count(*) n FROM operation_receipts').get().n;
  db.exec("CREATE TRIGGER fail_course_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'Synthetic audit failure'); END");
  assert.equal((await change(env,base+'run/save',runInput(),token,String(version))).status,503);
  assert.equal(db.prepare('SELECT count(*) n FROM course_runs').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,receipts);
  assert.equal(db.prepare('SELECT version FROM academy_write_state').get().version,version);
}));
test('authority is checked inside the write transaction and lost acknowledgements recover the committed receipt',()=>use(async({env,db})=>{
  const token=await login(env),initial=ok(await post(env,cal+'get',{year:2026},token));
  const input={changes:[{eventType:'TERM',description:'Atomic',startDate:'2026-10-10',endDate:'2026-10-11'}],workflowRevision:initial.workflowRevision,operationId:crypto.randomUUID()};
  const binding=nativeBinding(db);let lost=true;
  const wrapped={...binding,batch:async statements=>{const result=await binding.batch(statements);if(lost&&db.prepare('SELECT 1 FROM operation_receipts WHERE operation_id=?').get(input.operationId)){lost=false;throw Error('Lost acknowledgement');}return result;}};
  const replay=ok(await post({...env,ACADEMY_DB:{withSession:()=>wrapped}},cal+'batch-save',input,token));assert.equal(replay.replayed,true);assert.equal(db.prepare('SELECT count(*) n FROM academy_calendar_events').get().n,1);
  let revoking=true;
  const revoked={...binding,batch:async statements=>{if(revoking&&statements.length>5&&statements.length<20&&db.prepare('SELECT count(*) n FROM academy_calendar_events').get().n===1){revoking=false;db.exec("UPDATE global_role_assignments SET active=0");}return binding.batch(statements);}};
  const denied=await change({...env,ACADEMY_DB:{withSession:()=>revoked}},cal+'batch-save',{changes:[{eventType:'TERM',description:'Denied',startDate:'2026-10-12',endDate:'2026-10-13'}]},token,replay.workflowRevision);
  assert.equal(denied.status,401);assert.equal(db.prepare('SELECT count(*) n FROM academy_calendar_events').get().n,1);
}));
test('the existing Course and calendar scripts load D1 contracts and retain retry identifiers after uncertain responses',()=>use(async({env,db})=>{
  const token=await login(env);
  for(const name of ['m4l-global-course-scheduler','m4l-global-delivery','m4l-global-timetable','m4l-academy-calendar']){
    const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},removeAttribute(){},querySelectorAll:()=>[],querySelector:()=>null});return elements.get(id);};
    const calls=[];let uncertain=false;
    const apiPost=async(path,input={},receivedToken=token)=>{calls.push({path,input});const result=(await post(env,path,input,receivedToken||token)).body;
      if(uncertain&&path===cal+'batch-save'&&result.success){uncertain=false;return {success:false,retryable:true,error:'Uncertain network response'};}return result;};
    const window={M4LAuth:{apiPost},showScreen:()=>true,confirm:()=>true};
    const context={window,showScreen:()=>true,state:{token,user:{type:'account',role:'GLOBAL_ADMIN'}},apiPost,crypto,Date,Map,Set,console,alert(){},requestAnimationFrame:fn=>fn(),document:{addEventListener(){},getElementById:element,querySelectorAll:()=>[],querySelector:()=>null}};
    let code=readFileSync(new URL(`../../js/${name}.js`,import.meta.url),'utf8'),at=code.lastIndexOf('  bind();');
    code=code.slice(0,at)+'  window.testWorkflowPost = workflowPost;\n'+code.slice(at);vm.runInNewContext(code,context);
    const ui=window[{ 'm4l-global-course-scheduler':'M4LGlobalCourseScheduler','m4l-global-delivery':'M4LGlobalDelivery','m4l-global-timetable':'M4LGlobalTimetable','m4l-academy-calendar':'M4LAcademyCalendar'}[name]];
    await ui.show();assert.ok(calls.some(c=>c.path.endsWith('/get')),name);assert.ok(![...elements.values()].some(e=>/unavailable<\/h3>/.test(e.innerHTML)));
    const input={changes:[{eventType:'TERM',description:name,startDate:'2026-10-10',endDate:'2026-10-11'}]};
    uncertain=true;assert.equal((await window.testWorkflowPost(cal+'batch-save',input,token)).success,false);
    const replay=await window.testWorkflowPost(cal+'batch-save',input,token);assert.equal(replay.success,true);assert.equal(replay.replayed,true);
    const writes=calls.filter(c=>c.path===cal+'batch-save');assert.equal(writes[0].input.operationId,writes[1].input.operationId);assert.equal(writes[0].input.workflowRevision,writes[1].input.workflowRevision);
  }
  assert.equal(db.prepare('SELECT count(*) n FROM academy_calendar_events').get().n,4);
}));
