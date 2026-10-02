import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../../apps-script/code.gs", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(
  new URL("../../apps-script/appsscript.json", import.meta.url),
  "utf8"
));

const EXPECTED_FUNCTIONS = [
  "authorizeM4LServices",
  "doGet",
  "doPost",
  "extractWeeklyPlannerPreviewBase64_",
  "getSystemConfigValue_",
  "getWeeklyPlannerDriveConfig_",
  "jsonResponse",
  "sanitizeWeeklyPlannerDriveFileName_",
  "saveWeeklyPlannerPreviewToDrive",
  "startProgramLibraryUpload",
  "verifyProgramLibraryUploadRequest_"
].sort();

const REMOVED_UTILITY_FUNCTIONS = [
  "createTaskResource",
  "findTaskResourceByTaskAndName",
  "findTaskResourceByTaskAndNameExcludingId",
  "generateAdminId",
  "generateTaskResourceId",
  "generateUniqueId",
  "getAdminByUsername",
  "getStudentTaskById",
  "getStudentTaskSheetRows_",
  "getTaskMapByIds",
  "listTaskResources",
  "populateAllStudentTasks",
  "registerAdmin",
  "reserveStudentTaskIds_",
  "testPopulateAllStudentTasksDryRun",
  "testPopulateAllStudentTasksReal",
  "updateTaskResource"
];

const RETIRED_ROUTE_FUNCTIONS = [
  "assignTasksToStudents",
  "checkStudentDuplicate",
  "createSubject",
  "createSubjectResource",
  "createTask",
  "getAdminByUniqueId",
  "getAttendanceReport",
  "getStudentAssignmentOptions",
  "getStudentByUniqueId",
  "getStudentForLogin",
  "getStudentResources",
  "getStudentTasks",
  "getStudentsForAttendance",
  "getTaskProgressDetail",
  "getTaskProgressReport",
  "getTimetable",
  "listSubjectResources",
  "listSubjects",
  "listTasks",
  "registerStudent",
  "resetStudentPin",
  "searchStudents",
  "setAdminPin",
  "setStudentPin",
  "submitAbsentStudents",
  "updateStudent",
  "updateStudentTaskStatus",
  "updateSubject",
  "updateSubjectResource",
  "updateTask",
  "updateTimetableZoomLink"
];

new vm.Script(code, { filename: "apps-script/code.gs" });

const declaredFunctions = Array.from(
  code.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm),
  match => match[1]
).sort();
assert.deepEqual(
  declaredFunctions,
  EXPECTED_FUNCTIONS,
  "Apps Script must contain only the audited Drive bridge dependency closure"
);

const publicActions = Array.from(new Set([
  ...Array.from(code.matchAll(/case\s+"([^"]+)"\s*:/g), match => match[1]),
  ...Array.from(code.matchAll(/body\.action\s*===\s*"([^"]+)"/g), match => match[1])
])).sort();
assert.deepEqual(
  publicActions,
  ["saveWeeklyPlannerPreviewToDrive", "startProgramLibraryUpload"],
  "doPost must expose only the two Drive bridge actions"
);

for (const functionName of [...REMOVED_UTILITY_FUNCTIONS, ...RETIRED_ROUTE_FUNCTIONS]) {
  assert.doesNotMatch(
    code,
    new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`),
    `${functionName} must remain removed from the final Apps Script bridge`
  );
}

assert.doesNotMatch(code, /LEGACY ROLLBACK|RETIRED ROUTE|ACTIVE UTILITY/);
assert.doesNotMatch(code, /\bcallAppsScript\b|\brequireAdminOrSenior\b|\bgetAuthUser\b/);
assert.doesNotMatch(code, /async\s+function/);
assert.doesNotMatch(
  code,
  /\.(?:appendRow|setValue|setValues|clear|clearContent|deleteRow|insertRowAfter|insertRowsAfter)\s*\(/,
  "The Drive bridge may read SystemConfig but must not write Google Sheets data"
);
assert.match(code, /DriveApp\.getFolderById/);
assert.match(code, /folder\.createFile\(/);
assert.match(code, /WeeklyPlannerDriveFolderId/);
assert.match(code, /WeeklyPlannerDriveFolderLabel/);
assert.ok(code.split("\n").length < 460, "Apps Script should remain a narrow Drive bridge");

assert.equal(manifest.runtimeVersion, "V8");
assert.ok(
  manifest.oauthScopes.includes("https://www.googleapis.com/auth/spreadsheets.currentonly"),
  "The bridge reads the UI-managed Drive destination from the bound SystemConfig sheet"
);
assert.ok(
  manifest.oauthScopes.includes("https://www.googleapis.com/auth/drive"),
  "Weekly Planner submission requires the Drive scope"
);
assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/script.external_request"),
  "Program Library resumable uploads require outbound Drive API requests");

console.log("Apps Script Drive bridge ownership checks passed.");
