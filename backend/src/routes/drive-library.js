/* M4L V101.3 - ModuleList-backed Library management with Admin auditing. */
import {
  getAuthUser,
  requireResourceCreator,
  requireSystemAdmin
} from "../lib/auth.js";
import {
  appendAdminAuditLog,
  getRequiredRowAuditColumns,
  prepareAdminAudit,
  stampCreatedRow,
  stampModifiedRow
} from "../lib/admin-audit.js";
import {
  appendGoogleSheetValues,
  batchReadGoogleSheetValues,
  readGoogleSheetValues,
  updateGoogleSheetValues
} from "../lib/google-sheets.js";
import {
  GOOGLE_DRIVE_FOLDER_MIME,
  downloadGoogleDriveFile,
  getGoogleDriveFileMetadata,
  isGoogleDriveNativeMimeType,
  listGoogleDriveFolder
} from "../lib/google-drive.js";
import { json } from "../lib/http.js";
import { readAcademyLibraryPolicies, academyResourceDecision } from "../lib/academy-library-policy.js";
import { readPlatformSheet } from "../lib/platform-sheet.js";

const SUBJECT_LIST_SHEET = "SubjectList";
const MODULE_LIST_SHEET = "ModuleList";
const TASK_LIST_SHEET = "TaskList";
const FULL_RANGE = "A:ZZ";
const DEFAULT_ACCESS_TTL_SECONDS = 60 * 60;
const MAX_ACCESS_TTL_SECONDS = 4 * 60 * 60;

const RESOURCE_CONFIGS = Object.freeze({
  EBOOK: resourceConfig({
    type: "EBOOK",
    label: "eBook",
    sheetName: "eBooks",
    idPrefix: "EBOOK",
    idHeaders: ["eBookId", "eBookID", "EBookId", "EBookID", "ResourceID"],
    nameHeaders: ["eBookName", "EBookName", "ResourceName"],
    formatHeaders: ["eBookFormat", "ebookFormat", "EBookFormat", "Format"],
    linkHeaders: ["eBookLink", "EBookLink", "ResourceLink", "Link"],
    acceptedMimeTypes: ["application/pdf"]
  }),
  PRINTABLE: resourceConfig({
    type: "PRINTABLE",
    label: "Printable",
    sheetName: "Printable",
    idPrefix: "PRINTABLE",
    idHeaders: ["PrintableId", "PrintableID", "ResourceID"],
    nameHeaders: ["PrintableName", "ResourceName"],
    formatHeaders: ["PrintableFormat", "Format"],
    linkHeaders: ["PrintableLink", "ResourceLink", "Link"],
    acceptedMimeTypes: ["application/pdf"]
  }),
  AUDIO: resourceConfig({
    type: "AUDIO",
    label: "Audio",
    sheetName: "Audio",
    idPrefix: "AUDIO",
    idHeaders: ["AudioId", "AudioID", "ResourceID"],
    nameHeaders: ["AudioName", "ResourceName"],
    formatHeaders: ["AudioFormat", "Format"],
    linkHeaders: ["AudioLink", "ResourceLink", "Link"],
    acceptedMimePrefixes: ["audio/"]
  }),
  VIDEO: resourceConfig({
    type: "VIDEO",
    label: "Video",
    sheetName: "Video",
    idPrefix: "VIDEO",
    idHeaders: ["VideoId", "VideoID", "ResourceID"],
    nameHeaders: ["VideoName", "ResourceName"],
    formatHeaders: ["VideoFormat", "Format"],
    linkHeaders: ["VideoLink", "ResourceLink", "Link"],
    acceptedMimePrefixes: ["video/"],
    acceptedMimeTypes: ["application/mp4"],
    acceptedExtensions: ["mp4", "m4v", "mov", "webm"]
  }),
  OTHER: resourceConfig({
    type: "OTHER",
    label: "Other",
    sheetName: "OtherResource",
    idPrefix: "OTHER",
    idHeaders: ["OtherResourceID", "OtherResourceId", "ResourceID"],
    nameHeaders: ["OtherResourceName", "ResourceName"],
    formatHeaders: ["OtherResourceFormat", "OtherResouceFormat", "OtherFormat", "ResourceFormat", "Format"],
    linkHeaders: ["OtherResourceLink", "ResourceLink", "OtherLink", "Link"],
    acceptedMimePrefixes: ["image/", "text/"],
    acceptedMimeTypes: [
      "application/zip",
      "application/x-zip-compressed",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ]
  })
});

const RESOURCE_CONFIG_LIST = Object.freeze(Object.values(RESOURCE_CONFIGS));

export async function browseDriveFolderEndpoint(request, env) {
  const permission = await requireResourceCreator(request, env);
  if (!permission.ok) return permission.response;

  const body = await request.json();
  const rootFolderId = getRootFolderId(env);
  const folderId = clean(body.folderId || rootFolderId);

  const folder = await requireItemInsideRoot(env, folderId, rootFolderId, {
    requireFolder: true,
    allowRoot: true
  });
  const listing = await listGoogleDriveFolder(env, folderId, {
    pageToken: clean(body.pageToken),
    pageSize: 500
  });
  const breadcrumbs = await buildDriveBreadcrumbs(env, folder, rootFolderId);
  const items = (Array.isArray(listing.files) ? listing.files : []).map(file => ({
    id: clean(file.id),
    name: clean(file.name),
    mimeType: clean(file.mimeType),
    size: normalizeSize(file.size),
    modifiedTime: clean(file.modifiedTime),
    isFolder: file.mimeType === GOOGLE_DRIVE_FOLDER_MIME,
    isGoogleNative: isGoogleDriveNativeMimeType(file.mimeType),
    canDownload: file.capabilities?.canDownload !== false,
    format: deriveFileFormat(file.name, file.mimeType),
    supportedTypes: getSupportedResourceTypes(file)
  })).filter(item => item.id && item.name);

  items.sort((left, right) => {
    if (left.isFolder !== right.isFolder) return left.isFolder ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });

  return json({
    success: true,
    rootFolderId,
    folder: {
      id: folder.id,
      name: folder.name || "M4L Resources"
    },
    breadcrumbs,
    items,
    nextPageToken: clean(listing.nextPageToken),
    incompleteSearch: listing.incompleteSearch === true
  });
}

export async function getResourceManagementOptionsEndpoint(request, env) {
  const permission = await requireResourceCreator(request, env);
  if (!permission.ok) return permission.response;

  const [subjectRows, moduleRows, taskRows] = await batchReadGoogleSheetValues(env, [
    `${SUBJECT_LIST_SHEET}!${FULL_RANGE}`,
    `${MODULE_LIST_SHEET}!${FULL_RANGE}`,
    `${TASK_LIST_SHEET}!${FULL_RANGE}`
  ]);

  return json({
    success: true,
    resourceTypes: RESOURCE_CONFIG_LIST.map(config => ({
      type: config.type,
      label: config.label
    })),
    subjects: buildResourceOptions(subjectRows, moduleRows, taskRows)
  });
}

export async function createDriveResourceEndpoint(request, env) {
  const permission = await requireResourceCreator(request, env);
  if (!permission.ok) return permission.response;

  const body = await request.json();
  const config = getResourceConfig(body.resourceType);
  if (!config) return json({ success: false, error: "Unsupported resource type" }, 400);

  const payload = normalizeResourcePayload(body);
  const validation = await validateResourcePayload(env, payload, { requireFile: true });
  if (!validation.ok) return json({ success: false, error: validation.error }, validation.status || 400);

  const rootFolderId = getRootFolderId(env);
  const file = await requireItemInsideRoot(env, payload.fileId, rootFolderId, { requireFile: true });
  const fileValidation = validateFileForResourceType(file, config);
  if (!fileValidation.ok) {
    return json({ success: false, error: fileValidation.error, code: "UNSUPPORTED_DRIVE_FILE" }, 400);
  }

  const duplicate = await findDuplicateDriveResource(env, file.id);
  if (duplicate) {
    return json({
      success: false,
      duplicate: true,
      code: "DUPLICATE_DRIVE_RESOURCE",
      error: "This Google Drive file is already in the Library.",
      resource: duplicate
    }, 409);
  }

  const sheet = await readRequiredResourceSheet(env, config);
  const columns = getRequiredResourceColumns(sheet.headers, config);
  if (!columns.ok) return json({ success: false, error: columns.error }, 503);
  const rowAudit = getRequiredRowAuditColumns(sheet.headers);
  if (!rowAudit.ok) return json({ success: false, error: rowAudit.error }, 503);
  const audit = await prepareAdminAudit(env, permission.user);
  if (!audit.ok) return json({ success: false, error: audit.error }, 503);

  const resourceId = nextResourceId(sheet.rows, columns.value.id, config.idPrefix);
  const resourceLink = buildPrivateDriveResourceLink(request, file.id);
  const now = audit.timestamp;
  const row = new Array(sheet.headers.length).fill("");

  setRowValue(row, columns.value.id, resourceId);
  setRowValue(row, columns.value.name, payload.name || stripFileExtension(file.name));
  setRowValue(row, columns.value.subjectId, validation.subject.subjectid);
  setRowValue(row, columns.value.subjectName, validation.subject.subjectname);
  setRowValue(row, columns.value.moduleId, validation.module?.moduleid || "");
  setRowValue(row, columns.value.moduleName, validation.module?.modulename || "");
  setRowValue(row, columns.value.taskId, validation.task?.taskid || "");
  setRowValue(row, columns.value.groupNo, payload.groupNo || "ALL");
  setRowValue(row, columns.value.format, deriveFileFormat(file.name, file.mimeType));
  setRowValue(row, columns.value.link, resourceLink);
  setRowValue(row, columns.value.active, payload.active);
  setRowValue(row, columns.value.date, now);
  stampCreatedRow(row, rowAudit.columns, audit.actor, now);

  await appendGoogleSheetValues(
    env,
    `${config.sheetName}!A:${columnToLetters(sheet.headers.length)}`,
    [row]
  );
  await appendAdminAuditLog(env, audit, {
    action: "CREATE",
    recordType: `${config.type}_RESOURCE`,
    recordId: resourceId,
    changedFields: [
      "Name",
      "SubjectID",
      "ModuleID",
      "TaskID",
      "GroupNo",
      "Format",
      "Link",
      "Active"
    ]
  });

  return json({
    success: true,
    message: "Resource added successfully",
    resource: mapManagedResource(row, columns.value, config, sheet.rows.length + 1)
  });
}

export async function listManagedResourcesEndpoint(request, env) {
  const permission = await requireSystemAdmin(request, env);
  if (!permission.ok) return permission.response;

  const resources = [];

  await Promise.all(RESOURCE_CONFIG_LIST.map(async config => {
    const sheet = await readOptionalResourceSheet(env, config);
    if (!sheet) return;
    const columns = getRequiredResourceColumns(sheet.headers, config, { allowMissingOptional: true });
    if (!columns.ok) return;

    sheet.rows.slice(1).forEach((row, offset) => {
      const resource = mapManagedResource(row, columns.value, config, offset + 2);
      if (resource.resourceid && resource.name) resources.push(resource);
    });
  }));

  resources.sort((left, right) => {
    const typeCompare = left.type.localeCompare(right.type);
    return typeCompare || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
  });

  return json({ success: true, count: resources.length, resources });
}

export async function updateDriveResourceEndpoint(request, env) {
  const permission = await requireSystemAdmin(request, env);
  if (!permission.ok) return permission.response;

  const body = await request.json();
  const config = getResourceConfig(body.resourceType);
  const resourceId = clean(body.resourceId || body.resourceid);

  if (!config || !resourceId) {
    return json({ success: false, error: "Resource type and resource ID are required" }, 400);
  }

  const payload = normalizeResourcePayload(body);
  const validation = await validateResourcePayload(env, payload, { requireFile: false });
  if (!validation.ok) return json({ success: false, error: validation.error }, validation.status || 400);

  const sheet = await readRequiredResourceSheet(env, config);
  const columns = getRequiredResourceColumns(sheet.headers, config);
  if (!columns.ok) return json({ success: false, error: columns.error }, 503);
  const rowAudit = getRequiredRowAuditColumns(sheet.headers);
  if (!rowAudit.ok) return json({ success: false, error: rowAudit.error }, 503);

  const requestedSheetRow = Number(body.sheetRow || body.sheetrow || 0);
  let rowIndex = -1;

  if (Number.isInteger(requestedSheetRow) && requestedSheetRow >= 2) {
    const candidateIndex = requestedSheetRow - 1;
    const candidateRow = sheet.rows[candidateIndex];
    if (candidateRow && clean(getCell(candidateRow, columns.value.id)) === resourceId) {
      rowIndex = candidateIndex;
    }
  }

  if (rowIndex < 1) {
    rowIndex = sheet.rows.findIndex((row, index) => (
      index > 0 && clean(getCell(row, columns.value.id)) === resourceId
    ));
  }

  if (rowIndex < 1) {
    return json({ success: false, error: "Resource not found" }, 404);
  }

  const audit = await prepareAdminAudit(env, permission.user);
  if (!audit.ok) return json({ success: false, error: audit.error }, 503);

  const existingRow = sheet.rows[rowIndex];
  const row = copyRow(existingRow, sheet.headers.length);
  let fileId = extractDriveFileId(getCell(row, columns.value.link));
  let file = null;

  if (payload.fileId && payload.fileId !== fileId) {
    const rootFolderId = getRootFolderId(env);
    file = await requireItemInsideRoot(env, payload.fileId, rootFolderId, { requireFile: true });
    const fileValidation = validateFileForResourceType(file, config);
    if (!fileValidation.ok) {
      return json({ success: false, error: fileValidation.error, code: "UNSUPPORTED_DRIVE_FILE" }, 400);
    }

    const duplicate = await findDuplicateDriveResource(env, file.id, {
      excludeType: config.type,
      excludeResourceId: resourceId,
      excludeSheetRow: rowIndex + 1
    });
    if (duplicate) {
      return json({
        success: false,
        duplicate: true,
        code: "DUPLICATE_DRIVE_RESOURCE",
        error: "This Google Drive file is already in the Library.",
        resource: duplicate
      }, 409);
    }

    fileId = file.id;
    setRowValue(row, columns.value.link, buildPrivateDriveResourceLink(request, file.id));
    setRowValue(row, columns.value.format, deriveFileFormat(file.name, file.mimeType));
  }

  setRowValue(row, columns.value.name, payload.name);
  setRowValue(row, columns.value.subjectId, validation.subject.subjectid);
  setRowValue(row, columns.value.subjectName, validation.subject.subjectname);
  setRowValue(row, columns.value.moduleId, validation.module?.moduleid || "");
  setRowValue(row, columns.value.moduleName, validation.module?.modulename || "");
  setRowValue(row, columns.value.taskId, validation.task?.taskid || "");
  setRowValue(row, columns.value.groupNo, payload.groupNo || "ALL");
  setRowValue(row, columns.value.active, payload.active);
  stampModifiedRow(row, rowAudit.columns, audit.actor, audit.timestamp);

  await updateGoogleSheetValues(
    env,
    `${config.sheetName}!A${rowIndex + 1}:${columnToLetters(sheet.headers.length)}${rowIndex + 1}`,
    [row]
  );
  await appendAdminAuditLog(env, audit, {
    action: "UPDATE",
    recordType: `${config.type}_RESOURCE`,
    recordId: resourceId,
    changedFields: [
      "Name",
      "SubjectID",
      "ModuleID",
      "TaskID",
      "GroupNo",
      ...(payload.fileId ? ["Format", "Link"] : []),
      "Active"
    ]
  });

  return json({
    success: true,
    message: "Resource updated successfully",
    resource: mapManagedResource(row, columns.value, config, rowIndex + 1)
  });
}

export async function createDriveFileAccessEndpoint(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return json({ success: false, error: "Unauthorized" }, 401);

  const body = await request.json();
  const config = getResourceConfig(body.resourceType);
  const resourceId = clean(body.resourceId || body.resourceid);

  if (!config || !resourceId) {
    return json({ success: false, error: "Resource type and resource ID are required" }, 400);
  }

  const sheet = await readRequiredResourceSheet(env, config);
  const columns = getRequiredResourceColumns(sheet.headers, config);
  if (!columns.ok) return json({ success: false, error: columns.error }, 503);

  const rowIndex = sheet.rows.findIndex((row, index) => (
    index > 0 && clean(getCell(row, columns.value.id)) === resourceId
  ));

  if (rowIndex < 1) return json({ success: false, error: "Resource not found" }, 404);

  const row = sheet.rows[rowIndex];
  if (!isActive(getCell(row, columns.value.active))) {
    return json({ success: false, error: "Resource is inactive" }, 403);
  }

  const studentGroup = authUser.type === "student"
    ? clean(authUser.classgroup || authUser.group || authUser.groupno)
    : "";
  const resourceGroup = clean(getCell(row, columns.value.groupNo));

  if (authUser.type === 'student' && !groupMatches(resourceGroup, studentGroup)) {
    return json({ success: false, error: "Resource is not available to this group" }, 403);
  }

  const courseId = clean(env.M4L_AUTHENTICATED_COURSE_ID || authUser.courseid);
  if (courseId) {
    const key = `COURSE:${courseId}:${config.type}:${resourceId}`;
    const policies = await readAcademyLibraryPolicies(env);
    const globalMatrix = policies.get(key)?.state === 'SUBSCRIPTION'
      ? await readPlatformSheet(env, 'GlobalSubjectAccessMatrix') : [];
    const globalSubjects = policies.get(key)?.state === 'SUBSCRIPTION'
      ? await readPlatformSheet(env, 'GlobalSubjectList') : [];
    const decision = academyResourceDecision({ key, source: 'COURSE', sourceActive: true,
      assigned: true, role: authUser.centralrole || authUser.role,
      accountId: authUser.accountid, policy: policies.get(key), globalMatrix, globalSubjects });
    if (!decision.open) return json({ success: false, error: 'Resource is unavailable' }, 403);
  }

  const fileId = extractDriveFileId(getCell(row, columns.value.link));
  if (!fileId) return json({ success: false, error: "Resource file is not configured" }, 409);

  const rootFolderId = getRootFolderId(env);
  const file = await requireItemInsideRoot(env, fileId, rootFolderId, { requireFile: true });
  const fileValidation = validateFileForResourceType(file, config);
  if (!fileValidation.ok) return json({ success: false, error: fileValidation.error }, 409);

  const accessToken = await createDriveAccessToken({
    fileId: file.id,
    resourceType: config.type,
    resourceId,
    filename: file.name,
    mimeType: file.mimeType
  }, env);
  const expiresIn = getDriveAccessTtlSeconds(env);
  const origin = new URL(request.url).origin;

  return json({
    success: true,
    url: `${origin}/api/library/drive/file/${encodeURIComponent(file.id)}?access=${encodeURIComponent(accessToken)}`,
    expiresIn,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    filename: file.name,
    mimeType: file.mimeType,
    format: deriveFileFormat(file.name, file.mimeType)
  });
}

export async function streamDriveFileEndpoint(request, env, fileId) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const claims = await verifyDriveAccessToken(url.searchParams.get("access"), env);
  const cleanFileId = clean(fileId);

  if (!claims || claims.fileId !== cleanFileId) {
    return json({ success: false, error: "Invalid or expired file access" }, 401);
  }

  const range = request.headers.get("Range") || "";
  const driveResponse = await downloadGoogleDriveFile(env, cleanFileId, {
    method: request.method,
    range
  });

  if (!driveResponse.ok && driveResponse.status !== 206) {
    return json({ success: false, error: "Unable to retrieve Drive file" }, driveResponse.status || 502);
  }

  const headers = new Headers();
  const contentType = driveResponse.headers.get("Content-Type") || claims.mimeType || "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(claims.filename || "resource")}`);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Range");
  headers.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Disposition, Content-Type");
  headers.set("Accept-Ranges", driveResponse.headers.get("Accept-Ranges") || "bytes");

  ["Content-Length", "Content-Range", "ETag", "Last-Modified"].forEach(name => {
    const value = driveResponse.headers.get(name);
    if (value) headers.set(name, value);
  });

  return new Response(request.method === "HEAD" ? null : driveResponse.body, {
    status: driveResponse.status,
    statusText: driveResponse.statusText,
    headers
  });
}

export function extractDriveFileId(link) {
  const value = clean(link);
  if (!value) return "";

  try {
    const url = new URL(value, "https://m4l.invalid");
    const workerMatch = /^\/api\/library\/drive\/file\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (workerMatch) return workerMatch[1];

    const driveFileMatch = /^\/file\/d\/([A-Za-z0-9_-]+)/.exec(url.pathname);
    if (url.hostname === "drive.google.com" && driveFileMatch) return driveFileMatch[1];

    const queryId = url.searchParams.get("id");
    if ((url.hostname === "drive.google.com" || url.hostname === "docs.google.com") && queryId) {
      return clean(queryId);
    }
  } catch (error) {
    return "";
  }

  return "";
}

function resourceConfig(config) {
  return Object.freeze({
    acceptedMimeTypes: [],
    acceptedMimePrefixes: [],
    acceptedExtensions: [],
    ...config,
    subjectIdHeaders: ["SubjectId", "SubjectID"],
    subjectNameHeaders: ["SubjectName", "Subject"],
    moduleIdHeaders: ["ModuleId", "ModuleID", "ModuletID"],
    moduleNameHeaders: ["ModuleName", "Module"],
    taskIdHeaders: ["TaskId", "TaskID"],
    groupNoHeaders: ["GroupNo", "Group", "ClassGroup", "classgroup"],
    activeHeaders: ["Active"],
    dateHeaders: ["Date", "CreatedDate"]
  });
}

export function getResourceConfig(value) {
  const type = clean(value).toUpperCase().replace(/[\s-]+/g, "_");
  const aliases = {
    EBOOKS: "EBOOK",
    PDF: "EBOOK",
    PDFS: "EBOOK",
    PRINTABLES: "PRINTABLE",
    AUDIOS: "AUDIO",
    VIDEOS: "VIDEO",
    OTHERRESOURCE: "OTHER",
    OTHER_RESOURCES: "OTHER"
  };
  return RESOURCE_CONFIGS[aliases[type] || type] || null;
}

function normalizeResourcePayload(body = {}) {
  return {
    name: clean(body.name || body.resourceName),
    subjectId: clean(body.subjectId || body.subjectid),
    moduleKey: clean(body.moduleKey || body.modulekey || body.moduleId || body.moduleid),
    taskId: clean(body.taskId || body.taskid),
    groupNo: clean(body.groupNo || body.groupno || "ALL") || "ALL",
    active: body.active !== false,
    fileId: clean(body.fileId || body.fileid)
  };
}

async function validateResourcePayload(env, payload, options = {}) {
  if (!payload.name) return { ok: false, error: "Resource name is required" };
  if (!payload.subjectId) return { ok: false, error: "Subject is required" };
  if (!payload.groupNo) return { ok: false, error: "Group is required" };
  if (options.requireFile && !payload.fileId) return { ok: false, error: "Select a Google Drive file" };

  const [subjectRows, moduleRows, taskRows] = await batchReadGoogleSheetValues(env, [
    `${SUBJECT_LIST_SHEET}!${FULL_RANGE}`,
    `${MODULE_LIST_SHEET}!${FULL_RANGE}`,
    `${TASK_LIST_SHEET}!${FULL_RANGE}`
  ]);
  const subjects = buildResourceOptions(subjectRows, moduleRows, taskRows);
  const subject = subjects.find(item => item.subjectid === payload.subjectId);
  if (!subject) return { ok: false, error: "Selected subject was not found" };

  let module = null;
  let task = null;

  if (payload.moduleKey) {
    module = subject.modules.find(item => (
      item.modulekey === payload.moduleKey || item.moduleid === payload.moduleKey
    ));
    if (!module) return { ok: false, error: "Selected module does not belong to the subject" };
  }

  if (payload.taskId) {
    const candidateTasks = module
      ? module.tasks
      : subject.unassignedTasks;
    task = candidateTasks.find(item => item.taskid === payload.taskId);
    if (!task) return { ok: false, error: "Selected task does not belong to the subject and module" };
  }

  return { ok: true, subject, module, task };
}

function buildResourceOptions(subjectRows = [], moduleRows = [], taskRows = []) {
  const subjects = [];
  const subjectMap = new Map();
  const subjectHeaders = buildHeaderMap(subjectRows[0] || []);
  const subjectColumns = {
    id: findColumn(subjectHeaders, ["SubjectId", "SubjectID"]),
    name: findColumn(subjectHeaders, ["SubjectName", "Subject"]),
    active: findColumn(subjectHeaders, ["Active", "Status"])
  };

  subjectRows.slice(1).forEach(row => {
    const subjectid = clean(getCell(row, subjectColumns.id));
    const subjectname = clean(getCell(row, subjectColumns.name));
    const active = subjectColumns.active < 0 || isActive(getCell(row, subjectColumns.active));
    if (!subjectid || !subjectname || !active) return;

    const subject = {
      subjectid,
      subjectname,
      modules: [],
      unassignedTasks: [],
      _moduleMap: new Map()
    };
    subjectMap.set(subjectid, subject);
    subjects.push(subject);
  });

  // ModuleList is authoritative for the Library module picker.
  // TaskList may attach tasks to these modules, but it must not invent modules.
  const moduleHeaders = buildHeaderMap(moduleRows[0] || []);
  const moduleColumns = {
    id: findColumn(moduleHeaders, ["ModuleId", "ModuleID"]),
    subjectId: findColumn(moduleHeaders, ["SubjectId", "SubjectID"]),
    name: findColumn(moduleHeaders, ["ModuleName", "Module"]),
    sortOrder: findColumn(moduleHeaders, ["Sort Order", "SortOrder", "ModuleSortOrder"]),
    active: findColumn(moduleHeaders, ["Active", "Status"])
  };

  moduleRows.slice(1).forEach(row => {
    const moduleid = clean(getCell(row, moduleColumns.id));
    const subjectid = clean(getCell(row, moduleColumns.subjectId));
    const modulename = clean(getCell(row, moduleColumns.name));
    const active = moduleColumns.active < 0 || isActive(getCell(row, moduleColumns.active));
    const subject = subjectMap.get(subjectid);
    if (!subject || !moduleid || !active) return;

    const rawSortOrder = moduleColumns.sortOrder < 0 ? "" : getCell(row, moduleColumns.sortOrder);
    const numericSortOrder = Number(rawSortOrder);
    const module = {
      modulekey: moduleid,
      moduleid,
      modulename: modulename || moduleid,
      sortorder: Number.isFinite(numericSortOrder) && String(rawSortOrder).trim() !== ""
        ? numericSortOrder
        : Number.MAX_SAFE_INTEGER,
      tasks: []
    };

    subject._moduleMap.set(moduleid, module);
    subject.modules.push(module);
  });

  const taskHeaders = buildHeaderMap(taskRows[0] || []);
  const taskColumns = {
    id: findColumn(taskHeaders, ["TaskId", "TaskID"]),
    subjectId: findColumn(taskHeaders, ["SubjectId", "SubjectID"]),
    name: findColumn(taskHeaders, ["TaskName", "Task"]),
    moduleId: findColumn(taskHeaders, ["ModuleId", "ModuleID", "ModuletID"]),
    moduleName: findColumn(taskHeaders, ["ModuleName", "Module"]),
    active: findColumn(taskHeaders, ["Active", "Status"])
  };

  taskRows.slice(1).forEach(row => {
    const taskid = clean(getCell(row, taskColumns.id));
    const subjectid = clean(getCell(row, taskColumns.subjectId));
    const taskname = clean(getCell(row, taskColumns.name));
    const active = taskColumns.active < 0 || isActive(getCell(row, taskColumns.active));
    const subject = subjectMap.get(subjectid);
    if (!subject || !taskid || !taskname || !active) return;

    const task = { taskid, taskname };
    const moduleid = clean(getCell(row, taskColumns.moduleId));
    const modulename = clean(getCell(row, taskColumns.moduleName));

    if (!moduleid && !modulename) {
      subject.unassignedTasks.push(task);
      return;
    }

    let module = moduleid ? subject._moduleMap.get(moduleid) : null;

    // Legacy TaskList rows may contain only ModuleName. Match that name to an
    // existing active ModuleList row, but never create a module from TaskList.
    if (!module && !moduleid && modulename) {
      const normalizedModuleName = normalizeMatch(modulename);
      module = subject.modules.find(item => normalizeMatch(item.modulename) === normalizedModuleName) || null;
    }

    if (!module) return;
    module.tasks.push(task);
  });

  subjects.forEach(subject => {
    subject.modules.sort((a, b) => {
      if (a.sortorder !== b.sortorder) return a.sortorder - b.sortorder;
      const idCompare = compareText(a.moduleid, b.moduleid);
      return idCompare || compareText(a.modulename, b.modulename);
    });
    subject.modules.forEach(module => module.tasks.sort((a, b) => compareText(a.taskname, b.taskname)));
    subject.unassignedTasks.sort((a, b) => compareText(a.taskname, b.taskname));
    delete subject._moduleMap;
  });
  subjects.sort((a, b) => compareText(a.subjectname, b.subjectname));
  return subjects;
}

async function findDuplicateDriveResource(env, fileId, options = {}) {
  let duplicate = null;

  for (const config of RESOURCE_CONFIG_LIST) {
    const sheet = await readOptionalResourceSheet(env, config);
    if (!sheet) continue;
    const columns = getRequiredResourceColumns(sheet.headers, config, { allowMissingOptional: true });
    if (!columns.ok) continue;

    for (let index = 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index];
      const rowResourceId = clean(getCell(row, columns.value.id));
      if (
        config.type === options.excludeType &&
        (index + 1 === Number(options.excludeSheetRow || 0) ||
          rowResourceId === clean(options.excludeResourceId))
      ) continue;

      if (extractDriveFileId(getCell(row, columns.value.link)) === fileId) {
        duplicate = mapManagedResource(row, columns.value, config, index + 1);
        break;
      }
    }

    if (duplicate) break;
  }

  return duplicate;
}

async function readRequiredResourceSheet(env, config) {
  const sheet = await readOptionalResourceSheet(env, config);
  if (!sheet) throw new Error(`Missing resource sheet: ${config.sheetName}`);
  if (!sheet.headers.length) throw new Error(`Resource sheet has no header row: ${config.sheetName}`);
  return sheet;
}

async function readOptionalResourceSheet(env, config) {
  try {
    const rows = await readGoogleSheetValues(env, `${config.sheetName}!${FULL_RANGE}`);
    return { headers: rows[0] || [], rows };
  } catch (error) {
    if (isMissingSheetError(error, config.sheetName)) return null;
    throw error;
  }
}

function getRequiredResourceColumns(headers, config, options = {}) {
  const headerMap = buildHeaderMap(headers);
  const columns = {
    id: findColumn(headerMap, config.idHeaders),
    name: findColumn(headerMap, config.nameHeaders),
    subjectId: findColumn(headerMap, config.subjectIdHeaders),
    subjectName: findColumn(headerMap, config.subjectNameHeaders),
    moduleId: findColumn(headerMap, config.moduleIdHeaders),
    moduleName: findColumn(headerMap, config.moduleNameHeaders),
    taskId: findColumn(headerMap, config.taskIdHeaders),
    groupNo: findColumn(headerMap, config.groupNoHeaders),
    format: findColumn(headerMap, config.formatHeaders),
    link: findColumn(headerMap, config.linkHeaders),
    active: findColumn(headerMap, config.activeHeaders),
    date: findColumn(headerMap, config.dateHeaders)
  };
  const required = ["id", "name", "subjectId", "subjectName", "groupNo", "format", "link", "active", "date"];
  const missing = required.filter(key => columns[key] < 0);

  if (missing.length && !options.allowMissingOptional) {
    return {
      ok: false,
      error: `Missing required columns in ${config.sheetName}: ${missing.join(", ")}`
    };
  }

  if (columns.id < 0 || columns.name < 0 || columns.link < 0) {
    return { ok: false, error: `Missing ID, name, or link column in ${config.sheetName}` };
  }

  return { ok: true, value: columns };
}

function mapManagedResource(row, columns, config, sheetRow) {
  const link = clean(getCell(row, columns.link));
  return {
    type: config.type,
    typeLabel: config.label,
    sheetName: config.sheetName,
    sheetRow,
    resourceid: clean(getCell(row, columns.id)),
    name: clean(getCell(row, columns.name)),
    subjectid: clean(getCell(row, columns.subjectId)),
    subjectname: clean(getCell(row, columns.subjectName)),
    moduleid: clean(getCell(row, columns.moduleId)),
    modulename: clean(getCell(row, columns.moduleName)),
    taskid: clean(getCell(row, columns.taskId)),
    groupno: clean(getCell(row, columns.groupNo)),
    format: clean(getCell(row, columns.format)),
    link,
    fileid: extractDriveFileId(link),
    active: isActive(getCell(row, columns.active)),
    date: clean(getCell(row, columns.date))
  };
}

export async function requireItemInsideRoot(env, itemId, rootFolderId, options = {}) {
  const item = await getGoogleDriveFileMetadata(env, itemId);
  if (!item || item.trashed === true) throw new Error("Google Drive item was not found or is in Trash");
  if (options.requireFolder && item.mimeType !== GOOGLE_DRIVE_FOLDER_MIME) {
    throw new Error("Selected Google Drive item is not a folder");
  }
  if (options.requireFile && item.mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
    throw new Error("Select a file, not a folder");
  }

  if (item.id === rootFolderId && options.allowRoot) return item;
  const inside = await isDriveItemDescendant(env, item, rootFolderId);
  if (!inside) throw new Error(`Google Drive item is outside the configured ${options.rootLabel || "M4L Resources"} folder`);
  return item;
}

async function isDriveItemDescendant(env, item, rootFolderId) {
  const queue = Array.isArray(item.parents) ? item.parents.slice() : [];
  const visited = new Set([item.id]);
  let inspected = 0;

  while (queue.length && inspected < 100) {
    const parentId = clean(queue.shift());
    if (!parentId || visited.has(parentId)) continue;
    if (parentId === rootFolderId) return true;
    visited.add(parentId);
    inspected += 1;

    const parent = await getGoogleDriveFileMetadata(env, parentId);
    if (!parent || parent.trashed === true) continue;
    (Array.isArray(parent.parents) ? parent.parents : []).forEach(id => queue.push(id));
  }

  return false;
}

export async function buildDriveBreadcrumbs(env, folder, rootFolderId) {
  const breadcrumbs = [{ id: folder.id, name: folder.name || "Folder" }];
  let current = folder;
  const visited = new Set([folder.id]);

  while (current.id !== rootFolderId && breadcrumbs.length < 40) {
    const parentId = clean(Array.isArray(current.parents) ? current.parents[0] : "");
    if (!parentId || visited.has(parentId)) break;
    const parent = await getGoogleDriveFileMetadata(env, parentId);
    if (!parent) break;
    visited.add(parentId);
    breadcrumbs.unshift({ id: parent.id, name: parent.name || "Folder" });
    current = parent;
  }

  if (breadcrumbs[0]?.id !== rootFolderId) {
    throw new Error("Unable to build a path inside the configured M4L Resources folder");
  }

  return breadcrumbs;
}

export function validateFileForResourceType(file, config) {
  if (!file || file.trashed === true) return { ok: false, error: "The selected Drive file is unavailable" };
  if (file.mimeType === GOOGLE_DRIVE_FOLDER_MIME) return { ok: false, error: "Select a file, not a folder" };
  if (isGoogleDriveNativeMimeType(file.mimeType)) {
    return { ok: false, error: "Google Docs, Sheets, and Slides are not supported in V100.4" };
  }
  if (file.capabilities?.canDownload === false) {
    return { ok: false, error: "The service account is not permitted to download this Drive file" };
  }

  const mimeType = clean(file.mimeType).toLowerCase();
  const exact = config.acceptedMimeTypes.includes(mimeType);
  const prefix = config.acceptedMimePrefixes.some(value => mimeType.startsWith(value));
  const extension = getFileExtension(file.name);
  const genericMimeType = !mimeType || [
    "application/octet-stream",
    "binary/octet-stream",
    "application/binary",
    "application/x-download"
  ].includes(mimeType);
  const extensionFallback = genericMimeType && config.acceptedExtensions.includes(extension);

  return exact || prefix || extensionFallback
    ? { ok: true }
    : { ok: false, error: `${file.name || "This file"} is not supported as ${config.label}.` };
}

export function getSupportedResourceTypes(file) {
  if (!file || file.mimeType === GOOGLE_DRIVE_FOLDER_MIME || isGoogleDriveNativeMimeType(file.mimeType)) return [];
  return RESOURCE_CONFIG_LIST
    .filter(config => validateFileForResourceType(file, config).ok)
    .map(config => config.type);
}

function nextResourceId(rows, idColumn, prefix) {
  const existing = new Set();
  let maximum = 0;

  rows.slice(1).forEach(row => {
    const id = clean(getCell(row, idColumn));
    if (!id) return;
    existing.add(id.toUpperCase());
    const match = new RegExp(`^${prefix}(\\d+)$`, "i").exec(id.replace(/[^A-Za-z0-9]/g, ""));
    if (match) maximum = Math.max(maximum, Number(match[1]));
  });

  let next = maximum + 1;
  while (existing.has(`${prefix}${next}`.toUpperCase())) next += 1;
  return `${prefix}${next}`;
}

function buildPrivateDriveResourceLink(request, fileId) {
  return `${new URL(request.url).origin}/api/library/drive/file/${encodeURIComponent(fileId)}`;
}

export async function createDriveAccessToken(payload, env) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    purpose: "m4l-drive-file",
    iat: now,
    exp: now + getDriveAccessTtlSeconds(env)
  };
  const encoded = base64urlText(JSON.stringify(body));
  const signature = await signAccessToken(encoded, env.SESSION_SECRET);
  return `${encoded}.${signature}`;
}

async function verifyDriveAccessToken(token, env) {
  try {
    const parts = clean(token).split(".");
    if (parts.length !== 2) return null;
    const [encoded, signature] = parts;
    const expected = await signAccessToken(encoded, env.SESSION_SECRET);
    if (!constantTimeEqual(expected, signature)) return null;
    const payload = JSON.parse(base64urlDecodeText(encoded));
    if (payload.purpose !== "m4l-drive-file") return null;
    if (!payload.fileId || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

async function signAccessToken(value, secret) {
  const normalizedSecret = clean(secret);
  if (!normalizedSecret) throw new Error("Missing SESSION_SECRET Worker secret");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64urlBytes(new Uint8Array(signature));
}

export function getDriveAccessTtlSeconds(env) {
  const requested = Number(env.M4L_DRIVE_ACCESS_TTL_SECONDS || DEFAULT_ACCESS_TTL_SECONDS);
  if (!Number.isFinite(requested)) return DEFAULT_ACCESS_TTL_SECONDS;
  return Math.min(MAX_ACCESS_TTL_SECONDS, Math.max(300, Math.floor(requested)));
}

export function getRootFolderId(env) {
  const id = clean(env.M4L_GOOGLE_DRIVE_ROOT_FOLDER_ID);
  if (!id) throw new Error("Missing M4L_GOOGLE_DRIVE_ROOT_FOLDER_ID Worker variable");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("M4L_GOOGLE_DRIVE_ROOT_FOLDER_ID is invalid");
  return id;
}

function getFileExtension(name) {
  const match = /\.([A-Za-z0-9]{1,12})$/.exec(clean(name));
  return match ? match[1].toLowerCase() : "";
}

export function deriveFileFormat(name, mimeType) {
  const cleanName = clean(name);
  const extensionMatch = /\.([A-Za-z0-9]{1,12})$/.exec(cleanName);
  if (extensionMatch) return extensionMatch[1].toUpperCase();

  const mimeFormats = {
    "application/pdf": "PDF",
    "audio/mpeg": "MP3",
    "audio/mp4": "M4A",
    "video/mp4": "MP4",
    "video/webm": "WEBM",
    "image/jpeg": "JPG",
    "image/png": "PNG"
  };
  return mimeFormats[clean(mimeType).toLowerCase()] || "FILE";
}

function stripFileExtension(name) {
  return clean(name).replace(/\.[^.]+$/, "") || clean(name);
}

function normalizeSize(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function groupMatches(rowGroup, studentGroup) {
  const rowValue = normalizeMatch(rowGroup);
  const studentValue = normalizeMatch(studentGroup);

  // Keep direct/private file authorization aligned with catalogue filtering.
  // Resource GroupNo 0 remains literal and does not replace resource-side ALL.
  return studentValue === "0" ||
    !rowValue ||
    rowValue === "all" ||
    rowValue === studentValue;
}

function buildHeaderMap(headers) {
  return headers.reduce((map, header, index) => {
    const key = normalizeHeader(header);
    if (key) map[key] = index;
    return map;
  }, {});
}

function findColumn(headerMap, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return -1;
}

function getCell(row, index) {
  return index >= 0 ? row?.[index] : "";
}

function setRowValue(row, index, value) {
  if (index >= 0) row[index] = value;
}

function copyRow(row, length) {
  const copy = Array.isArray(row) ? row.slice(0, length) : [];
  while (copy.length < length) copy.push("");
  return copy;
}

function columnToLetters(number) {
  let value = Number(number);
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result || "A";
}

function isActive(value) {
  if (value === true) return true;
  return ["true", "yes", "y", "active", "1"].includes(clean(value).toLowerCase());
}

function isMissingSheetError(error, sheetName) {
  const message = error?.message || String(error || "");
  return message.includes("Google Sheets API error 400:") &&
    message.includes("Unable to parse range") &&
    message.toLowerCase().includes(sheetName.toLowerCase());
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeMatch(value) {
  return clean(value).toLowerCase().replace(/\s+/g, "");
}

function compareText(a, b) {
  return clean(a).localeCompare(clean(b), undefined, { numeric: true, sensitivity: "base" });
}

function clean(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function base64urlText(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  return base64urlBytes(bytes);
}

function base64urlBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecodeText(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
