# V105.4.2.10 — Student classes, class teachers and Program timetables

Program Management’s User profiles table lists active students enrolled through the shared Academy access matrix. Edit each student’s single class inline, then use the row Save button or Save all for several changes. Earlier class records remain archived when a student moves. Every Program may optionally assign a class teacher in Classes; lessons without an explicit teacher use that class teacher. The timetable planner has an editable **Program** board for all classes: schedule separate class lessons at the same time or one combined lesson for all active classes. The publication preview exports the whole Program as one image and one-page PDF. [Details and verification](docs/V105.4-PROGRAM-LIBRARY.md).

Development only; publication and Academy acceptance remain open.

# V105.4.2.9 — Program selection

Choose a Program in the setup table by clicking its numbered button in the left column. The selected number is highlighted, and its details open below the table. The separate Details button in the right column has been removed. [Program setup](programs/index.html).

Development only; publication and Academy acceptance remain open.

# V105.4.2.8 — User profiles saving

The changed-record review no longer shows **Save my version**. After reviewing a conflict, **Save all** retries pending role entries for the same Program or subject together. Confirmed saves close edited cells and show their saved values. The feature branch now requires a version update with every push. [Details and verification](docs/V105.4-PROGRAM-LIBRARY.md).

Development only; publication and Academy acceptance remain open.

# V105.3.4.12 — Visual timetable planning

Plan lessons and breaks on class and teacher boards, and enter teacher availability on its own weekly board. Open several boards as in-page tabs. Use the Program button to choose which program's timetable is open, and the Teacher and Class buttons to choose the board view. Edit and move lessons on the board, including split and merged periods. Quick edit opens again, and each teacher's availability board shows that teacher's assigned hours for the week. Board actions now sit in the board header. Save, validate and preview from the top of the timetable page; publish after reviewing the preview and effective date. [Earlier board-tab scope and verification](docs/V105.3.4.4-IN-APP-BOARD-TABS.md).

Development only; Academy acceptance remains open.

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

# V105.3.1.5 — Management save recovery

Management edits survive refresh and browser reload within the same tab. Unrelated row/reference changes no longer block saving; interrupted saves recover and retry automatically with the same operation ID. Different-field edits merge automatically. Conflicting edits to the same field require an explicit choice between the saved version and the user's entry. [Behavior and verification](docs/V105.3.1.5-SAVE-RECOVERY.md).

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

Adds compact management grids for shared subject links, optional levels, modules, classes, teacher assignments and dated learner memberships. Saved rows feed the timetable directly. Includes Johannesburg-default timezone dropdowns, archive/reactivation, stale-edit checks and retry-safe management history. Existing Academy accounts are reused; central privileges and live Reboot data are unchanged.

Deploy matching frontend and Worker to the separate Development projects, then open **Manage Program → Prepare management tables**. No new Worker binding is needed. [Setup and acceptance](docs/V105.3.1-PROGRAM-MANAGEMENT.md) explains the new management snapshot reader and rollback constraints.

---

# Maktab4Life V105.2 — Program timetable builder

Version **105.2.0** extends V105.1 Program setup with a compact timetable grid, combined class audiences, recurring and one-off module lessons, dated exceptions, conflict checks, a linked weekly preview and explicit publication history.

Open `/programs/` as a central GLOBAL_ADMIN, select a saved new Program and choose **Open timetable**. Saving a draft leaves the published timetable unchanged. Timetable writes use a per-Program coordinator, durable recovery intent, immutable revisions and retry receipts; canonical data remains in Google Sheets. New Programs remain inactive for teaching, with Academy/student integration coming in V105.6.

- [Timetable setup, use and recovery](docs/V105.2-PROGRAM-TIMETABLE.md)
- [Implementation and live acceptance checklist](docs/V105.2-IMPLEMENTATION-CHECKLIST.md)
- [Schema and API contracts](docs/V105.2-SCHEMA-CONTRACTS.md)
- [Verification and screenshots](docs/V105.2-VERIFICATION.md)
- [V105.1 Program setup prerequisites](docs/V105.1-PROGRAM-SETUP.md)

This package is locally verified, **not deployed or live-accepted**. The Worker runtime entrypoint and Durable Object binding/migration must accompany the frontend. Minimal verified curriculum/class/teacher references are required for a real timetable. Full membership and curriculum editors remain V105.3/V105.4. V105.1 Program configuration changes still use one setup editor at a time; timetable edits are coordinated in V105.2.

Run `node scripts/program-builder-preview.mjs` and open `http://127.0.0.1:8105/programs/` for a synthetic local demonstration. No Google or cloud writes occur in the preview. The sample timetable link is available from Aalimiya’s Details panel. All preview data is reset when the preview server restarts.

Sequence: V105 Builder on Sheets → V106 Reboot migration on Sheets → later D1 migration → realistic capacity acceptance → wider rollout.
