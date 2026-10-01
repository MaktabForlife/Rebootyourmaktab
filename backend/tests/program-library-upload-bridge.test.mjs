import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {startLibraryUpload,openLibraryUploadTicket,forwardLibraryUploadChunk,LIBRARY_UPLOAD_CHUNK_SIZE} from '../src/lib/library-upload-bridge.js';

const secret='development-library-bridge-secret-long-enough';
const sessionUrl='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test-session';
const source=await readFile(new URL('../../apps-script/code.gs',import.meta.url),'utf8');
let scriptSecret=secret,scriptCalls=0,driveCalls=0;
const context={console,Date,JSON,Math,Number,String,Error,
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>scriptSecret})},
  Utilities:{
    computeHmacSha256Signature:(value,key)=>[...createHmac('sha256',key).update(value).digest()],
    base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url'),
    base64DecodeWebSafe:value=>[...Buffer.from(value,'base64url')],
    newBlob:bytes=>({getDataAsString:()=>Buffer.from(bytes).toString('utf8')})
  },
  DriveApp:{getFolderById:id=>{assert.equal(id,'folder-owned-123');return {isTrashed:()=>false};}},
  ScriptApp:{getOAuthToken:()=> 'owner-oauth-token'},
  UrlFetchApp:{fetch:(url,options)=>{scriptCalls++;assert.equal(url,'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,parents');assert.equal(options.headers.Authorization,'Bearer owner-oauth-token');assert.equal(JSON.parse(options.payload).parents[0],'folder-owned-123');return {getResponseCode:()=>200,getAllHeaders:()=>({Location:sessionUrl})};}}
};
vm.createContext(context);vm.runInContext(source,context);
assert.throws(()=>context.startProgramLibraryUpload({payload:'abc',signature:'bad'}),/Invalid Library upload request/);
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(url==='https://script.google.com/macros/s/test/exec'){
    const body=JSON.parse(options.body);
    assert.equal(body.action,'startProgramLibraryUpload');
    return new Response(JSON.stringify(context.startProgramLibraryUpload(body.data)),{status:200});
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
  scriptSecret='wrong-owner-secret-that-is-long-enough';
  await assert.rejects(()=>startLibraryUpload(env,details),/Invalid Library upload signature/);
}finally{globalThis.fetch=originalFetch;}
console.log('Program Library Apps Script identity, signed start, sealed ticket and chunked Drive upload passed.');
