import assert from 'node:assert/strict';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
import { applyManagementChange, managementState } from '../src/programs/management-model.js';

const f=timetableFixture();
let fileAvailable=true;
f.repository.verifyResource=async row=>{if(!fileAvailable||row.DriveFileID==='outside-root')throw new Error('File is outside the protected Drive root.');return {id:row.DriveFileID};};
const service=timetableService(f.repository,f.program);
const coordinator=timetableCoordinator(f.journal,async()=>({service,user:{accountid:'ADMIN'}}));
const view=()=>service.read('manage-get');
const save=async(record,creating=true)=>{
  const current=await view();
  return coordinator.run('manage-save',{id:f.program.id,kind:'resources',record,creating,revision:current.revision,
    baseRowRevision:current.rowRevisions.resources[record.ResourceID]||current.emptyRowRevision,operationId:crypto.randomUUID()},'token');
};
const saveTask=async(record,creating=true)=>{
  const current=await view();
  return coordinator.run('manage-save',{id:f.program.id,kind:'tasks',record,creating,revision:current.revision,
    baseRowRevision:current.rowRevisions.tasks[record.TaskID]||current.emptyRowRevision,operationId:crypto.randomUUID()},'token');
};
const resource={ResourceID:'RES-1',ProgramSubjectID:'PS-TAFSEER',LevelID:'',ProgramModuleID:'MOD-DEMO',ResourceType:'EBOOK',Name:'Demo book',Description:'A protected PDF',DriveFileID:'demo-file',Active:true};
f.setLibraryPrepared(false);
await assert.rejects(save(resource),/Prepare the Program task and Library tables/);
assert.deepEqual(await coordinator.run('prepare-library',{id:f.program.id},'token'),{libraryPrepared:true});
assert.equal((await view()).libraryPrepared,true);
await assert.rejects(save({...resource,DriveFileID:'outside-root'}),/outside the protected Drive root/);
assert.equal((await view()).rows.resources.length,0);
await save(resource);
assert.equal((await view()).rows.resources.length,1);
assert.equal(f.tables.ProgramManagementState.length,0,'Resource rows do not consume the bounded curriculum snapshot');
const task={TaskID:'TASK-1',ProgramSubjectID:'PS-TAFSEER',ProgramModuleID:'MOD-DEMO',Name:'Read chapter',SortOrder:1,Active:true};
await saveTask(task);
await assert.rejects(saveTask({...task,TaskID:'TASK-2'}),/task already exists/);
await assert.rejects(saveTask({...task,TaskID:'TASK-2',ProgramModuleID:'MOD-OTHER'}),/task module must belong/);
await save({...resource,TaskID:'TASK-1'},false);
await assert.rejects(saveTask({...task,Active:false},false),/dependent rows/);
await assert.rejects(save({...resource,TaskID:'TASK-OTHER'},false),/resource task must belong/);
await assert.rejects(save({...resource,ResourceID:'RES-2'}),/already in this Library location/);
await assert.rejects(save({...resource,ResourceID:'RES-2',ProgramSubjectID:'PS-OTHER'}),/active subject/);
await assert.rejects(save({...resource,ResourceID:'RES-2',LevelID:'LVL-OTHER'}),/level must belong/);
await assert.rejects(save({...resource,ResourceID:'RES-2',ResourceType:'SCRIPT'}),/resource type/);
await assert.rejects(save({...resource,ResourceID:'RES-2',ProgramModuleID:'MOD-OTHER'}),/module must belong/);
const state=managementState(await f.repository.load(),f.program),refs=await f.repository.managementReferences();
assert.throws(()=>applyManagementChange(state,{kind:'modules',creating:false,record:{...state.snapshot.ProgramModules[0],Active:false}},refs,f.program),/dependent rows/);
assert.throws(()=>applyManagementChange(state,{kind:'modules',creating:false,record:{...state.snapshot.ProgramModules[0],LevelID:'standard:Beginner'}},refs,f.program),/linked tasks and resources/);
fileAvailable=false;
await save({...resource,Active:false},false);
assert.equal((await view()).rows.resources[0].Active,false);
fileAvailable=true;
const second={...resource,ResourceID:'RES-SECOND',DriveFileID:'second-file',ResourceType:'AUDIO'};
const current=await view();
const input={id:f.program.id,kind:'resources',record:second,creating:true,revision:current.revision,
  baseRowRevision:current.emptyRowRevision,operationId:crypto.randomUUID()};
f.failNext('after');
await assert.rejects(coordinator.run('manage-save',input,'token'),/Injected lost response/);
assert((await coordinator.run('manage-save',input,'token')).replayed);
assert.equal((await view()).rows.resources.filter(r=>r.ResourceID==='RES-SECOND').length,1);
console.log('Program Library: task structure, resource scope, protected file validation, duplicate placement, archive dependencies and retry recovery passed.');
