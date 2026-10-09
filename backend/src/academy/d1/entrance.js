import { buildEntrance, addDays } from '../entrance.js';
import { dateInTimezone } from '../../lib/global-subject-delivery.js';
import { rehearsalError } from './repository.js';

// Adapt normalized D1 records at the repository boundary. Reuse the established
// timetable projection so privacy, class membership and timed joining are shared.
export async function d1Entrance(repository,state,user,input={},now=new Date()) {
  const config=await repository.db.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='PlatformTimezone'").first();
  if(!config?.setting_value)throw rehearsalError('Academy timezone needs migration.');
  const start=input.startDate || dateInTimezone(now,config.setting_value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||Number.isNaN(Date.parse(start))||addDays(start,0)!==start)throw rehearsalError('Choose a valid timetable date.',400,'INVALID_DATE');
  const [activities,publications,subjects,modules,classes,memberships,runs,runStates,lifecycles]=await repository.homeData(state,start,addDays(start,6));
  const programs=activities.filter(a=>a.kind==='PROGRAM').map(a=>({id:a.activity_id,name:a.name,mode:'PROGRAM',status:'ACTIVE',timezone:a.timezone,capabilities:{attendance:true}}));
  const tables={UserAccounts:state?[repository.publicAccount(state.account)]:[],PlatformConfig:[{ConfigKey:'PlatformTimezone',ConfigValue:config.setting_value}],
    GlobalSubjectList:activities.filter(a=>a.kind==='COURSE').map(a=>({SubjectID:a.activity_id,SubjectName:a.name,Active:true})),
    GlobalModuleList:modules.filter(m=>m.activity_key.startsWith('COURSE:')).map(m=>({ModuleID:m.module_id,SubjectID:m.activity_key.slice(7),ModuleName:m.name,Active:true})),
    GlobalSubjectAccessPolicy:activities.filter(a=>a.kind==='COURSE').map(a=>({SubjectPolicyID:a.activity_key,SubjectID:a.activity_id,AccessModel:a.legacy_access_model==='FREE'?'FREE':'SUBSCRIPTION',Active:true})),
    GlobalSubjectAccessMatrix:state?[{AccountID:state.account.account_id,_subjectAccess:Object.fromEntries(state.subscriptions.map(s=>[s.activity_key.slice(7).toUpperCase(),true]))}]:[],
    GlobalSubjectRuns:runs.map(r=>({RunID:r.run_id,SubjectID:r.activity_key.slice(7),RunName:r.name,Timezone:r.timezone,StartDate:r.start_date || '',EndDate:r.end_date || '',ScheduleMode:r.schedule_mode,ScheduleDefinition:r.schedule_definition,Active:true})),
    GlobalTimetableRunState:runStates.map(r=>({RunID:r.run_id,Stage:r.stage,CurrentPublicationID:r.current_publication_id || ''})),
    GlobalTimetablePublications:[],PublishedGlobalTimetableSessions:[],
    GlobalTimetableSessionLifecycle:lifecycles.map(r=>({SessionLifecycleID:r.lifecycle_id,SessionID:r.source_session_id,PublicationID:r.publication_id,Status:r.status,RescheduledFromSessionID:r.previous_source_session_id || '',RescheduledToSessionID:r.replacement_source_session_id || ''}))};
  for(const publication of publications.filter(p=>p.pattern==='COURSE')) {
    const snapshot=JSON.parse(publication.snapshot_json);
    tables.GlobalTimetablePublications.push(snapshot.publication);
    tables.PublishedGlobalTimetableSessions.push(...snapshot.sessions);
  }
  const rolesByProgram=Object.fromEntries(programs.map(p=>[p.id,state?[{AccountID:state.account.account_id,Active:true,Roles:state.roles.filter(r=>r.activity_key.toUpperCase()===`PROGRAM:${p.id}`.toUpperCase()).map(r=>r.role)}]:[]]));
  return buildEntrance({tables,programs,rolesByProgram,user,input,now,programLifecycle:'ACTIVE',loadProgram:async program=>{
    const activity=`PROGRAM:${program.id}`,scope=rows=>rows.filter(r=>r.activity_key===activity);
    return {prepared:true,subjects:scope(subjects).map(s=>({SubjectID:s.subject_id,SubjectName:s.subject_name})),tables:{
      ProgramSubjects:scope(subjects).map(s=>({ProgramSubjectID:s.program_subject_id,CourseID:program.id,SubjectID:s.subject_id,Active:true})),
      ProgramLevels:[],ProgramModules:scope(modules).map(m=>({ProgramModuleID:m.module_id,ProgramSubjectID:m.program_subject_id,Name:m.name,Active:true})),
      ProgramClasses:scope(classes).map(c=>({ClassID:c.class_id,CourseID:program.id,Name:c.name,Active:true})),
      ProgramEnrollments:scope(memberships).map(m=>({EnrollmentID:m.enrollment_id,CourseID:program.id,ClassID:m.class_id,AccountID:m.account_id,StartDate:m.start_date || '',EndDate:m.end_date || '',Active:true})),
      ProgramTeachers:[],ProgramResources:[],ProgramTasks:[],ProgramModuleProgress:[],ProgramLibraryRoots:[],
      ProgramTimetablePublications:scope(publications).map(p=>({PublicationID:p.publication_id,VersionNo:p.version_no,SnapshotJSON:p.snapshot_json,PublishedDate:p.published_at,PublishedByAccountID:p.published_by_source_id}))}};
  }});
}
