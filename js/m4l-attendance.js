/* M4L v64.3 - Attendance module
   Load after /app.js, /js/m4l-auth.js, /js/m4l-shell.js, and /js/m4l-swipe.js.
   This is a classic script, not type=module, so existing onclick/global calls remain safe.

   Owns Attendance dashboard content and data hydration.
   Shared panel movement, dots, and touch swipe gestures are owned by /js/m4l-swipe.js.
*/

/* =========================
   ATTENDANCE
========================= */

async function refreshViewAttendance(button) {
  const startDate = getAttendanceDateInputValue("view-start-date");
  const endDate = getAttendanceDateInputValue("view-end-date");

  if (!isValidAttendanceDateRange(startDate, endDate)) {
    showAttendanceDatePopup("Start date must be before or the same as end date.");
    return;
  }

  await runManualRefresh(button, async () => {
    await renderViewAttendanceScreen(startDate, endDate, {
      activate: false,
      force: true
    });
  });
}

async function refreshAttendanceStats(button) {
  const startDate = getAttendanceDateInputValue("stats-start-date");
  const endDate = getAttendanceDateInputValue("stats-end-date");

  if (!isValidAttendanceDateRange(startDate, endDate)) {
    showAttendanceDatePopup("Start date must be before or the same as end date.");
    return;
  }

  await runManualRefresh(button, async () => {
    await renderAttendanceStatsScreen(startDate, endDate, {
      activate: false,
      force: true
    });
  });
}


/* =========================
   ADMIN ATTENDANCE
   Date system: YYYY-MM-DD strings generated from local browser date.
   Backend normalizes with Africa/Johannesburg.
========================= */

let attendanceStudentsCache = [];
let attendanceState = {};

const ATTENDANCE_DESKTOP_MEDIA_QUERY = "(min-width: 1180px)";
let attendanceQuietHydrationStarted = false;

function isAttendanceDesktopLayout() {
  return Boolean(window.matchMedia && window.matchMedia(ATTENDANCE_DESKTOP_MEDIA_QUERY).matches);
}

function hydrateAttendanceDesktopSidePanels() {
  /*
    Large desktop shows all three Attendance panels side-by-side. The same
    hydration helper is used by small/medium swipe layouts so the panel shells
    exist immediately and the inactive panels are prepared quietly.
  */
  hydrateAttendanceInactivePanelsQuietly();
  return true;
}

function getAttendancePanelScreenId(panelKey) {
  const screens = {
    register: "attendance-register-screen",
    records: "attendance-report-screen",
    stats: "attendance-stats-screen"
  };

  return screens[panelKey] || screens.register;
}

function getAttendancePanelContentId(panelKey) {
  const containers = {
    register: "attendance-register-content",
    records: "attendance-report-content",
    stats: "attendance-stats-content"
  };

  return containers[panelKey] || containers.register;
}

function getAttendancePanelContent(panelKey) {
  return getDomElement(getAttendancePanelContentId(panelKey));
}

function scrollAttendancePanelIntoView(panelKey) {
  if (isAttendanceDesktopLayout()) return false;

  const screen = getDomElement(getAttendancePanelScreenId(panelKey));
  if (!screen || typeof screen.scrollIntoView !== "function") return false;

  window.requestAnimationFrame(() => {
    try {
      screen.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start"
      });
    } catch (error) {
      screen.scrollIntoView();
    }
  });

  return true;
}

function activateAttendancePanel(panelKey) {
  const didShow = showScreen(getAttendancePanelScreenId(panelKey));
  if (didShow) {
    scrollAttendancePanelIntoView(panelKey);

    if (window.M4LSwipe && typeof window.M4LSwipe.updateAttendanceSwipeDots === "function") {
      window.M4LSwipe.updateAttendanceSwipeDots(panelKey);
    }

    if (window.M4LSwipe && typeof window.M4LSwipe.bindAttendanceSwipeControls === "function") {
      window.M4LSwipe.bindAttendanceSwipeControls(panelKey);
    }
  }

  return didShow;
}

function markAttendancePanelLoading(panelKey, isLoading) {
  const container = getAttendancePanelContent(panelKey);
  if (!container) return false;

  container.dataset.attendanceLoading = isLoading ? "true" : "false";
  return true;
}

function markAttendancePanelHydrated(panelKey, range) {
  const container = getAttendancePanelContent(panelKey);
  if (!container) return false;

  container.dataset.attendanceHydrated = "true";
  if (range) {
    container.dataset.attendanceRangeStart = range.start || "";
    container.dataset.attendanceRangeEnd = range.end || "";
  }

  markAttendancePanelLoading(panelKey, false);
  return true;
}

function clearAttendancePanelHydration(panelKey) {
  const container = getAttendancePanelContent(panelKey);
  if (!container) return false;

  delete container.dataset.attendanceHydrated;
  delete container.dataset.attendanceRangeStart;
  delete container.dataset.attendanceRangeEnd;
  container.dataset.attendanceLoading = "false";
  return true;
}

function isAttendancePanelHydrated(panelKey) {
  const container = getAttendancePanelContent(panelKey);
  return Boolean(container && container.dataset.attendanceHydrated === "true");
}

function isAttendancePanelLoading(panelKey) {
  const container = getAttendancePanelContent(panelKey);
  return Boolean(container && container.dataset.attendanceLoading === "true");
}

function renderAttendanceInactivePanelShells() {
  const range = getDefaultAttendanceDateRange();

  const recordsContainer = getAttendancePanelContent("records");
  if (recordsContainer && !isAttendancePanelHydrated("records") && !isAttendancePanelLoading("records")) {
    renderViewAttendanceControlsInline(range.start, range.end, "Preparing attendance records...");
  }

  const statsContainer = getAttendancePanelContent("stats");
  if (statsContainer && !isAttendancePanelHydrated("stats") && !isAttendancePanelLoading("stats")) {
    renderAttendanceStatsControlsInline(range.start, range.end, "Preparing statistics...");
  }

  return true;
}

function hydrateAttendanceInactivePanelsQuietly(force = false) {
  if (attendanceQuietHydrationStarted && !force) return false;

  attendanceQuietHydrationStarted = true;
  renderAttendanceInactivePanelShells();

  const range = getDefaultAttendanceDateRange();
  const runHydration = () => {
    renderViewAttendanceScreen(range.start, range.end, {
      activate: false,
      force,
      quiet: true
    });

    renderAttendanceStatsScreen(range.start, range.end, {
      activate: false,
      force,
      quiet: true
    });
  };

  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(runHydration, { timeout: 1500 });
  } else {
    window.setTimeout(runHydration, 250);
  }

  return true;
}

function invalidateAttendanceComputedPanels() {
  clearAttendancePanelHydration("records");
  clearAttendancePanelHydration("stats");
  attendanceQuietHydrationStarted = false;
}


function showAttendanceDashboard() {
  return openMarkRegister();
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultAttendanceDateRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    start: getLocalDateString(firstDay),
    end: getLocalDateString(now)
  };
}


function isValidAttendanceDateRange(startDate, endDate) {
  if (!startDate || !endDate) return true;
  return String(startDate) <= String(endDate);
}

function clearAttendanceDatePopup() {
  const existing = document.getElementById("attendance-date-popup");
  if (existing) {
    existing.remove();
  }
}

function showAttendanceDatePopup(message) {
  clearAttendanceDatePopup();

  if (!document.body) {
    console.warn("Unable to show attendance date popup because document.body is missing.");
    return false;
  }

  const popup = document.createElement("div");
  popup.id = "attendance-date-popup";
  popup.className = "attendance-date-popup";
  popup.setAttribute("role", "alert");
  popup.textContent = message || "Please choose a valid date range.";

  document.body.appendChild(popup);
  return true;
}

function getAttendanceDateInputValue(id) {
  const input = getDomElement(id);
  return input && "value" in input ? String(input.value || "") : "";
}

function normalizeAttendanceDateRange(startDate, endDate) {
  const defaults = getDefaultAttendanceDateRange();

  return {
    start: startDate || defaults.start,
    end: endDate || defaults.end
  };
}

function handleAttendanceDateRangeChange(mode) {
  clearAttendanceDatePopup();

  const normalizedMode = mode === "stats" ? "stats" : "view";
  const prefix = normalizedMode === "stats" ? "stats" : "view";
  const startDate = getAttendanceDateInputValue(`${prefix}-start-date`);
  const endDate = getAttendanceDateInputValue(`${prefix}-end-date`);

  if (!isValidAttendanceDateRange(startDate, endDate)) {
    showAttendanceDatePopup("Start date must be before or the same as end date.");
  }
}

function renderAttendancePanelDots(activePanel) {
  const panels = [
    {
      key: "register",
      label: "Show mark register"
    },
    {
      key: "records",
      label: "Show attendance records"
    },
    {
      key: "stats",
      label: "Show attendance statistics"
    }
  ];

  return `
    <div class="attendance-panel-dots" data-swipe-group="attendance" aria-label="Attendance panels">
      ${panels.map((panel, index) => {
        const isActive = panel.key === activePanel;
        return `
          <button
            type="button"
            class="section-swipe-dot${isActive ? " is-active" : ""}"
            data-swipe-group="attendance"
            data-swipe-panel-index="${index}"
            data-attendance-panel-index="${index}"
            data-attendance-panel="${panel.key}"
            aria-label="${panel.label}"
            aria-current="${isActive ? "true" : "false"}"
          ></button>
        `;
      }).join("")}
    </div>
  `;
}

function renderAttendancePanelHeading(text) {
  return `
    <div class="attendance-subscreen-header">
      <h3 class="attendance-panel-heading">${escapeHtml(text)}</h3>
    </div>
  `;
}

function renderAttendanceTopPanel(activePanel, heading, bodyMarkup) {
  const panelKey = String(activePanel || "register");
  return `
    <div class="attendance-sticky-control-pane attendance-${escapeHtml(panelKey)}-control-pane">
      <section class="attendance-top-panel attendance-top-panel--${escapeHtml(panelKey)}">
        ${renderAttendancePanelHeading(heading)}
        <div class="attendance-top-content">
          ${bodyMarkup || ""}
        </div>
      </section>
      ${renderAttendancePanelDots(panelKey)}
    </div>
  `;
}

function renderAttendanceActionButton(action, label) {
  return `
    <button
      type="button"
      class="attendance-action-btn"
      data-attendance-action="${escapeHtml(action)}"
    >${escapeHtml(label)}</button>
  `;
}

function renderAttendanceDateControl(mode, startDate, endDate) {
  const normalizedMode = mode === "stats" ? "stats" : "view";
  const prefix = normalizedMode === "stats" ? "stats" : "view";

  return `
    <div class="attendance-summary-card attendance-date-range-card">
      <div class="attendance-summary-item">
        <span class="attendance-summary-icon" aria-hidden="true">📅</span>
        <div class="attendance-summary-text">
          <span class="attendance-summary-label">Start Date</span>
          <input
            type="date"
            id="${prefix}-start-date"
            value="${escapeHtml(startDate)}"
            data-attendance-date-mode="${normalizedMode}"
            data-attendance-date-field="start"
          >
        </div>
      </div>

      <div class="attendance-summary-divider" aria-hidden="true"></div>

      <div class="attendance-summary-item">
        <span class="attendance-summary-icon" aria-hidden="true">📅</span>
        <div class="attendance-summary-text">
          <span class="attendance-summary-label">End Date</span>
          <input
            type="date"
            id="${prefix}-end-date"
            value="${escapeHtml(endDate)}"
            data-attendance-date-mode="${normalizedMode}"
            data-attendance-date-field="end"
          >
        </div>
      </div>
    </div>
  `;
}

function bindAttendancePanelSwipe(containerOrId, activePanel) {
  const container = getDomElement(containerOrId);
  if (!container) return false;

  if (window.M4LSwipe && typeof window.M4LSwipe.bindAttendanceSwipeControls === "function") {
    return window.M4LSwipe.bindAttendanceSwipeControls(activePanel || "register", container);
  }

  return false;
}

function renderAttendanceDateFilter(mode, startDate, endDate, buttonLabel) {
  const normalizedMode = mode === "stats" ? "stats" : "view";
  const action = normalizedMode === "stats" ? "calculate-stats" : "view-records";
  const label = buttonLabel || "Calculate";

  return `
    <div class="attendance-control-block attendance-filter-box attendance-filter-box-compact">
      ${renderAttendanceDateControl(normalizedMode, startDate, endDate)}
      ${renderAttendanceActionButton(action, label)}
    </div>
  `;
}

function handleAttendanceGeneralClick(event) {
  const actionEl = event.target.closest("[data-attendance-action]");
  if (!actionEl) return;

  const action = actionEl.dataset.attendanceAction || "";

  if (actionEl.tagName === "BUTTON" || actionEl.tagName === "A") {
    event.preventDefault();
  }


  if (action === "view-records") {
    const startDate = getAttendanceDateInputValue("view-start-date");
    const endDate = getAttendanceDateInputValue("view-end-date");

    if (!isValidAttendanceDateRange(startDate, endDate)) {
      showAttendanceDatePopup("Start date must be before or the same as end date.");
      return;
    }

    renderViewAttendanceScreen(startDate, endDate, { force: true });
    return;
  }

  if (action === "calculate-stats") {
    const startDate = getAttendanceDateInputValue("stats-start-date");
    const endDate = getAttendanceDateInputValue("stats-end-date");

    if (!isValidAttendanceDateRange(startDate, endDate)) {
      showAttendanceDatePopup("Start date must be before or the same as end date.");
      return;
    }

    renderAttendanceStatsScreen(startDate, endDate, { force: true });
    return;
  }

  if (action === "toggle-absent-dates") {
    const targetId = actionEl.dataset.attendanceTarget || "";
    if (targetId) {
      toggleAbsentDates(targetId);
    }
  }
}

function handleAttendanceGeneralKeydown(event) {
  const actionEl = event.target.closest('[data-attendance-action="toggle-absent-dates"]');
  if (!actionEl) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const targetId = actionEl.dataset.attendanceTarget || "";
    if (targetId) {
      toggleAbsentDates(targetId);
    }
  }
}

function bindAttendanceUiHandlers(containerOrId) {
  const container = getDomElement(containerOrId);
  if (!container) return false;

  if (container.dataset.attendanceUiBound !== "true") {
    container.dataset.attendanceUiBound = "true";
    container.addEventListener("click", handleAttendanceGeneralClick);
    container.addEventListener("keydown", handleAttendanceGeneralKeydown);
    container.addEventListener("change", event => {
      const input = event.target.closest("[data-attendance-date-mode]");
      if (input && container.contains(input)) {
        handleAttendanceDateRangeChange(input.dataset.attendanceDateMode || "view");
      }
    });
  }

  return true;
}

function formatDisplayDate(dateString) {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString || "";
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);

  return localDate.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

let attendanceRegisterSaveInProgress = false;

function bindAttendanceRegisterUiHandlers(containerOrId) {
  const container = getDomElement(containerOrId);
  if (!container) return false;

  if (container.__attendanceRegisterHandlersBound === true) {
    return true;
  }

  container.__attendanceRegisterHandlersBound = true;
  container.addEventListener("click", handleAttendanceRegisterClick);
  container.addEventListener("change", handleAttendanceRegisterChange);
  return true;
}

function handleAttendanceRegisterClick(event) {
  const actionEl = event.target.closest("[data-attendance-register-action]");
  if (!actionEl) return;

  const container = getDomElement("attendance-register-content");
  if (container && !container.contains(actionEl)) return;

  const action = actionEl.dataset.attendanceRegisterAction || "";

  if (actionEl.tagName === "BUTTON" || actionEl.tagName === "A") {
    event.preventDefault();
  }

  if (action === "toggle-status") {
    const studentid = actionEl.dataset.studentId || "";
    if (studentid) {
      toggleAttendanceStatus(studentid);
    }
    return;
  }

  if (action === "save-register") {
    submitAttendanceRegister();
  }
}

function handleAttendanceRegisterChange(event) {
  const input = event.target.closest("[data-attendance-register-field]");
  if (!input) return;

  const container = getDomElement("attendance-register-content");
  if (container && !container.contains(input)) return;

  if (input.dataset.attendanceRegisterField === "date") {
    // The selected date is read at save time. This handler exists so the date input is
    // safely owned by the attendance register module without inline onchange code.
  }
}

function getAttendanceRegisterDateValue() {
  const dateInput = getDomElement("attendance-date");
  return dateInput && dateInput.value ? dateInput.value : getLocalDateString();
}

function setAttendanceSaveButtonState(isSaving) {
  const saveButton = document.querySelector("#attendance-register-content .attendance-save-btn");
  if (!saveButton) return false;

  saveButton.disabled = Boolean(isSaving);
  saveButton.innerText = isSaving ? "Saving..." : "Save";
  return true;
}

async function openMarkRegister(options = {}) {
  const didShow = activateAttendancePanel("register");
  if (!didShow) return;

  const container = getDomElement("attendance-register-content");
  if (!container) {
    console.warn("Missing attendance register container.");
    return;
  }

  const force = Boolean(options && options.force === true);
  const registerDate = getAttendanceRegisterDateValue();

  bindAttendanceRegisterUiHandlers(container);
  renderAttendanceInactivePanelShells();

  /*
    Do not rebuild the Register every time the user swipes back to it.
    Once the register has been loaded, the cached student list and the current
    attendanceState are the source of truth until an explicit force refresh is
    requested. This preserves the selected date and any Present/Absent changes
    while moving between Attendance swipe panels.
  */
  if (!force && isAttendancePanelHydrated("register")) {
    renderAttendanceRegister(registerDate);
    hydrateAttendanceInactivePanelsQuietly();
    return;
  }

  setDomHtml(container, `<p class="helper-text">Loading students...</p>`);

  let result;
  try {
    result = await apiPost("/api/attendance/students", {
      classgroup: "ALL"
    }, state.token);
  } catch (error) {
    console.error("Failed to load attendance students:", error);
    setDomHtml(container, `<p class="error-message">Failed to load students.</p>`);
    return;
  }

  if (!result || !result.success) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(result?.error || result?.message || "Failed to load students.")}</p>`);
    return;
  }

  attendanceStudentsCache = Array.isArray(result.students) ? result.students : [];
  attendanceState = {};

  attendanceStudentsCache.forEach(student => {
    if (student && student.studentid != null) {
      attendanceState[student.studentid] = "Present";
    }
  });

  renderAttendanceRegister(registerDate);
  markAttendancePanelHydrated("register");
  hydrateAttendanceInactivePanelsQuietly();
}

function renderAttendanceRegister(dateValue) {
  const container = getDomElement("attendance-register-content");
  if (!container) {
    console.warn("Missing attendance register container.");
    return false;
  }

  bindAttendanceRegisterUiHandlers(container);

  const students = [...attendanceStudentsCache].sort(sortAttendanceStudents);
  const absentCount = students.filter(student => attendanceState[student.studentid] === "Absent").length;

  let html = renderAttendanceTopPanel("register", "Register", `
    <div class="attendance-control-block attendance-register-control-block">
      <div class="attendance-summary-card">
        <div class="attendance-summary-item">
          <span class="attendance-summary-icon" aria-hidden="true">📅</span>
          <div class="attendance-summary-text">
            <span class="attendance-summary-label">Date</span>
            <input
              type="date"
              id="attendance-date"
              value="${escapeHtml(dateValue || getLocalDateString())}"
              data-attendance-register-field="date"
            >
          </div>
        </div>

        <div class="attendance-summary-divider" aria-hidden="true"></div>

        <div class="attendance-summary-item">
          <span class="attendance-summary-icon" aria-hidden="true">👥</span>
          <div class="attendance-summary-text">
            <span class="attendance-summary-label">Absent</span>
            <strong class="attendance-absence-feedback">${absentCount} student${absentCount === 1 ? "" : "s"}</strong>
            <span class="attendance-summary-subtext">marked absent</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="attendance-action-btn attendance-save-btn"
        data-attendance-register-action="save-register"
      >Save</button>
    </div>
  `);

  if (students.length === 0) {
    html += `<p class="helper-text">No active students found.</p>`;
  }

  const groups = groupAttendanceStudents(students);
  const sortedGroups = Object.keys(groups).sort(sortGroupValues);

  sortedGroups.forEach(group => {
    html += `
      <section class="attendance-group-container attendance-register-group-container" aria-label="Group ${escapeHtml(group)}">
    `;

    groups[group].forEach(student => {
      if (!student || student.studentid == null) return;

      const studentid = String(student.studentid);
      const status = attendanceState[studentid] || "Present";
      const isPresent = status === "Present";
      const displayName = student.username || studentid;

      html += `
        <div class="attendance-register-row">
          <div class="attendance-student-main">
            <div class="attendance-student-name">${escapeHtml(displayName)}</div>
          </div>
          <button
            type="button"
            class="attendance-toggle ${isPresent ? "is-present" : "is-absent"}"
            data-attendance-register-action="toggle-status"
            data-student-id="${escapeHtml(studentid)}"
            aria-pressed="${isPresent ? "false" : "true"}"
          >
            ${isPresent ? "PRESENT ✔" : "ABSENT ✘"}
          </button>
        </div>
      `;
    });

    html += `
      </section>
    `;
  });

  setDomHtml(container, html);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "register");
  setAttendanceSaveButtonState(attendanceRegisterSaveInProgress);
  markAttendancePanelHydrated("register");
  return true;
}

function toggleAttendanceStatus(studentid) {
  if (!studentid) return;

  attendanceState[studentid] = attendanceState[studentid] === "Absent" ? "Present" : "Absent";
  renderAttendanceRegister(getAttendanceRegisterDateValue());
}

async function submitAttendanceRegister() {
  if (attendanceRegisterSaveInProgress) return;

  const dateValue = getAttendanceRegisterDateValue();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    alert("Please select a valid date.");
    return;
  }

  const absentStudents = attendanceStudentsCache
    .filter(student => student && attendanceState[student.studentid] === "Absent")
    .map(student => ({
      studentid: student.studentid,
      username: student.username,
      classgroup: student.classgroup
    }));

  attendanceRegisterSaveInProgress = true;
  setAttendanceSaveButtonState(true);

  let result;
  try {
    result = await apiPost("/api/attendance/submit-absent", {
      date: dateValue,
      absentStudents
    }, state.token);
  } catch (error) {
    console.error("Failed to save attendance:", error);
    result = { success: false, message: "Failed to save attendance." };
  }

  if (!result || !result.success) {
    attendanceRegisterSaveInProgress = false;
    setAttendanceSaveButtonState(false);
    alert(result?.error || result?.message || "Failed to save attendance.");
    return;
  }

  attendanceRegisterSaveInProgress = false;
  setAttendanceSaveButtonState(false);
  invalidateAttendanceComputedPanels();
  renderAttendanceInactivePanelShells();
  hydrateAttendanceInactivePanelsQuietly(true);
  alert(`Attendance saved successfully. ${absentStudents.length} student${absentStudents.length === 1 ? "" : "s"} marked absent.`);
}

function openViewAttendance() {
  const range = normalizeAttendanceDateRange(
    getAttendanceDateInputValue("view-start-date"),
    getAttendanceDateInputValue("view-end-date")
  );

  const didShow = activateAttendancePanel("records");
  if (!didShow) return;

  const container = getAttendancePanelContent("records");
  if (!container) return;

  if (!isAttendancePanelHydrated("records") && !isAttendancePanelLoading("records")) {
    renderViewAttendanceControlsInline(range.start, range.end, "Preparing attendance records...");
    renderViewAttendanceScreen(range.start, range.end, { activate: false });
  }
}

function renderAttendanceRecordsControlsMarkup(range) {
  return renderAttendanceTopPanel(
    "records",
    "Attendance Records",
    renderAttendanceDateFilter("view", range.start, range.end, "Calculate")
  );
}

function renderViewAttendanceControlsInline(startDate, endDate, message) {
  const range = normalizeAttendanceDateRange(startDate, endDate);
  const container = getDomElement("attendance-report-content");
  if (!container) {
    console.warn("Missing attendance report container.");
    return false;
  }

  setDomHtml(container, `
    ${renderAttendanceRecordsControlsMarkup(range)}
    <p class="helper-text attendance-empty-state">${escapeHtml(message || "Choose a date range, then tap View Records.")}</p>
  `);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "records");
  return true;
}

function renderViewAttendanceControls(startDate, endDate, message) {
  const didShow = showScreen("attendance-report-screen");
  if (!didShow) return false;
  return renderViewAttendanceControlsInline(startDate, endDate, message);
}

async function renderViewAttendanceScreen(startDate, endDate, options = {}) {
  const range = normalizeAttendanceDateRange(startDate, endDate);
  const shouldActivate = options.activate !== false;
  const shouldForce = options.force === true;

  if (!isValidAttendanceDateRange(range.start, range.end)) {
    showAttendanceDatePopup("Start date must be before or the same as end date.");
    return;
  }

  if (shouldActivate) {
    const didShow = activateAttendancePanel("records");
    if (!didShow) return;
  }

  const container = getDomElement("attendance-report-content");
  if (!container) {
    console.warn("Missing attendance report container.");
    return;
  }

  if (isAttendancePanelLoading("records") && !shouldForce) {
    return;
  }

  markAttendancePanelLoading("records", true);

  setDomHtml(container, `
    ${renderAttendanceRecordsControlsMarkup(range)}
    <p class="helper-text attendance-empty-state">Loading attendance records...</p>
  `);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "records");

  let result;
  try {
    result = await apiPost("/api/attendance/report", {
      startDate: range.start,
      endDate: range.end,
      classgroup: "ALL"
    }, state.token);
  } catch (error) {
    console.error("Failed to load attendance report:", error);
    setDomHtml(container, `
      ${renderAttendanceRecordsControlsMarkup(range)}
      <p class="error-message">Failed to load attendance.</p>
    `);
    bindAttendanceUiHandlers(container);
    bindAttendancePanelSwipe(container, "records");
    markAttendancePanelLoading("records", false);
    return;
  }

  if (!result.success) {
    setDomHtml(container, `
      ${renderAttendanceRecordsControlsMarkup(range)}
      <p class="error-message">${escapeHtml(result.error || result.message || "Failed to load attendance.")}</p>
    `);
    bindAttendanceUiHandlers(container);
    bindAttendancePanelSwipe(container, "records");
    markAttendancePanelLoading("records", false);
    return;
  }

  const groups = groupAttendanceStudents(result.students || []);
  const sortedGroups = Object.keys(groups).sort(sortGroupValues);

  let html = renderAttendanceRecordsControlsMarkup(range);

  if (sortedGroups.length === 0) {
    html += `<p class="helper-text attendance-empty-state">No attendance records found.</p>`;
  }

  sortedGroups.forEach(group => {
    html += `
      <section class="attendance-group-container attendance-records-group-container" aria-label="Group ${escapeHtml(group)}">
    `;

    groups[group].forEach(student => {
      const rowId = `abs-${safeDomId(student.studentid)}`;

      html += `
        <div
          class="attendance-report-row"
          role="button"
          tabindex="0"
          data-attendance-action="toggle-absent-dates"
          data-attendance-target="${escapeHtml(rowId)}"
        >
          <div>${escapeHtml(student.username || student.studentid)}</div>
          <div>${student.absentDays || 0}</div>
          <div>${formatPercent(student.attendancePercent)}</div>
        </div>

        <div id="${rowId}" class="attendance-absent-dates">
          ${renderAbsentDates(student.absentDates || [])}
        </div>
      `;
    });

    html += `
      </section>
    `;
  });

  setDomHtml(container, html);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "records");
  markAttendancePanelHydrated("records", range);
}

function openAttendanceStats() {
  const range = normalizeAttendanceDateRange(
    getAttendanceDateInputValue("stats-start-date"),
    getAttendanceDateInputValue("stats-end-date")
  );

  const didShow = activateAttendancePanel("stats");
  if (!didShow) return;

  const container = getAttendancePanelContent("stats");
  if (!container) return;

  if (!isAttendancePanelHydrated("stats") && !isAttendancePanelLoading("stats")) {
    renderAttendanceStatsControlsInline(range.start, range.end, "Preparing statistics...");
    renderAttendanceStatsScreen(range.start, range.end, { activate: false });
  }
}

function renderAttendanceStatsControlsMarkup(range) {
  return renderAttendanceTopPanel(
    "stats",
    "Statistics",
    renderAttendanceDateFilter("stats", range.start, range.end, "Calculate")
  );
}

function renderAttendanceStatsControlsInline(startDate, endDate, message) {
  const range = normalizeAttendanceDateRange(startDate, endDate);
  const container = getDomElement("attendance-stats-content");
  if (!container) {
    console.warn("Missing attendance stats container.");
    return false;
  }

  setDomHtml(container, `
    ${renderAttendanceStatsControlsMarkup(range)}
    <p class="helper-text attendance-empty-state">${escapeHtml(message || "Choose a date range, then tap Calculate.")}</p>
  `);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "stats");
  return true;
}

function renderAttendanceStatsControls(startDate, endDate, message) {
  const didShow = showScreen("attendance-stats-screen");
  if (!didShow) return false;
  return renderAttendanceStatsControlsInline(startDate, endDate, message);
}

async function renderAttendanceStatsScreen(startDate, endDate, options = {}) {
  const range = normalizeAttendanceDateRange(startDate, endDate);
  const shouldActivate = options.activate !== false;
  const shouldForce = options.force === true;

  if (!isValidAttendanceDateRange(range.start, range.end)) {
    showAttendanceDatePopup("Start date must be before or the same as end date.");
    return;
  }

  if (shouldActivate) {
    const didShow = activateAttendancePanel("stats");
    if (!didShow) return;
  }

  const container = getDomElement("attendance-stats-content");
  if (!container) {
    console.warn("Missing attendance stats container.");
    return;
  }

  if (isAttendancePanelLoading("stats") && !shouldForce) {
    return;
  }

  markAttendancePanelLoading("stats", true);

  setDomHtml(container, `
    ${renderAttendanceStatsControlsMarkup(range)}
    <p class="helper-text attendance-empty-state">Calculating statistics...</p>
  `);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "stats");

  let result;
  try {
    result = await apiPost("/api/attendance/report", {
      startDate: range.start,
      endDate: range.end,
      classgroup: "ALL"
    }, state.token);
  } catch (error) {
    console.error("Failed to load attendance stats:", error);
    setDomHtml(container, `
      ${renderAttendanceStatsControlsMarkup(range)}
      <p class="error-message">Failed to load statistics.</p>
    `);
    bindAttendanceUiHandlers(container);
    bindAttendancePanelSwipe(container, "stats");
    markAttendancePanelLoading("stats", false);
    return;
  }

  if (!result.success) {
    setDomHtml(container, `
      ${renderAttendanceStatsControlsMarkup(range)}
      <p class="error-message">${escapeHtml(result.error || result.message || "Failed to load statistics.")}</p>
    `);
    bindAttendanceUiHandlers(container);
    bindAttendancePanelSwipe(container, "stats");
    markAttendancePanelLoading("stats", false);
    return;
  }

  const groupAverages = Array.isArray(result.groupAverages) ? result.groupAverages : [];
  const perfectStudents = Array.isArray(result.perfectAttendanceStudents) ? result.perfectAttendanceStudents : [];

  let html = `
    ${renderAttendanceStatsControlsMarkup(range)}

    <div class="attendance-stat-grid">
      <div class="attendance-stat-card">
        <div class="attendance-stat-label">Maktab Days</div>
        <div class="attendance-stat-number">${result.totalMaktabDays || 0}</div>
      </div>

      <div class="attendance-stat-card">
        <div class="attendance-stat-label">Class Average</div>
        <div class="attendance-stat-number">${formatPercent(result.registerAverageAttendancePercent)}</div>
      </div>
    </div>

    <div class="attendance-breakdown-card">
  `;

  groupAverages.sort((a, b) => sortGroupValues(a.classgroup, b.classgroup)).forEach(group => {
    const pct = Number(group.averageAttendancePercent || 0);

    html += `
      <div class="attendance-breakdown-row">
        <div class="attendance-breakdown-label attendance-breakdown-label-grid">
          <span>Group ${escapeHtml(group.classgroup)}</span>
          <span>${formatPercent(pct)}</span>
        </div>
        <div class="attendance-bar-track">
          <div class="attendance-bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div>
        </div>
      </div>
    `;
  });

  html += `
    </div>

    <div class="attendance-breakdown-card">
      <h3>100% Attendance</h3>
      <div class="attendance-perfect-list">
  `;

  if (!result.totalMaktabDays) {
    html += `<div class="helper-text">No maktab days recorded for this date range.</div>`;
  } else if (perfectStudents.length === 0) {
    html += `<div class="helper-text">No students have 100% attendance.</div>`;
  } else {
    perfectStudents
      .sort(sortAttendanceStudents)
      .forEach(student => {
        html += `<div class="attendance-perfect-row">⭐ ${escapeHtml(student.username || student.studentid)}</div>`;
      });
  }

  html += `
      </div>
    </div>
  `;

  setDomHtml(container, html);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "stats");
  markAttendancePanelHydrated("stats", range);
}

function sortAttendanceStudents(a, b) {
  const groupCompare = sortGroupValues(a.classgroup, b.classgroup);
  if (groupCompare !== 0) return groupCompare;

  return String(a.username || "").localeCompare(String(b.username || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function sortGroupValues(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function groupAttendanceStudents(students) {
  const groups = {};

  students.forEach(student => {
    const group = String(student.classgroup || "Ungrouped");
    if (!groups[group]) {
      groups[group] = [];
    }

    groups[group].push(student);
  });

  Object.keys(groups).forEach(group => {
    groups[group].sort(sortAttendanceStudents);
  });

  return groups;
}

function renderAbsentDates(absentDates) {
  if (!absentDates.length) {
    return `<div>No absences recorded</div>`;
  }

  return `
    <div style="margin-bottom:6px; font-weight:bold;">Absent Dates</div>
    ${absentDates.map(date => `<div>${escapeHtml(formatDisplayDate(date))}</div>`).join("")}
  `;
}

function toggleAbsentDates(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("is-open");
}

function formatPercent(value) {
  const n = Number(value || 0);
  return `${Math.round(n)}%`;
}

function safeDomId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

window.M4LAttendance = {
  showAttendanceDashboard,
  openMarkRegister,
  openViewAttendance,
  openAttendanceStats,
  refreshViewAttendance,
  refreshAttendanceStats,
  renderViewAttendanceScreen,
  renderAttendanceStatsScreen,
  bindAttendancePanelSwipe
};
