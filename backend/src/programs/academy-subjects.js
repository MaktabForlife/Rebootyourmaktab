import { batchReadGoogleSheetValues, readGoogleSheetValues, readGoogleSpreadsheetSheetProperties, batchUpdateGoogleSpreadsheet } from '../lib/google-sheets.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import { parseTable, assertUnique, clean, problem } from './model.js';
import { payloadHash } from './timetable-model.js';

export const ACADEMY_SUBJECT_HEADERS = {
  AcademySubjectList:['SubjectID','SubjectName','Active','CreatedDate','CreatedByAccountID'],
  AcademySubjectOperations:['OperationID','PayloadHash','ResultJSON','DateStamp','AccountID','SourceSpreadsheetID','SourceSubjectsJSON']
};
export const subjectKey = name => clean(name).normalize('NFKC').replace(/\s+/gu,' ').toLowerCase();
export function subjectName(value) {
  if(typeof value!=='string'||!subjectKey(value)||value.trim().length>160)throw problem('Enter a subject name (up to 160 characters).');
  return value.trim().normalize('NFC').replace(/\s+/gu,' ');
}
const cells=values=>({values:values.map(value=>({userEnteredValue:typeof value==='boolean'?{boolValue:value}:{stringValue:String(value??'')}}))});
export function academySubjectRepository(env) {
  const spreadsheetId=getPlatformSpreadsheetId(env),target={spreadsheetId};
  async function load() {
    const sheets=await readGoogleSpreadsheetSheetProperties(env,{...target,includeGrid:true});
    const present=Object.keys(ACADEMY_SUBJECT_HEADERS).filter(name=>sheets.some(s=>s.title===name));
    const raw=present.length?await batchReadGoogleSheetValues(env,present.map(n=>`'${n}'!A:ZZ`),target):[];
    const tables=Object.fromEntries(present.map((n,i)=>[n,parseTable(raw[i],ACADEMY_SUBJECT_HEADERS[n],n)]));
    for(const name of present)assertUnique(tables[name],ACADEMY_SUBJECT_HEADERS[name][0],name);
    const subjects=tables.AcademySubjectList||[];
    if(new Set(subjects.map(r=>subjectKey(r.SubjectName))).size!==subjects.length)throw problem('Academy subjects contain duplicate names. Ask an administrator to repair the catalogue.',409);
    return {sheets,tables,subjects,prepared:present.length===2};
  }
  return {
    load,
    async prepare() {
      const data=await load(),requests=[];
      let id=Math.max(0,...data.sheets.map(s=>s.sheetId))+1;
      for(const [name,headers] of Object.entries(ACADEMY_SUBJECT_HEADERS))if(!data.sheets.some(s=>s.title===name)) {
        const sheetId=id++;
        requests.push({addSheet:{properties:{sheetId,title:name,gridProperties:{frozenRowCount:1}}}},{updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:[cells(headers)],fields:'userEnteredValue'}});
      }
      if(requests.length)await batchUpdateGoogleSpreadsheet(env,requests,target);
    },
    async rebootSubjects() {
      const sourceId=clean(env.GOOGLE_SPREADSHEET_ID);
      if(!sourceId||sourceId===spreadsheetId)throw problem('The Development Reboot spreadsheet is not configured separately.',409);
      const raw=await readGoogleSheetValues(env,"'SubjectList'!A:ZZ",{spreadsheetId:sourceId});
      const headers=raw[0]||[],id=headers.indexOf('SubjectID'),name=headers.indexOf('SubjectName'),enabled=headers.indexOf('Active');
      if(id<0||name<0||enabled<0)throw problem('Reboot SubjectList needs SubjectID, SubjectName and Active columns.',409);
      const subjects=raw.slice(1).filter(row=>row.some(clean)).map(row=>({SourceSubjectID:clean(row[id]),SubjectName:subjectName(row[name]),Active:active(row[enabled])}));
      assertUnique(subjects,'SourceSubjectID','Reboot subjects');
      return {sourceId,subjects,revision:await payloadHash({sourceId,subjects})};
    },
    plan(data,subjects,receipt) {
      const requests=[];
      for(const [name,records] of [['AcademySubjectList',subjects],['AcademySubjectOperations',[receipt]]]) {
        if(!records.length)continue;
        const rows=data.tables[name]||[],sheet=data.sheets.find(s=>s.title===name);
        const rowIndex=Math.max(0,...rows.map(r=>r._rowNumber-1))+1;
        if(rowIndex+records.length>sheet.rowCount)requests.push({appendDimension:{sheetId:sheet.sheetId,dimension:'ROWS',length:Math.max(1000,rowIndex+records.length-sheet.rowCount)}});
        requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex,columnIndex:0},rows:records.map(r=>cells(ACADEMY_SUBJECT_HEADERS[name].map(h=>r[h]))),fields:'userEnteredValue'}});
      }
      return {spreadsheetId,requests};
    },
    async apply(plan) {
      if(plan.spreadsheetId!==spreadsheetId)throw problem('Academy spreadsheet mapping changed. Recover with the original mapping.',409);
      await batchUpdateGoogleSpreadsheet(env,plan.requests,target);
    }
  };
}
export function academySubjectService(repository) {
  return {
    prepare:()=>repository.prepare(),
    async read(action) {
      const data=await repository.load();
      const subjects=data.subjects.map(r=>({SubjectID:r.SubjectID,SubjectName:r.SubjectName,Active:active(r.Active)}));
      if(action==='import-preview') {
        const source=await repository.rebootSubjects();
        return {...source,subjects:source.subjects.map(r=>({...r,existing:subjects.find(s=>subjectKey(s.SubjectName)===subjectKey(r.SubjectName))||null}))};
      }
      return {subjects};
    },
    async receipt(operationId,hash) {
      const data=await repository.load(),row=(data.tables.AcademySubjectOperations||[]).find(r=>r.OperationID===operationId);
      if(!row)return null;
      if(row.PayloadHash!==hash)throw problem('This retry identifier belongs to different subject changes.',409);
      return {...JSON.parse(row.ResultJSON),replayed:true};
    },
    async plan(action,input,user,hash) {
      if(action!=='save')throw problem('Unknown subject action.');
      let names,source;
      if(input.mode==='import') {
        source=await repository.rebootSubjects();
        if(input.sourceRevision!==source.revision)throw problem('Reboot subjects changed. Review the import again before saving.',409);
        if(!Array.isArray(input.sourceIds)||!input.sourceIds.length||input.sourceIds.length>250||new Set(input.sourceIds).size!==input.sourceIds.length)throw problem('Select between 1 and 250 different Reboot subjects.');
        names=input.sourceIds.map(id=>{const row=source.subjects.find(r=>r.SourceSubjectID===id&&r.Active);if(!row)throw problem('Select only active subjects from the reviewed Reboot list.');return row.SubjectName;});
      } else if(input.mode==='create')names=[subjectName(input.subjectName)];
      else throw problem('Choose create or import subjects.');
      await repository.prepare();
      const data=await repository.load(),added=[],matched=[],timestamp=new Date().toISOString();
      for(const name of names) {
        let row=[...data.subjects,...added].find(r=>subjectKey(r.SubjectName)===subjectKey(name));
        if(row&&!active(row.Active))throw problem(`“${row.SubjectName}” is archived in the Academy catalogue. Ask an administrator to review it.`,409);
        if(!row){row={SubjectID:`AS-${crypto.randomUUID()}`,SubjectName:name,Active:true,CreatedDate:timestamp,CreatedByAccountID:user.accountid};added.push(row);}
        matched.push({SubjectID:row.SubjectID,SubjectName:row.SubjectName,Active:true});
      }
      const result=input.mode==='create'?{subject:matched[0]}:{imported:added.length,reused:matched.length-added.length,subjects:matched};
      const receipt={OperationID:input.operationId,PayloadHash:hash,ResultJSON:JSON.stringify(result),DateStamp:timestamp,AccountID:user.accountid,SourceSpreadsheetID:source?.sourceId||'',SourceSubjectsJSON:source?JSON.stringify(input.sourceIds.map((id,i)=>({SourceSubjectID:id,SubjectID:matched[i].SubjectID}))):''};
      if(receipt.ResultJSON.length>40000||receipt.SourceSubjectsJSON.length>40000)throw problem('Select fewer subjects for this import.');
      return {plan:repository.plan(data,added,receipt),result};
    },
    apply:plan=>repository.apply(plan)
  };
}
