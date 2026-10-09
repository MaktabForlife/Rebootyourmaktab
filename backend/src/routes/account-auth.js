/* M4L V104.1 - Central account authentication with batched Platform reads and FREE/PAID contexts. */

import {
  createAuthRateLimitKey,
  createSaltedPinHash,
  createSessionToken,
  getAuthUser,
  isValidFourDigitPin,
  verifyPin
} from "../lib/auth.js";
import { batchUpdateGoogleSheetValues } from "../lib/google-sheets.js";
import { json } from "../lib/http.js";
import { accessibleGlobalSubjectIds } from "../lib/global-subject-delivery.js";
import {
  assertCourseContextAccess,
  getPlatformSpreadsheetId,
  readPlatformSheet,
  readPlatformSheets,
  resolveActiveCourseRegistration,
  selectAutomaticAccountContext
} from "../lib/platform-sheet.js";
import {
  authorityRank,
  isActivePlatformValue,
  isGlobalAdminAccount,
  normalizePlatformIdentifier
} from "../lib/platform-schema.js";
import { readProgramRoleAccountsForPrograms } from "../profiles/program-roles.js";
import { programService } from "../programs/service.js";
import { sheetsProgramRepository } from "../programs/sheets-repository.js";

const SUPPORTED_PLATFORM_SCHEMA_VERSIONS = new Set(["102.0.3", "102.0.4", "102.0.5", "102.0.6", "102.0.7", "102.0.8", "102.0.9", "102.0.10", "102.0.11", "102.0.12"]);
const LOGIN_RATE_LIMIT_SECONDS = 60;
const COURSE_ROLES = new Set(["ADMIN", "SENIOR", "TEACHER", "STUDENT"]);

export async function checkAccountEndpoint(request, env) {
  try {
    const body = await request.json();
    const uniqueId = String(body.uniqueid || "").trim();
    if (!uniqueId) return json({ success: false, error: "Missing uniqueid" }, 400);

    const state = await loadCentralAccountState(env, uniqueId, { includeContexts: false });
    if (!state.account) return json({ success: false, error: "Invalid account link" }, 404);
    if (!isActivePlatformValue(state.account.Active)) {
      return json({ success: false, error: "Account disabled" }, 403);
    }

    return json({
      success: true,
      account: publicAccount(state.account, true),
      unifiedLoginStage: "CENTRAL_CONTEXT_VERIFICATION"
    });
  } catch (error) {
    return accountServiceError(error, env);
  }
}

export async function setupAccountPinEndpoint(request, env) {
  try {
    const body = await request.json();
    const uniqueId = String(body.uniqueid || "").trim();
    const pin = body.pin;
    const pinConfirmation = body.pinConfirmation;
    if (!uniqueId) return json({ success: false, error: "Missing uniqueid" }, 400);
    if (!isValidFourDigitPin(pin)) return invalidPinResponse();
    if (!isValidFourDigitPin(pinConfirmation) || pinConfirmation !== pin) {
      return json({
        success: false,
        error: "PIN confirmation must match the 4-digit PIN",
        code: "PIN_CONFIRMATION_MISMATCH"
      }, 400);
    }

    const state = await loadCentralAccountState(env, uniqueId, { includeAudit: true });
    const accountError = validateLoginAccount(state.account);
    if (accountError) return accountError;
    if (pinAlreadyConfigured(state.account)) {
      return json({
        success: false,
        error: "PIN is already set. An authorised administrator must reset it before a new PIN can be created.",
        code: "PIN_ALREADY_SET"
      }, 409);
    }

    const selected = selectUsableAutomaticContext(state);
    const pinHash = await createSaltedPinHash(pin, env.PIN_SECRET);
    const timestamp = new Date().toISOString();
    await writeAccountLoginState(
      env,
      state.account,
      selected,
      timestamp,
      pinHash,
      state.auditRecords,
      "ACCOUNT_PIN_SETUP_SELF"
    );
    const session = await createAccountSession(env, state, selected, pinHash);

    return json({
      success: true,
      message: "Account PIN created and central login successful",
      ...sessionResponse(state, session)
    });
  } catch (error) {
    return accountServiceError(error, env);
  }
}

export async function accountLoginEndpoint(request, env) {
  let stage = "request";
  try {
    const body = await request.json();
    const uniqueId = String(body.uniqueid || "").trim();
    const pin = body.pin;
    if (!uniqueId) return json({ success: false, error: "Missing uniqueid" }, 400);
    if (!isValidFourDigitPin(pin)) return invalidPinResponse();

    stage = "rate-limit";
    const throttled = await enforceLoginRateLimit(env, uniqueId);
    if (throttled) return throttled;

    stage = "account-read";
    const state = await loadCentralAccountState(env, uniqueId);
    const accountError = validateLoginAccount(state.account);
    if (accountError) return accountError;
    if (!isActivePlatformValue(state.account.PINSetup) || !String(state.account.PINHash || "").trim()) {
      return json({ success: false, error: "Account PIN not set up yet" }, 403);
    }

    stage = "pin-verification";
    const verification = await verifyPin(pin, state.account.PINHash, env.PIN_SECRET);
    if (!verification.valid) return json({ success: false, error: "Incorrect PIN" }, 401);

    const selected = selectUsableAutomaticContext(state);
    const credentialHash = verification.needsMigration
      ? verification.upgradedHash
      : String(state.account.PINHash || "").trim();
    const timestamp = new Date().toISOString();
    stage = "login-record";
    const auditRecords = verification.needsMigration
      ? await readPlatformSheet(env, "PlatformAuditLog")
      : [];
    try {
      await writeAccountLoginState(
        env,
        state.account,
        selected,
        timestamp,
        verification.needsMigration ? credentialHash : "",
        auditRecords,
        verification.needsMigration ? "ACCOUNT_PIN_HASH_UPGRADE" : ""
      );
    } catch (error) {
      // A normal sign-in does not depend on its last-used timestamp. A PIN hash
      // migration does depend on its credential and audit write succeeding.
      if (verification.needsMigration) throw error;
      logAccountServiceFailure("login-record", error);
    }
    stage = "session";
    const session = await createAccountSession(env, state, selected, credentialHash);

    return json({
      success: true,
      message: "Central account login successful",
      ...sessionResponse(state, session)
    });
  } catch (error) {
    logAccountServiceFailure(stage, error);
    return accountServiceError(error, env);
  }
}

export async function accountSessionEndpoint(request, env) {
  try {
    const authUser = await getAuthUser(request, env, {allowProgram:true});
    if (!authUser || authUser.type !== "account") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const state = await loadCentralAccountState(env, authUser.uniqueid);
    if (
      !state.account ||
      normalizePlatformIdentifier(state.account.AccountID) !== normalizePlatformIdentifier(authUser.accountid)
    ) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    return json({
      success: true,
      ...sessionResponse(state, {
        token: "",
        context: contextFromAuthUser(authUser)
      }, false)
    });
  } catch (error) {
    return accountServiceError(error, env);
  }
}

export async function accountWorkspaceEndpoint(request, env) {
  try {
    // The course-scoped router has already revalidated the central account,
    // resolved CourseRegistry and attached the matching local course identity.
    const authUser = await getAuthUser(request, env);
    if (!authUser || authUser.sessiontype !== "account" || !authUser.courseid) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const portalType = authUser.type === "student" ? "student" : "admin";
    const account = {
      displayName: String(authUser.username || "Account holder").trim(),
      uniqueid: String(authUser.uniqueid || "").trim()
    };
    const context = {
      scope: "COURSE",
      courseId: String(authUser.courseid || "").trim(),
      courseName: String(authUser.coursename || "").trim(),
      role: String(authUser.centralrole || authUser.role || "").trim().toUpperCase()
    };
    const workspace = {
      portalType,
      path: `/${portalType}/${encodeURIComponent(account.uniqueid)}`
    };
    const response = {
      success: true,
      sessionType: "account",
      operationalAccessActive: true,
      account,
      context,
      workspace
    };

    if (portalType === "student") {
      response.student = {
        studentid: String(authUser.studentid || "").trim(),
        username: String(authUser.username || "Student").trim(),
        classgroup: String(authUser.classgroup ?? "").trim()
      };
    } else {
      response.admin = {
        adminid: String(authUser.adminid || "").trim(),
        username: String(authUser.username || "Admin").trim(),
        uniqueid: account.uniqueid,
        role: String(authUser.role || "ADMIN").trim().toUpperCase(),
        assignedgroup: String(authUser.assignedgroup ?? "").trim(),
        platformrole: String(authUser.platformrole || "").trim().toUpperCase()
      };
    }

    return json(response);
  } catch (error) {
    return accountServiceError(error, env);
  }
}

export async function accountGlobalWorkspaceEndpoint(request, env) {
  try {
    const authUser = await getAuthUser(request, env);
    if (
      !authUser ||
      authUser.type !== "account" ||
      normalizePlatformIdentifier(authUser.scope) !== "GLOBAL" ||
      normalizePlatformIdentifier(authUser.role) !== "STUDENT"
    ) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const uniqueId = String(authUser.uniqueid || "").trim();
    const displayName = String(authUser.username || "Subscriber").trim();
    return json({
      success: true,
      sessionType: "account",
      operationalAccessActive: true,
      account: { displayName, uniqueid: uniqueId },
      context: {
        scope: "GLOBAL",
        courseId: "",
        courseName: "Global Subjects",
        role: "STUDENT"
      },
      workspace: {
        portalType: "student",
        path: `/student/${encodeURIComponent(uniqueId)}?global=1`
      },
      student: {
        studentid: `GLOBAL:${String(authUser.accountid || "").trim()}`,
        username: displayName,
        classgroup: "GLOBAL"
      }
    });
  } catch (error) {
    return accountServiceError(error, env);
  }
}

export async function switchAccountContextEndpoint(request, env) {
  try {
    const authUser = await getAuthUser(request, env, {allowProgram:true});
    if (!authUser || authUser.type !== "account") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await request.json();
    const requestedScope = normalizePlatformIdentifier(body.scope || "COURSE");
    const requestedCourseId = String(body.courseId || "").trim();
    const requestedRole = normalizePlatformIdentifier(body.role);
    const state = await loadCentralAccountState(env, authUser.uniqueid);
    if (
      !state.account ||
      normalizePlatformIdentifier(state.account.AccountID) !== normalizePlatformIdentifier(authUser.accountid)
    ) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    let selected;
    if (requestedScope === "PLATFORM") {
      if (!isGlobalAdminAccount(state.account)) {
        return json({ success: false, error: "Forbidden" }, 403);
      }
      selected = {
        accessId: "",
        accountId: String(state.account.AccountID || "").trim(),
        courseId: "",
        courseRecordId: "",
        role: "GLOBAL_ADMIN",
        scope: "PLATFORM"
      };
    } else if (requestedScope === "COURSE" && requestedCourseId) {
      const libraryContext=state.contexts.find(context=>context.programLibrary===true&&
        normalizePlatformIdentifier(context.courseId)===normalizePlatformIdentifier(requestedCourseId)&&
        normalizePlatformIdentifier(context.role)===requestedRole);
      selected=libraryContext?{accountId:state.account.AccountID,courseId:libraryContext.courseId,role:libraryContext.role,scope:'COURSE',accessId:'',accessRow:0,courseRecordId:''}
        :attachAccessRow(state,assertCourseContextAccess(state.account,state.accessRecords,state.account.AccountID,requestedCourseId,requestedRole));
      const course=await resolveActiveCourseRegistration(env, selected.courseId, {allowProgram:true});
      if(course.schemaVersion.includes('-program')&&!['GLOBAL_ADMIN','ADMIN','SENIOR','TEACHER','STUDENT'].includes(selected.role))throw new Error('Program Library access requires a registered role');
    } else if (requestedScope === "GLOBAL") {
      selected = selectGlobalOnlyContext(state);
    } else {
      return json({ success: false, error: "A valid scope and CourseID are required" }, 400);
    }

    const credentialHash = String(state.account.PINHash || "").trim();
    const timestamp = new Date().toISOString();
    await writeSelectedContextLastUsed(env, selected, timestamp);
    const session = await createAccountSession(env, state, selected, credentialHash);
    return json({
      success: true,
      message: "Course or role switched",
      ...sessionResponse(state, session)
    });
  } catch (error) {
    if (/membership|course|role|context|inactive|required/i.test(String(error?.message || ""))) {
      return json({ success: false, error: "Requested course or role is not authorised" }, 403);
    }
    return accountServiceError(error, env);
  }
}

export async function loadCentralAccountState(env, uniqueId, options = {}) {
  const includeContexts = options.includeContexts !== false;
  const includeAudit = options.includeAudit === true;
  const sheetNames = ["UserAccounts", "PlatformConfig"];
  if (includeContexts) {
    sheetNames.push(
      "UserCourseAccess",
      "CourseRegistry",
      "GlobalSubjectAccessMatrix",
      "GlobalSubjectAccessPolicy",
      "GlobalSubjectList"
    );
  }
  if (includeAudit) sheetNames.push("PlatformAuditLog");
  const tables = await readPlatformSheets(env, sheetNames);
  const accounts = tables.UserAccounts;
  const config = tables.PlatformConfig;
  const accessRecords = tables.UserCourseAccess || [];
  const courses = tables.CourseRegistry || [];
  const globalAccessRecords = tables.GlobalSubjectAccessMatrix || [];
  const globalPolicies = tables.GlobalSubjectAccessPolicy || [];
  const globalSubjects = tables.GlobalSubjectList || [];
  const auditRecords = tables.PlatformAuditLog || [];
  assertAccountSchemaVersion(config);

  const normalizedUniqueId = normalizePlatformIdentifier(uniqueId);
  const matches = accounts.filter(account => (
    normalizePlatformIdentifier(account.UniqueID) === normalizedUniqueId
  ));
  if (matches.length > 1) throw new Error("Central UniqueID lookup is ambiguous");
  const account = matches[0] || null;
  if (account) {
    const accountId = normalizePlatformIdentifier(account.AccountID);
    const platformRole = normalizePlatformIdentifier(account.PlatformRole);
    const accountIdMatches = accounts.filter(candidate => (
      normalizePlatformIdentifier(candidate.AccountID) === accountId
    ));
    if (
      !accountId ||
      !String(account.DisplayName || "").trim() ||
      accountIdMatches.length !== 1 ||
      (platformRole && platformRole !== "GLOBAL_ADMIN")
    ) {
      throw new Error("Central account identity is invalid or ambiguous");
    }
  }
  if (!account || !includeContexts) {
    return {
      account,
      accessRecords: [],
      courses: [],
      globalAccessRecords: [],
      globalPolicies: [],
      globalSubjects: [],
      contexts: [],
      auditRecords
    };
  }

  const accountId = normalizePlatformIdentifier(account.AccountID);
  const accountAccess = accessRecords.filter(access => (
    normalizePlatformIdentifier(access.AccountID) === accountId
  ));
  const accountGlobalAccess = globalAccessRecords.filter(access => (
    normalizePlatformIdentifier(access.AccountID) === accountId
  ));
  let contexts = buildAvailableContexts(
    account,
    accountAccess,
    courses,
    accountGlobalAccess,
    globalSubjects,
    globalPolicies
  );
  if(!isGlobalAdminAccount(account)){
    const programCourses=courses.filter(course=>String(course.SchemaVersion||'').includes('-program'));
    const programIds=new Set(programCourses.map(course=>normalizePlatformIdentifier(course.CourseID)));
    let roleAccounts;
    try{roleAccounts=await readProgramRoleAccountsForPrograms(env,programCourses.map(course=>course.CourseID));}
    catch(error){if(!contexts.length)throw error;roleAccounts={};}
    const studentPrograms = programCourses.filter(course =>
      roleAccounts[course.CourseID]?.some(row => normalizePlatformIdentifier(row.AccountID) === accountId && row.Active && row.Roles.includes('STUDENT')));
    const programDefinitions = studentPrograms.length
      ? (await programService(sheetsProgramRepository(env)).list()).programs : [];
    contexts=contexts.filter(context=>!programIds.has(normalizePlatformIdentifier(context.courseId)));
    for(const course of programCourses){
      const roles=roleAccounts[course.CourseID]||[];
      const accountRoles=roles.find(row=>normalizePlatformIdentifier(row.AccountID)===accountId&&row.Active)?.Roles||[];
      for(const role of accountRoles.filter(role=>['ADMIN','SENIOR','TEACHER'].includes(role))){
        contexts.push({scope:'COURSE',courseId:course.CourseID,courseName:course.CourseName,role,programLibrary:true});
      }
      if(accountRoles.includes('STUDENT')){
        const program=programDefinitions.find(row=>row.id===course.CourseID&&row.mode==='PROGRAM'&&row.status==='DRAFT');
        if(program)contexts.push({scope:'COURSE',courseId:course.CourseID,courseName:course.CourseName,role:'STUDENT',programLibrary:true});
      }
    }
    contexts.sort((a,b)=>authorityRank(a.role)-authorityRank(b.role)||a.courseName.localeCompare(b.courseName)||a.role.localeCompare(b.role));
  }
  return {
    account,
    accessRecords: accountAccess,
    courses,
    globalAccessRecords: accountGlobalAccess,
    globalPolicies,
    globalSubjects,
    contexts,
    auditRecords
  };
}

export function buildAvailableContexts(account, accessRecords, courses, globalAccessRecords = [], globalSubjects = [], globalPolicies = []) {
  const activeCourses = uniqueActiveCourses(courses);
  if (isGlobalAdminAccount(account)) {
    return [
      {
        scope: "PLATFORM",
        courseId: "",
        courseName: "M4L Platform",
        role: "GLOBAL_ADMIN"
      },
      ...Array.from(activeCourses.values()).map(course => ({
        scope: "COURSE",
        courseId: String(course.CourseID || "").trim(),
        courseName: String(course.CourseName || "").trim(),
        role: "GLOBAL_ADMIN"
      }))
    ];
  }

  const seen = new Set();
  const accessIds = new Set();
  const output = [];
  for (const access of accessRecords) {
    const role = normalizePlatformIdentifier(access.Role);
    const courseIdKey = normalizePlatformIdentifier(access.CourseID);
    if (!isActivePlatformValue(access.Active) || !COURSE_ROLES.has(role)) continue;
    const accessId = normalizePlatformIdentifier(access.AccessID);
    const courseRecordId = String(access.CourseRecordID || "").trim();
    if (!accessId || accessIds.has(accessId) || !courseRecordId) {
      throw new Error("Active course membership is invalid or ambiguous");
    }
    accessIds.add(accessId);
    const course = activeCourses.get(courseIdKey);
    if (!course) continue;
    if (String(course.SchemaVersion || '').includes('-program') && role === 'STUDENT') continue;
    const key = `${courseIdKey}|${role}`;
    if (seen.has(key)) throw new Error("Active course-role membership is ambiguous");
    seen.add(key);
    output.push({
      scope: "COURSE",
      courseId: String(course.CourseID || "").trim(),
      courseName: String(course.CourseName || "").trim(),
      role
    });
  }
  const sorted = output.sort((left, right) => (
    authorityRank(left.role) - authorityRank(right.role) ||
    left.courseName.localeCompare(right.courseName) ||
    left.role.localeCompare(right.role)
  ));
  if (hasActiveGlobalSubjectAccess(account, globalAccessRecords, globalSubjects, globalPolicies)) {
    sorted.push({
      scope: "GLOBAL",
      courseId: "",
      courseName: "Global Subjects",
      role: "STUDENT"
    });
  }
  return sorted;
}

function selectUsableAutomaticContext(state) {
  if (!state.account) throw new Error("Central account was not found");
  if (state.contexts.length === 1 && state.contexts[0].scope === "GLOBAL") {
    return selectGlobalOnlyContext(state);
  }
  const usableAccess = state.accessRecords.filter(access => (
    state.contexts.some(context=>context.scope==='COURSE'&&!context.programLibrary&&
      normalizePlatformIdentifier(context.courseId)===normalizePlatformIdentifier(access.CourseID)&&
      normalizePlatformIdentifier(context.role)===normalizePlatformIdentifier(access.Role))
  ));
  if(!usableAccess.length){
    const programContext=state.contexts.find(context=>context.programLibrary===true);
    if(programContext)return {scope:'COURSE',courseId:programContext.courseId,role:programContext.role,accountId:state.account.AccountID,accessId:'',accessRow:0,courseRecordId:''};
  }
  const selected = selectAutomaticAccountContext(state.account, usableAccess);
  return attachAccessRow(state, selected);
}

function selectGlobalOnlyContext(state) {
  const accessibleIds = accessibleGlobalSubjectIds({
    account: state.account,
    subjects: state.globalSubjects,
    policyRows: state.globalPolicies,
    accessRows: state.globalAccessRecords
  });
  if (!accessibleIds.size) throw new Error("An accessible global subject is required");

  return {
    accessId: "",
    accountId: String(state.account.AccountID || "").trim(),
    courseId: "",
    courseRecordId: "",
    role: "STUDENT",
    scope: "GLOBAL",
    globalAccessId: "",
    globalAccessRow: 0
  };
}

function attachAccessRow(state, selected) {
  if (!selected.accessId) return { ...selected, accessRow: 0 };
  const matches = state.accessRecords.filter(access => (
    String(access.AccessID || "").trim() === String(selected.accessId || "").trim()
  ));
  if (matches.length !== 1 || !Number.isInteger(matches[0]._rowNumber)) {
    throw new Error("Selected account context did not resolve exactly once");
  }
  return { ...selected, accessRow: matches[0]._rowNumber };
}

async function createAccountSession(env, state, selected, credentialHash) {
  let courseName = "M4L Platform";
  if (selected.scope === "COURSE") {
    const course = await resolveActiveCourseRegistration(env, selected.courseId, {allowProgram:true});
    if(course.schemaVersion.includes('-program')&&!['GLOBAL_ADMIN','ADMIN','SENIOR','TEACHER','STUDENT'].includes(selected.role))throw new Error('Program Library access requires a registered role');
    courseName = course.courseName;
  } else if (selected.scope === "GLOBAL") {
    courseName = "Global Subjects";
  }

  const token = await createSessionToken({
    type: "account",
    accountid: String(state.account.AccountID || "").trim(),
    uniqueid: String(state.account.UniqueID || "").trim(),
    username: String(state.account.DisplayName || "").trim(),
    role: selected.role,
    scope: selected.scope,
    accessid: selected.accessId || "",
    accessrow: selected.accessRow || 0,
    courseid: selected.courseId || "",
    coursename: courseName,
    courserecordid: selected.courseRecordId || "",
    globalaccessid: selected.globalAccessId || "",
    globalaccessrow: selected.globalAccessRow || 0,
    authrow: state.account._rowNumber,
    credentialHash
  }, env);

  return {
    token,
    context: {
      scope: selected.scope,
      courseId: selected.courseId || "",
      courseName,
      role: selected.role
    }
  };
}

function sessionResponse(state, session, includeToken = true) {
  const response = {
    account: publicAccount(state.account, false),
    context: session.context,
    contexts: state.contexts,
    operationalAccessActive: ["COURSE", "GLOBAL"].includes(session.context.scope)
  };
  if (includeToken) response.token = session.token;
  return response;
}

function contextFromAuthUser(authUser) {
  return {
    scope: String(authUser.scope || "").trim().toUpperCase(),
    courseId: String(authUser.courseid || "").trim(),
    courseName: String(authUser.coursename || "").trim() || "M4L Platform",
    role: String(authUser.role || "").trim().toUpperCase()
  };
}

function publicAccount(account, includePinSetup) {
  const result = {
    displayName: String(account.DisplayName || "").trim(),
    uniqueid: String(account.UniqueID || "").trim()
  };
  if (includePinSetup) result.pinsetup = isActivePlatformValue(account.PINSetup);
  return result;
}

function validateLoginAccount(account) {
  if (!account) return json({ success: false, error: "Invalid account link" }, 404);
  if (!isActivePlatformValue(account.Active)) {
    return json({ success: false, error: "Account disabled" }, 403);
  }
  return null;
}

function pinAlreadyConfigured(account) {
  return isActivePlatformValue(account.PINSetup) || Boolean(String(account.PINHash || "").trim());
}

async function writeAccountLoginState(
  env,
  account,
  selected,
  timestamp,
  replacementPinHash,
  auditRecords = [],
  auditAction = ""
) {
  const writes = [];
  if (replacementPinHash) {
    writes.push({
      range: `'UserAccounts'!D${account._rowNumber}:E${account._rowNumber}`,
      majorDimension: "ROWS",
      values: [[true, replacementPinHash]]
    });
  }
  writes.push({
    range: `'UserAccounts'!G${account._rowNumber}`,
    majorDimension: "ROWS",
    values: [[timestamp]]
  });
  if (selected.accessRow) {
    writes.push({
      range: `'UserCourseAccess'!G${selected.accessRow}`,
      majorDimension: "ROWS",
      values: [[timestamp]]
    });
  }
  if (replacementPinHash && auditAction) {
    const auditRow = nextPlatformRow(auditRecords);
    writes.push({
      range: `'PlatformAuditLog'!A${auditRow}:J${auditRow}`,
      majorDimension: "ROWS",
      values: [[
        createUuid(),
        timestamp,
        String(account.AccountID || "").trim(),
        String(account.DisplayName || "").trim(),
        selected.role,
        selected.courseId || "",
        auditAction,
        "USER_ACCOUNT",
        String(account.AccountID || "").trim(),
        JSON.stringify(["AuthenticationCredential"])
      ]]
    });
  }
  await batchUpdateGoogleSheetValues(env, writes, {
    spreadsheetId: getPlatformSpreadsheetId(env)
  });
}

async function writeSelectedContextLastUsed(env, selected, timestamp) {
  if (!selected.accessRow) return;
  await batchUpdateGoogleSheetValues(env, [{
    range: `'UserCourseAccess'!G${selected.accessRow}`,
    majorDimension: "ROWS",
    values: [[timestamp]]
  }], { spreadsheetId: getPlatformSpreadsheetId(env) });
}

async function enforceLoginRateLimit(env, uniqueId) {
  const limiter = env.AUTH_LOGIN_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return null;
  const key = await createAuthRateLimitKey("account", uniqueId, env);
  const result = await limiter.limit({ key });
  if (result && result.success) return null;

  const response = json({
    success: false,
    error: "Too many login attempts. Please wait one minute and try again.",
    code: "AUTH_RATE_LIMITED",
    retryAfter: LOGIN_RATE_LIMIT_SECONDS
  }, 429);
  response.headers.set("Retry-After", String(LOGIN_RATE_LIMIT_SECONDS));
  return response;
}

function uniqueActiveCourses(courses) {
  const output = new Map();
  for (const course of courses) {
    if (!isActivePlatformValue(course.Active)) continue;
    const courseId = normalizePlatformIdentifier(course.CourseID);
    if (!courseId || output.has(courseId)) {
      throw new Error("Active CourseRegistry lookup is ambiguous");
    }
    output.set(courseId, course);
  }
  return output;
}

function hasActiveGlobalSubjectAccess(account, accessRecords, subjects, policies) {
  return accessibleGlobalSubjectIds({
    account,
    subjects,
    policyRows: policies,
    accessRows: accessRecords
  }).size > 0;
}

function assertAccountSchemaVersion(configRows) {
  const matches = configRows.filter(row => (
    normalizePlatformIdentifier(row.ConfigKey) === "PLATFORMSCHEMAVERSION"
  ));
  const schemaVersion = String(matches[0]?.ConfigValue || "").trim();
  if (matches.length !== 1 || !SUPPORTED_PLATFORM_SCHEMA_VERSIONS.has(schemaVersion)) {
    throw new Error("PlatformConfig PlatformSchemaVersion is not supported by this account release");
  }
}

function invalidPinResponse() {
  return json({ success: false, error: "PIN must be 4 digits" }, 400);
}

function accountServiceError(error, env) {
  const response = {
    success: false,
    error: "Central account service is not ready"
  };
  if (String(env.M4L_ACCOUNT_AUTH_DIAGNOSTICS || "").trim().toLowerCase() === "true") {
    response.detail = String(error?.message || "Account service error")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 180);
  }
  return json(response, 503);
}

function logAccountServiceFailure(stage, error) {
  console.warn("Central account login dependency failed", {
    stage,
    code: String(error?.code || error?.name || "UNKNOWN").slice(0, 64),
    status: Number(error?.status) || 0
  });
}

function nextPlatformRow(records) {
  return Math.max(1, ...(records || []).map(record => Number(record._rowNumber) || 1)) + 1;
}

function createUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
