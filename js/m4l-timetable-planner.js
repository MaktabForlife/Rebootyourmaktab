/* V105.3.4 — manual placement guidance for the weekly Program timetable. */
(()=>{'use strict';
  const timeMinutes=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
  const clock=minutes=>String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  const duration=minutes=>Math.floor(minutes/60)+'h'+String(minutes%60).padStart(2,'0');
  const durationMinutes=value=>{const input=String(value||'').trim(),parts=/^(\d{1,3})[hH:]([0-5]\d)$/.exec(input);return parts?Number(parts[1])*60+Number(parts[2]):input!==''&&Number.isInteger(Number(input)*60)?Number(input)*60:NaN;};
  const overlap=(a,b)=>timeMinutes(a.startTime)<timeMinutes(b.endTime)&&timeMinutes(b.startTime)<timeMinutes(a.endTime);
  const dayOrder=[1,2,3,4,5,6,0];
  window.M4L_ASSISTED_PLANNER={
    mount({state,$,esc,days,modules,changed,locked}){
      let selectedClass='',selectedNeed='',availabilityTeacher='',selectedMove=null,learnerCache=new Map();
      const undo=[];
      const empty=()=>({periods:[],requirements:[],availability:[],limits:[]});
      const plan=()=>state.draft?.planner||empty();
      const edit=()=>state.draft.planner ||= empty();
      const catalog=()=>state.data.catalog;
      const teacher=id=>catalog().teachers.find(row=>row.id===id);
      const cls=id=>catalog().classes.find(row=>row.id===id);
      const subject=row=>row.moduleId?catalog().modules.find(m=>m.id===row.moduleId)?.name:catalog().subjects.find(s=>s.id===row.programSubjectId)?.name;
      const note=(value,error=false)=>{$('tt-board-message').textContent=value;$('tt-board-message').classList.toggle('is-error',error);};
      const option=(id,name,selected)=>'<option value="'+esc(id)+'"'+(id===selected?' selected':'')+'>'+esc(name)+'</option>';
      function learnersOverlap(leftClasses,rightClasses,weekday){
        const key=[leftClasses.slice().sort().join(','),rightClasses.slice().sort().join(','),weekday,state.effectiveFrom||state.data.today].join('|');
        if(learnerCache.has(key))return learnerCache.get(key);
        const memberships=catalog().enrollments.filter(row=>row.active);
        for(const left of memberships.filter(row=>leftClasses.includes(row.classId)))for(const right of memberships.filter(row=>rightClasses.includes(row.classId)&&row.accountId===left.accountId)){
          const start=[state.effectiveFrom||state.data.today||'0000-01-01',left.startDate,right.startDate].sort().at(-1),end=[left.endDate||'2099-12-31',right.endDate||'2099-12-31'].sort()[0];
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
      function scheduled(need){return state.draft.rules.filter(row=>row.teacherId===need.teacherId&&(row.programSubjectId||catalog().modules.find(module=>module.id===row.moduleId)?.programSubjectId)===need.programSubjectId&&row.moduleId===need.moduleId&&row.classIds.includes(need.classId)&&Number.isFinite(timeMinutes(row.startTime))&&Number.isFinite(timeMinutes(row.endTime))&&row.startTime<row.endTime).reduce((n,row)=>n+(timeMinutes(row.endTime)-timeMinutes(row.startTime))*row.weekdays.length,0);}
      function availability(teacherId,weekday,periodId){const row=plan().availability.find(item=>item.teacherId===teacherId),key=weekday+':'+periodId;return row?.unavailable.includes(key)?'UNAVAILABLE':row?.preferred.includes(key)?'PREFERRED':'AVAILABLE';}
      function reason(candidate,ignore){
        if(!Number.isFinite(timeMinutes(candidate.startTime))||!Number.isFinite(timeMinutes(candidate.endTime))||candidate.startTime>=candidate.endTime)return 'Set valid period times first.';
        if(state.draft.breaks?.some(row=>row.weekdays.includes(candidate.weekday)&&overlap(row,candidate)))return 'This period overlaps a break.';
        for(const row of plan().availability.filter(item=>item.teacherId===candidate.teacherId))for(const key of row.unavailable){
          const [day,periodId]=key.split(':'),period=plan().periods.find(p=>p.id===periodId);
          if(Number(day)===candidate.weekday&&period&&overlap(period,candidate))return (teacher(candidate.teacherId)?.name||'Teacher')+' is unavailable.';
        }
        for(const row of state.draft.rules){
          if(row.id===ignore?.id&&candidate.weekday===ignore.day)continue;
          if(!row.weekdays.includes(candidate.weekday)||!overlap(row,candidate))continue;
          if(candidate.classIds.some(id=>row.classIds.includes(id)))return 'This class already has a lesson.';
          if(candidate.teacherId&&row.teacherId===candidate.teacherId)return (teacher(candidate.teacherId)?.name||'Teacher')+' already teaches another class.';
          if(learnersOverlap(candidate.classIds,row.classIds,candidate.weekday))return 'A learner belongs to both classes at this time.';
        }
        const limit=plan().limits.find(row=>row.teacherId===candidate.teacherId);
        const replacing=ignore&&state.draft.rules.find(row=>row.id===ignore.id);
        const oldMinutes=replacing&&replacing.teacherId===candidate.teacherId?timeMinutes(replacing.endTime)-timeMinutes(replacing.startTime):0;
        if(limit&&total(candidate.teacherId)-oldMinutes+timeMinutes(candidate.endTime)-timeMinutes(candidate.startTime)>limit.maxWeeklyMinutes)return 'This placement exceeds the teacher’s weekly hour limit.';
        return '';
      }
      function renderPeriods(){
        $('tt-period-list').innerHTML=plan().periods.map((row,i)=>'<label>Period '+(i+1)+' <input data-period="'+esc(row.id)+'" data-time="startTime" aria-label="Period '+(i+1)+' start" value="'+esc(row.startTime.replace(':','h'))+'">–<input data-period="'+esc(row.id)+'" data-time="endTime" aria-label="Period '+(i+1)+' end" value="'+esc(row.endTime.replace(':','h'))+'"><button type="button" class="pb-secondary" data-remove-period="'+esc(row.id)+'" aria-label="Remove period '+(i+1)+'">×</button></label>').join('')||'<p class="tt-scope">Set up periods to start the planning board.</p>';
      }
      function renderAvailability(){
        const teachers=[...catalog().teachers.filter(row=>row.active)];
        for(const id of new Set([...plan().availability.map(row=>row.teacherId),...plan().limits.map(row=>row.teacherId)]))if(!teachers.some(row=>row.id===id))teachers.push({id,name:'Unavailable: '+id});
        if(!teachers.some(row=>row.id===availabilityTeacher))availabilityTeacher=teachers[0]?.id||'';
        $('tt-availability-teacher').innerHTML=teachers.map(row=>option(row.id,row.name,availabilityTeacher)).join('');
        $('tt-availability-teacher').value=availabilityTeacher;
        const limit=plan().limits.find(row=>row.teacherId===availabilityTeacher);
        $('tt-max-hours').value=limit?duration(limit.maxWeeklyMinutes):'';
        $('tt-remove-teacher-settings').disabled=!plan().availability.some(row=>row.teacherId===availabilityTeacher)&&!limit;
        const periods=plan().periods;
        $('tt-availability-grid').innerHTML=!periods.length||!availabilityTeacher?'<p class="tt-scope">Add periods and an eligible teacher to set availability.</p>':'<table class="tt-planner-table"><thead><tr><th>Period</th>'+dayOrder.map(day=>'<th>'+days[day]+'</th>').join('')+'</tr></thead><tbody>'+periods.map((period,i)=>'<tr><th>'+(i+1)+' · '+esc(period.startTime)+'–'+esc(period.endTime)+'</th>'+dayOrder.map(day=>{const status=availability(availabilityTeacher,day,period.id);return '<td><button type="button" class="tt-planner-cell '+(status==='UNAVAILABLE'?'is-unavailable':status==='PREFERRED'?'is-preferred':'')+'" data-availability-day="'+day+'" data-availability-period="'+esc(period.id)+'" aria-label="'+esc(days[day]+' '+period.startTime+'–'+period.endTime+' '+status.toLowerCase())+'">'+(status==='UNAVAILABLE'?'Unavailable':status==='PREFERRED'?'Preferred':'Available')+'</button></td>';}).join('')+'</tr>').join('')+'</tbody></table>';
      }
      function renderRequirements(){
        const classes=catalog().classes.filter(row=>row.active),teachers=catalog().teachers.filter(row=>row.active);
        const selected={subject:$('tt-need-subject').value,classId:$('tt-need-class').value,teacherId:$('tt-need-teacher').value};
        $('tt-need-subject').innerHTML='<option value="">Choose…</option>'+modules().map(row=>option(row.id,row.name,'')).join('');
        $('tt-need-class').innerHTML='<option value="">Choose…</option>'+classes.map(row=>option(row.id,row.name,'')).join('');
        $('tt-need-teacher').innerHTML='<option value="">Choose…</option>'+teachers.map(row=>option(row.id,row.name,'')).join('');
        if(modules().some(row=>row.id===selected.subject))$('tt-need-subject').value=selected.subject;
        if(classes.some(row=>row.id===selected.classId))$('tt-need-class').value=selected.classId;
        if(teachers.some(row=>row.id===selected.teacherId))$('tt-need-teacher').value=selected.teacherId;
        $('tt-requirements').innerHTML=plan().requirements.map(row=>{const done=scheduled(row),missing=Math.max(0,row.weeklyMinutes-done);return '<div class="tt-planner-requirement '+(missing?'is-incomplete':'')+'"><strong>'+esc(cls(row.classId)?.name||row.classId)+' · '+esc(subject(row)||'Missing subject')+' · '+esc(teacher(row.teacherId)?.name||row.teacherId)+'</strong><label>Time needed <input inputmode="numeric" data-need-hours="'+esc(row.id)+'" value="'+esc(duration(row.weeklyMinutes))+'"></label><span>'+duration(done)+' scheduled'+(missing?' · '+duration(missing)+' remaining':' · complete')+'</span><button type="button" class="pb-secondary" data-remove-need="'+esc(row.id)+'">Remove</button></div>';}).join('')||'<p class="tt-scope">Add a weekly teaching requirement to track what remains.</p>';
      }
      function renderBoard(){
        const classes=catalog().classes.filter(row=>row.active);
        if(!classes.some(row=>row.id===selectedClass))selectedClass=classes[0]?.id||'';
        $('tt-board-class').innerHTML=classes.map(row=>option(row.id,row.name,selectedClass)).join('');
        $('tt-board-class').value=selectedClass;
        const needs=plan().requirements.filter(row=>row.classId===selectedClass);
        if(!needs.some(row=>row.id===selectedNeed))selectedNeed=needs[0]?.id||'';
        $('tt-board-need').innerHTML=needs.map(row=>option(row.id,(subject(row)||'Subject')+' · '+(teacher(row.teacherId)?.name||'Teacher')+' · '+duration(Math.max(0,row.weeklyMinutes-scheduled(row)))+' left',selectedNeed)).join('');
        $('tt-board-need').value=selectedNeed;
        const periods=plan().periods;
        if(!selectedClass||!periods.length){$('tt-board').innerHTML='<p class="tt-scope">Choose a class and set up periods to use the board.</p>';return;}
        $('tt-board').innerHTML='<table class="tt-planner-table"><thead><tr><th>Period</th>'+dayOrder.map(day=>'<th>'+days[day]+'</th>').join('')+'</tr></thead><tbody>'+periods.map((period,i)=>'<tr><th>'+(i+1)+' · '+esc(period.startTime)+'–'+esc(period.endTime)+'</th>'+dayOrder.map(day=>{
          const rows=state.draft.rules.filter(row=>row.classIds.includes(selectedClass)&&row.weekdays.includes(day)&&overlap(row,period));
          const row=rows[0],need=needs.find(row=>row.id===selectedNeed);
          const moving=selectedMove&&state.draft.rules.find(item=>item.id===selectedMove.id);
          const candidate=moving||need?{classIds:moving?moving.classIds:[selectedClass],teacherId:moving?moving.teacherId:need.teacherId,weekday:day,startTime:period.startTime,endTime:period.endTime}:null;
          const why=!row&&candidate?reason(candidate,selectedMove):'';
          const preferred=!row&&!why&&candidate&&availability(candidate.teacherId,day,period.id)==='PREFERRED';
          const selected=row&&selectedMove?.id===row.id&&selectedMove.day===day;
          const label=row?(subject(row)||'Lesson')+' · '+(teacher(row.teacherId)?.name||'No teacher')+(rows.length>1?' · +'+(rows.length-1)+' more':''):why||(preferred?'Preferred · Add lesson':'Add lesson');
          return '<td><button type="button" class="tt-planner-cell '+(row?'is-occupied ':'')+(why?'is-conflict ':'')+(preferred?'is-preferred ':'')+(selected?'is-selected':'')+'" data-board-day="'+day+'" data-board-period="'+esc(period.id)+'"'+(row?' data-rule-id="'+esc(row.id)+'"':'')+' aria-label="'+esc(days[day]+' '+period.startTime+'–'+period.endTime+' '+label)+'">'+esc(label)+'</button></td>';
        }).join('')+'</tr>').join('')+'</tbody></table>';
      }
      function renderReview(){
        const teacherIds=new Set([...plan().limits.map(row=>row.teacherId),...state.draft.rules.map(row=>row.teacherId).filter(Boolean)]);
        $('tt-planner-review').innerHTML=[...teacherIds].map(id=>{const used=total(id),limit=plan().limits.find(row=>row.teacherId===id)?.maxWeeklyMinutes;return '<span class="'+(limit!==undefined&&used>limit?'is-over':'')+'">'+esc(teacher(id)?.name||id)+': '+duration(used)+(limit===undefined?'':' / '+duration(limit)+' max')+'</span>';}).join('')||'<span>No teacher hours scheduled yet.</span>';
      }
      function render(){if(!state.data||!state.draft)return;learnerCache=new Map();renderPeriods();renderAvailability();renderRequirements();renderBoard();renderReview();$('tt-clear-selection').disabled=!selectedMove;$('tt-undo-placement').disabled=!undo.length;}
      function commit(){changed();render();}
      $('tt-create-periods').onclick=()=>{
        if(locked())return;
        if(plan().periods.length){note('Remove the existing periods before setting up a new set.',true);return;}
        const count=Number($('tt-period-count').value),length=Number($('tt-period-length').value),start=timeMinutes(String($('tt-period-start').value).replace(/[hH]/,':').replace(/^(\d):/,'0$1:'));
        if(!Number.isInteger(count)||count<1||count>16||!Number.isInteger(length)||length<10||length>240||!Number.isFinite(start)||start+count*length>=1440){note('Choose 1–16 periods, a valid start time and a length that fits the day.',true);return;}
        edit().periods=Array.from({length:count},(_,i)=>({id:'PERIOD-'+(i+1),startTime:clock(start+i*length),endTime:clock(start+(i+1)*length)}));
        note('Periods are ready. Adjust their times if the school day includes gaps.');commit();
      };
      $('tt-period-list').onchange=event=>{
        if(locked())return;const id=event.target.dataset.period,key=event.target.dataset.time,row=edit().periods.find(item=>item.id===id);
        if(!row||!['startTime','endTime'].includes(key))return;
        const value=String(event.target.value).replace(/[hH]/,':').replace(/^(\d):/,'0$1:');
        if(!Number.isFinite(timeMinutes(value))){note('Use a time such as 08h45.',true);renderPeriods();return;}
        row[key]=value;note('Period time updated.');commit();
      };
      $('tt-period-list').onclick=event=>{const id=event.target.dataset.removePeriod;if(!id||locked())return;edit().periods=plan().periods.filter(row=>row.id!==id);for(const row of edit().availability){row.preferred=row.preferred.filter(key=>key.slice(2)!==id);row.unavailable=row.unavailable.filter(key=>key.slice(2)!==id);}selectedMove=null;commit();};
      $('tt-availability-teacher').onchange=event=>{availabilityTeacher=event.target.value;renderAvailability();};
      $('tt-remove-teacher-settings').onclick=()=>{if(locked()||!availabilityTeacher)return;edit().availability=plan().availability.filter(row=>row.teacherId!==availabilityTeacher);edit().limits=plan().limits.filter(row=>row.teacherId!==availabilityTeacher);note('Teacher availability and hour limit cleared.');commit();};
      $('tt-max-hours').onchange=event=>{
        if(locked()||!availabilityTeacher)return;
        const raw=event.target.value,limit=durationMinutes(raw);
        if(raw!==''&&(!Number.isInteger(limit)||limit<0||limit>10080)){note('Enter a weekly limit such as 12h30.',true);renderAvailability();return;}
        edit().limits=plan().limits.filter(row=>row.teacherId!==availabilityTeacher);
        if(raw!=='')edit().limits.push({teacherId:availabilityTeacher,maxWeeklyMinutes:limit});
        commit();
      };
      $('tt-availability-grid').onclick=event=>{
        const button=event.target.closest?.('[data-availability-period]');if(!button||locked()||!availabilityTeacher)return;
        const weekday=Number(button.dataset.availabilityDay),periodId=button.dataset.availabilityPeriod,current=availability(availabilityTeacher,weekday,periodId);
        let row=edit().availability.find(item=>item.teacherId===availabilityTeacher);
        if(!row){row={teacherId:availabilityTeacher,preferred:[],unavailable:[]};edit().availability.push(row);}
        const key=weekday+':'+periodId;
        row.preferred=row.preferred.filter(value=>value!==key);row.unavailable=row.unavailable.filter(value=>value!==key);
        if(current==='AVAILABLE')row.preferred.push(key);
        if(current==='PREFERRED')row.unavailable.push(key);
        commit();
      };
      $('tt-add-need').onclick=()=>{
        if(locked())return;
        const choice=$('tt-need-subject').value,classId=$('tt-need-class').value,teacherId=$('tt-need-teacher').value,weeklyMinutes=durationMinutes($('tt-need-hours').value);
        if(!choice||!classId||!teacherId||!Number.isInteger(weeklyMinutes)||weeklyMinutes<1||weeklyMinutes>10080){note('Choose a subject, class, teacher and teaching time such as 3h20.',true);return;}
        const moduleId=choice.startsWith('subject:')?'':choice,programSubjectId=moduleId?catalog().modules.find(row=>row.id===moduleId)?.programSubjectId:choice.slice(8);
        if(plan().requirements.some(row=>row.classId===classId&&row.teacherId===teacherId&&row.moduleId===moduleId&&row.programSubjectId===programSubjectId)){note('That requirement already exists. Adjust it before adding another.',true);return;}
        const id='NEED-'+crypto.randomUUID();edit().requirements.push({id,moduleId,programSubjectId,classId,teacherId,weeklyMinutes});
        selectedClass=classId;selectedNeed=id;note('Requirement added. Choose a period on the planning board.');commit();
      };
      $('tt-requirements').onclick=event=>{const id=event.target.dataset.removeNeed;if(!id||locked())return;edit().requirements=plan().requirements.filter(row=>row.id!==id);selectedNeed='';commit();};
      $('tt-requirements').onchange=event=>{const id=event.target.dataset.needHours,row=plan().requirements.find(item=>item.id===id);if(!row||locked())return;const weeklyMinutes=durationMinutes(event.target.value);if(!Number.isInteger(weeklyMinutes)||weeklyMinutes<1||weeklyMinutes>10080){note('Enter teaching time such as 3h20.',true);renderRequirements();return;}row.weeklyMinutes=weeklyMinutes;commit();};
      $('tt-board-class').onchange=event=>{selectedClass=event.target.value;selectedMove=null;renderBoard();};
      $('tt-board-need').onchange=event=>{selectedNeed=event.target.value;selectedMove=null;renderBoard();};
      $('tt-clear-selection').onclick=()=>{selectedMove=null;renderBoard();};
      $('tt-board').onclick=event=>{
        const button=event.target.closest?.('[data-board-period]');if(!button||locked())return;
        const day=Number(button.dataset.boardDay),period=plan().periods.find(row=>row.id===button.dataset.boardPeriod);if(!period)return;
        if(button.dataset.ruleId){
          selectedMove=selectedMove?.id===button.dataset.ruleId&&selectedMove.day===day?null:{id:button.dataset.ruleId,day};
          note(selectedMove?'Lesson selected. Tap an empty period to move it.':'Move selection cleared.');renderBoard();return;
        }
        const source=selectedMove&&state.draft.rules.find(row=>row.id===selectedMove.id);
        const need=plan().requirements.find(row=>row.id===selectedNeed&&row.classId===selectedClass);
        if(!source&&!need){note('Add and select a teaching requirement first.',true);return;}
        const candidate={classIds:source?source.classIds:[selectedClass],teacherId:source?source.teacherId:need.teacherId,weekday:day,startTime:period.startTime,endTime:period.endTime};
        const why=reason(candidate,selectedMove);if(why){note(why,true);return;}
        const merge=!source&&state.draft.rules.find(row=>row.moduleId===need.moduleId&&row.programSubjectId===need.programSubjectId&&row.teacherId===need.teacherId&&row.classIds.length===1&&row.classIds[0]===need.classId&&row.startTime===period.startTime&&row.endTime===period.endTime&&!row.zoomLink&&!row.weekdays.includes(day));
        if(state.draft.rules.length>=100&&(!source&&!merge||source?.weekdays.length>1)){note('The timetable has reached its 100 lesson row limit.',true);return;}
        const before=structuredClone(state.draft.rules);
        if(source){
          if(source.weekdays.length===1){source.weekdays=[day];source.startTime=period.startTime;source.endTime=period.endTime;}
          else{source.weekdays=source.weekdays.filter(value=>value!==selectedMove.day);state.draft.rules.push({...structuredClone(source),id:'RULE-'+crypto.randomUUID(),weekdays:[day],startTime:period.startTime,endTime:period.endTime});}
          selectedMove=null;note('Lesson moved.');
        }else if(merge){
          merge.weekdays.push(day);note('Lesson placed on another weekday.');
        }else{
          state.draft.rules.push({id:'RULE-'+crypto.randomUUID(),moduleId:need.moduleId,programSubjectId:need.programSubjectId,teacherId:need.teacherId,classIds:[need.classId],weekdays:[day],startTime:period.startTime,endTime:period.endTime,zoomLink:''});
          note('Lesson placed.');
        }
        undo.push({before,after:JSON.stringify(state.draft.rules)});if(undo.length>20)undo.shift();
        commit();
      };
      return {render,undo(){if(!undo.length)return;if(JSON.stringify(state.draft.rules)!==undo.at(-1).after){undo.length=0;note('The lessons changed after that placement. Use the detailed editor to adjust them.',true);render();return;}state.draft.rules=undo.pop().before;selectedMove=null;note('Last placement or move undone.');commit();}};
    }
  };
})();
