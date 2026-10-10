# Academy D1 Program learning workflows — unreleased

Timetable publishing, Program attendance and Library workflows now run on the isolated D1 path, alongside user and Program management. This increment is local: it has not been pushed, deployed or applied to the main cloud database. Live storage remains Sheets. `REHEARSAL` is still an integration boundary, not a live cutover mode.

## Implemented behavior

| Workflow | D1 behavior |
| --- | --- |
| Timetable | Program Admins edit and publish their assigned Programs; Global Admins manage all Programs. Draft revisions prevent overwrites. Publications and normalized lesson/class/teacher records commit atomically and appear through the existing Home projection. |
| Publication dates | Publish today or later. Once attendance exists today, a replacement must start tomorrow or later. Published versions remain immutable. Existing validation, weekly breaks, links, layouts, planner data and legacy-draft conversion rules are reused. |
| Attendance | Teachers see and submit their assigned lessons or classes; Program Admins and Global Admins have Program oversight. New submissions are limited to today. Prior submitted registers can be edited with their saved revision; each edit appends history and retains its original roster. Unsubmitted attendance remains Unknown. |
| Library management | Program Admins maintain resource metadata in their Programs; Global Admins additionally select each Program’s Drive destination. Existing allowed roots remain available for saved files. New/replacement files must be inside the current destination and match the selected file category. |
| Library reading | Program and Academy catalogues use D1 metadata and existing Assigned, Free/Paid and publication-manifest rules. A Program Admin grant does not bypass paid Course access. Inactive resources and parents, archived Programs and excluded manifest entries are hidden. |
| Protected files | Files remain in Google Drive or R2. Five-minute file tickets are bound to the account session and credential epoch. Every file request rechecks D1 resource access, including after logout, account disable or permission removal. Drive/R2 responses retain streaming, ranges, HEAD and private cache headers. |
| Uploads | The signed Apps Script bridge has a distinct D1 purpose and uses the D1-verified folder without a Sheets lookup. Every upload chunk rechecks the account, Program authority and destination. This path is disabled until the updated Apps Script is deployed and `ACADEMY_D1_UPLOAD_BRIDGE=D1_V1` is configured; the screen offers existing Drive files meanwhile. |

Teachers do not receive Library editing or Program administration merely because they can teach. Seniors follow the approved Teacher mapping. Existing Students and scoped enrolments are retained. Replays are actor-bound; changed payloads cannot reuse an operation identifier. Each write transaction includes fresh authority/session checks, all affected records, audit and receipt, so a failed write leaves no partial data.

Library catalogue loading uses one consistent database read batch across Programs. Published lesson links and attendance registers/marks use bulk inserts, avoiding a query per lesson or learner. Permission data and database handles are request-local. These changes do not reintroduce the earlier rolled-back Sheets caching changes.

## Schema and source history

The frozen, verified import remains migrations **0001–0003 / 45 tables**. Management extension 0004 and learning extension 0005 are separate upgrades, giving **55 tables** in the local runtime. Learning routes require a completed `learning_imports` marker matched to the original snapshot and migration run; merely creating the tables is insufficient.

`backend/tools/academy-d1-learning-rehearsal.mjs` verifies an untouched base candidate, makes a new private local copy, applies both extensions and imports the supplemental learning records. It has no remote or in-place write option. It refuses a changed base, an import after application writes or a repeated learning import. Exact content, foreign keys and database integrity are checked. SQL exports and data remain private and ignored by Git.

The 9 October snapshot passes this local rehearsal with:

- Five intended active Programs; the old Reboot workspace remains excluded.
- Four attendance registers and 21 marks.
- One required historical timetable publication, containing 12 normalized entries, added to the six publications/68 entries in the frozen base. Its active account, class, subject and module references are verified; inactive references stop the import instead of restoring archived records.
- One global Library root setting; eight existing Program resources remain available.
- No inactive-account marks or legacy-workspace records imported.

One source register is a zero-learner break entry. It remains preserved as historical data; the attendance screen correctly shows the other three submitted lesson registers for 8 October. Breaks cannot receive new attendance. A source manifest’s archived entry is represented only by its resource identifier, preventing a missing policy from accidentally reopening it through the default Assigned rule.

The main cloud database still has its original schema and snapshot. Later Sheets changes are not automatically synchronized. Do not run the frozen base verifier/import over a candidate after these extensions and supplemental history or application writes have been applied; verify the base first and use the learning verification for the extension.

## Verification

- **114/114 regression test files pass**, including fifteen new learning/Library scenarios.
- Native SQLite checks cover stale and competing publications, immutable history, assigned-teacher access, preserved rosters, audit/mark failure rollback, lost acknowledgement recovery, scoped Library access, folder escape prevention, permission revocation during a save and file-ticket revocation.
- The existing timetable, attendance and Library scripts run against the D1 HTTP contracts. Publishing and attendance from those scripts are verified in storage. Native browser click-through remains unverified because the browser tool could not verify its administrator security policy; no workaround was used.
- The actual Workers/D1 emulator passes **200 simultaneous login/home flows (800 requests)**, management/security checks, timetable publishing and replay, attendance with more than 90 learners, and **196 simultaneous Library reads**, with **zero outbound requests**. Drive/R2 and Apps Script file tests use synthetic service responses separately.
- The local login/home burst completes in **2,410 ms**, using the installed emulator’s supported compatibility date `2026-09-28`. This is not hosted capacity evidence. The deployment dry run passes with the real development configuration unchanged.
- Reads against a private copy of the main candidate confirm all five Program/timetable views, eight Library resources and the four historical registers. No real account PIN is entered, no real file is uploaded and the main database is not changed.

Private evidence: `.academy-migration/d1-learning-20261009/{report.json,read-report.json,candidate.sqlite,learning-import.sql}`, `.academy-migration/d1-load-czTfQT/report.json` and `.academy-migration/d1-learning-worker-dryrun/`. Regression and build logs are copied into the private learning report directory.

## Remaining before live migration

Course run authoring/publication and the shared-calendar extension are implemented in the subsequent [Course/calendar stage](ACADEMY-D1-COURSES-CALENDAR.md); its local candidate has 61 tables. Complete the other remaining dependent routes. Shared Academy subject creation/rename and legacy subject import remain separate work. Existing Free/Paid evidence is preserved; new admission, subscription and Academy-wide Global Admin grant administration still need their final rules.

Deploy the updated Apps Script bridge before enabling D1 device uploads, and select any missing Program Drive destinations. Before cutover, refresh/reconcile the source, verify the complete hosted flows and peak load, review backup/rollback and approve a concrete ownership transition. A future feature push needs a new version and changed asset URLs. The production-named legacy Worker remains separate.
