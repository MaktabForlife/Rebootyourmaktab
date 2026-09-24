/* M4L V105.2 - Program setup contract with timetable-builder capability. */
export const PROGRAM_SCHEMA = "105.1-program";
export const DEFINITION_HEADERS = Object.freeze([
  "CourseID", "DurationYears", "Timezone", "Status", "Revision", "ModifiedDate", "ModifiedByAccountID"
]);
export const IDENTITY_HEADERS = Object.freeze(["CourseID", "SchemaVersion"]);
export const CAPABILITIES = Object.freeze({
  configuration: true, timetable: true, membership: false, curriculum: false,
  library: false, attendance: false, progress: false, planner: false
});
export const clean = value => String(value ?? "").trim();
export const key = value => clean(value).toUpperCase();
export function problem(message, status = 400) {
  return Object.assign(new Error(message), { publicMessage: message, status });
}
export function definition(input) {
  for (const field of ["name", "timezone", "status"]) {
    if (input[field] !== undefined && typeof input[field] !== "string") throw problem(`${field} must be text.`);
  }
  if (input.durationYears !== undefined && !["string", "number"].includes(typeof input.durationYears)) throw problem("Duration must be a number of years.");
  const name = clean(input.name);
  if (!name || name.length > 160) throw problem("Enter a Program name of 1–160 characters.");
  const durationYears = clean(input.durationYears) === "" ? "" : Number(input.durationYears);
  if (durationYears !== "" && (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 30)) {
    throw problem("Duration must be blank or a whole number from 1 to 30 years.");
  }
  const timezone = clean(input.timezone);
  if (timezone) {
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); }
    catch { throw problem("Enter a recognised timezone, for example Asia/Riyadh, or leave it pending."); }
  }
  const status = clean(input.status || "DRAFT");
  if (!["DRAFT", "ARCHIVED"].includes(status)) throw problem("Only Draft or Archived is available during Program setup.");
  if (input.active === true || input.capabilities) throw problem("Teaching capabilities cannot be enabled in V105.1.");
  return { name, durationYears, timezone, status };
}
export function spreadsheetId(value) {
  const text = clean(value);
  const id = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)(?:\/|$)/.exec(text)?.[1] || text;
  if (!/^[\w-]{10,160}$/.test(id)) throw problem("Enter the Google spreadsheet link or ID.");
  return id;
}
export function programId(value) {
  const id = clean(value);
  if (!/^PRG-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw problem("Invalid Program ID. Refresh and create a new draft.");
  return id;
}
export function parseTable(rows, headers, title) {
  if (!rows.length || JSON.stringify(rows[0]) !== JSON.stringify(headers)) {
    throw problem(`${title} has incompatible headers. No data was changed.`, 409);
  }
  return rows.slice(1).map((row, i) => {
    if (row.slice(headers.length).some(value => clean(value))) throw problem(`${title} has unexpected columns.`, 409);
    return { ...Object.fromEntries(headers.map((name, j) => [name, row[j] ?? ""])), _rowNumber: i + 2 };
  }).filter(row => headers.some(name => clean(row[name])));
}
export function assertUnique(records, field, label) {
  const seen = new Set();
  for (const row of records) {
    const id = key(row[field]);
    if (!id || seen.has(id)) throw problem(`${label} contains missing or duplicate identifiers. Resolve this before editing.`, 409);
    seen.add(id);
  }
}
