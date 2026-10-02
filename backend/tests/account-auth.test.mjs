import assert from "node:assert/strict";
import {
  createSaltedPinHash,
  getAuthUser,
  verifySessionToken
} from "../src/lib/auth.js";
import { PLATFORM_SHEET_HEADERS } from "../src/lib/platform-schema.js";
import { buildAvailableContexts } from "../src/routes/account-auth.js";
import worker from "../src/worker.js";

const pinSecret = "account-pin-secret";
const sessionSecret = "account-session-secret";
const adminHash = await createSaltedPinHash("4321", pinSecret);
const globalHash = await createSaltedPinHash("2468", pinSecret);
const disabledHash = await createSaltedPinHash("9999", pinSecret);
const subscriberHash = await createSaltedPinHash("8642", pinSecret);
const freeLearnerHash = await createSaltedPinHash("9753", pinSecret);

const tables = {
  CourseRegistry: [
    PLATFORM_SHEET_HEADERS.CourseRegistry,
    ["COURSE1", "Reboot Your Maktab", "course-sheet-one", true, "101.4.3"],
    ["COURSE2", "Aalimiyah", "course-sheet-two", true, "101.4.3"],
    ["COURSE3", "Inactive Course", "course-sheet-three", false, "101.4.3"]
  ],
  UserAccounts: [
    PLATFORM_SHEET_HEADERS.UserAccounts,
    ["ACCOUNT1", "Admin One", "ADMIN-LINK", true, adminHash, true, "", "2026-08-15T00:00:00.000Z", "", "", "", "", "", ""],
    ["ACCOUNT2", "Global Admin", "GLOBAL-LINK", true, globalHash, true, "", "2026-08-15T00:00:00.000Z", "", "", "", "", "", "GLOBAL_ADMIN"],
    ["ACCOUNT3", "Disabled", "DISABLED-LINK", true, disabledHash, false, "", "2026-08-15T00:00:00.000Z", "", "", "", "", "", ""],
    ["ACCOUNT4", "New Student", "SETUP-LINK", false, "", true, "", "2026-08-15T00:00:00.000Z", "", "", "", "", "", ""],
    ["ACCOUNT5", "Global Subscriber", "GLOBAL-SUBSCRIBER", true, subscriberHash, true, "", "2026-08-15T00:00:00.000Z", "", "", "", "", "", ""],
    ["ACCOUNT6", "Free Learner", "GLOBAL-FREE", true, freeLearnerHash, true, "", "2026-08-15T00:00:00.000Z", "", "", "", "", "", ""]
  ],
  UserCourseAccess: [
    PLATFORM_SHEET_HEADERS.UserCourseAccess,
    ["ACCESS1", "ACCOUNT1", "COURSE1", "ADMIN", true, false, "2026-08-13T12:00:00.000Z", "", "", "", "", "", "", "ADMIN1"],
    ["ACCESS2", "ACCOUNT1", "COURSE2", "ADMIN", true, true, "2026-08-14T12:00:00.000Z", "", "", "", "", "", "", "ADMIN9"],
    ["ACCESS3", "ACCOUNT1", "COURSE1", "TEACHER", true, false, "2026-08-15T12:00:00.000Z", "", "", "", "", "", "", "ADMIN1"],
    ["ACCESS4", "ACCOUNT4", "COURSE1", "STUDENT", true, true, "", "", "", "", "", "", "", "STUDENT4"]
  ],
  UserGlobalSubjectAccess: [
    PLATFORM_SHEET_HEADERS.UserGlobalSubjectAccess,
    ["GSACCESS1", "ACCOUNT5", "GSUBJ1", true, "", "", ""],
    ["GSACCESS2", "ACCOUNT1", "GSUBJ1", true, "", "", ""]
  ],
  GlobalSubjectAccessMatrix: [
    ["AccountID", "GSUBJ1", "GSUBJ2"],
    ["ACCOUNT1", true, false],
    ["ACCOUNT2", false, false],
    ["ACCOUNT3", false, false],
    ["ACCOUNT4", false, false],
    ["ACCOUNT5", true, false],
    ["ACCOUNT6", false, false]
  ],
  GlobalSubjectAccessPolicy: [
    PLATFORM_SHEET_HEADERS.GlobalSubjectAccessPolicy,
    ["GSPOL-1", "GSUBJ1", "SUBSCRIPTION", true, "", "", "", "", "", ""],
    ["GSPOL-2", "GSUBJ2", "FREE", true, "", "", "", "", "", ""]
  ],
  GlobalSubjectList: [
    PLATFORM_SHEET_HEADERS.GlobalSubjectList,
    ["GSUBJ1", "Global Subject", true, "", "", "", "", "", "", ""],
    ["GSUBJ2", "Free Global Subject", true, "", "", "", "", "", "", ""]
  ],
  PlatformConfig: [
    PLATFORM_SHEET_HEADERS.PlatformConfig,
    ["AccountLoginBaseUrl", "https://development.example.test/account/"],
    ["PlatformSchemaVersion", "102.0.3"],
    ["GlobalCurriculumVersion", "1"]
  ],
  PlatformAuditLog: [
    PLATFORM_SHEET_HEADERS.PlatformAuditLog
  ]
};

const plainContexts = buildAvailableContexts(
  record(tables.UserAccounts, 2),
  [record(tables.UserCourseAccess, 2), record(tables.UserCourseAccess, 3), record(tables.UserCourseAccess, 4)],
  [record(tables.CourseRegistry, 2), record(tables.CourseRegistry, 3), record(tables.CourseRegistry, 4)],
  [{ AccountID: "ACCOUNT1", _subjectAccess: { GSUBJ1: true, GSUBJ2: false } }],
  [record(tables.GlobalSubjectList, 2)]
);
assert.deepEqual(plainContexts.map(context => `${context.scope}:${context.courseId}:${context.role}`), [
  "COURSE:COURSE2:ADMIN",
  "COURSE:COURSE1:ADMIN",
  "COURSE:COURSE1:TEACHER",
  "GLOBAL::STUDENT"
]);
const globalContexts = buildAvailableContexts(
  record(tables.UserAccounts, 3),
  [],
  [record(tables.CourseRegistry, 2), record(tables.CourseRegistry, 3), record(tables.CourseRegistry, 4)]
);
assert.deepEqual(globalContexts.map(context => `${context.scope}:${context.courseId}:${context.role}`), [
  "PLATFORM::GLOBAL_ADMIN",
  "COURSE:COURSE1:GLOBAL_ADMIN",
  "COURSE:COURSE2:GLOBAL_ADMIN"
]);
const subscriberContexts = buildAvailableContexts(
  record(tables.UserAccounts, 6),
  [],
  [record(tables.CourseRegistry, 2), record(tables.CourseRegistry, 3), record(tables.CourseRegistry, 4)],
  [{ AccountID: "ACCOUNT5", _subjectAccess: { GSUBJ1: true, GSUBJ2: false } }],
  [record(tables.GlobalSubjectList, 2)]
);
assert.deepEqual(subscriberContexts, [{
  scope: "GLOBAL",
  courseId: "",
  courseName: "Global Subjects",
  role: "STUDENT"
}]);
const freeContexts = buildAvailableContexts(
  record(tables.UserAccounts, 7),
  [],
  [record(tables.CourseRegistry, 2), record(tables.CourseRegistry, 3), record(tables.CourseRegistry, 4)],
  [],
  [record(tables.GlobalSubjectList, 2), record(tables.GlobalSubjectList, 3)],
  [record(tables.GlobalSubjectAccessPolicy, 2), record(tables.GlobalSubjectAccessPolicy, 3)]
);
assert.deepEqual(freeContexts, [{
  scope: "GLOBAL", courseId: "", courseName: "Global Subjects", role: "STUDENT"
}]);

const keyPair = await crypto.subtle.generateKey({
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256"
}, true, ["sign", "verify"]);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
const env = {
  PIN_SECRET: pinSecret,
  SESSION_SECRET: sessionSecret,
  PLATFORM_SPREADSHEET_ID: "platform-sheet-test",
  GOOGLE_SPREADSHEET_ID: "legacy-course-sheet",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "account-test@example.iam.gserviceaccount.com",
    private_key_id: "account-test-key",
    private_key: toPem(pkcs8, "PRIVATE KEY"),
    token_uri: "https://oauth2.googleapis.com/token"
  }),
  M4L_REQUIRE_CREDENTIAL_BOUND_SESSIONS: "true",
  M4L_ACCOUNT_AUTH_DIAGNOSTICS: "true"
};

const reads = [];
const writes = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === "oauth2.googleapis.com") {
    return response({ access_token: "mock-account-token", expires_in: 3600 });
  }
  if (url.hostname !== "sheets.googleapis.com") {
    throw new Error(`Unexpected account test fetch: ${url}`);
  }
  assert.equal(init.headers.Authorization, "Bearer mock-account-token");
  assert.match(url.pathname, /spreadsheets\/platform-sheet-test/);
  if(url.pathname==='/v4/spreadsheets/platform-sheet-test')return response({sheets:Object.keys(tables).map((title,sheetId)=>({properties:{title,sheetId}}))});

  if (url.pathname.endsWith("/values:batchUpdate")) {
    const payload = JSON.parse(init.body);
    writes.push(...payload.data);
    payload.data.forEach(applyUpdate);
    return response({ totalUpdatedRows: payload.data.length });
  }

  const lookupRows = range => {
    const fullMatch = /^'([^']+)'!A:([A-Z]+)$/.exec(range);
    if (fullMatch && tables[fullMatch[1]]) return tables[fullMatch[1]];
    const rowMatch = /^(UserAccounts|UserCourseAccess|UserGlobalSubjectAccess)!A(\d+):[A-Z]+\2$/.exec(range);
    if (rowMatch) return [tables[rowMatch[1]][Number(rowMatch[2]) - 1] || []];
    throw new Error(`Unexpected account authentication range: ${range}`);
  };

  if (init.method !== "GET") throw new Error(`Unexpected Sheets operation: ${init.method} ${url.pathname}`);
  if (url.pathname.endsWith("/values:batchGet")) {
    const ranges = url.searchParams.getAll("ranges");
    reads.push(...ranges);
    return response({
      valueRanges: ranges.map(range => ({ range, majorDimension: "ROWS", values: lookupRows(range) }))
    });
  }

  const range = decodeURIComponent(url.pathname.split("/values/")[1] || "");
  reads.push(range);
  return response({ values: lookupRows(range) });
};

try {
  const checked = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(checked.response.status, 200, JSON.stringify(checked.data));
  assert.equal(checked.response.headers.get("X-M4L-Feature"), "account-auth");
  assert.deepEqual(checked.data, {
    success: true,
    account: { displayName: "Admin One", uniqueid: "ADMIN-LINK", pinsetup: true },
    unifiedLoginStage: "CENTRAL_CONTEXT_VERIFICATION"
  });
  assert.equal(JSON.stringify(checked.data).includes(adminHash), false);

  const invalid = await post("/api/account/check", { uniqueid: "UNKNOWN" });
  assert.equal(invalid.response.status, 404);
  const disabled = await post("/api/account/login", { uniqueid: "DISABLED-LINK", pin: "9999" });
  assert.equal(disabled.response.status, 403);

  const wrongPin = await post("/api/account/login", { uniqueid: "ADMIN-LINK", pin: "0000" });
  assert.equal(wrongPin.response.status, 401);

  const login = await post("/api/account/login", { uniqueid: "ADMIN-LINK", pin: "4321" });
  assert.equal(login.response.status, 200);
  assert.equal(login.data.success, true);
  assert.deepEqual(login.data.account, { displayName: "Admin One", uniqueid: "ADMIN-LINK" });
  assert.deepEqual(login.data.context, {
    scope: "COURSE",
    courseId: "COURSE2",
    courseName: "Aalimiyah",
    role: "ADMIN"
  });
  assert.equal(login.data.operationalAccessActive, true);
  assert.equal(login.data.contexts.length, 4);
  assert.deepEqual(login.data.contexts.at(-1), {
    scope: "GLOBAL",
    courseId: "",
    courseName: "Global Subjects",
    role: "STUDENT"
  });
  const loginToken = await verifySessionToken(login.data.token, env);
  assert.equal(loginToken.type, "account");
  assert.equal(loginToken.accountid, "ACCOUNT1");
  assert.equal(loginToken.accessid, "ACCESS2");
  assert.equal(loginToken.accessrow, 3);
  assert.equal(loginToken.courserecordid, "ADMIN9");
  assert.equal(loginToken.authrow, 2);
  assert.equal(typeof loginToken.cv, "string");
  assert.equal(JSON.stringify(login.data).includes("platform-sheet-test"), false);

  const session = await post("/api/account/session", {}, login.data.token);
  assert.equal(session.response.status, 200);
  assert.deepEqual(session.data.context, login.data.context);
  assert.equal(Object.hasOwn(session.data, "token"), false);

  const switched = await post("/api/account/switch-context", {
    scope: "COURSE",
    courseId: "COURSE1",
    role: "TEACHER"
  }, login.data.token);
  assert.equal(switched.response.status, 200);
  assert.deepEqual(switched.data.context, {
    scope: "COURSE",
    courseId: "COURSE1",
    courseName: "Reboot Your Maktab",
    role: "TEACHER"
  });
  const switchedToken = await verifySessionToken(switched.data.token, env);
  assert.equal(switchedToken.accessid, "ACCESS3");
  assert.equal(switchedToken.courserecordid, "ADMIN1");

  const switchedGlobal = await post("/api/account/switch-context", {
    scope: "GLOBAL",
    courseId: "",
    role: "STUDENT"
  }, login.data.token);
  assert.equal(switchedGlobal.response.status, 200, JSON.stringify(switchedGlobal.data));
  assert.deepEqual(switchedGlobal.data.context, {
    scope: "GLOBAL",
    courseId: "",
    courseName: "Global Subjects",
    role: "STUDENT"
  });
  const switchedGlobalToken = await verifySessionToken(switchedGlobal.data.token, env);
  assert.equal(switchedGlobalToken.scope, "GLOBAL");
  assert.equal(switchedGlobalToken.role, "STUDENT");
  assert.equal(switchedGlobalToken.globalaccessid, "");
  assert.equal(switchedGlobalToken.globalaccessrow, 0);

  const unauthorizedSwitch = await post("/api/account/switch-context", {
    scope: "COURSE",
    courseId: "COURSE2",
    role: "TEACHER"
  }, login.data.token);
  assert.equal(unauthorizedSwitch.response.status, 403);

  const globalLogin = await post("/api/account/login", { uniqueid: "GLOBAL-LINK", pin: "2468" });
  assert.equal(globalLogin.response.status, 200);
  assert.deepEqual(globalLogin.data.context, {
    scope: "PLATFORM",
    courseId: "",
    courseName: "M4L Platform",
    role: "GLOBAL_ADMIN"
  });
  const globalCourse = await post("/api/account/switch-context", {
    scope: "COURSE",
    courseId: "COURSE1",
    role: "GLOBAL_ADMIN"
  }, globalLogin.data.token);
  assert.equal(globalCourse.response.status, 200);
  assert.equal(globalCourse.data.context.courseId, "COURSE1");
  assert.equal(globalCourse.data.context.role, "GLOBAL_ADMIN");

  const subscriberLogin = await post("/api/account/login", {
    uniqueid: "GLOBAL-SUBSCRIBER",
    pin: "8642"
  });
  assert.equal(subscriberLogin.response.status, 200, JSON.stringify(subscriberLogin.data));
  assert.deepEqual(subscriberLogin.data.context, {
    scope: "GLOBAL",
    courseId: "",
    courseName: "Global Subjects",
    role: "STUDENT"
  });
  assert.equal(subscriberLogin.data.operationalAccessActive, true);
  const globalWorkspace = await post(
    "/api/account/global-workspace",
    {},
    subscriberLogin.data.token
  );
  assert.equal(globalWorkspace.response.status, 200, JSON.stringify(globalWorkspace.data));
  assert.equal(globalWorkspace.data.workspace.path, "/student/GLOBAL-SUBSCRIBER?global=1");
  assert.equal(globalWorkspace.data.student.classgroup, "GLOBAL");

  const freeLogin = await post("/api/account/login", { uniqueid: "GLOBAL-FREE", pin: "9753" });
  assert.equal(freeLogin.response.status, 200, JSON.stringify(freeLogin.data));
  assert.equal(freeLogin.data.context.scope, "GLOBAL");
  const freeToken = await verifySessionToken(freeLogin.data.token, env);
  assert.equal(freeToken.globalaccessid, "", "FREE access must not require a subscription row");

  const globalSubscriberRequest = new Request("https://worker.test/api/account/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${subscriberLogin.data.token}` }
  });
  assert.equal((await getAuthUser(globalSubscriberRequest, env)).scope, "GLOBAL");
  tables.GlobalSubjectList[1][2] = false;
  tables.GlobalSubjectList[2][2] = false;
  assert.equal(
    await getAuthUser(globalSubscriberRequest, env),
    null,
    "Global-only sessions must close when no subscribed or FREE subject remains active"
  );
  tables.GlobalSubjectList[1][2] = true;
  tables.GlobalSubjectList[2][2] = true;

  const freeRequest = new Request("https://worker.test/api/account/session", {
    method: "POST", headers: { Authorization: `Bearer ${freeLogin.data.token}` }
  });
  assert.equal((await getAuthUser(freeRequest, env)).scope, "GLOBAL");
  tables.GlobalSubjectAccessPolicy[2][2] = "SUBSCRIPTION";
  assert.equal(await getAuthUser(freeRequest, env), null, "Changing FREE to SUBSCRIPTION must revoke a non-subscriber global session");
  tables.GlobalSubjectAccessPolicy[2][2] = "FREE";

  const setup = await post("/api/account/setup-pin", {
    uniqueid: "SETUP-LINK",
    pin: "1357",
    pinConfirmation: "1357"
  });
  assert.equal(setup.response.status, 200);
  assert.equal(tables.UserAccounts[4][3], true);
  assert.match(String(tables.UserAccounts[4][4]), /^v2\$pbkdf2-sha256\$/);
  assert.equal(setup.data.context.role, "STUDENT");
  assert.equal(setup.data.context.courseId, "COURSE1");
  assert.equal(tables.PlatformAuditLog[1][6], "ACCOUNT_PIN_SETUP_SELF");
  assert.equal(tables.PlatformAuditLog[1][7], "USER_ACCOUNT");
  assert.equal(String(tables.PlatformAuditLog[1][9]).includes("AuthenticationCredential"), true);
  assert.equal(JSON.stringify(tables.PlatformAuditLog).includes(tables.UserAccounts[4][4]), false);

  const centralTokenOnLegacyAdmin = await post(
    "/api/admin/platform/validate",
    {},
    globalLogin.data.token
  );
  assert.equal(centralTokenOnLegacyAdmin.response.status, 403);

  const switchedRequest = new Request("https://worker.test/api/account/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${switched.data.token}` }
  });
  assert.equal((await getAuthUser(switchedRequest, env)).role, "TEACHER");
  tables.UserCourseAccess[3][4] = false;
  assert.equal(await getAuthUser(switchedRequest, env), null, "Membership deactivation must revoke its scoped token");
  tables.UserCourseAccess[3][4] = true;

  tables.UserAccounts[1][5] = false;
  const loginRequest = new Request("https://worker.test/api/account/session", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.data.token}` }
  });
  assert.equal(await getAuthUser(loginRequest, env), null, "Account deactivation must revoke every central token");
  tables.UserAccounts[1][5] = true;

  assert.ok(writes.some(write => write.range === "'UserAccounts'!G2"));
  assert.ok(writes.some(write => write.range === "'UserCourseAccess'!G3"));
  assert.ok(reads.includes("UserAccounts!A2:N2"));

  tables.PlatformConfig[2][1] = "102.0.4";
  const upgradedSchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(upgradedSchemaCheck.response.status, 200, "Account login must accept Platform schema 102.0.4 during cutover");
  tables.PlatformConfig[2][1] = "102.0.5";
  const v10210SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v10210SchemaCheck.response.status, 200, "V102.10 account login must accept Platform schema 102.0.5");
  tables.PlatformConfig[2][1] = "102.0.6";
  const v10211SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v10211SchemaCheck.response.status, 200, "V102.11 account login must accept Platform schema 102.0.6");
  tables.PlatformConfig[2][1] = "102.0.7";
  const v102111SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v102111SchemaCheck.response.status, 200, "V102.11.1 account login must accept Platform schema 102.0.7");
  tables.PlatformConfig[2][1] = "102.0.8";
  const v102121SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v102121SchemaCheck.response.status, 200, "V102.12.2 account login must accept Platform schema 102.0.8");
  tables.PlatformConfig[2][1] = "102.0.9";
  const v103SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v103SchemaCheck.response.status, 200, "Central account login must accept Platform schema 102.0.9");
  tables.PlatformConfig[2][1] = "102.0.10";
  const v1045SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v1045SchemaCheck.response.status, 200, "Central account login must accept Platform schema 102.0.10");
  tables.PlatformConfig[2][1] = "102.0.11";
  const v10451SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v10451SchemaCheck.response.status, 200, "Central account login/revalidation must accept Platform schema 102.0.11");
  tables.PlatformConfig[2][1] = "102.0.12";
  const v10453SchemaCheck = await post("/api/account/check", { uniqueid: "ADMIN-LINK" });
  assert.equal(v10453SchemaCheck.response.status, 200, "Central account login/revalidation must accept current Platform schema 102.0.12");

  const programId='PRG-11111111-1111-4111-8111-111111111111';
  const programHash=await createSaltedPinHash('1357',pinSecret);
  tables.CourseRegistry.push([programId,'Program Library','program-sheet-test',false,'105.1-program']);
  tables.UserAccounts.push(['ACCOUNT7','Program Teacher','PROGRAM-TEACHER-LINK',true,programHash,true,'','','','','','','','']);
  tables.UserCourseAccess.push(['ACCESS5','ACCOUNT7',programId,'TEACHER',true,true,'','','','','','','','TEACHER-REC']);
  const programLogin=await post('/api/account/login',{uniqueid:'PROGRAM-TEACHER-LINK',pin:'1357'});
  assert.equal(programLogin.response.status,200,JSON.stringify(programLogin.data));
  assert.equal(programLogin.data.context.courseId,programId);
  assert.equal(programLogin.data.context.role,'TEACHER');
  const programSession=await post('/api/account/session',{},programLogin.data.token);
  assert.equal(programSession.response.status,200,'A teacher with only Program Library access can restore their account session');
  const programSwitched=await post('/api/account/switch-context',{scope:'COURSE',courseId:programId,role:'TEACHER'},programLogin.data.token);
  assert.equal(programSwitched.response.status,200,'A teacher can select their Program Library context');
  const programRequest=new Request('https://worker.test/api/account/session',{headers:{Authorization:`Bearer ${programLogin.data.token}`}});
  assert.equal(await getAuthUser(programRequest,env),null,'Program Library tokens cannot open unfinished teaching routes');
  assert.equal((await getAuthUser(programRequest,env,{allowProgram:true})).role,'TEACHER');
} finally {
  globalThis.fetch = originalFetch;
}

console.log("V102.12.2 central account, FREE and subscription global-context authentication tests passed.");

async function post(path, body, token = "") {
  const responseValue = await worker.fetch(new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  }), env);
  return { response: responseValue, data: await responseValue.json() };
}

function applyUpdate(update) {
  const match = /^'(UserAccounts|UserCourseAccess|PlatformAuditLog)'!([A-Z]+)(\d+)(?::([A-Z]+)\3)?$/.exec(update.range);
  if (!match) throw new Error(`Unexpected account update range: ${update.range}`);
  const [, sheetName, startColumn, rowText] = match;
  const rowIndex = Number(rowText) - 1;
  if (!tables[sheetName][rowIndex]) tables[sheetName][rowIndex] = [];
  const row = tables[sheetName][rowIndex];
  const start = columnIndex(startColumn);
  (update.values[0] || []).forEach((value, offset) => { row[start + offset] = value; });
}

function record(rows, rowNumber) {
  const output = { _rowNumber: rowNumber };
  rows[0].forEach((header, index) => { output[header] = rows[rowNumber - 1][index] ?? ""; });
  return output;
}

function columnIndex(name) {
  return String(name).split("").reduce((total, letter) => (
    total * 26 + letter.charCodeAt(0) - 64
  ), 0) - 1;
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function toPem(bytes, label) {
  const base64 = Buffer.from(bytes).toString("base64");
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}
