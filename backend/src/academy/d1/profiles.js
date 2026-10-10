import { payloadHash } from '../../programs/timetable-model.js';
import { planProfileChange } from '../../profiles/model.js';
import { managementStore,managementError,rowChanged,same,liveRoles,pendingRoles,profileDTO } from './management-store.js';
import {teacherDesignations,academyTeacher} from './teachers.js';

const editableRoles=['STUDENT','TEACHER','PROGRAM_ADMIN'];
const scopeOf=a=>({type:a.kind==='PROGRAM'?'PROGRAM':'SUBJECT',id:a.activity_id});
function assignment(data,account,a) {
  const scope=scopeOf(a),pending=pendingRoles(data,account.account_id,a.activity_key).map(r=>r.source_value).sort();
  const inheritedStudent=a.kind==='COURSE'&&data.subscriptions.some(s=>same(s.account_id,account.account_id)&&same(s.activity_key,a.activity_key));
  return {accountId:account.account_id,scopeType:scope.type,scopeId:scope.id,
    roles:editableRoles.filter(r=>liveRoles(data,account.account_id,a.activity_key).includes(r)||r==='STUDENT'&&inheritedStudent),
    reviewStatus:pending.length?'REQUIRED':'CONFIRMED',pendingRoles:pending};
}
export async function assignmentDTO(data,account,a) {
  const result=assignment(data,account,a);
  const subscription=data.subscriptions.some(s=>same(s.account_id,account.account_id)&&same(s.activity_key,a.activity_key));
  const academyAdmin=profileDTO(data,account).academyAdmin;
  // Display effective authority without materializing inherited grants or
  // adding automatic Program Admin grants to the roles that this editor saves.
  const inheritedRoles=academyAdmin?['PROGRAM_ADMIN']:[];
  const displayRoles=[...new Set([...inheritedRoles,...result.roles,...(a.kind==='COURSE'&&subscription?['STUDENT']:[])])];
  return {...result,inheritedRoles,displayRoles,revision:await payloadHash(result),accessAllowed:Boolean(account.active&&a.active&&a.lifecycle==='ACTIVE'&&(academyAdmin||result.roles.length||accessModel(data,a)==='FREE'||subscription))};
}
function accessModel(data,a){return (a.kind==='COURSE'?data.coursePolicies.find(p=>same(p.activity_key,a.activity_key))?.legacy_access_model:undefined)||data.policies.find(p=>same(p.activity_key,a.activity_key))?.source_access_model||'UNKNOWN';}
export async function scopeDTO(data,a) {
  const result={...scopeOf(a),name:a.name,active:Boolean(a.active&&a.lifecycle==='ACTIVE'),prepared:true,
    accessModel:accessModel(data,a),reviewStatus:'REQUIRED',stage:'SETUP',policyEditable:false,rolesEditable:true};
  return {...result,revision:await payloadHash(result)};
}

export function d1Profiles(repository,auth) {
  const store=managementStore(repository,auth),p=store.p;
  const load=async()=>{
    const teachers=await teacherDesignations(repository);
    return {...await store.load({teachers:teachers.statement,coursePolicies:p('SELECT * FROM course_settings'),subscriptions:p(`SELECT * FROM ${await repository.subscriptionSource()}`)}),teacherDesignationsAvailable:teachers.available};
  };
  const accountProfile=(data,a)=>({...profileDTO(data,a),...(a&&data.teacherDesignationsAvailable?{academyTeacher:academyTeacher(data,a.account_id)}:{})});
  async function directory(data) {
    const activities=data.activities.filter(a=>['PROGRAM','COURSE'].includes(a.kind));
    return {accounts:await Promise.all(data.accounts.map(async a=>({...accountProfile(data,a),revision:await payloadHash(accountProfile(data,a)),assignments:await Promise.all(activities.map(activity=>assignmentDTO(data,a,activity)))}))),
      scopes:await Promise.all(activities.map(a=>scopeDTO(data,a))),roles:editableRoles,prepared:true,needsSync:false,
      stage:'SETUP',reviewCount:data.reviews.filter(r=>r.status==='REQUIRED'&&!data.mappings.some(m=>m.source_role===r.source_value)).length,policyEditable:false,teacherDesignationEditable:data.teacherDesignationsAvailable,adminDesignationEditable:Boolean(auth.state.account.global_admin),currentAccountId:auth.user.accountid,store:'D1',emptyRevision:await payloadHash(null)};
  }
  async function profile(data,input,statements) {
    const source=data.accounts.map(a=>({AccountID:a.account_id,DisplayName:a.display_name,UniqueID:a.login_link_id,Active:Boolean(a.active),PlatformRole:profileDTO(data,a).academyAdmin?'GLOBAL_ADMIN':''}));
    const current=data.accounts.find(a=>same(a.account_id,input.accountId));
    const currentProfile=current?accountProfile(data,current):null,revision=await payloadHash(currentProfile);
    if(input.baseRevision!==revision)throw rowChanged(currentProfile,revision);
    if(input.academyAdmin!==undefined){
      if(!auth.state.account.global_admin)throw managementError('Only a Global Admin can change Academy-wide authority.',403,'FORBIDDEN');
      if(typeof input.academyAdmin!=='boolean')throw managementError('Choose whether this user is a Global Admin.');
      if(input.academyAdmin&&!input.active)throw managementError('Reactivate this account before designating it a Global Admin.');
      if(currentProfile?.academyAdmin&&!input.academyAdmin&&same(input.accountId,auth.user.accountid))throw managementError('Another Global Admin must remove your Global Admin designation.',409,'OWN_ADMIN_CHANGE');
    }
    if(input.academyTeacher!==undefined){
      if(typeof input.academyTeacher!=='boolean')throw managementError('Choose whether this user is a Global Teacher.');
      if(!data.teacherDesignationsAvailable)throw managementError('Global Teacher designation needs its database upgrade.',503,'TEACHER_SCHEMA_REQUIRED');
      if(input.academyTeacher&&!input.active&&!academyTeacher(data,input.accountId))throw managementError('Reactivate this account before designating it a Global Teacher.');
    }
    const planned=await planProfileChange({tables:{UserAccounts:source}},{...input,baseRevision:await payloadHash(current?profileDTO(data,current):null)},auth.user);
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
    if(input.academyTeacher!==undefined&&input.academyTeacher!==academyTeacher(data,record.AccountID)){
      statements.push(p(`INSERT INTO academy_teacher_designations(account_id,active,updated_at,updated_by_account_id) VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET active=excluded.active,revision=academy_teacher_designations.revision+1,updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id`,record.AccountID,Number(input.academyTeacher),now,auth.user.accountid));
      data.teachers=data.teachers.filter(t=>!same(t.account_id,record.AccountID));
      data.teachers.push({account_id:record.AccountID,active:Number(input.academyTeacher)});
    }
    if(input.academyAdmin!==undefined&&input.academyAdmin!==Boolean(currentProfile?.academyAdmin)){
      statements.push(p('UPDATE global_role_assignments SET active=0 WHERE account_id=? AND active=1',record.AccountID));
      for(const grant of data.admins.filter(g=>same(g.account_id,record.AccountID)))grant.active=0;
      if(input.academyAdmin){
        const grant={assignment_id:crypto.randomUUID(),account_id:record.AccountID,role:'GLOBAL_ADMIN',active:1,review_state:'CONFIRMED',granted_at:now,granted_by_account_id:auth.user.accountid};
        statements.push(p("INSERT INTO global_role_assignments(assignment_id,account_id,role,active,review_state,granted_at,granted_by_account_id) VALUES(?,?,'GLOBAL_ADMIN',1,'CONFIRMED',?,?)",grant.assignment_id,record.AccountID,now,auth.user.accountid));
        data.admins.push(grant);
      }
    }
    const saved=accountProfile(data,data.accounts.find(a=>same(a.account_id,record.AccountID)));
    planned.result.profile={...planned.result.profile,...saved,revision:await payloadHash(saved)};
    if(input.academyAdmin!==undefined)planned.result.profile.assignments=await Promise.all(data.activities.filter(a=>['PROGRAM','COURSE'].includes(a.kind)).map(a=>assignmentDTO(data,data.accounts.find(a=>same(a.account_id,record.AccountID)),a)));
    return planned.result;
  }
  async function roles(data,input,statements) {
    if(!['PROGRAM','SUBJECT'].includes(input.scopeType))throw managementError('Choose a Program or Course.');
    const a=data.activities.find(a=>a.kind===(input.scopeType==='PROGRAM'?'PROGRAM':'COURSE')&&same(a.activity_id,input.scopeId));
    const account=data.accounts.find(a=>same(a.account_id,input.accountId));
    if(!a||!account)throw managementError('Choose an existing Program or Course and account.',404);
    const current=await assignmentDTO(data,account,a),scope=await scopeDTO(data,a);
    if(input.baseRevision!==current.revision)throw rowChanged(current,current.revision);
    if(input.scopeRevision!==scope.revision)throw rowChanged({...current,scopeRevision:scope.revision,accessModel:scope.accessModel},current.revision);
    if(!Array.isArray(input.roles)||input.roles.some(r=>!editableRoles.includes(r))||new Set(input.roles).size!==input.roles.length)
      throw managementError('Choose Student, Teacher or Program Admin. Global Admin is a separate Academy-wide authority.',400,'INVALID_ROLE');
    const selected=editableRoles.filter(r=>input.roles.includes(r));
    if(selected.some(r=>!current.roles.includes(r))&&(!account.active||!a.active||a.lifecycle!=='ACTIVE'))throw managementError('Reactivate the account and learning area before adding roles.');
    const now=new Date().toISOString();
    if(a.kind==='COURSE') {
      if(await repository.subscriptionSource()!=='effective_course_subscriptions')throw managementError('Course role editing needs its database upgrade.',503,'COURSE_ACCESS_SCHEMA_REQUIRED');
      const student=selected.includes('STUDENT'),subscribed=data.subscriptions.some(s=>same(s.account_id,account.account_id)&&same(s.activity_key,a.activity_key));
      // Reconcile the earlier Course access switch with the editable Student
      // role. Revocation must override imported evidence, which stays intact.
      if(student!==subscribed)statements.push(p(`INSERT INTO course_subscription_decisions(account_id,activity_key,active,updated_at,updated_by_account_id)
        VALUES(?,?,?,?,?) ON CONFLICT(account_id,activity_key) DO UPDATE SET active=excluded.active,updated_at=excluded.updated_at,
        updated_by_account_id=excluded.updated_by_account_id,revision=course_subscription_decisions.revision+1`,account.account_id,a.activity_key,Number(student),now,auth.user.accountid));
      data.subscriptions=data.subscriptions.filter(s=>!same(s.account_id,account.account_id)||!same(s.activity_key,a.activity_key));
      if(student)data.subscriptions.push({account_id:account.account_id,activity_key:a.activity_key});
    }
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
      if(action==='get')return directory(await load());
      if(action==='link') {
        const account=(await store.load()).accounts.find(a=>same(a.account_id,input.accountId));
        if(!account)throw managementError('Choose an existing account.',404);
        return {loginPath:`/account/${encodeURIComponent(account.login_link_id)}`};
      }
      const courseRoles=action==='course-roles';
      if(courseRoles) {
        const key='COURSE:'+String(input.scopeId||'');
        if(input.mode!=='matrix-roles'||input.scopeType!=='SUBJECT'||!auth.state.account.global_admin&&!auth.state.roles.some(r=>same(r.activity_key,key)&&r.role==='PROGRAM_ADMIN'))throw managementError('Choose a Course you administer.',403,'FORBIDDEN');
      } else if(action!=='save')throw managementError('Unknown profile action.',404);
      if(['matrix-policy','matrix-prepare'].includes(input.mode))throw managementError('Access-policy decisions must be reviewed before they change D1 access.',501,'ACCESS_POLICY_REVIEW_REQUIRED');
      return store.change(courseRoles?'COURSE_MANAGEMENT':'USER_PROFILES',courseRoles?'COURSE:'+input.scopeId:'ACADEMY',action,input,async()=>{
        const data=await load(),guardAccounts=data.accounts.map(a=>({...a})),statements=[],results=[];
        const entries=input.mode==='batch'?input.entries:[input];
        if(!Array.isArray(entries)||!entries.length||entries.length>80||entries.some(e=>!e||!['profile','matrix-roles'].includes(e.mode)))throw managementError('Save between 1 and 80 profile or role entries together.');
        const entryKey=e=>[e.mode,e.accountId||'',e.scopeType||'',e.scopeId||''].join(':');
        if(new Set(entries.map(e=>entryKey(e).toUpperCase())).size!==entries.length)throw managementError('Each changed entry must occur once.');
        for(const entry of entries.slice().sort((a,b)=>(a.mode==='profile'?0:1)-(b.mode==='profile'?0:1))) {
          try {results.push({entryKey:entryKey(entry),...await (entry.mode==='profile'?profile:roles)(data,entry,statements)});}
          catch(error){error.entryKey=entryKey(entry);throw error;}
        }
        if(!data.accounts.some(a=>a.active&&profileDTO(data,a).academyAdmin))throw managementError('Keep at least one active Global Admin.',409,'LAST_ADMIN');
        return {data:{...data,accounts:guardAccounts},statements,result:input.mode==='batch'?{results}:Object.fromEntries(Object.entries(results[0]).filter(([key])=>key!=='entryKey')),fields:['DisplayName','Active','GlobalAdmin','GlobalTeacher','ActivityRoleAssignments']};
      });
    }
  };
}
