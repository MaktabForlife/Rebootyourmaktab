import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createSessionToken} from '../src/lib/auth.js';
import {programLibraryEndpoint} from '../src/routes/program-library.js';
import {startLibraryUpload,copyLibraryFile,openLibraryUploadTicket,forwardLibraryUploadChunk,LIBRARY_UPLOAD_CHUNK_SIZE} from '../src/lib/library-upload-bridge.js';

const secret='development-library-bridge-secret-long-enough';
const sessionUrl='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test-session';
const source=await readFile(new URL('../../apps-script/code.gs',import.meta.url),'utf8');
let scriptSecret=secret,scriptCalls=0,driveCalls=0;
const context={console,Date,JSON,Math,Number,String,Error,
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>1,getRange:()=>({getDisplayValues:()=>[['ProgramLibraryDriveFolderId','folder-owned-123']]})})})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>scriptSecret})},
  Utilities:{
    computeHmacSha256Signature:(value,key)=>[...createHmac('sha256',key).update(value).digest()],
    base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),
    base64DecodeWebSafe:value=>[...Buffer.from(value,'base64url')],
    newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')})
  },
  DriveApp:{getFolderById:id=>{assert.equal(id,'folder-owned-123');return {isTrashed:()=>false};},getFileById:id=>{assert.equal(id,'teacher-file-123');return {isTrashed:()=>false,getMimeType:()=> 'application/pdf',getName:()=> 'Shared book.pdf',getSize:()=>123,makeCopy:()=>({getId:()=> 'copied-file-123',getName:()=> 'Shared book.pdf',getMimeType:()=> 'application/pdf'})};}},
  ScriptApp:{getOAuthToken:()=> 'owner-oauth-token'},
  UrlFetchApp:{fetch:(url,options)=>{scriptCalls++;assert.equal(url,'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,parents');assert.equal(options.headers.Authorization,'Bearer owner-oauth-token');assert.equal(JSON.parse(options.payload).parents[0],'folder-owned-123');return {getResponseCode:()=>200,getAllHeaders:()=>({Location:sessionUrl})};}}
};
vm.createContext(context);vm.runInContext(source,context);
assert.throws(()=>context.startProgramLibraryUpload({payload:'abc',signature:'bad'}),/Invalid Library upload request/);
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(url==='https://script.google.com/macros/s/test/exec'){
    const body=JSON.parse(options.body);
    assert(['startProgramLibraryUpload','copyProgramLibraryFile'].includes(body.action));
    return new Response(JSON.stringify(context[body.action](body.data)),{status:200});
  }
  assert.equal(url,sessionUrl);driveCalls++;
  assert.equal(options.headers['Content-Type'],'application/pdf');
  if(driveCalls===1){assert.equal(options.headers['Content-Range'],`bytes 0-${LIBRARY_UPLOAD_CHUNK_SIZE-1}/${LIBRARY_UPLOAD_CHUNK_SIZE+3}`);return new Response(null,{status:308,headers:{Range:`bytes=0-${LIBRARY_UPLOAD_CHUNK_SIZE-1}`}});}
  assert.equal(options.headers['Content-Range'],`bytes ${LIBRARY_UPLOAD_CHUNK_SIZE}-${LIBRARY_UPLOAD_CHUNK_SIZE+2}/${LIBRARY_UPLOAD_CHUNK_SIZE+3}`);
  return new Response(JSON.stringify({id:'uploaded-file',name:'Book.pdf',mimeType:'application/pdf'}),{status:200});
};
try{
  const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',M4L_LIBRARY_BRIDGE_SECRET:secret};
  const details={folderId:'folder-owned-123',fileName:'Book.pdf',mimeType:'application/pdf',size:LIBRARY_UPLOAD_CHUNK_SIZE+3,accountId:'ADMIN',programId:'PRG-TEST',resourceType:'EBOOK'};
  const started=await startLibraryUpload(env,details);
  const copied=await copyLibraryFile(env,{sourceFileId:'teacher-file-123',folderId:'folder-owned-123',resourceType:'EBOOK'});
  assert.equal(copied.id,'copied-file-123');
  assert.equal(started.chunkSize,LIBRARY_UPLOAD_CHUNK_SIZE);
  assert(!started.ticket.includes(sessionUrl),'The browser ticket must conceal the Drive session URL');
  assert.equal(scriptCalls,1);
  const ticket=await openLibraryUploadTicket(env,started.ticket);
  assert.equal(ticket.accountId,'ADMIN');
  assert.equal(ticket.sessionUrl,sessionUrl);
  assert.equal(await openLibraryUploadTicket({...env,M4L_LIBRARY_BRIDGE_SECRET:'different-secret-that-is-long-enough'},started.ticket),null);
  const [iv,ciphertext]=started.ticket.split('.');
  assert.equal(await openLibraryUploadTicket(env,`${iv}.${ciphertext[0]==='A'?'B':'A'}${ciphertext.slice(1)}`),null);
  const first=await forwardLibraryUploadChunk(ticket,0,new Uint8Array(LIBRARY_UPLOAD_CHUNK_SIZE));
  assert.deepEqual(first,{complete:false,nextOffset:LIBRARY_UPLOAD_CHUNK_SIZE});
  const final=await forwardLibraryUploadChunk(ticket,LIBRARY_UPLOAD_CHUNK_SIZE,new Uint8Array(3));
  assert.equal(final.complete,true);assert.equal(final.file.id,'uploaded-file');
  const uploadEnv={...env,SESSION_SECRET:'library-upload-session-secret-long-enough'};
  const accountToken=await createSessionToken({type:'account',role:'GLOBAL_ADMIN',scope:'PLATFORM',accountid:'ADMIN',uniqueid:'ADMIN',authrow:2,credentialHash:'credential-hash'},uploadEnv);
  driveCalls=0;
  const chunkRequest=new Request('https://worker.test/api/admin/platform/program-library/upload-chunk',{method:'POST',headers:{Authorization:`Bearer ${accountToken}`,'X-Library-Upload-Ticket':started.ticket,'X-Library-Upload-Offset':'0','Content-Type':'application/octet-stream'},body:new Uint8Array(LIBRARY_UPLOAD_CHUNK_SIZE)});
  const chunkResponse=await programLibraryEndpoint('upload-chunk')(chunkRequest,uploadEnv);
  assert.equal(chunkResponse.status,200,'Intermediate chunks use the signed ticket without another Sheets read');
  assert.equal((await chunkResponse.json()).nextOffset,LIBRARY_UPLOAD_CHUNK_SIZE);
  const otherAccountToken=await createSessionToken({type:'account',role:'GLOBAL_ADMIN',scope:'PLATFORM',accountid:'OTHER',uniqueid:'OTHER',authrow:2,credentialHash:'credential-hash'},uploadEnv);
  const otherRequest=new Request('https://worker.test/api/admin/platform/program-library/upload-chunk',{method:'POST',headers:{Authorization:`Bearer ${otherAccountToken}`,'X-Library-Upload-Ticket':started.ticket,'X-Library-Upload-Offset':'0','Content-Type':'application/octet-stream'},body:new Uint8Array(1)});
  const otherResponse=await programLibraryEndpoint('upload-chunk')(otherRequest,uploadEnv);
  assert.equal(otherResponse.status,401,'A different account cannot use the sealed upload ticket');
  scriptSecret='wrong-owner-secret-that-is-long-enough';
  await assert.rejects(()=>startLibraryUpload(env,details),/Invalid Library upload signature/);
}finally{globalThis.fetch=originalFetch;}
console.log('Program Library Apps Script identity, signed start, sealed ticket and chunked Drive upload passed.');
