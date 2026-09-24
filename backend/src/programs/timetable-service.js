import { managementState, managementView, applyManagementChange } from './management-model.js';
import { problem } from './model.js';
import { TIMETABLE_SCHEMA, payloadHash, emptyDraft, normalizeDraft, validateTimetable, boundedJSON, publishedOccurrences } from './timetable-model.js';
export function timetableService(repository,program) {
  function state(data) {
    if (!data.prepared) throw problem('Prepare the timetable tables first.',409);
    const rows=data.tables.ProgramTimetableState;
    if (rows.some(row=>row.CourseID!==program.id||row.SchemaVersion!==TIMETABLE_SCHEMA||!Number.isSafeInteger(Number(row.Sequence))||Number(row.Sequence)<1)||new Set(rows.map(row=>Number(row.Sequence))).size!==rows.length) throw problem('Timetable state does not match this Program.',409);
    const row=rows.reduce((latest,item)=>!latest||Number(item.Sequence)>Number(latest.Sequence)?item:latest,null);
    let draft;
    try { draft=row?normalizeDraft(JSON.parse(row.DraftJSON)):emptyDraft(program.timezone); } catch { throw problem('The saved timetable draft is invalid. Repair its storage before editing.',409); }
    const publications=data.tables.ProgramTimetablePublications;
    if (publications.some(p=>p.CourseID!==program.id||!Number.isSafeInteger(Number(p.VersionNo))||Number(p.VersionNo)<1)||new Set(publications.map(p=>Number(p.VersionNo))).size!==publications.length) throw problem('Publication history contains invalid Program or version references.',409);
    const current=publications.find(p=>p.PublicationID===row?.CurrentPublicationID);
    if (row?.CurrentPublicationID&&!current) throw problem('The published timetable pointer has no matching history entry.',409);
    return {row,draft,revision:row?.Revision||'',currentPublicationId:row?.CurrentPublicationID||'',publications};
  }
  function publication(row) {
    if (!row) return null;
    let snapshot; try {snapshot=JSON.parse(row.SnapshotJSON);} catch {throw problem('A published version is damaged; restore its saved snapshot.',409);}
    if (snapshot.programId!==program.id||snapshot.schema!==TIMETABLE_SCHEMA) throw problem('Published snapshot does not match this Program.',409);
    return {id:row.PublicationID,version:Number(row.VersionNo),date:row.PublishedDate,by:row.PublishedByAccountID,snapshot,occurrences:publishedOccurrences(snapshot)};
  }
  return {
    prepare:()=>repository.prepare(),
    async read(action,input={}) {
      const data=await repository.load();
      if(action==='manage-get')return managementView(data,repository,program);
      if (!data.prepared) return {program,prepared:false,revision:'',draft:emptyDraft(program.timezone),catalog:await repository.catalog(data),publications:[],currentPublicationId:''};
      const current=state(data);
      if (action==='history') return {publications:current.publications.map(publication),currentPublicationId:current.currentPublicationId};
      if (action==='published') return {publication:publication(current.publications.find(p=>p.PublicationID===current.currentPublicationId))};
      const catalog=await repository.catalog(data);
      if (action==='validate'||action==='preview') return validateTimetable(input.draft,catalog,program);
      return {program,prepared:true,revision:current.revision,draft:current.draft,catalog,currentPublicationId:current.currentPublicationId,
        publications:current.publications.map(p=>({id:p.PublicationID,version:Number(p.VersionNo),date:p.PublishedDate,by:p.PublishedByAccountID}))};
    },
    async receipt(operationId,hash) {
      const data=await repository.load();
      const row=(data.tables.ProgramTimetableOperations||[]).find(row=>row.OperationID===operationId);
      if (!row) return null;
      if (row.PayloadHash!==hash) throw problem('This retry identifier was already used for different edits. Reload before continuing.',409);
      return {...JSON.parse(row.ResultJSON),replayed:true};
    },
    async plan(action,input,user,hash) {
      if(action==='manage-save') {
        if(program.status!=='DRAFT')throw problem('Archived Programs cannot change their records.',409);
        const data=await repository.load();
        if(!data.prepared)throw problem('Prepare the management tables first.',409);
        const current=managementState(data,program),shared=await repository.managementReferences();
        if(input.revision!==current.revision||input.referenceRevision!==await payloadHash(shared))throw problem('Program data or Academy references changed. Your edits are kept; reload before saving.',409);
        const {snapshot,record}=applyManagementChange(current,input,shared,program);
        const snapshotJSON=JSON.stringify(snapshot);
        if(snapshotJSON.length>40000)throw problem('This Program has reached the current management storage limit. No changes were saved.');
        const revision=crypto.randomUUID(),timestamp=new Date().toISOString(),result={revision,record};
        const records=[
          {table:'ProgramManagementState',record:{Revision:revision,CourseID:program.id,Sequence:current.sequence+1,SnapshotJSON:snapshotJSON,ModifiedDate:timestamp,ModifiedByAccountID:user.accountid}},
          {table:'ProgramTimetableOperations',record:{OperationID:input.operationId,PayloadHash:hash,ResultJSON:boundedJSON(result),DateStamp:timestamp,AccountID:user.accountid,Action:`manage-${input.kind}`}}
        ];
        return {plan:repository.plan(data,records),result};
      }
      if (!['save','publish'].includes(action)) throw problem('Unknown timetable change.');
      if (program.status!=='DRAFT') throw problem('Archived Programs cannot change their timetable.',409);
      const data=await repository.load(), current=state(data);
      if (input.revision!==current.revision) throw problem('Another administrator changed this timetable. Your edits are kept; load the latest draft before reapplying them.',409);
      const draft=normalizeDraft(input.draft);
      let validation;
      if (action==='publish') {
        validation=validateTimetable(draft,await repository.catalog(data),program);
        if (!validation.valid) throw problem('Publication blocked: resolve all validation issues and timetable conflicts, then preview again.',409);
      }
      const timestamp=new Date().toISOString(),revision=crypto.randomUUID(),records=[];
      let publicationId=current.currentPublicationId,version=null;
      if (action==='publish') {
        publicationId=`PUB-${crypto.randomUUID()}`; version=Math.max(0,...current.publications.map(p=>Number(p.VersionNo)))+1;
        records.push({table:'ProgramTimetablePublications',record:{PublicationID:publicationId,CourseID:program.id,VersionNo:version,PublishedDate:timestamp,PublishedByAccountID:user.accountid,SnapshotJSON:boundedJSON(validation.snapshot),OperationID:input.operationId}});
      }
      records.push({table:'ProgramTimetableState',record:{CourseID:program.id,SchemaVersion:TIMETABLE_SCHEMA,Revision:revision,Sequence:Number(current.row?.Sequence||0)+1,DraftJSON:boundedJSON(draft),CurrentPublicationID:publicationId,ModifiedDate:timestamp,ModifiedByAccountID:user.accountid}});
      const result={revision,currentPublicationId:publicationId,version};
      records.push({table:'ProgramTimetableOperations',record:{OperationID:input.operationId,PayloadHash:hash,ResultJSON:boundedJSON(result),DateStamp:timestamp,AccountID:user.accountid,Action:action}});
      return {plan:repository.plan(data,records),result};
    },
    apply:plan=>repository.apply(plan)
  };
}
