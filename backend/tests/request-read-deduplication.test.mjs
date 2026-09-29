import assert from "node:assert/strict";
import {
  batchReadGoogleSheetValues,
  batchUpdateGoogleSheetValues,
  batchUpdateGoogleSpreadsheet,
  readGoogleSheetValues,
  readGoogleSpreadsheetSheetProperties,
  updateGoogleSheetValues
} from "../src/lib/google-sheets.js";
import { createCourseEnvironment } from "../src/lib/course-routing.js";
import { createRequestEnvironment } from "../src/lib/request-context.js";

const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  },
  true,
  ["sign", "verify"]
);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
const baseEnv = {
  GOOGLE_SPREADSHEET_ID: "program-sheet",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "request-dedup-test@example.iam.gserviceaccount.com",
    private_key_id: "request-dedup-test-key",
    private_key: toPem(pkcs8, "PRIVATE KEY"),
    token_uri: "https://oauth2.googleapis.com/token"
  })
};

const originalFetch = globalThis.fetch;
const sheetCalls = [];
const versions = new Map();
let oauthCalls = 0;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method || "GET";

  if (url.hostname === "oauth2.googleapis.com") {
    oauthCalls += 1;
    return jsonResponse({ access_token: "request-dedup-token", expires_in: 3600 });
  }

  if (url.hostname !== "sheets.googleapis.com") {
    throw new Error(`Unexpected fetch: ${url}`);
  }

  const spreadsheetId = decodeURIComponent(url.pathname.split("/")[3] || "").split(':')[0];
  sheetCalls.push({ url, method, spreadsheetId, body: init.body });

  if (method === 'GET' && url.pathname === `/v4/spreadsheets/${spreadsheetId}`) {
    return jsonResponse({sheets:[{properties:{sheetId:7,title:'Data',gridProperties:{rowCount:1000+(versions.get(spreadsheetId)||0)}}}]});
  }

  if (method === "GET" && url.pathname.endsWith("/values:batchGet")) {
    return jsonResponse({
      valueRanges: url.searchParams.getAll("ranges").map(range => ({
        range,
        values: valueFor(spreadsheetId, range)
      }))
    });
  }

  if (method === "GET" && url.pathname.includes("/values/")) {
    const encodedRange = url.pathname.slice(url.pathname.indexOf("/values/") + "/values/".length);
    const range = decodeURIComponent(encodedRange);
    return jsonResponse({ values: valueFor(spreadsheetId, range) });
  }

  if (["PUT", "POST"].includes(method)) {
    versions.set(spreadsheetId, (versions.get(spreadsheetId) || 0) + 1);
    return jsonResponse({ updatedRows: 1 });
  }

  throw new Error(`Unexpected Sheets request: ${method} ${url}`);
};

try {
  const requestEnv = createRequestEnvironment(baseEnv);

  // Repeated exact reads in one request issue one Google GET.
  const first = await readGoogleSheetValues(requestEnv, " Data!A:B ");
  const second = await readGoogleSheetValues(requestEnv, "Data!A:B");
  assert.deepEqual(first, [["program-sheet:Data!A:B:v0"]]);
  assert.deepEqual(second, first);
  assert.equal(getCalls("program-sheet", "Data!A:B").length, 1);

  // Returned rows are defensive copies; consumer mutation must not poison cache.
  first[0][0] = "MUTATED BY CALLER";
  const afterMutation = await readGoogleSheetValues(requestEnv, "Data!A:B");
  assert.deepEqual(afterMutation, [["program-sheet:Data!A:B:v0"]]);
  assert.equal(getCalls("program-sheet", "Data!A:B").length, 1);

  // Concurrent callers share the same in-flight promise.
  const concurrentBefore = sheetCalls.length;
  const concurrent = await Promise.all([
    readGoogleSheetValues(requestEnv, "Concurrent!A:B"),
    readGoogleSheetValues(requestEnv, "Concurrent!A:B"),
    readGoogleSheetValues(requestEnv, "Concurrent!A:B")
  ]);
  assert.deepEqual(concurrent[0], concurrent[1]);
  assert.deepEqual(concurrent[1], concurrent[2]);
  assert.equal(sheetCalls.length - concurrentBefore, 1);

  // A batch seeds the same cache used by later single reads.
  const batchBefore = sheetCalls.length;
  const batch = await batchReadGoogleSheetValues(requestEnv, [
    "BatchA!A:B",
    "BatchB!A:B"
  ]);
  assert.equal(sheetCalls.length - batchBefore, 1);
  assert.deepEqual(batch, [
    [["program-sheet:BatchA!A:B:v0"]],
    [["program-sheet:BatchB!A:B:v0"]]
  ]);
  await readGoogleSheetValues(requestEnv, "BatchA!A:B");
  assert.equal(sheetCalls.length - batchBefore, 1, "single read should reuse a prior batch range");

  // A later overlapping batch sends only missing ranges; duplicates are fetched once.
  const overlapBefore = sheetCalls.length;
  const overlap = await batchReadGoogleSheetValues(requestEnv, [
    "BatchB!A:B",
    "BatchC!A:B",
    "BatchC!A:B"
  ]);
  assert.equal(sheetCalls.length - overlapBefore, 1);
  const overlapCall = sheetCalls.at(-1);
  assert.equal(overlapCall.url.pathname.endsWith("/values:batchGet"), true);
  assert.deepEqual(overlapCall.url.searchParams.getAll("ranges"), ["BatchC!A:B"]);
  assert.deepEqual(overlap, [
    [["program-sheet:BatchB!A:B:v0"]],
    [["program-sheet:BatchC!A:B:v0"]],
    [["program-sheet:BatchC!A:B:v0"]]
  ]);

  // A prior single read can satisfy one range of a later batch.
  await readGoogleSheetValues(requestEnv, "SingleFirst!A:B");
  const singleFirstBefore = sheetCalls.length;
  await batchReadGoogleSheetValues(requestEnv, ["SingleFirst!A:B", "OnlyMissing!A:B"]);
  assert.equal(sheetCalls.length - singleFirstBefore, 1);
  assert.deepEqual(sheetCalls.at(-1).url.searchParams.getAll("ranges"), ["OnlyMissing!A:B"]);

  // Spreadsheet ID is part of the cache boundary.
  const platformBefore = sheetCalls.length;
  await readGoogleSheetValues(requestEnv, "Data!A:B", { spreadsheetId: "platform-sheet" });
  await readGoogleSheetValues(requestEnv, "Data!A:B", { spreadsheetId: "platform-sheet" });
  assert.equal(sheetCalls.length - platformBefore, 1);
  assert.equal(getCalls("platform-sheet", "Data!A:B").length, 1);

  // Course wrappers inherit this request's private context and can share their own range reads.
  const course = { courseId: "COURSE2", courseName: "Course 2", spreadsheetId: "course-2-sheet" };
  const courseEnvA = createCourseEnvironment(requestEnv, course);
  const courseEnvB = createCourseEnvironment(requestEnv, course);
  const courseBefore = sheetCalls.length;
  await readGoogleSheetValues(courseEnvA, "AdminRecords!A:J");
  await readGoogleSheetValues(courseEnvB, "AdminRecords!A:J");
  assert.equal(sheetCalls.length - courseBefore, 1);

  // A new Worker request environment must never inherit a previous request's values.
  const isolatedEnv = createRequestEnvironment(baseEnv);
  const isolationBefore = sheetCalls.length;
  await readGoogleSheetValues(isolatedEnv, "Data!A:B");
  assert.equal(sheetCalls.length - isolationBefore, 1);

  // Successful writes invalidate all cached ranges for only the affected spreadsheet.
  await readGoogleSheetValues(requestEnv, "Mutable!A:B");
  await readGoogleSheetValues(requestEnv, "KeepPlatform!A:B", { spreadsheetId: "platform-sheet" });
  const mutableGetCountBefore = getCalls("program-sheet", "Mutable!A:B").length;
  const platformGetCountBefore = getCalls("platform-sheet", "KeepPlatform!A:B").length;
  await updateGoogleSheetValues(requestEnv, "Mutable!A2", [["updated"]]);
  const postWrite = await readGoogleSheetValues(requestEnv, "Mutable!A:B");
  await readGoogleSheetValues(requestEnv, "KeepPlatform!A:B", { spreadsheetId: "platform-sheet" });
  assert.equal(getCalls("program-sheet", "Mutable!A:B").length, mutableGetCountBefore + 1);
  assert.equal(getCalls("platform-sheet", "KeepPlatform!A:B").length, platformGetCountBefore);
  assert.deepEqual(postWrite, [["program-sheet:Mutable!A:B:v1"]]);

  // Batch value writes use the same invalidation rule.
  await readGoogleSheetValues(requestEnv, "AfterBatchWrite!A:B");
  const batchWriteBefore = getCalls("program-sheet", "AfterBatchWrite!A:B").length;
  await batchUpdateGoogleSheetValues(requestEnv, [{
    range: "AfterBatchWrite!A2",
    majorDimension: "ROWS",
    values: [["updated-again"]]
  }]);
  const afterBatchWrite = await readGoogleSheetValues(requestEnv, "AfterBatchWrite!A:B");
  assert.equal(getCalls("program-sheet", "AfterBatchWrite!A:B").length, batchWriteBefore + 1);
  assert.deepEqual(afterBatchWrite, [["program-sheet:AfterBatchWrite!A:B:v2"]]);

  // Without the router-created request wrapper, the generic helper remains uncached.
  const uncachedBefore = getCalls("program-sheet", "Unscoped!A:B").length;
  await readGoogleSheetValues(baseEnv, "Unscoped!A:B");
  await readGoogleSheetValues(baseEnv, "Unscoped!A:B");
  assert.equal(getCalls("program-sheet", "Unscoped!A:B").length, uncachedBefore + 2);

  // Metadata callers share one fetch across projections, but never across requests/books/writes.
  const metadataBefore=sheetCalls.length;
  const [plain,grid]=await Promise.all([
    readGoogleSpreadsheetSheetProperties(requestEnv),
    readGoogleSpreadsheetSheetProperties(requestEnv,{includeGrid:true})
  ]);
  assert.equal(sheetCalls.length-metadataBefore,1);
  assert.deepEqual(plain,[{sheetId:7,title:'Data'}]);
  assert.equal(grid[0].rowCount,1002);
  grid[0].title='Mutated';
  assert.equal((await readGoogleSpreadsheetSheetProperties(requestEnv,{includeGrid:true}))[0].title,'Data');
  await readGoogleSpreadsheetSheetProperties(createRequestEnvironment(baseEnv));
  await readGoogleSpreadsheetSheetProperties(requestEnv,{spreadsheetId:'platform-sheet'});
  assert.equal(sheetCalls.length-metadataBefore,3);
  await batchUpdateGoogleSpreadsheet(requestEnv,[{addSheet:{properties:{title:'New'}}}]);
  assert.equal((await readGoogleSpreadsheetSheetProperties(requestEnv,{includeGrid:true}))[0].rowCount,1003);
  const unaffectedBefore=sheetCalls.length;
  await readGoogleSpreadsheetSheetProperties(requestEnv,{spreadsheetId:'platform-sheet'});
  assert.equal(sheetCalls.length,unaffectedBefore);
  await readGoogleSpreadsheetSheetProperties(baseEnv);
  await readGoogleSpreadsheetSheetProperties(baseEnv);
  assert.equal(sheetCalls.length,unaffectedBefore+2,'Metadata remains uncached without a request environment');

  assert.equal(oauthCalls, 1, "V104.3 must not alter the existing OAuth token cache behaviour");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("V104.3 request-level Google Sheets read deduplication tests passed.");

function getCalls(spreadsheetId, range) {
  return sheetCalls.filter(call => {
    if (call.method !== "GET" || call.spreadsheetId !== spreadsheetId) return false;
    if (call.url.pathname.endsWith("/values:batchGet")) {
      return call.url.searchParams.getAll("ranges").includes(range);
    }
    const marker = "/values/";
    const index = call.url.pathname.indexOf(marker);
    if (index < 0) return false;
    return decodeURIComponent(call.url.pathname.slice(index + marker.length)) === range;
  });
}

function valueFor(spreadsheetId, range) {
  return [[`${spreadsheetId}:${range}:v${versions.get(spreadsheetId) || 0}`]];
}

function toPem(bytes, label) {
  const base64 = Buffer.from(bytes).toString("base64");
  const lines = base64.match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
