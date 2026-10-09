# V105.4.3.3 — One attendance entry

The main account page has one Take attendance link for teaching accounts. Programs are selected using the pills on the attendance page. [Release notes](RELEASE-NOTES.md).

# V105.4.3.2 — Attendance by Program and class

Attendance now shows teaching Programs as pills and classes in adjacent columns. Each class has a lesson selector, Submit attendance button and learner list; Teachers see their classes, while Seniors and Admins see all classes. Submitted marks can be edited with their original roster preserved. The Account link now returns to the signed-in person's personal page. [Attendance details](docs/PROGRAM-ATTENDANCE.md).

# V105.4.3.1 — Class saves and attendance breaks

Program Management now saves all selected student class assignments in one coordinated change, with a single retry identifier if Google Sheets is temporarily busy. Attendance excludes timetable breaks from its registers and lesson totals. [Release notes](RELEASE-NOTES.md).

# V105.4.3.0 — Program attendance

Teachers can submit attendance for one published Program lesson or all their assigned lessons today, including lessons they co-teach. Learners start Present; teachers mark Absent or Excused exceptions. Unsubmitted registers remain unknown, and complete days show Present, Partial or Absent according to lesson attendance. Reboot's historical day records are preserved. [Attendance workflow and reporting limits](docs/PROGRAM-ATTENDANCE.md).

Feature branch only; Development verification and the Excused percentage policy remain open.

# V105.4.2.26 — Co-taught Program lessons

A lesson for one class can name a lead teacher and additional teachers. Each teacher receives the lesson in their own timetable and is checked for clashes, availability and teaching hours. The class and whole Program publication omit teacher names for a co-taught lesson; lessons with one named teacher keep showing that name. This update is prepared locally for feature-branch review and has not been pushed or deployed.

# V105.4.2.25 — Library category pills and resource search

Public, signed-in Academy, Program and Reboot/Global Libraries now have All, PDF, Audio Visual and Other category pills. The Academy resource editor can search titles, subjects and sources before selecting a resource. Public Library cards show the number of recordings in a multi-file Archive.org item, and its two explanatory paragraphs have been removed. This update is prepared locally for feature-branch testing; it has not been pushed or deployed.

# V105.4.2.24 — Media icons on Library cards

Public, signed-in Academy, Program and Reboot Library cards show the media type icon with the resource title instead of a media type label. Public and signed-in Academy cards no longer show assigned Program or course names, and their cover panels use light sage; assignments still decide where learners find the resource. This update targets the Development feature branch; production is unchanged.

# V105.4.2.23 — Complete Archive audio track lists

The Open Library now keeps up to 250 playable files per listed Archive.org audio or video item. The live Surahs Teacher and Students item has 104 public MP3 tracks, and all 104 are available in its in-app selector. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.22 — Public Library website links and Archive media

Academy administrators and teachers can use **Add a resource** to create a public **Other** card with an HTTPS website link, subject, optional cover and Learning areas. The card opens the source in a new tab and appears in assigned Academy, Program and Reboot/Global Libraries. Items in the curated Archive.org list sync as eBooks, Audio or Video; editors can classify a PDF as Printable. Public and signed-in users can play listed audio and video in the Library, and PDF books keep their in-app reader. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.21 — Subject columns in the public Library

The public Open Library now places subjects side by side, with each subject's books stacked vertically. Cards keep their portrait covers and omit the “Open Library” caption; module names are hidden from the public display while remaining available to editors and search. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.20 — Public books in Academy learning areas

Open Library books can be assigned to several Programs and Global Subject courses while staying public. The editor's Learning areas selector is independent of subject and module. Assigned books appear in the relevant learner's **For you** view and in each matching Program or Reboot/Global Library; public books still open in the Academy PDF reader. Public book cards are arranged by subject and module. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.19 — Linked subjects, modules and pasted covers

The Open Library book editor now lists active Academy, Global Subject, Reboot and Program subjects and modules. Choosing a subject filters the module list, and the server saves their stable source-aware IDs with their current names. Editors can also paste a JPG/PNG cover directly from the clipboard, preview it, and save it through the existing cover upload path. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.18 — Academy Open Library details

Academy administrators and signed-in teachers can edit the title, subject, module, level, author, description and JPG/PNG cover for Archive.org books and grouped sets. Covers can be linked from a public site or uploaded from a device. Public and signed-in Libraries display these Academy details while PDFs stay at Archive.org. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.17 — Open Library book cards

The public Open Library uses narrower portrait cards so Archive.org book covers fit inside their image panels without overlapping the source or title. Long titles wrap within the card. Multiple public PDFs in one Archive.org item appear as selectable volumes, and clearly numbered items in the same series share one card. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

# V105.4.2.16 — Archive catalogue loading

Fix the public Open Library's Archive.org catalogue request in the Cloudflare Pages runtime. Unexpected redirects remain rejected. A local Pages preview loaded six Archive books, including the four-volume Ihya set, and streamed a PDF byte range. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

This fix was pushed to the feature branch and deployed by the Git-connected Development Pages project.

# V105.4.2.15 — Academy version and Library menu

The Academy welcome page shows its website version in the header. Its existing left-hand **Library** menu opens the public Open Library for signed-out visitors and the personal Academy Library after a verified sign-in. [Release notes](RELEASE-NOTES.md).

The Development Pages site is showing this version.

# V105.4.2.14 — Archive books in Academy Explore

Signed-in learners can browse the public Archive.org list in **Explore** and read its PDFs inside the Academy Library, including the four-volume Ihya item. The public Open Library remains available without sign-in. Both views use the same public catalogue and PDF proxy; protected Academy resources keep their own access checks. [Open Library details](docs/ACADEMY-OPEN-LIBRARY.md).

Feature branch only; hosted Development and device reading checks remain open.

# V105.4.2.13 — Public Open Library volumes

The public Academy Open Library groups **Ihya Ulum ad-Din** into one book with four selectable volumes. Each PDF opens in the existing reader; the source files remain on Archive.org. Other public list items continue to sync automatically. [Source mapping and access checks](docs/ACADEMY-OPEN-LIBRARY.md).

Feature branch only; Development reading checks remain open.

# V105.4.2.12 — All-class publication display

Program timetable previews, published history and image/PDF exports show one entry for an all-class lesson using class teachers. The entry says **All classes** and omits individual class teacher names. A named lesson teacher is shown by name; a lesson without any teacher says **No teacher**. Class and teacher views retain their own lesson links. [Details](docs/V105.4-PROGRAM-LIBRARY.md).

Development only; publication and Academy acceptance remain open.

# V105.4.2.11 — Class teachers across all classes

A lesson can use each selected class's assigned teacher, have no assigned teacher, or name one lesson teacher. The all-class choice also appears in the board-tab class selector. Publication checks identify the lesson by weekday, time, subject and classes, and open it from the issue list. On the Program board, a small plus button on an occupied lesson card replaces the large add-another-class block. [Details](docs/V105.4-PROGRAM-LIBRARY.md).

Development only; publication and Academy acceptance remain open.

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
