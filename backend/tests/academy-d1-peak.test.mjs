import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';
import {prepareHostedCore} from '../tools/academy-d1-hosted-core.mjs';
import {exercisePeak} from '../tools/academy-d1-peak-test.mjs';
import {nativeBinding} from '../tools/academy-migration/native-d1.mjs';
import {profileD1} from '../tools/academy-migration/profile-d1.mjs';
const directory=mkdtempSync(join(tmpdir(),'academy-peak-'));
const databaseId='00000000-0000-4000-8000-000000000009',workerName='academy-d1-core-test-20261010-12345678';
try {
  await prepareHostedCore({directory,databaseId,workerName,accountId:'0'.repeat(32),repo:new URL('../../',import.meta.url).pathname,fixture:'peak'});
  const sql=readFileSync(join(directory,'synthetic-install.sql'),'utf8'),config=JSON.parse(readFileSync(join(directory,'wrangler.json'))),secrets=JSON.parse(readFileSync(join(directory,'test-secrets.json'))),input=JSON.parse(readFileSync(join(directory,'test-input.json')));
  async function use(fn) {
    const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');db.exec(sql);
    const env={...config.vars,...secrets,ACADEMY_DB:nativeBinding(db),AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})}},original=globalThis.fetch;
    globalThis.fetch=async()=>{throw Error('No external requests allowed');};
    const post=async(path,body={},token='')=>{
      const profile=profileD1(env.ACADEMY_DB),response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:JSON.stringify(body)}),{...env,ACADEMY_DB:profile.binding});
      return {status:response.status,data:await response.json(),metrics:profile.metrics};
    };
    const login=async index=>{const result=await post('/api/account/login',{uniqueid:input.accounts[index].login,pin:'1234'});assert.equal(result.status,200);return result.data.token;};
    try{await fn({db,env,post,login});assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);}finally{globalThis.fetch=original;db.close();}
  }
  await test('busy Academy fixture has five Programs, two Courses and 200 learners in the shared lesson',()=>use(async({db,env})=>{
    assert.equal(db.prepare("SELECT count(*) n FROM activities WHERE kind='PROGRAM'").get().n,5);assert.equal(db.prepare("SELECT count(*) n FROM activities WHERE kind='COURSE'").get().n,2);
    assert.deepEqual(db.prepare('SELECT legacy_access_model FROM course_settings ORDER BY activity_key').all().map(r=>r.legacy_access_model),['FREE','PAID']);
    assert.equal(db.prepare("SELECT count(*) n FROM class_memberships WHERE activity_key='PROGRAM:PRG-11111111-1111-4111-8111-111111111111'").get().n,200);
    globalThis.fetch=async(url,init)=>{
      assert.equal(new URL(url).hostname,workerName+'.example.workers.dev');
      const profile=profileD1(env.ACADEMY_DB),response=await worker.fetch(new Request(url,init),{...env,ACADEMY_DB:profile.binding});
      const headers=new Headers(response.headers);headers.set('X-Test-D1-Calls',String(profile.metrics.calls));headers.set('X-Test-D1-Statements',String(profile.metrics.statements));
      return new Response(response.body,{status:response.status,headers});
    };
    const report=await exercisePeak('https://'+workerName+'.example.workers.dev',input);assert.equal(report.sequential.failed,0);
    for(const [count,burst] of Object.entries(report.bursts)) {
      assert.equal(burst.succeeded,Number(count));assert.equal(burst.failed,0,JSON.stringify(burst.failures));
      for(const [stage,calls] of Object.entries({check:2,login:3,session:2,home:3}))assert.equal(burst.stages[stage].calls.max,calls);
      assert.equal(Object.values(burst.stages).reduce((sum,s)=>sum+s.statements.max,0),30);
    }
    // Native SQLite is a correctness/query-budget test, not hosted capacity.
  }));
  await test('request-local optimization retains immediate revocation, enrolment and paid-Course changes',()=>use(async({db,post,login})=>{
    const token=await login(1),home=async()=>{const r=await post('/api/academy/entrance',{startDate:'2026-10-01'},token);assert.equal(r.status,200);return r.data;};
    const before=await home();assert.equal(before.activities.length,7);assert.equal(before.timetable.length,49);assert.ok(before.personalTimetable.some(s=>s.activityId==='subject-2'));
    db.prepare(`INSERT INTO course_subscription_decisions(account_id,activity_key,active,revision,updated_at,updated_by_account_id) VALUES('account-0002','COURSE:subject-2',0,1,?,'account-0001')`).run(new Date().toISOString());
    assert.ok(!(await home()).personalTimetable.some(s=>s.activityId==='subject-2'));
    db.exec("UPDATE class_memberships SET active=0 WHERE account_id='account-0002' AND activity_key='PROGRAM:PRG-11111111-1111-4111-8111-111111111111'");
    assert.ok(!(await home()).personalTimetable.some(s=>s.activityId==='PRG-11111111-1111-4111-8111-111111111111'));
    db.exec("UPDATE account_sessions SET revoked_at='2026-10-10' WHERE account_id='account-0002'");assert.equal((await post('/api/account/session',{},token)).status,401);
    const renewed=await login(1);db.exec("UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id='account-0002'");assert.equal((await post('/api/account/session',{},renewed)).status,401);
    const newest=await login(1);db.exec("UPDATE accounts SET active=0 WHERE account_id='account-0002'");assert.equal((await post('/api/account/session',{},newest)).status,401);
  }));
  await test('new requests reject stale import readiness and invalid timetable dates',()=>use(async({db,post,login})=>{
    const token=await login(1);
    for(const startDate of ['2026-02-30','2026-13-01','invalid'])assert.equal((await post('/api/academy/entrance',{startDate},token)).status,400);
    db.prepare('UPDATE course_workflow_imports SET source_sha256=?').run('f'.repeat(64));const unavailable=await post('/api/academy/entrance',{},token);assert.equal(unavailable.status,503);assert.equal(unavailable.data.code,'ACTIVATION_REQUIRED');
  }));
  await test('an explicit administrator review persists an unknown Course policy as paid',()=>use(async({db,post,login})=>{
    const token=await login(0);db.exec("UPDATE course_settings SET legacy_access_model='UNKNOWN' WHERE activity_key='COURSE:subject-2'");
    const before=await post('/api/admin/platform/global/get',{},token);assert.equal(before.status,200);
    const reviewed=await post('/api/admin/platform/global/policy/save',{subjectId:'subject-2',accessModel:'SUBSCRIPTION',workflowRevision:before.data.workflowRevision,operationId:crypto.randomUUID()},token);assert.equal(reviewed.status,200);
    const policy=db.prepare("SELECT legacy_access_model,policy_review_state FROM course_settings WHERE activity_key='COURSE:subject-2'").get();assert.equal(policy.legacy_access_model,'PAID');assert.equal(policy.policy_review_state,'CONFIRMED');
    const grant=await post('/api/admin/platform/global/access/save',{accountId:'account-0151',subjectId:'subject-2',active:true,workflowRevision:reviewed.data.workflowRevision,operationId:crypto.randomUUID()},token);assert.equal(grant.status,200);
  }));
}finally{rmSync(directory,{recursive:true,force:true});}
