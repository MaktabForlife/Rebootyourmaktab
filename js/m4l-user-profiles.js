/* V106.5 — direct profile cells, retained multi-row drafts and grouped saves. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search),program=params.get('program'),base=window.M4L_CONFIG?.API_BASE||'',storageKey=`m4l-user-profiles:${location.host}`;
  const labels={USER:'None',STUDENT:'Student',TEACHER:'Teacher',PROGRAM_ADMIN:'Program Admin',GLOBAL_ADMIN:'Global Admin',SENIOR:'Senior',ADMIN:'Admin'};
  const state={data:null,selected:params.get('account')||'',edit:null,edits:[],pinned:[],pending:null,busy:false,waiting:false,timer:null,search:'',filter:'',conflict:null,loaded:false,globalAccount:'',globalSearch:''};
  const message=(text,error=false)=>{$('up-message').textContent=text;$('up-message').classList.toggle('is-error',error);};
  const roleNames=roles=>(roles.length?roles:['USER']).map(role=>labels[role]).join(' · ');
  const scopeKey=scope=>`${scope.type}:${scope.id}`;
  const currentEdit=()=>state.edit;
  const editKey=edit=>[edit.mode,edit.accountId||'',edit.scopeType||'',edit.scopeId||''].join(':');
  const entries=()=>[...state.edits,...(state.edit?[state.edit]:[])];
  const editValue=e=>e.mode==='profile'?JSON.stringify([e.displayName,e.active,...(e.academyTeacher===undefined?[]:[e.academyTeacher]),...(e.academyAdmin===undefined?[]:[e.academyAdmin])]):e.mode==='matrix-roles'?JSON.stringify([...e.roles].sort()):'';
  const changed=e=>!['profile','matrix-roles'].includes(e.mode)||e.creating||e.needsConfirmation||e.originalValue===undefined||editValue(e)!==e.originalValue;
  const changedEntries=()=>entries().filter(changed);
  function updateSaveControls(){
    const locked=state.busy||state.waiting||Boolean(state.pending),reviewing=Boolean(state.conflict);
    $('up-save-all').disabled=locked||(reviewing&&!state.conflict.currentRecord)||!changedEntries().some(e=>['profile','matrix-roles'].includes(e.mode));
    $('up-save').disabled=locked||(reviewing&&!state.conflict.currentRecord)||!state.edit||!changed(state.edit);
    $('up-save').textContent='Save access setting';
    $('up-save').hidden=state.edit?.mode!=='matrix-policy';
    const count=new Set(changedEntries().filter(e=>e.accountId).map(e=>e.accountId)).size;
    $('up-unsaved').textContent=count?`${count} ${count===1?'user':'users'} with unsaved changes`:'';
    $('up-cancel').hidden=!entries().length;$('up-draft-notice').hidden=!changedEntries().length;
    $('up-users').querySelectorAll?.('[data-user]').forEach(row=>{const id=row.dataset.user,dirty=changedEntries().some(e=>e.accountId===id),profile=findEdit('profile',id);row.classList.toggle('is-editing',dirty);if(profile)row.classList.toggle('up-account-inactive',!profile.active);if(dirty&&!row.querySelector('[data-save]'))row.querySelector('.up-actions')?.insertAdjacentHTML('beforeend',actionIcon('save',id,'Save this user',locked||reviewing));});
    $('up-users').querySelectorAll?.('[data-save]').forEach(button=>{button.disabled=locked||reviewing||!changedEntries().some(e=>e.accountId===button.dataset.save);});
  }
  const findEdit=(mode,accountId,scope)=>entries().find(e=>e.mode===mode&&e.accountId===accountId&&(!scope||e.scopeType===scope.type&&e.scopeId===scope.id));
  function profileDraft(accountId){
    if(state.busy||state.pending||!state.data?.prepared)return null;
    const existing=findEdit('profile',accountId);if(existing)return existing;
    const account=state.data.accounts.find(a=>a.accountId===accountId);if(!account)return null;
    const edit={mode:'profile',accountId,creating:false,displayName:account.displayName,active:account.active,...(state.data.teacherDesignationEditable?{academyTeacher:Boolean(account.academyTeacher)}:{}),...(state.data.adminDesignationEditable?{academyAdmin:Boolean(account.academyAdmin)}:{}),baseRevision:account.revision};
    edit.originalValue=editValue(edit);state.edits.push(edit);return edit;
  }
  function removeEdits(keys){state.edits=state.edits.filter(e=>!keys.includes(editKey(e)));if(state.edit&&keys.includes(editKey(state.edit)))state.edit=null;}
  function closeCleanEditors(accountIds=null){
    const clean=e=>['profile','matrix-roles'].includes(e.mode)&&!changed(e)&&(!accountIds||accountIds.has(e.accountId));
    state.edits=state.edits.filter(e=>!clean(e));
    if(state.edit&&clean(state.edit))state.edit=null;
  }
  const icons={view:'<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',share:'<svg viewBox="0 0 24 24"><path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/></svg>',copy:'<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>',save:'<svg viewBox="0 0 24 24"><path d="M4 3h13l4 4v14H3V3Zm3 0v7h10V3M7 21v-7h10v7"/></svg>'};
  const actionIcon=(action,id,label,disabled=false)=>`<button type="button" class="pb-secondary up-icon" data-${action}="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}" ${disabled?'disabled':''}>${icons[action]}</button>`;
  function remember(){for(const key of ['edit','edits','pinned','pending']){if(state[key])sessionStorage.setItem(`${storageKey}:${key}`,JSON.stringify(state[key]));else sessionStorage.removeItem(`${storageKey}:${key}`);}}
  async function api(action,input={}){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw Object.assign(new Error('Sign in with your academy administrator account, then open User profiles.'),{status:401});
    const response=await fetch(`${base}/api/admin/platform/user-profiles/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
    let result;try{result=await response.json();}catch{throw new Error('The response could not be read. Your entry is kept.');}
    if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The change could not be confirmed.'),result,{status:response.status});return result;
  }
  function render(){
    renderGlobalStatus();
    if(state.loaded)remember();const editable=Boolean(state.data)&&!state.busy&&!state.pending,edit=currentEdit();
    $('up-refresh').disabled=state.busy||state.waiting;$('up-add').disabled=!editable||!state.data?.prepared;
    $('up-retry').disabled=state.busy||state.waiting;$('up-pending').hidden=!state.pending;
    $('up-draft-notice').hidden=!entries().length;$('up-return').disabled=state.busy;
    $('up-cancel').hidden=!edit;$('up-save').disabled=!editable||state.waiting||Boolean(state.conflict);$('up-cancel').disabled=state.busy||Boolean(state.pending);
    $('up-conflict').hidden=!state.conflict||!edit;
    const describe=record=>edit?.mode==='profile'?`${record?.displayName||'Removed'} · ${record?.active?'Active':'Inactive'}${record?.academyAdmin?' · Global Admin':''}${record?.academyTeacher?' · Global Teacher':''}`:edit?.mode==='matrix-policy'?record?.accessModel||'Unknown':roleNames(record?.roles||[])+(record?.accessModel?` · ${record.accessModel==='FREE'?'Free':'Paid'} setting`:'');
    if(state.conflict&&edit){
      const account=state.data?.accounts.find(a=>a.accountId===edit.accountId),scope=state.data?.scopes.find(s=>s.type===edit.scopeType&&s.id===edit.scopeId);
      const identity=[account?.displayName,scope?.name].filter(Boolean).join(' · ');
      $('up-comparison').innerHTML=`<p><strong>${esc(identity)}</strong></p><div class="up-conflict-versions"><div><strong>Saved version</strong><p>${esc(describe(state.conflict.currentRecord))}</p></div><div><strong>Your proposed entry</strong><p>${esc(describe(edit))}</p></div></div>`;
    }
    $('up-use-saved').disabled=state.busy;
    updateSaveControls();
    if(!state.data)return;
    const blocked=!editable,scopes=state.data.scopes;
    $('up-matrix').style?.setProperty('--up-scope-count',scopes.length);
    $('up-setup').hidden=!state.data.needsSync;$('up-setup').disabled=blocked||state.waiting;
    const policyReviews=scopes.filter(s=>s.policyEditable!==false&&s.reviewStatus==='REQUIRED').length;
    $('up-review-count').textContent=state.data.reviewCount||policyReviews?`${state.data.reviewCount||0} role entries${policyReviews?` and ${policyReviews} Free/Paid settings`:''} need review.`:'';
    $('up-head').innerHTML=`<tr><th scope="col">User name</th><th scope="col">Status</th>${scopes.map(scope=>{
      const editing=edit?.mode==='matrix-policy'&&edit.scopeType===scope.type&&edit.scopeId===scope.id;
      return `<th scope="col"><strong>${esc(scope.name)}</strong><small>${scope.active?'':'Inactive'}</small>${editing?`<label>Access<select data-access-model aria-label="Access for ${esc(scope.name)}" ${!editable?'disabled':''}><option value="FREE" ${edit.accessModel==='FREE'?'selected':''}>Free</option><option value="PAID" ${edit.accessModel==='PAID'?'selected':''}>Paid</option></select></label><label class="up-confirm"><input type="checkbox" data-policy-confirm ${edit.policyConfirmed?'checked':''} ${!editable?'disabled':''}>Applies to this entire program/course</label>`:scope.policyEditable===false?`<small>${scope.accessModel==='FREE'?'Free':scope.accessModel==='PAID'?'Paid':''}</small>`:`<button type="button" class="pb-secondary" data-policy="${esc(scopeKey(scope))}" ${blocked||!scope.prepared?'disabled':''}>${scope.accessModel==='FREE'?'Free':scope.accessModel==='PAID'?'Paid':'Review'} ▾</button>`}${scope.policyEditable!==false&&scope.reviewStatus==='REQUIRED'?'<small class="up-review">Review setting</small>':''}</th>`;
    }).join('')}<th scope="col">Actions</th></tr>`;
    const accounts=state.data.accounts.filter(a=>(!state.filter||a.active===(state.filter==='active'))&&[a.displayName,a.academyAdmin?'Global Admin':'',a.academyTeacher?'Global Teacher':'',...a.assignments.map(g=>roleNames(g.displayRoles||g.roles))].some(v=>v.toLowerCase().includes(state.search.toLowerCase())));
    accounts.sort((a,b)=>{const ai=state.pinned.indexOf(a.accountId),bi=state.pinned.indexOf(b.accountId);return (ai<0?Infinity:ai)-(bi<0?Infinity:bi);});
    for(const draft of entries().filter(e=>e.mode==='profile'&&e.creating))accounts.unshift({accountId:draft.accountId,displayName:draft.displayName,active:draft.active,assignments:[]});
    $('up-count').textContent=`${accounts.length} shown · ${state.data.accounts.length} users`;
    $('up-users').innerHTML=accounts.map(a=>{
      const profileEdit=findEdit('profile',a.accountId),rowDirty=changedEntries().some(e=>e.accountId===a.accountId);
      const displayName=profileEdit?.displayName??a.displayName,active=profileEdit?.active??a.active;
      return `<tr data-user="${esc(a.accountId)}" class="${active?'':'up-account-inactive'} ${rowDirty?'is-editing':''} ${state.selected===a.accountId?'up-selected':''}"><td data-label="User name"><input data-name data-account="${esc(a.accountId)}" maxlength="160" aria-label="User name" value="${esc(displayName)}" ${blocked||!state.data.prepared?'disabled':''}>${a.academyAdmin?'<small>Global Admin</small>':''}${a.academyTeacher?'<small>Global Teacher</small>':''}</td><td data-label="Status"><select data-active data-account="${esc(a.accountId)}" aria-label="Account status" ${blocked||!state.data.prepared?'disabled':''}><option value="true" ${active?'selected':''}>Active</option><option value="false" ${!active?'selected':''}>Inactive</option></select></td>${scopes.map(scope=>{
        const grant=a.assignments.find(g=>g.scopeType===scope.type&&g.scopeId===scope.id),editing=findEdit('matrix-roles',a.accountId,scope),roles=editing?editing.roles:grant?.roles||[];
        const displayed=a.academyAdmin?[...new Set(['PROGRAM_ADMIN',...roles])]:grant?.displayRoles||roles,inherited=a.academyAdmin?'Program Admin is automatic for Global Admins in every Program and Course. This cell changes only additional roles.':'';
        const roleCell=scope.rolesEditable===false?`<span class="up-role-label ${a.academyAdmin?'up-inherited':''}" title="${esc(a.academyAdmin?inherited:'Course subscriptions are managed in Course administration. None means no assigned role or subscription. Free Course access is separate.')}">${esc(roleNames(displayed))}</span>`:`<button type="button" class="up-cell ${a.academyAdmin?'up-inherited':''}" title="${esc(inherited)}" data-edit-scope="${esc(scopeKey(scope))}" data-account="${esc(a.accountId)}" ${blocked||!scope.prepared||!grant?'disabled':''}>${esc(roleNames(displayed))} ▾</button>`;
        return `<td data-label="${esc(scope.name)}">${editing?`${a.academyAdmin?'<small class="up-inherited">Program Admin is automatic for Global Admins</small>':''}<fieldset class="up-role-choices"><legend>${a.academyAdmin?'Additional roles':'Roles'} for ${esc(a.displayName)} · ${esc(scope.name)}</legend>${a.academyAdmin?'':`<label><input type="checkbox" data-default-user data-account="${esc(a.accountId)}" data-scope="${esc(scopeKey(scope))}" ${roles.length?'':'checked'} ${!editable?'disabled':''}>None</label>`}${state.data.roles.map(role=>`<label><input type="checkbox" data-role="${role}" ${roles.includes(role)||a.academyAdmin&&role==='PROGRAM_ADMIN'?'checked':''} data-account="${esc(a.accountId)}" data-scope="${esc(scopeKey(scope))}" ${!editable||a.academyAdmin&&role==='PROGRAM_ADMIN'?'disabled':''}>${labels[role]}</label>`).join('')}</fieldset>`:roleCell}${grant?.reviewStatus==='REQUIRED'?'<small class="up-review">Confirm imported role</small>':''}</td>`;
      }).join('')}<td data-label="Actions"><div class="up-actions">${actionIcon('view',a.accountId,'View login link',profileEdit?.creating)}${actionIcon('share',a.accountId,'Share sign-in link',profileEdit?.creating)}${actionIcon('copy',a.accountId,'Copy sign-in link',profileEdit?.creating)}${rowDirty?actionIcon('save',a.accountId,'Save this user',!editable||state.waiting||Boolean(state.conflict)||!changedEntries().some(e=>e.accountId===a.accountId)):''}</div></td></tr>`;
    }).join('')||`<tr><td colspan="${scopes.length+3}" class="pm-empty">No matching users.</td></tr>`;
  }
  function schedule(error,callback,attempt,kind){
    if(attempt>=2||error.retryable===false||error.status&&error.status<500)return false;
    const delay=error.code==='SHEETS_RATE_LIMITED'?Math.max(60000,error.retryAfterMs||0):Math.max(1500*(attempt+1),error.retryAfterMs||0);
    state.waiting=true;$('up-wait').hidden=false;$('up-wait').textContent=`${kind} automatically in ${Math.ceil(delay/1000)} seconds. Your entry is kept.${error.reference?' Reference: '+error.reference:''}`;
    state.timer=setTimeout(()=>{state.timer=null;state.waiting=false;$('up-wait').hidden=true;void callback(attempt+1);},delay);return true;
  }
  async function refresh(attempt=0,afterSave=false){
    if(state.busy||state.waiting)return;state.busy=true;render();
    try{
      state.data=await api('get');
      if(!state.loaded){
        for(const key of ['edit','edits','pinned','pending'])try{state[key]=JSON.parse(sessionStorage.getItem(`${storageKey}:${key}`)||'null');}catch{sessionStorage.removeItem(`${storageKey}:${key}`);}
        state.edits=Array.isArray(state.edits)?state.edits:[];state.pinned=Array.isArray(state.pinned)?state.pinned:[];
        if(state.pending&&!entries().length){if(state.pending.mode==='batch')state.edits=structuredClone(state.pending.entries);else state.edit={...state.pending};}
        // Translate pre-migration draft roles only; uncertain saves retain their exact payload.
        if(state.data.store==='D1'&&!state.pending)for(const draft of entries().filter(e=>e.mode==='matrix-roles'&&e.scopeType==='PROGRAM'))draft.roles=[...new Set(draft.roles.map(role=>role==='ADMIN'?'PROGRAM_ADMIN':role==='SENIOR'?'TEACHER':role))];
        if(state.edit)state.selected=state.edit.accountId;
        state.loaded=true;
      }
      $('up-wait').hidden=true;message(entries().length?'Unfinished entries kept.':afterSave?'Saved.':'');
    }catch(error){message(`${afterSave?'Saved. The latest records could not be loaded. ':''}${error.message}`,true);if(!schedule(error,next=>refresh(next,afterSave),attempt,'Refreshing records')){$('up-wait').textContent='Automatic refresh has stopped. Your displayed records and entry are kept. Use Refresh to try again.';$('up-wait').hidden=false;}}
    finally{state.busy=false;render();}
    if(state.pending&&!state.waiting&&state.data)void save();
  }
  function applyAcknowledgement(result){
    if(result.results){result.results.forEach(applyAcknowledgement);return;}
    if(result.profile){let account=state.data.accounts.find(a=>a.accountId===result.profile.accountId);if(account)Object.assign(account,result.profile);else {state.data.accounts.push({...result.profile,assignments:result.profile.assignments||[]});state.pinned.unshift(result.profile.accountId);}}
    if(result.assignment){const account=state.data.accounts.find(a=>a.accountId===result.assignment.accountId);if(account){const index=account.assignments.findIndex(g=>g.scopeType===result.assignment.scopeType&&g.scopeId===result.assignment.scopeId);if(index<0)account.assignments.push(result.assignment);else account.assignments[index]=result.assignment;}}
    if(result.scope){const scope=state.data.scopes.find(s=>scopeKey(s)===scopeKey(result.scope));if(scope)Object.assign(scope,result.scope);}
    state.data.reviewCount=state.data.accounts.flatMap(a=>a.assignments).filter(g=>g.reviewStatus==='REQUIRED').length;
    if(result.loginPath)showLink(result.loginPath);
  }
  function acceptReviewedChange(){
    if(!state.conflict?.currentRecord||!state.edit)return false;
    const edit=state.edit,conflict=state.conflict;
    edit.baseRevision=conflict.rowRevision;
    if(edit.mode==='matrix-roles'&&conflict.scopeRevision){
      // A changed Free/Paid setting invalidates every draft in this column.
      for(const draft of entries().filter(e=>e.mode==='matrix-roles'&&e.scopeType===edit.scopeType&&e.scopeId===edit.scopeId))draft.scopeRevision=conflict.scopeRevision;
    }
    state.conflict=null;remember();return true;
  }
  async function save(attempt=0,selection=null){
    if(state.busy||state.waiting||(!entries().length&&!state.pending))return;
    if(state.conflict){message('Review the changed record before saving.',true);return;}
    if(!state.pending){
      const selected=selection||changedEntries().filter(e=>state.edit?.accountId?e.accountId===state.edit.accountId:e===state.edit);
      if(!selected.length)return;
      state.pending=selected.length===1?{...structuredClone(selected[0]),operationId:crypto.randomUUID()}:{mode:'batch',entries:structuredClone(selected.slice(0,80)),operationId:crypto.randomUUID()};
    }remember();state.busy=true;render();
    let confirmed=false;
    try{
      const {needsRecovery,...body}=state.pending;if(needsRecovery)await api('recover');
      const result=await api('save',body),savedEntries=body.entries||[body];const savedKeys=savedEntries.map(editKey);state.pending=null;removeEdits(savedKeys);
      closeCleanEditors(new Set(savedEntries.map(e=>e.accountId).filter(Boolean)));remember();confirmed=true;
      applyAcknowledgement(result);message('Saved.');
    }catch(error){
      if(!state.pending){message('Saved. The display could not refresh; your save is confirmed.',true);}
      else if(error.code==='ROW_CHANGED'){const failed=entries().find(e=>editKey(e)===(error.entryKey||(state.pending.mode==='batch'?'':editKey(state.pending))))||state.edit||entries()[0];
        if(state.edit&&state.edit!==failed)state.edits.push(state.edit);
        state.edits=state.edits.filter(e=>e!==failed);state.edit=failed;
        state.conflict={currentRecord:error.currentRecord,rowRevision:error.rowRevision,scopeRevision:error.currentRecord?.scopeRevision};state.pending=null;remember();message(failed?.mode==='matrix-roles'?'The saved roles or Program settings changed since this entry was opened. Your proposed roles are kept for review.':error.message,true);}
      else if(error.status&&error.status<500&&error.code!=='RECOVERY_REQUIRED'){state.pending=null;remember();message(error.message,true);}
      else {message(error.message,true);if(error.code==='RECOVERY_REQUIRED'){$('up-wait').hidden=false;$('up-wait').textContent='An earlier academy change needs recovery. Retry will recover it before saving this entry.';state.pending.needsRecovery=true;remember();}else schedule(error,save,attempt,'Retrying the same save');}
    }finally{state.busy=false;render();}
    if(confirmed){remember();await refresh(0,true);}
    return confirmed;
  }
  function showLink(path){if(!/^\/account\/[A-Za-z0-9_-]+$/.test(path))return;$('up-link').hidden=false;$('up-link').innerHTML=`Personal sign-in link: <a href="${esc(path)}">${esc(location.origin+path)}</a>`;}
  function cancel(){if(state.busy||state.pending)return;state.edit=null;state.conflict=null;render();message('Unsaved entry discarded.');}
  function discardAll(){if(state.busy||state.pending)return;state.edit=null;state.edits=[];state.conflict=null;render();message('Unsaved changes discarded.');}
  $('up-search').oninput=e=>{state.search=e.target.value;render();};$('up-status-filter').onchange=e=>{state.filter=e.target.value;render();};
  function startEdit(edit){if(state.busy||state.pending||state.conflict)return;
    const existing=entries().find(e=>editKey(e)===editKey(edit));
    if(state.edit&&state.edit!==existing)state.edits.push(state.edit);
    state.edits=state.edits.filter(e=>e!==existing);state.edit=existing||{...edit,originalValue:editValue(edit)};state.conflict=null;$('up-link').hidden=true;render();}
  $('up-return').onclick=()=>{state.search='';state.filter='';$('up-search').value='';$('up-status-filter').value='';render();document.querySelector?.('.is-editing input, [data-access-model]')?.focus();};
  $('up-add').onclick=()=>{if(!state.data?.prepared||state.busy||state.pending||state.conflict)return;state.search='';state.filter='';$('up-search').value='';$('up-status-filter').value='';startEdit({mode:'profile',accountId:crypto.randomUUID(),creating:true,displayName:'',active:true,...(state.data.teacherDesignationEditable?{academyTeacher:false}:{}),...(state.data.adminDesignationEditable?{academyAdmin:false}:{}),baseRevision:state.data.emptyRevision});const input=document.querySelector?.('[data-name]');input?.focus();input?.scrollIntoView?.({block:'nearest'});};
  $('up-setup').onclick=()=>{startEdit({mode:'matrix-prepare'});void save();};
  $('up-users').onclick=async e=>{
    const button=e.target.closest('button');if(!button||state.busy||state.pending)return;
    const {profile,editScope,account,link,view,share,copy,save:rowSave}=button.dataset;
    if(rowSave){void save(0,changedEntries().filter(e=>e.accountId===rowSave));return;}
    if(view){if(state.waiting){message('Wait for the spreadsheet service to recover before retrieving a sign-in link.',true);return;}await userLink(view,false,true);return;}
    if(share||copy){if(state.waiting){message('Wait for the spreadsheet service to recover before retrieving a sign-in link.',true);return;}await userLink(share||copy,Boolean(share));return;}
    if(link){state.busy=true;render();try{showLink((await api('link',{accountId:link})).loginPath);}catch(error){message(error.message,true);}finally{state.busy=false;render();}return;}
    if(profile){const a=state.data.accounts.find(a=>a.accountId===profile);if(a)startEdit({mode:'profile',accountId:a.accountId,creating:false,displayName:a.displayName,active:a.active,...(state.data.teacherDesignationEditable?{academyTeacher:Boolean(a.academyTeacher)}:{}),...(state.data.adminDesignationEditable?{academyAdmin:Boolean(a.academyAdmin)}:{}),baseRevision:a.revision});}
    if(editScope){const scope=state.data.scopes.find(s=>scopeKey(s)===editScope),a=state.data.accounts.find(a=>a.accountId===account),grant=a?.assignments.find(g=>g.scopeType===scope?.type&&g.scopeId===scope?.id);if(grant)startEdit({mode:'matrix-roles',accountId:account,scopeType:scope.type,scopeId:scope.id,roles:[...grant.roles],needsConfirmation:grant.reviewStatus==='REQUIRED',baseRevision:grant.revision,scopeRevision:scope.revision});}
  };
  $('up-users').oninput=e=>{if(state.busy||state.pending||!Object.hasOwn(e.target.dataset,'name'))return;const edit=e.target.dataset.account?profileDraft(e.target.dataset.account):state.edit;if(edit?.mode==='profile'){edit.displayName=e.target.value;remember();updateSaveControls();}};
  $('up-users').onchange=e=>{const d=e.target.dataset,edit=d.account?(d.scope?entries().find(e=>e.accountId===d.account&&`${e.scopeType}:${e.scopeId}`===d.scope):profileDraft(d.account)):state.edit;if(!edit||state.busy||state.pending)return;
    if(edit.mode==='profile'&&Object.hasOwn(d,'active')){edit.active=e.target.value==='true';remember();updateSaveControls();return;}
    if(edit.mode==='matrix-roles'){const {role,defaultUser}=e.target.dataset;if(role){edit.roles=edit.roles.filter(r=>r!==role);if(e.target.checked)edit.roles.push(role);}if(defaultUser!==undefined&&e.target.checked)edit.roles=[];}
    render();
  };
  $('up-head').onclick=e=>{const policy=e.target.closest('button')?.dataset.policy,scope=state.data.scopes.find(s=>scopeKey(s)===policy);if(scope)startEdit({mode:'matrix-policy',scopeType:scope.type,scopeId:scope.id,accessModel:scope.accessModel,baseRevision:scope.revision,policyConfirmed:false});};
  $('up-head').onchange=e=>{if(state.edit?.mode!=='matrix-policy'||state.busy||state.pending)return;
    if(Object.hasOwn(e.target.dataset,'accessModel')){state.edit.accessModel=e.target.value;state.edit.policyConfirmed=false;}
    if(Object.hasOwn(e.target.dataset,'policyConfirm'))state.edit.policyConfirmed=e.target.checked;render();
  };
  $('up-save').onclick=()=>{if(state.conflict&&!acceptReviewedChange())return;void save();};$('up-cancel').onclick=discardAll;
  $('up-users').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void saveAll();}};
  $('up-refresh').onclick=()=>void refresh();
  $('up-retry').onclick=async()=>{if(state.busy||state.waiting)return;if(state.pending?.needsRecovery){state.busy=true;render();try{await api('recover');delete state.pending.needsRecovery;}catch(error){message(error.message,true);state.busy=false;render();return;}state.busy=false;}void save();};
  $('up-use-saved').onclick=()=>{cancel();void refresh();};
  async function saveAll(){
    if(state.busy||state.waiting||state.pending)return;
    if(state.conflict&&!acceptReviewedChange())return;
    // Bounded atomic batches keep Sheets receipt cells within their storage limit.
    // A failed batch and all later entries remain editable/retryable.
    let selected=changedEntries().filter(e=>['profile','matrix-roles'].includes(e.mode));
    while(selected.length){if(!await save(0,selected.slice(0,20)))return;selected=changedEntries().filter(e=>['profile','matrix-roles'].includes(e.mode));}
    closeCleanEditors();render();
  }
  $('up-save-all').onclick=()=>void saveAll();
  function renderGlobalStatus(){
    const available=Boolean(state.data?.adminDesignationEditable||state.data?.teacherDesignationEditable);
    const locked=state.busy||state.waiting||Boolean(state.pending),account=state.data?.accounts.find(a=>a.accountId===state.globalAccount);
    $('up-global-status').hidden=!available;$('up-global-status').disabled=!available||locked||Boolean(state.conflict);
    $('up-global-search').disabled=locked;$('up-global-selection').hidden=!account;
    const edit=account&&findEdit('profile',account.accountId),admin=edit?.academyAdmin??account?.academyAdmin,teacher=edit?.academyTeacher??account?.academyTeacher;
    const globalDirty=account&&(Boolean(admin)!==Boolean(account.academyAdmin)||Boolean(teacher)!==Boolean(account.academyTeacher));
    const canSave=Boolean(account)&&!state.busy&&!state.waiting&&!state.conflict&&(Boolean(state.pending)||globalDirty);
    $('up-global-save').disabled=!canSave;
    $('up-global-save').textContent=state.pending?'Retry same change':'Save global status';
    $('up-global-discard').disabled=locked||!globalDirty;
    $('up-global-message').textContent=$('up-global-dialog').open?$('up-message').textContent:'';
    if(!available){$('up-global-results').innerHTML='';if($('up-global-dialog').open)$('up-global-dialog').close();return;}
    const search=state.globalSearch.trim().toLocaleLowerCase(),matches=state.data.accounts.filter(a=>search?a.displayName.toLocaleLowerCase().includes(search):a.academyAdmin||a.academyTeacher).sort((a,b)=>a.displayName.localeCompare(b.displayName)).slice(0,12);
    $('up-global-results').innerHTML=matches.map(a=>`<button type="button" class="pb-secondary" data-global-user="${esc(a.accountId)}" aria-pressed="${a.accountId===state.globalAccount}" ${locked?'disabled':''}><span>${esc(a.displayName)}</span><small>${[a.academyAdmin?'Global Admin':'',a.academyTeacher?'Global Teacher':'',!a.active?'Inactive':''].filter(Boolean).join(' · ')||'None'}</small></button>`).join('')||'<p>'+(search?'No matching users.':'Search for a user to set their global status.')+'</p>';
    if(!account)return;
    $('up-global-name').textContent=edit?.displayName??account.displayName;
    $('up-global-admin-option').hidden=!state.data.adminDesignationEditable;$('up-global-teacher-option').hidden=!state.data.teacherDesignationEditable;
    $('up-global-admin').checked=Boolean(admin);$('up-global-teacher').checked=Boolean(teacher);
    $('up-global-admin').disabled=locked||!state.data.adminDesignationEditable||account.accountId===state.data.currentAccountId&&account.academyAdmin||!(edit?.active??account.active)&&!account.academyAdmin;
    $('up-global-teacher').disabled=locked||!state.data.teacherDesignationEditable||!(edit?.active??account.active)&&!account.academyTeacher;
    $('up-global-note').textContent=[account.accountId===state.data.currentAccountId&&account.academyAdmin?'Another Global Admin must remove your own Admin designation.':'',!(edit?.active??account.active)?'Activate this account in the sheet before granting a global role.':'',edit&&(edit.displayName!==account.displayName||edit.active!==account.active)?'Saving also includes the unfinished name or account status changes for this user.':''].filter(Boolean).join(' ');
  }
  $('up-global-status').onclick=()=>{if($('up-global-status').disabled)return;state.globalAccount='';state.globalSearch='';$('up-global-search').value='';message('');$('up-global-dialog').showModal();renderGlobalStatus();$('up-global-search').focus();};
  $('up-global-close').onclick=()=>$('up-global-dialog').close();
  $('up-global-search').oninput=e=>{state.globalSearch=e.target.value;renderGlobalStatus();};
  $('up-global-results').onclick=e=>{const id=e.target.closest('button')?.dataset.globalUser;if(!id||state.busy||state.waiting||state.pending)return;state.globalAccount=id;message('');renderGlobalStatus();};
  for(const [id,field] of [['up-global-admin','academyAdmin'],['up-global-teacher','academyTeacher']])$(id).onchange=e=>{
    if($(id).disabled)return;const edit=profileDraft(state.globalAccount);if(!edit)return;edit[field]=e.target.checked;remember();message('Global status changes are kept until saved.');render();};
  $('up-global-discard').onclick=()=>{if($('up-global-discard').disabled)return;const account=state.data.accounts.find(a=>a.accountId===state.globalAccount),edit=findEdit('profile',state.globalAccount);if(!account||!edit)return;if(edit.academyAdmin!==undefined)edit.academyAdmin=Boolean(account.academyAdmin);if(edit.academyTeacher!==undefined)edit.academyTeacher=Boolean(account.academyTeacher);closeCleanEditors(new Set([account.accountId]));message('Global status changes discarded.');render();};
  $('up-global-save').onclick=async()=>{if($('up-global-save').disabled)return;const edit=findEdit('profile',state.globalAccount);await save(0,edit?[edit]:null);if(state.conflict)$('up-global-dialog').close();};
  $('up-profile-close').onclick=()=>$('up-profile-dialog').close();
  async function userLink(accountId,share,view=false){
    state.busy=true;render();
    try{
      const {loginPath}=await api('link',{accountId});if(!/^\/account\/[A-Za-z0-9_-]+$/.test(loginPath))throw Error('The sign-in link is unavailable.');
      const url=location.origin+loginPath;showLink(loginPath);
      if(view){$('up-profile-title').textContent='Login link · '+(state.data.accounts.find(a=>a.accountId===accountId)?.displayName||'User');$('up-profile-body').innerHTML=`<p>Personal sign-in link</p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="overflow-wrap:anywhere">${esc(url)}</a>`;$('up-profile-dialog').showModal();}
      else if(share&&navigator.share){try{await navigator.share({title:'Academy sign-in',url});}catch(error){if(error.name!=='AbortError')message('The link is shown below; copy it to share.',true);}}
      else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);message('Sign-in link copied.');}
      else message('Select and copy the sign-in link shown below.');
    }catch(error){message(error.message,true);}finally{state.busy=false;render();}
  }
  if(program){$('up-back').href=`/programs/manage.html?program=${encodeURIComponent(program)}`;$('up-back').textContent='← Program management';}
  window.addEventListener('beforeunload',e=>{if(changedEntries().length||state.pending){e.preventDefault();e.returnValue='';}});
  void refresh();
})();
