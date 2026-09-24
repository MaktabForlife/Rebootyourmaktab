/* M4L V105.1 - Preserve legacy budgets; account for the isolated setup adapter. */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testsDir, "../src");
const files = await listJavaScriptFiles(srcDir);
const directCallSites = [];
const batchCallSites = [];

for (const file of files) {
  const text = await readFile(file, "utf8");
  const relative = path.relative(srcDir, file).replaceAll(path.sep, "/");
  collectCalls(text, "readGoogleSheetValues", relative, directCallSites);
  collectCalls(text, "batchReadGoogleSheetValues", relative, batchCallSites);
}

const directOperational = directCallSites.filter(item => !(
  item.file === "lib/google-sheets.js" && item.line.includes("function readGoogleSheetValues")
));
const batchOperational = batchCallSites.filter(item => !(
  item.file === "lib/google-sheets.js" && item.line.includes("function batchReadGoogleSheetValues")
));
// V105.1 adds one isolated repository for explicit administrator setup. Keep
// every existing operational path within its original V104.4 budget.
const programReads = directOperational.filter(item => item.file === "programs/sheets-repository.js");
assert.equal(programReads.length, 1, "Program setup must keep a single direct-read adapter boundary");
const legacyDirect = directOperational.filter(item => item.file !== "programs/sheets-repository.js");
const directFiles = new Set(legacyDirect.map(item => item.file));

assert.ok(
  legacyDirect.length <= 23,
  `V104.4 guardrail: direct Google Sheets read call sites increased above the V104.3 final optimisation baseline (found ${legacyDirect.length}, budget 23)`
);
assert.ok(
  directFiles.size <= 17,
  `V104.4 guardrail: files containing direct read call sites increased above the V104.3 final optimisation baseline (found ${directFiles.size}, budget 17)`
);
assert.ok(
  batchOperational.length >= 15,
  `V104.4 guardrail: batch-read call sites fell below the V104.3 final optimisation baseline (found ${batchOperational.length}, expected at least 15)`
);

console.log(
  `V104.4 read-path audit passed: ${legacyDirect.length} legacy direct call sites across ${directFiles.size} files plus ${programReads.length} isolated Program setup call; ${batchOperational.length} batch-read call sites.`
);

async function listJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listJavaScriptFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".js")) result.push(fullPath);
  }
  return result;
}

function collectCalls(text, functionName, file, output) {
  const lines = text.split(/\r?\n/);
  const needle = `${functionName}(`;
  lines.forEach((line, index) => {
    if (!line.includes(needle)) return;
    output.push({ file, lineNumber: index + 1, line: line.trim() });
  });
}
