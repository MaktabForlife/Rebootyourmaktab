import { programFailure } from '../src/programs/errors.js';
import { profileRepository } from '../src/profiles/repository.js';
import { profileService } from '../src/profiles/service.js';
import { profileUser } from '../src/routes/user-profiles.js';
import { academySubjectRepository, academySubjectService } from '../src/programs/academy-subjects.js';
import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableRepository } from '../src/programs/timetable-repository.js';
import { timetableProgram,timetableUser } from '../src/programs/timetable-context.js';
import { createRequestEnvironment } from '../src/lib/request-context.js';
import { TIMETABLE_HEADERS } from '../src/programs/timetable-model.js';
import { readWeeklyDraft } from '../src/programs/weekly-timetable.js';
import { timetableFixture } from '../../scripts/program-timetable-fixtures.mjs';
import assert from "node:assert/strict";
import nodeWorker from "../src/worker.js";
let worker=nodeWorker;
let runtime;
const useRuntime=process.env.M4L_RUNTIME_BUNDLE || process.argv[2];
import { createSaltedPinHash, createSessionToken } from "../src/lib/auth.js";
import { PLATFORM_SHEET_HEADERS } from "../src/lib/platform-schema.js";
import { DEFINITION_HEADERS, IDENTITY_HEADERS, PROGRAM_SCHEMA } from "../src/programs/model.js";
import { resolveActiveCourseRegistration } from "../src/lib/platform-sheet.js";

const platformId = "test-platform-programs";
const targetId = "test-aalimiya-programs";
const legacyId = "test-reboot-programs";
const books = new Map();
function book(id, tables) {
  books.set(id, Object.entries(tables).map(([title, rows], sheetId) => ({ title, sheetId, rows: structuredClone(rows) })));
}
const hash = await createSaltedPinHash("2468", "program-pin-secret");
book(platformId, {
  CourseRegistry: [PLATFORM_SHEET_HEADERS.CourseRegistry, ["REBOOT", "Reboot", legacyId, true, "104.5.4"]],
  UserAccounts: [PLATFORM_SHEET_HEADERS.UserAccounts, ["ACCOUNT1", "Platform Admin", "ADMIN-LINK", true, hash, true, "", "", "", "", "", "", "", "GLOBAL_ADMIN"]],
  UserCourseAccess: [PLATFORM_SHEET_HEADERS.UserCourseAccess],
  PlatformAuditLog: [PLATFORM_SHEET_HEADERS.PlatformAuditLog]
});
book(targetId, { Setup: [["Development only"]] });
book(legacyId, { SubjectList:[['SubjectID','SubjectName','Active'],['REBOOT-AR','Arabic',true],['REBOOT-TF','Tafseer',true],['REBOOT-DUP','  ARABIC  ',true],['REBOOT-OLD','Old subject',false]], StudentRecords: [["Legacy records must remain unchanged"]] });
books.get(platformId).find(sheet => sheet.title === "UserAccounts").rows.push(["ACCOUNT2", "Local Admin", "LOCAL-LINK", true, hash, true]);
books.get(platformId).find(sheet => sheet.title === "UserCourseAccess").rows.push(["ACCESS2", "ACCOUNT2", "REBOOT", "ADMIN", true, true, "", "", "", "", "", "", "", "LOCAL-ADMIN"]);
const table = (id, title) => books.get(id).find(sheet => sheet.title === title).rows;
const originalLegacy = structuredClone(books.get(legacyId));
const originalRegistryRow = structuredClone(table(platformId, "CourseRegistry")[1]);
const keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
const env = { PLATFORM_SPREADSHEET_ID: platformId, GOOGLE_SPREADSHEET_ID: legacyId, SESSION_SECRET: "program-session-secret", M4L_GOOGLE_DRIVE_ROOT_FOLDER_ID:'library-root',
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type:"service_account", client_email:"program-test@example.iam.gserviceaccount.com", private_key_id:"program-test-key", private_key:`-----BEGIN PRIVATE KEY-----\n${Buffer.from(privateBytes).toString("base64")}\n-----END PRIVATE KEY-----` }) };
const token = await createSessionToken({ type:"account", accountid:"ACCOUNT1", uniqueid:"ADMIN-LINK", username:"Platform Admin", role:"GLOBAL_ADMIN", scope:"PLATFORM", authrow:2, credentialHash:hash }, env);
const centralAdminToken = await createSessionToken({ type:"account", accountid:"ACCOUNT2", uniqueid:"LOCAL-LINK", role:"ADMIN", scope:"COURSE", authrow:3, credentialHash:hash, accessrow:2, accessid:"ACCESS2", courseid:"REBOOT", courserecordid:"LOCAL-ADMIN" }, env);
const legacyToken = await createSessionToken({ type:"admin", role:"ADMIN" }, env);
const studentToken = await createSessionToken({ type:"student", role:"STUDENT" }, env);
let writes = 0;
let reads = 0;
let failWrite = false;
let loseResponse = false;
let denyTarget = false;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const parsed = new URL(url);
  const result = value => new Response(JSON.stringify(value), { status:200 });
  if (parsed.hostname === "oauth2.googleapis.com") return result({ access_token:"program-test-access", expires_in:3600 });
  if (parsed.hostname === 'www.googleapis.com' && parsed.pathname.startsWith('/drive/v3/files')) {
    const files={
      'library-root':{id:'library-root',name:'Protected root',mimeType:'application/vnd.google-apps.folder',parents:[]},
      'library-pdf':{id:'library-pdf',name:'Lesson.pdf',mimeType:'application/pdf',parents:['library-root'],capabilities:{canDownload:true}},
      'outside-folder':{id:'outside-folder',name:'Outside',mimeType:'application/vnd.google-apps.folder',parents:[]}
    };
    if(parsed.pathname==='/drive/v3/files')return result({files:[files['library-pdf']],nextPageToken:''});
    const file=files[decodeURIComponent(parsed.pathname.split('/').at(-1))];
    return file?result(file):new Response(JSON.stringify({error:{message:'Missing file'}}),{status:404});
  }
  assert.equal(parsed.hostname, "sheets.googleapis.com");
  const match = /^\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(parsed.pathname);
  const [, id, suffix] = match;
  if (!books.has(id) || (denyTarget && id === targetId)) return new Response(JSON.stringify({ error:{ message:"Test access denied" } }), { status:403 });
  const sheets = books.get(id);
  if (!init.method || init.method === "GET") reads++;
  const rangeValues = range => {
    const [title, span] = range.replaceAll("'", "").split("!");
    const values = sheets.find(sheet => sheet.title === title)?.rows;
    assert.ok(values, `Unexpected missing range ${range}`);
    const rowMatch = /[A-Z]+(\d+):[A-Z]+(\d+)/.exec(span);
    return structuredClone(rowMatch ? values.slice(Number(rowMatch[1]) - 1, Number(rowMatch[2])) : values);
  };
  if (suffix === "") return result({ sheets:sheets.map(({ sheetId, title, tables }) => ({ properties:{ sheetId,title },tables })) });
  if (suffix.startsWith("/values/")) return result({ values:rangeValues(decodeURIComponent(suffix.slice(8))) });
  if (suffix === "/values:batchGet") return result({ valueRanges:parsed.searchParams.getAll("ranges").map(range => ({ values:rangeValues(range) })) });
  assert.equal(suffix, ":batchUpdate");
  writes++;
  if (failWrite) { failWrite = false; return new Response(JSON.stringify({ error:{ message:"Injected write failure" } }), { status:500 }); }
  const next = structuredClone(sheets);
  for (const request of JSON.parse(init.body).requests) {
    if (request.appendDimension) continue;
    if (request.updateTable){const updated=request.updateTable.table;const sheet=next.find(s=>s.tables?.some(t=>t.tableId===updated.tableId));Object.assign(sheet.tables.find(t=>t.tableId===updated.tableId),updated);continue;}
    if (request.addSheet) {
      const { sheetId, title } = request.addSheet.properties;
      assert.ok(!next.some(sheet => sheet.sheetId === sheetId || sheet.title === title));
      next.push({ sheetId,title,rows:[] }); continue;
    }
    const update = request.updateCells || request.appendCells;
    const target = next.find(sheet => sheet.sheetId === (update.sheetId ?? update.start.sheetId));
    assert.ok(target);
    const rows = update.rows.map(row => row.values.map(cell => Object.values(cell.userEnteredValue)[0]));
    if (request.appendCells) target.rows.push(...rows);
    else rows.forEach((row, i) => {
      const existing=target.rows[update.start.rowIndex+i] ||= [];
      row.forEach((cell,j)=>{existing[(update.start.columnIndex||0)+j]=cell;});
    });
  }
  books.set(id, next);
  if (loseResponse) { loseResponse = false; throw new Error("Connection closed after successful commit"); }
  return result({ replies:[] });
};
async function call(action, body = {}, auth = token, expected = 200, method = "POST") {
  const response = await worker.fetch(new Request(`https://worker.test/api/admin/platform/programs/${action}`, {
    method, headers: { "Content-Type":"application/json", ...(auth ? { Authorization:`Bearer ${auth}` } : {}) },
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {})
  }), env);
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return result;
}

if (useRuntime) {
  const { Miniflare, convertV4MiniflareOptions, Response:RuntimeResponse }=await import('miniflare');
  runtime=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:useRuntime,modulesRoot:(await import('node:path')).dirname(useRuntime),compatibilityDate:'2026-06-01',bindings:env,
    durableObjects:{PROGRAM_TIMETABLE_COORDINATOR:{className:'ProgramTimetableCoordinator',useSQLite:true}},
    outboundService:async request=>{const response=await globalThis.fetch(request.url,{method:request.method,headers:request.headers,...(request.method==='GET'?{}:{body:await request.text()})});return new RuntimeResponse(await response.text(),{status:response.status,headers:Object.fromEntries(response.headers)});}}));
  await runtime.ready;
  worker={fetch:async request=>runtime.dispatchFetch(request.url,{method:request.method,headers:Object.fromEntries(request.headers),...(request.method==='GET'?{}:{body:await request.text()})})};
}
const f=timetableFixture();f.draft=readWeeklyDraft(f.draft).draft;
const input={id:f.program.id,name:'Aalimiya',spreadsheetId:targetId,durationYears:4,timezone:'Africa/Johannesburg',status:'DRAFT'};
const journals=new Map(),coordinators=new Map(),names=[];
const binding={getByName(name){names.push(name);if(!coordinators.has(name)){
 const journal={get:async()=>journals.get(name)||null,set:async p=>journals.set(name,structuredClone(p)),clear:async()=>journals.delete(name)};
 coordinators.set(name,timetableCoordinator(journal,async(id,authorization)=>{
  const fresh=createRequestEnvironment(env),request=new Request('https://test.invalid',{headers:{Authorization:authorization}});
  if(name.endsWith(':user-profiles'))return {user:await profileUser(request,fresh),service:profileService(profileRepository(fresh))};
  const user=await timetableUser(request,fresh);
  if(name.endsWith(':academy-subjects'))return {user,service:academySubjectService(academySubjectRepository(fresh))};
  const program=await timetableProgram(fresh,id);return {user,service:timetableService(timetableRepository(fresh,program),program)};
 }));}
 return {async profilesRun(action,body,auth){return this.run(action,body,auth);},async catalogRun(action,body,auth){return this.run(action,body,auth);},async run(action,body,auth){try{return {success:true,...await coordinators.get(name).run(action,body,auth)};}catch(e){return programFailure(e,action,'test-coordinator');}}};
}};
async function tt(action,body={},auth=token,expected=200,method='POST'){
 const response=await worker.fetch(new Request(`https://worker.test/api/admin/platform/program-timetable/${action}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify({id:input.id,...body})}:{})}),env);
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));assert.equal(response.headers.get('Cache-Control'),'no-store');return result;
}
async function library(action,body={},auth=token,expected=200,method='POST'){
 const response=await worker.fetch(new Request(`https://worker.test/api/admin/platform/program-library/${action}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(method==='POST'?{body:JSON.stringify({id:input.id,...body})}:{})}),env);
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));assert.equal(response.headers.get('Cache-Control'),'no-store');return result;
}
async function academy(action,body={},auth=token,expected=200){
 const response=await worker.fetch(new Request(`https://worker.test/api/admin/platform/academy-subjects/${action}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify(body)}),env);
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;
}
const change=(revision,draft=f.draft)=>({revision,draft:structuredClone(draft),operationId:crypto.randomUUID()});
async function profiles(action,body={},auth=token,expected=200){
 const response=await worker.fetch(new Request(`https://worker.test/api/admin/platform/user-profiles/${action}`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:typeof body==='string'?body:JSON.stringify(body)}),env);
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));assert.equal(response.headers.get('Cache-Control'),'no-store');return result;
}
try{
 for(const action of ['get','prepare','prepare-library','save','validate','preview','publish','published','history','recover','manage-get','manage-save']){
  for(const auth of [legacyToken,studentToken,centralAdminToken])await tt(action,{},auth,403);
  await tt(action,{},'',401);
 }
 for(const action of ['browse','access']){
  for(const auth of [legacyToken,studentToken,centralAdminToken])await library(action,{},auth,403);
  await library(action,{},'',401);
 }
 assert.equal(writes,0);
 await tt('get',{},token,405,'GET');await tt('get','bad',token,400);await tt('save','x'.repeat(65537),token,413);await tt('get',{id:'REBOOT'},token,400);
 await call('create',input);await call('prepare',{id:input.id});
 books.get(platformId).push({title:'GlobalSubjectList',sheetId:20,rows:[PLATFORM_SHEET_HEADERS.GlobalSubjectList,['TAFSEER','Tafseer',true]]});
 let loaded=await tt('get');assert.equal(loaded.prepared,false);assert.equal(loaded.coordinatorAvailable,Boolean(useRuntime));
 if(!useRuntime)await tt('prepare',{},token,503);env.PROGRAM_TIMETABLE_COORDINATOR=binding;
 loseResponse=true;await tt('prepare',{},token,503);if(!useRuntime)assert.equal(journals.size,1);
 await tt('recover');assert.equal(journals.size,0);const before=writes;await tt('prepare');assert.equal(writes,before,'Preparation is idempotent');
 // Existing prepared Programs can add the two V105.4 tables without rewriting curriculum.
 books.set(targetId,books.get(targetId).filter(sheet=>!['ProgramTasks','ProgramResources'].includes(sheet.title)));
 let libraryView=await tt('manage-get');assert.equal(libraryView.prepared,true);assert.equal(libraryView.libraryPrepared,false);
 await tt('prepare-library');libraryView=await tt('manage-get');assert.equal(libraryView.libraryPrepared,true);
 const libraryWrites=writes;await tt('prepare-library');assert.equal(writes,libraryWrites,'Library preparation is idempotent');
 for(const [name,rows] of Object.entries({ProgramSubjects:[['PS-TAFSEER',input.id,'TAFSEER',true]],ProgramModules:[['MOD-DEMO','PS-TAFSEER','','Demo module',1,true]],ProgramClasses:[['CLASS-1',input.id,'Year 1','2026',true],['CLASS-2',input.id,'Year 2','2026',true]]}))table(targetId,name).push(...rows);
 const libraryFiles=await library('browse');assert.equal(libraryFiles.items[0].name,'Lesson.pdf');assert(libraryFiles.items[0].supportedTypes.includes('EBOOK'));
 await library('browse',{folderId:'outside-folder'},token,400);
 table(targetId,'ProgramResources').push(['RES-PREVIEW',input.id,'PS-TAFSEER','','MOD-DEMO','','EBOOK','Lesson','', 'library-pdf',true]);
 const preview=await library('access',{resourceId:'RES-PREVIEW'});assert.match(preview.url,/\/api\/library\/drive\/file\/library-pdf\?access=/);
 table(targetId,'ProgramResources').pop();
 await library('access',{resourceId:'RES-PREVIEW'},token,404);
 table(platformId,'UserAccounts').push(['TEACHER-1','Demo Teacher','TEACHER-LINK',false,'',true]);
 table(platformId,'UserCourseAccess').push(['ACCESS-TEACHER','TEACHER-1',input.id,'TEACHER',true]);
 loaded=await tt('get');assert.equal(loaded.prepared,true);assert.equal(loaded.catalog.modules.length,1);assert.equal(loaded.catalog.teachers.length,1);
 assert((await tt('preview',{draft:f.draft})).valid);
 const noSharedZoom=structuredClone(f.draft);noSharedZoom.rules[0].zoomLink='';assert.equal((await tt('preview',{draft:noSharedZoom})).valid,false);
 let saved=await tt('save',change(''));assert.equal(table(targetId,'ProgramTimetableState').length,2);assert.equal(table(targetId,'ProgramTimetablePublications').length,1);
 const publishInput=change(saved.revision);let pub=await tt('publish',publishInput);assert.equal(pub.version,1);assert.equal(table(targetId,'ProgramTimetableState').length,3);
 assert((await tt('publish',publishInput)).replayed);assert.equal(table(targetId,'ProgramTimetablePublications').length,2);
 assert.equal((await tt('history')).publications[0].occurrences.length,2);
 await tt('save',change(saved.revision),token,409);
 // Canonical ID selects the same coordinator regardless of request casing.
 await tt('prepare',{id:input.id.toLowerCase()});if(!useRuntime)assert.equal(new Set(names).size,1);
 const another=change(pub.revision);loseResponse=true;await tt('publish',another,token,503);assert.equal(table(targetId,'ProgramTimetablePublications').length,3);
 const beforeRecovery=writes;const recovered=await tt('recover');assert.equal(recovered.version,2);assert.equal(writes,beforeRecovery);assert.equal(journals.size,0);
 // Refuse duplicate headers/IDs and changed identity without writes.
 table(targetId,'ProgramModules').push([...table(targetId,'ProgramModules')[1]]);await tt('get',{},token,409);table(targetId,'ProgramModules').pop();
 table(targetId,'ProgramIdentity')[1][0]='OTHER';await tt('get',{},token,409);table(targetId,'ProgramIdentity')[1][0]=input.id;
 // Teacher authority removed since preview blocks publication.
 table(platformId,'UserCourseAccess').at(-1)[4]=false;await tt('publish',change(recovered.revision),token,409);table(platformId,'UserCourseAccess').at(-1)[4]=true;
 table(platformId,'UserAccounts')[1][13]='';await tt('get',{},token,401);table(platformId,'UserAccounts')[1][13]='GLOBAL_ADMIN';
 const attempts=[change(recovered.revision),change(recovered.revision)];
 const simultaneous=await Promise.all(attempts.map(body=>worker.fetch(new Request('https://worker.test/api/admin/platform/program-timetable/publish',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({id:input.id,...body})}),env)));
 assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
 assert.equal(table(targetId,'ProgramTimetablePublications').length,4);
 // Management rows flow through the same authorised coordinator as publication.
 let management=await tt('manage-get');
 const combinedReadStart=reads,combined=await tt('manage-get',{includeOverview:true}),combinedReads=reads-combinedReadStart;
 assert(combined.overview.timetable.draft);assert(combined.overview.preview);
 const separateReadStart=reads;await tt('manage-get');await tt('get');await tt('preview',{draft:f.draft});
 const separateReads=reads-separateReadStart;assert(combinedReads<separateReads,'Overview must reduce upstream reads');
 assert(combinedReads<=9,'Combined management refresh must stay within its measured read budget');
 denyTarget=true;const inaccessible=await tt('manage-get',{},token,503);denyTarget=false;
 assert.equal(inaccessible.code,'SHEETS_ACCESS_FAILED');assert.equal(inaccessible.retryable,false);assert(inaccessible.reference);
 console.log(`Management read budget: ${combinedReads} combined versus ${separateReads} separate reads.`);
 assert.equal(management.rows.modules[0].Name,'Demo module');
 assert(!JSON.stringify(management.accounts).includes('PINHash'));
 const edit=(kind,record,creating=true)=>({kind,record,creating,revision:management.revision,referenceRevision:management.referenceRevision,operationId:crypto.randomUUID()});
 const saveRow=async(kind,record,creating=true)=>{const result=await tt('manage-save',edit(kind,record,creating));management=await tt('manage-get');assert(Object.values(management.rowRevisions[kind]).includes(result.rowRevision),'Save acknowledgement includes the committed row revision');return result;};
 await saveRow('classes',{ClassID:'CLS-TEST',Name:'Evening class',AcademicYear:'2026',ZoomLink:'https://zoom.us/j/777?pwd=class',Active:true});
 assert.equal((await tt('get')).catalog.classes.find(r=>r.id==='CLS-TEST').zoomLink,'https://zoom.us/j/777?pwd=class');
 await tt('manage-save',edit('classes',{ClassID:'CLS-UNSAFE',Name:'Invalid link',ZoomLink:'javascript:alert(1)',Active:true}),token,400);
 assert((await tt('get')).catalog.classes.some(r=>r.id==='CLS-TEST'));
 const stale=edit('classes',{ClassID:'CLS-STALE',Name:'Stale',Active:true});
 await saveRow('levels',{LevelID:'LVL-TEST',ProgramSubjectID:'PS-TAFSEER',Name:'Beginner',SortOrder:1,Active:true});
 await tt('manage-save',stale,token,409);
 // New clients compare the actual row, so unrelated edits no longer block additions.
 const independent={...stale,operationId:crypto.randomUUID(),baseRowRevision:management.emptyRowRevision};
 await tt('manage-save',independent);
 management=await tt('manage-get');
 const sameRow={...edit('classes',{ClassID:'CLS-STALE',Name:'My class edit',Active:true},false),baseRowRevision:management.rowRevisions.classes['CLS-STALE']};
 await saveRow('classes',{ClassID:'CLS-STALE',Name:'Other class edit',Active:true},false);
 const rowConflict=await tt('manage-save',sameRow,token,409);
 assert.equal(rowConflict.code,'ROW_CHANGED');assert.equal(rowConflict.currentRecord.Name,'Other class edit');assert(rowConflict.rowRevision);

 await saveRow('modules',{ProgramModuleID:'MOD-TEST',ProgramSubjectID:'PS-TAFSEER',LevelID:'',Name:'No level module',SortOrder:2,Active:true});
 await tt('manage-save',edit('modules',{ProgramModuleID:'MOD-WRONG',ProgramSubjectID:'PS-TAFSEER',LevelID:'MISSING',Name:'Wrong level',Active:true}),token,400);
 await saveRow('modules',{ProgramModuleID:'MOD-LEVEL',ProgramSubjectID:'PS-TAFSEER',LevelID:'LVL-TEST',Name:'Level module',SortOrder:3,Active:true});
 await tt('manage-save',edit('levels',{LevelID:'LVL-TEST',ProgramSubjectID:'PS-TAFSEER',Name:'Beginner',SortOrder:1,Active:false},false),token,400);
 const standard=await saveRow('modules',{ProgramModuleID:'MOD-STANDARD',ProgramSubjectID:'PS-TAFSEER',LevelID:'standard:Advanced',Name:'Advanced module',SortOrder:4,Active:true});
 assert.equal(standard.level.Name,'Advanced');assert.equal(standard.level.LevelID,standard.record.LevelID);
 assert(management.rows.levels.some(l=>l.LevelID===standard.level.LevelID));
 // Assign an existing account without mutating any central privileges.
 // An Admin role in another program and platform administration alone are not teaching grants here.
 await tt('manage-save',edit('teachers',{AccountID:'ACCOUNT2',Active:true}),token,400);
 await tt('manage-save',edit('teachers',{AccountID:'ACCOUNT1',Active:true}),token,400);
 table(platformId,'UserCourseAccess').push(['ACCESS-PROGRAM-TEACHER','ACCOUNT2',input.id,'TEACHER',true]);
 management=await tt('manage-get');assert(management.eligibleTeacherIds.includes('ACCOUNT2'));
 assert.deepEqual(management.accounts.find(a=>a.AccountID==='ACCOUNT2').Roles,['TEACHER']);
 assert(!management.accounts.find(a=>a.AccountID==='ACCOUNT1').Roles.includes('ADMIN'),'Platform administration is not a program role');
 const centralAccessBefore=structuredClone(table(platformId,'UserCourseAccess'));
 await saveRow('teachers',{AccountID:'ACCOUNT2',Active:true});
 assert((await tt('get')).catalog.teachers.some(r=>r.id==='ACCOUNT2'));
 table(platformId,'UserCourseAccess').at(-1)[4]=false;
 assert(!(await tt('get')).catalog.teachers.some(r=>r.id==='ACCOUNT2'),'Explicit assignment cannot override a revoked program role');
 table(platformId,'UserCourseAccess').at(-1)[4]=true;
 assert.deepEqual(table(platformId,'UserCourseAccess'),centralAccessBefore);
 await saveRow('enrollments',{EnrollmentID:'ENR-TEST',ClassID:'CLS-TEST',AccountID:'ACCOUNT2',StartDate:'2026-09-01',EndDate:'',Active:true});
 await tt('manage-save',edit('enrollments',{EnrollmentID:'ENR-OVERLAP',ClassID:'CLS-TEST',AccountID:'ACCOUNT2',StartDate:'2026-09-24',EndDate:'',Active:true}),token,400);
 await tt('manage-save',edit('enrollments',{EnrollmentID:'ENR-BAD-DATE',ClassID:'CLS-TEST',AccountID:'ACCOUNT2',StartDate:'2026-02-30',EndDate:'',Active:true}),token,400);
 await tt('manage-save',edit('classes',{ClassID:'CLS-TEST',Name:'Evening class',AcademicYear:'2026',Active:false},false),token,400);
 const managedDraft=structuredClone(f.draft);managedDraft.rules[0].moduleId='MOD-TEST';managedDraft.rules[0].classIds=['CLS-TEST'];managedDraft.rules[0].teacherId='ACCOUNT2';managedDraft.rules[0].zoomLink='';
 assert((await tt('preview',{draft:managedDraft})).valid);assert.equal((await tt('preview',{draft:managedDraft})).occurrences[0].zoomLink,'https://zoom.us/j/777?pwd=class');
 // A lost response preserves the exact change and produces one management revision.
 const lostManagement=edit('classes',{ClassID:'CLS-RETRY',Name:'Retry class',AcademicYear:'',Active:true});
 loseResponse=true;await tt('manage-save',lostManagement,token,503);
 const revisionCount=table(targetId,'ProgramManagementState').length;
 assert((await tt('manage-save',lostManagement)).replayed);
 assert.equal(table(targetId,'ProgramManagementState').length,revisionCount);
 management=await tt('manage-get');
 // A selected account is validated fresh; inactive accounts cannot be assigned.
 const revokedReference=edit('teachers',{AccountID:'ACCOUNT2',Active:true},false);
 table(platformId,'UserAccounts')[2][5]=false;await tt('manage-save',revokedReference,token,400);table(platformId,'UserAccounts')[2][5]=true;
 management=await tt('manage-get');
 await saveRow('teachers',{AccountID:'ACCOUNT2',Active:false},false);
 assert((await tt('preview',{draft:managedDraft})).valid,'A legacy assignment flag no longer overrides the active program teaching role');
 assert.equal((await tt('history')).publications[0].snapshot.rules[0].moduleName,'Demo module');
 // Academy catalogue is distinct from Global course subjects and reads no Reboot data on normal load.
 for(const action of ['get','import-preview','save','recover']) {
   for(const auth of [legacyToken,studentToken,centralAdminToken])await academy(action,{},auth,403);
   await academy(action,{},'',401);
 }
 const globalBefore=structuredClone(table(platformId,'GlobalSubjectList'));
 assert.deepEqual((await academy('get')).subjects,[]);
 management=await tt('manage-get');assert.equal(management.sharedSubjects[0].Legacy,true);
 await tt('manage-save',edit('subjects',{ProgramSubjectID:'PS-WRONG',SubjectID:'TAFSEER',Active:true}),token,400);
 let review=await academy('import-preview');assert.equal(review.subjects.length,4);
 const staleImport={mode:'import',sourceIds:['REBOOT-AR'],sourceRevision:review.revision,operationId:crypto.randomUUID()};
 table(legacyId,'SubjectList')[1][1]='Changed name';await academy('save',staleImport,token,409);table(legacyId,'SubjectList')[1][1]='Arabic';
 await academy('save',{...staleImport,sourceIds:['REBOOT-OLD']},token,400);
 const importInput={...staleImport,sourceIds:['REBOOT-AR','REBOOT-DUP','REBOOT-TF']};
 const imported=await academy('save',importInput);assert.equal(imported.imported,2);assert.equal(imported.reused,1);
 assert.equal((await academy('get')).subjects.length,2);
 assert((await academy('save',importInput)).replayed);
 assert.equal(table(platformId,'AcademySubjectOperations').length,2);
 const importMappings=JSON.parse(table(platformId,'AcademySubjectOperations')[1][6]);
 assert.equal(importMappings[0].SubjectID,importMappings[1].SubjectID);
 // Name matching ignores case/whitespace. Concurrent creates resolve to one canonical subject.
 const creates=await Promise.all(['Usul','  USUL '].map(subjectName=>academy('save',{mode:'create',subjectName,operationId:crypto.randomUUID()})));
 assert.equal(creates[0].subject.SubjectID,creates[1].subject.SubjectID);
 const lost={mode:'create',subjectName:'Fiqh',operationId:crypto.randomUUID()};
 loseResponse=true;await academy('save',lost,token,503);
 const count=table(platformId,'AcademySubjectList').length;
 assert((await academy('save',lost)).replayed);assert.equal(table(platformId,'AcademySubjectList').length,count);
 const beforeFail={mode:'create',subjectName:'History',operationId:crypto.randomUUID()};
 failWrite=true;await academy('save',beforeFail,token,503);
 await academy('save',{mode:'create',subjectName:'Other',operationId:crypto.randomUUID()},token,409);
 table(platformId,'UserAccounts')[1][13]='';await academy('recover',{},token,401);table(platformId,'UserAccounts')[1][13]='GLOBAL_ADMIN';
 await academy('recover');assert((await academy('save',beforeFail)).replayed);
 // Explicit legacy mapping keeps the ProgramSubjectID and all dependent levels/modules/history.
 management=await tt('manage-get');const beforeModules=structuredClone(management.rows.modules),beforeLevels=structuredClone(management.rows.levels),beforeHistory=await tt('history');
 const tafseer=(await academy('get')).subjects.find(r=>r.SubjectName==='Tafseer');
 await saveRow('subjects',{ProgramSubjectID:'PS-TAFSEER',SubjectID:tafseer.SubjectID,Active:true},false);
 assert.deepEqual(management.rows.modules,beforeModules);assert.deepEqual(management.rows.levels,beforeLevels);
 assert.deepEqual(await tt('history'),beforeHistory);assert(!management.sharedSubjects.some(r=>r.Legacy));
 assert((await tt('get')).catalog.subjects.some(r=>r.id==='PS-TAFSEER'&&r.name==='Tafseer'));
 await tt('manage-save',edit('subjects',{ProgramSubjectID:'PS-TAFSEER',SubjectID:creates[0].subject.SubjectID,Active:true},false),token,400);
 // The Program step must expose imported catalogue subjects in the grid, including old imports.
 management=await tt('manage-get');
 const bulkInput={operationId:crypto.randomUUID(),kind:'subject-import',record:{subjectIds:imported.subjects.map(r=>r.SubjectID)},revision:management.revision,referenceRevision:management.referenceRevision};
 loseResponse=true;await tt('manage-save',bulkInput,token,503);
 const bulkResult=await tt('manage-save',bulkInput);assert(bulkResult.replayed);
 assert.deepEqual(bulkResult.record,{added:1,alreadyLinked:1,archived:0});
 management=await tt('manage-get');assert.equal(management.rows.subjects.length,2);
 assert.deepEqual(management.rows.modules,beforeModules);assert.deepEqual(management.rows.levels,beforeLevels);
 assert.deepEqual(await tt('history'),beforeHistory);
 const repeated=await tt('manage-save',{...bulkInput,operationId:crypto.randomUUID(),revision:management.revision,referenceRevision:management.referenceRevision});
 assert.deepEqual(repeated.record,{added:0,alreadyLinked:2,archived:0});
 assert.equal((await tt('manage-get')).rows.subjects.length,2);
 assert.equal((await academy('recover')).recovered,false);
 // Completion is class-specific and does not mutate curriculum, lessons or publications.
 management=await tt('manage-get');
 const progressBefore={modules:structuredClone(management.rows.modules),history:await tt('history'),draft:(await tt('get')).draft};
 const classIDs=management.rows.classes.slice(0,2).map(r=>r.ClassID),moduleID=management.rows.modules[0].ProgramModuleID;
 await saveRow('progress',{ProgressID:'MP-API-1',ProgramModuleID:moduleID,ClassID:classIDs[0],Status:'COMPLETED'});
 await saveRow('progress',{ProgressID:'MP-API-2',ProgramModuleID:moduleID,ClassID:classIDs[1],Status:'ACTIVE'});
 assert.deepEqual(management.rows.progress.map(r=>r.Status),['COMPLETED','ACTIVE']);
 await tt('manage-save',edit('progress',{ProgressID:'MP-DUP',ProgramModuleID:moduleID,ClassID:classIDs[0],Status:'COMPLETED'}),token,409);
 assert.deepEqual(management.rows.modules,progressBefore.modules);
 assert.deepEqual(await tt('history'),progressBefore.history);assert.deepEqual((await tt('get')).draft,progressBefore.draft);
 assert.deepEqual(table(platformId,'GlobalSubjectList'),globalBefore);
 console.log('Academy subjects: isolated catalogue, reviewed imports, duplicate reuse, concurrency, retry/recovery, authority, legacy mapping and immutable history passed.');
 // Shared academy profiles use the same identities; only academy administrators may read or write.
 for(const action of ['get','link','save','recover']){
  for(const auth of [legacyToken,studentToken,centralAdminToken])await profiles(action,{},auth,403);
  await profiles(action,{},'',401);
 }
 await profiles('get','invalid',token,400);await profiles('save','x'.repeat(131073),token,413);
 books.get(platformId).push(
  {title:'GlobalSubjectAccessPolicy',sheetId:800,rows:[PLATFORM_SHEET_HEADERS.GlobalSubjectAccessPolicy,['POLICY-TF','TAFSEER','SUBSCRIPTION',true]]},
  {title:'GlobalSubjectAccessMatrix',sheetId:801,rows:[['AccountID','TAFSEER','OTHER'],['ACCOUNT1',true,true],['ACCOUNT2',false,true],['TEACHER-1',false,false]]}
 );
 let directory=await profiles('get');assert(!JSON.stringify(directory).includes(hash));assert(!JSON.stringify(directory).includes('ADMIN-LINK'));
 assert.equal(directory.prepared,false);
 const beforeMatrixSetup=structuredClone([table(platformId,'UserCourseAccess'),table(platformId,'GlobalSubjectAccessMatrix'),table(platformId,'GlobalSubjectAccessPolicy')]);
 await profiles('save',{mode:'matrix-prepare',operationId:crypto.randomUUID()});directory=await profiles('get');assert(directory.prepared);assert(directory.reviewCount>0);
 assert.match(table(platformId,'AcademyAccessMatrix')[1][1],/^=IFERROR\(VLOOKUP/);
 const profileAccount=id=>directory.accounts.find(a=>a.accountId===id);
 const profileInput=(id,extra={})=>({operationId:crypto.randomUUID(),mode:'profile',accountId:id,creating:false,displayName:profileAccount(id).displayName,active:profileAccount(id).active,baseRevision:profileAccount(id).revision,...extra});
 const roleInput=(id,type,scopeId,roles,extra={})=>({operationId:crypto.randomUUID(),mode:'matrix-roles',accountId:id,scopeType:type,scopeId,roles,scopeRevision:directory.scopes.find(s=>s.type===type&&s.id===scopeId).revision,baseRevision:profileAccount(id).assignments.find(g=>g.scopeType===type&&g.scopeId===scopeId).revision,...extra});
 const originalAccount=structuredClone(table(platformId,'UserAccounts')[2]);
 await profiles('save',profileInput('ACCOUNT2',{displayName:'Renamed centrally',PINHash:'bad',PlatformRole:'GLOBAL_ADMIN'}));
 for(const column of [0,2,3,4,13])assert.equal(table(platformId,'UserAccounts')[2][column],originalAccount[column]);
 directory=await profiles('get');
 assert.equal(profileAccount('ACCOUNT2').displayName,'Renamed centrally');
 assert.equal((await profiles('link',{accountId:'ACCOUNT2'})).loginPath,'/account/LOCAL-LINK');
 await profiles('save',profileInput('ACCOUNT1',{active:false}),token,409);
 await profiles('save',roleInput('ACCOUNT2','PROGRAM',input.id,['GLOBAL_ADMIN']),token,400);
 await profiles('save',roleInput('ACCOUNT2','PROGRAM',input.id,['TEACHER','STUDENT'],{subscriptionConfirmed:true}));
 assert.deepEqual(table(platformId,'UserCourseAccess'),beforeMatrixSetup[0]);
 directory=await profiles('get');
 const paidRoles=roleInput('ACCOUNT2','SUBJECT','TAFSEER',['STUDENT','TEACHER','ADMIN'],{subscriptionConfirmed:true});
 loseResponse=true;await profiles('save',paidRoles,token,503);
 const beforeProfileReplay=writes;assert((await profiles('save',paidRoles)).replayed);assert.equal(writes,beforeProfileReplay);
 assert.deepEqual(table(platformId,'GlobalSubjectAccessMatrix')[2],['ACCOUNT2',false,true]);
 directory=await profiles('get');
 assert.deepEqual(profileAccount('ACCOUNT2').assignments.find(g=>g.scopeId==='TAFSEER').roles,['STUDENT','TEACHER','ADMIN']);
 assert.deepEqual([table(platformId,'UserCourseAccess'),table(platformId,'GlobalSubjectAccessMatrix'),table(platformId,'GlobalSubjectAccessPolicy')],beforeMatrixSetup);
 assert((await tt('get')).catalog.teachers.some(t=>t.id==='ACCOUNT2'),'Confirmed matrix teacher appears without a legacy grant');
 const grantsBeforeInactive=structuredClone([table(platformId,'UserCourseAccess'),table(platformId,'GlobalSubjectAccessMatrix'),table(platformId,'AcademyAccessMatrix')]);
 await profiles('save',profileInput('ACCOUNT2',{active:false}));
 assert.deepEqual([table(platformId,'UserCourseAccess'),table(platformId,'GlobalSubjectAccessMatrix'),table(platformId,'AcademyAccessMatrix')],grantsBeforeInactive);
 await profiles('get',{},centralAdminToken,401); // Inactive immediately revokes an existing session.
 assert(!(await tt('get')).catalog.teachers.some(t=>t.id==='ACCOUNT2'));
 directory=await profiles('get');await profiles('save',profileInput('ACCOUNT2',{active:true}));
 directory=await profiles('get');const oldRevision=profileInput('ACCOUNT2');
 await profiles('save',profileInput('ACCOUNT2',{displayName:'Changed by another admin'}));
 assert.equal((await profiles('save',oldRevision,token,409)).code,'ROW_CHANGED');
 const newAccountId=crypto.randomUUID();
 const createProfile={operationId:crypto.randomUUID(),mode:'profile',accountId:newAccountId,creating:true,displayName:'Synthetic new user',active:true,baseRevision:directory.emptyRevision};
 loseResponse=true;await profiles('save',createProfile,token,503);
 const newResult=await profiles('save',createProfile);assert(newResult.replayed);assert(newResult.profile.assignments.length);
 assert.equal(table(platformId,'UserAccounts').filter(r=>r[0]===newAccountId).length,1);
 assert.equal(table(platformId,'GlobalSubjectAccessMatrix').filter(r=>r[0]===newAccountId).length,1);
 assert(!table(platformId,'UserCourseAccess').some(r=>r[1]===newAccountId),'New users start free without grants');
 const newRow=table(platformId,'UserAccounts').find(r=>r[0]===newAccountId);assert.equal(newRow[3],false);assert.equal(newRow[4],'');assert.equal(newRow[13],'');
 directory=await profiles('get');const recoverProfile=profileInput('ACCOUNT2',{displayName:'Recovered name'});
 failWrite=true;await profiles('save',recoverProfile,token,503);
 table(platformId,'UserAccounts')[1][13]='';await profiles('recover',{},token,401);table(platformId,'UserAccounts')[1][13]='GLOBAL_ADMIN';
 await profiles('recover');assert((await profiles('save',recoverProfile)).replayed);
 // A moved spreadsheet row cannot turn a recovered profile write into another user's update.
 directory=await profiles('get');const movedProfile=profileInput('ACCOUNT2',{displayName:'Safe after row restore'});
 failWrite=true;await profiles('save',movedProfile,token,503);
 const accountsBeforeMove=structuredClone(table(platformId,'UserAccounts'));
 [table(platformId,'UserAccounts')[2],table(platformId,'UserAccounts')[3]]=[table(platformId,'UserAccounts')[3],table(platformId,'UserAccounts')[2]];
 const movedWriteCount=writes;const blockedRecovery=await profiles('recover',{},token,503);
 assert.equal(blockedRecovery.code,'PROFILE_STORAGE_CHANGED');assert.equal(blockedRecovery.retryable,false);assert.equal(writes,movedWriteCount);
 books.get(platformId).find(s=>s.title==='UserAccounts').rows=accountsBeforeMove;
 await profiles('recover');assert((await profiles('save',movedProfile)).replayed);
 // New courses append stable columns and extend the native table without replacing reviewed cells.
 const nativeMatrix=books.get(platformId).find(s=>s.title==='AcademyAccessMatrix');
 nativeMatrix.tables=[{tableId:'MATRIX-TABLE',range:{sheetId:nativeMatrix.sheetId,startRowIndex:0,startColumnIndex:0,endRowIndex:1000,endColumnIndex:nativeMatrix.rows[0].length},columnProperties:nativeMatrix.rows[0].map((columnName,columnIndex)=>({columnName,columnIndex,columnType:'TEXT'}))}];
 const matrixBeforeNewScope=structuredClone(nativeMatrix.rows);
 const newSubject={SubjectID:'NEW-SCOPE',SubjectName:'New scope',Active:true};
 table(platformId,'GlobalSubjectList').push(PLATFORM_SHEET_HEADERS.GlobalSubjectList.map(h=>newSubject[h]??''));
 assert((await profiles('get')).needsSync);
 await profiles('save',{mode:'matrix-prepare',operationId:crypto.randomUUID()});
 const extended=books.get(platformId).find(s=>s.title==='AcademyAccessMatrix');
 assert.equal(extended.rows[0].at(-1),'SUBJECT:NEW-SCOPE');assert.equal(extended.tables[0].range.endColumnIndex,extended.rows[0].length);
 assert.equal(extended.tables[0].columnProperties.at(-1).columnType,'DROPDOWN');
 assert.deepEqual(extended.rows.map(row=>row.slice(0,-1)),matrixBeforeNewScope);
 assert.equal((await profiles('get')).needsSync,false);
 assert(!JSON.stringify(table(platformId,'AcademyProfileOperations')).includes(hash));
 directory=await profiles('get');
 const batch={mode:'batch',operationId:crypto.randomUUID(),entries:[profileInput('ACCOUNT2',{displayName:'Batched API name'}),roleInput('ACCOUNT2','PROGRAM',input.id,['SENIOR','STUDENT']),roleInput('ACCOUNT2','SUBJECT','TAFSEER',['ADMIN'])]};
 const batchBefore=writes;await profiles('save',batch);assert.equal(writes,batchBefore+1,'Multi-field batch uses one Sheets write');
 assert((await profiles('save',batch)).replayed);assert.equal(writes,batchBefore+1);
 directory=await profiles('get');assert.equal(profileAccount('ACCOUNT2').displayName,'Batched API name');
 const matrixHeader=table(platformId,'AcademyAccessMatrix')[0],matrixAccount=table(platformId,'AcademyAccessMatrix').find(r=>r[0]==='ACCOUNT2');
 assert.equal(matrixAccount[matrixHeader.indexOf('PROGRAM:'+input.id)],'STUDENT|SENIOR');assert.equal(matrixAccount[matrixHeader.indexOf('SUBJECT:TAFSEER')],'ADMIN');
 assert((await tt('get')).catalog.teachers.some(t=>t.id==='ACCOUNT2'));
 const readCatalogue=await academy('get');const renameTarget=readCatalogue.subjects[0];
 const rename={mode:'rename',subjectId:renameTarget.SubjectID,subjectName:'Renamed academy subject',baseRevision:renameTarget.Revision,operationId:crypto.randomUUID()};
 const originalSubjectCount=table(platformId,'AcademySubjectList').length;
 const renamed=await academy('save',rename);assert.equal(renamed.subject.SubjectID,renameTarget.SubjectID);assert.equal(table(platformId,'AcademySubjectList').length,originalSubjectCount);
 assert((await academy('save',rename)).replayed);
 await academy('save',{...rename,subjectName:'Stale rename',operationId:crypto.randomUUID()},token,409);
 assert((await tt('manage-get')).sharedSubjects.some(s=>s.SubjectID===renameTarget.SubjectID&&s.SubjectName==='Renamed academy subject'));
 console.log('Shared profile API: academy-admin authority, inactive session revocation, isolated matrix saves, protected credentials, staged access and lost-response recovery passed.');
 // Future weekly publication with no teacher preserves today's immutable snapshot.
 const beforeWeekly=await tt('get'),activeBefore=(await tt('published')).publication;
 const weeklyDraft=structuredClone(managedDraft);weeklyDraft.rules[0].teacherId='';weeklyDraft.rules[0].startTime='08:45';weeklyDraft.rules[0].endTime='10:15';
 weeklyDraft.breaks=[{id:'BREAK-RUNTIME',label:'Break',weekdays:[...weeklyDraft.rules[0].weekdays],startTime:'10:15',endTime:'10:30'}];weeklyDraft.layout={alignment:'center',mergeShared:true,columnWidths:{time:220},rowHeights:{'10:15|10:30':90}};
 assert((await tt('preview',{draft:weeklyDraft})).valid);
 const effectiveFrom=new Date(Date.parse(beforeWeekly.today+'T00:00:00Z')+7*86400000).toISOString().slice(0,10);
 const future=await tt('publish',{...change(beforeWeekly.revision,weeklyDraft),effectiveFrom});
 assert.equal(future.currentPublicationId,activeBefore.id);
 assert.deepEqual((await tt('published')).publication.snapshot,activeBefore.snapshot);
 const futureView=(await tt('published',{date:effectiveFrom})).publication;
 assert.equal(futureView.occurrences[0].zoomLink,'https://zoom.us/j/777?pwd=class');assert.equal(futureView.occurrences[0].zoomSource,'CLASS');
 assert.equal(futureView.id,future.publicationId);assert.equal(futureView.occurrences[0].teacherId,'');assert.equal(futureView.occurrences[0].startTime,'08:45');
 assert.equal((await tt('published',{date:'2099-12-31'})).publication.id,future.publicationId);
 assert.equal(futureView.snapshot.layout.columnWidths.time,220);assert.equal(futureView.snapshot.breaks[0].label,'Break');assert(futureView.occurrences.some(r=>r.kind==='BREAK'&&r.zoomLink===''));
 assert.equal((await tt('get')).draft.layout.rowHeights['10:15|10:30'],90);
 console.log('Weekly runtime API: optional teacher, future publication, current/history preservation and no expiry passed.');
 assert.deepEqual(books.get(legacyId),originalLegacy);
 assert.deepEqual(table(platformId,'CourseRegistry')[1],originalRegistryRow);
 console.log('Program timetable API: authority, body bounds, Sheets preparation, atomic revisions/publications/receipts, retries, recovery, canonical coordinator keys, reference validation and Reboot isolation passed.');
}finally{if(runtime)await runtime.dispose();globalThis.fetch=originalFetch;}
