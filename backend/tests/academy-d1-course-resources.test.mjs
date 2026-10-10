import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../src/worker.js';
import {courseFixture} from './fixtures/academy-d1-course-fixture.mjs';
import {nativeBinding} from './fixtures/academy-d1-fixture.mjs';

const base='/api/admin/platform/global/',root='synthetic_course_root',child='synthetic_course_child',replacement='synthetic_course_replacement',outside='synthetic_course_outside';
const book='synthetic_course_book',second='synthetic_course_book_2',outsideFile='synthetic_course_outside_file';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pem=`-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
const post=async(env,path,input={},token='')=>{const response=await worker.fetch(new Request('https://academy.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),env);return {status:response.status,body:await response.json()};};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,id='0001')=>ok(await post(env,'/api/account/login',{uniqueid:'login-'+id,pin:'1234'})).token;
const revision=async(env,token)=>ok(await post(env,base+'get',{},token)).workflowRevision;
const write=async(env,action,input,token)=>post(env,base+action,{...input,workflowRevision:await revision(env,token),operationId:crypto.randomUUID()},token);
const resource=(fileId=book,name='Course book')=>({subjectId:'subject-1',moduleId:'module-1',taskId:'',resourceName:name,resourceType:'EBOOK',resourceDescription:'A Course resource',active:true,fileId});
async function use(fn){
  const f=await courseFixture(),original=globalThis.fetch,calls=[];
  f.env.GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({type:'service_account',client_email:'course-'+crypto.randomUUID()+'@example.invalid',private_key:pem,token_uri:'https://oauth2.googleapis.com/token'});
  const items=new Map([
    ...[root,replacement,outside].map(id=>[id,{id,name:'Course resources',mimeType:'application/vnd.google-apps.folder',parents:[]}]),
    [child,{id:child,name:'Books',mimeType:'application/vnd.google-apps.folder',parents:[root]}],
    ...[book,second,outsideFile].map(id=>[id,{id,name:id+'.pdf',mimeType:'application/pdf',parents:[id===outsideFile?outside:child],size:'3',capabilities:{canDownload:true}}])
  ]);
  let hook=()=>{};
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url);calls.push(u.href);assert.notEqual(u.hostname,'sheets.googleapis.com','Course resource operations must not call Sheets');
    if(u.hostname==='oauth2.googleapis.com')return Response.json({access_token:'synthetic-drive-token',expires_in:3600});
    assert.equal(u.hostname,'www.googleapis.com');
    if(u.searchParams.get('alt')==='media')return new Response('PDF',{headers:{'Content-Type':'application/pdf','Content-Length':'3'}});
    if(u.pathname==='/drive/v3/files')return Response.json({files:[items.get(child),items.get(book)],nextPageToken:'synthetic-next'});
    const id=decodeURIComponent(u.pathname.split('/').at(-1));hook(id);
    const item=items.get(id);return item?Response.json({...item,trashed:false}):Response.json({error:{message:'Missing synthetic item'}},{status:404});
  };
  try{await fn({...f,calls,items,setHook:fn=>hook=fn});assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally{globalThis.fetch=original;f.db.close();}
}
const configure=async(env,token)=>ok(await write(env,'drive-root/save',{folderId:root},token));
const add=async(env,token,input=resource())=>ok(await write(env,'resource/save',input,token)).resource;

test('Course resource folder, browsing and batch edits use D1; only Global Admin manages them',()=>use(async({env,db,queries,items})=>{
  const token=await login(env),scoped=await login(env,'0004'),teacher=await login(env,'0003');
  for(const account of [scoped,teacher])for(const action of ['drive-root/save','drive/browse','resource/save','resources/save-batch'])assert.equal((await post(env,base+action,{},account)).status,403);
  const configured=await configure(env,token);assert.equal(configured.globalResourceDriveRoot.folderid,root);
  assert.equal(db.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='GlobalResourceDriveRootFolderID'").get().setting_value,root);
  const listing=ok(await post(env,base+'drive/browse',{},token));assert.equal(listing.rootFolderId,root);assert.equal(listing.items[0].isFolder,true);assert.equal(listing.nextPageToken,'synthetic-next');
  const nested=ok(await post(env,base+'drive/browse',{folderId:child},token));assert.equal(nested.breadcrumbs.length,2);
  assert.equal((await post(env,base+'drive/browse',{folderId:outside},token)).status,400);
  const evidence=db.prepare('SELECT * FROM legacy_access_evidence ORDER BY evidence_id').all(),publications=db.prepare('SELECT * FROM timetable_publications ORDER BY publication_id').all();
  const request={resources:[{...resource(),clientKey:'first'},{...resource(second,'Second Course book'),clientKey:'second'}],workflowRevision:await revision(env,token),operationId:crypto.randomUUID()};
  for(let index=2;index<20;index++){
    const id='synthetic_batch_book_'+index;items.set(id,{...items.get(book),id});request.resources.push({...resource(id,'Batch book '+index),clientKey:'batch-'+index});
  }
  const before=queries.length,saved=ok(await post(env,base+'resources/save-batch',request,token));assert.ok(queries.length-before<=50);
  assert.equal(saved.resources.length,20);assert.equal(ok(await post(env,base+'resources/save-batch',request,token)).replayed,true);
  const rows=db.prepare('SELECT * FROM course_resources').all();assert.equal(rows.length,20);assert.ok(rows.every(r=>r.resource_link.startsWith('https://academy.invalid/api/library/drive/file/')));
  assert.deepEqual(db.prepare('SELECT * FROM legacy_access_evidence ORDER BY evidence_id').all(),evidence);assert.deepEqual(db.prepare('SELECT * FROM timetable_publications ORDER BY publication_id').all(),publications);
  const first=saved.resources[0],edit={...resource('','Renamed Course book'),resourceId:first.resourceid};
  ok(await write(env,'resource/save',edit,token));assert.equal(db.prepare('SELECT name FROM course_resources WHERE resource_id=?').get(first.resourceid).name,'Renamed Course book');
  const oldVersion=request.workflowRevision;assert.equal((await post(env,base+'resource/save',{...edit,workflowRevision:oldVersion,operationId:crypto.randomUUID()},token)).body.code,'WORKFLOW_CHANGED');
}));

test('Course resources reject outside files, duplicates, invalid types and hidden branch moves without partial writes',()=>use(async({env,db,items})=>{
  const token=await login(env);await configure(env,token);const first=await add(env,token);
  assert.equal((await write(env,'resource/save',resource(outsideFile,'Outside'),token)).status,400);
  assert.equal((await write(env,'resource/save',resource(book,'Duplicate'),token)).status,409);
  assert.equal((await write(env,'resource/save',{...resource(second,'Unsupported audio'),resourceType:'AUDIO'},token)).status,400);
  const another=ok(await write(env,'subject/save',{subjectName:'Another Course',active:true},token)).subject;
  assert.equal((await write(env,'resource/save',{...resource('','Moved'),resourceId:first.resourceid,subjectId:another.subjectid,moduleId:''},token)).status,409);
  const row=db.prepare('SELECT * FROM course_resources').get();items.get(book).parents=[outside];
  assert.equal((await write(env,'resource/save',{...resource('','Moved outside Drive'),resourceId:first.resourceid},token)).status,400);
  assert.deepEqual(db.prepare('SELECT * FROM course_resources').get(),row);
  // Archiving is allowed even if the original file was moved or deleted.
  ok(await write(env,'resource/save',{...resource('','Course book'),resourceId:first.resourceid,active:false},token));
  assert.equal(db.prepare('SELECT active FROM course_resources').get().active,0);
}));

test('Course root changes retain every existing Drive resource; failed audits roll back root and resource batches',()=>use(async({env,db,items})=>{
  const token=await login(env);await configure(env,token);await add(env,token);
  const receiptCount=()=>db.prepare('SELECT count(*) n FROM operation_receipts').get().n,before=receiptCount();
  assert.equal((await write(env,'drive-root/save',{folderId:replacement},token)).status,409);assert.equal(receiptCount(),before);
  items.get(child).parents=[replacement];
  const rootChange={folderId:replacement,workflowRevision:await revision(env,token),operationId:crypto.randomUUID()};
  db.exec("CREATE TRIGGER fail_course_resource_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='COURSE_MANAGEMENT' BEGIN SELECT RAISE(ABORT,'Synthetic resource audit failure'); END");
  assert.equal((await post(env,base+'drive-root/save',rootChange,token)).status,503);
  assert.equal(db.prepare("SELECT setting_value FROM academy_settings WHERE setting_key='GlobalResourceDriveRootFolderID'").get().setting_value,root);assert.equal(receiptCount(),before);
  db.exec('DROP TRIGGER fail_course_resource_audit');
  ok(await post(env,base+'drive-root/save',rootChange,token));assert.equal(ok(await post(env,base+'drive-root/save',rootChange,token)).replayed,true);
  const count=db.prepare('SELECT count(*) n FROM course_resources').get().n;
  db.exec("CREATE TRIGGER fail_course_resource BEFORE INSERT ON course_resources WHEN NEW.name='Failing resource' BEGIN SELECT RAISE(ABORT,'Synthetic resource failure'); END");
  const failed=await write(env,'resources/save-batch',{resources:[resource(second,'First resource'),resource(second,'Failing resource')]},token);
  // Two distinct entries cannot reference the same Drive file, even before SQL.
  assert.equal(failed.status,409);assert.equal(db.prepare('SELECT count(*) n FROM course_resources').get().n,count);
  items.set('synthetic_third_book',{...items.get(second),id:'synthetic_third_book'});
  assert.equal((await write(env,'resources/save-batch',{resources:[resource(second,'First resource'),resource('synthetic_third_book','Failing resource')]},token)).status,503);
  assert.equal(db.prepare('SELECT count(*) n FROM course_resources').get().n,count);
}));

test('lost resource acknowledgements replay; concurrent edits conflict and authority is rechecked after Drive verification',()=>use(async({env,db,setHook})=>{
  const token=await login(env);await configure(env,token);
  const input={...resource(),workflowRevision:await revision(env,token),operationId:crypto.randomUUID()},binding=nativeBinding(db);let lose=true;
  const wrapped={...binding,batch:async statements=>{const value=await binding.batch(statements);if(lose&&db.prepare('SELECT 1 FROM operation_receipts WHERE operation_id=?').get(input.operationId)){lose=false;throw Error('Lost synthetic acknowledgement');}return value;}};
  const saved=ok(await post({...env,ACADEMY_DB:{withSession:()=>wrapped}},base+'resource/save',input,token));assert.equal(saved.replayed,true);assert.equal(db.prepare('SELECT count(*) n FROM course_resources').get().n,1);
  const sharedRevision=await revision(env,token),id=saved.resource.resourceid;
  const outcomes=await Promise.all(['First edit','Second edit'].map(resourceName=>post(env,base+'resource/save',{...resource('',resourceName),resourceId:id,workflowRevision:sharedRevision,operationId:crypto.randomUUID()},token)));
  assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
  const before=db.prepare('SELECT name FROM course_resources').get().name,rev=await revision(env,token);let revoked=false;
  setHook(()=>{if(!revoked){revoked=true;db.exec('UPDATE global_role_assignments SET active=0');}});
  const denied=await post(env,base+'resource/save',{...resource('','Denied edit'),resourceId:id,workflowRevision:rev,operationId:crypto.randomUUID()},token);
  assert.equal(denied.status,401);assert.equal(db.prepare('SELECT name FROM course_resources').get().name,before);
}));

test('Course access compatibility route uses session-bound tickets and rechecks paid access, root and active state',()=>use(async({env,db,calls,items})=>{
  const admin=await login(env);await configure(env,admin);const added=await add(env,admin),key='COURSE:subject-1:EBOOK:'+added.resourceid;
  db.exec("UPDATE course_settings SET legacy_access_model='PAID'");
  const scoped=await login(env,'0004');
  assert.equal((await post(env,'/api/platform/global/resources/access',{resourceId:added.resourceid},scoped)).status,403);
  const catalogue=ok(await post(env,'/api/academy/library/catalogue',{},scoped));assert.equal(catalogue.resources.find(r=>r.id===key).locked,true);
  db.exec("INSERT INTO legacy_access_evidence SELECT 'synthetic-course-subscription',run_id,'account-0002','COURSE:subject-1','LEGACY_SUBSCRIPTION',1,'TEST','synthetic:test' FROM migration_runs LIMIT 1");
  const subscriber=await login(env,'0002'),subscribed=ok(await post(env,'/api/platform/global/resources/access',{resourceId:added.resourceid},subscriber));
  assert.equal((await worker.fetch(new Request(subscribed.url),env)).status,200);
  db.exec("UPDATE legacy_access_evidence SET source_effective=0 WHERE evidence_id='synthetic-course-subscription'");
  const beforeRevocation=calls.length;assert.equal((await worker.fetch(new Request(subscribed.url),env)).status,403);assert.equal(calls.length,beforeRevocation);
  const access=ok(await post(env,'/api/platform/global/resources/access',{resourceId:added.resourceid},admin));assert.ok(access.url.includes('/api/academy/d1/library/file?access='));assert.ok(!access.url.includes(book));
  let response=await worker.fetch(new Request(access.url),env);assert.equal(response.status,200);assert.equal(await response.text(),'PDF');assert.match(response.headers.get('Cache-Control'),/no-store/);
  items.get(book).parents=[outside];response=await worker.fetch(new Request(access.url),env);assert.notEqual(response.status,200);
  items.get(book).parents=[child];db.prepare('UPDATE course_resources SET active=0 WHERE resource_id=?').run(added.resourceid);
  const before=calls.length;response=await worker.fetch(new Request(access.url),env);assert.equal(response.status,403);assert.equal(calls.length,before);
  db.prepare('UPDATE course_resources SET active=1 WHERE resource_id=?').run(added.resourceid);db.exec('UPDATE global_role_assignments SET active=0');
  response=await worker.fetch(new Request(access.url),env);assert.equal(response.status,401);
}));

test('Course resource screen keeps its saved revision while browsing and retries an uncertain batch once',()=>use(async({env,db})=>{
  const token=await login(env);await configure(env,token);
  const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},querySelectorAll:()=>[],querySelector:()=>null});return elements.get(id);};
  const calls=[];let uncertain=true;
  const apiPost=async(path,input={})=>{calls.push({path,input});const result=(await post(env,path,input,token)).body;if(uncertain&&path===base+'resources/save-batch'&&result.success){uncertain=false;return {success:false,retryable:true,error:'Uncertain response'};}return result;};
  const window={showScreen:()=>true,M4LAuth:{apiPost}},context={window,apiPost,state:{token,user:{type:'account',role:'GLOBAL_ADMIN',platformrole:'GLOBAL_ADMIN'}},crypto,Date,Map,Set,console,alert(){},document:{addEventListener(){},getElementById:element,querySelectorAll:()=>[],querySelector:()=>null}};
  let code=readFileSync(new URL('../../js/m4l-global-curriculum.js',import.meta.url),'utf8'),at=code.indexOf('  window.M4LGlobalCurriculum =');
  code=code.slice(0,at)+'  window.testWorkflowPost=workflowPost;window.testSelectTab=selectTab;\n'+code.slice(at);vm.runInNewContext(code,context);
  await window.M4LGlobalCurriculum.show();window.testSelectTab('resources');assert.ok([...elements.values()].some(e=>e.innerHTML.includes('Browse Folder')||e.innerHTML.includes('Add a Global Resource')));
  const input={resources:[resource()]};assert.equal((await window.testWorkflowPost(base+'resources/save-batch',input,token)).success,false);assert.equal((await window.testWorkflowPost(base+'resources/save-batch',input,token)).replayed,true);
  const writes=calls.filter(c=>c.path===base+'resources/save-batch');assert.equal(writes[0].input.operationId,writes[1].input.operationId);assert.equal(db.prepare('SELECT count(*) n FROM course_resources').get().n,1);
  ok(await write(env,'subject/save',{subjectId:'subject-1',subjectName:'Renamed Course',active:true},token));
  assert.equal((await window.testWorkflowPost(base+'drive/browse',{},token)).success,true);assert.equal(calls.at(-1).input.operationId,undefined);
  assert.equal((await window.testWorkflowPost(base+'resource/save',{...resource('','Stale browser edit'),resourceId:db.prepare('SELECT resource_id FROM course_resources').get().resource_id},token)).code,'WORKFLOW_CHANGED');
}));
