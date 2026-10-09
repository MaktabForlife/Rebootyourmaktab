import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { batchReadGoogleSheetValues,readGoogleSpreadsheetSheetProperties } from '../lib/google-sheets.js';
import { validatePlatformSheetRows,isActivePlatformValue as active } from '../lib/platform-schema.js';
import { parseTable,assertUnique,key,problem } from '../programs/model.js';
import { ACADEMY_HEADERS,MATRIX_BASE,parseRoles } from './academy-access.js';

export function programRoleAccounts(tables,programId,prepared){
  const accounts=tables.UserAccounts;assertUnique(accounts,'AccountID','Accounts');
  const column=`PROGRAM:${programId}`;
  const scope=tables.AcademyAccessScopes?.find(r=>r.ScopeKey===column);
  return accounts.map(account=>{
    let roles=[];
    if(prepared&&scope){
      const row=tables.AcademyAccessMatrix.find(r=>key(r.AccountID)===key(account.AccountID));
      const review=tables.AcademyAccessReview.find(r=>key(r.AccountID)===key(account.AccountID)&&r.ScopeKey===column);
      if(row&&Object.hasOwn(row,column)&&review?.ReviewStatus!=='REQUIRED')roles=parseRoles(row[column]);
    }else if(!prepared)roles=tables.UserCourseAccess.filter(r=>key(r.AccountID)===key(account.AccountID)&&key(r.CourseID)===key(programId)&&active(r.Active)).map(r=>r.Role);
    return {AccountID:account.AccountID,DisplayName:account.DisplayName,Active:active(account.Active),Roles:[...new Set(roles)]};
  });
}
export async function readProgramRoleAccounts(env,programId){
  return (await readProgramRoleAccountsForPrograms(env,[programId]))[programId];
}
export async function readProgramRoleAccountsForPrograms(env,programIds){
  if(!programIds.length)return {};
  const target={spreadsheetId:getPlatformSpreadsheetId(env)},sheets=await readGoogleSpreadsheetSheetProperties(env,target);
  const matrixNames=['AcademyAccessMatrix','AcademyAccessScopes','AcademyAccessReview'];
  const present=matrixNames.filter(name=>sheets.some(s=>s.title===name));
  if(present.length&&present.length!==matrixNames.length)throw problem('Finish setting up User profiles before choosing timetable teachers.',409);
  const names=['UserAccounts','UserCourseAccess',...present],raw=await batchReadGoogleSheetValues(env,names.map(n=>`'${n}'!A:ZZ`),target),tables={};
  names.forEach((name,i)=>{
    if(name==='AcademyAccessMatrix'){
      const headers=raw[i][0]||[];
      if(JSON.stringify(headers.slice(0,3))!==JSON.stringify(MATRIX_BASE)||new Set(headers).size!==headers.length)throw problem('Review the academy matrix headers.',409);
      tables[name]=parseTable(raw[i],headers,name);assertUnique(tables[name],'AccountID',name);
    }else tables[name]=ACADEMY_HEADERS[name]?parseTable(raw[i],ACADEMY_HEADERS[name],name):validatePlatformSheetRows(name,raw[i]);
  });
  if(present.length){assertUnique(tables.AcademyAccessScopes,'ScopeKey','Academy scopes');assertUnique(tables.AcademyAccessReview,'ReviewID','Academy review');}
  return Object.fromEntries(programIds.map(id=>[id,programRoleAccounts(tables,id,present.length===3)]));
}
