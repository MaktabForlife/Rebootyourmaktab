(()=>{'use strict';
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const id=new URLSearchParams(location.search).get('program'),pendingKey=`m4l-program-attendance-pending:${id}`;
  const state={data:null,busy:false,pending:null,draft:new Map()};
  try{state.pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');}catch{}
  const message=(value,error=false)=>{$('pa-message').textContent=value;$('pa-message').classList.toggle('is-error',error);};
  async function api(action,body={}){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw Error('Sign in through your personal Academy account link first.');
    const response=await fetch(`${String(window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')}/api/program-attendance/${action}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id,...body})});
    let result;try{result=await response.json();}catch{throw Error('The response could not be read. Retry the same submission.');}
    if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Attendance could not be saved.'),{status:response.status,retryable:result.retryable});
    return result;
  }
  function draftFromScreen(){
    for(const select of $('pa-lessons').querySelectorAll('select[data-mark]'))state.draft.set(`${select.dataset.anchor}|${select.dataset.account}`,select.value);
  }
  function render(){
    const data=state.data;if(!data)return;
    $('pa-workspace').hidden=false;$('pa-pending').hidden=!state.pending;
    $('pa-title').textContent=`${data.program.name} attendance`;
    $('pa-date').max=data.today;$('pa-date').value=data.date;
    $('pa-prepare').hidden=data.prepared||!data.canPrepare;
    $('pa-prepare').disabled=state.busy;
    $('pa-submit-day').disabled=state.busy||Boolean(state.pending)||data.date!==data.today||!data.prepared||!data.lessons.some(row=>!row.submitted);
    $('pa-submit-day').textContent=data.scope==='ASSIGNED'?'Submit all my lessons':'Submit all lessons';
    if(!data.prepared){$('pa-completion').textContent='Attendance storage needs preparation.';$('pa-lessons').innerHTML='';$('pa-summary').innerHTML='';return;}
    $('pa-completion').textContent=data.lessons.length?`${data.submittedLessons} of ${data.scheduledLessons} lesson registers submitted${data.complete?' · Complete':' · Incomplete'}`:'No published lessons scheduled for this date.';
    $('pa-lessons').innerHTML=data.lessons.map(({lesson,submitted,marks,submittedAt})=>`<section class="pa-lesson"><h2>${esc(lesson.moduleName||lesson.subjectName)}</h2><p class="pa-meta">${esc(lesson.startTime)}–${esc(lesson.endTime)} · ${esc(lesson.classNames.join(', '))} · ${esc((lesson.teacherNames||[lesson.teacherName].filter(Boolean)).join(', ')||'Unassigned teacher')}</p><p>${submitted?`<span class="pa-submitted">Submitted ${esc(submittedAt)}</span>`:'<span class="pa-unknown">Not submitted · results unknown</span>'}</p><div class="pa-table-wrap"><table class="pa-table"><thead><tr><th>Learner</th><th>Lesson result</th></tr></thead><tbody>${marks.map(mark=>{const value=submitted?mark.status:state.draft.get(`${lesson.anchor}|${mark.accountId}`)||'PRESENT';return `<tr><td>${esc(mark.name)}</td><td><select data-mark data-anchor="${esc(lesson.anchor)}" data-account="${esc(mark.accountId)}" ${submitted||data.date!==data.today||state.busy||state.pending?'disabled':''}><option value="PRESENT" ${value==='PRESENT'?'selected':''}>Present</option><option value="ABSENT" ${value==='ABSENT'?'selected':''}>Absent</option><option value="EXCUSED" ${value==='EXCUSED'?'selected':''}>Excused</option></select></td></tr>`;}).join('')||`<tr><td colspan="2">${data.date!==data.today&&!submitted?'Historical roster unknown; no register was submitted.':'No enrolled learners for this lesson.'}</td></tr>`}</tbody></table></div>${submitted||data.date!==data.today?'':`<button type="button" data-submit="${esc(lesson.anchor)}" ${state.busy||state.pending?'disabled':''}>Submit this lesson</button>`}</section>`).join('')||'<p class="pa-empty">Choose another date or publish a timetable with lessons for this date.</p>';
    $('pa-summary').innerHTML=data.learners.length?`<ul>${data.learners.map(row=>`<li><span>${esc(row.name)}</span><strong>${esc(row.status==='UNKNOWN'?'Unknown':row.status[0]+row.status.slice(1).toLowerCase())}</strong></li>`).join('')}</ul>`:'<p>No learners have a submitted or scheduled lesson in this view.</p>';
  }
  async function load(date){
    if(state.data)draftFromScreen();state.busy=true;message('Loading attendance…');
    try{state.data=await api('get',date?{date}:{});render();message(state.data.complete?'All lesson registers are submitted.':'Mark exceptions, then submit the register.');}
    catch(error){message(error.message,true);}
    finally{state.busy=false;render();}
  }
  function submission(scope,anchor){
    draftFromScreen();const exceptions={};
    for(const row of state.data.lessons){
      if(row.submitted||scope==='lesson'&&row.lesson.anchor!==anchor)continue;
      exceptions[row.lesson.anchor]=row.marks.flatMap(mark=>{const status=state.draft.get(`${row.lesson.anchor}|${mark.accountId}`)||'PRESENT';return status==='PRESENT'?[]:[{accountId:mark.accountId,status}];});
    }
    return {date:state.data.date,scope,...(scope==='lesson'?{anchor}:{}),exceptions,operationId:crypto.randomUUID()};
  }
  async function save(payload){
    state.pending=payload;sessionStorage.setItem(pendingKey,JSON.stringify(payload));state.busy=true;render();message('Submitting attendance…');
    try{const result=await api('submit',payload);state.pending=null;sessionStorage.removeItem(pendingKey);state.draft.clear();await load(payload.date);message(`${result.submittedLessons} lesson register${result.submittedLessons===1?'':'s'} submitted.`);}
    catch(error){if(error.status&&error.status<500&&error.retryable!==true){state.pending=null;sessionStorage.removeItem(pendingKey);}message(error.message,true);}
    finally{state.busy=false;render();}
  }
  $('pa-refresh').addEventListener('click',()=>load($('pa-date').value));
  $('pa-date').addEventListener('change',event=>{state.draft.clear();load(event.target.value);});
  $('pa-submit-day').addEventListener('click',()=>save(submission('day')));
  $('pa-lessons').addEventListener('click',event=>{const anchor=event.target.closest('[data-submit]')?.dataset.submit;if(anchor)save(submission('lesson',anchor));});
  $('pa-retry').addEventListener('click',()=>state.pending&&save(state.pending));
  $('pa-prepare').addEventListener('click',async()=>{state.busy=true;render();try{await api('prepare');await load(state.data?.date);message('Attendance storage is ready.');}catch(error){message(error.message,true);}finally{state.busy=false;render();}});
  if(!id)message('Open attendance from a Program link.',true);else load();
})();
