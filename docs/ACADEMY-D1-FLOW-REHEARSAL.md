# Academy D1 login-to-home rehearsal — 9 October 2026

The separate development API now completes account checks, PIN login/setup, session checks, context switching, logout and Academy home/activity reads using D1. It also implements isolated administrator account reads, profile changes and PIN resets. The live website and its main Worker still use Sheets; no cloud database, deployment or ownership switch was made in this milestone.

## Verified results

| Check | Result |
| --- | --- |
| Active source accounts | All 73 account identities, names, login links, stored hashes and PIN setup states match |
| Permissions | All 116 selected source Program grants checked; all 104 available sign-in contexts match |
| Home and activity results | 1,680 exact comparisons across every context, public access, seven activities and two clocks |
| Refreshed operational candidate | All rows in all 45 tables match in local D1; foreign-key checks pass |
| Native candidate | Complete content verification and SQLite integrity check pass |
| Concurrent HTTP flows | 200/200 synthetic flows pass; 800 account-check, login, session and home requests |
| External requests during burst and security checks | Zero; the runtime blocks and counts external requests |
| Security checks in local Workers/D1 | PIN reset/setup, disable/re-enable, logout, permission removal, concurrent setup and account rate limiting pass |
| Affected automated checks | 49 pass across migration, D1 flow, authentication and entrance tests |
| Worker configuration | Generated bindings and deployment dry run pass |

The source comparison uses the private captured development baseline. It compares the existing Sheets projection with the new D1 projection at the capture time and near a lesson joining window. It exercises every available context for each active account, including Global Admin, mixed Program roles and Global Course access. Private joining links, membership filtering and published timetable results match.

Real account PINs were not entered, discovered or reset. Five existing credential hashes remain unchanged; 68 active accounts in the baseline have no PIN configured. Actual HTTP authentication and write tests use synthetic accounts with known test PINs. These API tests do not constitute a browser UI end-to-end test.

The 200-flow burst completed in 2,320 ms locally (p50 2,274 ms; p95 2,319 ms; p99 2,320 ms). This measures the local Workers/D1 emulator on this Mac, not Cloudflare edge capacity, internet latency, or a hosted database under load. The installed runtime supports compatibility date `2026-09-28`, which was selected explicitly for the executable rehearsal. The separate Worker configuration targets `2026-10-09`; its dry run passes, but that exact compatibility date was not executable in the installed emulator.

## What changed

- A request-scoped D1 repository looks up one account by its indexed login link or account ID. It reads current permissions and uses a primary-anchored D1 session. It does not load the full account list to authenticate one person.
- A dedicated rehearsal Worker issues its own sessions and rejects existing Sheets tokens. Every authenticated request rechecks account activity, credential epoch, session expiry/revocation and current context authority. PIN changes invalidate earlier sessions; disabling an account revokes its sessions even if it is later re-enabled.
- Credential changes, account changes and their safe audit entries use transactional batches and conditional updates. Stale changes return a conflict; two concurrent PIN setups produce one success and one conflict.
- A D1 entrance adapter reuses the established timetable projection. Program lifecycle selection is explicit for this adapter; the existing Sheets path retains its prior default. The adapter reads current published Course snapshots even after their date window passes, avoiding a false missing-publication warning found during parity checking.
- The converter now imports only the reviewed `PlatformTimezone` setting. Duplicate or invalid timezone values fail conversion. Other platform settings remain outside the active converter.
- Wrong PIN, account rate limiting and unavailable storage have distinct responses. Unsupported operations return `501 OPERATION_NOT_MIGRATED`, without falling back to Sheets.

Opening a screen still makes an API request. This adapter reads D1 and does not cache credentials or permissions between requests. Home data uses a bounded batch of database queries and limits enrolment reads to the current account. Further hosted performance work should use measured query timings and row counts rather than assuming the local burst establishes cloud capacity.

## Data and authorization boundaries

The operational candidate includes the five intended active Programs: Alimiyah, Reboot (Pilot), Mothers of the Ummah, Tafseer and Hifz. It also includes two active Global Courses. The old Reboot Your Maktab workspace, one inactive account and three inactive management records remain excluded. Four Programs currently have published timetables; Hifz remains active without inventing a publication. The separate Hifz helper service is outside this migration.

Twenty legacy Admin/Senior assignments remain review evidence. The isolated rehearsal temporarily reproduces only their existing effective, scoped roles while their review is still required; it does not promote them to Program Admin/HOD. Pending source grants remain ineffective, and rejecting a legacy privilege review removes that rehearsal context. Final authorization and admission policies still require explicit decisions before production use.

The candidate remains `SHEETS/STAGING`, with migration state `IMPORTED`. `cutoverReady` and `operationalImportReady` remain false. These reports are external rehearsal evidence; they do not mark the candidate's cutover checks complete or activate database ownership.

## Reproduce locally

Run from the repository root with Node 24+. Snapshots, policies, hashes, SQL exports, emulator state and generated output stay under the ignored, private `.academy-migration/` directory. Do not commit them.

```sh
node --test backend/tests/academy-d1-flow.test.mjs \
  backend/tests/academy-active-import.test.mjs \
  backend/tests/academy-d1-schema.test.mjs \
  backend/tests/academy-migration-preflight.test.mjs \
  backend/tests/academy-migration-policy.test.mjs \
  backend/tests/academy-entrance.test.mjs \
  backend/tests/academy-entrance-ui.test.mjs \
  backend/tests/account-auth.test.mjs backend/tests/auth.test.mjs

node backend/tools/academy-d1-parity.mjs \
  --snapshot .academy-migration/development-source-snapshot.json \
  --policy .academy-migration/development-selection.json \
  --output .academy-migration/new-flow-parity-report.json

node backend/tools/academy-d1-load-rehearsal.mjs \
  --runtime-root backend/node_modules \
  --compatibility-date 2026-09-28
```

The load tool needs the runtime's Wrangler, Miniflare and esbuild dependencies. Each run creates fresh local state, imports synthetic accounts, starts the real local Workers/D1 runtime, blocks external requests and saves a private report. A newer runtime can test the configuration's exact compatibility date by omitting the override.

Private evidence from this run:

- `.academy-migration/development-d1-all-context-parity.json`
- `.academy-migration/development-active-flow-candidate.sqlite`
- `.academy-migration/d1-flow-candidate/state/`
- `.academy-migration/d1-load-bNgO7c/report.json`

The separate configuration is `backend/wrangler.academy-d1-rehearsal.jsonc`, with a placeholder local D1 ID and required PIN/session secret names. It is not a production deployment configuration. A future real-account environment must retain the matching existing PIN secret to verify preserved hashes; synthetic test secrets are not suitable for those credentials. Use a separate session secret and keep real secret values out of reports and source control.

## Remaining before a website switch

Connect a development browser preview to the isolated API and test it against hosted development D1, using a fresh coordinated source capture for data that has changed. Implement the remaining role, registry and other application writers consistently before switching ownership. Resolve Program Admin/HOD and admission/subscription policy without inventing grants.

Attendance, the shared calendar, historical audits, operation receipts and remaining source settings/tabs still need conversion or explicit omission decisions. The active converter also rejects unsupported dated Program exceptions and unrecognized embedded timetable formats. The source baseline remains non-atomic and can become stale while Sheets editing continues.

The existing production entrypoint, browser API configuration and live data remain unchanged. Continue using the current website until the development integration and remaining migration checks are complete.
