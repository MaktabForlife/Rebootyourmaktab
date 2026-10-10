/* M4L V102.10 - Additive Global Curriculum Delivery management UI. */
(function () {
  "use strict";

  const model = {
    loaded: false,
    loading: false,
    active: false,
    selectedSubjectId: "",
    editingRunId: "",
    data: emptyData()
  };
  let bound = false;

  function emptyData() {
    return {
      globalCurriculumVersion: 0,
      subjects: [],
      policies: [],
      runs: []
    };
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", handleDeliveryCapture, true);
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
  }

  function handleDeliveryCapture(event) {
    if (!model.active) return;
    const reload = event.target?.closest?.('#global-curriculum-screen [data-gcm-action="reload"]');
    if (!reload) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void load(true);
  }

  async function handleClick(event) {
    const closeAction = event.target?.closest?.('#global-curriculum-screen [data-header-action]');
    if (closeAction) {
      model.active = false;
      return;
    }
    const otherTab = event.target?.closest?.('#global-curriculum-screen [data-gcm-action="show-tab"], #global-curriculum-screen [data-gcm-timetable-action="show"]');
    if (otherTab) {
      model.active = false;
      return;
    }
    const target = event.target?.closest?.("[data-gcm-delivery-action]");
    if (!target || !target.closest("#global-curriculum-screen") || target.disabled) return;
    event.preventDefault();
    const action = target.dataset.gcmDeliveryAction || "";
    if (action === "show") return show();
    if (!model.active) return;
    if (action === "reload") return load(true);
    if (action === "save-policy") return savePolicy(target);
    if (action === "new-run") return beginRunEdit("");
    if (action === "edit-run") return beginRunEdit(target.dataset.runId || "");
    if (action === "save-run") return saveRun(target);
  }

  function handleChange(event) {
    const target = event.target;
    if (!model.active || !target?.closest?.("#global-curriculum-screen")) return;
    if (target.id === "gcm-delivery-subject") {
      model.selectedSubjectId = String(target.value || "");
      model.editingRunId = "";
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
    if (model.loaded && !force) {
      render();
      return true;
    }
    model.loading = true;
    setMessage("Loading global-subject delivery settings…", "");
    setContent('<p class="helper-text">Loading Delivery…</p>');
    try {
      const result = await workflowPost("/api/admin/platform/global/delivery/get", {}, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "Unable to load Delivery settings");
      model.data = {
        globalCurriculumVersion: Number(result.globalCurriculumVersion) || 0,
        subjects: array(result.subjects),
        policies: array(result.policies),
        runs: array(result.runs)
      };
      if (!model.selectedSubjectId || !model.data.subjects.some(item => item.subjectid === model.selectedSubjectId)) {
        model.selectedSubjectId = model.data.subjects.find(item => item.active)?.subjectid || model.data.subjects[0]?.subjectid || "";
      }
      model.loaded = true;
      setMessage("", "");
      render();
      return true;
    } catch (error) {
      setMessage(error.message || "Unable to load Delivery settings.", "error");
      setContent('<div class="global-curriculum-empty"><h3>Delivery unavailable</h3><p>Check the V102.10 Platform Sheet migration and Platform validation.</p><button type="button" data-gcm-delivery-action="reload">Try again</button></div>');
      return false;
    } finally {
      model.loading = false;
    }
  }

  function render() {
    if (!model.active) return;
    markTabActive();
    const version = document.getElementById("global-curriculum-version");
    if (version) version.textContent = `Curriculum version ${model.data.globalCurriculumVersion || "—"}`;

    if (!model.data.subjects.length) {
      setContent('<div class="global-curriculum-empty"><h3>No global subjects</h3><p>Create a Global Subject first. V102.10 will create its default SUBSCRIPTION policy atomically.</p></div>');
      return;
    }

    const subject = selectedSubject();
    const runs = subjectRuns(subject?.subjectid);
    const editingRun = runs.find(run => run.runid === model.editingRunId) || null;
    const accessModel = String(subject?.accessmodel || "SUBSCRIPTION").toUpperCase();
    const deliveryStatus = String(subject?.deliverystatus || "NOT SCHEDULED").toUpperCase();
    const dependencies = subject?.dependencies || {};
    const defaultTimezone = editingRun?.timezone || "Africa/Johannesburg";

    setContent(`
      <div class="global-delivery-shell">
        <section class="global-delivery-summary global-curriculum-panel">
          <div class="global-curriculum-panel-heading">
            <div><h3>Delivery</h3><p>Access policy and finite teaching runs</p></div>
            <button type="button" data-gcm-delivery-action="reload">Reload</button>
          </div>
          <label class="global-curriculum-field">
            <span>Global subject</span>
            <select id="gcm-delivery-subject">${subjectOptions(subject?.subjectid)}</select>
          </label>
          <div class="global-delivery-badges" aria-label="Current global-subject policy and delivery state">
            ${badge(accessModel, "access")}
            ${badge(deliveryStatus, "status")}
          </div>
          <p class="global-curriculum-help">Run status controls teaching-state presentation only. Ending a run does not deactivate the subject, revoke subscriptions, or hide historical resources.</p>
        </section>

        <div class="global-curriculum-management-grid global-delivery-grid">
          <section class="global-curriculum-panel">
            <div class="global-curriculum-panel-heading"><div><h3>Access policy</h3><p>One active policy per subject</p></div></div>
            <div class="global-curriculum-form">
              <label class="global-curriculum-field">
                <span>Access model</span>
                <select id="gcm-delivery-access-model">
                  <option value="SUBSCRIPTION" ${accessModel === "SUBSCRIPTION" ? "selected" : ""}>SUBSCRIPTION</option>
                  <option value="FREE" ${accessModel === "FREE" ? "selected" : ""}>FREE</option>
                </select>
              </label>
              <p class="global-curriculum-help">FREE is implicit for every active central account. SUBSCRIPTION uses that account’s TRUE/FALSE value in GlobalSubjectAccessMatrix. Matrix values are retained when the policy changes.</p>
              <p class="global-delivery-dependencies">${dependencyText(dependencies)}</p>
              <div class="global-curriculum-form-actions"><button type="button" class="global-curriculum-primary" data-gcm-delivery-action="save-policy">Save Policy</button></div>
            </div>
          </section>

          <section class="global-curriculum-panel">
            <div class="global-curriculum-panel-heading">
              <div><h3>${editingRun ? "Modify run" : "Add run"}</h3><p>Status is derived from dates and timezone</p></div>
              <button type="button" data-gcm-delivery-action="new-run">New</button>
            </div>
            <div class="global-curriculum-form">
              <input id="gcm-delivery-run-id" type="hidden" value="${attr(editingRun?.runid || "")}" />
              ${field("Run name", `<input id="gcm-delivery-run-name" type="text" maxlength="160" value="${attr(editingRun?.runname || "")}" autocomplete="off" placeholder="Term 3 2026" />`)}
              <div class="global-delivery-date-grid">
                ${field("Start date", `<input id="gcm-delivery-start-date" type="date" value="${attr(editingRun?.startdate || "")}" />`)}
                ${field("End date", `<input id="gcm-delivery-end-date" type="date" value="${attr(editingRun?.enddate || "")}" />`)}
              </div>
              ${field("Timezone", `<input id="gcm-delivery-timezone" type="text" value="${attr(defaultTimezone)}" autocomplete="off" spellcheck="false" placeholder="Africa/Johannesburg" />`)}
              <label class="global-curriculum-check"><input id="gcm-delivery-run-active" type="checkbox" ${editingRun?.active === false ? "" : "checked"} /><span>Active run</span></label>
              ${editingRun ? `<p class="global-curriculum-help">Current derived status: <strong>${html(editingRun.status || "INACTIVE")}</strong></p>` : ""}
              <div class="global-curriculum-form-actions">
                ${editingRun ? '<button type="button" class="global-curriculum-secondary" data-gcm-delivery-action="new-run">Cancel</button>' : ""}
                <button type="button" class="global-curriculum-primary" data-gcm-delivery-action="save-run">${editingRun ? "Save Changes" : "Create Run"}</button>
              </div>
            </div>
          </section>
        </div>

        <section class="global-curriculum-panel global-curriculum-panel--wide global-delivery-runs-panel">
          <div class="global-curriculum-panel-heading">
            <div><h3>Runs for ${html(subject?.subjectname || "Global Subject")}</h3><p>${runs.length} record${runs.length === 1 ? "" : "s"}</p></div>
            <button type="button" data-gcm-delivery-action="new-run">New</button>
          </div>
          ${renderRunList(runs)}
        </section>
      </div>
    `);
  }

  async function savePolicy(button) {
    if (model.loading || !selectedSubject()) return false;
    button.disabled = true;
    model.loading = true;
    try {
      const result = await workflowPost("/api/admin/platform/global/policy/save", {
        subjectId: model.selectedSubjectId,
        accessModel: value("gcm-delivery-access-model")
      }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "Unable to save access policy");
      model.loaded = false;
      model.loading = false;
      await load(true);
      setMessage(`${result.message || "Access policy saved."} ${dependencyText(result.dependencies || {})}`, "success");
      return true;
    } catch (error) {
      setMessage(error.message || "Access policy could not be saved.", "error");
      return false;
    } finally {
      model.loading = false;
      button.disabled = false;
    }
  }

  async function saveRun(button) {
    if (model.loading || !selectedSubject()) return false;
    button.disabled = true;
    model.loading = true;
    try {
      const result = await workflowPost("/api/admin/platform/global/run/save", {
        runId: value("gcm-delivery-run-id"),
        subjectId: model.selectedSubjectId,
        runName: value("gcm-delivery-run-name"),
        startDate: value("gcm-delivery-start-date"),
        endDate: value("gcm-delivery-end-date"),
        timezone: value("gcm-delivery-timezone"),
        active: checked("gcm-delivery-run-active")
      }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "Unable to save run");
      model.editingRunId = "";
      model.loaded = false;
      model.loading = false;
      await load(true);
      setMessage(result.message || "Global-subject run saved.", "success");
      return true;
    } catch (error) {
      setMessage(error.message || "Global-subject run could not be saved.", "error");
      return false;
    } finally {
      model.loading = false;
      button.disabled = false;
    }
  }

  function beginRunEdit(runId) {
    model.editingRunId = String(runId || "");
    setMessage("", "");
    render();
  }

  function selectedSubject() {
    return model.data.subjects.find(subject => subject.subjectid === model.selectedSubjectId) || null;
  }

  function subjectRuns(subjectId) {
    return model.data.runs
      .filter(run => run.subjectid === subjectId)
      .sort((left, right) => String(right.startdate || "").localeCompare(String(left.startdate || "")) || String(left.runname || "").localeCompare(String(right.runname || "")));
  }

  function renderRunList(runs) {
    if (!runs.length) return '<p class="global-curriculum-empty-list">No runs have been scheduled for this subject.</p>';
    return `<div class="global-curriculum-record-list global-delivery-run-list">${runs.map(run => `
      <button type="button" class="global-curriculum-record-row ${run.active ? "" : "is-inactive"}" data-gcm-delivery-action="edit-run" data-run-id="${attr(run.runid)}">
        <span>
          <strong>${html(run.runname)}</strong>
          <small>${html(run.startdate)} → ${html(run.enddate)} · ${html(run.timezone)}</small>
        </span>
        <span class="global-delivery-run-state">${badge(run.status || "INACTIVE", "status")}</span>
      </button>
    `).join("")}</div>`;
  }

  function markTabActive() {
    document.querySelectorAll("#global-curriculum-screen .global-curriculum-tabs button").forEach(button => {
      button.classList.toggle("is-active", button.dataset.gcmDeliveryAction === "show");
    });
  }

  function subjectOptions(selectedId) {
    return model.data.subjects.map(subject => `
      <option value="${attr(subject.subjectid)}" ${subject.subjectid === selectedId ? "selected" : ""}>${html(subject.subjectname)}${subject.active ? "" : " — inactive"}</option>
    `).join("");
  }

  function field(label, control) {
    return `<label class="global-curriculum-field"><span>${html(label)}</span>${control}</label>`;
  }

  function badge(text, kind) {
    return `<span class="global-delivery-badge global-delivery-badge--${attr(kind)}">${html(text)}</span>`;
  }

  function dependencyText(dependencies) {
    const subscriptions = Number(dependencies?.subscriptions) || 0;
    const resources = Number(dependencies?.resources) || 0;
    const runs = Number(dependencies?.runs) || 0;
    return `${subscriptions} active subscription${subscriptions === 1 ? "" : "s"}; ${resources} resource${resources === 1 ? "" : "s"}; ${runs} run${runs === 1 ? "" : "s"}.`;
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

  function value(id) {
    return String(document.getElementById(id)?.value || "").trim();
  }

  function checked(id) {
    return document.getElementById(id)?.checked === true;
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function appState() {
    return typeof state !== "undefined" && state ? state : null;
  }

  function html(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function attr(value) {
    return html(value);
  }


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
  window.M4LGlobalDelivery = Object.freeze({ show, load });
})();
