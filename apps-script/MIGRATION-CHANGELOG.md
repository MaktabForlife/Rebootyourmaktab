# Apps Script to Google Sheets Migration Ledger

Last updated: 2026-08-05

Latest production-verified milestone recorded in this repository: V98.12

Merged production baseline supplied for this build: V98.13

Development milestone: V98.14

The repository file `apps-script/code.gs` is the source of truth. The live
Google Apps Script project is a deployment target. Changes must be committed in
the repository first, then the complete file must be synchronized to Apps
Script and deployed as a new version. Any emergency dashboard edit must be
copied back to the repository before the next application change.

`apps-script/appsscript.json` is also authoritative. Development and Production
use the same manifest, including `USER_DEPLOYING`, `ANYONE_ANONYMOUS`, the
current-spreadsheet scope and the Drive scope.

This ledger records backend ownership at the operation level. Reads and writes
can migrate independently.

## Status definitions

- **DIRECT**: the Worker calls the Google Sheets API and owns the operation.
- **APPS SCRIPT**: the Worker invokes the live Apps Script project only for an
  operation that requires Google Drive.
- **DIRECT ONLY**: the operation has no callable Apps Script implementation.
- **REMOVED IN V98.14**: the V98.13 route was already direct-only and its
  retired Apps Script action, implementation and unreachable helpers were
  deleted by the audited V98.14 cleanup.

Historical entries below retain their original **ACTIVE ROLLBACK**,
**LEGACY ROLLBACK** and **RETIRED ROUTE** wording to describe the state at that
time.

## Seamless promotion rule

The development branch must contain the complete production-ready routing
configuration from the beginning. Migrated features remain explicitly selected
as `google-sheets` in both top-level `vars` and `env.development.vars` in
`backend/wrangler.jsonc`. V98.14 does not change those routing definitions.

## Current ownership after V98.14

| Area | Operation / Apps Script action | Worker ownership | Apps Script status |
|---|---|---:|---|
| Resources | `getStudentResources` | DIRECT ONLY | REMOVED IN V98.14 |
| Timetable | `getTimetable`, `updateTimetableZoomLink` | DIRECT ONLY | REMOVED IN V98.14 |
| Weekly Planner | records and archives | DIRECT ONLY | Not present |
| Weekly Planner | `saveWeeklyPlannerPreviewToDrive` | APPS SCRIPT | ACTIVE |
| Program Library | `startProgramLibraryUpload` | Signed Worker request; Apps Script owns Drive authorization | ACTIVE IN V105.4.1 |
| System configuration | UI read/write of approved keys | DIRECT ONLY | Read-only helper retained for Drive config |
| Attendance | all routed reads/writes | DIRECT ONLY | REMOVED IN V98.14 |
| Authentication | routed Student/Admin lookup, login and PIN operations | DIRECT ONLY | REMOVED IN V98.14 |
| Admin utilities | `registerAdmin`, `getAdminByUsername` | Future changes must use UI/Worker | REMOVED IN V98.14 |
| Progress | routed reads and status writes | DIRECT ONLY | REMOVED IN V98.14 |
| Progress | `getStudentTaskById` | Current UI uses direct Progress routes | REMOVED IN V98.14 |
| Student management | duplicate check, registration, search and update | DIRECT ONLY | REMOVED IN V98.14 |
| Curriculum | Subject/Task read/write | DIRECT ONLY | REMOVED IN V98.14 |
| Curriculum resources | Subject Resource read/write | DIRECT ONLY | REMOVED IN V98.14 |
| Task Resources | create/list/update | Future administration must use UI/Worker | REMOVED IN V98.14 |
| Task assignment | option reads and standalone assignment | DIRECT ONLY | REMOVED IN V98.14 |
| Task assignment | `populateAllStudentTasks` and manual population tests | One-time startup utility complete | REMOVED IN V98.14 |

The final Drive-only function dependency closure is recorded in
`apps-script/V98.14-AUDIT.md` and enforced by
`backend/tests/apps-script-cleanup.test.mjs`.

## Migrated operations

### Authentication

- Worker implementation: `backend/src/routes/auth-google-sheets.js`
- Router feature: `auth`
- Routes:
  - `/api/check-student`
  - `/api/setup-pin`
  - `/api/login`
  - `/api/admin/check-admin`
  - `/api/admin/setup-pin`
  - `/api/admin/login`
  - `/api/admin/reset-pin`
- Routing variable: `M4L_BACKEND_AUTH=google-sheets`
- Legacy rollback actions:
  - `getStudentByUniqueId`
  - `getStudentForLogin`
  - `setStudentPin`
  - `resetStudentPin`
  - `getAdminByUniqueId`
  - `setAdminPin`
- V98.11 changes only the record-access backend. Four-digit validation, PIN
  hashing with the existing Worker secret, strict active/PIN-setup checks,
  session-token issuance, public response fields and Student PIN-reset
  authorization remain unchanged.
- The direct route normalizes Google Sheets API formatted boolean text
  (`TRUE`/`FALSE`) before applying those strict active and PIN-setup checks,
  matching the boolean values returned by Apps Script `getValues()`.
- PIN hashes are used only inside the Worker and are never returned to the
  browser. Setup/reset writes target only the existing PIN setup, PIN hash and
  failed-attempt cells.
- Existing failed-attempt and last-login values are not newly updated because
  the legacy routed flow did not implement those writes.
- `registerAdmin` and `getAdminByUsername` had no current UI/Worker callers and
  were removed in the final V98.14 cleanup. Any future Admin-registration
  feature must be implemented through the authenticated UI and Worker.

### Resources read

- Worker implementation: `backend/src/routes/resources.js`
- Router feature: `resources`
- Routing variable: `M4L_BACKEND_RESOURCES=google-sheets`
- Legacy rollback action: `getStudentResources`
- Production verification: HTTP 200 with `X-M4L-Backend: google-sheets`.

### Timetable read

- Worker implementation: `backend/src/routes/timetable.js`
- Router feature: `timetable-read`
- Routing variable: `M4L_BACKEND_TIMETABLE_READ=google-sheets`
- Legacy rollback action: `getTimetable`
- Production verification: HTTP 200 with `X-M4L-Backend: google-sheets` and
  `X-M4L-Backend-Source: M4L_BACKEND_TIMETABLE_READ`.

### Timetable Zoom-link write

- Worker implementation: `backend/src/routes/timetable.js`
- Router feature: `timetable-write`
- Routing variable: `M4L_BACKEND_TIMETABLE_WRITE=google-sheets`
- Legacy rollback action: `updateTimetableZoomLink`
- Development verification: the Zoom link was written successfully through
  `devrebootworker`, with the build confirming the Google Sheets selection.
- The top-level and development Wrangler flags are both committed, allowing a
  normal merge to promote the same route to production.

### Attendance read

- Worker implementation: `backend/src/routes/attendance.js`
- Router feature: `attendance-read`
- Routes:
  - `/api/attendance/students`
  - `/api/attendance/report`
- Routing variable: `M4L_BACKEND_ATTENDANCE_READ=google-sheets`
- Legacy rollback actions:
  - `getStudentsForAttendance`
  - `getAttendanceReport`
- V98.2 preserves teacher group restrictions, active-student filtering,
  `SYSTEM1` maktab-day handling, duplicate absence de-duplication, group
  averages and attendance percentages.

### Attendance write

- Worker implementation: `backend/src/routes/attendance.js`
- Router feature: `attendance-write`
- Route: `/api/attendance/submit-absent`
- Routing variable: `M4L_BACKEND_ATTENDANCE_WRITE=google-sheets`
- Legacy rollback action: `submitAbsentStudents`
- V98.2 preserves required headers, existing and submitted duplicate checks,
  the South Africa timestamp, admin ID, absence rows and the mandatory
  `SYSTEM1` day-counter row.

### Curriculum read

- Worker implementation: `backend/src/routes/curriculum.js`
- Router feature: `curriculum-read`
- Routes:
  - `/api/admin/subjects/list`
  - `/api/admin/tasks/list`
- Routing variable: `M4L_BACKEND_CURRICULUM_READ=google-sheets`
- Legacy rollback actions:
  - `listSubjects`
  - `listTasks`
- Subject and task create/update routes use the separate `curriculum-write`
  feature documented below.

### Curriculum write

- Worker implementation: `backend/src/routes/curriculum.js`
- Router feature: `curriculum-write`
- Routes:
  - `/api/admin/subjects/create`
  - `/api/admin/subjects/update`
  - `/api/admin/tasks/create`
  - `/api/admin/tasks/update`
- Routing variable: `M4L_BACKEND_CURRICULUM_WRITE=google-sheets`
- Legacy rollback actions:
  - `createSubject`
  - `updateSubject`
  - `createTask`
  - `updateTask`
- V98.4 preserves the `SystemConfig` counters and the existing `SUBJ` and
  `TASK` identifiers, duplicate-name checks, positional row schemas and Apps
  Script response contracts.

### Curriculum-resource read

- Worker implementation: `backend/src/routes/curriculum.js`
- Router feature: `curriculum-resources-read`
- Route: `/api/admin/subject-resources/list`
- Routing variable:
  `M4L_BACKEND_CURRICULUM_RESOURCES_READ=google-sheets`
- Legacy rollback action: `listSubjectResources`
- Curriculum-resource create/update routes use the separate
  `curriculum-resources-write` feature documented below.

### Curriculum-resource write

- Worker implementation: `backend/src/routes/curriculum.js`
- Router feature: `curriculum-resources-write`
- Routes:
  - `/api/admin/subject-resources/create`
  - `/api/admin/subject-resources/update`
- Routing variable:
  `M4L_BACKEND_CURRICULUM_RESOURCES_WRITE=google-sheets`
- Legacy rollback actions:
  - `createSubjectResource`
  - `updateSubjectResource`
- V98.4 preserves the `NextResourceNumber` counter, `RES` identifiers,
  allowed resource types and the existing `SubjectResources` row schema.

### Student-management read

- Worker implementation: `backend/src/routes/student-management.js`
- Router feature: `student-management-read`
- Routes:
  - `/api/admin/check-student-duplicate`
  - `/api/admin/students/search`
  - `/api/admin/search-students`
  - `/api/admin/student/search`
- Routing variable:
  `M4L_BACKEND_STUDENT_MANAGEMENT_READ=google-sheets`
- Legacy rollback actions:
  - `searchStudents`
- V98.5 preserves search aliases, WhatsApp matching, `SYSTEM1` exclusion,
  group/name sorting and result limits. PIN hashes and other authentication
  fields are never returned.
- In V98.5, the standalone direct `check-student-duplicate` route was not yet
  used by registration. Registration and its shared duplicate validation were
  subsequently migrated through `student-management-write` in V98.9.

### Existing-student update

- Worker implementation: `backend/src/routes/student-management.js`
- Router feature: `student-management-update`
- Route: `/api/admin/update-student`
- Routing variable:
  `M4L_BACKEND_STUDENT_MANAGEMENT_UPDATE=google-sheets`
- Legacy rollback action: `updateStudent`
- V98.6 preserves the existing request validation and response contract.
- The direct route reads the current StudentRecords row and sends one targeted
  Sheets values batch request containing only supplied Username, WhatsApp,
  ClassGroup and Active cells.
- StudentID, UniqueID, PIN setup, PIN hash, failed attempts, dates and all
  StudentTasks data are not written by this route.
- At V98.6, registration remained on Apps Script because it also performed
  duplicate validation, identifier generation and initial task assignment.
  Those operations were subsequently migrated together in V98.9.

### Student registration

- Worker implementation: `backend/src/routes/student-registration.js`
- Router feature: `student-management-write`
- Route: `/api/admin/register-student`
- Routing variable:
  `M4L_BACKEND_STUDENT_MANAGEMENT_WRITE=google-sheets`
- Legacy rollback actions:
  - `registerStudent`
  - `checkStudentDuplicate`
- V98.9 preserves the existing duplicate rule, confirmed-duplicate username
  suffixing, `MAKTAB` and `STASK` counters, ten-character student link,
  StudentRecords row contract and registration-time assignment of active
  tasks.
- The route retains ADMIN/SENIOR authorization and uses the environment's
  student login base. Manual selected-module requests retain their existing
  fallback to all active tasks when no modules are supplied.
- At V98.9, the standalone `/api/admin/tasks/assign` action and population
  utilities remained on Apps Script. The standalone action is subsequently
  migrated in V98.10; population utilities remain active in Apps Script.

### Progress read

- Worker implementation: `backend/src/routes/progress-read.js`
- Router feature: `progress-read`
- Routes:
  - `/api/tasks/student`
  - `/api/progress/tasks`
  - `/api/progress/task-detail`
- Routing variable: `M4L_BACKEND_PROGRESS_READ=google-sheets`
- Legacy rollback actions:
  - `getStudentTasks`
  - `getTaskProgressReport`
  - `getTaskProgressDetail`
- V98.7 reads `StudentTasks`, `TaskList`, `SubjectList`, `StudentRecords` and,
  for student task cards, active `TaskResources` directly.
- The migration preserves student self-isolation, teacher assigned-group
  restrictions, active-student and Group 0 filtering, TaskList display
  ownership, module compatibility filtering, percentage calculations, sorting
  and response fields.
- V98.7 left completion and verification on Apps Script. V98.8 migrates those
  writes through the separate `progress-write` feature documented below.
- At V98.7, task assignment and Task Resource administration were not changed.

### Progress write

- Worker implementation: `backend/src/routes/progress-write.js`
- Router feature: `progress-write`
- Routes:
  - `/api/tasks/update-complete`
  - `/api/admin/tasks/verify`
- Routing variable: `M4L_BACKEND_PROGRESS_WRITE=google-sheets`
- Legacy rollback action: `updateStudentTaskStatus`
- V98.8 reads `StudentTasks` and `StudentRecords`, validates the complete batch
  before writing, then sends one targeted Google Sheets values batch request
  containing only the requested CompleteStatus/CompleteDate or
  VerifyStatus/VerifyDate cells.
- The migration preserves student self-only completion, teacher assigned-group
  restrictions, administrator verification, status normalization, clear-date
  behaviour, duplicate StudentTaskID protection, and all-or-nothing request
  validation.
- At V98.8, `getStudentTaskById`, task assignment, registration and Task
  Resource administration remained on Apps Script.

### Task-assignment options read

- Worker implementation: `backend/src/routes/student-management.js`
- Router feature: `task-assignment-read`
- Route: `/api/admin/students/assignment-options`
- Routing variable: `M4L_BACKEND_TASK_ASSIGNMENT_READ=google-sheets`
- Legacy rollback action: `getStudentAssignmentOptions`
- V98.5 reads `SubjectList`, optional `ModuleList`, and `TaskList` directly,
  preserving active filtering, General-module fallback, task counts and sort
  order.
- At V98.5, task assignment writes remained on the separate
  `task-assignment-write` Apps Script feature and did not read or modify
  `StudentTasks` through this read route.

### Standalone task-assignment write

- Worker implementation: `backend/src/routes/task-assignment.js`
- Router feature: `task-assignment-write`
- Route: `/api/admin/tasks/assign`
- Routing variable: `M4L_BACKEND_TASK_ASSIGNMENT_WRITE=google-sheets`
- Legacy rollback action: `assignTasksToStudents`
- V98.10 preserves ADMIN/SENIOR authorization, explicit student/task
  selections, whole-group and all-student selection, subject-wide task
  selection, strict boolean active filtering, duplicate skipping, the
  `NextStudentTaskNumber` counter, the existing ten-column StudentTasks row
  contract and response counters.
- `populateAllStudentTasks` was a one-time startup utility. It and its manual
  test helpers were removed in V98.14; future bulk assignment changes must use
  an authenticated UI/Worker operation.

### Weekly Planner

- Worker implementation: `backend/src/routes/weekly-planner.js`
- Router feature: `weekly-planner`
- Records and archives: direct Google Sheets only
- Preview PNG submission: Apps Script by design because it uses Google Drive
- No Planner record action was migrated from Apps Script.

### UI-managed system configuration

- Worker implementation:
  - `backend/src/lib/system-config.js`
  - `backend/src/routes/system-settings.js`
- Router feature: `system-settings`
- Routes:
  - `/api/admin/system-settings/get`
  - `/api/admin/system-settings/save`
- Routing variable: `M4L_BACKEND_SYSTEM_SETTINGS=google-sheets`
- The feature is direct Google Sheets only and is explicitly selected in both
  top-level production and development Wrangler variables.
- Only an authenticated account with the exact `ADMIN` role may read or write
  these settings. `SENIOR` and `TEACHER` accounts are rejected.
- The Worker uses an allowlist and can manage only these `SystemConfig` keys:
  - `StudentLoginBaseUrl`
  - `WeeklyPlannerDriveFolderId`
  - `WeeklyPlannerDriveFolderLabel`
- Existing identifier counters and all other `SystemConfig` rows are outside
  the route's write scope.
- The folder input accepts either a Google Drive folder URL or its folder ID;
  only the extracted ID is stored. The Apps Script Drive action derives the
  folder URL and accesses the folder with `DriveApp`.
- The sheet stores operational configuration only. Worker credentials,
  service-account JSON and session secrets remain Cloudflare secrets and must
  never be entered through the UI.
- During the first V98.12 promotion, `M4L_STUDENT_LOGIN_BASE` remains in
  Wrangler solely as a registration/search fallback until each environment's
  `SystemConfig` row has been seeded. The direct code always prefers the sheet.
  Remove the fallback in a later release after Development and Production are
  both verified.
- The V98.12 Apps Script source intentionally has no hard-coded fallback for
  the login URL or Drive folder. Save both values through System Settings in
  the target environment before deploying that Apps Script version.

#### V98.12 environment deployment sequence

For each environment, keep the currently working Apps Script deployment active
while seeding the new settings:

1. deploy the V98.12 Worker and Pages files;
2. sign in with an `ADMIN` account and save System Settings;
3. reload the screen and confirm all settings are read from `SystemConfig`;
4. synchronize the full repository `apps-script/code.gs` to that environment's
   Apps Script project and deploy a new version;
5. verify Student registration/search generates the correct login URL;
6. submit one Weekly Planner preview and confirm it reaches the configured
   Drive folder.

Complete and verify this sequence in Development before repeating it in
Production.

## Change history

### 2026-10-02 — V105.4.1.3

- Added signed `copyProgramLibraryFile` for files shared with the Library Google account.
- Device uploads and copies now use `ProgramLibraryDriveFolderId` from SystemConfig as their fixed destination.
- The Worker restricts destination changes to global administrators and preserves previous folder IDs for existing resources.

### 2026-10-02 — V105.4.1.2

- Aligned the bridge milestone with the Library upload form fix. Apps Script
  upload behavior is unchanged in this patch.

### 2026-10-02 — V105.4.1.1

- Aligned the Apps Script milestone with the Library, Pages and Worker release
  version. The upload action and authorization flow are unchanged in this patch.

### 2026-10-01 — V105.4.1

- Added the signed `startProgramLibraryUpload` Drive action for device uploads
  to the deploying account's My Drive folder. Apps Script starts a resumable
  session; the Worker validates and relays file chunks. The OAuth token remains
  in Apps Script.
- Added `script.external_request` to the manifest. Development requires a
  matching `M4L_LIBRARY_BRIDGE_SECRET` in Worker secrets and Apps Script Script
  properties. The historical V98.14 one-action audit below remains the record
  of that earlier release.

### 2026-08-05 — V98.14

- Removed all 31 retired migration actions and their dependency-only helpers
  after tracing the complete Apps Script call graph.
- Completed the final utility decision: removed Admin registration/lookup, Task
  Resource create/list/update, the one-time `populateAllStudentTasks` utility
  and tests, and the unused `getStudentTaskById` compatibility lookup.
- Reduced `apps-script/code.gs` from 5,716 lines to 257 lines.
- Retained exactly one callable action: `saveWeeklyPlannerPreviewToDrive`.
- Retained only its read-only SystemConfig/Drive dependency closure and the
  manual `authorizeM4LServices` authorization check.
- Confirmed Apps Script contains no Google Sheets mutation operation. New data
  features must be implemented through the authenticated UI and Worker.
- Removed duplicate Task Resource helpers and dead Worker-style request handlers
  embedded in the historical Apps Script source.
- Left the V98.13 Worker direct Google Sheets routing unchanged.
- Added `apps-script/V98.14-AUDIT.md` and
  `backend/tests/apps-script-cleanup.test.mjs` to enforce the exact function
  closure, one-action allowlist, no-Sheets-write boundary and OAuth scopes.
- Deployment remains gated on recording the live V98.13 production verification
  because repository tests cannot prove Student/Admin login or Drive writes in
  Production.

### 2026-08-05 — V98.13

- Retired the selectable Apps Script fallback for every feature whose direct
  Google Sheets route has passed Development and Production verification.
- Made Authentication, Attendance, Resources, Timetable, Student Management,
  Curriculum, Curriculum Resources, Task Assignment and Progress direct-only
  in the routing definitions and route table.
- Kept every explicit `M4L_BACKEND_*=google-sheets` value in both production
  and development Wrangler configuration so deployed intent remains visible
  and seamless branch promotion remains unchanged.
- Preserved the Apps Script-only Weekly Planner Drive action and
  `APPS_SCRIPT_URL`; saving the preview PNG still uses the active Apps Script
  deployment and UI-managed Drive folder.
- Left `apps-script/code.gs` executable logic unchanged for an observation
  period. The retired functions remain available only if the V98.12 Worker is
  restored; they are no longer callable through the V98.13 Worker router.
- Replaced fallback-success tests with explicit rejection tests for all 17
  retired feature routes while retaining the complete direct-route test suite.
- Changed migration rollback procedure: a retired feature can no longer be
  rolled back by setting its flag to `apps-script`; restore the V98.12 Worker
  version/source instead.

### 2026-08-02 — V98.12

- Added an ADMIN-only System Settings screen for the Student login base URL and
  Weekly Planner Google Drive destination.
- Added direct Google Sheets read/write routes for the three approved
  `SystemConfig` keys, with input validation, duplicate-key detection and
  update audit metadata.
- Added `M4L_BACKEND_SYSTEM_SETTINGS=google-sheets` to both Wrangler
  environments so promotion remains a normal Development-to-Production merge.
- Changed direct Student registration/search to prefer
  `StudentLoginBaseUrl` from `SystemConfig`; retained the current Wrangler value
  only as a temporary first-deployment fallback.
- Removed the Student login URL from browser configuration and made student
  management use the login URL returned by the API.
- Removed hard-coded login and Weekly Planner Drive destinations from the Apps
  Script source of truth. Active and rollback Apps Script functions now read
  the same UI-managed `SystemConfig` rows.
- Added the identical live Development/Production `appsscript.json` to the
  repository, preserving its timezone, web-app execution identity and access
  while explicitly declaring current-spreadsheet and Drive scopes.
- Replaced the file-creating `testDriveAccess` utility with
  `authorizeM4LServices`, which performs the one-time authorization/access check
  without writing a test file to the configured folder.
- Added automated coverage for strict ADMIN authorization, allowlisted writes,
  validation, counter isolation, routing headers, Student registration/search
  use of the sheet value and both production/development routing flags.

### 2026-08-01 — V98.11

- Migrated all seven routed Student/Admin authentication endpoints to direct
  Google Sheets access.
- Enabled both Apps Script and Google Sheets handlers for the `auth` routing
  feature.
- Added `M4L_BACKEND_AUTH=google-sheets` to both production and development
  Wrangler variables for seamless branch promotion.
- Preserved request validation, PIN hashing, strict boolean checks, response
  messages/statuses, token claims and Admin/SENIOR Student-PIN-reset permission.
- Kept PIN hashes out of browser responses and limited direct writes to the
  same authentication fields used by Apps Script.
- Left `registerAdmin` and `getAdminByUsername` active in Apps Script because
  they are not routed by the Worker.
- Marked only the six migrated Apps Script data actions as legacy rollback,
  without changing their executable logic.
- Added automated tests for Student/Admin checks, setup, login, reset,
  permissions, disabled and unconfigured accounts, incorrect PINs, missing
  sheets, routing headers, token claims, sensitive-field isolation and Apps
  Script fallback.
- Corrected direct Sheets boolean parity after development verification showed
  both Student and Admin `Active` cells arriving as formatted `TRUE`/`FALSE`
  text rather than JavaScript booleans.

### 2026-08-01 — V98.10

- Migrated `/api/admin/tasks/assign` to direct Google Sheets access.
- Enabled both Apps Script and Google Sheets handlers for the
  `task-assignment-write` routing feature.
- Added `M4L_BACKEND_TASK_ASSIGNMENT_WRITE=google-sheets` to both production
  and development Wrangler variables for seamless branch promotion.
- Preserved the existing selection modes, strict active-record checks,
  duplicate and invalid-record counters, `STASK` identifier allocation,
  ten-column row layout and response contract without changing business logic.
- Left `populateAllStudentTasks` and related population utilities active in
  Apps Script and outside this migration.
- Marked only `assignTasksToStudents` as legacy rollback in the repository Apps
  Script source of truth without changing its executable logic.
- Added automated tests for explicit, whole-group, all-student and subject-wide
  selection, permissions, counters, fixed row layout, missing data, routing
  headers and Apps Script fallback.

### 2026-08-01 — V98.9

- Migrated `/api/admin/register-student` to direct Google Sheets access.
- Enabled both Apps Script and Google Sheets handlers for the
  `student-management-write` routing feature.
- Added `M4L_BACKEND_STUDENT_MANAGEMENT_WRITE=google-sheets` to both production
  and development Wrangler variables for seamless branch promotion.
- Preserved registration duplicate confirmation, username suffixing, student
  and StudentTask identifiers, row schemas, active-task filtering and response
  fields without changing registration business logic.
- At V98.9, standalone task assignment, population utilities, compatibility
  lookup, authentication and Task Resource administration remained on Apps
  Script. V98.10 subsequently migrates only the standalone assignment route.
- Marked `registerStudent` and `checkStudentDuplicate` as legacy rollback in the
  repository Apps Script source of truth without changing executable logic.
- Added automated tests for registration, duplicate no-write behaviour,
  confirmation, selected-module filtering, initial task assignment, routing
  headers, authorization, missing sheets and Apps Script fallback.

### 2026-08-01 — V98.8

- Migrated existing StudentTasks completion and verification writes to the
  direct Google Sheets API.
- Enabled both Apps Script and Google Sheets implementations for the
  `progress-write` routing feature.
- Added `M4L_BACKEND_PROGRESS_WRITE=google-sheets` to both production and
  development Wrangler variables for seamless branch promotion.
- Preserved student, teacher and administrator authorization boundaries and
  the existing status normalization and response contracts.
- Kept each validated batch all-or-nothing and limited the Sheets request to
  the affected status/date cells.
- Kept `getStudentTaskById`, task assignment, registration and Task Resource
  administration on Apps Script.
- Marked `updateStudentTaskStatus` as legacy rollback in the repository Apps
  Script source of truth without changing its executable logic.
- Added automated tests for completion, verification, clearing, permissions,
  duplicate IDs, missing records and sheets, routing headers, targeted ranges,
  Apps Script fallback and no-partial-write validation.

### 2026-08-01 — V98.7

- Migrated student task loading and both Progress report endpoints to direct
  Google Sheets reads.
- Split Progress routing into dual-backend `progress-read` and Apps Script-only
  `progress-write` features.
- Added `M4L_BACKEND_PROGRESS_READ=google-sheets` to both production and
  development Wrangler variables for seamless branch promotion.
- Preserved student and teacher authorization boundaries and the existing
  Progress response contracts.
- Kept completion, verification, task assignment, `getStudentTaskById` and all
  Task Resource administration logic on Apps Script.
- Marked only the three migrated read actions as legacy rollback in the
  repository Apps Script source of truth.
- Added automated tests for all five direct sheet reads, joins, filters,
  resources, reports, missing sheets, routing headers, Apps Script fallback and
  write isolation.

### 2026-07-30 — V98.6

- Migrated only `/api/admin/update-student` to a direct Google Sheets handler.
- Added the independent dual-backend `student-management-update` feature and
  `M4L_BACKEND_STUDENT_MANAGEMENT_UPDATE` routing flag.
- Added the Google Sheets values batch-update client operation so non-adjacent
  student cells are committed together without rewriting PIN or identity data.
- Added the direct flag to both production and development Wrangler variables,
  preserving seamless promotion by a normal branch merge.
- Kept `registerStudent`, its duplicate validation and StudentTasks population
  on the Apps Script-only `student-management-write` feature.
- Marked only `updateStudent` as a legacy rollback action in the repository
  Apps Script source of truth.
- Added tests for targeted cells, response parity, validation, authorization,
  no-change requests, missing students, routing headers and Apps Script
  fallback.

### 2026-07-30 — Apps Script source-of-truth transition

- Made repository `apps-script/code.gs` the authoritative source.
- Defined the Apps Script dashboard as a deployment target only.
- Added comment-only legacy rollback markers to every action currently routed
  through direct Google Sheets.
- Kept authentication, Student Management writes, registration duplicate
  checking, Task Resource administration, StudentTasks operations and Weekly
  Planner Drive submission explicitly active.
- Corrected the V98.5 record: student search and assignment-option reads are
  direct, while registration duplicate checking remains active in Apps Script.
- No executable Apps Script logic was changed.

### 2026-07-28 — V98.5

- Added direct Google Sheets handlers for a standalone student duplicate check,
  student search and assignment-option loading.
- Split Student Management into independent read and write routing features.
- Split Task Assignment into independent read and write routing features.
- Added `M4L_BACKEND_STUDENT_MANAGEMENT_READ=google-sheets` and
  `M4L_BACKEND_TASK_ASSIGNMENT_READ=google-sheets` to both top-level production
  variables and the development environment.
- Added environment-specific `M4L_STUDENT_LOGIN_BASE` values so search results
  retain the correct production or development student link.
- Kept student registration, student updates and task-assignment writes on Apps
  Script, with no direct access to `StudentTasks` in this migration.
- Retained student search and assignment-option Apps Script actions as rollback
  paths. The duplicate-check function remains active because registration uses
  it directly.
- Added automated tests for transformation parity, search aliases, duplicate
  suggestions, sensitive-field exclusion, authorization, routing headers,
  missing sheets, Apps Script fallback and write isolation.

### 2026-07-28 — V98.4

- Added direct Google Sheets create/update handlers for Subjects, Tasks and
  Subject Resources.
- Enabled both Apps Script and Google Sheets handlers for `curriculum-write`
  and `curriculum-resources-write`.
- Added `M4L_BACKEND_CURRICULUM_WRITE=google-sheets` and
  `M4L_BACKEND_CURRICULUM_RESOURCES_WRITE=google-sheets` to both top-level
  production variables and the development environment.
- Retained all six live Apps Script write actions as rollback paths.
- Preserved the existing `SystemConfig` counters, ID prefixes, validation,
  duplicate detection, row order and response shapes.
- Writes that update several fields are validated first and committed as one
  complete row update, avoiding a partially updated row when validation fails.
- Added automated tests for authorization, direct creates and updates, counter
  increments, appends, duplicate prevention, routing headers, validation and
  Apps Script fallback.

### 2026-07-28 — V98.3

- Added direct Google Sheets list handlers for Subjects, Tasks and Subject
  Resources.
- Split curriculum and curriculum-resource routing into independent read and
  write features.
- Kept all curriculum create/update operations on Apps Script.
- Added `M4L_BACKEND_CURRICULUM_READ=google-sheets` and
  `M4L_BACKEND_CURRICULUM_RESOURCES_READ=google-sheets` to both top-level
  production variables and the development environment.
- Retained `listSubjects`, `listTasks` and `listSubjectResources` in the live
  Apps Script project as rollback paths.
- Added automated tests for transformation parity, filtering, authorization,
  missing sheets, routing headers, Apps Script fallback and write isolation.

### 2026-07-28 — V98.2

- Added direct Google Sheets handlers for Attendance student lists, reports and
  absent-student submission.
- Split Attendance routing into `attendance-read` and `attendance-write` so
  reads and writes can be diagnosed or rolled back independently.
- Enabled both Apps Script and Google Sheets handlers for both routing features.
- Added `M4L_BACKEND_ATTENDANCE_READ=google-sheets` and
  `M4L_BACKEND_ATTENDANCE_WRITE=google-sheets` to both top-level production
  variables and the development environment in `backend/wrangler.jsonc`.
- Retained the live Apps Script Attendance actions as rollback paths.
- Added automated parity tests for filtering, authorization, reporting,
  duplicate protection, header creation, direct appends and Apps Script
  fallback routing.

### 2026-07-28 — V98.1

- Added the direct Google Sheets global Timetable Zoom-link write.
- Enabled dual Apps Script and Google Sheets handlers for `timetable-write`.
- Committed the routing flag in both top-level and development Wrangler
  variables so production promotion required only the branch merge.
- Verified the direct write in development.
- Retained `updateTimetableZoomLink` in Apps Script as rollback.

### 2026-07-20 — V97.1.3

- Activated direct timetable reads in production.
- Verified production routing, Apps Script connectivity, Resources, timetable
  reads and Weekly Planner with five HTTP 200 checks.

### 2026-07-20 — V97.1.2

- Made Wrangler the source of truth for environment-specific plaintext
  configuration.
- Restored explicit production/development Apps Script URLs and spreadsheet IDs.
- Kept encrypted service-account, PIN and session values in Cloudflare secrets.

### 2026-07-19 — V97

- Activated direct Resources reads.
- Retained `getStudentResources` as the rollback implementation.

## Required migration procedure

For a future operation that still begins in Apps Script:

1. Record reads and writes separately in this ledger.
2. Compare the direct implementation with the repository Apps Script source of
   truth.
3. Add the direct Worker handler without removing the Apps Script handler.
4. During parity testing only, make the routing feature dual-backend and keep
   Apps Script as its code-level default.
5. In the same development commit, explicitly set the new Google Sheets routing
   flag in both top-level `vars` and `env.development.vars`.
6. Add automated parity, authorization, routing and error-path tests.
7. Deploy development with `npm run deploy:development`, which selects
   `--env development`.
8. Confirm the Cloudflare build lists the expected routing flag and the
   development spreadsheet ID.
9. Functionally test the direct route and confirm:
   - `X-M4L-Backend: google-sheets`
   - `X-M4L-Backend-Source` names the expected routing variable.
10. Merge development into `main` without editing any migration file or
    Cloudflare variable.
11. Wait for both Pages and Worker production deployments to finish, then test
    the same operation against production.
12. Mark the Apps Script action **LEGACY ROLLBACK** only after production passes.
13. After an agreed observation period, remove the Apps Script handler from the
    route map, make the feature Google-Sheets-only, add rejection coverage and
    mark the action **RETIRED ROUTE**.
14. Remove an Apps Script `doPost` action and function together only in a later
    audited cleanup release.

For the routes retired in V98.13, setting a routing flag to `apps-script` still
returns a routing configuration error by design. V98.14 has now removed their
Apps Script implementations. Emergency rollback therefore requires restoring a
matched historical pair: the V98.12 Worker source and the pre-cleanup V98.13
Apps Script source. Do not mix a historical Worker fallback with the V98.14
narrow Apps Script bridge.
