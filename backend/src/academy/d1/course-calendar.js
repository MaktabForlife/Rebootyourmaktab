import {createGlobalDeliveryEndpoints} from '../../routes/platform-global-delivery.js';
import {createGlobalTimetableEndpoints} from '../../routes/platform-global-timetable.js';
import {createAcademyCalendarEndpoints} from '../../routes/platform-academy-calendar.js';
import {createGlobalManagementEndpoints} from '../../routes/platform-global-management.js';
import {PLATFORM_SHEET_HEADERS} from '../../lib/platform-schema.js';
import {resolveCurrentPublishedGlobalTimetable} from '../../lib/global-timetable.js';
import {validIsoDate} from '../../lib/global-course-scheduling.js';
import {buildAcademyCalendarEvents,validateAcademyCalendarRecord} from '../../lib/academy-calendar.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {managementStore,managementError,same} from './management-store.js';
import {insertRecords} from './insert-records.js';
import {requireLearning} from './learning-state.js';
import {newActivityOwnership} from './activation-policy.js';
import {extractDriveFileId,requireItemInsideRoot,validateFileForResourceType,getResourceConfig} from '../../routes/drive-library.js';
import {courseManagementData,managedCourseScopes} from './course-authority.js';

export async function courseCalendarAvailable(db,failIncomplete=false) {
  if(!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='course_workflow_imports'").first())return false;
  const ready=Boolean(await db.prepare(`SELECT 1 FROM course_workflow_imports c JOIN learning_imports l ON l.base_run_id=c.base_run_id
    JOIN migration_runs m ON m.run_id=c.base_run_id WHERE c.singleton=1 AND m.state IN ('IMPORTED','VERIFIED','CUTOVER')
    AND m.source_snapshot_sha256=c.source_sha256 AND l.source_sha256=c.source_sha256`).first());
  if(!ready&&failIncomplete)throw managementError('Course and calendar records need their verified database import.',503,'COURSE_IMPORT_REQUIRED');
  return ready;
}
export async function requireCourseCalendar(db) {
  await requireLearning(db);
  if(!await courseCalendarAvailable(db))throw managementError('Course and calendar records need their verified database import.',503,'COURSE_IMPORT_REQUIRED');
}
const nullable=v=>String(v??'').trim()||null;
const numbered=records=>records.map((r,i)=>({...r,_rowNumber:i+2}));
export function calendarRows(events,suppressions=[]) {
  return [...events.map(r=>({CalendarEventID:r.event_id,EventType:r.event_type,Description:r.description,
    StartDate:r.start_date,EndDate:r.end_date,AlternateDate:r.alternate_date||'',TeachingImpact:r.teaching_impact,Active:Boolean(r.active)})),
    ...suppressions.map(r=>({CalendarEventID:`D1-SUPPRESSION-${r.calendar_date}`,EventType:'PUBLIC_HOLIDAY',Description:'Public Holiday',StartDate:r.calendar_date,EndDate:r.calendar_date,TeachingImpact:'NO_TEACHING',Active:false}))];
}
export async function d1CalendarEvents(db,start,end) {
  const result=await db.batch([db.prepare('SELECT * FROM academy_calendar_events'),db.prepare('SELECT * FROM academy_calendar_suppressions')]);
  return buildAcademyCalendarEvents(calendarRows(...result.map(r=>r.results)),start,end);
}

// Adapt normalized records to the established, independently tested domain
// services. Their storage port only plans record changes; it never calls Sheets.
export function projectCourseCalendar(data) {
  const course=a=>a.kind==='COURSE',scope=r=>r.activity_key.slice(7);
  const tables={
    UserAccounts:data.accounts.map(a=>({AccountID:a.account_id,DisplayName:a.display_name,Active:Boolean(a.active)})),
    UserGlobalSubjectAccess:[],
    GlobalSubjectList:data.activities.filter(course).map(a=>({SubjectID:a.activity_id,SubjectName:a.name,Active:Boolean(a.active&&a.lifecycle==='ACTIVE')})),
    GlobalModuleList:data.modules.filter(r=>r.activity_key.startsWith('COURSE:')).map(r=>({ModuleID:r.module_id,SubjectID:scope(r),ModuleName:r.name,SortOrder:r.sort_order,Active:Boolean(r.active)})),
    GlobalTaskList:data.tasks.filter(r=>r.activity_key.startsWith('COURSE:')).map(r=>({TaskID:r.task_id,SubjectID:scope(r),ModuleID:r.module_id||'',TaskName:r.name,Active:Boolean(r.active)})),
    // Preserve an unreviewed model so an explicit Subscription save is not
    // mistaken for a no-op. Public projections still default to paid access.
    GlobalSubjectAccessPolicy:data.coursePolicies.map(r=>({SubjectPolicyID:r.activity_key,SubjectID:scope(r),AccessModel:({FREE:'FREE',PAID:'SUBSCRIPTION'})[r.legacy_access_model]||'UNKNOWN',Active:true})),
    GlobalSubjectAccessMatrix:data.accounts.map(a=>({AccountID:a.account_id,_accountActive:Boolean(a.active),
      _subjectAccess:Object.fromEntries([...data.subscriptions,...data.roles.filter(r=>r.active&&r.review_state==='CONFIRMED'&&r.role==='STUDENT')].filter(e=>same(e.account_id,a.account_id)&&e.activity_key.startsWith('COURSE:')).map(e=>[scope(e).toUpperCase(),true]))})),
    GlobalSubjectRuns:data.runs.map(r=>({RunID:r.run_id,SubjectID:scope(r),RunName:r.name,Timezone:r.timezone,StartDate:r.start_date||'',EndDate:r.end_date||'',ScheduleMode:r.schedule_mode||'EXPLICIT',ScheduleDefinition:r.schedule_definition||'[]',AccessModel:data.access.find(a=>same(a.activity_key,r.activity_key)&&same(a.run_id,r.run_id))?.access_model||'PAID',Active:Boolean(r.active)})),
    GlobalTimetableSessions:data.sessions.map(r=>({SessionID:r.session_id,RunID:r.run_id,SubjectID:scope(r),ModuleID:r.module_id||'',TeacherAccountID:r.teacher_account_id||'',SessionDate:r.session_date,StartTime:r.start_time,EndTime:r.end_time,ZoomLink:r.zoom_link||'',SessionKind:r.session_kind==='LESSON'?'EXPLICIT':r.session_kind,ScheduleRuleKey:r.schedule_rule_key||'',OccurrenceDate:r.occurrence_date||'',SessionDescription:r.description||'',Active:Boolean(data.sessionState.find(s=>same(s.activity_key,r.activity_key)&&same(s.run_id,r.run_id)&&same(s.session_id,r.session_id))?.active)})),
    GlobalTimetableRunState:data.states.map(r=>({RunID:r.run_id,Stage:r.stage||'DEVELOPMENT',CurrentPublicationID:r.current_publication_id||'',DraftPublishStartDate:r.draft_publish_start_date||'',DraftPublishEndDate:r.draft_publish_end_date||''})),
    GlobalTimetablePublications:[],PublishedGlobalTimetableSessions:[],
    GlobalTimetableSessionLifecycle:[...data.lifecycles.map(r=>({SessionLifecycleID:r.lifecycle_id,SessionID:r.source_session_id,PublicationID:r.publication_id,Status:r.status,RescheduledFromSessionID:r.previous_source_session_id||'',RescheduledToSessionID:r.replacement_source_session_id||''})),
      ...data.draftLifecycle.map(r=>({SessionLifecycleID:r.lifecycle_id,SessionID:r.session_id,PublicationID:'',Status:r.status,RescheduledFromSessionID:r.previous_session_id||'',RescheduledToSessionID:r.replacement_session_id||''}))],
    GlobalResources:data.resources.map(r=>({ResourceID:r.resource_id,SubjectID:scope(r),ModuleID:r.module_id||'',TaskID:r.task_id||'',ResourceName:r.name,ResourceType:r.resource_type||'',ResourceFormat:r.resource_format||'',ResourceDescription:r.description||'',ResourceLink:r.resource_link||'',Active:Boolean(r.active)})),
    AcademyCalendar:calendarRows(data.calendar,data.suppressions),
    PlatformConfig:[{ConfigKey:'GlobalResourceDriveRootFolderID',ConfigValue:data.settings.find(r=>r.setting_key==='GlobalResourceDriveRootFolderID')?.setting_value||''},
      {ConfigKey:'PlatformTimezone',ConfigValue:data.settings.find(r=>r.setting_key==='PlatformTimezone')?.setting_value},
      {ConfigKey:'PlatformSchemaVersion',ConfigValue:'102.0.12'},
      {ConfigKey:'GlobalCurriculumVersion',ConfigValue:data.version+1},
      {ConfigKey:'GlobalTimetableVersion',ConfigValue:data.version+1}],PlatformAuditLog:[]
  };
  for(const p of data.publications){const snap=JSON.parse(p.snapshot_json);tables.GlobalTimetablePublications.push(snap.publication);tables.PublishedGlobalTimetableSessions.push(...snap.sessions);}
  for(const name of Object.keys(tables))tables[name]=numbered(tables[name]);
  tables.GlobalSubjectAccessMatrix._subjectColumns=tables.GlobalSubjectList.map((r,i)=>({subjectId:r.SubjectID,normalizedSubjectId:r.SubjectID.toUpperCase(),columnNumber:i+2}));
  for(const name of ['GlobalSubjectRuns','GlobalTimetableSessions','GlobalTimetableRunState','GlobalTimetablePublications','PublishedGlobalTimetableSessions']){
    tables[name]._courseAccessSchemaReady=true;tables[name]._courseScheduleSchemaReady=true;tables[name]._sessionDescriptionSchemaReady=true;tables[name]._draftPublishWindowSchemaReady=true;
  }
  return tables;
}

const readEndpoints={
  get:'getPlatformGlobalManagementEndpoint','drive/browse':'browsePlatformGlobalDriveFolderEndpoint','delivery/get':'getPlatformGlobalDeliveryEndpoint','timetable/get':'getPlatformGlobalTimetableEndpoint','calendar/get':'getAcademyCalendarAdminEndpoint'
};
const writeEndpoints={
  'drive-root/save':'savePlatformGlobalDriveRootEndpoint','resource/save':'savePlatformGlobalResourceEndpoint','resources/save-batch':'savePlatformGlobalResourcesBatchEndpoint',
  'subject/save':'savePlatformGlobalSubjectEndpoint','subjects/save-batch':'savePlatformGlobalSubjectsBatchEndpoint',
  'module/save':'savePlatformGlobalModuleEndpoint','task/save':'savePlatformGlobalTaskEndpoint',
  'policy/save':'savePlatformGlobalSubjectPolicyEndpoint','run/save':'savePlatformGlobalSubjectRunEndpoint',
  'timetable/generate':'generatePlatformGlobalTimetableSessionsEndpoint','timetable/session/materialize':'materializePlatformGlobalTimetableExceptionEndpoint',
  'timetable/session/save':'savePlatformGlobalTimetableSessionEndpoint','timetable/session/batch-save':'savePlatformGlobalTimetableSessionBatchEndpoint',
  'timetable/session/reschedule':'reschedulePlatformGlobalTimetableSessionEndpoint','timetable/revise':'revisePlatformGlobalTimetableEndpoint',
  'timetable/publish':'publishPlatformGlobalTimetableEndpoint','calendar/save':'saveAcademyCalendarEventEndpoint','calendar/batch-save':'saveAcademyCalendarBatchEndpoint'
};
const writable=new Set(['GlobalSubjectList','GlobalModuleList','GlobalTaskList','GlobalResources','GlobalSubjectAccessPolicy','GlobalSubjectRuns','GlobalTimetableSessions','GlobalTimetableRunState','GlobalTimetablePublications','PublishedGlobalTimetableSessions','GlobalTimetableSessionLifecycle','AcademyCalendar','PlatformConfig','PlatformAuditLog']);
function plannedStorage(tables,auth,changes) {
  const newMatrixColumns=new Set();
  return {getAuthUser:async()=>auth.user,getPlatformSpreadsheetId:()=>'',readPlatformSheet:async(_,name)=>{
    if(!Object.hasOwn(tables,name))throw Error('Unsupported Course storage read');return tables[name];
  },batchUpdateGoogleSheetValues:async(_,writes)=>{
    for(const write of writes){
      // New Subjects get empty subscription columns in the old storage port.
      // D1 represents that absence directly; an entitlement write is forbidden.
      const matrix=/^'GlobalSubjectAccessMatrix'!([A-Z]+)(\d+)$/.exec(write.range);
      if(matrix){
        const row=Number(matrix[2]),values=write.values;
        const subject=values?.[0]?.[0];
        const added=[...(changes.get('GlobalSubjectList')?.values()||[])].some(r=>same(r.SubjectID,subject)&&!tables.GlobalSubjectList.some(s=>same(s.SubjectID,subject)));
        if(write.majorDimension!=='ROWS'||values?.length!==1||values[0]?.length!==1||!(row===1&&added||row>1&&subject===false&&newMatrixColumns.has(matrix[1])&&tables.GlobalSubjectAccessMatrix.some(r=>r._rowNumber===row)))throw Error('Unsupported subscription storage write');
        if(row===1)newMatrixColumns.add(matrix[1]);
        continue;
      }
      const match=/^'([A-Za-z]+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(write.range);
      if(!match||!writable.has(match[1])||write.majorDimension!=='ROWS')throw Error('Unsupported Course storage write');
      const [,name,startColumn,startText]=match,headers=PLATFORM_SHEET_HEADERS[name],start=Number(startText);
      const column=[...startColumn].reduce((value,c)=>value*26+c.charCodeAt(0)-64,0)-1;
      for(const [index,values] of write.values.entries()){
        const rowNumber=start+index;
        if(rowNumber<2||column+values.length>headers.length)throw Error('Unsupported Course storage range');
        const old=changes.get(name)?.get(rowNumber)||tables[name].find(r=>r._rowNumber===rowNumber)||{};
        const record={...old,_rowNumber:rowNumber,...Object.fromEntries(values.map((value,i)=>[headers[column+i],value]))};
        if(!changes.has(name))changes.set(name,new Map());changes.get(name).set(rowNumber,record);
      }
    }
  }};
}
function validateCalendarInput(action,input,tables) {
  if(!action.startsWith('calendar/')||action.endsWith('/get'))return;
  const changes=action.endsWith('/batch-save')?input.changes:[input];
  if(!Array.isArray(changes))throw managementError('Calendar changes must be a list.');
  for(const c of changes){
    if(!c||typeof c!=='object'||Array.isArray(c))throw managementError('Calendar change is invalid.');
    const id=c.eventId||c.calendarEventId,existing=tables.AcademyCalendar.find(r=>same(r.CalendarEventID,id));
    if(id&&!existing&&!/^SA-PUBLIC-HOLIDAY-\d{4}-\d{2}-\d{2}$/.test(id))throw managementError('Calendar entry changed or is unavailable. Refresh before saving.',409,'WORKFLOW_CHANGED');
    const type=String(existing?.EventType||c.eventType||'TERM').toUpperCase(),start=c.startDate??existing?.StartDate??(String(id||'').startsWith('SA-PUBLIC-HOLIDAY-')?id.slice('SA-PUBLIC-HOLIDAY-'.length):undefined);
    const record={EventType:type,Description:type==='ISLAMIC_DAY'?existing?.Description:c.description??existing?.Description??(type==='PUBLIC_HOLIDAY'?'Public Holiday':''),
      StartDate:start,EndDate:type==='TERM'?c.endDate??existing?.EndDate??start:start,
      AlternateDate:type==='ISLAMIC_DAY'?existing?.AlternateDate||'':'',TeachingImpact:type==='PUBLIC_HOLIDAY'?'NO_TEACHING':type==='ISLAMIC_DAY'?'INFORMATION':c.teachingImpact??existing?.TeachingImpact??'INFORMATION'};
    if(String(record.Description||'').length>400)throw managementError('Calendar descriptions must be at most 400 characters.');
    try{validateAcademyCalendarRecord(record);}catch(e){throw managementError(e.message);}
  }
}

function windowLimit(action,input,tables) {
  if(!['timetable/publish','timetable/generate'].includes(action))return;
  const run=tables.GlobalSubjectRuns.find(r=>same(r.RunID,input.runId||input.runid));
  if(!run)return;
  const state=tables.GlobalTimetableRunState.find(r=>same(r.RunID,run.RunID));
  const start=run.StartDate||(action.endsWith('publish')?state?.DraftPublishStartDate:input.generationStartDate||input.generationstartdate||input.scheduleStartDate||input.schedulestartdate);
  const end=run.EndDate||(action.endsWith('publish')?state?.DraftPublishEndDate:input.generationEndDate||input.generationenddate||input.scheduleEndDate||input.scheduleenddate);
  if(validIsoDate(start)&&validIsoDate(end)&&(Date.parse(end)-Date.parse(start))/86400000>366)throw managementError('Prepare or publish at most one year of Course sessions at a time.');
}
function upsert(p,table,records,keys) {
  if(!records.length)return [];
  const columns=Object.keys(records[0]);
  return [p(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?) WHERE true
    ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${columns.filter(c=>!keys.includes(c)).map(c=>`${c}=excluded.${c}`).join(',')}`,JSON.stringify(records))];
}
export async function courseCalendarStatements(store,data,tables,changes,auth,env) {
  const p=store.p,statements=[];
  const records=name=>[...(changes.get(name)?.values()||[])];
  const activity=subject=>{const found=tables.GlobalSubjectList.find(a=>same(a.SubjectID,subject));if(!found)throw managementError('Course subject is unavailable.',409);return 'COURSE:'+found.SubjectID;};
  const run=id=>{const matches=tables.GlobalSubjectRuns.filter(r=>same(r.RunID,id));if(matches.length!==1)throw managementError('Course identifier is ambiguous.',409);return matches[0];};
  const newSubjects=[],subjectRows=[],policyRows=new Map(),now=new Date().toISOString();
  for(const r of records('GlobalSubjectList')){
    const old=data.activities.find(a=>a.kind==='COURSE'&&same(a.activity_id,r.SubjectID)),key=activity(r.SubjectID);
    subjectRows.push({activity_key:key,activity_id:r.SubjectID,kind:'COURSE',name:r.SubjectName,active:Number(r.Active),lifecycle:r.Active?'ACTIVE':'ARCHIVED',website_visible:old?.website_visible??1,created_at:old?old.created_at:now,updated_at:now,revision:(old?.revision||0)+1});
    if(!old){newSubjects.push(newActivityOwnership(key,env));policyRows.set(key,{activity_key:key,legacy_access_model:'PAID',policy_review_state:'CONFIRMED'});}
  }
  for(const r of records('GlobalSubjectAccessPolicy')){const key=activity(r.SubjectID);policyRows.set(key,{activity_key:key,legacy_access_model:r.AccessModel==='FREE'?'FREE':'PAID',policy_review_state:'CONFIRMED'});}
  statements.push(...upsert(p,'activities',subjectRows,['activity_key']),...upsert(p,'course_settings',[...policyRows.values()],['activity_key']),...insertRecords(p,'data_ownership',newSubjects));
  if(subjectRows.length)statements.push(p("UPDATE subject_catalog AS s SET name=json_extract(j.value,'$.name'),active=json_extract(j.value,'$.active') FROM json_each(?) j WHERE s.source_namespace='GLOBAL_REFERENCE' AND s.subject_id=json_extract(j.value,'$.activity_id') COLLATE NOCASE",JSON.stringify(subjectRows)));
  for(const [name,oldRows,id] of [['GlobalModuleList',data.modules,'module_id'],['GlobalTaskList',data.tasks,'task_id']])for(const r of records(name)){
    const old=oldRows.find(s=>s.activity_key.startsWith('COURSE:')&&same(s[id],name==='GlobalModuleList'?r.ModuleID:r.TaskID));
    if(old&&!same(old.activity_key,activity(r.SubjectID)))throw managementError('Create a new entry to move curriculum between Subjects.',409);
  }
  statements.push(...upsert(p,'modules',records('GlobalModuleList').map(r=>({activity_key:activity(r.SubjectID),module_id:r.ModuleID,program_subject_id:null,level_id:null,name:r.ModuleName,sort_order:r.SortOrder,active:Number(r.Active)})),['activity_key','module_id']));
  statements.push(...upsert(p,'tasks',records('GlobalTaskList').map(r=>({activity_key:activity(r.SubjectID),task_id:r.TaskID,program_subject_id:null,module_id:nullable(r.ModuleID),name:r.TaskName,sort_order:0,active:Number(r.Active)})),['activity_key','task_id']));
  const resources=records('GlobalResources'),root=tables.PlatformConfig.find(r=>r.ConfigKey==='GlobalResourceDriveRootFolderID')?.ConfigValue;
  for(const r of resources){
    const old=data.resources.find(s=>same(s.resource_id,r.ResourceID));
    if(old&&!same(old.activity_key,activity(r.SubjectID)))throw managementError('Create a new resource to move it to another Course.',409);
    // New/replaced files are verified by the domain service. Retained active
    // files must also be checked: a Drive move must not make an edit publish an
    // out-of-folder file. Every later open checks the root again.
    const fileId=extractDriveFileId(r.ResourceLink);
    if(old&&r.Active&&fileId&&r.ResourceLink===old.resource_link){
      if(!root)throw managementError('Select the Course resource folder first.',409);
      let file;try{file=await requireItemInsideRoot(env,fileId,root,{requireFile:true});}
      catch(error){if(String(error.message).startsWith('Google Drive API error'))throw error;throw managementError(error.message);}
      const validation=validateFileForResourceType(file,getResourceConfig(r.ResourceType));if(!validation.ok)throw managementError(validation.error);
    }
  }
  statements.push(...upsert(p,'course_resources',resources.map(r=>({activity_key:activity(r.SubjectID),resource_id:r.ResourceID,module_id:nullable(r.ModuleID),task_id:nullable(r.TaskID),name:r.ResourceName,resource_type:r.ResourceType,resource_format:r.ResourceFormat,description:nullable(r.ResourceDescription),resource_link:r.ResourceLink,active:Number(r.Active)})),['activity_key','resource_id']));
  statements.push(...upsert(p,'academy_settings',records('PlatformConfig').filter(r=>r.ConfigKey==='GlobalResourceDriveRootFolderID').map(r=>({setting_key:r.ConfigKey,setting_value:String(r.ConfigValue),updated_at:r.UpdatedDate,updated_by_account_id:auth.user.accountid})),['setting_key']));
  const runs=records('GlobalSubjectRuns');
  statements.push(...upsert(p,'course_runs',runs.map(r=>({activity_key:activity(r.SubjectID),run_id:r.RunID,name:r.RunName,timezone:r.Timezone,start_date:nullable(r.StartDate),end_date:nullable(r.EndDate),schedule_mode:r.ScheduleMode,schedule_definition:r.ScheduleDefinition,active:Number(r.Active)})),['activity_key','run_id']));
  statements.push(...upsert(p,'course_run_access',runs.map(r=>({activity_key:activity(r.SubjectID),run_id:r.RunID,access_model:r.AccessModel})),['activity_key','run_id']));
  const sessions=records('GlobalTimetableSessions');
  statements.push(...upsert(p,'course_draft_sessions',sessions.map(r=>({activity_key:activity(r.SubjectID),run_id:r.RunID,session_id:r.SessionID,module_id:nullable(r.ModuleID),teacher_account_id:nullable(r.TeacherAccountID),session_date:r.SessionDate,start_time:r.StartTime,end_time:r.EndTime,session_kind:r.SessionKind||'EXPLICIT',zoom_link:nullable(r.ZoomLink),schedule_rule_key:nullable(r.ScheduleRuleKey),occurrence_date:nullable(r.OccurrenceDate),description:nullable(r.SessionDescription)})),['activity_key','run_id','session_id']));
  statements.push(...upsert(p,'course_session_state',sessions.map(r=>({activity_key:activity(r.SubjectID),run_id:r.RunID,session_id:r.SessionID,active:Number(r.Active)})),['activity_key','run_id','session_id']));
  const publications=[];const lessons=[];const teachers=[];
  for(const r of records('GlobalTimetablePublications')){
    const a=activity(r.SubjectID),snapshot={publication:cleanRecord(r),sessions:tables.PublishedGlobalTimetableSessions.filter(s=>same(s.PublicationID,r.PublicationID)).map(cleanRecord)};
    publications.push({activity_key:a,publication_id:r.PublicationID,scope_key:r.RunID,version_no:r.VersionNo,pattern:'COURSE',published_at:r.PublishedDate,published_by_source_id:auth.user.accountid,effective_from:r.PublishStartDate,effective_until:r.PublishEndDate,timezone:r.Timezone,snapshot_json:JSON.stringify(snapshot),source_snapshot_sha256:await payloadHash(snapshot),conversion:'EXACT'});
    const resolved=resolveCurrentPublishedGlobalTimetable(tables,r.RunID,{startDate:r.PublishStartDate,endDate:r.PublishEndDate});
    if(!resolved.ok)throw managementError('The Course publication is inconsistent.',409,'COURSE_PUBLICATION_INVALID');
    if(resolved.sessions.length>1500)throw managementError('Publish fewer Course occurrences together.');
    for(const s of resolved.sessions){
      const lifecycle=resolved.lifecycles.find(l=>same(l.sessionid,s.sourcesessionid));
      lessons.push({activity_key:a,publication_id:r.PublicationID,lesson_anchor:s.publishedsessionid||s.sessionid||s.sourcesessionid,source_rule_id:s.schedulerulekey||s.sourcesessionid||null,module_id:nullable(s.moduleid),kind:s.sessionkind||'EXPLICIT',status:lifecycle?.status||'SCHEDULED',weekday:null,lesson_date:s.sessiondate,start_time:s.starttime,end_time:s.endtime,timezone:r.Timezone,title:s.modulename||s.sessiondescription||r.RunName,zoom_link:nullable(s.zoomlink),snapshot_json:JSON.stringify(s)});
      if(s.teacheraccountid)teachers.push({activity_key:a,publication_id:r.PublicationID,lesson_anchor:lessons.at(-1).lesson_anchor,account_id:s.teacheraccountid});
    }
  }
  statements.push(...insertRecords(p,'timetable_publications',publications),...insertRecords(p,'published_lessons',lessons),...insertRecords(p,'published_lesson_teachers',teachers));
  statements.push(...upsert(p,'course_run_state',records('GlobalTimetableRunState').map(r=>({activity_key:activity(run(r.RunID).SubjectID),run_id:r.RunID,stage:r.Stage,current_publication_id:nullable(r.CurrentPublicationID),draft_publish_start_date:nullable(r.DraftPublishStartDate),draft_publish_end_date:nullable(r.DraftPublishEndDate)})),['activity_key','run_id']));
  const draftLife=[],publishedLife=[];
  for(const r of records('GlobalTimetableSessionLifecycle')){
    if(r.PublicationID){const pub=tables.GlobalTimetablePublications.find(s=>same(s.PublicationID,r.PublicationID));if(!pub)throw Error('Missing lifecycle publication');
      publishedLife.push({activity_key:activity(pub.SubjectID),lifecycle_id:r.SessionLifecycleID,publication_id:r.PublicationID,source_session_id:r.SessionID,status:r.Status,previous_source_session_id:nullable(r.RescheduledFromSessionID),replacement_source_session_id:nullable(r.RescheduledToSessionID)});
    }else{const matches=tables.GlobalTimetableSessions.filter(s=>same(s.SessionID,r.SessionID));if(matches.length!==1)throw managementError('Course session is ambiguous.',409);const s=matches[0];
      draftLife.push({activity_key:activity(s.SubjectID),run_id:s.RunID,session_id:s.SessionID,lifecycle_id:r.SessionLifecycleID,status:r.Status,previous_session_id:nullable(r.RescheduledFromSessionID),replacement_session_id:nullable(r.RescheduledToSessionID)});}
  }
  statements.push(...insertRecords(p,'lesson_lifecycle',publishedLife),...upsert(p,'course_draft_lifecycle',draftLife,['activity_key','run_id','session_id']));
  statements.push(...upsert(p,'academy_calendar_events',records('AcademyCalendar').map(r=>({event_id:r.CalendarEventID,event_type:r.EventType,description:r.Description,start_date:r.StartDate,end_date:r.EndDate,alternate_date:nullable(r.AlternateDate),teaching_impact:r.TeachingImpact||'INFORMATION',active:Number(r.Active)})),['event_id']));
  statements.push(...insertRecords(p,'audit_events',records('PlatformAuditLog').map(r=>({event_id:r.AuditID,occurred_at:r.DateStamp,actor_account_id:auth.user.accountid,actor_name_snapshot:auth.user.username,authority:auth.state.account.global_admin?'GLOBAL_ADMIN':'PROGRAM_ADMIN',scope_key:'ACADEMY',action:r.Action,record_kind:r.RecordType,record_id:r.RecordID,changed_fields_json:r.ChangedFields}))));
  return statements;
}
function cleanRecord(r){return Object.fromEntries(Object.entries(r).filter(([name])=>!name.startsWith('_')));}

export async function loadCourseCalendarData(store,repository,extra={}) {
  return store.load({...Object.fromEntries(Object.entries({subscriptions:await repository.subscriptionSource(),runs:'course_runs',sessions:'course_draft_sessions',states:'course_run_state',publications:"timetable_publications WHERE pattern='COURSE'",lifecycles:'lesson_lifecycle',modules:'modules',tasks:'tasks',resources:'course_resources',access:'course_run_access',sessionState:'course_session_state',draftLifecycle:'course_draft_lifecycle',calendar:'academy_calendar_events',suppressions:'academy_calendar_suppressions',settings:'academy_settings',coursePolicies:'course_settings'}).map(([name,table])=>[name,store.p(`SELECT * FROM ${table}`)])),...extra});
}

// Build the new editor's explicit timetable in memory, then use the same
// publication validator and normalized SQL writer as the established scheduler.
// The caller commits this plan, its draft revision and receipt in one batch.
export async function planCoursePublication(store,data,auth,env,courseId,runId,details) {
  const tables=projectCourseCalendar(data),changes=new Map();
  const stage=(name,record,match)=>{
    const old=tables[name].find(match),rowNumber=old?old._rowNumber:Math.max(1,...tables[name].map(r=>r._rowNumber))+1;
    const row={...old,...record,_rowNumber:rowNumber};
    if(!changes.has(name))changes.set(name,new Map());changes.get(name).set(rowNumber,row);
    if(old)tables[name][tables[name].indexOf(old)]=row;else tables[name].push(row);
  };
  const oldActivity=data.activities.find(a=>same(a.activity_id,courseId)&&a.kind==='COURSE');
  const sharedLegacyScope=data.runs.filter(r=>same(r.activity_key,'COURSE:'+courseId)).length>1;
  stage('GlobalSubjectList',{SubjectID:courseId,SubjectName:sharedLegacyScope?oldActivity.name:details.name,Active:true},r=>same(r.SubjectID,courseId));
  stage('GlobalSubjectRuns',{RunID:runId,SubjectID:courseId,RunName:details.name,Timezone:details.timezone,StartDate:details.startDate,EndDate:details.endDate,AccessModel:details.accessModel,ScheduleMode:'EXPLICIT',ScheduleDefinition:'[]',Active:true},r=>same(r.RunID,runId));
  stage('GlobalTimetableRunState',{RunID:runId,Stage:'DEVELOPMENT'},r=>same(r.RunID,runId));
  for(const s of [...tables.GlobalTimetableSessions].filter(s=>same(s.RunID,runId)))stage('GlobalTimetableSessions',{...s,Active:false},r=>same(r.SessionID,s.SessionID));
  for(const s of details.sessions){
    stage('GlobalTimetableSessions',{SessionID:s.id,RunID:runId,SubjectID:courseId,ModuleID:'',TeacherAccountID:s.teacherId,SessionDate:s.date,StartTime:s.startTime,EndTime:s.endTime,ZoomLink:s.zoomLink,SessionDescription:s.title||details.name,SessionKind:'EXPLICIT',ScheduleRuleKey:'',OccurrenceDate:'',Active:true},r=>same(r.SessionID,s.id));
    stage('GlobalTimetableSessionLifecycle',{SessionLifecycleID:'CMLIFE-'+s.id,SessionID:s.id,PublicationID:'',Status:s.status,RescheduledFromSessionID:'',RescheduledToSessionID:''},r=>same(r.SessionID,s.id)&&!r.PublicationID);
  }
  const domainAuth=auth.state.account.global_admin?auth:{...auth,user:{...auth.user,role:'ADMIN'}};
  const endpoint=createGlobalTimetableEndpoints(plannedStorage(tables,domainAuth,changes)).publishPlatformGlobalTimetableEndpoint;
  const response=await endpoint(new Request('https://academy.invalid/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId})}),env),body=await response.json();
  if(!response.ok||body.success===false)throw managementError(body.error||'The Course timetable could not be published.',response.status,'COURSE_PUBLICATION_INVALID');
  for(const [name,rows] of changes)for(const [rowNumber,record] of rows){const at=tables[name].findIndex(r=>r._rowNumber===rowNumber);if(at<0)tables[name].push(record);else tables[name][at]=record;}
  return {statements:await courseCalendarStatements(store,data,tables,changes,auth,env),publication:body.publication};
}

export function d1CourseCalendar(repository,auth,env={}) {
  const store=managementStore(repository,auth),p=store.p;
  async function load(){return loadCourseCalendarData(store,repository);}
  async function execute(action,input,data,request){
    // ADMIN is the older domain service's scoped-admin name. The D1 boundary
    // supplies filtered records and checks each Course again in its transaction.
    const domainAuth=auth.state.account.global_admin?auth:{...auth,user:{...auth.user,role:'ADMIN'}};
    const tables=projectCourseCalendar(data),changes=new Map(),storage=plannedStorage(tables,domainAuth,changes);
    windowLimit(action,input,tables);
    validateCalendarInput(action,input,tables);
    const endpoints={...createGlobalDeliveryEndpoints(storage),...createGlobalTimetableEndpoints(storage),...createAcademyCalendarEndpoints(storage),...createGlobalManagementEndpoints(storage)};
    const fn=endpoints[readEndpoints[action]||writeEndpoints[action]];
    if(!fn)throw managementError('This Course action is unavailable.',501,'OPERATION_NOT_MIGRATED');
    const response=await fn(new Request(request?.url||'https://academy.invalid/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),env),body=await response.json();
    if(!response.ok||body.success===false)throw managementError(body.error||'Course action could not be completed.',response.status,'COURSE_ACTION_FAILED');
    // A real storage write does not mutate the service's input snapshot. Apply
    // the plan only after the handler has produced its response.
    for(const [name,rows] of changes)for(const [rowNumber,record] of rows){
      const at=tables[name].findIndex(r=>r._rowNumber===rowNumber);
      if(at<0)tables[name].push(record);else tables[name][at]=record;
    }
    return {tables,changes,body};
  }
  return {async run(action,input={},request){
    if(!auth.state.account.global_admin&&(!managedCourseScopes(auth.state).length||action.startsWith('calendar/')||action.startsWith('drive')))
      throw managementError('This action requires an authorised Course administrator.',403,'FORBIDDEN');
    await requireCourseCalendar(repository.db);
    if(readEndpoints[action]){const data=courseManagementData(await load(),auth);const {body}=await execute(action,input,data,request);return {...body,workflowStore:'D1',workflowRevision:String(data.version),...(action==='get'?{capabilities:{curriculum:true,courseCreation:Boolean(auth.state.account.global_admin),resourceManagement:true,subscriptionManagement:await repository.subscriptionSource()==='effective_course_subscriptions'}}:{})};}
    if(!writeEndpoints[action])throw managementError('This Course action is unavailable.',501,'OPERATION_NOT_MIGRATED');
    const dataset=action.startsWith('calendar/')?'ACADEMY_CALENDAR':'COURSE_MANAGEMENT';
    return store.change(dataset,'ACADEMY',action,input,async()=>{
      const data=await load();
      if(input.workflowRevision!==String(data.version))throw managementError('Courses or calendar records changed elsewhere. Your draft is kept; refresh and review the saved records.',409,'WORKFLOW_CHANGED');
      const scoped=courseManagementData(data,auth),{tables,changes,body}=await execute(action,input,scoped,request);
      // Once a delivery has been adopted by the new editor, older scheduling
      // clients must not overwrite its independently saved draft/lifecycle.
      if(await p("SELECT 1 FROM sqlite_schema WHERE name='course_management_drafts' AND type='table'").first()) {
        const managed=(await p('SELECT activity_key FROM course_management_drafts').all()).results;
        const affected=new Set();
        for(const name of ['GlobalSubjectList','GlobalSubjectAccessPolicy','GlobalSubjectRuns','GlobalTimetableSessions','GlobalTimetablePublications'])for(const row of changes.get(name)?.values()||[])if(row.SubjectID)affected.add('COURSE:'+row.SubjectID);
        for(const row of changes.get('GlobalTimetableRunState')?.values()||[]){const run=tables.GlobalSubjectRuns.find(r=>same(r.RunID,row.RunID));if(run)affected.add('COURSE:'+run.SubjectID);}
        if(managed.some(m=>[...affected].some(a=>same(a,m.activity_key))))throw managementError('Use Course management to update this Course. Its saved draft and timetable are managed there.',409,'COURSE_EDITOR_REQUIRED');
      }
      if(!auth.state.account.global_admin) {
        for(const r of changes.get('GlobalSubjectList')?.values()||[])if(!scoped.activities.some(a=>a.kind==='COURSE'&&same(a.activity_id,r.SubjectID)))
          throw managementError('Only a Global Admin can create Courses.',403,'FORBIDDEN');
        if(changes.has('AcademyCalendar')||[...(changes.get('PlatformConfig')?.values()||[])].some(r=>!['GlobalCurriculumVersion','GlobalTimetableVersion'].includes(r.ConfigKey)))
          throw managementError('Academy settings require a Global Admin.',403,'FORBIDDEN');
      }
      return {data,authorityScopes:scoped.activities.filter(a=>a.kind==='COURSE').map(a=>a.activity_key),statements:await courseCalendarStatements(store,data,tables,changes,auth,env),result:{...body,workflowStore:'D1',workflowRevision:String(data.version+1)},fields:[...changes.keys()].filter(n=>!['PlatformAuditLog','PlatformConfig'].includes(n))};
    });
  }};
}
