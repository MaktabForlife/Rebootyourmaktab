/* V105.3.2.3 — weekly lessons with class defaults and lesson Zoom overrides. */
(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=new URLSearchParams(location.search).get('program'),storageKey=`m4l-timetable-pending:${id}`,draftKey=`m4l-timetable-draft:${id}`,format='105.3.2.2-weekly';
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const state={data:null,draft:null,baseline:'',busy:false,pending:null,preview:null,history:[],calendarView:null,conversion:null,converted:false,effectiveFrom:'',adjusting:false};
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
    $('tt-layout').disabled=locked||!ready||Boolean(state.calendarView?.history);$('tt-adjust').disabled=locked||!ready;
    $('tt-entry-form').querySelectorAll?.('button,input,select').forEach(el=>{el.disabled=locked;});
    for(const name of ['save','validate','preview'])$(`tt-${name}`).disabled=locked||!ready;
    $('tt-save').disabled||=!dirty();$('tt-publish').disabled=locked||!ready||!state.preview?.valid;
    $('tt-effective-from').disabled=locked;$('tt-view').disabled=locked;$('tt-preview-class').disabled=locked;
    for(const name of ['reload','recover','history','prepare','convert'])$(`tt-${name}`).disabled=state.busy;
    $('tt-convert').disabled||=Boolean(state.pending);$('tt-retry').disabled=state.busy;$('tt-export').disabled=!state.draft;
    $('tt-pending').hidden=!state.pending;$('tt-conversion').hidden=!needsReview;
    if(needsReview)$('tt-conversion-message').textContent=`The previous draft contains ${state.conversion.oneOffCount} one-off lessons and ${state.conversion.exceptionCount} dated exceptions. Use weekly lessons to continue with its recurring rows. The original draft and published history remain preserved.`;
    $('tt-save-state').textContent=state.pending?'Change not confirmed':dirty()?'Unsaved draft changes':'Saved draft';
  }
  async function work(fn){if(state.busy)return;state.busy=true;controls();try{await fn();}catch(error){message(error.message,true);}finally{state.busy=false;controls();}}
  function invalidate(){exportGeneration++;exportPages=null;exportFiles=null;state.preview=null;$('tt-publish-options').hidden=true;$('tt-preview-panel').hidden=true;$('tt-validation').hidden=true;remember();controls();}
  function options(rows,selected,empty='Choose…'){return `<option value="">${esc(empty)}</option>`+rows.map(row=>`<option value="${esc(row.id)}" ${row.id===selected?'selected':''}>${esc(row.name)}</option>`).join('')+(selected&&!rows.some(r=>r.id===selected)?`<option selected value="${esc(selected)}">Unavailable: ${esc(selected)}</option>`:'');}
  function modules(){const c=state.data.catalog;return [...c.subjects.filter(s=>s.active).map(s=>({id:'subject:'+s.id,name:s.name+' · Subject only'})),...c.modules.filter(m=>m.active).map(m=>{const s=c.subjects.find(s=>s.id===m.programSubjectId),l=c.levels.find(l=>l.id===m.levelId);return {id:m.id,name:`${m.name} · ${s?.name||'Missing subject'}${l?` / ${l.name}`:''}`};})];}
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
    const c=state.data.catalog;$('tt-timezone').innerHTML=window.M4L_TIMEZONES.options(state.draft.timezone);$('tt-timezone').value=state.draft.timezone;$('tt-title').textContent=`${state.data.program.name} · Timetable`;
    $('tt-teachers-note').hidden=c.teachers.length>0;
    $('tt-teachers-note').innerHTML=`No eligible teachers yet. In <a href="/users/?program=${encodeURIComponent(id)}">User profiles</a>, give an active user a confirmed Teacher, Senior or Admin role in this program. Teacher selection is optional.`;
    const current=state.data.publications.find(p=>p.id===state.data.currentPublicationId),scheduled=state.data.publications.filter(p=>p.status==='SCHEDULED');
    $('tt-live-state').textContent=(current?`In effect · Version ${current.version}`:'No timetable in effect')+scheduled.map(p=>` · Version ${p.version} from ${p.effectiveFrom}`).join('');
    $('tt-rules').innerHTML=state.draft.rules.map((row,i)=>`<tr data-row="${esc(row.id)}"><td><select data-field="moduleId" aria-label="Module for lesson ${i+1}">${options(modules(),row.moduleId||(row.programSubjectId?'subject:'+row.programSubjectId:''))}</select></td><td><details><summary>${esc(classNames(row))}</summary>${c.classes.filter(c=>c.active||row.classIds.includes(c.id)).map(cls=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(cls.id)}" ${row.classIds.includes(cls.id)?'checked':''}>${esc(cls.name)}${cls.active?'':' (inactive)'}</label>`).join('')}${row.classIds.filter(id=>!c.classes.some(c=>c.id===id)).map(id=>`<label class="tt-class-choice"><input type="checkbox" data-class="${esc(id)}" checked>Unavailable: ${esc(id)}</label>`).join('')}</details></td><td><select data-field="teacherId" aria-label="Teacher for lesson ${i+1}">${options(c.teachers,row.teacherId,'Not assigned (optional)')}</select></td><td><div class="tt-days">${[1,2,3,4,5,6,0].map(n=>`<label>${days[n].slice(0,2)}<input type="checkbox" data-day="${n}" aria-label="${days[n]} for lesson ${i+1}" ${row.weekdays.includes(n)?'checked':''}></label>`).join('')}</div></td><td>${field(row,'startTime')}</td><td>${field(row,'endTime')}</td><td class="tt-zoom-cell">${zoomField(row)}</td><td><button type="button" data-remove="${esc(row.id)}" class="pb-secondary" aria-label="Remove lesson ${i+1}">×</button></td></tr>`).join('')||'<tr><td colspan="8" class="tt-empty">Add a subject or module lesson to start your weekly timetable.</td></tr>';
    renderBreaks();
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
    render();remember();message(!result.prepared?'Prepare the empty timetable tables to begin.':!result.coordinatorAvailable?'Saving is unavailable until the backend coordinator is configured.':dirty()?'Your unfinished timetable is kept.':!result.catalog.subjects.length?'No subjects yet. Open Program management to add subjects and classes.':'Build the weekly pattern, preview it, then choose its effective date when publishing.');
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
    state.calendarView={...result,history};if(history)state.adjusting=false;$('tt-adjust').setAttribute?.('aria-expanded',String(state.adjusting));$('tt-adjust').hidden=history;$('tt-layout').hidden=!state.adjusting;$('tt-preview-panel').hidden=false;$('tt-preview-title').textContent=title;
    const weekly=result.pattern==='WEEKLY';$('tt-preview-note').textContent=`${result.occurrences.filter(r=>r.kind!=='BREAK').length} lessons${result.occurrences.some(r=>r.kind==='BREAK')?' · '+result.occurrences.filter(r=>r.kind==='BREAK').length+' breaks':''} ${weekly?'each week':'in this publication'} · ${result.snapshot?.timezone||state.draft.timezone}${history?` · Published snapshot${result.effectiveFrom?' · Effective '+result.effectiveFrom:''}`:' · Repeats weekly until a newer version takes effect'}`;
    $('tt-occurrences').innerHTML=result.occurrences.map(r=>`<tr class="${r.status==='CANCELLED'?'tt-cancelled':''}"><td>${esc(weekly?days[r.weekday]:r.date)}</td><td>${esc(time(r.startTime))}–${esc(time(r.endTime))}</td><td>${zoomAnchor(r.zoomLink,r.moduleName||r.subjectName)||esc(r.moduleName||r.subjectName)}<small>${esc(r.subjectName)}${r.levelName?' / '+esc(r.levelName):''}</small></td><td>${r.classNames.map(esc).join(', ')}</td><td>${esc(r.teacherName||'Not assigned')}</td><td>${zoomDisplay(r)}</td><td>${esc(r.status.toLowerCase())}</td></tr>`).join('');
    const classes=new Map();result.occurrences.forEach(r=>r.classIds.forEach((id,i)=>classes.set(id,r.classNames[i])));
    $('tt-preview-class').innerHTML=options([...classes].map(([id,name])=>({id,name})),'','All classes');
    $('tt-preview-class').value='';renderPresentation();
    $('tt-publish-options').hidden=history;controls();
  }
  let exportGeneration=0,exportPages=null,exportFiles=null;
  const presentation=window.M4L_TIMETABLE_PRESENTATION;
  const blocks=window.M4L_TIMETABLE_BLOCKS,viewKey=`m4l-timetable-view:${id}`;
  try{$('tt-view').value=sessionStorage.getItem(viewKey)==='blocks'?'blocks':'table';}catch{$('tt-view').value='table';}
  const createCanvas=(w,h)=>{const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;};
  const logo=new Image();logo.src='/logo.png';
  function renderPresentation(refreshLayout=true){
    const result=state.calendarView;if(!result)return;
    const useBlocks=$('tt-view').value==='blocks',renderer=useBlocks?blocks:presentation;
    const model=renderer.model(result,{programName:state.data.program.name,classId:$('tt-preview-class').value,effectiveFrom:state.effectiveFrom||state.data.today,history:result.history,layout:result.history?undefined:state.draft.layout});
    $('tt-calendar').hidden=false;$('tt-calendar').innerHTML=useBlocks?renderer.html(model,createCanvas):presentation.html(model,{editable:state.adjusting&&!result.history});
    $('tt-view-note').hidden=!useBlocks;$('tt-adjust').hidden=useBlocks||result.history;$('tt-layout').hidden=useBlocks||!state.adjusting;
    if(refreshLayout&&!useBlocks)renderLayout(model);
    exportPages=null;exportFiles=null;const generation=++exportGeneration;
    $('tt-share-image').disabled=$('tt-download-image').disabled=$('tt-download-pdf').disabled=true;
    $('tt-export-note').textContent='Preparing export…';
    Promise.resolve(document.fonts?.ready).then(async()=>{
      if(logo.decode)try{await logo.decode();}catch{}
      if(generation!==exportGeneration)return;
      const pages=renderer.canvases(model,createCanvas,logo.complete&&logo.naturalWidth?logo:null);
      const files=await Promise.all(pages.map((p,i)=>new Promise((resolve,reject)=>p.canvas.toBlob(blob=>blob?resolve(new File([blob],`timetable-${useBlocks?'blocks-':''}${i+1}.png`,{type:'image/png'})):reject(Error('Image export failed.')),'image/png'))));
      if(generation!==exportGeneration)return;exportPages=pages;exportFiles=files;
      $('tt-share-image').disabled=$('tt-download-image').disabled=$('tt-download-pdf').disabled=false;
      $('tt-export-note').textContent='Module names are links in the PDF. Images do not contain clickable links.';
    }).catch(error=>{if(generation===exportGeneration)$('tt-export-note').textContent=error.message;});
  }
  $('tt-preview-class').onchange=renderPresentation;
  $('tt-view').onchange=()=>{try{sessionStorage.setItem(viewKey,$('tt-view').value);}catch{}renderPresentation();};
  function downloadFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  $('tt-download-image').onclick=()=>{for(const file of exportFiles||[])downloadFile(file,file.name);};
  $('tt-share-image').onclick=async()=>{
    if(!exportFiles)return;
    if(navigator.share&&navigator.canShare?.({files:exportFiles})){
      try{await navigator.share({title:state.data.program.name+' timetable',files:exportFiles});}
      catch(error){if(error.name!=='AbortError')message('Image sharing was unavailable. Use Download image and share the saved file.',true);}
    }else{for(const file of exportFiles)downloadFile(file,file.name);message('Timetable image downloaded. Share the saved image from your device.');}
  };
  $('tt-download-pdf').onclick=()=>work(async()=>{const pages=exportPages,name=$('tt-view').value==='blocks'?'timetable-blocks.pdf':'timetable.pdf';if(pages)downloadFile(new Blob([await presentation.pdf(pages,window.PDFLib)],{type:'application/pdf'}),name);});
  $('tt-class-links').href=`/programs/manage.html?program=${encodeURIComponent(id)}&tab=classes`;
  $('tt-management').href=`/programs/manage.html?program=${encodeURIComponent(id)}`;
  function renderLayout(model){
    if(!state.adjusting||state.calendarView?.history)return;
    const layout={alignment:'center',mergeShared:true,columnWidths:{},rowHeights:{},...state.draft.layout};
    $('tt-alignment').value=layout.alignment;$('tt-merge').checked=layout.mergeShared;
    $('tt-widths').innerHTML=[{id:'time',label:'Time'},...model.columns].map(c=>`<label>${esc(c.label)}<input type="number" min="100" max="600" step="10" data-width="${esc(c.id)}" value="${layout.columnWidths[c.id]||(c.id==='time'?180:360)}"></label>`).join('');
    $('tt-heights').innerHTML=model.rows.map(row=>`<label>${esc(row.label)}<input type="number" min="60" max="300" step="10" data-height="${esc(row.key)}" value="${layout.rowHeights[row.key]||70}"></label>`).join('');
  }
  function layoutChanged(refreshControls=false){
    if(state.preview){state.preview.draft=structuredClone(state.draft);if(state.preview.snapshot)state.preview.snapshot.layout=structuredClone(state.draft.layout);}
    remember();controls();renderPresentation(refreshControls);message('Layout updated in the draft. Save the draft or publish to keep it.');
  }
  $('tt-adjust').onclick=()=>{if(state.busy||state.pending||state.calendarView?.history)return;state.adjusting=!state.adjusting;$('tt-layout').hidden=!state.adjusting;$('tt-adjust').setAttribute?.('aria-expanded',String(state.adjusting));renderPresentation();};
  $('tt-layout').addEventListener('input',e=>{
    if(state.busy||state.pending||state.calendarView?.history)return;
    const el=e.target,layout=structuredClone(state.draft.layout||{alignment:'center',mergeShared:true,columnWidths:{},rowHeights:{}});
    if(el.id==='tt-alignment')layout.alignment=el.value;
    else if(el.id==='tt-merge')layout.mergeShared=el.checked;
    else if(el.dataset.width!==undefined||el.dataset.height){const width=el.dataset.width!==undefined,min=width?100:60,max=width?600:300,value=Number(el.value);if(!Number.isInteger(value)||value<min||value>max){message(`Enter a whole number between ${min} and ${max}.`,true);return;}layout[width?'columnWidths':'rowHeights'][width?el.dataset.width:el.dataset.height]=value;}
    else return;
    state.draft.layout=layout;layoutChanged();
  });
  $('tt-layout-reset').onclick=()=>{if(state.busy||state.pending)return;state.draft.layout={alignment:'center',mergeShared:true,columnWidths:{},rowHeights:{}};layoutChanged(true);};
  let entryEdit=null;
  function openEntry(entry,isBreak,isNew=false){
    if(state.busy||state.pending||state.calendarView?.history)return;
    entryEdit={row:structuredClone(entry),isBreak,isNew};const c=state.data.catalog;
    $('tt-entry-title').textContent=isBreak?'Edit break':'Edit lesson';$('tt-entry-error').textContent='';
    $('tt-entry-fields').innerHTML=(isBreak?`<label>Label<input name="label" maxlength="80" value="${esc(entry.label)}"></label>`:`<label>Subject / Module<select name="moduleId">${options(modules(),entry.moduleId||(entry.programSubjectId?'subject:'+entry.programSubjectId:''))}</select></label><fieldset><legend>Classes</legend>${entry.classIds.filter(id=>!c.classes.some(c=>c.id===id)).map(id=>`<label><input type="checkbox" name="classId" value="${esc(id)}" checked>Unavailable: ${esc(id)}</label>`).join('')}${c.classes.filter(c=>c.active||entry.classIds.includes(c.id)).map(cls=>`<label><input type="checkbox" name="classId" value="${esc(cls.id)}" ${entry.classIds.includes(cls.id)?'checked':''}>${esc(cls.name)}</label>`).join('')}</fieldset><label>Teacher<select name="teacherId">${options(c.teachers,entry.teacherId,'Not assigned (optional)')}</select></label>`)+dayChoices(entry,'modal')+`<div class="tt-entry-times"><label>Start<input name="startTime" value="${esc(time(entry.startTime))}" placeholder="08h45" maxlength="5"></label><label>End<input name="endTime" value="${esc(time(entry.endTime))}" placeholder="09h15" maxlength="5"></label></div>`+(isBreak?'':`<label>Lesson Zoom link<input name="zoomLink" type="url" maxlength="2048" value="${esc(entry.zoomLink||'')}"></label><small>Optional for a single class; required for combined classes.</small>`);
    $('tt-entry-dialog').showModal();
  }
  $('tt-entry-cancel').onclick=()=>{$('tt-entry-dialog').close();entryEdit=null;};
  $('tt-entry-form').onsubmit=event=>{event.preventDefault();if(!entryEdit||state.busy||state.pending)return;
    const form=new FormData($('tt-entry-form')),row={...entryEdit.row,weekdays:form.getAll('weekday').map(Number),startTime:inputTime(String(form.get('startTime')||'')),endTime:inputTime(String(form.get('endTime')||''))};
    if(entryEdit.isBreak)row.label=String(form.get('label')||'').trim()||'Break';
    else{const selected=String(form.get('moduleId')||'');row.moduleId=selected.startsWith('subject:')?'':selected;row.programSubjectId=selected.startsWith('subject:')?selected.slice(8):state.data.catalog.modules.find(m=>m.id===selected)?.programSubjectId||'';row.teacherId=String(form.get('teacherId')||'');row.classIds=form.getAll('classId');row.zoomLink=String(form.get('zoomLink')||'').trim();}
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime)||row.startTime>=row.endTime||!row.weekdays.length){$('tt-entry-error').textContent='Choose weekdays and valid times, with the end after the start.';return;}
    const key=entryEdit.isBreak?'breaks':'rules';state.draft[key]||=[];if(entryEdit.isNew)state.draft[key].push(row);else state.draft[key]=state.draft[key].map(r=>r.id===row.id?row:r);
    $('tt-entry-dialog').close();entryEdit=null;invalidate();render();
    void work(async()=>{const result=await api('preview',{draft:state.draft,effectiveFrom:state.effectiveFrom||state.data.today});state.preview=result;showValidation(result);showOccurrences(result,'Weekly timetable preview');message(result.valid?'Entry updated and validated. Save the draft or publish to keep it.':'Entry kept in the draft. Resolve the listed issues before publishing.',!result.valid);});
  };
  $('tt-calendar').onclick=event=>{
    const button=event.target.closest('button');if(!button||!state.adjusting||state.calendarView?.history)return;
    if(button.dataset.gap){const [startTime,endTime]=button.dataset.gap.split('|');openEntry({id:`BREAK-${crypto.randomUUID()}`,label:'Break',startTime,endTime,weekdays:button.dataset.gapDays.split(',').map(Number)},true,true);return;}
    const id=button.dataset.editEntry,entry=state.draft.rules.find(r=>r.id===id)||(state.draft.breaks||[]).find(r=>r.id===id);if(entry)openEntry(entry,id.startsWith('BREAK-'));
  };
  $('tt-editor').addEventListener('input',event=>{
    const el=event.target;if(state.busy||state.pending)return;
    if(el.id==='tt-timezone')state.draft.timezone=el.value;
    else {const row=[...state.draft.rules,...(state.draft.breaks||[])].find(r=>r.id===el.closest('[data-row]')?.dataset.row);if(!row)return;
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
      state.draft=displayDraft(snapshot.format===format?{format,timezone:snapshot.timezone,...(snapshot.breaks?{breaks:structuredClone(snapshot.breaks)}:{}),...(snapshot.layout?{layout:structuredClone(snapshot.layout)}:{}),rules:snapshot.rules.map(r=>({id:r.id,moduleId:r.moduleId,programSubjectId:r.programSubjectId||'',teacherId:r.teacherId,classIds:[...r.classIds],weekdays:[...r.weekdays],startTime:r.startTime,endTime:r.endTime,zoomLink:r.effectiveZoomLink||r.zoomLink||''}))}:snapshot);
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
  window.addEventListener('beforeunload',event=>{if(dirty()||state.pending){remember();event.preventDefault();event.returnValue='';}});
  void work(load);
})();
