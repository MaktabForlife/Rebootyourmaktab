import {managementStore,managementError,same,liveRoles,profileDTO,rowChanged} from './management-store.js';
import {assignmentDTO,scopeDTO,d1Profiles} from './profiles.js';
import {requireCourseCalendar,loadCourseCalendarData,projectCourseCalendar,calendarRows,planCoursePublication} from './course-calendar.js';
import {resolveCurrentPublishedGlobalTimetable} from '../../lib/global-timetable.js';
import {buildAcademyCalendarEvents} from '../../lib/academy-calendar.js';
import {validIsoDate} from '../../lib/global-course-scheduling.js';
import {dateInTimezone} from '../../lib/global-subject-delivery.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {lessonTimes} from '../entrance.js';
import {insertRecords} from './insert-records.js';
import {teacherDesignations,teacherDirectory,eligibleTeacher} from './teachers.js';

const clean=v=>String(v??'').trim();
const id=v=>/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(v);
const fields=['name','categoryKey','accessModel','timezone','startDate','endDate','startTime','endTime','teacherId','zoomLink'];
const blank=timezone=>({name:'',categoryKey:'',accessModel:'',timezone,weekdays:[],startDate:'',endDate:'',startTime:'',endTime:'',teacherId:'',zoomLink:'',sessions:[]});
const editableRoles=['STUDENT','TEACHER','PROGRAM_ADMIN'];
const hasScope=(data,auth,key)=>auth.state.account.global_admin||liveRoles(data,auth.user.accountid,key).includes('PROGRAM_ADMIN');
function categories(data) {
  return [...data.catalog.filter(s=>s.active&&s.source_namespace==='ACADEMY').map(s=>({key:'SUBJECT:'+s.subject_key,name:s.name,type:'Subject'})),
    ...data.modules.filter(m=>m.active).map(m=>({key:'MODULE:'+m.activity_key+':'+m.module_id,name:m.name,type:'Module',area:data.activities.find(a=>same(a.activity_key,m.activity_key))?.name||''}))];
}
function normalize(input,timezone) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw managementError('Enter Course details.');
  const d=blank(timezone);
  for(const field of fields){if(input[field]!==undefined&&typeof input[field]!=='string')throw managementError('Course details must contain text values.');d[field]=clean(input[field]??d[field]);}
  if(!d.name||d.name.length>160)throw managementError('Enter a Course name of up to 160 characters.');
  if(fields.some(f=>d[f].length>(f==='zoomLink'?1000:f==='categoryKey'?400:160)))throw managementError('One of the Course fields is too long.');
  if(!Array.isArray(input.weekdays)||input.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)||new Set(input.weekdays).size!==input.weekdays.length)throw managementError('Choose valid schedule days.');
  d.weekdays=[...input.weekdays].sort();
  if(!Array.isArray(input.sessions)||input.sessions.length>400)throw managementError('Prepare at most 400 Course sessions at a time.');
  d.sessions=input.sessions.map(s=>{
    if(!s||typeof s!=='object'||Array.isArray(s)||!id(s.id))throw managementError('Each session needs its own valid identifier.');
    const row={id:s.id};for(const f of ['date','startTime','endTime','teacherId','zoomLink','title','status']){if(s[f]!==undefined&&typeof s[f]!=='string')throw managementError('Session details must contain text values.');row[f]=clean(s[f]);}
    row.status||='SCHEDULED';
    if(Object.entries(row).some(([f,v])=>v.length>(f==='zoomLink'?1000:f==='title'?400:160)))throw managementError('One of the session fields is too long.');
    if(!['SCHEDULED','CANCELLED'].includes(row.status))throw managementError('Choose Scheduled or Cancelled for a session.');
    return row;
  });
  if(new Set(d.sessions.map(s=>s.id.toUpperCase())).size!==d.sessions.length)throw managementError('Each session needs a different identifier.');
  return d;
}
function holidayWarnings(data,d) {
  if(!validIsoDate(d.startDate)||!validIsoDate(d.endDate)||d.endDate<d.startDate||Date.parse(d.endDate)-Date.parse(d.startDate)>366*86400000)return [];
  const events=buildAcademyCalendarEvents(calendarRows(data.calendar,data.suppressions),d.startDate,d.endDate);
  return d.sessions.filter(s=>s.status==='SCHEDULED').flatMap(s=>events.filter(e=>e.teachingImpact==='NO_TEACHING'&&s.date>=e.startDate&&s.date<=e.endDate).map(e=>({code:'HOLIDAY',sessionId:s.id,date:s.date,message:`${s.date}: ${e.description}`})));
}
const clock=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
function zoom(v){try{const u=new URL(v);return u.protocol==='https:'&&(u.hostname==='zoom.us'||u.hostname.endsWith('.zoom.us')||u.hostname==='zoom.com'||u.hostname.endsWith('.zoom.com'))&&!u.username&&!u.password;}catch{return false;}}
const scheduleHash=d=>payloadHash(Object.fromEntries(['name','timezone','weekdays','startDate','endDate','startTime','endTime','teacherId','zoomLink'].map(key=>[key,d[key]])));
function generateSchedule(data,d) {
  const errors=[],error=(field,message)=>errors.push({field,message});
  if(!['FREE','PAID'].includes(d.accessModel))error('accessModel','Choose Free or Paid.');
  if(d.categoryKey&&!categories(data).some(c=>c.key===d.categoryKey))error('categoryKey','Choose an available Subject or Module category, or clear the category.');
  try{new Intl.DateTimeFormat('en',{timeZone:d.timezone});}catch{error('timezone','Choose a valid timezone.');}
  if(!validIsoDate(d.startDate)||!validIsoDate(d.endDate)||d.endDate<d.startDate||Date.parse(d.endDate)-Date.parse(d.startDate)>366*86400000)error('startDate','Choose valid Course start and end dates, no more than one year apart.');
  if(!d.weekdays.length)error('weekdays','Choose at least one schedule day.');
  if(!clock(d.startTime)||!clock(d.endTime)||d.endTime<=d.startTime)error('endTime','Set a finish time later than the start time in the Course schedule.');
  if(!eligibleTeacher(data,d.teacherId))error('teacherId','Choose an active designated teacher in the Course schedule.');
  if(!zoom(d.zoomLink))error('zoomLink','Enter a secure Zoom meeting link in the Course schedule.');
  if(errors.length)return {errors,sessions:[]};
  const sessions=[];
  for(let day=new Date(d.startDate+'T12:00:00Z'),last=Date.parse(d.endDate+'T12:00:00Z');day.getTime()<=last;day.setUTCDate(day.getUTCDate()+1))
    if(d.weekdays.includes(day.getUTCDay()))sessions.push({id:'CMSESSION-'+crypto.randomUUID(),date:day.toISOString().slice(0,10),startTime:d.startTime,endTime:d.endTime,teacherId:d.teacherId,zoomLink:d.zoomLink,title:d.name,status:'SCHEDULED'});
  if(!sessions.length)error('weekdays','The selected schedule days do not occur within the Course dates.');
  return {errors,sessions};
}
async function validate(data,course,d) {
  const errors=[],warnings=holidayWarnings(data,d),error=(field,message,sessionId)=>errors.push({field,message,...(sessionId?{sessionId}:{})});
  if(!['FREE','PAID'].includes(d.accessModel))error('accessModel','Choose Free or Paid.');
  if(d.categoryKey&&!categories(data).some(c=>c.key===d.categoryKey))error('categoryKey','Choose an available Subject or Module category, or clear the category.');
  let timezoneValid=true;try{new Intl.DateTimeFormat('en',{timeZone:d.timezone});}catch{timezoneValid=false;error('timezone','Choose a valid timezone.');}
  const windowValid=validIsoDate(d.startDate)&&validIsoDate(d.endDate)&&d.endDate>=d.startDate&&Date.parse(d.endDate)-Date.parse(d.startDate)<=366*86400000;
  if(!windowValid)error('startDate','Choose valid start and end dates, no more than one year apart. A one-day Course can use the same date.');
  if(!d.sessions.some(s=>s.status==='SCHEDULED'))error('sessions','Add at least one scheduled session.');
  const slots=[];
  for(const s of d.sessions){
    if(!validIsoDate(s.date)||s.date<d.startDate||s.date>d.endDate)error('date','Session date must fall within the Course dates.',s.id);
    if(!clock(s.startTime)||!clock(s.endTime)||s.endTime<=s.startTime)error('startTime','Enter a session finish time later than its start time.',s.id);
    if(s.status==='CANCELLED')continue;
    if(!eligibleTeacher(data,s.teacherId))error('teacherId','Choose an active designated teacher for this session.',s.id);
    if(!zoom(s.zoomLink))error('zoomLink','Enter a secure Zoom meeting link for this session.',s.id);
    if(data.sessions.some(r=>same(r.session_id,s.id)&&(!same(r.activity_key,course.activityKey)||!same(r.run_id,course.runId))))error('sessions','A session identifier belongs to another Course.',s.id);
    if(!timezoneValid||!validIsoDate(s.date)||!clock(s.startTime)||!clock(s.endTime))continue;
    const times=lessonTimes({date:s.date,startTime:s.startTime,endTime:s.endTime,timezone:d.timezone});
    if(!Number.isFinite(times.startsAt)||!Number.isFinite(times.endsAt))error('startTime','This session falls in a missing local clock time. Choose another time.',s.id);
    for(const other of slots)if(times.startsAt<other.endsAt&&times.endsAt>other.startsAt)error('sessions',`Sessions overlap on ${s.date}.`,s.id);
    slots.push({...times,id:s.id});
    const conflict=data.teaching.find(row=>{
      if(same(row.activity_key,course.activityKey)&&same(row.scope_key,course.runId)||!same(row.account_id,s.teacherId)||row.status!=='SCHEDULED')return false;
      const date=row.lesson_date||s.date;
      if(!row.lesson_date&&row.weekday!==new Date(s.date+'T12:00:00Z').getUTCDay())return false;
      if(row.effective_from&&date<row.effective_from||row.effective_until&&date>row.effective_until)return false;
      const t=lessonTimes({date,startTime:row.start_time,endTime:row.end_time,timezone:row.timezone});
      return times.startsAt<t.endsAt&&times.endsAt>t.startsAt;
    });
    if(conflict)warnings.push({code:'TEACHER_CLASH',sessionId:s.id,date:s.date,message:`${s.date}: this teacher has another published Academy lesson at this time.`});
  }
  return {valid:!errors.length,errors,warnings,token:await payloadHash({details:d,calendar:data.calendar,suppressions:data.suppressions,teachers:data.accounts.map(a=>[a.account_id,a.active,a.revision]),eligibleTeachers:teacherDirectory(data).map(t=>t.accountId),teaching:data.teaching})};
}
function effectiveStage(course,now=new Date()) {
  const d=course.details;
  return course.stage==='PUBLISHED'&&validIsoDate(d.startDate)&&validIsoDate(d.endDate)&&dateInTimezone(now,d.timezone)>=d.startDate&&dateInTimezone(now,d.timezone)<=d.endDate?'ACTIVE':course.stage;
}
function legacyDetails(data,a,run) {
  const d={...blank(run?.timezone||data.settings.find(s=>s.setting_key==='PlatformTimezone')?.setting_value||'Africa/Johannesburg'),name:run?.name||a.name,accessModel:data.access.find(r=>same(r.activity_key,a.activity_key)&&same(r.run_id,run?.run_id))?.access_model||data.coursePolicies.find(r=>same(r.activity_key,a.activity_key))?.legacy_access_model||''};
  if(!run)return d;
  const state=data.states.find(s=>same(s.activity_key,a.activity_key)&&same(s.run_id,run.run_id));
  const pub=data.publications.find(p=>same(p.activity_key,a.activity_key)&&same(p.publication_id,state?.current_publication_id));
  d.startDate=run.start_date||pub?.effective_from||'';d.endDate=run.end_date||pub?.effective_until||'';
  if(pub&&validIsoDate(d.startDate)&&validIsoDate(d.endDate)){
    const resolved=resolveCurrentPublishedGlobalTimetable(projectCourseCalendar(data),run.run_id,{startDate:d.startDate,endDate:d.endDate});
    if(resolved.ok)d.sessions=resolved.sessions.map(s=>({id:'CMSESSION-'+crypto.randomUUID(),date:s.sessiondate,startTime:s.starttime,endTime:s.endtime,teacherId:s.teacheraccountid||'',zoomLink:s.zoomlink||'',title:s.sessiondescription||s.modulename||d.name,status:resolved.lifecycles.find(l=>same(l.sessionid,s.sourcesessionid))?.status==='CANCELLED'?'CANCELLED':'SCHEDULED'}));
  } else d.sessions=data.sessions.filter(s=>same(s.activity_key,a.activity_key)&&same(s.run_id,run.run_id)&&data.sessionState.some(r=>same(r.session_id,s.session_id)&&r.active)).map(s=>({id:'CMSESSION-'+crypto.randomUUID(),date:s.session_date,startTime:s.start_time,endTime:s.end_time,teacherId:s.teacher_account_id||'',zoomLink:s.zoom_link||'',title:s.description||d.name,status:data.draftLifecycle.find(l=>same(l.session_id,s.session_id))?.status==='CANCELLED'?'CANCELLED':'SCHEDULED'}));
  d.weekdays=[...new Set(d.sessions.map(s=>new Date(s.date+'T12:00:00Z').getUTCDay()))];
  const first=d.sessions[0];if(first)Object.assign(d,{startTime:first.startTime,endTime:first.endTime,teacherId:first.teacherId,zoomLink:first.zoomLink});
  return d;
}
async function courseRecord(data,a,runId) {
  const run=data.runs.find(r=>same(r.activity_key,a.activity_key)&&same(r.run_id,runId));
  const meta=data.editor.find(m=>same(m.activity_key,a.activity_key)&&same(m.run_id,runId));
  const currentPublication=data.states.find(r=>same(r.activity_key,a.activity_key)&&same(r.run_id,runId))?.current_publication_id||'';
  const details=meta?JSON.parse(meta.details_json):legacyDetails(data,a,run);
  const stage=meta?.stage||(!a.active||a.lifecycle==='ARCHIVED'?'ARCHIVED':currentPublication?'PUBLISHED':'DRAFT');
  // Legacy session IDs are regenerated only when a draft is adopted. Its
  // concurrency revision depends on persisted source records, not those IDs.
  const revision=meta?String(meta.revision):await payloadHash({a,run:run||null,state:data.states.filter(s=>same(s.activity_key,a.activity_key)&&same(s.run_id,runId)),sessions:data.sessions.filter(s=>same(s.activity_key,a.activity_key)&&same(s.run_id,runId))});
  return {courseId:a.activity_id,activityKey:a.activity_key,runId,details,stage,displayStage:effectiveStage({details,stage}),revision,hasDraft:Boolean(meta),currentPublication,completedAt:meta?.completed_at||null,repeatedFrom:meta?.repeated_from_activity_key||null,validationToken:meta?.validation_sha256||'',scheduleToken:meta?.schedule_sha256||'',acceptedToken:meta?.accepted_sha256||'',legacySharedAccess:data.runs.filter(r=>same(r.activity_key,a.activity_key)).length>1};
}
export function d1CourseManagement(repository,auth,env={}) {
  const store=managementStore(repository,auth),p=store.p;
  async function load(){
    await requireCourseCalendar(repository.db);
    if(!await p("SELECT 1 FROM pragma_table_info('course_management_drafts') WHERE name='accepted_sha256'").first())throw managementError('Course management needs its database upgrade.',503,'COURSE_MANAGEMENT_SCHEMA_REQUIRED');
    const teachers=await teacherDesignations(repository);
    return loadCourseCalendarData(store,repository,{teachers:teachers.statement,editor:p('SELECT * FROM course_management_drafts'),catalog:p('SELECT * FROM subject_catalog'),teaching:p(`SELECT l.*,t.account_id,p.scope_key,p.effective_from,p.effective_until FROM published_lessons l JOIN published_lesson_teachers t USING(activity_key,publication_id,lesson_anchor) JOIN timetable_publications p USING(activity_key,publication_id) JOIN activities a USING(activity_key) WHERE a.active=1 AND a.lifecycle='ACTIVE' AND (p.pattern='COURSE' AND EXISTS(SELECT 1 FROM course_run_state s JOIN course_runs r USING(activity_key,run_id) WHERE s.activity_key=p.activity_key AND s.current_publication_id=p.publication_id AND r.active=1) OR p.pattern<>'COURSE' AND p.version_no=(SELECT max(x.version_no) FROM timetable_publications x WHERE x.activity_key=p.activity_key AND x.scope_key=p.scope_key))`)});
  }
  async function selected(data,input) {
    const a=data.activities.find(a=>a.kind==='COURSE'&&same(a.activity_id,input.courseId));
    if(!a||!hasScope(data,auth,a.activity_key))throw managementError('Choose a Course you administer.',403,'FORBIDDEN');
    const runId=clean(input.runId)||data.editor.find(m=>same(m.activity_key,a.activity_key))?.run_id||data.runs.find(r=>same(r.activity_key,a.activity_key))?.run_id||'CMRUN-'+a.activity_id;
    const unstarted=runId==='CMRUN-'+a.activity_id&&!data.runs.some(r=>same(r.activity_key,a.activity_key))&&!data.editor.some(r=>same(r.activity_key,a.activity_key));
    if(!id(runId)||input.runId&&!unstarted&&!data.runs.some(r=>same(r.activity_key,a.activity_key)&&same(r.run_id,runId))&&!data.editor.some(r=>same(r.activity_key,a.activity_key)&&same(r.run_id,runId)))throw managementError('Choose an existing Course delivery.',404);
    return courseRecord(data,a,runId);
  }
  const checkRevision=(c,input)=>{if(input.baseRevision!==c.revision)throw rowChanged({courseId:c.courseId,runId:c.runId,name:c.details.name,stage:c.displayStage},c.revision);};
  function saveMeta(statements,c,details,stage,validation=null,completedAt=c.completedAt,schedule=c.scheduleToken||null,accepted=null) {
    const next=/^\d+$/.test(c.revision)?Number(c.revision)+1:1;
    statements.push(p(`INSERT INTO course_management_drafts(activity_key,run_id,details_json,stage,completed_at,repeated_from_activity_key,validation_sha256,revision,updated_at,updated_by_account_id,schedule_sha256,accepted_sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(activity_key,run_id) DO UPDATE SET details_json=excluded.details_json,stage=excluded.stage,completed_at=excluded.completed_at,validation_sha256=excluded.validation_sha256,revision=excluded.revision,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id,schedule_sha256=excluded.schedule_sha256,accepted_sha256=excluded.accepted_sha256`,c.activityKey,c.runId,JSON.stringify(details),stage,completedAt,c.repeatedFrom,validation,next,new Date().toISOString(),auth.user.accountid,schedule,accepted));
    return String(next);
  }
  return {async run(action,input={}) {
    if(!auth.state.account.global_admin&&!auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&r.activity_key.startsWith('COURSE:')))throw managementError('Course management requires a Global Admin or assigned Course Program Admin.',403,'FORBIDDEN');
    if(action==='participants-save'){
      const data=await load(),c=await selected(data,input);
      return d1Profiles(repository,auth).run('course-roles',{...input,mode:'matrix-roles',scopeType:'SUBJECT',scopeId:c.courseId});
    }
    if(['list','get','participants'].includes(action)){
      const data=await load();
      if(action==='list') {
        const courses=[];
        for(const a of data.activities.filter(a=>a.kind==='COURSE'&&hasScope(data,auth,a.activity_key))){
          const runIds=[...new Set([...data.runs.filter(r=>same(r.activity_key,a.activity_key)).map(r=>r.run_id),...data.editor.filter(m=>same(m.activity_key,a.activity_key)).map(m=>m.run_id)])];
          if(!runIds.length)runIds.push('CMRUN-'+a.activity_id);
          for(const runId of runIds){const c=await courseRecord(data,a,runId);courses.push({courseId:c.courseId,runId,name:c.details.name,stage:c.displayStage,accessModel:c.details.accessModel,startDate:c.details.startDate,endDate:c.details.endDate,sessionCount:c.details.sessions.length,legacySharedAccess:c.legacySharedAccess});}
        }
        return {courses,capabilities:{create:Boolean(auth.state.account.global_admin),privateMedia:false},timezone:data.settings.find(s=>s.setting_key==='PlatformTimezone')?.setting_value||'Africa/Johannesburg',categories:categories(data),teachers:teacherDirectory(data),store:'D1'};
      }
      const course=await selected(data,input);
      if(action==='get'){
        const checked=course.stage==='DRAFT'&&course.validationToken?await validate(data,course,course.details):null;
        return {course,validation:checked?.valid&&checked.token===course.validationToken?checked:null,calendarWarnings:holidayWarnings(data,course.details),media:data.resources.filter(r=>same(r.activity_key,course.activityKey)&&r.active).map(r=>({id:r.resource_id,name:r.name,type:r.resource_type||'Media'})),privateMedia:false};
      }
      const a=data.activities.find(a=>same(a.activity_key,course.activityKey));
      return {scope:await scopeDTO(data,a),accounts:await Promise.all(data.accounts.map(async account=>({...profileDTO(data,account),assignment:await assignmentDTO(data,account,a)}))),roles:editableRoles};
    }
    if(!['save','validate','accept','publish','status','repeat','participant-create'].includes(action))throw managementError('Unknown Course action.',404);
    return store.change('COURSE_MANAGEMENT',input.courseId?'COURSE:'+input.courseId:'ACADEMY','course-editor/'+action,input,async()=>{
      const data=await load(),guardData={...data,accounts:data.accounts.map(a=>({...a}))},statements=[];
      let c;
      if(action==='save'&&!input.courseId){
        if(!auth.state.account.global_admin)throw managementError('Only a Global Admin can create Courses.',403,'FORBIDDEN');
        c={courseId:'COURSE-'+crypto.randomUUID(),runId:'CMRUN-'+crypto.randomUUID(),revision:'0',stage:'DRAFT',completedAt:null,repeatedFrom:null};c.activityKey='COURSE:'+c.courseId;
      }else{c=await selected(data,input);if(action!=='participant-create')checkRevision(c,input);}
      const creating=!data.activities.some(a=>same(a.activity_key,c.activityKey));
      function createActivity(name,accessModel){
        const now=new Date().toISOString();
        statements.push(p("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible,created_at,updated_at,revision) VALUES(?,?,'COURSE',?,1,'ACTIVE',0,?,?,1)",c.activityKey,c.courseId,name,now,now),p("INSERT INTO course_settings(activity_key,legacy_access_model,policy_review_state) VALUES(?,?,'CONFIRMED')",c.activityKey,accessModel==='FREE'?'FREE':'PAID'),...insertRecords(p,'data_ownership',[repository.ownershipForNewActivity(c.activityKey)]));
      }
      let result;
      if(action==='save') {
        if(c.stage!=='DRAFT')throw managementError('Create a revision before editing a published Course. Repeat a completed or archived Course to run it again.',409);
        const d=normalize(input.details,data.settings.find(s=>s.setting_key==='PlatformTimezone')?.setting_value||'Africa/Johannesburg');
        if(creating)createActivity(d.name,d.accessModel);
        const revision=saveMeta(statements,c,d,'DRAFT');
        result={courseId:c.courseId,runId:c.runId,revision,message:'Draft saved.'};
      }else if(['validate','accept','publish'].includes(action)){
        if(c.stage!=='DRAFT')throw managementError('Only a saved draft can be validated and published.',409);
        if(!data.editor.some(m=>same(m.activity_key,c.activityKey)&&same(m.run_id,c.runId)))throw managementError('Save this Course as a draft before validating.',409);
        const d=normalize(c.details,c.details.timezone);
        let generated=0,schedule=c.scheduleToken||null,generationErrors=[];
        if(action==='validate'){
          if(typeof input.regenerate!=='undefined'&&typeof input.regenerate!=='boolean')throw managementError('Choose whether to regenerate the sessions.');
          const nextSchedule=await scheduleHash(d);
          if(d.sessions.length&&schedule&&schedule!==nextSchedule&&!input.regenerate)throw managementError('The Course schedule changed. Regenerate its sessions after reviewing the replacement notice.',409,'SCHEDULE_CHANGED');
          if(!d.sessions.length||input.regenerate){
            const plan=generateSchedule(data,d);generationErrors=plan.errors;
            if(!generationErrors.length){d.sessions=plan.sessions;generated=d.sessions.length;schedule=nextSchedule;}
          }
        }
        const review=await validate(data,c,d);
        if(generationErrors.length){review.errors=review.errors.filter(e=>e.field!=='sessions'&&!generationErrors.some(g=>g.field===e.field));review.errors.push(...generationErrors);review.valid=false;}
        if(action==='validate'){
          const revision=saveMeta(statements,c,d,'DRAFT',review.valid?review.token:null,c.completedAt,schedule);
          result={validation:review,details:d,generated,revision,message:review.valid?`${generated?generated+' sessions generated. ':''}Review the sessions, then accept your review before publishing.`:'Resolve the listed schedule or session issues and validate again.'};
        }else{
          if(!review.valid||!c.validationToken||input.validationToken!==c.validationToken||review.token!==c.validationToken)throw managementError('Validate the current saved draft before publishing. Course details, the calendar or teacher availability may have changed.',409,'VALIDATION_REQUIRED');
          if(action==='accept'){
            if(review.warnings.length&&input.acknowledgeWarnings!==true)throw managementError('Review and acknowledge the publication warnings.',409,'WARNINGS_REQUIRED');
            const revision=saveMeta(statements,c,d,'DRAFT',review.token,c.completedAt,schedule,review.token);
            result={revision,acceptedToken:review.token,message:'Session review accepted. The Course is ready to publish.'};
          }else{
            if(c.acceptedToken!==review.token)throw managementError('Review and accept the current sessions before publishing.',409,'REVIEW_ACCEPTANCE_REQUIRED');
            const plan=await planCoursePublication(store,data,auth,env,c.courseId,c.runId,d);statements.push(...plan.statements,p('UPDATE activities SET website_visible=1 WHERE activity_key=?',c.activityKey));
            if(!c.legacySharedAccess)statements.push(p("UPDATE course_settings SET legacy_access_model=?,policy_review_state='CONFIRMED' WHERE activity_key=?",d.accessModel,c.activityKey));
            for(const teacher of [...new Set(d.sessions.filter(s=>s.status==='SCHEDULED').map(s=>s.teacherId))])statements.push(p("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,granted_at,granted_by_account_id,revision) SELECT ?,?,?,'TEACHER',1,'CONFIRMED',?,?,1 WHERE NOT EXISTS(SELECT 1 FROM effective_activity_roles WHERE account_id=? AND activity_key=? AND role='TEACHER')",crypto.randomUUID(),teacher,c.activityKey,new Date().toISOString(),auth.user.accountid,teacher,c.activityKey));
            const revision=saveMeta(statements,c,d,'PUBLISHED');result={courseId:c.courseId,runId:c.runId,revision,publication:plan.publication,message:'Course published to the Academy timetable.'};
          }
        }
      }else if(action==='status'){
        const target=clean(input.stage),allowed={DRAFT:['CANCELLED','ARCHIVED'],PUBLISHED:['DRAFT','COMPLETE','CANCELLED'],COMPLETE:['ARCHIVED'],CANCELLED:['ARCHIVED'],ARCHIVED:[]};
        if(!allowed[c.stage]?.includes(target))throw managementError('This Course status change is not available.',409);
        if(target==='COMPLETE'){
          const ends=c.details.sessions.filter(s=>s.status==='SCHEDULED').map(s=>lessonTimes({date:s.date,startTime:s.startTime,endTime:s.endTime,timezone:c.details.timezone}).endsAt);
          if(!ends.length||ends.some(t=>!Number.isFinite(t))||Math.max(...ends)>Date.now())throw managementError('Complete this Course after its final scheduled session has ended.',409);
        }
        const completedAt=target==='COMPLETE'?new Date().toISOString():c.completedAt;
        if(['COMPLETE','CANCELLED','ARCHIVED'].includes(target))statements.push(p('UPDATE course_runs SET active=0 WHERE activity_key=? AND run_id=?',c.activityKey,c.runId));
        const revision=saveMeta(statements,c,c.details,target,null,completedAt);result={revision,message:target==='DRAFT'?'Revision created. The current publication stays on the timetable until you publish the revision.':`Course marked ${target.toLowerCase()}. Participant records are retained.`};
      }else if(action==='repeat'){
        if(!['COMPLETE','ARCHIVED'].includes(c.stage))throw managementError('Repeat a completed or archived Course.',409);
        if(!auth.state.account.global_admin)throw managementError('Only a Global Admin can create a new Course.',403,'FORBIDDEN');
        if(typeof input.reuseMedia!=='boolean')throw managementError('Choose whether to reuse existing media.');
        const original=c;c={courseId:'COURSE-'+crypto.randomUUID(),runId:'CMRUN-'+crypto.randomUUID(),revision:'0',stage:'DRAFT',completedAt:null,repeatedFrom:original.activityKey};c.activityKey='COURSE:'+c.courseId;
        const d=normalize({...original.details,name:clean(input.name)||original.details.name,startDate:'',endDate:'',sessions:[]},original.details.timezone);createActivity(d.name,d.accessModel);
        if(input.reuseMedia)for(const resource of data.resources.filter(r=>same(r.activity_key,original.activityKey)&&r.active))statements.push(...insertRecords(p,'course_resources',[{...resource,activity_key:c.activityKey,resource_id:'CMRESOURCE-'+crypto.randomUUID(),module_id:null,task_id:null}]));
        const revision=saveMeta(statements,c,d,'DRAFT');result={courseId:c.courseId,runId:c.runId,revision,message:'New Course draft created with a new Course ID. Students have not been copied.'};
      }else if(action==='participant-create'){
        const name=clean(input.displayName);if(!name||name.length>160)throw managementError('Enter a user name of up to 160 characters.');
        if(!data.accounts.some(a=>same(a.account_id,auth.user.accountid)&&a.active))throw managementError('Your account is no longer active.',401);
        const accountId=crypto.randomUUID(),loginId=crypto.randomUUID().replaceAll('-',''),now=new Date().toISOString();
        statements.push(p('INSERT INTO accounts(account_id,display_name,login_link_id,active,created_at,updated_at,created_by_source_id,modified_by_source_id,revision) VALUES(?,?,?,1,?,?,?,?,1)',accountId,name,loginId,now,now,auth.user.accountid,auth.user.accountid),p('INSERT INTO account_credentials(account_id,pin_setup,credential_epoch) VALUES(?,0,1)',accountId),p("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,granted_at,granted_by_account_id,revision) VALUES(?,?,?,'STUDENT',1,'CONFIRMED',?,?,1)",crypto.randomUUID(),accountId,c.activityKey,now,auth.user.accountid),p('INSERT INTO course_subscription_decisions(account_id,activity_key,active,updated_at,updated_by_account_id) VALUES(?,?,1,?,?)',accountId,c.activityKey,now,auth.user.accountid));
        result={accountId,loginPath:'/account/'+loginId,message:'User added with Student access to this Course.'};
      }
      return {data:guardData,authorityScopes:[c.activityKey],statements,result,fields:[action,'CourseDetails','CourseLifecycle']};
    });
  }};
}
