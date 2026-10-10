# User profiles — V106.4

The Academy administrator user register is a compact, full-width spreadsheet. The large page introduction and obsolete migration/setup panels no longer occupy the top of the page. Column headings remain, editing help is collapsed, and the search, filters, refresh, add and save actions share one toolbar.

Names and Active/Inactive status are directly editable cells. Drafts begin on the first actual edit, remain through refresh/navigation, and save with Program roles in the existing atomic batches. Discard all removes all unsaved drafts. Add user clears filters, focuses the new name and keeps newly saved users at the top for the session. Tab moves from name to status; Ctrl/Command + Enter saves all changed users.

The name/status columns and table header remain visible while scrolling. Narrow screens retain the horizontal sheet instead of stacking every user into a card. Inactivating an account preserves its roles and enrolment history; the existing server rules end its sessions and prohibit disabling the last administrator or one's own account.

A real revision conflict still requires explicit review. Other profile cells can be edited while that review is open. Unsaved Program drafts restored from before the migration translate Admin to Program Admin and Senior to Teacher, as previously approved. An uncertain pending operation is never translated or given a new operation ID. D1 policy labels remain informational; Course access is still managed through Course administration.

Validation covers direct existing-profile edits, repeat saves, combined name/status changes, retained roles, discarding multiple drafts, editing during conflict review, restored legacy roles and exact pending-operation retries against the D1 HTTP contracts. Browser checks use synthetic local accounts only. No schema, live account data, storage mode, deployment binding or legacy production Worker configuration changes are included.
