# V105.3.1.1 — Academy curriculum subjects

Adds a separate shared Academy curriculum catalogue and a single Add subject flow for selecting or creating a subject. Administrators can review and import Reboot subject names, reuse duplicates, and explicitly map old Global-based Program links while preserving their levels, modules and published history. Reboot and Global Course records remain unchanged.

Catalogue preparation is automatic on the first create/import; no new Worker binding or Cloudflare migration is needed. [Setup, retry and acceptance](docs/V105.3.1.1-ACADEMY-SUBJECTS.md) includes the two-workbook save behavior and rollback limitations.

---

# V105.3.1 — Program management screens

Adds compact management grids for shared subject links, optional levels, modules, classes, teacher assignments and dated learner memberships. Saved rows feed the timetable directly. Includes Johannesburg-default timezone dropdowns, archive/reactivation, stale-edit checks and retry-safe management history. Existing Academy accounts are reused; central privileges and live Reboot data are unchanged.

Deploy matching frontend and Worker to the separate Development projects, then open **Manage Program → Prepare management tables**. No new Worker binding is needed. [Setup and acceptance](docs/V105.3.1-PROGRAM-MANAGEMENT.md) explains the new management snapshot reader and rollback constraints.

---

# Maktab4Life V105.2 — Program timetable builder

Version **105.2.0** extends V105.1 Program setup with a compact timetable grid, combined class audiences, recurring and one-off module lessons, dated exceptions, conflict checks, a linked weekly preview and explicit publication history.

Open `/programs/` as a central GLOBAL_ADMIN, select a saved new Program and choose **Open timetable**. Saving a draft leaves the published timetable unchanged. Timetable writes use a per-Program coordinator, durable recovery intent, immutable revisions and retry receipts; canonical data remains in Google Sheets. New Programs remain inactive for teaching, with Academy/student integration coming in V105.6.

- [Timetable setup, use and recovery](docs/V105.2-PROGRAM-TIMETABLE.md)
- [Implementation and live acceptance checklist](docs/V105.2-IMPLEMENTATION-CHECKLIST.md)
- [Schema and API contracts](docs/V105.2-SCHEMA-CONTRACTS.md)
- [Verification and screenshots](docs/V105.2-VERIFICATION.md)
- [V105.1 Program setup prerequisites](docs/V105.1-PROGRAM-SETUP.md)

This package is locally verified, **not deployed or live-accepted**. The Worker runtime entrypoint and Durable Object binding/migration must accompany the frontend. Minimal verified curriculum/class/teacher references are required for a real timetable. Full membership and curriculum editors remain V105.3/V105.4. V105.1 Program configuration changes still use one setup editor at a time; timetable edits are coordinated in V105.2.

Run `node scripts/program-builder-preview.mjs` and open `http://127.0.0.1:8105/programs/` for a synthetic local demonstration. No Google or cloud writes occur in the preview. The sample timetable link is available from Aalimiya’s Details panel. All preview data is reset when the preview server restarts.

Sequence: V105 Builder on Sheets → V106 Reboot migration on Sheets → later D1 migration → realistic capacity acceptance → wider rollout.
