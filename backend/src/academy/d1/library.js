import {d1Programs} from './programs.js';
import {managementStore,managementError,liveRoles,same} from './management-store.js';
import {requireLearning} from './learning-state.js';
import {managementView} from '../../programs/management-model.js';
import {visibleProgramResources,requireVisibleProgramResource} from '../../programs/library-viewer.js';
import {academyResourceDecision} from '../../lib/academy-library-policy.js';
import {createSessionToken,verifySessionToken} from '../../lib/auth.js';
import {extractGoogleDriveFolderId} from '../../lib/system-config.js';
import {listGoogleDriveFolder} from '../../lib/google-drive.js';
import {requireItemInsideRoot,validateFileForResourceType,getResourceConfig,getSupportedResourceTypes,buildDriveBreadcrumbs,deriveFileFormat,extractDriveFileId,createDriveAccessToken,streamDriveFileEndpoint} from '../../routes/drive-library.js';
import {legacyR2ObjectKey,r2MediaFilename,r2MediaMimeType,createR2MediaToken,streamR2MediaEndpoint} from '../../lib/academy-r2-media.js';
import {startLibraryUpload,openLibraryUploadTicket,forwardLibraryUploadChunk,LIBRARY_UPLOAD_CHUNK_SIZE} from '../../lib/library-upload-bridge.js';

const clean=v=>String(v??'').trim(),TTL=300;
const typeConfig=type=>{const config=getResourceConfig(type);if(!config)throw managementError('Choose a Library category.');return config;};
export function d1Library(repository,auth,env) {
  const store=managementStore(repository,auth),p=store.p,programs=d1Programs(repository,auth);
  let readiness,subscriptionsTable;
  const ready=()=>readiness??=requireLearning(repository.db).then(async()=>{subscriptionsTable=await repository.subscriptionSource();});
  const accountPath=`/account/${encodeURIComponent(auth.user.uniqueid)}`;
  const learningAreaRefs=()=>auth.state.activities.filter(a=>auth.state.account.global_admin||
    (a.kind==='PROGRAM'?auth.state.roles.some(r=>same(r.activity_key,a.activity_key)):
      a.legacy_access_model==='FREE'||auth.state.subscriptions.some(s=>same(s.activity_key,a.activity_key))||auth.state.roles.some(r=>same(r.activity_key,a.activity_key)&&r.role==='TEACHER')))
    .map(a=>`${a.kind==='PROGRAM'?'PROGRAM':'GLOBAL'}:${a.activity_id}`);
  const extras=activity=>({destination:p('SELECT * FROM program_library_destinations WHERE activity_key=?',activity),
    accessPolicies:p('SELECT * FROM library_access_policies'),exclusions:p('SELECT * FROM library_exclusions'),courseSettings:p('SELECT * FROM course_settings'),
    subscriptions:p(`SELECT account_id,activity_key FROM ${subscriptionsTable}`)});
  async function load(id) {await ready();return programs.load(id,extras(`PROGRAM:${id}`));}
  function programRole(data,activity) {
    const roles=liveRoles(data,auth.user.accountid,activity);
    return auth.state.account.global_admin?'GLOBAL_ADMIN':['PROGRAM_ADMIN','TEACHER','STUDENT'].find(role=>roles.includes(role))||'';
  }
  const role=loaded=>programRole(loaded.data,loaded.a.activity_key);
  function requireManage(loaded) {
    if(!auth.state.account.global_admin&&(loaded.a.lifecycle!=='ACTIVE'||role(loaded)!=='PROGRAM_ADMIN'))throw managementError('Only this Program’s Admin can change its Library.',403,'FORBIDDEN');
  }
  function decision(data,key,source,assigned,role,activity) {
    const row=data.accessPolicies.find(r=>r.resource_key===key)||data.accessPolicies.find(r=>source==='GLOBAL'&&r.resource_key===`GLOBAL:${key.split(':').at(-1)}`);
    const policy=data.exclusions.some(r=>r.resource_key===key||source==='GLOBAL'&&r.resource_key===`GLOBAL:${key.split(':').at(-1)}`)?{status:'ARCHIVED'}:
      row?{status:'ACTIVE',state:row.state,entitlementSource:row.entitlement_source,subscriptionScope:row.subscription_scope}:undefined;
    const globalSubjects=data.activities.filter(a=>a.kind==='COURSE').map(a=>({SubjectID:a.activity_id,Active:Boolean(a.active)&&a.lifecycle==='ACTIVE'}));
    const access=Object.fromEntries(data.subscriptions.filter(r=>same(r.account_id,auth.user.accountid)).map(r=>[r.activity_key.slice(7).toUpperCase(),true]));
    return academyResourceDecision({key,source,sourceActive:true,assigned,role:role==='PROGRAM_ADMIN'?'TEACHER':role,accountId:auth.user.accountid,policy,
      globalAccessModel:data.courseSettings.find(s=>same(s.activity_key,activity))?.legacy_access_model,globalSubjectId:activity?.slice(7),
      globalSubjects,globalMatrix:[{AccountID:auth.user.accountid,_subjectAccess:access}]});
  }
  function entries(loaded) {
    if(loaded.a.lifecycle!=='ACTIVE'||!loaded.a.active)return [];
    const assigned=role(loaded);
    return visibleProgramResources(loaded.viewData,loaded.program,loaded.shared.subjects).map(row=>({...row,
      key:`${loaded.a.activity_key}:${row.id}`,loaded,decision:decision(loaded.data,`${loaded.a.activity_key}:${row.id}`,'PROGRAM',Boolean(assigned),assigned,loaded.a.activity_key)})).filter(r=>r.decision.visible);
  }
  async function verifyProgramFile(loaded,record,cover=false,destinationOnly=false) {
    const id=cover?record.CoverDriveFileID:record.DriveFileID;
    if(!id)throw managementError('This file is unavailable.',404);
    const roots=destinationOnly?[loaded.data.destination[0]?.folder_id].filter(Boolean):loaded.current.snapshot.ProgramLibraryRoots.map(r=>r.FolderID);
    if(!roots.length)throw managementError('A Global Admin needs to select this Program’s Library folder.',409);
    let file;
    for(const root of roots)try{file=await requireItemInsideRoot(env,id,root,{requireFile:true});break;}catch(error){if(!/outside the configured/i.test(error.message))throw error;}
    if(!file)throw managementError('Choose a file inside this Program’s Library folder.',400);
    if(cover){if(!['image/jpeg','image/png','image/webp'].includes(file.mimeType)||file.capabilities?.canDownload===false)throw managementError('Choose a downloadable JPG, PNG or WebP cover.');}
    else {const check=validateFileForResourceType(file,typeConfig(record.ResourceType));if(!check.ok)throw managementError(check.error);}
    return file;
  }
  async function catalogue() {
    await ready();
    const all=await programs.loadAll({...extras(''),courseResources:p(`SELECT r.*,a.name AS activity_name,a.activity_id,cs.legacy_access_model,m.name AS module_name FROM course_resources r
      JOIN activities a USING(activity_key) JOIN course_settings cs USING(activity_key)
      LEFT JOIN modules m ON m.activity_key=r.activity_key AND m.module_id=r.module_id
      LEFT JOIN tasks t ON t.activity_key=r.activity_key AND t.task_id=r.task_id
      WHERE r.active=1 AND a.active=1 AND a.lifecycle='ACTIVE' AND (r.module_id IS NULL OR m.active=1) AND (r.task_id IS NULL OR t.active=1)
      AND EXISTS(SELECT 1 FROM timetable_publications x WHERE x.activity_key=r.activity_key)`),settings:p('SELECT * FROM academy_settings')});
    const data=all.data,result=[];
    for(const loaded of all.programs.filter(l=>l.a.active&&l.a.lifecycle==='ACTIVE'))for(const row of entries(loaded))result.push({...row,source:'PROGRAM',sourceName:loaded.a.name,subject:row.subjectName,module:row.moduleName,hasCover:row.hasCover});
    for(const r of data.courseResources) {
      const id=`${r.activity_key}:${r.resource_type}:${r.resource_id}`;
      const scopedRole=auth.state.account.global_admin?'GLOBAL_ADMIN':liveRoles(data,auth.user.accountid,r.activity_key).find(r=>r==='TEACHER')||'STUDENT';
      const access=decision(data,id,'GLOBAL',true,scopedRole,r.activity_key);
      if(access.visible&&['EBOOK','PRINTABLE','AUDIO','VIDEO','OTHER'].includes(r.resource_type))result.push({id:r.resource_id,key:id,type:r.resource_type,name:r.name,description:r.description||'',source:'GLOBAL',sourceName:'Courses',subject:r.activity_name,module:r.module_name||'General',hasCover:false,decision:access,
        fileId:extractDriveFileId(r.resource_link),root:data.settings.find(s=>s.setting_key==='GlobalResourceDriveRootFolderID')?.setting_value||'',r2Key:legacyR2ObjectKey(r.resource_link,env)});
    }
    return result;
  }
  async function find(key,admin=false) {
    const parts=String(key).split(':');
    if(parts[0]==='PROGRAM'&&parts.length===3) {
      const loaded=await load(parts[1]);if(admin)requireManage(loaded);
      const entry=entries(loaded).find(r=>r.key===key);
      if(!entry||!entry.decision.open)throw managementError('This resource is unavailable.',403,'FORBIDDEN');
      entry.record=requireVisibleProgramResource(loaded.viewData,loaded.program,loaded.shared.subjects,parts[2]);return entry;
    }
    const entry=(await catalogue()).find(r=>r.key===key);
    if(!entry||!entry.decision.open)throw managementError('This resource is unavailable.',403,'FORBIDDEN');return entry;
  }
  async function file(entry,cover) {
    if(entry.loaded)return verifyProgramFile(entry.loaded,entry.record,cover);
    if(cover||!entry.fileId||!entry.root)throw managementError('This resource file is unavailable.',404);
    const result=await requireItemInsideRoot(env,entry.fileId,entry.root,{requireFile:true});
    const check=validateFileForResourceType(result,typeConfig(entry.type));if(!check.ok)throw managementError(check.error,409);return result;
  }
  async function access(key,cover,request,admin=false) {
    const entry=await find(key,admin);let metadata,etag;
    if(entry.r2Key){if(cover)throw managementError('This resource has no cover.',404);const object=await env.MEDIA_BUCKET?.head(entry.r2Key);if(!object)throw managementError('This resource file is unavailable.',404);
      metadata={name:r2MediaFilename(entry.r2Key),mimeType:r2MediaMimeType(r2MediaFilename(entry.r2Key),object)};etag=object.etag;
      const check=validateFileForResourceType(metadata,typeConfig(entry.type));if(!check.ok&&!(entry.type==='OTHER'&&metadata.mimeType==='application/pdf'))throw managementError(check.error,409);
    }else metadata=await file(entry,cover);
    const token=await createSessionToken({purpose:'academy-d1-file',sid:auth.sid,accountid:auth.user.accountid,epoch:auth.state.account.credential_epoch,
      resourceKey:key,cover:Boolean(cover),fileId:metadata.id||'',etag:etag||'',expiresAt:Date.now()+TTL*1000},env);
    return {url:`${new URL(request.url).origin}/api/academy/d1/library/file?access=${encodeURIComponent(token)}`,expiresIn:TTL,filename:metadata.name,mimeType:metadata.mimeType,format:deriveFileFormat(metadata.name,metadata.mimeType)};
  }
  return {
    async available(admin=false) {
      await ready();const data=await store.load();
      return {programs:data.activities.filter(a=>a.kind==='PROGRAM'&&a.active&&a.lifecycle==='ACTIVE').flatMap(a=>{
        const assigned=programRole(data,a.activity_key);
        return assigned&&(!admin||assigned!=='STUDENT')?[{id:a.activity_id,name:a.name,role:assigned}]:[];
      }),accountPath,store:'D1'};
    },
    async run(action,input,request,{admin=false,academy=false}={}) {
      if(action==='available')return this.available(admin);
      if(action==='course-access'){
        await ready();
        const rows=(await p('SELECT activity_key,resource_type,resource_id FROM course_resources WHERE resource_id=? COLLATE NOCASE',clean(input.resourceId||input.resourceid)).all()).results;
        if(rows.length!==1)throw managementError('Choose an available Course resource.',rows.length?409:404);
        const r=rows[0];return access(`${r.activity_key}:${r.resource_type}:${r.resource_id}`,false,request);
      }
      if(academy&&action==='catalogue')return {resources:(await catalogue()).map(r=>({id:r.key,source:r.source,sourceName:r.sourceName,type:r.type,name:r.name,description:r.description,subject:r.subject,module:r.module,author:r.author||'',publisher:r.publisher||'',hasCover:r.hasCover,accessState:r.decision.state,locked:Boolean(r.decision.locked),forYou:Boolean(r.decision.forYou||r.decision.open)})),warnings:[],learningAreaRefs:learningAreaRefs(),store:'D1'};
      if(['access','cover'].includes(action))return access(academy?input.resourceId:`PROGRAM:${input.id}:${input.resourceId}`,action==='cover',request,admin);
      const loaded=await load(input.id);
      if(action==='catalogue')return {program:loaded.program,role:role(loaded),canManage:['GLOBAL_ADMIN','PROGRAM_ADMIN'].includes(role(loaded)),accountPath,resources:entries(loaded).filter(r=>r.decision.open).map(({key,loaded,decision,...r})=>r)};
      if(action==='covers') {
        if(!Array.isArray(input.resourceIds)||input.resourceIds.length<1||input.resourceIds.length>16||input.resourceIds.some(id=>typeof id!=='string'||id.length>100))throw managementError('Choose up to 16 covers.');
        const covers=[];for(const id of new Set(input.resourceIds))try{const result=await access(`PROGRAM:${input.id}:${id}`,true,request);covers.push({id,url:result.url});}catch(error){if(![400,403,404].includes(error.status))throw error;}
        return {covers,expiresIn:TTL};
      }
      if(!admin)throw managementError('Unknown Library action.',404);
      requireManage(loaded);
      if(action==='manage')return {...await managementView(loaded.viewData,{managementReferences:async()=>loaded.shared},loaded.program),managementEditable:loaded.a.lifecycle!=='ARCHIVED',coordinatorAvailable:true,canManageFolder:Boolean(auth.state.account.global_admin),accountPath,destinationId:loaded.data.destination[0]?.folder_id||'',deviceUploadsReady:env.ACADEMY_D1_UPLOAD_BRIDGE==='D1_V1',store:'D1'};
      if(action==='recover')return {recovered:false};
      if(action==='prepare-library')return {prepared:true,libraryPrepared:true};
      if(loaded.a.lifecycle==='ARCHIVED')throw managementError('Reactivate this Program before changing its Library.',409);
      if(action==='save') {
        if(input.kind!=='resources')throw managementError('Only resources can be saved here.',403);
        return programs.management('manage-save',input,async(current,record,old)=>{
          if(record.Active||old?.DriveFileID!==record.DriveFileID)await verifyProgramFile(current,record,false,!old||old.DriveFileID!==record.DriveFileID);
          if(record.CoverDriveFileID&&(record.Active||old?.CoverDriveFileID!==record.CoverDriveFileID))await verifyProgramFile(current,record,true,!old||old.CoverDriveFileID!==record.CoverDriveFileID);
        },extras(loaded.a.activity_key),loaded);
      }
      if(action==='folder-set') {
        if(!auth.state.account.global_admin)throw managementError('Only a Global Admin can select the Library folder.',403);
        return store.change('PROGRAM_LIBRARY',loaded.a.activity_key,action,input,async()=>{
          const current=await load(input.id);if(current.a.lifecycle==='ARCHIVED')throw managementError('Reactivate this Program first.',409);
          let folderId;try{folderId=extractGoogleDriveFolderId(input.folder);}catch(error){throw managementError(error.message);}
          const folder=await requireItemInsideRoot(env,folderId,folderId,{requireFolder:true,allowRoot:true});await listGoogleDriveFolder(env,folderId,{pageSize:1});
          return {data:current.data,statements:[p('INSERT INTO program_library_roots VALUES(?,?,?) ON CONFLICT(activity_key,folder_id) DO UPDATE SET name=excluded.name',current.a.activity_key,folder.id,folder.name),p('INSERT INTO program_library_destinations VALUES(?,?) ON CONFLICT(activity_key) DO UPDATE SET folder_id=excluded.folder_id',current.a.activity_key,folder.id)],result:{folder:{id:folder.id,name:folder.name}},fields:['LibraryFolder']};
        });
      }
      const root=loaded.data.destination[0]?.folder_id;
      if(!root)throw managementError('A Global Admin needs to select this Program’s Library folder.',409);
      if(action==='browse') {
        const folderId=clean(input.folderId)||root;
        const folder=await requireItemInsideRoot(env,folderId,root,{requireFolder:true,allowRoot:true});
        const listing=await listGoogleDriveFolder(env,folderId,{pageToken:clean(input.pageToken),pageSize:500});
        return {rootFolderId:root,folder:{id:folder.id,name:folder.name},breadcrumbs:await buildDriveBreadcrumbs(env,folder,root),items:(listing.files||[]).map(f=>({id:f.id,name:f.name,isFolder:f.mimeType==='application/vnd.google-apps.folder',mimeType:f.mimeType,supportedTypes:getSupportedResourceTypes(f),format:deriveFileFormat(f.name,f.mimeType)})),nextPageToken:listing.nextPageToken||''};
      }
      if(action==='upload-start') {
        if(env.ACADEMY_D1_UPLOAD_BRIDGE!=='D1_V1')throw managementError('D1 device uploads need the updated Drive bridge enabled.',503,'UPLOAD_BRIDGE_REQUIRED');
        const fileName=clean(input.fileName),mimeType=clean(input.mimeType).toLowerCase(),size=Number(input.size),resourceType=clean(input.resourceType);
        if(!fileName||fileName.length>160||/[\\/\x00-\x1f]/.test(fileName)||!Number.isSafeInteger(size)||size<1||size>5*1024**3||!/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(mimeType))throw managementError('Choose a supported nonempty file up to 5 GB.');
        if(resourceType==='COVER'){if(!['image/jpeg','image/png','image/webp'].includes(mimeType)||size>20*1024**2)throw managementError('Choose a JPG, PNG or WebP cover up to 20 MB.');}
        else if(!getSupportedResourceTypes({name:fileName,mimeType}).includes(resourceType))throw managementError('Choose a file supported by this category.');
        await requireItemInsideRoot(env,root,root,{requireFolder:true,allowRoot:true});
        return startLibraryUpload(env,{folderId:root,fileName,mimeType,size,resourceType,accountId:auth.user.accountid,programId:loaded.program.id,authorityStore:'D1'});
      }
      throw managementError('Unknown Library action.',404);
    },
    async uploadChunk(request) {
      if(env.ACADEMY_D1_UPLOAD_BRIDGE!=='D1_V1')throw managementError('D1 device uploads need the updated Drive bridge enabled.',503,'UPLOAD_BRIDGE_REQUIRED');
      const ticket=await openLibraryUploadTicket(env,request.headers.get('X-Library-Upload-Ticket'));
      if(!ticket||ticket.authorityStore!=='D1'||ticket.accountId!==auth.user.accountid)throw managementError('This upload session has ended.',401);
      const loaded=await load(ticket.programId);requireManage(loaded);
      if(loaded.a.lifecycle==='ARCHIVED'||loaded.data.destination[0]?.folder_id!==ticket.folderId)throw managementError('The Library folder changed. Start this upload again.',409);
      const offset=Number(request.headers.get('X-Library-Upload-Offset'));
      if(!Number.isSafeInteger(offset)||offset<0||offset>=ticket.size)throw managementError('Invalid upload position.');
      const reader=request.body?.getReader();if(!reader)throw managementError('Choose a file to upload.');
      const chunks=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>LIBRARY_UPLOAD_CHUNK_SIZE){await reader.cancel();throw managementError('Upload chunk is too large.',413);}chunks.push(value);}
      if(!length||offset+length>ticket.size)throw managementError('Invalid upload chunk size.');
      const bytes=new Uint8Array(length);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}
      return forwardLibraryUploadChunk(ticket,offset,bytes);
    },
    async stream(request,claims) {
      const entry=await find(claims.resourceKey);
      if(entry.r2Key) {
        const object=await env.MEDIA_BUCKET?.head(entry.r2Key);if(!object||object.etag!==claims.etag)throw managementError('This file changed. Open it again from Library.',404);
        const token=await createR2MediaToken({key:entry.r2Key,etag:object.etag,filename:r2MediaFilename(entry.r2Key),mimeType:r2MediaMimeType(r2MediaFilename(entry.r2Key),object)},env);
        const url=new URL(request.url);url.searchParams.set('access',token);return streamR2MediaEndpoint(new Request(url,request),env);
      }
      const current=await file(entry,claims.cover);
      if(current.id!==claims.fileId)throw managementError('This file changed. Open it again from Library.',404);
      const token=await createDriveAccessToken({fileId:current.id,filename:current.name,mimeType:current.mimeType},env);
      const url=new URL(request.url);url.searchParams.set('access',token);return streamDriveFileEndpoint(new Request(url,request),env,current.id);
    }
  };
}
export async function d1LibraryStream(request,repository,env) {
  const token=new URL(request.url).searchParams.get('access');
  if(!token||token.length>4096)throw managementError('File access has expired.',401);
  const claims=await verifySessionToken(token,env);
  if(!claims||claims.purpose!=='academy-d1-file'||!Number.isInteger(claims.expiresAt)||claims.expiresAt<=Date.now()||typeof claims.sid!=='string'||typeof claims.accountid!=='string'||!Number.isInteger(claims.epoch)||typeof claims.resourceKey!=='string')throw managementError('File access has expired.',401);
  const state=await repository.session(claims.sid,claims.accountid,claims.epoch);
  if(!state||!state.contexts.length)throw managementError('Your Academy session has ended.',401);
  const auth={state,sid:claims.sid,context:state.contexts[0],user:{accountid:state.account.account_id,uniqueid:state.account.login_link_id,role:state.account.global_admin?'GLOBAL_ADMIN':state.contexts[0]?.role}};
  return d1Library(repository,auth,env).stream(request,claims);
}
