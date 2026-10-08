import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const adminHtml = readFileSync(new URL("../../admin/index.html", import.meta.url), "utf8");
const manageAdminsJs = readFileSync(new URL("../../js/m4l-manage-admins.js", import.meta.url), "utf8");
const academicsJs = readFileSync(new URL("../../js/m4l-admin-academics.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const manageAdminsCss = readFileSync(new URL("../../css/m4l-20-manage-admins.css", import.meta.url), "utf8");

assert.match(adminHtml, /id="open-manage-admins-btn"/);
assert.match(adminHtml, /id="manage-admins-screen"/);
assert.match(adminHtml, /id="manage-admins-content"/);
assert.match(adminHtml, /m4l-manage-admins\.js\?v=102\.6\.2/);
assert.match(adminHtml, /styles\.css\?v=105\.4\.2\.24/);

assert.match(manageAdminsJs, /getCurrentRole\(\) === "ADMIN"/);
assert.match(manageAdminsJs, /\/api\/admin\/admins\/search/);
assert.match(manageAdminsJs, /\/api\/admin\/register-admin/);
assert.match(manageAdminsJs, /\/api\/admin\/update-admin/);
assert.match(manageAdminsJs, /\/api\/admin\/reset-admin-pin/);
assert.match(manageAdminsJs, /you can change only your own display name/i);
assert.match(manageAdminsJs, /Their existing sessions will stop working/);
assert.match(manageAdminsJs, /function getAdminRoleLabel\(role\)/);
assert.match(manageAdminsJs, /value="SENIOR">SENIOR TEACHER<\/option>/);
assert.match(manageAdminsJs, /data-uniqueid=/);
assert.match(manageAdminsJs, /function selectAdmin\(uniqueid, adminid\)/);
assert.match(manageAdminsJs, /uniqueid: admin\.uniqueid/);
assert.match(manageAdminsJs, /manageAdminsState\.submitting = false;[\s\S]*manageAdminsState\.registeredAdmin = null;/);
assert.match(manageAdminsJs, /function initialiseManageAdmins\(\)[\s\S]*bindHandlers\(\);[\s\S]*syncAccess\(\);/);
assert.match(academicsJs, /M4LManageAdmins\.syncAccess/);
assert.match(styles, /m4l-20-manage-admins\.css\?v=100\.3\.0/);
assert.match(manageAdminsCss, /managed-admin-list/);

assert.equal(
  existsSync(new URL("../src/routes/auth.js", import.meta.url)),
  false,
  "The retired Apps Script authentication route must remain deleted"
);

console.log("Admin management UI integration tests passed.");
