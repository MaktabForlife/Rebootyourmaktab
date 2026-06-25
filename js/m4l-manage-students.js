/* M4L v43 - Manage Students module
   Load after /app.js, /js/m4l-auth.js, /js/m4l-shell.js, /js/m4l-timetable.js, /js/m4l-resources.js, and /js/m4l-progress.js.
   This is a classic script, not type=module, so existing global function calls remain safe
   while the app is split gradually.
   Owns Register Student, Modify Student, result actions, copy/WhatsApp actions, and Manage Students UI handlers.
*/

/* =========================
   MANAGE STUDENTS UI
========================= */

const manageStudentsState = {
  mode: "register",
  assignmentOptions: null,
  allStudents: [],
  searchResults: [],
  searchQuery: "",
  studentListLoaded: false,
  studentListLoading: false,
  selectedStudent: null,
  lastRegisteredStudent: null,
  selectedStudentActiveDraft: true,
  studentDropdownOpen: false,
  registerSubmitting: false
};


let manageStudentsGlobalClickBound = false;
let managedStudentSaveLastTriggeredAt = 0;

function bindManageStudentsGlobalClickHandler() {
  if (manageStudentsGlobalClickBound === true) return true;
  if (!document || typeof document.addEventListener !== "function") return false;

  manageStudentsGlobalClickBound = true;
  document.addEventListener("click", handleManageStudentsUiClick);
  return true;
}

function bindManageStudentsUiHandlers(containerOrId) {
  const container = getDomElement(containerOrId);

  bindManageStudentsGlobalClickHandler();

  if (!container || container.__manageStudentsHandlersBound === true) {
    return !!container;
  }

  container.__manageStudentsHandlersBound = true;
  container.addEventListener("input", handleManageStudentsUiInput);
  container.addEventListener("keydown", handleManageStudentsUiKeydown);
  container.addEventListener("change", handleManageStudentsUiChange);
  return true;
}

function triggerManagedStudentSave() {
  const now = Date.now();
  if (now - managedStudentSaveLastTriggeredAt < 700) return;
  managedStudentSaveLastTriggeredAt = now;

  saveManagedStudentChanges();
}

function bindManagedStudentEditActionHandlers(containerOrId) {
  // Kept for compatibility with existing render calls.
  // Manage Students click actions are now handled by one document-level delegated handler,
  // so dynamically-rendered buttons such as Confirm Changes do not need per-button touch/click binding.
  bindManageStudentsGlobalClickHandler();
  return !!getDomElement(containerOrId);
}

function getManageStudentsActionElement(event) {
  const target = event && event.target;
  if (!target || typeof target.closest !== "function") return null;

  const actionEl = target.closest("[data-manage-action]");
  if (!actionEl) return null;

  const manageScope = actionEl.closest(
    "#manage-students-screen, #manage-student-edit-screen, #manage-students-result-screen, " +
    "#manage-students-content, #manage-student-edit-content, #manage-students-result-content"
  );

  return manageScope ? actionEl : null;
}

function isNativeManageStudentsInputAction(action) {
  return action === "set-active-status" ||
    action === "assignment-mode" ||
    action === "toggle-subject-modules";
}

function handleManageStudentsUiClick(event) {
  const actionEl = getManageStudentsActionElement(event);
  if (!actionEl) return;

  const action = actionEl.dataset.manageAction || "";
  if (!action) return;

  // Do not prevent the browser's native radio/checkbox behaviour.
  // The matching change handler will update state after the control changes.
  if (isNativeManageStudentsInputAction(action)) {
    return;
  }

  event.preventDefault();

  switch (action) {
    case "set-mode":
      setManageStudentsMode(actionEl.dataset.manageMode || "register");
      break;
    case "submit-register":
      submitRegisterStudent(actionEl.dataset.confirmDuplicate === "true");
      break;
    case "register-another":
      registerAnotherManagedStudent();
      break;
    case "exit-dashboard":
      showScreen("admin-home");
      break;
    case "back-to-list":
      backToManagedStudentList();
      break;
    case "toggle-dropdown":
      toggleManagedStudentDropdown();
      break;
    case "select-student":
      selectManagedStudentByUniqueId(actionEl.dataset.uniqueid || "");
      break;
    case "reset-pin":
      resetManagedStudentPin();
      break;
    case "save-student":
      triggerManagedStudentSave();
      break;
    case "copy-login-link":
      copyStudentLoginLink(actionEl.dataset.loginLink || "");
      break;
    case "copy-welcome-message":
      copyStudentWelcomeMessageFromBox(
        actionEl.dataset.messageBoxId || "",
        actionEl.dataset.loginLink || ""
      );
      break;
    case "open-whatsapp":
      openStudentWhatsAppMessageFromBox(
        actionEl.dataset.messageBoxId || "",
        actionEl.dataset.loginLink || ""
      );
      break;
    default:
      console.warn("Unknown Manage Students action:", action);
  }
}

function handleManageStudentsUiInput(event) {
  const target = event.target;

  if (target && target.id === "student-search-query") {
    filterManagedStudentsFromInput();
  }
}

function handleManageStudentsUiKeydown(event) {
  const target = event.target;

  if (target && target.id === "student-search-query" && event.key === "Enter") {
    event.preventDefault();
    searchManagedStudents();
  }
}

function handleManageStudentsUiChange(event) {
  const target = event.target;

  if (!target) return;

  if (target.name === "student-assignment-mode") {
    toggleStudentAssignmentMode();
    return;
  }

  if (target.dataset && target.dataset.manageAction === "toggle-subject-modules") {
    toggleStudentSubjectModules(target.dataset.subjectid || "", target.checked === true);
    return;
  }

  if (target.name === "student-edit-active") {
    setStudentEditActiveStatus(target.value === "true");
  }
}

function showManageStudents() {
  manageStudentsState.mode = "register";
  manageStudentsState.searchResults = [];
  manageStudentsState.searchQuery = "";
  manageStudentsState.selectedStudent = null;
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.selectedStudentActiveDraft = true;
  manageStudentsState.studentDropdownOpen = false;
  manageStudentsState.registerSubmitting = false;

  if (!showScreen("manage-students-screen")) return;

  renderManageStudentsScreen();
  loadStudentAssignmentOptions();
}

async function loadStudentAssignmentOptions() {
  if (manageStudentsState.assignmentOptions) {
    renderManageStudentsScreen();
    return;
  }

  try {
    const result = await apiPost("/api/admin/students/assignment-options", {}, state.token);

    if (result.success) {
      manageStudentsState.assignmentOptions = result.subjects || [];
    } else {
      manageStudentsState.assignmentOptions = [];
    }
  } catch (err) {
    console.error("Could not load student assignment options", err);
    manageStudentsState.assignmentOptions = [];
  }

  renderManageStudentsScreen();
}

function setManageStudentsMode(mode) {
  manageStudentsState.mode = mode === "modify" ? "modify" : "register";
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.registerSubmitting = false;

  if (manageStudentsState.mode === "modify") {
    manageStudentsState.selectedStudent = null;
    manageStudentsState.studentDropdownOpen = false;
    renderManageStudentsScreen();
    loadManagedStudentList(false);
    return;
  }

  manageStudentsState.studentDropdownOpen = false;
  renderManageStudentsScreen();
}

function renderManageStudentsScreen() {
  const container = getDomElement("manage-students-content");
  if (!container) return;

  const isRegister = manageStudentsState.mode === "register";

  setDomHtml(container, `
    <div class="student-admin-mode-toggle" role="tablist" aria-label="Student management mode">
      <button
        type="button"
        class="student-admin-mode-btn ${isRegister ? "is-active" : ""}"
        data-manage-action="set-mode"
        data-manage-mode="register"
      >
        Register
      </button>
      <button
        type="button"
        class="student-admin-mode-btn ${!isRegister ? "is-active" : ""}"
        data-manage-action="set-mode"
        data-manage-mode="modify"
      >
        Modify
      </button>
    </div>

    ${isRegister ? renderRegisterStudentPanel() : renderModifyStudentPanel()}
  `);

  bindManageStudentsUiHandlers(container);
}

function renderRegisterStudentPanel() {
  return `
    <div class="student-admin-card">
      <div class="student-admin-card-title">Register Student</div>
      <label class="student-admin-label" for="student-register-name">Name</label>
      <input id="student-register-name" type="text" placeholder="Student name" autocomplete="off" />

      <label class="student-admin-label" for="student-register-whatsapp">WhatsApp Number</label>
      <input id="student-register-whatsapp" type="tel" inputmode="tel" placeholder="WhatsApp number" autocomplete="off" />

      <label class="student-admin-label" for="student-register-group">Group</label>
      <input id="student-register-group" type="number" inputmode="numeric" min="1" value="${DEFAULT_STUDENT_GROUP}" />
    </div>

    <div class="student-admin-card">
      <div class="student-admin-card-title">Task Assignment</div>

      <label class="student-admin-radio-row">
        <input type="radio" name="student-assignment-mode" value="all" checked data-manage-action="assignment-mode" />
        <span>Assign all active subjects and modules</span>
      </label>

      <label class="student-admin-radio-row is-disabled" title="Manual task selection will be added later.">
        <input type="radio" name="student-assignment-mode" value="selected" disabled />
        <span>Select subjects/modules manually <small class="student-admin-coming-soon">Coming soon</small></span>
      </label>

      <p class="student-admin-help">Manual subject/module selection is temporarily disabled. New students will receive all active tasks.</p>

      <div id="student-assignment-options" class="student-assignment-options hidden" aria-hidden="true">
        ${renderStudentAssignmentOptions()}
      </div>
    </div>

    <div class="student-admin-action-grid">
      <button type="button" data-manage-action="submit-register">Register Student</button>
    </div>

    <div id="student-register-feedback" class="student-admin-feedback"></div>
  `;
}

function setRegisterStudentSubmitting(isSubmitting) {
  manageStudentsState.registerSubmitting = isSubmitting === true;

  const container = getDomElement("manage-students-content");
  if (!container) return;

  [
    "student-register-name",
    "student-register-whatsapp",
    "student-register-group"
  ].forEach((id) => {
    const input = getDomElement(id);
    if (input) {
      input.disabled = manageStudentsState.registerSubmitting;
    }
  });

  container.querySelectorAll('input[name="student-assignment-mode"], .student-module-checkbox, [data-manage-action="toggle-subject-modules"]').forEach((input) => {
    if (!input) return;
    if (input.dataset && input.dataset.permanentlyDisabled === "true") return;
    input.disabled = manageStudentsState.registerSubmitting;
  });

  const manualMode = container.querySelector('input[name="student-assignment-mode"][value="selected"]');
  if (manualMode) {
    manualMode.disabled = true;
    manualMode.dataset.permanentlyDisabled = "true";
  }

  const submitButton = container.querySelector('[data-manage-action="submit-register"]');
  if (submitButton) {
    submitButton.disabled = manageStudentsState.registerSubmitting;
    submitButton.setAttribute("aria-busy", manageStudentsState.registerSubmitting ? "true" : "false");
    submitButton.textContent = manageStudentsState.registerSubmitting ? "Registering..." : "Register Student";
  }
}

function clearRegisterStudentForm() {
  const nameInput = getDomElement("student-register-name");
  const whatsappInput = getDomElement("student-register-whatsapp");
  const groupInput = getDomElement("student-register-group");

  if (nameInput) nameInput.value = "";
  if (whatsappInput) whatsappInput.value = "";
  if (groupInput) groupInput.value = String(DEFAULT_STUDENT_GROUP);

  const assignmentAll = document.querySelector('input[name="student-assignment-mode"][value="all"]');
  if (assignmentAll) assignmentAll.checked = true;

  document.querySelectorAll(".student-module-checkbox").forEach((input) => {
    input.checked = false;
  });

  const optionsBox = getDomElement("student-assignment-options");
  if (optionsBox) {
    optionsBox.classList.add("hidden");
    optionsBox.setAttribute("aria-hidden", "true");
  }

  setDomText("student-register-feedback", "");
}

function renderStudentAssignmentOptions() {
  const subjects = manageStudentsState.assignmentOptions;

  if (!subjects) {
    return `<p class="helper-text">Loading subjects and modules...</p>`;
  }

  if (subjects.length === 0) {
    return `<p class="helper-text">No active subject/module tasks found.</p>`;
  }

  return subjects.map(subject => {
    const subjectId = String(subject.subjectid || "");
    const subjectName = subject.subjectname || subjectId;
    const modules = Array.isArray(subject.modules) ? subject.modules : [];

    const moduleRows = modules.map(module => {
      const moduleId = String(module.moduleid || "");
      const moduleName = module.modulename || moduleId || "General";
      const taskCount = Number(module.taskCount || 0);

      return `
        <label class="student-module-check-row">
          <input
            type="checkbox"
            class="student-module-checkbox"
            data-subjectid="${escapeAttribute(subjectId)}"
            data-moduleid="${escapeAttribute(moduleId)}"
          />
          <span>${escapeHtml(moduleName)}</span>
          <small>${taskCount} task${taskCount === 1 ? "" : "s"}</small>
        </label>
      `;
    }).join("");

    return `
      <div class="student-assignment-subject-card">
        <label class="student-subject-check-row">
          <input type="checkbox" data-manage-action="toggle-subject-modules" data-subjectid="${escapeAttribute(subjectId)}" />
          <span>${escapeHtml(subjectName)}</span>
        </label>
        <div class="student-module-check-list">
          ${moduleRows}
        </div>
      </div>
    `;
  }).join("");
}

function toggleStudentAssignmentMode() {
  const selectedMode = getSelectedStudentAssignmentMode();
  const optionsBox = getDomElement("student-assignment-options");

  if (!optionsBox) return;

  if (selectedMode === "selected") {
    optionsBox.classList.remove("hidden");
  } else {
    optionsBox.classList.add("hidden");
  }
}

function getSelectedStudentAssignmentMode() {
  const selected = document.querySelector('input[name="student-assignment-mode"]:checked');

  if (!selected || selected.disabled) {
    return "all";
  }

  return selected.value === "selected" ? "selected" : "all";
}

function toggleStudentSubjectModules(subjectId, checked) {
  document.querySelectorAll(`.student-module-checkbox[data-subjectid="${cssEscapeValue(subjectId)}"]`).forEach(input => {
    input.checked = checked;
  });
}

function collectSelectedStudentModules() {
  return Array.from(document.querySelectorAll(".student-module-checkbox:checked")).map(input => ({
    subjectid: input.dataset.subjectid || "",
    moduleid: input.dataset.moduleid || ""
  })).filter(item => item.subjectid && item.moduleid);
}

async function submitRegisterStudent(confirmDuplicate) {
  if (manageStudentsState.registerSubmitting === true) {
    return;
  }

  const nameInput = getDomElement("student-register-name");
  const whatsappInput = getDomElement("student-register-whatsapp");
  const groupInput = getDomElement("student-register-group");

  const username = nameInput ? nameInput.value.trim() : "";
  const whatsapp6 = getLastSixDigits(whatsappInput ? whatsappInput.value : "");
  const classgroup = groupInput && groupInput.value.trim() ? groupInput.value.trim() : String(DEFAULT_STUDENT_GROUP);
  const assignmentMode = getSelectedStudentAssignmentMode();
  const selectedModules = assignmentMode === "selected" ? collectSelectedStudentModules() : [];

  if (!username) {
    alert("Enter the student's name.");
    return;
  }

  if (assignmentMode === "selected" && selectedModules.length === 0) {
    alert("Select at least one subject/module, or choose Assign all active subjects and modules.");
    return;
  }

  setRegisterStudentSubmitting(true);
  setDomText("student-register-feedback", "Registering student...");

  let result;

  try {
    result = await apiPost("/api/admin/register-student", {
      username,
      whatsapp6,
      classgroup,
      confirmDuplicate: confirmDuplicate === true,
      assignmentMode,
      selectedModules
    }, state.token);
  } catch (err) {
    console.error("Student registration failed", err);
    setRegisterStudentSubmitting(false);
    setDomText("student-register-feedback", "Registration failed. Please try again.");
    return;
  }

  if (result.duplicate) {
    setRegisterStudentSubmitting(false);
    setDomText("student-register-feedback", "Possible duplicate found.");

    const duplicateText = (result.matches || [])
      .map(match => `${match.username || "Student"} · Group ${match.classgroup || "-"} · WhatsApp ${match.whatsapp6 || "-"}`)
      .join("\n");

    const proceed = confirm(
      "Possible duplicate student found:\n\n" +
      duplicateText +
      "\n\nRegister anyway?"
    );

    if (proceed) {
      await submitRegisterStudent(true);
    }

    return;
  }

  if (!result.success) {
    setRegisterStudentSubmitting(false);
    setDomText("student-register-feedback", result.error || "Registration failed.");
    return;
  }

  manageStudentsState.lastRegisteredStudent = normalizeManagedStudent(result);

  clearRegisterStudentForm();

  if (!showScreen("manage-students-result-screen")) {
    setRegisterStudentSubmitting(false);
    return;
  }

  renderManageStudentResultScreen("registered");
  setRegisterStudentSubmitting(false);
}

function renderManageStudentResultScreen(context) {
  const container = getDomElement("manage-students-result-content");
  if (!container) return;

  const student = manageStudentsState.lastRegisteredStudent || manageStudentsState.selectedStudent;

  if (!student) {
    setDomHtml(container, `<p class="helper-text">No student selected.</p>`);
    return;
  }

  const actionButtons = context === "registered"
    ? `
      <div class="student-admin-action-grid two-col">
        <button type="button" data-manage-action="register-another">Register Another Student</button>
        <button type="button" class="home-text-action-btn" data-manage-action="exit-dashboard"><span class="home-text-action-btn__icon" aria-hidden="true"></span><span>Exit to Dashboard</span></button>
      </div>
    `
    : `
      <div class="student-admin-action-grid two-col">
        <button type="button" class="back-icon-btn icon-action-btn icon-action-btn-large" data-manage-action="back-to-list" aria-label="Back to student list" title="Back to student list"><span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/back.svg')" aria-hidden="true"></span><span class="header-icon-label">Back</span></button>
        <button type="button" class="home-text-action-btn" data-manage-action="exit-dashboard"><span class="home-text-action-btn__icon" aria-hidden="true"></span><span>Exit to Dashboard</span></button>
      </div>
    `;

  setDomHtml(container, `
    ${renderStudentMessageResult(student, context || "registered")}
    ${actionButtons}
  `);

  bindManageStudentsUiHandlers(container);
}

function registerAnotherManagedStudent() {
  manageStudentsState.mode = "register";
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.selectedStudent = null;
  manageStudentsState.registerSubmitting = false;

  if (!showScreen("manage-students-screen")) return;

  renderManageStudentsScreen();
}

function backToManagedStudentList() {
  manageStudentsState.mode = "modify";
  manageStudentsState.selectedStudent = null;

  if (!showScreen("manage-students-screen")) return;

  renderManageStudentsScreen();
  if (!manageStudentsState.studentListLoaded) {
    loadManagedStudentList(false);
  }
}

function renderModifyStudentPanel() {
  const listHtml = renderManagedStudentList();
  const loadingText = manageStudentsState.studentListLoading
    ? `<p class="student-admin-help">Loading student list...</p>`
    : "";
  const shownCount = manageStudentsState.searchResults.length;
  const totalCount = manageStudentsState.allStudents.length;
  const dropdownLabel = manageStudentsState.studentDropdownOpen ? "▲" : "▼";

  return `
    <div class="student-admin-card student-search-panel">
      <div class="student-admin-card-title">Find Student</div>
      <label class="student-admin-label" for="student-search-query">Search by name or WhatsApp number</label>

      <div class="student-search-dropdown-row">
        <input
          id="student-search-query"
          type="text"
          placeholder="Type a name or WhatsApp number"
          autocomplete="off"
          value="${escapeAttribute(manageStudentsState.searchQuery || "")}"

        />
        <button
          type="button"
          class="student-search-arrow-btn"
          data-manage-action="toggle-dropdown"
          aria-label="Show student list"
        >${dropdownLabel}</button>
      </div>

      <p class="student-admin-help">Tap the arrow to open the student list, or type to filter.</p>
      <div id="student-search-feedback" class="student-admin-feedback">
        ${manageStudentsState.studentListLoaded ? `${shownCount} of ${totalCount} student${totalCount === 1 ? "" : "s"} shown.` : ""}
      </div>
      ${loadingText}

      <div class="student-search-dropdown managed-student-list ${manageStudentsState.studentDropdownOpen ? "is-open" : ""}">
        ${listHtml}
      </div>
    </div>
  `;
}

async function loadManagedStudentList(forceRefresh) {
  if (manageStudentsState.studentListLoading) return;

  if (manageStudentsState.studentListLoaded && forceRefresh !== true) {
    applyManagedStudentFilter(manageStudentsState.searchQuery || "");
    renderManageStudentsScreen();
    return;
  }

  manageStudentsState.studentListLoading = true;
  renderManageStudentsScreen();

  let result;

  try {
    result = await apiPost("/api/admin/students/search", {
      query: "",
      listAll: true
    }, state.token);
  } catch (err) {
    console.error("Could not load managed student list", err);
    result = { success: false, error: "Could not load student list." };
  }

  manageStudentsState.studentListLoading = false;

  if (!result.success) {
    manageStudentsState.allStudents = [];
    manageStudentsState.searchResults = [];
    manageStudentsState.studentListLoaded = true;
    renderManageStudentsScreen();
    setDomText("student-search-feedback", result.error || "Could not load student list.");
    return;
  }

  manageStudentsState.allStudents = sortManagedStudents((result.students || []).map(normalizeManagedStudent));
  manageStudentsState.studentListLoaded = true;
  applyManagedStudentFilter(manageStudentsState.searchQuery || "");
  renderManageStudentsScreen();
  setDomText("student-search-feedback", `${manageStudentsState.searchResults.length} student${manageStudentsState.searchResults.length === 1 ? "" : "s"} shown.`);
}

function getManagedStudentDisplayGroup(student) {
  const rawGroup = String(student && student.classgroup !== undefined ? student.classgroup : "").trim();
  const groupNumber = Number(rawGroup);
  const isGroupZero = rawGroup === "0" || groupNumber === 0;
  const isInactive = !(student && student.active === true);

  if (isInactive || isGroupZero) {
    return "inactive";
  }

  return rawGroup || String(DEFAULT_STUDENT_GROUP);
}

function getManagedStudentGroupSortValue(student) {
  const displayGroup = getManagedStudentDisplayGroup(student);

  if (displayGroup === "inactive") {
    return Number.NEGATIVE_INFINITY;
  }

  const groupNumber = Number(displayGroup);

  if (Number.isFinite(groupNumber)) {
    return groupNumber;
  }

  return 0;
}

function sortManagedStudents(students) {
  return (students || []).slice().sort((a, b) => {
    const groupCompare = getManagedStudentGroupSortValue(b) - getManagedStudentGroupSortValue(a);

    if (groupCompare !== 0) return groupCompare;

    return String(a.username || "").localeCompare(String(b.username || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

function renderManagedStudentList() {
  if (manageStudentsState.studentListLoading && !manageStudentsState.studentListLoaded) {
    return `<p class="helper-text">Loading students...</p>`;
  }

  if (!manageStudentsState.studentListLoaded) {
    return `<p class="helper-text">Open Modify to load the student list.</p>`;
  }

  const rows = manageStudentsState.searchResults || [];

  if (rows.length === 0) {
    return `<p class="helper-text">No matching students found.</p>`;
  }

  let currentGroup = "__NONE__";
  let html = "";

  rows.forEach(student => {
    const group = getManagedStudentDisplayGroup(student);

    if (group !== currentGroup) {
      currentGroup = group;
      html += `<div class="managed-student-group-separator" aria-hidden="true"></div>`;
    }

    html += `
      <button type="button" class="student-search-row" data-manage-action="select-student" data-uniqueid="${escapeAttribute(student.uniqueid)}">
        <span class="student-search-row-name">${escapeHtml(student.username || "Student")}</span>
        <span class="student-search-row-number">${escapeHtml(student.whatsapp6 || "999999")}</span>
      </button>
    `;
  });

  return html;
}

function toggleManagedStudentDropdown() {
  manageStudentsState.studentDropdownOpen = !manageStudentsState.studentDropdownOpen;

  if (!manageStudentsState.studentListLoaded && !manageStudentsState.studentListLoading) {
    loadManagedStudentList(false);
    return;
  }

  renderManageStudentsScreen();
}

function filterManagedStudentsFromInput() {
  const input = getDomElement("student-search-query");
  const query = input ? input.value : "";
  manageStudentsState.searchQuery = query;
  manageStudentsState.studentDropdownOpen = true;
  applyManagedStudentFilter(query);
  updateManagedStudentListOnly();
}

function updateManagedStudentListOnly() {
  const list = document.querySelector(".managed-student-list");

  if (list) {
    setDomHtml(list, renderManagedStudentList());
  }

  setDomText("student-search-feedback", `${manageStudentsState.searchResults.length} student${manageStudentsState.searchResults.length === 1 ? "" : "s"} shown.`);
}

function applyManagedStudentFilter(query) {
  const rawQuery = String(query || "").trim();
  const normalizedQuery = normalizeStudentSearchText(rawQuery);
  const queryWords = normalizedQuery ? normalizedQuery.split(" ").filter(Boolean) : [];
  const queryDigits = rawQuery.replace(/\D/g, "");

  if (!rawQuery) {
    manageStudentsState.searchResults = sortManagedStudents(manageStudentsState.allStudents || []);
    return;
  }

  manageStudentsState.searchResults = sortManagedStudents((manageStudentsState.allStudents || []).filter(student => {
    const normalizedName = normalizeStudentSearchText(student.username || "");
    const whatsappDigits = String(student.whatsapp6 || "").replace(/\D/g, "");

    const nameMatches = normalizedQuery && (
      normalizedName.indexOf(normalizedQuery) !== -1 ||
      queryWords.every(word => normalizedName.indexOf(word) !== -1)
    );

    const whatsappMatches = Boolean(
      queryDigits && whatsappDigits && (
        whatsappDigits === queryDigits ||
        whatsappDigits.endsWith(queryDigits) ||
        whatsappDigits.indexOf(queryDigits) !== -1
      )
    );

    return nameMatches || whatsappMatches;
  }));
}

function normalizeStudentSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function handleStudentSearchKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    searchManagedStudents();
  }
}

async function searchManagedStudents() {
  const input = getDomElement("student-search-query");
  const rawQuery = input ? input.value.trim() : "";
  manageStudentsState.searchQuery = rawQuery;

  if (!manageStudentsState.studentListLoaded) {
    await loadManagedStudentList(false);
  } else {
    applyManagedStudentFilter(rawQuery);
    updateManagedStudentListOnly();
  }
}

function selectManagedStudentByUniqueId(uniqueid) {
  const student = (manageStudentsState.allStudents || []).find(row => row.uniqueid === uniqueid) ||
    (manageStudentsState.searchResults || []).find(row => row.uniqueid === uniqueid);

  if (!student) return;

  manageStudentsState.selectedStudent = normalizeManagedStudent(student);
  manageStudentsState.selectedStudentActiveDraft = manageStudentsState.selectedStudent.active === true;
  manageStudentsState.studentDropdownOpen = false;

  if (!showScreen("manage-student-edit-screen")) return;

  renderManagedStudentEditScreen();
}

function selectManagedStudent(index) {
  const student = manageStudentsState.searchResults[index];

  if (!student) return;

  manageStudentsState.selectedStudent = normalizeManagedStudent(student);
  manageStudentsState.selectedStudentActiveDraft = manageStudentsState.selectedStudent.active === true;
  manageStudentsState.studentDropdownOpen = false;

  if (!showScreen("manage-student-edit-screen")) return;

  renderManagedStudentEditScreen();
}

function renderManagedStudentEditScreen() {
  const container = getDomElement("manage-student-edit-content");
  if (!container) return;

  if (!manageStudentsState.selectedStudent) {
    setDomHtml(container, `<p class="helper-text">No student selected.</p>`);
    return;
  }

  setDomHtml(container, renderSelectedStudentEditor());
  bindManageStudentsUiHandlers(container);
  bindManagedStudentEditActionHandlers(container);
}

function renderSelectedStudentEditor() {
  const student = manageStudentsState.selectedStudent;

  return `
    <div class="student-admin-card selected-student-card">
      <div class="student-admin-card-title">Selected Student</div>
      <div class="selected-student-heading compact-selected-student-heading">
        <div>
          <strong>${escapeHtml(student.username || "Student")}</strong>
          <small>${escapeHtml(student.whatsapp6 || "999999")}</small>
        </div>
      </div>
    </div>

    <div class="student-admin-action-grid">
      <button type="button" class="student-reset-pin-btn" data-manage-action="reset-pin">Reset PIN</button>
    </div>

    <div class="student-admin-card selected-student-edit-card">
      <div class="student-admin-card-title">Edit Student Details</div>

      <label class="student-admin-label" for="student-edit-name">Name</label>
      <input id="student-edit-name" class="student-prefilled-input" type="text" value="${escapeAttribute(student.username || "")}" />

      <label class="student-admin-label" for="student-edit-whatsapp">WhatsApp Number</label>
      <input id="student-edit-whatsapp" class="student-prefilled-input" type="tel" inputmode="tel" value="${escapeAttribute(student.whatsapp6 || "")}" />

      <div class="student-edit-two-column-row">
        <div class="student-edit-field-half">
          <label class="student-admin-label" for="student-edit-group">Group</label>
          <input
            id="student-edit-group"
            class="student-prefilled-input"
            type="number"
            inputmode="numeric"
            min="0"
            value="${escapeAttribute(student.classgroup || DEFAULT_STUDENT_GROUP)}"
          />
        </div>

        <div class="student-edit-field-half">
          <label class="student-admin-label">Active Status</label>
          <div class="student-admin-radio-group student-edit-status-radio-group" role="radiogroup" aria-label="Active Status">
            <label class="student-admin-radio-row student-edit-status-radio ${manageStudentsState.selectedStudentActiveDraft === true ? "is-selected" : ""}">
              <input
                type="radio"
                name="student-edit-active"
                value="true"
                ${manageStudentsState.selectedStudentActiveDraft === true ? "checked" : ""}
              />
              <span>Active</span>
            </label>

            <label class="student-admin-radio-row student-edit-status-radio ${manageStudentsState.selectedStudentActiveDraft === true ? "" : "is-selected"}">
              <input
                type="radio"
                name="student-edit-active"
                value="false"
                ${manageStudentsState.selectedStudentActiveDraft === true ? "" : "checked"}
              />
              <span>Inactive</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="student-admin-action-grid">
      <button type="button" data-manage-action="save-student">Confirm Changes</button>
    </div>

    ${renderStudentMessageResult(student, "selected")}

    <div id="student-edit-feedback" class="student-admin-feedback"></div>
  `;
}

function setStudentEditActiveStatus(isActive) {
  manageStudentsState.selectedStudentActiveDraft = isActive === true;

  document.querySelectorAll(".student-edit-status-radio").forEach(option => {
    const input = option.querySelector("input");
    option.classList.toggle("is-selected", !!input && input.checked);
  });
}

function toggleSelectedStudentActive() {
  setStudentEditActiveStatus(!manageStudentsState.selectedStudentActiveDraft);
}

async function saveManagedStudentChanges() {
  const student = manageStudentsState.selectedStudent;
  const nameInput = getDomElement("student-edit-name");
  const whatsappInput = getDomElement("student-edit-whatsapp");
  const groupInput = getDomElement("student-edit-group");

  if (!student) return;

  const username = nameInput ? nameInput.value.trim() : "";
  const whatsappRaw = whatsappInput ? whatsappInput.value.trim() : "";
  const classgroup = groupInput && groupInput.value.trim() ? groupInput.value.trim() : String(DEFAULT_STUDENT_GROUP);
  const activeRadio = document.querySelector('input[name="student-edit-active"]:checked');
  const active = activeRadio
    ? activeRadio.value === "true"
    : manageStudentsState.selectedStudentActiveDraft === true;

  if (!username) {
    alert("Name cannot be empty.");
    return;
  }

  const payload = {
    uniqueid: student.uniqueid,
    username,
    classgroup,
    active
  };

  const whatsapp6 = getLastSixDigits(whatsappRaw);

  if (whatsapp6 !== student.whatsapp6) {
    payload.whatsapp6 = whatsapp6;
  }

  setDomText("student-edit-feedback", "Saving changes...");

  let result;

  try {
    result = await apiPost("/api/admin/update-student", payload, state.token);
  } catch (err) {
    console.error("Could not save managed student changes", err);
    setDomText("student-edit-feedback", "Could not save changes.");
    return;
  }

  if (!result.success) {
    setDomText("student-edit-feedback", result.error || "Could not save changes.");
    return;
  }

  manageStudentsState.selectedStudent = normalizeManagedStudent({
    ...student,
    ...result,
    username,
    classgroup,
    active: payload.active,
    whatsapp6: payload.whatsapp6 || student.whatsapp6
  });

  manageStudentsState.allStudents = manageStudentsState.allStudents.map(row => {
    if (row.uniqueid === student.uniqueid) {
      return manageStudentsState.selectedStudent;
    }
    return row;
  });

  applyManagedStudentFilter(manageStudentsState.searchQuery || "");
  renderManagedStudentEditScreen();

  setDomText("student-edit-feedback", "Student changes saved.");
}

async function resetManagedStudentPin() {
  const student = manageStudentsState.selectedStudent;

  if (!student) return;

  const proceed = confirm("Reset this student's PIN? They will create a new 4-digit PIN on next login.");
  if (!proceed) return;

  setDomText("student-edit-feedback", "Resetting PIN...");

  let result;

  try {
    result = await apiPost("/api/admin/reset-pin", {
      uniqueid: student.uniqueid
    }, state.token);
  } catch (err) {
    console.error("PIN reset failed", err);
    setDomText("student-edit-feedback", "PIN reset failed.");
    return;
  }

  if (!result.success) {
    setDomText("student-edit-feedback", result.error || "PIN reset failed.");
    return;
  }

  setDomText("student-edit-feedback", "PIN reset successfully. The student can use the same link and create a new PIN.");
}

function renderStudentMessageResult(student, context) {
  const normalized = normalizeManagedStudent(student);
  const loginLink = buildStudentLoginLink(normalized.uniqueid);
  const message = buildStudentWelcomeMessage(loginLink);
  const assignment = normalized.assignment || {};
  const assignmentLine = context === "registered"
    ? `<p class="student-admin-help">Assigned ${Number(assignment.assignedCount || 0)} task${Number(assignment.assignedCount || 0) === 1 ? "" : "s"}.</p>`
    : "";
  const messageBoxId = `student-message-text-${context}-${sanitizeDomId(normalized.uniqueid || normalized.studentid || "student")}`;

  return `
    <div class="student-admin-result-card">
      <div class="student-admin-card-title">${context === "registered" ? "Student Registered" : "Student Link"}</div>

      <div class="student-link-box student-icon-field">
        <span class="student-link-text">${escapeHtml(loginLink)}</span>
        <button
          type="button"
          class="student-copy-icon-btn"
          data-manage-action="copy-login-link"
          data-login-link="${escapeAttribute(loginLink)}"
          aria-label="Copy student link"
          title="Copy student link"
        >
          <img src="/icons/copy.svg" alt="" class="student-copy-icon" />
        </button>
      </div>
      ${assignmentLine}

      <label class="student-admin-label" for="${messageBoxId}">WhatsApp Message</label>
      <div class="student-message-box-wrap">
        <textarea
          id="${messageBoxId}"
          class="student-message-textarea student-icon-field-textarea"
          rows="11"
        >${escapeHtml(message)}</textarea>
        <button
          type="button"
          class="student-copy-icon-btn student-message-copy-btn"
          data-manage-action="copy-welcome-message"
          data-message-box-id="${escapeAttribute(messageBoxId)}"
          data-login-link="${escapeAttribute(loginLink)}"
          aria-label="Copy WhatsApp message"
          title="Copy WhatsApp message"
        >
          <img src="/icons/copy.svg" alt="" class="student-copy-icon" />
        </button>
      </div>

      <button
        type="button"
        class="student-whatsapp-icon-btn"
        data-manage-action="open-whatsapp"
        data-message-box-id="${escapeAttribute(messageBoxId)}"
        data-login-link="${escapeAttribute(loginLink)}"
        aria-label="Open WhatsApp message"
        title="Open WhatsApp message"
      >
        <img src="/icons/whatsapp.svg" alt="WhatsApp" class="student-whatsapp-icon" />
      </button>
    </div>
  `;
}

function sanitizeDomId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function getEditedStudentMessage(messageBoxId, loginLink) {
  const box = getDomElement(messageBoxId);
  const edited = box ? box.value.trim() : "";
  return edited || buildStudentWelcomeMessage(loginLink);
}

function normalizeManagedStudent(student) {
  student = student || {};

  return {
    ...student,
    studentid: student.studentid || student.StudentID || student.studentId || "",
    username: student.username || student.Username || student.name || student.Name || "",
    whatsapp6: String(student.whatsapp6 || student.WhatsAppLast6 || student.whatsappLast6 || "").trim(),
    uniqueid: student.uniqueid || student.UniqueID || student.uniqueId || "",
    classgroup: String(student.classgroup || student.ClassGroup || student.group || student.Group || DEFAULT_STUDENT_GROUP).trim(),
    active: student.active === true || String(student.active).toLowerCase() === "true",
    assignment: student.assignment || null
  };
}

function buildStudentLoginLink(uniqueid) {
  return STUDENT_LOGIN_BASE + String(uniqueid || "").trim();
}

function buildStudentWelcomeMessage(loginLink) {
  return [
    " As-salamu alaykum wa rahmatullahi wa barakatuh",
    "",
    "Your personal link to Maktab-mE (Maktab mobile & E-resources) is attached",
     "",
    "Insha Allah it wil assist you in this journey. After you click the link....",
     "",
    "1. CREATE an easy to remember pin if you are a new user",
    "",
    "2. LOGIN with your pin ",
    "",
    "3. ADD the app to your homescreen",
    "",
    loginLink,
    "",
    "Please contact me for any queries or if you need to reset your PIN.",
  
   "May Allah bless you on this journey and make your path to Jannah easy"

  ].join("\n");
}

async function copyStudentLoginLink(loginLink) {
  await copyTextToClipboard(loginLink);
  alert("Login link copied.");
}

async function copyStudentWelcomeMessage(loginLink) {
  await copyTextToClipboard(buildStudentWelcomeMessage(loginLink));
  alert("Message copied.");
}

async function copyStudentWelcomeMessageFromBox(messageBoxId, loginLink) {
  await copyTextToClipboard(getEditedStudentMessage(messageBoxId, loginLink));
  alert("Message copied.");
}

function openStudentWhatsAppMessage(loginLink) {
  const message = buildStudentWelcomeMessage(loginLink);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
}

function openStudentWhatsAppMessageFromBox(messageBoxId, loginLink) {
  const message = getEditedStudentMessage(messageBoxId, loginLink);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank", "noopener,noreferrer");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (!document.body) {
    window.prompt("Copy this text:", text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function getLastSixDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "999999";
  }

  return digits.slice(-6).padStart(6, "0");
}

function getInitials(value) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

window.M4LManageStudents = {
  showManageStudents: typeof showManageStudents === "function" ? showManageStudents : undefined,
  loadStudentAssignmentOptions: typeof loadStudentAssignmentOptions === "function" ? loadStudentAssignmentOptions : undefined,
  setManageStudentsMode: typeof setManageStudentsMode === "function" ? setManageStudentsMode : undefined,
  submitRegisterStudent: typeof submitRegisterStudent === "function" ? submitRegisterStudent : undefined,
  registerAnotherManagedStudent: typeof registerAnotherManagedStudent === "function" ? registerAnotherManagedStudent : undefined,
  backToManagedStudentList: typeof backToManagedStudentList === "function" ? backToManagedStudentList : undefined,
  loadManagedStudentList: typeof loadManagedStudentList === "function" ? loadManagedStudentList : undefined,
  searchManagedStudents: typeof searchManagedStudents === "function" ? searchManagedStudents : undefined,
  selectManagedStudentByUniqueId: typeof selectManagedStudentByUniqueId === "function" ? selectManagedStudentByUniqueId : undefined,
  renderManagedStudentEditScreen: typeof renderManagedStudentEditScreen === "function" ? renderManagedStudentEditScreen : undefined,
  saveManagedStudentChanges: typeof saveManagedStudentChanges === "function" ? saveManagedStudentChanges : undefined,
  resetManagedStudentPin: typeof resetManagedStudentPin === "function" ? resetManagedStudentPin : undefined,
  copyStudentLoginLink: typeof copyStudentLoginLink === "function" ? copyStudentLoginLink : undefined,
  copyStudentWelcomeMessage: typeof copyStudentWelcomeMessage === "function" ? copyStudentWelcomeMessage : undefined,
  copyStudentWelcomeMessageFromBox: typeof copyStudentWelcomeMessageFromBox === "function" ? copyStudentWelcomeMessageFromBox : undefined,
  openStudentWhatsAppMessage: typeof openStudentWhatsAppMessage === "function" ? openStudentWhatsAppMessage : undefined,
  openStudentWhatsAppMessageFromBox: typeof openStudentWhatsAppMessageFromBox === "function" ? openStudentWhatsAppMessageFromBox : undefined,
  bindManageStudentsUiHandlers: typeof bindManageStudentsUiHandlers === "function" ? bindManageStudentsUiHandlers : undefined,
  bindManageStudentsGlobalClickHandler: typeof bindManageStudentsGlobalClickHandler === "function" ? bindManageStudentsGlobalClickHandler : undefined
};
