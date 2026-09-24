/* Synthetic references only. Never seed these into a live Program. */
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
  let prepared=true,failMode='',pending=null;
  const plans=[];
  const repository={
    prepare:async()=>{prepared=true;},
    load:async()=>({prepared,tables:structuredClone(tables)}),catalog:async()=>structuredClone(catalog),
    plan(data,records){return {records:records.map(({table,record})=>({table,index:Math.max(0,...data.tables[table].map(row=>row._rowNumber-1)),record}))};},
    async apply(plan){plans.push(structuredClone(plan));const mode=failMode;failMode='';if(mode==='before')throw new Error('Injected failure before commit');for(const item of plan.records)tables[item.table][item.index]={...structuredClone(item.record),_rowNumber:item.index+2};if(mode==='after')throw new Error('Injected lost response after commit');},
  };
  const journal={get:async()=>structuredClone(pending),set:async value=>{pending=structuredClone(value);},clear:async()=>{pending=null;}};
  return {program,catalog,draft,tables,repository,journal,plans,setPrepared:value=>{prepared=value;},failNext:mode=>{failMode=mode;}};
}
