/* V105.2 — draft edits stay separate from immutable publication history. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=new URLSearchParams(location.search).get('program'), storageKey=`m4l-timetable-pending:${id}`;
  const state={calendarView:null,data:null,draft:null,baseline:'',busy:false,pending:null,preview:null,history:[]};
  const time=value=>String(value||'').replace(':','h'), inputTime=value=>value.trim().replace(/^(\d{2})(\d{2})$/,'$1:$2').replace(/[hH]/,':');
  const dirty=()=>state.draft&&JSON.stringify(state.draft)!==state.baseline;
  const message=(text,error=false)=>{$('tt-message').textContent=text;$('tt-message').classList.toggle('is-error',error);};
  async function api(action,body={}) {
    const token=localStorage.getItem('m4l_account_token');
    if(!token) throw new Error('Sign in through your personal Academy account link first.');
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/program-timetable/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id,...body})});
    const result=await response.json();
    if(!response.ok||!result.success) throw Object.assign(new Error(result.error||'The request could not be confirmed.'),{status:response.status});
    return result;
  }
  function controls() {
    const locked=state.busy||Boolean(state.pending),ready=state.data?.prepared&&state.data?.coordinatorAvailable&&state.data?.program.status==='DRAFT';
    $('tt-editor').disabled=locked||!ready;
    for(const name of ['save','validate','preview']) $(`tt-${name}`).disabled=locked||!ready;
    $('tt-save').disabled||=!dirty();
    $('tt-publish').disabled=locked||!ready||!state.preview?.valid;
    for(const name of ['reload','recover','history','prepare']) $(`tt-${name}`).disabled=state.busy;
    $('tt-retry').disabled=state.busy;
    $('tt-export').disabled=!state.draft;
    $('tt-pending').hidden=!state.pending;
    $('tt-save-state').textContent=state.pending?'Change not confirmed':dirty()?'Unsaved draft changes':'Saved draft';
  }
  async function work(fn){if(state.busy)return;state.busy=true;controls();try{await fn();}catch(error){message(error.message,true);}finally{state.busy=false;controls();}}
  function invalidate(){state.preview=null;$('tt-publish').hidden=true;$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;controls();}
  function options(rows,selected,empty='Choose…'){return `<option value="">${empty}</option>`+rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''}>${esc(row.name)}</option>`).join('')+(selected&&!rows.some(r=>r.id===selected)?`<option selected value="${esc(selected)}">Unavailable: ${esc(selected)}</option>`:'');}
  function modules(){const c=state.data.catalog;return c.modules.filter(m=>m.active).map(m=>{const s=c.subjects.find(s=>s.id===m.programSubjectId),l=c.levels.find(l=>l.id===m.levelId);return {id:m.id,name:`${m.name} · ${s?.name||'Missing subject'}${l?` / ${l.name}`:''}`};});}
  const rowLabel=id=>{const rule=state.draft.rules.findIndex(r=>r.id===id),exception=state.draft.exceptions.findIndex(r=>r.id===id);return rule>=0?`Lesson ${rule+1}`:exception>=0?`Exception ${exception+1}`:'Timetable';};
  const anchorLabel=anchor=>{const [id,date]=anchor.split('@');return `${rowLabel(id)} on ${date}`;};
  const field=(row,key,type='text')=>`<input aria-label="${esc({startDate:'First date',endDate:'Last date',startTime:'Start time',endTime:'End time',originalDate:'Original date',date:'New date'}[key]||key)} · ${esc(rowLabel(row.id))}" data-field="${key}" type="${type}" value="${esc(key.endsWith('Time')?time(row[key]):row[key])}" ${key.endsWith('Time')?'placeholder="13h00" maxlength="5" inputmode="numeric"':''}>`;
  function render(){
    const c=state.data.catalog;
    for(const name of ['timezone','startDate','endDate']) $(`tt-${name}`).value=state.draft[name];
    $('tt-title').textContent=`${state.data.program.name} · Timetable`;
    $('tt-live-state').textContent=state.data.currentPublicationId?`Published · Version ${state.data.publications.find(p=>p.id===state.data.currentPublicationId)?.version||'—'}`:'No published timetable';
    $('tt-rules').innerHTML=state.draft.rules.map((row,i)=>`<tr data-row="${esc(row.id)}"><td>${i+1}</td><td><select data-field="moduleId" aria-label="Module for lesson ${i+1}">${options(modules(),row.moduleId)}</select></td><td><details><summary>${row.classIds.length?`${row.classIds.length} class${row.classIds.length===1?'':'es'} together`:'Choose classes'}</summary>${c.classes.filter(c=>c.active).map(cls=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(cls.id)}" ${row.classIds.includes(cls.id)?'checked':''}>${esc(cls.name)}</label>`).join('')}${row.classIds.filter(id=>!c.classes.some(c=>c.id===id&&c.active)).map(id=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(id)}" checked>Unavailable: ${esc(id)}</label>`).join('')}</details></td><td><select data-field="teacherId" aria-label="Teacher for lesson ${i+1}">${options(c.teachers,row.teacherId)}</select></td><td><select data-field="kind" aria-label="Pattern for lesson ${i+1}"><option value="RECURRING" ${row.kind==='RECURRING'?'selected':''}>Recurring</option><option value="EXPLICIT" ${row.kind==='EXPLICIT'?'selected':''}>One-off</option></select></td><td><div class="tt-days">${['Su','Mo','Tu','We','Th','Fr','Sa'].map((day,n)=>`<label>${day}<input type="checkbox" data-day="${n}" aria-label="${day} for lesson ${i+1}" ${row.weekdays.includes(n)?'checked':''}></label>`).join('')}</div></td><td>${field(row,'startDate','date')}</td><td>${field(row,'endDate','date')}</td><td>${field(row,'startTime')}</td><td>${field(row,'endTime')}</td><td><button type="button" data-remove="${esc(row.id)}" class="pb-secondary" aria-label="Remove lesson ${i+1}">×</button></td></tr>`).join('')||'<tr><td colspan="11" class="tt-empty">Add a module lesson to start your draft.</td></tr>';
    $('tt-exceptions').innerHTML=state.draft.exceptions.map(row=>`<tr data-row="${esc(row.id)}"><td><select data-field="ruleId" aria-label="Exception lesson">${options(state.draft.rules.map((r,i)=>({id:r.id,name:`${i+1}. ${c.modules.find(m=>m.id===r.moduleId)?.name||'New lesson'}`})),row.ruleId)}</select></td><td>${field(row,'originalDate','date')}</td><td><select data-field="action" aria-label="Exception action"><option value="CANCEL" ${row.action==='CANCEL'?'selected':''}>Cancel</option><option value="MOVE" ${row.action==='MOVE'?'selected':''}>Move</option></select></td><td>${field(row,'date','date')}</td><td>${field(row,'startTime')}</td><td>${field(row,'endTime')}</td><td><button type="button" data-remove="${esc(row.id)}" class="pb-secondary" aria-label="Remove exception">×</button></td></tr>`).join('')||'<tr><td colspan="7" class="tt-empty">No exceptions. Recurring lessons follow their usual pattern.</td></tr>';
    controls();
  }
  async function load(){const result=await api('get');state.data=result;state.draft=structuredClone(result.draft);state.baseline=JSON.stringify(result.draft);state.preview=null;
    try{state.pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{state.pending=null;}
    if(state.pending){state.draft=structuredClone(state.pending.body.draft);}
    $('tt-workspace').hidden=!result.prepared;$('tt-prepare').hidden=result.prepared;$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;
    render();message(!result.prepared?'Prepare the empty timetable tables to begin.':!result.coordinatorAvailable?'Saving is unavailable until the backend coordinator is configured.':!result.catalog.modules.length?'No modules yet. Add the minimal Program subject, module, class and teacher references described in the V105.2 setup guide.':'Draft loaded. Edit lessons, validate, then preview before publishing.');}
  function clearPending(){state.pending=null;sessionStorage.removeItem(storageKey);}
  async function mutate(action){
    if(!state.pending){state.pending={action,body:{revision:state.data.revision,draft:structuredClone(state.draft),operationId:crypto.randomUUID()}};sessionStorage.setItem(storageKey,JSON.stringify(state.pending));}
    try{const result=await api(state.pending.action,state.pending.body);const wasPublish=state.pending.action==='publish';state.data.revision=result.revision;state.data.currentPublicationId=result.currentPublicationId;if(result.version)state.data.publications.push({id:result.currentPublicationId,version:result.version});state.baseline=JSON.stringify(state.pending.body.draft);clearPending();invalidate();render();message(wasPublish?`Published version ${result.version}. This snapshot is now the current timetable.`:'Draft saved. The published timetable is unchanged.');}
    catch(error){if(error.status&&error.status<500)clearPending();throw error;}
  }
  function showValidation(result){const panel=$('tt-validation');panel.hidden=false;panel.innerHTML=`<strong class="${result.valid?'tt-good':'tt-error'}">${result.valid?'✓ Ready to preview and publish':'Resolve these items before publication'}</strong><ul>${(result.issues||[]).map(i=>`<li>${esc(i.rowId?`${rowLabel(i.rowId)}: `:'')}${esc(i.message)}</li>`).join('')}${(result.conflicts||[]).map(c=>`<li>${esc(c.reasons.join(', '))}: ${esc(anchorLabel(c.left))} ↔ ${esc(anchorLabel(c.right))}</li>`).join('')}</ul>${(result.warnings||[]).map(w=>`<p class="tt-scope">${esc(w)}</p>`).join('')}`;
    const bad=new Set([...(result.issues||[]).map(i=>i.rowId),...(result.conflicts||[]).flatMap(c=>c.rowIds)]);document.querySelectorAll('[data-row]').forEach(row=>row.classList.toggle('tt-row-bad',bad.has(row.dataset.row)));}
  function showOccurrences(result,title,history=false){state.calendarView={...result,history};$('tt-preview-panel').hidden=false;$('tt-preview-title').textContent=title;$('tt-preview-note').textContent=`${result.occurrences.length} occurrences · ${result.snapshot?.timezone||state.draft.timezone}${history?' · Immutable published snapshot':result.valid?' · Check this preview, then explicitly publish.':' · Publication blocked until conflicts and errors are resolved.'}`;
    $('tt-occurrences').innerHTML=result.occurrences.map(r=>`<tr class="${r.status==='CANCELLED'?'tt-cancelled':''}"><td>${esc(r.date)}<small>${r.date!==r.originalDate?`Originally ${esc(r.originalDate)}`:''}</small></td><td>${time(r.startTime)}–${time(r.endTime)}</td><td>${esc(r.moduleName)}<small>${esc(r.subjectName)}${r.levelName?` / ${esc(r.levelName)}`:''}</small></td><td>${r.classNames.map(esc).join(' + ')}</td><td>${esc(r.teacherName)}</td><td>${esc(r.status.toLowerCase())}</td></tr>`).join('');$('tt-publish').hidden=history||!result.valid;renderCalendarWeeks();controls();}
  const datePlus=(date,days)=>new Date(Date.parse(`${date}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);
  const weekStart=date=>datePlus(date,-((new Date(`${date}T00:00:00Z`).getUTCDay()+6)%7));
  function renderCalendarWeeks(){
    const weeks=[...new Set(state.calendarView.occurrences.map(r=>weekStart(r.date)))].sort();
    $('tt-calendar-week').innerHTML=weeks.map(date=>`<option value="${date}">${date} — ${datePlus(date,6)}</option>`).join('');
    $('tt-calendar-week').disabled=!weeks.length;renderCalendar();
  }
  function renderCalendar(){
    const week=$('tt-calendar-week').value,view=state.calendarView;
    if(!week){$('tt-calendar').innerHTML='<p>No occurrences to display.</p>';return;}
    $('tt-calendar').innerHTML=Array.from({length:7},(_,i)=>{const date=datePlus(week,i),label=new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
      return `<div class="tt-day"><h3>${label}</h3>${view.occurrences.filter(r=>r.date===date).map(r=>`<button type="button" class="tt-lesson ${r.status==='CANCELLED'?'tt-cancelled':''}" data-focus-rule="${esc(r.ruleId)}" ${view.history?'disabled':''}><strong>${time(r.startTime)}–${time(r.endTime)}</strong><span>${esc(r.moduleName)}</span><small>${r.classNames.map(esc).join(' + ')}</small><small>${esc(r.teacherName)}${r.status==='SCHEDULED'?'':` · ${esc(r.status.toLowerCase())}`}</small></button>`).join('')||'<span class="tt-no-lesson">—</span>'}</div>`;
    }).join('');
  }
  $('tt-calendar-week').onchange=renderCalendar;
  $('tt-calendar').onclick=event=>{const id=event.target.closest('[data-focus-rule]')?.dataset.focusRule;if(!id||state.calendarView.history)return;const row=[...document.querySelectorAll('#tt-rules tr')].find(r=>r.dataset.row===id);if(row){row.scrollIntoView({block:'center',inline:'start'});row.querySelector('select')?.focus();}};
  $('tt-editor').addEventListener('input',event=>{const el=event.target;if(state.busy||state.pending)return;
    if(el.id.startsWith('tt-')&&['timezone','startDate','endDate'].includes(el.id.slice(3)))state.draft[el.id.slice(3)]=el.value;
    else {const row=[...state.draft.rules,...state.draft.exceptions].find(r=>r.id===el.closest('[data-row]')?.dataset.row);if(!row)return;
      if(el.dataset.field)row[el.dataset.field]=el.dataset.field.endsWith('Time')?inputTime(el.value):el.value;
      if(el.dataset.class){row.classIds=el.checked?[...row.classIds,el.dataset.class]:row.classIds.filter(id=>id!==el.dataset.class);el.closest('details').querySelector('summary').textContent=`${row.classIds.length} class${row.classIds.length===1?'':'es'} together`;}
      if(el.dataset.day){const day=Number(el.dataset.day);row.weekdays=el.checked?[...row.weekdays,day]:row.weekdays.filter(d=>d!==day);}
    }invalidate();});
  $('tt-editor').addEventListener('click',event=>{const remove=event.target.closest('[data-remove]');if(!remove)return;const key=remove.dataset.remove;state.draft.rules=state.draft.rules.filter(r=>r.id!==key);state.draft.exceptions=state.draft.exceptions.filter(r=>r.id!==key);invalidate();render();});
  $('tt-add').onclick=()=>{state.draft.rules.push({id:`RULE-${crypto.randomUUID()}`,kind:'RECURRING',moduleId:'',teacherId:'',classIds:[],weekdays:[],startDate:state.draft.startDate,endDate:state.draft.endDate,startTime:'',endTime:''});invalidate();render();};
  $('tt-add-exception').onclick=()=>{state.draft.exceptions.push({id:`EX-${crypto.randomUUID()}`,ruleId:'',originalDate:'',action:'CANCEL',date:'',startTime:'',endTime:''});invalidate();render();};
  $('tt-save').onclick=()=>work(()=>mutate('save'));
  $('tt-retry').onclick=()=>work(()=>mutate(state.pending.action));
  $('tt-prepare').onclick=()=>work(async()=>{await api('prepare');await load();});
  $('tt-recover').onclick=()=>work(async()=>{const result=await api('recover');clearPending();if(state.draft&&dirty()){state.data.revision='';invalidate();message('Recovery completed. Your local edits are kept; download them and reload the latest saved draft before continuing.');}else{await load();message(result.recovered?'Interrupted change recovered.':'No interrupted change needs recovery.');}});
  for(const action of ['validate','preview'])$(`tt-${action}`).onclick=()=>work(async()=>{const result=await api(action,{draft:state.draft});showValidation(result);state.preview=action==='preview'?result:null;if(action==='preview')showOccurrences(result,'Publication preview');else $('tt-preview-panel').hidden=true;message(result.valid?(action==='preview'?'Preview ready. Publication requires the Publish button.':'Validation passed. Preview to review the lessons.'):'Publication is blocked until the listed issues are resolved.',!result.valid);});
  $('tt-publish').onclick=()=>work(async()=>{if(!state.preview?.valid)return;await mutate('publish');});
  $('tt-history').onclick=()=>work(async()=>{const result=await api('history');state.history=result.publications;$('tt-history-list').innerHTML=state.history.slice().reverse().map(p=>`<div class="tt-history-item"><strong>Version ${p.version}${p.id===result.currentPublicationId?' · Current':''}</strong><span>${esc(p.date)}</span><button class="pb-secondary" data-history="${esc(p.id)}">View snapshot</button></div>`).join('')||'<p class="tt-scope">No published timetable yet.</p>';});
  $('tt-history-list').onclick=event=>{const p=state.history.find(p=>p.id===event.target.dataset.history);if(p)showOccurrences(p,`Published version ${p.version}`,true);};
  $('tt-reload').onclick=()=>{if(dirty()||state.pending)$('tt-refresh-warning').hidden=false;else void work(load);};
  $('tt-keep').onclick=()=>{$('tt-refresh-warning').hidden=true;};
  $('tt-discard').onclick=()=>{$('tt-refresh-warning').hidden=true;void work(load);};
  $('tt-export').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({programId:id,draft:state.draft},null,2)],{type:'application/json'}));a.href=url;a.download='program-timetable-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!$('tt-save').disabled){event.preventDefault();void work(()=>mutate('save'));}});
  window.addEventListener('beforeunload',event=>{if(dirty()||state.pending){event.preventDefault();event.returnValue='';}});
  void work(load);
})();
