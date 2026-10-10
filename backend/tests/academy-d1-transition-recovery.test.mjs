import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {openLibraryFixture} from './fixtures/academy-d1-open-library-fixture.mjs';
import {nativeBinding} from './fixtures/academy-d1-fixture.mjs';
import {CORE_ACTIVATION_CHECKS} from '../src/academy/d1/activation-policy.js';
import {activationFacts,buildCoreActivationPlan} from '../tools/academy-migration/activation.mjs';
import {activationArtifactDigest,applyCoreActivationD1,syntheticTransitionWorker} from '../tools/academy-migration/remote-activation.mjs';
import {atomicSnapshotGuard} from '../tools/academy-migration/atomic-snapshot.mjs';
import {captureRecoverySnapshot,restoreRecoverySnapshot,recoveryDelta,recoverySQL,snapshotFromReadback} from '../tools/academy-migration/recovery.mjs';
import worker from '../src/worker.js';
import {mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recoveryCommand} from '../tools/academy-d1-recovery.mjs';

const databaseId='00000000-0000-4000-8000-000000000009';
const review=db=>({reviewId:crypto.randomUUID(),sourceSha256:db.prepare('SELECT source_snapshot_sha256 FROM migration_runs').get().source_snapshot_sha256,
  codeCommit:'0'.repeat(40),libraryMode:'PUBLIC_ONLY',evidence:Object.fromEntries(CORE_ACTIVATION_CHECKS.map(check=>[check,{status:'PASS',reference:'SYNTHETIC ONLY: '+check}]))});
const planFor=db=>buildCoreActivationPlan(db,review(db));
const apply=async(binding,plan)=>applyCoreActivationD1(binding,plan,{expectedArtifactSha256:await activationArtifactDigest(plan)});
const snapshot=db=>captureRecoverySnapshot(db,{databaseId,quiescenceReference:'Native single-writer test transaction'});
async function use(fn){const f=await openLibraryFixture();try{await fn(f);}finally{f.db.close();f.metadata.close();}}
const count=(db,table)=>db.prepare('SELECT count(*) n FROM '+table).get().n;

test('remote activation commits one batch, replays concurrent retries and handles a lost acknowledgement',()=>use(async({db})=>{
  const plan=planFor(db),native=nativeBinding(db);let batches=0;
  const session={...native,batch:async statements=>{batches++;const result=await native.batch(statements);if(batches===1)throw Error('Lost acknowledgement');return result;}};
  const results=await Promise.all([apply({withSession:()=>session},plan),apply({withSession:()=>session},plan)]);
  assert.ok(results.every(r=>r.activationId===plan.reviewId));assert.equal(count(db,'academy_write_guards'),0);
  assert.equal(db.prepare("SELECT count(*) n FROM audit_events WHERE action='ACTIVATE_CORE_D1'").get().n,1);
  assert.equal(count(db,'operation_receipts'),1);assert.equal((await apply(native,plan)).replayed,true);
  assert.equal(db.prepare("SELECT count(*) n FROM data_ownership WHERE authoritative_store='D1' AND phase='ACTIVE'").get().n,count(db,'activities'));
}));

test('remote activation rejects content or schema changes even when the write version is unchanged',()=>use(async({db})=>{
  for(const sql of ["UPDATE accounts SET display_name='Changed outside the app' WHERE account_id='account-0002'",
    "UPDATE account_credentials SET pin_hash='changed' WHERE account_id='account-0002'",
    "CREATE VIEW unexpected_view AS SELECT account_id FROM accounts"]) {
    const plan=planFor(db),version=db.prepare('SELECT version FROM academy_write_state').get().version;db.exec(sql);
    const before=activationFacts(db).fingerprint;assert.equal(db.prepare('SELECT version FROM academy_write_state').get().version,version);
    await assert.rejects(apply(nativeBinding(db),plan),/BATCH_REJECTED/);assert.equal(activationFacts(db).fingerprint,before);
    assert.equal(count(db,'operation_receipts'),0);assert.equal(count(db,'academy_write_guards'),0);
  }
}));

test('a late activation failure rolls back ownership, checks, sessions, audit and receipt',()=>use(async({db})=>{
  db.exec("CREATE TRIGGER fail_activation BEFORE INSERT ON audit_events WHEN NEW.action='ACTIVATE_CORE_D1' BEGIN SELECT RAISE(ABORT,'Synthetic failure'); END");
  const before=activationFacts(db).fingerprint,plan=planFor(db);
  await assert.rejects(apply(nativeBinding(db),plan),/BATCH_REJECTED/);assert.equal(activationFacts(db).fingerprint,before);
  assert.equal(count(db,'academy_write_guards'),0);assert.equal(db.prepare('SELECT state FROM migration_runs').get().state,'IMPORTED');
}));

test('pinned artifacts and test controller reject tampering, missing evidence and unauthorized SQL before D1 access',()=>use(async({db})=>{
  const plan=planFor(db),hash=await activationArtifactDigest(plan),queries=[],binding=nativeBinding(db,queries);
  const changed=structuredClone(plan);changed.statements[0].params[0]='changed';
  await assert.rejects(applyCoreActivationD1(binding,changed,{expectedArtifactSha256:hash}),/ARTIFACT_CHANGED/);
  const incomplete=structuredClone(plan);incomplete.evidence.BROWSER_ACCEPTANCE.status='PENDING';
  await assert.rejects(apply(binding,incomplete),/REVIEW_INCOMPLETE/);
  assert.throws(()=>syntheticTransitionWorker(plan,{databaseId:'7e732b79-a72f-4da6-be83-524919c49ba4',artifactSha256:hash}),/SYNTHETIC_TARGET/);
  const controller=syntheticTransitionWorker(plan,{databaseId,artifactSha256:hash}),token='a'.repeat(64);
  const env={TEST_DATABASE_ID:databaseId,TRANSITION_ENABLED:'SYNTHETIC_ONLY',TRANSITION_TOKEN:token,ACADEMY_DB:binding};
  for(const [headers,body,status] of [[{},undefined,401],[{Authorization:'Bearer bad'},undefined,401],
    [{Authorization:'Bearer '+token,Origin:'https://academy.invalid'},undefined,403],
    [{Authorization:'Bearer '+token},JSON.stringify({sql:'DELETE FROM accounts'}),400]]) {
    assert.equal((await controller.fetch(new Request('https://test.invalid/activate',{method:'POST',headers,body}),env)).status,status);
  }
  assert.equal(queries.length,0);
  const response=await controller.fetch(new Request('https://test.invalid/activate',{method:'POST',headers:{Authorization:'Bearer '+token},body:new ReadableStream({start(controller){controller.close();}}),duplex:'half'}),env);
  assert.equal(response.status,200);assert.equal((await response.json()).success,true);
}));

test('SQL snapshot guards support wide tables, nulls, Unicode and duplicate rows',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE wide ('+Array.from({length:70},(_,i)=>'c'+i+' TEXT').join(',')+');CREATE TABLE academy_write_guards(guard_id TEXT,accepted INTEGER NOT NULL CHECK(accepted=1))');
    const values=Array.from({length:70},(_,i)=>i%3?"﷽ quote' and \"\n":null);
    db.prepare('INSERT INTO wide VALUES('+values.map(()=>'?').join(',')+')').run(...values);
    const guard=atomicSnapshotGuard(db);assert.equal(guard.params.length,3);
    db.prepare('INSERT INTO academy_write_guards VALUES(?, '+guard.condition+')').run('test',...guard.params);
    db.exec('DELETE FROM academy_write_guards;INSERT INTO wide SELECT * FROM wide');
    assert.throws(()=>db.prepare('INSERT INTO academy_write_guards VALUES(?, '+guard.condition+')').run('stale',...guard.params),/CHECK constraint/);
  }finally{db.close();}
});

test('recovery preserves new runtime writes, changed credentials, grants, deletions and all audit history',()=>use(async({db,env})=>{
  db.exec("UPDATE course_settings SET legacy_access_model='PAID';UPDATE course_run_access SET access_model='PAID'");
  await apply(nativeBinding(db),planFor(db));Object.assign(env,{ACADEMY_D1_MODE:'ACTIVE',ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',ACADEMY_D1_RUN_ID:db.prepare('SELECT run_id FROM migration_runs').get().run_id});
  const baseline=snapshot(db);
  const post=async(path,input={},token='',expected=200)=>{
    const response=await worker.fetch(new Request('https://test.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);
    const body=await response.json();assert.equal(response.status,expected,body.code||body.error);return body;
  };
  const admin=(await post('/api/account/login',{uniqueid:'login-0001',pin:'1234'})).token;
  const directory=await post('/api/admin/platform/user-profiles/get',{},admin),id=crypto.randomUUID();
  await post('/api/admin/platform/user-profiles/save',{mode:'profile',accountId:id,displayName:"New learner ﷽ O'Neil",active:true,creating:true,baseRevision:directory.emptyRevision,operationId:crypto.randomUUID()},admin);
  let view=await post('/api/admin/platform/global/get',{},admin);
  view=await post('/api/admin/platform/global/access/save',{accountId:'account-0002',subjectId:'subject-1',active:true,workflowRevision:view.workflowRevision,operationId:crypto.randomUUID()},admin);
  await post('/api/admin/platform/global/access/save',{accountId:'account-0002',subjectId:'subject-1',active:false,workflowRevision:view.workflowRevision,operationId:crypto.randomUUID()},admin);
  const account=(await post('/api/academy/d1/accounts/read',{accountId:'account-0002'},admin)).account;
  await post('/api/academy/d1/accounts/reset-pin',{accountId:account.accountId,credentialEpoch:account.credentialEpoch},admin);
  await post('/api/account/setup-pin',{uniqueid:'login-0002',pin:'2345',pinConfirmation:'2345'});
  db.exec("DELETE FROM course_subscription_decisions WHERE account_id='account-0002'"); // Explicit deletion also survives recovery.
  const latest=snapshot(db),delta=recoveryDelta(baseline,latest);
  assert.equal(delta.automaticSheetsRollbackAllowed,false);assert.equal(delta.tables.accounts.after,delta.tables.accounts.before+1);
  assert.ok(delta.tables.account_credentials.addedRows);assert.ok(delta.tables.account_credentials.removedRows);assert.ok(delta.tables.audit_events.addedRows);
  assert.equal(latest.fingerprint,activationFacts(db).fingerprint);
  for(let i=0;i<2;i++) {
    const restored=new DatabaseSync(':memory:');try {
      assert.equal(restoreRecoverySnapshot(restored,latest).fingerprint,latest.fingerprint);
      assert.equal(activationFacts(restored).fingerprint,latest.fingerprint);
      assert.deepEqual(restored.prepare('SELECT * FROM account_credentials ORDER BY account_id').all(),db.prepare('SELECT * FROM account_credentials ORDER BY account_id').all());
      assert.equal(count(restored,'course_subscription_decisions'),0);assert.equal(count(restored,'audit_events'),count(db,'audit_events'));
      assert.throws(()=>restoreRecoverySnapshot(restored,latest),/EMPTY_DESTINATION/);
    }finally{restored.close();}
  }
  await post('/api/account/login',{uniqueid:'login-0002',pin:'1234'},'',401);
  await post('/api/account/login',{uniqueid:'login-0002',pin:'2345'});
  const tampered=structuredClone(latest);tampered.tables.accounts[0].display_name='tampered';
  assert.throws(()=>recoverySQL(tampered),/ARTIFACT_CHANGED/);
  const other=snapshotFromReadback(latest.schema,latest.tables,{databaseId:crypto.randomUUID(),quiescenceReference:'Different synthetic DB'});
  assert.throws(()=>recoveryDelta(baseline,other),/TARGET_MISMATCH/);
}));

test('recovery delta counts deletions and duplicate rows, and offline commands keep credentials private',()=>{
  const directory=mkdtempSync(join(tmpdir(),'academy-recovery-')),path=join(directory,'source.sqlite'),db=new DatabaseSync(path);
  try {
    db.exec('CREATE TABLE data(value TEXT);');db.prepare('INSERT INTO data VALUES(?)').run("Private ﷽ O'Neil\0value");db.exec('INSERT INTO data SELECT * FROM data');
    const before=snapshot(db);db.exec('DELETE FROM data WHERE rowid=1');const after=snapshot(db),delta=recoveryDelta(before,after);
    assert.deepEqual(delta.tables.data,{before:2,after:1,addedRows:0,removedRows:1});
    writeFileSync(join(directory,'before.json'),JSON.stringify(before),{mode:0o600});
    const captured=recoveryCommand('capture-local',{database:path,'database-id':databaseId,'quiescence-reference':'Only test writer stopped',output:join(directory,'after.json')});
    assert.equal(captured.fingerprint,after.fingerprint);assert.equal(statSync(join(directory,'after.json')).mode&0o777,0o600);
    assert.throws(()=>recoveryCommand('capture-local',{database:path,'database-id':databaseId,'quiescence-reference':'Test',output:join(directory,'after.json')}),/EEXIST/);
    const destination=join(directory,'restored.sqlite');assert.equal(recoveryCommand('restore-local',{database:destination,snapshot:join(directory,'after.json')}).restored,true);
    assert.equal(statSync(destination).mode&0o777,0o600);
    const restored=new DatabaseSync(destination);try{assert.equal(restored.prepare('SELECT value FROM data').get().value,"Private ﷽ O'Neil\0value");}finally{restored.close();}
    recoveryCommand('export-sql',{snapshot:join(directory,'after.json'),output:join(directory,'restore.sql')});
    assert.ok(readFileSync(join(directory,'restore.sql'),'utf8').includes('CAST(X'));
    const report=recoveryCommand('compare',{baseline:join(directory,'before.json'),latest:join(directory,'after.json'),output:join(directory,'delta.json')});
    assert.equal(report.tables.data.removedRows,1);assert.ok(!JSON.stringify(report).includes('Private'));
  }finally{db.close();rmSync(directory,{recursive:true,force:true});}
});

test('recovery exports parents first and refuses invalid, oversized or cyclic restores',()=>{
  const db=new DatabaseSync(':memory:'),restored=new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON;CREATE TABLE z_parent(id TEXT PRIMARY KEY);CREATE TABLE a_child(id TEXT REFERENCES z_parent(id));INSERT INTO z_parent VALUES(\'p\');INSERT INTO a_child VALUES(\'p\')');
    const good=snapshot(db),sql=recoverySQL(good);assert.ok(sql.indexOf('INSERT INTO "z_parent"')<sql.indexOf('INSERT INTO "a_child"'));
    restored.exec('PRAGMA foreign_keys=ON');restored.exec(sql);assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
    db.exec('PRAGMA foreign_keys=OFF;UPDATE a_child SET id=\'missing\'');
    const bad=snapshot(db),empty=new DatabaseSync(':memory:');try{assert.throws(()=>restoreRecoverySnapshot(empty,bad),/FOREIGN KEY|INTEGRITY/);assert.equal(count(empty,'sqlite_schema'),0);}finally{empty.close();}
    db.exec('CREATE TABLE huge(value TEXT)');db.prepare('INSERT INTO huge VALUES(?)').run('x'.repeat(100001));assert.throws(()=>recoverySQL(snapshot(db)),/STATEMENT_LIMIT/);
    db.exec('DROP TABLE huge;CREATE TABLE cycle_one(id TEXT PRIMARY KEY,other TEXT REFERENCES cycle_two(id));CREATE TABLE cycle_two(id TEXT PRIMARY KEY,other TEXT REFERENCES cycle_one(id))');
    assert.throws(()=>recoverySQL(snapshot(db)),/CYCLIC_SCHEMA/);
  }finally{db.close();restored.close();}
});
