/* M4L V105.1 - Program routes and release health metadata. */
import assert from "node:assert/strict";
import { ROUTE_PATHS } from "../src/router.js";
import worker from "../src/worker.js";

const expectedPaths = [
  ...["get", "import-preview", "save", "recover"].map(action => `/api/admin/platform/academy-subjects/${action}`),
  ...["get", "prepare", "save", "validate", "preview", "publish", "history", "recover", "manage-get", "manage-save"].map(action => `/api/admin/platform/program-timetable/${action}`),
  ...["list", "create", "save", "readiness", "prepare"].map(action => `/api/admin/platform/programs/${action}`),
  "/api/account/check",
  "/api/account/setup-pin",
  "/api/account/login",
  "/api/account/session",
  "/api/account/switch-context",
  "/api/account/workspace",
  "/api/account/global-workspace",
  "/api/academy/timetable",
  "/api/admin/platform/calendar/get",
  "/api/admin/platform/calendar/save",
  "/api/admin/platform/calendar/batch-save",
  "/api/resources/list",
  "/api/student/resources/list",
  "/api/admin/resources/list",
  "/api/library/catalogue",
  "/api/library/course-resource/access",
  "/api/admin/resources/options",
  "/api/admin/resources/create",
  "/api/admin/resources/manage-list",
  "/api/admin/resources/update",
  "/api/admin/drive/browse",
  "/api/library/drive/access",
  "/api/timetable/get",
  "/api/student/timetable/get",
  "/api/admin/timetable/get",
  "/api/admin/timetable/update-zoom",
  "/api/admin/timetable-builder/get",
  "/api/admin/timetable-builder/course/save",
  "/api/admin/timetable-builder/time-slot/save",
  "/api/admin/timetable-builder/session/save",
  "/api/admin/timetable-builder/session/bulk-update",
  "/api/admin/timetable-builder/session/delete",
  "/api/admin/timetable-builder/session/restore",
  "/api/admin/timetable-builder/publish",
  "/api/admin/timetable-builder/integration/preview",
  "/api/admin/timetable-builder/integration/source/save",
  "/api/admin/weekly-planner/health",
  "/api/admin/weekly-planner/teachers",
  "/api/admin/weekly-planner/get",
  "/api/admin/weekly-planner/save",
  "/api/admin/weekly-planner/save-preview",
  "/api/admin/weekly-planner/archive-overview",
  "/api/admin/weekly-planner/week-records",
  "/api/admin/weekly-planner/teacher-history",
  "/api/admin/weekly-planner/teacher-week-records",
  "/api/admin/backend-routing",
  "/api/admin/platform/validate",
  "/api/admin/platform/accounts/migrate",
  "/api/admin/platform/identity-links",
  "/api/admin/platform/global/get",
  "/api/admin/platform/global/drive-root/save",
  "/api/admin/platform/global/drive/browse",
  "/api/admin/platform/global/subject/save",
  "/api/admin/platform/global/subjects/save-batch",
  "/api/admin/platform/global/module/save",
  "/api/admin/platform/global/task/save",
  "/api/admin/platform/global/resource/save",
  "/api/admin/platform/global/resources/save-batch",
  "/api/admin/platform/global/access/save",
  "/api/admin/platform/global/delivery/get",
  "/api/admin/platform/global/policy/save",
  "/api/admin/platform/global/run/save",
  "/api/admin/platform/global/courses/migrate-access",
  "/api/admin/platform/global/courses/migrate-scheduling",
  "/api/admin/platform/global/timetable/get",
  "/api/admin/platform/global/timetable/generate",
  "/api/admin/platform/global/timetable/session/materialize",
  "/api/admin/platform/global/timetable/session/save",
  "/api/admin/platform/global/timetable/session/batch-save",
  "/api/admin/platform/global/timetable/session/reschedule",
  "/api/admin/platform/global/timetable/revise",
  "/api/admin/platform/global/timetable/publish",
  "/api/platform/global/resources/access",
  "/api/admin/system-settings/get",
  "/api/admin/system-settings/save",
  "/api/admin/check-admin",
  "/api/admin/setup-pin",
  "/api/admin/login",
  "/api/admin/reset-pin",
  "/api/admin/admins/search",
  "/api/admin/register-admin",
  "/api/admin/update-admin",
  "/api/admin/reset-admin-pin",
  "/api/check-student",
  "/api/setup-pin",
  "/api/login",
  "/api/attendance/submit-absent",
  "/api/attendance/students",
  "/api/attendance/report",
  "/api/admin/check-student-duplicate",
  "/api/admin/register-student",
  "/api/admin/update-student",
  "/api/admin/students/search",
  "/api/admin/search-students",
  "/api/admin/student/search",
  "/api/admin/students/assignment-options",
  "/api/admin/subjects/create",
  "/api/admin/subjects/list",
  "/api/admin/subjects/update",
  "/api/admin/modules/create",
  "/api/admin/modules/list",
  "/api/admin/modules/update",
  "/api/admin/subject-resources/create",
  "/api/admin/subject-resources/list",
  "/api/admin/subject-resources/update",
  "/api/admin/tasks/create",
  "/api/admin/tasks/list",
  "/api/admin/tasks/update",
  "/api/admin/tasks/assign",
  "/api/admin/tasks/verify",
  "/api/tasks/student",
  "/api/tasks/update-complete",
  "/api/progress/tasks",
  "/api/progress/task-detail"
];

assert.deepEqual(ROUTE_PATHS, expectedPaths, "The modular router must retain existing routes and include the V104.5 Course scheduling migration/materialisation routes");

const root = await worker.fetch(new Request("https://worker.test/"), {});
assert.equal(root.status, 200);
assert.deepEqual(await root.json(), {
  success: true,
  service: "rebootworker",
  version: "105.3.1.1"
});

const preflight = await worker.fetch(new Request("https://worker.test/api/login", {
  method: "OPTIONS"
}), {});
assert.equal(preflight.status, 200);
assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");

const notFound = await worker.fetch(new Request("https://worker.test/not-a-route"), {});
assert.equal(notFound.status, 404);
assert.deepEqual(await notFound.json(), { success: false, error: "Not found" });

const asynchronousRouteFailure = await worker.fetch(new Request(
  "https://worker.test/api/admin/check-admin",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uniqueid: "ASYNC-FAILURE" })
  }
), {
  GOOGLE_SPREADSHEET_ID: "test-sheet",
  GOOGLE_SERVICE_ACCOUNT_JSON: "not-valid-json",
  M4L_BACKEND_AUTH: "google-sheets"
});
assert.equal(asynchronousRouteFailure.status, 500);
assert.equal(
  asynchronousRouteFailure.headers.get("Access-Control-Allow-Origin"),
  "*",
  "An asynchronous route failure must still receive the Worker's JSON/CORS response"
);
assert.deepEqual(await asynchronousRouteFailure.json(), {
  success: false,
  error: "Worker error"
});

const routingUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/backend-routing",
  { method: "POST" }
), {});
assert.equal(routingUnauthorized.status, 401);
assert.equal(routingUnauthorized.headers.get("X-M4L-Feature"), "routing");
assert.equal(routingUnauthorized.headers.get("X-M4L-Backend"), "worker");

const systemSettingsUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/system-settings/get",
  { method: "POST" }
), {
  M4L_BACKEND_SYSTEM_SETTINGS: "google-sheets"
});
assert.equal(systemSettingsUnauthorized.status, 401);
assert.equal(systemSettingsUnauthorized.headers.get("X-M4L-Feature"), "system-settings");
assert.equal(systemSettingsUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  systemSettingsUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

const timetableWriteUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/timetable/update-zoom",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zoomlink: "https://zoom.test/direct" })
  }
), {
  M4L_BACKEND_TIMETABLE_WRITE: "google-sheets"
});
assert.equal(timetableWriteUnauthorized.status, 401);
assert.equal(timetableWriteUnauthorized.headers.get("X-M4L-Feature"), "timetable-write");
assert.equal(timetableWriteUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  timetableWriteUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

const attendanceReadUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/attendance/students",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ classgroup: "ALL" })
  }
), {
  M4L_BACKEND_ATTENDANCE_READ: "google-sheets"
});
assert.equal(attendanceReadUnauthorized.status, 401);
assert.equal(attendanceReadUnauthorized.headers.get("X-M4L-Feature"), "attendance-read");
assert.equal(attendanceReadUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");

const attendanceWriteUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/attendance/submit-absent",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2026-07-28", absentStudents: [] })
  }
), {
  M4L_BACKEND_ATTENDANCE_WRITE: "google-sheets"
});
assert.equal(attendanceWriteUnauthorized.status, 401);
assert.equal(attendanceWriteUnauthorized.headers.get("X-M4L-Feature"), "attendance-write");
assert.equal(attendanceWriteUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");

const curriculumReadUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/subjects/list",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  }
), {
  M4L_BACKEND_CURRICULUM_READ: "google-sheets"
});
assert.equal(curriculumReadUnauthorized.status, 401);
assert.equal(curriculumReadUnauthorized.headers.get("X-M4L-Feature"), "curriculum-read");
assert.equal(curriculumReadUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");

const curriculumWriteUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/subjects/create",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectName: "Unauthorized Subject" })
  }
), {
  M4L_BACKEND_CURRICULUM_WRITE: "google-sheets"
});
assert.equal(curriculumWriteUnauthorized.status, 401);
assert.equal(curriculumWriteUnauthorized.headers.get("X-M4L-Feature"), "curriculum-write");
assert.equal(curriculumWriteUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  curriculumWriteUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

const curriculumResourcesReadUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/subject-resources/list",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  }
), {
  M4L_BACKEND_CURRICULUM_RESOURCES_READ: "google-sheets"
});
assert.equal(curriculumResourcesReadUnauthorized.status, 401);
assert.equal(
  curriculumResourcesReadUnauthorized.headers.get("X-M4L-Feature"),
  "curriculum-resources-read"
);
assert.equal(curriculumResourcesReadUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");

const curriculumResourcesWriteUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/subject-resources/create",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subjectid: "SUB1",
      resourceName: "Unauthorized Resource",
      resourceType: "PDF",
      resourceLink: "https://example.test/unauthorized"
    })
  }
), {
  M4L_BACKEND_CURRICULUM_RESOURCES_WRITE: "google-sheets"
});
assert.equal(curriculumResourcesWriteUnauthorized.status, 401);
assert.equal(
  curriculumResourcesWriteUnauthorized.headers.get("X-M4L-Feature"),
  "curriculum-resources-write"
);
assert.equal(
  curriculumResourcesWriteUnauthorized.headers.get("X-M4L-Backend"),
  "google-sheets"
);

const studentManagementReadUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/students/search",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listAll: true })
  }
), {
  M4L_BACKEND_STUDENT_MANAGEMENT_READ: "google-sheets"
});
assert.equal(studentManagementReadUnauthorized.status, 401);
assert.equal(
  studentManagementReadUnauthorized.headers.get("X-M4L-Feature"),
  "student-management-read"
);
assert.equal(studentManagementReadUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  studentManagementReadUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

const duplicateReadUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/check-student-duplicate",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Test", whatsapp6: "123456", classgroup: "1" })
  }
), {
  M4L_BACKEND_STUDENT_MANAGEMENT_READ: "google-sheets"
});
assert.equal(duplicateReadUnauthorized.status, 401);
assert.equal(duplicateReadUnauthorized.headers.get("X-M4L-Feature"), "student-management-read");
assert.equal(duplicateReadUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");

const studentManagementUpdateUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/update-student",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uniqueid: "TEST", username: "Unauthorized" })
  }
), {
  M4L_BACKEND_STUDENT_MANAGEMENT_UPDATE: "google-sheets"
});
assert.equal(studentManagementUpdateUnauthorized.status, 401);
assert.equal(
  studentManagementUpdateUnauthorized.headers.get("X-M4L-Feature"),
  "student-management-update"
);
assert.equal(studentManagementUpdateUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  studentManagementUpdateUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

const taskAssignmentReadUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/admin/students/assignment-options",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  }
), {
  M4L_BACKEND_TASK_ASSIGNMENT_READ: "google-sheets"
});
assert.equal(taskAssignmentReadUnauthorized.status, 401);
assert.equal(
  taskAssignmentReadUnauthorized.headers.get("X-M4L-Feature"),
  "task-assignment-read"
);
assert.equal(taskAssignmentReadUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  taskAssignmentReadUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

const progressReadUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/tasks/student",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subjectid: "ALL" })
  }
), {
  M4L_BACKEND_PROGRESS_READ: "google-sheets"
});
assert.equal(progressReadUnauthorized.status, 401);
assert.equal(progressReadUnauthorized.headers.get("X-M4L-Feature"), "progress-read");
assert.equal(progressReadUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  progressReadUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

const progressWriteUnauthorized = await worker.fetch(new Request(
  "https://worker.test/api/tasks/update-complete",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studenttaskid: "STASK1", complete: true })
  }
), {
  M4L_BACKEND_PROGRESS_WRITE: "google-sheets"
});
assert.equal(progressWriteUnauthorized.status, 401);
assert.equal(progressWriteUnauthorized.headers.get("X-M4L-Feature"), "progress-write");
assert.equal(progressWriteUnauthorized.headers.get("X-M4L-Backend"), "google-sheets");
assert.equal(
  progressWriteUnauthorized.headers.get("X-M4L-Backend-Source"),
  "fixed"
);

console.log("Worker router tests passed.");
