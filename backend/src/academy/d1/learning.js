import {subjectView} from './subjects.js';
import {d1Programs} from './programs.js';
import {managementStore,managementError,liveRoles,same} from './management-store.js';
import {requireLearning} from './learning-state.js';
import {timetableService} from '../../programs/timetable-service.js';
import {attendanceService} from '../../programs/attendance-service.js';
import {WEEKLY_SCHEMA,publicationRecord} from '../../programs/weekly-timetable.js';
import {payloadHash,TIMETABLE_SCHEMA} from '../../programs/timetable-model.js';
import {insertRecords} from './insert-records.js';

export function learningCatalog(loaded) {
  const t=loaded.current.snapshot,shared=loaded.shared;
  const students=new Set(shared.accounts.filter(a=>a.Active&&a.Roles.includes('STUDENT')).map(a=>a.AccountID));
  return {
    subjects:t.ProgramSubjects.map(r=>{const s=shared.subjects.find(s=>same(s.SubjectID,r.SubjectID));return {id:r.ProgramSubjectID,courseId:r.CourseID,subjectId:r.SubjectID,name:s?.SubjectName||r.SubjectID,active:r.Active&&Boolean(s?.Active)};}),
    levels:t.ProgramLevels.map(r=>({id:r.LevelID,programSubjectId:r.ProgramSubjectID,name:r.Name,active:r.Active})),
    modules:t.ProgramModules.map(r=>({id:r.ProgramModuleID,programSubjectId:r.ProgramSubjectID,levelId:r.LevelID,name:r.Name,active:r.Active})),
    classes:t.ProgramClasses.map(r=>({id:r.ClassID,courseId:r.CourseID,name:r.Name,academicYear:r.AcademicYear,zoomLink:r.ZoomLink,classTeacherId:r.TeacherAccountID,active:r.Active})),
    teachers:shared.accounts.filter(a=>a.Active&&a.Roles.some(r=>['TEACHER','ADMIN'].includes(r))).map(a=>({id:a.AccountID,name:a.DisplayName,active:true})),
    enrollments:t.ProgramEnrollments.map(r=>({id:r.EnrollmentID,courseId:r.CourseID,classId:r.ClassID,accountId:r.AccountID,startDate:r.StartDate,endDate:r.EndDate,active:r.Active&&students.has(r.AccountID)}))
  };
}
export function d1Learning(repository,auth,now=()=>new Date()) {
  const store=managementStore(repository,auth),p=store.p,programs=d1Programs(repository,auth);
  let readiness;
  const ready=()=>readiness??=requireLearning(repository.db);
  async function load(id) {
    await ready();
    const activity=`PROGRAM:${id}`;
    const loaded=await programs.load(id,{
      drafts:p('SELECT * FROM timetable_drafts WHERE activity_key=?',activity),
      publications:p('SELECT * FROM timetable_publications WHERE activity_key=? ORDER BY version_no',activity),
      pointer:p('SELECT * FROM program_publication_state WHERE activity_key=?',activity),
      registers:p('SELECT * FROM attendance_registers WHERE activity_key=? ORDER BY sequence',activity),
      marks:p('SELECT * FROM attendance_marks WHERE activity_key=?',activity)
    });
    const roles=liveRoles(loaded.data,auth.user.accountid,loaded.a.activity_key);
    loaded.roles=roles;
    if(!auth.state.account.global_admin&&(loaded.a.lifecycle!=='ACTIVE'||!roles.length))throw managementError('This Program is unavailable to your account.',403,'FORBIDDEN');
    loaded.program.timetableEditable=loaded.a.lifecycle!=='ARCHIVED';
    const tables=loaded.viewData.tables;
    tables.ProgramTimetableState=loaded.data.drafts.map(r=>({CourseID:loaded.program.id,SchemaVersion:JSON.parse(r.draft_json).format===WEEKLY_SCHEMA?WEEKLY_SCHEMA:TIMETABLE_SCHEMA,Revision:r.source_revision||'',Sequence:r.source_sequence,DraftJSON:r.draft_json,CurrentPublicationID:loaded.data.pointer[0]?.latest_publication_id||''}));
    tables.ProgramTimetablePublications=loaded.data.publications.map(r=>({PublicationID:r.publication_id,CourseID:loaded.program.id,VersionNo:r.version_no,PublishedDate:r.published_at,PublishedByAccountID:r.published_by_source_id,SnapshotJSON:r.snapshot_json}));
    tables.ProgramTimetableOperations=[];
    loaded.attendance={prepared:true,source:loaded.viewData,tables:{
      ProgramAttendanceRegisters:loaded.data.registers.map(r=>({RegisterID:r.register_id,CourseID:loaded.program.id,AttendanceDate:r.attendance_date,PublicationID:r.publication_id,LessonAnchor:r.lesson_anchor,LessonJSON:r.lesson_json,LearnerCount:r.learner_count,SubmittedDate:r.submitted_at,SubmittedByAccountID:r.submitted_by_account_id||r.source_actor_id,OperationID:r.operation_id})),
      ProgramAttendanceMarks:loaded.data.marks.map(r=>({RegisterID:r.register_id,AccountID:r.account_id,DisplayName:r.display_name,Status:r.status})),ProgramAttendanceOperations:[]}};
    return loaded;
  }
  const timetable=loaded=>timetableService({load:async()=>loaded.viewData,catalog:async()=>learningCatalog(loaded),managementReferences:async()=>loaded.shared,
    hasAttendanceOn:async date=>loaded.data.registers.some(r=>r.attendance_date===date),plan:(_data,records)=>records},loaded.program,now);
  function requireRole(loaded,roles) {
    if(!auth.state.account.global_admin&&!loaded.roles.some(r=>roles.includes(r)))throw managementError('This action requires an authorised Program role.',403,'FORBIDDEN');
  }
  async function timetableStatements(loaded,records) {
    const activity=loaded.a.activity_key,statements=[];
    for(const {table,record:r} of records) {
      if(table==='ProgramTimetablePublications') {
        const pub=publicationRecord(r,loaded.program);
        statements.push(p(`INSERT INTO timetable_publications(activity_key,publication_id,scope_key,version_no,pattern,published_at,published_by_source_id,effective_from,timezone,snapshot_json,source_snapshot_sha256,conversion)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,'EXACT')`,activity,pub.id,activity,pub.version,pub.pattern,pub.date,pub.by,pub.effectiveFrom,pub.snapshot.timezone||loaded.program.timezone,r.SnapshotJSON,await payloadHash(pub.snapshot)));
        const lessons=[],classes=[],teachers=[];
        for(const l of pub.occurrences) {
          lessons.push({activity_key:activity,publication_id:pub.id,lesson_anchor:l.anchor,source_rule_id:l.sourceRuleId||l.ruleId||null,module_id:l.moduleId||null,kind:l.kind||'LESSON',status:l.status||'SCHEDULED',weekday:Number.isInteger(l.weekday)?l.weekday:null,lesson_date:l.date||l.sessionDate||null,start_time:l.startTime,end_time:l.endTime,timezone:pub.snapshot.timezone||loaded.program.timezone,title:l.moduleName||l.title||null,zoom_link:l.zoomLink||null,snapshot_json:JSON.stringify(l)});
          for(const id of new Set(l.classIds||[]))classes.push({activity_key:activity,publication_id:pub.id,lesson_anchor:l.anchor,class_id:id});
          for(const id of new Set([l.teacherId,...(l.teacherIds||[])].filter(Boolean)))teachers.push({activity_key:activity,publication_id:pub.id,lesson_anchor:l.anchor,account_id:id});
        }
        statements.push(...insertRecords(p,'published_lessons',lessons),...insertRecords(p,'published_lesson_classes',classes),...insertRecords(p,'published_lesson_teachers',teachers));
        statements.push(p("UPDATE activities SET website_visible=CASE WHEN active=1 AND lifecycle='ACTIVE' THEN 1 ELSE 0 END WHERE activity_key=?",activity));
      }
      if(table==='ProgramTimetableState')statements.push(p(`INSERT INTO timetable_drafts(activity_key,scope_key,source_revision,source_sequence,draft_json,source_draft_sha256,modified_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(activity_key,scope_key) DO UPDATE SET source_revision=excluded.source_revision,source_sequence=excluded.source_sequence,draft_json=excluded.draft_json,source_draft_sha256=excluded.source_draft_sha256,modified_at=excluded.modified_at`,activity,activity,r.Revision,r.Sequence,r.DraftJSON,await payloadHash(JSON.parse(r.DraftJSON)),r.ModifiedDate),
        p('INSERT INTO program_publication_state VALUES(?,?) ON CONFLICT(activity_key) DO UPDATE SET latest_publication_id=excluded.latest_publication_id',activity,r.CurrentPublicationID||null));
    }
    return statements;
  }
  return {
    load,
    async timetable(action,input) {
      await ready();
      const write=['save','publish'].includes(action);
      if(write)return store.change('PROGRAM_TIMETABLE',`PROGRAM:${String(input.id).toUpperCase()}`,action,input,async()=>{
        const loaded=await load(input.id);requireRole(loaded,['PROGRAM_ADMIN']);
        const planned=await timetable(loaded).plan(action,input,auth.user,await payloadHash({action,input}));
        return {data:loaded.data,statements:await timetableStatements(loaded,planned.plan),result:planned.result,fields:['Timetable',...(action==='publish'?['Publication']:[])]};
      });
      const loaded=await load(input.id);requireRole(loaded,['PROGRAM_ADMIN']);
      if(['prepare','prepare-library'].includes(action))return {prepared:true,libraryPrepared:true};
      if(action==='recover')return {recovered:false};
      if(!['get','history','published','preview','validate','manage-get'].includes(action))throw managementError('Unknown timetable action.',404);
      const result=await timetable(loaded).read(action,input);
      return {...(action==='manage-get'?await subjectView(result,auth.state.account.global_admin):result),...(action==='manage-get'&&loaded.data.academyModules?{sharedModules:loaded.data.academyModules.map(m=>({id:m.module_id,name:m.name,subjectId:loaded.data.subjects.find(s=>same(s.subject_key,m.subject_key))?.subject_id||'',active:Boolean(m.active)}))}:{}),program:loaded.program,store:'D1',coordinatorAvailable:true,managementEditable:loaded.a.lifecycle!=='ARCHIVED',globalProfilesAvailable:Boolean(auth.state.account.global_admin),learningWorkflowsReady:true};
    },
    async attendance(action,input) {
      await ready();
      const plan=async()=>{
        const loaded=await load(input.id);requireRole(loaded,['PROGRAM_ADMIN','TEACHER']);
        const user={...auth.user,programRoles:loaded.roles.map(r=>r==='PROGRAM_ADMIN'?'ADMIN':r)};
        const service=attendanceService({load:async()=>loaded.attendance,accounts:async()=>loaded.shared.accounts,timetable:{catalog:async()=>learningCatalog(loaded)},plan:(_data,records)=>records},loaded.program,now);
        return {loaded,service,user};
      };
      if(action==='submit')return store.change('PROGRAM_ATTENDANCE',`PROGRAM:${String(input.id).toUpperCase()}`,action,input,async()=>{
        const {loaded,service,user}=await plan(),planned=await service.plan('save',input,user,await payloadHash(input));
        let sequence=Math.max(0,...loaded.data.registers.map(r=>r.sequence));const registers=[],marks=[],activity=loaded.a.activity_key;
        for(const {table,record:r} of planned.plan) {
          if(table==='ProgramAttendanceRegisters')registers.push({activity_key:activity,register_id:r.RegisterID,sequence:++sequence,attendance_date:r.AttendanceDate,publication_id:r.PublicationID,lesson_anchor:r.LessonAnchor,lesson_json:r.LessonJSON,learner_count:r.LearnerCount,submitted_at:r.SubmittedDate,submitted_by_account_id:auth.user.accountid,source_actor_id:auth.user.accountid,operation_id:input.operationId});
          if(table==='ProgramAttendanceMarks')marks.push({activity_key:activity,register_id:r.RegisterID,account_id:r.AccountID,display_name:r.DisplayName,status:r.Status});
        }
        return {data:loaded.data,statements:[...insertRecords(p,'attendance_registers',registers),...insertRecords(p,'attendance_marks',marks)],result:planned.result,fields:['Attendance']};
      });
      const {service,user}=await plan();
      if(action==='get')return {...await service.read(input.date,user),store:'D1'};
      if(action==='recover')return {recovered:false};
      if(action==='prepare'){if(!auth.state.account.global_admin)throw managementError('Only a Global Admin can prepare storage.',403);return {prepared:true};}
      throw managementError('Unknown attendance action.',404);
    }
  };
}
