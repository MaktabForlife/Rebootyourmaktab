import { json } from '../lib/http.js';
import { listGoogleDriveFolder } from '../lib/google-drive.js';
import { problem, clean } from '../programs/model.js';
import { timetableUser, timetableProgram } from '../programs/timetable-context.js';
import { timetableRepository } from '../programs/timetable-repository.js';
import { managementState } from '../programs/management-model.js';
import { programFailure } from '../programs/errors.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import {
  buildDriveBreadcrumbs, createDriveAccessToken, deriveFileFormat,
  getDriveAccessTtlSeconds, getRootFolderId, getSupportedResourceTypes,
  requireItemInsideRoot
} from './drive-library.js';

async function inputJSON(request) {
  if(request.method!=='POST')throw problem('Use POST for Program Library.',405);
  const reader=request.body?.getReader();
  const decoder=new TextDecoder();let raw='',size=0;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw problem('Library request is too large.',413);}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();
  let input;try{input=JSON.parse(raw||'{}');}catch{throw problem('Invalid JSON request.');}
  if(!input||typeof input!=='object'||Array.isArray(input))throw problem('Invalid Library request.');
  return input;
}

export function programLibraryEndpoint(action){
  return async(request,env)=>{
    let stage='account';
    try{
      await timetableUser(request,env);
      const input=await inputJSON(request);
      stage='program';const program=await timetableProgram(env,input.id);
      const repository=timetableRepository(env,program);
      if(action==='upload-config'){
        const clientId=clean(env.M4L_GOOGLE_DRIVE_UPLOAD_CLIENT_ID);
        return json({success:true,clientId:/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)?clientId:''});
      }
      if(action==='browse'){
        stage='drive';
        const data=await repository.load(),roots=managementState(data,program).snapshot.ProgramLibraryRoots;
        const root=clean(input.rootId)||getRootFolderId(env),folderId=clean(input.folderId)||root;
        if(root!==getRootFolderId(env)&&!roots.some(item=>item.FolderID===root))throw problem('Choose a folder added to this Program Library.',403);
        let folder;
        try{folder=await requireItemInsideRoot(env,folderId,root,{requireFolder:true,allowRoot:true});}
        catch(error){
          if(/outside the configured|not found or is in Trash|not a folder/i.test(String(error.message)))throw problem('Choose a folder inside the selected Library folder.',400);
          throw error;
        }
        const listing=await listGoogleDriveFolder(env,folderId,{pageToken:clean(input.pageToken),pageSize:500});
        const breadcrumbs=await buildDriveBreadcrumbs(env,folder,root);
        const items=(listing.files||[]).map(file=>({
          id:clean(file.id),name:clean(file.name),isFolder:file.mimeType==='application/vnd.google-apps.folder',
          supportedTypes:getSupportedResourceTypes(file),format:deriveFileFormat(file.name,file.mimeType)
        })).filter(item=>item.id&&item.name).sort((a,b)=>Number(b.isFolder)-Number(a.isFolder)||a.name.localeCompare(b.name));
        return json({success:true,rootFolderId:root,folder:{id:folder.id,name:folder.name},breadcrumbs,items,nextPageToken:clean(listing.nextPageToken)});
      }
      if(action==='access'){
        stage='resource';const data=await repository.load();
        if(!data.prepared||!data.libraryPrepared)throw problem('Prepare the Program management and Library tables first.',409);
        const snapshot=managementState(data,program).snapshot;
        const matches=snapshot.ProgramResources.filter(r=>r.ResourceID===clean(input.resourceId));
        if(matches.length!==1||!active(matches[0].Active))throw problem('This resource is unavailable.',404);
        const resource=matches[0];
        const subject=snapshot.ProgramSubjects.find(r=>r.ProgramSubjectID===resource.ProgramSubjectID);
        const level=resource.LevelID?snapshot.ProgramLevels.find(r=>r.LevelID===resource.LevelID&&r.ProgramSubjectID===resource.ProgramSubjectID):null;
        const module=resource.ProgramModuleID?snapshot.ProgramModules.find(r=>r.ProgramModuleID===resource.ProgramModuleID&&r.ProgramSubjectID===resource.ProgramSubjectID):null;
        const task=resource.TaskID?snapshot.ProgramTasks.find(r=>r.TaskID===resource.TaskID&&r.ProgramSubjectID===resource.ProgramSubjectID&&r.ProgramModuleID===resource.ProgramModuleID):null;
        if(!subject||!active(subject.Active)||(resource.LevelID&&(!level||!active(level.Active)))||(resource.ProgramModuleID&&(!module||!active(module.Active)||module.LevelID!==resource.LevelID))||(resource.TaskID&&(!task||!active(task.Active))))throw problem('This resource is unavailable.',404);
        const shared=await repository.managementReferences(data);
        if(!shared.subjects.some(row=>row.SubjectID===subject.SubjectID&&active(row.Active)))throw problem('This resource is unavailable.',404);
        const file=await repository.verifyResource(resource,snapshot.ProgramLibraryRoots);
        const token=await createDriveAccessToken({fileId:file.id,resourceType:resource.ResourceType,resourceId:resource.ResourceID,courseId:program.id,filename:file.name,mimeType:file.mimeType},env);
        const expiresIn=getDriveAccessTtlSeconds(env);
        return json({success:true,url:`${new URL(request.url).origin}/api/library/drive/file/${encodeURIComponent(file.id)}?access=${encodeURIComponent(token)}`,expiresIn,filename:file.name,mimeType:file.mimeType,format:deriveFileFormat(file.name,file.mimeType)});
      }
      throw problem('Unknown Program Library action.',404);
    }catch(error){const result=programFailure(error,action,stage);return json(result,result.status);}
  };
}
