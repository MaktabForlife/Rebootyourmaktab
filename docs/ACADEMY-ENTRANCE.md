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
