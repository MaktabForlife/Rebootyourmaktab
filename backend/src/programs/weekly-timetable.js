/* Ongoing weekly patterns; calendar dates belong to publication, not lesson rules. */
import { normalizeZoomLink,lessonZoom } from './zoom-links.js';
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
export function normalizePlanner(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw problem('Invalid timetable planner.');
  const arrays=['periods','requirements','availability','limits'];
  for(const key of arrays)if(input[key]!==undefined&&!Array.isArray(input[key]))throw problem(`Invalid planner ${key}.`);
  const periods=(input.periods||[]).map(row=>({id:text(row?.id),startTime:normalizeTime(row?.startTime),endTime:normalizeTime(row?.endTime)}));
  const requirements=(input.requirements||[]).map(row=>({id:text(row?.id),programSubjectId:text(row?.programSubjectId),moduleId:text(row?.moduleId),classId:text(row?.classId),teacherId:text(row?.teacherId),weeklyMinutes:Number(row?.weeklyMinutes)}));
  const availability=(input.availability||[]).map(row=>({teacherId:text(row?.teacherId),preferred:Array.isArray(row?.preferred)?row.preferred.map(text):null,unavailable:Array.isArray(row?.unavailable)?row.unavailable.map(text):null}));
  const limits=(input.limits||[]).map(row=>({teacherId:text(row?.teacherId),maxWeeklyMinutes:Number(row?.maxWeeklyMinutes)}));
  if(periods.length>16||requirements.length>100||availability.length>100||limits.length>100)throw problem('The timetable planner has too many entries.');
  if(periods.some(row=>!/^PERIOD-[\w-]{1,80}$/.test(row.id))||new Set(periods.map(row=>row.id)).size!==periods.length)throw problem('Planner periods need unique IDs.');
  if(requirements.some(row=>!/^NEED-[\w-]{1,80}$/.test(row.id))||new Set(requirements.map(row=>row.id)).size!==requirements.length)throw problem('Teaching requirements need unique IDs.');
  if(availability.some(row=>!row.teacherId||!row.preferred||!row.unavailable||row.preferred.length+row.unavailable.length>112||[...row.preferred,...row.unavailable].some(key=>!/^([0-6]):PERIOD-[\w-]{1,80}$/.test(key))||new Set([...row.preferred,...row.unavailable]).size!==row.preferred.length+row.unavailable.length)||new Set(availability.map(row=>row.teacherId)).size!==availability.length)throw problem('Invalid or duplicate teacher availability.');
  if(limits.some(row=>!row.teacherId||!Number.isInteger(row.maxWeeklyMinutes)||row.maxWeeklyMinutes<0||row.maxWeeklyMinutes>10080)||new Set(limits.map(row=>row.teacherId)).size!==limits.length)throw problem('Invalid teacher teaching-hour limit.');
  return {periods,requirements,availability,limits};
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
  const draft=emptyWeeklyDraft(text(input.timezone));
  draft.rules=input.rules.map(row=>{
    if(!row||!/^RULE-[\w-]{1,80}$/.test(row.id||''))throw problem('Each lesson needs a stable rule ID.');
    if(row.startDate||row.endDate||row.kind==='EXPLICIT')throw problem('Weekly lessons use weekdays and times. Dates are chosen only when publishing.');
    return {id:row.id,moduleId:text(row.moduleId),programSubjectId:text(row.programSubjectId),teacherId:text(row.teacherId),classIds:Array.isArray(row.classIds)?row.classIds.map(text):[],weekdays:Array.isArray(row.weekdays)?row.weekdays.slice():[],startTime:normalizeTime(row.startTime),endTime:normalizeTime(row.endTime),zoomLink:text(row.zoomLink)};
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
  const draft={...emptyWeeklyDraft(old.timezone),rules:old.rules.filter(r=>r.kind!=='EXPLICIT').map(({startDate,endDate,kind,...rule})=>({...rule,zoomLink:text(input.rules.find(r=>r.id===rule.id)?.zoomLink)}))};
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
  const planner=draft.planner;if(!planner)return {issues:[],teachers:[],requirements:[]};
  const issues=[],issue=(rowId,field,message)=>issues.push({rowId,field,message});
  const teachers=new Map((catalog.teachers||[]).map(row=>[row.id,row]));
  const classes=new Map((catalog.classes||[]).map(row=>[row.id,row]));
  const modules=new Map((catalog.modules||[]).map(row=>[row.id,row]));
  const subjects=new Map((catalog.subjects||[]).map(row=>[row.id,row]));
  const periods=new Map(planner.periods.map(row=>[row.id,row]));
  for(const period of planner.periods)if(!validTime(period.startTime)||!validTime(period.endTime)||period.startTime>=period.endTime)issue(period.id,'periods','Set a valid start and end time for each planning period.');
  for(let i=0;i<planner.periods.length;i++)for(let j=i+1;j<planner.periods.length;j++){
    const a=planner.periods[i],b=planner.periods[j];
    if(validTime(a.startTime)&&validTime(a.endTime)&&validTime(b.startTime)&&validTime(b.endTime)&&a.startTime<b.endTime&&b.startTime<a.endTime)issue(b.id,'periods','Planning periods cannot overlap.');
  }
  const booked=new Map();
  for(const row of draft.rules){
    if(!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)continue;
    if(row.teacherId)booked.set(row.teacherId,(booked.get(row.teacherId)||0)+(minutes(row.endTime)-minutes(row.startTime))*row.weekdays.length);
    for(const day of row.weekdays)for(const availability of planner.availability.filter(item=>item.teacherId===row.teacherId))for(const key of availability.unavailable){
      const [blockedDay,periodId]=key.split(':'),period=periods.get(periodId);
      if(Number(blockedDay)===day&&period&&validTime(period.startTime)&&validTime(period.endTime)&&row.startTime<period.endTime&&period.startTime<row.endTime)
        issue(row.id,'teacherId',`${teachers.get(row.teacherId)?.name||'Teacher'} is unavailable on ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]} ${period.startTime}–${period.endTime}.`);
    }
  }
  for(const row of planner.availability){
    if(!teachers.get(row.teacherId)?.active)issue('','availability','Remove availability for a teacher who is no longer eligible.');
    if([...row.preferred,...row.unavailable].some(key=>!periods.has(key.slice(2))))issue('','availability','Availability refers to a missing planning period.');
  }
  for(const row of planner.limits){
    if(!teachers.get(row.teacherId)?.active)issue('','limits','Remove the teaching-hour limit for a teacher who is no longer eligible.');
    if((booked.get(row.teacherId)||0)>row.maxWeeklyMinutes)issue('','limits',`${teachers.get(row.teacherId)?.name||'Teacher'} exceeds the weekly teaching-hour limit.`);
  }
  const seen=new Set(),requirements=[];
  for(const row of planner.requirements){
    const key=[row.programSubjectId,row.moduleId,row.classId,row.teacherId].join('|');
    if(seen.has(key))issue(row.id,'requirements','Combine duplicate teaching requirements.');seen.add(key);
    if(!classes.get(row.classId)?.active||!teachers.get(row.teacherId)?.active||!subjects.get(row.programSubjectId)?.active||row.moduleId&&(!modules.get(row.moduleId)?.active||modules.get(row.moduleId)?.programSubjectId!==row.programSubjectId))issue(row.id,'requirements','Choose an active class, subject or module, and authorised teacher for each requirement.');
    if(!Number.isInteger(row.weeklyMinutes)||row.weeklyMinutes<1||row.weeklyMinutes>10080)issue(row.id,'requirements','Enter required weekly teaching time in whole minutes.');
    const scheduled=draft.rules.filter(rule=>rule.classIds.includes(row.classId)&&rule.teacherId===row.teacherId&&(rule.programSubjectId||modules.get(rule.moduleId)?.programSubjectId)===row.programSubjectId&&rule.moduleId===row.moduleId&&validTime(rule.startTime)&&validTime(rule.endTime)&&rule.startTime<rule.endTime).reduce((total,rule)=>total+(minutes(rule.endTime)-minutes(rule.startTime))*rule.weekdays.length,0);
    requirements.push({id:row.id,scheduledMinutes:scheduled,requiredMinutes:row.weeklyMinutes,remainingMinutes:Math.max(0,row.weeklyMinutes-scheduled)});
    if(scheduled<row.weeklyMinutes)issue(row.id,'requirements',`${classes.get(row.classId)?.name||'Class'} needs ${row.weeklyMinutes-scheduled} more teaching minutes for ${modules.get(row.moduleId)?.name||subjects.get(row.programSubjectId)?.name||'this subject'} with ${teachers.get(row.teacherId)?.name||'this teacher'}.`);
  }
  return {issues,teachers:[...booked].map(([teacherId,scheduledMinutes])=>({teacherId,scheduledMinutes})),requirements};
}
export function weeklyPattern(rules,breaks=[]){
  return [...rules,...breaks.map(b=>({...b,kind:'BREAK',moduleName:b.label,classIds:[],classNames:[]}))].flatMap(r=>r.weekdays.map(weekday=>({anchor:`${r.id}@${weekday}`,ruleId:r.id,kind:r.kind||'LESSON',weekday,moduleId:r.moduleId,programSubjectId:r.programSubjectId,subjectName:r.subjectName,moduleName:r.moduleName,levelName:r.levelName,classIds:r.classIds,classNames:r.classNames,teacherId:r.teacherId,teacherName:r.teacherName,startTime:r.startTime,endTime:r.endTime,zoomLink:r.effectiveZoomLink||'',zoomSource:r.zoomSource||'NONE',status:'SCHEDULED'})))
    .sort((a,b)=>(a.weekday+6)%7-(b.weekday+6)%7||a.startTime.localeCompare(b.startTime)||a.ruleId.localeCompare(b.ruleId));
}
export function validateWeeklyTimetable(input,catalog,program,fromDate){
  const draft=normalizeWeeklyDraft(input),issues=[],conflicts=[];
  const issue=(rowId,field,message)=>issues.push({rowId,field,message});
  const subjects=index(catalog.subjects,'Subject'),levels=index(catalog.levels,'Level'),modules=index(catalog.modules,'Module'),classes=index(catalog.classes,'Class'),teachers=index(catalog.teachers,'Teacher');
  try {new Intl.DateTimeFormat('en',{timeZone:draft.timezone});if(!draft.timezone)throw Error();}catch{issue('','timezone','Choose a valid timetable timezone.');}
  if(!draft.rules.length)issue('','rules','Add at least one lesson.');
  const linked=[];
  for(const row of draft.rules){
    const before=issues.length,module=modules.get(row.moduleId),subject=subjects.get(module?.programSubjectId||row.programSubjectId),level=levels.get(module?.levelId);
    if(!subject?.active||!text(subject?.name)||subject.courseId!==program.id||row.moduleId&&(!module?.active||!text(module.name))||row.programSubjectId&&module&&module.programSubjectId!==row.programSubjectId)issue(row.id,'moduleId','Select an active subject or module belonging to this Program.');
    if(module?.levelId&&(!level?.active||!text(level?.name)||level.programSubjectId!==module.programSubjectId))issue(row.id,'moduleId','The module’s optional level must belong to the same subject.');
    if(!row.classIds.length||new Set(row.classIds).size!==row.classIds.length||row.classIds.some(id=>!classes.get(id)?.active||!text(classes.get(id)?.name)||classes.get(id).courseId!==program.id))issue(row.id,'classIds','Select one or more distinct active classes in this Program.');
    if(row.teacherId&&(!teachers.get(row.teacherId)?.active||!text(teachers.get(row.teacherId)?.name)))issue(row.id,'teacherId','Select an authorised active teacher.');
    if(!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)issue(row.id,'time','Use a same-day time range with the end after the start.');
    if(!row.weekdays.length||new Set(row.weekdays).size!==row.weekdays.length||row.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))issue(row.id,'weekdays','Choose at least one weekday without duplicates.');
    let zoom={zoomLink:'',zoomSource:'NONE'};
    try{zoom=lessonZoom(row,classes);}catch(error){issue(row.id,'zoomLink',error.message);}
    if(before===issues.length)linked.push({...row,zoomLink:normalizeZoomLink(row.zoomLink),effectiveZoomLink:zoom.zoomLink,zoomSource:zoom.zoomSource,programSubjectId:subject.id,subjectId:subject.subjectId,levelId:module?.levelId||'',subjectName:subject.name,moduleName:module?.name||subject.name,levelName:level?.name||'',classNames:row.classIds.map(id=>classes.get(id).name),teacherName:row.teacherId?teachers.get(row.teacherId).name:''});
  }
  const enrollments=(catalog.enrollments||[]).filter(e=>e.active);
  for(const row of draft.breaks||[]){
    if(!validTime(row.startTime)||!validTime(row.endTime)||row.startTime>=row.endTime)issue(row.id,'time','Use a same-day break with the end after the start.');
    if(!row.weekdays.length||new Set(row.weekdays).size!==row.weekdays.length||row.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6))issue(row.id,'weekdays','Choose at least one weekday for the break without duplicates.');
  }
  for(const e of enrollments)if(e.courseId!==program.id||!classes.has(e.classId)||!e.accountId||!validDate(e.startDate)||(e.endDate&&(!validDate(e.endDate)||e.endDate<e.startDate)))issue('','enrollments','Repair invalid class membership dates before publishing.');
  if(issues.length)return {valid:false,issues,conflicts,occurrences:[],draft,pattern:'WEEKLY'};
  const asOf=fromDate||programToday(program.timezone||draft.timezone);
  if(!validDate(asOf))throw problem('Choose a valid effective date.');
  const breaks=draft.breaks||[];
  for(let i=0;i<breaks.length;i++)for(const row of [...linked,...breaks.slice(i+1)]){
    const b=breaks[i],days=b.weekdays.filter(d=>row.weekdays.includes(d));
    if(days.length&&b.startTime<row.endTime&&row.startTime<b.endTime)conflicts.push({left:`${b.id}@${days[0]}`,right:`${row.id}@${days[0]}`,rowIds:[b.id,row.id],weekdays:days,reasons:['Break overlaps another timetable entry']});
  }
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
  const plannerReview=reviewPlanner(draft,catalog);issues.push(...plannerReview.issues);
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
