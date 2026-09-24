import { academySubjectService } from '../backend/src/programs/academy-subjects.js';
/* M4L V105.2 - Local-only preview with synthetic data; no Google or Worker calls. */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { programService } from "../backend/src/programs/service.js";
import { PROGRAM_SCHEMA } from "../backend/src/programs/model.js";
import { timetableFixture } from './program-timetable-fixtures.mjs';
import { timetableService } from '../backend/src/programs/timetable-service.js';
import { timetableCoordinator } from '../backend/src/programs/timetable-coordination.js';
const fixture=timetableFixture();
// Demonstrate review of a pre-V105.3.1.1 Global link without changing its dependants.
fixture.shared.subjects[0].Legacy=true;
const academyReceipts=[], academySource={sourceId:'preview-reboot-sheet',revision:'preview-reboot-v1',subjects:[{SourceSubjectID:'REBOOT-TF',SubjectName:'Tafseer',Active:true},{SourceSubjectID:'REBOOT-AR',SubjectName:'Arabic',Active:true},{SourceSubjectID:'REBOOT-FQ',SubjectName:'Fiqh',Active:true}]};
let academyPending=null,academyFailure='';
const academyRepository={
  load:async()=>({subjects:structuredClone(fixture.shared.subjects.filter(r=>!r.Legacy)),tables:{AcademySubjectOperations:structuredClone(academyReceipts)}}),
  prepare:async()=>{},rebootSubjects:async()=>structuredClone(academySource),
  plan:(_data,subjects,receipt)=>({subjects,receipt}),
  apply:async plan=>{const fail=academyFailure;academyFailure='';if(fail==='before')throw new Error('Preview catalogue failure');fixture.shared.subjects.push(...structuredClone(plan.subjects));academyReceipts.push(structuredClone(plan.receipt));if(fail==='after')throw new Error('Preview catalogue lost response');}
};
const academyService=academySubjectService(academyRepository);
const academyCoordinator=timetableCoordinator({get:async()=>academyPending,set:async value=>{academyPending=value;},clear:async()=>{academyPending=null;}},async()=>({user:{accountid:'PREVIEW'},service:academyService}));
const ttService=timetableService(fixture.repository,fixture.program);
const ttCoordinator=timetableCoordinator(fixture.journal,async()=>({user:{accountid:'PREVIEW'},service:ttService}));
await ttCoordinator.run('save',{id:fixture.program.id,revision:'',draft:fixture.draft,operationId:crypto.randomUUID()},'preview');
const root = fileURLToPath(new URL("../", import.meta.url));
const id = "PRG-19da8d59-7eb0-41c3-949d-916f8d764f81";
const registry = [
  { CourseID:"REBOOT", CourseName:"Reboot Your Maktab", SpreadsheetID:"preview-reboot-sheet", Active:true, SchemaVersion:"104.5.4" },
  { CourseID:id, CourseName:"Aalimiya", SpreadsheetID:"preview-aalimiya-sheet", Active:false, SchemaVersion:PROGRAM_SCHEMA }
];
const definitions = [{ CourseID:id, DurationYears:4, Timezone:"", Status:"DRAFT", Revision:crypto.randomUUID() }];
const identities = new Map();
let failNextSave = false;
const repository = {
  protectedIds:["preview-reboot-sheet"],
  registry:async () => structuredClone(registry),
  definitions:async () => structuredClone(definitions),
  preparePlatform:async () => {},
  inspectTarget:async sheet => ({ titles:["Setup"], identity:identities.get(sheet) || [] }),
  prepareTarget:async (sheet, courseId, schema) => identities.set(sheet, [{ CourseID:courseId, SchemaVersion:schema }]),
  commit:async (row, definition, _audit, creating) => {
    if (failNextSave) { failNextSave = false; throw new Error("Injected local failure"); }
    if (creating) { registry.push(row); definitions.push(definition); }
    else { registry[registry.findIndex(item => item.CourseID === row.CourseID)] = row; definitions[definitions.findIndex(item => item.CourseID === row.CourseID)] = definition; }
  }
};
const service = programService(repository);
const user = { accountid:"PREVIEW", username:"Preview Admin" };
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 65536) throw new Error("Request too large"); }
      const body = JSON.parse(raw || "{}");
      const action = url.pathname.split("/").pop();
      const result = url.pathname.startsWith('/api/admin/platform/academy-subjects/') ? (['save','recover'].includes(action)?await academyCoordinator.run(action,body,'preview'):await academyService.read(action)) : url.pathname.startsWith('/api/admin/platform/program-timetable/') ? (['save','publish','prepare','recover','manage-save'].includes(action) ? await ttCoordinator.run(action,body,'preview') : {coordinatorAvailable:true,...await ttService.read(action,body)})
        : url.pathname === "/api/account/session" ? { account:{ uniqueid:"preview" } }
        : action === "list" ? await service.list()
        : action === "create" ? await service.create(body,user)
        : action === "save" ? await service.save(body,user)
        : await service.readiness(body.id, action === "prepare");
      res.writeHead(200, { "Content-Type":"application/json" }); res.end(JSON.stringify({ success:true,...result })); return;
    }
    if (url.pathname === "/__preview/catalogue-fail") {academyFailure=url.searchParams.get('mode')||'after';res.writeHead(200);res.end('Next catalogue save will fail once.');return;}
    if (url.pathname === "/__preview/fail") { failNextSave = true; fixture.failNext(url.searchParams.get("mode") || "before"); res.writeHead(200); res.end("Next save will fail once."); return; }
    if (url.pathname === "/js/m4l-config.js") {
      res.writeHead(200, { "Content-Type":"text/javascript" });
      res.end('window.M4L_CONFIG={API_BASE:""}; localStorage.setItem("m4l_account_token","synthetic-preview-only");'); return;
    }
    if (url.pathname.startsWith("/account/")) { res.writeHead(200, { "Content-Type":"text/html" }); res.end('<p>Local preview only. <a href="/programs/">Return to Programs</a></p>'); return; }
    const relative = url.pathname === "/" || url.pathname === "/programs/" ? "programs/index.html" : url.pathname.slice(1);
    if (!["programs/index.html", "programs/timetable.html", "programs/manage.html", "css/m4l-program-management.css", "js/m4l-program-management.js", "js/m4l-program-overview.js", "css/m4l-program-timetable.css", "js/m4l-program-timetable.js", "css/m4l-program-builder.css", "js/m4l-program-builder.js", "js/m4l-timezones.js", "logo.png", "admin-favicon-32x32.png"].includes(relative)) { res.writeHead(404); res.end("Not found"); return; }
    let content = await readFile(path.join(root,relative));
    if (relative.endsWith(".html")) content = content.toString().replace('<body>', '<body><aside style="padding:8px 32px;background:#fff1cd;font-size:12px">LOCAL PREVIEW · Synthetic timetable, dates and people · <button type="button" id="preview-fail" style="padding:2px 6px" onclick="fetch(\'/__preview/fail\').then(()=>this.textContent=\'Next save will fail once\')">Fail next save</button></aside>');
    const mime = relative.endsWith(".html") ? "text/html" : relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : "image/png";
    res.writeHead(200, { "Content-Type":mime, "Cache-Control":"no-store" }); res.end(content);
  } catch (error) {
    res.writeHead(error.publicMessage ? error.status : 503, { "Content-Type":"application/json" });
    res.end(JSON.stringify({ success:false,error:error.publicMessage || "Temporary preview save failure. Your edits are still here. Retry Save." }));
  }
});
const port = Number(process.env.PROGRAM_PREVIEW_PORT || 8105);
server.listen(port,"127.0.0.1",() => console.log(`Program Builder preview: http://127.0.0.1:${port}/programs/ (synthetic data, no external writes)`));
