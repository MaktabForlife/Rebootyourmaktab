import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openLibraryFixture} from './fixtures/academy-d1-open-library-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {CORE_ACTIVATION_CHECKS} from '../src/academy/d1/activation-policy.js';
import {activationFacts,buildCoreActivationPlan,applyCoreActivationLocally} from '../tools/academy-migration/activation.mjs';
import {createSessionToken} from '../src/lib/auth.js';
import worker from '../src/worker.js';
import {validateHostedCoreTarget,prepareHostedCore,exerciseHostedCore} from '../tools/academy-d1-hosted-core.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nativeBinding} from './fixtures/academy-d1-fixture.mjs';

async function post(env,path,input={},token='') {
  const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
  return {status:response.status,body:await response.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const review=db=>({reviewId:crypto.randomUUID(),sourceSha256:db.prepare('SELECT source_snapshot_sha256 FROM migration_runs').get().source_snapshot_sha256,
  codeCommit:'0'.repeat(40),libraryMode:'PUBLIC_ONLY',evidence:Object.fromEntries(CORE_ACTIVATION_CHECKS.map(check=>[check,{status:'PASS',reference:'SYNTHETIC TEST ONLY: '+check}]))});
const active=(env,db)=>({...env,ACADEMY_D1_MODE:'ACTIVE',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ACADEMY_D1_RUN_ID:db.prepare('SELECT run_id FROM migration_runs').get().run_id});
async function use(fn) {
  const f=await openLibraryFixture(),original=globalThis.fetch;let outbound=0;
  globalThis.fetch=async()=>{outbound++;throw Error('No external requests allowed');};
  try{await fn(f);assert.equal(outbound,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally{globalThis.fetch=original;f.db.close();f.metadata.close();}
}

test('activation needs explicit evidence and cannot be enabled by an environment flag',()=>use(async({env,db})=>{
  const before=activationFacts(db).fingerprint,plan=buildCoreActivationPlan(db,{libraryMode:'PUBLIC_ONLY'});
  assert.equal(plan.readyToApply,false);assert.equal(plan.statements.length,0);
  for(const check of CORE_ACTIVATION_CHECKS)assert.ok(plan.blockers.includes('EVIDENCE_REQUIRED:'+check));
  assert.throws(()=>applyCoreActivationLocally(db,plan),/REVIEW_INCOMPLETE/);
  assert.equal(activationFacts(db).fingerprint,before);
  const premature=await post(active(env,db),'/api/account/check',{uniqueid:'login-0002'});
  assert.equal(premature.status,503);assert.equal(premature.body.code,'ACTIVATION_REQUIRED');
  assert.equal((await worker.fetch(new Request('https://academy.invalid/api/health'),active(env,db))).status,503);
  assert.equal((await post({...active(env,db),ACADEMY_LIBRARY_MODE:undefined},'/api/account/check',{uniqueid:'login-0002'})).status,503);
}));

test('reviewed activation is atomic, auditable, replayable and invalidates staging sessions',()=>use(async({env,db})=>{
  const old=await login(env,'0002'),credentials=db.prepare('SELECT * FROM account_credentials ORDER BY account_id').all(),roles=db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all();
  const plan=buildCoreActivationPlan(db,review(db));assert.equal(plan.readyToApply,true,JSON.stringify(plan.blockers));
  const result=applyCoreActivationLocally(db,plan);assert.equal(result.runId,plan.runId);
  assert.equal(applyCoreActivationLocally(db,plan).replayed,true);
  assert.equal(db.prepare("SELECT count(*) n FROM migration_checks WHERE dataset_key='ACTIVATION' AND status='PASS'").get().n,CORE_ACTIVATION_CHECKS.length);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='ACTIVATE_CORE_D1'").get().n,1);
  assert.equal(db.prepare("SELECT count(*) n FROM data_ownership WHERE authoritative_store<>'D1' OR phase<>'ACTIVE'").get().n,0);
  assert.deepEqual(db.prepare('SELECT * FROM account_credentials ORDER BY account_id').all(),credentials);
  assert.deepEqual(db.prepare('SELECT * FROM role_assignments ORDER BY assignment_id').all(),roles);
  assert.equal((await post(env,'/api/account/check',{uniqueid:'login-0002'})).status,503,'Rehearsal rejects active ownership');
  const live=active(env,db);assert.equal((await post(live,'/api/account/session',{},old)).status,401);
  const signed=await login(live,'0002');assert.equal(ok(await post(live,'/api/academy/entrance',{},signed)).signedIn,true);
  const health=await worker.fetch(new Request('https://academy.invalid/api/health'),live);assert.equal(health.status,200);assert.equal((await health.json()).store,'D1_ACTIVE');
  assert.equal((await post({...live,ACADEMY_D1_RUN_ID:'wrong-run'},'/api/account/session',{},signed)).status,503);
  db.prepare("UPDATE data_ownership SET phase='RECOVERY' WHERE scope_key=?").run('PROGRAM:'+PROGRAM_IDS[0]);
  assert.equal((await post(live,'/api/account/session',{},signed)).body.code,'ACTIVATION_REQUIRED');
}));

test('failed or stale activation leaves ownership, sessions and evidence unchanged',()=>use(async({env,db})=>{
  const initial=activationFacts(db).fingerprint;
  db.exec("CREATE TRIGGER fail_cutover_audit BEFORE INSERT ON audit_events WHEN NEW.action='ACTIVATE_CORE_D1' BEGIN SELECT RAISE(ABORT,'Synthetic cutover failure'); END");
  let plan=buildCoreActivationPlan(db,review(db));assert.throws(()=>applyCoreActivationLocally(db,plan),/cutover failure/);
  db.exec('DROP TRIGGER fail_cutover_audit');assert.equal(activationFacts(db).fingerprint,initial);
  plan=buildCoreActivationPlan(db,review(db));await login(env,'0002');assert.throws(()=>applyCoreActivationLocally(db,plan),/DATABASE_CHANGED/);
  assert.equal(db.prepare('SELECT state FROM migration_runs').get().state,'IMPORTED');
  assert.equal(db.prepare("SELECT count(*) n FROM account_sessions WHERE revoked_at IS NULL").get().n,1);
  assert.equal(db.prepare("SELECT count(*) n FROM migration_checks WHERE dataset_key='ACTIVATION'").get().n,0);
}));

test('core Library mode exposes only public material and rejects every compatibility private-file path',()=>use(async({env,db})=>{
  const live=active(env,db),plan=buildCoreActivationPlan(db,review(db));applyCoreActivationLocally(db,plan);
  Object.assign(env,live); // The coordinator receives the deployed Worker's environment too.
  const student=await login(live,'0002'),admin=await login(live);
  const data=ok(await post(live,'/api/academy/library/catalogue',{},student));assert.deepEqual(data.resources,[]);assert.equal(data.mediaSubscriptionsAvailable,false);assert.equal(data.libraryMode,'PUBLIC_ONLY');assert.ok(data.learningAreaRefs.length);
  const publicResponse=await worker.fetch(new Request('https://academy.invalid/api/academy/open-library/metadata/public'),live);assert.equal(publicResponse.status,200);
  const book={id:'EXTERNAL:INTERNET_ARCHIVE:synthetic-core-book',title:'Synthetic public book',subjectRef:'GLOBAL:subject-1',moduleRef:'GLOBAL:module-1',learningAreaRefs:['GLOBAL:subject-1'],baseRevision:0};
  ok(await post(live,'/api/academy/open-library/metadata/save',book,admin));
  assert.equal((await (await worker.fetch(new Request('https://academy.invalid/api/academy/open-library/metadata/public'),live)).json()).records.length,1);
  const ticket=await createSessionToken({purpose:'academy-d1-file',sid:'old-ticket',accountid:'account-0002',epoch:1,resourceKey:'PROGRAM:private:file',expiresAt:Date.now()+60000},live);
  for(const method of ['GET','HEAD'])assert.equal((await worker.fetch(new Request('https://academy.invalid/api/academy/d1/library/file?access='+encodeURIComponent(ticket),{method}),live)).status,403);
  for(const path of ['/api/academy/library/access','/api/academy/library/cover','/api/program-library/catalogue','/api/program-library/access',
    '/api/admin/platform/program-library/upload-start','/api/admin/platform/program-library/upload-chunk','/api/admin/platform/program-library/folder-set',
    '/api/admin/platform/program-timetable/prepare-library',
    '/api/platform/global/resources/access','/api/admin/platform/global/resource/save','/api/admin/platform/global/resources/batch-save','/api/admin/platform/global/drive-root/save']) {
    const response=await post(live,path,{resourceId:'private'},admin);assert.equal(response.status,403,path);assert.equal(response.body.code,'PRIVATE_MEDIA_NOT_ENABLED');
  }
  assert.equal((await post(live,'/api/admin/platform/program-timetable/manage-save',{kind:'resources'},admin)).body.code,'PRIVATE_MEDIA_NOT_ENABLED');
  assert.equal(db.prepare('SELECT count(*) n FROM course_subscription_decisions').get().n,0);
}));

test('new Programs and Courses inherit the active database ownership',()=>use(async({env,db})=>{
  applyCoreActivationLocally(db,buildCoreActivationPlan(db,review(db)));const live=active(env,db),admin=await login(live);
  const id='PRG-'+crypto.randomUUID(),input={id,name:'Synthetic active-store Program',durationYears:1,timezone:'Africa/Johannesburg',status:'DRAFT',operationId:crypto.randomUUID()};
  const created=ok(await post(live,'/api/admin/platform/programs/create',input,admin));
  ok(await post(live,'/api/admin/platform/programs/save',{...input,status:'ACTIVE',revision:created.program.revision,operationId:crypto.randomUUID()},admin));
  const before=ok(await post(live,'/api/admin/platform/global/get',{},admin));
  const saved=ok(await post(live,'/api/admin/platform/global/subjects/save-batch',{subjects:[{clientKey:'new-course',subjectName:'Synthetic new Course',active:true,accessModel:'SUBSCRIPTION'}],
    modules:[],globalCurriculumVersion:before.globalCurriculumVersion,workflowRevision:before.workflowRevision,operationId:crypto.randomUUID()},admin));
  for(const key of ['PROGRAM:'+id,'COURSE:'+saved.subjects[0].subjectid]) {
    const row=db.prepare("SELECT * FROM data_ownership WHERE dataset_key='ACADEMY' AND scope_key=?").get(key);assert.equal(row.authoritative_store,'D1');assert.equal(row.phase,'ACTIVE');assert.equal(row.verified_run_id,live.ACADEMY_D1_RUN_ID);
  }
  ok(await post(live,'/api/academy/entrance',{},admin));
}));

test('failed checks, wrong source and missing evidence cannot produce an activation plan',()=>use(async({db})=>{
  const r=review(db);r.sourceSha256='f'.repeat(64);delete r.evidence.BROWSER_ACCEPTANCE;
  let plan=buildCoreActivationPlan(db,r);assert.ok(plan.blockers.includes('SOURCE_SNAPSHOT_MISMATCH'));assert.ok(plan.blockers.includes('EVIDENCE_REQUIRED:BROWSER_ACCEPTANCE'));assert.deepEqual(plan.statements,[]);
  db.exec("UPDATE migration_checks SET status='FAIL' WHERE check_name='AUTHORIZATION_PARITY'");
  plan=buildCoreActivationPlan(db,review(db));assert.ok(plan.blockers.includes('FAILED_MIGRATION_CHECK'));
}));

test('maintenance pauses requests before authentication, database access or Sheets fallback',()=>use(async({env,db})=>{
  const before=activationFacts(db).fingerprint;
  for(const path of ['/api/account/login','/api/academy/entrance','/api/admin/platform/programs/create']) {
    const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',body:'{}'}),{...env,ACADEMY_D1_MODE:'PAUSED',ACADEMY_DB:undefined});
    assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'60');assert.equal((await response.json()).code,'ACADEMY_STORAGE_PAUSED');
  }
  assert.equal(activationFacts(db).fingerprint,before);
  const plan=buildCoreActivationPlan(db,review(db));plan.statements[1].sql='DELETE FROM accounts';
  assert.throws(()=>applyCoreActivationLocally(db,plan),/ARTIFACT_CHANGED/);
}));

test('hosted rehearsal tooling rejects main targets and installs only a verified synthetic fixture',async()=>{
  const workerName='academy-d1-core-test-20261010-12345678',databaseId='00000000-0000-4000-8000-000000000009';
  assert.throws(()=>validateHostedCoreTarget({workerName,databaseId:'7e732b79-a72f-4da6-be83-524919c49ba4'}),/TEST_DATABASE_REQUIRED/);
  for(const name of ['devrebootworker','rebootworker','academy-d1-core-test'])assert.throws(()=>validateHostedCoreTarget({workerName:name,databaseId}),/TEST_WORKER_REQUIRED/);
  const directory=mkdtempSync(join(tmpdir(),'maktab-hosted-core-test-')),original=globalThis.fetch;let db;
  try {
    const repo=new URL('../../',import.meta.url).pathname;
    const prepared=await prepareHostedCore({directory,databaseId,workerName,accountId:'0'.repeat(32),repo});
    assert.equal(prepared.syntheticAccounts,200);assert.equal(prepared.tables,62);
    const config=JSON.parse(readFileSync(join(directory,'wrangler.json'),'utf8')),input=JSON.parse(readFileSync(join(directory,'test-input.json'),'utf8'));
    const secrets=JSON.parse(readFileSync(join(directory,'test-secrets.json'),'utf8'));assert.notEqual(secrets.PIN_SECRET,'synthetic-pin-secret');
    db=new DatabaseSync(join(directory,'synthetic.sqlite'));
    const env={...config.vars,...secrets,ACADEMY_DB:nativeBinding(db),AUTH_LOGIN_RATE_LIMITER:{limit:async()=>({success:true})},
      PROGRAM_TIMETABLE_COORDINATOR:{getByName:()=>({openLibraryMetadataList:async()=>[]})}};
    globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,workerName+'.example.workers.dev');return worker.fetch(new Request(url,options),env);};
    const result=await exerciseHostedCore('https://'+workerName+'.example.workers.dev',input);
    // This transport adapter is native/local, never evidence of hosted capacity.
    assert.equal(result.succeededFlows,200,JSON.stringify(result.failures));assert.equal(result.failedFlows,0);assert.equal(result.coreRoleAndSecurityChecks,'PASS');assert.equal(result.publicLibrary,'PASS');
    await assert.rejects(exerciseHostedCore('https://devrebootworker.example.workers.dev',input),/TEST_ORIGIN_REQUIRED/);
  }finally{globalThis.fetch=original;db?.close();rmSync(directory,{recursive:true,force:true});}
});
