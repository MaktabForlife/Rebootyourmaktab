import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const markup=await readFile(new URL('../../programs/attendance.html',import.meta.url),'utf8');
const source=await readFile(new URL('../../js/m4l-program-attendance.js',import.meta.url),'utf8');
const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(match=>match[1]));
const elements=new Map(),storage=new Map(),requests=[];
function element(id){
  assert(ids.has(id),`Missing attendance element ${id}`);
  if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,href:'',value:'',textContent:'',innerHTML:'',listeners:{},
    classList:{toggle(){}},addEventListener(type,handler){this.listeners[type]=handler;}});
  return elements.get(id);
}
const lesson=(anchor,classId,name,accountId,submitted=false,status=null)=>({
  lesson:{anchor,classId,moduleName:name,subjectName:'Arabic',startTime:'09:00',endTime:'10:00'},
  submitted,registerId:submitted?`REG-${anchor}`:'',submittedAt:submitted?'2026-10-08T08:00:00Z':'',
  marks:[{accountId,name:'Learner '+accountId,status}]
});
const views={
  P1:{program:{id:'P1',name:'Alimiyah'},prepared:true,canPrepare:false,today:'2026-10-08',date:'2026-10-08',
    classes:[{id:'C1',name:'Class A'},{id:'C2',name:'Class B'}],
    lessons:[lesson('L1','C1','Quduri','S1',true,'ABSENT'),lesson('L2','C1','Arabic','S1'),
      lesson('L3','C2','Fiqh','S2')],
    scheduledLessons:3,submittedLessons:1,complete:false,learners:[]},
  P2:{program:{id:'P2',name:'Reboot'},prepared:true,canPrepare:false,today:'2026-10-08',date:'2026-10-08',
    classes:[{id:'C3',name:'Class C'}],lessons:[lesson('L4','C3','Reading','S3',true,'PRESENT')],
    scheduledLessons:1,submittedLessons:1,complete:true,learners:[]}
};
const context={console,crypto,URLSearchParams,location:{search:'?program=P1'},history:{replaceState(){}},
  localStorage:{getItem:()=> 'token'},
  sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  document:{getElementById:element},window:{M4L_CONFIG:{API_BASE:''}},
  fetch:async(url,options)=>{
    const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
    if(action==='available')return {ok:true,json:async()=>({success:true,
      accountPath:'/account/personal-id',programs:[{id:'P1',name:'Alimiyah',role:'TEACHER'},
        {id:'P2',name:'Reboot',role:'SENIOR'}]})};
    if(action==='get')return {ok:true,json:async()=>({success:true,...structuredClone(views[body.id])})};
    if(action==='submit')return {ok:true,json:async()=>({success:true,submittedLessons:1,editedLessons:1})};
    throw Error(`Unexpected attendance action ${action}`);
  }};
vm.runInNewContext(source,context);
async function settled(){for(let index=0;index<12;index++)await new Promise(resolve=>setTimeout(resolve,1));}
await settled();
assert.match(element('pa-programs').innerHTML,/Alimiyah/);
assert.match(element('pa-programs').innerHTML,/Reboot/);
assert.match(element('pa-classes').innerHTML,/Class A/);
assert.match(element('pa-classes').innerHTML,/Class B/);
assert.match(element('pa-classes').innerHTML,/All lessons/);
assert.doesNotMatch(element('pa-classes').innerHTML,/Break/);
assert.match(element('pa-classes').innerHTML,/Mixed · keep/,'All lessons preserves differing submitted marks');
assert.equal(element('pa-account').href,'/account/personal-id');
assert.equal(element('pa-home').href,'/account/personal-id');
assert.equal(element('pa-library').href,'/programs/library-view.html?program=P1');
element('pa-classes').listeners.change({target:{matches:selector=>selector==='[data-mark]',dataset:{class:'C1',account:'S1'},value:'ABSENT'}});
element('pa-classes').listeners.click({target:{closest:()=>({dataset:{submit:'C1'}})}});
await settled();
let saved=requests.filter(row=>row.action==='submit').at(-1).body;
assert.equal(saved.classId,'C1');
assert.equal(saved.scope,'day');
assert.deepEqual(Object.keys(saved.exceptions).sort(),['L1','L2']);
assert.equal(saved.baseRegisterIds.L1,'REG-L1');
assert.equal(saved.baseRegisterIds.L2,'');
assert.equal(saved.exceptions.L2[0].status,'ABSENT');
assert(!Object.hasOwn(saved.exceptions,'L3'),'One class submission leaves the next class untouched');
element('pa-programs').listeners.click({target:{closest:()=>({dataset:{program:'P2'}})}});
await settled();
assert.match(element('pa-classes').innerHTML,/Class C/);
assert.doesNotMatch(element('pa-classes').innerHTML,/Class A/);
assert.equal(element('pa-library').href,'/programs/library-view.html?program=P2');
element('pa-classes').listeners.change({target:{matches:selector=>selector==='[data-mark]',dataset:{class:'C3',account:'S3'},value:'EXCUSED'}});
element('pa-classes').listeners.click({target:{closest:()=>({dataset:{submit:'C3'}})}});
await settled();
saved=requests.filter(row=>row.action==='submit').at(-1).body;
assert.equal(saved.baseRegisterIds.L4,'REG-L4','An edit names the register revision shown to the teacher');
assert.equal(saved.exceptions.L4[0].status,'EXCUSED');
console.log('Program attendance UI: program pills, class columns, All lessons, edits and account navigation passed.');
