import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
const source=readFileSync(new URL('../../js/m4l-academy-course-management.js',import.meta.url),'utf8');
const markup=readFileSync(new URL('../../academy/courses/manage/index.html',import.meta.url),'utf8');
async function fixture(){const f=await courseFixture();f.env.ACADEMY_LIBRARY_MODE='PUBLIC_ONLY';for(const m of ['0007_course_subscriptions.sql','0008_course_management.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+m,import.meta.url),'utf8'));return f;}
async function screen(env,identity='0001',search='') {
 const login=await worker.fetch(new Request('http://localhost/api/account/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uniqueid:'login-'+identity,pin:'1234'})}),env);let token=(await login.json()).token;
 const elements=new Map(),events=new Map(),documentEvents=new Map(),requests=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',innerHTML:'',value:'',disabled:false,classList:{toggle(){},add(){},remove(){}},replaceChildren(){this.innerHTML='';},close(){},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},setAttribute(){}});return elements.get(id);};
 const context={console,URLSearchParams,crypto,Date,Map,Set,WeakMap,location:{search,origin:'http://localhost'},localStorage:{getItem:()=>token},document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(type,fn)=>documentEvents.set(type,[...(documentEvents.get(type)||[]),fn])},window:{M4L_CONFIG:{API_BASE:''},addEventListener:(type,fn)=>events.set(type,fn)},fetch:async(path,options)=>{requests.push(path);return worker.fetch(new Request('http://localhost'+path,options),env);}};
 vm.createContext(context);vm.runInContext(source,context);await documentEvents.get('DOMContentLoaded')[0]();
 const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,2));};await settle();
 return {element,requests,context,events,settle,enter:(field,value)=>documentEvents.get('input')[0]({target:{dataset:{field},value,type:'text'}}),changeToken:value=>{token=value;events.get('storage')({key:'m4l_account_token'});}};
}

test('Course workspace opens a compact editor, saves name-only drafts and presents publication validation',async()=>{
 const f=await fixture(),original=globalThis.fetch;let outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('External request');};
 try{
  const page=await screen(f.env);assert.equal(page.element('course-workspace').hidden,false);assert.ok(page.element('course-account-name').textContent);assert.match(page.element('course-list').innerHTML,/Synthetic/);assert.match(page.element('course-editor').innerHTML,/Participants/);assert.equal(page.requests.filter(p=>p.endsWith('/courses/list')).length,1);
  page.context.window.M4LCourses.newCourse();page.enter('name','A new workshop');await page.context.window.M4LCourses.save();assert.equal(page.context.window.M4LCourses.hasUnsavedChanges(),false);assert.match(page.element('course-editor').innerHTML,/A new workshop/);
  await page.context.window.M4LCourses.validate();assert.match(page.element('course-editor').innerHTML,/A few details need attention/);assert.match(page.element('course-editor').innerHTML,/Choose Free or Paid/);assert.ok(!page.element('course-editor').innerHTML.includes('data-cm-action="publish"'));
  const originalRequest=page.context.fetch;let release;page.context.fetch=async(...args)=>{await new Promise(resolve=>{release=resolve;});return originalRequest(...args);};
  const late=page.context.window.M4LCourses.select('subject-1','run-1');page.changeToken('another-account');release();await assert.rejects(late,/account changed/);assert.equal(page.element('course-workspace').hidden,true);assert.equal(page.element('course-editor').innerHTML,'');assert.equal(page.element('course-list').innerHTML,'');assert.equal(outbound,0);
 }finally{globalThis.fetch=original;f.db.close();}
});

test('students, teachers and unrelated Program Admins cannot load Course management records',async()=>{
 const f=await fixture();try{for(const id of ['0002','0003','0004']){const page=await screen(f.env,id);assert.equal(page.element('course-workspace').hidden,true);assert.match(page.element('course-access-message').textContent,/Global Admin/);assert.deepEqual(page.requests,['/api/account/session']);}}finally{f.db.close();}
});

test('assigned Course Admins get their Course editor and no create action; scheduling links open Sessions',async()=>{
 const f=await fixture();try{f.db.exec("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES('course-admin-ui','account-0004','COURSE:subject-1','PROGRAM_ADMIN',1,'CONFIRMED')");const page=await screen(f.env,'0004','?view=scheduling');assert.equal(page.element('course-workspace').hidden,false);assert.equal(page.element('course-new').hidden,true);assert.match(page.element('course-editor').innerHTML,/cm-sessions/);assert.ok(!page.element('course-editor').innerHTML.includes('GlobalSubject'));}finally{f.db.close();}
});

test('new Course page uses delivery terminology and an honest private-media placeholder',()=>{
 assert.ok(!markup.includes('m4l-global-curriculum.js'));assert.ok(!markup.includes('m4l-global-course-scheduler.js'));assert.match(markup,/course-status-filter/);assert.match(markup,/CANCELLED/);assert.match(source,/Private Academy media storage is still to be connected/);assert.match(source,/Categorisation|categorisation/);assert.ok(!source.includes('data-gcm-tab="tasks"'));
});
