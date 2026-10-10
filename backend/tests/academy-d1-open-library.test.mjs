import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {openLibraryFixture} from './fixtures/academy-d1-open-library-fixture.mjs';
import {nativeBinding} from './fixtures/academy-d1-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import {loadOpenLibraryTaxonomy} from '../src/lib/open-library-taxonomy.js';
import {openLibraryMetadataUser} from '../src/routes/open-library-metadata.js';
import {setRequestAuthUser} from '../src/lib/request-context.js';

const base='/api/academy/open-library/metadata/',book='EXTERNAL:INTERNET_ARCHIVE:D1_TEST_BOOK';
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
async function post(env,path,input={},token=''){
  const r=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);return {status:r.status,body:await r.json()};
}
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const get=(env,path)=>worker.fetch(new Request('https://academy.invalid'+path),env);
const save=(env,token,input)=>post(env,base+'save',input,token);
const archiveInput={id:book,baseRevision:0,title:'D1 book',resourceType:'EBOOK',learningAreaRefs:['PROGRAM:'+PROGRAM_IDS[0]],subjectRef:'GLOBAL:subject-1',moduleRef:'GLOBAL:module-1',coverUrl:''};
async function use(fn){
  const f=await openLibraryFixture(),original=globalThis.fetch;let network=0;
  globalThis.fetch=async()=>{network++;throw Error('External requests forbidden');};
  try{await fn(f);assert.equal(network,0);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.ok(f.namespaceNames.every(name=>name==='synthetic-existing-platform:open-library-metadata'));}
  finally{globalThis.fetch=original;f.db.close();f.metadata.close();}
}

test('Open Library keeps its existing Cloudflare namespace and public metadata/covers while D1 checks editors',()=>use(async({env,metadata,objects})=>{
  const coverKey='AcademyOpenLibrary/Covers/'+crypto.randomUUID()+'.png',link='EXTERNAL:ACADEMY_LINK:'+crypto.randomUUID();
  metadata.prepare('INSERT INTO open_library_metadata VALUES(?,?,?,?,?)').run(book,JSON.stringify({id:book,title:'Existing book',coverKey}),3,'2026-10-09','synthetic');
  metadata.prepare('INSERT INTO open_library_metadata VALUES(?,?,?,?,?)').run(link,JSON.stringify({id:link,kind:'LINK',active:false,title:'Hidden link'}),1,'2026-10-09','synthetic');
  objects.set(coverKey,{bytes:png,mime:'image/png'});
  const publicResponse=await get(env,base+'public'),data=await publicResponse.json();assert.equal(publicResponse.status,200);assert.equal(data.records.length,1);assert.equal(data.records[0].revision,3);
  assert.equal(data.records[0].hasUploadedCover,true);assert.ok(!JSON.stringify(data).includes(coverKey));
  const cover=await get(env,base+'cover?id='+encodeURIComponent(book));assert.equal(cover.status,200);assert.deepEqual(new Uint8Array(await cover.arrayBuffer()),png);
  assert.equal((await post(env,base+'list')).status,401);
  for(const id of ['0002','0004'])assert.equal((await post(env,base+'list',{},await login(env,id))).status,403);
  for(const id of ['0001','0003','0005'])assert.equal(ok(await post(env,base+'list',{},await login(env,id))).records.length,2);
  assert.equal((await post(env,base+'public')).status,405);
  assert.equal((await get(env,base+'list')).status,405);
}));

test('D1 Open Library taxonomy uses current active Academy/Program/Course records and excludes archived sources',()=>use(async({env,db})=>{
  const token=await login(env),before=ok(await post(env,base+'options',{},token));
  assert.ok(before.subjects.some(s=>s.id==='GLOBAL:subject-1'));assert.equal(before.learningAreas.length,3);assert.ok(!JSON.stringify(before).includes('REBOOT:'));
  const added=ok(await post(env,'/api/admin/platform/academy-subjects/save',{mode:'create',subjectName:'Original shared subject',operationId:crypto.randomUUID()},token)),shared='ACADEMY:'+added.subject.SubjectID;
  db.prepare('UPDATE subject_catalog SET name=? WHERE subject_key=?').run('Current D1 subject',shared);
  const current=ok(await post(env,base+'options',{},token));assert.equal(current.subjects.find(s=>s.id===shared).name,'Current D1 subject');
  db.prepare("UPDATE activities SET lifecycle='ARCHIVED',active=0 WHERE activity_key=?").run('PROGRAM:'+PROGRAM_IDS[0]);
  db.exec("UPDATE activities SET active=0 WHERE activity_key='COURSE:subject-1'");
  const filtered=ok(await post(env,base+'options',{},token));assert.ok(!filtered.learningAreas.some(a=>['PROGRAM:'+PROGRAM_IDS[0],'GLOBAL:subject-1'].includes(a.id)));
  assert.ok(!filtered.modules.some(m=>m.id.startsWith('PROGRAM:'+PROGRAM_IDS[0]+':')||m.id==='GLOBAL:module-1'));
  assert.equal((await save(env,token,archiveInput)).status,400);
  await assert.rejects(()=>loadOpenLibraryTaxonomy({...env,ACADEMY_D1_MODE:'INVALID'}),/rehearsal is not enabled/);
}));

test('the actual Open Library coordinator validates D1 references and protects concurrent edits',()=>use(async({env,db,metadata,queries})=>{
  const token=await login(env,'0003'),roles=db.prepare('SELECT * FROM role_assignments').all(),credentials=db.prepare('SELECT * FROM account_credentials').all(),start=queries.length;
  const added=ok(await save(env,token,archiveInput));assert.equal(added.record.subject,'Synthetic subject');assert.equal(added.record.module,'Synthetic module');assert.ok(queries.length-start<=50);
  assert.equal((await save(env,token,{...archiveInput,title:'Stale'})).status,409);
  const edits=await Promise.all(['First','Second'].map(title=>save(env,token,{...archiveInput,title,baseRevision:1})));assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
  assert.equal(metadata.prepare('SELECT revision FROM open_library_metadata').get().revision,2);
  assert.equal((await save(env,token,{...archiveInput,baseRevision:2,moduleRef:'GLOBAL:missing'})).status,400);
  assert.deepEqual(db.prepare('SELECT * FROM role_assignments').all(),roles);assert.deepEqual(db.prepare('SELECT * FROM account_credentials').all(),credentials);
}));

test('authority is rechecked after D1 taxonomy loading; a cached or forged user cannot bypass it',()=>use(async({env,db,metadata,coordinator})=>{
  const token=await login(env,'0003'),binding=nativeBinding(db);let revoke=true;
  const wrapped={...binding,batch:async statements=>{const result=await binding.batch(statements);if(revoke&&statements.length===4){revoke=false;db.exec("UPDATE role_assignments SET active=0 WHERE account_id='account-0003'; UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0003'");}return result;}};
  coordinator.env={...env,ACADEMY_DB:{withSession:()=>wrapped}};
  assert.equal((await save(env,token,archiveInput)).status,401);assert.equal(metadata.prepare('SELECT count(*) n FROM open_library_metadata').get().n,0);
  const forged=new Request('https://academy.invalid/',{headers:{Authorization:'Bearer invalid'}});setRequestAuthUser(forged,{type:'account',role:'GLOBAL_ADMIN',accountid:'account-0001'});
  await assert.rejects(()=>openLibraryMetadataUser(forged,env),e=>e.status===401);
  assert.equal((await post(env,base+'options',{},token)).status,401);
}));

test('uploaded covers keep validation and cleanup on failed saves; hidden links and covers stay out of public reads',()=>use(async({env,metadata,objects})=>{
  const token=await login(env),upload=async(input,bytes=png)=>{
    const form=new FormData();form.append('details',JSON.stringify(input));form.append('cover',new Blob([bytes],{type:'image/png'}),'cover.png');
    const r=await worker.fetch(new Request('https://academy.invalid'+base+'save',{method:'POST',headers:{Authorization:'Bearer '+token},body:form}),env);return {status:r.status,body:await r.json()};
  };
  assert.equal((await upload(archiveInput,new Uint8Array([0,1,2]))).status,400);assert.equal(objects.size,0);
  const added=ok(await upload({...archiveInput,kind:'LINK',id:undefined,resourceType:'OTHER',linkUrl:'https://example.org/learning',active:true})).record;
  assert.equal(objects.size,1);assert.equal(added.hasUploadedCover,true);assert.ok(!Object.hasOwn(added,'coverKey'));
  assert.equal((await upload({...archiveInput,id:added.id,kind:'LINK',resourceType:'OTHER',linkUrl:'https://example.org/learning',active:true})).status,409);assert.equal(objects.size,1);
  ok(await save(env,token,{...archiveInput,id:added.id,baseRevision:1,kind:'LINK',resourceType:'OTHER',linkUrl:'https://example.org/learning',active:false}));
  assert.equal((await (await get(env,base+'public')).json()).records.length,0);
  assert.equal((await get(env,base+'cover?id='+encodeURIComponent(added.id))).status,404);
  assert.equal(metadata.prepare('SELECT count(*) n FROM open_library_metadata').get().n,1);
}));

test('Open Library For You uses current D1 Program/Course access and loses a revoked paid assignment',()=>use(async({env,db})=>{
  const token=await login(env,'0002'),catalogue=()=>post(env,'/api/academy/library/catalogue',{},token).then(ok);
  let refs=(await catalogue()).learningAreaRefs;assert.ok(refs.includes('PROGRAM:'+PROGRAM_IDS[0]));assert.ok(refs.includes('GLOBAL:subject-1'));
  db.exec("UPDATE course_settings SET legacy_access_model='PAID'");assert.ok(!(await catalogue()).learningAreaRefs.includes('GLOBAL:subject-1'));
  const admin=await login(env),view=ok(await post(env,'/api/admin/platform/global/get',{},admin));
  const input={accountId:'account-0002',subjectId:'subject-1',active:true,workflowRevision:view.workflowRevision,operationId:crypto.randomUUID()};
  const granted=ok(await post(env,'/api/admin/platform/global/access/save',input,admin));assert.ok((await catalogue()).learningAreaRefs.includes('GLOBAL:subject-1'));
  ok(await post(env,'/api/admin/platform/global/access/save',{...input,active:false,workflowRevision:granted.workflowRevision,operationId:crypto.randomUUID()},admin));assert.ok(!(await catalogue()).learningAreaRefs.includes('GLOBAL:subject-1'));
}));

test('the existing Open Library editor loads D1 taxonomy and saves through the actual coordinator',()=>use(async({env,metadata})=>{
  const token=await login(env),nodes=new Map();
  const element=()=>({listeners:{},value:'',textContent:'',hidden:false,checked:false,disabled:false,files:[],children:[],addEventListener(n,fn){this.listeners[n]=fn;},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;if(!children.some(c=>c.value===this.value))this.value=children[0]?.value||'';}});
  const node=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};node('olm-form').hidden=true;
  const fetch=async(url,init)=>url==='/academy/open-library/catalogue'?Response.json({books:[{id:book,source:'Internet Archive',title:'Original title',resourceType:'EBOOK'}]}):worker.fetch(new Request(url,init),env);
  const window={M4L_CONFIG:{API_BASE:'https://academy.invalid'}},source=readFileSync(new URL('../../js/m4l-open-library-manage.js',import.meta.url),'utf8').replace('void start();','window.testStart=start();');
  vm.runInNewContext(source,{document:{getElementById:node,createElement:element,createTextNode:text=>({textContent:text}),addEventListener(){}},window,localStorage:{getItem:()=>token},fetch,FormData,URL});
  await window.testStart;assert.equal(node('olm-form').hidden,false,node('olm-status').textContent);assert.ok(node('olm-subject').children.some(o=>o.value==='GLOBAL:subject-1'));
  node('olm-title').value='Saved through editor';node('olm-subject').value='GLOBAL:subject-1';node('olm-subject').listeners.change();node('olm-module').value='GLOBAL:module-1';
  await node('olm-form').listeners.submit({preventDefault(){}});assert.match(node('olm-status').textContent,/Resource saved/);
  assert.equal(JSON.parse(metadata.prepare('SELECT metadata FROM open_library_metadata').get().metadata).title,'Saved through editor');
}));
