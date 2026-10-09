-- Runtime extension, applied separately after the frozen active-import schema.
-- Imported source rows and live-store ownership remain unchanged.
CREATE TABLE academy_write_state (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  version INTEGER NOT NULL CHECK(version >= 0)
);
INSERT INTO academy_write_state(singleton,version) VALUES(1,0);
CREATE TABLE academy_write_guards (
  guard_id TEXT PRIMARY KEY NOT NULL,
  accepted INTEGER NOT NULL CONSTRAINT academy_management_stale CHECK(accepted = 1)
);
-- Approved by the project owner on 9 October 2026. Retain the imported
-- evidence unchanged; explicit later role edits confirm their individual review.
CREATE TABLE role_mapping_decisions (
  source_role TEXT PRIMARY KEY CHECK(source_role IN ('ADMIN','SENIOR')),
  target_role TEXT NOT NULL CHECK(target_role IN ('PROGRAM_ADMIN','TEACHER')),
  decision_source TEXT NOT NULL,
  approved_at TEXT NOT NULL
);
INSERT INTO role_mapping_decisions VALUES
  ('ADMIN','PROGRAM_ADMIN','PROJECT_OWNER_APPROVAL','2026-10-09'),
  ('SENIOR','TEACHER','PROJECT_OWNER_APPROVAL','2026-10-09');
