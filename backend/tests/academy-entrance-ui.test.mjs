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
    clientWidth:400, scrollBy(options) { this.lastScroll=options; }, scrollTo() {}, scrollIntoView() {}, showModal() { this.open = true; }, close() { this.open = false; } };
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
const activity = { id:'PRG-46c8576d-9fcf-4000-96b9-856b00a0218a', name:'Reboot', kind:'PROGRAM', roles:['STUDENT'],
  tools:{ library:'/academy/library/', attendance:'' }, curriculum:[{name:'Tafseer',modules:[{name:'Module one'}]}], classes:[{name:'Class one'}],
  timetable:[{kind:'PROGRAM',activityId:'PRG-46c8576d-9fcf-4000-96b9-856b00a0218a',activityName:'Reboot',title:'Lesson <one>',date:'2026-10-05',startTime:'13:00',endTime:'14:00',timezone:'Africa/Johannesburg',involvement:'student',information:['Class one','Teacher A','Teacher B'],joinUrl:'https://zoom.test/lesson'}] };
const requests = [];
let deferNext=false, release;
const fetch = async (_url, options) => {
  const signedIn = Boolean(options.headers.Authorization), body = JSON.parse(options.body);
  requests.push(body);
  const row = structuredClone(activity);
  if (!signedIn) { row.roles=[]; row.classes=[]; row.curriculum=[]; row.timetable.forEach(event=>{delete event.information;delete event.joinUrl;event.involvement='';}); }
  const base = row.timetable[0];
  const homeTimetable = [base, {...base,title:'Earlier item',date:'2026-10-04'},
    {...base,title:'Ended item',startTime:'10:00',endTime:'11:00'},
    {...base,title:'Later Program item',date:'2026-10-06'},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',activityName:'Course item',title:'Course item',date:'2026-10-06'},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',title:'Later Course offering',date:'2026-10-07'},
    {...base,activityId:'CANCELLED',title:'Cancelled item',status:'CANCELLED'}];
  const result = { success:true,signedIn,globalAdmin:false,student:signedIn,startDate:body.startDate||'2026-10-05',endDate:'2026-10-11',warnings:[],
    activities:[row,{id:'COURSE-TAFSEER',name:'Tafseer & Tadabbur',kind:'COURSE',roles:[]}],personalActivities:signedIn?[row]:[],timetable:homeTimetable.map(event=>{const publicEvent={...event};delete publicEvent.joinUrl;return publicEvent;}),activity:body.id?row:null };
  if (deferNext) { deferNext=false; await new Promise(resolve=>{release=resolve;}); }
  return {ok:true,status:200,json:async()=>result};
};
const RealDate = Date;
class FixtureDate extends RealDate { constructor(...args) { super(...(args.length?args:['2026-10-05T10:00:00Z'])); } }
vm.runInNewContext(script, { window, document, location, localStorage:{getItem:key=>storage.get(key)||null}, fetch, Event,
  Intl, Date:FixtureDate, setInterval() {}, matchMedia:()=>({matches:false}) });
await flush();
assert.equal($('personal-activities').hidden,true);
assert.doesNotMatch($('academy-sessions').innerHTML,/data-information|Join lesson|<a /);
assert.doesNotMatch($('academy-preview-sessions').innerHTML, /<a |Earlier item|Ended item|Later Program item|Later Course offering|Cancelled item/);
assert.match($('academy-preview-sessions').innerHTML,/Course item/);
assert.equal(($('academy-preview-sessions').innerHTML.match(/<li class="upcoming-item /g)||[]).length,2);
assert.equal($('preview-timetable-link').hidden,true);
assert.match(html,/id="academy-library-nav" href="\/academy\/open-library\/"/);
assert.doesNotMatch(html,/Browse Open Library|Open my Library|class="intro-logo"|Sign in <span>Academy account|class="login-note"/);
assert.match(html,/<label for="demo-pin">PIN<\/label>/);
assert.match($('academy-preview-sessions').innerHTML,/datetime="2026-10-05"/);
assert.match($('academy-preview-sessions').innerHTML,/datetime="2026-10-06"/);
$('upcoming-next').listeners.get('click')();
assert.equal($('academy-preview-sessions').lastScroll.left,400);
$('upcoming-previous').listeners.get('click')();
assert.equal($('academy-preview-sessions').lastScroll.left,-400);
assert.match($('learning-catalogue').innerHTML,/Reboot/);
assert.match($('learning-catalogue').innerHTML,/learning-images\/reboot.jpeg/);
assert.match($('learning-catalogue').innerHTML,/learning-images\/tafseer.jpeg/);
assert.doesNotMatch($('learning-catalogue').innerHTML, /<a\b|href=|Learn more/);
assert.equal(($('learning-catalogue').innerHTML.match(/<li class="card activity-card"/g)||[]).length,6);
$('learning-next').listeners.get('click')();
assert.equal($('learning-catalogue').lastScroll.left,400);
$('learning-previous').listeners.get('click')();
assert.equal($('learning-catalogue').lastScroll.left,-400);
assert.match($('learning-catalogue').innerHTML,/learning-images\/arabic.png/);
assert.match($('learning-catalogue').innerHTML,/learning-images\/mothers.jpg/);
assert.match(html,/<section id="learning" aria-labelledby="learning-title">/);
assert.ok(html.indexOf('id="learning"') < html.indexOf('<section id="timetable"'));
assert.doesNotMatch(html,/data-nav="timetable"|Original Umm Abbad Academy artwork|Browse original Academy course and workshop information|Some posters show past dates/);
location.hash='#learning';handlers.get('hashchange')();
assert.equal($('overview').classList.contains('active'),true,'Programs and Courses must remain on the main page');
storage.set('m4l_account_token','QA');window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal($('personal-activities').hidden,false);
assert.match($('personal-pills').innerHTML,/Voice Recorder/);
assert.match($('academy-sessions').innerHTML,/class="student"/);
assert.equal($('preview-timetable-link').hidden,false);
assert.match($('academy-preview-sessions').innerHTML,/href="#activity\/PROGRAM\/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a"/);
assert.doesNotMatch($('academy-sessions').innerHTML,/Join lesson/);
documentHandlers.get('click')({target:{closest:selector=>selector==='[data-information]'?{dataset:{information:'academy-preview-sessions:0'}}:null}});
assert.equal($('lesson-information').open,true);
assert.match($('lesson-information-body').innerHTML,/Teacher A.*Teacher B/);
const previewBefore=$('academy-preview-sessions').innerHTML;
location.hash='#timetable';handlers.get('hashchange')();
assert.equal($('timetable').classList.contains('active'),true);
$('schedule-date').value='2026-09-28';$('schedule-date').listeners.get('change')();await flush();
assert.equal(requests.at(-1).startDate,'2026-09-28');
assert.equal($('academy-preview-sessions').innerHTML,previewBefore,'Browsing the full timetable must not replace the current home preview');
assert.match($('academy-sessions').innerHTML,/Later Program item/);
location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
assert.match($('activity-menu').innerHTML,/\/academy\/library\//);
assert.match($('activity-sessions').innerHTML,/Join lesson/);
assert.match($('activity-sessions').innerHTML,/Lesson &lt;one&gt;/);
assert.match($('activity-curriculum').innerHTML,/Module one/);
assert.match($('activity-coming').innerHTML,/Coming soon/);
location.hash='#recorder';handlers.get('hashchange')();assert.match($('recorder-card').innerHTML,/\/recorder\/\?academy=1/);
// A personal response that finishes after sign-out cannot restore protected content.
deferNext=true;location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));release();await flush();
assert.equal($('personal-activities').hidden,true);
assert.equal($('preview-timetable-link').hidden,true);
assert.doesNotMatch($('academy-preview-sessions').innerHTML, /<a |data-information/);
assert.equal($('lesson-information').open,false);
assert.doesNotMatch($('activity-sessions').innerHTML,/Join lesson/);
assert.equal($('activity-curriculum').innerHTML,'');
assert.equal($('recorder-card').innerHTML,'');
location.hash='#administration';handlers.get('hashchange')();assert.doesNotMatch($('administration').innerHTML,/href="\/users\//);
assert.doesNotMatch(html, /data-information="\d+"/);
console.log('Academy entrance UI: one upcoming item per activity, public timetable without links, independent full schedule, visitor/personal views, escaped labels, combined-lesson popup, contextual tools, student recorder and delayed-response sign-out passed.');
