-- Separate from the frozen base import. Source selection remains active-only.
CREATE TABLE course_workflow_imports (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  base_run_id TEXT NOT NULL REFERENCES migration_runs(run_id),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  imported_at TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json))
);
CREATE TABLE course_run_access (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  run_id TEXT COLLATE NOCASE NOT NULL,
  access_model TEXT NOT NULL CHECK(access_model IN ('FREE','PAID')),
  PRIMARY KEY(activity_key,run_id),
  FOREIGN KEY(activity_key,run_id) REFERENCES course_runs(activity_key,run_id)
);
CREATE TABLE course_session_state (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  run_id TEXT COLLATE NOCASE NOT NULL,
  session_id TEXT COLLATE NOCASE NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  PRIMARY KEY(activity_key,run_id,session_id),
  FOREIGN KEY(activity_key,run_id,session_id) REFERENCES course_draft_sessions(activity_key,run_id,session_id)
);
CREATE TABLE course_draft_lifecycle (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  run_id TEXT COLLATE NOCASE NOT NULL,
  session_id TEXT COLLATE NOCASE NOT NULL,
  lifecycle_id TEXT UNIQUE COLLATE NOCASE NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('SCHEDULED','CANCELLED','RESCHEDULED')),
  previous_session_id TEXT,
  replacement_session_id TEXT,
  PRIMARY KEY(activity_key,run_id,session_id),
  FOREIGN KEY(activity_key,run_id,session_id) REFERENCES course_draft_sessions(activity_key,run_id,session_id)
);
CREATE TABLE academy_calendar_events (
  event_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('TERM','ISLAMIC_DAY','PUBLIC_HOLIDAY')),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 400),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL CHECK(end_date>=start_date),
  alternate_date TEXT,
  teaching_impact TEXT NOT NULL CHECK(teaching_impact IN ('INFORMATION','NO_TEACHING')),
  active INTEGER NOT NULL CHECK(active IN (0,1))
);
-- Only removed holiday dates are retained, not inactive source event records.
CREATE TABLE academy_calendar_suppressions (
  calendar_date TEXT PRIMARY KEY NOT NULL
);
