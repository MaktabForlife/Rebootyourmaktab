/* V105.3.4.2 — editable timetable boards shared between browser tabs. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=new URLSearchParams(location.search).get('program'),storageKey=`m4l-timetable-pending:${id}`,draftKey=`m4l-timetable-draft:${id}`,format='105.3.2.2-weekly';
  const tokenHash=[...(localStorage.getItem('m4l_account_token')||'')].reduce((n,char)=>Math.imul(n^char.charCodeAt(0),16777619)>>>0,2166136261).toString(36);
  const sharedKey=`m4l-timetable-shared:${id}:${tokenHash}`;
  let sharedSnapshot=null,sharedStamp=0,sharedConflict=false,revisionStamp=0;
  const timezone='Africa/Johannesburg';
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const state={data:null,draft:null,baseline:'',busy:false,pending:null,preview:null,history:[],calendarView:null,conversion:null,converted:false,effectiveFrom:'',audiences:{classes:[],teachers:[]}};
  const inputTime=value=>value.trim().replace(/^(\d{1,2})(\d{2})$/,'$1:$2').replace(/[hH]/,':').replace(/^(\d):(\d{2})$/,'0$1:$2');
  const time=value=>inputTime(String(value||'')).replace(':','h');
  const dirty=()=>Boolean(state.draft)&&JSON.stringify(state.draft)!==state.baseline;
  const message=(text,error=false)=>{$('tt-message').textContent=text;$('tt-message').classList.toggle('is-error',error);};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),mergeValue=window.M4L_TIMETABLE_SYNC.merge;
  function sharedRecord(){try{return JSON.parse(localStorage.getItem(sharedKey)||'null');}catch{return null;}}
  function showTabConflict(){sharedConflict=true;$('tt-tab-warning').hidden=false;controls();}
  function syncShared(preferLocalRevision=false){
    if(!state.draft||!state.data||sharedConflict)return false;
    const latest=sharedRecord();
    if(latest?.draft&&latest.stamp>sharedStamp){
      try{
        state.draft=mergeValue(latest.baseDraft||sharedSnapshot||latest.draft,state.draft,latest.draft);
        if(!preferLocalRevision){
          if(latest.revision===state.data.revision||Number(latest.revisionStamp||0)>revisionStamp){state.baseline=latest.baseline;state.data.revision=latest.revision;revisionStamp=Number(latest.revisionStamp||0);}
          else if(Number(latest.revisionStamp||0)===revisionStamp){showTabConflict();return false;}
        }
        sharedSnapshot=structuredClone(latest.draft);sharedStamp=latest.stamp;
      }catch{showTabConflict();return false;}
    }
    if(latest&&same(state.draft,latest.draft)&&state.data.revision===latest.revision)return true;
    const record={draft:state.draft,baseDraft:sharedSnapshot||state.draft,baseline:state.baseline,revision:state.data.revision,revisionStamp,stamp:Math.max(Date.now(),sharedStamp+1)};
    try{localStorage.setItem(sharedKey,JSON.stringify(record));sharedSnapshot=structuredClone(state.draft);sharedStamp=record.stamp;}catch{return false;}
    return true;
  }
  function remember(preferLocalRevision=false){
    if(!state.draft||!state.data)return;
    syncShared(preferLocalRevision);
    sessionStorage.setItem(draftKey,JSON.stringify({draft:state.draft,baseline:state.baseline,revision:state.data.revision,effectiveFrom:state.effectiveFrom,converted:state.converted,conversion:state.conversion,sharedSnapshot}));
  }
  function displayDraft(raw){
    if(raw.format===format)return {...structuredClone(raw),timezone,rules:raw.rules.map(r=>({...r,startTime:inputTime(r.startTime),endTime:inputTime(r.endTime)}))};
    state.conversion={required:Boolean(raw.exceptions?.length||raw.rules.some(r=>r.kind==='EXPLICIT')),oneOffCount:raw.rules.filter(r=>r.kind==='EXPLICIT').length,exceptionCount:raw.exceptions?.length||0,originalDraft:structuredClone(raw)};
    return {format,timezone,rules:raw.rules.filter(r=>r.kind!=='EXPLICIT').map(({startDate,endDate,kind,...rule})=>({...rule,startTime:inputTime(rule.startTime),endTime:inputTime(rule.endTime)}))};
  }
  async function api(action,body={}){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw new Error('Sign in through your personal Academy account link first.');
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/program-timetable/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id,...body})});
    const result=await response.json();if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The request could not be confirmed.'),result,{status:response.status});return result;
  }
  function controls(){
    const locked=state.busy||Boolean(state.pending),needsReview=state.conversion?.required&&!state.converted,ready=state.data?.prepared&&state.data?.coordinatorAvailable&&state.data?.program.status==='DRAFT'&&!needsReview;
    $('tt-editor').disabled=locked||!ready;
    $('tt-planner').disabled=locked||!ready;
    for(const name of ['save','validate','preview'])$(`tt-${name}`).disabled=locked||!ready;
    $('tt-save').disabled||=!dirty()||sharedConflict;$('tt-publish').disabled=locked||!ready||!state.preview?.valid||sharedConflict;
    $('tt-effective-from').disabled=locked;$('tt-preview-type').disabled=locked;$('tt-preview-target').disabled=locked||!$('tt-preview-target').value;
    for(const name of ['reload','recover','history','prepare','convert'])$(`tt-${name}`).disabled=state.busy;
    $('tt-convert').disabled||=Boolean(state.pending);$('tt-retry').disabled=state.busy;$('tt-export').disabled=!state.draft;
    $('tt-pending').hidden=!state.pending;$('tt-conversion').hidden=!needsReview;
    if(needsReview)$('tt-conversion-message').textContent=`The previous draft contains ${state.conversion.oneOffCount} one-off lessons and ${state.conversion.exceptionCount} dated exceptions. Use weekly lessons to continue with its recurring rows. The original draft and published history remain preserved.`;
    $('tt-save-state').textContent=state.pending?'Change not confirmed':dirty()?'Unsaved draft changes':'Saved draft';
  }
  async function work(fn){if(state.busy)return;state.busy=true;controls();try{await fn();}catch(error){message(error.message,true);}finally{state.busy=false;controls();}}
  function invalidate(){exportGeneration++;exportPages=null;exportFiles=null;state.preview=null;$('tt-publish-options').hidden=true;$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;remember();controls();planner?.render();}
  function options(rows,selected,empty='Choose…'){return `<option value="">${esc(empty)}</option>`+rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''}>${esc(row.name)}</option>`).join('')+(selected&&!rows.some(r=>r.id===selected)?`<option selected value="${esc(selected)}">Unavailable: ${esc(selected)}</option>`:'');}
  function modules(){const c=state.data.catalog;return [...c.subjects.filter(s=>s.active).map(s=>({id:'subject:'+s.id,name:s.name+' · Subject only'})),...c.modules.filter(m=>m.active).map(m=>{const s=c.subjects.find(s=>s.id===m.programSubjectId),l=c.levels.find(l=>l.id===m.levelId);return {id:m.id,name:`${m.name} · ${s?.name||'Missing subject'}${l?` / ${l.name}`:''}`};})];}
  const planner=window.M4L_ASSISTED_PLANNER?.mount({state,$,esc,days,modules,changed:()=>{invalidate();render();},locked:()=>state.busy||Boolean(state.pending)||!state.data?.prepared||!state.data?.coordinatorAvailable||state.data?.program.status!=='DRAFT'||Boolean(state.conversion?.required&&!state.converted)});
  if(planner)$('tt-undo-placement').onclick=()=>planner.undo();
  const rowLabel=ruleId=>{const b=(state.draft.breaks||[]).findIndex(r=>r.id===ruleId);if(b>=0)return `Break ${b+1}`;const n=state.draft.rules.findIndex(r=>r.id===ruleId);return n<0?'Timetable':`Lesson ${n+1}`;};
  const anchorLabel=anchor=>{const [ruleId,day]=anchor.split('@');return `${rowLabel(ruleId)} · ${days[Number(day)]||day}`;};
  const classNames=row=>row.classIds.map(id=>state.data.catalog.classes.find(c=>c.id===id)?.name||`Unavailable: ${id}`).join(', ')||'Choose classes';
  function safeZoom(value){if(typeof value!=='string'||value.length>2048||/[\u0000-\u001f\u007f]/.test(value))return '';try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
  const zoomAnchor=(link,label=link)=>safeZoom(link)?`<a href="${esc(safeZoom(link))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';
  function zoomDefault(row){
    if(row.zoomLink)return safeZoom(row.zoomLink)?`Lesson link · ${zoomAnchor(row.zoomLink)}`:'Enter a valid https:// Zoom link';
    if(row.classIds.length>1)return 'Required for combined classes';
    const cls=state.data.catalog.classes.find(c=>c.id===row.classIds[0]);
    return cls?.zoomLink?`Class link · ${zoomAnchor(cls.zoomLink)||'Unavailable'}`:'No class link set';
  }
  const zoomField=row=>`<input type="url" data-field="zoomLink" aria-label="Zoom link · ${esc(rowLabel(row.id))}" value="${esc(row.zoomLink||'')}" placeholder="${row.classIds.length>1?'Shared lesson link required':'Use class link if blank'}" aria-required="${row.classIds.length>1}" maxlength="2048"><small class="tt-zoom-default">${zoomDefault(row)}</small>`;
  const zoomDisplay=row=>zoomAnchor(row.zoomLink)||'<span class="tt-scope">No Zoom link</span>';
  const field=(row,key)=>`<input aria-label="${key==='startTime'?'Start':'End'} time · ${esc(rowLabel(row.id))}" data-field="${key}" value="${esc(time(row[key]))}" placeholder="13h00" maxlength="5" inputmode="numeric">`;
  const dayChoices=(row,prefix='')=>`<div class="tt-days">${[1,2,3,4,5,6,0].map(n=>`<label>${days[n].slice(0,2)}<input type="checkbox" ${prefix?'name="weekday" value="'+n+'"':'data-day="'+n+'"'} aria-label="${days[n]} · ${esc(row.label||rowLabel(row.id))}" ${row.weekdays.includes(n)?'checked':''}></label>`).join('')}</div>`;
  function renderBreaks(){
    $('tt-breaks').innerHTML=(state.draft.breaks||[]).map(row=>`<tr data-row="${esc(row.id)}"><td><input data-field="label" aria-label="Break label" maxlength="80" value="${esc(row.label)}"></td><td>${dayChoices(row)}</td><td>${field(row,'startTime')}</td><td>${field(row,'endTime')}</td><td><button type="button" data-remove="${esc(row.id)}" class="pb-secondary" aria-label="Remove ${esc(row.label)}">×</button></td></tr>`).join('')||'<tr><td colspan="5" class="tt-empty">No breaks added.</td></tr>';
  }
  function render(){
    const c=state.data.catalog;$('tt-title').textContent=`${state.data.program.name} · Timetable`;
    $('tt-teachers-note').hidden=c.teachers.length>0;
    $('tt-teachers-note').innerHTML=`No eligible teachers yet. In <a href="/users/?program=${encodeURIComponent(id)}">User profiles</a>, give an active user a confirmed Teacher, Senior or Admin role in this program. Teacher selection is optional.`;
    const current=state.data.publications.find(p=>p.id===state.data.currentPublicationId),scheduled=state.data.publications.filter(p=>p.status==='SCHEDULED');
    $('tt-live-state').textContent=(current?`In effect · Version ${current.version}`:'No timetable in effect')+scheduled.map(p=>` · Version ${p.version} from ${p.effectiveFrom}`).join('');
    $('tt-rules').innerHTML=state.draft.rules.map((row,i)=>`<tr data-row="${esc(row.id)}"><td><select data-field="moduleId" aria-label="Module for lesson ${i+1}">${options(modules(),row.moduleId||(row.programSubjectId?'subject:'+row.programSubjectId:''))}</select></td><td><details><summary>${esc(classNames(row))}</summary>${c.classes.filter(c=>c.active||row.classIds.includes(c.id)).map(cls=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(cls.id)}" ${row.classIds.includes(cls.id)?'checked':''}>${esc(cls.name)}${cls.active?'':' (inactive)'}</label>`).join('')}${row.classIds.filter(id=>!c.classes.some(c=>c.id===id)).map(id=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(id)}" checked>Unavailable: ${esc(id)}</label>`).join('')}</details></td><td><select data-field="teacherId" aria-label="Teacher for lesson ${i+1}">${options(c.teachers,row.teacherId,'Not assigned (optional)')}</select></td><td><div class="tt-days">${[1,2,3,4,5,6,0].map(n=>`<label>${days[n].slice(0,2)}<input type="checkbox" data-day="${n}" aria-label="${days[n]} for lesson ${i+1}" ${row.weekdays.includes(n)?'checked':''}></label>`).join('')}</div></td><td>${field(row,'startTime')}</td><td>${field(row,'endTime')}</td><td class="tt-zoom-cell">${zoomField(row)}</td><td><button type="button" data-remove="${esc(row.id)}" class="pb-secondary" aria-label="Remove lesson ${i+1}">×</button></td></tr>`).join('')||'<tr><td colspan="8" class="tt-empty">Add a subject or module lesson to start your weekly timetable.</td></tr>';
    renderBreaks();
    planner?.render();
    $('tt-effective-from').value=state.effectiveFrom||state.data.today;$('tt-effective-from').min=state.data.today;
    $('tt-effective-note').textContent=`The new timetable applies from this date in ${state.data.effectiveTimezone}. The current version continues until then; there is no end date.`;
    controls();
  }
  async function load(restore=true){
    sharedConflict=false;sharedSnapshot=null;sharedStamp=0;revisionStamp=0;$('tt-tab-warning').hidden=true;
    const result=await api('get');state.data=result;state.conversion=result.conversion;state.converted=false;state.draft=structuredClone(result.draft);state.baseline=JSON.stringify(result.draft);state.preview=null;state.effectiveFrom=result.today;
    const shared=sharedRecord();
    if(shared?.draft&&shared.revision===result.revision){state.draft=displayDraft(shared.draft);state.baseline=shared.baseline;sharedSnapshot=structuredClone(shared.draft);sharedStamp=shared.stamp;revisionStamp=Number(shared.revisionStamp||0);}
    else if(shared?.draft){
      try{state.draft=mergeValue(JSON.parse(shared.baseline),shared.draft,result.draft);}catch{state.draft=displayDraft(shared.draft);showTabConflict();}
      sharedSnapshot=structuredClone(shared.draft);sharedStamp=shared.stamp;revisionStamp=Math.max(Date.now(),Number(shared.revisionStamp||0)+1);
    }
    else revisionStamp=Date.now();
    try{state.pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{state.pending=null;}
    if(restore)try{
      const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');
      if(saved&&saved.revision===result.revision&&JSON.stringify(saved.draft)!==saved.baseline){
        if(shared?.draft&&shared.revision===result.revision&&saved.sharedSnapshot){
          try{state.draft=mergeValue(saved.sharedSnapshot,saved.draft,shared.draft);}catch{state.draft=displayDraft(saved.draft);showTabConflict();}
        }else if(!shared?.draft)state.draft=displayDraft(saved.draft);
        state.effectiveFrom=saved.effectiveFrom||result.today;state.converted=saved.converted;state.conversion=saved.conversion||state.conversion;
      }
    }catch{}
    if(state.pending)state.draft=displayDraft(state.pending.body.draft);
    $('tt-workspace').hidden=!result.prepared;$('tt-prepare').hidden=result.prepared;$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;
    render();remember(true);message(!result.prepared?'Prepare the empty timetable tables to begin.':!result.coordinatorAvailable?'Saving is unavailable until the backend coordinator is configured.':dirty()?'Your unfinished timetable is kept.':!result.catalog.subjects.length?'No subjects yet. Open Program management to add subjects and classes.':'Build the weekly pattern, preview it, then choose its effective date when publishing.');
  }
  function clearPending(){state.pending=null;sessionStorage.removeItem(storageKey);}
  async function mutate(action,retried=false){
    if(sharedConflict)throw Error('Resolve the change from the other tab before saving.');
    const beforeSync=JSON.stringify(state.draft),beforeRevision=state.data.revision;
    if(!state.pending&&!syncShared())throw Error('The shared draft could not be updated. Download your draft and reload before saving.');
    if(beforeSync!==JSON.stringify(state.draft)||beforeRevision!==state.data.revision){invalidate();render();if(action==='publish')throw Error('Another tab changed the timetable. Review the updated board and preview again before publishing.');}
    if(!state.pending){state.pending={action,body:{revision:state.data.revision,draft:structuredClone(state.draft),operationId:crypto.randomUUID(),...(action==='publish'?{effectiveFrom:state.effectiveFrom||state.data.today}:{}),...(state.converted?{convertLegacy:true}:{})}};sessionStorage.setItem(storageKey,JSON.stringify(state.pending));}
    try{
      const result=await api(state.pending.action,state.pending.body),wasPublish=state.pending.action==='publish';
      state.data.revision=result.revision;state.data.currentPublicationId=result.currentPublicationId;
      revisionStamp=Math.max(Date.now(),revisionStamp+1);
      if(result.publications)state.data.publications=result.publications;
      state.baseline=JSON.stringify(state.draft);clearPending();state.conversion=null;state.converted=false;remember(true);invalidate();render();
      message(wasPublish?`Version ${result.version} published, effective ${result.effectiveFrom||'as originally recorded'}.`:'Weekly draft saved. The timetable in effect is unchanged.');
    }catch(error){
      if(error.status&&error.status<500){clearPending();if(error.status!==409||action!=='save')remember();}
      if(action==='save'&&!retried&&error.status===409&&!sharedConflict){
        const latest=await api('get');
        try{state.draft=mergeValue(JSON.parse(state.baseline),state.draft,latest.draft);}catch{showTabConflict();throw Error('Another tab changed the same lesson. Download this draft before reloading the latest version.');}
        state.data=latest;state.baseline=JSON.stringify(latest.draft);revisionStamp=Math.max(Date.now(),revisionStamp+1);remember(true);render();
        if(sharedConflict)throw Error('Another tab changed the same lesson. Download this draft before reloading the latest version.');
        return mutate('save',true);
      }
      throw error;
    }
  }
  function showValidation(result){
    $('tt-validation').hidden=false;$('tt-validation').innerHTML=`<strong class="${result.valid?'tt-good':'tt-error'}">${result.valid?'✓ Weekly timetable checked':'Resolve these items before publication'}</strong><ul>${(result.issues||[]).map(i=>`<li>${esc(i.rowId?rowLabel(i.rowId)+': ':'')}${esc(i.message)}</li>`).join('')}${(result.conflicts||[]).map(c=>`<li>${esc(c.reasons.join(', '))}: ${esc(anchorLabel(c.left))} ↔ ${esc(anchorLabel(c.right))}</li>`).join('')}</ul>${(result.warnings||[]).map(w=>`<p class="tt-scope">${esc(w)}</p>`).join('')}`;
    const bad=new Set([...(result.issues||[]).map(i=>i.rowId),...(result.conflicts||[]).flatMap(c=>c.rowIds)]);document.querySelectorAll('[data-row]').forEach(row=>row.classList.toggle('tt-row-bad',bad.has(row.dataset.row)));
  }
  function audienceRows(result,type){
    const rows=new Map();
    for(const row of result.occurrences.filter(row=>row.kind!=='BREAK')){
      if(type==='teacher'){if(row.teacherId)rows.set(row.teacherId,row.teacherName||row.teacherId);}
      else row.classIds.forEach((classId,i)=>rows.set(classId,row.classNames[i]||classId));
    }
    return [...rows].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));
  }
  function visibleOccurrences(result,type,target){
    const lessons=result.occurrences.filter(row=>row.kind!=='BREAK'&&(type==='teacher'?row.teacherId===target:row.classIds.includes(target)));
    const lessonDays=new Set(lessons.map(row=>result.pattern==='WEEKLY'?row.weekday:row.date));
    return result.occurrences.filter(row=>row.kind!=='BREAK'?(type==='teacher'?row.teacherId===target:row.classIds.includes(target)):(type==='class'||lessonDays.has(result.pattern==='WEEKLY'?row.weekday:row.date)));
  }
  function renderOccurrenceList(){
    const result=state.calendarView,target=$('tt-preview-target').value,type=$('tt-preview-type').value;if(!result)return;
    const weekly=result.pattern==='WEEKLY';
    $('tt-occurrences').innerHTML=visibleOccurrences(result,type,target).map(r=>`<tr class="${r.status==='CANCELLED'?'tt-cancelled':''}"><td>${esc(weekly?days[r.weekday]:r.date)}</td><td>${esc(time(r.startTime))}–${esc(time(r.endTime))}</td><td>${zoomAnchor(r.zoomLink,r.moduleName||r.subjectName)||esc(r.moduleName||r.subjectName)}<small>${esc(r.subjectName)}${r.levelName?' / '+esc(r.levelName):''}</small></td><td>${r.classNames.map(esc).join(', ')}</td><td>${esc(r.teacherName||'Not assigned')}</td><td>${zoomDisplay(r)}</td><td>${esc(r.status.toLowerCase())}</td></tr>`).join('')||'<tr><td colspan="7" class="tt-empty">No lessons are assigned to this selection.</td></tr>';
  }
  function populatePreviewTargets(preferred=''){
    const type=$('tt-preview-type').value,rows=type==='teacher'?state.audiences.teachers:state.audiences.classes,target=$('tt-preview-target');
    $('tt-preview-target-label').textContent=type==='teacher'?'Teacher':'Class';
    target.innerHTML=rows.length?rows.map(row=>`<option value="${esc(row.id)}">${esc(row.name)}</option>`).join(''):'<option value="">No eligible options</option>';
    target.value=rows.some(row=>row.id===preferred)?preferred:(rows[0]?.id||'');
    renderOccurrenceList();renderPresentation();controls();
  }
  function showOccurrences(result,title,history=false){
    state.calendarView={...result,history};$('tt-preview-panel').hidden=false;$('tt-preview-title').textContent=title;
    const weekly=result.pattern==='WEEKLY';$('tt-preview-note').textContent=`${result.occurrences.filter(r=>r.kind!=='BREAK').length} lessons${result.occurrences.some(r=>r.kind==='BREAK')?' · '+result.occurrences.filter(r=>r.kind==='BREAK').length+' breaks':''} ${weekly?'each week':'in this publication'} · ${result.snapshot?.timezone||state.draft.timezone}${history?` · Published snapshot${result.effectiveFrom?' · Effective '+result.effectiveFrom:''}`:' · Repeats weekly until a newer version takes effect'}`;
    state.audiences={classes:audienceRows(result,'class'),teachers:audienceRows(result,'teacher')};
    const requested=$('tt-preview-type').value,available=requested==='teacher'?state.audiences.teachers:state.audiences.classes;
    $('tt-preview-type').value=available.length?requested:(state.audiences.classes.length?'class':'teacher');
    populatePreviewTargets();$('tt-publish-options').hidden=history;controls();
  }
  let exportGeneration=0,exportPages=null,exportFiles=null;
  const presentation=window.M4L_TIMETABLE_PRESENTATION;
  const blocks=window.M4L_TIMETABLE_BLOCKS;
  const createCanvas=(w,h)=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;};
  const logo=new Image();logo.src='/logo.png';
  let exportName='timetable';
  function renderPresentation(){
    const result=state.calendarView,target=$('tt-preview-target').value,type=$('tt-preview-type').value;if(!result)return;
    exportPages=null;exportFiles=null;const generation=++exportGeneration;
    $('tt-share-image').disabled=$('tt-download-image').disabled=$('tt-download-pdf').disabled=true;
    if(!target){$('tt-calendar').innerHTML='<p class="tt-empty">Assign a class or teacher to a lesson before creating a timetable.</p>';$('tt-export-note').textContent='Choose a class or assigned teacher to prepare an export.';return;}
    const model=blocks.model(result,{programName:state.data.program.name,effectiveFrom:state.effectiveFrom||state.data.today,history:result.history,...(type==='teacher'?{teacherId:target}:{classId:target})});
    $('tt-calendar').hidden=false;$('tt-calendar').innerHTML=blocks.html(model,createCanvas);
    exportName=`${type}-${String(model.timetableName||'timetable').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'timetable'}`;
    $('tt-export-note').textContent='Preparing export…';
    Promise.resolve(document.fonts?.ready).then(async()=>{
      if(logo.decode)try{await logo.decode();}catch{}
      if(generation!==exportGeneration)return;
      const pages=blocks.canvases(model,createCanvas,logo.complete&&logo.naturalWidth?logo:null);
      const files=await Promise.all(pages.map((p,i)=>new Promise((resolve,reject)=>p.canvas.toBlob(blob=>blob?resolve(new File([blob],`${exportName}-${i+1}.png`,{type:'image/png'})):reject(Error('Image export failed.')),'image/png'))));
      if(generation!==exportGeneration)return;exportPages=pages;exportFiles=files;
      $('tt-share-image').disabled=$('tt-download-image').disabled=$('tt-download-pdf').disabled=false;
      $('tt-export-note').textContent='Module names are links in the PDF. Images do not contain clickable links.';
    }).catch(error=>{if(generation===exportGeneration)$('tt-export-note').textContent=error.message;});
  }
  $('tt-preview-type').onchange=()=>populatePreviewTargets();
  $('tt-preview-target').onchange=()=>{renderOccurrenceList();renderPresentation();};
  function downloadFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  $('tt-download-image').onclick=()=>{for(const file of exportFiles||[])downloadFile(file,file.name);};
  $('tt-share-image').onclick=async()=>{
    if(!exportFiles)return;
    if(navigator.share&&navigator.canShare?.({files:exportFiles})){
      try{await navigator.share({title:state.data.program.name+' timetable',files:exportFiles});}
      catch(error){if(error.name!=='AbortError')message('Image sharing was unavailable. Use Download image and share the saved file.',true);}
    }else{for(const file of exportFiles)downloadFile(file,file.name);message('Timetable image downloaded. Share the saved image from your device.');}
  };
  $('tt-download-pdf').onclick=()=>work(async()=>{if(exportPages)downloadFile(new Blob([await presentation.pdf(exportPages,window.PDFLib)],{type:'application/pdf'}),`${exportName}.pdf`);});
  $('tt-class-links').href=`/programs/manage.html?program=${encodeURIComponent(id)}&tab=classes`;
  $('tt-management').href=`/programs/manage.html?program=${encodeURIComponent(id)}`;
  $('tt-editor').addEventListener('input',event=>{
    const el=event.target;if(state.busy||state.pending)return;
    {const row=[...state.draft.rules,...(state.draft.breaks||[])].find(r=>r.id===el.closest('[data-row]')?.dataset.row);if(!row)return;
      if(el.dataset.field==='moduleId'){if(el.value.startsWith('subject:')){row.moduleId='';row.programSubjectId=el.value.slice(8);}else{row.moduleId=el.value;row.programSubjectId=state.data.catalog.modules.find(m=>m.id===el.value)?.programSubjectId||'';}}
      else if(el.dataset.field)row[el.dataset.field]=el.dataset.field.endsWith('Time')?inputTime(el.value):el.value;
      if(el.dataset.class){row.classIds=el.checked?[...new Set([...row.classIds,el.dataset.class])]:row.classIds.filter(id=>id!==el.dataset.class);el.closest('details').querySelector('summary').textContent=classNames(row);}
      if(el.dataset.field==='zoomLink'||el.dataset.class){const hint=el.closest('[data-row]')?.querySelector?.('.tt-zoom-default');if(hint)hint.innerHTML=zoomDefault(row);const input=el.closest('[data-row]')?.querySelector?.('[data-field="zoomLink"]');if(input){input.placeholder=row.classIds.length>1?'Shared lesson link required':'Use class link if blank';input.setAttribute?.('aria-required',String(row.classIds.length>1));}}
      if(el.dataset.day!==undefined){const day=Number(el.dataset.day);row.weekdays=el.checked?[...new Set([...row.weekdays,day])]:row.weekdays.filter(d=>d!==day);}
    }invalidate();
  });
  $('tt-editor').addEventListener('focusout',event=>{const el=event.target;if(el.dataset.field?.endsWith('Time')&&!state.busy&&!state.pending)el.value=time(inputTime(el.value));});
  $('tt-editor').addEventListener('click',event=>{if(state.busy||state.pending)return;const remove=event.target.closest('[data-remove]');if(!remove)return;state.draft.rules=state.draft.rules.filter(r=>r.id!==remove.dataset.remove);if(state.draft.breaks)state.draft.breaks=state.draft.breaks.filter(r=>r.id!==remove.dataset.remove);invalidate();render();});
  $('tt-add-break').onclick=()=>{state.draft.breaks||=[];state.draft.breaks.push({id:`BREAK-${crypto.randomUUID()}`,label:'Break',weekdays:[],startTime:'',endTime:''});invalidate();render();};
  $('tt-add').onclick=()=>{state.draft.rules.push({id:`RULE-${crypto.randomUUID()}`,moduleId:'',teacherId:'',classIds:[],weekdays:[],startTime:'',endTime:'',zoomLink:''});invalidate();render();};
  $('tt-effective-from').oninput=event=>{state.effectiveFrom=event.target.value;state.preview=null;exportGeneration++;exportPages=null;exportFiles=null;$('tt-share-image').disabled=$('tt-download-image').disabled=$('tt-download-pdf').disabled=true;$('tt-export-note').textContent='Preview again after changing the effective date.';remember();controls();message('Effective date changed. Preview again to check memberships for this date.');};
  $('tt-save').onclick=()=>work(()=>mutate('save'));$('tt-retry').onclick=()=>work(()=>mutate(state.pending.action));
  $('tt-prepare').onclick=()=>work(async()=>{await api('prepare');await load();});
  $('tt-recover').onclick=()=>work(async()=>{const result=await api('recover');if(state.pending){await mutate(state.pending.action);return;}if(dirty())message('Recovery completed. Your unfinished draft is kept.');else{await load(false);message(result.recovered?'Interrupted change recovered.':'No interrupted change needs recovery.');}});
  for(const action of ['validate','preview'])$(`tt-${action}`).onclick=()=>work(async()=>{const result=await api(action,{draft:state.draft,...(action==='preview'?{effectiveFrom:state.effectiveFrom||state.data.today}:{})});showValidation(result);state.preview=action==='preview'?result:null;if(action==='preview')showOccurrences(result,'Weekly timetable preview');else $('tt-preview-panel').hidden=true;message(result.valid?(action==='preview'?'Preview ready. Choose the effective date below, then publish.':'Validation passed. Preview to review the weekly pattern.'):'Resolve the listed issues before publishing.',!result.valid);});
  $('tt-publish').onclick=()=>work(async()=>{if(state.preview?.valid)await mutate('publish');});
  $('tt-history').onclick=()=>work(async()=>{const result=await api('history');state.history=result.publications;state.data.currentPublicationId=result.currentPublicationId;state.data.publications=result.publications;render();$('tt-history-list').innerHTML=state.history.slice().reverse().map(p=>`<div class="tt-history-item"><strong>Version ${p.version} · ${esc(({CURRENT:'In effect',SCHEDULED:'Scheduled',PAST:'Past',SUPERSEDED:'Superseded'})[p.status]||'Past')}</strong><span>Effective ${esc(p.effectiveFrom)}${p.effectiveUntil?' through '+esc(p.effectiveUntil):''}</span><button class="pb-secondary" data-history="${esc(p.id)}">View snapshot</button><button class="pb-secondary" data-reuse="${esc(p.id)}" ${state.pending?'disabled':''}>Edit as new version</button></div>`).join('')||'<p class="tt-scope">No published timetable yet.</p>';});
  $('tt-history-list').onclick=event=>{if(event.target.dataset.reuse){void reusePublication(event.target.dataset.reuse);return;}const p=state.history.find(p=>p.id===event.target.dataset.history);if(p)showOccurrences(p,`Published version ${p.version}`,true);};
  async function reusePublication(publicationId){
    if(state.busy||state.pending)return;
    const publication=state.history.find(p=>p.id===publicationId);if(!publication)return;
    if(dirty()){
      state.reuseId=publicationId;$('tt-reuse-warning').hidden=false;return;
    }
    await work(async()=>{
      // Fetch current revision before replacing the local draft. Publishing still checks it.
      const latest=await api('get');state.data=latest;state.baseline=JSON.stringify(latest.draft);
      const snapshot=publication.snapshot;
      state.conversion=latest.conversion;state.converted=false;
      state.draft=displayDraft(snapshot.format===format?{format,timezone:snapshot.timezone,...(snapshot.breaks?{breaks:structuredClone(snapshot.breaks)}:{}),...(snapshot.layout?{layout:structuredClone(snapshot.layout)}:{}),...(latest.draft.planner?{planner:structuredClone(latest.draft.planner)}:{}),rules:snapshot.rules.map(r=>({id:r.id,moduleId:r.moduleId,programSubjectId:r.programSubjectId||'',teacherId:r.teacherId,classIds:[...r.classIds],weekdays:[...r.weekdays],startTime:r.startTime,endTime:r.endTime,zoomLink:r.effectiveZoomLink||r.zoomLink||''}))}:snapshot);
      state.effectiveFrom=latest.today;invalidate();render();
      message(`Version ${publication.version} copied into an editable draft. Preview and publish to create a new version.`);
    });
  }
  $('tt-reuse-keep').onclick=()=>{$('tt-reuse-warning').hidden=true;state.reuseId=null;};
  $('tt-reuse-save').onclick=()=>work(async()=>{await mutate('save');const next=state.reuseId;state.reuseId=null;$('tt-reuse-warning').hidden=true;setTimeout(()=>void reusePublication(next),0);});
  $('tt-reload').onclick=()=>{if(dirty()||state.pending)$('tt-refresh-warning').hidden=false;else void work(()=>load(false));};
  $('tt-keep').onclick=()=>{$('tt-refresh-warning').hidden=true;};$('tt-discard').onclick=()=>{$('tt-refresh-warning').hidden=true;void work(()=>load(false));};
  function download(draft){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({programId:id,draft},null,2)],{type:'application/json'}));a.href=url;a.download='program-timetable-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('tt-export').onclick=()=>download(state.draft);$('tt-original').onclick=()=>download(state.conversion.originalDraft);
  $('tt-convert').onclick=()=>{state.converted=true;state.baseline='';invalidate();render();message('The weekly rows are ready to edit. Saving creates a new draft version; the previous dated draft stays preserved.');};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!$('tt-save').disabled){event.preventDefault();void work(()=>mutate('save'));}});
  window.addEventListener('storage',event=>{
    if(event.key!==sharedKey||!state.data||!state.draft||sharedConflict)return;
    const before=JSON.stringify(state.draft),revision=state.data.revision;
    if(!syncShared())return;
    if(before!==JSON.stringify(state.draft)||revision!==state.data.revision){invalidate();render();message('Changes from another timetable tab are now shown. Review the board before publishing.');}
  });
  window.addEventListener('beforeunload',event=>{if(dirty()||state.pending){remember();event.preventDefault();event.returnValue='';}});
  void work(load);
})();
