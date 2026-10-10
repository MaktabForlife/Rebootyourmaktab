/* M4L V102.10 - Central global curriculum, policy-aware access and protected Drive resources. */

import { getAuthUser as defaultGetAuthUser } from "../lib/auth.js";
import { readAcademyLibraryPolicies, academyResourceDecision } from "../lib/academy-library-policy.js";
import { batchUpdateGoogleSheetValues as defaultBatchUpdateGoogleSheetValues } from "../lib/google-sheets.js";
import {
  GOOGLE_DRIVE_FOLDER_MIME,
  isGoogleDriveNativeMimeType,
  listGoogleDriveFolder
} from "../lib/google-drive.js";
import { json } from "../lib/http.js";
import {
  buildGlobalSubjectAccessMatrixPayload,
  countActiveGlobalSubjectSubscriptions,
  globalSubjectAccessMatrixColumn,
  globalSubjectAccessMatrixColumns,
  hasActiveGlobalSubjectSubscription,
  resolveGlobalSubjectAccessPolicy
} from "../lib/global-subject-delivery.js";
import {
  getPlatformSpreadsheetId as defaultGetPlatformSpreadsheetId,
  readPlatformSheet as defaultReadPlatformSheet
} from "../lib/platform-sheet.js";
import {
  isActivePlatformValue,
  normalizePlatformIdentifier,
  PLATFORM_SHEET_HEADERS
} from "../lib/platform-schema.js";
import {
  buildGoogleDriveFolderUrl,
  extractGoogleDriveFolderId
} from "../lib/system-config.js";
import {
  buildDriveBreadcrumbs,
  createDriveAccessToken,
  deriveFileFormat,
  extractDriveFileId,
  getDriveAccessTtlSeconds,
  getResourceConfig,
  getSupportedResourceTypes,
  requireItemInsideRoot,
  validateFileForResourceType
} from "./drive-library.js";

const GLOBAL_RESOURCE_TYPES = new Set(["EBOOK", "PRINTABLE", "AUDIO", "VIDEO", "OTHER"]);
const GLOBAL_SUBJECT_ACCESS_MODELS = new Set(["FREE", "SUBSCRIPTION"]);
const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 2000;
const GLOBAL_RESOURCE_DRIVE_ROOT_KEY = "GlobalResourceDriveRootFolderID";

// Each request supplies its own storage dependencies.
export function createGlobalManagementEndpoints(storage = {}) {
  const getAuthUser = storage.getAuthUser || defaultGetAuthUser;
  const batchUpdateGoogleSheetValues = storage.batchUpdateGoogleSheetValues || defaultBatchUpdateGoogleSheetValues;
  const getPlatformSpreadsheetId = storage.getPlatformSpreadsheetId || defaultGetPlatformSpreadsheetId;
  const readPlatformSheet = storage.readPlatformSheet || defaultReadPlatformSheet;

async function getPlatformGlobalManagementEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const tables = await readManagementTables(env);
    const driveRoot = readGlobalResourceDriveRoot(tables.PlatformConfig);
    return json({
      success: true,
      service: "platform-global-management",
      globalCurriculumVersion: readGlobalCurriculumVersion(tables.PlatformConfig).value,
      subjects: tables.GlobalSubjectList.map(mapSubject),
      modules: tables.GlobalModuleList.map(mapModule),
      tasks: tables.GlobalTaskList.map(mapTask),
      resources: tables.GlobalResources.map(mapResource),
      accounts: tables.UserAccounts.map(mapAccount),
      subjectAccessMatrix: buildGlobalSubjectAccessMatrixPayload(
        tables.GlobalSubjectAccessMatrix,
        tables.UserAccounts,
        tables.GlobalSubjectList,
        tables.GlobalSubjectAccessPolicy
      ),
      globalResourceDriveRoot: mapGlobalResourceDriveRoot(driveRoot, permission.user)
    });
  } catch (error) {
    return managementError(error, env);
  }
}

async function savePlatformGlobalDriveRootEndpoint(request, env) {
  const permission = await requirePlatformGlobalAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    let folderId = "";
    try {
      folderId = extractGoogleDriveFolderId(body.folderId || body.folderUrl || body.value);
    } catch (error) {
      throw clientError("Enter a valid Global Resources Google Drive folder URL or folder ID", 400);
    }
    const folder = await requireGlobalDriveItem(env, folderId, folderId, {
      requireFolder: true,
      allowRoot: true
    }, 400);
    const tables = await readManagementTables(env);
    const existing = readGlobalResourceDriveRoot(tables.PlatformConfig);

    if (existing.configured && existing.folderId === folderId) {
      return json({
        success: true,
        message: "Global Resources Drive folder is already configured",
        globalResourceDriveRoot: mapGlobalResourceDriveRoot(existing, permission.user, folder.name)
      });
    }

    const outsideResources = [];
    for (const resource of tables.GlobalResources) {
      const fileId = extractDriveFileId(resource.ResourceLink);
      if (!fileId) continue;
      try {
        await requireGlobalDriveItem(env, fileId, folderId, { requireFile: true }, 409);
      } catch (error) {
        outsideResources.push(String(resource.ResourceName || resource.ResourceID || "Resource"));
      }
    }
    if (outsideResources.length) {
      throw clientError(
        `The new folder does not contain ${outsideResources.length} existing Drive-backed global resource${outsideResources.length === 1 ? "" : "s"}: ${outsideResources.slice(0, 3).join(", ")}`,
        409
      );
    }

    const timestamp = new Date().toISOString();
    const record = {
      ConfigKey: GLOBAL_RESOURCE_DRIVE_ROOT_KEY,
      ConfigValue: folderId,
      UpdatedDate: timestamp,
      UpdatedByAccountID: permission.user.accountid,
      UpdatedByAccountName: permission.user.username
    };
    const version = readGlobalCurriculumVersion(tables.PlatformConfig);
    const auditRow = buildAuditRow(permission.user, {
      action: existing.configured ? "UPDATE_GLOBAL_RESOURCE_DRIVE_ROOT" : "SET_GLOBAL_RESOURCE_DRIVE_ROOT",
      recordType: "PLATFORM_CONFIG",
      recordId: GLOBAL_RESOURCE_DRIVE_ROOT_KEY,
      changedFields: ["ConfigValue"],
      timestamp
    });
    await batchUpdateGoogleSheetValues(env, [
      valueWrite(
        "PlatformConfig",
        existing.rowNumber || nextRowNumber(tables.PlatformConfig),
        recordToRow(record, PLATFORM_SHEET_HEADERS.PlatformConfig)
      ),
      {
        range: `'PlatformConfig'!B${version.rowNumber}:E${version.rowNumber}`,
        majorDimension: "ROWS",
        values: [[version.value + 1, timestamp, permission.user.accountid, permission.user.username]]
      },
      valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), auditRow)
    ], { spreadsheetId: getPlatformSpreadsheetId(env) });

    return json({
      success: true,
      message: existing.configured
        ? "Global Resources Drive folder updated"
        : "Global Resources Drive folder configured",
      globalCurriculumVersion: version.value + 1,
      globalResourceDriveRoot: mapGlobalResourceDriveRoot({
        configured: true,
        folderId,
        rowNumber: existing.rowNumber || nextRowNumber(tables.PlatformConfig)
      }, permission.user, folder.name)
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function browsePlatformGlobalDriveFolderEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const root = readGlobalResourceDriveRoot(await readPlatformSheet(env, "PlatformConfig"));
    if (!root.configured) {
      throw clientError("Configure the Global Resources Google Drive folder first", 409);
    }
    const folderId = clean(body.folderId || root.folderId);
    const folder = await requireGlobalDriveItem(env, folderId, root.folderId, {
      requireFolder: true,
      allowRoot: true
    }, 400);
    const listing = await listGoogleDriveFolder(env, folderId, {
      pageToken: clean(body.pageToken),
      pageSize: 500
    });
    const breadcrumbs = await buildDriveBreadcrumbs(env, folder, root.folderId);
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
      rootFolderId: root.folderId,
      folder: { id: folder.id, name: folder.name || "Global Resources" },
      breadcrumbs,
      items,
      nextPageToken: clean(listing.nextPageToken),
      incompleteSearch: listing.incompleteSearch === true
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function createPlatformGlobalDriveAccessEndpoint(request, env) {
  const user = await getAuthUser(request, env);
  if (!user || user.type !== "account") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const resourceId = clean(body.resourceId || body.resourceid);
    const tables = await readManagementTables(env);
    const resource = uniqueRecord(tables.GlobalResources, "ResourceID", resourceId, "Global resource");
    if (!isActivePlatformValue(resource.Active)) {
      throw clientError("Global resource is inactive", 403);
    }
    const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", resource.SubjectID, "Global subject");
    if (!isActivePlatformValue(subject.Active)) {
      throw clientError("Global subject is inactive", 403);
    }
    if (clean(resource.ModuleID)) {
      const module = uniqueRecord(tables.GlobalModuleList, "ModuleID", resource.ModuleID, "Global module");
      if (!isActivePlatformValue(module.Active)) throw clientError("Global module is inactive", 403);
    }
    if (clean(resource.TaskID)) {
      const task = uniqueRecord(tables.GlobalTaskList, "TaskID", resource.TaskID, "Global task");
      if (!isActivePlatformValue(task.Active)) throw clientError("Global task is inactive", 403);
    }

    const publication = (await readAcademyLibraryPolicies(env)).get(`GLOBAL:${resource.ResourceID}`);
    const policy = resolveGlobalSubjectAccessPolicy(tables.GlobalSubjectAccessPolicy, resource.SubjectID);
    const decision = academyResourceDecision({
      key: `GLOBAL:${resource.ResourceID}`, source: 'GLOBAL', sourceActive: true,
      assigned: false, role: user.role, accountId: user.accountid, policy: publication,
      globalAccessModel: policy.accessModel, globalSubjectId: resource.SubjectID,
      globalMatrix: tables.GlobalSubjectAccessMatrix
    });
    if (!decision.open) {
      throw clientError('This Global resource is not available to your account', 403);
    }

    const fileId = extractDriveFileId(resource.ResourceLink);
    if (!fileId) throw clientError("Global resource is not linked to the protected Drive Library", 409);
    const root = readGlobalResourceDriveRoot(tables.PlatformConfig);
    if (!root.configured) throw clientError("Global Resources Drive folder is not configured", 409);
    const file = await requireGlobalDriveItem(env, fileId, root.folderId, { requireFile: true }, 409);
    const config = getResourceConfig(resource.ResourceType);
    const fileValidation = validateFileForResourceType(file, config);
    if (!fileValidation.ok) throw clientError(fileValidation.error, 409);

    const accessToken = await createDriveAccessToken({
      fileId: file.id,
      resourceType: `GLOBAL_${normalizePlatformIdentifier(resource.ResourceType)}`,
      resourceId: String(resource.ResourceID || "").trim(),
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
  } catch (error) {
    return mutationError(error, env);
  }
}

async function savePlatformGlobalSubjectEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const subjectId = clean(body.subjectId || body.subjectid);
    const subjectName = requireText(body.subjectName || body.subjectname, "Subject name", MAX_NAME_LENGTH);
    const requestedActive = readBoolean(body.active, subjectId ? null : true);
    const tables = await readManagementTables(env);
    const existing = subjectId
      ? uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject")
      : null;

    assertNoDuplicateName(
      tables.GlobalSubjectList,
      "SubjectName",
      subjectName,
      existing?.SubjectID,
      "Global subject"
    );

    const timestamp = new Date().toISOString();
    const record = existing
      ? {
          ...existing,
          SubjectName: subjectName,
          Active: requestedActive,
          ModifiedByAccountID: permission.user.accountid,
          ModifiedByAccountName: permission.user.username,
          ModifiedDate: timestamp
        }
      : {
          SubjectID: createPlatformId("GSUBJ"),
          SubjectName: subjectName,
          Active: requestedActive,
          CreatedDate: timestamp,
          CreatedByAccountID: permission.user.accountid,
          CreatedByAccountName: permission.user.username,
          ModifiedByAccountID: "",
          ModifiedByAccountName: "",
          ModifiedDate: ""
        };
    const changedFields = existing
      ? changedRecordFields(existing, record, ["SubjectName", "Active"])
      : ["SubjectName", "Active"];

    if (existing && changedFields.length === 0) {
      return json({ success: true, message: "No global subject changes requested", subject: mapSubject(existing) });
    }

    const defaultPolicy = existing ? null : {
      SubjectPolicyID: createPlatformId("GSPOL"),
      SubjectID: record.SubjectID,
      AccessModel: "SUBSCRIPTION",
      Active: true,
      CreatedDate: timestamp,
      CreatedByAccountID: permission.user.accountid,
      CreatedByAccountName: permission.user.username,
      ModifiedByAccountID: "",
      ModifiedByAccountName: "",
      ModifiedDate: ""
    };
    const dependencies = subjectDependencies(tables, record.SubjectID);
    await writeCurriculumMutation(env, permission.user, tables, {
      sheetName: "GlobalSubjectList",
      rowNumber: existing?._rowNumber || nextRowNumber(tables.GlobalSubjectList),
      record,
      action: existing ? "UPDATE_GLOBAL_SUBJECT" : "CREATE_GLOBAL_SUBJECT",
      recordType: "GLOBAL_SUBJECT",
      recordId: record.SubjectID,
      changedFields,
      timestamp,
      additionalWrites: defaultPolicy ? [
        valueWrite(
          "GlobalSubjectAccessPolicy",
          nextRowNumber(tables.GlobalSubjectAccessPolicy),
          recordToRow(defaultPolicy, PLATFORM_SHEET_HEADERS.GlobalSubjectAccessPolicy)
        ),
        ...matrixSubjectColumnWrites(tables.GlobalSubjectAccessMatrix, record.SubjectID)
      ] : [],
      additionalAudits: defaultPolicy ? [{
        action: "CREATE_GLOBAL_SUBJECT_ACCESS_POLICY",
        recordType: "GLOBAL_SUBJECT_ACCESS_POLICY",
        recordId: defaultPolicy.SubjectPolicyID,
        changedFields: ["SubjectID", "AccessModel", "Active"],
        timestamp
      }] : []
    });

    return json({
      success: true,
      message: existing ? "Global subject updated" : "Global subject created",
      subject: mapSubject(record),
      dependencies: requestedActive ? undefined : dependencies
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function savePlatformGlobalSubjectsBatchEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const subjectChanges = Array.isArray(body.subjects) ? body.subjects : [];
    const moduleChanges = Array.isArray(body.modules) ? body.modules : [];
    if (subjectChanges.length > 250 || moduleChanges.length > 1500) {
      throw clientError("Too many Global Subject or Module changes in one save", 400);
    }

    const tables = await readManagementTables(env);
    const version = readGlobalCurriculumVersion(tables.PlatformConfig);
    const requestedVersion = Number(body.globalCurriculumVersion);
    if (Number.isFinite(requestedVersion) && requestedVersion !== version.value) {
      throw clientError("Global Curriculum changed since this screen was loaded. Reload before saving.", 409);
    }
    if (!subjectChanges.length && !moduleChanges.length) {
      return json({
        success: true,
        message: "No Global Subject or Module changes requested",
        globalCurriculumVersion: version.value,
        subjects: [],
        modules: []
      });
    }

    const timestamp = new Date().toISOString();
    const workingSubjects = tables.GlobalSubjectList.map(record => ({ ...record }));
    const workingModules = tables.GlobalModuleList.map(record => ({ ...record }));
    const workingPolicies = tables.GlobalSubjectAccessPolicy.map(record => ({ ...record }));
    const subjectClientIds = new Map();
    const writes = [];
    const audits = [];
    const savedSubjects = [];
    const savedModules = [];
    let nextSubjectRow = nextRowNumber(tables.GlobalSubjectList);
    let nextModuleRow = nextRowNumber(tables.GlobalModuleList);
    let nextPolicyRow = nextRowNumber(tables.GlobalSubjectAccessPolicy);
    let nextMatrixColumnNumber = globalSubjectAccessMatrixColumns(tables.GlobalSubjectAccessMatrix).length + 2;

    for (let index = 0; index < subjectChanges.length; index += 1) {
      const change = subjectChanges[index] || {};
      const subjectId = clean(change.subjectId || change.subjectid);
      const clientKey = clean(change.clientKey || change.clientkey || subjectId || `subject-${index + 1}`);
      const subjectName = requireText(change.subjectName || change.subjectname, "Subject name", MAX_NAME_LENGTH);
      const requestedActive = readBoolean(change.active, subjectId ? null : true);
      const accessModel = normalizePlatformIdentifier(change.accessModel || change.accessmodel || "SUBSCRIPTION");
      if (!GLOBAL_SUBJECT_ACCESS_MODELS.has(accessModel)) {
        throw clientError("Global Subject access must be FREE or SUBSCRIPTION", 400);
      }

      const existing = subjectId
        ? uniqueRecord(workingSubjects, "SubjectID", subjectId, "Global subject")
        : null;
      assertNoDuplicateName(
        workingSubjects,
        "SubjectName",
        subjectName,
        existing?.SubjectID,
        "Global subject"
      );

      const record = existing ? {
        ...existing,
        SubjectName: subjectName,
        Active: requestedActive,
        ModifiedByAccountID: permission.user.accountid,
        ModifiedByAccountName: permission.user.username,
        ModifiedDate: timestamp
      } : {
        SubjectID: createPlatformId("GSUBJ"),
        SubjectName: subjectName,
        Active: requestedActive,
        CreatedDate: timestamp,
        CreatedByAccountID: permission.user.accountid,
        CreatedByAccountName: permission.user.username,
        ModifiedByAccountID: "",
        ModifiedByAccountName: "",
        ModifiedDate: ""
      };
      const changedFields = existing
        ? changedRecordFields(existing, record, ["SubjectName", "Active"])
        : ["SubjectName", "Active"];
      const subjectRowNumber = existing?._rowNumber || nextSubjectRow++;
      record._rowNumber = subjectRowNumber;

      if (changedFields.length) {
        writes.push(valueWrite(
          "GlobalSubjectList",
          subjectRowNumber,
          recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalSubjectList)
        ));
        audits.push({
          action: existing ? "UPDATE_GLOBAL_SUBJECT" : "CREATE_GLOBAL_SUBJECT",
          recordType: "GLOBAL_SUBJECT",
          recordId: record.SubjectID,
          changedFields,
          timestamp
        });
      }

      if (existing) {
        const workingIndex = workingSubjects.findIndex(item => (
          normalizePlatformIdentifier(item.SubjectID) === normalizePlatformIdentifier(existing.SubjectID)
        ));
        workingSubjects[workingIndex] = record;
      } else {
        workingSubjects.push(record);
        const matrixColumn = columnName(nextMatrixColumnNumber++);
        writes.push({
          range: `'GlobalSubjectAccessMatrix'!${matrixColumn}1`,
          majorDimension: "ROWS",
          values: [[record.SubjectID]]
        });
        for (const matrixRow of tables.GlobalSubjectAccessMatrix || []) {
          writes.push({
            range: `'GlobalSubjectAccessMatrix'!${matrixColumn}${matrixRow._rowNumber}`,
            majorDimension: "ROWS",
            values: [[false]]
          });
        }
      }

      subjectClientIds.set(clientKey, record.SubjectID);
      subjectClientIds.set(record.SubjectID, record.SubjectID);

      const subjectKey = normalizePlatformIdentifier(record.SubjectID);
      const activePolicies = workingPolicies.filter(policy => (
        normalizePlatformIdentifier(policy.SubjectID) === subjectKey && isActivePlatformValue(policy.Active)
      ));
      if (activePolicies.length > 1) {
        throw clientError("Global subject has duplicate active access policies; run Platform validation", 409);
      }
      const existingPolicy = activePolicies[0] || null;
      const currentAccess = existingPolicy
        ? normalizePlatformIdentifier(existingPolicy.AccessModel) || "SUBSCRIPTION"
        : "SUBSCRIPTION";
      if (!existingPolicy || currentAccess !== accessModel) {
        const policyRecord = existingPolicy ? {
          ...existingPolicy,
          AccessModel: accessModel,
          Active: true,
          ModifiedByAccountID: permission.user.accountid,
          ModifiedByAccountName: permission.user.username,
          ModifiedDate: timestamp
        } : {
          SubjectPolicyID: createPlatformId("GSPOL"),
          SubjectID: record.SubjectID,
          AccessModel: accessModel,
          Active: true,
          CreatedDate: timestamp,
          CreatedByAccountID: permission.user.accountid,
          CreatedByAccountName: permission.user.username,
          ModifiedByAccountID: "",
          ModifiedByAccountName: "",
          ModifiedDate: ""
        };
        const policyRowNumber = existingPolicy?._rowNumber || nextPolicyRow++;
        policyRecord._rowNumber = policyRowNumber;
        writes.push(valueWrite(
          "GlobalSubjectAccessPolicy",
          policyRowNumber,
          recordToRow(policyRecord, PLATFORM_SHEET_HEADERS.GlobalSubjectAccessPolicy)
        ));
        audits.push({
          action: existingPolicy ? "UPDATE_GLOBAL_SUBJECT_ACCESS_POLICY" : "CREATE_GLOBAL_SUBJECT_ACCESS_POLICY",
          recordType: "GLOBAL_SUBJECT_ACCESS_POLICY",
          recordId: policyRecord.SubjectPolicyID,
          changedFields: existingPolicy ? ["AccessModel"] : ["SubjectID", "AccessModel", "Active"],
          timestamp
        });
        if (existingPolicy) {
          const policyIndex = workingPolicies.findIndex(item => (
            normalizePlatformIdentifier(item.SubjectPolicyID) === normalizePlatformIdentifier(existingPolicy.SubjectPolicyID)
          ));
          workingPolicies[policyIndex] = policyRecord;
        } else {
          workingPolicies.push(policyRecord);
        }
      }

      savedSubjects.push({
        clientkey: clientKey,
        ...mapSubject(record),
        accessmodel: accessModel
      });
    }

    for (let index = 0; index < moduleChanges.length; index += 1) {
      const change = moduleChanges[index] || {};
      const moduleId = clean(change.moduleId || change.moduleid);
      const clientKey = clean(change.clientKey || change.clientkey || moduleId || `module-${index + 1}`);
      const subjectClientKey = clean(change.subjectClientKey || change.subjectclientkey);
      const requestedSubjectId = clean(change.subjectId || change.subjectid);
      const subjectId = requestedSubjectId || subjectClientIds.get(subjectClientKey) || subjectClientKey;
      const moduleName = requireText(change.moduleName || change.modulename, "Module name", MAX_NAME_LENGTH);
      const requestedActive = readBoolean(change.active, moduleId ? null : true);
      const sortOrder = readPositiveInteger(change.sortOrder ?? change.sortorder, "Sort order");
      const subject = uniqueRecord(workingSubjects, "SubjectID", subjectId, "Global subject");
      if (requestedActive && !isActivePlatformValue(subject.Active)) {
        throw clientError("An active module requires an active global subject", 409);
      }

      const existing = moduleId
        ? uniqueRecord(workingModules, "ModuleID", moduleId, "Global module")
        : null;
      if (existing && normalizePlatformIdentifier(existing.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
        throw clientError("Move Global Modules between subjects is not supported from the inline Subject editor", 409);
      }
      assertNoDuplicateChildName(
        workingModules,
        "SubjectID",
        subjectId,
        "ModuleName",
        moduleName,
        existing?.ModuleID,
        "Global module"
      );

      const record = existing ? {
        ...existing,
        SubjectID: subjectId,
        ModuleName: moduleName,
        SortOrder: sortOrder,
        Active: requestedActive,
        ModifiedByAccountID: permission.user.accountid,
        ModifiedByAccountName: permission.user.username,
        ModifiedDate: timestamp
      } : {
        ModuleID: createPlatformId("GMOD"),
        SubjectID: subjectId,
        ModuleName: moduleName,
        SortOrder: sortOrder,
        Active: requestedActive,
        CreatedDate: timestamp,
        CreatedByAccountID: permission.user.accountid,
        CreatedByAccountName: permission.user.username,
        ModifiedByAccountID: "",
        ModifiedByAccountName: "",
        ModifiedDate: ""
      };
      const changedFields = existing
        ? changedRecordFields(existing, record, ["ModuleName", "SortOrder", "Active"])
        : ["SubjectID", "ModuleName", "SortOrder", "Active"];
      const moduleRowNumber = existing?._rowNumber || nextModuleRow++;
      record._rowNumber = moduleRowNumber;
      if (changedFields.length) {
        writes.push(valueWrite(
          "GlobalModuleList",
          moduleRowNumber,
          recordToRow(record, PLATFORM_SHEET_HEADERS.GlobalModuleList)
        ));
        audits.push({
          action: existing ? "UPDATE_GLOBAL_MODULE" : "CREATE_GLOBAL_MODULE",
          recordType: "GLOBAL_MODULE",
          recordId: record.ModuleID,
          changedFields,
          timestamp
        });
      }

      if (existing) {
        const workingIndex = workingModules.findIndex(item => (
          normalizePlatformIdentifier(item.ModuleID) === normalizePlatformIdentifier(existing.ModuleID)
        ));
        workingModules[workingIndex] = record;
      } else {
        workingModules.push(record);
      }
      savedModules.push({ clientkey: clientKey, ...mapModule(record) });
    }

    if (!writes.length) {
      return json({
        success: true,
        message: "No Global Subject or Module changes requested",
        globalCurriculumVersion: version.value,
        subjects: savedSubjects,
        modules: savedModules
      });
    }

    const nextVersion = version.value + 1;
    const auditStartRow = nextRowNumber(tables.PlatformAuditLog);
    writes.push({
      range: `'PlatformConfig'!B${version.rowNumber}:E${version.rowNumber}`,
      majorDimension: "ROWS",
      values: [[nextVersion, timestamp, permission.user.accountid, permission.user.username]]
    });
    audits.forEach((audit, index) => {
      writes.push(valueWrite("PlatformAuditLog", auditStartRow + index, buildAuditRow(permission.user, audit)));
    });

    await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
    return json({
      success: true,
      message: `Saved ${audits.length} Global Subject/Module change${audits.length === 1 ? "" : "s"}`,
      globalCurriculumVersion: nextVersion,
      subjects: savedSubjects,
      modules: savedModules
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function savePlatformGlobalModuleEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const moduleId = clean(body.moduleId || body.moduleid);
    const subjectId = clean(body.subjectId || body.subjectid);
    const moduleName = requireText(body.moduleName || body.modulename, "Module name", MAX_NAME_LENGTH);
    const requestedActive = readBoolean(body.active, moduleId ? null : true);
    const sortOrder = readPositiveInteger(body.sortOrder ?? body.sortorder, "Sort order");
    const tables = await readManagementTables(env);
    const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
    if (requestedActive && !isActivePlatformValue(subject.Active)) {
      throw clientError("An active module requires an active global subject", 409);
    }
    const existing = moduleId
      ? uniqueRecord(tables.GlobalModuleList, "ModuleID", moduleId, "Global module")
      : null;
    if (existing && normalizePlatformIdentifier(existing.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
      const dependencies = moduleDependencies(tables, existing.ModuleID);
      if (dependencies.tasks > 0 || dependencies.resources > 0) {
        throw clientError("Move the module's dependent tasks and resources before changing its subject", 409);
      }
    }
    assertNoDuplicateChildName(
      tables.GlobalModuleList,
      "SubjectID",
      subjectId,
      "ModuleName",
      moduleName,
      existing?.ModuleID,
      "Global module"
    );

    const timestamp = new Date().toISOString();
    const record = existing
      ? {
          ...existing,
          SubjectID: subjectId,
          ModuleName: moduleName,
          SortOrder: sortOrder,
          Active: requestedActive,
          ModifiedByAccountID: permission.user.accountid,
          ModifiedByAccountName: permission.user.username,
          ModifiedDate: timestamp
        }
      : {
          ModuleID: createPlatformId("GMOD"),
          SubjectID: subjectId,
          ModuleName: moduleName,
          SortOrder: sortOrder,
          Active: requestedActive,
          CreatedDate: timestamp,
          CreatedByAccountID: permission.user.accountid,
          CreatedByAccountName: permission.user.username,
          ModifiedByAccountID: "",
          ModifiedByAccountName: "",
          ModifiedDate: ""
        };
    const changedFields = existing
      ? changedRecordFields(existing, record, ["SubjectID", "ModuleName", "SortOrder", "Active"])
      : ["SubjectID", "ModuleName", "SortOrder", "Active"];
    if (existing && changedFields.length === 0) {
      return json({ success: true, message: "No global module changes requested", module: mapModule(existing) });
    }
    const dependencies = moduleDependencies(tables, record.ModuleID);

    await writeCurriculumMutation(env, permission.user, tables, {
      sheetName: "GlobalModuleList",
      rowNumber: existing?._rowNumber || nextRowNumber(tables.GlobalModuleList),
      record,
      action: existing ? "UPDATE_GLOBAL_MODULE" : "CREATE_GLOBAL_MODULE",
      recordType: "GLOBAL_MODULE",
      recordId: record.ModuleID,
      changedFields,
      timestamp
    });

    return json({
      success: true,
      message: existing ? "Global module updated" : "Global module created",
      module: mapModule(record),
      dependencies: requestedActive ? undefined : dependencies
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function savePlatformGlobalTaskEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const taskId = clean(body.taskId || body.taskid);
    const subjectId = clean(body.subjectId || body.subjectid);
    const moduleId = clean(body.moduleId || body.moduleid);
    const taskName = requireText(body.taskName || body.taskname, "Task name", MAX_NAME_LENGTH);
    const requestedActive = readBoolean(body.active, taskId ? null : true);
    const tables = await readManagementTables(env);
    const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
    if (requestedActive && !isActivePlatformValue(subject.Active)) {
      throw clientError("An active task requires an active global subject", 409);
    }
    let module = null;
    if (moduleId) {
      module = uniqueRecord(tables.GlobalModuleList, "ModuleID", moduleId, "Global module");
      if (normalizePlatformIdentifier(module.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
        throw clientError("The selected global module does not belong to the selected subject", 409);
      }
      if (requestedActive && !isActivePlatformValue(module.Active)) {
        throw clientError("An active task requires an active global module", 409);
      }
    }
    const existing = taskId
      ? uniqueRecord(tables.GlobalTaskList, "TaskID", taskId, "Global task")
      : null;
    if (existing && (
      normalizePlatformIdentifier(existing.SubjectID) !== normalizePlatformIdentifier(subjectId) ||
      normalizePlatformIdentifier(existing.ModuleID) !== normalizePlatformIdentifier(moduleId)
    )) {
      const dependencies = taskDependencies(tables, existing.TaskID);
      if (dependencies.resources > 0) {
        throw clientError("Move the task's dependent resources before changing its curriculum branch", 409);
      }
    }
    assertNoDuplicateTask(tables.GlobalTaskList, subjectId, moduleId, taskName, existing?.TaskID);

    const timestamp = new Date().toISOString();
    const record = existing
      ? {
          ...existing,
          SubjectID: subjectId,
          ModuleID: moduleId,
          TaskName: taskName,
          Active: requestedActive,
          ModifiedByAccountID: permission.user.accountid,
          ModifiedByAccountName: permission.user.username,
          ModifiedDate: timestamp
        }
      : {
          TaskID: createPlatformId("GTASK"),
          SubjectID: subjectId,
          ModuleID: moduleId,
          TaskName: taskName,
          Active: requestedActive,
          CreatedDate: timestamp,
          CreatedByAccountID: permission.user.accountid,
          CreatedByAccountName: permission.user.username,
          ModifiedByAccountID: "",
          ModifiedByAccountName: "",
          ModifiedDate: ""
        };
    const changedFields = existing
      ? changedRecordFields(existing, record, ["SubjectID", "ModuleID", "TaskName", "Active"])
      : ["SubjectID", "ModuleID", "TaskName", "Active"];
    if (existing && changedFields.length === 0) {
      return json({ success: true, message: "No global task changes requested", task: mapTask(existing) });
    }
    const dependencies = taskDependencies(tables, record.TaskID);

    await writeCurriculumMutation(env, permission.user, tables, {
      sheetName: "GlobalTaskList",
      rowNumber: existing?._rowNumber || nextRowNumber(tables.GlobalTaskList),
      record,
      action: existing ? "UPDATE_GLOBAL_TASK" : "CREATE_GLOBAL_TASK",
      recordType: "GLOBAL_TASK",
      recordId: record.TaskID,
      changedFields,
      timestamp
    });

    return json({
      success: true,
      message: existing ? "Global task updated" : "Global task created",
      task: mapTask(record),
      dependencies: requestedActive ? undefined : dependencies
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function savePlatformGlobalResourceEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const resourceId = clean(body.resourceId || body.resourceid);
    const subjectId = clean(body.subjectId || body.subjectid);
    const moduleId = clean(body.moduleId || body.moduleid);
    const taskId = clean(body.taskId || body.taskid);
    const fileId = clean(body.fileId || body.fileid);
    const resourceName = requireText(body.resourceName || body.resourcename, "Resource name", MAX_NAME_LENGTH);
    const resourceType = normalizePlatformIdentifier(body.resourceType || body.resourcetype);
    const resourceDescription = optionalText(
      body.resourceDescription || body.resourcedescription,
      "Resource description",
      MAX_DESCRIPTION_LENGTH
    );
    const requestedActive = readBoolean(body.active, resourceId ? null : true);
    if (!GLOBAL_RESOURCE_TYPES.has(resourceType)) {
      throw clientError("Resource type must be EBOOK, PRINTABLE, AUDIO, VIDEO, or OTHER", 400);
    }

    const tables = await readManagementTables(env);
    const existing = resourceId
      ? uniqueRecord(tables.GlobalResources, "ResourceID", resourceId, "Global resource")
      : null;
    if (!existing && !fileId) {
      throw clientError("Select a file from the Global Resources Google Drive folder", 400);
    }
    if (
      existing &&
      normalizePlatformIdentifier(existing.ResourceType) !== resourceType &&
      !fileId
    ) {
      throw clientError("Select the Google Drive file again when changing resource type", 400);
    }

    const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
    if (requestedActive && !isActivePlatformValue(subject.Active)) {
      throw clientError("An active resource requires an active global subject", 409);
    }
    let module = null;
    if (moduleId) {
      module = uniqueRecord(tables.GlobalModuleList, "ModuleID", moduleId, "Global module");
      if (normalizePlatformIdentifier(module.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
        throw clientError("The selected global module does not belong to the selected subject", 409);
      }
      if (requestedActive && !isActivePlatformValue(module.Active)) {
        throw clientError("An active resource requires an active global module", 409);
      }
    }
    if (taskId) {
      const task = uniqueRecord(tables.GlobalTaskList, "TaskID", taskId, "Global task");
      if (normalizePlatformIdentifier(task.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
        throw clientError("The selected global task does not belong to the selected subject", 409);
      }
      if (moduleId && normalizePlatformIdentifier(task.ModuleID) !== normalizePlatformIdentifier(moduleId)) {
        throw clientError("The selected global task does not belong to the selected module", 409);
      }
      if (requestedActive && !isActivePlatformValue(task.Active)) {
        throw clientError("An active resource requires an active global task", 409);
      }
    }
    assertNoDuplicateResource(tables.GlobalResources, subjectId, moduleId, taskId, resourceName, existing?.ResourceID);

    let resourceFormat = clean(existing?.ResourceFormat);
    let resourceLink = clean(existing?.ResourceLink);
    if (fileId) {
      const root = readGlobalResourceDriveRoot(tables.PlatformConfig);
      if (!root.configured) {
        throw clientError("Configure the Global Resources Google Drive folder first", 409);
      }
      const file = await requireGlobalDriveItem(env, fileId, root.folderId, { requireFile: true }, 400);
      const resourceConfig = getResourceConfig(resourceType);
      const fileValidation = validateFileForResourceType(file, resourceConfig);
      if (!fileValidation.ok) throw clientError(fileValidation.error, 400);
      assertNoDuplicateDriveResource(tables.GlobalResources, file.id, existing?.ResourceID);
      resourceFormat = deriveFileFormat(file.name, file.mimeType);
      resourceLink = buildGlobalDriveResourceLink(request, file.id);
    }
    if (!resourceLink) {
      throw clientError("Select a file from the Global Resources Google Drive folder", 400);
    }

    const timestamp = new Date().toISOString();
    const record = existing
      ? {
          ...existing,
          SubjectID: subjectId,
          ModuleID: moduleId,
          TaskID: taskId,
          ResourceName: resourceName,
          ResourceType: resourceType,
          ResourceFormat: resourceFormat,
          ResourceDescription: resourceDescription,
          ResourceLink: resourceLink,
          Active: requestedActive,
          ModifiedByAccountID: permission.user.accountid,
          ModifiedByAccountName: permission.user.username,
          ModifiedDate: timestamp
        }
      : {
          ResourceID: createPlatformId("GRES"),
          SubjectID: subjectId,
          ModuleID: moduleId,
          TaskID: taskId,
          ResourceName: resourceName,
          ResourceType: resourceType,
          ResourceFormat: resourceFormat,
          ResourceDescription: resourceDescription,
          ResourceLink: resourceLink,
          Active: requestedActive,
          CreatedDate: timestamp,
          CreatedByAccountID: permission.user.accountid,
          CreatedByAccountName: permission.user.username,
          ModifiedByAccountID: "",
          ModifiedByAccountName: "",
          ModifiedDate: ""
        };
    const mutableFields = [
      "SubjectID", "ModuleID", "TaskID", "ResourceName", "ResourceType",
      "ResourceFormat", "ResourceDescription", "ResourceLink", "Active"
    ];
    const changedFields = existing
      ? changedRecordFields(existing, record, mutableFields)
      : mutableFields;
    if (existing && changedFields.length === 0) {
      return json({ success: true, message: "No global resource changes requested", resource: mapResource(existing) });
    }

    await writeCurriculumMutation(env, permission.user, tables, {
      sheetName: "GlobalResources",
      rowNumber: existing?._rowNumber || nextRowNumber(tables.GlobalResources),
      record,
      action: existing ? "UPDATE_GLOBAL_RESOURCE" : "CREATE_GLOBAL_RESOURCE",
      recordType: "GLOBAL_RESOURCE",
      recordId: record.ResourceID,
      changedFields,
      timestamp
    });

    return json({
      success: true,
      message: existing ? "Global resource updated" : "Global resource created",
      resource: mapResource(record)
    });
  } catch (error) {
    return mutationError(error, env);
  }
}


async function savePlatformGlobalResourcesBatchEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const resourceChanges = Array.isArray(body.resources) ? body.resources : [];
    if (resourceChanges.length > 500) {
      throw clientError("Too many Global Resource changes in one save", 400);
    }

    const tables = await readManagementTables(env);
    const version = readGlobalCurriculumVersion(tables.PlatformConfig);
    const requestedVersion = Number(body.globalCurriculumVersion);
    if (Number.isFinite(requestedVersion) && requestedVersion !== version.value) {
      throw clientError("Global Curriculum changed since this screen was loaded. Reload before saving.", 409);
    }
    if (!resourceChanges.length) {
      return json({
        success: true,
        message: "No Global Resource changes requested",
        globalCurriculumVersion: version.value,
        resources: []
      });
    }

    const timestamp = new Date().toISOString();
    const root = readGlobalResourceDriveRoot(tables.PlatformConfig);
    const workingResources = tables.GlobalResources.map(record => ({ ...record }));
    const proposed = [];
    const seenClientKeys = new Set();
    let nextResourceRow = nextRowNumber(tables.GlobalResources);

    for (let index = 0; index < resourceChanges.length; index += 1) {
      const change = resourceChanges[index] || {};
      const resourceId = clean(change.resourceId || change.resourceid);
      const clientKey = clean(change.clientKey || change.clientkey || resourceId || `resource-${index + 1}`);
      if (seenClientKeys.has(clientKey)) throw clientError("Duplicate Resource change in this save", 400);
      seenClientKeys.add(clientKey);

      const subjectId = clean(change.subjectId || change.subjectid);
      const moduleId = clean(change.moduleId || change.moduleid);
      const taskId = clean(change.taskId || change.taskid);
      const fileId = clean(change.fileId || change.fileid);
      const resourceName = requireText(change.resourceName || change.resourcename, "Resource name", MAX_NAME_LENGTH);
      const resourceType = normalizePlatformIdentifier(change.resourceType || change.resourcetype);
      const resourceDescription = optionalText(
        change.resourceDescription || change.resourcedescription,
        "Resource description",
        MAX_DESCRIPTION_LENGTH
      );
      const requestedActive = readBoolean(change.active, resourceId ? null : true);
      if (!GLOBAL_RESOURCE_TYPES.has(resourceType)) {
        throw clientError("Resource type must be EBOOK, PRINTABLE, AUDIO, VIDEO, or OTHER", 400);
      }

      const existing = resourceId
        ? uniqueRecord(workingResources, "ResourceID", resourceId, "Global resource")
        : null;
      if (!existing && !fileId) {
        throw clientError("Select a file from the Global Resources Google Drive folder", 400);
      }
      if (existing && normalizePlatformIdentifier(existing.ResourceType) !== resourceType && !fileId) {
        throw clientError("Select the Google Drive file again when changing resource type", 400);
      }

      const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
      if (requestedActive && !isActivePlatformValue(subject.Active)) {
        throw clientError("An active resource requires an active global subject", 409);
      }
      if (moduleId) {
        const module = uniqueRecord(tables.GlobalModuleList, "ModuleID", moduleId, "Global module");
        if (normalizePlatformIdentifier(module.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
          throw clientError("The selected global module does not belong to the selected subject", 409);
        }
        if (requestedActive && !isActivePlatformValue(module.Active)) {
          throw clientError("An active resource requires an active global module", 409);
        }
      }
      if (taskId) {
        const task = uniqueRecord(tables.GlobalTaskList, "TaskID", taskId, "Global task");
        if (normalizePlatformIdentifier(task.SubjectID) !== normalizePlatformIdentifier(subjectId)) {
          throw clientError("The selected global task does not belong to the selected subject", 409);
        }
        if (moduleId && normalizePlatformIdentifier(task.ModuleID) !== normalizePlatformIdentifier(moduleId)) {
          throw clientError("The selected global task does not belong to the selected module", 409);
        }
        if (requestedActive && !isActivePlatformValue(task.Active)) {
          throw clientError("An active resource requires an active global task", 409);
        }
      }

      let resourceFormat = clean(existing?.ResourceFormat);
      let resourceLink = clean(existing?.ResourceLink);
      if (fileId) {
        if (!root.configured) throw clientError("Configure the Global Resources Google Drive folder first", 409);
        const file = await requireGlobalDriveItem(env, fileId, root.folderId, { requireFile: true }, 400);
        const fileValidation = validateFileForResourceType(file, getResourceConfig(resourceType));
        if (!fileValidation.ok) throw clientError(fileValidation.error, 400);
        resourceFormat = deriveFileFormat(file.name, file.mimeType);
        resourceLink = buildGlobalDriveResourceLink(request, file.id);
      }
      if (!resourceLink) throw clientError("Select a file from the Global Resources Google Drive folder", 400);

      const record = existing ? {
        ...existing,
        SubjectID: subjectId,
        ModuleID: moduleId,
        TaskID: taskId,
        ResourceName: resourceName,
        ResourceType: resourceType,
        ResourceFormat: resourceFormat,
        ResourceDescription: resourceDescription,
        ResourceLink: resourceLink,
        Active: requestedActive,
        ModifiedByAccountID: permission.user.accountid,
        ModifiedByAccountName: permission.user.username,
        ModifiedDate: timestamp
      } : {
        ResourceID: createPlatformId("GRES"),
        SubjectID: subjectId,
        ModuleID: moduleId,
        TaskID: taskId,
        ResourceName: resourceName,
        ResourceType: resourceType,
        ResourceFormat: resourceFormat,
        ResourceDescription: resourceDescription,
        ResourceLink: resourceLink,
        Active: requestedActive,
        CreatedDate: timestamp,
        CreatedByAccountID: permission.user.accountid,
        CreatedByAccountName: permission.user.username,
        ModifiedByAccountID: "",
        ModifiedByAccountName: "",
        ModifiedDate: ""
      };
      record._rowNumber = existing?._rowNumber || nextResourceRow++;

      const mutableFields = [
        "SubjectID", "ModuleID", "TaskID", "ResourceName", "ResourceType",
        "ResourceFormat", "ResourceDescription", "ResourceLink", "Active"
      ];
      const changedFields = existing
        ? changedRecordFields(existing, record, mutableFields)
        : mutableFields;

      const workingIndex = existing ? workingResources.findIndex(item => (
        normalizePlatformIdentifier(item.ResourceID) === normalizePlatformIdentifier(existing.ResourceID)
      )) : -1;
      if (workingIndex >= 0) workingResources[workingIndex] = record;
      else workingResources.push(record);

      proposed.push({ clientKey, existing, record, changedFields });
    }

    assertUniqueResourceCollection(workingResources);

    const changed = proposed.filter(item => item.changedFields.length > 0);
    if (!changed.length) {
      return json({
        success: true,
        message: "No Global Resource changes requested",
        globalCurriculumVersion: version.value,
        resources: proposed.map(item => ({ clientkey: item.clientKey, ...mapResource(item.record) }))
      });
    }

    const nextVersion = version.value + 1;
    const writes = changed.map(item => valueWrite(
      "GlobalResources",
      item.record._rowNumber,
      recordToRow(item.record, PLATFORM_SHEET_HEADERS.GlobalResources)
    ));
    writes.push({
      range: `'PlatformConfig'!B${version.rowNumber}:E${version.rowNumber}`,
      majorDimension: "ROWS",
      values: [[nextVersion, timestamp, permission.user.accountid, permission.user.username]]
    });
    const auditStartRow = nextRowNumber(tables.PlatformAuditLog);
    changed.forEach((item, index) => {
      writes.push(valueWrite("PlatformAuditLog", auditStartRow + index, buildAuditRow(permission.user, {
        action: item.existing ? "UPDATE_GLOBAL_RESOURCE" : "CREATE_GLOBAL_RESOURCE",
        recordType: "GLOBAL_RESOURCE",
        recordId: item.record.ResourceID,
        changedFields: item.changedFields,
        timestamp
      })));
    });

    await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
    return json({
      success: true,
      message: `Saved ${changed.length} Global Resource change${changed.length === 1 ? "" : "s"}`,
      globalCurriculumVersion: nextVersion,
      resources: proposed.map(item => ({ clientkey: item.clientKey, ...mapResource(item.record) }))
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function savePlatformGlobalSubjectAccessEndpoint(request, env) {
  const permission = await requireGlobalCurriculumAdmin(request, env);
  if (!permission.ok) return permission.response;

  try {
    const body = await request.json();
    const accountId = clean(body.accountId || body.accountid);
    const subjectId = clean(body.subjectId || body.subjectid);
    const requestedActive = readBoolean(body.active, true);
    const tables = await readManagementTables(env);
    const account = uniqueRecord(tables.UserAccounts, "AccountID", accountId, "User account");
    const subject = uniqueRecord(tables.GlobalSubjectList, "SubjectID", subjectId, "Global subject");
    const policy = resolveGlobalSubjectAccessPolicy(tables.GlobalSubjectAccessPolicy, subject.SubjectID);

    if (policy.accessModel === "FREE") {
      throw clientError("FREE global subjects use implicit access and do not accept per-account subscription changes", 409);
    }
    if (requestedActive && !isActivePlatformValue(account.Active)) {
      throw clientError("Global-subject access cannot be activated for an inactive account", 409);
    }
    if (requestedActive && !isActivePlatformValue(subject.Active)) {
      throw clientError("Global-subject access cannot be activated for an inactive subject", 409);
    }

    const accountKey = normalizePlatformIdentifier(account.AccountID);
    const matches = tables.GlobalSubjectAccessMatrix.filter(record => (
      normalizePlatformIdentifier(record.AccountID) === accountKey
    ));
    if (matches.length !== 1) {
      throw clientError("GlobalSubjectAccessMatrix must contain exactly one row for this account", 409);
    }
    const matrixRow = matches[0];
    const column = globalSubjectAccessMatrixColumn(tables.GlobalSubjectAccessMatrix, subject.SubjectID);
    if (!column) {
      throw clientError("GlobalSubjectAccessMatrix is missing this subject column", 409);
    }
    const subjectKey = normalizePlatformIdentifier(subject.SubjectID);
    const currentActive = isActivePlatformValue(matrixRow?._subjectAccess?.[subjectKey]);
    if (currentActive === requestedActive) {
      return json({
        success: true,
        message: "Global-subject access is already in the requested state",
        access: { accountid: accountId, subjectid: subjectId, active: currentActive }
      });
    }

    const timestamp = new Date().toISOString();
    await writeMatrixAccessMutation(env, permission.user, tables, {
      rowNumber: matrixRow._rowNumber,
      column,
      accountId,
      subjectId,
      active: requestedActive,
      action: requestedActive ? "ACTIVATE_GLOBAL_SUBJECT_ACCESS" : "DEACTIVATE_GLOBAL_SUBJECT_ACCESS",
      timestamp
    });

    return json({
      success: true,
      message: requestedActive ? "Global-subject access activated" : "Global-subject access deactivated",
      access: { accountid: accountId, subjectid: subjectId, active: requestedActive }
    });
  } catch (error) {
    return mutationError(error, env);
  }
}

async function requireGlobalCurriculumAdmin(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  }
  const authority = normalizePlatformIdentifier(user.role);
  if (user.type !== "account" || !["ADMIN", "GLOBAL_ADMIN"].includes(authority)) {
    return { ok: false, response: json({ success: false, error: "ADMIN or GLOBAL_ADMIN authority is required" }, 403) };
  }
  return {
    ok: true,
    user: {
      accountid: String(user.accountid || "").trim(),
      username: String(user.username || "Global Admin").trim(),
      role: authority,
      courseid: String(user.courseid || "").trim()
    }
  };
}

async function requirePlatformGlobalAdmin(request, env) {
  const user = await getAuthUser(request, env);
  if (!user) {
    return { ok: false, response: json({ success: false, error: "Unauthorized" }, 401) };
  }
  const authority = normalizePlatformIdentifier(user.role);
  if (user.type !== "account" || authority !== "GLOBAL_ADMIN") {
    return { ok: false, response: json({ success: false, error: "GLOBAL_ADMIN authority is required" }, 403) };
  }
  return {
    ok: true,
    user: {
      accountid: clean(user.accountid),
      username: clean(user.username || "Global Admin"),
      role: authority,
      courseid: clean(user.courseid)
    }
  };
}

async function readManagementTables(env) {
  const names = [
    "UserAccounts",
    "UserGlobalSubjectAccess",
    "GlobalSubjectAccessMatrix",
    "GlobalSubjectAccessPolicy",
    "GlobalSubjectRuns",
    "GlobalSubjectList",
    "GlobalModuleList",
    "GlobalTaskList",
    "GlobalResources",
    "PlatformConfig",
    "PlatformAuditLog"
  ];
  const entries = await Promise.all(names.map(async name => [name, await readPlatformSheet(env, name)]));
  return Object.fromEntries(entries);
}

async function writeCurriculumMutation(env, user, tables, mutation) {
  const version = readGlobalCurriculumVersion(tables.PlatformConfig);
  const nextVersion = version.value + 1;
  const headers = PLATFORM_SHEET_HEADERS[mutation.sheetName];
  const auditStartRow = nextRowNumber(tables.PlatformAuditLog);
  const auditMutations = [mutation, ...(mutation.additionalAudits || [])];
  const writes = [
    valueWrite(mutation.sheetName, mutation.rowNumber, recordToRow(mutation.record, headers)),
    ...(mutation.additionalWrites || []),
    {
      range: `'PlatformConfig'!B${version.rowNumber}:E${version.rowNumber}`,
      majorDimension: "ROWS",
      values: [[nextVersion, mutation.timestamp, user.accountid, user.username]]
    },
    ...auditMutations.map((auditMutation, index) => (
      valueWrite("PlatformAuditLog", auditStartRow + index, buildAuditRow(user, auditMutation))
    ))
  ];
  await batchUpdateGoogleSheetValues(env, writes, { spreadsheetId: getPlatformSpreadsheetId(env) });
}

async function writeMatrixAccessMutation(env, user, tables, mutation) {
  const auditRow = buildAuditRow(user, {
    action: mutation.action,
    recordType: "GLOBAL_SUBJECT_ACCESS",
    recordId: `${mutation.accountId}:${mutation.subjectId}`,
    changedFields: [`${mutation.subjectId}:Active`],
    timestamp: mutation.timestamp
  });
  await batchUpdateGoogleSheetValues(env, [
    {
      range: `'GlobalSubjectAccessMatrix'!${mutation.column.columnName}${mutation.rowNumber}`,
      majorDimension: "ROWS",
      values: [[mutation.active]]
    },
    valueWrite("PlatformAuditLog", nextRowNumber(tables.PlatformAuditLog), auditRow)
  ], { spreadsheetId: getPlatformSpreadsheetId(env) });
}

function matrixSubjectColumnWrites(matrixRows, subjectId) {
  if (globalSubjectAccessMatrixColumn(matrixRows, subjectId)) {
    throw clientError("GlobalSubjectAccessMatrix already contains this subject column", 409);
  }
  const columnNumber = globalSubjectAccessMatrixColumns(matrixRows).length + 2;
  const column = columnName(columnNumber);
  return [
    {
      range: `'GlobalSubjectAccessMatrix'!${column}1`,
      majorDimension: "ROWS",
      values: [[subjectId]]
    },
    ...(matrixRows || []).map(row => ({
      range: `'GlobalSubjectAccessMatrix'!${column}${row._rowNumber}`,
      majorDimension: "ROWS",
      values: [[false]]
    }))
  ];
}

function buildAuditRow(user, mutation) {
  return [
    createPlatformId("AUDIT"),
    mutation.timestamp,
    user.accountid,
    user.username,
    user.role,
    user.role === "GLOBAL_ADMIN" ? "" : user.courseid,
    mutation.action,
    mutation.recordType,
    mutation.recordId,
    JSON.stringify(mutation.changedFields)
  ];
}

function valueWrite(sheetName, rowNumber, row) {
  return {
    range: `'${sheetName}'!A${rowNumber}:${columnName(row.length)}${rowNumber}`,
    majorDimension: "ROWS",
    values: [row]
  };
}

function recordToRow(record, headers) {
  return headers.map(header => record?.[header] ?? "");
}

function readGlobalCurriculumVersion(configRows) {
  const matches = configRows.filter(record => (
    normalizePlatformIdentifier(record.ConfigKey) === "GLOBALCURRICULUMVERSION"
  ));
  const value = Number(matches[0]?.ConfigValue);
  if (matches.length !== 1 || !Number.isInteger(value) || value < 1) {
    throw new Error("PlatformConfig GlobalCurriculumVersion must resolve exactly once as a positive integer");
  }
  return { value, rowNumber: matches[0]._rowNumber };
}

function readGlobalResourceDriveRoot(configRows) {
  const matches = configRows.filter(record => (
    normalizePlatformIdentifier(record.ConfigKey) === "GLOBALRESOURCEDRIVEROOTFOLDERID"
  ));
  if (matches.length > 1) {
    throw new Error("PlatformConfig GlobalResourceDriveRootFolderID must resolve at most once");
  }
  if (!matches.length) return { configured: false, folderId: "", rowNumber: 0 };

  const folderId = clean(matches[0].ConfigValue);
  if (folderId && !/^[A-Za-z0-9_-]{10,128}$/.test(folderId)) {
    throw new Error("PlatformConfig GlobalResourceDriveRootFolderID is invalid");
  }
  return {
    configured: Boolean(folderId),
    folderId,
    rowNumber: Number(matches[0]._rowNumber) || 0
  };
}

function mapGlobalResourceDriveRoot(root, user, folderName = "") {
  const configured = root?.configured === true;
  return {
    configured,
    folderid: configured ? clean(root.folderId) : "",
    folderurl: configured ? buildGoogleDriveFolderUrl(root.folderId) : "",
    foldername: clean(folderName),
    canconfigure: normalizePlatformIdentifier(user?.role) === "GLOBAL_ADMIN"
  };
}

function uniqueRecord(records, key, value, label) {
  const normalized = normalizePlatformIdentifier(value);
  if (!normalized) throw clientError(`${label} ID is required`, 400);
  const matches = records.filter(record => normalizePlatformIdentifier(record[key]) === normalized);
  if (matches.length === 0) throw clientError(`${label} was not found`, 404);
  if (matches.length > 1) throw clientError(`${label} is duplicated`, 409);
  return matches[0];
}

function assertNoDuplicateName(records, nameKey, name, excludedId, label) {
  const normalizedName = normalizeName(name);
  const normalizedExcluded = normalizePlatformIdentifier(excludedId);
  const duplicate = records.find(record => (
    normalizeName(record[nameKey]) === normalizedName &&
    normalizePlatformIdentifier(primaryId(record)) !== normalizedExcluded
  ));
  if (duplicate) throw clientError(`${label} name already exists`, 409);
}

function assertNoDuplicateChildName(records, parentKey, parentId, nameKey, name, excludedId, label) {
  const normalizedParent = normalizePlatformIdentifier(parentId);
  const normalizedName = normalizeName(name);
  const normalizedExcluded = normalizePlatformIdentifier(excludedId);
  const duplicate = records.find(record => (
    normalizePlatformIdentifier(record[parentKey]) === normalizedParent &&
    normalizeName(record[nameKey]) === normalizedName &&
    normalizePlatformIdentifier(primaryId(record)) !== normalizedExcluded
  ));
  if (duplicate) throw clientError(`${label} already exists in this subject`, 409);
}

function assertNoDuplicateTask(records, subjectId, moduleId, taskName, excludedId) {
  const duplicate = records.find(record => (
    normalizePlatformIdentifier(record.SubjectID) === normalizePlatformIdentifier(subjectId) &&
    normalizePlatformIdentifier(record.ModuleID) === normalizePlatformIdentifier(moduleId) &&
    normalizeName(record.TaskName) === normalizeName(taskName) &&
    normalizePlatformIdentifier(record.TaskID) !== normalizePlatformIdentifier(excludedId)
  ));
  if (duplicate) throw clientError("Global task already exists in this curriculum branch", 409);
}

function assertNoDuplicateResource(records, subjectId, moduleId, taskId, name, excludedId) {
  const duplicate = records.find(record => (
    normalizePlatformIdentifier(record.SubjectID) === normalizePlatformIdentifier(subjectId) &&
    normalizePlatformIdentifier(record.ModuleID) === normalizePlatformIdentifier(moduleId) &&
    normalizePlatformIdentifier(record.TaskID) === normalizePlatformIdentifier(taskId) &&
    normalizeName(record.ResourceName) === normalizeName(name) &&
    normalizePlatformIdentifier(record.ResourceID) !== normalizePlatformIdentifier(excludedId)
  ));
  if (duplicate) throw clientError("Global resource already exists in this curriculum branch", 409);
}

function assertNoDuplicateDriveResource(records, fileId, excludedId) {
  const normalizedFileId = clean(fileId);
  const normalizedExcluded = normalizePlatformIdentifier(excludedId);
  const duplicate = records.find(record => (
    extractDriveFileId(record.ResourceLink) === normalizedFileId &&
    normalizePlatformIdentifier(record.ResourceID) !== normalizedExcluded
  ));
  if (duplicate) {
    throw clientError(
      `This Google Drive file is already a global resource${clean(duplicate.ResourceName) ? ` as “${clean(duplicate.ResourceName)}”` : ""}`,
      409
    );
  }
}


function assertUniqueResourceCollection(records) {
  const branchNames = new Map();
  const driveFiles = new Map();
  for (const record of records || []) {
    const resourceId = clean(record.ResourceID);
    const branchKey = [
      normalizePlatformIdentifier(record.SubjectID),
      normalizePlatformIdentifier(record.ModuleID),
      normalizePlatformIdentifier(record.TaskID),
      normalizeName(record.ResourceName)
    ].join("|");
    if (branchNames.has(branchKey) && branchNames.get(branchKey) !== resourceId) {
      throw clientError("Global resource already exists in this curriculum branch", 409);
    }
    branchNames.set(branchKey, resourceId);

    const fileId = extractDriveFileId(record.ResourceLink);
    if (!fileId) continue;
    if (driveFiles.has(fileId) && driveFiles.get(fileId).id !== resourceId) {
      const duplicate = driveFiles.get(fileId);
      throw clientError(
        `This Google Drive file is already a global resource${duplicate.name ? ` as “${duplicate.name}”` : ""}`,
        409
      );
    }
    driveFiles.set(fileId, { id: resourceId, name: clean(record.ResourceName) });
  }
}

function primaryId(record) {
  return record.SubjectID || record.ModuleID || record.TaskID || record.ResourceID || record.SubjectAccessID || "";
}

function changedRecordFields(before, after, fields) {
  return fields.filter(field => normalizeComparable(before[field]) !== normalizeComparable(after[field]));
}

function normalizeComparable(value) {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  return String(value ?? "").trim();
}

function subjectDependencies(tables, subjectId) {
  const normalized = normalizePlatformIdentifier(subjectId);
  return {
    modules: tables.GlobalModuleList.filter(record => normalizePlatformIdentifier(record.SubjectID) === normalized).length,
    tasks: tables.GlobalTaskList.filter(record => normalizePlatformIdentifier(record.SubjectID) === normalized).length,
    resources: tables.GlobalResources.filter(record => normalizePlatformIdentifier(record.SubjectID) === normalized).length,
    subscriptions: countActiveGlobalSubjectSubscriptions(tables.GlobalSubjectAccessMatrix, normalized),
    policies: tables.GlobalSubjectAccessPolicy.filter(record => (
      normalizePlatformIdentifier(record.SubjectID) === normalized
    )).length,
    runs: tables.GlobalSubjectRuns.filter(record => (
      normalizePlatformIdentifier(record.SubjectID) === normalized
    )).length
  };
}

function moduleDependencies(tables, moduleId) {
  const normalized = normalizePlatformIdentifier(moduleId);
  return {
    tasks: tables.GlobalTaskList.filter(record => normalizePlatformIdentifier(record.ModuleID) === normalized).length,
    resources: tables.GlobalResources.filter(record => normalizePlatformIdentifier(record.ModuleID) === normalized).length
  };
}

function taskDependencies(tables, taskId) {
  const normalized = normalizePlatformIdentifier(taskId);
  return {
    resources: tables.GlobalResources.filter(record => normalizePlatformIdentifier(record.TaskID) === normalized).length
  };
}

function mapSubject(record) {
  return {
    subjectid: String(record.SubjectID || "").trim(),
    subjectname: String(record.SubjectName || "").trim(),
    active: isActivePlatformValue(record.Active),
    scope: "GLOBAL"
  };
}

function mapModule(record) {
  return {
    moduleid: String(record.ModuleID || "").trim(),
    subjectid: String(record.SubjectID || "").trim(),
    modulename: String(record.ModuleName || "").trim(),
    sortorder: Number(record.SortOrder) || 0,
    active: isActivePlatformValue(record.Active),
    scope: "GLOBAL"
  };
}

function mapTask(record) {
  return {
    taskid: String(record.TaskID || "").trim(),
    subjectid: String(record.SubjectID || "").trim(),
    moduleid: String(record.ModuleID || "").trim(),
    taskname: String(record.TaskName || "").trim(),
    active: isActivePlatformValue(record.Active),
    scope: "GLOBAL"
  };
}

function mapResource(record) {
  const resourceLink = String(record.ResourceLink || "").trim();
  return {
    resourceid: String(record.ResourceID || "").trim(),
    subjectid: String(record.SubjectID || "").trim(),
    moduleid: String(record.ModuleID || "").trim(),
    taskid: String(record.TaskID || "").trim(),
    resourcename: String(record.ResourceName || "").trim(),
    resourcetype: normalizePlatformIdentifier(record.ResourceType),
    resourceformat: String(record.ResourceFormat || "").trim(),
    resourcedescription: String(record.ResourceDescription || "").trim(),
    resourcelink: resourceLink,
    fileid: extractDriveFileId(resourceLink),
    active: isActivePlatformValue(record.Active),
    scope: "GLOBAL"
  };
}

function mapAccount(record) {
  return {
    accountid: String(record.AccountID || "").trim(),
    displayname: String(record.DisplayName || "").trim(),
    uniqueid: String(record.UniqueID || "").trim(),
    active: isActivePlatformValue(record.Active),
    platformrole: normalizePlatformIdentifier(record.PlatformRole)
  };
}

function requireText(value, label, maxLength) {
  const text = clean(value);
  if (!text) throw clientError(`${label} is required`, 400);
  if (text.length > maxLength) throw clientError(`${label} is too long`, 400);
  return text;
}

function optionalText(value, label, maxLength) {
  const text = clean(value);
  if (text.length > maxLength) throw clientError(`${label} is too long`, 400);
  return text;
}

function readBoolean(value, fallback) {
  if (value === undefined && fallback !== null) return fallback;
  if (typeof value !== "boolean") throw clientError("Active must be true or false", 400);
  return value;
}

function readPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100000) {
    throw clientError(`${label} must be a positive whole number`, 400);
  }
  return number;
}

function normalizeName(value) {
  return clean(value).replace(/\s+/g, " ").toLocaleLowerCase();
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeSize(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function buildGlobalDriveResourceLink(request, fileId) {
  return `${new URL(request.url).origin}/api/library/drive/file/${encodeURIComponent(fileId)}`;
}

async function requireGlobalDriveItem(env, itemId, rootFolderId, options, status) {
  try {
    return await requireItemInsideRoot(env, itemId, rootFolderId, {
      ...options,
      rootLabel: "Global Resources"
    });
  } catch (error) {
    const message = String(error?.message || "The selected Google Drive item is unavailable");
    if (message.startsWith("Google Drive API error")) throw error;
    throw clientError(message, status || 400);
  }
}

function createPlatformId(prefix) {
  const uuid = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallbackUuid();
  return `${prefix}-${uuid}`;
}

function fallbackUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nextRowNumber(records) {
  return Math.max(1, ...(records || []).map(record => Number(record._rowNumber) || 1)) + 1;
}

function columnName(columnNumber) {
  let value = columnNumber;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function clientError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.isClientError = true;
  return error;
}

function mutationError(error, env) {
  if (error?.isClientError) {
    return json({ success: false, error: String(error.message || "Invalid request") }, error.status || 400);
  }
  return managementError(error, env);
}

function managementError(error, env) {
  const response = {
    success: false,
    error: "Global curriculum management is not ready"
  };
  if (String(env.M4L_ACCOUNT_AUTH_DIAGNOSTICS || "").trim().toLowerCase() === "true") {
    response.detail = String(error?.message || "Global management error")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 220);
  }
  return json(response, 503);
}

  return { getPlatformGlobalManagementEndpoint, savePlatformGlobalDriveRootEndpoint, browsePlatformGlobalDriveFolderEndpoint, createPlatformGlobalDriveAccessEndpoint, savePlatformGlobalSubjectEndpoint, savePlatformGlobalSubjectsBatchEndpoint, savePlatformGlobalModuleEndpoint, savePlatformGlobalTaskEndpoint, savePlatformGlobalResourceEndpoint, savePlatformGlobalResourcesBatchEndpoint, savePlatformGlobalSubjectAccessEndpoint };
}

export const { getPlatformGlobalManagementEndpoint, savePlatformGlobalDriveRootEndpoint, browsePlatformGlobalDriveFolderEndpoint, createPlatformGlobalDriveAccessEndpoint, savePlatformGlobalSubjectEndpoint, savePlatformGlobalSubjectsBatchEndpoint, savePlatformGlobalModuleEndpoint, savePlatformGlobalTaskEndpoint, savePlatformGlobalResourceEndpoint, savePlatformGlobalResourcesBatchEndpoint, savePlatformGlobalSubjectAccessEndpoint } = createGlobalManagementEndpoints();
