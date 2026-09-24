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

# V104.5.4 Changes — Course / Academy Timetable UI Refinement

Built directly on the completed V104.5.3 baseline. Platform schema remains `102.0.12`; no Sheet migration is required.

- Global Course Academy pills now use immutable published **Course Name** as the primary label for both DERIVED and EXPLICIT Courses; linked Global Subject remains secondary detail.
- Added regression coverage proving published DERIVED Hifz remains visible across recurring Academy days without normal materialised session rows.
- Large detailed Academy pills now centre their content.
- A current authorised Zoom session colours the **entire timetable pill** with the Academy Zoom/brand treatment and shows the supplied Lucide link icon beside `Zoom`.
- Saved Courses now retain a visible Publish button even when currently ineligible; it is disabled with a muted berry treatment and reason tooltip. Unsaved local new-Course drafts remain the only rows without Publish because no RunID exists yet.
- DERIVED `Exceptions` action renamed to singular `Exception`.
- New recurring time slots remain blank and show `--h--` Start/End placeholders instead of `04h00` / `05h00`.
- Removed the large top-right `+ Another Time Slot` control; added a lightweight `+ Add another time slot` action beneath the rows.
- Replaced recurring-row X removal with the supplied Lucide `trash-2` icon.
- No Course architecture, access, Program Builder, schema, V104.3 deduplication or V104.4 read-budget changes.
- Worker/app version advanced to `104.5.4`.

Final V104.5.4 verification: **68/68 backend test files passed** and **160/160 repository JS/MJS syntax checks passed**. V104.4 read audit remains **23 direct-read call sites across 17 files; 15 batch-read call sites**.

---

# V104.5.3 Changes — Authoritative ONGOING Draft Publication Windows

Built directly on the verified V104.5.2 baseline.

- Fixed saved ONGOING DERIVED Courses showing `Draft · 0 derived occurrences` and no inline Publish action after reload even when Publish From/Through had been saved in the UI.
- Added authoritative `DraftPublishStartDate` and `DraftPublishEndDate` fields to `GlobalTimetableRunState`; the Platform schema advances from `102.0.11` to `102.0.12` while remaining at 19 tabs.
- The main Courses Save now persists ONGOING draft publication windows server-side and reloads them from the authoritative timetable state.
- DERIVED occurrence counting, Exceptions preparation and Publish eligibility now use the same saved window after reload.
- ONGOING publishing now uses the saved draft window and rejects a browser-supplied publish window that differs from authoritative state.
- Both ONGOING draft dates may be deliberately cleared together; partial, reversed or malformed windows are rejected.
- Platform validation rejects partial/reversed ONGOING windows and prevents FIXED Courses from carrying ONGOING draft-window state.
- Existing published ONGOING Courses are seeded from their current immutable publication window during the controlled `102.0.11 → 102.0.12` migration. Existing scheduling modes and publications are preserved.
- Added an exact Hifz regression: ONGOING + DERIVED + Mon–Thu + `2026-09-01 → 2026-09-01` derives exactly one Tuesday occurrence and can publish from saved state.
- Runtime schema compatibility for central auth, Academic Calendar, central-account migration and Global Timetable extends through `102.0.12`.
- No Program Builder, access-rule, Course-mode, V104.3 request-deduplication or V104.4 read-budget changes.
- Worker/app version advanced to `104.5.3`.

Final V104.5.3 verification: **67/67 backend test files passed** and **159/159 repository JS/MJS syntax checks passed**.

---

# V104.5.2 Changes — Platform Schema Compatibility Hotfix

Built directly on V104.5.1.

- Fixed the HTTP 503 on `/api/account/check` after the Platform workbook is migrated to `102.0.11`.
- Extended central account authentication/revalidation schema compatibility through `102.0.11`.
- Extended Academic Calendar schema compatibility through `102.0.11`.
- Extended the central account migration preview/verification guard through `102.0.11`.
- Added regression coverage for all three post-migration paths.
- No Sheet migration, business-rule, access-rule, Course scheduling, publication, cache or Program changes.
- Worker/app version advanced to `104.5.2`.
- Full backend regression: **65/65 test files passed**.
- Repository JS/MJS syntax: **157/157 files passed**.

---

# V104.5.1 Changes — Course Publish & Session UI Refinement

Built on the completed V104.5 DERIVED/EXPLICIT Course scheduling model.

- Course Name remains inline-editable but now renders as a modern lavender pill.
- Reworked Course-row actions into the requested visual hierarchy:
  - teal pencil + text `Schedule`;
  - teal pencil + text `Sessions` for EXPLICIT Courses or `Exceptions` for DERIVED Courses;
  - separate deep-berry `Publish` action.
- Tightened Publish visibility. The inline Publish control is now rendered only for saved, active, publishable Courses whose timetable is unpublished or in a saved revision state.
- Unsaved dirty Course/schedule/window rows no longer show a disabled Publish button; they show no Publish control until Save completes.
- Clean already-published Courses, inactive Courses, unsaved new Courses and non-publishable Courses show no Publish control.
- The Course row remains the **only** publishing surface.
- Removed the former session-workspace publish flow completely. Session editing now exposes only icon + text `Cancel` and `Save` actions.
- Added a stronger bordered/rounded Sessions/Exceptions card treatment.
- Added optional `SessionDescription` for EXPLICIT exact sessions, maximum 400 characters.
- `SessionDescription` is preserved through exact-session edits/reschedules and copied into immutable published session snapshots.
- Platform schema advances to `102.0.11` by adding `SessionDescription` to `GlobalTimetableSessions` and `PublishedGlobalTimetableSessions`.
- Controlled migration supports both `102.0.9 → 102.0.11` and an incremental `102.0.10 → 102.0.11` upgrade without changing current Course modes/publications.
- Added `docs/V104.5.1-IMPLEMENTATION-CHECKLIST.md` and a dedicated V104.5.1 UI regression gate.
- Worker/app version advanced to `104.5.1`.
- V104.3 request-local read deduplication and V104.4 read-budget guardrails remain unchanged.
- Final verification: **65/65 backend test files** and **157/157 repository JS/MJS syntax checks** passed.
