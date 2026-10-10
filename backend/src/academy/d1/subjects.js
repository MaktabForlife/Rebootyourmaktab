import {subjectName,subjectKey,subjectRevision} from '../../programs/academy-subjects.js';
import {managementStore,managementError,rowChanged,same} from './management-store.js';

export async function subjectDTO(row) {
  const result={SubjectID:row.subject_id,SubjectName:row.name,Active:Boolean(row.active),Legacy:row.source_namespace!=='ACADEMY'};
  return {...result,...(!result.Legacy?{Revision:await subjectRevision(result)}:{})};
}
export async function subjectView(view,globalAdmin) {
  return {...view,sharedSubjectsEditable:Boolean(globalAdmin),sharedSubjectImportAvailable:false,
    sharedSubjects:await Promise.all((view.sharedSubjects||[]).map(async r=>({...r,...(!r.Legacy?{Revision:await subjectRevision(r)}:{})})))};
}
export function d1Subjects(repository,auth) {
  const store=managementStore(repository,auth),p=store.p;
  const load=()=>store.load({subjects:p("SELECT * FROM subject_catalog WHERE source_namespace='ACADEMY' ORDER BY subject_key")});
  return {async run(action,input) {
    if(!auth.state.account.global_admin)throw managementError('Shared Academy subjects require a Global Admin. Choose an existing subject for this Program.',403,'FORBIDDEN');
    if(action==='get')return {subjects:await Promise.all((await load()).subjects.map(subjectDTO)),store:'D1'};
    if(action==='recover')return {recovered:false};
    if(action!=='save'||!['create','rename'].includes(input.mode))throw managementError('Legacy subject imports are excluded from this migration.',501,'OPERATION_NOT_MIGRATED');
    return store.change('ACADEMY_SUBJECTS','ACADEMY',action,input,async()=>{
      const data=await load(),name=subjectName(input.subjectName);
      const existing=input.mode==='rename'?data.subjects.find(s=>same(s.subject_id,input.subjectId)):data.subjects.find(s=>subjectKey(s.name)===subjectKey(name));
      if(input.mode==='rename'){
        if(!existing)throw managementError('Choose an existing Academy subject.',404);
        const current=await subjectDTO(existing);
        if(input.baseRevision!==current.Revision)throw rowChanged(current,current.Revision);
        if(data.subjects.some(s=>!same(s.subject_id,existing.subject_id)&&subjectKey(s.name)===subjectKey(name)))throw managementError('Another Academy subject already uses this name.',409);
      }
      if(existing&&!existing.active)throw managementError('This Academy subject is archived. Choose an active subject.',409);
      const id=existing?.subject_id||'AS-'+crypto.randomUUID(),updated={subject_id:id,name:input.mode==='create'&&existing?existing.name:name,active:1,source_namespace:'ACADEMY'};
      const statements=input.mode==='create'&&existing?[]:[existing?
        p("UPDATE subject_catalog SET name=? WHERE subject_key=?",name,existing.subject_key):
        p("INSERT INTO subject_catalog(subject_key,source_namespace,subject_id,name,active) VALUES(?,'ACADEMY',?,?,1)",'ACADEMY:'+id,id,name)];
      return {data,statements,result:{subject:await subjectDTO(updated),store:'D1'},fields:input.mode==='rename'?['SubjectName']:['SubjectID','SubjectName']};
    });
  }};
}
