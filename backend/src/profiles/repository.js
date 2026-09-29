import { batchReadGoogleSheetValues, readGoogleSpreadsheetSheetProperties, batchUpdateGoogleSpreadsheet } from '../lib/google-sheets.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { PLATFORM_SHEET_HEADERS, validatePlatformSheetRows } from '../lib/platform-schema.js';
import { DEFINITION_HEADERS, parseTable, assertUnique, clean, problem } from '../programs/model.js';
import { PROFILE_HEADERS, ROLES } from './model.js';
import { ACADEMY_HEADERS, MATRIX_BASE, parseRoles } from './academy-access.js';
const BASE=['UserAccounts','UserCourseAccess','GlobalSubjectAccessMatrix','GlobalSubjectList','GlobalSubjectAccessPolicy','CourseRegistry','PlatformAuditLog'];
const OPTIONAL={...PROFILE_HEADERS,...ACADEMY_HEADERS,AcademyAccessMatrix:MATRIX_BASE,ProgramDefinitions:DEFINITION_HEADERS};
export const matrixFormula=(column,row)=>column==='UserName'?`=IFERROR(VLOOKUP($A${row},UserAccounts!$A:$F,2,FALSE),"")`:`=IF(IFERROR(VLOOKUP($A${row},UserAccounts!$A:$F,6,FALSE),FALSE),"ACTIVE","INACTIVE")`;
const cells=values=>({values:values.map(value=>({userEnteredValue:typeof value==='boolean'?{boolValue:value}:{stringValue:String(value??'')}}))});
export function profileRepository(env){
  const spreadsheetId=getPlatformSpreadsheetId(env),target={spreadsheetId};
  return {
    async load(){
      const sheets=await readGoogleSpreadsheetSheetProperties(env,{...target,includeGrid:true,includeTables:true});
      for(const name of BASE)if(!sheets.some(s=>s.title===name))throw problem(`The academy is missing ${name}. No profile records were changed.`,409);
      const names=[...BASE,...Object.keys(OPTIONAL).filter(name=>sheets.some(s=>s.title===name))];
      const raw=await batchReadGoogleSheetValues(env,names.map(name=>`'${name}'!A:ZZ`),target),tables={},headers={},rawTables={};
      names.forEach((name,i)=>{
        rawTables[name]=raw[i];
        headers[name]=raw[i][0];
        if(name==='AcademyAccessMatrix'){
          const columns=headers[name]||[];
          if(JSON.stringify(columns.slice(0,3))!==JSON.stringify(MATRIX_BASE)||new Set(columns).size!==columns.length||columns.slice(3).some(h=>! /^(SUBJECT|PROGRAM):[^:]+$/.test(h)))throw problem('The academy matrix headers are invalid. Keep the stable user and scope identifiers.',409);
          tables[name]=parseTable(raw[i],columns,name);
          for(const row of tables[name])for(const field of columns.slice(3))parseRoles(row[field]);
        }else tables[name]=OPTIONAL[name]?parseTable(raw[i],OPTIONAL[name],name):validatePlatformSheetRows(name,raw[i]);
        // Preserve physical row coordinates even when an administrator left a blank line.
        const rowNumbers=raw[i].slice(1).flatMap((row,index)=>row.some(value=>clean(value))?[index+2]:[]);
        tables[name].forEach((record,index)=>{record._rowNumber=rowNumbers[index];});
      });
      for(const [name,columns] of Object.entries(OPTIONAL))if(!tables[name]){tables[name]=[];headers[name]=columns;}
      for(const [name,field] of [['UserAccounts','AccountID'],['UserAccounts','UniqueID'],['UserCourseAccess','AccessID'],['GlobalSubjectAccessMatrix','AccountID'],['GlobalSubjectList','SubjectID'],['CourseRegistry','CourseID'],['AcademySubjectRoles','AssignmentID'],['AcademyProfileOperations','OperationID']])assertUnique(tables[name],field,name);
      for(const [name,field] of [['AcademyAccessMatrix','AccountID'],['AcademyAccessScopes','ScopeKey'],['AcademyAccessReview','ReviewID']])assertUnique(tables[name],field,name);
      for(const scope of tables.AcademyAccessScopes)if(!['FREE','PAID'].includes(scope.AccessModel)||scope.MigrationStage!=='SETUP'||!['CONFIRMED','REQUIRED'].includes(scope.ReviewStatus)||scope.ScopeKey!==`${scope.ScopeType}:${scope.ScopeID}`)throw problem('Review the academy scope settings before editing the matrix.',409);
      for(const review of tables.AcademyAccessReview)if(!['CONFIRMED','REQUIRED'].includes(review.ReviewStatus)||review.ReviewID!==`${review.AccountID}|${review.ScopeKey}`)throw problem('Review the academy import-review records before editing.',409);
      return {sheets,tables,headers,rawTables,academyPrepared:['AcademyAccessMatrix',...Object.keys(ACADEMY_HEADERS)].every(name=>sheets.some(s=>s.title===name))};
    },
    plan(data,changes,audit,receipt,options={}){
      const requests=[],guards=[],sheets=new Map(data.sheets.map(s=>[s.title,{...s}]));let nextId=Math.max(0,...data.sheets.map(s=>s.sheetId))+1;
      const allHeaders={...data.headers,AcademyAccessMatrix:options.matrixColumns||data.headers.AcademyAccessMatrix};
      const needed=new Set(['AcademyProfileOperations',...changes.map(c=>c.table),...(options.matrixColumns?Object.keys(ACADEMY_HEADERS).concat('AcademyAccessMatrix'):[])]);
      for(const name of needed)if(!sheets.has(name)){
        const headers=allHeaders[name];if(!headers)throw problem('Unknown profile storage.',409);
        const sheet={sheetId:nextId++,title:name,rowCount:1000};sheets.set(name,sheet);
        guards.push({table:name,sheetId:null});
        requests.push({addSheet:{properties:{sheetId:sheet.sheetId,title:name,gridProperties:{rowCount:1000,columnCount:Math.max(26,headers.length),frozenRowCount:1}}}},{updateCells:{start:{sheetId:sheet.sheetId,rowIndex:0,columnIndex:0},rows:[cells(headers)],fields:'userEnteredValue'}});
      }
      const originalMatrix=data.sheets.find(s=>s.title==='AcademyAccessMatrix'),oldColumns=data.headers.AcademyAccessMatrix;
      if(originalMatrix&&allHeaders.AcademyAccessMatrix.length>oldColumns.length){
        const added=allHeaders.AcademyAccessMatrix.slice(oldColumns.length);
        guards.push({table:'AcademyAccessMatrix',sheetId:originalMatrix.sheetId,headers:oldColumns.slice(),rowIndex:0,cells:[]});
        requests.push({appendDimension:{sheetId:originalMatrix.sheetId,dimension:'COLUMNS',length:added.length}},{updateCells:{start:{sheetId:originalMatrix.sheetId,rowIndex:0,columnIndex:oldColumns.length},rows:[cells(added)],fields:'userEnteredValue'}});
        const nativeTable=originalMatrix.tables?.find(t=>t.range.startRowIndex===0&&(t.range.startColumnIndex||0)===0&&t.range.endColumnIndex===oldColumns.length);
        if(nativeTable){
          const choices=['USER',...Array.from({length:15},(_,i)=>ROLES.filter((_,j)=>(i+1)&(1<<j)).join('|'))];
          requests.push({updateTable:{table:{tableId:nativeTable.tableId,range:{...nativeTable.range,endColumnIndex:allHeaders.AcademyAccessMatrix.length},columnProperties:[...nativeTable.columnProperties,...added.map((field,i)=>({columnIndex:oldColumns.length+i,columnName:field,columnType:'DROPDOWN',dataValidationRule:{condition:{type:'ONE_OF_LIST',values:choices.map(userEnteredValue=>({userEnteredValue}))}}}))]},fields:'range,columnProperties'}});
        }
      }
      const nextRows=new Map();
      for(const {table,record,fields} of [...changes,{table:'AcademyProfileOperations',record:receipt}]){
        const sheet=sheets.get(table),headers=allHeaders[table];
        if(!sheet||!headers)throw problem('Profile storage is not ready.',409);
        let rowIndex=record._rowNumber?record._rowNumber-1:nextRows.get(table)||Math.max(1,...data.tables[table].map(r=>r._rowNumber));
        if(!record._rowNumber)nextRows.set(table,rowIndex+1);
        // On recovery, refuse to replay old coordinates over moved/externally edited records.
        // Guard only identity and fields being written; never persist existing PIN credentials.
        const columns=record._rowNumber?[...new Set([0,...(fields||headers).map(field=>headers.indexOf(field))])]:null;
        guards.push({table,sheetId:data.sheets.find(s=>s.title===table)?.sheetId??null,headers:data.headers[table].slice(),rowIndex,
          cells:columns?.map(column=>({column,value:data.rawTables[table]?.[rowIndex]?.[column]??''}))||null});
        if(rowIndex>=sheet.rowCount){const length=Math.max(1000,rowIndex+1-sheet.rowCount);requests.push({appendDimension:{sheetId:sheet.sheetId,dimension:'ROWS',length}});sheet.rowCount+=length;}
        if(fields){for(const field of fields){const columnIndex=headers.indexOf(field);if(columnIndex<0)throw problem(`Missing profile field ${field}.`,409);requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex,columnIndex},rows:[cells([record[field]])],fields:'userEnteredValue'}});}}
        else {
          const row=cells(headers.map(h=>record[h]??(table==='GlobalSubjectAccessMatrix'?false:'')));
          if(table==='AcademyAccessMatrix')for(const field of ['UserName','Status'])row.values[headers.indexOf(field)]={userEnteredValue:{formulaValue:matrixFormula(field,rowIndex+1)}};
          requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex,columnIndex:0},rows:[row],fields:'userEnteredValue'}});
        }
      }
      requests.push({appendCells:{sheetId:sheets.get('PlatformAuditLog').sheetId,rows:[cells(PLATFORM_SHEET_HEADERS.PlatformAuditLog.map(h=>audit[h]))],fields:'userEnteredValue'}});
      return {spreadsheetId,requests,guards};
    },
    async apply(plan){
      if(plan.spreadsheetId!==spreadsheetId)throw problem('The academy spreadsheet mapping changed. Recover against the original academy.',409);
      const current=await this.load();
      for(const guard of plan.guards){
        const sheet=current.sheets.find(s=>s.title===guard.table),row=current.rawTables[guard.table]?.[guard.rowIndex]||[];
        const compatible=guard.sheetId===null?!sheet:sheet?.sheetId===guard.sheetId&&JSON.stringify(current.headers[guard.table])===JSON.stringify(guard.headers)
          &&(guard.cells?guard.cells.every(cell=>JSON.stringify(row[cell.column]??'')===JSON.stringify(cell.value)):!row.some(value=>clean(value)));
        if(!compatible)throw Object.assign(problem('The profile spreadsheet changed outside this save. The pending entry is kept. An academy administrator must review the changed rows before recovery.',503),{code:'PROFILE_STORAGE_CHANGED',retryable:false});
      }
      await batchUpdateGoogleSpreadsheet(env,plan.requests,target);
    }
  };
}
