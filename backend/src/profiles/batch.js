import { planAcademyChange } from './academy-access.js';
import { problem } from '../programs/model.js';

export const editKey = edit => [edit.mode,edit.accountId||'',edit.scopeType||'',edit.scopeId||''].join(':');
// Validate against a private working copy before planning one atomic Sheets batch.
// Profile changes precede role changes, so reactivation and role assignment can be saved together.
export async function planProfileBatch(data,input,user){
  if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>80)throw problem('Save between 1 and 80 changed entries together.');
  if(input.entries.some(e=>!e||!['profile','matrix-roles'].includes(e.mode)))throw problem('Save Free/Paid column settings separately from user rows.');
  if(new Set(input.entries.map(editKey)).size!==input.entries.length)throw problem('Each changed profile or role cell must occur once.');
  const working=structuredClone(data),changes=[],results=[],audits=[];
  const entries=input.entries.slice().sort((a,b)=>(a.mode==='profile'?0:1)-(b.mode==='profile'?0:1));
  for(const entry of entries){
    let planned;
    try{planned=await planAcademyChange(working,entry,user);}
    catch(error){error.entryKey=editKey(entry);throw error;}
    for(const change of planned.changes){
      const rows=working.tables[change.table],identity=data.headers[change.table]?.[0]||'AccountID';
      const existing=rows.find(r=>r[identity]===change.record[identity]);
      if(existing){for(const field of change.fields||Object.keys(change.record))existing[field]=change.record[field];}
      else rows.push(structuredClone(change.record));
      changes.push(change);
    }
    results.push({entryKey:editKey(entry),...planned.result});audits.push(planned.audit);
  }
  // Merge writes to the same physical record, especially several role cells in one row.
  const merged=new Map();
  for(const change of changes){
    const identity=data.headers[change.table]?.[0]||'AccountID',id=`${change.table}:${change.record[identity]}`,prior=merged.get(id);
    if(!prior){merged.set(id,structuredClone(change));continue;}
    for(const field of change.fields||Object.keys(change.record))prior.record[field]=change.record[field];
    prior.fields=prior.fields&&change.fields?[...new Set([...prior.fields,...change.fields])]:undefined;
  }
  return {changes:[...merged.values()],result:{results},audit:{Action:'BATCH_USER_PROFILES',RecordType:'USER_PROFILES',RecordID:input.operationId,ChangedFields:JSON.stringify(audits)}};
}
