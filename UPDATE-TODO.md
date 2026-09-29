# V105.3.3 — Development acceptance

- [x] Multi-user and multi-cell drafts; Save all and row Save icons; preserve edits and stable retries.
- [x] View profile popup, share/copy personal sign-in link, clean scope headings and session-pinned new users.
- [x] Confirmed Teacher/Senior/Admin roles in the shared program matrix supply active timetable teachers.
- [x] Rename Academy subjects with stable IDs, duplicate checks and conflict review.
- [x] Subject-only timetable lessons alongside modules; preserve existing weekly, optional-teacher and Zoom rules.
- [x] Copy a published timetable into a new editable draft; keep original publications immutable.
- [x] Reference-based weekly grid for preview/history, class filter, image share/download and linked PDF download.
- [x] Automated regression, bundled Worker runtime, generated PDF rendering and link checks.
- [ ] User acceptance of profile batching, mobile share actions, names and the timetable layout on Development.
- [ ] Later user checks of Active/Inactive, Free/Paid access and class enrolments. Their earlier provisional observations are retained, not marked complete.
- [ ] Legacy Global Subject/Reboot access migration is still staged. Review and activate separately.
- [ ] Future integration: individual learner module-completion records, library/resources (V105.4), student/program/task integration (V105.5).

## V105.3.2.3 acceptance

- [x] Optional class default Zoom link in Classes; lesson override in the timetable grid.
- [x] Lesson link takes priority; single-class lessons fall back to their class link.
- [x] Combined-class lessons require a shared lesson link before publication; unfinished drafts can still save.
- [x] Safe HTTPS meeting links, explicit clearing, preserved cached-editor fields and stable retries.
- [x] Published snapshots retain their selected link until replaced by a new publication.
- [x] 81 regression files, development build and local Cloudflare runtime checks pass.
- [ ] User acceptance: real class/lesson links, combined-class validation, preview/history links and desktop/mobile layout.

See [Zoom links](docs/V105.3.2.3-ZOOM-LINKS.md). Earlier acceptance items remain open.

## V105.3.2.2 acceptance

- [x] Ongoing weekly rows; remove Pattern, lesson dates, date window and exceptions from the editor.
- [x] Module first; Classes shows the selected class names, including combined classes.
- [x] Teacher optional; still validate any selected teacher's eligibility and overlapping lessons.
- [x] Normalize 845 / 0845 / 8h45 / 8:45 to 08h45; preserve valid 1015 entry.
- [x] One publication effective date; future versions preserve the current timetable until activation.
- [x] Immutable publication history, retained draft edits and stable retry identifiers.
- [x] 80 regression files, development build and local Cloudflare runtime checks pass.
- [ ] User acceptance: enter actual weekly lessons, preview without a teacher, publish now or for a future date, and check desktop/mobile layout.
- [ ] Previous management, profile and access-matrix testing is still open; this release does not mark it complete.

See [implementation and verification](docs/V105.3.2.2-WEEKLY-TIMETABLE.md). Broader timetable work remains V105.3.3.

## V105.3.2.1 acceptance

- [x] One spreadsheet-like row per user; columns for all programs and global subjects.
- [x] Multiple roles per cell; User default; separate central Active/Inactive status.
- [x] Scope-wide Free/Paid settings; Paid permits Student/Teacher/Senior/Admin.
- [x] Separate setup matrix, scope settings and import reviews in the development workbook.
- [x] Import 33 existing identities and six scopes without changing legacy access records.
- [x] Preserve drafts, exact retries, confirmed-save read recovery, audit and credential protection.
- [ ] Administrator review: ten proposed Student entries imported from TRUE access flags.
- [ ] Administrator review: Free/Paid for Reboot and Alimiyah (conservative Paid defaults, pending review).
- [ ] User acceptance: desktop/mobile matrix, role combinations, settings, profile edits and recovery.
- [ ] Finalize the structure in Google Sheets before any database migration.
- [ ] Later: reviewed migration of Global Subjects and Reboot to the new matrix, with legacy identity mapping, access comparison and rollback.
- [ ] Later: migrate finalized data to Cloudflare D1; no database is provisioned in this release.

The earlier V105.3.2 subscription-confirmation model is superseded. Setup role changes do not yet change timetable teacher lists or legacy authorization. Name and account-status edits remain immediate central identity changes. Existing user acceptance remains open.

V105.3.3 timetable, V105.4 library/resources and V105.5 student/program integration, tasks and permanent student module-completion history remain planned.

## V105.3.1.8 acceptance

- [x] Five tabs, in order: Overview, Modules, Subjects, Classes, User profiles; no heading counts.
- [x] Optional standard levels selected and saved with Modules; preserve existing custom links.
- [x] Inline per-class Active / Inactive / Completed module status; no separate progress tab.
- [x] Remove the Teachers tab; timetable candidates come from active program teaching roles.
- [x] Existing academy user directory, current program roles and profile-scoped class memberships.
- [x] Preserve drafts from older removed sections; retain save/retry/conflict behavior.
- [x] 76 regression files, development bundle and local Cloudflare runtime checks pass with synthetic data.
- [ ] User acceptance: verify five-tab layout, optional levels, independent class statuses, memberships and desktop/mobile presentation on Development.
- [ ] Complete testing of the prior refresh/recovery changes; this patch does not mark earlier user testing complete.

V105.3.2: shared academy profiles, editing and multiple roles across programs. V105.3.3: timetable development. V105.4: library/resources. V105.5: student/program integration, tasks and permanent student module-completion history. See [patch notes](docs/V105.3.1.8-MANAGEMENT-TABS.md).

## V105.3.1.7 acceptance

- [x] Restore module rows immediately inside expanded subjects/levels.
- [x] Align subject names, level counts and module counts into consistent columns.

- [x] Keep the acknowledged row visible and retry failed refresh reads automatically with quota cooldown.
- [x] Preserve drafts and browsing during cooldown; never repeat a confirmed write for a read failure.
- [x] Bound retry attempts and reduce request-local spreadsheet reads.
- [ ] User acceptance: save, observe any temporary refresh delay, keep editing, and confirm automatic recovery, restored module rows and V105.3.1.7 labels.

Standard optional levels are implemented in V105.3.1.8. Individual student module-completion history remains planned for V105.5. See [refresh fix and roadmap notes](docs/V105.3.1.7-REFRESH-RECOVERY.md).

## V105.3.1.6 acceptance

- [x] Collapse subjects, levels and modules by default; preserve optional levels and search.
- [x] Browse tabs while preserving an unfinished row or pending operation.
- [x] Restrict teachers to active program roles in the UI and backend.
- [x] Align login, Program, version-file and Worker release labels.
- [x] Reduce overview read duplication and classify/correlate spreadsheet failures.
- [x] Pass 76 regression files and Cloudflare runtime tests.
- [ ] User acceptance: desktop/mobile expansion, Learners navigation, teacher eligibility, save/refresh behavior and visible version labels.
- [ ] Diagnose the earlier real spreadsheet failure if it recurs; quota cause is not confirmed.

Next: V105.3.2 shared User Profile/roles; V105.3.3 timetable; V105.4 library/resources; V105.5 student/program integration and tasks.

## V105.3.1.4 acceptance

- [x] Per-class Active / Inactive / Completed module progress.
- [x] Overview status actions and desktop/mobile progress editor.
- [x] Preserve module availability, other classes and timetable history.
- [x] Validate duplicate/reference/status cases, retries, stale edits and old snapshots.
- [ ] User acceptance: complete a module for one real class, reload, and confirm another class remains independent.

## V105.3.1.3 acceptance

- [x] Combined curriculum overview with desktop rows and mobile cards.
- [x] Keep optional levels, subjects without modules, and archived rows visible.
- [x] Derive timetable relationships and date-aware, distinct learner lists.
- [x] Open module editing and creation from the overview; preserve pending import recovery.
- [ ] User acceptance on Development with actual curriculum and a phone.

## V105.3.1.2 acceptance

- [x] Import selected Reboot names directly into the Program subject grid.
- [x] Reuse catalogue names and skip existing Program links; preserve archived links.
- [x] Keep both import phases retryable after interrupted saves and reloads.
- [x] Explain what recovery does and distinguish no interrupted save.
- [ ] User acceptance: reselect previously imported Fiqh, Aqaaid and History in Alimiyah and confirm each appears once after reload.

## V105.3.1.1 acceptance

- [x] Separate Academy curriculum catalogue from Global Course subjects.
- [x] Create and link subjects in the same management row.
- [x] Reviewed import of Reboot names, duplicate reuse, source mappings and recovery.
- [x] Explicit mapping of legacy Program links with dependent records preserved.
- [ ] User acceptance with Development workbooks through management screens.
- [ ] Later: full shared-catalogue rename/archive governance and live Reboot migration.

# V105.3.1 — Development acceptance

The management screens and Johannesburg-default timezone dropdowns are implemented. Live acceptance is pending.

1. Verify the live Pages project remains on `main`; use only the separate `maktab-development` Pages project and `devrebootworker` for testing.
2. Deploy matching V105.3.1 frontend/Worker, retaining existing credentials and coordinator binding.
3. Complete Aalimiya Program preparation and click **Manage Program → Prepare management tables**.
4. Through management screens, link shared subjects, optionally add levels, add modules/classes, assign existing teachers and add dated learner memberships. No manual Sheet entry is needed.
5. Finish V105.2 timetable acceptance using the saved records: combined classes, save/reload, preview, publication, conflicts, exceptions and immutable history.
6. Complete real-data access, recovery, mobile and regression checks. See the setup guide for the management-history storage contract and rollback limits.
7. Next: broader account/role provisioning, full curriculum/library (V105.4), teaching tools (V105.5), Academy/student integration (V105.6), beta (V105.7), Reboot migration (V106).

[Setup and acceptance](docs/V105.3.1-PROGRAM-MANAGEMENT.md) · [Verification](docs/V105.3.1-VERIFICATION.md)
