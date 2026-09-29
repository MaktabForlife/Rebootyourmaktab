/* Synthetic identities only; never seed these records into an academy workbook. */
import { PROFILE_HEADERS } from '../backend/src/profiles/model.js';
export function userProfilesFixture(){
  const matrix=[{AccountID:'OWNER',_subjectAccess:{FREE:false,PAID:true}},{AccountID:'PERSON',_subjectAccess:{FREE:false,PAID:false}}];
  matrix._subjectColumns=[{subjectId:'FREE',normalizedSubjectId:'FREE',columnNumber:2,columnName:'B'},{subjectId:'PAID',normalizedSubjectId:'PAID',columnNumber:3,columnName:'C'}];
  const tables={
    UserAccounts:[{AccountID:'OWNER',DisplayName:'Academy administrator',UniqueID:'OWNER-LINK',PINSetup:true,PINHash:'private-pin-hash',Active:true,PlatformRole:'GLOBAL_ADMIN'},
      {AccountID:'PERSON',DisplayName:'Example user',UniqueID:'PERSON-LINK',PINSetup:true,PINHash:'another-private-hash',Active:true,PlatformRole:''}],
    GlobalSubjectList:[{SubjectID:'FREE',SubjectName:'Free subject',Active:true},{SubjectID:'PAID',SubjectName:'Paid subject',Active:true}],
    GlobalSubjectAccessPolicy:[{SubjectID:'FREE',AccessModel:'FREE',Active:true},{SubjectID:'PAID',AccessModel:'SUBSCRIPTION',Active:true}],
    GlobalSubjectAccessMatrix:matrix,
    CourseRegistry:[{CourseID:'PRG-DEMO',CourseName:'Demo program',SchemaVersion:'105.1-program',Active:false},{CourseID:'REBOOT',CourseName:'Reboot',SchemaVersion:'104.5',Active:true}],
    ProgramDefinitions:[{CourseID:'PRG-DEMO',Status:'DRAFT'}],UserCourseAccess:[{AccessID:'LEGACY',AccountID:'PERSON',CourseID:'REBOOT',Role:'TEACHER',Active:true,CourseRecordID:'ADMIN-REAL'}],
    AcademySubjectRoles:[],AcademyProfileOperations:[],PlatformAuditLog:[]
  };
  for(const rows of Object.values(tables))rows.forEach((row,index)=>row._rowNumber=index+2);
  let pending=null,failMode='',authorized=true;const plans=[];
  const repository={
    load:async()=>({tables:structuredClone(tables)}),
    plan(_data,changes,audit,receipt){return {changes:structuredClone(changes),audit,receipt};},
    async apply(plan){
      const mode=failMode;failMode='';if(mode==='before')throw new Error('Injected before commit');
      plans.push(structuredClone(plan));
      for(const {table,record,fields} of plan.changes){const rows=tables[table];
        if(record._rowNumber){const row=rows.find(r=>r._rowNumber===record._rowNumber);for(const field of fields||Object.keys(record)){if(table==='GlobalSubjectAccessMatrix'&&field!=='AccountID')row._subjectAccess[field.toUpperCase()]=record[field];else row[field]=record[field];}}
        else {const added={...structuredClone(record),_rowNumber:rows.length+2};if(table==='GlobalSubjectAccessMatrix')added._subjectAccess={FREE:false,PAID:false};rows.push(added);}
      }
      tables.AcademyProfileOperations.push({...structuredClone(plan.receipt),_rowNumber:tables.AcademyProfileOperations.length+2});tables.PlatformAuditLog.push(structuredClone(plan.audit));
      if(mode==='after')throw new Error('Injected lost response');
    }
  };
  const journal={get:async()=>structuredClone(pending),set:async value=>{pending=structuredClone(value);},clear:async()=>{pending=null;}};
  return {tables,plans,repository,journal,failNext:mode=>{failMode=mode;},setAuthorized:value=>{authorized=value;},authorize:()=>{if(!authorized)throw Object.assign(new Error('Administrator access revoked'),{status:403});return {accountid:'OWNER',username:'Academy administrator'};}};
}
