# V106.2 — Complete Academy timetables

All Academy timetable views use the account’s complete authorised schedule, independently of the selected Program or Course.

- Students and Teachers: one card per scheduled lesson in which the learner is enrolled or the teacher is assigned. Subject, Module, class, teacher and lesson time appear directly on the card when included in the publication.
- Program Admins: the full schedule of every administered Program, grouped into one card per meeting link per day. Direct participation in other Programs or Courses remains individual.
- Global Admins: the entire Academy schedule, grouped by meeting link and day. Grouped cards retain all lesson details in their information dialog. Missing meeting links never combine unrelated lessons.

Every card uses the same base colour. Cards become dark while a server-authorised join link is open: from five minutes before start until the lesson ends. Home, full timetable and Program/Course views refresh at joining boundaries and recheck at most once per minute while visible. Account-bound caching still coalesces concurrent requests and reuses authorised page metadata for up to one minute; date boundaries, joining transitions, session changes and refresh failures invalidate reuse.

The signed-in account’s display name appears in the Academy top bar and clears on sign-out. Individual cards grow to fit their details; narrow screens scroll the timetable horizontally.

## Validation

Projection and D1 route tests cover direct involvement, the same complete timetable across pages, administrator scope and revoked roles. UI checks cover individual/grouped rendering, escaped details, one colour, five-minute joining and lesson-end transitions on all timetable views, failed refresh, account switching and sign-out. Login checks cover the top-bar name.

All 124 regression test files pass, and the current Worker dry run succeeds. An isolated browser preview backed by synthetic local D1 accounts verifies Student, Teacher, Program Admin and Global Admin views. Teacher navigation retains both assigned Programs; Program Admin excludes the other Program; Global Admin combines shared rooms across Programs. At 390 px the page stays within the viewport and the timetable scrolls internally. No real account PIN was used for these checks.

This release uses the existing live D1 schema and data. It does not import data or change subscriptions, media access, bindings or the separate production-named legacy Worker. Academy media remains PUBLIC_ONLY while the agreed Module media subscription model is unbuilt.
