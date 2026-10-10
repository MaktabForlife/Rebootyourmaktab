import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminHtml, scheduler] = await Promise.all([
  readFile(new URL("../../admin/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../js/m4l-global-course-scheduler.js", import.meta.url), "utf8")
]);

assert.match(adminHtml, /m4l-global-course-scheduler\.js\?v=106\.1/);
assert.match(scheduler, /publishstart: String\(run\.draftpublishstartdate \|\| ""\)/,
  "Course reload must use the authoritative saved ONGOING draft Publish From date");
assert.match(scheduler, /publishend: String\(run\.draftpublishenddate \|\| ""\)/,
  "Course reload must use the authoritative saved ONGOING draft Publish Through date");
assert.match(scheduler, /draftPublishStartDate: course\.type === "ONGOING" \? course\.publishstart : ""/,
  "Main Courses Save must persist the ONGOING draft Publish From date");
assert.match(scheduler, /draftPublishEndDate: course\.type === "ONGOING" \? course\.publishend : ""/,
  "Main Courses Save must persist the ONGOING draft Publish Through date");
assert.match(scheduler, /const metadataWork = course\.dirty \|\| course\.isNew \|\| course\.windowDirty/,
  "A window-only edit must be treated as save work");
assert.doesNotMatch(scheduler, /preservedWindows/,
  "V104.5.3 must not rely on browser-memory window preservation after reload");
assert.match(scheduler, /const start = course\.type === "ONGOING" \? course\.publishstart : course\.startdate/);
assert.match(scheduler, /if \(course\.type === "ONGOING" && !validPublishWindow\(course\)\)/,
  "Inline Publish eligibility must use the reloaded authoritative draft window");
assert.match(scheduler, /Enter a valid Publish From and Publish Through window before publishing/,
  "An invalid saved window must leave the visible Publish control disabled");

console.log("V104.5.3 ONGOING DERIVED persisted-window UI wiring regression passed.");
