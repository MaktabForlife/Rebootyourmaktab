/* M4L v73.2 - Admin Progress Individual landing + isolated mobile matrix + V73.1.2 Class Progress baseline
   Load after /app.js, /js/m4l-auth.js, /js/m4l-shell.js, /js/m4l-timetable.js, and /js/m4l-resources.js.
   This is a classic script, not type=module, so existing global function calls remain safe
   while the app is split gradually.
   Owns student progress/tasks plus admin progress drilldown.
*/

/* =========================
   STUDENT TASK VIEW
========================= */

let studentSubjectTaskGroups = {};
let currentStudentSubjectKey = "";

let progressUiGlobalHandlersBound = false;

function bindProgressUiHandlers(containerOrId) {
  // Progress actions use one delegated handler so dynamically-rendered
  // student/admin progress rows do not need inline onclick strings.
  if (progressUiGlobalHandlersBound === true) {
    return !!getDomElement(containerOrId);
  }

  if (!document || typeof document.addEventListener !== "function") {
    return false;
  }

  progressUiGlobalHandlersBound = true;
  document.addEventListener("click", handleProgressUiClick);
  document.addEventListener("keydown", handleProgressUiKeydown);
  return !!getDomElement(containerOrId);
}

function getProgressActionElement(event) {
  const target = event && event.target;
  if (!target || typeof target.closest !== "function") return null;

  const actionEl = target.closest("[data-progress-action]");
  if (!actionEl) return null;

  const progressScope = actionEl.closest(
    "#progress-report, #admin-progress-dashboard, #admin-progress-student-popout, " +
    "#progress-subjects-screen, #progress-tasks-screen, #progress-task-students-screen, " +
    "#progress-subjects-list, #progress-tasks-list, #progress-task-students-list"
  );

  return progressScope ? actionEl : null;
}

function getProgressBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function handleProgressUiKeydown(event) {
  if (!event || (event.key !== "Enter" && event.key !== " ")) return;

  const actionEl = getProgressActionElement(event);
  if (!actionEl) return;

  event.preventDefault();
  actionEl.click();
}

function handleProgressUiClick(event) {
  const actionEl = getProgressActionElement(event);
  if (!actionEl || actionEl.disabled) return;

  event.preventDefault();
  event.stopPropagation();

  const action = actionEl.dataset.progressAction || "";

  switch (action) {
    case "open-student-subject-tasks":
      openStudentSubjectTasks(actionEl.dataset.subjectKey || "");
      break;

    case "scroll-student-progress-module":
      scrollStudentProgressSwipeToIndex(
        Number(actionEl.dataset.progressPanelIndex || 0)
      );
      break;

    case "save-student-progress":
      saveStudentProgressSwipeChanges(actionEl);
      break;

    case "toggle-student-subject-task":
      toggleStudentSubjectTask(
        actionEl.dataset.studenttaskid || "",
        getProgressBoolean(actionEl.dataset.complete)
      );
      break;

    case "toggle-student-task-inline-player":
      toggleStudentTaskInlinePlayer(
        actionEl.dataset.playerId || "",
        actionEl.dataset.link || "",
        actionEl.dataset.type || ""
      );
      break;

    case "open-student-task-external-link":
      openStudentTaskExternalLink(
        actionEl.dataset.link || "",
        actionEl.dataset.type || ""
      );
      break;

    case "open-progress-subject":
      openProgressSubject(
        actionEl.dataset.subjectid || "",
        actionEl.dataset.subjectname || ""
      );
      break;

    case "open-progress-task":
      openProgressTask(
        actionEl.dataset.taskid || "",
        actionEl.dataset.taskname || ""
      );
      break;

    case "open-admin-progress-task-card":
      openAdminProgressTaskCard(
        actionEl.dataset.subjectid || "",
        actionEl.dataset.subjectname || "",
        actionEl.dataset.taskid || "",
        actionEl.dataset.taskname || ""
      );
      break;

    case "set-admin-progress-view":
      setAdminProgressAigView(actionEl.dataset.progressView || "all");
      break;

    case "open-admin-progress-student-popout":
      openAdminProgressStudentPopout(
        actionEl.dataset.studentid || "",
        actionEl.dataset.username || "Student"
      );
      break;

    case "open-admin-individual-student":
      openAdminIndividualStudentDetail(
        actionEl.dataset.studentid || "",
        actionEl.dataset.username || "Student"
      );
      break;

    case "focus-individual-matrix-card":
      focusAdminIndividualMatrixCard(
        Number(actionEl.dataset.matrixModuleIndex || 0),
        Number(actionEl.dataset.matrixTaskIndex || 0)
      );
      break;

    case "scroll-admin-progress-group":
      scrollAdminProgressGroupToIndex(
        Number(actionEl.dataset.progressGroupIndex || 0)
      );
      break;

    case "scroll-admin-dashboard-task":
      scrollAdminProgressDashboardRailToIndex(
        actionEl,
        Number(actionEl.dataset.progressTaskIndex || 0)
      );
      break;

    case "scroll-admin-popout-module":
      scrollAdminProgressPopoutModuleToIndex(
        Number(actionEl.dataset.progressModuleIndex || 0)
      );
      break;

    case "close-admin-progress-task-screen":
      requestCloseAdminProgressTaskScreen();
      break;

    case "save-admin-progress-task":
      saveAdminProgressTaskChanges(actionEl);
      break;

    case "toggle-progress-pending-popout":
      toggleProgressPendingForAdminPopout(
        actionEl.dataset.studenttaskid || "",
        actionEl.dataset.field || "",
        getProgressBoolean(actionEl.dataset.value)
      );
      break;

    case "close-admin-progress-student-popout":
      requestCloseAdminProgressStudentPopout();
      break;

    case "save-admin-progress-popout":
      saveAdminProgressPopoutChanges(actionEl);
      break;

    case "toggle-progress-pending":
      toggleProgressPending(
        actionEl.dataset.studenttaskid || "",
        actionEl.dataset.field || "",
        getProgressBoolean(actionEl.dataset.value)
      );
      break;

    default:
      console.warn("Unknown progress action:", action);
      break;
  }
}



async function showStudentTasks() {
  setProgressScreensForStudent();
  setManualRefreshButton("progress-subjects-screen", "refreshStudentTaskProgress(this)");

  if (!showScreen("progress-subjects-screen")) {
    console.warn("Student progress screen is missing.");
    return;
  }

  setDomText("progress-subjects-title", "Progress");

  if (!setDomHtml("progress-subjects-list", `<p class="helper-text">Loading tasks...</p>`)) {
    console.warn("Missing progress-subjects-list container.");
    return;
  }

  try {
    const result = await apiPost("/api/tasks/student", {
      subjectid: "ALL"
    }, state.token);

    if (!result.success) {
      setDomHtml("progress-subjects-list", `<p class="error-message">${escapeHtml(result.error || "Failed to load tasks")}</p>`);
      return;
    }

    if (!result.tasks || result.tasks.length === 0) {
      setDomHtml("progress-subjects-list", `<p class="helper-text">No tasks assigned yet.</p>`);
      return;
    }

    const normalizedTasks = result.tasks.map(normalizeStudentTask);
    studentSubjectTaskGroups = buildStudentSubjectTaskGroups(normalizedTasks);
    renderStudentSubjectProgress();
  } catch (err) {
    console.error("Could not load student tasks:", err);
    setDomHtml("progress-subjects-list", `<p class="error-message">${escapeHtml(err.message || "Failed to load tasks")}</p>`);
  }
}

function setProgressScreensForStudent() {
  ["progress-subjects-screen", "progress-tasks-screen"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("admin-theme");
    screen.classList.add("student-theme");
  });

  const subjectBackButton = document.querySelector("#progress-subjects-screen .nav-header .small-btn:not(.student-progress-save-btn)");
  if (subjectBackButton) {
    // The V70 student progress landing page has its own frozen module header.
    // The legacy app-screen header is kept in the HTML for compatibility but hidden by CSS.
    subjectBackButton.classList.remove("home-icon-btn", "back-icon-btn", "icon-action-btn", "icon-action-btn-large", "save-return-btn", "student-progress-save-btn");
    subjectBackButton.removeAttribute("data-header-action");
    subjectBackButton.removeAttribute("data-header-target");
    subjectBackButton.setAttribute("onclick", "showScreen('student-home')");
    subjectBackButton.textContent = "Back";
  }

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn:not(.student-progress-save-btn)");
  if (taskBackButton) {
    taskBackButton.classList.remove("save-return-btn", "student-progress-save-btn");
    setBackIconButton(taskBackButton, "showScreen('progress-subjects-screen')");
  }

  ensureStudentProgressSaveButton();
}


function ensureStudentProgressSaveButton() {
  // V70 renders the student Progress Save button inside the frozen module header.
  // Remove any legacy save button that may have been injected into the old nav-header.
  document.querySelectorAll("#progress-subjects-screen .nav-header .student-progress-save-btn").forEach(button => button.remove());
}


function setProgressScreensForAdmin() {
  document
    .querySelectorAll("#progress-subjects-screen .student-progress-save-btn, #progress-tasks-screen .student-progress-save-btn")
    .forEach(button => button.remove());

  ["progress-subjects-screen", "progress-tasks-screen", "progress-task-students-screen"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("student-theme");
    screen.classList.add("admin-theme");
  });

  const subjectBackButton = document.querySelector("#progress-subjects-screen .small-btn");
  setAdminProgressCloseButton(subjectBackButton, "showScreen('progress-report')");

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn");
  setAdminProgressCloseButton(taskBackButton, "showScreen('progress-subjects-screen')");

  prepareAdminProgressTaskHeader();
}

function setAdminProgressCloseButton(button, fallbackOnclick) {
  if (!button) return false;
  button.classList.remove("home-icon-btn", "back-icon-btn", "icon-action-btn", "icon-action-btn-large", "save-return-btn", "student-progress-save-btn", "admin-progress-save-button");
  button.classList.add("admin-progress-close-btn");
  button.type = "button";
  button.textContent = "×";
  button.setAttribute("aria-label", "Close");
  button.setAttribute("title", "Close");
  button.removeAttribute("data-header-action");
  button.removeAttribute("data-header-target");
  if (fallbackOnclick) {
    button.setAttribute("onclick", fallbackOnclick);
  }
  return true;
}

function prepareAdminProgressTaskHeader() {
  const detailScreen = document.getElementById("progress-task-students-screen");
  ensureAdminProgressAigSelector(detailScreen, adminProgressActiveView || "all");

  const header = document.querySelector("#progress-task-students-screen .nav-header");
  if (!header) return false;

  header.classList.add("admin-progress-detail-header", "admin-progress-sticky-detail-header");

  const title = header.querySelector("#progress-task-students-title");
  if (!title) return false;

  header.querySelectorAll("button").forEach(button => {
    if (button.dataset.progressAction !== "close-admin-progress-task-screen") {
      button.remove();
    }
  });

  let closeButton = header.querySelector('[data-progress-action="close-admin-progress-task-screen"]');
  if (!closeButton) {
    closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.dataset.progressAction = "close-admin-progress-task-screen";
    header.insertBefore(closeButton, title);
  }

  closeButton.className = "small-btn admin-progress-close-btn";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Close progress detail");
  closeButton.setAttribute("title", "Close");
  closeButton.removeAttribute("onclick");

  if (header.firstElementChild !== closeButton) {
    header.insertBefore(closeButton, header.firstElementChild);
  }
  if (closeButton.nextElementSibling !== title) {
    header.insertBefore(title, closeButton.nextSibling);
  }

  return true;
}

function getStudentTaskField(task, names, fallback = "") {
  for (const name of names) {
    if (task && task[name] !== undefined && task[name] !== null && String(task[name]).trim() !== "") {
      return task[name];
    }
  }
  return fallback;
}

function normalizeStudentTask(task) {
  return {
    ...task,
    studenttaskid: getStudentTaskField(task, ["studenttaskid", "studentTaskId", "StudentTaskID", "StudentTaskId"]),
    taskid: getStudentTaskField(task, ["taskid", "taskID", "TaskID", "TaskId"]),
    taskname: getStudentTaskField(task, ["taskname", "taskName", "TaskName", "Task"], "Untitled Task"),
    subjectid: getStudentTaskField(task, ["subjectid", "subjectID", "SubjectID", "SubjectId"]),
    subjectname: getStudentTaskField(task, ["subjectname", "subjectName", "SubjectName", "Subject"], "Other"),
    moduleid: getStudentTaskField(task, ["moduleid", "moduleID", "ModuleID", "ModuleId"]),
    modulename: getStudentTaskField(task, ["modulename", "moduleName", "ModuleName", "Module"]),
    completestatus: getStudentTaskField(task, ["completestatus", "completeStatus", "CompleteStatus", "Complete", "Completed"]),
    verifystatus: getStudentTaskField(task, ["verifystatus", "verifyStatus", "VerifyStatus", "Verified"]),
    audiolink: getStudentTaskField(task, ["audiolink", "audioLink", "AudioLink", "Audio"]),
    graphiclink: getStudentTaskField(task, ["graphiclink", "graphicLink", "GraphicLink", "GraphicsLink", "ImageLink", "visuallink", "visualLink", "VisualLink"]),
    videolink: getStudentTaskField(task, ["videolink", "videoLink", "VideoLink", "Video"]),
    pdflink: getStudentTaskField(task, ["pdflink", "pdfLink", "PDFLink", "PdfLink", "PDF"])
  };
}

function buildStudentSubjectTaskGroups(tasks) {
  const groups = {};

  [...tasks].sort(sortByModuleThenTask).forEach(task => {
    const moduleName = task.modulename || "General";
    const moduleKey = task.moduleid || moduleName;

    if (!groups[moduleKey]) {
      groups[moduleKey] = {
        subjectid: moduleKey,
        subjectname: moduleName,
        tasks: []
      };
    }

    groups[moduleKey].tasks.push(task);
  });

  return groups;
}

function getStudentProgressModules() {
  return Object.values(studentSubjectTaskGroups || {}).sort(sortModuleGroupsByModuleId);
}

function getStudentProgressSwipeTrack() {
  return document.querySelector("#progress-subjects-screen [data-progress-swipe-track]");
}

function getStudentProgressSwipePanels(track) {
  const targetTrack = track || getStudentProgressSwipeTrack();

  if (!targetTrack || !targetTrack.children) {
    return [];
  }

  return Array.from(targetTrack.children).filter(child => {
    return child &&
      child.matches &&
      child.matches("[data-progress-swipe-panel], .student-progress-module-panel");
  });
}

function getStudentProgressSwipePanelStep(track) {
  const targetTrack = track || getStudentProgressSwipeTrack();
  const panels = getStudentProgressSwipePanels(targetTrack);

  if (!targetTrack || panels.length <= 1) {
    return 1;
  }

  const firstPanel = panels[0];
  const secondPanel = panels[1];

  if (firstPanel && secondPanel) {
    const firstRect = firstPanel.getBoundingClientRect();
    const secondRect = secondPanel.getBoundingClientRect();
    const measuredStep = Math.abs(secondRect.left - firstRect.left);

    if (measuredStep > 1) {
      return measuredStep;
    }
  }

  return targetTrack.clientWidth || 1;
}

function getStudentProgressSwipeActiveIndex(track) {
  const targetTrack = track || getStudentProgressSwipeTrack();

  if (!targetTrack) {
    return 0;
  }

  const panels = getStudentProgressSwipePanels(targetTrack);
  const panelCount = panels.length;

  if (panelCount <= 1) {
    return 0;
  }

  // Desktop/grid layout has no meaningful horizontal scroll.
  if ((targetTrack.scrollWidth || 0) <= (targetTrack.clientWidth || 0) + 2) {
    return 0;
  }

  const step = getStudentProgressSwipePanelStep(targetTrack);
  const index = Math.round((targetTrack.scrollLeft || 0) / step);

  return Math.max(0, Math.min(panelCount - 1, index));
}

function getStudentProgressSwipeActiveModuleKey() {
  const track = getStudentProgressSwipeTrack();
  const panels = getStudentProgressSwipePanels(track);
  const activeIndex = getStudentProgressSwipeActiveIndex(track);
  const activePanel = panels[activeIndex];

  return activePanel ? String(activePanel.dataset.progressModuleKey || "") : "";
}

function updateStudentProgressSwipeDots() {
  const screen = document.getElementById("progress-subjects-screen");
  const track = getStudentProgressSwipeTrack();

  if (!screen || !track) {
    return false;
  }

  const dots = Array.from(screen.querySelectorAll("[data-progress-swipe-dots] [data-progress-panel-index]"));
  if (!dots.length) {
    return false;
  }

  const activeIndex = getStudentProgressSwipeActiveIndex(track);
  const panels = getStudentProgressSwipePanels(track);
  const activePanel = panels[activeIndex];

  if (activePanel) {
    currentStudentSubjectKey = String(activePanel.dataset.progressModuleKey || currentStudentSubjectKey || "");
  }

  dots.forEach((dot, fallbackIndex) => {
    const dotIndex = Number(dot.dataset.progressPanelIndex || fallbackIndex || 0);
    const isActive = dotIndex === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });

  updateStudentProgressFrozenHeader();
  updateStudentProgressTaskScrollState();

  return true;
}

function scrollStudentProgressSwipeToIndex(panelIndex, options = {}) {
  const track = getStudentProgressSwipeTrack();
  const panels = getStudentProgressSwipePanels(track);
  const index = Number(panelIndex || 0);

  if (!track || !panels[index]) {
    return false;
  }

  const behavior = options.behavior || "smooth";

  panels[index].scrollIntoView({
    behavior,
    block: "nearest",
    inline: "start"
  });

  currentStudentSubjectKey = String(panels[index].dataset.progressModuleKey || currentStudentSubjectKey || "");
  updateStudentProgressSwipeDots();

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(updateStudentProgressSwipeDots);
  } else {
    window.setTimeout(updateStudentProgressSwipeDots, 0);
  }

  return true;
}

function scrollStudentProgressSwipeToModule(moduleKey, options = {}) {
  const track = getStudentProgressSwipeTrack();
  const panels = getStudentProgressSwipePanels(track);

  if (!track || !panels.length) {
    return false;
  }

  const key = String(moduleKey || "");
  const index = Math.max(0, panels.findIndex(panel => {
    return String(panel.dataset.progressModuleKey || "") === key;
  }));

  return scrollStudentProgressSwipeToIndex(index, options);
}

let studentProgressSwipeResizeHandlerBound = false;

function bindStudentProgressSwipeResizeHandler() {
  if (studentProgressSwipeResizeHandlerBound === true) {
    return true;
  }

  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return false;
  }

  studentProgressSwipeResizeHandlerBound = true;
  window.addEventListener("resize", () => {
    updateStudentProgressSwipeDots();
    updateStudentProgressTaskScrollState();
  }, { passive: true });
  return true;
}

function bindStudentProgressSwipeControls() {
  const track = getStudentProgressSwipeTrack();

  if (!track) {
    return false;
  }

  bindStudentProgressSwipeResizeHandler();

  if (track.dataset.progressSwipeBound !== "true") {
    track.dataset.progressSwipeBound = "true";
    let pendingFrame = 0;

    track.addEventListener("scroll", () => {
      if (pendingFrame) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        updateStudentProgressSwipeDots();
      });
    }, { passive: true });
  }

  window.setTimeout(updateStudentProgressSwipeDots, 0);
  return true;
}

function getStudentModuleProgressSummary(module) {
  const tasks = module && Array.isArray(module.tasks) ? module.tasks : [];
  const total = tasks.length;
  const completed = tasks.filter(task => isStatusOn(task.completestatus)).length;
  const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    total,
    completed,
    percentComplete: Math.max(0, Math.min(100, percentComplete))
  };
}

function getStudentProgressModuleByKey(modules, moduleKey) {
  const list = Array.isArray(modules) ? modules : getStudentProgressModules();
  const key = String(moduleKey || "");

  if (!list.length) {
    return null;
  }

  return list.find(module => String(module.subjectid || "") === key) || list[0];
}

function renderStudentProgressHeaderBar(percentComplete, options = {}) {
  const width = Math.max(0, Math.min(100, Number(percentComplete) || 0));
  const moduleKey = options.moduleKey !== undefined
    ? ` data-progress-module-fill="${escapeForAttribute(options.moduleKey)}"`
    : "";

  return `
    <div class="student-progress-status-bar" aria-label="Module progress">
      <span class="student-progress-status-track">
        <span class="student-progress-status-fill"${moduleKey} style="width:${width}%"></span>
      </span>
    </div>
  `;
}

function renderStudentProgressGlobalActions(modules, activeModuleKey) {
  return `
    <div class="student-progress-global-actions" data-progress-global-actions>
      <div class="student-progress-global-save-row">
        <button
          type="button"
          class="student-progress-save-btn"
          data-progress-action="save-student-progress"
          aria-label="Save all student progress changes"
        >Save</button>
      </div>
      ${renderStudentProgressSwipeDots(modules, activeModuleKey)}
    </div>
  `;
}

/* Compatibility wrapper retained for older calls. The V70.2 layout no longer
   uses a global frozen module heading/progress bar; each module panel owns its
   own heading and progress indicator. */
function renderStudentProgressFrozenHeader(modules, activeModuleKey) {
  return renderStudentProgressGlobalActions(modules, activeModuleKey);
}

function updateStudentProgressModuleIndicators(moduleKey) {
  const modules = getStudentProgressModules();
  const targetModules = moduleKey
    ? modules.filter(module => String(module.subjectid || "") === String(moduleKey || ""))
    : modules;

  targetModules.forEach(module => {
    const key = String(module.subjectid || "");
    const summary = getStudentModuleProgressSummary(module);

    document
      .querySelectorAll("#progress-subjects-screen [data-progress-module-fill]")
      .forEach(fill => {
        if (String(fill.dataset.progressModuleFill || "") === key) {
          fill.style.width = `${summary.percentComplete}%`;
        }
      });
  });

  return true;
}

function updateStudentProgressFrozenHeader() {
  const track = getStudentProgressSwipeTrack();
  const modules = getStudentProgressModules();

  if (!track || !modules.length) {
    return false;
  }

  const activeIndex = getStudentProgressSwipeActiveIndex(track);
  const panels = getStudentProgressSwipePanels(track);
  const activePanel = panels[activeIndex];
  const activeModuleKey = activePanel ? String(activePanel.dataset.progressModuleKey || "") : String(modules[0].subjectid || "");
  const activeModule = getStudentProgressModuleByKey(modules, activeModuleKey);

  if (!activeModule) {
    return false;
  }

  currentStudentSubjectKey = String(activeModule.subjectid || activeModuleKey || currentStudentSubjectKey || "");
  setDomText("progress-subjects-title", activeModule.subjectname || "Progress");
  updateStudentProgressModuleIndicators();

  return true;
}

function updateStudentProgressTaskScrollState() {
  document.querySelectorAll("#progress-subjects-screen .student-progress-task-scroll").forEach(container => {
    const hasVerticalScroll = (container.scrollHeight || 0) > (container.clientHeight || 0) + 3;
    container.classList.toggle("has-vertical-scroll", hasVerticalScroll);
  });

  return true;
}

function renderStudentProgressSwipeDots(modules, activeModuleKey) {
  if (!modules || modules.length <= 1) {
    return "";
  }

  const activeKey = String(activeModuleKey || modules[0].subjectid || "");

  return `
    <div class="student-progress-swipe-dots" data-progress-swipe-dots aria-label="Progress modules">
      ${modules.map((module, index) => {
        const moduleKey = String(module.subjectid || "");
        const isActive = moduleKey === activeKey || (!activeKey && index === 0);

        return `
          <button
            type="button"
            class="student-progress-swipe-dot${isActive ? " is-active" : ""}"
            data-progress-action="scroll-student-progress-module"
            data-progress-panel-index="${index}"
            aria-label="Show ${escapeForAttribute(module.subjectname || `module ${index + 1}`)}"
            aria-current="${isActive ? "true" : "false"}"
          ></button>
        `;
      }).join("")}
    </div>
  `;
}

function renderStudentProgressTaskTableHeader() {
  return `
    <div class="student-progress-task-row student-progress-task-heading-row" role="row">
      <div class="student-progress-task-cell student-progress-task-name-heading" role="columnheader" aria-label="Task"></div>
      <div class="student-progress-task-cell student-progress-status-heading" role="columnheader">Me</div>
      <div class="student-progress-task-cell student-progress-status-heading student-progress-status-heading--muted" role="columnheader">Muallimah</div>
    </div>
  `;
}

function renderStudentProgressTaskTableRow(task) {
  const pending = progressPendingUpdates[task.studenttaskid] || {};

  const completeStatus = pending.completeStatus !== undefined
    ? pending.completeStatus
    : task.completestatus;

  const isComplete = isStatusOn(completeStatus);
  const isVerified = isStatusOn(task.verifystatus);

  let fullAudioPlayerHtml = "";
  if (task.audiolink) {
    fullAudioPlayerHtml = `
      <div class="student-progress-task-media-block">
        <audio class="resource-audio-control" controls controlsList="nodownload" preload="none">
          <source src="${escapeForAttribute(task.audiolink)}" />
          Your browser cannot play this audio file.
        </audio>
      </div>
    `;
  }

  return `
    <div class="student-progress-task-row" role="row">
      <div class="student-progress-task-cell student-progress-task-name" role="cell">
        <div>${escapeHtml(task.taskname)}</div>
        ${fullAudioPlayerHtml}
        ${renderStudentTaskLinkButtons(task)}
      </div>

      <div class="student-progress-task-cell student-progress-status-cell" role="cell">
        <button
          type="button"
          class="student-progress-status-control student-progress-status-control--complete${isComplete ? " is-on" : ""}"
          data-progress-action="toggle-student-subject-task"
          data-studenttaskid="${escapeForAttribute(task.studenttaskid)}"
          data-complete="${isComplete ? "false" : "true"}"
          aria-label="${isComplete ? "Mark incomplete" : "Mark complete"}: ${escapeForAttribute(task.taskname)}"
        >
          ${renderTaskStatusIndicator("complete", isComplete)}
        </button>
      </div>

      <div class="student-progress-task-cell student-progress-status-cell" role="cell">
        <span class="student-progress-status-control student-progress-status-control--verify${isVerified ? " is-on" : ""}" aria-label="${isVerified ? "Verified by Muallimah" : "To be verified by Muallimah"}">
          ${renderTaskStatusIndicator("verify", isVerified, { muted: true })}
        </span>
      </div>
    </div>
  `;
}

function renderStudentProgressTaskTable(module) {
  const taskRowsHtml = [...module.tasks]
    .sort(sortByModuleThenTask)
    .map(task => renderStudentProgressTaskTableRow(task))
    .join("");

  return `
    <div class="student-progress-task-scroll" data-progress-task-scroll>
      <div class="student-progress-task-table" role="table" aria-label="${escapeForAttribute(module.subjectname || "Module")} progress tasks">
        ${renderStudentProgressTaskTableHeader()}
        ${taskRowsHtml}
      </div>
    </div>
  `;
}

function renderStudentProgressModulePanel(module, index, moduleCount) {
  const moduleKey = String(module.subjectid || "");
  const title = module.subjectname || `Module ${index + 1}`;
  const summary = getStudentModuleProgressSummary(module);

  return `
    <section
      class="student-progress-module-panel"
      data-progress-swipe-panel
      data-progress-panel-index="${index}"
      data-progress-module-key="${escapeForAttribute(moduleKey)}"
      aria-label="${escapeForAttribute(title)}"
    >
      <div class="student-progress-module-header">
        <h2 class="student-progress-module-title">${escapeHtml(title)}</h2>
        ${renderStudentProgressHeaderBar(summary.percentComplete, { moduleKey })}
      </div>
      ${renderStudentProgressTaskTable(module)}
    </section>
  `;
}

function renderStudentSubjectProgress(options = {}) {
  const container = getDomElement("progress-subjects-list");
  if (!container) {
    console.warn("Missing progress-subjects-list container.");
    return;
  }

  const modules = getStudentProgressModules();

  if (modules.length === 0) {
    setDomHtml(container, `<p class="helper-text">No tasks assigned yet.</p>`);
    return;
  }

  const preferredModuleKey = String(
    options.moduleKey ||
    getStudentProgressSwipeActiveModuleKey() ||
    currentStudentSubjectKey ||
    modules[0].subjectid ||
    ""
  );

  if (!currentStudentSubjectKey) {
    currentStudentSubjectKey = preferredModuleKey;
  }

  setDomHtml(container, `
    <div class="student-progress-swipe-shell" data-progress-swipe="progress-subjects-screen">
      ${renderStudentProgressGlobalActions(modules, preferredModuleKey)}
      <div
        id="student-progress-swipe-track"
        class="student-progress-swipe-track"
        data-progress-swipe-track
        aria-label="Student progress modules"
      >
        ${modules.map((module, index) => renderStudentProgressModulePanel(module, index, modules.length)).join("")}
      </div>
    </div>
  `);

  bindProgressUiHandlers(container);
  bindStudentProgressSwipeControls();
  updateStudentProgressFrozenHeader();
  window.setTimeout(updateStudentProgressTaskScrollState, 0);

  if (preferredModuleKey && preferredModuleKey !== String(modules[0].subjectid || "")) {
    scrollStudentProgressSwipeToModule(preferredModuleKey, {
      behavior: options.scrollBehavior || "auto"
    });
  } else {
    updateStudentProgressSwipeDots();
  }
}


function openStudentSubjectTasks(subjectKey) {
  setProgressScreensForStudent();
  setManualRefreshButton("progress-tasks-screen", "refreshStudentModuleTaskList(this)");

  const subject = studentSubjectTaskGroups ? studentSubjectTaskGroups[subjectKey] : null;

  if (!subject) {
    alert("Subject not found. Please reload your tasks.");
    return;
  }

  currentStudentSubjectKey = subjectKey;
  setDomText("progress-tasks-title", subject.subjectname);

  if (!showScreen("progress-tasks-screen")) {
    console.warn("Progress tasks screen is missing.");
    return;
  }

  renderStudentSubjectTaskList();
}


function renderTaskStatusHeader(firstLabel, secondLabel, options = {}) {
  const firstMutedClass = options.firstMuted ? " is-muted-status" : "";
  const secondMutedClass = options.secondMuted ? " is-muted-status" : "";

  return `
    <div class="student-status-row task-status-heading-row">
      <div class="student-status-name task-status-heading-name"></div>
      <div class="status-action task-status-heading${firstMutedClass}">${escapeHtml(firstLabel)}</div>
      <div class="status-action task-status-heading${secondMutedClass}">${escapeHtml(secondLabel)}</div>
    </div>
  `;
}

function renderTaskStatusIndicator(type, isOn, options = {}) {
  const normalizedType = type === "verify" ? "verify" : "complete";
  const onClass = normalizedType === "verify" ? "status-tick-verified" : "status-tick-complete";
  const offLabel = normalizedType === "verify" ? "To be verified" : "To be completed";
  const onLabel = normalizedType === "verify" ? "Verified" : "Completed";

  if (isOn) {
    return `
      <span class="status-tick ${onClass}" aria-hidden="true">✓</span>
      <span class="visually-hidden">${onLabel}</span>
    `;
  }

  const mutedClass = options.muted ? " task-status-icon--muted" : "";

  return `
    <span class="task-status-icon task-status-icon--${normalizedType}${mutedClass}" aria-hidden="true"></span>
    <span class="visually-hidden">${offLabel}</span>
  `;
}

function renderStudentSubjectTaskList() {
  const container = getDomElement("progress-tasks-list");
  if (!container) {
    console.warn("Missing progress-tasks-list container.");
    return;
  }

  const subject = studentSubjectTaskGroups ? studentSubjectTaskGroups[currentStudentSubjectKey] : null;

  if (!subject || subject.tasks.length === 0) {
    setDomHtml(container, `<p class="helper-text">No tasks found for this module.</p>`);
    return;
  }

  const taskRowsHtml = [...subject.tasks]
    .sort(sortByModuleThenTask)
    .map(task => renderStudentTaskStatusRow(task))
    .join("");

  setDomHtml(container, `
    ${renderTaskStatusHeader("Me", "Muallimah", { secondMuted: true })}
    ${taskRowsHtml}
  `);
  bindProgressUiHandlers(container);
}

function buildStudentModuleTaskGroups(tasks) {
  const groups = {};

  [...tasks].sort(sortByModuleThenTask).forEach(task => {
    const moduleName = task.modulename || "General";
    const moduleKey = task.moduleid || moduleName;

    if (!groups[moduleKey]) {
      groups[moduleKey] = {
        moduleid: task.moduleid || moduleKey,
        modulename: moduleName,
        tasks: []
      };
    }

    groups[moduleKey].tasks.push(task);
  });

  return Object.values(groups).sort(sortModuleGroupsByModuleId);
}

function renderStudentTaskStatusRow(task) {
  const pending = progressPendingUpdates[task.studenttaskid] || {};

  const completeStatus = pending.completeStatus !== undefined
    ? pending.completeStatus
    : task.completestatus;

  const isComplete = isStatusOn(completeStatus);
  const isVerified = isStatusOn(task.verifystatus);

  // 1. Build the standalone audio player if an audio link exists
  let fullAudioPlayerHtml = "";
  if (task.audiolink) {
    fullAudioPlayerHtml = `
      <div style="margin-top: 10px; margin-bottom: 10px;">
        <audio class="resource-audio-control" controls controlsList="nodownload" preload="none" style="width: 100%; max-width: 300px;">
          <source src="${escapeForAttribute(task.audiolink)}" />
          Your browser cannot play this audio file.
        </audio>
      </div>
    `;
  }

  // 2. Inject the player into the layout under the task name
  return `
    <div class="student-status-row">
      <div class="student-status-name">
        <div>${escapeHtml(task.taskname)}</div>
        ${fullAudioPlayerHtml}
        ${renderStudentTaskLinkButtons(task)}
      </div>

      <div
        class="status-action task-status-control"
        role="button"
        tabindex="0"
        data-progress-action="toggle-student-subject-task"
        data-studenttaskid="${escapeForAttribute(task.studenttaskid)}"
        data-complete="${isComplete ? "false" : "true"}"
      >
        ${renderTaskStatusIndicator("complete", isComplete)}
      </div>

      <div class="status-action task-status-control is-view-only" aria-label="${isVerified ? "Verified by Muallimah" : "To be verified by Muallimah"}">
        ${renderTaskStatusIndicator("verify", isVerified, { muted: !isVerified })}
      </div>
    </div>
  `;
}

function renderStudentTaskLinkButtons(task) {
  const links = [];

  // Note: The audio block has been completely removed from here
  // so it no longer generates the small inline "▶" button.

  if (task.graphiclink) {
    links.push({
      type: "GRAPHIC",
      label: "▧",
      title: "Open Graphic",
      link: task.graphiclink,
      inline: false
    });
  }

  if (task.videolink) {
    links.push({
      type: "VIDEO",
      label: "▶",
      title: "Play Video",
      link: task.videolink,
      inline: true
    });
  }

  if (task.pdflink) {
    links.push({
      type: "PDF",
      label: "PDF",
      title: "Open PDF",
      link: task.pdflink,
      inline: false
    });
  }

  if (links.length === 0) {
    return "";
  }

  const safeTaskId = safeDomId(task.studenttaskid || task.taskid || task.taskname);
  const buttonsHtml = links.map((item, index) => {
    const playerId = `student-task-player-${safeTaskId}-${index}`;

    if (item.inline) {
      return `
        <button
          type="button"
          class="student-task-link-btn"
          title="${escapeHtml(item.title)}"
          data-progress-action="toggle-student-task-inline-player"
          data-player-id="${escapeForAttribute(playerId)}"
          data-link="${escapeForAttribute(item.link)}"
          data-type="${escapeForAttribute(item.type)}"
        >${escapeHtml(item.label)}</button>
        <div id="${escapeHtml(playerId)}" class="student-task-inline-player hidden"></div>
      `;
    }

    return `
      <button
        type="button"
        class="student-task-link-btn"
        title="${escapeHtml(item.title)}"
        data-progress-action="open-student-task-external-link"
        data-link="${escapeForAttribute(item.link)}"
        data-type="${escapeForAttribute(item.type)}"
      >${escapeHtml(item.label)}</button>
    `;
  }).join("");

  return `<div class="student-task-link-row">${buttonsHtml}</div>`;
}


function toggleStudentTaskInlinePlayer(playerId, link, type) {
  if (!link) return;

  const player = document.getElementById(playerId);
  if (!player) return;

  const isHidden = player.classList.contains("hidden");

  document.querySelectorAll(".student-task-inline-player").forEach(item => {
    if (item.id !== playerId) {
      item.classList.add("hidden");
      item.innerHTML = "";
    }
  });

  if (!isHidden) {
    player.classList.add("hidden");
    player.innerHTML = "";
    return;
  }

  const resourceType = String(type || "").toUpperCase();

  if (resourceType === "VIDEO") {
    player.innerHTML = `
      <video class="student-task-media-control" controls controlsList="nodownload" preload="metadata">
        <source src="${escapeForAttribute(link)}" />
        Your browser cannot play this video file.
      </video>
    `;
  } else {
    player.innerHTML = `
      <audio class="student-task-media-control" controls controlsList="nodownload" preload="none">
        <source src="${escapeForAttribute(link)}" />
        Your browser cannot play this audio file.
      </audio>
    `;
  }

  player.classList.remove("hidden");
}

function openStudentTaskExternalLink(link, type) {
  if (!link) return;

  const resourceType = String(type || "").toUpperCase();

  if (resourceType === "PDF" || isPdfLink(link)) {
    openPdfResource(link);
    return;
  }

  window.open(link, "_blank", "noopener,noreferrer");
}



function updateStudentProgressStatusControls(studenttaskid, complete) {
  const id = String(studenttaskid || "");
  const isComplete = !!complete;

  if (!id) {
    return false;
  }

  let didUpdate = false;

  document
    .querySelectorAll("#progress-subjects-screen [data-progress-action='toggle-student-subject-task']")
    .forEach(button => {
      if (String(button.dataset.studenttaskid || "") !== id) {
        return;
      }

      const taskName = button.getAttribute("aria-label")
        ? String(button.getAttribute("aria-label")).replace(/^Mark (complete|incomplete):\s*/i, "")
        : "task";

      button.dataset.complete = isComplete ? "false" : "true";
      button.classList.toggle("is-on", isComplete);
      button.setAttribute("aria-label", `${isComplete ? "Mark incomplete" : "Mark complete"}: ${taskName}`);
      button.innerHTML = renderTaskStatusIndicator("complete", isComplete);
      didUpdate = true;
    });

  return didUpdate;
}

function toggleStudentSubjectTask(studenttaskid, complete) {
  if (!studenttaskid) return;

  if (!progressPendingUpdates[studenttaskid]) {
    progressPendingUpdates[studenttaskid] = {
      studenttaskid
    };
  }

  progressPendingUpdates[studenttaskid].completeStatus = complete ? "YES" : "";

  Object.values(studentSubjectTaskGroups).forEach(subject => {
    subject.tasks.forEach(task => {
      if (String(task.studenttaskid) === String(studenttaskid)) {
        task.completestatus = complete ? "YES" : "";
      }
    });
  });

  if (getStudentProgressSwipeTrack()) {
    updateStudentProgressStatusControls(studenttaskid, complete);
    updateStudentProgressModuleIndicators();
    updateStudentProgressTaskScrollState();
    return;
  }

  renderStudentSubjectTaskList();
}


async function toggleStudentTask(studenttaskid, complete) {
  const result = await apiPost("/api/tasks/update-complete", {
    studenttaskid,
    complete
  }, state.token);

  if (!result.success) {
    alert(result.error || "Could not update task.");
    return;
  }

  showStudentTasks();
}

/* =========================
   TEACHER / ADMIN PROGRESS DRILLDOWN
========================= */

function normalizeProgressSubject(subject) {
  const moduleId = subject.moduleid || subject.moduleID || subject.ModuleID || subject.subjectid || subject.SubjectID || "";
  const moduleName = subject.modulename || subject.moduleName || subject.ModuleName || subject.subjectname || subject.SubjectName || "Module";

  return {
    ...subject,
    subjectid: moduleId,
    subjectname: moduleName,
    moduleid: moduleId,
    modulename: moduleName,
    completedPercent: Number(subject.completedPercent || subject.completePercent || 0),
    verifiedPercent: Number(subject.verifiedPercent || subject.verifyPercent || 0)
  };
}

function normalizeProgressTask(task) {
  return {
    ...task,
    taskid: getStudentTaskField(task, ["taskid", "taskID", "TaskID", "TaskId"]),
    taskname: getStudentTaskField(task, ["taskname", "taskName", "TaskName", "Task"], "Untitled Task"),
    subjectid: getStudentTaskField(task, ["subjectid", "subjectID", "SubjectID", "SubjectId"]),
    subjectname: getStudentTaskField(task, ["subjectname", "subjectName", "SubjectName", "Subject"], "Other"),
    moduleid: getStudentTaskField(task, ["moduleid", "moduleID", "ModuleID", "ModuleId"]),
    modulename: getStudentTaskField(task, ["modulename", "moduleName", "ModuleName", "Module"], "General")
  };
}

function normalizeProgressStudentRow(row) {
  const source = row || {};
  const normalized = normalizeStudentTask(source);

  return {
    ...normalized,
    studenttaskid: getStudentTaskField(source, [
      "studenttaskid", "studentTaskId", "StudentTaskID", "StudentTaskId"
    ], normalized.studenttaskid),
    studentid: getStudentTaskField(source, [
      "studentid", "studentID", "StudentID", "StudentId"
    ], normalized.studentid || ""),
    username: getStudentTaskField(source, [
      "username", "userName", "Username", "StudentName", "studentName", "Name", "name"
    ], normalized.username || "Student"),
    classgroup: getStudentTaskField(source, [
      "classgroup", "classGroup", "ClassGroup", "Group", "group", "GroupNo", "groupno"
    ], normalized.classgroup || ""),
    subjectid: getStudentTaskField(source, [
      "subjectid", "subjectID", "SubjectID", "SubjectId"
    ], normalized.subjectid || ""),
    subjectname: getStudentTaskField(source, [
      "subjectname", "subjectName", "SubjectName", "Subject"
    ], normalized.subjectname || "Other"),
    moduleid: getStudentTaskField(source, [
      "moduleid", "moduleID", "ModuleID", "ModuleId"
    ], normalized.moduleid || ""),
    modulename: getStudentTaskField(source, [
      "modulename", "moduleName", "ModuleName", "Module"
    ], normalized.modulename || "General")
  };
}

function sortProgressSubjects(a, b) {
  return sortSubjectGroupsBySubjectId(normalizeProgressSubject(a), normalizeProgressSubject(b));
}

function sortProgressTasks(a, b) {
  return sortBySubjectIdThenTask(normalizeProgressTask(a), normalizeProgressTask(b));
}

const progressState = {
  contextType: null,
  classgroup: "ALL",
  studentid: "ALL",
  studentName: "",
  subjectid: "ALL",
  subjectname: "",
  taskid: "ALL",
  taskname: "",
  fromAdminDashboard: false,
  activePopoutStudentId: "",
  activePopoutStudentName: ""
};

let progressPendingUpdates = {};
let currentProgressRows = [];
let adminProgressDashboardModules = [];
let adminProgressDashboardRows = [];
let adminProgressActiveTaskRows = [];
let adminProgressPopoutRows = [];
let adminProgressActiveView = "all";
let adminProgressIndividualRows = [];
let adminProgressIndividualStudents = [];
let adminProgressIndividualSelectedRows = [];
let adminProgressIndividualSelectedModules = [];
const adminProgressIndividualMatrixState = {
  studentid: "",
  activeModuleIndex: 0,
  taskIndexByModuleKey: {}
};

const ADMIN_PROGRESS_DASHBOARD_CACHE_KEY = "m4l_admin_progress_dashboard_v73_2";
let adminProgressLeaveGuardBound = false;

function hasProgressPendingUpdates() {
  return Object.keys(progressPendingUpdates || {}).length > 0;
}

function isAdminProgressScreenId(screenId) {
  return [
    "progress-report",
    "progress-subjects-screen",
    "progress-tasks-screen",
    "progress-task-students-screen"
  ].includes(String(screenId || ""));
}

function setAdminProgressSectionBodyState(screenIdOrActive) {
  if (typeof document === "undefined" || !document.body) {
    return false;
  }

  const isActive = typeof screenIdOrActive === "boolean"
    ? screenIdOrActive
    : isAdminProgressScreenId(screenIdOrActive);

  document.body.classList.toggle("is-admin-progress-section", isActive);
  return isActive;
}

function readAdminProgressDashboardCache() {
  if (typeof window === "undefined" || !window.sessionStorage) return null;

  try {
    const raw = window.sessionStorage.getItem(ADMIN_PROGRESS_DASHBOARD_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.modules)) return null;

    return {
      modules: parsed.modules,
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      savedAt: parsed.savedAt || 0
    };
  } catch (err) {
    console.warn("Could not read admin progress dashboard cache:", err);
    return null;
  }
}

function writeAdminProgressDashboardCache(modules, rows) {
  if (typeof window === "undefined" || !window.sessionStorage) return false;

  try {
    window.sessionStorage.setItem(ADMIN_PROGRESS_DASHBOARD_CACHE_KEY, JSON.stringify({
      savedAt: Date.now(),
      modules: Array.isArray(modules) ? modules : [],
      rows: Array.isArray(rows) ? rows : []
    }));
    return true;
  } catch (err) {
    console.warn("Could not cache admin progress dashboard:", err);
    return false;
  }
}

function clearAdminProgressDashboardCache() {
  if (typeof window === "undefined" || !window.sessionStorage) return false;

  try {
    window.sessionStorage.removeItem(ADMIN_PROGRESS_DASHBOARD_CACHE_KEY);
    return true;
  } catch (err) {
    return false;
  }
}

function bindAdminProgressSwipeUpClose(element, closeHandler) {
  // V73.1.2: Progress screens close only through their visible X buttons.
  // Do not attach swipe-up-to-close to headers, panels, backdrops, or scrollable lists.
  return false;
}


function getAdminProgressAigLabel(view) {
  const normalized = String(view || "all").toLowerCase();
  if (normalized === "individual") return "Individual";
  if (normalized === "group") return "Group";
  return "All";
}

function renderAdminProgressAigSelector(activeView = "all") {
  const currentView = ["all", "individual", "group"].includes(String(activeView || "").toLowerCase())
    ? String(activeView || "all").toLowerCase()
    : "all";

  const options = [
    { key: "all", label: "All" },
    { key: "individual", label: "Individual" },
    { key: "group", label: "Group" }
  ];

  return `
    <div class="admin-progress-aig-shell" data-admin-progress-aig-shell>
      <div class="m4l-segmented-control admin-progress-aig-selector" role="tablist" aria-label="Progress view">
        ${options.map(option => {
          const isActive = option.key === currentView;
          return `
            <button
              type="button"
              class="m4l-segmented-option${isActive ? " is-active" : ""}"
              role="tab"
              data-progress-action="set-admin-progress-view"
              data-progress-view="${option.key}"
              aria-selected="${isActive ? "true" : "false"}"
            >${option.label}</button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function ensureAdminProgressAigSelector(screenOrId, activeView = adminProgressActiveView || "all") {
  const screen = getDomElement(screenOrId);
  if (!screen) return false;

  let shell = screen.querySelector("[data-admin-progress-aig-shell]");
  if (!shell) {
    screen.insertAdjacentHTML("afterbegin", renderAdminProgressAigSelector(activeView));
    shell = screen.querySelector("[data-admin-progress-aig-shell]");
  } else {
    shell.outerHTML = renderAdminProgressAigSelector(activeView);
    shell = screen.querySelector("[data-admin-progress-aig-shell]");
  }

  bindProgressUiHandlers(screen);
  return !!shell;
}

function updateAdminProgressAigSelectorState(activeView = adminProgressActiveView || "all") {
  const currentView = ["all", "individual", "group"].includes(String(activeView || "").toLowerCase())
    ? String(activeView || "all").toLowerCase()
    : "all";

  document.querySelectorAll("[data-admin-progress-aig-shell]").forEach(shell => {
    shell.querySelectorAll("[data-progress-view]").forEach(button => {
      const isActive = String(button.dataset.progressView || "") === currentView;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  });
}

function renderAdminProgressPlaceholderView(view) {
  const dashboard = getDomElement("admin-progress-dashboard");
  if (!dashboard) return false;

  const label = getAdminProgressAigLabel(view);
  setDomHtml(dashboard, `
    <section class="admin-progress-placeholder-card" aria-label="${escapeForAttribute(label)} Progress">
      <h3>${escapeHtml(label)} Progress</h3>
      <p class="helper-text">This Progress view will be connected next.</p>
    </section>
  `);
  return true;
}

function renderAdminProgressLoadingState(message = "Loading class progress...") {
  return `
    <section class="admin-progress-loading-card" role="status" aria-live="polite">
      <span class="admin-progress-loading-spinner" aria-hidden="true"></span>
      <span class="admin-progress-loading-text">${escapeHtml(message)}</span>
    </section>
  `;
}

function startAdminProgressBackgroundSave(options = {}) {
  if (!hasProgressPendingUpdates()) {
    return null;
  }

  const pendingCount = Object.keys(progressPendingUpdates || {}).length;

  if (options.confirm !== false) {
    window.confirm("Progress changes will be saved in the background.");
  }

  const savePromise = saveProgressPendingChanges({ reload: false, alert: false })
    .then(saved => {
      if (saved) {
        clearAdminProgressDashboardCache();
        refreshAdminProgressDashboardCacheInBackground({
          render: adminProgressActiveView === "all" && !!document.querySelector("#progress-report.active")
        });
        return true;
      }

      alert(`${pendingCount} progress ${pendingCount === 1 ? "change" : "changes"} could not be saved. Please retry from Progress.`);
      return false;
    })
    .catch(err => {
      console.error("Could not save progress changes in the background:", err);
      alert(err.message || "Could not save progress changes in the background.");
      return false;
    });

  return savePromise;
}

async function setAdminProgressAigView(view) {
  const normalizedView = ["all", "individual", "group"].includes(String(view || "").toLowerCase())
    ? String(view || "all").toLowerCase()
    : "all";

  if (isAdminProgressScreenId(document.querySelector(".screen.active")?.id) && hasProgressPendingUpdates()) {
    startAdminProgressBackgroundSave({ confirm: true });
  }

  closeAdminProgressStudentPopout({ silent: true });
  adminProgressActiveView = normalizedView;

  if (normalizedView === "all") {
    await showProgressReport();
    return true;
  }

  if (normalizedView === "individual") {
    await showAdminIndividualProgressLanding();
    return true;
  }

  setProgressScreensForAdmin();
  showScreen("progress-report");
  prepareAdminProgressMonitor();
  adminProgressActiveView = normalizedView;
  ensureAdminProgressAigSelector("progress-report", normalizedView);
  updateAdminProgressAigSelectorState(normalizedView);
  renderAdminProgressPlaceholderView(normalizedView);
  return true;
}

async function saveAdminProgressPendingForClose() {
  startAdminProgressBackgroundSave({ confirm: true });
  return true;
}

async function requestCloseAdminProgressTaskScreen() {
  startAdminProgressBackgroundSave({ confirm: true });
  closeAdminProgressStudentPopout({ silent: true });

  if (adminProgressActiveView === "individual" || progressState.contextType === "student") {
    await showAdminIndividualProgressLanding({ preserveRows: true });
    return true;
  }

  await showProgressReport();
  return true;
}

async function requestCloseAdminProgressStudentPopout() {
  startAdminProgressBackgroundSave({ confirm: true });
  closeAdminProgressStudentPopout({ silent: true });
  return true;
}

function bindAdminProgressLeaveGuard() {
  if (adminProgressLeaveGuardBound === true) return true;
  if (typeof window === "undefined") return false;

  adminProgressLeaveGuardBound = true;

  if (typeof window.addEventListener === "function") {
    window.addEventListener("beforeunload", event => {
      if (!hasProgressPendingUpdates()) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  if (typeof window.showScreen !== "function" || window.showScreen.__m4lAdminProgressGuard === true) {
    return true;
  }

  const originalShowScreen = window.showScreen;

  const guardedShowScreen = function guardedShowScreen(screenId, ...args) {
    const targetScreenId = String(screenId || "");
    const activeScreen = document.querySelector(".screen.active");
    const activeScreenId = activeScreen ? String(activeScreen.id || "") : "";

    const leavingProgress = isAdminProgressScreenId(activeScreenId) &&
      !isAdminProgressScreenId(targetScreenId) &&
      hasProgressPendingUpdates();

    if (!leavingProgress) {
      const screenChanged = originalShowScreen.call(this, screenId, ...args);
      setAdminProgressSectionBodyState(targetScreenId);
      return screenChanged;
    }

    const shouldSave = window.confirm(
      "You have unsaved progress changes. Press OK to save before leaving Progress, or Cancel to stay."
    );

    if (!shouldSave) {
      return false;
    }

    saveProgressPendingChanges({ reload: false, alert: false })
      .then(saved => {
        if (saved || !hasProgressPendingUpdates()) {
          originalShowScreen.call(this, screenId, ...args);
          setAdminProgressSectionBodyState(targetScreenId);
        }
      })
      .catch(err => {
        console.error("Could not save progress before leaving:", err);
        alert(err.message || "Could not save progress changes.");
      });

    return false;
  };

  guardedShowScreen.__m4lAdminProgressGuard = true;
  window.showScreen = guardedShowScreen;
  return true;
}

async function showProgressReport() {
  setAdminProgressSectionBodyState("progress-report");
  setProgressScreensForAdmin();
  adminProgressActiveView = "all";
  prepareAdminProgressMonitor();
  ensureAdminProgressAigSelector("progress-report", "all");
  updateAdminProgressAigSelectorState("all");

  progressState.contextType = "class";
  progressState.classgroup = "ALL";
  progressState.studentid = "ALL";
  progressState.studentName = "";
  progressState.subjectid = "ALL";
  progressState.subjectname = "";
  progressState.taskid = "ALL";
  progressState.taskname = "";
  progressState.fromAdminDashboard = true;
  progressState.activePopoutStudentId = "";
  progressState.activePopoutStudentName = "";
  progressPendingUpdates = {};
  currentProgressRows = [];
  adminProgressDashboardRows = [];
  adminProgressActiveTaskRows = [];
  adminProgressPopoutRows = [];

  setDomHtml("admin-progress-dashboard", renderAdminProgressLoadingState("Loading class progress..."));
  showScreen("progress-report");
  await loadAdminProgressDashboard();
}

function prepareAdminProgressMonitor() {
  const screen = document.getElementById("progress-report");
  if (!screen) return;

  bindAdminProgressLeaveGuard();
  screen.classList.add("progress-selector-screen", "admin-progress-screen");

  const header = screen.querySelector(".nav-header");
  if (header) {
    header.classList.add("admin-progress-landing-header");
    header.innerHTML = `<h2>Progress</h2>`;
  }

  ensureAdminProgressAigSelector(screen, adminProgressActiveView || "all");
  updateAdminProgressAigSelectorState(adminProgressActiveView || "all");

  // V71.1 keeps the landing page clean: no Home icon and no instruction text.
  // V71 replaces the old selector cards with native Netflix-style module shelves.
  // Keep the old selector markup harmless if an older admin index is deployed.
  screen.querySelectorAll(".dashboard-section").forEach(section => {
    section.classList.add("hidden");
  });

  if (!document.getElementById("admin-progress-dashboard")) {
    screen.insertAdjacentHTML("beforeend", `
      <div id="admin-progress-dashboard" class="admin-progress-dashboard">
        ${renderAdminProgressLoadingState("Loading progress...")}
      </div>
    `);
  }
}

async function fetchAdminProgressDashboardData() {
  const overview = await apiPost("/api/progress/task-detail", {
    studentid: "ALL",
    classgroup: "ALL",
    subjectid: "ALL",
    taskid: "ALL"
  }, state.token);

  if (!overview.success) {
    throw new Error(overview.error || "Could not load class progress.");
  }

  const overviewRows = Array.isArray(overview.students)
    ? overview.students.map(normalizeProgressStudentRow)
    : [];

  let tasks = Array.isArray(overview.tasks)
    ? overview.tasks.map(normalizeProgressTask)
    : [];

  const subjects = Array.isArray(overview.subjects)
    ? overview.subjects.map(normalizeProgressSubject).sort(sortProgressSubjects)
    : [];

  if (tasks.length === 0 && subjects.length > 0) {
    const taskResults = await Promise.all(subjects.map(subject => {
      return apiPost("/api/progress/task-detail", {
        studentid: "ALL",
        classgroup: "ALL",
        subjectid: subject.subjectid || "ALL",
        taskid: "ALL"
      }, state.token).catch(err => ({ success: false, error: err.message, tasks: [] }));
    }));

    tasks = taskResults
      .filter(result => result && result.success && Array.isArray(result.tasks))
      .flatMap(result => result.tasks.map(normalizeProgressTask));
  }

  if (tasks.length === 0 && overviewRows.length > 0) {
    tasks = buildAdminTaskSummariesFromRows(overviewRows);
  }

  return {
    rows: overviewRows,
    modules: buildAdminProgressModules(tasks, overviewRows)
  };
}

async function refreshAdminProgressDashboardCacheInBackground(options = {}) {
  try {
    const fresh = await fetchAdminProgressDashboardData();
    adminProgressDashboardRows = fresh.rows;
    adminProgressDashboardModules = fresh.modules;
    writeAdminProgressDashboardCache(fresh.modules, fresh.rows);

    if (options.render === true) {
      renderAdminProgressDashboard(fresh.modules);
    }

    return fresh;
  } catch (err) {
    console.warn("Could not refresh admin progress dashboard cache:", err);
    return null;
  }
}

async function loadAdminProgressDashboard() {
  const dashboard = getDomElement("admin-progress-dashboard");
  if (!dashboard) {
    console.warn("Missing admin-progress-dashboard container.");
    return;
  }

  const cached = readAdminProgressDashboardCache();

  if (cached && Array.isArray(cached.modules) && cached.modules.length > 0) {
    adminProgressDashboardModules = cached.modules;
    adminProgressDashboardRows = cached.rows;
    renderAdminProgressDashboard(cached.modules);
    refreshAdminProgressDashboardCacheInBackground({ render: true });
    return;
  }

  setDomHtml(dashboard, renderAdminProgressLoadingState("Loading class progress..."));

  try {
    const fresh = await fetchAdminProgressDashboardData();
    adminProgressDashboardRows = fresh.rows;
    adminProgressDashboardModules = fresh.modules;
    writeAdminProgressDashboardCache(fresh.modules, fresh.rows);
    renderAdminProgressDashboard(fresh.modules);
  } catch (err) {
    console.error("Could not load admin progress dashboard:", err);
    setDomHtml(dashboard, `<p class="error-message">${escapeHtml(err.message || "Could not load class progress.")}</p>`);
  }
}

function getProgressPercentValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function getAdminTaskKey(row) {
  return String(row.taskid || row.taskname || "");
}

function getAdminModuleKey(row) {
  return String(row.moduleid || row.subjectid || row.modulename || row.subjectname || "General");
}

function getAdminModuleName(row) {
  return String(row.modulename || row.subjectname || "General");
}

function getAdminProgressSummaryFromRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.length;
  const completed = list.filter(row => isStatusOn(row.completestatus)).length;
  const verified = list.filter(row => isStatusOn(row.verifystatus)).length;

  return {
    total,
    completed,
    verified,
    completedPercent: total === 0 ? 0 : Math.round((completed / total) * 100),
    verifiedPercent: total === 0 ? 0 : Math.round((verified / total) * 100)
  };
}

function buildAdminTaskSummariesFromRows(rows) {
  const taskMap = {};

  (Array.isArray(rows) ? rows : [])
    .map(normalizeProgressStudentRow)
    .filter(row => String(row.classgroup || "").trim() !== "0")
    .forEach(row => {
      const taskKey = getAdminTaskKey(row);
      if (!taskKey) return;

      if (!taskMap[taskKey]) {
        taskMap[taskKey] = {
          taskid: row.taskid,
          taskname: row.taskname || "Untitled Task",
          subjectid: row.subjectid || row.moduleid || "ALL",
          subjectname: row.subjectname || row.modulename || "General",
          moduleid: row.moduleid || row.subjectid || "",
          modulename: row.modulename || row.subjectname || "General",
          rows: []
        };
      }

      taskMap[taskKey].rows.push(row);
    });

  return Object.values(taskMap).map(task => {
    const summary = getAdminProgressSummaryFromRows(task.rows);
    return {
      ...task,
      completedPercent: summary.completedPercent,
      verifiedPercent: summary.verifiedPercent,
      studentCount: summary.total
    };
  });
}

function findAdminDashboardTask(subjectid, taskid, taskname) {
  const targetSubject = String(subjectid || "");
  const targetTaskId = String(taskid || "");
  const targetTaskName = String(taskname || "");

  for (const module of adminProgressDashboardModules || []) {
    const moduleMatches = !targetSubject || targetSubject === "ALL" ||
      String(module.subjectid || "") === targetSubject ||
      String(module.moduleid || "") === targetSubject ||
      String(module.subjectname || "") === targetSubject ||
      String(module.modulename || "") === targetSubject;

    const task = (module.tasks || []).find(item => {
      const taskMatches = (targetTaskId && String(item.taskid || "") === targetTaskId) ||
        (targetTaskName && String(item.taskname || "") === targetTaskName);
      return taskMatches && (moduleMatches || !targetSubject || targetSubject === "ALL");
    });

    if (task) return task;
  }

  return null;
}

function getAdminCachedRowsForTask(taskid, taskname, subjectid) {
  const targetTaskId = String(taskid || "");
  const targetTaskName = String(taskname || "");
  const targetSubject = String(subjectid || "");

  return (adminProgressDashboardRows || [])
    .map(normalizeProgressStudentRow)
    .filter(row => {
      const rowTaskId = String(row.taskid || "");
      const rowTaskName = String(row.taskname || "");
      const rowSubjectId = String(row.subjectid || "");
      const rowSubjectName = String(row.subjectname || "");
      const rowModuleId = String(row.moduleid || "");
      const rowModuleName = String(row.modulename || "");

      const taskMatches = (targetTaskId && rowTaskId === targetTaskId) ||
        (targetTaskName && rowTaskName === targetTaskName);

      if (!taskMatches) return false;

      if (!targetSubject || targetSubject === "ALL") return true;

      return rowSubjectId === targetSubject ||
        rowSubjectName === targetSubject ||
        rowModuleId === targetSubject ||
        rowModuleName === targetSubject;
    });
}

function getAdminFallbackRowsForActiveTask() {
  const activeRows = Array.isArray(adminProgressActiveTaskRows)
    ? adminProgressActiveTaskRows.map(normalizeProgressStudentRow)
    : [];

  if (activeRows.length > 0) {
    return activeRows;
  }

  return getAdminCachedRowsForTask(
    progressState.taskid,
    progressState.taskname,
    progressState.subjectid
  );
}

function buildAdminProgressModules(tasks, rows) {
  const rowsByTask = {};

  (Array.isArray(rows) ? rows : [])
    .map(normalizeProgressStudentRow)
    .filter(row => String(row.classgroup || "").trim() !== "0")
    .forEach(row => {
      const taskKey = getAdminTaskKey(row);
      if (!taskKey) return;
      if (!rowsByTask[taskKey]) rowsByTask[taskKey] = [];
      rowsByTask[taskKey].push(row);
    });

  const moduleMap = {};

  (Array.isArray(tasks) ? tasks : [])
    .map(normalizeProgressTask)
    .filter(task => task.taskid || task.taskname)
    .forEach(task => {
      const taskKey = getAdminTaskKey(task);
      const summaryRows = rowsByTask[taskKey] || task.rows || [];
      const summary = getAdminProgressSummaryFromRows(summaryRows);
      const moduleKey = getAdminModuleKey(task);
      const moduleName = getAdminModuleName(task);
      const subjectid = task.subjectid || task.moduleid || moduleKey;
      const subjectname = task.subjectname || task.modulename || moduleName;

      if (!moduleMap[moduleKey]) {
        moduleMap[moduleKey] = {
          moduleid: task.moduleid || task.subjectid || moduleKey,
          modulename: moduleName,
          subjectid,
          subjectname,
          tasks: []
        };
      }

      const completedPercentRaw = task.completedPercent !== undefined
        ? task.completedPercent
        : task.completePercent;
      const verifiedPercentRaw = task.verifiedPercent !== undefined
        ? task.verifiedPercent
        : task.verifyPercent;

      moduleMap[moduleKey].tasks.push({
        ...task,
        subjectid,
        subjectname,
        moduleid: task.moduleid || moduleKey,
        modulename: moduleName,
        rows: Array.isArray(summaryRows) ? summaryRows.map(normalizeProgressStudentRow) : [],
        completedPercent: completedPercentRaw !== undefined
          ? getProgressPercentValue(completedPercentRaw)
          : summary.completedPercent,
        verifiedPercent: verifiedPercentRaw !== undefined
          ? getProgressPercentValue(verifiedPercentRaw)
          : summary.verifiedPercent,
        studentCount: task.studentCount || summary.total
      });
    });

  return Object.values(moduleMap)
    .map(module => ({
      ...module,
      tasks: module.tasks.sort(sortProgressTasks)
    }))
    .sort(sortModuleGroupsByModuleId);
}

function renderAdminProgressDashboard(modules) {
  const dashboard = getDomElement("admin-progress-dashboard");
  if (!dashboard) return;

  const list = Array.isArray(modules) ? modules : [];

  if (list.length === 0) {
    setDomHtml(dashboard, `<p class="helper-text">No progress tasks found.</p>`);
    return;
  }

  const html = list.map(renderAdminProgressModuleShelf).join("");

  setDomHtml(dashboard, html);
  bindProgressUiHandlers(dashboard);
  bindAdminProgressDashboardRailControls(dashboard);
}

function renderAdminProgressModuleShelf(module, moduleIndex = 0) {
  const tasks = Array.isArray(module.tasks) ? module.tasks : [];
  const moduleName = module.modulename || module.subjectname || "Module";

  return `
    <section
      class="admin-progress-module-shelf"
      data-admin-progress-dashboard-shelf
      data-progress-module-index="${moduleIndex}"
      aria-label="${escapeForAttribute(moduleName)}"
    >
      <div class="admin-progress-module-heading">
        <h3>${escapeHtml(moduleName)}</h3>
        <span class="admin-progress-module-count">${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}</span>
      </div>
      ${renderAdminProgressDashboardTaskDots(tasks, moduleName)}
      <div
        class="admin-progress-task-rail"
        data-admin-progress-dashboard-rail
        aria-label="${escapeForAttribute(moduleName)} tasks"
      >
        ${tasks.map(renderAdminProgressTaskCard).join("")}
      </div>
    </section>
  `;
}

function renderAdminProgressDashboardTaskDots(tasks, moduleName) {
  const list = Array.isArray(tasks) ? tasks : [];

  if (list.length <= 1) {
    return "";
  }

  return `
    <div class="admin-progress-task-dots" data-admin-progress-dashboard-task-dots aria-label="${escapeForAttribute(moduleName || "Module")} task cards">
      ${list.map((task, index) => `
        <button
          type="button"
          class="admin-progress-task-dot${index === 0 ? " is-active" : ""}"
          data-progress-action="scroll-admin-dashboard-task"
          data-progress-task-index="${index}"
          aria-label="Show ${escapeForAttribute(task.taskname || `task ${index + 1}`)}"
          aria-current="${index === 0 ? "true" : "false"}"
        ></button>
      `).join("")}
    </div>
  `;
}

function getAdminProgressDashboardShelfFromElement(element) {
  return element && typeof element.closest === "function"
    ? element.closest("[data-admin-progress-dashboard-shelf], .admin-progress-module-shelf")
    : null;
}

function getAdminProgressDashboardRailFromShelf(shelf) {
  return shelf ? shelf.querySelector("[data-admin-progress-dashboard-rail], .admin-progress-task-rail") : null;
}

function getAdminProgressDashboardRailCards(rail) {
  if (!rail || !rail.children) return [];

  return Array.from(rail.children).filter(child => {
    return child && child.matches && child.matches(".admin-progress-task-card");
  });
}

function getAdminProgressDashboardRailActiveIndex(rail) {
  if (!rail) return 0;

  const cards = getAdminProgressDashboardRailCards(rail);
  if (cards.length <= 1) return 0;

  const firstCard = cards[0];
  const secondCard = cards[1];
  let step = firstCard ? firstCard.getBoundingClientRect().width : (rail.clientWidth || 1);

  if (firstCard && secondCard) {
    const firstRect = firstCard.getBoundingClientRect();
    const secondRect = secondCard.getBoundingClientRect();
    const measuredStep = Math.abs(secondRect.left - firstRect.left);

    if (measuredStep > 1) {
      step = measuredStep;
    }
  }

  const index = Math.round((rail.scrollLeft || 0) / Math.max(1, step));
  return Math.max(0, Math.min(cards.length - 1, index));
}

function updateAdminProgressDashboardRailDots(rail) {
  const targetRail = rail || null;
  const shelf = targetRail ? targetRail.closest("[data-admin-progress-dashboard-shelf], .admin-progress-module-shelf") : null;

  if (!shelf || !targetRail) return false;

  const dots = Array.from(shelf.querySelectorAll("[data-admin-progress-dashboard-task-dots] [data-progress-task-index]"));
  if (!dots.length) return false;

  const activeIndex = getAdminProgressDashboardRailActiveIndex(targetRail);

  dots.forEach((dot, fallbackIndex) => {
    const dotIndex = Number(dot.dataset.progressTaskIndex || fallbackIndex || 0);
    const isActive = dotIndex === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });

  return true;
}

function scrollAdminProgressDashboardRailToIndex(actionEl, taskIndex, options = {}) {
  const shelf = getAdminProgressDashboardShelfFromElement(actionEl);
  const rail = getAdminProgressDashboardRailFromShelf(shelf);
  const cards = getAdminProgressDashboardRailCards(rail);
  const index = Number(taskIndex || 0);

  if (!rail || !cards[index]) return false;

  cards[index].scrollIntoView({
    behavior: options.behavior || "smooth",
    block: "nearest",
    inline: "start"
  });

  updateAdminProgressDashboardRailDots(rail);

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => updateAdminProgressDashboardRailDots(rail));
  } else {
    window.setTimeout(() => updateAdminProgressDashboardRailDots(rail), 0);
  }

  return true;
}

function bindAdminProgressDashboardRailControls(container) {
  const host = getDomElement(container) || document;
  const rails = Array.from(host.querySelectorAll("[data-admin-progress-dashboard-rail], .admin-progress-task-rail"));

  rails.forEach(rail => {
    if (rail.dataset.adminProgressDashboardRailBound === "true") {
      updateAdminProgressDashboardRailDots(rail);
      return;
    }

    rail.dataset.adminProgressDashboardRailBound = "true";
    let pendingFrame = 0;

    rail.addEventListener("scroll", () => {
      if (pendingFrame) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        updateAdminProgressDashboardRailDots(rail);
      });
    }, { passive: true });

    window.setTimeout(() => updateAdminProgressDashboardRailDots(rail), 0);
  });

  return rails.length > 0;
}

function renderAdminProgressTaskCard(task) {
  const completedPercent = getProgressPercentValue(task.completedPercent);
  const verifiedPercent = getProgressPercentValue(task.verifiedPercent);

  return `
    <button
      type="button"
      class="admin-progress-task-card"
      data-progress-action="open-admin-progress-task-card"
      data-subjectid="${escapeForAttribute(task.subjectid || "ALL")}"
      data-subjectname="${escapeForAttribute(task.subjectname || task.modulename || "Module")}"
      data-taskid="${escapeForAttribute(task.taskid)}"
      data-taskname="${escapeForAttribute(task.taskname)}"
    >
      <span class="admin-progress-task-card-title">${escapeHtml(task.taskname || "Untitled Task")}</span>
      ${renderAdminProgressCardBars(completedPercent, verifiedPercent)}
    </button>
  `;
}


function renderAdminProgressCardBars(completedPercent, verifiedPercent) {
  const completeWidth = getProgressPercentValue(completedPercent);
  const verifiedWidth = getProgressPercentValue(verifiedPercent);

  return `
    <span class="admin-progress-card-bars">
      <span class="admin-progress-card-bar-row">
        <span class="admin-progress-card-bar-label">Complete</span>
        <span class="admin-progress-card-track" aria-label="Complete progress">
          <span class="admin-progress-card-fill progress-fill-complete" style="width:${completeWidth}%"></span>
        </span>
      </span>
      <span class="admin-progress-card-bar-row">
        <span class="admin-progress-card-bar-label">Verify</span>
        <span class="admin-progress-card-track" aria-label="Verify progress">
          <span class="admin-progress-card-fill progress-fill-verified" style="width:${verifiedWidth}%"></span>
        </span>
      </span>
    </span>
  `;
}

function getAdminProgressRowsFromDashboardModules() {
  return (adminProgressDashboardModules || [])
    .flatMap(module => Array.isArray(module.tasks) ? module.tasks : [])
    .flatMap(task => Array.isArray(task.rows) ? task.rows : [])
    .map(normalizeProgressStudentRow);
}

async function ensureAdminIndividualProgressRows() {
  if (Array.isArray(adminProgressDashboardRows) && adminProgressDashboardRows.length > 0) {
    adminProgressIndividualRows = adminProgressDashboardRows.map(normalizeProgressStudentRow);
    return adminProgressIndividualRows;
  }

  const cached = readAdminProgressDashboardCache();
  if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {
    adminProgressDashboardRows = cached.rows.map(normalizeProgressStudentRow);
    adminProgressDashboardModules = Array.isArray(cached.modules) ? cached.modules : [];
    adminProgressIndividualRows = adminProgressDashboardRows;
    refreshAdminProgressDashboardCacheInBackground({ render: false });
    return adminProgressIndividualRows;
  }

  const moduleRows = getAdminProgressRowsFromDashboardModules();
  if (moduleRows.length > 0) {
    adminProgressIndividualRows = moduleRows;
    return adminProgressIndividualRows;
  }

  const fresh = await fetchAdminProgressDashboardData();
  adminProgressDashboardRows = fresh.rows;
  adminProgressDashboardModules = fresh.modules;
  adminProgressIndividualRows = fresh.rows.map(normalizeProgressStudentRow);
  writeAdminProgressDashboardCache(fresh.modules, fresh.rows);
  return adminProgressIndividualRows;
}

function buildAdminIndividualStudentSummaries(rows) {
  const studentMap = {};

  (Array.isArray(rows) ? rows : [])
    .map(normalizeProgressStudentRow)
    .filter(row => String(row.classgroup || "").trim() !== "0")
    .forEach(row => {
      const studentid = String(row.studentid || "").trim();
      if (!studentid) return;

      if (!studentMap[studentid]) {
        studentMap[studentid] = {
          studentid,
          username: row.username || "Student",
          classgroup: row.classgroup || "Group",
          rows: []
        };
      }

      studentMap[studentid].rows.push(row);
    });

  return Object.values(studentMap).map(student => {
    const summary = getAdminProgressSummaryFromRows(student.rows);
    return {
      ...student,
      completedPercent: summary.completedPercent,
      verifiedPercent: summary.verifiedPercent,
      totalTasks: summary.total
    };
  }).sort((a, b) => {
    const groupCompare = naturalCompare(a.classgroup, b.classgroup);
    if (groupCompare !== 0) return groupCompare;
    return naturalCompare(a.username, b.username);
  });
}

async function showAdminIndividualProgressLanding(options = {}) {
  setAdminProgressSectionBodyState("progress-report");
  setProgressScreensForAdmin();
  adminProgressActiveView = "individual";
  prepareAdminProgressMonitor();
  ensureAdminProgressAigSelector("progress-report", "individual");
  updateAdminProgressAigSelectorState("individual");

  progressState.contextType = "individual";
  progressState.classgroup = "ALL";
  progressState.studentid = "ALL";
  progressState.studentName = "";
  progressState.subjectid = "ALL";
  progressState.subjectname = "";
  progressState.taskid = "ALL";
  progressState.taskname = "";
  progressState.fromAdminDashboard = false;
  progressState.activePopoutStudentId = "";
  progressState.activePopoutStudentName = "";
  progressPendingUpdates = {};
  adminProgressIndividualSelectedRows = [];
  adminProgressIndividualSelectedModules = [];

  setDomHtml("admin-progress-dashboard", renderAdminProgressLoadingState("Loading individual progress..."));
  showScreen("progress-report");

  try {
    const rows = options.preserveRows === true && adminProgressIndividualRows.length > 0
      ? adminProgressIndividualRows
      : await ensureAdminIndividualProgressRows();

    renderAdminIndividualProgressLanding(rows);
  } catch (err) {
    console.error("Could not load individual progress:", err);
    setDomHtml("admin-progress-dashboard", `<p class="error-message">${escapeHtml(err.message || "Could not load individual progress.")}</p>`);
  }
}

function renderAdminIndividualProgressLanding(rows) {
  const dashboard = getDomElement("admin-progress-dashboard");
  if (!dashboard) return false;

  const students = buildAdminIndividualStudentSummaries(rows);
  adminProgressIndividualStudents = students;

  if (students.length === 0) {
    setDomHtml(dashboard, `<p class="helper-text">No active students found.</p>`);
    return false;
  }

  const byGroup = {};
  students.forEach(student => {
    const groupKey = String(student.classgroup || "Group");
    if (!byGroup[groupKey]) byGroup[groupKey] = [];
    byGroup[groupKey].push(student);
  });

  const groups = Object.keys(byGroup).sort(naturalCompare);
  const html = groups.map(group => {
    const groupStudents = byGroup[group].sort((a, b) => naturalCompare(a.username, b.username));
    return `
      <section class="admin-progress-module-shelf admin-progress-individual-group-shelf" aria-label="Group ${escapeForAttribute(group)} individual progress">
        <div class="admin-progress-module-heading">
          <h3>Group ${escapeHtml(group)}</h3>
          <span class="admin-progress-module-count">${groupStudents.length} ${groupStudents.length === 1 ? "student" : "students"}</span>
        </div>
        <div class="admin-progress-task-rail admin-progress-individual-student-rail" aria-label="Group ${escapeForAttribute(group)} students">
          ${groupStudents.map(renderAdminIndividualStudentCard).join("")}
        </div>
      </section>
    `;
  }).join("");

  setDomHtml(dashboard, `<div class="admin-progress-individual-landing">${html}</div>`);
  bindProgressUiHandlers(dashboard);
  return true;
}

function renderAdminIndividualStudentCard(student) {
  return `
    <button
      type="button"
      class="admin-progress-task-card admin-progress-individual-student-card"
      data-progress-action="open-admin-individual-student"
      data-studentid="${escapeForAttribute(student.studentid)}"
      data-username="${escapeForAttribute(student.username || "Student")}">
      <span class="admin-progress-task-card-title">${escapeHtml(student.username || "Student")}</span>
      ${renderAdminProgressCardBars(student.completedPercent, student.verifiedPercent)}
    </button>
  `;
}

function buildAdminIndividualStudentModules(rows) {
  const moduleMap = {};

  (Array.isArray(rows) ? rows : [])
    .map(normalizeProgressStudentRow)
    .filter(row => String(row.classgroup || "").trim() !== "0")
    .sort(sortByModuleThenTask)
    .forEach(row => {
      const moduleKey = String(row.moduleid || row.subjectid || row.modulename || row.subjectname || "General");
      if (!moduleMap[moduleKey]) {
        moduleMap[moduleKey] = {
          moduleid: row.moduleid || row.subjectid || moduleKey,
          modulename: row.modulename || row.subjectname || "General",
          rows: []
        };
      }
      moduleMap[moduleKey].rows.push(row);
    });

  return Object.values(moduleMap).sort(sortModuleGroupsByModuleId).map(module => ({
    ...module,
    rows: module.rows.sort(sortByModuleThenTask)
  }));
}

function getIndividualModuleStateKey(moduleGroup, moduleIndex) {
  return String(moduleGroup.moduleid || moduleGroup.modulename || moduleIndex || "0");
}

function wrapProgressIndex(index, length) {
  const count = Number(length) || 0;
  if (count <= 0) return 0;
  return ((Number(index) || 0) % count + count) % count;
}

function getIndividualMatrixTaskIndex(moduleGroup, moduleIndex) {
  const key = getIndividualModuleStateKey(moduleGroup, moduleIndex);
  const stored = adminProgressIndividualMatrixState.taskIndexByModuleKey[key];
  return wrapProgressIndex(stored || 0, (moduleGroup.rows || []).length);
}

function setIndividualMatrixTaskIndex(moduleGroup, moduleIndex, taskIndex) {
  const key = getIndividualModuleStateKey(moduleGroup, moduleIndex);
  adminProgressIndividualMatrixState.taskIndexByModuleKey[key] = wrapProgressIndex(taskIndex, (moduleGroup.rows || []).length);
}

function prepareAdminIndividualMatrixState(studentid, modules, options = {}) {
  if (adminProgressIndividualMatrixState.studentid !== String(studentid || "") || options.reset === true) {
    adminProgressIndividualMatrixState.studentid = String(studentid || "");
    adminProgressIndividualMatrixState.activeModuleIndex = 0;
    adminProgressIndividualMatrixState.taskIndexByModuleKey = {};
  }

  adminProgressIndividualMatrixState.activeModuleIndex = wrapProgressIndex(
    adminProgressIndividualMatrixState.activeModuleIndex,
    modules.length
  );

  modules.forEach((moduleGroup, index) => {
    const key = getIndividualModuleStateKey(moduleGroup, index);
    if (adminProgressIndividualMatrixState.taskIndexByModuleKey[key] === undefined) {
      adminProgressIndividualMatrixState.taskIndexByModuleKey[key] = 0;
    } else {
      adminProgressIndividualMatrixState.taskIndexByModuleKey[key] = wrapProgressIndex(
        adminProgressIndividualMatrixState.taskIndexByModuleKey[key],
        (moduleGroup.rows || []).length
      );
    }
  });
}

async function openAdminIndividualStudentDetail(studentid, username = "Student") {
  const id = String(studentid || "").trim();
  if (!id) {
    alert("Student details are missing.");
    return false;
  }

  setAdminProgressSectionBodyState("progress-task-students-screen");
  setProgressScreensForAdmin();
  adminProgressActiveView = "individual";
  updateAdminProgressAigSelectorState("individual");
  closeAdminProgressStudentPopout({ silent: true });

  progressState.contextType = "student";
  progressState.classgroup = "ALL";
  progressState.studentid = id;
  progressState.studentName = username || "Student";
  progressState.subjectid = "ALL";
  progressState.subjectname = "";
  progressState.taskid = "ALL";
  progressState.taskname = "";
  progressState.fromAdminDashboard = false;
  progressState.activePopoutStudentId = "";
  progressState.activePopoutStudentName = "";
  progressPendingUpdates = {};

  setDomText("progress-task-students-title", progressState.studentName);

  if (!showScreen("progress-task-students-screen")) {
    console.warn("Progress task-students screen is missing.");
    return false;
  }

  setDomHtml("progress-task-students-list", renderAdminProgressLoadingState("Loading student progress..."));

  try {
    const result = await apiPost("/api/progress/task-detail", {
      studentid: id,
      classgroup: "ALL",
      subjectid: "ALL",
      taskid: "ALL"
    }, state.token);

    let rows = [];
    if (result && result.success && Array.isArray(result.students)) {
      rows = result.students.map(normalizeProgressStudentRow);
    }

    if (rows.length === 0) {
      const sourceRows = adminProgressIndividualRows.length > 0
        ? adminProgressIndividualRows
        : await ensureAdminIndividualProgressRows();
      rows = sourceRows
        .map(normalizeProgressStudentRow)
        .filter(row => String(row.studentid || "") === id);
    }

    if (rows.length === 0) {
      setDomHtml("progress-task-students-list", `<p class="helper-text">No tasks assigned to this student.</p>`);
      return false;
    }

    currentProgressRows = rows;
    adminProgressIndividualSelectedRows = rows;
    renderAdminIndividualSelectedStudentDetail(rows, { resetMatrix: true });
    return true;
  } catch (err) {
    const sourceRows = adminProgressIndividualRows.length > 0
      ? adminProgressIndividualRows
      : await ensureAdminIndividualProgressRows().catch(() => []);
    const fallbackRows = sourceRows
      .map(normalizeProgressStudentRow)
      .filter(row => String(row.studentid || "") === id);

    if (fallbackRows.length > 0) {
      currentProgressRows = fallbackRows;
      adminProgressIndividualSelectedRows = fallbackRows;
      renderAdminIndividualSelectedStudentDetail(fallbackRows, { resetMatrix: true });
      return true;
    }

    console.error("Could not load selected student progress:", err);
    setDomHtml("progress-task-students-list", `<p class="error-message">${escapeHtml(err.message || "Could not load selected student progress.")}</p>`);
    return false;
  }
}

function renderAdminIndividualSelectedStudentDetail(rows, options = {}) {
  const container = getDomElement("progress-task-students-list");
  if (!container) return false;

  container.classList.remove("admin-progress-task-class-list", "admin-progress-task-detail-list");
  container.classList.add("admin-progress-individual-selected-list");

  const modules = buildAdminIndividualStudentModules(rows);
  adminProgressIndividualSelectedModules = modules;
  prepareAdminIndividualMatrixState(progressState.studentid, modules, { reset: options.resetMatrix === true });

  if (modules.length === 0) {
    setDomHtml(container, `<p class="helper-text">No tasks assigned to this student.</p>`);
    return false;
  }

  setDomHtml(container, `
    <section class="admin-progress-individual-selected" aria-label="${escapeForAttribute(progressState.studentName || "Student")} progress">
      ${renderAdminIndividualMobileMatrix(modules)}
      ${renderAdminIndividualDesktopDetail(modules)}
    </section>
  `);

  bindProgressUiHandlers(container);
  bindAdminIndividualMatrixControls(container);
  return true;
}

function renderAdminIndividualMobileMatrix(modules) {
  const moduleCount = modules.length;
  const activeModuleIndex = wrapProgressIndex(adminProgressIndividualMatrixState.activeModuleIndex, moduleCount);
  const verticalPercent = moduleCount <= 1 ? 0 : (activeModuleIndex / (moduleCount - 1)) * 100;
  const rowOffsets = [-1, 0, 1];

  return `
    <div
      class="admin-progress-individual-mobile-matrix"
      data-admin-individual-matrix
      style="--individual-matrix-vertical-position:${verticalPercent}%;"
      aria-label="Mobile individual progress matrix">
      <span class="admin-progress-individual-matrix-vertical-indicator" aria-hidden="true"></span>
      ${rowOffsets.map(rowOffset => {
        const moduleIndex = wrapProgressIndex(activeModuleIndex + rowOffset, moduleCount);
        const moduleGroup = modules[moduleIndex];
        return renderAdminIndividualMatrixRow(moduleGroup, moduleIndex, rowOffset === 0);
      }).join("")}
    </div>
  `;
}

function renderAdminIndividualMatrixRow(moduleGroup, moduleIndex, isActiveRow) {
  const rows = Array.isArray(moduleGroup.rows) ? moduleGroup.rows : [];
  const taskCount = rows.length;
  const activeTaskIndex = getIndividualMatrixTaskIndex(moduleGroup, moduleIndex);
  const horizontalPercent = taskCount <= 1 ? 0 : (activeTaskIndex / (taskCount - 1)) * 100;
  const colOffsets = [-1, 0, 1];

  return `
    <div class="admin-progress-individual-matrix-row-wrap${isActiveRow ? " is-active-row" : ""}" style="--individual-matrix-horizontal-position:${horizontalPercent}%;">
      <span class="admin-progress-individual-matrix-horizontal-indicator" aria-hidden="true"></span>
      <div class="admin-progress-individual-matrix-row">
        <div class="admin-progress-individual-matrix-module-label" aria-hidden="${isActiveRow ? "false" : "true"}">
          ${isActiveRow ? escapeHtml(moduleGroup.modulename || "General") : ""}
        </div>
        <div class="admin-progress-individual-matrix-cards">
          ${colOffsets.map(colOffset => {
            const taskIndex = wrapProgressIndex(activeTaskIndex + colOffset, taskCount);
            const row = rows[taskIndex];
            return renderAdminIndividualMatrixTaskCard(row, moduleIndex, taskIndex, isActiveRow && colOffset === 0);
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderAdminIndividualMatrixTaskCard(row, moduleIndex, taskIndex, isActive) {
  if (!row) {
    return `<span class="admin-progress-individual-matrix-card is-preview is-empty" aria-hidden="true"></span>`;
  }

  const pending = progressPendingUpdates[row.studenttaskid] || {};
  const completeStatus = pending.completeStatus !== undefined ? pending.completeStatus : row.completestatus;
  const verifyStatus = pending.verifyStatus !== undefined ? pending.verifyStatus : row.verifystatus;
  const isComplete = isStatusOn(completeStatus);
  const isVerified = isStatusOn(verifyStatus);
  const taskName = row.taskname || "Task";

  if (!isActive) {
    return `
      <button
        type="button"
        class="admin-progress-individual-matrix-card is-preview"
        data-progress-action="focus-individual-matrix-card"
        data-matrix-module-index="${moduleIndex}"
        data-matrix-task-index="${taskIndex}"
        aria-label="Focus ${escapeForAttribute(taskName)}">
        <span class="admin-progress-individual-matrix-task-name">${escapeHtml(taskName)}</span>
        <span class="admin-progress-individual-matrix-status-row" aria-hidden="true">
          ${renderTaskStatusIndicator("complete", isComplete, { muted: !isComplete })}
          ${renderTaskStatusIndicator("verify", isVerified, { muted: !isVerified })}
        </span>
      </button>
    `;
  }

  return `
    <article class="admin-progress-individual-matrix-card is-active" aria-label="Active task ${escapeForAttribute(taskName)}">
      <span class="admin-progress-individual-matrix-task-name">${escapeHtml(taskName)}</span>
      ${renderAdminIndividualTaskStatusControls(row, "admin-progress-individual-matrix-controls")}
    </article>
  `;
}

function renderAdminIndividualTaskStatusControls(row, wrapperClass = "admin-progress-individual-task-controls") {
  const pending = progressPendingUpdates[row.studenttaskid] || {};
  const completeStatus = pending.completeStatus !== undefined ? pending.completeStatus : row.completestatus;
  const verifyStatus = pending.verifyStatus !== undefined ? pending.verifyStatus : row.verifystatus;
  const isComplete = isStatusOn(completeStatus);
  const isVerified = isStatusOn(verifyStatus);
  const taskName = row.taskname || "Task";

  return `
    <span class="${wrapperClass}">
      <button
        type="button"
        class="admin-progress-status-control admin-progress-complete-control is-admin-complete-override${isComplete ? " is-on" : ""}"
        data-progress-action="toggle-progress-pending"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="completeStatus"
        data-value="${isComplete ? "false" : "true"}"
        aria-label="${isComplete ? "Mark incomplete" : "Mark complete"}: ${escapeForAttribute(taskName)}">
        ${renderTaskStatusIndicator("complete", isComplete)}
      </button>
      <button
        type="button"
        class="admin-progress-status-control admin-progress-verify-control${isVerified ? " is-on" : ""}"
        data-progress-action="toggle-progress-pending"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="verifyStatus"
        data-value="${isVerified ? "false" : "true"}"
        aria-label="${isVerified ? "Mark unverified" : "Mark verified"}: ${escapeForAttribute(taskName)}">
        ${renderTaskStatusIndicator("verify", isVerified)}
      </button>
    </span>
  `;
}

function renderAdminIndividualDesktopDetail(modules) {
  return `
    <div class="admin-progress-individual-desktop-detail" aria-label="Desktop individual progress task cards">
      ${modules.map(moduleGroup => `
        <section class="admin-progress-individual-desktop-module" aria-label="${escapeForAttribute(moduleGroup.modulename || "General")}">
          <div class="admin-progress-individual-desktop-module-title">${escapeHtml(moduleGroup.modulename || "General")}</div>
          <div class="admin-progress-individual-desktop-task-grid">
            ${(moduleGroup.rows || []).map(renderAdminIndividualDesktopTaskCard).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderAdminIndividualDesktopTaskCard(row) {
  return `
    <article class="admin-progress-individual-desktop-task-card">
      <span class="admin-progress-individual-desktop-task-name">${escapeHtml(row.taskname || "Task")}</span>
      ${renderAdminIndividualTaskStatusControls(row)}
    </article>
  `;
}

function bindAdminIndividualMatrixControls(container) {
  const host = getDomElement(container) || document;
  const matrix = host.querySelector("[data-admin-individual-matrix]");
  if (!matrix || matrix.dataset.individualMatrixBound === "true") return !!matrix;

  matrix.dataset.individualMatrixBound = "true";
  let touchStartX = 0;
  let touchStartY = 0;

  matrix.addEventListener("touchstart", event => {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  matrix.addEventListener("touchend", event => {
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < 34) return;

    if (absX > absY) {
      moveAdminIndividualMatrix(0, dx < 0 ? 1 : -1);
    } else {
      moveAdminIndividualMatrix(dy < 0 ? 1 : -1, 0);
    }
  }, { passive: true });

  return true;
}

function moveAdminIndividualMatrix(moduleDelta = 0, taskDelta = 0) {
  const modules = adminProgressIndividualSelectedModules || [];
  if (!modules.length) return false;

  if (moduleDelta) {
    adminProgressIndividualMatrixState.activeModuleIndex = wrapProgressIndex(
      adminProgressIndividualMatrixState.activeModuleIndex + moduleDelta,
      modules.length
    );
  }

  const activeModule = modules[adminProgressIndividualMatrixState.activeModuleIndex];
  if (activeModule && taskDelta) {
    const currentTaskIndex = getIndividualMatrixTaskIndex(activeModule, adminProgressIndividualMatrixState.activeModuleIndex);
    setIndividualMatrixTaskIndex(activeModule, adminProgressIndividualMatrixState.activeModuleIndex, currentTaskIndex + taskDelta);
  }

  renderAdminIndividualSelectedStudentDetail(currentProgressRows, { resetMatrix: false });
  return true;
}

function focusAdminIndividualMatrixCard(moduleIndex, taskIndex) {
  const modules = adminProgressIndividualSelectedModules || [];
  if (!modules.length) return false;

  const safeModuleIndex = wrapProgressIndex(moduleIndex, modules.length);
  const moduleGroup = modules[safeModuleIndex];
  adminProgressIndividualMatrixState.activeModuleIndex = safeModuleIndex;
  setIndividualMatrixTaskIndex(moduleGroup, safeModuleIndex, taskIndex);

  renderAdminIndividualSelectedStudentDetail(currentProgressRows, { resetMatrix: false });
  return true;
}

async function openAdminProgressTaskCard(subjectid, subjectname, taskid, taskname) {
  if (!taskid) {
    alert("Task details are missing.");
    return;
  }

  setProgressScreensForAdmin();
  closeAdminProgressStudentPopout({ silent: true });

  progressState.contextType = "class";
  progressState.classgroup = "ALL";
  progressState.studentid = "ALL";
  progressState.studentName = "";
  progressState.subjectid = subjectid || "ALL";
  progressState.subjectname = subjectname || "Module";
  progressState.taskid = taskid;
  progressState.taskname = taskname || "Task";
  progressState.fromAdminDashboard = true;

  const dashboardTask = findAdminDashboardTask(
    progressState.subjectid,
    progressState.taskid,
    progressState.taskname
  );

  adminProgressActiveTaskRows = dashboardTask && Array.isArray(dashboardTask.rows)
    ? dashboardTask.rows.map(normalizeProgressStudentRow)
    : getAdminCachedRowsForTask(
        progressState.taskid,
        progressState.taskname,
        progressState.subjectid
      );

  setDomText("progress-task-students-title", progressState.taskname);
  await loadProgressTaskStudents();
}

async function loadProgressSelectors() {
  const groupSelect = getDomElement("progress-group-select");
  const studentSelect = getDomElement("progress-student-select");

  if (!groupSelect && !studentSelect) {
    console.warn("Progress selector controls are missing.");
    return;
  }

  const result = await apiPost("/api/progress/task-detail", {
    studentid: "ALL",
    classgroup: "ALL",
    subjectid: "ALL",
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    alert(result.error || "Could not load progress data.");
    return;
  }

  const studentRows = Array.isArray(result.students) ? result.students : [];

  if (groupSelect) {
    const groups = [...new Set(studentRows.map(s => s.classgroup))]
      .filter(group => group && String(group).trim() !== "0")
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

    groupSelect.innerHTML = `<option value="">Select a Group...</option>`;

    groups.forEach(group => {
      const option = document.createElement("option");
      option.value = group;
      option.textContent = group;
      groupSelect.appendChild(option);
    });
  }

  if (!studentSelect) return;

  const studentsMap = {};

  studentRows.forEach(row => {
    if (String(row.classgroup || "").trim() === "0") return;
    if (!studentsMap[row.studentid]) {
      studentsMap[row.studentid] = {
        studentid: row.studentid,
        username: row.username,
        classgroup: row.classgroup
      };
    }
  });

  const students = Object.values(studentsMap).sort((a, b) => {
    const groupCompare = String(a.classgroup).localeCompare(
      String(b.classgroup),
      undefined,
      { numeric: true }
    );

    if (groupCompare !== 0) return groupCompare;

    return String(a.username).localeCompare(String(b.username));
  });

  studentSelect.innerHTML = `<option value="">Select a Student...</option>`;

  let currentGroup = "";
  let optgroup = null;

  students.forEach(student => {
    if (student.classgroup !== currentGroup) {
      currentGroup = student.classgroup;
      optgroup = document.createElement("optgroup");
      optgroup.label = currentGroup;
      studentSelect.appendChild(optgroup);
    }

    const option = document.createElement("option");
    option.value = student.studentid;
    option.textContent = student.username;
    optgroup.appendChild(option);
  });
}

function openSelectedGroupProgress() {
  const groupSelect = getDomElement("progress-group-select");
  const group = groupSelect ? groupSelect.value : "";

  if (!group) {
    alert("Select a group first.");
    return;
  }

  openProgressContext("group", group);
}

function openSelectedStudentProgress() {
  const studentSelect = getDomElement("progress-student-select");
  const studentid = studentSelect ? studentSelect.value : "";

  if (!studentid) {
    alert("Select a student first.");
    return;
  }

  openProgressContext("student", studentid);
}

async function openProgressContext(type, value) {
  setProgressScreensForAdmin();
  progressState.fromAdminDashboard = false;
  progressState.contextType = type;
  progressState.subjectid = "ALL";
  progressState.taskid = "ALL";
  progressPendingUpdates = {};
  currentProgressRows = [];

  if (type === "class") {
    progressState.classgroup = "ALL";
    progressState.studentid = "ALL";
    setDomText("progress-subjects-title", "Class Modules");
    await loadProgressSubjects();
    return;
  }

  if (type === "group") {
    progressState.classgroup = value;
    progressState.studentid = "ALL";
    setDomText("progress-subjects-title", `${value} Modules`);
    await loadProgressSubjects();
    return;
  }

  if (type === "student") {
    progressState.classgroup = "ALL";
    progressState.studentid = value;
    progressState.subjectid = "ALL";
    progressState.taskid = "ALL";

    const studentSelect = getDomElement("progress-student-select");
    const selectedOption = studentSelect
      ? Array.from(studentSelect.options || []).find(option => String(option.value) === String(value))
      : null;

    const name = selectedOption ? selectedOption.textContent : "Student";

    progressState.studentName = name;
    setDomText("progress-subjects-title", `${name}'s Subjects`);

    await loadProgressSubjects();
    return;
  }

  console.warn("Unknown progress context:", type);
}

async function loadProgressSubjects() {
  setAdminProgressSectionBodyState("progress-subjects-screen");
  setManualRefreshButton("progress-subjects-screen", "refreshProgressSubjects(this)");

  if (!showScreen("progress-subjects-screen")) {
    console.warn("Progress subjects screen is missing.");
    return;
  }

  if (!setDomHtml("progress-subjects-list", `<p class="helper-text">Loading subjects...</p>`)) {
    console.warn("Missing progress-subjects-list container.");
    return;
  }

  try {
    const result = await apiPost("/api/progress/task-detail", {
      studentid: progressState.studentid,
      classgroup: progressState.classgroup,
      subjectid: "ALL",
      taskid: "ALL"
    }, state.token);

    if (!result.success) {
      setDomHtml("progress-subjects-list", `<p class="error-message">${escapeHtml(result.error || "Could not load modules.")}</p>`);
      return;
    }

    if (!result.subjects || result.subjects.length === 0) {
      setDomHtml("progress-subjects-list", `<p class="helper-text">No assigned modules found.</p>`);
      return;
    }

    const subjects = result.subjects.map(normalizeProgressSubject).sort(sortProgressSubjects);

    const subjectsList = getDomElement("progress-subjects-list");
    setDomHtml(subjectsList, subjects.map(subject => `
      <button
        type="button"
        class="progress-list-button"
        data-progress-action="open-progress-subject"
        data-subjectid="${escapeForAttribute(subject.subjectid)}"
        data-subjectname="${escapeForAttribute(subject.subjectname)}"
      >
        <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
        ${renderProgressBars(subject.completedPercent, subject.verifiedPercent)}
      </button>
    `).join(""));
    bindProgressUiHandlers(subjectsList);
  } catch (err) {
    console.error("Could not load progress modules:", err);
    setDomHtml("progress-subjects-list", `<p class="error-message">${escapeHtml(err.message || "Could not load modules.")}</p>`);
  }
}

async function openProgressSubject(subjectid, subjectname) {
  progressState.subjectid = subjectid;
  progressState.subjectname = subjectname;
  progressState.taskid = "ALL";

  if (progressState.contextType === "student") {
    setDomText("progress-task-students-title", subjectname);
    await loadIndividualStudentTaskList();
    return;
  }

  setDomText("progress-tasks-title", subjectname);

  await loadProgressTasks();
}

async function loadProgressTasks() {
  setAdminProgressSectionBodyState("progress-tasks-screen");
  setManualRefreshButton("progress-tasks-screen", "refreshProgressTasks(this)");

  if (!showScreen("progress-tasks-screen")) {
    console.warn("Progress tasks screen is missing.");
    return;
  }

  if (!setDomHtml("progress-tasks-list", `<p class="helper-text">Loading tasks...</p>`)) {
    console.warn("Missing progress-tasks-list container.");
    return;
  }

  try {
    const result = await apiPost("/api/progress/task-detail", {
      studentid: progressState.studentid,
      classgroup: progressState.classgroup,
      subjectid: progressState.subjectid,
      taskid: "ALL"
    }, state.token);

    if (!result.success) {
      setDomHtml("progress-tasks-list", `<p class="error-message">${escapeHtml(result.error || "Could not load tasks.")}</p>`);
      return;
    }

    if (!result.tasks || result.tasks.length === 0) {
      setDomHtml("progress-tasks-list", `<p class="helper-text">No tasks found.</p>`);
      return;
    }

    const sortedTasks = result.tasks.map(normalizeProgressTask).sort(sortProgressTasks);

    const tasksList = getDomElement("progress-tasks-list");
    setDomHtml(tasksList, sortedTasks.map(task => `
      <button
        type="button"
        class="progress-list-button"
        data-progress-action="open-progress-task"
        data-taskid="${escapeForAttribute(task.taskid)}"
        data-taskname="${escapeForAttribute(task.taskname)}"
      >
        <span class="progress-list-title">${escapeHtml(task.taskname)}</span>
        ${renderProgressBars(task.completedPercent, task.verifiedPercent)}
      </button>
    `).join(""));
    bindProgressUiHandlers(tasksList);
  } catch (err) {
    console.error("Could not load progress tasks:", err);
    setDomHtml("progress-tasks-list", `<p class="error-message">${escapeHtml(err.message || "Could not load tasks.")}</p>`);
  }
}

async function openProgressTask(taskid, taskname) {
  progressState.taskid = taskid;
  progressState.taskname = taskname;

  const title = progressState.contextType === "group"
    ? `${taskname} ${progressState.classgroup}`
    : taskname;

  setDomText("progress-task-students-title", title);

  await loadProgressTaskStudents();
}

async function loadProgressTaskStudents() {
  setAdminProgressSectionBodyState("progress-task-students-screen");
  setManualRefreshButton("progress-task-students-screen", "refreshProgressTaskStudents(this)");

  if (!showScreen("progress-task-students-screen")) {
    console.warn("Progress task-students screen is missing.");
    return;
  }

  progressPendingUpdates = {};

  if (!setDomHtml("progress-task-students-list", renderAdminProgressLoadingState("Loading students..."))) {
    console.warn("Missing progress-task-students-list container.");
    return;
  }

  try {
    const result = await apiPost("/api/progress/task-detail", {
      studentid: progressState.studentid,
      classgroup: progressState.classgroup,
      subjectid: progressState.subjectid,
      taskid: progressState.taskid
    }, state.token);

    if (!result.success) {
      const fallbackRows = getAdminFallbackRowsForActiveTask();

      if (fallbackRows.length > 0) {
        currentProgressRows = fallbackRows;
        renderProgressTaskStudents(currentProgressRows);
        return;
      }

      setDomHtml("progress-task-students-list", `<p class="error-message">${escapeHtml(result.error || "Could not load students.")}</p>`);
      return;
    }

    const apiRows = Array.isArray(result.students)
      ? result.students.map(normalizeProgressStudentRow)
      : [];

    let allSubjectRows = [];

    if (
      apiRows.length === 0 &&
      progressState.taskid &&
      progressState.taskid !== "ALL" &&
      progressState.subjectid &&
      progressState.subjectid !== "ALL"
    ) {
      const allSubjectResult = await apiPost("/api/progress/task-detail", {
        studentid: progressState.studentid,
        classgroup: progressState.classgroup,
        subjectid: "ALL",
        taskid: progressState.taskid
      }, state.token).catch(err => ({ success: false, error: err.message, students: [] }));

      allSubjectRows = allSubjectResult && allSubjectResult.success && Array.isArray(allSubjectResult.students)
        ? allSubjectResult.students.map(normalizeProgressStudentRow)
        : [];
    }

    const rows = apiRows.length > 0
      ? apiRows
      : (allSubjectRows.length > 0 ? allSubjectRows : getAdminFallbackRowsForActiveTask());

    if (rows.length === 0) {
      setDomHtml("progress-task-students-list", `<p class="helper-text">No student tasks found.</p>`);
      return;
    }

    currentProgressRows = rows;
    renderProgressTaskStudents(currentProgressRows);
  } catch (err) {
    const fallbackRows = getAdminFallbackRowsForActiveTask();

    if (fallbackRows.length > 0) {
      currentProgressRows = fallbackRows;
      renderProgressTaskStudents(currentProgressRows);
      return;
    }

    console.error("Could not load student progress rows:", err);
    setDomHtml("progress-task-students-list", `<p class="error-message">${escapeHtml(err.message || "Could not load students.")}</p>`);
  }
}

function renderAdminProgressTaskDetailStudentRow(row) {
  const pending = progressPendingUpdates[row.studenttaskid] || {};

  const completeStatus = pending.completeStatus !== undefined
    ? pending.completeStatus
    : row.completestatus;

  const verifyStatus = pending.verifyStatus !== undefined
    ? pending.verifyStatus
    : row.verifystatus;

  const isComplete = isStatusOn(completeStatus);
  const isVerified = isStatusOn(verifyStatus);
  const studentName = row.username || "Student";

  return `
    <div class="admin-progress-task-detail-row" role="row">
      <div class="admin-progress-task-detail-student-name" role="cell">${escapeHtml(studentName)}</div>

      <button
        type="button"
        class="admin-progress-status-control admin-progress-complete-control is-admin-complete-override${isComplete ? " is-on" : ""}"
        data-progress-action="toggle-progress-pending"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="completeStatus"
        data-value="${isComplete ? "false" : "true"}"
        aria-label="${isComplete ? "Mark incomplete" : "Mark complete"}: ${escapeForAttribute(studentName)}"
      >
        ${renderTaskStatusIndicator("complete", isComplete)}
      </button>

      <button
        type="button"
        class="admin-progress-status-control admin-progress-verify-control${isVerified ? " is-on" : ""}"
        data-progress-action="toggle-progress-pending"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="verifyStatus"
        data-value="${isVerified ? "false" : "true"}"
        aria-label="${isVerified ? "Mark unverified" : "Mark verified"}: ${escapeForAttribute(studentName)}"
      >
        ${renderTaskStatusIndicator("verify", isVerified)}
      </button>
    </div>
  `;
}

function renderProgressTaskStudents(rows) {
  const container = getDomElement("progress-task-students-list");
  if (!container) {
    console.warn("Missing progress-task-students-list container.");
    return;
  }

  container.classList.add("admin-progress-task-class-list", "admin-progress-task-detail-list");

  const byGroup = {};

  (Array.isArray(rows) ? rows : [])
    .map(normalizeProgressStudentRow)
    .filter(row => String(row.classgroup || "").trim() !== "0")
    .forEach(row => {
      const groupKey = String(row.classgroup || "Group");
      if (!byGroup[groupKey]) byGroup[groupKey] = [];
      byGroup[groupKey].push(row);
    });

  const groups = Object.keys(byGroup).sort((a, b) => {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });

  if (groups.length === 0) {
    setDomHtml(container, `<p class="helper-text">No student tasks found.</p>`);
    return;
  }

  const groupsHtml = groups.map(group => {
    const sortedRows = byGroup[group].sort((a, b) => {
      return String(a.username || "").localeCompare(String(b.username || ""), undefined, { numeric: true });
    });

    return `
      <section class="admin-progress-task-detail-group" aria-label="Group ${escapeForAttribute(group)}">
        <div class="admin-progress-task-detail-group-title">Group ${escapeHtml(group)}</div>
        <div class="admin-progress-task-detail-rows" role="table" aria-label="Group ${escapeForAttribute(group)} student task status">
          ${sortedRows.map(renderAdminProgressTaskDetailStudentRow).join("")}
        </div>
      </section>
    `;
  }).join("");

  setDomHtml(container, `
    <div class="admin-progress-task-detail-stack">
      ${groupsHtml}
    </div>
  `);

  bindProgressUiHandlers(container);
}


async function saveAdminProgressTaskChanges(button) {
  const saveButton = button || document.querySelector("#progress-task-students-screen .admin-progress-task-save");
  const originalText = saveButton ? saveButton.innerText : "Save";
  const pendingCount = Object.keys(progressPendingUpdates || {}).length;

  if (pendingCount === 0) {
    if (saveButton) {
      saveButton.innerText = "Saved";
      window.setTimeout(() => {
        saveButton.innerText = originalText;
      }, 900);
    }
    return false;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.innerText = "Saving...";
  }

  const saved = await saveProgressPendingChanges({ reload: false, alert: false });

  if (saved) {
    clearAdminProgressDashboardCache();
    await loadProgressTaskStudents();
    refreshAdminProgressDashboardCacheInBackground({ render: false });
  }

  if (saveButton) {
    saveButton.disabled = false;
    saveButton.innerText = saved ? "Saved" : originalText;

    if (saved) {
      window.setTimeout(() => {
        saveButton.innerText = originalText;
      }, 900);
    }
  }

  return saved;
}

function getAdminProgressGroupSwipeTrack() {
  return document.querySelector("#progress-task-students-screen [data-admin-progress-group-swipe-track]");
}

function getAdminProgressGroupSwipePanels(track) {
  const targetTrack = track || getAdminProgressGroupSwipeTrack();

  if (!targetTrack || !targetTrack.children) {
    return [];
  }

  return Array.from(targetTrack.children).filter(child => {
    return child &&
      child.matches &&
      child.matches("[data-admin-progress-group-panel], .admin-progress-group-container");
  });
}

function getAdminProgressGroupActiveIndex(track) {
  const targetTrack = track || getAdminProgressGroupSwipeTrack();

  if (!targetTrack) {
    return 0;
  }

  const panels = getAdminProgressGroupSwipePanels(targetTrack);

  if (panels.length <= 1) {
    return 0;
  }

  if ((targetTrack.scrollWidth || 0) <= (targetTrack.clientWidth || 0) + 2) {
    return 0;
  }

  const firstPanel = panels[0];
  const secondPanel = panels[1];
  let step = targetTrack.clientWidth || 1;

  if (firstPanel && secondPanel) {
    const firstRect = firstPanel.getBoundingClientRect();
    const secondRect = secondPanel.getBoundingClientRect();
    const measuredStep = Math.abs(secondRect.left - firstRect.left);

    if (measuredStep > 1) {
      step = measuredStep;
    }
  }

  const index = Math.round((targetTrack.scrollLeft || 0) / step);
  return Math.max(0, Math.min(panels.length - 1, index));
}

function updateAdminProgressGroupSwipeDots() {
  const screen = document.getElementById("progress-task-students-screen");
  const track = getAdminProgressGroupSwipeTrack();

  if (!screen || !track) {
    return false;
  }

  const dots = Array.from(screen.querySelectorAll("[data-admin-progress-group-swipe-dots] [data-progress-group-index]"));

  if (!dots.length) {
    return false;
  }

  const activeIndex = getAdminProgressGroupActiveIndex(track);

  dots.forEach((dot, fallbackIndex) => {
    const dotIndex = Number(dot.dataset.progressGroupIndex || fallbackIndex || 0);
    const isActive = dotIndex === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });

  return true;
}

function scrollAdminProgressGroupToIndex(groupIndex, options = {}) {
  const track = getAdminProgressGroupSwipeTrack();
  const panels = getAdminProgressGroupSwipePanels(track);
  const index = Number(groupIndex || 0);

  if (!track || !panels[index]) {
    return false;
  }

  panels[index].scrollIntoView({
    behavior: options.behavior || "smooth",
    block: "nearest",
    inline: "start"
  });

  updateAdminProgressGroupSwipeDots();

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(updateAdminProgressGroupSwipeDots);
  } else {
    window.setTimeout(updateAdminProgressGroupSwipeDots, 0);
  }

  return true;
}

function renderAdminProgressGroupSwipeDots(groups) {
  const list = Array.isArray(groups) ? groups : [];

  if (list.length <= 1) {
    return "";
  }

  return `
    <div class="admin-progress-group-swipe-dots" data-admin-progress-group-swipe-dots aria-label="Class groups">
      ${list.map((group, index) => `
        <button
          type="button"
          class="admin-progress-group-swipe-dot${index === 0 ? " is-active" : ""}"
          data-progress-action="scroll-admin-progress-group"
          data-progress-group-index="${index}"
          aria-label="Show Group ${escapeForAttribute(group)}"
          aria-current="${index === 0 ? "true" : "false"}"
        ></button>
      `).join("")}
    </div>
  `;
}

function bindAdminProgressGroupSwipeControls() {
  const track = getAdminProgressGroupSwipeTrack();

  if (!track) {
    return false;
  }

  if (track.dataset.adminProgressGroupSwipeBound !== "true") {
    track.dataset.adminProgressGroupSwipeBound = "true";
    let pendingFrame = 0;

    track.addEventListener("scroll", () => {
      if (pendingFrame) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        updateAdminProgressGroupSwipeDots();
      });
    }, { passive: true });
  }

  window.setTimeout(updateAdminProgressGroupSwipeDots, 0);
  return true;
}

function updateProgressRowsStatusInMemory(studenttaskid, field, value) {
  const id = String(studenttaskid || "");
  if (!id || !field) return false;

  let updated = false;
  [
    currentProgressRows,
    adminProgressActiveTaskRows,
    adminProgressDashboardRows,
    adminProgressPopoutRows,
    adminProgressIndividualRows,
    adminProgressIndividualSelectedRows
  ].forEach(collection => {
    if (!Array.isArray(collection)) return;
    collection.forEach(row => {
      if (String(row.studenttaskid || "") === id) {
        row[field.toLowerCase ? field.toLowerCase() : field] = value ? "YES" : "";
        row[field] = value ? "YES" : "";
        updated = true;
      }
    });
  });

  return updated;
}

function updateAdminProgressStatusControls(studenttaskid, field, value, actionName) {
  const type = field === "verifyStatus" ? "verify" : "complete";
  const controls = Array.from(document.querySelectorAll(`[data-progress-action="${actionName}"][data-field="${field}"]`))
    .filter(control => String(control.dataset.studenttaskid || "") === String(studenttaskid || ""));

  controls.forEach(control => {
    const currentLabel = control.getAttribute("aria-label") || "";
    const labelSuffix = currentLabel.includes(":")
      ? `: ${currentLabel.split(":").slice(1).join(":").trim()}`
      : "";

    control.dataset.value = value ? "false" : "true";
    control.classList.toggle("is-on", !!value);
    control.innerHTML = renderTaskStatusIndicator(type, !!value);

    if (field === "verifyStatus") {
      control.setAttribute("aria-label", `${value ? "Mark unverified" : "Mark verified"}${labelSuffix}`);
    } else {
      control.setAttribute("aria-label", `${value ? "Mark incomplete" : "Mark complete"}${labelSuffix}`);
    }
  });

  return controls.length > 0;
}


function renderAdminProgressStudentTaskRow(row) {
  const pending = progressPendingUpdates[row.studenttaskid] || {};

  const completeStatus = pending.completeStatus !== undefined
    ? pending.completeStatus
    : row.completestatus;

  const verifyStatus = pending.verifyStatus !== undefined
    ? pending.verifyStatus
    : row.verifystatus;

  const isComplete = isStatusOn(completeStatus);
  const isVerified = isStatusOn(verifyStatus);

  return `
    <div class="student-status-row admin-progress-student-row">
      <button
        type="button"
        class="admin-progress-student-name-button"
        data-progress-action="open-admin-progress-student-popout"
        data-studentid="${escapeForAttribute(row.studentid)}"
        data-username="${escapeForAttribute(row.username || "Student")}">
        ${escapeHtml(row.username || "Student")}
      </button>

      <div
        class="status-action task-status-control admin-progress-status-control admin-progress-complete-control is-admin-complete-override${isComplete ? " is-on" : ""}"
        role="button"
        tabindex="0"
        data-progress-action="toggle-progress-pending"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="completeStatus"
        data-value="${isComplete ? "false" : "true"}"
        aria-label="${isComplete ? "Mark incomplete" : "Mark complete"}: ${escapeForAttribute(row.username || "Student")}">
        ${renderTaskStatusIndicator("complete", isComplete)}
      </div>

      <div
        class="status-action task-status-control admin-progress-status-control admin-progress-verify-control${isVerified ? " is-on" : ""}"
        role="button"
        tabindex="0"
        data-progress-action="toggle-progress-pending"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="verifyStatus"
        data-value="${isVerified ? "false" : "true"}"
        aria-label="${isVerified ? "Mark unverified" : "Mark verified"}: ${escapeForAttribute(row.username || "Student")}">
        ${renderTaskStatusIndicator("verify", isVerified)}
      </div>
    </div>
  `;
}

function ensureAdminProgressStudentPopout() {
  let popout = document.getElementById("admin-progress-student-popout");
  if (popout) {
    bindProgressUiHandlers(popout);
    const panel = popout.querySelector(".admin-progress-popout-panel");
    return popout;
  }

  const host = document.getElementById("progress-task-students-screen") || document.body;
  host.insertAdjacentHTML("beforeend", `
    <div id="admin-progress-student-popout" class="admin-progress-student-popout hidden" aria-hidden="true">
      <div class="admin-progress-popout-backdrop" aria-hidden="true"></div>
      <section class="admin-progress-popout-panel" role="dialog" aria-modal="true" aria-labelledby="admin-progress-popout-title">
        <div class="admin-progress-popout-header">
          <button type="button" class="small-btn admin-progress-close-btn admin-progress-popout-close" data-progress-action="close-admin-progress-student-popout" aria-label="Close student progress" title="Close">×</button>
          <h3 id="admin-progress-popout-title">Student Progress</h3>
        </div>
        <div id="admin-progress-popout-content" class="admin-progress-popout-content">
          <p class="helper-text">Loading student progress...</p>
        </div>
      </section>
    </div>
  `);

  popout = document.getElementById("admin-progress-student-popout");
  bindProgressUiHandlers(popout);
  const panel = popout ? popout.querySelector(".admin-progress-popout-panel") : null;
  return popout;
}

async function openAdminProgressStudentPopout(studentid, username) {
  if (!studentid) {
    alert("Student details are missing.");
    return;
  }

  const popout = ensureAdminProgressStudentPopout();
  if (!popout) return;

  progressState.activePopoutStudentId = studentid;
  progressState.activePopoutStudentName = username || "Student";

  popout.classList.remove("hidden");
  popout.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-progress-popout-open");
  setDomText("admin-progress-popout-title", progressState.activePopoutStudentName);
  setDomHtml("admin-progress-popout-content", `<p class="helper-text">Loading student progress...</p>`);

  await loadAdminStudentProgressPopout(studentid, username);
}

async function loadAdminStudentProgressPopout(studentid, username) {
  const content = getDomElement("admin-progress-popout-content");
  if (!content) return;

  try {
    const result = await apiPost("/api/progress/task-detail", {
      studentid,
      classgroup: "ALL",
      subjectid: "ALL",
      taskid: "ALL"
    }, state.token);

    if (!result.success) {
      setDomHtml(content, `<p class="error-message">${escapeHtml(result.error || "Could not load student progress.")}</p>`);
      return;
    }

    const rows = Array.isArray(result.students)
      ? result.students.map(normalizeProgressStudentRow)
      : [];

    adminProgressPopoutRows = rows;
    renderAdminStudentProgressPopout(rows, username);
  } catch (err) {
    console.error("Could not load admin student progress popout:", err);
    setDomHtml(content, `<p class="error-message">${escapeHtml(err.message || "Could not load student progress.")}</p>`);
  }
}

function renderAdminStudentProgressPopout(rows, username) {
  const content = getDomElement("admin-progress-popout-content");
  if (!content) return;

  const byModule = {};

  (Array.isArray(rows) ? rows : [])
    .map(normalizeProgressStudentRow)
    .filter(row => String(row.classgroup || "").trim() !== "0")
    .sort(sortByModuleThenTask)
    .forEach(row => {
      const moduleKey = getAdminModuleKey(row);
      if (!byModule[moduleKey]) {
        byModule[moduleKey] = {
          moduleid: row.moduleid || row.subjectid || moduleKey,
          modulename: getAdminModuleName(row),
          rows: []
        };
      }
      byModule[moduleKey].rows.push(row);
    });

  const modules = Object.values(byModule).sort(sortModuleGroupsByModuleId);

  if (modules.length === 0) {
    setDomHtml(content, `<p class="helper-text">No tasks assigned to this student.</p>`);
    return;
  }

  const panelsHtml = modules.map((module, index) => `
    <section
      class="admin-progress-popout-module"
      data-admin-popout-module-panel
      data-progress-module-index="${index}"
      aria-label="${escapeForAttribute(module.modulename || "Module")}">
      <div class="admin-progress-popout-module-title">${escapeHtml(module.modulename || "Module")}</div>
      <div class="admin-progress-popout-task-list">
        ${module.rows.sort(sortByModuleThenTask).map(renderAdminStudentProgressPopoutRow).join("")}
      </div>
    </section>
  `).join("");

  const html = `
    <div class="admin-progress-popout-swipe-shell" data-admin-popout-module-swipe-shell>
      ${renderAdminProgressPopoutModuleSwipeDots(modules)}
      <div class="admin-progress-popout-module-track" data-admin-popout-module-swipe-track aria-label="${escapeForAttribute(username || "Student")} progress modules">
        ${panelsHtml}
      </div>
    </div>
  `;

  setDomHtml(content, html);
  bindProgressUiHandlers(content);
  bindAdminProgressPopoutModuleSwipeControls();
}

function getAdminProgressPopoutModuleSwipeTrack() {
  return document.querySelector("#admin-progress-student-popout [data-admin-popout-module-swipe-track]");
}

function getAdminProgressPopoutModulePanels(track) {
  const targetTrack = track || getAdminProgressPopoutModuleSwipeTrack();

  if (!targetTrack || !targetTrack.children) {
    return [];
  }

  return Array.from(targetTrack.children).filter(child => {
    return child &&
      child.matches &&
      child.matches("[data-admin-popout-module-panel], .admin-progress-popout-module");
  });
}

function getAdminProgressPopoutModuleActiveIndex(track) {
  const targetTrack = track || getAdminProgressPopoutModuleSwipeTrack();

  if (!targetTrack) {
    return 0;
  }

  const panels = getAdminProgressPopoutModulePanels(targetTrack);

  if (panels.length <= 1) {
    return 0;
  }

  if ((targetTrack.scrollWidth || 0) <= (targetTrack.clientWidth || 0) + 2) {
    return 0;
  }

  const firstPanel = panels[0];
  const secondPanel = panels[1];
  let step = targetTrack.clientWidth || 1;

  if (firstPanel && secondPanel) {
    const firstRect = firstPanel.getBoundingClientRect();
    const secondRect = secondPanel.getBoundingClientRect();
    const measuredStep = Math.abs(secondRect.left - firstRect.left);

    if (measuredStep > 1) {
      step = measuredStep;
    }
  }

  const index = Math.round((targetTrack.scrollLeft || 0) / step);
  return Math.max(0, Math.min(panels.length - 1, index));
}

function updateAdminProgressPopoutModuleSwipeDots() {
  const popout = document.getElementById("admin-progress-student-popout");
  const track = getAdminProgressPopoutModuleSwipeTrack();

  if (!popout || !track) {
    return false;
  }

  const dots = Array.from(popout.querySelectorAll("[data-admin-popout-module-swipe-dots] [data-progress-module-index]"));

  if (!dots.length) {
    return false;
  }

  const activeIndex = getAdminProgressPopoutModuleActiveIndex(track);

  dots.forEach((dot, fallbackIndex) => {
    const dotIndex = Number(dot.dataset.progressModuleIndex || fallbackIndex || 0);
    const isActive = dotIndex === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });

  return true;
}

function scrollAdminProgressPopoutModuleToIndex(moduleIndex, options = {}) {
  const track = getAdminProgressPopoutModuleSwipeTrack();
  const panels = getAdminProgressPopoutModulePanels(track);
  const index = Number(moduleIndex || 0);

  if (!track || !panels[index]) {
    return false;
  }

  panels[index].scrollIntoView({
    behavior: options.behavior || "smooth",
    block: "nearest",
    inline: "start"
  });

  updateAdminProgressPopoutModuleSwipeDots();

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(updateAdminProgressPopoutModuleSwipeDots);
  } else {
    window.setTimeout(updateAdminProgressPopoutModuleSwipeDots, 0);
  }

  return true;
}

function renderAdminProgressPopoutModuleSwipeDots(modules) {
  const list = Array.isArray(modules) ? modules : [];

  if (list.length <= 1) {
    return "";
  }

  return `
    <div class="admin-progress-popout-module-dots" data-admin-popout-module-swipe-dots aria-label="Student progress modules">
      ${list.map((module, index) => `
        <button
          type="button"
          class="admin-progress-popout-module-dot${index === 0 ? " is-active" : ""}"
          data-progress-action="scroll-admin-popout-module"
          data-progress-module-index="${index}"
          aria-label="Show ${escapeForAttribute(module.modulename || `module ${index + 1}`)}"
          aria-current="${index === 0 ? "true" : "false"}"
        ></button>
      `).join("")}
    </div>
  `;
}

function bindAdminProgressPopoutModuleSwipeControls() {
  const track = getAdminProgressPopoutModuleSwipeTrack();

  if (!track) {
    return false;
  }

  if (track.dataset.adminPopoutModuleSwipeBound !== "true") {
    track.dataset.adminPopoutModuleSwipeBound = "true";
    let pendingFrame = 0;

    track.addEventListener("scroll", () => {
      if (pendingFrame) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        updateAdminProgressPopoutModuleSwipeDots();
      });
    }, { passive: true });
  }

  window.setTimeout(updateAdminProgressPopoutModuleSwipeDots, 0);
  return true;
}

function renderAdminStudentProgressPopoutRow(row) {
  const pending = progressPendingUpdates[row.studenttaskid] || {};

  const completeStatus = pending.completeStatus !== undefined
    ? pending.completeStatus
    : row.completestatus;

  const verifyStatus = pending.verifyStatus !== undefined
    ? pending.verifyStatus
    : row.verifystatus;

  const isComplete = isStatusOn(completeStatus);
  const isVerified = isStatusOn(verifyStatus);

  return `
    <div class="student-status-row admin-progress-popout-task-row">
      <div class="student-status-name admin-progress-popout-task-name">${escapeHtml(row.taskname || "Untitled Task")}</div>

      <div
        class="status-action task-status-control admin-progress-status-control admin-progress-complete-control is-admin-complete-override${isComplete ? " is-on" : ""}"
        role="button"
        tabindex="0"
        data-progress-action="toggle-progress-pending-popout"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="completeStatus"
        data-value="${isComplete ? "false" : "true"}"
        aria-label="${isComplete ? "Mark incomplete" : "Mark complete"}: ${escapeForAttribute(row.taskname || "Task")}">
        ${renderTaskStatusIndicator("complete", isComplete)}
      </div>

      <div
        class="status-action task-status-control admin-progress-status-control admin-progress-verify-control${isVerified ? " is-on" : ""}"
        role="button"
        tabindex="0"
        data-progress-action="toggle-progress-pending-popout"
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
        data-field="verifyStatus"
        data-value="${isVerified ? "false" : "true"}"
        aria-label="${isVerified ? "Mark unverified" : "Mark verified"}: ${escapeForAttribute(row.taskname || "Task")}">
        ${renderTaskStatusIndicator("verify", isVerified)}
      </div>
    </div>
  `;
}

function toggleProgressPendingForAdminPopout(studenttaskid, field, value) {
  if (!studenttaskid) return;

  if (!progressPendingUpdates[studenttaskid]) {
    progressPendingUpdates[studenttaskid] = { studenttaskid };
  }

  progressPendingUpdates[studenttaskid][field] = value ? "YES" : "";
  updateProgressRowsStatusInMemory(studenttaskid, field, value);

  const updatedInPlace = updateAdminProgressStatusControls(
    studenttaskid,
    field,
    value,
    "toggle-progress-pending-popout"
  );

  if (!updatedInPlace) {
    renderAdminStudentProgressPopout(adminProgressPopoutRows, progressState.activePopoutStudentName);
  }
}

function closeAdminProgressStudentPopout(options = {}) {
  const popout = document.getElementById("admin-progress-student-popout");
  if (!popout) return false;

  popout.classList.add("hidden");
  popout.setAttribute("aria-hidden", "true");
  document.body.classList.remove("admin-progress-popout-open");
  progressState.activePopoutStudentId = "";
  progressState.activePopoutStudentName = "";
  adminProgressPopoutRows = [];

  if (!options.silent && Array.isArray(currentProgressRows) && currentProgressRows.length > 0) {
    renderProgressTaskStudents(currentProgressRows);
  }

  return true;
}

async function saveAdminProgressPopoutChanges(button) {
  const saveButton = button || document.querySelector("#admin-progress-student-popout .admin-progress-popout-save");
  const originalText = saveButton ? saveButton.innerText : "Save";
  const pendingCount = Object.keys(progressPendingUpdates || {}).length;

  if (pendingCount === 0) {
    if (saveButton) {
      saveButton.innerText = "Saved";
      window.setTimeout(() => {
        saveButton.innerText = originalText;
      }, 900);
    }
    return false;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.innerText = "Saving...";
  }

  const studentid = progressState.activePopoutStudentId;
  const username = progressState.activePopoutStudentName;
  const saved = await saveProgressPendingChanges({ reload: false, alert: false });

  if (saved) {
    clearAdminProgressDashboardCache();
    await loadProgressTaskStudents();
    refreshAdminProgressDashboardCacheInBackground({ render: false });
    if (studentid) {
      await openAdminProgressStudentPopout(studentid, username);
    }
  }

  if (saveButton) {
    saveButton.disabled = false;
    saveButton.innerText = saved ? "Saved" : originalText;

    if (saved) {
      window.setTimeout(() => {
        saveButton.innerText = originalText;
      }, 900);
    }
  }

  return saved;
}

async function loadIndividualStudentTaskList() {
  await openAdminIndividualStudentDetail(progressState.studentid, progressState.studentName || "Student");
}

function renderIndividualStudentTaskList(rows) {
  const container = getDomElement("progress-task-students-list");
  if (!container) {
    console.warn("Missing progress-task-students-list container.");
    return;
  }

  const bySubject = {};

  (Array.isArray(rows) ? rows : [])
    .map(normalizeProgressStudentRow)
    .filter(row => String(row.classgroup || "").trim() !== "0")
    .sort(sortBySubjectIdThenTask)
    .forEach(row => {
      const subjectKey = row.subjectid || row.subjectname || "Other";
      const moduleKey = row.moduleid || row.modulename || "General";

      if (!bySubject[subjectKey]) {
        bySubject[subjectKey] = {
          subjectid: row.subjectid || subjectKey,
          subjectname: row.subjectname || "Other",
          modules: {}
        };
      }

      if (!bySubject[subjectKey].modules[moduleKey]) {
        bySubject[subjectKey].modules[moduleKey] = {
          moduleid: row.moduleid || moduleKey,
          modulename: row.modulename || "General",
          rows: []
        };
      }

      bySubject[subjectKey].modules[moduleKey].rows.push(row);
    });

  let html = "";
  const subjects = Object.values(bySubject).sort(sortSubjectGroupsBySubjectId);

  if (subjects.length === 0) {
    setDomHtml(container, `<p class="helper-text">No tasks assigned to this student.</p>`);
    return;
  }

  subjects.forEach((subject, subjectIndex) => {
    if (progressState.subjectid === "ALL") {
      if (subjectIndex > 0) {
        html += `<div class="group-separator-line" aria-hidden="true"></div>`;
      }
      html += `<div class="subject-heading-thin">${escapeHtml(subject.subjectname)}</div>`;
    }

    Object.values(subject.modules).sort(sortModuleGroupsByModuleId).forEach(moduleGroup => {
      html += `<div class="task-resource-heading">${escapeHtml(moduleGroup.modulename || "General")}</div>`;
      html += renderTaskStatusHeader("Student", "Muallimah", { firstMuted: true });

      moduleGroup.rows.sort(sortBySubjectIdThenTask).forEach(row => {
        const pending = progressPendingUpdates[row.studenttaskid] || {};

        const completeStatus = pending.completeStatus !== undefined
          ? pending.completeStatus
          : row.completestatus;

        const verifyStatus = pending.verifyStatus !== undefined
          ? pending.verifyStatus
          : row.verifystatus;

        const isComplete = isStatusOn(completeStatus);
        const isVerified = isStatusOn(verifyStatus);

        html += `
          <div class="student-status-row">
            <div class="student-status-name">${escapeHtml(row.taskname)}</div>

            <div
            class="status-action task-status-control admin-progress-complete-control is-admin-complete-override"
            role="button"
            tabindex="0"
            data-progress-action="toggle-progress-pending"
            data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
            data-field="completeStatus"
            data-value="${isComplete ? "false" : "true"}"
          >
              ${renderTaskStatusIndicator("complete", isComplete, { muted: !isComplete })}
            </div>

            <div
            class="status-action task-status-control"
            role="button"
            tabindex="0"
            data-progress-action="toggle-progress-pending"
            data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"
            data-field="verifyStatus"
            data-value="${isVerified ? "false" : "true"}"
          >
              ${renderTaskStatusIndicator("verify", isVerified)}
            </div>
          </div>
        `;
      });
    });
  });

  setDomHtml(container, html);
  bindProgressUiHandlers(container);
}

function toggleProgressPending(studenttaskid, field, value) {
  if (!studenttaskid) return;

  if (!progressPendingUpdates[studenttaskid]) {
    progressPendingUpdates[studenttaskid] = {
      studenttaskid
    };
  }

  progressPendingUpdates[studenttaskid][field] = value ? "YES" : "";
  updateProgressRowsStatusInMemory(studenttaskid, field, value);

  const updatedInPlace = updateAdminProgressStatusControls(
    studenttaskid,
    field,
    value,
    "toggle-progress-pending"
  );

  if (!updatedInPlace) {
    if (progressState.contextType === "student") {
      renderIndividualStudentTaskList(currentProgressRows);
    } else {
      renderProgressTaskStudents(currentProgressRows);
    }
  }
}

async function saveProgressPendingChanges(options = {}) {
  const shouldReload = options.reload !== false;
  const shouldAlert = options.alert !== false;

  const updates = Object.values(progressPendingUpdates);

  if (updates.length === 0) {
    if (shouldAlert) {
      alert("No changes to save.");
    }
    return false;
  }

  for (const update of updates) {
    if (update.completeStatus !== undefined) {
      const completeResult = await apiPost("/api/tasks/update-complete", {
        studenttaskid: update.studenttaskid,
        complete: update.completeStatus !== ""
      }, state.token);

      if (!completeResult.success) {
        if (shouldAlert) {
          alert(completeResult.error || "Could not save completion update.");
        }
        return false;
      }
    }

    if (update.verifyStatus !== undefined) {
      const verifyResult = await apiPost("/api/admin/tasks/verify", {
        studenttaskid: update.studenttaskid,
        verified: update.verifyStatus !== ""
      }, state.token);

      if (!verifyResult.success) {
        if (shouldAlert) {
          alert(verifyResult.error || "Could not save verification update.");
        }
        return false;
      }
    }
  }

  progressPendingUpdates = {};

  if (shouldAlert) {
    alert("Changes saved.");
  }

  if (shouldReload) {
    if (progressState.contextType === "student") {
      await loadIndividualStudentTaskList();
    } else {
      await loadProgressTaskStudents();
    }
  }

  return true;
}

async function saveProgressPendingChangesAndReturn() {
  const button = document.querySelector("#progress-task-students-screen .small-btn");
  const originalText = button ? button.innerText : "Save and Exit";

  if (button) {
    button.disabled = true;
    button.innerText = "Saving...";
  }

  const saved = await saveProgressPendingChanges({ reload: false, alert: false });

  if (button) {
    button.disabled = false;
    button.innerText = originalText;
  }

  if (!saved && Object.keys(progressPendingUpdates).length > 0) {
    return;
  }

  if (progressState.contextType === "student") {
    showScreen("progress-subjects-screen");
  } else if (progressState.fromAdminDashboard === true) {
    await showProgressReport();
  } else {
    showScreen("progress-tasks-screen");
  }
}

async function saveStudentProgressSwipeChanges(button) {
  const saveButton = button || document.querySelector("#progress-subjects-screen .student-progress-save-btn");
  const originalText = saveButton ? saveButton.innerText : "Save";
  const pendingCount = Object.keys(progressPendingUpdates || {}).length;

  if (pendingCount === 0) {
    if (saveButton) {
      saveButton.innerText = "Saved";
      window.setTimeout(() => {
        saveButton.innerText = originalText;
      }, 900);
    }
    return false;
  }

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.innerText = "Saving...";
  }

  const saved = await saveProgressPendingChanges({ reload: false, alert: false });

  if (saveButton) {
    saveButton.disabled = false;
    saveButton.innerText = saved ? "Saved" : originalText;

    if (saved) {
      window.setTimeout(() => {
        saveButton.innerText = originalText;
      }, 900);
    }
  }

  return saved;
}

async function saveStudentTaskChangesAndReturn() {
  const button = document.querySelector("#progress-tasks-screen .student-progress-save-btn, #progress-tasks-screen .small-btn");
  const originalText = button ? button.innerText : "Save and Exit";

  if (button) {
    button.disabled = true;
    button.innerText = "Saving...";
  }

  const saved = await saveProgressPendingChanges({ reload: false, alert: false });

  if (button) {
    button.disabled = false;
    button.innerText = originalText;
  }

  if (!saved && Object.keys(progressPendingUpdates).length > 0) {
    return;
  }

  progressPendingUpdates = {};
  showStudentTasks();
}



/* =========================
   HELPERS
========================= */
/* setAuthTheme now lives in app.js with the shared startup helpers. */

function groupTasksBySubject(tasks) {
  const grouped = {};

  tasks.forEach(task => {
    const subjectName = task.subjectname || "Other";

    if (!grouped[subjectName]) {
      grouped[subjectName] = [];
    }

    grouped[subjectName].push(task);
  });

  Object.keys(grouped).forEach(subjectName => {
    grouped[subjectName].sort(sortByTaskId);
  });

  return grouped;
}

function naturalCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function getTaskSubjectId(task) {
  return task.subjectid || task.subjectID || task.SubjectID || task.SubjectId || "";
}

function getTaskModuleId(task) {
  return task.moduleid || task.moduleID || task.ModuleID || task.ModuleId || "";
}

function sortSubjectGroupsBySubjectId(a, b) {
  const subjectCompare = naturalCompare(a.subjectid || a.subjectname, b.subjectid || b.subjectname);
  if (subjectCompare !== 0) return subjectCompare;
  return naturalCompare(a.subjectname, b.subjectname);
}

function sortModuleGroupsByModuleId(a, b) {
  const moduleCompare = naturalCompare(a.moduleid || a.modulename, b.moduleid || b.modulename);
  if (moduleCompare !== 0) return moduleCompare;
  return naturalCompare(a.modulename, b.modulename);
}

function sortBySubjectIdThenTask(a, b) {
  const subjectCompare = naturalCompare(getTaskSubjectId(a), getTaskSubjectId(b));
  if (subjectCompare !== 0) return subjectCompare;
  return sortByTaskId(a, b);
}

function sortByModuleThenTask(a, b) {
  const moduleCompare = naturalCompare(getTaskModuleId(a), getTaskModuleId(b));
  if (moduleCompare !== 0) return moduleCompare;
  return sortByTaskId(a, b);
}

function sortByTaskId(a, b) {
  const aRaw = a.taskid || a.taskID || a.TaskID || a.TaskId || "";
  const bRaw = b.taskid || b.taskID || b.TaskID || b.TaskId || "";

  const idCompare = naturalCompare(aRaw, bRaw);
  if (idCompare !== 0) return idCompare;

  return naturalCompare(a.taskname || a.TaskName || "", b.taskname || b.TaskName || "");
}

function isStatusOn(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return text === "yes" || text === "true" || text === "complete" || text === "verified" || text === "1";
}

function renderCompleteProgressBar(completedPercent) {
  const completeWidth = Math.max(0, Math.min(100, Number(completedPercent) || 0));

  return `
    <span class="progress-bars">
      <span class="progress-bar-row">
        <span class="progress-bar-label">Complete</span>
        <span class="progress-track">
          <span class="progress-fill progress-fill-complete" style="width:${completeWidth}%"></span>
        </span>
      </span>
    </span>
  `;
}

function renderProgressBars(completedPercent, verifiedPercent) {
  const completeWidth = Math.max(0, Math.min(100, Number(completedPercent) || 0));
  const verifiedWidth = Math.max(0, Math.min(100, Number(verifiedPercent) || 0));

  return `
    <span class="progress-bars">
      <span class="progress-bar-row">
        <span class="progress-bar-label">Complete</span>
        <span class="progress-track">
          <span class="progress-fill progress-fill-complete" style="width:${completeWidth}%"></span>
        </span>
      </span>

      <span class="progress-bar-row">
        <span class="progress-bar-label">Verified</span>
        <span class="progress-track">
          <span class="progress-fill progress-fill-verified" style="width:${verifiedWidth}%"></span>
        </span>
      </span>
    </span>
  `;
}

function renderTaskLinks(task) {
  const links = [];

  if (task.pdflink) {
    links.push(`<a href="${escapeHtml(task.pdflink)}" target="_blank">PDF</a>`);
  }

  if (task.audiolink) {
    links.push(`<a href="${escapeHtml(task.audiolink)}" target="_blank">Audio</a>`);
  }

  if (task.videolink) {
    links.push(`<a href="${escapeHtml(task.videolink)}" target="_blank">Video</a>`);
  }

  if (task.visuallink) {
    links.push(`<a href="${escapeHtml(task.visuallink)}" target="_blank">Visual</a>`);
  }

  if (links.length === 0) {
    return "";
  }

  return `
    <div class="task-meta" style="margin-top:10px;">
      Resources: ${links.join(" · ")}
    </div>
  `;
}

function normalizeClientText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function escapeForAttribute(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll('"', "&quot;");
}

/* escapeHtml is provided by app.js. */


/* =========================
   MANUAL REFRESH BUTTONS
========================= */

function getRefreshIconMarkup() {
  return `
    <span class="app-icon app-icon-large manual-refresh-btn__icon" style="--app-icon-url: url('/icons/refresh.svg')" aria-hidden="true"></span>
    <span class="visually-hidden">Refresh</span>
  `;
}

function getManualRefreshButtonMarkup(onclickValue) {
  return "";
}

function setManualRefreshButton(screenId, handlerName) {
  const screen = document.getElementById(screenId);
  if (!screen) return;

  screen.querySelectorAll(".manual-refresh-btn").forEach(button => button.remove());
}

function hasUnsavedProgressChanges() {
  return !!(typeof progressPendingUpdates !== "undefined" && Object.keys(progressPendingUpdates || {}).length > 0);
}

function confirmRefreshIfUnsaved() {
  if (!hasUnsavedProgressChanges()) {
    return true;
  }

  return confirm("You have unsaved changes. Refreshing will discard them. Continue?");
}

async function runManualRefresh(button, callback) {
  const refreshButton = button?.closest
    ? button.closest(".manual-refresh-btn")
    : button || event?.target?.closest?.(".manual-refresh-btn") || event?.target;

  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.classList.add("is-refreshing");
  }

  try {
    await callback();
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.classList.remove("is-refreshing");
    }
  }
}

async function refreshStudentTaskProgress(button) {
  if (!confirmRefreshIfUnsaved()) return;

  await runManualRefresh(button, async () => {
    progressPendingUpdates = {};
    await showStudentTasks();
  });
}

async function refreshStudentModuleTaskList(button) {
  if (!confirmRefreshIfUnsaved()) return;

  const previousModuleKey = currentStudentSubjectKey;

  await runManualRefresh(button, async () => {
    progressPendingUpdates = {};
    await showStudentTasks();

    if (previousModuleKey && studentSubjectTaskGroups && studentSubjectTaskGroups[previousModuleKey]) {
      openStudentSubjectTasks(previousModuleKey);
    }
  });
}

async function refreshAdminProgressDashboard(button) {
  if (!confirmRefreshIfUnsaved()) return;

  await runManualRefresh(button, async () => {
    progressPendingUpdates = {};
    await loadAdminProgressDashboard();
  });
}

async function refreshProgressSubjects(button) {
  if (!confirmRefreshIfUnsaved()) return;

  await runManualRefresh(button, async () => {
    progressPendingUpdates = {};
    await loadProgressSubjects();
  });
}

async function refreshProgressTasks(button) {
  if (!confirmRefreshIfUnsaved()) return;

  await runManualRefresh(button, async () => {
    progressPendingUpdates = {};
    await loadProgressTasks();
  });
}

async function refreshProgressTaskStudents(button) {
  if (!confirmRefreshIfUnsaved()) return;

  await runManualRefresh(button, async () => {
    progressPendingUpdates = {};
    await loadProgressTaskStudents();
  });
}

async function refreshIndividualStudentTaskList(button) {
  if (!confirmRefreshIfUnsaved()) return;

  await runManualRefresh(button, async () => {
    progressPendingUpdates = {};
    await loadIndividualStudentTaskList();
  });
}

window.M4LProgress = {
  bindProgressUiHandlers: typeof bindProgressUiHandlers === "function" ? bindProgressUiHandlers : undefined,
  showStudentTasks: typeof showStudentTasks === "function" ? showStudentTasks : undefined,
  refreshStudentTaskProgress: typeof refreshStudentTaskProgress === "function" ? refreshStudentTaskProgress : undefined,
  refreshStudentModuleTaskList: typeof refreshStudentModuleTaskList === "function" ? refreshStudentModuleTaskList : undefined,
  refreshStudentTaskList: typeof refreshStudentTaskList === "function" ? refreshStudentTaskList : undefined,
  saveStudentTaskChangesAndReturn: typeof saveStudentTaskChangesAndReturn === "function" ? saveStudentTaskChangesAndReturn : undefined,
  saveStudentProgressSwipeChanges: typeof saveStudentProgressSwipeChanges === "function" ? saveStudentProgressSwipeChanges : undefined,
  bindStudentProgressSwipeControls: typeof bindStudentProgressSwipeControls === "function" ? bindStudentProgressSwipeControls : undefined,
  showProgressReport: typeof showProgressReport === "function" ? showProgressReport : undefined,
  loadAdminProgressDashboard: typeof loadAdminProgressDashboard === "function" ? loadAdminProgressDashboard : undefined,
  openAdminProgressTaskCard: typeof openAdminProgressTaskCard === "function" ? openAdminProgressTaskCard : undefined,
  openAdminProgressStudentPopout: typeof openAdminProgressStudentPopout === "function" ? openAdminProgressStudentPopout : undefined,
  closeAdminProgressStudentPopout: typeof closeAdminProgressStudentPopout === "function" ? closeAdminProgressStudentPopout : undefined,
  saveAdminProgressPopoutChanges: typeof saveAdminProgressPopoutChanges === "function" ? saveAdminProgressPopoutChanges : undefined,
  refreshAdminProgressDashboard: typeof refreshAdminProgressDashboard === "function" ? refreshAdminProgressDashboard : undefined,
  setAdminProgressAigView: typeof setAdminProgressAigView === "function" ? setAdminProgressAigView : undefined,
  openProgressContext: typeof openProgressContext === "function" ? openProgressContext : undefined,
  openSelectedGroupProgress: typeof openSelectedGroupProgress === "function" ? openSelectedGroupProgress : undefined,
  openSelectedStudentProgress: typeof openSelectedStudentProgress === "function" ? openSelectedStudentProgress : undefined,
  loadProgressSubjects: typeof loadProgressSubjects === "function" ? loadProgressSubjects : undefined,
  loadProgressTasks: typeof loadProgressTasks === "function" ? loadProgressTasks : undefined,
  loadProgressTaskStudents: typeof loadProgressTaskStudents === "function" ? loadProgressTaskStudents : undefined,
  openProgressSubject: typeof openProgressSubject === "function" ? openProgressSubject : undefined,
  openProgressTask: typeof openProgressTask === "function" ? openProgressTask : undefined,
  toggleProgressPending: typeof toggleProgressPending === "function" ? toggleProgressPending : undefined,
  saveProgressPendingChanges: typeof saveProgressPendingChanges === "function" ? saveProgressPendingChanges : undefined,
  saveProgressPendingChangesAndReturn: typeof saveProgressPendingChangesAndReturn === "function" ? saveProgressPendingChangesAndReturn : undefined,
  refreshProgressSubjects: typeof refreshProgressSubjects === "function" ? refreshProgressSubjects : undefined,
  refreshProgressTasks: typeof refreshProgressTasks === "function" ? refreshProgressTasks : undefined,
  refreshProgressTaskStudents: typeof refreshProgressTaskStudents === "function" ? refreshProgressTaskStudents : undefined,
  refreshIndividualStudentTaskList: typeof refreshIndividualStudentTaskList === "function" ? refreshIndividualStudentTaskList : undefined,
  hasUnsavedProgressChanges: typeof hasUnsavedProgressChanges === "function" ? hasUnsavedProgressChanges : undefined
};
