/* V105.3.2.1 — staged academy access matrix; legacy access remains unchanged. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search),program=params.get('program'),base=window.M4L_CONFIG?.API_BASE||'',storageKey=`m4l-user-profiles:${location.host}`;
  const labels={USER:'User',STUDENT:'Student',TEACHER:'Teacher',SENIOR:'Senior',ADMIN:'Admin'};
  const state={data:null,selected:params.get('account')||'',edit:null,pending:null,busy:false,waiting:false,timer:null,search:'',filter:'',conflict:null,loaded:false};
  const message=(text,error=false)=>{$('up-message').textContent=text;$('up-message').classList.toggle('is-error',error);};
  const roleNames=roles=>(roles.length?roles:['USER']).map(role=>labels[role]).join(' · ');
  const scopeKey=scope=>`${scope.type}:${scope.id}`;
  const currentEdit=()=>state.edit;
  function remember(){for(const key of ['edit','pending']){if(state[key])sessionStorage.setItem(`${storageKey}:${key}`,JSON.stringify(state[key]));else sessionStorage.removeItem(`${storageKey}:${key}`);}}
  async function api(action,input={}){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw Object.assign(new Error('Sign in with your academy administrator account, then open User profiles.'),{status:401});
    const response=await fetch(`${base}/api/admin/platform/user-profiles/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
    let result;try{result=await response.json();}catch{throw new Error('The response could not be read. Your entry is kept.');}
    if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The change could not be confirmed.'),result,{status:response.status});return result;
  }
  function render(){
    if(state.loaded)remember();const editable=Boolean(state.data)&&!state.busy&&!state.pending,edit=currentEdit();
    $('up-refresh').disabled=state.busy||state.waiting;$('up-add').disabled=!editable||Boolean(edit)||!state.data?.prepared;
    $('up-retry').disabled=state.busy||state.waiting;$('up-pending').hidden=!state.pending;
    $('up-draft-notice').hidden=!edit;$('up-return').disabled=state.busy;
    $('up-save').hidden=$('up-cancel').hidden=!edit;$('up-save').disabled=!editable||state.waiting||Boolean(state.conflict);$('up-cancel').disabled=state.busy||Boolean(state.pending);
    $('up-conflict').hidden=!state.conflict||!edit;
    const describe=record=>edit?.mode==='profile'?`${record?.displayName||'Removed'} · ${record?.active?'Active':'Inactive'}`:edit?.mode==='matrix-policy'?record?.accessModel||'Unknown':roleNames(record?.roles||[])+(record?.accessModel?` · ${record.accessModel==='FREE'?'Free':'Paid'} setting`:'');
    if(state.conflict&&edit)$('up-comparison').innerHTML=`<table class="pm-grid"><thead><tr><th>Saved version</th><th>Your entry</th></tr></thead><tbody><tr><td>${esc(describe(state.conflict.currentRecord))}</td><td>${esc(describe(edit))}</td></tr></tbody></table>`;
    $('up-keep-mine').disabled=!editable||!state.conflict?.currentRecord;$('up-use-saved').disabled=state.busy;
    if(!state.data)return;
    const blocked=!editable||Boolean(edit),scopes=state.data.scopes;
    $('up-setup').hidden=!state.data.needsSync;$('up-setup').disabled=blocked||state.waiting;
    $('up-review-count').textContent=`${state.data.reviewCount||0} role entries and ${scopes.filter(s=>s.reviewStatus==='REQUIRED').length} Free/Paid settings need review.`;
    $('up-head').innerHTML=`<tr><th scope="col">User name</th><th scope="col">Status</th>${scopes.map(scope=>{
      const editing=edit?.mode==='matrix-policy'&&edit.scopeType===scope.type&&edit.scopeId===scope.id;
      return `<th scope="col"><strong>${esc(scope.name)}</strong><small>${scope.type==='SUBJECT'?'Global subject':'Program'}${scope.active?'':' · Inactive'}</small>${editing?`<label>Access<select data-access-model aria-label="Access for ${esc(scope.name)}" ${!editable?'disabled':''}><option value="FREE" ${edit.accessModel==='FREE'?'selected':''}>Free</option><option value="PAID" ${edit.accessModel==='PAID'?'selected':''}>Paid</option></select></label><label class="up-confirm"><input type="checkbox" data-policy-confirm ${edit.policyConfirmed?'checked':''} ${!editable?'disabled':''}>Applies to this entire program/course</label>`:`<button type="button" class="pb-secondary" data-policy="${esc(scopeKey(scope))}" ${blocked||!scope.prepared?'disabled':''}>${scope.accessModel==='FREE'?'Free':'Paid'} ▾</button>`}${scope.reviewStatus==='REQUIRED'?'<small class="up-review">Review setting</small>':''}</th>`;
    }).join('')}<th scope="col">Actions</th></tr>`;
    const accounts=state.data.accounts.filter(a=>(!state.filter||a.active===(state.filter==='active'))&&[a.displayName,...a.assignments.map(g=>roleNames(g.roles))].some(v=>v.toLowerCase().includes(state.search.toLowerCase())));
    if(edit?.mode==='profile'&&edit.creating)accounts.unshift({accountId:edit.accountId,displayName:edit.displayName,active:edit.active,assignments:[]});
    $('up-count').textContent=`${accounts.length} shown · ${state.data.accounts.length} users`;
    $('up-users').innerHTML=accounts.map(a=>{
      const profileEdit=edit?.mode==='profile'&&edit.accountId===a.accountId;
      return `<tr data-user="${esc(a.accountId)}" class="${a.active?'':'up-account-inactive'} ${edit?.accountId===a.accountId?'is-editing':''} ${state.selected===a.accountId?'up-selected':''}"><td data-label="User name">${profileEdit?`<input data-name maxlength="160" aria-label="User name" value="${esc(edit.displayName)}" ${!editable?'disabled':''}>`:`<button type="button" class="up-cell" data-profile="${esc(a.accountId)}" ${blocked||!state.data.prepared?'disabled':''}>${esc(a.displayName)}</button>`}${a.academyAdmin?'<small>Academy administrator</small>':''}</td><td data-label="Status">${profileEdit?`<select data-active aria-label="Account status" ${!editable?'disabled':''}><option value="true" ${edit.active?'selected':''}>Active</option><option value="false" ${!edit.active?'selected':''}>Inactive</option></select>`:`<button type="button" class="up-cell" data-profile="${esc(a.accountId)}" ${blocked||!state.data.prepared?'disabled':''}>${a.active?'Active':'Inactive'}</button>`}</td>${scopes.map(scope=>{
        const grant=a.assignments.find(g=>g.scopeType===scope.type&&g.scopeId===scope.id),editing=edit?.mode==='matrix-roles'&&edit.accountId===a.accountId&&edit.scopeType===scope.type&&edit.scopeId===scope.id,roles=editing?edit.roles:grant?.roles||[];
        return `<td data-label="${esc(scope.name)}">${editing?`<fieldset class="up-role-choices"><legend>Roles for ${esc(a.displayName)} · ${esc(scope.name)}</legend><label><input type="checkbox" data-default-user ${roles.length?'':'checked'} ${!editable?'disabled':''}>User (default)</label>${state.data.roles.map(role=>`<label><input type="checkbox" data-role="${role}" ${roles.includes(role)?'checked':''} ${!editable?'disabled':''}>${labels[role]}</label>`).join('')}</fieldset>`:`<button type="button" class="up-cell" data-edit-scope="${esc(scopeKey(scope))}" data-account="${esc(a.accountId)}" ${blocked||!scope.prepared||!grant?'disabled':''}>${esc(roleNames(roles))} ▾</button>`}${grant?.reviewStatus==='REQUIRED'?'<small class="up-review">Confirm imported role</small>':''}</td>`;
      }).join('')}<td data-label="Actions"><button type="button" class="pb-secondary" data-link="${esc(a.accountId)}" ${state.busy||state.waiting||edit?.creating?'disabled':''}>Sign-in link</button></td></tr>`;
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
        for(const key of ['edit','pending'])try{state[key]=JSON.parse(sessionStorage.getItem(`${storageKey}:${key}`)||'null');}catch{sessionStorage.removeItem(`${storageKey}:${key}`);}
        if(state.pending&&!state.edit)state.edit={...state.pending};
        if(state.edit)state.selected=state.edit.accountId;
        state.loaded=true;
      }
      $('up-wait').hidden=true;message(state.edit?'Records refreshed. Your unfinished entry is kept.':afterSave?'Saved.':'Edit a name, status, role cell or Free/Paid column setting.');
    }catch(error){message(`${afterSave?'Saved. The latest records could not be loaded. ':''}${error.message}`,true);if(!schedule(error,next=>refresh(next,afterSave),attempt,'Refreshing records')){$('up-wait').textContent='Automatic refresh has stopped. Your displayed records and entry are kept. Use Refresh to try again.';$('up-wait').hidden=false;}}
    finally{state.busy=false;render();}
    if(state.pending&&!state.waiting&&state.data)void save();
  }
  function applyAcknowledgement(result){
    if(result.profile){let account=state.data.accounts.find(a=>a.accountId===result.profile.accountId);if(account)Object.assign(account,result.profile);else state.data.accounts.push({...result.profile,assignments:result.profile.assignments||[]});}
    if(result.assignment){const account=state.data.accounts.find(a=>a.accountId===result.assignment.accountId);if(account){const index=account.assignments.findIndex(g=>g.scopeType===result.assignment.scopeType&&g.scopeId===result.assignment.scopeId);if(index<0)account.assignments.push(result.assignment);else account.assignments[index]=result.assignment;}}
    if(result.scope){const scope=state.data.scopes.find(s=>scopeKey(s)===scopeKey(result.scope));if(scope)Object.assign(scope,result.scope);}
    state.data.reviewCount=state.data.accounts.flatMap(a=>a.assignments).filter(g=>g.reviewStatus==='REQUIRED').length;
    if(result.loginPath)showLink(result.loginPath);
  }
  async function save(attempt=0){
    if(state.busy||state.waiting||(!state.edit&&!state.pending))return;
    if(state.conflict){message('Review the changed record before saving.',true);return;}
    if(!state.pending)state.pending={...structuredClone(state.edit),operationId:crypto.randomUUID()};remember();state.busy=true;render();
    let confirmed=false;
    try{
      const {needsRecovery,...body}=state.pending;const result=await api('save',body);state.pending=null;state.edit=null;remember();confirmed=true;
      applyAcknowledgement(result);message('Saved.');
    }catch(error){
      if(!state.pending){message('Saved. The display could not refresh; your save is confirmed.',true);}
      else if(error.code==='ROW_CHANGED'){state.conflict={currentRecord:error.currentRecord,rowRevision:error.rowRevision,scopeRevision:error.currentRecord?.scopeRevision};state.pending=null;remember();message(error.message,true);}
      else if(error.status&&error.status<500&&error.code!=='RECOVERY_REQUIRED'){state.pending=null;remember();message(error.message,true);}
      else {message(error.message,true);if(error.code==='RECOVERY_REQUIRED'){$('up-wait').hidden=false;$('up-wait').textContent='An earlier academy change needs recovery. Retry will recover it before saving this entry.';state.pending.needsRecovery=true;remember();}else schedule(error,save,attempt,'Retrying the same save');}
    }finally{state.busy=false;render();}
    if(confirmed)await refresh(0,true);
  }
  function showLink(path){if(!/^\/account\/[A-Za-z0-9_-]+$/.test(path))return;$('up-link').hidden=false;$('up-link').innerHTML=`Personal sign-in link: <a href="${esc(path)}">${esc(location.origin+path)}</a>`;}
  function cancel(){if(state.busy||state.pending)return;state.edit=null;state.conflict=null;render();message('Unsaved entry discarded.');}
  $('up-search').oninput=e=>{state.search=e.target.value;render();};$('up-status-filter').onchange=e=>{state.filter=e.target.value;render();};
  function startEdit(edit){if(state.edit||state.busy||state.pending)return;state.edit=edit;state.conflict=null;$('up-link').hidden=true;render();}
  $('up-return').onclick=()=>{state.search='';state.filter='';$('up-search').value='';$('up-status-filter').value='';render();document.querySelector?.('.is-editing input, [data-access-model]')?.focus();};
  $('up-add').onclick=()=>{if(state.data?.prepared)startEdit({mode:'profile',accountId:crypto.randomUUID(),creating:true,displayName:'',active:true,baseRevision:state.data.emptyRevision});};
  $('up-setup').onclick=()=>{startEdit({mode:'matrix-prepare'});void save();};
  $('up-users').onclick=async e=>{
    const button=e.target.closest('button');if(!button||state.busy||state.pending)return;
    const {profile,editScope,account,link}=button.dataset;
    if(link){state.busy=true;render();try{showLink((await api('link',{accountId:link})).loginPath);}catch(error){message(error.message,true);}finally{state.busy=false;render();}return;}
    if(profile){const a=state.data.accounts.find(a=>a.accountId===profile);if(a)startEdit({mode:'profile',accountId:a.accountId,creating:false,displayName:a.displayName,active:a.active,baseRevision:a.revision});}
    if(editScope){const scope=state.data.scopes.find(s=>scopeKey(s)===editScope),a=state.data.accounts.find(a=>a.accountId===account),grant=a?.assignments.find(g=>g.scopeType===scope?.type&&g.scopeId===scope?.id);if(grant)startEdit({mode:'matrix-roles',accountId:account,scopeType:scope.type,scopeId:scope.id,roles:[...grant.roles],baseRevision:grant.revision,scopeRevision:scope.revision});}
  };
  $('up-users').oninput=e=>{if(state.edit?.mode==='profile'&&!state.pending&&Object.hasOwn(e.target.dataset,'name')){state.edit.displayName=e.target.value;remember();}};
  $('up-users').onchange=e=>{const edit=state.edit;if(!edit||state.busy||state.pending)return;
    if(edit.mode==='profile'&&Object.hasOwn(e.target.dataset,'active'))edit.active=e.target.value==='true';
    if(edit.mode==='matrix-roles'){const {role,defaultUser}=e.target.dataset;if(role){edit.roles=edit.roles.filter(r=>r!==role);if(e.target.checked)edit.roles.push(role);}if(defaultUser!==undefined&&e.target.checked)edit.roles=[];}
    render();
  };
  $('up-head').onclick=e=>{const policy=e.target.closest('button')?.dataset.policy,scope=state.data.scopes.find(s=>scopeKey(s)===policy);if(scope)startEdit({mode:'matrix-policy',scopeType:scope.type,scopeId:scope.id,accessModel:scope.accessModel,baseRevision:scope.revision,policyConfirmed:false});};
  $('up-head').onchange=e=>{if(state.edit?.mode!=='matrix-policy'||state.busy||state.pending)return;
    if(Object.hasOwn(e.target.dataset,'accessModel')){state.edit.accessModel=e.target.value;state.edit.policyConfirmed=false;}
    if(Object.hasOwn(e.target.dataset,'policyConfirm'))state.edit.policyConfirmed=e.target.checked;render();
  };
  $('up-save').onclick=()=>void save();$('up-cancel').onclick=cancel;
  $('up-users').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void save();}};
  $('up-refresh').onclick=()=>void refresh();
  $('up-retry').onclick=async()=>{if(state.busy||state.waiting)return;if(state.pending?.needsRecovery){state.busy=true;render();try{await api('recover');delete state.pending.needsRecovery;}catch(error){message(error.message,true);state.busy=false;render();return;}state.busy=false;}void save();};
  $('up-keep-mine').onclick=()=>{if(!state.conflict?.currentRecord||!state.edit||state.busy)return;state.edit.baseRevision=state.conflict.rowRevision;if(state.conflict.scopeRevision)state.edit.scopeRevision=state.conflict.scopeRevision;state.conflict=null;remember();void save();};
  $('up-use-saved').onclick=()=>{cancel();void refresh();};
  if(program){$('up-back').href=`/programs/manage.html?program=${encodeURIComponent(program)}`;$('up-back').textContent='← Program management';}
  window.addEventListener('beforeunload',e=>{if(state.edit||state.pending){e.preventDefault();e.returnValue='';}});
  void refresh();
})();
