# Main Academy D1 database — 9 October 2026

The user-created **maktab-academy** Cloudflare D1 database is initialized and contains the verified active Academy candidate. It is the intended main database, not a disposable development or load-test database. Its ID is `7e732b79-a72f-4da6-be83-524919c49ba4`.

The current application is **devrebootworker**. The production-named `rebootworker` is legacy. This preparation does not deploy either Worker, change website routing or enable D1 ownership. The current application continues reading and writing Sheets while the remaining migration work is completed.

## Source and selection

The fresh read-only capture completed at **2026-10-09 16:41:12 UTC**. It covers seven workbooks, 133 tabs and 8,306 populated/interior rows including headers. The captured central spreadsheet identity matches the currently deployed development Worker's binding. The source is the newer Academy dataset explicitly selected for this migration.

The legacy production Worker's central spreadsheet differs: its registry contains only the explicitly excluded old Reboot workspace, and its central account table has no account rows. The user confirmed that development is current and production is legacy. The legacy workspace and its operational data were not added to the main database.

Selection retains Alimiyah, Reboot (Pilot), Mothers of the Ummah, Tafseer and Hifz as active Programs, together with the active Global Courses. All five Programs now have current published timetables, superseding the earlier local baseline in which Hifz had no publication. Active authoring records and current draft state are retained where the converter supports them; website timetable visibility remains publication-based.

## Main database verification

| Check | Result |
| --- | ---: |
| Exact table content comparison | PASS across all 45 tables |
| Foreign-key check | PASS |
| Active accounts and credential records | 73 |
| Existing stored credential hashes preserved | 5 |
| Accounts with PIN setup still incomplete | 68 |
| Active Programs / Global Courses | 5 / 2 |
| Currently published Programs | 5 |
| Publications, including Global Course publication | 6 |
| Published timetable entries, including breaks | 68 |
| Class memberships | 35 |
| Active Program management records | 118 |
| Inactive accounts excluded | 1 |
| Inactive management records excluded | 3 |
| Legacy workspaces excluded | 1 |
| Legacy privileged role assignments awaiting review | 20 |
| Account sessions imported or created | 0 |

The main database was verified empty before preparation. The three reviewed schema migrations and active-data SQL were applied through a private import file. Every table was then read back and compared to the expected converted rows, including credentials, permissions, immutable publication snapshots, provenance and migration state. A verification rerun performed no additional import. Schema content hashes remain recorded in `academy_import_schema`.

The refreshed candidate also passes the full source projection comparison: 73 accounts, 104 available sign-in contexts, 116 selected source Program role grants and **1,680** public/signed-in home and activity comparisons. This uses the native D1 adapter and captured source, not real account PIN login attempts against a hosted Worker.

No load-test fixture or synthetic login account was imported into the main database. The earlier 200-flow burst remains a separate local Workers/D1 test and does not establish hosted application capacity. Historical audits, attendance, calendar records, arbitrary settings and unsupported source formats remain outside this candidate; the main import is not a completed migration of every application workflow.

## Configuration and private evidence

`backend/wrangler.academy-main.jsonc` identifies the main account/database and `ACADEMY_DB` binding for database administration. It has no Worker entrypoint or deployment target, so adding this file does not bind or switch a running application. The local rehearsal configuration remains separate and retains its local placeholder ID.

Private evidence is retained under the ignored `.academy-migration/` directory:

- `main-db-source-20261009164112054.json` — complete values source capture; excluded reference records stay private and were not imported.
- `main-db-candidate-20261009164112054.sqlite` — native active-only candidate, validated before upload.
- `main-db-flow-parity-20261009164112054.json` — refreshed source/home/permission comparison.
- `main-db-cloud-20261009164112054/` — private SQL import and preparation evidence.
- `main-db-cloud-20261009164112054-verify/verified-report.json` — successful full cloud readback verification.

The source snapshot SHA-256 is `795fe7b2629577b371ba167e7fc5a95bd2de2795a85adcb8cd8144f0b1eebfbb`; the import run ID is `3e26a5d4efb3eebce834e164afa7c660e838af2027a22cc6c74a83fb40e286aa`.

## Next integration boundary

Connect the **current development Worker/application** through the controlled D1 integration while preserving its existing PIN secret and the credential revocation rules. Complete dependent account, role, registry and other writers consistently; the isolated login/home rehearsal does not yet cover the whole application. Resolve Program Admin/HOD and admission/subscription rules before activating new authority. Keep the legacy production application separate.

The imported candidate remains `SHEETS/STAGING`, with migration run state `IMPORTED`, and `cutoverReady=false`. There is no ongoing synchronization: changes made in Sheets after the capture are not automatically reflected in D1. Before the eventual switch, reconcile subsequent changes with a fresh coordinated capture or a verified change-capture process.
