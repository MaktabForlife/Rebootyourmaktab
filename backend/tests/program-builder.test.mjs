import assert from "node:assert/strict";
import worker from "../src/worker.js";
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
const input = { id:`PRG-${crypto.randomUUID()}`, name:"Aalimiya", spreadsheetId:targetId, durationYears:4, timezone:"", status:"DRAFT" };
try {
  for (const action of ["list","create","save","readiness","prepare"]) {
    await call(action, input, "", 401);
    await call(action, input, legacyToken, 403);
    await call(action, input, studentToken, 403);
    await call(action, input, centralAdminToken, 403);
  }
  assert.equal(writes, 0);
  await call("create", input, token, 405, "GET");
  await call("create", "bad-json", token, 400);
  await call("create", "x".repeat(8193), token, 413);
  const initial = await call("list");
  assert.equal(initial.platformPrepared, false);
  assert.equal(initial.programs[0].mode, "LEGACY");
  for (const invalid of [{ durationYears:0 }, { durationYears:true }, { name:["Aalimiya"] }, { durationYears:1.5 }, { timezone:"Invented/Place" }, { status:"ACTIVE" }, { active:true }, { capabilities:{ attendance:true } }]) {
    await call("create", { ...input,...invalid }, token, 400);
  }
  for (const spreadsheetId of [platformId,legacyId]) await call("create", { ...input,spreadsheetId }, token, 409);
  denyTarget = true;
  await call("create", input, token, 503);
  denyTarget = false;
  assert.equal(writes, 0);
  book("test-existing-operational", { StudentRecords:[["Existing learners"]] });
  await call("create", { ...input,spreadsheetId:"test-existing-operational" }, token, 409);
  await call("save", { ...input,id:"REBOOT" }, token, 409);
  await call("prepare", { id:"REBOOT" }, token, 409);
  assert.equal(writes, 0);
  // Interrupted platform setup: an empty tab can be safely repaired.
  books.get(platformId).push({ title:"ProgramDefinitions", sheetId:10, rows:[] });
  const created = (await call("create", input)).program;
  assert.equal(created.durationYears, 4);
  assert.equal(created.active, false);
  assert.equal(created.capabilities.attendance, false);
  assert.equal(table(platformId, "CourseRegistry").length, 3);
  assert.equal(table(platformId, "PlatformAuditLog").length, 2);
  const beforeListReads = reads;
  await call("list");
  assert.equal(reads - beforeListReads, 4, "List reads only account, registry, platform metadata and definitions; never fans out across Program spreadsheets");
  const afterCreateWrites = writes;
  assert.equal((await call("create", input)).replayed, true);
  assert.equal(writes, afterCreateWrites);
  await call("create", { ...input,id:`PRG-${crypto.randomUUID()}` }, token, 409);
  await call("create", { ...input,name:"Different" }, token, 409);
  assert.equal((await call("readiness", { id:input.id })).prepared, false);
  failWrite = true;
  await call("prepare", { id:input.id }, token, 503);
  assert.ok(!books.get(targetId).some(sheet => sheet.title === "ProgramIdentity"));
  const ready = await call("prepare", { id:input.id });
  assert.equal(ready.prepared, true);
  assert.equal(ready.timezoneConfigured, false);
  assert.equal(ready.teachingEnabled, false);
  const readyWrites = writes;
  await call("prepare", { id:input.id });
  assert.equal(writes, readyWrites);
  assert.deepEqual(table(targetId, "ProgramIdentity"), [IDENTITY_HEADERS, [input.id,PROGRAM_SCHEMA]]);
  await call("save", { ...input,revision:created.revision,name:"Renamed",spreadsheetId:"some-other-sheet" }, token, 409);
  await call("save", { ...input,revision:"stale" }, token, 409);
  // The client sends configuration fields only, never the read-only capability map.
  const savedInput = { ...input,revision:created.revision,name:"Aalimiya programme",timezone:"Asia/Riyadh" };
  failWrite = true;
  await call("save", savedInput, token, 503);
  assert.equal(table(platformId, "CourseRegistry")[2][1], "Aalimiya");
  const saved = (await call("save", savedInput)).program;
  assert.equal(saved.timezone, "Asia/Riyadh");
  assert.notEqual(saved.revision, created.revision);
  await call("save", savedInput, token, 409);
  const archived = (await call("save", { ...savedInput,revision:saved.revision,status:"ARCHIVED" })).program;
  assert.equal(archived.status, "ARCHIVED");
  assert.equal(archived.active, false);
  // Never overwrite incompatible target data.
  table(targetId, "ProgramIdentity")[1][0] = "OTHER-PROGRAM";
  const beforeMismatch = writes;
  await call("prepare", { id:input.id }, token, 409);
  assert.equal(writes, beforeMismatch);
  table(targetId, "ProgramIdentity")[1][0] = input.id;
  // Header-only and completely empty target tabs recover without duplicate tabs.
  table(targetId, "ProgramIdentity").splice(1);
  await call("prepare", { id:input.id });
  table(targetId, "ProgramIdentity").splice(0);
  await call("prepare", { id:input.id });
  assert.equal(table(targetId, "ProgramIdentity").length, 2);
  const otherTarget = "test-second-program";
  book(otherTarget, { Setup:[] });
  loseResponse = true;
  const retryInput = { ...input,id:`PRG-${crypto.randomUUID()}`,spreadsheetId:otherTarget,name:"Second program" };
  await call("create", retryInput, token, 503);
  assert.equal((await call("create", retryInput)).replayed, true);
  assert.equal(table(platformId, "CourseRegistry").filter(row => row[0] === retryInput.id).length, 1);
  // Revoked platform authority is denied despite a previously valid token.
  table(platformId, "UserAccounts")[1][13] = "";
  await call("list", {}, token, 401);
  table(platformId, "UserAccounts")[1][13] = "GLOBAL_ADMIN";
  // Even a manually flipped Active flag cannot route a new Program into Reboot.
  table(platformId, "CourseRegistry")[2][3] = true;
  await assert.rejects(resolveActiveCourseRegistration(env, input.id), /not enabled/);
  await call("list", {}, token, 409);
  table(platformId, "CourseRegistry")[2][3] = false;
  assert.deepEqual(books.get(legacyId), originalLegacy);
  assert.deepEqual(table(platformId, "CourseRegistry")[1], originalRegistryRow);
  assert.deepEqual(table(platformId, "ProgramDefinitions")[0], DEFINITION_HEADERS);
  console.log("Program Builder: authorization, validation, atomic registry/config/audit writes, retries, partial preparation, ownership, stale edits, archive and legacy isolation passed.");
} finally { globalThis.fetch = originalFetch; }
