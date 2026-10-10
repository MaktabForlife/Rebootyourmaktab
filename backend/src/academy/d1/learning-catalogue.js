import {d1Programs} from './programs.js';
import {subjectDTO} from './subjects.js';
import {managementStore,managementError,rowChanged,same} from './management-store.js';
import {payloadHash} from '../../programs/timetable-model.js';
import {catalogueNameKey,resolveModuleCategory} from './module-catalogue.js';

const assertAdmin=auth=>{if(!auth.state.account.global_admin)throw managementError('Subjects and Modules require a Global Admin.',403,'FORBIDDEN');};
const moduleRevision=row=>payloadHash(row?{id:row.module_id,subjectKey:row.subject_key,name:row.name,active:Boolean(row.active),revision:row.revision}:null);
async function load(repository,auth) {
  const all=await d1Programs(repository,auth).loadAll({editor:repository.db.prepare('SELECT activity_key,details_json FROM course_management_drafts')});
  return {...all,modulesReady:Array.isArray(all.data.academyModules)};
}
function usages(data) {
  const byModule=new Map(),bySubject=new Map();
  const add=(map,key,activity)=>{if(!key)return;if(!map.has(key))map.set(key,new Set());map.get(key).add(activity);};
  for(const use of data.moduleUsage||[]) {
    add(byModule,use.academy_module_id,use.activity_key);
    add(bySubject,(data.academyModules||[]).find(m=>same(m.module_id,use.academy_module_id))?.subject_key,use.activity_key);
  }
  for(const s of data.ProgramSubjects)add(bySubject,s.subject_key,s.activity_key);
  for(const c of data.editor) {
    const key=resolveModuleCategory(data,JSON.parse(c.details_json).categoryKey||'');
    if(key.startsWith('SUBJECT:'))add(bySubject,key.slice(8),c.activity_key);
    if(key.startsWith('MODULE:ACADEMY:')){const id=key.slice(15);add(byModule,id,c.activity_key);add(bySubject,(data.academyModules||[]).find(m=>same(m.module_id,id))?.subject_key,c.activity_key);}
  }
  const list=(map,key)=>[...(map.get(key)||[])].map(k=>data.activities.find(a=>same(a.activity_key,k))).filter(Boolean).map(a=>({id:a.activity_id,name:a.name,kind:a.kind})).sort((a,b)=>a.name.localeCompare(b.name));
  return {module:id=>list(byModule,id),subject:key=>list(bySubject,key)};
}
async function moduleDTO(row,data,usage) {
  const subject=data.subjects.find(s=>same(s.subject_key,row.subject_key));
  return {id:row.module_id,name:row.name,subjectId:subject?.subject_id||'',subjectName:subject?.name||'',active:Boolean(row.active),
    revision:await moduleRevision(row),usedIn:usage.module(row.module_id)};
}
export async function d1LearningCatalogue(repository,auth) {
  assertAdmin(auth);const {data,modulesReady}=await load(repository,auth),usage=usages(data);
  const subjects=await Promise.all(data.subjects.filter(s=>s.source_namespace==='ACADEMY').map(async row=>({...await subjectDTO(row),usedIn:usage.subject(row.subject_key)})));
  return {subjects,modules:await Promise.all((data.academyModules||[]).map(m=>moduleDTO(m,data,usage))),modulesReady,emptyRevision:await moduleRevision(null),viewerAccountId:auth.user.accountid,store:'D1'};
}
export async function saveLearningModule(repository,auth,input) {
  assertAdmin(auth);const store=managementStore(repository,auth),p=store.p;
  return store.change('ACADEMY_MODULES','ACADEMY','save',input,async()=>{
    const all=await load(repository,auth),{data}=all;
    if(!all.modulesReady)throw managementError('The shared Module catalogue needs its database upgrade.',503,'MODULE_CATALOGUE_SCHEMA_REQUIRED');
    const current=input.id?(data.academyModules||[]).find(m=>same(m.module_id,input.id)):null;
    if(input.id&&!current)throw managementError('Choose an existing Academy Module.',404);
    if(input.baseRevision!==await moduleRevision(current))throw rowChanged(current?await moduleDTO(current,data,usages(data)):null,await moduleRevision(current));
    const name=String(input.name||'').trim(),subject=data.subjects.find(s=>s.source_namespace==='ACADEMY'&&same(s.subject_id,input.subjectId)&&s.active);
    if(typeof input.name!=='string'||!name||name.length>160)throw managementError('Enter a Module name of up to 160 characters.');
    if(!subject)throw managementError('Choose an active Academy Subject for this Module.');
    if(typeof input.active!=='boolean')throw managementError('Choose Active or Archived.');
    if(data.academyModules.some(m=>!same(m.module_id,current?.module_id)&&same(m.subject_key,subject.subject_key)&&catalogueNameKey(m.name)===catalogueNameKey(name)))throw managementError('This Subject already has a Module with that name.',409);
    const used=data.moduleUsage.filter(u=>same(u.academy_module_id,current?.module_id));
    if(current&&!same(current.subject_key,subject.subject_key)&&used.some(u=>u.activity_key.startsWith('PROGRAM:')))throw managementError('This Module is used in a Program. Keep its Subject or update its Program usage before moving it.',409);
    const id=current?.module_id||'AM-'+crypto.randomUUID(),record={module_id:id,subject_key:subject.subject_key,name,name_key:catalogueNameKey(name),active:Number(input.active),revision:(current?.revision||0)+1};
    const statements=[current?p('UPDATE academy_module_catalogue SET subject_key=?,name=?,name_key=?,active=?,revision=revision+1 WHERE module_id=?',record.subject_key,name,record.name_key,record.active,id):p('INSERT INTO academy_module_catalogue(module_id,subject_key,name,name_key,active,revision) VALUES(?,?,?,?,?,1)',id,record.subject_key,name,record.name_key,record.active)];
    if(current&&current.name!==name) {
      statements.push(p('UPDATE modules SET name=? WHERE EXISTS(SELECT 1 FROM academy_module_usage u WHERE u.activity_key=modules.activity_key AND u.module_id=modules.module_id AND u.academy_module_id=?)',name,id));
      for(const loaded of all.programs.filter(l=>used.some(u=>same(u.activity_key,l.a.activity_key)))) {
        const snapshot=structuredClone(loaded.current.snapshot);
        for(const row of snapshot.ProgramModules)if(used.some(u=>same(u.activity_key,loaded.a.activity_key)&&same(u.module_id,row.ProgramModuleID)))row.Name=name;
        statements.push(p(`INSERT INTO management_revisions(activity_key,source_revision,source_sequence,source_snapshot_sha256,modified_at,modified_by_source_id) VALUES(?,?,?,?,?,?) ON CONFLICT(activity_key) DO UPDATE SET source_revision=excluded.source_revision,source_sequence=excluded.source_sequence,source_snapshot_sha256=excluded.source_snapshot_sha256,modified_at=excluded.modified_at,modified_by_source_id=excluded.modified_by_source_id`,loaded.a.activity_key,crypto.randomUUID(),loaded.current.sequence+1,await payloadHash(snapshot),new Date().toISOString(),auth.user.accountid));
      }
    }
    return {data,statements,result:{module:{id,name,subjectId:subject.subject_id,subjectName:subject.name,active:input.active,revision:await moduleRevision(record)},store:'D1'},fields:['ModuleName','Subject','Active']};
  });
}
