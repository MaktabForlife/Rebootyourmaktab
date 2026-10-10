# Hosted core D1 verification — 10 October 2026

**The isolated hosted test passed 200 simultaneous complete login/Home flows and the representative core workflow checks.** A second 100-user burst also passed. Peak completion time remains high enough to warrant profiling before live activation. The main application still uses Sheets; no main database migration, main Worker deployment, feature push or live switch occurred.

## Isolated target and verified installation

The owner created `academy-d1-core-test-20261010-a01264a4`, database UUID `c5b96e84-f6ae-4fa6-ba7b-3ce91fe5c22c`, in the existing account. The database identity and empty schema were checked before installation. The previous database-creation authentication error was avoided by using this owner-created target; its underlying cause and the earlier standard-export error remain unresolved.

The synthetic fixture contains 200 accounts and 62 application tables. A complete hosted readback of schema, indexes, triggers, views and every table matched the locally verified fixture exactly before application testing. No real Academy account, credential, subscription or source snapshot was loaded into this test database.

The dedicated Worker uses random test-only secrets, a separate Durable Object namespace and only the new test D1 binding. It has no Google service-account credentials or main media bucket binding. Its environment is development, its storage mode during tests was `ACTIVE`, its Library mode was `PUBLIC_ONLY`, and its compatibility date was `2026-10-10`.

Application source: commit `937e380` (`Prepare reviewed core D1 activation with public-only Library`). Initial test deployment: `d2d15467-fcfe-478b-959d-ad19a1df78f3`. No application source was changed for this verification increment.

## Complete flow and latency results

Each flow performs four sequential requests: account check, PIN login, session verification and signed-in Home. The burst launches all learners together. These are end-to-end Node-client measurements from this workspace, including network time, on a synthetic dataset. They are not browser timings, distributed-user measurements or a capacity guarantee for the larger real Academy dataset.

| Run | Successful flows | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: | ---: |
| 200 simultaneous learners | 200/200 | 16.083 s | 16.324 s | 16.333 s |
| Three sequential ordinary flows | 3/3 | 1.049 s | 1.394 s | 1.394 s |
| 100 simultaneous learners | 100/100 | 8.197 s | 8.340 s | 8.358 s |

There were **zero failed flows and no 429 or 503 responses** in those measured flows. Incorrect PINs, denied roles and revoked sessions separately returned their expected rejection responses.

For the 100-user burst, per-request 95th-percentile times were 1.735 s for account check, 1.947 s for login, 1.672 s for session verification and 3.376 s for Home. Home was the largest stage, but every stage became slower under simultaneous load. This does not establish a single root cause.

[D1 query insights](https://developers.cloudflare.com/d1/observability/metrics-analytics/) were captured privately. Common sampled authentication, ownership and Home queries averaged below one millisecond of query execution time. Repeated ownership/schema checks and subscription-view scans were visible. These observations justify examining request/query volume and round trips; they do not prove that a particular query, client networking, placement or database queue caused the complete-flow delay. Do not substitute these SQL timings for end-to-end latency.

## Hosted workflow checks

| Area | Result |
| --- | --- |
| Roles and sessions | Global Admin and scoped Program Admin access succeeds; Teacher/Student restrictions, incorrect PIN, reset, old-session rejection, new PIN setup and logout pass. |
| Program management | Concurrent class saves produce one success and one stale-save rejection; retry receipts replay correctly. |
| Profiles and enrolment | Synthetic learner creation, scoped Student assignment and class enrolment pass; enrolment retries do not duplicate the operation. |
| Program publication and attendance | Scoped publication and retry pass; assigned Teacher submits and reopens completed attendance with **99 marks**. |
| Course scheduling | Derived paid Course run creation/publication and retry pass; unauthorised paid lesson details remain absent from Home. |
| Academic Calendar | Concurrent changes produce one success and one stale-save rejection; Program Admin cannot administer Academy-wide Course scheduling. |
| Curriculum and account pages | Course/Module/task creation, shared subject creation/rename, retry, account timetable and workspace routing pass. |
| Course access decisions | Global Admin grant/revoke and retry pass; the existing learner session gains and loses paid Course lesson details immediately. Program Admin is rejected. These are existing Course access controls, not Module media subscriptions. |
| Active ownership for new activities | New Course and Program creation preserve active D1 ownership; subsequent Home requests succeed. |
| Public Library | Anonymous metadata read, authorised save and conflicting-save protection pass in the separate test namespace. |
| Private Library | Protected resources remain unavailable. The unbuilt Module media model is not inferred from enrolment or Course access. |

After these synthetic edits, the test database has 201 accounts, one attendance register, 99 marks and one Course decision currently revoked. There are no mixed-ownership rows or unfinished transaction guards. Hosted `PRAGMA foreign_key_check` returns no violations and `PRAGMA quick_check` returns `ok`. D1 rejected `PRAGMA integrity_check` through its SQL interface; the supported [D1 consistency checks](https://developers.cloudflare.com/d1/sql-api/sql-statements/) were used instead.

## Main application and retained test state

A read-only main-database check still reports **45 application tables, 73 accounts, zero sessions and zero changed ownership records**. The main Worker still reports V106.0 through the Sheets path, and its public Library still returns 18 records. The refreshed private 62-table real-data candidate was not modified by this test.

After verification, only the disposable test Worker was put into `PAUSED` mode. Its deliberate maintenance response is 503 with `ACADEMY_STORAGE_PAUSED` and a 60-second retry header; it is separate from the successful burst measurements above. Paused deployment: `df96d3a4-498b-4e9f-bdc5-99488a3b7d92`. The synthetic database and private evidence are retained for subsequent testing. The main Worker remains available.

Private input, random test secrets, complete hosted readback, workflow/latency helpers, logs, reports and a SHA-256 evidence manifest are under `.academy-migration/hosted-core-20261010-c5b96e84/`, ignored by Git with restricted local permissions. Raw secrets, PIN hashes, login links and session tokens are not included in this document. The original test configuration can reactivate this isolated target for reviewed further checks; do not use it against the main application.

## Before live activation

Profile the busy login/Home path, reduce confirmed unnecessary database work and repeat peak testing with a fixture representative of all five Programs and two Courses. The completed synthetic tests support the migration, but their latency and smaller learning dataset do not justify declaring the real website ready to switch.

Browser acceptance remains outstanding because the previous native browser connection security-policy failure is unresolved. Hosted cover upload/streaming with separate test storage, a final source write freeze/reconciliation, recovery for new D1 writes, a reviewed remote atomic activation executor and approval of the concrete live transition also remain outstanding. The existing local 120/120 regression result remains applicable; no implementation code changed in this documentation-only increment.

See [core activation preparation](ACADEMY-D1-CORE-ACTIVATION.md) and the [agreed, unbuilt Module media model](ACADEMY-LIBRARY-ACCESS-MODEL.md).
