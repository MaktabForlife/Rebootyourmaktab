/* M4L V102.12.8 - Academic Calendar compact-toolbar and responsive section-level batch editing. */
(function () {
  "use strict";

  const NEW_KEY = "__new__";
  const model = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    events: [],
    storedEvents: [],
    loaded: false,
    loading: false,
    newTerm: false,
    newPublicHoliday: false,
    drafts: {
      TERM: new Map(),
      ISLAMIC_DAY: new Map(),
      PUBLIC_HOLIDAY: new Map()
    },
    deletedPublicHolidays: new Map()
  };
  let bound = false;

  function role() {
    return String(typeof state !== "undefined" && state?.user?.role || "").trim().toUpperCase();
  }
  function allowed() { return ["ADMIN", "GLOBAL_ADMIN"].includes(role()); }

  function syncAccess() {
    const button = document.getElementById("open-academy-calendar-btn");
    const ok = allowed();
    if (button) {
      button.classList.toggle("hidden", !ok);
      button.disabled = !ok;
      button.setAttribute("aria-hidden", ok ? "false" : "true");
    }
    return ok;
  }

  async function show() {
    if (!syncAccess()) {
      alert("Academic Calendar is available to ADMIN and GLOBAL_ADMIN accounts only.");
      return false;
    }
    bind();
    if (typeof showScreen !== "function" || !showScreen("academy-calendar-screen")) return false;
    await load(true);
    return true;
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    document.addEventListener("input", handleInput);
  }

  async function handleClick(event) {
    const target = event.target?.closest?.("[data-academy-calendar-action]");
    if (!target || target.disabled) return;
    const action = target.dataset.academyCalendarAction || "";
    if (action === "open") { event.preventDefault(); return show(); }
    if (!target.closest("#academy-calendar-screen")) return;
    event.preventDefault();

    if (action === "reload") {
      if (!confirmDiscardPending()) return;
      resetAllDrafts();
      return load(true);
    }
    if (action === "prev-month") return moveMonth(-1);
    if (action === "next-month") return moveMonth(1);
    if (action === "today") return goToday();
    if (action === "add-term") {
      captureAllDrafts();
      model.newTerm = true;
      return render();
    }
    if (action === "cancel-new-term") {
      model.drafts.TERM.delete(NEW_KEY);
      model.newTerm = false;
      return render();
    }
    if (action === "save-terms") return saveSection("TERM", target);
    if (action === "save-islamic") return saveSection("ISLAMIC_DAY", target);
    if (action === "add-public") {
      captureAllDrafts();
      model.newPublicHoliday = true;
      return render();
    }
    if (action === "cancel-new-public") {
      model.drafts.PUBLIC_HOLIDAY.delete(NEW_KEY);
      model.newPublicHoliday = false;
      return render();
    }
    if (action === "save-public") return saveSection("PUBLIC_HOLIDAY", target);
    if (action === "delete-public") return markHolidayDeleted(target);
  }

  function handleChange(event) {
    if (!event.target?.closest?.("#academy-calendar-screen")) return;
    if (event.target.id === "academy-calendar-year") {
      const nextYear = Number(event.target.value) || new Date().getFullYear();
      if (nextYear === model.year) return;
      captureAllDrafts();
      if (!confirmDiscardPending()) {
        event.target.value = model.year;
        return;
      }
      resetAllDrafts();
      model.year = nextYear;
      model.newTerm = false;
      model.newPublicHoliday = false;
      void load(true);
      return;
    }
    const row = event.target.closest("[data-calendar-row]");
    if (row) captureRowDraft(row);
  }

  function handleInput(event) {
    if (!event.target?.closest?.("#academy-calendar-screen")) return;
    const row = event.target.closest("[data-calendar-row]");
    if (row) captureRowDraft(row);
  }

  async function load(force) {
    if (model.loading || !allowed()) return false;
    if (model.loaded && !force) { render(); return true; }
    model.loading = true;
    setMessage("Loading Academic Calendar…", "");
    setContent('<p class="helper-text">Loading Academic Calendar…</p>');
    try {
      const result = await workflowPost("/api/admin/platform/calendar/get", { year: model.year });
      if (!result.success) throw new Error(result.detail || result.error || "Unable to load Academic Calendar");
      model.events = array(result.events);
      model.storedEvents = array(result.storedEvents);
      model.loaded = true;
      render();
      setMessage("", "");
      return true;
    } catch (error) {
      setMessage(error.message || "Academic Calendar unavailable.", "error");
      setContent('<div class="academy-calendar-empty"><strong>Academic Calendar unavailable</strong><button type="button" data-academy-calendar-action="reload">Try again</button></div>');
      return false;
    } finally {
      model.loading = false;
    }
  }

  function render() {
    setContent(`
      <div class="academy-calendar-shell">
        <div class="academy-calendar-toolbar">
          <div class="academy-calendar-month-actions">
            <button type="button" class="academy-calendar-icon-button" data-academy-calendar-action="prev-month" aria-label="Previous month" title="Previous month">‹</button>
            <strong>${html(monthName(model.month))} ${model.year}</strong>
            <button type="button" class="academy-calendar-icon-button" data-academy-calendar-action="next-month" aria-label="Next month" title="Next month">›</button>
          </div>
          <button type="button" class="academy-calendar-today-button" data-academy-calendar-action="today">Today</button>
          <label class="academy-calendar-year-field"><span>Year</span><input id="academy-calendar-year" type="number" min="2025" max="2100" value="${model.year}" /></label>
        </div>
        ${monthGrid()}
        ${termsPanel()}
        <div class="academy-calendar-reference-grid">
          ${islamicPanel()}
          ${publicHolidayPanel()}
        </div>
      </div>
    `);
    requestAnimationFrame(() => {
      if (model.newTerm) document.querySelector('[data-new-calendar-row="term"] [data-field="description"]')?.focus();
      if (model.newPublicHoliday) document.querySelector('[data-new-calendar-row="public"] [data-field="startDate"]')?.focus();
      updateSectionSaveButtons();
    });
  }

  function monthGrid() {
    const first = new Date(Date.UTC(model.year, model.month, 1));
    const daysInMonth = new Date(Date.UTC(model.year, model.month + 1, 0)).getUTCDate();
    const firstMondayIndex = (first.getUTCDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < firstMondayIndex; i += 1) cells.push('<div class="academy-calendar-day is-blank" aria-hidden="true"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = iso(model.year, model.month + 1, day);
      const events = eventsOn(date);
      const today = date === todayIso();
      cells.push(`<div class="academy-calendar-day ${today ? "is-today" : ""}">
        <span class="academy-calendar-day-number">${day}</span>
        <div class="academy-calendar-day-events">${events.map(calendarChip).join("")}</div>
      </div>`);
    }
    return `<section class="academy-calendar-panel academy-calendar-month academy-calendar-full-width">
      <div class="academy-calendar-weekdays">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => `<span>${day}</span>`).join("")}</div>
      <div class="academy-calendar-grid">${cells.join("")}</div>
    </section>`;
  }

  function calendarChip(event) {
    const cls = `is-${String(event.eventType || "event").toLowerCase().replace(/_/g,"-")}`;
    const secondary = String(event.eventType || "").toUpperCase() === "ISLAMIC_DAY" && event.islamicDate
      ? `<small>${html(event.islamicDate)}</small>` : "";
    return `<span class="academy-calendar-chip ${cls}" title="${attr(event.description)}"><span>${html(event.description)}</span>${secondary}</span>`;
  }

  function termsPanel() {
    const terms = model.storedEvents
      .filter(event => event.eventType === "TERM" && overlapsYear(event))
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    const rows = terms.map(termRow).join("");
    const newRow = model.newTerm ? termRow({ id: "", description: "", startDate: "", endDate: "", active: true }, true) : "";
    return `<section class="academy-calendar-panel academy-calendar-terms academy-calendar-full-width">
      <div class="academy-calendar-panel-heading">
        <h3>Terms</h3>
        <div class="academy-calendar-heading-actions">
          ${saveButton("Save Terms", "save-terms", sectionHasPending("TERM"))}
          <button type="button" class="academy-calendar-icon-button" data-academy-calendar-action="add-term" aria-label="Add term" title="Add term">+</button>
        </div>
      </div>
      <div class="academy-calendar-table-wrap"><table class="academy-calendar-table academy-calendar-inline-table"><thead><tr><th>Term</th><th>Start</th><th>End</th><th>Status</th><th class="academy-calendar-action-column"></th></tr></thead><tbody>
        ${rows || (!model.newTerm ? '<tr><td colspan="5" class="academy-calendar-empty-row">No terms have been set up for this year.</td></tr>' : "")}${newRow}
      </tbody></table></div>
    </section>`;
  }

  function termRow(event, isNew) {
    const draft = draftFor("TERM", event, isNew);
    const key = isNew ? NEW_KEY : event.id;
    const dirty = model.drafts.TERM.has(key);
    return `<tr class="${dirty ? "is-dirty" : ""}" data-calendar-row data-event-type="TERM" data-event-id="${attr(event.id || "")}" ${isNew ? 'data-new-calendar-row="term"' : ""}>
      <td data-label="Term"><input class="academy-calendar-inline-input" data-field="description" type="text" maxlength="120" value="${attr(draft.description)}" aria-label="Term name" /></td>
      <td data-label="Start"><input class="academy-calendar-inline-input" data-field="startDate" type="date" value="${attr(draft.startDate)}" aria-label="Term start date" /></td>
      <td data-label="End"><input class="academy-calendar-inline-input" data-field="endDate" type="date" value="${attr(draft.endDate)}" aria-label="Term end date" /></td>
      <td data-label="Status">${activeSelect(draft.active !== false)}</td>
      <td class="academy-calendar-inline-actions">${isNew ? iconButton("×", "cancel-new-term", "Cancel new term") : ""}</td>
    </tr>`;
  }

  function islamicPanel() {
    const events = model.storedEvents
      .filter(event => event.eventType === "ISLAMIC_DAY" && event.description !== "First Fast" && String(event.startDate).startsWith(`${model.year}-`))
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    return `<section class="academy-calendar-panel academy-calendar-islamic-panel">
      <div class="academy-calendar-panel-heading">
        <h3>Islamic Dates</h3>
        ${saveButton("Save Islamic Dates", "save-islamic", sectionHasPending("ISLAMIC_DAY"))}
      </div>
      <div class="academy-calendar-inline-list">
        ${events.length ? events.map(islamicRow).join("") : '<div class="academy-calendar-empty-row">No Islamic reference dates are stored for this year.</div>'}
      </div>
    </section>`;
  }

  function islamicRow(event) {
    const draft = draftFor("ISLAMIC_DAY", event, false);
    const dirty = model.drafts.ISLAMIC_DAY.has(event.id);
    return `<div class="academy-calendar-inline-item academy-calendar-islamic-row ${dirty ? "is-dirty" : ""}" data-calendar-row data-event-type="ISLAMIC_DAY" data-event-id="${attr(event.id)}">
      <div class="academy-calendar-islamic-name">
        <strong>${html(event.description)}</strong>
        ${event.islamicDate ? `<small>${html(event.islamicDate)}</small>` : ""}
      </div>
      <div class="academy-calendar-islamic-fields">
        ${compactField("Date", `<input data-field="startDate" type="date" value="${attr(draft.startDate)}" aria-label="${attr(event.description)} date" />`)}
      </div>
    </div>`;
  }

  function publicHolidayPanel() {
    const events = model.events
      .filter(event => event.eventType === "PUBLIC_HOLIDAY" && String(event.startDate).startsWith(`${model.year}-`))
      .filter(event => !model.deletedPublicHolidays.has(event.id))
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    const newRow = model.newPublicHoliday ? publicHolidayRow({ id: "", description: "Public Holiday", startDate: "" }, true) : "";
    return `<section class="academy-calendar-panel academy-calendar-public-panel">
      <div class="academy-calendar-panel-heading">
        <h3>Holidays</h3>
        ${saveButton("Save Holidays", "save-public", sectionHasPending("PUBLIC_HOLIDAY"))}
      </div>
      <div class="academy-calendar-inline-list academy-calendar-public-list">
        ${events.length ? events.map(event => publicHolidayRow(event, false)).join("") : (!model.newPublicHoliday ? '<div class="academy-calendar-empty-row">No Holidays are active for this year.</div>' : "")}
        ${newRow}
      </div>
      <button type="button" class="academy-calendar-add-after-list" data-academy-calendar-action="add-public" aria-label="Add Holiday" title="Add Holiday">+</button>
    </section>`;
  }

  function publicHolidayRow(event, isNew) {
    const draft = draftFor("PUBLIC_HOLIDAY", event, isNew);
    const key = isNew ? NEW_KEY : event.id;
    const dirty = model.drafts.PUBLIC_HOLIDAY.has(key);
    return `<div class="academy-calendar-inline-item academy-calendar-public-row ${dirty ? "is-dirty" : ""}" data-calendar-row data-event-type="PUBLIC_HOLIDAY" data-event-id="${attr(event.id || "")}" data-original-date="${attr(event.startDate || "")}" ${isNew ? 'data-new-calendar-row="public"' : ""}>
      <input class="academy-calendar-inline-input" data-field="description" type="text" maxlength="120" value="${attr(draft.description || "Public Holiday")}" aria-label="Holiday description" />
      <input class="academy-calendar-inline-input" data-field="startDate" type="date" value="${attr(draft.startDate)}" aria-label="Holiday date" />
      <div class="academy-calendar-inline-actions">
        ${iconButton("×", isNew ? "cancel-new-public" : "delete-public", isNew ? "Cancel new Holiday" : "Remove Holiday", event.id || "")}
      </div>
    </div>`;
  }

  function captureAllDrafts() {
    document.querySelectorAll("#academy-calendar-screen [data-calendar-row]").forEach(captureRowDraft);
  }

  function captureRowDraft(row) {
    const type = String(row.dataset.eventType || "").toUpperCase();
    const map = model.drafts[type];
    if (!map) return;
    const eventId = String(row.dataset.eventId || "");
    const key = eventId || NEW_KEY;
    const current = currentRowDraft(row, type, eventId);
    const baseline = baselineFor(type, eventId);
    const dirty = !baseline || draftDiffers(type, current, baseline);
    if (dirty) map.set(key, current);
    else map.delete(key);
    row.classList.toggle("is-dirty", dirty);
    updateSectionSaveButtons();
  }

  function currentRowDraft(row, type, eventId) {
    if (type === "TERM") return {
      eventId,
      eventType: type,
      description: rowValue(row, "description"),
      startDate: rowValue(row, "startDate"),
      endDate: rowValue(row, "endDate"),
      teachingImpact: "INFORMATION",
      active: rowValue(row, "active") === "TRUE"
    };
    if (type === "ISLAMIC_DAY") return {
      eventId,
      eventType: type,
      startDate: rowValue(row, "startDate")
    };
    return {
      eventId,
      eventType: "PUBLIC_HOLIDAY",
      originalDate: String(row.dataset.originalDate || ""),
      description: rowValue(row, "description") || "Public Holiday",
      startDate: rowValue(row, "startDate"),
      endDate: rowValue(row, "startDate"),
      active: true
    };
  }

  function baselineFor(type, eventId) {
    if (!eventId) return null;
    const source = type === "PUBLIC_HOLIDAY" ? model.events : model.storedEvents;
    return source.find(event => event.id === eventId) || null;
  }

  function draftFor(type, event, isNew) {
    const key = isNew ? NEW_KEY : event.id;
    const draft = model.drafts[type]?.get(key);
    return { ...event, ...(draft || {}) };
  }

  function draftDiffers(type, draft, baseline) {
    if (type === "ISLAMIC_DAY") return String(draft.startDate || "") !== String(baseline.startDate || "");
    if (type === "TERM") return ["description", "startDate", "endDate"].some(key => String(draft[key] ?? "") !== String(baseline[key] ?? "")) || Boolean(draft.active) !== (baseline.active !== false);
    return String(draft.description || "") !== String(baseline.description || "") || String(draft.startDate || "") !== String(baseline.startDate || "");
  }

  function markHolidayDeleted(button) {
    captureAllDrafts();
    const row = button.closest("[data-calendar-row]");
    if (!row) return;
    if (!row.dataset.eventId) {
      model.drafts.PUBLIC_HOLIDAY.delete(NEW_KEY);
      model.newPublicHoliday = false;
      render();
      return;
    }
    const eventId = row.dataset.eventId;
    const baseline = baselineFor("PUBLIC_HOLIDAY", eventId);
    model.drafts.PUBLIC_HOLIDAY.delete(eventId);
    model.deletedPublicHolidays.set(eventId, {
      eventId,
      eventType: "PUBLIC_HOLIDAY",
      originalDate: row.dataset.originalDate || baseline?.startDate || "",
      startDate: baseline?.startDate || row.dataset.originalDate || rowValue(row, "startDate"),
      active: false
    });
    setMessage("Holiday marked for removal. Save Holidays to apply.", "");
    render();
  }

  async function saveSection(type, button) {
    captureAllDrafts();
    const map = model.drafts[type];
    const changes = map ? [...map.values()] : [];
    if (type === "PUBLIC_HOLIDAY") changes.push(...model.deletedPublicHolidays.values());
    if (!changes.length) {
      setMessage("No changes to save.", "");
      updateSectionSaveButtons();
      return;
    }
    const validation = validateDrafts(type, changes);
    if (validation) {
      setMessage(validation, "error");
      return;
    }

    button.disabled = true;
    button.classList.add("is-saving");
    try {
      const result = await workflowPost("/api/admin/platform/calendar/batch-save", { changes });
      if (!result.success) throw new Error(result.detail || result.error || "Unable to save Academic Calendar changes");
      clearSectionDrafts(type);
      model.loaded = false;
      await load(true);
      setMessage(result.message || "Academic Calendar changes saved.", "success");
    } catch (error) {
      setMessage(error.message || "Unable to save Academic Calendar changes.", "error");
    } finally {
      button.disabled = false;
      button.classList.remove("is-saving");
      updateSectionSaveButtons();
    }
  }

  function validateDrafts(type, changes) {
    for (const change of changes) {
      if (type === "TERM") {
        if (!String(change.description || "").trim()) return "Every Term requires a name.";
        if (!change.startDate || !change.endDate) return "Every Term requires a start and end date.";
        if (change.endDate < change.startDate) return "A Term end date cannot be before its start date.";
      } else if (type === "ISLAMIC_DAY") {
        if (!change.startDate) return "Every Islamic Date requires a date.";
      } else if (change.active !== false) {
        if (!String(change.description || "").trim()) return "Every Holiday requires a description.";
        if (!change.startDate) return "Every Holiday requires a date.";
      }
    }
    return "";
  }

  function sectionHasPending(type) {
    if (type === "TERM") return model.drafts.TERM.size > 0 || model.newTerm;
    if (type === "ISLAMIC_DAY") return model.drafts.ISLAMIC_DAY.size > 0;
    return model.drafts.PUBLIC_HOLIDAY.size > 0 || model.deletedPublicHolidays.size > 0 || model.newPublicHoliday;
  }

  function hasAnyPending() {
    return sectionHasPending("TERM") || sectionHasPending("ISLAMIC_DAY") || sectionHasPending("PUBLIC_HOLIDAY");
  }

  function updateSectionSaveButtons() {
    const root = document.getElementById("academy-calendar-screen");
    if (!root) return;
    [["save-terms", "TERM"], ["save-islamic", "ISLAMIC_DAY"], ["save-public", "PUBLIC_HOLIDAY"]].forEach(([action, type]) => {
      const button = root.querySelector(`[data-academy-calendar-action="${action}"]`);
      if (!button || button.classList.contains("is-saving")) return;
      const pending = sectionHasPending(type);
      button.disabled = !pending;
      button.classList.toggle("has-pending-changes", pending);
    });
  }

  function clearSectionDrafts(type) {
    model.drafts[type]?.clear();
    if (type === "TERM") model.newTerm = false;
    if (type === "PUBLIC_HOLIDAY") {
      model.newPublicHoliday = false;
      model.deletedPublicHolidays.clear();
    }
  }

  function resetAllDrafts() {
    Object.values(model.drafts).forEach(map => map.clear());
    model.deletedPublicHolidays.clear();
    model.newTerm = false;
    model.newPublicHoliday = false;
  }

  function confirmDiscardPending() {
    captureAllDrafts();
    if (!hasAnyPending()) return true;
    return typeof window.confirm !== "function" || window.confirm("Discard unsaved Academic Calendar changes?");
  }

  function moveMonth(delta) {
    captureAllDrafts();
    if (!confirmDiscardPending()) return;
    resetAllDrafts();
    let month = model.month + delta;
    let year = model.year;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    model.month = month;
    const yearChanged = year !== model.year;
    model.year = year;
    if (yearChanged) void load(true);
    else render();
  }

  function goToday() {
    captureAllDrafts();
    if (!confirmDiscardPending()) return;
    resetAllDrafts();
    const now = new Date();
    const nextYear = now.getFullYear();
    model.month = now.getMonth();
    if (nextYear !== model.year) {
      model.year = nextYear;
      void load(true);
    } else {
      render();
    }
  }

  function activeSelect(active) {
    return `<select class="academy-calendar-inline-select" data-field="active" aria-label="Status"><option value="TRUE" ${active ? "selected" : ""}>ACTIVE</option><option value="FALSE" ${active ? "" : "selected"}>INACTIVE</option></select>`;
  }

  function compactField(label, control) {
    return `<label class="academy-calendar-compact-field"><span>${html(label)}</span>${control}</label>`;
  }

  function saveButton(label, action, pending) {
    return `<button type="button" class="global-save-icon-button academy-calendar-save ${pending ? "has-pending-changes" : ""}" data-academy-calendar-action="${attr(action)}" aria-label="${attr(label)}" title="${attr(label)}" ${pending ? "" : "disabled"}><span class="app-icon app-icon-small save-mode-icon" aria-hidden="true"></span><span class="global-save-icon-label">SAVE</span></button>`;
  }

  function iconButton(glyph, action, label, id) {
    return `<button type="button" class="academy-calendar-icon-button" data-academy-calendar-action="${action}" data-event-id="${attr(id || "")}" aria-label="${attr(label)}" title="${attr(label)}">${html(glyph)}</button>`;
  }

  function rowValue(row, name) {
    return String(row.querySelector(`[data-field="${name}"]`)?.value || "").trim();
  }
  function eventsOn(date) { return model.events.filter(event => event.startDate <= date && event.endDate >= date); }
  function overlapsYear(event) { return String(event.startDate || "") <= `${model.year}-12-31` && String(event.endDate || "") >= `${model.year}-01-01`; }
  async function apiPost(path, body) { const token = typeof state !== "undefined" && state?.token || ""; return window.M4LAuth.apiPost(path, body, token); }
  function setContent(markup) { const root = document.getElementById("academy-calendar-content"); if (root) root.innerHTML = markup; }
  function setMessage(text, type) { const root = document.getElementById("academy-calendar-message"); if (!root) return; root.textContent = text || ""; root.classList.toggle("is-error", type === "error"); root.classList.toggle("is-success", type === "success"); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function monthName(index) { return ["January","February","March","April","May","June","July","August","September","October","November","December"][index] || ""; }
  function iso(year, month, day) { return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`; }
  function todayIso() { const d = new Date(); return iso(d.getFullYear(), d.getMonth()+1, d.getDate()); }
  function html(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
  function attr(value) { return html(value); }


  // D1 writes retain their identifier after an uncertain response. A changed
  // draft gets a new identifier; successful steps advance the saved revision.
  let workflowRevision = null;
  const pendingWorkflowChanges = new Map();
  async function workflowPost(path, body, token) {
    const writing = !path.endsWith("/get");
    let input = body;
    let retryKey = "";
    if (writing && workflowRevision !== null) {
      retryKey = JSON.stringify([path, body, workflowRevision]);
      if (!pendingWorkflowChanges.has(retryKey)) pendingWorkflowChanges.set(retryKey, crypto.randomUUID());
      input = { ...body, workflowRevision, operationId: pendingWorkflowChanges.get(retryKey) };
    }
    const result = await apiPost(path, input, token);
    if (result.success && result.workflowStore === "D1") workflowRevision = String(result.workflowRevision);
    if (result.success && retryKey) pendingWorkflowChanges.delete(retryKey);
    return result;
  }

  bind();
  window.M4LAcademyCalendar = Object.freeze({ show, load, syncAccess });
})();
