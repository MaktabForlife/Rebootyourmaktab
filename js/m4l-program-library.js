/* V105.4.2.5 Program Library management. The Worker owns references and Drive access. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const active=value=>value===true||String(value).toUpperCase()==='TRUE';
  const types=[['EBOOK','eBooks'],['PRINTABLE','Printables'],['AUDIO','Audio'],['VIDEO','Video'],['OTHER','Other']];
  const id=new URLSearchParams(location.search).get('program');
  $('pl-view').href=`/programs/library-view.html?program=${encodeURIComponent(id||'')}`;
  const pendingKey=`m4l-program-library-pending:${id}`;
  const draftKey=`m4l-program-library-draft:${id}`;
  const state={data:null,record:null,creating:false,busy:false,pending:null,drive:null,folderId:'',selectedFile:null,selectedCover:null,coverUrls:{},mode:'select',uploadFile:null,uploadSession:null,bulk:null,bulkCoverIndex:-1,devicePickerMode:'single',driveTop:false,driveType:'EBOOK',driveSelections:new Map()};
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
    $('pl-brand').href=state.data.canManageFolder?'/programs/':state.data.accountPath||'/';
    $('pl-curriculum').href=`/programs/manage.html?program=${encodeURIComponent(id)}`;
    $('pl-curriculum').hidden=!state.data.canManageFolder;
    $('pl-setup-link').hidden=!state.data.canManageFolder;
    $('pl-folder-settings').hidden=!state.data.canManageFolder;
    $('pl-destination').textContent=state.data.destinationId?`New files are saved in the Library Drive Resources folder (${state.data.destinationId}).`:'A global admin needs to set the Resources folder before new files can be added.';
    $('pl-prepare').hidden=!state.data.canManageFolder||!state.data.prepared||state.data.libraryPrepared;
    $('pl-prepare').disabled=state.busy||Boolean(state.pending)||!state.data.coordinatorAvailable;
    const cannotAdd=state.busy||Boolean(state.pending)||!state.data.libraryPrepared||state.data.program.status!=='DRAFT'||!state.data.coordinatorAvailable;
    $('pl-add-device').disabled=cannotAdd||Boolean(state.bulk);
    $('pl-add-drive').disabled=cannotAdd||Boolean(state.bulk);
    $('pl-pending').hidden=!state.pending;
    const groups=types.map(([type,label])=>{
      const resources=rows.filter(r=>r.ResourceType===type);
      if(!resources.length)return '';
      const subjects=[...new Set(resources.map(r=>r.ProgramSubjectID))].sort((a,b)=>subjectName(a).localeCompare(subjectName(b)));
      return `<details><summary>${esc(label)} · ${resources.length}</summary>${subjects.map(subjectId=>{
        const placed=resources.filter(r=>r.ProgramSubjectID===subjectId).sort((a,b)=>levelName(a.LevelID).localeCompare(levelName(b.LevelID))||moduleName(a.ProgramModuleID).localeCompare(moduleName(b.ProgramModuleID))||a.Name.localeCompare(b.Name));
        return `<details><summary>${esc(subjectName(subjectId))} · ${placed.length}</summary>${placed.map(row=>{const cover=state.coverUrls[`${row.ResourceID}:${row.CoverDriveFileID}`];return `<div class="pl-resource ${active(row.Active)?'':'is-archived'}">${row.ResourceType==='EBOOK'&&row.CoverDriveFileID?cover?`<img class="pl-cover-thumb" src="${esc(cover)}" alt="Cover of ${esc(row.Name)}">`:'<span class="pl-cover-placeholder" aria-hidden="true">📘</span>':''}<div><strong>${esc(row.Name)}</strong><p>${esc(row.LevelID?levelName(row.LevelID)+' · ':'')}${esc(moduleName(row.ProgramModuleID))}${row.TaskID?` · ${esc(taskName(row.TaskID))}`:''}${active(row.Active)?'':' · Archived'}</p>${row.Author?`<p>By ${esc(row.Author)}${row.Publisher?` · ${esc(row.Publisher)}`:''}${row.PublicationYear?` · ${esc(row.PublicationYear)}`:''}</p>`:''}${row.Description?`<p>${esc(row.Description)}</p>`:''}</div><button type="button" class="pb-secondary" data-edit="${esc(row.ResourceID)}">Edit</button></div>`;}).join('')}</details>`;
      }).join('')}</details>`;
    }).join('');
    $('pl-list').innerHTML=`<h2>Resources · ${rows.length}</h2>${groups||'<p class="pl-empty">No resources yet. Add a protected Drive file to start this Program Library.</p>'}`;
  }
  async function loadCovers(){
    const rows=(state.data?.rows.resources||[]).filter(row=>row.ResourceType==='EBOOK'&&row.CoverDriveFileID&&!state.coverUrls[`${row.ResourceID}:${row.CoverDriveFileID}`]);
    if(!rows.length)return;
    const queue=rows.slice();
    await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{
      while(queue.length){const row=queue.shift();try{const result=await api('program-library/cover',{resourceId:row.ResourceID});state.coverUrls[`${row.ResourceID}:${row.CoverDriveFileID}`]=result.url;}catch{}}
    }));
    renderList();
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
    $('pl-editor').hidden=!state.record||Boolean(state.bulk);
    if(!state.record)return;
    const r=state.record;
    $('pl-editor-title').textContent=state.creating?'Add resource':'Edit resource';
    $('pl-type').value=r.ResourceType;
    $('pl-name').value=r.Name;
    $('pl-description').value=r.Description;
    $('pl-book-details').hidden=r.ResourceType!=='EBOOK';
    for(const [element,field] of [['pl-author','Author'],['pl-publisher','Publisher'],['pl-isbn','ISBN'],['pl-year','PublicationYear']])$(element).value=r[field]||'';
    $('pl-cover-file').textContent=state.selectedCover?.name||(r.CoverDriveFileID?`Saved Drive cover · ${r.CoverDriveFileID}`:'No cover selected.');
    $('pl-cover-device').disabled=state.busy||Boolean(state.pending);
    $('pl-cover-browse').disabled=state.busy||Boolean(state.pending);
    $('pl-cover-paste').disabled=state.busy||Boolean(state.pending)||!state.data?.destinationId;
    $('pl-cover-online').disabled=state.busy||Boolean(state.pending)||!state.data?.destinationId;
    $('pl-active').value=String(active(r.Active));
    renderChoices();
    $('pl-file').textContent=state.selectedFile?.name|| (r.DriveFileID?`Saved Drive file · ${r.DriveFileID}`:'No file selected.');
    $('pl-save').disabled=state.busy||!state.data?.libraryPrepared||!state.data?.coordinatorAvailable||Boolean(state.pending);
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
    const uploading=state.mode==='upload'||state.mode==='cover-upload',cover=state.mode==='cover-select'||state.mode==='cover-upload'||state.mode==='bulk-cover-select';
    $('pl-drive-title').textContent=uploading?'Upload to Resources':cover?'Choose a book cover from Library Drive':'Choose from Library Drive';
    $('pl-drive-help').textContent=uploading?`Upload ${state.uploadFile?.name||'your file'} to the Resources folder.`:cover?'Choose a JPG, PNG or WebP image already in Resources.':state.driveTop?'Choose a file, or select several files to review together.':'Choose a file already in the Library Drive Resources folder.';
    $('pl-drive-type-wrap').hidden=cover;
    if(!cover){
      const available=uploading&&state.uploadFile?supportedUploadTypes(state.uploadFile):types.map(([type])=>type);
      const selected=state.driveTop?state.driveType:state.record?.ResourceType||available[0]||'EBOOK';
      $('pl-drive-type').innerHTML=types.filter(([type])=>available.includes(type)).map(([type,label])=>option(type,label,selected)).join('');
      $('pl-drive-type').value=selected;
      $('pl-drive-type').disabled=state.busy||Boolean(state.uploadSession);
    }
    $('pl-upload').hidden=!uploading;
    $('pl-upload').disabled=state.busy||!state.data?.destinationId||!state.uploadFile;
    $('pl-drive-selected').hidden=!state.driveTop||state.mode!=='select';
    $('pl-drive-selected').disabled=state.busy||!state.driveSelections.size;
    $('pl-drive-selected').textContent=`Review ${state.driveSelections.size} selected file${state.driveSelections.size===1?'':'s'}`;
    $('pl-drive-cancel').disabled=state.busy;
    if(!state.drive){$('pl-breadcrumbs').innerHTML='';$('pl-drive-list').innerHTML='';$('pl-more').hidden=true;return;}
    $('pl-breadcrumbs').innerHTML=(state.drive.breadcrumbs||[]).map(part=>`<button type="button" class="pb-secondary pl-breadcrumb" data-folder="${esc(part.id)}">${esc(part.name)}</button>`).join('');
    $('pl-drive-list').innerHTML=uploading?'':(state.drive.items||[]).map(item=>{
      const canChoose=cover?['image/jpeg','image/png','image/webp'].includes(item.mimeType):item.supportedTypes?.includes(state.driveTop?state.driveType:state.record?.ResourceType);
      const multi=state.driveTop&&state.mode==='select'&&canChoose;
      return `<div class="pl-drive-item"><span>${item.isFolder?'📁':'📄'} ${esc(item.name)} <small>${esc(item.format||'')}</small></span>${item.isFolder?`<button type="button" class="pb-secondary" data-folder="${esc(item.id)}">Open folder</button>`:`<span class="pl-drive-controls">${multi?`<label><input type="checkbox" data-drive-select="${esc(item.id)}" aria-label="Select ${esc(item.name)}" ${state.driveSelections.has(item.id)?'checked':''}> Select</label>`:''}<button type="button" class="pb-secondary" data-file="${esc(item.id)}" ${canChoose?'':'disabled'}>Choose ${cover?'cover':'file'}</button></span>`}</div>`;
    }).join('')||'<p class="pl-empty">No files in Resources yet.</p>';
    $('pl-more').hidden=!state.drive.nextPageToken;
    $('pl-more').disabled=state.busy;
  }
  function renderBulk(){
    const bulk=state.bulk;
    $('pl-bulk').hidden=!bulk;
    if(!bulk||!state.data)return;
    const locked=state.busy||bulk.items.some(item=>item.pending);
    const subjects=state.data.rows.subjects.filter(row=>active(row.Active));
    $('pl-bulk-subject').innerHTML=option('','Choose a subject',bulk.subjectId)+subjects.map(row=>option(row.ProgramSubjectID,subjectName(row.ProgramSubjectID),bulk.subjectId)).join('');
    const levels=state.data.rows.levels.filter(row=>row.ProgramSubjectID===bulk.subjectId&&active(row.Active));
    $('pl-bulk-level').innerHTML=option('','No level',bulk.levelId)+levels.map(row=>option(row.LevelID,row.Name,bulk.levelId)).join('');
    const modules=state.data.rows.modules.filter(row=>row.ProgramSubjectID===bulk.subjectId&&(!bulk.levelId||row.LevelID===bulk.levelId)&&active(row.Active));
    $('pl-bulk-module').innerHTML=option('','General',bulk.moduleId)+modules.map(row=>option(row.ProgramModuleID,row.Name,bulk.moduleId)).join('');
    const tasks=(state.data.rows.tasks||[]).filter(row=>row.ProgramSubjectID===bulk.subjectId&&row.ProgramModuleID===(bulk.moduleId||'')&&active(row.Active));
    $('pl-bulk-task').innerHTML=option('','No task',bulk.taskId)+tasks.map(row=>option(row.TaskID,row.Name,bulk.taskId)).join('');
    for(const key of ['subject','level','module','task'])$('pl-bulk-'+key).disabled=locked;
    $('pl-bulk-list').innerHTML=bulk.items.map((item,index)=>{
      const disabled=locked||item.saved?'disabled':'';
      const field=(label,key,max=160)=>`<label>${label}<input data-bulk-index="${index}" data-bulk-field="${key}" value="${esc(item[key])}" maxlength="${max}" ${disabled}></label>`;
      const category=`<label>Category<select data-bulk-index="${index}" data-bulk-field="type" ${disabled}>${types.filter(([type])=>item.supportedTypes.includes(type)).map(([type,label])=>option(type,label,item.type)).join('')}</select></label>`;
      const bookFields=item.type==='EBOOK'?`${field('Author (optional)','author')}${field('Publisher (optional)','publisher')}${field('ISBN (optional)','isbn',32)}${field('Publication year (optional)','year',4)}<label class="pl-bulk-cover">Cover image (optional) · ${esc(item.coverFile?.name||(item.coverDriveFileId?'Cover selected':'none selected'))}<input type="file" data-bulk-cover="${index}" accept="image/jpeg,image/png,image/webp" ${disabled}></label><div class="pl-bulk-cover pl-source-actions"><button type="button" class="pb-secondary" data-bulk-cover-drive="${index}" ${disabled}>Choose cover from Library Drive</button><button type="button" class="pb-secondary" data-bulk-cover-online="${index}" ${disabled}>Find cover online</button><button type="button" class="pb-secondary" data-bulk-cover-paste="${index}" ${disabled}>Paste cover</button>${(item.coverFile||item.coverDriveFileId)&&!item.saved?`<button type="button" class="pb-secondary" data-bulk-clear-cover="${index}" ${locked?'disabled':''}>Remove cover</button>`:''}</div>`:'';
      return `<div class="pl-bulk-row"><div class="pl-bulk-head"><div><h3>File ${index+1}</h3><p>${esc(item.file.name)}</p></div>${item.saved?'':`<button type="button" class="pb-secondary" data-bulk-remove="${index}" ${locked?'disabled':''}>Remove</button>`}</div><div class="pl-bulk-fields">${category}${field('Title','name')}${bookFields}<label class="pl-bulk-cover">Description (optional)<textarea data-bulk-index="${index}" data-bulk-field="description" maxlength="1000" rows="2" ${disabled}>${esc(item.description)}</textarea></label></div><p class="pl-bulk-row-status ${item.error?'pl-error':''}">${esc(item.status||'Ready to save')}</p></div>`;
    }).join('');
    const remaining=bulk.items.filter(item=>!item.saved).length;
    $('pl-bulk-start').textContent=bulk.source==='drive'?`Save ${remaining} resource${remaining===1?'':'s'}`:bulk.items.some(item=>item.driveFileId||item.uploadSession||item.coverUploadSession||item.pending)?`Continue upload · ${remaining} remaining`:`Upload and save ${remaining} resource${remaining===1?'':'s'}`;
    $('pl-bulk-start').disabled=state.busy||!remaining||!bulk.subjectId||!state.data.destinationId||Boolean(state.pending);
    $('pl-bulk-more').textContent=bulk.source==='drive'?'Add more from Library Drive':'Add more from device';
    $('pl-bulk-more').disabled=locked||bulk.items.length>=25||bulk.items.every(item=>item.saved);
    $('pl-bulk-cancel').disabled=locked;
    $('pl-bulk-status').textContent=bulk.status||`${bulk.items.length} file${bulk.items.length===1?'':'s'} selected. Review the details, then ${bulk.source==='drive'?'save':'upload and save'}.`;
    $('pl-bulk-status').classList.toggle('pl-error',Boolean(bulk.error));
  }
  function render(){renderList();renderEditor();renderDrive();renderBulk();}
  async function load(){
    state.data=await api('program-library/manage');state.data.rows.resources||=[];
    if(state.record&&!state.creating){
      const saved=state.data.rows.resources.find(row=>row.ResourceID===state.record.ResourceID);
      if(!saved)message('This resource was removed elsewhere. Your entry is kept.',true);
    }
    render();void loadCovers();
    if(!state.data.prepared)message('Prepare management tables in Curriculum first.');
    else if(!state.data.libraryPrepared)message('Prepare the Program task and Library tables to begin. Existing records are preserved.');
    else if(!state.data.coordinatorAvailable)message('Saving needs the Program coordinator binding.');
    else message('Choose a resource to edit, or add a file from your device or Library Drive.');
  }
  function start(record,creating){if($('pl-drive').open)$('pl-drive').close();state.record=structuredClone(record);state.creating=creating;state.selectedFile=null;state.selectedCover=null;state.drive=null;state.uploadFile=null;saveDraft();render();$('pl-name').focus();}
  $('pl-add-device').onclick=()=>chooseDeviceFile({anyType:true,multiple:true,fromTop:true});
  $('pl-add-drive').onclick=()=>{if(!state.busy&&!state.pending&&!state.bulk){state.uploadFile=null;openDrive('select',true);}};
  function ensureBulk(source){
    if(!state.bulk||state.bulk.items.every(item=>item.saved))state.bulk={source,subjectId:'',levelId:'',moduleId:'',taskId:'',items:[],status:'',error:false};
    return state.bulk;
  }
  function appendDeviceBulkFiles(files){
    const existing=state.bulk?.items.every(item=>item.saved)?0:state.bulk?.items.length||0;
    if(files.length+existing>25){message('Choose up to 25 resources in one batch.',true);return;}
    if(files.some(file=>!supportedUploadTypes(file).length||!file.size||file.size>5*1024*1024*1024||file.name.length>160)){
      message('Choose supported, nonempty files with names up to 160 characters (5 GB maximum each).',true);return;
    }
    const bulk=ensureBulk('device');
    for(const file of files){const supportedTypes=supportedUploadTypes(file);bulk.items.push({id:`RES-${crypto.randomUUID()}`,file,supportedTypes,type:supportedTypes[0],name:file.name.replace(/\.[^.]+$/,'').slice(0,160),description:'',author:'',publisher:'',isbn:'',year:'',coverFile:null,driveFileId:'',coverDriveFileId:'',uploadSession:null,coverUploadSession:null,pending:null,saved:false,status:'Ready to upload',error:false});}
    bulk.status=`${bulk.items.length} file${bulk.items.length===1?'':'s'} selected. Review the details, then upload and save.`;
    bulk.error=false;render();$('pl-bulk-subject').focus();
  }
  function appendDriveBulkFiles(files){
    const fresh=files.filter(file=>!state.bulk?.items.some(item=>item.driveFileId===file.id));
    const existing=state.bulk?.items.every(item=>item.saved)?0:state.bulk?.items.length||0;
    if(fresh.length+existing>25){driveMessage('Choose up to 25 resources in one batch.',true);return false;}
    if(!fresh.length){driveMessage('These files are already in the review list.',true);return false;}
    const bulk=ensureBulk('drive');
    for(const file of fresh){const supportedTypes=file.supportedTypes.filter(type=>types.some(([key])=>key===type));bulk.items.push({id:`RES-${crypto.randomUUID()}`,file:{name:file.name},supportedTypes,type:supportedTypes.includes(state.driveType)?state.driveType:supportedTypes[0],name:file.name.replace(/\.[^.]+$/,'').slice(0,160),description:'',author:'',publisher:'',isbn:'',year:'',coverFile:null,driveFileId:file.id,coverDriveFileId:'',uploadSession:null,coverUploadSession:null,pending:null,saved:false,status:'Ready to save',error:false});}
    bulk.status=`${bulk.items.length} file${bulk.items.length===1?'':'s'} selected from Library Drive. Review the details, then save.`;
    bulk.error=false;$('pl-drive').close();render();$('pl-bulk-subject').focus();return true;
  }
  $('pl-bulk-more').onclick=()=>{
    if(!state.bulk||state.busy||state.bulk.items.some(item=>item.pending))return;
    if(state.bulk.source==='drive')openDrive('select',true);
    else chooseDeviceFile({anyType:true,multiple:true,fromTop:true});
  };
  $('pl-bulk-subject').onchange=event=>{if(!state.bulk||state.busy)return;Object.assign(state.bulk,{subjectId:event.target.value,levelId:'',moduleId:'',taskId:''});renderBulk();};
  $('pl-bulk-level').onchange=event=>{if(!state.bulk||state.busy)return;Object.assign(state.bulk,{levelId:event.target.value,moduleId:'',taskId:''});renderBulk();};
  $('pl-bulk-module').onchange=event=>{if(!state.bulk||state.busy)return;state.bulk.moduleId=event.target.value;state.bulk.taskId='';const module=state.data.rows.modules.find(row=>row.ProgramModuleID===event.target.value);if(module)state.bulk.levelId=module.LevelID||'';renderBulk();};
  $('pl-bulk-task').onchange=event=>{if(!state.bulk||state.busy)return;state.bulk.taskId=event.target.value;renderBulk();};
  $('pl-bulk-list').oninput=event=>{
    const index=Number(event.target.dataset?.bulkIndex),field=event.target.dataset?.bulkField,item=state.bulk?.items[index];
    if(!item||item.saved||item.pending||state.busy||!['name','description','author','publisher','isbn','year'].includes(field))return;
    item[field]=event.target.value;
  };
  $('pl-bulk-list').onchange=event=>{
    if(event.target.dataset?.bulkField==='type'){
      const item=state.bulk?.items[Number(event.target.dataset.bulkIndex)],type=event.target.value;
      if(item&&!item.saved&&!item.pending&&!state.busy&&item.supportedTypes.includes(type)){
        item.type=type;
        if(type!=='EBOOK'){item.coverFile=null;item.coverUploadSession=null;item.coverDriveFileId='';}
        renderBulk();
      }
      return;
    }
    if(!event.target.dataset||!Object.hasOwn(event.target.dataset,'bulkCover'))return;
    setBulkCover(Number(event.target.dataset.bulkCover),event.target.files?.[0]);
  };
  function setBulkCover(index,file){
    const item=state.bulk?.items[index];
    if(!item||item.saved||item.pending||state.busy)return;
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(fileMimeType(file))||!file.size||file.size>20*1024*1024){
      item.status='Choose a JPG, PNG or WebP cover up to 20 MB.';item.error=true;renderBulk();return;
    }
    item.coverFile=file;item.coverUploadSession=null;item.coverDriveFileId='';item.status='Cover selected. Ready to upload.';item.error=false;renderBulk();
  }
  $('pl-bulk-cover-file').onchange=event=>{setBulkCover(state.bulkCoverIndex,event.target.files?.[0]);event.target.value='';};
  $('pl-bulk-list').onclick=event=>{
    for(const [attribute,mode] of [['bulkCoverDrive','drive'],['bulkCoverOnline','online'],['bulkCoverPaste','paste']]){
      const button=event.target.closest(`[data-${attribute.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())}]`);
      if(!button)continue;
      const index=Number(button.dataset[attribute]),item=state.bulk?.items[index];
      if(!item||item.saved||item.type!=='EBOOK'||state.busy)return;
      state.bulkCoverIndex=index;
      if(mode==='drive')openDrive('bulk-cover-select');
      else openCoverDialog(mode==='paste'?'pl-cover-paste':'pl-cover-online',index);
      return;
    }
    const clear=event.target.closest('[data-bulk-clear-cover]');
    if(clear&&!state.busy&&!state.bulk?.items.some(item=>item.pending)){
      const item=state.bulk?.items[Number(clear.dataset.bulkClearCover)];
      if(item&&!item.saved){item.coverFile=null;item.coverUploadSession=null;item.coverDriveFileId='';item.status='Ready to save';item.error=false;renderBulk();}
      return;
    }
    const button=event.target.closest('[data-bulk-remove]');if(!button||state.busy||state.bulk?.items.some(item=>item.pending))return;
    const index=Number(button.dataset.bulkRemove),item=state.bulk?.items[index];
    if(!item||item.saved)return;
    state.bulk.items.splice(index,1);
    if(!state.bulk.items.length)state.bulk=null;
    render();
  };
  $('pl-bulk-cancel').onclick=()=>{if(state.busy||state.bulk?.items.some(item=>item.pending))return;const uploaded=state.bulk?.source==='device'&&state.bulk.items.some(item=>item.driveFileId&&!item.saved);state.bulk=null;render();message(uploaded?'Review closed. Files uploaded without saved entries remain in Resources and can be added from Library Drive.':'Resource review closed.');};
  $('pl-list').onclick=event=>{const resourceId=event.target.closest('[data-edit]')?.dataset.edit;if(!resourceId||state.busy||state.pending||state.bulk)return;const row=state.data.rows.resources.find(r=>r.ResourceID===resourceId);if(row)start({...row,Active:active(row.Active)},false);};
  $('pl-cancel').onclick=()=>{if(state.pending)return;if($('pl-drive').open)$('pl-drive').close();state.record=null;state.drive=null;state.selectedFile=null;saveDraft();render();};
  $('pl-refresh').onclick=async()=>{if(state.busy)return;state.busy=true;try{await load();}catch(error){message(error.message,true);}finally{state.busy=false;render();}};
  $('pl-prepare').onclick=async()=>{if(state.busy||state.pending)return;state.busy=true;try{await api('program-library/prepare-library');await load();message('Program task and Library tables are ready.');}catch(error){message(error.message,true);}finally{state.busy=false;render();}};
  for(const [element,field] of [['pl-type','ResourceType'],['pl-name','Name'],['pl-description','Description'],['pl-active','Active'],['pl-author','Author'],['pl-publisher','Publisher'],['pl-isbn','ISBN'],['pl-year','PublicationYear']]){
    $(element).addEventListener(['pl-name','pl-description','pl-author','pl-publisher','pl-isbn','pl-year'].includes(element)?'input':'change',event=>{
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
    try{state.drive=await api('program-library/browse',{folderId,pageToken});state.folderId=state.drive.folder.id;driveMessage(state.mode.includes('cover')?'Choose a JPG, PNG or WebP cover image.':'Choose a file supported by the selected resource type.');}
    catch(error){driveMessage(error.message,true);}
    finally{state.busy=false;renderDrive();}
  }
  function openDrive(mode,fromTop=false){if((!state.record&&!fromTop&&mode!=='bulk-cover-select')||state.busy)return;state.mode=mode;state.driveTop=fromTop;state.driveType=fromTop?'EBOOK':state.record?.ResourceType||'EBOOK';state.driveSelections=new Map();state.drive=null;state.folderId=state.data?.destinationId||'';renderDrive();$('pl-drive').showModal();if(mode.includes('upload'))driveMessage('Ready to upload to Resources.');else void browse();}
  $('pl-browse').onclick=()=>{state.uploadFile=null;openDrive('select');};
  $('pl-cover-browse').onclick=()=>{state.uploadFile=null;openDrive('cover-select');};
  let coverDialogTrigger='pl-cover-online';
  function openCoverDialog(trigger,bulkIndex=-1){
    const bulkItem=bulkIndex>=0?state.bulk?.items[bulkIndex]:null;
    if((!state.record&&!bulkItem)||state.busy||state.pending||!state.data?.destinationId)return;
    state.bulkCoverIndex=bulkIndex;
    coverDialogTrigger=trigger;
    $('pl-cover-title').value=bulkItem?.name||state.record?.Name||'';
    $('pl-cover-author').value=bulkItem?.author||state.record?.Author||'';
    $('pl-cover-publisher').value=bulkItem?.publisher||state.record?.Publisher||'';
    $('pl-cover-query').value='';
    $('pl-cover-paste-status').textContent='Copy the image itself, not its address.';
    $('pl-cover-search').showModal();$(trigger==='pl-cover-paste'?'pl-cover-paste-target':'pl-cover-title').focus();
  }
  $('pl-cover-online').onclick=()=>openCoverDialog('pl-cover-online');
  $('pl-cover-paste').onclick=()=>openCoverDialog('pl-cover-paste');
  $('pl-cover-search-form').onsubmit=event=>{
    const title=$('pl-cover-title').value.trim();
    if(!title){event.preventDefault();$('pl-cover-title').focus();return;}
    $('pl-cover-query').value=[title,$('pl-cover-author').value.trim(),$('pl-cover-publisher').value.trim(),'book cover'].filter(Boolean).join(' ');
  };
  $('pl-cover-use-device').onclick=()=>{const bulk=state.bulkCoverIndex>=0;$('pl-cover-search').close();$(bulk?'pl-bulk-cover-file':'pl-cover-device-file').click();};
  $('pl-cover-search-close').onclick=()=>$('pl-cover-search').close();
  $('pl-cover-search').onclose=()=>{if(!$('pl-drive').open)$(state.bulkCoverIndex>=0?'pl-bulk-subject':coverDialogTrigger).focus();};
  $('pl-cover-paste-target').onpaste=event=>{
    event.preventDefault();
    if((!state.record&&state.bulkCoverIndex<0)||state.busy||state.pending)return;
    const items=Array.from(event.clipboardData?.items||[]);
    const pasted=items.filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).find(Boolean)
      ||Array.from(event.clipboardData?.files||[]).find(file=>fileMimeType(file).startsWith('image/'));
    if(!pasted){$('pl-cover-paste-status').textContent='No image was found. Choose Copy image, then paste here.';return;}
    const mimeType=fileMimeType(pasted);
    const extension=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[mimeType];
    if(!extension){$('pl-cover-paste-status').textContent='Paste a JPG, PNG or WebP image.';return;}
    if(!pasted.size||pasted.size>20*1024*1024){$('pl-cover-paste-status').textContent='Choose a cover image up to 20 MB.';return;}
    const file=new File([pasted],`book-cover-${Date.now()}.${extension}`,{type:mimeType});
    if(state.bulkCoverIndex>=0){
      const bulkItem=state.bulk?.items[state.bulkCoverIndex];
      if(!bulkItem||bulkItem.saved)return;
      bulkItem.coverFile=file;bulkItem.coverDriveFileId='';bulkItem.coverUploadSession=null;bulkItem.status='Cover selected. Ready to save.';bulkItem.error=false;
      $('pl-cover-search').close();renderBulk();return;
    }
    state.uploadFile=file;
    state.uploadSession=null;
    $('pl-cover-search').close();openDrive('cover-upload');
  };
  const acceptedFiles={EBOOK:'.pdf',PRINTABLE:'.pdf',AUDIO:'audio/*',VIDEO:'video/*',OTHER:'image/*,text/*,.zip,.doc,.docx,.ppt,.pptx'};
  function supportsUpload(file,type){
    const mime=String(file.type||file.mimeType||'').toLowerCase(),name=String(file.name||'').toLowerCase();
    if(type==='EBOOK'||type==='PRINTABLE')return mime==='application/pdf'||name.endsWith('.pdf');
    if(type==='AUDIO')return mime.startsWith('audio/')||/\.(mp3|m4a|wav|ogg|aac|flac)$/.test(name);
    if(type==='VIDEO')return mime.startsWith('video/')||/\.(mp4|m4v|mov|webm)$/.test(name);
    return mime.startsWith('image/')||mime.startsWith('text/')||/\.(jpg|jpeg|png|gif|webp|txt|zip|doc|docx|ppt|pptx)$/.test(name);
  }
  function supportedUploadTypes(file){return types.map(([type])=>type).filter(type=>supportsUpload(file,type));}
  function chooseDeviceFile({anyType=false,multiple=false,fromTop=false}={}){
    if((!state.record&&!fromTop)||state.busy)return;
    state.devicePickerMode=fromTop?'review':'editor';
    $('pl-device-file').multiple=multiple;
    $('pl-device-file').accept=anyType?Object.values(acceptedFiles).join(','):acceptedFiles[state.record.ResourceType]||'';
    $('pl-device-file').click();
  }
  $('pl-device').onclick=()=>chooseDeviceFile();
  $('pl-cover-device').onclick=()=>{if(!state.record||state.busy)return;$('pl-cover-device-file').accept='image/jpeg,image/png,image/webp';$('pl-cover-device-file').click();};
  $('pl-device-file').onchange=event=>{
    const files=Array.from(event.target.files||[]);if(!files.length)return;
    event.target.value='';
    if(state.devicePickerMode==='review'){appendDeviceBulkFiles(files);return;}
    const file=files[0];
    const available=supportedUploadTypes(file);
    if(!available.length){message('Choose a supported Library file.',true);return;}
    if(!available.includes(state.record.ResourceType)){
      state.record.ResourceType=available[0];
      if(state.selectedFile&&!state.selectedFile.supportedTypes.includes(state.record.ResourceType)){state.selectedFile=null;state.record.DriveFileID='';}
      renderEditor();saveDraft();
    }
    state.uploadFile=file;state.uploadSession=null;openDrive('upload');
  };
  $('pl-drive-type').onchange=event=>{
    if((!state.record&&!state.driveTop)||state.busy||state.uploadSession)return;
    const type=event.target.value;
    if(!types.some(([key])=>key===type)||state.mode==='upload'&&state.uploadFile&&!supportsUpload(state.uploadFile,type))return;
    if(state.driveTop){state.driveType=type;state.driveSelections.clear();renderDrive();return;}
    state.record.ResourceType=type;
    if(state.selectedFile&&!state.selectedFile.supportedTypes.includes(type)){state.selectedFile=null;state.record.DriveFileID='';}
    saveDraft();renderEditor();renderDrive();
  };
  $('pl-cover-device-file').onchange=event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(fileMimeType(file))){message('Choose a JPG, PNG or WebP cover image.',true);event.target.value='';return;}
    state.uploadFile=file;state.uploadSession=null;openDrive('cover-upload');
  };
  $('pl-drive').onclick=event=>{
    if(state.busy)return;
    const folder=event.target.closest('[data-folder]')?.dataset.folder;
    if(folder){void browse(folder);return;}
    const fileId=event.target.closest('[data-file]')?.dataset.file;
    if(fileId&&(state.mode==='select'||state.mode==='cover-select'||state.mode==='bulk-cover-select')){
      const file=state.drive?.items.find(item=>item.id===fileId);
      if(!file)return;
      if(state.mode==='bulk-cover-select'){
        if(!['image/jpeg','image/png','image/webp'].includes(file.mimeType))return;
        const item=state.bulk?.items[state.bulkCoverIndex];
        if(!item||item.saved)return;
        item.coverDriveFileId=file.id;item.coverFile=null;item.coverUploadSession=null;item.status='Cover selected. Ready to save.';item.error=false;
        $('pl-drive').close();renderBulk();return;
      }
      if(state.mode==='cover-select'){
        if(!['image/jpeg','image/png','image/webp'].includes(file.mimeType))return;
        state.record.CoverDriveFileID=file.id;state.selectedCover=file;
      }else if(state.driveTop){
        if(!file.supportedTypes.includes(state.driveType))return;
        appendDriveBulkFiles([file]);return;
      }else{
        if(!file.supportedTypes.includes(state.record.ResourceType))return;
        state.record.DriveFileID=file.id;state.selectedFile=file;if(!state.record.Name)state.record.Name=file.name.replace(/\.[^.]+$/,'');
      }
      $('pl-drive').close();state.drive=null;saveDraft();render();message(state.mode==='cover-select'?'Cover image selected. Save the resource to keep it.':'Library Drive file selected. Review the placement and save.');
    }
  };
  $('pl-drive').onchange=event=>{
    const fileId=event.target?.dataset?.driveSelect;
    if(!fileId||!state.driveTop||state.busy)return;
    const file=state.drive?.items.find(item=>item.id===fileId);
    if(!file||!file.supportedTypes?.includes(state.driveType))return;
    if(event.target.checked)state.driveSelections.set(fileId,file);else state.driveSelections.delete(fileId);
    $('pl-drive-selected').disabled=!state.driveSelections.size;
    $('pl-drive-selected').textContent=`Review ${state.driveSelections.size} selected file${state.driveSelections.size===1?'':'s'}`;
  };
  $('pl-drive-selected').onclick=()=>{
    if(state.busy||!state.driveSelections.size)return;
    appendDriveBulkFiles([...state.driveSelections.values()]);
  };
  $('pl-more').onclick=()=>{if(!state.busy&&state.drive?.nextPageToken)void browse(state.folderId,state.drive.nextPageToken);};
  $('pl-drive-cancel').onclick=()=>$('pl-drive').close();
  $('pl-drive').oncancel=event=>{if(state.busy)event.preventDefault();};
  $('pl-drive').onclose=()=>{const fromTop=state.driveTop,bulk=Boolean(state.bulk);state.drive=null;state.driveTop=false;state.driveSelections.clear();state.uploadFile=null;state.uploadSession=null;$('pl-device-file').value='';$('pl-cover-device-file').value='';renderDrive();(state.mode==='bulk-cover-select'?$('pl-bulk-subject'):fromTop?bulk?$('pl-bulk-more'):$('pl-add-drive'):state.mode.includes('cover')?state.mode.includes('upload')?$('pl-cover-device'):$('pl-cover-browse'):state.mode==='upload'?$('pl-device'):$('pl-browse')).focus();};
  function fileMimeType(file){
    if(file.type)return file.type;
    const extension=String(file.name||'').split('.').pop()?.toLowerCase();
    return ({pdf:'application/pdf',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',aac:'audio/aac',flac:'audio/flac',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',txt:'text/plain',zip:'application/zip',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'})[extension]||'application/octet-stream';
  }
  async function uploadToDrive(file,folderId,resourceType,holder=state,progress=driveMessage,retryLabel='Upload to Resources',sessionKey='uploadSession'){
    let session=holder[sessionKey];
    if(!session||session.file!==file||session.folderId!==folderId||session.resourceType!==resourceType){
      const started=await api('program-library/upload-start',{fileName:file.name,mimeType:fileMimeType(file),size:file.size,resourceType});
      session={file,folderId,resourceType,ticket:started.ticket,chunkSize:started.chunkSize,offset:0};
      holder[sessionKey]=session;
    }
    const token=localStorage.getItem('m4l_account_token');
    if(!token)throw new Error('Sign in to your Academy account again.');
    let offset=session.offset,stalled=0;
    while(offset<file.size){
      const end=Math.min(offset+session.chunkSize,file.size);
      progress(`Uploading ${file.name}… ${Math.floor(offset/file.size*100)}%`);
      const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/program-library/upload-chunk`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Library-Upload-Ticket':session.ticket,'X-Library-Upload-Offset':String(offset),'Content-Type':'application/octet-stream'},body:file.slice(offset,end)});
      let result;try{result=await response.json();}catch{throw new Error('The upload response could not be read. Try the file again.');}
      if(!response.ok||!result.success){
        if(result.code==='SHEETS_RATE_LIMITED'){
          const seconds=Math.max(1,Math.ceil(Number(result.retryAfterMs||60000)/1000));
          throw new Error(`Google Sheets is busy. Wait ${seconds} seconds, then click ${retryLabel} again. The upload will continue from ${Math.floor(offset/file.size*100)}%.`);
        }
        throw new Error(result.error||'The upload stopped. Try the file again.');
      }
      if(result.complete){holder[sessionKey]=null;return result.file;}
      if(!Number.isSafeInteger(result.nextOffset)||result.nextOffset<0||result.nextOffset>=file.size)throw new Error('Google Drive returned an invalid upload position.');
      stalled=result.nextOffset<=offset?stalled+1:0;if(stalled>2)throw new Error('The upload stopped making progress. Try the file again.');
      offset=result.nextOffset;session.offset=offset;
    }
    throw new Error('Google Drive did not confirm the uploaded file.');
  }
  $('pl-upload').onclick=async()=>{
    if(state.busy||!state.data?.destinationId||!state.uploadFile)return;
    const file=state.uploadFile,folderId=state.data.destinationId,cover=state.mode==='cover-upload',resourceType=cover?'COVER':state.record.ResourceType;
    state.busy=true;renderDrive();
    try{
      const uploaded=await uploadToDrive(file,folderId,resourceType);
      if(cover){state.record.CoverDriveFileID=uploaded.id;state.selectedCover={...uploaded};}
      else{state.record.DriveFileID=uploaded.id;state.selectedFile={...uploaded,supportedTypes:supportedUploadTypes(file)};if(!state.record.Name)state.record.Name=file.name.replace(/\.[^.]+$/,'');}
      saveDraft();$('pl-drive').close();render();message(cover?'Cover uploaded to Drive. Save the resource to keep the link.':'File uploaded to Drive. Review the placement and save the resource.');
    }catch(error){driveMessage(error.code==='SHEETS_RATE_LIMITED'?`${error.message} Wait one minute, then click Upload to Resources again.`:error.message,true);}
    finally{state.busy=false;render();}
  };
  function bulkIssue(bulk){
    if(!bulk.subjectId)return 'Choose a subject for the resources.';
    for(const [index,item] of bulk.items.entries()){
      if(item.saved||item.pending)continue;
      if(!item.name.trim())return `Enter a title for file ${index+1}.`;
      if(!item.supportedTypes.includes(item.type))return `Choose a valid category for file ${index+1}.`;
      if(item.type==='EBOOK'&&item.isbn.trim()&&(!/^[0-9Xx -]+$/.test(item.isbn.trim())||!(/^(?:\d{9}[\dXx]|\d{13})$/.test(item.isbn.replace(/[ -]/g,'')))))return `Enter a valid ISBN for file ${index+1}.`;
      if(item.type==='EBOOK'&&item.year.trim()&&(!/^\d{4}$/.test(item.year.trim())||Number(item.year)<1000||Number(item.year)>2100))return `Enter a valid four-digit publication year for file ${index+1}.`;
    }
    return '';
  }
  function bulkItemStatus(item,value,error=false){item.status=value;item.error=error;renderBulk();}
  $('pl-bulk-start').onclick=async()=>{
    const bulk=state.bulk;
    if(!bulk||state.busy||state.pending||!state.data?.destinationId||bulk.items.every(item=>item.saved))return;
    const issue=bulkIssue(bulk);
    if(issue){bulk.status=issue;bulk.error=true;renderBulk();return;}
    state.busy=true;bulk.error=false;bulk.status='Saving resources one at a time. Keep this page open.';render();
    let current=null;
    try{
      for(const item of bulk.items){
        if(item.saved)continue;
        current=item;
        const progress=value=>bulkItemStatus(item,value);
        if(!item.driveFileId){
          const file=await uploadToDrive(item.file,state.data.destinationId,item.type,item,progress,'Continue upload');
          item.driveFileId=file.id;bulkItemStatus(item,'PDF uploaded to Resources.');
        }
        if(item.type==='EBOOK'&&item.coverFile&&!item.coverDriveFileId){
          const cover=await uploadToDrive(item.coverFile,state.data.destinationId,'COVER',item,progress,'Continue upload','coverUploadSession');
          item.coverDriveFileId=cover.id;bulkItemStatus(item,'Cover uploaded to Resources.');
        }
        if(!item.pending){
          const book=item.type==='EBOOK';
          const record={ResourceID:item.id,ProgramSubjectID:bulk.subjectId,LevelID:bulk.levelId,ProgramModuleID:bulk.moduleId,TaskID:bulk.taskId,ResourceType:item.type,Name:item.name.trim(),Description:item.description.trim(),DriveFileID:item.driveFileId,Active:true,Author:book?item.author.trim():'',Publisher:book?item.publisher.trim():'',ISBN:book?item.isbn.trim():'',PublicationYear:book?item.year.trim():'',CoverDriveFileID:book?item.coverDriveFileId:''};
          item.pending={kind:'resources',body:{kind:'resources',record,creating:true,revision:state.data.revision,baseRowRevision:state.data.emptyRowRevision,operationId:crypto.randomUUID()}};
          sessionStorage.setItem(pendingKey,JSON.stringify(item.pending));
        }
        bulkItemStatus(item,'Saving resource…');
        let result;
        try{result=await api('program-library/save',item.pending.body);}
        catch(error){if(error.code!=='RECOVERY_REQUIRED')throw error;await api('program-library/recover');result=await api('program-library/save',item.pending.body);}
        sessionStorage.removeItem(pendingKey);item.pending=null;item.saved=true;bulkItemStatus(item,'Saved in the Library.');
        const rows=state.data.rows.resources,index=rows.findIndex(row=>row.ResourceID===result.record.ResourceID);
        if(index<0)rows.push(result.record);else rows[index]=result.record;
        state.data.rowRevisions.resources[result.record.ResourceID]=result.rowRevision;
        renderList();
      }
      const count=bulk.items.length;
      bulk.status=`All ${count} resource${count===1?'':'s'} saved. You can close this review or start another selection.`;
      try{await load();message(bulk.status);}
      catch{message('The eBooks were saved, but the list could not refresh. Choose Refresh to see them.',true);}
    }catch(error){
      if(current?.pending&&(error.code==='ROW_CHANGED'||error.status&&error.status<500&&error.code!=='RECOVERY_REQUIRED')){
        sessionStorage.removeItem(pendingKey);current.pending=null;
      }
      if(current)bulkItemStatus(current,error.message,true);
      bulk.status=`Saving paused at file ${bulk.items.indexOf(current)+1}. ${error.message} Choose ${bulk.source==='drive'?'Save resources':'Continue upload'} to retry.`;
      bulk.error=true;message(bulk.status,true);
    }finally{state.busy=false;render();}
  };
  $('pl-folder-save').onclick=async()=>{
    if(state.busy||!state.data?.canManageFolder)return;
    const folder=$('pl-folder-input').value.trim();
    if(!folder){$('pl-folder-status').textContent='Paste a Google Drive folder link or ID.';return;}
    state.busy=true;$('pl-folder-status').textContent='Checking the Resources folder…';render();
    try{
      const result=await api('program-library/folder-set',{folder});
      $('pl-folder-input').value='';
      await load();
      $('pl-folder-status').textContent=`Resources folder set to ${result.folder.name}. New uploads will use it.`;
    }catch(error){$('pl-folder-status').textContent=error.message;}
    finally{state.busy=false;render();}
  };
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
      try{result=await api('program-library/save',state.pending.body);}
      catch(error){
        if(error.code!=='RECOVERY_REQUIRED')throw error;
        await api('program-library/recover');
        result=await api('program-library/save',state.pending.body);
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
