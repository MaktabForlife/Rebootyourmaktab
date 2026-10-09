import assert from "node:assert/strict";
import { createSaltedPinHash, createSessionToken } from "../src/lib/auth.js";
import { PLATFORM_SHEET_HEADERS } from "../src/lib/platform-schema.js";
import worker from "../src/worker.js";

const pinSecret = "global-management-pin-secret";
const sessionSecret = "global-management-session-secret";
const globalHash = await createSaltedPinHash("2468", pinSecret);
const tables = Object.fromEntries(Object.entries(PLATFORM_SHEET_HEADERS).map(([name, headers]) => (
  [name, [headers]]
)));
tables.CourseRegistry.push(["COURSE1", "Reboot Your Maktab", "course-sheet-one", true, "101.4.3"]);
tables.UserAccounts.push([
  "ACCOUNT1", "Global Admin", "GLOBAL-LINK", true, globalHash, true, "", "2026-08-15T00:00:00.000Z",
  "", "", "", "", "", "GLOBAL_ADMIN"
]);
tables.UserAccounts.push([
  "ACCOUNT2", "Subscriber", "STUDENT-LINK", true, globalHash, true, "", "2026-08-15T00:00:00.000Z"
]);
tables.UserAccounts.push([
  "ACCOUNT3", "Course Admin", "ADMIN-LINK", true, globalHash, true, "", "2026-08-15T00:00:00.000Z"
]);
tables.GlobalSubjectAccessMatrix = [
  ["AccountID"],
  ["ACCOUNT1"],
  ["ACCOUNT2"],
  ["ACCOUNT3"]
];
tables.UserCourseAccess.push([
  "ACCESS3", "ACCOUNT3", "COURSE1", "ADMIN", true, true, "", "2026-08-15T00:00:00.000Z",
  "", "", "", "", "", "ADMIN3"
]);
tables.UserCourseAccess.push([
  "ACCESS2", "ACCOUNT2", "COURSE1", "STUDENT", true, true, "", "2026-08-15T00:00:00.000Z",
  "", "", "", "", "", "MAKTAB2"
]);
tables.PlatformConfig.push(["AccountLoginBaseUrl", "https://development.example.test/account/"]);
tables.PlatformConfig.push(["PlatformSchemaVersion", "102.0.5"]);
tables.PlatformConfig.push(["GlobalCurriculumVersion", 1]);
tables.PlatformConfig.push(["GlobalResourceDriveRootFolderID", ""]);

const rootFolderId = "GLOBAL_ROOT_FOLDER_123";
const secondRootFolderId = "GLOBAL_ROOT_FOLDER_456";
const childFolderId = "GLOBAL_CHILD_FOLDER_123";
const lessonFileId = "GLOBAL_LESSON_FILE_123";
const secondLessonFileId = "GLOBAL_LESSON_FILE_456";
const outsideFolderId = "OUTSIDE_FOLDER_123";
const outsideFileId = "OUTSIDE_FILE_123";
const driveItems = new Map([
  [rootFolderId, driveFolder(rootFolderId, "M4L Global Resources")],
  [secondRootFolderId, driveFolder(secondRootFolderId, "Replacement Global Resources")],
  [childFolderId, driveFolder(childFolderId, "Tajweed", [rootFolderId])],
  [lessonFileId, driveFile(lessonFileId, "lesson-one.pdf", "application/pdf", [childFolderId], 4096)],
  [secondLessonFileId, driveFile(secondLessonFileId, "lesson-two.pdf", "application/pdf", [childFolderId], 3072)],
  [outsideFolderId, driveFolder(outsideFolderId, "Outside")],
  [outsideFileId, driveFile(outsideFileId, "outside.pdf", "application/pdf", [outsideFolderId], 2048)]
]);

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
  PLATFORM_SPREADSHEET_ID: "platform-global-management-sheet",
  GOOGLE_SPREADSHEET_ID: "legacy-course-sheet",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    type: "service_account",
    client_email: "global-management@example.iam.gserviceaccount.com",
    private_key_id: "global-management-key",
    private_key: toPem(pkcs8, "PRIVATE KEY"),
    token_uri: "https://oauth2.googleapis.com/token"
  }),
  M4L_ACCOUNT_AUTH_DIAGNOSTICS: "true"
};

const globalToken = await createSessionToken({
  type: "account",
  accountid: "ACCOUNT1",
  uniqueid: "GLOBAL-LINK",
  username: "Global Admin",
  role: "GLOBAL_ADMIN",
  scope: "PLATFORM",
  authrow: 2,
  credentialHash: globalHash
}, env);
const legacyAdminToken = await createSessionToken({
  type: "admin",
  adminid: "ADMIN1",
  username: "Course Admin",
  role: "ADMIN"
}, env);
const centralAdminToken = await createSessionToken({
  type: "account",
  accountid: "ACCOUNT3",
  uniqueid: "ADMIN-LINK",
  username: "Course Admin",
  role: "ADMIN",
  scope: "COURSE",
  accessid: "ACCESS3",
  accessrow: 2,
  courseid: "COURSE1",
  coursename: "Reboot Your Maktab",
  courserecordid: "ADMIN3",
  authrow: 4,
  credentialHash: globalHash
}, env);
const subscriberToken = await createSessionToken({
  type: "account",
  accountid: "ACCOUNT2",
  uniqueid: "STUDENT-LINK",
  username: "Subscriber",
  role: "STUDENT",
  scope: "COURSE",
  accessid: "ACCESS2",
  accessrow: 3,
  courseid: "COURSE1",
  coursename: "Reboot Your Maktab",
  courserecordid: "MAKTAB2",
  authrow: 3,
  credentialHash: globalHash
}, env);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === "oauth2.googleapis.com") {
    return response({ access_token: "global-management-token", expires_in: 3600 });
  }
  if (url.hostname === "www.googleapis.com") {
    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (fileMatch) {
      const item = driveItems.get(decodeURIComponent(fileMatch[1]));
      return item ? response(item) : response({ error: { message: "File not found" } }, 404);
    }
    if (url.pathname === "/drive/v3/files") {
      const parentId = /'([^']+)' in parents/.exec(url.searchParams.get("q") || "")?.[1] || "";
      return response({
        files: [...driveItems.values()].filter(item => array(item.parents).includes(parentId))
      });
    }
    throw new Error(`Unexpected Drive fetch: ${url}`);
  }
  if (url.hostname !== "sheets.googleapis.com") {
    throw new Error(`Unexpected global-management fetch: ${url}`);
  }
  assert.match(url.pathname, /spreadsheets\/platform-global-management-sheet/);
  if (url.pathname.endsWith('/spreadsheets/platform-global-management-sheet')) {
    return response({ sheets: Object.keys(tables).map((title, sheetId) => ({
      properties: { title, sheetId: sheetId + 1, gridProperties: { rowCount: 1000 } }
    })) });
  }
  if (url.pathname.endsWith("/values:batchUpdate")) {
    const payload = JSON.parse(init.body);
    payload.data.forEach(applyWrite);
    return response({ totalUpdatedRanges: payload.data.length });
  }
  const range = decodeURIComponent(url.pathname.split("/values/")[1] || "");
  const rowMatch = /^(UserAccounts|UserCourseAccess)!A(\d+):N\2$/.exec(range);
  if (rowMatch) {
    return response({ values: [tables[rowMatch[1]][Number(rowMatch[2]) - 1] || []] });
  }
  const fullMatch = /^'([^']+)'!A:[A-Z]+$/.exec(range);
  if (fullMatch && tables[fullMatch[1]]) {
    return response({ values: tables[fullMatch[1]] });
  }
  throw new Error(`Unexpected global-management range: ${range}`);
};

try {
  const unauthorized = await post("/api/admin/platform/global/get", {}, "");
  assert.equal(unauthorized.response.status, 401);

  const ordinaryAdmin = await post("/api/admin/platform/global/get", {}, legacyAdminToken);
  assert.equal(ordinaryAdmin.response.status, 403);
  assert.match(ordinaryAdmin.data.error, /GLOBAL_ADMIN/);

  const centralCourseAdmin = await post("/api/admin/platform/global/get", {}, centralAdminToken);
  assert.equal(centralCourseAdmin.response.status, 200, JSON.stringify(centralCourseAdmin.data));
  assert.equal(centralCourseAdmin.data.globalResourceDriveRoot.canconfigure, false);

  const empty = await post("/api/admin/platform/global/get", {}, globalToken);
  assert.equal(empty.response.status, 200, JSON.stringify(empty.data));
  assert.equal(empty.response.headers.get("X-M4L-Feature"), "platform-global-management");
  assert.equal(empty.data.globalCurriculumVersion, 1);
  assert.equal(empty.data.subjects.length, 0);
  assert.equal(empty.data.accounts.length, 3);
  assert.deepEqual(empty.data.globalResourceDriveRoot, {
    configured: false,
    folderid: "",
    folderurl: "",
    foldername: "",
    canconfigure: true
  });
  assert.equal(JSON.stringify(empty.data).includes(globalHash), false);

  const courseAdminRootSave = await post("/api/admin/platform/global/drive-root/save", {
    folderUrl: `https://drive.google.com/drive/folders/${rootFolderId}`
  }, centralAdminToken);
  assert.equal(courseAdminRootSave.response.status, 403);

  const rootSave = await post("/api/admin/platform/global/drive-root/save", {
    folderUrl: `https://drive.google.com/drive/folders/${rootFolderId}`
  }, globalToken);
  assert.equal(rootSave.response.status, 200, JSON.stringify(rootSave.data));
  assert.equal(rootSave.data.globalResourceDriveRoot.folderid, rootFolderId);
  assert.equal(rootSave.data.globalResourceDriveRoot.foldername, "M4L Global Resources");
  assert.equal(Number(tables.PlatformConfig[3][1]), 2);
  assert.equal(tables.PlatformConfig[4][1], rootFolderId);
  assert.equal(tables.PlatformAuditLog.at(-1)[6], "SET_GLOBAL_RESOURCE_DRIVE_ROOT");

  const sameRootSave = await post("/api/admin/platform/global/drive-root/save", {
    folderId: rootFolderId
  }, globalToken);
  assert.equal(sameRootSave.response.status, 200);
  assert.equal(Number(tables.PlatformConfig[3][1]), 2, "Unchanged folder must not increment curriculum version");

  const rootBrowse = await post("/api/admin/platform/global/drive/browse", {}, centralAdminToken);
  assert.equal(rootBrowse.response.status, 200, JSON.stringify(rootBrowse.data));
  assert.deepEqual(rootBrowse.data.breadcrumbs, [{ id: rootFolderId, name: "M4L Global Resources" }]);
  assert.equal(rootBrowse.data.items[0].id, childFolderId);
  const childBrowse = await post("/api/admin/platform/global/drive/browse", {
    folderId: childFolderId
  }, globalToken);
  assert.equal(childBrowse.response.status, 200, JSON.stringify(childBrowse.data));
  assert.equal(childBrowse.data.items[0].id, lessonFileId);
  assert.deepEqual(childBrowse.data.items[0].supportedTypes, ["EBOOK", "PRINTABLE"]);

  const subjectCreate = await post("/api/admin/platform/global/subject/save", {
    subjectName: "Global Tajweed",
    active: true
  }, globalToken);
  assert.equal(subjectCreate.response.status, 200, JSON.stringify(subjectCreate.data));
  assert.match(subjectCreate.data.subject.subjectid, /^GSUBJ-[0-9a-f-]{36}$/i);
  assert.equal(subjectCreate.data.subject.scope, "GLOBAL");
  assert.equal(Number(tables.PlatformConfig[3][1]), 3);
  assert.equal(tables.PlatformAuditLog.at(-2)[6], "CREATE_GLOBAL_SUBJECT");
  assert.equal(tables.PlatformAuditLog.at(-1)[6], "CREATE_GLOBAL_SUBJECT_ACCESS_POLICY");
  assert.equal(tables.GlobalSubjectAccessPolicy.length, 2);
  assert.equal(tables.GlobalSubjectAccessPolicy[1][1], subjectCreate.data.subject.subjectid);
  assert.equal(tables.GlobalSubjectAccessPolicy[1][2], "SUBSCRIPTION");
  assert.equal(tables.GlobalSubjectAccessPolicy[1][3], true);
  const subjectId = subjectCreate.data.subject.subjectid;

  const duplicateSubject = await post("/api/admin/platform/global/subject/save", {
    subjectName: " global tajweed ",
    active: true
  }, globalToken);
  assert.equal(duplicateSubject.response.status, 409);

  const moduleCreate = await post("/api/admin/platform/global/module/save", {
    subjectId,
    moduleName: "Foundations",
    sortOrder: 1,
    active: true
  }, globalToken);
  assert.equal(moduleCreate.response.status, 200, JSON.stringify(moduleCreate.data));
  const moduleId = moduleCreate.data.module.moduleid;
  assert.match(moduleId, /^GMOD-/);
  assert.equal(Number(tables.PlatformConfig[3][1]), 4);

  const taskCreate = await post("/api/admin/platform/global/task/save", {
    subjectId,
    moduleId,
    taskName: "Read Lesson One",
    active: true
  }, globalToken);
  assert.equal(taskCreate.response.status, 200, JSON.stringify(taskCreate.data));
  const taskId = taskCreate.data.task.taskid;
  assert.equal(Number(tables.PlatformConfig[3][1]), 5);

  const resourceCreate = await post("/api/admin/platform/global/resource/save", {
    subjectId,
    moduleId,
    taskId,
    resourceName: "Lesson One PDF",
    resourceType: "EBOOK",
    resourceDescription: "Central learner copy",
    fileId: lessonFileId,
    active: true
  }, globalToken);
  assert.equal(resourceCreate.response.status, 200, JSON.stringify(resourceCreate.data));
  assert.match(resourceCreate.data.resource.resourceid, /^GRES-/);
  assert.equal(resourceCreate.data.resource.fileid, lessonFileId);
  assert.equal(resourceCreate.data.resource.resourceformat, "PDF");
  assert.equal(
    resourceCreate.data.resource.resourcelink,
    `https://worker.test/api/library/drive/file/${lessonFileId}`
  );
  assert.equal(Number(tables.PlatformConfig[3][1]), 6);
  const resourceId = resourceCreate.data.resource.resourceid;

  const missingFileResource = await post("/api/admin/platform/global/resource/save", {
    subjectId,
    resourceName: "Missing File",
    resourceType: "EBOOK",
    active: true
  }, globalToken);
  assert.equal(missingFileResource.response.status, 400);

  const outsideResource = await post("/api/admin/platform/global/resource/save", {
    subjectId,
    resourceName: "Outside File",
    resourceType: "EBOOK",
    fileId: outsideFileId,
    active: true
  }, globalToken);
  assert.equal(outsideResource.response.status, 400);
  assert.match(outsideResource.data.error, /outside the configured Global Resources folder/);

  const duplicateDriveResource = await post("/api/admin/platform/global/resource/save", {
    subjectId,
    resourceName: "Duplicate File",
    resourceType: "EBOOK",
    fileId: lessonFileId,
    active: true
  }, globalToken);
  assert.equal(duplicateDriveResource.response.status, 409);
  assert.match(duplicateDriveResource.data.error, /already a global resource/);

  const subscriberDenied = await post("/api/platform/global/resources/access", {
    resourceId
  }, subscriberToken);
  assert.equal(subscriberDenied.response.status, 403);

  const makeFree = await post("/api/admin/platform/global/policy/save", {
    subjectId,
    accessModel: "FREE"
  }, globalToken);
  assert.equal(makeFree.response.status, 200, JSON.stringify(makeFree.data));
  assert.equal(Number(tables.PlatformConfig[3][1]), 7);
  const freeAccess = await post("/api/platform/global/resources/access", { resourceId }, subscriberToken);
  assert.equal(freeAccess.response.status, 200, "FREE policy must authorise protected Drive delivery without a subscription row");

  const restoreSubscription = await post("/api/admin/platform/global/policy/save", {
    subjectId,
    accessModel: "SUBSCRIPTION"
  }, globalToken);
  assert.equal(restoreSubscription.response.status, 200, JSON.stringify(restoreSubscription.data));
  assert.equal(Number(tables.PlatformConfig[3][1]), 8);
  const deniedAgain = await post("/api/platform/global/resources/access", { resourceId }, subscriberToken);
  assert.equal(deniedAgain.response.status, 403, "SUBSCRIPTION policy must still require an active matrix entitlement");

  const replacementRootBlocked = await post("/api/admin/platform/global/drive-root/save", {
    folderId: secondRootFolderId
  }, globalToken);
  assert.equal(replacementRootBlocked.response.status, 409);
  assert.equal(tables.PlatformConfig[4][1], rootFolderId);

  const accessCreate = await post("/api/admin/platform/global/access/save", {
    accountId: "ACCOUNT2",
    subjectId,
    active: true
  }, globalToken);
  assert.equal(accessCreate.response.status, 200, JSON.stringify(accessCreate.data));
  assert.deepEqual(accessCreate.data.access, { accountid: "ACCOUNT2", subjectid: subjectId, active: true });
  assert.equal(Number(tables.PlatformConfig[3][1]), 8, "Access changes must not change curriculum version");
  assert.equal(tables.PlatformAuditLog.at(-1)[6], "ACTIVATE_GLOBAL_SUBJECT_ACCESS");

  const subscriberAccess = await post("/api/platform/global/resources/access", {
    resourceId
  }, subscriberToken);
  assert.equal(subscriberAccess.response.status, 200, JSON.stringify(subscriberAccess.data));
  assert.match(
    subscriberAccess.data.url,
    new RegExp(`^https://worker\\.test/api/library/drive/file/${lessonFileId}\\?access=`)
  );
  assert.equal(subscriberAccess.data.filename, "lesson-one.pdf");

  const subjectDeactivate = await post("/api/admin/platform/global/subject/save", {
    subjectId,
    subjectName: "Global Tajweed",
    active: false
  }, globalToken);
  assert.equal(subjectDeactivate.response.status, 200, JSON.stringify(subjectDeactivate.data));
  assert.deepEqual(subjectDeactivate.data.dependencies, {
    modules: 1,
    tasks: 1,
    resources: 1,
    subscriptions: 1,
    policies: 1,
    runs: 0
  });
  assert.equal(Number(tables.PlatformConfig[3][1]), 9);

  const inactiveSubjectAccess = await post("/api/platform/global/resources/access", {
    resourceId
  }, subscriberToken);
  assert.equal(inactiveSubjectAccess.response.status, 403);

  const reactivateAccessWhileSubjectInactive = await post("/api/admin/platform/global/access/save", {
    accountId: "ACCOUNT2",
    subjectId,
    active: true
  }, globalToken);
  assert.equal(reactivateAccessWhileSubjectInactive.response.status, 409);

  const accessDeactivate = await post("/api/admin/platform/global/access/save", {
    accountId: "ACCOUNT2",
    subjectId,
    active: false
  }, globalToken);
  assert.equal(accessDeactivate.response.status, 200, JSON.stringify(accessDeactivate.data));
  assert.equal(Number(tables.PlatformConfig[3][1]), 9);

  const subjectBatchSave = await post("/api/admin/platform/global/subjects/save-batch", {
    globalCurriculumVersion: 9,
    subjects: [{
      clientKey: subjectId,
      subjectId,
      subjectName: "Global Tajweed Revised",
      accessModel: "FREE",
      active: true
    }],
    modules: [{
      clientKey: moduleId,
      moduleId,
      subjectId,
      subjectClientKey: subjectId,
      moduleName: "Foundations Revised",
      sortOrder: 2,
      active: true
    }, {
      clientKey: "new-module-two",
      subjectId,
      subjectClientKey: subjectId,
      moduleName: "Applied Tajweed",
      sortOrder: 1,
      active: true
    }]
  }, globalToken);
  assert.equal(subjectBatchSave.response.status, 200, JSON.stringify(subjectBatchSave.data));
  assert.equal(subjectBatchSave.data.globalCurriculumVersion, 10);
  assert.equal(Number(tables.PlatformConfig[3][1]), 10, "The screen-level batch must increment curriculum version only once");
  assert.equal(tables.GlobalSubjectList[1][1], "Global Tajweed Revised");
  assert.equal(tables.GlobalSubjectList[1][2], true);
  assert.equal(tables.GlobalModuleList.length, 3);
  assert.equal(tables.GlobalModuleList[1][2], "Foundations Revised");
  assert.equal(tables.GlobalModuleList[1][3], 2);
  assert.equal(tables.GlobalModuleList[2][2], "Applied Tajweed");
  assert.equal(tables.GlobalSubjectAccessPolicy[1][2], "FREE");

  const moduleRowsBeforeInvalidBatch = JSON.stringify(tables.GlobalModuleList);
  const invalidBatch = await post("/api/admin/platform/global/subjects/save-batch", {
    globalCurriculumVersion: 10,
    subjects: [],
    modules: [{
      clientKey: "collision-one", subjectId, subjectClientKey: subjectId,
      moduleName: "Collision", sortOrder: 3, active: true
    }, {
      clientKey: "collision-two", subjectId, subjectClientKey: subjectId,
      moduleName: "Collision", sortOrder: 4, active: true
    }]
  }, globalToken);
  assert.equal(invalidBatch.response.status, 409);
  assert.equal(Number(tables.PlatformConfig[3][1]), 10, "Invalid batch must not increment curriculum version");
  assert.equal(JSON.stringify(tables.GlobalModuleList), moduleRowsBeforeInvalidBatch, "Invalid batch must not partially write modules");

  const staleBatch = await post("/api/admin/platform/global/subjects/save-batch", {
    globalCurriculumVersion: 9,
    subjects: [{ clientKey: subjectId, subjectId, subjectName: "Stale Name", accessModel: "FREE", active: true }],
    modules: []
  }, globalToken);
  assert.equal(staleBatch.response.status, 409);
  assert.match(staleBatch.data.error, /changed since this screen was loaded/i);

  const newSubjectBatch = await post("/api/admin/platform/global/subjects/save-batch", {
    globalCurriculumVersion: 10,
    subjects: [{
      clientKey: "new-subject-arabic",
      subjectId: "",
      subjectName: "Global Arabic",
      accessModel: "SUBSCRIPTION",
      active: true
    }],
    modules: [{
      clientKey: "new-module-arabic",
      moduleId: "",
      subjectClientKey: "new-subject-arabic",
      moduleName: "Arabic Foundations",
      sortOrder: 1,
      active: true
    }]
  }, globalToken);
  assert.equal(newSubjectBatch.response.status, 200, JSON.stringify(newSubjectBatch.data));
  assert.equal(newSubjectBatch.data.globalCurriculumVersion, 11);
  assert.equal(newSubjectBatch.data.subjects.length, 1);
  assert.match(newSubjectBatch.data.subjects[0].subjectid, /^GSUBJ-/);
  assert.equal(newSubjectBatch.data.modules[0].subjectid, newSubjectBatch.data.subjects[0].subjectid);
  assert.equal(tables.GlobalSubjectAccessMatrix[0][2], newSubjectBatch.data.subjects[0].subjectid, "A new batch-created Subject must receive its own Access Matrix column");
  assert.equal(tables.GlobalSubjectAccessMatrix[1][2], false);

  const newSubjectId = newSubjectBatch.data.subjects[0].subjectid;
  const resourceBatchSave = await post("/api/admin/platform/global/resources/save-batch", {
    globalCurriculumVersion: 11,
    resources: [{
      clientKey: resourceId,
      resourceId,
      subjectId,
      moduleId,
      taskId,
      resourceName: "Lesson One PDF Revised",
      resourceType: "EBOOK",
      resourceDescription: "Updated in the screen-level batch",
      fileId: lessonFileId,
      active: true
    }, {
      clientKey: "new-resource-arabic",
      resourceId: "",
      subjectId: newSubjectId,
      moduleId: "",
      taskId: "",
      resourceName: "Arabic Handout",
      resourceType: "EBOOK",
      resourceDescription: "Created in the same save",
      fileId: secondLessonFileId,
      active: true
    }]
  }, globalToken);
  assert.equal(resourceBatchSave.response.status, 200, JSON.stringify(resourceBatchSave.data));
  assert.equal(resourceBatchSave.data.globalCurriculumVersion, 12);
  assert.equal(Number(tables.PlatformConfig[3][1]), 12, "Resource screen batch must increment curriculum version only once");
  assert.equal(resourceBatchSave.data.resources.length, 2);
  assert.equal(tables.GlobalResources.length, 3);
  assert.equal(tables.GlobalResources[1][4], "Lesson One PDF Revised");
  assert.equal(tables.GlobalResources[2][4], "Arabic Handout");

  const resourcesBeforeInvalidBatch = JSON.stringify(tables.GlobalResources);
  const invalidResourceBatch = await post("/api/admin/platform/global/resources/save-batch", {
    globalCurriculumVersion: 12,
    resources: [{
      clientKey: resourceId, resourceId, subjectId, moduleId, taskId,
      resourceName: "Should Not Persist", resourceType: "EBOOK",
      resourceDescription: "This update must roll back", fileId: lessonFileId, active: true
    }, {
      clientKey: "duplicate-drive-resource", resourceId: "", subjectId: newSubjectId,
      resourceName: "Duplicate Drive File", resourceType: "EBOOK",
      resourceDescription: "Invalid duplicate", fileId: secondLessonFileId, active: true
    }]
  }, globalToken);
  assert.equal(invalidResourceBatch.response.status, 409);
  assert.equal(Number(tables.PlatformConfig[3][1]), 12, "Invalid Resource batch must not increment curriculum version");
  assert.equal(JSON.stringify(tables.GlobalResources), resourcesBeforeInvalidBatch, "Invalid Resource batch must not partially write Resources");

  const staleResourceBatch = await post("/api/admin/platform/global/resources/save-batch", {
    globalCurriculumVersion: 11,
    resources: [{
      clientKey: resourceId, resourceId, subjectId, moduleId, taskId,
      resourceName: "Stale Resource Edit", resourceType: "EBOOK",
      resourceDescription: "Stale", fileId: lessonFileId, active: true
    }]
  }, globalToken);
  assert.equal(staleResourceBatch.response.status, 409);
  assert.match(staleResourceBatch.data.error, /changed since this screen was loaded/i);

  const finalList = await post("/api/admin/platform/global/get", {}, globalToken);
  assert.equal(finalList.response.status, 200);
  assert.equal(finalList.data.subjects.length, 2);
  assert.equal(finalList.data.subjects[0].subjectname, "Global Tajweed Revised");
  assert.equal(finalList.data.modules.length, 3);
  assert.equal(finalList.data.tasks.length, 1);
  assert.equal(finalList.data.resources.length, 2);
  assert.equal(finalList.data.subjectAccessMatrix.rows.length, 3);
  const subscriberMatrix = finalList.data.subjectAccessMatrix.rows.find(row => row.accountid === "ACCOUNT2");
  assert.equal(subscriberMatrix.values[subjectId], false);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("V102.10 global curriculum, default SUBSCRIPTION policy, protected Drive and access management tests passed.");

async function post(path, body, token) {
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

function applyWrite(write) {
  const fullRow = /^'([^']+)'!A(\d+):[A-Z]+\2$/.exec(write.range);
  if (fullRow) {
    const sheetName = fullRow[1];
    const rowNumber = Number(fullRow[2]);
    tables[sheetName][rowNumber - 1] = [...write.values[0]];
    return;
  }
  const config = /^'PlatformConfig'!B(\d+):E\1$/.exec(write.range);
  if (config) {
    const rowNumber = Number(config[1]);
    const row = tables.PlatformConfig[rowNumber - 1] || [];
    write.values[0].forEach((value, index) => { row[index + 1] = value; });
    tables.PlatformConfig[rowNumber - 1] = row;
    return;
  }
  const matrixCell = /^'GlobalSubjectAccessMatrix'!([A-Z]+)(\d+)$/.exec(write.range);
  if (matrixCell) {
    const columnIndex = columnNumber(matrixCell[1]) - 1;
    const rowIndex = Number(matrixCell[2]) - 1;
    const row = tables.GlobalSubjectAccessMatrix[rowIndex] || [];
    row[columnIndex] = write.values[0][0];
    tables.GlobalSubjectAccessMatrix[rowIndex] = row;
    return;
  }
  throw new Error(`Unexpected global-management write: ${write.range}`);
}

function columnNumber(name) {
  return String(name).split("").reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
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

function array(value) {
  return Array.isArray(value) ? value : [];
}

function driveFolder(id, name, parents = []) {
  return {
    id,
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents,
    trashed: false,
    capabilities: { canDownload: true }
  };
}

function driveFile(id, name, mimeType, parents, size) {
  return {
    id,
    name,
    mimeType,
    parents,
    size: String(size),
    trashed: false,
    capabilities: { canDownload: true }
  };
}
