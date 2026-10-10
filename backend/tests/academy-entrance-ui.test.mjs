import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../../academy/index.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../../js/m4l-academy-entrance.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../../css/m4l-academy-entrance.css', import.meta.url), 'utf8');
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
let deferNext=false, release, hasWorkshops=true, globalAdmin=false, programRole='STUDENT', roomFixture=false, colourFixture=false, cacheFixture=false, failNext=false, warningFixture=false;
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
  result.calendarEvents=[{description:'Holiday <script>',startDate:'2026-10-07',endDate:'2026-10-07',teachingImpact:'NO_TEACHING'}];
  result.personalTimetable=signedIn ? (globalAdmin ? result.timetable.filter(event=>event.status!=='CANCELLED').map(stamp) : body.id ? [
    ...row.timetable.map(stamp),
    ...row.timetable.map(event=>stamp({...event,date:'2026-10-06',title:'Tomorrow Program lesson'})),
    ...workshops.filter(item=>item.roles.length).flatMap(item=>item.timetable.map(event=>stamp({...event,title:`Course ${item.name}`,startTime:'14:30',endTime:'15:30'})))
  ] : result.timetable.filter(event=>event.status!=='CANCELLED').map(stamp)) : [];
  if (body.id) result.personalTimetable=result.personalTimetable.filter(event=>event.status==='SCHEDULED');
  if (roomFixture && signedIn) {
    const roomLesson={...row.timetable[0],subjectName:'Quran',meetingGroup:'room-a',information:['Class one','Teacher A'],joinUrl:'https://zoom.test/shared'};
    result.personalTimetable=[
      roomLesson,
      {...roomLesson,information:['Class two','Teacher <two>']},
      {...roomLesson,subjectName:'Fiqh',title:'Fiqh module',startTime:'14:00',endTime:'15:00',involvement:'teacher',information:['Fiqh module','Class three','Teacher B']},
      {...roomLesson,kind:'COURSE',activityId:'COURSE-BARAKAH',activityName:'Barakah',subjectName:'Barakah',startTime:'15:00',endTime:'16:00',information:['Course module','Teacher C']},
      {...roomLesson,meetingGroup:'room-b',information:['Different room'],joinUrl:''},
      {...roomLesson,meetingGroup:'',startTime:'16:00',endTime:'17:00',information:['No room one'],joinUrl:''},
      {...roomLesson,meetingGroup:'',startTime:'16:00',endTime:'17:00',information:['No room two'],joinUrl:''},
      {...roomLesson,date:'2026-10-06',information:['Next day lesson']}
    ].map(stamp);
    result.personalTimetable.push({...stamp(roomLesson),meetingGroup:'overnight',information:['Overnight class'],joinUrl:'',
      startsAt:Date.parse('2026-10-06T00:30:00+03:00'),endsAt:Date.parse('2026-10-06T01:30:00+03:00'),joinAvailableAt:Date.parse('2026-10-06T00:25:00+03:00')});
  }
  if (colourFixture) {
    const alimiya={id:'PRG-ALIMIYA',kind:'PROGRAM',name:'Alimiyah',roles:['TEACHER']};
    const hifz={id:'PRG-HIFZ',kind:'PROGRAM',name:'Hifz',roles:['STUDENT']};
    result.activities.push(alimiya,hifz);
    result.personalActivities.push(alimiya,hifz);
    result.personalTimetable=[
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'student',date:'2026-10-06',subjectName:'Assembly'},
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'teacher',date:'2026-10-07',meetingGroup:'alimiya-room'},
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'teacher',date:'2026-10-07',meetingGroup:'alimiya-room',startTime:'14:00',endTime:'15:00'},
      {...base,activityId:alimiya.id,activityName:alimiya.name,involvement:'teacher',date:'2026-10-08'},
      {...base,activityId:hifz.id,activityName:hifz.name,involvement:'student'},
      ...workshops.flatMap(course=>course.timetable),base
    ].map(stamp).sort((a,b)=>a.startsAt-b.startsAt);
    result.timetable=result.personalTimetable.map(event=>{const publicEvent={...event,involvement:''};delete publicEvent.information;delete publicEvent.joinUrl;return publicEvent;});
    // Registry order must not affect colours when navigating or refreshing.
    if (body.id) result.activities.reverse();
  }
  if (cacheFixture) {
    result.timezone='Africa/Johannesburg';
    result.activityPages=signedIn?activities.filter(item=>item.roles.length).map(({timetable,...page})=>page):[];
    result.personalTimetable=signedIn?[...row.timetable,...workshops.flatMap(course=>course.timetable.map(event=>({...event,startTime:'14:30',endTime:'15:30'})))].map(stamp):[];
    if (warningFixture) result.warnings=['Timetable service temporarily incomplete.'];
  }

  if (deferNext) { deferNext=false; await new Promise(resolve=>{release=resolve;}); }
  if (failNext) { failNext=false; return {ok:false,status:503,json:async()=>({success:false,error:'Temporary timetable failure'})}; }
  return {ok:true,status:200,json:async()=>result};
};
const RealDate = Date;
class FixtureDate extends RealDate { constructor(...args) { super(...(args.length?args:[fixtureNow])); } }
vm.runInNewContext(script, { window, document, location, localStorage:{getItem:key=>storage.get(key)||null}, fetch, Event,
  Intl, Date:FixtureDate, setInterval() {}, setTimeout(fn,delay) { const id=++nextTimer;timers.set(id,{fn,delay});return id; }, clearTimeout(id) {timers.delete(id);}, matchMedia:()=>({matches:false}) });
await flush();
assert.equal($('academy-calendar-context').hidden,false);
assert.match($('academy-calendar-context').innerHTML,/Holiday &lt;script&gt;/);
assert.match($('academy-calendar-context').innerHTML,/No teaching/);
assert.doesNotMatch($('academy-calendar-context').innerHTML,/<script>/);
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
assert.doesNotMatch($('academy-sessions').innerHTML,/Africa\/Johannesburg/);
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
assert.match($('academy-sessions').innerHTML,/class="upcoming-item [^"]*student lesson-card/);
assert.equal($('preview-timetable-link').hidden,false);
assert.match($('academy-preview-sessions').innerHTML,/href="#activity\/PROGRAM\/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a"/);
assert.doesNotMatch($('academy-sessions').innerHTML,/Join lesson/);
assert.match($('academy-preview-sessions').innerHTML,/Teacher A.*Teacher B/,'Personal lesson details appear directly on the card');
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/data-information/,'Individual lessons do not hide details in a popup');
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
assert.match($('activity-sessions').innerHTML,/class="upcoming-days timetable-days"/);
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
assert.equal(($('academy-preview-sessions').innerHTML.match(/<li class="upcoming-item /g)||[]).length,6,'Signed-in Home retains the complete personal timeline, including earlier lessons');
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
roomFixture=true;globalAdmin=false;hasWorkshops=true;programRole='STUDENT';fixtureNow='2026-10-05T10:55:00Z';
storage.set('m4l_account_token','ROOM-TEST');location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
const roomHtml=$('activity-sessions').innerHTML;
assert.equal((roomHtml.match(/class="upcoming-day"/g)||[]).length,7,'Show seven consecutive dates, including empty days');
assert.equal((roomHtml.match(/<li class="upcoming-item /g)||[]).length,9,'Students and teachers keep one card per personally involved lesson even when rooms are shared');
assert.equal((roomHtml.match(/lesson-card/g)||[]).length,9);
assert.doesNotMatch(roomHtml,/data-information|4 lessons|Reboot · Barakah/);
assert.doesNotMatch(roomHtml,/Africa\/Johannesburg|Times in|timetable-timezone/,'Timezone labels are absent from the website');
for(const detail of ['Class one','Class two','Teacher &lt;two&gt;','Fiqh module','Class three','Course module','Barakah','13:00–14:00','14:00–15:00','15:00–16:00']) assert.ok(roomHtml.includes(detail),detail);
assert.match(roomHtml,/next-lesson student lesson-card join-open/);
assert.match(roomHtml,/teacher lesson-card/,'Teaching involvement remains visible on its individual lesson');
assert.match(roomHtml,/23:30–00:30 \(\+1 day\)/,'Published instants display in the Academy timezone, including overnight ends');
assert.equal((roomHtml.match(/>Join lesson<\/a>/g)||[]).length,2,'Each eligible individual lesson gets its own current join link');
fixtureNow='2026-10-05T12:01:00Z';handlers.get('hashchange')();await flush();
assert.equal(($('activity-sessions').innerHTML.match(/>Join lesson<\/a>/g)||[]).length,1,'The room stays joinable for a later authorised lesson after the first lesson ends');
fixtureNow='2026-10-05T14:00:00Z';handlers.get('hashchange')();await flush();
assert.doesNotMatch($('activity-sessions').innerHTML,/>Join lesson<\/a>/,'No room joins outside all authorised lesson windows');
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
location.hash='#timetable';handlers.get('hashchange')();await flush();
const fullRooms=$('academy-sessions').innerHTML;
assert.equal((fullRooms.match(/<li class="upcoming-item /g)||[]).length,9,'The full timetable keeps the same complete set of individual lessons');
assert.doesNotMatch(fullRooms,/Africa\/Johannesburg|Times in|timetable-timezone/);
assert.doesNotMatch($('schedule-range').textContent,/timezone/i);
globalAdmin=true;fixtureNow='2026-10-05T10:55:00Z';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
const adminRooms=$('academy-sessions').innerHTML;
assert.equal((adminRooms.match(/<li class="upcoming-item /g)||[]).length,6,'Global Admin rolls up the entire Academy by room and day; missing rooms stay separate');
assert.match(adminRooms,/>4 lessons<\/small>/);
assert.equal((adminRooms.match(/>Join lesson<\/a>/g)||[]).length,1);
const roomInfo=/data-information="academy-sessions:(\d+)"/.exec(adminRooms)[1];
documentHandlers.get('click')({target:{closest:selector=>selector==='[data-information]'?{dataset:{information:`academy-sessions:${roomInfo}`}}:null}});
assert.equal($('lesson-information-title').textContent,'Reboot · Barakah');
assert.equal(($('lesson-information-body').innerHTML.match(/class="combined-lesson"/g)||[]).length,4);
for(const detail of ['Class one','Class two','Teacher &lt;two&gt;','Fiqh module','Class three','Course module','Barakah','13:00–14:00','14:00–15:00','15:00–16:00']) assert.ok($('lesson-information-body').innerHTML.includes(detail),detail);
globalAdmin=false;programRole='PROGRAM_ADMIN';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
const programAdminRooms=$('academy-sessions').innerHTML;
assert.equal((programAdminRooms.match(/<li class="upcoming-item /g)||[]).length,7,'Program Admin groups their Program while retaining direct Course participation as an individual card');
assert.match(programAdminRooms,/>3 lessons<\/small>/);
assert.equal((programAdminRooms.match(/lesson-card/g)||[]).length,1);
programRole='STUDENT';
roomFixture=false;colourFixture=true;fixtureNow='2026-10-05T10:55:00Z';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
const cards = markup => [...markup.matchAll(/<li class="upcoming-item ([^"]*)">(.*?)<\/li>/g)]
  .map(([,classes,body])=>({classes,body}));
const shadeCards=cards($('academy-sessions').innerHTML);
assert.equal(shadeCards.length,8);
const alimiyaCards=shadeCards.filter(card=>card.body.includes('>Alimiyah</a>'));
assert.equal(alimiyaCards.length,4,'Teacher lessons sharing a room remain individual');
assert.equal(alimiyaCards.filter(card=>card.classes.includes('teacher')).length,3);
const courseCards=shadeCards.filter(card=>/>(?:Barakah|Salaah)<\/a>/.test(card.body));
assert.equal(courseCards.length,2);
for(const card of shadeCards) for(const slot of ['upcoming-status','lesson-activity','lesson-title','lesson-details','upcoming-time','upcoming-actions'])
  assert.ok(card.body.includes(slot),`Individual cards include ${slot}`);
assert.equal(cards($('academy-preview-sessions').innerHTML).length,8,'Home shows the complete integrated personal timetable');
location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
const detailedShades=cards($('activity-sessions').innerHTML);
assert.equal(detailedShades.length,8,'Selecting a Program must not hide the other Programs or Courses');
assert.doesNotMatch($('activity-sessions').innerHTML,/style=|hsl\(|linear-gradient/,'No Program-specific colours are generated');
assert.ok(detailedShades.some(card=>card.classes.includes('next-lesson')&&card.body.includes('Join lesson')));
assert.ok(detailedShades.filter(card=>card.body.includes('Join lesson')).every(card=>card.classes.includes('join-open')),'Every active link gets the dark-card state');
assert.match(css,/\.upcoming-item\.join-open\{background:var\(--rose-dark\)/);
assert.match(css,/\.timetable-days \.upcoming-item\.lesson-card\{block-size:auto;min-block-size:220px/,'Individual cards grow to show their full details');
assert.match(css,/\.upcoming-item\.teacher,\.upcoming-item\.mixed\{border:3px solid var\(--rose-dark\)\}/,'Teacher and mixed-participation cards have a thick border on all four sides');
assert.doesNotMatch(css,/\.upcoming-item\.(?:teacher|student|mixed)\{[^}]*background/,'All roles share the same base colour');
assert.doesNotMatch(html,/Student participation|key-dot teacher/,'The full timetable key no longer describes role-based background colours');
colourFixture=false;cacheFixture=true;fixtureNow='2026-10-05T10:54:30Z';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
let count=requests.length;
$('activity-sessions').scrollLeft=240;
location.hash='#activity/COURSE/COURSE-BARAKAH';handlers.get('hashchange')();await flush();
assert.equal($('activity-title').textContent,'Barakah');
assert.equal(requests.length,count,'Switching to an authorised Course reuses the shared page/timetable snapshot');
assert.equal($('activity-sessions').scrollLeft,240,'Navigation retains the browsed dates');
location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
assert.equal(requests.length,count,'Returning to a Program does not fetch it again');
handlers.get('pageshow')({persisted:false});await flush();
assert.equal(requests.length,count,'Initial pageshow does not duplicate the initial home request');
fixtureNow='2026-10-05T10:55:00Z';
handlers.get('hashchange')();await flush();
assert.equal(requests.length,++count,'The five-minute join boundary invalidates even a snapshot younger than one minute');
assert.match($('activity-sessions').innerHTML,/Join lesson/);
location.hash='#activity/COURSE/COURSE-SALAAH';handlers.get('hashchange')();await flush();
assert.equal(requests.length,count,'A server-checked open lesson remains available while switching Programs/Courses');
$('personal-refresh').listeners.get('click')();await flush();
assert.equal(requests.length,++count,'Manual refresh always rechecks the server');
assert.equal($('personal-refresh').disabled,false);
fixtureNow='2026-10-05T10:56:01Z';handlers.get('hashchange')();await flush();
assert.equal(requests.length,++count,'The shared snapshot expires after one minute');
fixtureNow='2026-10-05T11:59:40Z';$('personal-refresh').listeners.get('click')();await flush();count=requests.length;
fixtureNow='2026-10-05T12:00:00Z';handlers.get('hashchange')();await flush();
assert.equal(requests.length,++count,'The lesson end invalidates a still-fresh snapshot');
assert.doesNotMatch($('activity-sessions').innerHTML,/https:\/\/zoom.test\/lesson/,'Ended joins cannot be revived from cache');
deferNext=true;$('personal-refresh').listeners.get('click')();await flush();count=requests.length;
handlers.get('hashchange')();handlers.get('hashchange')();await flush();
// Fresh navigation can use the existing snapshot while a manual refresh is pending.
assert.equal(requests.length,count);
release();await flush();
fixtureNow='2026-10-05T12:02:00Z';deferNext=true;handlers.get('hashchange')();await flush();count=requests.length;
handlers.get('hashchange')();handlers.get('hashchange')();await flush();
assert.equal(requests.length,count,'Concurrent identical stale-page requests share one fetch');
release();await flush();
failNext=true;$('personal-refresh').listeners.get('click')();await flush();count=requests.length;
assert.match($('activity-status').textContent,/Temporary timetable failure/);
assert.equal($('activity-sessions').innerHTML,'','A refresh failure removes the protected view rather than restoring a stale snapshot');
handlers.get('hashchange')();await flush();
assert.equal(requests.length,count+1,'A failure is not cached');
warningFixture=true;$('personal-refresh').listeners.get('click')();await flush();count=requests.length;
handlers.get('hashchange')();await flush();
assert.equal(requests.length,count+1,'Partial responses with warnings are not cached');
warningFixture=false;window.dispatchEvent(new Event('m4l-academy-session'));await flush();count=requests.length;
handlers.get('pageshow')({persisted:true});await flush();
assert.equal(requests.length,count+1,'Restoring a page from browser history rechecks the account');
storage.set('m4l_account_token','DIFFERENT-ACCOUNT');window.dispatchEvent(new Event('m4l-academy-session'));await flush();count=requests.length;
location.hash='#activity/COURSE/COURSE-BARAKAH';handlers.get('hashchange')();await flush();
assert.equal(requests.length,count,'The new account can use only its own newly loaded cache');
location.hash='#overview';fixtureNow='2026-10-05T10:54:30Z';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/Join lesson/);
fixtureNow='2026-10-05T10:55:00Z';
$('academy-preview-sessions').scrollLeft=165;
const homeGate=[...timers.values()][0];timers.clear();homeGate.fn();await flush();
assert.equal($('academy-preview-sessions').scrollLeft,165,'Timed refresh preserves the browsed date');
assert.match($('academy-preview-sessions').innerHTML,/lesson-card join-open/,'Home also darkens the card at the five-minute boundary');
assert.match($('academy-preview-sessions').innerHTML,/Join lesson/);
failNext=true;fixtureNow='2026-10-05T10:55:30Z';
const homeFailure=[...timers.values()][0];timers.clear();homeFailure.fn();await flush();
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/Join lesson|Teacher A/,'A failed Home refresh clears its protected timeline');
assert.equal($('entrance-retry').hidden,false);
$('entrance-retry').listeners.get('click')();await flush();
assert.match($('academy-preview-sessions').innerHTML,/Join lesson/,'Retry recovers the Home timetable');
location.hash='#timetable';handlers.get('hashchange')();await flush();
fixtureNow='2026-10-05T12:00:00Z';
const scheduleEnd=[...timers.values()][0];timers.clear();scheduleEnd.fn();await flush();
assert.doesNotMatch($('academy-sessions').innerHTML,/https:\/\/zoom.test\/lesson/,'Full timetable removes ended joins without navigation');
location.hash='#activity/PROGRAM/PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';handlers.get('hashchange')();await flush();
fixtureNow='2026-10-05T12:04:00Z';deferNext=true;handlers.get('hashchange')();await flush();
storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));release();await flush();
assert.equal($('activity-sessions').innerHTML,'');
assert.equal($('personal-refresh').hidden,true);
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/data-information|Join lesson|<a /,'Sign-out clears cached protected content and late responses cannot restore it');
console.log('Academy entrance UI: complete personal lessons, scoped administrator rollups, one colour, joining transitions on every timetable, bounded account cache and failure/session invalidation passed.');
