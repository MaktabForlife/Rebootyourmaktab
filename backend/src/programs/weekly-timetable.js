/* Ongoing weekly patterns; calendar dates belong to publication, not lesson rules. */
import { problem } from './model.js';
import { boundedJSON, validDate, normalizeDraft as normalizeDatedDraft, publishedOccurrences as datedOccurrences } from './timetable-model.js';
export const WEEKLY_SCHEMA='105.3.2.2-weekly';
const text=value=>typeof value==='string'?value.trim():'';
const normalizeTime=value=>text(value).replace(/^(\d{1,2})(\d{2})$/,'$1:$2').replace(/[hH]/,':').replace(/^(\d):(\d{2})$/,'0$1:$2');
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function programToday(timezone,now=new Date()){
  try {const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
  catch {throw problem('Choose a valid Program timezone before publishing.');}
}
export const emptyWeeklyDraft=timezone=>({format:WEEKLY_SCHEMA,timezone:timezone||'',rules:[]});
export function normalizeWeeklyDraft(input){
  if(!input||input.format!==WEEKLY_SCHEMA||!Array.isArray(input.rules))throw problem('Refresh the timetable to use the ongoing weekly format. Your saved draft is kept.',409);
  if(input.rules.length>100)throw problem('Use at most 100 lesson rows.');
  if(input.startDate||input.endDate||input.exceptions?.length)throw problem('Dates and exceptions do not belong to an ongoing weekly draft. Choose the effective date when publishing.');
  const draft=emptyWeeklyDraft(text(input.timezone));
  draft.rules=input.rules.map(row=>{
    if(!row||!/^RULE-[\w-]{1,80}$/.test(row.id||''))throw problem('Each lesson needs a stable rule ID.');
    if(row.startDate||row.endDate||row.kind==='EXPLICIT')throw problem('Weekly lessons use weekdays and times. Dates are chosen only when publishing.');
    return {id:row.id,moduleId:text(row.moduleId),teacherId:text(row.teacherId),classIds:Array.isArray(row.classIds)?row.classIds.map(text):[],weekdays:Array.isArray(row.weekdays)?row.weekdays.slice():[],startTime:normalizeTime(row.startTime),endTime:normalizeTime(row.endTime)};
  });
  if(new Set(draft.rules.map(r=>r.id)).size!==draft.rules.length)throw problem('Lesson IDs must be unique.');
  boundedJSON(draft);return draft;
}
export function readWeeklyDraft(input){
  if(input.format===WEEKLY_SCHEMA)return {draft:normalizeWeeklyDraft(input),conversion:null};
  const old=normalizeDatedDraft(input),oneOffCount=old.rules.filter(r=>r.kind==='EXPLICIT').length;
  const draft={...emptyWeeklyDraft(old.timezone),rules:old.rules.filter(r=>r.kind!=='EXPLICIT').map(({startDate,endDate,kind,...rule})=>rule)};
  return {draft:normalizeWeeklyDraft(draft),conversion:{required:Boolean(oneOffCount||old.exceptions.length),oneOffCount,exceptionCount:old.exceptions.length,originalDraft:old}};
}
function index(rows,label){
  if(!Array.isArray(rows)||rows.some(r=>!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length)throw problem(`${label} references have missing or duplicate IDs.`,409);
  return new Map(rows.map(r=>[r.id,r]));
}
function hasWeekday(start,end,weekday){
  if(start>end)return false;
  const day=new Date(`${start}T00:00:00Z`).getUTCDay();
  const first=new Date(Date.parse(`${start}T00:00:00Z`)+((weekday-day+7)%7)*86400000).toISOString().slice(0,10);
  return first<=end;
}
export function weeklyPattern(rules){
  return rules.flatMap(r=>r.weekdays.map(weekday=>({anchor:`${r.id}@${weekday}`,ruleId:r.id,weekday,moduleId:r.moduleId,subjectName:r.subjectName,moduleName:r.moduleName,levelName:r.levelName,classIds:r.classIds,classNames:r.classNames,teacherId:r.teacherId,teacherName:r.teacherName,startTime:r.startTime,endTime:r.endTime,status:'SCHEDULED'})))
    .sort((a,b)=>(a.weekday+6)%7-(b.weekday+6)%7||a.startTime.localeCompare(b.startTime)||a.ruleId.localeCompare(b.ruleId));
}
export function validateWeeklyTimetable(input,catalog,program,fromDate){
  const draft=normalizeWeeklyDraft(input),issues=[],conflicts=[];
  const issue=(rowId,field,message)=>issues.push({rowId,field,message});
  const subjects=index(catalog.subjects,'Subject'),levels=index(catalog.levels,'Level'),modules=index(catalog.modules,'Module'),classes=index(catalog.classes,'Class'),teachers=index(catalog.teachers,'Teacher');
  try {new Intl.DateTimeFormat('en',{timeZone:draft.timezone});if(!draft.timezone)throw Error();}catch{issue('','timezone','Choose a valid timetable timezone.');}
  if(!draft.rules.length)issue('','rules','Add at least one module lesson.');
  const linked=[];
  for(const row of draft.rules){
    const before=issues.length,module=modules.get(row.moduleId),subject=subjects.get(module?.programSubjectId),level=levels.get(module?.levelId);
    if(!module?.active||!text(module?.name)||!subject?.active||!text(subject?.name)||subject.courseId!==program.id)issue(row.id,'moduleId','Select an active module belonging to this Program.');
    if(module?.levelId&&(!level?.active||!text(level?.name)||level.programSubjectId!==module.programSubjectId))issue(row.id,'moduleId','The module’s optional level must belong to the same subject.');
    if(!row.classIds.length||new Set(row.classIds).size!==row.classIds.length||row.classIds.some(id=>!classes.get(id)?.active||!text(classes.get(id)?.name)||classes.get(id).courseId!==program.id))issue(row.id,'classIds','Select one or more distinct active classes in this Program.');
    if(row.teacherId&&(!teachers.get(row.teacherId)?.active||!text(teachers.get(row.teacherId)?.name)))issue(row.id,'teacherId','Select an authorised active teacher.');
    if(!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)issue(row.id,'time','Use a same-day time range with the end after the start.');
    if(!row.weekdays.length||new Set(row.weekdays).size!==row.weekdays.length||row.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))issue(row.id,'weekdays','Choose at least one weekday without duplicates.');
    if(before===issues.length)linked.push({...row,programSubjectId:subject.id,subjectId:subject.subjectId,levelId:module.levelId||'',subjectName:subject.name,moduleName:module.name,levelName:level?.name||'',classNames:row.classIds.map(id=>classes.get(id).name),teacherName:row.teacherId?teachers.get(row.teacherId).name:''});
  }
  const enrollments=(catalog.enrollments||[]).filter(e=>e.active);
  for(const e of enrollments)if(e.courseId!==program.id||!classes.has(e.classId)||!e.accountId||!validDate(e.startDate)||(e.endDate&&(!validDate(e.endDate)||e.endDate<e.startDate)))issue('','enrollments','Repair invalid class membership dates before publishing.');
  if(issues.length)return {valid:false,issues,conflicts,occurrences:[],draft,pattern:'WEEKLY'};
  const asOf=fromDate||programToday(program.timezone||draft.timezone);
  if(!validDate(asOf))throw problem('Choose a valid effective date.');
  for(let i=0;i<linked.length;i++)for(let j=i+1;j<linked.length;j++){
    const a=linked[i],b=linked[j],days=a.weekdays.filter(day=>b.weekdays.includes(day));
    if(!days.length||a.startTime>=b.endTime||b.startTime>=a.endTime)continue;
    const reasons=[];
    if(a.teacherId&&a.teacherId===b.teacherId)reasons.push('Teacher overlap');
    if(a.classIds.some(id=>b.classIds.includes(id)))reasons.push('Class overlap');
    const left=enrollments.filter(e=>a.classIds.includes(e.classId)),right=enrollments.filter(e=>b.classIds.includes(e.classId));
    if(left.some(x=>right.some(y=>x.accountId===y.accountId&&days.some(day=>hasWeekday([asOf,x.startDate,y.startDate].sort().at(-1),[x.endDate||'2099-12-31',y.endDate||'2099-12-31'].sort()[0],day)))))reasons.push('Known learner membership overlap');
    if(reasons.length)conflicts.push({left:`${a.id}@${days[0]}`,right:`${b.id}@${days[0]}`,rowIds:[a.id,b.id],weekdays:days,reasons});
  }
  const snapshot={schema:WEEKLY_SCHEMA,programId:program.id,programName:program.name,...draft,rules:linked};boundedJSON(snapshot);
  return {valid:!conflicts.length,issues,conflicts,draft,snapshot,pattern:'WEEKLY',asOf,occurrences:weeklyPattern(linked),warnings:['Conflict checks cover this Program and known class memberships. Cross-Program checks remain a later integration.']};
}
export function publicationRecord(row,program){
  let snapshot;try{snapshot=JSON.parse(row.SnapshotJSON);}catch{throw problem('A published timetable snapshot is damaged.',409);}
  if(snapshot.programId!==program.id||!['105.2',WEEKLY_SCHEMA].includes(snapshot.schema))throw problem('Published snapshot does not match this Program.',409);
  const weekly=snapshot.schema===WEEKLY_SCHEMA,effectiveFrom=weekly?snapshot.effectiveFrom:snapshot.startDate;
  if(!validDate(effectiveFrom)||weekly&&snapshot.format!==WEEKLY_SCHEMA)throw problem('A published timetable has an invalid effective date or format.',409);
  // Labels and audiences come only from the immutable snapshot, never today's catalog.
  return {id:row.PublicationID,version:Number(row.VersionNo),date:row.PublishedDate,by:row.PublishedByAccountID,effectiveFrom,pattern:weekly?'WEEKLY':'DATED',snapshot,occurrences:weekly?weeklyPattern(snapshot.rules):datedOccurrences(snapshot)};
}
export function publicationSchedule(publications,asOf){
  if(!validDate(asOf))throw problem('Choose a valid timetable date.');
  const versions=publications.slice().sort((a,b)=>b.version-a.version);
  const latestEligible=versions.find(p=>p.effectiveFrom<=asOf);
  const current=latestEligible&&(!latestEligible.snapshot.endDate||latestEligible.snapshot.endDate>=asOf)?latestEligible:null;
  return {currentPublicationId:current?.id||'',publications:publications.map(p=>{
    const newer=versions.filter(n=>n.version>p.version),superseded=newer.some(n=>n.effectiveFrom<=p.effectiveFrom);
    const nextDate=newer.map(n=>n.effectiveFrom).filter(d=>d>p.effectiveFrom).sort()[0];
    const effectiveUntil=[p.snapshot.endDate,nextDate?new Date(Date.parse(`${nextDate}T00:00:00Z`)-86400000).toISOString().slice(0,10):''].filter(Boolean).sort()[0]||'';
    return {...p,effectiveUntil,status:superseded?'SUPERSEDED':p.id===current?.id?'CURRENT':p.effectiveFrom>asOf?'SCHEDULED':'PAST'};
  })};
}
