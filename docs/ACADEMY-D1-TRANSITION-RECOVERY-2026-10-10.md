# D1 transition and new-write recovery — 10 October 2026

**Completed in the dedicated synthetic Cloudflare environment. The main website remains on Sheets.** The administrative switch now checks the complete reviewed state inside its activation transaction. Recovery preserves the latest D1 writes rather than reverting to an older Sheets copy. All **122 regression test files pass**, including eight new transition/recovery cases.

## Hosted results

Only test database `c5b96e84-f6ae-4fa6-ba7b-3ce91fe5c22c` and Worker `academy-d1-core-test-20261010-a01264a4` were changed. The fixture contains five Programs, two Courses and initially 200 synthetic accounts. Every activation evidence reference explicitly says **synthetic test only, not live approval**.

| Check | Result |
| --- | --- |
| Preserve the preceding test state | All 62 tables and 619 preceding test sessions backed up; two exact local restores verified before replacement. |
| Install staging fixture | All schema and content match the prepared staging snapshot. Ownership remains Sheets/staging until the tested transition. |
| Late failure in activation audit | HTTP 409; the entire schema/content fingerprint remains unchanged. No partial ownership, evidence, session, audit or receipt changes; zero leftover guards. |
| External edit without a write-version change | HTTP 409; the SQL snapshot guard rejects the stale plan and leaves the edited database otherwise unchanged. |
| Reviewed synthetic activation | One transaction containing 19 statements activates all seven activity scopes. |
| Retry after discarding the success acknowledgement | Saved result returned; exactly one activation audit and one receipt. |
| Unauthorized controller call | HTTP 401 before database access. The temporary controller was deleted after testing. |
| Application writes before recovery | 12 successful hosted requests create a learner, Student role, class enrolment, new PIN and calendar entry; Home shows the new calendar entry. |
| Additional security/access checks | 26 hosted POST checks and anonymous public metadata pass: role boundaries, explicit paid Course policy, grant/replay/revoke, wrong PIN, reset/epoch, setup/logout and private-media rejection. |
| Latest complete backup | 62 tables, 201 accounts and seven sessions. New writes affect 11 tables; original import evidence remains present. |
| Latest-state restoration | Two local restores and one hosted restore match the full schema/content fingerprint exactly. Foreign-key check is empty; quick check is `ok`; zero guards. |
| Application behaviour after restore | Nine hosted checks pass: new learner login/Home/profile/Student role/calendar, reset PIN accepted, old PIN rejected, Course revocation retained, reset and logged-out sessions still rejected. |
| Cleanup | Test application paused again; privileged temporary test controller deleted; database and private evidence retained. |

The existing matched [100/200-flow peak comparison](ACADEMY-D1-PEAK-2026-10-10.md) remains separate evidence. This stage does not claim new capacity or browser measurements.

## Activation implementation

`backend/tools/academy-migration/activation.mjs` still requires all eight explicit review checks, the source hash, reviewed code commit and public-only Library mode. Missing evidence produces no executable statements. No review for the real import has been marked passed automatically.

`atomic-snapshot.mjs` adds an SQL guard comparing the reviewed schema and every application table inside the same transaction as ownership changes. It detects edits that bypass the application write counter. Nested JSON arrays preserve types, nulls and duplicate rows without requiring a SQLite hashing extension. The tested 62-table guard uses 64 bound parameters. Preparation fails closed when parameter, SQL, function-argument or value sizes exceed its supported limits. This full-state guard is for the controlled transition, not normal user requests.

`remote-activation.mjs` executes a fixed artifact through one primary-session [D1 binding batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). It pins the complete artifact hash, validates evidence and statement hashes, and checks the activation receipt before execution and after a failed acknowledgement. Never apply the activation statements individually or as an SQL-file import. A storage flag alone cannot activate a staging import.

The disposable test controller accepts no SQL or plan bytes from the caller, requires a private bearer secret, rejects browser-origin requests and refuses the main database UUID. Cloudflare can represent an empty POST as an empty stream; this was corrected and covered locally and in the hosted trial. No administrative HTTP route was added to the Academy application. Any future main execution requires its own reviewed deployment/target and final approval.

**Activation plans are private.** Their exact-state parameters contain account data and credential hashes. Keep plans, snapshots, SQL and secrets outside Git and browser responses, with restricted permissions. Count-only reports can be reviewed separately.

## Recovery implementation and limits

`backend/tools/academy-migration/recovery.mjs` captures complete schema/data, validates artifact and content hashes, restores into an empty local destination and compares two snapshots without disclosing row values. Changes are counted as removed/added rows, including modifications and deletions in tables without primary keys. The latest full snapshot holds the actual values needed for recovery.

The SQL exporter creates and inserts parent records before dependants, and installs triggers after data. The first hosted attempts using alphabetical insertion returned `D1_RESET_DO`; readback proved the old state remained unchanged. Parent ordering resolved this in the isolated trial and the later latest-state hosted restore passed. Deferral remains enabled until transaction completion. Do not turn it off early, which can discard deferred violations. Native regression checks cover parent ordering, null/Unicode/NUL values, duplicates, deleted rows, invalid foreign keys and refused overwrites.

This exporter refuses unsupported values, cross-table dependency cycles and statements larger than 100,000 bytes. These need a separately reviewed recovery path; do not split them blindly or relax the checks. See the [current D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [import/export guidance](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

Remote readback is consistent only after **every writer** stops. Pausing the Academy Worker does not stop direct D1 clients, spreadsheets or Apps Script. The synthetic environment had no scheduled or outside writers; its controller was removed before new-write recovery. A live transition needs evidence covering all real writers.

Prefer preserving the latest D1 state and repairing/restoring D1. **Switching `OFF` after D1 has accepted writes is not an automatic rollback to Sheets.** No reverse projection or automatic Sheets reconciliation is implemented. A prior snapshot or historical restore can omit later accounts, access changes and credentials. D1 snapshots also do not back up Worker secrets/configuration, Open Library Durable Object data, covers or other media stores; retain those separately. This trial did not change their main namespaces.

## Offline recovery commands

`backend/tools/academy-d1-recovery.mjs` provides offline commands. Outputs are new files with owner-only permissions; existing destinations are refused. Use a private directory outside Git. These commands do not deploy or write remote databases.

```sh
node backend/tools/academy-d1-recovery.mjs capture-local --database QUIESCED_COPY.sqlite --database-id DATABASE_UUID --quiescence-reference REVIEW_REFERENCE --output PRIVATE_DIRECTORY/latest.json
node backend/tools/academy-d1-recovery.mjs restore-local --snapshot PRIVATE_DIRECTORY/latest.json --database PRIVATE_DIRECTORY/restored.sqlite
node backend/tools/academy-d1-recovery.mjs compare --baseline PRIVATE_DIRECTORY/baseline.json --latest PRIVATE_DIRECTORY/latest.json --output PRIVATE_DIRECTORY/delta.json
node backend/tools/academy-d1-recovery.mjs export-sql --snapshot PRIVATE_DIRECTORY/latest.json --output PRIVATE_DIRECTORY/restore.sql
```

Remote restoration in this trial used a separately guarded, disposable synthetic target after backup and two successful local restores. The offline tool supplies no destructive remote restore command and no automatic main-database activation.

Private evidence is retained under `.academy-migration/transition-recovery-20261010-c5b96e84/`, including previous/latest/final snapshots, restored copies, fixed activation artifacts, readbacks, build/deployment logs and a file-hash manifest. Never publish the private directory.

## Main application and remaining work

The main database `7e732b79-a72f-4da6-be83-524919c49ba4` remains at 45 application tables, 73 accounts, zero D1 sessions and Sheets/staging ownership. V106.0 `devrebootworker` remains the current Sheets application; `rebootworker` remains legacy. Anonymous main Open Library retains 18 records. No main schema, data, runtime ownership, secrets or storage flags changed. No feature push occurred; a later feature push requires a synchronized new version.

Browser acceptance is still pending: the approved in-app browser returns **`net::ERR_BLOCKED_BY_CLIENT`** for the current Worker URL. No alternate browser or security-policy workaround was used. API and synthetic tests do not replace navigation through the real screens.

Before a main switch: finish browser acceptance; stop all source writers and reconcile a fresh capture; verify the real candidate and current backup; regenerate the concrete transition review against the final code and data; obtain owner release approval; then perform the controlled deployment and activation. The [eight-check contract](ACADEMY-D1-CORE-ACTIVATION.md) still applies.

The Module media subscription/lifetime-entitlement model remains unbuilt. Main and test activation preparation keep protected media disabled and do not infer Module entitlements from Program enrolment or Course access.
