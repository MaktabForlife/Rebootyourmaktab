// Synthetic schedule only. Usage: MAKTAB_RUNTIME_NODE_MODULES=... node scripts/timetable-export-preview.mjs /tmp/output
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(`${process.env.MAKTAB_RUNTIME_NODE_MODULES}/runtime.cjs`);
const {createCanvas,loadImage}=require('@napi-rs/canvas'),lib=require('pdf-lib');
const root=new URL('../',import.meta.url),context={window:{},URL};
new Function('window',await readFile(new URL('js/m4l-timetable-presentation.js',root),'utf8'))(context.window);
const p=context.window.M4L_TIMETABLE_PRESENTATION;
const names=['Quran Made Easy',"Ma’ariful Quran",'Safwatus Tafasir','Jalalyn','Mishkaat · Selected chapters'];
const times=[['07:45','08:30'],['08:30','09:15'],['09:30','10:00'],['10:00','10:30'],['10:30','11:15']];
const occurrences=times.flatMap(([startTime,endTime],i)=>[2,3,4].map((weekday,j)=>({ruleId:`RULE-${i}-${j}`,moduleName:names[(i+j)%names.length],teacherName:'Teacher '+(j+1),classIds:['C1'],classNames:['Fourth Year'],startTime,endTime,weekday,zoomLink:'https://example.zoom.us/j/123?pwd=synthetic',status:'SCHEDULED'})));
const result={pattern:'WEEKLY',snapshot:{programName:'Faculty of Aalimiyah',timezone:'Africa/Johannesburg'},occurrences};
const model=p.model(result,{effectiveFrom:'2026-10-01'}),pages=p.canvases(model,createCanvas,await loadImage(new URL('logo.png',root).pathname));
const dir=process.argv[2]||'/tmp/maktab-10533-export';await mkdir(dir,{recursive:true});
await writeFile(`${dir}/preview.pdf`,await p.pdf(pages,lib));
await writeFile(`${dir}/preview.png`,pages[0].canvas.toBuffer('image/png'));
await writeFile(`${dir}/preview.html`,p.html(model));
const pdf=await lib.PDFDocument.load(await readFile(`${dir}/preview.pdf`));
if(pdf.getPageCount()!==pages.length)throw Error('Missing export pages');
let links=0;for(const page of pdf.getPages())links+=page.node.lookup(lib.PDFName.of('Annots'),lib.PDFArray).size();
if(links!==occurrences.length)throw Error('Missing clickable module names');
// Long and dense schedules must wrap or paginate; every link rectangle stays on page.
const dense={...result,occurrences:Array.from({length:30},(_,i)=>({...occurrences[0],startTime:`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'30':'00'}`,endTime:`${String(Math.floor(i/2)).padStart(2,'0')}:${i%2?'55':'25'}`,moduleName:'A very long module name with Arabic العربية and several words to check wrapping in the timetable',classNames:['Fourth Year and a long class name']}))};
const densePages=p.canvases(p.model(dense,{effectiveFrom:'2026-10-01'}),createCanvas);
if(densePages.length<2)throw Error('Dense schedule did not paginate');
for(const page of densePages)for(const r of page.links)if(r.x<0||r.y<0||r.x+r.width>page.canvas.width||r.y+r.height>page.canvas.height)throw Error('Clipped PDF link');
await writeFile(`${dir}/dense.pdf`,await p.pdf(densePages,lib));
console.log(`${pages.length} sample page, ${links} valid PDF links; ${densePages.length} dense schedule pages; bounds checked.`);
