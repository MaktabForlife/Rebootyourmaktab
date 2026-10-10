# Academy D1 curriculum and account screens — unreleased

Shared Academy subject creation/rename, Global Curriculum authoring and the older account timetable now use the isolated D1 path. This stage is local: it has not been pushed or deployed, and no main cloud database records or settings have changed. Live traffic still uses Sheets.

Terminology clarification: Global Subject is the older name for a current Course/Continuing Education offering; Global Curriculum refers to Course Scheduling. Global Admin covers every Program and Course. The implementation descriptions below retain existing endpoint/screen names. See [Academy terminology](ACADEMY-TERMINOLOGY.md). The subsequent [Course resource stage](ACADEMY-D1-COURSE-RESOURCES.md) completes resource and Drive administration locally.

## Behaviour and permissions

- Global Admins create or rename shared Academy subjects from Program management. Names use the existing normalization and duplicate rules; creating an existing active name reuses its identity. A rename keeps every Program link and its levels/modules attached. A saved subject revision is required, and conflicting renames return the current name for review.
- These names belong to the Academy-wide catalogue. Program Admins continue choosing existing subjects within their assigned Programs; they cannot rename the catalogue across other Programs. Teachers cannot edit it. The excluded legacy Reboot workbook is never read or imported, and its import controls are hidden on the D1 path.
- The Global Curriculum entry now opens its own Subjects/Modules/Tasks screen. Global Admins can create, update and archive Global Subjects, maintain Modules and Tasks, and save Subjects/Modules together. New Subjects default to paid access unless Free is explicitly selected. Empty subscription columns from the old storage contract never create admission or entitlement grants.
- Global Subject changes update any existing GLOBAL_REFERENCE catalogue entry. They do not merge it with an Academy subject or rewrite immutable timetable history. Moving a Module or Task between Subjects is rejected; create a new entry instead.
- At this stage, Global Resource editing/Drive administration remained pending; the subsequent Course resource stage enables them. Existing subscriptions remain visible with editing disabled until the admission/entitlement rules are finalized. Unsupported endpoints return an explicit error without falling back to Sheets.
- The older account timetable reuses the Academy projection and current D1 permissions, membership dates, publications, paid-access gates and calendar. It supports 1–14 days, defaults to two, and retains the older response shape. Meeting links are returned only during a current authorized lesson. D1 workspace responses route to Academy rather than opening the older Sheets workspaces.

Global Curriculum writes use the existing saved workflow revision and actor-bound UUID receipt. Shared subject writes use row revisions and the same guarded transaction. Permission/session/credential state is checked again inside the transaction. Records, audit, receipt and write sequence commit together; a failed child insert cannot leave a new parent behind. Retries after an uncertain response return the committed result.

The Global Management service now has request-local storage dependencies. Normal exports preserve the Sheets implementation. D1 uses fixed planned record changes and parameter-bound SQL. Subject/policy/ownership/Module/Task changes are bulk statements, so a batch does not issue a database query for every name or account.

## Data and verification

No new migration or source import is needed: this stage uses the **61-table local candidate** from the Course/calendar stage. A disposable private copy passes the updated contracts with **18 Academy subjects**, **2 Global Subjects**, **2 Global Modules**, **0 Global Tasks**, five Program management views and **128 timetable entries** for 9–22 October. The earlier eight Library resources, four historical registers and 21 attendance marks remain preserved. No real PIN is entered and the original candidate is unchanged.

- **116/116 regression test files pass.** Six focused scenarios cover curriculum creation/archive, unchanged subscription evidence/publications, catalogue reuse/rename, Program links, conflicts, rollback, lost acknowledgements, authority revocation, paid timetable privacy, timed joining and the actual Global Curriculum script.
- A 20-Subject batch and the Course publication checks stay within the tested per-request query budget.
- The actual local Workers/D1 runtime passes 200 simultaneous login/home flows, 196 concurrent Library reads and curriculum/account read/write/security checks with zero outbound requests. This is local emulator evidence, not hosted capacity.
- The configured development Worker build passes without changing its configuration. Native browser click-through remains unverified because the browser tool could not verify its administrator security policy; no workaround was used.

Private evidence is saved under .academy-migration/d1-curriculum-account-20261010/, the corresponding local d1-load report and .academy-migration/d1-curriculum-worker-dryrun/.

## Remaining before enabling D1

Course Resource/Drive management is completed locally in the subsequent stage. Complete remaining dependent routes and finalize admission/subscription and Academy-wide Global Admin grant administration rules. Deploy/configure the updated upload bridge and missing Program destinations. Refresh/reconcile the source, verify complete hosted flows and peak usage, and review backup/rollback and the concrete ownership transition before enabling D1. Keep the production-named legacy Worker separate.

A future feature push requires a fresh release version and updated URLs for every changed asset. This stage does not enable live D1 routing.
