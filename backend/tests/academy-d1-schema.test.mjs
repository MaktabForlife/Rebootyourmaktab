import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const schema = readFileSync(new URL('../migrations/academy/0001_academy_foundation.sql', import.meta.url), 'utf8');
const timestamp = '2026-10-09T12:00:00.000Z';
const hash = 'a'.repeat(64);

function fixture(run) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(schema);
    db.prepare('INSERT INTO accounts(account_id, display_name, login_link_id, active) VALUES (?, ?, ?, ?)')
      .run('TEST-PERSON', 'Synthetic learner', 'TEST-LINK', 1);
    db.prepare('INSERT INTO activities(activity_key, activity_id, kind, name, active, lifecycle) VALUES (?, ?, ?, ?, ?, ?)')
      .run('PROGRAM:TEST-PROGRAM', 'TEST-PROGRAM', 'PROGRAM', 'Synthetic Program', 1, 'DRAFT');
    run(db);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
}

function grant(db, id, activity, role, review = 'CONFIRMED') {
  db.prepare('INSERT INTO role_assignments(assignment_id, account_id, activity_key, role, active, review_state) VALUES (?, ?, ?, ?, 1, ?)')
    .run(id, 'TEST-PERSON', activity, role, review);
}

test('foundation is empty and identity uniqueness matches current case-insensitive lookups', () => {
  fixture(db => {
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type = 'table'").get().n, 18);
    assert.equal(db.prepare('SELECT count(*) AS n FROM data_ownership').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM account_credentials').get().n, 0);
    assert.throws(() => db.prepare('INSERT INTO accounts(account_id, display_name, login_link_id, active) VALUES (?, ?, ?, 1)')
      .run('test-person', 'Duplicate', 'ANOTHER-LINK'), /UNIQUE/);
    assert.throws(() => db.prepare('INSERT INTO accounts(account_id, display_name, login_link_id, active) VALUES (?, ?, ?, 1)')
      .run('ANOTHER-PERSON', 'Duplicate link', 'test-link'), /UNIQUE/);
    assert.equal(db.prepare('SELECT account_id FROM accounts WHERE account_id = ?').get('test-person').account_id, 'TEST-PERSON');
  });
});

test('credentials need a real parent and configured PIN state needs a stored hash', () => {
  fixture(db => {
    assert.throws(() => db.prepare('INSERT INTO account_credentials(account_id, pin_setup) VALUES (?, 0)').run('MISSING'), /FOREIGN KEY/);
    assert.throws(() => db.prepare('INSERT INTO account_credentials(account_id, pin_setup) VALUES (?, 1)').run('TEST-PERSON'), /CHECK/);
    db.prepare('INSERT INTO account_credentials(account_id, pin_setup, pin_hash) VALUES (?, 1, ?)')
      .run('TEST-PERSON', 'synthetic-hash-format-tested-by-importer');
    assert.throws(() => db.prepare('DELETE FROM accounts WHERE account_id = ?').run('TEST-PERSON'), /FOREIGN KEY/);
    assert.throws(() => db.prepare('UPDATE account_credentials SET credential_epoch = 0').run(), /CHECK/);
  });
});

test('scoped roles support combinations without granting unreviewed or inactive access', () => {
  fixture(db => {
    grant(db, 'TEST-ROLE-STUDENT', 'PROGRAM:TEST-PROGRAM', 'STUDENT');
    grant(db, 'TEST-ROLE-TEACHER', 'PROGRAM:TEST-PROGRAM', 'TEACHER');
    grant(db, 'TEST-ROLE-HOD', 'PROGRAM:TEST-PROGRAM', 'PROGRAM_ADMIN', 'REQUIRED');
    assert.deepEqual(db.prepare('SELECT role FROM effective_activity_roles ORDER BY role').all().map(r => r.role), ['STUDENT', 'TEACHER']);
    assert.throws(() => grant(db, 'TEST-DUPLICATE', 'PROGRAM:TEST-PROGRAM', 'STUDENT'), /UNIQUE/);
    for (const role of ['VISITOR', 'GLOBAL_ADMIN', 'SENIOR']) {
      assert.throws(() => grant(db, `TEST-${role}`, 'PROGRAM:TEST-PROGRAM', role), /CHECK/);
    }
    assert.throws(() => grant(db, 'TEST-ORPHAN', 'PROGRAM:MISSING', 'STUDENT'), /FOREIGN KEY/);
    db.exec('UPDATE accounts SET active = 0');
    assert.equal(db.prepare('SELECT count(*) AS n FROM effective_activity_roles').get().n, 0);
  });
});

test('activity namespaces preserve reused source IDs and prevent wrong-kind children or legacy website exposure', () => {
  fixture(db => {
    db.prepare('INSERT INTO activities(activity_key, activity_id, kind, name, active, lifecycle) VALUES (?, ?, ?, ?, 1, ?)')
      .run('COURSE:TEST-PROGRAM', 'TEST-PROGRAM', 'COURSE', 'Synthetic Course', 'ACTIVE');
    db.prepare('INSERT INTO course_settings(activity_key) VALUES (?)').run('COURSE:TEST-PROGRAM');
    assert.throws(() => db.prepare('INSERT INTO program_settings(activity_key, timezone) VALUES (?, ?)')
      .run('COURSE:TEST-PROGRAM', 'Africa/Johannesburg'), /FOREIGN KEY/);
    db.prepare('INSERT INTO program_settings(activity_key, timezone) VALUES (?, ?)')
      .run('PROGRAM:TEST-PROGRAM', 'Africa/Johannesburg');
    assert.throws(() => db.prepare('INSERT INTO activities(activity_key, activity_id, kind, name, active, lifecycle) VALUES (?, ?, ?, ?, 1, ?)')
      .run('BAD-KEY', 'TEST-OTHER', 'PROGRAM', 'Invalid scope', 'DRAFT'), /CHECK/);
    db.exec("INSERT INTO activities(activity_key, activity_id, kind, name, active, lifecycle) VALUES ('LEGACY:TEST-LEGACY', 'TEST-LEGACY', 'LEGACY', 'Synthetic legacy', 1, 'ACTIVE')");
    assert.throws(() => db.exec("UPDATE activities SET website_visible = 1 WHERE kind = 'LEGACY'"), /CHECK/);
    grant(db, 'TEST-PROGRAM-ROLE', 'PROGRAM:TEST-PROGRAM', 'TEACHER');
    assert.equal(db.prepare('SELECT count(*) AS n FROM effective_activity_roles WHERE activity_key = ?').get('COURSE:TEST-PROGRAM').n, 0);
  });
});

test('review decisions require attribution and global authority is kept out of scoped roles', () => {
  fixture(db => {
    db.exec("INSERT INTO role_import_reviews(review_id, account_id, activity_key, source_locator, source_value, proposed_role) VALUES ('TEST-REVIEW', 'TEST-PERSON', 'PROGRAM:TEST-PROGRAM', 'SyntheticMatrix', 'SENIOR', 'PROGRAM_ADMIN')");
    assert.throws(() => db.exec("UPDATE role_import_reviews SET status = 'CONFIRMED'"), /CHECK/);
    db.prepare("UPDATE role_import_reviews SET status = 'CONFIRMED', reviewed_by_account_id = ?, reviewed_at = ?")
      .run('TEST-PERSON', timestamp);
    assert.equal(db.prepare('SELECT count(*) AS n FROM effective_activity_roles').get().n, 0);
    assert.throws(() => db.exec("INSERT INTO global_role_assignments(assignment_id, account_id, role, active) VALUES ('TEST-GLOBAL', 'TEST-PERSON', 'TEACHER', 1)"), /CHECK/);
  });
});

test('audit history is append-only and receipts distinguish dataset, scope and operation', () => {
  fixture(db => {
    db.prepare('INSERT INTO audit_events(event_id, occurred_at, actor_account_id, action, record_kind, record_id, changed_fields_json) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('TEST-AUDIT', timestamp, 'TEST-PERSON', 'TEST_ACTION', 'USER_ACCOUNT', 'TEST-PERSON', '["DisplayName"]');
    assert.throws(() => db.exec("UPDATE audit_events SET action = 'REWRITTEN'"), /append-only/);
    assert.throws(() => db.exec('DELETE FROM audit_events'), /append-only/);
    const receipt = db.prepare('INSERT INTO operation_receipts(dataset_key, scope_key, operation_id, payload_sha256, result_json, completed_at) VALUES (?, ?, ?, ?, ?, ?)');
    receipt.run('IDENTITY', 'ACADEMY', 'TEST-OPERATION', hash, '{"saved":true}', timestamp);
    assert.throws(() => receipt.run('IDENTITY', 'ACADEMY', 'TEST-OPERATION', hash, '{}', timestamp), /UNIQUE/);
    receipt.run('ATTENDANCE', 'PROGRAM:TEST-PROGRAM', 'TEST-OPERATION', hash, '{}', timestamp);
    assert.equal(db.prepare('SELECT count(*) AS n FROM operation_receipts').get().n, 2);
  });
});

test('ownership cannot switch to an unverified import on insert or update', () => {
  fixture(db => {
    db.prepare('INSERT INTO migration_runs(run_id, environment, source_snapshot_sha256, code_commit, state, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('TEST-RUN', 'LOCAL', hash, 'synthetic-commit', 'IMPORTED', timestamp);
    const activate = db.prepare('INSERT INTO data_ownership(dataset_key, scope_key, authoritative_store, phase, verified_run_id, switched_at) VALUES (?, ?, ?, ?, ?, ?)');
    assert.throws(() => activate.run('IDENTITY', 'ACADEMY', 'D1', 'ACTIVE', 'TEST-RUN', timestamp), /verified import/);
    activate.run('IDENTITY', 'ACADEMY', 'SHEETS', 'STAGING', null, null);
    const switchOwner = db.prepare("UPDATE data_ownership SET authoritative_store = 'D1', phase = 'ACTIVE', verified_run_id = ?, switched_at = ?");
    assert.throws(() => switchOwner.run('TEST-RUN', timestamp), /verified import/);
    db.exec("UPDATE migration_runs SET state = 'VERIFIED'");
    switchOwner.run('TEST-RUN', timestamp);
    assert.equal(db.prepare('SELECT authoritative_store FROM data_ownership').get().authoritative_store, 'D1');
    assert.throws(() => db.exec("UPDATE data_ownership SET phase = 'STAGING'"), /CHECK/);
  });
});

test('provenance supports one source account split across profile and credentials without storing raw records', () => {
  fixture(db => {
    db.prepare('INSERT INTO migration_runs(run_id, environment, source_snapshot_sha256, code_commit, state, started_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('TEST-RUN', 'LOCAL', hash, 'synthetic-commit', 'PREPARED', timestamp);
    const map = db.prepare('INSERT INTO source_record_map(run_id, source_store_key, source_table, source_id, target_table, target_key, source_record_sha256, source_row_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const table of ['accounts', 'account_credentials']) {
      map.run('TEST-RUN', 'SYNTHETIC-WORKBOOK', 'UserAccounts', 'TEST-PERSON', table, 'TEST-PERSON', hash, 7);
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM source_record_map').get().n, 2);
    assert.throws(() => map.run('MISSING-RUN', 'SYNTHETIC-WORKBOOK', 'UserAccounts', 'TEST-PERSON', 'accounts', 'TEST-PERSON', hash, 7), /FOREIGN KEY/);
  });
});
