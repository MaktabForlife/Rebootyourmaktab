import { payloadHash } from '../../programs/timetable-model.js';
import { rehearsalError } from './repository.js';

export const managementError=(message,status=400,code='INVALID_MANAGEMENT_REQUEST')=>rehearsalError(message,status,code);
export const rowChanged=(record,revision,entryKey)=>Object.assign(managementError('This entry changed elsewhere. Your draft is kept; review the saved entry.',409,'ROW_CHANGED'),{currentRecord:record,rowRevision:revision,...(entryKey?{entryKey}:{})});
export const same=(a,b)=>String(a||'').toUpperCase()===String(b||'').toUpperCase();
export const liveRoles=(data,account,scope)=>[...new Set([
  ...data.roles.filter(r=>same(r.account_id,account)&&same(r.activity_key,scope)&&r.active&&r.review_state==='CONFIRMED').map(r=>r.role),
  ...data.reviews.filter(r=>same(r.account_id,account)&&same(r.activity_key,scope)&&r.status==='REQUIRED'&&data.evidence.some(e=>same(e.account_id,account)&&same(e.activity_key,scope)&&e.source_role===r.source_value&&e.source_effective)).flatMap(r=>data.mappings.filter(m=>m.source_role===r.source_value).map(m=>m.target_role))
])];
export const pendingRoles=(data,account,scope)=>data.reviews.filter(r=>same(r.account_id,account)&&same(r.activity_key,scope)&&r.status==='REQUIRED'&&!data.mappings.some(m=>m.source_role===r.source_value));
export const profileDTO=(data,row)=>row?{accountId:row.account_id,displayName:row.display_name,active:Boolean(row.active),academyAdmin:data.admins.some(g=>same(g.account_id,row.account_id)&&g.active&&g.review_state==='CONFIRMED')}:null;

// A consistent read transaction for planning, followed by a guarded write
// transaction. No request state, permissions or database handles are global.
export function managementStore(repository,auth) {
  const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values);
  const tables={accounts:'accounts',admins:'global_role_assignments',activities:'activities',roles:'role_assignments',reviews:'role_import_reviews',policies:'activity_policy_imports',programs:'program_settings',mappings:'role_mapping_decisions',evidence:'legacy_access_evidence'};
  return {
    db,p,
    async load(extra={}) {
      const names=Object.keys(tables),extras=Object.keys(extra).filter(name=>!names.includes(name));
      let result;
      try {result=await db.batch([
        p('SELECT version FROM academy_write_state WHERE singleton=1'),
        ...names.map(name=>extra[name]||p(`SELECT * FROM ${tables[name]}`)),
        ...extras.map(name=>extra[name])
      ]);}catch(error){if(/no such table: academy_write_state/.test(error.message))throw managementError('Management storage needs its database upgrade.',503,'MANAGEMENT_SCHEMA_REQUIRED');throw error;}
      if(!result[0].results.length)throw managementError('Management storage is unavailable.',503,'MANAGEMENT_SCHEMA_REQUIRED');
      return {version:result[0].results[0].version,...Object.fromEntries([...names,...extras].map((name,i)=>[name,result[i+1].results]))};
    },
    async receipt(dataset,scope,operationId,hash) {
      const row=await p('SELECT payload_sha256,result_json,actor_account_id FROM operation_receipts WHERE dataset_key=? AND scope_key=? AND operation_id=?',dataset,scope,operationId).first();
      if(!row)return null;
      if(row.payload_sha256!==hash||!same(row.actor_account_id,auth.user.accountid))throw managementError('This retry identifier belongs to a different change.',409,'OPERATION_ID_REUSED');
      return {...JSON.parse(row.result_json),replayed:true};
    },
    async change(dataset,scope,action,input,plan) {
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId||''))throw managementError('This change needs its retry identifier.');
      const hash=await payloadHash({action,input});
      const scopedRoles=dataset==='PROGRAM_ATTENDANCE'?['PROGRAM_ADMIN','TEACHER']:
        ['PROGRAM_MANAGEMENT','PROGRAM_TIMETABLE','PROGRAM_LIBRARY','COURSE_MANAGEMENT','COURSE_SUBSCRIPTIONS'].includes(dataset)?['PROGRAM_ADMIN']:[];
      for(let attempt=0;attempt<3;attempt++) {
        const receipt=await this.receipt(dataset,scope,input.operationId,hash);if(receipt)return receipt;
        const {data,statements,result,fields,authorityScopes=[scope]}=await plan();
        const now=new Date().toISOString(),actor=auth.user.accountid;
        const checkedScopes=auth.state.account.global_admin?[scope]:[...new Set(authorityScopes)];
        if(!checkedScopes.length)throw managementError('This action requires an authorised administrator.',403,'FORBIDDEN');
        const json=JSON.stringify(result);if(json.length>100000)throw managementError('Save fewer changed entries together.');
        // Check authority again INSIDE the same transaction as the writes.
        // Account revision checks also cover the earlier rehearsal account API.
        const accounts=JSON.stringify(data.accounts.map(a=>({id:a.account_id,revision:a.revision})));
        const guards=checkedScopes.map(()=>crypto.randomUUID());
        const checks=checkedScopes.map((checkedScope,index)=>p(`INSERT INTO academy_write_guards(guard_id,accepted)
          VALUES(?,(SELECT version=? FROM academy_write_state WHERE singleton=1)
          AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN accounts a ON a.account_id=json_extract(j.value,'$.id')
            WHERE a.account_id IS NULL OR a.revision<>json_extract(j.value,'$.revision'))
          AND EXISTS(SELECT 1 FROM accounts a JOIN account_credentials c USING(account_id) JOIN account_sessions s USING(account_id)
            WHERE a.account_id=? AND a.active=1
              AND s.session_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.credential_epoch=c.credential_epoch
              AND c.credential_epoch=? AND c.pin_setup=1 AND length(trim(c.pin_hash))>0
              AND ((?=1 AND EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.active=1 AND g.role='GLOBAL_ADMIN' AND g.review_state='CONFIRMED'))
                OR (?=0 AND EXISTS(SELECT 1 FROM activities x WHERE x.activity_key=? COLLATE NOCASE AND x.active=1 AND x.lifecycle='ACTIVE') AND (EXISTS(SELECT 1 FROM effective_activity_roles r WHERE r.account_id=a.account_id AND r.activity_key=? COLLATE NOCASE AND r.role IN (SELECT value FROM json_each(?)))
                  OR EXISTS(SELECT 1 FROM legacy_access_evidence e JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role
                    JOIN role_mapping_decisions m ON m.source_role=e.source_role WHERE e.account_id=a.account_id AND e.activity_key=? COLLATE NOCASE AND e.source_effective=1 AND v.status='REQUIRED' AND m.target_role IN (SELECT value FROM json_each(?))))))))`,guards[index],data.version,accounts,actor,auth.sid,now,auth.state.account.credential_epoch,Number(auth.state.account.global_admin),Number(auth.state.account.global_admin),checkedScope,checkedScope,JSON.stringify(scopedRoles),checkedScope,JSON.stringify(scopedRoles)));
        try {
          await db.batch([...checks,...statements,
            p(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json)
              VALUES(?,?,?,?,?,?,?,?,?)`,crypto.randomUUID(),now,actor,auth.state.account.global_admin?'GLOBAL_ADMIN':checkedScopes.some(s=>liveRoles(data,actor,s).includes('PROGRAM_ADMIN'))?'PROGRAM_ADMIN':'TEACHER',scope,action,dataset,input.operationId,JSON.stringify(fields||[])),
            p('INSERT INTO operation_receipts(dataset_key,scope_key,operation_id,payload_sha256,result_json,actor_account_id,completed_at) VALUES(?,?,?,?,?,?,?)',dataset,scope,input.operationId,hash,json,actor,now),
            p('UPDATE academy_write_state SET version=version+1 WHERE singleton=1'),
            ...guards.map(guard=>p('DELETE FROM academy_write_guards WHERE guard_id=?',guard))
          ]);
          return result;
        }catch(error){
          // A lost acknowledgement is recovered from the same committed receipt.
          const saved=await this.receipt(dataset,scope,input.operationId,hash);if(saved)return saved;
          const current=await repository.session(auth.sid,actor,auth.state.account.credential_epoch);
          const contextCurrent=current?.contexts.some(c=>c.scope===auth.context.scope&&same(c.courseId,auth.context.courseId)&&c.role===auth.context.role);
          const authorityCurrent=auth.state.account.global_admin?current?.account.global_admin:checkedScopes.every(s=>current?.roles.some(r=>same(r.activity_key,s)&&scopedRoles.includes(r.role)));
          if(!contextCurrent||!authorityCurrent)throw managementError('Your authorised session has ended.',401,'SESSION_ENDED');
          if(!/academy_management_stale/.test(error.message))throw error;
          if(attempt===2)throw managementError('Management records are busy. Your draft is kept; retry the same save.',409,'MANAGEMENT_BUSY');
        }
      }
    }
  };
}
