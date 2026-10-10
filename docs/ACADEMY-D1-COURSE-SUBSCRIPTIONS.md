# Academy D1 Course subscriptions — unreleased

Global Admins can now activate or deactivate the existing per-account, per-Course paid subscription through the Course access screen in D1 rehearsal mode. Free Courses retain implicit access. Program Admins and Teachers cannot grant paid Course access through their Program roles. The [terminology guide](ACADEMY-TERMINOLOGY.md) applies: Courses are current Continuing Education offerings, and only the older Global Subject name is outdated.

This increment is local. It has not been pushed or deployed, and it does not enable D1 routing. The main cloud database and live Sheets records are unchanged.

## Behaviour and authority

- Paid subscription changes require an existing account and Course, a reviewed Course policy, the current workflow revision and an operation UUID. Activation requires an active account and Course. Existing subscriptions can still be revoked after either is deactivated.
- Explicit decisions override imported subscription evidence for that account/Course pair. Revoking an imported grant masks it without deleting or rewriting the source evidence. A later explicit grant restores access. An empty decisions table preserves imported access exactly.
- Account contexts, Home, the older account timetable, Course access management and Library authorization all use the same effective subscription view. Existing Program sessions pick up a grant or revocation on their next request. If a revoked subscription was the account's only remaining context, its old Course-only session is rejected.
- Paid lesson details and timed meeting links remain protected by the existing per-run policy. Granting a Course subscription unlocks its paid runs; a Free Course does not automatically unlock a separately paid run. Teacher and Global Admin access retains the established scope checks.
- Library opening rechecks current subscriptions. Previously issued file tickets are refused after revocation, before accessing Drive or R2. A response already delivered to a browser cannot be withdrawn.
- The access screen enables paid toggles, disables Free Course toggles and allows revocation of an existing inactive-account/Course subscription. User profiles display the current Course policy and subscription access, including Academy-wide Global Admin access.

The change preserves current per-Course subscriptions. It does not introduce Module subscriptions, completion-based permanent access, expiry rules, Academy admission requirements or new Global Admin grants. Those are distinct product decisions; they must not be inferred from an imported subscription or Program enrolment. The planned Module/completion model in the website specification remains unimplemented.

## Storage and transactions

Extension `0007_course_subscriptions.sql` adds one table, `course_subscription_decisions`, and the `effective_course_subscriptions` view. Confirmed decisions include the administrator, timestamp, revision and explicit active/inactive state. Imported evidence remains immutable through the application path. A deliberate save of an unchanged state also records a reviewed decision and an audit event.

The local candidate has **62 tables** after extensions 0004–0007. The main cloud database remains at the frozen 0001–0003 base, with **45 tables**. The upgrade alone adds no grants, admissions, roles or subscription decisions. Older candidates without 0007 retain imported subscription reads and show editing unavailable; subscription writes fail closed with `COURSE_ACCESS_SCHEMA_REQUIRED`.

Each save commits the decision, audit, actor-bound retry receipt and write sequence together. Global Admin authority, account/session validity and credential epoch are checked inside that transaction. Stale screens receive a conflict, concurrent changes cannot overwrite each other, and retrying a lost acknowledgement returns the committed result. Reusing another administrator's identifier or changing its payload is rejected.

## Verification

- **118/118 regression test files pass.** Seven new scenarios exercise permissions, source-grant revocation, inactive records, stale/concurrent saves, audit rollback, lost acknowledgements, actor-bound replay, transaction-time authority revocation, paid lesson/privacy gates, protected R2 tickets, Course-only session revocation and the actual access-screen script. The existing Course/calendar test also verifies that inactive accounts do not inflate active subscription counts.
- The local Workers/D1 runtime passes **200 simultaneous synthetic login/Home flows**, 196 concurrent Library reads and all existing management/learning/Course/resource checks. New checks grant/replay/revoke a paid subscription, verify Home changes and reject its old file ticket. Thirteen Drive requests are mocked locally and no external requests are allowed. Local results do not establish hosted capacity.
- A private copy of the verified 61-table candidate was upgraded. All 61 existing tables remain exactly unchanged, imported effective subscriptions remain unchanged, and the new decisions table is empty. Integrity and foreign keys pass. Reads retain 73 accounts, five active Programs, two current Courses, eight Library resources, four registers/21 marks and the 14-day account timetable. Synthetic sessions used for verification exist only in a disposable copy.
- The configured development Worker build passes without deploying. Native browser click-through remains unverified because the browser tool could not verify its administrator security policy; no workaround was used.

Private evidence is under `.academy-migration/d1-course-subscriptions-20261010/`, the corresponding local `d1-load` report and `.academy-migration/d1-course-subscriptions-worker-dryrun/`. No real account identifiers, credentials, source exports or private database files are committed.

## Next stages

Finish the route/authority review, including Academy-wide Global Admin administration and any remaining admission/access-policy decisions. Configure the updated upload bridge and Program destinations, refresh and reconcile the source, then verify complete hosted workflows and realistic peak usage. Review the concrete backup, rollback and ownership transition before enabling live D1. Keep the production-named legacy Worker separate.

A future feature push requires a fresh release version and new URLs for changed assets. This local increment keeps V106.0 and Sheets routing unchanged.

The subsequent [route review and Open Library stage](ACADEMY-D1-ROUTE-AUDIT.md) records current website coverage, closes Open Library/shared-sidebar gaps and clarifies that new Global Admin grant administration is a separate feature.
