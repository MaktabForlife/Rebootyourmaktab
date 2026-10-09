import {ATTENDANCE_HEADERS,readRegisters} from '../../src/programs/attendance-model.js';
import {ACADEMY_LIBRARY_HEADERS} from '../../src/lib/academy-library-policy.js';
import {TIMETABLE_HEADERS} from '../../src/programs/timetable-model.js';
import {publicationRecord} from '../../src/programs/weekly-timetable.js';
import {PLATFORM_SHEET_HEADERS} from '../../src/lib/platform-schema.js';
import {sha256,stableJSON,requireCondition} from './snapshot.mjs';
const key=v=>String(v||'').toUpperCase();
const rows=(book,name,headers)=>{
  const tab=book.tabs.find(t=>t.title===name);if(!tab)return [];
  requireCondition(JSON.stringify(tab.rows[0])===JSON.stringify(headers),'LEARNING_HEADERS_INVALID',{table:name});
  return tab.rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
};
export function buildLearningImport(snapshot,base) {
  const accounts=new Map(base.tables.accounts.map(a=>[key(a.account_id),a.account_id]));
  const policies=[],exclusions=[],registers=[],marks=[],publications=[],lessons=[],classes=[],teachers=[],settings=[];
  let excludedMarks=0;
  const central=snapshot.workbooks.find(b=>b.kind==='PLATFORM');
  requireCondition(central,'LEARNING_PLATFORM_MISSING');
  const roots=rows(central,'PlatformConfig',PLATFORM_SHEET_HEADERS.PlatformConfig).filter(r=>r.ConfigKey==='GlobalResourceDriveRootFolderID'&&String(r.ConfigValue).trim());
  requireCondition(roots.length<=1,'LIBRARY_ROOT_DUPLICATED');
  for(const r of roots){requireCondition(/^[A-Za-z0-9_-]{10,128}$/.test(String(r.ConfigValue).trim()),'LIBRARY_ROOT_INVALID');settings.push({setting_key:r.ConfigKey,setting_value:String(r.ConfigValue).trim(),updated_at:r.UpdatedDate||null,updated_by_account_id:null});}
  const selectedKeys=new Set([
    ...base.tables.program_resources.map(r=>`${r.activity_key}:${r.resource_id}`),
    ...base.tables.course_resources.map(r=>`${r.activity_key}:${r.resource_type}:${r.resource_id}`),
    ...base.tables.course_resources.map(r=>`GLOBAL:${r.resource_id}`)
  ]);
  const seen=new Set();
  for(const row of rows(central,'AcademyLibraryAccess',ACADEMY_LIBRARY_HEADERS)){
    const resource=String(row.ResourceKey).trim();
    requireCondition(/^PROGRAM:[^:]+:[^:]+$|^GLOBAL:[^:]+$|^COURSE:[^:]+:(EBOOK|PRINTABLE|AUDIO|VIDEO|OTHER):[^:]+$/.test(resource)&&!seen.has(resource),'LIBRARY_POLICY_KEY_INVALID');
    seen.add(resource);
    if(!selectedKeys.has(resource))continue;
    if(key(row.Status)!=='ACTIVE'){exclusions.push({resource_key:resource});continue;}
    policies.push({resource_key:resource,state:['ASSIGNED','ACADEMY_LEARNERS','SUBSCRIPTION','STAFF_ONLY'].includes(key(row.AccessState))?key(row.AccessState):'INVALID',entitlement_source:key(row.EntitlementSource),subscription_scope:String(row.SubscriptionScope).trim()});
  }
  for(const setting of base.tables.program_settings){
    const activity=base.tables.activities.find(a=>a.activity_key===setting.activity_key);
    const book=snapshot.workbooks.find(b=>b.kind==='PROGRAM'&&key(b.courseId)===key(activity.activity_id));
    requireCondition(book,'LEARNING_PROGRAM_MISSING');
    const sourceRegisters=rows(book,'ProgramAttendanceRegisters',ATTENDANCE_HEADERS.ProgramAttendanceRegisters);
    const sourceMarks=rows(book,'ProgramAttendanceMarks',ATTENDANCE_HEADERS.ProgramAttendanceMarks);
    readRegisters(sourceRegisters,sourceMarks,activity.activity_id);
    let sequence=0;
    for(const row of sourceRegisters){
      if(![...base.tables.timetable_publications,...publications].some(p=>p.activity_key===activity.activity_key&&p.publication_id===row.PublicationID)){
        const source=rows(book,'ProgramTimetablePublications',TIMETABLE_HEADERS.ProgramTimetablePublications).find(r=>r.PublicationID===row.PublicationID);
        requireCondition(source,'ATTENDANCE_PUBLICATION_MISSING');
        const pub=publicationRecord(source,{id:activity.activity_id});
        requireCondition(pub.pattern==='WEEKLY','ATTENDANCE_HISTORY_CONVERSION_REQUIRED');
        // Import only referenced history of selected active Programs, and refuse
        // inactive references rather than silently resurrecting archived data.
        for(const l of pub.occurrences){
          requireCondition(!l.moduleId||base.tables.modules.some(m=>m.activity_key===activity.activity_key&&key(m.module_id)===key(l.moduleId)),'ATTENDANCE_HISTORY_INACTIVE_MODULE');
          requireCondition(!l.programSubjectId||base.tables.program_subjects.some(s=>s.activity_key===activity.activity_key&&key(s.program_subject_id)===key(l.programSubjectId)),'ATTENDANCE_HISTORY_INACTIVE_SUBJECT');
          requireCondition((l.classIds||[]).every(id=>base.tables.classes.some(c=>c.activity_key===activity.activity_key&&key(c.class_id)===key(id))),'ATTENDANCE_HISTORY_INACTIVE_CLASS');
          requireCondition([l.teacherId,...(l.teacherIds||[])].filter(Boolean).every(id=>accounts.has(key(id))),'ATTENDANCE_HISTORY_INACTIVE_TEACHER');
          lessons.push({activity_key:activity.activity_key,publication_id:pub.id,lesson_anchor:l.anchor,source_rule_id:l.sourceRuleId||l.ruleId||null,module_id:l.moduleId||null,kind:l.kind||'LESSON',status:l.status||'SCHEDULED',weekday:Number.isInteger(l.weekday)?l.weekday:null,lesson_date:l.date||l.sessionDate||null,start_time:l.startTime,end_time:l.endTime,timezone:pub.snapshot.timezone||setting.timezone,title:l.moduleName||l.title||null,zoom_link:l.zoomLink||null,snapshot_json:JSON.stringify(l)});
          for(const id of new Set(l.classIds||[]))classes.push({activity_key:activity.activity_key,publication_id:pub.id,lesson_anchor:l.anchor,class_id:id});
          for(const id of new Set([l.teacherId,...(l.teacherIds||[])].filter(Boolean)))teachers.push({activity_key:activity.activity_key,publication_id:pub.id,lesson_anchor:l.anchor,account_id:accounts.get(key(id))});
        }
        publications.push({activity_key:activity.activity_key,publication_id:pub.id,scope_key:activity.activity_key,version_no:pub.version,pattern:pub.pattern,published_at:pub.date||null,published_by_source_id:pub.by||null,effective_from:pub.effectiveFrom,effective_until:pub.effectiveUntil||null,timezone:pub.snapshot.timezone||setting.timezone,snapshot_json:source.SnapshotJSON,source_snapshot_sha256:sha256(pub.snapshot),conversion:'EXACT'});
      }
      const retained=sourceMarks.filter(m=>m.RegisterID===row.RegisterID&&accounts.has(key(m.AccountID)));
      excludedMarks+=sourceMarks.filter(m=>m.RegisterID===row.RegisterID).length-retained.length;
      registers.push({activity_key:activity.activity_key,register_id:row.RegisterID,sequence:++sequence,attendance_date:row.AttendanceDate,publication_id:row.PublicationID,lesson_anchor:row.LessonAnchor,lesson_json:row.LessonJSON,learner_count:retained.length,submitted_at:row.SubmittedDate,submitted_by_account_id:accounts.get(key(row.SubmittedByAccountID))||null,source_actor_id:row.SubmittedByAccountID,operation_id:row.OperationID});
      marks.push(...retained.map(m=>({activity_key:activity.activity_key,register_id:row.RegisterID,account_id:accounts.get(key(m.AccountID)),display_name:m.DisplayName,status:m.Status})));
    }
  }
  return {baseRunId:base.runId,sourceSha256:sha256(snapshot),at:snapshot.completedAt,policies,exclusions,registers,marks,publications,lessons,classes,teachers,settings,
    summary:{programsChecked:base.tables.program_settings.length,registers:registers.length,marks:marks.length,referencedHistoricalPublications:publications.length,historicalLessons:lessons.length,excludedInactiveAccountMarks:excludedMarks,policies:policies.length,excludedResourceKeys:exclusions.length,libraryRootSettings:settings.length,legacyWorkspacesImported:0}};
}
const literal=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
export function learningSQL(plan) {
  const statements=[];
  for(const [table,values] of Object.entries({academy_settings:plan.settings,timetable_publications:plan.publications,published_lessons:plan.lessons,published_lesson_classes:plan.classes,published_lesson_teachers:plan.teachers,library_access_policies:plan.policies,library_exclusions:plan.exclusions,attendance_registers:plan.registers,attendance_marks:plan.marks}))
    for(const row of values)statements.push(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.values(row).map(literal).join(',')});`);
  statements.push(`INSERT INTO learning_imports VALUES(1,${literal(plan.baseRunId)},${literal(plan.sourceSha256)},${literal(plan.at)},${literal(JSON.stringify(plan.summary))});`);
  return statements.join('\n');
}
export function importLearningPlan(db,plan) {
  requireCondition(!db.prepare('SELECT 1 FROM learning_imports').get(),'LEARNING_ALREADY_IMPORTED');
  requireCondition(db.prepare("SELECT 1 FROM migration_runs WHERE run_id=? AND source_snapshot_sha256=? AND state='IMPORTED'").get(plan.baseRunId,plan.sourceSha256),'LEARNING_BASE_MISMATCH');
  requireCondition(!db.prepare('SELECT 1 FROM operation_receipts').get(),'LEARNING_IMPORT_AFTER_WRITES');
  db.exec('BEGIN IMMEDIATE');
  try{db.exec(learningSQL(plan));verifyLearningPlan(db,plan);db.exec('COMMIT');}
  catch(error){db.exec('ROLLBACK');throw error;}
}
export function verifyLearningPlan(db,plan) {
  for(const [table,expected] of Object.entries({library_access_policies:plan.policies,library_exclusions:plan.exclusions,attendance_registers:plan.registers,attendance_marks:plan.marks})) {
    const sorted=rows=>rows.map(stableJSON).sort();
    requireCondition(stableJSON(sorted(db.prepare(`SELECT * FROM ${table}`).all()))===stableJSON(sorted(expected)),'LEARNING_CONTENT_MISMATCH',{table});
  }
  for(const [table,expected] of Object.entries({academy_settings:plan.settings,timetable_publications:plan.publications,published_lessons:plan.lessons,published_lesson_classes:plan.classes,published_lesson_teachers:plan.teachers}))for(const row of expected){
    const keys=table==='academy_settings'?['setting_key']:['activity_key','publication_id',...(table==='timetable_publications'?[]:['lesson_anchor']),...(table==='published_lesson_classes'?['class_id']:table==='published_lesson_teachers'?['account_id']:[])];
    requireCondition(stableJSON(db.prepare(`SELECT * FROM ${table} WHERE ${keys.map(k=>`${k}=?`).join(' AND ')}`).get(...keys.map(k=>row[k])))===stableJSON(row),'LEARNING_HISTORY_CONTENT_MISMATCH',{table});
  }
  requireCondition(!db.prepare('PRAGMA foreign_key_check').get(),'LEARNING_FOREIGN_KEYS_INVALID');
  requireCondition(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','LEARNING_INTEGRITY_INVALID');
  const marker=db.prepare('SELECT * FROM learning_imports WHERE singleton=1').get();
  requireCondition(marker?.base_run_id===plan.baseRunId&&marker.source_sha256===plan.sourceSha256&&marker.imported_at===plan.at&&marker.summary_json===JSON.stringify(plan.summary),'LEARNING_MARKER_INVALID');
  return {...plan.summary,contentVerification:'PASS',foreignKeys:'PASS',integrity:'PASS',cutoverReady:false};
}
