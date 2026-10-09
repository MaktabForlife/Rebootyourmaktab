import { definition,programId } from '../../programs/model.js';
import { MANAGEMENT_KINDS,managementView,managementRowRevision,studentClassRevision,applyManagementChange } from '../../programs/management-model.js';
import { payloadHash } from '../../programs/timetable-model.js';
import { managementStore,managementError,rowChanged,same,liveRoles } from './management-store.js';
import {learningAvailable} from './learning-state.js';

const dto=(data,a)=>{
  const settings=data.programs.find(p=>same(p.activity_key,a.activity_key));
  return {id:a.activity_id,name:a.name,mode:'PROGRAM',active:Boolean(a.active),status:a.lifecycle,
    durationYears:settings?.duration_years??'',timezone:settings?.timezone||'Africa/Johannesburg',revision:String(a.revision),spreadsheetId:'',store:'D1'};
};
const writableKinds=new Set(['subjects','levels','modules','tasks','classes','enrollments','progress','student-class','student-classes','subject-import']);
const plain=r=>JSON.stringify(r);
const selected=(data,id)=>{const a=data.activities.find(a=>a.kind==='PROGRAM'&&same(a.activity_id,id));if(!a)throw managementError('Program not found.',404);return a;};
const shape={
  ProgramSubjects:{table:'program_subjects',key:'ProgramSubjectID',columns:{program_subject_id:'ProgramSubjectID',subject_key:'SubjectKey',active:'Active'}},
  ProgramLevels:{table:'program_levels',key:'LevelID',columns:{level_id:'LevelID',program_subject_id:'ProgramSubjectID',name:'Name',sort_order:'SortOrder',active:'Active'}},
  ProgramModules:{table:'modules',key:'ProgramModuleID',columns:{module_id:'ProgramModuleID',program_subject_id:'ProgramSubjectID',level_id:'LevelID',name:'Name',sort_order:'SortOrder',active:'Active'}},
  ProgramTasks:{table:'tasks',key:'TaskID',columns:{task_id:'TaskID',program_subject_id:'ProgramSubjectID',module_id:'ProgramModuleID',name:'Name',sort_order:'SortOrder',active:'Active'}},
  ProgramClasses:{table:'classes',key:'ClassID',columns:{class_id:'ClassID',name:'Name',academic_year:'AcademicYear',zoom_link:'ZoomLink',active:'Active'}},
  ProgramEnrollments:{table:'class_memberships',key:'EnrollmentID',columns:{enrollment_id:'EnrollmentID',class_id:'ClassID',account_id:'AccountID',start_date:'StartDate',end_date:'EndDate',active:'Active'}},
  ProgramModuleProgress:{table:'class_module_progress',key:'ProgressID',columns:{progress_id:'ProgressID',class_id:'ClassID',module_id:'ProgramModuleID',status:'Status'}}
};

export function d1Programs(repository,auth) {
  const store=managementStore(repository,auth),p=store.p;
  function queriesFor(activityKey) {
    const values=activityKey?[activityKey]:[];
    const tables={revision:'management_revisions',teachers:'class_teacher_assignments',legacyTeachers:'program_legacy_teachers',resources:'program_resources',roots:'program_library_roots',...Object.fromEntries(Object.entries(shape).map(([name,spec])=>[name,spec.table]))};
    return {...Object.fromEntries(Object.entries(tables).map(([name,table])=>[name,p(`SELECT * FROM ${table}${activityKey?' WHERE activity_key=?':''}`,...values)])),
      subjects:p('SELECT * FROM subject_catalog ORDER BY subject_key'),
      evidence:p(`SELECT * FROM legacy_access_evidence WHERE ${activityKey?'activity_key=? AND ':''}source_effective=1 AND source_role IN ('ADMIN','SENIOR')`,...values)};
  }
  function projectManagement(all,id) {
    const activityKey=`PROGRAM:${id}`,data={...all};
    for(const name of ['revision','teachers','legacyTeachers','resources','roots',...Object.keys(shape)])data[name]=all[name].filter(r=>same(r.activity_key,activityKey));
    const a=selected(data,id),program=dto(data,a),snapshot={};
    for(const [name,spec] of Object.entries(shape))snapshot[name]=data[name].map(row=>{
      const mapped=Object.fromEntries(Object.entries(spec.columns).filter(([column])=>column!=='subject_key').map(([column,field])=>[field,column==='active'?Boolean(row[column]):row[column]??'']));
      if(['ProgramSubjects','ProgramTasks','ProgramClasses','ProgramEnrollments','ProgramModuleProgress'].includes(name))mapped.CourseID=program.id;
      if(name==='ProgramSubjects')mapped.SubjectID=data.subjects.find(s=>same(s.subject_key,row.subject_key))?.subject_id||'';
      if(name==='ProgramClasses')mapped.TeacherAccountID=data.teachers.find(t=>same(t.class_id,row.class_id)&&t.responsibility==='DEFAULT')?.account_id||'';
      return mapped;
    });
    snapshot.ProgramTeachers=data.legacyTeachers.map(t=>({AccountID:t.account_id,Active:true}));
    snapshot.ProgramResources=data.resources.map(r=>({...JSON.parse(r.metadata_json),ResourceID:r.resource_id,CourseID:program.id,ProgramSubjectID:r.program_subject_id||'',LevelID:r.level_id||'',ProgramModuleID:r.module_id||'',TaskID:r.task_id||'',Name:r.name,ResourceType:r.resource_type,Description:r.description||'',DriveFileID:r.drive_file_id||'',Active:Boolean(r.active)}));
    snapshot.ProgramLibraryRoots=data.roots.map(r=>({FolderID:r.folder_id,Name:r.name}));
    const rev=data.revision[0];
    const current={snapshot,revision:rev?.source_revision||'',sequence:rev?.source_sequence||0};
    const tables={...snapshot,ProgramManagementState:current.sequence?[{CourseID:program.id,Revision:current.revision,Sequence:current.sequence,SnapshotJSON:JSON.stringify(snapshot)}]:[]};
    const accounts=data.accounts.map(account=>({AccountID:account.account_id,DisplayName:account.display_name,Active:Boolean(account.active),Roles:liveRoles(data,account.account_id,a.activity_key).map(role=>role==='PROGRAM_ADMIN'?'ADMIN':role)})).filter(a=>auth.state.account.global_admin||a.Roles.length);
    const shared={subjects:data.subjects.map(s=>({SubjectID:s.subject_id,SubjectName:s.name,Active:Boolean(s.active),Legacy:s.source_namespace!=='ACADEMY'})),accounts,grantedTeachers:accounts.filter(a=>a.Active&&a.Roles.some(r=>['TEACHER','ADMIN'].includes(r))).map(a=>({AccountID:a.AccountID}))};
    return {data,a,program,current,viewData:{tables,prepared:true,libraryPrepared:true},shared};
  }
  async function loadManagement(id,extra={}) {return projectManagement(await store.load({...queriesFor(`PROGRAM:${id}`),...extra}),id);}
  async function persist(loaded,snapshot) {
    const statements=[],activity=loaded.a.activity_key;
    for(const [name,spec] of Object.entries(shape))for(const record of snapshot[name]) {
      const old=loaded.current.snapshot[name].find(r=>r[spec.key]===record[spec.key]);
      if(old&&plain(old)===plain(record))continue;
      const columns=['activity_key',...Object.keys(spec.columns)],values=[activity];
      for(const [column,field] of Object.entries(spec.columns)) {
        let value=record[field];
        if(column==='subject_key') {
          const subject=loaded.data.subjects.find(s=>s.subject_id===record.SubjectID&&s.source_namespace==='ACADEMY')||loaded.data.subjects.find(s=>s.subject_id===record.SubjectID);
          if(!subject)throw managementError('The selected subject is unavailable.',409);value=subject.subject_key;
        }
        if(column==='active')value=Number(Boolean(value));
        else if(['level_id','module_id','program_subject_id','start_date','end_date','academic_year','zoom_link'].includes(column))value=value||null;
        values.push(value===undefined?null:value);
      }
      const key=Object.entries(spec.columns).find(([,field])=>field===spec.key)[0];
      statements.push(p(`INSERT INTO ${spec.table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')}) ON CONFLICT(activity_key,${key}) DO UPDATE SET ${columns.filter(c=>c!=='activity_key'&&c!==key).map(c=>`${c}=excluded.${c}`).join(',')}`,...values));
      if(name==='ProgramClasses') {
        statements.push(p("DELETE FROM class_teacher_assignments WHERE activity_key=? AND class_id=? AND responsibility='DEFAULT'",activity,record.ClassID));
        if(record.TeacherAccountID)statements.push(p("INSERT INTO class_teacher_assignments(activity_key,class_id,account_id,responsibility) VALUES(?,?,?,'DEFAULT')",activity,record.ClassID,record.TeacherAccountID));
      }
    }
    for(const record of snapshot.ProgramResources) {
      const old=loaded.current.snapshot.ProgramResources.find(r=>same(r.ResourceID,record.ResourceID));
      if(old&&plain(old)===plain(record))continue;
      statements.push(p(`INSERT INTO program_resources(activity_key,resource_id,program_subject_id,level_id,module_id,task_id,resource_type,name,description,drive_file_id,metadata_json,active)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(activity_key,resource_id) DO UPDATE SET program_subject_id=excluded.program_subject_id,level_id=excluded.level_id,module_id=excluded.module_id,task_id=excluded.task_id,resource_type=excluded.resource_type,name=excluded.name,description=excluded.description,drive_file_id=excluded.drive_file_id,metadata_json=excluded.metadata_json,active=excluded.active`,activity,record.ResourceID,record.ProgramSubjectID||null,record.LevelID||null,record.ProgramModuleID||null,record.TaskID||null,record.ResourceType,record.Name,record.Description||'',record.DriveFileID,plain(record),Number(Boolean(record.Active))));
    }
    for(const record of snapshot.ProgramLibraryRoots)if(!loaded.current.snapshot.ProgramLibraryRoots.some(r=>same(r.FolderID,record.FolderID)))
      statements.push(p('INSERT INTO program_library_roots(activity_key,folder_id,name) VALUES(?,?,?)',activity,record.FolderID,record.Name));
    return statements;
  }
  return {
    load:loadManagement,
    async loadAll(extra={}) {const data=await store.load({...queriesFor(null),...extra});return {data,programs:data.activities.filter(a=>a.kind==='PROGRAM').map(a=>projectManagement(data,a.activity_id))};},
    async registry(action,input) {
      if(action==='list') {const data=await store.load();return {programs:data.activities.filter(a=>a.kind==='PROGRAM'&&(auth.state.account.global_admin||liveRoles(data,auth.user.accountid,a.activity_key).includes('PROGRAM_ADMIN'))).map(a=>dto(data,a)),platformPrepared:true,store:'D1',learningWorkflowsReady:await learningAvailable(repository.db),statuses:['DRAFT','ACTIVE','ARCHIVED']};}
      if(['prepare','readiness'].includes(action)) {selected(await store.load(),input.id);return {prepared:true,message:'Program records are ready.',checks:[{label:'Program records ready',ok:true}]};}
      if(!['create','save'].includes(action))throw managementError('Unknown Program action.',404);
      return store.change('PROGRAM_REGISTRY','ACADEMY',action,input,async()=>{
        const data=await store.load(),existing=data.activities.find(a=>a.kind==='PROGRAM'&&same(a.activity_id,input.id));
        const status=input.status||'DRAFT';if(!['DRAFT','ACTIVE','ARCHIVED'].includes(status))throw managementError('Choose Draft, Active or Archived.');
        const config=definition({...input,status:status==='ACTIVE'?'DRAFT':status});
        if(action==='create'&&status!=='DRAFT')throw managementError('Create a new Program as a draft.');
        if(action==='create'&&existing)throw managementError('This Program already exists. Refresh the Programs list.',409);
        if(action==='save'&&!existing)throw managementError('Program not found.',404);
        if(existing&&String(input.revision)!==String(existing.revision))throw rowChanged(dto(data,existing),String(existing.revision));
        const id=existing?.activity_id||programId(input.id),activity=`PROGRAM:${id}`,now=new Date().toISOString(),statements=[];
        if(existing)statements.push(p('UPDATE activities SET name=?,lifecycle=?,active=?,website_visible=CASE WHEN ?=1 AND EXISTS(SELECT 1 FROM timetable_publications WHERE activity_key=?) THEN 1 ELSE 0 END,revision=revision+1,updated_at=? WHERE activity_key=?',config.name,status,Number(status==='ACTIVE'),Number(status==='ACTIVE'),activity,now,activity),
          p('UPDATE program_settings SET duration_years=?,timezone=?,revision=revision+1 WHERE activity_key=?',config.durationYears===''?null:config.durationYears,config.timezone,activity));
        else statements.push(p("INSERT INTO activities(activity_key,activity_id,kind,name,active,lifecycle,website_visible,created_at,updated_at,revision) VALUES(?,?,'PROGRAM',?,0,'DRAFT',0,?,?,1)",activity,id,config.name,now,now),
          p('INSERT INTO program_settings(activity_key,duration_years,timezone,revision) VALUES(?,?,?,1)',activity,config.durationYears===''?null:config.durationYears,config.timezone),
          p("INSERT INTO data_ownership(dataset_key,scope_key,authoritative_store,phase,revision) VALUES('ACADEMY',?,'SHEETS','STAGING',1)",activity));
        const updated={activity_key:activity,activity_id:id,name:config.name,active:Number(status==='ACTIVE'),lifecycle:status,revision:(existing?.revision||0)+1};
        const next={...data,programs:[...data.programs.filter(s=>!same(s.activity_key,activity)),{activity_key:activity,duration_years:config.durationYears,timezone:config.timezone}]};
        return {data,statements,result:{program:dto(next,updated)},fields:['Name','DurationYears','Timezone','Lifecycle']};
      });
    },
    async management(action,input,verifyLibraryChange,extra={},initialLoaded=null) {
      if(action==='recover')return {recovered:false};
      if(action==='manage-get') {
        const loaded=await loadManagement(input.id);
        const view=await managementView(loaded.viewData,{managementReferences:async()=>loaded.shared},loaded.program);
        return {...view,store:'D1',coordinatorAvailable:true,managementEditable:loaded.a.lifecycle!=='ARCHIVED',sharedSubjectsEditable:false,globalProfilesAvailable:Boolean(auth.state.account.global_admin),overview:{timetable:null,preview:null,error:{error:'Timetable editing is awaiting migration.',retryable:false}}};
      }
      if(action!=='manage-save')throw managementError('This operation is awaiting migration.',501,'OPERATION_NOT_MIGRATED');
      const library=['resources','library-root'].includes(input.kind);
      if(!writableKinds.has(input.kind)&&!library)throw managementError('Historical teacher-list changes are awaiting migration.',501,'OPERATION_NOT_MIGRATED');
      if(library&&!verifyLibraryChange)throw managementError('Use the Library screen for resource changes.',400);
      let firstRead=initialLoaded;
      return store.change(library?'PROGRAM_LIBRARY':'PROGRAM_MANAGEMENT',`PROGRAM:${String(input.id).toUpperCase()}`,action,input,async()=>{
        // A Library request already read a consistent planning snapshot. The
        // transaction guard validates it; a conflicting retry reads afresh.
        const loaded=firstRead||await loadManagement(input.id,extra);firstRead=null;
        const {data,program,current,shared}=loaded;
        if(loaded.a.lifecycle==='ARCHIVED')throw managementError('Reactivate the Program before changing its records.',409);
        let snapshot=current.snapshot,record,records;
        const changes=input.kind==='student-classes'?input.changes:[input];
        if(!Array.isArray(changes)||!changes.length||changes.length>100)throw managementError('Save between 1 and 100 class changes together.');
        if(input.kind==='student-classes'&&new Set(changes.map(c=>String(c?.AccountID||'').toUpperCase())).size!==changes.length)throw managementError('Each student must occur once.');
        records=[];
        for(const entry of changes) {
          const change=input.kind==='student-classes'?{kind:'student-class',record:{AccountID:entry?.AccountID,ClassID:entry?.ClassID},baseRowRevision:entry?.baseRowRevision}:entry;
          const spec=MANAGEMENT_KINDS[change.kind],student=change.kind==='student-class',account=change.record?.AccountID;
          const old=spec?current.snapshot[spec.table].find(r=>r[spec.key]===change.record?.[spec.key])||null:student?{AccountID:account,enrollments:current.snapshot.ProgramEnrollments.filter(r=>r.AccountID===account)}:null;
          const revision=student?await studentClassRevision(current.snapshot.ProgramEnrollments,account):await managementRowRevision(old);
          if((spec||student)&&change.baseRowRevision!==revision||!spec&&!student&&input.revision!==current.revision)throw rowChanged(old,revision,input.kind==='student-classes'?account:undefined);
          const applied=applyManagementChange({snapshot},change,shared,program);snapshot=applied.snapshot;record=applied.record;
          if(library)await verifyLibraryChange(loaded,record,old);
          if(input.kind==='student-classes')records.push({...record,rowRevision:await studentClassRevision(snapshot.ProgramEnrollments,account)});
        }
        const revision=crypto.randomUUID(),result=input.kind==='student-classes'?{revision,records}:{revision,record,
          ...(input.kind==='student-class'?{rowRevision:await studentClassRevision(snapshot.ProgramEnrollments,input.record.AccountID)}:MANAGEMENT_KINDS[input.kind]?{rowRevision:await managementRowRevision(record)}:{})};
        if(input.kind==='modules'&&record.LevelID)result.level=snapshot.ProgramLevels.find(r=>r.LevelID===record.LevelID);
        const statements=await persist(loaded,snapshot);
        statements.push(p(`INSERT INTO management_revisions(activity_key,source_revision,source_sequence,source_snapshot_sha256,modified_at,modified_by_source_id) VALUES(?,?,?,?,?,?)
          ON CONFLICT(activity_key) DO UPDATE SET source_revision=excluded.source_revision,source_sequence=excluded.source_sequence,source_snapshot_sha256=excluded.source_snapshot_sha256,modified_at=excluded.modified_at,modified_by_source_id=excluded.modified_by_source_id`,loaded.a.activity_key,revision,current.sequence+1,await payloadHash(snapshot),new Date().toISOString(),auth.user.accountid));
        return {data,statements,result,fields:[input.kind]};
      });
    }
  };
}
