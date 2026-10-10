# Separate D1 browser test website — 10 October 2026

The synthetic Academy now has a separate [test website](https://academy-d1-browser-test-20261010-a01264a4.maktab4life.workers.dev/academy/). The approved in-app browser can open this address. Desktop checks cover all four roles, attendance and profile saves surviving refresh, Program scope enforcement, sign-out, and an anonymous public PDF. **123/123 regression test files pass. Main V106.0 remains on Sheets.**

The owner subsequently confirmed that the logins work and deferred wording updates to ongoing website development. The desktop workflow evidence and owner login confirmation are available for final release review; they do not claim complete device/feature coverage or approve main activation. No live migration review has been marked passed automatically. See [main switch preparation](ACADEMY-D1-MAIN-SWITCH-PREPARATION-2026-10-10.md).

## Isolation and deployment

| Component | Dedicated test target |
| --- | --- |
| Website Worker | `academy-d1-browser-test-20261010-a01264a4` |
| API Worker | `academy-d1-core-test-20261010-a01264a4` |
| D1 | `c5b96e84-f6ae-4fa6-ba7b-3ce91fe5c22c` |
| Runtime | `ACTIVE`, pinned synthetic import; `PUBLIC_ONLY` |
| Data | Five synthetic Programs, two Courses, 201 synthetic accounts; 62 application tables |

The API Worker was resumed from its preceding paused state. **Both test Workers remain available for owner testing.** Its previous private 62-table backup is retained. No tables were replaced or reset in this stage. Test attendance, profile edits and session activity are intentionally retained.

The website has one fixed `TEST_API` service binding to the dedicated API Worker, plus its static assets binding. It has no D1, Google, R2 or authentication-secret binding. Browser `/api/` requests use the website's own address and forward through the fixed service binding. The test API accepts the exact test website origin. The main API's configuration is untouched.

The packager replaces `js/m4l-config.js` only inside the generated test copy. The repository's normal hostname-based configuration is unchanged. The original configuration would otherwise classify an unfamiliar hostname as production. Browser connection policy also excludes both main backend addresses and Google API hosts. Public Archive.org/CDN connections remain available for the Library/viewer.

Only explicitly selected, Git-tracked public directories/files are packaged. Symlinks, unknown file extensions, oversized assets, private directories, backend source, project sources, Git metadata and test credentials are excluded. The package contains 695 files, including the PDF viewer's translations and colour profile. All test responses use no-store and noindex headers; staged HTML titles start with `[TEST]`. The deployment uses [Worker-first static-asset routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), an [assets binding](https://developers.cloudflare.com/workers/static-assets/binding/) and a fixed [HTTP service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/).

Existing public catalogue and PDF adapters are reused. The test PDF wrapper allows listed Archive.org PDFs and the existing public Ta'limi Board duas PDF; it rejects Google Drive, R2 and main private-file URLs before fetching them. No private media entitlement is created.

## Verification

| Check | Result |
| --- | --- |
| Deployment/build contracts | Site and backend dry runs; generated bindings; latest Fetcher type contract verified. |
| Hosted website/asset checks | 12 real HTML screens, 83 referenced local assets and 58 endpoint/page checks pass. |
| Four-role API flows | Account check, correct PIN, D1 session, Home, authorization, private-media rejection, logout and old-session rejection pass. Wrong PIN returns 401. |
| Learner browser | PIN sign-in, Home, assigned Programs 1 and 4, Program navigation and refresh/session restoration pass. |
| Teacher browser | Teacher access to all five synthetic Programs; attendance register loads after the selector fix below. |
| Attendance save | Submit 10 October register with account `account-0010` Absent. Browser refresh and a later API read retain the submitted register and mark. |
| Program Admin browser | Management for synthetic Program 1 loads. Attempted management of Program 2 is denied; its Student access remains distinct. |
| Global Admin browser | Academy administration, User profiles and five active Programs load. Rename account `account-0010` to `Synthetic learner 10 browser checked`; browser refresh and D1 readback retain the edit. |
| Sign-out | Browser sign-out between roles; hosted API verifies revocation. Final browser state is anonymous. |
| Public Library | Anonymous Archive.org catalogue loads; public Ta'limi Board PDF renders in the embedded viewer. No unexpected console warnings/errors on the successful screens inspected. |
| Private data boundary | Backend/private artifact URLs return 404; private PDF source returns 403; protected media APIs remain blocked. |
| Main read-only verification | At 11:08 UTC: 45 tables, 73 accounts, zero D1 sessions, zero ownership changes; V106.0 healthy on Sheets; 18 public Library metadata records. |

The earlier `ERR_BLOCKED_BY_CLIENT` observation applied to the prior URL. It was not bypassed with another browser or proxy. The newly published test application opened normally through the approved browser API.

## Bug found through the browser

The attendance screen first calls `/api/program-library/available` to obtain its Program choices. The account page reuses the same selector. `PUBLIC_ONLY` incorrectly blocked that route along with private media, so attendance could not load even though direct attendance API checks passed.

The D1 router now exempts only the authenticated normal/admin `program-library/available` selectors. Their response contains assigned Program identifiers, names, roles, an account path and store label. They contain no resources, folder IDs, file URLs or media access. All protected catalogue, access, cover, upload and folder paths remain blocked. A regression case exercises selector authentication, response fields, the attendance bootstrap and continued private-catalogue rejection. The fix is deployed **only to the synthetic API Worker** in this stage.

## Owner checklist and remaining work

Four synthetic sign-in links and PINs are in the private `.academy-migration/browser-site-20261010-c5b96e84/TEST-ACCOUNTS.md` handoff. They are neither Git files nor website assets. Sign out between roles or use separate private browser windows. Do not enter real learner records on the test website.

Review Home, each role's permitted actions, one saved test edit after refresh, sign-out, and anonymous Library access on the browsers/devices actually used by learners and staff. Report the role, screen, action and visible failure for anything unexpected.

Some management-screen text still describes setup or a later migration and mentions the preceding Senior/Admin vocabulary. The Program setup introduction also refers to spreadsheets. The owner has deferred these wording updates to ongoing website development; they are not a migration prerequisite. This stage does not claim that every management label or every feature has been accepted. Synthetic fixture access-policy review messages are preserved rather than silently approving them.

Private snapshots, deployment/build logs, test links, API results and browser observations are retained with restricted permissions under `.academy-migration/browser-site-20261010-c5b96e84/`. Do not publish that directory. The baseline snapshot predates the browser edits; ordinary active-state readback is not presented as a consistent full backup of those later writes.

Before a main switch: finalize browser acceptance using the desktop checks and owner-confirmed logins, with additional device coverage if required for release; freeze all source writers and reconcile the final capture; verify final authority and backup; regenerate the concrete activation review against final code/data; obtain owner release approval; then perform the controlled deployment/activation. Wording cleanup is deferred. The [eight-check contract](ACADEMY-D1-CORE-ACTIVATION.md) remains mandatory. The new Module subscription/lifetime-media model remains unbuilt.

No feature push, main deployment, main schema/data/ownership change, main storage flag change or version bump occurred. A later feature push requires a synchronized new release version under `AGENTS.md`.
