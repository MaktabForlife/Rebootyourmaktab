/* M4L v49 - Attendance module
   Load after /app.js, /js/m4l-auth.js, and /js/m4l-shell.js.
   This is a classic script, not type=module, so existing onclick/global calls remain safe
   while the app is split gradually.
   Owns Attendance dashboard, Mark Register, Attendance Records, and Attendance Stats.
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
    await renderViewAttendanceScreen(startDate, endDate);
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
    await renderAttendanceStatsScreen(startDate, endDate);
  });
}


/* =========================
   ADMIN ATTENDANCE
   Date system: YYYY-MM-DD strings generated from local browser date.
   Backend normalizes with Africa/Johannesburg.
========================= */

let attendanceStudentsCache = [];
let attendanceState = {};

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
      action: "open-register-panel",
      label: "Show mark register"
    },
    {
      key: "records",
      action: "open-records-panel",
      label: "Show attendance records"
    },
    {
      key: "stats",
      action: "open-stats-panel",
      label: "Show attendance statistics"
    }
  ];

  return `
    <div class="attendance-panel-dots" aria-label="Attendance panels">
      ${panels.map(panel => {
        const isActive = panel.key === activePanel;
        return `
          <button
            type="button"
            class="section-swipe-dot${isActive ? " is-active" : ""}"
            data-attendance-action="${panel.action}"
            aria-label="${panel.label}"
            aria-current="${isActive ? "true" : "false"}"
          ></button>
        `;
      }).join("")}
    </div>
  `;
}

function getAttendancePanelSequence() {
  return [
    { key: "register", handler: openMarkRegister },
    { key: "records", handler: openViewAttendance },
    { key: "stats", handler: openAttendanceStats }
  ];
}

function openAdjacentAttendancePanel(activePanel, direction) {
  const sequence = getAttendancePanelSequence();
  const currentIndex = sequence.findIndex(panel => panel.key === activePanel);
  if (currentIndex < 0) return false;

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= sequence.length) return false;

  sequence[nextIndex].handler();
  return true;
}

function shouldIgnoreAttendanceSwipeTarget(target) {
  return Boolean(target && target.closest('button, a, input, select, textarea, label, [role="button"]'));
}

function bindAttendancePanelSwipe(containerOrId, activePanel) {
  const container = getDomElement(containerOrId);
  if (!container || container.dataset.attendanceSwipePanel === activePanel) return Boolean(container);

  container.dataset.attendanceSwipePanel = activePanel || "";

  if (container.dataset.attendanceSwipeBound === "true") return true;

  container.dataset.attendanceSwipeBound = "true";

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTarget = null;

  container.addEventListener("touchstart", event => {
    const touch = event.touches && event.touches[0];
    if (!touch) return;

    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTarget = event.target;
  }, { passive: true });

  container.addEventListener("touchend", event => {
    if (shouldIgnoreAttendanceSwipeTarget(touchStartTarget)) {
      touchStartTarget = null;
      return;
    }

    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    touchStartTarget = null;

    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.4) return;

    const panel = container.dataset.attendanceSwipePanel || activePanel;
    if (deltaX < 0) {
      openAdjacentAttendancePanel(panel, 1);
    } else {
      openAdjacentAttendancePanel(panel, -1);
    }
  }, { passive: true });

  return true;
}

function renderAttendanceDateFilter(mode, startDate, endDate, buttonLabel) {
  const normalizedMode = mode === "stats" ? "stats" : "view";
  const prefix = normalizedMode === "stats" ? "stats" : "view";
  const action = normalizedMode === "stats" ? "calculate-stats" : "view-records";
  const label = buttonLabel || (normalizedMode === "stats" ? "Calculate" : "View Records");

  return `
    <div class="attendance-filter-box attendance-filter-box-compact">
      <div class="attendance-date-row attendance-date-row-compact">
        <input
          type="date"
          id="${prefix}-start-date"
          value="${escapeHtml(startDate)}"
          data-attendance-date-mode="${normalizedMode}"
          data-attendance-date-field="start"
        >
        <span class="attendance-date-label">START DATE</span>
      </div>

      <div class="attendance-date-row attendance-date-row-compact">
        <input
          type="date"
          id="${prefix}-end-date"
          value="${escapeHtml(endDate)}"
          data-attendance-date-mode="${normalizedMode}"
          data-attendance-date-field="end"
        >
        <span class="attendance-date-label">END DATE</span>
      </div>

      <button
        type="button"
        class="attendance-filter-action-btn"
        data-attendance-action="${action}"
      >${escapeHtml(label)}</button>
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

  if (action === "open-register-panel") {
    openMarkRegister();
    return;
  }

  if (action === "open-records-panel") {
    openViewAttendance();
    return;
  }

  if (action === "open-stats-panel") {
    openAttendanceStats();
    return;
  }

  if (action === "view-records") {
    const startDate = getAttendanceDateInputValue("view-start-date");
    const endDate = getAttendanceDateInputValue("view-end-date");

    if (!isValidAttendanceDateRange(startDate, endDate)) {
      showAttendanceDatePopup("Start date must be before or the same as end date.");
      return;
    }

    renderViewAttendanceScreen(startDate, endDate);
    return;
  }

  if (action === "calculate-stats") {
    const startDate = getAttendanceDateInputValue("stats-start-date");
    const endDate = getAttendanceDateInputValue("stats-end-date");

    if (!isValidAttendanceDateRange(startDate, endDate)) {
      showAttendanceDatePopup("Start date must be before or the same as end date.");
      return;
    }

    renderAttendanceStatsScreen(startDate, endDate);
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

async function openMarkRegister() {
  const didShow = showScreen("attendance-register-screen");
  if (!didShow) return;

  const container = getDomElement("attendance-register-content");
  if (!container) {
    console.warn("Missing attendance register container.");
    return;
  }

  bindAttendanceRegisterUiHandlers(container);
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

  renderAttendanceRegister(getLocalDateString());
}

function getAttendanceInitials(name) {
  const cleanName = String(name || "").trim();

  if (!cleanName) {
    return "?";
  }

  const parts = cleanName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return cleanName.slice(0, 2).toUpperCase();
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

  let html = `
    <div class="attendance-register-sticky attendance-sticky-control-pane">
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
        class="small-btn save-return-btn attendance-save-btn"
        data-attendance-register-action="save-register"
      >Save</button>

      ${renderAttendancePanelDots("register")}
    </div>
  `;

  if (students.length === 0) {
    html += `<p class="helper-text">No active students found.</p>`;
  }

  let currentGroup = "";

  students.forEach(student => {
    if (!student || student.studentid == null) return;

    const studentid = String(student.studentid);
    const group = String(student.classgroup || "Ungrouped");
    if (group !== currentGroup) {
      currentGroup = group;
      html += `<div class="attendance-group-line" aria-label="Group ${escapeHtml(group)}"></div>`;
    }

    const status = attendanceState[studentid] || "Present";
    const isPresent = status === "Present";
    const displayName = student.username || studentid;

    html += `
      <div class="attendance-register-row">
        <div class="attendance-student-main">
          <span class="attendance-student-avatar" aria-hidden="true">${escapeHtml(getAttendanceInitials(displayName))}</span>
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

  setDomHtml(container, html);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "register");
  setAttendanceSaveButtonState(attendanceRegisterSaveInProgress);
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
  alert(`Attendance saved successfully. ${absentStudents.length} student${absentStudents.length === 1 ? "" : "s"} marked absent.`);
}

function openViewAttendance() {
  const range = getDefaultAttendanceDateRange();
  renderViewAttendanceControls(range.start, range.end);
}

function renderAttendanceRecordsControlsMarkup(range) {
  return `
    <div class="attendance-sticky-control-pane attendance-report-control-pane">
      <div class="attendance-subscreen-header">
        <h2>Attendance Records</h2>
      </div>
      ${renderAttendanceDateFilter("view", range.start, range.end, "View Records")}
      ${renderAttendancePanelDots("records")}
    </div>
  `;
}

function renderViewAttendanceControls(startDate, endDate, message) {
  const range = normalizeAttendanceDateRange(startDate, endDate);
  const didShow = showScreen("attendance-report-screen");
  if (!didShow) return false;

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

async function renderViewAttendanceScreen(startDate, endDate) {
  const range = normalizeAttendanceDateRange(startDate, endDate);

  if (!isValidAttendanceDateRange(range.start, range.end)) {
    showAttendanceDatePopup("Start date must be before or the same as end date.");
    return;
  }

  const didShow = showScreen("attendance-report-screen");
  if (!didShow) return;

  const container = getDomElement("attendance-report-content");
  if (!container) {
    console.warn("Missing attendance report container.");
    return;
  }

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
    return;
  }

  if (!result.success) {
    setDomHtml(container, `
      ${renderAttendanceRecordsControlsMarkup(range)}
      <p class="error-message">${escapeHtml(result.error || result.message || "Failed to load attendance.")}</p>
    `);
    bindAttendanceUiHandlers(container);
    bindAttendancePanelSwipe(container, "records");
    return;
  }

  const groups = groupAttendanceStudents(result.students || []);
  const sortedGroups = Object.keys(groups).sort(sortGroupValues);

  let html = renderAttendanceRecordsControlsMarkup(range);

  if (sortedGroups.length === 0) {
    html += `<p class="helper-text attendance-empty-state">No attendance records found.</p>`;
  }

  sortedGroups.forEach(group => {
    html += `<div class="attendance-group-line" aria-label="Group ${escapeHtml(group)}"></div>`;

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
  });

  setDomHtml(container, html);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "records");
}

function openAttendanceStats() {
  const range = getDefaultAttendanceDateRange();
  renderAttendanceStatsControls(range.start, range.end);
}

function renderAttendanceStatsControlsMarkup(range) {
  return `
    <div class="attendance-sticky-control-pane attendance-stats-control-pane">
      <div class="attendance-subscreen-header">
        <h2>Statistics</h2>
      </div>
      ${renderAttendanceDateFilter("stats", range.start, range.end, "Calculate")}
      ${renderAttendancePanelDots("stats")}
    </div>
  `;
}

function renderAttendanceStatsControls(startDate, endDate, message) {
  const range = normalizeAttendanceDateRange(startDate, endDate);
  const didShow = showScreen("attendance-stats-screen");
  if (!didShow) return false;

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

async function renderAttendanceStatsScreen(startDate, endDate) {
  const range = normalizeAttendanceDateRange(startDate, endDate);

  if (!isValidAttendanceDateRange(range.start, range.end)) {
    showAttendanceDatePopup("Start date must be before or the same as end date.");
    return;
  }

  const didShow = showScreen("attendance-stats-screen");
  if (!didShow) return;

  const container = getDomElement("attendance-stats-content");
  if (!container) {
    console.warn("Missing attendance stats container.");
    return;
  }

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
    return;
  }

  if (!result.success) {
    setDomHtml(container, `
      ${renderAttendanceStatsControlsMarkup(range)}
      <p class="error-message">${escapeHtml(result.error || result.message || "Failed to load statistics.")}</p>
    `);
    bindAttendanceUiHandlers(container);
    bindAttendancePanelSwipe(container, "stats");
    return;
  }

  const groupAverages = Array.isArray(result.groupAverages) ? result.groupAverages : [];
  const perfectStudents = Array.isArray(result.perfectAttendanceStudents) ? result.perfectAttendanceStudents : [];

  let html = `
    ${renderAttendanceStatsControlsMarkup(range)}

    <div class="attendance-stat-grid">
      <div class="attendance-stat-card">
        <div class="attendance-stat-label">MAKTAB DAYS</div>
        <div class="attendance-stat-number">${result.totalMaktabDays || 0}</div>
      </div>

      <div class="attendance-stat-card">
        <div class="attendance-stat-label">Class average attendance</div>
        <div class="attendance-stat-number">${formatPercent(result.registerAverageAttendancePercent)}</div>
      </div>
    </div>

    <div class="attendance-breakdown-card">
      <h3>Group Breakdown</h3>
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
        html += `<div class="attendance-perfect-row">⭐ ${escapeHtml(student.username)} <span class="mini-text">(Grp ${escapeHtml(student.classgroup)})</span></div>`;
      });
  }

  html += `
      </div>
    </div>
  `;

  setDomHtml(container, html);
  bindAttendanceUiHandlers(container);
  bindAttendancePanelSwipe(container, "stats");
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
  renderAttendanceStatsScreen
};
