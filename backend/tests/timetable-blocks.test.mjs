import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const ctx={window:{},URL};
for(const file of ['m4l-timetable-presentation.js','m4l-timetable-blocks.js'])vm.runInNewContext(await readFile(new URL(`../../js/${file}`,import.meta.url),'utf8'),ctx);
const blocks=ctx.window.M4L_TIMETABLE_BLOCKS;
const item=(name,day,start,end,extra={})=>({ruleId:name+day,moduleId:name,moduleName:name,teacherName:'Teacher A',teacherId:'T1',classIds:['A'],classNames:['Year 1'],weekday:day,startTime:start,endTime:end,zoomLink:'https://zoom.us/j/123',status:'SCHEDULED',...extra});
const source=occurrences=>({pattern:'WEEKLY',snapshot:{programName:'Test program',timezone:'Asia/Riyadh'},occurrences});
// Canvas substitute records geometry without an optional native dependency.
function canvas(width,height){
 const rectangles=[],text=[],context={font:'16px Arial',measureText(value){return {width:String(value).length*Number(this.font.match(/(\d+)px/)[1])*.55};},beginPath(){},roundRect(x,y,w,h){rectangles.push({x,y,w,h});},fill(){},stroke(){},strokeRect(){},fillRect(){},moveTo(){},lineTo(){},drawImage(){},fillText(value,x,y){text.push({value,x,y});}};
 return {width,height,rectangles,text,getContext:()=>context};
}
const input=source([item('Long',2,'07:45','09:15'),item('Short',3,'08:10','08:40'),item('Later',2,'09:30','10:00')]),original=JSON.stringify(input),m=blocks.model(input),s=blocks.scene(m,canvas);
for(const b of s.blocks){assert.equal(b.y,(b.start-s.start)*s.scale);assert.equal(b.height,(b.end-b.start)*s.scale);assert(b.height>=b.needed+6);}
assert.equal(s.blocks.find(b=>b.title==='Later').y-(s.blocks.find(b=>b.title==='Long').y+s.blocks.find(b=>b.title==='Long').height),15*s.scale,'A real 15-minute gap is retained');
assert.equal(JSON.stringify(input),original,'Preview never modifies schedule data');
const parallel=blocks.scene(blocks.model(source([item('First',2,'08:00','09:00'),item('Other class',2,'08:15','08:45',{classIds:['B'],classNames:['Year 2']}),item('After',2,'09:00','09:30')]),{teacherId:'T1'}),canvas);
const first=parallel.blocks.find(b=>b.title==='First'),other=parallel.blocks.find(b=>b.title==='Other class'),after=parallel.blocks.find(b=>b.title==='After');
assert.equal(first.lanes,2);assert(first.x+first.width<other.x);assert.equal(after.lanes,1);
const shared=[2,3,4].map(d=>item('Assembly',d,'07:30','07:45'));
assert.equal(blocks.position(blocks.model(source(shared)))[0].span,3);
for(const extra of [{zoomLink:'https://zoom.us/j/different'},{moduleId:'Other'},{teacherId:'T2'},{status:'CANCELLED'}])assert.equal(blocks.position(blocks.model(source([shared[0],{...shared[1],...extra}]))).length,2);
assert(blocks.position(blocks.model(source(shared),{layout:{mergeShared:false}})).every(b=>b.span===1));
const filtered=blocks.model(source([...shared,item('Other class',2,'08:00','09:00',{classIds:['B']}),item('Break',2,'09:00','09:15',{kind:'BREAK',classIds:[],classNames:[],zoomLink:''})]),{classId:'A'});
assert(!filtered.events.some(b=>b.title==='Other class'));assert(filtered.events.some(b=>b.kind==='BREAK'));
assert.equal(filtered.timetableType,'class');assert.equal(filtered.timetableName,'Year 1');assert(filtered.events.filter(b=>b.kind!=='BREAK').every(b=>b.classes===''));assert(filtered.events.some(b=>b.teacher==='Teacher A'));
const teacher=blocks.model(source([item('Mine',2,'08:00','09:00',{classIds:['B'],classNames:['Year 2']}),item('Not mine',3,'09:00','10:00',{teacherId:'T2',teacherName:'Teacher B'}),item('Relevant break',2,'09:00','09:15',{kind:'BREAK',classIds:[],classNames:[]}),item('Other-day break',4,'09:00','09:15',{kind:'BREAK',classIds:[],classNames:[]})]),{teacherId:'T1'});
assert.equal(teacher.timetableType,'teacher');assert.equal(teacher.timetableName,'Teacher A');assert.deepEqual(teacher.events.map(b=>b.title),['Mine','Relevant break']);assert.equal(teacher.events[0].teacher,'');assert.equal(teacher.events[0].classes,'Year 2');assert.equal(teacher.events[1].classes,'');
const coTaught=item('Co-taught',2,'10:00','10:30',{assignmentMode:'EXPLICIT',teacherIds:['T1','T2'],teacherNames:['Teacher A','Teacher B']});
const coSource=source([coTaught]),coClass=blocks.model(coSource,{classId:'A'}),coSecond=blocks.model(coSource,{teacherId:'T2'});
assert.equal(coClass.events[0].teacher,'Teacher A, Teacher B','published class view lists both teachers');
assert.equal(coSecond.timetableName,'Teacher B','the second teacher gets their own named timetable');
assert.deepEqual(coSecond.events.map(row=>row.title),['Co-taught']);
assert(blocks.canvases(coClass,canvas)[0].canvas.text.some(row=>row.value.includes('Teacher A, Teacher B')),'the image includes both teacher names');
const unsafe=blocks.html(blocks.model(source([item('<script>evil</script>',2,'08:00','09:00',{teacherName:'<b>x</b>',zoomLink:'javascript:alert(1)'})])),canvas);
assert(!unsafe.includes('<script>'));assert(!unsafe.includes('href='));assert(unsafe.includes('&lt;script&gt;'));
const cancelled=blocks.html(blocks.model(source([item('Cancelled',2,'08:00','09:00',{status:'CANCELLED'})])),canvas);assert(!cancelled.includes('href='));assert(cancelled.includes('line-through'));
const html=blocks.html(m,canvas);assert.match(html,/UMM ABBAD ACADEMY/);assert.match(html,/Year 1 Weekly timetable/);assert.match(html,/08h10/);assert.match(html,/rx="16"/);assert.match(html,/href="https:\/\/zoom.us\/j\/123"/);assert.doesNotMatch(html,/>Year 1<\/text>/);assert.match(html,/DRAFT PREVIEW/);
const seven=blocks.model(source([1,2,3,4,5,6,0].map(d=>item('Shared',d,'08:00','08:15'))));
const pages=blocks.canvases(seven,canvas);assert.equal(pages.length,1);
assert(pages[0].canvas.text.some(t=>t.value.includes('DRAFT PREVIEW')),'Version and effective date remain in the export footnote');
for(const page of pages){for(const r of page.canvas.rectangles)assert(r.x>=0&&r.y>=0&&r.x+r.w<=page.canvas.width&&r.y+r.h<=page.canvas.height,'Block and heading bounds');for(const r of page.links)assert(r.x>=0&&r.y>=0&&r.x+r.width<=page.canvas.width&&r.y+r.height<=page.canvas.height,'Link bounds');}
const dense=blocks.model(source([item('All day',2,'07:30','16:00'),...Array.from({length:12},(_,i)=>item('Short '+i,3,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'45':'15'}`))]));
const densePages=blocks.canvases(dense,canvas),denseScene=blocks.scene(dense,canvas);
assert.equal(densePages.length,1,'A dense timetable exports as one image');
assert(densePages[0].canvas.height>1132,'The image grows to fit all lessons');
assert.equal(densePages[0].canvas.rectangles.length,denseScene.columns.length+denseScene.blocks.length,'Every lesson appears in the single image');
assert(!densePages[0].canvas.text.some(t=>t.value==='Continues on adjacent page'));
for(const r of densePages[0].canvas.rectangles)assert(r.y>=0&&r.y+r.h<=densePages[0].canvas.height,'Dense block stays on the image');
const pdfSizes=[],pdfImages=[],pdfLinks=[];
const pdfLib={PDFDocument:{create:async()=>({setTitle(){},addPage(size){pdfSizes.push(size);return {drawImage(image,options){pdfImages.push(options);},node:{set(){}}};},embedPng:async()=>({}),context:{obj:value=>value,register(value){pdfLinks.push(value);return value;}},save:async()=>new Uint8Array()})},PDFName:{of:value=>value},PDFString:{of:value=>value}};
densePages[0].canvas.toDataURL=()=>'';
await ctx.window.M4L_TIMETABLE_PRESENTATION.pdf(densePages,pdfLib);
assert.equal(pdfSizes.length,1,'The PDF contains one page');
assert([[841.89,595.28],[595.28,841.89]].some(size=>size.every((value,i)=>value===pdfSizes[0][i])),'The PDF page is A4');
assert(Math.abs(pdfImages[0].width/pdfImages[0].height-densePages[0].canvas.width/densePages[0].canvas.height)<1e-10,'The PDF keeps the image proportions');
assert(pdfImages[0].x>=0&&pdfImages[0].y>=0&&pdfImages[0].x+pdfImages[0].width<=pdfSizes[0][0]&&pdfImages[0].y+pdfImages[0].height<=pdfSizes[0][1],'The complete image fits on A4');
assert.equal(pdfLinks.length,densePages[0].links.length,'Every lesson link remains clickable');
console.log('Blocks: proportional placement, uneven times, gaps, overlap lanes, safe shared entries, filters, escaping and single-image/PDF export passed.');

// The reported morning timetable, including a shared short Assembly, fits one page.
const morning=source([
 ...[2,3,4].map(d=>item('Assembly',d,'07:30','07:45',{teacherName:'',classNames:['Alimiyah 4 2026','Alimiyah 3 2026','Alimiyah 2 2026','Alimiyah 1 2026']})),
 item('Quduri',2,'07:45','09:15'),item('Mishkaat',3,'07:45','09:15'),
 item('Quduri',4,'07:45','08:30'),item('Mishkaat',4,'08:30','09:15'),
 ...[2,3,4].map(d=>item('Break',d,'09:15','09:30',{kind:'BREAK',classIds:[],classNames:[],teacherName:'',zoomLink:''})),
 item('Mishkaat',2,'09:30','10:00')
]);
const compactModel=blocks.model(morning),compactScene=blocks.scene(compactModel,canvas),compactPages=blocks.canvases(compactModel,canvas);
assert.equal(compactPages.length,1);assert(compactScene.height<600,'Compact morning scale');
const tickLabels=Array.from(blocks.html(compactModel,canvas).matchAll(/<text x="112"[^>]*>([^<]+)<\/text>/g),m=>m[1]);
assert.deepEqual(tickLabels,['07h30','08h00','08h30','09h00','09h30','10h00']);
for(const b of compactScene.blocks)for(const line of b.lines){assert(line.dx>=0&&line.dx+line.width<=b.width,'Text stays inside block width');assert(line.dy>=0&&line.dy+line.size<=b.needed-10,'Text stays inside content height');}
assert.equal(compactScene.blocks.find(b=>b.title==='Assembly').lines.length,3,'A lesson without a teacher says No teacher on the class timetable');
console.log('Compact blocks: 30-minute ticks, smaller spacing, audience-specific text bounds and one-page morning timetable passed.');

const separate=['A','B','C','D'].map((classId,index)=>item('Quran',1,'08:00','08:45',{ruleId:'Quran-'+classId,classIds:[classId],classNames:['Group '+classId],teacherId:'T'+index,teacherName:'Teacher '+classId}));
const combined=item('Assembly',1,'08:45','09:00',{classIds:['A','B','C','D'],classNames:['Group A','Group B','Group C','Group D'],teacherId:'T0',teacherName:'Teacher A'});
const program=blocks.model(source([...separate,combined]),{program:true,allClassIds:['A','B','C','D'],allClassNames:['Group A','Group B','Group C','Group D']});
assert.equal(program.timetableType,'program');
assert.equal(program.events.length,5,'The whole Program includes every separate and combined lesson');
assert.equal(program.events.filter(event=>event.title==='Quran').length,4);
assert.equal(program.events.find(event=>event.title==='Assembly').classes,'All classes');
const programLayout=blocks.programScene(program,canvas);
assert.equal(programLayout.rows.length,2);
assert.equal(programLayout.rows[0].cells[0].length,4,'Parallel class lessons stay separate in one time band');
assert.equal(programLayout.rows[1].cells[0].length,1,'The combined lesson appears once');
const programMarkup=blocks.html(program,canvas);
assert.match(programMarkup,/All classes: Group A · Group B · Group C · Group D/);
assert.equal((programMarkup.match(/<b>Quran<\/b>/g)||[]).length,0,'Linked lessons use links');
assert.equal((programMarkup.match(/>Quran<\/a>/g)||[]).length,4);
assert.equal((programMarkup.match(/>Assembly<\/a>/g)||[]).length,1);
const programPages=blocks.canvases(program,canvas);
assert.equal(programPages.length,1,'The Program creates one image');
assert.equal(programPages[0].canvas.rectangles.length,5,'Every lesson has one card on the image');
assert.equal(programPages[0].links.length,5,'Every linked lesson has a PDF annotation');
for(const rectangle of programPages[0].canvas.rectangles)assert(rectangle.x>=0&&rectangle.y>=0&&rectangle.x+rectangle.w<=programPages[0].canvas.width&&rectangle.y+rectangle.h<=programPages[0].canvas.height,'Every Program card fits the image');
programPages[0].canvas.toDataURL=()=>'';
pdfSizes.length=0;pdfLinks.length=0;
await ctx.window.M4L_TIMETABLE_PRESENTATION.pdf(programPages,pdfLib,{size:'program'});
assert.equal(pdfSizes.length,1,'The whole Program creates one PDF page');
assert.equal(pdfLinks.length,5,'All Program lesson links remain clickable in the PDF');
const inherited=['A','B'].map((classId,index)=>item('Together',1,'09:00','09:15',{ruleId:'RULE-ALL-'+index,sourceRuleId:'RULE-ALL',assignmentMode:'CLASS',classIds:[classId],classNames:['Group '+classId],teacherId:'T'+index,teacherName:'Teacher '+classId,zoomLink:'https://zoom.us/j/'+index}));
const named=item('Named',1,'09:15','09:30',{ruleId:'RULE-NAMED',assignmentMode:'EXPLICIT',classIds:['A','B'],classNames:['Group A','Group B'],teacherId:'T1',teacherName:'Named Teacher'});
const unassigned=item('Unassigned',1,'09:30','09:45',{ruleId:'RULE-NONE',assignmentMode:'NONE',classIds:['A','B'],classNames:['Group A','Group B'],teacherId:'',teacherName:''});
const modes=blocks.model(source([...inherited,named,unassigned]),{program:true,allClassIds:['A','B'],allClassNames:['Group A','Group B']});
assert.equal(modes.events.length,3,'one inherited all-class lesson appears once in the Program publication');
assert.equal(modes.events[0].classes,'All classes');assert.equal(modes.events[0].teacher,'','class teacher names are omitted');
assert.equal(modes.events[0].url,'','different class links do not become a misleading shared link');
assert.equal(modes.events[1].teacher,'Named Teacher');assert.equal(modes.events[2].teacher,'No teacher');
assert.equal(blocks.model(source([...inherited,named,unassigned]),{classId:'A'}).events[0].teacher,'','the class timetable also omits inherited teacher details');
assert.equal(blocks.model(source([...inherited,named,unassigned]),{classId:'A'}).events[2].teacher,'No teacher');
const modeMarkup=blocks.html(modes,canvas);assert.equal((modeMarkup.match(/>Together<\/b>/g)||[]).length,1);assert.doesNotMatch(modeMarkup,/Teacher A|Teacher B/);assert.match(modeMarkup,/Named Teacher/);assert.match(modeMarkup,/No teacher/);
const modeCanvas=blocks.canvases(modes,canvas)[0].canvas;assert(modeCanvas.text.some(row=>row.value==='All classes'));assert(!modeCanvas.text.some(row=>/Teacher A|Teacher B/.test(row.value)));assert(modeCanvas.text.some(row=>row.value==='Named Teacher'));assert(modeCanvas.text.some(row=>row.value==='No teacher'));
assert([[1683.78,1190.55],[1190.55,1683.78]].some(size=>size.every((value,i)=>value===pdfSizes[0][i])),'A compact Program timetable uses A2 paper');
const busyProgram=blocks.model(source(Array.from({length:10},(_,period)=>['A','B','C','D'].map((classId,index)=>item('Subject '+period,1,`${String(8+period).padStart(2,'0')}:00`,`${String(9+period).padStart(2,'0')}:00`,{classIds:[classId],classNames:['Group '+classId],teacherId:'T'+index,teacherName:'Teacher '+classId}))).flat()),{program:true,allClassIds:['A','B','C','D']});
const busyPage=blocks.canvases(busyProgram,canvas)[0];busyPage.canvas.toDataURL=()=>'';pdfSizes.length=0;
await ctx.window.M4L_TIMETABLE_PRESENTATION.pdf([busyPage],pdfLib,{size:'program'});
assert.equal(pdfSizes.length,1);assert(pdfSizes[0][1]>1683.78,'A dense Program timetable grows vertically instead of shrinking the text');
