import { key, problem } from '../programs/model.js';
import { payloadHash } from '../programs/timetable-model.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import { resolveGlobalSubjectAccessPolicy } from '../lib/global-subject-delivery.js';
import { ROLES, planProfileChange, profileRecord, profileRevision } from './model.js';

export const MATRIX_BASE=['AccountID','UserName','Status'];
export const ACADEMY_HEADERS={
  AcademyAccessScopes:['ScopeKey','ScopeType','ScopeID','ScopeName','AccessModel','ReviewStatus','MigrationStage','Source','CreatedDate','ModifiedDate','ModifiedByAccountID'],
  AcademyAccessReview:['ReviewID','AccountID','ScopeKey','ReviewStatus','SourceValue','Note','ModifiedDate','ModifiedByAccountID']
};
export const scopeKey=scope=>`${scope.type}:${scope.id}`;
export const rolesText=roles=>ROLES.filter(role=>roles.includes(role)).join('|')||'USER';
export function parseRoles(value){
  const text=key(value);if(!text||text==='USER')return [];
  const selected=text.split('|');
  if(selected.some(role=>!ROLES.includes(role))||new Set(selected).size!==selected.length)throw problem('An academy matrix cell has invalid roles. Use User, Student, Teacher, Senior or Admin.',409);
  return ROLES.filter(role=>selected.includes(role));
}
export function sourceScopes(data){
  return [
    ...data.tables.GlobalSubjectList.map(row=>{const policy=resolveGlobalSubjectAccessPolicy(data.tables.GlobalSubjectAccessPolicy,row.SubjectID);return {type:'SUBJECT',id:row.SubjectID,name:row.SubjectName,active:active(row.Active),accessModel:policy.accessModel==='FREE'?'FREE':'PAID',policyKnown:policy.valid};}),
    ...data.tables.CourseRegistry.map(row=>{const legacy=!String(row.SchemaVersion).includes('-program');return {type:'PROGRAM',id:row.CourseID,name:row.CourseName,active:legacy?active(row.Active):data.tables.ProgramDefinitions.some(d=>key(d.CourseID)===key(row.CourseID)&&d.Status==='DRAFT'),accessModel:'PAID',policyKnown:false,legacy};})
  ];
}
function importedRoles(data,accountId,scope){
  if(scope.type==='PROGRAM')return ROLES.filter(role=>data.tables.UserCourseAccess.some(r=>key(r.AccountID)===key(accountId)&&key(r.CourseID)===key(scope.id)&&key(r.Role)===role&&active(r.Active)));
  const row=data.tables.GlobalSubjectAccessMatrix.find(r=>key(r.AccountID)===key(accountId));
  const roles=active(row?._subjectAccess?.[key(scope.id)])?['STUDENT']:[];
  for(const role of ROLES)if((data.tables.AcademySubjectRoles||[]).some(r=>key(r.AccountID)===key(accountId)&&key(r.SubjectID)===key(scope.id)&&key(r.Role)===role&&active(r.Active)))roles.push(role);
  return ROLES.filter(role=>roles.includes(role));
}
function reviewRecord(data,accountId,scope){return data.tables.AcademyAccessReview.find(r=>key(r.AccountID)===key(accountId)&&key(r.ScopeKey)===key(scopeKey(scope)));}
export function matrixAssignment(data,accountId,scope){
  const row=data.tables.AcademyAccessMatrix.find(r=>key(r.AccountID)===key(accountId));
  const record=reviewRecord(data,accountId,scope);
  return {accountId,scopeType:scope.type,scopeId:scope.id,roles:parseRoles(row?.[scopeKey(scope)]),reviewStatus:record?.ReviewStatus||'CONFIRMED'};
}
export const policyRevision=scope=>payloadHash({scopeKey:scopeKey(scope),accessModel:scope.accessModel,reviewStatus:scope.reviewStatus,stage:scope.stage});
export function accessAllowed(account,scope,roles){return Boolean(account.active&&scope.active&&(scope.accessModel==='FREE'||roles.length));}
export async function academyDirectory(data){
  const scopes=await Promise.all(sourceScopes(data).map(async source=>{
    const stored=data.tables.AcademyAccessScopes.find(r=>key(r.ScopeKey)===key(scopeKey(source)));
    const scope={...source,prepared:Boolean(stored)&&Boolean(data.headers?.AcademyAccessMatrix?.includes(scopeKey(source))),accessModel:stored?.AccessModel||source.accessModel,reviewStatus:stored?.ReviewStatus||'REQUIRED',stage:stored?.MigrationStage||'SETUP'};
    return {...scope,revision:await policyRevision(scope)};
  }));
  const accounts=await Promise.all(data.tables.UserAccounts.map(async row=>{
    const account={...profileRecord(row),revision:await profileRevision(row)};
    return {...account,assignments:await Promise.all(scopes.map(async scope=>{
      const record=matrixAssignment(data,row.AccountID,scope);
      return {...record,revision:await payloadHash(record),accessAllowed:accessAllowed(account,scope,record.roles)};
    }))};
  }));
  const prepared=Boolean(data.academyPrepared);
  return {accounts,scopes,roles:ROLES,prepared,stage:'SETUP',needsSync:!prepared||scopes.some(s=>!s.prepared)||accounts.some(a=>!data.tables.AcademyAccessMatrix.some(r=>key(r.AccountID)===key(a.accountId))),reviewCount:accounts.flatMap(a=>a.assignments).filter(a=>a.reviewStatus==='REQUIRED').length};
}
function changed(record,revision){throw Object.assign(problem('This entry changed elsewhere. Review the saved version before replacing it.',409),{code:'ROW_CHANGED',currentRecord:record,rowRevision:revision});}
export function prepareAcademyAccess(data,user){
  const timestamp=new Date().toISOString(),changes=[],scopes=sourceScopes(data),existingHeaders=data.headers?.AcademyAccessMatrix||MATRIX_BASE;
  const matrixColumns=[...existingHeaders,...scopes.map(scopeKey).filter(k=>!existingHeaders.includes(k))];
  for(const scope of scopes){
    if(!data.tables.AcademyAccessScopes.some(r=>key(r.ScopeKey)===key(scopeKey(scope))))changes.push({table:'AcademyAccessScopes',record:{ScopeKey:scopeKey(scope),ScopeType:scope.type,ScopeID:scope.id,ScopeName:scope.name,AccessModel:scope.accessModel,ReviewStatus:scope.policyKnown?'CONFIRMED':'REQUIRED',MigrationStage:'SETUP',Source:scope.type==='SUBJECT'?'GlobalSubjectAccessPolicy':'Needs administrator choice',CreatedDate:timestamp,ModifiedDate:timestamp,ModifiedByAccountID:user.accountid}});
  }
  for(const account of data.tables.UserAccounts){
    const existing=data.tables.AcademyAccessMatrix.find(r=>key(r.AccountID)===key(account.AccountID));
    const record={...(existing||{}),AccountID:account.AccountID},fields=[];
    for(const scope of scopes){
      if(existing&&existingHeaders.includes(scopeKey(scope)))continue;
      const roles=importedRoles(data,account.AccountID,scope);record[scopeKey(scope)]=rolesText(roles);fields.push(scopeKey(scope));
      const oldMatrix=data.tables.GlobalSubjectAccessMatrix.find(r=>key(r.AccountID)===key(account.AccountID));
      const sourceValue=scope.type==='SUBJECT'?String(oldMatrix?._subjectAccess?.[key(scope.id)]??false):rolesText(roles);
      const ambiguous=scope.type==='SUBJECT'&&active(sourceValue);
      if(!reviewRecord(data,account.AccountID,scope))changes.push({table:'AcademyAccessReview',record:{ReviewID:`${account.AccountID}|${scopeKey(scope)}`,AccountID:account.AccountID,ScopeKey:scopeKey(scope),ReviewStatus:ambiguous?'REQUIRED':'CONFIRMED',SourceValue:sourceValue,Note:ambiguous?'Existing TRUE access proposed as Student; confirm the intended role.':'Imported known roles or default User; legacy records unchanged.',ModifiedDate:timestamp,ModifiedByAccountID:user.accountid}});
    }
    if(!existing||fields.length)changes.push({table:'AcademyAccessMatrix',record,fields:existing?fields:undefined});
  }
  return {changes,matrixColumns,result:{prepared:true},audit:{Action:'PREPARE_ACADEMY_ACCESS',RecordType:'ACADEMY_ACCESS',RecordID:'SETUP',ChangedFields:'Import into separate setup matrix; legacy access unchanged'}};
}
export async function planAcademyChange(data,input,user){
  if(input.mode==='matrix-prepare')return prepareAcademyAccess(data,user);
  if(!data.academyPrepared)throw problem('Set up the academy matrix before editing.',409);
  if(input.mode==='profile'){
    const planned=await planProfileChange(data,input,user);
    if(input.creating){
      const record={AccountID:input.accountId};for(const column of data.headers.AcademyAccessMatrix.slice(3))record[column]='USER';
      planned.changes.push({table:'AcademyAccessMatrix',record});
      planned.result.profile.assignments=await Promise.all(sourceScopes(data).map(async scope=>{const grant={accountId:input.accountId,scopeType:scope.type,scopeId:scope.id,roles:[],reviewStatus:'CONFIRMED'};return {...grant,revision:await payloadHash(grant)};}));
    }
    return planned;
  }
  if(!['matrix-roles','matrix-policy'].includes(input.mode))throw problem('Refresh User profiles to use the new academy matrix. The existing access lists were not changed.',409);
  const source=sourceScopes(data).find(s=>s.type===input.scopeType&&key(s.id)===key(input.scopeId));
  const stored=source&&data.tables.AcademyAccessScopes.find(r=>key(r.ScopeKey)===key(scopeKey(source)));
  const scope=source?{...source,prepared:Boolean(stored)&&Boolean(data.headers?.AcademyAccessMatrix?.includes(scopeKey(source))),accessModel:stored?.AccessModel||source.accessModel,reviewStatus:stored?.ReviewStatus||'REQUIRED',stage:stored?.MigrationStage||'SETUP'}:null;
  if(scope)scope.revision=await policyRevision(scope);
  if(!scope?.prepared)throw problem('Update the matrix to include this program/course.',409);
  if(scope.stage!=='SETUP')throw problem('This matrix version supports setup only. Review the access migration before editing.',409);
  const timestamp=new Date().toISOString(),actor=user.accountid;
  if(input.mode==='matrix-policy'){
    if(input.baseRevision!==scope.revision)changed(scope,scope.revision);
    if(!['FREE','PAID'].includes(input.accessModel)||input.policyConfirmed!==true)throw problem('Choose Free or Paid and confirm that it applies to the entire program/course.');
    const old=data.tables.AcademyAccessScopes.find(r=>key(r.ScopeKey)===key(scopeKey(scope))),record={...old,AccessModel:input.accessModel,ReviewStatus:'CONFIRMED',ModifiedDate:timestamp,ModifiedByAccountID:actor};
    const updated={...scope,accessModel:input.accessModel,reviewStatus:'CONFIRMED'};updated.revision=await policyRevision(updated);
    return {changes:[{table:'AcademyAccessScopes',record,fields:['AccessModel','ReviewStatus','ModifiedDate','ModifiedByAccountID']}],result:{scope:updated},audit:{Action:'SET_ACADEMY_ACCESS_POLICY',RecordType:scope.type,RecordID:scope.id,ChangedFields:JSON.stringify({before:scope.accessModel,after:input.accessModel,stage:'SETUP'})}};
  }
  const account=profileRecord(data.tables.UserAccounts.find(a=>key(a.AccountID)===key(input.accountId)));if(!account)throw problem('Choose an existing academy user.');
  const current=matrixAssignment(data,account.accountId,scope);current.revision=await payloadHash(current);
  if(input.baseRevision!==current.revision)changed(current,current.revision);
  if(input.scopeRevision!==scope.revision)throw Object.assign(problem('The Free/Paid setting changed. Review the roles against the current setting before saving.',409),{code:'ROW_CHANGED',currentRecord:{...current,scopeRevision:scope.revision,accessModel:scope.accessModel},rowRevision:current.revision});
  if(!Array.isArray(input.roles)||input.roles.some(r=>!ROLES.includes(r))||input.roles.length!==new Set(input.roles).size)throw problem('Choose valid roles. User is the default.');
  const roles=ROLES.filter(r=>input.roles.includes(r));
  if(roles.some(r=>!current.roles.includes(r))&&(!account.active||!scope.active))throw problem('Reactivate the account and program/course before adding roles.');
  const previous=data.tables.AcademyAccessMatrix.find(r=>key(r.AccountID)===key(account.accountId));if(!previous)throw problem('Update the matrix to include this user.',409);
  const priorReview=reviewRecord(data,account.accountId,scope),review={...(priorReview||{}),ReviewID:priorReview?.ReviewID||`${account.accountId}|${scopeKey(scope)}`,AccountID:account.accountId,ScopeKey:scopeKey(scope),ReviewStatus:'CONFIRMED',ModifiedDate:timestamp,ModifiedByAccountID:actor};
  const result={accountId:account.accountId,scopeType:scope.type,scopeId:scope.id,roles,reviewStatus:'CONFIRMED'};
  return {changes:[{table:'AcademyAccessMatrix',record:{...previous,[scopeKey(scope)]:rolesText(roles)},fields:[scopeKey(scope)]},{table:'AcademyAccessReview',record:review,fields:priorReview?['ReviewStatus','ModifiedDate','ModifiedByAccountID']:undefined}],result:{assignment:{...result,revision:await payloadHash(result),accessAllowed:accessAllowed(account,scope,roles)}},audit:{Action:'SET_ACADEMY_ACCESS_ROLES',RecordType:scope.type,RecordID:`${account.accountId}:${scope.id}`,ChangedFields:JSON.stringify({before:current.roles,after:roles,stage:'SETUP'})}};
}
