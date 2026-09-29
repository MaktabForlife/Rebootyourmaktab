/* V105.3.2 — preserve drafts, recover interrupted saves and review genuine conflicts. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const programId=new URLSearchParams(location.search).get('program'),storageKey=`m4l-management-pending:${programId}`;
  const active=value=>value===true||String(value).toUpperCase()==='TRUE';
  const defs={
    subjects:{label:'Subjects',singular:'subject',key:'ProgramSubjectID',prefix:'PS',columns:[['SubjectID','Academy subject','subject'],['Active','Status','active']],help:'Choose an Academy subject or create a new name. Levels and modules belong to this Program.'},
    levels:{label:'Levels',singular:'level',key:'LevelID',prefix:'LVL',columns:[['ProgramSubjectID','Subject','programSubject'],['Name','Level name'],['SortOrder','Order','number'],['Active','Status','active']],help:'Levels are optional and belong to a subject within this Program. They do not represent academic years.'},
    modules:{label:'Modules',singular:'module',key:'ProgramModuleID',prefix:'MOD',columns:[['ProgramSubjectID','Subject','programSubject'],['LevelID','Level (optional)','level'],['Name','Module name'],['SortOrder','Order','number'],['Active','Availability','active']],help:'Choose an optional standard level and record progress separately for each class. Marking one class Completed keeps the module available to other classes. Assign teachers in the timetable.'},
    progress:{label:'Module progress',singular:'class status',key:'ProgressID',prefix:'MP',columns:[['ProgramModuleID','Module','module'],['ClassID','Class','class'],['Status','Class status','progress']],help:'Track each class separately: Active = studying, Inactive = not currently studying, Completed = finished. Completing a module for one class does not change its availability or timetable.'},
    classes:{label:'Classes',singular:'class',key:'ClassID',prefix:'CLS',columns:[['Name','Class name'],['AcademicYear','Academic year (optional)'],['Active','Status','active']],help:'Create classes such as Year 1 and Year 2. They can learn a module together in one timetable lesson.'},
    teachers:{label:'Teachers',singular:'teacher',key:'AccountID',columns:[['AccountID','Teacher','teacher'],['Active','Assignment','active']],help:'Choose users with an active Teacher, Senior or Admin role in this Program. Program assignments do not grant roles.'},
    enrollments:{label:'Class memberships',singular:'class membership',key:'EnrollmentID',prefix:'ENR',columns:[['AccountID','User','account'],['ClassID','Class','class'],['StartDate','From','date'],['EndDate','Through (optional)','date'],['Active','Status','active']],help:'Set inclusive membership dates. A blank end date means ongoing membership. These dates support learner-clash checks.'}
  };
  const tabs=[['overview','Overview'],['modules','Modules'],['subjects','Subjects'],['classes','Classes'],['profiles','User profiles']];
  const tabKind=kind=>({progress:'modules',levels:'modules',enrollments:'profiles',teachers:'profiles'})[kind]||kind;
  const state={data:null,kind:'subjects',overview:true,timetable:null,preview:null,timetableError:false,edit:null,busy:false,pending:null,search:'',importPreview:null,importPending:null,expanded:new Set(),refreshWaiting:false,refreshTimer:null,profileAccountId:null};
  const message=(text,error=false)=>{$('pm-message').textContent=text;$('pm-message').classList.toggle('is-error',error);};
  async function api(action,body={},shared=false){
    const token=localStorage.getItem('m4l_account_token');if(!token)throw Object.assign(new Error('Sign in through your personal Academy account link, then open Programs.'),{status:401,retryable:false});
    const response=await fetch(`${window.M4L_CONFIG?.API_BASE||''}/api/admin/platform/${shared?`academy-subjects/${action}`:`program-timetable/${action}`}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(shared?body:{id:programId,...body})});
    let result;try{result=await response.json();}catch{throw new Error('The response could not be read. Your edits are kept.');}
    if(!response.ok||!result.success)throw Object.assign(new Error(result.error||'The change could not be confirmed.'),{status:response.status,code:result.code,currentRecord:result.currentRecord,rowRevision:result.rowRevision,retryable:result.retryable,retryAfterMs:result.retryAfterMs,reference:result.reference});return result;
  }
  function controls(){
    const locked=state.busy||Boolean(state.pending)||Boolean(state.importPending),editable=state.data?.prepared&&state.data?.coordinatorAvailable&&state.data?.program.status==='DRAFT';
    $('pm-editor').disabled=locked||!editable||Boolean(state.edit&&!visibleEdit());
    $('pm-add').disabled=locked||!editable||Boolean(state.edit);
    $('pm-prepare').disabled=locked;
    $('pm-reload').disabled=state.busy;$('pm-recover').disabled=state.busy;$('pm-retry').disabled=state.busy;
    $('pm-import-preview').disabled=locked||!editable||Boolean(state.edit);
    $('pm-import-save').disabled=state.busy||Boolean(state.pending)||Boolean(state.edit)||!editable||(!state.importPreview&&!state.importPending);
    $('pm-import-save').textContent=state.importPending?'Retry same import':'Import and add to this Program';
    $('pm-catalogue-recover').disabled=state.busy;
    $('pm-import-list').disabled=locked;
    $('pm-pending').hidden=!state.pending;renderConflict();
    const otherDraft=Boolean(state.edit&&!visibleEdit())||Boolean(state.importPending&&state.kind!=='subjects');
    $('pm-draft-notice').hidden=!otherDraft;
    $('pm-draft-text').textContent=state.edit?`Your ${defs[state.edit.kind||state.kind].singular} entry is kept. You can browse other sections; return to finish it before editing another row.`:'Your subject import is pending. You can browse other sections; return to Subjects to finish it.';
    $('pm-return').disabled=state.busy;
    $('pm-overview').querySelectorAll('button').forEach(button=>{button.disabled=locked||!editable||Boolean(state.edit);});
    // A quota cooldown pauses network actions, while browsing and typing stay available.
    if(state.refreshWaiting){
      for(const id of ['pm-reload','pm-recover','pm-retry','pm-prepare','pm-import-preview','pm-import-save','pm-catalogue-recover','pm-use-mine','pm-use-saved'])$(id).disabled=true;
    }
    $('pm-rows').querySelectorAll('[data-save]').forEach(button=>{button.disabled=locked||state.refreshWaiting;});
    $('pm-rows').querySelectorAll('[data-progress-module]').forEach(button=>{button.disabled=locked||!editable||Boolean(state.edit);});
    $('pm-profiles-back').disabled=state.busy;
  }
  async function work(fn){if(state.busy||state.refreshWaiting)return;state.busy=true;controls();try{await fn();}catch(error){message(error.message,true);}finally{state.busy=false;controls();}}
  function choices(type,row){const data=state.data;
    if(type==='progress')return [{id:'ACTIVE',name:'Active'},{id:'INACTIVE',name:'Inactive'},{id:'COMPLETED',name:'Completed'}];
    if(type==='module')return data.rows.modules.map(r=>({id:r.ProgramModuleID,name:`${choices('programSubject',row).find(s=>s.id===r.ProgramSubjectID)?.name||'Subject'} · ${r.Name}`,active:r.Active}));
    if(type==='active')return [{id:'true',name:'Active'},{id:'false',name:'Archived'}];
    if(type==='subject')return data.sharedSubjects.filter(r=>!r.Legacy||r.SubjectID===row.SubjectID).slice().sort((a,b)=>a.SubjectName.localeCompare(b.SubjectName)).map(r=>({id:r.SubjectID,name:r.SubjectName+(r.Legacy?' — Review needed':''),active:r.Active}));
    if(type==='programSubject')return data.rows.subjects.map(r=>({id:r.ProgramSubjectID,name:data.sharedSubjects.find(s=>s.SubjectID===r.SubjectID)?.SubjectName||r.SubjectID,active:active(r.Active)&&data.sharedSubjects.some(s=>s.SubjectID===r.SubjectID&&active(s.Active))}));
    if(type==='level'){
      const levels=data.rows.levels.filter(r=>r.ProgramSubjectID===row.ProgramSubjectID);
      const values=(data.standardLevels||['Beginner','Intermediate','Advanced']).map(name=>{const level=levels.find(r=>active(r.Active)&&String(r.Name||'').trim().toLowerCase()===name.toLowerCase());return {id:row.LevelID===`standard:${name}`?row.LevelID:level?.LevelID||`standard:${name}`,name};});
      const previous=levels.find(r=>r.LevelID===row.LevelID);
      if(previous&&!values.some(v=>v.id===previous.LevelID))values.push({id:previous.LevelID,name:`${previous.Name} — existing level`,active:previous.Active});
      return values;
    }
    if(type==='teacher')return data.accounts.filter(r=>(data.eligibleTeacherIds||[]).includes(r.AccountID)||r.AccountID===row.AccountID).map(r=>({id:r.AccountID,name:r.DisplayName+((data.eligibleTeacherIds||[]).includes(r.AccountID)?'':' — role required'),active:active(r.Active)&&(data.eligibleTeacherIds||[]).includes(r.AccountID)}));
    if(type==='account')return data.accounts.map(r=>({id:r.AccountID,name:r.DisplayName,active:r.Active}));
    if(type==='class')return data.rows.classes.filter(r=>state.kind!=='progress'||!state.edit?.creating||!data.rows.progress.some(p=>p.ProgramModuleID===row.ProgramModuleID&&p.ClassID===r.ClassID)).map(r=>({id:r.ClassID,name:r.Name,active:r.Active}));
    return null;
  }
  function display(row,[key,label,type]){if(type==='level'&&!row.LevelID)return 'No level';const values=choices(type,row);return values?values.find(v=>v.id===String(key==='Active'?active(row[key]):row[key]))?.name||row[key]||'—':row[key]===undefined||row[key]===null||row[key]===''?'—':row[key];}
  function cell(row,col){const [key,label,type]=col,values=choices(type,row),value=key==='Active'?String(active(row[key])):String(row[key]??'');
    const fixed=(state.kind==='enrollments'&&key==='AccountID'&&Boolean(state.profileAccountId))||!state.edit.creating&&((state.kind==='progress'&&['ProgramModuleID','ClassID'].includes(key))||(state.kind==='subjects'&&key==='SubjectID'&&!state.data.sharedSubjects.find(s=>s.SubjectID===state.edit.originalSubjectID)?.Legacy)||(state.kind==='teachers'&&key==='AccountID'));
    if(values){let available=values.filter(v=>v.active===undefined||active(v.active)||v.id===value);if(type==='subject'&&!fixed)available.push({id:'__new__',name:'＋ Create a new subject…'});if(value&&!available.some(v=>v.id===value))available.push({id:value,name:`Unavailable: ${value}`});
      return `<select data-field="${key}" aria-label="${esc(label)}" ${fixed?'disabled':''}>${['active','progress'].includes(type)?'':`<option value="">${type==='level'?'No level':'Choose…'}</option>`}${available.map(v=>`<option value="${esc(v.id)}" ${v.id===value?'selected':''}>${esc(v.name)}${v.active!==undefined&&!active(v.active)?' (inactive)':''}</option>`).join('')}</select>${type==='subject'&&value==='__new__'?`<label class="pm-new-subject">New subject name<input data-field="NewSubjectName" aria-label="New subject name" maxlength="160" placeholder="For example, Tafseer" value="${esc(row.NewSubjectName||'')}"></label>`:''}`;
    }
    return `<input data-field="${key}" aria-label="${esc(label)}" type="${type==='date'?'date':type==='number'?'number':'text'}" value="${esc(value)}" ${type==='number'?'min="0" max="9999" step="1"':'maxlength="160"'}>`;
  }
  function progressClasses(row){
    if(!row.classProgress.length)return '<span class="pm-muted">Not scheduled</span>';
    return row.classProgress.map(c=>`<div class="pm-class-progress"><span>${esc(c.name)}</span><button type="button" class="pb-secondary pm-progress-status ${c.status==='COMPLETED'?'is-completed':''}" data-progress-module="${esc(row.moduleId)}" data-progress-class="${esc(c.id)}" aria-label="${esc(c.name)}: ${esc(c.label)} — update module status">${esc(c.label)}</button></div>`).join('');
  }
  function renderOverview(){
    const records=window.M4L_PROGRAM_OVERVIEW.build(state.data,state.timetable,state.preview),search=state.search.trim().toLowerCase();
    const filtered=records.filter(r=>[r.subject,r.level,r.module,...r.classProgress.map(c=>c.label),...r.classes,...r.teachers,...r.learners.map(l=>l.name)].some(value=>value.toLowerCase().includes(search)));
    const subjects=window.M4L_PROGRAM_OVERVIEW.group(filtered);
    const list=(values,empty)=>values.length?values.map(v=>`<span class="pm-tag">${esc(v)}</span>`).join(' '):`<span class="pm-muted">${empty}</span>`;
    const disclosure=(key,title,counts,body,type)=>`<details class="pm-rollup pm-rollup-${type}" data-rollup="${esc(key)}" ${state.expanded.has(key)?'open':''}><summary><strong class="pm-rollup-name">${esc(title)}</strong>${type==='subject'?`<span class="pm-summary-count">${counts.levels}<span class="pb-sr-only"> levels</span></span><span class="pm-summary-count">${counts.modules}<span class="pb-sr-only"> modules</span></span>`:`<span class="pm-muted">${counts.modules} ${counts.modules===1?'module':'modules'}</span>`}</summary><div class="pm-rollup-content">${body}</div></details>`;
    const add=(subject,level='')=>`<button type="button" class="pb-secondary" data-module-add="${esc(subject)}" data-level="${esc(level)}">Add module</button>`;
    const moduleTable=(rows,caption)=>rows.length?`<div class="pm-scroll pm-module-scroll" tabindex="0" aria-label="${esc(caption)}; scroll horizontally for more columns"><table class="pm-grid pm-overview-grid pm-module-grid" role="table"><caption class="pb-sr-only">${esc(caption)}</caption><thead><tr>${['Module','Classes','Teachers','Learners','Actions'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr class="${row.archived?'pm-archived':''}"><td data-label="Module"><strong>${esc(row.module)}</strong>${row.archived?'<small class="pm-muted">Archived</small>':''}</td><td data-label="Classes">${state.timetableError&&!row.classProgress.length?'Unavailable':progressClasses(row)}</td><td data-label="Teachers">${state.timetableError?'Unavailable':list(row.teachers,'Not assigned')}</td><td data-label="Learners">${!row.rosterReady?'Unavailable':row.learners.length?`<details><summary>${row.learners.length} ${row.learners.length===1?'learner':'learners'}</summary><ul>${row.learners.map(l=>`<li>${esc(l.name)}</li>`).join('')}</ul></details>`:row.hasLessons?'0 learners':'Not scheduled'}</td><td data-label="Actions"><button type="button" class="pb-secondary" data-module-edit="${esc(row.moduleId)}">Edit module</button><button type="button" class="pb-secondary" data-progress-module="${esc(row.moduleId)}">Class status</button><a href="${esc($('pm-timetable').href)}">Timetable →</a></td></tr>`).join('')}</tbody></table></div>`:'';
    $('pm-count').textContent=search?`${subjects.length} subjects · ${filtered.length} matching rows`:`${subjects.length} subjects · ${records.filter(r=>r.moduleId).length} modules`;
    $('pm-help').textContent='Expand a subject or level to see its module rows. Modules without a level appear directly under their subject. Class status and learner counts reflect the saved timetable.';
    const warning=state.timetableError?`<p class="pb-refresh-warning">Curriculum records are available, but timetable details could not be refreshed. ${esc(state.timetableError.error||'Use Refresh records to try again.')}</p>`:state.preview?.issues?.length?'<p class="pb-refresh-warning">Resolve timetable validation issues to see learner counts.</p>':'';
    $('pm-overview').innerHTML=warning+(subjects.length?'<div class="pm-overview-head" aria-hidden="true"><span>Subject</span><span>Levels</span><span>Modules</span></div>':'')+subjects.map(subject=>{
      const modules=subject.rows.filter(r=>r.moduleId),body=subject.levels.map(level=>disclosure(`level:${subject.id}:${level.id}`,level.name,{modules:level.rows.filter(r=>r.moduleId).length},moduleTable(level.rows.filter(r=>r.moduleId),`${subject.name} · ${level.name} modules`)||`<p class="pm-muted">No modules yet.</p>${!level.rows[0].archived?add(subject.id,level.id):''}`,'level')).join('')+moduleTable(subject.modules,`${subject.name} modules without a level`);
      return disclosure(`subject:${subject.id}`,subject.name,{levels:subject.levels.length,modules:modules.length},body||`<p class="pm-muted">No levels or modules yet.</p>${!subject.rows[0].archived?add(subject.id):''}`,'subject');
    }).join('')||'<p class="pm-empty">No matching subjects. Use Subjects to add names, then add modules.</p>';
  }
  function visibleEdit(){return !state.overview&&state.edit&&(state.edit.kind||state.kind)===state.kind?state.edit:null;}
  function beginProgress(moduleId,classId=''){
    if(!classId&&!state.data.rows.classes.some(c=>active(c.Active)&&!state.data.rows.progress.some(p=>p.ProgramModuleID===moduleId&&p.ClassID===c.ClassID)))classId=state.data.rows.progress.find(p=>p.ProgramModuleID===moduleId)?.ClassID||'';
    const previous=state.data.rows.progress.find(r=>r.ProgramModuleID===moduleId&&r.ClassID===classId),id=previous?.ProgressID||`MP-${crypto.randomUUID()}`;
    state.overview=false;state.kind='progress';state.search='';$('pm-search').value='';
    state.edit={kind:'progress',record:previous?{...previous}:{ProgressID:id,ProgramModuleID:moduleId,ClassID:classId,Status:'ACTIVE'},creating:!previous,originalId:id};
    render();$('pm-rows').querySelector('[data-field=ClassID]')?.focus();
  }
  function moduleProgressCell(row,edit){
    if(edit?.kind==='modules'&&edit.creating&&row.ProgramModuleID===edit.originalId)return '<span class="pm-muted">Save this module before adding class progress.</span>';
    const progress=state.data.rows.progress.filter(r=>r.ProgramModuleID===row.ProgramModuleID);
    const labels={ACTIVE:'Active',INACTIVE:'Inactive',COMPLETED:'Completed'};
    const list=progress.map(p=>`<div class="pm-class-progress"><span>${esc(state.data.rows.classes.find(c=>c.ClassID===p.ClassID)?.Name||p.ClassID)}</span><button type="button" class="pb-secondary pm-progress-status ${p.Status==='COMPLETED'?'is-completed':''}" data-progress-module="${esc(row.ProgramModuleID)}" data-progress-class="${esc(p.ClassID)}">${labels[p.Status]}</button></div>`).join('');
    if(edit?.kind==='progress'&&edit.record.ProgramModuleID===row.ProgramModuleID)return `${list}<div class="pm-progress-editor"><label>Class${cell(edit.record,['ClassID','Class','class'])}</label><label>Status${cell(edit.record,['Status','Class status','progress'])}</label><div><button type="button" data-save>Save status</button><button type="button" data-cancel class="pb-secondary">Cancel</button></div></div>`;
    const available=state.data.rows.classes.some(c=>active(c.Active)&&!progress.some(p=>p.ClassID===c.ClassID));
    return `<div class="pm-progress-list">${list||'<span class="pm-muted">No class status recorded.</span>'}${available?`<button type="button" class="pb-secondary" data-progress-module="${esc(row.ProgramModuleID)}">Add class status</button>`:!progress.length?'<small class="pm-muted">Add an active class in Classes first.</small>':''}</div>`;
  }
  function renderProfiles(){
    const records=state.data.accounts,search=state.search.trim().toLowerCase();
    const roles=account=>(account.Roles||[]).map(role=>({STUDENT:'Student',TEACHER:'Teacher',SENIOR:'Senior',ADMIN:'Admin'})[role]||role);
    const filtered=records.filter(account=>[account.DisplayName,account.AccountID,...roles(account)].some(value=>String(value).toLowerCase().includes(search)));
    $('pm-caption').textContent='User profiles';$('pm-help').textContent='Academy users and their roles in this Program. Open Class memberships to add or update their class membership dates.';
    $('pm-section-note').textContent='Open the shared User profiles screen to add or edit academy users and assign their roles and subscriptions.';$('pm-section-note').hidden=false;
    $('pm-count').textContent=`${filtered.length} of ${records.length} users`;
    $('pm-head').innerHTML='<tr><th scope="col">User</th><th scope="col">Account status</th><th scope="col">Roles in this Program</th><th scope="col">Classes</th><th scope="col">Actions</th></tr>';
    $('pm-rows').innerHTML=filtered.map(account=>{
      const memberships=state.data.rows.enrollments.filter(r=>r.AccountID===account.AccountID&&active(r.Active));
      const classes=[...new Set(memberships.map(r=>state.data.rows.classes.find(c=>c.ClassID===r.ClassID)?.Name||r.ClassID))];
      return `<tr><td data-label="User">${esc(account.DisplayName)}</td><td data-label="Account status">${active(account.Active)?'Active':'Inactive'}</td><td data-label="Roles in this Program">${roles(account).map(esc).join(', ')||'No program roles'}</td><td data-label="Classes">${classes.map(esc).join(', ')||'No class memberships'}</td><td data-label="Actions"><a class="pm-profile-link" href="/users/?program=${encodeURIComponent(programId)}&amp;account=${encodeURIComponent(account.AccountID)}">Profile and roles →</a><button type="button" class="pb-secondary" data-user-memberships="${esc(account.AccountID)}">Class memberships</button></td></tr>`;
    }).join('')||'<tr><td colspan="5" class="pm-empty">No matching Academy users.</td></tr>';
  }
  function rememberDraft(){
    if(state.edit)sessionStorage.setItem(storageKey+':draft',JSON.stringify({kind:state.edit.kind||state.kind,edit:state.edit}));
    else sessionStorage.removeItem(storageKey+':draft');
  }
  function baseline(){
    if(!state.edit||state.edit.baselineSet)return;
    const edit=state.edit;edit.kind=state.kind;const def=defs[edit.kind];
    edit.baseRecord=structuredClone(state.data.rows[state.kind].find(r=>r[def.key]===edit.originalId)||null);
    edit.baseRowRevision=state.data.rowRevisions?.[state.kind]?.[edit.originalId]||state.data.emptyRowRevision;
    edit.baseRevision=state.data.revision;edit.baselineSet=true;
  }
  function renderConflict(){
    const conflict=visibleEdit()?.conflict,panel=$('pm-conflict');panel.hidden=!conflict;
    if(!conflict)return;
    $('pm-conflict-details').innerHTML=conflict.currentRecord?`<table class="pm-grid"><thead><tr><th>Field</th><th>Saved version</th><th>Your entry</th></tr></thead><tbody>${defs[state.kind].columns.map(col=>`<tr><th scope="row">${esc(col[1])}</th><td data-label="Saved version">${esc(display(conflict.currentRecord,col))}</td><td data-label="Your entry">${esc(display(state.edit.record,col))}</td></tr>`).join('')}</tbody></table>`:'<p>This record was removed elsewhere. Your entry is still kept.</p>';
    $('pm-use-mine').disabled=state.busy||!conflict.currentRecord;
    $('pm-use-saved').disabled=state.busy;
  }
  function reconcile(currentRecord,rowRevision){
    const edit=state.edit,base=edit.baseRecord;
    const equal=(a,b)=>typeof a==='boolean'||typeof b==='boolean'?active(a)===active(b):String(a??'')===String(b??'');
    if(!base||!currentRecord||edit.creating){edit.conflict={currentRecord,rowRevision};return false;}
    const merged={...currentRecord};
    for(const [key] of defs[state.kind].columns){
      const mine=edit.record[key],before=base[key],latest=currentRecord[key];
      if(!equal(mine,before)&&!equal(latest,before)&&!equal(mine,latest)){edit.conflict={currentRecord,rowRevision};return false;}
      if(!equal(mine,before))merged[key]=mine;
    }
    if('Active' in merged)merged.Active=active(merged.Active);
    edit.record=merged;edit.baseRecord=structuredClone(currentRecord);edit.baseRowRevision=rowRevision;delete edit.conflict;return true;
  }
  function render(){baseline();rememberDraft();renderConflict();if(!state.data){controls();return;}
    const moduleMode=['modules','progress'].includes(state.kind),gridKind=moduleMode?'modules':state.kind,def=defs[gridKind],edit=visibleEdit();
    $('pm-title').textContent=`${state.data.program.name} · Management`;
    $('pm-timetable').href=`/programs/timetable.html?program=${encodeURIComponent(programId)}`;
    $('pm-workspace').hidden=!state.data.prepared;$('pm-prepare').hidden=state.data.prepared;
    $('pm-tabs').innerHTML=tabs.map(([key,label])=>`<button type="button" data-tab="${key}" aria-current="${state.overview?key==='overview':key===tabKind(state.kind)}">${label}</button>`).join('');
    $('pm-overview').hidden=!state.overview;$('pm-editor').hidden=state.overview;
    $('pm-add').hidden=!state.overview&&['profiles','teachers','levels'].includes(state.kind);
    $('pm-profiles-back').hidden=state.overview||state.kind!=='enrollments';
    $('pm-shared-profiles').hidden=state.overview||state.kind!=='profiles';$('pm-shared-profiles').href=`/users/?program=${encodeURIComponent(programId)}`;
    $('pm-shared').hidden=state.overview||state.kind!=='subjects';$('pm-legacy').hidden=state.overview||state.kind!=='subjects'||!state.data.sharedSubjects.some(s=>s.Legacy);
    $('pm-section-note').hidden=true;
    if(state.overview){$('pm-add').textContent='＋ Add module';renderOverview();controls();return;}
    if(state.kind==='profiles'){renderProfiles();controls();return;}
    $('pm-help').textContent=def.help+' Ctrl/⌘ + Enter saves the edited row.';$('pm-caption').textContent=def.label;$('pm-add').textContent=`＋ Add ${def.singular}`;
    let notice='';
    if(state.kind==='enrollments')notice=`Class memberships for ${state.data.accounts.find(a=>a.AccountID===state.profileAccountId)?.DisplayName||'this user'}. `+(!state.data.rows.classes.some(r=>active(r.Active))?'Add an active class in Classes first.':'Class membership does not grant a program role.');
    if(['teachers','levels'].includes(state.kind))notice='Your earlier unfinished entry is kept. Finish or cancel it to return to the updated tabs.';
    $('pm-section-note').textContent=notice;$('pm-section-note').hidden=!notice;
    const columns=moduleMode?[...def.columns,['__progress','Class progress']]:def.columns;
    $('pm-head').innerHTML=`<tr><th scope="col">#</th>${columns.map(c=>`<th scope="col">${c[1]}</th>`).join('')}<th scope="col">Changes</th></tr>`;
    const records=state.data.rows[gridKind].filter(r=>gridKind!=='enrollments'||!state.profileAccountId||r.AccountID===state.profileAccountId).map(r=>({...r}));
    const rowEdit=edit&&edit.kind===gridKind?edit:null;
    if(rowEdit&&(rowEdit.creating||!records.some(r=>r[def.key]===rowEdit.originalId)))records.push(rowEdit.record);
    const filtered=records.filter(r=>rowEdit&&r[def.key]===rowEdit.originalId||edit?.kind==='progress'&&r.ProgramModuleID===edit.record.ProgramModuleID||def.columns.some(c=>String(display(r,c)).toLowerCase().includes(state.search.toLowerCase())));
    $('pm-count').textContent=`${filtered.length} of ${records.length} rows`;
    $('pm-rows').innerHTML=filtered.map((r,i)=>{const editing=rowEdit&&(rowEdit.creating?r===rowEdit.record:r[def.key]===rowEdit.originalId),row=editing?rowEdit.record:r;
      return `<tr class="${editing||edit?.kind==='progress'&&r.ProgramModuleID===edit.record.ProgramModuleID?'is-editing':''}"><td>${i+1}</td>${columns.map(c=>`<td data-label="${esc(c[1])}">${c[0]==='__progress'?moduleProgressCell(row,edit):editing?cell(row,c):esc(display(row,c))}</td>`).join('')}<td data-label="Changes">${editing?'<button type="button" data-save>Save</button><button type="button" data-cancel class="pb-secondary">Cancel</button>':`<button type="button" data-edit="${esc(r[def.key])}" class="pb-secondary" ${state.edit?'disabled':''}>Edit</button>`}</td></tr>`;
    }).join('')||`<tr><td colspan="${columns.length+2}" class="pm-empty">No ${def.label.toLowerCase()} yet. Add your first ${def.singular}.</td></tr>`;controls();
  }
  async function load(){state.data=await api('manage-get',{includeOverview:true});state.data.rows.progress||=[];
    state.timetable=null;state.preview=null;state.timetableError=false;
    if(state.data.overview){state.timetable=state.data.overview.timetable;state.preview=state.data.overview.preview;state.timetableError=state.data.overview.error;}
    else if(state.data.prepared)try{state.timetable=await api('get');if(state.timetable.draft.rules.length)state.preview=await api('preview',{draft:state.timetable.draft});}catch{state.timetableError=true;}

    try{state.pending=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{sessionStorage.removeItem(storageKey);}
    if(!state.edit){try{const draft=JSON.parse(sessionStorage.getItem(storageKey+':draft')||'null');if(draft&&defs[draft.kind]){state.kind=draft.kind;state.edit={...draft.edit,kind:draft.kind};state.overview=false;}}catch{}}
    if(state.pending&&!state.edit){state.overview=false;state.kind=state.pending.kind;state.edit={kind:state.pending.kind,creating:state.pending.body.creating,originalId:state.pending.body.record[defs[state.kind].key],originalSubjectID:state.pending.originalSubjectID,baselineSet:true,baseRowRevision:state.pending.body.baseRowRevision,baseRevision:state.pending.body.revision,baseRecord:state.pending.baseRecord,record:structuredClone(state.pending.body.record)};}
    try{state.importPending=JSON.parse(sessionStorage.getItem(storageKey+':import')||'null');}catch{sessionStorage.removeItem(storageKey+':import');}
    if(state.importPending&&!state.dataLoaded){state.overview=false;state.kind='subjects';}state.dataLoaded=true;
    if(state.importPending&&!state.importPending.catalogue)state.importPending={catalogue:state.importPending}; // Preserve pre-fix retry identifiers.
    if(state.edit?.kind==='enrollments')state.profileAccountId=state.edit.record.AccountID;
    render();message(!state.data.prepared?'Prepare management tables once to begin. Existing Program records are preserved.':!state.data.coordinatorAvailable?'Saving needs the Program coordinator binding.':state.importPending?'An earlier subject import needs confirmation. Open Reboot import and retry.':state.pending?'An earlier save needs confirmation. Retry the same change.':state.edit?'Records refreshed. Your unsaved entry is kept.': 'Ready. Add or edit a row, then save it.');
  }
  async function refresh({savedMessage='',attempt=0}={}){
    try{
      await load();
      // A partial overview can still need recovery even when curriculum loaded.
      if(state.timetableError?.retryable)throw Object.assign(new Error(state.timetableError.error),state.timetableError);
      $('pm-refresh-status').hidden=true;
      if(savedMessage)message(savedMessage+(state.edit?' Your unfinished entry is kept.':''));
    }catch(error){
      const retryable=error.retryable!==false&&(!error.status||error.status>=500);
      const retry=retryable&&attempt<2;
      const delay=Math.min(300000,error.code==='SHEETS_RATE_LIMITED'?Math.max(60000,Number(error.retryAfterMs)||0):Math.max(1500,Number(error.retryAfterMs)||0)*2**attempt);
      const reason=error.code==='SHEETS_RATE_LIMITED'?'Google Sheets is temporarily limiting requests.':error.message;
      const status=$('pm-refresh-status');status.hidden=false;
      status.textContent=(savedMessage?'Your change is saved. ':'')+reason+' '+(retry?`Records will refresh automatically in ${Math.ceil(delay/1000)} seconds. You can browse and keep editing; saving will resume after the wait.`:'Automatic refresh has stopped. Use Refresh records to try again. Your unfinished edits are kept.')+(error.reference&&!reason.includes(error.reference)?` Reference: ${error.reference}`:'');
      message(savedMessage||'The latest records could not be loaded yet.',!savedMessage);
      if(retry){
        state.refreshWaiting=true;
        const retryRead=()=>{
          if(state.busy){state.refreshTimer=setTimeout(retryRead,1000);return;}
          state.refreshWaiting=false;state.refreshTimer=null;
          void work(()=>refresh({savedMessage,attempt:attempt+1}));
        };
        state.refreshTimer=setTimeout(retryRead,delay);
      }
      render();
    }
  }
  function showConfirmedRow(result,kind){
    const def=defs[kind],record=result.record;
    if(!def||!record||!result.rowRevision)return;
    const rows=state.data.rows[kind],index=rows.findIndex(row=>row[def.key]===record[def.key]);
    if(index<0)rows.push(record);else rows[index]=record;
    if(result.level){const levels=state.data.rows.levels,index=levels.findIndex(r=>r.LevelID===result.level.LevelID);if(index<0)levels.push(result.level);else levels[index]=result.level;}
    state.data.revision=result.revision;
    state.data.rowRevisions[kind][record[def.key]]=result.rowRevision;
  }
  function keepPending(){sessionStorage.setItem(storageKey,JSON.stringify(state.pending));}
  async function save(automaticRetry=true){if(!state.edit)return;const returning=!visibleEdit();state.kind=state.edit.kind||state.kind;state.overview=false;if(returning)render();if(state.edit.conflict){message('Review the saved version and your entry below before saving.',true);return;}
    if(!state.pending){
      const record=structuredClone(state.edit.record);
      if(state.kind==='subjects'&&record.SubjectID==='__new__'&&!record.NewSubjectName?.trim())throw new Error('Enter the new subject name.');
      state.pending={kind:state.kind,baseRecord:state.edit.baseRecord,originalSubjectID:state.edit.originalSubjectID,body:{kind:state.kind,record,creating:state.edit.creating,revision:state.edit.baseRevision,baseRowRevision:state.edit.baseRowRevision,referenceRevision:state.data.referenceRevision,operationId:crypto.randomUUID()}};
      if(record.SubjectID==='__new__')state.pending.createSubject={mode:'create',subjectName:record.NewSubjectName.trim(),operationId:crypto.randomUUID()};
      keepPending();
    }
    try{
      if(state.pending.createSubject&&!state.pending.subjectResolved){
        const result=await api('save',state.pending.createSubject,true);
        state.pending.body.record.SubjectID=result.subject.SubjectID;delete state.pending.body.record.NewSubjectName;
        state.pending.subjectResolved=true;keepPending();
      }
      if(state.pending.subjectResolved&&!state.pending.linkStarted){
        const latest=await api('manage-get');
        state.pending.body.referenceRevision=latest.referenceRevision;state.pending.linkStarted=true;keepPending();
      }
      const kind=state.pending.kind,result=await api('manage-save',state.pending.body);
      sessionStorage.removeItem(storageKey);state.pending=null;state.edit=null;rememberDraft();
      showConfirmedRow(result,kind);if(['levels','teachers'].includes(state.kind))state.kind=tabKind(state.kind);render();
      await refresh({savedMessage:state.kind==='progress'?'Class module status saved. Other classes and timetable lessons are unchanged.':'Row saved. It is now available to the timetable.'});
    }catch(error){
      if(!state.pending){render();throw new Error('Your row was saved, but the latest records could not be loaded. '+error.message);}
      if(error.code==='ROW_CHANGED'){
        const pending=state.pending;
        if(pending.subjectResolved)state.edit.record=structuredClone(pending.body.record);
        sessionStorage.removeItem(storageKey);state.pending=null;
        const merged=reconcile(error.currentRecord,error.rowRevision);render();
        if(merged&&automaticRetry)return save(false);
        if(merged)throw new Error('Records changed again. Your entry is kept; press Save to try again.');
        message('This record changed elsewhere. Your entry is kept. Review both versions below.',true);return;
      }
      if(automaticRetry&&error.retryable!==false&&(!error.status||error.status>=500||error.code==='RECOVERY_REQUIRED')){
        const delay=Math.min(60000,Math.max(0,Number(error.retryAfterMs)||0));
        message(delay?`The service is busy. Retrying in ${Math.ceil(delay/1000)} seconds; your entry is kept.`:'Recovering the interrupted save. Your entry is kept…');
        if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
        await api('recover',{},Boolean(state.pending.createSubject&&!state.pending.linkStarted));
        return save(false);
      }
      if(error.status&&error.status<500&&error.code!=='RECOVERY_REQUIRED'){
        if(state.pending.subjectResolved)state.edit.record=structuredClone(state.pending.body.record);
        sessionStorage.removeItem(storageKey);state.pending=null;render();
      }
      throw error;
    }
  }
  $('pm-add').onclick=()=>{if(state.edit||state.busy||state.pending||state.importPending)return;if(state.overview||state.kind==='progress'){state.overview=false;state.kind='modules';}if(!defs[state.kind]||['teachers','levels'].includes(state.kind))return;const def=defs[state.kind],record=Object.fromEntries(def.columns.map(([key])=>[key,key==='Active'?true:key==='Status'?'ACTIVE':key==='SortOrder'?0:'']));if(state.kind==='enrollments')record.AccountID=state.profileAccountId||'';if(def.prefix)record[def.key]=`${def.prefix}-${crypto.randomUUID()}`;state.edit={record,creating:true,originalId:record[def.key]};state.search='';$('pm-search').value='';render();$('pm-rows').querySelector('input,select')?.focus();};
  $('pm-return').onclick=()=>{state.overview=false;state.kind=state.edit?.kind||'subjects';state.search='';$('pm-search').value='';render();};
  $('pm-tabs').onclick=event=>{const key=event.target.closest('[data-tab]')?.dataset.tab;if(!tabs.some(([id])=>id===key)||state.busy)return;state.overview=key==='overview';if(!state.overview)state.kind=state.edit&&tabKind(state.edit.kind)===key?state.edit.kind:key;state.search='';$('pm-search').value='';render();};
  $('pm-profiles-back').onclick=()=>{if(state.busy)return;state.overview=false;state.kind='profiles';state.search='';$('pm-search').value='';render();};
  $('pm-overview').addEventListener('toggle',event=>{
    const key=event.target.dataset.rollup;if(!key)return;
    if(event.target.open)state.expanded.add(key);else state.expanded.delete(key);
  },true);
  $('pm-overview').onclick=event=>{
    const button=event.target.closest('button');if(!button||state.busy||state.edit||state.pending||state.importPending)return;
    state.overview=false;state.kind=button.dataset.progressModule?'progress':'modules';state.search='';$('pm-search').value='';
    if(button.dataset.progressModule){beginProgress(button.dataset.progressModule,button.dataset.progressClass||'');return;}
    else if(button.dataset.moduleEdit){const row=state.data.rows.modules.find(r=>r.ProgramModuleID===button.dataset.moduleEdit);state.edit={record:{...row,Active:active(row.Active)},creating:false,originalId:row.ProgramModuleID};}
    else if(button.dataset.moduleAdd){const id=`MOD-${crypto.randomUUID()}`;state.edit={record:{ProgramModuleID:id,ProgramSubjectID:button.dataset.moduleAdd,LevelID:choices('level',{ProgramSubjectID:button.dataset.moduleAdd}).some(l=>l.id===button.dataset.level)?button.dataset.level:'',Name:'',SortOrder:0,Active:true},creating:true,originalId:id};}
    render();$('pm-rows').querySelector(state.kind==='progress'?'[data-field=Status]':'[data-field=Name]')?.focus();
  };
  $('pm-search').oninput=event=>{state.search=event.target.value;render();};
  $('pm-rows').onclick=event=>{
    if(state.busy||state.pending||state.importPending||state.edit&&!visibleEdit())return;const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-save'))void work(save);
    else if(button.hasAttribute('data-cancel')){state.edit=null;if(['progress','levels','teachers'].includes(state.kind))state.kind=tabKind(state.kind);render();message('Unsaved row changes discarded.');}
    else if(button.dataset.progressModule&&!state.edit)beginProgress(button.dataset.progressModule,button.dataset.progressClass||'');
    else if(button.dataset.userMemberships&&!state.edit){state.profileAccountId=button.dataset.userMemberships;state.kind='enrollments';state.search='';$('pm-search').value='';render();}
    else if(button.dataset.edit&&!state.edit){if(state.kind==='progress')state.kind='modules';const def=defs[state.kind],row=state.data.rows[state.kind]?.find(r=>r[def.key]===button.dataset.edit);if(!row)return;state.edit={record:{...row,Active:active(row.Active)},creating:false,originalId:button.dataset.edit,originalSubjectID:row.SubjectID};render();}
  };
  $('pm-rows').addEventListener('input',event=>{const key=event.target.dataset.field;if(key&&visibleEdit()&&!state.busy&&!state.pending){state.edit.record[key]=key==='Active'?event.target.value==='true':event.target.value;rememberDraft();if(state.edit.conflict)renderConflict();}});
  $('pm-rows').addEventListener('change',event=>{const key=event.target.dataset.field;if(!key||!visibleEdit()||state.busy||state.pending)return;state.edit.record[key]=key==='Active'?event.target.value==='true':event.target.value;rememberDraft();if(key==='SubjectID'){render();$('pm-rows').querySelector('[data-field=NewSubjectName]')?.focus();}if(key==='ProgramSubjectID'&&state.kind==='modules'){state.edit.record.LevelID='';render();}});
  $('pm-prepare').onclick=()=>work(async()=>{await api('prepare');await refresh();});
  $('pm-retry').onclick=()=>work(save);
  $('pm-reload').onclick=()=>work(refresh);
  $('pm-use-mine').onclick=()=>work(async()=>{
    const edit=state.edit,conflict=edit?.conflict;if(!conflict?.currentRecord)return;
    edit.baseRecord=structuredClone(conflict.currentRecord);edit.baseRowRevision=conflict.rowRevision;
    edit.creating=false;delete edit.conflict;render();await save();
  });
  $('pm-use-saved').onclick=()=>work(async()=>{state.edit=null;rememberDraft();render();await refresh();});
  $('pm-recover').onclick=()=>work(async()=>{if(state.pending)await save();else {await api('recover');await refresh();}});
  $('pm-import-preview').onclick=()=>work(async()=>{
    state.importPreview=await api('import-preview',{},true);
    $('pm-import-list').innerHTML=state.importPreview.subjects.map(r=>`<label><input type="checkbox" value="${esc(r.SourceSubjectID)}" ${!r.Active?'disabled':''}> <span>${esc(r.SubjectName)}</span><small>${!r.Active?'Archived — unavailable':r.existing?(state.data.rows.subjects.some(s=>s.SubjectID===r.existing.SubjectID)?'Already in this Program':'In Academy catalogue — add to this Program'):'New Academy subject'}</small></label>`).join('')||'<p>No subjects found in Reboot.</p>';
    message('Select the subjects to add to this Program. Existing names and Program links will be reused.');
  });
  function keepImport(){sessionStorage.setItem(storageKey+':import',JSON.stringify(state.importPending));}
  function clearImport(){sessionStorage.removeItem(storageKey+':import');state.importPending=null;state.importPreview=null;$('pm-import-list').innerHTML='';}
  async function importSubjects(){
    if(!state.importPending){
      const sourceIds=[...$('pm-import-list').querySelectorAll('input:checked')].map(e=>e.value);
      if(!sourceIds.length)throw new Error('Select at least one Reboot subject.');
      state.importPending={catalogue:{mode:'import',sourceIds,sourceRevision:state.importPreview.revision,operationId:crypto.randomUUID()}};
      keepImport();
    }
    try{
      const pending=state.importPending;
      if(!pending.catalogueResult){pending.catalogueResult=await api('save',pending.catalogue,true);keepImport();}
      if(!pending.link){
        // Only append missing links to a fresh snapshot. Later edits still fail the revision check.
        const latest=await api('manage-get');
        pending.link={kind:'subject-import',record:{subjectIds:[...new Set(pending.catalogueResult.subjects.map(s=>s.SubjectID))]},revision:latest.revision,referenceRevision:latest.referenceRevision,operationId:crypto.randomUUID()};
        keepImport();
      }
      const result=await api('manage-save',pending.link),summary=result.record;
      clearImport();state.overview=false;state.kind='subjects';state.search='';$('pm-search').value='';
      await refresh({savedMessage:`${summary.added} ${summary.added===1?'subject':'subjects'} added to this Program; ${summary.alreadyLinked} already linked.${summary.archived?` ${summary.archived} existing links remain archived; use Edit to reactivate them.`:''}`});
    }catch(error){
      if(error.status&&error.status<500){
        const catalogueSaved=Boolean(state.importPending?.catalogueResult);clearImport();
        if(catalogueSaved)error.message+=' The names are saved in the Academy catalogue. Review and select them again to finish adding them to this Program.';
      }
      throw error;
    }
  }
  $('pm-import-save').onclick=()=>work(importSubjects);
  $('pm-catalogue-recover').onclick=()=>work(async()=>{
    const result=await api('recover',{},true);
    message((result.recovered?'An interrupted catalogue save was completed.':'No interrupted catalogue save was found.')+' Recovery does not add subjects to this Program. '+(state.importPending?'Choose Retry same import to finish adding your subjects.':state.pending?'Choose Retry same change to finish your pending save.':'Review Reboot subjects, select names, then choose Import and add to this Program.'));
  });
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&visibleEdit()&&!state.busy&&!state.pending){event.preventDefault();void work(save);}});
  window.addEventListener('beforeunload',event=>{if(state.edit||state.pending||state.importPending){event.preventDefault();event.returnValue='';}});
  void work(async()=>{await refresh();if(state.pending&&!state.refreshWaiting)await save();});
})();
