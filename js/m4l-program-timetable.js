/* V105.3.4.13 — editable timetable boards share one draft across in-page and browser tabs. */
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
  async function listPrograms(){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw Error('Sign in through your personal Academy account link first.');
    const response=await fetch(`${String(window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')}/api/admin/platform/programs/list`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:'{}'});
    const result=await response.json();if(!response.ok||!result.success)throw Error(result.error||'Programs could not be loaded.');
    return result.programs.filter(row=>row.mode==='PROGRAM'&&(result.store==='D1'?row.status!=='ARCHIVED':row.status==='DRAFT')&&row.id);
  }
  function controls(){
    const locked=state.busy||Boolean(state.pending),needsReview=state.conversion?.required&&!state.converted,ready=state.data?.prepared&&state.data?.coordinatorAvailable&&(state.data.managementEditable??state.data.program.status==='DRAFT')&&!needsReview;
    $('tt-planner').disabled=locked||!ready;
    for(const name of ['save','validate','preview'])$(`tt-${name}`).disabled=locked||!ready;
    $('tt-save').disabled||=!dirty()||sharedConflict;
    $('tt-open-publish').disabled=locked||!ready||!state.preview?.valid||sharedConflict||Boolean(state.calendarView?.history);
    $('tt-publish').disabled=locked||!ready||sharedConflict;
    $('tt-effective-from').disabled=locked;$('tt-preview-type').disabled=locked;$('tt-preview-target').disabled=locked||$('tt-preview-type').value==='program'||!$('tt-preview-target').value;
    for(const name of ['reload','discard-all','history','prepare','convert'])$(`tt-${name}`).disabled=state.busy;
    $('tt-convert').disabled||=Boolean(state.pending);$('tt-retry').disabled=state.busy;
    $('tt-pending').hidden=!state.pending;$('tt-conversion').hidden=!needsReview;
    if(needsReview)$('tt-conversion-message').textContent=`The previous draft contains ${state.conversion.oneOffCount} one-off lessons and ${state.conversion.exceptionCount} dated exceptions. Use weekly lessons to continue with its recurring rows. The original draft and published history remain preserved.`;
    $('tt-save-state').textContent=state.pending?'Change not confirmed':dirty()?'Unsaved draft changes':'Saved draft';
  }
  async function work(fn){if(state.busy)return;state.busy=true;controls();try{await fn();}catch(error){message(error.message,true);}finally{state.busy=false;controls();}}
  function closePublishDialog(){if($('tt-publish-dialog').open)$('tt-publish-dialog').close();}
  function invalidate(){exportGeneration++;exportPages=null;exportFiles=null;state.preview=null;closePublishDialog();$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;remember();controls();planner?.render();}
  function modules(){const c=state.data.catalog;return [...c.subjects.filter(s=>s.active).map(s=>({id:'subject:'+s.id,name:s.name+' · Subject only'})),...c.modules.filter(m=>m.active).map(m=>{const s=c.subjects.find(s=>s.id===m.programSubjectId),l=c.levels.find(l=>l.id===m.levelId);return {id:m.id,name:`${m.name} · ${s?.name||'Missing subject'}${l?` / ${l.name}`:''}`};})];}
  const planner=window.M4L_ASSISTED_PLANNER?.mount({state,$,esc,days,modules,changed:()=>{invalidate();render();},locked:()=>state.busy||Boolean(state.pending)||!state.data?.prepared||!state.data?.coordinatorAvailable||!(state.data.managementEditable??state.data?.program.status==='DRAFT')||Boolean(state.conversion?.required&&!state.converted)});
  if(planner)$('tt-undo-placement').onclick=()=>planner.undo();
  const rowLabel=ruleId=>{const b=(state.draft.breaks||[]).findIndex(r=>r.id===ruleId);if(b>=0)return `Break ${b+1}`;const n=state.draft.rules.findIndex(r=>r.id===ruleId);return n<0?'Timetable':`Lesson ${n+1}`;};
  const anchorLabel=(anchor,sourceId='')=>{const [ruleId,day]=anchor.split('@'),id=sourceId||ruleId;return state.draft.rules.some(row=>row.id===id)?lessonLocation(id,day):`${rowLabel(id)} · ${days[Number(day)]||day}`;};
  function lessonLocation(ruleId,day=null){
    const row=state.draft.rules.find(item=>item.id===ruleId);if(!row)return rowLabel(ruleId);
    const subject=state.data.catalog.modules.find(item=>item.id===row.moduleId)?.name||state.data.catalog.subjects.find(item=>item.id===row.programSubjectId)?.name||'Lesson';
    const classes=row.classIds.map(id=>state.data.catalog.classes.find(item=>item.id===id)?.name||id).join(', ');
    return `${rowLabel(ruleId)} · ${day===null?row.weekdays.map(weekday=>days[weekday]).join(', '):days[Number(day)]||day} ${time(row.startTime)}–${time(row.endTime)} · ${subject}${classes?' · '+classes:''}`;
  }
  function safeZoom(value){if(typeof value!=='string'||value.length>2048||/[\u0000-\u001f\u007f]/.test(value))return '';try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
  const zoomAnchor=(link,label=link)=>safeZoom(link)?`<a href="${esc(safeZoom(link))}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:'';
  const zoomDisplay=row=>zoomAnchor(row.zoomLink)||`<span class="tt-scope">${row.zoomSource==='MULTIPLE'?'Select a class to see its link':'No Zoom link'}</span>`;
  function render(){
    $('tt-title').textContent=`${state.data.program.name} · Timetable`;
    const current=state.data.publications.find(p=>p.id===state.data.currentPublicationId),scheduled=state.data.publications.filter(p=>p.status==='SCHEDULED');
    $('tt-live-state').textContent=(current?`In effect · Version ${current.version}`:'No timetable in effect')+scheduled.map(p=>` · Version ${p.version} from ${p.effectiveFrom}`).join('');
    planner?.render();
    $('tt-effective-from').value=state.effectiveFrom||state.data.today;$('tt-effective-from').min=state.data.today;
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
    planner?.reset?.();
    $('tt-workspace').hidden=!result.prepared;$('tt-prepare').hidden=result.prepared;$('tt-preview-panel').hidden=true;closePublishDialog();$('tt-validation').hidden=true;
    render();remember(true);message(!result.prepared?'Prepare the empty timetable tables to begin.':!result.coordinatorAvailable?'Saving is unavailable until the backend coordinator is configured.':dirty()?'Your unfinished timetable is kept.':!result.catalog.subjects.length?'No subjects yet. Open Program management to add subjects and classes.':'Build the weekly pattern, preview it, then choose its effective date when publishing.');
  }
  function clearPending(){state.pending=null;sessionStorage.removeItem(storageKey);}
  async function mutate(action,retried=false){
    if(sharedConflict)throw Error('Resolve the change from the other tab before saving.');
    const beforeSync=JSON.stringify(state.draft),beforeRevision=state.data.revision;
    if(!state.pending&&!syncShared())throw Error('The shared draft could not be updated. Keep this tab open and copy any unsaved details before reloading.');
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
        try{state.draft=mergeValue(JSON.parse(state.baseline),state.draft,latest.draft);}catch{showTabConflict();throw Error('Another tab changed the same lesson. Copy any unsaved details before reloading the latest version.');}
        state.data=latest;state.baseline=JSON.stringify(latest.draft);revisionStamp=Math.max(Date.now(),revisionStamp+1);remember(true);render();
        if(sharedConflict)throw Error('Another tab changed the same lesson. Copy any unsaved details before reloading the latest version.');
        return mutate('save',true);
      }
      throw error;
    }
  }
  function showValidation(result){
    const openButton=id=>state.draft.rules.some(row=>row.id===id)?` <button type="button" class="tt-open-issue" data-open-issue="${esc(id)}">Open lesson on board</button>`:'';
    $('tt-validation').hidden=false;$('tt-validation').innerHTML=`<strong class="${result.valid?'tt-good':'tt-error'}">${result.valid?'✓ Weekly timetable checked':'Resolve these items before publication'}</strong><ul>${(result.issues||[]).map(i=>`<li>${esc(i.rowId?lessonLocation(i.rowId)+': ':'')}${esc(i.message)}${openButton(i.rowId)}</li>`).join('')}${(result.conflicts||[]).map(c=>`<li>${esc(c.reasons.join(', '))}: ${esc(anchorLabel(c.left,c.rowIds?.[0]))} ↔ ${esc(anchorLabel(c.right,c.rowIds?.[1]))}${openButton(c.rowIds?.[0])}${c.rowIds?.[1]!==c.rowIds?.[0]?openButton(c.rowIds?.[1]):''}</li>`).join('')}</ul>${(result.warnings||[]).map(w=>`<p class="tt-scope">${esc(w)}</p>`).join('')}`;
    const bad=new Set([...(result.issues||[]).map(i=>i.rowId),...(result.conflicts||[]).flatMap(c=>c.rowIds)]);document.querySelectorAll('[data-row]').forEach(row=>row.classList.toggle('tt-row-bad',bad.has(row.dataset.row)));
    planner?.showIssues(result);
  }
  $('tt-validation').onclick=event=>{const id=event.target.closest?.('[data-open-issue]')?.dataset.openIssue;if(id)planner?.openIssue(id);};
  function audienceRows(result,type){
    const rows=new Map();
    for(const row of result.occurrences.filter(row=>row.kind!=='BREAK')){
      if(type==='teacher'){(row.teacherIds||[row.teacherId]).forEach((teacherId,index)=>{if(teacherId)rows.set(teacherId,row.teacherNames?.[index]||row.teacherName||teacherId);});}
      else row.classIds.forEach((classId,i)=>rows.set(classId,row.classNames[i]||classId));
    }
    return [...rows].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));
  }
  function visibleOccurrences(result,type,target){
    if(type==='program')return presentation.displayOccurrences(result.occurrences,{program:true});
    const lessons=result.occurrences.filter(row=>row.kind!=='BREAK'&&(type==='teacher'?(row.teacherIds||[row.teacherId]).includes(target):row.classIds.includes(target)));
    const lessonDays=new Set(lessons.map(row=>result.pattern==='WEEKLY'?row.weekday:row.date));
    return result.occurrences.filter(row=>row.kind!=='BREAK'?(type==='teacher'?(row.teacherIds||[row.teacherId]).includes(target):row.classIds.includes(target)):(type==='class'||lessonDays.has(result.pattern==='WEEKLY'?row.weekday:row.date)));
  }
  function renderOccurrenceList(){
    const result=state.calendarView,target=$('tt-preview-target').value,type=$('tt-preview-type').value;if(!result)return;
    const weekly=result.pattern==='WEEKLY';
    const allClassIds=result.history?[...new Set(result.occurrences.filter(row=>row.kind!=='BREAK').flatMap(row=>row.classIds))]:state.data.catalog.classes.filter(row=>row.active).map(row=>row.id);
    $('tt-occurrences').innerHTML=visibleOccurrences(result,type,target).map(r=>`<tr class="${r.status==='CANCELLED'?'tt-cancelled':''}"><td>${esc(weekly?days[r.weekday]:r.date)}</td><td>${esc(time(r.startTime))}–${esc(time(r.endTime))}</td><td>${zoomAnchor(r.zoomLink,r.moduleName||r.subjectName)||esc(r.moduleName||r.subjectName)}<small>${esc(r.subjectName)}${r.levelName?' / '+esc(r.levelName):''}</small></td><td>${esc(type==='program'&&allClassIds.length>1&&allClassIds.every(classId=>r.classIds.includes(classId))?'All classes':r.classNames.join(', '))}</td><td>${esc(presentation.teacherLabel(r))}</td><td>${zoomDisplay(r)}</td><td>${esc(r.status.toLowerCase())}</td></tr>`).join('')||'<tr><td colspan="7" class="tt-empty">No lessons are assigned to this selection.</td></tr>';
  }
  function populatePreviewTargets(preferred=''){
    const type=$('tt-preview-type').value,rows=type==='teacher'?state.audiences.teachers:state.audiences.classes,target=$('tt-preview-target');
    $('tt-preview-target-wrap').hidden=type==='program';
    $('tt-preview-target-label').textContent=type==='teacher'?'Teacher':'Class';
    target.innerHTML=rows.length?rows.map(row=>`<option value="${esc(row.id)}">${esc(row.name)}</option>`).join(''):'<option value="">No eligible options</option>';
    target.value=rows.some(row=>row.id===preferred)?preferred:(rows[0]?.id||'');
    renderOccurrenceList();renderPresentation();controls();
  }
  function showOccurrences(result,title,history=false){
    state.calendarView={...result,history};$('tt-preview-panel').hidden=false;$('tt-preview-title').textContent=title;
    const weekly=result.pattern==='WEEKLY',displayRows=presentation.displayOccurrences(result.occurrences,{program:true});$('tt-preview-note').textContent=`${displayRows.filter(r=>r.kind!=='BREAK').length} lessons${displayRows.some(r=>r.kind==='BREAK')?' · '+displayRows.filter(r=>r.kind==='BREAK').length+' breaks':''} ${weekly?'each week':'in this publication'}${history?` · Published snapshot${result.effectiveFrom?' · Effective '+result.effectiveFrom:''}`:' · Repeats weekly until a newer version takes effect'}`;
    state.audiences={classes:audienceRows(result,'class'),teachers:audienceRows(result,'teacher')};
    const requested=$('tt-preview-type').value||'program',available=requested==='teacher'?state.audiences.teachers:state.audiences.classes;
    $('tt-preview-type').value=requested==='program'||available.length?requested:'program';
    populatePreviewTargets();if(history)closePublishDialog();controls();
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
    if(type!=='program'&&!target){$('tt-calendar').innerHTML='<p class="tt-empty">Assign a class or teacher to a lesson before creating a timetable.</p>';$('tt-export-note').textContent='Choose a class or assigned teacher to prepare an export.';return;}
    const classRoster=result.history?[...new Map(result.occurrences.filter(row=>row.kind!=='BREAK').flatMap(row=>row.classIds.map((id,index)=>[id,row.classNames[index]||id]))).entries()].map(([id,name])=>({id,name})):state.data.catalog.classes.filter(row=>row.active);
    const model=blocks.model(result,{programName:state.data.program.name,effectiveFrom:state.effectiveFrom||state.data.today,history:result.history,allClassIds:classRoster.map(row=>row.id),allClassNames:classRoster.map(row=>row.name),...(type==='program'?{program:true}:type==='teacher'?{teacherId:target}:{classId:target})});
    $('tt-calendar').hidden=false;$('tt-calendar').innerHTML=blocks.html(model,createCanvas);
    exportName=`${type}-${String(model.timetableName||'timetable').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'timetable'}`;
    $('tt-export-note').textContent='Preparing export…';
    Promise.resolve(document.fonts?.ready).then(async()=>{
      if(logo.decode)try{await logo.decode();}catch{}
      if(generation!==exportGeneration)return;
      const pages=blocks.canvases(model,createCanvas,logo.complete&&logo.naturalWidth?logo:null);
      const files=await Promise.all(pages.map(p=>new Promise((resolve,reject)=>p.canvas.toBlob(blob=>blob?resolve(new File([blob],`${exportName}.png`,{type:'image/png'})):reject(Error('Image export failed.')),'image/png'))));
      if(generation!==exportGeneration)return;exportPages=pages;exportFiles=files;
      $('tt-share-image').disabled=$('tt-download-image').disabled=$('tt-download-pdf').disabled=false;
      $('tt-export-note').textContent=type==='program'?'One image and one-page PDF are ready. Lesson links work in the PDF.':'Module names are links in the PDF. Images do not contain clickable links.';
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
  $('tt-download-pdf').onclick=()=>work(async()=>{if(exportPages)downloadFile(new Blob([await presentation.pdf(exportPages,window.PDFLib,{size:$('tt-preview-type').value==='program'?'program':'A4'})],{type:'application/pdf'}),`${exportName}.pdf`);});
  $('tt-management').href=`/programs/manage.html?program=${encodeURIComponent(id)}`;
  $('tt-select-program').onclick=async()=>{
    const button=$('tt-select-program');if(button.disabled)return;
    button.disabled=true;
    $('tt-program-choice').innerHTML='<option value="">Loading programs…</option>';
    $('tt-program-choice').disabled=true;$('tt-program-open').disabled=true;
    $('tt-program-error').hidden=true;$('tt-program-error').textContent='';$('tt-program-dialog').showModal();
    try{
      const programs=await listPrograms();
      if(!programs.length)throw Error('No programs are available to open.');
      $('tt-program-choice').innerHTML=programs.map(row=>'<option value="'+esc(row.id)+'">'+esc(row.name)+'</option>').join('');
      $('tt-program-choice').value=programs.some(row=>row.id===id)?id:programs[0].id;
      $('tt-program-choice').disabled=false;$('tt-program-open').disabled=false;
    }catch(error){$('tt-program-error').textContent=error.message;$('tt-program-error').hidden=false;}finally{button.disabled=false;}
  };
  $('tt-program-cancel').onclick=()=>{$('tt-program-dialog').close();};
  $('tt-program-dialog').oncancel=event=>{event.preventDefault();$('tt-program-dialog').close();};
  $('tt-program-choice').onchange=()=>{$('tt-program-error').hidden=true;};
  $('tt-program-open').onclick=()=>{
    const selected=$('tt-program-choice').value;
    if(!selected){$('tt-program-error').textContent='Choose a program.';$('tt-program-error').hidden=false;return;}
    if(selected===id){$('tt-program-dialog').close();return;}
    if(dirty()&&!window.confirm('You have unsaved timetable changes. Save draft before switching programs. Continue without saving?'))return;
    location.href='/programs/timetable.html?program='+encodeURIComponent(selected);
  };
  $('tt-open-publish').onclick=()=>{
    if($('tt-open-publish').disabled)return;
    $('tt-effective-from').value=state.effectiveFrom||state.data.today;
    $('tt-effective-from').min=state.data.today;
    $('tt-publish-error').hidden=true;
    $('tt-publish-dialog').showModal();
  };
  $('tt-publish-cancel').onclick=closePublishDialog;
  $('tt-save').onclick=()=>work(()=>mutate('save'));$('tt-retry').onclick=()=>work(()=>mutate(state.pending.action));
  $('tt-prepare').onclick=()=>work(async()=>{await api('prepare');await load();});
  for(const action of ['validate','preview'])$(`tt-${action}`).onclick=()=>work(async()=>{const result=await api(action,{draft:state.draft,...(action==='preview'?{effectiveFrom:state.effectiveFrom||state.data.today}:{})});showValidation(result);state.preview=action==='preview'?result:null;if(action==='preview')showOccurrences(result,'Weekly timetable preview');else {$('tt-preview-panel').hidden=true;closePublishDialog();}message(result.valid?(action==='preview'?'Preview ready. Publish this timetable from the section below to choose the effective date.':'Validation passed. Preview to review the weekly pattern.'):'Resolve the listed issues before publishing.',!result.valid);});
  $('tt-publish').onclick=()=>work(async()=>{
    const date=$('tt-effective-from').value;
    $('tt-publish-error').hidden=true;
    if(!date||date<state.data.today){$('tt-publish-error').textContent='Choose today or a later effective date.';$('tt-publish-error').hidden=false;return;}
    try{
      if(date!==state.effectiveFrom||!state.preview?.valid){
        const result=await api('preview',{draft:state.draft,effectiveFrom:date});
        showValidation(result);
        if(!result.valid){state.preview=null;$('tt-preview-panel').hidden=true;$('tt-publish-error').textContent='This date has validation issues. Close this popup and review them before publishing.';$('tt-publish-error').hidden=false;return;}
        state.preview=result;state.effectiveFrom=date;remember();
      }
      if(state.preview?.valid)await mutate('publish');
    }catch(error){$('tt-publish-error').textContent=error.message;$('tt-publish-error').hidden=false;throw error;}
  });
  $('tt-history').onclick=()=>work(async()=>{const result=await api('history');state.history=result.publications;state.data.currentPublicationId=result.currentPublicationId;state.data.publications=result.publications;render();$('tt-history-list').innerHTML=state.history.slice().reverse().map(p=>`<div class="tt-history-item"><strong>Version ${p.version} · ${esc(({CURRENT:'In effect',SCHEDULED:'Scheduled',PAST:'Past',SUPERSEDED:'Superseded'})[p.status]||'Past')}</strong><span>Effective ${esc(p.effectiveFrom)}${p.effectiveUntil?' through '+esc(p.effectiveUntil):''}</span><button class="pb-secondary" data-history="${esc(p.id)}">View snapshot</button><button class="pb-secondary" data-reuse="${esc(p.id)}" ${state.pending?'disabled':''}>Edit as new version</button></div>`).join('')||'<p class="tt-scope">No published timetable yet.</p>';});
  $('tt-history-list').onclick=event=>{if(event.target.dataset.reuse){void reusePublication(event.target.dataset.reuse);return;}const p=state.history.find(p=>p.id===event.target.dataset.history);if(p)showOccurrences(p,`Published version ${p.version}`,true);};
  function editableSnapshotRules(rows){
    const restored=new Map();
    for(const row of rows){
      const id=row.sourceRuleId||row.id,existing=restored.get(id);
      if(existing&&row.assignmentMode==='CLASS'){existing.classIds.push(...row.classIds);continue;}
      restored.set(id,{id,moduleId:row.moduleId,programSubjectId:row.programSubjectId||'',teacherId:['CLASS','NONE'].includes(row.assignmentMode)?'':row.teacherId,...(row.assignmentMode==='EXPLICIT'&&row.teacherIds?.length>1?{additionalTeacherIds:row.teacherIds.slice(1)}:{}),...(row.assignmentMode==='NONE'?{teacherMode:'NONE'}:{}),classIds:[...row.classIds],weekdays:[...row.weekdays],startTime:row.startTime,endTime:row.endTime,zoomLink:row.assignmentMode?row.zoomLink||'':row.effectiveZoomLink||row.zoomLink||''});
    }
    return [...restored.values()];
  }
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
      state.draft=displayDraft(snapshot.format===format?{format,timezone:snapshot.timezone,...(snapshot.breaks?{breaks:structuredClone(snapshot.breaks)}:{}),...(snapshot.layout?{layout:structuredClone(snapshot.layout)}:{}),...(latest.draft.planner?{planner:structuredClone(latest.draft.planner)}:{}),rules:editableSnapshotRules(snapshot.rules)}:snapshot);
      state.effectiveFrom=latest.today;invalidate();render();
      message(`Version ${publication.version} copied into an editable draft. Preview and publish to create a new version.`);
    });
  }
  $('tt-reuse-keep').onclick=()=>{$('tt-reuse-warning').hidden=true;state.reuseId=null;};
  $('tt-reuse-save').onclick=()=>work(async()=>{await mutate('save');const next=state.reuseId;state.reuseId=null;$('tt-reuse-warning').hidden=true;setTimeout(()=>void reusePublication(next),0);});
  async function openSavedDraft(){
    if(!window.confirm('Discard all unsaved timetable changes and return to the last saved draft? This cannot be undone.'))return;
    localStorage.removeItem(sharedKey);
    sessionStorage.removeItem(draftKey);
    clearPending();
    $('tt-refresh-warning').hidden=true;
    await load(false);
  }
  async function loadUnfinishedDraft(){
    const unfinished=structuredClone(state.draft),wasConverted=state.converted,latest=await api('get');
    localStorage.removeItem(sharedKey);
    clearPending();
    state.data=latest;state.baseline=JSON.stringify(latest.draft);state.draft=displayDraft(unfinished);
    state.conversion=latest.conversion;state.converted=wasConverted;
    sharedConflict=false;sharedSnapshot=null;sharedStamp=0;revisionStamp=Date.now();$('tt-tab-warning').hidden=true;
    planner?.reset?.();
    invalidate();render();message('Unsaved version loaded. Review the board, then select Save draft to keep these changes.');
  }
  $('tt-load-unfinished').onclick=()=>work(loadUnfinishedDraft);
  $('tt-open-saved').onclick=()=>work(openSavedDraft);
  $('tt-discard-all').onclick=()=>work(openSavedDraft);
  $('tt-reload').onclick=()=>{if(sharedConflict){message('Choose a version above to continue.',true);return;}if(dirty()||state.pending)$('tt-refresh-warning').hidden=false;else void work(()=>load(false));};
  $('tt-keep').onclick=()=>{$('tt-refresh-warning').hidden=true;};$('tt-discard').onclick=()=>work(openSavedDraft);
  function download(draft){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({programId:id,draft},null,2)],{type:'application/json'}));a.href=url;a.download='program-timetable-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('tt-original').onclick=()=>download(state.conversion.originalDraft);
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
