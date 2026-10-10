import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {identifier,schemaQuery} from './atomic-snapshot.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical=rows=>rows.map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const fingerprint=(schema,tables)=>hash({schema,content:Object.entries(tables).sort(([a],[b])=>a.localeCompare(b)).map(([name,rows])=>[name,canonical(rows)])});
const uuid=value=>/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value||'');

// Private, complete snapshots include credentials and all runtime state. They
// are never API responses, repository files, or public reports. Capture remote
// readback only while EVERY writer is stopped; a browser maintenance page alone
// does not stop direct D1 clients, Sheets or Apps Script.
export function snapshotFromReadback(schema,tables,{databaseId,quiescenceReference,capturedAt=new Date().toISOString()}={}) {
  if(!uuid(databaseId)||!String(quiescenceReference||'').trim())throw Error('RECOVERY_TARGET_AND_QUIESCENCE_REQUIRED');
  schema=structuredClone(schema);tables=Object.fromEntries(Object.entries(tables).sort(([a],[b])=>a.localeCompare(b)).map(([name,rows])=>[name,canonical(rows)]));
  const names=schema.filter(s=>s.type==='table').map(s=>s.name).sort();
  if(!names.length||JSON.stringify(names)!==JSON.stringify(Object.keys(tables)))throw Error('RECOVERY_TABLE_SET_MISMATCH');
  for(const rows of Object.values(tables))for(const row of rows)for(const value of Object.values(row))
    if(!(value===null||typeof value==='string'||typeof value==='number'&&Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value))))throw Error('RECOVERY_UNSUPPORTED_VALUE');
  const basis={format:'maktab-d1-recovery/v1',snapshotId:randomUUID(),databaseId,capturedAt,quiescenceReference,schema,tables,fingerprint:fingerprint(schema,tables)};
  return {...basis,artifactSha256:hash(basis)};
}
export function validateRecoverySnapshot(snapshot) {
  const {artifactSha256,...basis}=snapshot||{};
  if(basis.format!=='maktab-d1-recovery/v1'||!uuid(basis.databaseId)||!basis.quiescenceReference||hash(basis)!==artifactSha256||fingerprint(basis.schema,basis.tables)!==basis.fingerprint)throw Error('RECOVERY_ARTIFACT_CHANGED');
  const names=basis.schema.filter(s=>s.type==='table').map(s=>s.name).sort();
  if(JSON.stringify(names)!==JSON.stringify(Object.keys(basis.tables).sort()))throw Error('RECOVERY_TABLE_SET_MISMATCH');
  return snapshot;
}
export function captureRecoverySnapshot(db,metadata) {
  db.exec('BEGIN');
  try {
    const schema=db.prepare(schemaQuery).all(),tables=Object.fromEntries(schema.filter(s=>s.type==='table').map(s=>[s.name,db.prepare('SELECT * FROM '+identifier(s.name)).all()]));
    const snapshot=snapshotFromReadback(schema,tables,metadata);db.exec('COMMIT');return snapshot;
  }catch(error){db.exec('ROLLBACK');throw error;}
}
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):value.includes('\0')?"CAST(X'"+Buffer.from(value).toString('hex')+"' AS TEXT)":"'"+value.replaceAll("'","''")+"'";
export function recoverySQL(snapshot) {
  validateRecoverySnapshot(snapshot);
  const schemaDb=new DatabaseSync(':memory:');let ordered;
  try {
    const remaining=new Map(snapshot.schema.filter(s=>s.type==='table').map(s=>[s.name,s]));
    for(const table of remaining.values())schemaDb.exec(table.sql);
    const dependencies=new Map([...remaining.keys()].map(name=>[name,schemaDb.prepare('PRAGMA foreign_key_list('+identifier(name)+')').all().map(f=>f.table).filter(parent=>parent!==name)]));
    ordered=[];while(remaining.size){const next=[...remaining.keys()].find(name=>dependencies.get(name).every(parent=>!remaining.has(parent)));if(!next)throw Error('RECOVERY_CYCLIC_SCHEMA_REQUIRES_REVIEW');ordered.push(remaining.get(next));remaining.delete(next);}
  }finally{schemaDb.close();}
  // Parent tables and rows precede dependants. Cross-table cycles require a
  // separate reviewed restore. Install triggers after source/history rows to
  // avoid replaying edits. The caller supplies the importing transaction.
  const statements=['PRAGMA defer_foreign_keys=ON;',...ordered.map(s=>s.sql+';')];
  for(const {name} of ordered)for(const row of snapshot.tables[name])statements.push(`INSERT INTO ${identifier(name)} (${Object.keys(row).map(identifier).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`);
  // Leave deferral enabled until the importing transaction commits. Turning it
  // off early can discard deferred violations instead of validating them.
  statements.push(...snapshot.schema.filter(s=>s.type!=='table').map(s=>s.sql+';'));
  if(statements.some(sql=>Buffer.byteLength(sql)>100000))throw Error('RECOVERY_SQL_STATEMENT_LIMIT_EXCEEDED');
  return statements.join('\n');
}
export function restoreRecoverySnapshot(db,snapshot) {
  validateRecoverySnapshot(snapshot);
  if(db.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").get())throw Error('RECOVERY_EMPTY_DESTINATION_REQUIRED');
  db.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE');
  try {
    db.exec(recoverySQL(snapshot));
    if(db.prepare('PRAGMA foreign_key_check').all().length||db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('RECOVERY_INTEGRITY_FAILED');
    const schema=db.prepare(schemaQuery).all(),tables=Object.fromEntries(schema.filter(s=>s.type==='table').map(s=>[s.name,db.prepare('SELECT * FROM '+identifier(s.name)).all()]));
    if(fingerprint(schema,tables)!==snapshot.fingerprint)throw Error('RECOVERY_CONTENT_MISMATCH');
    db.exec('COMMIT');return {restored:true,tables:schema.filter(s=>s.type==='table').length,fingerprint:snapshot.fingerprint};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function recoveryDelta(baseline,latest) {
  validateRecoverySnapshot(baseline);validateRecoverySnapshot(latest);
  if(baseline.databaseId!==latest.databaseId)throw Error('RECOVERY_TARGET_MISMATCH');
  // Multiset differences preserve deletions and modifications, including tables
  // without a primary key. Changed rows appear as removed+added; values stay in
  // the private snapshots, never this count-only review report.
  const tables={};
  for(const name of new Set([...Object.keys(baseline.tables),...Object.keys(latest.tables)])) {
    const counts=rows=>{const result=new Map();for(const row of canonical(rows)){const key=JSON.stringify(row);result.set(key,(result.get(key)||0)+1);}return result;};
    const before=counts(baseline.tables[name]||[]),after=counts(latest.tables[name]||[]);let addedRows=0,removedRows=0;
    for(const key of new Set([...before.keys(),...after.keys()])){const change=(after.get(key)||0)-(before.get(key)||0);addedRows+=Math.max(0,change);removedRows+=Math.max(0,-change);}
    if(addedRows||removedRows)tables[name]={before:baseline.tables[name]?.length||0,after:latest.tables[name]?.length||0,addedRows,removedRows};
  }
  return {format:'maktab-d1-recovery-delta/v1',baselineSnapshotId:baseline.snapshotId,latestSnapshotId:latest.snapshotId,schemaChanged:hash(baseline.schema)!==hash(latest.schema),
    tables,automaticSheetsRollbackAllowed:false,recoveryStore:'D1',latestFingerprint:latest.fingerprint};
}
