/* M4L V102.10 - Account-authorised multi-course and policy-aware global Library catalogue. */

import { getAuthUser } from "../lib/auth.js";
import { readAcademyLibraryPolicies, academyResourceDecision, canonicalCourseResourceType } from '../lib/academy-library-policy.js';
import {
  createCourseEnvironment,
  resolveOperationalAccountUser
} from "../lib/course-routing.js";
import { json } from "../lib/http.js";
import {
  accessibleGlobalSubjectIds,
  resolveGlobalSubjectAccessPolicy,
  strongestGlobalSubjectDeliveryStatus
} from "../lib/global-subject-delivery.js";
import { readPlatformSheet } from "../lib/platform-sheet.js";
import {
  authorityRank,
  isActivePlatformValue,
  normalizePlatformIdentifier
} from "../lib/platform-schema.js";
import { setRequestAuthUser } from "../lib/request-context.js";
import { createDriveFileAccessEndpoint, extractDriveFileId } from "./drive-library.js";
import {
  readResourcesGoogleSheetsCatalogue,
  RESOURCE_TAB_DEFINITIONS
} from "./resources.js";

const COURSE_ROLES = new Set(["ADMIN", "SENIOR", "TEACHER", "STUDENT"]);
const GLOBAL_TYPE_TO_GROUP = Object.freeze({
  EBOOK: "ebooks",
  PRINTABLE: "printables",
  AUDIO: "audio",
  VIDEO: "video",
  OTHER: "other"
});

export async function getAccountLibraryCatalogueEndpoint(request, env) {
  const user = await getAuthUser(request, env);
  if (!user || user.type !== "account") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const [tables, policies] = await Promise.all([
      readLibraryPlatformTables(env), readAcademyLibraryPolicies(env)
    ]);
    const courses = resolveAuthorisedCourses(user, tables);
    const courseLibraries = await Promise.all(courses.map(course => (
      readCourseLibrary(env, user, course)
    )));
    const globalLibrary = buildGlobalLibrary(user, tables);
    const account = tables.UserAccounts.find(row =>
      normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(user.accountid));
    const learningAreaRefs = new Set(courses.map(course => `REBOOT:${course.courseId}`));
    for (const id of accessibleGlobalSubjectIds({ account, subjects: tables.GlobalSubjectList,
      policyRows: tables.GlobalSubjectAccessPolicy, accessRows: tables.GlobalSubjectAccessMatrix })) {
      learningAreaRefs.add(`GLOBAL:${id}`);
    }
    if (['GLOBAL_ADMIN', 'ADMIN'].includes(user.role)) {
      for (const subject of tables.GlobalSubjectList.filter(row => isActivePlatformValue(row.Active))) {
        learningAreaRefs.add(`GLOBAL:${normalizePlatformIdentifier(subject.SubjectID)}`);
      }
    }
    for (const library of courseLibraries) filterPublishedLibrary(library, policies, user, tables);
    filterPublishedLibrary(globalLibrary, policies, user, tables);
    const availableCourseLibraries = courseLibraries.filter(library => library.available);
    const libraries = [
      ...courseLibraries,
      ...(globalLibrary.subjectCount > 0 ? [globalLibrary] : [])
    ];
    const sources = [
      {
        id: "ALL",
        label: "All",
        scope: "ALL",
        description: "All authorised courses and accessible global subjects"
      },
      ...availableCourseLibraries.map(library => ({
        id: library.id,
        label: library.label,
        scope: "COURSE",
        courseId: library.courseId,
        role: library.role
      })),
      ...(globalLibrary.subjectCount > 0 ? [{
        id: "GLOBAL",
        label: "Global Subjects",
        scope: "GLOBAL"
      }] : [])
    ];

    return json({
      success: true,
      service: "account-library-catalogue",
      selectedSource: "ALL",
      sources,
      libraries,
      learningAreaRefs: [...learningAreaRefs],
      globalCurriculumVersion: globalLibrary.globalCurriculumVersion,
      count: libraries.reduce((total, library) => total + Number(library.catalogue?.count || 0), 0),
      warnings: courseLibraries
        .filter(library => !library.available)
        .map(library => `${library.label} Library is currently unavailable.`)
    });
  } catch (error) {
    return libraryError(error, env);
  }
}

function filterPublishedLibrary(library, policies, user, tables) {
  const catalogue = library.catalogue;
  if (!catalogue) return;
  let total = 0;
  for (const group of catalogue.groups || []) {
    let count = 0;
    group.subjects = (group.subjects || []).filter(subject => {
      subject.modules = (subject.modules || []).filter(module => {
        module.resources = (module.resources || []).filter(resource => {
          const key = library.scope === 'GLOBAL'
            ? `GLOBAL:${resource.originresourceid}`
            : `COURSE:${library.courseId}:${canonicalCourseResourceType(resource.type)}:${resource.originresourceid}`;
          const decision = academyResourceDecision({ key, source: library.scope,
            sourceActive: true, assigned: library.scope === 'COURSE',
            role: library.role || user.role, accountId: user.accountid,
            policy: policies.get(key), globalAccessModel: subject.accessmodel,
            globalSubjectId: subject.originsubjectid,
            globalMatrix: tables.GlobalSubjectAccessMatrix,
            globalSubjects: tables.GlobalSubjectList });
          if (decision.open) count += 1;
          return decision.open;
        });
        return module.resources.length > 0;
      });
      return subject.modules.length > 0;
    });
    group.count = count;
    total += count;
  }
  catalogue.count = total;
  if (library.scope === 'GLOBAL') {
    library.subjectCount = new Set((catalogue.groups || []).flatMap(group =>
      (group.subjects || []).map(subject => subject.subjectid))).size;
  }
}

export async function createAccountCourseLibraryAccessEndpoint(request, env) {
  const user = await getAuthUser(request, env);
  if (!user || user.type !== "account") {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const requestedCourseId = normalizePlatformIdentifier(body.courseId || body.courseid);
    const resourceType = clean(body.resourceType || body.resourcetype);
    const resourceId = clean(body.resourceId || body.resourceid);
    if (!requestedCourseId || !resourceType || !resourceId) {
      return json({ success: false, error: "Course and resource are required" }, 400);
    }

    const tables = await readLibraryPlatformTables(env, { global: false });
    const matches = resolveAuthorisedCourses(user, tables).filter(course => (
      normalizePlatformIdentifier(course.courseId) === requestedCourseId
    ));
    if (matches.length !== 1) {
      return json({ success: false, error: "The requested course Library is not authorised" }, 403);
    }

    const course = matches[0];
    const courseEnv = createCourseEnvironment(env, course);
    const operationalUser = await resolveOperationalAccountUser(
      courseEnv,
      centralCourseUser(user, course)
    );
    const delegated = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ resourceType, resourceId })
    });
    setRequestAuthUser(delegated, operationalUser);
    return createDriveFileAccessEndpoint(delegated, courseEnv);
  } catch (error) {
    return libraryError(error, env);
  }
}

export function resolveAuthorisedCourses(user, tables) {
  const accountId = normalizePlatformIdentifier(user.accountid);
  const activeCourses = new Map();
  for (const row of tables.CourseRegistry || []) {
    if (!isActivePlatformValue(row.Active)) continue;
    const courseId = normalizePlatformIdentifier(row.CourseID);
    const spreadsheetId = clean(row.SpreadsheetID);
    if (!courseId || !spreadsheetId || activeCourses.has(courseId)) {
      throw new Error("Active CourseRegistry rows are invalid or ambiguous");
    }
    activeCourses.set(courseId, row);
  }

  if (isGlobalAdminUser(user, tables.UserAccounts)) {
    return [...activeCourses.values()]
      .map(row => courseDescriptor(row, {
        role: "GLOBAL_ADMIN",
        accessId: "",
        courseRecordId: ""
      }));
  }

  const bestByCourse = new Map();
  for (const access of tables.UserCourseAccess || []) {
    const role = normalizePlatformIdentifier(access.Role);
    const courseId = normalizePlatformIdentifier(access.CourseID);
    if (
      normalizePlatformIdentifier(access.AccountID) !== accountId ||
      !isActivePlatformValue(access.Active) ||
      !COURSE_ROLES.has(role) ||
      !activeCourses.has(courseId) ||
      !clean(access.AccessID) ||
      !clean(access.CourseRecordID)
    ) {
      continue;
    }

    const current = bestByCourse.get(courseId);
    if (!current || authorityRank(role) < authorityRank(current.role)) {
      bestByCourse.set(courseId, {
        role,
        accessId: clean(access.AccessID),
        courseRecordId: clean(access.CourseRecordID)
      });
    }
  }

  return [...activeCourses.entries()]
    .filter(([courseId]) => bestByCourse.has(courseId))
    .map(([courseId, row]) => courseDescriptor(row, bestByCourse.get(courseId)));
}

export function buildGlobalLibrary(user, tables, now = new Date(), { includeProtectedLinks = false } = {}) {
  const accountId = normalizePlatformIdentifier(user.accountid);
  const accountMatches = (tables.UserAccounts || []).filter(account => (
    normalizePlatformIdentifier(account.AccountID) === accountId
  ));
  const account = accountMatches.length === 1 ? accountMatches[0] : null;
  const accessibleSubjectIds = accessibleGlobalSubjectIds({
    account,
    subjects: tables.GlobalSubjectList,
    policyRows: tables.GlobalSubjectAccessPolicy,
    accessRows: tables.GlobalSubjectAccessMatrix
  });
  const activeSubjects = new Map((tables.GlobalSubjectList || [])
    .filter(subject => (
      accessibleSubjectIds.has(normalizePlatformIdentifier(subject.SubjectID)) &&
      isActivePlatformValue(subject.Active)
    ))
    .map(subject => [normalizePlatformIdentifier(subject.SubjectID), subject]));
  const activeModules = new Map((tables.GlobalModuleList || [])
    .filter(module => (
      activeSubjects.has(normalizePlatformIdentifier(module.SubjectID)) &&
      isActivePlatformValue(module.Active)
    ))
    .map(module => [normalizePlatformIdentifier(module.ModuleID), module]));
  const activeTasks = new Map((tables.GlobalTaskList || [])
    .filter(task => (
      activeSubjects.has(normalizePlatformIdentifier(task.SubjectID)) &&
      isActivePlatformValue(task.Active) &&
      (!clean(task.ModuleID) || activeModules.has(normalizePlatformIdentifier(task.ModuleID)))
    ))
    .map(task => [normalizePlatformIdentifier(task.TaskID), task]));
  const catalogue = emptyCatalogue();
  const groupSubjectMaps = new Map();

  for (const resource of tables.GlobalResources || []) {
    const subjectId = normalizePlatformIdentifier(resource.SubjectID);
    const moduleId = normalizePlatformIdentifier(resource.ModuleID);
    const taskId = normalizePlatformIdentifier(resource.TaskID);
    const type = normalizePlatformIdentifier(resource.ResourceType);
    const groupKey = GLOBAL_TYPE_TO_GROUP[type];
    const subject = activeSubjects.get(subjectId);
    const task = taskId ? activeTasks.get(taskId) : null;
    const resolvedModuleId = moduleId || normalizePlatformIdentifier(task?.ModuleID);
    const module = resolvedModuleId ? activeModules.get(resolvedModuleId) : null;
    if (
      !subject ||
      !groupKey ||
      !isActivePlatformValue(resource.Active) ||
      (moduleId && !module) ||
      (taskId && !task) ||
      normalizePlatformIdentifier(module?.SubjectID || subjectId) !== subjectId ||
      normalizePlatformIdentifier(task?.SubjectID || subjectId) !== subjectId ||
      !clean(resource.ResourceName) ||
      !clean(resource.ResourceLink)
    ) {
      continue;
    }

    const group = catalogue[groupKey];
    let subjectMap = groupSubjectMaps.get(groupKey);
    if (!subjectMap) {
      subjectMap = new Map();
      groupSubjectMaps.set(groupKey, subjectMap);
    }

    let subjectRecord = subjectMap.get(subjectId);
    if (!subjectRecord) {
      const policy = resolveGlobalSubjectAccessPolicy(tables.GlobalSubjectAccessPolicy, subjectId);
      subjectRecord = {
        subjectid: `GLOBAL:${clean(subject.SubjectID)}`,
        originsubjectid: clean(subject.SubjectID),
        subjectname: clean(subject.SubjectName),
        sourcescope: "GLOBAL",
        sourceid: "GLOBAL",
        sourcelabel: "Global Subjects",
        accessmodel: policy.accessModel,
        deliverystatus: strongestGlobalSubjectDeliveryStatus(tables.GlobalSubjectRuns, subjectId, now),
        modules: [],
        _modules: new Map()
      };
      subjectMap.set(subjectId, subjectRecord);
      group.subjects.push(subjectRecord);
    }

    const moduleKey = resolvedModuleId || "GENERAL";
    let moduleRecord = subjectRecord._modules.get(moduleKey);
    if (!moduleRecord) {
      moduleRecord = {
        moduleid: resolvedModuleId ? `GLOBAL:${clean(module?.ModuleID || task?.ModuleID)}` : "",
        originmoduleid: clean(module?.ModuleID || task?.ModuleID),
        modulename: clean(module?.ModuleName) || "General",
        modulesortorder: Number(module?.SortOrder) || Number.MAX_SAFE_INTEGER,
        resources: []
      };
      subjectRecord._modules.set(moduleKey, moduleRecord);
      subjectRecord.modules.push(moduleRecord);
    }

    const resourceId = clean(resource.ResourceID);
    moduleRecord.resources.push({
      resourceid: `GLOBAL:${resourceId}`,
      originresourceid: resourceId,
      subjectid: subjectRecord.subjectid,
      originsubjectid: clean(subject.SubjectID),
      moduleid: moduleRecord.moduleid,
      originmoduleid: moduleRecord.originmoduleid,
      taskid: clean(resource.TaskID),
      name: clean(resource.ResourceName),
      resourceName: clean(resource.ResourceName),
      type,
      resourceType: type,
      resourceTypeLabel: globalTypeLabel(type),
      format: clean(resource.ResourceFormat),
      description: clean(resource.ResourceDescription),
      link: includeProtectedLinks ? clean(resource.ResourceLink) :
        extractDriveFileId(resource.ResourceLink) ? '/api/library/drive/file/protected' : clean(resource.ResourceLink),
      resourceLink: includeProtectedLinks ? clean(resource.ResourceLink) :
        extractDriveFileId(resource.ResourceLink) ? '/api/library/drive/file/protected' : clean(resource.ResourceLink),
      accessscope: "GLOBAL",
      sourcescope: "GLOBAL",
      sourceid: "GLOBAL",
      sourcelabel: "Global Subjects",
      accessmodel: subjectRecord.accessmodel,
      deliverystatus: subjectRecord.deliverystatus
    });
    group.count += 1;
    catalogue.count += 1;
  }

  for (const group of catalogue.groups) {
    for (const subject of group.subjects) {
      subject.modules.sort((left, right) => (
        Number(left.modulesortorder) - Number(right.modulesortorder) ||
        clean(left.modulename).localeCompare(clean(right.modulename))
      ));
      subject.modules.forEach(module => {
        module.resources.sort((left, right) => clean(left.name).localeCompare(clean(right.name)));
      });
      delete subject._modules;
    }
    group.subjects.sort((left, right) => clean(left.subjectname).localeCompare(clean(right.subjectname)));
  }

  return {
    id: "GLOBAL",
    label: "Global Subjects",
    scope: "GLOBAL",
    available: true,
    subjectCount: activeSubjects.size,
    globalCurriculumVersion: readGlobalCurriculumVersion(tables.PlatformConfig),
    catalogue
  };
}

async function readCourseLibrary(env, user, course) {
  try {
    const courseEnv = createCourseEnvironment(env, course);
    const operationalUser = await resolveOperationalAccountUser(
      courseEnv,
      centralCourseUser(user, course)
    );
    const catalogue = await readResourcesGoogleSheetsCatalogue(courseEnv, operationalUser);
    return {
      id: `COURSE:${course.courseId}`,
      label: course.courseName,
      scope: "COURSE",
      courseId: course.courseId,
      role: course.role,
      available: true,
      catalogue: namespaceCourseCatalogue(catalogue, course)
    };
  } catch (error) {
    return {
      id: `COURSE:${course.courseId}`,
      label: course.courseName,
      scope: "COURSE",
      courseId: course.courseId,
      role: course.role,
      available: false,
      catalogue: emptyCatalogue()
    };
  }
}

function namespaceCourseCatalogue(catalogue, course) {
  const output = structuredClone(catalogue || emptyCatalogue());
  output.groups = Array.isArray(output.groups) ? output.groups : [];
  for (const group of output.groups) {
    group.subjects = Array.isArray(group.subjects) ? group.subjects : [];
    for (const subject of group.subjects) {
      const originSubjectId = clean(subject.subjectid);
      subject.originsubjectid = originSubjectId;
      subject.subjectid = `COURSE:${course.courseId}:${originSubjectId || clean(subject.subjectname)}`;
      subject.sourcescope = "COURSE";
      subject.sourceid = `COURSE:${course.courseId}`;
      subject.sourcelabel = course.courseName;
      subject.courseid = course.courseId;
      for (const module of subject.modules || []) {
        const originModuleId = clean(module.moduleid);
        module.originmoduleid = originModuleId;
        module.moduleid = originModuleId ? `COURSE:${course.courseId}:${originModuleId}` : "";
        for (const resource of module.resources || []) {
          const originResourceId = clean(resource.resourceid);
          resource.originresourceid = originResourceId;
          resource.resourceid = `COURSE:${course.courseId}:${originResourceId || clean(resource.name)}`;
          resource.originsubjectid = clean(resource.subjectid) || originSubjectId;
          resource.subjectid = subject.subjectid;
          resource.originmoduleid = clean(resource.moduleid) || originModuleId;
          resource.moduleid = module.moduleid;
          resource.originresourceid = originResourceId;
          resource.accessscope = "COURSE";
          resource.sourcescope = "COURSE";
          resource.sourceid = `COURSE:${course.courseId}`;
          resource.sourcelabel = course.courseName;
          resource.courseid = course.courseId;
          resource.courserole = course.role;
          if (extractDriveFileId(resource.link)) {
            resource.link = '/api/library/drive/file/protected';
          }
        }
      }
    }
  }
  return output;
}

function emptyCatalogue() {
  const groups = RESOURCE_TAB_DEFINITIONS.map(config => ({
    type: config.type,
    key: config.key,
    label: config.label,
    description: config.description,
    count: 0,
    subjects: []
  }));
  return Object.assign({ success: true, groups, count: 0 }, Object.fromEntries(
    groups.map(group => [group.key, group])
  ));
}

async function readLibraryPlatformTables(env, options = {}) {
  const names = ["UserAccounts", "UserCourseAccess", "CourseRegistry"];
  if (options.global !== false) {
    names.push(
      "GlobalSubjectAccessMatrix",
      "GlobalSubjectAccessPolicy",
      "GlobalSubjectRuns",
      "GlobalSubjectList",
      "GlobalModuleList",
      "GlobalTaskList",
      "GlobalResources",
      "PlatformConfig"
    );
  }
  const entries = await Promise.all(names.map(async name => [name, await readPlatformSheet(env, name)]));
  return Object.fromEntries(entries);
}

function isGlobalAdminUser(user, accounts) {
  const accountId = normalizePlatformIdentifier(user.accountid);
  const matches = (accounts || []).filter(account => (
    normalizePlatformIdentifier(account.AccountID) === accountId
  ));
  return matches.length === 1 &&
    isActivePlatformValue(matches[0].Active) &&
    normalizePlatformIdentifier(matches[0].PlatformRole) === "GLOBAL_ADMIN";
}

function courseDescriptor(row, access) {
  return {
    courseId: clean(row.CourseID),
    courseName: clean(row.CourseName),
    spreadsheetId: clean(row.SpreadsheetID),
    schemaVersion: clean(row.SchemaVersion),
    role: access.role,
    accessId: access.accessId,
    courseRecordId: access.courseRecordId
  };
}

function centralCourseUser(user, course) {
  return {
    ...user,
    type: "account",
    scope: "COURSE",
    role: course.role,
    accessid: course.accessId,
    courseid: course.courseId,
    coursename: course.courseName,
    coursespreadsheetid: course.spreadsheetId,
    courserecordid: course.courseRecordId
  };
}

function readGlobalCurriculumVersion(rows) {
  const matches = (rows || []).filter(row => (
    normalizePlatformIdentifier(row.ConfigKey) === "GLOBALCURRICULUMVERSION"
  ));
  return matches.length === 1 ? Math.max(0, Number(matches[0].ConfigValue) || 0) : 0;
}

function globalTypeLabel(type) {
  return ({
    EBOOK: "eBook",
    PRINTABLE: "Printable",
    AUDIO: "Audio",
    VIDEO: "Video",
    OTHER: "Other"
  })[type] || "Other";
}

function libraryError(error, env) {
  const response = {
    success: false,
    error: "The authorised Library catalogue could not be loaded"
  };
  if (String(env.M4L_ACCOUNT_AUTH_DIAGNOSTICS || "").trim().toLowerCase() === "true") {
    response.detail = clean(error?.message || "Library service error").slice(0, 180);
  }
  return json(response, 503);
}

function clean(value) {
  return String(value ?? "").trim();
}
