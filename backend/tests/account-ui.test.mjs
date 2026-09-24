/* M4L V105.1 - Program setup entry and retained account UI checks. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../../account/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../../css/m4l-23-account.css", import.meta.url), "utf8");
const script = readFileSync(new URL("../../js/m4l-account.js", import.meta.url), "utf8");
const redirects = readFileSync(new URL("../../_redirects", import.meta.url), "utf8");
const headers = readFileSync(new URL("../../_headers", import.meta.url), "utf8");

assert.match(html, /id="login-form"/);
assert.match(html, /id="setup-form"/);
assert.match(html, /id="context-view"/);
assert.match(html, /id="context-list"/);
assert.match(html, /id="open-workspace-button"/);
assert.match(html, /Switch program or role/);
assert.match(html, /m4l-account\.js\?v=105\.2/);
assert.match(html, /m4l-23-account\.css\?v=104\.5\.4/);

for (const endpoint of [
  "/api/account/check",
  "/api/account/setup-pin",
  "/api/account/login",
  "/api/account/session",
  "/api/account/switch-context",
  "/api/account/workspace",
  "/api/account/global-workspace",
  "/api/academy/timetable"
]) {
  assert.ok(script.includes(endpoint), `Account UI must call ${endpoint}`);
}
assert.match(script, /m4l_account_token/);
assert.match(script, /m4l_account_contexts/);
assert.match(script, /maktab_token/);
assert.match(script, /window\.location\.assign\(path\)/);
assert.match(html, /id="academy-timetable"/);
assert.doesNotMatch(html, /Academy timetable/);
assert.match(script, /loadAcademyTimetable/);
assert.match(script, /formatAcademyTimeRange/);
assert.doesNotMatch(html, /id="academy-today"/);
assert.doesNotMatch(html, /aria-label="Verified"/);
assert.match(script, /data-academy-move/);
assert.match(script, /formatAcademyCompactDate/);
assert.match(css, /scroll-snap-type:\s*x mandatory/);
assert.match(css, /overflow-x:\s*auto/);
assert.match(css, /max-height:\s*620px/);
assert.match(css, /academy-day-session-list[\s\S]*overflow-y:\s*auto/);
assert.match(css, /scrollbar-gutter:\s*stable/);
assert.match(script, /academy-day-session-list/);
assert.match(script, /academyTimeSortValue\(left\.startTime\)/);
assert.match(script, /const ACADEMY_INITIAL_DAYS = 7/);
assert.match(script, /days: ACADEMY_INITIAL_DAYS/);
assert.match(script, /ACADEMY_CACHE_PREFIX/);
assert.match(script, /readAcademyTimetableCache/);
assert.match(script, /prefetchAcademyTimetable/);
assert.match(script, /academyDatesBetween\(viewStart, viewEnd\)/);
assert.match(script, /addEventListener\("scroll", handleAcademyTimetableScroll/);
assert.match(script, /createProgramRollupPill/);
assert.match(script, /labelOnly && relevantProgramNames\.has\(programName\)/);
assert.doesNotMatch(script, /session\.globalCourseName/);
assert.match(script, /\[session\.moduleName, teacherName\]\.filter\(Boolean\)\.join\(" · "\)/);
assert.match(script, /const label = programName;/);
assert.doesNotMatch(script, /other\" : \"\"} sessions/);
assert.match(css, /flex:\s*0 1 118px/);
assert.match(css, /academy-session-pill:not\(\.is-label-only\)[\s\S]*flex:\s*1 1 190px/);
assert.match(css, /academy-session-pill\.is-label-only,[\s\S]*flex:\s*0 1 118px/);
assert.match(css, /flex-basis:\s*100%/);
assert.match(css, /overflow-y:\s*auto/);
assert.match(script, /academy-session-pill/);
assert.match(script, /date === today \? "TODAY"/);
assert.match(script, /weekday: "long"/);
assert.match(script, /session\.isCurrent && session\.canOpenZoom && session\.zoomLink/);
assert.match(script, /\$\{String\(Number\(match\[1\]\)\)\.padStart\(2, "0"\)\}h\$\{match\[2\]\}/);
assert.match(script, /clearCourseDataCaches/);
assert.match(script, /localStorage\.removeItem\(TOKEN_KEY\)/);
assert.match(script, /Authorization: `Bearer \$\{token\}`/);
assert.match(script, /replace\(\/\\D\/g, ""\)\.slice\(0, 4\)/);
assert.match(script, /byId\("login-pin"\)\.value = ""/);
assert.match(script, /const form = event\.currentTarget;[\s\S]*?setBusy\(form, true\)/);
assert.match(script, /setBusy\(form, false\);[\s\S]*?if \(loginFailed\)[\s\S]*?byId\("login-pin"\)\.focus\(\)/);
assert.doesNotMatch(script, /setBusy\(event\.currentTarget, false\)/);
assert.match(script, /if \(normalized === "SENIOR"\) return "SENIOR TEACHER"/);
assert.doesNotMatch(script, /innerHTML\s*=/, "Account context values must not be injected through innerHTML");
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /prefers-reduced-motion/);
assert.match(redirects, /^\/account\/\*\s+\/account\/\s+200$/m);
assert.match(headers, /^\/account\/\*\n\s+Cache-Control: no-cache$/m);

console.log("V103.1.0.5 Academy Home rolling seven-day loading, cache, prefetch and existing UI tests passed.");
