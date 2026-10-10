-- Optional name-only drafts and delivery lifecycle. Existing publications,
-- participant assignments and import evidence are left intact.
CREATE TABLE course_management_drafts (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES course_settings(activity_key),
  run_id TEXT COLLATE NOCASE NOT NULL,
  details_json TEXT NOT NULL CHECK(json_valid(details_json)),
  stage TEXT NOT NULL CHECK(stage IN ('DRAFT','PUBLISHED','COMPLETE','CANCELLED','ARCHIVED')),
  completed_at TEXT,
  repeated_from_activity_key TEXT COLLATE NOCASE REFERENCES course_settings(activity_key),
  validation_sha256 TEXT CHECK(validation_sha256 IS NULL OR length(validation_sha256)=64),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
  updated_at TEXT NOT NULL,
  updated_by_account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  PRIMARY KEY(activity_key,run_id)
);
CREATE INDEX course_management_by_stage ON course_management_drafts(stage,updated_at);
