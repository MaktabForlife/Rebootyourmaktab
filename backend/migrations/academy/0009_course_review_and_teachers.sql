-- Academy teaching eligibility is separate from administrator authority and
-- scoped lesson access. Existing assignments and publications are preserved.
CREATE TABLE academy_teacher_designations (
  account_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  updated_at TEXT NOT NULL,
  updated_by_account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id)
);

ALTER TABLE course_management_drafts ADD COLUMN schedule_sha256 TEXT
  CHECK(schedule_sha256 IS NULL OR length(schedule_sha256)=64);
ALTER TABLE course_management_drafts ADD COLUMN accepted_sha256 TEXT
  CHECK(accepted_sha256 IS NULL OR length(accepted_sha256)=64);
