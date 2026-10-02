import { normalizeZoomLink } from './zoom-links.js';
import { problem, clean } from './model.js';
import { payloadHash, validDate } from './timetable-model.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';

export const REFERENCE_TABLES = ['ProgramSubjects','ProgramLevels','ProgramModules','ProgramTasks','ProgramClasses','ProgramEnrollments','ProgramResources'];
export const STANDARD_LEVELS = ['Beginner','Intermediate','Advanced'];
export const MANAGEMENT_KINDS = {
  subjects:{table:'ProgramSubjects',key:'ProgramSubjectID',prefix:'PS'},
  levels:{table:'ProgramLevels',key:'LevelID',prefix:'LVL'},
  modules:{table:'ProgramModules',key:'ProgramModuleID',prefix:'MOD'},
  tasks:{table:'ProgramTasks',key:'TaskID',prefix:'TASK'},
  classes:{table:'ProgramClasses',key:'ClassID',prefix:'CLS'},
  enrollments:{table:'ProgramEnrollments',key:'EnrollmentID',prefix:'ENR'},
  progress:{table:'ProgramModuleProgress',key:'ProgressID',prefix:'MP'},
  resources:{table:'ProgramResources',key:'ResourceID',prefix:'RES'},
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
  if(!Object.hasOwn(snapshot,'ProgramLibraryRoots'))snapshot.ProgramLibraryRoots=[];
  const roots=snapshot.ProgramLibraryRoots;
  if(!Array.isArray(roots)||roots.length>20||roots.some(root=>!root||!/^[A-Za-z0-9_-]{10,128}$/.test(clean(root.FolderID))||!clean(root.Name)||clean(root.Name).length>160)
    ||new Set(roots.map(root=>root.FolderID)).size!==roots.length)throw problem('Program Library folders need repair.',409);
  // Tasks and resources are individual rows in V105.4, outside the bounded management snapshot.
  snapshot.ProgramTasks=data.tables.ProgramTasks||[];
  snapshot.ProgramResources=data.tables.ProgramResources||[];
  for(const {table,key} of Object.values(MANAGEMENT_KINDS)) {
    if(!Array.isArray(snapshot[table])||snapshot[table].some(r=>!clean(r[key]))||new Set(snapshot[table].map(r=>r[key])).size!==snapshot[table].length) throw problem(`${table} has invalid or duplicate records.`,409);
  }
  for(const name of ['ProgramSubjects','ProgramTasks','ProgramClasses','ProgramEnrollments','ProgramModuleProgress','ProgramResources'])if(snapshot[name].some(r=>r.CourseID!==program.id))throw problem('A management row belongs to another Program.',409);
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
  for(const kind of ['levels','modules','tasks'])rows[kind].sort((a,b)=>Number(a.SortOrder||0)-Number(b.SortOrder||0));
  const referenceRevision=await payloadHash(shared);
  const rowRevisions={};
  for(const [kind,{table,key}] of Object.entries(MANAGEMENT_KINDS))rowRevisions[kind]=Object.fromEntries(await Promise.all(current.snapshot[table].map(async record=>[record[key],await managementRowRevision(record)])));
  return {program,prepared:data.prepared,libraryPrepared:data.libraryPrepared,libraryRoots:current.snapshot.ProgramLibraryRoots.map(root=>({...root})),revision:current.revision,referenceRevision,rowRevisions,emptyRowRevision:await managementRowRevision(null),rows,standardLevels:STANDARD_LEVELS,sharedSubjects:shared.subjects,accounts:shared.accounts,eligibleTeacherIds:shared.grantedTeachers.map(r=>r.AccountID)};
}
export function applyManagementChange(current, input, shared, program) {
  if(input.kind==='library-root'){
    const folderId=clean(input.record?.FolderID),name=clean(input.record?.Name);
    if(!/^[A-Za-z0-9_-]{10,128}$/.test(folderId)||!name||name.length>160)throw problem('Choose an accessible Google Drive folder.');
    const snapshot=structuredClone(current.snapshot);
    if(snapshot.ProgramLibraryRoots.some(root=>root.FolderID===folderId))throw problem('This folder is already available in the Program Library.',409);
    if(snapshot.ProgramLibraryRoots.length>=20)throw problem('This Program has reached its Library folder limit.',409);
    const record={FolderID:folderId,Name:name};snapshot.ProgramLibraryRoots.push(record);
    return {snapshot,record};
  }
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
  if(input.kind==='resources') {
    if(typeof source.Active!=='boolean')throw problem('Choose Active or Archived.');
    const string=(field,label,max=160,optional=false)=>{
      if(typeof source[field]!=='string')throw problem(`${label} must be text.`);
      const value=clean(source[field]);
      if((!optional&&!value)||value.length>max)throw problem(`Enter ${label.toLowerCase()}${optional?' or leave it blank':''} (up to ${max} characters).`);
      return value;
    };
    const subjectId=string('ProgramSubjectID','Program subject',100);
    const levelId=string('LevelID','Level',100,true);
    const moduleId=string('ProgramModuleID','Module',100,true);
    const taskId=source.TaskID===undefined?'':string('TaskID','Task',100,true);
    const type=string('ResourceType','Resource type',20).toUpperCase();
    if(!['EBOOK','PRINTABLE','AUDIO','VIDEO','OTHER'].includes(type))throw problem('Choose a Library resource type.');
    const subject=snapshot.ProgramSubjects.find(r=>r.ProgramSubjectID===subjectId&&r.CourseID===program.id);
    if(!subject||(source.Active&&(!active(subject.Active)||!shared.subjects.some(s=>s.SubjectID===subject.SubjectID&&active(s.Active)))))throw problem('Choose an active subject in this Program.');
    const level=levelId?snapshot.ProgramLevels.find(r=>r.LevelID===levelId&&r.ProgramSubjectID===subjectId):null;
    const module=moduleId?snapshot.ProgramModules.find(r=>r.ProgramModuleID===moduleId&&r.ProgramSubjectID===subjectId):null;
    const task=taskId?snapshot.ProgramTasks.find(r=>r.TaskID===taskId&&r.ProgramSubjectID===subjectId):null;
    if(levelId&&(!level||(source.Active&&!active(level.Active))))throw problem('The resource level must belong to its subject.');
    if(moduleId&&(!module||(source.Active&&!active(module.Active))))throw problem('The resource module must belong to its subject.');
    if(taskId&&(!task||(source.Active&&!active(task.Active))))throw problem('The resource task must belong to its subject.');
    if(task&&task.ProgramModuleID!==moduleId)throw problem('The resource task and module must match.');
    if(level&&module&&module.LevelID!==levelId)throw problem('The resource level must match its module.');
    if(module?.LevelID&&!levelId)throw problem('Choose the module’s level for this resource.');
    const fileId=string('DriveFileID','Drive file',160);
    if(!/^[A-Za-z0-9_-]+$/.test(fileId))throw problem('Choose a valid Drive file.');
    const book=type==='EBOOK';
    const optional=(field,label,max)=>source[field]===undefined?'':string(field,label,max,true);
    const author=book?optional('Author','Author',160):'';
    const publisher=book?optional('Publisher','Publisher',160):'';
    const isbn=book?optional('ISBN','ISBN',32):'';
    const publicationYear=book?optional('PublicationYear','Publication year',4):'';
    const coverFileId=book?optional('CoverDriveFileID','Cover image',160):'';
    if(isbn&&(!/^[0-9Xx -]+$/.test(isbn)||!(/^(?:\d{9}[\dXx]|\d{13})$/.test(isbn.replace(/[ -]/g,'')))))throw problem('Enter a 10- or 13-character ISBN using digits, spaces or hyphens.');
    if(publicationYear&&(!/^\d{4}$/.test(publicationYear)||Number(publicationYear)<1000||Number(publicationYear)>2100))throw problem('Enter a four-digit publication year.');
    if(coverFileId&&!/^[A-Za-z0-9_-]+$/.test(coverFileId))throw problem('Choose a valid Drive cover image.');
    const record={ResourceID:id,CourseID:program.id,ProgramSubjectID:subjectId,LevelID:levelId,ProgramModuleID:moduleId,TaskID:taskId,ResourceType:type,
      Name:string('Name','Resource name'),Description:string('Description','Description',1000,true),DriveFileID:fileId,Active:source.Active,
      Author:author,Publisher:publisher,ISBN:isbn,PublicationYear:publicationYear,CoverDriveFileID:coverFileId};
    if(rows.some(r=>r.ResourceID!==id&&r.DriveFileID===fileId&&r.ProgramSubjectID===subjectId&&r.LevelID===levelId&&r.ProgramModuleID===moduleId&&r.ResourceType===type))throw problem('This file is already in this Library location. Edit its existing row.');
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
  if(['classes','subjects','tasks','enrollments'].includes(input.kind))record.CourseID=program.id;
  if(['levels','modules','tasks','classes'].includes(input.kind))record.Name=text('Name','Name');
  if(['levels','modules','tasks'].includes(input.kind)){
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
  if(input.kind==='tasks'){
    record.ProgramModuleID=text('ProgramModuleID','Module',100,true);
    if(record.ProgramModuleID&&!snapshot.ProgramModules.some(r=>r.ProgramModuleID===record.ProgramModuleID&&r.ProgramSubjectID===record.ProgramSubjectID&&(!record.Active||active(r.Active))))throw problem('The task module must belong to its subject. A subject-level task may have no module.');
    if(previous&&(previous.ProgramSubjectID!==record.ProgramSubjectID||previous.ProgramModuleID!==record.ProgramModuleID)&&snapshot.ProgramResources.some(r=>r.TaskID===id))throw problem('Move or archive linked resources before moving this task.');
    if(rows.some(r=>r.TaskID!==id&&r.ProgramSubjectID===record.ProgramSubjectID&&r.ProgramModuleID===record.ProgramModuleID&&clean(r.Name).toLowerCase()===record.Name.toLowerCase()))throw problem('That task already exists here. Edit its existing row.');
  }
  if(input.kind==='classes'){
    record.AcademicYear=text('AcademicYear','Academic year',40,true);
    record.ZoomLink=normalizeZoomLink(Object.hasOwn(source,'ZoomLink')?source.ZoomLink:previous?.ZoomLink);
  }
  if(input.kind==='enrollments'){
    record.ClassID=text('ClassID','Class',100);record.AccountID=text('AccountID','Learner',100);
    if(!snapshot.ProgramClasses.some(r=>r.ClassID===record.ClassID&&r.CourseID===program.id&&(!record.Active||active(r.Active))))throw problem('Choose an active class in this Program.');
    if(!shared.accounts.some(a=>a.AccountID===record.AccountID&&(!record.Active||active(a.Active))))throw problem('Choose an active Academy account.');
    record.StartDate=text('StartDate','Start date',10,true);record.EndDate=text('EndDate','End date',10,true);
    if((record.StartDate&&!validDate(record.StartDate))||(record.EndDate&&!validDate(record.EndDate))||
      (record.StartDate&&record.EndDate&&record.EndDate<record.StartDate))throw problem('Enter valid membership dates; if both are set, the end date must be on or after the start date.');
    if(record.Active&&rows.some(r=>r.EnrollmentID!==id&&active(r.Active)&&r.ClassID===record.ClassID&&r.AccountID===record.AccountID&&
      (r.StartDate||'')<=(record.EndDate||'9999-12-31')&&record.StartDate<=(r.EndDate||'9999-12-31')))throw problem('This learner already has overlapping membership dates in this class.');
  }
  if(input.kind==='teachers'&&record.Active&&!shared.accounts.some(a=>a.AccountID===id&&active(a.Active)))throw problem('Choose an active Academy account.');
  if(input.kind==='teachers'&&record.Active&&!shared.grantedTeachers.some(a=>a.AccountID===id))throw problem('This user needs an active Teacher, Senior or Admin role in this Program before being assigned to teach.');
  if(input.kind!=='tasks'&&record.Name&&rows.some(r=>r[spec.key]!==id&&clean(r.Name).toLowerCase()===record.Name.toLowerCase()&&(!record.ProgramSubjectID||r.ProgramSubjectID===record.ProgramSubjectID)))throw problem('That name already exists here. Edit its existing row.');
  if(input.kind==='levels'&&previous&&previous.ProgramSubjectID!==record.ProgramSubjectID&&(snapshot.ProgramModules.some(r=>r.LevelID===id)||snapshot.ProgramResources.some(r=>r.LevelID===id)))throw problem('A level used by modules or resources cannot move to another subject.');
  if(input.kind==='modules'&&previous&&(previous.ProgramSubjectID!==record.ProgramSubjectID||previous.LevelID!==record.LevelID)&&(snapshot.ProgramResources.some(r=>r.ProgramModuleID===id)||snapshot.ProgramTasks.some(r=>r.ProgramModuleID===id)))throw problem('Move or archive linked tasks and resources before moving this module.');
  if(!record.Active){
    const used=input.kind==='subjects'?snapshot.ProgramModules.some(r=>r.ProgramSubjectID===id&&active(r.Active))||snapshot.ProgramTasks.some(r=>r.ProgramSubjectID===id&&active(r.Active))||snapshot.ProgramResources.some(r=>r.ProgramSubjectID===id&&active(r.Active))
      :input.kind==='levels'?snapshot.ProgramModules.some(r=>r.LevelID===id&&active(r.Active))||snapshot.ProgramResources.some(r=>r.LevelID===id&&active(r.Active))
      :input.kind==='modules'?snapshot.ProgramTasks.some(r=>r.ProgramModuleID===id&&active(r.Active))||snapshot.ProgramResources.some(r=>r.ProgramModuleID===id&&active(r.Active))
      :input.kind==='tasks'?snapshot.ProgramResources.some(r=>r.TaskID===id&&active(r.Active))
      :input.kind==='classes'?snapshot.ProgramEnrollments.some(r=>r.ClassID===id&&active(r.Active)):false;
    if(used)throw problem('Archive or move the active dependent rows first.');
  }
  if(previous)rows[rows.indexOf(previous)]=record;else rows.push(record);
  return {snapshot,record};
}
