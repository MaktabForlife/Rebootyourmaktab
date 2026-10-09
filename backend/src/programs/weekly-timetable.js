/* Ongoing weekly patterns; calendar dates belong to publication, not lesson rules. */
import { normalizeZoomLink,lessonZoom } from './zoom-links.js';
import { problem } from './model.js';
import { boundedJSON, validDate, normalizeDraft as normalizeDatedDraft, publishedOccurrences as datedOccurrences } from './timetable-model.js';
export const WEEKLY_SCHEMA='105.3.2.2-weekly';
export const TIMETABLE_TIMEZONE='Africa/Johannesburg';
const text=value=>typeof value==='string'?value.trim():'';
const normalizeTime=value=>text(value).replace(/^(\d{1,2})(\d{2})$/,'$1:$2').replace(/[hH]/,':').replace(/^(\d):(\d{2})$/,'0$1:$2');
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function programToday(timezone,now=new Date()){
  try {const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
  catch {throw problem('Choose a valid Program timezone before publishing.');}
}
export const emptyWeeklyDraft=()=>({format:WEEKLY_SCHEMA,timezone:TIMETABLE_TIMEZONE,rules:[]});
export function normalizePlanner(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw problem('Invalid timetable planner.');
  const arrays=['periods','availability','limits'];
  for(const key of arrays)if(input[key]!==undefined&&!Array.isArray(input[key]))throw problem(`Invalid planner ${key}.`);
  const periods=(input.periods||[]).map(row=>({id:text(row?.id),startTime:normalizeTime(row?.startTime),endTime:normalizeTime(row?.endTime)}));
  // Older period-status rows and weekly targets were never published; remove them on draft migration.
  const availability=(input.availability||[]).filter(row=>!Array.isArray(row?.preferred)&&!Array.isArray(row?.unavailable)).map(row=>({id:text(row?.id),teacherId:text(row?.teacherId),weekday:Number(row?.weekday),startTime:normalizeTime(row?.startTime),endTime:normalizeTime(row?.endTime)}));
  const limits=(input.limits||[]).map(row=>({teacherId:text(row?.teacherId),maxWeeklyMinutes:Number(row?.maxWeeklyMinutes)}));
  if(periods.length>16||availability.length>240||limits.length>100)throw problem('The timetable planner has too many entries.');
  if(periods.some(row=>!/^PERIOD-[\w-]{1,80}$/.test(row.id))||new Set(periods.map(row=>row.id)).size!==periods.length)throw problem('Planner periods need unique IDs.');
  if(availability.some(row=>!/^AVAIL-[\w-]{1,80}$/.test(row.id)||!row.teacherId||!Number.isInteger(row.weekday)||row.weekday<0||row.weekday>6||!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)||new Set(availability.map(row=>row.id)).size!==availability.length)throw problem('Enter valid teacher availability time ranges.');
  for(let i=0;i<availability.length;i++)for(let j=i+1;j<availability.length;j++){const a=availability[i],b=availability[j];if(a.teacherId===b.teacherId&&a.weekday===b.weekday&&a.startTime<b.endTime&&b.startTime<a.endTime)throw problem('Teacher availability time ranges cannot overlap.');}
  if(limits.some(row=>!row.teacherId||!Number.isInteger(row.maxWeeklyMinutes)||row.maxWeeklyMinutes<0||row.maxWeeklyMinutes>10080)||new Set(limits.map(row=>row.teacherId)).size!==limits.length)throw problem('Invalid teacher teaching-hour limit.');
  return {periods,availability,limits};
}
export function normalizeLayout(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw problem('Invalid timetable layout.');
  const sizes=(input,pattern,min,max)=>{
    if(input===undefined)return {};
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>240)throw problem('Invalid timetable layout sizes.');
    return Object.fromEntries(Object.entries(input).map(([key,size])=>{
      if(!pattern.test(key)||!Number.isInteger(size)||size<min||size>max)throw problem(`Layout sizes must be whole numbers between ${min} and ${max}.`);
      return [key,size];
    }));
  };
  if(value.alignment!==undefined&&!['left','center','right'].includes(value.alignment))throw problem('Choose left, centre or right alignment.');
  if(value.mergeShared!==undefined&&typeof value.mergeShared!=='boolean')throw problem('Invalid shared-cell setting.');
  return {alignment:value.alignment||'center',mergeShared:value.mergeShared!==false,columnWidths:sizes(value.columnWidths,/^(time|[0-6])$/,100,600),rowHeights:sizes(value.rowHeights,/^([01]\d|2[0-3]):[0-5]\d\|([01]\d|2[0-3]):[0-5]\d$/,60,300)};
}
export function normalizeWeeklyDraft(input){
  if(!input||input.format!==WEEKLY_SCHEMA||!Array.isArray(input.rules))throw problem('Refresh the timetable to use the ongoing weekly format. Your saved draft is kept.',409);
  if(input.rules.length>100)throw problem('Use at most 100 lesson rows.');
  if(input.startDate||input.endDate||input.exceptions?.length)throw problem('Dates and exceptions do not belong to an ongoing weekly draft. Choose the effective date when publishing.');
  const draft=emptyWeeklyDraft();
  draft.rules=input.rules.map(row=>{
    if(!row||!/^RULE-[\w-]{1,80}$/.test(row.id||''))throw problem('Each lesson needs a stable rule ID.');
    if(row.startDate||row.endDate||row.kind==='EXPLICIT')throw problem('Weekly lessons use weekdays and times. Dates are chosen only when publishing.');
    if(row.teacherMode!==undefined&&row.teacherMode!=='NONE')throw problem('Choose a valid lesson teacher option.');
    if(row.teacherMode==='NONE'&&text(row.teacherId))throw problem('An unassigned lesson cannot also name a teacher.');
    const teacherId=text(row.teacherId),classIds=Array.isArray(row.classIds)?row.classIds.map(text):[];
    if(row.additionalTeacherIds!==undefined&&(!Array.isArray(row.additionalTeacherIds)||row.additionalTeacherIds.length>8||row.additionalTeacherIds.some(id=>typeof id!=='string'||!text(id))))throw problem('Choose up to eight additional teachers.');
    const additionalTeacherIds=(row.additionalTeacherIds||[]).map(text);
    if(additionalTeacherIds.length&&(!teacherId||classIds.length!==1||row.teacherMode==='NONE'||new Set([teacherId,...additionalTeacherIds]).size!==additionalTeacherIds.length+1))throw problem('Additional teachers require one class and distinct named teachers.');
    return {id:row.id,moduleId:text(row.moduleId),programSubjectId:text(row.programSubjectId),teacherId,...(additionalTeacherIds.length?{additionalTeacherIds}:{}),...(row.teacherMode==='NONE'?{teacherMode:'NONE'}:{}),classIds,weekdays:Array.isArray(row.weekdays)?row.weekdays.slice():[],startTime:normalizeTime(row.startTime),endTime:normalizeTime(row.endTime),zoomLink:text(row.zoomLink)};
  });
  if(new Set(draft.rules.map(r=>r.id)).size!==draft.rules.length)throw problem('Lesson IDs must be unique.');
  if(input.breaks!==undefined){
    if(!Array.isArray(input.breaks)||input.breaks.length>40)throw problem('Use at most 40 break rows.');
    draft.breaks=input.breaks.map(row=>{
      if(!row||!/^BREAK-[\w-]{1,80}$/.test(row.id||''))throw problem('Each break needs a stable ID.');
      const label=text(row.label)||'Break';if(label.length>80)throw problem('Keep break labels within 80 characters.');
      return {id:row.id,label,weekdays:Array.isArray(row.weekdays)?row.weekdays.slice():[],startTime:normalizeTime(row.startTime),endTime:normalizeTime(row.endTime)};
    });
    if(new Set(draft.breaks.map(r=>r.id)).size!==draft.breaks.length)throw problem('Break IDs must be unique.');
  }
  if(input.layout!==undefined)draft.layout=normalizeLayout(input.layout);
  if(input.planner!==undefined)draft.planner=normalizePlanner(input.planner);
  boundedJSON(draft);return draft;
}
export function readWeeklyDraft(input){
  if(input.format===WEEKLY_SCHEMA)return {draft:normalizeWeeklyDraft(input),conversion:null};
  const old=normalizeDatedDraft(input),oneOffCount=old.rules.filter(r=>r.kind==='EXPLICIT').length;
  for(const row of old.rules)if(Object.hasOwn(input.rules.find(r=>r.id===row.id),'zoomLink'))row.zoomLink=text(input.rules.find(r=>r.id===row.id).zoomLink);
  const draft={...emptyWeeklyDraft(),rules:old.rules.filter(r=>r.kind!=='EXPLICIT').map(({startDate,endDate,kind,...rule})=>({...rule,zoomLink:text(input.rules.find(r=>r.id===rule.id)?.zoomLink)}))};
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
const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
export function reviewPlanner(draft,catalog){
  const planner=draft.planner;if(!planner)return {issues:[],teachers:[]};
  const issues=[],issue=(rowId,field,message)=>issues.push({rowId,field,message});
  const teachers=new Map((catalog.teachers||[]).map(row=>[row.id,row]));
  for(const period of planner.periods)if(!validTime(period.startTime)||!validTime(period.endTime)||period.startTime>=period.endTime)issue(period.id,'periods','Set a valid start and end time for each planning period.');
  for(let i=0;i<planner.periods.length;i++)for(let j=i+1;j<planner.periods.length;j++){
    const a=planner.periods[i],b=planner.periods[j];
    if(validTime(a.startTime)&&validTime(a.endTime)&&validTime(b.startTime)&&validTime(b.endTime)&&a.startTime<b.endTime&&b.startTime<a.endTime)issue(b.id,'periods','Planning periods cannot overlap.');
  }
  const booked=new Map();
  for(const row of draft.rules){
    if(!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)continue;
    for(const teacherId of row.teacherIds||[row.teacherId].filter(Boolean)){
      booked.set(teacherId,(booked.get(teacherId)||0)+(minutes(row.endTime)-minutes(row.startTime))*row.weekdays.length);
      const ranges=planner.availability.filter(item=>item.teacherId===teacherId);
      if(ranges.length)for(const day of row.weekdays)if(!ranges.some(item=>item.weekday===day&&item.startTime<=row.startTime&&row.endTime<=item.endTime))
        issue(row.sourceRuleId||row.id,'teacherId',`${teachers.get(teacherId)?.name||'Teacher'} is unavailable for the full lesson on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]}.`);
    }
  }
  for(const row of planner.availability){
    if(!teachers.get(row.teacherId)?.active)issue('','availability','Remove availability for a teacher who is no longer eligible.');
  }
  for(const row of planner.limits){
    if(!teachers.get(row.teacherId)?.active)issue('','limits','Remove the teaching-hour limit for a teacher who is no longer eligible.');
    if((booked.get(row.teacherId)||0)>row.maxWeeklyMinutes)issue('','limits',`${teachers.get(row.teacherId)?.name||'Teacher'} exceeds the weekly teaching-hour limit.`);
  }
  return {issues,teachers:[...booked].map(([teacherId,scheduledMinutes])=>({teacherId,scheduledMinutes}))};
}
export function weeklyPattern(rules,breaks=[]){
  return [...rules,...breaks.map(b=>({...b,kind:'BREAK',moduleName:b.label,classIds:[],classNames:[]}))].flatMap(r=>r.weekdays.map(weekday=>({anchor:`${r.id}@${weekday}`,ruleId:r.id,kind:r.kind||'LESSON',sourceRuleId:r.sourceRuleId||'',assignmentMode:r.assignmentMode||'',weekday,moduleId:r.moduleId,programSubjectId:r.programSubjectId,subjectName:r.subjectName,moduleName:r.moduleName,levelName:r.levelName,classIds:r.classIds,classNames:r.classNames,teacherId:r.teacherId,teacherName:r.teacherName,teacherIds:r.teacherIds||[r.teacherId].filter(Boolean),teacherNames:r.teacherNames||[r.teacherName].filter(Boolean),startTime:r.startTime,endTime:r.endTime,zoomLink:r.effectiveZoomLink||'',zoomSource:r.zoomSource||'NONE',status:'SCHEDULED'})))
    .sort((a,b)=>(a.weekday+6)%7-(b.weekday+6)%7||a.startTime.localeCompare(b.startTime)||a.ruleId.localeCompare(b.ruleId));
}
export function effectiveLessonTeacherId(row,classes){
  if(row.teacherMode==='NONE')return '';
  if(row.teacherId)return row.teacherId;
  const assigned=row.classIds.map(id=>classes.get(id)?.classTeacherId||'');
  return assigned.length&&assigned[0]&&assigned.every(id=>id===assigned[0])?assigned[0]:'';
}
export function lessonTeacherGroups(row,classes){
  if(row.teacherMode==='NONE'||row.teacherId)return [{classIds:row.classIds,teacherId:row.teacherMode==='NONE'?'':row.teacherId,teacherIds:row.teacherMode==='NONE'?[]:[row.teacherId,...(row.additionalTeacherIds||[])]}];
  const groups=new Map();
  for(const id of row.classIds){const teacherId=classes.get(id)?.classTeacherId||'';if(!groups.has(teacherId))groups.set(teacherId,[]);groups.get(teacherId).push(id);}
  return [...groups].map(([teacherId,classIds])=>({teacherId,teacherIds:teacherId?[teacherId]:[],classIds}));
}
function groupedRuleId(id,index){
  const hash=[...id].reduce((value,char)=>Math.imul(value^char.charCodeAt(0),16777619)>>>0,2166136261).toString(36);
  return `RULE-${id.slice(5,65)}-${hash}-${index}`;
}
export function validateWeeklyTimetable(input,catalog,program,fromDate){
  const draft=normalizeWeeklyDraft(input),issues=[],conflicts=[];
  const issue=(rowId,field,message)=>issues.push({rowId,field,message});
  const subjects=index(catalog.subjects,'Subject'),levels=index(catalog.levels,'Level'),modules=index(catalog.modules,'Module'),classes=index(catalog.classes,'Class'),teachers=index(catalog.teachers,'Teacher');
  if(!draft.rules.length)issue('','rules','Add at least one lesson.');
  const linked=[];
  for(const row of draft.rules){
    const before=issues.length,module=modules.get(row.moduleId),subject=subjects.get(module?.programSubjectId||row.programSubjectId),level=levels.get(module?.levelId);
    const groups=lessonTeacherGroups(row,classes);
    if(!subject?.active||!text(subject?.name)||subject.courseId!==program.id||row.moduleId&&(!module?.active||!text(module.name))||row.programSubjectId&&module&&module.programSubjectId!==row.programSubjectId)issue(row.id,'moduleId','Select an active subject or module belonging to this Program.');
    if(module?.levelId&&(!level?.active||!text(level?.name)||level.programSubjectId!==module.programSubjectId))issue(row.id,'moduleId','The module’s optional level must belong to the same subject.');
    if(!row.classIds.length||new Set(row.classIds).size!==row.classIds.length||row.classIds.some(id=>!classes.get(id)?.active||!text(classes.get(id)?.name)||classes.get(id).courseId!==program.id))issue(row.id,'classIds','Select one or more distinct active classes in this Program.');
    for(const {teacherIds} of groups)for(const teacherId of teacherIds)if(!teachers.get(teacherId)?.active||!text(teachers.get(teacherId)?.name))issue(row.id,'teacherId','Select authorised active teachers.');
    if(!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)issue(row.id,'time','Use a same-day time range with the end after the start.');
    if(!row.weekdays.length||new Set(row.weekdays).size!==row.weekdays.length||row.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))issue(row.id,'weekdays','Choose at least one weekday without duplicates.');
    const zooms=groups.map(({classIds})=>{try{return lessonZoom({...row,classIds},classes);}catch(error){issue(row.id,'zoomLink',error.message);return {zoomLink:'',zoomSource:'NONE'};}});
    if(before===issues.length)groups.forEach(({teacherId,teacherIds,classIds},groupIndex)=>{
      const zoom=zooms[groupIndex];
      linked.push({...row,id:groups.length===1?row.id:groupedRuleId(row.id,groupIndex),sourceRuleId:row.id,assignmentMode:row.teacherMode==='NONE'?'NONE':row.teacherId?'EXPLICIT':'CLASS',teacherId,teacherIds,teacherNames:teacherIds.map(id=>teachers.get(id).name),classIds,zoomLink:normalizeZoomLink(row.zoomLink),effectiveZoomLink:zoom.zoomLink,zoomSource:zoom.zoomSource,programSubjectId:subject.id,subjectId:subject.subjectId,levelId:module?.levelId||'',subjectName:subject.name,moduleName:module?.name||subject.name,levelName:level?.name||'',classNames:classIds.map(id=>classes.get(id).name),teacherName:teacherId?teachers.get(teacherId).name:''});
    });
  }
  const enrollments=(catalog.enrollments||[]).filter(e=>e.active);
  for(const row of draft.breaks||[]){
    if(!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)issue(row.id,'time','Use a same-day break with the end after the start.');
    if(!row.weekdays.length||new Set(row.weekdays).size!==row.weekdays.length||row.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))issue(row.id,'weekdays','Choose at least one weekday for the break without duplicates.');
  }
  for(const e of enrollments)if(e.courseId!==program.id||!classes.has(e.classId)||!e.accountId||(e.startDate&&!validDate(e.startDate))||
    (e.endDate&&(!validDate(e.endDate)||e.startDate&&e.endDate<e.startDate)))issue('','enrollments','Repair invalid class membership dates before publishing.');
  if(issues.length)return {valid:false,issues,conflicts,occurrences:[],draft,pattern:'WEEKLY'};
  const asOf=fromDate||programToday(TIMETABLE_TIMEZONE);
  if(!validDate(asOf))throw problem('Choose a valid effective date.');
  const breaks=draft.breaks||[];
  for(let i=0;i<breaks.length;i++)for(const row of [...linked,...breaks.slice(i+1)]){
    const b=breaks[i],days=b.weekdays.filter(d=>row.weekdays.includes(d));
    if(days.length&&b.startTime<row.endTime&&row.startTime<b.endTime)conflicts.push({left:`${b.id}@${days[0]}`,right:`${row.id}@${days[0]}`,rowIds:[b.id,row.sourceRuleId||row.id],weekdays:days,reasons:['Break overlaps another timetable entry']});
  }
  for(let i=0;i<linked.length;i++)for(let j=i+1;j<linked.length;j++){
    const a=linked[i],b=linked[j],days=a.weekdays.filter(day=>b.weekdays.includes(day));
    if(!days.length||a.startTime>=b.endTime||b.startTime>=a.endTime)continue;
    const reasons=[];
    if(a.teacherIds.some(id=>b.teacherIds.includes(id)))reasons.push('Teacher overlap');
    if(a.classIds.some(id=>b.classIds.includes(id)))reasons.push('Class overlap');
    const left=enrollments.filter(e=>a.classIds.includes(e.classId)),right=enrollments.filter(e=>b.classIds.includes(e.classId));
    if(left.some(x=>right.some(y=>x.accountId===y.accountId&&days.some(day=>hasWeekday([asOf,x.startDate,y.startDate].sort().at(-1),[x.endDate||'2099-12-31',y.endDate||'2099-12-31'].sort()[0],day)))))reasons.push('Known learner membership overlap');
    if(reasons.length)conflicts.push({left:`${a.id}@${days[0]}`,right:`${b.id}@${days[0]}`,rowIds:[a.sourceRuleId||a.id,b.sourceRuleId||b.id],weekdays:days,reasons});
  }
  const plannerReview=reviewPlanner({...draft,rules:linked},catalog);issues.push(...plannerReview.issues);
  const {planner:privatePlanner,...publicDraft}=draft;
  const snapshot={schema:WEEKLY_SCHEMA,programId:program.id,programName:program.name,...publicDraft,rules:linked};boundedJSON(snapshot);
  return {valid:!issues.length&&!conflicts.length,issues,conflicts,draft,snapshot,plannerReview,pattern:'WEEKLY',asOf,occurrences:weeklyPattern(linked,breaks),warnings:['Conflict checks cover this Program and known class memberships. Cross-Program checks remain a later integration.']};
}
export function publicationRecord(row,program){
  let snapshot;try{snapshot=JSON.parse(row.SnapshotJSON);}catch{throw problem('A published timetable snapshot is damaged.',409);}
  if(snapshot.programId!==program.id||!['105.2',WEEKLY_SCHEMA].includes(snapshot.schema))throw problem('Published snapshot does not match this Program.',409);
  const weekly=snapshot.schema===WEEKLY_SCHEMA,effectiveFrom=weekly?snapshot.effectiveFrom:snapshot.startDate;
  if(!validDate(effectiveFrom)||weekly&&snapshot.format!==WEEKLY_SCHEMA)throw problem('A published timetable has an invalid effective date or format.',409);
  // Labels and audiences come only from the immutable snapshot, never today's catalog.
  return {id:row.PublicationID,version:Number(row.VersionNo),date:row.PublishedDate,by:row.PublishedByAccountID,effectiveFrom,pattern:weekly?'WEEKLY':'DATED',snapshot,occurrences:weekly?weeklyPattern(snapshot.rules,snapshot.breaks):datedOccurrences(snapshot)};
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
