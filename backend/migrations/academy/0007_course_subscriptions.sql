-- Runtime extension only. Existing source evidence and grants are unchanged.
-- A confirmed administrator decision overrides imported Course subscription
-- evidence for exactly one account/Course pair, including explicit revocation.
CREATE TABLE course_subscription_decisions (
  account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  activity_key TEXT COLLATE NOCASE NOT NULL REFERENCES course_settings(activity_key),
  active INTEGER NOT NULL CHECK(active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  updated_at TEXT NOT NULL,
  updated_by_account_id TEXT COLLATE NOCASE NOT NULL REFERENCES accounts(account_id),
  PRIMARY KEY(account_id,activity_key)
);
CREATE INDEX course_subscriptions_by_activity ON course_subscription_decisions(activity_key,active,account_id);

CREATE VIEW effective_course_subscriptions AS
SELECT account_id,activity_key FROM course_subscription_decisions WHERE active=1
UNION
SELECT e.account_id,e.activity_key FROM legacy_access_evidence e
WHERE e.source_role='LEGACY_SUBSCRIPTION' AND e.source_effective=1
  AND NOT EXISTS(SELECT 1 FROM course_subscription_decisions d
    WHERE d.account_id=e.account_id AND d.activity_key=e.activity_key);
