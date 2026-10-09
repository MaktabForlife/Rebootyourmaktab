import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const script=await readFile(new URL('../../js/m4l-academy-navigation.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<3;i++) await new Promise(resolve=>setImmediate(resolve));};
function storage(values={}) {
  const data=new Map(Object.entries(values));
  return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),key:index=>[...data.keys()][index],get length(){return data.size;}};
}
function fixture(path='/academy/open-library/',search='') {
  const nodes=new Map(), handlers=new Map(), requests=[], children=[];
  function element() {
    let markup='';
    return {hidden:false,attrs:{},handlers:new Map(),classList:{add(){}},
      setAttribute(key,value){this.attrs[key]=value;},
      addEventListener(type,fn){this.handlers.set(type,fn);},replaceChildren(){markup='';},
      get innerHTML(){return markup;},set innerHTML(value){markup=value;for(const match of value.matchAll(/id="([^"]+)"/g)) if(!nodes.has(match[1])) nodes.set(match[1],element());}
    };
  }
  const forYou=element();forYou.hidden=true;nodes.set('library-for-you',forYou);
  const localStorage=storage(),sessionStorage=storage(),location={pathname:path,search};
  const document={createElement:element,getElementById:id=>nodes.get(id),body:{classList:{add(){}},prepend:(...items)=>children.unshift(...items)}};
  const window={M4L_CONFIG:{API_BASE:'https://api.test'},addEventListener:(type,fn)=>handlers.set(type,fn),dispatchEvent:event=>handlers.get(event.type)?.(event)};
  let result={success:true,signedIn:true,student:true,personalActivities:[
    {id:'Pilot-actual-id',name:'Reboot',kind:'PROGRAM',roles:['STUDENT']},
    {id:'Course-actual-id',name:'Barakah <course>',kind:'COURSE',roles:['TEACHER']}
  ]}, hold=false,release,ok=true;
  const fetch=async(url,options)=>{requests.push({url,options});const snapshot=structuredClone(result);if(hold){hold=false;await new Promise(resolve=>{release=resolve;});}return{ok,json:async()=>snapshot};};
  runInNewContext(script,{document,window,location,localStorage,sessionStorage,fetch,URLSearchParams,encodeURIComponent,Event});
  return {nodes,handlers,requests,children,localStorage,sessionStorage,location,forYou,
    setResult:value=>{result=value;},setOk:value=>{ok=value;},defer:()=>{hold=true;},release:()=>release(),
    refresh:()=>handlers.get('m4l-academy-session')()};
}
const app=fixture();
assert.equal(app.requests.length,0,'Public Library needs no account request for a visitor');
assert.equal(app.forYou.hidden,true);
assert.equal(app.nodes.get('ac-library').href,'/academy/open-library/');
assert.equal(app.children[1].hidden,true);
app.localStorage.setItem('m4l_account_token','first-account');app.refresh();await flush();
assert.equal(app.requests[0].url,'https://api.test/api/academy/entrance');
assert.equal(app.requests[0].options.headers.Authorization,'Bearer first-account');
assert.equal(app.requests[0].options.body,'{}');
assert.equal(app.forYou.hidden,false);
assert.equal(app.nodes.get('ac-library').href,'/academy/library/');
assert.equal(app.nodes.get('ac-progress').hidden,false);
assert.match(app.children[1].innerHTML,/\/academy\/#activity\/PROGRAM\/Pilot-actual-id/);
assert.match(app.children[1].innerHTML,/href="\/academy\/#workshops"/);
assert.equal((app.children[1].innerHTML.match(/<span>Workshops<\/span>/g)||[]).length,1);
assert.doesNotMatch(app.children[1].innerHTML,/Course-actual-id|Barakah/);
assert.match(app.children[1].innerHTML,/<small>Teacher<\/small>/);
assert.doesNotMatch(app.children[0].innerHTML,/>Programs and Courses<|>Timetable</);
// Every account role can move between For You and Explore; student-only tools stay scoped.
app.setResult({success:true,signedIn:true,student:false,personalActivities:[]});app.refresh();await flush();
assert.equal(app.forYou.hidden,false);
assert.equal(app.nodes.get('ac-progress').hidden,true);
assert.equal(app.nodes.get('ac-recorder').hidden,true);
assert.equal(app.children[1].hidden,true);
app.setOk(false);app.refresh();await flush();
assert.equal(app.forYou.hidden,true);
assert.equal(app.nodes.get('ac-library').href,'/academy/open-library/');
assert.equal(app.children[1].hidden,true,'Failed validation cannot restore private activity names');
app.setOk(true);app.defer();app.refresh();await flush();
app.localStorage.removeItem('m4l_account_token');app.handlers.get('storage')({key:'m4l_account_token'});app.release();await flush();
assert.equal(app.forYou.hidden,true,'A delayed account response must not survive sign-out');
assert.equal(app.children[1].innerHTML,'');
app.localStorage.setItem('m4l_account_token','next-account');app.setResult({success:true,signedIn:true,student:false,personalActivities:[{id:'Pilot-actual-id',name:'Reboot',kind:'PROGRAM',roles:['ADMIN']}]});app.refresh();await flush();
app.localStorage.setItem('m4l_account_context','private');app.localStorage.setItem('m4l_app_cache_test','private');
app.sessionStorage.setItem('m4l_academy_signed_in','1');app.sessionStorage.setItem('m4l_admin_progress_dashboard_test','private');
app.nodes.get('ac-signout').handlers.get('click')();
assert.equal(app.location.href,'/academy/#overview');
assert.equal(app.localStorage.getItem('m4l_account_token'),null);
assert.equal(app.localStorage.getItem('m4l_app_cache_test'),null);
assert.equal(app.sessionStorage.length,0);
assert.equal(app.children[1].hidden,true);
const standalone=fixture('/recorder/');assert.equal(standalone.children.length,0,'Recorder use outside Academy keeps its existing interface');
const recorder=fixture('/recorder/','?academy=1');assert.equal(recorder.children.length,2);
const program=fixture('/programs/attendance.html','?program=Pilot-actual-id');program.localStorage.setItem('m4l_account_token','staff');program.refresh();await flush();
assert.match(program.children[1].innerHTML,/Pilot-actual-id" aria-current="page"/);
for(const file of ['academy/library/index.html','academy/open-library/index.html','academy/library/manage/index.html','programs/index.html','programs/manage.html','programs/timetable.html','programs/attendance.html','programs/library.html','programs/library-view.html','users/index.html','recorder/index.html']) {
  const html=await readFile(new URL(`../../${file}`,import.meta.url),'utf8');
  assert.match(html,/m4l-academy-navigation\.js/);assert.match(html,/m4l-academy-navigation\.css/);
}
console.log('Academy shared navigation: public/private links, actual subscribed IDs, all-role Library tabs, stale-response sign-out, tool coverage and standalone recorder isolation passed.');
