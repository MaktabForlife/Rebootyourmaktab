/* V105.3.3.3 — optional time-positioned blocks; the table renderer is unchanged. */
(()=>{'use strict';
  const table=window.M4L_TIMETABLE_PRESENTATION;
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
    const base=table.model(result,options),weekly=result.pattern==='WEEKLY';
    const events=result.occurrences.filter(r=>r.kind==='BREAK'||!options.classId||r.classIds.includes(options.classId)).map((r,i)=>({
      key:r.anchor||`${r.ruleId||i}@${weekly?r.weekday:r.date}`,ruleId:r.ruleId,day:weekly?r.weekday:r.date,
      start:minutes(r.startTime),end:minutes(r.endTime),title:r.moduleName||r.subjectName||'Lesson',teacher:r.teacherName||'',classes:r.classNames.join(', '),
      url:r.status==='CANCELLED'?'':table.link(r.zoomLink),cancelled:r.status==='CANCELLED',kind:r.kind||'LESSON',
      identity:JSON.stringify([r.moduleId||'',r.programSubjectId||'',r.teacherId||'',r.classIds.slice().sort()])
    })).filter(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.end>r.start);
    return {...base,events,start:events.length?Math.floor(Math.min(...events.map(r=>r.start))/30)*30:0,end:events.length?Math.ceil(Math.max(...events.map(r=>r.end))/30)*30:0};
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
  function header(m){return `<header class="tt-block-heading"><img src="/logo.png" alt="Academy logo"><div><p>${esc(m.academy)}</p><h2>${esc(m.program)}</h2><h3>${esc(m.title)}</h3><p>${esc(m.classes)}</p></div></header><p class="tt-block-stamp">${esc(m.stamp)} · ${esc(m.timezone)}</p>`;}
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
    return `<section class="tt-block-sheet">${header(m)}<svg class="tt-block-grid" viewBox="0 0 ${s.width} ${top+s.height+28}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Timetable blocks positioned by start and end time" style="min-width:${Math.max(850,m.columns.length*230+120)}px;font-family:Arial,sans-serif">${cols}${ticks.join('')}${blocks}</svg></section>`;
  }
  function rounded(ctx,x,y,w,h,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,14);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
  function canvases(m,createCanvas,logo){
    if(!m.events.length)throw Error('There are no lessons to export.');
    const pages=[],W=1600,H=1132;
    for(let offset=0;offset<m.columns.length;offset+=7){
      const s=scene(m,createCanvas,offset,Math.min(7,m.columns.length-offset));let from=m.start;
      // Estimate the heading once; repeat it on every exported page.
      const measure=createCanvas(1,1).getContext('2d'),headings=[];
      for(const [text,size,bold] of [[m.academy,22,true],[m.program,30,true],[m.title,21,true],[m.classes,18,false],[`${m.stamp} · ${m.timezone}`,16,false]]){font(measure,size,bold);for(const line of wrap(measure,text,W-350))headings.push({text:line,size,bold});}
      const gridTop=30+headings.reduce((n,l)=>n+l.size+7,0)+66,capacity=H-gridTop-58;
      while(from<m.end){
        if(pages.length>=40)throw Error('This block view needs too many pages. Filter to a class or use Table view for export.');
        let to=Math.min(m.end,Math.floor(from+capacity/s.scale));
        // Avoid cutting a short block into fragments too small for its full details.
        const candidates=Array.from({length:Math.max(0,to-from)},(_,i)=>to-i);
        const fits=t=>s.blocks.every(b=>{
          const duration=Math.min(b.end,t)-Math.max(b.start,from),continued=b.start<from||b.end>t;
          if(duration>0&&duration*s.scale<b.needed+6+(continued?20:0))return false;
          return !(b.start<t&&b.end>t&&(b.end-t)*s.scale<b.needed+26);
        });
        to=candidates.find(fits);
        if(to===undefined)throw Error('A block is too tall for a PDF page. Filter to a class or use Table view.');
        const canvas=createCanvas(W,H),ctx=canvas.getContext('2d'),links=[];ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,W,H);ctx.textAlign='center';ctx.textBaseline='top';
        if(logo)ctx.drawImage(logo,42,30,78,78);let y=28;
        for(const line of headings){font(ctx,line.size,line.bold);ctx.fillStyle='#42304b';ctx.fillText(line.text,W/2,y);y+=line.size+7;}
        s.columns.forEach((day,i)=>{rounded(ctx,s.left+i*s.dayWidth+3,gridTop-54,s.dayWidth-6,42,'#e4d5eb','#e4d5eb');font(ctx,23,true);ctx.fillStyle='#4c3058';ctx.fillText(day.label,s.left+(i+.5)*s.dayWidth,gridTop-46);});
        const bottom=gridTop+(to-from)*s.scale;
        ctx.strokeStyle='#e5dce9';ctx.lineWidth=1;for(let i=0;i<=s.columns.length;i++){const x=s.left+i*s.dayWidth;ctx.beginPath();ctx.moveTo(x,gridTop);ctx.lineTo(x,bottom);ctx.stroke();}
        const times=[from,...Array.from({length:Math.max(0,Math.floor(to/30)-Math.ceil(from/30)+1)},(_,i)=>(Math.ceil(from/30)+i)*30),to];
        for(const t of [...new Set(times)]){const ty=gridTop+(t-from)*s.scale;ctx.strokeStyle=t%30?'#eee6f0':'#d9cddd';ctx.beginPath();ctx.moveTo(s.left,ty);ctx.lineTo(W-s.right,ty);ctx.stroke();font(ctx,17);ctx.textAlign='right';ctx.fillStyle='#6c5a74';ctx.fillText(clock(Math.round(t)),s.left-18,Math.min(bottom-17,Math.max(gridTop,ty-8)));}
        ctx.textAlign='center';
        for(const b of s.blocks.filter(b=>b.start<to&&b.end>from)){
          const by=gridTop+(Math.max(b.start,from)-from)*s.scale+3,height=(Math.min(b.end,to)-Math.max(b.start,from))*s.scale-6;
          rounded(ctx,b.x,by,b.width,height,b.cancelled?'#eeeef0':b.kind==='BREAK'?'#edf4f1':'#f7f0fb',b.kind==='BREAK'?'#91b0a2':'#b598c3');
          const continued=b.start<from||b.end>to;
          const textTop=by+(height-b.needed+10-(continued?20:0))/2;
          ctx.textAlign='left';
          for(const line of b.lines){const lx=b.x+line.dx,ly=textTop+line.dy;font(ctx,line.size,line.bold);ctx.fillStyle=line.color;ctx.fillText(line.text,lx,ly);if(line.title&&b.url){ctx.fillRect(lx,ly+line.size+1,line.width,1);links.push({url:b.url,x:lx,y:ly,width:line.width,height:line.size+3});}}
          ctx.textAlign='center';
          if(continued){font(ctx,12);ctx.fillStyle='#6c5a74';ctx.fillText('Continues on adjacent page',b.x+b.width/2,by+height-15);}
        }
        pages.push({canvas,links});from=to;
      }
    }
    pages.forEach((page,i)=>{const ctx=page.canvas.getContext('2d');font(ctx,16);ctx.textAlign='right';ctx.fillStyle='#685f6e';ctx.fillText(`Blocks · Page ${i+1} of ${pages.length}`,1560,1100);});return pages;
  }
  window.M4L_TIMETABLE_BLOCKS={model,position,scene,html,canvases};
})();
