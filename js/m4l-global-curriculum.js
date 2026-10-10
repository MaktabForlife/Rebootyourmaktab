/* M4L V103.1.0.3 - Inline Global Subject/Module and Global Resource batch editors; protected Drive resources retained. */
(function () {
  "use strict";

  const RESOURCE_TYPES = ["EBOOK", "PRINTABLE", "AUDIO", "VIDEO", "OTHER"];
  const model = {
    loaded: false,
    loading: false,
    tab: "subjects",
    editing: {
      subjects: "",
      modules: "",
      tasks: "",
      resources: "",
      access: ""
    },
    resourceDrafts: [],
    resourceOpen: new Set(),
    resourceDraftSequence: 0,
    resourceFilters: { name: "", subject: "", type: "", status: "" },
    subjectDrafts: [],
    moduleDrafts: [],
    subjectModulesOpen: new Set(),
    subjectDraftSequence: 0,
    moduleDraftSequence: 0,
    drive: {
      open: false,
      loading: false,
      data: null,
      resourceKey: ""
    },
    data: emptyData()
  };
  let handlersBound = false;

  function emptyData() {
    return {
      globalCurriculumVersion: 0,
      subjects: [],
      modules: [],
      tasks: [],
      resources: [],
      accounts: [],
      subjectAccessMatrix: { subjects: [], policies: {}, rows: [] },
      globalResourceDriveRoot: {
        configured: false,
        folderid: "",
        folderurl: "",
        foldername: "",
        canconfigure: false
      }
    };
  }

  function isGlobalAdmin() {
    const user = appState()?.user || {};
    return String(user.platformrole || user.role || "").trim().toUpperCase() === "GLOBAL_ADMIN";
  }

  function hasGlobalCurriculumAuthority() {
    const user = appState()?.user || {};
    return String(user.platformrole || "").trim().toUpperCase() === "GLOBAL_ADMIN" ||
      String(user.role || "").trim().toUpperCase() === "ADMIN";
  }

  function syncAccess() {
    const allowed = hasGlobalCurriculumAuthority();
    document.querySelectorAll("[data-global-curriculum-admin]").forEach(button => {
      button.classList.toggle("hidden", !allowed);
      button.disabled = !allowed;
      button.setAttribute("aria-hidden", allowed ? "false" : "true");
    });
    return allowed;
  }

  async function show() {
    if (!syncAccess()) {
      alert("Global Curriculum is available to ADMIN and GLOBAL_ADMIN accounts only.");
      return false;
    }
    bindHandlers();
    if (typeof window.showScreen !== "function" || !window.showScreen("global-curriculum-screen")) {
      return false;
    }
    await load(false);
    return true;
  }

  function bindHandlers() {
    if (handlersBound) return;
    handlersBound = true;
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    document.addEventListener("input", handleInput);
  }

  function getAction(event) {
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return null;
    const action = target.closest("[data-gcm-action]");
    return action && action.closest("#global-curriculum-screen") ? action : null;
  }

  async function handleClick(event) {
    const target = getAction(event);
    if (!target || target.disabled) return;
    const action = target.dataset.gcmAction || "";
    if (!action) return;
    event.preventDefault();

    if (action === "reload") return load(true);
    if (action === "show-tab") return selectTab(target.dataset.gcmTab);
    if (action === "new") return beginEdit("");
    if (action === "edit") return beginEdit(target.dataset.recordId || "");
    if (action === "toggle-subject-modules") return toggleSubjectModules(target.dataset.subjectKey || "");
    if (action === "add-subject-inline") return addSubjectInline();
    if (action === "add-module-inline") return addModuleInline(target.dataset.subjectKey || "");
    if (action === "save-subject-screen") return saveSubjectScreen(target);
    if (action === "save-subject") return saveSubject(target);
    if (action === "save-module") return saveModule(target);
    if (action === "save-task") return saveTask(target);
    if (action === "toggle-resource-editor") return toggleResourceEditor(target.dataset.resourceKey || "");
    if (action === "add-resource-inline") return addResourceInline();
    if (action === "close-resource-editor") return closeResourceEditor(target.dataset.resourceKey || "");
    if (action === "save-resource-screen") return saveResourceScreen(target);
    if (action === "save-drive-root") return saveDriveRoot(target);
    if (action === "browse-resource") return openDriveBrowser(target.dataset.resourceKey || "");
    if (action === "browse-folder" || action === "drive-breadcrumb") {
      return loadDriveFolder(target.dataset.folderId || "");
    }
    if (action === "select-drive-file") return selectDriveFile(target.dataset.fileId || "");
    if (action === "cancel-drive-browser") return closeDriveBrowser();
  }

  function handleChange(event) {
    const target = event?.target;
    if (!target || !target.closest("#global-curriculum-screen")) return;
    if (target.matches("[data-gcm-subject-field], [data-gcm-module-field]")) {
      syncSubjectEditorControl(target);
      return;
    }
    if (target.matches("[data-gcm-resource-field]")) {
      syncResourceEditorControl(target);
      return;
    }
    if (target.matches("[data-gcm-resource-filter]")) {
      syncResourceFilter(target);
      return;
    }
    if (target.matches("[data-gcm-access-toggle]")) {
      saveAccessToggle(target);
      return;
    }
    if (target.id === "gcm-task-subject") updateTaskModuleOptions();
  }

  function handleInput(event) {
    const target = event?.target;
    if (!target || !target.closest("#global-curriculum-screen")) return;
    if (target.matches("[data-gcm-subject-field], [data-gcm-module-field]")) {
      syncSubjectEditorControl(target);
      return;
    }
    if (target.matches("[data-gcm-resource-field]")) {
      syncResourceEditorControl(target);
      return;
    }
    if (target.matches("[data-gcm-resource-filter]")) {
      syncResourceFilter(target);
    }
  }

  async function load(force) {
    if (model.loading) return false;
    if (model.loaded && !force) {
      render();
      return true;
    }
    model.loading = true;
    setMessage("Loading central global curriculum…", "");
    setContent('<p class="helper-text">Loading Global Curriculum...</p>');
    try {
      const result = await workflowPost("/api/admin/platform/global/get", {}, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "Unable to load Global Curriculum");
      model.data = {
        capabilities: result.capabilities || {},
        globalCurriculumVersion: Number(result.globalCurriculumVersion) || 0,
        subjects: array(result.subjects),
        modules: array(result.modules),
        tasks: array(result.tasks),
        resources: array(result.resources),
        accounts: array(result.accounts),
        subjectAccessMatrix: result.subjectAccessMatrix || emptyData().subjectAccessMatrix,
        globalResourceDriveRoot: result.globalResourceDriveRoot || emptyData().globalResourceDriveRoot
      };
      resetSubjectEditor();
      resetResourceEditor();
      model.loaded = true;
      setMessage("", "");
      render();
      return true;
    } catch (error) {
      setMessage(error.message || "Unable to load Global Curriculum.", "error");
      setContent('<div class="global-curriculum-empty"><h3>Global Curriculum unavailable</h3><p>Check Platform Sheet validation and try again.</p><button type="button" data-gcm-action="reload">Try again</button></div>');
      return false;
    } finally {
      model.loading = false;
    }
  }

  function selectTab(tab) {
    if (tab === "modules") tab = "subjects";
    if (!["subjects", "tasks", "resources", "access"].includes(tab)) return;
    model.tab = tab;
    model.drive.open = false;
    model.drive.data = null;
    setMessage("", "");
    if (!model.loaded) { void load(true); return; }
    render();
  }

  function beginEdit(recordId) {
    model.editing[model.tab] = String(recordId || "");
    setMessage("", "");
    render();
  }

  function render() {
    document.querySelectorAll("#global-curriculum-screen .global-curriculum-tabs button").forEach(button => {
      button.classList.remove("is-active");
    });
    document.querySelector(`#global-curriculum-screen [data-gcm-tab="${model.tab}"]`)?.classList.add("is-active");

    if (model.tab === "subjects") return renderSubjects();
    if (model.tab === "tasks") return renderTasks();
    if (model.tab === "resources") return renderResources();
    return renderAccess();
  }

  function renderSubjects() {
    const dirty = hasSubjectScreenChanges();
    setContent(`
      <section class="global-curriculum-panel global-subject-editor-panel">
        <div class="global-curriculum-panel-heading global-subject-editor-heading">
          <div>
            <h3>Add or Modify Global Subjects</h3>
            <p>Edit Subjects and their Modules inline, then save the screen once.</p>
          </div>
          <button type="button" class="global-save-icon-button global-subject-screen-save" data-gcm-action="save-subject-screen" ${dirty ? "" : "disabled"} aria-label="Save all Subject and Module changes" title="Save all Subject and Module changes"><span class="app-icon app-icon-small save-mode-icon" aria-hidden="true"></span><span class="global-save-icon-label">SAVE</span></button>
        </div>
        <div class="global-subject-editor-head" aria-hidden="true">
          <span>Subject</span><span>Access</span><span>Status</span><span>Modules</span>
        </div>
        <div class="global-subject-editor-list">
          ${model.subjectDrafts.length ? model.subjectDrafts.map(renderSubjectDraft).join("") : '<p class="global-curriculum-empty-list">No Global Subjects found.</p>'}
        </div>
        <button type="button" class="global-inline-add-action" data-gcm-action="add-subject-inline">+ Add a Global Subject</button>
      </section>
    `);
  }

  function renderSubjectDraft(subject) {
    const subjectDirty = isSubjectDraftDirty(subject);
    const modulesDirty = subjectHasDirtyModules(subject.key);
    const open = model.subjectModulesOpen.has(subject.key);
    const modules = modulesForSubjectDraft(subject.key);
    return `
      <article class="global-subject-editor-item ${subjectDirty || modulesDirty ? "is-dirty" : ""} ${subject.isNew ? "is-new" : ""}" data-subject-draft-key="${attr(subject.key)}">
        <div class="global-subject-editor-row">
          <label class="global-subject-editor-name">
            <span class="global-subject-mobile-label">Subject</span>
            <input type="text" maxlength="160" value="${attr(subject.subjectname)}" data-gcm-subject-field="subjectname" data-subject-key="${attr(subject.key)}" autocomplete="off" />
            <small>${html(subject.subjectid || "New Global Subject")}</small>
          </label>
          <label>
            <span class="global-subject-mobile-label">Access</span>
            <select data-gcm-subject-field="accessmodel" data-subject-key="${attr(subject.key)}">
              <option value="SUBSCRIPTION" ${subject.accessmodel === "SUBSCRIPTION" ? "selected" : ""}>PAID</option>
              <option value="FREE" ${subject.accessmodel === "FREE" ? "selected" : ""}>FREE</option>
            </select>
          </label>
          <label>
            <span class="global-subject-mobile-label">Status</span>
            <select data-gcm-subject-field="active" data-subject-key="${attr(subject.key)}">
              <option value="ACTIVE" ${subject.active ? "selected" : ""}>ACTIVE</option>
              <option value="INACTIVE" ${subject.active ? "" : "selected"}>INACTIVE</option>
            </select>
          </label>
          <button type="button" class="global-subject-modules-toggle ${modulesDirty ? "is-dirty" : ""}" data-gcm-action="toggle-subject-modules" data-subject-key="${attr(subject.key)}" aria-expanded="${open ? "true" : "false"}">
            <span>Modules ${open ? "▲" : "▼"}</span>
            <small>${modules.length} module${modules.length === 1 ? "" : "s"}</small>
          </button>
        </div>
        ${open ? renderInlineModules(subject, modules) : ""}
      </article>
    `;
  }

  function renderInlineModules(subject, modules) {
    return `
      <section class="global-inline-module-editor" aria-label="Modules for ${attr(subject.subjectname || "Global Subject")}">
        <div class="global-inline-module-heading"><h4>Modules</h4><span>${html(subject.subjectname || "New Global Subject")}</span></div>
        <div class="global-inline-module-head" aria-hidden="true"><span>Order</span><span>Module name</span><span>Status</span></div>
        <div class="global-inline-module-list">
          ${modules.length ? modules.map(renderModuleDraft).join("") : '<p class="global-curriculum-empty-list">No Modules yet.</p>'}
        </div>
        <button type="button" class="global-inline-add-action global-inline-add-module" data-gcm-action="add-module-inline" data-subject-key="${attr(subject.key)}">+ Add a module</button>
      </section>
    `;
  }

  function renderModuleDraft(module) {
    return `
      <div class="global-inline-module-row ${isModuleDraftDirty(module) ? "is-dirty" : ""} ${module.isNew ? "is-new" : ""}" data-module-draft-key="${attr(module.key)}">
        <label><span class="global-subject-mobile-label">Order</span><input type="number" min="1" step="1" value="${attr(module.sortorder)}" data-gcm-module-field="sortorder" data-module-key="${attr(module.key)}" /></label>
        <label class="global-inline-module-name"><span class="global-subject-mobile-label">Module name</span><input type="text" maxlength="160" value="${attr(module.modulename)}" data-gcm-module-field="modulename" data-module-key="${attr(module.key)}" autocomplete="off" /><small>${html(module.moduleid || "New Module")}</small></label>
        <label><span class="global-subject-mobile-label">Status</span><select data-gcm-module-field="active" data-module-key="${attr(module.key)}"><option value="ACTIVE" ${module.active ? "selected" : ""}>ACTIVE</option><option value="INACTIVE" ${module.active ? "" : "selected"}>INACTIVE</option></select></label>
      </div>
    `;
  }

  function renderModules() {
    const current = findById(model.data.modules, "moduleid", model.editing.modules);
    const selectedSubject = current?.subjectid || firstActive(model.data.subjects, "subjectid");
    setContent(`
      <div class="global-curriculum-management-grid">
        ${panelForm(current ? "Modify Global Module" : "Add Global Module", `
          <input id="gcm-module-id" type="hidden" value="${attr(current?.moduleid || "")}" />
          ${field("Global subject", `<select id="gcm-module-subject">${subjectOptions(selectedSubject, current?.subjectid)}</select>`)}
          ${field("Module name", `<input id="gcm-module-name" type="text" maxlength="160" value="${attr(current?.modulename || "")}" autocomplete="off" />`)}
          ${field("Sort order", `<input id="gcm-module-sort" type="number" min="1" step="1" value="${attr(current?.sortorder || nextModuleSort(selectedSubject))}" />`)}
          ${activeField("gcm-module-active", current?.active !== false)}
          ${saveButtons("save-module", Boolean(current))}
        `)}
        ${listPanel("Global Modules", model.data.modules.length, recordList(
          sortedModules(),
          item => item.moduleid,
          item => item.modulename,
          item => `${subjectName(item.subjectid)} · Order ${item.sortorder || "—"}`,
          item => item.active
        ))}
      </div>
    `);
  }

  function renderTasks() {
    const current = findById(model.data.tasks, "taskid", model.editing.tasks);
    const selectedSubject = current?.subjectid || firstActive(model.data.subjects, "subjectid");
    setContent(`
      <div class="global-curriculum-management-grid">
        ${panelForm(current ? "Modify Global Task" : "Add Global Task", `
          <input id="gcm-task-id" type="hidden" value="${attr(current?.taskid || "")}" />
          ${field("Global subject", `<select id="gcm-task-subject">${subjectOptions(selectedSubject, current?.subjectid)}</select>`)}
          ${field("Module (optional)", `<select id="gcm-task-module">${moduleOptions(selectedSubject, current?.moduleid || "", true)}</select>`)}
          ${field("Task name", `<input id="gcm-task-name" type="text" maxlength="160" value="${attr(current?.taskname || "")}" autocomplete="off" />`)}
          ${activeField("gcm-task-active", current?.active !== false)}
          ${saveButtons("save-task", Boolean(current))}
        `)}
        ${listPanel("Global Tasks", model.data.tasks.length, recordList(
          model.data.tasks,
          item => item.taskid,
          item => item.taskname,
          item => `${subjectName(item.subjectid)}${item.moduleid ? ` · ${moduleName(item.moduleid)}` : ""}`,
          item => item.active
        ))}
      </div>
    `);
  }

  function renderResources() {
    if (model.data.capabilities?.resourceManagement === false) {
      setContent('<section class="global-curriculum-panel"><h3>Global Resources</h3><p>Global Resource editing is not available yet. Existing resources are available in the Academy Library.</p><ul>'+model.data.resources.map(r=>'<li>'+html(r.resourcename)+'</li>').join('')+'</ul></section>');
      return;
    }
    if (model.drive.open) return renderDriveBrowser();

    const dirty = hasResourceScreenChanges();
    const existingDrafts = model.resourceDrafts.filter(draft => !draft.isNew);
    const newDrafts = model.resourceDrafts.filter(draft => draft.isNew);
    setContent(`
      <section class="global-curriculum-panel global-resource-editor-panel">
        <div class="global-curriculum-panel-heading global-resource-editor-heading">
          <div>
            <h3>Add/Modify Global Resources</h3>
            <p>Filter the list, expand any Resource to edit it inline, then save all changed Resources once.</p>
          </div>
          <button type="button" class="global-save-icon-button global-resource-screen-save ${dirty ? "is-dirty" : ""}" data-gcm-action="save-resource-screen" ${dirty ? "" : "disabled"} aria-label="Save all Global Resource changes" title="Save all Global Resource changes"><span class="app-icon save-mode-icon" aria-hidden="true"></span><span class="global-save-icon-label">SAVE</span></button>
        </div>

        <div class="global-resource-list-head">
          <label><span>Resource Name</span><input type="search" value="${attr(model.resourceFilters.name)}" placeholder="Search" data-gcm-resource-filter="name" /></label>
          <label><span>Global Subject</span><select data-gcm-resource-filter="subject"><option value="">All Subjects</option>${model.data.subjects.map(subject => `<option value="${attr(subject.subjectid)}" ${model.resourceFilters.subject === subject.subjectid ? "selected" : ""}>${html(subject.subjectname)}</option>`).join("")}</select></label>
          <label><span>Type</span><select data-gcm-resource-filter="type"><option value="">All Types</option>${RESOURCE_TYPES.map(type => `<option value="${type}" ${model.resourceFilters.type === type ? "selected" : ""}>${html(resourceTypeLabel(type))}</option>`).join("")}</select></label>
          <label><span>Status</span><select data-gcm-resource-filter="status"><option value="">All Statuses</option><option value="ACTIVE" ${model.resourceFilters.status === "ACTIVE" ? "selected" : ""}>ACTIVE</option><option value="INACTIVE" ${model.resourceFilters.status === "INACTIVE" ? "selected" : ""}>INACTIVE</option></select></label>
        </div>

        <div class="global-resource-inline-list">
          ${existingDrafts.length ? existingDrafts.map(renderResourceListEntry).join("") : '<p class="global-curriculum-empty-list">No Global Resources found.</p>'}
        </div>

        ${newDrafts.length ? `<div class="global-resource-new-drafts">${newDrafts.map(draft => renderResourceEditor(draft, true)).join("")}</div>` : ""}
        <button type="button" class="global-inline-add-action global-inline-add-resource" data-gcm-action="add-resource-inline">+ Add a Global Resource</button>
      </section>
      ${renderGlobalDriveRootPanel()}
    `);
    applyResourceFiltersToDom();
  }

  function renderResourceListEntry(draft) {
    const open = model.resourceOpen.has(draft.key);
    const dirty = isResourceDraftDirty(draft);
    const status = draft.active ? "ACTIVE" : "INACTIVE";
    return `
      <article class="global-resource-list-entry ${dirty ? "is-dirty" : ""} ${draft.active ? "" : "is-inactive"}"
        data-resource-list-entry data-resource-key="${attr(draft.key)}"
        data-resource-filter-name="${attr(String(draft.resourcename || "").toLowerCase())}"
        data-resource-filter-subject="${attr(draft.subjectid)}"
        data-resource-filter-type="${attr(draft.resourcetype)}"
        data-resource-filter-status="${status}">
        <button type="button" class="global-resource-summary-row" data-gcm-action="toggle-resource-editor" data-resource-key="${attr(draft.key)}" aria-expanded="${open ? "true" : "false"}">
          <span class="global-resource-summary-name"><strong>${html(draft.resourcename || "Untitled Resource")}</strong><small>${html(draft.resourceid || "")}</small></span>
          <span>${html(subjectName(draft.subjectid))}</span>
          <span>${html(resourceTypeLabel(draft.resourcetype))}</span>
          <span class="global-resource-status-token ${draft.active ? "is-active" : "is-inactive"}">${status}</span>
        </button>
        ${open ? renderResourceEditor(draft, false) : ""}
      </article>
    `;
  }

  function renderResourceEditor(draft, isNew) {
    const selectedFile = draft.file;
    const fileName = selectedFile?.name || (draft.legacyExternal ? "Existing external link" : "No Drive file selected");
    const format = selectedFile?.format || draft.resourceformat || "—";
    return `
      <div class="global-resource-inline-editor ${isResourceDraftDirty(draft) ? "is-dirty" : ""} ${isNew ? "is-new" : ""}" data-resource-editor-key="${attr(draft.key)}">
        <div class="global-resource-editor-primary-row">
          <label class="global-resource-file-control">
            <span>Drive file</span>
            <button type="button" class="global-resource-file-picker" data-gcm-action="browse-resource" data-resource-key="${attr(draft.key)}">Browse Folder</button>
            <small>${html(fileName)}</small>
          </label>
          <label>
            <span>Display Name</span>
            <input type="text" maxlength="160" value="${attr(draft.resourcename)}" autocomplete="off" data-gcm-resource-field="resourcename" data-resource-key="${attr(draft.key)}" />
          </label>
          <label class="global-resource-description-field">
            <span>Description</span>
            <textarea maxlength="2000" rows="1" data-gcm-resource-field="resourcedescription" data-resource-key="${attr(draft.key)}">${html(draft.resourcedescription)}</textarea>
          </label>
          <button type="button" class="global-resource-editor-close" data-gcm-action="close-resource-editor" data-resource-key="${attr(draft.key)}" aria-label="${isNew ? "Discard new Resource" : "Close Resource editor"}" title="${isNew ? "Discard new Resource" : "Close Resource editor"}">×</button>
        </div>
        <div class="global-resource-editor-secondary-row">
          <label><span>Type</span><select data-gcm-resource-field="resourcetype" data-resource-key="${attr(draft.key)}">${RESOURCE_TYPES.map(type => `<option value="${type}" ${type === draft.resourcetype ? "selected" : ""}>${html(resourceTypeLabel(type))}</option>`).join("")}</select></label>
          <label><span>Subject</span><select data-gcm-resource-field="subjectid" data-resource-key="${attr(draft.key)}">${resourceSubjectOptions(draft.subjectid)}</select></label>
          <label><span>Module</span><select data-gcm-resource-field="moduleid" data-resource-key="${attr(draft.key)}">${resourceModuleOptions(draft.subjectid, draft.moduleid)}</select></label>
          <label><span>Task</span><select data-gcm-resource-field="taskid" data-resource-key="${attr(draft.key)}">${resourceTaskOptions(draft.subjectid, draft.moduleid, draft.taskid)}</select></label>
          <label><span>Status</span><select data-gcm-resource-field="active" data-resource-key="${attr(draft.key)}"><option value="ACTIVE" ${draft.active ? "selected" : ""}>ACTIVE</option><option value="INACTIVE" ${draft.active ? "" : "selected"}>INACTIVE</option></select></label>
          <label><span>Format</span><span class="global-resource-format-value">${html(format)}</span></label>
        </div>
      </div>
    `;
  }

  function renderAccess() {
    const matrix = model.data.subjectAccessMatrix || emptyData().subjectAccessMatrix;
    const subjects = [...model.data.subjects].sort((left, right) => left.subjectname.localeCompare(right.subjectname));
    const accounts = [...model.data.accounts].sort((left, right) => left.displayname.localeCompare(right.displayname));
    const rowsByAccount = new Map(array(matrix.rows).map(row => [String(row.accountid || ""), row]));
    const policies = matrix.policies && typeof matrix.policies === "object" ? matrix.policies : {};

    if (!subjects.length) {
      setContent('<div class="global-curriculum-empty"><h3>No global subjects</h3><p>Create a Global Subject before assigning access.</p></div>');
      return;
    }

    setContent(`
      <section class="global-curriculum-panel global-access-matrix-panel">${model.data.capabilities?.subscriptionManagement === false ? "<p>Existing subscriptions are shown here. Subscription editing is not available yet.</p>" : ""}
        <div class="global-access-matrix-scroll">
          <table class="global-access-matrix">
            <thead>
              <tr class="global-access-subject-row">
                <th scope="col" class="global-access-account-column" rowspan="2">Account</th>
                <th scope="col" class="global-access-unique-column" rowspan="2">Unique ID</th>
                ${subjects.map(subject => `<th scope="col">${html(subject.subjectname)}</th>`).join("")}
              </tr>
              <tr class="global-access-policy-row">
                ${subjects.map(subject => {
                  const policy = String(policies[subject.subjectid] || "SUBSCRIPTION").toUpperCase();
                  return `<th scope="col"><span class="global-access-policy-token global-access-policy-token--${policy === "FREE" ? "free" : "paid"}">${policy === "FREE" ? "FREE" : "PAID"}</span></th>`;
                }).join("")}
              </tr>
            </thead>
            <tbody>
              ${accounts.map(account => {
                const row = rowsByAccount.get(account.accountid) || { values: {} };
                return `<tr class="${account.active ? "" : "is-inactive"}">
                  <th scope="row" class="global-access-account-column"><strong>${html(account.displayname)}</strong>${account.active ? "" : "<small>inactive</small>"}</th>
                  <td class="global-access-unique-column"><code>${html(account.uniqueid || "—")}</code></td>
                  ${subjects.map(subject => {
                    const policy = String(policies[subject.subjectid] || "SUBSCRIPTION").toUpperCase();
                    const subscribed = row.values?.[subject.subjectid] === true;
                    const disabled = model.data.capabilities?.subscriptionManagement === false || !account.active || !subject.active;
                    const checkbox = `<label title="${model.data.capabilities?.subscriptionManagement === false ? "Subscription editing is not available yet" : disabled ? "Inactive account or subject" : "Saved subscription entitlement"}"><input class="global-access-toggle" type="checkbox" data-gcm-access-toggle data-account-id="${attr(account.accountid)}" data-subject-id="${attr(subject.subjectid)}" ${subscribed ? "checked" : ""} ${disabled ? "disabled" : ""} /></label>`;
                    return policy === "FREE"
                      ? `<td><div class="global-access-free-state"><span class="global-access-free">FREE</span>${checkbox}</div></td>`
                      : `<td>${checkbox}</td>`;
                  }).join("")}
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `);
  }

  function resetSubjectEditor() {
    const policies = model.data.subjectAccessMatrix?.policies || {};
    const openKeys = new Set(model.subjectModulesOpen || []);
    model.subjectDrafts = model.data.subjects.map(subject => {
      const accessmodel = String(policies[subject.subjectid] || "SUBSCRIPTION").toUpperCase() === "FREE" ? "FREE" : "SUBSCRIPTION";
      const draft = {
        key: String(subject.subjectid || ""),
        subjectid: String(subject.subjectid || ""),
        subjectname: String(subject.subjectname || ""),
        accessmodel,
        active: subject.active !== false,
        isNew: false
      };
      draft.original = subjectDraftSnapshot(draft);
      return draft;
    });
    model.moduleDrafts = model.data.modules.map(module => {
      const draft = {
        key: String(module.moduleid || ""),
        moduleid: String(module.moduleid || ""),
        subjectkey: String(module.subjectid || ""),
        modulename: String(module.modulename || ""),
        sortorder: Math.max(1, Number(module.sortorder) || 1),
        active: module.active !== false,
        isNew: false
      };
      draft.original = moduleDraftSnapshot(draft);
      return draft;
    });
    model.subjectModulesOpen = new Set(model.subjectDrafts.filter(subject => openKeys.has(subject.key)).map(subject => subject.key));
  }

  function subjectDraftSnapshot(subject) {
    return {
      subjectname: String(subject?.subjectname || "").trim(),
      accessmodel: String(subject?.accessmodel || "SUBSCRIPTION").toUpperCase(),
      active: subject?.active !== false
    };
  }

  function moduleDraftSnapshot(module) {
    return {
      subjectkey: String(module?.subjectkey || ""),
      modulename: String(module?.modulename || "").trim(),
      sortorder: Math.max(1, Number(module?.sortorder) || 1),
      active: module?.active !== false
    };
  }

  function isSubjectDraftDirty(subject) {
    if (!subject) return false;
    if (subject.isNew) return true;
    return JSON.stringify(subjectDraftSnapshot(subject)) !== JSON.stringify(subject.original || {});
  }

  function isModuleDraftDirty(module) {
    if (!module) return false;
    if (module.isNew) return true;
    return JSON.stringify(moduleDraftSnapshot(module)) !== JSON.stringify(module.original || {});
  }

  function subjectHasDirtyModules(subjectKey) {
    return model.moduleDrafts.some(module => module.subjectkey === subjectKey && isModuleDraftDirty(module));
  }

  function hasSubjectScreenChanges() {
    return model.subjectDrafts.some(isSubjectDraftDirty) || model.moduleDrafts.some(isModuleDraftDirty);
  }

  function modulesForSubjectDraft(subjectKey) {
    return model.moduleDrafts
      .filter(module => module.subjectkey === subjectKey)
      .sort((left, right) => Number(left.sortorder || 0) - Number(right.sortorder || 0) || String(left.modulename || "").localeCompare(String(right.modulename || "")));
  }

  function syncSubjectEditorControl(control) {
    const subjectKey = String(control?.dataset?.subjectKey || "");
    const moduleKey = String(control?.dataset?.moduleKey || "");
    if (control.matches("[data-gcm-subject-field]")) {
      const subject = model.subjectDrafts.find(item => item.key === subjectKey);
      if (!subject) return;
      const fieldName = String(control.dataset.gcmSubjectField || "");
      if (fieldName === "subjectname") subject.subjectname = String(control.value || "");
      if (fieldName === "accessmodel") subject.accessmodel = String(control.value || "SUBSCRIPTION").toUpperCase() === "FREE" ? "FREE" : "SUBSCRIPTION";
      if (fieldName === "active") subject.active = String(control.value || "ACTIVE").toUpperCase() === "ACTIVE";
    } else if (control.matches("[data-gcm-module-field]")) {
      const module = model.moduleDrafts.find(item => item.key === moduleKey);
      if (!module) return;
      const fieldName = String(control.dataset.gcmModuleField || "");
      if (fieldName === "modulename") module.modulename = String(control.value || "");
      if (fieldName === "sortorder") module.sortorder = Math.max(1, Number(control.value) || 1);
      if (fieldName === "active") module.active = String(control.value || "ACTIVE").toUpperCase() === "ACTIVE";
    }
    refreshSubjectDirtyIndicators();
  }

  function refreshSubjectDirtyIndicators() {
    model.subjectDrafts.forEach(subject => {
      const row = document.querySelector(`[data-subject-draft-key="${cssEscapeValue(subject.key)}"]`);
      if (!row) return;
      const dirty = isSubjectDraftDirty(subject) || subjectHasDirtyModules(subject.key);
      row.classList.toggle("is-dirty", dirty);
      row.querySelector(".global-subject-modules-toggle")?.classList.toggle("is-dirty", subjectHasDirtyModules(subject.key));
    });
    model.moduleDrafts.forEach(module => {
      document.querySelector(`[data-module-draft-key="${cssEscapeValue(module.key)}"]`)?.classList.toggle("is-dirty", isModuleDraftDirty(module));
    });
    const save = document.querySelector('[data-gcm-action="save-subject-screen"]');
    if (save) save.disabled = !hasSubjectScreenChanges();
  }

  function toggleSubjectModules(subjectKey) {
    const key = String(subjectKey || "");
    if (!key) return;
    if (model.subjectModulesOpen.has(key)) model.subjectModulesOpen.delete(key);
    else model.subjectModulesOpen.add(key);
    renderSubjects();
  }

  function addSubjectInline() {
    const key = `new-subject-${++model.subjectDraftSequence}`;
    const draft = {
      key,
      subjectid: "",
      subjectname: "",
      accessmodel: "SUBSCRIPTION",
      active: true,
      isNew: true,
      original: null
    };
    model.subjectDrafts.push(draft);
    model.subjectModulesOpen.add(key);
    renderSubjects();
    document.querySelector(`[data-subject-draft-key="${cssEscapeValue(key)}"] input[data-gcm-subject-field="subjectname"]`)?.focus();
  }

  function addModuleInline(subjectKey) {
    const subject = model.subjectDrafts.find(item => item.key === String(subjectKey || ""));
    if (!subject) return;
    const key = `new-module-${++model.moduleDraftSequence}`;
    model.moduleDrafts.push({
      key,
      moduleid: "",
      subjectkey: subject.key,
      modulename: "",
      sortorder: Math.max(0, ...modulesForSubjectDraft(subject.key).map(item => Number(item.sortorder) || 0)) + 1,
      active: true,
      isNew: true,
      original: null
    });
    model.subjectModulesOpen.add(subject.key);
    renderSubjects();
    document.querySelector(`[data-module-draft-key="${cssEscapeValue(key)}"] input[data-gcm-module-field="modulename"]`)?.focus();
  }

  async function saveSubjectScreen(button) {
    const dirtySubjects = model.subjectDrafts.filter(isSubjectDraftDirty);
    const dirtyModules = model.moduleDrafts.filter(isModuleDraftDirty);
    if (!dirtySubjects.length && !dirtyModules.length) {
      setMessage("No Subject or Module changes to save.", "");
      return false;
    }

    const blankSubject = dirtySubjects.find(subject => !String(subject.subjectname || "").trim());
    if (blankSubject) {
      model.subjectModulesOpen.add(blankSubject.key);
      renderSubjects();
      document.querySelector(`[data-subject-draft-key="${cssEscapeValue(blankSubject.key)}"] input[data-gcm-subject-field="subjectname"]`)?.focus();
      setMessage("Enter a Subject name before saving.", "error");
      return false;
    }
    const blankModule = dirtyModules.find(module => !String(module.modulename || "").trim());
    if (blankModule) {
      model.subjectModulesOpen.add(blankModule.subjectkey);
      renderSubjects();
      document.querySelector(`[data-module-draft-key="${cssEscapeValue(blankModule.key)}"] input[data-gcm-module-field="modulename"]`)?.focus();
      setMessage("Enter a Module name before saving.", "error");
      return false;
    }

    if (model.loading) return false;
    model.loading = true;
    button.disabled = true;
    setMessage("Saving Subjects and Modules…", "");
    try {
      const subjectByKey = new Map(model.subjectDrafts.map(subject => [subject.key, subject]));
      const result = await workflowPost("/api/admin/platform/global/subjects/save-batch", {
        globalCurriculumVersion: model.data.globalCurriculumVersion,
        subjects: dirtySubjects.map(subject => ({
          clientKey: subject.key,
          subjectId: subject.subjectid,
          subjectName: String(subject.subjectname || "").trim(),
          accessModel: subject.accessmodel,
          active: subject.active
        })),
        modules: dirtyModules.map(module => {
          const subject = subjectByKey.get(module.subjectkey);
          return {
            clientKey: module.key,
            moduleId: module.moduleid,
            subjectId: subject?.subjectid || "",
            subjectClientKey: module.subjectkey,
            moduleName: String(module.modulename || "").trim(),
            sortOrder: Math.max(1, Number(module.sortorder) || 1),
            active: module.active
          };
        })
      }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "Unable to save Subjects and Modules");
      model.loaded = false;
      model.loading = false;
      await load(true);
      setMessage(result.message || "Subjects and Modules saved.", "success");
      return true;
    } catch (error) {
      setMessage(error.message || "Unable to save Subjects and Modules.", "error");
      return false;
    } finally {
      model.loading = false;
      button.disabled = !hasSubjectScreenChanges();
    }
  }

  async function saveSubject(button) {
    return submit(button, "/api/admin/platform/global/subject/save", {
      subjectId: value("gcm-subject-id"),
      subjectName: value("gcm-subject-name"),
      active: checked("gcm-subject-active")
    });
  }

  async function saveModule(button) {
    return submit(button, "/api/admin/platform/global/module/save", {
      moduleId: value("gcm-module-id"),
      subjectId: value("gcm-module-subject"),
      moduleName: value("gcm-module-name"),
      sortOrder: Number(value("gcm-module-sort")),
      active: checked("gcm-module-active")
    });
  }

  async function saveTask(button) {
    return submit(button, "/api/admin/platform/global/task/save", {
      taskId: value("gcm-task-id"),
      subjectId: value("gcm-task-subject"),
      moduleId: value("gcm-task-module"),
      taskName: value("gcm-task-name"),
      active: checked("gcm-task-active")
    });
  }

  async function saveResourceScreen(button) {
    const dirtyResources = model.resourceDrafts.filter(isResourceDraftDirty);
    if (!dirtyResources.length) {
      setMessage("No Global Resource changes to save.", "");
      return false;
    }
    const invalid = dirtyResources.find(draft => !String(draft.resourcename || "").trim() || !draft.subjectid || (!draft.resourceid && !draft.file?.id));
    if (invalid) {
      model.resourceOpen.add(invalid.key);
      renderResources();
      document.querySelector(`[data-resource-editor-key="${cssEscapeValue(invalid.key)}"] input[data-gcm-resource-field="resourcename"]`)?.focus();
      setMessage(!String(invalid.resourcename || "").trim()
        ? "Enter a Resource display name before saving."
        : !invalid.subjectid
          ? "Select a Global Subject before saving."
          : "Select a file from the Global Resources folder before saving a new Resource.", "error");
      return false;
    }

    if (model.loading) return false;
    model.loading = true;
    button.disabled = true;
    setMessage("Saving Global Resources…", "");
    try {
      const result = await workflowPost("/api/admin/platform/global/resources/save-batch", {
        globalCurriculumVersion: model.data.globalCurriculumVersion,
        resources: dirtyResources.map(draft => ({
          clientKey: draft.key,
          resourceId: draft.resourceid,
          subjectId: draft.subjectid,
          moduleId: draft.moduleid,
          taskId: draft.taskid,
          resourceName: String(draft.resourcename || "").trim(),
          resourceType: draft.resourcetype,
          resourceDescription: String(draft.resourcedescription || "").trim(),
          fileId: draft.file?.id || "",
          active: draft.active
        }))
      }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "Unable to save Global Resources");
      model.loaded = false;
      model.loading = false;
      await load(true);
      setMessage(result.message || "Global Resources saved.", "success");
      return true;
    } catch (error) {
      setMessage(error.message || "Unable to save Global Resources.", "error");
      return false;
    } finally {
      model.loading = false;
      refreshResourceDirtyIndicators();
    }
  }

  async function saveDriveRoot(button) {
    if (hasResourceScreenChanges()) {
      setMessage("Save or discard the pending Global Resource edits before changing the global folder.", "error");
      return false;
    }
    if (!isGlobalAdmin()) {
      setMessage("Only a GLOBAL_ADMIN can configure the Global Resources folder.", "error");
      return false;
    }
    const folderUrl = value("gcm-global-drive-root");
    if (!folderUrl) {
      setMessage("Enter the Google Drive folder URL or folder ID.", "error");
      return false;
    }
    return submit(button, "/api/admin/platform/global/drive-root/save", { folderUrl });
  }

  async function saveAccessToggle(input) {
    const accountId = String(input?.dataset?.accountId || "").trim();
    const subjectId = String(input?.dataset?.subjectId || "").trim();
    if (!accountId || !subjectId || input.disabled) return false;
    const requested = input.checked === true;
    input.disabled = true;
    try {
      const result = await workflowPost("/api/admin/platform/global/access/save", {
        accountId,
        subjectId,
        active: requested
      }, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "Unable to update global-subject access");
      const row = array(model.data.subjectAccessMatrix?.rows).find(item => item.accountid === accountId);
      if (row) {
        if (!row.values || typeof row.values !== "object") row.values = {};
        row.values[subjectId] = requested;
      }
      setMessage(result.message || "Global-subject access updated.", "success");
      return true;
    } catch (error) {
      input.checked = !requested;
      setMessage(error.message || "Unable to update global-subject access.", "error");
      return false;
    } finally {
      input.disabled = false;
    }
  }

  async function submit(button, path, payload) {
    if (model.loading) return false;
    model.loading = true;
    button.disabled = true;
    setMessage("Saving platform change…", "");
    try {
      const result = await workflowPost(path, payload, appState()?.token || "");
      if (!result.success) throw new Error(result.error || "The platform change could not be saved");
      const dependencyText = result.dependencies ? formatDependencies(result.dependencies) : "";
      model.editing[model.tab] = "";
      if (model.tab === "resources") {
        model.drive.open = false;
        model.drive.data = null;
        model.drive.resourceKey = "";
      }
      model.loaded = false;
      model.loading = false;
      await load(true);
      setMessage(`${result.message || "Saved."}${dependencyText}`, "success");
      return true;
    } catch (error) {
      setMessage(error.message || "The platform change could not be saved.", "error");
      return false;
    } finally {
      model.loading = false;
      button.disabled = false;
    }
  }

  function createResourceDraft(record, key = "") {
    const selectedSubject = record?.subjectid || firstActive(model.data.subjects, "subjectid");
    const fileId = String(record?.fileid || "").trim();
    const draft = {
      key: key || String(record?.resourceid || `new-resource-${++model.resourceDraftSequence}`),
      resourceid: String(record?.resourceid || ""),
      subjectid: selectedSubject,
      moduleid: String(record?.moduleid || ""),
      taskid: String(record?.taskid || ""),
      resourcename: String(record?.resourcename || ""),
      resourcetype: String(record?.resourcetype || "EBOOK"),
      resourceformat: String(record?.resourceformat || ""),
      resourcedescription: String(record?.resourcedescription || ""),
      active: record?.active !== false,
      legacyExternal: Boolean(record?.resourcelink && !fileId),
      file: fileId ? {
        id: fileId,
        name: String(record?.resourcename || "Google Drive file"),
        format: String(record?.resourceformat || "FILE"),
        supportedTypes: [String(record?.resourcetype || "EBOOK")],
        current: true
      } : null,
      isNew: !record?.resourceid
    };
    draft.original = draft.isNew ? null : resourceDraftSnapshot(draft);
    return draft;
  }

  function resetResourceEditor() {
    const openKeys = new Set(model.resourceOpen || []);
    model.resourceDrafts = model.data.resources.map(record => createResourceDraft(record, String(record.resourceid || "")));
    model.resourceOpen = new Set(model.resourceDrafts.filter(draft => openKeys.has(draft.key)).map(draft => draft.key));
  }

  function resourceDraftSnapshot(draft) {
    return {
      subjectid: String(draft?.subjectid || ""),
      moduleid: String(draft?.moduleid || ""),
      taskid: String(draft?.taskid || ""),
      resourcename: String(draft?.resourcename || "").trim(),
      resourcetype: String(draft?.resourcetype || "EBOOK").toUpperCase(),
      resourcedescription: String(draft?.resourcedescription || "").trim(),
      fileid: String(draft?.file?.id || ""),
      active: draft?.active !== false
    };
  }

  function isResourceDraftDirty(draft) {
    if (!draft) return false;
    if (draft.isNew) return true;
    return JSON.stringify(resourceDraftSnapshot(draft)) !== JSON.stringify(draft.original || {});
  }

  function hasResourceScreenChanges() {
    return model.resourceDrafts.some(isResourceDraftDirty);
  }

  function resourceDraftByKey(key) {
    return model.resourceDrafts.find(draft => draft.key === String(key || "")) || null;
  }

  function toggleResourceEditor(key) {
    const draft = resourceDraftByKey(key);
    if (!draft) return false;
    if (model.resourceOpen.has(draft.key)) model.resourceOpen.delete(draft.key);
    else model.resourceOpen.add(draft.key);
    renderResources();
    return true;
  }

  function addResourceInline() {
    const draft = createResourceDraft(null);
    model.resourceDrafts.push(draft);
    model.resourceOpen.add(draft.key);
    renderResources();
    document.querySelector(`[data-resource-editor-key="${cssEscapeValue(draft.key)}"] input[data-gcm-resource-field="resourcename"]`)?.focus();
    return true;
  }

  function closeResourceEditor(key) {
    const draft = resourceDraftByKey(key);
    if (!draft) return false;
    if (draft.isNew) {
      model.resourceDrafts = model.resourceDrafts.filter(item => item.key !== draft.key);
      model.resourceOpen.delete(draft.key);
    } else {
      model.resourceOpen.delete(draft.key);
    }
    renderResources();
    return true;
  }

  function syncResourceEditorControl(control) {
    const draft = resourceDraftByKey(control?.dataset?.resourceKey || "");
    if (!draft) return;
    const fieldName = String(control.dataset.gcmResourceField || "");
    if (fieldName === "resourcename") draft.resourcename = String(control.value || "");
    if (fieldName === "resourcedescription") draft.resourcedescription = String(control.value || "");
    if (fieldName === "resourcetype") draft.resourcetype = String(control.value || "EBOOK").toUpperCase();
    if (fieldName === "subjectid") {
      draft.subjectid = String(control.value || "");
      draft.moduleid = "";
      draft.taskid = "";
      renderResources();
      return;
    }
    if (fieldName === "moduleid") {
      draft.moduleid = String(control.value || "");
      draft.taskid = "";
      renderResources();
      return;
    }
    if (fieldName === "taskid") draft.taskid = String(control.value || "");
    if (fieldName === "active") draft.active = String(control.value || "ACTIVE").toUpperCase() === "ACTIVE";
    refreshResourceDraftSummary(draft);
    refreshResourceDirtyIndicators();
  }

  function refreshResourceDraftSummary(draft) {
    const row = document.querySelector(`[data-resource-list-entry][data-resource-key="${cssEscapeValue(draft.key)}"]`);
    if (!row) return;
    row.dataset.resourceFilterName = String(draft.resourcename || "").toLowerCase();
    row.dataset.resourceFilterSubject = String(draft.subjectid || "");
    row.dataset.resourceFilterType = String(draft.resourcetype || "");
    row.dataset.resourceFilterStatus = draft.active ? "ACTIVE" : "INACTIVE";
    const name = row.querySelector(".global-resource-summary-name strong");
    if (name) name.textContent = String(draft.resourcename || "Untitled Resource");
    const cells = row.querySelectorAll(".global-resource-summary-row > span");
    if (cells[1]) cells[1].textContent = subjectName(draft.subjectid);
    if (cells[2]) cells[2].textContent = resourceTypeLabel(draft.resourcetype);
    const status = row.querySelector(".global-resource-status-token");
    if (status) {
      status.textContent = draft.active ? "ACTIVE" : "INACTIVE";
      status.classList.toggle("is-active", draft.active);
      status.classList.toggle("is-inactive", !draft.active);
    }
    applyResourceFiltersToDom();
  }

  function refreshResourceDirtyIndicators() {
    model.resourceDrafts.forEach(draft => {
      const dirty = isResourceDraftDirty(draft);
      document.querySelector(`[data-resource-list-entry][data-resource-key="${cssEscapeValue(draft.key)}"]`)?.classList.toggle("is-dirty", dirty);
      document.querySelector(`[data-resource-editor-key="${cssEscapeValue(draft.key)}"]`)?.classList.toggle("is-dirty", dirty);
    });
    const save = document.querySelector('[data-gcm-action="save-resource-screen"]');
    if (save) {
      const dirty = hasResourceScreenChanges();
      save.disabled = !dirty;
      save.classList.toggle("is-dirty", dirty);
    }
  }

  function syncResourceFilter(control) {
    const field = String(control?.dataset?.gcmResourceFilter || "");
    if (!Object.prototype.hasOwnProperty.call(model.resourceFilters, field)) return;
    model.resourceFilters[field] = String(control.value || "");
    applyResourceFiltersToDom();
  }

  function applyResourceFiltersToDom() {
    const name = String(model.resourceFilters.name || "").trim().toLowerCase();
    const subject = String(model.resourceFilters.subject || "");
    const type = String(model.resourceFilters.type || "");
    const status = String(model.resourceFilters.status || "");
    document.querySelectorAll("[data-resource-list-entry]").forEach(row => {
      const show = (!name || String(row.dataset.resourceFilterName || "").includes(name)) &&
        (!subject || row.dataset.resourceFilterSubject === subject) &&
        (!type || row.dataset.resourceFilterType === type) &&
        (!status || row.dataset.resourceFilterStatus === status);
      row.hidden = !show;
    });
  }

  function resourceSubjectOptions(selectedId) {
    return model.data.subjects
      .filter(subject => subject.active || subject.subjectid === selectedId)
      .map(subject => `<option value="${attr(subject.subjectid)}" ${subject.subjectid === selectedId ? "selected" : ""}>${html(subject.subjectname)}${subject.active ? "" : " — inactive"}</option>`)
      .join("");
  }

  function resourceModuleOptions(subjectId, selectedId) {
    const modules = sortedModules().filter(module => module.subjectid === subjectId && (module.active || module.moduleid === selectedId));
    return `<option value="">No module</option>${modules.map(module => `<option value="${attr(module.moduleid)}" ${module.moduleid === selectedId ? "selected" : ""}>${html(module.modulename)}${module.active ? "" : " — inactive"}</option>`).join("")}`;
  }

  function resourceTaskOptions(subjectId, moduleId, selectedId) {
    const tasks = model.data.tasks.filter(task => task.subjectid === subjectId && String(task.moduleid || "") === String(moduleId || "") && (task.active || task.taskid === selectedId));
    return `<option value="">No task</option>${tasks.map(task => `<option value="${attr(task.taskid)}" ${task.taskid === selectedId ? "selected" : ""}>${html(task.taskname)}${task.active ? "" : " — inactive"}</option>`).join("")}`;
  }

  function renderGlobalDriveRootPanel() {
    const root = model.data.globalResourceDriveRoot || {};
    const canConfigure = root.canconfigure === true && isGlobalAdmin();
    const status = root.configured
      ? `Configured${root.foldername ? `: ${root.foldername}` : ""}`
      : "Not configured";
    return `
      <section class="global-curriculum-drive-root global-resource-root-panel ${root.configured ? "is-configured" : "is-missing"}">
        <div>
          <strong>Change global folder</strong>
          <span>${html(status)}. Changing this setting does not move files; all existing Drive-backed Resources must already be inside the new folder tree.</span>
        </div>
        ${canConfigure ? `
          <label>
            <span>Folder URL or ID</span>
            <input id="gcm-global-drive-root" type="text" value="${attr(root.folderurl || root.folderid || "")}" autocomplete="off" placeholder="https://drive.google.com/drive/folders/…" />
          </label>
          <button type="button" data-gcm-action="save-drive-root">${root.configured ? "Update Folder" : "Save Folder"}</button>
        ` : `
          <span class="global-curriculum-drive-root-authority">A GLOBAL_ADMIN configures this folder.</span>
        `}
      </section>
    `;
  }

  async function openDriveBrowser(resourceKey) {
    const root = model.data.globalResourceDriveRoot || {};
    if (!root.configured) {
      setMessage("Configure the Global Resources Google Drive folder first.", "error");
      return false;
    }
    const draft = resourceDraftByKey(resourceKey);
    if (!draft) return false;
    model.drive.resourceKey = draft.key;
    model.drive.open = true;
    model.drive.data = null;
    setMessage("", "");
    render();
    return loadDriveFolder("");
  }

  async function loadDriveFolder(folderId) {
    if (model.drive.loading) return false;
    model.drive.loading = true;
    render();
    try {
      const result = await workflowPost(
        "/api/admin/platform/global/drive/browse",
        { folderId },
        appState()?.token || ""
      );
      if (!result.success) throw new Error(result.error || "Unable to browse Global Resources Google Drive");
      model.drive.data = result;
      setMessage("", "");
      return true;
    } catch (error) {
      setMessage(error.message || "Unable to browse Global Resources Google Drive.", "error");
      return false;
    } finally {
      model.drive.loading = false;
      render();
    }
  }

  function selectDriveFile(fileId) {
    const items = array(model.drive.data?.items);
    const file = items.find(item => String(item.id || "") === String(fileId || ""));
    if (!file || file.isFolder) return false;
    const draft = resourceDraftByKey(model.drive.resourceKey);
    if (!draft) return false;
    if (!array(file.supportedTypes).includes(draft.resourcetype)) {
      setMessage(`This file is not supported as ${resourceTypeLabel(draft.resourcetype)}.`, "error");
      return false;
    }
    draft.file = file;
    draft.resourceformat = file.format || "FILE";
    draft.legacyExternal = false;
    if (!draft.resourcename) draft.resourcename = stripFileExtension(file.name);
    model.drive.open = false;
    model.drive.data = null;
    model.drive.resourceKey = "";
    setMessage("", "");
    render();
    return true;
  }

  function closeDriveBrowser() {
    model.drive.open = false;
    model.drive.data = null;
    model.drive.resourceKey = "";
    setMessage("", "");
    render();
  }

  function renderDriveBrowser() {
    const draft = resourceDraftByKey(model.drive.resourceKey);
    if (!draft) { model.drive.open = false; return renderResources(); }
    const breadcrumbs = array(model.drive.data?.breadcrumbs);
    const items = array(model.drive.data?.items);
    setContent(`
      <div class="global-curriculum-drive-browser">
        <div class="manage-resource-toolbar">
          <button type="button" class="small-btn" data-gcm-action="cancel-drive-browser">Back</button>
          <strong>Choose ${html(resourceTypeLabel(draft.resourcetype))} File</strong>
        </div>
        <nav class="manage-drive-breadcrumbs" aria-label="Global Resources Google Drive folder path">
          ${breadcrumbs.map((item, index) => `
            ${index ? '<span aria-hidden="true">›</span>' : ""}
            <button type="button" data-gcm-action="drive-breadcrumb" data-folder-id="${attr(item.id)}">${html(item.name)}</button>
          `).join("")}
        </nav>
        <div class="manage-drive-list">
          ${model.drive.loading && !model.drive.data ? '<p class="helper-text">Loading Google Drive...</p>' : ""}
          ${!model.drive.loading && model.drive.data && !items.length ? '<p class="helper-text">This folder is empty.</p>' : ""}
          ${items.map(item => renderDriveItem(item, draft.resourcetype)).join("")}
        </div>
      </div>
    `);
  }

  function renderDriveItem(item, resourceType) {
    if (item.isFolder) {
      return `
        <button type="button" class="manage-drive-item is-folder" data-gcm-action="browse-folder" data-folder-id="${attr(item.id)}">
          <span class="manage-drive-icon" aria-hidden="true">📁</span>
          <span><strong>${html(item.name)}</strong><small>Folder</small></span>
        </button>
      `;
    }
    const supported = array(item.supportedTypes).includes(resourceType);
    const detail = item.isGoogleNative
      ? "Google-native files are not supported"
      : supported
        ? `${item.format || "FILE"}${item.size ? ` · ${formatBytes(item.size)}` : ""}`
        : `Not supported as ${resourceTypeLabel(resourceType)}`;
    return `
      <button type="button" class="manage-drive-item ${supported ? "" : "is-disabled"}" data-gcm-action="select-drive-file" data-file-id="${attr(item.id)}" ${supported ? "" : "disabled"}>
        <span class="manage-drive-icon" aria-hidden="true">📄</span>
        <span><strong>${html(item.name)}</strong><small>${html(detail)}</small></span>
      </button>
    `;
  }

  function updateTaskModuleOptions() {
    const select = document.getElementById("gcm-task-module");
    if (select) select.innerHTML = moduleOptions(value("gcm-task-subject"), "", true);
  }


  function panelForm(title, body) {
    return `<section class="global-curriculum-panel"><div class="global-curriculum-panel-heading"><h3>${html(title)}</h3><button type="button" data-gcm-action="new">New</button></div><div class="global-curriculum-form">${body}</div></section>`;
  }

  function listPanel(title, count, body) {
    return `<section class="global-curriculum-panel global-curriculum-panel--wide"><div class="global-curriculum-panel-heading"><div><h3>${html(title)}</h3><p>${count} records</p></div><button type="button" data-gcm-action="new">New</button></div>${body}</section>`;
  }

  function field(label, control) {
    return `<label class="global-curriculum-field"><span>${html(label)}</span>${control}</label>`;
  }

  function activeField(id, active, label = "Active") {
    return `<label class="global-curriculum-check"><input id="${attr(id)}" type="checkbox" ${active ? "checked" : ""} /><span>${html(label)}</span></label>`;
  }

  function saveButtons(action, editing) {
    const label = editing ? "Save changes" : "Create";
    return `<div class="global-curriculum-form-actions">${editing ? '<button type="button" class="global-curriculum-secondary" data-gcm-action="new">Cancel</button>' : ""}<button type="button" class="global-save-icon-button" data-gcm-action="${attr(action)}" aria-label="${attr(label)}" title="${attr(label)}"><span class="app-icon app-icon-small save-mode-icon" aria-hidden="true"></span><span class="global-save-icon-label">SAVE</span></button></div>`;
  }

  function recordList(items, id, title, subtitle, active) {
    if (!items.length) return '<p class="global-curriculum-empty-list">No records found.</p>';
    return `<div class="global-curriculum-record-list">${items.map(item => `
      <button type="button" class="global-curriculum-record-row ${active(item) ? "" : "is-inactive"}" data-gcm-action="edit" data-record-id="${attr(id(item))}">
        <span><strong>${html(title(item))}</strong><small>${html(subtitle(item))}</small></span>
        <span class="global-curriculum-record-status">${active(item) ? "Active" : "Inactive"}</span>
      </button>
    `).join("")}</div>`;
  }

  function subjectOptions(selectedId, includeId) {
    return model.data.subjects
      .filter(subject => subject.active || subject.subjectid === includeId || subject.subjectid === selectedId)
      .map(subject => `<option value="${attr(subject.subjectid)}" ${subject.subjectid === selectedId ? "selected" : ""}>${html(subject.subjectname)}${subject.active ? "" : " — inactive"}</option>`)
      .join("");
  }

  function moduleOptions(subjectId, selectedId, optional) {
    const options = sortedModules().filter(module => (
      module.subjectid === subjectId && (module.active || module.moduleid === selectedId)
    ));
    return `${optional ? '<option value="">No module</option>' : ""}${options.map(module => `<option value="${attr(module.moduleid)}" ${module.moduleid === selectedId ? "selected" : ""}>${html(module.modulename)}${module.active ? "" : " — inactive"}</option>`).join("")}`;
  }

  function taskOptions(subjectId, moduleId, selectedId) {
    const options = model.data.tasks.filter(task => (
      task.subjectid === subjectId &&
      String(task.moduleid || "") === String(moduleId || "") &&
      (task.active || task.taskid === selectedId)
    ));
    return `<option value="">No task</option>${options.map(task => `<option value="${attr(task.taskid)}" ${task.taskid === selectedId ? "selected" : ""}>${html(task.taskname)}${task.active ? "" : " — inactive"}</option>`).join("")}`;
  }

  function sortedModules() {
    return [...model.data.modules].sort((left, right) => (
      subjectName(left.subjectid).localeCompare(subjectName(right.subjectid)) ||
      Number(left.sortorder || 0) - Number(right.sortorder || 0) ||
      left.modulename.localeCompare(right.modulename)
    ));
  }

  function nextModuleSort(subjectId) {
    return Math.max(0, ...model.data.modules
      .filter(module => module.subjectid === subjectId)
      .map(module => Number(module.sortorder) || 0)) + 1;
  }

  function subjectName(subjectId) {
    return findById(model.data.subjects, "subjectid", subjectId)?.subjectname || subjectId || "Unknown subject";
  }

  function moduleName(moduleId) {
    return findById(model.data.modules, "moduleid", moduleId)?.modulename || moduleId || "";
  }

  function accountName(accountId) {
    return findById(model.data.accounts, "accountid", accountId)?.displayname || accountId || "Unknown account";
  }

  function firstActive(items, key) {
    return items.find(item => item.active)?.[key] || items[0]?.[key] || "";
  }

  function findById(items, key, id) {
    return array(items).find(item => String(item?.[key] || "") === String(id || "")) || null;
  }

  function formatDependencies(dependencies) {
    const parts = Object.entries(dependencies)
      .filter(([, count]) => Number(count) > 0)
      .map(([name, count]) => `${count} ${name}`);
    return parts.length ? ` Referenced by ${parts.join(", ")}.` : " No dependent records were found.";
  }

  function resourceTypeLabel(type) {
    const labels = {
      EBOOK: "eBook",
      PRINTABLE: "Printable",
      AUDIO: "Audio",
      VIDEO: "Video",
      OTHER: "Other Resource"
    };
    return labels[String(type || "").toUpperCase()] || "Resource";
  }

  function stripFileExtension(name) {
    return String(name || "").replace(/\.[^.]+$/, "") || String(name || "");
  }

  function formatBytes(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return "";
    if (number < 1024) return `${number} B`;
    if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`;
    if (number < 1024 * 1024 * 1024) return `${(number / (1024 * 1024)).toFixed(1)} MB`;
    return `${(number / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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

  function invalidate() {
    model.loaded = false;
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

  function cssEscapeValue(value) {
    const text = String(value || "");
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(text);
    return text.replace(/[^a-zA-Z0-9_-]/g, character => `\${character}`);
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
    const writing = !path.endsWith("/get") && !path.endsWith("/browse");
    let input = body;
    let retryKey = "";
    if (writing && workflowRevision !== null) {
      retryKey = JSON.stringify([path, body, workflowRevision]);
      if (!pendingWorkflowChanges.has(retryKey)) pendingWorkflowChanges.set(retryKey, crypto.randomUUID());
      input = { ...body, workflowRevision, operationId: pendingWorkflowChanges.get(retryKey) };
    }
    const result = await apiPost(path, input, token);
    if (result.success && result.workflowStore === "D1" && (writing || path.endsWith("/get"))) workflowRevision = String(result.workflowRevision);
    if (result.success && retryKey) pendingWorkflowChanges.delete(retryKey);
    return result;
  }


  window.M4LGlobalCurriculum = Object.freeze({ show, syncAccess, load, invalidate });
  window.showGlobalCurriculumManagement = show;
})();
