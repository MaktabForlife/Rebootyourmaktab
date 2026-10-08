import { batchReadGoogleSheetValues, batchUpdateGoogleSpreadsheet, readGoogleSpreadsheetSheetProperties } from '../lib/google-sheets.js';
import { readProgramRoleAccounts } from '../profiles/program-roles.js';
import { assertUnique, clean, parseTable, problem } from './model.js';
import { ATTENDANCE_HEADERS } from './attendance-model.js';
import { cells, timetableRepository } from './timetable-repository.js';

export function attendanceRepository(env,program) {
  const target={spreadsheetId:program.spreadsheetId},timetable=timetableRepository(env,program);
  const names=Object.keys(ATTENDANCE_HEADERS);
  async function sheets(){return readGoogleSpreadsheetSheetProperties(env,{...target,includeGrid:true});}
  return {
    timetable,
    accounts:()=>readProgramRoleAccounts(env,program.id),
    async prepare(){
      const existing=await sheets(),present=names.filter(name=>existing.some(sheet=>sheet.title===name));
      const raw=present.length?await batchReadGoogleSheetValues(env,present.map(name=>`'${name}'!A:ZZ`),target):[];
      const requests=[];let next=Math.max(0,...existing.map(sheet=>sheet.sheetId))+1;
      for(const name of names){
        const headers=ATTENDANCE_HEADERS[name],position=present.indexOf(name);
        let sheet=existing.find(row=>row.title===name);
        if(sheet&&raw[position].some(row=>row.some(clean))){parseTable(raw[position],headers,name);continue;}
        if(!sheet){sheet={sheetId:next++,title:name};requests.push({addSheet:{properties:{...sheet,gridProperties:{frozenRowCount:1}}}});}
        requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:0,columnIndex:0},rows:[cells(headers)],fields:'userEnteredValue'}});
      }
      if(requests.length)await batchUpdateGoogleSpreadsheet(env,requests,target);
    },
    async load(){
      const [source,properties]=await Promise.all([timetable.load(),sheets()]);
      const present=names.filter(name=>properties.some(sheet=>sheet.title===name));
      const raw=present.length?await batchReadGoogleSheetValues(env,present.map(name=>`'${name}'!A:ZZ`),target):[];
      const tables=Object.fromEntries(present.map((name,index)=>[name,parseTable(raw[index],ATTENDANCE_HEADERS[name],name)]));
      for(const name of present)assertUnique(tables[name],ATTENDANCE_HEADERS[name][0],name);
      return {source,properties,tables,prepared:present.length===names.length};
    },
    plan(data,items){
      if(!data.prepared)throw problem('Prepare Program attendance tables first.',409);
      const requests=[];
      for(const name of names){
        const records=items.filter(item=>item.table===name).map(item=>item.record);
        if(!records.length)continue;
        const sheet=data.properties.find(row=>row.title===name),rows=data.tables[name],headers=ATTENDANCE_HEADERS[name];
        const rowIndex=Math.max(0,...rows.map(row=>row._rowNumber-1))+1;
        if(rowIndex+records.length>sheet.rowCount)requests.push({appendDimension:{sheetId:sheet.sheetId,dimension:'ROWS',length:Math.max(1000,rowIndex+records.length-sheet.rowCount)}});
        requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex,columnIndex:0},rows:records.map(record=>cells(headers.map(header=>record[header]??''))),fields:'userEnteredValue'}});
      }
      return {spreadsheetId:program.spreadsheetId,requests};
    },
    async apply(plan){
      if(plan.spreadsheetId!==program.spreadsheetId)throw problem('Program mapping changed during attendance recovery.',409);
      await batchUpdateGoogleSpreadsheet(env,plan.requests,target);
    }
  };
}
