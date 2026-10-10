# Core D1 activation preparation — 10 October 2026

**Later hosted verification:** The owner supplied a new empty test database. The separate test Worker passed 200/200 and 100/100 complete hosted flows plus representative core saves and permissions. Peak latency needs profiling; the test Worker is now paused. The initial creation failure described below no longer prevents testing with that owner-created target. No main application switch occurred. See [hosted results and remaining work](ACADEMY-D1-HOSTED-CORE-2026-10-10.md).

The core application now has a tested activation contract and a public-only Library mode. **This is local preparation, not a completed live switch.** No feature push, Worker deployment, main database migration or storage flag change was performed. The current application remains `devrebootworker`; `rebootworker` remains legacy.

The working sequence is to finish the core migration separately from the new Module media subscription feature. That feature is still unbuilt. The [agreed Library model](ACADEMY-LIBRARY-ACCESS-MODEL.md) remains the specification; existing Course access and Program enrolments do not create Module media entitlements.

## Runtime changes

| Mode | Behaviour |
| --- | --- |
| Unset or `OFF` | Existing Sheets application. No configuration was changed in this increment. |
| `REHEARSAL` | Existing isolated D1 workflow testing; requires imported data with Sheets/staging ownership. |
| `PAUSED` | Reject requests before authentication, database access or Sheets fallback; return a maintenance response with a 60-second retry header. This pauses this Worker only, not direct spreadsheet or Apps Script writers. |
| `ACTIVE` | D1 only, with a pinned import run, verified activation evidence and D1/active ownership for every activity. Requires `ACADEMY_LIBRARY_MODE=PUBLIC_ONLY`. Invalid or mixed ownership fails closed. |

The active mode remains limited to the existing `local`/`development` environment names because the development-named Worker is the current main application. No production-named target is enabled.

In public-only mode, anonymous Open Library metadata and covers retain their existing service path. Signed-in public recommendations retain their Program/Course references. Personal Library returns no private resources and explains that private media is pending. Protected file delivery, old file tickets, uploads and Program/Course folder/resource administration are rejected on the server. Existing imported resource records are preserved; they are not granted through the preceding access model. No new Module subscription or lifetime-entitlement table, decision or grant is added.

New Programs and Courses inherit the active D1 ownership and verified import run. This prevents a newly created activity from accidentally restoring staging ownership and making the application unavailable.

## Reviewed transition and remaining execution work

`backend/tools/academy-migration/activation.mjs` builds an offline plan against an exact schema/content fingerprint, pinned source hash and reviewed code commit. All these named checks require explicit passing evidence:

1. Final source write freeze and reconciliation.
2. Exact content and approved authority verification.
3. Verified backup and recovery.
4. Hosted core workflows and permissions.
5. Hosted peak login/Home flows.
6. Browser acceptance.
7. Sheets writes stopped across all writers.
8. Owner release approval for the concrete transition.

Missing evidence produces blockers and **zero executable statements**. Earlier reports can inform a review, but this tool does not automatically convert them into final activation approval. The review records the source hash and code commit; regenerate it after subsequent code or data changes.

The local apply function checks that both the database and plan are unchanged, then commits ownership, evidence, import state, staging-session revocation, audit history and a retry receipt in one transaction. Retrying the same completed review replays its result. A failed transaction rolls back completely. Account credentials and existing authority records are preserved.

**A remote main-database activation executor is not implemented or used in this increment.** A future executor must pause writers, recheck the exact target and fingerprint, and apply the reviewed statements in one [D1 binding batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). Do not execute them individually or use a potentially chunked SQL-file import for an existing database's activation. A flag change alone cannot activate the staging import.

After D1 accepts live writes, restoring a backup or setting `OFF` is not a safe automatic rollback to Sheets. Recovery must account for those new writes and preserve them through reviewed reverse reconciliation.

## Verification completed

| Check | Result |
| --- | --- |
| Regression suite | **120/120 test files pass**, including eight new activation/tooling cases. |
| Local actual Workers/D1 runtime, active/public-only mode | **200/200 simultaneous complete flows pass**, each performing account check, login, session verification and Home. |
| Local flow timing | 2,657 ms for the burst; p50 2,619 ms, p95 2,655 ms, p99 2,656 ms. These are local measurements, not hosted capacity or user latency estimates. |
| Runtime permissions and security | Global Admin/Program Admin access, Teacher/Student restrictions, incorrect PIN, reset/revocation, new PIN setup and logout pass. |
| Library boundary | Anonymous public metadata succeeds; protected resources and old file links are blocked. Public metadata save/read is covered by regression tests. |
| External traffic during local flow test | **Zero**; all outbound requests are rejected by the test runtime. |
| Activation failure and replay | Missing evidence, wrong import, stale database, modified artifact and deliberate audit failure are rejected; rollback and completed retry pass. |
| Current development and separate test builds | Wrangler dry runs pass; test binding/runtime types are generated. No deployment occurs. |
| Fresh private candidate | 62 tables, 73 accounts, zero sessions, valid integrity/foreign keys; activation remains blocked and the candidate file is byte-for-byte unchanged. |
| Main cloud database, read-only recheck | 45 application tables, 73 accounts, zero sessions, zero changed ownership records. No cloud rows were written. |

The local runtime uses the current application's `2026-06-01` compatibility date. The installed local binary rejects `2026-10-10`; the separate hosted-test configuration uses that current date and passes build validation. Hosted acceptance must use its actual deployed configuration.

Private reports, the pending activation review and build artifacts are in `.academy-migration/core-activation-20261010-a01264a4/`. The successful local fixture and runtime report are in `.academy-migration/core-active-local-s8yGBA/`. Synthetic secret files have restricted permissions and are ignored by Git. They must never replace the current application's real credential secrets.

## Initial hosted test blocker and prepared tooling

Creation of the dedicated disposable test database `academy-d1-core-test-20261010-a01264a4` failed with **Cloudflare API authentication error 10000**. This is a server authentication failure, not an automatic approval rejection. It resembles the earlier standard SQL-export failure; ordinary read-only D1 queries still work. The underlying permission/authentication issue remains unresolved.

No test database ID was returned and no test Worker deployment was attempted. **The hosted 200-flow test has not run.** No synthetic accounts were inserted into the main database, and no hosted acceptance check is marked passed. The prior browser security-policy blocker also remains unresolved; API tests do not replace browser acceptance.

`backend/tools/academy-d1-hosted-core.mjs` now prepares and verifies a synthetic 62-table fixture, an isolated test configuration and random private test secrets. It refuses the main database UUID and both application Worker names. Its install SQL is for a **new empty disposable test database only**; it is not a remote activation mechanism. A second local restoration must match the complete schema/content fingerprint before installation artifacts are produced.

After Cloudflare access is resolved, create the separate test database, prepare the fixture with its returned UUID, install it only into that empty target, and deploy using the explicit private test configuration and private test secret file. The `exercise` command checks the dedicated `workers.dev` target, runs 200 synthetic complete flows and checks core roles, credentials, public Library and private-media rejection. Extend hosted acceptance to the remaining route matrix and real browser navigation before reviewing live activation. Use separate test storage for any cover-upload acceptance; retain the existing main Open Library namespace and cover bucket for the eventual reviewed main deployment.

The same fixture and checks can be run locally from the repository root:

```sh
node backend/tools/academy-d1-core-rehearsal.mjs --runtime-root /absolute/path/to/backend/node_modules
```

For hosted preparation and exercise, the CLI accepts explicit targets and private artifact paths:

```sh
node backend/tools/academy-d1-hosted-core.mjs prepare --directory PRIVATE_DIRECTORY --database-id TEST_DATABASE_UUID --worker-name academy-d1-core-test-YYYYMMDD-HEX8 --account-id ACCOUNT_ID
node backend/tools/academy-d1-hosted-core.mjs exercise --origin https://TEST_WORKER.ACCOUNT.workers.dev --input PRIVATE_DIRECTORY/test-input.json --report PRIVATE_DIRECTORY/hosted-report.json
```

These are templates, not commands to run against the main database. Preparation and exercise do not create or deploy cloud resources. Do not treat synthetic activation evidence in the isolated fixture as approval for the real import.

A future feature push still requires a fresh synchronized release version. This local increment retains V106.0 and is not pushed.
