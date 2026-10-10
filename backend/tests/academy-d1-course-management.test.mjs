import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
const base='/api/admin/platform/courses/';
export async function editorFixture(){const f=await courseFixture();f.env.ACADEMY_LIBRARY_MODE='PUBLIC_ONLY';for(const migration of ['0007_course_subscriptions.sql','0008_course_management.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));return f;}
export async function post(env,path,input={},token=''){const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);return {status:response.status,body:await response.json()};}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const write=(env,token,action,input)=>post(env,base+action,{operationId:crypto.randomUUID(),...input},token);
const get=async(env,token,selection)=>ok(await post(env,base+'get',selection,token)).course;
const details=(name='Test Course')=>({name,categoryKey:'',accessModel:'PAID',timezone:'Africa/Johannesburg',weekdays:[1],startDate:'2026-09-24',endDate:'2026-09-24',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',sessions:[{id:'CMSESSION-'+crypto.randomUUID(),date:'2026-09-24',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',title:'Opening workshop',status:'SCHEDULED'}]});
const create=async(env,token,d=details())=>ok(await write(env,token,'save',{details:d}));
async function publish(env,token,selection){const c=await get(env,token,selection),review=ok(await write(env,token,'validate',{...selection,baseRevision:c.revision}));assert.equal(review.validation.valid,true,JSON.stringify(review));return ok(await write(env,token,'publish',{...selection,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));}
async function use(fn){const f=await editorFixture(),original=globalThis.fetch;let outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('Unexpected external request');};try{await fn(f);assert.equal(outbound,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{globalThis.fetch=original;f.db.close();}}

test('name-only Course drafts persist, remain private and do not mutate existing publications',()=>use(async({env,db})=>{
 const token=await login(env),before=db.prepare('SELECT snapshot_json FROM timetable_publications').all();
 const d=details();for(const f of ['accessModel','startDate','endDate','startTime','endTime','teacherId','zoomLink'])d[f]='';d.sessions=[];
 const created=await create(env,token,d),course=await get(env,token,created);assert.equal(course.stage,'DRAFT');assert.equal(course.details.name,'Test Course');assert.equal(course.details.sessions.length,0);
 const view=ok(await post(env,base+'list',{},token));assert.ok(view.courses.some(c=>c.courseId===created.courseId));
 assert.equal(db.prepare('SELECT website_visible FROM activities WHERE activity_id=?').get(created.courseId).website_visible,0);
 const home=ok(await post(env,'/api/academy/entrance',{startDate:'2026-09-24'},token));assert.ok(!home.activities.some(a=>a.id===created.courseId));
 const review=ok(await write(env,token,'validate',{...created,baseRevision:course.revision}));assert.equal(review.validation.valid,false);assert.ok(review.validation.errors.length>=3);
 assert.deepEqual(db.prepare('SELECT snapshot_json FROM timetable_publications').all(),before);
}));

test('publication requires fresh validation and warning acknowledgement, and commits an immutable timetable',()=>use(async({env,db})=>{
 const token=await login(env),created=await create(env,token),c=await get(env,token,created);
 assert.equal((await write(env,token,'publish',{...created,baseRevision:c.revision})).body.code,'VALIDATION_REQUIRED');
 const review=ok(await write(env,token,'validate',{...created,baseRevision:c.revision}));assert.equal(review.validation.valid,true);assert.ok(review.validation.warnings.some(w=>w.code==='HOLIDAY'));
 assert.equal((await write(env,token,'publish',{...created,baseRevision:review.revision,validationToken:review.validation.token})).body.code,'WARNINGS_REQUIRED');
 const saved=ok(await write(env,token,'publish',{...created,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));
 const current=await get(env,token,created);assert.equal(current.stage,'PUBLISHED');assert.ok(current.currentPublication);
 const lessons=db.prepare('SELECT * FROM published_lessons WHERE activity_key=?').all(current.activityKey);assert.equal(lessons.length,1);assert.equal(lessons[0].module_id,null);assert.equal(lessons[0].title,'Opening workshop');
 assert.ok(db.prepare("SELECT 1 FROM effective_activity_roles WHERE account_id='account-0003' AND activity_key=? AND role='TEACHER'").get(current.activityKey));
 assert.throws(()=>db.prepare('UPDATE timetable_publications SET version_no=7 WHERE activity_key=?').run(current.activityKey),/immutable/);
 assert.ok(saved.publication);
}));

test('saved detail changes and calendar changes invalidate validation; row revisions prevent overwrites',()=>use(async({env,db})=>{
 const token=await login(env),created=await create(env,token),before=await get(env,token,created),review=ok(await write(env,token,'validate',{...created,baseRevision:before.revision}));
 const updated=ok(await write(env,token,'save',{...created,baseRevision:review.revision,details:{...before.details,name:'Revised workshop'}}));
 assert.equal((await write(env,token,'save',{...created,baseRevision:before.revision,details:before.details})).body.code,'ROW_CHANGED');
 assert.equal((await write(env,token,'publish',{...created,baseRevision:updated.revision,validationToken:review.validation.token,acknowledgeWarnings:true})).body.code,'VALIDATION_REQUIRED');
 const checked=ok(await write(env,token,'validate',{...created,baseRevision:updated.revision}));
 db.exec("INSERT INTO academy_calendar_events VALUES('new-holiday','TERM','New closure','2026-09-24','2026-09-24',NULL,'NO_TEACHING',1)");
 assert.equal((await write(env,token,'publish',{...created,baseRevision:checked.revision,validationToken:checked.validation.token,acknowledgeWarnings:true})).body.code,'VALIDATION_REQUIRED');
}));

test('shared categories are classification only and session errors block publication',()=>use(async({env})=>{
 const token=await login(env),options=ok(await post(env,base+'list',{},token)),d=details();d.categoryKey=options.categories.find(c=>c.type==='Module').key;
 const created=await create(env,token,d);await publish(env,token,created);const c=await get(env,token,created);assert.equal(c.details.categoryKey,d.categoryKey);
 const other=details('Bad sessions');other.sessions.push({...other.sessions[0],id:'CMSESSION-'+crypto.randomUUID()});other.sessions[0].teacherId='missing';other.sessions[0].zoomLink='javascript:alert(1)';
 const bad=await create(env,token,other),draft=await get(env,token,bad),review=ok(await write(env,token,'validate',{...bad,baseRevision:draft.revision}));assert.equal(review.validation.valid,false);assert.ok(review.validation.errors.some(e=>e.field==='teacherId'));assert.ok(review.validation.errors.some(e=>e.field==='zoomLink'));assert.ok(review.validation.errors.some(e=>e.field==='sessions'));
}));

test('completion, archive and repeat preserve original participants/media and create independent Course IDs',()=>use(async({env,db})=>{
 const token=await login(env),created=await create(env,token);await publish(env,token,created);let c=await get(env,token,created);
 const people=ok(await post(env,base+'participants',created,token)),student=people.accounts.find(a=>a.accountId==='account-0002');
 ok(await write(env,token,'participants-save',{...created,accountId:student.accountId,roles:['STUDENT'],baseRevision:student.assignment.revision,scopeRevision:people.scope.revision}));
 db.prepare("INSERT INTO course_resources(activity_key,resource_id,name,resource_type,active) VALUES(?,'old-notes','Course notes','EBOOK',1)").run(c.activityKey);
 ok(await write(env,token,'status',{...created,baseRevision:c.revision,stage:'COMPLETE'}));c=await get(env,token,created);assert.ok(c.completedAt);
 ok(await write(env,token,'status',{...created,baseRevision:c.revision,stage:'ARCHIVED'}));c=await get(env,token,created);
 const repeated=ok(await write(env,token,'repeat',{...created,baseRevision:c.revision,name:'New delivery',reuseMedia:true}));assert.notEqual(repeated.courseId,created.courseId);
 const next=await get(env,token,repeated);assert.equal(next.stage,'DRAFT');assert.equal(next.details.sessions.length,0);assert.equal(next.details.startDate,'');assert.equal(next.repeatedFrom,c.activityKey);
 assert.equal(db.prepare("SELECT count(*) n FROM effective_activity_roles WHERE activity_key=? AND role='STUDENT'").get(next.activityKey).n,0);
 assert.equal(db.prepare("SELECT count(*) n FROM effective_activity_roles WHERE activity_key=? AND role='STUDENT'").get(c.activityKey).n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM course_resources WHERE activity_key=?').get(next.activityKey).n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM course_resources WHERE activity_key=?').get(c.activityKey).n,1);
 assert.equal((await post(env,'/api/platform/global/resources/access',{subjectId:c.courseId},token)).body.code,'PRIVATE_MEDIA_NOT_ENABLED');
}));

test('Course Admin authority is scoped, inherited Global Admin access cannot be removed, and new users receive only scoped Student access',()=>use(async({env,db})=>{
 const admin=await login(env),one=await create(env,admin),two=await create(env,admin,details('Other Course'));
 db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('editor-admin','account-0008',?,'PROGRAM_ADMIN',1,'CONFIRMED')").run('COURSE:'+one.courseId);
 const scoped=await login(env,'0008'),list=ok(await post(env,base+'list',{},scoped));assert.equal(list.capabilities.create,false);assert.ok(list.courses.every(c=>c.courseId===one.courseId));assert.equal((await post(env,base+'get',two,scoped)).status,403);
 assert.equal((await write(env,scoped,'save',{details:details()})).status,403);
 const people=ok(await post(env,base+'participants',one,scoped)),global=people.accounts.find(a=>a.accountId==='account-0001');assert.deepEqual(global.assignment.inheritedRoles,['PROGRAM_ADMIN']);
 const saved=ok(await write(env,scoped,'participants-save',{...one,accountId:global.accountId,roles:[],baseRevision:global.assignment.revision,scopeRevision:people.scope.revision}));assert.deepEqual(saved.assignment.displayRoles,['PROGRAM_ADMIN']);
 const created=ok(await write(env,scoped,'participant-create',{...one,displayName:'New learner'}));assert.ok(created.loginPath.startsWith('/account/'));assert.equal(db.prepare('SELECT pin_setup FROM account_credentials WHERE account_id=?').get(created.accountId).pin_setup,0);
 assert.deepEqual(db.prepare('SELECT role,activity_key FROM effective_activity_roles WHERE account_id=?').all(created.accountId).map(r=>({...r})),[{role:'STUDENT',activity_key:'COURSE:'+one.courseId}]);
 db.exec("UPDATE role_assignments SET active=0 WHERE assignment_id='editor-admin'");assert.equal((await post(env,base+'list',{},scoped)).status,401);
}));

test('retry receipts recover lost acknowledgements without duplicate Courses and failed publication batches roll back',()=>use(async({env,db})=>{
 const token=await login(env),input={operationId:crypto.randomUUID(),details:details()},first=ok(await post(env,base+'save',input,token)),second=ok(await post(env,base+'save',input,token));assert.equal(second.replayed,true);assert.equal(second.courseId,first.courseId);
 const before=await get(env,token,first),review=ok(await write(env,token,'validate',{...first,baseRevision:before.revision}));
 db.exec("CREATE TRIGGER reject_new_publication BEFORE INSERT ON timetable_publications WHEN NEW.activity_key LIKE 'COURSE:COURSE-%' BEGIN SELECT RAISE(ABORT,'simulated failed transaction'); END");
 const result=await write(env,token,'publish',{...first,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true});assert.equal(result.status,503);
 assert.equal(db.prepare('SELECT count(*) n FROM timetable_publications WHERE activity_key=?').get(before.activityKey).n,0);assert.equal(db.prepare('SELECT count(*) n FROM course_runs WHERE activity_key=?').get(before.activityKey).n,0);assert.equal((await get(env,token,first)).stage,'DRAFT');
}));

test('existing unscheduled Courses open and adopt a draft; a future Course cannot be completed early',()=>use(async({env,db})=>{
 const token=await login(env);
 const legacy=ok(await post(env,'/api/admin/platform/global/get',{},token));
 const added=ok(await post(env,'/api/admin/platform/global/subject/save',{subjectName:'Unscheduled Course',active:true,workflowRevision:legacy.workflowRevision,operationId:crypto.randomUUID()},token));
 const list=ok(await post(env,base+'list',{},token)),row=list.courses.find(c=>c.courseId===added.subject.subjectid);assert.ok(row);const c=await get(env,token,row);assert.equal(c.stage,'DRAFT');assert.equal(c.details.sessions.length,0);
 ok(await write(env,token,'save',{courseId:c.courseId,runId:c.runId,baseRevision:c.revision,details:c.details}));
 const d=details('Future Course');d.startDate='2199-01-05';d.endDate=d.startDate;d.sessions[0].date=d.startDate;
 const created=await create(env,token,d);await publish(env,token,created);const future=await get(env,token,created);
 assert.equal((await write(env,token,'status',{...created,baseRevision:future.revision,stage:'COMPLETE'})).status,409);assert.equal((await get(env,token,created)).completedAt,null);
}));

test('older scheduling clients cannot overwrite a Course adopted by the new editor',()=>use(async({env})=>{
 const token=await login(env),created=await create(env,token);await publish(env,token,created);
 const old=ok(await post(env,'/api/admin/platform/global/get',{},token)),result=await post(env,'/api/admin/platform/global/subject/save',{subjectId:created.courseId,subjectName:'Overwritten',active:false,workflowRevision:old.workflowRevision,operationId:crypto.randomUUID()},token);
 assert.equal(result.status,409);assert.equal(result.body.code,'COURSE_EDITOR_REQUIRED');assert.equal((await get(env,token,created)).stage,'PUBLISHED');
}));
