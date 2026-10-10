import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {activationFacts} from './activation.mjs';
import {atomicSnapshotGuard,identifier,schemaQuery} from './atomic-snapshot.mjs';
import {captureRecoverySnapshot,restoreRecoverySnapshot} from './recovery.mjs';
import {stableJSON} from './snapshot.mjs';

const hash=value=>createHash('sha256').update(stableJSON(value)).digest('hex');
const guardName='academy_staging_upgrade_guard';
const guardSQL=`CREATE TABLE ${guardName}(guard_id TEXT PRIMARY KEY NOT NULL,accepted INTEGER NOT NULL CHECK(accepted=1))`;
const rowKey=row=>stableJSON(row);
const fail=condition=>{if(!condition)throw Error('STAGING_UPGRADE_NOT_ADDITIVE');};
const fingerprint=db=>activationFacts(db).fingerprint;

function stagingOnly(db) {
  const facts=activationFacts(db);
  if(!facts.integrity||!facts.foreignKeys||db.prepare('SELECT count(*) n FROM migration_runs').get().n!==1||
    db.prepare("SELECT 1 FROM migration_runs WHERE state<>'IMPORTED'").get()||
    db.prepare('SELECT 1 FROM account_sessions').get()||db.prepare('SELECT 1 FROM operation_receipts').get()||
    facts.ownership.length!==facts.activities.length||!facts.activities.length||
    facts.ownership.some(o=>o.authoritative_store!=='SHEETS'||o.phase!=='STAGING'||o.verified_run_id!==null||o.switched_at!==null)||
    facts.activities.some(a=>!facts.ownership.some(o=>o.scope_key===a.activity_key)))throw Error('UNUSED_SHEETS_STAGING_IMPORT_REQUIRED');
  return facts;
}

function insertionOrder(db,names) {
  const remaining=new Set(names),result=[];
  const dependencies=new Map(names.map(name=>[name,db.prepare('PRAGMA foreign_key_list('+identifier(name)+')').all().map(r=>r.table).filter(parent=>parent!==name)]));
  while(remaining.size) {
    const next=[...remaining].find(name=>dependencies.get(name).every(parent=>!remaining.has(parent)));
    if(!next)throw Error('STAGING_UPGRADE_CYCLIC_SCHEMA');
    remaining.delete(next);result.push(next);
  }
  return result;
}

// Offline preparation only. Serialized artifacts contain complete private
// source rows and credential hashes. No HTTP route, deployment or remote apply
// command imports this module. Live execution needs a separately reviewed
// target-bound controller, final source reconciliation and release approval.
export function buildStagingUpgradePlan(before,after,{databaseId,codeCommit,sourceSha256}={}) {
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId||'')||!/^([a-f0-9]{40})$/i.test(codeCommit||'')||!/^([a-f0-9]{64})$/i.test(sourceSha256||''))throw Error('STAGING_UPGRADE_IDENTITY_REQUIRED');
  const old=stagingOnly(before),next=stagingOnly(after);
  if(old.names.includes('academy_write_state')||!next.names.includes('academy_write_state')||
    after.prepare('SELECT version FROM academy_write_state WHERE singleton=1').get()?.version!==0)throw Error('BASE_TO_RUNTIME_STAGING_UPGRADE_REQUIRED');
  for(const db of [before,after])if(db.prepare('SELECT source_snapshot_sha256 FROM migration_runs').get().source_snapshot_sha256!==sourceSha256)throw Error('STAGING_UPGRADE_SOURCE_MISMATCH');
  const oldSchema=before.prepare(schemaQuery).all(),newSchema=after.prepare(schemaQuery).all();
  const schemaKey=r=>r.type+':'+r.name,newObjects=new Map(newSchema.map(r=>[schemaKey(r),r]));
  for(const row of oldSchema)fail(rowKey(newObjects.get(schemaKey(row)))===rowKey(row));
  fail(!newSchema.some(r=>r.name===guardName));
  const tables=newSchema.filter(r=>r.type==='table').map(r=>r.name),additions={},preservedCounts={};
  for(const name of tables) {
    const oldRows=old.names.includes(name)?before.prepare('SELECT * FROM '+identifier(name)).all():[];
    const counts=new Map();for(const row of oldRows)counts.set(rowKey(row),(counts.get(rowKey(row))||0)+1);
    const added=[];for(const row of after.prepare('SELECT * FROM '+identifier(name)).all()) {
      const key=rowKey(row);if(counts.get(key))counts.set(key,counts.get(key)-1);else added.push(row);
    }
    fail([...counts.values()].every(n=>n===0));
    additions[name]=added;if(old.names.includes(name))preservedCounts[name]=oldRows.length;
  }
  // Existing identity, credential and authority rows cannot be supplemented by
  // this additive schema/learning import. Source changes need a fresh review.
  for(const name of ['accounts','account_credentials','global_role_assignments','role_assignments','legacy_access_evidence','activities','data_ownership'])fail(additions[name].length===0);
  const copy=new DatabaseSync(':memory:'),upgradeId=randomUUID(),statements=[];
  const add=(sql,...params)=>statements.push({sql,params});
  try {
    restoreRecoverySnapshot(copy,captureRecoverySnapshot(before,{databaseId,quiescenceReference:'Offline preparation copy; not a source freeze'}));
    copy.exec(guardSQL);const initial=atomicSnapshotGuard(copy);
    add(guardSQL);
    add(`INSERT INTO ${guardName}(guard_id,accepted) VALUES(?,${initial.condition})`,upgradeId,...initial.params);
    const existing=new Set(oldSchema.map(schemaKey));
    for(const type of ['table','index','view','trigger'])for(const row of newSchema.filter(r=>r.type===type&&!existing.has(schemaKey(r))))add(row.sql);
    for(const name of insertionOrder(after,tables)) {
      if(!additions[name].length)continue;
      const columns=after.prepare('PRAGMA table_info('+identifier(name)+')').all().map(c=>c.name);
      let rows=[];
      const flush=()=>{if(!rows.length)return;add(`INSERT INTO ${identifier(name)}(${columns.map(identifier).join(',')}) SELECT ${columns.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?)`,JSON.stringify(rows));rows=[];};
      for(const row of additions[name]) {
        const values=columns.map(c=>row[c]);
        if(Buffer.byteLength(JSON.stringify([values]))>1_850_000)throw Error('STAGING_UPGRADE_ROW_LIMIT');
        if(rows.length&&Buffer.byteLength(JSON.stringify([...rows,values]))>1_850_000)flush();rows.push(values);
      }
      flush();
    }
    // Compare the complete resulting schema/content inside the transaction.
    // A late failure must roll back the schema additions and data together.
    const desired=new DatabaseSync(':memory:');
    try {
      restoreRecoverySnapshot(desired,captureRecoverySnapshot(after,{databaseId,quiescenceReference:'Offline prepared candidate'}));
      desired.exec(guardSQL);desired.prepare(`INSERT INTO ${guardName} VALUES(?,1)`).run(upgradeId);
      const final=atomicSnapshotGuard(desired);
      add(`UPDATE ${guardName} SET accepted=(${final.condition}) WHERE guard_id=?`,...final.params,upgradeId);
    }finally{desired.close();}
    add('DROP TABLE '+guardName);
  }finally{copy.close();}
  if(statements.some(s=>Buffer.byteLength(s.sql)>95000||s.params.length>100||s.params.some(p=>typeof p==='string'&&Buffer.byteLength(p)>1_900_000)))throw Error('STAGING_UPGRADE_STATEMENT_LIMIT');
  const basis={format:'maktab-staging-upgrade/v1',upgradeId,databaseId,codeCommit,sourceSha256,
    beforeFingerprint:old.fingerprint,afterFingerprint:next.fingerprint,preservedCounts,
    addedRows:Object.fromEntries(Object.entries(additions).filter(([,r])=>r.length).map(([name,r])=>[name,r.length])),
    beforeTables:old.names.length,afterTables:next.names.length,ownership:'SHEETS/STAGING',
    localPreparationOnly:true,liveExecutionApproved:false,statements};
  return {...basis,artifactSha256:hash(basis)};
}

export function validateStagingUpgradePlan(plan) {
  const {artifactSha256,...basis}=plan||{};
  if(basis.format!=='maktab-staging-upgrade/v1'||basis.localPreparationOnly!==true||basis.liveExecutionApproved!==false||
    !basis.statements?.length||hash(basis)!==artifactSha256)throw Error('STAGING_UPGRADE_ARTIFACT_CHANGED');
  return plan;
}

export function applyStagingUpgradeLocally(db,plan) {
  validateStagingUpgradePlan(plan);
  db.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE');
  try {
    const actual=fingerprint(db);
    if(actual===plan.afterFingerprint){db.exec('COMMIT');return {upgraded:true,replayed:true,fingerprint:actual};}
    if(actual!==plan.beforeFingerprint)throw Error('STAGING_UPGRADE_DATABASE_CHANGED');
    for(const {sql,params} of plan.statements)db.prepare(sql).run(...params);
    if(fingerprint(db)!==plan.afterFingerprint||db.prepare('PRAGMA foreign_key_check').all().length||db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('STAGING_UPGRADE_VERIFICATION_FAILED');
    db.exec('COMMIT');return {upgraded:true,replayed:false,fingerprint:plan.afterFingerprint};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
