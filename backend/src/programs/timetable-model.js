/* M4L V105.2 - Pure module timetable validation, occurrence derivation and conflicts. */
import { problem } from "./model.js";
export const TIMETABLE_SCHEMA = "105.2";
export const TIMETABLE_HEADERS = Object.freeze({
  ProgramSubjects: ["ProgramSubjectID", "CourseID", "SubjectID", "Active"],
  ProgramLevels: ["LevelID", "ProgramSubjectID", "Name", "SortOrder", "Active"],
  ProgramModules: ["ProgramModuleID", "ProgramSubjectID", "LevelID", "Name", "SortOrder", "Active"],
  ProgramClasses: ["ClassID", "CourseID", "Name", "AcademicYear", "Active"],
  ProgramEnrollments: ["EnrollmentID", "CourseID", "ClassID", "AccountID", "StartDate", "EndDate", "Active"],
  ProgramTimetableState: ["Revision", "CourseID", "SchemaVersion", "Sequence", "DraftJSON", "CurrentPublicationID", "ModifiedDate", "ModifiedByAccountID"],
  ProgramTimetablePublications: ["PublicationID", "CourseID", "VersionNo", "PublishedDate", "PublishedByAccountID", "SnapshotJSON", "OperationID"],
  ProgramTimetableOperations: ["OperationID", "PayloadHash", "ResultJSON", "DateStamp", "AccountID", "Action"]
});
export function emptyDraft(timezone = "") { return { timezone, startDate: "", endDate: "", rules: [], exceptions: [] }; }
export function boundedJSON(value) {
  const json = JSON.stringify(value);
  if (json.length > 40000) throw problem("This timetable is too large for one saved version. Reduce the number of rules or exceptions.");
  return json;
}
export function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export async function payloadHash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJSON(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,"0")).join("");
}
function text(value) { return typeof value === "string" ? value.trim() : ""; }
export function validDate(value) {
  return typeof value === "string" && /^20\d\d-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
}
const validTime = value => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function datesBetween(start, end) {
  const result = [];
  for (let date = Date.parse(`${start}T00:00:00Z`); date <= Date.parse(`${end}T00:00:00Z`); date += 86400000) result.push(new Date(date).toISOString().slice(0,10));
  return result;
}
function ids(items, title) {
  if (!Array.isArray(items)) throw problem(`${title} references are unavailable.`, 409);
  const result = new Map();
  for (const item of items) {
    if (!item.id || result.has(item.id)) throw problem(`${title} references have missing or duplicate IDs.`, 409);
    result.set(item.id, item);
  }
  return result;
}
export function normalizeDraft(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.rules) || !Array.isArray(input.exceptions)) throw problem("Invalid timetable draft.");
  if (input.rules.length > 100 || input.exceptions.length > 200) throw problem("Use at most 100 rules and 200 exceptions per timetable.");
  const draft = { timezone:text(input.timezone), startDate:text(input.startDate), endDate:text(input.endDate), rules:[], exceptions:[] };
  for (const row of input.rules) {
    if (!row || !/^RULE-[\w-]{1,80}$/.test(row.id || "")) throw problem("Each lesson needs a stable rule ID.");
    draft.rules.push({ id:row.id, kind:text(row.kind), moduleId:text(row.moduleId), teacherId:text(row.teacherId),
      classIds:Array.isArray(row.classIds) ? row.classIds.map(text) : [], weekdays:Array.isArray(row.weekdays) ? row.weekdays.slice() : [],
      startDate:text(row.startDate), endDate:text(row.endDate), startTime:text(row.startTime), endTime:text(row.endTime) });
  }
  for (const row of input.exceptions) {
    if (!row || !/^EX-[\w-]{1,80}$/.test(row.id || "")) throw problem("Each exception needs a stable ID.");
    draft.exceptions.push({ id:row.id, ruleId:text(row.ruleId), originalDate:text(row.originalDate), action:text(row.action),
      date:text(row.date), startTime:text(row.startTime), endTime:text(row.endTime) });
  }
  if (new Set(draft.rules.map(row=>row.id)).size !== draft.rules.length || new Set(draft.exceptions.map(row=>row.id)).size !== draft.exceptions.length) throw problem("Lesson and exception IDs must be unique.");
  boundedJSON(draft);
  return draft;
}
// Reject nonexistent and ambiguous local times instead of silently moving a lesson
// across a DST transition. Offsets are calculated from the selected timezone.
function instant(date, time, formatter) {
  const target = `${date}T${time}`;
  const wall = Date.parse(`${target}:00Z`);
  const stamp = ms => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  const candidates = new Set();
  for (const delta of [-86400000,0,86400000]) {
    const sample = wall + delta;
    const offset = Date.parse(`${stamp(sample)}:00Z`) - sample;
    const candidate = wall - offset;
    if (stamp(candidate) === target) candidates.add(candidate);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}
export function validateTimetable(input, catalog, program) {
  const draft = normalizeDraft(input);
  const issues = [];
  const issue = (rowId, field, message) => issues.push({ rowId, field, message });
  const subjects = ids(catalog.subjects,"Subject"), levels = ids(catalog.levels,"Level"), modules = ids(catalog.modules,"Module");
  const classes = ids(catalog.classes,"Class"), teachers = ids(catalog.teachers,"Teacher");
  let formatter;
  try {
    if (!draft.timezone) throw new Error();
    formatter = new Intl.DateTimeFormat("en-GB", { timeZone:draft.timezone, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23" });
  } catch { issue("","timezone","Choose a valid Program timezone before preview or publication."); }
  if (!validDate(draft.startDate) || !validDate(draft.endDate) || draft.startDate > draft.endDate
    || (Date.parse(draft.endDate)-Date.parse(draft.startDate))/86400000 > 365) issue("","window","Choose a publication window of up to 366 days.");
  if (!draft.rules.length) issue("","rules","Add at least one module lesson.");
  const linked = [];
  for (const row of draft.rules) {
    const before = issues.length;
    const module = modules.get(row.moduleId), subject = subjects.get(module?.programSubjectId), level = levels.get(module?.levelId);
    if (!module?.active || !text(module?.name) || !subject?.active || !text(subject?.name) || subject.courseId !== program.id) issue(row.id,"moduleId","Select an active module belonging to this Program.");
    if (module?.levelId && (!level?.active || !text(level?.name) || level.programSubjectId !== module.programSubjectId)) issue(row.id,"moduleId","The module's optional level must belong to the same Program subject.");
    if (!row.classIds.length || new Set(row.classIds).size !== row.classIds.length || row.classIds.some(id=>!classes.get(id)?.active || !text(classes.get(id)?.name) || classes.get(id).courseId !== program.id)) issue(row.id,"classIds","Select one or more distinct active classes in this Program.");
    if (!teachers.get(row.teacherId)?.active || !text(teachers.get(row.teacherId)?.name)) issue(row.id,"teacherId","Select an authorised active teacher.");
    if (!["RECURRING","EXPLICIT"].includes(row.kind)) issue(row.id,"kind","Choose recurring or one-off teaching.");
    if (!validDate(row.startDate) || !validDate(row.endDate) || row.startDate > row.endDate || (row.kind === "EXPLICIT" && row.startDate !== row.endDate)) issue(row.id,"dates","Enter valid dates; a one-off lesson uses the same first and last date.");
    if (!validTime(row.startTime) || !validTime(row.endTime) || row.startTime >= row.endTime) issue(row.id,"time","Use a same-day time range with the end after the start.");
    if (row.kind === "RECURRING" && (!row.weekdays.length || new Set(row.weekdays).size !== row.weekdays.length || row.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6))) issue(row.id,"weekdays","Select at least one weekday, without duplicates.");
    if (issues.length === before) linked.push({ ...row, programSubjectId:subject.id, subjectId:subject.subjectId, levelId:module.levelId || "", subjectName:subject.name, moduleName:module.name, levelName:level?.name || "",
      teacherName:teachers.get(row.teacherId).name, classNames:row.classIds.map(id=>classes.get(id).name) });
  }
  if (issues.length) return { valid:false, issues, conflicts:[], occurrences:[], draft };
  const occurrences = [];
  const anchors = new Map();
  for (const row of linked) {
    for (const date of datesBetween(draft.startDate,draft.endDate)) {
      if (date < row.startDate || date > row.endDate || (row.kind === "RECURRING" && !row.weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()))) continue;
      const occurrence = { anchor:`${row.id}@${date}`, ruleId:row.id, originalDate:date, date, startTime:row.startTime, endTime:row.endTime,
        moduleId:row.moduleId, subjectName:row.subjectName, moduleName:row.moduleName, levelName:row.levelName,
        classIds:row.classIds, classNames:row.classNames, teacherId:row.teacherId, teacherName:row.teacherName, status:"SCHEDULED" };
      occurrences.push(occurrence); anchors.set(occurrence.anchor,occurrence);
      if (occurrences.length > 1000) throw problem("Preview exceeds 1,000 occurrences. Shorten the publication window.");
    }
  }
  const excepted = new Set();
  for (const exception of draft.exceptions) {
    const anchor = `${exception.ruleId}@${exception.originalDate}`;
    const occurrence = anchors.get(anchor);
    if (!occurrence || excepted.has(anchor)) { issue(exception.id,"originalDate","Choose one existing occurrence in the publication window, with at most one exception."); continue; }
    excepted.add(anchor);
    if (exception.action === "CANCEL") occurrence.status = "CANCELLED";
    else if (exception.action === "MOVE") {
      if (!validDate(exception.date) || exception.date < draft.startDate || exception.date > draft.endDate || !validTime(exception.startTime) || !validTime(exception.endTime) || exception.startTime >= exception.endTime) { issue(exception.id,"date","Move the lesson to a valid same-day time within the publication window."); continue; }
      Object.assign(occurrence,{ date:exception.date,startTime:exception.startTime,endTime:exception.endTime,status:"RESCHEDULED" });
    } else issue(exception.id,"action","Choose Cancel or Move.");
  }
  const enrollments = catalog.enrollments || [];
  for (const enrollment of enrollments) {
    if (!enrollment.active) continue;
    if (enrollment.courseId !== program.id || !classes.has(enrollment.classId) || !enrollment.accountId || !validDate(enrollment.startDate)
      || (enrollment.endDate && (!validDate(enrollment.endDate)||enrollment.endDate<enrollment.startDate))) issue("","enrollments","A class membership reference is invalid; repair membership data before publishing.");
  }
  const scheduled = occurrences.filter(row=>row.status !== "CANCELLED");
  for (const row of scheduled) {
    row.startInstant = instant(row.date,row.startTime,formatter); row.endInstant = instant(row.date,row.endTime,formatter);
    if (row.startInstant === null || row.endInstant === null || row.endInstant <= row.startInstant) issue(row.ruleId,"time",`${row.date}: a local time is skipped or ambiguous at a clock change. Add an exception using an unambiguous time.`);
  }
  const roster = row => new Set(enrollments.filter(e=>e.active && row.classIds.includes(e.classId) && e.startDate<=row.date && (!e.endDate||e.endDate>=row.date)).map(e=>e.accountId));
  const conflicts = [];
  for (let i=0;i<scheduled.length;i++) for (let j=i+1;j<scheduled.length;j++) {
    const left=scheduled[i],right=scheduled[j];
    if (left.startInstant===null || right.startInstant===null || left.startInstant>=right.endInstant || right.startInstant>=left.endInstant) continue;
    const reasons=[];
    if (left.teacherId===right.teacherId) reasons.push("Teacher overlap");
    if (left.classIds.some(id=>right.classIds.includes(id))) reasons.push("Class overlap");
    const learners=roster(left), other=roster(right);
    if ([...learners].some(id=>other.has(id))) reasons.push("Known learner membership overlap");
    if (reasons.length) conflicts.push({ left:left.anchor,right:right.anchor,rowIds:[left.ruleId,right.ruleId],reasons });
  }
  if (!scheduled.length) issue("","rules","The publication must contain at least one scheduled lesson.");
  const snapshot = { schema:TIMETABLE_SCHEMA,programId:program.id,programName:program.name,...draft,rules:linked };
  boundedJSON(snapshot);
  return { valid:!issues.length&&!conflicts.length,issues,conflicts,occurrences:occurrences.sort((a,b)=>`${a.date} ${a.startTime} ${a.anchor}`.localeCompare(`${b.date} ${b.startTime} ${b.anchor}`)),
    snapshot, draft, warnings:["Conflicts cover this Program and known class memberships. Cross-Program teacher conflicts require later Academy integration.", ...(enrollments.length ? [] : ["No class memberships are available yet; learner-overlap checks will expand in V105.3."])] };
}

// Reconstruct only the labels/references captured at publication. Current catalog
// renames, inactive teachers and later class membership edits cannot rewrite history.
export function publishedOccurrences(snapshot) {
  const distinct=(items)=>[...new Map(items.map(item=>[item.id,item])).values()];
  const catalog={
    subjects:distinct(snapshot.rules.map(r=>({id:r.programSubjectId,courseId:snapshot.programId,subjectId:r.subjectId,name:r.subjectName,active:true}))),
    levels:distinct(snapshot.rules.filter(r=>r.levelId).map(r=>({id:r.levelId,programSubjectId:r.programSubjectId,name:r.levelName,active:true}))),
    modules:distinct(snapshot.rules.map(r=>({id:r.moduleId,programSubjectId:r.programSubjectId,levelId:r.levelId,name:r.moduleName,active:true}))),
    classes:distinct(snapshot.rules.flatMap(r=>r.classIds.map((id,i)=>({id,courseId:snapshot.programId,name:r.classNames[i],active:true})))),
    teachers:distinct(snapshot.rules.map(r=>({id:r.teacherId,name:r.teacherName,active:true}))),enrollments:[]
  };
  const result=validateTimetable(snapshot,catalog,{id:snapshot.programId,name:snapshot.programName});
  if (!result.valid) throw problem('The published snapshot cannot be derived safely. Restore its saved version.',409);
  return result.occurrences;
}
