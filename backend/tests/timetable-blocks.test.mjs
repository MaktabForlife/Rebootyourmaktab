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
for(const b of s.blocks){assert.equal(b.y,(b.start-s.start)*s.scale);assert.equal(b.height,(b.end-b.start)*s.scale);assert(b.height>=b.needed+8);}
assert.equal(s.blocks.find(b=>b.title==='Later').y-(s.blocks.find(b=>b.title==='Long').y+s.blocks.find(b=>b.title==='Long').height),15*s.scale,'A real 15-minute gap is retained');
assert.equal(JSON.stringify(input),original,'Preview never modifies schedule data');
const parallel=blocks.scene(blocks.model(source([item('First',2,'08:00','09:00'),item('Other class',2,'08:15','08:45',{classIds:['B']}),item('After',2,'09:00','09:30')])),canvas);
const first=parallel.blocks.find(b=>b.title==='First'),other=parallel.blocks.find(b=>b.title==='Other class'),after=parallel.blocks.find(b=>b.title==='After');
assert.equal(first.lanes,2);assert(first.x+first.width<other.x);assert.equal(after.lanes,1);
const shared=[2,3,4].map(d=>item('Assembly',d,'07:30','07:45'));
assert.equal(blocks.position(blocks.model(source(shared)))[0].span,3);
for(const extra of [{zoomLink:'https://zoom.us/j/different'},{moduleId:'Other'},{teacherId:'T2'},{status:'CANCELLED'}])assert.equal(blocks.position(blocks.model(source([shared[0],{...shared[1],...extra}]))).length,2);
assert(blocks.position(blocks.model(source(shared),{layout:{mergeShared:false}})).every(b=>b.span===1));
const filtered=blocks.model(source([...shared,item('Other class',2,'08:00','09:00',{classIds:['B']}),item('Break',2,'09:00','09:15',{kind:'BREAK',classIds:[],classNames:[],zoomLink:''})]),{classId:'A'});
assert(!filtered.events.some(b=>b.title==='Other class'));assert(filtered.events.some(b=>b.kind==='BREAK'));
const unsafe=blocks.html(blocks.model(source([item('<script>evil</script>',2,'08:00','09:00',{teacherName:'<b>x</b>',zoomLink:'javascript:alert(1)'})])),canvas);
assert(!unsafe.includes('<script>'));assert(!unsafe.includes('href='));assert(unsafe.includes('&lt;script&gt;'));
const cancelled=blocks.html(blocks.model(source([item('Cancelled',2,'08:00','09:00',{status:'CANCELLED'})])),canvas);assert(!cancelled.includes('href='));assert(cancelled.includes('line-through'));
const html=blocks.html(m,canvas);assert.match(html,/08h10/);assert.match(html,/rx="16"/);assert.match(html,/href="https:\/\/zoom.us\/j\/123"/);
const seven=blocks.model(source([1,2,3,4,5,6,0].map(d=>item('Shared',d,'08:00','08:15'))));
const pages=blocks.canvases(seven,canvas);assert.equal(pages.length,2);
for(const page of pages){for(const r of page.canvas.rectangles)assert(r.x>=0&&r.y>=0&&r.x+r.w<=page.canvas.width&&r.y+r.h<=page.canvas.height,'Block and heading bounds');for(const r of page.links)assert(r.x>=0&&r.y>=0&&r.x+r.width<=page.canvas.width&&r.y+r.height<=page.canvas.height,'Link bounds');}
const dense=blocks.model(source([item('All morning',2,'07:30','13:00'),...Array.from({length:12},(_,i)=>item('Short '+i,3,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`,`${String(8+Math.floor(i/2)).padStart(2,'0')}:${i%2?'45':'15'}`))]));
const densePages=blocks.canvases(dense,canvas);assert(densePages.length>1);assert(densePages.some(p=>p.canvas.text.some(t=>t.value==='Continues on adjacent page')));
console.log('Blocks: proportional placement, uneven times, gaps, overlap lanes, safe shared entries, filters, escaping and export pagination passed.');
