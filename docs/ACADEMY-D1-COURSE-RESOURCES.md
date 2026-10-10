# Academy D1 Course resources — unreleased

**Subsequent owner decision:** This report describes the preceding folder-based implementation. The [agreed Library model](ACADEMY-LIBRARY-ACCESS-MODEL.md) uses public Archive.org material, one shared private store and individual Module media subscriptions. Those subscriptions and permanent completion grants have not been built. Program-specific folders and this earlier access model are not requirements or acceptance evidence for the new Library.

Course resource administration now uses the isolated D1 application path. The [terminology guide](ACADEMY-TERMINOLOGY.md) records the owner's clarification: Courses/Continuing Education are current offerings, Global Subject is an outdated name, Course Scheduling was called Global Curriculum, and Global Admin covers every Program and Course.

This stage is local and has not been pushed or deployed. Live traffic still uses Sheets. No main cloud records, settings, files or source snapshots changed.

## Implemented behaviour

- Global Admins select the Course resource Drive folder, browse it and its descendants, and create/edit/archive Course resources individually or as a batch. Program Admin and Teacher accounts cannot administer Course resources merely through a Program role.
- Existing Course/module/task validation, supported file categories and duplicate checks are reused. New files must belong to the configured Drive tree. Active retained files are checked again on editing. An unavailable or moved file can still have its resource entry archived.
- Folder replacement checks every existing Drive-backed Course resource, including inactive entries, before saving. A replacement that would strand an existing file is rejected. Imported external/R2 links retain their existing value when edited without a replacement file; arbitrary new external links are not accepted.
- Moving an existing resource to another Course is rejected rather than duplicating its identity or losing access-policy associations. Create a new resource instead. Module/task changes within the same Course retain the existing domain validation.
- The existing resource editor is enabled on D1. Browsing is a read: it neither issues a write retry identifier nor advances the saved screen revision. An unrelated change while browsing therefore still produces a conflict when the old draft is saved.
- The older /api/platform/global/resources/access route now uses the same session-bound D1 file tickets as Academy Library. Resources must meet the current publication, active-branch and access checks. File opening rechecks the account/session, paid subscription, active resource and Drive containment; an old link cannot retain revoked access.

Resource metadata and folder configuration are stored in D1. File contents stay in Drive, or the existing R2 location for imported links. Drive browsing/file verification still uses the Drive API; these actions never read or write Google Sheets.

## Transactions and data

Every save requires the current workflow revision and an actor-bound operation UUID. Resource rows, folder configuration, audit history, retry receipt and write sequence commit atomically. Authority is rechecked inside the transaction after Drive verification. A lost acknowledgement replays the committed result; conflicting saves preserve the browser draft for review.

This stage needs no new migration or import: it uses the existing 61-table local candidate. It preserves Course policy, subscription evidence, timetable publications and historical attendance. It does not create admission, entitlement or Global Admin grants.

## Verification

- All **117/117 regression test files pass**. Six Course-resource scenarios cover permissions, nested browsing, a 20-resource batch within the tested query budget, duplicate/outside/unsupported files, retained-file moves, folder replacement, rollback, replay, concurrent edits, authority revocation, paid subscription revocation and the actual editor script.
- The local Workers/D1 runtime passes **200 simultaneous synthetic login/home flows**, 196 concurrent Library reads and the existing management/learning/Course/calendar/account checks. New checks configure a folder, browse, save/replay a resource batch, stream a file, archive the resource and reject its old file ticket. Eight Drive requests are mocked locally; no external network requests are allowed. These results do not establish hosted capacity.
- The configured development Worker build passes without deploying or changing its configuration. Native browser click-through remains unverified because the browser tool could not verify its administrator security policy; no workaround was used.
- Reads of a disposable private copy preserve five active Programs, two current Courses, eight existing Library resources, four attendance registers/21 marks and the 14-day account timetable. No real PIN is entered and the original candidate is unchanged.

Private evidence is under .academy-migration/d1-course-resources-20261010/, the corresponding local d1-load report and .academy-migration/d1-course-resources-worker-dryrun/.

## Remaining before enabling D1

The subsequent [Course subscription stage](ACADEMY-D1-COURSE-SUBSCRIPTIONS.md) completes the existing per-Course grant/revoke controls locally. The following list records the boundary of this resource increment.

Complete Course subscription/admission and Academy-wide Global Admin grant administration rules and any remaining dependent routes. Deploy/configure the updated upload bridge and missing Program destinations. Refresh/reconcile the source, verify complete hosted flows and peak usage, and review backup/rollback and the concrete ownership transition before enabling D1. Keep the production-named legacy Worker separate.

A future feature push requires a fresh release version and updated URLs for changed assets. This increment does not enable live D1 routing.
