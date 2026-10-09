import { callAppsScript } from './apps-script.js';

const encoder=new TextEncoder();
const decoder=new TextDecoder();
const CHUNK_SIZE=4*1024*1024;
const TICKET_LIFETIME=2*60*60*1000;

function secret(env){
  const value=String(env.M4L_LIBRARY_BRIDGE_SECRET||'').trim();
  if(value.length<32)throw new Error('Library device upload needs its shared Apps Script secret configured.');
  return value;
}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unbase64url(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),character=>character.charCodeAt(0));}
async function key(env,purpose,algorithm,usage){
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(`${purpose}:${secret(env)}`));
  return crypto.subtle.importKey('raw',digest,algorithm,false,usage);
}
function validSessionUrl(value){
  try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='www.googleapis.com'&&url.pathname==='/upload/drive/v3/files'&&url.searchParams.has('upload_id');}
  catch{return false;}
}
export async function startLibraryUpload(env,details){
  const payload=base64url(encoder.encode(JSON.stringify({purpose:details.authorityStore==='D1'?'m4l-library-start-d1':'m4l-library-start',issuedAt:Date.now(),nonce:crypto.randomUUID(),folderId:details.folderId,fileName:details.fileName,mimeType:details.mimeType,size:details.size})));
  const hmac=await crypto.subtle.importKey('raw',encoder.encode(`apps-script-library-start:${secret(env)}`),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=base64url(new Uint8Array(await crypto.subtle.sign('HMAC',hmac,encoder.encode(payload))));
  const result=await callAppsScript(env,{action:'startProgramLibraryUpload',data:{payload,signature}});
  if(!result?.success)throw new Error(result?.error||'The Library Drive account could not start the upload.');
  if(!validSessionUrl(result.sessionUrl))throw new Error('The Library Drive account returned an invalid upload session.');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const aes=await key(env,'worker-library-ticket',{name:'AES-GCM'},['encrypt']);
  const ticket={...details,accountId:details.accountId,programId:details.programId,sessionUrl:result.sessionUrl,expiresAt:Date.now()+TICKET_LIFETIME};
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,encoder.encode(JSON.stringify(ticket))));
  return {ticket:`${base64url(iv)}.${base64url(ciphertext)}`,chunkSize:CHUNK_SIZE};
}
export async function openLibraryUploadTicket(env,value){
  try{
    const parts=String(value||'').split('.');if(parts.length!==2)return null;
    const iv=unbase64url(parts[0]),ciphertext=unbase64url(parts[1]);if(iv.length!==12)return null;
    const aes=await key(env,'worker-library-ticket',{name:'AES-GCM'},['decrypt']);
    const ticket=JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},aes,ciphertext)));
    return ticket.expiresAt>Date.now()&&validSessionUrl(ticket.sessionUrl)?ticket:null;
  }catch{return null;}
}
export async function forwardLibraryUploadChunk(ticket,offset,bytes){
  const end=offset+bytes.byteLength-1;
  const response=await fetch(ticket.sessionUrl,{method:'PUT',redirect:'manual',headers:{'Content-Type':ticket.mimeType,'Content-Range':`bytes ${offset}-${end}/${ticket.size}`},body:bytes});
  if(response.status===308){
    const range=response.headers.get('Range')||'';
    const matched=/^bytes=0-(\d+)$/.exec(range);
    return {complete:false,nextOffset:matched?Number(matched[1])+1:0};
  }
  if(!response.ok)throw new Error(`Google Drive rejected the upload chunk (${response.status}).`);
  let file;try{file=await response.json();}catch{throw new Error('Google Drive did not confirm the uploaded file.');}
  if(!/^[A-Za-z0-9_-]+$/.test(String(file.id||'')))throw new Error('Google Drive did not return a file ID.');
  return {complete:true,nextOffset:ticket.size,file:{id:file.id,name:file.name||ticket.fileName,mimeType:file.mimeType||ticket.mimeType}};
}
export const LIBRARY_UPLOAD_CHUNK_SIZE=CHUNK_SIZE;
