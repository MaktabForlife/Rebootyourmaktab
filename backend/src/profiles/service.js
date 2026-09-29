import { planProfileBatch } from './batch.js';
import { profileRevision } from './model.js';
import { academyDirectory, planAcademyChange } from './academy-access.js';
import { key, problem } from '../programs/model.js';
export function profileService(repository){
  return {
    async read(action,input={}){
      const data=await repository.load();
      if(action==='link'){
        const account=data.tables.UserAccounts.find(r=>key(r.AccountID)===key(input.accountId));
        if(!account)throw problem('Choose an existing user.',404);
        return {loginPath:`/account/${encodeURIComponent(account.UniqueID)}`};
      }
      return {...await academyDirectory(data),emptyRevision:await profileRevision(null)};
    },
    async receipt(operationId,hash){
      const data=await repository.load(),receipt=data.tables.AcademyProfileOperations.find(r=>r.OperationID===operationId);
      if(!receipt)return null;if(receipt.PayloadHash!==hash)throw problem('This retry identifier belongs to a different profile change.',409);
      return {...JSON.parse(receipt.ResultJSON),replayed:true};
    },
    async plan(action,input,user,hash){
      if(action!=='save')throw problem('Unknown profile action.');
      const data=await repository.load(),planned=await (input.mode==='batch'?planProfileBatch:planAcademyChange)(data,input,user),timestamp=new Date().toISOString();
      const result=planned.result;
      const audit={AuditID:`PROFILE-${input.operationId}`,DateStamp:timestamp,AccountID:user.accountid,AccountName:user.username,Authority:'GLOBAL_ADMIN',CourseID:input.scopeType==='PROGRAM'?input.scopeId:'',...planned.audit};
      const receipt={OperationID:input.operationId,PayloadHash:hash,ResultJSON:JSON.stringify(result),DateStamp:timestamp,AccountID:user.accountid};
      if(receipt.ResultJSON.length>45000)throw problem('This profile has too many assignments for a single safe save. No changes were made.',409);
      return {plan:repository.plan(data,planned.changes,audit,receipt,{matrixColumns:planned.matrixColumns}),result};
    },
    apply:plan=>repository.apply(plan)
  };
}
