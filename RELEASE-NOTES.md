# V106.5 — Course roles and automatic Academy administration

Edit Course roles in User profiles using the same None, Student, Teacher and Program Admin choices as Programs. Course Teachers see their assigned lessons; Course Program Admins can manage and schedule their assigned Courses. Navigation, permissions and revocation follow the saved roles.

Global Admins automatically have Program Admin authority in every Program and Course, including newly created ones. User profiles keeps the Global Admin designation by their name and shows the automatic Program Admin role in each learning area. No database migration is required. [Release details](docs/ACADEMY-COURSE-ROLES-106.5.md).

# V106.4 — Compact editable user sheet

User profiles uses the full page width, compact rows and frozen name/status columns. Names and Active/Inactive status can be edited directly, with changes retained until Save all. Large introductory and migration notices are replaced by collapsed editing help. Real conflicts remain visible for explicit review, and profile edits can continue while a role conflict is open.

Read-only D1 access settings no longer display misleading review prompts. Restored, unsaved Program drafts translate the approved old Admin/Senior names into Program Admin/Teacher; uncertain pending operations retain their exact payload. No database upgrade or import is required. [Release details](docs/ACADEMY-USER-SHEET-106.4.md).

# V106.3 — Course administration and clearer role conflict review

Global Admins can open Course management and Course scheduling from Academy administration, Workshops and individual Course pages using their existing Academy sign-in. These destinations reuse the current D1 Course/Module and scheduling editors, with server-checked authority. Course means the continuing-education offering previously called a Global Subject; scheduling was previously under Global Curriculum.

User profiles now shows the affected user and Program and keeps the saved and proposed roles visible in a responsive comparison. A stale draft still requires explicit review before saving. First, repeat and conflicted Program-role saves are covered against the real D1 HTTP contracts. No database upgrade or data import is needed. [Release details](docs/ACADEMY-COURSE-MANAGEMENT-106.3.md).

# V106.2 — Complete Academy timetables

Keep the same complete, authorised Academy timetable on Home, the full timetable and every Program/Course page. Students and Teachers receive one card per directly involved lesson with its details shown inline. Program Admins receive their Programs’ full schedules grouped by meeting link and day; Global Admins receive the entire Academy grouped the same way. Accounts with mixed roles retain direct participation outside their administered Programs.

Restore one timetable colour, darken cards while their joining links are available, open joins five minutes before the lesson, and display the signed-in name in the top bar. Recheck joining windows on every timetable and clear protected content on failed refresh. D1 remains the live Academy store; no database migration is needed. [Release details](docs/ACADEMY-TIMETABLE-106.2.md).

# V106.1 — D1 core migration release candidate

Prepare the coordinated website/backend release for the five active Programs, two current Courses and 73 active accounts. Include D1 account, scoped management, timetable, attendance and Course/calendar workflows, reviewed role mapping, current permissions and server-side sign-out. The matched hosted login/Home test reduces database round trips from 24 to 10. Browser checks cover four roles and saved attendance/profile changes; the owner confirms test logins.

Synchronize current website/Worker version markers and refresh every changed frontend asset URL. Preserve existing deployment bindings and dashboard variables. Publishing this candidate keeps the main application on Sheets: it does not run migrations or enable D1. The separate coordinated switch uses a guarded 45→62-table upgrade plus ownership activation in one transaction, with private backups and tested recovery. A final source freeze/reconciliation and owner approval remain required.

At D1 activation, retain the public Library and use PUBLIC_ONLY for Academy media. Individual Module subscriptions and permanent media entitlements remain unbuilt; this release grants no new private media access. The production-named legacy Worker is outside the switch. [Release scope and live switch](docs/ACADEMY-D1-RELEASE-106.1.md).

## Recorded implementation and preparation evidence

Prepare an offline main-database upgrade from 45 to 62 tables, preserving all 1,683 existing rows, accounts, PIN hashes and authority evidence. Verify fresh main readback, independent recovery files, guarded additive SQL and a combined upgrade/activation batch with complete rollback and retry replay. All 124 regression files pass; local Workers/D1 checks have zero external traffic. The owner confirms test logins and defers wording cleanup. Main V106.0 remains on Sheets; final source reconciliation and release approval are pending. [Main switch package and sequence](docs/ACADEMY-D1-MAIN-SWITCH-PREPARATION-2026-10-10.md).

Publish a separate synthetic D1 test website and verify four-role login/Home navigation in the approved browser. Attendance and profile saves survive refresh; Program Admin scope and anonymous PDF access pass. Fix the public-only media guard blocking the authenticated Program selector used by account/attendance screens. At that stage all 123 regression files passed. The separate test site/API remain available; main V106.0 stays on Sheets. The owner subsequently confirmed logins and deferred wording updates; final live review remains pending. [Test website and browser results](docs/ACADEMY-D1-BROWSER-TEST-2026-10-10.md).

Add a fixed-artifact atomic D1 activation executor and private recovery tooling. Hosted synthetic tests prove late-failure rollback, stale-data rejection, retry replay and preservation of new profiles, roles, enrolments, PIN resets, Course revocations and calendar changes through an exact 62-table restore. All 122 regression files pass. The temporary test controller is removed and the test application is paused. Main V106.0 remains on Sheets; browser acceptance and the final live transition review are pending. [Transition and new-write recovery](docs/ACADEMY-D1-TRANSITION-RECOVERY-2026-10-10.md).

Reduce D1 login/Home round trips from 24 to 10 while preserving current permission and revocation checks. A matched hosted test with five Programs, two Courses and 200 synthetic accounts passes every flow: p95 improves from 9.0 s to 4.5 s at 100 simultaneous learners and from 17.2 s to 7.9 s at 200. Fix explicit review of unknown Course policies; all 121 regression test files pass. The isolated test Worker is paused afterward. The main V106.0 application remains on Sheets; Module media subscriptions remain unbuilt and private media remains disabled. No main deployment, live switch or feature push occurred. [Peak comparison and limitations](docs/ACADEMY-D1-PEAK-2026-10-10.md) · [Earlier hosted workflow checks](docs/ACADEMY-D1-HOSTED-CORE-2026-10-10.md) · [Activation preparation](docs/ACADEMY-D1-CORE-ACTIVATION.md).

Record the owner's revised Library model: public Archive.org material, one shared private Academy media store, individual Module subscriptions and permanent account entitlements at completion. These subscriptions and lifetime grants are not implemented; prior Program-folder requirements are superseded. Existing per-Course access must not be inferred as Module media access. No runtime or live data changes accompany this clarification. [Agreed model](docs/ACADEMY-LIBRARY-ACCESS-MODEL.md).

Add atomic D1 account/profile, Program-role, registry, curriculum, class and enrolment management behind the isolated rehearsal mode. Apply the owner-approved Senior-to-Teacher and Admin-to-Program-Admin rules without changing original evidence or Global Admin grants. Preserve Student access.

Extend the rehearsal with timetable authoring/publication, assigned-teacher attendance, Library metadata and session-bound protected Drive/R2 files. Reuse publishing and attendance rules, bulk-save learners and lessons, preserve supplemental active-Program history, and keep the main cloud import unchanged. Device upload support requires the updated Apps Script bridge deployment and its explicit D1 flag.

Add Course run management, explicit/derived scheduling and publication, per-run paid-access protection and shared Academic Calendar administration/context. Import 48 active calendar records locally, excluding inactive events while preserving removed-holiday dates.

Add shared Academy subject creation/rename, Course/module/task authoring and the older account timetable. Keep subscription evidence unchanged, protect paid details and timed meeting links, and retain published history.

Add Course resource and Drive-folder administration, atomic batch saves and session-bound compatibility file access. Recheck containment and current subscription/authority on opening files. Preserve active Courses; only the Global Subject terminology is outdated. Drive verification uses local mocks in the runtime rehearsal.

Add paid Course subscription grant/revoke controls for Global Admins. Use explicit audited decisions over immutable imported evidence, recheck effective access on sessions/Home/timetables/files, disable Free toggles and update profile access displays. Extension 0007 adds no grants and preserves all 61 existing tables in the local candidate; Module/completion and admission rules remain separate.

Refresh the active-data candidate from a new read-only source capture. Only one last-login date changed. Base conversion passes all 1,680 source/Home comparisons, and application reads pass against the extended 62-table candidate. Verify a private readback backup and two local restorations of the unchanged 45-table main cloud import. Inventory existing public Open Library records/covers and record the remaining upload destinations and hosted/activation checks. Live routing remains Sheets. [10 October reconciliation and recovery check](docs/ACADEMY-D1-RECONCILIATION-2026-10-10.md).

Connect Open Library account and taxonomy checks to D1 while preserving its existing Durable Object book details and R2 covers. Restore current Program/Course For You references and request D1 server sign-out from the shared sidebar. No book import or new D1 table is required. [Route review, verification and remaining work](docs/ACADEMY-D1-ROUTE-AUDIT.md).

Validate scoped permissions, stale saves, rollback, replay, current file access and the existing frontend scripts. All 119 regression test files pass; the local Workers/D1 runtime passes 200 simultaneous login/home flows and 196 concurrent Library reads with zero external network requests. A private main-candidate copy preserves all four historical registers/21 marks and eight resources. Live Sheets routing remains unchanged. This work is not pushed or deployed. [Course subscription stage and pending work](docs/ACADEMY-D1-COURSE-SUBSCRIPTIONS.md) · [Course resource stage](docs/ACADEMY-D1-COURSE-RESOURCES.md) · [Terminology](docs/ACADEMY-TERMINOLOGY.md) · [Curriculum/account stage](docs/ACADEMY-D1-CURRICULUM-ACCOUNT.md) · [Course/calendar workflows](docs/ACADEMY-D1-COURSES-CALENDAR.md) · [Learning workflows](docs/ACADEMY-D1-LEARNING.md) · [Management stage](docs/ACADEMY-D1-MANAGEMENT.md).

---

# V106.0 — Academy D1 preparation and application integration

Prepare the main Academy D1 database and integrate an opt-in login/home rehearsal through the application's actual Worker entrypoint. The feature branch deploys both the website and the current development Worker. This release declares the main D1 binding for `devrebootworker`; it keeps `ACADEMY_D1_MODE` unset/OFF, so live authentication, reads and writes continue using Google Sheets. The production-named legacy Worker has no D1 binding.

Skip account-page Library and timetable requests immediately before returning to Academy home. D1 sessions support server-side sign-out when used in the isolated rehearsal. Retain the V105.4.3.17 navigation cache and timetable presentation, including its deliberate rollback of the earlier Sheets request-efficiency changes.

Add private source capture, validation, an active-data converter and the D1 schema. The separately completed main import contains 73 active accounts, five intended active Programs, two Global Courses and six publications with 68 timetable entries. It excludes the old Reboot workspace and inactive records; 20 legacy privileged assignments remain pending review. Source snapshots, credentials and database exports stay outside Git. [Main database report](docs/ACADEMY-MAIN-D1-PREPARATION.md) · [Migration tooling](docs/ACADEMY-MIGRATION-PREFLIGHT.md) · [Active import](docs/ACADEMY-ACTIVE-IMPORT.md).

Validation: 111/111 regression test files, 1,680 exact source comparisons and 200 simultaneous local synthetic login/home flows pass. Browser click-through remains unverified because the browser tool could not verify its required administrator security policy. These local results do not establish hosted capacity. [Application integration and remaining work](docs/ACADEMY-D1-WORKER-INTEGRATION.md) · [Earlier rehearsal](docs/ACADEMY-D1-FLOW-REHEARSAL.md).

**D1 is not the live website store.** Publishing this release does not import data, run database migrations or enable rehearsal mode. Complete the remaining workflows, authority/admission decisions, refreshed-source reconciliation and acceptance checks before a separate cutover. The candidate does not automatically synchronize later Sheets edits.

---

# V105.4.3.17 — Uniform timetable cards and cached Program navigation

Timetable cards have equal dimensions, a consistent shade for each Program and one shared shade for all Courses. Teacher participation uses a thick border on all four sides, including shared-room cards with teaching involvement. Keep next/in-progress indicators and authorised Join controls within the same card size.

Reuse authorised Program/Course page metadata and the integrated timetable in memory for up to one minute while switching activities. Recheck at joining/start/end boundaries, expiry, explicit refresh and browser-history restoration; clear the cache on account changes. Preserve browsed dates and avoid duplicate opening requests. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

---

# V105.4.3.16 — Compact timetable details and hidden timezone labels

Combined daily Zoom-room cards show their Program names and lesson count; all individual lesson times are inside the i popup. Single lessons keep their time. Remove visible timezone labels from the Academy website, connected new Program setup/timetable tools and timetable exports by default, retaining scheduling data, clock conversion and authorised joining windows. An explicit presentation option can include the timezone when requested. [Implementation, Reboot publication findings and verification](docs/ACADEMY-ENTRANCE.md).

---

# V105.4.3.15 — Roll back V105.4.3.14

At the user’s request, restore V105.4.3.13 application behaviour while retaining its compact daily Zoom-room timetable. Revert V105.4.3.14 request deduplication, quota cooldown, account error classification and request metrics. No spreadsheet records, credentials, subscriptions or attendance data are changed. Version markers and changed asset URLs use V105.4.3.15 so browsers load the rollback.

**106/106 regression test files passed.** Operational source was compared with V105.4.3.13 and matches apart from the current Worker version label. Google Sheets quotas may still prevent reads after rollback; recovery of live Program Management requires a signed-in acceptance check. The separate navigation-load investigation is not included in this rollback.

---

# V105.4.3.14 — Fewer Academy requests and clearer service errors

Remove duplicate opening calls and combine identical in-flight Academy requests. Pause retries for one minute after Sheets throttling, including partial timetable responses, and distinguish a busy account service from a wrong PIN while retaining saved sign-ins for retry. Stop immediate Sheets 429 retries and record private request-count and timing measurements for login and Academy data requests. [Behaviour, verification and remaining limits](docs/ACADEMY-REQUEST-EFFICIENCY.md).

# V105.4.3.13 — Compact timetable grouped by daily Zoom room

Show all seven dates in a compact, swipeable signed-in timetable. Combine classes sharing the same Zoom link into one card per day across subjects, times and Programs, retaining every lesson in its information popup. Display the Academy timezone once above the week, with no timezone text on cards. Preserve Global Admin Academy-wide access, other accounts’ personal scope and per-lesson timed joining. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.12 — Compact Program navigation and Academy-wide admin timetable

Use smaller, centred top-row Program pills and combine Courses into one Workshops pill opening the authorised chooser. Hide this row on the home page. Home Coming up uses the published Academy-wide timetable before and after sign-in. Global Admin sees the entire published Academy timetable on all Program/Course pages and in the full timetable, without enrolment or teaching assignments. Other personal timetables retain enrolled/assigned scope and all joining links retain the existing time window. Group Library display filters into All, PDF (eBooks and Printables), AudioVisual (Audio and Video), and Other while retaining stored resource types and permissions. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.11 — Shared Academy navigation and smoother browsing

Keep the side menu and a swipeable subscribed Program/Course top row across Academy pages and connected new Program tools. Strengthen and equalise activity pills. For You and Explore remain matching navigation pills for signed-in accounts in both Library views, with Personal Library resources arranged in subject columns. Coming up includes later dates with one item per activity per day. Personal timetables use the same swipeable day-column format while retaining every lesson, information and timed joining controls. Hide Classes and Subjects/Modules sections on student landing pages. The free workshop strip plays smoothly in a continuous loop; remove the marked catalogue labels and bottom pagination links while preserving individual course and public lesson links. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.10 — Personal timetable and Academy navigation

Every Program page now displays the same personal Academy timetable across enrolled Programs and Courses, with subscribed activity pills in one swipeable row beside the title. Highlight the next lesson and activate authorised joining links five minutes before start, removing them at the end. Use one Library menu item that opens For You after sign-in and the Public Library for visitors. Move Dua and Surah Progress and Voice Recorder to the student menu; remove Programs and Courses from the menu.

Student Program pages include Announcements, Calendar and Assignments. Teacher and admin actions follow existing permissions; assigned-class Library management, class preparation and unavailable administration integrations show Coming soon. Correct Program tool URLs to carry their actual Program context. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.9 — Library access in the menu

Remove the prominent Open Academy Library button from the signed-in home panel. Personal access is available through My Library in the menu after sign-in; the existing Library menu item continues to open the Public Library. Your activities sits directly below the welcome. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.8 — Personal activities and Workshops

Move Your activities into the signed-in My Academy panel beneath Library access, with each role below its activity name. Group the person's Courses under one Workshops pill, opening a chooser of authorised Courses while preserving their individual access and IDs. Coming up cards show the published time without a timezone; the full timetable retains timezones. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.7 — Public showcase headings and links

Remove all links from the swipeable current-offerings cards for now. Use **Explore our programs and courses** above that row and **Immerse yourself in these free workshops and courses** above the existing public catalogue. The enlarged announcements area and swipeable Coming up timetable remain. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.6 — Swipeable Academy home

Enlarge the public announcements area above Coming up, group upcoming lessons into swipeable date columns, and show Programs and Courses together in one swipeable artwork row. Public artwork cards open information on ummabbadacademy.com; personal activity pills retain authenticated tools. Remove the marked logo, sign-in badge, help paragraph and shortcut buttons while preserving Public Library navigation and the original-site link. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.5 — Academy home content

Rebuild the home with public announcements and inspiration, a top timetable showing one upcoming item per Program or Course, and the original artwork cards on the main page. Visitors see plain timetable entries and retain free material and Public Library access. The main Library menu always opens the Public Library; Timetable is removed from the menu. Use the Academy logo in navigation and behind the announcement/timetable cards, remove the marked catalogue prose, and preserve every original Academy-site URL. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

# V105.4.3.4 — Academy entrance

The Academy home now uses published new Program timetables and the shared Course curriculum, with account-based activity pills and protected lesson links. Reboot maps to the verified Pilot Program ID. Personal Library excludes legacy Reboot, Explore opens the public Library, and the original ummabbadacademy.com links remain. Unsupported features show Coming soon. Feature release for `feature/105.3.4.13`; deployment remains separate. [Implementation and verification](docs/ACADEMY-ENTRANCE.md).

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
