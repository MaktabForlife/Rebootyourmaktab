import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
const base='/api/admin/platform/courses/';
export async function editorFixture(){const f=await courseFixture();f.env.ACADEMY_LIBRARY_MODE='PUBLIC_ONLY';for(const migration of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));return f;}
export async function post(env,path,input={},token=''){const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);return {status:response.status,body:await response.json()};}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const write=(env,token,action,input)=>post(env,base+action,{operationId:crypto.randomUUID(),...input},token);
const get=async(env,token,selection)=>ok(await post(env,base+'get',selection,token)).course;
const details=(name='Test Course')=>({name,categoryKey:'',accessModel:'PAID',timezone:'Africa/Johannesburg',weekdays:[1],startDate:'2026-09-24',endDate:'2026-09-24',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',sessions:[{id:'CMSESSION-'+crypto.randomUUID(),date:'2026-09-24',startTime:'12:00',endTime:'13:00',teacherId:'account-0003',zoomLink:'https://zoom.us/j/12345678901',title:'Opening workshop',status:'SCHEDULED'}]});
const create=async(env,token,d=details())=>ok(await write(env,token,'save',{details:d}));
const profileBase='/api/admin/platform/user-profiles/';
const profileDirectory=async(env,token)=>ok(await post(env,profileBase+'get',{},token));
const designate=async(env,token,accountId,active=true)=>{const account=(await profileDirectory(env,token)).accounts.find(a=>a.accountId===accountId);return post(env,profileBase+'save',{operationId:crypto.randomUUID(),mode:'profile',accountId,creating:false,displayName:account.displayName,active:account.active,baseRevision:account.revision,academyTeacher:active},token);};
async function publish(env,token,selection){const c=await get(env,token,selection),review=ok(await write(env,token,'validate',{...selection,baseRevision:c.revision}));assert.equal(review.validation.valid,true,JSON.stringify(review));const accepted=ok(await write(env,token,'accept',{...selection,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));return ok(await write(env,token,'publish',{...selection,baseRevision:accepted.revision,validationToken:review.validation.token}));}
async function use(fn){const f=await editorFixture(),original=globalThis.fetch;let outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('Unexpected external request');};try{await fn(f);assert.equal(outbound,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}finally{globalThis.fetch=original;f.db.close();}}

test('ordinary Course editing avoids clash scans but validation still detects another published Course',()=>use(async({env,queries})=>{
 const token=await login(env),first=await create(env,token,details('Published workshop'));await publish(env,token,first);
 queries.length=0;
 ok(await post(env,base+'list',{},token));
 const second=await create(env,token,details('Overlapping workshop')),draft=await get(env,token,second);
 assert.ok(!queries.some(q=>q.includes('SELECT l.*,t.account_id')),'Listing, saving and an unvalidated draft do not load Academy teaching lessons');
 const review=ok(await write(env,token,'validate',{...second,baseRevision:draft.revision}));
 assert.ok(queries.some(q=>q.includes('SELECT l.*,t.account_id')));
 assert.ok(review.validation.warnings.some(w=>w.code==='TEACHER_CLASH'),'Publication review retains teacher-clash detection');
}));

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
 assert.equal((await write(env,token,'publish',{...created,baseRevision:review.revision,validationToken:review.validation.token})).body.code,'REVIEW_ACCEPTANCE_REQUIRED');
 assert.equal((await write(env,token,'accept',{...created,baseRevision:review.revision,validationToken:review.validation.token})).body.code,'WARNINGS_REQUIRED');
 const accepted=ok(await write(env,token,'accept',{...created,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));
 const saved=ok(await write(env,token,'publish',{...created,baseRevision:accepted.revision,validationToken:review.validation.token}));
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
 const accepted=ok(await write(env,token,'accept',{...first,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));
 db.exec("CREATE TRIGGER reject_new_publication BEFORE INSERT ON timetable_publications WHEN NEW.activity_key LIKE 'COURSE:COURSE-%' BEGIN SELECT RAISE(ABORT,'simulated failed transaction'); END");
 const result=await write(env,token,'publish',{...first,baseRevision:accepted.revision,validationToken:review.validation.token});assert.equal(result.status,503);
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


test('validating the schedule generates inclusive dates and copies defaults; retries and repeated validation keep session IDs',()=>use(async({env})=>{
 const token=await login(env),d={...details('Generated workshop'),startDate:'2026-10-12',endDate:'2026-10-25',weekdays:[1,3],sessions:[]},created=await create(env,token,d),c=await get(env,token,created);
 const input={...created,operationId:crypto.randomUUID(),baseRevision:c.revision},review=ok(await post(env,base+'validate',input,token));assert.equal(review.validation.valid,true);assert.equal(review.generated,4);
 assert.deepEqual(review.details.sessions.map(s=>s.date),['2026-10-12','2026-10-14','2026-10-19','2026-10-21']);
 for(const s of review.details.sessions)for(const key of ['startTime','endTime','teacherId','zoomLink'])assert.equal(s[key],d[key]);
 assert.ok(review.details.sessions.every(s=>s.title===d.name&&s.status==='SCHEDULED'));
 const replay=ok(await post(env,base+'validate',input,token));assert.equal(replay.replayed,true);assert.deepEqual(replay.details.sessions,review.details.sessions);
 const again=ok(await write(env,token,'validate',{...created,baseRevision:review.revision}));assert.equal(again.generated,0);assert.deepEqual(again.details.sessions,review.details.sessions);
 const reopened=ok(await post(env,base+'get',created,token));assert.equal(reopened.validation.token,again.validation.token);
 const accepted=ok(await write(env,token,'accept',{...created,baseRevision:again.revision,validationToken:again.validation.token,acknowledgeWarnings:true}));assert.equal((await get(env,token,created)).acceptedToken,again.validation.token);
 ok(await write(env,token,'publish',{...created,baseRevision:accepted.revision,validationToken:again.validation.token}));
}));

test('invalid schedule cannot generate sessions and a one-day course generates exactly one session',()=>use(async({env})=>{
 const token=await login(env),d={...details(),weekdays:[4],endTime:'12:00',sessions:[]},created=await create(env,token,d);let c=await get(env,token,created);
 let review=ok(await write(env,token,'validate',{...created,baseRevision:c.revision}));assert.equal(review.generated,0);assert.equal(review.validation.valid,false);assert.match(review.validation.errors.find(e=>e.field==='endTime').message,/later than/);assert.equal(review.details.sessions.length,0);
 const changed=ok(await write(env,token,'save',{...created,baseRevision:review.revision,details:{...d,endTime:'13:00'}}));review=ok(await write(env,token,'validate',{...created,baseRevision:changed.revision}));assert.equal(review.generated,1);assert.equal(review.details.sessions[0].date,d.startDate);
}));

test('individual session edits survive validation; changed defaults need explicit regeneration and clear acceptance',()=>use(async({env})=>{
 const token=await login(env),d={...details(),weekdays:[4],sessions:[]},created=await create(env,token,d);let c=await get(env,token,created);
 let review=ok(await write(env,token,'validate',{...created,baseRevision:c.revision}));const originalId=review.details.sessions[0].id;
 let accepted=ok(await write(env,token,'accept',{...created,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));
 const edited={...review.details,sessions:review.details.sessions.map(s=>({...s,startTime:'12:15',title:'Individual exception'}))};let saved=ok(await write(env,token,'save',{...created,baseRevision:accepted.revision,details:edited}));
 assert.equal((await get(env,token,created)).acceptedToken,'');assert.equal((await write(env,token,'publish',{...created,baseRevision:saved.revision,validationToken:review.validation.token})).body.code,'VALIDATION_REQUIRED');
 review=ok(await write(env,token,'validate',{...created,baseRevision:saved.revision}));assert.equal(review.generated,0);assert.equal(review.details.sessions[0].startTime,'12:15');assert.equal(review.details.sessions[0].id,originalId);
 saved=ok(await write(env,token,'save',{...created,baseRevision:review.revision,details:{...review.details,startTime:'11:00'}}));
 assert.equal((await write(env,token,'validate',{...created,baseRevision:saved.revision})).body.code,'SCHEDULE_CHANGED');assert.equal((await get(env,token,created)).details.sessions[0].title,'Individual exception');
 review=ok(await write(env,token,'validate',{...created,baseRevision:saved.revision,regenerate:true}));assert.equal(review.generated,1);assert.notEqual(review.details.sessions[0].id,originalId);assert.equal(review.details.sessions[0].startTime,'11:00');assert.equal(review.details.sessions[0].title,d.name);
}));

test('Global Teacher is teaching eligibility only; teacher list excludes students and admin-only accounts',()=>use(async({env,db})=>{
 const admin=await login(env),learner=await login(env,'0008'),before=ok(await post(env,'/api/account/session',{},learner));
 const list=ok(await post(env,base+'list',{},admin));assert.ok(list.teachers.some(a=>a.accountId==='account-0003'));assert.ok(!list.teachers.some(a=>['account-0001','account-0008'].includes(a.accountId)));
 const directory=await profileDirectory(env,admin);assert.equal(directory.teacherDesignationEditable,true);
 const result=ok(await designate(env,admin,'account-0008'));assert.equal(result.profile.academyTeacher,true);assert.equal(result.profile.academyAdmin,false);
 assert.deepEqual(ok(await post(env,'/api/account/session',{},learner)).contexts,before.contexts);assert.equal((await post(env,base+'list',{},learner)).status,403);assert.equal((await post(env,profileBase+'get',{},learner)).status,403);
 assert.equal(db.prepare("SELECT count(*) n FROM effective_activity_roles WHERE account_id='account-0008' AND role='TEACHER'").get().n,0);
 assert.ok(ok(await post(env,base+'list',{},admin)).teachers.some(a=>a.accountId==='account-0008'));
 const d={...details('Staff assignment'),weekdays:[4],teacherId:'account-0008',sessions:[]},created=await create(env,admin,d);await publish(env,admin,created);
 assert.deepEqual(db.prepare("SELECT activity_key FROM effective_activity_roles WHERE account_id='account-0008' AND role='TEACHER'").all().map(r=>r.activity_key),['COURSE:'+created.courseId]);
 ok(await designate(env,admin,'account-0008',false));assert.ok(ok(await post(env,base+'list',{},admin)).teachers.some(a=>a.accountId==='account-0008'),'a remaining Course Teacher assignment still qualifies');
}));

test('Global Teacher changes use optimistic revisions and atomic profile batches and cannot be forged by Course Admins',()=>use(async({env,db})=>{
 const admin=await login(env),directory=await profileDirectory(env,admin),account=directory.accounts.find(a=>a.accountId==='account-0008');
 const input={mode:'profile',accountId:account.accountId,creating:false,displayName:account.displayName,active:true,academyTeacher:true,baseRevision:account.revision,operationId:crypto.randomUUID()};
 const saved=ok(await post(env,profileBase+'save',input,admin));assert.equal(saved.profile.academyTeacher,true);
 assert.equal((await post(env,profileBase+'save',{...input,operationId:crypto.randomUUID(),academyTeacher:false},admin)).body.code,'ROW_CHANGED');
 const current=(await profileDirectory(env,admin)).accounts.find(a=>a.accountId===account.accountId);
 const failed=await post(env,profileBase+'save',{operationId:crypto.randomUUID(),mode:'batch',entries:[{...input,baseRevision:current.revision,academyTeacher:false,displayName:'Should roll back'},{mode:'profile',accountId:'account-0001',creating:false,displayName:'Invalid',active:false,baseRevision:directory.accounts[0].revision}]},admin);assert.notEqual(failed.status,200);
 assert.equal(db.prepare('SELECT active FROM academy_teacher_designations WHERE account_id=?').get(account.accountId).active,1);assert.equal(db.prepare('SELECT display_name FROM accounts WHERE account_id=?').get(account.accountId).display_name,account.displayName);
 db.exec("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('staff-scope','account-0004','COURSE:subject-1','PROGRAM_ADMIN',1,'CONFIRMED')");const scoped=await login(env,'0004');
 assert.equal((await post(env,profileBase+'save',{...input,operationId:crypto.randomUUID()},scoped)).status,403);
 assert.notEqual((await write(env,scoped,'participants-save',{courseId:'subject-1',runId:'run-1',...input,mode:'profile'})).status,200);assert.equal(db.prepare('SELECT active FROM academy_teacher_designations WHERE account_id=?').get(account.accountId).active,1);
 const disabled=ok(await post(env,profileBase+'save',{...input,operationId:crypto.randomUUID(),baseRevision:current.revision,active:false},admin));assert.equal(disabled.profile.active,false);assert.ok(!ok(await post(env,base+'list',{},admin)).teachers.some(a=>a.accountId===account.accountId));
}));

test('removing teaching eligibility invalidates an accepted unpublished schedule',()=>use(async({env})=>{
 const token=await login(env);ok(await designate(env,token,'account-0008'));const d={...details(),teacherId:'account-0008',weekdays:[4],sessions:[]},created=await create(env,token,d),c=await get(env,token,created),review=ok(await write(env,token,'validate',{...created,baseRevision:c.revision}));
 const accepted=ok(await write(env,token,'accept',{...created,baseRevision:review.revision,validationToken:review.validation.token,acknowledgeWarnings:true}));ok(await designate(env,token,'account-0008',false));
 assert.equal((await write(env,token,'publish',{...created,baseRevision:accepted.revision,validationToken:review.validation.token})).body.code,'VALIDATION_REQUIRED');assert.equal(ok(await post(env,base+'get',created,token)).validation,null);
}));


test('the additive upgrade preserves publications and roles; older storage reports a clear upgrade requirement',async()=>{
 const f=await courseFixture();try{
  for(const migration of ['0007_course_subscriptions.sql','0008_course_management.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+migration,import.meta.url),'utf8'));
  const token=await login(f.env),before={publications:f.db.prepare('SELECT * FROM timetable_publications').all(),roles:f.db.prepare('SELECT * FROM role_assignments').all()};
  const unavailable=await post(f.env,base+'list',{},token);assert.equal(unavailable.status,503);assert.equal(unavailable.body.code,'COURSE_MANAGEMENT_SCHEMA_REQUIRED');assert.equal((await profileDirectory(f.env,token)).teacherDesignationEditable,false);
  f.db.exec(readFileSync(new URL('../migrations/academy/0009_course_review_and_teachers.sql',import.meta.url),'utf8'));
  assert.deepEqual(f.db.prepare('SELECT * FROM timetable_publications').all(),before.publications);assert.deepEqual(f.db.prepare('SELECT * FROM role_assignments').all(),before.roles);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_teacher_designations').get().n,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal((await post(f.env,base+'list',{},token)).status,200);
 }finally{f.db.close();}
});
