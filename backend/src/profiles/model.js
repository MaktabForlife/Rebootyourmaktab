import { payloadHash } from '../programs/timetable-model.js';
import { clean, key, problem } from '../programs/model.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import { resolveGlobalSubjectAccessPolicy, hasActiveGlobalSubjectSubscription } from '../lib/global-subject-delivery.js';

export const ROLES = ['STUDENT','TEACHER','SENIOR','ADMIN'];
export const PROFILE_HEADERS = {
  AcademySubjectRoles:['AssignmentID','AccountID','SubjectID','Role','Active','CreatedDate','CreatedByAccountID','ModifiedDate','ModifiedByAccountID'],
  AcademyProfileOperations:['OperationID','PayloadHash','ResultJSON','DateStamp','AccountID']
};
export const profileRecord = row => row ? {accountId:row.AccountID,displayName:clean(row.DisplayName),active:active(row.Active),academyAdmin:key(row.PlatformRole)==='GLOBAL_ADMIN'} : null;
export const profileRevision = row => payloadHash(profileRecord(row));
export function scopes(data){
  return [
    ...data.tables.GlobalSubjectList.map(row=>({type:'SUBJECT',id:row.SubjectID,name:row.SubjectName,active:active(row.Active),accessModel:resolveGlobalSubjectAccessPolicy(data.tables.GlobalSubjectAccessPolicy,row.SubjectID).accessModel})),
    ...data.tables.CourseRegistry.map(row=>{const program=String(row.SchemaVersion).includes('-program'),definition=data.tables.ProgramDefinitions.find(d=>key(d.CourseID)===key(row.CourseID));return {type:'PROGRAM',id:row.CourseID,name:row.CourseName,active:program?definition?.Status==='DRAFT':active(row.Active),legacy:!program};})
  ];
}
export function assignment(data,accountId,scope){
  const rows=(scope.type==='SUBJECT'?data.tables.AcademySubjectRoles:data.tables.UserCourseAccess).filter(r=>key(r.AccountID)===key(accountId)&&key(scope.type==='SUBJECT'?r.SubjectID:r.CourseID)===key(scope.id));
  const roles=ROLES.filter(role=>scope.type==='SUBJECT'&&role==='STUDENT'
    ? scope.accessModel==='SUBSCRIPTION'&&hasActiveGlobalSubjectSubscription(data.tables.GlobalSubjectAccessMatrix,accountId,scope.id)
    : rows.some(r=>key(r.Role)===role&&active(r.Active)));
  return {accountId,scopeType:scope.type,scopeId:scope.id,roles};
}
export async function directory(data){
  const availableScopes=scopes(data);
  const accounts=await Promise.all(data.tables.UserAccounts.map(async row=>({
    ...profileRecord(row),revision:await profileRevision(row),
    assignments:await Promise.all(availableScopes.map(async scope=>{const record=assignment(data,row.AccountID,scope);return {...record,revision:await payloadHash(record)};}))
  })));
  return {accounts,scopes:availableScopes,roles:ROLES};
}
function changed(record,revision){throw Object.assign(problem('This record changed elsewhere. Your entry is kept. Review the saved version before trying again.',409),{code:'ROW_CHANGED',currentRecord:record,rowRevision:revision});}
export async function planProfileChange(data,input,user){
  const timestamp=new Date().toISOString(),actor=user.accountid,changes=[];
  const add=(table,record,fields)=>changes.push({table,record,fields});
  const account=data.tables.UserAccounts.find(r=>key(r.AccountID)===key(input.accountId));
  if(input.mode==='profile'){
    if(typeof input.creating!=='boolean')throw problem('Choose whether to add or edit a profile.');
    if(typeof input.displayName!=='string'||!clean(input.displayName)||input.displayName.trim().length>160||typeof input.active!=='boolean')throw problem('Enter a name of up to 160 characters and choose Active or Inactive.');
    if(input.creating){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.accountId||''))throw problem('This new profile needs its generated identifier.');
      if(account)throw problem('This profile already exists. Refresh the user list.',409);
    }else if(!account)throw problem('This profile is no longer available.',404);
    const revision=await profileRevision(account);if(input.baseRevision!==revision)changed(profileRecord(account),revision);
    if(account&&active(account.Active)&&!input.active){
      if(key(account.AccountID)===key(actor))throw problem('You cannot make your own account inactive.',409);
      if(key(account.PlatformRole)==='GLOBAL_ADMIN'&&!data.tables.UserAccounts.some(r=>key(r.AccountID)!==key(account.AccountID)&&active(r.Active)&&key(r.PlatformRole)==='GLOBAL_ADMIN'))throw problem('Keep at least one active academy administrator.',409);
    }
    const record={...(account||{}),AccountID:account?.AccountID||input.accountId,DisplayName:clean(input.displayName),Active:input.active,ModifiedDate:timestamp,ModifiedByAccountID:actor,ModifiedByAccountName:user.username};
    if(!account)Object.assign(record,{UniqueID:crypto.randomUUID().replaceAll('-',''),PINSetup:false,PINHash:'',PlatformRole:'',CreatedDate:timestamp,CreatedByAccountID:actor,CreatedByAccountName:user.username});
    add('UserAccounts',record,account?['DisplayName','Active','ModifiedDate','ModifiedByAccountID','ModifiedByAccountName']:undefined);
    if(!account)add('GlobalSubjectAccessMatrix',{AccountID:record.AccountID});
    const assignments=!account?await Promise.all(scopes(data).map(async scope=>{const grant={accountId:record.AccountID,scopeType:scope.type,scopeId:scope.id,roles:[]};return {...grant,revision:await payloadHash(grant)};})):undefined;
    return {changes,result:{profile:{...profileRecord(record),revision:await profileRevision(record),...(!account?{assignments}:{})},...(!account?{loginPath:`/account/${record.UniqueID}`}:{})},audit:{Action:account?'UPDATE_USER_PROFILE':'CREATE_USER_PROFILE',RecordType:'USER_ACCOUNT',RecordID:record.AccountID,ChangedFields:'DisplayName,Active'}};
  }
  if(input.mode!=='roles'||!account)throw problem('Choose an existing academy user.');
  const scope=scopes(data).find(s=>s.type===input.scopeType&&key(s.id)===key(input.scopeId));
  if(!scope)throw problem('Choose a global subject or program from the list.');
  if(!Array.isArray(input.roles)||input.roles.length>ROLES.length||input.roles.some(r=>!ROLES.includes(r))||new Set(input.roles).size!==input.roles.length)throw problem('Choose valid roles. User (free) applies when no paid Student role is selected.');
  const current=assignment(data,account.AccountID,scope),revision=await payloadHash(current);
  if(input.baseRevision!==revision)changed(current,revision);
  const selected=ROLES.filter(r=>input.roles.includes(r)),newRoles=selected.filter(r=>!current.roles.includes(r));
  if(newRoles.length&&(!active(account.Active)||!scope.active))throw problem('Reactivate the user and subject/program before adding a role.');
  if(newRoles.includes('STUDENT')&&input.subscriptionConfirmed!==true)throw problem('Confirm the paid subscription before assigning Student (paid).');
  if(scope.type==='SUBJECT'&&scope.accessModel==='FREE'&&selected.includes('STUDENT'))throw problem('This subject is free. Use User (free); a paid Student subscription is not needed.');
  const table=scope.type==='SUBJECT'?'AcademySubjectRoles':'UserCourseAccess',scopeField=scope.type==='SUBJECT'?'SubjectID':'CourseID',idField=scope.type==='SUBJECT'?'AssignmentID':'AccessID';
  for(const role of ROLES){
    if(scope.type==='SUBJECT'&&role==='STUDENT')continue;
    const matches=data.tables[table].filter(r=>key(r.AccountID)===key(account.AccountID)&&key(r[scopeField])===key(scope.id)&&key(r.Role)===role);
    if(matches.length>1)throw problem('This user has duplicate role records. Review them before saving.',409);
    const previous=matches[0],enabled=selected.includes(role);
    if(!previous&&!enabled)continue;
    // Legacy courses require an actual existing staff/student identity. Never invent a Reboot record mapping.
    if(scope.legacy&&enabled&&!clean(previous?.CourseRecordID))throw problem('This role needs an existing linked record in the Reboot workspace before it can be assigned here. Existing linked roles can be activated or paused.',409);
    if(previous&&active(previous.Active)===enabled)continue;
    const record={...(previous||{}),[idField]:previous?.[idField]||`ROLE-${crypto.randomUUID()}`,AccountID:account.AccountID,[scopeField]:scope.id,Role:role,Active:enabled,ModifiedDate:timestamp,ModifiedByAccountID:actor,ModifiedByAccountName:user.username};
    if(!previous)Object.assign(record,{CreatedDate:timestamp,CreatedByAccountID:actor,CreatedByAccountName:user.username,...(table==='UserCourseAccess'?{IsDefault:false,CourseRecordID:account.AccountID}:{})});
    add(table,record,previous?['Active','ModifiedDate','ModifiedByAccountID',...(table==='UserCourseAccess'?['ModifiedByAccountName']:[])]:undefined);
  }
  if(scope.type==='SUBJECT'&&scope.accessModel==='SUBSCRIPTION'){
    const matches=data.tables.GlobalSubjectAccessMatrix.filter(r=>key(r.AccountID)===key(account.AccountID));
    if(matches.length!==1)throw problem('The user needs exactly one row in the subject access matrix. No changes were saved.',409);
    const column=data.tables.GlobalSubjectAccessMatrix._subjectColumns.find(c=>key(c.subjectId)===key(scope.id));
    if(!column)throw problem('The subject is missing from the access matrix. No changes were saved.',409);
    if(current.roles.includes('STUDENT')!==selected.includes('STUDENT'))add('GlobalSubjectAccessMatrix',{...matches[0],[scope.id]:selected.includes('STUDENT')},[scope.id]);
  }
  const record={...current,roles:selected};
  return {changes,result:{assignment:{...record,revision:await payloadHash(record)}},audit:{Action:'SET_USER_SCOPE_ROLES',RecordType:scope.type,RecordID:`${account.AccountID}:${scope.id}`,ChangedFields:JSON.stringify({before:current.roles,after:selected,paidSubscriptionConfirmed:newRoles.includes('STUDENT')&&input.subscriptionConfirmed===true})}};
}
