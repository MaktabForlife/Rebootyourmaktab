/* V105.3.1.2 — compact Program records, explicit row saves and retry-safe edits. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const programId=new URLSearchParams(location.search).get('program'),storageKey=`m4l-management-pending:${programId}`;
  const active=value=>value===true||String(value).toUpperCase()==='TRUE';
  const defs={
    subjects:{label:'Subjects',singular:'subject',key:'ProgramSubjectID',prefix:'PS',columns:[['SubjectID','Academy subject','subject'],['Active','Status','active']],help:'Choose an Academy subject or create a new name. Levels and modules belong to this Program.'},
    levels:{label:'Levels',singular:'level',key:'LevelID',prefix:'LVL',columns:[['ProgramSubjectID','Subject','programSubject'],['Name','Level name'],['SortOrder','Order','number'],['Active','Status','active']],help:'Levels are optional and belong to a subject within this Program. They do not represent academic years.'},
    modules:{label:'Modules',singular:'module',key:'ProgramModuleID',prefix:'MOD',columns:[['ProgramSubjectID','Subject','programSubject'],['LevelID','Level (optional)','level'],['Name','Module name'],['SortOrder','Order','number'],['Active','Status','active']],help:'A module is the unit used in the timetable. Leave its level blank when it is not needed.'},
    classes:{label:'Classes',singular:'class',key:'ClassID',prefix:'CLS',columns:[['Name','Class name'],['AcademicYear','Academic year (optional)'],['Active','Status','active']],help:'Create classes such as Year 1 and Year 2. They can learn a module together in one timetable lesson.'},
    teachers:{label:'Teachers',singular:'teacher',key:'AccountID',columns:[['AccountID','Academy account','account'],['Active','Assignment','active']],help:'Assign existing Academy accounts to teach this Program. Central account permissions are unchanged.'},
    enrollments:{label:'Learners',singular:'membership',key:'EnrollmentID',prefix:'ENR',columns:[['AccountID','Learner','account'],['ClassID','Class','class'],['StartDate','From','date'],['EndDate','Through (optional)','date'],['Active','Status','active']],help:'Set inclusive membership dates. A blank end date means ongoing membership. These dates support learner-clash checks.'}
  };
  const state={data:null,kind:'subjects',edit:null,busy:false,pending:null,search:'',importPreview:null,importPending:null};
  const message=(text,error=false)=>{$('pm-message').textContent=text;$('pm-message').classList.toggle('is-error',error);};
  async function api(action,body={},shared=false){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw new Error('Sign in through your personal Academy account link, then open Programs.');
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/${shared?`academy-subjects/${action}`:`program-timetable/${action}`}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(shared?body:{id:programId,...body})});
    let result;try{result=await response.json();}catch{throw new Error('The response could not be read. Your edits are kept.');}
    if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The change could not be confirmed.'),{status:response.status});return result;
  }
  function controls(){
    const locked=state.busy||Boolean(state.pending)||Boolean(state.importPending),editable=state.data?.prepared&&state.data?.coordinatorAvailable&&state.data?.program.status==='DRAFT';
    $('pm-editor').disabled=locked||!editable;
    $('pm-add').disabled=locked||!editable||Boolean(state.edit);
    $('pm-prepare').disabled=locked;
    $('pm-reload').disabled=state.busy;$('pm-recover').disabled=state.busy;$('pm-retry').disabled=state.busy;
    $('pm-import-preview').disabled=locked||!editable||Boolean(state.edit);
    $('pm-import-save').disabled=state.busy||Boolean(state.pending)||Boolean(state.edit)||!editable||(!state.importPreview&&!state.importPending);
    $('pm-import-save').textContent=state.importPending?'Retry same import':'Import and add to this Program';
    $('pm-catalogue-recover').disabled=state.busy;
    $('pm-import-list').disabled=locked;
    $('pm-pending').hidden=!state.pending;
  }
  async function work(fn){if(state.busy)return;state.busy=true;controls();try{await fn();}catch(error){message(error.message,true);}finally{state.busy=false;controls();}}
  function choices(type,row){const data=state.data;
    if(type==='active')return [{id:'true',name:'Active'},{id:'false',name:'Archived'}];
    if(type==='subject')return data.sharedSubjects.filter(r=>!r.Legacy||r.SubjectID===row.SubjectID).slice().sort((a,b)=>a.SubjectName.localeCompare(b.SubjectName)).map(r=>({id:r.SubjectID,name:r.SubjectName+(r.Legacy?' — Review needed':''),active:r.Active}));
    if(type==='programSubject')return data.rows.subjects.map(r=>({id:r.ProgramSubjectID,name:data.sharedSubjects.find(s=>s.SubjectID===r.SubjectID)?.SubjectName||r.SubjectID,active:active(r.Active)&&data.sharedSubjects.some(s=>s.SubjectID===r.SubjectID&&active(s.Active))}));
    if(type==='level')return data.rows.levels.filter(r=>r.ProgramSubjectID===row.ProgramSubjectID).map(r=>({id:r.LevelID,name:r.Name,active:r.Active}));
    if(type==='account')return data.accounts.map(r=>({id:r.AccountID,name:r.DisplayName,active:r.Active}));
    if(type==='class')return data.rows.classes.map(r=>({id:r.ClassID,name:r.Name,active:r.Active}));
    return null;
  }
  function display(row,[key,label,type]){const values=choices(type,row);return values?values.find(v=>v.id===String(key==='Active'?active(row[key]):row[key]))?.name||row[key]||'—':row[key]===undefined||row[key]===null||row[key]===''?'—':row[key];}
  function cell(row,col){const [key,label,type]=col,values=choices(type,row),value=key==='Active'?String(active(row[key])):String(row[key]??'');
    const fixed=!state.edit.creating&&((state.kind==='subjects'&&key==='SubjectID'&&!state.data.sharedSubjects.find(s=>s.SubjectID===state.edit.originalSubjectID)?.Legacy)||(state.kind==='teachers'&&key==='AccountID'));
    if(values){let available=values.filter(v=>v.active===undefined||active(v.active)||v.id===value);if(type==='subject'&&!fixed)available.push({id:'__new__',name:'＋ Create a new subject…'});if(value&&!available.some(v=>v.id===value))available.push({id:value,name:`Unavailable: ${value}`});
      return `<select data-field="${key}" aria-label="${esc(label)}" ${fixed?'disabled':''}>${type==='active'?'':`<option value="">${type==='level'?'No level':'Choose…'}</option>`}${available.map(v=>`<option value="${esc(v.id)}" ${v.id===value?'selected':''}>${esc(v.name)}${v.active!==undefined&&!active(v.active)?' (inactive)':''}</option>`).join('')}</select>${type==='subject'&&value==='__new__'?`<label class="pm-new-subject">New subject name<input data-field="NewSubjectName" aria-label="New subject name" maxlength="160" placeholder="For example, Tafseer" value="${esc(row.NewSubjectName||'')}"></label>`:''}`;
    }
    return `<input data-field="${key}" aria-label="${esc(label)}" type="${type==='date'?'date':type==='number'?'number':'text'}" value="${esc(value)}" ${type==='number'?'min="0" max="9999" step="1"':'maxlength="160"'}>`;
  }
  function render(){if(!state.data){controls();return;}const def=defs[state.kind];
    $('pm-title').textContent=`${state.data.program.name} · Management`;
    $('pm-timetable').href=`/programs/timetable.html?program=${encodeURIComponent(programId)}`;
    $('pm-workspace').hidden=!state.data.prepared;$('pm-prepare').hidden=state.data.prepared;
    $('pm-tabs').innerHTML=Object.entries(defs).map(([key,d])=>`<button type="button" data-tab="${key}" aria-current="${key===state.kind}">${d.label} <small>${state.data.rows[key].length}</small></button>`).join('');
    $('pm-help').textContent=def.help+' Ctrl/⌘ + Enter saves the edited row.';$('pm-caption').textContent=def.label;$('pm-add').textContent=`＋ Add ${def.singular}`;$('pm-shared').hidden=state.kind!=='subjects';$('pm-legacy').hidden=state.kind!=='subjects'||!state.data.sharedSubjects.some(s=>s.Legacy);
    $('pm-head').innerHTML=`<tr><th scope="col">#</th>${def.columns.map(c=>`<th scope="col">${c[1]}</th>`).join('')}<th scope="col">Changes</th></tr>`;
    const records=state.data.rows[state.kind].map(r=>({...r}));if(state.edit?.creating)records.push(state.edit.record);
    const filtered=records.filter(r=>state.edit&&r[def.key]===state.edit.originalId||def.columns.some(c=>String(display(r,c)).toLowerCase().includes(state.search.toLowerCase())));
    $('pm-count').textContent=`${filtered.length} of ${records.length} rows`;
    $('pm-rows').innerHTML=filtered.map((r,i)=>{const editing=state.edit&&(state.edit.creating?r===state.edit.record:r[def.key]===state.edit.originalId),row=editing?state.edit.record:r;
      return `<tr class="${editing?'is-editing':''}"><td>${i+1}</td>${def.columns.map(c=>`<td>${editing?cell(row,c):esc(display(row,c))}</td>`).join('')}<td>${editing?'<button type="button" data-save>Save</button><button type="button" data-cancel class="pb-secondary">Cancel</button>':`<button type="button" data-edit="${esc(r[def.key])}" class="pb-secondary" ${state.edit?'disabled':''}>Edit</button>`}</td></tr>`;
    }).join('')||`<tr><td colspan="${def.columns.length+2}" class="pm-empty">No ${def.label.toLowerCase()} yet. Add your first ${def.singular}.</td></tr>`;controls();
  }
  async function load(){state.data=await api('manage-get');state.edit=null;state.pending=null;
    try{state.pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{sessionStorage.removeItem(storageKey);}
    if(state.pending){state.kind=state.pending.kind;state.edit={creating:state.pending.body.creating,originalId:state.pending.body.record[defs[state.kind].key],originalSubjectID:state.pending.originalSubjectID,record:structuredClone(state.pending.body.record)};}
    try{state.importPending=JSON.parse(sessionStorage.getItem(storageKey+':import')||'null');}catch{sessionStorage.removeItem(storageKey+':import');}
    if(state.importPending&&!state.importPending.catalogue)state.importPending={catalogue:state.importPending}; // Preserve pre-fix retry identifiers.
    render();message(!state.data.prepared?'Prepare management tables once to begin. Existing Program records are preserved.':!state.data.coordinatorAvailable?'Saving needs the Program coordinator binding.':state.importPending?'An earlier subject import needs confirmation. Open Reboot import and retry.':state.pending?'An earlier save needs confirmation. Retry the same change.':'Ready. Add or edit a row, then save it.');
  }
  function keepPending(){sessionStorage.setItem(storageKey,JSON.stringify(state.pending));}
  async function save(){if(!state.edit)return;
    if(!state.pending){
      const record=structuredClone(state.edit.record);
      if(state.kind==='subjects'&&record.SubjectID==='__new__'&&!record.NewSubjectName?.trim())throw new Error('Enter the new subject name.');
      state.pending={kind:state.kind,originalSubjectID:state.edit.originalSubjectID,body:{kind:state.kind,record,creating:state.edit.creating,revision:state.data.revision,referenceRevision:state.data.referenceRevision,operationId:crypto.randomUUID()}};
      if(record.SubjectID==='__new__')state.pending.createSubject={mode:'create',subjectName:record.NewSubjectName.trim(),operationId:crypto.randomUUID()};
      keepPending();
    }
    try{
      if(state.pending.createSubject&&!state.pending.subjectResolved){
        const result=await api('save',state.pending.createSubject,true);
        state.pending.body.record.SubjectID=result.subject.SubjectID;delete state.pending.body.record.NewSubjectName;
        state.pending.subjectResolved=true;keepPending();
      }
      if(state.pending.subjectResolved&&!state.pending.linkStarted){
        const latest=await api('manage-get');
        if(latest.revision!==state.pending.body.revision){state.data=latest;throw Object.assign(new Error('The subject name is saved in the Academy catalogue, but this Program changed. Reload and select the name to link it.'),{status:409});}
        state.pending.body.referenceRevision=latest.referenceRevision;state.pending.linkStarted=true;keepPending();
      }
      await api('manage-save',state.pending.body);sessionStorage.removeItem(storageKey);state.pending=null;state.edit=null;await load();message('Row saved. It is now available to the timetable.');
    }catch(error){if(error.status&&error.status<500){sessionStorage.removeItem(storageKey);state.pending=null;}throw error;}
  }
  $('pm-add').onclick=()=>{if(state.edit||state.busy||state.pending)return;const def=defs[state.kind],record=Object.fromEntries(def.columns.map(([key])=>[key,key==='Active'?true:key==='SortOrder'?0:'']));if(def.prefix)record[def.key]=`${def.prefix}-${crypto.randomUUID()}`;state.edit={record,creating:true,originalId:record[def.key]};state.search='';$('pm-search').value='';render();$('pm-rows').querySelector('input,select')?.focus();};
  $('pm-tabs').onclick=event=>{const key=event.target.closest('[data-tab]')?.dataset.tab;if(!key||state.busy)return;if(state.edit||state.pending||state.importPending){message('Save or cancel the current row before changing sections.',true);return;}state.kind=key;state.search='';$('pm-search').value='';render();};
  $('pm-search').oninput=event=>{state.search=event.target.value;render();};
  $('pm-rows').onclick=event=>{if(state.busy||state.pending)return;const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-save'))void work(save);else if(button.hasAttribute('data-cancel')){state.edit=null;render();message('Unsaved row changes discarded.');}else if(button.dataset.edit&&!state.edit){const row=state.data.rows[state.kind].find(r=>r[defs[state.kind].key]===button.dataset.edit);state.edit={record:{...row,Active:active(row.Active)},creating:false,originalId:button.dataset.edit,originalSubjectID:row.SubjectID};render();}};
  $('pm-rows').addEventListener('input',event=>{const key=event.target.dataset.field;if(key&&state.edit&&!state.busy&&!state.pending)state.edit.record[key]=key==='Active'?event.target.value==='true':event.target.value;});
  $('pm-rows').addEventListener('change',event=>{const key=event.target.dataset.field;if(!key||!state.edit||state.busy||state.pending)return;state.edit.record[key]=key==='Active'?event.target.value==='true':event.target.value;if(key==='SubjectID'){render();$('pm-rows').querySelector('[data-field=NewSubjectName]')?.focus();}if(key==='ProgramSubjectID'&&state.kind==='modules'){state.edit.record.LevelID='';render();}});
  $('pm-prepare').onclick=()=>work(async()=>{await api('prepare');await load();});
  $('pm-retry').onclick=()=>work(save);
  $('pm-reload').onclick=()=>{if(state.edit||state.pending)$('pm-discard-warning').hidden=false;else void work(load);};
  $('pm-keep').onclick=()=>{$('pm-discard-warning').hidden=true;};
  $('pm-discard').onclick=()=>{if(state.pending){message('Confirm the pending save using Retry or Recover before discarding.',true);return;}$('pm-discard-warning').hidden=true;void work(load);};
  $('pm-export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({programId,kind:state.kind,record:state.edit?.record},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='program-management-row.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('pm-recover').onclick=()=>work(async()=>{if(state.pending?.createSubject&&!state.pending.linkStarted){await api('recover',{},true);await save();return;}await api('recover');if(state.pending){sessionStorage.removeItem(storageKey);state.pending=null;}if(state.edit){state.data.revision='stale';render();message('Recovery completed. Your edited row is kept; download it and reload before reapplying changes.');}else await load();});
  $('pm-import-preview').onclick=()=>work(async()=>{
    state.importPreview=await api('import-preview',{},true);
    $('pm-import-list').innerHTML=state.importPreview.subjects.map(r=>`<label><input type="checkbox" value="${esc(r.SourceSubjectID)}" ${!r.Active?'disabled':''}> <span>${esc(r.SubjectName)}</span><small>${!r.Active?'Archived — unavailable':r.existing?(state.data.rows.subjects.some(s=>s.SubjectID===r.existing.SubjectID)?'Already in this Program':'In Academy catalogue — add to this Program'):'New Academy subject'}</small></label>`).join('')||'<p>No subjects found in Reboot.</p>';
    message('Select the subjects to add to this Program. Existing names and Program links will be reused.');
  });
  function keepImport(){sessionStorage.setItem(storageKey+':import',JSON.stringify(state.importPending));}
  function clearImport(){sessionStorage.removeItem(storageKey+':import');state.importPending=null;state.importPreview=null;$('pm-import-list').innerHTML='';}
  async function importSubjects(){
    if(!state.importPending){
      const sourceIds=[...$('pm-import-list').querySelectorAll('input:checked')].map(e=>e.value);
      if(!sourceIds.length)throw new Error('Select at least one Reboot subject.');
      state.importPending={catalogue:{mode:'import',sourceIds,sourceRevision:state.importPreview.revision,operationId:crypto.randomUUID()}};
      keepImport();
    }
    try{
      const pending=state.importPending;
      if(!pending.catalogueResult){pending.catalogueResult=await api('save',pending.catalogue,true);keepImport();}
      if(!pending.link){
        // Only append missing links to a fresh snapshot. Later edits still fail the revision check.
        const latest=await api('manage-get');
        pending.link={kind:'subject-import',record:{subjectIds:[...new Set(pending.catalogueResult.subjects.map(s=>s.SubjectID))]},revision:latest.revision,referenceRevision:latest.referenceRevision,operationId:crypto.randomUUID()};
        keepImport();
      }
      const result=await api('manage-save',pending.link),summary=result.record;
      clearImport();state.kind='subjects';state.search='';$('pm-search').value='';
      await load();message(`${summary.added} ${summary.added===1?'subject':'subjects'} added to this Program; ${summary.alreadyLinked} already linked.${summary.archived?` ${summary.archived} existing links remain archived; use Edit to reactivate them.`:''}`);
    }catch(error){
      if(error.status&&error.status<500){
        const catalogueSaved=Boolean(state.importPending?.catalogueResult);clearImport();
        if(catalogueSaved)error.message+=' The names are saved in the Academy catalogue. Review and select them again to finish adding them to this Program.';
      }
      throw error;
    }
  }
  $('pm-import-save').onclick=()=>work(importSubjects);
  $('pm-catalogue-recover').onclick=()=>work(async()=>{
    const result=await api('recover',{},true);
    message((result.recovered?'An interrupted catalogue save was completed.':'No interrupted catalogue save was found.')+' Recovery does not add subjects to this Program. '+(state.importPending?'Choose Retry same import to finish adding your subjects.':state.pending?'Choose Retry same change to finish your pending save.':'Review Reboot subjects, select names, then choose Import and add to this Program.'));
  });
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&state.edit&&!state.busy&&!state.pending){event.preventDefault();void work(save);}});
  window.addEventListener('beforeunload',event=>{if(state.edit||state.pending||state.importPending){event.preventDefault();event.returnValue='';}});
  void work(load);
})();
