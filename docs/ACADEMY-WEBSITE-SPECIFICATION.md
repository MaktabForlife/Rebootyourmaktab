## Objective

Update the existing Academy demo into a usable Academy entrance. Connect existing functionality where it supports the agreed behaviour. Show **Coming soon** for unavailable features or integrations.

Preserve the Academy branding, soft lavender and plum design. Use the Academy logo in the navigation and as a subtle background behind the public announcements and upcoming timetable. Do not repeat the small logo above the Academy title beside sign-in. Make the website work comfortably on phones and computers. Keep the Academy side menu visible on every Academy page and connected new Program tool, including both Library views. On smaller screens keep the same navigation visible in a compact horizontal layout. Preserve the standalone recorder’s existing interface outside its Academy entry point and leave legacy Reboot untouched.

### Program framework and Reboot

The **new Program framework** is the basis for Reboot and the other Academy Programs.

The website displays the new **Reboot Pilot Program** as **Reboot**. Its activity pill and landing page must connect to Program ID `PRG-46c8576d-9fcf-4000-96b9-856b00a0218a`, verified against the Development Academy registry and the Pilot’s ProgramIdentity record. Verify the matching new Program record in each target environment before release; do not invent an ID, use a demo ID, or identify the Program solely by its display name.

Use that Program ID consistently for Reboot’s new Program timetable, Library, classes, participant access and available teaching tools.

Exclude legacy Reboot screens and data from website integration. Do not link to them, read their records as website data, or use them as a fallback for missing new Program functionality.

Where the new Program framework lacks a required feature or integration, display **Coming soon**, including universal student progress integration.

Leave legacy Reboot untouched. This website work does not authorise changes to legacy screens, services, permissions or records, or migration of legacy data.

## Development boundaries

- Work in the existing repository, using a feature worktree based on the latest agreed development code.

- Check the current branch, version and outstanding changes before editing. An older Library worktree contains overlapping attendance work.

- Do not push, deploy, merge into main or development, or change production without express permission.

- Reuse existing Academy account services, the new Program framework’s timetable, Library, class and teaching services, and the existing shared curriculum services for Courses where they support the agreed behaviour.

- Leave legacy Reboot screens, services and records untouched and outside the website integration.

- Do not implement new subscription rules, migrate roles or migrate learner records as an incidental website change. Identify these dependencies explicitly.

## 1. Academy home

The main entrance remains `/academy/`, with the home view at `/academy/#overview`.

The home answers:

- What is happening across the Academy?

- Where am I personally involved?

Include:

- Academy introduction and general information.

- A larger public announcements area above Coming up, for general announcements, motivational posts and Academy updates. This open area must not show personal information or private messaging.

- Academy timetable.

- Current offerings appear under **Explore our programs and courses**, together in one horizontally swipeable row on the main page, using their original Academy artwork. These public cards have no links for now.

- Prospectus, About and Contact information.

- Sign-in controls when signed out, with Account ID and PIN labels. Omit the Academy account badge and the explanatory paragraph below the submit button. Remove the three shortcut buttons beneath sign-in while keeping the original Academy-site link. Library is available through the main navigation; remove Programs and Courses from that menu while retaining the public artwork row on the home page.

- Personal activity pills and Sign out when signed in.

The public artwork row is display-only for now. Do not put links on its images, names or actions, either to ummabbadacademy.com or to internal Academy activity pages. Keep the row swipeable and retain its original artwork.

The free workshop and course catalogue is headed **Immerse yourself in these free workshops and courses**. Play moves the artwork strip smoothly in a continuous loop without a long rewind at the end. Retain Play/Pause, previous/next and the numbered controls, plus touch and keyboard browsing. Pause motion while a poster is hovered or focused and when the page or strip is not visible. Respect reduced-motion preferences with direct manual changes and discrete, spaced poster changes after explicit Play.

Personal activity pills separately open the signed-in person’s actual new Program and Course records, with their existing permissions and tools. The public showcase must not depend on personal membership or availability of the account/timetable service.

Remove obsolete demo instructions, connection-plan content and sample completion controls from the ordinary user experience.

### Academy timetable

On the main page, display the shortened Academy timetable as **Coming up**, beneath the enlarged announcements area. Group entries into horizontally swipeable date columns, including future dates within the next seven days. Show one next published item **per Program or Course per day**, so a later day is not removed because that activity also occurs earlier. Display Program or Course names as compact cards with their published time. Omit the timezone from these Coming up cards; keep it in the full timetable. Provide arrow buttons and keyboard access as well as touch scrolling. Exclude ended and cancelled items, and combine Course offerings under their Course for each date. This home summary always uses the published Academy-wide timetable, before and after sign-in. Do not replace it with the signed-in person’s enrolled/assigned lessons; this summary is independent of enrolment and teaching assignments.

On Program/Course pages and the full personal timetable view, signed-in users see their **personal integrated Academy timetable**, combining their enrolled and assigned lessons across the Academy. Display the same personal timetable on every Program page and retain it when switching Programs or Courses. **Global Admin sees the entire published Academy timetable**, across every Program and Course, on all Program pages and in the full timetable view. Global Admin does not require enrolment or a teaching assignment. Other staff and Program Admin roles remain limited to their enrolled or assigned lessons in the personal timetable. The full timetable remains accessible from the signed-in Coming up summary. Do not include Timetable in the main menu. Highlight participation using **colour**, supported by a simple colour key in the full timetable. Use compact, horizontally swipeable date columns for the signed-in timetable, including all seven consecutive dates and days without lessons. Fit seven columns across a sufficiently wide screen, with swiping and arrows on smaller screens. Combine all authorised lessons using the same Zoom link into one card **for each day**, even when they have different subjects, times or Programs. Show the applicable Programs and lesson times on the card. Its single **i** popup lists every individual lesson’s subject, Module, Program, time, level/class and teacher details where available. Different Zoom links and lessons without a link remain separate; do not combine different days. Preserve every authorised lesson, participation colours, next/in-progress highlighting and per-lesson joining windows. Omit timezone text from the cards; convert published instants to the Academy timezone and display it once above the week. Do not change stored publication times or timezone data.

Do not add “My class” or “Teaching” labels to highlight involvement.

Visitors see public timetable entries as plain text, with no timetable, activity, information or joining links. Visitors retain access to free material, the Public Library and original Academy-site links.

For signed-in authorised users, an **i** icon opens supplementary information, such as multiple teachers or the classes included in a combined lesson. It must work on tap and click.

Joining links and protected lesson details are accessed through signed-in activity pages. Highlight the next personal lesson, or the current lesson while it is in progress. Activate its authorised joining link **five minutes before the published start**, and remove it when the lesson ends. Enforce the opening window, current membership and publication status on the server, and refresh the visible timetable as these boundaries pass. Combine timezones by actual start instants. Signed-in week views display times in the Academy timezone, named once above the week, with no timezone text inside cards. Preserve source timezones in the data and published timezone labels in the public full timetable. Room grouping must not expose a joining URL before its authorised window.

Reuse the existing Academy timetable service where appropriate. Verify that it consumes the new V105 Program publications, including the Reboot Pilot’s timetable identified by its actual Program ID, as well as published schedules for Courses and their scheduled offerings from the existing shared curriculum.

Exclude legacy Reboot schedules from the website’s timetable response and display. If a shared service also serves legacy Reboot, enforce this selection at the website integration boundary without changing legacy Reboot.

The existing timetable endpoint requires sign-in. Public timetable information needs an explicitly public response that excludes protected details.

If a required timetable source or new Program integration is unavailable, show its availability state or **Coming soon**, as appropriate. Do not substitute invented lessons or legacy Reboot lessons.

## 2. Sign-in and session behaviour

Use the existing Academy account ID and PIN.

- Accept the account ID itself.

- Do not display a real account ID as an example.

- After successful sign-in, remain on the Academy home.

- Hide the ID and PIN form while the account is signed in.

- Show the person’s name and Sign out.

- Reuse the session across Academy pages and existing connected tools.

- Sign out must remove the session and personal content from view.

- Distinguish temporary service failures from an invalid ID or PIN.

- Never open an administrator account without valid authentication.

Returning from a tool should provide a clear route back to the Academy home or relevant activity.

## 3. Personal activity pills

In the signed-in **My Academy** panel, show **Your activities** as uniform-size pills directly beneath the welcome. Use a stronger plum colour to make the activities stand out, and display the role beneath each activity name. Access personal Library through the menu rather than a prominent home-panel button. Visitors must not see this personal section.

Populate activity pills from actual account access, including authorised access to the existing shared curriculum displayed as Courses. Show each Program separately. Group all Courses, including Barakah and Salaah, into one **Workshops** home pill. This opens a chooser containing only the person’s authorised Courses, with the individual role beneath each Course name. Bind each chooser entry to its actual underlying curriculum ID and any required offering context. Hide the Workshops pill when no Course access is assigned; clear the chooser on sign-out. Do not use the demo’s fixed list as personal membership data.

Display the new Reboot Pilot Program pill as **Reboot** and bind it to the Pilot’s verified Program ID. Determine membership and roles from that Program’s current access records. Legacy Reboot membership must not be used to infer access to the new Program.

A person can hold different roles in different Programs and Courses. Preserve the existing scope of each role and entitlement. **Workshops** is a home navigation grouping only; it does not merge memberships, permissions or underlying Course records.

Place the universal student activities **Dua and Surah Progress** and **Voice Recorder** in the Academy menu for signed-in students. Do not repeat them among the home Program and Course activity pills. Hide these menu items for visitors and accounts without student access, and clear them on sign-out. Show **Coming soon** when a required integration is unavailable.

Provide:

- **Manage Program** within Programs where the person is an authorised HOD.

- **Academy administration** for Global Admins.

Preserve established underlying permissions. A newly displayed role name must not silently grant additional authority.

## 4. Program and Course pages

Use these learning structures:

- **Programs:** Subjects → Modules → scheduled lessons.

- **Courses:** The existing shared curriculum, organised into Modules, with linked scheduled lessons and offerings such as workshops, bootcamps and presentations where supported.

Each activity opens an appropriate landing page containing its available tools. Display the person’s subscribed Programs and a combined **Workshops** pill in **one horizontally swipeable top row on Academy pages other than the home page**, including both Library views and connected new Program tools. Keep the top pills compact and uniform, centre their text, and place roles beneath names. Show each Program separately and combine all authorised Courses into one Workshops pill, opening the existing authorised Course chooser with its actual underlying IDs and roles. Highlight the current Program, or Workshops when viewing a Course or the chooser. Populate this row from actual authorised account access. Do not repeat this row on the home page; retain the existing My Academy activity panel there. Students see their **personal integrated Academy timetable**, **Announcements**, **Calendar** and **Assignments** on every Program page, with **Library** in its menu. The timetable includes their enrolled or assigned lessons across all new Programs and Courses, rather than filtering to the displayed Program. Show **Coming soon** for announcements, calendar or assignments while their new Program integrations are unavailable. Omit the Classes and Subjects/Modules sections from student Program and Course pages. Authorised teaching and administration roles retain the available teaching sections.

Reboot’s lessons within the personal integrated Academy timetable come from the new Pilot Program’s published timetable. Its Library resources, classes and available teaching tools use that same new Program and actual Program ID. Apply the same integration pattern to other Academy Programs; the timetable remains Academy-wide for the signed-in person when switching activity pages.

### Courses and shared curriculum

Incorporate the existing **global subjects curriculum** into the Academy website. Display **Global Subject** as **Course** and **Global Subjects** as **Courses** throughout the website’s navigation, headings, pills, selectors, timetable details and Library labels. Subjects within Programs remain **Subjects**.

Reuse the existing curriculum, Modules, tasks, resources and authorised tools. Retain their underlying IDs, records, relationships and access rules; this is a display terminology change, not a backend schema rename or data migration.

Keep scheduled offerings linked to their underlying curriculum, preserving each offering’s actual ID, dates, publication and access context. Do not duplicate curriculum records or merge distinct entitlements because both are presented under Courses.

Course landing pages expose the available curriculum, timetable, Library and tools for the person’s authorised scope. Show **Coming soon** for unavailable functions or integrations. Do not display the curriculum or Module sections on student landing pages; authorised staff retain the available curriculum view.

| Feature | Intended availability |
|---|---|
| Integrated Academy timetable and authorised lesson links | Global Admin: entire published Academy timetable. Other accounts: enrolled or assigned lessons. Same timetable on every Program page; existing timed joining applies. |
| Library | For You across the Academy, without automatic Program filtering; Explore remains public |
| Announcements and Calendar | Learners and responsible staff |
| Assignments | Learners; authorised staff create and manage assignments |
| Make announcement | Teachers and authorised administrators |
| Mark attendance | Teachers and authorised administrators |
| Library management | Teachers and administrators within their assigned teaching levels/classes |
| Class preparation | Teachers and administrators within their assigned teaching levels/classes |
| Program management | Program Admin; existing backend permissions still apply |
| User management | Program Admin within their authorised Program; existing backend permissions still apply |
| Calendar management | Program Admin within their authorised Program |
| Program-specific progress | Where supported by the new Program framework |

Display **Coming soon** for unavailable functions or role-specific integrations. Existing Global Admin tools retain their actual authorised scope.

Class preparation and Library editing/management for Teachers and Program Admins are restricted to **their assigned teaching levels/classes**. Do not substitute a wider Program editor or allow access to other classes’ preparation because they are in the same Program. Keep the integration **Coming soon** until this scope is enforced by the supporting service. Preserve Global Admin’s established Academy-wide authority.

Use existing working screens in the new Program framework where possible. Mark unsupported functions or role-specific integrations **Coming soon**. Do not replace a missing function with a legacy Reboot screen or data source.

## 5. Roles and administration

| Role | Meaning |
|---|---|
| Visitor | No role in the Program being viewed, whether signed in or signed out |
| Student | Learner in the relevant Program |
| Teacher | Responsible for assigned teaching |
| Program Admin | HOD responsible for the assigned Program |
| Global Admin | Academy-wide authority |

Senior and Program Admin are to be combined in the intended model. Existing assignments and permissions require review before conversion.

Global Admin admits new students. Program Admin assigns admitted students to classes within their Program.

For Reboot, class assignment and staff responsibilities refer to the new Pilot Program’s classes and access records. Do not convert legacy Reboot roles or learner records as part of this website work.

Program Admin additionally has **Program management**, **User management** and **Calendar management** within their authorised Program. The intended HOD remit includes timetable publication and oversight of teaching, attendance, progress and resources. Where current services only allow Global Admin access or do not enforce the required scope, show **Coming soon** rather than bypassing that restriction.

## 6. Library

The main Academy menu has one **Library** item. For a signed-in Academy account it opens the Personal Library at `/academy/library/`, on **For You** by default across all authorised Academy resources. Visitors use this menu item to reach the Public Library at `/academy/open-library/`. **Explore** opens that same Public Library independently of Program or Course membership, without sign-in. Do not display a separate My Library menu item or a prominent Library button in the signed-in home panel.

**Library** is a menu item on each Program page. Course pages retain the same Academy-wide Library entry where available.

It opens **For You** by default, without automatically filtering to the current Program or Course. Display **For You** and **Explore** as matching navigation pills. Both remain available in the Personal and Public Library for all validated signed-in Academy accounts, regardless of role, so users can move between the views. Indicate the selected view. Visitors retain Explore without needing to sign in.

For Reboot, use the new Pilot Program’s Library and its authorised resources through the Academy Library integration. Carry the verified Program context where required, while preserving For You’s Academy-wide view. Do not connect legacy Reboot Library screens or data, or use them to fill gaps in the new Program Library integration.

### For You

The Personal Library uses the existing Academy account and includes everything the person is entitled to access across the Academy, including authorised resources from the shared curriculum displayed as Courses, subject to the exclusion of legacy Reboot data from this website integration. Use the Public Library’s subject-column layout: one column per subject, with its resource cards stacked vertically and columns browsable horizontally. Combine a subject’s authorised resources across sources in the same column while retaining source and Module labels on cards. Keep search, source and category filters.

### Explore

Explore is the **Public Library**, independent of Program or Course membership and available without sign-in.

For Library display only, group the filter pills as **All**, **PDF**, **AudioVisual** and **Other**. **PDF** includes eBooks and Printables; **AudioVisual** includes Audio and Video. This grouping does not change stored resource types, formats, management options or access permissions. Preserve the underlying categories:

- eBooks

- Printables

- Audio

- Video

- Other

Teachers can browse teaching resources across Programs. Editing and management for Teachers and Program Admins are limited to **their assigned teaching levels/classes**. Only Global Admin can change the shared Resources folder. Wider browse access does not grant editing rights.

### Subscription model to support

Subscriptions apply to individual Modules:

- Active Modules provide current subscribers with existing and newly added media.

- At completion, qualifying subscribers receive permanent access to the resources included at completion.

- Subscriptions ending before completion do not qualify.

- Access through any linked Module is sufficient.

- Archiving Programs, Courses or Modules must preserve permanent entitlements and their accessible media.

- Permanent grants are recorded against the Academy account.

- Protected catalogue and file access are checked on the server.

Reuse existing Academy and new Program Library functionality, but verify its compatibility with this model. Do not present Module subscriptions or lifetime access as operational until their backend support is implemented. Show **Coming soon** for unavailable new Program Library functionality or integration.

## 7. Universal student progress

Dua and Surah Progress applies to **all students**, regardless of Program.

The intended result is one Academy progress record per student, with authorised staff views.

Universal progress integration is **Coming soon** until supported by the new Program framework and the Academy account model. Do not connect, copy or migrate legacy Reboot progress into the website, and do not create duplicate progress records for each Program.

Any available Program-specific progress must be clearly scoped to that Program. It must not be presented as the universal Academy progress record.

## 8. Voice Recorder

Visible to students only.

The recorder:

1. Lets the student select an existing lesson image.

2. Records their voice over it.

3. Produces a video.

4. Allows previewing and sharing through the existing supported controls.

Reuse an appropriate existing Academy recorder implementation and image collection only where compatible with the new Program framework and the agreed access model. Exclude legacy Reboot screens and data. If a compatible integration is unavailable, show **Coming soon**.

General image-selection flexibility is deferred. Inspect existing recorder variants before linking one; do not assume they have identical behaviour.

## 9. Existing functionality and placeholders

Audit these existing routes before connecting them:

| Area | Existing route |
|---|---|
| Academy home | `/academy/` |
| Personal Library | `/academy/library/` |
| Public Library | `/academy/open-library/` |
| Program setup | `/programs/` |
| Program management | `/programs/manage.html` |
| Timetable builder | `/programs/timetable.html` |
| Program attendance | `/programs/attendance.html` |
| Program Library management | `/programs/library.html` |
| Existing recorder candidate | `/recorder/` |

These are candidates for verification, not confirmation that every feature is available.

Also audit the existing shared curriculum, Course delivery, timetable and Library services before connecting them. Preserve the actual curriculum and offering IDs required by each service, and use **Course** or **Courses** for website display labels. Do not assume that the display rename makes an unavailable integration operational.

Pass the required Program context and preserve authentication when linking. For every Reboot Program link and data request, use the new Pilot’s verified Program ID and its new Program records. Verify that timetable entries, classes, Library resources and teaching tools resolve to that same Program.

Do not connect legacy Reboot routes or data sources. An unavailable new Program feature must remain a placeholder rather than opening a legacy equivalent.

For unavailable features:

- Display the feature name and **Coming soon**.

- Give a short description of its purpose.

- Do not provide simulated saves or submissions.

- Do not use broken links or silently open an unrelated screen.

Keep the existing links to [ummabbadacademy.com](https://ummabbadacademy.com), including the original-site, individual public course and public lesson links. Remove only the specifically marked bottom catalogue pagination text links (page 1, page 2, page 3, page 4); retain the numbered in-page browsing controls. Historical catalogue entries must remain clearly identified as catalogue information and must not appear as current upcoming events.

Remove the marked catalogue artwork caption, descriptive paragraph beneath its heading and explanatory source sentence beneath its cards. Also remove the marked **Catalogue page** label and the bottom **page 1, page 2, page 3, page 4** text links. Preserve the heading, artwork cards, numbered controls, playback controls, individual course links and public lesson links.

## 10. Acceptance criteria

Verify:

- Visitor, Student, Teacher, HOD and Global Admin journeys.

- An account with different roles across Programs.

- Login, refresh, return navigation and effective sign-out.

- The new Reboot Pilot Program is displayed as **Reboot** and its pill opens the correct Program using its actual verified Program ID.

- Reboot’s timetable, Library, classes, membership and available teaching tools use that same new Program ID and its authorised data.

- Other Academy Programs use the same new Program framework integration pattern.

- The existing shared curriculum is incorporated, with **Course** and **Courses** replacing **Global Subject** and **Global Subjects** in the website interface.

- Course pills, curriculum, Modules, schedules, Library resources and available tools resolve to the correct existing records and authorised access.

- The display rename preserves curriculum and offering relationships, backend IDs and permissions, without data duplication or migration.

- Public Library and free-material access without sign-in; one Library menu item opens For You for a signed-in Academy account and the Public Library for visitors, with public Explore available independently.

- For You showing authorised resources across the Academy in subject columns, with persistent For You and Explore navigation pills in both Library views for all signed-in roles.

- Protected content remaining protected when opened directly.

- One upcoming timetable item per Program or Course per day on the main page, with future dates available by swipe; visitors see plain entries without links. Timetable and Programs and Courses are absent from the main menu. The Academy side menu persists across Academy pages and connected new Program tools. Compact, centred Program pills and one combined Workshops pill appear in a top row on these pages, excluding the home page. The home Coming up summary uses all published Academy lessons independently of the signed-in person’s enrolments. Global Admin sees the entire published Academy timetable on every Program page and in the full timetable, without enrolment or teaching assignments; other personal timetables remain limited to enrolled or assigned lessons. Every Program page shows the same integrated personal Academy timetable, with authorised information popups, next-lesson highlighting and server-enforced joining from five minutes before start until the lesson ends. Signed-in timetables use compact seven-day columns, including empty dates, with the Academy timezone shown once above the week. Lessons sharing a Zoom link combine into one card per day across subjects and times; the i popup retains every lesson’s details. Different rooms, missing links and different days remain separate. Grouping does not release joining URLs early or expand access.

- Correct actual Program context for attendance and management links, a single swipeable subscribed-activity row, and assigned-level/class limits for preparation and Library management. Teacher and administrator actions remain Coming soon wherever their required backend integration or scope is unavailable.

- Student-only recorder visibility and mobile recording/sharing where supported; otherwise **Coming soon**.

- Missing new Program functionality, including universal progress integration, clearly shows **Coming soon**.

- Legacy Reboot screens, schedules, Library data, learner records and progress are excluded from website integration, with no fallback requests or links.

- Legacy Reboot code, operational screens, services and data remain untouched.

- Clear loading, empty, unavailable and Coming soon states.

- Phone layouts, especially iPhone Safari.

- No sample learner records or progress presented as live data.

Deliver a reviewable local build, a list of connected features, the verified Reboot Pilot Program ID used, remaining dependencies and verification results. Request permission before any push or deployment.
