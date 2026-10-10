import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminHtml, js, css] = await Promise.all([
  readFile(new URL("../../admin/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../js/m4l-global-course-scheduler.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/m4l-28-global-course-scheduler.css", import.meta.url), "utf8")
]);

assert.match(adminHtml, />Courses<\/button>/);
assert.match(adminHtml, /Program Timetables/);
assert.match(js, /Recurring schedule/);
assert.match(js, /lucide-trash2-icon lucide-trash-2/);
assert.match(js, /Normal occurrences are virtual/);
assert.match(js, /Derived Occurrences & Exceptions/);
assert.match(js, /EXPLICIT sessions/);
assert.match(js, /Prepare Scheduling/);
assert.match(js, /\/api\/admin\/platform\/global\/courses\/migrate-scheduling/);
assert.match(js, /Add another time slot/);
assert.match(js, /data-course-schedule-day/);
assert.match(js, /placeholder="HH:mm"/);
assert.match(js, /<option value=""[^>]*>TBA<\/option>/);
assert.match(js, /DERIVED is the default; EXPLICIT creates exact dated sessions/);
assert.match(js, /generationStartDate/);
assert.match(js, /generationEndDate/);
assert.match(js, /skipExistingEquivalent/);
assert.match(js, /\/api\/admin\/platform\/global\/timetable\/generate/);
assert.match(js, /\/api\/admin\/platform\/global\/timetable\/session\/materialize/);
assert.match(js, /\/api\/admin\/platform\/global\/timetable\/session\/batch-save/);
assert.match(js, /\/api\/admin\/platform\/global\/timetable\/revise/);
assert.match(js, /\/api\/admin\/platform\/global\/timetable\/publish/);
assert.doesNotMatch(js, /data-gcm-course-action="reschedule"/);
assert.doesNotMatch(js, /data-gcm-course-action="delete"/);
assert.doesNotMatch(js, /save-session-inline/);
assert.match(js, />Save<\/span>/);
assert.doesNotMatch(js, /Save &amp; Publish/);
assert.doesNotMatch(js, /save-publish-sessions/);
assert.match(js, /Publish from the Course row when ready/);
assert.match(js, />Cancel<\/span>/);
assert.match(js, /data-inline-session-field="status"/);
assert.match(js, /data-inline-session-field="description"/);
assert.match(js, /maxlength="400"/);
assert.match(js, /Optional short description/);
assert.match(js, /<option value="CANCELLED"/);
assert.match(js, /global-session-calendar-note/);
assert.match(js, /is-holiday/);
assert.match(js, /is-islamic/);
assert.match(js, /Revise timetable/);
assert.match(js, /function publishEligibility/);
assert.match(js, /if \(!course\.runid\) return "";/);
assert.match(js, /Activate this Course before publishing/);
assert.match(js, /Add a valid schedule before publishing/);
assert.match(js, /deliveryWindowChanged/);
assert.match(js, /Preserve historical source sessions/);

assert.match(css, /\.global-session-inline-scroll/);
assert.match(css, /overflow-y:auto/);
assert.match(css, /\.global-session-calendar-note\.is-holiday/);
assert.match(css, /\.global-session-calendar-note\.is-islamic/);
assert.match(css, /\.global-session-inline-row\.is-dirty/);
assert.match(css, /\.global-session-inline-row\.is-cancelled/);
assert.match(css, /\.global-session-inline-table\.has-session-description/);
assert.match(css, /\.global-session-description-cell/);
assert.doesNotMatch(css, /min-width:1320px/);

console.log("V104.5.1 derived-by-default Course scheduling, explicit-session and exception UI checks passed.");
