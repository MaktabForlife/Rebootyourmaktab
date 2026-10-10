import {PLATFORM_SHEET_HEADERS,isActivePlatformValue} from '../../src/lib/platform-schema.js';
import {validateAcademyCalendarRecord} from '../../src/lib/academy-calendar.js';
import {validIsoDate} from '../../src/lib/global-course-scheduling.js';
import {sha256,stableJSON,requireCondition} from './snapshot.mjs';
const key=v=>String(v||'').toUpperCase(),nullable=v=>String(v||'').trim()||null;
export function buildCourseCalendarImport(snapshot,base) {
  const book=snapshot.workbooks.find(b=>b.kind==='PLATFORM');
  requireCondition(book,'COURSE_PLATFORM_MISSING');
  const rows=name=>{
    const tab=book.tabs.find(t=>t.title===name);requireCondition(tab,'COURSE_SOURCE_TABLE_MISSING',{table:name});
    const headers=PLATFORM_SHEET_HEADERS[name];
    requireCondition(JSON.stringify(tab.rows[0])===JSON.stringify(headers),'COURSE_SOURCE_HEADERS_INVALID',{table:name});
    return tab.rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
  };
  const sourceRuns=rows('GlobalSubjectRuns'),sourcePolicies=rows('GlobalSubjectAccessPolicy');
  const access=base.tables.course_runs.map(run=>{
    const matches=sourceRuns.filter(r=>key(r.RunID)===key(run.run_id)&&key(r.SubjectID)===key(run.activity_key.slice(7)));
    requireCondition(matches.length===1,'COURSE_RUN_SOURCE_INVALID');
    let model=key(matches[0].AccessModel);
    if(!model){const policies=sourcePolicies.filter(p=>key(p.SubjectID)===key(matches[0].SubjectID)&&isActivePlatformValue(p.Active));
      requireCondition(policies.length<=1,'COURSE_POLICY_DUPLICATED');model=key(policies[0]?.AccessModel)==='FREE'?'FREE':'PAID';}
    requireCondition(['FREE','PAID'].includes(model),'COURSE_RUN_ACCESS_INVALID');
    return {activity_key:run.activity_key,run_id:run.run_id,access_model:model};
  });
  const sessions=base.tables.course_draft_sessions.map(s=>({activity_key:s.activity_key,run_id:s.run_id,session_id:s.session_id,active:1}));
  const lifecycle=rows('GlobalTimetableSessionLifecycle').filter(r=>!nullable(r.PublicationID)).flatMap(r=>{
    const matches=base.tables.course_draft_sessions.filter(s=>key(s.session_id)===key(r.SessionID));
    if(!matches.length)return [];
    requireCondition(matches.length===1,'COURSE_SESSION_ID_AMBIGUOUS');const s=matches[0];
    for(const id of [r.RescheduledFromSessionID,r.RescheduledToSessionID].filter(Boolean))requireCondition(base.tables.course_draft_sessions.some(t=>t.activity_key===s.activity_key&&t.run_id===s.run_id&&key(t.session_id)===key(id)),'COURSE_LIFECYCLE_INACTIVE_REFERENCE');
    requireCondition(['SCHEDULED','CANCELLED','RESCHEDULED'].includes(key(r.Status)),'COURSE_LIFECYCLE_INVALID');
    return [{activity_key:s.activity_key,run_id:s.run_id,session_id:s.session_id,lifecycle_id:r.SessionLifecycleID,status:key(r.Status),previous_session_id:nullable(r.RescheduledFromSessionID),replacement_session_id:nullable(r.RescheduledToSessionID)}];
  });
  const calendar=[],suppressed=new Set();let excluded=0;
  for(const r of rows('AcademyCalendar')){
    if(!isActivePlatformValue(r.Active)){
      excluded++;
      if(key(r.EventType)==='PUBLIC_HOLIDAY'){requireCondition(validIsoDate(r.StartDate),'CALENDAR_SUPPRESSION_DATE_INVALID');suppressed.add(r.StartDate);}
      continue;
    }
    requireCondition(String(r.CalendarEventID||'').trim().length>0,'CALENDAR_SOURCE_ID_REQUIRED');
    try{validateAcademyCalendarRecord(r);}catch{requireCondition(false,'CALENDAR_SOURCE_RECORD_INVALID');}
    calendar.push({event_id:r.CalendarEventID,event_type:key(r.EventType),description:r.Description,start_date:r.StartDate,end_date:r.EndDate||r.StartDate,alternate_date:nullable(r.AlternateDate),teaching_impact:key(r.EventType)==='ISLAMIC_DAY'?'INFORMATION':key(r.TeachingImpact)||'INFORMATION',active:1});
  }
  return {baseRunId:base.runId,sourceSha256:sha256(snapshot),at:snapshot.completedAt,
    tables:{course_run_access:access,course_session_state:sessions,course_draft_lifecycle:lifecycle,academy_calendar_events:calendar,academy_calendar_suppressions:[...suppressed].sort().map(calendar_date=>({calendar_date}))},
    summary:{courseRuns:access.length,draftSessions:sessions.length,draftLifecycles:lifecycle.length,calendarEvents:calendar.length,removedHolidayDates:suppressed.size,excludedInactiveCalendarEvents:excluded,legacyWorkspacesImported:0}};
}
const literal=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
export function courseCalendarSQL(plan) {
  const statements=Object.entries(plan.tables).flatMap(([table,records])=>records.map(r=>`INSERT INTO ${table}(${Object.keys(r).join(',')}) VALUES(${Object.values(r).map(literal).join(',')});`));
  statements.push(`INSERT INTO course_workflow_imports VALUES(1,${literal(plan.baseRunId)},${literal(plan.sourceSha256)},${literal(plan.at)},${literal(JSON.stringify(plan.summary))});`);
  return statements.join('\n');
}
export function verifyCourseCalendarPlan(db,plan) {
  const sorted=rows=>rows.map(stableJSON).sort();
  for(const [table,expected] of Object.entries(plan.tables))requireCondition(stableJSON(sorted(db.prepare(`SELECT * FROM ${table}`).all()))===stableJSON(sorted(expected)),'COURSE_IMPORT_CONTENT_MISMATCH',{table});
  const marker=db.prepare('SELECT * FROM course_workflow_imports WHERE singleton=1').get();
  requireCondition(marker?.base_run_id===plan.baseRunId&&marker.source_sha256===plan.sourceSha256&&marker.imported_at===plan.at&&marker.summary_json===JSON.stringify(plan.summary),'COURSE_IMPORT_MARKER_INVALID');
  requireCondition(!db.prepare('PRAGMA foreign_key_check').get(),'COURSE_IMPORT_FOREIGN_KEYS_INVALID');
  requireCondition(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','COURSE_IMPORT_INTEGRITY_INVALID');
  return {...plan.summary,contentVerification:'PASS',foreignKeys:'PASS',integrity:'PASS',localOnly:true,mainDatabaseChanged:false,cutoverReady:false};
}
export function importCourseCalendarPlan(db,plan) {
  requireCondition(!db.prepare('SELECT 1 FROM course_workflow_imports').get(),'COURSE_ALREADY_IMPORTED');
  requireCondition(db.prepare("SELECT 1 FROM learning_imports l JOIN migration_runs m ON l.base_run_id=m.run_id WHERE m.state='IMPORTED' AND l.base_run_id=? AND l.source_sha256=? AND m.source_snapshot_sha256=l.source_sha256").get(plan.baseRunId,plan.sourceSha256),'COURSE_BASE_MISMATCH');
  requireCondition(!db.prepare('SELECT 1 FROM operation_receipts').get(),'COURSE_IMPORT_AFTER_WRITES');
  db.exec('BEGIN IMMEDIATE');try{db.exec(courseCalendarSQL(plan));verifyCourseCalendarPlan(db,plan);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
