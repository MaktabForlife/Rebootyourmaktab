# Academy Library — agreed model, not yet implemented

The project owner changed and clarified the Library requirements on 10 October 2026. **Module media subscriptions and completion-based lifetime access have not been built.** The existing per-Course subscription controls and Program-folder Library implementation do not implement this model. Nothing in this document creates subscriptions, grants, files, database tables or a live storage switch.

This model supersedes the earlier requirement to select a Drive upload folder for every Program. The four missing Program folder links are no longer needed for the new Library. Existing code and verification reports describe the preceding implementation; they are not acceptance evidence for the model below.

## Public and Personal Library

| Library | Account and source |
| --- | --- |
| Public Library | Available to everyone without Academy sign-in. Public material is accessed from Archive.org. |
| Personal Library | Uses the learner's existing Academy account. Includes media to which that account is entitled, alongside relevant public material. |

Private Academy media will use **one shared private store**, rather than Program-specific upload destinations. Cloudflare R2 or Google Drive is still to be selected. D1 will hold subscriptions, resource-to-Module links and permanent account entitlements; the selected file store will hold private file contents. No store or folder has been created or selected as part of this clarification.

Public Archive.org links remain public. A subscription check on the Academy website cannot turn a publicly reachable Archive.org file into private Academy media. Private resources need protected storage and server-authorised file delivery. The current public Library catalogue and uploaded covers remain separate from this proposed private store.

## Learning structures and subscription scope

| Learning area | Structure |
| --- | --- |
| Programs | Subjects → Modules → scheduled lessons |
| Courses / Continuing Education | Modules such as workshops, bootcamps and presentations |

Only the term **Global Subject** is outdated; Courses themselves remain current offerings. Global Admin means administration across the whole Academy, including every Program and Course.

**Media subscriptions apply to individual Modules in either learning area.** A Course subscription, Program role, class enrolment, attendance record or teaching assignment is not by itself evidence of a Module media subscription. Existing source records must not be expanded into grants for every Module without a confirmed mapping.

## Media access over a Module's lifecycle

| Stage | Required behaviour |
| --- | --- |
| Active | Current subscribers can access the Module's existing media and new media added while it remains active. |
| Completed | Learners subscribed on the recorded completion date receive permanent account entitlements to all media included at completion. |
| Archived | Previously granted lifetime access continues through Personal Library. |

A subscription that ended before completion does not qualify for a lifetime grant. A current subscriber does not lose their already recorded lifetime access by ending a subscription after completion. Archiving alone must not manufacture completion grants.

A resource can belong to one or more Modules, including Modules in different learning areas. Eligibility through **any** linked Module is sufficient. Losing access through one Module must not hide media still accessible through another Module or through a permanent entitlement.

Archiving a Program, Course or Module must not automatically archive its media, delete a permanent entitlement or make that entitlement depend on an active parent. Learners must still be able to sign in to their existing account and use Personal Library when their only remaining access is lifetime media.

Completion must retain the exact included media list. Media added after completion does not automatically enter an earlier lifetime grant. Before implementation, define how file replacements/editions are retained so later changes do not silently alter or remove the media included at completion.

## Server responsibilities when this feature is built

- Check entitlement before returning protected resources in a catalogue and again when opening or streaming a file. Browser filtering and a previously issued link are not access authority.
- Store completion grants permanently against the learner's Academy account, with their Module/completion provenance and included media. Do not recalculate them solely from current subscription state.
- Preserve subscription start/end history and a recorded completion boundary. Define date/timezone and same-day expiry handling before implementation; do not infer completion from an inactive flag or a past scheduled lesson.
- Commit completion, its media list, eligible learners, permanent grants and audit/retry records together. A failed or repeated completion action must not produce partial or duplicate grants.
- Keep protected media out of public catalogue responses and direct public file locations. Preserve valid access checks for expired sessions and disabled accounts independently of permanent entitlement records.

The existing active-only operational migration remains useful for accounts, Programs, Courses, schedules and attendance. Once permanent entitlements exist, their historical Module and media dependencies must be preserved even when an activity is archived; the earlier blanket archived-record exclusion must not erase that evidence. No retrospective lifetime grants are assumed from the current import.

## Required acceptance scenarios

| Scenario | Expected result |
| --- | --- |
| Visitor without an account | Can browse/open Public Library material; cannot list or open private media. |
| Current subscriber to an Active Module | Sees existing and newly linked media for that Module. |
| Subscription ended before completion | Receives no lifetime grant from that Module. |
| Subscriber eligible at completion | Receives permanent access to the included media, retained after subscription expiry. |
| Program, Course or completed Module archived | Existing lifetime media remains visible and openable from Personal Library. |
| Resource linked to two Modules | Either eligible Module grants access; losing one does not override the other. |
| New media added after completion | Does not enter earlier completion grants automatically. |
| Stale catalogue or previously issued file link | Server rechecks current access before delivering protected data. |
| Retried or failed completion | No duplicate grants or partial completion state. |
| Learner has lifetime access but no active learning context | Existing account can still sign in and use Personal Library. |

## Migration boundary and next decision

Core D1 migration work is continuing independently of this new feature, using core-first as the working sequence while the sequencing question remains open. The new activation contract requires a public-only Library mode: protected media remains unavailable until the new access controls are ready. The old per-Course/Program Library permissions must not silently serve as the new Module media model. See the [core activation preparation and remaining checks](ACADEMY-D1-CORE-ACTIVATION.md); this preparation has not changed live routing or granted private-media access.

The shared private storage choice is also pending. No further Program-specific Drive folder links are requested. There is only an unapplied, private schema proposal at this point; no `0008` runtime migration or new entitlement service has been added.
