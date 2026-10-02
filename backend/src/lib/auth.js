import { readGoogleSheetValues } from "./google-sheets.js";
import { json } from "./http.js";
import { accessibleGlobalSubjectIds } from "./global-subject-delivery.js";
import {
  getPlatformSpreadsheetId,
  readPlatformSheet,
  readPlatformSheets,
  resolveActiveCourseRegistration
} from "./platform-sheet.js";
import {
  isActivePlatformValue,
  normalizePlatformIdentifier
} from "./platform-schema.js";
import { getRequestAuthUser } from "./request-context.js";
import { readProgramRoleAccounts } from "../profiles/program-roles.js";

const PIN_HASH_VERSION = "v2";
const PIN_HASH_ALGORITHM = "pbkdf2-sha256";
const PIN_HASH_ITERATIONS = 100000;
const PIN_SALT_BYTES = 16;
const PIN_DERIVED_KEY_BYTES = 32;
const CREDENTIAL_SESSION_VERSION = 2;

export async function createSessionToken(payload, env) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const {
    credentialHash = "",
    authrow = 0,
    ...sessionPayload
  } = payload || {};

  if (credentialHash) {
    const normalizedAuthRow = Number(authrow);

    if (!Number.isInteger(normalizedAuthRow) || normalizedAuthRow < 2) {
      throw new Error("Credential-bound session requires a valid authentication row");
    }

    sessionPayload.authrow = normalizedAuthRow;
    sessionPayload.cv = await createCredentialVersion(credentialHash, env.SESSION_SECRET);
    sessionPayload.sv = CREDENTIAL_SESSION_VERSION;
  }

  const body = {
    ...sessionPayload,
    iat: now,
    exp: now + 60 * 60 * 24 * 7
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;
  const signature = await sign(data, env.SESSION_SECRET);

  return `${data}.${signature}`;
}

export async function verifySessionToken(token, env) {
  try {
    const parts = String(token || "").split(".");

    if (parts.length !== 3) {
      return null;
    }

    const [header, body, signature] = parts;
    const data = `${header}.${body}`;
    const expectedSignature = await sign(data, env.SESSION_SECRET);

    if (!constantTimeEqual(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(decodeBase64urlText(body));
    const now = Math.floor(Date.now() / 1000);

    if (!payload || !Number.isFinite(payload.exp) || payload.exp < now) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireSecret(secret, "SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return bytesToHex(new Uint8Array(signature));
}

function base64url(input) {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function requireAdminOrSenior(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return {
      ok: false,
      response: json({ success: false, error: "Unauthorized" }, 401)
    };
  }

  if (authUser.role !== "ADMIN" && authUser.role !== "SENIOR") {
    return {
      ok: false,
      response: json({ success: false, error: "Forbidden" }, 403)
    };
  }

  return {
    ok: true,
    user: authUser
  };
}

export async function requireSystemAdmin(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return {
      ok: false,
      response: json({ success: false, error: "Unauthorized" }, 401)
    };
  }

  if (authUser.role !== "ADMIN") {
    return {
      ok: false,
      response: json({ success: false, error: "Forbidden" }, 403)
    };
  }

  return {
    ok: true,
    user: authUser
  };
}

export async function requireResourceCreator(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser || authUser.type !== "admin") {
    return {
      ok: false,
      response: json({ success: false, error: "Unauthorized" }, 401)
    };
  }

  if (!["ADMIN", "SENIOR", "TEACHER"].includes(authUser.role)) {
    return {
      ok: false,
      response: json({ success: false, error: "Forbidden" }, 403)
    };
  }

  return {
    ok: true,
    user: authUser
  };
}

export async function getAuthUser(request, env, {allowProgram=false}={}) {
  const requestUser = getRequestAuthUser(request);
  if (requestUser) return requestUser;

  const auth = request.headers.get("Authorization");

  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.replace("Bearer ", "").trim();
  const payload = await verifySessionToken(token, env);

  if (!payload) {
    return null;
  }

  // Central V102 account tokens are always revalidated. The legacy feature flag
  // remains only for the pre-V102 admin/student sessions during staged cutover.
  if (payload.type === "account") {
    return validateCredentialBoundSession(payload, env, {allowProgram});
  }

  if (!requiresCredentialBoundSessions(env)) {
    return payload;
  }

  return validateCredentialBoundSession(payload, env, {allowProgram});
}

/*
 * Legacy V99 and earlier PIN hash. This remains only for transparent migration.
 * New PINs must use createSaltedPinHash().
 */
export async function hashPin(pin, secret) {
  const data = new TextEncoder().encode(
    String(pin) + requireSecret(secret, "PIN_SECRET")
  );
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return bytesToHex(new Uint8Array(hashBuffer));
}

export async function createSaltedPinHash(pin, secret, options = {}) {
  if (!isValidFourDigitPin(pin)) {
    throw new Error("PIN must be exactly four digits");
  }

  const iterations = Number(options.iterations || PIN_HASH_ITERATIONS);

  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
    throw new Error("Invalid PIN hashing iteration count");
  }

  const salt = options.salt instanceof Uint8Array
    ? options.salt
    : crypto.getRandomValues(new Uint8Array(PIN_SALT_BYTES));

  if (salt.length < PIN_SALT_BYTES) {
    throw new Error("PIN salt must be at least 16 bytes");
  }

  const derivedKey = await derivePinKey(pin, secret, salt, iterations);

  return [
    PIN_HASH_VERSION,
    PIN_HASH_ALGORITHM,
    iterations,
    base64urlBytes(salt),
    bytesToHex(derivedKey)
  ].join("$");
}

export async function verifyPin(pin, storedHash, secret) {
  if (!isValidFourDigitPin(pin)) {
    return { valid: false, needsMigration: false, upgradedHash: "" };
  }

  const normalizedStoredHash = String(storedHash || "").trim();

  if (!normalizedStoredHash) {
    return { valid: false, needsMigration: false, upgradedHash: "" };
  }

  const saltedHash = parseSaltedPinHash(normalizedStoredHash);

  if (saltedHash) {
    const derivedKey = await derivePinKey(
      pin,
      secret,
      saltedHash.salt,
      saltedHash.iterations
    );
    const valid = constantTimeEqual(
      bytesToHex(derivedKey),
      saltedHash.derivedKeyHex
    );

    return { valid, needsMigration: false, upgradedHash: "" };
  }

  const legacyHash = await hashPin(pin, secret);
  const valid = constantTimeEqual(legacyHash, normalizedStoredHash);

  return {
    valid,
    needsMigration: valid,
    upgradedHash: valid ? await createSaltedPinHash(pin, secret) : ""
  };
}

export function isSaltedPinHash(value) {
  return parseSaltedPinHash(String(value || "").trim()) !== null;
}

export function isValidFourDigitPin(pin) {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

export async function createAuthRateLimitKey(accountType, uniqueid, env) {
  const type = String(accountType || "unknown").trim().toLowerCase();
  const account = String(uniqueid || "").trim();
  const keyMaterial = `m4l-login:${type}:${account}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireSecret(env.PIN_SECRET, "PIN_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(keyMaterial)
  );

  return `${type}:${bytesToHex(new Uint8Array(signature)).slice(0, 40)}`;
}

export function normalizeWhatsapp6(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "999999";
  }

  return digits.slice(-6).padStart(6, "0");
}

async function derivePinKey(pin, secret, salt, iterations) {
  const passwordMaterial = new TextEncoder().encode(
    `${pin}\u0000${requireSecret(secret, "PIN_SECRET")}`
  );
  const key = await crypto.subtle.importKey(
    "raw",
    passwordMaterial,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    },
    key,
    PIN_DERIVED_KEY_BYTES * 8
  );

  return new Uint8Array(derivedBits);
}

function parseSaltedPinHash(value) {
  const parts = String(value || "").split("$");

  if (
    parts.length !== 5 ||
    parts[0] !== PIN_HASH_VERSION ||
    parts[1] !== PIN_HASH_ALGORITHM
  ) {
    return null;
  }

  const iterations = Number(parts[2]);

  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000) {
    return null;
  }

  let salt;

  try {
    salt = base64urlToBytes(parts[3]);
  } catch (error) {
    return null;
  }

  if (salt.length < PIN_SALT_BYTES || !/^[0-9a-f]{64}$/i.test(parts[4])) {
    return null;
  }

  return {
    iterations,
    salt,
    derivedKeyHex: parts[4].toLowerCase()
  };
}

async function createCredentialVersion(credentialHash, sessionSecret) {
  return sign(`credential:${String(credentialHash || "")}`, sessionSecret);
}

async function validateCredentialBoundSession(payload, env, {allowProgram=false}={}) {
  if (
    payload.sv !== CREDENTIAL_SESSION_VERSION ||
    !Number.isInteger(payload.authrow) ||
    payload.authrow < 2 ||
    typeof payload.cv !== "string" ||
    !payload.cv
  ) {
    return null;
  }

  if (payload.type === "account") {
    return validateCentralAccountSession(payload, env, {allowProgram});
  }

  let range;
  let expectedId;
  let pinSetupColumn;
  let pinHashColumn;
  let activeColumn;

  if (payload.type === "student") {
    range = `StudentRecords!A${payload.authrow}:K${payload.authrow}`;
    expectedId = String(payload.studentid || "").trim();
    pinSetupColumn = 4;
    pinHashColumn = 5;
    activeColumn = 10;
  } else if (payload.type === "admin") {
    range = `AdminRecords!A${payload.authrow}:J${payload.authrow}`;
    expectedId = String(payload.adminid || "").trim();
    pinSetupColumn = 3;
    pinHashColumn = 4;
    activeColumn = 7;
  } else {
    return null;
  }

  const rows = await readGoogleSheetValues(env, range);
  const row = Array.isArray(rows[0]) ? rows[0] : [];

  if (
    String(row[0] || "").trim() !== expectedId ||
    !normalizeBooleanCell(row[pinSetupColumn]) ||
    !normalizeBooleanCell(row[activeColumn])
  ) {
    return null;
  }

  const currentHash = String(row[pinHashColumn] || "").trim();

  if (!currentHash) {
    return null;
  }

  const currentVersion = await createCredentialVersion(currentHash, env.SESSION_SECRET);

  if (!constantTimeEqual(payload.cv, currentVersion)) {
    return null;
  }

  if (payload.type === "student") {
    const currentClassGroup = String(row[6] ?? "").trim();
    const tokenClassGroup = String(payload.classgroup ?? "").trim();

    return currentClassGroup === tokenClassGroup
      ? { ...payload, classgroup: currentClassGroup }
      : null;
  }

  const currentRole = normalizeAdminRole(row[5]);
  const tokenRole = normalizeAdminRole(payload.role);
  const currentAssignedGroup = String(row[6] ?? "").trim();
  const tokenAssignedGroup = String(payload.assignedgroup ?? "").trim();

  if (
    !currentRole ||
    currentRole !== tokenRole ||
    currentAssignedGroup !== tokenAssignedGroup
  ) {
    return null;
  }

  return {
    ...payload,
    role: currentRole,
    assignedgroup: currentAssignedGroup
  };
}

async function validateCentralAccountSession(payload, env, {allowProgram=false}={}) {
  const platformSpreadsheetId = getPlatformSpreadsheetId(env);
  const accountId = normalizePlatformIdentifier(payload.accountid);
  const uniqueId = String(payload.uniqueid || "").trim();
  const tokenRole = normalizePlatformIdentifier(payload.role);
  const tokenScope = normalizePlatformIdentifier(payload.scope);
  if (!accountId || !uniqueId || !["PLATFORM", "COURSE", "GLOBAL"].includes(tokenScope)) {
    return null;
  }

  const accountRows = await readGoogleSheetValues(
    env,
    `UserAccounts!A${payload.authrow}:N${payload.authrow}`,
    { spreadsheetId: platformSpreadsheetId }
  );
  const accountRow = Array.isArray(accountRows[0]) ? accountRows[0] : [];
  const currentAccountId = normalizePlatformIdentifier(accountRow[0]);
  const currentUniqueId = String(accountRow[2] || "").trim();
  const currentHash = String(accountRow[4] || "").trim();
  const platformRole = normalizePlatformIdentifier(accountRow[13]);

  if (
    currentAccountId !== accountId ||
    currentUniqueId !== uniqueId ||
    !normalizeBooleanCell(accountRow[3]) ||
    !isActivePlatformValue(accountRow[5]) ||
    !currentHash
  ) {
    return null;
  }

  const currentVersion = await createCredentialVersion(currentHash, env.SESSION_SECRET);
  if (!constantTimeEqual(payload.cv, currentVersion)) {
    return null;
  }

  const isGlobalAdmin = platformRole === "GLOBAL_ADMIN";
  if (tokenScope === "PLATFORM") {
    if (!isGlobalAdmin || tokenRole !== "GLOBAL_ADMIN") return null;
    return {
      ...payload,
      accountid: String(accountRow[0] || "").trim(),
      username: String(accountRow[1] || "").trim(),
      role: "GLOBAL_ADMIN",
      scope: "PLATFORM",
      courseid: "",
      courserecordid: "",
      accessid: ""
    };
  }


  if (tokenScope === "GLOBAL") {
    if (tokenRole !== "STUDENT") return null;

    const globalTables = await readPlatformSheets(env, [
      "GlobalSubjectAccessMatrix",
      "GlobalSubjectAccessPolicy",
      "GlobalSubjectList"
    ]);
    const accessRecords = globalTables.GlobalSubjectAccessMatrix;
    const policyRows = globalTables.GlobalSubjectAccessPolicy;
    const globalSubjects = globalTables.GlobalSubjectList;
    const accessibleIds = accessibleGlobalSubjectIds({
      account: {
        AccountID: String(accountRow[0] || "").trim(),
        Active: accountRow[5]
      },
      subjects: globalSubjects,
      policyRows,
      accessRows: accessRecords
    });
    if (!accessibleIds.size) return null;

    return {
      ...payload,
      accountid: String(accountRow[0] || "").trim(),
      username: String(accountRow[1] || "").trim(),
      role: "STUDENT",
      scope: "GLOBAL",
      courseid: "",
      coursename: "Global Subjects",
      courserecordid: "",
      accessid: ""
    };
  }

  const courseId = String(payload.courseid || "").trim();
  if (!courseId) return null;
  let course;
  try{course=await resolveActiveCourseRegistration(env, courseId, {allowProgram});}
  catch(error){if(/Program teaching is not enabled in this release/.test(String(error.message)))return null;throw error;}
  if(course.schemaVersion.includes('-program')&&!['GLOBAL_ADMIN','ADMIN','SENIOR','TEACHER'].includes(tokenRole))return null;

  if (isGlobalAdmin) {
    if (tokenRole !== "GLOBAL_ADMIN") return null;
    return {
      ...payload,
      accountid: String(accountRow[0] || "").trim(),
      username: String(accountRow[1] || "").trim(),
      role: "GLOBAL_ADMIN",
      scope: "COURSE",
      courseid: course.courseId,
      coursename: course.courseName,
      coursespreadsheetid: course.spreadsheetId,
      courserecordid: "",
      accessid: ""
    };
  }

  if(course.schemaVersion.includes('-program')){
    const roles=await readProgramRoleAccounts(env,course.courseId);
    if(!roles.some(row=>normalizePlatformIdentifier(row.AccountID)===accountId&&row.Active&&row.Roles.includes(tokenRole)))return null;
    if(!payload.accessrow&&!payload.accessid&&!payload.courserecordid){
      return {...payload,accountid:String(accountRow[0]||'').trim(),username:String(accountRow[1]||'').trim(),role:tokenRole,scope:'COURSE',courseid:course.courseId,coursename:course.courseName,coursespreadsheetid:course.spreadsheetId,courserecordid:'',accessid:''};
    }
  }

  if (!Number.isInteger(payload.accessrow) || payload.accessrow < 2) return null;
  const accessRows = await readGoogleSheetValues(
    env,
    `UserCourseAccess!A${payload.accessrow}:N${payload.accessrow}`,
    { spreadsheetId: platformSpreadsheetId }
  );
  const accessRow = Array.isArray(accessRows[0]) ? accessRows[0] : [];
  const currentRole = normalizePlatformIdentifier(accessRow[3]);
  const currentCourseId = normalizePlatformIdentifier(accessRow[2]);
  const courseRecordId = String(accessRow[13] || "").trim();

  if (
    normalizePlatformIdentifier(accessRow[1]) !== accountId ||
    currentCourseId !== normalizePlatformIdentifier(course.courseId) ||
    currentRole !== tokenRole ||
    !isActivePlatformValue(accessRow[4]) ||
    String(accessRow[0] || "").trim() !== String(payload.accessid || "").trim() ||
    courseRecordId !== String(payload.courserecordid || "").trim() ||
    !courseRecordId
  ) {
    return null;
  }

  return {
    ...payload,
    accountid: String(accountRow[0] || "").trim(),
    username: String(accountRow[1] || "").trim(),
    role: currentRole,
    scope: "COURSE",
    courseid: course.courseId,
    coursename: course.courseName,
    coursespreadsheetid: course.spreadsheetId,
    courserecordid: courseRecordId,
    accessid: String(accessRow[0] || "").trim()
  };
}

function normalizeAdminRole(value) {
  const role = String(value || "").trim().toUpperCase();
  return ["ADMIN", "SENIOR", "TEACHER"].includes(role) ? role : "";
}

function requiresCredentialBoundSessions(env) {
  return String(env.M4L_REQUIRE_CREDENTIAL_BOUND_SESSIONS || "")
    .trim()
    .toLowerCase() === "true";
}

function normalizeBooleanCell(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function constantTimeEqual(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let difference = leftText.length ^ rightText.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function bytesToHex(bytes) {
  return [...bytes]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base64urlBytes(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeBase64urlText(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function requireSecret(value, name) {
  const secret = String(value || "");

  if (!secret) {
    throw new Error(`Missing ${name} Worker secret`);
  }

  return secret;
}
