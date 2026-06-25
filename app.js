/* M4L v44 - App shell after Manage Students split regression fixes.
   Load before m4l-auth, m4l-shell, m4l-timetable, m4l-resources, m4l-progress, and m4l-manage-students. */
const API_BASE = "https://rebootworker.maktab4life.workers.dev";
const STUDENT_LOGIN_BASE = "https://rebootyourmaktab.maktab4life.org/student/";
const DEFAULT_STUDENT_GROUP = 1;
const APP_VERSION_STORAGE_KEY = "maktab_app_version";
const CLASS_DUAS_ITEMS = [
  {
    arabic: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَّعَلَى آلِ مُحَمَّدٍ وَّبَارِكْ وَسَلِّم",
    transliteration: "Allahumma salli ala muhammadew wa ala aali muhammadew wa baarik wassallim-45a",
    translation: "Oh Allah send peace and blessings upon Muhammad and the family of Muhammad"
  },
  {
    arabic: "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي يَفْقَهُوا قَوْلِي",
    transliteration: "Rabbish sharh lee sadree. Wa yassir lee amree. Wahlul ‘uqdatan mil lisa nee. Yafqahoo qawlee",
    translation: "O my Sustainer! Open up my heart and make my task easy for me, and loosen the knot from my tongue so that they might fully understand my speech"
  },
  {
    arabic: "رَبِّ يَسِّرْ وَلاَ تُعَسِّرْ وَتَمِّمْ بِالْخَیْر وَبِكَ نَسْتَعِينُ يَا فَتَّاحُ يَا عَلِيْمُ",
    transliteration: "Rabbi, yassir wa la tu’assir wa tammim bil khair wa bika nasta’een. yaa fattaah Ya A’LeemU",
    translation: "O Lord, make it easy and do not make it difficult, and make it end well. We seek your help. Oh the Opener, Oh the All Knowing"
  },
  {
    arabic: "رَبِّ زِدْنِا عِلْمًا",
    transliteration: "Rabbi Zidnaa IlMan",
    translation: "Oh lord increase us in knowledge"
  },
  {
    arabic: "اللّهُمَّ أعِنَّا على ذِكْرِكَ، وَشُكْرِكَ، وَحُسْنِ عِبَادَتِكَ",
    transliteration: "Allahumma A inna Ala Zikrika, Wa Shukrika, Wa Husni Ibadatika",
    translation: "O Allah, help me remember You, to be grateful to You and to worship You in an excellent manner"
  },
  {
    arabic: "سُبْحَانَكَ لَا عِلْمَ لَنَا إِلَّا مَا عَلَّمْتَنَا ۖ إِنَّكَ أَنتَ الْعَلِيمُ الْحَكِيمُ",
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
   STUDENT / ADMIN PROGRESS
   M4L v42: moved to /js/m4l-progress.js
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
  const homeButton = document.querySelector("#attendance-dashboard .small-btn");
  if (homeButton) {
    setHomeIconButton(homeButton, "showScreen('admin-home')");
  }

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
    return;
  }

  if (!endDate) return;

  if (normalizedMode === "stats") {
    renderAttendanceStatsScreen(startDate, endDate);
  } else {
    renderViewAttendanceScreen(startDate, endDate);
  }
}

function renderAttendanceDateFilter(mode, startDate, endDate) {
  const normalizedMode = mode === "stats" ? "stats" : "view";
  const prefix = normalizedMode === "stats" ? "stats" : "view";

  return `
    <div class="attendance-filter-box">
      <div class="attendance-date-title">Choose date range</div>

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
    </div>
  `;
}

function bindAttendanceUiHandlers(containerOrId) {
  const container = getDomElement(containerOrId);
  if (!container) return false;

  container.querySelectorAll("[data-attendance-date-mode]").forEach(input => {
    input.addEventListener("change", () => {
      handleAttendanceDateRangeChange(input.dataset.attendanceDateMode || "view");
    });
  });

  container.querySelectorAll('[data-attendance-action="toggle-absent-dates"]').forEach(row => {
    const toggle = () => {
      const targetId = row.dataset.attendanceTarget || "";
      if (targetId) {
        toggleAbsentDates(targetId);
      }
    };

    row.addEventListener("click", toggle);
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  });

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

  if (action === "back-dashboard") {
    showScreen("attendance-dashboard");
    return;
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
  saveButton.innerText = isSaving ? "Saving..." : "Save Attendance →";
  return true;
}

function getAttendanceBackButtonMarkup() {
  return `
    <button
      type="button"
      class="small-btn back-icon-btn icon-action-btn icon-action-btn-large"
      data-attendance-register-action="back-dashboard"
      aria-label="Back"
      title="Back"
    >
      <span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/back.svg')" aria-hidden="true"></span>
      <span class="header-icon-label">Back</span>
    </button>
  `;
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
    <div class="attendance-register-sticky">
    <div class="attendance-modern-header">
      <h2 class="visually-hidden">Attendance</h2>
      ${getAttendanceBackButtonMarkup()}
      <button
        type="button"
        class="small-btn save-return-btn attendance-save-btn"
        data-attendance-register-action="save-register"
      >Save Attendance →</button>
    </div>

    
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
  showScreen("attendance-dashboard");
}

function openViewAttendance() {
  const range = getDefaultAttendanceDateRange();
  renderViewAttendanceScreen(range.start, range.end);
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

  setDomHtml(container, `<p class="helper-text">Loading attendance...</p>`);

  let result;
  try {
    result = await apiPost("/api/attendance/report", {
      startDate: range.start,
      endDate: range.end,
      classgroup: "ALL"
    }, state.token);
  } catch (error) {
    console.error("Failed to load attendance report:", error);
    setDomHtml(container, `<p class="error-message">Failed to load attendance.</p>`);
    return;
  }

  if (!result.success) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(result.error || result.message || "Failed to load attendance.")}</p>`);
    return;
  }

  const groups = groupAttendanceStudents(result.students || []);
  const sortedGroups = Object.keys(groups).sort(sortGroupValues);

  let html = `
    <div class="nav-header">
      <h2>Attendance Records</h2>
      ${getManualRefreshButtonMarkup("refreshViewAttendance(this)")}
      ${getBackIconButtonMarkup("showScreen('attendance-dashboard')")}
    </div>

    ${renderAttendanceDateFilter("view", range.start, range.end)}

    <div class="attendance-report-header">
      <div>NAME</div>
      <div>DAY ABSENT</div>
      <div class="attendance-percent-heading"><span>Attendance</span><span>%</span></div>
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
}

function openAttendanceStats() {
  const range = getDefaultAttendanceDateRange();
  renderAttendanceStatsScreen(range.start, range.end);
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

  setDomHtml(container, `<p class="helper-text">Calculating statistics...</p>`);

  let result;
  try {
    result = await apiPost("/api/attendance/report", {
      startDate: range.start,
      endDate: range.end,
      classgroup: "ALL"
    }, state.token);
  } catch (error) {
    console.error("Failed to load attendance stats:", error);
    setDomHtml(container, `<p class="error-message">Failed to load statistics.</p>`);
    return;
  }

  if (!result.success) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(result.error || result.message || "Failed to load statistics.")}</p>`);
    return;
  }

  const groupAverages = Array.isArray(result.groupAverages) ? result.groupAverages : [];
  const perfectStudents = Array.isArray(result.perfectAttendanceStudents) ? result.perfectAttendanceStudents : [];

  let html = `
    <div class="nav-header">
      <h2>Statistics</h2>
      ${getManualRefreshButtonMarkup("refreshAttendanceStats(this)")}
      ${getBackIconButtonMarkup("showScreen('attendance-dashboard')")}
    </div>

    ${renderAttendanceDateFilter("stats", range.start, range.end)}

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
