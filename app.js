/* M4L v49 - App shell after Attendance split.
   Load before m4l-auth, m4l-shell, m4l-attendance, m4l-timetable, m4l-resources, m4l-progress, and m4l-manage-students. */
const API_BASE = "https://rebootworker.maktab4life.workers.dev";
const STUDENT_LOGIN_BASE = "https://rebootyourmaktab.maktab4life.org/student/";
const DEFAULT_STUDENT_GROUP = 1;
const APP_VERSION_STORAGE_KEY = "maktab_app_version";
const CLASS_DUAS_ITEMS = [
  {
    arabic: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَّعَلَى آلِ مُحَمَّدٍ وَّبَارِكْ وَسَلِّم",
    transliteration: "Allahumma salli ala muhammadew wa ala aali muhammadew wa baarik wassallim-49",
    translation: "Oh Allah send peace and blessings upon Muhammad and the family of Muhammad"
  },
  {
    arabic: "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي يَفْقَهُوا قَوْلِي",
    transliteration: "Rabbish sharh lee sadree. Wa yassir lee amree. Wahlul ‘uqdatan mil lisa nee. Yafqahoo qawlee",
    translation: "O my Sustainer! Open up my heart and make my task easy for me, and loosen the knot from my tongue so that they might fully understand my speech"
  },
  {
    arabic: "رَبِّ يَسِّرْ وَلاَ تُعَسِّرْ وَتَمِّمْ بِالْخَیْر وَبِكَ نَسْتَعِينُ يَا فَتَّاحُ يَا عَلِيْمُ",
    transliteration: "Rabbi, yassir wa la tu’assir wa tammim bil khair wa bika nasta’een. yaa fattaah Ya A’LeemU",
    translation: "O Lord, make it easy and do not make it difficult, and make it end well. We seek your help. Oh the Opener, Oh the All Knowing"
  },
  {
    arabic: "رَبِّ زِدْنِا عِلْمًا",
    transliteration: "Rabbi Zidnaa IlMan",
    translation: "Oh lord increase us in knowledge"
  },
  {
    arabic: "اللّهُمَّ أعِنَّا على ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبَادَتِكَ",
    transliteration: "Allahumma A inna Ala Zikrika, Wa Shukrika, Wa Husni Ibadatika",
    translation: "O Allah, help me remember You, to be grateful to You and to worship You in an excellent manner"
  },
  {
    arabic: "سُبْحَانَكَ لَا عِلْمَ لَنَا إِلَّا مَا عَلَّمْتَنَا ۖ إِنَّكَ أَنتَ الْعَلِيمُ الْحَكِيمُ",
    transliteration: "subḥānaka lā ‘ilma lanā illā mā ‘allamtana, innaka antal-‘Alīmul-Ḥakīm.",
    translation: "Glory be to You; we have no knowledge except what You have taught us. Indeed, it is You who is the All-Knowing, the All-Wise"
  }
];


const state = {
  portalType: null,
  uniqueid: null,
  token: localStorage.getItem("maktab_token") || "",
  userType: localStorage.getItem("maktab_user_type") || "",
  user: null,
  loginSubmitting: false
};
async function checkForAppUpdate() {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) return;

    const data = await response.json();
    const latestVersion = String(data.version || "").trim();

    if (!latestVersion) return;

    const currentVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY);

    if (currentVersion && currentVersion !== latestVersion) {
      localStorage.setItem(APP_VERSION_STORAGE_KEY, latestVersion);

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      }

      window.location.reload();
      return;
    }

    if (!currentVersion) {
      localStorage.setItem(APP_VERSION_STORAGE_KEY, latestVersion);
    }
  } catch (error) {
    console.warn("App update check failed", error);
  }
}


/* =========================
   APP INIT
========================= */

window.addEventListener("load", initApp);
window.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeStudentResourceModulePicker();
  }
});

function initApp() {
  try {
    checkForAppUpdate();
    setupPinDigitBoxes();
    bindHeaderIconActionHandlers();
    bindTimetableUiHandlers();
    bindAdminSubjectUiHandlers();
    bindMediaViewerHandlers();

    const route = getPortalRouteFromLocation();

    if (route.portalType === "admin") {
      state.portalType = "admin";
      state.uniqueid = route.uniqueid;
      setAuthTheme("admin");
      checkAdmin();
      return;
    }

    if (route.portalType === "student") {
      state.portalType = "student";
      state.uniqueid = route.uniqueid;
      setAuthTheme("student");
      checkStudent();
      return;
    }

    showInvalidLoginLinkMessage();
  } catch (error) {
    console.error("App startup failed:", error);
    showStartupErrorMessage();
  }
}

function getSafePathSegment(segment) {
  const value = String(segment || "").trim();

  if (!value) return "";

  try {
    return decodeURIComponent(value).trim();
  } catch (error) {
    console.warn("Could not decode route segment:", value, error);
    return value;
  }
}

function getPortalRouteFromLocation() {
  const pathname = String(window.location && window.location.pathname ? window.location.pathname : "");
  const parts = pathname.split("/").filter(Boolean);
  const portalType = getSafePathSegment(parts[0]).toLowerCase();
  const uniqueid = getSafePathSegment(parts[1]);

  if ((portalType === "admin" || portalType === "student") && uniqueid) {
    return { portalType, uniqueid };
  }

  return { portalType: "", uniqueid: "" };
}

function showInvalidLoginLinkMessage() {
  state.portalType = null;
  state.uniqueid = null;

  setAuthTheme("");
  setError("");
  setDomText("portal-title", "Invalid Login Link");
  setDomText(
    "portal-subtitle",
    "Please use your personal Maktab4Life student or admin link."
  );
  hideDomElement("auth-welcome-banner");
  hideDomElement("login-pin-box");
  hideDomElement("setup-pin-box");
  showScreen("auth-screen");
}

function showStartupErrorMessage() {
  setAuthTheme("");
  setDomText("portal-title", "Unable to Start App");
  setDomText(
    "portal-subtitle",
    "Please refresh the page. If the problem continues, contact the Maktab4Life administrator."
  );
  setError("Unable to start the app. Please refresh and try again.");
  hideDomElement("auth-welcome-banner");
  hideDomElement("login-pin-box");
  hideDomElement("setup-pin-box");
  showScreen("auth-screen");
}

/* M4L v38: showScreen moved to /js/m4l-shell.js */
function setDomText(id, value) {
  const dom = window.M4LDom;

  if (dom && typeof dom.setText === "function") {
    return dom.setText(id, value);
  }

  const el = document.getElementById(id);
  if (!el) return false;

  el.innerText = value == null ? "" : String(value);
  return true;
}

function getDomElement(target) {
  if (!target) return null;

  if (typeof target === "string") {
    return document.getElementById(target);
  }

  return target;
}

function setDomHtml(target, value) {
  const dom = window.M4LDom;

  if (typeof target === "string" && dom && typeof dom.setHtml === "function") {
    return dom.setHtml(target, value);
  }

  const el = getDomElement(target);
  if (!el) return false;

  el.innerHTML = value == null ? "" : String(value);
  return true;
}

function showDomElement(id) {
  const dom = window.M4LDom;

  if (dom && typeof dom.show === "function") {
    return dom.show(id);
  }

  const el = document.getElementById(id);
  if (!el) return false;

  el.classList.remove("hidden");
  return true;
}

function hideDomElement(id) {
  const dom = window.M4LDom;

  if (dom && typeof dom.hide === "function") {
    return dom.hide(id);
  }

  const el = document.getElementById(id);
  if (!el) return false;

  el.classList.add("hidden");
  return true;
}

/* =========================
   AUTH / PIN / API MODULE
   Moved to /js/m4l-auth.js in V37.
   Keep loading this module after app.js so the existing app state and helpers are available.
========================= */

/* M4L v38: headerIconActionHandlersBound moved to /js/m4l-shell.js */
/* M4L v38: getHeaderIconActionDescriptor moved to /js/m4l-shell.js */
/* M4L v38: applyHeaderIconAction moved to /js/m4l-shell.js */
/* M4L v38: bindHeaderIconActionHandlers moved to /js/m4l-shell.js */
/* M4L v38: handleHeaderIconActionClick moved to /js/m4l-shell.js */
/* M4L v38: setHomeIconButton moved to /js/m4l-shell.js */
/* M4L v38: setBackIconButton moved to /js/m4l-shell.js */
/* M4L v38: getHeaderIconButtonMarkup moved to /js/m4l-shell.js */
/* M4L v38: getHomeIconButtonMarkup moved to /js/m4l-shell.js */
/* M4L v38: getBackIconButtonMarkup moved to /js/m4l-shell.js */
/* M4L v38: getCurrentUserName moved to /js/m4l-shell.js */
/* M4L v38: getCurrentUserLevelText moved to /js/m4l-shell.js */
/* M4L v38: getUserBandElement moved to /js/m4l-shell.js */
/* M4L v38: clearUserBand moved to /js/m4l-shell.js */
/* M4L v38: setBodyUserBandState moved to /js/m4l-shell.js */
/* M4L v38: attachUserBandLogoutHandler moved to /js/m4l-shell.js */
/* M4L v38: getActiveScreenId moved to /js/m4l-shell.js */
/* M4L v38: removeLegacyScreenRefreshButtons moved to /js/m4l-shell.js */
/* M4L v38: userBandRefreshInProgress moved to /js/m4l-shell.js */
/* M4L v38: setUserBandRefreshState moved to /js/m4l-shell.js */
/* M4L v38: waitForUserBandRefreshFrame moved to /js/m4l-shell.js */
/* M4L v38: waitForUserBandRefreshMinimumDuration moved to /js/m4l-shell.js */
/* M4L v39: removed stray async token left after moving runUserBandRefresh to /js/m4l-shell.js */
/* M4L v38: runUserBandRefresh moved to /js/m4l-shell.js */
/* M4L v39: removed stray async token left after moving refreshCurrentResourceView to /js/m4l-shell.js */
/* M4L v38: refreshCurrentResourceView moved to /js/m4l-shell.js */
/* M4L v38: getUserBandRefreshAction moved to /js/m4l-shell.js */
/* M4L v38: attachUserBandRefreshHandler moved to /js/m4l-shell.js */
/* M4L v38: updateUserBand moved to /js/m4l-shell.js */
/* M4L v38: setTextActionButton moved to /js/m4l-shell.js */
/* =========================
   REUSABLE BOTTOM NAVIGATION
========================= */

/* M4L v38: BOTTOM_NAV_ITEMS moved to /js/m4l-shell.js */
/* M4L v38: getBottomNavRole moved to /js/m4l-shell.js */
/* M4L v38: getBottomNavElement moved to /js/m4l-shell.js */
/* M4L v38: installBottomNavigationGestureGuard moved to /js/m4l-shell.js */
/* M4L v38: getBottomNavItems moved to /js/m4l-shell.js */
/* M4L v38: isBottomNavItemAvailable moved to /js/m4l-shell.js */
/* M4L v38: getAvailableBottomNavItems moved to /js/m4l-shell.js */
/* M4L v38: createBottomNavButton moved to /js/m4l-shell.js */
/* M4L v38: renderBottomNavigation moved to /js/m4l-shell.js */
/* M4L v38: shouldShowBottomNavigation moved to /js/m4l-shell.js */
/* M4L v38: getBottomNavActiveKey moved to /js/m4l-shell.js */
/* M4L v38: handleBottomNavigationClick moved to /js/m4l-shell.js */
/* M4L v38: updateBottomNavigation moved to /js/m4l-shell.js */
let currentPlaceholderTitle = "";

function showPlaceholder(title) {
  currentPlaceholderTitle = String(title || "").trim();
  setDomText("placeholder-title", currentPlaceholderTitle || "Screen");
  showScreen("placeholder-screen");
}

function showAdminAcademics() {
  prepareAdminAcademicsScreen();
  showScreen("admin-academics");
}

function prepareAdminAcademicsScreen() {
  const screen = document.getElementById("admin-academics");
  if (!screen) return;

  const title = screen.querySelector("h2");
  if (title) {
    title.innerText = "Add or Modify";
  }

  screen.querySelectorAll("button").forEach(button => {
    const text = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "add / modify students" || text === "add/modify students") {
      button.textContent = "Students";
    }
  });
}


/* =========================
   HOME CLASS DUAS CARD
========================= */

/* M4L v40: Class duas is a home-page card, not part of the timetable module.
   It remains in app.js for this split and is only positioned after the home timetable render. */

function createClassDuasCard(cardId) {
  const card = document.createElement("section");
  card.id = cardId;
  card.className = "class-duas-card";
  card.setAttribute("aria-label", "Class duas");

  const list = document.createElement("div");
  list.className = "class-duas-card__list";

  CLASS_DUAS_ITEMS.forEach(dua => {
    const item = document.createElement("article");
    item.className = "class-duas-card__item";

    const arabic = document.createElement("p");
    arabic.className = "class-duas-card__arabic";
    arabic.lang = "ar";
    arabic.dir = "rtl";
    arabic.textContent = dua.arabic;

    const transliteration = document.createElement("p");
    transliteration.className = "class-duas-card__transliteration";
    transliteration.lang = "en";
    transliteration.dir = "ltr";
    transliteration.textContent = dua.transliteration;

    const translation = document.createElement("p");
    translation.className = "class-duas-card__translation";
    translation.lang = "en";
    translation.dir = "ltr";
    translation.textContent = dua.translation;

    item.appendChild(arabic);
    item.appendChild(transliteration);
    item.appendChild(translation);
    list.appendChild(item);
  });

  card.appendChild(list);
  return card;
}

function ensureClassDuasCardAfterTimetable(contentId, cardId, imageCardIds = []) {
  const content = document.getElementById(contentId);

  if (!content) {
    return;
  }

  imageCardIds.forEach(id => {
    const imageCard = document.getElementById(id);
    if (imageCard) {
      imageCard.remove();
    }
  });

  let card = document.getElementById(cardId);

  if (!card) {
    card = createClassDuasCard(cardId);
  }

  const timetableCard = content.closest(".timetable-card");

  if (timetableCard && timetableCard.parentNode) {
    timetableCard.insertAdjacentElement("afterend", card);
    return;
  }

  if (content.parentNode) {
    content.insertAdjacentElement("afterend", card);
  }
}

/* M4L v40: Timetable functions moved to /js/m4l-timetable.js */

function escapeJsString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}


/* =========================
   STUDENT TASK / PROGRESS VIEW
   M4L v42: moved to /js/m4l-progress.js
========================= */

/* =========================
   STUDENT RESOURCE VIEW / MEDIA VIEWERS
   M4L v41: moved to /js/m4l-resources.js
========================= */

/* =========================
   MANAGE STUDENTS UI
   M4L v43: moved to /js/m4l-manage-students.js
   Keep loading this module after app.js, auth, shell, timetable, resources, and progress.
========================= */

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

let adminSubjectUiHandlersBound = false;

function bindAdminSubjectUiHandlers(containerOrId) {
  if (adminSubjectUiHandlersBound !== true) {
    if (!document || typeof document.addEventListener !== "function") {
      return false;
    }

    adminSubjectUiHandlersBound = true;
    document.addEventListener("click", handleAdminSubjectUiClick);
    document.addEventListener("keydown", handleAdminSubjectUiKeydown);
    document.addEventListener("change", handleAdminSubjectUiChange);
  }

  return !containerOrId || !!getDomElement(containerOrId);
}

function getAdminSubjectActionElement(event) {
  const target = event && event.target;
  if (!target || typeof target.closest !== "function") return null;

  const actionEl = target.closest("[data-subject-action]");
  if (!actionEl) return null;

  const scope = actionEl.closest(
    "#subjects-screen, #subject-add-list, #modify-subject-box"
  );

  return scope ? actionEl : null;
}

function handleAdminSubjectUiClick(event) {
  const actionEl = getAdminSubjectActionElement(event);
  if (!actionEl || actionEl.disabled) return;

  const action = actionEl.dataset.subjectAction || "";
  if (!action) return;

  event.preventDefault();

  if (action === "add-pending") {
    addPendingSubject();
    return;
  }

  if (action === "remove-pending") {
    removePendingSubject(Number(actionEl.dataset.subjectIndex || -1));
    return;
  }

  if (action === "submit-pending") {
    submitPendingSubjects();
    return;
  }

  if (action === "toggle-status") {
    toggleSubjectStatusLocal();
    return;
  }

  if (action === "save-subject") {
    saveSubjectChanges();
  }
}

function handleAdminSubjectUiKeydown(event) {
  const target = event && event.target;
  if (!target) return;

  if (target.id === "new-subject-input" && event.key === "Enter") {
    event.preventDefault();
    addPendingSubject();
  }
}

function handleAdminSubjectUiChange(event) {
  const target = event && event.target;
  if (!target || target.id !== "modify-subject-select") return;
  selectSubjectToModify();
}

let allSubjects = [];
let pendingSubjects = [];
let selectedSubject = null;
let selectedSubjectDraftActive = null;

async function showSubjectsScreen() {
  const didShow = showScreen("subjects-screen");
  if (!didShow) return;

  bindAdminSubjectUiHandlers("subjects-screen");

  pendingSubjects = [];
  selectedSubject = null;
  selectedSubjectDraftActive = null;

  setDomText("subject-add-message", "");
  hideDomElement("modify-subject-box");

  renderSubjectAddRows();
  await loadSubjectsForModify();
}

function renderSubjectAddRows() {
  const container = getDomElement("subject-add-list");
  const submitBtn = getDomElement("submit-subjects-btn");

  if (!container) {
    console.warn("Missing subject add list container.");
    return;
  }

  let html = "";

  pendingSubjects.forEach((name, index) => {
    html += `
      <div class="pending-subject-chip">
        <span>${escapeHtml(name)}</span>
        <button type="button" data-subject-action="remove-pending" data-subject-index="${index}">Remove</button>
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
        />
        <button type="button" class="enter-btn" data-subject-action="add-pending">↵</button>
      </div>
    `;
  }

  setDomHtml(container, html);
  bindAdminSubjectUiHandlers(container);

  if (submitBtn) {
    submitBtn.classList.toggle("hidden", pendingSubjects.length === 0);
    submitBtn.type = "button";
    submitBtn.dataset.subjectAction = "submit-pending";
    submitBtn.removeAttribute("onclick");
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
  const safeIndex = Number(index);
  if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= pendingSubjects.length) {
    return;
  }

  pendingSubjects.splice(safeIndex, 1);
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
    setDomText(
      "subject-add-message",
      `${added.join(", ")} ${added.length === 1 ? "has" : "have"} been added.`
    );
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
  const select = getDomElement("modify-subject-select");

  if (!select) {
    console.warn("Missing modify subject select.");
    return;
  }

  select.removeAttribute("onchange");
  select.innerHTML = `<option value="">Loading subjects...</option>`;

  let result;
  try {
    result = await apiPost("/api/admin/subjects/list", {}, state.token);
  } catch (error) {
    console.error("Failed to load subjects:", error);
    select.innerHTML = `<option value="">Failed to load subjects</option>`;
    return;
  }

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
  const select = getDomElement("modify-subject-select");
  const box = getDomElement("modify-subject-box");
  const nameInput = getDomElement("modify-subject-name");

  if (!select) {
    selectedSubject = null;
    selectedSubjectDraftActive = null;
    return;
  }

  const subjectid = select.value;
  selectedSubject = allSubjects.find(subject => subject.subjectid === subjectid);

  if (!selectedSubject) {
    if (box) box.classList.add("hidden");
    selectedSubjectDraftActive = null;
    return;
  }

  selectedSubjectDraftActive = selectedSubject.active === true;

  if (nameInput) {
    nameInput.value = selectedSubject.subjectname;
  }

  const statusBtn = getDomElement("toggle-subject-status-btn");
  if (statusBtn) {
    statusBtn.type = "button";
    statusBtn.dataset.subjectAction = "toggle-status";
    statusBtn.removeAttribute("onclick");
  }

  const saveBtn = getDomElement("save-subject-changes-btn");
  if (saveBtn) {
    saveBtn.type = "button";
    saveBtn.dataset.subjectAction = "save-subject";
    saveBtn.removeAttribute("onclick");
  }

  renderSelectedSubjectStatus();

  if (box) box.classList.remove("hidden");
}

function renderSelectedSubjectStatus() {
  const statusDisplay = getDomElement("selected-subject-status");
  const statusBtn = getDomElement("toggle-subject-status-btn");

  if (!selectedSubject) {
    if (statusDisplay) statusDisplay.innerText = "STATUS: -";
    if (statusBtn) statusBtn.innerText = "Change Status";
    return;
  }

  if (statusDisplay) {
    statusDisplay.innerText = selectedSubjectDraftActive
      ? "STATUS: ACTIVE"
      : "STATUS: INACTIVE";
  }

  if (statusBtn) {
    statusBtn.innerText = selectedSubjectDraftActive
      ? "Make Inactive"
      : "Make Active";
  }
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

  const nameInput = getDomElement("modify-subject-name");
  const subjectName = nameInput ? nameInput.value.trim() : "";

  if (!subjectName) {
    alert("Subject name cannot be empty.");
    return;
  }

  let result;
  try {
    result = await apiPost("/api/admin/subjects/update", {
      subjectid: selectedSubject.subjectid,
      subjectName,
      active: selectedSubjectDraftActive
    }, state.token);
  } catch (error) {
    console.error("Could not update subject:", error);
    alert("Could not update subject.");
    return;
  }

  if (!result.success) {
    alert(result.error || "Could not update subject.");
    return;
  }

  alert("Subject changes saved.");

  await loadSubjectsForModify();

  hideDomElement("modify-subject-box");
  selectedSubject = null;
  selectedSubjectDraftActive = null;
}

/* =========================
   ATTENDANCE
   M4L v49: moved to /js/m4l-attendance.js
========================= */

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
