import { academySubjectRepository } from './academy-subjects.js';
/* V105.2 — all timetable writes are planned inside the per-Program coordinator. */
import { batchReadGoogleSheetValues, batchUpdateGoogleSpreadsheet, readGoogleSpreadsheetSheetProperties } from '../lib/google-sheets.js';
import { readPlatformSheet } from '../lib/platform-sheet.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import { parseTable, assertUnique, problem, clean } from './model.js';
import { managementState } from './management-model.js';
import { TIMETABLE_HEADERS } from './timetable-model.js';
export const cells = values => ({ values:values.map(value=>({ userEnteredValue:typeof value==='boolean'?{boolValue:value}:typeof value==='number'?{numberValue:value}:{stringValue:String(value??'')} })) });
export function timetableRepository(env, program) {
  const target={spreadsheetId:program.spreadsheetId};
  const properties=()=>readGoogleSpreadsheetSheetProperties(env,{...target,includeGrid:true});
  const read=names=>batchReadGoogleSheetValues(env,names.map(name=>`'${name}'!A:ZZ`),target);
  async function subjectReferences(data) {
    const {subjects}=await academySubjectRepository(env).load();
    const academy=subjects.map(r=>({SubjectID:r.SubjectID,SubjectName:r.SubjectName,Active:active(r.Active),Legacy:false}));
    const links=data?.tables?.ProgramSubjects||[];
    const legacyIds=links.filter(r=>!academy.some(s=>s.SubjectID===r.SubjectID)).map(r=>r.SubjectID);
    const legacy=legacyIds.length?await readPlatformSheet(env,'GlobalSubjectList'):[];
    return [...academy,...[...new Set(legacyIds)].map(id=>{const row=legacy.find(s=>s.SubjectID===id);return {SubjectID:id,SubjectName:row?.SubjectName||id,Active:Boolean(row)&&active(row.Active),Legacy:true};})];
  }
  return {
    async prepare() {
      const sheets=await properties(), existing=Object.keys(TIMETABLE_HEADERS).filter(name=>sheets.some(s=>s.title===name));
      const values=existing.length?await read(existing):[];
      const requests=[]; let next=Math.max(0,...sheets.map(s=>s.sheetId))+1;
      for (const [name,headers] of Object.entries(TIMETABLE_HEADERS)) {
        let sheet=sheets.find(s=>s.title===name);
        if (sheet) {
          const rows=values[existing.indexOf(name)];
          if (rows.some(row=>row.some(clean))) { parseTable(rows,headers,name); continue; }
        } else { sheet={sheetId:next++,title:name}; requests.push({addSheet:{properties:{...sheet,gridProperties:{frozenRowCount:1}}}}); }
        requests.push({updateCells:{start:{sheetId:sheet.sheetId,rowIndex:0,columnIndex:0},rows:[cells(headers)],fields:'userEnteredValue'}});
      }
      if (requests.length) await batchUpdateGoogleSpreadsheet(env,requests,target);
    },
    async load() {
      const sheets=await properties();
      const names=Object.keys(TIMETABLE_HEADERS), present=names.filter(name=>sheets.some(s=>s.title===name));
      const raw=present.length?await read(present):[];
      const tables=Object.fromEntries(present.map((name,i)=>[name,parseTable(raw[i],TIMETABLE_HEADERS[name],name)]));
      for (const name of present) assertUnique(tables[name],TIMETABLE_HEADERS[name][0],name);
      const data={prepared:present.length===names.length,tables,sheets};
      if(tables.ProgramManagementState?.length)Object.assign(tables,managementState(data,program).snapshot);
      return data;
    },
    async managementReferences(data) {
      const [subjects,accounts,access]=await Promise.all([subjectReferences(data),readPlatformSheet(env,'UserAccounts'),readPlatformSheet(env,'UserCourseAccess')]);
      assertUnique(subjects,'SubjectID','Shared subjects');assertUnique(accounts,'AccountID','Accounts');
      return {
        subjects,
        accounts:accounts.map(r=>({AccountID:r.AccountID,DisplayName:r.DisplayName,Active:active(r.Active)})),
        grantedTeachers:accounts.filter(r=>active(r.Active)&&access.some(a=>a.AccountID===r.AccountID&&a.CourseID===program.id&&active(a.Active)&&['TEACHER','SENIOR','ADMIN'].includes(a.Role))).map(r=>({AccountID:r.AccountID}))
      };
    },
    async catalog(data) {
      const [subjects,accounts,access]=await Promise.all([subjectReferences(data),readPlatformSheet(env,'UserAccounts'),readPlatformSheet(env,'UserCourseAccess')]);
      assertUnique(subjects,'SubjectID','Shared subjects'); assertUnique(accounts,'AccountID','Accounts');
      const t=data.tables;
      assertUnique(t.ProgramSubjects||[],'SubjectID','Program subject links');
      return {
        subjects:(t.ProgramSubjects||[]).map(row=>{const shared=subjects.find(s=>s.SubjectID===row.SubjectID);return {id:row.ProgramSubjectID,courseId:row.CourseID,subjectId:row.SubjectID,name:shared?.SubjectName||row.SubjectID,active:active(row.Active)&&Boolean(shared)&&active(shared.Active)};}),
        levels:(t.ProgramLevels||[]).map(row=>({id:row.LevelID,programSubjectId:row.ProgramSubjectID,name:row.Name,active:active(row.Active)})),
        modules:(t.ProgramModules||[]).map(row=>({id:row.ProgramModuleID,programSubjectId:row.ProgramSubjectID,levelId:row.LevelID,name:row.Name,active:active(row.Active)})),
        classes:(t.ProgramClasses||[]).map(row=>({id:row.ClassID,courseId:row.CourseID,name:row.Name,academicYear:row.AcademicYear,active:active(row.Active)})),
        teachers:accounts.filter(row=>active(row.Active)&&((t.ProgramTeachers||[]).some(a=>a.AccountID===row.AccountID) ? active(t.ProgramTeachers.find(a=>a.AccountID===row.AccountID).Active) : access.some(a=>a.AccountID===row.AccountID&&a.CourseID===program.id&&active(a.Active)&&['TEACHER','SENIOR','ADMIN'].includes(a.Role)))).map(row=>({id:row.AccountID,name:row.DisplayName,active:true})),
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
