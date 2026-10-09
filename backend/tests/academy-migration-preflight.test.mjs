import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSnapshot, SnapshotError } from '../tools/academy-migration/snapshot.mjs';
import { importSnapshot, verifyArchive } from '../tools/academy-migration/archive.mjs';
import { captureSnapshot } from '../tools/academy-migration/export.mjs';
import { migrationFixture, fixtureTab } from './fixtures/academy-migration-fixture.mjs';

const rejectsCode = (promise, code) => assert.rejects(promise, error => error instanceof SnapshotError && error.code === code);
const alter = (snapshot, name, field, value, row = 1, book = 0) => {
  const table = fixtureTab(snapshot, name, book);
  table.rows[row][table.rows[0].indexOf(field)] = value;
};
test('all 200 accounts, every registered workbook and current snapshot enrollments are covered', async () => {
  const snapshot = migrationFixture();
  const report = await validateSnapshot(snapshot);
  assert.equal(report.snapshotValidation, 'PASS');
  assert.equal(report.cutoverReady, false);
  assert.equal(report.checks.accounts, 200);
  assert.equal(report.checks.programs, 2);
  assert.equal(report.checks.legacyWorkbooks, 1);
  assert.equal(report.checks.enrollments, 200);
  assert.equal(report.checks.programPublications, 2);
  assert.equal(report.checks.pendingRoleReviews, 1);
  const sanitized = JSON.stringify(report);
  assert.ok(!sanitized.includes('account-0001'));
  assert.ok(!sanitized.includes('SYNTHETIC-HASH'));
});
test('archive import is repeatable and preserves credentials, roles, blanks, unknown tabs and value types', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const snapshot = migrationFixture();
    const before = structuredClone(snapshot);
    const first = await importSnapshot(db, snapshot);
    assert.equal(first.archiveVerification, 'PASS');
    assert.equal(first.replayed, false);
    assert.deepEqual(snapshot, before);
    const second = await importSnapshot(db, snapshot);
    assert.equal(second.replayed, true);
    assert.equal(db.prepare('SELECT count(*) AS n FROM staging_runs').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM staging_rows').get().n, first.checks.rows);
    const account = db.prepare("SELECT * FROM staging_accounts WHERE account_key='ACCOUNT-0002'").get();
    assert.equal(account.row_number, 4);
    const raw = db.prepare('SELECT cells_json FROM staging_rows WHERE book_index=? AND tab_index=? AND row_number=?').get(0, account.tab_index, account.row_number);
    const cells = JSON.parse(raw.cells_json);
    assert.equal(cells[4], 'SYNTHETIC-HASH-0002');
    assert.equal((await verifyArchive(db, snapshot)).archiveVerification, 'PASS');
  } finally { db.close(); }
});
test('incomplete or wrongly mapped program captures cannot pass', async () => {
  const absent = migrationFixture(); absent.workbooks.pop();
  await rejectsCode(validateSnapshot(absent), 'WORKBOOK_COVERAGE_MISMATCH');
  const wrong = migrationFixture(); wrong.workbooks[1].courseId = wrong.workbooks[2].courseId;
  await rejectsCode(validateSnapshot(wrong), 'UNREGISTERED_OR_MISMATCHED_WORKBOOK');
  const identity = migrationFixture(); alter(identity, 'ProgramIdentity', 'CourseID', 'different-program', 1, 1);
  await rejectsCode(validateSnapshot(identity), 'PROGRAM_IDENTITY_MISMATCH');
});
test('case-insensitive collisions and missing credentials fail before database mutation', async () => {
  for (const [field, value, code] of [['AccountID', 'ACCOUNT-0001', 'MISSING_OR_DUPLICATE_ID'],
    ['UniqueID', 'LOGIN-0001', 'MISSING_OR_DUPLICATE_ID'], ['PINHash', '', 'MISSING_PIN_HASH']]) {
    const snapshot = migrationFixture(); alter(snapshot, 'UserAccounts', field, value, 3);
    const db = new DatabaseSync(':memory:');
    try {
      await rejectsCode(importSnapshot(db, snapshot), code);
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 0);
    } finally { db.close(); }
  }
});
test('unknown roles, orphan grants, partial access setup and unresolved scopes fail closed', async () => {
  const role = migrationFixture(); alter(role, 'UserCourseAccess', 'Role', 'OWNER');
  await rejectsCode(validateSnapshot(role), 'UNKNOWN_SOURCE_ROLE');
  const grant = migrationFixture(); alter(grant, 'UserCourseAccess', 'AccountID', 'missing-account');
  await rejectsCode(validateSnapshot(grant), 'BROKEN_REFERENCE');
  const partial = migrationFixture(); partial.workbooks[0].tabs = partial.workbooks[0].tabs.filter(t => t.title !== 'AcademyAccessReview');
  partial.workbooks[0].inventory = partial.workbooks[0].tabs.map(t => ({ sheetId: t.sheetId, title: t.title }));
  await rejectsCode(validateSnapshot(partial), 'PARTIAL_ACADEMY_ACCESS_SETUP');
  const scope = migrationFixture(); fixtureTab(scope, 'AcademyAccessMatrix').rows[0][3] = 'PROGRAM:missing';
  await rejectsCode(validateSnapshot(scope), 'MATRIX_SCOPE_NOT_DECLARED');
});
test('snapshot-only class membership and current publication links are checked', async () => {
  const orphan = migrationFixture();
  const tab = fixtureTab(orphan, 'ProgramManagementState', 1);
  const column = tab.rows[0].indexOf('SnapshotJSON');
  const current = JSON.parse(tab.rows[1][column]);
  current.ProgramEnrollments[0].AccountID = 'missing-account';
  tab.rows[1][column] = JSON.stringify(current);
  await rejectsCode(validateSnapshot(orphan), 'BROKEN_REFERENCE');
  const publication = migrationFixture(); alter(publication, 'ProgramTimetableState', 'CurrentPublicationID', 'missing-publication', 1, 1);
  await rejectsCode(validateSnapshot(publication), 'BROKEN_REFERENCE');
  const corrupt = migrationFixture(); alter(corrupt, 'ProgramTimetablePublications', 'SnapshotJSON', '{broken', 1, 1);
  await rejectsCode(validateSnapshot(corrupt), 'INCOMPATIBLE_SOURCE_SCHEMA');
});
test('archive verification and repeated imports detect changed rows, missing rows and a modified account index', async () => {
  for (const mutation of [
    "UPDATE staging_rows SET cells_json='[]' WHERE book_index=0 AND row_number=2",
    'DELETE FROM staging_rows WHERE book_index=1 AND tab_index=0 AND row_number=2',
    "UPDATE staging_accounts SET login_key='OTHER' WHERE account_key='ACCOUNT-0002'"
  ]) {
    const db = new DatabaseSync(':memory:');
    try {
      const snapshot = migrationFixture(); await importSnapshot(db, snapshot);
      db.exec(mutation);
      await assert.rejects(verifyArchive(db, snapshot), SnapshotError);
      await assert.rejects(importSnapshot(db, snapshot), SnapshotError);
      assert.equal(db.prepare('SELECT count(*) AS n FROM staging_runs').get().n, 1);
    } finally { db.close(); }
  }
});
test('destination must be a dedicated archive and failed insert rolls back the whole capture', async () => {
  const other = new DatabaseSync(':memory:');
  try {
    other.exec('CREATE TABLE accounts(id TEXT)');
    await rejectsCode(importSnapshot(other, migrationFixture()), 'NOT_A_MIGRATION_ARCHIVE');
    assert.equal(other.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 1);
  } finally { other.close(); }
  const db = new DatabaseSync(':memory:');
  try {
    const first = migrationFixture(); await importSnapshot(db, first);
    db.exec("CREATE TRIGGER reject_new_rows BEFORE INSERT ON staging_rows BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    const next = structuredClone(first); next.completedAt = '2026-10-09T08:01:00.000Z';
    await assert.rejects(importSnapshot(db, next));
    assert.equal(db.prepare('SELECT count(*) AS n FROM staging_runs').get().n, 1);
    assert.equal((await verifyArchive(db, first)).archiveVerification, 'PASS');
  } finally { db.close(); }
});
test('capture visits every registered workbook sequentially and aborts on a source failure', async () => {
  const fixture = migrationFixture(), calls = [], waits = [];
  const readWorkbook = async (env, id) => {
    calls.push(id); const { inventory, tabs } = fixture.workbooks.find(b => b.spreadsheetId === id); return structuredClone({ inventory, tabs });
  };
  const result = await captureSnapshot({ PLATFORM_SPREADSHEET_ID: fixture.workbooks[0].spreadsheetId },
    { environment: 'local', readWorkbook, pause: async ms => { waits.push(ms); } });
  assert.deepEqual(calls, fixture.workbooks.map(b => b.spreadsheetId));
  assert.equal(waits.length, 3);
  assert.equal((await validateSnapshot(result)).checks.accounts, 200);
  calls.length = 0;
  await assert.rejects(captureSnapshot({ PLATFORM_SPREADSHEET_ID: fixture.workbooks[0].spreadsheetId },
    { readWorkbook: async (env, id) => { calls.push(id); if (calls.length === 2) throw Object.assign(new Error('quota'), { status: 429 }); const { inventory, tabs } = fixture.workbooks.find(b => b.spreadsheetId === id); return structuredClone({ inventory, tabs }); }, pause: async () => {} }));
  await rejectsCode(captureSnapshot({}, { environment: 'production', readWorkbook }), 'PRODUCTION_CAPTURE_DISABLED');
});
test('CLI dry run, import and read-only verification work; reports and failures omit sensitive data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maktab-migration-'));
  const cli = fileURLToPath(new URL('../tools/academy-migration.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  try {
    const snapshotPath = join(directory, 'snapshot.json'), database = join(directory, 'archive.sqlite');
    await writeFile(snapshotPath, JSON.stringify(migrationFixture()), { mode: 0o600 });
    for (const args of [['validate', '--snapshot', snapshotPath], ['archive-source', '--snapshot', snapshotPath, '--database', database],
      ['verify-archive', '--snapshot', snapshotPath, '--database', database]]) {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).snapshotValidation, 'PASS');
      assert.ok(!result.stdout.includes('SYNTHETIC-HASH'));
    }
    assert.equal((await stat(database)).mode & 0o777, 0o600);
    const before = await readFile(database);
    const bad = migrationFixture(); alter(bad, 'UserAccounts', 'UniqueID', 'LOGIN-0001', 3);
    await writeFile(snapshotPath, JSON.stringify(bad));
    const failed = run('archive-source', '--snapshot', snapshotPath, '--database', database);
    assert.equal(failed.status, 1);
    assert.ok(!failed.stderr.includes('SYNTHETIC-HASH'));
    assert.ok(!failed.stderr.includes('login-0001'));
    assert.deepEqual(await readFile(database), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
