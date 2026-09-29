import { managementState, managementView, applyManagementChange, MANAGEMENT_KINDS, managementRowRevision } from './management-model.js';
import { problem } from './model.js';
import { programFailure } from './errors.js';
import { TIMETABLE_SCHEMA, boundedJSON, validDate, normalizeDraft as normalizeDatedDraft } from './timetable-model.js';
import { WEEKLY_SCHEMA, emptyWeeklyDraft, normalizeWeeklyDraft, readWeeklyDraft, validateWeeklyTimetable, publicationRecord, publicationSchedule, programToday } from './weekly-timetable.js';
export function timetableService(repository,program,now=()=>new Date()) {
  function dateContext(draft={}) {
    // A damaged or unset zone must not prevent loading the editor to repair it.
    for(const zone of [program.timezone,draft.timezone,'UTC'].filter(Boolean))try{return {today:programToday(zone,now()),effectiveTimezone:zone};}catch{}
  }
  function state(data) {
    if (!data.prepared) throw problem('Prepare the timetable tables first.',409);
    const rows=data.tables.ProgramTimetableState;
    if (rows.some(row=>row.CourseID!==program.id||![TIMETABLE_SCHEMA,WEEKLY_SCHEMA].includes(row.SchemaVersion)||!Number.isSafeInteger(Number(row.Sequence))||Number(row.Sequence)<1)||new Set(rows.map(row=>Number(row.Sequence))).size!==rows.length) throw problem('Timetable state does not match this Program.',409);
    const row=rows.reduce((latest,item)=>!latest||Number(item.Sequence)>Number(latest.Sequence)?item:latest,null);
    let draft,conversion;
    try { ({draft,conversion}=row?readWeeklyDraft(JSON.parse(row.DraftJSON)):{draft:emptyWeeklyDraft(program.timezone),conversion:null}); } catch { throw problem('The saved timetable draft is invalid. Repair its storage before editing.',409); }
    const publications=data.tables.ProgramTimetablePublications;
    if (publications.some(p=>p.CourseID!==program.id||!Number.isSafeInteger(Number(p.VersionNo))||Number(p.VersionNo)<1)||new Set(publications.map(p=>Number(p.VersionNo))).size!==publications.length) throw problem('Publication history contains invalid Program or version references.',409);
    const current=publications.find(p=>p.PublicationID===row?.CurrentPublicationID);
    if (row?.CurrentPublicationID&&!current) throw problem('The published timetable pointer has no matching history entry.',409);
    const {today,effectiveTimezone}=dateContext(draft);
    const schedule=publicationSchedule(publications.map(row=>publicationRecord(row,program)),today);
    return {row,draft,conversion,today,effectiveTimezone,revision:row?.Revision||'',latestPublicationId:row?.CurrentPublicationID||'',...schedule};
  }
  const metadata=p=>{const {snapshot,occurrences,...rest}=p;return rest;};
  return {
    prepare:()=>repository.prepare(),
    async read(action,input={}) {
      const data=await repository.load();
      if(action==='manage-get'){
        const view=await managementView(data,repository,program);
        if(input.includeOverview===true){
          view.overview={timetable:null,preview:null,error:null};
          if(data.prepared)try{
            const current=state(data);
            view.overview.timetable={draft:current.draft};
            if(current.draft.rules.length)view.overview.preview=validateWeeklyTimetable(current.draft,await repository.catalog(data),program,current.today);
          }catch(error){view.overview.error=programFailure(error,'manage-get','overview');}
        }
        return view;
      }
      if (!data.prepared) return {program,prepared:false,revision:'',draft:emptyWeeklyDraft(program.timezone),catalog:await repository.catalog(data),publications:[],currentPublicationId:'',...dateContext()};
      const current=state(data);
      if (action==='history') return {publications:current.publications,currentPublicationId:current.currentPublicationId};
      if(action==='published'){const schedule=publicationSchedule(current.publications,input.date||current.today);return {publication:schedule.publications.find(p=>p.id===schedule.currentPublicationId)||null};}
      const catalog=await repository.catalog(data);
      if (action==='validate'||action==='preview') return validateWeeklyTimetable(input.draft,catalog,program,input.effectiveFrom||current.today);
      return {program,prepared:true,revision:current.revision,draft:current.draft,conversion:current.conversion,catalog,currentPublicationId:current.currentPublicationId,today:current.today,effectiveTimezone:current.effectiveTimezone,
        publications:current.publications.map(metadata)};
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
        const current=managementState(data,program),shared=await repository.managementReferences(data);
        const spec=MANAGEMENT_KINDS[input.kind];
        const currentRecord=spec?current.snapshot[spec.table].find(r=>r[spec.key]===input.record?.[spec.key])||null:null;
        const rowRevision=await managementRowRevision(currentRecord);
        const changed=spec&&typeof input.baseRowRevision==='string'?input.baseRowRevision!==rowRevision:input.revision!==current.revision;
        if(changed)throw Object.assign(problem(`The saved ${input.kind==='progress'?'class status':input.kind==='modules'?'module':'record'} changed since editing began. Your draft is kept. Review the saved row and your changes.`,409),{code:'ROW_CHANGED',currentRecord,rowRevision});
        // Validate against fresh references below. An unrelated account/catalogue change
        // must not reject this row; inactive/missing selections still fail validation.
        const {snapshot,record}=applyManagementChange(current,input,shared,program);
        const snapshotJSON=JSON.stringify(snapshot);
        if(snapshotJSON.length>40000)throw problem('This Program has reached the current management storage limit. No changes were saved.');
        const revision=crypto.randomUUID(),timestamp=new Date().toISOString(),result={revision,record,...(spec?{rowRevision:await managementRowRevision(record)}:{})};
        if(input.kind==='modules'&&record.LevelID)result.level=snapshot.ProgramLevels.find(r=>r.LevelID===record.LevelID);
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
      const legacySave=action==='save'&&input.draft&&input.draft.format===undefined;
      if(!legacySave&&current.conversion?.required&&input.convertLegacy!==true)throw problem('Review the older dated items and choose Use weekly lessons before saving. The original draft remains saved.',409);
      // Cached editors do not know this field; omission must not erase a saved lesson link.
      const draftInput={...input.draft,rules:Array.isArray(input.draft?.rules)?input.draft.rules.map(row=>row&&({...row,programSubjectId:Object.hasOwn(row,'programSubjectId')?row.programSubjectId:(current.draft.rules.find(r=>r.id===row.id&&r.moduleId===row.moduleId)?.programSubjectId||''),zoomLink:Object.hasOwn(row,'zoomLink')?row.zoomLink:current.draft.rules.find(r=>r.id===row.id)?.zoomLink||''})):input.draft?.rules};
      const draft=legacySave?normalizeDatedDraft(draftInput):normalizeWeeklyDraft(draftInput);
      if(legacySave)for(const row of draft.rules)row.zoomLink=draftInput.rules.find(r=>r.id===row.id)?.zoomLink||'';
      let validation,effectiveFrom;
      if (action==='publish') {
        effectiveFrom=input.effectiveFrom||current.today;
        if(!validDate(effectiveFrom)||effectiveFrom<current.today)throw problem('Choose today or a future date for the new timetable. Published history cannot be backdated.',409);
        validation=validateWeeklyTimetable(draft,await repository.catalog(data),program,effectiveFrom);
        if (!validation.valid) throw problem('Publication blocked: resolve all validation issues and timetable conflicts, then preview again.',409);
      }
      const timestamp=now().toISOString(),revision=crypto.randomUUID(),records=[];
      let publicationId=current.latestPublicationId,version=null;
      if (action==='publish') {
        publicationId=`PUB-${crypto.randomUUID()}`; version=Math.max(0,...current.publications.map(p=>Number(p.version)))+1;
        records.push({table:'ProgramTimetablePublications',record:{PublicationID:publicationId,CourseID:program.id,VersionNo:version,PublishedDate:timestamp,PublishedByAccountID:user.accountid,SnapshotJSON:boundedJSON({...validation.snapshot,effectiveFrom,effectiveTimezone:current.effectiveTimezone}),OperationID:input.operationId}});
      }
      records.push({table:'ProgramTimetableState',record:{CourseID:program.id,SchemaVersion:legacySave?TIMETABLE_SCHEMA:WEEKLY_SCHEMA,Revision:revision,Sequence:Number(current.row?.Sequence||0)+1,DraftJSON:boundedJSON(draft),CurrentPublicationID:publicationId,ModifiedDate:timestamp,ModifiedByAccountID:user.accountid}});
      const added=version?{id:publicationId,version,date:timestamp,by:user.accountid,effectiveFrom,pattern:'WEEKLY',snapshot:{...validation.snapshot,effectiveFrom}}:null;
      const schedule=publicationSchedule([...current.publications,...(added?[added]:[])],current.today);
      const result={revision,...(legacySave?{upgradeRequired:true}:{}),currentPublicationId:schedule.currentPublicationId,publicationId:version?publicationId:null,version,effectiveFrom:effectiveFrom||null,publications:schedule.publications.map(metadata)};
      records.push({table:'ProgramTimetableOperations',record:{OperationID:input.operationId,PayloadHash:hash,ResultJSON:boundedJSON(result),DateStamp:timestamp,AccountID:user.accountid,Action:action}});
      return {plan:repository.plan(data,records),result};
    },
    apply:plan=>repository.apply(plan)
  };
}
