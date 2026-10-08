import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const timetable = await readFile(new URL("../../js/m4l-timetable.js", import.meta.url), "utf8");
const weeklyPlanner = await readFile(new URL("../../js/m4l-weekly-planner.js", import.meta.url), "utf8");
const timetableCss = await readFile(new URL("../../css/m4l-05-home-timetable.css", import.meta.url), "utf8");
const styles = await readFile(new URL("../../styles.css", import.meta.url), "utf8");
const admin = await readFile(new URL("../../admin/index.html", import.meta.url), "utf8");
const student = await readFile(new URL("../../student/index.html", import.meta.url), "utf8");
const root = await readFile(new URL("../../index.html", import.meta.url), "utf8");

assert.match(timetable, /TIMETABLE_CACHE_PREFIX = "maktab_timetable_cache_v10"/);
assert.match(timetable, /teacherId: normalizeTimetableText\(resolvedTeacherId\)/);
assert.match(timetable, /teachername: teacherName/);
assert.match(timetable, /data-timetable-teacher-id=/);
assert.match(timetable, /m4l-timetable-teacher/);
assert.match(timetable, /groupTimetableEntriesBySubjectModule/);
assert.match(timetable, /getTimetableSubjectModuleLabel/);
assert.match(timetable, /displayname: getTimetableSubjectModuleLabel\(entry\)/);
assert.match(timetable, /m4l-timetable-assignment--with-group/);
assert.match(timetable, /m4l-timetable-details-summary/);
assert.match(timetable, /getTimetableModuleLabel/);
assert.match(timetable, /return moduleName;/);
assert.doesNotMatch(timetable, /if \(moduleNo/);
assert.match(timetable, /getSharedTimetableZoomLink/);
assert.match(timetable, /Open \$\{scopeLabel\} Zoom link/);
assert.match(timetable, /alwaysDiscloseAssignments: oversightView/);
assert.match(timetable, /showAssignmentZoomActions: oversightView/);
assert.match(timetable, /allowSubjectZoomActions: !oversightView/);
assert.match(timetable, /restrictAssignmentZoomToViewer: teacherView/);
assert.match(timetable, /isOversightTimetableRole/);
assert.match(timetable, /\["admin", "senior", "teacher"\]/);
assert.match(timetable, /renderTimetableDayLayout/);
assert.match(timetable, /m4l-timetable-responsive--oversight/);
assert.match(timetable, /m4l-timetable-layout--days/);
assert.match(timetable, /m4l-timetable-session--muted/);
assert.match(timetable, /dimOtherTeachers: teacherView \|\| timetableResult\?\.viewerhasassignments === true/);
assert.match(timetable, /const sharedZoomLink = getSharedTimetableZoomLink\(subjectEntries\)/);
assert.match(timetable, /"Open session Zoom link"/);
assert.doesNotMatch(timetable, /options\.usePerSessionZoom === true/);

assert.match(weeklyPlanner, /teacherId: teacher\.teacherId \|\| "ALL"/);
assert.doesNotMatch(weeklyPlanner, /assignedTeacher: teacher\.teacherName/);

assert.match(timetableCss, /\.m4l-timetable-session--muted/);
assert.match(timetableCss, /\.m4l-timetable-assignment--muted/);
assert.match(timetableCss, /\.m4l-timetable-assignment--with-group/);
assert.match(timetableCss, /\.m4l-timetable-details-summary/);
assert.match(timetableCss, /\.m4l-timetable-details\[open\]/);
assert.match(timetableCss, /\.m4l-timetable-layout--days/);
assert.match(timetableCss, /@media \(max-width: 899px\)/);
assert.match(timetableCss, /grid-auto-columns: 100%/);
assert.match(timetableCss, /scroll-snap-type: x mandatory/);
assert.match(timetableCss, /color: #aeb3b0/);
assert.doesNotMatch(timetableCss, /\.m4l-timetable-session--muted\s*\{[^}]*background:/);
assert.doesNotMatch(timetableCss, /\.m4l-timetable-assignment--muted\s*\{[^}]*background:/);
assert.match(timetableCss, /\.m4l-timetable-teacher/);
assert.match(timetableCss, /button\.m4l-timetable-subject/);
assert.match(timetableCss, /button\.m4l-timetable-assignment-zoom/);
assert.match(timetableCss, /\.m4l-timetable-responsive--oversight \.m4l-timetable-details-summary/);
assert.match(timetableCss, /gap: 12px/);
assert.match(timetableCss, /font-size: clamp\(0\.82rem, 3\.6vw, 0\.94rem\)/);
assert.doesNotMatch(
  timetableCss,
  /button\.m4l-timetable-assignment-zoom\s*\{[^}]*color:\s*var\(--primary\)/
);
assert.match(styles, /m4l-05-home-timetable\.css\?v=100\.10\.5/);

assert.match(admin, /styles\.css\?v=105\.4\.2\.24/);

for (const html of [student, root]) {
  assert.match(html, /m4l-timetable\.js\?v=102\.9\.1/);
  assert.match(html, /styles\.css\?v=105\.4\.2\.24/);
}

assert.match(admin, /m4l-timetable\.js\?v=102\.9\.1/);

assert.match(admin, /m4l-weekly-planner\.js\?v=101\.1\.1/);

const renderContext = {
  console,
  state: { user: { adminid: "ADMIN1" } },
  window: {},
  document: {
    addEventListener() {},
    getElementById() { return null; }
  },
  getDomElement(value) { return value; },
  setDomHtml(target, html) { target.innerHTML = html; },
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  },
  escapeForAttribute(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
};
vm.runInNewContext(timetable, renderContext, { filename: "js/m4l-timetable.js" });

const renderTarget = { innerHTML: "" };
renderContext.window.M4LTimetable.renderTimetable(renderTarget, {
  vieweradminid: "ADMIN1",
  viewerhasassignments: true,
  showgrouplabels: true,
  sessions: [
    {
      sessionid: "TA1",
      subjectname: "Quran",
      dayofweek: "Mon",
      starttime: "05:45",
      groupno: "1",
      teacherid: "ADMIN1",
      teachername: "Teacher A",
      teacherassigned: true,
      zoomlink: "https://zoom.test/group-1"
    },
    {
      sessionid: "TA4",
      subjectname: "Quran",
      moduleid: "MOD1",
      modulename: "Part-1",
      moduleno: "1",
      moduleassigned: true,
      dayofweek: "Mon",
      starttime: "05:45",
      groupno: "4",
      teacherid: "ADMIN4",
      teachername: "Teacher D",
      teacherassigned: true,
      zoomlink: "https://zoom.test/group-4"
    },
    {
      sessionid: "TA2",
      subjectname: "Quran",
      moduleid: "MOD2",
      modulename: "Part-2",
      moduleno: "2",
      moduleassigned: true,
      dayofweek: "Mon",
      starttime: "05:45",
      groupno: "2",
      teacherid: "ADMIN2",
      teachername: "Teacher B",
      teacherassigned: true,
      zoomlink: "https://zoom.test/group-2"
    },
    {
      sessionid: "TA3",
      subjectname: "Quran",
      moduleid: "MOD2",
      modulename: "Part-2",
      moduleno: "2",
      moduleassigned: true,
      dayofweek: "Mon",
      starttime: "05:45",
      groupno: "3",
      teacherid: "ADMIN3",
      teachername: "Teacher C",
      teacherassigned: true,
      zoomlink: "https://zoom.test/group-3"
    }
  ]
}, { showGroupLabels: true });

assert.equal(
  (renderTarget.innerHTML.match(/>Quran<\/button>/g) || []).length,
  1,
  "An unmoduled subject must have its own row"
);
assert.ok(
  renderTarget.innerHTML.indexOf(">Quran</button>") < renderTarget.innerHTML.indexOf(">Quran Part-1</button>") &&
    renderTarget.innerHTML.indexOf(">Quran Part-1</button>") < renderTarget.innerHTML.indexOf(">Quran Part-2</span>"),
  "Subject-module rows must order the subject first and then modules by module number"
);
assert.match(renderTarget.innerHTML, /m4l-timetable-assignment--muted/);
assert.match(renderTarget.innerHTML, /<details class="m4l-timetable-details m4l-timetable-details--inline">/);
assert.match(renderTarget.innerHTML, /Show groups, teachers and Zoom links for Quran Part-2/);
assert.doesNotMatch(renderTarget.innerHTML, />[0-9]+ groups</);
assert.match(renderTarget.innerHTML, /Open Group 2 Zoom link/);
assert.match(renderTarget.innerHTML, /Open Group 3 Zoom link/);
assert.equal(
  (renderTarget.innerHTML.match(/title="Open session Zoom link"/g) || []).length,
  2,
  "Single-assignment Quran and Quran Part-1 rows keep their subject Zoom links"
);

const allGroupTarget = { innerHTML: "" };
renderContext.window.M4LTimetable.renderTimetable(allGroupTarget, {
  sessions: [{
    sessionid: "TA3",
    subjectname: "Fiqh",
    moduleid: "MOD17",
    modulename: "Hanafi",
    moduleno: "1",
    moduleassigned: true,
    dayofweek: "Mon",
    starttime: "06:30",
    groupno: "ALL",
    teacherid: "ADMIN1",
    teachername: "Teacher A",
    teacherassigned: true
  }]
});

assert.doesNotMatch(allGroupTarget.innerHTML, /All groups/i);
assert.doesNotMatch(allGroupTarget.innerHTML, /m4l-timetable-details-summary/);
assert.match(allGroupTarget.innerHTML, />Fiqh Hanafi</);
assert.doesNotMatch(allGroupTarget.innerHTML, /Module 1/i);
assert.match(allGroupTarget.innerHTML, /Teacher A/);

const singleGroupStudentTarget = { innerHTML: "" };
renderContext.window.M4LTimetable.renderTimetable(singleGroupStudentTarget, {
  groupno: "4",
  showgrouplabels: false,
  sessions: [{
    sessionid: "TA-STUDENT-4",
    subjectname: "Quran",
    moduleid: "MOD1",
    modulename: "Part-1",
    moduleno: "1",
    moduleassigned: true,
    dayofweek: "Mon",
    starttime: "05:45",
    groupno: "4",
    teacherid: "ADMIN4",
    teachername: "MI Hajira",
    teacherassigned: true,
    zoomlink: "https://zoom.test/group-4"
  }]
});

assert.doesNotMatch(singleGroupStudentTarget.innerHTML, /m4l-timetable-details-summary/);
assert.doesNotMatch(singleGroupStudentTarget.innerHTML, /Group 4/);
assert.match(singleGroupStudentTarget.innerHTML, />Quran Part-1</);
assert.match(singleGroupStudentTarget.innerHTML, />MI Hajira</);
assert.match(singleGroupStudentTarget.innerHTML, /title="Open session Zoom link"/);
assert.doesNotMatch(singleGroupStudentTarget.innerHTML, /m4l-timetable-layout--days/);

const sharedLinkTarget = { innerHTML: "" };
renderContext.window.M4LTimetable.renderTimetable(sharedLinkTarget, {
  sessions: [
    {
      sessionid: "TA4",
      subjectname: "Quran",
      dayofweek: "Tue",
      starttime: "05:45",
      groupno: "1",
      teacherid: "ADMIN1",
      teachername: "Teacher A",
      teacherassigned: true,
      zoomlink: "https://zoom.test/shared"
    },
    {
      sessionid: "TA5",
      subjectname: "Quran",
      dayofweek: "Tue",
      starttime: "05:45",
      groupno: "2",
      teacherid: "ADMIN2",
      teachername: "Teacher B",
      teacherassigned: true,
      zoomlink: "https://zoom.test/shared"
    }
  ]
});

assert.match(sharedLinkTarget.innerHTML, /title="Open session Zoom link"/);
assert.match(sharedLinkTarget.innerHTML, /data-zoom-link="https:\/\/zoom\.test\/shared"/);

const oversightTarget = { innerHTML: "" };
renderContext.window.M4LTimetable.renderTimetable(oversightTarget, {
  viewerrole: "SENIOR",
  vieweradminid: "ADMIN9",
  viewerhasassignments: false,
  showgrouplabels: true,
  sessions: [
    {
      sessionid: "OS1",
      subjectname: "Quran",
      dayofweek: "Mon",
      starttime: "05:45",
      groupno: "1",
      teacherid: "ADMIN1",
      teachername: "Teacher A",
      teacherassigned: true,
      zoomlink: "https://zoom.test/oversight-1"
    },
    {
      sessionid: "OS2",
      subjectname: "Quran",
      moduleid: "MOD2",
      modulename: "Part-2",
      moduleno: "2",
      moduleassigned: true,
      dayofweek: "Mon",
      starttime: "05:45",
      groupno: "2",
      teacherid: "ADMIN2",
      teachername: "Teacher B",
      teacherassigned: true,
      zoomlink: "https://zoom.test/oversight-2"
    },
    {
      sessionid: "OS3",
      subjectname: "Surahs",
      dayofweek: "Tue",
      starttime: "06:15",
      groupno: "ALL",
      teacherid: "ADMIN3",
      teachername: "Teacher C",
      teacherassigned: true,
      zoomlink: "https://zoom.test/oversight-3"
    }
  ]
});

assert.match(oversightTarget.innerHTML, /m4l-timetable-responsive--oversight/);
assert.match(oversightTarget.innerHTML, /m4l-timetable-layout--week/);
assert.match(oversightTarget.innerHTML, /m4l-timetable-layout--days/);
assert.equal(
  (oversightTarget.innerHTML.match(/class="m4l-timetable-day-panel"/g) || []).length,
  2,
  "SENIOR mobile oversight must render one horizontally swipeable panel per day"
);
assert.match(oversightTarget.innerHTML, /Swipe horizontally for more days/);
assert.match(oversightTarget.innerHTML, /Show groups, teachers and Zoom links for Quran Part-2/);
assert.match(oversightTarget.innerHTML, /Open Group 2 Zoom link/);
assert.match(oversightTarget.innerHTML, /Open Surahs Zoom link/);
assert.match(oversightTarget.innerHTML, />Zoom<\/button>/);
assert.doesNotMatch(oversightTarget.innerHTML, /title="Open session Zoom link"/);
assert.doesNotMatch(
  oversightTarget.innerHTML,
  /<button[^>]*class="m4l-timetable-subject[^>]*>/
);
assert.match(
  oversightTarget.innerHTML,
  /<span class="m4l-timetable-subject timetable-subject">Quran<\/span>/
);

const teacherTarget = { innerHTML: "" };
renderContext.window.M4LTimetable.renderTimetable(teacherTarget, {
  viewerrole: "TEACHER",
  vieweradminid: "ADMIN1",
  viewerhasassignments: true,
  sessions: [
    {
      sessionid: "TEACHER1",
      subjectname: "Quran",
      dayofweek: "Mon",
      starttime: "05:45",
      groupno: "1",
      teacherid: "ADMIN1",
      teachername: "Teacher A",
      teacherassigned: true,
      zoomlink: "https://zoom.test/teacher-own"
    },
    {
      sessionid: "TEACHER2",
      subjectname: "Fiqh",
      dayofweek: "Tue",
      starttime: "06:45",
      groupno: "2",
      teacherid: "ADMIN2",
      teachername: "Teacher B",
      teacherassigned: true,
      zoomlink: "https://zoom.test/teacher-other"
    }
  ]
});

assert.match(teacherTarget.innerHTML, /m4l-timetable-layout--week/);
assert.match(teacherTarget.innerHTML, /m4l-timetable-responsive--oversight/);
assert.match(teacherTarget.innerHTML, /m4l-timetable-layout--days/);
assert.match(teacherTarget.innerHTML, /m4l-timetable-session--muted/);
assert.match(teacherTarget.innerHTML, /https:\/\/zoom\.test\/teacher-own/);
assert.doesNotMatch(teacherTarget.innerHTML, /https:\/\/zoom\.test\/teacher-other/);

const groupedTeacherTarget = { innerHTML: "" };
renderContext.window.M4LTimetable.renderTimetable(groupedTeacherTarget, {
  viewerrole: "TEACHER",
  vieweradminid: "ADMIN1",
  viewerhasassignments: true,
  showgrouplabels: true,
  sessions: [
    {
      sessionid: "TEACHER-GROUPED-OWN",
      subjectname: "Quran",
      dayofweek: "Wed",
      starttime: "05:45",
      groupno: "1",
      teacherid: "ADMIN1",
      teachername: "Teacher A",
      teacherassigned: true,
      zoomlink: "https://zoom.test/grouped-own"
    },
    {
      sessionid: "TEACHER-GROUPED-OTHER",
      subjectname: "Quran",
      dayofweek: "Wed",
      starttime: "05:45",
      groupno: "2",
      teacherid: "ADMIN2",
      teachername: "Teacher B",
      teacherassigned: true,
      zoomlink: "https://zoom.test/grouped-other"
    }
  ]
});

assert.match(groupedTeacherTarget.innerHTML, /https:\/\/zoom\.test\/grouped-own/);
assert.doesNotMatch(groupedTeacherTarget.innerHTML, /https:\/\/zoom\.test\/grouped-other/);
assert.match(groupedTeacherTarget.innerHTML, /m4l-timetable-assignment--muted/);

console.log("Teacher-aware timetable UI and cache-delivery tests passed.");
