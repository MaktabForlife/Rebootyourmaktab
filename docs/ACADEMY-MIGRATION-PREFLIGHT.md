# Academy migration preflight

This milestone prepares a source snapshot, a reference archive schema and an inclusion manifest. It is independent of the still-reviewed choice between one operational database and several. It adds no Worker binding and no runtime D1 reads or writes.

## Login-to-home dependency map

| Flow or responsibility | Current source | Migration requirement |
| --- | --- | --- |
| Account check, login, PIN setup/reset/hash upgrade | `UserAccounts`, `PlatformConfig`, audit writes | Stable AccountID and UniqueID lookup; preserve hashes, account state and credential invalidation rules; move every credential writer with the reader |
| Session validation | `UserAccounts` lookup at token `authrow`; hash-derived credential version | Replace physical Sheet coordinates with stable account lookup; keep immediate account disablement and PIN-change revocation |
| Available contexts and Program roles | `CourseRegistry`, `ProgramDefinitions`, `UserCourseAccess`, `AcademyAccessMatrix/Scopes/Review`, global access policy/matrix | Preserve current roles and ineffective REQUIRED reviews; remove excluded scopes from both matrix rows and columns |
| Shared catalogue and Course timetable | Global subjects/modules/runs/policies, timetable state/publications/lifecycle/published sessions | Select active sources and effective publications; preserve cancellation/rescheduling semantics and publication windows |
| Program configuration and source mapping | Central registry/definitions plus each `ProgramIdentity` | Apply the user's explicit active/excluded mapping; separate lifecycle from timetable publication |
| Program classes, memberships and curriculum | Latest `ProgramManagementState.SnapshotJSON`; individual task/resource rows | Read the authoritative latest management snapshot, including records absent from old individual tabs; exclude inactive rows and validate retained relationships |
| Program published lessons | `ProgramTimetablePublications.SnapshotJSON` and effective-date scheduling | Preserve publication semantics; current/future eligible publications determine website content; do not expose draft-only content |
| Home response and joining | Account authorization, all eligible Program projections, global Course projection | Compare complete signed-in/public responses, role scopes and joining time windows after conversion |
| Related writers | Profile/access/Program coordinators, management and timetable writes, attendance, operation receipts and audit history | Define one authoritative store per migrated dataset; preserve replay/conflict/audit behavior; prevent old writers reintroducing excluded data |

Hifz's Academy Program is distinct from the existing Hifzhelper service and its database. A Sheet capture does not migrate or duplicate that external service.

## Tooling

Use Node 24 or newer from the repository root. Private snapshots, policies, manifests, credentials and local databases belong under `.academy-migration/`, which is ignored by Git. The CLI creates new snapshot/archive files with mode 0600, uses exclusive creation for exported files, and prints only checksums, counts and diagnostic coordinates.

```sh
# One source capture using an existing local service-account credential file.
# The connected Google account can also capture the same format through
# metadata-grounded, bounded range reads, as used for the first real baseline.
node backend/tools/academy-migration.mjs export \
  --platform-id DEVELOPMENT_PLATFORM_ID \
  --credential-file .academy-migration/service-account.json \
  --output .academy-migration/source.json \
  --environment development

# No destination is opened or changed by validation.
node backend/tools/academy-migration.mjs validate \
  --snapshot .academy-migration/source.json

# Select active source coordinates using the explicit Program mapping.
node backend/tools/academy-migration.mjs plan \
  --snapshot .academy-migration/source.json \
  --policy .academy-migration/selection.json \
  --output .academy-migration/inclusion-manifest.json
```

A selection policy has this shape. Replace the synthetic IDs with verified registry IDs; every registered activity must have an explicit decision.

```json
{
  "format": "maktab-academy-migration-policy/v1",
  "environment": "development",
  "accounts": "ACTIVE_ONLY",
  "records": "ACTIVE_ONLY",
  "archived": "EXCLUDE",
  "websiteVisibility": "PUBLISHED_CONTENT_ONLY",
  "activeProgramIds": ["verified-new-program-id"],
  "excludedCourseIds": ["verified-old-workspace-id"]
}
```

The manifest contains source row coordinates and stable IDs, not copied credentials. It selects active accounts, active management records and explicitly included Programs. It omits excluded scopes from matrix column selections. It flags retained memberships or publication audiences that refer to excluded accounts/classes. Unreviewed role entries do not become effective grants. Both `cutoverReady` and `operationalImportReady` remain false until the operational conversion and application changes have been implemented and compared.

### Reference archive only

The seven-table staging schema is at `backend/migrations/academy-staging/0001_snapshot_archive.sql`. It preserves a **complete source reference**, including inactive/archived material, to support forensic comparison. It is separate from the active-only target migration. The real baseline is currently saved as a source JSON file, not imported into an archive database.

For synthetic rehearsals or an explicitly needed source-reference archive:

```sh
node backend/tools/academy-migration.mjs archive-source \
  --snapshot .academy-migration/source.json \
  --database .academy-migration/reference.sqlite
node backend/tools/academy-migration.mjs verify-archive \
  --snapshot .academy-migration/source.json \
  --database .academy-migration/reference.sqlite
```

This importer uses native SQLite locally. It runs preflight before opening a destination, accepts only a dedicated archive database, imports a capture transactionally, and verifies every row checksum, reconstructed snapshot checksum, lookup index, count and foreign key. Repeating the same capture verifies and reuses it; it does not duplicate records. The SQL schema has also been applied in the local D1 emulator. This does not demonstrate a cloud import or exercise the future Worker binding adapter.

## Snapshot contract and limits

`maktab-academy-snapshot/v1` contains the environment, capture start/end, `ONLINE_NON_ATOMIC` consistency marker and ordered `workbooks`. Each workbook declares its kind, SpreadsheetID, optional CourseID, complete tab inventory and tab rows. Captures include all registry-mapped workbooks, including excluded ones needed for source comparison. The inclusion manifest controls what proceeds to migration.

Each tab retains its numeric sheet ID, exact title, value types and interior blank rows. Unknown tabs are captured rather than silently lost; their operational import requires review. The direct exporter reads whole-tab A1 ranges in sequential batches and stops on a 429. The connector capture used bounded rectangles derived from metadata, at a limited request pace. A failed remote capture is not emitted as a complete source snapshot.

These are **values snapshots**, matching the current application's formatted-value reads. They do not back up formulas, formatting, Drive files or an external service. Google Sheets does not provide a transaction spanning these workbooks; final migration requires a fresh capture under a coordinated write freeze or a verified change-capture process. Any direct Sheet editors must be accounted for before that point.

Staging rejects a serialized source row over 1,900,000 bytes to leave space below [D1's 2 MB row limit](https://developers.cloudflare.com/d1/platform/limits/). Whole-tab ranges follow [Google's A1 notation](https://developers.google.com/workspace/sheets/api/guides/concepts#cell).

## Verification

```sh
node --test backend/tests/academy-migration-preflight.test.mjs \
  backend/tests/academy-migration-policy.test.mjs
```

Tests cover 200 synthetic accounts across every fixture Program, exact value preservation, blank-row coordinates, identity/login collisions, missing source coverage, credential presence, broken account/class/publication references, unsupported roles, pending reviews, private CLI output, transactional rollback, corrupt archive detection, repeatable import and the explicit active/excluded Program policy. No live login burst was run.

[First real development report](ACADEMY-MIGRATION-REPORT-2026-10-09.md)
