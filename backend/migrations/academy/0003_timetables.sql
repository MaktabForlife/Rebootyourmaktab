CREATE TABLE timetable_drafts (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  scope_key TEXT NOT NULL,
  source_revision TEXT,
  source_sequence INTEGER NOT NULL CHECK(source_sequence >= 0),
  draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
  source_draft_sha256 TEXT NOT NULL CHECK(length(source_draft_sha256) = 64),
  modified_at TEXT,
  PRIMARY KEY(activity_key, scope_key)
);
CREATE TABLE course_draft_sessions (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  run_id TEXT COLLATE NOCASE NOT NULL,
  session_id TEXT COLLATE NOCASE NOT NULL,
  module_id TEXT COLLATE NOCASE,
  teacher_account_id TEXT COLLATE NOCASE REFERENCES accounts(account_id),
  session_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  session_kind TEXT NOT NULL,
  zoom_link TEXT,
  schedule_rule_key TEXT,
  occurrence_date TEXT,
  description TEXT,
  PRIMARY KEY(activity_key, run_id, session_id),
  FOREIGN KEY(activity_key, run_id) REFERENCES course_runs(activity_key, run_id),
  FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id)
);
CREATE TABLE timetable_publications (
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES activities(activity_key),
  publication_id TEXT COLLATE NOCASE NOT NULL,
  scope_key TEXT NOT NULL,
  version_no INTEGER NOT NULL CHECK(version_no >= 1),
  pattern TEXT NOT NULL CHECK(pattern IN ('WEEKLY','DATED','COURSE')),
  published_at TEXT,
  published_by_source_id TEXT,
  effective_from TEXT,
  effective_until TEXT,
  timezone TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  source_snapshot_sha256 TEXT NOT NULL CHECK(length(source_snapshot_sha256) = 64),
  conversion TEXT NOT NULL CHECK(conversion IN ('EXACT','ACTIVE_ONLY')),
  PRIMARY KEY(activity_key, publication_id),
  UNIQUE(activity_key, scope_key, version_no)
);
CREATE INDEX publications_by_scope ON timetable_publications(activity_key, scope_key, effective_from, version_no);
CREATE TRIGGER publications_immutable_update BEFORE UPDATE ON timetable_publications
BEGIN SELECT RAISE(ABORT, 'Published timetable versions are immutable'); END;
CREATE TRIGGER publications_immutable_delete BEFORE DELETE ON timetable_publications
BEGIN SELECT RAISE(ABORT, 'Published timetable versions are immutable'); END;
CREATE TABLE published_lessons (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  publication_id TEXT COLLATE NOCASE NOT NULL,
  lesson_anchor TEXT NOT NULL,
  source_rule_id TEXT,
  module_id TEXT COLLATE NOCASE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  weekday INTEGER CHECK(weekday BETWEEN 0 AND 6),
  lesson_date TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  timezone TEXT NOT NULL,
  title TEXT,
  zoom_link TEXT,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  PRIMARY KEY(activity_key, publication_id, lesson_anchor),
  FOREIGN KEY(activity_key, publication_id) REFERENCES timetable_publications(activity_key, publication_id),
  FOREIGN KEY(activity_key, module_id) REFERENCES modules(activity_key, module_id),
  CHECK(weekday IS NOT NULL OR lesson_date IS NOT NULL)
);
CREATE INDEX lessons_by_date ON published_lessons(lesson_date, activity_key, publication_id);
CREATE INDEX lessons_by_weekday ON published_lessons(weekday, activity_key, publication_id);
CREATE TABLE published_lesson_classes (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  publication_id TEXT COLLATE NOCASE NOT NULL,
  lesson_anchor TEXT NOT NULL,
  class_id TEXT COLLATE NOCASE NOT NULL,
  PRIMARY KEY(activity_key, publication_id, lesson_anchor, class_id),
  FOREIGN KEY(activity_key, publication_id, lesson_anchor) REFERENCES published_lessons(activity_key, publication_id, lesson_anchor),
  FOREIGN KEY(activity_key, class_id) REFERENCES classes(activity_key, class_id)
);
CREATE TABLE published_lesson_teachers (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  publication_id TEXT COLLATE NOCASE NOT NULL,
  lesson_anchor TEXT NOT NULL,
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  PRIMARY KEY(activity_key, publication_id, lesson_anchor, account_id),
  FOREIGN KEY(activity_key, publication_id, lesson_anchor) REFERENCES published_lessons(activity_key, publication_id, lesson_anchor)
);
CREATE INDEX teaching_by_account ON published_lesson_teachers(account_id, activity_key, publication_id, lesson_anchor);
CREATE TABLE lesson_lifecycle (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  lifecycle_id TEXT NOT NULL,
  publication_id TEXT COLLATE NOCASE NOT NULL,
  source_session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  replacement_source_session_id TEXT,
  previous_source_session_id TEXT,
  PRIMARY KEY(activity_key, lifecycle_id),
  FOREIGN KEY(activity_key, publication_id) REFERENCES timetable_publications(activity_key, publication_id)
);
CREATE TABLE course_run_state (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  run_id TEXT COLLATE NOCASE NOT NULL,
  stage TEXT,
  current_publication_id TEXT COLLATE NOCASE,
  draft_publish_start_date TEXT,
  draft_publish_end_date TEXT,
  PRIMARY KEY(activity_key, run_id),
  FOREIGN KEY(activity_key, run_id) REFERENCES course_runs(activity_key, run_id),
  FOREIGN KEY(activity_key, current_publication_id) REFERENCES timetable_publications(activity_key, publication_id)
);
