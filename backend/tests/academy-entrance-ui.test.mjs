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
let fixtureNow='2026-10-05T10:00:00Z';
let nextTimer=0;
const timers=new Map();
const stamp = event => {
  const startsAt=Date.parse(`${event.date}T${event.startTime}:00+02:00`);
  const endsAt=Date.parse(`${event.date}T${event.endTime}:00+02:00`);
  const result={...event,relevant:true,status:event.status||'SCHEDULED',startsAt,endsAt,joinAvailableAt:startsAt-300000};
  if (Date.parse(fixtureNow)<result.joinAvailableAt || Date.parse(fixtureNow)>=endsAt || result.status!=='SCHEDULED') delete result.joinUrl;
  return result;
};
let deferNext=false, release, hasWorkshops=true, globalAdmin=false, programRole='STUDENT';
const fetch = async (_url, options) => {
  const signedIn = Boolean(options.headers.Authorization), body = JSON.parse(options.body);
  requests.push(body);
  const row = structuredClone(activity);
  if (signedIn) row.roles=[globalAdmin?'GLOBAL_ADMIN':programRole];
  if (signedIn && (globalAdmin || programRole!=='STUDENT')) {
    row.tools.attendance=`/programs/attendance.html?program=${encodeURIComponent(row.id)}`;
    // A cached older backend may still advertise its wider Program Library editor.
    row.tools.resources=`/programs/library.html?program=${encodeURIComponent(row.id)}`;
  }
  if (globalAdmin && signedIn) Object.assign(row.tools, {
    manage:`/programs/manage.html?program=${encodeURIComponent(row.id)}`,
    timetableBuilder:`/programs/timetable.html?program=${encodeURIComponent(row.id)}`,users:'/users/'
  });
  if (!signedIn) { row.roles=[]; row.classes=[]; row.curriculum=[]; row.timetable.forEach(event=>{delete event.information;delete event.joinUrl;event.involvement='';}); }
  const workshops = [{id:'COURSE-BARAKAH',name:'Barakah',roles:['TEACHER']}, {id:'COURSE-SALAAH',name:'Salaah',roles:['STUDENT']}]
    .map(course=>({...row,...course,kind:'COURSE',roles:!signedIn||!hasWorkshops?[]:globalAdmin?['GLOBAL_ADMIN']:course.roles,
      timetable:row.timetable.map(event=>({...event,kind:'COURSE',activityId:course.id,activityName:course.name}))}));
  const activities=[row,...workshops,{id:'COURSE-TAFSEER',name:'Tafseer & Tadabbur',kind:'COURSE',roles:[]}];
  const base = row.timetable[0];
  const homeTimetable = [base, {...base,title:'Earlier item',date:'2026-10-04'},
    {...base,title:'Ended item',startTime:'10:00',endTime:'11:00'},
    {...base,title:'Later Program item',date:'2026-10-06'},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',activityName:'Course item',title:'Course item',date:'2026-10-06'},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',title:'Later Course offering',date:'2026-10-07'},
    {...base,activityId:'CANCELLED',title:'Cancelled item',status:'CANCELLED'}];
  const result = { success:true,signedIn,globalAdmin:signedIn&&globalAdmin,student:signedIn&&activities.some(item=>item.roles.includes('STUDENT')),startDate:body.startDate||'2026-10-05',endDate:'2026-10-11',warnings:[],
    activities,personalActivities:signedIn?activities.filter(item=>item.roles.length):[],timetable:homeTimetable.map(event=>{const publicEvent={...event};delete publicEvent.joinUrl;return publicEvent;}),activity:body.id?activities.find(item=>item.id===body.id):null };
  result.personalTimetable=signedIn ? (globalAdmin ? result.timetable.filter(event=>event.status!=='CANCELLED').map(stamp) : body.id ? [
    ...row.timetable.map(stamp),
    ...row.timetable.map(event=>stamp({...event,date:'2026-10-06',title:'Tomorrow Program lesson'})),
    ...workshops.filter(item=>item.roles.length).flatMap(item=>item.timetable.map(event=>stamp({...event,title:`Course ${item.name}`,startTime:'14:30',endTime:'15:30'})))
  ] : result.timetable.filter(event=>event.status!=='CANCELLED').map(stamp)) : [];
  if (body.id) result.personalTimetable=result.personalTimetable.filter(event=>event.status==='SCHEDULED');
  if (deferNext) { deferNext=false; await new Promise(resolve=>{release=resolve;}); }
  return {ok:true,status:200,json:async()=>result};
};
const RealDate = Date;
class FixtureDate extends RealDate { constructor(...args) { super(...(args.length?args:[fixtureNow])); } }
vm.runInNewContext(script, { window, document, location, localStorage:{getItem:key=>storage.get(key)||null}, fetch, Event,
  Intl, Date:FixtureDate, setInterval() {}, setTimeout(fn,delay) { const id=++nextTimer;timers.set(id,{fn,delay});return id; }, clearTimeout(id) {timers.delete(id);}, matchMedia:()=>({matches:false}) });
await flush();
assert.equal($('personal-activities').hidden,true);
assert.equal($('academy-progress-nav').hidden,true);
assert.equal($('academy-recorder-nav').hidden,true);
assert.equal($('workshop-pills').innerHTML,'');
assert.ok(html.indexOf('id="personal-activities"')>html.indexOf('id="academy-home-card"'));
assert.ok(html.indexOf('id="personal-activities"')<html.indexOf('class="intro-actions"'));
location.hash='#workshops';handlers.get('hashchange')();
assert.equal($('workshops').classList.contains('active'),true);
assert.match($('workshops-message').textContent,/Sign in/);
assert.doesNotMatch($('academy-sessions').innerHTML,/data-information|Join lesson|<a /);
assert.doesNotMatch($('academy-preview-sessions').innerHTML, /<a |Earlier item|Ended item|Cancelled item/);
assert.match($('academy-preview-sessions').innerHTML,/Course item/);
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/Africa\/Johannesburg/);
assert.match($('academy-sessions').innerHTML,/Africa\/Johannesburg/);
assert.equal(($('academy-preview-sessions').innerHTML.match(/<li class="upcoming-item /g)||[]).length,4);
assert.equal($('preview-timetable-link').hidden,true);
assert.match(html,/id="academy-library-nav" href="\/academy\/open-library\/"/);
assert.doesNotMatch(html,/Browse Open Library|Open my Library|class="intro-logo"|Sign in <span>Academy account|class="login-note"/);
assert.match(html,/<label for="demo-pin">PIN<\/label>/);
assert.match($('academy-preview-sessions').innerHTML,/datetime="2026-10-05"/);
assert.match($('academy-preview-sessions').innerHTML,/datetime="2026-10-06"/);
assert.match($('academy-preview-sessions').innerHTML,/datetime="2026-10-07"/,'Later days must not disappear after the first lesson for each activity');
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
assert.doesNotMatch(html,/data-nav="timetable"|data-nav="learning"|Original Umm Abbad Academy artwork|Browse original Academy course and workshop information|Some posters show past dates/);
location.hash='#learning';handlers.get('hashchange')();
assert.equal($('overview').classList.contains('active'),true,'Programs and Courses must remain on the main page');
storage.set('m4l_account_token','QA');window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal($('personal-activities').hidden,false);
assert.equal($('activity-switcher').hidden,true,'Home does not repeat the subscribed row');
assert.equal($('activity-switcher').innerHTML,'');
assert.ok(html.indexOf('id="activity-switcher"') < html.indexOf('class="container"'),'Subscriptions belong above every view');
assert.doesNotMatch($('personal-pills').innerHTML,/Voice Recorder|Dua and Surah Progress/);
assert.equal($('academy-progress-nav').hidden,false);
assert.equal($('academy-recorder-nav').hidden,false);
assert.match($('personal-pills').innerHTML,/<span>Reboot<\/span><small>Student<\/small>/);
assert.equal(($('personal-pills').innerHTML.match(/href="#workshops"/g)||[]).length,1);
assert.doesNotMatch($('personal-pills').innerHTML,/Barakah|Salaah|COURSE-BARAKAH|COURSE-SALAAH/);
location.hash='#workshops';handlers.get('hashchange')();
assert.equal($('activity-switcher').hidden,false);
assert.equal(($('activity-switcher').innerHTML.match(/href="#workshops"/g)||[]).length,1);
assert.match($('activity-switcher').innerHTML,/href="#workshops" aria-current="page"/);
assert.doesNotMatch($('activity-switcher').innerHTML,/COURSE-BARAKAH|COURSE-SALAAH|Barakah|Salaah/);
assert.match($('workshop-pills').innerHTML,/href="#activity\/COURSE\/COURSE-BARAKAH"><span>Barakah<\/span><small>Teacher<\/small>/);
assert.match($('workshop-pills').innerHTML,/href="#activity\/COURSE\/COURSE-SALAAH"><span>Salaah<\/span><small>Student<\/small>/);
assert.doesNotMatch($('workshop-pills').innerHTML,/COURSE-TAFSEER/,'The chooser must not expose a Course without account access');
location.hash='#activity/COURSE/COURSE-BARAKAH';handlers.get('hashchange')();await flush();
assert.equal($('activity-title').textContent,'Barakah');
assert.equal($('activity-back-link').href,'#workshops');
assert.match($('academy-sessions').innerHTML,/class="upcoming-item student"/);
assert.equal($('preview-timetable-link').hidden,false);
assert.match($('academy-preview-sessions').innerHTML,/href="#activity\/PROGRAM\/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a"/);
assert.doesNotMatch($('academy-sessions').innerHTML,/Join lesson/);
documentHandlers.get('click')({target:{closest:selector=>selector==='[data-information]'?{dataset:{information:'academy-preview-sessions:0'}}:null}});
assert.equal($('lesson-information').open,true);
assert.match($('lesson-information-body').innerHTML,/Teacher A.*Teacher B/);
const previewBefore=$('academy-preview-sessions').innerHTML;
location.hash='#timetable';handlers.get('hashchange')();
assert.equal($('activity-switcher').hidden,false);
assert.match($('activity-switcher').innerHTML,/href="#workshops"/);
assert.equal($('timetable').classList.contains('active'),true);
$('schedule-date').value='2026-09-28';$('schedule-date').listeners.get('change')();await flush();
assert.equal(requests.at(-1).startDate,'2026-09-28');
assert.equal($('academy-preview-sessions').innerHTML,previewBefore,'Browsing the full timetable must not replace the current home preview');
assert.match($('academy-sessions').innerHTML,/Later Program item/);
location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
assert.match($('activity-menu').innerHTML,/href="\/academy\/library\/">Library<\/a>/);
assert.doesNotMatch($('activity-sessions').innerHTML,/Join lesson|https:\/\/zoom/,'No join URL before the opening window');
assert.match($('activity-sessions').innerHTML,/next-lesson student/);
assert.match($('activity-sessions').innerHTML,/Next lesson/);
assert.match($('activity-sessions').innerHTML,/Course Barakah/);
assert.match($('activity-sessions').innerHTML,/Course Salaah/);
assert.match($('activity-sessions').innerHTML,/class="upcoming-days"/);
assert.match($('activity-sessions').innerHTML,/Tomorrow Program lesson/);
assert.equal(($('activity-sessions').innerHTML.match(/<li class="upcoming-item /g)||[]).length,4,'The personal day columns retain every lesson, including repeat Programs on later dates');
$('personal-next').listeners.get('click')();
assert.equal($('activity-sessions').lastScroll.left,400);
$('personal-previous').listeners.get('click')();
assert.equal($('activity-sessions').lastScroll.left,-400);
assert.match($('activity-switcher').innerHTML,/<a href="#activity\/PROGRAM\/PRG-[^"]+" aria-current="page">/);
assert.match($('activity-switcher').innerHTML,/<span>Workshops<\/span><small>Teacher · Student<\/small>/);
assert.doesNotMatch($('activity-switcher').innerHTML,/COURSE-SALAAH/);
assert.doesNotMatch($('activity-switcher').innerHTML,/COURSE-TAFSEER/);
assert.equal($('activity-switcher').hidden,false);
const integratedBefore=$('activity-sessions').innerHTML;
location.hash='#activity/COURSE/COURSE-SALAAH';handlers.get('hashchange')();await flush();
assert.equal($('activity-sessions').innerHTML,integratedBefore,'The personal integrated timetable is the same on Program and Course pages');
assert.equal($('activity-curriculum-section').hidden,true,'Student Course pages also omit Modules');
assert.equal($('activity-classes-section').hidden,true);
assert.match($('activity-switcher').innerHTML,/<a href="#workshops" aria-current="page">/);
fixtureNow='2026-10-05T10:55:00Z';
const refreshAtGate=[...timers.values()][0];timers.clear();refreshAtGate.fn();await flush();
assert.match($('activity-sessions').innerHTML,/Join lesson/,'The open page refreshes joining at five minutes before start');
fixtureNow='2026-10-05T11:00:00Z';documentHandlers.get('visibilitychange')();await flush();
assert.match($('activity-sessions').innerHTML,/In progress/);
fixtureNow='2026-10-05T12:00:00Z';
const refreshAtEnd=[...timers.values()][0];timers.clear();refreshAtEnd.fn();await flush();
assert.doesNotMatch($('activity-sessions').innerHTML,/https:\/\/zoom.test\/lesson/,'The ended lesson link is removed without navigation');
fixtureNow='2026-10-05T10:00:00Z';
location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
assert.match($('activity-sessions').innerHTML,/Lesson &lt;one&gt;/);
assert.equal($('activity-curriculum').innerHTML,'');
assert.equal($('activity-classes').innerHTML,'');
assert.equal($('activity-curriculum-section').hidden,true);
assert.equal($('activity-classes-section').hidden,true);
assert.match($('activity-coming').innerHTML,/Coming soon/);
assert.match($('activity-coming').innerHTML,/<h3>Announcements<\/h3>/);
assert.match($('activity-coming').innerHTML,/<h3>Calendar<\/h3>/);
assert.match($('activity-coming').innerHTML,/<h3>Assignments<\/h3>/);
assert.doesNotMatch($('activity-coming').innerHTML,/Class preparation|Mark attendance|Make announcement|Library management|Program management|User management|Calendar management|<h3>Progress<\/h3>/);
assert.equal($('activity-back-link').href,'#overview');
location.hash='#recorder';handlers.get('hashchange')();assert.match($('recorder-card').innerHTML,/\/recorder\/\?academy=1/);
programRole='TEACHER';hasWorkshops=false;location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal($('academy-progress-nav').hidden,true);
assert.equal($('academy-recorder-nav').hidden,true);
assert.equal($('activity-curriculum-section').hidden,false);
assert.equal($('activity-classes-section').hidden,false);
assert.match($('activity-curriculum').innerHTML,/Module one/);
assert.match($('activity-classes').innerHTML,/Class one/);
assert.match($('activity-menu').innerHTML,/href="\/programs\/attendance\.html\?program=[^"]+">Mark attendance<\/a>/);
assert.doesNotMatch($('activity-menu').innerHTML,/\/programs\/library\.html|\/programs\/manage\.html|href="\/users\//,'Assigned-class editing must not open a wider Program editor');
assert.match($('activity-coming').innerHTML,/<h3>Make announcement<\/h3>/);
assert.match($('activity-coming').innerHTML,/<h3>Library management<\/h3>/);
assert.match($('activity-coming').innerHTML,/<h3>Class preparation<\/h3>/);
assert.doesNotMatch($('activity-coming').innerHTML,/<h3>Program management<\/h3>|<h3>User management<\/h3>|<h3>Calendar management<\/h3>/);
programRole='ADMIN';window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.match($('activity-coming').innerHTML,/<h3>Program management<\/h3>/);
assert.match($('activity-coming').innerHTML,/<h3>User management<\/h3>/);
assert.match($('activity-coming').innerHTML,/<h3>Calendar management<\/h3>/);
assert.doesNotMatch($('activity-menu').innerHTML,/\/programs\/library\.html|\/programs\/manage\.html|href="\/users\//);
programRole='STUDENT';
hasWorkshops=false;window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.doesNotMatch($('personal-pills').innerHTML,/href="#workshops"/);
location.hash='#workshops';handlers.get('hashchange')();
assert.equal($('workshop-pills').innerHTML,'');
assert.match($('workshops-message').textContent,/No workshops/);
hasWorkshops=true;globalAdmin=true;window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal($('academy-progress-nav').hidden,true);
assert.equal($('academy-recorder-nav').hidden,true);
assert.match($('personal-pills').innerHTML,/<span>Workshops<\/span><small>Global Admin<\/small>/);
assert.match($('personal-pills').innerHTML,/<span>Academy administration<\/span><small>Global Admin<\/small>/);
assert.match($('academy-preview-sessions').innerHTML,/Reboot|Course item/,'Home Coming up remains the published Academy schedule for Global Admin');
assert.equal(($('academy-preview-sessions').innerHTML.match(/<li class="upcoming-item /g)||[]).length,4);
assert.match($('academy-sessions').innerHTML,/Course item|Later Program item/,'Global Admin sees the whole Academy timetable');
assert.equal($('schedule-title').textContent,'Academy timetable');
assert.equal($('full-timetable-title').textContent,'Full Academy timetable');
location.hash='#overview';handlers.get('hashchange')();
assert.equal($('activity-switcher').hidden,true);
assert.equal($('activity-switcher').innerHTML,'');
location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
assert.match($('activity-coming').innerHTML,/Make announcement|Class preparation|Calendar management/);
assert.equal($('activity-timetable-title').textContent,'Academy timetable');
assert.match($('activity-sessions').innerHTML,/Course item|Later Program item/,'Program pages retain the complete Global Admin timetable');
assert.match($('activity-menu').innerHTML,/href="\/programs\/library\.html\?program=[^"]+">Library management<\/a>/);
assert.match($('activity-menu').innerHTML,/href="\/users\/">User management<\/a>/);
assert.match($('activity-menu').innerHTML,/href="\/programs\/manage\.html\?program=[^"]+">Program management<\/a>/);
assert.doesNotMatch($('activity-coming').innerHTML,/<h3>Library management<\/h3>|<h3>Program management<\/h3>|<h3>User management<\/h3>/);
globalAdmin=false;window.dispatchEvent(new Event('m4l-academy-session'));await flush();
// A personal response that finishes after sign-out cannot restore protected content.
deferNext=true;location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));release();await flush();
assert.equal($('personal-activities').hidden,true);
assert.equal($('academy-progress-nav').hidden,true);
assert.equal($('academy-recorder-nav').hidden,true);
assert.equal($('preview-timetable-link').hidden,true);
assert.doesNotMatch($('academy-preview-sessions').innerHTML, /<a |data-information/);
assert.equal($('lesson-information').open,false);
assert.doesNotMatch($('activity-sessions').innerHTML,/Join lesson/);
assert.equal($('activity-curriculum').innerHTML,'');
assert.equal($('recorder-card').innerHTML,'');
assert.equal($('activity-switcher').innerHTML,'');
assert.equal($('activity-switcher').hidden,true);
assert.equal(timers.size,0);
assert.equal($('workshop-pills').innerHTML,'');
location.hash='#workshops';handlers.get('hashchange')();
assert.match($('workshops-message').textContent,/Sign in/);
location.hash='#administration';handlers.get('hashchange')();assert.doesNotMatch($('administration').innerHTML,/href="\/users\//);
assert.doesNotMatch(html, /data-information="\d+"/);
console.log('Academy entrance UI: one upcoming item per activity per day, public timetable without links, independent full schedule, visitor/personal views, escaped labels, combined-lesson popup, contextual tools, student recorder and delayed-response sign-out passed.');
