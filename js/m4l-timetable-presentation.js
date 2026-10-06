/* V105.3.3 — one timetable model for web, image and linked PDF exports. */
(()=>{'use strict';
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=v=>String(v||'').replace(':','h');
  function link(value){try{if(typeof value!=='string'||value.length>2048||/[\u0000-\u001f\u007f]/.test(value))return '';const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  const defaults=()=>({alignment:'center',mergeShared:true,columnWidths:{},rowHeights:{}});
  const teacherLabel=row=>row.kind==='BREAK'?'':row.assignmentMode==='NONE'?'No teacher':row.assignmentMode==='CLASS'?(row.classTeachersAssigned===false||!row.classTeachersAssigned&&!row.teacherId?'No teacher':''):row.teacherName||'No teacher';
  function displayOccurrences(occurrences,{program=false}={}){
    if(!program)return occurrences;
    const grouped=new Map(),display=[];
    for(const row of occurrences){
      if(row.kind==='BREAK'||row.assignmentMode!=='CLASS'||!row.sourceRuleId){display.push(row);continue;}
      const key=[row.sourceRuleId,row.weekday??row.date,row.startTime,row.endTime,row.status].join('|');
      let combined=grouped.get(key);
      if(!combined){combined={...row,ruleId:row.sourceRuleId,anchor:`${row.sourceRuleId}@${row.weekday??row.date}`,classIds:[],classNames:[],classTeachersAssigned:false};grouped.set(key,combined);display.push(combined);}
      combined.classTeachersAssigned ||= Boolean(row.teacherId);
      row.classIds.forEach((id,index)=>{if(!combined.classIds.includes(id)){combined.classIds.push(id);combined.classNames.push(row.classNames[index]||id);}});
      if(combined.zoomLink!==row.zoomLink){combined.zoomLink='';combined.zoomSource='MULTIPLE';}
    }
    return display;
  }
  function model(result,{programName='',classId='',effectiveFrom='',history=false,layout}={}){
    const items=displayOccurrences(result.occurrences.filter(r=>r.kind==='BREAK'||!classId||r.classIds.includes(classId)),{program:!classId});
    const weekly=result.pattern==='WEEKLY';
    const columns=weekly?[1,2,3,4,5,6,0].filter(d=>items.some(r=>r.weekday===d)).map(d=>({id:d,label:days[d]})):[...new Set(items.map(r=>r.date))].sort().map(d=>({id:d,label:d}));
    const classes=[...new Set(items.filter(r=>r.kind!=='BREAK').flatMap(r=>classId?[r.classNames[r.classIds.indexOf(classId)]]:r.classNames))];
    const boundaries=[...new Set(items.flatMap(r=>[r.startTime,r.endTime]))].sort();
    return {academy:'UMM ABBAD ACADEMY',program:result.snapshot?.programName||programName,title:weekly?'Weekly timetable':'Timetable',classes:classes.join(' · '),
      stamp:history?`Published version ${result.version} · Effective ${result.effectiveFrom}`:`DRAFT PREVIEW · Proposed effective date ${effectiveFrom}`,
      timezone:result.snapshot?.timezone||'',columns,layout:{...defaults(),...(layout||result.snapshot?.layout||result.draft?.layout||{})},
      rows:boundaries.slice(0,-1).map((start,i)=>{const end=boundaries[i+1];return {key:`${start}|${end}`,start,end,label:`${time(start)} - ${time(end)}`,cells:columns.map(col=>items.filter(r=>(weekly?r.weekday:r.date)===col.id&&r.startTime<=start&&r.endTime>=end).map(r=>({ruleId:r.ruleId,kind:r.kind||'LESSON',title:r.moduleName||r.subjectName,teacher:teacherLabel(r),classes:r.classNames.join(', '),url:link(r.zoomLink),cancelled:r.status==='CANCELLED',identity:[r.moduleId||'',r.programSubjectId||'',r.assignmentMode||'',r.teacherId||'',...r.classIds.slice().sort()].join('|'),start:r.startTime,end:r.endTime})))};})};
  }
  const signature=items=>JSON.stringify(items.map(({ruleId,...item})=>item).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  // Each grid position is covered exactly once. Only equivalent content can merge.
  function grid(m,offset=0,count=m.columns.length){
    const occupied=m.rows.map(()=>Array(count).fill(false)),cells=[];
    for(let r=0;r<m.rows.length;r++)for(let c=0;c<count;c++){
      if(occupied[r][c])continue;
      const items=m.rows[r].cells[c+offset],key=signature(items);let rowSpan=1,colSpan=1;
      if(items.length)while(r+rowSpan<m.rows.length&&!occupied[r+rowSpan][c]&&signature(m.rows[r+rowSpan].cells[c+offset])===key)rowSpan++;
      if(m.layout.mergeShared)while(c+colSpan<count&&Array.from({length:rowSpan},(_,n)=>r+n).every(y=>!occupied[y][c+colSpan]&&signature(m.rows[y].cells[c+colSpan+offset])===key))colSpan++;
      for(let y=r;y<r+rowSpan;y++)for(let x=c;x<c+colSpan;x++)occupied[y][x]=true;
      const edits=new Map();for(let x=c;x<c+colSpan;x++)for(const item of m.rows[r].cells[x+offset])if(item.ruleId&&!edits.has(item.ruleId))edits.set(item.ruleId,{id:item.ruleId,kind:item.kind,day:m.columns[x+offset].label});
      cells.push({row:r,col:c,rowSpan,colSpan,items,edits:[...edits.values()]});
    }
    return cells;
  }
  function html(m,{editable=false}={}){
    const cells=grid(m),weights=[m.layout.columnWidths.time||180,...m.columns.map(c=>m.layout.columnWidths[c.id]||360)],total=weights.reduce((a,b)=>a+b,0);
    const itemHTML=item=>`<div class="tt-sheet-lesson ${item.cancelled?'tt-cancelled':''}">${item.url&&!item.cancelled?`<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`:`<strong>${esc(item.title)}</strong>`}${item.teacher?`<span>${esc(item.teacher)}</span>`:''}${item.classes?`<small>${esc(item.classes)}</small>`:''}${item.cancelled?'<small>Cancelled</small>':''}</div>`;
    return `<div class="tt-sheet" style="min-width:${Math.max(680,total*.65)}px"><header><img src="/logo.png" alt="Academy logo"><div><p>${esc(m.academy)}</p><h2>${esc(m.program)}</h2><h3>${esc(m.title)}</h3><p>${esc(m.classes)}</p></div></header><p class="tt-sheet-stamp">${esc(m.stamp)} · ${esc(m.timezone)}</p><table style="--tt-alignment:${m.layout.alignment}"><caption class="pb-sr-only">${esc(m.program)} ${esc(m.title)}</caption><colgroup>${weights.map(w=>`<col style="width:${w/total*100}%">`).join('')}</colgroup><thead><tr><th scope="col">Time</th>${m.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${m.rows.map((row,i)=>`<tr style="height:${m.layout.rowHeights[row.key]||70}px"><th scope="row">${esc(row.label)}</th>${cells.filter(c=>c.row===i).map(cell=>`<td rowspan="${cell.rowSpan}" colspan="${cell.colSpan}">${cell.items.map(itemHTML).join('')||'—'}${editable?cell.edits.map(e=>`<button type="button" class="tt-cell-edit pb-secondary" data-edit-entry="${esc(e.id)}">Edit ${e.kind==='BREAK'?'break':'lesson'}${cell.edits.length>cell.items.length?' · '+esc(e.day):''}</button>`).join(''):''}${editable&&!cell.items.length?`<button type="button" class="tt-cell-edit pb-secondary" data-gap="${esc(row.key)}" data-gap-days="${m.columns.slice(cell.col,cell.col+cell.colSpan).map(c=>c.id).join(',')}">Add break</button>`:''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function wrap(ctx,text,width){
    const lines=[];let line='';
    for(const word of String(text||'').split(/\s+/u)){
      if(ctx.measureText(word).width>width){
        if(line){lines.push(line);line='';}
        for(const char of word){if(ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}
      }else if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line=word;}
      else line+=(line?' ':'')+word;
    }
    if(line)lines.push(line);return lines;
  }
  // HTML and exports share the same span map and width/height preferences.
  // At a page boundary a spanning cell is repeated, with a continuation label.
  function canvases(m,createCanvas,logo){
    if(!m.rows.length||!m.columns.length)throw Error('There are no lessons to export.');
    const W=1600,H=1132,pad=55,maxColumns=5,pages=[];
    const font=(ctx,size,bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px Arial, sans-serif`;};
    for(let offset=0;offset<m.columns.length;offset+=maxColumns){
      const columns=m.columns.slice(offset,offset+maxColumns),weights=[m.layout.columnWidths.time||180,...columns.map(c=>m.layout.columnWidths[c.id]||360)],total=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>w/total*(W-pad*2)),xs=[pad];
      widths.forEach(w=>xs.push(xs.at(-1)+w));
      const measure=createCanvas(1,1).getContext('2d');
      const blocks=(items,width)=>items.map(item=>{
        font(measure,24,true);const titleLines=wrap(measure,item.title,width-30);
        font(measure,21);const teacherLines=wrap(measure,item.teacher,width-30);
        font(measure,18);const classLines=wrap(measure,item.classes,width-30);
        return {...item,titleLines,teacherLines,classLines,height:24+titleLines.length*29+teacherLines.length*26+classLines.length*23+(item.cancelled?25:0)};
      });
      const cells=grid(m,offset,columns.length).map(cell=>{const width=widths.slice(cell.col+1,cell.col+cell.colSpan+1).reduce((a,b)=>a+b,0),content=blocks(cell.items,width);return {...cell,width,content,height:content.reduce((n,b)=>n+b.height,0)+20};});
      const heights=m.rows.map(row=>{font(measure,22,true);return Math.max(m.layout.rowHeights[row.key]||70,wrap(measure,row.label,widths[0]-20).length*27+24);});
      for(const cell of [...cells].sort((a,b)=>a.rowSpan-b.rowSpan)){
        const available=heights.slice(cell.row,cell.row+cell.rowSpan).reduce((a,b)=>a+b,0);
        if(cell.height>available)for(let r=cell.row;r<cell.row+cell.rowSpan;r++)heights[r]+=(cell.height-available)/cell.rowSpan;
      }
      let ctx,y,links;
      function start(){
        const canvas=createCanvas(W,H);ctx=canvas.getContext('2d');links=[];ctx.fillStyle='#fffdf5';ctx.fillRect(0,0,W,H);ctx.textBaseline='top';ctx.textAlign='center';
        if(logo)ctx.drawImage(logo,pad,38,90,90);
        y=34;ctx.fillStyle='#33253a';
        for(const [text,size,bold] of [[m.academy,24,true],[m.program,32,true],[m.title,23,true],[m.classes,20,false]]){
          font(ctx,size,bold);for(const line of wrap(ctx,text,W-380)){ctx.fillText(line,W/2,y);y+=size+7;}y+=3;
        }
        font(ctx,19);ctx.fillStyle='#715078';for(const line of wrap(ctx,`${m.stamp} · ${m.timezone}`,W-pad*2)){ctx.fillText(line,W/2,y);y+=25;}y+=18;
        ['Time',...columns.map(c=>c.label)].forEach((label,i)=>{ctx.fillStyle='#c8a6d4';ctx.fillRect(xs[i],y,widths[i],48);ctx.strokeStyle='#76647e';ctx.lineWidth=1.5;ctx.strokeRect(xs[i],y,widths[i],48);font(ctx,24,true);ctx.fillStyle='#302237';ctx.fillText(label,xs[i]+widths[i]/2,y+10);});y+=48;
        pages.push({canvas,links});
      }
      for(let first=0;first<m.rows.length;){
        start();const available=H-60-y;let last=first,used=0;
        while(last<m.rows.length&&used+heights[last]<=available){used+=heights[last++];}
        if(last===first)throw Error('A timetable row is too tall for a page. Reduce its height or filter to a class.');
        // Prefer a clean page break which keeps complete merged cells together.
        let safe=last;
        while(safe>first&&cells.some(c=>c.row<safe&&c.row+c.rowSpan>safe))safe--;
        if(safe>first)last=safe;
        const ys=[y];for(let r=first;r<last;r++)ys.push(ys.at(-1)+heights[r]);
        for(let r=first;r<last;r++){
          ctx.strokeStyle='#76647e';ctx.strokeRect(pad,ys[r-first],widths[0],heights[r]);ctx.fillStyle='#302237';ctx.textAlign='center';font(ctx,22,true);
          const lines=wrap(ctx,m.rows[r].label,widths[0]-20);lines.forEach((line,i)=>ctx.fillText(line,pad+widths[0]/2,ys[r-first]+(heights[r]-lines.length*27)/2+i*27));
        }
        for(const cell of cells.filter(c=>c.row<last&&c.row+c.rowSpan>first)){
          const top=Math.max(cell.row,first),bottom=Math.min(cell.row+cell.rowSpan,last),x=xs[cell.col+1],cy0=ys[top-first],height=ys[bottom-first]-cy0;
          ctx.strokeStyle='#76647e';ctx.strokeRect(x,cy0,cell.width,height);
          if(!cell.items.length){ctx.textAlign='center';font(ctx,22);ctx.fillStyle='#756877';ctx.fillText('—',x+cell.width/2,cy0+height/2-12);continue;}
          const continued=cell.row<first,needed=cell.height+(continued?24:0),scale=Math.min(1,(height-8)/needed);
          if(scale<.65)throw Error('A merged lesson is too tall for this page. Reduce text or filter to a class.');
          // Scale only when a very long merged cell must continue on another page.
          ctx.save();ctx.translate(x,cy0);ctx.scale(scale,scale);
          const width=cell.width/scale,align=m.layout.alignment,tx=align==='left'?15:align==='right'?width-15:width/2;ctx.textAlign=align;
          let cy=Math.max(10,(height/scale-(cell.height-44+(continued?24:0)))/2);
          if(continued){font(ctx,17);ctx.fillStyle='#756877';ctx.fillText('Continued',tx,cy);cy+=24;}
          for(const item of cell.content){
            const titleY=cy;ctx.fillStyle=item.url&&!item.cancelled?'#743f87':'#302237';font(ctx,24,true);
            for(const line of item.titleLines){ctx.fillText(line,tx,cy);if(item.url&&!item.cancelled){const tw=ctx.measureText(line).width,lx=align==='left'?tx:align==='right'?tx-tw:tx-tw/2;ctx.fillRect(lx,cy+26,tw,1);}cy+=29;}
            if(item.url&&!item.cancelled)links.push({url:item.url,x:x+12*scale,y:cy0+titleY*scale,width:cell.width-24*scale,height:(cy-titleY)*scale});
            ctx.fillStyle='#4a404e';font(ctx,21);for(const line of item.teacherLines){ctx.fillText(line,tx,cy);cy+=26;}
            ctx.fillStyle='#756877';font(ctx,18);for(const line of item.classLines){ctx.fillText(line,tx,cy);cy+=23;}
            if(item.cancelled){ctx.fillText('Cancelled',tx,cy);cy+=25;}cy+=24;
          }
          ctx.restore();
        }
        first=last;
      }
    }
    pages.forEach((page,i)=>{const ctx=page.canvas.getContext('2d');ctx.font='17px Arial, sans-serif';ctx.fillStyle='#756877';ctx.textAlign='right';ctx.fillText(`Page ${i+1} of ${pages.length}`,W-pad,H-35);});
    return pages;
  }
  async function pdf(pages,lib,{size='A4'}={}){
    const doc=await lib.PDFDocument.create();doc.setTitle('Academy timetable');
    for(const source of pages){
      // The Program view stays on one sheet and grows beyond A2 if needed.
      const cw=source.canvas.width,ch=source.canvas.height;
      const landscape=size==='program'?[Math.max(1683.78,cw*.75),Math.max(1190.55,ch*.75)]:[841.89,595.28],portrait=size==='program'?[Math.max(1190.55,cw*.75),Math.max(1683.78,ch*.75)]:[595.28,841.89];
      const [width,height]=Math.min(landscape[0]/cw,landscape[1]/ch)>=Math.min(portrait[0]/cw,portrait[1]/ch)?landscape:portrait;
      const scale=Math.min(width/cw,height/ch),drawWidth=cw*scale,drawHeight=ch*scale,x=(width-drawWidth)/2,y=(height-drawHeight)/2;
      const page=doc.addPage([width,height]),png=await doc.embedPng(source.canvas.toDataURL('image/png'));
      page.drawImage(png,{x,y,width:drawWidth,height:drawHeight});
      const annotations=source.links.map(rect=>doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x+rect.x*scale,y+(ch-rect.y-rect.height)*scale,x+(rect.x+rect.width)*scale,y+(ch-rect.y)*scale],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:lib.PDFString.of(rect.url)}})));
      page.node.set(lib.PDFName.of('Annots'),doc.context.obj(annotations));
    }
    return doc.save();
  }
  window.M4L_TIMETABLE_PRESENTATION={model,html,canvases,pdf,link,grid,defaults,displayOccurrences,teacherLabel};
})();
