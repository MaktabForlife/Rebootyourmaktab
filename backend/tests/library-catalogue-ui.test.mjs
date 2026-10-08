import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = relative => readFileSync(new URL(relative, import.meta.url), "utf8");
const resources = read("../../js/m4l-resources.js");
const styles = read("../../css/m4l-04-library-resources.css");
const admin = read("../../admin/index.html");
const student = read("../../student/index.html");

for (const html of [admin, student]) {
  assert.match(html, /id="library-source-selector"/);
  assert.match(html, /m4l-resources\.js\?v=105\.4\.2\.22/);
}
assert.match(admin, /styles\.css\?v=104\.5/);
assert.match(student, /styles\.css\?v=103\.1\.0\.5/);

assert.match(resources, /\/api\/library\/catalogue/);
assert.match(resources, /\/api\/library\/course-resource\/access/);
assert.match(resources, /\/api\/platform\/global\/resources\/access/);
assert.match(resources, /function renderLibrarySourceSelector/);
assert.match(resources, /function buildSelectedLibraryCatalogue/);
assert.match(resources, /selectedLibrarySourceId = "ALL"/);
assert.match(resources, /data-library-source-id/);
assert.match(resources, /library-global-badge/);
assert.doesNotMatch(
  resources.slice(resources.indexOf("function selectLibrarySource"), resources.indexOf("function buildSelectedLibraryCatalogue")),
  /switch-context|switchUnifiedAccountContext/,
  "Selecting a Library source must not change the operational course or role"
);
assert.match(styles, /\.library-source-menu/);
assert.match(styles, /\.library-source-menu__item\.is-active/);
assert.match(styles, /\.library-global-badge/);
assert.match(styles, /grid-template-columns:\s*repeat\(var\(--library-source-count, 1\), minmax\(0, 1fr\)\)/);
assert.match(styles, /@media \(max-width: 720px\)/);
const sourceMenuStyles = styles.slice(
  styles.indexOf(".library-source-menu {"),
  styles.indexOf(".library-resource-browser")
);
assert.doesNotMatch(sourceMenuStyles, /overflow-x:\s*auto/);

console.log("V102.8.1 unified Library source-selector UI tests passed.");
