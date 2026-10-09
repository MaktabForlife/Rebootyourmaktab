/* V105.3.3.4 — single-class and single-teacher time-positioned timetables. */
(()=>{'use strict';
  const table=window.M4L_TIMETABLE_PRESENTATION;
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minutes=t=>{const [h,m]=String(t).split(':').map(Number);return h*60+m;};
  const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}h${String(n%60).padStart(2,'0')}`;
  const font=(ctx,size,bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px Arial, sans-serif`;};
  function wrap(ctx,text,width){
    const lines=[];let line='';
    for(const word of String(text||'').split(/\s+/u)){
      if(ctx.measureText(word).width>width){if(line){lines.push(line);line='';}for(const char of word){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}}
      else if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;
    }
    if(line)lines.push(line);return lines;
  }
  function model(result,options={}){
    const weekly=result.pattern==='WEEKLY',lessons=result.occurrences.filter(r=>r.kind!=='BREAK');
    const timetableType=options.program?'program':options.teacherId?'teacher':'class',targetId=options.teacherId||options.classId||lessons[0]?.classIds[0]||'';
    const selectedLessons=lessons.filter(r=>timetableType==='program'||(timetableType==='teacher'?(r.teacherIds||[r.teacherId]).includes(targetId):r.classIds.includes(targetId)));
    const selectedDays=new Set(selectedLessons.map(r=>weekly?r.weekday:r.date));
    const selected=table.displayOccurrences(result.occurrences.filter(r=>r.kind==='BREAK'?(timetableType!=='teacher'||selectedDays.has(weekly?r.weekday:r.date)):(timetableType==='program'||(timetableType==='teacher'?(r.teacherIds||[r.teacherId]).includes(targetId):r.classIds.includes(targetId)))),{program:timetableType==='program'});
    const match=selectedLessons[0],classIndex=match?.classIds.indexOf(targetId)??-1;
    const timetableName=timetableType==='program'?(result.snapshot?.programName||options.programName||'Program'):timetableType==='teacher'?(match?.teacherNames?.[(match?.teacherIds||[]).indexOf(targetId)]||match?.teacherName||targetId):(classIndex>=0?match.classNames[classIndex]:targetId);
    const base=table.model(result,{...options,classId:timetableType==='class'?targetId:''});
    const allClassIds=options.allClassIds?.length?options.allClassIds:[...new Set(lessons.flatMap(r=>r.classIds))];
    const events=selected.map((r,i)=>({
      key:r.anchor||`${r.ruleId||i}@${weekly?r.weekday:r.date}`,ruleId:r.ruleId,day:weekly?r.weekday:r.date,
      start:minutes(r.startTime),end:minutes(r.endTime),title:r.label||r.moduleName||r.subjectName||'Lesson',teacher:timetableType==='teacher'?'':table.teacherLabel(r),classes:r.kind==='BREAK'?'':timetableType==='program'?(allClassIds.length>1&&allClassIds.every(id=>r.classIds.includes(id))?'All classes':r.classNames.join(', ')):timetableType==='teacher'?r.classNames.join(', '):'',
      url:r.status==='CANCELLED'?'':table.link(r.zoomLink),cancelled:r.status==='CANCELLED',kind:r.kind||'LESSON',
      identity:JSON.stringify([r.moduleId||'',r.programSubjectId||'',r.assignmentMode||'',(r.teacherIds||[r.teacherId]).slice().sort(),r.classIds.slice().sort()])
    })).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start);
    const columns=weekly?[1,2,3,4,5,6,0].filter(day=>timetableType==='program'&&day>=1&&day<=5||events.some(event=>event.day===day)).map(day=>({id:day,label:days[day]})):[...new Set(events.map(event=>event.day))].sort().map(day=>({id:day,label:day}));
    return {...base,timetableType,timetableName,allClassNames:options.allClassNames||[...new Set(lessons.flatMap(r=>r.classNames))],columns,events,start:events.length?Math.floor(Math.min(...events.map(r=>r.start))/30)*30:0,end:events.length?Math.ceil(Math.max(...events.map(r=>r.end))/30)*30:0};
  }
  // Interval groups use separate lanes: simultaneous classes never cover one another.
  function position(m,offset=0,count=m.columns.length){
    const placed=[];
    m.columns.slice(offset,offset+count).forEach((day,col)=>{
      const events=m.events.filter(e=>e.day===day.id).map(e=>({...e,col})).sort((a,b)=>a.start-b.start||a.end-b.end||a.key.localeCompare(b.key));
      let group=[],ends=[],until=-1;
      const flush=()=>{for(const item of group)placed.push({...item,lanes:ends.length,span:1});group=[];ends=[];};
      for(const event of events){if(event.start>=until)flush();let lane=ends.findIndex(end=>end<=event.start);if(lane<0)lane=ends.length;ends[lane]=event.end;group.push({...event,lane});until=Math.max(until,event.end);}flush();
    });
    const signature=e=>JSON.stringify([e.start,e.end,e.title,e.teacher,e.classes,e.url,e.cancelled,e.kind,e.identity]);
    const merged=[],used=new Set();
    for(const event of placed){
      if(used.has(event))continue;const block={...event};used.add(event);
      // A shared block is safe only when it is alone in each matching day column.
      if(m.layout.mergeShared&&event.lanes===1)while(true){const next=placed.find(e=>!used.has(e)&&e.col===event.col+block.span&&e.lanes===1&&signature(e)===signature(event));if(!next)break;used.add(next);block.span++;}
      merged.push(block);
    }
    return merged;
  }
  function scene(m,createCanvas,offset=0,count=m.columns.length){
    const width=Math.max(1600,count*200+160),left=130,right=30,dayWidth=(width-left-right)/Math.max(1,count),ctx=createCanvas(1,1).getContext('2d');
    const blocks=position(m,offset,count).map(block=>{
      const x=left+block.col*dayWidth+block.lane*dayWidth/block.lanes+5,w=dayWidth*block.span/block.lanes-10;
      const fields=[
        {text:`${clock(block.start)} - ${clock(block.end)}`,size:14,bold:true,color:'#65516b'},
        {text:block.title,size:20,bold:true,color:block.url?'#713d83':'#34243d',title:true},
        {text:block.teacher,size:16,color:'#443b4a'},
        {text:block.classes,size:14,color:'#685f6e'},
        ...(block.cancelled?[{text:'Cancelled',size:14,color:'#685f6e'}]:[])
      ].filter(f=>f.text);
      const rows=[];let row={runs:[],width:0,height:0};
      const flush=()=>{if(row.runs.length)rows.push(row);row={runs:[],width:0,height:0};};
      // Short entries use their horizontal space instead of stretching every lesson.
      const compact=block.end-block.start<=20;
      if(compact)fields.unshift(...fields.splice(1,1));
      for(const field of fields){
        font(ctx,field.size,field.bold);
        for(const text of wrap(ctx,field.text,Math.max(1,w-20))){
          const runWidth=ctx.measureText(text).width,gap=row.runs.length?16:0;
          if(!compact||row.width+gap+runWidth>w-20)flush();
          const dx=row.width+(row.runs.length?16:0);
          row.runs.push({...field,text,dx,width:runWidth});row.width=dx+runWidth;row.height=Math.max(row.height,field.size+3);
          if(!compact)flush();
        }
      }
      flush();let dy=0;const lines=[];
      for(const r of rows){for(const run of r.runs)lines.push({...run,dx:(w-r.width)/2+run.dx,dy:dy+r.height-3-run.size});dy+=r.height;}
      return {...block,x,width:w,lines,needed:dy+10};
    });
    // 30 minutes start at 60px; retain one proportional clock scale and legible text.
    const scale=Math.max(2,...blocks.map(b=>(b.needed+6)/(b.end-b.start)));
    blocks.forEach(b=>{b.y=(b.start-m.start)*scale;b.height=(b.end-b.start)*scale;});
    return {width,left,right,dayWidth,columns:m.columns.slice(offset,offset+count),blocks,scale,height:(m.end-m.start)*scale,start:m.start,end:m.end};
  }
  function header(m){return `<header class="tt-block-heading"><img src="/logo.png" alt="Academy logo"><div><p>${esc(m.academy)}</p><h2>${esc(`${m.timetableName} ${m.title}`)}</h2></div></header>`;}
  function html(m,createCanvas){
    if(!m.events.length)return '<p class="tt-empty">No lessons to display.</p>';
    const s=scene(m,createCanvas),top=64,ticks=[];
    for(let t=s.start;t<=s.end;t+=30){const y=top+(t-s.start)*s.scale;ticks.push(`<line x1="${s.left}" x2="${s.width-s.right}" y1="${y}" y2="${y}" stroke="#d9cddd"/><text x="${s.left-18}" y="${y+6}" text-anchor="end" font-size="17" fill="#6c5a74">${clock(t)}</text>`);}
    const cols=s.columns.map((c,i)=>`<rect x="${s.left+i*s.dayWidth+3}" y="4" width="${s.dayWidth-6}" height="44" rx="10" fill="#e4d5eb"/><text x="${s.left+(i+.5)*s.dayWidth}" y="33" text-anchor="middle" font-size="23" font-weight="bold" fill="#4c3058">${esc(c.label)}</text><line x1="${s.left+i*s.dayWidth}" x2="${s.left+i*s.dayWidth}" y1="${top}" y2="${top+s.height}" stroke="#e5dce9"/>`).join('');
    const blocks=s.blocks.map(b=>{
      const y=top+b.y+3,height=b.height-6,isBreak=b.kind==='BREAK',fill=b.cancelled?'#eeeef0':isBreak?'#edf4f1':'#f7f0fb',stroke=isBreak?'#91b0a2':'#b598c3';
      const textTop=y+(height-b.needed+10)/2;
      const text=b.lines.map(line=>{const value=`<text x="${b.x+line.dx}" y="${textTop+line.dy+line.size}" font-size="${line.size}" font-weight="${line.bold?'bold':'normal'}" fill="${line.color}" ${line.title&&b.cancelled?'text-decoration="line-through"':''}>${esc(line.text)}</text>`;return line.title&&b.url?`<a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(b.title+' meeting link')}">${value.replace('<text ','<text text-decoration="underline" ')}</a>`:value;}).join('');
      return `<g role="group" aria-label="${esc(`${b.title}, ${clock(b.start)} to ${clock(b.end)}, ${b.teacher}, ${b.classes}`)}"><rect x="${b.x}" y="${y}" width="${b.width}" height="${height}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>${text}</g>`;
    }).join('');
    return `<section class="tt-block-sheet">${header(m)}<svg class="tt-block-grid" viewBox="0 0 ${s.width} ${top+s.height+28}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="${esc(m.timetableName)} timetable blocks positioned by start and end time" style="min-width:${Math.max(850,m.columns.length*230+120)}px;font-family:Arial,sans-serif">${cols}${ticks.join('')}${blocks}</svg><p class="tt-block-footnote">${esc(m.stamp)} · ${esc(m.timezone)}</p></section>`;
  }
  function rounded(ctx,x,y,w,h,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,14);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
  // One Program publication is shown in time bands. Parallel class lessons remain
  // separate cards, while a combined lesson appears once with "All classes".
  function programRows(m,measure,width){
    const bands=[];
    for(const event of [...m.events].sort((a,b)=>a.start-b.start||a.end-b.end)){
      const last=bands.at(-1);
      if(last&&event.start<last.end){last.end=Math.max(last.end,event.end);last.events.push(event);}
      else bands.push({start:event.start,end:event.end,events:[event]});
    }
    return bands.map(band=>{
      const cells=m.columns.map(day=>band.events.filter(event=>event.day===day.id).sort((a,b)=>a.start-b.start||a.classes.localeCompare(b.classes)).map(event=>{
        const lines=[];
        for(const [value,size,bold] of [[`${clock(event.start)}–${clock(event.end)}`,15,true],[event.title,19,true],[event.classes,15,false],[event.teacher,15,false],...(event.cancelled?[['Cancelled',14,false]]:[])]){
          if(!value)continue;font(measure,size,bold);
          for(const line of wrap(measure,value,width-26))lines.push({text:line,size,bold,color:event.cancelled?'#756877':bold?'#392742':'#5f5365',url:bold&&size===19?event.url:''});
        }
        return {...event,lines,height:lines.reduce((sum,line)=>sum+line.size+4,0)+16};
      }));
      return {...band,cells,height:Math.max(88,...cells.map(items=>items.reduce((sum,item)=>sum+item.height+8,12)))};
    });
  }
  function programScene(m,createCanvas){
    const width=Math.max(1600,m.columns.length*300+140),left=130,right=25,dayWidth=(width-left-right)/Math.max(1,m.columns.length);
    const measure=createCanvas(1,1).getContext('2d');
    return {width,left,right,dayWidth,columns:m.columns,rows:programRows(m,measure,dayWidth-12)};
  }
  function programHtml(m,createCanvas){
    if(!m.events.length)return '<p class="tt-empty">No lessons to display.</p>';
    const s=programScene(m,createCanvas);
    return `<section class="tt-block-sheet tt-program-sheet">${header(m)}<p class="tt-program-roster">All classes: ${m.allClassNames.map(esc).join(' · ')}</p><div class="tt-program-scroll"><table class="tt-program-grid"><caption class="pb-sr-only">${esc(m.timetableName)} timetable for all classes</caption><thead><tr><th scope="col">Time</th>${s.columns.map(day=>`<th scope="col">${esc(day.label)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(row=>`<tr><th scope="row">${clock(row.start)}–${clock(row.end)}</th>${row.cells.map(items=>`<td>${items.map(item=>`<div class="tt-program-lesson ${item.cancelled?'tt-cancelled':''}"><strong>${esc(clock(item.start)+'–'+clock(item.end))}</strong>${item.url&&!item.cancelled?`<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`:`<b>${esc(item.title)}</b>`}<span>${esc(item.classes)}</span>${item.teacher?`<span>${esc(item.teacher)}</span>`:''}</div>`).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="tt-block-footnote">${esc(m.stamp)} · ${esc(m.timezone)}</p></section>`;
  }
  function programCanvases(m,createCanvas,logo){
    if(!m.events.length)throw Error('There are no lessons to export.');
    const s=programScene(m,createCanvas),W=s.width,measure=createCanvas(1,1).getContext('2d');font(measure,17);
    const roster=wrap(measure,'All classes: '+m.allClassNames.join(' · '),W-250),top=145+roster.length*23,headerHeight=47,H=Math.max(1132,top+headerHeight+s.rows.reduce((sum,row)=>sum+row.height,0)+65);
    const canvas=createCanvas(W,H),ctx=canvas.getContext('2d'),links=[];
    ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.textBaseline='top';
    if(logo)ctx.drawImage(logo,40,25,86,86);
    font(ctx,23,true);ctx.fillStyle='#42304b';ctx.fillText(m.academy,W/2,22);
    font(ctx,32,true);ctx.fillText(`${m.timetableName} ${m.title}`,W/2,60);
    font(ctx,17);ctx.fillStyle='#685f6e';roster.forEach((line,index)=>ctx.fillText(line,W/2,105+index*23));
    const heads=[{x:0,w:s.left,text:'Time'},...s.columns.map((day,i)=>({x:s.left+i*s.dayWidth,w:s.dayWidth,text:day.label}))];
    for(const head of heads){ctx.fillStyle='#e4d5eb';ctx.fillRect(head.x,top,head.w,headerHeight);ctx.strokeStyle='#bdadc4';ctx.strokeRect(head.x,top,head.w,headerHeight);font(ctx,21,true);ctx.fillStyle='#4c3058';ctx.fillText(head.text,head.x+head.w/2,top+10);}
    let y=top+headerHeight;
    for(const row of s.rows){
      ctx.strokeStyle='#d9cddd';ctx.strokeRect(0,y,s.left,row.height);font(ctx,17,true);ctx.fillStyle='#4c3058';ctx.fillText(`${clock(row.start)}–${clock(row.end)}`,s.left/2,y+16);
      row.cells.forEach((items,index)=>{
        const x=s.left+index*s.dayWidth;ctx.strokeStyle='#d9cddd';ctx.strokeRect(x,y,s.dayWidth,row.height);
        let cy=y+7;
        for(const item of items){
          rounded(ctx,x+5,cy,s.dayWidth-10,item.height-3,item.cancelled?'#eeeef0':item.kind==='BREAK'?'#edf4f1':'#f7f0fb',item.kind==='BREAK'?'#91b0a2':'#b598c3');
          let ty=cy+8;ctx.textAlign='left';
          for(const line of item.lines){font(ctx,line.size,line.bold);ctx.fillStyle=line.color;ctx.fillText(line.text,x+14,ty);if(line.url&&!item.cancelled){const textWidth=ctx.measureText(line.text).width;ctx.fillRect(x+14,ty+line.size+1,textWidth,1);links.push({url:line.url,x:x+14,y:ty,width:textWidth,height:line.size+3});}ty+=line.size+4;}
          ctx.textAlign='center';cy+=item.height+8;
        }
      });
      y+=row.height;
    }
    font(ctx,15);ctx.fillStyle='#685f6e';ctx.fillText(`${m.stamp} · ${m.timezone}`,W/2,H-32);
    return [{canvas,links}];
  }
  function canvases(m,createCanvas,logo){
    if(m.timetableType==='program')return programCanvases(m,createCanvas,logo);
    if(!m.events.length)throw Error('There are no lessons to export.');
    const s=scene(m,createCanvas),W=s.width;
    const measure=createCanvas(1,1).getContext('2d'),headings=[];
    for(const [text,size,bold] of [[m.academy,22,true],[`${m.timetableName} ${m.title}`,30,true]]){font(measure,size,bold);for(const line of wrap(measure,text,W-350))headings.push({text:line,size,bold});}
    const gridTop=30+headings.reduce((n,l)=>n+l.size+7,0)+66;
    // Grow the export vertically so a complete class or teacher timetable stays together.
    const H=Math.max(1132,Math.ceil(gridTop+s.height+60));
    const canvas=createCanvas(W,H),ctx=canvas.getContext('2d'),links=[];ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.textBaseline='top';
    if(logo)ctx.drawImage(logo,42,30,78,78);let y=28;
    for(const line of headings){font(ctx,line.size,line.bold);ctx.fillStyle='#42304b';ctx.fillText(line.text,W/2,y);y+=line.size+7;}
    s.columns.forEach((day,i)=>{rounded(ctx,s.left+i*s.dayWidth+3,gridTop-54,s.dayWidth-6,42,'#e4d5eb','#e4d5eb');font(ctx,23,true);ctx.fillStyle='#4c3058';ctx.fillText(day.label,s.left+(i+.5)*s.dayWidth,gridTop-46);});
    const bottom=gridTop+s.height;
    ctx.strokeStyle='#e5dce9';ctx.lineWidth=1;for(let i=0;i<=s.columns.length;i++){const x=s.left+i*s.dayWidth;ctx.beginPath();ctx.moveTo(x,gridTop);ctx.lineTo(x,bottom);ctx.stroke();}
    const times=[s.start,...Array.from({length:Math.max(0,Math.floor(s.end/30)-Math.ceil(s.start/30)+1)},(_,i)=>(Math.ceil(s.start/30)+i)*30),s.end];
    for(const t of [...new Set(times)]){const ty=gridTop+(t-s.start)*s.scale;ctx.strokeStyle=t%30?'#eee6f0':'#d9cddd';ctx.beginPath();ctx.moveTo(s.left,ty);ctx.lineTo(W-s.right,ty);ctx.stroke();font(ctx,17);ctx.textAlign='right';ctx.fillStyle='#6c5a74';ctx.fillText(clock(Math.round(t)),s.left-18,Math.min(bottom-17,Math.max(gridTop,ty-8)));}
    ctx.textAlign='center';
    for(const b of s.blocks){
      const by=gridTop+b.y+3,height=b.height-6;
      rounded(ctx,b.x,by,b.width,height,b.cancelled?'#eeeef0':b.kind==='BREAK'?'#edf4f1':'#f7f0fb',b.kind==='BREAK'?'#91b0a2':'#b598c3');
      const textTop=by+(height-b.needed+10)/2;
      ctx.textAlign='left';
      for(const line of b.lines){const lx=b.x+line.dx,ly=textTop+line.dy;font(ctx,line.size,line.bold);ctx.fillStyle=line.color;ctx.fillText(line.text,lx,ly);if(line.title&&b.url){ctx.fillRect(lx,ly+line.size+1,line.width,1);links.push({url:b.url,x:lx,y:ly,width:line.width,height:line.size+3});}}
      ctx.textAlign='center';
    }
    font(ctx,15);ctx.fillStyle='#685f6e';ctx.fillText(`${m.stamp} · ${m.timezone}`,W/2,H-32);
    return [{canvas,links}];
  }
  window.M4L_TIMETABLE_BLOCKS={model,position,scene,html:(m,createCanvas)=>m.timetableType==='program'?programHtml(m,createCanvas):html(m,createCanvas),canvases,programScene};
})();
