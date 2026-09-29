/* V105.3.2.2 — recurring weekly lessons, effective-dated immutable publications. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=new URLSearchParams(location.search).get('program'),storageKey=`m4l-timetable-pending:${id}`,draftKey=`m4l-timetable-draft:${id}`,format='105.3.2.2-weekly';
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const state={data:null,draft:null,baseline:'',busy:false,pending:null,preview:null,history:[],calendarView:null,conversion:null,converted:false,effectiveFrom:''};
  const inputTime=value=>value.trim().replace(/^(\d{1,2})(\d{2})$/,'$1:$2').replace(/[hH]/,':').replace(/^(\d):(\d{2})$/,'0$1:$2');
  const time=value=>inputTime(String(value||'')).replace(':','h');
  const dirty=()=>Boolean(state.draft)&&JSON.stringify(state.draft)!==state.baseline;
  const message=(text,error=false)=>{$('tt-message').textContent=text;$('tt-message').classList.toggle('is-error',error);};
  function remember(){if(state.draft&&state.data)sessionStorage.setItem(draftKey,JSON.stringify({draft:state.draft,baseline:state.baseline,revision:state.data.revision,effectiveFrom:state.effectiveFrom,converted:state.converted,conversion:state.conversion}));}
  function displayDraft(raw){
    if(raw.format===format)return {...structuredClone(raw),rules:raw.rules.map(r=>({...r,startTime:inputTime(r.startTime),endTime:inputTime(r.endTime)}))};
    state.conversion={required:Boolean(raw.exceptions?.length||raw.rules.some(r=>r.kind==='EXPLICIT')),oneOffCount:raw.rules.filter(r=>r.kind==='EXPLICIT').length,exceptionCount:raw.exceptions?.length||0,originalDraft:structuredClone(raw)};
    return {format,timezone:raw.timezone,rules:raw.rules.filter(r=>r.kind!=='EXPLICIT').map(({startDate,endDate,kind,...rule})=>({...rule,startTime:inputTime(rule.startTime),endTime:inputTime(rule.endTime)}))};
  }
  async function api(action,body={}){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw new Error('Sign in through your personal Academy account link first.');
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/program-timetable/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id,...body})});
    const result=await response.json();if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The request could not be confirmed.'),result,{status:response.status});return result;
  }
  function controls(){
    const locked=state.busy||Boolean(state.pending),needsReview=state.conversion?.required&&!state.converted,ready=state.data?.prepared&&state.data?.coordinatorAvailable&&state.data?.program.status==='DRAFT'&&!needsReview;
    $('tt-editor').disabled=locked||!ready;
    for(const name of ['save','validate','preview'])$(`tt-${name}`).disabled=locked||!ready;
    $('tt-save').disabled||=!dirty();$('tt-publish').disabled=locked||!ready||!state.preview?.valid;
    $('tt-effective-from').disabled=locked;
    for(const name of ['reload','recover','history','prepare','convert'])$(`tt-${name}`).disabled=state.busy;
    $('tt-convert').disabled||=Boolean(state.pending);$('tt-retry').disabled=state.busy;$('tt-export').disabled=!state.draft;
    $('tt-pending').hidden=!state.pending;$('tt-conversion').hidden=!needsReview;
    if(needsReview)$('tt-conversion-message').textContent=`The previous draft contains ${state.conversion.oneOffCount} one-off lessons and ${state.conversion.exceptionCount} dated exceptions. Use weekly lessons to continue with its recurring rows. The original draft and published history remain preserved.`;
    $('tt-save-state').textContent=state.pending?'Change not confirmed':dirty()?'Unsaved draft changes':'Saved draft';
  }
  async function work(fn){if(state.busy)return;state.busy=true;controls();try{await fn();}catch(error){message(error.message,true);}finally{state.busy=false;controls();}}
  function invalidate(){state.preview=null;$('tt-publish-options').hidden=true;$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;remember();controls();}
  function options(rows,selected,empty='Choose…'){return `<option value="">${esc(empty)}</option>`+rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''}>${esc(row.name)}</option>`).join('')+(selected&&!rows.some(r=>r.id===selected)?`<option selected value="${esc(selected)}">Unavailable: ${esc(selected)}</option>`:'');}
  function modules(){const c=state.data.catalog;return c.modules.filter(m=>m.active).map(m=>{const s=c.subjects.find(s=>s.id===m.programSubjectId),l=c.levels.find(l=>l.id===m.levelId);return {id:m.id,name:`${m.name} · ${s?.name||'Missing subject'}${l?` / ${l.name}`:''}`};});}
  const rowLabel=ruleId=>{const n=state.draft.rules.findIndex(r=>r.id===ruleId);return n<0?'Timetable':`Lesson ${n+1}`;};
  const anchorLabel=anchor=>{const [ruleId,day]=anchor.split('@');return `${rowLabel(ruleId)} · ${days[Number(day)]||day}`;};
  const classNames=row=>row.classIds.map(id=>state.data.catalog.classes.find(c=>c.id===id)?.name||`Unavailable: ${id}`).join(', ')||'Choose classes';
  const field=(row,key)=>`<input aria-label="${key==='startTime'?'Start':'End'} time · ${esc(rowLabel(row.id))}" data-field="${key}" value="${esc(time(row[key]))}" placeholder="13h00" maxlength="5" inputmode="numeric">`;
  function render(){
    const c=state.data.catalog;$('tt-timezone').innerHTML=window.M4L_TIMEZONES.options(state.draft.timezone);$('tt-timezone').value=state.draft.timezone;$('tt-title').textContent=`${state.data.program.name} · Timetable`;
    const current=state.data.publications.find(p=>p.id===state.data.currentPublicationId),scheduled=state.data.publications.filter(p=>p.status==='SCHEDULED');
    $('tt-live-state').textContent=(current?`In effect · Version ${current.version}`:'No timetable in effect')+scheduled.map(p=>` · Version ${p.version} from ${p.effectiveFrom}`).join('');
    $('tt-rules').innerHTML=state.draft.rules.map((row,i)=>`<tr data-row="${esc(row.id)}"><td><select data-field="moduleId" aria-label="Module for lesson ${i+1}">${options(modules(),row.moduleId)}</select></td><td><details><summary>${esc(classNames(row))}</summary>${c.classes.filter(c=>c.active||row.classIds.includes(c.id)).map(cls=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(cls.id)}" ${row.classIds.includes(cls.id)?'checked':''}>${esc(cls.name)}${cls.active?'':' (inactive)'}</label>`).join('')}${row.classIds.filter(id=>!c.classes.some(c=>c.id===id)).map(id=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(id)}" checked>Unavailable: ${esc(id)}</label>`).join('')}</details></td><td><select data-field="teacherId" aria-label="Teacher for lesson ${i+1}">${options(c.teachers,row.teacherId,'Not assigned (optional)')}</select></td><td><div class="tt-days">${[1,2,3,4,5,6,0].map(n=>`<label>${days[n].slice(0,2)}<input type="checkbox" data-day="${n}" aria-label="${days[n]} for lesson ${i+1}" ${row.weekdays.includes(n)?'checked':''}></label>`).join('')}</div></td><td>${field(row,'startTime')}</td><td>${field(row,'endTime')}</td><td><button type="button" data-remove="${esc(row.id)}" class="pb-secondary" aria-label="Remove lesson ${i+1}">×</button></td></tr>`).join('')||'<tr><td colspan="7" class="tt-empty">Add a module lesson to start your weekly timetable.</td></tr>';
    $('tt-effective-from').value=state.effectiveFrom||state.data.today;$('tt-effective-from').min=state.data.today;
    $('tt-effective-note').textContent=`The new timetable applies from this date in ${state.data.effectiveTimezone}. The current version continues until then; there is no end date.`;
    controls();
  }
  async function load(restore=true){
    const result=await api('get');state.data=result;state.conversion=result.conversion;state.converted=false;state.draft=structuredClone(result.draft);state.baseline=JSON.stringify(result.draft);state.preview=null;state.effectiveFrom=result.today;
    if(!result.revision&&!state.draft.timezone)state.draft.timezone=window.M4L_TIMEZONES.defaultZone;
    try{state.pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{state.pending=null;}
    if(restore)try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(saved&&JSON.stringify(saved.draft)!==saved.baseline){state.draft=displayDraft(saved.draft);state.baseline=saved.baseline;state.data.revision=saved.revision;state.effectiveFrom=saved.effectiveFrom||result.today;state.converted=saved.converted;state.conversion=saved.conversion||state.conversion;}}catch{}
    if(state.pending)state.draft=displayDraft(state.pending.body.draft);
    $('tt-workspace').hidden=!result.prepared;$('tt-prepare').hidden=result.prepared;$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;
    render();remember();message(!result.prepared?'Prepare the empty timetable tables to begin.':!result.coordinatorAvailable?'Saving is unavailable until the backend coordinator is configured.':dirty()?'Your unfinished timetable is kept.':!result.catalog.modules.length?'No modules yet. Open Program management to add modules and classes.':'Build the weekly pattern, preview it, then choose its effective date when publishing.');
  }
  function clearPending(){state.pending=null;sessionStorage.removeItem(storageKey);}
  async function mutate(action){
    if(!state.pending){state.pending={action,body:{revision:state.data.revision,draft:structuredClone(state.draft),operationId:crypto.randomUUID(),...(action==='publish'?{effectiveFrom:state.effectiveFrom||state.data.today}:{}),...(state.converted?{convertLegacy:true}:{})}};sessionStorage.setItem(storageKey,JSON.stringify(state.pending));}
    try{
      const result=await api(state.pending.action,state.pending.body),wasPublish=state.pending.action==='publish';
      state.data.revision=result.revision;state.data.currentPublicationId=result.currentPublicationId;
      if(result.publications)state.data.publications=result.publications;
      state.baseline=JSON.stringify(state.draft);clearPending();state.conversion=null;state.converted=false;invalidate();render();
      message(wasPublish?`Version ${result.version} published, effective ${result.effectiveFrom||'as originally recorded'}.`:'Weekly draft saved. The timetable in effect is unchanged.');
    }catch(error){if(error.status&&error.status<500){clearPending();remember();}throw error;}
  }
  function showValidation(result){
    $('tt-validation').hidden=false;$('tt-validation').innerHTML=`<strong class="${result.valid?'tt-good':'tt-error'}">${result.valid?'✓ Weekly timetable checked':'Resolve these items before publication'}</strong><ul>${(result.issues||[]).map(i=>`<li>${esc(i.rowId?rowLabel(i.rowId)+': ':'')}${esc(i.message)}</li>`).join('')}${(result.conflicts||[]).map(c=>`<li>${esc(c.reasons.join(', '))}: ${esc(anchorLabel(c.left))} ↔ ${esc(anchorLabel(c.right))}</li>`).join('')}</ul>${(result.warnings||[]).map(w=>`<p class="tt-scope">${esc(w)}</p>`).join('')}`;
    const bad=new Set([...(result.issues||[]).map(i=>i.rowId),...(result.conflicts||[]).flatMap(c=>c.rowIds)]);document.querySelectorAll('[data-row]').forEach(row=>row.classList.toggle('tt-row-bad',bad.has(row.dataset.row)));
  }
  function showOccurrences(result,title,history=false){
    state.calendarView={...result,history};$('tt-preview-panel').hidden=false;$('tt-preview-title').textContent=title;
    const weekly=result.pattern==='WEEKLY';$('tt-preview-note').textContent=`${result.occurrences.length} ${weekly?'lessons each week':'dated occurrences'} · ${result.snapshot?.timezone||state.draft.timezone}${history?` · Published snapshot${result.effectiveFrom?' · Effective '+result.effectiveFrom:''}`:' · Repeats weekly until a newer version takes effect'}`;
    $('tt-occurrences').innerHTML=result.occurrences.map(r=>`<tr class="${r.status==='CANCELLED'?'tt-cancelled':''}"><td>${esc(weekly?days[r.weekday]:r.date)}</td><td>${esc(time(r.startTime))}–${esc(time(r.endTime))}</td><td>${esc(r.moduleName)}<small>${esc(r.subjectName)}${r.levelName?' / '+esc(r.levelName):''}</small></td><td>${r.classNames.map(esc).join(', ')}</td><td>${esc(r.teacherName||'Not assigned')}</td><td>${esc(r.status.toLowerCase())}</td></tr>`).join('');
    $('tt-calendar').hidden=!weekly;$('tt-calendar').innerHTML=weekly?[1,2,3,4,5,6,0].map(day=>`<div class="tt-day"><h3>${days[day]}</h3>${result.occurrences.filter(r=>r.weekday===day).map(r=>`<button type="button" class="tt-lesson" data-focus-rule="${esc(r.ruleId)}" ${history?'disabled':''}><strong>${esc(time(r.startTime))}–${esc(time(r.endTime))}</strong><span>${esc(r.moduleName)}</span><small>${r.classNames.map(esc).join(', ')}</small><small>${esc(r.teacherName||'Not assigned')}</small></button>`).join('')||'<span class="tt-no-lesson">—</span>'}</div>`).join(''):'';
    $('tt-publish-options').hidden=history;controls();
  }
  $('tt-management').href=`/programs/manage.html?program=${encodeURIComponent(id)}`;
  $('tt-calendar').onclick=event=>{const ruleId=event.target.closest('[data-focus-rule]')?.dataset.focusRule;if(!ruleId||state.calendarView.history)return;const row=[...document.querySelectorAll('#tt-rules tr')].find(r=>r.dataset.row===ruleId);if(row){row.scrollIntoView({block:'center',inline:'start'});row.querySelector('select')?.focus();}};
  $('tt-editor').addEventListener('input',event=>{
    const el=event.target;if(state.busy||state.pending)return;
    if(el.id==='tt-timezone')state.draft.timezone=el.value;
    else {const row=state.draft.rules.find(r=>r.id===el.closest('[data-row]')?.dataset.row);if(!row)return;
      if(el.dataset.field)row[el.dataset.field]=el.dataset.field.endsWith('Time')?inputTime(el.value):el.value;
      if(el.dataset.class){row.classIds=el.checked?[...new Set([...row.classIds,el.dataset.class])]:row.classIds.filter(id=>id!==el.dataset.class);el.closest('details').querySelector('summary').textContent=classNames(row);}
      if(el.dataset.day!==undefined){const day=Number(el.dataset.day);row.weekdays=el.checked?[...new Set([...row.weekdays,day])]:row.weekdays.filter(d=>d!==day);}
    }invalidate();
  });
  $('tt-editor').addEventListener('focusout',event=>{const el=event.target;if(el.dataset.field?.endsWith('Time')&&!state.busy&&!state.pending)el.value=time(inputTime(el.value));});
  $('tt-editor').addEventListener('click',event=>{if(state.busy||state.pending)return;const remove=event.target.closest('[data-remove]');if(!remove)return;state.draft.rules=state.draft.rules.filter(r=>r.id!==remove.dataset.remove);invalidate();render();});
  $('tt-add').onclick=()=>{state.draft.rules.push({id:`RULE-${crypto.randomUUID()}`,moduleId:'',teacherId:'',classIds:[],weekdays:[],startTime:'',endTime:''});invalidate();render();};
  $('tt-effective-from').oninput=event=>{state.effectiveFrom=event.target.value;state.preview=null;remember();controls();message('Effective date changed. Preview again to check memberships for this date.');};
  $('tt-save').onclick=()=>work(()=>mutate('save'));$('tt-retry').onclick=()=>work(()=>mutate(state.pending.action));
  $('tt-prepare').onclick=()=>work(async()=>{await api('prepare');await load();});
  $('tt-recover').onclick=()=>work(async()=>{const result=await api('recover');if(state.pending){await mutate(state.pending.action);return;}if(dirty())message('Recovery completed. Your unfinished draft is kept.');else{await load(false);message(result.recovered?'Interrupted change recovered.':'No interrupted change needs recovery.');}});
  for(const action of ['validate','preview'])$(`tt-${action}`).onclick=()=>work(async()=>{const result=await api(action,{draft:state.draft,...(action==='preview'?{effectiveFrom:state.effectiveFrom||state.data.today}:{})});showValidation(result);state.preview=action==='preview'?result:null;if(action==='preview')showOccurrences(result,'Weekly timetable preview');else $('tt-preview-panel').hidden=true;message(result.valid?(action==='preview'?'Preview ready. Choose the effective date below, then publish.':'Validation passed. Preview to review the weekly pattern.'):'Resolve the listed issues before publishing.',!result.valid);});
  $('tt-publish').onclick=()=>work(async()=>{if(state.preview?.valid)await mutate('publish');});
  $('tt-history').onclick=()=>work(async()=>{const result=await api('history');state.history=result.publications;state.data.currentPublicationId=result.currentPublicationId;state.data.publications=result.publications;render();$('tt-history-list').innerHTML=state.history.slice().reverse().map(p=>`<div class="tt-history-item"><strong>Version ${p.version} · ${esc(({CURRENT:'In effect',SCHEDULED:'Scheduled',PAST:'Past',SUPERSEDED:'Superseded'})[p.status]||'Past')}</strong><span>Effective ${esc(p.effectiveFrom)}${p.effectiveUntil?' through '+esc(p.effectiveUntil):''}</span><button class="pb-secondary" data-history="${esc(p.id)}">View snapshot</button></div>`).join('')||'<p class="tt-scope">No published timetable yet.</p>';});
  $('tt-history-list').onclick=event=>{const p=state.history.find(p=>p.id===event.target.dataset.history);if(p)showOccurrences(p,`Published version ${p.version}`,true);};
  $('tt-reload').onclick=()=>{if(dirty()||state.pending)$('tt-refresh-warning').hidden=false;else void work(()=>load(false));};
  $('tt-keep').onclick=()=>{$('tt-refresh-warning').hidden=true;};$('tt-discard').onclick=()=>{$('tt-refresh-warning').hidden=true;void work(()=>load(false));};
  function download(draft){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({programId:id,draft},null,2)],{type:'application/json'}));a.href=url;a.download='program-timetable-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('tt-export').onclick=()=>download(state.draft);$('tt-original').onclick=()=>download(state.conversion.originalDraft);
  $('tt-convert').onclick=()=>{state.converted=true;state.baseline='';invalidate();render();message('The weekly rows are ready to edit. Saving creates a new draft version; the previous dated draft stays preserved.');};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!$('tt-save').disabled){event.preventDefault();void work(()=>mutate('save'));}});
  window.addEventListener('beforeunload',event=>{if(dirty()||state.pending){remember();event.preventDefault();event.returnValue='';}});
  void work(load);
})();
