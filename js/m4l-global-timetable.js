/* M4L V102.11 - Global Curriculum exact-dated timetable builder and immutable publication UI. */
(function () {
  "use strict";

  const model = {
    active: false,
    loaded: false,
    loading: false,
    selectedRunId: "",
    editingSessionId: "",
    data: emptyData()
  };
  let bound = false;

  function emptyData() {
    return {
      globalTimetableVersion: 0,
      subjects: [], modules: [], runs: [], teachers: [], sessions: [], states: [], publications: []
    };
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
  }

  async function handleClick(event) {
    const closeAction = event.target?.closest?.('#global-curriculum-screen [data-header-action]');
    if (closeAction) { model.active = false; return; }
    const otherTab = event.target?.closest?.('#global-curriculum-screen [data-gcm-action="show-tab"], #global-curriculum-screen [data-gcm-delivery-action="show"]');
    if (otherTab) { model.active = false; return; }

    const target = event.target?.closest?.("[data-gcm-timetable-action]");
    if (!target || !target.closest("#global-curriculum-screen") || target.disabled) return;
    event.preventDefault();
    const action = target.dataset.gcmTimetableAction || "";
    if (action === "show") return show();
    if (!model.active) return;
    if (action === "reload") return load(true);
    if (action === "generate") return generate(target);
    if (action === "edit-session") return beginSessionEdit(target.dataset.sessionId || "");
    if (action === "cancel-edit") return beginSessionEdit("");
    if (action === "save-session") return saveSession(target);
    if (action === "publish") return publish(target);
  }

  function handleChange(event) {
    if (!model.active || !event.target?.closest?.("#global-curriculum-screen")) return;
    if (event.target.id === "gcm-timetable-run") {
      model.selectedRunId = String(event.target.value || "");
      model.editingSessionId = "";
      render();
    }
  }

  async function show() {
    bind();
    model.active = true;
    markTabActive();
    await load(false);
    return true;
  }

  async function load(force) {
    if (model.loading) return false;
    if (model.loaded && !force) { render(); return true; }
    model.loading = true;
    setMessage("Loading exact-dated global timetable…", "");
    setContent('<p class="helper-text">Loading Schedule…</p>');
    try {
      const result = await workflowPost("/api/admin/platform/global/timetable/get", {}, appState()?.token || "");
      if (!result.success) throw new Error(result.detail || result.error || "Unable to load global timetable");
      model.data = {
        globalTimetableVersion: Number(result.globalTimetableVersion) || 0,
        subjects: array(result.subjects),
        modules: array(result.modules),
        runs: array(result.runs),
        teachers: array(result.teachers),
        sessions: array(result.sessions),
        states: array(result.states),
        publications: array(result.publications)
      };
      const activeRuns = model.data.runs.filter(run => run.active);
      if (!model.selectedRunId || !activeRuns.some(run => run.runid === model.selectedRunId)) {
        model.selectedRunId = activeRuns[0]?.runid || "";
      }
      model.loaded = true;
      setMessage("", "");
      render();
      return true;
    } catch (error) {
      setMessage(error.message || "Global timetable unavailable.", "error");
      setContent('<div class="global-curriculum-empty"><h3>Schedule unavailable</h3><p>Complete the V102.11 Platform Sheet migration, set PlatformSchemaVersion to 102.0.6, then run Platform validation.</p><button type="button" data-gcm-timetable-action="reload">Try again</button></div>');
      return false;
    } finally {
      model.loading = false;
    }
  }

  function render() {
    if (!model.active) return;
    markTabActive();
    const version = document.getElementById("global-curriculum-version");
    if (version) version.textContent = `Timetable version ${model.data.globalTimetableVersion || "—"}`;

    const runs = model.data.runs.filter(run => run.active);
    if (!runs.length) {
      setContent('<div class="global-curriculum-empty"><h3>No active delivery runs</h3><p>Create an active Global Subject run in Delivery before scheduling exact dates.</p></div>');
      return;
    }
    const run = selectedRun();
    const subject = subjectById(run?.subjectid);
    const state = stateForRun(run?.runid);
    const sessions = sessionsForRun(run?.runid);
    const editing = sessions.find(session => session.sessionid === model.editingSessionId) || null;
    const publications = publicationsForRun(run?.runid);
    const currentPublication = publications.find(item => item.publicationid === state?.currentpublicationid) || null;

    setContent(`
      <div class="global-timetable-shell">
        <section class="global-curriculum-panel global-timetable-summary">
          <div class="global-curriculum-panel-heading">
            <div><h3>Schedule</h3><p>Exact dated sessions · immutable publication</p></div>
            <button type="button" data-gcm-timetable-action="reload">Reload</button>
          </div>
          <label class="global-curriculum-field"><span>Delivery run</span><select id="gcm-timetable-run">${runOptions(run?.runid)}</select></label>
          ${run ? `<div class="global-timetable-run-meta"><strong>${html(subject?.subjectname || "Global subject")}</strong><span>${html(run.runname)}</span><span>${html(run.startdate)} → ${html(run.enddate)}</span><span>${html(run.timezone)}</span></div>` : ""}
          <div class="global-timetable-badges">
            <span class="global-timetable-badge">${html(state?.stage || "DEVELOPMENT")}</span>
            <span class="global-timetable-badge">${sessions.filter(item => item.active).length} active session${sessions.filter(item => item.active).length === 1 ? "" : "s"}</span>
            ${currentPublication ? `<span class="global-timetable-badge">Published v${Number(currentPublication.versionno) || 1}</span>` : '<span class="global-timetable-badge">Not published</span>'}
          </div>
          <p class="global-curriculum-help">Draft edits never rewrite a published snapshot. Republishing creates a new immutable publication for this run.</p>
        </section>

        <div class="global-timetable-grid">
          <section class="global-curriculum-panel">
            <div class="global-curriculum-panel-heading"><div><h3>Generate dates</h3><p>Create one exact session on each selected weekday inside the run</p></div></div>
            <div class="global-curriculum-form">
              ${field("Module (optional)", `<select id="gcm-timetable-generate-module"><option value="">No module</option>${moduleOptions(run?.subjectid, "")}</select>`)}
              <fieldset class="global-timetable-weekdays"><legend>Repeat on</legend>${weekdayChecks()}</fieldset>
              <div class="global-timetable-two-col">
                ${field("Start time", '<input id="gcm-timetable-generate-start" type="time" />')}
                ${field("End time", '<input id="gcm-timetable-generate-end" type="time" />')}
              </div>
              ${field("Teacher", `<select id="gcm-timetable-generate-teacher">${teacherOptions("")}</select>`)}
              ${field("Zoom override (optional)", '<input id="gcm-timetable-generate-zoom" type="url" inputmode="url" placeholder="https://…" />')}
              <div class="global-curriculum-form-actions"><button type="button" class="global-curriculum-primary" data-gcm-timetable-action="generate">Generate exact dates</button></div>
            </div>
          </section>

          <section class="global-curriculum-panel">
            <div class="global-curriculum-panel-heading"><div><h3>${editing ? "Edit exact session" : "Session details"}</h3><p>${editing ? "Individual dates can be adjusted for holidays and gaps" : "Select a session from the list to edit it"}</p></div></div>
            ${editing ? editForm(editing) : '<p class="global-curriculum-help">Generated sessions are DEVELOPMENT records. Publishing snapshots active sessions only.</p>'}
          </section>
        </div>

        <section class="global-curriculum-panel">
          <div class="global-curriculum-panel-heading"><div><h3>Exact sessions</h3><p>${sessions.length} dated record${sessions.length === 1 ? "" : "s"}</p></div></div>
          ${sessionList(sessions)}
        </section>

        <section class="global-curriculum-panel global-timetable-publish">
          <div>
            <h3>Publish this run</h3>
            <p>The active-session snapshot will be immutable. Later draft edits require another publication.</p>
          </div>
          <button type="button" class="global-curriculum-primary" data-gcm-timetable-action="publish" ${sessions.some(item => item.active) ? "" : "disabled"}>Publish ${sessions.filter(item => item.active).length} active session${sessions.filter(item => item.active).length === 1 ? "" : "s"}</button>
        </section>
      </div>
    `);
  }

  function editForm(session) {
    return `<div class="global-curriculum-form">
      <input id="gcm-timetable-edit-id" type="hidden" value="${attr(session.sessionid)}" />
      ${field("Date", `<input id="gcm-timetable-edit-date" type="date" value="${attr(session.sessiondate)}" />`)}
      <div class="global-timetable-two-col">
        ${field("Start time", `<input id="gcm-timetable-edit-start" type="time" value="${attr(session.starttime)}" />`)}
        ${field("End time", `<input id="gcm-timetable-edit-end" type="time" value="${attr(session.endtime)}" />`)}
      </div>
      ${field("Module (optional)", `<select id="gcm-timetable-edit-module"><option value="">No module</option>${moduleOptions(session.subjectid, session.moduleid)}</select>`)}
      ${field("Teacher", `<select id="gcm-timetable-edit-teacher">${teacherOptions(session.teacheraccountid)}</select>`)}
      ${field("Zoom override (optional)", `<input id="gcm-timetable-edit-zoom" type="url" value="${attr(session.zoomlink)}" placeholder="https://…" />`)}
      <label class="global-curriculum-check"><input id="gcm-timetable-edit-active" type="checkbox" ${session.active ? "checked" : ""} /><span>Active session</span></label>
      <div class="global-curriculum-form-actions">
        <button type="button" class="global-curriculum-secondary" data-gcm-timetable-action="cancel-edit">Cancel</button>
        <button type="button" class="global-curriculum-primary" data-gcm-timetable-action="save-session">Save session</button>
      </div>
    </div>`;
  }

  function sessionList(sessions) {
    if (!sessions.length) return '<div class="global-curriculum-empty"><p>No exact sessions have been generated for this run.</p></div>';
    return `<div class="global-timetable-session-list">${sessions.map(session => `
      <button type="button" class="global-timetable-session ${session.active ? "" : "is-inactive"}" data-gcm-timetable-action="edit-session" data-session-id="${attr(session.sessionid)}">
        <span class="global-timetable-session-date">${html(session.sessiondate)}</span>
        <span>${html(session.starttime)}–${html(session.endtime)}</span>
        <strong>${html(session.modulename || session.subjectname || "Global session")}</strong>
        <span>${html(session.teachername || session.teacheraccountid)}</span>
        ${session.everpublished ? '<small>Previously published</small>' : ""}
        ${session.active ? "" : '<small>Inactive</small>'}
      </button>`).join("")}</div>`;
  }

  async function generate(button) {
    const run = selectedRun();
    if (!run) return setMessage("Select an active run first.", "error");
    const weekdays = [...document.querySelectorAll('[name="gcm-timetable-weekday"]:checked')].map(input => input.value);
    await withBusy(button, "Generating…", async () => {
      const result = await workflowPost("/api/admin/platform/global/timetable/generate", {
        runId: run.runid,
        moduleId: value("gcm-timetable-generate-module"),
        weekdays,
        startTime: value("gcm-timetable-generate-start"),
        endTime: value("gcm-timetable-generate-end"),
        teacherAccountId: value("gcm-timetable-generate-teacher"),
        zoomLink: value("gcm-timetable-generate-zoom")
      }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || result.detail || "Unable to generate sessions");
      model.loaded = false;
      setMessage(result.message || "Sessions generated.", "success");
      await load(true);
    });
  }

  function beginSessionEdit(sessionId) {
    model.editingSessionId = String(sessionId || "");
    render();
  }

  async function saveSession(button) {
    await withBusy(button, "Saving…", async () => {
      const result = await workflowPost("/api/admin/platform/global/timetable/session/save", {
        sessionId: value("gcm-timetable-edit-id"),
        sessionDate: value("gcm-timetable-edit-date"),
        startTime: value("gcm-timetable-edit-start"),
        endTime: value("gcm-timetable-edit-end"),
        moduleId: value("gcm-timetable-edit-module"),
        teacherAccountId: value("gcm-timetable-edit-teacher"),
        zoomLink: value("gcm-timetable-edit-zoom"),
        active: checked("gcm-timetable-edit-active")
      }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || result.detail || "Unable to save session");
      model.editingSessionId = "";
      model.loaded = false;
      setMessage(result.message || "Session saved.", "success");
      await load(true);
    });
  }

  async function publish(button) {
    const run = selectedRun();
    if (!run) return;
    const count = sessionsForRun(run.runid).filter(item => item.active).length;
    if (!window.confirm(`Publish ${count} active exact-dated session${count === 1 ? "" : "s"}? This snapshot will be immutable.`)) return;
    await withBusy(button, "Publishing…", async () => {
      const result = await workflowPost("/api/admin/platform/global/timetable/publish", { runId: run.runid }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || result.detail || "Unable to publish timetable");
      model.loaded = false;
      setMessage(result.message || "Global timetable published.", "success");
      await load(true);
    });
  }

  function selectedRun() { return model.data.runs.find(run => run.runid === model.selectedRunId) || null; }
  function subjectById(subjectId) { return model.data.subjects.find(item => item.subjectid === subjectId) || null; }
  function stateForRun(runId) { return model.data.states.find(item => item.runid === runId) || null; }
  function sessionsForRun(runId) { return model.data.sessions.filter(item => item.runid === runId).sort((a,b) => `${a.sessiondate} ${a.starttime}`.localeCompare(`${b.sessiondate} ${b.starttime}`)); }
  function publicationsForRun(runId) { return model.data.publications.filter(item => item.runid === runId).sort((a,b) => Number(b.versionno)-Number(a.versionno)); }

  function runOptions(selectedId) {
    return model.data.runs.filter(run => run.active).map(run => {
      const subject = subjectById(run.subjectid);
      return `<option value="${attr(run.runid)}" ${run.runid === selectedId ? "selected" : ""}>${html(subject?.subjectname || run.subjectid)} — ${html(run.runname)}</option>`;
    }).join("");
  }
  function moduleOptions(subjectId, selectedId) {
    return model.data.modules.filter(module => module.subjectid === subjectId).map(module => `<option value="${attr(module.moduleid)}" ${module.moduleid === selectedId ? "selected" : ""}>${html(module.modulename)}${module.active ? "" : " — inactive"}</option>`).join("");
  }
  function teacherOptions(selectedId) {
    const options = model.data.teachers.filter(item => item.active).map(teacher => `<option value="${attr(teacher.accountid)}" ${teacher.accountid === selectedId ? "selected" : ""}>${html(teacher.displayname || teacher.accountid)}</option>`).join("");
    return `<option value="" ${selectedId ? "" : "selected"}>Select teacher</option>${options}`;
  }
  function weekdayChecks() {
    return [["MON","Mon"],["TUE","Tue"],["WED","Wed"],["THU","Thu"],["FRI","Fri"],["SAT","Sat"],["SUN","Sun"]]
      .map(([value,label]) => `<label><input type="checkbox" name="gcm-timetable-weekday" value="${value}" /><span>${label}</span></label>`).join("");
  }
  function field(label, control) { return `<label class="global-curriculum-field"><span>${html(label)}</span>${control}</label>`; }

  function markTabActive() {
    document.querySelectorAll("#global-curriculum-screen .global-curriculum-tabs button").forEach(button => {
      button.classList.toggle("is-active", button.dataset.gcmTimetableAction === "show");
    });
  }
  function setMessage(message, type) {
    const element = document.getElementById("global-curriculum-message");
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("is-error", type === "error");
    element.classList.toggle("is-success", type === "success");
  }
  function setContent(markup) {
    const element = document.getElementById("global-curriculum-content");
    if (element) element.innerHTML = markup;
  }
  async function withBusy(button, label, work) {
    const original = button?.textContent || "";
    if (button) { button.disabled = true; button.textContent = label; }
    try { await work(); }
    catch (error) { setMessage(error.message || "Schedule request failed.", "error"); }
    finally { if (button) { button.disabled = false; button.textContent = original; } }
  }
  function value(id) { return String(document.getElementById(id)?.value || "").trim(); }
  function checked(id) { return document.getElementById(id)?.checked === true; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function appState() { return typeof state !== "undefined" && state ? state : null; }
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
  window.M4LGlobalTimetable = Object.freeze({ show, load });
})();
