/* Shared Academy Subject and Module definitions, with separate usage. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={data:null,tab:'subjects',search:'',subject:'',status:'',edit:null,pending:null,conflict:false,busy:false,key:'',token:''};
  const tell=(text,error=false)=>{$('lc-message').textContent=text;$('lc-message').classList.toggle('is-error',error);};
  const token=()=>localStorage.getItem('m4l_account_token')||'';
  const remember=()=>{if(state.key)sessionStorage.setItem(state.key,JSON.stringify({edit:state.edit,pending:state.pending,tab:state.tab}));};
  async function api(path,input={}){
    const session=token();if(!session)throw Object.assign(Error('Sign in with a Global Admin account to manage Subjects and Modules.'),{status:401});
    const response=await fetch((window.M4L_CONFIG?.API_BASE||'')+'/api/admin/platform/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:JSON.stringify(input)});
    let result;try{result=await response.json();}catch{throw Error('The response could not be read. Your entry is kept.');}
    if(session!==token())throw Object.assign(Error('Your signed-in account changed. Refresh to continue.'),{status:401});
    if(!response.ok||!result.success)throw Object.assign(Error(result.error||'The change could not be confirmed.'),result,{status:response.status});return result;
  }
  const option=(value,label,current)=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`;
  const usedIn=row=>(row?.usedIn||[]).map(a=>`<a href="${a.kind==='PROGRAM'?'/programs/manage.html?program=':'/academy/courses/manage/?course='}${encodeURIComponent(a.id)}">${esc(a.name)} <small>${a.kind==='PROGRAM'?'Program':'Course'}</small></a>`).join(' · ')||'<span class="lc-readonly">Not used yet</span>';
  function draft(row){return state.tab==='subjects'?{kind:'subject',id:row?.SubjectID||'',name:row?.SubjectName||'',baseRevision:row?.Revision||'',active:row?.Active??true}:{kind:'module',id:row?.id||'',name:row?.name||'',subjectId:row?.subjectId||state.subject||'',active:row?.active??true,baseRevision:row?.revision||state.data.emptyRevision};}
  function describe(row){if(!row)return 'Record no longer available.';return [row.name||row.SubjectName,row.subjectName||state.data?.subjects.find(s=>s.SubjectID===row.subjectId)?.SubjectName,row.active===false||row.Active===false?'Archived':'Active'].filter(Boolean).join(' · ');}
  function currentRow(){const e=state.edit;if(!e||!state.data)return null;return e.kind==='subject'?state.data.subjects.find(s=>s.SubjectID===e.id):state.data.modules.find(m=>m.id===e.id);}
  function render(){
    $('lc-workspace').hidden=!state.data;const locked=state.busy||Boolean(state.pending),e=state.edit;
    for(const id of ['lc-add','lc-refresh','lc-subjects','lc-modules'])$(id).disabled=locked;
    $('lc-retry').disabled=state.busy;$('lc-pending').hidden=!state.pending;$('lc-conflict').hidden=!state.conflict;
    $('lc-keep').disabled=locked||!currentRow();$('lc-use-saved').disabled=locked;
    if(!state.data){$('lc-rows').innerHTML='';$('lc-head').innerHTML='';$('lc-comparison').innerHTML='';return;}
    if(state.conflict)$('lc-comparison').innerHTML='<p><strong>Saved:</strong> '+esc(describe(currentRow()))+'</p><p><strong>Your entry:</strong> '+esc(describe(e))+'</p>';
    const modules=state.tab==='modules';$('lc-subjects').setAttribute('aria-pressed',String(!modules));$('lc-modules').setAttribute('aria-pressed',String(modules));
    $('lc-add').disabled=locked||modules&&!state.data.modulesReady;
    $('lc-search').placeholder=modules?'Find a module…':'Find a subject…';$('lc-add').textContent=modules?'＋ Add module':'＋ Add subject';$('lc-area').hidden=!modules;
    $('lc-area').innerHTML=option('','All Subjects',state.subject)+state.data.subjects.map(s=>option(s.SubjectID,s.SubjectName,state.subject)).join('');
    $('lc-help').textContent=modules?(state.data.modulesReady?'Academy Modules belong to Subjects. Used in shows where Programs and Courses use each Module.':'The shared Module catalogue needs its database upgrade.'):'Academy Subjects are shared across Programs and Courses. Used in shows their current usage.';
    $('lc-head').innerHTML=modules?'<tr><th>Module</th><th>Subject</th><th>Status</th><th>Used in</th><th>Changes</th></tr>':'<tr><th>Subject</th><th>Status</th><th>Used in</th><th>Changes</th></tr>';
    $('lc-head').parentElement?.classList.toggle('lc-modules-grid',modules);
    const rows=(modules?state.data.modules:state.data.subjects).filter(r=>{const active=modules?r.active:r.Active;return (!state.status||active===(state.status==='active'))&&(!modules||!state.subject||r.subjectId===state.subject)&&[modules?r.name:r.SubjectName,r.subjectName,...(r.usedIn||[]).map(a=>a.name)].some(v=>String(v||'').toLowerCase().includes(state.search.toLowerCase()));});
    $('lc-count').textContent=rows.length+' '+(modules?'module':'subject')+(rows.length===1?'':'s');
    const editing=e&&(e.kind==='module')===modules;
    let html='';
    if(editing){
      const name=`<input data-field="name" aria-label="${modules?'Module':'Subject'} name" maxlength="160" value="${esc(e.name)}" ${locked?'disabled':''}>`;
      if(!modules)html='<tr class="lc-edit"><td>'+name+'</td><td>'+(e.active?'Active':'Archived')+'</td><td class="lc-usage">'+usedIn(currentRow())+'</td>';
      else html='<tr class="lc-edit"><td>'+name+'</td><td><select data-field="subjectId" aria-label="Module subject" '+(locked?'disabled':'')+'>'+option('','Choose a Subject',e.subjectId)+state.data.subjects.filter(s=>s.Active||s.SubjectID===e.subjectId).map(s=>option(s.SubjectID,s.SubjectName,e.subjectId)).join('')+'</select></td><td><select data-field="active" aria-label="Module status" '+(locked?'disabled':'')+'>'+option('true','Active',String(e.active))+option('false','Archived',String(e.active))+'</select></td><td class="lc-usage">'+usedIn(currentRow())+'</td>';
      html+='<td><button data-save '+(locked||state.conflict?'disabled':'')+'>Save</button><button data-cancel class="pb-secondary" '+(locked?'disabled':'')+'>Discard</button></td></tr>';
    }
    for(const row of rows){if(editing&&(modules?row.id===e.id:row.SubjectID===e.id))continue;
      const index=(modules?state.data.modules:state.data.subjects).indexOf(row);
      html+=modules?'<tr><td>'+esc(row.name)+'</td><td>'+esc(row.subjectName||'Choose a Subject')+'</td><td>'+(row.active?'Active':'Archived')+'</td>':'<tr><td>'+esc(row.SubjectName)+'</td><td>'+(row.Active?'Active':'Archived')+'</td>';
      html+='<td class="lc-usage">'+usedIn(row)+'</td><td><button data-edit="'+index+'" class="pb-secondary" '+(locked||state.conflict||!modules&&!row.Active?'disabled':'')+'>Edit</button></td></tr>';
    }
    $('lc-rows').innerHTML=html||'<tr><td class="lc-empty" colspan="'+(modules?5:4)+'">No matching records.</td></tr>';
  }
  async function load(restore=false){
    if(state.busy)return;state.busy=true;render();
    try{const result=await api('learning-catalogue/get');state.data=result;state.token=token();
      const key='m4l-learning-catalogue-v2:'+location.host+':'+result.viewerAccountId;
      if(restore&&state.key!==key){state.key=key;try{const kept=JSON.parse(sessionStorage.getItem(key)||'null');if(kept){state.edit=kept.edit;state.pending=kept.pending;state.tab=kept.tab==='modules'?'modules':'subjects';}}catch{sessionStorage.removeItem(key);}}
      state.key=key;tell(state.pending?'Your unconfirmed save is kept. Retry the same change.':state.edit?'Your unfinished entry is kept.':'');
    }catch(error){if([401,403].includes(error.status)){state.data=null;state.edit=null;state.pending=null;state.conflict=false;state.key='';}tell(error.message,true);}
    finally{state.busy=false;render();}
  }
  function begin(row){if(state.edit){tell('Save or discard your current entry first.',true);return;}state.edit=draft(row);state.conflict=false;remember();render();$('lc-rows').querySelector?.('input')?.focus();}
  function request(){const e=state.edit,operationId=crypto.randomUUID();
    if(e.kind==='subject')return {path:'academy-subjects/save',body:{mode:e.id?'rename':'create',subjectId:e.id,subjectName:e.name,baseRevision:e.baseRevision,operationId}};
    return {path:'learning-catalogue/module/save',body:{id:e.id,name:e.name,subjectId:e.subjectId,active:e.active,baseRevision:e.baseRevision,operationId}};
  }
  async function save(){
    if(state.busy||state.conflict||!state.edit)return;
    try{state.pending=state.pending||request();}catch(error){tell(error.message,true);return;}remember();state.busy=true;render();let confirmed=false;
    try{await api(state.pending.path,state.pending.body);state.edit=null;state.pending=null;state.conflict=false;remember();confirmed=true;tell('Saved.');}
    catch(error){if(error.status&&error.status<500){state.pending=null;if(['ROW_CHANGED','WORKFLOW_CHANGED'].includes(error.code))state.conflict=true;remember();}if([401,403].includes(error.status)){state.data=null;state.key='';}tell(error.message,true);}
    finally{state.busy=false;render();}
    if(confirmed||state.conflict){await load();if(confirmed&&!$('lc-message').classList.contains('is-error'))tell('Saved.');else if(state.conflict)tell('Records changed elsewhere. Compare the saved record with your entry before continuing.',true);}
  }
  for(const tab of ['subjects','modules'])$('lc-'+tab).onclick=()=>{if(state.edit||state.pending){tell('Save or discard your current entry first.',true);return;}state.tab=tab;state.search='';$('lc-search').value='';render();};
  $('lc-add').onclick=()=>begin();$('lc-refresh').onclick=()=>void load();$('lc-retry').onclick=()=>void save();
  $('lc-search').oninput=e=>{state.search=e.target.value;render();};$('lc-area').onchange=e=>{state.subject=e.target.value;render();};$('lc-status').onchange=e=>{state.status=e.target.value;render();};
  $('lc-rows').onclick=e=>{const d=e.target.closest('button')?.dataset;if(!d||state.busy||state.pending)return;if(d.edit!==undefined)begin((state.tab==='modules'?state.data.modules:state.data.subjects)[Number(d.edit)]);if(d.save!==undefined)void save();if(d.cancel!==undefined){state.edit=null;state.conflict=false;remember();render();tell('Entry discarded.');}};
  const change=e=>{const field=e.target.dataset.field;if(!field||!state.edit||state.busy||state.pending)return;state.edit[field]=field==='active'?e.target.value==='true':e.target.value;remember();if(['subjectId','active'].includes(field))render();};
  $('lc-rows').oninput=change;$('lc-rows').onchange=change;
  $('lc-use-saved').onclick=()=>{state.edit=null;state.conflict=false;remember();render();tell('Saved version kept.');};
  $('lc-keep').onclick=()=>{const current=currentRow();if(!current)return;state.edit.baseRevision=current.Revision||current.revision||state.data.emptyRevision;state.conflict=false;remember();render();tell('Reviewed. Select Save to apply your changes.');};
  window.addEventListener('beforeunload',e=>{if(state.edit||state.pending){e.preventDefault();e.returnValue='';}});
  window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null){state.data=null;state.edit=null;state.pending=null;state.conflict=false;state.key='';render();void load(true);}});
  void load(true);
})();
