import { readFileSync } from 'node:fs';
import { key } from '../../src/programs/model.js';
import { validateSnapshot, sha256, stableJSON, requireCondition } from './snapshot.mjs';

const schema = readFileSync(new URL('../../migrations/academy-staging/0001_snapshot_archive.sql', import.meta.url), 'utf8');
const tableNames = ['staging_accounts', 'staging_books', 'staging_checks', 'staging_rows', 'staging_runs', 'staging_schema', 'staging_tabs'];
function ensureArchive(db, create = false) {
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
  if (!existing.length && create) db.exec(schema);
  else requireCondition(JSON.stringify(existing) === JSON.stringify(tableNames)
    && db.prepare('SELECT version FROM staging_schema').get()?.version === 1, 'NOT_A_MIGRATION_ARCHIVE');
}
function accountIndex(snapshot) {
  const tabIndex = snapshot.workbooks[0].tabs.findIndex(t => t.title === 'UserAccounts');
  const rows = snapshot.workbooks[0].tabs[tabIndex].rows;
  const accountColumn = rows[0].indexOf('AccountID'), loginColumn = rows[0].indexOf('UniqueID');
  return rows.slice(1).flatMap((row, i) => row.some(v => String(v ?? '').trim())
    ? [{ account_key: key(row[accountColumn]), login_key: key(row[loginColumn]), book_index: 0, tab_index: tabIndex, row_number: i + 2 }] : []);
}
function verifyContent(db, snapshot, report) {
  const id = report.snapshotSha256;
  const run = db.prepare('SELECT * FROM staging_runs WHERE snapshot_sha256=?').get(id);
  requireCondition(run?.state === 'CAPTURE_VERIFIED', 'SNAPSHOT_NOT_IMPORTED');
  const reconstructed = JSON.parse(run.envelope_json);
  reconstructed.workbooks = db.prepare('SELECT * FROM staging_books WHERE snapshot_sha256=? ORDER BY book_index').all(id).map((book, b) => {
    requireCondition(book.book_index === b, 'ARCHIVE_COORDINATE_MISMATCH');
    const value = JSON.parse(book.metadata_json);
    value.tabs = db.prepare('SELECT * FROM staging_tabs WHERE snapshot_sha256=? AND book_index=? ORDER BY tab_index').all(id, b).map((tab, t) => {
      requireCondition(tab.tab_index === t, 'ARCHIVE_COORDINATE_MISMATCH');
      const rows = db.prepare('SELECT * FROM staging_rows WHERE snapshot_sha256=? AND book_index=? AND tab_index=? ORDER BY row_number').all(id, b, t);
      requireCondition(rows.length === tab.row_count, 'ARCHIVE_ROW_COUNT_MISMATCH');
      return { ...JSON.parse(tab.metadata_json), rows: rows.map((row, i) => {
        requireCondition(row.row_number === i + 1, 'ARCHIVE_COORDINATE_MISMATCH');
        const cells = JSON.parse(row.cells_json);
        requireCondition(sha256(cells) === row.cells_sha256, 'ARCHIVE_ROW_CHECKSUM_MISMATCH');
        return cells;
      }) };
    });
    return value;
  });
  requireCondition(sha256(reconstructed) === id, 'ARCHIVE_SNAPSHOT_CHECKSUM_MISMATCH');
  const actualAccounts = db.prepare('SELECT account_key,login_key,book_index,tab_index,row_number FROM staging_accounts WHERE snapshot_sha256=? ORDER BY account_key').all(id);
  const expectedAccounts = accountIndex(snapshot).sort((a,b) => a.account_key < b.account_key ? -1 : a.account_key > b.account_key ? 1 : 0);
  requireCondition(stableJSON(actualAccounts) === stableJSON(expectedAccounts), 'ARCHIVE_ACCOUNT_INDEX_MISMATCH');
  const actualChecks = Object.fromEntries(db.prepare('SELECT check_name,checked_count FROM staging_checks WHERE snapshot_sha256=?').all(id).map(r => [r.check_name, r.checked_count]));
  requireCondition(stableJSON(actualChecks) === stableJSON(report.checks), 'ARCHIVE_CHECK_COUNTS_MISMATCH');
  requireCondition(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'ARCHIVE_FOREIGN_KEY_CHECK_FAILED');
  requireCondition(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'ARCHIVE_INTEGRITY_CHECK_FAILED');
}
export async function importSnapshot(db, snapshot) {
  const report = await validateSnapshot(snapshot);
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('BEGIN IMMEDIATE');
  try {
    ensureArchive(db, true);
    const id = report.snapshotSha256;
    if (db.prepare('SELECT 1 FROM staging_runs WHERE snapshot_sha256=?').get(id)) {
      verifyContent(db, snapshot, report);
      db.exec('COMMIT');
      return { ...report, archiveVerification: 'PASS', replayed: true };
    }
    const { workbooks, ...envelope } = snapshot;
    db.prepare('INSERT INTO staging_runs VALUES (?,?,?,?)').run(id, JSON.stringify(envelope), new Date().toISOString(), 'CAPTURE_VERIFIED');
    const addBook = db.prepare('INSERT INTO staging_books VALUES (?,?,?)');
    const addTab = db.prepare('INSERT INTO staging_tabs VALUES (?,?,?,?,?)');
    const addRow = db.prepare('INSERT INTO staging_rows VALUES (?,?,?,?,?,?)');
    for (const [b, book] of workbooks.entries()) {
      const { tabs, ...metadata } = book;
      addBook.run(id, b, JSON.stringify(metadata));
      for (const [t, tab] of tabs.entries()) {
        const { rows, ...tabMetadata } = tab;
        addTab.run(id, b, t, JSON.stringify(tabMetadata), rows.length);
        for (const [r, row] of rows.entries()) addRow.run(id, b, t, r + 1, JSON.stringify(row), sha256(row));
      }
    }
    const addAccount = db.prepare('INSERT INTO staging_accounts VALUES (?,?,?,?,?,?)');
    for (const a of accountIndex(snapshot)) addAccount.run(id, a.account_key, a.login_key, a.book_index, a.tab_index, a.row_number);
    const addCheck = db.prepare('INSERT INTO staging_checks VALUES (?,?,?)');
    for (const [name, count] of Object.entries(report.checks)) addCheck.run(id, name, count);
    verifyContent(db, snapshot, report);
    db.exec('COMMIT');
    return { ...report, archiveVerification: 'PASS', replayed: false };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export async function verifyArchive(db, snapshot) {
  const report = await validateSnapshot(snapshot);
  ensureArchive(db);
  db.exec('BEGIN');
  try {
    verifyContent(db, snapshot, report);
    db.exec('COMMIT');
    return { ...report, archiveVerification: 'PASS' };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
