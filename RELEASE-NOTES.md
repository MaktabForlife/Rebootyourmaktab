# V105.3.1 — Program management screens

The account sign-in badge and both frontend version files now report V105.3.1 consistently with the management screens and Worker.

Adds compact management grids for shared subject links, optional levels, modules, classes, teacher assignments and dated learner memberships. Saved rows feed the timetable directly. Includes Johannesburg-default timezone dropdowns, archive/reactivation, stale-edit checks and retry-safe management history. Existing Academy accounts are reused; central privileges and live Reboot data are unchanged.

Deploy matching frontend and Worker to the separate Development projects, then open **Manage Program → Prepare management tables**. No new Worker binding is needed. [Setup and acceptance](docs/V105.3.1-PROGRAM-MANAGEMENT.md) explains the new management snapshot reader and rollback constraints.

---

# V105.2 — Program timetable builder (105.2.0)

Adds module lessons with optional levels, one or multiple class audiences, recurring/one-off patterns, cancellation/move exceptions and a bounded publication window. The compact grid offers keyboard saving, teacher/class/known-learner conflict feedback, linked weekly preview and explicit immutable publication history.

Canonical data remains in Sheets. Timetable saves and publication use a per-Program Durable Object coordinator with fresh authority checks, a durable pending intent, atomic Sheets revision/snapshot/receipt writes and retry-safe recovery. Append-only state revisions prevent delayed old writes from replacing a newer draft or published pointer. Existing Reboot and Global Course paths remain isolated.

This is a local implementation package; Development deployment and real-data acceptance remain pending. Deploy the new runtime entrypoint and coordinator binding/migration with the frontend. Full membership/curriculum management remains V105.3/V105.4 and student Academy integration remains V105.6. See [verification](docs/V105.2-VERIFICATION.md) and [setup/recovery](docs/V105.2-PROGRAM-TIMETABLE.md).

---

# V105.1 — Program setup (105.1.0)

Adds a platform-only Program registration/configuration grid and recoverable spreadsheet preparation on the V104.5.4 baseline. Reuses CourseRegistry and central accounts. Duration and optional timezone are separate from curriculum levels. New Programs remain inactive; mappings cannot be changed from this screen.

Includes service/repository boundaries, atomic Platform registry/definition/audit writes, sequential stale-edit checks, preserved failed input, keyboard saving and responsive grid controls. Setup currently requires a single editor; simultaneous request coordination remains outstanding.

Local verification: 69/69 backend test files and 167/167 syntax checks passed. No live deployment or Aalimiya registration has been performed. See [setup/recovery](docs/V105.1-PROGRAM-SETUP.md) and [stage acceptance](docs/V105.1-IMPLEMENTATION-CHECKLIST.md).

---

# V104.5.4 Release Notes — Course / Academy Timetable UI Refinement

V104.5.4 is a code/UI-only refinement on V104.5.3. Platform schema remains `102.0.12`; **no migration is required**.

## Academy timetable

Global Course items now identify the **Course**, not merely the linked Global Subject. EXPLICIT `History of the Quran` therefore displays `History of the Quran` even when its linked Global Subject is `Tafseer & Tadabbur`. The published immutable RunName is preferred so later draft renames do not rewrite historical/current publication labels.

The Hifz derived path is explicitly regression-protected across multiple Academy days. Large detailed pills are centred. When a current relevant session has an authorised Zoom link, the entire pill takes the Academy purple Zoom treatment and the `Zoom` label includes the supplied Lucide link icon.

## Course publishing

The inline Course row remains the single publication surface. For every persisted Course, Publish stays visible. It is enabled only when the saved Course is currently publishable; otherwise it remains visible but disabled and explains why through its tooltip. Unsaved local `+ Add Course` drafts still omit Publish until first Save creates a RunID.

## Recurring schedule UI

- `Exceptions` → `Exception`;
- blank new Start/End values with `--h--` placeholders;
- lower-left `+ Add another time slot` action;
- supplied Lucide `trash-2` row-delete icon;
- no large top-right Add Time Slot action.

## Regression

V104.3 request-level read deduplication and V104.4 Sheets read budgets remain unchanged, and V104.5.3 ONGOING draft-window behaviour remains green.

Final verification: **68/68 backend test files passed**, **160/160 JS/MJS syntax checks passed**, and the V104.4 read audit remains **23 direct-read call sites across 17 files / 15 batch-read call sites**.

See `docs/V104.5.4-IMPLEMENTATION-CHECKLIST.md`.

---

# V104.5.3 Release Notes — ONGOING Draft Publication Window Fix

V104.5.3 corrects the ONGOING Course draft-state defect exposed by a saved DERIVED Hifz Course that still showed `Draft · 0 derived occurrences` and no Publish button.

## Root cause

V104.5.1/5.2 displayed ONGOING Publish From/Through values on the Course row, but `courseDraftFromRun()` reloaded them as blank because no authoritative draft-window fields existed in the timetable state. The browser could preserve the values temporarily after Save, but a subsequent server reload had no persisted window to return.

That meant the UI, derived-occurrence calculation and publication eligibility could disagree about what had actually been saved.

## Fix

Platform schema **102.0.12** adds two columns to `GlobalTimetableRunState`:

- `DraftPublishStartDate`
- `DraftPublishEndDate`

The Courses Save writes those fields for ONGOING Courses. Delivery reload returns them. DERIVED occurrence calculation and inline Publish eligibility therefore consume the same authoritative state.

The publish endpoint also reads the saved state and rejects a supplied ONGOING window that differs from it. This prevents publishing unsaved date changes.

## Validation and migration

The controlled Course scheduling migration supports `102.0.9`, `102.0.10` and `102.0.11` as source schemas and targets `102.0.12`. No tabs are added. Existing Course scheduling modes and publications are preserved.

When migrating an existing published ONGOING Course, the current publication's Publish From/Through dates seed the new draft fields. Unpublished ONGOING dates from V104.5.2 were not persisted anywhere authoritative, so those dates must be entered and saved once after migration.

Platform validation now requires draft dates to be either both blank or both valid/increasing for ONGOING Courses, and rejects draft-window values on FIXED Courses.

## Regression protection

The exact observed scenario is covered: an ONGOING DERIVED Hifz Course scheduled Mon–Thu from 04h00–05h00 with a one-day window of 1 September 2026 derives exactly one Tuesday occurrence after Save/reload and publishes from that saved window.

V104.3 request-level Sheets read deduplication and V104.4 read-budget regression remain unchanged.

See `docs/V104.5.3-ONGOING-DRAFT-PUBLICATION-WINDOW.md`.

Final V104.5.3 verification: **67/67 backend test files passed**, **159/159 repository JS/MJS syntax checks passed**, V104.4 read audit unchanged, and V104.3 request-read deduplication passed.

---

# V104.5.2 Release Notes — Platform Schema Compatibility Hotfix

V104.5.2 fixes a post-migration compatibility regression in V104.5.1. The Course scheduling migration correctly moves `PlatformSchemaVersion` to `102.0.11`, but older central-auth and Academic Calendar guards still rejected schemas above `102.0.9`.

The browser symptom is typically:

```text
Failed to load resource: the server responded with a status of 503 (check, line 0)
```

The `check` resource is `/api/account/check`. V104.5.2 updates the runtime guards so the current `102.0.11` Platform schema remains accepted across central account authentication/revalidation, Academic Calendar administration and central-account migration verification.

This is a **code-only hotfix**. There are no new Sheet columns or tabs and no migration should be rerun. Existing V104.5/V104.5.1 DERIVED/EXPLICIT Course behaviour, inline publishing rules, session descriptions, V104.3 request deduplication and V104.4 read budgets are unchanged.

Verification: **65/65 backend test files passed** and **157/157 JS/MJS syntax checks passed**.

See `docs/V104.5.2-SCHEMA-COMPATIBILITY-HOTFIX.md`.

---

# V104.5.1 Release Notes — Course Publish & Session UI Refinement

V104.5.1 is a focused refinement of the completed V104.5 DERIVED/EXPLICIT Global Course architecture. It does not change the Course scheduling model; it clarifies how Courses are edited, prepared and published.

## Course table presentation

Course Name remains inline-editable but is presented as a soft lavender pill so the Course identity is visually distinct from metadata fields.

The action area now follows one consistent hierarchy:

```text
[ ✎ Schedule ]   [  PUBLISH  ]
[ ✎ Sessions ]
```

DERIVED Courses use `Exceptions` instead of `Sessions`. Schedule/Sessions/Exceptions use a muted teal treatment; Publish uses a stronger deep-berry treatment.

## Publish only when eligible

The inline Course row is the only publishing surface.

Publish is shown only when the Course:

- has been saved and has a RunID;
- is ACTIVE;
- has a publishable schedule;
- has no unsaved Course/schedule/window changes;
- is currently unpublished or is in a saved DEVELOPMENT revision;
- has a valid Publish From/Publish Through window when ONGOING.

A clean already-published Course shows no Publish action. An inactive Course shows none. Unsaved edits show none; after the main Course Save completes, the existing revision workflow leaves the Course in DEVELOPMENT and Publish becomes available again.

## Session workspace

Publishing has been removed from the Sessions/Exceptions workspace. The workspace is preparation-only and now has two edit actions:

- **Cancel** — discard unsaved session changes;
- **Save** — persist session changes without publishing.

Both use icon + text controls, and the full session workspace now has a clear rounded border so it reads as a distinct editing card.

## Optional EXPLICIT session description

EXPLICIT dated sessions now support an optional `SessionDescription` up to 400 characters.

The description:

- is edited on the exact session;
- is not part of DERIVED recurring rules;
- survives normal exact-session edits and rescheduling;
- is copied into `PublishedGlobalTimetableSessions` as part of the immutable publication snapshot;
- is returned in detailed Academy Global Course session data for downstream display/marketing use.

## Schema migration

Platform schema is now `102.0.11`. No new Platform tabs are created; the required tab count remains 19.

Two existing session tables gain one final column:

- `GlobalTimetableSessions.SessionDescription`
- `PublishedGlobalTimetableSessions.SessionDescription`

The controlled migration supports both cases:

- `102.0.9 → 102.0.11`: performs the V104.5 scheduling migration and preserves all pre-V104.5 Courses as EXPLICIT;
- `102.0.10 → 102.0.11`: adds SessionDescription storage while preserving the existing DERIVED/EXPLICIT modes and publications.

## Compatibility

V104.5.1 does not change Program timetable rules, Course access, Central Identity, Attendance, Progress, Library, Planner, Academy access decisions or data ownership.

The V104.3 request-level read cache/deduplication and V104.4 Sheets read-budget guardrails remain regression-protected.

## Final verification

- Full backend regression: **65/65 test files passed**.
- Repository JavaScript/ES module syntax: **157/157 files passed**.
- V104.5.1 Publish-eligibility/session-UI regression passed.
- V104.5 DERIVED/EXPLICIT workshop + per-session-description regression passed.
- V104.4 read audit retained: **23 direct-read call sites across 17 files; 15 batch-read call sites**.
- V104.3 request-level Google Sheets read deduplication regression passed.
