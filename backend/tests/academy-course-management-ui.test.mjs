import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';

const source=name=>readFileSync(new URL('../../js/'+name,import.meta.url),'utf8');
const markup=readFileSync(new URL('../../academy/courses/manage/index.html',import.meta.url),'utf8');
async function screen(env,identity='0001',search='') {
  const login=await worker.fetch(new Request('http://localhost/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uniqueid:'login-'+identity,pin:'1234'})}),env);
  let token=(await login.json()).token;
  const elements=new Map(),events=new Map(),documentEvents=new Map(),requests=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',innerHTML:'',value:'',classList:{toggle(){},add(){},remove(){}},replaceChildren(){this.innerHTML='';},addEventListener(){},setAttribute(){},querySelectorAll:()=>[]});
    return elements.get(id);
  };
  const context={console,URLSearchParams,crypto,Date,Map,Set,alert:()=>assert.fail('Unexpected legacy login prompt'),location:{search},localStorage:{getItem:()=>token},
    document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(type,fn)=>documentEvents.set(type,[...(documentEvents.get(type)||[]),fn])},
    window:{M4L_CONFIG:{API_BASE:''},addEventListener:(type,fn)=>events.set(type,fn)},
    fetch:async(path,options)=>{requests.push(path);return worker.fetch(new Request('http://localhost'+path,options),env);}
  };
  vm.createContext(context);
  for(const name of ['m4l-academy-course-management.js','m4l-global-curriculum.js','m4l-global-course-scheduler.js'])vm.runInContext(source(name),context);
  await documentEvents.get('DOMContentLoaded')[0]();
  const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,2));};
  await settle();
  return {element,requests,context,events,settle,changeToken:value=>{token=value;events.get('storage')({key:'m4l_account_token'});}};
}

test('Course administration opens both existing D1 editors with the Academy Global Admin session',async()=>{
  const fixture=await courseFixture(),original=globalThis.fetch;let outbound=0;
  globalThis.fetch=async()=>{outbound++;throw Error('External request');};
  try {
    const page=await screen(fixture.env);
    assert.equal(page.element('global-curriculum-screen').hidden,false);
    assert.ok(page.element('course-account-name').textContent);
    assert.match(page.element('global-curriculum-content').innerHTML,/Global Subjects|Subjects/);
    assert.equal(page.requests.filter(p=>p.endsWith('/global/get')).length,1);
    await page.context.window.M4LGlobalCourseScheduler.show();
    assert.match(page.element('global-curriculum-content').innerHTML,/Recurring|Courses|Course/);
    assert.ok(page.requests.includes('/api/admin/platform/global/delivery/get'));
    assert.ok(page.requests.includes('/api/admin/platform/global/timetable/get'));
    const direct=await screen(fixture.env,'0001','?view=scheduling');
    assert.equal(direct.element('global-curriculum-title').textContent,'Course scheduling');
    assert.match(direct.element('global-curriculum-content').innerHTML,/Course/);
    const originalRequest=page.context.fetch;
    let release;
    page.context.fetch=async(...args)=>{await new Promise(resolve=>{release=resolve;});return originalRequest(...args);};
    const lateLoad=page.context.window.M4LGlobalCurriculum.load(true);
    page.changeToken('another-account');
    release();assert.equal(await lateLoad,false);
    assert.equal(page.element('global-curriculum-screen').hidden,true);
    assert.ok(!page.element('global-curriculum-content').innerHTML.includes('Synthetic subject'));
    await assert.rejects(vm.runInContext("apiPost('/api/admin/platform/global/get',{})",page.context),/Sign in/);
    assert.equal(outbound,0);
  }finally{globalThis.fetch=original;fixture.db.close();}
});

test('Students, Teachers and Program Admins cannot open the Course-wide editors',async()=>{
  const fixture=await courseFixture();
  try {for(const id of ['0002','0003','0004']) {
    const page=await screen(fixture.env,id);
    assert.equal(page.element('global-curriculum-screen').hidden,true);
    assert.match(page.element('course-access-message').textContent,/Global Admin/);
    assert.deepEqual(page.requests,['/api/account/session']);
  }}finally{fixture.db.close();}
});

test('an assigned Course Program Admin opens both editors with scoped authority and cannot create Courses',async()=>{
  const fixture=await courseFixture();
  try {
    fixture.db.exec("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('course-admin-ui','account-0004','COURSE:subject-1','PROGRAM_ADMIN',1,'CONFIRMED')");
    const page=await screen(fixture.env,'0004');
    assert.equal(page.element('global-curriculum-screen').hidden,false);
    assert.equal(vm.runInContext('state.user.role',page.context),'PROGRAM_ADMIN');
    assert.equal(vm.runInContext('state.user.platformrole',page.context),'');
    assert.ok(!page.element('global-curriculum-content').innerHTML.includes('data-gcm-action="add-subject-inline"'));
    await page.context.window.M4LGlobalCourseScheduler.show();
    assert.ok(page.requests.includes('/api/admin/platform/global/delivery/get'));
    assert.ok(page.requests.includes('/api/admin/platform/global/timetable/get'));
    assert.equal(page.element('global-curriculum-screen').hidden,false);
  }finally{fixture.db.close();}
});

test('Course destinations retain management and scheduling and omit the unbuilt private media editor',()=>{
  assert.match(markup,/data-gcm-tab="subjects"/);
  assert.match(markup,/data-gcm-course-action="show"/);
  assert.ok(!markup.includes('data-gcm-tab="resources"'));
  const entrance=source('m4l-academy-entrance.js');
  assert.match(entrance,/administrator && row.kind === 'COURSE'/);
  assert.match(entrance,/Course management/);
  assert.match(entrance,/Course scheduling/);
});
