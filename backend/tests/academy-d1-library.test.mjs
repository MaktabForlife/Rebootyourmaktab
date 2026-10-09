import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import vm from 'node:vm';
import {learningFixture,resource,root,fileId,coverId} from './fixtures/academy-d1-learning-fixture.mjs';
import {PROGRAM_IDS} from './fixtures/academy-migration-fixture.mjs';
import worker from '../src/worker.js';
const id=PROGRAM_IDS[0],activity=`PROGRAM:${id}`,path='/api/admin/platform/program-library/';
const post=async(env,url,input={},token='')=>{const response=await worker.fetch(new Request(`http://localhost${url}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input)}),env);return {status:response.status,body:await response.json()};};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const login=async(env,n='0001')=>ok(await post(env,'/api/account/login',{uniqueid:`login-${n}`,pin:'1234'})).token;
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const pem=`-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8',keys.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
const newRoot='synthetic_new_root',outside='synthetic_outside_file',newFile='synthetic_new_file';
async function use(fn) {
  const f=await learningFixture(),original=globalThis.fetch,calls=[];
  f.env.GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({type:'service_account',client_email:`d1-${crypto.randomUUID()}@example.invalid`,private_key:pem,token_uri:'https://oauth2.googleapis.com/token'});
  let hook=()=>{},bridge;
  globalThis.fetch=async(url,options={})=>{
    const u=new URL(url);calls.push({url:u.href,method:options.method||'GET'});
    assert.notEqual(u.hostname,'sheets.googleapis.com','D1 file flow must never call Sheets');
    if(u.hostname==='oauth2.googleapis.com')return Response.json({access_token:'synthetic-drive-token',expires_in:3600});
    if(u.hostname==='script.google.com'&&bridge)return Response.json(bridge(JSON.parse(options.body)));
    if(u.pathname==='/upload/drive/v3/files'&&bridge){assert.equal(options.headers['Content-Range'],'bytes 0-2/6');return new Response(null,{status:308,headers:{Range:'bytes=0-2'}});}
    assert.equal(u.hostname,'www.googleapis.com');
    if(u.searchParams.get('alt')==='media'){
      if(new Headers(options.headers).has('Range'))return new Response('PDF',{status:206,headers:{'Content-Type':'application/pdf','Content-Range':'bytes 0-2/3','Content-Length':'3'}});
      return new Response('PDF',{headers:{'Content-Type':'application/pdf','Content-Length':'3'}});
    }
    if(u.pathname==='/drive/v3/files')return Response.json({files:[]});
    const item=decodeURIComponent(u.pathname.split('/').at(-1));hook(item);
    const folder=[root,newRoot,'other_root'].includes(item);
    return Response.json({id:item,name:folder?'Resources':item===coverId?'Cover.png':'Book.pdf',mimeType:folder?'application/vnd.google-apps.folder':item===coverId?'image/png':'application/pdf',parents:folder?[]:[item===outside?'other_root':item===newFile?newRoot:root],trashed:false,capabilities:{canDownload:true}});
  };
  try{await fn({...f,calls,setHook:h=>hook=h,setBridge:b=>bridge=b});assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally{globalThis.fetch=original;f.db.close();}
}
test('file links recheck D1 permissions and retain streaming, ranges, HEAD and private headers',()=>use(async({env,db,calls})=>{
  const token=await login(env,'0002'),result=ok(await post(env,'/api/program-library/access',{id,resourceId:resource},token));
  assert.equal(result.expiresIn,300);assert.ok(!result.url.includes(fileId));
  let response=await worker.fetch(new Request(result.url,{headers:{Range:'bytes=0-2'}}),env);
  assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 0-2/3');assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(await response.text(),'PDF');
  response=await worker.fetch(new Request(result.url,{method:'HEAD'}),env);assert.equal(response.status,200);assert.equal(await response.text(),'');
  const before=calls.length;db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002' AND activity_key=?").run(activity);
  response=await worker.fetch(new Request(result.url),env);assert.equal(response.status,403);assert.equal(calls.length,before,'Revoked access is rejected before Drive');
  db.prepare("UPDATE accounts SET active=0 WHERE account_id='account-0002'").run();
  assert.equal((await worker.fetch(new Request(result.url),env)).status,401);
  assert.equal((await worker.fetch(new Request(result.url.replace(/access=.*/,`access=${encodeURIComponent(token)}`)),env)).status,401,'Account sessions cannot be used as file tickets');
}));
test('resource edits use row revisions, atomic receipts and permitted Drive roots',()=>use(async({env,db,queries})=>{
  const token=await login(env,'0004'),view=ok(await post(env,path+'manage',{id},token)),record=view.rows.resources[0];
  const input={id,kind:'resources',record:{...record,Name:'Edited book'},creating:false,baseRowRevision:view.rowRevisions.resources[resource],operationId:crypto.randomUUID()};
  const before=queries.length;ok(await post(env,path+'save',input,token));assert.ok(queries.length-before<=50,`Resource save used ${queries.length-before} queries`);
  assert.equal(ok(await post(env,path+'save',input,token)).replayed,true);
  assert.equal((await post(env,path+'save',{...input,operationId:crypto.randomUUID()},token)).status,409);
  const refreshed=ok(await post(env,path+'manage',{id},token));
  const invalid={...input,record:{...input.record,DriveFileID:outside},baseRowRevision:refreshed.rowRevisions.resources[resource],operationId:crypto.randomUUID()};
  assert.equal((await post(env,path+'save',invalid,token)).status,400);
  assert.equal(db.prepare('SELECT drive_file_id FROM program_resources').get().drive_file_id,fileId);
  db.exec("CREATE TRIGGER fail_library_audit BEFORE INSERT ON audit_events WHEN NEW.record_kind='PROGRAM_LIBRARY' BEGIN SELECT RAISE(ABORT,'failed audit'); END");
  assert.equal((await post(env,path+'save',{...invalid,record:{...input.record,Name:'Must roll back'}},token)).status,503);
  assert.equal(db.prepare('SELECT name FROM program_resources').get().name,'Edited book');
  assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,1);
}));
test('only Global Admin can change a Program folder; old files remain accessible and new files use the new destination',()=>use(async({env,db})=>{
  const admin=await login(env,'0004'),global=await login(env),input={id,folder:newRoot,operationId:crypto.randomUUID()};
  assert.equal((await post(env,path+'folder-set',input,admin)).status,403);
  ok(await post(env,path+'folder-set',input,global));assert.equal(ok(await post(env,path+'folder-set',input,global)).replayed,true);
  assert.equal(db.prepare('SELECT count(*) n FROM program_library_roots').get().n,2);
  ok(await post(env,path+'access',{id,resourceId:resource},admin));
  const data=ok(await post(env,path+'manage',{id},admin)),old=data.rows.resources[0];
  const save={id,kind:'resources',creating:true,record:{...old,ResourceID:`RES-${crypto.randomUUID()}`,Name:'Old-root replacement'},baseRowRevision:data.emptyRowRevision,operationId:crypto.randomUUID()};
  assert.equal((await post(env,path+'save',save,admin)).status,400,'New entries cannot select an old destination');
  ok(await post(env,path+'save',{...save,record:{...save.record,Name:'New-root book',DriveFileID:newFile,CoverDriveFileID:''},operationId:crypto.randomUUID()},admin));
}));
test('permission revocation during file verification blocks the entire save',()=>use(async({env,db,setHook})=>{
  const token=await login(env,'0004'),data=ok(await post(env,path+'manage',{id},token));let revoked=false;
  setHook(()=>{if(!revoked){revoked=true;db.prepare("UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0004' AND activity_key=?").run(activity);}});
  const result=await post(env,path+'save',{id,kind:'resources',creating:false,record:{...data.rows.resources[0],Name:'Forbidden change'},baseRowRevision:data.rowRevisions.resources[resource],operationId:crypto.randomUUID()},token);
  assert.equal(result.status,401);assert.equal(db.prepare('SELECT name FROM program_resources').get().name,'Synthetic book');assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
}));
test('Program Admin does not bypass paid Course access; R2 tickets recheck the resource',()=>use(async({env,db})=>{
  db.prepare("INSERT INTO course_resources(activity_key,resource_id,module_id,name,resource_type,resource_link,active) VALUES('COURSE:subject-1','course-book','module-1','Course book','EBOOK','https://pub-d0f00cecdced454598b794da754a3939.r2.dev/Resources/Book.pdf',1)").run();
  db.exec("UPDATE course_settings SET legacy_access_model='PAID'");
  const admin=await login(env,'0004'),global=await login(env),key='COURSE:subject-1:EBOOK:course-book';
  const data=ok(await post(env,'/api/academy/library/catalogue',{},admin));assert.equal(data.resources.find(r=>r.id===key).locked,true);
  assert.equal((await post(env,'/api/academy/library/access',{resourceId:key},admin)).status,403);
  const object={etag:'synthetic-etag',size:3,httpMetadata:{contentType:'application/pdf'},writeHttpMetadata:headers=>headers.set('Content-Type','application/pdf')};
  env.MEDIA_BUCKET={head:async()=>object,get:async()=>({...object,body:new Response('PDF').body})};
  const access=ok(await post(env,'/api/academy/library/access',{resourceId:key},global));
  let response=await worker.fetch(new Request(access.url),env);assert.equal(response.status,200);assert.equal(await response.text(),'PDF');
  db.exec("UPDATE course_resources SET active=0");response=await worker.fetch(new Request(access.url),env);assert.equal(response.status,403);
}));
test('D1 upload bridge avoids Sheets and checks current authority on every chunk',()=>use(async({env,db,setBridge})=>{
  const token=await login(env,'0004');
  assert.equal((await post(env,path+'upload-start',{id},token)).body.code,'UPLOAD_BRIDGE_REQUIRED');
  const secret='synthetic-d1-bridge-secret-long-enough',sessionUrl='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic';
  env.ACADEMY_D1_UPLOAD_BRIDGE='D1_V1';env.APPS_SCRIPT_URL='https://script.google.com/macros/s/synthetic/exec';env.M4L_LIBRARY_BRIDGE_SECRET=secret;
  let sheets=0;const context={console,Date,JSON,Math,Number,String,Error,SpreadsheetApp:{getActiveSpreadsheet:()=>{sheets++;throw Error('Sheets forbidden');}},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>secret})},Utilities:{computeHmacSha256Signature:(v,k)=>[...createHmac('sha256',k).update(v).digest()],base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),base64DecodeWebSafe:v=>[...Buffer.from(v,'base64url')],newBlob:b=>({getDataAsString:()=>Buffer.from(b).toString('utf8')})},
    DriveApp:{getFolderById:folder=>{assert.equal(folder,root);return {isTrashed:()=>false};}},ScriptApp:{getOAuthToken:()=> 'synthetic-owner-token'},
    UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getAllHeaders:()=>({Location:sessionUrl})})}};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../../apps-script/code.gs',import.meta.url),'utf8'),context);
  setBridge(body=>context[body.action](body.data));
  const started=ok(await post(env,path+'upload-start',{id,fileName:'New.pdf',mimeType:'application/pdf',size:6,resourceType:'EBOOK'},token));assert.equal(sheets,0);
  const chunk=()=>new Request('http://localhost'+path+'upload-chunk',{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Library-Upload-Ticket':started.ticket,'X-Library-Upload-Offset':'0'},body:new Uint8Array(3)});
  assert.equal((await worker.fetch(chunk(),env)).status,200);
  db.prepare("UPDATE legacy_access_evidence SET source_effective=0 WHERE account_id='account-0004' AND activity_key=?").run(activity);
  assert.equal((await worker.fetch(chunk(),env)).status,401);assert.equal(sheets,0);
}));
test('combined Student and staff roles keep the strongest scoped Library authority',()=>use(async({env,db})=>{
  const grant=role=>db.prepare("INSERT INTO role_assignments(assignment_id,account_id,activity_key,role,active,review_state) VALUES(?,'account-0008',?,?,1,'CONFIRMED')").run(crypto.randomUUID(),activity,role);
  grant('PROGRAM_ADMIN');let token=await login(env,'0008');
  assert.equal(ok(await post(env,'/api/program-library/available',{},token)).programs.find(p=>p.id===id).role,'PROGRAM_ADMIN');
  assert.equal(ok(await post(env,'/api/program-library/catalogue',{id},token)).canManage,true);
  ok(await post(env,path+'manage',{id},token));
  db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0008' AND role='PROGRAM_ADMIN'").run();grant('TEACHER');
  db.prepare('INSERT INTO library_access_policies VALUES(?,?,?,?)').run(`${activity}:${resource}`,'STAFF_ONLY','','');
  token=await login(env,'0008');const catalogue=ok(await post(env,'/api/program-library/catalogue',{id},token));
  assert.equal(catalogue.role,'TEACHER');assert.equal(catalogue.canManage,false);assert.equal(catalogue.resources.length,1);
  assert.equal((await post(env,path+'manage',{id},token)).status,403);
}));
