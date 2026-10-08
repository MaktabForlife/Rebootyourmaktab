import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relativePath => readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");

const adminHtml = read("admin/index.html");
const styles = read("styles.css");
const manageStudents = read("js/m4l-manage-students.js");
const registrationRoute = read("backend/src/routes/student-registration.js");
const assignmentRoute = read("backend/src/routes/task-assignment.js");

const registerPanelStart = manageStudents.indexOf("function renderRegisterStudentPanel()");
const registerPanelEnd = manageStudents.indexOf("function setRegisterStudentSubmitting", registerPanelStart);
const registerPanel = manageStudents.slice(registerPanelStart, registerPanelEnd);

assert.ok(registerPanelStart >= 0 && registerPanelEnd > registerPanelStart);
assert.match(registerPanel, /Tasks are assigned separately after registration/);
assert.doesNotMatch(registerPanel, /student-assignment-mode/);
assert.doesNotMatch(registerPanel, /student-module-checkbox/);

assert.match(manageStudents, /data-manage-mode="assign"/);
assert.match(manageStudents, /function renderTaskAssignmentPanel\(\)/);
assert.match(manageStudents, /Select all active subjects and modules/);
assert.match(manageStudents, /Select subjects and modules/);
assert.match(manageStudents, /\/api\/admin\/students\/assignment-options/);
assert.match(manageStudents, /\/api\/admin\/tasks\/assign/);
assert.match(manageStudents, /studentids: \[student\.studentid\]/);
assert.match(manageStudents, /selectedModules/);
assert.match(manageStudents, /duplicate[\s\S]*skipped/);
assert.match(manageStudents, /data-manage-action="assign-registered-tasks"/);

assert.doesNotMatch(registrationRoute, /StudentTasks/);
assert.doesNotMatch(registrationRoute, /TaskList/);
assert.doesNotMatch(registrationRoute, /assignInitialStudentTasks/);
assert.match(registrationRoute, /taskAssignmentPending: true/);

assert.match(assignmentRoute, /assignAllTasks/);
assert.match(assignmentRoute, /normalizeSelectedModules/);
assert.match(assignmentRoute, /getActiveTaskIdsByModules/);
assert.match(assignmentRoute, /existingAssignments\.has\(pairKey\)/);
assert.match(assignmentRoute, /All selected tasks were already assigned/);
assert.match(assignmentRoute, /buildStudentTaskRow/);
assert.match(assignmentRoute, /columnIndexToA1\(studentTaskHeaders\.length - 1\)/);

assert.match(adminHtml, /styles\.css\?v=105\.4\.2\.24/);
assert.match(adminHtml, /m4l-manage-students\.js\?v=102\.6\.1/);
assert.match(styles, /m4l-07-manage-students\.css\?v=100\.9/);

console.log("Separate student registration and task-assignment UI tests passed.");
