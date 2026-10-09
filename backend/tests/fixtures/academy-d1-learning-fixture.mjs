import {readFileSync} from 'node:fs';
import {fixtureDatabase,setCell} from './academy-d1-fixture.mjs';
import {fixtureTab,PROGRAM_IDS} from './academy-migration-fixture.mjs';
import {buildOperationalImport} from '../../tools/academy-migration/operational.mjs';
import {buildLearningImport,importLearningPlan} from '../../tools/academy-migration/learning.mjs';
import {WEEKLY_SCHEMA} from '../../src/programs/weekly-timetable.js';
export const subject='PS-11111111-1111-4111-8111-111111111111',level='LVL-11111111-1111-4111-8111-111111111111',moduleId='MOD-11111111-1111-4111-8111-111111111111',resource='RES-11111111-1111-4111-8111-111111111111';
export const root='synthetic_root_1',fileId='synthetic_file_1',coverId='synthetic_cover_1';
export function withLearningSource(snapshot) {
  const tab=fixtureTab(snapshot,'ProgramManagementState',1),index=tab.rows[0].indexOf('SnapshotJSON'),state=JSON.parse(tab.rows[1][index]);
  state.ProgramSubjects=[{ProgramSubjectID:subject,CourseID:PROGRAM_IDS[0],SubjectID:'subject-1',Active:true}];
  state.ProgramLevels=[{LevelID:level,ProgramSubjectID:subject,Name:'First level',SortOrder:1,Active:true}];
  state.ProgramModules=[{ProgramModuleID:moduleId,ProgramSubjectID:subject,LevelID:level,Name:'First module',SortOrder:1,Active:true}];
  state.ProgramResources=[{ResourceID:resource,CourseID:PROGRAM_IDS[0],ProgramSubjectID:subject,LevelID:level,ProgramModuleID:moduleId,TaskID:'',ResourceType:'EBOOK',Name:'Synthetic book',Description:'',DriveFileID:fileId,CoverDriveFileID:coverId,Active:true}];
  state.ProgramLibraryRoots=[{FolderID:root,Name:'Synthetic Resources'}];
  const resources=fixtureTab(snapshot,'ProgramResources',1);resources.rows.push(resources.rows[0].map(h=>state.ProgramResources[0][h]??''));
  state.ProgramClasses[0].TeacherAccountID='account-0003';
  tab.rows[1][index]=JSON.stringify(state);
  setCell(snapshot,'ProgramTimetableState',1,'DraftJSON',JSON.stringify({format:WEEKLY_SCHEMA,timezone:'Africa/Johannesburg',rules:[]}),1);
}
export async function learningFixture(edit=()=>{}) {
  const f=await fixtureDatabase(12,s=>{withLearningSource(s);edit(s);});
  for(const name of ['0004_management_transactions.sql','0005_learning_workflows.sql'])f.db.exec(readFileSync(new URL('../../migrations/academy/'+name,import.meta.url),'utf8'));
  f.learning=buildLearningImport(f.snapshot,await buildOperationalImport(f.snapshot,f.policy));
  importLearningPlan(f.db,f.learning);return f;
}
