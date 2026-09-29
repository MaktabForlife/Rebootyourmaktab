import { batchReadGoogleSheetValues, readGoogleSpreadsheetSheetProperties, batchUpdateGoogleSpreadsheet } from '../lib/google-sheets.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { PLATFORM_SHEET_HEADERS, validatePlatformSheetRows } from '../lib/platform-schema.js';
import { DEFINITION_HEADERS, parseTable, assertUnique, clean, problem } from '../programs/model.js';
import { PROFILE_HEADERS } from './model.js';
const BASE=['UserAccounts','UserCourseAccess','GlobalSubjectAccessMatrix','GlobalSubjectList','GlobalSubjectAccessPolicy','CourseRegistry','PlatformAuditLog'];
const OPTIONAL={...PROFILE_HEADERS,ProgramDefinitions:DEFINITION_HEADERS};
const cells=values=>({values:values.map(value=>({userEnteredValue:typeof value==='boolean'?{boolValue:value}:{stringValue:String(value??'')}}))});
export function profileRepository(env){
  const spreadsheetId=getPlatformSpreadsheetId(env),target={spreadsheetId};
  return {
    async load(){
      const sheets=await readGoogleSpreadsheetSheetProperties(env,{...target,includeGrid:true});
      for(const name of BASE)if(!sheets.some(s=>s.title===name))throw problem(`The academy is missing ${name}. No profile records were changed.`,409);
      const names=[...BASE,...Object.keys(OPTIONAL).filter(name=>sheets.some(s=>s.title===name))];
      const raw=await batchReadGoogleSheetValues(env,names.map(name=>`'${name}'!A:ZZ`),target),tables={},headers={},rawTables={};
      names.forEach((name,i)=>{
        rawTables[name]=raw[i];
        headers[name]=raw[i][0];
        tables[name]=OPTIONAL[name]?parseTable(raw[i],OPTIONAL[name],name):validatePlatformSheetRows(name,raw[i]);
        // Preserve physical row coordinates even when an administrator left a blank line.
        const rowNumbers=raw[i].slice(1).flatMap((row,index)=>row.some(value=>clean(value))?[index+2]:[]);
        tables[name].forEach((record,index)=>{record._rowNumber=rowNumbers[index];});
      });
      for(const [name,columns] of Object.entries(OPTIONAL))if(!tables[name]){tables[name]=[];headers[name]=columns;}
      for(const [name,field] of [['UserAccounts','AccountID'],['UserAccounts','UniqueID'],['UserCourseAccess','AccessID'],['GlobalSubjectAccessMatrix','AccountID'],['GlobalSubjectList','SubjectID'],['CourseRegistry','CourseID'],['AcademySubjectRoles','AssignmentID'],['AcademyProfileOperations','OperationID']])assertUnique(tables[name],field,name);
      return {sheets,tables,headers,rawTables};
    },
    plan(data,changes,audit,receipt){
      const requests=[],guards=[],sheets=new Map(data.sheets.map(s=>[s.title,{...s}]));let nextId=Math.max(0,...data.sheets.map(s=>s.sheetId))+1;
      for(const [name,headers] of Object.entries(PROFILE_HEADERS))if(!sheets.has(name)){
        const sheet={sheetId:nextId++,title:name,rowCount:1000};sheets.set(name,sheet);
        requests.push({addSheet:{properties:{sheetId:sheet.sheetId,title:name,gridProperties:{rowCount:1000,columnCount:26,frozenRowCount:1}}}},{updateCells:{start:{sheetId:sheet.sheetId,rowIndex:0,columnIndex:0},rows:[cells(headers)],fields:'userEnteredValue'}});
      }
      const nextRows=new Map();
      for(const {table,record,fields} of [...changes,{table:'AcademyProfileOperations',record:receipt}]){
        const sheet=sheets.get(table),headers=data.headers[table];
        if(!sheet||!headers)throw problem('Profile storage is not ready.',409);
        let rowIndex=record._rowNumber?record._rowNumber-1:nextRows.get(table)||Math.max(1,...data.tables[table].map(r=>r._rowNumber));
        if(!record._rowNumber)nextRows.set(table,rowIndex+1);
        // On recovery, refuse to replay old coordinates over moved/externally edited records.
        // Guard only identity and fields being written; never persist existing PIN credentials.
        const columns=record._rowNumber?[...new Set([0,...(fields||headers).map(field=>headers.indexOf(field))])]:null;
        guards.push({table,sheetId:data.sheets.find(s=>s.title===table)?.sheetId??null,headers:headers.slice(),rowIndex,
          cells:columns?.map(column=>({column,value:data.rawTables[table]?.[rowIndex]?.[column]??''}))||null});
        if(rowIndex>=sheet.rowCount){const length=Math.max(1000,rowIndex+1-sheet.rowCount);requests.push({appendDimension:{sheetId:sheet.sheetId,dimension:'ROWS',length}});sheet.rowCount+=length;}
        if(fields){for(const field of fields){const columnIndex=headers.indexOf(field);if(columnIndex<0)throw problem(`Missing profile field ${field}.`,409);requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex,columnIndex},rows:[cells([record[field]])],fields:'userEnteredValue'}});}}
        else requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex,columnIndex:0},rows:[cells(headers.map(h=>record[h]??(table==='GlobalSubjectAccessMatrix'?false:'')))],fields:'userEnteredValue'}});
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
