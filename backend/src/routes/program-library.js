import { json } from '../lib/http.js';
import { verifySessionToken } from '../lib/auth.js';
import { startLibraryUpload, openLibraryUploadTicket, forwardLibraryUploadChunk, LIBRARY_UPLOAD_CHUNK_SIZE } from '../lib/library-upload-bridge.js';
import { searchBookCovers, downloadBookCover } from '../lib/book-cover-search.js';
import { listGoogleDriveFolder } from '../lib/google-drive.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { getAuthUser } from '../lib/auth.js';
import { extractGoogleDriveFolderId, findSystemConfigRowIndexes, getSystemConfigValue, readSystemConfigRows, upsertSystemConfigValues, PROGRAM_LIBRARY_DRIVE_FOLDER_ID_KEY, PROGRAM_LIBRARY_PREVIOUS_FOLDER_IDS_KEY } from '../lib/system-config.js';
import { problem, clean } from '../programs/model.js';
import { programLibraryUser, timetableProgram } from '../programs/timetable-context.js';
import { timetableRepository } from '../programs/timetable-repository.js';
import { managementState, managementView } from '../programs/management-model.js';
import { programFailure } from '../programs/errors.js';
import { programService } from '../programs/service.js';
import { sheetsProgramRepository } from '../programs/sheets-repository.js';
import { readProgramRoleAccountsForPrograms } from '../profiles/program-roles.js';
import { isActivePlatformValue as active } from '../lib/platform-schema.js';
import {
  buildDriveBreadcrumbs, createDriveAccessToken, deriveFileFormat,
  getDriveAccessTtlSeconds, getSupportedResourceTypes,
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
      if(action==='upload-chunk'){
        stage='upload';
        if(request.method!=='POST')throw problem('Use POST for Library uploads.',405);
        const ticket=await openLibraryUploadTicket(env,request.headers.get('X-Library-Upload-Ticket'));
        const auth=request.headers.get('Authorization')||'';
        const session=auth.startsWith('Bearer ')?await verifySessionToken(auth.slice(7).trim(),env):null;
        if(!ticket||!session||session.type!=='account'||
            session.accountid!==ticket.accountId||
            !Number.isInteger(session.authrow)||session.authrow<2||!session.cv){
          throw problem('This upload session has expired. Choose the file again.',401);
        }
        const offset=Number(request.headers.get('X-Library-Upload-Offset'));
        if(!Number.isSafeInteger(offset)||offset<0||offset>=ticket.size)throw problem('Invalid upload position. Start this upload again.');
        if(Number(request.headers.get('Content-Length'))>LIBRARY_UPLOAD_CHUNK_SIZE)throw problem('Upload chunk is too large.',413);
        const reader=request.body?.getReader();if(!reader)throw problem('Choose a file to upload.');
        const chunks=[];let length=0;
        while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>LIBRARY_UPLOAD_CHUNK_SIZE){await reader.cancel();throw problem('Upload chunk is too large.',413);}chunks.push(value);}
        if(!length||offset+length>ticket.size)throw problem('Invalid upload chunk size.');
        // The signed ticket and session protect intermediate chunks. Recheck
        // current account access and Program status before Drive completes the file.
        if(offset+length===ticket.size){
          const user=await programLibraryUser(request,env,ticket.programId);
          if(user.accountid!==ticket.accountId)throw problem('This upload session has expired. Choose the file again.',401);
          const program=await timetableProgram(env,ticket.programId);
          if(program.status!=='DRAFT')throw problem('Archived Programs cannot accept uploads.',409);
          if(await timetableRepository(env,program).libraryDestination()!==ticket.folderId)throw problem('The Resources folder changed during upload. Choose the file again.',409);
        }
        const bytes=new Uint8Array(length);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
        return json({success:true,...await forwardLibraryUploadChunk(ticket,offset,bytes)});
      }
      const input=await inputJSON(request);
      if(action==='available'){
        const account=await getAuthUser(request,env,{allowProgram:true});
        if(!account||account.type!=='account')throw problem('Sign in through your personal Academy account link.',401);
        const {programs}=await programService(sheetsProgramRepository(env)).list();
        const available=[];
        const candidates=programs.filter(row=>row.mode==='PROGRAM');
        const roleAccounts=account.role==='GLOBAL_ADMIN'?{}:await readProgramRoleAccountsForPrograms(env,candidates.map(row=>row.id));
        for(const item of candidates){
          if(account.role==='GLOBAL_ADMIN'){available.push({id:item.id,name:item.name});continue;}
          const roles=roleAccounts[item.id];
          if(roles.some(row=>row.AccountID===account.accountid&&row.Active&&row.Roles.some(role=>['ADMIN','SENIOR','TEACHER'].includes(role))))available.push({id:item.id,name:item.name});
        }
        return json({success:true,programs:available});
      }
      const user=await programLibraryUser(request,env,input.id,{adminOnly:action==='folder-set'||action==='prepare-library'});
      stage='program';const program=await timetableProgram(env,input.id);
      const repository=timetableRepository(env,program);
      if(action==='cover-search'){
        stage='cover-search';
        if(program.status!=='DRAFT')throw problem('Archived Programs cannot add book covers.',409);
        return json({success:true,covers:await searchBookCovers(input.query)});
      }
      if(action==='cover-image'){
        stage='cover-image';
        if(program.status!=='DRAFT')throw problem('Archived Programs cannot add book covers.',409);
        const bytes=await downloadBookCover(input.coverId);
        return new Response(bytes,{status:200,headers:{'Content-Type':'image/jpeg','Content-Length':String(bytes.byteLength),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length, Content-Type'}});
      }
      if(action==='manage'){
        const data=await repository.load();
        const view=await managementView(data,repository,program);
        let destinationId='';try{destinationId=await repository.libraryDestination();}catch{}
        const {subjects,levels,modules,tasks,resources}=view.rows;
        return json({success:true,program:view.program,prepared:view.prepared,libraryPrepared:view.libraryPrepared,revision:view.revision,emptyRowRevision:view.emptyRowRevision,rowRevisions:{resources:view.rowRevisions.resources},sharedSubjects:view.sharedSubjects,rows:{subjects,levels,modules,tasks,resources},coordinatorAvailable:Boolean(env.PROGRAM_TIMETABLE_COORDINATOR),canManageFolder:user.role==='GLOBAL_ADMIN',accountPath:user.uniqueid?`/account/${encodeURIComponent(user.uniqueid)}`:'/',destinationId});
      }
      if(action==='save'||action==='recover'||action==='prepare-library'){
        if(action==='save'&&input.kind!=='resources')throw problem('Only resource changes are allowed here.',403);
        if(action==='recover')input.kind='resources';
        if(!env.PROGRAM_TIMETABLE_COORDINATOR)throw problem('Library saving needs the Program coordinator binding.',503);
        const coordinator=env.PROGRAM_TIMETABLE_COORDINATOR.getByName(`${getPlatformSpreadsheetId(env)}:${program.id}`);
        const result=await coordinator.run(action==='save'?'manage-save':action,input,request.headers.get('Authorization')||'');
        return json(result,result.success?200:result.status||503);
      }
      if(action==='folder-set'){
        let folderId;try{folderId=extractGoogleDriveFolderId(input.folder);}catch(error){throw problem(error.message);}
        let folder;try{folder=await requireItemInsideRoot(env,folderId,folderId,{requireFolder:true,allowRoot:true});}
        catch(error){if(/not found or is in Trash|Google Drive API error 40[34]/i.test(String(error.message)))throw problem('Share this folder with the Library service account, then try again.',403);throw error;}
        const rows=await readSystemConfigRows(env);
        if(findSystemConfigRowIndexes(rows,PROGRAM_LIBRARY_DRIVE_FOLDER_ID_KEY).length>1||findSystemConfigRowIndexes(rows,PROGRAM_LIBRARY_PREVIOUS_FOLDER_IDS_KEY).length>1)throw problem('Repair duplicate Library folder settings in SystemConfig first.',409);
        const current=getSystemConfigValue(rows,PROGRAM_LIBRARY_DRIVE_FOLDER_ID_KEY);
        if(current&&!/^[A-Za-z0-9_-]{10,128}$/.test(current))throw problem('Repair the current Library folder setting before changing Resources.',409);
        const previous=getSystemConfigValue(rows,PROGRAM_LIBRARY_PREVIOUS_FOLDER_IDS_KEY).split(',').map(clean).filter(Boolean);
        if(previous.some(id=>!/^[A-Za-z0-9_-]{10,128}$/.test(id)))throw problem('Repair the previous Library folder setting before changing Resources.',409);
        if(current&&current!==folderId&&!previous.includes(current)){
          const saved=await upsertSystemConfigValues(env,{[PROGRAM_LIBRARY_PREVIOUS_FOLDER_IDS_KEY]:[...previous,current].join(',')},{updatedBy:user.accountid,updatedByName:user.username||user.accountid,rows});
          if(!saved.ok)throw problem(saved.error,saved.status);
        }
        const result=await upsertSystemConfigValues(env,{[PROGRAM_LIBRARY_DRIVE_FOLDER_ID_KEY]:folderId},{updatedBy:user.accountid,updatedByName:user.username||user.accountid});
        if(!result.ok)throw problem(result.error,result.status);
        return json({success:true,folder:{id:folder.id,name:folder.name}});
      }
      if(action==='upload-start'){
        stage='upload';
        if(program.status!=='DRAFT')throw problem('Archived Programs cannot accept uploads.',409);
        if(!clean(env.APPS_SCRIPT_URL))throw problem('Library device upload needs the Development Apps Script connection.',503);
        if(clean(env.M4L_LIBRARY_BRIDGE_SECRET).length<32)throw problem('Library device upload needs its shared secret configured in the Worker and Apps Script.',503);
        const data=await repository.load();
        if(!data.prepared||!data.libraryPrepared)throw problem('Prepare the Program Library tables first.',409);
        const folderId=await repository.libraryDestination();
        await requireItemInsideRoot(env,folderId,folderId,{requireFolder:true,allowRoot:true});
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
        const root=await repository.libraryDestination(),folderId=clean(input.folderId)||root;
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
