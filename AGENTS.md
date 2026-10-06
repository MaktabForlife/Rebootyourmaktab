# Feature branch version rule

- Every update pushed to a `feature/*` branch must include a new release version in that same push. This applies to code, assets, tests, documentation and project-rule updates. Do not push a feature-branch update with the previous release number.
- Use the version requested by the user. Otherwise increment the last numeric component of the current version, and check the remote branch first so the number is not reused.
- Keep the active version markers in sync: root `version.json`, `js/version.json`, `backend/package.json`, `backend/package-lock.json`, the Worker health response, current page version labels, and tests that assert the current version. Change cache query strings for assets updated in the release.
- Add a concise entry to the current release documentation and README. Keep older version references when they describe historical behaviour or earlier acceptance work.
- Before pushing, verify that the active version markers agree, run the affected tests, and check the diff for accidental changes to historical notes.
