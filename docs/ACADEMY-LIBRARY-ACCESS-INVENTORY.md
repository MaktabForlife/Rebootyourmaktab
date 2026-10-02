# Academy Library access inventory and publication manifest

2 October 2026 · `feature/105.3.4.13`

## Existing sources and safe initial states

| Source | Existing active-resource rule | Initial Academy state | File location |
| --- | --- | --- | --- |
| Reboot course Library | Active course membership, active local record, and learner group matching; a learner with no group receives only all-group resources | Assigned | Existing Reboot Drive root |
| Global Subject FREE | Active central account and active subject, module, task, and resource | Academy learners | Existing Global Resources root |
| Global Subject SUBSCRIPTION | Same active checks plus active `GlobalSubjectAccessMatrix` entitlement; existing ADMIN and GLOBAL_ADMIN delivery privilege | Subscription | Existing Global Resources root |
| Program Library | Active confirmed Program role (a student does not need a class assignment), active curriculum references, active resource in Draft Program | Assigned | Shared Program Resources folder and retained previous roots |

Inactive source rows and resources are Archived for viewing. A Draft Program does not publish its resources to Academy learners by itself. The catalogue includes only resources linked to files in the protected Drive delivery system. It does not return Drive, folder, or spreadsheet IDs.

The Worker reads each source in its own location. The account's current Program context is not changed. The source-aware keys are `COURSE:<CourseID>:<ResourceType>:<ResourceID>`, `GLOBAL:<ResourceID>`, and `PROGRAM:<ProgramID>:<ResourceID>`.

## Explicit review and publication

The optional Platform Sheet tab `AcademyLibraryAccess` has these exact columns:

`ResourceKey | Status | AccessState | EntitlementSource | SubscriptionScope`

One row affects exactly one resource. `Status` is `ACTIVE` or `ARCHIVED`. `AccessState` is `ASSIGNED`, `ACADEMY_LEARNERS`, `SUBSCRIPTION`, or `STAFF_ONLY`. Omit a row to retain the safe initial rule above. Duplicate keys and invalid headers stop the catalogue; an invalid status or state hides the affected resource. An `ARCHIVED` row denies opening even if the source record is active.

For a Reboot or Program resource in `SUBSCRIPTION`, `EntitlementSource` must be `GLOBAL_SUBJECT` and `SubscriptionScope` must identify an active Global Subject. The Worker requires an active matrix entitlement for that subject. A missing or invalid source or scope hides the resource. This uses the existing entitlement records and adds no billing.

Global FREE and SUBSCRIPTION access remains governed by Global Subject policy. A Global manifest row may archive a resource or mark it Staff only; it cannot turn a SUBSCRIPTION subject into learner-wide FREE delivery. The Global Teacher decision is pending: Teacher alone does not open an unentitled Global SUBSCRIPTION file.

The first release keeps existing resource management screens. Publication rows should be entered only after a resource-by-resource review. No broadening rows are included with this branch. The live resource counts and individual keys require access to Development Sheets and a teacher/student review session.

## Access checks

`POST /api/academy/library/catalogue` returns metadata, source, subject, access state, lock status, and the For you flag. `POST /api/academy/library/access` and `/cover` reload the current source and policy and verify the protected file before issuing a short-lived link. The existing Program, Reboot, and Global file issuance routes also apply the manifest so an older viewer cannot bypass Archived, Staff only, or Subscription states.

The current signed Drive URL is a bearer link until its expiry. Resource and entitlement revocation is checked when a new URL is issued. Immediate invalidation of a previously issued URL would require a revalidation step in the Drive stream route.

## Remaining live acceptance

1. Complete the V105.4.2.7 teacher hands-on run: one and multiple files from device and Library Drive, retry, cover and reload; then student viewing without a class assignment.
2. Review the actual Reboot, Global, and Program resource rows and add only approved broader publication rows.
3. Deploy the matching frontend and Worker to Development, then test desktop and iPhone as a teacher, assigned learner, unassigned learner, and entitled and unentitled subscriber.
4. Confirm whether Academy Teacher should receive Global SUBSCRIPTION delivery without entitlement. The current rule is preserved.
