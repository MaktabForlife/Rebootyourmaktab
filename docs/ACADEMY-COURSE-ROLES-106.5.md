# V106.5 — Course roles and automatic Academy administration

Release prepared on 10 October 2026. The user approved pushing to the feature branch, which automatically deploys the website and development Worker.

The User profiles screen now edits Course roles using the same None, Student, Teacher and Program Admin choices as Programs. Global Admins automatically inherit Program Admin authority across every existing and newly created Program and Course. The account remains designated Global Admin, with Program Admin shown in each learning-area cell. The automatic checkbox cannot be cleared; additional Student and Teacher roles remain editable. The server derives this authority from the current Global Admin designation, without copying permanent grants into each learning area. Clearing additional roles cannot remove this authority, and removing Global Admin immediately removes the inherited access.

Course assignments participate in current session validation, Academy navigation, curriculum visibility and personal timetables. Students see eligible lessons; Teachers see the lessons assigned to them. Course Program Admins get the assigned Course's timetable rollup and its curriculum, scheduling, publishing and existing Course access controls. Server reads are filtered to their assigned Courses. Writes recheck each required authority within the database transaction. Creating Courses and changing Academy-wide settings remain Global Admin operations.

Course Student edits reconcile with the existing per-account Course access control. Revocation overrides imported subscription evidence without deleting that evidence. Course role revisions include effective Student access, so a concurrent access change cannot be overwritten by a stale profile draft. Removing a Course Teacher role also removes teaching access even when the account retains an independent Program session.

No Module media subscriptions or lifetime media entitlements have been implemented or enabled by this change. The existing PUBLIC_ONLY gate remains in force. No new schema migration is required on the current main database, which already has the Course access migration.

Validation: 127/127 backend regression test files passed, including scoped Course permissions, immediate revocation, conflict handling, atomic rollback, retry receipts and Global Admin authority. A local browser preview using synthetic accounts confirmed a Course role could be edited and saved, and an assigned Course Program Admin could open management and scheduling. No real accounts, source spreadsheets or remote databases were modified.

The release synchronizes website and Worker version markers to 106.5 and refreshes changed frontend asset URLs. Push HEAD to feature/105.3.4.13 and allow the existing automatic deployments to publish both applications. No separate deployment or remote data correction is part of this release.
