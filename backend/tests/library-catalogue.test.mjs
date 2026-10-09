import assert from "node:assert/strict";
import {
  createSaltedPinHash,
  createSessionToken
} from "../src/lib/auth.js";
import { PLATFORM_SHEET_HEADERS } from "../src/lib/platform-schema.js";
import worker from "../src/worker.js";

const pinSecret = "library-catalogue-pin-secret";
const sessionSecret = "library-catalogue-session-secret";
const credentialHash = await createSaltedPinHash("4321", pinSecret);

const platformTables = {
  CourseRegistry: [
    PLATFORM_SHEET_HEADERS.CourseRegistry,
    ["COURSE1", "Reboot Your Maktab", "course-sheet-one", true, "101.4.3"],
    ["COURSE2", "Aalimiyah", "course-sheet-two", true, "101.4.3"],
    ["COURSE3", "Not Authorised", "course-sheet-three", true, "101.4.3"]
  ],
  UserAccounts: [
    PLATFORM_SHEET_HEADERS.UserAccounts,
    ["ACCOUNT1", "Student One", "STUDENT-LINK", true, credentialHash, true, "", "", "", "", "", "", "", ""]
  ],
  UserCourseAccess: [
    PLATFORM_SHEET_HEADERS.UserCourseAccess,
    ["ACCESS1", "ACCOUNT1", "COURSE1", "STUDENT", true, true, "", "", "", "", "", "", "", "STUDENT1"],
    ["ACCESS2", "ACCOUNT1", "COURSE2", "STUDENT", true, false, "", "", "", "", "", "", "", "STUDENT2"]
  ],
  UserGlobalSubjectAccess: [
    PLATFORM_SHEET_HEADERS.UserGlobalSubjectAccess,
    ["GSACCESS1", "ACCOUNT1", "GSUBJ1", true, "", "", ""]
  ],
  GlobalSubjectAccessMatrix: [
    ["AccountID", "GSUBJ1", "GSUBJ2"],
    ["ACCOUNT1", true, false]
  ],
  GlobalSubjectAccessPolicy: [
    PLATFORM_SHEET_HEADERS.GlobalSubjectAccessPolicy,
    ["GSPOL1", "GSUBJ1", "SUBSCRIPTION", true, "", "", "", "", "", ""],
    ["GSPOL2", "GSUBJ2", "FREE", true, "", "", "", "", "", ""]
  ],
  GlobalSubjectRuns: [
    PLATFORM_SHEET_HEADERS.GlobalSubjectRuns,
    ["GSRUN1", "GSUBJ1", "Past subscription run", "2026-07-01", "2026-07-31", "Africa/Johannesburg", true, "", "", "", "", "", ""],
    ["GSRUN2", "GSUBJ2", "Current free run", "", "", "Africa/Johannesburg", true, "", "", "", "", "", ""]
  ],
  GlobalSubjectList: [
    PLATFORM_SHEET_HEADERS.GlobalSubjectList,
    ["GSUBJ1", "Subscribed Subject", true, "", "", "", "", "", "", ""],
    ["GSUBJ2", "Free Subject", true, "", "", "", "", "", "", ""]
  ],
  GlobalModuleList: [
    PLATFORM_SHEET_HEADERS.GlobalModuleList,
    ["GMOD1", "GSUBJ1", "Subscribed Module", 1, true, "", "", "", "", "", ""],
    ["GMOD2", "GSUBJ2", "Hidden Module", 1, true, "", "", "", "", "", ""]
  ],
  GlobalTaskList: [
    PLATFORM_SHEET_HEADERS.GlobalTaskList,
    ["GTASK1", "GSUBJ1", "GMOD1", "Subscribed Task", true, "", "", "", "", "", ""],
    ["GTASK2", "GSUBJ2", "GMOD2", "Hidden Task", true, "", "", "", "", "", ""]
  ],
  GlobalResources: [
    PLATFORM_SHEET_HEADERS.GlobalResources,
    ["GRES1", "GSUBJ1", "GMOD1", "GTASK1", "Subscribed Global File", "EBOOK", "PDF", "Visible", "https://drive.google.test/subscribed", true, "", "", "", "", "", ""],
    ["GRES2", "GSUBJ2", "GMOD2", "GTASK2", "Free Global File", "EBOOK", "PDF", "Hidden", "https://drive.google.test/hidden", true, "", "", "", "", "", ""],
    ["GRES3", "GSUBJ1", "GMOD1", "GTASK1", "Inactive Global File", "EBOOK", "PDF", "Hidden", "https://drive.google.test/inactive", false, "", "", "", "", "", ""]
  ],
  PlatformConfig: [
    PLATFORM_SHEET_HEADERS.PlatformConfig,
    ["PlatformSchemaVersion", "102.0.5", "", "", ""],
    ["GlobalCurriculumVersion", "13", "", "", ""]
  ]
};

const studentHeaders = [
  "StudentID", "Username", "PINSetup", "UniqueID", "PINHash", "ClassName",
  "ClassGroup", "Age", "CreatedDate", "ModifiedDate", "Active"
];
const resourceHeaders = [
  "ResourceID", "ResourceName", "SubjectID", "Subject", "ModuleID", "Module",
  "TaskID", "ClassGroup", "Format", "Description", "Link", "Active", "CreatedDate"
];
const courseTables = {
  "course-sheet-one": {
    StudentRecords: [
      studentHeaders,
      ["STUDENT1", "Student One", true, "STUDENT-LINK", "local", "Course 1", "1", "", "", "", true]
    ],
    eBooks: [
      resourceHeaders,
      ["C1-G1", "Course 1 Group 1", "S1", "Course One", "M1", "Module", "", "1", "PDF", "", "https://course1.test/group1", true, ""],
      ["C1-G2", "Course 1 Group 2", "S1", "Course One", "M1", "Module", "", "2", "PDF", "", "https://course1.test/group2", true, ""],
      ["C1-ALL", "Course 1 All", "S1", "Course One", "M1", "Module", "", "ALL", "PDF", "", "https://course1.test/all", true, ""]
    ]
  },
  "course-sheet-two": {
    StudentRecords: [
      studentHeaders,
      ["STUDENT2", "Student One", true, "STUDENT-LINK", "local", "Course 2", "2", "", "", "", true]
    ],
    eBooks: [
      resourceHeaders,
      ["C2-G1", "Course 2 Group 1", "S2", "Course Two", "M2", "Module", "", "1", "PDF", "", "https://course2.test/group1", true, ""],
      ["C2-G2", "Course 2 Group 2", "S2", "Course Two", "M2", "Module", "", "2", "PDF", "", "https://course2.test/group2", true, ""],
      ["C2-ALL", "Course 2 All", "S2", "Course Two", "M2", "Module", "", "ALL", "PDF", "", "https://course2.test/all", true, ""]
    ]
  }
};

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
  GOOGLE_SPREADSHEET_ID: "legacy-sheet-must-not-be-used",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "library-catalogue@example.iam.gserviceaccount.com",
    private_key_id: "library-catalogue-key",
    private_key: toPem(pkcs8, "PRIVATE KEY"),
    token_uri: "https://oauth2.googleapis.com/token"
  }),
  M4L_REQUIRE_CREDENTIAL_BOUND_SESSIONS: "true"
};

const token = await createSessionToken({
  type: "account",
  accountid: "ACCOUNT1",
  uniqueid: "STUDENT-LINK",
  username: "Student One",
  role: "STUDENT",
  scope: "COURSE",
  accessid: "ACCESS1",
  accessrow: 2,
  courseid: "COURSE1",
  coursename: "Reboot Your Maktab",
  courserecordid: "STUDENT1",
  authrow: 2,
  credentialHash
}, env);

const reads = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === "oauth2.googleapis.com") {
    return response({ access_token: "mock-library-token", expires_in: 3600 });
  }
  if (url.hostname !== "sheets.googleapis.com") {
    throw new Error(`Unexpected Library test fetch: ${url}`);
  }
  assert.equal(init.headers.Authorization, "Bearer mock-library-token");
  if (url.pathname.endsWith('/spreadsheets/platform-sheet-test')) {
    return response({ sheets: Object.keys(platformTables).map((title, sheetId) => ({
      properties: { title, sheetId: sheetId + 1 }
    })) });
  }
  const spreadsheetId = decodeURIComponent(url.pathname.match(/\/spreadsheets\/([^/]+)/)?.[1] || "");
  if (spreadsheetId === 'platform-sheet-test' && url.pathname.endsWith('/values:batchGet')) {
    return response({ valueRanges: url.searchParams.getAll('ranges').map(range => ({
      values: platformTables[range.match(/^'([^']+)'!/)?.[1]] || []
    })) });
  }
  const range = decodeURIComponent(url.pathname.split("/values/")[1] || "");
  reads.push({ spreadsheetId, range });

  if (spreadsheetId === "platform-sheet-test") {
    const fullMatch = /^'([^']+)'!A:[A-Z]+$/.exec(range);
    if (fullMatch && platformTables[fullMatch[1]]) {
      return response({ values: platformTables[fullMatch[1]] });
    }
    const rowMatch = /^(UserAccounts|UserCourseAccess)!A(\d+):[A-Z]+\2$/.exec(range);
    if (rowMatch) {
      return response({ values: [platformTables[rowMatch[1]][Number(rowMatch[2]) - 1] || []] });
    }
  }

  const course = courseTables[spreadsheetId];
  if (course && range === "StudentRecords!A:K") {
    return response({ values: course.StudentRecords });
  }
  const resourceMatch = /^(eBooks|Printable|Audio|Video|OtherResource)!A:ZZ$/.exec(range);
  if (course && resourceMatch) {
    return response({ values: course[resourceMatch[1]] || [resourceHeaders] });
  }
  throw new Error(`Unexpected Library Sheets read: ${spreadsheetId} ${range}`);
};

try {
  const result = await post("/api/library/catalogue", {});
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.success, true);
  assert.equal(result.data.selectedSource, "ALL");
  assert.deepEqual(result.data.sources.map(source => source.id), [
    "ALL", "COURSE:COURSE1", "COURSE:COURSE2", "GLOBAL"
  ]);
  assert.deepEqual(result.data.sources.map(source => source.label), [
    "All", "Reboot Your Maktab", "Aalimiyah", "Global Subjects"
  ]);
  assert.equal(result.data.globalCurriculumVersion, 13);
  assert.equal(result.data.count, 6);
  assert.deepEqual(result.data.learningAreaRefs, [
    'REBOOT:COURSE1', 'REBOOT:COURSE2', 'GLOBAL:GSUBJ1', 'GLOBAL:GSUBJ2'
  ]);

  const courseOne = result.data.libraries.find(library => library.id === "COURSE:COURSE1");
  const courseTwo = result.data.libraries.find(library => library.id === "COURSE:COURSE2");
  const global = result.data.libraries.find(library => library.id === "GLOBAL");
  assert.deepEqual(resourceNames(courseOne), ["Course 1 All", "Course 1 Group 1"]);
  assert.deepEqual(resourceNames(courseTwo), ["Course 2 All", "Course 2 Group 2"]);
  assert.deepEqual(resourceNames(global), ["Free Global File", "Subscribed Global File"]);
  assert.equal(global.subjectCount, 2);
  assert.equal(global.catalogue.ebooks.subjects[0].sourcescope, "GLOBAL");
  assert.equal(global.catalogue.ebooks.subjects[0].modules[0].resources[0].accessscope, "GLOBAL");
  const bySubject = Object.fromEntries(global.catalogue.ebooks.subjects.map(subject => [subject.originsubjectid, subject]));
  assert.equal(bySubject.GSUBJ1.accessmodel, "SUBSCRIPTION");
  assert.equal(bySubject.GSUBJ1.deliverystatus, "PAST");
  assert.equal(bySubject.GSUBJ2.accessmodel, "FREE");
  assert.equal(bySubject.GSUBJ2.deliverystatus, "CURRENT");
  assert.equal(JSON.stringify(result.data).includes("course-sheet-one"), false);
  assert.equal(JSON.stringify(result.data).includes("course-sheet-two"), false);
  assert.equal(reads.some(read => read.spreadsheetId === "course-sheet-three"), false);
  assert.equal(reads.some(read => read.spreadsheetId === "legacy-sheet-must-not-be-used"), false);

  platformTables.AcademyLibraryAccess = [
    ['ResourceKey', 'Status', 'AccessState', 'EntitlementSource', 'SubscriptionScope'],
    ['COURSE:COURSE1:EBOOK:C1-ALL', 'ARCHIVED', 'ASSIGNED', '', '']
  ];
  const archived = await post('/api/library/catalogue', {});
  assert.equal(archived.response.status, 200);
  assert.deepEqual(resourceNames(archived.data.libraries.find(library => library.id === 'COURSE:COURSE1')),
    ['Course 1 Group 1'], 'The legacy EBOOKS category must match the canonical EBOOK policy key');
  delete platformTables.AcademyLibraryAccess;

  platformTables.GlobalSubjectAccessMatrix[1][1] = false;
  const revoked = await post('/api/library/catalogue', {});
  assert.equal(revoked.response.status, 200);
  assert.equal(revoked.data.learningAreaRefs.includes('GLOBAL:GSUBJ1'), false);
  assert.equal(revoked.data.learningAreaRefs.includes('GLOBAL:GSUBJ2'), true);

  const forbidden = await post("/api/library/course-resource/access", {
    courseId: "COURSE3",
    resourceType: "EBOOKS",
    resourceId: "NOT-AUTHORISED"
  });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.data.error, "The requested course Library is not authorised");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("V102.10 multi-course, FREE/subscription and run-status Library catalogue tests passed.");

async function post(path, body) {
  const responseValue = await worker.fetch(new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  }), env);
  return { response: responseValue, data: await responseValue.json() };
}

function resourceNames(library) {
  return library.catalogue.groups.flatMap(group => group.subjects.flatMap(subject => (
    subject.modules.flatMap(module => module.resources.map(resource => resource.name))
  ))).sort();
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
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
