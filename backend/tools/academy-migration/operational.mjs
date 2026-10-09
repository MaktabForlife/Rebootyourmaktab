import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { isActivePlatformValue as active } from '../../src/lib/platform-schema.js';
import { isSaltedPinHash } from '../../src/lib/auth.js';
import { parseCourseScheduleDefinition } from '../../src/lib/global-course-scheduling.js';
import { key } from '../../src/programs/model.js';
import { managementState } from '../../src/programs/management-model.js';
import { publicationRecord, publicationSchedule } from '../../src/programs/weekly-timetable.js';
import { parseRoles } from '../../src/profiles/academy-access.js';
import { programRoleAccounts } from '../../src/profiles/program-roles.js';
import { planMigration } from './plan.mjs';
import { sha256, stableJSON, requireCondition, SnapshotError } from './snapshot.mjs';

export const CONVERTER_VERSION = 'academy-active-import/v1';
export const migrations = ['0001_academy_foundation.sql','0002_identity_learning.sql','0003_timetables.sql'].map(name => {
  const sql = readFileSync(new URL(`../../migrations/academy/${name}`, import.meta.url), 'utf8');
  return { name, sql, hash: sha256(sql) };
});
const text = value => String(value ?? '');
const nullable = value => text(value).trim() ? text(value) : null;
const excluded = row => Object.hasOwn(row, 'Active') && !active(row.Active) || ['ARCHIVED','INACTIVE'].includes(key(row.Status));
const rowsOf = tab => (tab?.rows || []).slice(1).flatMap((cells,i) => cells.some(v => text(v).trim())
  ? [{ ...Object.fromEntries(tab.rows[0].map((h,j) => [h, cells[j] ?? ''])), _rowNumber:i+2 }] : []);
const tableRows = book => Object.fromEntries(book.tabs.map(t => [t.title, rowsOf(t)]));
const cleanRow = row => Object.fromEntries(Object.entries(row).filter(([k]) => k !== '_rowNumber'));
const json = value => stableJSON(JSON.parse(JSON.stringify(value)));
const compact = ids => [...new Set(ids.filter(v => text(v).trim()).map(text))];
const id = (...parts) => sha256(parts);
const schemaLedger = migrations.map(m => ({migration_name:m.name,migration_sha256:m.hash}));
const converterHash = sha256([readFileSync(new URL(import.meta.url),'utf8'),
  ...['./plan.mjs','./snapshot.mjs','../../src/lib/auth.js','../../src/programs/management-model.js',
    '../../src/programs/weekly-timetable.js','../../src/programs/timetable-model.js',
    '../../src/lib/global-course-scheduling.js','../../src/profiles/academy-access.js','../../src/profiles/program-roles.js'].map(path=>readFileSync(new URL(path,import.meta.url),'utf8'))]);
const emptyTables = () => {
  const db = new DatabaseSync(':memory:');
  try { for (const m of migrations) db.exec(m.sql);
    return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => [r.name, []]));
  } finally { db.close(); }
};

// Conversion is deterministic and runs before the destination is opened. It
// cannot enable D1 ownership, infer admissions, or promote legacy Admin/Senior.
export async function buildOperationalImport(snapshot, policy) {
  const manifest = await planMigration(snapshot, policy);
  const tables = emptyTables();
  const runId = id(CONVERTER_VERSION, converterHash, manifest.snapshotSha256, manifest.policySha256, schemaLedger);
  const at = snapshot.completedAt;
  const source = tableRows(snapshot.workbooks[0]);
  const summary = { ...manifest.summary, converter:CONVERTER_VERSION, activeCandidateReady:true,
    sourcePendingRoleReviews:manifest.summary.pendingRoleReviews,
    cutoverReady:false, dependentRecordsExcluded:0, timetableEntriesExcluded:0, privilegedRoleReviews:0 };
  const provenance = [];
  function add(table, row, origin, targetKey) {
    requireCondition(Object.hasOwn(tables, table), 'UNKNOWN_TARGET_TABLE');
    tables[table].push(row);
    if (origin) provenance.push({run_id:runId,source_store_key:`BOOK:${origin.book || 0}`,source_table:origin.table,
      source_id:text(origin.id ?? origin.row?._rowNumber ?? 'singleton'),target_table:table,
      target_key:stableJSON(targetKey ?? Object.values(row).slice(0,2)),source_record_sha256:sha256(cleanRow(origin.row || {})),
      source_row_number:Number.isInteger(origin.sourceRow ?? origin.row?._rowNumber) ? origin.sourceRow ?? origin.row._rowNumber : null});
  }
  const origin = (table,row,book=0,sourceId) => ({table,row,book,id:sourceId});
  const selected = name => {
    const allowed = new Set((manifest.platformRecords[name] || []).map(r => r.sourceRow));
    return (source[name] || []).filter(r => allowed.has(r._rowNumber));
  };
  const accounts = new Map(selected('UserAccounts').map(r => [key(r.AccountID), r]));
  const allAccounts = new Map(source.UserAccounts.map(r => [key(r.AccountID), r]));
  const loginKeys = new Map();
  for (const row of accounts.values()) {
    requireCondition(text(row.AccountID)===text(row.AccountID).trim() && text(row.UniqueID)===text(row.UniqueID).trim(), 'UNTRIMMED_LOGIN_IDENTITY', {table:'UserAccounts',row:row._rowNumber});
    requireCondition(!loginKeys.has(key(row.UniqueID)), 'DUPLICATE_LOGIN_LINK', {table:'UserAccounts',row:row._rowNumber});
    loginKeys.set(key(row.UniqueID),key(row.AccountID));
    requireCondition(!allAccounts.has(key(row.UniqueID)) || key(row.UniqueID) === key(row.AccountID), 'AMBIGUOUS_LOGIN_IDENTITY', {table:'UserAccounts',row:row._rowNumber});
    const hash = text(row.PINHash);
    requireCondition(!hash.trim() || isSaltedPinHash(hash.trim()) || /^[a-fA-F0-9]{64}$/.test(hash.trim()), 'UNSUPPORTED_PIN_HASH', {table:'UserAccounts',row:row._rowNumber,field:'PINHash'});
    requireCondition(!active(row.PINSetup) || Boolean(hash.trim()), 'PIN_SETUP_WITHOUT_HASH', {table:'UserAccounts',row:row._rowNumber});
    const o = origin('UserAccounts',row);
    add('accounts',{account_id:row.AccountID,display_name:row.DisplayName,login_link_id:row.UniqueID,active:1,
      last_login_at:nullable(row.LastLoginDate),created_at:nullable(row.CreatedDate),updated_at:nullable(row.ModifiedDate),
      created_by_source_id:nullable(row.CreatedByAccountID),modified_by_source_id:nullable(row.ModifiedByAccountID),revision:1},o,[row.AccountID]);
    add('account_credentials',{account_id:row.AccountID,pin_hash:hash,pin_setup:Number(active(row.PINSetup)),credential_epoch:1,updated_at:nullable(row.ModifiedDate)},o,[row.AccountID]);
    requireCondition(!text(row.PlatformRole).trim() || key(row.PlatformRole)==='GLOBAL_ADMIN', 'UNREVIEWED_PLATFORM_ROLE', {table:'UserAccounts',row:row._rowNumber});
    if (key(row.PlatformRole)==='GLOBAL_ADMIN') add('global_role_assignments',{assignment_id:id('GLOBAL_ADMIN',row.AccountID),account_id:row.AccountID,role:'GLOBAL_ADMIN',active:1,review_state:'CONFIRMED',granted_at:null,granted_by_account_id:null},o,[row.AccountID,'GLOBAL_ADMIN']);
  }
  // Known excluded parents remove their dependent records. Missing parents are
  // source defects and abort the entire candidate rather than silently dropping.
  function reference(all, kept, value, location) {
    if (!text(value).trim()) return true;
    requireCondition(all.has(key(value)), 'UNKNOWN_ACTIVE_REFERENCE',location);
    return kept.has(key(value));
  }
  const accountRef = (value,location) => reference(allAccounts,accounts,value,location);
  const subjects = new Map(selected('GlobalSubjectList').map(r => [key(r.SubjectID),r]));
  const academySubjects = new Map(selected('AcademySubjectList').map(r => [key(r.SubjectID),r]));
  for (const [namespace,rows,tab] of [['ACADEMY',academySubjects,'AcademySubjectList'],['GLOBAL_REFERENCE',subjects,'GlobalSubjectList']]) for (const row of rows.values())
    add('subject_catalog',{subject_key:`${namespace}:${row.SubjectID}`,source_namespace:namespace,subject_id:row.SubjectID,name:row.SubjectName,active:1},origin(tab,row),[namespace,row.SubjectID]);
  const activityByScope = new Map();
  for (const p of manifest.programs) activityByScope.set(key(`PROGRAM:${p.sourceCourseId}`),`PROGRAM:${p.sourceCourseId}`);
  for (const row of subjects.values()) activityByScope.set(key(`SUBJECT:${row.SubjectID}`),`COURSE:${row.SubjectID}`);
  const scopes = new Map(selected('AcademyAccessScopes').map(r => [key(r.ScopeKey),r]));
  const policyRows = selected('GlobalSubjectAccessPolicy');
  for (const [scopeKey,activityKey] of activityByScope) {
    const scope = scopes.get(scopeKey);
    const oldPolicy = activityKey.startsWith('COURSE:') ? policyRows.find(r => key(r.SubjectID) === key(activityKey.slice(7))) : null;
    const access = key(scope?.AccessModel || oldPolicy?.AccessModel);
    add('activity_policy_imports',{activity_key:activityKey,source_access_model:['FREE','PAID'].includes(access)?access:'UNKNOWN',source_review_state:scope?.ReviewStatus || 'REQUIRED',source_stage:nullable(scope?.MigrationStage),source_description:null,run_id:runId},origin(scope?'AcademyAccessScopes':'GlobalSubjectAccessPolicy',scope || oldPolicy || {}),[activityKey]);
  }
  function role(account,activity,role,effective,review,o) {
    add('legacy_access_evidence',{evidence_id:id('evidence',account,activity,role),run_id:runId,account_id:account,activity_key:activity,source_role:role,source_effective:Number(effective),source_review_state:review,source_locator:`BOOK:${o.book || 0}/${o.table}/${o.row?._rowNumber || o.id || 'embedded'}`},o,[account,activity,role]);
    const privileged = ['ADMIN','SENIOR'].includes(role);
    if (privileged || !effective) {
      if (privileged) summary.privilegedRoleReviews++;
      add('role_import_reviews',{review_id:id('role-review',account,activity,role),account_id:account,activity_key:activity,source_locator:`${o.table}/${o.row?._rowNumber || 'embedded'}`,source_value:role,proposed_role:privileged?'PROGRAM_ADMIN':role,status:'REQUIRED',note:privileged?'Legacy privilege requires an explicit scope review.':'Source role was awaiting review; keep ineffective.',reviewed_by_account_id:null,reviewed_at:null},o,[account,activity,role]);
    } else add('role_assignments',{assignment_id:id('role',account,activity,role),account_id:account,activity_key:activity,role,active:1,review_state:'CONFIRMED',granted_at:null,granted_by_account_id:null,revision:1},o,[account,activity,role]);
  }
  if (source.AcademyAccessScopes) {
    for (const row of selected('AcademyAccessMatrix')) for (const column of manifest.matrixColumns.AcademyAccessMatrix.slice(3)) {
      const activity = activityByScope.get(key(column));
      requireCondition(activity, 'UNKNOWN_ACCESS_SCOPE');
      const review = selected('AcademyAccessReview').find(r => key(r.AccountID)===key(row.AccountID) && key(r.ScopeKey)===key(column));
      let roles; try { roles=parseRoles(row[column]); } catch { throw new SnapshotError('INVALID_SOURCE_ROLE',{table:'AcademyAccessMatrix',row:row._rowNumber}); }
      for (const value of roles) role(accounts.get(key(row.AccountID)).AccountID,activity,value,review?.ReviewStatus!=='REQUIRED',review?.ReviewStatus || 'CONFIRMED',origin('AcademyAccessMatrix',row));
    }
  } else for (const row of selected('UserCourseAccess')) role(accounts.get(key(row.AccountID)).AccountID,`PROGRAM:${row.CourseID}`,key(row.Role),true,'LEGACY',origin('UserCourseAccess',row));
  for (const row of selected('GlobalSubjectAccessMatrix')) for (const column of manifest.matrixColumns.GlobalSubjectAccessMatrix.slice(1)) if (active(row[column]))
    add('legacy_access_evidence',{evidence_id:id('subscription',row.AccountID,column),run_id:runId,account_id:accounts.get(key(row.AccountID)).AccountID,activity_key:`COURSE:${subjects.get(key(column)).SubjectID}`,source_role:'LEGACY_SUBSCRIPTION',source_effective:1,source_review_state:'LEGACY',source_locator:`GlobalSubjectAccessMatrix/${row._rowNumber}`},origin('GlobalSubjectAccessMatrix',row),[row.AccountID,column]);
  const expectedProgramRoles=manifest.programs.flatMap(p=>programRoleAccounts(source,p.sourceCourseId,Boolean(source.AcademyAccessScopes))
    .filter(r=>accounts.has(key(r.AccountID))).flatMap(r=>r.Roles.map(role=>stableJSON([key(r.AccountID),key(`PROGRAM:${p.sourceCourseId}`),role])))).sort();
  const evidenceProgramRoles=tables.legacy_access_evidence.filter(r=>r.activity_key.startsWith('PROGRAM:')&&r.source_effective)
    .map(r=>stableJSON([key(r.account_id),key(r.activity_key),r.source_role])).sort();
  requireCondition(stableJSON(expectedProgramRoles)===stableJSON(evidenceProgramRoles),'PROGRAM_PERMISSION_EVIDENCE_MISMATCH');
  summary.sourceProgramPermissionEvidence='PASS';

  for (const p of manifest.programs) {
    const book = snapshot.workbooks[p.sourceBook], input = tableRows(book), activity=`PROGRAM:${p.sourceCourseId}`;
    const registry=selected('CourseRegistry').find(r=>key(r.CourseID)===key(p.sourceCourseId));
    const definition=selected('ProgramDefinitions').find(r=>key(r.CourseID)===key(p.sourceCourseId));
    add('activities',{activity_key:activity,activity_id:p.sourceCourseId,kind:'PROGRAM',name:registry.CourseName,active:1,lifecycle:'ACTIVE',website_visible:Number(p.currentlyPublished),created_at:nullable(registry.CreatedDate),updated_at:nullable(definition.ModifiedDate),revision:1},origin('CourseRegistry',registry),[activity]);
    add('activity_source_bindings',{activity_key:activity,provider:'SHEETS',source_ref:book.spreadsheetId,schema_version:registry.SchemaVersion},origin('CourseRegistry',registry),[activity,'SHEETS']);
    add('program_settings',{activity_key:activity,kind:'PROGRAM',duration_years:nullable(definition.DurationYears)===null?null:Number(definition.DurationYears),timezone:definition.Timezone,revision:1},origin('ProgramDefinitions',definition),[activity]);
    const current=managementState({tables:input},{id:p.sourceCourseId});
    const all=Object.fromEntries(Object.entries(current.snapshot).map(([name,rows])=>[name, new Map(rows.map(r=>[key(r[{ProgramSubjects:'ProgramSubjectID',ProgramLevels:'LevelID',ProgramModules:'ProgramModuleID',ProgramTasks:'TaskID',ProgramClasses:'ClassID',ProgramEnrollments:'EnrollmentID',ProgramTeachers:'AccountID',ProgramModuleProgress:'ProgressID',ProgramResources:'ResourceID',ProgramLibraryRoots:'FolderID'}[name]]),r]))]));
    const kept=Object.fromEntries(Object.entries(all).map(([name,map])=>[name,new Map([...map].filter(([,r])=>!excluded(r)))]));
    const location = name=>({book:p.sourceBook,table:name});
    const dep=(name,value)=>reference(all[name],kept[name],value,location(name));
    const keepDependent=(name,predicate)=>{for(const [k,row] of kept[name]) if(!predicate(row)){kept[name].delete(k);summary.dependentRecordsExcluded++;}};
    const catalogAll=new Map([...(source.GlobalSubjectList || []),...(source.AcademySubjectList || [])].map(r=>[key(r.SubjectID),r]));
    const catalogKept=new Map([...subjects,...academySubjects]);
    keepDependent('ProgramSubjects',r=>reference(catalogAll,catalogKept,r.SubjectID,location('ProgramSubjects')));
    keepDependent('ProgramLevels',r=>dep('ProgramSubjects',r.ProgramSubjectID));
    keepDependent('ProgramModules',r=>dep('ProgramSubjects',r.ProgramSubjectID)&&dep('ProgramLevels',r.LevelID));
    keepDependent('ProgramTasks',r=>dep('ProgramSubjects',r.ProgramSubjectID)&&dep('ProgramModules',r.ProgramModuleID));
    keepDependent('ProgramEnrollments',r=>dep('ProgramClasses',r.ClassID)&&accountRef(r.AccountID,location('ProgramEnrollments')));
    keepDependent('ProgramTeachers',r=>accountRef(r.AccountID,location('ProgramTeachers')));
    keepDependent('ProgramModuleProgress',r=>dep('ProgramClasses',r.ClassID)&&dep('ProgramModules',r.ProgramModuleID));
    keepDependent('ProgramResources',r=>dep('ProgramSubjects',r.ProgramSubjectID)&&dep('ProgramLevels',r.LevelID)&&dep('ProgramModules',r.ProgramModuleID)&&dep('ProgramTasks',r.TaskID));
    const stateRow=(input.ProgramManagementState || []).find(r=>Number(r.Sequence)===current.sequence);
    const sourceIds = {ProgramSubjects:'ProgramSubjectID',ProgramLevels:'LevelID',ProgramModules:'ProgramModuleID',ProgramTasks:'TaskID',ProgramClasses:'ClassID',ProgramEnrollments:'EnrollmentID',ProgramTeachers:'AccountID',ProgramModuleProgress:'ProgressID',ProgramResources:'ResourceID',ProgramLibraryRoots:'FolderID'};
    const o=(name,r,recordId)=>stateRow && Object.hasOwn(sourceIds,name) && !['ProgramTasks','ProgramResources'].includes(name)
      ? {...origin('ProgramManagementState',r,p.sourceBook,`${current.revision}/${name}/${r[sourceIds[name]]}`),sourceRow:stateRow._rowNumber}
      : origin(name,r,p.sourceBook,recordId ?? r[sourceIds[name]]);
    const iterate=(name,fn)=>{for(const r of kept[name].values())fn(r,o(name,r));};
    iterate('ProgramSubjects',(r,o)=>add('program_subjects',{activity_key:activity,program_subject_id:r.ProgramSubjectID,subject_key:`${academySubjects.has(key(r.SubjectID))?'ACADEMY':'GLOBAL_REFERENCE'}:${catalogKept.get(key(r.SubjectID)).SubjectID}`,active:1},o,[activity,r.ProgramSubjectID]));
    iterate('ProgramLevels',(r,o)=>add('program_levels',{activity_key:activity,level_id:r.LevelID,program_subject_id:r.ProgramSubjectID,name:r.Name,sort_order:Number(r.SortOrder||0),active:1},o,[activity,r.LevelID]));
    iterate('ProgramModules',(r,o)=>add('modules',{activity_key:activity,module_id:r.ProgramModuleID,program_subject_id:nullable(r.ProgramSubjectID),level_id:nullable(r.LevelID),name:r.Name,sort_order:Number(r.SortOrder||0),active:1},o,[activity,r.ProgramModuleID]));
    iterate('ProgramTasks',(r,o)=>add('tasks',{activity_key:activity,task_id:r.TaskID,program_subject_id:nullable(r.ProgramSubjectID),module_id:nullable(r.ProgramModuleID),name:r.Name,sort_order:Number(r.SortOrder||0),active:1},o,[activity,r.TaskID]));
    iterate('ProgramClasses',(r,o)=>{add('classes',{activity_key:activity,class_id:r.ClassID,name:r.Name,academic_year:nullable(r.AcademicYear),zoom_link:nullable(r.ZoomLink),active:1},o,[activity,r.ClassID]);
      if(nullable(r.TeacherAccountID)&&accountRef(r.TeacherAccountID,location('ProgramClasses'))) add('class_teacher_assignments',{activity_key:activity,class_id:r.ClassID,account_id:accounts.get(key(r.TeacherAccountID)).AccountID,responsibility:'DEFAULT'},o,[activity,r.ClassID,r.TeacherAccountID]);});
    iterate('ProgramEnrollments',(r,o)=>add('class_memberships',{activity_key:activity,enrollment_id:r.EnrollmentID,class_id:r.ClassID,account_id:accounts.get(key(r.AccountID)).AccountID,start_date:nullable(r.StartDate),end_date:nullable(r.EndDate),active:1},o,[activity,r.EnrollmentID]));
    iterate('ProgramTeachers',(r,o)=>add('program_legacy_teachers',{activity_key:activity,account_id:accounts.get(key(r.AccountID)).AccountID,run_id:runId},o,[activity,r.AccountID]));
    iterate('ProgramModuleProgress',(r,o)=>add('class_module_progress',{activity_key:activity,progress_id:r.ProgressID,class_id:r.ClassID,module_id:r.ProgramModuleID,status:r.Status},o,[activity,r.ProgressID]));
    iterate('ProgramResources',(r,o)=>add('program_resources',{activity_key:activity,resource_id:r.ResourceID,program_subject_id:nullable(r.ProgramSubjectID),level_id:nullable(r.LevelID),module_id:nullable(r.ProgramModuleID),task_id:nullable(r.TaskID),resource_type:r.ResourceType,name:r.Name,description:nullable(r.Description),drive_file_id:nullable(r.DriveFileID),metadata_json:stableJSON(Object.fromEntries(['Author','Publisher','ISBN','PublicationYear','CoverDriveFileID'].map(k=>[k,text(r[k])]))),active:1},o,[activity,r.ResourceID]));
    iterate('ProgramLibraryRoots',(r,o)=>add('program_library_roots',{activity_key:activity,folder_id:r.FolderID,name:r.Name},o,[activity,r.FolderID]));
    add('management_revisions',{activity_key:activity,source_revision:nullable(current.revision),source_sequence:current.sequence,source_snapshot_sha256:sha256(current.snapshot),modified_at:nullable(stateRow?.ModifiedDate),modified_by_source_id:nullable(stateRow?.ModifiedByAccountID)},o('ProgramManagementState',stateRow || {},current.revision || 'initial'),[activity]);
    const usableRule=r=>dep('ProgramModules',r.moduleId)&&dep('ProgramSubjects',r.programSubjectId)&&dep('ProgramLevels',r.levelId)
      && (r.classIds || []).every(c=>dep('ProgramClasses',c)) && compact([r.teacherId,...(r.teacherIds||[]),...(r.additionalTeacherIds||[])]).every(t=>accountRef(t,location('ProgramTimetablePublications')));
    function filterDraft(value) {
      const allowed = ['schema','programId','programName','format','timezone','rules','breaks','planner','layout','effectiveFrom','effectiveTimezone','exceptions'];
      requireCondition(value && Object.keys(value).every(k=>allowed.includes(k)), 'UNREVIEWED_TIMETABLE_JSON',location('ProgramTimetableState'));
      const ruleFields = ['id','moduleId','programSubjectId','teacherId','teacherMode','additionalTeacherIds','classIds','weekdays','startTime','endTime','zoomLink',
        'effectiveZoomLink','zoomSource','subjectId','levelId','subjectName','moduleName','levelName','classNames','teacherName','sourceRuleId','assignmentMode','teacherIds','teacherNames'];
      requireCondition((value.rules || []).every(r=>Object.keys(r).every(k=>ruleFields.includes(k))), 'UNREVIEWED_TIMETABLE_RULE',location('ProgramTimetableState'));
      requireCondition((value.breaks || []).every(r=>Object.keys(r).every(k=>['id','label','weekdays','startTime','endTime'].includes(k))), 'UNREVIEWED_TIMETABLE_BREAK',location('ProgramTimetableState'));
      if(value.planner) {
        requireCondition(Object.keys(value.planner).every(k=>['periods','availability','limits'].includes(k)), 'UNREVIEWED_TIMETABLE_PLANNER',location('ProgramTimetableState'));
        for(const [field,fields] of Object.entries({periods:['id','startTime','endTime'],availability:['id','teacherId','weekday','startTime','endTime'],limits:['teacherId','maxWeeklyMinutes']}))
          requireCondition((value.planner[field] || []).every(r=>Object.keys(r).every(k=>fields.includes(k))), 'UNREVIEWED_TIMETABLE_PLANNER',location('ProgramTimetableState'));
      }
      if(value.layout) requireCondition(Object.keys(value.layout).every(k=>['alignment','mergeShared','columnWidths','rowHeights'].includes(k))
        && Object.values(value.layout.columnWidths || {}).every(Number.isInteger) && Object.values(value.layout.rowHeights || {}).every(Number.isInteger), 'UNREVIEWED_TIMETABLE_LAYOUT',location('ProgramTimetableState'));
      const result=structuredClone(value);
      for(const field of ['rules','lessons']) if(Array.isArray(result[field])) result[field]=result[field].filter(r=>{const ok=usableRule(r);if(!ok)summary.timetableEntriesExcluded++;return ok;});
      // Planner state also holds account references. Do not retain an excluded
      // account through a private scheduling preference in an otherwise active draft.
      if(result.planner) for(const field of ['availability','limits']) if(Array.isArray(result.planner[field])) result.planner[field]=result.planner[field].filter(r=>accountRef(r.teacherId,location('ProgramTimetableState')));
      requireCondition(!(result.exceptions || []).length, 'DATED_EXCEPTIONS_REQUIRE_CONVERSION',location('ProgramTimetableState'));
      return result;
    }
    const draft=(input.ProgramTimetableState || []).reduce((a,b)=>!a||Number(b.Sequence)>Number(a.Sequence)?b:a,null);
    if(draft&&text(draft.DraftJSON).trim()) {let value;try{value=JSON.parse(draft.DraftJSON);}catch{throw new SnapshotError('INVALID_TIMETABLE_DRAFT',location('ProgramTimetableState'));}
      add('timetable_drafts',{activity_key:activity,scope_key:activity,source_revision:nullable(draft.Revision),source_sequence:Number(draft.Sequence),draft_json:stableJSON(filterDraft(value)),source_draft_sha256:sha256(value),modified_at:nullable(draft.ModifiedDate)},o('ProgramTimetableState',draft),[activity]);}
    const publications=(input.ProgramTimetablePublications || []).map(r=>publicationRecord(r,{id:p.sourceCourseId}));
    const schedule=publicationSchedule(publications,p.publicationAsOf);
    for(const publication of schedule.publications.filter(r=>p.publicationIds.includes(r.id))) {
      requireCondition(publication.pattern==='WEEKLY','DATED_PUBLICATION_REQUIRES_CONVERSION',location('ProgramTimetablePublications'));
      const converted=filterDraft(publication.snapshot), row=input.ProgramTimetablePublications.find(r=>r.PublicationID===publication.id);
      const record=publicationRecord({...row,SnapshotJSON:JSON.stringify(converted)},{id:p.sourceCourseId});
      const provenance=o('ProgramTimetablePublications',row);
      add('timetable_publications',{activity_key:activity,publication_id:publication.id,scope_key:activity,version_no:publication.version,pattern:publication.pattern,published_at:nullable(publication.date),published_by_source_id:nullable(publication.by),effective_from:publication.effectiveFrom,effective_until:nullable(publication.effectiveUntil),timezone:publication.snapshot.timezone || definition.Timezone,snapshot_json:stableJSON(converted),source_snapshot_sha256:sha256(publication.snapshot),conversion:stableJSON(converted)===stableJSON(publication.snapshot)?'EXACT':'ACTIVE_ONLY'},provenance,[activity,publication.id]);
      for(const lesson of record.occurrences) addLesson(activity,publication.id,lesson,definition.Timezone,provenance);
    }
  }
  function addLesson(activity,publication,lesson,timezone,o) {
    const anchor=lesson.anchor;
    add('published_lessons',{activity_key:activity,publication_id:publication,lesson_anchor:anchor,source_rule_id:nullable(lesson.sourceRuleId || lesson.ruleId),module_id:nullable(lesson.moduleId),kind:lesson.kind || 'LESSON',status:lesson.status || 'SCHEDULED',weekday:Number.isInteger(lesson.weekday)?lesson.weekday:null,lesson_date:nullable(lesson.date || lesson.sessionDate),start_time:lesson.startTime,end_time:lesson.endTime,timezone,title:nullable(lesson.moduleName || lesson.title),zoom_link:nullable(lesson.zoomLink),snapshot_json:json(lesson)},o,[activity,publication,anchor]);
    for(const classId of compact(lesson.classIds || [])) add('published_lesson_classes',{activity_key:activity,publication_id:publication,lesson_anchor:anchor,class_id:classId},o,[activity,publication,anchor,classId]);
    for(const teacher of compact([lesson.teacherId,...(lesson.teacherIds || [])])) add('published_lesson_teachers',{activity_key:activity,publication_id:publication,lesson_anchor:anchor,account_id:accounts.get(key(teacher)).AccountID},o,[activity,publication,anchor,teacher]);
  }

  const allModules=new Map((source.GlobalModuleList || []).map(r=>[key(r.ModuleID),r]));
  const keptModules=new Map(selected('GlobalModuleList').map(r=>[key(r.ModuleID),r]));
  const allTasks=new Map((source.GlobalTaskList || []).map(r=>[key(r.TaskID),r]));
  const keptTasks=new Map((source.GlobalTaskList || []).filter(r=>!excluded(r)&&subjects.has(key(r.SubjectID))&&reference(allModules,keptModules,r.ModuleID,{table:'GlobalTaskList',row:r._rowNumber})).map(r=>[key(r.TaskID),r]));
  const courses=new Map([...subjects].map(([k,r])=>[k,`COURSE:${r.SubjectID}`]));
  const runs=new Map(selected('GlobalSubjectRuns').map(r=>[key(r.RunID),r]));
  function courseDefinition(value, location, includeDisplayValues=false) {
    let rules;try{rules=parseCourseScheduleDefinition(value || '[]',{includeDisplayValues});}
    catch{throw new SnapshotError('INVALID_COURSE_SCHEDULE',location);}
    return rules.filter(rule=>{
      const ok=reference(allModules,keptModules,rule.moduleid,location)&&accountRef(rule.teacheraccountid,location);
      if(!ok)summary.timetableEntriesExcluded++;
      return ok;
    });
  }
  for(const row of subjects.values()) {
    const activity=courses.get(key(row.SubjectID));
    const visible=selected('GlobalTimetableRunState').some(r=>runs.get(key(r.RunID))?.SubjectID===row.SubjectID&&text(r.CurrentPublicationID).trim());
    add('activities',{activity_key:activity,activity_id:row.SubjectID,kind:'COURSE',name:row.SubjectName,active:1,lifecycle:'ACTIVE',website_visible:Number(visible),created_at:nullable(row.CreatedDate),updated_at:nullable(row.ModifiedDate),revision:1},origin('GlobalSubjectList',row),[activity]);
    const policy=policyRows.find(r=>key(r.SubjectID)===key(row.SubjectID));
    add('course_settings',{activity_key:activity,kind:'COURSE',legacy_access_model:['FREE','PAID'].includes(key(policy?.AccessModel))?key(policy.AccessModel):'UNKNOWN',policy_review_state:'REQUIRED'},origin('GlobalSubjectAccessPolicy',policy || {}),[activity]);
    add('activity_source_bindings',{activity_key:activity,provider:'SHEETS',source_ref:snapshot.workbooks[0].spreadsheetId,schema_version:'platform'},origin('GlobalSubjectList',row),[activity,'SHEETS']);
  }
  for(const row of keptModules.values()) add('modules',{activity_key:courses.get(key(row.SubjectID)),module_id:row.ModuleID,program_subject_id:null,level_id:null,name:row.ModuleName,sort_order:Number(row.SortOrder||0),active:1},origin('GlobalModuleList',row),[row.SubjectID,row.ModuleID]);
  for(const row of keptTasks.values()) add('tasks',{activity_key:courses.get(key(row.SubjectID)),task_id:row.TaskID,program_subject_id:null,module_id:nullable(row.ModuleID),name:row.TaskName,sort_order:0,active:1},origin('GlobalTaskList',row),[row.SubjectID,row.TaskID]);
  for(const row of (source.GlobalResources || []).filter(r=>!excluded(r)&&subjects.has(key(r.SubjectID)))) {
    if(!reference(allModules,keptModules,row.ModuleID,{table:'GlobalResources',row:row._rowNumber})||!reference(allTasks,keptTasks,row.TaskID,{table:'GlobalResources',row:row._rowNumber})){summary.dependentRecordsExcluded++;continue;}
    add('course_resources',{activity_key:courses.get(key(row.SubjectID)),resource_id:row.ResourceID,module_id:nullable(row.ModuleID),task_id:nullable(row.TaskID),name:row.ResourceName,resource_type:nullable(row.ResourceType),resource_format:nullable(row.ResourceFormat),description:nullable(row.ResourceDescription),resource_link:nullable(row.ResourceLink),active:1},origin('GlobalResources',row),[row.SubjectID,row.ResourceID]);
  }
  for(const row of runs.values()) {
    requireCondition(nullable(row.Timezone),'COURSE_TIMEZONE_REQUIRED',{table:'GlobalSubjectRuns',row:row._rowNumber});
    const definition=courseDefinition(row.ScheduleDefinition,{table:'GlobalSubjectRuns',row:row._rowNumber});
    add('course_runs',{activity_key:courses.get(key(row.SubjectID)),run_id:row.RunID,name:row.RunName,timezone:row.Timezone,start_date:nullable(row.StartDate),end_date:nullable(row.EndDate),schedule_mode:nullable(row.ScheduleMode),schedule_definition:json(definition),active:1},origin('GlobalSubjectRuns',row),[row.SubjectID,row.RunID]);
  }
  const sessionUsable=row=>reference(allModules,keptModules,row.ModuleID,{table:'PublishedGlobalTimetableSessions',row:row._rowNumber})&&accountRef(row.TeacherAccountID,{table:'PublishedGlobalTimetableSessions',row:row._rowNumber});
  const lifecycle=selected('GlobalTimetableSessionLifecycle');
  for(const row of selected('GlobalTimetablePublications')) {
    const run=runs.get(key(row.RunID));requireCondition(run,'UNKNOWN_PUBLICATION_RUN',{table:'GlobalTimetablePublications',row:row._rowNumber});
    const activity=courses.get(key(row.SubjectID));requireCondition(activity&&key(row.SubjectID)===key(run.SubjectID),'PUBLICATION_SCOPE_MISMATCH',{table:'GlobalTimetablePublications',row:row._rowNumber});
    const original=selected('PublishedGlobalTimetableSessions').filter(r=>key(r.PublicationID)===key(row.PublicationID));
    const definition=courseDefinition(row.ScheduleDefinition,{table:'GlobalTimetablePublications',row:row._rowNumber},true);
    const sessions=original.filter(r=>{requireCondition(key(r.RunID)===key(row.RunID)&&key(r.SubjectID)===key(row.SubjectID),'SESSION_SCOPE_MISMATCH',{table:'PublishedGlobalTimetableSessions',row:r._rowNumber});return !excluded(r)&&sessionUsable(r);});
    summary.timetableEntriesExcluded+=original.length-sessions.length;
    const convertedRow={...cleanRow(row),ScheduleDefinition:json(definition)};
    add('timetable_publications',{activity_key:activity,publication_id:row.PublicationID,scope_key:row.RunID,version_no:Number(row.VersionNo),pattern:'COURSE',published_at:nullable(row.PublishedDate),published_by_source_id:nullable(row.PublishedByAccountID),effective_from:nullable(row.PublishStartDate || run.StartDate),effective_until:nullable(row.PublishEndDate || run.EndDate),timezone:row.Timezone || run.Timezone,snapshot_json:stableJSON({publication:convertedRow,sessions:sessions.map(cleanRow)}),source_snapshot_sha256:sha256({publication:cleanRow(row),sessions:original.map(cleanRow)}),conversion:sessions.length===original.length&&json(definition)===text(row.ScheduleDefinition || '[]')?'EXACT':'ACTIVE_ONLY'},origin('GlobalTimetablePublications',row),[activity,row.PublicationID]);
    for(const session of sessions) {
      const sourceSessionId=session.SourceSessionID || session.SessionID;
      const state=lifecycle.find(l=>key(l.PublicationID)===key(row.PublicationID)&&key(l.SessionID)===key(sourceSessionId));
      addLesson(activity,row.PublicationID,{anchor:session.PublishedSessionID,sourceRuleId:sourceSessionId,moduleId:session.ModuleID,kind:session.SessionKind || 'LESSON',status:state?.Status || 'SCHEDULED',sessionDate:session.SessionDate,startTime:session.StartTime,endTime:session.EndTime,title:session.ModuleName || session.SessionDescription,zoomLink:session.ZoomLink,teacherId:session.TeacherAccountID,classIds:[]},row.Timezone || run.Timezone || 'Africa/Johannesburg',origin('PublishedGlobalTimetableSessions',session));
    }
    const retainedSessions=new Set(sessions.map(s=>key(s.SourceSessionID || s.SessionID)));
    for(const record of lifecycle.filter(r=>key(r.PublicationID)===key(row.PublicationID)&&retainedSessions.has(key(r.SessionID)))) add('lesson_lifecycle',{activity_key:activity,lifecycle_id:record.SessionLifecycleID,publication_id:row.PublicationID,source_session_id:record.SessionID,status:record.Status,replacement_source_session_id:nullable(record.RescheduledToSessionID),previous_source_session_id:nullable(record.RescheduledFromSessionID)},origin('GlobalTimetableSessionLifecycle',record),[activity,record.SessionLifecycleID]);
  }
  for(const row of selected('GlobalTimetableRunState')) {
    const run=runs.get(key(row.RunID));
    add('course_run_state',{activity_key:courses.get(key(run.SubjectID)),run_id:row.RunID,stage:nullable(row.Stage),current_publication_id:nullable(row.CurrentPublicationID),draft_publish_start_date:nullable(row.DraftPublishStartDate),draft_publish_end_date:nullable(row.DraftPublishEndDate)},origin('GlobalTimetableRunState',row),[run.SubjectID,row.RunID]);
  }
  for(const row of (source.GlobalTimetableSessions || []).filter(r=>!excluded(r)&&runs.has(key(r.RunID)))) {
    const run=runs.get(key(row.RunID));requireCondition(key(run.SubjectID)===key(row.SubjectID),'DRAFT_SESSION_SCOPE_MISMATCH',{table:'GlobalTimetableSessions',row:row._rowNumber});
    if(!sessionUsable(row)){summary.dependentRecordsExcluded++;continue;}
    add('course_draft_sessions',{activity_key:courses.get(key(row.SubjectID)),run_id:row.RunID,session_id:row.SessionID,module_id:nullable(row.ModuleID),teacher_account_id:nullable(row.TeacherAccountID),session_date:row.SessionDate,start_time:row.StartTime,end_time:row.EndTime,session_kind:row.SessionKind || 'LESSON',zoom_link:nullable(row.ZoomLink),schedule_rule_key:nullable(row.ScheduleRuleKey),occurrence_date:nullable(row.OccurrenceDate),description:nullable(row.SessionDescription)},origin('GlobalTimetableSessions',row),[row.RunID,row.SessionID]);
  }
  // The original source capture retains full history privately. Operational
  // conversion intentionally does not copy old JSON, credentials in receipts,
  // historical audits, attendance or arbitrary configuration into live tables.
  add('migration_runs',{run_id:runId,environment:snapshot.environment.toUpperCase(),source_snapshot_sha256:manifest.snapshotSha256,code_commit:`content-sha256:${converterHash}`,state:'IMPORTED',started_at:at,finished_at:at});
  tables.academy_import_schema.push(...schemaLedger);
  tables.source_record_map.push(...provenance);
  for(const activity of tables.activities) add('data_ownership',{dataset_key:'ACADEMY',scope_key:activity.activity_key,authoritative_store:'SHEETS',phase:'STAGING',verified_run_id:null,switched_at:null,revision:1});
  add('audit_events',{event_id:id('import-audit',runId),occurred_at:at,actor_account_id:null,actor_source_id:null,actor_name_snapshot:null,authority:'MIGRATION_REHEARSAL',scope_key:'ACADEMY',action:'IMPORT_ACTIVE_CANDIDATE',record_kind:'MIGRATION',record_id:runId,changed_fields_json:stableJSON(['active_identity','learning','timetables'])});
  const counts=Object.fromEntries(Object.entries(tables).filter(([,r])=>r.length).map(([name,rows])=>[name,rows.length]));
  for(const [name,count] of Object.entries(counts)) add('migration_checks',{run_id:runId,dataset_key:name,scope_key:'ALL',check_name:'EXACT_CONTENT',status:'PASS',expected_count:count,actual_count:count,findings_count:0,checked_at:at});
  for(const check of ['AUTHORIZATION_PARITY','ADMISSION_POLICY','ATTENDANCE_CONVERSION','AUDIT_HISTORY_CONVERSION','LOGIN_HOME_INTEGRATION','CONCURRENT_LOAD']) add('migration_checks',{run_id:runId,dataset_key:'ACADEMY',scope_key:'ALL',check_name:check,status:'PENDING',expected_count:null,actual_count:null,findings_count:0,checked_at:null});
  return {runId,tables,summary:{...summary,accountsImported:tables.accounts.length,credentialsWithHash:tables.account_credentials.filter(r=>text(r.pin_hash).trim()).length,programsImported:tables.program_settings.length,coursesImported:tables.course_settings.length,classMembershipsImported:tables.class_memberships.length,publicationsImported:tables.timetable_publications.length,publishedLessonsImported:tables.published_lessons.length,pendingRoleReviews:tables.role_import_reviews.length,tableCounts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),ownership:'SHEETS',verification:'ACTIVE_CANDIDATE_ONLY'}};
}

const orderedTables = ['academy_import_schema','migration_runs','accounts','account_credentials','global_role_assignments','activities','activity_source_bindings','program_settings','course_settings','subject_catalog','program_subjects','program_levels','modules','tasks','classes','class_memberships','class_teacher_assignments','class_module_progress','program_resources','program_library_roots','program_legacy_teachers','management_revisions','course_runs','course_resources','activity_policy_imports','legacy_access_evidence','role_assignments','role_import_reviews','timetable_drafts','course_draft_sessions','timetable_publications','published_lessons','published_lesson_classes','published_lesson_teachers','lesson_lifecycle','course_run_state','audit_events','data_ownership','source_record_map','migration_checks'];
function ensureSchema(db, create=false) {
  const existing=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  if(!existing.length && create) for(const migration of migrations) db.exec(migration.sql);
  else requireCondition(stableJSON(existing)===stableJSON(Object.keys(emptyTables()).sort()),'NOT_AN_ACADEMY_IMPORT_DATABASE');
}
export function verifyOperationalRows(plan, actualTables) {
  requireCondition(stableJSON(Object.keys(actualTables).sort())===stableJSON(Object.keys(plan.tables).sort()),'IMPORTED_TABLE_SET_MISMATCH');
  const db=new DatabaseSync(':memory:');
  try {
    for(const migration of migrations)db.exec(migration.sql);
    for(const [table,expected] of Object.entries(plan.tables)) {
    const actual=actualTables[table];
    // SQLite supplies defaults for omitted fields. Compare the complete row by
    // projecting every expected row through PRAGMA defaults, never counts alone.
    const info=db.prepare(`PRAGMA table_info(${table})`).all();
    const expanded=expected.map(row=>Object.fromEntries(info.map(c=>[c.name,Object.hasOwn(row,c.name)?row[c.name]:c.dflt_value===null?null:JSON.parse(c.dflt_value)])));
    const sort=rows=>rows.map(stableJSON).sort();
    requireCondition(stableJSON(sort(actual))===stableJSON(sort(expanded)),'IMPORTED_CONTENT_MISMATCH',{table});
    }
  } finally {db.close();}
  return {contentVerification:'PASS',tablesChecked:Object.keys(plan.tables).length};
}
function verifyPlan(db,plan) {
  const actual={};
  for(const table of Object.keys(plan.tables)) {
    try{actual[table]=db.prepare(`SELECT * FROM ${table}`).all();}catch{throw new SnapshotError('IMPORT_TABLE_MISSING',{table});}
  }
  verifyOperationalRows(plan,actual);
  requireCondition(db.prepare('PRAGMA foreign_key_check').all().length===0,'OPERATIONAL_FOREIGN_KEY_CHECK_FAILED');
  requireCondition(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','OPERATIONAL_INTEGRITY_CHECK_FAILED');
}
export function importOperationalPlan(db,plan) {
  db.exec('PRAGMA foreign_keys=ON');db.exec('BEGIN IMMEDIATE');
  try {
    ensureSchema(db,true);
    if(db.prepare('SELECT count(*) AS n FROM migration_runs').get().n) {
      verifyPlan(db,plan);db.exec('COMMIT');return {...plan.summary,localImport:'PASS',replayed:true};
    }
    for(const table of orderedTables) for(const row of plan.tables[table]) {
      const columns=Object.keys(row);
      try{db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(row));}
      catch{throw new SnapshotError('OPERATIONAL_INSERT_FAILED',{table});}
    }
    verifyPlan(db,plan);db.exec('COMMIT');return {...plan.summary,localImport:'PASS',replayed:false};
  } catch(error){db.exec('ROLLBACK');throw error;}
}
export function verifyOperationalPlan(db,plan) {
  ensureSchema(db);db.exec('BEGIN');
  try{verifyPlan(db,plan);db.exec('COMMIT');return {...plan.summary,localVerification:'PASS'};}
  catch(error){db.exec('ROLLBACK');throw error;}
}
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):`'${text(value).replaceAll("'","''")}'`;
export function operationalSQL(plan) {
  // A fresh dedicated D1 database only. Migrations run first. This file contains
  // sensitive credentials: caller must create it privately and never commit it.
  return orderedTables.flatMap(table=>plan.tables[table].map(row=>`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`)).join('\n')+'\n';
}
