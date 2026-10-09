# Active Academy import rehearsal

9 October 2026. **Local rehearsal completed; the website still uses Sheets.**

The operational schema and active-data converter now use one Academy database per environment. Program-local IDs have composite keys and foreign keys, so a class or module from one Program cannot silently attach to another. Hifzhelper remains a separate service/database; this importer does not migrate its data.

The schema is in `backend/migrations/academy/`. The foundation was reused from the separate Academy architecture draft. The next two migrations add learning records, credential-aware session storage, permission evidence and timetables. There are 45 tables, with indexes for account memberships, roles and lesson dates/weekday queries. Session/admission tables are empty in this rehearsal; existing browser sessions are not imported.

## Real development result

| Check | Result |
| --- | ---: |
| Active accounts imported | 73 |
| Inactive accounts excluded | 1 |
| Existing PIN hashes retained exactly | 5 |
| Active accounts with PIN not set up | 68 |
| Intended active Programs | 5 |
| Old Reboot workspace | Excluded |
| Programs with current published timetables | 4 |
| Active Global Courses | 2 |
| Active Global Course runs | 1 |
| Active Program management records | 118 |
| Inactive Program management records excluded | 3 |
| Active class memberships | 35 |
| Classes | 11 |
| Current/scheduled publications imported | 5 |
| Published timetable entries | 57 |
| Existing effective Program role assignments retained as evidence | 116 |
| Student/Teacher role assignments imported | 96 |
| Admin/Senior assignments held for explicit privilege review | 20 |
| Global Admin assignments preserved | 3 |

Alimiyah, Reboot (Pilot), Mothers of the Ummah, Tafseer and Hifz are active in the candidate. Hifz has no published timetable. Program lifecycle and publication visibility are separate. The old Reboot workspace is excluded even though its source registry says Active.

The count of 57 is stored published entries, including break entries and a Global Course session. It is not a count of distinct upcoming lessons on the current home page. Archived/inactive Global Courses and runs, and superseded Program publication versions, are excluded. The source capture remains a private reference baseline; it is not the active target database.

All five stored hashes, AccountIDs and login-link IDs match the selected source values. The importer supports the application's salted hash format and legacy 64-character SHA-256 hashes, rejects unknown formats and detects ambiguous account/login identifiers. It does not reset or create a PIN.

Permission evidence was compared for every selected account/Program/role against the current permission resolver. The 116 effective assignments reconcile exactly. Twenty Admin/Senior assignments remain evidence and pending review, with no automatic PROGRAM_ADMIN grant. A source role already awaiting review remains ineffective if included. The one pending source review in this capture belongs to an excluded scope and is not brought into the active candidate. Global Admin remains separate from Program permissions. No admissions or lifetime subscriptions are inferred from old access cells.

## Verification completed

- 34 tests pass across the active importer, foundation schema, source preflight and selection policy. These include 200 synthetic accounts, credential fidelity, inactive dependent-record filtering, pending privilege handling, scoped foreign keys, transaction rollback, repeat imports, corruption detection, immutable publications and private CLI failures.
- The real candidate was imported into a private native SQLite database and independently verified, comparing every complete row rather than counts alone.
- All three migrations and the real active data were applied to Cloudflare's **local D1 emulator**. Every row in all 45 tables matched the expected candidate, and foreign-key checks passed.
- SQLite integrity checks pass on the native candidate. D1 does not permit the same integrity-check pragma; its rehearsal uses the complete content comparison and supported foreign-key check.

The database records the source/policy/converter/schema fingerprints and source provenance. A repeat of the same import verifies the existing candidate. A different capture, conversion or damaged candidate cannot be silently merged into it. Use a fresh dedicated candidate for a new rehearsal.

Raw values, hashes, SQL exports, local databases and emulator state remain inside the private, Git-ignored `.academy-migration/` directory. Reports expose counts and diagnostic coordinates only. No cloud database was provisioned, no Worker binding was activated and no live Sheet was modified.

## Run the local tooling

Use Node 24 or newer, a validated snapshot and the explicit selection policy described in [the preflight guide](ACADEMY-MIGRATION-PREFLIGHT.md).

```sh
node backend/tools/academy-migration.mjs import-active \
  --snapshot .academy-migration/source.json \
  --policy .academy-migration/selection.json \
  --database .academy-migration/active-candidate.sqlite

node backend/tools/academy-migration.mjs verify-active \
  --snapshot .academy-migration/source.json \
  --policy .academy-migration/selection.json \
  --database .academy-migration/active-candidate.sqlite

node backend/tools/academy-migration.mjs active-sql \
  --snapshot .academy-migration/source.json \
  --policy .academy-migration/selection.json \
  --output .academy-migration/active-candidate.sql
```

Conversion and an in-memory SQL rehearsal run before an import destination is opened. SQL output is created with private permissions and contains credentials; it must stay out of Git and shared reports. Apply the three operational migrations first, then the private SQL only to a fresh, dedicated local/development database. The CLI rejects production snapshot/policy environments. It is not a remote deployment tool.

Tests:

```sh
node --test backend/tests/academy-active-import.test.mjs \
  backend/tests/academy-d1-schema.test.mjs \
  backend/tests/academy-migration-preflight.test.mjs \
  backend/tests/academy-migration-policy.test.mjs
```

## Remaining before the website can use D1

The candidate explicitly keeps `data_ownership` at `SHEETS/STAGING`, its migration state at `IMPORTED`, and `cutoverReady` and `operationalImportReady` false. `activeCandidateReady` means this conversion passed, not that the application is ready to switch.

Next, implement the development repository adapter and move login, session checks, PIN setup/reset/upgrades, account changes, roles and the activity registry consistently. Compare the complete login-to-home results for all active users and permission combinations. Resolve Admin/Senior and admission policies before activating new authorization rules. Preserve private joining links and published-only visibility in the API.

Attendance, the shared Academy calendar, historical audits, operation receipts, platform settings and other source tabs outside this converter need explicit conversion or omission decisions. Their presence in the private baseline does not mean they have been converted into operational tables. Dated Program publications/exceptions and unrecognized timetable JSON currently fail closed rather than being silently lost; the captured active Program timetables use the supported weekly format. Global Course recurring definitions are retained after filtering invalidated dependencies, but their D1 runtime projection still needs comparison with the existing derived-window logic. No inactive record is resurrected to satisfy a foreign key.

After complete flow parity, run a burst of 200 simultaneous login-to-home flows. The synthetic migration test is not a concurrency test and does not establish that Sheets throttling has been eliminated. Before any cutover, take a fresh coordinated snapshot that includes edits made since this baseline.
