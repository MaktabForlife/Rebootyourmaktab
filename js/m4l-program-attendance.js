(()=>{'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state={programs:[],id:'',accountPath:'',data:null,busy:false,pending:null,selection:new Map(),draft:new Map()};
  const pendingKey=id=>`m4l-program-attendance-pending:${id}`;
  const message=(value,error=false)=>{$('pa-message').textContent=value;$('pa-message').classList.toggle('is-error',error);};
  async function api(path,body={}){
    const token=localStorage.getItem('m4l_account_token');
    if(!token)throw Error('Sign in through your personal Academy account link first.');
    const response=await fetch(`${String(window.M4L_CONFIG?.API_BASE||'').replace(/\/$/,'')}/api/${path}`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
    let result;try{result=await response.json();}catch{throw Error('The response could not be read. Retry the same submission.');}
    if(!response.ok||!result.success)throw Object.assign(Error(result.error||'Attendance could not be saved.'),{status:response.status,retryable:result.retryable});
    return result;
  }
  const attendance=(action,body={})=>api(`program-attendance/${action}`,{id:state.id,...body});
  const lessonName=row=>row.lesson.moduleName||row.lesson.subjectName||'Lesson';
  const rowsFor=(classId)=>{
    const rows=state.data?.lessons.filter(row=>row.lesson.classId===classId)||[];
    const selected=state.selection.get(classId)||'ALL';
    return selected==='ALL'?rows:rows.filter(row=>row.lesson.anchor===selected);
  };
  const markValue=(row,mark)=>state.draft.get(`${row.lesson.anchor}|${mark.accountId}`)||mark.status||'PRESENT';
  function render(){
    $('pa-home').href=state.accountPath||'#';
    $('pa-account').href=state.accountPath||'#';
    $('pa-library').hidden=!state.id;
    $('pa-library').href=state.id?`/programs/library-view.html?program=${encodeURIComponent(state.id)}`:'#';
    $('pa-programs').innerHTML=state.programs.map(row=>`<button type="button" data-program="${esc(row.id)}" aria-pressed="${row.id===state.id}">${esc(row.name)}</button>`).join('');
    $('pa-pending').hidden=!state.pending;
    const data=state.data;
    $('pa-workspace').hidden=!data;
    if(!data)return;
    $('pa-title').textContent=`${data.program.name} attendance`;
    $('pa-date').max=data.today;$('pa-date').value=data.date;
    $('pa-prepare').hidden=data.prepared||!data.canPrepare;
    $('pa-prepare').disabled=state.busy;
    if(!data.prepared){$('pa-completion').textContent='Attendance storage needs preparation.';$('pa-classes').innerHTML='';$('pa-summary').innerHTML='';return;}
    $('pa-completion').textContent=data.scheduledLessons?
      `${data.submittedLessons} of ${data.scheduledLessons} class lesson registers submitted · ${data.complete?'Complete':'Incomplete'}`:
      'No published lessons scheduled for this date.';
    $('pa-classes').innerHTML=(data.classes||[]).map(klass=>{
      const rows=data.lessons.filter(row=>row.lesson.classId===klass.id);
      const choice=state.selection.get(klass.id)||'ALL';
      const selected=choice==='ALL'?rows:rows.filter(row=>row.lesson.anchor===choice);
      const learners=new Map();
      for(const row of selected)for(const mark of row.marks){
        if(!learners.has(mark.accountId))learners.set(mark.accountId,{name:mark.name,statuses:new Set()});
        learners.get(mark.accountId).statuses.add(markValue(row,mark));
      }
      const canSave=selected.some(row=>row.submitted||data.date===data.today);
      const options=[`<option value="ALL" ${choice==='ALL'?'selected':''}>All lessons</option>`,
        ...rows.map(row=>`<option value="${esc(row.lesson.anchor)}" ${choice===row.lesson.anchor?'selected':''}>${esc(lessonName(row))} · ${esc(row.lesson.startTime)}–${esc(row.lesson.endTime)}</option>`)].join('');
      const marks=[...learners].sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([accountId,learner])=>{
        const values=[...learner.statuses],value=values.length===1?values[0]:'MIXED';
        return `<li><strong>${esc(learner.name)}</strong><select data-mark data-class="${esc(klass.id)}" data-account="${esc(accountId)}" aria-label="${esc(learner.name)} attendance in ${esc(klass.name)}" ${state.busy||state.pending?'disabled':''}>${value==='MIXED'?'<option value="MIXED" selected>Mixed · keep</option>':''}<option value="PRESENT" ${value==='PRESENT'?'selected':''}>Present</option><option value="ABSENT" ${value==='ABSENT'?'selected':''}>Absent</option><option value="EXCUSED" ${value==='EXCUSED'?'selected':''}>Excused</option></select></li>`;
      }).join('');
      const status=selected.map(row=>`<span class="${row.submitted?'pa-submitted':'pa-unknown'}">${esc(lessonName(row))}: ${row.submitted?'Submitted':'Not submitted · unknown'}</span>`).join('');
      return `<section class="pa-class"><h2>${esc(klass.name)}</h2><label class="pa-lesson-label">Lesson<select data-lesson data-class="${esc(klass.id)}" ${state.busy||state.pending?'disabled':''}>${options}</select></label><button class="pa-submit" data-submit="${esc(klass.id)}" type="button" ${state.busy||state.pending||!canSave?'disabled':''}>${selected.some(row=>row.submitted)?'Submit attendance changes':'Submit attendance'}</button><p class="pa-register-state">${status}</p><ul class="pa-learners">${marks||'<li class="pa-empty">No learners in this selection.</li>'}</ul></section>`;
    }).join('')||'<p class="pa-empty">No classes are assigned to you for this Program.</p>';
    $('pa-summary').innerHTML=data.learners.length?`<ul>${data.learners.map(row=>`<li><span>${esc(row.name)}</span><strong>${esc(row.status==='UNKNOWN'?'Unknown':row.status[0]+row.status.slice(1).toLowerCase())}</strong></li>`).join('')}</ul>`:'<p>No learners have a scheduled or submitted lesson in this view.</p>';
  }
  async function load(date){
    state.busy=true;message('Loading attendance…');render();
    try{
      const data=await attendance('get',date?{date}:{});
      if(!Array.isArray(data.classes))throw Error('Attendance is updating. Refresh in a moment.');
      state.data=data;render();message(data.complete?'All visible class registers are submitted.':'Choose a lesson, mark exceptions, then submit attendance.');
    }catch(error){message(error.message,true);}
    finally{state.busy=false;render();}
  }
  function chooseProgram(id){
    if(state.busy||id===state.id)return;
    state.id=id;state.data=null;state.selection.clear();state.draft.clear();
    try{state.pending=JSON.parse(sessionStorage.getItem(pendingKey(id))||'null');}catch{state.pending=null;}
    history.replaceState(null,'',`/programs/attendance.html?program=${encodeURIComponent(id)}`);
    render();load();
  }
  function submission(classId){
    const rows=rowsFor(classId),selected=state.data.date===state.data.today?rows:rows.filter(row=>row.submitted);
    const exceptions={},baseRegisterIds={};
    for(const row of selected){
      baseRegisterIds[row.lesson.anchor]=row.registerId||'';
      exceptions[row.lesson.anchor]=row.marks.flatMap(mark=>{
        const status=markValue(row,mark);return status==='PRESENT'?[]:[{accountId:mark.accountId,status}];
      });
    }
    const choice=state.selection.get(classId)||'ALL';
    return {date:state.data.date,classId,scope:choice==='ALL'?'day':'lesson',...(choice==='ALL'?{}:{anchor:choice}),
      exceptions,baseRegisterIds,operationId:crypto.randomUUID()};
  }
  async function save(payload){
    state.pending=payload;sessionStorage.setItem(pendingKey(state.id),JSON.stringify(payload));
    state.busy=true;render();message('Submitting attendance…');
    try{
      const result=await attendance('submit',payload);
      state.pending=null;sessionStorage.removeItem(pendingKey(state.id));
      for(const anchor of Object.keys(payload.exceptions))for(const key of state.draft.keys())if(key.startsWith(`${anchor}|`))state.draft.delete(key);
      await load(payload.date);
      message(`${result.submittedLessons} submitted, ${result.editedLessons||0} updated.`);
    }catch(error){
      if(error.status&&error.status<500&&error.retryable!==true){state.pending=null;sessionStorage.removeItem(pendingKey(state.id));}
      message(error.message,true);
    }finally{state.busy=false;render();}
  }
  $('pa-programs').addEventListener('click',event=>{const id=event.target.closest('[data-program]')?.dataset.program;if(id)chooseProgram(id);});
  $('pa-classes').addEventListener('change',event=>{
    if(event.target.matches('[data-lesson]')){state.selection.set(event.target.dataset.class,event.target.value);render();return;}
    if(event.target.matches('[data-mark]')){
      const classId=event.target.dataset.class,accountId=event.target.dataset.account;
      for(const row of rowsFor(classId))if(row.marks.some(mark=>mark.accountId===accountId))
        state.draft.set(`${row.lesson.anchor}|${accountId}`,event.target.value);
    }
  });
  $('pa-classes').addEventListener('click',event=>{const classId=event.target.closest('[data-submit]')?.dataset.submit;if(classId)save(submission(classId));});
  $('pa-refresh').addEventListener('click',()=>load($('pa-date').value));
  $('pa-date').addEventListener('change',event=>{state.draft.clear();state.selection.clear();load(event.target.value);});
  $('pa-retry').addEventListener('click',()=>state.pending&&save(state.pending));
  $('pa-prepare').addEventListener('click',async()=>{state.busy=true;render();try{await attendance('prepare');await load(state.data?.date);message('Attendance storage is ready.');}catch(error){message(error.message,true);}finally{state.busy=false;render();}});
  (async()=>{
    message('Loading Programs…');
    try{
      const result=await api('program-library/available');
      state.programs=(result.programs||[]).filter(row=>row.role!=='STUDENT');
      state.accountPath=result.accountPath||'';
      if(!state.programs.length){message('No teaching Programs are available to your account.');render();return;}
      const requested=new URLSearchParams(location.search).get('program');
      state.id=state.programs.find(row=>row.id===requested)?.id||state.programs[0].id;
      try{state.pending=JSON.parse(sessionStorage.getItem(pendingKey(state.id))||'null');}catch{}
      render();await load();
    }catch(error){message(error.message,true);}
  })();
})();
