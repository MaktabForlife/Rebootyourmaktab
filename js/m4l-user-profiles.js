/* V105.3.2 — one academy identity, scoped roles/subscriptions, independent account status. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search),program=params.get('program'),base=window.M4L_CONFIG?.API_BASE||'',storageKey=`m4l-user-profiles:${location.host}`;
  const labels={USER:'User (free)',STUDENT:'Student (paid)',TEACHER:'Teacher',SENIOR:'Senior',ADMIN:'Admin'};
  const state={data:null,selected:params.get('account')||'',edit:null,pending:null,busy:false,waiting:false,timer:null,search:'',filter:'',conflict:null,loaded:false};
  const message=(text,error=false)=>{$('up-message').textContent=text;$('up-message').classList.toggle('is-error',error);};
  const roleNames=roles=>(roles.includes('STUDENT')?roles:['USER',...roles]).map(role=>labels[role]).join(' · ');
  const scopeKey=scope=>`${scope.type}:${scope.id}`;
  const selected=()=>state.data?.accounts.find(a=>a.accountId===state.selected);
  const currentEdit=()=>state.edit?.accountId===state.selected?state.edit:null;
  function remember(){for(const key of ['edit','pending']){if(state[key])sessionStorage.setItem(`${storageKey}:${key}`,JSON.stringify(state[key]));else sessionStorage.removeItem(`${storageKey}:${key}`);}}
  async function api(action,input={}){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw Object.assign(new Error('Sign in with your academy administrator account, then open User profiles.'),{status:401});
    const response=await fetch(`${base}/api/admin/platform/user-profiles/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
    let result;try{result=await response.json();}catch{throw new Error('The response could not be read. Your entry is kept.');}
    if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The change could not be confirmed.'),result,{status:response.status});return result;
  }
  function render(){
    if(state.loaded)remember();const editable=Boolean(state.data)&&!state.busy&&!state.pending,edit=currentEdit(),account=selected();
    $('up-refresh').disabled=state.busy||state.waiting;$('up-add').disabled=!editable||Boolean(state.edit);
    $('up-retry').disabled=state.busy||state.waiting;$('up-pending').hidden=!state.pending;
    $('up-draft-notice').hidden=!state.edit||Boolean(edit);$('up-return').disabled=state.busy;
    $('up-conflict').hidden=!state.conflict||!edit;
    if(state.conflict&&edit){$('up-comparison').innerHTML=`<table class="pm-grid"><thead><tr><th>Saved version</th><th>Your entry</th></tr></thead><tbody><tr><td>${esc(edit.mode==='profile'?`${state.conflict.currentRecord?.displayName||'Removed'} · ${state.conflict.currentRecord?.active?'Active':'Inactive'}`:roleNames(state.conflict.currentRecord?.roles||[]))}</td><td>${esc(edit.mode==='profile'?`${edit.displayName} · ${edit.active?'Active':'Inactive'}`:roleNames(edit.roles))}</td></tr></tbody></table>`;}
    $('up-keep-mine').disabled=!editable||!state.conflict?.currentRecord;$('up-use-saved').disabled=state.busy;
    if(!state.data)return;
    const accounts=state.data.accounts.filter(a=>(!state.filter||a.active===(state.filter==='active'))&&[a.displayName,...a.assignments.map(g=>roleNames(g.roles))].some(v=>v.toLowerCase().includes(state.search.toLowerCase())));
    $('up-count').textContent=`${accounts.length} of ${state.data.accounts.length} users`;
    $('up-users').innerHTML=accounts.map(a=>`<tr class="${a.active?'':'up-account-inactive'}"><td data-label="User">${esc(a.displayName)}${a.academyAdmin?'<small class="pm-muted">Academy administrator</small>':''}</td><td data-label="Active / Inactive">${a.active?'Active':'Inactive'}</td><td data-label="Roles / subscription">${a.assignments.filter(g=>g.roles.length).map(g=>`<span class="up-scope-summary">${esc(state.data.scopes.find(s=>s.type===g.scopeType&&s.id===g.scopeId)?.name||g.scopeId)}: ${esc(roleNames(g.roles))}</span>`).join('')||'User (free)'}</td><td data-label="Actions"><button type="button" class="pb-secondary" data-account="${esc(a.accountId)}">Open profile</button></td></tr>`).join('')||'<tr><td colspan="4" class="pm-empty">No matching users.</td></tr>';
    $('up-detail').hidden=!account&&!edit;
    if(!account&&!edit)return;
    const profileEdit=edit?.mode==='profile';
    $('up-name').textContent=profileEdit&&edit.creating?'New user':account?.displayName||edit.displayName;
    $('up-display-name').value=profileEdit?edit.displayName:account?.displayName||'';$('up-active').value=String(profileEdit?edit.active:account?.active);
    $('up-display-name').disabled=$('up-active').disabled=!profileEdit||!editable;
    $('up-edit-profile').hidden=profileEdit;$('up-edit-profile').disabled=!editable||Boolean(state.edit);
    $('up-save-profile').hidden=$('up-cancel-profile').hidden=!profileEdit;$('up-save-profile').disabled=!editable||state.waiting;
    $('up-cancel-profile').disabled=state.busy||Boolean(state.pending);$('up-personal-link').disabled=!account||state.busy||state.waiting;
    $('up-assignments').hidden=!account;
    if(!account)return;
    const ordered=[...state.data.scopes].sort((a,b)=>(b.id===program)-(a.id===program));
    $('up-roles').innerHTML=ordered.map(scope=>{
      const grant=account.assignments.find(g=>g.scopeType===scope.type&&g.scopeId===scope.id),editing=edit?.mode==='roles'&&edit.scopeType===scope.type&&edit.scopeId===scope.id,roles=editing?edit.roles:grant?.roles||[],needsConfirmation=editing&&roles.includes('STUDENT')&&!grant?.roles.includes('STUDENT');
      return `<tr class="${editing?'is-editing':''}"><td data-label="Subject / program"><strong>${esc(scope.name)}</strong><small class="pm-muted">${scope.type==='SUBJECT'?'Global subject':scope.legacy?'Existing program':'Program'}${!scope.active?' · Inactive':''}</small></td><td data-label="Roles / subscription">${editing?`<div class="up-role-choices"><label><input type="radio" name="subscription" data-subscription="USER" ${!roles.includes('STUDENT')?'checked':''} ${!editable?'disabled':''}>User (free)</label><label><input type="radio" name="subscription" data-subscription="STUDENT" ${roles.includes('STUDENT')?'checked':''} ${!editable||scope.accessModel==='FREE'?'disabled':''}>Student (paid)</label>${['TEACHER','SENIOR','ADMIN'].map(role=>`<label><input type="checkbox" data-role="${role}" ${roles.includes(role)?'checked':''} ${!editable?'disabled':''}>${labels[role]}</label>`).join('')}</div>${needsConfirmation?`<label class="up-paid-confirm"><input type="checkbox" data-paid-confirm ${edit.subscriptionConfirmed?'checked':''} ${!editable?'disabled':''}>I confirm a paid subscription for this subject/program.</label>`:''}`:esc(roleNames(roles))}${scope.accessModel==='FREE'?'<small class="pm-muted">Free subject: no paid subscription required.</small>':''}${scope.legacy?'<small class="pm-muted">Additional Reboot roles require an existing linked staff/student record.</small>':''}</td><td data-label="Changes">${editing?`<button type="button" data-save-roles ${!editable||state.waiting?'disabled':''}>Save roles</button><button type="button" class="pb-secondary" data-cancel ${state.busy||state.pending?'disabled':''}>Cancel</button>`:`<button type="button" class="pb-secondary" data-edit-scope="${esc(scopeKey(scope))}" ${!editable||state.edit?'disabled':''}>Edit roles</button>`}</td></tr>`;
    }).join('')||'<tr><td colspan="3" class="pm-empty">Create a global subject or program to assign roles.</td></tr>';
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
      if(!state.selected&&state.data.accounts.length)state.selected=state.data.accounts[0].accountId;
      $('up-wait').hidden=true;message(state.edit?'Records refreshed. Your unfinished entry is kept.':afterSave?'Saved.':'Choose a user to manage their profile, roles and subscriptions.');
    }catch(error){message(`${afterSave?'Saved. The latest records could not be loaded. ':''}${error.message}`,true);if(!schedule(error,next=>refresh(next,afterSave),attempt,'Refreshing records')){$('up-wait').textContent='Automatic refresh has stopped. Your displayed records and entry are kept. Use Refresh to try again.';$('up-wait').hidden=false;}}
    finally{state.busy=false;render();}
    if(state.pending&&!state.waiting&&state.data)void save();
  }
  function applyAcknowledgement(result){
    if(result.profile){let account=state.data.accounts.find(a=>a.accountId===result.profile.accountId);if(account)Object.assign(account,result.profile);else state.data.accounts.push({...result.profile,assignments:result.profile.assignments||[]});}
    if(result.assignment){const account=state.data.accounts.find(a=>a.accountId===result.assignment.accountId);if(account){const index=account.assignments.findIndex(g=>g.scopeType===result.assignment.scopeType&&g.scopeId===result.assignment.scopeId);if(index<0)account.assignments.push(result.assignment);else account.assignments[index]=result.assignment;}}
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
      else if(error.code==='ROW_CHANGED'){state.conflict={currentRecord:error.currentRecord,rowRevision:error.rowRevision};state.pending=null;remember();message(error.message,true);}
      else if(error.status&&error.status<500&&error.code!=='RECOVERY_REQUIRED'){state.pending=null;remember();message(error.message,true);}
      else {message(error.message,true);if(error.code==='RECOVERY_REQUIRED'){$('up-wait').hidden=false;$('up-wait').textContent='An earlier academy change needs recovery. Retry will recover it before saving this entry.';state.pending.needsRecovery=true;remember();}else schedule(error,save,attempt,'Retrying the same save');}
    }finally{state.busy=false;render();}
    if(confirmed)await refresh(0,true);
  }
  function showLink(path){if(!/^\/account\/[A-Za-z0-9_-]+$/.test(path))return;$('up-link').hidden=false;$('up-link').innerHTML=`Personal sign-in link: <a href="${esc(path)}">${esc(location.origin+path)}</a>`;}
  function cancel(){if(state.busy||state.pending)return;state.edit=null;state.conflict=null;render();message('Unsaved entry discarded.');}
  $('up-search').oninput=e=>{state.search=e.target.value;render();};$('up-status-filter').onchange=e=>{state.filter=e.target.value;render();};
  $('up-users').onclick=e=>{const id=e.target.closest('[data-account]')?.dataset.account;if(!id||state.busy)return;state.selected=id;$('up-link').hidden=true;render();};
  $('up-return').onclick=()=>{if(state.edit){state.selected=state.edit.accountId;render();}};
  $('up-add').onclick=()=>{if(!state.data||state.edit||state.busy||state.pending)return;state.selected=crypto.randomUUID();state.edit={mode:'profile',accountId:state.selected,creating:true,displayName:'',active:true,baseRevision:state.data.emptyRevision};state.conflict=null;$('up-link').hidden=true;render();$('up-display-name').focus();};
  $('up-edit-profile').onclick=()=>{const account=selected();if(!account||state.edit||state.busy||state.pending)return;state.edit={mode:'profile',accountId:account.accountId,creating:false,displayName:account.displayName,active:account.active,baseRevision:account.revision};state.conflict=null;render();};
  $('up-display-name').oninput=e=>{if(currentEdit()?.mode==='profile'&&!state.pending){state.edit.displayName=e.target.value;remember();}};
  $('up-active').onchange=e=>{if(currentEdit()?.mode==='profile'&&!state.pending){state.edit.active=e.target.value==='true';remember();}};
  $('up-profile-form').onsubmit=e=>{e.preventDefault();void save();};$('up-cancel-profile').onclick=cancel;
  $('up-roles').onclick=e=>{const button=e.target.closest('button');if(!button||state.busy||state.pending)return;if(button.hasAttribute('data-save-roles'))void save();else if(button.hasAttribute('data-cancel'))cancel();else if(button.dataset.editScope&&!state.edit){const scope=state.data.scopes.find(s=>scopeKey(s)===button.dataset.editScope),account=selected();if(!scope||!account)return;const grant=account.assignments.find(g=>g.scopeType===scope.type&&g.scopeId===scope.id);if(!grant)return;state.edit={mode:'roles',accountId:account.accountId,scopeType:scope.type,scopeId:scope.id,roles:[...grant.roles],baseRevision:grant.revision,subscriptionConfirmed:false};state.conflict=null;render();}};
  $('up-roles').onchange=e=>{const edit=currentEdit();if(edit?.mode!=='roles'||state.busy||state.pending)return;const {role,subscription,paidConfirm}=e.target.dataset;if(role){edit.roles=edit.roles.filter(r=>r!==role);if(e.target.checked)edit.roles.push(role);}if(subscription){edit.roles=edit.roles.filter(r=>r!=='STUDENT');if(subscription==='STUDENT')edit.roles.push('STUDENT');edit.subscriptionConfirmed=false;}if(paidConfirm!==undefined)edit.subscriptionConfirmed=e.target.checked;render();};
  $('up-refresh').onclick=()=>void refresh();
  $('up-retry').onclick=async()=>{if(state.busy||state.waiting)return;if(state.pending?.needsRecovery){state.busy=true;render();try{await api('recover');delete state.pending.needsRecovery;}catch(error){message(error.message,true);state.busy=false;render();return;}state.busy=false;}void save();};
  $('up-keep-mine').onclick=()=>{if(!state.conflict?.currentRecord||!state.edit||state.busy)return;state.edit.baseRevision=state.conflict.rowRevision;state.conflict=null;remember();void save();};
  $('up-use-saved').onclick=()=>{cancel();void refresh();};
  $('up-personal-link').onclick=async()=>{if(state.busy||state.waiting||!selected())return;state.busy=true;render();try{showLink((await api('link',{accountId:state.selected})).loginPath);}catch(error){message(error.message,true);}finally{state.busy=false;render();}};
  if(program){$('up-back').href=`/programs/manage.html?program=${encodeURIComponent(program)}`;$('up-back').textContent='← Program management';}
  window.addEventListener('beforeunload',e=>{if(state.edit||state.pending){e.preventDefault();e.returnValue='';}});
  void refresh();
})();
