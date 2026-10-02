import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';

const markup=await readFile(new URL('../../programs/library.html',import.meta.url),'utf8');
const source=await readFile(new URL('../../js/m4l-program-library.js',import.meta.url),'utf8');
const ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(match=>match[1]));
const elements=new Map(),storage=new Map(),requests=[];
function element(id){
  assert(ids.has(id),`Missing Library element ${id}`);
  if(!elements.has(id))elements.set(id,{hidden:false,open:false,disabled:false,value:'',textContent:'',innerHTML:'',dataset:{},listeners:{},classList:{toggle(){}},focus(){},click(){this.clicked=true;},removeAttribute(name){delete this[name];},showModal(){this.open=true;},close(){this.open=false;this.onclose?.();},addEventListener(type,fn){this.listeners[type]=fn;}});
  return elements.get(id);
}
const f=timetableFixture(),service=timetableService(f.repository,f.program);
f.repository.verifyResource=async row=>({id:row.DriveFileID});
f.repository.verifyLibraryRoot=async value=>({FolderID:value,Name:'Second Drive folder'});
const coordinator=timetableCoordinator(f.journal,async()=>({service,user:{accountid:'ADMIN'}}));
let failSave=false,lastUploadType='',lastUploadName='',multiChunkUpload=false,rateLimitedChunkOnce=false,destinationId='resources-folder-123';
class TestFile extends Blob { constructor(parts,name,options){super(parts,options);this.name=name;} }
const context={console,URL,URLSearchParams,structuredClone,crypto,File:TestFile,
  location:{search:`?program=${f.program.id}`},window:{M4L_CONFIG:{API_BASE:''}},document:{getElementById:element},
  localStorage:{getItem:()=> 'token'},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  fetch:async(url,options)=>{
    if(url.endsWith('/upload-chunk')){
      const offset=Number(options.headers['X-Library-Upload-Offset']);
      requests.push({action:'upload-chunk',offset,body:options.body});
      if(multiChunkUpload&&offset===0)return {ok:true,status:200,json:async()=>({success:true,complete:false,nextOffset:4194304})};
      if(rateLimitedChunkOnce&&offset===4194304){rateLimitedChunkOnce=false;return {ok:false,status:503,json:async()=>({success:false,code:'SHEETS_RATE_LIMITED',retryAfterMs:60000,error:'Google Sheets is temporarily limiting requests.'})};}
      return {ok:true,status:200,json:async()=>({success:true,complete:true,nextOffset:123,file:lastUploadType==='COVER'?(lastUploadName.startsWith('open-library-')?{id:'online-cover',name:lastUploadName,mimeType:'image/jpeg'}:{id:'uploaded-cover',name:'Device-cover.png',mimeType:'image/png'}):{id:'uploaded-pdf',name:'Device.pdf',mimeType:'application/pdf'}})};
    }
    const action=url.split('/').at(-1),body=JSON.parse(options.body);requests.push({action,body});
    if(action==='upload-start'){lastUploadType=body.resourceType;lastUploadName=body.fileName;return {ok:true,status:200,json:async()=>({success:true,ticket:'ticket',chunkSize:4194304})};}
    if(action==='cover-search')return {ok:true,status:200,json:async()=>({success:true,covers:[{coverId:'12345',title:'A Book',author:'An Author',year:2020,imageUrl:'https://covers.openlibrary.org/b/id/12345-M.jpg?default=false',sourceUrl:'https://openlibrary.org/works/OL123W'}]})};
    if(action==='cover-image')return {ok:true,status:200,blob:async()=>new Blob(['jpeg image'],{type:'image/jpeg'})};
    if(action==='browse')return {ok:true,status:200,json:async()=>({success:true,folder:{id:body.folderId||destinationId,name:'Resources'},breadcrumbs:[{id:destinationId,name:'Resources'}],items:[{id:'file-pdf',name:'Lesson.pdf',mimeType:'application/pdf',isFolder:false,supportedTypes:['EBOOK'],format:'PDF'},{id:'cover-png',name:'Cover.png',mimeType:'image/png',isFolder:false,supportedTypes:['OTHER'],format:'PNG'},{id:'folder-one',name:'Folder one',isFolder:true,supportedTypes:[],format:''}],nextPageToken:''})};
    if(action==='save'&&failSave){failSave=false;throw new Error('Offline');}
    if(action==='folder-set'){destinationId='new-resources-folder-123';return {ok:true,status:200,json:async()=>({success:true,folder:{id:destinationId,name:'New Resources'}})};}
    try{
      const result=['save','recover'].includes(action)?await coordinator.run(action==='save'?'manage-save':action,body,'token'):await service.read(action==='manage'?'manage-get':action,body);
      return {ok:true,status:200,json:async()=>({success:true,coordinatorAvailable:true,canManageFolder:true,destinationId,...result})};
    }catch(error){return {ok:false,status:error.status||503,json:async()=>({success:false,error:error.message,code:error.code})};}
  }
};
const settled=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setTimeout(resolve,1));};
vm.runInNewContext(source,context);await settled();
assert.equal(element('pl-add-device').disabled,false);
assert.equal(element('pl-add-drive').disabled,false);
element('pl-add-drive').onclick();await settled();
assert.equal(element('pl-drive').open,true,'The top Library Drive action opens the Resources finder as a modal dialog');
element('pl-drive').onclick({target:{closest:selector=>selector==='[data-folder]'?{dataset:{folder:'folder-one'}}:null}});await settled();
assert.equal(requests.filter(row=>row.action==='browse').at(-1).body.folderId,'folder-one');
element('pl-drive').onclick({target:{closest:selector=>selector==='[data-file]'?{dataset:{file:'file-pdf'}}:null}});
assert.equal(element('pl-name').value,'Lesson');
assert.equal(element('pl-drive').open,false,'Choosing a file closes the finder');
element('pl-subject').onchange({target:{value:'PS-TAFSEER'}});
element('pl-type').listeners.change({target:{value:'AUDIO'}});
assert.match(element('pl-file').textContent,/No file selected/);
element('pl-type').listeners.change({target:{value:'EBOOK'}});
element('pl-browse').onclick();await settled();
element('pl-drive').onclick({target:{closest:selector=>selector==='[data-file]'?{dataset:{file:'file-pdf'}}:null}});
failSave=true;element('pl-save').onclick();await settled();
assert.equal(element('pl-pending').hidden,false);
const pendingKey=`m4l-program-library-pending:${f.program.id}`,draftKey=`m4l-program-library-draft:${f.program.id}`;
const operation=JSON.parse(storage.get(pendingKey)).body.operationId;
storage.delete(draftKey);
vm.runInNewContext(source,context);await settled();
assert.equal(element('pl-editor').hidden,false,'A pending resource restores the editor without a separate draft');
element('pl-retry').onclick();await settled();
assert.equal((await service.read('manage-get')).rows.resources.length,1);
assert.equal(requests.filter(row=>row.action==='save').at(-1).body.operationId,operation);
assert.equal(storage.has(pendingKey),false);
assert.equal(element('pl-pending').hidden,true);
element('pl-add-drive').onclick();await settled();
element('pl-drive-cancel').onclick();
element('pl-folder-input').value='new-resources-folder-123';
element('pl-folder-save').onclick();await settled();
assert.equal(destinationId,'new-resources-folder-123');
assert.match(element('pl-destination').textContent,/new-resources-folder-123/);
assert.equal(element('pl-drive').open,false);
element('pl-add-device').onclick();
assert.equal(element('pl-device-file').clicked,true,'The top device action opens the native file picker');
assert.match(element('pl-device-file').accept,/audio\/\*/,'The first picker allows files from every Library category');
element('pl-device-file').onchange({target:{files:[{name:'Device.pdf',type:'application/pdf',size:123,slice:()=>new Blob(['PDF'])}],value:'Device.pdf'}});await settled();
assert.equal(element('pl-drive').open,true,'Device file selection opens the Drive destination dialog');
assert.match(element('pl-drive-title').textContent,/Upload to Resources/);
assert.equal(element('pl-drive-type').value,'EBOOK','The upload dialog offers a resource category');
element('pl-drive-type').onchange({target:{value:'PRINTABLE'}});
assert.equal(element('pl-type').value,'PRINTABLE','The category can be chosen before upload');
element('pl-drive-type').onchange({target:{value:'EBOOK'}});
element('pl-upload').onclick();await settled();
assert.equal(element('pl-drive').open,false,'Successful device upload closes the destination dialog');
assert.match(element('pl-file').textContent,/Device.pdf/);
assert.equal(element('pl-save').disabled,false,'Saving is enabled after the device upload finishes');
assert.equal(JSON.parse(storage.get(draftKey)).record.DriveFileID,'uploaded-pdf');
assert.equal(requests.filter(row=>row.action==='upload-start').at(-1).body.resourceType,'EBOOK');
element('pl-author').listeners.input({target:{value:'A. Author'}});
element('pl-publisher').listeners.input({target:{value:'A Publisher'}});
element('pl-isbn').listeners.input({target:{value:'978-1-23456-789-0'}});
element('pl-year').listeners.input({target:{value:'2025'}});
element('pl-cover-browse').onclick();await settled();
element('pl-drive').onclick({target:{closest:selector=>selector==='[data-file]'?{dataset:{file:'cover-png'}}:null}});
assert.equal(JSON.parse(storage.get(draftKey)).record.CoverDriveFileID,'cover-png');
assert.equal(JSON.parse(storage.get(draftKey)).record.Author,'A. Author');
element('pl-cover-device').onclick();assert.equal(element('pl-cover-device-file').clicked,true);
element('pl-cover-device-file').onchange({target:{files:[{name:'Device-cover.png',type:'image/png',size:12,slice:()=>new Blob(['image'])}],value:'Device-cover.png'}});await settled();
element('pl-upload').onclick();await settled();
assert.equal(requests.filter(row=>row.action==='upload-start').at(-1).body.resourceType,'COVER');
assert.equal(JSON.parse(storage.get(draftKey)).record.CoverDriveFileID,'uploaded-cover');
assert.equal(element('pl-save').disabled,false,'Saving is enabled after a cover upload finishes');
element('pl-cover-online').onclick();
assert.equal(element('pl-cover-search').open,true,'Online cover search opens a centered dialog');
assert.equal(element('pl-cover-query').value,'978-1-23456-789-0','The book ISBN starts the manual search');
element('pl-cover-search-form').onsubmit({preventDefault(){}});await settled();
assert.equal(requests.filter(row=>row.action==='cover-search').at(-1).body.query,'978-1-23456-789-0');
assert.match(element('pl-cover-results').innerHTML,/Use this cover/);
element('pl-cover-results').onclick({target:{closest:selector=>selector==='[data-cover-id]'?{dataset:{coverId:'12345'}}:null}});await settled();
assert.equal(element('pl-cover-search').open,false);
assert.equal(element('pl-drive').open,true,'The selected online image enters the normal Resources upload flow');
element('pl-upload').onclick();await settled();
assert.equal(requests.filter(row=>row.action==='upload-start').at(-1).body.fileName,'open-library-cover-12345.jpg');
assert.equal(JSON.parse(storage.get(draftKey)).record.CoverDriveFileID,'online-cover','The online image is saved to Drive as a cover');
multiChunkUpload=true;rateLimitedChunkOnce=true;
const startsBeforeResume=requests.filter(row=>row.action==='upload-start').length;
const chunksBeforeResume=requests.filter(row=>row.action==='upload-chunk').length;
element('pl-device').onclick();
element('pl-device-file').onchange({target:{files:[{name:'Large.pdf',type:'application/pdf',size:4194314,slice:()=>new Blob(['PDF'])}],value:'Large.pdf'}});await settled();
element('pl-upload').onclick();await settled();
assert.equal(element('pl-drive').open,true,'A rate limit keeps the destination dialog and file open');
assert.match(element('pl-drive-status').textContent,/continue from 99%/);
assert.equal(requests.filter(row=>row.action==='upload-start').length,startsBeforeResume+1);
assert.deepEqual(requests.filter(row=>row.action==='upload-chunk').slice(chunksBeforeResume).map(row=>row.offset),[0,4194304]);
element('pl-upload').onclick();await settled();
assert.equal(element('pl-drive').open,false,'Retrying the final chunk completes the upload');
assert.equal(element('pl-save').disabled,false,'Saving is enabled after a resumed upload finishes');
assert.equal(requests.filter(row=>row.action==='upload-start').length,startsBeforeResume+1,'Retry keeps the original Drive upload session');
assert.deepEqual(requests.filter(row=>row.action==='upload-chunk').slice(chunksBeforeResume).map(row=>row.offset),[0,4194304,4194304]);
element('pl-browse').onclick();await settled();
element('pl-drive').onclick({target:{closest:selector=>selector==='[data-file]'?{dataset:{file:'file-pdf'}}:null}});
assert.equal(JSON.parse(storage.get(draftKey)).record.DriveFileID,'file-pdf','An existing Resources file can be selected without copying');
assert.equal(element('pl-drive').open,false);
assert.equal(requests.some(row=>row.action==='copy'),false,'The shared-link copy action is absent');
element('pl-cancel').onclick();
element('pl-add-device').onclick();
element('pl-device-file').onchange({target:{files:[{name:'Lesson.mp3',type:'audio/mpeg',size:12,slice:()=>new Blob(['audio'])}],value:'Lesson.mp3'}});await settled();
assert.equal(element('pl-type').value,'AUDIO','A selected audio file sets the matching category');
assert.equal(element('pl-drive-type').value,'AUDIO');
element('pl-drive-cancel').onclick();
console.log('Program Library UI: centered Drive finder, admin Resources folder, device upload, book details, cover selection and retry recovery passed.');
