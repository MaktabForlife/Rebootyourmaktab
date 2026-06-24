/* M4L v42 - Progress module
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

  setDomText("progress-subjects-title", "My Tasks");

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

  const subjectBackButton = document.querySelector("#progress-subjects-screen .small-btn");
  setHomeIconButton(subjectBackButton, "showScreen('student-home')");

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn");
  if (taskBackButton) {
    taskBackButton.classList.remove("save-return-btn", "student-progress-save-btn");
    setBackIconButton(taskBackButton, "showScreen('progress-subjects-screen')");
  }

  ensureStudentProgressSaveButton();
}

function ensureStudentProgressSaveButton() {
  const header = document.querySelector("#progress-tasks-screen .nav-header");
  if (!header) return;

  let saveButton = header.querySelector(".student-progress-save-btn");

  if (!saveButton) {
    saveButton = document.createElement("button");
    saveButton.type = "button";
    header.appendChild(saveButton);
  }

  saveButton.className = "small-btn save-return-btn student-progress-save-btn";
  saveButton.textContent = "Save and Exit";
  saveButton.removeAttribute("onclick");

  if (saveButton.dataset.m4lStudentProgressSaveBound !== "true") {
    saveButton.dataset.m4lStudentProgressSaveBound = "true";
    saveButton.addEventListener("click", () => {
      if (typeof saveStudentTaskChangesAndReturn === "function") {
        saveStudentTaskChangesAndReturn();
      }
    });
  }
}

function setProgressScreensForAdmin() {
  document.querySelectorAll(".student-progress-save-btn").forEach(button => button.remove());

  ["progress-subjects-screen", "progress-tasks-screen", "progress-task-students-screen"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("student-theme");
    screen.classList.add("admin-theme");
  });

  const subjectBackButton = document.querySelector("#progress-subjects-screen .small-btn");
  setBackIconButton(subjectBackButton, "showScreen('progress-report')");

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn");
  if (taskBackButton) {
    taskBackButton.classList.remove("save-return-btn");
    setBackIconButton(taskBackButton, "showScreen('progress-subjects-screen')");
  }

  const taskStudentsBackButton = document.querySelector("#progress-task-students-screen .small-btn");
  if (taskStudentsBackButton) {
    taskStudentsBackButton.innerText = "Save and Exit";
    taskStudentsBackButton.classList.add("save-return-btn");
    taskStudentsBackButton.removeAttribute("onclick");

    if (taskStudentsBackButton.dataset.m4lAdminProgressSaveBound !== "true") {
      taskStudentsBackButton.dataset.m4lAdminProgressSaveBound = "true";
      taskStudentsBackButton.addEventListener("click", () => {
        if (typeof saveProgressPendingChangesAndReturn === "function") {
          saveProgressPendingChangesAndReturn();
        }
      });
    }
  }
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

function renderStudentSubjectProgress() {
  const container = getDomElement("progress-subjects-list");
  if (!container) {
    console.warn("Missing progress-subjects-list container.");
    return;
  }

  const subjects = Object.values(studentSubjectTaskGroups || {}).sort(sortModuleGroupsByModuleId);

  if (subjects.length === 0) {
    setDomHtml(container, `<p class="helper-text">No tasks assigned yet.</p>`);
    return;
  }

  setDomHtml(container, subjects.map(subject => {
    const total = subject.tasks.length;
    const completed = subject.tasks.filter(task => isStatusOn(task.completestatus)).length;
    const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

    return `
      <button
        type="button"
        class="progress-list-button"
        data-progress-action="open-student-subject-tasks"
        data-subject-key="${escapeForAttribute(subject.subjectid)}"
      >
        <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
        ${renderCompleteProgressBar(percentComplete)}
      </button>
    `;
  }).join(""));
  bindProgressUiHandlers(container);
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


function toggleStudentSubjectTask(studenttaskid, complete) {
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
  return normalizeStudentTask(row);
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
  subjectid: "ALL",
  subjectname: "",
  taskid: "ALL",
  taskname: ""
};

let progressPendingUpdates = {};
let currentProgressRows = [];

async function showProgressReport() {
  setProgressScreensForAdmin();
  prepareAdminProgressMonitor();
  showScreen("progress-report");
  await loadProgressSelectors();
}

function prepareAdminProgressMonitor() {
  const screen = document.getElementById("progress-report");
  if (!screen) return;

  screen.classList.add("progress-selector-screen");

  const homeButton = screen.querySelector(".small-btn");
  if (homeButton) {
    setHomeIconButton(homeButton, "showScreen('admin-home')");
  }

  const title = screen.querySelector("h2");
  if (title) {
    title.innerText = "Progress";
  }

  screen.querySelectorAll("h3, h4").forEach(heading => {
    const text = String(heading.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "progress for class" || text === "progress for group" || text === "progress for student") {
      heading.remove();
    }
  });

  screen.querySelectorAll("button").forEach(button => {
    const text = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "view full class") {
      button.textContent = "Class Progress";
    } else if (text === "view group") {
      button.textContent = "Group Progress";
    } else if (text === "view student") {
      button.textContent = "Individual Progress";
    }
  });

  screen.querySelectorAll("button").forEach(button => {
    if (
      button.classList.contains("bottom-nav__item") ||
      button.classList.contains("icon-action-btn") ||
      button.closest(".bottom-nav")
    ) {
      return;
    }

    button.classList.add("selector-card-button");
  });
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
  setManualRefreshButton("progress-task-students-screen", "refreshProgressTaskStudents(this)");

  if (!showScreen("progress-task-students-screen")) {
    console.warn("Progress task-students screen is missing.");
    return;
  }

  progressPendingUpdates = {};

  if (!setDomHtml("progress-task-students-list", `<p class="helper-text">Loading students...</p>`)) {
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
      setDomHtml("progress-task-students-list", `<p class="error-message">${escapeHtml(result.error || "Could not load students.")}</p>`);
      return;
    }

    if (!result.students || result.students.length === 0) {
      setDomHtml("progress-task-students-list", `<p class="helper-text">No student tasks found.</p>`);
      return;
    }

    currentProgressRows = result.students.map(normalizeProgressStudentRow);
    renderProgressTaskStudents(currentProgressRows);
  } catch (err) {
    console.error("Could not load student progress rows:", err);
    setDomHtml("progress-task-students-list", `<p class="error-message">${escapeHtml(err.message || "Could not load students.")}</p>`);
  }
}

function renderProgressTaskStudents(rows) {
  const container = getDomElement("progress-task-students-list");
  if (!container) {
    console.warn("Missing progress-task-students-list container.");
    return;
  }

  const byGroup = {};

  (Array.isArray(rows) ? rows : []).forEach(row => {
    if (String(row.classgroup || "").trim() === "0") return;
    if (!byGroup[row.classgroup]) {
      byGroup[row.classgroup] = [];
    }

    byGroup[row.classgroup].push(row);
  });

  const groups = Object.keys(byGroup).sort((a, b) => {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });

  if (groups.length === 0) {
    setDomHtml(container, `<p class="helper-text">No student tasks found.</p>`);
    return;
  }

  let html = renderTaskStatusHeader("Student", "Muallimah", { firstMuted: true });

  groups.forEach((group, index) => {
    if (index > 0) {
      html += `<div class="group-separator-line" aria-hidden="true"></div>`;
    }

    byGroup[group].forEach(row => {
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
          <div class="student-status-name">${escapeHtml(row.username)}</div>

          <div
            class="status-action task-status-control is-muted-status"
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

  setDomHtml(container, html);
  bindProgressUiHandlers(container);
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
            class="status-action task-status-control is-muted-status"
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

  if (progressState.contextType === "student") {
    renderIndividualStudentTaskList(currentProgressRows);
  } else {
    renderProgressTaskStudents(currentProgressRows);
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
        alert(completeResult.error || "Could not save completion update.");
        return false;
      }
    }

    if (update.verifyStatus !== undefined) {
      const verifyResult = await apiPost("/api/admin/tasks/verify", {
        studenttaskid: update.studenttaskid,
        verified: update.verifyStatus !== ""
      }, state.token);

      if (!verifyResult.success) {
        alert(verifyResult.error || "Could not save verification update.");
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
  } else {
    showScreen("progress-tasks-screen");
  }
}

async function saveStudentTaskChangesAndReturn() {
  const button = document.querySelector("#progress-tasks-screen .small-btn");
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
function setAuthTheme(type) {
  const authScreen = document.getElementById("auth-screen");
  const body = document.body;

  if (authScreen) {
    authScreen.classList.remove("student-theme", "admin-theme");

    if (type === "student") {
      authScreen.classList.add("student-theme");
    }

    if (type === "admin") {
      authScreen.classList.add("admin-theme");
    }
  }

  if (body) {
    body.classList.remove("student-body", "admin-body");

    if (type === "student") {
      body.classList.add("student-body");
    }

    if (type === "admin") {
      body.classList.add("admin-body");
    }
  }
}





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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}




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
  showProgressReport: typeof showProgressReport === "function" ? showProgressReport : undefined,
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
