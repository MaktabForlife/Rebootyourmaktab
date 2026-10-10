# D1 login/Home efficiency and peak verification — 10 October 2026

**The matched hosted comparison approximately halves peak login/Home completion time.** Both versions passed 100/100 and 200/200 complete flows on the same larger synthetic fixture. This is an isolated test result; the main application remains V106.0 on Sheets. No feature push or main deployment occurred.

## Changes

- Account check reads the account without loading roles, activities and subscriptions that its response does not use.
- Authentication reads account/session validity, current roles and Course access together in a D1 batch. Session expiry, revocation, account status, PIN setup and credential epoch remain checked.
- Active-mode readiness also returns schema/timezone facts it already verifies. These are reused only within that HTTP request. Every new request rechecks readiness and current authorization against a primary-anchored D1 session.
- Home reads its calendar alongside the timetable data instead of making a second batch. It reuses the current request's verified Course-import readiness.
- An explicit administrator review of an `UNKNOWN` Course policy now persists Subscription/paid status. Previously the management adapter presented unknown as Subscription, so saving Subscription could return success without updating the database. Imported evidence is unchanged, and no subscription is granted automatically.

No account/session/permission cache across HTTP requests, frontend caching change, private-media activation or main migration is included. [Cloudflare's D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) supports multiple statements in one transactional binding call, reducing database round trips.

## Matched hosted measurements

Target: dedicated Worker `academy-d1-core-test-20261010-a01264a4` and test database `c5b96e84-f6ae-4fa6-ba7b-3ce91fe5c22c`. The prior synthetic database was backed up completely and successfully restored locally before replacement. The test Worker stayed paused during replacement. Complete hosted schema/table readback then matched the new local fixture exactly: **62 tables and 200 synthetic accounts**.

The fixture represents five Programs, two Courses, five Program curricula/classes, seven Module records, 14 published Course sessions and 48 calendar records. All 200 accounts are enrolled in the first Program's shared lesson, with additional memberships exercising other Program scopes. Home projects 49 lessons in the requested week. No real learner records or credentials were used. This represents a busy shape; it does not duplicate every detail or volume of the real Academy.

Each complete flow performs account check → PIN login → session verification → signed-in Home. All learners start together. Measurements use Node fetch from one workspace and include network time; they are not distributed-browser measurements or a production capacity guarantee.

| Simultaneous learners | Existing code p50 | Revised code p50 | Existing code p95 | Revised code p95 | Successful flows, each version |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 | 8.790 s | 4.235 s | 8.964 s | **4.525 s** | 100/100 |
| 200 | 16.752 s | 7.093 s | 17.211 s | **7.920 s** | 200/200 |

P95 improved **49.5% at 100 learners** and **54.0% at 200**. No measured peak flow returned 429 or 503. Three sequential flows had median 1.433 s before and 0.854 s after; those very small samples are not a sustained latency benchmark. The optimized 200-flow maximum was 8.144 s.

Request-scoped numeric instrumentation observed:

| Stage | Existing D1 round trips | Revised D1 round trips | Existing SQL statements | Revised SQL statements |
| --- | ---: | ---: | ---: | ---: |
| Account check | 4 | 2 | 6 | 2 |
| Login | 5 | 3 | 8 | 7 |
| Session | 5 | 2 | 7 | 5 |
| Home | 10 | 3 | 21 | 16 |
| Complete flow | **24** | **10** | **42** | **30** |

This is **58.3% fewer binding round trips** and **28.6% fewer SQL statements**. Most measured Worker elapsed time was spent awaiting D1 binding calls. That includes database service, queuing and network time; it does not establish SQL execution time or prove a single infrastructure bottleneck. Home's client p95 fell from 7.038 s to 2.466 s in the 200-user comparison. The remaining complete-flow p95 of 7.920 s still deserves attention before a live switch.

Both timed versions used the same installed learning data; normal login timestamps and session inserts accumulated. The second Course's imported policy was `UNKNOWN`, which Home already treats as subscription-only, with explicit imported account access and a paid run. After timing, the administrator review test exposed the no-op policy bug described above. That correction passed hosted verification; future fixture generation uses the importer's `PAID` source spelling, with a separate regression case for reviewing `UNKNOWN`. This correction does not change the timed login/Home path.

Baseline deployment: `1b73f9e7-75f8-43f5-85dc-d6b028209f5e`, frozen source at `6a12c24`. Timed optimized deployment: `f956bb42-18af-4192-90e0-c5e078961834`. Final policy-corrected test deployment: `962cafd2-a4dc-4fe8-aa98-b81c465905e5`. Numeric profiling exists only in private test entrypoints; main responses gain no diagnostic headers.

## Correctness and security

- Complete Home JSON matches the frozen baseline exactly for nine synthetic accounts spanning Global Admin, Program Admin, Teacher, mapped Senior and Student access.
- **121/121 regression test files pass.** New cases cover the five-Program/two-Course fixture, 100/200 native flows and bounded query calls, immediate enrolment/subscription changes, session revocation, credential-epoch changes, disabled accounts, invalid dates, stale import readiness and explicit unknown-policy review.
- Actual local Workers/D1 runtime: **200/200 complete flows**, role/PIN/logout checks pass, no outbound service calls. Local p95 2.954 s, compatibility date `2026-06-01`; this is correctness evidence, not hosted capacity.
- Final focused hosted security check: **26 POST requests** plus anonymous public metadata read pass. Role boundaries, paid Course grant/replay/revoke on the same existing learner session, incorrect PIN, PIN reset, old-session rejection, new PIN setup and logout all behave correctly. Private media remains blocked.
- Main-config dry run and test-config dry run pass; test binding/runtime types generate successfully. Hosted `foreign_key_check` has no violations and `quick_check` returns `ok`; no unfinished write guards remain.

One initial management-API read returned account/service authorization error 7403; a subsequent read succeeded. No mutation occurred before identity, synthetic-only data and backup/restore verification succeeded. This does not resolve the earlier standard-export/database-creation authentication limitations.

## Retained state and next work

Only the dedicated test Worker was paused after verification. Paused deployment: `d6e73357-4289-4a1e-b744-6f233984b365`. Its maintenance 503 is deliberate and separate from the successful peak measurements.

Private synthetic fixtures, previous-state backup, exact readback, frozen baseline, numeric profiling wrapper, reports and logs are retained under `.academy-migration/hosted-peak-20261010-c5b96e84/`, ignored by Git with restricted permissions. A SHA-256 manifest records the evidence. The security test changed the PIN for synthetic account index 150 and recorded a revoked Course decision; reset/reprepare the synthetic fixture before reusing the all-default-PIN peak driver. Never use these install/reset artifacts on the main database.

The final read-only main check remains **45 tables, 73 accounts, zero sessions, all ownership Sheets/staging**, with V106.0 healthy and 18 public Library records. The refreshed real-data candidate remains untouched. No live activation review was marked passed from synthetic tests.

Next work remains browser acceptance (the prior browser security-policy connection failure is unresolved), separate-storage cover upload/streaming acceptance, recovery for new D1 writes, the reviewed remote atomic activation executor, and a final source write freeze/reconciliation before approval of a concrete live transition. Module media subscriptions remain unbuilt and private media remains disabled. See the [activation contract](ACADEMY-D1-CORE-ACTIVATION.md) and [Library access model](ACADEMY-LIBRARY-ACCESS-MODEL.md).
