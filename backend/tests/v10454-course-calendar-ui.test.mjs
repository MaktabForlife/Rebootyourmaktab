import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [schedulerJs, schedulerCss, accountJs, accountCss] = await Promise.all([
  readFile(new URL("../../js/m4l-global-course-scheduler.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/m4l-28-global-course-scheduler.css", import.meta.url), "utf8"),
  readFile(new URL("../../js/m4l-account.js", import.meta.url), "utf8"),
  readFile(new URL("../../css/m4l-23-account.css", import.meta.url), "utf8")
]);

// DERIVED action wording must fit the action pill on one line.
assert.match(schedulerJs, /course\.schedulemode === "DERIVED" \? "Exception" : "Sessions"/);
assert.doesNotMatch(schedulerJs, /course\.schedulemode === "DERIVED" \? "Exceptions" : "Sessions"/);

// A new recurring time slot starts genuinely blank and communicates that time entry is required.
assert.equal((schedulerJs.match(/placeholder="HH:mm"/g) || []).length >= 2, true, "Start and End must use HH:mm placeholders");
assert.doesNotMatch(schedulerJs, /placeholder="04h00"|placeholder="05h00"/);

// Time-slot creation is a lightweight action below the rows; the old large heading action is gone.
assert.match(schedulerJs, /global-course-add-timeslot[^>]*data-gcm-course-action="add-schedule-row"[\s\S]*?Add another time slot/);
assert.doesNotMatch(schedulerJs, />\+ Another Time Slot<\/button>/);
assert.match(schedulerCss, /\.global-course-add-timeslot\s*\{[\s\S]*?background:transparent/);

// Row removal uses the user-specified Lucide trash-2 icon rather than an X glyph.
assert.match(schedulerJs, /lucide-trash2-icon lucide-trash-2 global-course-trash-icon/);
assert.match(schedulerJs, /<path d="M10 11v6"\/><path d="M14 11v6"\/>/);
assert.match(schedulerJs, /aria-label="Delete time slot"/);

// Detailed/large Academy pills are centred.
assert.match(accountCss, /\.academy-session-pill:not\(\.is-label-only\)\s*\{[\s\S]*?justify-items:center;[\s\S]*?text-align:center;/);

// A current, authorised Zoom session turns the whole session pill into the Zoom-colour action.
assert.match(accountJs, /pill\.classList\.add\("has-active-zoom"\)/);
assert.match(accountCss, /\.academy-session-pill\.has-active-zoom\s*\{[\s\S]*?background:linear-gradient\(135deg,var\(--account-brand\),var\(--account-brand-deep\)\)/);

// Zoom keeps a visible label and uses the supplied Lucide link icon next to it.
assert.match(accountJs, /lucide-link-icon lucide-link/);
assert.match(accountJs, /"M10 13a5 5 0 0 0 7\.54\.54l3-3a5 5 0 0 0-7\.07-7\.07l-1\.72 1\.71"/);
assert.match(accountJs, /document\.createTextNode\("Zoom"\)/);
assert.match(accountCss, /\.academy-session-pill-zoom\s*\{[\s\S]*?display:inline-flex;[\s\S]*?justify-self:center;/);

console.log("V104.5.4 Course recurring-schedule and Academy timetable UI refinements passed.");
