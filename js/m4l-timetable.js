/* M4L v40 - Timetable module
   Load after /app.js, /js/m4l-auth.js, and /js/m4l-shell.js.
   This is a classic script, not type=module, so existing global function calls remain safe
   while the app is split gradually.
   Class duas card helpers intentionally remain in app.js because the duas card is a home-page card,
   not timetable logic.
*/

/* =========================
   TIMETABLE
========================= */

const TIMETABLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIMETABLE_CACHE_PREFIX = "maktab_timetable_cache_v1";

let timetableCache = null;
let timetableCacheKey = "";
let timetableLoadPromise = null;
let timetableLoadPromiseKey = "";
let globalTimetableZoomLink = "";

function scheduleStudentHomeTimetableLoad() {
  if (!state.token || getBottomNavRole() !== "student") {
    return;
  }

  if (!document.getElementById("student-home") || !document.getElementById("student-timetable-content")) {
    return;
  }

  setTimeout(() => {
    Promise.resolve(loadStudentHomeTimetable()).catch(error => {
      console.warn("Student home timetable load failed:", error);
    });
  }, 0);
}


function normalizeTimetableRows(result) {
  if (!result) return [];

  if (Array.isArray(result.sessions)) {
    return result.sessions;
  }

  if (Array.isArray(result.timetable)) {
    return result.timetable;
  }

  if (Array.isArray(result.rows)) {
    return result.rows;
  }

  return [];
}

function normalizeTimetableText(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function normalizeTimetableKey(value) {
  return normalizeTimetableText(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeTimetableCachePart(value) {
  return normalizeTimetableKey(value || "ALL") || "all";
}

function getTimetableRequestOptions(options = {}) {
  return {
    groupNo: normalizeTimetableText(options.groupNo || "ALL") || "ALL",
    assignedTeacher: normalizeTimetableText(options.assignedTeacher || "ALL") || "ALL"
  };
}

function getTimetableCacheKey(options = {}) {
  const requestOptions = getTimetableRequestOptions(options);
  const groupKey = normalizeTimetableCachePart(requestOptions.groupNo);
  const teacherKey = normalizeTimetableCachePart(requestOptions.assignedTeacher);
  return `${TIMETABLE_CACHE_PREFIX}_${groupKey}_${teacherKey}`;
}

function readTimetableCache(cacheKey, options = {}) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const savedAt = Number(parsed.savedAt || 0);
    const data = parsed.data || null;

    if (!savedAt || !data) return null;

    const isExpired = Date.now() - savedAt > TIMETABLE_CACHE_TTL_MS;
    if (isExpired && options.allowExpired !== true) return null;

    return data;
  } catch (err) {
    return null;
  }
}

function writeTimetableCache(cacheKey, data) {
  try {
    if (!cacheKey || !data) return;

    localStorage.setItem(cacheKey, JSON.stringify({
      savedAt: Date.now(),
      data
    }));
  } catch (err) {
    // Local cache is an enhancement only. The app should continue if storage is full or unavailable.
  }
}

function setActiveTimetableCache(cacheKey, data) {
  timetableCacheKey = cacheKey || "";
  timetableCache = data || null;
  globalTimetableZoomLink = normalizeTimetableText(data?.zoomlink || data?.zoomLink || "");
}

function getTimetableSortMinutes(timeValue) {
  const text = normalizeTimetableText(timeValue);
  const match = text.match(/^(\d{1,2})(?::(\d{1,2}))?/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const hour = Number(match[1] || 0);
  const minute = Number(match[2] || 0);

  return hour * 60 + minute;
}

function compareTimetableTimes(a, b) {
  const minuteCompare = getTimetableSortMinutes(a) - getTimetableSortMinutes(b);

  if (minuteCompare !== 0) {
    return minuteCompare;
  }

  return normalizeTimetableText(a).localeCompare(normalizeTimetableText(b), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function getTimetableDayWeight(day) {
  const key = normalizeTimetableKey(day);
  const order = {
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    weds: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
    sun: 7,
    sunday: 7
  };

  return order[key] || 99;
}

function compareTimetableDays(a, b) {
  const weightCompare = getTimetableDayWeight(a) - getTimetableDayWeight(b);

  if (weightCompare !== 0) {
    return weightCompare;
  }

  return normalizeTimetableText(a).localeCompare(normalizeTimetableText(b), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function addUniqueTimetableValue(list, seen, value) {
  const text = normalizeTimetableText(value);
  const key = normalizeTimetableKey(text);

  if (!text || seen.has(key)) {
    return;
  }

  seen.add(key);
  list.push(text);
}

function buildTimetableModel(rows) {
  const dayList = [];
  const timeList = [];
  const daySeen = new Set();
  const timeSeen = new Set();
  const cellMap = {};

  rows.forEach(row => {
    const day = normalizeTimetableText(row.dayofweek || row.dayOfWeek || row.day || "");
    const time = normalizeTimetableText(row.starttime || row.startTime || row.time || "");
    const subject = normalizeTimetableText(row.subjectname || row.subjectName || row.subject || "");

    if (!day || !time || !subject) {
      return;
    }

    addUniqueTimetableValue(dayList, daySeen, day);
    addUniqueTimetableValue(timeList, timeSeen, time);

    const cellKey = `${normalizeTimetableKey(time)}__${normalizeTimetableKey(day)}`;

    if (!cellMap[cellKey]) {
      cellMap[cellKey] = [];
    }

    const alreadyAdded = cellMap[cellKey].some(item => {
      return normalizeTimetableKey(item.subjectname) === normalizeTimetableKey(subject);
    });

    if (!alreadyAdded) {
      cellMap[cellKey].push({
        subjectname: subject,
        zoomlink: normalizeTimetableText(row.zoomlink || row.zoomLink || "")
      });
    }
  });

  dayList.sort(compareTimetableDays);
  timeList.sort(compareTimetableTimes);

  return {
    days: dayList,
    starttimes: timeList,
    cells: cellMap
  };
}

function getTimetableCellEntries(model, time, day) {
  const key = `${normalizeTimetableKey(time)}__${normalizeTimetableKey(day)}`;
  return model.cells[key] || [];
}

function renderTimetable(containerOrId, timetableResult, options = {}) {
  const container = getDomElement(containerOrId);

  if (!container) {
    return false;
  }

  const rows = normalizeTimetableRows(timetableResult);

  if (!rows.length) {
    setDomHtml(container, `<p class="helper-text">No timetable sessions have been added yet.</p>`);
    return true;
  }

  const model = buildTimetableModel(rows);

  if (!model.days.length || !model.starttimes.length) {
    setDomHtml(container, `<p class="helper-text">No timetable sessions have been added yet.</p>`);
    return true;
  }

  const headerHtml = model.days
    .map(day => `<th scope="col">${escapeHtml(day)}</th>`)
    .join("");

  const rowsHtml = model.starttimes.map(time => {
    const cellHtml = model.days.map(day => {
      const entries = getTimetableCellEntries(model, time, day);

      if (!entries.length) {
        return `<td class="timetable-empty-cell" aria-label="${escapeHtml(day)} ${escapeHtml(time)}"></td>`;
      }

      const subjectsHtml = entries.map(entry => {
        const perSessionZoomLink = normalizeTimetableText(entry.zoomlink);
        const canOpenSessionZoom = options.usePerSessionZoom === true && perSessionZoomLink;
        const subjectClass = canOpenSessionZoom
          ? "timetable-subject timetable-subject-link"
          : "timetable-subject";
        if (canOpenSessionZoom) {
          return `
            <button
              type="button"
              class="${subjectClass}"
              data-timetable-action="open-zoom"
              data-zoom-link="${escapeForAttribute(perSessionZoomLink)}"
            >${escapeHtml(entry.subjectname)}</button>
          `;
        }

        return `<span class="${subjectClass}">${escapeHtml(entry.subjectname)}</span>`;
      }).join("");

      return `<td>${subjectsHtml}</td>`;
    }).join("");

    return `
      <tr>
        <th scope="row" class="timetable-time-cell">${escapeHtml(time)}</th>
        ${cellHtml}
      </tr>
    `;
  }).join("");

  const dayCount = Math.max(model.days.length, 1);

  const tableHtml = `
    <div class="timetable-scroll" role="region" aria-label="Timetable" tabindex="0" style="--timetable-day-count: ${dayCount};">
      <table class="timetable-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            ${headerHtml}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;

  setDomHtml(container, tableHtml);
  bindTimetableUiHandlers();
  return true;
}

async function fetchTimetable(options = {}) {
  const requestOptions = getTimetableRequestOptions(options);
  const cacheKey = getTimetableCacheKey(requestOptions);
  const force = options.force === true;

  if (!force) {
    if (timetableCache && timetableCacheKey === cacheKey) {
      return timetableCache;
    }

    const cached = readTimetableCache(cacheKey);
    if (cached) {
      setActiveTimetableCache(cacheKey, cached);
      return cached;
    }
  }

  if (timetableLoadPromise && !force && timetableLoadPromiseKey === cacheKey) {
    return timetableLoadPromise;
  }

  timetableLoadPromiseKey = cacheKey;
  timetableLoadPromise = apiPost("/api/timetable/get", requestOptions, state.token).then(result => {
    if (!result.success) {
      throw new Error(result.error || "Failed to load timetable");
    }

    setActiveTimetableCache(cacheKey, result);
    writeTimetableCache(cacheKey, result);
    return result;
  }).catch(err => {
    if (!force) {
      const staleCache = readTimetableCache(cacheKey, { allowExpired: true });
      if (staleCache) {
        setActiveTimetableCache(cacheKey, staleCache);
        return staleCache;
      }
    }

    throw err;
  }).finally(() => {
    timetableLoadPromise = null;
    timetableLoadPromiseKey = "";
  });

  return timetableLoadPromise;
}

let timetableUiHandlersBound = false;

function bindTimetableUiHandlers() {
  if (timetableUiHandlersBound === true) return true;
  if (!document || typeof document.addEventListener !== "function") return false;

  timetableUiHandlersBound = true;
  document.addEventListener("click", handleTimetableUiClick);
  return true;
}

function handleTimetableUiClick(event) {
  const button = event.target && event.target.closest
    ? event.target.closest("[data-timetable-action]")
    : null;

  if (!button || button.disabled) return;

  const action = button.dataset.timetableAction || "";
  if (!action) return;

  event.preventDefault();

  if (action === "open-zoom") {
    openTimetableZoomLink(button.dataset.zoomLink || "");
  }
}

function setTimetableZoomButtonState(buttonId, zoomLink) {
  const button = document.getElementById(buttonId);

  if (!button) {
    return;
  }

  button.removeAttribute("onclick");
  button.dataset.timetableAction = "open-zoom";

  if (button.dataset.zoomDecorated !== "true") {
    button.dataset.zoomDecorated = "true";
    button.innerHTML = `
      <img src="/icons/zoom.svg" alt="" class="zoom-link-button__icon" aria-hidden="true" />
      <span>Join Zoom Class</span>
    `;
  }

  const normalizedZoomLink = normalizeTimetableText(zoomLink);
  const hasLink = !!normalizedZoomLink;

  if (hasLink) {
    button.dataset.zoomLink = normalizedZoomLink;
  } else {
    delete button.dataset.zoomLink;
  }

  button.disabled = !hasLink;
  button.classList.toggle("is-disabled", !hasLink);
  button.setAttribute("aria-disabled", hasLink ? "false" : "true");
  button.title = hasLink ? "Open Zoom link" : "Zoom link has not been added yet";
}

function ensureTimetableStartImageAfterZoom(contentId, zoomButtonId, imageCardId, placement = "afterZoom") {
  const content = document.getElementById(contentId);
  const zoomButton = document.getElementById(zoomButtonId);

  if (!content && !zoomButton) {
    return;
  }

  let imageCard = document.getElementById(imageCardId);

  if (!imageCard) {
    imageCard = document.createElement("div");
    imageCard.id = imageCardId;
    imageCard.className = "timetable-start-image-card";
    imageCard.innerHTML = `
      <img src="/images/startclass.png" alt="Class start guide" class="timetable-start-image" loading="lazy" />
    `;
  }

  if (placement === "afterTimetable" && content) {
    const timetableCard = content.closest(".timetable-card");

    if (timetableCard && timetableCard.parentNode) {
      timetableCard.insertAdjacentElement("afterend", imageCard);
      return;
    }

    if (content.parentNode) {
      content.insertAdjacentElement("afterend", imageCard);
      return;
    }
  }

  if (zoomButton && zoomButton.parentNode) {
    zoomButton.insertAdjacentElement("afterend", imageCard);
    return;
  }

  if (content && content.parentNode) {
    content.insertAdjacentElement("afterend", imageCard);
  }
}

/* M4L v40: Class duas home-card helpers remain in app.js; timetable module only calls the placement helper after rendering. */

function scheduleAdminHomeTimetableLoad() {
  if (!state.token || getBottomNavRole() !== "admin") {
    return;
  }

  if (!document.getElementById("admin-home")) {
    return;
  }

  setTimeout(() => {
    Promise.resolve(loadAdminHomeTimetable()).catch(error => {
      console.warn("Admin home timetable load failed:", error);
    });
  }, 0);
}


function ensureAdminHomePanel() {
  const screen = document.getElementById("admin-home");

  if (!screen) {
    return null;
  }

  const header = screen.querySelector(".top-bar, .nav-header");
  if (header) {
    header.remove();
  }

  const adminWelcome = document.getElementById("admin-welcome");
  if (adminWelcome) {
    adminWelcome.remove();
  }

  screen.querySelectorAll(".staff-dashboard-grid, .card-grid, .list-stack").forEach(section => {
    if (section.id !== "admin-home-panel") {
      section.remove();
    }
  });

  let panel = document.getElementById("admin-home-panel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "admin-home-panel";
    panel.className = "student-home-panel admin-home-panel";
    panel.innerHTML = `
      <div class="timetable-card">
        <div class="timetable-card-header">
          <h3>Timetable</h3>
        </div>
        <div id="admin-home-timetable-content">
          <p class="helper-text">Loading timetable...</p>
        </div>
      </div>
      <button
        id="admin-home-zoom-link-btn"
        type="button"
        class="zoom-link-button"
        data-timetable-action="open-zoom"
      >
        Join Zoom Class
      </button>
    `;
  }

  if (!panel.parentNode) {
    screen.prepend(panel);
  }

  removeLegacyScreenRefreshButtons();
  return panel;
}

async function loadAdminHomeTimetable(force = false) {
  const panel = ensureAdminHomePanel();
  const container = document.getElementById("admin-home-timetable-content");

  if (!panel || !container || !state.token || getBottomNavRole() !== "admin") {
    return;
  }

  if (!timetableCache || force) {
    setDomHtml(container, `<p class="helper-text">Loading timetable...</p>`);
  }

  try {
    const result = await fetchTimetable({ force });
    renderTimetable(container, result, { showContentPanel: true });
    setTimetableZoomButtonState("admin-home-zoom-link-btn", globalTimetableZoomLink);
    ensureClassDuasCardAfterTimetable("admin-home-timetable-content", "admin-home-class-duas-card", ["admin-home-timetable-start-image-card"]);
  } catch (err) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(err.message || "Unable to load timetable.")}</p>`);
    setTimetableZoomButtonState("admin-home-zoom-link-btn", "");
  }
}

async function refreshAdminHomeTimetable(button) {
  await runManualRefresh(button, async () => {
    await loadAdminHomeTimetable(true);
  });
}


async function loadStudentHomeTimetable(force = false) {
  const container = document.getElementById("student-timetable-content");

  if (!container || !state.token || getBottomNavRole() !== "student") {
    return;
  }

  if (!timetableCache || force) {
    setDomHtml(container, `<p class="helper-text">Loading timetable...</p>`);
  }

  try {
    const result = await fetchTimetable({ force });
    renderTimetable(container, result, { showContentPanel: true });
    setTimetableZoomButtonState("student-zoom-link-btn", globalTimetableZoomLink);
    ensureClassDuasCardAfterTimetable("student-timetable-content", "student-home-class-duas-card", ["student-timetable-start-image-card"]);
  } catch (err) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(err.message || "Unable to load timetable.")}</p>`);
    setTimetableZoomButtonState("student-zoom-link-btn", "");
  }
}

async function refreshStudentHomeTimetable(button) {
  await runManualRefresh(button, async () => {
    await loadStudentHomeTimetable(true);
  });
}

function openTimetableZoomLink(link) {
  const rawLink = normalizeTimetableText(link || globalTimetableZoomLink);

  if (!rawLink) {
    alert("Zoom link has not been added yet.");
    return;
  }

  const targetLink = /^https?:\/\//i.test(rawLink)
    ? rawLink
    : `https://${rawLink}`;

  window.open(targetLink, "_blank", "noopener,noreferrer");
}

function openStudentTimetableZoom() {
  openTimetableZoomLink(globalTimetableZoomLink);
}

async function showAdminTimetable(force = false) {
  setTimetableScreenTheme("admin-timetable-screen", "admin");
  setManualRefreshButton("admin-timetable-screen", "refreshAdminTimetable(this)");
  showScreen("admin-timetable-screen");

  const container = document.getElementById("admin-timetable-content");

  if (container) {
    setDomHtml(container, `<p class="helper-text">Loading timetable...</p>`);
  }

  try {
    const result = await fetchTimetable({ force });
    renderTimetable(container, result, { showContentPanel: true });
    setTimetableZoomButtonState("admin-timetable-zoom-link-btn", globalTimetableZoomLink);
    ensureClassDuasCardAfterTimetable("admin-timetable-content", "admin-timetable-class-duas-card", ["admin-timetable-start-image-card"]);
  } catch (err) {
    if (container) {
      setDomHtml(container, `<p class="error-message">${escapeHtml(err.message || "Unable to load timetable.")}</p>`);
    }
  }
}

async function refreshAdminTimetable(button) {
  await runManualRefresh(button, async () => {
    await showAdminTimetable(true);
  });
}

function setTimetableScreenTheme(screenId, theme) {
  const screen = document.getElementById(screenId);

  if (!screen) {
    return;
  }

  screen.classList.toggle("student-theme", theme === "student");
  screen.classList.toggle("admin-theme", theme !== "student");
}

async function showAdminTimetableAdmin(focusZoom = false) {
  setTimetableScreenTheme("admin-timetable-admin-screen", "admin");
  showScreen("admin-timetable-admin-screen");

  const previewContainer = document.getElementById("admin-timetable-admin-preview");
  const zoomInput = document.getElementById("admin-global-zoom-link");
  const message = document.getElementById("admin-timetable-message");

  if (previewContainer) {
    setDomHtml(previewContainer, `<p class="helper-text">Loading timetable...</p>`);
  }

  if (message) {
    message.textContent = "";
  }

  try {
    const result = await fetchTimetable({ force: true });
    renderTimetable(previewContainer, result);

    if (zoomInput) {
      zoomInput.value = normalizeTimetableText(result.zoomlink || "");
      if (focusZoom) {
        setTimeout(() => zoomInput.focus(), 80);
      }
    }
  } catch (err) {
    if (previewContainer) {
      setDomHtml(previewContainer, `<p class="error-message">${escapeHtml(err.message || "Unable to load timetable.")}</p>`);
    }
  }
}

function showAdminZoomLinkAdmin() {
  showAdminTimetableAdmin(true);
}

async function saveAdminTimetableZoomLink(button) {
  const zoomInput = document.getElementById("admin-global-zoom-link");
  const message = document.getElementById("admin-timetable-message");
  const zoomlink = zoomInput ? zoomInput.value.trim() : "";

  if (message) {
    message.textContent = "Saving...";
    message.classList.remove("error-message");
  }

  if (button) {
    button.disabled = true;
  }

  try {
    const result = await apiPost("/api/admin/timetable/update-zoom", {
      zoomlink
    }, state.token);

    if (!result.success) {
      throw new Error(result.error || "Could not save Zoom link.");
    }

    const cacheKey = getTimetableCacheKey({ groupNo: "ALL", assignedTeacher: "ALL" });
    setActiveTimetableCache(cacheKey, result);
    writeTimetableCache(cacheKey, result);

    if (message) {
      message.textContent = result.message || "Zoom link saved.";
    }

    renderTimetable("admin-timetable-admin-preview", result);
  } catch (err) {
    if (message) {
      message.textContent = err.message || "Could not save Zoom link.";
      message.classList.add("error-message");
    }
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

window.M4LTimetable = {
  scheduleStudentHomeTimetableLoad,
  normalizeTimetableRows,
  renderTimetable,
  fetchTimetable,
  bindTimetableUiHandlers,
  loadAdminHomeTimetable,
  refreshAdminHomeTimetable,
  loadStudentHomeTimetable,
  refreshStudentHomeTimetable,
  openTimetableZoomLink,
  openStudentTimetableZoom,
  showAdminTimetable,
  refreshAdminTimetable,
  showAdminTimetableAdmin,
  showAdminZoomLinkAdmin,
  saveAdminTimetableZoomLink
};
