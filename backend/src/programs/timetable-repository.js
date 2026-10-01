import { readProgramRoleAccounts } from '../profiles/program-roles.js';
import { academySubjectRepository,subjectRevision } from './academy-subjects.js';
/* V105.2 — all timetable writes are planned inside the per-Program coordinator. */
import { batchReadGoogleSheetValues, batchUpdateGoogleSpreadsheet, readGoogleSpreadsheetSheetProperties } from '../lib/google-sheets.js';
import { readPlatformSheet } from '../lib/platform-sheet.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import { parseTable, assertUnique, problem, clean } from './model.js';
import { managementState } from './management-model.js';
import { TIMETABLE_HEADERS } from './timetable-model.js';
import { getResourceConfig, getRootFolderId, requireItemInsideRoot, validateFileForResourceType } from '../routes/drive-library.js';
const LIBRARY_TABLES=['ProgramTasks','ProgramResources'];
export const cells = values => ({ values:values.map(value=>({ userEnteredValue:typeof value==='boolean'?{boolValue:value}:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')} })) });
export function timetableRepository(env, program) {
  const target={spreadsheetId:program.spreadsheetId};
  const properties=()=>readGoogleSpreadsheetSheetProperties(env,{...target,includeGrid:true});
  const read=names=>batchReadGoogleSheetValues(env,names.map(name=>`'${name}'!A:ZZ`),target);
  async function subjectReferences(data) {
    const {subjects}=await academySubjectRepository(env).load();
    const academy=await Promise.all(subjects.map(async r=>({SubjectID:r.SubjectID,SubjectName:r.SubjectName,Active:active(r.Active),Legacy:false,Revision:await subjectRevision(r)})));
    const links=data?.tables?.ProgramSubjects||[];
    const legacyIds=links.filter(r=>!academy.some(s=>s.SubjectID===r.SubjectID)).map(r=>r.SubjectID);
    const legacy=legacyIds.length?await readPlatformSheet(env,'GlobalSubjectList'):[];
    return [...academy,...[...new Set(legacyIds)].map(id=>{const row=legacy.find(s=>s.SubjectID===id);return {SubjectID:id,SubjectName:row?.SubjectName||id,Active:Boolean(row)&&active(row.Active),Legacy:true};})];
  }
  async function prepareNamed(names) {
    const sheets=await properties(),existing=names.filter(name=>sheets.some(s=>s.title===name));
    const values=existing.length?await read(existing):[];
    const requests=[];let next=Math.max(0,...sheets.map(s=>s.sheetId))+1;
    for(const name of names){
      const headers=TIMETABLE_HEADERS[name];let sheet=sheets.find(s=>s.title===name);
      if(sheet){const rows=values[existing.indexOf(name)];if(rows.some(row=>row.some(clean))){parseTable(rows,headers,name);continue;}}
      else{sheet={sheetId:next++,title:name};requests.push({addSheet:{properties:{...sheet,gridProperties:{frozenRowCount:1}}}});}
      requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:0,columnIndex:0},rows:[cells(headers)],fields:'userEnteredValue'}});
    }
    if(requests.length)await batchUpdateGoogleSpreadsheet(env,requests,target);
  }
  return {
    async verifyResource(record) {
      const config=getResourceConfig(record.ResourceType);
      if(!config)throw problem('Choose a Library resource type.');
      let file;
      try{file=await requireItemInsideRoot(env,record.DriveFileID,getRootFolderId(env),{requireFile:true});}
      catch(error){
        if(/outside the configured|not found or is in Trash|not a folder|Select a file/i.test(String(error.message)))throw problem('Choose a downloadable file inside the configured protected Drive folder.');
        throw error;
      }
      const checked=validateFileForResourceType(file,config);
      if(!checked.ok)throw problem(checked.error);
      return file;
    },
    prepare:()=>prepareNamed(Object.keys(TIMETABLE_HEADERS)),
    prepareLibrary:()=>prepareNamed(LIBRARY_TABLES),
    async load() {
      const sheets=await properties();
      const names=Object.keys(TIMETABLE_HEADERS), present=names.filter(name=>sheets.some(s=>s.title===name));
      const raw=present.length?await read(present):[];
      const tables=Object.fromEntries(present.map((name,i)=>[name,parseTable(raw[i],TIMETABLE_HEADERS[name],name)]));
      for (const name of present) assertUnique(tables[name],TIMETABLE_HEADERS[name][0],name);
      const data={prepared:names.filter(name=>!LIBRARY_TABLES.includes(name)).every(name=>present.includes(name)),libraryPrepared:LIBRARY_TABLES.every(name=>present.includes(name)),tables,sheets};
      if(tables.ProgramManagementState?.length)Object.assign(tables,managementState(data,program).snapshot);
      return data;
    },
    async managementReferences(data) {
      const [subjects,accounts]=await Promise.all([subjectReferences(data),readProgramRoleAccounts(env,program.id)]);
      assertUnique(subjects,'SubjectID','Shared subjects');assertUnique(accounts,'AccountID','Accounts');
      return {
        subjects,
        accounts,
        grantedTeachers:accounts.filter(r=>r.Active&&r.Roles.some(role=>['TEACHER','SENIOR','ADMIN'].includes(role))).map(r=>({AccountID:r.AccountID}))
      };
    },
    async catalog(data) {
      const [subjects,accounts]=await Promise.all([subjectReferences(data),readProgramRoleAccounts(env,program.id)]);
      assertUnique(subjects,'SubjectID','Shared subjects'); assertUnique(accounts,'AccountID','Accounts');
      const t=data.tables;
      assertUnique(t.ProgramSubjects||[],'SubjectID','Program subject links');
      return {
        subjects:(t.ProgramSubjects||[]).map(row=>{const shared=subjects.find(s=>s.SubjectID===row.SubjectID);return {id:row.ProgramSubjectID,courseId:row.CourseID,subjectId:row.SubjectID,name:shared?.SubjectName||row.SubjectID,active:active(row.Active)&&Boolean(shared)&&active(shared.Active)};}),
        levels:(t.ProgramLevels||[]).map(row=>({id:row.LevelID,programSubjectId:row.ProgramSubjectID,name:row.Name,active:active(row.Active)})),
        modules:(t.ProgramModules||[]).map(row=>({id:row.ProgramModuleID,programSubjectId:row.ProgramSubjectID,levelId:row.LevelID,name:row.Name,active:active(row.Active)})),
        classes:(t.ProgramClasses||[]).map(row=>({id:row.ClassID,courseId:row.CourseID,name:row.Name,academicYear:row.AcademicYear,zoomLink:row.ZoomLink||'',active:active(row.Active)})),
        teachers:accounts.filter(row=>row.Active&&row.Roles.some(role=>['TEACHER','SENIOR','ADMIN'].includes(role))).map(row=>({id:row.AccountID,name:row.DisplayName,active:true})),
        enrollments:(t.ProgramEnrollments||[]).map(row=>({id:row.EnrollmentID,courseId:row.CourseID,classId:row.ClassID,accountId:row.AccountID,startDate:row.StartDate,endDate:row.EndDate,active:active(row.Active)}))
      };
    },
    plan(data, records) {
      const growth=[];
      const requests=records.map(({table,record})=>{
        const headers=TIMETABLE_HEADERS[table], rows=data.tables[table];
        const previous=rows.find(row=>row[headers[0]]===record[headers[0]]);
        const rowIndex=previous?previous._rowNumber-1:Math.max(0,...rows.map(row=>row._rowNumber-1))+1;
        const sheet=data.sheets.find(s=>s.title===table);
        if(rowIndex>=sheet.rowCount) growth.push({appendDimension:{sheetId:sheet.sheetId,dimension:'ROWS',length:Math.max(1000,rowIndex-sheet.rowCount+1)}});
        return {updateCells:{start:{sheetId:sheet.sheetId,rowIndex,columnIndex:0},rows:[cells(headers.map(h=>record[h]??''))],fields:'userEnteredValue'}};
      });
      // Fixed coordinates make an uncertain external response safely replayable.
      return {spreadsheetId:program.spreadsheetId,requests:[...growth,...requests]};
    },
    async apply(plan) {
      if (plan.spreadsheetId!==program.spreadsheetId) throw problem('Program mapping changed during recovery. Administrator repair is required.',409);
      await batchUpdateGoogleSpreadsheet(env,plan.requests,target);
    }
  };
}
