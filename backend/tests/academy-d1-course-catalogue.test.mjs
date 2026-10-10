import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1CourseCatalogue} from '../src/academy/d1/course-catalogue.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
const path='/api/academy/courses/catalogue';
async function post(env,path,input={},token=''){
  const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:response.status,body:await response.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id)=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
async function use(fn,{editor=true}={}) {
  const f=await courseFixture();f.env.ACADEMY_LIBRARY_MODE='PUBLIC_ONLY';
  if(editor)for(const name of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
  const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Course listing must not call external services');};
  try{await fn(f);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{globalThis.fetch=original;f.db.close();}
}
async function view(env,account='account-0002',date='2026-10-15T12:00:00Z') {
  const repository=academyD1Repository(env),state=await repository.byId(account);
  return d1CourseCatalogue(repository,{state,user:{accountid:account}},new Date(date));
}
function assign(db,key,account,role='STUDENT'){
  db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,revision) VALUES(?,?,?,?,1,'CONFIRMED',1)").run(crypto.randomUUID(),account,key,role);
}
function meta(db,key,run,stage,details={}){
  db.prepare("INSERT INTO course_management_drafts(activity_key,run_id,details_json,stage,updated_at,updated_by_account_id) VALUES(?,?,?,?,?,'account-0001') ON CONFLICT(activity_key,run_id) DO UPDATE SET stage=excluded.stage,details_json=excluded.details_json")
    .run(key,run,JSON.stringify(details),stage,'2026-10-10T12:00:00Z');
}

test('Course history authenticates every request and cannot expose other Courses or unpublished details',()=>use(async({env,db})=>{
  assert.equal((await post(env,path)).status,401);
  const admin=await login(env,'0001'),student=await login(env,'0002');
  const draft=ok(await post(env,'/api/admin/platform/courses/save',{operationId:crypto.randomUUID(),details:{weekdays:[],sessions:[],name:'Private draft',zoomLink:'https://zoom.us/j/private-secret'}},admin));
  const mine=ok(await post(env,path,{all:true},student));
  assert.equal(mine.canViewAll,false);assert.ok(!mine.courses.some(c=>c.id===draft.courseId));
  const all=ok(await post(env,path,{},admin));
  assert.equal(all.canViewAll,true);assert.ok(all.courses.some(c=>c.id===draft.courseId&&c.stage==='DRAFT'&&c.runId===draft.runId&&c.canManage));
  assert.ok(!JSON.stringify(all).includes('private-secret'));
  assert.ok(all.courses.every(c=>c.mediaAvailable===false));
  db.exec("UPDATE account_sessions SET revoked_at='2026-10-10' WHERE account_id='account-0002'");
  assert.equal((await post(env,path,{},student)).status,401);
}));

test('assigned completed and archived Courses remain listed; removing the role removes access immediately',()=>use(async({env,db})=>{
  const r=db.prepare('SELECT * FROM course_runs LIMIT 1').get();
  db.prepare("DELETE FROM role_assignments WHERE account_id='account-0008' AND activity_key=?").run(r.activity_key);
  assign(db,r.activity_key,'account-0008');
  meta(db,r.activity_key,r.run_id,'COMPLETE');
  db.prepare('UPDATE course_runs SET active=0 WHERE activity_key=? AND run_id=?').run(r.activity_key,r.run_id);
  let result=await view(env,'account-0008');
  assert.ok(result.courses.some(c=>c.id===r.activity_key.slice(7)&&c.stage==='COMPLETE'&&!c.canOpenActivity));
  meta(db,r.activity_key,r.run_id,'ARCHIVED');
  db.prepare("UPDATE activities SET active=0,lifecycle='ARCHIVED' WHERE activity_key=?").run(r.activity_key);
  result=await view(env,'account-0008');assert.ok(result.courses.some(c=>c.stage==='ARCHIVED'));
  assert.ok(result.courses.every(c=>!c.canManage));
  db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0008' AND activity_key=?").run(r.activity_key);
  result=await view(env,'account-0008');assert.ok(!result.courses.some(c=>c.id===r.activity_key.slice(7)));
}));

test('a saved revision retains published dates and name; cancellation and draft-only Courses stay hidden from learners',()=>use(async({env,db})=>{
  const r=db.prepare('SELECT * FROM course_runs LIMIT 1').get();
  db.prepare("DELETE FROM role_assignments WHERE account_id='account-0008' AND activity_key=?").run(r.activity_key);assign(db,r.activity_key,'account-0008');
  meta(db,r.activity_key,r.run_id,'DRAFT',{name:'Unpublished name',startDate:'2028-01-01',endDate:'2028-01-31',zoomLink:'https://zoom.us/j/secret'});
  let result=await view(env,'account-0008'),row=result.courses.find(c=>c.id===r.activity_key.slice(7));
  assert.ok(row);assert.notEqual(row.name,'Unpublished name');assert.notEqual(row.startDate,'2028-01-01');
  assert.ok(['ACTIVE','PUBLISHED'].includes(row.stage));assert.ok(!JSON.stringify(result).includes('secret'));
  meta(db,r.activity_key,r.run_id,'CANCELLED');
  result=await view(env,'account-0008');assert.ok(!result.courses.some(c=>c.id===r.activity_key.slice(7)));
}));

test('Course admins see their own drafts, teachers receive no administrator authority, and Global Admin sees every Course',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),draft=ok(await post(env,'/api/admin/platform/courses/save',{operationId:crypto.randomUUID(),details:{weekdays:[],sessions:[],name:'Scoped draft'}},admin));
  assign(db,'COURSE:'+draft.courseId,'account-0004','PROGRAM_ADMIN');
  let result=await view(env,'account-0004');assert.equal(result.canViewAll,false);
  assert.ok(result.courses.some(c=>c.id===draft.courseId&&c.canManage&&c.stage==='DRAFT'));
  assign(db,'COURSE:'+draft.courseId,'account-0003','TEACHER');
  result=await view(env,'account-0003');assert.ok(!result.courses.some(c=>c.id===draft.courseId));
  result=await view(env,'account-0001');assert.equal(result.canViewAll,true);assert.ok(result.courses.every(c=>c.canManage));
}));

test('legacy Course listings work before optional editor migrations and do not modify records',()=>use(async({env,db})=>{
  const before=db.prepare('SELECT * FROM timetable_publications').all();
  const result=await view(env,'account-0001');assert.ok(result.courses.length);
  assert.deepEqual(db.prepare('SELECT * FROM timetable_publications').all(),before);
}),{editor:false});
