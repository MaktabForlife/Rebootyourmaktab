# V106.8 — Teaching directory and reviewed Course sessions

## User profiles

Global Admins can tick **Global Teacher** beneath a user's name and save with the existing row action or Save all. This identifies Academy teaching staff; it does not confer administrator authority, Program-wide Teacher roles or access to unrelated lessons. Accounts can hold both Global Admin and Global Teacher designations independently.

Course teacher selectors include active Global Teachers and accounts with an active Teacher role in an active Program or Course. Students and accounts holding only administrator roles are excluded. An unavailable previously selected teacher remains visible with a designation warning so an existing draft is not silently changed. Publication checks teaching eligibility on the server and grants Teacher access only in the assigned Course. Current lesson filtering continues to follow individual teaching assignments.

Global Admin remains a read-only designation in this website release. Its existing D1 authority records and automatic Program Admin inheritance across all Programs and Courses are preserved.

## Course publication flow

1. **Draft:** save with only a name; complete the schedule when ready.
2. **Validate:** check Free/Paid, timezone, date range, weekdays, times, teacher and secure Zoom link. A finish time must follow its start time.
3. **Generate sessions:** fill every matching date inclusively, copying times, teacher, Zoom link and the Course name. A one-day Course produces one session when its weekday is selected.
4. **Review:** open the generated Sessions table, edit exceptions, and validate again. Academy holidays and teacher clashes are shown as warnings.
5. **Accept:** explicitly accept the checked saved sessions, acknowledging warnings where present.
6. **Publish:** the server rechecks the accepted version and publishes it to the Academy timetable atomically.

Ordinary revalidation retains session IDs and individual session edits. A changed schedule requires an explicit regeneration confirmation before replacing those edits. Draft saves and renewed validation clear acceptance. Changed calendar or teaching availability invalidates a stale review, including after reopening the editor. Retry receipts recover committed generation, acceptance and publication without duplicate writes.

## Database and release

Additive migration `0009_course_review_and_teachers.sql` creates `academy_teacher_designations` and adds schedule/acceptance fingerprints to Course drafts. It starts with no new designations and does not alter existing publications, roles, subscriptions or media. Profiles continue to work before this migration; the updated Course editor returns a clear upgrade requirement.

The user approved release on 10 October 2026. Main D1 was backed up and the backup restored and upgraded locally. The hosted test database received the prerequisite 0008 draft table and migration 0009; main D1 then received migration 0009. Both passed foreign-key checks. Main retained 73 accounts, 99 role records, seven timetable publications and three Course drafts, with no new teacher designations. The coordinated feature push deploys the website and current development-named Worker together; the legacy production Worker is outside this release.

Private media storage and the future Program-module subscription model remain outside this change.

## Verification

- Full backend regression: **128/128 test files passed**; dedicated new cases cover generation, one-day schedules, retry stability, preservation of exceptions, acceptance invalidation, teaching eligibility, scoped authority, profile conflicts and atomic rollback. The additional migration-preservation case also passed after the full run.
- Real Worker HTTP contracts and the actual frontend scripts exercised together against synthetic SQLite fixtures; no Google or other outbound data requests.
- Browser preview: saved a Global Teacher designation, confirmed the restricted teacher selector, generated four sessions, reviewed, accepted and published them.
- Cloudflare Worker build validated with a deployment dry run. No deployment performed.
- All nine database migrations applied successfully in Cloudflare's local D1 simulator; the approved hosted rehearsal and main upgrade were then verified separately.
- Version markers and changed asset cache queries prepared as V106.8; feature remote checked at V106.7 before choosing this number.

The backend review followed current [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) and [D1 binding documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/), with the 2026-10-10 Workers type definitions checked locally. Requests use the existing D1 binding, awaited guarded batches and retry receipts; no request-specific state or credentials are placed in module globals.
