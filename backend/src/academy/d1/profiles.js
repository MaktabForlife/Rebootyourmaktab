import { payloadHash } from '../../programs/timetable-model.js';
import { planProfileChange } from '../../profiles/model.js';
import { managementStore,managementError,rowChanged,same,liveRoles,pendingRoles,profileDTO } from './management-store.js';

const editableRoles=['STUDENT','TEACHER','PROGRAM_ADMIN'];
const scopeOf=a=>({type:a.kind==='PROGRAM'?'PROGRAM':'SUBJECT',id:a.activity_id});
function assignment(data,account,a) {
  const scope=scopeOf(a),pending=pendingRoles(data,account.account_id,a.activity_key).map(r=>r.source_value).sort();
  return {accountId:account.account_id,scopeType:scope.type,scopeId:scope.id,
    roles:editableRoles.filter(r=>liveRoles(data,account.account_id,a.activity_key).includes(r)),
    reviewStatus:pending.length?'REQUIRED':'CONFIRMED',pendingRoles:pending};
}
async function assignmentDTO(data,account,a) {
  const result=assignment(data,account,a);
  return {...result,revision:await payloadHash(result),accessAllowed:Boolean(account.active&&a.active&&(result.roles.length||data.policies.some(p=>same(p.activity_key,a.activity_key)&&p.source_access_model==='FREE')))};
}
async function scopeDTO(data,a) {
  const policy=data.policies.find(p=>same(p.activity_key,a.activity_key));
  const result={...scopeOf(a),name:a.name,active:Boolean(a.active&&a.lifecycle==='ACTIVE'),prepared:true,
    accessModel:policy?.source_access_model||'UNKNOWN',reviewStatus:'REQUIRED',stage:'SETUP',policyEditable:false,rolesEditable:a.kind==='PROGRAM'};
  return {...result,revision:await payloadHash(result)};
}

export function d1Profiles(repository,auth) {
  const store=managementStore(repository,auth),p=store.p;
  async function directory(data) {
    const activities=data.activities.filter(a=>['PROGRAM','COURSE'].includes(a.kind));
    return {accounts:await Promise.all(data.accounts.map(async a=>({...profileDTO(data,a),revision:await payloadHash(profileDTO(data,a)),assignments:await Promise.all(activities.map(activity=>assignmentDTO(data,a,activity)))}))),
      scopes:await Promise.all(activities.map(a=>scopeDTO(data,a))),roles:editableRoles,prepared:true,needsSync:false,
      stage:'SETUP',reviewCount:data.reviews.filter(r=>r.status==='REQUIRED'&&!data.mappings.some(m=>m.source_role===r.source_value)).length,policyEditable:false,store:'D1',emptyRevision:await payloadHash(null)};
  }
  async function profile(data,input,statements) {
    const source=data.accounts.map(a=>({AccountID:a.account_id,DisplayName:a.display_name,UniqueID:a.login_link_id,Active:Boolean(a.active),PlatformRole:profileDTO(data,a).academyAdmin?'GLOBAL_ADMIN':''}));
    const planned=await planProfileChange({tables:{UserAccounts:source}},input,auth.user);
    const record=planned.changes.find(c=>c.table==='UserAccounts').record,now=new Date().toISOString();
    if(input.creating) {
      statements.push(p('INSERT INTO accounts(account_id,display_name,login_link_id,active,created_at,updated_at,created_by_source_id,modified_by_source_id,revision) VALUES(?,?,?,?,?,?,?,?,1)',record.AccountID,record.DisplayName,record.UniqueID,Number(record.Active),now,now,auth.user.accountid,auth.user.accountid),
        p('INSERT INTO account_credentials(account_id,pin_setup,credential_epoch) VALUES(?,0,1)',record.AccountID));
      data.accounts.push({account_id:record.AccountID,display_name:record.DisplayName,login_link_id:record.UniqueID,active:Number(record.Active),revision:1});
      planned.result.profile.assignments=await Promise.all(data.activities.filter(a=>['PROGRAM','COURSE'].includes(a.kind)).map(a=>assignmentDTO(data,data.accounts.at(-1),a)));
    } else {
      const account=data.accounts.find(a=>same(a.account_id,record.AccountID));
      statements.push(p('UPDATE accounts SET display_name=?,active=?,revision=revision+1,updated_at=?,modified_by_source_id=? WHERE account_id=?',record.DisplayName,Number(record.Active),now,auth.user.accountid,account.account_id));
      if(!record.Active)statements.push(p('UPDATE account_sessions SET revoked_at=? WHERE account_id=? AND revoked_at IS NULL',now,account.account_id));
      Object.assign(account,{display_name:record.DisplayName,active:Number(record.Active),revision:account.revision+1});
    }
    return planned.result;
  }
  async function roles(data,input,statements) {
    if(input.scopeType!=='PROGRAM')throw managementError('Global Course access changes await the access-policy review.',501,'ACCESS_POLICY_REVIEW_REQUIRED');
    const a=data.activities.find(a=>a.kind==='PROGRAM'&&same(a.activity_id,input.scopeId));
    const account=data.accounts.find(a=>same(a.account_id,input.accountId));
    if(!a||!account)throw managementError('Choose an existing Program and account.',404);
    const current=await assignmentDTO(data,account,a),scope=await scopeDTO(data,a);
    if(input.baseRevision!==current.revision)throw rowChanged(current,current.revision);
    if(input.scopeRevision!==scope.revision)throw rowChanged({...current,scopeRevision:scope.revision,accessModel:scope.accessModel},current.revision);
    if(!Array.isArray(input.roles)||input.roles.some(r=>!editableRoles.includes(r))||new Set(input.roles).size!==input.roles.length)
      throw managementError('Choose Student, Teacher or Program Admin. Global Admin is a separate Academy-wide authority.',400,'INVALID_ROLE');
    const selected=editableRoles.filter(r=>input.roles.includes(r));
    if(selected.some(r=>!current.roles.includes(r))&&(!account.active||!a.active||a.lifecycle!=='ACTIVE'))throw managementError('Reactivate the account and Program before adding roles.');
    const now=new Date().toISOString();
    statements.push(p("UPDATE role_assignments SET active=0,revision=revision+1 WHERE account_id=? AND activity_key=? AND role IN ('STUDENT','TEACHER','PROGRAM_ADMIN')",account.account_id,a.activity_key));
    for(const role of selected)statements.push(p('INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state,granted_at,granted_by_account_id,revision) VALUES(?,?,?,?,1,?,?,?,1)',crypto.randomUUID(),account.account_id,a.activity_key,role,'CONFIRMED',now,auth.user.accountid));
    for(const row of data.roles.filter(r=>same(r.account_id,account.account_id)&&same(r.activity_key,a.activity_key)&&editableRoles.includes(r.role)))row.active=0;
    data.roles.push(...selected.map(role=>({account_id:account.account_id,activity_key:a.activity_key,role,active:1,review_state:'CONFIRMED'})));
    statements.push(p("UPDATE role_import_reviews SET proposed_role=(SELECT target_role FROM role_mapping_decisions WHERE source_role=role_import_reviews.source_value),status='CONFIRMED',reviewed_by_account_id=?,reviewed_at=? WHERE account_id=? AND activity_key=? AND status='REQUIRED' AND source_value IN (SELECT source_role FROM role_mapping_decisions)",auth.user.accountid,now,account.account_id,a.activity_key));
    for(const review of data.reviews.filter(r=>same(r.account_id,account.account_id)&&same(r.activity_key,a.activity_key)&&r.status==='REQUIRED'&&data.mappings.some(m=>m.source_role===r.source_value)))review.status='CONFIRMED';
    return {assignment:await assignmentDTO(data,account,a)};
  }
  return {
    async run(action,input) {
      if(action==='recover')return {recovered:false}; // Every D1 save is atomic.
      if(action==='get')return directory(await store.load());
      if(action==='link') {
        const account=(await store.load()).accounts.find(a=>same(a.account_id,input.accountId));
        if(!account)throw managementError('Choose an existing account.',404);
        return {loginPath:`/account/${encodeURIComponent(account.login_link_id)}`};
      }
      if(action!=='save')throw managementError('Unknown profile action.',404);
      if(['matrix-policy','matrix-prepare'].includes(input.mode))throw managementError('Access-policy decisions must be reviewed before they change D1 access.',501,'ACCESS_POLICY_REVIEW_REQUIRED');
      return store.change('USER_PROFILES','ACADEMY',action,input,async()=>{
        const data=await store.load(),guardAccounts=data.accounts.map(a=>({...a})),statements=[],results=[];
        const entries=input.mode==='batch'?input.entries:[input];
        if(!Array.isArray(entries)||!entries.length||entries.length>80||entries.some(e=>!e||!['profile','matrix-roles'].includes(e.mode)))throw managementError('Save between 1 and 80 profile or role entries together.');
        const entryKey=e=>[e.mode,e.accountId||'',e.scopeType||'',e.scopeId||''].join(':');
        if(new Set(entries.map(e=>entryKey(e).toUpperCase())).size!==entries.length)throw managementError('Each changed entry must occur once.');
        for(const entry of entries.slice().sort((a,b)=>(a.mode==='profile'?0:1)-(b.mode==='profile'?0:1))) {
          try {results.push({entryKey:entryKey(entry),...await (entry.mode==='profile'?profile:roles)(data,entry,statements)});}
          catch(error){error.entryKey=entryKey(entry);throw error;}
        }
        return {data:{...data,accounts:guardAccounts},statements,result:input.mode==='batch'?{results}:Object.fromEntries(Object.entries(results[0]).filter(([key])=>key!=='entryKey')),fields:['DisplayName','Active','ProgramRoleAssignments']};
      });
    }
  };
}
