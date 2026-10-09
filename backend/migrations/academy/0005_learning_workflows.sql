-- Separate runtime extension; the frozen three-migration import stays unchanged.
CREATE TABLE program_publication_state (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES program_settings(activity_key),
  latest_publication_id TEXT COLLATE NOCASE,
  FOREIGN KEY(activity_key,latest_publication_id) REFERENCES timetable_publications(activity_key,publication_id)
);
INSERT INTO program_publication_state(activity_key,latest_publication_id)
  SELECT s.activity_key,(SELECT p.publication_id FROM timetable_publications p WHERE p.activity_key=s.activity_key ORDER BY p.version_no DESC LIMIT 1)
  FROM program_settings s;
CREATE TABLE learning_imports (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  base_run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
  source_sha256 TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json))
);
CREATE TABLE library_access_policies (
  resource_key TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('ASSIGNED','ACADEMY_LEARNERS','SUBSCRIPTION','STAFF_ONLY','INVALID')),
  entitlement_source TEXT,
  subscription_scope TEXT
);
-- Identifier-only exclusions prevent an archived policy falling back to Assigned.
CREATE TABLE library_exclusions (
  resource_key TEXT PRIMARY KEY NOT NULL
);
CREATE TABLE program_library_destinations (
  activity_key TEXT PRIMARY KEY COLLATE NOCASE REFERENCES program_settings(activity_key),
  folder_id TEXT NOT NULL,
  FOREIGN KEY(activity_key,folder_id) REFERENCES program_library_roots(activity_key,folder_id)
);
INSERT INTO program_library_destinations SELECT activity_key,min(folder_id) FROM program_library_roots GROUP BY activity_key;
CREATE TABLE attendance_registers (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES program_settings(activity_key),
  register_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence>0),
  attendance_date TEXT NOT NULL,
  publication_id TEXT COLLATE NOCASE NOT NULL,
  lesson_anchor TEXT NOT NULL,
  lesson_json TEXT NOT NULL CHECK(json_valid(lesson_json)),
  learner_count INTEGER NOT NULL CHECK(learner_count>=0),
  submitted_at TEXT NOT NULL,
  submitted_by_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  source_actor_id TEXT,
  operation_id TEXT NOT NULL,
  PRIMARY KEY(activity_key,register_id),
  UNIQUE(activity_key,sequence),
  FOREIGN KEY(activity_key,publication_id) REFERENCES timetable_publications(activity_key,publication_id)
);
CREATE INDEX attendance_by_day ON attendance_registers(activity_key,attendance_date,sequence);
CREATE TABLE attendance_marks (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  register_id TEXT NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PRESENT','ABSENT','EXCUSED')),
  PRIMARY KEY(activity_key,register_id,account_id),
  FOREIGN KEY(activity_key,register_id) REFERENCES attendance_registers(activity_key,register_id)
);
CREATE TRIGGER attendance_registers_no_update BEFORE UPDATE ON attendance_registers
BEGIN SELECT RAISE(ABORT,'Attendance history is append-only'); END;
CREATE TRIGGER attendance_registers_no_delete BEFORE DELETE ON attendance_registers
BEGIN SELECT RAISE(ABORT,'Attendance history is append-only'); END;
CREATE TRIGGER attendance_marks_no_update BEFORE UPDATE ON attendance_marks
BEGIN SELECT RAISE(ABORT,'Attendance marks are append-only'); END;
CREATE TRIGGER attendance_marks_no_delete BEFORE DELETE ON attendance_marks
BEGIN SELECT RAISE(ABORT,'Attendance marks are append-only'); END;
