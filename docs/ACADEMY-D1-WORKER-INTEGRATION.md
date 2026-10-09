# Academy D1 application integration — 9 October 2026

The D1 login/home rehearsal now runs through the application's actual `backend/src/worker-runtime.js` entrypoint. Release **V106.0** is based on the verified feature release **V105.4.3.17**, commit `9dacef489ebaf76bfeaf97a05e5f0b961dafb40d`. Its navigation cache and timetable presentation are retained, together with the deliberate V105.4.3.15 rollback of the earlier Sheets request-efficiency changes. Pushing the feature branch deploys both the frontend and current development backend; this release keeps D1 mode unset/OFF.

## Integration and configuration

`backend/wrangler.jsonc` now declares the user's main `maktab-academy` D1 binding under **development / devrebootworker** only. The production-named legacy `rebootworker` has no D1 binding. This configuration has passed a deployment dry run; neither Worker has been deployed in this integration step, and no live binding or website routing has changed.

An unset `ACADEMY_D1_MODE`, or `OFF`, retains the existing Sheets routes. The explicit `REHEARSAL` mode directs the entire request to the D1 handler, gated by `ENVIRONMENT=local|development`, a database binding and configured authentication secrets. Unsupported operations return `501 OPERATION_NOT_MIGRATED` rather than reaching a Sheets writer. Unrecognized storage modes fail closed. The repository also requires an imported local/development candidate whose active activities remain `SHEETS/STAGING`; it refuses rehearsal access after an ownership transition.

**Do not enable rehearsal mode on the live application.** It is an integration test boundary, not a completed website cutover. Role, registry, timetable, Library, attendance and other application workflows still need consistent D1 support, and unresolved authority/admission decisions remain open. A real-account deployment must preserve the existing PIN secret and use a separate session secret; this step does not change cloud secrets.

The separate local rehearsal configuration now builds the same application entrypoint. It retains its placeholder local database ID. The local HTTP and browser tools use fresh synthetic databases, accounts and secrets and block all outbound Worker requests. They do not access the main cloud database.

## Browser-facing changes

D1 login/session responses identify the session store. Academy and account-page sign-out use this to revoke the D1 server session in addition to clearing browser state. The logout request can finish during navigation. The Academy page reports a failed server revocation while still clearing the local sign-in. Existing Sheets sign-out does not send a new unsupported logout request, and D1 tokens are rejected by the Sheets session path.

When the account login/PIN setup page is returning immediately to Academy home, it skips Library and timetable loads that would otherwise occur just before redirecting. The destination page loads its own authorized home data.

## Verification

- **111/111 regression test files pass** on the merged V105.4.3.17 code. V106.0 repeats the full suite and updates the active version assertions; its website labels, version endpoints, package metadata and Worker health response agree.
- The current source capture still passes **1,680** exact account-context/home comparisons: 73 active accounts, 104 available contexts, 116 Program grants, all seven activities and two clock scenarios. Preserved hashes are compared without entering real account PINs.
- **200/200 simultaneous synthetic flows pass** through the actual runtime entrypoint: 800 account-check, login, session and home HTTP requests. PIN reset/setup, stale session rejection, disable/re-enable, logout, concurrent setup and permission-removal checks pass. There are **zero outbound Worker requests**.
- The local burst completes in 2,281 ms (p50 2,083 ms; p95/p99 2,281 ms). This is local emulator evidence, not a hosted capacity or latency measurement. The installed executable runtime supports `2026-09-28`; the real development Worker retains its existing compatibility date and its build passes.
- The local browser preview starts successfully with synthetic data. **Browser click-through remains unverified:** the browser tool refused access because it could not verify its required administrator security policy. No alternative browser access or security workaround was attempted. Frontend regression checks run independently of that blocked UI test.

Private verification evidence is retained under the ignored `.academy-migration/` directory:

- `integrated-regression-v105.4.3.17.log`
- `main-db-integrated-v105.4.3.17-parity.json`
- `d1-load-OQ6Q2x/report.json`
- `integrated-v17-worker-dryrun/`

V106.0 release checks are recorded in `release-v106.0-regression.log`, `release-v106.0-ui-recheck.log`, `main-db-v106.0-parity.json` and `v106.0-worker-dryrun/`. The initial full suite passed 109 files and identified two UI assertions still expecting the prior version; both pass after updating those assertions. The source comparison again passes all 1,680 comparisons, and the development deployment dry run passes with the main D1 binding and no rehearsal-mode variable.

## Local browser preview

From the repository root, with the bundled Node 24+ runtime and existing Wrangler/Miniflare/esbuild dependencies:

```sh
node backend/tools/academy-d1-browser-preview.mjs \
  --runtime-root backend/node_modules \
  --compatibility-date 2026-09-28 \
  --port 3400
```

The tool prints a loopback URL and synthetic account details. `login-0002` has test PIN `1234`; `login-0012` starts without a PIN for setup/return-to-home testing. No real account PIN should be entered. Only the Academy/account pages and their approved static assets are served; private files and symlinks are refused. The browser API targets the local Worker, and the cloud database is not bound. The server listens on `127.0.0.1` and rejects unexpected Host headers. Stop it with Ctrl+C. An optional local `/__preview/report` returns only API paths/statuses and aggregate session counts, and saves that evidence privately.

The earlier [main database preparation](ACADEMY-MAIN-D1-PREPARATION.md) remains valid. No cloud rows, migration checks or ownership state were changed by this integration. The website continues using Sheets, the candidate is not synchronized with subsequent edits, and `cutoverReady=false`.
