/* V105.4 Program Library management. The Worker owns references and Drive access. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const active=value=>value===true||String(value).toUpperCase()==='TRUE';
  const types=[['EBOOK','eBooks'],['PRINTABLE','Printables'],['AUDIO','Audio'],['VIDEO','Video'],['OTHER','Other']];
  const id=new URLSearchParams(location.search).get('program');
  const pendingKey=`m4l-program-library-pending:${id}`;
  const draftKey=`m4l-program-library-draft:${id}`;
  const rootPendingKey=`m4l-program-library-root-pending:${id}`;
  const state={data:null,record:null,creating:false,busy:false,pending:null,rootPending:null,drive:null,rootId:'',folderId:'',selectedFile:null,mode:'select',uploadFile:null,uploadClientId:''};
  const message=(value,error=false)=>{$('pl-message').textContent=value;$('pl-message').classList.toggle('pl-error',error);};
  const driveMessage=(value,error=false)=>{$('pl-drive-status').textContent=value;$('pl-drive-status').classList.toggle('pl-error',error);};
  async function api(path,body={}){
    const token=localStorage.getItem('m4l_account_token');
    if(!token)throw new Error('Sign in through your personal Academy account link, then open Programs.');
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id,...body})});
    let result;try{result=await response.json();}catch{throw new Error('The response could not be read. Your entry is kept.');}
    if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The request failed.'),{status:response.status,code:result.code,rowRevision:result.rowRevision,currentRecord:result.currentRecord,retryable:result.retryable});
    return result;
  }
  function subjectName(subjectId){const link=state.data?.rows.subjects.find(r=>r.ProgramSubjectID===subjectId);return state.data?.sharedSubjects.find(r=>r.SubjectID===link?.SubjectID)?.SubjectName||subjectId;}
  function levelName(levelId){return state.data?.rows.levels.find(r=>r.LevelID===levelId)?.Name||'No level';}
  function moduleName(moduleId){return state.data?.rows.modules.find(r=>r.ProgramModuleID===moduleId)?.Name||'General';}
  function taskName(taskId){return state.data?.rows.tasks.find(r=>r.TaskID===taskId)?.Name||'';}
  function option(value,label,selected){return `<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;}
  function saveDraft(){if(state.record)sessionStorage.setItem(draftKey,JSON.stringify({record:state.record,creating:state.creating,selectedFile:state.selectedFile}));else sessionStorage.removeItem(draftKey);}
  function renderList(){
    if(!state.data)return;
    const rows=state.data.rows.resources||[];
    $('pl-title').textContent=`${state.data.program.name} Library`;
    $('pl-curriculum').href=`/programs/manage.html?program=${encodeURIComponent(id)}`;
    $('pl-prepare').hidden=!state.data.prepared||state.data.libraryPrepared;
    $('pl-prepare').disabled=state.busy||Boolean(state.pending)||!state.data.coordinatorAvailable;
    $('pl-add').disabled=state.busy||Boolean(state.pending)||!state.data.libraryPrepared||state.data.program.status!=='DRAFT'||!state.data.coordinatorAvailable;
    $('pl-pending').hidden=!state.pending;
    const groups=types.map(([type,label])=>{
      const resources=rows.filter(r=>r.ResourceType===type);
      if(!resources.length)return '';
      const subjects=[...new Set(resources.map(r=>r.ProgramSubjectID))].sort((a,b)=>subjectName(a).localeCompare(subjectName(b)));
      return `<details><summary>${esc(label)} · ${resources.length}</summary>${subjects.map(subjectId=>{
        const placed=resources.filter(r=>r.ProgramSubjectID===subjectId).sort((a,b)=>levelName(a.LevelID).localeCompare(levelName(b.LevelID))||moduleName(a.ProgramModuleID).localeCompare(moduleName(b.ProgramModuleID))||a.Name.localeCompare(b.Name));
        return `<details><summary>${esc(subjectName(subjectId))} · ${placed.length}</summary>${placed.map(row=>`<div class="pl-resource ${active(row.Active)?'':'is-archived'}"><div><strong>${esc(row.Name)}</strong><p>${esc(row.LevelID?levelName(row.LevelID)+' · ':'')}${esc(moduleName(row.ProgramModuleID))}${row.TaskID?` · ${esc(taskName(row.TaskID))}`:''}${active(row.Active)?'':' · Archived'}</p>${row.Description?`<p>${esc(row.Description)}</p>`:''}</div><button type="button" class="pb-secondary" data-edit="${esc(row.ResourceID)}">Edit</button></div>`).join('')}</details>`;
      }).join('')}</details>`;
    }).join('');
    $('pl-list').innerHTML=`<h2>Resources · ${rows.length}</h2>${groups||'<p class="pl-empty">No resources yet. Add a protected Drive file to start this Program Library.</p>'}`;
  }
  function renderChoices(){
    if(!state.record||!state.data)return;
    const r=state.record;
    const subjects=state.data.rows.subjects.filter(row=>active(row.Active)||row.ProgramSubjectID===r.ProgramSubjectID);
    $('pl-subject').innerHTML=option('','Choose a subject',r.ProgramSubjectID)+subjects.map(row=>option(row.ProgramSubjectID,subjectName(row.ProgramSubjectID),r.ProgramSubjectID)).join('');
    const levels=state.data.rows.levels.filter(row=>row.ProgramSubjectID===r.ProgramSubjectID&&(active(row.Active)||row.LevelID===r.LevelID));
    $('pl-level').innerHTML=option('','No level',r.LevelID)+levels.map(row=>option(row.LevelID,row.Name,r.LevelID)).join('');
    const modules=state.data.rows.modules.filter(row=>row.ProgramSubjectID===r.ProgramSubjectID&&(!r.LevelID||row.LevelID===r.LevelID)&&(active(row.Active)||row.ProgramModuleID===r.ProgramModuleID));
    $('pl-module').innerHTML=option('','General',r.ProgramModuleID)+modules.map(row=>option(row.ProgramModuleID,row.Name,r.ProgramModuleID)).join('');
    const tasks=(state.data.rows.tasks||[]).filter(row=>row.ProgramSubjectID===r.ProgramSubjectID&&row.ProgramModuleID===(r.ProgramModuleID||'')&&(active(row.Active)||row.TaskID===r.TaskID));
    $('pl-task').innerHTML=option('','No task',r.TaskID||'')+tasks.map(row=>option(row.TaskID,row.Name,r.TaskID)).join('');
  }
  function renderEditor(){
    $('pl-editor').hidden=!state.record;
    if(!state.record)return;
    const r=state.record;
    $('pl-editor-title').textContent=state.creating?'Add resource':'Edit resource';
    $('pl-type').value=r.ResourceType;
    $('pl-name').value=r.Name;
    $('pl-description').value=r.Description;
    $('pl-active').value=String(active(r.Active));
    renderChoices();
    $('pl-file').textContent=state.selectedFile?.name|| (r.DriveFileID?`Saved Drive file · ${r.DriveFileID}`:'No file selected.');
    $('pl-save').disabled=state.busy||!state.data?.libraryPrepared||!state.data?.coordinatorAvailable||Boolean(state.pending)||Boolean(state.rootPending);
    $('pl-browse').disabled=state.busy||Boolean(state.pending);
    $('pl-device').disabled=state.busy||Boolean(state.pending);
    $('pl-preview').hidden=true;
    if(!state.creating&&active(r.Active)){
      $('pl-preview').hidden=false;$('pl-preview').removeAttribute('href');
      $('pl-preview').textContent='Prepare file preview ↗';
      $('pl-preview').dataset.resourceId=r.ResourceID;
    }
  }
  function renderDrive(){
    const uploading=state.mode==='upload';
    $('pl-drive-title').textContent=uploading?'Choose a Drive destination':'Choose a Drive file';
    $('pl-drive-help').textContent=uploading?`Upload ${state.uploadFile?.name||'your file'} into the chosen Library folder.`:'Select a Library folder, then open its subfolders to find a file.';
    $('pl-upload').hidden=!uploading;
    $('pl-upload').disabled=state.busy||!state.drive||!state.uploadFile||Boolean(state.rootPending);
    $('pl-drive-cancel').disabled=state.busy;
    const roots=[['','Protected Reboot folder'],...(state.data?.libraryRoots||[]).map(root=>[root.FolderID,root.Name])];
    $('pl-root').innerHTML=roots.map(([folderId,name])=>option(folderId,name,state.rootId)).join('');
    $('pl-root').disabled=state.busy||Boolean(state.rootPending);
    $('pl-root-input').disabled=state.busy||Boolean(state.rootPending);
    $('pl-add-root').disabled=state.busy||Boolean(state.rootPending)||!state.data?.coordinatorAvailable;
    $('pl-root-retry').hidden=!state.rootPending;
    $('pl-root-retry').disabled=state.busy;
    if(!state.drive){$('pl-breadcrumbs').innerHTML='';$('pl-drive-list').innerHTML='';$('pl-more').hidden=true;return;}
    $('pl-breadcrumbs').innerHTML=(state.drive.breadcrumbs||[]).map(part=>`<button type="button" class="pb-secondary pl-breadcrumb" data-folder="${esc(part.id)}">${esc(part.name)}</button>`).join('');
    $('pl-drive-list').innerHTML=(state.drive.items||[]).map(item=>`<div class="pl-drive-item"><span>${item.isFolder?'📁':'📄'} ${esc(item.name)} <small>${esc(item.format||'')}</small></span>${item.isFolder?`<button type="button" class="pb-secondary" data-folder="${esc(item.id)}">Open folder</button>`:uploading?'':`<button type="button" class="pb-secondary" data-file="${esc(item.id)}" ${item.supportedTypes.includes(state.record.ResourceType)?'':'disabled'}>Choose file</button>`}</div>`).join('')||'<p class="pl-empty">No files in this folder.</p>';
    $('pl-more').hidden=!state.drive.nextPageToken;
    $('pl-more').disabled=state.busy;
  }
  function render(){renderList();renderEditor();renderDrive();}
  async function load(){
    state.data=await api('program-timetable/manage-get');state.data.rows.resources||=[];
    if(state.record&&!state.creating){
      const saved=state.data.rows.resources.find(row=>row.ResourceID===state.record.ResourceID);
      if(!saved)message('This resource was removed elsewhere. Your entry is kept.',true);
    }
    render();
    if(!state.data.prepared)message('Prepare management tables in Curriculum first.');
    else if(!state.data.libraryPrepared)message('Prepare the Program task and Library tables to begin. Existing records are preserved.');
    else if(!state.data.coordinatorAvailable)message('Saving needs the Program coordinator binding.');
    else message('Choose a resource to edit or add a new protected Drive file.');
  }
  function start(record,creating){if($('pl-drive').open)$('pl-drive').close();state.record=structuredClone(record);state.creating=creating;state.selectedFile=null;state.drive=null;state.uploadFile=null;saveDraft();render();$('pl-name').focus();}
  $('pl-add').onclick=()=>{if(state.busy||state.pending)return;start({ResourceID:`RES-${crypto.randomUUID()}`,ProgramSubjectID:'',LevelID:'',ProgramModuleID:'',TaskID:'',ResourceType:'EBOOK',Name:'',Description:'',DriveFileID:'',Active:true},true);};
  $('pl-list').onclick=event=>{const resourceId=event.target.closest('[data-edit]')?.dataset.edit;if(!resourceId||state.busy||state.pending)return;const row=state.data.rows.resources.find(r=>r.ResourceID===resourceId);if(row)start({...row,Active:active(row.Active)},false);};
  $('pl-cancel').onclick=()=>{if(state.pending)return;if($('pl-drive').open)$('pl-drive').close();state.record=null;state.drive=null;state.selectedFile=null;saveDraft();render();};
  $('pl-refresh').onclick=async()=>{if(state.busy)return;state.busy=true;try{await load();}catch(error){message(error.message,true);}finally{state.busy=false;render();}};
  $('pl-prepare').onclick=async()=>{if(state.busy||state.pending)return;state.busy=true;try{await api('program-timetable/prepare-library');await load();message('Program task and Library tables are ready.');}catch(error){message(error.message,true);}finally{state.busy=false;render();}};
  for(const [element,field] of [['pl-type','ResourceType'],['pl-name','Name'],['pl-description','Description'],['pl-active','Active']]){
    $(element).addEventListener(element==='pl-name'||element==='pl-description'?'input':'change',event=>{
      if(!state.record||state.pending)return;
      state.record[field]=field==='Active'?event.target.value==='true':event.target.value;
      if(field==='ResourceType'){
        if(state.selectedFile&&!state.selectedFile.supportedTypes.includes(state.record.ResourceType)){
          state.selectedFile=null;state.record.DriveFileID='';
          message('Choose a Drive file supported by the new resource type.');
        }
        renderEditor();renderDrive();
      }
      saveDraft();
    });
  }
  $('pl-subject').onchange=event=>{if(!state.record)return;state.record.ProgramSubjectID=event.target.value;state.record.LevelID='';state.record.ProgramModuleID='';state.record.TaskID='';saveDraft();renderChoices();};
  $('pl-level').onchange=event=>{if(!state.record)return;state.record.LevelID=event.target.value;state.record.ProgramModuleID='';state.record.TaskID='';saveDraft();renderChoices();};
  $('pl-module').onchange=event=>{if(!state.record)return;state.record.ProgramModuleID=event.target.value;state.record.TaskID='';const module=state.data.rows.modules.find(r=>r.ProgramModuleID===event.target.value);if(module)state.record.LevelID=module.LevelID||'';saveDraft();renderChoices();};
  $('pl-task').onchange=event=>{if(!state.record)return;state.record.TaskID=event.target.value;saveDraft();};
  async function browse(folderId='',pageToken=''){
    if(state.busy)return;
    state.busy=true;driveMessage('Loading Drive folders and files…');renderDrive();
    try{state.drive=await api('program-library/browse',{rootId:state.rootId,folderId,pageToken});state.folderId=state.drive.folder.id;driveMessage('Choose a file supported by the selected resource type.');}
    catch(error){driveMessage(error.message,true);}
    finally{state.busy=false;renderDrive();}
  }
  function openDrive(mode){if(!state.record||state.busy)return;state.mode=mode;state.drive=null;renderDrive();$('pl-drive').showModal();if(state.rootPending)driveMessage('An earlier folder addition needs confirmation. Choose Retry same folder.',true);else void browse();}
  $('pl-browse').onclick=()=>{state.uploadFile=null;openDrive('select');};
  const acceptedFiles={EBOOK:'.pdf',PRINTABLE:'.pdf',AUDIO:'audio/*',VIDEO:'video/*',OTHER:'image/*,text/*,.zip,.doc,.docx,.ppt,.pptx'};
  function supportsUpload(file,type){
    const mime=String(file.type||'').toLowerCase(),name=String(file.name||'').toLowerCase();
    if(type==='EBOOK'||type==='PRINTABLE')return mime==='application/pdf'||name.endsWith('.pdf');
    if(type==='AUDIO')return mime.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|aac|flac)$/.test(name);
    if(type==='VIDEO')return mime.startsWith('video/')||/\.(mp4|m4v|mov|webm)$/.test(name);
    return mime.startsWith('image/')||mime.startsWith('text/')||/\.(zip|doc|docx|ppt|pptx)$/.test(name);
  }
  $('pl-device').onclick=()=>{if(!state.record||state.busy)return;$('pl-device-file').accept=acceptedFiles[state.record.ResourceType]||'';$('pl-device-file').click();};
  $('pl-device-file').onchange=event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!supportsUpload(file,state.record.ResourceType)){message('Choose a file supported by the selected resource type.',true);event.target.value='';return;}
    state.uploadFile=file;openDrive('upload');
    if(!state.uploadClientId)void prepareUpload().catch(error=>driveMessage(error.message,true));
  };
  $('pl-root').onchange=event=>{if(state.busy||state.rootPending)return;state.rootId=event.target.value;state.drive=null;void browse();};
  $('pl-drive').onclick=event=>{
    if(state.busy)return;
    const folder=event.target.closest('[data-folder]')?.dataset.folder;
    if(folder){void browse(folder);return;}
    const fileId=event.target.closest('[data-file]')?.dataset.file;
    if(fileId&&state.mode==='select'){const file=state.drive?.items.find(item=>item.id===fileId);if(!file||!file.supportedTypes.includes(state.record.ResourceType))return;state.record.DriveFileID=file.id;state.selectedFile=file;if(!state.record.Name)state.record.Name=file.name.replace(/\.[^.]+$/,'');$('pl-drive').close();state.drive=null;saveDraft();render();message('Drive file selected. Review the placement and save.');}
  };
  $('pl-more').onclick=()=>{if(!state.busy&&state.drive?.nextPageToken)void browse(state.folderId,state.drive.nextPageToken);};
  $('pl-drive-cancel').onclick=()=>$('pl-drive').close();
  $('pl-drive').oncancel=event=>{if(state.busy)event.preventDefault();};
  $('pl-drive').onclose=()=>{state.drive=null;state.uploadFile=null;$('pl-device-file').value='';renderDrive();(state.mode==='upload'?$('pl-device'):$('pl-browse')).focus();};
  let uploadPreparation=null;
  async function prepareUpload(){
    if(uploadPreparation)return uploadPreparation;
    uploadPreparation=(async()=>{
      const config=await api('program-library/upload-config');
      if(!config.clientId)throw new Error('Device upload needs a Google Drive connection configured by an administrator.');
      state.uploadClientId=config.clientId;
      if(!window.google?.accounts?.oauth2){
        await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error('Google sign-in could not load.'));document.head.appendChild(script);});
      }
    })();
    try{await uploadPreparation;}catch(error){uploadPreparation=null;throw error;}
  }
  function googleToken(){
    return new Promise((resolve,reject)=>{
      if(!state.uploadClientId||!window.google?.accounts?.oauth2){reject(new Error('Google sign-in is still loading. Try Upload again.'));return;}
      const scope='https://www.googleapis.com/auth/drive';
      const client=window.google.accounts.oauth2.initTokenClient({client_id:state.uploadClientId,scope,
        callback:response=>{
          if(response.error||!response.access_token||response.scope&&!response.scope.split(' ').includes(scope))reject(new Error('Google Drive access was not granted.'));
          else resolve(response.access_token);
        },
        error_callback:()=>reject(new Error('Google Drive sign-in was closed.'))
      });
      client.requestAccessToken({prompt:'select_account'});
    });
  }
  async function googleJson(response,context){
    if(response.ok)return response.json();
    let details={};try{details=await response.json();}catch{}
    const reason=String(details.error?.message||'').slice(0,180);
    throw new Error(`${context} failed (${response.status})${reason?`: ${reason}`:''}.`);
  }
  function fileMimeType(file){
    if(file.type)return file.type;
    const extension=String(file.name||'').split('.').pop()?.toLowerCase();
    return ({pdf:'application/pdf',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac',flac:'audio/flac',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',txt:'text/plain',zip:'application/zip',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'})[extension]||'application/octet-stream';
  }
  async function uploadToDrive(token,file,folderId){
    const headers={Authorization:`Bearer ${token}`};
    const folderResponse=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,mimeType,capabilities(canAddChildren)`,{headers});
    const folder=await googleJson(folderResponse,'Checking the destination');
    if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.capabilities?.canAddChildren!==true)throw new Error('Your Google account needs permission to add files to this folder.');
    const mimeType=fileMimeType(file);
    const initiate=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,parents',{method:'POST',headers:{...headers,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':mimeType,'X-Upload-Content-Length':String(file.size)},body:JSON.stringify({name:file.name,mimeType,parents:[folderId]})});
    if(!initiate.ok)await googleJson(initiate,'Starting the upload');
    const uploadUrl=initiate.headers.get('Location');
    if(!uploadUrl||new URL(uploadUrl).origin!=='https://www.googleapis.com')throw new Error('Google Drive did not return a valid upload session.');
    const uploaded=await fetch(uploadUrl,{method:'PUT',headers:{'Content-Type':mimeType},body:file});
    return googleJson(uploaded,'Uploading the file');
  }
  $('pl-upload').onclick=()=>{
    if(state.busy||state.rootPending||!state.drive||!state.uploadFile)return;
    const file=state.uploadFile,folderId=state.folderId,resourceType=state.record.ResourceType;
    // Start Google's sign-in popup directly from the button click.
    state.busy=true;renderDrive();
    void googleToken().then(async token=>{
      if(!$('pl-drive').open||state.mode!=='upload'||state.uploadFile!==file||state.folderId!==folderId){state.busy=false;renderDrive();return;}
      driveMessage(`Uploading ${file.name} to Google Drive…`);
      try{
        const uploaded=await uploadToDrive(token,file,folderId);
        state.record.DriveFileID=uploaded.id;
        state.selectedFile={id:uploaded.id,name:uploaded.name||file.name,mimeType:uploaded.mimeType||fileMimeType(file),supportedTypes:[resourceType]};
        if(!state.record.Name)state.record.Name=file.name.replace(/\.[^.]+$/,'');
        saveDraft();$('pl-drive').close();render();message('File uploaded to Drive. Review the placement and save the resource.');
      }catch(error){driveMessage(error.message,true);}
      finally{state.busy=false;renderDrive();}
    }).catch(error=>{state.busy=false;renderDrive();driveMessage(error.message,true);});
  };
  async function saveRoot(){
    if(state.busy||!state.data?.coordinatorAvailable)return;
    if(!state.rootPending){
      const folderId=$('pl-root-input').value.trim();
      if(!folderId){driveMessage('Paste a Google Drive folder link or ID.',true);return;}
      state.rootPending={kind:'library-root',body:{kind:'library-root',record:{FolderID:folderId},revision:state.data.revision,operationId:crypto.randomUUID()}};
      sessionStorage.setItem(rootPendingKey,JSON.stringify(state.rootPending));
    }
    state.busy=true;renderDrive();driveMessage('Checking and adding the Drive folder…');
    let addedRoot='';
    try{
      let result;
      try{result=await api('program-timetable/manage-save',state.rootPending.body);}
      catch(error){if(error.code!=='RECOVERY_REQUIRED')throw error;await api('program-timetable/recover');result=await api('program-timetable/manage-save',state.rootPending.body);}
      addedRoot=result.record.FolderID;
      state.rootPending=null;sessionStorage.removeItem(rootPendingKey);$('pl-root-input').value='';
      try{await load();}catch{driveMessage('Folder added. Refresh the Library to show it in the folder list.',true);}
      state.rootId=addedRoot;driveMessage('Folder added. Opening its files.');
    }catch(error){
      if(error.code==='ROW_CHANGED'||error.status&&error.status<500&&error.code!=='RECOVERY_REQUIRED'){
        state.rootPending=null;sessionStorage.removeItem(rootPendingKey);
        driveMessage(error.message,true);
      }else driveMessage(`${error.message} Retry the same folder to confirm it.`,true);
    }finally{state.busy=false;renderDrive();renderEditor();}
    if(addedRoot)void browse();
  }
  $('pl-add-root').onclick=()=>{void saveRoot();};
  $('pl-root-retry').onclick=()=>{void saveRoot();};
  async function save(){
    if(!state.record||state.busy||state.rootPending)return;
    if(!state.pending){
      const row=state.record;
      if(!row.Name.trim()||!row.ProgramSubjectID||!row.DriveFileID){message('Enter a name, choose a subject and select a Drive file.',true);return;}
      state.pending={kind:'resources',body:{kind:'resources',record:structuredClone(row),creating:state.creating,revision:state.data.revision,baseRowRevision:state.data.rowRevisions.resources?.[row.ResourceID]||state.data.emptyRowRevision,operationId:crypto.randomUUID()}};
      sessionStorage.setItem(pendingKey,JSON.stringify(state.pending));
    }
    state.busy=true;render();message('Saving resource…');
    try{
      let result;
      try{result=await api('program-timetable/manage-save',state.pending.body);}
      catch(error){
        if(error.code!=='RECOVERY_REQUIRED')throw error;
        await api('program-timetable/recover');
        result=await api('program-timetable/manage-save',state.pending.body);
      }
      sessionStorage.removeItem(pendingKey);state.pending=null;state.record=null;state.selectedFile=null;saveDraft();
      try{await load();message(result.replayed?'Resource save confirmed after retry.':'Resource saved.');}
      catch{message('Resource saved, but the refreshed list could not be loaded. Choose Refresh to see it.',true);}
    }catch(error){
      if(error.code==='ROW_CHANGED'||error.status&&error.status<500&&error.code!=='RECOVERY_REQUIRED'){
        sessionStorage.removeItem(pendingKey);state.pending=null;
        if(error.code==='ROW_CHANGED')message('This resource changed elsewhere. Your entry is kept. Refresh, compare, and save again.',true);
        else message(error.message,true);
      }else message(`${error.message} Retry the same save to confirm it.`,true);
    }finally{state.busy=false;render();}
  }
  $('pl-save').onclick=()=>{void save();};
  $('pl-retry').onclick=()=>{void save();};
  $('pl-preview').onclick=async event=>{
    if(!state.record||state.creating||state.busy)return;
    if($('pl-preview').getAttribute('href'))return;
    event.preventDefault();state.busy=true;
    try{const result=await api('program-library/access',{resourceId:state.record.ResourceID});$('pl-preview').href=result.url;$('pl-preview').textContent='Open file preview ↗';message('Preview is ready. Choose Open file preview.');}
    catch(error){message(error.message,true);}finally{state.busy=false;}
  };
  try{
    state.pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
    if(state.pending?.kind!=='resources'||!state.pending.body?.operationId||!state.pending.body?.record)throw new Error('Invalid pending save');
  }catch{state.pending=null;sessionStorage.removeItem(pendingKey);}
  try{
    state.rootPending=JSON.parse(sessionStorage.getItem(rootPendingKey)||'null');
    if(state.rootPending?.kind!=='library-root'||!state.rootPending.body?.operationId||!state.rootPending.body?.record?.FolderID)throw new Error('Invalid pending folder');
  }catch{state.rootPending=null;sessionStorage.removeItem(rootPendingKey);}
  try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft?.record){state.record=draft.record;state.creating=Boolean(draft.creating);state.selectedFile=draft.selectedFile;}}catch{sessionStorage.removeItem(draftKey);}
  if(state.pending&&!state.record){state.record=structuredClone(state.pending.body.record);state.creating=Boolean(state.pending.body.creating);saveDraft();}
  void load().then(()=>{if(state.pending)message('An earlier resource save needs confirmation. Choose Retry same save.',true);else if(state.rootPending)message('An earlier folder addition needs confirmation. Open the file finder and choose Retry same folder.',true);}).catch(error=>message(error.message,true));
})();
