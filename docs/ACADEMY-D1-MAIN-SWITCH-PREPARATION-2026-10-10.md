# Main D1 switch preparation — 10 October 2026

The owner confirms that the test logins work and that no source data has been changed. Wording updates will continue with website development and are **not a migration prerequisite**. This confirmation does not claim every device or feature has been accepted, and it is not a source write freeze or live activation approval.

The main database has been backed up again through read-only queries and an additive upgrade has been rehearsed on private copies. **The main application still uses Sheets. No main schema, data, ownership, configuration, deployment or credential secret was changed.** No feature push or release-version change occurred.

## Concrete targets and scope

| Item | Prepared target |
| --- | --- |
| Current application | `devrebootworker`; environment `development` |
| Main database | `maktab-academy`, `7e732b79-a72f-4da6-be83-524919c49ba4` |
| Original import / upgraded candidate | 45 / 62 application tables |
| Retained identities | 73 active accounts; all five stored PIN hashes and existing PIN-setup states |
| Learning areas | Five active Programs and two current Courses |
| Approved role mapping | Senior → Teacher; Admin → Program Admin in its existing Program; Global Admin grants unchanged |
| Library at activation | `PUBLIC_ONLY`; existing public metadata/covers retained; new private Module media feature remains unbuilt |
| Legacy application | `rebootworker`; excluded from this transition |

The five Programs are Alimiyah, Hifz, Mothers of the Ummah, Reboot (Pilot) and Tafseer. The old Reboot workspace and inactive/archived operational records remain excluded. Courses are current learning areas; only their preceding Global Subject terminology is obsolete.

## Backup and additive upgrade

At **11:25:58 UTC**, the read-only main backup matches the independently verified original import exactly: 45 tables, 1,683 rows, 73 accounts, zero sessions and Sheets/staging ownership. The baseline's source capture completed on **9 October at 16:41:12 UTC**. The full 10 October 06:04 capture had previously confirmed that only a last-login date differed; it remains a separate verified candidate/evidence set.

The owner then confirmed that nothing had changed. A newly started read-only refresh was stopped after 25 of 148 bounded reads. It is **not** a complete new capture and does not replace either verified snapshot. The additive package intentionally uses the exact source corresponding to the existing main import; it does not silently replace that import with a new run or claim source synchronization.

`backend/tools/academy-d1-main-preparation.mjs` is offline-only. It verifies the complete backup against the reviewed active converter, restores it privately, applies extensions 0004–0007, and imports the learning and Course/calendar additions. All 1,683 existing rows are retained exactly. The upgrade adds 122 rows, including the four historical attendance registers/21 marks, 48 active calendar events, removed-holiday dates, referenced publication history and the two approved role-mapping decisions. Existing account, credential, authority and ownership rows cannot be replaced or supplemented through this upgrade.

The command produces private baseline/candidate backups, SQL recovery files, a pinned additive artifact, two successful upgrade/replay trials and a pending activation review. The baseline SQL restore and two complete candidate SQL restores match their full schema/content fingerprints. Its CLI requires a clean checkout at the exact supplied commit. Outputs are new files with mode 0600 in a mode-0700 directory.

`backend/tools/academy-migration/staging-upgrade.mjs` guards the original and resulting complete schema/content inside the transaction. It refuses a used or active database, changed PIN/authority rows, deletions, unexpected schema changes and modified artifacts. It does not reset credentials or switch ownership.

## Combined transition and verification

The administration-only `remote-main-transition.mjs` can combine the additive upgrade and the existing reviewed activation into **one D1 binding batch**. A late activation failure therefore rolls back the new tables and imported rows as well as ownership, audit and receipt changes. It pins the complete artifact, source, code, original/final fingerprints and main UUID, and replays a completed receipt after a lost acknowledgement. The future short-lived controller accepts only an authenticated empty POST with a fixed compiled artifact; it rejects browser origins and caller-supplied SQL. It is not imported by the website API and has not been deployed.

Generation fails unless all eight final activation checks explicitly pass. The current real-data review still has eight pending checks and **zero executable activation statements**. Synthetic tests are not inserted as approval for those real-data checks.

| Verification | Result |
| --- | --- |
| Full backend suite | **124/124 test files pass**, including nine new main-preparation/transition cases. |
| Main-copy local Workers/D1 upgrade | Exact 45→62 table result; all original rows preserved. |
| Native and local Workers/D1 combined transition | Synthetic upgrade/activation succeeds; retry replays one receipt. |
| Native and local Workers/D1 late failure | Original 45-table fingerprint restored, including schema, data and ownership. |
| Stale data / schema / credential checks | Reject before partial changes; modified artifacts rejected. |
| Recovery | Baseline SQL restore and two candidate SQL restores match completely. |
| External traffic during local runtime trials | **Zero**. These checks are local, not hosted main execution. |

Cloudflare documents the transaction behaviour of [D1 binding batches](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). Use the fixed administrative batch, not individually executed statements or a chunked SQL-file import, for the eventual existing-database transition.

Private reports and recovery files are under `.academy-migration/main-cutover-preparation-20261010-*/`. They contain account data and credential hashes and must not be pushed or published. The earlier trial package is superseded by the package generated from the committed code. Keep the separate synthetic test website/API and their test records intact.

## Writers and final switch sequence

Repository review shows that the current Worker owns application Sheets writes, including login timestamps/PIN setup, profiles, roles, enrolments, Program/Course content, timetable publication, attendance and Calendar. Its `PAUSED` mode returns before these routes. The repository Apps Script bridge only saves a planner image or starts a Drive upload; it reads configuration and has no Academy Sheets-maintenance action. This does **not** prove there are no manual spreadsheet editors, older deployed scripts, external integrations or scheduled jobs. Those writers must also be stopped during the agreed window.

The remaining controlled sequence is:

1. Finalize the release commit/version and deployment bundle while keeping the application on Sheets. A feature push deploys both frontend and backend and must carry a new synchronized version. Preserve the main PIN/SESSION secrets, existing public Library Durable Object namespace, R2 bucket and other current bindings. Synthetic test secrets must never replace main secrets.
2. At the agreed window, pause the current Worker and every other source writer; verify maintenance responses and allow in-flight requests to finish. The owner's no-change statement alone is not a freeze. Keep source edits paused through reconciliation and activation.
3. Take the final source capture and compare it with the verified capture/import. Reconcile last-login metadata explicitly; any identity, credential, authority or learning-data change requires a revised candidate/plan. Do not force the additive artifact onto a changed baseline. Recheck the main target and retain a fresh verified pre-transition backup.
4. Review exact real-data authority/content and the existing hosted workflow, peak and browser evidence against the final release. Owner-confirmed logins and the recorded desktop save/permission checks are available evidence. Additional device coverage is a release decision; wording cleanup is deferred. Record all eight checks and the owner's approval against the concrete final plan.
5. Only then generate the target-bound main controller artifact, validate its binding/configuration, deploy it temporarily and apply the combined transition once. Read back the receipt, complete schema/content, pinned import and D1/active ownership while the main application remains paused. Delete the temporary privileged controller after verified completion.
6. Enable the current Worker with `ACTIVE`, the exact verified run and `PUBLIC_ONLY`. Check real login, session/Home, scoped administration, one saved change surviving refresh, logout/revocation and anonymous Library access. Keep Sheets non-authoritative. Restore service or remain paused for repair according to the verified outcome.

After D1 accepts new writes, setting `OFF` or restoring an older backup is not a safe fallback to Sheets. Preserve the latest D1 state and use the tested [D1 recovery process](ACADEMY-D1-TRANSITION-RECOVERY-2026-10-10.md). Reverse reconciliation into Sheets is not implemented.

The package is preparation for this sequence, not a completed live switch. The final coordinated pause, reconciliation, concrete release approval and main execution are still outstanding.
