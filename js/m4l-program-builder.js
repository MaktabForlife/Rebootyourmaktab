/* M4L V105.2 - Compact Program grid; explicit row saves, retained failed edits. */
(function () {
  "use strict";
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  const fields = ["name", "durationYears", "timezone", "status", "spreadsheetId"];
  const state = { rows: [], selected: "", busy: false, search: "", filter: "", readiness: {} };
  const dirty = row => !row.saved || fields.some(field => String(row[field] ?? "") !== String(row.saved[field] ?? ""));
  const hasEdits = () => state.rows.some(dirty);
  const draft = program => ({ ...program, saved: { ...program }, error: "" });
  function message(text, error = false) {
    byId("program-message").textContent = text;
    byId("program-message").classList.toggle("is-error", error);
  }
  async function api(action, payload = {}, account = false) {
    const token = localStorage.getItem("m4l_account_token");
    if (!token) throw new Error("Sign in using your personal Academy account link, then open Programs.");
    const response = await fetch(`${String(window.M4L_CONFIG?.API_BASE || "").replace(/\/$/, "")}${account ? "/api/account/session" : `/api/admin/platform/programs/${action}`}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload)
    });
    let result;
    try { result = await response.json(); } catch { throw new Error("The service returned an unreadable response. Your edits are still here."); }
    if (!response.ok || !result.success) throw new Error(result.error || "Could not save. Your edits are still here.");
    return result;
  }
  async function load() {
    state.busy = true;
    busyControls();
    byId("program-retry").hidden = true;
    try {
      const data = await api("list");
      state.rows = data.programs.map(draft);
      state.selected = state.rows.some(row => row.id === state.selected) ? state.selected : (state.rows.find(row => row.mode === "PROGRAM")?.id || "");
      state.readiness = {};
      byId("program-workspace").hidden = false;
      message("Ready. Select a Program to check its spreadsheet.");
    } catch (error) { message(error.message, true); byId("program-retry").hidden = false; }
    finally { state.busy = false; render(); }
  }
  function busyControls() {
    for (const id of ["program-refresh", "program-add"]) byId(id).disabled = state.busy;
  }
  function render() {
    busyControls();
    const rows = state.rows.filter(row => (!state.filter || row.status === state.filter)
      && `${row.name} ${row.id}`.toLowerCase().includes(state.search.toLowerCase()));
    byId("program-count").textContent = `${rows.length} of ${state.rows.length} Programs`;
    byId("program-rows").innerHTML = rows.length ? rows.map((row, index) => renderRow(row, index + 1)).join("")
      : '<tr><td colspan="7" class="pb-empty">No Programs found. Clear your filters or create a new Program.</td></tr>';
    renderDetail();
  }
  function renderRow(row, index) {
    const editable = row.mode === "PROGRAM";
    const input = (field, label, extra = "") => `<input data-field="${field}" aria-label="${escape(label)} for ${escape(row.name || "new Program")}" value="${escape(row[field])}" ${extra} ${!editable ? "readonly" : ""} ${state.busy ? "disabled" : ""} />`;
    return `<tr data-id="${escape(row.id)}" class="${state.selected === row.id ? "is-selected" : ""}">
      <td>${index}</td><td>${input("name", "Program name", 'class="pb-name" maxlength="160"')}</td>
      <td>${editable ? input("durationYears", "Duration in years", 'type="number" min="1" max="30" step="1"') : "—"}</td>
      <td>${editable ? `<select data-field="timezone" aria-label="Timezone for ${escape(row.name || "new Program")}" ${state.busy ? "disabled" : ""}>${window.M4L_TIMEZONES.options(row.timezone)}</select>` : "—"}</td>
      <td>${editable ? `<select data-field="status" aria-label="Status for ${escape(row.name || "new Program")}" ${state.busy ? "disabled" : ""}>${["DRAFT", "ARCHIVED"].map(value => `<option value="${value}" ${row.status === value ? "selected" : ""}>${value === "DRAFT" ? "Draft" : "Archived"}</option>`).join("")}</select>` : escape(row.status === "ACTIVE" ? "Active" : "Inactive")}</td>
      <td>${row.saved ? `<a href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(row.spreadsheetId)}/edit" target="_blank" rel="noopener noreferrer">Open spreadsheet ↗</a>` : input("spreadsheetId", "Spreadsheet link or ID", 'placeholder="Paste Google Sheets link"')} </td>
      <td><div class="pb-actions"><span class="pb-state">${!editable ? "Existing workspace" : row.error ? "Save failed" : dirty(row) ? "Unsaved" : "Saved"}</span>
        ${editable ? `<button type="button" data-action="save" aria-label="Save ${escape(row.name || "new Program")}" title="Save Program" ${state.busy || !dirty(row) ? "disabled" : ""}>▣ Save</button><button type="button" data-action="discard" class="pb-secondary" aria-label="Discard changes to ${escape(row.name || "new Program")}" ${state.busy || !dirty(row) ? "disabled" : ""}>Discard</button><button type="button" data-action="details" class="pb-secondary" aria-label="Details for ${escape(row.name || "new Program")}" ${state.busy ? "disabled" : ""}>Details</button>` : ""}</div>
        ${row.error ? `<span class="pb-row-error" role="alert">${escape(row.error)}</span>` : ""}</td></tr>`;
  }
  function renderDetail() {
    const panel = byId("program-detail");
    const row = state.rows.find(item => item.id === state.selected);
    panel.hidden = !row || row.mode !== "PROGRAM" || (state.filter && row.status !== state.filter)
      || !`${row.name} ${row.id}`.toLowerCase().includes(state.search.toLowerCase());
    if (panel.hidden) return;
    const readiness = state.readiness[row.id];
    panel.innerHTML = `<div class="pb-detail-header"><div><h2>${escape(row.name || "New Program")}</h2><small>${escape(row.id)}</small></div>
      <div class="pb-actions">${row.saved && !dirty(row) ? `<a href="/programs/manage.html?program=${encodeURIComponent(row.id)}">Manage Program →</a><a href="/programs/timetable.html?program=${encodeURIComponent(row.id)}">Open timetable →</a>` : ""}<button type="button" data-action="check" class="pb-secondary" ${state.busy || !row.saved || dirty(row) ? "disabled" : ""}>Check readiness</button>
      <button type="button" data-action="prepare" ${state.busy || !row.saved || dirty(row) || readiness?.prepared ? "disabled" : ""}>Prepare spreadsheet</button></div></div>
      <p>${escape(readiness?.message || (row.saved ? "Check backend access and prepare the Program spreadsheet. Save changes before checking." : "Save this draft to register the Program. Its spreadsheet can then be prepared."))}</p>
      <div class="pb-checks">${(readiness?.checks || [{ label: "Spreadsheet not checked", ok: false }, { label: row.timezone ? "Timezone entered" : "Timezone pending", ok: Boolean(row.timezone) }]).map(check => `<span class="pb-check ${check.ok ? "is-ready" : ""}">${check.ok ? "✓" : "○"} ${escape(check.label)}</span>`).join("")}</div>
      <div class="pb-capabilities" aria-label="Capability availability"><span>✓ Configuration</span><span>✓ Program management</span><span>✓ Timetable builder</span>${["Full curriculum", "Library", "Attendance", "Progress", "Planner"].map(name => `<span>${name} · Later stage</span>`).join("")}</div>`;
  }
  function add() {
    if (state.busy) return;
    const id = `PRG-${crypto.randomUUID()}`;
    state.rows.push({ id, name: "", durationYears: "", timezone: window.M4L_TIMEZONES.defaultZone, status: "DRAFT", spreadsheetId: "", mode: "PROGRAM", saved: null, error: "" });
    state.selected = id;
    state.search = state.filter = "";
    byId("program-search").value = byId("program-filter").value = "";
    render();
    document.querySelector(`[data-id="${id}"] [data-field="name"]`).focus();
    message("New draft. Enter its name and spreadsheet. Timezone defaults to South Africa; change it if needed.");
  }
  async function save(row) {
    if (state.busy || !dirty(row)) return;
    state.busy = true;
    row.error = "";
    message(`Saving ${row.name || "Program"}…`);
    render();
    try {
      const result = await api(row.saved ? "save" : "create", Object.fromEntries(["id", "revision", ...fields].map(field => [field, row[field]])));
      Object.assign(row, draft(result.program));
      delete state.readiness[row.id];
      message(`${row.name} saved. Teaching remains disabled.`);
    } catch (error) { row.error = error.message; message(`Save failed: ${error.message}`, true); }
    finally { state.busy = false; render(); document.querySelector(`[data-id="${row.id}"] [data-field="name"]`)?.focus(); }
  }
  async function readiness(action) {
    const row = state.rows.find(item => item.id === state.selected);
    if (state.busy || !row?.saved || dirty(row)) return;
    state.busy = true;
    message(action === "prepare" ? "Preparing spreadsheet…" : "Checking spreadsheet…");
    render();
    try { state.readiness[row.id] = await api(action === "prepare" ? "prepare" : "readiness", { id: row.id }); message(state.readiness[row.id].message); }
    catch (error) { message(error.message, true); }
    finally { state.busy = false; render(); }
  }
  function edit(event) {
    const control = event.target.closest("[data-field]");
    const row = state.rows.find(item => item.id === control?.closest("[data-id]")?.dataset.id);
    if (!row || row.mode !== "PROGRAM" || state.busy) return;
    row[control.dataset.field] = control.value;
    row.error = "";
    const tr = control.closest("tr");
    tr.querySelector(".pb-state").textContent = dirty(row) ? "Unsaved" : "Saved";
    tr.querySelector('[data-action="save"]').disabled = !dirty(row);
    tr.querySelector('[data-action="discard"]').disabled = !dirty(row);
    tr.querySelector(".pb-row-error")?.remove();
    state.selected = row.id;
    renderDetail();
  }
  async function init() {
    byId("program-add").addEventListener("click", add);
    byId("program-refresh").addEventListener("click", () => {
      if (state.busy) return;
      if (hasEdits()) { byId("program-refresh-warning").hidden = false; byId("program-keep-editing").focus(); }
      else void load();
    });
    byId("program-keep-editing").addEventListener("click", () => { byId("program-refresh-warning").hidden = true; });
    byId("program-discard-refresh").addEventListener("click", () => { byId("program-refresh-warning").hidden = true; if (!state.busy) void load(); });
    byId("program-retry").addEventListener("click", () => { if (!state.busy) void load(); });
    byId("program-search").addEventListener("input", event => { state.search = event.target.value; render(); });
    byId("program-filter").addEventListener("change", event => { state.filter = event.target.value; render(); });
    byId("program-builder").addEventListener("input", edit);
    byId("program-builder").addEventListener("change", edit);
    byId("program-builder").addEventListener("click", event => {
      const button = event.target.closest("[data-action]");
      if (!button || state.busy) return;
      const row = state.rows.find(item => item.id === button.closest("[data-id]")?.dataset.id);
      const action = button.dataset.action;
      if (action === "save" && row) void save(row);
      else if (action === "discard" && row) {
        if (row.saved) Object.assign(row, draft(row.saved));
        else state.rows = state.rows.filter(item => item !== row);
        render(); message("Unsaved row changes discarded.");
      } else if (action === "details" && row) { state.selected = row.id; render(); byId("program-detail").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      else if (["check", "prepare"].includes(action)) void readiness(action);
    });
    byId("program-builder").addEventListener("keydown", event => {
      if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
      const row = state.rows.find(item => item.id === event.target.closest("[data-id]")?.dataset.id);
      if (row) { event.preventDefault(); void save(row); }
    });
    window.addEventListener("beforeunload", event => { if (hasEdits() || state.busy) { event.preventDefault(); event.returnValue = ""; } });
    try {
      const session = await api("", {}, true);
      if (session.account?.uniqueid) byId("academy-link").href = `/account/${encodeURIComponent(session.account.uniqueid)}?switch=1`;
      await load();
    } catch (error) { message(error.message, true); }
  }
  document.addEventListener("DOMContentLoaded", () => void init());
})();
