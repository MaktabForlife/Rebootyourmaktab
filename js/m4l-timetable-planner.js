/* V105.3.4.13 — timetable and availability boards with draft reset. */
(()=>{'use strict';
  const timeMinutes=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
  const clock=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  const normalizeTime=value=>{const input=String(value||'').trim(),parts=/^(\d{1,2})[hH:](\d{2})$/.exec(input)||/^(\d{1,2})(\d{2})$/.exec(input);return parts&&Number(parts[1])<24&&Number(parts[2])<60?clock(Number(parts[1])*60+Number(parts[2])):'';};
  const duration=minutes=>Math.floor(minutes/60)+'h'+String(minutes%60).padStart(2,'0');
  const durationMinutes=value=>{const input=String(value||'').trim(),parts=/^(\d{1,3})[hH:]([0-5]\d)$/.exec(input);return parts?Number(parts[1])*60+Number(parts[2]):input!==''&&Number.isInteger(Number(input)*60)?Number(input)*60:NaN;};
  const overlap=(a,b)=>timeMinutes(a.startTime)<timeMinutes(b.endTime)&&timeMinutes(b.startTime)<timeMinutes(a.endTime);
  const dayOrder=[1,2,3,4,5,6,0];
  window.M4L_ASSISTED_PLANNER={
    mount({state,$,esc,days,modules,changed,locked}){
      let selectedClass='',selectedSubject='',selectedTeacher='',boardView='class',availabilityTeacher='',availabilityEditingId='',availabilityDay=null,selectedMove=null,editing=null,showDetails=false,editorDirty=false,editorSource='',placingBreak=false,selectedBreakMove=null,editingBreak=null,breakEditorDirty=false,breakEditorSource='',selectedEmpty=null,placementError=null,inlineSubject='',inlineTeacher='',inlineClass='',quickClassOverride=null,inlineDirty=false,learnerCache=new Map();
      const boardParams=new URLSearchParams(location.search),requestedView=boardParams.get('board');
      if(requestedView==='teacher'||requestedView==='class'){boardView=requestedView;selectedClass=boardParams.get('class')||'';selectedTeacher=boardParams.get('teacher')||'';}
      const boardTabs=[{id:'BOARD-1',view:boardView,classId:selectedClass,teacherId:selectedTeacher,subjectId:selectedSubject,emptyCell:null}];
      let activeBoardTabId='BOARD-1';
      const undo=[];
      const empty=()=>({periods:[],availability:[],limits:[]});
      const plan=()=>state.draft?.planner||empty();
      const edit=()=>state.draft.planner ||= empty();
      const breaks=()=>state.draft.breaks||[];
      const editBreaks=()=>state.draft.breaks ||= [];
      const catalog=()=>state.data.catalog;
      const teacher=id=>catalog().teachers.find(row=>row.id===id);
      const subject=row=>row.moduleId?catalog().modules.find(m=>m.id===row.moduleId)?.name:catalog().subjects.find(s=>s.id===row.programSubjectId)?.name;
      const note=(value,error=false)=>{$('tt-board-message').textContent=value;$('tt-board-message').classList.toggle('is-error',error);if($('tt-quick-lesson-dialog').open){$('tt-quick-error').textContent=error?value:'';$('tt-quick-error').hidden=!error;}};
      const availabilityNote=(value,error=false)=>{$('tt-availability-message').textContent=value;$('tt-availability-message').classList.toggle('is-error',error);$('tt-availability-error').textContent=error?value:'';$('tt-availability-error').hidden=!error;};
      const closeQuickDialog=()=>{if($('tt-quick-lesson-dialog').open)$('tt-quick-lesson-dialog').close();$('tt-quick-error').hidden=true;$('tt-quick-error').textContent='';};
      const closeBreakDialog=()=>{if($('tt-break-dialog').open)$('tt-break-dialog').close();};
      const clearPlacementError=()=>{if(placementError){placementError=null;note('');}};
      const cellError=(day,period)=>placementError?.day===day&&placementError.periodId===period.id?'<p class="tt-board-cell-error">'+esc(placementError.message)+'</p>':'';
      const rejectPlacement=(day,period,message)=>{placementError={day,periodId:period.id,message};note(message,true);renderBoard();};
      const option=(id,name,selected)=>'<option value="'+esc(id)+'"'+(id===selected?' selected':'')+'>'+esc(name)+'</option>';
      const saveUndo=(before,beforePeriods=null,beforeBreaks=null,hadBreaks=true)=>{undo.push({before,after:JSON.stringify(state.draft.rules),beforePeriods,afterPeriods:JSON.stringify(plan().periods),beforeBreaks,hadBreaks,afterBreaks:JSON.stringify(breaks())});if(undo.length>20)undo.shift();};
      const activeEdit=()=>editing&&state.draft.rules.find(row=>row.id===editing.id&&row.weekdays.includes(editing.day));
      const activeBreakEdit=()=>editingBreak&&breaks().find(row=>row.id===editingBreak.id&&row.weekdays.includes(editingBreak.day));
      const activeBoardTab=()=>boardTabs.find(tab=>tab.id===activeBoardTabId);
      function rememberBoardTab(){Object.assign(activeBoardTab(),{view:boardView,classId:selectedClass,teacherId:selectedTeacher,subjectId:selectedSubject,emptyCell:selectedEmpty});}
      function renderBoardTabs(){
        const classes=catalog().classes,teachers=catalog().teachers;
        $('tt-board-tabs').innerHTML=boardTabs.map(tab=>{
          const label=tab.view==='teacher'?'Teacher: '+(teachers.find(row=>row.id===tab.teacherId)?.name||'Choose teacher'):'Class: '+(classes.find(row=>row.id===tab.classId)?.name||'Choose class');
          const active=tab.id===activeBoardTabId;
          return '<div class="tt-board-tab '+(active?'is-active':'')+'" role="presentation"><button id="tt-board-tab-'+esc(tab.id)+'" type="button" role="tab" data-board-tab="'+esc(tab.id)+'" aria-selected="'+active+'" aria-controls="tt-board" tabindex="'+(active?'0':'-1')+'">'+esc(label)+'</button>'+(boardTabs.length>1?'<button type="button" class="tt-board-tab-close" data-close-board-tab="'+esc(tab.id)+'" aria-label="Close '+esc(label)+'">×</button>':'')+'</div>';
        }).join('');
        $('tt-add-board-tab').disabled=boardTabs.length>=24;
        $('tt-board').setAttribute('aria-labelledby','tt-board-tab-'+activeBoardTabId);
      }
      function activateBoardTab(tab){
        activeBoardTabId=tab.id;boardView=tab.view;selectedClass=tab.classId;selectedTeacher=tab.teacherId;selectedSubject=tab.subjectId;
        selectedMove=null;selectedBreakMove=null;selectedEmpty=tab.emptyCell||null;clearPlacementError();editing=null;editingBreak=null;placingBreak=false;
        render();
      }
      function learnersOverlap(leftClasses,rightClasses,weekday){
        const key=[leftClasses.slice().sort().join(','),rightClasses.slice().sort().join(','),weekday,state.effectiveFrom||state.data.today].join('|');
        if(learnerCache.has(key))return learnerCache.get(key);
        const memberships=catalog().enrollments.filter(row=>row.active);
        for(const left of memberships.filter(row=>leftClasses.includes(row.classId)))for(const right of memberships.filter(row=>rightClasses.includes(row.classId)&&row.accountId===left.accountId)){
          const start=[state.effectiveFrom||state.data.today||'0000-01-01',left.startDate||'',right.startDate||''].sort().at(-1),end=[left.endDate||'2099-12-31',right.endDate||'2099-12-31'].sort()[0];
          if(start>end)continue;
          const startTime=Date.parse(start+'T00:00:00Z');
          if(!Number.isFinite(startTime)){learnerCache.set(key,true);return true;}
          const first=new Date(startTime+((weekday-new Date(startTime).getUTCDay()+7)%7)*86400000).toISOString().slice(0,10);
          if(first<=end){learnerCache.set(key,true);return true;}
        }
        learnerCache.set(key,false);
        return false;
      }
      function total(teacherId){return state.draft.rules.filter(row=>row.teacherId===teacherId&&Number.isFinite(timeMinutes(row.startTime))&&Number.isFinite(timeMinutes(row.endTime))&&row.startTime<row.endTime).reduce((n,row)=>n+(timeMinutes(row.endTime)-timeMinutes(row.startTime))*row.weekdays.length,0);}
      const ranges=teacherId=>plan().availability.filter(row=>row.teacherId===teacherId);
      const available=(teacherId,weekday,startTime,endTime)=>!teacherId||!ranges(teacherId).length||ranges(teacherId).some(row=>row.weekday===weekday&&row.startTime<=startTime&&endTime<=row.endTime);
      function reason(candidate,ignore){
        const ignored=ignore?(Array.isArray(ignore)?ignore:[ignore]):[];
        if(!Number.isFinite(timeMinutes(candidate.startTime))||!Number.isFinite(timeMinutes(candidate.endTime))||candidate.startTime>=candidate.endTime)return 'Set valid period times first.';
        if(state.draft.breaks?.some(row=>row.weekdays.includes(candidate.weekday)&&overlap(row,candidate)))return 'This period overlaps a break.';
        if(!available(candidate.teacherId,candidate.weekday,candidate.startTime,candidate.endTime))return (teacher(candidate.teacherId)?.name||'Teacher')+' is unavailable during this whole period.';
        for(const row of state.draft.rules){
          if(ignored.some(item=>row.id===item.id&&candidate.weekday===item.day))continue;
          if(!row.weekdays.includes(candidate.weekday)||!overlap(row,candidate))continue;
          if(candidate.classIds.some(id=>row.classIds.includes(id)))return 'This class already has a lesson.';
          if(candidate.teacherId&&row.teacherId===candidate.teacherId){
            const classNames=row.classIds.map(id=>catalog().classes.find(item=>item.id===id)?.name||id).join(', ');
            return (teacher(candidate.teacherId)?.name||'Teacher')+' already teaches '+(classNames||'another class')+' on '+days[candidate.weekday]+' '+row.startTime.replace(':','h')+'–'+row.endTime.replace(':','h')+'.';
          }
          if(learnersOverlap(candidate.classIds,row.classIds,candidate.weekday))return 'A learner belongs to both classes at this time.';
        }
        const limit=plan().limits.find(row=>row.teacherId===candidate.teacherId);
        const oldMinutes=ignored.reduce((minutes,item)=>{const replacing=state.draft.rules.find(row=>row.id===item.id);return minutes+(replacing?.teacherId===candidate.teacherId?timeMinutes(replacing.endTime)-timeMinutes(replacing.startTime):0);},0);
        if(limit&&total(candidate.teacherId)-oldMinutes+timeMinutes(candidate.endTime)-timeMinutes(candidate.startTime)>limit.maxWeeklyMinutes)return 'This placement exceeds the teacher’s weekly hour limit.';
        return '';
      }
      function breakReason(candidate,ignore){
        if(!Number.isFinite(timeMinutes(candidate.startTime))||!Number.isFinite(timeMinutes(candidate.endTime))||candidate.startTime>=candidate.endTime)return 'Enter valid break times.';
        if(state.draft.rules.some(row=>row.weekdays.includes(candidate.weekday)&&overlap(row,candidate)))return 'A lesson already uses this time. Move or edit it before marking a break.';
        if(breaks().some(row=>!(row.id===ignore?.id&&candidate.weekday===ignore.day)&&row.weekdays.includes(candidate.weekday)&&overlap(row,candidate)))return 'Another break already uses this time.';
        return '';
      }
      function renderAvailability(){
        const teachers=[...catalog().teachers.filter(row=>row.active)];
        for(const id of new Set([...plan().availability.map(row=>row.teacherId),...plan().limits.map(row=>row.teacherId)]))if(!teachers.some(row=>row.id===id))teachers.push({id,name:'Inactive: '+id});
        if(!teachers.some(row=>row.id===availabilityTeacher))availabilityTeacher=teachers[0]?.id||'';
        $('tt-availability-tabs').innerHTML=teachers.map(row=>'<button id="tt-availability-tab-'+esc(row.id)+'" type="button" role="tab" data-availability-teacher="'+esc(row.id)+'" aria-selected="'+(row.id===availabilityTeacher)+'" aria-controls="tt-availability-grid" class="tt-availability-teacher-tab '+(row.id===availabilityTeacher?'is-active':'')+'">'+esc(row.name)+'</button>').join('');
        if(availabilityTeacher)$('tt-availability-grid').setAttribute('aria-labelledby','tt-availability-tab-'+availabilityTeacher);
        const limit=plan().limits.find(row=>row.teacherId===availabilityTeacher);
        $('tt-max-hours').value=limit?duration(limit.maxWeeklyMinutes):'';
        $('tt-remove-teacher-settings').disabled=!plan().availability.some(row=>row.teacherId===availabilityTeacher)&&!limit;
        const teacherRanges=ranges(availabilityTeacher);
        const assigned=total(availabilityTeacher),overLimit=limit&&assigned>limit.maxWeeklyMinutes;
        const caption='<span class="tt-availability-caption"><span>'+esc(teacher(availabilityTeacher)?.name||availabilityTeacher)+' · '+(teacherRanges.length?'Available during the shown ranges':'No ranges set · no availability restriction')+'</span><span class="tt-availability-hours'+(overLimit?' is-over':'')+'">Assigned teaching hours per week: '+duration(assigned)+(limit?' / '+duration(limit.maxWeeklyMinutes)+' maximum':'')+'</span></span>';
        $('tt-availability-grid').innerHTML=!availabilityTeacher?'<p class="tt-scope">Add an eligible teacher to set availability.</p>':'<table class="tt-availability-board"><caption>'+caption+'</caption><thead><tr>'+dayOrder.map(day=>'<th scope="col">'+esc(days[day])+'</th>').join('')+'</tr></thead><tbody><tr>'+dayOrder.map(day=>{
          const rows=teacherRanges.filter(row=>row.weekday===day).sort((a,b)=>a.startTime.localeCompare(b.startTime));
          return '<td data-availability-day="'+day+'">'+rows.map(row=>'<div class="tt-availability-range" draggable="true" data-availability-range="'+esc(row.id)+'" data-edit-availability="'+esc(row.id)+'"><button type="button" class="tt-availability-range-time" data-edit-availability="'+esc(row.id)+'" aria-label="Edit '+esc(days[day]+' '+row.startTime+' to '+row.endTime)+'">'+esc(row.startTime.replace(':','h'))+'–'+esc(row.endTime.replace(':','h'))+'</button><button type="button" class="tt-availability-delete" data-remove-availability="'+esc(row.id)+'" aria-label="Delete '+esc(days[day]+' '+row.startTime+' to '+row.endTime)+'" title="Delete range">'+deleteIcon+'</button></div>').join('')+'<button type="button" class="tt-availability-add" data-add-availability-day="'+day+'" aria-label="Add available time on '+esc(days[day])+'"><span class="tt-availability-plus" aria-hidden="true">＋</span><span>'+ (rows.length?'Add another range':'Add range') +'</span></button></td>';
        }).join('')+'</tr></tbody></table>';
      }
      function closeAvailabilityDialog(){if($('tt-availability-dialog').open)$('tt-availability-dialog').close();availabilityEditingId='';availabilityDay=null;$('tt-availability-error').hidden=true;}
      function openAvailabilityDialog(day,id=''){
        if(locked()||!availabilityTeacher||!dayOrder.includes(day))return;
        const row=id?ranges(availabilityTeacher).find(item=>item.id===id&&item.weekday===day):null;
        if(id&&!row)return;
        availabilityDay=day;availabilityEditingId=id;
        $('tt-availability-dialog-title').textContent=(row?'Edit':'Add')+' '+days[day]+' availability';
        $('tt-availability-dialog-from').value=row?row.startTime.replace(':','h'):'';
        $('tt-availability-dialog-to').value=row?row.endTime.replace(':','h'):'';
        $('tt-availability-save').textContent=row?'Save range':'Add range';
        availabilityNote('');$('tt-availability-dialog').showModal();
      }
      function switchAvailabilityTeacher(id){
        if(!id||id===availabilityTeacher||!catalog().teachers.some(row=>row.id===id)&&!plan().availability.some(row=>row.teacherId===id)&&!plan().limits.some(row=>row.teacherId===id))return;
        closeAvailabilityDialog();availabilityTeacher=id;availabilityNote('');renderAvailability();
      }
      function lessonDropdowns(subjectId,teacherId,inline=false,classId=selectedClass,classIds=[]){
        const subjects=modules(),teachers=catalog().teachers.filter(row=>row.active||row.id===teacherId);
        const subjectOptions='<option value="">Choose subject…</option>'+subjects.map(row=>option(row.id,row.name,subjectId)).join('')+(subjectId&&!subjects.some(row=>row.id===subjectId)?option(subjectId,'Unavailable: '+subjectId,subjectId):'');
        const teacherOptions='<option value="">Not assigned</option>'+teachers.map(row=>option(row.id,row.name,teacherId)).join('');
        const subjectField='<label>Subject / module<select '+(inline?'data-inline-subject':'data-quick-subject')+'>'+subjectOptions+'</select></label>';
        if(boardView==='teacher'){
          const classes=catalog().classes.filter(row=>row.active||row.id===classId||classIds.includes(row.id));
          const combined=inline&&classIds.length>1?option('__keep__','Keep combined: '+classIds.map(id=>catalog().classes.find(row=>row.id===id)?.name||id).join(', '),classId):'';
          const classOptions=combined||'<option value="">Choose class…</option>';
          return subjectField+'<label>Class<select '+(inline?'data-inline-class':'data-quick-class')+'>'+classOptions+classes.map(row=>option(row.id,row.name,classId)).join('')+'</select></label>';
        }
        return subjectField+'<label>Teacher (optional)<select '+(inline?'data-inline-teacher':'data-quick-teacher')+'>'+teacherOptions+'</select></label>';
      }
      function addLessonForm(day,period){
        return '<div class="tt-board-quick"><strong>Add lesson</strong>'+lessonDropdowns(selectedSubject,selectedTeacher)+'<div><button type="button" data-place-lesson data-board-day="'+day+'" data-board-period="'+esc(period.id)+'">Add</button><button type="button" class="pb-secondary" data-cancel-quick>Cancel</button></div>'+cellError(day,period)+'</div>';
      }
      const periodIndices=row=>plan().periods.flatMap((period,index)=>overlap(row,period)?[index]:[]);
      const sameLesson=(left,right)=>left.moduleId===right.moduleId&&left.programSubjectId===right.programSubjectId&&left.teacherId===right.teacherId&&(left.zoomLink||'')===(right.zoomLink||'')&&JSON.stringify(left.classIds.slice().sort())===JSON.stringify(right.classIds.slice().sort());
      function splitBoundaries(row){
        const periods=plan().periods,indices=periodIndices(row);
        return indices.slice(0,-1).filter((index,position)=>indices[position+1]===index+1&&row.startTime<periods[index].endTime&&periods[index].endTime<=periods[index+1].startTime&&periods[index+1].startTime<row.endTime);
      }
      function mergeCandidate(row,day,direction){
        const periods=plan().periods,indices=periodIndices(row);if(!indices.length)return null;
        const edge=direction<0?indices[0]:indices.at(-1),next=periods[edge+direction];if(!next)return null;
        if(direction<0?row.startTime!==periods[edge].startTime||next.endTime!==row.startTime:row.endTime!==periods[edge].endTime||next.startTime!==row.endTime)return null;
        const matches=state.draft.rules.filter(item=>item.id!==row.id&&item.weekdays.includes(day)&&sameLesson(row,item)&&overlap(item,next)&&(direction<0?item.endTime===next.endTime:item.startTime===next.startTime));
        return matches.length===1?matches[0]:null;
      }
      function openQuickDialog(){
        const row=activeEdit(),splitOptions=splitBoundaries(row);
        $('tt-quick-lesson-dialog').classList.toggle('is-detailed',false);
        $('tt-quick-fields').hidden=false;$('tt-quick-actions').hidden=false;
        $('tt-quick-lesson-title').textContent='Edit '+days[editing.day]+' lesson';
        $('tt-quick-fields').innerHTML=lessonDropdowns(inlineSubject,inlineTeacher,true,inlineClass,row.classIds);
        $('tt-quick-split-wrap').hidden=!splitOptions.length;$('tt-quick-split').hidden=!splitOptions.length;
        $('tt-quick-split-boundary').innerHTML=splitOptions.map(index=>{const gap=timeMinutes(plan().periods[index+1].startTime)-timeMinutes(plan().periods[index].endTime);return option(String(index),'After Period '+(index+1)+(gap?' ('+gap+' min gap excluded)':''),String(splitOptions[0]));}).join('');
        $('tt-quick-split-boundary').value=String(splitOptions[0]??'');
        $('tt-quick-merge-previous').hidden=!mergeCandidate(row,editing.day,-1);
        $('tt-quick-merge-next').hidden=!mergeCandidate(row,editing.day,1);
        $('tt-quick-period-actions').hidden=$('tt-quick-split').hidden&&$('tt-quick-merge-previous').hidden&&$('tt-quick-merge-next').hidden;
        $('tt-quick-error').textContent='';$('tt-quick-error').hidden=true;
        $('tt-quick-lesson-dialog').showModal();
      }
      function updateBoardViewDialog(){
        const classView=$('tt-tab-view').value==='class';
        $('tt-tab-view-class-wrap').hidden=!classView;$('tt-tab-view-teacher-wrap').hidden=classView;
        $('tt-tab-view-error').hidden=true;
      }
      function openBoardViewDialog(){
        const classes=catalog().classes.filter(row=>row.active),teachers=catalog().teachers.filter(row=>row.active);
        $('tt-tab-view').value=boardView;
        $('tt-tab-view-class').innerHTML='<option value="">Choose class…</option>'+classes.map(row=>option(row.id,row.name,selectedClass)).join('');
        $('tt-tab-view-class').value=classes.some(row=>row.id===selectedClass)?selectedClass:'';
        $('tt-tab-view-teacher').innerHTML='<option value="">Choose teacher…</option>'+teachers.map(row=>option(row.id,row.name,selectedTeacher)).join('');
        $('tt-tab-view-teacher').value=teachers.some(row=>row.id===selectedTeacher)?selectedTeacher:'';
        $('tt-tab-view-error').textContent='';updateBoardViewDialog();
        $('tt-board-view-dialog').showModal();
      }
      const editIcon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4z"/></svg>';
      const deleteIcon='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
      function breakCard(row,day,periodId=''){
        const selected=selectedBreakMove?.id===row.id&&selectedBreakMove.day===day||editingBreak?.id===row.id&&editingBreak.day===day;
        const label=(row.label||'Break')+' · '+row.startTime+'–'+row.endTime;
        const attrs=' data-board-day="'+day+'"'+(periodId?' data-board-period="'+esc(periodId)+'"':'')+' data-break-id="'+esc(row.id)+'"';
        return '<div draggable="true" class="tt-board-cell is-break '+(selected?'is-selected':'')+'"'+attrs+'><span class="tt-board-lesson-label">'+esc(label)+'</span><span class="tt-board-lesson-actions"><button type="button" class="tt-board-icon" data-edit-break-card'+attrs+' aria-label="Edit '+esc(days[day]+' '+label)+'" title="Edit break">'+editIcon+'</button><button type="button" class="tt-board-icon is-delete" data-delete-break-card'+attrs+' aria-label="Delete '+esc(days[day]+' '+label)+'" title="Delete break">'+deleteIcon+'</button></span></div>';
      }
      function boardRowHeading(slot){
        if(slot.kind==='gap')return '<th scope="row" class="tt-board-gap-heading"><strong>Break</strong><span>'+esc(slot.startTime.replace(':','h'))+'–'+esc(slot.endTime.replace(':','h'))+'</span></th>';
        const period=slot.period,index=slot.index;
        return '<th scope="row"><div class="tt-board-period"><strong>Period '+(index+1)+'</strong><button type="button" class="pb-secondary" data-remove-period="'+esc(period.id)+'" aria-label="Remove period '+(index+1)+'">×</button></div><div class="tt-board-period-times"><input data-period="'+esc(period.id)+'" data-time="startTime" aria-label="Period '+(index+1)+' starts" inputmode="numeric" maxlength="5" value="'+esc(period.startTime.replace(':','h'))+'"><span>–</span><input data-period="'+esc(period.id)+'" data-time="endTime" aria-label="Period '+(index+1)+' ends" inputmode="numeric" maxlength="5" value="'+esc(period.endTime.replace(':','h'))+'"></div></th>';
      }
      function renderBoard(){
        $('tt-clear-selection').disabled=!selectedMove&&!selectedBreakMove;
        $('tt-mark-break').setAttribute('aria-pressed',String(placingBreak));$('tt-mark-break').textContent=placingBreak?'Marking breaks · Cancel':'Mark break';
        $('tt-board-break-label-wrap').hidden=!placingBreak;
        const classes=catalog().classes.filter(row=>row.active);
        if(!classes.some(row=>row.id===selectedClass))selectedClass=classes[0]?.id||'';
        $('tt-board-class').innerHTML=classes.map(row=>option(row.id,row.name,selectedClass)).join('');
        $('tt-board-class').value=selectedClass;
        const subjects=modules(),teachers=catalog().teachers.filter(row=>row.active);
        if(!subjects.some(row=>row.id===selectedSubject))selectedSubject='';
        if(!teachers.some(row=>row.id===selectedTeacher))selectedTeacher='';
        $('tt-board-teacher').innerHTML='<option value="">Choose teacher…</option>'+teachers.map(row=>option(row.id,row.name,selectedTeacher)).join('');
        $('tt-board-teacher').value=selectedTeacher;
        $('tt-board-view').value=boardView;
        for(const button of $('tt-board-modes').querySelectorAll('[data-board-mode]'))button.setAttribute('aria-pressed',String(button.dataset.boardMode===boardView));
        rememberBoardTab();renderBoardTabs();
        const viewName=boardView==='teacher'?teacher(selectedTeacher)?.name:classes.find(row=>row.id===selectedClass)?.name;
        $('tt-board-heading').textContent=(boardView==='teacher'?'Teacher: ':'Class: ')+(viewName||'');
        const periods=plan().periods;
        const gapBreaks=breaks().filter(row=>row.weekdays?.length&&Number.isFinite(timeMinutes(row.startTime))&&Number.isFinite(timeMinutes(row.endTime))&&row.startTime<row.endTime&&!periods.some(period=>overlap(row,period)));
        const gapSlots=[...new Map(gapBreaks.map(row=>[row.startTime+'|'+row.endTime,{kind:'gap',startTime:row.startTime,endTime:row.endTime}])).values()];
        const timeline=[...periods.map((period,index)=>({kind:'period',period,index,startTime:period.startTime,endTime:period.endTime})),...gapSlots].sort((a,b)=>a.startTime.localeCompare(b.startTime)||a.endTime.localeCompare(b.endTime));
        const timelineIndexByPeriod=new Map(timeline.flatMap((slot,index)=>slot.kind==='period'?[[slot.index,index]]:[]));
        if(!timeline.length){$('tt-board').innerHTML='<p class="tt-board-empty">Set up periods above to generate the weekly timetable grid.</p>';return;}
        if(!selectedClass||boardView==='teacher'&&!selectedTeacher){$('tt-board').innerHTML='<p class="tt-board-empty">Choose a '+(boardView==='teacher'?'teacher':'class')+' to view the weekly board.</p>';return;}
        const visibleRows=(day,period)=>state.draft.rules.filter(row=>(boardView==='teacher'?row.teacherId===selectedTeacher:row.classIds.includes(selectedClass))&&row.weekdays.includes(day)&&overlap(row,period));
        const spans=new Map(),covered=new Set();
        for(const day of dayOrder)for(const row of state.draft.rules.filter(item=>(boardView==='teacher'?item.teacherId===selectedTeacher:item.classIds.includes(selectedClass))&&item.weekdays.includes(day))){
          const indices=periodIndices(row);
          if(indices.length<2||indices.some((index,position)=>position&&index!==indices[position-1]+1))continue;
          if(indices.some(index=>visibleRows(day,periods[index]).length!==1)||breaks().some(item=>item.weekdays.includes(day)&&overlap(item,row)))continue;
          const start=timelineIndexByPeriod.get(indices[0]),end=timelineIndexByPeriod.get(indices.at(-1));
          if(start===undefined||end===undefined||end<=start)continue;
          spans.set(day+':'+start,{rows:end-start+1,periods:indices.length});
          for(let index=start+1;index<=end;index++)covered.add(day+':'+index);
        }
        $('tt-board').innerHTML='<table class="tt-board-grid" aria-labelledby="tt-board-heading"><thead><tr><th scope="col">Period and times</th>'+dayOrder.map(day=>'<th scope="col">'+days[day]+'</th>').join('')+'</tr></thead><tbody>'+timeline.map((slot,i)=>'<tr>'+boardRowHeading(slot)+dayOrder.map(day=>{
          if(covered.has(day+':'+i))return '';
          if(slot.kind==='gap'){
            const rows=gapBreaks.filter(row=>row.startTime===slot.startTime&&row.endTime===slot.endTime&&row.weekdays.includes(day));
            if(rows.length)return '<td class="tt-board-gap-cell">'+rows.map(row=>breakCard(row,day)).join('')+'</td>';
            if(placingBreak||selectedBreakMove)return '<td class="tt-board-gap-cell"><button type="button" class="tt-board-cell is-empty" data-board-day="'+day+'" data-break-gap-start="'+esc(slot.startTime)+'" data-break-gap-end="'+esc(slot.endTime)+'" aria-label="Mark break on '+esc(days[day]+' '+slot.startTime+'–'+slot.endTime)+'">＋ Mark break</button></td>';
            return '<td class="tt-board-gap-cell is-empty" data-board-day="'+day+'" data-break-gap-start="'+esc(slot.startTime)+'" data-break-gap-end="'+esc(slot.endTime)+'" aria-label="No break on '+esc(days[day])+'"></td>';
          }
          const period=slot.period;
          const span=spans.get(day+':'+i),cellOpen=span?'<td class="tt-board-spanning" rowspan="'+span.rows+'">':'<td>';
          const rows=visibleRows(day,period);
          const breakRows=breaks().filter(row=>row.weekdays.includes(day)&&overlap(row,period));
          const moving=selectedMove&&state.draft.rules.find(item=>item.id===selectedMove.id);
          const breakMoving=selectedBreakMove&&breaks().find(item=>item.id===selectedBreakMove.id);
          const marking=placingBreak||breakMoving;
          if(!rows.length&&!breakRows.length){
            if(!marking&&!moving&&selectedEmpty?.day===day&&selectedEmpty.periodId===period.id)return cellOpen+addLessonForm(day,period)+'</td>';
            const label=marking?'＋ Mark break':'＋ Add lesson';return cellOpen+'<button type="button" class="tt-board-cell is-empty" data-board-day="'+day+'" data-board-period="'+esc(period.id)+'" data-open-lesson="'+(marking||moving?'false':'true')+'" aria-label="'+esc(days[day]+' '+period.startTime+'–'+period.endTime+' '+label)+'">'+esc(label)+'</button>'+cellError(day,period)+'</td>';
          }
          return cellOpen+breakRows.map(row=>breakCard(row,day,period.id)).join('')+rows.map(row=>{
            const selected=selectedMove?.id===row.id&&selectedMove.day===day||editing?.id===row.id&&editing.day===day;
            const detail=boardView==='teacher'?row.classIds.map(id=>classes.find(item=>item.id===id)?.name||id).join(', '):teacher(row.teacherId)?.name||'No teacher';
            const label=(subject(row)||'Lesson')+' · '+detail+' · '+row.startTime+'–'+row.endTime;
            const attrs=' data-board-day="'+day+'" data-board-period="'+esc(period.id)+'" data-rule-id="'+esc(row.id)+'"';
            return '<div draggable="true" class="tt-board-cell is-occupied '+(selected?'is-selected':'')+'"'+attrs+'><span class="tt-board-lesson-label">'+esc(label)+'</span>'+(span?'<span class="tt-board-span-count">'+span.periods+' periods</span>':'')+'<span class="tt-board-lesson-actions"><button type="button" class="tt-board-icon" data-edit-card'+attrs+' aria-label="Edit '+esc(days[day]+' '+label)+'" title="Edit lesson">'+editIcon+'</button><button type="button" class="tt-board-icon is-delete" data-delete-card'+attrs+' aria-label="Delete '+esc(days[day]+' '+label)+'" title="Delete lesson">'+deleteIcon+'</button></span></div>';
          }).join('')+'</td>';
        }).join('')+'</tr>').join('')+(periods.length<16?'<tr class="tt-board-add-row"><th scope="row"><button type="button" class="tt-board-add-period" data-add-period-board aria-label="Add another period"><span class="tt-board-add-period-icon" aria-hidden="true">＋</span><span>Add another period</span></button></th><td colspan="7"></td></tr>':'')+'</tbody></table>';
      }
      function renderEditor(){
        const row=activeEdit(),panel=$('tt-board-editor');panel.hidden=!row||!showDetails;
        if(editorDirty&&editing){panel.hidden=!showDetails;$('tt-save-lesson').disabled=!row;$('tt-delete-lesson').disabled=!row;if(!row)note('This lesson was removed in another tab. Copy any unsaved details, then close this editor.',true);return;}
        if(!row){editing=null;showDetails=false;editorSource='';return;}
        $('tt-save-lesson').disabled=false;$('tt-delete-lesson').disabled=false;editorSource=JSON.stringify(row);
        $('tt-board-editor-title').textContent='Edit '+days[editing.day]+' lesson';
        const subjectId=row.moduleId||'subject:'+row.programSubjectId;
        const subjects=modules();
        $('tt-edit-subject').innerHTML=subjects.map(item=>option(item.id,item.name,subjectId)).join('')+(subjects.some(item=>item.id===subjectId)?'':option(subjectId,'Unavailable: '+subjectId,subjectId));
        $('tt-edit-subject').value=subjectId;
        const classes=catalog().classes.filter(item=>item.active||row.classIds.includes(item.id));
        $('tt-edit-classes').innerHTML=classes.map(item=>'<label><input type="checkbox" value="'+esc(item.id)+'"'+(row.classIds.includes(item.id)?' checked':'')+'> '+esc(item.name)+(item.active?'':' (inactive)')+'</label>').join('')+row.classIds.filter(id=>!classes.some(item=>item.id===id)).map(id=>'<label><input type="checkbox" value="'+esc(id)+'" checked> Unavailable: '+esc(id)+'</label>').join('');
        const teachers=catalog().teachers.filter(item=>item.active||item.id===row.teacherId);
        $('tt-edit-teacher').innerHTML='<option value="">Not assigned (optional)</option>'+teachers.map(item=>option(item.id,item.name+(item.active?'':' (inactive)'),row.teacherId)).join('');
        $('tt-edit-teacher').value=row.teacherId||'';
        $('tt-edit-start').value=row.startTime.replace(':','h');$('tt-edit-end').value=row.endTime.replace(':','h');$('tt-edit-zoom').value=row.zoomLink||'';
      }
      function renderBreakEditor(){
        const row=activeBreakEdit(),panel=$('tt-break-editor');panel.hidden=!row;
        if(breakEditorDirty&&editingBreak){panel.hidden=false;$('tt-save-break').disabled=!row;$('tt-move-break').disabled=!row;$('tt-delete-break').disabled=!row;if(!row)note('This break was removed in another tab. Copy any unsaved details, then close this editor.',true);return;}
        if(!row){editingBreak=null;breakEditorSource='';closeBreakDialog();return;}
        $('tt-save-break').disabled=false;$('tt-move-break').disabled=false;$('tt-delete-break').disabled=false;breakEditorSource=JSON.stringify(row);
        $('tt-break-editor-title').textContent='Edit '+days[editingBreak.day]+' break';
        $('tt-break-label').value=row.label||'Break';$('tt-break-start').value=row.startTime.replace(':','h');$('tt-break-end').value=row.endTime.replace(':','h');
      }
      function render(){if(!state.data||!state.draft)return;learnerCache=new Map();$('tt-period-setup').hidden=Boolean(plan().periods.length);renderBoard();renderEditor();renderBreakEditor();renderAvailability();$('tt-clear-selection').disabled=!selectedMove&&!selectedBreakMove;$('tt-undo-placement').disabled=!undo.length;}
      function commit(){placementError=null;changed();render();}
      $('tt-create-periods').onclick=()=>{
        if(locked())return;
        if(plan().periods.length){note('Remove the existing periods before setting up a new set.',true);return;}
        const count=Number($('tt-period-count').value),length=Number($('tt-period-length').value),start=timeMinutes(normalizeTime($('tt-period-start').value));
        if(!Number.isInteger(count)||count<1||count>16||!Number.isInteger(length)||length<10||length>240||!Number.isFinite(start)||start+count*length>=1440){note('Choose 1–16 periods, a valid start time and a length that fits the day.',true);return;}
        $('tt-period-start').value=clock(start).replace(':','h');
        edit().periods=Array.from({length:count},(_,i)=>({id:'PERIOD-'+(i+1),startTime:clock(start+i*length),endTime:clock(start+(i+1)*length)}));
        note('Periods are ready. Adjust their times if the school day includes gaps.');commit();
      };
      function addPeriod(){
        if(locked()||!plan().periods.length)return;
        const periods=plan().periods;if(periods.length>=16){note('The board allows at most 16 periods.',true);return;}
        const last=periods.at(-1),start=timeMinutes(last.endTime),length=timeMinutes(last.endTime)-timeMinutes(last.startTime);
        if(!Number.isFinite(start)||!Number.isFinite(length)||length<=0||start+length>=1440){note('There is no room for another period at the end of this day.',true);return;}
        const before=structuredClone(periods);edit().periods.push({id:'PERIOD-'+crypto.randomUUID(),startTime:clock(start),endTime:clock(start+length)});
        saveUndo(structuredClone(state.draft.rules),before);note('Period added. Adjust its times in the board.');commit();
      }
      $('tt-board').onchange=event=>{
        if(locked())return;const data=event.target.dataset;
        if(data.quickSubject!==undefined){selectedSubject=event.target.value;activeBoardTab().subjectId=selectedSubject;if(placementError){clearPlacementError();renderBoard();}return;}
        if(data.quickTeacher!==undefined){selectedTeacher=event.target.value;activeBoardTab().teacherId=selectedTeacher;$('tt-board-teacher').value=selectedTeacher;if(placementError){clearPlacementError();renderBoard();}return;}
        if(data.quickClass!==undefined){selectedClass=event.target.value;activeBoardTab().classId=selectedClass;$('tt-board-class').value=selectedClass;if(placementError){clearPlacementError();renderBoard();}return;}
        const id=data.period,key=data.time,row=edit().periods.find(item=>item.id===id);
        if(!row||!['startTime','endTime'].includes(key))return;
        const value=normalizeTime(event.target.value),candidate={...row,[key]:value};
        if(!value||candidate.startTime>=candidate.endTime){note('Enter a valid start and end time, for example 745 for 07h45.',true);renderBoard();return;}
        const index=plan().periods.findIndex(item=>item.id===id),previous=plan().periods[index-1],next=plan().periods[index+1];
        if(previous&&candidate.startTime<previous.endTime||next&&candidate.endTime>next.startTime){note('Planning periods must stay in order and cannot overlap.',true);renderBoard();return;}
        if([...state.draft.rules,...breaks()].some(item=>overlap(item,row)&&!overlap(item,candidate))){note('A lesson or break would disappear from the board. Move or edit it first.',true);renderBoard();return;}
        const before=structuredClone(plan().periods);row[key]=value;event.target.value=value.replace(':','h');
        saveUndo(structuredClone(state.draft.rules),before);note('Period time updated. Existing lessons keep their own times.');commit();
      };
      $('tt-availability-tabs').onclick=event=>{const id=event.target.closest?.('[data-availability-teacher]')?.dataset.availabilityTeacher;if(id)switchAvailabilityTeacher(id);};
      $('tt-remove-teacher-settings').onclick=()=>{if(locked()||!availabilityTeacher)return;edit().availability=plan().availability.filter(row=>row.teacherId!==availabilityTeacher);edit().limits=plan().limits.filter(row=>row.teacherId!==availabilityTeacher);availabilityNote('Teacher availability and hour limit cleared.');commit();};
      $('tt-max-hours').onchange=event=>{
        if(locked()||!availabilityTeacher)return;
        const raw=event.target.value,limit=durationMinutes(raw);
        if(raw!==''&&(!Number.isInteger(limit)||limit<0||limit>10080)){availabilityNote('Enter a weekly limit such as 12h30.',true);renderAvailability();return;}
        edit().limits=plan().limits.filter(row=>row.teacherId!==availabilityTeacher);
        if(raw!=='')edit().limits.push({teacherId:availabilityTeacher,maxWeeklyMinutes:limit});
        commit();
      };
      $('tt-availability-grid').onclick=event=>{
        if(locked())return;
        const removeId=event.target.closest?.('[data-remove-availability]')?.dataset.removeAvailability;
        if(removeId){
          const row=ranges(availabilityTeacher).find(item=>item.id===removeId);if(!row)return;
          if(!window.confirm('Delete '+days[row.weekday]+' '+row.startTime.replace(':','h')+'–'+row.endTime.replace(':','h')+' availability for '+(teacher(availabilityTeacher)?.name||'this teacher')+'?'))return;
          edit().availability=plan().availability.filter(item=>item.id!==removeId);availabilityNote('Availability range deleted.');commit();return;
        }
        const editId=event.target.closest?.('[data-edit-availability]')?.dataset.editAvailability;
        if(editId){const row=ranges(availabilityTeacher).find(item=>item.id===editId);if(row)openAvailabilityDialog(row.weekday,row.id);return;}
        const day=Number(event.target.closest?.('[data-add-availability-day]')?.dataset.addAvailabilityDay??event.target.closest?.('[data-availability-day]')?.dataset.availabilityDay);
        if(dayOrder.includes(day))openAvailabilityDialog(day);
      };
      $('tt-availability-grid').ondragstart=event=>{
        const id=event.target.closest?.('[data-availability-range]')?.dataset.availabilityRange;
        if(locked()||!ranges(availabilityTeacher).some(row=>row.id===id)){event.preventDefault?.();return;}
        event.dataTransfer.setData('application/x-m4l-availability',id);event.dataTransfer.setData('text/plain',id);event.dataTransfer.effectAllowed='copy';
      };
      $('tt-availability-grid').ondragover=event=>{const cell=event.target.closest?.('[data-availability-day]');if(!locked()&&cell){event.preventDefault();event.dataTransfer.dropEffect='copy';cell.classList?.toggle('is-drag-over',true);}};
      $('tt-availability-grid').ondragleave=event=>{const cell=event.target.closest?.('[data-availability-day]');if(cell&&!cell.contains?.(event.relatedTarget))cell.classList?.toggle('is-drag-over',false);};
      $('tt-availability-grid').ondragend=()=>{$('tt-availability-grid').querySelectorAll?.('.is-drag-over').forEach(cell=>cell.classList.toggle('is-drag-over',false));};
      $('tt-availability-grid').ondrop=event=>{
        const cell=event.target.closest?.('[data-availability-day]');if(!cell||locked())return;
        event.preventDefault();cell.classList?.toggle('is-drag-over',false);
        const id=event.dataTransfer.getData('application/x-m4l-availability')||event.dataTransfer.getData('text/plain'),row=ranges(availabilityTeacher).find(item=>item.id===id),day=Number(cell.dataset.availabilityDay);
        if(!row||!dayOrder.includes(day))return;
        if(row.weekday===day){availabilityNote('Choose another day to copy this range.',true);return;}
        if(ranges(availabilityTeacher).some(item=>item.weekday===day&&overlap(item,row))){availabilityNote(days[day]+' already has an overlapping range.',true);return;}
        if(plan().availability.length>=240){availabilityNote('The timetable allows at most 240 availability ranges.',true);return;}
        edit().availability.push({...row,id:'AVAIL-'+crypto.randomUUID(),weekday:day});availabilityNote('Copied '+row.startTime.replace(':','h')+'–'+row.endTime.replace(':','h')+' to '+days[day]+'.');commit();
      };
      $('tt-availability-dialog').oncancel=event=>{event.preventDefault();closeAvailabilityDialog();availabilityNote('');};
      $('tt-availability-cancel').onclick=()=>{closeAvailabilityDialog();availabilityNote('');};
      for(const id of ['tt-availability-dialog-from','tt-availability-dialog-to'])$(id).onchange=event=>{const value=normalizeTime(event.target.value);if(value)event.target.value=value.replace(':','h');};
      $('tt-availability-save').onclick=()=>{
        if(locked()||!availabilityTeacher||!dayOrder.includes(availabilityDay))return;
        const startTime=normalizeTime($('tt-availability-dialog-from').value),endTime=normalizeTime($('tt-availability-dialog-to').value);
        if(!startTime||!endTime||startTime>=endTime){availabilityNote('Enter valid times, for example 745 for 07h45.',true);return;}
        if(ranges(availabilityTeacher).some(row=>row.id!==availabilityEditingId&&row.weekday===availabilityDay&&startTime<row.endTime&&row.startTime<endTime)){availabilityNote('This day already has an overlapping range.',true);return;}
        if(!availabilityEditingId&&plan().availability.length>=240){availabilityNote('The timetable allows at most 240 availability ranges.',true);return;}
        const row=availabilityEditingId?ranges(availabilityTeacher).find(item=>item.id===availabilityEditingId):null;
        if(availabilityEditingId&&!row){availabilityNote('This range changed. Close and reopen it.',true);return;}
        if(row){row.startTime=startTime;row.endTime=endTime;}else edit().availability.push({id:'AVAIL-'+crypto.randomUUID(),teacherId:availabilityTeacher,weekday:availabilityDay,startTime,endTime});
        closeAvailabilityDialog();availabilityNote(row?'Availability range updated.':'Availability range added.');commit();
      };
      $('tt-add-board-tab').onclick=()=>{
        if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before opening another board.',true);return;}
        if(boardTabs.length>=24){note('Close a board tab before opening another.',true);return;}
        const classIds=new Set(boardTabs.filter(tab=>tab.view==='class').map(tab=>tab.classId));
        const teacherIds=new Set(boardTabs.filter(tab=>tab.view==='teacher').map(tab=>tab.teacherId));
        const nextClass=catalog().classes.find(row=>row.active&&!classIds.has(row.id));
        const nextTeacher=catalog().teachers.find(row=>row.active&&!teacherIds.has(row.id));
        const tab={id:'BOARD-'+crypto.randomUUID(),view:nextClass?'class':nextTeacher?'teacher':boardView,classId:nextClass?.id||selectedClass,teacherId:nextTeacher&&!nextClass?nextTeacher.id:'',subjectId:'',emptyCell:null};
        boardTabs.push(tab);activateBoardTab(tab);note('Board tab opened. Choose a class or teacher to work on.');
      };
      $('tt-board-tabs').onclick=event=>{
        const closeId=event.target.closest?.('[data-close-board-tab]')?.dataset.closeBoardTab;
        const openId=event.target.closest?.('[data-board-tab]')?.dataset.boardTab;
        if(!closeId&&!openId)return;
        if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before switching board tabs.',true);return;}
        if(closeId){
          if(boardTabs.length===1)return;
          const index=boardTabs.findIndex(tab=>tab.id===closeId);if(index<0)return;
          const wasActive=closeId===activeBoardTabId;boardTabs.splice(index,1);
          if(wasActive)activateBoardTab(boardTabs[Math.min(index,boardTabs.length-1)]);else renderBoardTabs();
          return;
        }
        const tab=boardTabs.find(row=>row.id===openId);if(tab&&tab.id!==activeBoardTabId)activateBoardTab(tab);
      };
      $('tt-board-tabs').onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||editorDirty||breakEditorDirty||inlineDirty)return;
        const current=event.target.closest?.('[data-board-tab]');if(!current)return;
        const index=boardTabs.findIndex(tab=>tab.id===current.dataset.boardTab);if(index<0)return;
        event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?boardTabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+boardTabs.length)%boardTabs.length;
        activateBoardTab(boardTabs[next]);$('tt-board-tabs').querySelector?.('[data-board-tab="'+boardTabs[next].id+'"]')?.focus?.();
      };
      $('tt-board-view').onchange=event=>{if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before switching boards.',true);event.target.value=boardView;return;}boardView=event.target.value==='teacher'?'teacher':'class';selectedMove=null;selectedBreakMove=null;selectedEmpty=null;clearPlacementError();editing=null;editingBreak=null;renderBoard();renderEditor();renderBreakEditor();};
      $('tt-board-modes').onclick=event=>{
        const view=event.target.closest?.('[data-board-mode]')?.dataset.boardMode;
        if(!['teacher','class'].includes(view))return;
        if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before switching boards.',true);return;}
        if(view==='teacher'&&!selectedTeacher){openBoardViewDialog();$('tt-tab-view').value='teacher';updateBoardViewDialog();return;}
        $('tt-board-view').onchange({target:{value:view}});
      };
      $('tt-edit-board-view').onclick=()=>{if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before changing this board tab.',true);return;}openBoardViewDialog();};
      $('tt-board-class').onchange=event=>{if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before switching boards.',true);event.target.value=selectedClass;return;}selectedClass=event.target.value;selectedMove=null;selectedBreakMove=null;selectedEmpty=null;clearPlacementError();editing=null;editingBreak=null;renderBoard();renderEditor();renderBreakEditor();};
      $('tt-board-teacher').onchange=event=>{selectedTeacher=event.target.value;selectedMove=null;clearPlacementError();renderBoard();};
      $('tt-clear-selection').onclick=()=>{selectedMove=null;selectedBreakMove=null;clearPlacementError();renderBoard();};
      $('tt-mark-break').onclick=()=>{if(locked())return;if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before marking breaks.',true);return;}placingBreak=!placingBreak;selectedMove=null;selectedBreakMove=null;selectedEmpty=null;placementError=null;editing=null;editingBreak=null;note(placingBreak?'Enter a break name, then select an empty period on each weekday. Breaks apply to every class.':'Break marking stopped.');renderBoard();renderEditor();renderBreakEditor();};
      $('tt-board-editor').oninput=()=>{editorDirty=true;};$('tt-board-editor').onchange=()=>{editorDirty=true;};
      $('tt-break-editor').oninput=()=>{breakEditorDirty=true;};$('tt-break-editor').onchange=()=>{breakEditorDirty=true;};
      $('tt-tab-view').onchange=updateBoardViewDialog;
      $('tt-tab-view-class').onchange=()=>{$('tt-tab-view-error').hidden=true;};
      $('tt-tab-view-teacher').onchange=()=>{$('tt-tab-view-error').hidden=true;};
      $('tt-board-view-dialog').oncancel=event=>{event.preventDefault();$('tt-tab-view-cancel').onclick();};
      $('tt-tab-view-cancel').onclick=()=>{$('tt-board-view-dialog').close();};
      $('tt-tab-view-save').onclick=()=>{
        const view=$('tt-tab-view').value==='teacher'?'teacher':'class',choice=view==='teacher'?'tt-tab-view-teacher':'tt-tab-view-class';
        if(!$(choice).value){$('tt-tab-view-error').textContent='Choose a '+view+' for this board tab.';$('tt-tab-view-error').hidden=false;return;}
        const board=$('tt-board'),top=board.scrollTop,left=board.scrollLeft;
        boardView=view;if(view==='teacher')selectedTeacher=$(choice).value;else selectedClass=$(choice).value;
        selectedMove=null;selectedBreakMove=null;selectedEmpty=null;clearPlacementError();editing=null;editingBreak=null;placingBreak=false;
        $('tt-board-view-dialog').close();render();board.scrollTop=top;board.scrollLeft=left;
        note('This tab now shows the selected '+view+'.');
      };
      $('tt-quick-lesson-dialog').onchange=event=>{
        if(event.target.dataset.inlineSubject!==undefined){inlineSubject=event.target.value;inlineDirty=true;}
        if(event.target.dataset.inlineTeacher!==undefined){inlineTeacher=event.target.value;inlineDirty=true;}
        if(event.target.dataset.inlineClass!==undefined){inlineClass=event.target.value;inlineDirty=true;}
        $('tt-quick-error').hidden=true;
      };
      $('tt-quick-lesson-dialog').oncancel=event=>{event.preventDefault();$('tt-quick-cancel').onclick();};
      $('tt-quick-cancel').onclick=()=>{$('tt-close-lesson').onclick();};
      $('tt-quick-more').onclick=()=>{
        showDetails=true;renderEditor();
        $('tt-edit-subject').value=inlineSubject;$('tt-edit-teacher').value=inlineTeacher;
        if(boardView==='teacher'&&inlineClass!=='__keep__')for(const input of $('tt-edit-classes').querySelectorAll('input[type="checkbox"]'))input.checked=input.value===inlineClass;
        editorDirty=inlineDirty;inlineDirty=false;
        $('tt-quick-fields').hidden=true;$('tt-quick-period-actions').hidden=true;$('tt-quick-actions').hidden=true;
        $('tt-quick-lesson-dialog').classList.toggle('is-detailed',true);
        $('tt-edit-subject').focus?.();
      };
      $('tt-quick-save').onclick=()=>{
        if(locked()||!activeEdit())return;
        if(JSON.stringify(activeEdit())!==editorSource){note('This lesson changed in another tab. Close and reopen it before saving.',true);return;}
        $('tt-edit-subject').value=inlineSubject;$('tt-edit-teacher').value=inlineTeacher;
        quickClassOverride=boardView==='teacher'&&inlineClass!=='__keep__'?inlineClass:null;
        $('tt-save-lesson').onclick();quickClassOverride=null;
      };
      const readyForPeriodChange=()=>{
        if(locked()||!activeEdit())return false;
        if(inlineDirty){note('Save or cancel the lesson changes before splitting or merging.',true);return false;}
        if(JSON.stringify(activeEdit())!==editorSource){note('This lesson changed in another tab. Close and reopen it before changing its periods.',true);return false;}
        return true;
      };
      const finishPeriodChange=(before,message)=>{closeQuickDialog();editing=null;showDetails=false;editorDirty=false;inlineDirty=false;saveUndo(before);note(message);commit();};
      $('tt-quick-split').onclick=()=>{
        if(!readyForPeriodChange())return;
        const row=activeEdit(),day=editing.day,index=Number($('tt-quick-split-boundary').value),periods=plan().periods;
        if(!splitBoundaries(row).includes(index)){note('Choose a period boundary within this lesson.',true);return;}
        if(state.draft.rules.length+(row.weekdays.length===1?1:2)>100){note('The timetable has reached its 100 lesson row limit.',true);return;}
        const left={...structuredClone(row),id:'RULE-'+crypto.randomUUID(),weekdays:[day],endTime:periods[index].endTime};
        const right={...structuredClone(row),id:'RULE-'+crypto.randomUUID(),weekdays:[day],startTime:periods[index+1].startTime};
        for(const part of [left,right]){const why=reason({...part,weekday:day},{id:row.id,day});if(why){note(why,true);return;}}
        const before=structuredClone(state.draft.rules);
        row.weekdays=row.weekdays.filter(value=>value!==day);
        state.draft.rules=state.draft.rules.filter(item=>item.weekdays.length).concat(left,right);
        finishPeriodChange(before,periods[index].endTime===periods[index+1].startTime?'Lesson split into two periods.':'Lesson split into two periods; the gap between them is excluded.');
      };
      function mergeWith(direction){
        if(!readyForPeriodChange())return;
        const row=activeEdit(),day=editing.day,other=mergeCandidate(row,day,direction);
        if(!other){note('Matching lessons in consecutive periods are needed to merge.',true);return;}
        const first=direction<0?other:row,last=direction<0?row:other;
        const candidate={classIds:row.classIds,teacherId:row.teacherId,weekday:day,startTime:first.startTime,endTime:last.endTime};
        const why=reason(candidate,[{id:row.id,day},{id:other.id,day}]);if(why){note(why,true);return;}
        if(state.draft.rules.length+(row.weekdays.length>1&&other.weekdays.length>1?1:0)>100){note('The timetable has reached its 100 lesson row limit.',true);return;}
        const before=structuredClone(state.draft.rules),merged={...structuredClone(first),id:'RULE-'+crypto.randomUUID(),weekdays:[day],startTime:first.startTime,endTime:last.endTime};
        row.weekdays=row.weekdays.filter(value=>value!==day);other.weekdays=other.weekdays.filter(value=>value!==day);
        state.draft.rules=state.draft.rules.filter(item=>item.weekdays.length).concat(merged);
        finishPeriodChange(before,'Lessons merged into one longer lesson.');
      }
      $('tt-quick-merge-previous').onclick=()=>mergeWith(-1);
      $('tt-quick-merge-next').onclick=()=>mergeWith(1);
      $('tt-close-lesson').onclick=()=>{closeQuickDialog();editing=null;showDetails=false;editorDirty=false;inlineDirty=false;renderEditor();};
      $('tt-save-lesson').onclick=()=>{
        if(locked())return;const row=activeEdit();if(!row)return;
        if(editorDirty&&JSON.stringify(row)!==editorSource){note('This lesson changed in another tab. Copy your edits, close the editor and reopen the lesson.',true);return;}
        const subjectId=$('tt-edit-subject').value,entry=modules().find(item=>item.id===subjectId);
        const classIds=quickClassOverride===null?[...$('tt-edit-classes').querySelectorAll('input:checked')].map(input=>input.value):quickClassOverride?[quickClassOverride]:[];
        const teacherId=$('tt-edit-teacher').value,startTime=normalizeTime($('tt-edit-start').value),endTime=normalizeTime($('tt-edit-end').value),zoomLink=$('tt-edit-zoom').value.trim();
        if(!entry||!classIds.length){note('Choose a subject and at least one class.',true);return;}
        if(!Number.isFinite(timeMinutes(startTime))||!Number.isFinite(timeMinutes(endTime))||startTime>=endTime){note('Enter a valid start and end time, such as 08h00 to 08h45.',true);return;}
        if(classIds.length>1&&!zoomLink){note('Combined classes need a shared lesson link.',true);return;}
        if(zoomLink){try{const url=new URL(zoomLink);if(url.protocol!=='https:'||url.username||url.password)throw Error();}catch{note('Enter a valid https:// lesson link.',true);return;}}
        const candidate={classIds,teacherId,weekday:editing.day,startTime,endTime},why=reason(candidate,editing);if(why){note(why,true);return;}
        if(row.weekdays.length>1&&state.draft.rules.length>=100){note('The timetable has reached its 100 lesson row limit.',true);return;}
        const before=structuredClone(state.draft.rules),patch={moduleId:subjectId.startsWith('subject:')?'':subjectId,programSubjectId:subjectId.startsWith('subject:')?subjectId.slice(8):catalog().modules.find(item=>item.id===subjectId)?.programSubjectId||'',classIds,teacherId,startTime,endTime,zoomLink};
        if(row.weekdays.length===1)Object.assign(row,patch);
        else{row.weekdays=row.weekdays.filter(day=>day!==editing.day);state.draft.rules.push({...structuredClone(row),...patch,id:'RULE-'+crypto.randomUUID(),weekdays:[editing.day]});}
        closeQuickDialog();editing=null;showDetails=false;editorDirty=false;inlineDirty=false;saveUndo(before);note('Lesson updated for this weekday.');commit();
      };
      $('tt-delete-lesson').onclick=()=>{
        if(locked())return;const row=activeEdit();if(!row)return;
        if(editorDirty||inlineDirty){note('Save or close your edits before deleting the lesson.',true);return;}
        if(!window.confirm('Delete the '+days[editing.day]+' lesson? This clears only the selected weekday. The period and lessons on other weekdays remain.'))return false;
        const before=structuredClone(state.draft.rules);
        if(row.weekdays.length===1)state.draft.rules=state.draft.rules.filter(item=>item.id!==row.id);
        else row.weekdays=row.weekdays.filter(day=>day!==editing.day);
        closeQuickDialog();editing=null;showDetails=false;editorDirty=false;inlineDirty=false;saveUndo(before);note('Lesson deleted from this weekday; the period remains.');commit();return true;
      };
      $('tt-break-dialog').oncancel=event=>{event.preventDefault();$('tt-close-break').onclick();};
      $('tt-close-break').onclick=()=>{closeBreakDialog();editingBreak=null;breakEditorDirty=false;renderBoard();renderBreakEditor();};
      $('tt-move-break').onclick=()=>{if(locked()||!activeBreakEdit())return;if(breakEditorDirty){note('Save or close your edits before moving the break.',true);return;}selectedBreakMove=editingBreak;editingBreak=null;placingBreak=false;closeBreakDialog();note('Choose an empty period for this break.');renderBoard();renderBreakEditor();};
      $('tt-save-break').onclick=()=>{
        if(locked())return;const row=activeBreakEdit();if(!row)return;
        if(breakEditorDirty&&JSON.stringify(row)!==breakEditorSource){note('This break changed in another tab. Copy your edits, then reopen it.',true);return;}
        const label=$('tt-break-label').value.trim()||'Break',startTime=normalizeTime($('tt-break-start').value),endTime=normalizeTime($('tt-break-end').value);
        if(label.length>80){note('Keep break names within 80 characters.',true);return;}
        const why=breakReason({weekday:editingBreak.day,startTime,endTime},editingBreak);if(why){note(why,true);return;}
        if(row.weekdays.length>1&&breaks().length>=40){note('The timetable allows at most 40 break rows.',true);return;}
        const before=structuredClone(breaks()),patch={label,startTime,endTime};
        if(row.weekdays.length===1)Object.assign(row,patch);
        else{row.weekdays=row.weekdays.filter(day=>day!==editingBreak.day);editBreaks().push({...structuredClone(row),...patch,id:'BREAK-'+crypto.randomUUID(),weekdays:[editingBreak.day]});}
        editingBreak=null;breakEditorDirty=false;closeBreakDialog();saveUndo(structuredClone(state.draft.rules),null,before);note('Break updated for this weekday.');commit();
      };
      $('tt-delete-break').onclick=()=>{
        if(locked())return;const row=activeBreakEdit();if(!row)return;
        if(breakEditorDirty){note('Save or close your edits before deleting the break.',true);return false;}
        if(!window.confirm('Delete the '+days[editingBreak.day]+' break for every class? Other weekdays stay in place.'))return false;
        const before=structuredClone(breaks());
        if(row.weekdays.length===1)state.draft.breaks=breaks().filter(item=>item.id!==row.id);
        else row.weekdays=row.weekdays.filter(day=>day!==editingBreak.day);
        editingBreak=null;breakEditorDirty=false;closeBreakDialog();saveUndo(structuredClone(state.draft.rules),null,before);note('Break removed from this weekday.');commit();return true;
      };
      $('tt-board').onclick=event=>{
        const action=event.target.dataset||{};
        if(action.cancelQuick!==undefined){selectedEmpty=null;clearPlacementError();renderBoard();return;}
        if(event.target.closest?.('[data-add-period-board]')){addPeriod();return;}
        if(event.target.closest?.('[data-edit-board-view]')){if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before changing this board tab.',true);return;}openBoardViewDialog();return;}
        const deleteCard=event.target.closest?.('[data-delete-card]');
        if(deleteCard){
          if(locked()||editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before deleting a lesson.',true);return;}
          const previous=editing;
          editing={id:deleteCard.dataset.ruleId,day:Number(deleteCard.dataset.boardDay)};
          if(!$('tt-delete-lesson').onclick())editing=previous;
          return;
        }
        const deleteBreakCard=event.target.closest?.('[data-delete-break-card]');
        if(deleteBreakCard){
          if(locked()||editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before deleting a break.',true);return;}
          const previous=editingBreak;
          editingBreak={id:deleteBreakCard.dataset.breakId,day:Number(deleteBreakCard.dataset.boardDay)};
          if(!$('tt-delete-break').onclick())editingBreak=previous;
          return;
        }
        const removeId=event.target.closest?.('[data-remove-period]')?.dataset.removePeriod;
        if(removeId){
          if(locked())return;const period=plan().periods.find(row=>row.id===removeId);if(!period)return;
          if([...state.draft.rules,...breaks()].some(row=>overlap(row,period))){note('Move or delete lessons and breaks in this period before removing it.',true);return;}
          const before=structuredClone(plan().periods);edit().periods=plan().periods.filter(row=>row.id!==removeId);selectedMove=null;
          saveUndo(structuredClone(state.draft.rules),before);note('Period removed.');commit();return;
        }
        const button=event.target.closest?.('[data-board-period]')||event.target.closest?.('[data-break-id]')||event.target.closest?.('[data-break-gap-start]');if(!button||locked())return;
        const day=Number(button.dataset.boardDay);
        if(button.dataset.breakId){
          if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before selecting another.',true);return;}
          selectedMove=null;selectedBreakMove=null;selectedEmpty=null;placementError=null;placingBreak=false;editing=null;editingBreak={id:button.dataset.breakId,day};breakEditorDirty=false;
          renderBoard();renderEditor();renderBreakEditor();$('tt-break-dialog').showModal();return;
        }
        if(button.dataset.breakGapStart&&!placingBreak&&!selectedBreakMove)return;
        const period=plan().periods.find(row=>row.id===button.dataset.boardPeriod)||(button.dataset.breakGapStart&&button.dataset.breakGapEnd?{id:'',startTime:button.dataset.breakGapStart,endTime:button.dataset.breakGapEnd}:null);if(!period)return;
        if(button.dataset.openLesson==='true'&&!selectedMove&&!selectedBreakMove&&!placingBreak){
          if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before adding another.',true);return;}
          selectedEmpty={day,periodId:period.id};placementError=null;editing=null;editingBreak=null;note(boardView==='teacher'?'Choose a subject and class in this period, then select Add.':'Choose a subject and optional teacher in this period, then select Add.');renderBoard();renderEditor();renderBreakEditor();return;
        }
        if(button.dataset.ruleId){
          if(editorDirty||breakEditorDirty||inlineDirty){note('Save or close the open item before selecting another.',true);return;}
          const row=state.draft.rules.find(item=>item.id===button.dataset.ruleId);if(!row)return;
          selectedMove=null;selectedBreakMove=null;selectedEmpty=null;placementError=null;placingBreak=false;editingBreak=null;editing={id:row.id,day};showDetails=false;inlineSubject=row.moduleId||'subject:'+row.programSubjectId;inlineTeacher=row.teacherId||'';inlineClass=row.classIds.length===1?row.classIds[0]:'__keep__';editorDirty=false;inlineDirty=false;note('Edit this lesson or use More details.');renderEditor();renderBreakEditor();openQuickDialog();return;
        }
        const sourceBreak=selectedBreakMove&&breaks().find(row=>row.id===selectedBreakMove.id);
        if(sourceBreak||placingBreak){
          const label=sourceBreak?.label||$('tt-board-break-label').value.trim()||'Break';
          if(label.length>80){note('Keep break names within 80 characters.',true);return;}
          const candidate={weekday:day,startTime:period.startTime,endTime:period.endTime},why=breakReason(candidate,selectedBreakMove);if(why){note(why,true);return;}
          const merge=!sourceBreak&&breaks().find(row=>row.label===label&&row.startTime===period.startTime&&row.endTime===period.endTime&&!row.weekdays.includes(day));
          if(breaks().length>=40&&(!sourceBreak&&!merge||sourceBreak?.weekdays.length>1)){note('The timetable allows at most 40 break rows.',true);return;}
          const before=structuredClone(breaks()),hadBreaks=Object.hasOwn(state.draft,'breaks');
          if(sourceBreak){
            if(sourceBreak.weekdays.length===1){sourceBreak.weekdays=[day];sourceBreak.startTime=period.startTime;sourceBreak.endTime=period.endTime;}
            else{sourceBreak.weekdays=sourceBreak.weekdays.filter(value=>value!==selectedBreakMove.day);editBreaks().push({...structuredClone(sourceBreak),id:'BREAK-'+crypto.randomUUID(),weekdays:[day],startTime:period.startTime,endTime:period.endTime});}
            selectedBreakMove=null;note('Break moved.');
          }else if(merge){merge.weekdays.push(day);note('Break marked on another weekday.');}
          else{editBreaks().push({id:'BREAK-'+crypto.randomUUID(),label,weekdays:[day],startTime:period.startTime,endTime:period.endTime});note('Break marked for every class on this weekday.');}
          selectedEmpty=null;saveUndo(structuredClone(state.draft.rules),null,before,hadBreaks);commit();return;
        }
        const source=selectedMove&&state.draft.rules.find(row=>row.id===selectedMove.id);
        if(!source&&(!selectedClass||!selectedSubject)){rejectPlacement(day,period,'Choose a class and subject before adding a lesson.');return;}
        const moduleId=selectedSubject.startsWith('subject:')?'':selectedSubject,programSubjectId=moduleId?catalog().modules.find(row=>row.id===moduleId)?.programSubjectId:selectedSubject.slice(8);
        const targetIndex=plan().periods.findIndex(item=>item.id===period.id),sourceSpan=source?Math.max(1,periodIndices(source).length):1,endPeriod=plan().periods[targetIndex+sourceSpan-1];
        if(!endPeriod){rejectPlacement(day,period,'This move needs '+sourceSpan+' consecutive periods. Choose an earlier starting period.');return;}
        const candidate={classIds:source?source.classIds:[selectedClass],teacherId:source?source.teacherId:selectedTeacher,weekday:day,startTime:period.startTime,endTime:endPeriod.endTime};
        const why=reason(candidate,selectedMove);if(why){rejectPlacement(day,period,why);return;}
        const merge=!source&&state.draft.rules.find(row=>row.moduleId===moduleId&&row.programSubjectId===programSubjectId&&row.teacherId===selectedTeacher&&row.classIds.length===1&&row.classIds[0]===selectedClass&&row.startTime===period.startTime&&row.endTime===period.endTime&&!row.zoomLink&&!row.weekdays.includes(day));
        if(state.draft.rules.length>=100&&(!source&&!merge||source?.weekdays.length>1)){rejectPlacement(day,period,'The timetable has reached its 100 lesson row limit.');return;}
        const before=structuredClone(state.draft.rules);
        if(source){
          if(source.weekdays.length===1){source.weekdays=[day];source.startTime=candidate.startTime;source.endTime=candidate.endTime;}
          else{source.weekdays=source.weekdays.filter(value=>value!==selectedMove.day);state.draft.rules.push({...structuredClone(source),id:'RULE-'+crypto.randomUUID(),weekdays:[day],startTime:candidate.startTime,endTime:candidate.endTime});}
          selectedMove=null;note('Lesson moved.');
        }else if(merge){
          merge.weekdays.push(day);note('Lesson placed on another weekday.');
        }else{
          state.draft.rules.push({id:'RULE-'+crypto.randomUUID(),moduleId,programSubjectId,teacherId:selectedTeacher,classIds:[selectedClass],weekdays:[day],startTime:period.startTime,endTime:period.endTime,zoomLink:''});
          note('Lesson placed.');
        }
        selectedEmpty=null;
        saveUndo(before);
        commit();
      };
      $('tt-board').ondragstart=event=>{
        const breakCard=event.target.closest?.('[data-break-id]');
        if(breakCard?.dataset.breakId){
          if(locked()||editorDirty||breakEditorDirty||inlineDirty||event.target.closest?.('[data-edit-break-card],[data-delete-break-card]')){event.preventDefault?.();return;}
          event.dataTransfer?.setData('text/plain',JSON.stringify({program:boardParams.get('program'),kind:'break',id:breakCard.dataset.breakId,day:Number(breakCard.dataset.boardDay)}));
          if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
          return;
        }
        const card=event.target.closest?.('[data-rule-id]');if(!card?.dataset.ruleId||locked()||editorDirty||breakEditorDirty||inlineDirty||event.target.closest?.('[data-edit-card],[data-delete-card]')){event.preventDefault?.();return;}
        event.dataTransfer?.setData('text/plain',JSON.stringify({program:boardParams.get('program'),id:card.dataset.ruleId,day:Number(card.dataset.boardDay)}));
        if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
      };
      $('tt-board').ondragover=event=>{
        const period=event.target.closest?.('[data-board-period]'),gap=event.target.closest?.('[data-break-gap-start]');
        if((period?.dataset.openLesson!==undefined||gap?.dataset.breakGapStart!==undefined)&&!locked()){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}
      };
      $('tt-board').ondrop=event=>{
        const period=event.target.closest?.('[data-board-period]'),gap=event.target.closest?.('[data-break-gap-start]'),target=period?.dataset.openLesson!==undefined?period:gap;
        if(!target||locked()||editorDirty||breakEditorDirty||inlineDirty)return;
        let payload;try{payload=JSON.parse(event.dataTransfer?.getData('text/plain')||'');}catch{return;}
        if(payload.kind==='break'){
          if(payload.program!==boardParams.get('program')||!breaks().some(row=>row.id===payload.id&&row.weekdays.includes(payload.day)))return;
          event.preventDefault();selectedBreakMove={id:payload.id,day:payload.day};selectedMove=null;selectedEmpty=null;placingBreak=false;editing=null;editingBreak=null;
          $('tt-board').onclick({target:{dataset:target.dataset,closest:selector=>selector==='[data-board-period]'&&target===period?period:selector==='[data-break-gap-start]'&&target===gap?gap:null}});
          return;
        }
        if(target!==period)return;
        if(payload.program!==boardParams.get('program')||!state.draft.rules.some(row=>row.id===payload.id&&row.weekdays.includes(payload.day)))return;
        event.preventDefault();selectedMove={id:payload.id,day:payload.day};selectedBreakMove=null;selectedEmpty=null;placingBreak=false;editing=null;editingBreak=null;inlineDirty=false;
        $('tt-board').onclick({target:{dataset:target.dataset,closest:selector=>selector==='[data-board-period]'?target:null}});
      };
      return {render,reset(){
        closeQuickDialog();closeBreakDialog();closeAvailabilityDialog();if($('tt-board-view-dialog').open)$('tt-board-view-dialog').close();
        selectedMove=null;selectedBreakMove=null;selectedEmpty=null;placementError=null;placingBreak=false;editing=null;editingBreak=null;
        showDetails=false;editorDirty=false;editorSource='';inlineDirty=false;quickClassOverride=null;breakEditorDirty=false;breakEditorSource='';
        for(const tab of boardTabs)tab.emptyCell=null;
        undo.length=0;note('');availabilityNote('');
      },undo(){if(!undo.length)return;const last=undo.at(-1);if(JSON.stringify(state.draft.rules)!==last.after||JSON.stringify(plan().periods)!==last.afterPeriods||JSON.stringify(breaks())!==last.afterBreaks){undo.length=0;note('The board changed after that action. Review the latest draft before undoing.',true);render();return;}undo.pop();state.draft.rules=last.before;if(last.beforePeriods)edit().periods=last.beforePeriods;if(last.beforeBreaks){if(last.hadBreaks)state.draft.breaks=last.beforeBreaks;else delete state.draft.breaks;}selectedMove=null;selectedBreakMove=null;selectedEmpty=null;editing=null;editingBreak=null;editorDirty=false;inlineDirty=false;breakEditorDirty=false;note('Last board change undone.');commit();}};
    }
  };
})();
