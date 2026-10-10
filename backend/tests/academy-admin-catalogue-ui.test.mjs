import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
const f=await courseFixture();
for(const name of ['0007_course_subscriptions.sql','0008_course_management.sql','0009_course_review_and_teachers.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8'));
f.db.exec("INSERT INTO subject_catalog VALUES('ACADEMY:subject-1','ACADEMY','subject-1','Synthetic shared subject',1); UPDATE program_subjects SET subject_key='ACADEMY:subject-1'");
f.db.exec(readFileSync(new URL('../migrations/academy/0010_shared_module_catalogue.sql',import.meta.url),'utf8'));
async function post(path,input={},token=''){
 const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),f.env);return {ok:response.ok,status:response.status,json:()=>response.json()};
}
const signed=await (await post('/api/account/login',{uniqueid:'login-0001',pin:'1234'})).json(),storage=new Map(),local=new Map([['m4l_account_token',signed.token]]),requests=[],handlers={};let loseNext=false;
const settle=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setTimeout(r,2));};
function harness(markup){const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),elements=new Map();
 const element=id=>{assert.ok(ids.has(id),'Missing element '+id);if(!elements.has(id)){const classes=new Set();elements.set(id,{hidden:false,disabled:false,value:'',innerHTML:'',textContent:'',open:false,focus(){},showModal(){this.open=true;},close(){this.open=false;},classList:{toggle:(n,on)=>on?classes.add(n):classes.delete(n),contains:n=>classes.has(n)},setAttribute(){},querySelector(){return null;},parentElement:{classList:{toggle(){}}}});}return elements.get(id);};
 const context={URLSearchParams,crypto,structuredClone,console,location:{host:'test.invalid',search:'',origin:'https://test.invalid'},localStorage:{getItem:k=>local.get(k)},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:element},window:{M4L_CONFIG:{API_BASE:''},addEventListener:(name,fn)=>{handlers[name]=fn;}},setTimeout,
 fetch:async(path,options)=>{const body=JSON.parse(options.body);requests.push({path,body});const result=await post(path,body,options.headers.Authorization.slice(7));if(loseNext&&path.endsWith('/module/save')&&result.ok){loseNext=false;throw Error('Lost acknowledgement');}return result;}};
 return {element,context};
}
try{
 const source=readFileSync(new URL('../../js/m4l-learning-catalogue.js',import.meta.url),'utf8'),markup=readFileSync(new URL('../../academy/subjects/index.html',import.meta.url),'utf8');
 const {element,context}=harness(markup),click=async id=>{element(id).onclick();await settle();},row=async d=>{element('lc-rows').onclick({target:{closest:()=>({dataset:d})}});await settle();},field=(name,value)=>element('lc-rows').oninput({target:{dataset:{field:name},value}});
 vm.runInNewContext(source,context);await settle();assert.equal(element('lc-workspace').hidden,false);assert.match(element('lc-rows').innerHTML,/Synthetic shared subject/);
 await click('lc-add');field('name','New shared subject');await row({save:''});assert.equal(f.db.prepare("SELECT count(*) n FROM subject_catalog WHERE source_namespace='ACADEMY' AND name='New shared subject'").get().n,1);
 await row({edit:'0'});field('name','My subject rename');
 const latest=await (await post('/api/admin/platform/learning-catalogue/get',{},signed.token)).json(),subject=latest.subjects[0];
 assert.equal((await post('/api/admin/platform/academy-subjects/save',{mode:'rename',subjectId:subject.SubjectID,subjectName:'Other admin rename',baseRevision:subject.Revision,operationId:crypto.randomUUID()},signed.token)).status,200);
 await row({save:''});assert.equal(element('lc-conflict').hidden,false);assert.match(element('lc-comparison').innerHTML,/Other admin rename/);assert.match(element('lc-comparison').innerHTML,/My subject rename/);
 await click('lc-keep');await row({save:''});assert.equal(f.db.prepare('SELECT name FROM subject_catalog WHERE subject_id=? AND source_namespace=\'ACADEMY\'').get(subject.SubjectID).name,'My subject rename');
 await click('lc-modules');assert.match(element('lc-rows').innerHTML,/First module/);
 let data=await (await post('/api/admin/platform/learning-catalogue/get',{},signed.token)).json(),programIndex=data.modules.findIndex(m=>m.usedIn.some(a=>a.kind==='PROGRAM'));
 await row({edit:String(programIndex)});field('name','Module from central UI');await row({save:''});assert.equal(f.db.prepare("SELECT count(*) n FROM modules WHERE name='Module from central UI'").get().n,1);
 data=await (await post('/api/admin/platform/learning-catalogue/get',{},signed.token)).json();const sharedSubject=data.subjects.find(s=>s.Active);
 await click('lc-add');field('subjectId',sharedSubject.SubjectID);field('name','Added centrally');await row({save:''});assert.equal(f.db.prepare("SELECT count(*) n FROM academy_module_catalogue WHERE name='Added centrally'").get().n,1);
 assert.equal(f.db.prepare("SELECT count(*) n FROM modules WHERE name='Added centrally'").get().n,0,'Definition has no Program or Course owner');
 data=await (await post('/api/admin/platform/learning-catalogue/get',{},signed.token)).json();const courseIndex=data.modules.findIndex(m=>m.usedIn.some(a=>a.kind==='COURSE'));
 await row({edit:String(courseIndex)});field('subjectId',sharedSubject.SubjectID);field('name','Classified Course module');loseNext=true;await row({save:''});assert.equal(element('lc-pending').hidden,false,element('lc-message').textContent);
 const pending=requests.at(-1);await click('lc-retry');const retried=requests.filter(r=>r.path.endsWith('/module/save')).at(-1);assert.deepEqual(retried,pending);assert.equal(element('lc-pending').hidden,true);assert.equal(f.db.prepare("SELECT count(*) n FROM academy_module_catalogue WHERE name='Classified Course module'").get().n,1);
 await click('lc-subjects');await click('lc-add');field('name','Retained after refresh');vm.runInNewContext(source,context);await settle();assert.match(element('lc-rows').innerHTML,/Retained after refresh/);
 const student=await (await post('/api/account/login',{uniqueid:'login-0002',pin:'1234'})).json();local.set('m4l_account_token',student.token);handlers.storage({key:'m4l_account_token'});await settle();assert.equal(element('lc-workspace').hidden,true);assert.equal(element('lc-rows').innerHTML,'');
 console.log('Catalogue UI: create/rename, explicit conflict review, shared Module saves and separate usage, exact retries, draft restoration and authority changes passed.');

 local.set('m4l_account_token',signed.token);
 const profilesMarkup=readFileSync(new URL('../../users/index.html',import.meta.url),'utf8'),users=harness(profilesMarkup),usersSource=readFileSync(new URL('../../js/m4l-user-profiles.js',import.meta.url),'utf8');
 vm.runInNewContext(usersSource,users.context);await settle();
 const userClick=async id=>{await users.element(id).onclick();await settle();},pick=async id=>{users.element('up-global-results').onclick({target:{closest:()=>({dataset:{globalUser:id}})}});await settle();};
 assert.doesNotMatch(users.element('up-users').innerHTML,/data-global-admin|data-global-teacher/,'Global role editing is separate from the sheet');
 await userClick('up-global-status');assert.equal(users.element('up-global-dialog').open,true);await pick('account-0001');assert.equal(users.element('up-global-admin').checked,true);assert.equal(users.element('up-global-admin').disabled,true);assert.match(users.element('up-global-note').textContent,/Another Global Admin/);
 users.element('up-global-search').oninput({target:{value:'synthetic learner 2'}});assert.match(users.element('up-global-results').innerHTML,/account-0002/);assert.doesNotMatch(users.element('up-global-results').innerHTML,/account-0001/);
 await pick('account-0002');users.element('up-global-admin').onchange({target:{checked:true}});assert.equal(users.element('up-global-save').disabled,false);
 await userClick('up-global-discard');assert.equal(users.element('up-global-admin').checked,false);assert.equal(users.element('up-global-save').disabled,true);
 users.element('up-global-admin').onchange({target:{checked:true}});await userClick('up-global-close');assert.equal(users.element('up-global-dialog').open,false);
 // Closing the editor retains its draft, including after a page reload.
 vm.runInNewContext(usersSource,users.context);await settle();await userClick('up-global-status');await pick('account-0002');assert.equal(users.element('up-global-admin').checked,true);
 await userClick('up-global-save');
 assert.equal(f.db.prepare("SELECT count(*) n FROM global_role_assignments WHERE account_id='account-0002' AND active=1 AND review_state='CONFIRMED'").get().n,1);
 assert.equal(users.element('up-global-save').disabled,true);assert.match(users.element('up-global-message').textContent,/Saved/);
 users.element('up-global-admin').onchange({target:{checked:false}});users.element('up-global-teacher').onchange({target:{checked:true}});await userClick('up-global-save');
 assert.equal(f.db.prepare("SELECT count(*) n FROM global_role_assignments WHERE account_id='account-0002' AND active=1").get().n,0);
 assert.equal(f.db.prepare("SELECT count(*) n FROM role_assignments WHERE account_id='account-0002' AND role='STUDENT' AND active=1").get().n,1);
 assert.equal(users.element('up-global-teacher').checked,true);
 // A concurrent profile save must surface the existing explicit conflict review.
 users.element('up-global-admin').onchange({target:{checked:true}});
 const directory=await (await post('/api/admin/platform/user-profiles/get',{},signed.token)).json(),person=directory.accounts.find(a=>a.accountId==='account-0002');
 assert.equal((await post('/api/admin/platform/user-profiles/save',{mode:'profile',accountId:person.accountId,displayName:'Changed elsewhere',active:true,creating:false,baseRevision:person.revision,operationId:crypto.randomUUID()},signed.token)).status,200);
 await userClick('up-global-save');assert.equal(users.element('up-global-dialog').open,false);assert.equal(users.element('up-conflict').hidden,false);assert.match(users.element('up-comparison').innerHTML,/Changed elsewhere/);
 assert.equal(f.db.prepare("SELECT count(*) n FROM global_role_assignments WHERE account_id='account-0002' AND active=1").get().n,0);
 await userClick('up-use-saved');await userClick('up-global-status');await pick('account-0002');assert.equal(users.element('up-global-admin').checked,false);assert.equal(users.element('up-global-teacher').checked,true);
 users.element('up-global-search').oninput({target:{value:'no matching person'}});assert.match(users.element('up-global-results').innerHTML,/No matching users/);
 console.log('User profiles UI: searchable Global status editor, self-removal protection, discard, retained drafts, grant/revoke and preserved Student assignments passed.');
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
}finally{f.db.close();}
