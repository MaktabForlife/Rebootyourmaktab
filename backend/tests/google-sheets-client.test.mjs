import assert from "node:assert/strict";
import {
  appendGoogleSheetValues,
  batchReadGoogleSheetValues,
  batchUpdateGoogleSpreadsheet,
  batchUpdateGoogleSheetValues,
  readGoogleSheetValues,
  readGoogleSpreadsheetSheetProperties,
  updateGoogleSheetValues
} from "../src/lib/google-sheets.js";

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
const env = {
  GOOGLE_SPREADSHEET_ID: "test-spreadsheet",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "sheets-client-test@example.iam.gserviceaccount.com",
    private_key_id: "test-key",
    private_key: toPem(pkcs8, "PRIVATE KEY"),
    token_uri: "https://oauth2.googleapis.com/token"
  })
};
const calls = [];
let oauthCalls = 0;
let retryReadAttempts = 0;
let retryFailureAttempts = 0;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method || "GET";
  calls.push({ url, method, headers: init.headers || {}, body: init.body });

  if (url.hostname === "oauth2.googleapis.com") {
    oauthCalls += 1;
    assert.equal(method, "POST");
    const form = new URLSearchParams(init.body);
    assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(form.get("assertion").split(".").length, 3);
    return response({ access_token: "mock-google-token", expires_in: 3600 });
  }

  if (url.hostname === "sheets.googleapis.com") {
    assert.equal(init.headers.Authorization, "Bearer mock-google-token");

    if (method === "GET" && url.pathname.endsWith("/values:batchGet")) {
      return response({
        valueRanges: url.searchParams.getAll("ranges").map(range => ({
          range,
          values: range === "Empty!A:B" ? undefined : [[range]]
        }))
      });
    }

    if (method === "GET" && url.pathname.includes("/values/")) {
      const decodedPath = decodeURIComponent(url.pathname);
      if (decodedPath.includes("/values/Retry!A:B")) {
        retryReadAttempts += 1;
        if (retryReadAttempts === 1) {
          return response({ error: { message: "Temporary quota pressure" } }, 503);
        }
      }
      if (decodedPath.includes("/values/RetryFail!A:B")) {
        retryFailureAttempts += 1;
        return response({ error: { message: "Persistent quota pressure" } }, 503);
      }
      return response({ values: [["Header"], ["Value"]] });
    }

    if (method === "GET") {
      return response({ sheets: [
        { properties: { sheetId: 7, title: "Data" } },
        { properties: { sheetId: 8, title: "Audit" } }
      ] });
    }

    return response({ updatedRows: 1 });
  }

  throw new Error(`Unexpected fetch: ${url}`);
};

try {
  await assert.rejects(
    () => readGoogleSheetValues({ ...env, GOOGLE_SPREADSHEET_ID: "" }, "Data!A:B"),
    /Missing GOOGLE_SPREADSHEET_ID/
  );
  await assert.rejects(
    () => readGoogleSheetValues(env, "Data!A:B", { spreadsheetId: "" }),
    /Missing explicit Google Spreadsheet ID/
  );

  const rows = await readGoogleSheetValues(env, "Data!A:B");
  assert.deepEqual(rows, [["Header"], ["Value"]]);

  await updateGoogleSheetValues(env, "Data!A2:B2", [["A", "B"]]);
  await appendGoogleSheetValues(env, "Data!A:B", [["C", "D"]]);
  await batchUpdateGoogleSheetValues(env, [
    {
      range: "Data!B2",
      majorDimension: "ROWS",
      values: [["Updated"]]
    },
    {
      range: "Data!D2",
      majorDimension: "ROWS",
      values: [[true]]
    }
  ]);
  const properties = await readGoogleSpreadsheetSheetProperties(env);
  assert.deepEqual(properties, [
    { sheetId: 7, title: "Data" },
    { sheetId: 8, title: "Audit" }
  ]);
  await batchUpdateGoogleSpreadsheet(env, [{
    deleteDimension: {
      range: { sheetId: 7, dimension: "ROWS", startIndex: 2, endIndex: 3 }
    }
  }]);
  await readGoogleSheetValues(env, "CourseRegistry!A:K", {
    spreadsheetId: "platform-spreadsheet"
  });
  const batchRows = await batchReadGoogleSheetValues(env, [
    "Data!A:B",
    "Empty!A:B",
    "Audit!A:C"
  ]);
  assert.deepEqual(batchRows, [
    [["Data!A:B"]],
    [],
    [["Audit!A:C"]]
  ]);
  const retriedRows = await readGoogleSheetValues(env, "Retry!A:B");
  assert.deepEqual(retriedRows, [["Header"], ["Value"]]);
  assert.equal(retryReadAttempts, 2, "A retryable GET should be retried once before succeeding");
  await assert.rejects(
    () => readGoogleSheetValues(env, "RetryFail!A:B"),
    error => error?.status === 503 && error?.retryable === true
  );
  assert.equal(retryFailureAttempts, 2, "V104.4 must stop after one retry for a persistent transient Google read failure");
  await assert.rejects(
    () => batchUpdateGoogleSheetValues(env, []),
    /requires at least one range/
  );
  await assert.rejects(
    () => batchUpdateGoogleSpreadsheet(env, []),
    /requires at least one request/
  );

  assert.equal(oauthCalls, 1, "The reusable client should reuse a valid access token");

  const sheetsCalls = calls.filter(call => call.url.hostname === "sheets.googleapis.com");
  assert.equal(sheetsCalls.length, 12);

  assert.equal(sheetsCalls[0].method, "GET");
  assert.equal(sheetsCalls[0].url.pathname.endsWith("/values/Data!A%3AB"), true);
  assert.equal(sheetsCalls[0].url.searchParams.get("majorDimension"), "ROWS");

  assert.equal(sheetsCalls[1].method, "PUT");
  assert.equal(sheetsCalls[1].url.pathname.endsWith("/values/Data!A2%3AB2"), true);
  assert.equal(sheetsCalls[1].url.searchParams.get("valueInputOption"), "RAW");
  assert.deepEqual(JSON.parse(sheetsCalls[1].body), {
    range: "Data!A2:B2",
    majorDimension: "ROWS",
    values: [["A", "B"]]
  });

  assert.equal(sheetsCalls[2].method, "POST");
  assert.equal(sheetsCalls[2].url.pathname.endsWith("/values/Data!A%3AB:append"), true);
  assert.equal(sheetsCalls[2].url.searchParams.get("valueInputOption"), "RAW");
  assert.equal(sheetsCalls[2].url.searchParams.get("insertDataOption"), "INSERT_ROWS");
  assert.deepEqual(JSON.parse(sheetsCalls[2].body), {
    range: "Data!A:B",
    majorDimension: "ROWS",
    values: [["C", "D"]]
  });

  assert.equal(sheetsCalls[3].method, "POST");
  assert.equal(sheetsCalls[3].url.pathname.endsWith("/values:batchUpdate"), true);
  assert.deepEqual(JSON.parse(sheetsCalls[3].body), {
    valueInputOption: "RAW",
    data: [
      {
        range: "Data!B2",
        majorDimension: "ROWS",
        values: [["Updated"]]
      },
      {
        range: "Data!D2",
        majorDimension: "ROWS",
        values: [[true]]
      }
    ]
  });
  assert.equal(sheetsCalls[4].method, "GET");
  assert.equal(sheetsCalls[4].url.searchParams.get("fields"), "sheets(properties(sheetId,title,gridProperties(rowCount)))");
  assert.equal(sheetsCalls[5].method, "POST");
  assert.equal(sheetsCalls[5].url.pathname.endsWith(":batchUpdate"), true);
  assert.deepEqual(JSON.parse(sheetsCalls[5].body), {
    requests: [{
      deleteDimension: {
        range: { sheetId: 7, dimension: "ROWS", startIndex: 2, endIndex: 3 }
      }
    }]
  });
  assert.equal(
    sheetsCalls[6].url.pathname.startsWith("/v4/spreadsheets/platform-spreadsheet/values/"),
    true,
    "An explicit spreadsheet target must override the legacy course Sheet variable"
  );
  assert.equal(sheetsCalls[6].url.pathname.endsWith("/values/CourseRegistry!A%3AK"), true);
  assert.equal(sheetsCalls[7].method, "GET");
  assert.equal(sheetsCalls[7].url.pathname.endsWith("/values:batchGet"), true);
  assert.deepEqual(sheetsCalls[7].url.searchParams.getAll("ranges"), [
    "Data!A:B",
    "Empty!A:B",
    "Audit!A:C"
  ]);
  assert.equal(sheetsCalls[8].url.pathname.endsWith("/values/Retry!A%3AB"), true);
  assert.equal(sheetsCalls[9].url.pathname.endsWith("/values/Retry!A%3AB"), true);
  assert.equal(sheetsCalls[10].url.pathname.endsWith("/values/RetryFail!A%3AB"), true);
  assert.equal(sheetsCalls[11].url.pathname.endsWith("/values/RetryFail!A%3AB"), true);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Google Sheets client tests passed.");

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
