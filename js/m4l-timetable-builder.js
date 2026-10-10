/* M4L V102.9 - staged timetable publication, immutable live-source integration,
   per-group assignments and selective multi-session editing. */

const timetableBuilderState = {
  loaded: false,
  loading: false,
  activeTab: "timetable",
  selectedCourseId: "",
  editCourseId: "",
  editTimeSlotId: "",
  editSubjectId: "",
  editModuleId: "",
  editTaskId: "",
  taskFilterSubjectId: "",
  showInactiveSessions: false,
  bulkSelectionMode: false,
  selectedSessionIds: [],
  integrationPreview: null,
  data: {
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    courses: [],
    timeslots: [],
    sessions: [],
    subjects: [],
    modules: [],
    teachers: [],
    groups: ["ALL"],
    tasks: [],
    timetablestates: [],
    publications: [],
    globalzoomlink: "",
    liveSource: "TEACHER_ASSIGN",
    publishedSnapshotSchemaReady: false
  }
};

let timetableBuilderHandlersBound = false;

function getTimetableBuilderRole() {
  return String(typeof state !== "undefined" && state?.user ? state.user.role || "" : "")
    .trim()
    .toUpperCase();
}

async function showTimetableBuilder() {
  if (getTimetableBuilderRole() !== "ADMIN") {
    alert("Program Timetables are available to ADMIN accounts only.");
    return false;
  }

  bindTimetableBuilderHandlers();
  if (!showScreen("timetable-builder-screen")) return false;
  await loadTimetableBuilder();
  return true;
}

function bindTimetableBuilderHandlers() {
  if (timetableBuilderHandlersBound || !document) return true;
  timetableBuilderHandlersBound = true;
  document.addEventListener("click", handleTimetableBuilderClick);
  document.addEventListener("change", handleTimetableBuilderChange);
  document.addEventListener("input", handleTimetableBuilderChange);
  return true;
}

function getTimetableBuilderAction(event) {
  const target = event?.target;
  if (!target || typeof target.closest !== "function") return null;
  const action = target.closest("[data-ttb-action]");
  return action && action.closest("#timetable-builder-screen") ? action : null;
}

async function handleTimetableBuilderClick(event) {
  const target = getTimetableBuilderAction(event);
  if (!target || target.disabled) return;
  const action = target.dataset.ttbAction || "";
  if (!action) return;
  event.preventDefault();

  if (action === "reload") return loadTimetableBuilder(true);
  if (action === "show-tab") return showTimetableBuilderTab(target.dataset.ttbTab);
  if (action === "new-course") return editTimetableBuilderCourse("");
  if (action === "edit-course") return editTimetableBuilderCourse(target.dataset.courseId);
  if (action === "save-course") return saveTimetableBuilderCourse(target);
  if (action === "new-slot") return editTimetableBuilderTimeSlot("", true);
  if (action === "edit-slot") return editTimetableBuilderTimeSlot(target.dataset.timeSlotId, true);
  if (action === "save-slot") return saveTimetableBuilderTimeSlot(target);
  if (action === "new-subject") return editTimetableBuilderSubject("");
  if (action === "edit-subject") return editTimetableBuilderSubject(target.dataset.subjectId);
  if (action === "save-subject") return saveTimetableBuilderSubject(target);
  if (action === "new-module") return editTimetableBuilderModule("");
  if (action === "edit-module") return editTimetableBuilderModule(target.dataset.moduleId);
  if (action === "save-module") return saveTimetableBuilderModule(target);
  if (action === "new-task") return editTimetableBuilderTask("");
  if (action === "edit-task") return editTimetableBuilderTask(target.dataset.taskId);
  if (action === "save-task") return saveTimetableBuilderTask(target);
  if (action === "add-session") return openTimetableSessionEditor("", target.dataset.timeSlotId, target.dataset.day);
  if (action === "edit-session") return openTimetableSessionEditor(target.dataset.sessionId);
  if (action === "start-bulk-select") return startTimetableBulkSelection();
  if (action === "toggle-session-select") return toggleTimetableSessionSelection(target.dataset.sessionId);
  if (action === "clear-session-selection") return clearTimetableSessionSelection(false);
  if (action === "cancel-bulk-select") return clearTimetableSessionSelection(true);
  if (action === "edit-selected-sessions") return openTimetableBulkSessionEditor();
  if (action === "close-bulk-session") return closeTimetableBulkSessionEditor();
  if (action === "save-bulk-sessions") return saveTimetableBulkSessions(target);
  if (action === "close-session") return closeTimetableSessionEditor();
  if (action === "save-session") return saveTimetableBuilderSession(target);
  if (action === "delete-session") return deleteTimetableBuilderSession(target);
  if (action === "restore-session") return restoreTimetableBuilderSession(target);
  if (action === "publish-timetable") return publishTimetableBuilder(target);
  if (action === "review-integration") return openTimetableIntegrationReview();
  if (action === "close-integration") return closeTimetableIntegrationReview();
  if (action === "save-integration-source") return saveTimetableIntegrationSource(target);
  if (action === "toggle-inactive-sessions") {
    timetableBuilderState.showInactiveSessions = !timetableBuilderState.showInactiveSessions;
    return renderTimetableBuilderGrid();
  }
}

function handleTimetableBuilderChange(event) {
  const target = event?.target;
  if (!target || !target.closest("#timetable-builder-screen")) return;

  if (target.closest("#timetable-session-dialog")) {
    clearTimetableSessionMessage();
  }

  if (target.id === "ttb-course-select") {
    timetableBuilderState.selectedCourseId = target.value;
    timetableBuilderState.editCourseId = target.value;
    timetableBuilderState.editTimeSlotId = "";
    timetableBuilderState.bulkSelectionMode = false;
    timetableBuilderState.selectedSessionIds = [];
    timetableBuilderState.integrationPreview = null;
    renderTimetableBuilder();
    return;
  }

  if (target.id === "ttb-session-subject") {
    renderTimetableSessionModuleOptions(target.value, "");
    return;
  }

  if (target.id === "ttb-bulk-subject") {
    renderTimetableBulkModuleOptions(target.value, "");
    clearTimetableBulkSessionMessage();
    return;
  }

  if (target.matches("[data-ttb-bulk-apply]")) {
    updateTimetableBulkEditorControls();
    clearTimetableBulkSessionMessage();
    return;
  }

  if (target.closest("#timetable-bulk-session-dialog")) {
    clearTimetableBulkSessionMessage();
  }

  if (target.id === "ttb-integration-confirmation") {
    updateTimetableIntegrationControls();
    clearTimetableIntegrationMessage();
    return;
  }

  if (target.matches("input[name='ttb-session-group']")) {
    enforceTimetableBuilderGroupSelection(target);
    renderTimetableSessionGroupAssignments();
    return;
  }

  if (target.matches("input[name='ttb-session-day']")) {
    return;
  }

  if (target.id === "ttb-task-subject") {
    renderTaskModuleOptions(target.value, "");
    return;
  }

  if (target.id === "ttb-task-filter-subject") {
    timetableBuilderState.taskFilterSubjectId = target.value;
    renderTimetableBuilderTasks();
  }
}

async function loadTimetableBuilder(force = false) {
  if (timetableBuilderState.loading) return false;
  if (timetableBuilderState.loaded && !force) {
    renderTimetableBuilder();
    return true;
  }

  const hadLoadedData = timetableBuilderState.loaded;
  timetableBuilderState.loading = true;
  setTimetableBuilderMessage("Loading programs, curriculum and sessions…", "");
  if (!hadLoadedData) {
    setTimetableBuilderContent('<p class="helper-text">Loading Program Timetables...</p>');
  }

  try {
    const builder = await apiPost("/api/admin/timetable-builder/get", {}, state.token);
    if (!builder.success) throw timetableBuilderApiError(builder, "Unable to load Program Timetables");

    timetableBuilderState.data = {
      ...timetableBuilderState.data,
      ...builder,
      tasks: Array.isArray(builder.tasks) ? builder.tasks : []
    };
    timetableBuilderState.loaded = true;
    ensureTimetableBuilderSelections();
    setTimetableBuilderMessage("", "");
    renderTimetableBuilder();
    return true;
  } catch (error) {
    console.error("Could not load Program Timetables", error);
    const retryable = error?.retryable === true;
    const message = retryable
      ? "Google Sheets is temporarily busy. Your session remains active. Please wait a moment and try again."
      : error?.message || "Unable to load Program Timetables.";
    setTimetableBuilderMessage(message, "error");
    if (hadLoadedData) {
      renderTimetableBuilder();
    } else {
      setTimetableBuilderContent(`
        <div class="timetable-builder-empty">
          <h3>${retryable ? "Timetable temporarily unavailable" : "Builder setup required"}</h3>
          <p>${ttbEscape(message)}</p>
          <button type="button" class="timetable-builder-primary" data-ttb-action="reload">Try Again</button>
        </div>
      `);
    }
    return false;
  } finally {
    timetableBuilderState.loading = false;
  }
}

function ensureTimetableBuilderSelections() {
  const courses = timetableBuilderState.data.courses || [];
  const selectedExists = courses.some(course => course.courseid === timetableBuilderState.selectedCourseId);
  if (!selectedExists) {
    timetableBuilderState.selectedCourseId = courses.find(course => course.active)?.courseid || courses[0]?.courseid || "";
  }
  if (!timetableBuilderState.editCourseId && timetableBuilderState.selectedCourseId) {
    timetableBuilderState.editCourseId = timetableBuilderState.selectedCourseId;
  }

  const subjects = timetableBuilderState.data.subjects || [];
  if (!subjects.some(subject => subject.subjectid === timetableBuilderState.taskFilterSubjectId)) {
    timetableBuilderState.taskFilterSubjectId = subjects.find(subject => subject.active)?.subjectid || subjects[0]?.subjectid || "ALL";
  }
}

function showTimetableBuilderTab(tab) {
  const allowed = new Set(["timetable", "courses", "subjects", "modules", "tasks"]);
  timetableBuilderState.activeTab = allowed.has(tab) ? tab : "timetable";
  renderTimetableBuilder();
}

function renderTimetableBuilder() {
  renderTimetableBuilderStatus();
  document.querySelectorAll("#timetable-builder-screen [data-ttb-action='show-tab']").forEach(button => {
    const active = button.dataset.ttbTab === timetableBuilderState.activeTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  if (timetableBuilderState.activeTab === "courses") return renderTimetableBuilderCourses();
  if (timetableBuilderState.activeTab === "subjects") return renderTimetableBuilderSubjects();
  if (timetableBuilderState.activeTab === "modules") return renderTimetableBuilderModules();
  if (timetableBuilderState.activeTab === "tasks") return renderTimetableBuilderTasks();
  return renderTimetableBuilderGrid();
}

function getSelectedTimetableState() {
  return (timetableBuilderState.data.timetablestates || [])
    .find(item => item.courseid === timetableBuilderState.selectedCourseId) || {
      courseid: timetableBuilderState.selectedCourseId,
      stage: "DEVELOPMENT",
      currentpublicationid: "",
      versionno: 0
    };
}

function renderTimetableBuilderStatus() {
  const selectedState = getSelectedTimetableState();
  const label = document.getElementById("timetable-builder-stage-label");
  const detail = document.getElementById("timetable-builder-stage-detail");
  const publishButton = document.getElementById("timetable-builder-publish");
  const integrationButton = document.getElementById("timetable-builder-integration");
  const hasCourse = Boolean(timetableBuilderState.selectedCourseId);
  const isPublished = selectedState.stage === "PUBLISHED";
  const publishedIsLive = timetableBuilderState.data.liveSource === "PUBLISHED_TIMETABLE";

  if (label) label.textContent = isPublished
    ? `Published · version ${selectedState.versionno || 1}`
    : "Development draft";
  if (detail) detail.textContent = publishedIsLive
    ? selectedState.currentpublicationid
      ? isPublished
        ? `Published version ${selectedState.versionno} is live. A future draft remains hidden until it is published.`
        : `Published version ${selectedState.versionno} remains live. Current draft changes are hidden until the next publish.`
      : "Published timetable mode is active, but no valid current publication is available. Review the integration immediately."
    : isPublished
      ? `Snapshot published${selectedState.publisheddate ? ` on ${formatBuilderDate(selectedState.publisheddate)}` : ""}. TeacherAssign remains live until explicit activation.`
      : selectedState.currentpublicationid
        ? `Draft changes are not in published version ${selectedState.versionno}. TeacherAssign remains live until explicit activation.`
        : "No builder snapshot is published yet. TeacherAssign remains the live timetable source.";
  if (integrationButton) {
    integrationButton.hidden = !hasCourse;
    integrationButton.textContent = publishedIsLive ? "Review / Roll Back" : "Review Live Integration";
  }
  if (publishButton) {
    publishButton.hidden = !hasCourse;
    publishButton.textContent = isPublished ? "Publish New Version" : "Publish Timetable";
  }
}

function renderCourseToolbar() {
  const courses = timetableBuilderState.data.courses || [];
  const options = courses.map(course => `
    <option value="${ttbAttr(course.courseid)}" ${course.courseid === timetableBuilderState.selectedCourseId ? "selected" : ""}>
      ${ttbEscape(course.coursename)}${course.active ? "" : " — inactive"}
    </option>
  `).join("");

  return `
    <section class="timetable-builder-course-bar" aria-label="Program selection">
      <label class="timetable-builder-field timetable-builder-course-select">
        <span>Program</span>
        <select id="ttb-course-select" ${courses.length ? "" : "disabled"}>
          ${courses.length ? options : '<option value="">Create the first program</option>'}
        </select>
      </label>
      <button type="button" class="timetable-builder-secondary" data-ttb-action="new-course">New Program</button>
      ${timetableBuilderState.selectedCourseId ? `
        <button type="button" class="timetable-builder-secondary" data-ttb-action="edit-course" data-course-id="${ttbAttr(timetableBuilderState.selectedCourseId)}">Edit Program</button>
      ` : ""}
    </section>
  `;
}

function renderTimetableBuilderGrid() {
  const courseId = timetableBuilderState.selectedCourseId;
  const slots = (timetableBuilderState.data.timeslots || []).filter(slot => slot.courseid === courseId && slot.active);
  const days = timetableBuilderState.data.days || [];
  const sessions = (timetableBuilderState.data.sessions || []).filter(session => (
    session.active || timetableBuilderState.showInactiveSessions
  ));
  const selectedIds = new Set(timetableBuilderState.selectedSessionIds || []);
  const selectedCount = Array.from(selectedIds).filter(sessionId => (
    sessions.some(session => session.sessionid === sessionId && session.active && session.courseid === courseId)
  )).length;

  if (!courseId) {
    setTimetableBuilderContent(`
      ${renderCourseToolbar()}
      <div class="timetable-builder-empty">
        <h3>Create a program first</h3>
        <p>A program owns its time slots and weekly sessions.</p>
        <button type="button" class="timetable-builder-primary" data-ttb-action="new-course">Create Program</button>
      </div>
    `);
    return;
  }

  const head = days.map(day => `<div class="ttb-grid-heading">${ttbEscape(day)}</div>`).join("");
  const rows = slots.map(slot => {
    const cells = days.map(day => {
      const cellSessions = sessions.filter(session => (
        session.courseid === courseId && session.timeslotid === slot.timeslotid && session.dayofweek === day
      ));
      const cards = cellSessions.map(renderTimetableSessionCard).join("");
      return `
        <div class="ttb-grid-cell" data-day="${ttbAttr(day)}" data-time-slot-id="${ttbAttr(slot.timeslotid)}">
          <div class="ttb-grid-cell-sessions">${cards}</div>
          <button type="button" class="ttb-grid-add" data-ttb-action="add-session" data-time-slot-id="${ttbAttr(slot.timeslotid)}" data-day="${ttbAttr(day)}" aria-label="Add ${ttbAttr(day)} ${ttbAttr(formatBuilderTimeRange(slot))} session">+</button>
        </div>
      `;
    }).join("");

    return `
      <div class="ttb-grid-time">
        <strong>${ttbEscape(formatBuilderTimeRange(slot))}</strong>
        <button type="button" data-ttb-action="edit-slot" data-time-slot-id="${ttbAttr(slot.timeslotid)}">Edit</button>
      </div>
      ${cells}
    `;
  }).join("");

  setTimetableBuilderContent(`
    ${renderCourseToolbar()}
    <section class="timetable-builder-grid-card">
      <div class="timetable-builder-grid-title">
        <div>
          <h3>Weekly sessions</h3>
          <p>${timetableBuilderState.bulkSelectionMode
            ? "Select 2–100 active sessions, then choose Edit selected."
            : "Choose a cell to add sessions. One subject/module is repeated across the selected days and groups."}</p>
        </div>
        <div class="timetable-builder-grid-title-actions">
          ${timetableBuilderState.bulkSelectionMode ? `
            <span class="ttb-bulk-selection-count">${selectedCount} selected</span>
            <button type="button" class="timetable-builder-secondary" data-ttb-action="clear-session-selection" ${selectedCount ? "" : "disabled"}>Clear</button>
            <button type="button" class="timetable-builder-primary" data-ttb-action="edit-selected-sessions" ${selectedCount >= 2 ? "" : "disabled"}>Edit selected</button>
            <button type="button" class="timetable-builder-secondary" data-ttb-action="cancel-bulk-select">Done</button>
          ` : `
            <button type="button" class="timetable-builder-secondary" data-ttb-action="start-bulk-select">Select sessions</button>
          `}
          <button type="button" class="timetable-builder-secondary" data-ttb-action="toggle-inactive-sessions">${timetableBuilderState.showInactiveSessions ? "Hide inactive" : "Show inactive"}</button>
          <span>${slots.length} ${slots.length === 1 ? "time slot" : "time slots"}</span>
        </div>
      </div>
      ${slots.length ? `
        <div class="timetable-builder-grid-scroll">
          <div class="timetable-builder-week-grid" style="--ttb-day-count:${days.length}">
            <div class="ttb-grid-heading ttb-grid-heading--time">Time</div>
            ${head}
            ${rows}
          </div>
        </div>
      ` : `
        <div class="timetable-builder-empty timetable-builder-empty--inside">
          <p>Create at least one active time slot for this program.</p>
          <button type="button" class="timetable-builder-primary" data-ttb-action="new-slot">Create Time Slot</button>
        </div>
      `}
    </section>
  `);
}

function renderTimetableSessionCard(session) {
  const meta = [
    `Group ${session.groupno}`,
    session.teachername,
    session.zoomlink ? "Zoom override" : "Global Zoom"
  ].filter(Boolean).join(" · ");
  const selectionMode = timetableBuilderState.bulkSelectionMode;
  const selected = (timetableBuilderState.selectedSessionIds || []).includes(session.sessionid);
  const selectable = selectionMode && session.active;
  const action = selectable ? "toggle-session-select" : selectionMode ? "" : "edit-session";
  return `
    <button type="button" class="ttb-session-card ${session.active ? "" : "is-inactive"} ${selected ? "is-selected" : ""}" ${action ? `data-ttb-action="${action}"` : ""} data-session-id="${ttbAttr(session.sessionid)}" ${selectable ? `aria-pressed="${selected ? "true" : "false"}"` : ""} ${selectionMode && !session.active ? "disabled" : ""}>
      ${selectionMode ? `<span class="ttb-session-select-indicator" aria-hidden="true">${selected ? "✓" : ""}</span>` : ""}
      <strong>${ttbEscape(session.subjectname || session.subjectid)}</strong>
      ${session.modulename ? `<span>${ttbEscape(session.modulename)}</span>` : ""}
      <small>${ttbEscape(meta)}</small>
    </button>
  `;
}

function startTimetableBulkSelection() {
  timetableBuilderState.bulkSelectionMode = true;
  timetableBuilderState.selectedSessionIds = [];
  renderTimetableBuilderGrid();
  return true;
}

function toggleTimetableSessionSelection(sessionId) {
  const session = (timetableBuilderState.data.sessions || []).find(item => (
    item.sessionid === sessionId &&
    item.courseid === timetableBuilderState.selectedCourseId &&
    item.active
  ));
  if (!timetableBuilderState.bulkSelectionMode || !session) return false;

  const selected = new Set(timetableBuilderState.selectedSessionIds || []);
  if (selected.has(sessionId)) selected.delete(sessionId);
  else if (selected.size >= 100) {
    setTimetableBuilderMessage("Select no more than 100 sessions at once.", "error");
    return false;
  } else selected.add(sessionId);
  timetableBuilderState.selectedSessionIds = Array.from(selected);
  setTimetableBuilderMessage("", "");
  renderTimetableBuilderGrid();
  return true;
}

function clearTimetableSessionSelection(exitMode) {
  timetableBuilderState.selectedSessionIds = [];
  if (exitMode) timetableBuilderState.bulkSelectionMode = false;
  renderTimetableBuilderGrid();
  return true;
}

function renderTimetableBuilderCourses() {
  const course = (timetableBuilderState.data.courses || []).find(item => item.courseid === timetableBuilderState.editCourseId) || null;
  const courseId = timetableBuilderState.selectedCourseId;
  const slot = (timetableBuilderState.data.timeslots || []).find(item => item.timeslotid === timetableBuilderState.editTimeSlotId) || null;
  const slots = (timetableBuilderState.data.timeslots || []).filter(item => item.courseid === courseId);

  setTimetableBuilderContent(`
    ${renderCourseToolbar()}
    <div class="timetable-builder-management-grid">
      <section class="timetable-builder-panel">
        <div class="timetable-builder-panel-heading">
          <h3>${course ? "Modify Program" : "Add Program"}</h3>
          ${course ? '<button type="button" data-ttb-action="new-course">Add another</button>' : ""}
        </div>
        <input id="ttb-course-id" type="hidden" value="${ttbAttr(course?.courseid || "")}" />
        <label class="timetable-builder-field">
          <span>Program name</span>
          <input id="ttb-course-name" type="text" maxlength="100" value="${ttbAttr(course?.coursename || "")}" placeholder="e.g. Reboot Your Maktab" />
        </label>
        <label class="timetable-builder-check">
          <input id="ttb-course-active" type="checkbox" ${course ? (course.active ? "checked" : "") : "checked"} />
          <span>Active program</span>
        </label>
        <button type="button" class="timetable-builder-primary" data-ttb-action="save-course">${course ? "Save Program" : "Create Program"}</button>
      </section>

      <section class="timetable-builder-panel timetable-builder-panel--wide">
        <div class="timetable-builder-panel-heading">
          <div>
            <h3>Program Time Slots</h3>
            <p>Every row needs a start and end time.</p>
          </div>
          ${courseId ? '<button type="button" data-ttb-action="new-slot">New time slot</button>' : ""}
        </div>
        ${courseId ? `
          <div class="timetable-builder-inline-form">
            <input id="ttb-slot-id" type="hidden" value="${ttbAttr(slot?.timeslotid || "")}" />
            <label class="timetable-builder-field"><span>Start</span><input id="ttb-slot-start" type="text" data-time24 placeholder="HH:mm" autocomplete="off" maxlength="8" lang="en-GB" step="60" value="${ttbAttr(slot?.starttime || "")}" /></label>
            <label class="timetable-builder-field"><span>End</span><input id="ttb-slot-end" type="text" data-time24 placeholder="HH:mm" autocomplete="off" maxlength="8" lang="en-GB" step="60" value="${ttbAttr(slot?.endtime || "")}" /></label>
            <label class="timetable-builder-check"><input id="ttb-slot-active" type="checkbox" ${slot ? (slot.active ? "checked" : "") : "checked"} /><span>Active</span></label>
            <button type="button" class="timetable-builder-primary" data-ttb-action="save-slot">${slot ? "Save Time Slot" : "Add Time Slot"}</button>
          </div>
          ${renderTimeSlotList(slots)}
        ` : '<div class="timetable-builder-empty timetable-builder-empty--inside"><p>Create or select a program first.</p></div>'}
      </section>
    </div>
  `);
}

function renderTimeSlotList(slots) {
  if (!slots.length) return '<p class="timetable-builder-list-empty">No time slots have been added.</p>';
  return `
    <div class="timetable-builder-record-list">
      ${slots.map(slot => `
        <button type="button" class="timetable-builder-record-row ${slot.active ? "" : "is-inactive"}" data-ttb-action="edit-slot" data-time-slot-id="${ttbAttr(slot.timeslotid)}">
          <span><strong>${ttbEscape(formatBuilderTimeRange(slot))}</strong><small>${ttbEscape(slot.timeslotid)}</small></span>
          <span class="timetable-builder-status">${slot.active ? "Active" : "Inactive"}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderTimetableBuilderSubjects() {
  const subject = (timetableBuilderState.data.subjects || []).find(item => item.subjectid === timetableBuilderState.editSubjectId) || null;
  const subjects = timetableBuilderState.data.subjects || [];
  setTimetableBuilderContent(`
    <div class="timetable-builder-management-grid">
      <section class="timetable-builder-panel">
        <div class="timetable-builder-panel-heading"><h3>${subject ? "Modify Subject" : "Add Subject"}</h3>${subject ? '<button type="button" data-ttb-action="new-subject">Add another</button>' : ""}</div>
        <input id="ttb-subject-id" type="hidden" value="${ttbAttr(subject?.subjectid || "")}" />
        <label class="timetable-builder-field"><span>Subject name</span><input id="ttb-subject-name" type="text" value="${ttbAttr(subject?.subjectname || "")}" placeholder="Subject name" /></label>
        <label class="timetable-builder-check"><input id="ttb-subject-active" type="checkbox" ${subject ? (subject.active ? "checked" : "") : "checked disabled"} /><span>Active subject</span></label>
        <button type="button" class="timetable-builder-primary" data-ttb-action="save-subject">${subject ? "Save Subject" : "Create Subject"}</button>
      </section>
      <section class="timetable-builder-panel timetable-builder-panel--wide">
        <div class="timetable-builder-panel-heading"><div><h3>Subjects</h3><p>${subjects.length} records</p></div><button type="button" data-ttb-action="new-subject">New Subject</button></div>
        ${renderCurriculumRows(subjects, subject => ({ id: subject.subjectid, title: subject.subjectname, subtitle: subject.subjectid, active: subject.active, action: "edit-subject", dataName: "subject-id" }))}
      </section>
    </div>
  `);
}

function renderTimetableBuilderModules() {
  const module = (timetableBuilderState.data.modules || []).find(item => item.moduleid === timetableBuilderState.editModuleId) || null;
  const subjects = timetableBuilderState.data.subjects || [];
  const modules = timetableBuilderState.data.modules || [];
  const defaultSubject = module?.subjectid || subjects.find(subject => subject.active)?.subjectid || subjects[0]?.subjectid || "";
  setTimetableBuilderContent(`
    <div class="timetable-builder-management-grid">
      <section class="timetable-builder-panel">
        <div class="timetable-builder-panel-heading"><h3>${module ? "Modify Module" : "Add Module"}</h3>${module ? '<button type="button" data-ttb-action="new-module">Add another</button>' : ""}</div>
        <input id="ttb-module-id" type="hidden" value="${ttbAttr(module?.moduleid || "")}" />
        <label class="timetable-builder-field"><span>Subject</span><select id="ttb-module-subject">${renderSubjectOptions(defaultSubject, true)}</select></label>
        <label class="timetable-builder-field"><span>Module name</span><input id="ttb-module-name" type="text" value="${ttbAttr(module?.modulename || "")}" placeholder="Module name" /></label>
        <label class="timetable-builder-field"><span>Sort order</span><input id="ttb-module-sort" type="number" min="1" step="1" value="${ttbAttr(module?.sortorder || "")}" placeholder="Automatic" /></label>
        <label class="timetable-builder-check"><input id="ttb-module-active" type="checkbox" ${module ? (module.active ? "checked" : "") : "checked disabled"} /><span>Active module</span></label>
        <button type="button" class="timetable-builder-primary" data-ttb-action="save-module">${module ? "Save Module" : "Create Module"}</button>
      </section>
      <section class="timetable-builder-panel timetable-builder-panel--wide">
        <div class="timetable-builder-panel-heading"><div><h3>Modules</h3><p>${modules.length} records</p></div><button type="button" data-ttb-action="new-module">New Module</button></div>
        ${renderCurriculumRows(modules, item => ({ id: item.moduleid, title: item.modulename, subtitle: `${subjectNameFor(item.subjectid)} · Order ${item.sortorder || "—"}`, active: item.active, action: "edit-module", dataName: "module-id" }))}
      </section>
    </div>
  `);
}

function renderTimetableBuilderTasks() {
  const task = (timetableBuilderState.data.tasks || []).find(item => item.taskid === timetableBuilderState.editTaskId) || null;
  const subjects = timetableBuilderState.data.subjects || [];
  const defaultSubject = task?.subjectid || timetableBuilderState.taskFilterSubjectId || subjects.find(subject => subject.active)?.subjectid || "";
  const tasks = (timetableBuilderState.data.tasks || []).filter(item => (
    !timetableBuilderState.taskFilterSubjectId || timetableBuilderState.taskFilterSubjectId === "ALL" || item.subjectid === timetableBuilderState.taskFilterSubjectId
  ));
  setTimetableBuilderContent(`
    <div class="timetable-builder-management-grid">
      <section class="timetable-builder-panel">
        <div class="timetable-builder-panel-heading"><h3>${task ? "Modify Task" : "Add Task"}</h3>${task ? '<button type="button" data-ttb-action="new-task">Add another</button>' : ""}</div>
        <input id="ttb-task-id" type="hidden" value="${ttbAttr(task?.taskid || "")}" />
        <label class="timetable-builder-field"><span>Subject</span><select id="ttb-task-subject">${renderSubjectOptions(defaultSubject, true)}</select></label>
        <label class="timetable-builder-field"><span>Module <small>optional</small></span><select id="ttb-task-module"></select></label>
        <label class="timetable-builder-field"><span>Task name</span><input id="ttb-task-name" type="text" value="${ttbAttr(task?.taskname || "")}" placeholder="Task name" /></label>
        <label class="timetable-builder-check"><input id="ttb-task-active" type="checkbox" ${task ? (task.active ? "checked" : "") : "checked disabled"} /><span>Active task</span></label>
        <button type="button" class="timetable-builder-primary" data-ttb-action="save-task">${task ? "Save Task" : "Create Task"}</button>
      </section>
      <section class="timetable-builder-panel timetable-builder-panel--wide">
        <div class="timetable-builder-panel-heading timetable-builder-panel-heading--filter">
          <div><h3>Tasks</h3><p>${tasks.length} shown</p></div>
          <label class="timetable-builder-field"><span>Filter subject</span><select id="ttb-task-filter-subject"><option value="ALL">All subjects</option>${renderSubjectOptions(timetableBuilderState.taskFilterSubjectId, false)}</select></label>
          <button type="button" data-ttb-action="new-task">New Task</button>
        </div>
        ${renderCurriculumRows(tasks, item => ({ id: item.taskid, title: item.taskname, subtitle: `${subjectNameFor(item.subjectid)}${item.modulename ? ` · ${item.modulename}` : ""}`, active: item.active, action: "edit-task", dataName: "task-id" }))}
      </section>
    </div>
  `);
  renderTaskModuleOptions(defaultSubject, task?.moduleid || "");
}

function renderCurriculumRows(items, mapper) {
  if (!items.length) return '<p class="timetable-builder-list-empty">No records found.</p>';
  return `<div class="timetable-builder-record-list timetable-builder-record-list--scroll">${items.map(item => {
    const row = mapper(item);
    return `
      <button type="button" class="timetable-builder-record-row ${row.active ? "" : "is-inactive"}" data-ttb-action="${ttbAttr(row.action)}" data-${ttbAttr(row.dataName)}="${ttbAttr(row.id)}">
        <span><strong>${ttbEscape(row.title)}</strong><small>${ttbEscape(row.subtitle)}</small></span>
        <span class="timetable-builder-status">${row.active ? "Active" : "Inactive"}</span>
      </button>
    `;
  }).join("")}</div>`;
}

function renderSubjectOptions(selectedId, activeOnly) {
  return (timetableBuilderState.data.subjects || [])
    .filter(subject => !activeOnly || subject.active || subject.subjectid === selectedId)
    .map(subject => `<option value="${ttbAttr(subject.subjectid)}" ${subject.subjectid === selectedId ? "selected" : ""}>${ttbEscape(subject.subjectname)}${subject.active ? "" : " — inactive"}</option>`)
    .join("");
}

function renderTaskModuleOptions(subjectId, selectedModuleId) {
  const select = document.getElementById("ttb-task-module");
  if (!select) return;
  const modules = (timetableBuilderState.data.modules || []).filter(module => (
    module.subjectid === subjectId && (module.active || module.moduleid === selectedModuleId)
  ));
  select.innerHTML = `<option value="">No module</option>${modules.map(module => `<option value="${ttbAttr(module.moduleid)}" ${module.moduleid === selectedModuleId ? "selected" : ""}>${ttbEscape(module.modulename)}</option>`).join("")}`;
}

function renderTimetableSessionModuleOptions(subjectId, selectedModuleId) {
  const select = document.getElementById("ttb-session-module");
  if (!select) return;
  const modules = (timetableBuilderState.data.modules || []).filter(module => (
    module.subjectid === subjectId && (module.active || module.moduleid === selectedModuleId)
  ));
  select.innerHTML = `<option value="">No module</option>${modules.map(module => `<option value="${ttbAttr(module.moduleid)}" ${module.moduleid === selectedModuleId ? "selected" : ""}>${ttbEscape(module.modulename)}</option>`).join("")}`;
  select.disabled = !subjectId;
}

function editTimetableBuilderCourse(courseId) {
  timetableBuilderState.activeTab = "courses";
  timetableBuilderState.editCourseId = courseId || "";
  renderTimetableBuilder();
}

function editTimetableBuilderTimeSlot(timeSlotId, switchTab = false) {
  if (switchTab) timetableBuilderState.activeTab = "courses";
  timetableBuilderState.editTimeSlotId = timeSlotId || "";
  renderTimetableBuilder();
}

function editTimetableBuilderSubject(subjectId) {
  timetableBuilderState.editSubjectId = subjectId || "";
  renderTimetableBuilder();
}

function editTimetableBuilderModule(moduleId) {
  timetableBuilderState.editModuleId = moduleId || "";
  renderTimetableBuilder();
}

function editTimetableBuilderTask(taskId) {
  timetableBuilderState.editTaskId = taskId || "";
  renderTimetableBuilder();
}

async function saveTimetableBuilderCourse(button) {
  const courseid = valueOf("ttb-course-id");
  const courseName = valueOf("ttb-course-name");
  if (!courseName) return setTimetableBuilderMessage("Enter a program name.", "error");
  return runTimetableBuilderSave(button, "/api/admin/timetable-builder/course/save", {
    courseid,
    courseName,
    active: checkedOf("ttb-course-active")
  }, result => {
    timetableBuilderState.selectedCourseId = result.course?.courseid || courseid;
    timetableBuilderState.editCourseId = timetableBuilderState.selectedCourseId;
  });
}

async function saveTimetableBuilderTimeSlot(button) {
  const courseid = timetableBuilderState.selectedCourseId;
  const startTime = valueOf("ttb-slot-start");
  const endTime = valueOf("ttb-slot-end");
  if (!courseid || !startTime || !endTime) return setTimetableBuilderMessage("Select a program and enter start and end times.", "error");
  return runTimetableBuilderSave(button, "/api/admin/timetable-builder/time-slot/save", {
    timeslotid: valueOf("ttb-slot-id"), courseid, startTime, endTime, active: checkedOf("ttb-slot-active")
  }, () => { timetableBuilderState.editTimeSlotId = ""; });
}

async function saveTimetableBuilderSubject(button) {
  const subjectid = valueOf("ttb-subject-id");
  const subjectName = valueOf("ttb-subject-name");
  if (!subjectName) return setTimetableBuilderMessage("Enter a subject name.", "error");
  const path = subjectid ? "/api/admin/subjects/update" : "/api/admin/subjects/create";
  const payload = subjectid
    ? { subjectid, subjectName, active: checkedOf("ttb-subject-active") }
    : { subjectName };
  return runTimetableBuilderSave(button, path, payload, () => { timetableBuilderState.editSubjectId = ""; });
}

async function saveTimetableBuilderModule(button) {
  const moduleid = valueOf("ttb-module-id");
  const subjectid = valueOf("ttb-module-subject");
  const moduleName = valueOf("ttb-module-name");
  if (!subjectid || !moduleName) return setTimetableBuilderMessage("Select a subject and enter a module name.", "error");
  const path = moduleid ? "/api/admin/modules/update" : "/api/admin/modules/create";
  const payload = {
    moduleid,
    subjectid,
    moduleName,
    sortOrder: valueOf("ttb-module-sort"),
    active: checkedOf("ttb-module-active")
  };
  if (!moduleid) delete payload.active;
  return runTimetableBuilderSave(button, path, payload, () => { timetableBuilderState.editModuleId = ""; });
}

async function saveTimetableBuilderTask(button) {
  const taskid = valueOf("ttb-task-id");
  const subjectid = valueOf("ttb-task-subject");
  const moduleid = valueOf("ttb-task-module");
  const taskName = valueOf("ttb-task-name");
  if (!subjectid || !taskName) return setTimetableBuilderMessage("Select a subject and enter a task name.", "error");
  const path = taskid ? "/api/admin/tasks/update" : "/api/admin/tasks/create";
  const payload = { taskid, subjectid, moduleid, taskName, active: checkedOf("ttb-task-active") };
  if (!taskid) delete payload.active;
  return runTimetableBuilderSave(button, path, payload, () => {
    timetableBuilderState.editTaskId = "";
    timetableBuilderState.taskFilterSubjectId = subjectid;
  });
}

async function runTimetableBuilderSave(button, path, payload, onSuccess) {
  button.disabled = true;
  setTimetableBuilderMessage("Saving…", "");
  try {
    const result = await apiPost(path, payload, state.token);
    if (!result.success) throw new Error(result.error || "Save failed");
    if (typeof onSuccess === "function") onSuccess(result);
    timetableBuilderState.loaded = false;
    await loadTimetableBuilder(true);
    setTimetableBuilderMessage(result.message || "Saved.", "success");
    return true;
  } catch (error) {
    console.error("Timetable Builder save failed", error);
    setTimetableBuilderMessage(error?.message || "Save failed.", "error");
    return false;
  } finally {
    button.disabled = false;
  }
}

function openTimetableSessionEditor(sessionId, timeSlotId, day) {
  const courseId = timetableBuilderState.selectedCourseId;
  const session = (timetableBuilderState.data.sessions || []).find(item => item.sessionid === sessionId) || null;
  const selectedSubject = session?.subjectid || (timetableBuilderState.data.subjects || []).find(subject => subject.active)?.subjectid || "";
  const selectedTeacher = session?.teacherid || (timetableBuilderState.data.teachers || []).find(teacher => teacher.active)?.teacherid || "";
  const dialog = document.getElementById("timetable-session-dialog");
  if (!dialog || !courseId) return false;

  setValue("ttb-session-id", session?.sessionid || "");
  setValue("ttb-session-course", session?.courseid || courseId);
  renderTimetableSessionChoices(
    "ttb-session-days",
    "ttb-session-day",
    timetableBuilderState.data.days || [],
    [session?.dayofweek || day || "Mon"],
    session ? "radio" : "checkbox"
  );
  setSelectOptions("ttb-session-slot", (timetableBuilderState.data.timeslots || [])
    .filter(slot => slot.courseid === courseId && (slot.active || slot.timeslotid === session?.timeslotid))
    .map(slot => ({ value: slot.timeslotid, label: formatBuilderTimeRange(slot) })), session?.timeslotid || timeSlotId || "");
  renderTimetableSessionChoices(
    "ttb-session-groups",
    "ttb-session-group",
    timetableBuilderState.data.groups || [],
    [session?.groupno || "ALL"],
    session ? "radio" : "checkbox"
  );
  setSelectOptions("ttb-session-subject", (timetableBuilderState.data.subjects || [])
    .filter(subject => subject.active || subject.subjectid === session?.subjectid)
    .map(subject => ({ value: subject.subjectid, label: `${subject.subjectname}${subject.active ? "" : " — inactive"}` })), selectedSubject);
  renderTimetableSessionModuleOptions(selectedSubject, session?.moduleid || "");
  renderTimetableSessionGroupAssignments(session ? {
    [session.groupno]: { teacherid: selectedTeacher, zoomlink: session.zoomlink || "" }
  } : {});
  document.getElementById("timetable-session-dialog-title").textContent = session ? "Modify Session" : "Add Sessions";
  document.getElementById("ttb-save-session").textContent = session ? "Save Session" : "Save Sessions";
  document.getElementById("ttb-session-days-help").textContent = session
    ? "Modify this session's day."
    : "Select one or more days.";
  document.getElementById("ttb-session-groups-help").textContent = session
    ? "Modify this session's group."
    : "Select ALL by itself, or select individual groups and assign each its own teacher and Zoom link.";
  const deleteButton = document.getElementById("ttb-delete-session");
  const restoreButton = document.getElementById("ttb-restore-session");
  if (deleteButton) deleteButton.hidden = !session || !session.active;
  if (restoreButton) restoreButton.hidden = !session || session.active;
  const saveButton = document.getElementById("ttb-save-session");
  if (saveButton) saveButton.hidden = Boolean(session && !session.active);
  clearTimetableSessionMessage();

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return true;
}

function collectTimetableSessionGroupAssignments() {
  return Array.from(document.querySelectorAll("#ttb-session-group-assignments [data-group-no]")).reduce((result, row) => {
    result[row.dataset.groupNo] = {
      groupno: row.dataset.groupNo,
      teacherid: String(row.querySelector(".ttb-session-group-teacher")?.value || "").trim(),
      zoomlink: String(row.querySelector(".ttb-session-group-zoom")?.value || "").trim()
    };
    return result;
  }, {});
}

function renderTimetableSessionGroupAssignments(initialValues) {
  const container = document.getElementById("ttb-session-group-assignments");
  if (!container) return false;
  const values = initialValues || collectTimetableSessionGroupAssignments();
  const groups = selectedTimetableBuilderValues("ttb-session-group");
  const teachers = timetableBuilderState.data.teachers || [];
  if (!groups.length) {
    container.innerHTML = '<p class="timetable-builder-list-empty">Select at least one group.</p>';
    return true;
  }

  container.innerHTML = groups.map(groupno => {
    const assignment = values[groupno] || {};
    const teacherOptions = teachers
      .filter(teacher => teacher.active || teacher.teacherid === assignment.teacherid)
      .map(teacher => `<option value="${ttbAttr(teacher.teacherid)}" ${teacher.teacherid === assignment.teacherid ? "selected" : ""}>${ttbEscape(teacher.teachername)} — ${ttbEscape(teacher.role)}${teacher.active ? "" : " — inactive"}</option>`)
      .join("");
    return `
      <article class="timetable-session-group-assignment" data-group-no="${ttbAttr(groupno)}">
        <strong>${groupno === "ALL" ? "All groups together" : `Group ${ttbEscape(groupno)}`}</strong>
        <div class="timetable-session-group-assignment-grid">
          <label class="timetable-builder-field">
            <span>Teacher</span>
            <select class="ttb-session-group-teacher" required>
              <option value="">Select teacher</option>
              ${teacherOptions}
            </select>
          </label>
          <label class="timetable-builder-field">
            <span>Zoom override <small>optional</small></span>
            <input class="ttb-session-group-zoom" type="url" inputmode="url" value="${ttbAttr(assignment.zoomlink || "")}" placeholder="Use global Zoom when blank" />
          </label>
        </div>
      </article>
    `;
  }).join("");
  return true;
}

function closeTimetableSessionEditor() {
  const dialog = document.getElementById("timetable-session-dialog");
  if (!dialog) return false;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  clearTimetableSessionMessage();
  return true;
}

function openTimetableBulkSessionEditor() {
  const selected = getSelectedActiveTimetableSessions();
  if (selected.length < 2) {
    setTimetableBuilderMessage("Select at least two active sessions to edit together.", "error");
    return false;
  }

  const dialog = document.getElementById("timetable-bulk-session-dialog");
  if (!dialog) return false;
  const count = document.getElementById("ttb-bulk-session-count");
  if (count) count.textContent = `${selected.length} sessions selected`;

  const activeSubjects = (timetableBuilderState.data.subjects || []).filter(subject => subject.active);
  const defaultSubjectId = activeSubjects.some(subject => subject.subjectid === selected[0]?.subjectid)
    ? selected[0].subjectid
    : activeSubjects[0]?.subjectid || "";
  setSelectOptions("ttb-bulk-subject", activeSubjects.map(subject => ({
    value: subject.subjectid,
    label: subject.subjectname
  })), defaultSubjectId);
  renderTimetableBulkModuleOptions(defaultSubjectId, selected[0]?.moduleid || "");

  const activeTeachers = (timetableBuilderState.data.teachers || []).filter(teacher => teacher.active);
  const defaultTeacherId = activeTeachers.some(teacher => teacher.teacherid === selected[0]?.teacherid)
    ? selected[0].teacherid
    : activeTeachers[0]?.teacherid || "";
  setSelectOptions("ttb-bulk-teacher", activeTeachers.map(teacher => ({
    value: teacher.teacherid,
    label: `${teacher.teachername} — ${teacher.role}`
  })), defaultTeacherId);

  ["ttb-bulk-apply-subject-module", "ttb-bulk-apply-teacher", "ttb-bulk-apply-zoom"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.checked = false;
  });
  setValue("ttb-bulk-zoom", "");
  updateTimetableBulkEditorControls();
  clearTimetableBulkSessionMessage();
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  return true;
}

function getSelectedActiveTimetableSessions() {
  const selectedIds = new Set(timetableBuilderState.selectedSessionIds || []);
  return (timetableBuilderState.data.sessions || []).filter(session => (
    selectedIds.has(session.sessionid) &&
    session.courseid === timetableBuilderState.selectedCourseId &&
    session.active
  ));
}

function renderTimetableBulkModuleOptions(subjectId, selectedModuleId) {
  const modules = (timetableBuilderState.data.modules || []).filter(module => (
    module.subjectid === subjectId && module.active
  ));
  setSelectOptions("ttb-bulk-module", [
    { value: "", label: "No module" },
    ...modules.map(module => ({ value: module.moduleid, label: module.modulename }))
  ], modules.some(module => module.moduleid === selectedModuleId) ? selectedModuleId : "");
}

function updateTimetableBulkEditorControls() {
  const subjectEnabled = checkedOf("ttb-bulk-apply-subject-module");
  const teacherEnabled = checkedOf("ttb-bulk-apply-teacher");
  const zoomEnabled = checkedOf("ttb-bulk-apply-zoom");
  const controls = [
    ["ttb-bulk-subject", subjectEnabled],
    ["ttb-bulk-module", subjectEnabled],
    ["ttb-bulk-teacher", teacherEnabled],
    ["ttb-bulk-zoom", zoomEnabled]
  ];
  controls.forEach(([id, enabled]) => {
    const element = document.getElementById(id);
    if (element) element.disabled = !enabled;
  });
  return true;
}

function closeTimetableBulkSessionEditor() {
  const dialog = document.getElementById("timetable-bulk-session-dialog");
  if (!dialog) return false;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
  clearTimetableBulkSessionMessage();
  return true;
}

async function saveTimetableBulkSessions(button) {
  const selected = getSelectedActiveTimetableSessions();
  const applysubjectmodule = checkedOf("ttb-bulk-apply-subject-module");
  const applyteacher = checkedOf("ttb-bulk-apply-teacher");
  const applyzoom = checkedOf("ttb-bulk-apply-zoom");
  if (selected.length < 2) {
    showTimetableBulkSessionMessage("Select at least two active sessions.");
    return false;
  }
  if (!applysubjectmodule && !applyteacher && !applyzoom) {
    showTimetableBulkSessionMessage("Choose at least one field to change.");
    return false;
  }
  if (applysubjectmodule && !valueOf("ttb-bulk-subject")) {
    showTimetableBulkSessionMessage("Select the subject to apply.");
    return false;
  }
  if (applyteacher && !valueOf("ttb-bulk-teacher")) {
    showTimetableBulkSessionMessage("Select the teacher to apply.");
    return false;
  }

  const fields = [
    applysubjectmodule ? "subject/module" : "",
    applyteacher ? "teacher" : "",
    applyzoom ? "Zoom override" : ""
  ].filter(Boolean).join(", ");
  if (!window.confirm(`Apply ${fields} to ${selected.length} selected sessions?\n\nDays, time slots, groups and active status will not change.`)) {
    return false;
  }

  button.disabled = true;
  showTimetableBulkSessionMessage("Validating every selected session before saving…", "working");
  const payload = {
    courseid: timetableBuilderState.selectedCourseId,
    sessionids: selected.map(session => session.sessionid),
    applysubjectmodule,
    subjectid: valueOf("ttb-bulk-subject"),
    moduleid: valueOf("ttb-bulk-module"),
    applyteacher,
    teacherid: valueOf("ttb-bulk-teacher"),
    applyzoom,
    zoomlink: valueOf("ttb-bulk-zoom")
  };

  try {
    const result = await apiPost(
      "/api/admin/timetable-builder/session/bulk-update",
      payload,
      state.token
    );
    if (!result.success) {
      showTimetableBulkSessionMessage(
        result.error || "Unable to update the selected sessions",
        "error",
        result.conflicts
      );
      return false;
    }

    applyTimetableSessionUpdates(result.sessions || []);
    if (result.changed !== false) {
      markLocalTimetableDevelopment(timetableBuilderState.selectedCourseId);
    }
    closeTimetableBulkSessionEditor();
    timetableBuilderState.bulkSelectionMode = false;
    timetableBuilderState.selectedSessionIds = [];
    renderTimetableBuilderGrid();
    setTimetableBuilderMessage(result.message || "Selected sessions updated.", "success");
    return true;
  } catch (error) {
    showTimetableBulkSessionMessage(error?.message || "Unable to update the selected sessions.", "error");
    return false;
  } finally {
    button.disabled = false;
  }
}

async function saveTimetableBuilderSession(button) {
  const sessionid = valueOf("ttb-session-id");
  const daysofweek = selectedTimetableBuilderValues("ttb-session-day");
  const subjectid = valueOf("ttb-session-subject");
  const moduleid = valueOf("ttb-session-module");
  const groupassignments = Object.values(collectTimetableSessionGroupAssignments());

  if (!daysofweek.length) {
    showTimetableSessionMessage("Select at least one day.");
    return false;
  }

  if (!groupassignments.length) {
    showTimetableSessionMessage("Select at least one group.");
    return false;
  }

  if (!subjectid) {
    showTimetableSessionMessage("Select one subject.");
    return false;
  }

  const incompleteAssignment = groupassignments.find(assignment => !assignment.teacherid);
  if (incompleteAssignment) {
    showTimetableSessionMessage(`Select a teacher for group ${incompleteAssignment.groupno}.`);
    return false;
  }

  const teacherGroups = new Map();
  groupassignments.filter(assignment => assignment.groupno !== "ALL").forEach(assignment => {
    teacherGroups.set(assignment.teacherid, [...(teacherGroups.get(assignment.teacherid) || []), assignment.groupno]);
  });
  const repeatedTeacher = Array.from(teacherGroups.entries()).find(([, groups]) => groups.length > 1);
  if (repeatedTeacher) {
    showTimetableSessionMessage(`One teacher cannot teach groups ${repeatedTeacher[1].join(" and ")} at the same time. Select ALL if the groups are taught together.`);
    return false;
  }

  const payload = {
    sessionid,
    courseid: valueOf("ttb-session-course"),
    timeslotid: valueOf("ttb-session-slot"),
    ...(sessionid ? { dayofweek: daysofweek[0] } : { daysofweek }),
    subjectid,
    moduleid,
    groupassignments
  };
  button.disabled = true;
  showTimetableSessionMessage("Checking every day, group and teacher before saving…", "working");
  try {
    const result = await apiPost("/api/admin/timetable-builder/session/save", payload, state.token);
    if (!result.success) {
      showTimetableSessionMessage(result.error || "Unable to save session", "error", result.conflicts);
      return false;
    }
    applyTimetableSessionUpdates(result.sessions || (result.session ? [result.session] : []));
    if (result.changed !== false) markLocalTimetableDevelopment(payload.courseid);
    closeTimetableSessionEditor();
    renderTimetableBuilderGrid();
    setTimetableBuilderMessage(result.message || "Sessions saved.", "success");
    return true;
  } catch (error) {
    const message = error?.message || "Unable to save session.";
    showTimetableSessionMessage(message, "error");
    setTimetableBuilderMessage(message, "error");
    return false;
  } finally {
    button.disabled = false;
  }
}

async function deleteTimetableBuilderSession(button) {
  const sessionid = valueOf("ttb-session-id");
  const session = (timetableBuilderState.data.sessions || []).find(item => item.sessionid === sessionid);
  if (!session) return false;
  const stage = getSelectedTimetableState().stage;
  const hardDelete = stage === "DEVELOPMENT" && !session.everpublished;
  const summary = `${session.dayofweek} ${formatBuilderTime(session.starttime)}–${formatBuilderTime(session.endtime)}, group ${session.groupno}, ${session.subjectname || session.subjectid}${session.modulename ? ` / ${session.modulename}` : ""}, ${session.teachername || session.teacherid}`;
  const warning = hardDelete
    ? `Permanently delete this never-published draft session?\n\n${summary}\n\nThis cannot be undone.`
    : `Remove this session from the development timetable?\n\n${summary}\n\nThe published snapshot is preserved and the session can be restored.`;
  if (!window.confirm(warning)) return false;

  button.disabled = true;
  showTimetableSessionMessage(hardDelete ? "Permanently deleting draft session…" : "Removing session from the draft…", "working");
  try {
    const result = await apiPost("/api/admin/timetable-builder/session/delete", {
      sessionid,
      mode: hardDelete ? "HARD" : "SOFT"
    }, state.token);
    if (!result.success) throw new Error(result.error || "Unable to delete session");
    if (result.deletionmode === "HARD") {
      timetableBuilderState.data.sessions = (timetableBuilderState.data.sessions || [])
        .filter(item => item.sessionid !== sessionid);
    } else if (result.session) {
      applyTimetableSessionUpdates([result.session]);
    }
    if (result.changed !== false) markLocalTimetableDevelopment(session.courseid);
    closeTimetableSessionEditor();
    renderTimetableBuilderGrid();
    setTimetableBuilderMessage(result.message || "Session deleted.", "success");
    return true;
  } catch (error) {
    showTimetableSessionMessage(error?.message || "Unable to delete session.", "error");
    return false;
  } finally {
    button.disabled = false;
  }
}

async function restoreTimetableBuilderSession(button) {
  const sessionid = valueOf("ttb-session-id");
  button.disabled = true;
  showTimetableSessionMessage("Checking conflicts before restoring…", "working");
  try {
    const result = await apiPost("/api/admin/timetable-builder/session/restore", { sessionid }, state.token);
    if (!result.success) {
      showTimetableSessionMessage(result.error || "Unable to restore session", "error", result.conflicts);
      return false;
    }
    applyTimetableSessionUpdates(result.session ? [result.session] : []);
    if (result.changed !== false) {
      markLocalTimetableDevelopment(
        result.session?.courseid || timetableBuilderState.selectedCourseId
      );
    }
    closeTimetableSessionEditor();
    timetableBuilderState.showInactiveSessions = true;
    renderTimetableBuilderGrid();
    setTimetableBuilderMessage(result.message || "Session restored.", "success");
    return true;
  } catch (error) {
    showTimetableSessionMessage(error?.message || "Unable to restore session.", "error");
    return false;
  } finally {
    button.disabled = false;
  }
}

async function publishTimetableBuilder(button) {
  const courseid = timetableBuilderState.selectedCourseId;
  const course = (timetableBuilderState.data.courses || []).find(item => item.courseid === courseid);
  const activeCount = (timetableBuilderState.data.sessions || []).filter(session => session.courseid === courseid && session.active).length;
  const nextVersion = (getSelectedTimetableState().versionno || 0) + 1;
  if (!courseid || !activeCount) return setTimetableBuilderMessage("Add at least one active session before publishing.", "error");
  const publicationEffect = timetableBuilderState.data.liveSource === "PUBLISHED_TIMETABLE"
    ? "This creates an immutable snapshot and the new version will become live immediately for this program."
    : "This creates an immutable snapshot. TeacherAssign remains live until you review and explicitly activate the published source.";
  if (!window.confirm(`Publish ${course?.coursename || "this program"} timetable version ${nextVersion} with ${activeCount} active sessions?\n\n${publicationEffect}`)) return false;

  button.disabled = true;
  setTimetableBuilderMessage("Validating and publishing an immutable snapshot…", "");
  try {
    const result = await apiPost("/api/admin/timetable-builder/publish", { courseid }, state.token);
    if (!result.success) throw new Error(result.error || "Unable to publish timetable");
    if (result.publicationBecomesLive && typeof clearTimetableCache === "function") {
      clearTimetableCache();
    }
    timetableBuilderState.loaded = false;
    timetableBuilderState.integrationPreview = null;
    await loadTimetableBuilder(true);
    setTimetableBuilderMessage(result.message || "Timetable published.", "success");
    return true;
  } catch (error) {
    setTimetableBuilderMessage(error?.message || "Unable to publish timetable.", "error");
    return false;
  } finally {
    button.disabled = false;
  }
}

async function openTimetableIntegrationReview() {
  const courseid = timetableBuilderState.selectedCourseId;
  const dialog = document.getElementById("timetable-integration-dialog");
  if (!courseid || !dialog) return false;

  timetableBuilderState.integrationPreview = null;
  setTimetableIntegrationContent('<p class="helper-text">Validating the current publication and comparing TeacherAssign…</p>');
  clearTimetableIntegrationMessage();
  setTimetableIntegrationConfirmation(null);
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();

  try {
    const preview = await apiPost("/api/admin/timetable-builder/integration/preview", { courseid }, state.token);
    if (!preview.success) throw new Error(preview.error || "Unable to review timetable integration");
    timetableBuilderState.integrationPreview = preview;
    renderTimetableIntegrationPreview(preview);
    return true;
  } catch (error) {
    setTimetableIntegrationContent(`<section class="timetable-integration-blocker"><strong>Integration review could not be completed</strong><p>${ttbEscape(error?.message || "Unable to review timetable integration.")}</p></section>`);
    showTimetableIntegrationMessage(error?.message || "Unable to review timetable integration.", "error");
    return false;
  }
}

function renderTimetableIntegrationPreview(preview) {
  const publishedIsLive = preview.currentSource === "PUBLISHED_TIMETABLE";
  const publication = preview.publication;
  const comparison = preview.comparison || {};
  const publicationSummary = publication
    ? `Version ${publication.versionno} · ${publication.sessioncount} sessions${publication.publisheddate ? ` · ${formatBuilderDate(publication.publisheddate)}` : ""}`
    : "No valid current publication";
  const warnings = (preview.warnings || []).map(warning => `<li>${ttbEscape(warning)}</li>`).join("");
  const differences = comparison.invalidTeacherAssignHeaders ? "" : `
    <section class="timetable-integration-comparison">
      <h4>Source comparison</h4>
      <div class="timetable-integration-counts">
        <span><strong>${Number(comparison.matchingCount) || 0}</strong> matching</span>
        <span><strong>${Number(comparison.publishedOnlyCount) || 0}</strong> published only</span>
        <span><strong>${Number(comparison.teacherAssignOnlyCount) || 0}</strong> TeacherAssign only</span>
      </div>
      ${renderTimetableIntegrationDifferenceList("Only in published snapshot", comparison.publishedOnly, comparison.publishedOnlyCount)}
      ${renderTimetableIntegrationDifferenceList("Only in TeacherAssign", comparison.teacherAssignOnly, comparison.teacherAssignOnlyCount)}
    </section>`;

  setTimetableIntegrationContent(`
    <section class="timetable-integration-source-card">
      <span>Current live source</span>
      <strong>${publishedIsLive ? "Published Timetable" : "TeacherAssign"}</strong>
      <small>${publishedIsLive
        ? "Student, staff and Weekly Planner reads use the current published snapshot."
        : "Student, staff and Weekly Planner reads continue to use TeacherAssign."}</small>
    </section>
    <div class="timetable-integration-checks">
      <section class="timetable-integration-check ${preview.snapshotSchemaReady ? "is-ready" : "is-blocked"}"><span>Immutable columns O:T</span><strong>${preview.snapshotSchemaReady ? "Ready" : "Required"}</strong></section>
      <section class="timetable-integration-check ${preview.readyToActivate ? "is-ready" : "is-blocked"}"><span>Current publication</span><strong>${ttbEscape(publicationSummary)}</strong></section>
    </div>
    ${preview.blockingError ? `<section class="timetable-integration-blocker"><strong>Published source cannot be activated yet</strong><p>${ttbEscape(preview.blockingError)}</p></section>` : differences}
    ${warnings ? `<ul class="timetable-integration-warnings">${warnings}</ul>` : ""}
    <p class="timetable-integration-safety-note">Activation is program-local and reversible. After activation, an invalid snapshot fails closed and never silently falls back to TeacherAssign.</p>
  `);
  setTimetableIntegrationConfirmation(preview);
}

function renderTimetableIntegrationDifferenceList(title, sessions, total) {
  if (!Number(total)) return "";
  const values = Array.isArray(sessions) ? sessions : [];
  const rows = values.map(session => `<li><strong>${ttbEscape(session.dayofweek)} ${ttbEscape(session.starttime)}</strong><span>${ttbEscape(session.subjectname || session.subjectid)}${session.modulename ? ` · ${ttbEscape(session.modulename)}` : ""} · Group ${ttbEscape(session.groupno)} · ${ttbEscape(session.teachername || session.teacherid)}</span></li>`).join("");
  return `<details class="timetable-integration-differences"><summary>${ttbEscape(title)} (${Number(total) || 0})</summary><ul>${rows}</ul>${Number(total) > values.length ? "<small>Only the first 12 differences are shown.</small>" : ""}</details>`;
}

function setTimetableIntegrationConfirmation(preview) {
  const field = document.getElementById("ttb-integration-confirm-field");
  const label = document.getElementById("ttb-integration-confirm-label");
  const input = document.getElementById("ttb-integration-confirmation");
  const button = document.getElementById("ttb-save-integration-source");
  const publishedIsLive = preview?.currentSource === "PUBLISHED_TIMETABLE";
  const canChange = Boolean(preview && (publishedIsLive || preview.readyToActivate));
  if (field) field.hidden = !canChange;
  if (label) label.textContent = preview ? `Type ${preview.requiredConfirmation} exactly to confirm` : "Type the confirmation phrase exactly";
  if (input) {
    input.value = "";
    input.placeholder = preview?.requiredConfirmation || "";
    input.disabled = !canChange;
  }
  if (button) {
    button.textContent = publishedIsLive ? "Return to TeacherAssign" : "Activate Published Timetable";
    button.classList.toggle("timetable-builder-danger", publishedIsLive);
    button.classList.toggle("timetable-builder-primary", !publishedIsLive);
    button.disabled = true;
  }
}

function updateTimetableIntegrationControls() {
  const preview = timetableBuilderState.integrationPreview;
  const input = document.getElementById("ttb-integration-confirmation");
  const button = document.getElementById("ttb-save-integration-source");
  if (!preview || !input || !button) return false;
  const canChange = preview.currentSource === "PUBLISHED_TIMETABLE" || preview.readyToActivate;
  button.disabled = !canChange || input.value.trim() !== preview.requiredConfirmation;
  return !button.disabled;
}

async function saveTimetableIntegrationSource(button) {
  const preview = timetableBuilderState.integrationPreview;
  const input = document.getElementById("ttb-integration-confirmation");
  if (!preview || !input || button.disabled) return false;
  button.disabled = true;
  showTimetableIntegrationMessage("Saving the program live source and audit record…", "working");
  try {
    const result = await apiPost("/api/admin/timetable-builder/integration/source/save", {
      courseid: timetableBuilderState.selectedCourseId,
      source: preview.targetSource,
      publicationid: preview.publication?.publicationid || "",
      confirmation: input.value.trim()
    }, state.token);
    if (!result.success) throw new Error(result.error || "Unable to save the timetable live source");
    timetableBuilderState.loaded = false;
    closeTimetableIntegrationReview();
    await loadTimetableBuilder(true);
    if (typeof clearTimetableCache === "function") clearTimetableCache();
    setTimetableBuilderMessage(result.message || "Timetable live source saved.", "success");
    return true;
  } catch (error) {
    showTimetableIntegrationMessage(error?.message || "Unable to save the timetable live source.", "error");
    updateTimetableIntegrationControls();
    return false;
  }
}

function closeTimetableIntegrationReview() {
  const dialog = document.getElementById("timetable-integration-dialog");
  if (dialog?.open && typeof dialog.close === "function") dialog.close();
  timetableBuilderState.integrationPreview = null;
  return true;
}

function setTimetableIntegrationContent(html) {
  const element = document.getElementById("ttb-integration-content");
  if (element) element.innerHTML = html;
}

function showTimetableIntegrationMessage(message, type = "error") {
  const element = document.getElementById("ttb-integration-message");
  if (!element) return false;
  element.className = `timetable-session-message is-${ttbAttr(type)}`;
  element.innerHTML = `<strong>${ttbEscape(message)}</strong>`;
  return true;
}

function clearTimetableIntegrationMessage() {
  const element = document.getElementById("ttb-integration-message");
  if (!element) return false;
  element.className = "timetable-session-message";
  element.textContent = "";
  return true;
}

function applyTimetableSessionUpdates(updates) {
  const current = timetableBuilderState.data.sessions || [];
  const byId = new Map(current.map(session => [session.sessionid, session]));
  (Array.isArray(updates) ? updates : []).forEach(update => {
    if (!update?.sessionid) return;
    byId.set(update.sessionid, enrichTimetableBuilderSession(update, byId.get(update.sessionid)));
  });
  timetableBuilderState.data.sessions = Array.from(byId.values());
  return true;
}

function enrichTimetableBuilderSession(session, existing = {}) {
  const course = (timetableBuilderState.data.courses || []).find(item => item.courseid === session.courseid);
  const slot = (timetableBuilderState.data.timeslots || []).find(item => item.timeslotid === session.timeslotid);
  const subject = (timetableBuilderState.data.subjects || []).find(item => item.subjectid === session.subjectid);
  const module = session.moduleid
    ? (timetableBuilderState.data.modules || []).find(item => item.moduleid === session.moduleid)
    : null;
  const teacher = (timetableBuilderState.data.teachers || []).find(item => item.teacherid === session.teacherid);
  return {
    ...existing,
    ...session,
    coursename: course?.coursename || session.coursename || existing.coursename || session.courseid,
    starttime: slot?.starttime || session.starttime || existing.starttime || "",
    endtime: slot?.endtime || session.endtime || existing.endtime || "",
    subjectname: subject?.subjectname || session.subjectname || session.subjectid,
    modulename: session.moduleid
      ? module?.modulename || session.modulename || session.moduleid
      : "",
    teachername: teacher?.teachername || session.teachername || session.teacherid,
    everpublished: existing.everpublished === true || session.everpublished === true
  };
}

function markLocalTimetableDevelopment(courseId) {
  const states = timetableBuilderState.data.timetablestates || [];
  const existing = states.find(item => item.courseid === courseId);
  if (existing) existing.stage = "DEVELOPMENT";
  else states.push({
    courseid: courseId,
    stage: "DEVELOPMENT",
    currentpublicationid: "",
    versionno: 0,
    publisheddate: "",
    publishedbyadminname: ""
  });
  timetableBuilderState.data.timetablestates = states;
  renderTimetableBuilderStatus();
  return true;
}

function subjectNameFor(subjectId) {
  return (timetableBuilderState.data.subjects || []).find(subject => subject.subjectid === subjectId)?.subjectname || subjectId;
}

function formatBuilderTimeRange(slot) {
  return `${formatBuilderTime(slot?.starttime)}–${formatBuilderTime(slot?.endtime)}`;
}

function formatBuilderTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return String(value || "");
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function formatBuilderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function renderTimetableSessionChoices(containerId, name, values, selectedValues, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const selected = new Set((selectedValues || []).map(String));
  container.innerHTML = values.map(value => `
    <label class="timetable-builder-choice">
      <input type="${ttbAttr(type)}" name="${ttbAttr(name)}" value="${ttbAttr(value)}" ${selected.has(String(value)) ? "checked" : ""} />
      <span>${ttbEscape(value)}</span>
    </label>
  `).join("");
}

function selectedTimetableBuilderValues(name) {
  return Array.from(document.querySelectorAll(`input[name='${name}']:checked`)).map(input => input.value);
}

function enforceTimetableBuilderGroupSelection(changedInput) {
  if (changedInput.type !== "checkbox" || !changedInput.checked) return;
  const inputs = Array.from(document.querySelectorAll("input[name='ttb-session-group']"));
  if (changedInput.value === "ALL") {
    inputs.forEach(input => { if (input !== changedInput) input.checked = false; });
    return;
  }
  const allInput = inputs.find(input => input.value === "ALL");
  if (allInput) allInput.checked = false;
}

function showTimetableSessionMessage(message, type = "error", conflicts = []) {
  const element = document.getElementById("timetable-session-message");
  if (!element) return false;
  const conflictItems = Array.isArray(conflicts) ? conflicts.filter(item => item?.message) : [];
  const heading = conflictItems.length
    ? "The selected sessions could not be saved because of these timetable conflicts:"
    : (message || "Unable to save session.");
  element.className = `timetable-session-message is-${ttbAttr(type)}`;
  element.innerHTML = `
    <strong>${ttbEscape(heading)}</strong>
    ${conflictItems.length ? `<ul>${conflictItems.map(item => `<li>${ttbEscape(item.message)}</li>`).join("")}</ul>` : ""}
  `;
  return true;
}

function showTimetableBulkSessionMessage(message, type = "error", conflicts = []) {
  const element = document.getElementById("timetable-bulk-session-message");
  if (!element) return false;
  const conflictItems = Array.isArray(conflicts) ? conflicts.filter(item => item?.message) : [];
  const heading = conflictItems.length
    ? "No selected session was changed because of these timetable conflicts:"
    : (message || "Unable to update the selected sessions.");
  element.className = `timetable-session-message is-${ttbAttr(type)}`;
  element.innerHTML = `
    <strong>${ttbEscape(heading)}</strong>
    ${conflictItems.length ? `<ul>${conflictItems.map(item => `<li>${ttbEscape(item.message)}</li>`).join("")}</ul>` : ""}
  `;
  return true;
}

function clearTimetableSessionMessage() {
  const element = document.getElementById("timetable-session-message");
  if (!element) return false;
  element.className = "timetable-session-message";
  element.textContent = "";
  return true;
}

function clearTimetableBulkSessionMessage() {
  const element = document.getElementById("timetable-bulk-session-message");
  if (!element) return false;
  element.className = "timetable-session-message";
  element.textContent = "";
  return true;
}

function setSelectOptions(id, options, selectedValue) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = options.map(option => `<option value="${ttbAttr(option.value)}" ${String(option.value) === String(selectedValue) ? "selected" : ""}>${ttbEscape(option.label)}</option>`).join("");
}

function setTimetableBuilderContent(html) {
  const container = document.getElementById("timetable-builder-content");
  if (container) container.innerHTML = html;
}

function setTimetableBuilderMessage(message, type) {
  const element = document.getElementById("timetable-builder-message");
  if (!element) return false;
  element.textContent = message || "";
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
  return true;
}

function valueOf(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

function checkedOf(id) {
  return document.getElementById(id)?.checked === true;
}

function timetableBuilderApiError(result, fallbackMessage) {
  const error = new Error(result?.error || fallbackMessage || "Timetable Builder request failed");
  error.code = String(result?.code || "");
  error.retryable = result?.retryable === true;
  error.httpStatus = Number(result?.httpStatus) || 0;
  return error;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value || "";
}

function ttbEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ttbAttr(value) {
  return ttbEscape(value).replace(/`/g, "&#96;");
}

window.showTimetableBuilder = showTimetableBuilder;
window.M4LTimetableBuilder = {
  show: showTimetableBuilder,
  load: loadTimetableBuilder,
  render: renderTimetableBuilder,
  state: timetableBuilderState
};
