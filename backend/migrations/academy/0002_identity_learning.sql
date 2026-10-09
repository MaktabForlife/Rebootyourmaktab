-- One Academy database. Scope every Program-local ID with its activity key.
CREATE TABLE academy_import_schema (
  migration_name TEXT PRIMARY KEY NOT NULL,
  migration_sha256 TEXT NOT NULL CHECK(length(migration_sha256) = 64)
);
CREATE TABLE account_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  credential_epoch INTEGER NOT NULL CHECK(credential_epoch >= 1),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at > created_at),
  revoked_at TEXT
);
CREATE INDEX sessions_by_account ON account_sessions(account_id, expires_at);

-- Existing access is evidence, not an automatic HOD/admission/lifetime grant.
CREATE TABLE legacy_access_evidence (
  evidence_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  source_role TEXT NOT NULL CHECK(source_role IN ('STUDENT','TEACHER','ADMIN','SENIOR','LEGACY_SUBSCRIPTION')),
  source_effective INTEGER NOT NULL CHECK(source_effective IN (0,1)),
  source_review_state TEXT NOT NULL,
  source_locator TEXT NOT NULL
);
CREATE INDEX evidence_by_account_scope ON legacy_access_evidence(account_id, activity_key);
-- Historical teacher lists are retained as source evidence; they confer no role.
CREATE TABLE program_legacy_teachers (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
  PRIMARY KEY(activity_key, account_id)
);
CREATE TABLE activity_policy_imports (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  source_access_model TEXT NOT NULL CHECK(source_access_model IN ('FREE','PAID','UNKNOWN')),
  source_review_state TEXT NOT NULL,
  source_stage TEXT,
  source_description TEXT,
  run_id TEXT NOT NULL REFERENCES migration_runs(run_id)
);

-- Academy Program subjects and old Global Courses remain distinct namespaces.
CREATE TABLE subject_catalog (
  subject_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  source_namespace TEXT NOT NULL CHECK(source_namespace IN ('ACADEMY','GLOBAL_REFERENCE')),
  subject_id TEXT COLLATE NOCASE NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  UNIQUE(source_namespace, subject_id)
);
CREATE TABLE program_subjects (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
  program_subject_id TEXT COLLATE NOCASE NOT NULL,
  subject_key TEXT COLLATE NOCASE NOT NULL REFERENCES subject_catalog(subject_key),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, program_subject_id)
);
CREATE TABLE program_levels (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  level_id TEXT COLLATE NOCASE NOT NULL,
  program_subject_id TEXT COLLATE NOCASE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, level_id),
  UNIQUE(activity_key, level_id, program_subject_id),
  FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id)
);
CREATE TABLE modules (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  module_id TEXT COLLATE NOCASE NOT NULL,
  program_subject_id TEXT COLLATE NOCASE,
  level_id TEXT COLLATE NOCASE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, module_id),
  FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
  FOREIGN KEY(activity_key, level_id, program_subject_id) REFERENCES program_levels(activity_key, level_id, program_subject_id),
  CHECK(level_id IS NULL OR program_subject_id IS NOT NULL)
);
CREATE TABLE tasks (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  task_id TEXT COLLATE NOCASE NOT NULL,
  program_subject_id TEXT COLLATE NOCASE,
  module_id TEXT COLLATE NOCASE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, task_id),
  FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
  FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id)
);
CREATE TABLE classes (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
  class_id TEXT COLLATE NOCASE NOT NULL,
  name TEXT NOT NULL,
  academic_year TEXT,
  zoom_link TEXT,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, class_id)
);
CREATE TABLE class_memberships (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  enrollment_id TEXT COLLATE NOCASE NOT NULL,
  class_id TEXT COLLATE NOCASE NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  start_date TEXT,
  end_date TEXT,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, enrollment_id),
  FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id),
  CHECK(start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX memberships_by_person ON class_memberships(account_id, active, activity_key, class_id);
CREATE INDEX memberships_by_class ON class_memberships(activity_key, class_id, active, account_id);
CREATE TABLE class_teacher_assignments (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  class_id TEXT COLLATE NOCASE NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  responsibility TEXT NOT NULL CHECK(responsibility IN ('DEFAULT','ADDITIONAL')),
  PRIMARY KEY(activity_key, class_id, account_id),
  FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id)
);
CREATE TABLE class_module_progress (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  progress_id TEXT COLLATE NOCASE NOT NULL,
  class_id TEXT COLLATE NOCASE NOT NULL,
  module_id TEXT COLLATE NOCASE NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','INACTIVE','COMPLETED')),
  PRIMARY KEY(activity_key, progress_id),
  UNIQUE(activity_key, class_id, module_id),
  FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id),
  FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id)
);
CREATE TABLE program_resources (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
  resource_id TEXT COLLATE NOCASE NOT NULL,
  program_subject_id TEXT COLLATE NOCASE,
  level_id TEXT COLLATE NOCASE,
  module_id TEXT COLLATE NOCASE,
  task_id TEXT COLLATE NOCASE,
  resource_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  drive_file_id TEXT,
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, resource_id),
  FOREIGN KEY(activity_key, program_subject_id) REFERENCES program_subjects(activity_key, program_subject_id),
  FOREIGN KEY(activity_key, level_id) REFERENCES program_levels(activity_key, level_id),
  FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
  FOREIGN KEY(activity_key, task_id) REFERENCES tasks(activity_key, task_id)
);
CREATE TABLE program_library_roots (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY(activity_key, folder_id)
);
CREATE TABLE management_revisions (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
  source_revision TEXT,
  source_sequence INTEGER NOT NULL CHECK(source_sequence >= 0),
  source_snapshot_sha256 TEXT NOT NULL CHECK(length(source_snapshot_sha256) = 64),
  modified_at TEXT,
  modified_by_source_id TEXT
);
CREATE TABLE course_runs (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES course_settings(activity_key),
  run_id TEXT COLLATE NOCASE NOT NULL,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  schedule_mode TEXT,
  schedule_definition TEXT,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, run_id)
);
CREATE TABLE course_resources (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES course_settings(activity_key),
  resource_id TEXT COLLATE NOCASE NOT NULL,
  module_id TEXT COLLATE NOCASE,
  task_id TEXT COLLATE NOCASE,
  name TEXT NOT NULL,
  resource_type TEXT,
  resource_format TEXT,
  description TEXT,
  resource_link TEXT,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key, resource_id),
  FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
  FOREIGN KEY(activity_key, task_id) REFERENCES tasks(activity_key, task_id)
);
