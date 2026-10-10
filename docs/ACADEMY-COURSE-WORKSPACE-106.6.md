# Course delivery workspace — V106.6

The standalone `/academy/courses/manage/` destination replaces the nested Global Subject / Global Curriculum editors with a Course list and one editor. Existing scheduling links open its Sessions tab; links from a Course select that Course. Visible Academy navigation says Courses, retaining existing internal route names for compatibility.

## Workflow

- Save a name-only draft. Dates, category, Free/Paid choice, weekdays, times, teacher and meeting link remain optional until publication validation. Subject and Module categories use the existing Academy catalogues and do not populate content, confer roles or grant media access.
- Generate explicit sessions from the date/day/time defaults or add sessions individually. Changes to defaults do not silently overwrite edited sessions. Generating again requires review before replacement. Each session has its own date, times, teacher, title, Zoom link and Scheduled/Cancelled state.
- Validate the saved draft. Publication requires fixed dates within a year, Free/Paid, at least one scheduled session, active teachers, increasing times and secure Zoom links. Invalid dates, overlaps within the Course and missing required session fields block publication. Academy closures and published teacher clashes are warnings requiring acknowledgement.
- Recheck validation on the server when publishing. Editing details, changes to calendar/teacher records or teacher schedules invalidate earlier validation. Publish the immutable timetable, current-publication pointer, Teacher roles and Course lifecycle in the same guarded D1 transaction.
- Published schedules require a revision before editing. The old timetable remains current while the revision is prepared. Completion is explicit and requires all scheduled sessions to have ended. Completion, cancellation and archive stop the current delivery's timetable while retaining its history and participants.
- Repeat a Complete or Archived Course into a new Course ID and empty participant list. New dates and a new validation are required. Optionally reuse existing attached media metadata without moving or deleting the original records.

## Authority and participants

Global Admins create Courses and automatically inherit Program Admin authority for every new Course. Course Program Admins may edit schedules and participants only for their assigned Courses, including saved drafts. The participant table uses Student, Teacher and Program Admin checkboxes; inherited Global Admin authority cannot be removed by a scoped edit.

Adding a new user creates an active account with Student access to this Course only and a personal first-use sign-in link. Existing accounts should be selected rather than duplicated. No message is sent automatically. Participant edits use row revisions and do not overwrite stale data. Removing Student access explicitly overrides any imported Course subscription evidence while preserving that evidence.

Some existing Courses contain multiple old deliveries under one Course ID. They remain separately selectable in the list, and the participant editor warns that those deliveries share the original Course's participants. They are not silently split or imported again. New repeats use independent Course IDs.

## Media boundary and current specification

Course media access begins at completion and is governed by the learner's retained Student assignment for that Course. Everything attached to the Course, including later additions, will be available while that assignment remains. An administrator removing the Student assignment removes that access through this Course. Archive must preserve participant/media records. This Course rule supersedes the earlier independent lifetime-grant proposal for Courses.

The Program Module model remains separate and unbuilt: a learner subscribed to a Program at Module completion receives lifetime access to the Module. Private storage is still undecided. This release keeps `ACADEMY_LIBRARY_MODE=PUBLIC_ONLY`; the Media tab shows existing record names and the pending storage work. It does not upload, expose file URLs, open protected files or claim that learner media access is operational.

## Database and release

`0008_course_management.sql` adds `course_management_drafts` and its stage index. A draft can exist before a normalized scheduled run exists. Course catalogue identity remains an active management scope, while the delivery's Draft/Published/Complete/Cancelled/Archived state is stored separately. Active is derived from Published and the Course's current date window. New drafts have `website_visible=0` until publication; the Academy entrance excludes them.

Existing account credentials, roles, imported evidence, publications and resources are not rewritten by the migration. Writes use current-session authority guards, revision checks, atomic batches, actor-bound operation receipts and audits. No Sheets requests are introduced. The feature branch deploys the website and development-named current Worker; the production-named legacy Worker is outside this release.

Validation covers name-only drafts, timetable privacy, category independence, publication warnings and stale validation, rollback, retry replay, Course Admin boundaries, inherited authority, participant edits, completion/archive and new-ID repeats. Browser acceptance uses synthetic accounts and Course data, including one-day scheduling, holiday review, publication and adding a learner. No real Course is created for acceptance testing.

Release checks: all 128 regression files pass, including the new Course HTTP/UI checks and existing scheduling/role suites. The development Worker dry-run build passes. The private pre-upgrade SQL backup was restored locally with successful integrity and foreign-key checks, then migration 0008 was applied locally without changing existing accounts or publications. The same additive migration is verified in the current main D1 database with zero draft rows and no foreign-key violations. Existing real Courses and learners were not used for browser write tests.

Older scheduling clients are prevented from overwriting a Course after it has been adopted by the new workspace. Existing read endpoints and untouched legacy deliveries retain their current contracts.
