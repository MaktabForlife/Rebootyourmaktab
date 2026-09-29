import { payloadHash } from '../programs/timetable-model.js';
import { clean, key, problem } from '../programs/model.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';

export const ROLES = ['STUDENT','TEACHER','SENIOR','ADMIN'];
export const PROFILE_HEADERS = {
  AcademySubjectRoles:['AssignmentID','AccountID','SubjectID','Role','Active','CreatedDate','CreatedByAccountID','ModifiedDate','ModifiedByAccountID'],
  AcademyProfileOperations:['OperationID','PayloadHash','ResultJSON','DateStamp','AccountID']
};
export const profileRecord = row => row ? {accountId:row.AccountID,displayName:clean(row.DisplayName),active:active(row.Active),academyAdmin:key(row.PlatformRole)==='GLOBAL_ADMIN'} : null;
export const profileRevision = row => payloadHash(profileRecord(row));
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
    return {changes,result:{profile:{...profileRecord(record),revision:await profileRevision(record)},...(!account?{loginPath:`/account/${record.UniqueID}`}:{})},audit:{Action:account?'UPDATE_USER_PROFILE':'CREATE_USER_PROFILE',RecordType:'USER_ACCOUNT',RecordID:record.AccountID,ChangedFields:'DisplayName,Active'}};
  }
  throw problem('Choose a profile change. Roles use the separate academy matrix.');
}
