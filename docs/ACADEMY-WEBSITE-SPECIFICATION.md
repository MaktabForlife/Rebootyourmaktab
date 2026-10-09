## Objective

Update the existing Academy demo into a usable Academy entrance. Connect existing functionality where it supports the agreed behaviour. Show **Coming soon** for unavailable features or integrations.

Preserve the Academy branding, soft lavender and plum design. Use the Academy logo in the navigation and as a subtle background behind the public announcements and upcoming timetable. Do not repeat the small logo above the Academy title beside sign-in. Make the website work comfortably on phones and computers.

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

- Sign-in controls when signed out, with Account ID and PIN labels. Omit the Academy account badge and the explanatory paragraph below the submit button. Remove the three shortcut buttons beneath sign-in while keeping the original Academy-site link; Public Library and Programs and Courses remain available through the main navigation.

- Personal activity pills and Sign out when signed in.

The public artwork row is display-only for now. Do not put links on its images, names or actions, either to ummabbadacademy.com or to internal Academy activity pages. Keep the row swipeable and retain its original artwork.

The free workshop and course catalogue is headed **Immerse yourself in these free workshops and courses**.

Personal activity pills separately open the signed-in person’s actual new Program and Course records, with their existing permissions and tools. The public showcase must not depend on personal membership or availability of the account/timetable service.

Remove obsolete demo instructions, connection-plan content and sample completion controls from the ordinary user experience.

### Academy timetable

On the main page, display the shortened Academy timetable as **Coming up**, beneath the enlarged announcements area. Group entries into horizontally swipeable date columns, with Program or Course names as compact cards and their published time visible. Omit the timezone from these Coming up cards; keep it in the full timetable. Provide arrow buttons and keyboard access as well as touch scrolling. Include only the next published item per Program or Course within the next seven days. Exclude ended and cancelled items, and combine Course offerings under their Course for this summary.

Signed-in users can open the full Academy timetable from this summary. Do not include Timetable in the main menu. Highlight the signed-in person’s involvement using **colour**, supported by a simple colour key in the full timetable.

Do not add “My class” or “Teaching” labels to highlight involvement.

Visitors see public timetable entries as plain text, with no timetable, activity, information or joining links. Visitors retain access to free material, the Public Library and original Academy-site links.

For signed-in authorised users, an **i** icon opens supplementary information, such as multiple teachers or the classes included in a combined lesson. It must work on tap and click.

Joining links and protected lesson details are accessed through the relevant activity page.

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

In the signed-in **My Academy** panel, beneath personal Library access, show **Your activities** as pills. Display the role beneath each activity name. Visitors must not see this personal section.

Populate activity pills from actual account access, including authorised access to the existing shared curriculum displayed as Courses. Show each Program separately. Group all Courses, including Barakah and Salaah, into one **Workshops** home pill. This opens a chooser containing only the person’s authorised Courses, with the individual role beneath each Course name. Bind each chooser entry to its actual underlying curriculum ID and any required offering context. Hide the Workshops pill when no Course access is assigned; clear the chooser on sign-out. Do not use the demo’s fixed list as personal membership data.

Display the new Reboot Pilot Program pill as **Reboot** and bind it to the Pilot’s verified Program ID. Determine membership and roles from that Program’s current access records. Legacy Reboot membership must not be used to infer access to the new Program.

A person can hold different roles in different Programs and Courses. Preserve the existing scope of each role and entitlement. **Workshops** is a home navigation grouping only; it does not merge memberships, permissions or underlying Course records.

Include universal student activities, such as Dua and Surah Progress and Voice Recorder, alongside relevant Program and Course activities. Show **Coming soon** when their required integration is unavailable.

Provide:

- **Manage Program** within Programs where the person is an authorised HOD.

- **Academy administration** for Global Admins.

Preserve established underlying permissions. A newly displayed role name must not silently grant additional authority.

## 4. Program and Course pages

Use these learning structures:

- **Programs:** Subjects → Modules → scheduled lessons.

- **Courses:** The existing shared curriculum, organised into Modules, with linked scheduled lessons and offerings such as workshops, bootcamps and presentations where supported.

Each activity opens an appropriate landing page containing its available tools.

The Reboot landing page uses the new Pilot Program’s timetable, Library, classes and available teaching tools, all scoped by its actual Program ID. Apply the same Program framework integration pattern to the other Academy Programs.

### Courses and shared curriculum

Incorporate the existing **global subjects curriculum** into the Academy website. Display **Global Subject** as **Course** and **Global Subjects** as **Courses** throughout the website’s navigation, headings, pills, selectors, timetable details and Library labels. Subjects within Programs remain **Subjects**.

Reuse the existing curriculum, Modules, tasks, resources and authorised tools. Retain their underlying IDs, records, relationships and access rules; this is a display terminology change, not a backend schema rename or data migration.

Keep scheduled offerings linked to their underlying curriculum, preserving each offering’s actual ID, dates, publication and access context. Do not duplicate curriculum records or merge distinct entitlements because both are presented under Courses.

Course landing pages expose the available curriculum, timetable, Library and tools for the person’s authorised scope. Show **Coming soon** for unavailable functions or integrations.

| Feature | Intended availability |
|---|---|
| Detailed timetable and authorised lesson links | Relevant participants |
| Library | Opens the Academy Personal Library, using the new Program Library integration for Program resources |
| Announcements | Relevant audience |
| Assignments | Learners and responsible staff |
| Attendance | Teachers and authorised administrators |
| Lesson preparation | Teachers and authorised administrators |
| Manage Program | Program Admin |
| Program-specific progress | Where supported by the new Program framework |

Teachers may view lesson preparations for other classes **within the same Program**. This permission does not grant access to those classes’ private learner records.

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

The intended HOD remit includes Program management, timetable publication and oversight of teaching, attendance, progress and resources. Where current services only allow Global Admin access, show the HOD integration as pending rather than bypassing that restriction.

## 6. Library

The main Academy menu’s **Library** link always opens the **Public Library** at `/academy/open-library/`, before and after sign-in. Keep personal Library access separately labelled.

**Library** is also a menu item on each Program and Course page.

It opens **For You** by default, without automatically filtering to the current Program or Course.

For Reboot, use the new Pilot Program’s Library and its authorised resources through the Academy Library integration. Carry the verified Program context where required, while preserving For You’s Academy-wide view. Do not connect legacy Reboot Library screens or data, or use them to fill gaps in the new Program Library integration.

### For You

The Personal Library uses the existing Academy account and includes everything the person is entitled to access across the Academy, including authorised resources from the shared curriculum displayed as Courses, subject to the exclusion of legacy Reboot data from this website integration.

### Explore

Explore is the **Public Library**, independent of Program or Course membership and available without sign-in.

Retain the agreed categories:

- eBooks

- Printables

- Audio

- Video

- Other

Teachers can browse teaching resources across Programs. Editing and management follow their authorised scope. Only Global Admin can change the shared Resources folder.

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

Keep the existing links to [ummabbadacademy.com](https://ummabbadacademy.com), including the original-site and public course catalogue links. Historical catalogue entries must remain clearly identified as catalogue information and must not appear as current upcoming events.

Remove the marked catalogue artwork caption, the descriptive paragraph beneath its heading, and the explanatory source sentence beneath its cards. Preserve the heading, artwork cards, controls and original-site links.

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

- Public Library and free-material access without signing in; the main menu Library link remains public after sign-in.

- For You showing authorised resources across the Academy within the agreed integration scope.

- Protected content remaining protected when opened directly.

- One upcoming timetable item per Program or Course on the main page; visitor entries have no links; Timetable is absent from the menu; authorised colour highlighting and supplementary information popups still work.

- Correct Program context for attendance and management links.

- Student-only recorder visibility and mobile recording/sharing where supported; otherwise **Coming soon**.

- Missing new Program functionality, including universal progress integration, clearly shows **Coming soon**.

- Legacy Reboot screens, schedules, Library data, learner records and progress are excluded from website integration, with no fallback requests or links.

- Legacy Reboot code, operational screens, services and data remain untouched.

- Clear loading, empty, unavailable and Coming soon states.

- Phone layouts, especially iPhone Safari.

- No sample learner records or progress presented as live data.

Deliver a reviewable local build, a list of connected features, the verified Reboot Pilot Program ID used, remaining dependencies and verification results. Request permission before any push or deployment.
