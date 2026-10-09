-- Review draft: empty Academy foundation only. No import or live-store switch.
-- Applied once by D1 migrations; do not wrap this file in BEGIN/COMMIT.
-- Original business IDs are retained. Namespaced activity keys prevent collisions.

CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL CHECK (length(trim(account_id)) > 0),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  login_link_id TEXT UNIQUE COLLATE NOCASE NOT NULL CHECK (length(trim(login_link_id)) > 0),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  last_login_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  created_by_source_id TEXT,
  modified_by_source_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);

CREATE TABLE account_credentials (
  account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  pin_hash TEXT,
  pin_setup INTEGER NOT NULL DEFAULT 0 CHECK (pin_setup IN (0, 1)),
  credential_epoch INTEGER NOT NULL DEFAULT 1 CHECK (credential_epoch >= 1),
  updated_at TEXT,
  CHECK (pin_setup = 0 OR length(trim(coalesce(pin_hash, ''))) > 0)
);

CREATE TABLE global_role_assignments (
  assignment_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  role TEXT NOT NULL CHECK (role = 'GLOBAL_ADMIN'),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  review_state TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (review_state IN ('REQUIRED', 'CONFIRMED')),
  granted_at TEXT,
  granted_by_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id)
);
CREATE UNIQUE INDEX one_active_global_role ON global_role_assignments(account_id, role) WHERE active = 1;

CREATE TABLE academy_admissions (
  account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  status TEXT NOT NULL CHECK (status IN ('ADMITTED', 'SUSPENDED', 'WITHDRAWN')),
  review_state TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (review_state IN ('REQUIRED', 'CONFIRMED')),
  admitted_at TEXT,
  admitted_by_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);

CREATE TABLE activities (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  activity_id TEXT COLLATE NOCASE NOT NULL CHECK (length(trim(activity_id)) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('PROGRAM', 'COURSE', 'LEGACY')),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  website_visible INTEGER NOT NULL DEFAULT 0 CHECK (website_visible IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  UNIQUE (kind, activity_id),
  UNIQUE (activity_key, kind),
  CHECK (activity_key = kind || ':' || activity_id COLLATE NOCASE),
  CHECK (kind <> 'LEGACY' OR website_visible = 0)
);

CREATE TABLE activity_source_bindings (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  provider TEXT NOT NULL CHECK (provider IN ('SHEETS', 'HIFZ_SERVICE')),
  source_ref TEXT NOT NULL CHECK (length(trim(source_ref)) > 0),
  schema_version TEXT,
  PRIMARY KEY (activity_key, provider)
);

CREATE TABLE program_settings (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'PROGRAM' CHECK (kind = 'PROGRAM'),
  duration_years INTEGER CHECK (duration_years BETWEEN 1 AND 30),
  timezone TEXT NOT NULL CHECK (length(trim(timezone)) > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  FOREIGN KEY (activity_key, kind) REFERENCES activities(activity_key, kind)
);

CREATE TABLE course_settings (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'COURSE' CHECK (kind = 'COURSE'),
  legacy_access_model TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (legacy_access_model IN ('UNKNOWN', 'FREE', 'PAID')),
  policy_review_state TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (policy_review_state IN ('REQUIRED', 'CONFIRMED')),
  FOREIGN KEY (activity_key, kind) REFERENCES activities(activity_key, kind)
);

CREATE TABLE role_assignments (
  assignment_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'TEACHER', 'PROGRAM_ADMIN')),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  review_state TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (review_state IN ('REQUIRED', 'CONFIRMED')),
  granted_at TEXT,
  granted_by_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);
CREATE UNIQUE INDEX one_active_scoped_role ON role_assignments(account_id, activity_key, role) WHERE active = 1;
CREATE INDEX roles_by_activity ON role_assignments(activity_key, active, review_state, role, account_id);

-- This view is a query building block, not a replacement for endpoint authorization.
-- Visitor is derived from absence of an effective role; it is never a grant.
CREATE VIEW effective_activity_roles AS
SELECT r.assignment_id, r.account_id, r.activity_key, r.role
FROM role_assignments r JOIN accounts a ON a.account_id = r.account_id
WHERE a.active = 1 AND r.active = 1 AND r.review_state = 'CONFIRMED';

CREATE TABLE role_import_reviews (
  review_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  source_locator TEXT NOT NULL,
  source_value TEXT NOT NULL,
  proposed_role TEXT CHECK (proposed_role IN ('STUDENT', 'TEACHER', 'PROGRAM_ADMIN')),
  status TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (status IN ('REQUIRED', 'CONFIRMED', 'REJECTED')),
  note TEXT,
  reviewed_by_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  reviewed_at TEXT,
  CHECK (status = 'REQUIRED' OR (reviewed_by_account_id IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX pending_role_reviews ON role_import_reviews(status, activity_key, account_id);

CREATE TABLE legacy_identity_links (
  link_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  activity_key TEXT COLLATE NOCASE NOT NULL,
  kind TEXT NOT NULL DEFAULT 'LEGACY' CHECK (kind = 'LEGACY'),
  profile_type TEXT NOT NULL CHECK (profile_type IN ('ADMIN', 'STUDENT')),
  local_record_id TEXT COLLATE NOCASE NOT NULL,
  UNIQUE (activity_key, profile_type, local_record_id),
  FOREIGN KEY (activity_key, kind) REFERENCES activities(activity_key, kind)
);

CREATE TABLE academy_settings (
  setting_key TEXT PRIMARY KEY NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT,
  updated_by_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id)
);

CREATE TABLE audit_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  actor_source_id TEXT,
  actor_name_snapshot TEXT,
  authority TEXT,
  scope_key TEXT,
  action TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL CHECK (json_valid(changed_fields_json))
);
CREATE INDEX audit_by_record ON audit_events(record_kind, record_id, occurred_at);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'Audit history is append-only'); END;

CREATE TABLE operation_receipts (
  dataset_key TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  actor_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  completed_at TEXT NOT NULL,
  PRIMARY KEY (dataset_key, scope_key, operation_id)
);

CREATE TABLE migration_runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('LOCAL', 'DEVELOPMENT', 'PRODUCTION')),
  source_snapshot_sha256 TEXT NOT NULL CHECK (length(source_snapshot_sha256) = 64),
  code_commit TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PREPARED', 'IMPORTED', 'VERIFIED', 'CUTOVER', 'FAILED')),
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE source_record_map (
  run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
  source_store_key TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_key TEXT NOT NULL,
  source_record_sha256 TEXT NOT NULL CHECK (length(source_record_sha256) = 64),
  source_row_number INTEGER CHECK (source_row_number >= 2),
  PRIMARY KEY (run_id, source_store_key, source_table, source_id, target_table, target_key)
);
CREATE INDEX imported_target_records ON source_record_map(target_table, target_key, run_id);

CREATE TABLE migration_checks (
  run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
  dataset_key TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PASS', 'FAIL')),
  expected_count INTEGER CHECK (expected_count >= 0),
  actual_count INTEGER CHECK (actual_count >= 0),
  findings_count INTEGER NOT NULL DEFAULT 0 CHECK (findings_count >= 0),
  checked_at TEXT,
  PRIMARY KEY (run_id, dataset_key, scope_key, check_name)
);

CREATE TABLE data_ownership (
  dataset_key TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  authoritative_store TEXT NOT NULL CHECK (authoritative_store IN ('SHEETS', 'D1')),
  phase TEXT NOT NULL CHECK (phase IN ('STAGING', 'ACTIVE', 'RECOVERY')),
  verified_run_id TEXT REFERENCES migration_runs(run_id),
  switched_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  PRIMARY KEY (dataset_key, scope_key),
  CHECK (authoritative_store <> 'D1' OR (verified_run_id IS NOT NULL AND switched_at IS NOT NULL AND phase <> 'STAGING'))
);
CREATE TRIGGER ownership_requires_verified_insert BEFORE INSERT ON data_ownership
WHEN NEW.authoritative_store = 'D1' AND NOT EXISTS (
  SELECT 1 FROM migration_runs WHERE run_id = NEW.verified_run_id AND state IN ('VERIFIED', 'CUTOVER')
)
BEGIN SELECT RAISE(ABORT, 'A verified import is required before cutover'); END;
CREATE TRIGGER ownership_requires_verified_update BEFORE UPDATE ON data_ownership
WHEN NEW.authoritative_store = 'D1' AND NOT EXISTS (
  SELECT 1 FROM migration_runs WHERE run_id = NEW.verified_run_id AND state IN ('VERIFIED', 'CUTOVER')
)
BEGIN SELECT RAISE(ABORT, 'A verified import is required before cutover'); END;
