# V105.4.3.3 — One main-page attendance link

Replace the attendance link repeated under each Program on the main account page with one Take attendance entry. It opens the attendance page's Program selector and appears for accounts with at least one Teacher, Senior or Admin Program role.

# V105.4.3.2 — Class-column attendance

Teaching Programs appear as pills. The selected Program shows classes side by side, each with one lesson or All lessons, its own submit button and learner statuses. Teachers see classes where they teach a lesson or are class teacher; Seniors and Admins see all active classes. Breaks remain excluded. Submitted marks can be edited, including on earlier dates, with the saved roster retained and revisions appended for audit. Earlier combined multi-class registers remain together in a labelled column. Account navigation uses the signed-in person's personal link, and a Program Library link is available.

# V105.4.3.1 — Batch class assignments and lesson-only attendance

Program Management’s Save all submits changed student classes as one coordinated spreadsheet write instead of one request per student. Interrupted saves retain their retry identifier, including an individual save already pending in a browser session. A Google Sheets rate limit leaves the pending change available for retry after the cooldown. Program attendance omits timetable breaks from register cards and lesson totals; existing submitted lesson rosters remain unchanged.

# V105.4.3.0 — Program attendance

Published Program lessons now have Present, Absent and Excused registers. Teachers submit one lesson or all assigned lessons for the current day, including co-taught lessons; unfinished registers remain unknown. Program and account screens link to attendance. Reboot history remains day-level, with no invented past lesson results. [Program attendance](docs/PROGRAM-ATTENDANCE.md) describes the storage, day summary and reporting limits. This release is for the feature branch; live comparison and Excused percentage policy remain open.

# V105.4.2.26 — Co-taught Program lessons

The Program timetable editor can assign up to eight additional named teachers to a single-class lesson. Validation checks every assigned teacher for Program access, clashes, availability and weekly teaching limits. Publication history retains all assignments, and each teacher sees the lesson on their own timetable. Class and whole Program previews, published views, images and PDFs omit teacher names when more than one teacher is assigned to the lesson. Single-teacher and unassigned lesson displays remain as before. Prepared locally; not pushed or deployed.

# V105.4.2.25 — Search and grouped categories

The Academy resource editor filters its existing resources by title, subject, source and saved details, and disables saving when no selection matches. Public, signed-in Academy, Program and Reboot/Global Libraries show four category pills: All, PDF (eBooks and Printables), Audio Visual (Audio and Video), and Other. Archive.org audio/video cards identify multi-file recordings by count while retaining their in-app player and file selector. The public Open Library introduction now contains just its eyebrow and heading. This release is prepared locally; the feature branch and Development deployments are unchanged.

# V105.4.2.24 — Clearer Library cards

Show a media type icon on every Library card and remove the visible media type text. Public and signed-in Academy cards omit Program and course names while retaining subject and title. Their pale lavender cover panels change to light sage. Learning area assignments and access rules are unchanged. This version targets the Development feature branch; production remains unchanged.

# V105.4.2.23 — Full Archive audio track list

Raise the per-item media limit to include every track in the live Surahs Teacher and Students Archive.org item (104 MP3 files). A catalogue regression now checks that more than 100 tracks remain available. The Development frontend and Worker are updated together; production is unchanged.

# V105.4.2.22 — Public Other links and Archive media

The Academy Library editor can add and edit public HTTPS links in the **Other** category. Each new link receives a stable Academy ID and may be assigned to multiple Programs or courses. Its public card opens the source in a new tab; eligible learners also see it in their assigned Libraries. Editors can hide a link without losing its details. Title, category, URL and subject are checked on the server, and only active Academy administrators and teachers can save changes.

The curated Archive.org list now includes public audio and video items with browser-playable files as well as PDFs. The public Library has a category filter; signed-in Academy, Program and Reboot/Global views place listed media in Audio and Video. Public, Academy and Program previews play the files in-page, with a track/file selector for multi-file items. Archive PDFs remain in PDF.js and can be classified as eBooks or Printables. Archive.org remains the source, and no audio or video is copied into Academy storage. Prepared for feature-branch review; production is unchanged.

# V105.4.2.21 — Public Library subject columns

The public Library shows one column per subject, with book cards stacked as rows in that column. The portrait cover remains prominent. Book cards no longer say “Open Library,” and the public catalogue and book dialog omit module names. Module metadata remains available for editing and search. This version targets the Development feature branch; production is unchanged.

# V105.4.2.20 — Open Library learning areas

An Archive.org book may be linked to multiple active Programs and Global Subject courses. Subject and module remain independent catalogue fields. The book stays in the public Open Library, while eligible learners see it in Academy **For you** and in the matching Program or Reboot/Global Library. Program books open in the Program PDF.js dialog with a volume selector; Reboot/Global cards open the public Academy reader. Public cards now use subject and module ribbons, without the Internet Archive or Choose volume card text. The feature branch targets the Development frontend and Worker; production remains unchanged.

# V105.4.2.19 — Linked Library classification and pasted covers

The Archive.org book editor now offers active subject and module dropdowns from the Academy shared catalogue, Global Subjects, Reboot courses and draft Programs. Modules are filtered to the selected subject. Saves resolve the chosen IDs against the current records, so an altered ID or archived subject or module cannot create an unlinked classification. Editors may paste a JPG/PNG cover from the clipboard as well as upload or link one; the existing server-side image checks still apply. The PDFs remain at Archive.org.

# V105.4.2.18 — Academy Open Library details

An editor for active Academy global administrators and teachers adds Academy title, subject, module, level, author, description and JPG/PNG cover details to each Archive.org book or volume set. The public and signed-in catalogues apply these details over the automatically synced Archive list. Covers may use a public HTTPS JPG/PNG URL or a device upload to Academy media storage. PDFs remain at Archive.org. [Details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.17 — Open Library book cards

Public book cards now use a taller portrait image panel and a narrower grid. Archive.org covers stay inside that panel, and long metadata titles wrap instead of overflowing into adjacent cards. The layout also keeps two portrait cards per row on phone widths. Public original PDFs within one Archive.org item become selectable volumes, and distinct listed items with matching numbered series titles combine into one card. This groups the current Tafseer Jalalain volumes and shows all public PDFs for Maariful Quran, Tasheelul Fiqh and Aqaaid, Yassarnal Quraan, and Riyaadus Saliheen. Original PDFs take precedence over Archive.org derivative copies; the proxy rechecks each selected file against the public list and current metadata.

# V105.4.2.16 — Archive catalogue loading

The public Archive.org list request no longer uses a redirect setting unsupported by Cloudflare Workers. Unexpected redirects still fail closed. A local Pages preview loaded six Archive books, including Ihya Ulum ad-Din as four volumes, and returned PDF bytes through the existing proxy. The fix was pushed to the feature branch and deployed by the Git-connected Development Pages project.

# V105.4.2.15 — Academy version and Library menu

The public Academy welcome page now shows **Website V105.4.2.15** in its header. The existing left-hand Library item opens `/academy/open-library/` before sign-in and `/academy/library/` after the Academy session is verified. Signing out returns the item to the public destination. This version is visible on the Development Pages site.

# V105.4.2.14 — Archive books in Academy Explore

The signed-in Academy Library now shows public Archive.org books in Explore and opens them in its in-page PDF.js reader. The Ihya card has a four-volume selector. The public Open Library continues to work without an account, while protected resources retain their separate server access checks. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md). Hosted Development and device reading checks remain open.

# V105.4.2.13 — Public Open Library volumes

Ihya Ulum ad-Din appears as one public book with a selector for four Archive.org volumes. The Archive list continues to sync other public PDFs. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md). Live PDF delivery and device checks remain open.

# V105.4 — Program curriculum and Library management

Program curriculum now includes subject-level and module-level task definitions. Program administrators can organise protected Drive resources into eBooks, Printables, Audio, Video and Other by subject, optional level, module and task. Existing Program spreadsheets can add two task/resource tables without rewriting earlier curriculum or timetable records. [Workflow and acceptance](docs/V105.4-PROGRAM-LIBRARY.md).

The Library management screen supports file selection, edits, archive/reactivation and protected administrator preview. Program student delivery and task assignment remain in V105.5. This branch has automated verification; Development acceptance with actual records is pending.

# V105.3.3.4 — Class and teacher timetables

Blocks is now the only timetable preview. Select one class or one assigned teacher for the preview and its PNG/PDF export. The Academy and selected name form the heading; version, effective date and timezone appear in the footnote. Lesson blocks omit the name already stated in the heading. [Scope and verification](docs/V105.3.3.4-CLASS-TEACHER-TIMETABLES.md).

Development only; user acceptance remains open.

# V105.3.3.3 — Compact timetable blocks

Blocks now uses 30-minute grid lines and smaller spacing. Short Assembly and Break entries arrange details across the available width, so they do not inflate the entire time scale. The reference morning timetable exports on one page, with all details and linked titles retained. Up to seven days fit across one export page. Table remains unchanged. [Verification and scope](docs/V105.3.3.3-COMPACT-BLOCKS.md).

Development only; user acceptance remains open.

# V105.3.3.2 — Optional timetable blocks

Choose **View → Blocks (trial)** in the timetable preview or published history for rounded lesson blocks positioned by exact start/end times. Each block retains its name/link, teacher and classes. Gaps and overlapping lessons are visible; image and PDF exports follow the selected view. The original **Table** remains the default and is available immediately for comparison or rollback. [Scope and verification](docs/V105.3.3.2-BLOCKS-PREVIEW.md).

Development only. 84 regression files, browser interactions, PDF visual/link checks and the Worker build pass; user acceptance remains open.

# V105.3.3.1 — Review corrections

Timetables now use a chronological grid with merged double sessions and shared entries. Add breaks directly, adjust widths/heights/alignment, and edit lessons or breaks from the preview. Layouts and breaks are retained in saved drafts and published versions. User actions show the personal login link; individual saves use row icons, and Classes/timetable show full Zoom URLs. [Scope, validation and acceptance](docs/V105.3.3.1-REVIEW-FIXES.md).

Development only. Automated regression, local Worker, browser interactions and PDF checks completed; user acceptance and device share/download checks remain open.

# V105.3.3 — User-profile editing and timetable completion

Edit several users and role cells before saving, with **Save all**, optional row saves, profile popups and sign-in link actions. Newly created users stay at the top for the session. Confirmed program Teacher, Senior and Admin roles now supply the timetable teacher list.

Rename shared Academy subjects, schedule a subject without a module, and copy an older publication into a draft for a new version. Preview and published snapshots use a weekday/time grid based on the supplied reference, with class filtering, linked module names, image sharing/download and linked PDF download. [Scope and acceptance](docs/V105.3.3-PROFILES-AND-TIMETABLE.md).

Development only. Existing access and enrolment acceptance checks remain open; legacy Global Subject and Reboot access migration remains staged.

# V105.3.2.3 — Class and lesson Zoom links

Set a default Zoom link in Classes and an override in each timetable lesson. A lesson link takes priority. A single-class lesson falls back to its class link; combined classes require one shared lesson link before publication. Preview and published history show the selected link. [Storage and acceptance](docs/V105.3.2.3-ZOOM-LINKS.md).

Development only; user acceptance remains open.

# V105.3.2.2 — Weekly timetable corrections

Program timetable rows now repeat weekly without lesson dates or a Pattern column. The grid starts with Module, followed by Classes, Teacher, Weekdays, Start and End. Teachers are optional; time entry accepts 845 as 08h45. Choose one effective date when publishing: the current version remains in effect until its replacement starts. Earlier published snapshots stay unchanged. [Details and acceptance](docs/V105.3.2.2-WEEKLY-TIMETABLE.md).

Development only. User acceptance and the staged academy access-matrix review remain open.

# V105.3.2.1 — Academy access matrix setup

User profiles now shows one editable row per academy user and one column per program/global subject. Roles can be combined; User is the default. Each column has an administrator-controlled Free/Paid setting. The new matrix is staged in separate tabs of the development platform workbook while existing access continues on its current records. [Structure, migration and acceptance](docs/V105.3.2.1-ACADEMY-ACCESS-MATRIX.md).

# V105.3.2 — Shared academy user profiles

User profiles now uses one academy identity across subjects and programs. Academy administrators can add/edit users, combine Student (paid) with Teacher, Senior and Admin roles per scope, and set Active / Inactive separately. Paid Student grants require explicit confirmation; deactivation retains roles and history. Drafts and pending saves survive refresh/reload, with duplicate-safe recovery. [Scope, storage and acceptance](docs/V105.3.2-SHARED-USER-PROFILES.md).

Program teaching roles feed timetable selection. Global-subject staff workspaces remain future work; legacy Reboot grants still require their existing linked staff/student records. Development only; user acceptance remains open.

# V105.3.1.8 — Consolidated management tabs

The management screen now has five tabs in this order: **Overview, Modules, Subjects, Classes, User profiles**. Tab headings no longer include record counts. Modules includes optional standard levels and a class-progress column; teacher selection belongs to the timetable. [Details and acceptance](docs/V105.3.1.8-MANAGEMENT-TABS.md).

User profiles lists existing academy users, their current program roles and class memberships. Full profile editing and multi-program role assignment remain V105.3.2. Development only; user acceptance is pending.

# V105.3.1.7 — Refresh recovery and module rows

Subject names and their level/module counts now line up in columns. Opening a subject or level shows modules as rows, with their class, teacher, learner and action columns. Subjects and levels remain collapsed by default.

Confirmed saves now remain visible while a rate-limited refresh waits and retries automatically. Browsing and unsaved typing remain available; confirmed writes are never repeated by read recovery. Request-local metadata reuse and batched references reduce the measured management refresh from 13 to 9 upstream reads. [Fix and acceptance](docs/V105.3.1.7-REFRESH-RECOVERY.md).

# V105.3.1.6 — Management testing fixes

Subjects, levels and modules start collapsed in the overview. Management tabs remain readable while another row is unfinished, and Return to unfinished entry keeps the draft and its original save identity. Teacher selection and timetable validation require a current Teacher, Senior or Admin role in the selected Program. Login, Program screens, version files and Worker health now share the same release label.

Management and overview refresh use one API request. Spreadsheet failures distinguish rate limits, access/setup problems, temporary outages and unexpected backend errors, with safe diagnostic references. Rate-limited saves delay their automatic retry; confirmed saves remain confirmed even when refresh fails. [Scope, verification and acceptance](docs/V105.3.1.6-MANAGEMENT-FIXES.md).

# V105.3.1.4 — Per-class module completion

Add Active, Inactive and Completed statuses for each class/module pair. Overview shows a status beside each class; selecting it opens the progress editor. A new Module progress section supports records even before a lesson is scheduled. Existing classes show Not recorded until explicitly saved.

Module availability, other classes, timetable lessons and publication history remain unchanged by completion. Progress uses the existing coordinated management snapshot and retry mechanism, without new spreadsheet tabs or bindings. [Use and verification](docs/V105.3.1.4-MODULE-PROGRESS.md).

---

# V105.3.1.3 — Responsive curriculum overview

Program management now opens with a combined Subject, Level, Module, Classes, Teachers and Learners overview. Each module occupies one compact desktop row and becomes a labelled card on mobile. Subjects and levels awaiting modules remain visible with an Add module action; existing modules open their editor. The six individual management sections also use mobile cards.

Classes and teachers reflect the saved timetable draft. Expand learner counts to see distinct learners whose memberships cover a scheduled lesson date, excluding cancelled lessons. Missing or invalid timetable data is labelled rather than presented as an empty roster. [Details and acceptance](docs/V105.3.1.3-RESPONSIVE-OVERVIEW.md).

---

# V105.3.1.2 — Reboot import adds subjects to the Program

Fixes reviewed imports stopping at the Academy catalogue. **Import and add to this Program** now saves missing names and adds missing Program links in one screen flow. Repeating an import reuses names and skips existing links, including names imported by V105.3.1.1. Archived links stay archived. Interrupted imports retain separate catalogue and Program retry receipts.

Catalogue recovery now distinguishes an interrupted save from no pending save, and explains that recovery does not import or attach subjects. Deploy matching Development frontend and Worker. No new bindings, migrations or manual spreadsheet changes are required. [Use and verification](docs/V105.3.1.2-SUBJECT-IMPORT-FIX.md).

---

# V105.3.1.1 — Academy curriculum subjects

Adds a separate shared Academy curriculum catalogue and a single Add subject flow for selecting or creating a subject. Administrators can review and import Reboot subject names, reuse duplicates, and explicitly map old Global-based Program links while preserving their levels, modules and published history. Reboot and Global Course records remain unchanged.

Catalogue preparation is automatic on the first create/import; no new Worker binding or Cloudflare migration is needed. [Setup, retry and acceptance](docs/V105.3.1.1-ACADEMY-SUBJECTS.md) includes the two-workbook save behavior and rollback limitations.

---

# V105.3.1 — Program management screens

The account sign-in badge and both frontend version files now report V105.3.1 consistently with the management screens and Worker.

Adds compact management grids for shared subject links, optional levels, modules, classes, teacher assignments and dated learner memberships. Saved rows feed the timetable directly. Includes Johannesburg-default timezone dropdowns, archive/reactivation, stale-edit checks and retry-safe management history. Existing Academy accounts are reused; central privileges and live Reboot data are unchanged.

Deploy matching frontend and Worker to the separate Development projects, then open **Manage Program → Prepare management tables**. No new Worker binding is needed. [Setup and acceptance](docs/V105.3.1-PROGRAM-MANAGEMENT.md) explains the new management snapshot reader and rollback constraints.

---

# V105.2 — Program timetable builder (105.2.0)

Adds module lessons with optional levels, one or multiple class audiences, recurring/one-off patterns, cancellation/move exceptions and a bounded publication window. The compact grid offers keyboard saving, teacher/class/known-learner conflict feedback, linked weekly preview and explicit immutable publication history.

Canonical data remains in Sheets. Timetable saves and publication use a per-Program Durable Object coordinator with fresh authority checks, a durable pending intent, atomic Sheets revision/snapshot/receipt writes and retry-safe recovery. Append-only state revisions prevent delayed old writes from replacing a newer draft or published pointer. Existing Reboot and Global Course paths remain isolated.

This is a local implementation package; Development deployment and real-data acceptance remain pending. Deploy the new runtime entrypoint and coordinator binding/migration with the frontend. Full membership/curriculum management remains V105.3/V105.4 and student Academy integration remains V105.6. See [verification](docs/V105.2-VERIFICATION.md) and [setup/recovery](docs/V105.2-PROGRAM-TIMETABLE.md).

---

# V105.1 — Program setup (105.1.0)

Adds a platform-only Program registration/configuration grid and recoverable spreadsheet preparation on the V104.5.4 baseline. Reuses CourseRegistry and central accounts. Duration and optional timezone are separate from curriculum levels. New Programs remain inactive; mappings cannot be changed from this screen.

Includes service/repository boundaries, atomic Platform registry/definition/audit writes, sequential stale-edit checks, preserved failed input, keyboard saving and responsive grid controls. Setup currently requires a single editor; simultaneous request coordination remains outstanding.

Local verification: 69/69 backend test files and 167/167 syntax checks passed. No live deployment or Aalimiya registration has been performed. See [setup/recovery](docs/V105.1-PROGRAM-SETUP.md) and [stage acceptance](docs/V105.1-IMPLEMENTATION-CHECKLIST.md).

---

# V104.5.4 Release Notes — Course / Academy Timetable UI Refinement

V104.5.4 is a code/UI-only refinement on V104.5.3. Platform schema remains `102.0.12`; **no migration is required**.

## Academy timetable

Global Course items now identify the **Course**, not merely the linked Global Subject. EXPLICIT `History of the Quran` therefore displays `History of the Quran` even when its linked Global Subject is `Tafseer & Tadabbur`. The published immutable RunName is preferred so later draft renames do not rewrite historical/current publication labels.

The Hifz derived path is explicitly regression-protected across multiple Academy days. Large detailed pills are centred. When a current relevant session has an authorised Zoom link, the entire pill takes the Academy purple Zoom treatment and the `Zoom` label includes the supplied Lucide link icon.

## Course publishing

The inline Course row remains the single publication surface. For every persisted Course, Publish stays visible. It is enabled only when the saved Course is currently publishable; otherwise it remains visible but disabled and explains why through its tooltip. Unsaved local `+ Add Course` drafts still omit Publish until first Save creates a RunID.

## Recurring schedule UI

- `Exceptions` → `Exception`;
- blank new Start/End values with `--h--` placeholders;
- lower-left `+ Add another time slot` action;
- supplied Lucide `trash-2` row-delete icon;
- no large top-right Add Time Slot action.

## Regression

V104.3 request-level read deduplication and V104.4 Sheets read budgets remain unchanged, and V104.5.3 ONGOING draft-window behaviour remains green.

Final verification: **68/68 backend test files passed**, **160/160 JS/MJS syntax checks passed**, and the V104.4 read audit remains **23 direct-read call sites across 17 files / 15 batch-read call sites**.

See `docs/V104.5.4-IMPLEMENTATION-CHECKLIST.md`.

---

# V104.5.3 Release Notes — ONGOING Draft Publication Window Fix

V104.5.3 corrects the ONGOING Course draft-state defect exposed by a saved DERIVED Hifz Course that still showed `Draft · 0 derived occurrences` and no Publish button.

## Root cause

V104.5.1/5.2 displayed ONGOING Publish From/Through values on the Course row, but `courseDraftFromRun()` reloaded them as blank because no authoritative draft-window fields existed in the timetable state. The browser could preserve the values temporarily after Save, but a subsequent server reload had no persisted window to return.

That meant the UI, derived-occurrence calculation and publication eligibility could disagree about what had actually been saved.

## Fix

Platform schema **102.0.12** adds two columns to `GlobalTimetableRunState`:

- `DraftPublishStartDate`
- `DraftPublishEndDate`

The Courses Save writes those fields for ONGOING Courses. Delivery reload returns them. DERIVED occurrence calculation and inline Publish eligibility therefore consume the same authoritative state.

The publish endpoint also reads the saved state and rejects a supplied ONGOING window that differs from it. This prevents publishing unsaved date changes.

## Validation and migration

The controlled Course scheduling migration supports `102.0.9`, `102.0.10` and `102.0.11` as source schemas and targets `102.0.12`. No tabs are added. Existing Course scheduling modes and publications are preserved.

When migrating an existing published ONGOING Course, the current publication's Publish From/Through dates seed the new draft fields. Unpublished ONGOING dates from V104.5.2 were not persisted anywhere authoritative, so those dates must be entered and saved once after migration.

Platform validation now requires draft dates to be either both blank or both valid/increasing for ONGOING Courses, and rejects draft-window values on FIXED Courses.

## Regression protection

The exact observed scenario is covered: an ONGOING DERIVED Hifz Course scheduled Mon–Thu from 04h00–05h00 with a one-day window of 1 September 2026 derives exactly one Tuesday occurrence after Save/reload and publishes from that saved window.

V104.3 request-level Sheets read deduplication and V104.4 read-budget regression remain unchanged.

See `docs/V104.5.3-ONGOING-DRAFT-PUBLICATION-WINDOW.md`.

Final V104.5.3 verification: **67/67 backend test files passed**, **159/159 repository JS/MJS syntax checks passed**, V104.4 read audit unchanged, and V104.3 request-read deduplication passed.

---

# V104.5.2 Release Notes — Platform Schema Compatibility Hotfix

V104.5.2 fixes a post-migration compatibility regression in V104.5.1. The Course scheduling migration correctly moves `PlatformSchemaVersion` to `102.0.11`, but older central-auth and Academic Calendar guards still rejected schemas above `102.0.9`.

The browser symptom is typically:

```text
Failed to load resource: the server responded with a status of 503 (check, line 0)
```

The `check` resource is `/api/account/check`. V104.5.2 updates the runtime guards so the current `102.0.11` Platform schema remains accepted across central account authentication/revalidation, Academic Calendar administration and central-account migration verification.

This is a **code-only hotfix**. There are no new Sheet columns or tabs and no migration should be rerun. Existing V104.5/V104.5.1 DERIVED/EXPLICIT Course behaviour, inline publishing rules, session descriptions, V104.3 request deduplication and V104.4 read budgets are unchanged.

Verification: **65/65 backend test files passed** and **157/157 JS/MJS syntax checks passed**.

See `docs/V104.5.2-SCHEMA-COMPATIBILITY-HOTFIX.md`.

---

# V104.5.1 Release Notes — Course Publish & Session UI Refinement

V104.5.1 is a focused refinement of the completed V104.5 DERIVED/EXPLICIT Global Course architecture. It does not change the Course scheduling model; it clarifies how Courses are edited, prepared and published.

## Course table presentation

Course Name remains inline-editable but is presented as a soft lavender pill so the Course identity is visually distinct from metadata fields.

The action area now follows one consistent hierarchy:

```text
[ ✎ Schedule ]   [  PUBLISH  ]
[ ✎ Sessions ]
```

DERIVED Courses use `Exceptions` instead of `Sessions`. Schedule/Sessions/Exceptions use a muted teal treatment; Publish uses a stronger deep-berry treatment.

## Publish only when eligible

The inline Course row is the only publishing surface.

Publish is shown only when the Course:

- has been saved and has a RunID;
- is ACTIVE;
- has a publishable schedule;
- has no unsaved Course/schedule/window changes;
- is currently unpublished or is in a saved DEVELOPMENT revision;
- has a valid Publish From/Publish Through window when ONGOING.

A clean already-published Course shows no Publish action. An inactive Course shows none. Unsaved edits show none; after the main Course Save completes, the existing revision workflow leaves the Course in DEVELOPMENT and Publish becomes available again.

## Session workspace

Publishing has been removed from the Sessions/Exceptions workspace. The workspace is preparation-only and now has two edit actions:

- **Cancel** — discard unsaved session changes;
- **Save** — persist session changes without publishing.

Both use icon + text controls, and the full session workspace now has a clear rounded border so it reads as a distinct editing card.

## Optional EXPLICIT session description

EXPLICIT dated sessions now support an optional `SessionDescription` up to 400 characters.

The description:

- is edited on the exact session;
- is not part of DERIVED recurring rules;
- survives normal exact-session edits and rescheduling;
- is copied into `PublishedGlobalTimetableSessions` as part of the immutable publication snapshot;
- is returned in detailed Academy Global Course session data for downstream display/marketing use.

## Schema migration

Platform schema is now `102.0.11`. No new Platform tabs are created; the required tab count remains 19.

Two existing session tables gain one final column:

- `GlobalTimetableSessions.SessionDescription`
- `PublishedGlobalTimetableSessions.SessionDescription`

The controlled migration supports both cases:

- `102.0.9 → 102.0.11`: performs the V104.5 scheduling migration and preserves all pre-V104.5 Courses as EXPLICIT;
- `102.0.10 → 102.0.11`: adds SessionDescription storage while preserving the existing DERIVED/EXPLICIT modes and publications.

## Compatibility

V104.5.1 does not change Program timetable rules, Course access, Central Identity, Attendance, Progress, Library, Planner, Academy access decisions or data ownership.

The V104.3 request-level read cache/deduplication and V104.4 Sheets read-budget guardrails remain regression-protected.

## Final verification

- Full backend regression: **65/65 test files passed**.
- Repository JavaScript/ES module syntax: **157/157 files passed**.
- V104.5.1 Publish-eligibility/session-UI regression passed.
- V104.5 DERIVED/EXPLICIT workshop + per-session-description regression passed.
- V104.4 read audit retained: **23 direct-read call sites across 17 files; 15 batch-read call sites**.
- V104.3 request-level Google Sheets read deduplication regression passed.
