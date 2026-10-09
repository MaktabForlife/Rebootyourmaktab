# Academy D1 user and Program management — unreleased

This increment implements account profiles, Program roles, Program setup, curriculum records, classes and enrolments on the isolated D1 application path. It is built on the deployed V106.0 feature code. It has **not been pushed or deployed**, and the main database has not received the new schema extension. The live website continues using Sheets.

## Approved roles

The project owner specified Teacher, Program Admin and Global Admin, with Seniors becoming Teachers. The D1 implementation maps effective source `ADMIN` assignments to `PROGRAM_ADMIN` and `SENIOR` assignments to `TEACHER`, within their original Program. Existing Student access and class memberships are preserved.

| Authority | Implemented management access |
| --- | --- |
| Teacher | No account, role or Program management writes |
| Program Admin | Curriculum, classes, class teachers and enrolments in assigned active Programs |
| Global Admin | All Program management, Program registry and user profiles/Program role grants |

Global Admin remains a separate Academy-wide grant. The ordinary Program role matrix cannot grant it. Student, Teacher and Program Admin can be combined within a Program. Removing an effective role invalidates a session using that context on its next request. An existing Senior becomes a Teacher and no longer receives administrative oversight merely from the old Senior label.

The approved rules are recorded in `role_mapping_decisions`. Imported evidence and canonical grant rows are retained unchanged until an explicit role edit replaces the effective assignment. Such edits record the authenticated reviewer and time. Unrecognized or ambiguous source values remain pending rather than receiving an inferred role.

A private local check of the captured main candidate verified **73 accounts, 104 contexts, 17 Admin mappings and 3 Senior mappings**. All scopes and Global Admin grants were preserved. Credentials, source evidence and class memberships were unchanged. This does not change the twenty review records in the main cloud database: its runtime extension has not been applied.

## Implemented operations

- User profiles: list, create, rename, enable/disable and retrieve a personal login link. Disabling an account revokes existing sessions without deleting its identity or enrolment history. Self-disable and removal of the last active Global Admin are blocked by the profile workflow.
- Program roles: grant/remove Student, Teacher and Program Admin, including combined profile/role batches. New roles require an active account and active Program. Global Course policy and access edits remain disabled pending the admission/access decision.
- Program registry: list, create a Draft, edit configuration, activate and archive. The grid displays the actual D1 lifecycle rather than converting active published Programs to Draft. New Programs require no spreadsheet. Activation alone does not create a publication.
- Program management: subject links to the existing Academy catalogue, levels, modules, curriculum tasks, classes, default class teachers, class memberships and per-class module progress. Student class changes can be saved individually or as an atomic batch.
- Existing frontend screens consume these HTTP contracts. Active D1 Programs are editable; archived Programs are read-only. The D1 setup screen hides spreadsheet preparation and links for workflows that are not implemented. Program Admins can reach their Program management screen without receiving the global user directory.

The routes are `/api/admin/platform/user-profiles/{get,link,save,recover}`, `/api/admin/platform/programs/{list,create,save,readiness,prepare}` and `/api/admin/platform/program-timetable/{manage-get,manage-save,recover}`. On D1, readiness describes database records; prepare is a compatibility no-op and is hidden in the setup screen. Recovery reads operation receipts; it never completes a partially committed batch because each save is atomic.

## Save and permission safeguards

Each mutation checks its operation identifier, current row revision and fresh administrator authority. A D1 batch contains a guarded write, all changed rows, an audit event and a replay receipt. Failure rolls back the whole batch. A retry with the same identifier and payload returns its committed result; a different payload with the same identifier is rejected.

The transaction checks the actor's active account, session, credential epoch and relevant authority again before writing. A shared write version prevents two plans from committing over each other. Concurrent changes to different rows can replan against fresh data; conflicting edits to the same row return the saved record and keep the browser draft for review. Earlier account-helper edits are covered by account revision checks.

Ordinary profile lists do not contain PIN hashes or personal login identifiers. An authorized Global Admin must explicitly retrieve a login link. Audit entries identify the authenticated actor, Program/global authority, scope and changed field names. Credentials and source exports remain in private ignored storage.

## Database boundary

`backend/migrations/academy/0004_management_transactions.sql` is a separate runtime extension containing the write-state row, transient transaction guards and approved role-mapping decisions. The frozen active-import base remains migrations 0001–0003 and 45 tables. Local tests apply the extension after importing that verified base; the resulting runtime has 48 application tables.

Before a future main upgrade, refresh/reconcile the source candidate, validate the frozen import and review the extension application separately. A feature deployment does not run SQL migrations. Do not run the original import over a database containing rehearsal writes. No runtime extension, synthetic test account, session or management write from this increment has been sent to the main cloud database.

`ACADEMY_D1_MODE` remains unset/OFF on the live application. `REHEARSAL` still requires a local/development environment and an imported `SHEETS/STAGING` candidate; it does not provide a completed live-store transition. Unsupported routes return 501 and cannot fall back to a Sheets writer.

## Verification

- **112/112 regression test files pass**, including twelve D1 management scenarios.
- Real SQLite tests cover conflicting and independent simultaneous saves, stale revisions, atomic multi-student changes, profile disable, scoped authority, forbidden escalation, audit failure rollback, lost acknowledgements and authority removal between planning and committing.
- Existing profile, Program setup and management scripts run against the actual D1 HTTP handler in frontend integration tests. A profile created and a class edited from those scripts are verified in the database.
- The actual Workers/D1 emulator passes **200 simultaneous synthetic login/home flows, 800 flow requests**, followed by credential/security checks and management saves, role grants and enrolment retries. There are **zero outbound requests**. Management save concurrency produces one success and one conflict as expected.
- The main-candidate role check passes for all 73 accounts/104 contexts without entering any real PIN or changing the cloud database.
- The development Worker deployment dry run passes with the main D1 binding and no rehearsal variable.

Local burst duration was 2,373 ms. This is emulator evidence, **not a hosted capacity measurement**. Native browser click-through remains unverified because the browser tool could not verify its administrator security policy; no browser workaround was used.

Private evidence is under ignored `.academy-migration/`: `d1-management-final-regression.log`, `d1-management-final-ui-recheck.log`, `d1-management-final-guard-recheck.log`, `d1-load-O5wCWb/report.json`, `d1-management-approved-role-check.json` and `d1-management-worker-dryrun/`.

## Remaining before cutover

Timetable authoring/publication, Library reads/writes and protected resource access, attendance, shared calendar and other dependent workflows still require consistent D1 support. New shared Academy subject creation/rename and legacy catalogue import are also outside this increment; existing catalogue names can be linked to Programs. Imported Library/timetable records remain preserved.

Admission rules and Free/Paid entitlement decisions remain open. Global Admin grant administration is not exposed through the Program matrix. Refresh the source after remaining workflows are ready, reconcile post-snapshot changes, verify hosted complete flows and peak usage, and obtain approval of the concrete cutover. Keep the production-named legacy Worker separate.

A future feature push must include a fresh release version and updated asset URLs under the repository version rule. This increment remains unreleased.
