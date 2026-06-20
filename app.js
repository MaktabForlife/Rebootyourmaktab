const API_BASE = "https://rebootworker.maktab4life.workers.dev";
const STUDENT_LOGIN_BASE = "https://rebootyourmaktab.maktab4life.org/student/";
const DEFAULT_STUDENT_GROUP = 1;

const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("maktab_token") || "",
  userType: localStorage.getItem("maktab_user_type") || "",
  user: null
};

/* =========================
   APP INIT
========================= */

window.addEventListener("load", initApp);

function initApp() {
  setupPinDigitBoxes();

  const path = window.location.pathname;
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "admin" && parts[1]) {
    state.portalType = "admin";
    state.uniqueid = parts[1];
      setAuthTheme("admin");
    checkAdmin();
    return;
  }

  if (parts[0] === "student" && parts[1]) {
    state.portalType = "student";
    state.uniqueid = parts[1];
  setAuthTheme("student");
    checkStudent();
    return;
  }

  document.getElementById("portal-title").innerText = "Reboot Your Maktab-mE";
  document.getElementById("portal-subtitle").innerText =
    "You require a personal URL to access the Maktab4Life Dashboard";
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  const target = document.getElementById(id);

  if (target) {
    target.classList.add("active");
  }
}

function setError(message) {
  document.getElementById("auth-error").innerText = message || "";
}

function setupPinDigitBoxes() {
  document.querySelectorAll(".pin-digit-row").forEach(row => {
    const groupId = row.dataset.pinGroup;
    const inputs = Array.from(row.querySelectorAll(".pin-digit"));
    const hiddenInput = document.getElementById(groupId);

    if (!groupId || inputs.length === 0) return;

    const syncHiddenInput = () => {
      if (hiddenInput) {
        hiddenInput.value = inputs.map(input => input.value.replace(/\D/g, "")).join("");
      }
    };

    const fillDigits = (digits, startIndex = 0) => {
      const cleanDigits = String(digits || "").replace(/\D/g, "").slice(0, inputs.length);

      if (!cleanDigits) {
        syncHiddenInput();
        return;
      }

      const fillFrom = cleanDigits.length >= inputs.length ? 0 : startIndex;

      cleanDigits.split("").forEach((digit, offset) => {
        const target = inputs[fillFrom + offset];
        if (target) {
          target.value = digit;
        }
      });

      syncHiddenInput();

      const nextIndex = Math.min(fillFrom + cleanDigits.length, inputs.length - 1);
      inputs[nextIndex].focus();
    };

    inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        const digits = input.value.replace(/\D/g, "");

        if (digits.length > 1) {
          fillDigits(digits, index);
          setError("");
          return;
        }

        input.value = digits;

        if (digits && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }

        syncHiddenInput();
        setError("");
      });

      input.addEventListener("keydown", event => {
        if (event.key === "Backspace" && !input.value && index > 0) {
          inputs[index - 1].value = "";
          inputs[index - 1].focus();
          syncHiddenInput();
        }

        if (event.key === "ArrowLeft" && index > 0) {
          event.preventDefault();
          inputs[index - 1].focus();
        }

        if (event.key === "ArrowRight" && index < inputs.length - 1) {
          event.preventDefault();
          inputs[index + 1].focus();
        }

        if (event.key === "Enter") {
          event.preventDefault();

          if (groupId === "setup-pin") {
            submitSetupPin();
          } else if (groupId === "login-pin") {
            submitLogin();
          }
        }
      });

      input.addEventListener("paste", event => {
        event.preventDefault();
        const pastedDigits = (event.clipboardData || window.clipboardData)
          .getData("text")
          .replace(/\D/g, "");

        fillDigits(pastedDigits, index);
        setError("");
      });
    });
  });
}

function getPinValue(groupId) {
  const row = document.querySelector(`.pin-digit-row[data-pin-group="${groupId}"]`);
  const digitInputs = row ? Array.from(row.querySelectorAll(".pin-digit")) : [];

  if (digitInputs.length) {
    return digitInputs.map(input => input.value.replace(/\D/g, "")).join("");
  }

  const fallbackInput = document.getElementById(groupId);
  return fallbackInput ? fallbackInput.value.trim() : "";
}

function clearPinValue(groupId) {
  const row = document.querySelector(`.pin-digit-row[data-pin-group="${groupId}"]`);
  const digitInputs = row ? Array.from(row.querySelectorAll(".pin-digit")) : [];
  const hiddenInput = document.getElementById(groupId);

  digitInputs.forEach(input => {
    input.value = "";
  });

  if (hiddenInput) {
    hiddenInput.value = "";
  }
}

function focusFirstPinDigit(groupId) {
  const firstInput = document.querySelector(`.pin-digit-row[data-pin-group="${groupId}"] .pin-digit`);

  if (firstInput) {
    setTimeout(() => firstInput.focus(), 50);
  }
}


async function apiPost(path, body = {}, token = "") {
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  return response.json();
}

/* =========================
   AUTH
========================= */

async function checkStudent() {
  try {
    const result = await apiPost("/api/check-student", {
      uniqueid: state.uniqueid
    });

    if (!result.success) {
      setError(result.error || "Invalid student link");
      return;
    }

    state.user = result.student;



document.getElementById("portal-title").innerHTML = `
  Ahlan Wa Sahlan 
    ${result.student.username}
`;

    document.getElementById("portal-subtitle").innerHTML = `
 <span class="login-heading">Reboot Your Maktab-mE</span>
  <span class="login-welcome">
    Student Login 
  </span>
`;





    if (result.student.pinsetup === true) {
      document.getElementById("login-pin-box").classList.remove("hidden");
      focusFirstPinDigit("login-pin");
    } else {
      document.getElementById("setup-pin-box").classList.remove("hidden");
      focusFirstPinDigit("setup-pin");
    }
  } catch (err) {
    setError("Unable to connect. Please try again.");
  }
}

async function checkAdmin() {
  try {
    const result = await apiPost("/api/admin/check-admin", {
      uniqueid: state.uniqueid
    });

    if (!result.success) {
      setError(result.error || "Invalid admin link");
      return;
    }

    state.user = result.admin;

    document.getElementById("portal-title").innerText = "Admin Login";
    document.getElementById("portal-subtitle").innerText =
      `${result.admin.username} · ${result.admin.role}`;

    document.body.classList.add("admin-body");

    if (result.admin.pinsetup === true) {
      document.getElementById("login-pin-box").classList.remove("hidden");
      focusFirstPinDigit("login-pin");
    } else {
      document.getElementById("setup-pin-box").classList.remove("hidden");
      focusFirstPinDigit("setup-pin");
    }
  } catch (err) {
    setError("Unable to connect. Please try again.");
  }
}

async function submitSetupPin() {
  const pin = getPinValue("setup-pin");

  if (!/^\d{4}$/.test(pin)) {
    setError("PIN must be 4 digits.");
    return;
  }

  const path = state.portalType === "admin"
    ? "/api/admin/setup-pin"
    : "/api/setup-pin";

  const result = await apiPost(path, {
    uniqueid: state.uniqueid,
    pin
  });

  if (!result.success) {
    setError(result.error || "Could not set PIN.");
    return;
  }

  clearPinValue("setup-pin");
  clearPinValue("login-pin");
  document.getElementById("setup-pin-box").classList.add("hidden");
  document.getElementById("login-pin-box").classList.remove("hidden");
  focusFirstPinDigit("login-pin");
  setError("");
}

async function submitLogin() {
  const pin = getPinValue("login-pin");

  if (!/^\d{4}$/.test(pin)) {
    setError("PIN must be 4 digits.");
    return;
  }

  const path = state.portalType === "admin"
    ? "/api/admin/login"
    : "/api/login";

  const result = await apiPost(path, {
    uniqueid: state.uniqueid,
    pin
  });

  if (!result.success) {
    setError(result.error || "Login failed.");
    return;
  }

  state.token = result.token;
  state.userType = state.portalType;
  state.user = state.portalType === "admin" ? result.admin : result.student;

  localStorage.setItem("maktab_token", state.token);
  localStorage.setItem("maktab_user_type", state.userType);

  if (state.portalType === "admin") {
    document.getElementById("admin-welcome").innerText =
      `${result.admin.username} · ${result.admin.role}`;
    showScreen("admin-home");
  } else {
    const studentHomeTitle = document.getElementById("student-home-title");
    if (studentHomeTitle) {
      studentHomeTitle.innerText = result.student.username || "Student";
    }
    document.getElementById("student-welcome");
    showScreen("student-home");
  }
}

function logout() {
  localStorage.removeItem("maktab_token");
  localStorage.removeItem("maktab_user_type");
  location.reload();
}

function goHome() {
  if (state.userType === "admin" || state.portalType === "admin") {
    showScreen("admin-home");
  } else {
    showScreen("student-home");
  }
}

function showPlaceholder(title) {
  document.getElementById("placeholder-title").innerText = title;
  showScreen("placeholder-screen");
}

function showAdminAcademics() {
  showScreen("admin-academics");
}

/* =========================
   STUDENT TASK VIEW
========================= */

let studentSubjectTaskGroups = {};
let currentStudentSubjectKey = "";

async function showStudentTasks() {
  setProgressScreensForStudent();
  setManualRefreshButton("progress-subjects-screen", "refreshStudentTaskProgress(this)");
  showScreen("progress-subjects-screen");

  const title = document.getElementById("progress-subjects-title");
  const container = document.getElementById("progress-subjects-list");

  title.innerText = "My Task Progress";
  container.innerHTML = `<p class="helper-text">Loading tasks...</p>`;

  const result = await apiPost("/api/tasks/student", {
    subjectid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Failed to load tasks"}</p>`;
    return;
  }

  if (!result.tasks || result.tasks.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks assigned yet.</p>`;
    return;
  }

  const normalizedTasks = result.tasks.map(normalizeStudentTask);
  studentSubjectTaskGroups = buildStudentSubjectTaskGroups(normalizedTasks);
  renderStudentSubjectProgress();
}

function setProgressScreensForStudent() {
  ["progress-subjects-screen", "progress-tasks-screen"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("admin-theme");
    screen.classList.add("student-theme");
  });

  const subjectBackButton = document.querySelector("#progress-subjects-screen .small-btn");
  if (subjectBackButton) {
    subjectBackButton.setAttribute("onclick", "showScreen('student-home')");
  }

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn");
  if (taskBackButton) {
    taskBackButton.innerText = "Save Changes →";
    taskBackButton.classList.add("save-return-btn");
    taskBackButton.setAttribute("onclick", "saveStudentTaskChangesAndReturn()");
  }
}

function setProgressScreensForAdmin() {
  ["progress-subjects-screen", "progress-tasks-screen", "progress-task-students-screen"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("student-theme");
    screen.classList.add("admin-theme");
  });

  const subjectBackButton = document.querySelector("#progress-subjects-screen .small-btn");
  if (subjectBackButton) {
    subjectBackButton.setAttribute("onclick", "showScreen('progress-report')");
  }

  const taskBackButton = document.querySelector("#progress-tasks-screen .small-btn");
  if (taskBackButton) {
    taskBackButton.innerText = "BACK";
    taskBackButton.classList.remove("save-return-btn");
    taskBackButton.setAttribute("onclick", "showScreen('progress-subjects-screen')");
  }

  const taskStudentsBackButton = document.querySelector("#progress-task-students-screen .small-btn");
  if (taskStudentsBackButton) {
    taskStudentsBackButton.innerText = "Save Changes →";
    taskStudentsBackButton.classList.add("save-return-btn");
    taskStudentsBackButton.setAttribute("onclick", "saveProgressPendingChangesAndReturn()");
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
  const container = document.getElementById("progress-subjects-list");
  const subjects = Object.values(studentSubjectTaskGroups).sort(sortModuleGroupsByModuleId);

  if (subjects.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks assigned yet.</p>`;
    return;
  }

  container.innerHTML = subjects.map(subject => {
    const total = subject.tasks.length;
    const completed = subject.tasks.filter(task => isStatusOn(task.completestatus)).length;
    const percentComplete = total === 0 ? 0 : Math.round((completed / total) * 100);

    return `
      <button class="progress-list-button" onclick="openStudentSubjectTasks('${escapeForAttribute(subject.subjectid)}')">
        <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
        ${renderCompleteProgressBar(percentComplete)}
      </button>
    `;
  }).join("");
}

function openStudentSubjectTasks(subjectKey) {
  setProgressScreensForStudent();
  setManualRefreshButton("progress-tasks-screen", "refreshStudentModuleTaskList(this)");

  const subject = studentSubjectTaskGroups[subjectKey];

  if (!subject) {
    alert("Subject not found. Please reload your tasks.");
    return;
  }

  currentStudentSubjectKey = subjectKey;
  document.getElementById("progress-tasks-title").innerText = subject.subjectname;
  showScreen("progress-tasks-screen");
  renderStudentSubjectTaskList();
}

function renderStudentSubjectTaskList() {
  const container = document.getElementById("progress-tasks-list");
  const subject = studentSubjectTaskGroups[currentStudentSubjectKey];

  if (!subject || subject.tasks.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks found for this module.</p>`;
    return;
  }

  container.innerHTML = [...subject.tasks]
    .sort(sortByModuleThenTask)
    .map(task => renderStudentTaskStatusRow(task))
    .join("");
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

      <div class="status-action" onclick="toggleStudentSubjectTask('${escapeForAttribute(task.studenttaskid)}', ${isComplete ? "false" : "true"})">
        ${
          isComplete
            ? `<span class="status-tick status-tick-complete">✓</span>`
            : `To be<br>completed`
        }
      </div>

      <div class="status-action">
        ${
          isVerified
            ? `<span class="status-tick status-tick-verified">✓</span>`
            : `To be<br>verified`
        }
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
          onclick="event.stopPropagation(); toggleStudentTaskInlinePlayer('${escapeForAttribute(playerId)}', '${escapeForAttribute(item.link)}', '${escapeForAttribute(item.type)}')"
        >${escapeHtml(item.label)}</button>
        <div id="${escapeHtml(playerId)}" class="student-task-inline-player hidden"></div>
      `;
    }

    return `
      <button
        type="button"
        class="student-task-link-btn"
        title="${escapeHtml(item.title)}"
        onclick="event.stopPropagation(); openStudentTaskExternalLink('${escapeForAttribute(item.link)}', '${escapeForAttribute(item.type)}')"
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
   STUDENT RESOURCE VIEW
========================= */

let studentResourceSubjects = [];
let studentResourceGroupsByType = {};
let currentStudentResourceMode = "";
let currentStudentResourceSubjectKey = "";
let currentStudentResourceSubjectName = "";
let currentStudentResourceSubjectCategoryCounts = {};
let currentStudentResourceModuleKey = "";
let currentStudentResourceModuleName = "";
let studentResourceViewMode = "student";
const PDFJS_VIEWER_PATH = "/pdf-viewer/web/viewer.html";

let previousPdfScreenId = "";
let currentPdfDirectLink = "";

const STUDENT_RESOURCE_CATEGORIES = [
  {
    key: "EBOOKS",
    label: "eBooks",
    subtitle: "Books and reading resources"
  },
  {
    key: "PRINTABLES",
    label: "Printables",
    subtitle: "Worksheets and printable files"
  },
  {
    key: "AUDIO",
    label: "Audio",
    subtitle: "Listening resources"
  },
  {
    key: "VIDEO",
    label: "Video",
    subtitle: "Movie and video resources"
  },
  {
    key: "OTHER",
    label: "Other",
    subtitle: "Images, links, text and other files"
  }
];

async function showStudentResources() {
  studentResourceViewMode = "student";
  setResourceScreensForStudent();
  await loadResourceCategories("/api/resources/list", {});
}

async function showAdminResources() {
  studentResourceViewMode = "admin";
  setResourceScreensForAdmin();
  await loadResourceCategories("/api/resources/list", {});
}

function setResourceScreensForStudent() {
  ["student-resources-subjects", "student-resources-media", "student-resources-modules", "student-resources-detail"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("admin-theme");
    screen.classList.add("student-theme");
  });

  const listTitle = document.querySelector("#student-resources-subjects h2");
  if (listTitle) listTitle.innerText = "Subjects";

  const listBackButton = document.querySelector("#student-resources-subjects .small-btn");
  if (listBackButton) {
    listBackButton.innerText = "Back";
    listBackButton.setAttribute("onclick", "showScreen('student-home')");
  }

  const mediaBackButton = document.querySelector("#student-resources-media .small-btn");
  if (mediaBackButton) {
    mediaBackButton.innerText = "Back";
    mediaBackButton.setAttribute("onclick", "showScreen('student-resources-subjects')");
  }

  const moduleBackButton = document.querySelector("#student-resources-modules .small-btn");
  if (moduleBackButton) {
    moduleBackButton.innerText = "Back";
    moduleBackButton.setAttribute("onclick", "showScreen('student-resources-media')");
  }

  const detailBackButton = document.querySelector("#student-resources-detail .small-btn");
  if (detailBackButton) {
    detailBackButton.innerText = "Back";
    detailBackButton.setAttribute("onclick", "goBackFromStudentResourceDetail()");
  }
}

function setResourceScreensForAdmin() {
  ["student-resources-subjects", "student-resources-media", "student-resources-modules", "student-resources-detail"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("student-theme");
    screen.classList.add("admin-theme");
  });

  const listTitle = document.querySelector("#student-resources-subjects h2");
  if (listTitle) listTitle.innerText = "Subjects";

  const listBackButton = document.querySelector("#student-resources-subjects .small-btn");
  if (listBackButton) {
    listBackButton.innerText = "Back";
    listBackButton.setAttribute("onclick", "showScreen('admin-home')");
  }

  const mediaBackButton = document.querySelector("#student-resources-media .small-btn");
  if (mediaBackButton) {
    mediaBackButton.innerText = "Back";
    mediaBackButton.setAttribute("onclick", "showScreen('student-resources-subjects')");
  }

  const moduleBackButton = document.querySelector("#student-resources-modules .small-btn");
  if (moduleBackButton) {
    moduleBackButton.innerText = "Back";
    moduleBackButton.setAttribute("onclick", "showScreen('student-resources-media')");
  }

  const detailBackButton = document.querySelector("#student-resources-detail .small-btn");
  if (detailBackButton) {
    detailBackButton.innerText = "Back";
    detailBackButton.setAttribute("onclick", "goBackFromStudentResourceDetail()");
  }
}

async function loadResourceCategories(apiPath, body = {}) {
  showScreen("student-resources-subjects");

  const container = document.getElementById("student-resource-subject-list");
  container.innerHTML = `<p class="helper-text">Loading resources...</p>`;

  try {
    let result = await apiPost(apiPath, body, state.token);

    // Temporary compatibility fallback while the Worker routes are being stabilised.
    // Resources are now common to students and staff, so all resource routes should return the same library.
    if (!result.success && String(result.error || "").toLowerCase() === "not found") {
      const fallbackPaths = [
        "/api/resources/list",
        "/api/student/resources/list",
        "/api/admin/resources/list"
      ].filter(path => path !== apiPath);

      for (const fallbackPath of fallbackPaths) {
        const fallbackResult = await apiPost(fallbackPath, body, state.token);
        if (fallbackResult && fallbackResult.success) {
          result = fallbackResult;
          break;
        }
      }
    }

    if (!result.success) {
      container.innerHTML = `<p class="error-message">${escapeHtml(result.error || "Failed to load resources")}</p>`;
      return;
    }

    // New backend response is grouped by media type: result.groups.
    // Older response shape used result.subjects. Keep both supported for safety.
    studentResourceSubjects = Array.isArray(result.subjects) ? result.subjects : [];
    studentResourceGroupsByType = normalizeStudentResourceGroups(result);

    renderStudentResourceSubjects();
  } catch (err) {
    container.innerHTML = `<p class="error-message">Unable to load resources. Please try again.</p>`;
  }
}

function normalizeStudentResourceGroups(result) {
  const map = {};

  function addGroup(group, fallbackType) {
    if (!group) return;

    const type = String(group.type || group.key || fallbackType || "").trim().toUpperCase();
    if (!type) return;

    const subjects = Array.isArray(group.subjects) ? group.subjects : [];

    map[type] = {
      type,
      label: group.label || getCategoryLabel(type),
      count: Number(group.count || 0),
      subjects
    };
  }

  if (Array.isArray(result.groups)) {
    result.groups.forEach(group => addGroup(group));
  }

  addGroup(result.ebooks, "EBOOKS");
  addGroup(result.printables, "PRINTABLES");
  addGroup(result.audio, "AUDIO");
  addGroup(result.video, "VIDEO");
  addGroup(result.other, "OTHER");

  // Backward compatibility if an older backend still sends PDF instead of eBooks/Printables.
  addGroup(result.pdf, "EBOOKS");

  Object.keys(map).forEach(type => {
    const calculatedCount = countResourcesInSubjects(map[type].subjects);

    if (!map[type].count && calculatedCount) {
      map[type].count = calculatedCount;
    }
  });

  return map;
}

function getCategoryLabel(type) {
  const category = STUDENT_RESOURCE_CATEGORIES.find(item => item.key === String(type || "").toUpperCase());
  return category ? category.label : String(type || "Resources");
}

function getDirectMediaGroup(category) {
  if (!category) return null;
  const key = String(category.key || "").trim().toUpperCase();
  return studentResourceGroupsByType[key] || null;
}

function getDirectSubjectResources(subject) {
  if (!subject) return [];

  if (Array.isArray(subject.resources)) return subject.resources;
  if (Array.isArray(subject.Resources)) return subject.Resources;
  if (Array.isArray(subject.resourceList)) return subject.resourceList;
  if (Array.isArray(subject.items)) return subject.items;

  return [];
}

function getSubjectModules(subject) {
  if (!subject) return [];

  if (Array.isArray(subject.modules)) return subject.modules;
  if (Array.isArray(subject.Modules)) return subject.Modules;
  if (Array.isArray(subject.moduleList)) return subject.moduleList;

  const directResources = getDirectSubjectResources(subject);
  if (directResources.length > 0) {
    const moduleMap = new Map();

    directResources.forEach(resource => {
      const moduleId = String(
        resource.moduleid ||
        resource.moduleId ||
        resource.ModuleId ||
        resource.ModuleID ||
        resource.Moduleld ||
        subject.moduleid ||
        subject.moduleId ||
        subject.ModuleId ||
        subject.ModuleID ||
        ""
      ).trim();

      const moduleName = String(
        resource.modulename ||
        resource.moduleName ||
        resource.ModuleName ||
        subject.modulename ||
        subject.moduleName ||
        subject.ModuleName ||
        "General"
      ).trim() || "General";

      const moduleKey = moduleId ? `id:${moduleId.toUpperCase()}` : `name:${moduleName.toUpperCase()}`;

      const moduleSortOrder = getResourceModuleSortOrder(resource);

      if (!moduleMap.has(moduleKey)) {
        moduleMap.set(moduleKey, {
          moduleid: moduleId,
          modulename: moduleName,
          modulesortorder: moduleSortOrder,
          resources: []
        });
      } else {
        const existing = moduleMap.get(moduleKey);
        existing.modulesortorder = Math.min(existing.modulesortorder, moduleSortOrder);
      }

      moduleMap.get(moduleKey).resources.push(resource);
    });

    return Array.from(moduleMap.values()).sort((a, b) => compareResourceModuleGroups(a, b));
  }

  return [];
}

function getModuleResources(module) {
  if (!module) return [];

  if (Array.isArray(module.resources)) return module.resources;
  if (Array.isArray(module.Resources)) return module.Resources;
  if (Array.isArray(module.resourceList)) return module.resourceList;
  if (Array.isArray(module.items)) return module.items;

  return [];
}

function countResourcesInSubjects(subjects) {
  if (!Array.isArray(subjects)) return 0;

  return subjects.reduce((subjectTotal, subject) => {
    const moduleTotal = getSubjectModules(subject).reduce((sum, module) => {
      return sum + getModuleResources(module).length;
    }, 0);

    return subjectTotal + moduleTotal;
  }, 0);
}



function compareResourceIds(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function getResourceSubjectId(subjectGroup) {
  return String(subjectGroup && (
    subjectGroup.subjectid ||
    subjectGroup.subjectId ||
    subjectGroup.SubjectId ||
    subjectGroup.SubjectID ||
    subjectGroup.id
  ) || "").trim();
}

function getResourceSubjectKey(subjectGroup) {
  const id = getResourceSubjectId(subjectGroup);
  const name = getResourceSubjectName(subjectGroup);
  return id ? `id:${id.toUpperCase()}` : `name:${name.toUpperCase()}`;
}

function getResourceSubjectName(subjectGroup) {
  return String(subjectGroup && (subjectGroup.subjectname || subjectGroup.SubjectName || subjectGroup.name) || "Subject").trim() || "Subject";
}

function getResourceModuleId(moduleGroup) {
  return String(moduleGroup && (
    moduleGroup.moduleid ||
    moduleGroup.moduleId ||
    moduleGroup.ModuleId ||
    moduleGroup.ModuleID ||
    moduleGroup.id
  ) || "").trim();
}

function getResourceModuleSortOrder(moduleGroup) {
  if (!moduleGroup) {
    return Number.MAX_SAFE_INTEGER;
  }

  const possibleValues = [
    moduleGroup.modulesortorder,
    moduleGroup.moduleSortOrder,
    moduleGroup.ModuleSortOrder,
    moduleGroup.ModuleSortorder,
    moduleGroup.modulesort,
    moduleGroup.moduleSort,
    moduleGroup.ModuleSort,
    moduleGroup.sortorder,
    moduleGroup.sortOrder,
    moduleGroup.SortOrder,
    moduleGroup.moduleorder,
    moduleGroup.moduleOrder,
    moduleGroup.ModuleOrder
  ];

  const raw = possibleValues.find(value => value !== undefined && value !== null && String(value).trim() !== "");
  const numberValue = Number(raw);

  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  return Number.MAX_SAFE_INTEGER;
}

function getResourceModuleIdFromRows(rows) {
  for (const row of rows || []) {
    const id = getResourceModuleId(row && row.module) || getResourceModuleId(row && row.resource);
    if (id) return id;
  }

  return "";
}

function getResourceModuleSortOrderFromRows(rows) {
  let sortOrder = Number.MAX_SAFE_INTEGER;

  (rows || []).forEach(row => {
    sortOrder = Math.min(sortOrder, getResourceModuleSortOrder(row && row.module));
    sortOrder = Math.min(sortOrder, getResourceModuleSortOrder(row && row.resource));
  });

  return sortOrder;
}

function compareResourceModuleGroups(a, b) {
  const sortA = getResourceModuleSortOrder(a);
  const sortB = getResourceModuleSortOrder(b);

  if (sortA !== sortB) {
    return sortA - sortB;
  }

  const idA = getResourceModuleId(a);
  const idB = getResourceModuleId(b);

  if (idA || idB) {
    return compareResourceIds(idA, idB);
  }

  return String(getResourceModuleName(a) || "").localeCompare(String(getResourceModuleName(b) || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function countDistinctModuleIdsForCurrentResourceCategory(category) {
  const moduleIds = new Set();

  getCurrentSubjectGroupsForCategory(category).forEach(subjectGroup => {
    (subjectGroup.modules || []).forEach(moduleGroup => {
      const moduleId = getResourceModuleId(moduleGroup) || getResourceModuleIdFromRows(moduleGroup.rows);

      if (moduleId) {
        moduleIds.add(moduleId.toUpperCase());
      }
    });
  });

  return moduleIds.size;
}

function buildStudentResourceSubjectSummaries() {
  const subjectMap = new Map();

  STUDENT_RESOURCE_CATEGORIES.forEach(category => {
    buildMediaResourceGroups(category).forEach(subjectGroup => {
      const key = getResourceSubjectKey(subjectGroup);
      const name = getResourceSubjectName(subjectGroup);
      const count = (subjectGroup.modules || []).reduce((sum, moduleGroup) => {
        return sum + ((moduleGroup.rows || []).length);
      }, 0);

      const subjectid = getResourceSubjectId(subjectGroup);

      if (!subjectMap.has(key)) {
        subjectMap.set(key, {
          key,
          subjectid,
          name,
          total: 0,
          categoryCounts: {}
        });
      }

      const summary = subjectMap.get(key);
      summary.total += count;
      summary.categoryCounts[category.key] = (summary.categoryCounts[category.key] || 0) + count;
    });
  });

  return Array.from(subjectMap.values()).sort((a, b) => {
    const idA = a.subjectid || "";
    const idB = b.subjectid || "";

    if (idA || idB) {
      return compareResourceIds(idA, idB);
    }

    return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

function renderStudentResourceSubjects() {
  const container = document.getElementById("student-resource-subject-list");
  if (!container) return;

  currentStudentResourceMode = "";
  currentStudentResourceSubjectKey = "";
  currentStudentResourceSubjectName = "";
  currentStudentResourceSubjectCategoryCounts = {};
  currentStudentResourceModuleKey = "";
  currentStudentResourceModuleName = "";

  const subjects = buildStudentResourceSubjectSummaries();

  if (subjects.length === 0) {
    container.innerHTML = `<p class="helper-text">No resources are available yet.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="resource-subject-button-grid">
      ${subjects.map(subject => `
        <button class="resource-subject-drill-button" onclick="openStudentResourceSubject('${escapeForAttribute(subject.key)}')">
          <span class="resource-subject-button-title">${escapeHtml(subject.name)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function openStudentResourceSubject(subjectKey) {
  const subjects = buildStudentResourceSubjectSummaries();
  const selectedSubject = subjects.find(subject => subject.key === subjectKey);

  if (!selectedSubject) {
    alert("Subject not found. Please reload resources.");
    return;
  }

  currentStudentResourceSubjectKey = selectedSubject.key;
  currentStudentResourceSubjectName = selectedSubject.name;
  currentStudentResourceSubjectCategoryCounts = { ...(selectedSubject.categoryCounts || {}) };
  currentStudentResourceMode = "";
  currentStudentResourceModuleKey = "";
  currentStudentResourceModuleName = "";

  const title = document.getElementById("student-resource-media-title");
  if (title) title.innerText = selectedSubject.name;

  showScreen("student-resources-media");
  renderStudentResourceCategories(selectedSubject);
}

function renderStudentResourceCategories(selectedSubject = null) {
  const container = selectedSubject ? document.getElementById("student-resource-media-list") : document.getElementById("student-resource-subject-list");

  if (!container) return;

  const categoryButtons = STUDENT_RESOURCE_CATEGORIES.map(category => {
    const count = selectedSubject ? (selectedSubject.categoryCounts[category.key] || 0) : countResourcesForCategory(category);
    const disabledClass = count === 0 ? " is-empty" : "";
    const disabledAttr = count === 0 ? " disabled" : "";

    return `
      <button class="resource-category-button${disabledClass}" onclick="openStudentResourceCategory('${escapeForAttribute(category.key)}', ${Number(count) || 0})"${disabledAttr}>
        <span class="resource-category-main">
          <span class="resource-category-title">${escapeHtml(category.label)}</span>
          <span class="resource-category-subtitle">${escapeHtml(category.subtitle)}</span>
        </span>
      </button>
    `;
  }).join("");

  const total = STUDENT_RESOURCE_CATEGORIES.reduce((sum, category) => sum + (selectedSubject ? (selectedSubject.categoryCounts[category.key] || 0) : countResourcesForCategory(category)), 0);

  container.innerHTML = `
    <div class="resource-category-grid">
      ${categoryButtons}
    </div>
    ${total === 0 ? `<p class="helper-text">No resources are available yet.</p>` : ""}
  `;
}

function openStudentResourceCategory(categoryKey, knownCount = null) {
  const category = STUDENT_RESOURCE_CATEGORIES.find(item => item.key === categoryKey);

  if (!category) {
    alert("Resource category not found. Please reload resources.");
    return;
  }

  currentStudentResourceMode = categoryKey;
  currentStudentResourceModuleKey = "";
  currentStudentResourceModuleName = "";

  const distinctModuleIdCount = countDistinctModuleIdsForCurrentResourceCategory(category);

  if (distinctModuleIdCount > 1) {
    const title = document.getElementById("student-resource-module-title");
    if (title) {
      title.innerText = currentStudentResourceSubjectName ? `${currentStudentResourceSubjectName} - ${category.label}` : category.label;
    }

    showScreen("student-resources-modules");
    renderStudentResourceModules(category);
    return;
  }

  const title = document.getElementById("student-resource-detail-title");
  if (title) {
    title.innerText = currentStudentResourceSubjectName ? `${currentStudentResourceSubjectName} - ${category.label}` : category.label;
  }

  showScreen("student-resources-detail");
  renderStudentResourceCategoryDetail(category);
}

function filterResourceGroupsByCurrentSubject(subjectGroups) {
  if (!currentStudentResourceSubjectKey) return subjectGroups;

  return (subjectGroups || []).filter(subjectGroup => {
    return getResourceSubjectKey(subjectGroup) === currentStudentResourceSubjectKey;
  });
}

function getCurrentSubjectGroupsForCategory(category) {
  return filterResourceGroupsByCurrentSubject(buildMediaResourceGroups(category));
}

function countRowsInResourceSubjectGroups(subjectGroups) {
  return (subjectGroups || []).reduce((subjectTotal, subjectGroup) => {
    return subjectTotal + (subjectGroup.modules || []).reduce((moduleTotal, moduleGroup) => {
      return moduleTotal + ((moduleGroup.rows || []).length);
    }, 0);
  }, 0);
}

function getResourceModuleKey(moduleGroup) {
  const id = getResourceModuleId(moduleGroup);
  const name = getResourceModuleName(moduleGroup);
  return id ? `id:${id.toUpperCase()}` : `name:${name.toUpperCase()}`;
}

function getResourceModuleName(moduleGroup) {
  return String(moduleGroup && (moduleGroup.modulename || moduleGroup.ModuleName || moduleGroup.name) || "General").trim() || "General";
}

function buildCurrentResourceModuleSummaries(category) {
  const moduleMap = new Map();

  getCurrentSubjectGroupsForCategory(category).forEach(subjectGroup => {
    (subjectGroup.modules || []).forEach(moduleGroup => {
      const rows = moduleGroup.rows || [];
      if (rows.length === 0) return;

      const key = getResourceModuleKey(moduleGroup);
      const name = getResourceModuleName(moduleGroup);

      const moduleid = getResourceModuleId(moduleGroup) || getResourceModuleIdFromRows(rows);
      const modulesortorder = Math.min(
        getResourceModuleSortOrder(moduleGroup),
        getResourceModuleSortOrderFromRows(rows)
      );

      if (!moduleMap.has(key)) {
        moduleMap.set(key, {
          key,
          moduleid,
          name,
          modulesortorder,
          total: 0
        });
      } else {
        const existing = moduleMap.get(key);

        if (!existing.moduleid && moduleid) {
          existing.moduleid = moduleid;
        }

        existing.modulesortorder = Math.min(existing.modulesortorder, modulesortorder);
      }

      moduleMap.get(key).total += rows.length;
    });
  });

  return Array.from(moduleMap.values()).sort((a, b) => compareResourceModuleGroups(a, b));
}

function renderStudentResourceModules(category) {
  const container = document.getElementById("student-resource-module-list");
  if (!container) return;

  const modules = buildCurrentResourceModuleSummaries(category);

  if (modules.length === 0) {
    container.innerHTML = `<p class="helper-text">No modules are available for this media type.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="resource-subject-button-grid">
      ${modules.map(module => `
        <button class="resource-subject-drill-button" onclick="openStudentResourceModule('${escapeForAttribute(module.key)}')">
          <span class="resource-subject-button-title">${escapeHtml(module.name)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function openStudentResourceModule(moduleKey) {
  const category = STUDENT_RESOURCE_CATEGORIES.find(item => item.key === currentStudentResourceMode);

  if (!category) {
    alert("Resource category not found. Please reload resources.");
    return;
  }

  const selectedModule = buildCurrentResourceModuleSummaries(category).find(module => module.key === moduleKey);

  if (!selectedModule) {
    alert("Module not found. Please reload resources.");
    return;
  }

  currentStudentResourceModuleKey = selectedModule.key;
  currentStudentResourceModuleName = selectedModule.name;

  const title = document.getElementById("student-resource-detail-title");
  if (title) {
    title.innerText = `${selectedModule.name} - ${category.label}`;
  }

  showScreen("student-resources-detail");
  renderStudentResourceCategoryDetail(category);
}

function goBackFromStudentResourceDetail() {
  if (currentStudentResourceModuleKey) {
    showScreen("student-resources-modules");
    return;
  }

  showScreen("student-resources-media");
}

function renderStudentResourceCategoryDetail(category) {
  const container = document.getElementById("student-resource-detail-content");
  if (!container) return;

  const subjectGroups = getCurrentSubjectGroupsForCategory(category);

  if (subjectGroups.length === 0) {
    container.innerHTML = `<p class="helper-text">No ${escapeHtml(category.label)} resources are available yet.</p>`;
    return;
  }

  const filteredSubjectGroups = subjectGroups.map(subjectGroup => {
    const modules = (subjectGroup.modules || []).filter(moduleGroup => {
      return !currentStudentResourceModuleKey || getResourceModuleKey(moduleGroup) === currentStudentResourceModuleKey;
    });

    return {
      ...subjectGroup,
      modules
    };
  }).filter(subjectGroup => subjectGroup.modules.length > 0);

  if (filteredSubjectGroups.length === 0) {
    container.innerHTML = `<p class="helper-text">No ${escapeHtml(category.label)} resources are available for this module.</p>`;
    return;
  }

  container.innerHTML = filteredSubjectGroups.map(subjectGroup => `
    <div class="resource-section resource-subject-group">
      ${currentStudentResourceModuleKey ? "" : `<h3>${escapeHtml(subjectGroup.subjectname || "Subject")}</h3>`}
      ${subjectGroup.modules.map(moduleGroup => `
        <div class="resource-module-block">
          ${currentStudentResourceModuleKey ? "" : `<div class="resource-module-heading">${escapeHtml(moduleGroup.modulename || "General")}</div>`}
          <div class="resource-task-list">
            ${moduleGroup.rows.map(row => renderStudentResourceRow(row)).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");
}

function buildMediaResourceGroups(category) {
  const directGroup = getDirectMediaGroup(category);

  // Preferred new shape from Apps Script:
  // { groups: [{ type: "AUDIO", subjects: [{ subjectname, modules: [{ modulename, resources: [...] }] }] }] }
  if (directGroup) {
    const subjectGroups = [];

    (directGroup.subjects || []).forEach(subject => {
      const moduleGroups = [];

      getSubjectModules(subject).forEach(module => {
        const rows = [];
        const seenRows = new Set();

        getModuleResources(module).forEach(resource => {
          const type = getResourceType(resource, category.key);
          const link = getResourceLink(resource);
          const format = getResourceFormat(resource, type);
          const label = getResourceName(resource);

          addUniqueResourceRow(rows, seenRows, {
            subject,
            module,
            task: null,
            resource,
            taskid: resource.taskid || resource.taskId || "",
            taskname: label,
            label,
            sublabel: format,
            format,
            link,
            type,
            source: resource.source || category.key || "RESOURCE"
          });
        });

        rows.sort(resourceRowSorter);

        if (rows.length > 0) {
          moduleGroups.push({
            moduleid: getResourceModuleId(module) || getResourceModuleIdFromRows(rows),
            modulename: module.modulename || module.ModuleName || module.name || "General",
            modulesortorder: Math.min(
              getResourceModuleSortOrder(module),
              getResourceModuleSortOrderFromRows(rows)
            ),
            rows
          });
        }
      });

      moduleGroups.sort((a, b) => compareResourceModuleGroups(a, b));

      if (moduleGroups.length > 0) {
        subjectGroups.push({
          subjectid: subject.subjectid || subject.subjectId || subject.SubjectId || subject.SubjectID || "",
          subjectname: subject.subjectname || subject.SubjectName || subject.name || "Subject",
          modules: moduleGroups
        });
      }
    });

    subjectGroups.sort((a, b) => {
      const idA = getResourceSubjectId(a);
      const idB = getResourceSubjectId(b);

      if (idA || idB) {
        return compareResourceIds(idA, idB);
      }

      return String(a.subjectname || "").localeCompare(String(b.subjectname || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    });

    return subjectGroups;
  }

  // Backward-compatible fallback for the older subject/task response shape.
  const subjectGroups = [];
  const allowedTypes = new Set((category.types || [category.key]).map(type => String(type).toUpperCase()));

  getSortedResourceSubjects().forEach(subject => {
    const rows = [];
    const seenRows = new Set();

    getSubjectResourceArray(subject).forEach(resource => {
      const type = getResourceType(resource, category.key);

      if (!allowedTypes.has(type) && !allowedTypes.has(category.key)) {
        return;
      }

      addUniqueResourceRow(rows, seenRows, {
        subject,
        module: null,
        task: null,
        resource,
        taskid: "",
        taskname: "Subject Resource",
        label: getResourceName(resource),
        sublabel: getResourceFormat(resource, type),
        format: getResourceFormat(resource, type),
        link: getResourceLink(resource),
        type,
        source: "SUBJECT"
      });
    });

    
    getTaskGroups(subject).forEach(task => {
      getTaskResourceArray(task).forEach(resource => {
        const type = getResourceType(resource, category.key);

        if (!allowedTypes.has(type) && !allowedTypes.has(category.key)) {
          return;
        }

        addUniqueResourceRow(rows, seenRows, {
          subject,
          module: null,
          task,
          resource,
          taskid: task.taskid,
          taskname: task.taskname || getResourceName(resource),
          label: task.taskname || getResourceName(resource),
          sublabel: getResourceFormat(resource, type),
          format: getResourceFormat(resource, type),
          link: getResourceLink(resource),
          type,
          source: "TASK"
        });
      });
    });

    rows.sort(resourceRowSorter);

    if (rows.length > 0) {
      subjectGroups.push({
        subjectid: subject.subjectid,
        subjectname: subject.subjectname || "Subject",
        modules: [{
          moduleid: "",
          modulename: "General",
          modulesortorder: Number.MAX_SAFE_INTEGER,
          rows
        }]
      });
    }
  });

  return subjectGroups;
}

function addUniqueResourceRow(rows, seenRows, row) {
  const key = getResourceDedupeKey(row);

  if (seenRows.has(key)) {
    return;
  }

  seenRows.add(key);
  rows.push(row);
}

function getResourceDedupeKey(row) {
  const subjectId = String(row.subject && (row.subject.subjectid || row.subject.subjectId || row.subject.SubjectId || row.subject.SubjectID) || "").trim().toUpperCase();
  const moduleId = String(row.module && (row.module.moduleid || row.module.moduleId || row.module.ModuleId || row.module.ModuleID) || "").trim().toUpperCase();
  const taskId = String(row.taskid || "").trim().toUpperCase();
  const resource = row.resource || {};
  const resourceId = String(
    resource.id ||
    resource.resourceid ||
    resource.resourceId ||
    resource.ResourceId ||
    resource.taskresourceid ||
    resource.taskResourceId ||
    resource.VideoId ||
    resource.videoId ||
    resource.videoid ||
    resource.AudioId ||
    resource.audioId ||
    resource.audioid ||
    resource.EbookId ||
    resource.eBookId ||
    resource.ebookId ||
    resource.ebookid ||
    resource.PrintableId ||
    resource.printableId ||
    resource.printableid ||
    resource.OtherResourceId ||
    resource.otherResourceId ||
    resource.otherresourceid ||
    ""
  ).trim().toUpperCase();
  const type = String(row.type || "").trim().toUpperCase();
  const link = String(row.link || "").trim();
  const label = String(row.label || "").trim().toUpperCase();
  const source = String(row.source || "").trim().toUpperCase();

  if (resourceId) {
    return [source, subjectId, moduleId, taskId, resourceId].join("|");
  }

  return [source, subjectId, moduleId, taskId, type, link, label].join("|");
}

function renderStudentResourceRow(row) {
  const link = row.link || "";
  const type = String(row.type || "LINK").toUpperCase();
  const title = row.label || row.name || "Resource";
  const disabled = link ? "" : " disabled";
  const buttonLabel = getSmallResourceButtonLabel(type);
  const rowId = makeResourceRowId(row);
  const format = row.format || row.sublabel || getDisplayResourceType(type);
  const isAudio = type === "AUDIO";
  const isVideo = type === "VIDEO";

  const actionHtml = (isAudio || isVideo)
    ? `
      <button class="resource-arrow-btn" onclick="toggleInlineResourcePreview('${escapeForAttribute(rowId)}', '${escapeForAttribute(link)}', '${escapeForAttribute(type)}')"${disabled} aria-label="${escapeForAttribute(buttonLabel)}">
        ›
      </button>
    `
    : `
      <button class="resource-arrow-btn" onclick="openStudentResourceLink('${escapeForAttribute(link)}', '${escapeForAttribute(type)}', '${escapeForAttribute(title)}')"${disabled} aria-label="${escapeForAttribute(buttonLabel)}">
        ›
      </button>
    `;

  const previewHtml = (isAudio || isVideo)
    ? `<div id="${escapeForAttribute(rowId)}" class="inline-resource-preview hidden"></div>`
    : "";

  return `
    <div class="student-resource-row">
      <div class="student-resource-row-main">
        <div class="student-resource-title">${escapeHtml(title)}</div>
        <div class="student-resource-meta">
          <span class="resource-type-badge small-badge">${escapeHtml(getDisplayResourceType(type))}</span>
          ${format ? `<span class="resource-format-text">${escapeHtml(format)}</span>` : ""}
        </div>
        ${previewHtml}
      </div>
      ${actionHtml}
    </div>
  `;
}

function makeResourceRowId(row) {
  const raw = [
    row.source || "resource",
    row.subject && (row.subject.subjectname || row.subject.SubjectName) || "subject",
    row.module && (row.module.modulename || row.module.ModuleName) || "module",
    row.label || row.name || "item",
    row.link || "link"
  ].join("-");

  return "resource-preview-" + raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getDisplayResourceType(type) {
  const resourceType = String(type || "").toUpperCase();

  if (resourceType === "EBOOKS" || resourceType === "EBOOK") return "EBOOK";
  if (resourceType === "PRINTABLES" || resourceType === "PRINTABLE") return "PRINT";
  if (resourceType === "AUDIO") return "AUDIO";
  if (resourceType === "VIDEO") return "VIDEO";
  if (resourceType === "OTHER") return "OTHER";

  return resourceType || "LINK";
}

function toggleInlineResourcePreview(playerId, link, type) {
  if (!link) {
    return;
  }

  const previewBox = document.getElementById(playerId);

  if (!previewBox) {
    return;
  }

  const isHidden = previewBox.classList.contains("hidden");

  // Close other inline players so the screen stays tidy.
  document.querySelectorAll(".inline-resource-preview, .inline-audio-player").forEach(player => {
    if (player.id !== playerId) {
      player.classList.add("hidden");
      player.innerHTML = "";
    }
  });

  if (!isHidden) {
    previewBox.classList.add("hidden");
    previewBox.innerHTML = "";
    return;
  }

  const resourceType = String(type || "").toUpperCase();

  if (resourceType === "VIDEO") {
    previewBox.innerHTML = `
      <video class="resource-video-control" controls controlsList="nodownload" preload="metadata">
        <source src="${escapeForAttribute(link)}" />
        Your browser cannot play this video file.
      </video>
    `;
  } else {
    previewBox.innerHTML = `
      <audio class="resource-audio-control" controls controlsList="nodownload" preload="none">
        <source src="${escapeForAttribute(link)}" />
        Your browser cannot play this audio file.
      </audio>
    `;
  }

  previewBox.classList.remove("hidden");
}

function toggleInlineAudioPlayer(playerId, link) {
  toggleInlineResourcePreview(playerId, link, "AUDIO");
}

function openStudentResourceLink(link, type, title = "PDF Viewer") {
  if (!link) {
    return;
  }

  const resourceType = String(type || "").toUpperCase();

  if (resourceType === "EBOOKS" || resourceType === "EBOOK" || resourceType === "PRINTABLES" || resourceType === "PRINTABLE" || isPdfLink(link)) {
    openPdfResource(link, title || "PDF Viewer");
    return;
  }

  window.open(link, "_blank", "noopener,noreferrer");
}

function openPdfResource(link, title = "PDF Viewer") {
  if (!link) {
    return;
  }

  const viewerScreen = document.getElementById("pdf-viewer-screen");
  const viewerFrame = document.getElementById("pdf-viewer-frame");
  const viewerTitle = document.getElementById("pdf-viewer-title");

  // Safety fallback: if the PDF viewer screen was not added to index.html,
  // still allow the resource to open normally.
  if (!viewerScreen || !viewerFrame) {
    window.open(link, "_blank", "noopener,noreferrer");
    return;
  }

  const activeScreen = document.querySelector(".screen.active");
  previousPdfScreenId = activeScreen ? activeScreen.id : "";
  currentPdfDirectLink = link;

  viewerScreen.classList.remove("student-theme", "admin-theme");
  if (activeScreen && activeScreen.classList.contains("admin-theme")) {
    viewerScreen.classList.add("admin-theme");
  } else {
    viewerScreen.classList.add("student-theme");
  }

  if (viewerTitle) {
    viewerTitle.innerText = title || "PDF Viewer";
  }

 const cleanLink = String(link || "").trim();

let pdfFileForViewer;

if (cleanLink.startsWith("http://") || cleanLink.startsWith("https://")) {
  pdfFileForViewer = `/pdf-file/${base64UrlEncode(cleanLink)}`;
} else {
  pdfFileForViewer = cleanLink;
}

viewerFrame.src = `${PDFJS_VIEWER_PATH}?file=${pdfFileForViewer}`;

document.body.classList.add("pdf-viewer-open");
showScreen("pdf-viewer-screen");
}

function base64UrlEncode(value) {
  const utf8 = encodeURIComponent(String(value || "")).replace(
    /%([0-9A-F]{2})/g,
    function (_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    }
  );

  return btoa(utf8)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}






function closePdfViewer() {
  const viewerFrame = document.getElementById("pdf-viewer-frame");

  if (viewerFrame) {
    viewerFrame.src = "";
  }

  document.body.classList.remove("pdf-viewer-open");

  if (previousPdfScreenId && document.getElementById(previousPdfScreenId)) {
    showScreen(previousPdfScreenId);
  } else {
    goHome();
  }
}

function openCurrentPdfDirect() {
  if (currentPdfDirectLink) {
    window.open(currentPdfDirectLink, "_blank", "noopener,noreferrer");
  }
}

function isPdfLink(link) {
  return /\.pdf($|[?#])/i.test(String(link || ""));
}

function getSmallResourceButtonLabel(type) {
  const resourceType = String(type || "").toUpperCase();

  if (resourceType === "EBOOKS" || resourceType === "EBOOK") return "Open eBook";
  if (resourceType === "PRINTABLES" || resourceType === "PRINTABLE") return "Open Printable";
  if (resourceType === "PDF") return "Open PDF";
  if (resourceType === "AUDIO") return "Play Audio";
  if (resourceType === "VIDEO" || resourceType === "MOVIE") return "Watch Video";
  if (resourceType === "IMAGE" || resourceType === "VISUAL") return "Open Image";

  return "Open Resource";
}

function getSortedResourceSubjects() {
  return [...studentResourceSubjects].sort((a, b) => {
    const idA = getResourceSubjectId(a);
    const idB = getResourceSubjectId(b);

    if (idA || idB) {
      return compareResourceIds(idA, idB);
    }

    return String(a.subjectname || "").localeCompare(String(b.subjectname || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

function getTaskGroups(subject) {
  if (!subject || !Array.isArray(subject.tasks)) return [];

  return [...subject.tasks].sort((a, b) => sortByTaskId(a, b));
}

function resourceRowSorter(a, b) {
  if (a.source !== b.source) {
    // Show subject-level resources first, then task resources.
    return a.source === "SUBJECT" ? -1 : 1;
  }

  const taskCompare = sortByTaskId(a, b);
  if (taskCompare !== 0) return taskCompare;

  return String(a.label || "").localeCompare(String(b.label || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function getSubjectResourceArray(subject) {
  if (!subject) return [];

  if (Array.isArray(subject.subjectResources)) return subject.subjectResources;
  if (Array.isArray(subject.subjectresources)) return subject.subjectresources;
  if (Array.isArray(subject.subject_resources)) return subject.subject_resources;
  if (Array.isArray(subject.SubjectResources)) return subject.SubjectResources;
  if (Array.isArray(subject.subjectResoureces)) return subject.subjectResoureces;
  if (Array.isArray(subject.subjectresoureces)) return subject.subjectresoureces;

  return [];
}

function getTaskResourceArray(task) {
  if (!task) return [];

  if (Array.isArray(task.resources)) return task.resources;
  if (Array.isArray(task.taskResources)) return task.taskResources;
  if (Array.isArray(task.taskresources)) return task.taskresources;
  if (Array.isArray(task.task_resources)) return task.task_resources;
  if (Array.isArray(task.TaskResources)) return task.TaskResources;

  return [];
}

function getResourceName(resource) {
  if (!resource) return "Resource";

  return String(
    resource.name ||
    resource.label ||
    resource.title ||
    resource.Title ||
    resource.resourcename ||
    resource.resourceName ||
    resource.ResourceName ||
    resource.taskresourcename ||
    resource.taskResourceName ||
    resource.VideoName ||
    resource.videoName ||
    resource.videoname ||
    resource.AudioName ||
    resource.audioName ||
    resource.audioname ||
    resource.EbookName ||
    resource.eBookName ||
    resource.ebookName ||
    resource.ebookname ||
    resource.PrintableName ||
    resource.printableName ||
    resource.printablename ||
    resource.OtherResourceName ||
    resource.otherResourceName ||
    resource.otherresourcename ||
    "Resource"
  ).trim();
}

function getResourceType(resource, fallbackType) {
  return String(
    resource && (resource.type || resource.resourcetype || resource.resourceType) ||
    fallbackType ||
    "LINK"
  ).trim().toUpperCase();
}

function getResourceFormat(resource, fallbackType) {
  if (!resource) return getDisplayResourceType(fallbackType);

  return String(
    resource.format ||
    resource.resourceformat ||
    resource.resourceFormat ||
    resource.eBookFormat ||
    resource.ebookformat ||
    resource.PrintableFormat ||
    resource.printableformat ||
    resource.AudioFormat ||
    resource.audioformat ||
    resource.VideoFormat ||
    resource.videoformat ||
    resource.OtherResourceFormat ||
    resource.otherresourceformat ||
    getDisplayResourceType(fallbackType)
  ).trim();
}

function getResourceLink(resource) {
  return String(
    resource && (
      resource.link ||
      resource.resourcelink ||
      resource.resourceLink ||
      resource.eBookLink ||
      resource.ebooklink ||
      resource.PrintableLink ||
      resource.printablelink ||
      resource.AudioLink ||
      resource.audiolink ||
      resource.VideoLink ||
      resource.videolink ||
      resource.OtherResourceLink ||
      resource.otherResourceLink ||
      resource.otherresourcelink ||
      resource.url ||
      resource.URL
    ) ||
    ""
  ).trim();
}

function countResourcesForCategory(category) {
  if (!category) return 0;

  const directGroup = getDirectMediaGroup(category);
  if (directGroup) {
    return countResourcesInSubjects(directGroup.subjects);
  }

  return buildMediaResourceGroups(category).reduce((sum, group) => {
    return sum + group.modules.reduce((moduleSum, module) => moduleSum + module.rows.length, 0);
  }, 0);
}

function countResourcesForSubject(subject) {
  const subjectResources = getSubjectResourceArray(subject).length;

  const taskResources = Array.isArray(subject.tasks)
    ? subject.tasks.reduce((sum, task) => {
        return sum + getTaskResourceArray(task).length;
      }, 0)
    : 0;

  return subjectResources + taskResources;
}


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
  studentDropdownOpen: false
};

function showManageStudents() {
  manageStudentsState.mode = "register";
  manageStudentsState.searchResults = [];
  manageStudentsState.searchQuery = "";
  manageStudentsState.selectedStudent = null;
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.selectedStudentActiveDraft = true;
  manageStudentsState.studentDropdownOpen = false;
  showScreen("manage-students-screen");
  renderManageStudentsScreen();
  loadStudentAssignmentOptions();
}

async function loadStudentAssignmentOptions() {
  if (manageStudentsState.assignmentOptions) {
    renderManageStudentsScreen();
    return;
  }

  const result = await apiPost("/api/admin/students/assignment-options", {}, state.token);

  if (result.success) {
    manageStudentsState.assignmentOptions = result.subjects || [];
  } else {
    manageStudentsState.assignmentOptions = [];
  }

  renderManageStudentsScreen();
}

function setManageStudentsMode(mode) {
  manageStudentsState.mode = mode === "modify" ? "modify" : "register";
  manageStudentsState.lastRegisteredStudent = null;

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
  const container = document.getElementById("manage-students-content");
  if (!container) return;

  const isRegister = manageStudentsState.mode === "register";

  container.innerHTML = `
    <div class="student-admin-mode-toggle" role="tablist" aria-label="Student management mode">
      <button
        type="button"
        class="student-admin-mode-btn ${isRegister ? "is-active" : ""}"
        onclick="setManageStudentsMode('register')"
      >
        Register
      </button>
      <button
        type="button"
        class="student-admin-mode-btn ${!isRegister ? "is-active" : ""}"
        onclick="setManageStudentsMode('modify')"
      >
        Modify
      </button>
    </div>

    ${isRegister ? renderRegisterStudentPanel() : renderModifyStudentPanel()}
  `;
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
        <input type="radio" name="student-assignment-mode" value="all" checked onchange="toggleStudentAssignmentMode()" />
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
      <button type="button" onclick="submitRegisterStudent(false)">Register Student</button>
    </div>

    <div id="student-register-feedback" class="student-admin-feedback"></div>
  `;
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
            data-subjectid="${escapeHtml(subjectId)}"
            data-moduleid="${escapeHtml(moduleId)}"
          />
          <span>${escapeHtml(moduleName)}</span>
          <small>${taskCount} task${taskCount === 1 ? "" : "s"}</small>
        </label>
      `;
    }).join("");

    return `
      <div class="student-assignment-subject-card">
        <label class="student-subject-check-row">
          <input type="checkbox" onchange="toggleStudentSubjectModules('${escapeJsString(subjectId)}', this.checked)" />
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
  const optionsBox = document.getElementById("student-assignment-options");

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
  const nameInput = document.getElementById("student-register-name");
  const whatsappInput = document.getElementById("student-register-whatsapp");
  const groupInput = document.getElementById("student-register-group");
  const feedback = document.getElementById("student-register-feedback");

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

  if (feedback) {
    feedback.textContent = "Registering student...";
  }

  const result = await apiPost("/api/admin/register-student", {
    username,
    whatsapp6,
    classgroup,
    confirmDuplicate: confirmDuplicate === true,
    assignmentMode,
    selectedModules
  }, state.token);

  if (result.duplicate) {
    if (feedback) {
      feedback.textContent = "Possible duplicate found.";
    }

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
    if (feedback) {
      feedback.textContent = result.error || "Registration failed.";
    }
    return;
  }

  manageStudentsState.lastRegisteredStudent = normalizeManagedStudent(result);
  showScreen("manage-students-result-screen");
  renderManageStudentResultScreen("registered");
}

function renderManageStudentResultScreen(context) {
  const container = document.getElementById("manage-students-result-content");
  if (!container) return;

  const student = manageStudentsState.lastRegisteredStudent || manageStudentsState.selectedStudent;

  if (!student) {
    container.innerHTML = `<p class="helper-text">No student selected.</p>`;
    return;
  }

  const actionButtons = context === "registered"
    ? `
      <div class="student-admin-action-grid two-col">
        <button type="button" onclick="registerAnotherManagedStudent()">Register Another Student</button>
        <button type="button" onclick="showScreen('admin-home')">Exit to Dashboard</button>
      </div>
    `
    : `
      <div class="student-admin-action-grid two-col">
        <button type="button" onclick="backToManagedStudentList()">Back to Student List</button>
        <button type="button" onclick="showScreen('admin-home')">Exit to Dashboard</button>
      </div>
    `;

  container.innerHTML = `
    ${renderStudentMessageResult(student, context || "registered")}
    ${actionButtons}
  `;
}

function registerAnotherManagedStudent() {
  manageStudentsState.mode = "register";
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.selectedStudent = null;
  showScreen("manage-students-screen");
  renderManageStudentsScreen();
}

function backToManagedStudentList() {
  manageStudentsState.mode = "modify";
  manageStudentsState.selectedStudent = null;
  showScreen("manage-students-screen");
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
          oninput="filterManagedStudentsFromInput()"
          onkeydown="handleStudentSearchKey(event)"
        />
        <button
          type="button"
          class="student-search-arrow-btn"
          onclick="toggleManagedStudentDropdown()"
          aria-label="Show student list"
        >${dropdownLabel}</button>
      </div>

      <p class="student-admin-help">Tap the arrow to open the student list, or type to filter.</p>
      <div id="student-search-feedback" class="student-admin-feedback">
        ${manageStudentsState.studentListLoaded ? `${shownCount} of ${totalCount} student${totalCount === 1 ? "" : "s"} shown.` : ""}
      </div>
      ${loadingText}

      <div class="student-search-dropdown ${manageStudentsState.studentDropdownOpen ? "is-open" : ""}">
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

  const result = await apiPost("/api/admin/students/search", {
    query: "",
    listAll: true
  }, state.token);

  manageStudentsState.studentListLoading = false;

  if (!result.success) {
    manageStudentsState.allStudents = [];
    manageStudentsState.searchResults = [];
    manageStudentsState.studentListLoaded = true;
    renderManageStudentsScreen();
    const feedback = document.getElementById("student-search-feedback");
    if (feedback) feedback.textContent = result.error || "Could not load student list.";
    return;
  }

  manageStudentsState.allStudents = sortManagedStudents((result.students || []).map(normalizeManagedStudent));
  manageStudentsState.studentListLoaded = true;
  applyManagedStudentFilter(manageStudentsState.searchQuery || "");
  renderManageStudentsScreen();

  const feedback = document.getElementById("student-search-feedback");
  if (feedback) {
    feedback.textContent = `${manageStudentsState.searchResults.length} student${manageStudentsState.searchResults.length === 1 ? "" : "s"} shown.`;
  }
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
      <button type="button" class="student-search-row" onclick="selectManagedStudentByUniqueId('${escapeJsString(student.uniqueid)}')">
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
  const input = document.getElementById("student-search-query");
  const query = input ? input.value : "";
  manageStudentsState.searchQuery = query;
  manageStudentsState.studentDropdownOpen = true;
  applyManagedStudentFilter(query);
  updateManagedStudentListOnly();
}

function updateManagedStudentListOnly() {
  const list = document.querySelector(".managed-student-list");
  const feedback = document.getElementById("student-search-feedback");

  if (list) {
    list.innerHTML = renderManagedStudentList();
  }

  if (feedback) {
    feedback.textContent = `${manageStudentsState.searchResults.length} student${manageStudentsState.searchResults.length === 1 ? "" : "s"} shown.`;
  }
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
  const input = document.getElementById("student-search-query");
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
  showScreen("manage-student-edit-screen");
  renderManagedStudentEditScreen();
}

function selectManagedStudent(index) {
  const student = manageStudentsState.searchResults[index];

  if (!student) return;

  manageStudentsState.selectedStudent = normalizeManagedStudent(student);
  manageStudentsState.selectedStudentActiveDraft = manageStudentsState.selectedStudent.active === true;
  manageStudentsState.studentDropdownOpen = false;
  showScreen("manage-student-edit-screen");
  renderManagedStudentEditScreen();
}

function renderManagedStudentEditScreen() {
  const container = document.getElementById("manage-student-edit-content");
  if (!container) return;

  if (!manageStudentsState.selectedStudent) {
    container.innerHTML = `<p class="helper-text">No student selected.</p>`;
    return;
  }

  container.innerHTML = renderSelectedStudentEditor();
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
      <button type="button" class="student-reset-pin-btn" onclick="resetManagedStudentPin()">Reset PIN</button>
    </div>

    <div class="student-admin-card selected-student-edit-card">
      <div class="student-admin-card-title">Edit Student Details</div>

      <label class="student-admin-label" for="student-edit-name">Name</label>
      <input id="student-edit-name" class="student-prefilled-input" type="text" value="${escapeAttribute(student.username || "")}" />

      <label class="student-admin-label" for="student-edit-whatsapp">WhatsApp Number</label>
      <input id="student-edit-whatsapp" class="student-prefilled-input" type="tel" inputmode="tel" value="${escapeAttribute(student.whatsapp6 || "")}" />

      <label class="student-admin-label" for="student-edit-group">Group</label>
      <input id="student-edit-group" class="student-prefilled-input" type="number" inputmode="numeric" min="0" value="${escapeAttribute(student.classgroup || DEFAULT_STUDENT_GROUP)}" />

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
    <button
      id="student-edit-active-btn"
      class="student-active-toggle"
      type="button"
      onclick="toggleStudentEditActiveStatus()"
    >
      Active
    </button>
  </div>
</div>
    </div>

    <div class="student-admin-action-grid">
      <button type="button" onclick="saveManagedStudentChanges()">Confirm Changes</button>
    </div>

    ${renderStudentMessageResult(student, "selected")}

    <div id="student-edit-feedback" class="student-admin-feedback"></div>
  `;
}

function toggleSelectedStudentActive() {
  manageStudentsState.selectedStudentActiveDraft = !manageStudentsState.selectedStudentActiveDraft;

  const button = document.querySelector(".student-active-toggle");
  if (!button) return;

  button.classList.toggle("is-active", manageStudentsState.selectedStudentActiveDraft);
  button.classList.toggle("is-inactive", !manageStudentsState.selectedStudentActiveDraft);
  button.dataset.active = manageStudentsState.selectedStudentActiveDraft ? "true" : "false";
  button.textContent = manageStudentsState.selectedStudentActiveDraft ? "Active" : "Inactive";
}

async function saveManagedStudentChanges() {
  const student = manageStudentsState.selectedStudent;
  const feedback = document.getElementById("student-edit-feedback");

  if (!student) return;

  const username = document.getElementById("student-edit-name").value.trim();
  const whatsappRaw = document.getElementById("student-edit-whatsapp").value.trim();
  const classgroup = document.getElementById("student-edit-group").value.trim() || String(DEFAULT_STUDENT_GROUP);
  const activeButton = document.getElementById("student-edit-active");
  const active = activeButton
    ? activeButton.dataset.active === "true"
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

  if (feedback) feedback.textContent = "Saving changes...";

  const result = await apiPost("/api/admin/update-student", payload, state.token);

  if (!result.success) {
    if (feedback) feedback.textContent = result.error || "Could not save changes.";
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

  const newFeedback = document.getElementById("student-edit-feedback");
  if (newFeedback) newFeedback.textContent = "Student changes saved.";
}

async function resetManagedStudentPin() {
  const student = manageStudentsState.selectedStudent;

  if (!student) return;

  const proceed = confirm("Reset this student's PIN? They will create a new 4-digit PIN on next login.");
  if (!proceed) return;

  const result = await apiPost("/api/admin/reset-pin", {
    uniqueid: student.uniqueid
  }, state.token);

  const feedback = document.getElementById("student-edit-feedback");

  if (!result.success) {
    if (feedback) feedback.textContent = result.error || "PIN reset failed.";
    return;
  }

  if (feedback) {
    feedback.textContent = "PIN reset successfully. The student can use the same link and create a new PIN.";
  }
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
      <div class="student-link-box">${escapeHtml(loginLink)}</div>
      ${assignmentLine}

      <label class="student-admin-label" for="${messageBoxId}">WhatsApp Message</label>
      <textarea
        id="${messageBoxId}"
        class="student-message-textarea"
        rows="11"
      >${escapeHtml(message)}</textarea>
      <p class="student-admin-help">You can edit this message before copying it or opening WhatsApp.</p>

      <div class="student-admin-action-grid three-col">
        <button type="button" onclick="copyStudentLoginLink('${escapeJsString(loginLink)}')">Copy Link</button>
        <button type="button" onclick="copyStudentWelcomeMessageFromBox('${escapeJsString(messageBoxId)}', '${escapeJsString(loginLink)}')">Copy Message</button>
        <button type="button" onclick="openStudentWhatsAppMessageFromBox('${escapeJsString(messageBoxId)}', '${escapeJsString(loginLink)}')">Open WhatsApp</button>
      </div>
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
  const box = document.getElementById(messageBoxId);
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

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeJsString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function cssEscapeValue(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(String(value || ""));
  }

  return String(value || "").replace(/"/g, "\\\"");
}

/* =========================
   SUBJECTS UI
========================= */

let allSubjects = [];
let pendingSubjects = [];
let selectedSubject = null;
let selectedSubjectDraftActive = null;

async function showSubjectsScreen() {
  showScreen("subjects-screen");

  pendingSubjects = [];
  selectedSubject = null;
  selectedSubjectDraftActive = null;

  document.getElementById("subject-add-message").innerText = "";
  document.getElementById("modify-subject-box").classList.add("hidden");

  renderSubjectAddRows();
  await loadSubjectsForModify();
}

function renderSubjectAddRows() {
  const container = document.getElementById("subject-add-list");
  const submitBtn = document.getElementById("submit-subjects-btn");

  let html = "";

  pendingSubjects.forEach((name, index) => {
    html += `
      <div class="pending-subject-chip">
        <span>${escapeHtml(name)}</span>
        <button onclick="removePendingSubject(${index})">Remove</button>
      </div>
    `;
  });

  if (pendingSubjects.length < 5) {
    html += `
      <div class="subject-add-row">
        <input
          id="new-subject-input"
          type="text"
          placeholder="add a new subject"
          onkeydown="handleSubjectInputKey(event)"
        />
        <button class="enter-btn" onclick="addPendingSubject()">↵</button>
      </div>
    `;
  }

  container.innerHTML = html;

  if (pendingSubjects.length > 0) {
    submitBtn.classList.remove("hidden");
  } else {
    submitBtn.classList.add("hidden");
  }
}

function handleSubjectInputKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    addPendingSubject();
  }
}

function addPendingSubject() {
  const input = document.getElementById("new-subject-input");
  const subjectName = input ? input.value.trim() : "";

  if (!subjectName) {
    alert("Enter a subject name.");
    return;
  }

  if (pendingSubjects.length >= 5) {
    alert("You can add up to 5 subjects at once.");
    return;
  }

  const normalizedNew = normalizeClientText(subjectName);

  const duplicatePending = pendingSubjects.some(
    name => normalizeClientText(name) === normalizedNew
  );

  if (duplicatePending) {
    alert("This subject is already in your pending list.");
    return;
  }

  const duplicateExisting = allSubjects.some(
    subject => normalizeClientText(subject.subjectname) === normalizedNew
  );

  if (duplicateExisting) {
    alert("This subject already exists.");
    return;
  }

  pendingSubjects.push(subjectName);
  renderSubjectAddRows();

  setTimeout(() => {
    const nextInput = document.getElementById("new-subject-input");
    if (nextInput) nextInput.focus();
  }, 50);
}

function removePendingSubject(index) {
  pendingSubjects.splice(index, 1);
  renderSubjectAddRows();
}

async function submitPendingSubjects() {
  if (pendingSubjects.length === 0) {
    return;
  }

  const added = [];
  const failed = [];

  for (const subjectName of pendingSubjects) {
    const result = await apiPost("/api/admin/subjects/create", {
      subjectName
    }, state.token);

    if (result.success) {
      added.push(result.subject.subjectname);
    } else {
      failed.push({
        subjectName,
        error: result.error || "Failed"
      });
    }
  }

  if (added.length > 0) {
    document.getElementById("subject-add-message").innerText =
      `${added.join(", ")} ${added.length === 1 ? "has" : "have"} been added.`;
  }

  if (failed.length > 0) {
    alert(
      "Some subjects were not added:\n" +
      failed.map(f => `${f.subjectName}: ${f.error}`).join("\n")
    );
  }

  pendingSubjects = [];
  renderSubjectAddRows();
  await loadSubjectsForModify();
}

async function loadSubjectsForModify() {
  const select = document.getElementById("modify-subject-select");

  select.innerHTML = `<option value="">Loading subjects...</option>`;

  const result = await apiPost("/api/admin/subjects/list", {}, state.token);

  if (!result.success) {
    select.innerHTML = `<option value="">Failed to load subjects</option>`;
    return;
  }

  allSubjects = result.subjects || [];

  select.innerHTML = `<option value="">Select subject...</option>`;

  allSubjects.forEach(subject => {
    const status = subject.active === true ? "ACTIVE" : "INACTIVE";

    const option = document.createElement("option");
    option.value = subject.subjectid;
    option.textContent = `${subject.subjectname} — ${status}`;

    select.appendChild(option);
  });
}

function selectSubjectToModify() {
  const subjectid = document.getElementById("modify-subject-select").value;

  selectedSubject = allSubjects.find(subject => subject.subjectid === subjectid);

  const box = document.getElementById("modify-subject-box");

  if (!selectedSubject) {
    box.classList.add("hidden");
    selectedSubjectDraftActive = null;
    return;
  }

  selectedSubjectDraftActive = selectedSubject.active === true;

  document.getElementById("modify-subject-name").value = selectedSubject.subjectname;

  renderSelectedSubjectStatus();

  box.classList.remove("hidden");
}

function renderSelectedSubjectStatus() {
  const statusDisplay = document.getElementById("selected-subject-status");
  const statusBtn = document.getElementById("toggle-subject-status-btn");

  if (!selectedSubject) {
    statusDisplay.innerText = "STATUS: -";
    statusBtn.innerText = "Change Status";
    return;
  }

  statusDisplay.innerText = selectedSubjectDraftActive
    ? "STATUS: ACTIVE"
    : "STATUS: INACTIVE";

  statusBtn.innerText = selectedSubjectDraftActive
    ? "Make Inactive"
    : "Make Active";
}

function toggleSubjectStatusLocal() {
  if (!selectedSubject) {
    alert("Select a subject first.");
    return;
  }

  selectedSubjectDraftActive = !selectedSubjectDraftActive;
  renderSelectedSubjectStatus();
}

async function saveSubjectChanges() {
  if (!selectedSubject) {
    alert("Select a subject first.");
    return;
  }

  const subjectName = document.getElementById("modify-subject-name").value.trim();

  if (!subjectName) {
    alert("Subject name cannot be empty.");
    return;
  }

  const result = await apiPost("/api/admin/subjects/update", {
    subjectid: selectedSubject.subjectid,
    subjectName,
    active: selectedSubjectDraftActive
  }, state.token);

  if (!result.success) {
    alert(result.error || "Could not update subject.");
    return;
  }

  alert("Subject changes saved.");

  await loadSubjectsForModify();

  document.getElementById("modify-subject-box").classList.add("hidden");
  selectedSubject = null;
  selectedSubjectDraftActive = null;
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
  showScreen("progress-report");
  await loadProgressSelectors();
}

async function loadProgressSelectors() {
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

  const groupSelect = document.getElementById("progress-group-select");
  const studentSelect = document.getElementById("progress-student-select");

  const groups = [...new Set(result.students.map(s => s.classgroup))]
    .filter(group => group && String(group).trim() !== "0")
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

  groupSelect.innerHTML = `<option value="">Select a Group...</option>`;

  groups.forEach(group => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    groupSelect.appendChild(option);
  });

  const studentsMap = {};

  result.students.forEach(row => {
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
  const group = document.getElementById("progress-group-select").value;

  if (!group) {
    alert("Select a group first.");
    return;
  }

  openProgressContext("group", group);
}

function openSelectedStudentProgress() {
  const studentid = document.getElementById("progress-student-select").value;

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
    document.getElementById("progress-subjects-title").innerText = "Class Modules";
    await loadProgressSubjects();
    return;
  }

  if (type === "group") {
    progressState.classgroup = value;
    progressState.studentid = "ALL";
    document.getElementById("progress-subjects-title").innerText = `${value} Modules`;
    await loadProgressSubjects();
    return;
  }

  if (type === "student") {
    progressState.classgroup = "ALL";
    progressState.studentid = value;
    progressState.subjectid = "ALL";
    progressState.taskid = "ALL";

    const selectedOption = document.querySelector(
      `#progress-student-select option[value="${CSS.escape(value)}"]`
    );

    const name = selectedOption ? selectedOption.textContent : "Student";

    progressState.studentName = name;
    document.getElementById("progress-subjects-title").innerText = `${name}'s Subjects`;

    await loadProgressSubjects();
  }
}

async function loadProgressSubjects() {
  setManualRefreshButton("progress-subjects-screen", "refreshProgressSubjects(this)");
  showScreen("progress-subjects-screen");

  const container = document.getElementById("progress-subjects-list");
  container.innerHTML = `<p class="helper-text">Loading subjects...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: progressState.classgroup,
    subjectid: "ALL",
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load modules."}</p>`;
    return;
  }

  if (!result.subjects || result.subjects.length === 0) {
    container.innerHTML = `<p class="helper-text">No assigned modules found.</p>`;
    return;
  }

  const subjects = result.subjects.map(normalizeProgressSubject).sort(sortProgressSubjects);

  container.innerHTML = subjects.map(subject => `
    <button class="progress-list-button" onclick="openProgressSubject('${escapeForAttribute(subject.subjectid)}', '${escapeForAttribute(subject.subjectname)}')">
      <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
      ${renderProgressBars(subject.completedPercent, subject.verifiedPercent)}
    </button>
  `).join("");
}

async function openProgressSubject(subjectid, subjectname) {
  progressState.subjectid = subjectid;
  progressState.subjectname = subjectname;
  progressState.taskid = "ALL";

  if (progressState.contextType === "student") {
    document.getElementById("progress-task-students-title").innerText = subjectname;
    await loadIndividualStudentTaskList();
    return;
  }

  document.getElementById("progress-tasks-title").innerText = subjectname;

  await loadProgressTasks();
}

async function loadProgressTasks() {
  setManualRefreshButton("progress-tasks-screen", "refreshProgressTasks(this)");
  showScreen("progress-tasks-screen");

  const container = document.getElementById("progress-tasks-list");
  container.innerHTML = `<p class="helper-text">Loading tasks...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: progressState.classgroup,
    subjectid: progressState.subjectid,
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load tasks."}</p>`;
    return;
  }

  if (!result.tasks || result.tasks.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks found.</p>`;
    return;
  }

  const sortedTasks = result.tasks.map(normalizeProgressTask).sort(sortProgressTasks);

  container.innerHTML = sortedTasks.map(task => `
    <button class="progress-list-button" onclick="openProgressTask('${escapeForAttribute(task.taskid)}', '${escapeForAttribute(task.taskname)}')">
      <span class="progress-list-title">${escapeHtml(task.taskname)}</span>
      ${renderProgressBars(task.completedPercent, task.verifiedPercent)}
    </button>
  `).join("");
}

async function openProgressTask(taskid, taskname) {
  progressState.taskid = taskid;
  progressState.taskname = taskname;

  const title = progressState.contextType === "group"
    ? `${taskname} ${progressState.classgroup}`
    : taskname;

  document.getElementById("progress-task-students-title").innerText = title;

  await loadProgressTaskStudents();
}

async function loadProgressTaskStudents() {
  setManualRefreshButton("progress-task-students-screen", "refreshProgressTaskStudents(this)");
  showScreen("progress-task-students-screen");

  progressPendingUpdates = {};

  const container = document.getElementById("progress-task-students-list");
  container.innerHTML = `<p class="helper-text">Loading students...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: progressState.classgroup,
    subjectid: progressState.subjectid,
    taskid: progressState.taskid
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load students."}</p>`;
    return;
  }

  if (!result.students || result.students.length === 0) {
    container.innerHTML = `<p class="helper-text">No student tasks found.</p>`;
    return;
  }

  currentProgressRows = result.students.map(normalizeProgressStudentRow);
  renderProgressTaskStudents(currentProgressRows);
}

function renderProgressTaskStudents(rows) {
  const container = document.getElementById("progress-task-students-list");

  const byGroup = {};

  rows.forEach(row => {
    if (String(row.classgroup || "").trim() === "0") return;
    if (!byGroup[row.classgroup]) {
      byGroup[row.classgroup] = [];
    }

    byGroup[row.classgroup].push(row);
  });

  const groups = Object.keys(byGroup).sort((a, b) => {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });

  let html = "";

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

      const isComplete = !!completeStatus;
      const isVerified = !!verifyStatus;

      html += `
        <div class="student-status-row">
          <div class="student-status-name">${escapeHtml(row.username)}</div>

          <div class="status-action" onclick="toggleProgressPending('${row.studenttaskid}', 'completeStatus', ${isComplete ? "false" : "true"})">
            ${
              isComplete
                ? `<span class="status-tick status-tick-complete">✓</span>`
                : `To be<br>completed`
            }
          </div>

          <div class="status-action" onclick="toggleProgressPending('${row.studenttaskid}', 'verifyStatus', ${isVerified ? "false" : "true"})">
            ${
              isVerified
                ? `<span class="status-tick status-tick-verified">✓</span>`
                : `To be<br>verified`
            }
          </div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
}

async function loadIndividualStudentTaskList() {
  setManualRefreshButton("progress-task-students-screen", "refreshIndividualStudentTaskList(this)");
  showScreen("progress-task-students-screen");

  progressPendingUpdates = {};

  const container = document.getElementById("progress-task-students-list");
  container.innerHTML = `<p class="helper-text">Loading student tasks...</p>`;

  const result = await apiPost("/api/progress/task-detail", {
    studentid: progressState.studentid,
    classgroup: "ALL",
    subjectid: progressState.subjectid || "ALL",
    taskid: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || "Could not load student tasks."}</p>`;
    return;
  }

  if (!result.students || result.students.length === 0) {
    container.innerHTML = `<p class="helper-text">No tasks assigned to this student.</p>`;
    return;
  }

  currentProgressRows = result.students.map(normalizeProgressStudentRow);
  renderIndividualStudentTaskList(currentProgressRows);
}

function renderIndividualStudentTaskList(rows) {
  const container = document.getElementById("progress-task-students-list");

  const bySubject = {};

  rows.map(normalizeProgressStudentRow).filter(row => String(row.classgroup || "").trim() !== "0").sort(sortBySubjectIdThenTask).forEach(row => {
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

  subjects.forEach((subject, subjectIndex) => {
    if (progressState.subjectid === "ALL") {
      if (subjectIndex > 0) {
        html += `<div class="group-separator-line" aria-hidden="true"></div>`;
      }
      html += `<div class="subject-heading-thin">${escapeHtml(subject.subjectname)}</div>`;
    }

    Object.values(subject.modules).sort(sortModuleGroupsByModuleId).forEach(moduleGroup => {
      html += `<div class="task-resource-heading">${escapeHtml(moduleGroup.modulename || "General")}</div>`;

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

            <div class="status-action" onclick="toggleProgressPending('${escapeForAttribute(row.studenttaskid)}', 'completeStatus', ${isComplete ? "false" : "true"})">
              ${
                isComplete
                  ? `<span class="status-tick status-tick-complete">✓</span>`
                  : `To be<br>completed`
              }
            </div>

            <div class="status-action" onclick="toggleProgressPending('${escapeForAttribute(row.studenttaskid)}', 'verifyStatus', ${isVerified ? "false" : "true"})">
              ${
                isVerified
                  ? `<span class="status-tick status-tick-verified">✓</span>`
                  : `To be<br>verified`
              }
            </div>
          </div>
        `;
      });
    });
  });

  container.innerHTML = html;
}

function toggleProgressPending(studenttaskid, field, value) {
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
  const originalText = button ? button.innerText : "Save Changes →";

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
  const originalText = button ? button.innerText : "Save Changes →";

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
  if (!authScreen) return;

  authScreen.classList.remove("student-theme", "admin-theme");
  document.body.classList.remove("student-body", "admin-body");

  if (type === "student") {
    authScreen.classList.add("student-theme");
    document.body.classList.add("student-body");
  }

  if (type === "admin") {
    authScreen.classList.add("admin-theme");
    document.body.classList.add("admin-body");
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

function setManualRefreshButton(screenId, handlerName, label = "↻") {
  const screen = document.getElementById(screenId);
  if (!screen) return;

  const header = screen.querySelector(".nav-header");
  if (!header) return;

  const existing = header.querySelector(".manual-refresh-btn");
  if (existing) {
    existing.remove();
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-btn manual-refresh-btn";
  button.innerText = label;
  button.setAttribute("aria-label", "Refresh");
  button.setAttribute("title", "Refresh");
  button.setAttribute("onclick", handlerName);

  const lastButton = header.querySelector("button:last-of-type");
  if (lastButton) {
    header.insertBefore(button, lastButton);
  } else {
    header.appendChild(button);
  }
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
  const refreshButton = button || event?.target;
  const originalText = refreshButton ? refreshButton.innerText : "↻";

  if (refreshButton) {
    refreshButton.disabled = true;
    refreshButton.innerText = "Updating...";
  }

  try {
    await callback();
  } finally {
    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.innerText = originalText;
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

async function refreshViewAttendance(button) {
  const startDate = document.getElementById("view-start-date")?.value;
  const endDate = document.getElementById("view-end-date")?.value;

  await runManualRefresh(button, async () => {
    await renderViewAttendanceScreen(startDate, endDate);
  });
}

async function refreshAttendanceStats(button) {
  const startDate = document.getElementById("stats-start-date")?.value;
  const endDate = document.getElementById("stats-end-date")?.value;

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
  showScreen("attendance-dashboard");
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

async function openMarkRegister() {
  const container = document.getElementById("attendance-register-content");
  showScreen("attendance-register-screen");
  container.innerHTML = `<p class="helper-text">Loading students...</p>`;

  const result = await apiPost("/api/attendance/students", {
    classgroup: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || result.message || "Failed to load students."}</p>`;
    return;
  }

  attendanceStudentsCache = Array.isArray(result.students) ? result.students : [];
  attendanceState = {};

  attendanceStudentsCache.forEach(student => {
    attendanceState[student.studentid] = "Present";
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
  const container = document.getElementById("attendance-register-content");
  const students = [...attendanceStudentsCache].sort(sortAttendanceStudents);

  const absentCount = students.filter(student => attendanceState[student.studentid] === "Absent").length;

  let html = `
    <div class="attendance-register-sticky">
    <div class="attendance-modern-header">
      <h2>Attendance</h2>
      <button class="small-btn save-return-btn attendance-save-btn" onclick="submitAttendanceRegister()">Save Attendance →</button>
    </div>

    
      <div class="attendance-summary-card">
        <div class="attendance-summary-item">
          <span class="attendance-summary-icon" aria-hidden="true">📅</span>
          <div class="attendance-summary-text">
            <span class="attendance-summary-label">Date</span>
            <input type="date" id="attendance-date" value="${escapeHtml(dateValue)}">
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
    </div>

    <div class="attendance-list-heading">
      <span class="attendance-list-icon" aria-hidden="true">👥</span>
      <span>Student List</span>
    </div>
  `;

  if (students.length === 0) {
    html += `<p class="helper-text">No active students found.</p>`;
  }

  let currentGroup = "";

  students.forEach(student => {
    const group = String(student.classgroup || "Ungrouped");
    if (group !== currentGroup) {
      currentGroup = group;
      html += `<div class="attendance-group-line" aria-label="Group ${escapeHtml(group)}"></div>`;
    }

    const status = attendanceState[student.studentid] || "Present";
    const isPresent = status === "Present";
    const displayName = student.username || student.studentid;

    html += `
      <div class="attendance-register-row">
        <div class="attendance-student-main">
          <span class="attendance-student-avatar" aria-hidden="true">${escapeHtml(getAttendanceInitials(displayName))}</span>
          <div class="attendance-student-name">${escapeHtml(displayName)}</div>
        </div>
        <button
          class="attendance-toggle ${isPresent ? "is-present" : "is-absent"}"
          onclick="toggleAttendanceStatus('${escapeJs(student.studentid)}')"
        >
          ${isPresent ? "PRESENT ✔" : "ABSENT ✘"}
        </button>
      </div>
    `;
  });

  html += ``;

  container.innerHTML = html;
}

function toggleAttendanceStatus(studentid) {
  attendanceState[studentid] = attendanceState[studentid] === "Absent" ? "Present" : "Absent";
  const dateValue = document.getElementById("attendance-date")?.value || getLocalDateString();
  renderAttendanceRegister(dateValue);
}

async function submitAttendanceRegister() {
  const dateValue = document.getElementById("attendance-date")?.value || "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    alert("Please select a valid date.");
    return;
  }

  const absentStudents = attendanceStudentsCache
    .filter(student => attendanceState[student.studentid] === "Absent")
    .map(student => ({
      studentid: student.studentid,
      username: student.username,
      classgroup: student.classgroup
    }));

  const saveButton = document.querySelector("#attendance-register-content .attendance-save-btn");
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.innerText = "Saving...";
  }

  const result = await apiPost("/api/attendance/submit-absent", {
    date: dateValue,
    absentStudents
  }, state.token);

  if (!result.success) {
    alert(result.error || result.message || "Failed to save attendance.");
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.innerText = "Save Attendance →";
    }
    return;
  }

  alert(`Attendance saved successfully. ${absentStudents.length} student${absentStudents.length === 1 ? "" : "s"} marked absent.`);
  showScreen("attendance-dashboard");
}

function openViewAttendance() {
  const range = getDefaultAttendanceDateRange();
  renderViewAttendanceScreen(range.start, range.end);
}

async function renderViewAttendanceScreen(startDate, endDate) {
  const container = document.getElementById("attendance-report-content");
  showScreen("attendance-report-screen");
  container.innerHTML = `<p class="helper-text">Loading attendance...</p>`;

  const result = await apiPost("/api/attendance/report", {
    startDate,
    endDate,
    classgroup: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || result.message || "Failed to load attendance."}</p>`;
    return;
  }

  const groups = groupAttendanceStudents(result.students || []);
  const sortedGroups = Object.keys(groups).sort(sortGroupValues);

  let html = `
    <div class="nav-header">
      <h2>View Attendance Records</h2>
      <button class="small-btn manual-refresh-btn" title="Refresh" aria-label="Refresh" onclick="refreshViewAttendance(this)">↻</button>
      <button class="small-btn" onclick="showScreen('attendance-dashboard')">Back</button>
    </div>

    <div class="attendance-filter-box">
      <div class="attendance-date-row attendance-date-row-compact">
        <input type="date" id="view-start-date" value="${escapeHtml(startDate)}">
        <span class="attendance-date-label">START DATE</span>
      </div>

      <div class="attendance-date-row attendance-date-row-compact">
        <input type="date" id="view-end-date" value="${escapeHtml(endDate)}">
        <span class="attendance-date-label">END DATE</span>
      </div>

      <button onclick="renderViewAttendanceScreen(
        document.getElementById('view-start-date').value,
        document.getElementById('view-end-date').value
      )">Filter</button>
    </div>

    <div class="attendance-report-header">
      <div>NAME</div>
      <div>DAY ABSENT</div>
      <div>ATT %</div>
    </div>
  `;

  if (sortedGroups.length === 0) {
    html += `<p class="helper-text">No attendance records found.</p>`;
  }

  sortedGroups.forEach(group => {
    html += `<div class="attendance-group-line" aria-label="Group ${escapeHtml(group)}"></div>`;

    groups[group].forEach(student => {
      const rowId = `abs-${safeDomId(student.studentid)}`;

      html += `
        <div class="attendance-report-row" onclick="toggleAbsentDates('${rowId}')">
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

  container.innerHTML = html;
}

function openAttendanceStats() {
  const range = getDefaultAttendanceDateRange();
  renderAttendanceStatsScreen(range.start, range.end);
}

async function renderAttendanceStatsScreen(startDate, endDate) {
  const container = document.getElementById("attendance-stats-content");
  showScreen("attendance-stats-screen");
  container.innerHTML = `<p class="helper-text">Calculating statistics...</p>`;

  const result = await apiPost("/api/attendance/report", {
    startDate,
    endDate,
    classgroup: "ALL"
  }, state.token);

  if (!result.success) {
    container.innerHTML = `<p class="error-message">${result.error || result.message || "Failed to load statistics."}</p>`;
    return;
  }

  const groupAverages = Array.isArray(result.groupAverages) ? result.groupAverages : [];
  const perfectStudents = Array.isArray(result.perfectAttendanceStudents) ? result.perfectAttendanceStudents : [];

  let html = `
    <div class="nav-header">
      <h2>Statistics</h2>
      <button class="small-btn manual-refresh-btn" title="Refresh" aria-label="Refresh" onclick="refreshAttendanceStats(this)">↻</button>
      <button class="small-btn" onclick="showScreen('attendance-dashboard')">Back</button>
    </div>

    <div class="attendance-filter-box">
      <div class="attendance-date-row attendance-date-row-compact">
        <input type="date" id="stats-start-date" value="${escapeHtml(startDate)}">
        <span class="attendance-date-label">START DATE</span>
      </div>

      <div class="attendance-date-row attendance-date-row-compact">
        <input type="date" id="stats-end-date" value="${escapeHtml(endDate)}">
        <span class="attendance-date-label">END DATE</span>
      </div>

      <button onclick="renderAttendanceStatsScreen(
        document.getElementById('stats-start-date').value,
        document.getElementById('stats-end-date').value
      )">Filter</button>
    </div>

    <div class="attendance-stat-grid">
      <div class="attendance-stat-card">
        <div class="attendance-stat-label">MAKTAB DAYS</div>
        <div class="attendance-stat-number">${result.totalMaktabDays || 0}</div>
      </div>

      <div class="attendance-stat-card">
        <div class="attendance-stat-label">CLASS %</div>
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
      <h3>100% Attendance 🏆</h3>
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

  container.innerHTML = html;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

function hideSplashScreen() {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  splash.classList.add("splash-hidden");

  setTimeout(() => {
    splash.remove();
  }, 400);
}
