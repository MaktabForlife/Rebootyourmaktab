// Synthetic schedule only. Usage: MAKTAB_RUNTIME_NODE_MODULES=... node scripts/timetable-export-preview.mjs /tmp/output
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(`${process.env.MAKTAB_RUNTIME_NODE_MODULES}/runtime.cjs`);
const {createCanvas,loadImage}=require('@napi-rs/canvas'),lib=require('pdf-lib');
const root=new URL('../',import.meta.url),context={window:{},URL};
new Function('window',await readFile(new URL('js/m4l-timetable-presentation.js',root),'utf8'))(context.window);
const p=context.window.M4L_TIMETABLE_PRESENTATION;
const base={teacherName:'',classIds:['C1'],classNames:['Fourth Year'],zoomLink:'https://example.zoom.us/j/123?pwd=synthetic',status:'SCHEDULED'};
const item=(title,weekday,startTime,endTime,extra={})=>({...base,ruleId:`RULE-${title}-${weekday}`,moduleName:title,weekday,startTime,endTime,...extra});
const occurrences=[...[2,3,4].map(d=>item('Assembly',d,'07:30','07:45')),item('Quduri',2,'07:45','09:15'),item('Mishkaat',3,'07:45','09:15'),item('Quduri',4,'07:45','08:30',{teacherName:'Teacher A'}),item('Mishkaat',4,'08:30','09:15',{teacherName:'Teacher B'}),...[2,3,4].map(d=>item('Break',d,'09:15','09:30',{kind:'BREAK',zoomLink:'',classIds:[],classNames:[]})),item('Mishkaat',2,'09:30','10:00')];
const result={pattern:'WEEKLY',snapshot:{programName:'Faculty of Aalimiyah',timezone:'Africa/Johannesburg'},occurrences};
const model=p.model(result,{effectiveFrom:'2026-10-01'}),pages=p.canvases(model,createCanvas,await loadImage(new URL('logo.png',root).pathname));
const dir=process.argv[2]||'/tmp/maktab-10533-export';await mkdir(dir,{recursive:true});
await writeFile(`${dir}/preview.pdf`,await p.pdf(pages,lib));
await writeFile(`${dir}/preview.png`,pages[0].canvas.toBuffer('image/png'));
await writeFile(`${dir}/preview.html`,p.html(model));
const pdf=await lib.PDFDocument.load(await readFile(`${dir}/preview.pdf`));
if(pdf.getPageCount()!==pages.length)throw Error('Missing export pages');
let links=0;for(const page of pdf.getPages())links+=page.node.lookup(lib.PDFName.of('Annots'),lib.PDFArray).size();
if(links!==6)throw Error('Missing clickable module names');
// Long and dense schedules must wrap or paginate; every link rectangle stays on page.
const dense={...result,occurrences:Array.from({length:30},(_,i)=>({...occurrences[0],startTime:`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`,endTime:`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'55':'25'}`,moduleName:'A very long module name with Arabic العربية and several words to check wrapping in the timetable',classNames:['Fourth Year and a long class name']}))};
const densePages=p.canvases(p.model(dense,{effectiveFrom:'2026-10-01'}),createCanvas);
if(densePages.length<2)throw Error('Dense schedule did not paginate');
for(const page of densePages)for(const r of page.links)if(r.x<0||r.y<0||r.x+r.width>page.canvas.width||r.y+r.height>page.canvas.height)throw Error('Clipped PDF link');
await writeFile(`${dir}/dense.pdf`,await p.pdf(densePages,lib));
console.log(`${pages.length} sample page, ${links} valid PDF links; ${densePages.length} dense schedule pages; bounds checked.`);

const adjusted=p.model(result,{effectiveFrom:'2026-10-01',layout:{alignment:'left',mergeShared:false,columnWidths:{time:230,2:460,3:360,4:300},rowHeights:{'09:15|09:30':100}}});
const adjustedPages=p.canvases(adjusted,createCanvas);await writeFile(`${dir}/adjusted.pdf`,await p.pdf(adjustedPages,lib));await writeFile(`${dir}/adjusted.png`,adjustedPages[0].canvas.toBuffer('image/png'));
const wide=p.model({...result,occurrences:[1,2,3,4,5,6,0].map(d=>item('Shared assembly',d,'07:30','07:45'))},{effectiveFrom:'2026-10-01'});
const widePages=p.canvases(wide,createCanvas);if(widePages.length!==2||widePages.some(page=>page.links.length!==1))throw Error('Weekday group merges failed');
console.log('Adjusted layout and seven-day pagination checked.');

new Function('window',await readFile(new URL('js/m4l-timetable-blocks.js',root),'utf8'))(context.window);
const blocks=context.window.M4L_TIMETABLE_BLOCKS;
for(const [name,input] of [['blocks',result],['blocks-dense',dense],['blocks-wide',{...result,occurrences:[1,2,3,4,5,6,0].map(d=>item('Shared assembly',d,'07:30','07:45'))}],['blocks-uneven',{...result,occurrences:[item('Quduri',2,'07:45','09:15'),item('Mishkaat',3,'08:10','09:05',{teacherName:'Teacher B'}),item('Fiqh',3,'08:30','09:20',{classIds:['C2'],classNames:['Third Year'],teacherName:'Teacher C'}),item('Tafseer',2,'09:30','10:00')]}]]){
 const m=blocks.model(input,{effectiveFrom:'2026-10-01'}),pages=blocks.canvases(m,createCanvas,await loadImage(new URL('logo.png',root).pathname));
 for(const page of pages)for(const r of page.links)if(r.x<0||r.y<0||r.x+r.width>page.canvas.width||r.y+r.height>page.canvas.height)throw Error('Clipped blocks PDF link');
 if(['blocks','blocks-wide','blocks-uneven'].includes(name)&&pages.length!==1)throw Error(name+' should fit one page');
 const bytes=await p.pdf(pages,lib),doc=await lib.PDFDocument.load(bytes);if(doc.getPageCount()!==pages.length)throw Error('Missing blocks pages');
 let annotations=0;for(const page of doc.getPages())annotations+=page.node.lookup(lib.PDFName.of('Annots'),lib.PDFArray).size();
 if(annotations!==pages.reduce((sum,page)=>sum+page.links.length,0))throw Error('Missing blocks PDF annotations');
 await writeFile(`${dir}/${name}.pdf`,bytes);for(let i=0;i<pages.length;i++)await writeFile(`${dir}/${name}-${i+1}.png`,pages[i].canvas.toBuffer('image/png'));
 console.log(`${name}: ${pages.length} pages, ${annotations} clickable title lines, link bounds checked.`);
}
