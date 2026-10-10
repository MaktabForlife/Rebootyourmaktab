import {createHash,randomUUID} from 'node:crypto';
import {CORE_ACTIVATION_CHECKS} from '../../src/academy/d1/activation-policy.js';
import {atomicSnapshotGuard} from './atomic-snapshot.mjs';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier=name=>'"'+name.replaceAll('"','""')+'"';
const required=['academy_write_state','operation_receipts','role_mapping_decisions','learning_imports',
  'course_workflow_imports','course_subscription_decisions','attendance_registers','attendance_marks'];
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'');

// Offline administration only. Plans include exact-state comparisons containing
// credential hashes and account data: serialized plans are PRIVATE artifacts,
// never browser/API payloads, repository files or logged review reports.
export function activationFacts(db) {
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND sql IS NOT NULL ORDER BY type,name").all();
  const names=schema.filter(r=>r.type==='table').map(r=>r.name);
  const content=names.map(name=>[name,db.prepare(`SELECT * FROM ${identifier(name)}`).all().map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
  const runs=db.prepare('SELECT * FROM migration_runs').all();
  const ownership=db.prepare("SELECT * FROM data_ownership WHERE dataset_key='ACADEMY' ORDER BY scope_key").all();
  const activities=db.prepare('SELECT activity_key FROM activities ORDER BY activity_key').all();
  const run=names.includes('learning_imports')?db.prepare('SELECT m.* FROM migration_runs m JOIN learning_imports l ON l.base_run_id=m.run_id WHERE l.singleton=1 AND l.source_sha256=m.source_snapshot_sha256').get():null;
  return {schema,names,tableCounts:Object.fromEntries(content.map(([name,rows])=>[name,rows.length])),
    fingerprint:sha({schema,content}),run:runs.length===1?run:null,ownership,activities,
    version:names.includes('academy_write_state')?db.prepare('SELECT version FROM academy_write_state WHERE singleton=1').get()?.version:null,
    integrity:db.prepare('PRAGMA integrity_check').get()?.integrity_check==='ok',foreignKeys:db.prepare('PRAGMA foreign_key_check').all().length===0};
}

export function buildCoreActivationPlan(db,review={}) {
  const facts=activationFacts(db),blockers=[];
  for(const name of required)if(!facts.names.includes(name))blockers.push('MISSING_RUNTIME_TABLE:'+name);
  if(!facts.schema.some(s=>s.type==='view'&&s.name==='effective_course_subscriptions'))blockers.push('MISSING_SUBSCRIPTION_VIEW');
  if(!facts.integrity||!facts.foreignKeys)blockers.push('DATABASE_INTEGRITY');
  if(!Number.isInteger(facts.version)||facts.version<0)blockers.push('WRITE_STATE_REQUIRED');
  if(!facts.run||facts.run.state!=='IMPORTED'||!['LOCAL','DEVELOPMENT'].includes(facts.run.environment))blockers.push('VERIFIED_BASE_IMPORT_REQUIRED');
  if(facts.run&&review.sourceSha256!==facts.run.source_snapshot_sha256)blockers.push('SOURCE_SNAPSHOT_MISMATCH');
  if(!uuid(review.reviewId))blockers.push('REVIEW_ID_REQUIRED');
  if(!/^[0-9a-f]{40}$/i.test(review.codeCommit||''))blockers.push('REVIEWED_CODE_COMMIT_REQUIRED');
  if(review.libraryMode!=='PUBLIC_ONLY')blockers.push('PUBLIC_ONLY_LIBRARY_REQUIRED');
  if(!facts.activities.length||facts.ownership.length!==facts.activities.length||facts.activities.some(a=>!facts.ownership.some(o=>o.scope_key===a.activity_key))||
    facts.ownership.some(o=>o.authoritative_store!=='SHEETS'||o.phase!=='STAGING'||o.verified_run_id!==null||o.switched_at!==null))blockers.push('STAGING_OWNERSHIP_REQUIRED');
  if(facts.run&&db.prepare("SELECT 1 FROM migration_checks WHERE run_id=? AND status='FAIL'").get(facts.run.run_id))blockers.push('FAILED_MIGRATION_CHECK');
  if(facts.names.includes('course_workflow_imports')&&facts.run&&!db.prepare('SELECT 1 FROM course_workflow_imports c WHERE singleton=1 AND base_run_id=? AND source_sha256=?').get(facts.run.run_id,facts.run.source_snapshot_sha256))blockers.push('COURSE_IMPORT_MISMATCH');
  for(const check of CORE_ACTIVATION_CHECKS) {
    const evidence=review.evidence?.[check];
    if(evidence?.status!=='PASS'||typeof evidence.reference!=='string'||!evidence.reference.trim())blockers.push('EVIDENCE_REQUIRED:'+check);
  }
  const basis={format:'maktab-core-activation/v1',reviewId:review.reviewId||'',runId:facts.run?.run_id||'',sourceSha256:facts.run?.source_snapshot_sha256||'',
    codeCommit:review.codeCommit||'',databaseFingerprint:facts.fingerprint,writeVersion:facts.version,libraryMode:'PUBLIC_ONLY',
    evidence:Object.fromEntries(CORE_ACTIVATION_CHECKS.map(check=>[check,review.evidence?.[check]||{status:'PENDING'}]))};
  const plan={...basis,reviewSha256:sha(basis),readyToApply:blockers.length===0,blockers,tableCounts:facts.tableCounts,statements:[]};
  if(blockers.length)return plan;
  let snapshot;
  try{snapshot=atomicSnapshotGuard(db);}catch{plan.blockers.push('ATOMIC_SNAPSHOT_LIMIT_EXCEEDED');plan.readyToApply=false;return plan;}
  const now=new Date().toISOString(),guard=randomUUID(),snapshotGuard=randomUUID(),statements=plan.statements;
  const add=(sql,...params)=>statements.push({sql,params});
  add(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,${snapshot.condition})`,snapshotGuard,...snapshot.params);
  add(`INSERT INTO academy_write_guards(guard_id,accepted) VALUES(?,
    (SELECT version=? FROM academy_write_state WHERE singleton=1)
    AND EXISTS(SELECT 1 FROM migration_runs WHERE run_id=? AND state='IMPORTED' AND source_snapshot_sha256=?)
    AND (SELECT count(*) FROM activities)=?
    AND (SELECT count(*) FROM data_ownership WHERE dataset_key='ACADEMY')=?
    AND NOT EXISTS(SELECT 1 FROM data_ownership WHERE dataset_key='ACADEMY' AND (authoritative_store<>'SHEETS' OR phase<>'STAGING')))`,
    guard,facts.version,facts.run.run_id,facts.run.source_snapshot_sha256,facts.activities.length,facts.ownership.length);
  add("UPDATE migration_runs SET state='VERIFIED' WHERE run_id=?",facts.run.run_id);
  for(const check of CORE_ACTIVATION_CHECKS)add(`INSERT INTO migration_checks(run_id,dataset_key,scope_key,check_name,status,findings_count,checked_at)
    VALUES(?,'ACTIVATION','ACADEMY',?,'PASS',0,?) ON CONFLICT(run_id,dataset_key,scope_key,check_name)
    DO UPDATE SET status='PASS',findings_count=0,checked_at=excluded.checked_at`,facts.run.run_id,check,now);
  add("UPDATE data_ownership SET authoritative_store='D1',phase='ACTIVE',verified_run_id=?,switched_at=?,revision=revision+1 WHERE dataset_key='ACADEMY'",facts.run.run_id,now);
  add("UPDATE migration_runs SET state='CUTOVER' WHERE run_id=?",facts.run.run_id);
  add('UPDATE account_sessions SET revoked_at=? WHERE revoked_at IS NULL',now);
  add(`INSERT INTO audit_events(event_id,occurred_at,authority,scope_key,action,record_kind,record_id,changed_fields_json)
    VALUES(?,?,'CORE_CUTOVER_REVIEW','ACADEMY','ACTIVATE_CORE_D1','MIGRATION',?,?)`,randomUUID(),now,review.reviewId,
    JSON.stringify(['ReviewSHA256:'+plan.reviewSha256,'CodeCommit:'+review.codeCommit,'SourceSHA256:'+basis.sourceSha256,'Library:PUBLIC_ONLY']));
  const result={runId:basis.runId,activationId:review.reviewId,reviewSha256:plan.reviewSha256,activatedAt:now,libraryMode:'PUBLIC_ONLY'};
  add(`INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,completed_at)
    VALUES('CORE_ACTIVATION','ACADEMY',?,?,?,?)`,review.reviewId,plan.reviewSha256,JSON.stringify(result),now);
  add('UPDATE academy_write_state SET version=version+1 WHERE singleton=1');
  add('DELETE FROM academy_write_guards WHERE guard_id=?',guard);
  add('DELETE FROM academy_write_guards WHERE guard_id=?',snapshotGuard);
  plan.statementsSha256=sha(statements);
  return plan;
}

// Local restore/rehearsal only. Remote application must use one D1 binding.batch
// after writers are paused and the exact current fingerprint is rechecked.
// Never apply these statements individually or as a chunked SQL-file import.
export function applyCoreActivationLocally(db,plan) {
  if(!plan?.readyToApply||plan.blockers.length||!plan.statements.length)throw Error('ACTIVATION_REVIEW_INCOMPLETE');
  if(sha(plan.statements)!==plan.statementsSha256)throw Error('ACTIVATION_ARTIFACT_CHANGED');
  db.exec('BEGIN IMMEDIATE');
  try {
    const saved=db.prepare("SELECT payload_sha256,result_json FROM operation_receipts WHERE dataset_key='CORE_ACTIVATION' AND scope_key='ACADEMY' AND operation_id=?").get(plan.reviewId);
    if(saved){if(saved.payload_sha256!==plan.reviewSha256)throw Error('ACTIVATION_REVIEW_ID_REUSED');db.exec('COMMIT');return {...JSON.parse(saved.result_json),replayed:true};}
    if(activationFacts(db).fingerprint!==plan.databaseFingerprint)throw Error('ACTIVATION_DATABASE_CHANGED');
    for(const {sql,params} of plan.statements)db.prepare(sql).run(...params);
    const result=JSON.parse(db.prepare("SELECT result_json FROM operation_receipts WHERE dataset_key='CORE_ACTIVATION' AND operation_id=?").get(plan.reviewId).result_json);
    db.exec('COMMIT');return result;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
