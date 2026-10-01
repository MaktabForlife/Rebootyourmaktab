# Apps Script source of truth

The files in `apps-script/` are the authoritative Apps Script source:

- `code.gs` — the Weekly Planner and V105.4 Program Library Google Drive bridge;
- `appsscript.json` — runtime, web-app access and OAuth scopes;
- `MIGRATION-CHANGELOG.md` — operation-level ownership ledger;
- `V98.14-AUDIT.md` — final action and dependency audit.

The Google Apps Script project is a deployment target, not an independent
editing source.

## Final V98.14 boundary

All application data reads and writes are managed through the M4L UI and
authenticated Cloudflare Worker routes using the Google Sheets API.

Apps Script exposes two `doPost` actions:

- `saveWeeklyPlannerPreviewToDrive`
- `startProgramLibraryUpload` (requires a signed Worker request)

The first action saves the Weekly Planner PNG to Google Drive. Its only Sheets access
is a read of the UI-managed `WeeklyPlannerDriveFolderId` and
`WeeklyPlannerDriveFolderLabel` values in `SystemConfig`.

The Library action starts a resumable Google Drive upload as the deploying
account. Its OAuth token remains in Apps Script. A shared 32-character-or-longer
secret must be set in the Development Worker as `M4L_LIBRARY_BRIDGE_SECRET`
and in Development Apps Script Script properties under the same name. The
Worker validates the administrator, Program and selected folder before signing
the request. No Library upload is accepted when this secret is missing.

`authorizeM4LServices` is the only manual function. It confirms access to the
bound spreadsheet and configured Drive folder without creating a file.

Apps Script no longer contains Admin registration/lookup, Task Resource
administration, StudentTask lookup, task-population, or other Sheets
maintenance utilities. New Sheets features must be built in the UI and Worker.

## Normal change workflow

1. Update the repository Apps Script files in the development branch.
2. Run `npm run test:apps-script-cleanup` from `backend/`, followed by the full
   backend test suite.
3. Synchronize the complete `code.gs` and `appsscript.json` files to the
   Development Apps Script project.
4. Create or update the Apps Script deployment and verify Development.
5. Merge the same repository commit to `main` without individual file edits.
6. Synchronize and deploy Production Apps Script only after the V98.13
   production verification gate is recorded.

## Drive authorization

The manifest keeps current-spreadsheet access because the bridge reads its Drive
destination from `SystemConfig`; it keeps Google Drive access to create the PNG
and start Library uploads. `script.external_request` allows Drive API upload
initialization.
Run `authorizeM4LServices` once in each Apps Script project when scopes are first
introduced, revoked or changed.

Changing the folder through `Admin > System Settings` does not require a
manifest edit or another authorization, provided the deploying Google account
can edit the new folder.

Do not maintain an independent dashboard version. Copy any emergency dashboard
edit back into the repository before the next change.
