-- Curriculum definitions belong to the Academy. Scoped module IDs remain
-- unchanged for timetable, task, progress and resource references.
CREATE TABLE academy_module_catalogue (
  module_id TEXT PRIMARY KEY COLLATE NOCASE NOT NULL,
  subject_key TEXT COLLATE NOCASE REFERENCES subject_catalog(subject_key),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  name_key TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1)
);
CREATE UNIQUE INDEX academy_module_subject_name ON academy_module_catalogue(subject_key,name_key) WHERE subject_key IS NOT NULL;
CREATE UNIQUE INDEX academy_module_unclassified_name ON academy_module_catalogue(name_key) WHERE subject_key IS NULL;
CREATE TABLE academy_module_usage (
  activity_key TEXT COLLATE NOCASE NOT NULL,
  module_id TEXT COLLATE NOCASE NOT NULL,
  academy_module_id TEXT COLLATE NOCASE NOT NULL REFERENCES academy_module_catalogue(module_id),
  PRIMARY KEY(activity_key,module_id),
  FOREIGN KEY(activity_key,module_id) REFERENCES modules(activity_key,module_id)
);
CREATE INDEX academy_module_usage_catalogue ON academy_module_usage(academy_module_id);

-- Promote only active subjects currently used by active Programs. Preserve
-- their ProgramSubject IDs and all published snapshots. Never infer a subject
-- from a Course title: unresolved Course modules are flagged for classification.
WITH names AS MATERIALIZED (
  SELECT min(trim(s.name)) name,lower(trim(s.name)) name_key,'AS-'||lower(hex(randomblob(16))) id
  FROM subject_catalog s WHERE s.source_namespace<>'ACADEMY' AND s.active=1
    AND EXISTS(SELECT 1 FROM program_subjects ps JOIN activities a USING(activity_key)
      WHERE ps.subject_key=s.subject_key AND ps.active=1 AND a.active=1 AND a.lifecycle='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM subject_catalog c WHERE c.source_namespace='ACADEMY' AND lower(trim(c.name))=lower(trim(s.name)))
  GROUP BY lower(trim(s.name))
)
INSERT INTO subject_catalog(subject_key,source_namespace,subject_id,name,active)
SELECT 'ACADEMY:'||id,'ACADEMY',id,name,1 FROM names;

UPDATE program_subjects SET subject_key=(SELECT min(c.subject_key) FROM subject_catalog old JOIN subject_catalog c
  ON c.source_namespace='ACADEMY' AND c.active=1 AND lower(trim(c.name))=lower(trim(old.name)) WHERE old.subject_key=program_subjects.subject_key)
WHERE active=1 AND activity_key IN(SELECT activity_key FROM activities WHERE active=1 AND lifecycle='ACTIVE')
  AND subject_key IN(SELECT s.subject_key FROM subject_catalog s WHERE s.source_namespace<>'ACADEMY' AND s.active=1
    AND EXISTS(SELECT 1 FROM subject_catalog c WHERE c.source_namespace='ACADEMY' AND c.active=1 AND lower(trim(c.name))=lower(trim(s.name))));

WITH current_modules AS MATERIALIZED (
  SELECT m.*,s.subject_key catalog_subject FROM modules m JOIN activities a USING(activity_key)
  LEFT JOIN program_subjects ps ON ps.activity_key=m.activity_key AND ps.program_subject_id=m.program_subject_id
  LEFT JOIN subject_catalog s ON s.subject_key=ps.subject_key AND s.source_namespace='ACADEMY' AND s.active=1
  WHERE m.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND (a.kind='COURSE' OR (ps.active=1 AND s.subject_key IS NOT NULL))
)
INSERT INTO academy_module_catalogue(module_id,subject_key,name,name_key,active)
SELECT 'AM-'||lower(hex(randomblob(16))),catalog_subject,min(trim(name)),lower(trim(name)),1
FROM current_modules GROUP BY catalog_subject,lower(trim(name));

INSERT INTO academy_module_usage(activity_key,module_id,academy_module_id)
SELECT m.activity_key,m.module_id,c.module_id FROM modules m JOIN activities a USING(activity_key)
LEFT JOIN program_subjects ps ON ps.activity_key=m.activity_key AND ps.program_subject_id=m.program_subject_id
LEFT JOIN subject_catalog s ON s.subject_key=ps.subject_key AND s.source_namespace='ACADEMY' AND s.active=1
JOIN academy_module_catalogue c ON c.name_key=lower(trim(m.name)) AND c.subject_key IS s.subject_key
WHERE m.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND (a.kind='COURSE' OR (ps.active=1 AND s.subject_key IS NOT NULL));

-- Invalidate any management write planned before this upgrade.
UPDATE academy_write_state SET version=version+1 WHERE singleton=1;
