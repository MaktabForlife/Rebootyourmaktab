import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminHtml, js, css, styles] = await Promise.all([
  readFile(new URL("../../admin/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../js/m4l-global-course-scheduler.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/m4l-28-global-course-scheduler.css", import.meta.url), "utf8"),
  readFile(new URL("../../styles.css", import.meta.url), "utf8")
]);

assert.match(adminHtml, /data-gcm-course-action="show">Courses</);
assert.doesNotMatch(adminHtml, /data-gcm-course-action="show">Course Scheduler</);
assert.match(adminHtml, /m4l-global-course-scheduler\.js\?v=106\.9/);
assert.match(adminHtml, /styles\.css\?v=105\.4\.2\.25/);
assert.match(styles, /m4l-28-global-course-scheduler\.css\?v=104\.5\.4/);

assert.match(js, /<h3>Courses<\/h3>/);
assert.match(js, /Course Name/);
assert.match(js, /Global Subject/);
assert.match(js, /Start \/ Publish From/);
assert.match(js, /End \/ Publish Through/);
assert.match(js, /<option value="FREE"/);
assert.match(js, /<option value="PAID"/);
assert.match(js, /<option value="FIXED"/);
assert.match(js, /<option value="ONGOING"/);
assert.match(js, /<option value="DERIVED"/);
assert.match(js, /<option value="EXPLICIT"/);
assert.match(js, /<option value="INACTIVE"/);
assert.match(js, />Archived<\/option>/);
assert.match(js, /\+ Add Course/);
assert.match(js, /course\.schedulemode === "DERIVED" \? "Exception" : "Sessions"/);
assert.match(js, /data-gcm-course-action="publish-course"/);
assert.equal((js.match(/data-gcm-course-action="publish-course"/g) || []).length, 1, "Publishing must exist only in the inline Course row");
assert.doesNotMatch(js, /Publish range/);
assert.match(js, /function publishEligibility/);
assert.match(js, /Save Course and schedule changes before publishing/);
assert.match(js, /already published with no saved revision waiting/);
assert.match(css, /\.global-course-publish-inline:disabled/);
assert.match(js, /Prepare Course FREE\/PAID access/);
assert.match(js, /Prepare Scheduling/);
assert.match(js, /authoritative saved publication windows for ONGOING Courses/);
assert.match(js, /\/api\/admin\/platform\/global\/courses\/migrate-scheduling/);
assert.match(js, /New Courses default to DERIVED/);
assert.match(js, /\/api\/admin\/platform\/global\/courses\/migrate-access/);
assert.match(js, /global-course-screen-save/);
assert.match(js, /dirtyCourses\(\)/);
assert.match(js, /Published timetables remain unchanged until Publish is used/);
assert.match(js, /deliveryWindowChanged/);
assert.match(js, /skipExistingEquivalent/);
assert.doesNotMatch(js, /Set up a new course/);
assert.doesNotMatch(js, /Modify course/);
assert.doesNotMatch(js, /global-course-subject-table/);
assert.doesNotMatch(js, /field\("Timezone"/);

assert.match(css, /\.global-courses-panel/);
assert.match(css, /\.global-course-grid-row/);
assert.match(css, /\.global-course-record\.is-dirty/);
assert.match(css, /\.global-course-schedule-editor/);
assert.match(css, /\.global-course-publish-inline/);
assert.match(css, /@media \(max-width:900px\)/);

console.log("V104.5.1 Courses inline metadata, DERIVED/EXPLICIT scheduling and single inline-publish UI checks passed.");
