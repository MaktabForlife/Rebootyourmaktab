import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';

const markup=await readFile(new URL('../../programs/library.html',import.meta.url),'utf8');
const source=await readFile(new URL('../../js/m4l-program-library.js',import.meta.url),'utf8');
const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(match=>match[1]));
const elements=new Map(),storage=new Map(),requests=[];
function element(id){
  assert(ids.has(id),`Missing Library element ${id}`);
  if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',dataset:{},listeners:{},classList:{toggle(){}},focus(){},removeAttribute(name){delete this[name];},addEventListener(type,fn){this.listeners[type]=fn;}});
  return elements.get(id);
}
const f=timetableFixture(),service=timetableService(f.repository,f.program);
f.repository.verifyResource=async row=>({id:row.DriveFileID});
const coordinator=timetableCoordinator(f.journal,async()=>({service,user:{accountid:'ADMIN'}}));
let failSave=false;
const context={console,URL,URLSearchParams,structuredClone,crypto,
  location:{search:`?program=${f.program.id}`},window:{M4L_CONFIG:{API_BASE:''}},document:{getElementById:element},
  localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  fetch:async(url,options)=>{
    const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
    if(action==='browse')return {ok:true,status:200,json:async()=>({success:true,folder:{id:'root',name:'Protected root'},breadcrumbs:[{id:'root',name:'Protected root'}],items:[{id:'file-pdf',name:'Lesson.pdf',isFolder:false,supportedTypes:['EBOOK'],format:'PDF'}],nextPageToken:''})};
    if(action==='manage-save'&&failSave){failSave=false;throw new Error('Offline');}
    try{
      const result=['manage-save','recover'].includes(action)?await coordinator.run(action,body,'token'):await service.read(action,body);
      return {ok:true,status:200,json:async()=>({success:true,coordinatorAvailable:true,...result})};
    }catch(error){return {ok:false,status:error.status||503,json:async()=>({success:false,error:error.message,code:error.code})};}
  }
};
const settled=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,1));};
vm.runInNewContext(source,context);await settled();
assert.equal(element('pl-add').disabled,false);
element('pl-add').onclick();
element('pl-subject').onchange({target:{value:'PS-TAFSEER'}});
element('pl-browse').onclick();await settled();
element('pl-drive').onclick({target:{closest:selector=>selector==='[data-file]'?{dataset:{file:'file-pdf'}}:null}});
assert.equal(element('pl-name').value,'Lesson');
element('pl-type').listeners.change({target:{value:'AUDIO'}});
assert.match(element('pl-file').textContent,/No file selected/);
element('pl-type').listeners.change({target:{value:'EBOOK'}});
element('pl-browse').onclick();await settled();
element('pl-drive').onclick({target:{closest:selector=>selector==='[data-file]'?{dataset:{file:'file-pdf'}}:null}});
failSave=true;element('pl-save').onclick();await settled();
assert.equal(element('pl-pending').hidden,false);
const pendingKey=`m4l-program-library-pending:${f.program.id}`,draftKey=`m4l-program-library-draft:${f.program.id}`;
const operation=JSON.parse(storage.get(pendingKey)).body.operationId;
storage.delete(draftKey);
vm.runInNewContext(source,context);await settled();
assert.equal(element('pl-editor').hidden,false,'A pending resource restores the editor without a separate draft');
element('pl-retry').onclick();await settled();
assert.equal((await service.read('manage-get')).rows.resources.length,1);
assert.equal(requests.filter(row=>row.action==='manage-save').at(-1).body.operationId,operation);
assert.equal(storage.has(pendingKey),false);
assert.equal(element('pl-pending').hidden,true);
console.log('Program Library UI: protected file selection, category reset and lost-response retry passed.');
