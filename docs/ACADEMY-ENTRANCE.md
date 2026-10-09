# Academy timetable and navigation · V105.4.3.17

All Coming up and personal timetable cards use a fixed 172px outer height with reserved status, name, summary and action rows. The compact seven-column week remains swipeable. Program colours come from a deterministic ordering of the complete Academy Program registry, independent of week, account participation and selected page. Every Course uses one shared shade. Rooms spanning different activities retain their activity names and combine their shades. A teacher or mixed-participation card has a 3px border on all four sides in its activity accent; participation does not replace the background. Single/grouped lessons, next/in-progress labels and joining controls retain the same card dimensions. The full timetable key explains the border.

The entrance response now includes already-projected metadata for authorised activity pages, without duplicating their individual timetables. The browser reuses that metadata and its shared personal timetable in memory for up to 60 seconds when switching Programs/Courses, retaining horizontal date position. This avoids another Sheets-backed entrance request for each navigation. It does not persist private snapshots in local/session storage or change private, no-store HTTP responses. Older backend responses without the new metadata fall back to the existing request path.

A snapshot expires at its one-minute limit, Academy date rollover or an intervening lesson join/start/end boundary. Home snapshots without joining URLs are rechecked if a lesson is already open. The existing timer still revalidates access at those boundaries and at least once per minute while an activity is visible. The new refresh button always asks the server. Sign-out/account changes clear snapshots and pending request state, with an epoch guard against late responses. Failures/incomplete responses are not cached. Identical in-flight requests share one fetch; the initial pageshow no longer duplicates the opening request, while browser-history restoration rechecks the account. Protected server scope and joining windows remain authoritative.

Focused regression checks cover colours across days, roles, grouped/single lessons, registry reordering and timetable views; shared Course shades; equal card slots and teacher borders; navigation request counts; cache expiry and lesson boundaries; explicit refresh; failure/warning handling; history restoration; account changes and late sign-out responses. Public visitors receive no private page-cache metadata. The native specification Page and checked-in specification are synchronized.

**106/106 regression test files passed.** JavaScript syntax, synchronized manifests/health/page versions, unique IDs and local assets across 13 HTML pages, changed asset URLs, all 47 original Academy-site link occurrences, unchanged historical notes and exact specification synchronization passed static checks. Browser visual and physical iPhone checks remain pending under the existing preview-tool limitation. Push target: `feature/105.3.4.13`. Website/Worker deployment is separate.

---

# Academy timetable · V105.4.3.16

Combined room cards now show the applicable Program names and a compact lesson count. All individual lesson times are in the single **i** popup alongside their subject, Module, Program, class/level and teacher details. Single-lesson cards retain their time. Smaller padding and the existing compact seven-date columns keep the week readable. Participation colours, next/in-progress highlighting and per-lesson joining windows remain.

Timezone labels are hidden by default across the Academy entrance, public/full/personal timetables, information popups, connected new Program setup and timetable previews, and their image/PDF exports. The presentation model retains the timezone and supports an explicit `showTimezone` option. Stored publication times, timezone data, chronological conversion and five-minute joining calculations are unchanged. The standalone legacy Reboot screens/data remain untouched.

The remote feature branch was reviewed and fast-forwarded through **V105.4.3.15**, preserving the other chat's rollback. The configured Development Worker reports V105.4.3.15. A read-only Drive inspection verified the Pilot registry/workbook identity and current immutable publication: Quran, Surahs, Duas, 99 Names, Fiqh, Aqaaid, History and Akhlaq use the same exact published link. The four Wednesday Hadith class entries have no published link, and the current class records have no default links. Shared-link entries already receive one request-local room identifier; missing links explain the remaining separate Hadith cards. No replacement link is inferred and no live spreadsheet/publication is changed. Hadith needs a confirmed published link before those entries can join the shared-room card.

Regression coverage includes split class rules with one shared link across successive subjects, protected room identifiers before joining opens, full and activity timetable rollups, compact cards with every time retained in i, different/missing rooms and dates remaining separate, hidden timezone labels, retained clock conversion/overnight handling and explicit timezone inclusion in timetable HTML/image exports. **106/106 regression test files passed.** JavaScript syntax, release manifests/health/page markers, changed asset cache URLs, unique IDs and local assets across 13 HTML pages, all 47 original Academy-site link occurrences and unchanged historical notes were verified. The native specification Page and checked-in specification are synchronized.

Push target: `feature/105.3.4.13`. Browser visual and physical iPhone checks remain pending under the previously recorded preview-tool limitation. This feature push does not deploy the website or Worker.

---

# V105.4.3.15 — Roll back V105.4.3.14

At the user’s request, restore V105.4.3.13 application behaviour while retaining its compact daily Zoom-room timetable. Revert V105.4.3.14 request deduplication, quota cooldown, account error classification and request metrics. No spreadsheet records, credentials, subscriptions or attendance data are changed. Version markers and changed asset URLs use V105.4.3.15 so browsers load the rollback.

**106/106 regression test files passed.** Operational source was compared with V105.4.3.13 and matches apart from the current Worker version label. Google Sheets quotas may still prevent reads after rollback; recovery of live Program Management requires a signed-in acceptance check. The separate navigation-load investigation is not included in this rollback.

---

# Academy request efficiency · V105.4.3.14

The Academy now avoids the extra initial `pageshow` requests and combines identical entrance requests while they are in flight. Sheets throttling receives a one-minute retry pause and a clear service-busy message; temporary account-service failures retain saved sign-ins without granting unverified access. Partial Program timetable failures retain available lessons and carry the same cooldown. Backend Sheets 429 responses return immediately instead of receiving three quick attempts. Login and Academy routes emit request-local counts and timings without account or spreadsheet details. [Implementation and measurement limits](ACADEMY-REQUEST-EFFICIENCY.md).

This release builds on the compact daily Zoom-room timetable below. It is prepared for the feature branch; deployment and live peak-load verification remain separate.

---

# Academy timetable · V105.4.3.13

Signed-in Program/Course timetables and the full integrated timetable now use compact seven-day columns, including dates without lessons. Wide views can show seven columns; smaller screens retain horizontal swiping and arrow controls. Published instants are converted to the Academy timezone, shown once above the week. Cards no longer repeat timezone text, and overnight ends remain clear.

Classes sharing the same Zoom link are combined into **one card per day**, across subjects, lesson times and Programs. Cards retain Program names and distinct time slots. One **i** popup lists every underlying lesson with its subject/Module, Program, time, level/class and teachers where available. Different rooms, missing links and different days stay separate. The next/in-progress lesson and student/teacher participation colours remain, including mixed participation.

The server supplies request-local room labels only with authorised lesson details, so grouping works before a lesson opens without exposing its Zoom URL. Each underlying lesson keeps its existing server-enforced five-minute joining window; the combined card is joinable only while at least one authorised lesson is open. Global Admin retains the complete Academy schedule; other accounts retain enrolled/assigned scope. The public home summary and visitor privacy remain unchanged.

**106/106 test files passed.** Focused checks cover grouping across subjects, times and Programs, separate rooms and dates, missing links, complete escaped popup details and title, all seven dates, timezone conversion and overnight ends, joining across later room lessons and closed windows, Global Admin access, public metadata redaction and revoked accounts. Static checks verify synchronized release markers, JavaScript syntax, 13 pages' unique IDs and local asset references, unchanged original-site links and historical notes, and exact specification synchronization.

The unfinished work in **Master Development** was reviewed. Its compact timetable draft grouped by subject and omitted grouped popup titles; this release reuses its compact layout with the requested room/day grouping and complete dialog data. Its separate login/service-throttling fixes passed their three focused test files and remain in that checkout. The older entrance and Library drafts were not copied over the newer timetable, access or attendance implementation.

Push target: `feature/105.3.4.13`. Browser visual and physical iPhone checks remain pending because the preview tool could not verify the administrator-enforced browser policy. No website/Worker deployment or live-data changes are included. Legacy Reboot and the other chats' unfinished files remain untouched.

---

# Academy home · V105.4.3.12

The subscribed top row uses smaller, uniform Program pills with centred names and roles beneath. Courses are combined into one **Workshops** pill opening the existing authorised Course chooser. Actual Program and Course IDs, memberships and permissions remain unchanged. The top row is hidden on the home page, which retains its My Academy activity panel.

Home **Coming up** now uses the published Academy-wide timetable before and after sign-in. Previously, signing in switched this summary to the personal timetable; an account with Global Admin oversight but no enrolled or assigned lessons therefore saw an empty summary. **Global Admin now sees the entire published Academy timetable on every Program/Course page and in the full timetable, without enrolment or a teaching assignment.** Other accounts retain their integrated enrolled/assigned timetable. Global Admin receives lesson details and authorised joining URLs within the same five-minutes-before-start to end window, without being labelled as a learner or assigned teacher. Cancelled lessons and expired accounts remain excluded. Empty personal timetables now say that no lessons are scheduled for that person.

A read-only request to the configured development entrance service returned **53 published lessons for 9–15 October 2026**, with no warnings, confirming that the empty home summary was not caused by missing published lessons. No live data was changed.

Both Library views now display **All**, **PDF**, **AudioVisual** and **Other** filter pills. PDF includes eBooks and Printables; AudioVisual includes Audio and Video. The change is for Library display only: stored resource types, resource formats, editing controls and access permissions remain intact.

**106/106 test files passed on the final implementation.** Affected checks cover home visibility, the combined Workshops chooser and actual access, published home events, complete Global Admin schedules across activity pages, Program/Course joining boundaries, cancellation and session revocation, both Library filter mappings, retained media previews and unchanged For You entitlements. JavaScript syntax, unique HTML IDs and local script/style targets across 13 pages, synchronized release markers, historical release notes and all original Academy-site URLs pass static checks. The native specification Page and checked-in specification are synchronized.

Push target: `feature/105.3.4.13`. Browser visual and physical iPhone checks remain pending because the preview tool could not verify the administrator-enforced browser policy. This feature push does not deploy the website or Worker. Legacy Reboot screens/data and the other chat's unfinished checkout remain untouched.

---

# Academy home · V105.4.3.11

The Academy side menu and the signed-in person's subscribed Program/Course row are available across Academy views, both Library pages and connected new Program setup, management, timetable, attendance, Library and user tools. The recorder receives this navigation only through its Academy entry point. Top-row pills retain actual authorised IDs, place roles beneath names and mark the current Program where applicable. Home activity pills have equal dimensions and a stronger plum background. Compact navigation stays visible on smaller screens. Failed account validation keeps public navigation available; sign-out and token changes clear private activity names and prevent delayed responses from restoring them.

**Coming up** now includes future date columns within the upcoming seven-day window, with one next lesson per Program or Course **per day**. Personal integrated timetables use the same swipeable day-column format, retaining every personal lesson, lesson and activity labels, timezones, information popups, next-lesson highlighting and the existing server-enforced joining window. Student Program and Course pages omit the Classes and Subjects/Modules sections; authorised staff retain their available teaching sections.

The free workshop catalogue uses frame-based continuous playback and a seamless end-to-start loop. Manual controls, keyboard and touch browsing remain, with motion paused for hover, focus, hidden/background pages and offscreen content. Reduced-motion users get direct manual navigation and spaced poster changes only after choosing Play. The marked Catalogue page label and four bottom pagination links are removed; the 35 original artwork cards, numbered controls, individual course and public lesson links remain.

Both Library views retain matching **For You** and **Explore** pills for validated signed-in accounts of every role. Explore stays public without sign-in. Personal Library resources use the same subject-column arrangement as the Public Library, stacking cards vertically and retaining source/Module labels, category/search/source filtering and existing access checks. For You remains Academy-wide without a current Program filter.

**106/106 test files passed on the final implementation.** Tests cover the continuous loop, manual controls, reduced motion, hover/background/offscreen pauses, public destinations, all-role Library navigation, actual activity IDs, delayed-response sign-out, personal day columns without lesson loss, student/staff section visibility and existing timetable joining boundaries. Static checks pass for unique IDs and local script/style targets across 13 pages, JavaScript syntax, synchronized release markers and all 42 remaining original Academy-site URLs. Only the four specifically marked catalogue pagination links were removed. The native specification Page and checked-in specification are synchronized.

Push target: `feature/105.3.4.13`. Browser visual and physical iPhone checks remain pending because the preview tool could not verify the administrator-enforced browser policy. This feature push does not deploy the website or Worker. Legacy Reboot screens/data and the other chat's unfinished checkout remain untouched.

---

# Academy home · V105.4.3.10

Every Program and Course landing page now shows the same **personal integrated Academy timetable**, including the account’s enrolled or assigned lessons across the new Program framework and shared Courses. Unassigned lessons and cancelled occurrences are excluded. Global administrative oversight alone does not make lessons personal. Subscribed Programs and Courses appear in one horizontally swipeable row beside the activity title, with roles below names and the current activity marked. The home still groups Courses under Workshops.

The next personal lesson is highlighted; an ongoing lesson is marked In progress. The website’s server response releases authorised joining URLs from exactly five minutes before start until the lesson ends. The visible activity page refreshes at timing boundaries and revalidates access at least once a minute while visible; background pages stop refreshing and revalidate on return. Local clock conversion orders published lessons across timezones and handles overnight ends. The shared/legacy timetable gate is unchanged. Activity timetables open at the current seven-day window independently of dates browsed on the full timetable screen.

The main menu has one **Library** item: signed-in accounts open **For You** across all authorised Academy resources, and visitors open the Public Library. Program pages keep their Library entry; Explore remains public and independent of membership. The duplicate My Library item is removed. **Dua and Surah Progress** and **Voice Recorder** are student menu items; **Programs and Courses** is removed from the menu while the public artwork row remains.

Students see Announcements, Calendar and Assignments on Program pages. Teachers and administrators additionally have Make announcement, Mark attendance, Assignments, Library management and Class preparation. Existing new Program attendance is connected using the screen’s actual `program` URL parameter. Assigned-level/class Library editing and preparation remain **Coming soon** because the current editor is wider than the agreed scope. Program Admin management, User management and Calendar management remain Coming soon where their role-specific integration is unsupported. Existing Global Admin management, users, timetable builder and Program Library screens retain their established authority. Universal progress remains Coming soon. No role migration or legacy Reboot changes are included.

**104/104 backend test files passed on the final implementation.** Coverage includes multiple enrolled Programs and Courses, identical timetables when switching pages, actual chronological ordering, assigned teaching versus oversight, five-minute and end boundaries for Program and Course links, cancelled and revoked access, empty personal timetables, delayed-response sign-out, menu visibility, scoped staff placeholders and Academy-wide For You without a Program filter. Static checks pass for synchronized release markers, JavaScript syntax, unique IDs, script targets and all **46 original Academy-site URLs**. The native specification Page and checked-in specification are synchronized.

Overlapping unfinished changes were reviewed in the original entrance checkout and left intact. This release uses the separate `feature/academy-library-spec` checkout based on the last verified feature commit, combining the requested behaviour without including wider Library-editor links or a duplicate My Library menu.

Push target: `feature/105.3.4.13`. Browser visual and physical iPhone checks remain pending because the preview tool could not verify the administrator-enforced browser policy. This feature push does not deploy the website or Worker.

---

# Academy home · V105.4.3.9

The signed-in home panel no longer displays the prominent **Open Academy Library** button. **Your activities** sits directly beneath the welcome. Personal resources are reached through **My Library** in the main menu, revealed only after successful sign-in or session validation and hidden again on sign-out, an expired session or an account change. The existing **Library** menu item continues to open the Public Library before and after sign-in.

**104/104 backend test files passed.** Login/session fixtures cover personal-menu visibility for visitors, new logins, restored sessions, new tabs, sign-out and rejected accounts. Static checks confirm menu placement, hidden initial markup, unique IDs, script targets, synchronized release markers and all 46 original Academy-site URLs. The specification Page and checked-in specification are synchronized.

Push target: `feature/105.3.4.13`. Browser visual and physical iPhone checks remain pending under the previously recorded preview-tool limitation.

---

# Academy home · V105.4.3.8

**Your activities** now sits inside the signed-in **My Academy** panel, beneath personal Library access. Each pill places its role below its name. The former full-width personal section is removed.

Programs retain separate pills. All authorised Courses, including Barakah and Salaah, share one **Workshops** home pill. It opens a chooser containing only Courses returned in the account's personal access, with each Course's own name, role and underlying ID. The grouping does not merge memberships or permissions. Accounts without Course access have no Workshops pill, visitors receive a sign-in message, and sign-out clears the chooser and pending protected responses. Course pages return to Workshops; Program pages return to My Academy.

**Coming up** cards display the published time without a timezone. The separate full Academy timetable and activity timetables retain their timezone labels and timezone-aware scheduling calculations.

**104/104 backend test files passed.** The entrance regression covers students, Global Admins, mixed Course roles, the authorised chooser, accounts without Courses, sign-out, hidden preview timezones and retained full-timetable timezones. JavaScript syntax, HTML section nesting, unique IDs, script targets, assets, release markers and all 46 original Academy-site URLs pass static checks. The specification Page and checked-in specification are synchronized.

Push target: `feature/105.3.4.13`. Browser visual and physical iPhone checks remain pending under the previously recorded preview-tool limitation.

---

# Academy home · V105.4.3.7

The current-offerings artwork row is headed **Explore our programs and courses**. Its six cards remain in one swipeable row and contain no image, title or action links, following the latest request. This supersedes the V105.4.3.6 public card destinations. Personal activity pills retain the existing authenticated framework integration.

The existing public catalogue is now headed **Immerse yourself in these free workshops and courses**. All 46 original Academy-site URLs in the existing page are preserved. The enlarged public announcements area and swipeable Coming up timetable remain.

The navigation and background logo use `/ummabbadacademy.png`, which is byte-identical to the Academy logo copy and avoids the `/academy/:uniqueid` account-link redirect pattern.

**104/104 backend test files passed** for this release; affected entrance checks also pass after the logo-path correction.

Push target: `feature/105.3.4.13`. The entrance regression asserts that public artwork cards have no anchors or hrefs, while both swipe controls and personal activity tools still work. Browser visual/iPhone checks remain pending under the previously recorded preview-tool limitation.

---

# Academy home · V105.4.3.6

Follow-up to V105.4.3.5. Push target: `feature/105.3.4.13`.

## Layout and navigation

- Enlarge the public announcements area above **Coming up**. Its Academy-logo background and public-only content scope remain. Publishing stays **Coming soon** until a public source is connected.
- **Coming up** groups the next published item per Program or Course into horizontally swipeable date columns, with compact activity cards, published times and timezones. Touch scrolling, keyboard focus and previous/next buttons are available. Visitor entries remain plain text; authenticated information and activity access keep their existing checks.
- Programs and Courses share one swipeable artwork row. Its cards link only to information on the original Academy website. These public cards remain available independently of account/timetable responses and contain no personal roles. Signed-in activity pills separately retain current framework IDs and tools, including the verified Reboot Pilot.
- The original site's public page list and homepage content were checked read-only. Mothers of the Ummah uses its existing `#mu` section. The other featured cards use the existing Academy information homepage because no dedicated Program information URLs are listed. No slugs were invented or unrelated course pages substituted.
- Remove the small duplicate logo above the Academy title, the Academy account badge, the explanatory sign-in paragraph and the three shortcut buttons below sign-in. Label the existing four-digit field **PIN**; authentication and PIN setup behaviour are unchanged. Keep the original-site link, Public Library menu and signed-in personal Library access.

## Verification

- **104/104 backend test files passed** for V105.4.3.6. Static checks confirm all 46 existing Academy-site URLs, original artwork files, unique HTML IDs, script targets and release markers; `git diff --check` and JavaScript syntax checks pass.
- Entrance fixtures cover grouping by date, one next item per activity, both strips' previous/next buttons, public external-only artwork links, plain visitor timetable entries, protected activity tools and delayed-response sign-out.
- Browser visual/iPhone checks remain pending because the desktop browser preview could not verify its administrator-enforced policy. No alternative browser control was used.
- The current specification is saved in [ACADEMY-WEBSITE-SPECIFICATION.md](ACADEMY-WEBSITE-SPECIFICATION.md) and the existing specification Page.

---

# Academy home · V105.4.3.5

Follow-up to V105.4.3.4 on `feature/academy-entrance`. Push target: `feature/105.3.4.13`. No deployment, production change, migration or spreadsheet write is part of this update.

## Home content and navigation

- The top area pairs public announcements/inspiration and the shortened Academy timetable with Academy identity and sign-in. Announcements remain **Coming soon** until a public publishing source exists; no private messages or personal details appear in this public area.
- The timetable shows only the next scheduled item per Program or Course within the next seven days, excluding ended/cancelled items and repeated Course offerings. Visitors see plain text without timetable/activity/info/join links. Signed-in users can open the separate full timetable and its date controls from the summary; browsing those dates does not replace the current home summary.
- Programs and Courses are on the main page with the original artwork. Matching current framework records supply activity URLs and actual IDs. Unavailable or ambiguous matches show **Coming soon** with the original-site link; no demo membership or legacy fallback is used.
- The main menu Library link always opens `/academy/open-library/`, including after sign-in. Personal Library remains separately accessible. Free material and public lessons remain accessible to visitors. Timetable is absent from the menu.
- The Academy logo uses an absolute asset path in navigation and the identity panel, and appears behind the public announcement/timetable cards. Existing lavender/plum styling remains.
- The marked catalogue eyebrow, introductory paragraph and explanatory source sentence are removed. The heading, artwork, controls, catalogue-page links and all **46** distinct original Academy-site URLs are preserved.

## Follow-up verification

- **104/104 backend test files passed** for V105.4.3.5. Release manifests and health/page markers agree; JavaScript syntax and `git diff --check` pass. All static asset references exist, HTML IDs are unique, and all 46 original Academy-site URLs remain.
- Automated entrance and login checks cover the one-per-activity summary, past/cancelled exclusion, plain visitor entries, home artwork cards, home section navigation, the independent full timetable, public Library navigation before/after sign-in and delayed-response sign-out.
- Browser visual/mobile verification remains pending: the desktop browser tool previously refused the preview because its administrator-enforced policy could not be verified. No alternative browser control was used. Real Development-account journeys and physical iPhone Safari microphone/video/sharing checks remain pending.
- The updated scope is saved in [ACADEMY-WEBSITE-SPECIFICATION.md](ACADEMY-WEBSITE-SPECIFICATION.md) and the existing specification Page.

---

# Academy entrance · V105.4.3.4

Prepared locally on `feature/academy-entrance` from `origin/feature/105.3.4.13` at `11ab81d` (V105.4.3.3). Push target: `feature/105.3.4.13`. No deployment, production change, migration or spreadsheet write was performed. The older Library worktree and its attendance changes were left alone.

## Connected features

- `/academy/`: original lavender/plum branding, introduction, Prospectus, About, Contact and historical course catalogue. All **46** distinct existing `ummabbadacademy.com` links remain.
- Reboot resolves to **PRG-46c8576d-9fcf-4000-96b9-856b00a0218a**. This was verified read-only against Development CourseRegistry and the Pilot workbook's ProgramIdentity. Display name: **Reboot**. Other new Programs use the same integration.
- New read-only `POST /api/academy/entrance`: anonymous schedule labels; authenticated activity roles, curriculum, classes and contextual tools. It loads only new Program records, verifies the mapped workbook identity, uses immutable publications and excludes legacy Reboot. Public responses omit joining URLs, teacher/class information and learner identities.
- Home timetable: seven-day navigation, colour for enrolled learners and assigned teachers, supplementary-information dialog for authorised users. Joining links appear on the activity page for current authorised lessons, using the published timezone.
- Existing shared curriculum: stable GlobalSubject IDs are displayed as **Courses**, with their Modules and published offerings. Existing FREE/PAID and subscription checks remain authoritative; the display rename does not migrate the schema or role matrix.
- Academy account ID/PIN authentication, server-validated session reuse across tabs, signed-in name, hidden credentials form and Sign out. Session changes invalidate pending personal requests and clear protected content.
- Program tools: attendance and resources for authorised staff; management and timetable builder only where the existing Global Admin service permits them. Links carry the actual Program ID. Connected tools include a route back to Academy home.
- Personal Library opens **For You** across authorised new Programs and Courses. Verified Program staff can browse new Program teaching resources; editing still uses the existing Program-specific authorisation. Shared Resources folder permissions are unchanged. Legacy sources and legacy membership references are excluded from this Academy collector; legacy operational Library endpoints remain unchanged.
- Explore opens the independent Public Library. Both Academy Library views use **eBooks, Printables, Audio, Video, Other**. Server checks still protect catalogue/file access.
- Student-only Academy recorder link to the existing standalone recorder and lesson-image manifest. It records voice over an existing image, previews video and uses its supported sharing controls. It does not load legacy Reboot learner/progress data.

## Coming soon and dependencies

Public/activity announcements, assignments, lesson preparation, integrated Program progress, universal Dua and Surah Progress, and Module subscriptions/permanent completion entitlements show **Coming soon**. No simulated submissions or legacy progress fallback were added.

HOD management/timetable publication remains **Coming soon** where existing services are Global Admin only. Senior/Admin conversion, student admissions/class-assignment authority changes, and the unified Course role-matrix migration require separate implementation. Existing Course teacher involvement comes from published assignments; no new Course entitlement rules were introduced.

Before release, confirm the Pilot registry/workbook identity in the target environment. This change requires the new Worker route and frontend to be released together. Localhost currently selects the Development Worker in the existing configuration, so a static local server alone cannot exercise the new undeployed route.

## Verification

- **104/104 backend test files passed**, including the new entrance model, Worker integration and interface tests. The affected Library integration test also passed after the final legacy-role isolation check.
- Coverage includes visitors, students, teachers, HODs, Global Admins, mixed Program roles, expired/revoked membership, public redaction, immutable published schedules, current lesson joins, contextual tool URLs, input bounds, Library entitlement checks and legacy isolation.
- Interface checks cover account/session restoration, the information dialog, escaped labels, recorder visibility and sign-out while a personal request is pending.
- Static checks: all referenced DOM IDs exist, all original Academy-site links remain, release markers agree and `git diff --check` passes. The labelled local QA server returned HTTP 200; it was stopped after verification.
- Browser visual/mobile verification is **pending**. The desktop browser tool could not verify its administrator-enforced policy and refused the preview. No alternative browser control was used. Real Development-account journeys and physical iPhone Safari microphone/video/sharing tests are also pending; automated fixtures are not a substitute for those checks.

The approved scope is retained in [ACADEMY-WEBSITE-SPECIFICATION.md](ACADEMY-WEBSITE-SPECIFICATION.md).
