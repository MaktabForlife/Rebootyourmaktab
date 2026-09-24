/* Synthetic references only. Never seed these into a live Program. */
import { managementState } from '../backend/src/programs/management-model.js';
import { TIMETABLE_HEADERS } from '../backend/src/programs/timetable-model.js';
export function timetableFixture(){
  const program={id:'PRG-19da8d59-7eb0-41c3-949d-916f8d764f81',name:'Aalimiya · Demonstration',spreadsheetId:'preview-aalimiya-sheet',status:'DRAFT',timezone:'Asia/Riyadh'};
  const catalog={subjects:[{id:'PS-TAFSEER',subjectId:'TAFSEER',courseId:program.id,name:'Tafseer',active:true}],levels:[],
    modules:[{id:'MOD-DEMO',programSubjectId:'PS-TAFSEER',levelId:'',name:'Maariful Quran · Demo module',active:true}],
    classes:[{id:'CLASS-1',courseId:program.id,name:'Year 1 · Demo',academicYear:'2026',active:true},{id:'CLASS-2',courseId:program.id,name:'Year 2 · Demo',academicYear:'2026',active:true}],
    teachers:[{id:'TEACHER-1',name:'Demo teacher A',active:true},{id:'TEACHER-2',name:'Demo teacher B',active:true}],
    enrollments:[{id:'ENR-1',courseId:program.id,classId:'CLASS-1',accountId:'LEARNER-DEMO',startDate:'2026-01-01',endDate:'',active:true},{id:'ENR-2',courseId:program.id,classId:'CLASS-2',accountId:'LEARNER-DEMO',startDate:'2026-01-01',endDate:'',active:true}]};
  const draft={timezone:'Asia/Riyadh',startDate:'2026-09-21',endDate:'2026-10-04',rules:[{id:'RULE-DEMO',kind:'RECURRING',moduleId:'MOD-DEMO',teacherId:'TEACHER-1',classIds:['CLASS-1','CLASS-2'],weekdays:[1,3],startDate:'2026-09-21',endDate:'2026-10-04',startTime:'13:00',endTime:'14:00'}],exceptions:[]};
  const tables=Object.fromEntries(Object.keys(TIMETABLE_HEADERS).map(name=>[name,[]]));
  Object.assign(tables,{
    ProgramSubjects:catalog.subjects.map(r=>({ProgramSubjectID:r.id,CourseID:program.id,SubjectID:r.subjectId,Active:r.active})),
    ProgramModules:catalog.modules.map(r=>({ProgramModuleID:r.id,ProgramSubjectID:r.programSubjectId,LevelID:r.levelId,Name:r.name,SortOrder:1,Active:r.active})),
    ProgramClasses:catalog.classes.map(r=>({ClassID:r.id,CourseID:program.id,Name:r.name,AcademicYear:r.academicYear,Active:r.active})),
    ProgramEnrollments:catalog.enrollments.map(r=>({EnrollmentID:r.id,CourseID:program.id,ClassID:r.classId,AccountID:r.accountId,StartDate:r.startDate,EndDate:r.endDate,Active:r.active}))
  });
  const shared={subjects:[{SubjectID:'TAFSEER',SubjectName:'Tafseer',Active:true},{SubjectID:'ARABIC',SubjectName:'Arabic',Active:true}],accounts:[...catalog.teachers.map(r=>({AccountID:r.id,DisplayName:r.name,Active:true})),{AccountID:'LEARNER-DEMO',DisplayName:'Demo learner',Active:true}],grantedTeachers:catalog.teachers.map(r=>({AccountID:r.id}))};
  let prepared=true,failMode='',pending=null;
  const plans=[];
  const repository={
    prepare:async()=>{prepared=true;},
    load:async()=>({prepared,tables:structuredClone(tables)}),
    managementReferences:async data=>({...structuredClone(shared),subjects:structuredClone(shared.subjects.filter(r=>!r.Legacy||managementState(data||{tables},program).snapshot.ProgramSubjects.some(s=>s.SubjectID===r.SubjectID)))}),
    catalog:async()=>{
      if(!tables.ProgramManagementState.length)return structuredClone(catalog);
      const t=managementState({tables},program).snapshot;
      return {
        subjects:t.ProgramSubjects.map(r=>({id:r.ProgramSubjectID,courseId:r.CourseID,subjectId:r.SubjectID,name:shared.subjects.find(s=>s.SubjectID===r.SubjectID)?.SubjectName,active:r.Active})),
        levels:t.ProgramLevels.map(r=>({id:r.LevelID,programSubjectId:r.ProgramSubjectID,name:r.Name,active:r.Active})),
        modules:t.ProgramModules.map(r=>({id:r.ProgramModuleID,programSubjectId:r.ProgramSubjectID,levelId:r.LevelID,name:r.Name,active:r.Active})),
        classes:t.ProgramClasses.map(r=>({id:r.ClassID,courseId:r.CourseID,name:r.Name,academicYear:r.AcademicYear,active:r.Active})),
        teachers:shared.accounts.filter(a=>t.ProgramTeachers.some(r=>r.AccountID===a.AccountID)?t.ProgramTeachers.find(r=>r.AccountID===a.AccountID).Active:shared.grantedTeachers.some(r=>r.AccountID===a.AccountID)).map(r=>({id:r.AccountID,name:r.DisplayName,active:true})),
        enrollments:t.ProgramEnrollments.map(r=>({id:r.EnrollmentID,courseId:r.CourseID,classId:r.ClassID,accountId:r.AccountID,startDate:r.StartDate,endDate:r.EndDate,active:r.Active}))
      };
    },
    plan(data,records){return {records:records.map(({table,record})=>({table,index:Math.max(0,...data.tables[table].map(row=>row._rowNumber-1)),record}))};},
    async apply(plan){plans.push(structuredClone(plan));const mode=failMode;failMode='';if(mode==='before')throw new Error('Injected failure before commit');for(const item of plan.records)tables[item.table][item.index]={...structuredClone(item.record),_rowNumber:item.index+2};if(mode==='after')throw new Error('Injected lost response after commit');},
  };
  const journal={get:async()=>structuredClone(pending),set:async value=>{pending=structuredClone(value);},clear:async()=>{pending=null;}};
  return {program,catalog,draft,tables,shared,repository,journal,plans,setPrepared:value=>{prepared=value;},failNext:mode=>{failMode=mode;}};
}
