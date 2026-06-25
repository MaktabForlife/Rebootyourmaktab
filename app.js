/* M4L v51 - Clean app core after module splits.
   Load before m4l-auth, m4l-shell, m4l-attendance, m4l-admin-academics, m4l-timetable, m4l-resources, m4l-progress, and m4l-manage-students. */
const API_BASE = "https://rebootworker.maktab4life.workers.dev";
const STUDENT_LOGIN_BASE = "https://rebootyourmaktab.maktab4life.org/student/";
const DEFAULT_STUDENT_GROUP = 1;
const APP_VERSION_STORAGE_KEY = "maktab_app_version";
const CLASS_DUAS_ITEMS = [
  {
    arabic: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَّعَلَى آلِ مُحَمَّدٍ وَّبَارِكْ وَسَلِّم",
    transliteration: "Allahumma salli ala muhammadew wa ala aali muhammadew wa baarik wassallim-51",
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

/* =========================
   FEATURE MODULES
   Auth, shell/navigation, attendance, admin academics, timetable, resources, progress, and manage-students load from /js/.
   app.js keeps shared constants, state, startup, safe DOM wrappers, and home-only content.
========================= */

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
