## V105.3.1.7 acceptance

- [x] Restore module rows immediately inside expanded subjects/levels.

- [x] Keep the acknowledged row visible and retry failed refresh reads automatically with quota cooldown.
- [x] Preserve drafts and browsing during cooldown; never repeat a confirmed write for a read failure.
- [x] Bound retry attempts and reduce request-local spreadsheet reads.
- [ ] User acceptance: save, observe any temporary refresh delay, keep editing, and confirm automatic recovery, restored module rows and V105.3.1.7 labels.

Future requirements: optional levels selected from Beginner / Intermediate / Advanced; individual student module-completion history in V105.5. See [refresh fix and roadmap notes](docs/V105.3.1.7-REFRESH-RECOVERY.md).

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
