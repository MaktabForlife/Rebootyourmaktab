/* M4L V104.4 - Reusable direct Google Sheets client with request-local reads.
   Keeps service-account authentication, token caching and generic Sheets value
   operations independent from feature-specific Worker routes. Read requests
   use bounded retry/backoff, related ranges can be fetched in one batch, and
   exact spreadsheet/range reads are deduplicated within one Worker request.
*/

import { assertGoogleServiceAccountEmailMatches } from "./google-service-account-email.js";
import { getRequestSheetsReadContext } from "./request-context.js";

let accessTokenCache = {
  key: "",
  token: "",
  expiresAt: 0
};
let accessTokenPromise = null;

const RETRYABLE_GOOGLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const GOOGLE_READ_MAX_ATTEMPTS = 2;
const GOOGLE_READ_RETRY_BASE_MS = 250;
const GOOGLE_READ_RETRY_MAX_MS = 2000;

export class GoogleSheetsApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "GoogleSheetsApiError";
    this.status = Number(status) || 0;
    this.retryable = RETRYABLE_GOOGLE_STATUSES.has(this.status);
    this.code = this.retryable
      ? "GOOGLE_SHEETS_TEMPORARILY_UNAVAILABLE"
      : "GOOGLE_SHEETS_REQUEST_FAILED";
  }
}

export function isRetryableGoogleSheetsError(error) {
  if (error?.retryable === true) return true;
  const status = Number(error?.status);
  if (RETRYABLE_GOOGLE_STATUSES.has(status)) return true;
  const match = /Google Sheets API error\s+(\d{3})/i.exec(String(error?.message || ""));
  return Boolean(match && RETRYABLE_GOOGLE_STATUSES.has(Number(match[1])));
}

export async function readGoogleSheetValues(env, range, target = {}) {
  const spreadsheetId = getGoogleSpreadsheetId(env, target);
  const normalizedRange = normalizeReadRangeKey(range);
  if (!normalizedRange) {
    throw new Error("Google Sheets read range cannot be empty");
  }

  const readContext = getRequestSheetsReadContext(env);

  if (!readContext) {
    return readGoogleSheetValuesUncached(env, normalizedRange, spreadsheetId);
  }

  const cache = getSpreadsheetReadCache(readContext, spreadsheetId);
  let rowsPromise = cache.get(normalizedRange);

  if (!rowsPromise) {
    rowsPromise = readGoogleSheetValuesUncached(env, normalizedRange, spreadsheetId)
      .then(rows => copyGoogleSheetRows(rows));
    cache.set(normalizedRange, rowsPromise);
  }

  return copyGoogleSheetRows(await rowsPromise);
}

export async function batchReadGoogleSheetValues(env, ranges, target = {}) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error("Google Sheets batch read requires at least one range");
  }

  const normalizedRanges = ranges.map(range => String(range || "").trim());
  if (normalizedRanges.some(range => !range)) {
    throw new Error("Google Sheets batch read ranges cannot be empty");
  }

  const spreadsheetId = getGoogleSpreadsheetId(env, target);
  const readContext = getRequestSheetsReadContext(env);

  if (!readContext) {
    return batchReadGoogleSheetValuesUncached(env, normalizedRanges, spreadsheetId);
  }

  const cache = getSpreadsheetReadCache(readContext, spreadsheetId);
  const missingRanges = [];
  const seenMissingRanges = new Set();

  for (const range of normalizedRanges) {
    if (!cache.has(range) && !seenMissingRanges.has(range)) {
      seenMissingRanges.add(range);
      missingRanges.push(range);
    }
  }

  if (missingRanges.length > 0) {
    // Store one promise per requested range before awaiting the batch. A second
    // helper that asks for any of these ranges concurrently reuses the same
    // in-flight Google request instead of issuing another read.
    const batchPromise = batchReadGoogleSheetValuesUncached(
      env,
      missingRanges,
      spreadsheetId
    );
    missingRanges.forEach((range, index) => {
      cache.set(
        range,
        batchPromise.then(rowSets => copyGoogleSheetRows(rowSets[index] || []))
      );
    });
  }

  return Promise.all(normalizedRanges.map(async range => (
    copyGoogleSheetRows(await cache.get(range))
  )));
}

async function readGoogleSheetValuesUncached(env, range, spreadsheetId) {
  const result = await callGoogleSheetsValuesApi(env, range, {
    method: "GET",
    query: {
      majorDimension: "ROWS"
    },
    spreadsheetId
  });

  return Array.isArray(result.values) ? result.values : [];
}

async function batchReadGoogleSheetValuesUncached(env, normalizedRanges, spreadsheetId) {
  const accessToken = await getGoogleSheetsAccessToken(env);
  const query = new URLSearchParams({ majorDimension: "ROWS" });
  normalizedRanges.forEach(range => query.append("ranges", range));
  const url = [
    "https://sheets.googleapis.com/v4/spreadsheets/",
    encodeURIComponent(spreadsheetId),
    "/values:batchGet?",
    query.toString()
  ].join("");
  const response = await fetchGoogleSheetsReadWithRetry(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json;charset=UTF-8"
    }
  });
  const result = await parseGoogleSheetsResponse(response);
  const valueRanges = Array.isArray(result.valueRanges) ? result.valueRanges : [];

  return normalizedRanges.map((range, index) => {
    const valueRange = valueRanges[index];
    return Array.isArray(valueRange?.values) ? valueRange.values : [];
  });
}

export async function updateGoogleSheetValues(env, range, values, target = {}) {
  const spreadsheetId = getGoogleSpreadsheetId(env, target);
  const result = await callGoogleSheetsValuesApi(env, range, {
    method: "PUT",
    query: {
      valueInputOption: "RAW"
    },
    body: {
      range,
      majorDimension: "ROWS",
      values
    },
    spreadsheetId
  });
  invalidateSpreadsheetReadCache(env, spreadsheetId);
  return result;
}

export async function appendGoogleSheetValues(env, range, values, target = {}) {
  const spreadsheetId = getGoogleSpreadsheetId(env, target);
  const result = await callGoogleSheetsValuesApi(env, range, {
    method: "POST",
    action: "append",
    query: {
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS"
    },
    body: {
      range,
      majorDimension: "ROWS",
      values
    },
    spreadsheetId
  });
  invalidateSpreadsheetReadCache(env, spreadsheetId);
  return result;
}

export async function batchUpdateGoogleSheetValues(env, data, target = {}) {
  const spreadsheetId = getGoogleSpreadsheetId(env, target);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Google Sheets batch update requires at least one range");
  }

  const accessToken = await getGoogleSheetsAccessToken(env);
  const url = [
    "https://sheets.googleapis.com/v4/spreadsheets/",
    encodeURIComponent(spreadsheetId),
    "/values:batchUpdate"
  ].join("");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json;charset=UTF-8"
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data
    })
  });

  const result = await parseGoogleSheetsResponse(response);
  invalidateSpreadsheetReadCache(env, spreadsheetId);
  return result;
}

export async function readGoogleSpreadsheetSheetProperties(env, target = {}) {
  const spreadsheetId = getGoogleSpreadsheetId(env, target);
  const accessToken = await getGoogleSheetsAccessToken(env);
  const url = [
    "https://sheets.googleapis.com/v4/spreadsheets/",
    encodeURIComponent(spreadsheetId),
    target.includeGrid ? "?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))" : "?fields=sheets(properties(sheetId,title))"
  ].join("");
  const response = await fetchGoogleSheetsReadWithRetry(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json;charset=UTF-8"
    }
  });
  const data = await parseGoogleSheetsResponse(response);
  return (Array.isArray(data.sheets) ? data.sheets : []).map(sheet => ({
    sheetId: Number(sheet?.properties?.sheetId),
    title: String(sheet?.properties?.title || "").trim(),
    ...(target.includeGrid ? { rowCount: Number(sheet?.properties?.gridProperties?.rowCount) || 1000 } : {})
  })).filter(sheet => Number.isInteger(sheet.sheetId) && sheet.title);
}

export async function batchUpdateGoogleSpreadsheet(env, requests, target = {}) {
  const spreadsheetId = getGoogleSpreadsheetId(env, target);

  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error("Google Sheets spreadsheet batch update requires at least one request");
  }

  const accessToken = await getGoogleSheetsAccessToken(env);
  const url = [
    "https://sheets.googleapis.com/v4/spreadsheets/",
    encodeURIComponent(spreadsheetId),
    ":batchUpdate"
  ].join("");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json;charset=UTF-8"
    },
    body: JSON.stringify({ requests })
  });
  const result = await parseGoogleSheetsResponse(response);
  invalidateSpreadsheetReadCache(env, spreadsheetId);
  return result;
}

function normalizeReadRangeKey(range) {
  return String(range ?? "").trim();
}

function getSpreadsheetReadCache(readContext, spreadsheetId) {
  let cache = readContext.get(spreadsheetId);
  if (!cache) {
    cache = new Map();
    readContext.set(spreadsheetId, cache);
  }
  return cache;
}

function invalidateSpreadsheetReadCache(env, spreadsheetId) {
  const readContext = getRequestSheetsReadContext(env);
  if (readContext) readContext.delete(spreadsheetId);
}

function copyGoogleSheetRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => (Array.isArray(row) ? [...row] : []));
}

function getGoogleSpreadsheetId(env, target = {}) {
  const hasExplicitTarget = Object.prototype.hasOwnProperty.call(target, "spreadsheetId");
  const spreadsheetId = String(
    hasExplicitTarget ? target.spreadsheetId : env.GOOGLE_SPREADSHEET_ID || ""
  ).trim();

  if (!spreadsheetId) {
    if (hasExplicitTarget) {
      throw new Error("Missing explicit Google Spreadsheet ID");
    }
    throw new Error("Missing GOOGLE_SPREADSHEET_ID Worker variable");
  }

  return spreadsheetId;
}

function getGoogleServiceAccountConfig(env) {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON Worker secret");
  }

  let config = raw;

  if (typeof raw === "string") {
    try {
      config = JSON.parse(raw);
    } catch (error) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
    }
  }

  if (!config || config.type !== "service_account") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must be a service-account credential");
  }

  if (!config.client_email || !config.private_key) {
    throw new Error("Google service-account credential is incomplete");
  }

  assertGoogleServiceAccountEmailMatches(env, config.client_email);

  const tokenUri = String(config.token_uri || "https://oauth2.googleapis.com/token").trim();
  const allowedTokenUris = new Set([
    "https://oauth2.googleapis.com/token",
    "https://accounts.google.com/o/oauth2/token"
  ]);

  if (!allowedTokenUris.has(tokenUri)) {
    throw new Error("Google service-account token URI is not allowed");
  }

  return {
    ...config,
    token_uri: tokenUri,
    private_key: String(config.private_key).replace(/\\n/g, "\n")
  };
}

async function getGoogleSheetsAccessToken(env) {
  const config = getGoogleServiceAccountConfig(env);
  const cacheKey = `${config.client_email}|${config.private_key_id || ""}`;
  const nowMs = Date.now();

  if (
    accessTokenCache.key === cacheKey &&
    accessTokenCache.token &&
    accessTokenCache.expiresAt > nowMs + 60000
  ) {
    return accessTokenCache.token;
  }

  if (accessTokenPromise) {
    const pendingResult = await accessTokenPromise;
    return pendingResult.accessToken;
  }

  accessTokenPromise = requestGoogleSheetsAccessToken(config).finally(() => {
    accessTokenPromise = null;
  });

  const tokenResult = await accessTokenPromise;
  accessTokenCache = {
    key: cacheKey,
    token: tokenResult.accessToken,
    expiresAt: nowMs + Math.max(300, tokenResult.expiresIn - 60) * 1000
  };

  return tokenResult.accessToken;
}

async function requestGoogleSheetsAccessToken(config) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedClaims = base64urlText(JSON.stringify({
    iss: config.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: config.token_uri,
    iat: now,
    exp: now + 3600
  }));
  const unsignedJwt = `${encodedHeader}.${encodedClaims}`;
  const privateKey = await importGoogleServiceAccountPrivateKey(config.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(unsignedJwt)
  );
  const assertion = `${unsignedJwt}.${base64urlBytes(new Uint8Array(signature))}`;
  const response = await fetch(config.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }).toString()
  });
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Google OAuth returned invalid JSON (HTTP ${response.status})`);
  }

  if (!response.ok || !data.access_token) {
    const message = data.error_description || data.error || "Access token request failed";
    throw new Error(`Google OAuth error ${response.status}: ${String(message).slice(0, 240)}`);
  }

  return {
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in || 3600)
  };
}

async function importGoogleServiceAccountPrivateKey(pem) {
  const base64 = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  if (!base64) {
    throw new Error("Google service-account private key is empty");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64urlText(input) {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function callGoogleSheetsValuesApi(env, range, options = {}) {
  const spreadsheetId = options.spreadsheetId;

  const accessToken = await getGoogleSheetsAccessToken(env);
  const query = new URLSearchParams(options.query || {});
  const queryText = query.toString();
  const actionSuffix = options.action === "append" ? ":append" : "";
  const url = [
    "https://sheets.googleapis.com/v4/spreadsheets/",
    encodeURIComponent(spreadsheetId),
    "/values/",
    encodeURIComponent(range),
    actionSuffix,
    queryText ? `?${queryText}` : ""
  ].join("");
  const requestOptions = {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json;charset=UTF-8"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  };
  const response = String(requestOptions.method).toUpperCase() === "GET"
    ? await fetchGoogleSheetsReadWithRetry(url, requestOptions)
    : await fetch(url, requestOptions);

  return parseGoogleSheetsResponse(response);
}

async function fetchGoogleSheetsReadWithRetry(url, init) {
  let response;

  for (let attempt = 0; attempt < GOOGLE_READ_MAX_ATTEMPTS; attempt += 1) {
    response = await fetch(url, init);
    if (!RETRYABLE_GOOGLE_STATUSES.has(response.status) || attempt === GOOGLE_READ_MAX_ATTEMPTS - 1) {
      return response;
    }

    try {
      await response.body?.cancel();
    } catch (error) {
      // A response body that cannot be cancelled does not prevent a safe GET retry.
    }

    await waitForGoogleReadRetry(response, attempt);
  }

  return response;
}

async function waitForGoogleReadRetry(response, attempt) {
  const retryAfter = Number(response.headers.get("Retry-After"));
  const exponential = GOOGLE_READ_RETRY_BASE_MS * (2 ** attempt);
  const jitter = Math.floor(Math.random() * GOOGLE_READ_RETRY_BASE_MS);
  const requestedDelay = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : exponential + jitter;
  const delay = Math.min(GOOGLE_READ_RETRY_MAX_MS, Math.max(GOOGLE_READ_RETRY_BASE_MS, requestedDelay));
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function parseGoogleSheetsResponse(response) {
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new GoogleSheetsApiError(
      response.status,
      `Google Sheets returned invalid JSON (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : "Google Sheets request failed";
    throw new GoogleSheetsApiError(
      response.status,
      `Google Sheets API error ${response.status}: ${String(message).slice(0, 240)}`
    );
  }

  return data;
}
