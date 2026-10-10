# Academy source reconciliation and recovery check — 10 October 2026

A fresh read-only source capture and a new private D1 candidate are verified. **No source records, main cloud database rows, deployment or live storage routing were changed.** Both public version endpoints still report V106.0, and the website still uses Sheets.

## Fresh source and candidate

The capture ran from **05:51:57 to 06:04:24 UTC on 10 October 2026**. It contains seven workbooks, 133 tabs and 8,306 populated/interior rows including headers. All 148 bounded reads completed without a Sheets throttling response. Workbook modification timestamps and tab/grid metadata were unchanged between the checks around the capture. This remains an online, non-atomic values snapshot, not a coordinated write freeze or a backup of spreadsheet formulas, formatting or Drive files.

Comparison with the 9 October 16:41:12 UTC baseline found **one changed cell: one account's LastLoginDate**. Account identity, credential hashes/setup, authority, Program/Course content, publications, attendance and resources are unchanged. Newly generated capture/run identifiers are provenance changes, not new permission grants.

The same approved active-only policy was used. The old Reboot workspace, one inactive account, three inactive management records and inactive calendar entries remain excluded. The two current Courses remain included; only their old Global Subject terminology is legacy.

| Verified local candidate | Count |
| --- | ---: |
| Tables after extensions 0004–0007 | 62 |
| Active accounts / stored credential hashes | 73 / 5 |
| Active Programs / current Courses | 5 / 2 |
| Class memberships | 35 |
| Current publications / timetable entries | 6 / 68 |
| Historical attendance registers / marks | 4 / 21 |
| Program Library resources | 8 |
| Active calendar records / removed-holiday dates | 48 / 2 |
| Application sessions / retry receipts / new subscription decisions | 0 / 0 / 0 |

The candidate was rebuilt from the fresh source using the existing reviewed converters and extensions. It was not produced by merging unreviewed changes into the main database. Base, learning and Course/calendar content checks, integrity and foreign keys pass. All **1,680 source identity/context/Home projection comparisons** pass at the base-conversion boundary. Reads through the current 62-table application cover all five Programs, profiles, curriculum, Courses, Calendar, attendance, Personal Library, Open Library options and the 14-day account timetable. The read checks use a disposable copy and leave the candidate unchanged; no real account PIN is entered.

The current approved Admin-to-Program-Admin and Senior-to-Teacher mappings remain part of extension 0004. The source parity check retains the original compatibility-role comparison; it does not claim those intentional role-label changes are absent.

## Main database backup and local restore

Read-only queries confirm that the main cloud database still contains its **45-table original import, 73 accounts and zero sessions**. Its complete table contents match the original verified baseline.

The standard Cloudflare SQL export endpoint returned **authentication error 10000**, despite ordinary authenticated D1 reads working. The documented [D1 export command](https://developers.cloudflare.com/d1/best-practices/import-export-data/#export-an-existing-d1-database) was therefore not available in this session. Its authentication issue remains unresolved.

A private backup was instead captured through the working, read-only query endpoint: all 45 application tables plus their schema, indexes, triggers and views. That backup was restored into a new local database and compared exactly with the original verified import. A SQL dump of the restored database was then restored into a second new local database; all 45 table comparisons, schema checks, integrity and foreign keys pass. No restore was performed against the cloud database.

This proves recovery of this main-database snapshot locally. It does not prove an end-to-end cloud rollback, back up Drive/R2 contents or make switching back to Sheets safe after future D1 writes. Those require their own reviewed recovery steps. Before using a local SQLite dump with D1, follow the import-format adjustments in the linked Cloudflare documentation; this stage did not import that dump remotely.

## Live Library and uploads

The existing public Open Library API returns **18 public records**, including **eight uploaded covers**. A sampled uploaded cover loads with a valid image signature. This inventories the current live store, not hidden editor records, and does not claim hosted D1 acceptance. The existing Durable Object namespace and R2 binding remain unchanged.

The refreshed candidate preserves **Alimiyah's one configured Program upload destination**. Hifz, Mothers of the Ummah, Reboot (Pilot) and Tafseer still need destinations selected. No folders were guessed or created. Folder links, or a parent folder for new Program folders, have been requested.

The Apps Script cleanup and Library bridge checks pass. Repository `code.gs` supports the signed D1 upload purpose, but deployment of that version and a real upload have not been verified. Follow the [D1 upload deployment sequence](../apps-script/README.md#d1-device-uploads-unreleased) before enabling device uploads.

## Concrete hosted verification boundary

Keep `devrebootworker` as the current main application and keep the production-named legacy Worker separate. Feature pushes deploy the current website and Worker together, so a test deployment must use an explicit separate target rather than repurpose the live storage flag.

| Required check | Test target and pass condition |
| --- | --- |
| Hosted peak login/Home | A dedicated disposable test database and Worker with synthetic accounts; never insert load fixtures into the main database. Exercise at least the existing 200 simultaneous complete flows, record latency/errors and verify no Sheets dependency on that path. Local results are not hosted capacity evidence. |
| Full workflow and permissions | Representative Student, Teacher, Program Admin and Global Admin accounts in the isolated target; verify the current route matrix, scoped edits, PIN setup/reset/logout, stale saves, lost acknowledgements and revocation. Keep real credentials and private account data out of public test fixtures. |
| Files and uploads | Test-only Drive destinations and appropriate isolated storage; deploy the updated bridge, verify folder containment, complete a file/cover upload and reject revoked or changed-folder tickets. Do not write synthetic files into live Program folders. |
| Open Library | Verify the D1 checks with the existing namespace design and a separate test object/bucket. Retain the main namespace/bucket in the reviewed live deployment, and recheck existing public metadata/covers afterward. |
| Browser acceptance | Complete actual page navigation through an approved browser connection. The previous native browser tool security-policy failure remains unresolved; API and script tests do not replace that acceptance check. |
| Live activation | Implement and test the explicit ownership/activation transition. The current `REHEARSAL` gate requires `SHEETS/STAGING` and rejects a database changed to D1 ownership; setting its flag alone is not the final switch. |
| Final source and recovery | Coordinate a source write freeze, take/reconcile the final capture, retain verified backups and define reverse reconciliation for writes made after activation. Review the concrete transition before enabling live D1. |

This increment adds no runtime feature changes. The preceding full suite remains **119/119 test files passing**; the data refresh adds source parity, exact content/read checks and backup/restore verification rather than another synthetic load run. A future feature push still requires a fresh version and changed URLs for previously updated assets.

Private captures, candidates, SQL/JSON backups, comparison results and verification helpers are under `.academy-migration/refreshed-20261010T060424179Z/`, ignored by Git with restricted local permissions. The main database has not received extensions 0004–0007, and `cutoverReady=false`.

See the preceding [route review](ACADEMY-D1-ROUTE-AUDIT.md) and [main database preparation](ACADEMY-MAIN-D1-PREPARATION.md).
