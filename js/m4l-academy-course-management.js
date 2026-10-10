/* Course delivery workspace. Authority, revisions and publication checks are server-owned. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>localStorage.getItem('m4l_account_token')||'',base='/api/admin/platform/courses/';
  const state={token:'',session:null,generation:0,selection:0,courses:[],categories:[],teachers:[],timezone:'Africa/Johannesburg',capabilities:{},course:null,draft:null,dirty:false,tab:'details',busy:false,review:null,calendarWarnings:[],media:[],participants:null,personDrafts:new Map(),peopleSearch:'',assignedOnly:false,pending:null};
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labels={DRAFT:'Draft',PUBLISHED:'Published',ACTIVE:'Active',COMPLETE:'Complete',CANCELLED:'Cancelled',ARCHIVED:'Archived'};
  const copy=value=>JSON.parse(JSON.stringify(value));
  const selected=()=>state.course?{courseId:state.course.courseId,runId:state.course.runId}:{};
  const hasUnsavedChanges=()=>state.dirty||state.personDrafts.size>0;
  const editable=()=>state.course?.stage==='DRAFT';
  const reviewAccepted=()=>Boolean(!state.dirty&&state.review?.valid&&state.course?.acceptedToken===state.review.token);
  const tell=(message,error=false)=>{$('course-message').textContent=message||'';$('course-message').classList.toggle('is-error',error);};
  function lock(message){state.token='';state.session=null;state.course=null;state.draft=null;state.dirty=false;state.courses=[];state.participants=null;state.personDrafts.clear();state.pending=null;state.review=null;state.media=[];state.calendarWarnings=[];state.busy=false;state.selection++;$('course-workspace').hidden=true;$('course-editor').replaceChildren();$('course-list').replaceChildren();$('course-dialog').close();$('course-dialog').replaceChildren();$('course-account-name').textContent='';$('course-access-message').textContent=message;tell('');}
  async function api(path,input={},authToken=state.token){
    const generation=state.generation;
    if(!authToken||authToken!==token()||path!=='/api/account/session'&&!state.session)throw Error('Sign in with an authorised Academy administrator account.');
    const response=await fetch(`${String(window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')}${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+authToken},body:JSON.stringify(input)});
    const result=await response.json();
    if(generation!==state.generation||authToken!==token())throw Error('Your Academy account changed. Open this page again.');
    if(!response.ok||result.success===false){
      if([401,403].includes(response.status))lock('Course management requires a current Global Admin or assigned Course Program Admin account. Return to Academy home to sign in.');
      throw Object.assign(Error(result.error||'The Course request could not be completed.'),result,{status:response.status});
    }
    return result;
  }
  async function mutate(action,input){
    const key=JSON.stringify({action,input});
    if(state.pending?.key!==key)state.pending={key,input:{...input,operationId:crypto.randomUUID()}};
    const result=await api(base+action,state.pending.input);state.pending=null;return result;
  }
  const disabledBeforeBusy=new WeakMap();
  function busy(value){state.busy=value;for(const node of document.querySelectorAll('[data-cm-mutation],#course-new,#course-refresh,#course-editor input,#course-editor select')){if(value){if(!disabledBeforeBusy.has(node))disabledBeforeBusy.set(node,node.disabled);node.disabled=true;}else if(disabledBeforeBusy.has(node)){node.disabled=disabledBeforeBusy.get(node);disabledBeforeBusy.delete(node);}}}
  function pill(stage){return `<span class="cm-pill" data-stage="${esc(stage)}">${esc(labels[stage]||stage)}</span>`;}
  function renderList(){
    const search=$('course-search').value.trim().toLowerCase(),status=$('course-status-filter').value;
    const rows=state.courses.filter(c=>(!search||c.name.toLowerCase().includes(search))&&(!status||c.stage===status)).sort((a,b)=>a.name.localeCompare(b.name)||b.startDate.localeCompare(a.startDate));
    $('course-count').textContent=`${rows.length} ${rows.length===1?'Course':'Courses'}`;
    $('course-list').innerHTML=rows.length?rows.map(c=>`<button class="cm-course${state.course?.courseId===c.courseId&&state.course?.runId===c.runId?' is-selected':''}" type="button" data-cm-action="select" data-course="${esc(c.courseId)}" data-run="${esc(c.runId)}" aria-pressed="${state.course?.courseId===c.courseId&&state.course?.runId===c.runId}"><strong>${esc(c.name)}</strong>${pill(c.stage)}<small>${esc(c.startDate?`${c.startDate}${c.endDate&&c.endDate!==c.startDate?' → '+c.endDate:''}`:'Dates to be set')}${c.accessModel?' · '+(c.accessModel==='FREE'?'Free':'Paid'):''}</small></button>`).join(''):'<p class="cm-hint">No Courses match this view.</p>';
  }
  const options=(items,value,empty='Choose…')=>`<option value="">${esc(empty)}</option>`+items.map(i=>`<option value="${esc(i.value)}"${i.value===value?' selected':''}>${esc(i.label)}</option>`).join('');
  const teacherOptions=value=>options(state.teachers.map(t=>({value:t.accountId,label:t.name})),value,'Choose a teacher')+(value&&!state.teachers.some(t=>t.accountId===value)?`<option value="${esc(value)}" selected disabled>Previously selected · teacher designation needed</option>`:'');
  const field=(name,label,type='text',span='',hint='')=>`<label class="cm-field ${span}"><span>${label}</span><input data-field="${name}" type="${type}" value="${esc(state.draft[name])}"${name==='name'?' maxlength="160" required':''}${name==='zoomLink'?' placeholder="https://…"':''}${editable()?'':' disabled'}>${hint?`<small>${hint}</small>`:''}</label>`;
  function detailsTab(){
    const d=state.draft,disabled=editable()?'':' disabled';
    return `<div class="cm-form-grid">${field('name','Course name <span aria-hidden="true">*</span>','text','cm-span-2')}<label class="cm-field cm-span-2">Subject / Module category<select data-field="categoryKey"${disabled}>${options(state.categories.map(c=>({value:c.key,label:c.type+' · '+c.name+(c.area?' — '+c.area:'')})),d.categoryKey,'No category')}${d.categoryKey&&!state.categories.some(c=>c.key===d.categoryKey)?`<option value="${esc(d.categoryKey)}" selected>Category no longer available</option>`:''}</select><small>For categorisation only. Content and access are set on this Course.</small></label><label class="cm-field">Access<select data-field="accessModel"${disabled}>${options([{value:'FREE',label:'Free'},{value:'PAID',label:'Paid'}],d.accessModel,'Choose Free or Paid')}</select></label>${field('timezone','Timezone','text')}${field('startDate','Start date','date')}${field('endDate','End date','date','', 'Use the same date for a one-day Course.')}<hr class="cm-divider"><fieldset class="cm-fieldset"${disabled}><legend>Schedule days</legend><div class="cm-days">${[1,2,3,4,5,6,0].map(n=>`<label><input type="checkbox" data-day="${n}"${d.weekdays.includes(n)?' checked':''}><span>${days[n]}</span></label>`).join('')}</div></fieldset>${field('startTime','Start time','time')}${field('endTime','Finish time','time')}<label class="cm-field cm-span-2">Teacher<select data-field="teacherId"${disabled}>${teacherOptions(d.teacherId)}</select></label>${field('zoomLink','Zoom meeting link','url','cm-span-4')}<p class="cm-hint cm-span-4">${editable()?'Save a draft with only its name. When the schedule is ready, select Validate & generate sessions. Dates, times, teacher and Zoom link are filled in automatically for your review. Changing the schedule asks before replacing edited sessions.':'Published details are protected. Create a revision to edit this schedule.'}</p></div>`;
  }
  function sessionsTab(){
    const canEdit=editable(),d=state.draft,disabled=canEdit?'':' disabled';
    const holidays=new Set(state.calendarWarnings.map(w=>w.date));
    return `<div class="cm-section-toolbar"><h3>Sessions<span class="cm-session-count">${d.sessions.filter(s=>s.status==='SCHEDULED').length} scheduled · ${d.sessions.filter(s=>s.status==='CANCELLED').length} cancelled · ${esc(d.timezone)}</span></h3>${canEdit?`<button type="button" class="pb-secondary" data-cm-action="generate" data-cm-mutation>${d.sessions.length?'Regenerate from schedule':'Validate & generate sessions'}</button><button type="button" data-cm-action="add-session" data-cm-mutation>+ Add session</button>`:''}</div><p class="cm-hint" style="margin-bottom:12px">Review the sessions generated from your schedule. Academy holidays and teacher clashes are highlighted after validation. Edit any exception, validate again, then accept your review before publishing.</p>${d.sessions.length?`<div class="cm-table-wrap"><table class="cm-table cm-sessions"><thead><tr><th>Date</th><th>Start</th><th>Finish</th><th>Teacher</th><th>Session title</th><th>Zoom link</th><th>Status</th>${canEdit?'<th><span class="cm-hint">Remove</span></th>':''}</tr></thead><tbody>${d.sessions.map((s,i)=>`<tr data-session-row="${esc(s.id)}" class="${holidays.has(s.date)?'cm-holiday ':''}${s.status==='CANCELLED'?'cm-cancelled':''}"><td><input aria-label="Session ${i+1} date" type="date" data-session="${esc(s.id)}" data-session-field="date" value="${esc(s.date)}"${disabled}>${holidays.has(s.date)?'<small class="cm-session-count">Academy holiday</small>':''}</td><td><input aria-label="Session ${i+1} start time" type="time" data-session="${esc(s.id)}" data-session-field="startTime" value="${esc(s.startTime)}"${disabled}></td><td><input aria-label="Session ${i+1} finish time" type="time" data-session="${esc(s.id)}" data-session-field="endTime" value="${esc(s.endTime)}"${disabled}></td><td><select class="cm-teacher" aria-label="Session ${i+1} teacher" data-session="${esc(s.id)}" data-session-field="teacherId"${disabled}>${teacherOptions(s.teacherId)}</select></td><td><input class="cm-title" aria-label="Session ${i+1} title" data-session="${esc(s.id)}" data-session-field="title" value="${esc(s.title)}" maxlength="400"${disabled}></td><td><input class="cm-link" aria-label="Session ${i+1} Zoom link" type="url" data-session="${esc(s.id)}" data-session-field="zoomLink" value="${esc(s.zoomLink)}"${disabled}></td><td><select aria-label="Session ${i+1} status" data-session="${esc(s.id)}" data-session-field="status"${disabled}>${options([{value:'SCHEDULED',label:'Scheduled'},{value:'CANCELLED',label:'Cancelled'}],s.status,'')}</select></td>${canEdit?`<td><button class="cm-remove" type="button" aria-label="Remove session ${i+1}" data-cm-action="remove-session" data-id="${esc(s.id)}" data-cm-mutation>×</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="cm-media-empty"><h3>No sessions yet</h3><p>Set your schedule in Details, then select Validate & generate sessions. Each date, time, teacher and Zoom link will be filled in for you.</p></div>'}${canEdit&&state.review?.valid?`<div class="cm-session-review"><p>${state.review.warnings.length?`${state.review.warnings.length} warnings to review before acceptance.`:'Sessions checked. Review the dates and times above before accepting.'}</p><button type="button" data-cm-action="tab" data-tab="review" data-cm-mutation>${reviewAccepted()?'Continue to publish':'Review & accept sessions'} →</button></div>`:''}`;
  }
  function peopleTab(){
    if(!state.course.courseId)return '<p class="cm-hint">Save the Course draft before adding participants.</p>';
    if(!state.participants)return '<p class="cm-hint">Loading users…</p>';
    const rows=state.participants.accounts.filter(a=>(!state.peopleSearch||a.displayName.toLowerCase().includes(state.peopleSearch.toLowerCase()))&&(!state.assignedOnly||a.assignment.displayRoles.length));
    return `<div class="cm-section-toolbar"><h3>Participants</h3><input class="cm-person-search" id="course-people-search" type="search" placeholder="Find a user…" aria-label="Find a user" value="${esc(state.peopleSearch)}"><label class="cm-toggle"><input id="course-assigned-only" type="checkbox"${state.assignedOnly?' checked':''}>Assigned only</label><button type="button" data-cm-action="add-user" data-cm-mutation>+ Add user</button></div><p class="cm-hint" style="margin-bottom:12px">Student access subscribes the user to this Course. Teachers and Program Admins manage this Course only. Global Admins automatically inherit Program Admin access.</p>${state.course.legacySharedAccess?'<p class="cm-inline-note warning">This existing Course has several deliveries sharing the same participants. Changes apply to all its existing deliveries. Repeating creates a separate Course and participant list.</p>':''}<div class="cm-table-wrap"><table class="cm-table cm-people"><thead><tr><th>User</th><th>Student</th><th>Teacher</th><th>Program Admin</th><th>Changes</th></tr></thead><tbody>${rows.map(a=>{
      const roles=state.personDrafts.get(a.accountId)||a.assignment.roles;
      return `<tr><td>${esc(a.displayName)}${a.academyAdmin?'<small>Global Admin · inherited access</small>':!a.active?'<small>Inactive account</small>':''}</td>${['STUDENT','TEACHER','PROGRAM_ADMIN'].map(role=>`<td><input type="checkbox" aria-label="${esc(a.displayName)} · ${role==='PROGRAM_ADMIN'?'Program Admin':role==='TEACHER'?'Teacher':'Student'}" data-person="${esc(a.accountId)}" data-role="${role}"${roles.includes(role)||a.assignment.inheritedRoles.includes(role)?' checked':''}${!a.active||a.assignment.inheritedRoles.includes(role)?' disabled':''}></td>`).join('')}<td><button type="button" class="pb-secondary" data-cm-action="save-person" data-account="${esc(a.accountId)}" data-cm-mutation${state.personDrafts.has(a.accountId)?'':' disabled'}>Save</button></td></tr>`;
    }).join('')||'<tr><td colspan="5">No users match this view.</td></tr>'}</tbody></table></div><p class="cm-hint" style="margin-top:10px">Course media access begins on completion and continues while the Student assignment is retained. Removing Student access removes media access through this Course.</p>`;
  }
  function mediaTab(){return `<div class="cm-media-empty"><h3>Recordings, notes &amp; other media</h3><p>Private Academy media storage is still to be connected. Uploading and opening protected files will become available with that work.</p><p>Once enabled, students will receive access when this Course is completed. They retain access to everything attached to this Course while their Student assignment remains, including media added later.</p></div>${state.media.length?`<h3 style="font-size:14px;margin-top:22px">Existing media · ${state.media.length}</h3><div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>Name</th><th>Type</th></tr></thead><tbody>${state.media.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.type)}</td></tr>`).join('')}</tbody></table></div><p class="cm-hint" style="margin-top:10px">These existing media records can be reused when repeating the Course. File access remains closed until private storage is ready.</p>`:''}`;}
  function reviewTab(){
    if(!editable())return `<h3 class="cm-review-title">${esc(labels[state.course.stage]||state.course.stage)} Course</h3><p class="cm-hint">${state.course.stage==='PUBLISHED'?'These sessions are published to the Academy timetable. Use More → Create revision to prepare changes for validation and review.':['COMPLETE','ARCHIVED'].includes(state.course.stage)?'The Course and its participant records are retained. Repeat as a new Course to schedule another delivery.':'This Course is no longer on the timetable. Its participant records are retained.'}</p>`;
    const r=state.review,accepted=reviewAccepted();
    if(!r)return `<h3 class="cm-review-title">Validate your schedule first</h3><p class="cm-hint">Save the draft and set its schedule. Validation generates the sessions automatically, then checks dates, teachers, Zoom links, overlapping sessions and Academy holidays. Review and accept the sessions before publishing.</p><button style="margin-top:18px" type="button" data-cm-action="validate" data-cm-mutation${editable()?'':' disabled'}>Validate &amp; generate sessions</button>`;
    return `<h3 class="cm-review-title">${accepted?'Review accepted':r.valid?'Accept your session review':'A few details need attention'}</h3><p class="cm-hint">${r.valid?`${state.draft.sessions.filter(s=>s.status==='SCHEDULED').length} scheduled sessions checked. ${accepted?'You can now publish them to the Academy timetable.':'Review each session, then accept this saved version.'}`:'Resolve these issues and validate again. Sessions will be generated from your schedule when it is ready.'}</p><ul class="cm-review-list">${r.errors.map(e=>`<li class="error">${esc(e.message)}<button type="button" data-cm-action="tab" data-tab="${e.sessionId||e.field==='sessions'?'sessions':'details'}">Review ${e.sessionId?'session':'details'} →</button></li>`).join('')}${r.warnings.map(w=>`<li class="warning">${esc(w.message)}<button type="button" data-cm-action="tab" data-tab="sessions">Review sessions →</button></li>`).join('')}${r.valid&&!r.warnings.length?'<li>No publication issues found.</li>':''}</ul>${r.valid?`<div class="cm-publish-bar"><div><p><strong>${esc(state.draft.name)}</strong> · ${state.draft.accessModel==='FREE'?'Free':'Paid'}</p>${!accepted&&r.warnings.length?'<label class="cm-toggle" style="margin-top:10px"><input id="course-ack-warnings" type="checkbox">I have reviewed the warnings and want to keep these sessions.</label>':`<p class="cm-hint">${accepted?'The accepted saved sessions are ready to publish.':'Accept only after reviewing the generated sessions.'}</p>`}</div><button type="button" data-cm-action="${accepted?'publish':'accept'}" data-cm-mutation>${accepted?'Publish Course':'Accept reviewed sessions'}</button></div>`:''}`;
  }
  function workflow(){
    if(!['DRAFT','PUBLISHED'].includes(state.course.stage))return '';
    if(state.course.stage==='PUBLISHED')return '<p class="cm-published-note">✓ Published Academy timetable</p>';
    const current=state.course.stage!=='DRAFT'?5:state.dirty||!state.course.courseId?0:!state.review?.valid?1:reviewAccepted()?5:3;
    return `<ol class="cm-workflow" aria-label="Course publication steps">${['Draft','Validate','Generate sessions','Review','Accept','Publish'].map((label,index)=>`<li class="${index<current?'is-done':index===current?'is-current':''}"${index===current?' aria-current="step"':''}><span>${index+1}</span>${label}</li>`).join('')}</ol>`;
  }
  function renderEditor(){
    if(!state.course)return;
    const c=state.course,d=state.draft,isDraft=editable();
    const transitions=!c.courseId?[]:c.stage==='PUBLISHED'?[['revise','Create revision'],['complete','Mark complete'],['cancel','Cancel Course']]:c.stage==='DRAFT'?[['cancel','Cancel Course'],['archive','Archive draft']]:c.stage==='COMPLETE'||c.stage==='CANCELLED'?[['archive','Archive Course']]:[];
    if(['COMPLETE','ARCHIVED'].includes(c.stage)&&state.capabilities.create)transitions.push(['repeat','Repeat as new Course']);
    $('course-editor').innerHTML=`<header class="cm-editor-heading"><div><h2>${esc(d.name||'New Course')}</h2><div class="cm-heading-meta">${pill(c.displayStage||c.stage)}${state.dirty?'<small>Unsaved changes</small>':c.courseId?'<small>Saved</small>':'<small>Name required · everything else can wait</small>'}${c.currentPublication&&isDraft?'<small>Current timetable remains published</small>':''}</div></div><div class="cm-actions">${isDraft?`<button type="button" class="pb-secondary" data-cm-action="save" data-cm-mutation>Save draft</button><button type="button" data-cm-action="validate" data-cm-mutation>${d.sessions.length?'Validate &amp; review':'Validate &amp; generate sessions'}</button>`:''}${transitions.length?`<details class="cm-menu"><summary>More ▾</summary><div>${transitions.map(([action,label])=>`<button type="button" data-cm-action="${action}" data-cm-mutation>${label}</button>`).join('')}</div></details>`:''}</div></header>${workflow()}<div class="cm-tabs" role="tablist" aria-label="Course sections">${[['details','Details'],['sessions','Sessions'+(d.sessions.length?' · '+d.sessions.length:'')],['participants','Participants'],['media','Media'],['review','Review & publish']].map(([tab,label])=>`<button id="cm-tab-${tab}" type="button" role="tab" aria-selected="${state.tab===tab}" aria-controls="cm-panel" data-cm-action="tab" data-tab="${tab}">${label}</button>`).join('')}</div><div id="cm-panel" class="cm-tab-content" role="tabpanel" aria-labelledby="cm-tab-${state.tab}">${state.tab==='details'?detailsTab():state.tab==='sessions'?sessionsTab():state.tab==='participants'?peopleTab():state.tab==='media'?mediaTab():reviewTab()}</div><footer class="cm-footer"><span>${c.courseId?`Course ID <span class="cm-id">${esc(c.courseId)}</span>`:'New draft'}</span><span>${c.completedAt?'Completed '+esc(c.completedAt.slice(0,10)):state.personDrafts.size?`${state.personDrafts.size} unsaved participant ${state.personDrafts.size===1?'change':'changes'}`:'All times use the Course timezone'}</span></footer>`;
    if(state.busy)busy(true);
  }
  function dirty(){state.dirty=true;state.review=null;state.pending=null;const indicator=$('course-editor').querySelector('.cm-heading-meta small');if(indicator)indicator.textContent='Unsaved changes';}
  async function list(){const result=await api(base+'list');Object.assign(state,{courses:result.courses,categories:result.categories,teachers:result.teachers,timezone:result.timezone,capabilities:result.capabilities});$('course-new').hidden=!state.capabilities.create;renderList();}
  async function select(courseId,runId,tab='details'){
    const sequence=++state.selection,generation=state.generation;
    const result=await api(base+'get',{courseId,runId});
    if(sequence!==state.selection||generation!==state.generation)return;
    Object.assign(state,{course:result.course,draft:copy(result.course.details),dirty:false,tab,review:result.validation||null,calendarWarnings:result.calendarWarnings,media:result.media,participants:null});state.personDrafts.clear();renderList();renderEditor();
    if(tab==='participants')await loadParticipants();
  }
  async function loadParticipants(){
    if(!state.course?.courseId)return;
    const sequence=state.selection,result=await api(base+'participants',selected());
    if(sequence!==state.selection)return;
    state.participants=result;if(state.tab==='participants')renderEditor();
  }
  async function open(){
    const generation=++state.generation,authToken=token();lock('Checking your Academy account…');$('course-access-retry').hidden=true;
    if(!authToken){lock('Sign in with an authorised Academy administrator account, then open Course management.');return;}
    try{
      const session=await api('/api/account/session',{},authToken);if(generation!==state.generation)return;
      const globalAdmin=session.contexts?.some(c=>c.scope==='PLATFORM'&&c.role==='GLOBAL_ADMIN');
      if(!globalAdmin&&!session.courseManagement){lock('Course management is available to Global Admins and assigned Course Program Admins.');return;}
      state.token=authToken;state.session=session;$('course-account-name').textContent=session.account?.displayName||'';$('course-access-message').textContent='';$('course-workspace').hidden=false;
      $('course-management-back').textContent=globalAdmin?'← Academy administration':'← My Courses';$('course-management-back').href=globalAdmin?'/academy/#administration':'/academy/#workshops';
      await list();if(generation!==state.generation)return;
      const query=new URLSearchParams(location.search),courseId=query.get('course'),runId=query.get('run'),first=state.courses.find(c=>c.courseId===courseId&&(!runId||c.runId===runId))||state.courses.find(c=>!['ARCHIVED','CANCELLED'].includes(c.stage))||state.courses[0];
      if(first)await select(first.courseId,first.runId,query.get('view')==='scheduling'?'sessions':'details');
    }catch(error){if(generation!==state.generation)return;lock(error.message);$('course-access-retry').hidden=false;}
  }
  function newCourse(){state.selection++;state.course={courseId:'',runId:'',stage:'DRAFT',displayStage:'DRAFT',revision:'0'};state.draft={name:'',categoryKey:'',accessModel:'',timezone:state.timezone,weekdays:[],startDate:'',endDate:'',startTime:'',endTime:'',teacherId:'',zoomLink:'',sessions:[]};state.dirty=false;state.review=null;state.participants=null;state.personDrafts.clear();state.media=[];state.calendarWarnings=[];state.tab='details';renderList();renderEditor();$('course-editor').querySelector('[data-field="name"]')?.focus();}
  async function save(){
    if(!state.draft.name.trim()){state.tab='details';renderEditor();$('course-editor').querySelector('[data-field="name"]')?.focus();throw Error('Enter a Course name to save the draft.');}
    const result=await mutate('save',{...selected(),baseRevision:state.course.revision,details:copy(state.draft)}),tab=state.tab;
    Object.assign(state.course,{courseId:result.courseId,runId:result.runId,revision:result.revision,hasDraft:true});state.dirty=false;
    // A draft save does not discard unsaved participant role selections.
    const personDrafts=new Map(state.personDrafts);await list();await select(result.courseId,result.runId,tab);state.personDrafts=personDrafts;if(tab==='participants')renderEditor();return result;
  }
  async function validate(regenerate=false){
    if(state.personDrafts.size)throw Error('Save your participant changes before validating the Course.');
    if(state.dirty||!state.course.courseId||!state.course.hasDraft)await save();
    let result;
    try{result=await mutate('validate',{...selected(),baseRevision:state.course.revision,regenerate});}
    catch(error){if(error.code!=='SCHEDULE_CHANGED')throw error;dialog('Regenerate the sessions?','<p>The schedule in Details has changed. Regenerating fills every session from that schedule and replaces individual session edits. Cancel to keep the existing sessions while you review the schedule.</p>','Regenerate sessions',()=>validate(true));return null;}
    state.course.revision=result.revision;state.course.validationToken=result.validation.valid?result.validation.token:'';state.course.acceptedToken='';state.draft=copy(result.details);state.dirty=false;state.review=result.validation;state.calendarWarnings=result.validation.warnings.filter(w=>w.code==='HOLIDAY');state.tab=result.validation.valid?'sessions':'review';renderEditor();tell(result.message);return result;
  }
  function dialog(title,body,button,onConfirm){
    const el=$('course-dialog');el.innerHTML=`<h2 id="course-dialog-title">${esc(title)}</h2>${body}<div class="cm-actions"><button type="button" class="pb-secondary" data-dialog-cancel>Cancel</button><button type="button" data-dialog-confirm>${esc(button)}</button></div>`;
    el.querySelector('[data-dialog-cancel]').addEventListener('click',()=>el.close());
    el.querySelector('[data-dialog-confirm]').addEventListener('click',()=>{const input={name:el.querySelector('#cm-dialog-name')?.value||'',reuseMedia:Boolean(el.querySelector('#cm-dialog-reuse')?.checked)};el.close();void perform(()=>onConfirm(input));});el.showModal();
  }
  function reviewDiscard(action){if(!hasUnsavedChanges()){void perform(action);return;}dialog('Unsaved changes','<p>Discard your unfinished changes and continue? Saved Course and participant records will be kept.</p>','Discard changes',()=>{state.dirty=false;state.personDrafts.clear();return action();});}
  async function generate(){
    if(state.draft.sessions.length)dialog('Replace the draft sessions?','<p>The Course schedule will be validated and sessions generated from its dates, days, times, teacher and Zoom link. Individual session edits will be replaced.</p>','Regenerate sessions',()=>validate(true));
    else await validate();
  }
  async function savePerson(accountId){
    const account=state.participants.accounts.find(a=>a.accountId===accountId),roles=state.personDrafts.get(accountId);if(!account||!roles)return;
    const result=await mutate('participants-save',{...selected(),accountId,roles,baseRevision:account.assignment.revision,scopeRevision:state.participants.scope.revision});account.assignment=result.assignment;state.personDrafts.delete(accountId);state.review=null;renderEditor();tell('Participant access saved.');
  }
  async function status(stage){
    const result=await mutate('status',{...selected(),baseRevision:state.course.revision,stage}),selection=selected(),tab=stage==='DRAFT'?'details':state.tab;await list();await select(selection.courseId,selection.runId,tab);tell(result.message);
  }
  async function perform(fn){if(state.busy)return;busy(true);try{await fn();}catch(error){tell(error.message+(error.code==='ROW_CHANGED'?' Refresh and review the saved Course. Your unfinished changes are kept.':''),true);}finally{busy(false);if(state.participants)for(const button of document.querySelectorAll('[data-cm-action="save-person"]'))button.disabled=!state.personDrafts.has(button.dataset.account);}}
  async function action(name,el){
    if(name==='select'){reviewDiscard(()=>select(el.dataset.course,el.dataset.run));return;}
    if(name==='tab'){state.tab=el.dataset.tab;renderEditor();if(state.tab==='participants'&&!state.participants)await loadParticipants();return;}
    if(name==='save'){const result=await save();tell(result.message);return;}
    if(name==='validate'){await validate();return;}
    if(name==='accept'){
      if(state.dirty||!state.review?.valid)throw Error('Validate and review the saved sessions before accepting.');
      if(state.review.warnings.length&&!$('course-ack-warnings')?.checked)throw Error('Review and acknowledge the warnings before accepting.');
      const result=await mutate('accept',{...selected(),baseRevision:state.course.revision,validationToken:state.course.validationToken,acknowledgeWarnings:Boolean($('course-ack-warnings')?.checked)});state.course.revision=result.revision;state.course.acceptedToken=result.acceptedToken;renderEditor();tell(result.message);return;
    }
    if(name==='publish'){
      if(!reviewAccepted()||state.personDrafts.size)throw Error('Validate, review and accept the current saved sessions before publishing.');
      const result=await mutate('publish',{...selected(),baseRevision:state.course.revision,validationToken:state.course.validationToken,acknowledgeWarnings:Boolean($('course-ack-warnings')?.checked)}),selection=selected();await list();await select(selection.courseId,selection.runId,'sessions');tell(result.message);return;
    }
    if(name==='generate'){await generate();return;}
    if(name==='add-session'){state.draft.sessions.push({id:'CMSESSION-'+crypto.randomUUID(),date:state.draft.startDate,startTime:state.draft.startTime,endTime:state.draft.endTime,teacherId:state.draft.teacherId,zoomLink:state.draft.zoomLink,title:state.draft.name,status:'SCHEDULED'});dirty();renderEditor();return;}
    if(name==='remove-session'){state.draft.sessions=state.draft.sessions.filter(s=>s.id!==el.dataset.id);dirty();renderEditor();return;}
    if(name==='save-person'){await savePerson(el.dataset.account);return;}
    if(name==='add-user'){
      dialog('Add a user to this Course','<p>The new account will receive Student access to this Course. Use their existing account if they already have one.</p><label class="cm-field">User name<input id="cm-dialog-name" maxlength="160" autocomplete="off"></label>','Add Student',async input=>{
        const result=await mutate('participant-create',{...selected(),displayName:input.name});await loadParticipants();tell(result.message);const el=$('course-dialog');el.innerHTML=`<h2 id="course-dialog-title">User added</h2><p>Give the learner this personal sign-in link. They will set their PIN on first use.</p><label class="cm-field">Personal sign-in link<input readonly value="${esc(location.origin+result.loginPath)}"></label><div class="cm-actions"><button type="button" data-dialog-cancel>Done</button></div>`;el.querySelector('[data-dialog-cancel]').addEventListener('click',()=>el.close());el.showModal();
      });return;
    }
    if(name==='repeat'){
      dialog('Repeat as a new Course','<p>A separate Course ID and an empty participant list will be created. Set new dates before publishing.</p><label class="cm-field">Course name<input id="cm-dialog-name" maxlength="160" value="'+esc(state.draft.name)+'"></label>'+(state.media.length?'<label class="cm-toggle"><input id="cm-dialog-reuse" type="checkbox">Reuse the existing media records</label>':'<p class="cm-hint">No existing media records to reuse.</p>'),'Create new draft',async input=>{const result=await mutate('repeat',{...selected(),baseRevision:state.course.revision,name:input.name,reuseMedia:input.reuseMedia});await list();await select(result.courseId,result.runId);tell(result.message);});return;
    }
    if(['revise','complete','cancel','archive'].includes(name)){
      if(hasUnsavedChanges())throw Error('Save or discard unfinished changes before changing Course status.');
      const target={revise:'DRAFT',complete:'COMPLETE',cancel:'CANCELLED',archive:'ARCHIVED'}[name];
      dialog({revise:'Create a revision?',complete:'Complete this Course?',cancel:'Cancel this Course?',archive:'Archive this Course?'}[name],`<p>${name==='revise'?'The current timetable remains published while you prepare and validate a new draft.':name==='complete'?'This records Course completion. Student assignments and media records are retained. Private media access will be available after its storage is connected.':name==='cancel'?'The Course will be removed from the timetable. Participant and media records will be retained.':'The Course will be kept in the archive with its participants and media. Completed Course access is retained.'}</p>`,{revise:'Create revision',complete:'Mark complete',cancel:'Cancel Course',archive:'Archive Course'}[name],()=>status(target));
    }
  }
  function input(event){
    const el=event.target;
    if(el.dataset.field&&editable()){state.draft[el.dataset.field]=el.value;dirty();}
    if(el.dataset.day!==undefined&&editable()){const day=Number(el.dataset.day);state.draft.weekdays=state.draft.weekdays.filter(d=>d!==day);if(el.checked)state.draft.weekdays.push(day);dirty();}
    if(el.dataset.session&&editable()){const row=state.draft.sessions.find(s=>s.id===el.dataset.session);if(row){row[el.dataset.sessionField]=el.value;dirty();}}
    if(el.dataset.person){const account=state.participants.accounts.find(a=>a.accountId===el.dataset.person);let roles=[...(state.personDrafts.get(account.accountId)||account.assignment.roles)].filter(r=>r!==el.dataset.role);if(el.checked)roles.push(el.dataset.role);roles=['STUDENT','TEACHER','PROGRAM_ADMIN'].filter(r=>roles.includes(r));if(JSON.stringify(roles)===JSON.stringify(account.assignment.roles))state.personDrafts.delete(account.accountId);else state.personDrafts.set(account.accountId,roles);const button=$('course-editor').querySelector(`[data-account="${account.accountId}"]`);if(button)button.disabled=!state.personDrafts.has(account.accountId);}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('course-access-retry').addEventListener('click',()=>{void open();});
    $('course-new').addEventListener('click',()=>reviewDiscard(newCourse));
    $('course-refresh').addEventListener('click',()=>reviewDiscard(async()=>{const current=selected(),tab=state.tab;await list();if(current.courseId)await select(current.courseId,current.runId,tab);tell('Courses refreshed.');}));
    $('course-search').addEventListener('input',renderList);$('course-status-filter').addEventListener('change',renderList);
    document.addEventListener('click',event=>{const el=event.target.closest?.('[data-cm-action]');if(!el)return;event.preventDefault();if(state.busy)return;if(el.dataset.cmAction==='select'){void action('select',el);return;}void perform(()=>action(el.dataset.cmAction,el));});
    document.addEventListener('input',event=>{if(event.target.id==='course-people-search'){state.peopleSearch=event.target.value;const start=event.target.selectionStart;renderEditor();const search=$('course-people-search');search.focus();search.setSelectionRange(start,start);return;}if(event.target.type!=='checkbox'&&event.target.tagName!=='SELECT')input(event);});
    document.addEventListener('change',event=>{if(event.target.id==='course-assigned-only'){state.assignedOnly=event.target.checked;renderEditor();return;}if(event.target.type==='checkbox'||event.target.tagName==='SELECT')input(event);});
    void open();
  });
  function sessionChanged(){if(token()===state.token&&state.session)return;++state.generation;lock('Your Academy account changed. Return to Academy home and open Course management again.');}
  window.addEventListener('storage',e=>{if(e.key==='m4l_account_token'||e.key===null)sessionChanged();});window.addEventListener('m4l-academy-session',sessionChanged);
  window.addEventListener('pageshow',e=>{if(e.persisted){sessionChanged();if(state.session&&!hasUnsavedChanges())void open();}});
  window.addEventListener('beforeunload',e=>{if(hasUnsavedChanges()){e.preventDefault();e.returnValue='';}});
  window.M4LCourses={open,select,newCourse,save,validate,hasUnsavedChanges};
})();
