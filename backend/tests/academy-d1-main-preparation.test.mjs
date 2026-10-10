import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {flowFixture,nativeBinding} from './fixtures/academy-d1-fixture.mjs';
import {buildOperationalImport,importOperationalPlan} from '../tools/academy-migration/operational.mjs';
import {buildLearningImport,importLearningPlan} from '../tools/academy-migration/learning.mjs';
import {buildCourseCalendarImport,importCourseCalendarPlan} from '../tools/academy-migration/course-calendar.mjs';
import {buildStagingUpgradePlan,applyStagingUpgradeLocally,validateStagingUpgradePlan} from '../tools/academy-migration/staging-upgrade.mjs';
import {activationFacts,buildCoreActivationPlan} from '../tools/academy-migration/activation.mjs';
import {CORE_ACTIVATION_CHECKS} from '../src/academy/d1/activation-policy.js';
import {buildMainTransitionArtifact,applyMainTransitionD1,mainTransitionDigest,reviewedMainTransitionWorker} from '../tools/academy-migration/remote-main-transition.mjs';
import {captureRecoverySnapshot,restoreRecoverySnapshot} from '../tools/academy-migration/recovery.mjs';
import {sha256,stableJSON} from '../tools/academy-migration/snapshot.mjs';
import {prepareMainDatabase} from '../tools/academy-d1-main-preparation.mjs';

const databaseId='00000000-0000-4000-8000-000000000009';
const extension=name=>readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8');
const snapshot=db=>captureRecoverySnapshot(db,{databaseId,quiescenceReference:'Synthetic single-writer fixture'});
const fingerprint=db=>activationFacts(db).fingerprint;
async function fixture() {
  const {snapshot:source,policy}=await flowFixture(12),base=await buildOperationalImport(source,policy);
  const before=new DatabaseSync(':memory:'),after=new DatabaseSync(':memory:');importOperationalPlan(before,base);restoreRecoverySnapshot(after,snapshot(before));
  after.exec(extension('0004_management_transactions.sql'));after.exec(extension('0005_learning_workflows.sql'));
  importLearningPlan(after,buildLearningImport(source,base));after.exec(extension('0006_course_calendar_workflows.sql'));
  importCourseCalendarPlan(after,buildCourseCalendarImport(source,base));after.exec(extension('0007_course_subscriptions.sql'));
  const options={databaseId,codeCommit:'a'.repeat(40),sourceSha256:sha256(source)};
  return {before,after,source,policy,options,plan:buildStagingUpgradePlan(before,after,options),close(){before.close();after.close();}};
}

test('additive staging upgrade preserves every existing row and applies/replays an exact 45-to-62 table upgrade',async()=>{
  const f=await fixture();try {
    assert.equal(f.plan.beforeTables,45);assert.equal(f.plan.afterTables,62);assert.equal(f.plan.liveExecutionApproved,false);
    const credentials=f.before.prepare('SELECT * FROM account_credentials').all(),roles=f.before.prepare('SELECT * FROM role_assignments').all();
    assert.equal(applyStagingUpgradeLocally(f.before,f.plan).replayed,false);
    assert.equal(fingerprint(f.before),fingerprint(f.after));assert.equal(applyStagingUpgradeLocally(f.before,f.plan).replayed,true);
    assert.deepEqual(f.before.prepare('SELECT * FROM account_credentials').all(),credentials);
    assert.deepEqual(f.before.prepare('SELECT * FROM role_assignments').all(),roles);
    assert.deepEqual(f.before.prepare('SELECT source_role,target_role FROM role_mapping_decisions ORDER BY source_role').all().map(r=>[r.source_role,r.target_role]),[['ADMIN','PROGRAM_ADMIN'],['SENIOR','TEACHER']]);
    assert.equal(f.before.prepare('SELECT count(*) n FROM data_ownership WHERE authoritative_store=\'D1\'').get().n,0);
    assert.ok(!f.before.prepare("SELECT 1 FROM sqlite_schema WHERE name='academy_staging_upgrade_guard'").get());
  }finally{f.close();}
});

test('SQL-side staging guards reject stale credentials, account edits and schema changes without partial additions',async()=>{
  for(const sql of ["UPDATE account_credentials SET pin_hash='changed' WHERE account_id='account-0002'",
    "UPDATE accounts SET display_name='Direct edit' WHERE account_id='account-0002'",
    "CREATE VIEW unexpected_view AS SELECT account_id FROM accounts"]) {
    const f=await fixture();try {
      f.before.exec(sql);const initial=fingerprint(f.before),binding=nativeBinding(f.before);
      await assert.rejects(binding.batch(f.plan.statements.map(s=>binding.prepare(s.sql).bind(...s.params))));
      assert.equal(fingerprint(f.before),initial);assert.equal(activationFacts(f.before).names.length,45);
    }finally{f.close();}
  }
});

test('a late failure rolls back new tables, views, triggers and imported rows in one binding batch',async()=>{
  const f=await fixture();try {
    const binding=nativeBinding(f.before),initial=fingerprint(f.before),statements=[...f.plan.statements];
    statements.splice(-1,0,{sql:"INSERT INTO academy_write_guards(guard_id,accepted) VALUES('late-failure',0)",params:[]});
    await assert.rejects(binding.batch(statements.map(s=>binding.prepare(s.sql).bind(...s.params))));
    assert.equal(fingerprint(f.before),initial);assert.equal(activationFacts(f.before).names.length,45);
  }finally{f.close();}
});

test('upgrade refuses changes to existing credentials/authority, missing source rows, used staging state or modified artifacts',async()=>{
  const f=await fixture();try {
    const modified=structuredClone(f.plan);modified.statements[0].sql+=' ';
    assert.throws(()=>validateStagingUpgradePlan(modified),/ARTIFACT_CHANGED/);
    f.after.exec("UPDATE account_credentials SET pin_hash='new hash' WHERE account_id='account-0002'");
    assert.throws(()=>buildStagingUpgradePlan(f.before,f.after,f.options),/NOT_ADDITIVE/);
    assert.throws(()=>buildStagingUpgradePlan(f.before,f.after,{...f.options,sourceSha256:'b'.repeat(64)}),/SOURCE_MISMATCH/);
    f.before.exec("UPDATE migration_runs SET state='VERIFIED'");
    assert.throws(()=>buildStagingUpgradePlan(f.before,f.after,f.options),/UNUSED_SHEETS_STAGING/);
  }finally{f.close();}
});

test('successful binding batch preserves Unicode, quoted snapshot JSON and exact complete candidate content',async()=>{
  const f=await fixture();try {
    f.after.prepare('INSERT INTO academy_settings(setting_key,setting_value) VALUES(?,?)').run('TestUnicode',"﷽ O'Neil\n零\"quoted\"");
    const plan=buildStagingUpgradePlan(f.before,f.after,f.options),binding=nativeBinding(f.before);
    await binding.batch(plan.statements.map(s=>binding.prepare(s.sql).bind(...s.params)));
    assert.equal(fingerprint(f.before),fingerprint(f.after));
    assert.equal(f.before.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='TestUnicode'").get().setting_value,"﷽ O'Neil\n零\"quoted\"");
    const {artifactSha256,...basis}=plan;assert.equal(artifactSha256,createHash('sha256').update(stableJSON(basis)).digest('hex'));
  }finally{f.close();}
});

test('offline preparation verifies backup/upgrade restores, preserves private outputs and leaves every activation check pending',async()=>{
  const f=await fixture(),root=mkdtempSync(join(tmpdir(),'academy-main-preparation-'));try {
    const saved=snapshot(f.before),readback={capturedAt:saved.capturedAt,schema:saved.schema,records:saved.tables},directory=join(root,'package');
    const initial=fingerprint(f.before),report=await prepareMainDatabase({source:f.source,policy:f.policy,readback,directory,codeCommit:f.options.codeCommit});
    assert.equal(fingerprint(f.before),initial);assert.equal(report.beforeTables,45);assert.equal(report.afterTables,62);
    assert.equal(report.preservedTables,45);assert.equal(report.candidateSqlRestores,2);assert.equal(report.activationReady,false);
    assert.equal(report.sourceFrozen,false);assert.equal(report.executableActivationStatements,0);assert.equal(report.activationBlockers.length,8);
    for(const name of ['baseline-backup.json','baseline-restore.sql','candidate-backup.json','candidate-restore.sql','private-additive-upgrade.json','pending-activation.json','preparation-report.json'])assert.equal(statSync(join(directory,name)).mode&0o777,0o600);
    assert.equal(statSync(directory).mode&0o777,0o700);
    const pending=JSON.parse(readFileSync(join(directory,'pending-activation.json'),'utf8'));assert.deepEqual(pending.statements,[]);
    await assert.rejects(prepareMainDatabase({source:f.source,policy:f.policy,readback,directory,codeCommit:f.options.codeCommit}),/EEXIST/);
    const changed=structuredClone(readback);changed.records.account_credentials[0].pin_hash='changed';
    await assert.rejects(prepareMainDatabase({source:f.source,policy:f.policy,readback:changed,directory:join(root,'invalid'),codeCommit:f.options.codeCommit}));
  }finally{f.close();rmSync(root,{recursive:true,force:true});}
});

async function combined(f) {
  const upgrade=buildStagingUpgradePlan(f.before,f.after,{...f.options,databaseId:'7e732b79-a72f-4da6-be83-524919c49ba4'});
  const review={reviewId:crypto.randomUUID(),codeCommit:f.options.codeCommit,sourceSha256:f.options.sourceSha256,libraryMode:'PUBLIC_ONLY',
    evidence:Object.fromEntries(CORE_ACTIVATION_CHECKS.map(name=>[name,{status:'PASS',reference:'SYNTHETIC LOCAL TEST ONLY: '+name}]))};
  const activation=buildCoreActivationPlan(f.after,review);
  return buildMainTransitionArtifact(upgrade,activation);
}
const execute=async(db,artifact)=>applyMainTransitionD1(nativeBinding(db),artifact,{expectedArtifactSha256:await mainTransitionDigest(artifact)});

test('combined main transition is atomic, handles lost acknowledgements and replays once in a local synthetic database',async()=>{
  const f=await fixture();try {
    const artifact=await combined(f),native=nativeBinding(f.before);let batches=0;
    const session={...native,batch:async statements=>{batches++;await native.batch(statements);throw Error('Synthetic lost acknowledgement');}};
    const result=await applyMainTransitionD1({withSession:()=>session},artifact,{expectedArtifactSha256:await mainTransitionDigest(artifact)});
    assert.equal(result.replayed,true);assert.equal(batches,1);assert.equal(activationFacts(f.before).names.length,62);
    assert.equal((await execute(f.before,artifact)).replayed,true);
    assert.equal(f.before.prepare('SELECT count(*) n FROM operation_receipts').get().n,1);
    assert.equal(f.before.prepare("SELECT count(*) n FROM audit_events WHERE action='ACTIVATE_CORE_D1'").get().n,1);
  }finally{f.close();}
});

test('late combined activation failure restores the original 45 tables and all original contents',async()=>{
  const f=await fixture();try {
    const artifact=await combined(f),initial=fingerprint(f.before);
    const sql=artifact.activation.statements.find(s=>s.sql.startsWith('INSERT INTO audit_events'));
    sql.sql='INSERT INTO missing_test_table(value) VALUES(?)';sql.params=['Late synthetic failure'];
    artifact.activation.statementsSha256=await mainTransitionDigest(artifact.activation.statements);
    await assert.rejects(execute(f.before,artifact),/BATCH_REJECTED/);
    assert.equal(fingerprint(f.before),initial);assert.equal(activationFacts(f.before).names.length,45);
  }finally{f.close();}
});

test('main transition cannot be prepared with missing owner evidence or accept browser-supplied SQL',async()=>{
  const f=await fixture();try {
    const artifact=await combined(f),pending=structuredClone(artifact.activation);pending.evidence.OWNER_RELEASE_APPROVAL.status='PENDING';
    await assert.rejects(buildMainTransitionArtifact(artifact.upgrade,pending),/REVIEW_INCOMPLETE/);
    const changed=structuredClone(artifact.upgrade);changed.statements[1].params[0]='tampered';
    await assert.rejects(buildMainTransitionArtifact(changed,artifact.activation),/UPGRADE_CHANGED/);
    const queries=[],controller=reviewedMainTransitionWorker(artifact,{artifactSha256:await mainTransitionDigest(artifact)});
    const env={MAIN_DATABASE_ID:artifact.databaseId,MAIN_TRANSITION_ENABLED:'OWNER_REVIEWED',MAIN_TRANSITION_TOKEN:'a'.repeat(64),ACADEMY_DB:nativeBinding(f.before,queries)};
    for(const [headers,body,status] of [[{},undefined,401],[{Authorization:'Bearer bad'},undefined,401],
      [{Authorization:'Bearer '+env.MAIN_TRANSITION_TOKEN,Origin:'https://browser.invalid'},undefined,403],
      [{Authorization:'Bearer '+env.MAIN_TRANSITION_TOKEN},JSON.stringify({sql:'DROP TABLE accounts'}),400]]) {
      const response=await controller.fetch(new Request('https://controller.invalid/activate',{method:'POST',headers,body}),env);assert.equal(response.status,status);
    }
    assert.equal(queries.length,0);
    const response=await controller.fetch(new Request('https://controller.invalid/activate',{method:'POST',headers:{Authorization:'Bearer '+env.MAIN_TRANSITION_TOKEN}}),env);
    assert.equal(response.status,200);assert.equal((await response.json()).success,true);
  }finally{f.close();}
});
