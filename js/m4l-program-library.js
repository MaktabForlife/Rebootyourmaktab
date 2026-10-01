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
  const state={data:null,record:null,creating:false,busy:false,pending:null,drive:null,folderId:'',pageToken:'',selectedFile:null};
  const message=(value,error=false)=>{$('pl-message').textContent=value;$('pl-message').classList.toggle('pl-error',error);};
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
    $('pl-drive').hidden=!state.record||!state.drive;
    if(!state.record)return;
    const r=state.record;
    $('pl-editor-title').textContent=state.creating?'Add resource':'Edit resource';
    $('pl-type').value=r.ResourceType;
    $('pl-name').value=r.Name;
    $('pl-description').value=r.Description;
    $('pl-active').value=String(active(r.Active));
    renderChoices();
    $('pl-file').textContent=state.selectedFile?.name|| (r.DriveFileID?`Saved Drive file · ${r.DriveFileID}`:'No file selected.');
    $('pl-save').disabled=state.busy||!state.data?.libraryPrepared||!state.data?.coordinatorAvailable||Boolean(state.pending);
    $('pl-browse').disabled=state.busy||Boolean(state.pending);
    $('pl-preview').hidden=true;
    if(!state.creating&&active(r.Active)){
      $('pl-preview').hidden=false;$('pl-preview').removeAttribute('href');
      $('pl-preview').textContent='Prepare file preview ↗';
      $('pl-preview').dataset.resourceId=r.ResourceID;
    }
  }
  function renderDrive(){
    $('pl-drive').hidden=!state.drive;
    if(!state.drive)return;
    $('pl-breadcrumbs').innerHTML=(state.drive.breadcrumbs||[]).map(part=>`<button type="button" class="pb-secondary pl-breadcrumb" data-folder="${esc(part.id)}">${esc(part.name)}</button>`).join('');
    $('pl-drive-list').innerHTML=(state.drive.items||[]).map(item=>`<div class="pl-drive-item"><span>${item.isFolder?'📁':'📄'} ${esc(item.name)} <small>${esc(item.format||'')}</small></span><button type="button" class="pb-secondary" ${item.isFolder?`data-folder="${esc(item.id)}"`:`data-file="${esc(item.id)}" ${item.supportedTypes.includes(state.record.ResourceType)?'':'disabled'}`}>${item.isFolder?'Open':'Choose'}</button></div>`).join('')||'<p class="pl-empty">No files in this folder.</p>';
    $('pl-more').hidden=!state.drive.nextPageToken;
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
  function start(record,creating){state.record=structuredClone(record);state.creating=creating;state.selectedFile=null;state.drive=null;saveDraft();render();$('pl-name').focus();}
  $('pl-add').onclick=()=>{if(state.busy||state.pending)return;start({ResourceID:`RES-${crypto.randomUUID()}`,ProgramSubjectID:'',LevelID:'',ProgramModuleID:'',TaskID:'',ResourceType:'EBOOK',Name:'',Description:'',DriveFileID:'',Active:true},true);};
  $('pl-list').onclick=event=>{const resourceId=event.target.closest('[data-edit]')?.dataset.edit;if(!resourceId||state.busy||state.pending)return;const row=state.data.rows.resources.find(r=>r.ResourceID===resourceId);if(row)start({...row,Active:active(row.Active)},false);};
  $('pl-cancel').onclick=()=>{if(state.pending)return;state.record=null;state.drive=null;state.selectedFile=null;saveDraft();render();};
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
    state.busy=true;message('Loading protected Drive files…');
    try{state.drive=await api('program-library/browse',{folderId,pageToken});state.folderId=state.drive.folder.id;renderDrive();message('Choose a file supported by the selected resource type.');}
    catch(error){message(error.message,true);}
    finally{state.busy=false;}
  }
  $('pl-browse').onclick=()=>{if(state.record&&!state.busy)void browse();};
  $('pl-drive').onclick=event=>{
    const folder=event.target.closest('[data-folder]')?.dataset.folder;
    if(folder){void browse(folder);return;}
    const fileId=event.target.closest('[data-file]')?.dataset.file;
    if(fileId){const file=state.drive.items.find(item=>item.id===fileId);if(!file||!file.supportedTypes.includes(state.record.ResourceType))return;state.record.DriveFileID=file.id;state.selectedFile=file;if(!state.record.Name)state.record.Name=file.name.replace(/\.[^.]+$/,'');state.drive=null;saveDraft();render();message('Drive file selected. Review the placement and save.');}
  };
  $('pl-more').onclick=()=>{if(state.drive?.nextPageToken)void browse(state.folderId,state.drive.nextPageToken);};
  $('pl-drive-cancel').onclick=()=>{state.drive=null;renderDrive();};
  async function save(){
    if(!state.record||state.busy)return;
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
  try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft?.record){state.record=draft.record;state.creating=Boolean(draft.creating);state.selectedFile=draft.selectedFile;}}catch{sessionStorage.removeItem(draftKey);}
  if(state.pending&&!state.record){state.record=structuredClone(state.pending.body.record);state.creating=Boolean(state.pending.body.creating);saveDraft();}
  void load().then(()=>{if(state.pending)message('An earlier resource save needs confirmation. Choose Retry same save.',true);}).catch(error=>message(error.message,true));
})();
