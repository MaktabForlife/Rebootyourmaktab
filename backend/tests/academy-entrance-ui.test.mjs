import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../../academy/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../../js/m4l-academy-entrance.js', import.meta.url), 'utf8');
const elements = new Map(), handlers = new Map(), documentHandlers = new Map(), storage = new Map();
function element(id = '') {
  const classes = new Set(), listeners = new Map();
  return { id, listeners, dataset: {}, textContent: '', innerHTML: '', hidden: false, value: '', open: false,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
      toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); } },
    addEventListener: (type, fn) => listeners.set(type, fn), setAttribute() {}, removeAttribute() {},
    replaceChildren() { this.innerHTML = ''; this.textContent = ''; },
    appendChild(child) { elements.set(child.id, child); }, querySelectorAll: () => [], contains: () => false,
    scrollTo() {}, scrollIntoView() {}, showModal() { this.open = true; }, close() { this.open = false; } };
}
for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], element(match[1]));
elements.get('film-track').querySelectorAll = () => [{offsetLeft:0}, {offsetLeft:100}];
const views = [...html.matchAll(/<section id="([^"]+)" class="view/g)].map(match => elements.get(match[1]));
const container = element('container');
const document = { getElementById: id => elements.get(id), createElement: () => element(), visibilityState: 'visible',
  querySelector: () => container, querySelectorAll: selector => selector === '.view' ? views : [],
  addEventListener: (type, fn) => documentHandlers.set(type, fn) };
const location = { hash: '#overview' };
const window = { M4L_CONFIG: { API_BASE: 'https://test' }, location,
  addEventListener(type, fn) { handlers.set(type, fn); }, dispatchEvent(event) { handlers.get(event.type)?.(event); } };
const $ = id => elements.get(id), flush = async () => { for (let i=0;i<4;i++) await new Promise(resolve=>setImmediate(resolve)); };
const activity = { id:'PRG-TEST', name:'Reboot', kind:'PROGRAM', roles:['STUDENT'],
  tools:{ library:'/academy/library/', attendance:'' }, curriculum:[{name:'Tafseer',modules:[{name:'Module one'}]}], classes:[{name:'Class one'}],
  timetable:[{kind:'PROGRAM',activityId:'PRG-TEST',activityName:'Reboot',title:'Lesson <one>',date:'2026-10-05',startTime:'13:00',endTime:'14:00',timezone:'Africa/Johannesburg',involvement:'student',information:['Class one','Teacher A','Teacher B'],joinUrl:'https://zoom.test/lesson'}] };
let deferNext=false, release;
const fetch = async (_url, options) => {
  const signedIn = Boolean(options.headers.Authorization), body = JSON.parse(options.body);
  const row = structuredClone(activity);
  if (!signedIn) { row.roles=[]; row.classes=[]; row.curriculum=[]; row.timetable.forEach(event=>{delete event.information;delete event.joinUrl;event.involvement='';}); }
  const result = { success:true,signedIn,globalAdmin:false,student:signedIn,startDate:'2026-10-05',endDate:'2026-10-11',warnings:[],
    activities:[row],personalActivities:signedIn?[row]:[],timetable:row.timetable.map(event=>{const publicEvent={...event};delete publicEvent.joinUrl;return publicEvent;}),activity:body.id?row:null };
  if (deferNext) { deferNext=false; await new Promise(resolve=>{release=resolve;}); }
  return {ok:true,status:200,json:async()=>result};
};
vm.runInNewContext(script, { window, document, location, localStorage:{getItem:key=>storage.get(key)||null}, fetch, Event,
  Intl, Date, setInterval() {}, matchMedia:()=>({matches:false}) });
await flush();
assert.equal($('personal-activities').hidden,true);
assert.doesNotMatch($('academy-sessions').innerHTML,/data-information|Join lesson/);
assert.match($('program-catalogue').innerHTML,/Reboot/);
storage.set('m4l_account_token','QA');window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal($('personal-activities').hidden,false);
assert.match($('personal-pills').innerHTML,/Voice Recorder/);
assert.match($('academy-sessions').innerHTML,/class="student"/);
assert.doesNotMatch($('academy-sessions').innerHTML,/Join lesson/);
documentHandlers.get('click')({target:{closest:selector=>selector==='[data-information]'?{dataset:{information:'academy-sessions:0'}}:null}});
assert.equal($('lesson-information').open,true);
assert.match($('lesson-information-body').innerHTML,/Teacher A.*Teacher B/);
location.hash='#activity/PROGRAM/PRG-TEST';handlers.get('hashchange')();await flush();
assert.match($('activity-menu').innerHTML,/\/academy\/library\//);
assert.match($('activity-sessions').innerHTML,/Join lesson/);
assert.match($('activity-sessions').innerHTML,/Lesson &lt;one&gt;/);
assert.match($('activity-curriculum').innerHTML,/Module one/);
assert.match($('activity-coming').innerHTML,/Coming soon/);
location.hash='#recorder';handlers.get('hashchange')();assert.match($('recorder-card').innerHTML,/\/recorder\/\?academy=1/);
// A personal response that finishes after sign-out cannot restore protected content.
deferNext=true;location.hash='#activity/PROGRAM/PRG-TEST';handlers.get('hashchange')();await flush();
storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));release();await flush();
assert.equal($('personal-activities').hidden,true);
assert.equal($('lesson-information').open,false);
assert.doesNotMatch($('activity-sessions').innerHTML,/Join lesson/);
assert.equal($('activity-curriculum').innerHTML,'');
assert.equal($('recorder-card').innerHTML,'');
location.hash='#administration';handlers.get('hashchange')();assert.doesNotMatch($('administration').innerHTML,/href="\/users\//);
assert.doesNotMatch(html, /data-information="\d+"/);
console.log('Academy entrance UI: visitor/personal views, escaped labels, combined-lesson popup, contextual tools, student recorder and delayed-response sign-out passed.');
