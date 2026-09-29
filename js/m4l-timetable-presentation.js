/* V105.3.3 — one timetable model for web, image and linked PDF exports. */
(()=>{'use strict';
  const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=v=>String(v||'').replace(':','h');
  function link(value){try{if(typeof value!=='string'||value.length>2048||/[\u0000-\u001f\u007f]/.test(value))return '';const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  function model(result,{programName='',classId='',effectiveFrom='',history=false}={}){
    const items=result.occurrences.filter(r=>!classId||r.classIds.includes(classId));
    const weekly=result.pattern==='WEEKLY';
    const columns=weekly?[1,2,3,4,5,6,0].filter(d=>items.some(r=>r.weekday===d)).map(d=>({id:d,label:days[d]})):[...new Set(items.map(r=>r.date))].sort().map(d=>({id:d,label:d}));
    const classes=[...new Set(items.flatMap(r=>classId?[r.classNames[r.classIds.indexOf(classId)]]:r.classNames))];
    const ranges=[...new Set(items.map(r=>`${r.startTime}|${r.endTime}`))].sort();
    return {academy:'UMM ABBAD ACADEMY',program:result.snapshot?.programName||programName,title:weekly?'Weekly timetable':'Timetable',classes:classes.join(' · '),
      stamp:history?`Published version ${result.version} · Effective ${result.effectiveFrom}`:`DRAFT PREVIEW · Proposed effective date ${effectiveFrom}`,
      timezone:result.snapshot?.timezone||'',columns,
      rows:ranges.map(range=>{const [start,end]=range.split('|');return {label:`${time(start)} - ${time(end)}`,cells:columns.map(col=>items.filter(r=>(weekly?r.weekday:r.date)===col.id&&r.startTime===start&&r.endTime===end).map(r=>({title:r.moduleName||r.subjectName,teacher:r.teacherName||'',classes:r.classNames.join(', '),url:link(r.zoomLink),cancelled:r.status==='CANCELLED'})))};})};
  }
  function html(m){
    return `<div class="tt-sheet" style="min-width:${Math.max(680,m.columns.length*160+135)}px"><header><img src="/logo.png" alt="Academy logo"><div><p>${esc(m.academy)}</p><h2>${esc(m.program)}</h2><h3>${esc(m.title)}</h3><p>${esc(m.classes)}</p></div></header><p class="tt-sheet-stamp">${esc(m.stamp)} · ${esc(m.timezone)}</p><table><caption class="pb-sr-only">${esc(m.program)} ${esc(m.title)}</caption><thead><tr><th scope="col">Time</th>${m.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${m.rows.map(row=>`<tr><th scope="row">${esc(row.label)}</th>${row.cells.map(cell=>`<td>${cell.map(item=>`<div class="tt-sheet-lesson ${item.cancelled?'tt-cancelled':''}">${item.url&&!item.cancelled?`<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>`:`<strong>${esc(item.title)}</strong>`}${item.teacher?`<span>${esc(item.teacher)}</span>`:''}<small>${esc(item.classes)}</small>${item.cancelled?'<small>Cancelled</small>':''}</div>`).join('')||'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
  // Fixed landscape pages with measured wrapping, repeated headings and no split lesson cells.
  // The same canvas supplies PNG/PDF appearance; PDF annotations keep module links clickable.
  function canvases(m,createCanvas,logo){
    if(!m.rows.length)throw Error('There are no lessons to export.');
    const W=1600,H=1132,pad=55,timeWidth=180,maxColumns=5,pages=[];
    const columnGroups=[];for(let i=0;i<m.columns.length;i+=maxColumns)columnGroups.push({columns:m.columns.slice(i,i+maxColumns),offset:i});
    for(const group of columnGroups){
      const cellW=(W-pad*2-timeWidth)/group.columns.length;
      const measure=createCanvas(1,1).getContext('2d');
      const font=(ctx,size,bold=false)=>{ctx.font=`${bold?'bold ':''}${size}px Arial, sans-serif`;};
      const blocks=cell=>cell.map(item=>{
        font(measure,24,true);const title=wrap(measure,item.title,cellW-30);
        font(measure,21);const teacher=wrap(measure,item.teacher,cellW-30);
        font(measure,18);const classes=wrap(measure,item.classes,cellW-30);
        return {...item,titleLines:title,teacherLines:teacher,classLines:classes,height:24+title.length*29+teacher.length*26+classes.length*23+(item.cancelled?25:0)};
      });
      const measured=m.rows.map(row=>{const cells=row.cells.slice(group.offset,group.offset+group.columns.length).map(blocks);return {label:row.label,cells,height:Math.max(94,...cells.map(c=>c.reduce((n,b)=>n+b.height,0)+18))};});
      let page,ctx,y,links;
      function start(){
        page=createCanvas(W,H);ctx=page.getContext('2d');links=[];
        ctx.fillStyle='#fffdf5';ctx.fillRect(0,0,W,H);ctx.textBaseline='top';ctx.textAlign='center';
        if(logo){const size=90;ctx.drawImage(logo,pad,38,size,size);}
        const heading=(text,size,bold,width)=>{font(ctx,size,bold);return wrap(ctx,text,width);};
        y=34;ctx.fillStyle='#33253a';
        for(const [text,size,bold] of [[m.academy,24,true],[m.program,32,true],[m.title,23,true],[m.classes,20,false]]){
          for(const line of heading(text,size,bold,W-380)){ctx.fillText(line,W/2,y);y+=size+7;}y+=3;
        }
        font(ctx,19);ctx.fillStyle='#715078';for(const line of wrap(ctx,`${m.stamp} · ${m.timezone}`,W-pad*2)){ctx.fillText(line,W/2,y);y+=25;}y+=18;
        const labels=['Time',...group.columns.map(c=>c.label)];let x=pad;
        labels.forEach((label,i)=>{const width=i?cellW:timeWidth;ctx.fillStyle='#c8a6d4';ctx.fillRect(x,y,width,48);ctx.strokeStyle='#76647e';ctx.lineWidth=1.5;ctx.strokeRect(x,y,width,48);font(ctx,24,true);ctx.fillStyle='#302237';ctx.fillText(label,x+width/2,y+10);x+=width;});y+=48;
        pages.push({canvas:page,links});
      }
      start();
      for(const row of measured){
        if(y+row.height>H-60)start();
        if(y+row.height>H-60)throw Error('A timetable cell is too long to fit on one page. Filter to a class before exporting.');
        let x=pad;ctx.fillStyle='#302237';font(ctx,22,true);ctx.fillText(row.label,x+timeWidth/2,y+24);ctx.strokeRect(x,y,timeWidth,row.height);x+=timeWidth;
        for(const cell of row.cells){
          ctx.strokeStyle='#76647e';ctx.strokeRect(x,y,cellW,row.height);let cy=y+16;
          for(const item of cell){
            const titleY=cy;ctx.fillStyle=item.url&&!item.cancelled?'#743f87':'#302237';font(ctx,24,true);
            for(const line of item.titleLines){ctx.fillText(line,x+cellW/2,cy);if(item.url&&!item.cancelled){const width=ctx.measureText(line).width;ctx.fillRect(x+(cellW-width)/2,cy+26,width,1);}cy+=29;}
            if(item.url&&!item.cancelled)links.push({url:item.url,x:x+12,y:titleY,width:cellW-24,height:cy-titleY});
            ctx.fillStyle='#4a404e';font(ctx,21);for(const line of item.teacherLines){ctx.fillText(line,x+cellW/2,cy);cy+=26;}
            ctx.fillStyle='#756877';font(ctx,18);for(const line of item.classLines){ctx.fillText(line,x+cellW/2,cy);cy+=23;}
            if(item.cancelled){ctx.fillText('Cancelled',x+cellW/2,cy);cy+=25;}cy+=24;
          }
          x+=cellW;
        }
        y+=row.height;
      }
    }
    pages.forEach((page,i)=>{const ctx=page.canvas.getContext('2d');ctx.font='17px Arial, sans-serif';ctx.fillStyle='#756877';ctx.textAlign='right';ctx.fillText(`Page ${i+1} of ${pages.length}`,W-pad,H-35);});
    return pages;
  }
  async function pdf(pages,lib){
    const doc=await lib.PDFDocument.create();doc.setTitle('Academy timetable');
    for(const source of pages){
      const width=841.89,height=595.28,page=doc.addPage([width,height]),sx=width/source.canvas.width,sy=height/source.canvas.height;
      const png=await doc.embedPng(source.canvas.toDataURL('image/png'));page.drawImage(png,{x:0,y:0,width,height});
      const annotations=source.links.map(rect=>doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[rect.x*sx,height-(rect.y+rect.height)*sy,(rect.x+rect.width)*sx,height-rect.y*sy],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:lib.PDFString.of(rect.url)}})));
      page.node.set(lib.PDFName.of('Annots'),doc.context.obj(annotations));
    }
    return doc.save();
  }
  window.M4L_TIMETABLE_PRESENTATION={model,html,canvases,pdf,link};
})();
