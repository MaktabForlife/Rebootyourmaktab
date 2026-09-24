import { timetableCoordinator } from '../src/programs/timetable-coordination.js';
import { timetableService } from '../src/programs/timetable-service.js';
import { timetableRepository } from '../src/programs/timetable-repository.js';
import { timetableProgram,timetableUser } from '../src/programs/timetable-context.js';
import { createRequestEnvironment } from '../src/lib/request-context.js';
import { TIMETABLE_HEADERS } from '../src/programs/timetable-model.js';
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
book(legacyId, { StudentRecords: [["Legacy records must remain unchanged"]] });
books.get(platformId).find(sheet => sheet.title === "UserAccounts").rows.push(["ACCOUNT2", "Local Admin", "LOCAL-LINK", true, hash, true]);
books.get(platformId).find(sheet => sheet.title === "UserCourseAccess").rows.push(["ACCESS2", "ACCOUNT2", "REBOOT", "ADMIN", true, true, "", "", "", "", "", "", "", "LOCAL-ADMIN"]);
const table = (id, title) => books.get(id).find(sheet => sheet.title === title).rows;
const originalLegacy = structuredClone(books.get(legacyId));
const originalRegistryRow = structuredClone(table(platformId, "CourseRegistry")[1]);
const keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const privateBytes = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
const env = { PLATFORM_SPREADSHEET_ID: platformId, GOOGLE_SPREADSHEET_ID: legacyId, SESSION_SECRET: "program-session-secret",
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
  if (suffix === "") return result({ sheets:sheets.map(({ sheetId, title }) => ({ properties:{ sheetId,title } })) });
  if (suffix.startsWith("/values/")) return result({ values:rangeValues(decodeURIComponent(suffix.slice(8))) });
  if (suffix === "/values:batchGet") return result({ valueRanges:parsed.searchParams.getAll("ranges").map(range => ({ values:rangeValues(range) })) });
  assert.equal(suffix, ":batchUpdate");
  writes++;
  if (failWrite) { failWrite = false; return new Response(JSON.stringify({ error:{ message:"Injected write failure" } }), { status:500 }); }
  const next = structuredClone(sheets);
  for (const request of JSON.parse(init.body).requests) {
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
    else rows.forEach((row, i) => { target.rows[update.start.rowIndex + i] = row; });
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
const f=timetableFixture();
const input={id:f.program.id,name:'Aalimiya',spreadsheetId:targetId,durationYears:4,timezone:'Asia/Riyadh',status:'DRAFT'};
const journals=new Map(),coordinators=new Map(),names=[];
const binding={getByName(name){names.push(name);if(!coordinators.has(name)){
 const journal={get:async()=>journals.get(name)||null,set:async p=>journals.set(name,structuredClone(p)),clear:async()=>journals.delete(name)};
 coordinators.set(name,timetableCoordinator(journal,async(id,authorization)=>{
  const fresh=createRequestEnvironment(env);const user=await timetableUser(new Request('https://test.invalid',{headers:{Authorization:authorization}}),fresh);
  const program=await timetableProgram(fresh,id);return {user,service:timetableService(timetableRepository(fresh,program),program)};
 }));}
 return {async run(action,body,auth){try{return {success:true,...await coordinators.get(name).run(action,body,auth)};}catch(e){return {success:false,status:e.publicMessage?e.status:503,error:e.publicMessage||'Uncertain write'};}}};
}};
async function tt(action,body={},auth=token,expected=200,method='POST'){
 const response=await worker.fetch(new Request(`https://worker.test/api/admin/platform/program-timetable/${action}`,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify({id:input.id,...body})}:{})}),env);
 const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));assert.equal(response.headers.get('Cache-Control'),'no-store');return result;
}
const change=(revision,draft=f.draft)=>({revision,draft:structuredClone(draft),operationId:crypto.randomUUID()});
try{
 for(const action of ['get','prepare','save','validate','preview','publish','history','recover']){
  for(const auth of [legacyToken,studentToken,centralAdminToken])await tt(action,{},auth,403);
  await tt(action,{},'',401);
 }
 assert.equal(writes,0);
 await tt('get',{},token,405,'GET');await tt('get','bad',token,400);await tt('save','x'.repeat(65537),token,413);await tt('get',{id:'REBOOT'},token,400);
 await call('create',input);await call('prepare',{id:input.id});
 books.get(platformId).push({title:'GlobalSubjectList',sheetId:20,rows:[PLATFORM_SHEET_HEADERS.GlobalSubjectList,['TAFSEER','Tafseer',true]]});
 let loaded=await tt('get');assert.equal(loaded.prepared,false);assert.equal(loaded.coordinatorAvailable,Boolean(useRuntime));
 if(!useRuntime)await tt('prepare',{},token,503);env.PROGRAM_TIMETABLE_COORDINATOR=binding;
 loseResponse=true;await tt('prepare',{},token,503);if(!useRuntime)assert.equal(journals.size,1);
 await tt('recover');assert.equal(journals.size,0);const before=writes;await tt('prepare');assert.equal(writes,before,'Preparation is idempotent');
 for(const [name,rows] of Object.entries({ProgramSubjects:[['PS-TAFSEER',input.id,'TAFSEER',true]],ProgramModules:[['MOD-DEMO','PS-TAFSEER','','Demo module',1,true]],ProgramClasses:[['CLASS-1',input.id,'Year 1','2026',true],['CLASS-2',input.id,'Year 2','2026',true]]}))table(targetId,name).push(...rows);
 table(platformId,'UserAccounts').push(['TEACHER-1','Demo Teacher','TEACHER-LINK',false,'',true]);
 table(platformId,'UserCourseAccess').push(['ACCESS-TEACHER','TEACHER-1',input.id,'TEACHER',true]);
 loaded=await tt('get');assert.equal(loaded.prepared,true);assert.equal(loaded.catalog.modules.length,1);assert.equal(loaded.catalog.teachers.length,1);
 assert((await tt('preview',{draft:f.draft})).valid);
 let saved=await tt('save',change(''));assert.equal(table(targetId,'ProgramTimetableState').length,2);assert.equal(table(targetId,'ProgramTimetablePublications').length,1);
 const publishInput=change(saved.revision);let pub=await tt('publish',publishInput);assert.equal(pub.version,1);assert.equal(table(targetId,'ProgramTimetableState').length,3);
 assert((await tt('publish',publishInput)).replayed);assert.equal(table(targetId,'ProgramTimetablePublications').length,2);
 assert.equal((await tt('history')).publications[0].occurrences.length,4);
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
 assert.deepEqual(books.get(legacyId),originalLegacy);
 assert.deepEqual(table(platformId,'CourseRegistry')[1],originalRegistryRow);
 console.log('Program timetable API: authority, body bounds, Sheets preparation, atomic revisions/publications/receipts, retries, recovery, canonical coordinator keys, reference validation and Reboot isolation passed.');
}finally{if(runtime)await runtime.dispose();globalThis.fetch=originalFetch;}
