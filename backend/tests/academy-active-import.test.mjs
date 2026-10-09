import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildOperationalImport, importOperationalPlan, verifyOperationalPlan, operationalSQL, migrations } from '../tools/academy-migration/operational.mjs';
import { createSaltedPinHash } from '../src/lib/auth.js';
import { POLICY_FORMAT } from '../tools/academy-migration/plan.mjs';
import { migrationFixture, fixtureTab, PROGRAM_IDS } from './fixtures/academy-migration-fixture.mjs';

const policy = () => ({ format:POLICY_FORMAT,environment:'local',accounts:'ACTIVE_ONLY',records:'ACTIVE_ONLY',archived:'EXCLUDE',websiteVisibility:'PUBLISHED_CONTENT_ONLY',activeProgramIds:[...PROGRAM_IDS],excludedCourseIds:['legacy-1'] });
const setCell=(s,table,row,field,value,book=0)=>{const t=fixtureTab(s,table,book);t.rows[row][t.rows[0].indexOf(field)]=value;};
function fixture(count=200) {
  const s=migrationFixture(count),t=fixtureTab(s,'UserAccounts');
  for(const row of t.rows.slice(1).filter(r=>r.length))row[t.rows[0].indexOf('PINHash')]='a'.repeat(64);
  setCell(s,'GlobalSubjectRuns',1,'Timezone','Africa/Johannesburg');
  return s;
}
function editJson(s,table,field,fn,book=1) {
  const t=fixtureTab(s,table,book),c=t.rows[0].indexOf(field),value=JSON.parse(t.rows[1][c]);
  fn(value);t.rows[1][c]=JSON.stringify(value);
}
const database=fn=>{const db=new DatabaseSync(':memory:');try{return fn(db);}finally{db.close();}};
const count=(db,table)=>db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;

test('200-account rehearsal retains stable credentials, excludes inactive records, and stays on Sheets',async()=>{
  const s=fixture(),hash=await createSaltedPinHash('1234','synthetic-secret');
  setCell(s,'UserAccounts',1,'PINHash',hash);
  const plan=await buildOperationalImport(s,policy());
  database(db=>{
    const result=importOperationalPlan(db,plan);
    assert.equal(result.accountsImported,199);
    assert.equal(result.classMembershipsImported,199);
    assert.equal(result.dependentRecordsExcluded,1);
    assert.equal(result.cutoverReady,false);
    assert.equal(result.operationalImportReady,false);
    assert.equal(count(db,'academy_admissions'),0);
    assert.equal(count(db,'account_sessions'),0);
    assert.equal(db.prepare('SELECT pin_hash FROM account_credentials WHERE account_id=?').get('account-0001').pin_hash,hash);
    assert.equal(count(db,'activities'),3);
    assert.equal(db.prepare("SELECT count(*) AS n FROM data_ownership WHERE authoritative_store<>'SHEETS' OR phase<>'STAGING'").get().n,0);
    assert.equal(db.prepare('SELECT state FROM migration_runs').get().state,'IMPORTED');
    assert.equal(db.prepare("SELECT count(*) AS n FROM migration_checks WHERE status='PENDING'").get().n,6);
    assert.equal(importOperationalPlan(db,plan).replayed,true);
    assert.equal(verifyOperationalPlan(db,plan).localVerification,'PASS');
  });
});

test('Admin/Senior and pending teacher roles remain review evidence, never wider privileges',async()=>{
  const s=fixture(6);
  const matrix=fixtureTab(s,'AcademyAccessMatrix');
  matrix.rows.push(['account-0001','Synthetic','ACTIVE','ADMIN|STUDENT']);
  const plan=await buildOperationalImport(s,policy());
  database(db=>{
    importOperationalPlan(db,plan);
    assert.deepEqual(db.prepare('SELECT role FROM effective_activity_roles ORDER BY role').all().map(r=>r.role),['STUDENT']);
    assert.equal(count(db,'role_import_reviews'),3);
    assert.equal(count(db,'legacy_access_evidence'),4);
    assert.equal(db.prepare("SELECT count(*) AS n FROM role_assignments WHERE role='PROGRAM_ADMIN'").get().n,0);
    assert.equal(db.prepare("SELECT source_effective FROM legacy_access_evidence WHERE source_role='TEACHER'").get().source_effective,0);
  });
});

test('inactive embedded classes and teachers cannot return through publications or drafts',async()=>{
  const s=fixture(6);
  editJson(s,'ProgramManagementState','SnapshotJSON',v=>{v.ProgramClasses[0].Active=false;});
  const rule={id:'RULE-synthetic',classIds:['class-1'],teacherId:'account-0003',weekdays:[1],startTime:'10:00',endTime:'11:00'};
  editJson(s,'ProgramTimetablePublications','SnapshotJSON',v=>{v.rules=[rule];});
  editJson(s,'ProgramTimetableState','DraftJSON',v=>{v.rules=[rule];v.planner={periods:[],availability:[{teacherId:'account-0006',weekday:1}],limits:[]};});
  const plan=await buildOperationalImport(s,policy());
  const publication=plan.tables.timetable_publications.find(r=>r.activity_key===`PROGRAM:${PROGRAM_IDS[0]}`);
  const draft=plan.tables.timetable_drafts.find(r=>r.activity_key===`PROGRAM:${PROGRAM_IDS[0]}`);
  assert.equal(publication.conversion,'ACTIVE_ONLY');
  assert.deepEqual(JSON.parse(publication.snapshot_json).rules,[]);
  assert.deepEqual(JSON.parse(draft.draft_json).rules,[]);
  assert.deepEqual(JSON.parse(draft.draft_json).planner.availability,[]);
  assert.equal(plan.tables.class_memberships.filter(r=>r.activity_key===`PROGRAM:${PROGRAM_IDS[0]}`).length,0);
  database(db=>assert.equal(importOperationalPlan(db,plan).localImport,'PASS'));
});

test('unknown references and unreviewed embedded JSON abort conversion before writes',async()=>{
  const s=fixture(6);
  editJson(s,'ProgramTimetableState','DraftJSON',v=>{v.rules=[{id:'RULE-synthetic',moduleId:'missing-module'}];});
  await assert.rejects(buildOperationalImport(s,policy()),e=>e.code==='UNKNOWN_ACTIVE_REFERENCE');
  const unknown=fixture(6);
  editJson(unknown,'ProgramTimetableState','DraftJSON',v=>{v.oldAccounts=[{AccountID:'inactive-identity'}];});
  await assert.rejects(buildOperationalImport(unknown,policy()),e=>e.code==='UNREVIEWED_TIMETABLE_JSON');
});

test('unsupported credentials and collisions between login links and account IDs fail safely',async()=>{
  const s=fixture(6);setCell(s,'UserAccounts',1,'PINHash','PRIVATE_UNSUPPORTED_HASH');
  await assert.rejects(buildOperationalImport(s,policy()),e=>e.code==='UNSUPPORTED_PIN_HASH'&&!JSON.stringify(e).includes('PRIVATE_UNSUPPORTED_HASH'));
  const collision=fixture(6);setCell(collision,'UserAccounts',1,'UniqueID','ACCOUNT-0003');
  await assert.rejects(buildOperationalImport(collision,policy()),e=>e.code==='AMBIGUOUS_LOGIN_IDENTITY');
});

test('SQL foreign keys reject cross-Program relationships and failed imports roll back completely',async()=>{
  const plan=await buildOperationalImport(fixture(6),policy());
  const row=plan.tables.class_memberships.find(r=>r.activity_key===`PROGRAM:${PROGRAM_IDS[0]}`);row.class_id='class-2';
  database(db=>{
    assert.throws(()=>importOperationalPlan(db,plan),e=>e.code==='OPERATIONAL_INSERT_FAILED'&&e.location.table==='class_memberships');
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get().n,0);
  });
});

test('content verification detects changed credentials, missing rows and unauthorized privilege changes',async()=>{
  const plan=await buildOperationalImport(fixture(6),policy());
  for(const sql of ["UPDATE account_credentials SET pin_hash='b'","DELETE FROM class_memberships","UPDATE role_import_reviews SET source_value='STUDENT'"])
    database(db=>{importOperationalPlan(db,plan);db.exec(sql);assert.throws(()=>verifyOperationalPlan(db,plan),e=>e.code==='IMPORTED_CONTENT_MISMATCH');});
});

test('a changed capture or schema cannot reuse an existing candidate',async()=>{
  const s=fixture(6),first=await buildOperationalImport(s,policy());
  setCell(s,'UserAccounts',1,'DisplayName','Changed synthetic learner');
  const changed=await buildOperationalImport(s,policy());
  assert.notEqual(first.runId,changed.runId);
  database(db=>{importOperationalPlan(db,first);assert.throws(()=>importOperationalPlan(db,changed),e=>e.code==='IMPORTED_CONTENT_MISMATCH');assert.equal(verifyOperationalPlan(db,first).localVerification,'PASS');});
  database(db=>{importOperationalPlan(db,first);db.exec("UPDATE academy_import_schema SET migration_sha256='0' || substr(migration_sha256,2)");assert.throws(()=>verifyOperationalPlan(db,first),e=>e.code==='IMPORTED_CONTENT_MISMATCH');});
});

test('publications are immutable and local SQL export reproduces the full candidate',async()=>{
  const plan=await buildOperationalImport(fixture(6),policy());
  database(db=>{
    db.exec('PRAGMA foreign_keys=ON');for(const m of migrations)db.exec(m.sql);
    db.exec(operationalSQL(plan));
    assert.equal(verifyOperationalPlan(db,plan).localVerification,'PASS');
    assert.throws(()=>db.exec("UPDATE timetable_publications SET version_no=2"),/immutable/);
    assert.throws(()=>db.exec("DELETE FROM timetable_publications"),/immutable/);
    assert.throws(()=>db.exec("UPDATE data_ownership SET authoritative_store='D1',phase='ACTIVE',verified_run_id=(SELECT run_id FROM migration_runs),switched_at='2026-10-09'"),/verified import/);
  });
});

test('CLI preflight rejection creates no destination and prints no source credentials',()=>{
  const dir=mkdtempSync(join(tmpdir(),'academy-import-test-'));
  try {
    const s=fixture(6);setCell(s,'UserAccounts',1,'PINHash','PRIVATE_UNSUPPORTED_HASH');
    const snapshot=join(dir,'source.json'),selection=join(dir,'policy.json'),db=join(dir,'candidate.sqlite');
    writeFileSync(snapshot,JSON.stringify(s),{mode:0o600});writeFileSync(selection,JSON.stringify(policy()),{mode:0o600});
    const result=spawnSync(process.execPath,['backend/tools/academy-migration.mjs','import-active','--snapshot',snapshot,'--policy',selection,'--database',db],{cwd:new URL('../..',import.meta.url),encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(result.stderr,/UNSUPPORTED_PIN_HASH/);
    assert.ok(!result.stderr.includes('PRIVATE_UNSUPPORTED_HASH'));
    assert.ok(!result.stderr.includes('account-0001'));
    assert.equal(existsSync(db),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
