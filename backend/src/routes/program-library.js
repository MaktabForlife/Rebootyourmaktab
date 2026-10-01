import { json } from '../lib/http.js';
import { startLibraryUpload, openLibraryUploadTicket, forwardLibraryUploadChunk, LIBRARY_UPLOAD_CHUNK_SIZE } from '../lib/library-upload-bridge.js';
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
      const user=await timetableUser(request,env);
      if(action==='upload-chunk'){
        stage='upload';
        if(request.method!=='POST')throw problem('Use POST for Library uploads.',405);
        const ticket=await openLibraryUploadTicket(env,request.headers.get('X-Library-Upload-Ticket'));
        if(!ticket||ticket.accountId!==user.accountid)throw problem('This upload session has expired. Choose the file again.',401);
        const program=await timetableProgram(env,ticket.programId);
        if(program.status!=='DRAFT')throw problem('Archived Programs cannot accept uploads.',409);
        const offset=Number(request.headers.get('X-Library-Upload-Offset'));
        if(!Number.isSafeInteger(offset)||offset<0||offset>=ticket.size)throw problem('Invalid upload position. Start this upload again.');
        if(Number(request.headers.get('Content-Length'))>LIBRARY_UPLOAD_CHUNK_SIZE)throw problem('Upload chunk is too large.',413);
        const reader=request.body?.getReader();if(!reader)throw problem('Choose a file to upload.');
        const chunks=[];let length=0;
        while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>LIBRARY_UPLOAD_CHUNK_SIZE){await reader.cancel();throw problem('Upload chunk is too large.',413);}chunks.push(value);}
        if(!length||offset+length>ticket.size)throw problem('Invalid upload chunk size.');
        const bytes=new Uint8Array(length);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
        return json({success:true,...await forwardLibraryUploadChunk(ticket,offset,bytes)});
      }
      const input=await inputJSON(request);
      stage='program';const program=await timetableProgram(env,input.id);
      const repository=timetableRepository(env,program);
      if(action==='upload-start'){
        stage='upload';
        if(program.status!=='DRAFT')throw problem('Archived Programs cannot accept uploads.',409);
        if(!clean(env.APPS_SCRIPT_URL))throw problem('Library device upload needs the Development Apps Script connection.',503);
        if(clean(env.M4L_LIBRARY_BRIDGE_SECRET).length<32)throw problem('Library device upload needs its shared secret configured in the Worker and Apps Script.',503);
        const data=await repository.load();
        if(!data.prepared||!data.libraryPrepared)throw problem('Prepare the Program Library tables first.',409);
        const roots=managementState(data,program).snapshot.ProgramLibraryRoots;
        const root=clean(input.rootId)||getRootFolderId(env),folderId=clean(input.folderId)||root;
        if(root!==getRootFolderId(env)&&!roots.some(item=>item.FolderID===root))throw problem('Choose a folder added to this Program Library.',403);
        try{await requireItemInsideRoot(env,folderId,root,{requireFolder:true,allowRoot:true});}
        catch(error){if(/outside the configured|not found or is in Trash|not a folder/i.test(String(error.message)))throw problem('Choose a folder inside the selected Library folder.',400);throw error;}
        const fileName=clean(input.fileName),mimeType=clean(input.mimeType).toLowerCase(),size=Number(input.size),resourceType=clean(input.resourceType);
        if(!fileName||fileName.length>160||/[\\/\x00-\x1f]/.test(fileName))throw problem('Choose a file with a valid name up to 160 characters.');
        if(!Number.isSafeInteger(size)||size<1||size>5*1024*1024*1024)throw problem('Choose a nonempty file up to 5 GB.');
        if(!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mimeType))throw problem('This file type is not supported.');
        if(resourceType==='COVER'){
          if(!['image/jpeg','image/png','image/webp'].includes(mimeType))throw problem('Choose a JPG, PNG or WebP cover image.');
          if(size>20*1024*1024)throw problem('Choose a cover image up to 20 MB.');
        }else if(!getSupportedResourceTypes({name:fileName,mimeType}).includes(resourceType))throw problem('This file is not supported by the selected Library category.');
        let result;
        try{result=await startLibraryUpload(env,{folderId,fileName,mimeType,size,accountId:user.accountid,programId:program.id,resourceType});}
        catch(error){
          if(/Unknown action/i.test(String(error.message)))throw problem('Update the Development Apps Script deployment to enable Library device uploads.',503);
          if(/Library upload secret/i.test(String(error.message)))throw problem('Set the same Library upload secret in the Worker and Apps Script.',503);
          throw error;
        }
        return json({success:true,...result});
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
          mimeType:clean(file.mimeType),supportedTypes:getSupportedResourceTypes(file),format:deriveFileFormat(file.name,file.mimeType)
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
      if(action==='cover'){
        stage='resource';const data=await repository.load();
        if(!data.prepared||!data.libraryPrepared)throw problem('Prepare the Program Library tables first.',409);
        const snapshot=managementState(data,program).snapshot;
        const resource=snapshot.ProgramResources.find(row=>row.ResourceID===clean(input.resourceId));
        if(!resource||!resource.CoverDriveFileID)throw problem('This resource has no cover image.',404);
        const file=await repository.verifyCover(resource,snapshot.ProgramLibraryRoots);
        const token=await createDriveAccessToken({fileId:file.id,resourceId:resource.ResourceID,courseId:program.id,filename:file.name,mimeType:file.mimeType},env);
        return json({success:true,url:`${new URL(request.url).origin}/api/library/drive/file/${encodeURIComponent(file.id)}?access=${encodeURIComponent(token)}`});
      }
      throw problem('Unknown Program Library action.',404);
    }catch(error){const result=programFailure(error,action,stage);return json(result,result.status);}
  };
}
