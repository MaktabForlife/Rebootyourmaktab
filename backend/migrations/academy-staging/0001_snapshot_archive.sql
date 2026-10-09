-- Local rehearsal archive, separate from the proposed operational Academy schema.
-- No Worker binding or live authorization reads this schema.
CREATE TABLE staging_runs (
  snapshot_sha256 TEXT PRIMARY KEY NOT NULL CHECK(length(snapshot_sha256) = 64),
  envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json)),
  imported_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state = 'CAPTURE_VERIFIED')
);
CREATE TABLE staging_books (
  snapshot_sha256 TEXT NOT NULL REFERENCES staging_runs(snapshot_sha256),
  book_index INTEGER NOT NULL CHECK(book_index >= 0),
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  PRIMARY KEY(snapshot_sha256, book_index)
);
CREATE TABLE staging_tabs (
  snapshot_sha256 TEXT NOT NULL,
  book_index INTEGER NOT NULL,
  tab_index INTEGER NOT NULL CHECK(tab_index >= 0),
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  row_count INTEGER NOT NULL CHECK(row_count >= 0),
  PRIMARY KEY(snapshot_sha256, book_index, tab_index),
  FOREIGN KEY(snapshot_sha256, book_index) REFERENCES staging_books(snapshot_sha256, book_index)
);
CREATE TABLE staging_rows (
  snapshot_sha256 TEXT NOT NULL,
  book_index INTEGER NOT NULL,
  tab_index INTEGER NOT NULL,
  row_number INTEGER NOT NULL CHECK(row_number >= 1),
  cells_json TEXT NOT NULL CHECK(json_valid(cells_json)),
  cells_sha256 TEXT NOT NULL CHECK(length(cells_sha256) = 64),
  PRIMARY KEY(snapshot_sha256, book_index, tab_index, row_number),
  FOREIGN KEY(snapshot_sha256, book_index, tab_index) REFERENCES staging_tabs(snapshot_sha256, book_index, tab_index)
);
-- Normalized lookup keys are computed in JS with the current application's rules.
-- Original IDs, role cells and PIN hashes remain unchanged in staging_rows.
CREATE TABLE staging_accounts (
  snapshot_sha256 TEXT NOT NULL,
  account_key TEXT NOT NULL,
  login_key TEXT NOT NULL,
  book_index INTEGER NOT NULL,
  tab_index INTEGER NOT NULL,
  row_number INTEGER NOT NULL,
  PRIMARY KEY(snapshot_sha256, account_key),
  UNIQUE(snapshot_sha256, login_key),
  FOREIGN KEY(snapshot_sha256, book_index, tab_index, row_number)
    REFERENCES staging_rows(snapshot_sha256, book_index, tab_index, row_number)
);
CREATE TABLE staging_checks (
  snapshot_sha256 TEXT NOT NULL REFERENCES staging_runs(snapshot_sha256),
  check_name TEXT NOT NULL,
  checked_count INTEGER NOT NULL CHECK(checked_count >= 0),
  PRIMARY KEY(snapshot_sha256, check_name)
);
-- D1 does not permit writing SQLite's user_version pragma.
CREATE TABLE staging_schema (
  version INTEGER PRIMARY KEY NOT NULL CHECK(version = 1)
);
INSERT INTO staging_schema(version) VALUES (1);
