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
bound spreadsheet and configured Weekly Planner folder, then reads
`ProgramLibraryDriveFolderId` from `SystemConfig` and checks that the deploying
account can add files to that Library folder through the same Drive API token
used by uploads. It does not create a file. The Library upload itself uses the
folder selected in the UI and signed by the Worker.

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

## D1 device uploads (unreleased)

The repository bridge also accepts the signed `m4l-library-start-d1` purpose.
For that purpose, the Worker supplies the destination verified against D1;
Apps Script does not look it up in Sheets. The existing signed Sheets purpose
retains its current destination check. Neither path accepts an unsigned folder
or exposes the deploying account's Drive OAuth token to the browser.

Before enabling D1 uploads:

1. Synchronize the complete repository `code.gs` and `appsscript.json` to the
   correct Apps Script project and deploy that version. Verify that the current
   Worker's `APPS_SCRIPT_URL` identifies that deployment. The development-named
   Worker is the current main website; keep the legacy project separate.
2. Verify the existing `M4L_LIBRARY_BRIDGE_SECRET` matches between Worker and
   Script properties and is at least 32 characters. Do not put it into Git,
   a browser form, an example configuration or diagnostic output.
3. Have a Global Admin select each Program's D1 Library destination. The
   deploying Google account and Worker's Drive service account must have the
   required access. `authorizeM4LServices` checks its configured legacy folder;
   it does not establish access to every independently selected D1 folder.
4. In the isolated hosted test target, set
   `ACADEMY_D1_UPLOAD_BRIDGE=D1_V1` only after deploying the updated bridge.
   Verify a real Program Admin/Global Admin upload, its saved resource and
   protected reopening. Check rejection after account/authority revocation or
   a destination change. Use test folders for synthetic files.
5. Enable the same flag on the current main Worker only with the reviewed live
   D1 rollout. Without it, D1 device uploads remain disabled and existing Drive
   files can still be selected. Open Library cover uploads use R2 separately.

The [10 October reconciliation report](../docs/ACADEMY-D1-RECONCILIATION-2026-10-10.md)
records the current folder/deployment verification status. Source support and
passing bridge tests do not confirm that the hosted Apps Script has been updated.
