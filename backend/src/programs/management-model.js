import { problem, clean } from './model.js';
import { payloadHash, validDate } from './timetable-model.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';

export const REFERENCE_TABLES = ['ProgramSubjects','ProgramLevels','ProgramModules','ProgramClasses','ProgramEnrollments'];
export const STANDARD_LEVELS = ['Beginner','Intermediate','Advanced'];
export const MANAGEMENT_KINDS = {
  subjects:{table:'ProgramSubjects',key:'ProgramSubjectID',prefix:'PS'},
  levels:{table:'ProgramLevels',key:'LevelID',prefix:'LVL'},
  modules:{table:'ProgramModules',key:'ProgramModuleID',prefix:'MOD'},
  classes:{table:'ProgramClasses',key:'ClassID',prefix:'CLS'},
  enrollments:{table:'ProgramEnrollments',key:'EnrollmentID',prefix:'ENR'},
  progress:{table:'ProgramModuleProgress',key:'ProgressID',prefix:'MP'},
  teachers:{table:'ProgramTeachers',key:'AccountID',prefix:''}
};
export function managementState(data, program) {
  const entries=data.tables.ProgramManagementState||[];
  if(entries.some(r=>r.CourseID!==program.id||!Number.isSafeInteger(Number(r.Sequence))||Number(r.Sequence)<1)
    ||new Set(entries.map(r=>Number(r.Sequence))).size!==entries.length) throw problem('Program management history needs repair.',409);
  const latest=entries.reduce((a,b)=>!a||Number(b.Sequence)>Number(a.Sequence)?b:a,null);
  let snapshot=Object.fromEntries([...REFERENCE_TABLES,'ProgramTeachers'].map(name=>[name,data.tables[name]||[]]));
  if(latest){try{snapshot=JSON.parse(latest.SnapshotJSON);}catch{throw problem('Program management history is unreadable.',409);}}
  // Earlier snapshots have no class/module progress; upgrade in memory without touching Sheets.
  if(!Object.hasOwn(snapshot,'ProgramModuleProgress'))snapshot.ProgramModuleProgress=[];
  for(const {table,key} of Object.values(MANAGEMENT_KINDS)) {
    if(!Array.isArray(snapshot[table])||snapshot[table].some(r=>!clean(r[key]))||new Set(snapshot[table].map(r=>r[key])).size!==snapshot[table].length) throw problem(`${table} has invalid or duplicate records.`,409);
  }
  for(const name of ['ProgramSubjects','ProgramClasses','ProgramEnrollments','ProgramModuleProgress'])if(snapshot[name].some(r=>r.CourseID!==program.id))throw problem('A management row belongs to another Program.',409);
  const progress=snapshot.ProgramModuleProgress;
  if(progress.some(r=>!clean(r.ProgramModuleID)||!clean(r.ClassID)||!['ACTIVE','INACTIVE','COMPLETED'].includes(r.Status))||new Set(progress.map(r=>JSON.stringify([r.ProgramModuleID,r.ClassID]))).size!==progress.length)throw problem('Module progress has invalid or duplicate records.',409);
  return {snapshot,revision:latest?.Revision||'',sequence:Number(latest?.Sequence||0)};
}
export function managementRowRevision(record) {
  // Sheet position is metadata, not a change to the record being edited.
  return payloadHash(record?Object.fromEntries(Object.entries(record).filter(([key])=>key!=='_rowNumber')):null);
}
export async function managementView(data, repository, program) {
  const current=managementState(data,program), shared=await repository.managementReferences(data);
  const rows=Object.fromEntries(Object.entries(MANAGEMENT_KINDS).map(([kind,{table}])=>[kind,current.snapshot[table].map(r=>({...r}))]));
  // Preserve legacy assignment records for old drafts; timetable eligibility comes from current roles.
  for(const teacher of shared.grantedTeachers) if(!rows.teachers.some(r=>r.AccountID===teacher.AccountID)) rows.teachers.push({AccountID:teacher.AccountID,Active:true});
  for(const kind of ['levels','modules'])rows[kind].sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
  const referenceRevision=await payloadHash(shared);
  const rowRevisions={};
  for(const [kind,{table,key}] of Object.entries(MANAGEMENT_KINDS))rowRevisions[kind]=Object.fromEntries(await Promise.all(current.snapshot[table].map(async record=>[record[key],await managementRowRevision(record)])));
  return {program,prepared:data.prepared,revision:current.revision,referenceRevision,rowRevisions,emptyRowRevision:await managementRowRevision(null),rows,standardLevels:STANDARD_LEVELS,sharedSubjects:shared.subjects,accounts:shared.accounts,eligibleTeacherIds:shared.grantedTeachers.map(r=>r.AccountID)};
}
export function applyManagementChange(current, input, shared, program) {
  if(input.kind==='subject-import') {
    const ids=input.record?.subjectIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>250||ids.some(id=>typeof id!=='string'||!id||id.length>100))throw problem('Select between 1 and 250 Academy subjects.');
    const snapshot=structuredClone(current.snapshot),record={added:0,alreadyLinked:0,archived:0};
    for(const id of new Set(ids)) {
      if(!shared.subjects.some(s=>s.SubjectID===id&&!s.Legacy&&active(s.Active)))throw problem('An imported subject is unavailable. Review the Reboot list again.');
      const existing=snapshot.ProgramSubjects.find(r=>r.SubjectID===id);
      if(existing){record.alreadyLinked++;if(!active(existing.Active))record.archived++;continue;}
      snapshot.ProgramSubjects.push({ProgramSubjectID:`PS-${crypto.randomUUID()}`,CourseID:program.id,SubjectID:id,Active:true});
      record.added++;
    }
    return {snapshot,record};
  }
  const spec=MANAGEMENT_KINDS[input.kind];
  if(!spec||!input.record||typeof input.record!=='object'||Array.isArray(input.record)) throw problem('Choose a valid management row.');
  const source=input.record, snapshot=structuredClone(current.snapshot), rows=snapshot[spec.table];
  const id=clean(source[spec.key]);
  if(input.kind==='teachers') {if(!shared.accounts.some(a=>a.AccountID===id)) throw problem('Choose an existing Academy account.');}
  else if(!rows.some(r=>r[spec.key]===id)&&!new RegExp(`^${spec.prefix}-[\\w-]{1,80}$`).test(id)) throw problem('This row needs its generated identifier. Reload and add it again.');
  const previous=rows.find(r=>r[spec.key]===id);
  // Editing an existing imported reference may preserve its historical identifier.
  if(input.creating===true&&previous) throw problem('This row already exists. Reload before editing it.',409);
  if(input.creating!==true&&!previous&&input.kind!=='teachers') throw problem('This row no longer exists. Reload before editing it.',409);
  if(input.kind==='progress') {
    if(!['ACTIVE','INACTIVE','COMPLETED'].includes(source.Status))throw problem('Choose Active, Inactive or Completed for this class.');
    const module=snapshot.ProgramModules.find(r=>r.ProgramModuleID===source.ProgramModuleID),klass=snapshot.ProgramClasses.find(r=>r.ClassID===source.ClassID&&r.CourseID===program.id);
    if(!module||!klass)throw problem('Choose a module and class from this Program.');
    if(previous&&(previous.ProgramModuleID!==module.ProgramModuleID||previous.ClassID!==klass.ClassID))throw problem('A saved progress record cannot move to another class or module.');
    if(rows.some(r=>r.ProgressID!==id&&r.ProgramModuleID===module.ProgramModuleID&&r.ClassID===klass.ClassID))throw problem('This class already has a status for this module. Edit its existing progress record.',409);
    if(source.Status==='ACTIVE'&&(!active(module.Active)||!active(klass.Active)))throw problem('Reactivate the module and class before marking their progress Active.');
    const record={ProgressID:id,CourseID:program.id,ProgramModuleID:module.ProgramModuleID,ClassID:klass.ClassID,Status:source.Status};
    if(previous)rows[rows.indexOf(previous)]=record;else rows.push(record);
    return {snapshot,record};
  }
  if(typeof source.Active!=='boolean') throw problem('Choose Active or Archived.');
  const record={[spec.key]:id,Active:source.Active};
  const text=(name,label,max=160,optional=false)=>{
    if(typeof source[name]!=='string'&&source[name]!==undefined) throw problem(`${label} must be text.`);
    const value=clean(source[name]);if((!optional&&!value)||value.length>max) throw problem(`Enter ${label.toLowerCase()}${optional?' or leave it blank':''} (up to ${max} characters).`);return value;
  };
  const requireSubject=()=>{
    const subjectId=text('ProgramSubjectID','Program subject',100), subject=snapshot.ProgramSubjects.find(r=>r.ProgramSubjectID===subjectId&&r.CourseID===program.id);
    if(!subject||(record.Active&&(!active(subject.Active)||!shared.subjects.some(s=>s.SubjectID===subject.SubjectID&&active(s.Active))))) throw problem('Choose an active subject in this Program.');return subjectId;
  };
  if(['classes','subjects','enrollments'].includes(input.kind))record.CourseID=program.id;
  if(['levels','modules','classes'].includes(input.kind))record.Name=text('Name','Name');
  if(['levels','modules'].includes(input.kind)){
    record.ProgramSubjectID=requireSubject();
    const order=source.SortOrder===''||source.SortOrder===undefined?0:Number(source.SortOrder);
    if(!Number.isInteger(order)||order<0||order>9999)throw problem('Order must be a whole number from 0 to 9999.');record.SortOrder=order;
  }
  if(input.kind==='subjects'){
    record.SubjectID=text('SubjectID','Shared subject',100);
    if(!shared.subjects.some(s=>s.SubjectID===record.SubjectID&&(!record.Active||active(s.Active))))throw problem('Choose an active shared Academy subject.');
    const chosen=shared.subjects.find(s=>s.SubjectID===record.SubjectID);
    const oldSubject=previous&&shared.subjects.find(s=>s.SubjectID===previous.SubjectID);
    if(chosen?.Legacy&&(!previous||previous.SubjectID!==record.SubjectID))throw problem('Choose an Academy curriculum subject. Global course subjects cannot be added here.');
    if(previous&&previous.SubjectID!==record.SubjectID&&!oldSubject?.Legacy)throw problem('A saved Academy subject link cannot be changed. Archive it and add another.');
    if(rows.some(r=>r.ProgramSubjectID!==id&&r.SubjectID===record.SubjectID))throw problem('This subject is already linked. Edit or reactivate its existing row.');
  }
  if(input.kind==='modules'){
    record.LevelID=text('LevelID','Level',100,true);
    if(record.LevelID.startsWith('standard:')){
      const name=record.LevelID.slice('standard:'.length),index=STANDARD_LEVELS.indexOf(name);
      if(index<0)throw problem('Choose Beginner, Intermediate, Advanced, or no level.');
      const matches=snapshot.ProgramLevels.filter(r=>r.ProgramSubjectID===record.ProgramSubjectID&&clean(r.Name).toLowerCase()===name.toLowerCase());
      if(matches.length>1)throw problem('This subject has duplicate levels. Ask an administrator to review them.',409);
      let level=matches[0];
      if(!level){level={LevelID:`LVL-${crypto.randomUUID()}`,ProgramSubjectID:record.ProgramSubjectID,Name:name,SortOrder:index+1,Active:record.Active};snapshot.ProgramLevels.push(level);}
      else if(record.Active)level.Active=true;
      record.LevelID=level.LevelID;
    }
    if(record.LevelID&&!snapshot.ProgramLevels.some(r=>r.LevelID===record.LevelID&&r.ProgramSubjectID===record.ProgramSubjectID&&(!record.Active||active(r.Active))))throw problem('The level must belong to this subject; leaving it blank is allowed.');
    const selected=snapshot.ProgramLevels.find(r=>r.LevelID===record.LevelID);
    if(selected&&!STANDARD_LEVELS.some(name=>name.toLowerCase()===clean(selected.Name).toLowerCase())&&previous?.LevelID!==selected.LevelID)throw problem('Choose a standard level. An existing custom level may be kept on its current module.');
  }
  if(input.kind==='classes')record.AcademicYear=text('AcademicYear','Academic year',40,true);
  if(input.kind==='enrollments'){
    record.ClassID=text('ClassID','Class',100);record.AccountID=text('AccountID','Learner',100);
    if(!snapshot.ProgramClasses.some(r=>r.ClassID===record.ClassID&&r.CourseID===program.id&&(!record.Active||active(r.Active))))throw problem('Choose an active class in this Program.');
    if(!shared.accounts.some(a=>a.AccountID===record.AccountID&&(!record.Active||active(a.Active))))throw problem('Choose an active Academy account.');
    record.StartDate=text('StartDate','Start date',10);record.EndDate=text('EndDate','End date',10,true);
    if(!validDate(record.StartDate)||(record.EndDate&&(!validDate(record.EndDate)||record.EndDate<record.StartDate)))throw problem('Enter valid membership dates; the end date must be on or after the start date.');
    if(record.Active&&rows.some(r=>r.EnrollmentID!==id&&active(r.Active)&&r.ClassID===record.ClassID&&r.AccountID===record.AccountID&&r.StartDate<=(record.EndDate||'9999-12-31')&&record.StartDate<=(r.EndDate||'9999-12-31')))throw problem('This learner already has overlapping membership dates in this class.');
  }
  if(input.kind==='teachers'&&record.Active&&!shared.accounts.some(a=>a.AccountID===id&&active(a.Active)))throw problem('Choose an active Academy account.');
  if(input.kind==='teachers'&&record.Active&&!shared.grantedTeachers.some(a=>a.AccountID===id))throw problem('This user needs an active Teacher, Senior or Admin role in this Program before being assigned to teach.');
  if(record.Name&&rows.some(r=>r[spec.key]!==id&&clean(r.Name).toLowerCase()===record.Name.toLowerCase()&&(!record.ProgramSubjectID||r.ProgramSubjectID===record.ProgramSubjectID)))throw problem('That name already exists here. Edit its existing row.');
  if(input.kind==='levels'&&previous&&previous.ProgramSubjectID!==record.ProgramSubjectID&&snapshot.ProgramModules.some(r=>r.LevelID===id))throw problem('A level used by modules cannot move to another subject.');
  if(!record.Active){
    const used=input.kind==='subjects'?snapshot.ProgramModules.some(r=>r.ProgramSubjectID===id&&active(r.Active))
      :input.kind==='levels'?snapshot.ProgramModules.some(r=>r.LevelID===id&&active(r.Active))
      :input.kind==='classes'?snapshot.ProgramEnrollments.some(r=>r.ClassID===id&&active(r.Active)):false;
    if(used)throw problem('Archive or move the active dependent rows first.');
  }
  if(previous)rows[rows.indexOf(previous)]=record;else rows.push(record);
  return {snapshot,record};
}
