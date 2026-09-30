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
 const rectangles=[],text=[],context={font:'16px Arial',measureText(value){return {width:String(value).length*Number(this.font.match(/(\d+)px/)[1])*.55};},beginPath(){},roundRect(x,y,w,h){rectangles.push({x,y,w,h});},fill(){},stroke(){},fillRect(){},moveTo(){},lineTo(){},drawImage(){},fillText(value,x,y){text.push({value,x,y});}};
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
const unsafe=blocks.html(blocks.model(source([item('<script>evil</script>',2,'08:00','09:00',{teacherName:'<b>x</b>',zoomLink:'javascript:alert(1)'})])),canvas);
assert(!unsafe.includes('<script>'));assert(!unsafe.includes('href='));assert(unsafe.includes('&lt;script&gt;'));
const cancelled=blocks.html(blocks.model(source([item('Cancelled',2,'08:00','09:00',{status:'CANCELLED'})])),canvas);assert(!cancelled.includes('href='));assert(cancelled.includes('line-through'));
const html=blocks.html(m,canvas);assert.match(html,/UMM ABBAD ACADEMY/);assert.match(html,/Year 1 Weekly timetable/);assert.match(html,/08h10/);assert.match(html,/rx="16"/);assert.match(html,/href="https:\/\/zoom.us\/j\/123"/);assert.doesNotMatch(html,/>Year 1<\/text>/);assert.match(html,/DRAFT PREVIEW/);
const seven=blocks.model(source([1,2,3,4,5,6,0].map(d=>item('Shared',d,'08:00','08:15'))));
const pages=blocks.canvases(seven,canvas);assert.equal(pages.length,1);
assert(pages[0].canvas.text.some(t=>t.value.includes('DRAFT PREVIEW')),'Version and effective date remain in the export footnote');
for(const page of pages){for(const r of page.canvas.rectangles)assert(r.x>=0&&r.y>=0&&r.x+r.w<=page.canvas.width&&r.y+r.h<=page.canvas.height,'Block and heading bounds');for(const r of page.links)assert(r.x>=0&&r.y>=0&&r.x+r.width<=page.canvas.width&&r.y+r.height<=page.canvas.height,'Link bounds');}
const dense=blocks.model(source([item('All day',2,'07:30','16:00'),...Array.from({length:12},(_,i)=>item('Short '+i,3,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'45':'15'}`))]));
const densePages=blocks.canvases(dense,canvas);assert(densePages.length>1);assert(densePages.some(p=>p.canvas.text.some(t=>t.value==='Continues on adjacent page')));
console.log('Blocks: proportional placement, uneven times, gaps, overlap lanes, safe shared entries, filters, escaping and export pagination passed.');

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
assert.equal(compactScene.blocks.find(b=>b.title==='Assembly').lines.length,2,'Class name is omitted from the class timetable block');
console.log('Compact blocks: 30-minute ticks, smaller spacing, audience-specific text bounds and one-page morning timetable passed.');
