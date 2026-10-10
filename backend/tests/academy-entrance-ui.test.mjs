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
elements.get('course-list-stage').value='ALL';elements.get('course-list-scope').value='MINE';
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
const requests = [], catalogueRequests = [];
let failCatalogue=false,deferCatalogue=false,releaseCatalogue;
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
  if (_url.endsWith('/api/academy/courses/catalogue')) {
    catalogueRequests.push(options.headers.Authorization);
    const snapshot={success:true,canViewAll:globalAdmin,courses:hasWorkshops?[
      {id:'COURSE-BARAKAH',runId:'run-a',name:'Barakah',stage:'ACTIVE',personal:true,canManage:globalAdmin,startDate:'2026-10-01',endDate:'2026-10-31',canOpenActivity:true,mediaMessage:'Course media becomes available after completion.'},
      {id:'COURSE-SALAAH',runId:'run-b',name:'Salaah',stage:'COMPLETE',personal:true,canManage:globalAdmin,startDate:'2026-09-01',endDate:'2026-09-30',canOpenActivity:false,mediaMessage:'Course media is not available yet.'},
      ...(globalAdmin?[{id:'COURSE-DRAFT',name:'Unpublished <draft>',stage:'DRAFT',personal:false,canManage:true,startDate:'',endDate:'',canOpenActivity:false,mediaMessage:'Course media becomes available after completion.'}]:[])
    ]:[]};
    if(deferCatalogue){deferCatalogue=false;await new Promise(resolve=>releaseCatalogue=resolve);}
    if(failCatalogue){failCatalogue=false;return {ok:false,status:503,json:async()=>({success:false,error:'Temporary Course list failure'})};}
    return {ok:true,status:200,json:async()=>snapshot};
  }
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
    {...base,title:'Later Program item',date:'2026-10-06',...(!signedIn?{startTime:'04:00',endTime:'06:00'}:{})},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',activityName:'Course item',title:'Course item',date:'2026-10-06',...(!signedIn?{startTime:'12:00',endTime:'13:00'}:{})},
    {...base,kind:'COURSE',activityId:'COURSE-TEST',title:'Later Course offering',date:'2026-10-07',...(!signedIn?{startTime:'07:30',endTime:'08:30'}:{})},
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
class FixtureDate extends RealDate { static now(){return RealDate.parse(fixtureNow);} constructor(...args) { super(...(args.length?args:[fixtureNow])); } }
vm.runInNewContext(script, { window, document, location, localStorage:{getItem:key=>storage.get(key)||null}, fetch, Event,
  Intl, Date:FixtureDate, setInterval() {}, setTimeout(fn,delay) { const id=++nextTimer;timers.set(id,{fn,delay});return id; }, clearTimeout(id) {timers.delete(id);}, matchMedia:()=>({matches:false}) });
await flush();
const countPills=id=>($(id).innerHTML.match(/<li class="preview-pill timetable-pill /g)||[]).length;
const clickInfo=(id,index)=>documentHandlers.get('click')({target:{closest:selector=>selector==='[data-information]'?{dataset:{information:`${id}:${index}`}}:null}});
const firstInfo=id=>/data-information="[^:]+:(\d+)"/.exec($(id).innerHTML)[1];
assert.equal($('personal-activities').hidden,true);
assert.equal(catalogueRequests.length,0,'Opening the homepage must not add a Course catalogue request');
assert.match($('academy-calendar-context').innerHTML,/Holiday &lt;script&gt;/);
assert.doesNotMatch($('academy-calendar-context').innerHTML,/<script>/);
assert.equal(($('academy-preview-sessions').innerHTML.match(/<li class="preview-pill"/g)||[]).length,4);
for(const time of ['04:00','12:00','07:30','13:00'])assert.ok($('academy-preview-sessions').innerHTML.includes(`aria-label="${time}"`));
assert.doesNotMatch($('academy-preview-sessions').innerHTML,/data-information|Join lesson|zoom\.test|Teacher A/);
assert.match($('academy-sessions').innerHTML,/preview-pill/,'The public full timetable also uses pills');
assert.doesNotMatch(html,/Each Program has its own colour/);
assert.ok(html.indexOf('id="login-preview"')<html.indexOf('class="intro-feature"'));
assert.ok(html.indexOf('id="activity-switcher"')<html.indexOf('class="container"'));
assert.ok(html.indexOf('id="workshops-sessions"')<html.indexOf('id="course-list-title"'));
location.hash='#workshops';handlers.get('hashchange')();
assert.match($('workshops-message').textContent,/Sign in/);
assert.equal(catalogueRequests.length,0);

storage.set('m4l_account_token','QA');window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal($('personal-activities').hidden,false);
assert.equal($('academy-progress-nav').hidden,false);
assert.match($('activity-switcher').innerHTML,/href="#workshops" aria-current="page"/);
assert.equal(catalogueRequests.length,1);
assert.match($('workshop-pills').innerHTML,/Barakah/);
assert.match($('workshop-pills').innerHTML,/Complete/);
assert.match($('workshop-pills').innerHTML,/Media · coming soon/);
assert.doesNotMatch($('workshop-pills').innerHTML,/Program Admin|Teacher|User|COURSE-DRAFT|<small>Student/);
assert.equal($('course-list-scope-wrap').hidden,true);
assert.equal($('workshop-management').hidden,false,'Assigned Course teachers have their staff tools inside Admin');
assert.equal($('workshop-tools').innerHTML,'');
assert.equal(countPills('workshops-sessions'),countPills('academy-sessions'));
$('course-list-stage').value='COMPLETE';$('course-list-stage').listeners.get('input')();
assert.match($('workshop-pills').innerHTML,/Salaah/);assert.doesNotMatch($('workshop-pills').innerHTML,/Barakah/);
$('course-list-stage').value='ALL';$('course-list-search').value='bar';$('course-list-search').listeners.get('input')();
assert.match($('workshop-pills').innerHTML,/Barakah/);assert.doesNotMatch($('workshop-pills').innerHTML,/Salaah/);
$('course-list-search').value='';$('course-list-search').listeners.get('input')();
location.hash='#overview';handlers.get('hashchange')();location.hash='#workshops';handlers.get('hashchange')();await flush();
assert.equal(catalogueRequests.length,1,'Reopening Courses shares the account-scoped one-minute catalogue cache');

location.hash='#activity/PROGRAM/'+activity.id;handlers.get('hashchange')();await flush();
assert.equal($('activity-title').textContent,'Reboot');
assert.equal($('activity-admin').innerHTML,'','Students have no Admin menu');
assert.doesNotMatch($('activity-menu').innerHTML,/Library|Explore|Attendance|Lesson prep/);
assert.match($('activity-menu').innerHTML,/Courses|Progress|Calendar|Announcements/);
assert.equal(countPills('activity-sessions'),4);
assert.match($('activity-sessions').innerHTML,/Course Barakah|Course Salaah|Tomorrow Program lesson/);
assert.doesNotMatch($('activity-sessions').innerHTML,/Teacher A|zoom\.test/,'Compact pills keep full details in their accessible detail view');
clickInfo('activity-sessions',firstInfo('activity-sessions'));
assert.equal($('lesson-information').open,true);
assert.match($('lesson-information-body').innerHTML,/Teacher A.*Teacher B/);
assert.match($('lesson-information-body').innerHTML,/Joining opens 5 minutes/);
$('lesson-information-close').listeners.get('click')();
$('personal-next').listeners.get('click')();assert.equal($('activity-sessions').lastScroll.left,400);
$('personal-previous').listeners.get('click')();assert.equal($('activity-sessions').lastScroll.left,-400);
const programCount=countPills('activity-sessions');
location.hash='#activity/COURSE/COURSE-SALAAH';handlers.get('hashchange')();await flush();
assert.equal(countPills('activity-sessions'),programCount,'Every Program and Course page retains the complete Academy timetable');
assert.equal($('activity-curriculum-section').hidden,true);
fixtureNow='2026-10-05T10:55:00Z';
let timer=[...timers.values()][0];timers.clear();timer.fn();await flush();
assert.match($('activity-sessions').innerHTML,/join-open/);assert.match($('activity-sessions').innerHTML,/Join lesson/);
fixtureNow='2026-10-05T11:00:00Z';documentHandlers.get('visibilitychange')();await flush();
assert.match($('activity-sessions').innerHTML,/In progress/);
fixtureNow='2026-10-05T12:00:00Z';timer=[...timers.values()][0];timers.clear();timer.fn();await flush();
assert.doesNotMatch($('activity-sessions').innerHTML,/https:\/\/zoom.test\/lesson/);

fixtureNow='2026-10-05T10:00:00Z';hasWorkshops=false;programRole='TEACHER';location.hash='#activity/PROGRAM/'+activity.id;
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.match($('activity-admin').innerHTML,/<summary>Admin/);
assert.match($('activity-admin').innerHTML,/>Attendance<|>Lesson prep</);
assert.equal($('activity-menu').innerHTML,'');
assert.doesNotMatch($('activity-menu').innerHTML,/programs\/manage|programs\/library|href="\/users/);
assert.equal($('activity-curriculum-section').hidden,false);
assert.match($('personal-pills').innerHTML,/<span>Courses<\/span><small>None<\/small>/,'Course history remains reachable without an active Course role');
location.hash='#workshops';handlers.get('hashchange')();await flush();assert.equal($('workshop-pills').innerHTML,'');
assert.match($('course-list-message').textContent,/No Courses/);

hasWorkshops=true;globalAdmin=true;location.hash='#activity/PROGRAM/'+activity.id;
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.match($('activity-admin').innerHTML,/<summary>Admin/);
for(const label of ['Program','Users','Courses','Timetable','Library'])assert.ok($('activity-admin').innerHTML.includes(`>${label}</a>`));
assert.doesNotMatch($('activity-menu').innerHTML,/management|Timetable builder|Explore the Public Library/);
location.hash='#workshops';handlers.get('hashchange')();await flush();
assert.equal($('course-list-scope-wrap').hidden,false);assert.equal($('course-list-scope').value,'ALL');
assert.equal($('course-list-title').textContent,'All Courses');
assert.match($('workshop-pills').innerHTML,/Unpublished &lt;draft&gt;/);assert.doesNotMatch($('workshop-pills').innerHTML,/<draft>/);
$('course-list-scope').value='MINE';$('course-list-scope').listeners.get('input')();assert.doesNotMatch($('workshop-pills').innerHTML,/Unpublished/);
assert.equal(countPills('workshops-sessions'),countPills('academy-sessions'));
assert.match($('workshop-management').innerHTML,/>Courses<\/a>|>Users<\/a>|>Library<\/a>/);

roomFixture=true;fixtureNow='2026-10-05T10:55:00Z';globalAdmin=false;programRole='STUDENT';location.hash='#activity/PROGRAM/'+activity.id;
window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal(countPills('activity-sessions'),9,'Personal lessons stay separate when their room is shared');
assert.equal(($('activity-sessions').innerHTML.match(/class="upcoming-day"/g)||[]).length,7);
assert.match($('activity-sessions').innerHTML,/aria-label="23:30"/,'Overnight lessons use the Academy timezone');
assert.equal(($('activity-sessions').innerHTML.match(/>Join lesson<\/a>/g)||[]).length,2);
clickInfo('activity-sessions',firstInfo('activity-sessions'));assert.match($('lesson-information-body').innerHTML,/Class one|13:00–14:00/);
globalAdmin=true;window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal(countPills('activity-sessions'),6,'Global Admin groups rooms per day; missing rooms remain separate');
assert.match($('activity-sessions').innerHTML,/>4 lessons<\/small>/);
clickInfo('activity-sessions',firstInfo('activity-sessions'));
assert.equal(($('lesson-information-body').innerHTML.match(/class="combined-lesson"/g)||[]).length,4);
for(const detail of ['Class two','Teacher &lt;two&gt;','Fiqh module','Barakah','14:00–15:00'])assert.ok($('lesson-information-body').innerHTML.includes(detail));
globalAdmin=false;programRole='PROGRAM_ADMIN';window.dispatchEvent(new Event('m4l-academy-session'));await flush();
assert.equal(countPills('activity-sessions'),7,'Program Admin only groups their own Program');
assert.match($('activity-sessions').innerHTML,/>3 lessons<\/small>/);
assert.doesNotMatch($('activity-admin').innerHTML,/href="\/users/);
assert.doesNotMatch($('activity-sessions').innerHTML,/style=|hsl\(|linear-gradient/);
assert.match(css,/\.timetable-pill\.join-open\{background:var\(--rose-dark\)/);

roomFixture=false;programRole='STUDENT';cacheFixture=true;fixtureNow='2026-10-05T10:54:30Z';
window.dispatchEvent(new Event('m4l-academy-session'));await flush();let count=requests.length;
$('activity-sessions').scrollLeft=240;location.hash='#activity/COURSE/COURSE-BARAKAH';handlers.get('hashchange')();await flush();
assert.equal(requests.length,count);assert.equal($('activity-sessions').scrollLeft,240);
location.hash='#activity/PROGRAM/'+activity.id;handlers.get('hashchange')();await flush();assert.equal(requests.length,count);
fixtureNow='2026-10-05T10:55:00Z';handlers.get('hashchange')();await flush();assert.equal(requests.length,++count);
assert.match($('activity-sessions').innerHTML,/Join lesson/);
$('personal-refresh').listeners.get('click')();await flush();assert.equal(requests.length,++count);
fixtureNow='2026-10-05T10:56:01Z';handlers.get('hashchange')();await flush();assert.equal(requests.length,++count);
deferNext=true;fixtureNow='2026-10-05T10:57:02Z';handlers.get('hashchange')();await flush();count=requests.length;
handlers.get('hashchange')();handlers.get('hashchange')();await flush();assert.equal(requests.length,count);release();await flush();
failNext=true;$('personal-refresh').listeners.get('click')();await flush();assert.equal($('activity-sessions').innerHTML,'');
assert.match($('activity-status').textContent,/Temporary timetable failure/);
handlers.get('hashchange')();await flush();assert.ok(countPills('activity-sessions'));
location.hash='#workshops';handlers.get('hashchange')();await flush();
fixtureNow='2026-10-05T10:58:03Z';failCatalogue=true;handlers.get('hashchange')();await flush();
assert.equal($('workshop-pills').innerHTML,'');assert.equal($('course-list-retry').hidden,false);
$('course-list-retry').listeners.get('click')();await flush();assert.match($('workshop-pills').innerHTML,/Barakah/);
fixtureNow='2026-10-05T10:59:04Z';deferCatalogue=true;handlers.get('hashchange')();await flush();
storage.clear();window.dispatchEvent(new Event('m4l-academy-session'));releaseCatalogue();await flush();
assert.equal($('workshop-pills').innerHTML,'','A late Course response cannot restore the previous account');
assert.equal($('activity-admin').innerHTML,'');assert.equal($('workshop-management').hidden,true);
assert.doesNotMatch($('workshops-sessions').innerHTML,/Join lesson|data-information/);
assert.equal($('lesson-information').open,false);assert.equal(timers.size,0);
console.log('Academy headers, scoped Admin actions, shared compact timetables, Course history, cache, timed joining and sign-out checks passed.');
