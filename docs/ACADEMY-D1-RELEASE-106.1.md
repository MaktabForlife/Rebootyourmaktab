# V106.1 release and coordinated main D1 switch

## Release scope

V106.1 packages the D1 core workflows developed and verified after V106.0: account login/Home and sign-out; scoped account and Program administration; curriculum, class and enrolment management; timetable publication; attendance; Course runs, calendar and Course access controls. It includes the approved Senior → Teacher and Program Admin mapping. Five active Programs, two current Courses and 73 active accounts are retained; inactive/archived operational records and the old Reboot workspace are excluded.

The website and both Worker health paths show V106.1. Every frontend asset changed since the deployed V106.0 commit has its referenced HTML URL refreshed. Historical release notes and earlier validation version labels retain their original versions.

The remote deployment branch was checked before selecting this version: `feature/105.3.4.13` points to V106.0 commit `3b73548dbc971f165c9ef54006b14aac2e8971e1`. The prepared branch contains that commit. A future push must recheck this remote and use a normal fast-forward; never force-push over a newer release. The local preparation branch is `feature/academy-d1-preflight`.

**Publishing V106.1 deploys the frontend and current backend, but keeps the application on Sheets.** Neither the release nor the build applies database migrations or activates D1. This candidate has not been pushed or deployed. Wording changes remain deferred as requested.

## Concrete main target and preservation

| Item | Value |
| --- | --- |
| Current backend | `devrebootworker`, Wrangler environment `development` |
| Main database | `maktab-academy`, `7e732b79-a72f-4da6-be83-524919c49ba4` |
| Initial and upgraded schemas | 45 and 62 application tables |
| Existing records | All 1,683 original rows retained exactly before activation |
| Identity | 73 accounts; existing five PIN hashes and all PIN-setup states retained |
| Public Library storage | Existing `ProgramTimetableCoordinator` namespace and `maktab4lifemedia` R2 bucket |
| Authentication | Existing main `PIN_SECRET` and `SESSION_SECRET`; no synthetic secret substitution |
| At D1 activation | `ACADEMY_D1_MODE=ACTIVE`, exact reviewed import run, `ACADEMY_LIBRARY_MODE=PUBLIC_ONLY` |
| Excluded backend | Production-named legacy `rebootworker` |

Read-only deployment metadata on 10 October confirms the existing main D1 binding, public Library Durable Object namespace, R2 bucket, rate-limit namespace and both authentication-secret names. Their values and namespace contents are not changed. Keep dashboard variables with the existing `--keep-vars` deployment setting. No new private Module subscriptions or permanent media entitlements are implemented or inferred from enrolments/Course access.

## Release verification and private package

All **124 regression test files pass** for V106.1. The current-development Worker dry run succeeds, and generated binding types confirm D1, R2, the existing Durable Object and authentication rate limiter. The application bundle contains no privileged main-transition controller or private transition artifact. The frontend asset review and final pinned package reports are kept privately alongside build outputs.

The offline frontend package contains 700 selected public files, with three Pages functions kept separately from static assets. All 22 HTML references to changed assets use V106.1. Both Worker health modes report V106.1, and maintenance-mode checks return 503 with a 60-second retry header before any storage route. The local startup profile completes with 12.6 ms active time; this is local profiling evidence, not a cloud latency or capacity guarantee.

The [main preparation report](ACADEMY-D1-MAIN-SWITCH-PREPARATION-2026-10-10.md) records the exact copy upgrade, complete rollback, replay and independent restore checks. [Hosted workflow checks](ACADEMY-D1-HOSTED-CORE-2026-10-10.md), [100/200 simultaneous-flow results](ACADEMY-D1-PEAK-2026-10-10.md), and [four-role browser results](ACADEMY-D1-BROWSER-TEST-2026-10-10.md) remain supporting evidence for the unchanged operational code. The V106.1 delta is release labels, asset URLs and documentation; deployment configuration and operational logic are unchanged from the reviewed preparation commit.

The additive package is regenerated against the clean final V106.1 commit and the previously verified main readback, in a new restricted `.academy-migration/release-106.1-20261010-*/` directory. The earlier sealed evidence set is retained. Private account snapshots, hashes, SQL, recovery files and runtime data must never be committed or included in public assets.

## Requested live operation

The proposed operation is to publish the tested V106.1 release, establish a coordinated maintenance window, reconcile the final source, and switch the current Academy to the named main D1 database only if all final checks pass.

1. Recheck the remote release and current cloud target; publish V106.1 to `feature/105.3.4.13` and verify both deployments. Keep Sheets routing until the maintenance window.
2. Pause the current backend using `PAUSED` and verify maintenance responses. Stop manual Academy spreadsheet edits and any external writer/jobs for the same window; wait for in-flight application requests to finish. The owner's previous no-change confirmation is supporting evidence, not a write freeze.
3. Capture the final Sheets source and a new main backup. Compare with the verified baseline. Explicitly reconcile last-login metadata. Any identity, credential, authority or learning change requires an updated reviewed plan; do not force the current additive artifact onto different data.
4. Record all eight activation checks against the final code/source and the owner's approval: source freeze/reconciliation, exact content/authority, backup/restore, hosted core workflows, hosted peak flows, browser acceptance, stopped Sheets writers and owner release approval. Earlier test reports alone do not mark a final gate passed.
5. Generate the fixed, main-UUID-bound controller artifact only after those checks pass. Apply the upgrade and ownership activation in one guarded D1 batch while the application remains paused. Verify the receipt, complete schema/content and active ownership; remove the privileged controller.
6. Enable D1 with the exact verified run and `PUBLIC_ONLY`. Check real login/Home, scoped administration, a permitted save surviving refresh, sign-out/revocation and anonymous Library access. Confirm the application makes no Google Sheets operational requests in active mode.

Main pause, source freeze and activation have not occurred during release preparation. If a final check fails, stay paused for repair or return to Sheets only while no new D1-authoritative writes have been accepted. After new D1 writes, retain the latest state and use [D1 recovery](ACADEMY-D1-TRANSITION-RECOVERY-2026-10-10.md); toggling back to Sheets is not a safe recovery method.
