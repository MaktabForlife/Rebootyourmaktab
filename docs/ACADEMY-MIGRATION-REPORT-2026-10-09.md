# Academy migration: first development data report

9 October 2026. Preparation only; application reads and writes still use their existing stores.

The source capture and validation completed successfully. It covers the central Platform workbook, all five new Program workbooks and the legacy Reboot workbook: **7 workbooks, 133 tabs and 8,292 captured rows**, including headers and interior blank rows. Captured values and credentials remain in a private, ignored local directory. They are not included in this report or Git.

## Selection agreed with the user

| Source Program | Migration treatment |
| --- | --- |
| Reboot Your Maktab — old existing workspace | Exclude; user identifies it as draft/archived despite its current Active label |
| Alimiyah | Active |
| Reboot (Pilot) | Active |
| Mothers of the Ummah | Active |
| Tafseer | Active |
| Hifz | Active |

The five new Programs are explicitly treated as active. Their existing registry flag and Draft label are not reliable indicators of the user's intended status. Timetable publication remains a separate requirement for website content. Four Programs currently have an effective published timetable; Hifz has none. Republishing a timetable does not change its Program status label.

| Check | Result |
| --- | ---: |
| Source accounts checked | 74 |
| Active accounts selected | 73 |
| Inactive accounts excluded | 1 |
| Programs selected | 5 |
| Old workspaces excluded | 1 |
| Active management records selected | 118 |
| Inactive management records excluded | 3 |
| Effective Program role grants under current authorization rules | 116 |
| Existing role entries requiring review | 1 |
| References to excluded accounts/classes in the checked current management and eligible Program publications | 0 |

The pending role review remains ineffective. This step does not change or elevate any role. PIN hashes and source identities are retained exactly in the source capture; credentials for inactive accounts are not part of the inclusion manifest.

## Completed

- Mapped the login, session, role and home-page data dependencies.
- Captured all source tabs read-only through the connected Google account, using bounded ranges and paced reads.
- Checked workbook coverage, Program identity, supported schemas, account/login uniqueness, account credential presence, central references, current class memberships, publication links and JSON readability.
- Generated a private inclusion manifest tied to the source and policy checksums.
- Tested 200 synthetic accounts, import replay, rollback, archive corruption, exclusion policies, publication timezones and permission review handling: **16 tests pass**.
- Applied the seven-table staging schema successfully in Cloudflare's local D1 emulator.

## Next implementation boundary

The inclusion manifest identifies selected source rows and embedded management records. It is not an operational database or a finished data converter. The next step is to convert the selected accounts, credentials, permissions, shared catalogues, class memberships and published timetables into the reviewed operational schema, with all dependent writers moved consistently. Snapshot history, attendance and operation receipts need their own conversion rules so excluded records cannot re-enter through embedded JSON or old versions.

No real source archive has been imported into a target database. No cloud database, Worker binding, source Sheet status or deployment was changed. The snapshot was captured while the system was online, so a fresh coordinated capture is required before cutover. Continue normal editing; this report is a baseline, not a live synchronization process.

After conversion, compare the complete login-to-home result for every active account and role, then test a burst of 200 complete flows. The 200-account synthetic test above checks migration tooling; it is not a concurrency test.

[Dependency map and tooling](ACADEMY-MIGRATION-PREFLIGHT.md)
