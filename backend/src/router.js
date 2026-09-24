import { academySubjectsEndpoint } from './routes/academy-subjects.js';
import { programTimetableEndpoint } from './routes/program-timetable.js';
/* M4L V105.2 - Add platform Program setup routes. */
import { programEndpoint } from "./routes/program-builder.js";
import {
  adminLoginGoogleSheetsEndpoint,
  checkAdminGoogleSheetsEndpoint,
  checkStudentGoogleSheetsEndpoint,
  resetStudentPinGoogleSheetsEndpoint,
  setupAdminPinGoogleSheetsEndpoint,
  setupStudentPinGoogleSheetsEndpoint,
  studentLoginGoogleSheetsEndpoint
} from "./routes/auth-google-sheets.js";
import {
  registerAdminGoogleSheetsEndpoint,
  resetAdminPinGoogleSheetsEndpoint,
  searchAdminsGoogleSheetsEndpoint,
  updateAdminGoogleSheetsEndpoint
} from "./routes/admin-account-management.js";
import {
  attendanceReportGoogleSheetsEndpoint,
  attendanceStudentsGoogleSheetsEndpoint,
  submitAbsentAttendanceGoogleSheetsEndpoint
} from "./routes/attendance.js";
import {
  getStudentTasksGoogleSheetsEndpoint,
  taskProgressDetailGoogleSheetsEndpoint,
  taskProgressReportGoogleSheetsEndpoint
} from "./routes/progress-read.js";
import {
  updateTaskCompleteGoogleSheetsEndpoint,
  verifyStudentTaskGoogleSheetsEndpoint
} from "./routes/progress-write.js";
import {
  getWeeklyPlannerEndpoint,
  saveWeeklyPlannerEndpoint,
  saveWeeklyPlannerPreviewToDriveEndpoint,
  weeklyPlannerArchiveOverviewEndpoint,
  weeklyPlannerHealthEndpoint,
  weeklyPlannerTeacherHistoryEndpoint,
  weeklyPlannerTeacherWeekRecordsEndpoint,
  weeklyPlannerTeachersEndpoint,
  weeklyPlannerWeekRecordsEndpoint
} from "./routes/weekly-planner.js";
import {
  getTimetableGoogleSheetsEndpoint,
  updateTimetableZoomLinkGoogleSheetsEndpoint
} from "./routes/timetable.js";
import { getResourcesGoogleSheetsEndpoint } from "./routes/resources.js";
import {
  createAccountCourseLibraryAccessEndpoint,
  getAccountLibraryCatalogueEndpoint
} from "./routes/library-catalogue.js";
import {
  browseDriveFolderEndpoint,
  createDriveFileAccessEndpoint,
  createDriveResourceEndpoint,
  getResourceManagementOptionsEndpoint,
  listManagedResourcesEndpoint,
  streamDriveFileEndpoint,
  updateDriveResourceEndpoint
} from "./routes/drive-library.js";
import {
  createSubjectGoogleSheetsEndpoint,
  createSubjectResourceGoogleSheetsEndpoint,
  createModuleGoogleSheetsEndpoint,
  createTaskGoogleSheetsEndpoint,
  listModulesGoogleSheetsEndpoint,
  listSubjectResourcesGoogleSheetsEndpoint,
  listSubjectsGoogleSheetsEndpoint,
  listTasksGoogleSheetsEndpoint,
  updateModuleGoogleSheetsEndpoint,
  updateSubjectGoogleSheetsEndpoint,
  updateSubjectResourceGoogleSheetsEndpoint,
  updateTaskGoogleSheetsEndpoint
} from "./routes/curriculum.js";
import {
  bulkUpdateTimetableSessionsGoogleSheetsEndpoint,
  deleteTimetableSessionGoogleSheetsEndpoint,
  getTimetableBuilderGoogleSheetsEndpoint,
  publishTimetableGoogleSheetsEndpoint,
  restoreTimetableSessionGoogleSheetsEndpoint,
  saveTimetableCourseGoogleSheetsEndpoint,
  saveTimetableSessionGoogleSheetsEndpoint,
  saveTimetableTimeSlotGoogleSheetsEndpoint
} from "./routes/timetable-builder.js";
import {
  previewTimetableIntegrationGoogleSheetsEndpoint,
  saveTimetableLiveSourceGoogleSheetsEndpoint
} from "./routes/timetable-integration.js";
import {
  checkStudentDuplicateGoogleSheetsEndpoint,
  getStudentAssignmentOptionsGoogleSheetsEndpoint,
  searchStudentsGoogleSheetsEndpoint,
  updateStudentGoogleSheetsEndpoint
} from "./routes/student-management.js";
import { registerStudentGoogleSheetsEndpoint } from "./routes/student-registration.js";
import { assignTasksGoogleSheetsEndpoint } from "./routes/task-assignment.js";
import {
  getSystemSettingsGoogleSheetsEndpoint,
  saveSystemSettingsGoogleSheetsEndpoint
} from "./routes/system-settings.js";
import { backendRoutingDiagnosticsEndpoint } from "./routes/backend-routing.js";
import { platformValidationEndpoint } from "./routes/platform-validation.js";
import { platformAccountMigrationEndpoint } from "./routes/platform-account-migration.js";
import { platformIdentityLinkEndpoint } from "./routes/platform-identity-link.js";
import {
  browsePlatformGlobalDriveFolderEndpoint,
  createPlatformGlobalDriveAccessEndpoint,
  getPlatformGlobalManagementEndpoint,
  savePlatformGlobalDriveRootEndpoint,
  savePlatformGlobalModuleEndpoint,
  savePlatformGlobalResourceEndpoint,
  savePlatformGlobalResourcesBatchEndpoint,
  savePlatformGlobalSubjectAccessEndpoint,
  savePlatformGlobalSubjectEndpoint,
  savePlatformGlobalSubjectsBatchEndpoint,
  savePlatformGlobalTaskEndpoint
} from "./routes/platform-global-management.js";
import {
  getPlatformGlobalDeliveryEndpoint,
  migratePlatformGlobalCourseAccessEndpoint,
  migratePlatformGlobalCourseSchedulingEndpoint,
  savePlatformGlobalSubjectPolicyEndpoint,
  savePlatformGlobalSubjectRunEndpoint
} from "./routes/platform-global-delivery.js";
import {
  getPlatformGlobalTimetableEndpoint,
  generatePlatformGlobalTimetableSessionsEndpoint,
  materializePlatformGlobalTimetableExceptionEndpoint,
  savePlatformGlobalTimetableSessionEndpoint,
  savePlatformGlobalTimetableSessionBatchEndpoint,
  reschedulePlatformGlobalTimetableSessionEndpoint,
  revisePlatformGlobalTimetableEndpoint,
  publishPlatformGlobalTimetableEndpoint
} from "./routes/platform-global-timetable.js";
import {
  accountGlobalWorkspaceEndpoint,
  accountLoginEndpoint,
  accountSessionEndpoint,
  accountWorkspaceEndpoint,
  checkAccountEndpoint,
  setupAccountPinEndpoint,
  switchAccountContextEndpoint
} from "./routes/account-auth.js";
import { getAcademyTimetableEndpoint } from "./routes/academy-timetable.js";
import {
  getAcademyCalendarAdminEndpoint,
  saveAcademyCalendarBatchEndpoint,
  saveAcademyCalendarEventEndpoint
} from "./routes/platform-academy-calendar.js";
import { resolveCourseScopedRequest } from "./lib/course-routing.js";
import {
  BACKEND_APPS_SCRIPT,
  BACKEND_GOOGLE_SHEETS,
  BACKEND_WORKER,
  getBackendSelection,
  shouldLogBackendRouting
} from "./lib/backend-routing.js";
import { json } from "./lib/http.js";
import { createRequestEnvironment } from "./lib/request-context.js";

const ROUTES = new Map([
  ...["get", "import-preview", "save", "recover"].map(action => [
    `/api/admin/platform/academy-subjects/${action}`, workerRoute("program-timetable", academySubjectsEndpoint(action))
  ]),
  ...["get", "prepare", "save", "validate", "preview", "publish", "history", "recover", "manage-get", "manage-save"].map(action => [
    `/api/admin/platform/program-timetable/${action}`, workerRoute("program-timetable", programTimetableEndpoint(action))
  ]),
  ...["list", "create", "save", "readiness", "prepare"].map(action => [
    `/api/admin/platform/programs/${action}`, workerRoute("program-builder", programEndpoint(action))
  ]),
  ["/api/account/check", workerRoute("account-auth", checkAccountEndpoint)],
  ["/api/account/setup-pin", workerRoute("account-auth", setupAccountPinEndpoint)],
  ["/api/account/login", workerRoute("account-auth", accountLoginEndpoint)],
  ["/api/account/session", workerRoute("account-auth", accountSessionEndpoint)],
  ["/api/account/switch-context", workerRoute("account-auth", switchAccountContextEndpoint)],
  ["/api/account/workspace", workerRoute("account-auth", accountWorkspaceEndpoint, {
    courseScoped: true
  })],
  ["/api/account/global-workspace", workerRoute("account-auth", accountGlobalWorkspaceEndpoint)],
  ["/api/academy/timetable", workerRoute("academy-timetable", getAcademyTimetableEndpoint)],
  ["/api/admin/platform/calendar/get", workerRoute("academy-calendar", getAcademyCalendarAdminEndpoint)],
  ["/api/admin/platform/calendar/save", workerRoute("academy-calendar", saveAcademyCalendarEventEndpoint)],
  ["/api/admin/platform/calendar/batch-save", workerRoute("academy-calendar", saveAcademyCalendarBatchEndpoint)],
  ["/api/resources/list", googleSheetsRoute("resources", getResourcesGoogleSheetsEndpoint)],
  ["/api/student/resources/list", googleSheetsRoute("resources", getResourcesGoogleSheetsEndpoint)],
  ["/api/admin/resources/list", googleSheetsRoute("resources", getResourcesGoogleSheetsEndpoint)],
  ["/api/library/catalogue", workerRoute("account-library-catalogue", getAccountLibraryCatalogueEndpoint)],
  ["/api/library/course-resource/access", workerRoute("account-library-access", createAccountCourseLibraryAccessEndpoint)],
  ["/api/admin/resources/options", googleSheetsRoute("resource-management", getResourceManagementOptionsEndpoint)],
  ["/api/admin/resources/create", googleSheetsRoute("resource-management", createDriveResourceEndpoint)],
  ["/api/admin/resources/manage-list", googleSheetsRoute("resource-management", listManagedResourcesEndpoint)],
  ["/api/admin/resources/update", googleSheetsRoute("resource-management", updateDriveResourceEndpoint)],
  ["/api/admin/drive/browse", workerRoute("drive-library", browseDriveFolderEndpoint, { courseScoped: true })],
  ["/api/library/drive/access", workerRoute("drive-library", createDriveFileAccessEndpoint, { courseScoped: true })],

  ["/api/timetable/get", googleSheetsRoute("timetable-read", getTimetableGoogleSheetsEndpoint)],
  ["/api/student/timetable/get", googleSheetsRoute("timetable-read", getTimetableGoogleSheetsEndpoint)],
  ["/api/admin/timetable/get", googleSheetsRoute("timetable-read", getTimetableGoogleSheetsEndpoint)],
  ["/api/admin/timetable/update-zoom", googleSheetsRoute("timetable-write", updateTimetableZoomLinkGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/get", googleSheetsRoute("timetable-builder", getTimetableBuilderGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/course/save", googleSheetsRoute("timetable-builder", saveTimetableCourseGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/time-slot/save", googleSheetsRoute("timetable-builder", saveTimetableTimeSlotGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/session/save", googleSheetsRoute("timetable-builder", saveTimetableSessionGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/session/bulk-update", googleSheetsRoute("timetable-builder", bulkUpdateTimetableSessionsGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/session/delete", googleSheetsRoute("timetable-builder", deleteTimetableSessionGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/session/restore", googleSheetsRoute("timetable-builder", restoreTimetableSessionGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/publish", googleSheetsRoute("timetable-builder", publishTimetableGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/integration/preview", googleSheetsRoute("timetable-builder", previewTimetableIntegrationGoogleSheetsEndpoint)],
  ["/api/admin/timetable-builder/integration/source/save", googleSheetsRoute("timetable-builder", saveTimetableLiveSourceGoogleSheetsEndpoint)],

  ["/api/admin/weekly-planner/health", googleSheetsRoute("weekly-planner", weeklyPlannerHealthEndpoint)],
  ["/api/admin/weekly-planner/teachers", googleSheetsRoute("weekly-planner", weeklyPlannerTeachersEndpoint)],
  ["/api/admin/weekly-planner/get", googleSheetsRoute("weekly-planner", getWeeklyPlannerEndpoint)],
  ["/api/admin/weekly-planner/save", googleSheetsRoute("weekly-planner", saveWeeklyPlannerEndpoint)],
  ["/api/admin/weekly-planner/save-preview", appsScriptRoute("weekly-planner-drive", saveWeeklyPlannerPreviewToDriveEndpoint)],
  ["/api/admin/weekly-planner/archive-overview", googleSheetsRoute("weekly-planner", weeklyPlannerArchiveOverviewEndpoint)],
  ["/api/admin/weekly-planner/week-records", googleSheetsRoute("weekly-planner", weeklyPlannerWeekRecordsEndpoint)],
  ["/api/admin/weekly-planner/teacher-history", googleSheetsRoute("weekly-planner", weeklyPlannerTeacherHistoryEndpoint)],
  ["/api/admin/weekly-planner/teacher-week-records", googleSheetsRoute("weekly-planner", weeklyPlannerTeacherWeekRecordsEndpoint)],
  ["/api/admin/backend-routing", workerRoute("routing", backendRoutingDiagnosticsEndpoint, { courseScoped: true })],
  ["/api/admin/platform/validate", workerRoute("platform-validation", platformValidationEndpoint, { courseScoped: true })],
  ["/api/admin/platform/accounts/migrate", workerRoute("platform-account-migration", platformAccountMigrationEndpoint, { courseScoped: true })],
  ["/api/admin/platform/identity-links", workerRoute("platform-identity-link", platformIdentityLinkEndpoint, { courseScoped: true })],
  ["/api/admin/platform/global/get", workerRoute("platform-global-management", getPlatformGlobalManagementEndpoint)],
  ["/api/admin/platform/global/drive-root/save", workerRoute("platform-global-management", savePlatformGlobalDriveRootEndpoint)],
  ["/api/admin/platform/global/drive/browse", workerRoute("platform-global-management", browsePlatformGlobalDriveFolderEndpoint)],
  ["/api/admin/platform/global/subject/save", workerRoute("platform-global-management", savePlatformGlobalSubjectEndpoint)],
  ["/api/admin/platform/global/subjects/save-batch", workerRoute("platform-global-management", savePlatformGlobalSubjectsBatchEndpoint)],
  ["/api/admin/platform/global/module/save", workerRoute("platform-global-management", savePlatformGlobalModuleEndpoint)],
  ["/api/admin/platform/global/task/save", workerRoute("platform-global-management", savePlatformGlobalTaskEndpoint)],
  ["/api/admin/platform/global/resource/save", workerRoute("platform-global-management", savePlatformGlobalResourceEndpoint)],
  ["/api/admin/platform/global/resources/save-batch", workerRoute("platform-global-management", savePlatformGlobalResourcesBatchEndpoint)],
  ["/api/admin/platform/global/access/save", workerRoute("platform-global-management", savePlatformGlobalSubjectAccessEndpoint)],
  ["/api/admin/platform/global/delivery/get", workerRoute("platform-global-management", getPlatformGlobalDeliveryEndpoint)],
  ["/api/admin/platform/global/policy/save", workerRoute("platform-global-management", savePlatformGlobalSubjectPolicyEndpoint)],
  ["/api/admin/platform/global/run/save", workerRoute("platform-global-management", savePlatformGlobalSubjectRunEndpoint)],
  ["/api/admin/platform/global/courses/migrate-access", workerRoute("platform-global-management", migratePlatformGlobalCourseAccessEndpoint)],
  ["/api/admin/platform/global/courses/migrate-scheduling", workerRoute("platform-global-management", migratePlatformGlobalCourseSchedulingEndpoint)],
  ["/api/admin/platform/global/timetable/get", workerRoute("platform-global-timetable", getPlatformGlobalTimetableEndpoint)],
  ["/api/admin/platform/global/timetable/generate", workerRoute("platform-global-timetable", generatePlatformGlobalTimetableSessionsEndpoint)],
  ["/api/admin/platform/global/timetable/session/materialize", workerRoute("platform-global-timetable", materializePlatformGlobalTimetableExceptionEndpoint)],
  ["/api/admin/platform/global/timetable/session/save", workerRoute("platform-global-timetable", savePlatformGlobalTimetableSessionEndpoint)],
  ["/api/admin/platform/global/timetable/session/batch-save", workerRoute("platform-global-timetable", savePlatformGlobalTimetableSessionBatchEndpoint)],
  ["/api/admin/platform/global/timetable/session/reschedule", workerRoute("platform-global-timetable", reschedulePlatformGlobalTimetableSessionEndpoint)],
  ["/api/admin/platform/global/timetable/revise", workerRoute("platform-global-timetable", revisePlatformGlobalTimetableEndpoint)],
  ["/api/admin/platform/global/timetable/publish", workerRoute("platform-global-timetable", publishPlatformGlobalTimetableEndpoint)],
  ["/api/platform/global/resources/access", workerRoute("platform-global-management", createPlatformGlobalDriveAccessEndpoint)],
  ["/api/admin/system-settings/get", googleSheetsRoute("system-settings", getSystemSettingsGoogleSheetsEndpoint)],
  ["/api/admin/system-settings/save", googleSheetsRoute("system-settings", saveSystemSettingsGoogleSheetsEndpoint)],

  ["/api/admin/check-admin", googleSheetsRoute("auth", checkAdminGoogleSheetsEndpoint, { courseScoped: false })],
  ["/api/admin/setup-pin", googleSheetsRoute("auth", setupAdminPinGoogleSheetsEndpoint, { courseScoped: false })],
  ["/api/admin/login", googleSheetsRoute("auth", adminLoginGoogleSheetsEndpoint, { courseScoped: false })],
  ["/api/admin/reset-pin", googleSheetsRoute("auth", resetStudentPinGoogleSheetsEndpoint)],

  ["/api/admin/admins/search", googleSheetsRoute("admin-management-read", searchAdminsGoogleSheetsEndpoint)],
  ["/api/admin/register-admin", googleSheetsRoute("admin-management-write", registerAdminGoogleSheetsEndpoint)],
  ["/api/admin/update-admin", googleSheetsRoute("admin-management-update", updateAdminGoogleSheetsEndpoint)],
  ["/api/admin/reset-admin-pin", googleSheetsRoute("admin-management-update", resetAdminPinGoogleSheetsEndpoint)],

  ["/api/check-student", googleSheetsRoute("auth", checkStudentGoogleSheetsEndpoint, { courseScoped: false })],
  ["/api/setup-pin", googleSheetsRoute("auth", setupStudentPinGoogleSheetsEndpoint, { courseScoped: false })],
  ["/api/login", googleSheetsRoute("auth", studentLoginGoogleSheetsEndpoint, { courseScoped: false })],

  ["/api/attendance/submit-absent", googleSheetsRoute("attendance-write", submitAbsentAttendanceGoogleSheetsEndpoint)],
  ["/api/attendance/students", googleSheetsRoute("attendance-read", attendanceStudentsGoogleSheetsEndpoint)],
  ["/api/attendance/report", googleSheetsRoute("attendance-read", attendanceReportGoogleSheetsEndpoint)],

  ["/api/admin/check-student-duplicate", googleSheetsRoute("student-management-read", checkStudentDuplicateGoogleSheetsEndpoint)],
  ["/api/admin/register-student", googleSheetsRoute("student-management-write", registerStudentGoogleSheetsEndpoint)],
  ["/api/admin/update-student", googleSheetsRoute("student-management-update", updateStudentGoogleSheetsEndpoint)],
  ["/api/admin/students/search", googleSheetsRoute("student-management-read", searchStudentsGoogleSheetsEndpoint)],
  ["/api/admin/search-students", googleSheetsRoute("student-management-read", searchStudentsGoogleSheetsEndpoint)],
  ["/api/admin/student/search", googleSheetsRoute("student-management-read", searchStudentsGoogleSheetsEndpoint)],
  ["/api/admin/students/assignment-options", googleSheetsRoute("task-assignment-read", getStudentAssignmentOptionsGoogleSheetsEndpoint)],

  ["/api/admin/subjects/create", googleSheetsRoute("curriculum-write", createSubjectGoogleSheetsEndpoint)],
  ["/api/admin/subjects/list", googleSheetsRoute("curriculum-read", listSubjectsGoogleSheetsEndpoint)],
  ["/api/admin/subjects/update", googleSheetsRoute("curriculum-write", updateSubjectGoogleSheetsEndpoint)],

  ["/api/admin/modules/create", googleSheetsRoute("curriculum-write", createModuleGoogleSheetsEndpoint)],
  ["/api/admin/modules/list", googleSheetsRoute("curriculum-read", listModulesGoogleSheetsEndpoint)],
  ["/api/admin/modules/update", googleSheetsRoute("curriculum-write", updateModuleGoogleSheetsEndpoint)],

  ["/api/admin/subject-resources/create", googleSheetsRoute("curriculum-resources-write", createSubjectResourceGoogleSheetsEndpoint)],
  ["/api/admin/subject-resources/list", googleSheetsRoute("curriculum-resources-read", listSubjectResourcesGoogleSheetsEndpoint)],
  ["/api/admin/subject-resources/update", googleSheetsRoute("curriculum-resources-write", updateSubjectResourceGoogleSheetsEndpoint)],

  ["/api/admin/tasks/create", googleSheetsRoute("curriculum-write", createTaskGoogleSheetsEndpoint)],
  ["/api/admin/tasks/list", googleSheetsRoute("curriculum-read", listTasksGoogleSheetsEndpoint)],
  ["/api/admin/tasks/update", googleSheetsRoute("curriculum-write", updateTaskGoogleSheetsEndpoint)],
  ["/api/admin/tasks/assign", googleSheetsRoute("task-assignment-write", assignTasksGoogleSheetsEndpoint)],
  ["/api/admin/tasks/verify", googleSheetsRoute("progress-write", verifyStudentTaskGoogleSheetsEndpoint)],

  ["/api/tasks/student", googleSheetsRoute("progress-read", getStudentTasksGoogleSheetsEndpoint)],
  ["/api/tasks/update-complete", googleSheetsRoute("progress-write", updateTaskCompleteGoogleSheetsEndpoint)],
  ["/api/progress/tasks", googleSheetsRoute("progress-read", taskProgressReportGoogleSheetsEndpoint)],
  ["/api/progress/task-detail", googleSheetsRoute("progress-read", taskProgressDetailGoogleSheetsEndpoint)]
]);

export function routeRequest(request, env, pathname) {
  const route = ROUTES.get(pathname);
  if (route) return executeRoute(route, request, env, pathname);

  const driveFileMatch = /^\/api\/library\/drive\/file\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (driveFileMatch) {
    const dynamicRoute = workerRoute("drive-library", (dynamicRequest, dynamicEnv) => (
      streamDriveFileEndpoint(dynamicRequest, dynamicEnv, driveFileMatch[1])
    ));
    return executeRoute(dynamicRoute, request, env, pathname);
  }

  return null;
}

export const ROUTE_PATHS = Object.freeze(Array.from(ROUTES.keys()));

async function executeRoute(route, request, env, pathname) {
  const selection = getBackendSelection(env, route.feature);

  if (!selection.valid) {
    return withBackendHeaders(json({
      success: false,
      error: "Backend routing configuration error",
      detail: selection.error,
      feature: route.feature
    }, 503), selection);
  }

  const handler = route.handlers[selection.backend];

  if (typeof handler !== "function") {
    return withBackendHeaders(json({
      success: false,
      error: "Selected backend is not implemented for this route",
      feature: route.feature,
      backend: selection.backend
    }, 503), selection);
  }

  if (shouldLogBackendRouting(env)) {
    console.info("M4L backend route", {
      pathname,
      feature: route.feature,
      backend: selection.backend,
      source: selection.source
    });
  }

  // Every routed request receives its own environment wrapper. V104.3 stores
  // Google Sheets read promises on this wrapper, and Course environments
  // inherit from it, so duplicate ranges can be reused only within this
  // request. The original Cloudflare env object is never mutated.
  let requestEnv = createRequestEnvironment(env);
  let course = null;
  if (route.courseScoped) {
    const routed = await resolveCourseScopedRequest(request, requestEnv);
    if (!routed.ok) return withBackendHeaders(routed.response, selection, routed.course);
    requestEnv = routed.env;
    course = routed.course;
  }

  const response = await handler(request, requestEnv);
  return withBackendHeaders(response, selection, course);
}

function appsScriptRoute(feature, handler, options = {}) {
  return backendRoute(feature, { [BACKEND_APPS_SCRIPT]: handler }, {
    courseScoped: options.courseScoped !== false
  });
}

function googleSheetsRoute(feature, handler, options = {}) {
  return backendRoute(feature, { [BACKEND_GOOGLE_SHEETS]: handler }, {
    courseScoped: options.courseScoped !== false
  });
}

function workerRoute(feature, handler, options = {}) {
  return backendRoute(feature, { [BACKEND_WORKER]: handler }, options);
}

function backendRoute(feature, handlers, options = {}) {
  return Object.freeze({
    feature,
    courseScoped: options.courseScoped === true,
    handlers: Object.freeze({ ...handlers })
  });
}

function withBackendHeaders(response, selection, course = null) {
  const headers = new Headers(response.headers);
  headers.set("X-M4L-Feature", selection.feature || "unknown");
  headers.set("X-M4L-Backend", selection.backend || "invalid");
  headers.set("X-M4L-Backend-Source", selection.source || "unknown");
  appendExposedHeaders(headers, [
    "X-M4L-Feature",
    "X-M4L-Backend",
    "X-M4L-Backend-Source"
  ]);
  if (course?.courseId) {
    headers.set("X-M4L-Course-ID", course.courseId);
    appendExposedHeaders(headers, ["X-M4L-Course-ID"]);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function appendExposedHeaders(headers, names) {
  const existing = String(headers.get("Access-Control-Expose-Headers") || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const values = new Set([...existing, ...names]);
  headers.set("Access-Control-Expose-Headers", Array.from(values).join(", "));
}
