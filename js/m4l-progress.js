/* M4L v79.2 - Student legacy row/list quarantine
   Baseline: uploaded m4l-progress.js content with confirmed V78.1.3 Progress markers.
   Scope: Progress JS quarantine only; no index files changed. V79.2 quarantines the old Student row/list progress build.
   Rule: legacy code is commented/marked first, not deleted. Delete only after testing confirms safe.
*/  
  
/* =========================  
   STUDENT TASK VIEW  
========================= */  
  
let studentSubjectTaskGroups = {};  
let currentStudentSubjectKey = "";  
  
let progressUiGlobalHandlersBound = false;  
const M4L_PROGRESS_TICK = "\u2713";  
let studentProgressAutoSaveTimer = 0;  
let studentProgressAutoSaveInFlight = null;  
let studentProgressSectionStateGuardBound = false;  
let studentProgressModuleEditState = Object.create(null);  
  
function resetStudentProgressViewportScroll() {  
  const reset = () => {  
    if (typeof window !== "undefined" && typeof window.scrollTo === "function" && ((window.scrollX || 0) !== 0 || (window.scrollY || 0) !== 0)) {  
      window.scrollTo(0, 0);  
    }  
  };  
  
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {  
    window.requestAnimationFrame(reset);  
  } else if (typeof window !== "undefined" && typeof window.setTimeout === "function") {  
    window.setTimeout(reset, 0);  
  } else {  
    reset();  
  }  
  
  return true;  
}  
  
function isStudentProgressScreenId(screenId) {  
  return [  
    "progress-subjects-screen",  
    "progress-tasks-screen"  
  ].includes(String(screenId || ""));  
}  
  
function setStudentProgressSectionBodyState(screenIdOrActive) {  
  if (typeof document === "undefined" || !document.body) {  
    return false;  
  }  
  
  const isActive = typeof screenIdOrActive === "boolean"  
    ? screenIdOrActive  
    : isStudentProgressScreenId(screenIdOrActive);  
  
  document.body.classList.toggle("is-student-progress-section", isActive);  
  
  if (isActive) {  
    resetStudentProgressViewportScroll();  
  }  
  
  return isActive;  
}  
  
function bindStudentProgressSectionStateGuard() {  
  if (studentProgressSectionStateGuardBound === true) return true;  
  if (typeof window === "undefined" || typeof window.showScreen !== "function") return false;  
  
  studentProgressSectionStateGuardBound = true;  
  
  if (window.showScreen.__m4lStudentProgressSectionGuard === true) {  
    return true;  
  }  
  
  const originalShowScreen = window.showScreen;  
  
  const guardedShowScreen = function guardedStudentProgressShowScreen(screenId, ...args) {  
    const result = originalShowScreen.call(this, screenId, ...args);  
  
    if (result !== false) {  
      setStudentProgressSectionBodyState(screenId);  
    }  
  
    return result;  
  };  
  
  guardedShowScreen.__m4lStudentProgressSectionGuard = true;  
  window.showScreen = guardedShowScreen;  
  return true;  
}  
  
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
  document.addEventListener("change", handleProgressUiChange);  
  document.addEventListener("input", handleProgressUiInput);  
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
  
function getProgressChangeElement(event) {  
  const target = event && event.target;  
  if (!target || typeof target.closest !== "function") return null;  
  
  const actionEl = target.closest("[data-progress-change-action]");  
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
  
function getProgressInputElement(event) {  
  const target = event && event.target;  
  if (!target || typeof target.closest !== "function") return null;  
  const actionEl = target.closest("[data-progress-input-action]");  
  if (!actionEl) return null;  
  const progressScope = actionEl.closest(  
    "#progress-report, #admin-progress-dashboard, #admin-progress-student-popout, " +  
    "#progress-subjects-screen, #progress-tasks-screen, #progress-task-students-screen, " +  
    "#progress-subjects-list, #progress-tasks-list, #progress-task-students-list"  
  );  
  return progressScope ? actionEl : null;  
}  
  
function handleProgressUiInput(event) {  
  const actionEl = getProgressInputElement(event);  
  if (!actionEl || actionEl.disabled) return;  
  const action = actionEl.dataset.progressInputAction || "";  
  
  switch (action) {  
    case "filter-admin-student-list":  
      filterAdminProgressStudentPicker(actionEl.value || "");  
      break;  
    default:  
      break;  
  }  
}  
  
function handleProgressUiChange(event) {  
  const actionEl = getProgressChangeElement(event);  
  if (!actionEl || actionEl.disabled) return;  
  
  const action = actionEl.dataset.progressChangeAction || "";  
  
  switch (action) {  
    case "set-admin-progress-view-picker": {  
      const nextView = String(actionEl.value || "all").trim() || "all";  
      setAdminProgressAigView(nextView);  
      break;  
    }  
    case "set-admin-progress-group": {  
      const groupValue = String(actionEl.value || "").trim();  
      setAdminProgressAigView(groupValue ? `group-${groupValue}` : "all");  
      break;  
    }  
  
    default:  
      console.warn("Unknown progress change action:", action);  
      break;  
  }  
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
  
    case "toggle-student-progress-module-edit":  
      toggleStudentProgressModuleEdit(actionEl);  
      break;  
    case "save-student-progress":  
      saveStudentProgressSwipeChanges(actionEl);  
      break;  
  
    case "close-student-progress":  
      closeStudentProgressAndReturnHome(actionEl);  
      break;  
  
    case "toggle-admin-progress-grid-edit":  
      setAdminProgressMatrixEditMode(!adminProgressMatrixEditMode, actionEl);  
      break;  
  
    case "toggle-student-subject-task":  
      if (canToggleStudentProgressGridCell(actionEl)) {  
        toggleStudentSubjectTask(  
          actionEl.dataset.studenttaskid || "",  
          getProgressBoolean(actionEl.dataset.complete)  
        );  
      }  
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
        actionEl.dataset.taskname || "",  
        actionEl.dataset.classgroup || "ALL"  
      );  
      break;  
  
    case "set-admin-progress-view":  
      setAdminProgressAigView(actionEl.dataset.progressView || "all");  
      break;  
  
    case "open-admin-individual-student-card":  
      openAdminIndividualStudentCard(  
        actionEl.dataset.studentid || "",  
        actionEl.dataset.username || "Student"  
      );  
      break;  
  
    case "close-admin-individual-student-view":  
      requestCloseAdminIndividualStudentView();  
      break;  
  
    case "open-admin-progress-student-popout":  
      openAdminProgressStudentPopout(  
        actionEl.dataset.studentid || "",  
        actionEl.dataset.username || "Student"  
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
  
  
  
async function showStudentTasks(options = {}) {  
  setStudentProgressSectionBodyState(true);  
  bindStudentProgressSectionStateGuard();  
  setProgressScreensForStudent();  
  setManualRefreshButton("progress-subjects-screen", "refreshStudentTaskProgress(this)");  
  
  if (!showScreen("progress-subjects-screen")) {  
    console.warn("Student progress screen is missing.");  
    return;  
  }  
  
  resetStudentProgressViewportScroll();  
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
    renderStudentSubjectProgress(options);  
  
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
  // Legacy Student Progress save-button cleanup retained for compatibility.  
  // V75.6 removes the visible Student Progress Save button and auto-saves changes.  
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
  button.textContent = "X";  
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
  closeButton.textContent = "X";  
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
    completeddate: getStudentTaskField(task, [  
      "completeddate", "completedDate", "CompletedDate", "CompleteDate", "LastCompletedDate",  
      "lastCompletedDate", "LatestCompletedDate", "latestCompletedDate", "CompletedAt", "completedAt"  
    ]),  
    verifieddate: getStudentTaskField(task, [  
      "verifieddate", "verifiedDate", "VerifiedDate", "VerifyDate", "LastVerifiedDate",  
      "lastVerifiedDate", "LatestVerifiedDate", "latestVerifiedDate", "VerifiedAt", "verifiedAt"  
    ]),  
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
      child.matches("[data-progress-swipe-panel], .m4l-progress-swipe-panel, .student-progress-module-panel");  
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
  
  // Responsive grid layouts have no meaningful horizontal scroll. In that mode,  
  // the selected dot/module becomes the active module for the sticky header.  
  if ((targetTrack.scrollWidth || 0) <= (targetTrack.clientWidth || 0) + 2) {  
    const activeKey = String(currentStudentSubjectKey || targetTrack.dataset.progressActiveModuleKey || "");  
  
    if (activeKey) {  
      const selectedIndex = panels.findIndex(panel => {  
        return String(panel.dataset.progressModuleKey || "") === activeKey;  
      });  
  
      if (selectedIndex >= 0) {  
        return selectedIndex;  
      }  
    }  
  
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
  
function updateStudentProgressHeaderMetrics() {  
  const screen = document.getElementById("progress-subjects-screen");  
  const header = screen && screen.querySelector  
    ? screen.querySelector("[data-student-progress-active-module-header]")  
    : null;  
  
  if (!screen || !header || typeof header.getBoundingClientRect !== "function") {  
    return false;  
  }  
  
  const height = Math.ceil(header.getBoundingClientRect().height || 0);  
  if (height > 0) {  
    screen.style.setProperty("--student-progress-active-header-height", `${height}px`);  
  }  
  
  return height > 0;  
}  
  
function scheduleStudentProgressHeaderMetricsUpdate() {  
  const runUpdate = () => updateStudentProgressHeaderMetrics();  
  
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {  
    window.requestAnimationFrame(runUpdate);  
  } else if (typeof window !== "undefined" && typeof window.setTimeout === "function") {  
    window.setTimeout(runUpdate, 0);  
  } else {  
    runUpdate();  
  }  
  
  return true;  
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
    track.dataset.progressActiveModuleKey = currentStudentSubjectKey;  
  }  
  
  dots.forEach((dot, fallbackIndex) => {  
    const dotIndex = Number(dot.dataset.progressPanelIndex || fallbackIndex || 0);  
    const isActive = dotIndex === activeIndex;  
    dot.classList.toggle("is-active", isActive);  
    dot.setAttribute("aria-current", isActive ? "true" : "false");  
  });  
  
  updateStudentProgressFrozenHeader();  
  scheduleStudentProgressHeaderMetricsUpdate();  
  updateStudentProgressTaskScrollState();  
  
  return true;  
}  
  
function scrollStudentProgressSwipeToIndex(panelIndex, options = {}) {  
  const track = getStudentProgressSwipeTrack();  
  const panels = getStudentProgressSwipePanels(track);  
  const requestedIndex = Number(panelIndex || 0);  
  const index = Math.max(0, Math.min(panels.length - 1, Number.isFinite(requestedIndex) ? requestedIndex : 0));  
  
  if (!track || !panels[index]) {  
    return false;  
  }  
  
  const behavior = options.behavior || "smooth";  
  const panel = panels[index];  
  
  currentStudentSubjectKey = String(panel.dataset.progressModuleKey || currentStudentSubjectKey || "");  
  track.dataset.progressActiveModuleKey = currentStudentSubjectKey;  
  
  // V76.7.2: scroll only the Student Progress rail.  
  // Avoid panel.scrollIntoView(), because iOS Safari can satisfy it by  
  // horizontally scrolling the page/body instead of only the nested rail.  
  const trackRect = track.getBoundingClientRect ? track.getBoundingClientRect() : null;  
  const panelRect = panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;  
  const rawLeft = trackRect && panelRect  
    ? (panelRect.left - trackRect.left + (track.scrollLeft || 0))  
    : (panel.offsetLeft - track.offsetLeft);  
  const maxLeft = Math.max(0, (track.scrollWidth || 0) - (track.clientWidth || 0));  
  const targetLeft = Math.max(0, Math.min(maxLeft, rawLeft || 0));  
  
  if (typeof track.scrollTo === "function") {  
    track.scrollTo({  
      left: targetLeft,  
      top: 0,  
      behavior  
    });  
  } else {  
    track.scrollLeft = targetLeft;  
  }  
  
  // Keep the app/page itself anchored at the left edge. The nested rail owns  
  // horizontal movement; the document should never remain horizontally panned.  
  resetStudentProgressViewportScroll();  
  
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
    scheduleStudentProgressHeaderMetricsUpdate();  
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
  
/* V79_LEGACY_QUARANTINE_START: getStudentModuleProgressSummary
   Reason: student module progress indicators were removed from the active V78.1.3 Student Progress header.

function getStudentModuleProgressSummary(module) {  
  const tasks = module && Array.isArray(module.tasks) ? module.tasks : [];  
  const total = tasks.length;  
  const completed = tasks.filter(task => isStatusOn(task.completestatus)).length;  
  const verified = tasks.filter(task => isStatusOn(task.verifystatus)).length;  
  const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);  
  const percentVerified = total === 0 ? 0 : Math.round((verified / total) * 100);  
  
  return {  
    total,  
    completed,  
    verified,  
    percentComplete: Math.max(0, Math.min(100, percentComplete)),  
    percentVerified: Math.max(0, Math.min(100, percentVerified))  
  };  
}
V79_LEGACY_QUARANTINE_END: getStudentModuleProgressSummary */  
  
function getStudentProgressModuleByKey(modules, moduleKey) {  
  const list = Array.isArray(modules) ? modules : getStudentProgressModules();  
  const key = String(moduleKey || "");  
  
  if (!list.length) {  
    return null;  
  }  
  
  return list.find(module => String(module.subjectid || "") === key) || list[0];  
}  
  
/* V79_LEGACY_QUARANTINE_START: renderStudentProgressHeaderBar
   Reason: student module progress indicators were removed from the active V78.1.3 Student Progress header.

function renderStudentProgressHeaderBar(percentComplete, options = {}) {  
  // Legacy single-bar renderer retained for older calls. V76.6.3 uses  
  // renderStudentProgressModuleBars() for the active module header.  
  const width = Math.max(0, Math.min(100, Number(percentComplete) || 0));  
  const moduleKey = options.moduleKey !== undefined  
    ? ` data-progress-module-fill="${escapeForAttribute(options.moduleKey)}"`  
    : "";  
  
  if (width >= 100) {  
    return `  
      <div class="student-progress-status-bar" aria-label="Module progress complete">  
        <span class="student-progress-status-complete-tick"${moduleKey} aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
        <span class="visually-hidden">Module progress 100 percent</span>  
      </div>  
    `;  
  }  
  
  return `  
    <div class="student-progress-status-bar" aria-label="Module progress">  
      <span class="student-progress-status-track">  
        <span class="student-progress-status-fill"${moduleKey} style="width:${width}%"></span>  
      </span>  
    </div>  
  `;  
}
V79_LEGACY_QUARANTINE_END: renderStudentProgressHeaderBar */  
  
/* V79_LEGACY_QUARANTINE_START: renderStudentProgressModuleBars
   Reason: student module progress indicators were removed from the active V78.1.3 Student Progress header.

function renderStudentProgressModuleBars(module) {  
  const summary = getStudentModuleProgressSummary(module);  
  
  return `  
    <div class="admin-progress-module-bars student-progress-active-module-bars" aria-label="Module progress">  
      <span class="admin-progress-module-bar-row student-progress-module-bar-row">  
        <span class="student-progress-module-bar-label">Student</span>  
        ${renderAdminProgressBarOrTick(summary.percentComplete, "complete", "Module complete progress")}  
      </span>  
      <span class="admin-progress-module-bar-row student-progress-module-bar-row">  
        <span class="student-progress-module-bar-label">Teacher</span>  
        ${renderAdminProgressBarOrTick(summary.percentVerified, "verify", "Module verify progress")}  
      </span>  
    </div>  
  `;  
}
V79_LEGACY_QUARANTINE_END: renderStudentProgressModuleBars */  
  
function renderStudentProgressCloseButton() {  
  return `  
    <button  
      type="button"  
      class="small-btn admin-progress-close-btn student-progress-close-btn"  
      data-progress-action="close-student-progress"  
      aria-label="Save and close Student Progress"  
      title="Save and close"  
    >X</button>  
  `;  
}  
  
function renderStudentProgressModuleEditToggle(module) {  
  if (!module) return "";  
  const moduleKey = String(module.subjectid || "");  
  const isEditing = isStudentProgressModuleEditing(moduleKey);  
  return `  
    <button  
      type="button"  
      class="student-progress-module-edit-toggle${isEditing ? " is-editing" : ""}"  
      data-progress-action="toggle-student-progress-module-edit"  
      data-progress-module-key="${escapeForAttribute(moduleKey)}"  
      aria-label="${isEditing ? "Save completed changes" : "Click to edit"}"  
      aria-pressed="${isEditing ? "true" : "false"}"  
      title="${isEditing ? "Save" : "Click to edit"}"  
    >  
      <span class="app-icon app-icon-small ${isEditing ? "save-mode-icon" : "student-edit-icon"}" aria-hidden="true"></span>  
      <span class="student-progress-module-edit-label">${isEditing ? "Save" : "Click to edit"}</span>  
    </button>  
  `;  
}  
  
function renderStudentProgressActiveModuleHeaderContent(module) {  
  if (!module) return "";  
  const title = module.subjectname || module.modulename || "Progress";  
  return `  
    <div class="student-progress-active-module-title-block">  
      <h2 class="student-progress-active-module-title">${escapeHtml(title)}</h2>  
    </div>  
    ${renderStudentProgressModuleEditToggle(module)}  
  `;  
}  
  
  
function renderStudentProgressActiveModuleHeader(modules, activeModuleKey) {  
  const module = getStudentProgressModuleByKey(modules, activeModuleKey);  
  
  return `  
    <div class="student-progress-active-module-header admin-progress-detail-header" data-student-progress-active-module-header>  
      ${renderStudentProgressCloseButton()}  
      ${renderStudentProgressActiveModuleHeaderContent(module)}  
    </div>  
  `;  
}  
  
function renderStudentProgressPanelModuleHeader(module) {  
  if (!module) return "";  
  
  const moduleKey = String(module.subjectid || "");  
  const title = module.subjectname || module.modulename || "Progress";  
  
  return `  
    <div  
      class="student-progress-panel-module-header admin-progress-detail-header"  
      data-student-progress-panel-module-header="${escapeForAttribute(moduleKey)}"  
      aria-label="${escapeForAttribute(title)} module progress"  
    >  
      ${renderStudentProgressActiveModuleHeaderContent(module)}  
    </div>  
  `;  
}  
  
function renderStudentProgressGlobalActions(modules, activeModuleKey) {  
  return `  
    <div class="student-progress-global-actions" data-progress-global-actions>  
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
  const activeModuleKey = String(  
    moduleKey ||  
    getStudentProgressSwipeActiveModuleKey() ||  
    currentStudentSubjectKey ||  
    (modules[0] && modules[0].subjectid) ||  
    ""  
  );  
  const activeModule = getStudentProgressModuleByKey(modules, activeModuleKey);  
  const header = document.querySelector("#progress-subjects-screen [data-student-progress-active-module-header]");  
  
  if (header && activeModule) {  
    header.innerHTML = `${renderStudentProgressCloseButton()}${renderStudentProgressActiveModuleHeaderContent(activeModule)}`;  
  }  
  
  document  
    .querySelectorAll("#progress-subjects-screen [data-student-progress-panel-module-header]")  
    .forEach(panelHeader => {  
      const panelModule = getStudentProgressModuleByKey(  
        modules,  
        panelHeader.dataset.studentProgressPanelModuleHeader || ""  
      );  
  
      if (panelModule) {  
        panelHeader.innerHTML = renderStudentProgressActiveModuleHeaderContent(panelModule);  
      }  
    });  
  
  scheduleStudentProgressHeaderMetricsUpdate();  
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
  updateStudentProgressModuleIndicators(currentStudentSubjectKey);  
  
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
    <div class="m4l-progress-swipe-dots student-progress-swipe-dots" data-progress-swipe-dots aria-label="Progress modules">  
      ${modules.map((module, index) => {  
        const moduleKey = String(module.subjectid || "");  
        const isActive = moduleKey === activeKey || (!activeKey && index === 0);  
  
        return `  
          <button  
            type="button"  
            class="m4l-progress-swipe-dot student-progress-swipe-dot${isActive ? " is-active" : ""}"  
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
  
  
function formatStudentProgressDateNote(value) {  
  const raw = String(value || "").trim();  
  if (!raw) return "";  
  
  const parsed = new Date(raw);  
  if (!Number.isNaN(parsed.getTime())) {  
    return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });  
  }  
  
  return raw.length > 12 ? raw.slice(0, 12) : raw;  
}  
  
function renderStudentProgressFocusedDateNote(value) {  
  const label = formatStudentProgressDateNote(value);  
  return label ? `<span class="student-progress-grid-date-note">${escapeHtml(label)}</span>` : "";  
}  
  
function isStudentProgressModuleEditing(moduleKey) {  
  return studentProgressModuleEditState[String(moduleKey || "")] === true;  
}  
  
function setStudentProgressModuleEditState(moduleKey, isEditing) {  
  const key = String(moduleKey || "");  
  if (!key) return false;  
  
  studentProgressModuleEditState[key] = !!isEditing;  
  
  document.querySelectorAll(`[data-progress-module-key="${escapeCssAttributeValue(key)}"]`).forEach(panel => {  
    panel.classList.toggle("is-editing", !!isEditing);  
    panel.classList.toggle("is-viewing", !isEditing);  
  });  
  
  document.querySelectorAll(`[data-progress-action="toggle-student-progress-module-edit"][data-progress-module-key="${escapeForAttribute(key)}"]`).forEach(button => {  
    updateStudentProgressModuleEditButton(button, !!isEditing);  
  });  
  
  return true;  
}  
  
function updateStudentProgressModuleEditButton(button, isEditing) {  
  if (!button) return false;  
  
  button.disabled = false;  
  button.classList.toggle("is-editing", !!isEditing);  
  button.classList.remove("is-saving", "has-save-error");  
  button.setAttribute("aria-pressed", isEditing ? "true" : "false");  
  button.setAttribute("aria-label", isEditing ? "Save completed changes" : "Click to edit");  
  button.setAttribute("title", isEditing ? "Save" : "Click to edit");  
  button.innerHTML = `  
    <span class="app-icon app-icon-small ${isEditing ? "save-mode-icon" : "student-edit-icon"}" aria-hidden="true"></span>  
    <span class="student-progress-module-edit-label">${isEditing ? "Save" : "Click to edit"}</span>  
  `;  
  return true;  
}  
  
function setStudentProgressModuleEditButtonSaving(button, label = "Saving...") {  
  if (!button) return false;  
  
  button.disabled = true;  
  button.classList.add("is-editing", "is-saving");  
  button.classList.remove("has-save-error");  
  button.setAttribute("aria-pressed", "true");  
  button.setAttribute("aria-label", label);  
  button.setAttribute("title", label);  
  button.innerHTML = `  
    <span class="app-icon app-icon-small save-mode-icon" aria-hidden="true"></span>  
    <span class="student-progress-module-edit-label">${escapeHtml(label)}</span>  
  `;  
  return true;  
}  
  
function setStudentProgressModuleEditButtonError(button, label = "Save failed") {  
  if (!button) return false;  
  
  button.disabled = false;  
  button.classList.add("is-editing", "has-save-error");  
  button.classList.remove("is-saving");  
  button.setAttribute("aria-pressed", "true");  
  button.setAttribute("aria-label", label);  
  button.setAttribute("title", label);  
  button.innerHTML = `  
    <span class="app-icon app-icon-small save-mode-icon" aria-hidden="true"></span>  
    <span class="student-progress-module-edit-label">${escapeHtml(label)}</span>  
  `;  
  return true;  
}  
  
async function finishStudentProgressModuleEdit(button, key) {  
  setStudentProgressModuleEditButtonSaving(button, "Saving...");  
  
  try {  
    const saved = await flushStudentProgressAutoSave();  
  
    if (saved === false && hasProgressPendingUpdates()) {  
      setStudentProgressModuleEditButtonError(button, "Save failed");  
      return false;  
    }  
  
    setStudentProgressModuleEditState(key, false);  
    return true;  
  } catch (err) {  
    console.error("Could not save student progress before finishing edit mode:", err);  
    setStudentProgressModuleEditButtonError(button, "Save failed");  
    return false;  
  }  
}  
  
function toggleStudentProgressModuleEdit(button) {  
  const key = String(button?.dataset?.progressModuleKey || getStudentProgressSwipeActiveModuleKey() || "");  
  if (!key) return false;  
  
  if (isStudentProgressModuleEditing(key)) {  
    finishStudentProgressModuleEdit(button, key);  
    return true;  
  }  
  
  return setStudentProgressModuleEditState(key, true);  
}  
  
function canToggleStudentProgressGridCell(actionEl) {  
  if (!actionEl) return true;  
  const panel = actionEl.closest(".student-progress-module-panel");  
  if (!panel) return true;  
  return panel.classList.contains("is-editing");  
}  
  
function renderStudentProgressVerifiedStatusContent(task, isVerified) {  
  if (!isVerified) {  
    return `<span class="student-progress-grid-empty-status" aria-hidden="true"></span><span class="visually-hidden">Not verified yet</span>`;  
  }  
  
  return `  
    <span class="status-tick status-tick-verified" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
    <span class="visually-hidden">Teacher verified</span>  
    ${renderStudentProgressFocusedDateNote(task.verifieddate)}  
  `;  
}  
  
function renderStudentProgressCompletedStatusContent(task, isComplete) {  
  if (isComplete) {  
    return `  
      <span class="status-tick status-tick-complete" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
      <span class="visually-hidden">Completed</span>  
      ${renderStudentProgressFocusedDateNote(task.completeddate)}  
    `;  
  }  
  
  return `  
    <span class="app-icon student-edit-icon student-progress-grid-edit-affordance" aria-hidden="true"></span>  
    <span class="visually-hidden">Click to mark complete</span>  
  `;  
}  
  
function renderStudentProgressTaskTableHeader() {  
  return `  
    <div class="student-progress-grid-row student-progress-grid-heading-row" role="row" aria-hidden="true">  
      <div class="student-progress-grid-task-heading" role="columnheader" aria-label="Task"></div>  
      <div class="student-progress-grid-status-heading" role="columnheader"><span class="visually-hidden">Completed</span></div>  
      <div class="student-progress-grid-status-heading" role="columnheader"><span class="visually-hidden">Teacher verified</span></div>  
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
  const taskName = task.taskname || "Untitled Task";  
  
  return `  
    <div class="student-progress-grid-row" role="row">  
      <div class="student-progress-grid-task-name" role="cell">${escapeHtml(taskName)}</div>  
  
      <button  
        type="button"  
        class="student-progress-grid-status-cell student-progress-grid-complete-cell${isComplete ? " is-on" : ""}"  
        data-progress-action="toggle-student-subject-task"  
        data-studenttaskid="${escapeForAttribute(task.studenttaskid)}"  
        data-complete="${isComplete ? "false" : "true"}"  
        data-complete-date="${escapeForAttribute(task.completeddate || "")}"  
        aria-label="${isComplete ? "Completed" : "Click to mark complete"}: ${escapeForAttribute(taskName)}"  
      >  
        ${renderStudentProgressCompletedStatusContent(task, isComplete)}  
      </button>  
  
      <button  
        type="button"  
        class="student-progress-grid-status-cell student-progress-grid-verified-cell is-read-only${isVerified ? " is-on" : ""}"  
        aria-label="${isVerified ? "Teacher verified" : "Not verified yet"}: ${escapeForAttribute(taskName)}"  
      >  
        ${renderStudentProgressVerifiedStatusContent(task, isVerified)}  
      </button>  
    </div>  
  `;  
}  
  
function renderStudentProgressTaskTable(module) {  
  const title = module.subjectname || module.modulename || "Module";  
  const taskRowsHtml = [...module.tasks]  
    .sort(sortByModuleThenTask)  
    .map(task => renderStudentProgressTaskTableRow(task))  
    .join("");  
  
  return `  
    <section class="admin-progress-task-card admin-progress-individual-module-card student-progress-module-task-card student-progress-module-grid-card" aria-label="${escapeForAttribute(title)} progress tasks">  
      <div class="student-progress-module-grid" role="table" aria-label="${escapeForAttribute(title)} progress tasks">  
        ${renderStudentProgressTaskTableHeader()}  
        ${taskRowsHtml}  
      </div>  
    </section>  
  `;  
}  
  
function renderStudentProgressModulePanel(module, index, moduleCount) {  
  const moduleKey = String(module.subjectid || "");  
  const title = module.subjectname || `Module ${index + 1}`;  
  
  return `  
    <section  
      class="m4l-progress-swipe-panel m4l-progress-swipe-panel--full student-progress-module-panel${isStudentProgressModuleEditing(moduleKey) ? " is-editing" : " is-viewing"}"  
      data-progress-swipe-panel  
      data-progress-panel-index="${index}"  
      data-progress-module-key="${escapeForAttribute(moduleKey)}"  
      aria-label="${escapeForAttribute(title)}"  
    >  
      ${renderStudentProgressPanelModuleHeader(module)}  
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
    <div class="m4l-progress-swipe-shell student-progress-swipe-shell" data-progress-swipe="progress-subjects-screen">  
      ${renderStudentProgressGlobalActions(modules, preferredModuleKey)}  
      ${renderStudentProgressActiveModuleHeader(modules, preferredModuleKey)}  
      <div  
        id="student-progress-swipe-track"  
        class="m4l-progress-swipe-track m4l-progress-swipe-track--full student-progress-swipe-track"  
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
  scheduleStudentProgressHeaderMetricsUpdate();  
  window.setTimeout(() => {  
    updateStudentProgressHeaderMetrics();  
    updateStudentProgressTaskScrollState();  
  }, 0);  
  
  if (preferredModuleKey && preferredModuleKey !== String(modules[0].subjectid || "")) {  
    scrollStudentProgressSwipeToModule(preferredModuleKey, {  
      behavior: options.scrollBehavior || "auto"  
    });  
  } else {  
    updateStudentProgressSwipeDots();  
  }  
}  
  
  
/* V79_LEGACY_QUARANTINE_START: openStudentSubjectTasks
   V79.2: Old Student Progress row/list build replaced by the active V78.1.3+ module-card grid.
   Original implementation is line-commented below for rollback. Delete only after final confirmation.
*/
function openStudentSubjectTasks(subjectKey) {
  // V79.2: Old Student Progress row/list screen is quarantined.
  // Fallback safely stays on the current module-card Progress screen.
  const key = String(subjectKey || currentStudentSubjectKey || "");
  if (key) {
    currentStudentSubjectKey = key;
  }
  console.warn("V79.2 legacy Student Progress row/list route is quarantined; using module-card Progress instead.");
  if (typeof showScreen === "function") {
    showScreen("progress-subjects-screen");
  }
  renderStudentSubjectProgress({
    moduleKey: key,
    scrollBehavior: "auto"
  });
  return false;
}

// V79_LEGACY_QUARANTINE_ORIGINAL_START: openStudentSubjectTasks
// /* V79_LEGACY_QUARANTINE_CANDIDATE: openStudentSubjectTasks
//    Reason: old student subject/task row-list build appears superseded by the V78+ module-card grid, but remains active until testing confirms no route calls it.
//    V79.1 keeps this active for safety; comment/delete only after smoke testing confirms unused.
// */
// function openStudentSubjectTasks(subjectKey) {  
//   setProgressScreensForStudent();  
//   setManualRefreshButton("progress-tasks-screen", "refreshStudentModuleTaskList(this)");  
//
//   const subject = studentSubjectTaskGroups ? studentSubjectTaskGroups[subjectKey] : null;  
//
//   if (!subject) {  
//     alert("Subject not found. Please reload your tasks.");  
//     return;  
//   }  
//
//   currentStudentSubjectKey = subjectKey;  
//   setDomText("progress-tasks-title", subject.subjectname);  
//
//   if (!showScreen("progress-tasks-screen")) {  
//     console.warn("Progress tasks screen is missing.");  
//     return;  
//   }  
//
//   renderStudentSubjectTaskList();  
// }
// V79_LEGACY_QUARANTINE_ORIGINAL_END: openStudentSubjectTasks
/* V79_LEGACY_QUARANTINE_END: openStudentSubjectTasks */
  
  
  
/* V79_LEGACY_QUARANTINE_START: renderTaskStatusHeader
   V79.2: Old Student Progress row/list build replaced by the active V78.1.3+ module-card grid.
   Original implementation is line-commented below for rollback. Delete only after final confirmation.
*/
function renderTaskStatusHeader() {
  // V79.2: Old Student Progress row/list heading renderer quarantined.
  return "";
}

// V79_LEGACY_QUARANTINE_ORIGINAL_START: renderTaskStatusHeader
// /* V79_LEGACY_QUARANTINE_CANDIDATE: renderTaskStatusHeader
//    Reason: old student subject/task row-list build appears superseded by the V78+ module-card grid, but remains active until testing confirms no route calls it.
//    V79.1 keeps this active for safety; comment/delete only after smoke testing confirms unused.
// */
// function renderTaskStatusHeader(firstLabel, secondLabel, options = {}) {  
//   const firstMutedClass = options.firstMuted ? " is-muted-status" : "";  
//   const secondMutedClass = options.secondMuted ? " is-muted-status" : "";  
//
//   return `  
//     <div class="student-status-row task-status-heading-row">  
//       <div class="student-status-name task-status-heading-name"></div>  
//       <div class="status-action task-status-heading${firstMutedClass}">${escapeHtml(firstLabel)}</div>  
//       <div class="status-action task-status-heading${secondMutedClass}">${escapeHtml(secondLabel)}</div>  
//     </div>  
//   `;  
// }
// V79_LEGACY_QUARANTINE_ORIGINAL_END: renderTaskStatusHeader
/* V79_LEGACY_QUARANTINE_END: renderTaskStatusHeader */
  
  
/* V79_LEGACY_QUARANTINE_START: renderTaskStatusIndicator
   V79.2: Old Student Progress row/list build replaced by the active V78.1.3+ module-card grid.
   Original implementation is line-commented below for rollback. Delete only after final confirmation.
*/
function renderTaskStatusIndicator(type, isOn, options = {}) {
  // V79.2: Old Student Progress row/list status renderer quarantined.
  const normalizedType = type === "verify" ? "verify" : "complete";
  const onClass = normalizedType === "verify" ? "status-tick-verified" : "status-tick-complete";
  const offLabel = normalizedType === "verify" ? "To be verified" : "To be completed";
  const onLabel = normalizedType === "verify" ? "Verified" : "Completed";

  if (isOn) {
    return `
      <span class="status-tick ${onClass}" aria-hidden="true">${M4L_PROGRESS_TICK}</span>
      <span class="visually-hidden">${onLabel}</span>
    `;
  }

  return `<span class="visually-hidden">${offLabel}</span>`;
}

// V79_LEGACY_QUARANTINE_ORIGINAL_START: renderTaskStatusIndicator
// /* V79_LEGACY_QUARANTINE_CANDIDATE: renderTaskStatusIndicator
//    Reason: old student subject/task row-list build appears superseded by the V78+ module-card grid, but remains active until testing confirms no route calls it.
//    V79.1 keeps this active for safety; comment/delete only after smoke testing confirms unused.
// */
// function renderTaskStatusIndicator(type, isOn, options = {}) {  
//   const normalizedType = type === "verify" ? "verify" : "complete";  
//   const onClass = normalizedType === "verify" ? "status-tick-verified" : "status-tick-complete";  
//   const offLabel = normalizedType === "verify" ? "To be verified" : "To be completed";  
//   const onLabel = normalizedType === "verify" ? "Verified" : "Completed";  
//
//   if (isOn) {  
//     return `  
//       <span class="status-tick ${onClass}" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
//       <span class="visually-hidden">${onLabel}</span>  
//     `;  
//   }  
//
//   const mutedClass = options.muted ? " task-status-icon--muted" : "";  
//
//   return `  
//     <span class="task-status-icon task-status-icon--${normalizedType}${mutedClass}" aria-hidden="true"></span>  
//     <span class="visually-hidden">${offLabel}</span>  
//   `;  
// }
// V79_LEGACY_QUARANTINE_ORIGINAL_END: renderTaskStatusIndicator
/* V79_LEGACY_QUARANTINE_END: renderTaskStatusIndicator */
  
  
/* V79_LEGACY_QUARANTINE_START: renderStudentSubjectTaskList
   V79.2: Old Student Progress row/list build replaced by the active V78.1.3+ module-card grid.
   Original implementation is line-commented below for rollback. Delete only after final confirmation.
*/
function renderStudentSubjectTaskList() {
  // V79.2: Old Student Progress row/list task screen is quarantined.
  // Re-render the active module-card Progress screen if this legacy path is called.
  console.warn("V79.2 legacy Student Progress task list is quarantined; refreshing module-card Progress instead.");
  renderStudentSubjectProgress({
    moduleKey: currentStudentSubjectKey,
    scrollBehavior: "auto"
  });
  return false;
}

// V79_LEGACY_QUARANTINE_ORIGINAL_START: renderStudentSubjectTaskList
// /* V79_LEGACY_QUARANTINE_CANDIDATE: renderStudentSubjectTaskList
//    Reason: old student subject/task row-list build appears superseded by the V78+ module-card grid, but remains active until testing confirms no route calls it.
//    V79.1 keeps this active for safety; comment/delete only after smoke testing confirms unused.
// */
// function renderStudentSubjectTaskList() {  
//   const container = getDomElement("progress-tasks-list");  
//   if (!container) {  
//     console.warn("Missing progress-tasks-list container.");  
//     return;  
//   }  
//
//   const subject = studentSubjectTaskGroups ? studentSubjectTaskGroups[currentStudentSubjectKey] : null;  
//
//   if (!subject || subject.tasks.length === 0) {  
//     setDomHtml(container, `<p class="helper-text">No tasks found for this module.</p>`);  
//     return;  
//   }  
//
//   const taskRowsHtml = [...subject.tasks]  
//     .sort(sortByModuleThenTask)  
//     .map(task => renderStudentTaskStatusRow(task))  
//     .join("");  
//
//   setDomHtml(container, `  
//     ${renderTaskStatusHeader("Me", "Muallimah", { secondMuted: true })}  
//     ${taskRowsHtml}  
//   `);  
//   bindProgressUiHandlers(container);  
// }
// V79_LEGACY_QUARANTINE_ORIGINAL_END: renderStudentSubjectTaskList
/* V79_LEGACY_QUARANTINE_END: renderStudentSubjectTaskList */
  
  
/* V79_LEGACY_QUARANTINE_START: buildStudentModuleTaskGroups
   V79.2: Old Student Progress row/list build replaced by the active V78.1.3+ module-card grid.
   Original implementation is line-commented below for rollback. Delete only after final confirmation.
*/
function buildStudentModuleTaskGroups(tasks) {
  // V79.2: Old Student Progress row/list module grouping helper quarantined.
  // Return a compatible module-array shape for any accidental legacy caller.
  const groups = buildStudentSubjectTaskGroups(Array.isArray(tasks) ? tasks : []);
  return Object.values(groups || {}).map(group => ({
    moduleid: group.subjectid || "",
    modulename: group.subjectname || "Module",
    tasks: Array.isArray(group.tasks) ? group.tasks : []
  })).sort(sortModuleGroupsByModuleId);
}

// V79_LEGACY_QUARANTINE_ORIGINAL_START: buildStudentModuleTaskGroups
// /* V79_LEGACY_QUARANTINE_CANDIDATE: buildStudentModuleTaskGroups
//    Reason: old student subject/task row-list build appears superseded by the V78+ module-card grid, but remains active until testing confirms no route calls it.
//    V79.1 keeps this active for safety; comment/delete only after smoke testing confirms unused.
// */
// function buildStudentModuleTaskGroups(tasks) {  
//   const groups = {};  
//
//   [...tasks].sort(sortByModuleThenTask).forEach(task => {  
//     const moduleName = task.modulename || "General";  
//     const moduleKey = task.moduleid || moduleName;  
//
//     if (!groups[moduleKey]) {  
//       groups[moduleKey] = {  
//         moduleid: task.moduleid || moduleKey,  
//         modulename: moduleName,  
//         tasks: []  
//       };  
//     }  
//
//     groups[moduleKey].tasks.push(task);  
//   });  
//
//   return Object.values(groups).sort(sortModuleGroupsByModuleId);  
// }
// V79_LEGACY_QUARANTINE_ORIGINAL_END: buildStudentModuleTaskGroups
/* V79_LEGACY_QUARANTINE_END: buildStudentModuleTaskGroups */
  
  
/* V79_LEGACY_QUARANTINE_START: renderStudentTaskStatusRow
   V79.2: Old Student Progress row/list build replaced by the active V78.1.3+ module-card grid.
   Original implementation is line-commented below for rollback. Delete only after final confirmation.
*/
function renderStudentTaskStatusRow(task) {
  // V79.2: Old Student Progress row/list task-row renderer quarantined.
  const taskName = task && task.taskname ? task.taskname : "Untitled Task";
  return `<div class="helper-text">${escapeHtml(taskName)}</div>`;
}

// V79_LEGACY_QUARANTINE_ORIGINAL_START: renderStudentTaskStatusRow
// /* V79_LEGACY_QUARANTINE_CANDIDATE: renderStudentTaskStatusRow
//    Reason: old student subject/task row-list build appears superseded by the V78+ module-card grid, but remains active until testing confirms no route calls it.
//    V79.1 keeps this active for safety; comment/delete only after smoke testing confirms unused.
// */
// function renderStudentTaskStatusRow(task) {  
//   const pending = progressPendingUpdates[task.studenttaskid] || {};  
//
//   const completeStatus = pending.completeStatus !== undefined  
//     ? pending.completeStatus  
//     : task.completestatus;  
//
//   const isComplete = isStatusOn(completeStatus);  
//   const isVerified = isStatusOn(task.verifystatus);  
//
//   // 1. Build the standalone audio player if an audio link exists  
//   let fullAudioPlayerHtml = "";  
//   if (task.audiolink) {  
//     fullAudioPlayerHtml = `  
//       <div style="margin-top: 10px; margin-bottom: 10px;">  
//         <audio class="resource-audio-control" controls controlsList="nodownload" preload="none" style="width: 100%; max-width: 300px;">  
//           <source src="${escapeForAttribute(task.audiolink)}" />  
//           Your browser cannot play this audio file.  
//         </audio>  
//       </div>  
//     `;  
//   }  
//
//   // 2. Inject the player into the layout under the task name  
//   return `  
//     <div class="student-status-row">  
//       <div class="student-status-name">  
//         <div>${escapeHtml(task.taskname)}</div>  
//         ${fullAudioPlayerHtml}  
//         ${renderStudentTaskLinkButtons(task)}  
//       </div>  
//
//       <div  
//         class="status-action task-status-control"  
//         role="button"  
//         tabindex="0"  
//         data-progress-action="toggle-student-subject-task"  
//         data-studenttaskid="${escapeForAttribute(task.studenttaskid)}"  
//         data-complete="${isComplete ? "false" : "true"}"  
//       >  
//         ${renderTaskStatusIndicator("complete", isComplete)}  
//       </div>  
//
//       <div class="status-action task-status-control is-view-only" aria-label="${isVerified ? "Verified by Muallimah" : "To be verified by Muallimah"}">  
//         ${renderTaskStatusIndicator("verify", isVerified, { muted: !isVerified })}  
//       </div>  
//     </div>  
//   `;  
// }
// V79_LEGACY_QUARANTINE_ORIGINAL_END: renderStudentTaskStatusRow
/* V79_LEGACY_QUARANTINE_END: renderStudentTaskStatusRow */
  
  
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
  
      const dateValue = button.dataset.completeDate || "";  
      button.dataset.complete = isComplete ? "false" : "true";  
      button.classList.toggle("is-on", isComplete);  
      button.setAttribute("aria-label", `${isComplete ? "Mark incomplete" : "Click to mark complete"}: ${taskName}`);  
      button.innerHTML = renderStudentProgressCompletedStatusContent({ completeddate: dateValue }, isComplete);  
      didUpdate = true;  
    });  
  
  return didUpdate;  
}  
  
async function flushStudentProgressAutoSave() {  
  if (studentProgressAutoSaveTimer) {  
    window.clearTimeout(studentProgressAutoSaveTimer);  
    studentProgressAutoSaveTimer = 0;  
  }  
  
  if (!hasProgressPendingUpdates()) {  
    return true;  
  }  
  
  if (studentProgressAutoSaveInFlight) {  
    return studentProgressAutoSaveInFlight;  
  }  
  
  studentProgressAutoSaveInFlight = saveProgressPendingChanges({ reload: false, alert: false })  
    .catch(err => {  
      console.error("Could not auto-save student progress:", err);  
      return false;  
    })  
    .finally(() => {  
      studentProgressAutoSaveInFlight = null;  
    });  
  
  return studentProgressAutoSaveInFlight;  
}  
  
async function closeStudentProgressAndReturnHome(actionEl) {  
  const closeButton = actionEl && actionEl.closest  
    ? actionEl.closest("[data-progress-action='close-student-progress']")  
    : actionEl;  
  
  if (closeButton) {  
    closeButton.disabled = true;  
  }  
  
  try {  
    const saved = await flushStudentProgressAutoSave();  
  
    if (saved === false && hasProgressPendingUpdates()) {  
      alert("Some progress changes may not have saved yet. Please check your connection and try again.");  
      return false;  
    }  
  
    setStudentProgressSectionBodyState(false);  
    showScreen("student-home");  
    return true;  
  } catch (err) {  
    console.error("Could not close Student Progress cleanly:", err);  
    alert(err.message || "Could not save progress before closing.");  
    return false;  
  } finally {  
    if (closeButton) {  
      closeButton.disabled = false;  
    }  
  }  
}  
  
function scheduleStudentProgressAutoSave(delay = 650) {  
  if (typeof window === "undefined") {  
    return false;  
  }  
  
  if (studentProgressAutoSaveTimer) {  
    window.clearTimeout(studentProgressAutoSaveTimer);  
  }  
  
  studentProgressAutoSaveTimer = window.setTimeout(() => {  
    flushStudentProgressAutoSave();  
  }, delay);  
  
  return true;  
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
    updateStudentProgressModuleIndicators(currentStudentSubjectKey);  
    updateStudentProgressTaskScrollState();  
    scheduleStudentProgressAutoSave();  
    return;  
  }  
  
  renderStudentSubjectTaskList();  
  scheduleStudentProgressAutoSave();  
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
let adminProgressIndividualRows = [];  
let adminProgressActiveTaskRows = [];  
let adminProgressPopoutRows = [];  
let adminProgressActiveView = "all";  
let adminProgressSelectedGroup = "ALL";  
  
const ADMIN_PROGRESS_DASHBOARD_CACHE_KEY = "m4l_admin_progress_dashboard_v77";  
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
  // V76.6.3: Progress screens close only through their visible X buttons.  
  // Do not attach swipe-up-to-close to headers, panels, backdrops, or scrollable lists.  
  return false;  
}  
  
  
function normalizeAdminProgressView(view) {  
  const raw = String(view || "all").trim().toLowerCase();  
  
  if (raw === "individual") return "individual";  
  if (raw === "all" || raw === "class") return "all";  
  
  const groupMatch = raw.match(/^group[-_:\s]?([0-9]+)$/) || raw.match(/^([0-9]+)$/);  
  if (groupMatch && String(groupMatch[1] || "").trim() !== "0") {  
    return `group-${groupMatch[1]}`;  
  }  
  
  return "all";  
}  
  
function isAdminProgressGroupView(view) {  
  return /^group-[0-9]+$/.test(normalizeAdminProgressView(view));  
}  
  
function getAdminProgressGroupFromView(view) {  
  const normalized = normalizeAdminProgressView(view);  
  const match = normalized.match(/^group-([0-9]+)$/);  
  return match ? match[1] : "ALL";  
}  
  
function getAdminProgressAvailableGroups(rows = adminProgressDashboardRows) {  
  const groups = new Set();  
  
  (Array.isArray(rows) ? rows : [])  
    .map(normalizeProgressStudentRow)  
    .forEach(row => {  
      const group = String(row.classgroup || "").trim();  
      if (!group || group === "0" || group.toUpperCase() === "ALL") return;  
      groups.add(group);  
    });  
  
  return Array.from(groups).sort(naturalCompare);  
}  
  
function getAdminProgressAigLabel(view) {  
  const normalized = normalizeAdminProgressView(view);  
  if (normalized === "individual") return "Select a student";  
  if (isAdminProgressGroupView(normalized)) return `View Group ${getAdminProgressGroupFromView(normalized)} Progress`;  
  return "View All Progress";  
}  
  
function renderAdminProgressAigSelector(activeView = "all") {  
  const currentView = normalizeAdminProgressView(activeView);  
  const dataGroups = getAdminProgressAvailableGroups();  
  const options = [  
    { value: "all", label: "View All Progress" },  
    { value: "individual", label: "Select a student" },  
    ...dataGroups.map(group => ({ value: `group-${group}`, label: `View Group ${group} Progress` }))  
  ];  
  
  return `  
    <div class="admin-progress-aig-shell" data-admin-progress-aig-shell>  
      <label class="admin-progress-view-picker-label">  
        <span class="visually-hidden">Progress view</span>  
        <select  
          class="admin-progress-view-picker"  
          data-progress-change-action="set-admin-progress-view-picker"  
          aria-label="Progress view"  
        >  
          ${options.map(option => `  
            <option value="${escapeForAttribute(option.value)}"${normalizeAdminProgressView(option.value) === currentView ? " selected" : ""}>${escapeHtml(option.label)}</option>  
          `).join("")}  
        </select>  
      </label>  
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
  const currentView = normalizeAdminProgressView(activeView);  
  
  document.querySelectorAll("[data-admin-progress-aig-shell]").forEach(shell => {  
    const picker = shell.querySelector("[data-progress-change-action='set-admin-progress-view-picker']");  
    if (picker) {  
      picker.value = currentView;  
    }  
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
          render: (adminProgressActiveView === "all" || isAdminProgressGroupView(adminProgressActiveView)) && !!document.querySelector("#progress-report.active")  
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
  const normalizedView = normalizeAdminProgressView(view);  
  
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
  
  if (isAdminProgressGroupView(normalizedView)) {  
    await showAdminScopedGroupProgress(normalizedView);  
    return true;  
  }  
  
  await showProgressReport();  
  return true;  
}  
  
async function saveAdminProgressPendingForClose() {  
  startAdminProgressBackgroundSave({ confirm: true });  
  return true;  
}  
  
async function requestCloseAdminProgressTaskScreen() {  
  startAdminProgressBackgroundSave({ confirm: true });  
  closeAdminProgressStudentPopout({ silent: true });  
  
  if (isAdminProgressGroupView(adminProgressActiveView)) {  
    await showAdminScopedGroupProgress(adminProgressActiveView);  
    return true;  
  }  
  
  if (adminProgressActiveView === "individual") {  
    await showAdminIndividualProgressLanding();  
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
  adminProgressSelectedGroup = "ALL";  
  prepareAdminProgressMonitor();  
  ensureAdminProgressAigSelector("progress-report", "all");  
  updateAdminProgressAigSelectorState("all");  
  
  const selectedClassGroup = "ALL";  
  
  progressState.contextType = selectedClassGroup === "ALL" ? "class" : "group";  
  progressState.classgroup = selectedClassGroup;  
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
  adminProgressIndividualRows = [];  
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
      if (isAdminProgressGroupView(adminProgressActiveView)) {  
        renderAdminProgressDashboardForScope(adminProgressSelectedGroup || getAdminProgressGroupFromView(adminProgressActiveView));  
      } else {  
        renderAdminProgressDashboard(fresh.modules);  
      }  
    }  
  
    return fresh;  
  } catch (err) {  
    console.warn("Could not refresh admin progress dashboard cache:", err);  
    return null;  
  }  
}  
  
  
function getAdminProgressRowsForScope(group, rows = adminProgressDashboardRows) {  
  const groupKey = String(group || "ALL");  
  
  return (Array.isArray(rows) ? rows : [])  
    .map(normalizeProgressStudentRow)  
    .filter(row => {  
      if (String(row.classgroup || "").trim() === "0") return false;  
      if (groupKey === "ALL") return true;  
      return String(row.classgroup || "") === groupKey;  
    });  
}  
  
function buildAdminProgressModulesForScope(group, rows = adminProgressDashboardRows) {  
  const groupKey = String(group || "ALL");  
  const scopedRows = getAdminProgressRowsForScope(groupKey, rows);  
  const scopedTasks = buildAdminTaskSummariesFromRows(scopedRows);  
  
  return buildAdminProgressModules(scopedTasks, scopedRows).map(module => ({  
    ...module,  
    tasks: (module.tasks || []).map(task => ({  
      ...task,  
      classgroup: groupKey  
    }))  
  }));  
}  
  
function renderAdminProgressDashboardForScope(group) {  
  const groupKey = String(group || "ALL");  
  const activeView = groupKey === "ALL" ? "all" : `group-${groupKey}`;  
  const modules = adminProgressDashboardRows.length > 0  
    ? buildAdminProgressModulesForScope(groupKey, adminProgressDashboardRows)  
    : (groupKey === "ALL" ? adminProgressDashboardModules.map(module => ({  
        ...module,  
        tasks: (module.tasks || []).map(task => ({ ...task, classgroup: "ALL" }))  
      })) : []);  
  
  adminProgressDashboardModules = modules;  
  ensureAdminProgressAigSelector("progress-report", activeView);  
  updateAdminProgressAigSelectorState(activeView);  
  renderAdminProgressDashboard(modules);  
  return modules.length > 0;  
}  
  
async function showAdminScopedGroupProgress(view) {  
  const normalizedView = normalizeAdminProgressView(view);  
  const group = getAdminProgressGroupFromView(normalizedView);  
  const dashboard = getDomElement("admin-progress-dashboard");  
  
  setAdminProgressSectionBodyState("progress-report");  
  setProgressScreensForAdmin();  
  adminProgressActiveView = normalizedView;  
  adminProgressSelectedGroup = group;  
  prepareAdminProgressMonitor();  
  ensureAdminProgressAigSelector("progress-report", normalizedView);  
  updateAdminProgressAigSelectorState(normalizedView);  
  closeAdminProgressStudentPopout({ silent: true });  
  
  progressState.contextType = "group";  
  progressState.classgroup = group;  
  progressState.studentid = "ALL";  
  progressState.studentName = "";  
  progressState.subjectid = "ALL";  
  progressState.subjectname = "";  
  progressState.taskid = "ALL";  
  progressState.taskname = "";  
  progressState.fromAdminDashboard = true;  
  currentProgressRows = [];  
  adminProgressActiveTaskRows = [];  
  adminProgressPopoutRows = [];  
  
  if (!dashboard) return false;  
  
  setDomHtml(dashboard, renderAdminProgressLoadingState(`Loading Group ${group} progress...`));  
  showScreen("progress-report");  
  
  const cached = readAdminProgressDashboardCache();  
  if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {  
    adminProgressDashboardRows = cached.rows.map(normalizeProgressStudentRow);  
    renderAdminProgressDashboardForScope(group);  
    refreshAdminProgressDashboardCacheInBackground({ render: true });  
    return true;  
  }  
  
  try {  
    const fresh = await fetchAdminProgressDashboardData();  
    adminProgressDashboardRows = fresh.rows;  
    writeAdminProgressDashboardCache(fresh.modules, fresh.rows);  
    renderAdminProgressDashboardForScope(group);  
    return true;  
  } catch (err) {  
    console.error(`Could not load Group ${group} progress:`, err);  
    setDomHtml(dashboard, `<p class="error-message">${escapeHtml(err.message || `Could not load Group ${group} progress.`)}</p>`);  
    return false;  
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
    adminProgressDashboardRows = cached.rows.map(normalizeProgressStudentRow);  
    adminProgressDashboardModules = cached.modules;  
    adminProgressSelectedGroup = "ALL";  
    renderAdminProgressDashboardForScope("ALL");  
    refreshAdminProgressDashboardCacheInBackground({ render: true });  
    return;  
  }  
  
  setDomHtml(dashboard, renderAdminProgressLoadingState("Loading class progress..."));  
  
  try {  
    const fresh = await fetchAdminProgressDashboardData();  
    adminProgressDashboardRows = fresh.rows;  
    adminProgressDashboardModules = fresh.modules;  
    adminProgressSelectedGroup = "ALL";  
    writeAdminProgressDashboardCache(fresh.modules, fresh.rows);  
    renderAdminProgressDashboardForScope("ALL");  
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
    .map(module => {  
      const moduleKey = getAdminModuleKey(module);  
      const moduleRows = (Array.isArray(rows) ? rows : [])  
        .map(normalizeProgressStudentRow)  
        .filter(row => getAdminModuleKey(row) === moduleKey && String(row.classgroup || "").trim() !== "0");  
      const moduleSummary = getAdminProgressSummaryFromRows(moduleRows);  
  
      return {  
        ...module,  
        moduleCompletedPercent: moduleSummary.completedPercent,  
        moduleVerifiedPercent: moduleSummary.verifiedPercent,  
        moduleStudentTaskCount: moduleSummary.total,  
        tasks: module.tasks.sort(sortProgressTasks)  
      };  
    })  
    .sort(sortModuleGroupsByModuleId);  
}  
  
  
function shouldRenderAdminProgressClassOverview() {  
  return normalizeAdminProgressView(adminProgressActiveView || "all") === "all" &&  
    String(adminProgressSelectedGroup || "ALL") === "ALL";  
}  
  
function getAdminProgressRowsFromModules(modules) {  
  const rows = [];  
  
  (Array.isArray(modules) ? modules : []).forEach(module => {  
    (Array.isArray(module.tasks) ? module.tasks : []).forEach(task => {  
      if (Array.isArray(task.rows)) {  
        rows.push(...task.rows.map(normalizeProgressStudentRow));  
      }  
    });  
  });  
  
  return rows;  
}  
  
function buildAdminProgressClassOverviewModel(modules, rows) {  
  const sourceRows = (Array.isArray(rows) && rows.length > 0)  
    ? rows.map(normalizeProgressStudentRow)  
    : getAdminProgressRowsFromModules(modules);  
  
  const activeRows = sourceRows.filter(row => String(row.classgroup || "").trim() !== "0");  
  const moduleMap = {};  
  
  (Array.isArray(modules) ? modules : []).forEach(module => {  
    const moduleKey = getAdminModuleKey(module);  
    if (!moduleKey) return;  
  
    const tasksByKey = {};  
    (Array.isArray(module.tasks) ? module.tasks : []).forEach(task => {  
      const normalizedTask = normalizeProgressTask(task);  
      const taskKey = getAdminTaskKey(normalizedTask);  
      if (!taskKey || tasksByKey[taskKey]) return;  
      tasksByKey[taskKey] = normalizedTask;  
    });  
  
    moduleMap[moduleKey] = {  
      moduleid: module.moduleid || module.subjectid || moduleKey,  
      modulename: module.modulename || module.subjectname || getAdminModuleName(module),  
      subjectid: module.subjectid || module.moduleid || moduleKey,  
      subjectname: module.subjectname || module.modulename || getAdminModuleName(module),  
      moduleCompletedPercent: getProgressPercentValue(module.moduleCompletedPercent),  
      moduleVerifiedPercent: getProgressPercentValue(module.moduleVerifiedPercent),  
      tasksByKey  
    };  
  });  
  
  activeRows.forEach(row => {  
    const moduleKey = getAdminModuleKey(row);  
    const taskKey = getAdminTaskKey(row);  
    if (!moduleKey) return;  
  
    if (!moduleMap[moduleKey]) {  
      moduleMap[moduleKey] = {  
        moduleid: row.moduleid || row.subjectid || moduleKey,  
        modulename: row.modulename || row.subjectname || getAdminModuleName(row),  
        subjectid: row.subjectid || row.moduleid || moduleKey,  
        subjectname: row.subjectname || row.modulename || getAdminModuleName(row),  
        moduleCompletedPercent: 0,  
        moduleVerifiedPercent: 0,  
        tasksByKey: {}  
      };  
    }  
  
    if (taskKey && !moduleMap[moduleKey].tasksByKey[taskKey]) {  
      moduleMap[moduleKey].tasksByKey[taskKey] = normalizeProgressTask({  
        ...row,  
        rows: activeRows.filter(sourceRow => getAdminTaskKey(sourceRow) === taskKey)  
      });  
    }  
  });  
  
  const moduleList = Object.values(moduleMap)  
    .map(module => {  
      const moduleRows = activeRows.filter(row => getAdminModuleKey(row) === getAdminModuleKey(module));  
      const summary = getAdminProgressSummaryFromRows(moduleRows);  
      const tasks = Object.values(module.tasksByKey || {}).sort(sortProgressTasks);  
  
      return {  
        ...module,  
        moduleCompletedPercent: module.moduleCompletedPercent || summary.completedPercent,  
        moduleVerifiedPercent: module.moduleVerifiedPercent || summary.verifiedPercent,  
        moduleStudentTaskCount: summary.total,  
        tasks  
      };  
    })  
    .filter(module => Array.isArray(module.tasks) && module.tasks.length > 0)  
    .sort(sortModuleGroupsByModuleId);  
  
  const studentMap = {};  
  
  activeRows.forEach(row => {  
    const studentKey = String(row.studentid || row.username || "").trim();  
    if (!studentKey) return;  
  
    if (!studentMap[studentKey]) {  
      studentMap[studentKey] = {  
        studentid: row.studentid || studentKey,  
        username: row.username || "Student",  
        classgroup: row.classgroup || "",  
        rowsByModule: {}  
      };  
    }  
  
    const moduleKey = getAdminModuleKey(row);  
    if (!studentMap[studentKey].rowsByModule[moduleKey]) {  
      studentMap[studentKey].rowsByModule[moduleKey] = [];  
    }  
  
    studentMap[studentKey].rowsByModule[moduleKey].push(row);  
  });  
  
  const students = Object.values(studentMap).sort((a, b) => {  
    const groupCompare = naturalCompare(a.classgroup, b.classgroup);  
    if (groupCompare !== 0) return groupCompare;  
    return naturalCompare(a.username, b.username);  
  });  
  
  return {  
    rows: activeRows,  
    modules: moduleList,  
    students  
  };  
}  
  
let adminProgressClassMatrixSaveTimer = 0;  
let adminProgressClassMatrixSaveInFlight = null;  
let adminProgressMatrixEditMode = false;  
  
function getAdminProgressMatrixPendingCount() {  
  return Object.keys(progressPendingUpdates || {}).length;  
}  
  
function renderAdminProgressMatrixEditKeyBlock() {  
  return `  
    <div class="admin-progress-matrix-corner-content">  
      <button  
        type="button"  
        class="admin-progress-matrix-edit-toggle"  
        data-progress-action="toggle-admin-progress-grid-edit"  
        aria-label="Turn edit mode on"  
        aria-pressed="false"  
        title="Edit progress"  
      >  
        <span class="app-icon app-icon-small edit-mode-icon" aria-hidden="true"></span>  
        <span class="admin-progress-matrix-edit-label">Edit</span>  
      </button>  
      <span class="admin-progress-matrix-key-line">  
        <span class="admin-progress-matrix-key-tick admin-progress-matrix-key-tick--student" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
        <span>STUDENT</span>  
      </span>  
      <span class="admin-progress-matrix-key-line">  
        <span class="admin-progress-matrix-key-tick admin-progress-matrix-key-tick--teacher" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
        <span>TEACHER</span>  
      </span>  
      <span class="admin-progress-matrix-save-status" data-admin-progress-matrix-save-status aria-live="polite"></span>  
    </div>  
  `;  
}  
  
function updateAdminProgressMatrixSaveStatus(message = "") {  
  document.querySelectorAll("[data-admin-progress-matrix-save-status]").forEach(status => {  
    status.textContent = message;  
  });  
}  
  
function updateAdminProgressMatrixEditControls() {  
  const isEditing = adminProgressMatrixEditMode === true;  
  
  document.querySelectorAll(".admin-progress-class-overview, .admin-progress-group-overview").forEach(view => {  
    view.classList.toggle("is-editing", isEditing);  
    view.classList.toggle("is-viewing", !isEditing);  
  });  
  
  document.querySelectorAll(".admin-progress-matrix-edit-toggle").forEach(button => {  
    button.classList.toggle("is-editing", isEditing);  
    button.setAttribute("aria-pressed", isEditing ? "true" : "false");  
    button.setAttribute("aria-label", isEditing ? "Save changes and finish editing" : "Turn edit mode on");  
    button.setAttribute("title", isEditing ? "Save changes" : "Edit progress");  
    button.innerHTML = `  
      <span class="app-icon app-icon-small ${isEditing ? "save-mode-icon" : "edit-mode-icon"}" aria-hidden="true"></span>  
      <span class="admin-progress-matrix-edit-label">${isEditing ? "Save" : "Edit"}</span>  
    `;  
  });  
  
  if (isEditing) {  
    const pendingCount = getAdminProgressMatrixPendingCount();  
    updateAdminProgressMatrixSaveStatus(pendingCount ? `${pendingCount} pending` : "Editing");  
  } else {  
    updateAdminProgressMatrixSaveStatus("");  
  }  
  
  return true;  
}  
  
function resetAdminProgressMatrixEditMode() {  
  adminProgressMatrixEditMode = false;  
  if (adminProgressClassMatrixSaveTimer && typeof window !== "undefined") {  
    window.clearTimeout(adminProgressClassMatrixSaveTimer);  
    adminProgressClassMatrixSaveTimer = 0;  
  }  
  return true;  
}  
  
async function setAdminProgressMatrixEditMode(isEditing, button) {  
  const nextEditing = !!isEditing;  
  
  if (nextEditing) {  
    adminProgressMatrixEditMode = true;  
    updateAdminProgressMatrixEditControls();  
    return true;  
  }  
  
  if (!adminProgressMatrixEditMode) {  
    updateAdminProgressMatrixEditControls();  
    return true;  
  }  
  
  if (!hasProgressPendingUpdates()) {  
    adminProgressMatrixEditMode = false;  
    updateAdminProgressMatrixEditControls();  
    return true;  
  }  
  
  if (button) {  
    button.disabled = true;  
    button.classList.add("is-saving");  
  }  
  if (button) {  
    const label = button.querySelector(".admin-progress-matrix-edit-label");  
    if (label) label.textContent = "Saving";  
  }  
  updateAdminProgressMatrixSaveStatus("Saving...");  
  
  try {  
    const saved = await saveAdminProgressClassMatrixPendingChanges(button);  
  
    if (!saved && hasProgressPendingUpdates()) {  
      updateAdminProgressMatrixSaveStatus("Save failed");  
      alert("Could not save progress changes. Please check your connection and try again.");  
      return false;  
    }  
  
    adminProgressMatrixEditMode = false;  
    updateAdminProgressMatrixEditControls();  
    updateAdminProgressMatrixSaveStatus("Saved");  
    window.setTimeout(() => {  
      if (!adminProgressMatrixEditMode) updateAdminProgressMatrixSaveStatus("");  
    }, 1400);  
    return true;  
  } catch (err) {  
    console.error("Could not save progress matrix changes:", err);  
    updateAdminProgressMatrixSaveStatus("Save failed");  
    alert(err.message || "Could not save progress changes.");  
    return false;  
  } finally {  
    if (button) {  
      button.disabled = false;  
      button.classList.remove("is-saving");  
    }  
  }  
}  
  
function getAdminProgressClassMatrixCellState(row) {  
  if (!row) return "blank";  
  
  const pending = progressPendingUpdates[row.studenttaskid] || {};  
  const completeStatus = pending.completeStatus !== undefined  
    ? pending.completeStatus  
    : row.completestatus;  
  const verifyStatus = pending.verifyStatus !== undefined  
    ? pending.verifyStatus  
    : row.verifystatus;  
  
  if (isStatusOn(verifyStatus)) return "verified";  
  if (isStatusOn(completeStatus)) return "complete";  
  return "blank";  
}  
  
function getNextAdminProgressClassMatrixCellState(currentState) {  
  switch (String(currentState || "blank")) {  
    case "blank":  
      return "complete";  
    case "complete":  
      return "verified";  
    case "verified":  
    default:  
      return "blank";  
  }  
}  
  
function getAdminProgressClassMatrixStateUpdate(nextState) {  
  if (nextState === "verified") {  
    return { completeStatus: "YES", verifyStatus: "YES" };  
  }  
  
  if (nextState === "complete") {  
    return { completeStatus: "YES", verifyStatus: "" };  
  }  
  
  return { completeStatus: "", verifyStatus: "" };  
}  
  
function getAdminProgressClassMatrixStateLabel(state) {  
  switch (String(state || "blank")) {  
    case "verified":  
      return "Verified";  
    case "complete":  
      return "Complete";  
    default:  
      return "Blank";  
  }  
}  
  
function getAdminProgressClassMatrixModuleTheme(moduleIndex) {  
  const index = Number(moduleIndex || 0);  
  return index % 2 === 0 ? "app" : "disabled";  
}  
  
function getAdminProgressClassMatrixModuleThemeClass(moduleIndex) {  
  return `admin-progress-class-grid-module-theme--${getAdminProgressClassMatrixModuleTheme(moduleIndex)}`;  
}  
  
function getAdminProgressClassGroupPrefix(classgroup) {  
  const raw = String(classgroup || "").trim();  
  if (!raw || raw.toUpperCase() === "ALL") return "";  
  return raw.replace(/^group\s*/i, "").trim();  
}  
  
function getAdminProgressClassMatrixNameTheme(classgroup) {  
  const prefix = getAdminProgressClassGroupPrefix(classgroup);  
  const groupNumber = Number(prefix);  
  
  if (Number.isFinite(groupNumber) && groupNumber > 0) {  
    return Math.floor(groupNumber) % 2 === 1 ? "app" : "disabled";  
  }  
  
  if (!prefix) return "app";  
  
  const hash = prefix.split("").reduce((total, char) => total + char.charCodeAt(0), 0);  
  return hash % 2 === 0 ? "app" : "disabled";  
}  
  
function getAdminProgressClassMatrixNameThemeClass(classgroup) {  
  return `admin-progress-class-grid-name-theme--${getAdminProgressClassMatrixNameTheme(classgroup)}`;  
}  
  
function findAdminProgressDashboardRowByStudentTaskId(studenttaskid) {  
  const targetId = String(studenttaskid || "");  
  if (!targetId) return null;  
  
  return (Array.isArray(adminProgressDashboardRows) ? adminProgressDashboardRows : [])  
    .find(row => String(row.studenttaskid || row.StudentTaskID || row.StudentTaskId || "") === targetId) || null;  
}  
  
function applyAdminProgressClassMatrixStateToRow(studenttaskid, nextState) {  
  const update = getAdminProgressClassMatrixStateUpdate(nextState);  
  const row = findAdminProgressDashboardRowByStudentTaskId(studenttaskid);  
  
  if (row) {  
    row.completestatus = update.completeStatus;  
    row.completeStatus = update.completeStatus;  
    row.CompleteStatus = update.completeStatus;  
    row.verifystatus = update.verifyStatus;  
    row.verifyStatus = update.verifyStatus;  
    row.VerifyStatus = update.verifyStatus;  
  }  
  
  if (!progressPendingUpdates[studenttaskid]) {  
    progressPendingUpdates[studenttaskid] = { studenttaskid };  
  }  
  
  progressPendingUpdates[studenttaskid].completeStatus = update.completeStatus;  
  progressPendingUpdates[studenttaskid].verifyStatus = update.verifyStatus;  
  
  return row;  
}  
  
function renderAdminProgressClassOverview(modules) {  
  resetAdminProgressMatrixEditMode();  
  const model = buildAdminProgressClassOverviewModel(modules, adminProgressDashboardRows);  
  
  if (!model.students.length || !model.modules.length) {  
    return `<p class="helper-text">No class progress grid data found.</p>`;  
  }  
  
  const taskColumns = model.modules.flatMap((module, moduleIndex) => {  
    return (Array.isArray(module.tasks) ? module.tasks : []).map(task => ({ module, task, moduleIndex }));  
  });  
  
  return `  
    <section class="admin-progress-class-overview is-viewing" aria-label="Class progress overview">  
      <section class="admin-progress-class-grid-card" aria-label="All students by task">  
        <div class="admin-progress-class-grid-scroll" tabindex="0" role="region" aria-label="Scrollable class progress task grid">  
          <table class="admin-progress-class-grid admin-progress-class-grid--task-matrix">  
            <colgroup>  
              <col class="admin-progress-class-grid-student-col" />  
              ${taskColumns.map(column => `<col class="admin-progress-class-grid-task-col ${getAdminProgressClassMatrixModuleThemeClass(column.moduleIndex)}" />`).join("")}  
            </colgroup>  
            <thead>  
              <tr class="admin-progress-class-grid-module-row">  
                <th class="admin-progress-class-grid-corner-top admin-progress-class-grid-module-theme--app" scope="col">  
                  <div class="admin-progress-matrix-corner-icon-slot">  
                    <button  
                      type="button"  
                      class="admin-progress-matrix-edit-toggle"  
                      data-progress-action="toggle-admin-progress-grid-edit"  
                      aria-label="Turn edit mode on"  
                      aria-pressed="false"  
                      title="Edit progress"  
                    >  
                      <span class="app-icon app-icon-small edit-mode-icon" aria-hidden="true"></span>  
                      <span class="visually-hidden">Edit progress</span>  
                    </button>  
                  </div>  
                </th>  
                ${model.modules.map((module, moduleIndex) => renderAdminProgressClassGridModuleHeader(module, moduleIndex)).join("")}  
              </tr>  
              <tr class="admin-progress-class-grid-task-row">  
                <th class="admin-progress-class-grid-student-header admin-progress-class-grid-module-theme--app" scope="col">  
                  <div class="admin-progress-matrix-key-block">  
                    <span class="admin-progress-matrix-key-line">  
                      <span class="admin-progress-matrix-key-tick admin-progress-matrix-key-tick--student" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
                      <span>STUDENT</span>  
                    </span>  
                    <span class="admin-progress-matrix-key-line">  
                      <span class="admin-progress-matrix-key-tick admin-progress-matrix-key-tick--teacher" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
                      <span>TEACHER</span>  
                    </span>  
                    <span class="admin-progress-matrix-save-status" data-admin-progress-matrix-save-status aria-live="polite"></span>  
                  </div>  
                </th>  
                ${model.modules.map((module, moduleIndex) => {  
                  return (Array.isArray(module.tasks) ? module.tasks : []).map(task => {  
                    return renderAdminProgressClassGridTaskHeader(task, module, moduleIndex);  
                  }).join("");  
                }).join("")}  
              </tr>  
            </thead>  
            <tbody>  
              ${model.students.map(student => renderAdminProgressClassGridStudentRow(student, model.modules)).join("")}  
            </tbody>  
          </table>  
        </div>  
        <p class="admin-progress-class-grid-caption">Use the edit icon to unlock changes. Tap the save icon to save all pending updates.</p>  
      </section>  
    </section>  
  `;  
}  
  
function renderAdminProgressClassGridModulePercentages(module) {  
  const completedPercent = getProgressPercentValue(module && module.moduleCompletedPercent);  
  const verifiedPercent = getProgressPercentValue(module && module.moduleVerifiedPercent);  
  
  return `  
    <span class="admin-progress-class-grid-module-percentages" aria-label="Module progress: ${completedPercent}% complete, ${verifiedPercent}% verified">  
      <span class="admin-progress-class-grid-module-percent admin-progress-class-grid-module-percent--complete">${completedPercent}%</span>  
      <span class="admin-progress-class-grid-module-percent admin-progress-class-grid-module-percent--verified">${verifiedPercent}%</span>  
    </span>  
  `;  
}  
  
function renderAdminProgressClassGridModuleHeader(module, moduleIndex = 0) {  
  const moduleName = module.modulename || module.subjectname || "Module";  
  const tasks = Array.isArray(module.tasks) ? module.tasks : [];  
  const span = Math.max(1, tasks.length);  
  const themeClass = getAdminProgressClassMatrixModuleThemeClass(moduleIndex);  
  
  return `  
    <th class="admin-progress-class-grid-module-header ${themeClass}" scope="colgroup" colspan="${span}">  
      <span class="admin-progress-class-grid-module-headline">  
        <span class="admin-progress-class-grid-module-title">${escapeHtml(moduleName)}</span>  
        ${renderAdminProgressClassGridModulePercentages(module)}  
      </span>  
    </th>  
  `;  
}  
  
function renderAdminProgressClassGridTaskHeader(task, module, moduleIndex = 0) {  
  const taskName = task.taskname || "Untitled Task";  
  const moduleName = module.modulename || module.subjectname || "Module";  
  const themeClass = getAdminProgressClassMatrixModuleThemeClass(moduleIndex);  
  
  return `  
    <th class="admin-progress-class-grid-task-header ${themeClass}" scope="col" aria-label="${escapeForAttribute(moduleName)}: ${escapeForAttribute(taskName)}">  
      <span class="admin-progress-class-grid-task-title-wrap">  
        <span class="admin-progress-class-grid-task-title">${escapeHtml(taskName)}</span>  
      </span>  
    </th>  
  `;  
}  
  
function renderAdminProgressClassGridStudentRow(student, modules) {  
  const name = student.username || "Student";  
  const groupPrefix = getAdminProgressClassGroupPrefix(student.classgroup);  
  const accessibleName = groupPrefix ? `${groupPrefix} ${name}` : name;  
  const nameThemeClass = getAdminProgressClassMatrixNameThemeClass(student.classgroup);  
  
  return `  
    <tr>  
      <th class="admin-progress-class-grid-student-cell ${nameThemeClass}" scope="row">  
        <button  
          type="button"  
          class="admin-progress-class-grid-student-button"  
          data-progress-action="open-admin-individual-student-card"  
          data-studentid="${escapeForAttribute(student.studentid || "")}"   
          data-username="${escapeForAttribute(name)}"  
          aria-label="Open Individual Progress for ${escapeForAttribute(accessibleName)}"  
        >  
          ${groupPrefix ? `<span class="admin-progress-class-grid-student-prefix" aria-hidden="true">${escapeHtml(groupPrefix)}</span>` : ""}  
          <span class="admin-progress-class-grid-student-name">${escapeHtml(name)}</span>  
        </button>  
      </th>  
      ${modules.map((module, moduleIndex) => {  
        const tasks = Array.isArray(module.tasks) ? module.tasks : [];  
        return tasks.map(task => renderAdminProgressClassGridTaskCell(student, module, task, moduleIndex)).join("");  
      }).join("")}  
    </tr>  
  `;  
}  
  
function findAdminProgressClassGridTaskRow(student, module, task) {  
  const moduleKey = getAdminModuleKey(module);  
  const taskKey = getAdminTaskKey(task);  
  const rows = student && student.rowsByModule ? (student.rowsByModule[moduleKey] || []) : [];  
  
  return rows.find(row => getAdminTaskKey(row) === taskKey) || null;  
}  
  
function renderAdminProgressClassGridTaskCell(student, module, task, moduleIndex = 0) {  
  const row = findAdminProgressClassGridTaskRow(student, module, task);  
  const studentName = student.username || "Student";  
  const moduleName = module.modulename || module.subjectname || "Module";  
  const taskName = task.taskname || "Untitled Task";  
  const state = getAdminProgressClassMatrixCellState(row);  
  const stateLabel = getAdminProgressClassMatrixStateLabel(state);  
  const label = `${studentName}, ${moduleName}, ${taskName}: ${stateLabel}`;  
  const studentTaskId = row ? String(row.studenttaskid || "") : "";  
  const themeClass = getAdminProgressClassMatrixModuleThemeClass(moduleIndex);  
  
  return `  
    <td class="admin-progress-class-grid-task-cell ${themeClass}">  
      <div class="admin-progress-class-grid-task-status">  
        <button  
          type="button"  
          class="admin-progress-class-grid-status-button admin-progress-class-grid-status-button--${escapeForAttribute(state)}"  
          data-progress-action="cycle-admin-progress-class-cell"  
          data-studenttaskid="${escapeForAttribute(studentTaskId)}"  
          data-status="${escapeForAttribute(state)}"  
          aria-label="${escapeForAttribute(label)}"  
          ${studentTaskId ? "" : "disabled"}  
        >  
          ${renderAdminProgressClassGridStatusSymbol(state)}  
        </button>  
      </div>  
    </td>  
  `;  
}  
  
function renderAdminProgressClassGridStatusSymbol(state) {  
  const normalizedState = String(state || "blank");  
  
  if (normalizedState === "verified") {  
    return `  
      <span class="admin-progress-class-grid-status-symbol status-tick status-tick-verified" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
      <span class="visually-hidden">Verified</span>  
    `;  
  }  
  
  if (normalizedState === "complete") {  
    return `  
      <span class="admin-progress-class-grid-status-symbol status-tick status-tick-complete" aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
      <span class="visually-hidden">Complete</span>  
    `;  
  }  
  
  return `  
    <span class="admin-progress-class-grid-status-symbol" aria-hidden="true"></span>  
    <span class="visually-hidden">Blank</span>  
  `;  
}  
  
function updateAdminProgressClassMatrixCellButton(button, nextState) {  
  if (!button) return false;  
  
  ["blank", "complete", "verified"].forEach(state => {  
    button.classList.remove(`admin-progress-class-grid-status-button--${state}`);  
  });  
  
  button.classList.add(`admin-progress-class-grid-status-button--${nextState}`);  
  button.dataset.status = nextState;  
  button.innerHTML = renderAdminProgressClassGridStatusSymbol(nextState);  
  
  const existingLabel = button.getAttribute("aria-label") || "Progress cell";  
  const baseLabel = existingLabel.replace(/: (Blank|Complete|Verified)$/i, "");  
  button.setAttribute("aria-label", `${baseLabel}: ${getAdminProgressClassMatrixStateLabel(nextState)}`);  
  
  return true;  
}  
  
function scheduleAdminProgressClassMatrixAutosave(button) {  
  if (typeof window === "undefined") return false;  
  
  if (adminProgressClassMatrixSaveTimer) {  
    window.clearTimeout(adminProgressClassMatrixSaveTimer);  
  }  
  
  adminProgressClassMatrixSaveTimer = window.setTimeout(() => {  
    saveAdminProgressClassMatrixPendingChanges(button);  
  }, 650);  
  
  return true;  
}  
  
async function saveAdminProgressClassMatrixPendingChanges(button) {  
  if (adminProgressClassMatrixSaveInFlight) {  
    return adminProgressClassMatrixSaveInFlight;  
  }  
  
  if (!progressPendingUpdates || Object.keys(progressPendingUpdates).length === 0) {  
    return false;  
  }  
  
  if (button) {  
    button.classList.add("is-saving");  
  }  
  if (button) {  
    const label = button.querySelector(".admin-progress-matrix-edit-label");  
    if (label) label.textContent = "Saving";  
  }  
  updateAdminProgressMatrixSaveStatus("Saving...");  
  
  adminProgressClassMatrixSaveInFlight = Promise.resolve()  
    .then(() => saveProgressPendingChanges({ reload: false, alert: false }))  
    .then(saved => {  
      if (saved) {  
        if (typeof clearAdminProgressDashboardCache === "function") {  
          clearAdminProgressDashboardCache();  
        }  
        if (typeof refreshAdminProgressDashboardCacheInBackground === "function") {  
          refreshAdminProgressDashboardCacheInBackground({ render: false });  
        }  
        updateAdminProgressMatrixSaveStatus("Saved");  
      }  
      return saved;  
    })  
    .catch(error => {  
      console.error("Failed to save progress matrix update:", error);  
      updateAdminProgressMatrixSaveStatus("Save failed");  
      return false;  
    })  
    .finally(() => {  
      if (button) {  
        button.classList.remove("is-saving");  
      }  
      adminProgressClassMatrixSaveInFlight = null;  
    });  
  
  return adminProgressClassMatrixSaveInFlight;  
}  
  
function cycleAdminProgressClassMatrixCell(button) {  
  if (!button || button.disabled) return false;  
  
  if (!adminProgressMatrixEditMode) {  
    return false;  
  }  
  
  const studentTaskId = String(button.dataset.studenttaskid || "");  
  if (!studentTaskId) return false;  
  
  const currentState = String(button.dataset.status || "blank");  
  const nextState = getNextAdminProgressClassMatrixCellState(currentState);  
  
  applyAdminProgressClassMatrixStateToRow(studentTaskId, nextState);  
  updateAdminProgressClassMatrixCellButton(button, nextState);  
  button.closest("td")?.classList.add("is-pending");  
  updateAdminProgressMatrixSaveStatus(`${getAdminProgressMatrixPendingCount()} pending`);  
  
  return true;  
}  
  
function bindAdminProgressClassMatrixLiveCells() {  
  if (typeof document === "undefined" || document.__m4lAdminProgressClassMatrixLiveBound === true) {  
    return false;  
  }  
  
  document.__m4lAdminProgressClassMatrixLiveBound = true;  
  
  document.addEventListener("click", event => {  
    const target = event.target;  
    const button = target && typeof target.closest === "function"  
      ? target.closest('[data-progress-action="cycle-admin-progress-class-cell"], [data-progress-action="cycle-admin-progress-group-cell"]')  
      : null;  
  
    if (!button) return;  
  
    event.preventDefault();  
    event.stopImmediatePropagation();  
  
    if (button.dataset.progressAction === "cycle-admin-progress-group-cell") {  
      cycleAdminProgressGroupMatrixCell(button);  
      return;  
    }  
  
    cycleAdminProgressClassMatrixCell(button);  
  }, true);  
  
  document.addEventListener("keydown", event => {  
    if (!event || (event.key !== "Enter" && event.key !== " ")) return;  
  
    const target = event.target;  
    const button = target && typeof target.closest === "function"  
      ? target.closest('[data-progress-action="cycle-admin-progress-class-cell"], [data-progress-action="cycle-admin-progress-group-cell"]')  
      : null;  
  
    if (!button) return;  
  
    event.preventDefault();  
    event.stopImmediatePropagation();  
  
    if (button.dataset.progressAction === "cycle-admin-progress-group-cell") {  
      cycleAdminProgressGroupMatrixCell(button);  
      return;  
    }  
  
    cycleAdminProgressClassMatrixCell(button);  
  }, true);  
  
  return true;  
}  
  
  
function shouldRenderAdminProgressGroupGrid() {  
  return isAdminProgressGroupView(adminProgressActiveView || "all") &&  
    String(adminProgressSelectedGroup || "ALL") !== "ALL";  
}  
  
function renderAdminProgressGroupGridOverview(modules) {  
  resetAdminProgressMatrixEditMode();  
  
  const group = adminProgressSelectedGroup || getAdminProgressGroupFromView(adminProgressActiveView);  
  const scopedRows = getAdminProgressRowsForScope(group, adminProgressDashboardRows);  
  const model = buildAdminProgressClassOverviewModel(modules, scopedRows);  
  const groupLabel = `Group ${group}`;  
  
  if (!model.students.length || !model.modules.length) {  
    return `<p class="helper-text">No ${escapeHtml(groupLabel)} progress grid data found.</p>`;  
  }  
  
  return `  
    <section class="admin-progress-group-overview is-viewing" aria-label="${escapeForAttribute(groupLabel)} progress grid">  
      <section class="admin-progress-group-grid-card" aria-label="${escapeForAttribute(groupLabel)} tasks by student">  
        <div class="admin-progress-group-grid-scroll" tabindex="0" role="region" aria-label="Scrollable ${escapeForAttribute(groupLabel)} progress grid">  
          <table class="admin-progress-group-grid" data-admin-progress-group-grid>  
            <colgroup>  
              <col class="admin-progress-group-grid-module-col" />  
              <col class="admin-progress-group-grid-task-col" />  
              ${model.students.map((student, studentIndex) => `<col class="admin-progress-group-grid-student-col${studentIndex % 2 ? " admin-progress-group-grid-student-col--alt" : ""}" />`).join("")}  
            </colgroup>  
            <thead>  
              <tr>  
                <th class="admin-progress-group-grid-module-corner" scope="col" aria-hidden="true"></th>  
                <th class="admin-progress-group-grid-task-corner" scope="col">  
                  ${renderAdminProgressMatrixEditKeyBlock()}  
                </th>  
                ${model.students.map((student, studentIndex) => renderAdminProgressGroupGridStudentHeader(student, studentIndex)).join("")}  
              </tr>  
            </thead>  
            <tbody>  
              ${model.modules.map((module, moduleIndex) => renderAdminProgressGroupGridModuleRows(module, model.students, moduleIndex)).join("")}  
            </tbody>  
          </table>  
        </div>  
        <p class="admin-progress-group-grid-caption">Tap a cell to select it. Use the edit icon to unlock updates, then save when done.</p>  
      </section>  
    </section>  
  `;  
}  
  
function renderAdminProgressGroupGridStudentHeader(student, studentIndex = 0) {  
  const name = student.username || "Student";  
  const studentId = student.studentid || name;  
  
  return `  
    <th  
      class="admin-progress-group-grid-student-header${studentIndex % 2 ? " admin-progress-group-grid-student-header--alt" : ""}"  
      scope="col"  
      data-progress-student-id="${escapeForAttribute(studentId)}"  
      aria-label="${escapeForAttribute(name)}"  
    >  
      <span class="admin-progress-group-grid-student-header-wrap">  
        <span class="admin-progress-group-grid-student-name">${escapeHtml(name)}</span>  
      </span>  
    </th>  
  `;  
}  
  
function renderAdminProgressGroupGridModuleRows(module, students, moduleIndex = 0) {  
  const tasks = Array.isArray(module.tasks) ? module.tasks : [];  
  const moduleName = module.modulename || module.subjectname || "Module";  
  const safeRowspan = Math.max(1, tasks.length);  
  
  return tasks.map((task, taskIndex) => {  
    const taskName = task.taskname || "Untitled Task";  
    const rowKey = getAdminProgressGroupGridRowKey(module, task);  
    const moduleStrip = taskIndex === 0  
      ? `  
        <th class="admin-progress-group-grid-module-cell" scope="rowgroup" rowspan="${safeRowspan}" aria-label="${escapeForAttribute(moduleName)}">  
          <span class="admin-progress-group-grid-module-name">${escapeHtml(moduleName)}</span>  
        </th>  
      `  
      : "";  
  
    return `  
      <tr data-progress-row-key="${escapeForAttribute(rowKey)}">  
        ${moduleStrip}  
        <th class="admin-progress-group-grid-task-cell" scope="row" data-progress-row-key="${escapeForAttribute(rowKey)}">  
          <span class="admin-progress-group-grid-task-name">${escapeHtml(taskName)}</span>  
        </th>  
        ${students.map((student, studentIndex) => renderAdminProgressGroupGridStatusCell(student, module, task, studentIndex, rowKey)).join("")}  
      </tr>  
    `;  
  }).join("");  
}  
  
function getAdminProgressGroupGridRowKey(module, task) {  
  return `${getAdminModuleKey(module)}::${getAdminTaskKey(task)}`;  
}  
  
function renderAdminProgressGroupGridStatusCell(student, module, task, studentIndex = 0, rowKey = "") {  
  const row = findAdminProgressClassGridTaskRow(student, module, task);  
  const studentName = student.username || "Student";  
  const studentId = student.studentid || studentName;  
  const moduleName = module.modulename || module.subjectname || "Module";  
  const taskName = task.taskname || "Untitled Task";  
  const state = getAdminProgressClassMatrixCellState(row);  
  const stateLabel = getAdminProgressClassMatrixStateLabel(state);  
  const label = `${studentName}, ${moduleName}, ${taskName}: ${stateLabel}`;  
  const studentTaskId = row ? String(row.studenttaskid || "") : "";  
  const altClass = studentIndex % 2 ? " admin-progress-group-grid-status-cell--alt" : "";  
  
  return `  
    <td  
      class="admin-progress-group-grid-status-cell${altClass}"  
      data-progress-row-key="${escapeForAttribute(rowKey)}"  
      data-progress-student-id="${escapeForAttribute(studentId)}"  
    >  
      <button  
        type="button"  
        class="admin-progress-group-grid-status-button admin-progress-group-grid-status-button--${escapeForAttribute(state)}"  
        data-progress-action="cycle-admin-progress-group-cell"  
        data-studenttaskid="${escapeForAttribute(studentTaskId)}"  
        data-status="${escapeForAttribute(state)}"  
        data-progress-row-key="${escapeForAttribute(rowKey)}"  
        data-progress-student-id="${escapeForAttribute(studentId)}"  
        aria-label="${escapeForAttribute(label)}"  
        ${studentTaskId ? "" : "disabled"}  
      >  
        ${renderAdminProgressClassGridStatusSymbol(state)}  
      </button>  
    </td>  
  `;  
}  
  
function updateAdminProgressGroupMatrixCellButton(button, nextState) {  
  if (!button) return false;  
  
  ["blank", "complete", "verified"].forEach(state => {  
    button.classList.remove(`admin-progress-group-grid-status-button--${state}`);  
  });  
  
  button.classList.add(`admin-progress-group-grid-status-button--${nextState}`);  
  button.dataset.status = nextState;  
  button.innerHTML = renderAdminProgressClassGridStatusSymbol(nextState);  
  
  const existingLabel = button.getAttribute("aria-label") || "Progress cell";  
  const baseLabel = existingLabel.replace(/: (Blank|Complete|Verified)$/i, "");  
  button.setAttribute("aria-label", `${baseLabel}: ${getAdminProgressClassMatrixStateLabel(nextState)}`);  
  
  return true;  
}  
  
function escapeCssAttributeValue(value) {  
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {  
    return CSS.escape(String(value || ""));  
  }  
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');  
}  
  
function highlightAdminProgressGroupGridPosition(cell) {  
  if (!cell) return false;  
  
  const grid = cell.closest(".admin-progress-group-grid");  
  if (!grid) return false;  
  
  grid.querySelectorAll(".is-active-row, .is-active-column, .is-active-cell").forEach(item => {  
    item.classList.remove("is-active-row", "is-active-column", "is-active-cell");  
  });  
  
  cell.classList.add("is-active-cell");  
  return true;  
}  
  
function cycleAdminProgressGroupMatrixCell(button) {  
  if (!button || button.disabled) return false;  
  
  const cell = button.closest("td");  
  highlightAdminProgressGroupGridPosition(cell);  
  
  if (!adminProgressMatrixEditMode) {  
    return false;  
  }  
  
  const studentTaskId = String(button.dataset.studenttaskid || "");  
  if (!studentTaskId) return false;  
  
  const currentState = String(button.dataset.status || "blank");  
  const nextState = getNextAdminProgressClassMatrixCellState(currentState);  
  
  applyAdminProgressClassMatrixStateToRow(studentTaskId, nextState);  
  updateAdminProgressGroupMatrixCellButton(button, nextState);  
  cell?.classList.add("is-pending");  
  updateAdminProgressMatrixSaveStatus(`${getAdminProgressMatrixPendingCount()} pending`);  
  
  return true;  
}  
  
function renderAdminProgressDashboard(modules) {  
  const dashboard = getDomElement("admin-progress-dashboard");  
  if (!dashboard) return;  
  
  const list = Array.isArray(modules) ? modules : [];  
  
  if (shouldRenderAdminProgressGroupGrid() && (list.length > 0 || (adminProgressDashboardRows || []).length > 0)) {  
    setDomHtml(dashboard, renderAdminProgressGroupGridOverview(list));  
    bindProgressUiHandlers(dashboard);  
    return;  
  }  
  
  if (shouldRenderAdminProgressClassOverview() && (list.length > 0 || (adminProgressDashboardRows || []).length > 0)) {  
    setDomHtml(dashboard, renderAdminProgressClassOverview(list));  
    bindProgressUiHandlers(dashboard);  
    return;  
  }  
  
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
        <div class="admin-progress-module-title-block">  
          <h3>${escapeHtml(moduleName)}</h3>  
          <span class="admin-progress-module-count">${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}</span>  
        </div>  
        ${renderAdminProgressModuleBars(module)}  
      </div>  
      ${renderAdminProgressDashboardTaskDots(tasks, moduleName)}  
      <div  
        class="m4l-progress-swipe-track m4l-progress-swipe-track--cards admin-progress-task-rail"  
        data-admin-progress-dashboard-rail  
        aria-label="${escapeForAttribute(moduleName)} tasks"  
      >  
        ${tasks.map(renderAdminProgressTaskCard).join("")}  
      </div>  
    </section>  
  `;  
}  
  
function renderAdminProgressModuleBars(module) {  
  const completedPercent = getProgressPercentValue(module.moduleCompletedPercent);  
  const verifiedPercent = getProgressPercentValue(module.moduleVerifiedPercent);  
  
  return `  
    <div class="admin-progress-module-bars" aria-label="Module progress">  
      <span class="admin-progress-module-bar-row">  
        ${renderAdminProgressBarOrTick(completedPercent, "complete", "Module complete progress")}  
      </span>  
      <span class="admin-progress-module-bar-row">  
        ${renderAdminProgressBarOrTick(verifiedPercent, "verify", "Module verify progress")}  
      </span>  
    </div>  
  `;  
}  
  
function renderAdminProgressDashboardTaskDots(tasks, moduleName) {  
  const list = Array.isArray(tasks) ? tasks : [];  
  
  if (list.length <= 1) {  
    return "";  
  }  
  
  return `  
    <div class="m4l-progress-swipe-dots admin-progress-task-dots" data-admin-progress-dashboard-task-dots aria-label="${escapeForAttribute(moduleName || "Module")} task cards">  
      ${list.map((task, index) => `  
        <button  
          type="button"  
          class="m4l-progress-swipe-dot admin-progress-task-dot${index === 0 ? " is-active" : ""}"  
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
      data-classgroup="${escapeForAttribute(task.classgroup || adminProgressSelectedGroup || "ALL")}"  
    >  
      <span class="admin-progress-task-card-title">${escapeHtml(task.taskname || "Untitled Task")}</span>  
      ${renderAdminProgressCardBars(completedPercent, verifiedPercent)}  
    </button>  
  `;  
}  
  
function renderAdminProgressCardBars(completedPercent, verifiedPercent) {  
  return `  
    <span class="admin-progress-card-bars">  
      <span class="admin-progress-card-bar-row">  
        <span class="admin-progress-card-bar-label">Complete</span>  
        ${renderAdminProgressBarOrTick(completedPercent, "complete", "Complete progress")}  
      </span>  
      <span class="admin-progress-card-bar-row">  
        <span class="admin-progress-card-bar-label">Verify</span>  
        ${renderAdminProgressBarOrTick(verifiedPercent, "verify", "Verify progress")}  
      </span>  
    </span>  
  `;  
}  
  
function renderAdminProgressBarOrTick(percent, type, label) {  
  const width = getProgressPercentValue(percent);  
  const normalizedType = type === "verify" ? "verify" : "complete";  
  
  if (width >= 100) {  
    return `  
      <span class="admin-progress-card-tick admin-progress-card-tick--${normalizedType}" aria-label="${escapeForAttribute(label)} 100 percent">  
        <span aria-hidden="true">${M4L_PROGRESS_TICK}</span>  
        <span class="visually-hidden">${escapeHtml(label)} 100 percent</span>  
      </span>  
    `;  
  }  
  
  return `  
    <span class="admin-progress-card-track" aria-label="${escapeForAttribute(label)}">  
      <span class="admin-progress-card-fill progress-fill-${normalizedType === "verify" ? "verified" : "complete"}" style="width:${width}%"></span>  
    </span>  
  `;  
}  
  
  
function getAdminProgressStudentKey(row) {  
  return String(row.studentid || row.username || "").trim();  
}  
  
function buildAdminIndividualStudentsFromRows(rows) {  
  const studentMap = {};  
  
  (Array.isArray(rows) ? rows : [])  
    .map(normalizeProgressStudentRow)  
    .filter(row => String(row.classgroup || "").trim() !== "0")  
    .forEach(row => {  
      const studentKey = getAdminProgressStudentKey(row);  
      if (!studentKey) return;  
  
      if (!studentMap[studentKey]) {  
        studentMap[studentKey] = {  
          studentid: row.studentid || studentKey,  
          username: row.username || "Student",  
          classgroup: row.classgroup || "Group",  
          rows: []  
        };  
      }  
  
      studentMap[studentKey].rows.push(row);  
    });  
  
  return Object.values(studentMap)  
    .map(student => {  
      const summary = getAdminProgressSummaryFromRows(student.rows);  
      return {  
        ...student,  
        completedPercent: summary.completedPercent,  
        verifiedPercent: summary.verifiedPercent,  
        taskCount: summary.total  
      };  
    })  
    .sort((a, b) => {  
      const groupCompare = naturalCompare(a.classgroup, b.classgroup);  
      if (groupCompare !== 0) return groupCompare;  
      return naturalCompare(a.username, b.username);  
    });  
}  
  
function renderAdminIndividualStudentDots(students, groupName) {  
  const list = Array.isArray(students) ? students : [];  
  
  if (list.length <= 1) {  
    return "";  
  }  
  
  return `  
    <div class="m4l-progress-swipe-dots admin-progress-task-dots admin-progress-individual-student-dots" data-admin-progress-dashboard-task-dots aria-label="${escapeForAttribute(groupName || "Group")} student cards">  
      ${list.map((student, index) => `  
        <button  
          type="button"  
          class="m4l-progress-swipe-dot admin-progress-task-dot${index === 0 ? " is-active" : ""}"  
          data-progress-action="scroll-admin-dashboard-task"  
          data-progress-task-index="${index}"  
          aria-label="Show ${escapeForAttribute(student.username || `student ${index + 1}`)}"  
          aria-current="${index === 0 ? "true" : "false"}"  
        ></button>  
      `).join("")}  
    </div>  
  `;  
}  
  
function renderAdminIndividualStudentCard(student) {  
  const completedPercent = getProgressPercentValue(student.completedPercent);  
  const verifiedPercent = getProgressPercentValue(student.verifiedPercent);  
  const studentName = student.username || "Student";  
  
  return `  
    <button  
      type="button"  
      class="admin-progress-task-card admin-progress-individual-student-card"  
      data-progress-action="open-admin-individual-student-card"  
      data-studentid="${escapeForAttribute(student.studentid)}"  
      data-username="${escapeForAttribute(studentName)}"  
      aria-label="Open individual progress for ${escapeForAttribute(studentName)}"  
    >  
      <span class="admin-progress-task-card-title">${escapeHtml(studentName)}</span>  
      ${renderAdminProgressCardBars(completedPercent, verifiedPercent)}  
    </button>  
  `;  
}  
  
function renderAdminProgressStudentPickerRow(student) {  
  const name = student.username || "Student";  
  const group = String(student.classgroup || "").trim() || "-";  
  const searchText = `${name} Group ${group} ${group}`.toLowerCase();  
  
  return `  
    <button  
      type="button"  
      class="admin-progress-student-picker-row"  
      data-progress-action="open-admin-individual-student-card"  
      data-studentid="${escapeForAttribute(student.studentid)}"  
      data-username="${escapeForAttribute(name)}"  
      data-progress-student-search="${escapeForAttribute(searchText)}"  
      aria-label="Open individual progress for ${escapeForAttribute(name)}"  
    >  
      <span class="admin-progress-student-picker-name">${escapeHtml(name)}</span>  
      <span class="admin-progress-student-picker-meta">Group ${escapeHtml(group)}</span>  
      <span class="admin-progress-student-picker-arrow" aria-hidden="true">›</span>  
    </button>  
  `;  
}  
  
function filterAdminProgressStudentPicker(query) {  
  const normalizedQuery = String(query || "").trim().toLowerCase();  
  document.querySelectorAll("[data-admin-progress-student-picker-group]").forEach(group => {  
    let visibleCount = 0;  
    group.querySelectorAll("[data-progress-student-search]").forEach(row => {  
      const text = String(row.dataset.progressStudentSearch || "").toLowerCase();  
      const isVisible = !normalizedQuery || text.includes(normalizedQuery);  
      row.hidden = !isVisible;  
      if (isVisible) visibleCount += 1;  
    });  
    group.hidden = visibleCount === 0;  
  });  
  return true;  
}  
  
function renderAdminIndividualProgressDashboard(rows) {  
  const dashboard = getDomElement("admin-progress-dashboard");  
  if (!dashboard) return false;  
  
  const students = buildAdminIndividualStudentsFromRows(rows);  
  
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
  
  const groupKeys = Object.keys(byGroup).sort(naturalCompare);  
  
  const html = `  
    <section class="admin-progress-student-picker-screen" aria-label="Select Student">  
      <div class="admin-progress-student-picker-header">  
        <h3>Select Student</h3>  
        <input  
          type="search"  
          class="admin-progress-student-picker-search"  
          data-progress-input-action="filter-admin-student-list"  
          placeholder="Search by name or group..."  
          aria-label="Search by name or group"  
        />  
      </div>  
      <div class="admin-progress-student-picker-list">  
        ${groupKeys.map(groupKey => {  
          const groupStudents = byGroup[groupKey].sort((a, b) => naturalCompare(a.username, b.username));  
          return `  
            <section class="admin-progress-student-picker-group" data-admin-progress-student-picker-group aria-label="Group ${escapeForAttribute(groupKey)}">  
              <h4>Group ${escapeHtml(groupKey)}</h4>  
              <div class="admin-progress-student-picker-rows">  
                ${groupStudents.map(renderAdminProgressStudentPickerRow).join("")}  
              </div>  
            </section>  
          `;  
        }).join("")}  
      </div>  
    </section>  
  `;  
  
  setDomHtml(dashboard, html);  
  bindProgressUiHandlers(dashboard);  
  return true;  
}  
  
async function showAdminIndividualProgressLanding() {  
  setAdminProgressSectionBodyState("progress-report");  
  setProgressScreensForAdmin();  
  adminProgressActiveView = "individual";  
  prepareAdminProgressMonitor();  
  ensureAdminProgressAigSelector("progress-report", "individual");  
  updateAdminProgressAigSelectorState("individual");  
  closeAdminProgressStudentPopout({ silent: true });  
  
  progressState.contextType = "individual";  
  progressState.classgroup = "ALL";  
  progressState.studentid = "ALL";  
  progressState.studentName = "";  
  progressState.subjectid = "ALL";  
  progressState.subjectname = "";  
  progressState.taskid = "ALL";  
  progressState.taskname = "";  
  progressState.fromAdminDashboard = true;  
  currentProgressRows = [];  
  adminProgressActiveTaskRows = [];  
  adminProgressPopoutRows = [];  
  
  const dashboard = getDomElement("admin-progress-dashboard");  
  if (!dashboard) return false;  
  
  setDomHtml(dashboard, renderAdminProgressLoadingState("Loading individual progress..."));  
  showScreen("progress-report");  
  
  const cached = readAdminProgressDashboardCache();  
  if (cached && Array.isArray(cached.rows) && cached.rows.length > 0) {  
    adminProgressDashboardRows = cached.rows;  
    adminProgressIndividualRows = cached.rows.map(normalizeProgressStudentRow);  
    renderAdminIndividualProgressDashboard(adminProgressIndividualRows);  
    refreshAdminIndividualProgressLandingInBackground();  
    return true;  
  }  
  
  try {  
    const fresh = await fetchAdminProgressDashboardData();  
    adminProgressDashboardRows = fresh.rows;  
    adminProgressDashboardModules = fresh.modules;  
    adminProgressIndividualRows = fresh.rows.map(normalizeProgressStudentRow);  
    writeAdminProgressDashboardCache(fresh.modules, fresh.rows);  
    renderAdminIndividualProgressDashboard(adminProgressIndividualRows);  
    return true;  
  } catch (err) {  
    console.error("Could not load individual progress:", err);  
    setDomHtml(dashboard, `<p class="error-message">${escapeHtml(err.message || "Could not load individual progress.")}</p>`);  
    return false;  
  }  
}  
  
async function refreshAdminIndividualProgressLandingInBackground() {  
  try {  
    const fresh = await fetchAdminProgressDashboardData();  
    adminProgressDashboardRows = fresh.rows;  
    adminProgressDashboardModules = fresh.modules;  
    adminProgressIndividualRows = fresh.rows.map(normalizeProgressStudentRow);  
    writeAdminProgressDashboardCache(fresh.modules, fresh.rows);  
  
    if (  
      adminProgressActiveView === "individual" &&  
      progressState.contextType === "individual" &&  
      !!document.querySelector("#progress-report.active")  
    ) {  
      renderAdminIndividualProgressDashboard(adminProgressIndividualRows);  
    }  
  
    return fresh;  
  } catch (err) {  
    console.warn("Could not refresh individual progress in background:", err);  
    return null;  
  }  
}  
  
function buildAdminIndividualStudentModules(rows) {  
  const moduleMap = {};  
  
  (Array.isArray(rows) ? rows : [])  
    .map(normalizeProgressStudentRow)  
    .filter(row => String(row.classgroup || "").trim() !== "0")  
    .sort(sortByModuleThenTask)  
    .forEach(row => {  
      const moduleKey = getAdminModuleKey(row);  
  
      if (!moduleMap[moduleKey]) {  
        moduleMap[moduleKey] = {  
          moduleid: row.moduleid || row.subjectid || moduleKey,  
          modulename: getAdminModuleName(row),  
          rows: []  
        };  
      }  
  
      moduleMap[moduleKey].rows.push(row);  
    });  
  
  return Object.values(moduleMap).sort(sortModuleGroupsByModuleId);  
}  
  
function renderAdminIndividualModuleDots(modules, studentName) {  
  const list = Array.isArray(modules) ? modules : [];  
  
  if (list.length <= 1) {  
    return "";  
  }  
  
  return `  
    <div class="m4l-progress-swipe-dots admin-progress-task-dots admin-progress-individual-module-dots" data-admin-progress-dashboard-task-dots aria-label="${escapeForAttribute(studentName || "Student")} module cards">  
      ${list.map((module, index) => `  
        <button  
          type="button"  
          class="m4l-progress-swipe-dot admin-progress-task-dot${index === 0 ? " is-active" : ""}"  
          data-progress-action="scroll-admin-dashboard-task"  
          data-progress-task-index="${index}"  
          aria-label="Show ${escapeForAttribute(module.modulename || `module ${index + 1}`)}"  
          aria-current="${index === 0 ? "true" : "false"}"  
        ></button>  
      `).join("")}  
    </div>  
  `;  
}  
  
function renderAdminIndividualModuleTaskRow(row) {  
  const pending = progressPendingUpdates[row.studenttaskid] || {};  
  
  const completeStatus = pending.completeStatus !== undefined  
    ? pending.completeStatus  
    : row.completestatus;  
  
  const verifyStatus = pending.verifyStatus !== undefined  
    ? pending.verifyStatus  
    : row.verifystatus;  
  
  const isComplete = isStatusOn(completeStatus);  
  const isVerified = isStatusOn(verifyStatus);  
  const taskName = row.taskname || "Untitled Task";  
  
  return `  
    <div class="admin-progress-individual-task-row" role="row">  
      <div class="admin-progress-individual-task-name" role="cell">${escapeHtml(taskName)}</div>  
  
      <button  
        type="button"  
        class="admin-progress-status-control admin-progress-complete-control is-admin-complete-override${isComplete ? " is-on" : ""}"  
        data-progress-action="toggle-progress-pending"  
        data-studenttaskid="${escapeForAttribute(row.studenttaskid)}"  
        data-field="completeStatus"  
        data-value="${isComplete ? "false" : "true"}"  
        aria-label="${isComplete ? "Mark incomplete" : "Mark complete"}: ${escapeForAttribute(taskName)}"  
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
        aria-label="${isVerified ? "Mark unverified" : "Mark verified"}: ${escapeForAttribute(taskName)}"  
      >  
        ${renderTaskStatusIndicator("verify", isVerified)}  
      </button>  
    </div>  
  `;  
}  
  
function renderAdminIndividualSelectedModuleCard(module) {  
  const moduleName = module.modulename || "Module";  
  const rows = Array.isArray(module.rows) ? module.rows.sort(sortByModuleThenTask) : [];  
  const summary = getAdminProgressSummaryFromRows(rows);  
  
  return `  
    <section class="admin-progress-task-card admin-progress-individual-module-card" aria-label="${escapeForAttribute(moduleName)} tasks">  
      <div class="admin-progress-module-heading admin-progress-individual-module-heading">  
        <div class="admin-progress-module-title-block">  
          <h3 class="admin-progress-individual-module-title">${escapeHtml(moduleName)}</h3>  
        </div>  
        ${renderAdminProgressModuleBars({  
          moduleCompletedPercent: summary.completedPercent,  
          moduleVerifiedPercent: summary.verifiedPercent  
        })}  
      </div>  
      <div class="admin-progress-individual-task-list" role="table" aria-label="${escapeForAttribute(moduleName)} task progress">  
        ${rows.map(renderAdminIndividualModuleTaskRow).join("")}  
      </div>  
    </section>  
  `;  
}  
  
  
function renderAdminIndividualStudentSticky(studentName) {  
  const safeStudentName = studentName || progressState.studentName || "Student";  
  
  return `  
    <div class="admin-progress-individual-student-sticky">  
      <button  
        type="button"  
        class="admin-progress-close-btn admin-progress-individual-student-close"  
        data-progress-action="close-admin-individual-student-view"  
        aria-label="Save and exit ${escapeForAttribute(safeStudentName)} progress"  
        title="Save and exit"  
      >X</button>  
      <span class="admin-progress-individual-student-name">${escapeHtml(safeStudentName)}</span>  
      <span aria-hidden="true"></span>  
    </div>  
  `;  
}  
  
async function requestCloseAdminIndividualStudentView() {  
  if (hasProgressPendingUpdates()) {  
    const saved = await saveProgressPendingChanges({ reload: false, alert: false });  
  
    if (!saved && hasProgressPendingUpdates()) {  
      alert("Progress changes could not be saved. Please retry before exiting.");  
      return false;  
    }  
  
    clearAdminProgressDashboardCache();  
  }  
  
  await showAdminIndividualProgressLanding();  
  return true;  
}  
  
function renderAdminIndividualSelectedStudentModules(rows, studentName) {  
  const dashboard = getDomElement("admin-progress-dashboard");  
  if (!dashboard) return false;  
  
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeProgressStudentRow);  
  const modules = buildAdminIndividualStudentModules(normalizedRows);  
  const safeStudentName = studentName || progressState.studentName || "Student";  
  
  if (modules.length === 0) {  
    setDomHtml(dashboard, `  
      <div class="admin-progress-individual-selected-view">  
        ${renderAdminIndividualStudentSticky(safeStudentName)}  
        <p class="helper-text">No tasks assigned to this student.</p>  
      </div>  
    `);  
    return false;  
  }  
  
  setDomHtml(dashboard, `  
    <div class="admin-progress-individual-selected-view">  
      ${renderAdminIndividualStudentSticky(safeStudentName)}  
      <section  
        class="admin-progress-module-shelf admin-progress-individual-selected-modules"  
        data-admin-progress-dashboard-shelf  
        aria-label="${escapeForAttribute(safeStudentName)} modules"  
      >  
        ${renderAdminIndividualModuleDots(modules, safeStudentName)}  
        <div  
          class="m4l-progress-swipe-track m4l-progress-swipe-track--cards admin-progress-task-rail admin-progress-individual-module-rail"  
          data-admin-progress-dashboard-rail  
          aria-label="${escapeForAttribute(safeStudentName)} module cards"  
        >  
          ${modules.map(renderAdminIndividualSelectedModuleCard).join("")}  
        </div>  
      </section>  
    </div>  
  `);  
  
  bindProgressUiHandlers(dashboard);  
  bindAdminProgressDashboardRailControls(dashboard);  
  return true;  
}  
  
function getAdminCachedRowsForStudent(studentid, username) {  
  const targetStudentId = String(studentid || "");  
  const targetUsername = String(username || "");  
  
  return (adminProgressIndividualRows.length ? adminProgressIndividualRows : adminProgressDashboardRows)  
    .map(normalizeProgressStudentRow)  
    .filter(row => {  
      if (String(row.classgroup || "").trim() === "0") return false;  
      const rowStudentId = String(row.studentid || "");  
      const rowUsername = String(row.username || "");  
      return (targetStudentId && rowStudentId === targetStudentId) ||  
        (targetUsername && rowUsername === targetUsername);  
    });  
}  
  
async function loadAdminIndividualSelectedStudentProgress(studentid, username) {  
  const dashboard = getDomElement("admin-progress-dashboard");  
  if (!dashboard) return false;  
  
  setDomHtml(dashboard, `  
    <div class="admin-progress-individual-selected-view">  
      ${renderAdminIndividualStudentSticky(username || "Student")}  
      ${renderAdminProgressLoadingState("Loading student modules...")}  
    </div>  
  `);  
  
  try {  
    const result = await apiPost("/api/progress/task-detail", {  
      studentid,  
      classgroup: "ALL",  
      subjectid: "ALL",  
      taskid: "ALL"  
    }, state.token);  
  
    if (!result.success) {  
      const fallbackRows = getAdminCachedRowsForStudent(studentid, username);  
  
      if (fallbackRows.length > 0) {  
        currentProgressRows = fallbackRows;  
        renderAdminIndividualSelectedStudentModules(fallbackRows, username);  
        return true;  
      }  
  
      setDomHtml(dashboard, `<p class="error-message">${escapeHtml(result.error || "Could not load student progress.")}</p>`);  
      return false;  
    }  
  
    const apiRows = Array.isArray(result.students)  
      ? result.students.map(normalizeProgressStudentRow)  
      : [];  
  
    const rows = apiRows.length > 0  
      ? apiRows  
      : getAdminCachedRowsForStudent(studentid, username);  
  
    currentProgressRows = rows;  
    renderAdminIndividualSelectedStudentModules(rows, username);  
    return true;  
  } catch (err) {  
    const fallbackRows = getAdminCachedRowsForStudent(studentid, username);  
  
    if (fallbackRows.length > 0) {  
      currentProgressRows = fallbackRows;  
      renderAdminIndividualSelectedStudentModules(fallbackRows, username);  
      return true;  
    }  
  
    console.error("Could not load selected student progress:", err);  
    setDomHtml(dashboard, `<p class="error-message">${escapeHtml(err.message || "Could not load student progress.")}</p>`);  
    return false;  
  }  
}  
  
async function openAdminIndividualStudentCard(studentid, username) {  
  if (!studentid) {  
    alert("Student details are missing.");  
    return false;  
  }  
  
  if (hasProgressPendingUpdates()) {  
    startAdminProgressBackgroundSave({ confirm: true });  
  }  
  
  setAdminProgressSectionBodyState("progress-report");  
  setProgressScreensForAdmin();  
  closeAdminProgressStudentPopout({ silent: true });  
  adminProgressActiveView = "individual";  
  prepareAdminProgressMonitor();  
  ensureAdminProgressAigSelector("progress-report", "individual");  
  updateAdminProgressAigSelectorState("individual");  
  showScreen("progress-report");  
  
  progressState.contextType = "student";  
  progressState.classgroup = "ALL";  
  progressState.studentid = studentid;  
  progressState.studentName = username || "Student";  
  progressState.subjectid = "ALL";  
  progressState.subjectname = "";  
  progressState.taskid = "ALL";  
  progressState.taskname = "";  
  progressState.fromAdminDashboard = true;  
  progressPendingUpdates = {};  
  
  return loadAdminIndividualSelectedStudentProgress(studentid, progressState.studentName);  
}  
  
async function openAdminProgressTaskCard(subjectid, subjectname, taskid, taskname, classgroup = "ALL") {  
  if (!taskid) {  
    alert("Task details are missing.");  
    return;  
  }  
  
  setProgressScreensForAdmin();  
  closeAdminProgressStudentPopout({ silent: true });  
  
  const selectedClassGroup = String(classgroup || adminProgressSelectedGroup || "ALL");  
  
  progressState.contextType = selectedClassGroup === "ALL" ? "class" : "group";  
  progressState.classgroup = selectedClassGroup;  
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
      ).filter(row => {  
        return progressState.classgroup === "ALL" || String(row.classgroup || "") === String(progressState.classgroup || "");  
      });  
  
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
    <div class="m4l-progress-swipe-dots admin-progress-group-swipe-dots" data-admin-progress-group-swipe-dots aria-label="Class groups">  
      ${list.map((group, index) => `  
        <button  
          type="button"  
          class="m4l-progress-swipe-dot admin-progress-group-swipe-dot${index === 0 ? " is-active" : ""}"  
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
  [currentProgressRows, adminProgressActiveTaskRows, adminProgressDashboardRows, adminProgressIndividualRows, adminProgressPopoutRows].forEach(collection => {  
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
          <button type="button" class="small-btn admin-progress-close-btn admin-progress-popout-close" data-progress-action="close-admin-progress-student-popout" aria-label="Close student progress" title="Close">X</button>  
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
      class="m4l-progress-swipe-panel m4l-progress-swipe-panel--full admin-progress-popout-module"  
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
      <div class="m4l-progress-swipe-track m4l-progress-swipe-track--full admin-progress-popout-module-track" data-admin-popout-module-swipe-track aria-label="${escapeForAttribute(username || "Student")} progress modules">  
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
    <div class="m4l-progress-swipe-dots admin-progress-popout-module-dots" data-admin-popout-module-swipe-dots aria-label="Student progress modules">  
      ${list.map((module, index) => `  
        <button  
          type="button"  
          class="m4l-progress-swipe-dot admin-progress-popout-module-dot${index === 0 ? " is-active" : ""}"  
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
  setManualRefreshButton("progress-task-students-screen", "refreshIndividualStudentTaskList(this)");  
  
  if (!showScreen("progress-task-students-screen")) {  
    console.warn("Progress task-students screen is missing.");  
    return;  
  }  
  
  progressPendingUpdates = {};  
  
  if (!setDomHtml("progress-task-students-list", `<p class="helper-text">Loading student tasks...</p>`)) {  
    console.warn("Missing progress-task-students-list container.");  
    return;  
  }  
  
  try {  
    const result = await apiPost("/api/progress/task-detail", {  
      studentid: progressState.studentid,  
      classgroup: "ALL",  
      subjectid: progressState.subjectid || "ALL",  
      taskid: "ALL"  
    }, state.token);  
  
    if (!result.success) {  
      setDomHtml("progress-task-students-list", `<p class="error-message">${escapeHtml(result.error || "Could not load student tasks.")}</p>`);  
      return;  
    }  
  
    if (!result.students || result.students.length === 0) {  
      setDomHtml("progress-task-students-list", `<p class="helper-text">No tasks assigned to this student.</p>`);  
      return;  
    }  
  
    currentProgressRows = result.students.map(normalizeProgressStudentRow);  
    renderIndividualStudentTaskList(currentProgressRows);  
  } catch (err) {  
    console.error("Could not load individual student task list:", err);  
    setDomHtml("progress-task-students-list", `<p class="error-message">${escapeHtml(err.message || "Could not load student tasks.")}</p>`);  
  }  
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
    if (progressState.contextType === "student" && adminProgressActiveView === "individual" && progressState.fromAdminDashboard === true) {  
      renderAdminIndividualSelectedStudentModules(currentProgressRows, progressState.studentName);  
    } else if (progressState.contextType === "student") {  
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
    if (progressState.contextType === "student" && adminProgressActiveView === "individual" && progressState.fromAdminDashboard === true) {  
      await loadAdminIndividualSelectedStudentProgress(progressState.studentid, progressState.studentName);  
    } else if (progressState.contextType === "student") {  
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
  const previousModuleKey = getStudentProgressSwipeActiveModuleKey() || currentStudentSubjectKey;  
  
  await runManualRefresh(button, async () => {  
    await flushStudentProgressAutoSave();  
    await showStudentTasks({  
      moduleKey: previousModuleKey,  
      scrollBehavior: "auto"  
    });  
  });  
}  
  
async function refreshStudentModuleTaskList(button) {  
  const previousModuleKey = currentStudentSubjectKey;  
  
  await runManualRefresh(button, async () => {  
    await flushStudentProgressAutoSave();  
    await showStudentTasks({  
      moduleKey: previousModuleKey,  
      scrollBehavior: "auto"  
    });  
  
    if (previousModuleKey && studentSubjectTaskGroups && studentSubjectTaskGroups[previousModuleKey]) {  
      openStudentSubjectTasks(previousModuleKey);  
    }  
  });  
}  
  
async function refreshAdminProgressDashboard(button) {  
  if (!confirmRefreshIfUnsaved()) return;  
  
  const preservedView = normalizeAdminProgressView(adminProgressActiveView || "all");  
  const preservedGroup = isAdminProgressGroupView(preservedView)  
    ? getAdminProgressGroupFromView(preservedView)  
    : String(adminProgressSelectedGroup || "ALL");  
  const preserveSelectedStudent = preservedView === "individual" &&  
    progressState.contextType === "student" &&  
    String(progressState.studentid || "").trim() &&  
    String(progressState.studentid || "") !== "ALL";  
  const preservedStudentId = preserveSelectedStudent ? progressState.studentid : "";  
  const preservedStudentName = preserveSelectedStudent ? progressState.studentName : "";  
  
  await runManualRefresh(button, async () => {  
    progressPendingUpdates = {};  
    clearAdminProgressDashboardCache();  
  
    if (preserveSelectedStudent) {  
      await openAdminIndividualStudentCard(preservedStudentId, preservedStudentName || "Student");  
      return;  
    }  
  
    if (preservedView === "individual") {  
      await showAdminIndividualProgressLanding();  
      return;  
    }  
  
    if (isAdminProgressGroupView(preservedView)) {  
      const targetView = preservedGroup && preservedGroup !== "ALL"  
        ? `group-${preservedGroup}`  
        : preservedView;  
      await showAdminScopedGroupProgress(targetView);  
      return;  
    }  
  
    await showProgressReport();  
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
  
bindAdminProgressClassMatrixLiveCells();  
  
  
  
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
  showAdminIndividualProgressLanding: typeof showAdminIndividualProgressLanding === "function" ? showAdminIndividualProgressLanding : undefined,  
  openAdminIndividualStudentCard: typeof openAdminIndividualStudentCard === "function" ? openAdminIndividualStudentCard : undefined,  
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
