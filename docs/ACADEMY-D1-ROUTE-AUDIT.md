# Academy D1 route review and Open Library — 10 October 2026

The review found two gaps in the current Academy journey: Open Library metadata routes were unavailable in D1 mode, and the shared sidebar cleared browser sign-in without requesting D1 server-session revocation. Both are now addressed locally. **V106.0 remains the deployed release; live storage remains Sheets.** No cloud migration, deployment or ownership change is part of this increment.

## Open Library storage and behaviour

Open Library book details already live in the SQLite-backed `ProgramTimetableCoordinator` Durable Object. Uploaded covers remain in `MEDIA_BUCKET` (R2), and the public Archive.org catalogue remains separate. D1 supplies current accounts, sessions, authority and active Academy/Program/Course taxonomy. This increment does not import books into D1 or add database tables.

The existing object name, `${PLATFORM_SPREADSHEET_ID}:open-library-metadata`, must remain unchanged. The spreadsheet ID serves as a stable namespace identifier here; it causes no Sheets request on the D1 path. Changing it would select a different metadata store. Keep the existing Durable Object class, binding and R2 bucket during a future deployment.

- Public metadata and cover reads remain GET requests; editor list/options/save remain POST requests. Multipart cover uploads retain the existing size and image-signature validation. Hidden Academy links remain absent from public metadata and cover reads.
- Global Admins and authorised Teachers retain editing access. A Program Admin role alone does not grant Open Library editing. The approved Senior-to-Teacher mapping is honoured through current D1 authority. Signed tokens and cached request users cannot bypass current session checks.
- Subject/module options use active D1 Academy, Program and Course records and exclude archived activities and old Reboot. Existing `GLOBAL:` identifiers continue to identify current Courses; only that term is outdated.
- The coordinator rechecks D1 authority after taxonomy loading, before its synchronous metadata revision check and save. Stale or concurrent edits retain the existing conflict protection and cover cleanup. D1 authentication and the separate Durable Object write are not one cross-service transaction; this change does not add an operation-replay protocol.
- Personal Library returns current Program/Course reference IDs so public books can appear under For You. Paid Course revocation removes that assignment on the next read. These labels classify public resources; protected Program/Course files retain their separate access checks.
- The shared sidebar sends the existing D1 logout request with the captured token and `keepalive`, while clearing browser state immediately. Sheets sign-out retains its existing behaviour. If the network prevents delivery, local sign-out completes but server revocation is not confirmed, matching the existing best-effort Academy navigation behaviour.

## Current website route coverage

This is a code/contract review of the current Academy screens, backed by local runtime tests. It is not a claim that every legacy endpoint has migrated or that hosted browser acceptance is complete.

| Current screen or flow | D1 path and authority | Status |
| --- | --- | --- |
| Personal account link → PIN setup/login → Academy Home | Account check/login/setup/session, context switch, Home and logout; fresh account/session/credential checks | Implemented and exercised |
| Academy activity and personal timetable | Active Program/Course projections, published lessons, memberships, subscriptions, timed joining and calendar context | Implemented and exercised |
| Older account page | Session, Academy workspace handoff and 14-day account timetable | Implemented and exercised |
| User profiles | Get/link/save/recover; Global Admin controls profiles and scoped Program roles, with existing Global Admin grants preserved | Implemented and exercised |
| Program setup and management | Registry, readiness, subjects, modules, classes, enrolments and scoped Program administration | Implemented and exercised |
| Program timetable | Get/save/preview/validate/publish/history/published/prepare | Implemented and exercised |
| Program attendance | Get/submit/recover/prepare; current teaching/class scope, saved rosters and revisions | Implemented and exercised |
| Program and Personal Library | Catalogue, metadata, configured folders and session-bound Drive/R2 access | Implemented and exercised; device uploads need the updated bridge and configured destinations |
| Courses / Continuing Education | Course/module/task/resource authoring, Drive folders and paid Course subscriptions; Global Admin administration | Implemented and exercised |
| Course Scheduling and Academic Calendar | Runs, saved/derived sessions, publication/revision, Free/Paid runs and calendar edits | Implemented and exercised |
| Open Library | Public/list/options/save/cover; existing Durable Object/R2 data with D1 account/taxonomy checks | Added and exercised in this increment |
| Shared connected-page sidebar | Home navigation and D1 server logout request | Corrected and covered by actual-script tests |
| Voice Recorder | Existing standalone recorder, with Academy navigation when entered from Academy | Existing flow retained; no new database workflow |
| Academy-wide Dua and Surah Progress | Current Academy screen says Coming soon | No new progress feature inferred from legacy routes |

Old Reboot student/admin/progress/planner endpoints remain outside this D1 handler. They must continue through the separate legacy Worker if still needed. Unsupported operations on the D1 Worker return `501 OPERATION_NOT_MIGRATED`; they never fall back to Sheets.

Old one-time Sheets Course-access/scheduling migrations and Academy-subject import preview are not D1 migration tools. The normalized candidate already contains the Course workflow preparation; subject import remains unavailable in D1 capabilities. They are not required to repeat the active-data import.

Existing Global Admin accounts have Academy-wide authority. Granting new Global Admin roles is not an existing profile-screen capability and has not been invented as part of this migration. Any future grant/removal administration and new admission, Module-subscription or completion-retention rules need a separate defined feature; the current Course subscription behaviour is preserved.

## Verification

- **119/119 regression test files pass.** Seven new Open Library scenarios cover existing metadata/covers, stable namespaces, active taxonomy, editor authority, concurrent/stale saves, revocation during taxonomy loading, cover validation/cleanup, paid For You assignments and the actual editor script. Shared navigation tests cover D1-only logout, captured tokens, network failure and account replacement.
- The actual local Workers/D1/Durable Object/R2 runtime passes **200 simultaneous synthetic login/Home flows**, 196 concurrent Library reads and the existing management, learning, Course, resource and subscription checks. Open Library checks include creation, concurrent edits, multipart cover upload/streaming, public reads and rejection after logout. The final run uses the deployed Worker's configured compatibility date, `2026-06-01`. Thirteen Drive requests are mocked and no external requests are allowed. These local results do not establish hosted capacity.
- A disposable copy of the private 62-table candidate retains 73 accounts, five active Programs, two current Courses, eight Library resources, four registers/21 marks and the 14-day timetable. Open Library options contain 20 subjects, 21 modules and seven learning areas; the Global Admin Library view has all seven area references. The source candidate remains byte-for-byte unchanged. Existing live Durable Object metadata inventory has not been exported or reconciled in this check.
- The configured development Worker build passes without deployment. Native browser click-through remains unverified because the browser tool could not verify its administrator security policy; no workaround was used.

Private evidence is under `.academy-migration/d1-open-library-20261010/`, its referenced local runtime report and `.academy-migration/d1-open-library-worker-dryrun/`. Source exports, credentials, account identifiers and database files remain outside Git. No additional D1 extension is needed for this stage; local extensions 0004–0007 still await application to the main cloud candidate.

## Remaining work before live cutover

1. Reconcile a refreshed active-data source with the verified candidate, including the latest accounts, roles, publications, attendance and resources. The October 9 snapshot does not automatically track later Sheets changes.
2. Configure the updated Apps Script upload bridge and each Program's upload destination; verify a real upload end to end. Retain the existing Open Library object namespace/R2 binding and verify its hosted metadata/covers.
3. Exercise the complete hosted website with representative Teacher, Program Admin, Global Admin and Student accounts, including paid-access revocation, failed/retried writes and realistic simultaneous peak use. Complete native browser acceptance through an approved browser connection.
4. Prepare and review backups, restore/rollback evidence, the source-write freeze/reconciliation procedure and explicit database ownership transition. The current `REHEARSAL` mode deliberately requires `SHEETS/STAGING` ownership; setting the flag alone is not a live cutover procedure.
5. Release the reviewed changes with a fresh feature version and changed asset URLs, then perform the separately reviewed live ownership/routing transition. Keep the production-named legacy Worker separate.

The preceding [Course subscription stage](ACADEMY-D1-COURSE-SUBSCRIPTIONS.md), [Course resource stage](ACADEMY-D1-COURSE-RESOURCES.md) and [terminology](ACADEMY-TERMINOLOGY.md) remain applicable.
