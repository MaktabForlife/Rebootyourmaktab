import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { buildResourcesResponse } from "../src/routes/resources.js";

const headers = [
  "ResourceID",
  "ResourceName",
  "SubjectID",
  "Subject",
  "ModuletID",
  "Module",
  "TaskID",
  "ClassGroup",
  "Format",
  "Description",
  "Link",
  "Active",
  "CreatedDate"
];

const transformed = buildResourcesResponse({
  eBooks: {
    rows: [
      headers,
      ["E2", "Zebra Book", "S2", "Seerah", "M2", "Later", "T2", "2", "PDF", "Second", "https://example.test/zebra", "YES", "2026-07-02"],
      ["E1", "Alphabet Book", "S1", "Quran", "M1", "Basics", "T1", "1", "PDF", "First", "https://example.test/alphabet", true, "2026-07-01"],
      ["E3", "Inactive Book", "S1", "Quran", "M1", "Basics", "T3", "1", "PDF", "Hidden", "https://example.test/hidden", false, "2026-07-03"],
      ["E4", "Missing Link", "S1", "Quran", "M1", "Basics", "T4", "1", "PDF", "Hidden", "", true, "2026-07-04"]
    ]
  },
  Printable: { missing: true, rows: [] },
  Audio: { rows: [["AudioName", "AudioLink", "Active"]] },
  Video: { rows: [["VideoName", "Active"], ["", ""]] },
  OtherResource: {
    rows: [
      ["OtherResourceID", "OtherResourceName", "OtherResourceLink", "Active"],
      ["O1", "General Link", "https://example.test/general", "1"]
    ]
  }
}, {
  studentid: "STUDENT1",
  classgroup: "1"
});

assert.equal(transformed.success, true);
assert.equal(transformed.studentid, "STUDENT1");
assert.equal(transformed.classgroup, "1");
assert.equal(transformed.count, 2, "Only active, linked resources for Group 1 or all groups should remain");
assert.equal(transformed.groups.length, 5);
assert.deepEqual(transformed.groups.map(group => group.type), [
  "EBOOKS",
  "PRINTABLES",
  "AUDIO",
  "VIDEO",
  "OTHER"
]);
assert.equal(transformed.ebooks.count, 1);
assert.equal(transformed.ebooks.subjects[0].subjectname, "Quran");
assert.equal(transformed.ebooks.subjects[0].modules[0].moduleid, "M1");
assert.equal(transformed.ebooks.subjects[0].modules[0].resources[0].taskid, "T1");
assert.equal(transformed.ebooks.subjects[0].modules[0].resources[0].name, "Alphabet Book");
assert.equal(transformed.printables.warning, "Missing sheet: Printable");
assert.equal(
  transformed.video.warning,
  "Missing required name or link column in sheet: Video"
);
assert.equal(transformed.other.subjects[0].subjectname, "Unassigned Subject");
assert.equal(transformed.other.subjects[0].modules[0].modulename, "General");

const allGroupsStudentResources = buildResourcesResponse({
  eBooks: {
    rows: [
      headers,
      ["E1", "Group One", "S1", "Quran", "M1", "Basics", "T1", "1", "PDF", "One", "https://example.test/one", true, "2026-07-01"],
      ["E2", "Group Two", "S1", "Quran", "M1", "Basics", "T2", "2", "PDF", "Two", "https://example.test/two", true, "2026-07-02"],
      ["E3", "Global", "S1", "Quran", "M1", "Basics", "T3", "ALL", "PDF", "All", "https://example.test/all", true, "2026-07-03"],
      ["E4", "Group Zero Only", "S1", "Quran", "M1", "Basics", "T4", "0", "PDF", "Zero", "https://example.test/zero", true, "2026-07-04"]
    ]
  }
}, {
  studentid: "STUDENT0",
  classgroup: "0"
});

assert.equal(allGroupsStudentResources.count, 4, "Student Group 0 must receive every active resource group");
assert.deepEqual(
  allGroupsStudentResources.ebooks.subjects[0].modules[0].resources.map(resource => resource.name),
  ["Global", "Group One", "Group Two", "Group Zero Only"]
);

const normalStudentResources = buildResourcesResponse({
  eBooks: {
    rows: [
      headers,
      ["E1", "Group One", "S1", "Quran", "M1", "Basics", "T1", "1", "PDF", "One", "https://example.test/one", true, "2026-07-01"],
      ["E3", "Global", "S1", "Quran", "M1", "Basics", "T3", "ALL", "PDF", "All", "https://example.test/all", true, "2026-07-03"],
      ["E4", "Group Zero Only", "S1", "Quran", "M1", "Basics", "T4", "0", "PDF", "Zero", "https://example.test/zero", true, "2026-07-04"]
    ]
  }
}, {
  studentid: "STUDENT1",
  classgroup: "1"
});

const missingGroupResources = buildResourcesResponse({
  eBooks: { rows: [headers,
    ["E1", "Restricted", "S1", "Quran", "M1", "Basics", "T1", "1", "PDF", "One", "https://example.test/one", true, ""],
    ["E2", "All learners", "S1", "Quran", "M1", "Basics", "T2", "ALL", "PDF", "All", "https://example.test/all", true, ""]
  ] }
}, { studentid: "STUDENT-NO-GROUP", classgroup: "" });
assert.equal(missingGroupResources.count, 1, 'An empty learner group cannot open a restricted group resource');

assert.deepEqual(
  normalStudentResources.ebooks.subjects[0].modules[0].resources.map(resource => resource.name),
  ["Global", "Group One"],
  "Resource GroupNo 0 must remain literal rather than replacing ALL"
);

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
const sessionSecret = "resources-test-secret";
const directEnv = {
  SESSION_SECRET: sessionSecret,
  GOOGLE_SPREADSHEET_ID: "test-spreadsheet",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "resources-test@example.iam.gserviceaccount.com",
    private_key_id: "resources-test-key",
    private_key: toPem(pkcs8, "PRIVATE KEY"),
    token_uri: "https://oauth2.googleapis.com/token"
  }),
  M4L_BACKEND_RESOURCES: "google-sheets"
};
const token = await makeSessionToken({
  type: "student",
  studentid: "STUDENT1",
  classgroup: "1"
}, sessionSecret);
const allGroupsToken = await makeSessionToken({
  type: "student",
  studentid: "STUDENT0",
  classgroup: "0"
}, sessionSecret);
const originalFetch = globalThis.fetch;
const sheetRanges = [];

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));

  if (url.hostname === "oauth2.googleapis.com") {
    return response({ access_token: "mock-resource-token", expires_in: 3600 });
  }

  if (url.hostname === "sheets.googleapis.com") {
    assert.equal(init.headers.Authorization, "Bearer mock-resource-token");
    const range = decodeURIComponent(url.pathname.split("/values/")[1] || "");
    sheetRanges.push(range);

    if (range === "Printable!A:ZZ") {
      return response({
        error: { message: "Unable to parse range: Printable!A:ZZ" }
      }, 400);
    }

    if (range === "eBooks!A:ZZ") {
      return response({ values: [
        headers,
        ["E1", "Group One", "S1", "Quran", "M1", "Basics", "T1", "1", "PDF", "One", "https://example.test/one", true, "2026-07-01"],
        ["E2", "Group Two", "S1", "Quran", "M1", "Basics", "T2", "2", "PDF", "Two", "https://example.test/two", true, "2026-07-02"]
      ] });
    }

    return response({ values: [["ResourceName", "Link", "Active"]] });
  }

  throw new Error(`Unexpected direct-resource fetch: ${url}`);
};

try {
  const unauthorized = await worker.fetch(new Request(
    "https://worker.test/api/resources/list",
    { method: "POST" }
  ), directEnv);
  assert.equal(unauthorized.status, 401);

  for (const path of [
    "/api/resources/list",
    "/api/student/resources/list",
    "/api/admin/resources/list"
  ]) {
    const result = await worker.fetch(new Request(`https://worker.test${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ classgroup: "1" })
    }), directEnv);
    const data = await result.json();

    assert.equal(result.status, 200);
    assert.equal(result.headers.get("X-M4L-Feature"), "resources");
    assert.equal(result.headers.get("X-M4L-Backend"), "google-sheets");
    assert.equal(result.headers.get("X-M4L-Backend-Source"), "fixed");
    assert.equal(data.count, 1, "Student resource reads must enforce the current account group");
    assert.equal(data.studentid, "STUDENT1");
    assert.equal(data.classgroup, "1");
    assert.equal(data.ebooks.subjects[0].modules[0].resources[0].name, "Group One");
    assert.equal(data.printables.warning, "Missing sheet: Printable");
  }

  const allGroupsResult = await worker.fetch(new Request(
    "https://worker.test/api/student/resources/list",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${allGroupsToken}`
      },
      body: JSON.stringify({ classgroup: "1" })
    }
  ), directEnv);
  const allGroupsData = await allGroupsResult.json();

  assert.equal(allGroupsResult.status, 200);
  assert.equal(allGroupsData.classgroup, "0", "The authenticated Group 0 must override the request body");
  assert.equal(allGroupsData.count, 2);
  assert.deepEqual(
    allGroupsData.ebooks.subjects[0].modules[0].resources.map(resource => resource.name),
    ["Group One", "Group Two"]
  );

  assert.deepEqual(
    new Set(sheetRanges),
    new Set([
      "eBooks!A:ZZ",
      "Printable!A:ZZ",
      "Audio!A:ZZ",
      "Video!A:ZZ",
      "OtherResource!A:ZZ"
    ])
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Direct Resource read tests passed.");

async function makeSessionToken(payload, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + 3600 }));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  );
  const hex = Array.from(signature)
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
  return `${data}.${hex}`;
}

function base64url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function toPem(bytes, label) {
  const base64 = Buffer.from(bytes).toString("base64");
  const lines = base64.match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
