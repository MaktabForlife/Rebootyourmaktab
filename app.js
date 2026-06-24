const API_BASE = "https://rebootworker.maktab4life.workers.dev";
const STUDENT_LOGIN_BASE = "https://rebootyourmaktab.maktab4life.org/student/";
const DEFAULT_STUDENT_GROUP = 1;
const APP_VERSION_STORAGE_KEY = "maktab_app_version";
const CLASS_DUAS_ITEMS = [
  {
    arabic: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَّعَلَى آلِ مُحَمَّدٍ وَّبَارِكْ وَسَلِّم",
    transliteration: "31-Allahumma salli ala muhammadew wa ala aali muhammadew wa baarik wassallim",
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

function showScreen(screenId) {
  let didShow = false;

  if (window.M4LDom && typeof window.M4LDom.safeShowScreen === "function") {
    didShow = window.M4LDom.safeShowScreen(screenId);
  } else {
    const target = document.getElementById(screenId);
    if (!target) {
      console.warn("Missing screen:", screenId);
      return false;
    }

    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });

    target.classList.add("active");
    didShow = true;
  }

  if (!didShow) {
    return false;
  }

  if (typeof updateUserBand === "function") {
    updateUserBand(screenId);
  }

  if (typeof updateBottomNavigation === "function") {
    updateBottomNavigation(screenId);
  }

  if (screenId === "student-home" && typeof scheduleStudentHomeTimetableLoad === "function") {
    scheduleStudentHomeTimetableLoad();
  }

  if (screenId === "admin-home" && typeof scheduleAdminHomeTimetableLoad === "function") {
    scheduleAdminHomeTimetableLoad();
  }

  return true;
}

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

function setError(message) {
  setDomText("auth-error", message || "");
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
      maybeAutoSubmitPin(groupId);

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
        maybeAutoSubmitPin(groupId);
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

  if (!firstInput) return;

  const focusInput = () => {
    try {
      firstInput.focus({ preventScroll: true });
    } catch (err) {
      firstInput.focus();
    }

    if (typeof firstInput.select === "function") {
      firstInput.select();
    }
  };

  setTimeout(focusInput, 80);
  setTimeout(focusInput, 260);
}

function maybeAutoSubmitPin(groupId) {
  if (groupId !== "login-pin") return;

  const loginBox = document.getElementById("login-pin-box");
  if (loginBox && loginBox.classList.contains("hidden")) return;

  const pin = getPinValue("login-pin");
  if (/^\d{4}$/.test(pin)) {
    window.setTimeout(() => submitLogin(), 0);
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

function updateAuthWelcomeBanner(username) {
  const displayName = String(username || "").trim();
  const bannerText = displayName ? `Ahlan wa Sahlan ${displayName}` : "Ahlan wa Sahlan";

  setDomText("auth-welcome-banner", bannerText);
  showDomElement("auth-welcome-banner");
}

function updateAuthLoginLabel(type) {
  const titleText = type === "admin" ? "Admin Login" : "Student Login";
  const subtitleText = "";

  setDomText("portal-title", titleText);
  setDomText("portal-subtitle", subtitleText);
}

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

    updateAuthWelcomeBanner(result.student.username);
    updateAuthLoginLabel("student");

    if (result.student.pinsetup === true) {
      showDomElement("login-pin-box");
      hideDomElement("setup-pin-box");
      focusFirstPinDigit("login-pin");
    } else {
      hideDomElement("login-pin-box");
      showDomElement("setup-pin-box");
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

    updateAuthWelcomeBanner(result.admin.username);
    updateAuthLoginLabel("admin");

    document.body.classList.add("admin-body");

    if (result.admin.pinsetup === true) {
      showDomElement("login-pin-box");
      hideDomElement("setup-pin-box");
      focusFirstPinDigit("login-pin");
    } else {
      hideDomElement("login-pin-box");
      showDomElement("setup-pin-box");
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
  hideDomElement("setup-pin-box");
  showDomElement("login-pin-box");
  focusFirstPinDigit("login-pin");
  setError("");
}

async function submitLogin() {
  if (state.loginSubmitting) return;

  const pin = getPinValue("login-pin");

  if (!/^\d{4}$/.test(pin)) {
    setError("PIN must be 4 digits.");
    return;
  }

  const path = state.portalType === "admin"
    ? "/api/admin/login"
    : "/api/login";

  state.loginSubmitting = true;

  try {
    const result = await apiPost(path, {
      uniqueid: state.uniqueid,
      pin
    });

    if (!result.success) {
      setError("Incorrect PIN. Re-enter PIN or contact web admin to reset PIN.");
      clearPinValue("login-pin");
      focusFirstPinDigit("login-pin");
      return;
    }

    state.token = result.token;
    state.userType = state.portalType;
    state.user = state.portalType === "admin" ? result.admin : result.student;

    localStorage.setItem("maktab_token", state.token);
    localStorage.setItem("maktab_user_type", state.userType);

    clearPinValue("login-pin");
    setError("");

    if (state.portalType === "admin") {
      const adminWelcome = document.getElementById("admin-welcome");
      if (adminWelcome) {
        adminWelcome.innerText = "";
      }
      showScreen("admin-home");
    } else {
      const studentHomeTitle = document.getElementById("student-home-title");
      if (studentHomeTitle) {
        studentHomeTitle.innerText = "Home";
      }

      const studentWelcome = document.getElementById("student-welcome");
      if (studentWelcome) {
        studentWelcome.innerText = "";
      }

      showScreen("student-home");
    }
  } catch (err) {
    setError("Unable to connect. Please try again.");
  } finally {
    state.loginSubmitting = false;
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

function setHomeIconButton(button, onclickValue = "goHome()") {
  if (!button) return;

  button.classList.remove("back-icon-btn", "save-return-btn");
  button.classList.add("home-icon-btn", "icon-action-btn", "icon-action-btn-large");
  button.setAttribute("onclick", onclickValue);
  button.setAttribute("aria-label", "Home");
  button.setAttribute("title", "Home");
  button.innerHTML = `
    <span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/home.svg')" aria-hidden="true"></span>
    <span class="header-icon-label">Home</span>
  `;
}

function setBackIconButton(button, onclickValue = "goHome()") {
  if (!button) return;

  button.classList.remove("home-icon-btn", "save-return-btn");
  button.classList.add("back-icon-btn", "icon-action-btn", "icon-action-btn-large");
  button.setAttribute("onclick", onclickValue);
  button.setAttribute("aria-label", "Back");
  button.setAttribute("title", "Back");
  button.innerHTML = `
    <span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/back.svg')" aria-hidden="true"></span>
    <span class="header-icon-label">Back</span>
  `;
}

function getHeaderIconButtonMarkup(type, onclickValue, label) {
  const safeType = type === "back" ? "back" : "home";
  const iconPath = safeType === "back" ? "/icons/back.svg" : "/icons/home.svg";
  const className = safeType === "back" ? "back-icon-btn" : "home-icon-btn";
  const safeLabel = escapeHtml(label || (safeType === "back" ? "Back" : "Home"));

  return `
    <button
      type="button"
      class="small-btn ${className} icon-action-btn icon-action-btn-large"
      onclick="${onclickValue}"
      aria-label="${safeLabel}"
      title="${safeLabel}"
    >
      <span class="app-icon app-icon-large" style="--app-icon-url: url('${iconPath}')" aria-hidden="true"></span>
      <span class="header-icon-label">${safeLabel}</span>
    </button>
  `;
}

function getHomeIconButtonMarkup(onclickValue = "goHome()") {
  return getHeaderIconButtonMarkup("home", onclickValue, "Home");
}

function getBackIconButtonMarkup(onclickValue = "goHome()") {
  return getHeaderIconButtonMarkup("back", onclickValue, "Back");
}

function getCurrentUserName() {
  const user = state.user || {};
  return String(
    user.username ||
    user.Username ||
    user.name ||
    user.Name ||
    user.AdminName ||
    user.StudentName ||
    ""
  ).trim();
}

function getCurrentUserLevelText() {
  const user = state.user || {};
  const role = String(user.role || user.Role || "").trim();

  if (getBottomNavRole() === "admin") {
    return role || "Admin";
  }

  const group = String(
    user.classgroup ||
    user.ClassGroup ||
    user.group ||
    user.Group ||
    ""
  ).trim();

  return group ? `Student · Group ${group}` : "Student";
}

function getUserBandElement() {
  if (!document.body) {
    console.warn("User band could not be created because document.body is missing.");
    return null;
  }

  let band = document.getElementById("app-user-band");

  if (!band) {
    band = document.createElement("header");
    band.id = "app-user-band";
    band.className = "app-user-band hidden";
    band.setAttribute("aria-label", "Logged-in user");
    document.body.prepend(band);
  }

  return band;
}

function clearUserBand(band) {
  if (!band) return false;
  band.innerHTML = "";
  return true;
}

function setBodyUserBandState(shouldShow) {
  if (!document.body) return false;
  document.body.classList.toggle("has-user-band", !!shouldShow);
  return true;
}

function attachUserBandLogoutHandler(band) {
  if (!band) return false;

  const logoutButton = band.querySelector("[data-user-band-logout]");
  if (!logoutButton) return false;

  logoutButton.addEventListener("click", (event) => {
    event.preventDefault();

    if (typeof logout === "function") {
      logout();
      return;
    }

    console.warn("Logout function is missing.");
  });

  return true;
}

function getActiveScreenId() {
  const activeScreen = document.querySelector(".screen.active");
  return activeScreen ? String(activeScreen.id || "") : "";
}

function removeLegacyScreenRefreshButtons() {
  document.querySelectorAll(".manual-refresh-btn").forEach(button => {
    if (!button.closest("#app-user-band")) {
      button.remove();
    }
  });
}

let userBandRefreshInProgress = false;

function setUserBandRefreshState(isRefreshing, button) {
  userBandRefreshInProgress = !!isRefreshing;

  const targetButton = button || document.querySelector("#app-user-band [data-user-band-refresh]");
  if (targetButton) {
    targetButton.disabled = !!isRefreshing;
    targetButton.classList.toggle("is-refreshing", !!isRefreshing);
  }

  return true;
}

function waitForUserBandRefreshFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

function waitForUserBandRefreshMinimumDuration(startTime, minimumMs) {
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, minimumMs - elapsed);

  if (!remaining) {
    return Promise.resolve();
  }

  return new Promise(resolve => setTimeout(resolve, remaining));
}

async function runUserBandRefresh(button, callback) {
  const refreshStartedAt = Date.now();
  const minimumSpinMs = 450;

  setUserBandRefreshState(true, button);

  try {
    // Let Safari/Chrome paint the spinning state before running quick synchronous refresh actions.
    await waitForUserBandRefreshFrame();
    await callback();
  } finally {
    await waitForUserBandRefreshMinimumDuration(refreshStartedAt, minimumSpinMs);
    setUserBandRefreshState(false, document.querySelector("#app-user-band [data-user-band-refresh]"));
    if (typeof updateUserBand === "function") {
      updateUserBand(getActiveScreenId());
    }
  }
}

async function refreshCurrentResourceView(button) {
  await runManualRefresh(button, async () => {
    const role = getBottomNavRole();
    const shouldUseAdminResources = studentResourceViewMode === "admin" || role === "admin";

    if (shouldUseAdminResources && typeof showAdminResources === "function") {
      await showAdminResources();
      return;
    }

    if (typeof showStudentResources === "function") {
      await showStudentResources();
      return;
    }

    console.warn("No resource refresh action is available for this screen.");
  });
}

function getUserBandRefreshAction(screenId, role) {
  const activeScreenId = String(screenId || getActiveScreenId() || "");

  if (!activeScreenId || activeScreenId === "auth-screen" || activeScreenId === "pdf-viewer-screen") {
    return null;
  }

  if (activeScreenId === "student-home") {
    return typeof refreshStudentHomeTimetable === "function"
      ? { label: "Refresh", title: "Refresh timetable", handler: refreshStudentHomeTimetable }
      : null;
  }

  if (activeScreenId === "admin-home") {
    return typeof refreshAdminHomeTimetable === "function"
      ? { label: "Refresh", title: "Refresh timetable", handler: refreshAdminHomeTimetable }
      : null;
  }

  if (activeScreenId === "admin-timetable-screen") {
    return typeof refreshAdminTimetable === "function"
      ? { label: "Refresh", title: "Refresh timetable", handler: refreshAdminTimetable }
      : null;
  }

  if (activeScreenId === "progress-report") {
    return typeof showProgressReport === "function"
      ? { label: "Refresh", title: "Refresh progress menu", handler: showProgressReport }
      : null;
  }

  if (activeScreenId === "attendance-dashboard") {
    return typeof showAttendanceDashboard === "function"
      ? { label: "Refresh", title: "Refresh attendance menu", handler: showAttendanceDashboard }
      : null;
  }

  if (activeScreenId === "admin-academics") {
    return typeof showAdminAcademics === "function"
      ? { label: "Refresh", title: "Refresh admin menu", handler: showAdminAcademics }
      : null;
  }

  if (String(activeScreenId).startsWith("student-resources")) {
    return { label: "Refresh", title: "Refresh library", handler: refreshCurrentResourceView };
  }

  if (activeScreenId === "progress-subjects-screen") {
    if (role === "student" && typeof refreshStudentTaskProgress === "function") {
      return { label: "Refresh", title: "Refresh progress", handler: refreshStudentTaskProgress };
    }

    if (role === "admin" && typeof refreshProgressSubjects === "function") {
      return { label: "Refresh", title: "Refresh progress", handler: refreshProgressSubjects };
    }
  }

  if (activeScreenId === "progress-tasks-screen") {
    if (role === "student" && typeof refreshStudentModuleTaskList === "function") {
      return { label: "Refresh", title: "Refresh tasks", handler: refreshStudentModuleTaskList };
    }

    if (role === "admin" && typeof refreshProgressTasks === "function") {
      return { label: "Refresh", title: "Refresh tasks", handler: refreshProgressTasks };
    }
  }

  if (activeScreenId === "progress-task-students-screen" && role === "admin") {
    if (progressState && progressState.contextType === "student" && typeof refreshIndividualStudentTaskList === "function") {
      return { label: "Refresh", title: "Refresh student tasks", handler: refreshIndividualStudentTaskList };
    }

    if (typeof refreshProgressTaskStudents === "function") {
      return { label: "Refresh", title: "Refresh student progress", handler: refreshProgressTaskStudents };
    }
  }

  if (activeScreenId === "attendance-report-screen" && typeof refreshViewAttendance === "function") {
    return { label: "Refresh", title: "Refresh attendance records", handler: refreshViewAttendance };
  }

  if (activeScreenId === "attendance-stats-screen" && typeof refreshAttendanceStats === "function") {
    return { label: "Refresh", title: "Refresh attendance stats", handler: refreshAttendanceStats };
  }

  return null;
}

function attachUserBandRefreshHandler(band, refreshAction) {
  if (!band || !refreshAction || typeof refreshAction.handler !== "function") return false;

  const refreshButton = band.querySelector("[data-user-band-refresh]");
  if (!refreshButton) return false;

  refreshButton.addEventListener("click", event => {
    event.preventDefault();

    if (userBandRefreshInProgress) return;

    runUserBandRefresh(refreshButton, async () => {
      await refreshAction.handler(refreshButton);
    }).catch(error => {
      console.error("User band refresh failed:", error);
      alert(error && error.message ? error.message : "Unable to refresh this screen.");
    });
  });

  return true;
}

function updateUserBand(screenId) {
  const band = getUserBandElement();
  if (!band) return false;

  const role = getBottomNavRole();
  const shouldShow = !!state.token && !!role && screenId !== "auth-screen";

  band.classList.toggle("hidden", !shouldShow);
  setBodyUserBandState(shouldShow);
  removeLegacyScreenRefreshButtons();

  if (!shouldShow) {
    clearUserBand(band);
    return false;
  }

  const username = getCurrentUserName() || (role === "admin" ? "Admin" : "Student");
  const levelText = getCurrentUserLevelText();
  const refreshAction = getUserBandRefreshAction(screenId, role);

  band.innerHTML = `
    <div class="app-user-band__identity">
      <h2 class="app-user-band__name">${escapeHtml(username)}</h2>
      <p class="app-user-band__level">${escapeHtml(levelText)}</p>
    </div>
    <div class="app-user-band__actions">
      ${refreshAction ? `
        <button type="button" class="app-user-band__refresh manual-refresh-btn icon-action-btn icon-action-btn-large${userBandRefreshInProgress ? " is-refreshing" : ""}" data-user-band-refresh aria-label="${escapeHtml(refreshAction.title || refreshAction.label || "Refresh")}" title="${escapeHtml(refreshAction.title || refreshAction.label || "Refresh")}"${userBandRefreshInProgress ? " disabled" : ""}>
          ${getRefreshIconMarkup()}
        </button>
      ` : ""}
      <button type="button" class="app-user-band__logout icon-action-btn icon-action-btn-large" data-user-band-logout aria-label="Logout" title="Logout">
        <span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/logout.svg')" aria-hidden="true"></span>
        <span class="app-user-band__logout-label">Logout</span>
      </button>
    </div>
  `;

  attachUserBandRefreshHandler(band, refreshAction);
  attachUserBandLogoutHandler(band);
  return true;
}

function setTextActionButton(button, text, onclickValue) {
  if (!button) return;

  button.classList.remove("home-icon-btn", "back-icon-btn", "icon-action-btn", "icon-action-btn-large");
  button.removeAttribute("aria-label");
  button.removeAttribute("title");
  button.textContent = text;

  if (onclickValue) {
    button.setAttribute("onclick", onclickValue);
  }
}


/* =========================
   REUSABLE BOTTOM NAVIGATION
========================= */

const BOTTOM_NAV_ITEMS = {
  student: [
    {
      key: "home",
      label: "Home",
      icon: "/icons/home.svg",
      targetScreen: "student-home"
    },
    {
      key: "library",
      label: "Library",
      icon: "/icons/resources.svg",
      targetScreen: "student-resources-subjects",
      actionName: "showStudentResources"
    },
    {
      key: "progress",
      label: "Progress",
      icon: "/icons/progress.svg",
      targetScreen: "progress-subjects-screen",
      actionName: "showStudentTasks"
    }
  ],
  admin: [
    {
      key: "home",
      label: "Home",
      icon: "/icons/home.svg",
      targetScreen: "admin-home"
    },
    {
      key: "progress",
      label: "Progress",
      icon: "/icons/progress.svg",
      targetScreen: "progress-report",
      actionName: "showProgressReport"
    },
    {
      key: "resources",
      label: "Library",
      icon: "/icons/resources.svg",
      targetScreen: "student-resources-subjects",
      actionName: "showAdminResources"
    },
    {
      key: "attendance",
      label: "Attendance",
      icon: "/icons/attendance.svg",
      targetScreen: "attendance-dashboard",
      actionName: "showAttendanceDashboard"
    },
    {
      key: "admin",
      label: "Admin",
      icon: "/icons/admin.svg",
      targetScreen: "admin-academics",
      actionName: "showAdminAcademics"
    }
  ]
};

function getBottomNavRole() {
  const userType = String(state.userType || "").trim().toLowerCase();
  const portalType = String(state.portalType || "").trim().toLowerCase();

  if (userType === "admin" || portalType === "admin") return "admin";
  if (userType === "student" || portalType === "student") return "student";

  return "";
}

function getBottomNavElement() {
  if (!document.body) {
    console.warn("Bottom navigation could not be created because document.body is missing.");
    return null;
  }

  let nav = document.getElementById("bottom-nav");

  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "bottom-nav";
    nav.className = "bottom-nav hidden";
    nav.setAttribute("aria-label", "Primary navigation");
    document.body.appendChild(nav);
  }

  installBottomNavigationGestureGuard(nav);
  return nav;
}

function installBottomNavigationGestureGuard(nav) {
  if (!nav || nav.dataset.gestureGuard === "true") return;

  nav.dataset.gestureGuard = "true";

  let touchStartX = 0;
  let touchStartY = 0;

  const stopInsideBottomNav = event => {
    event.stopPropagation();
  };

  [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "mousedown",
    "mousemove",
    "mouseup",
    "click",
    "wheel"
  ].forEach(eventName => {
    nav.addEventListener(eventName, stopInsideBottomNav, { passive: true });
  });

  nav.addEventListener("touchstart", event => {
    const touch = event.touches && event.touches[0];

    touchStartX = touch ? touch.clientX : 0;
    touchStartY = touch ? touch.clientY : 0;

    stopInsideBottomNav(event);
  }, { passive: true });

  nav.addEventListener("touchmove", event => {
    const touch = event.touches && event.touches[0];

    stopInsideBottomNav(event);

    if (!touch) return;

    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

    if (!isHorizontalSwipe) {
      event.preventDefault();
      return;
    }

    const maxScrollLeft = Math.max(0, nav.scrollWidth - nav.clientWidth);
    const isAtLeftEdge = nav.scrollLeft <= 0;
    const isAtRightEdge = nav.scrollLeft >= maxScrollLeft - 1;
    const isSwipingRight = deltaX > 0;
    const isSwipingLeft = deltaX < 0;

    if (maxScrollLeft === 0 || (isAtLeftEdge && isSwipingRight) || (isAtRightEdge && isSwipingLeft)) {
      event.preventDefault();
    }
  }, { passive: false });

  ["touchend", "touchcancel"].forEach(eventName => {
    nav.addEventListener(eventName, stopInsideBottomNav, { passive: true });
  });
}

function getBottomNavItems(role) {
  return Array.isArray(BOTTOM_NAV_ITEMS[role]) ? BOTTOM_NAV_ITEMS[role] : [];
}

function isBottomNavItemAvailable(item) {
  if (!item) return false;

  if (item.targetScreen && !document.getElementById(item.targetScreen)) {
    console.warn("Missing bottom nav target:", item.targetScreen);
    return false;
  }

  if (item.actionName && typeof window[item.actionName] !== "function") {
    console.warn("Missing bottom nav action:", item.actionName);
    return false;
  }

  return true;
}

function getAvailableBottomNavItems(role) {
  return getBottomNavItems(role).filter(isBottomNavItemAvailable);
}

function createBottomNavButton(item, role) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "bottom-nav__item";
  button.dataset.bottomNavKey = item.key;
  button.setAttribute("aria-label", item.label);

  const icon = document.createElement("span");
  icon.className = "bottom-nav__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.style.setProperty("--bottom-nav-icon", `url('${item.icon}')`);

  const label = document.createElement("span");
  label.className = "bottom-nav__label";
  label.textContent = item.label;

  button.appendChild(icon);
  button.appendChild(label);

  button.addEventListener("click", event => {
    event.preventDefault();
    handleBottomNavigationClick(role, item.key);
  });

  return button;
}

function renderBottomNavigation(role) {
  const nav = getBottomNavElement();
  if (!nav) return null;

  const items = getAvailableBottomNavItems(role);
  const itemKeys = items.map(item => item.key).join("|");

  if (nav.dataset.role === role && nav.dataset.itemKeys === itemKeys) {
    return nav;
  }

  nav.dataset.role = role || "";
  nav.dataset.itemKeys = itemKeys;
  nav.innerHTML = "";

  items.forEach(item => {
    nav.appendChild(createBottomNavButton(item, role));
  });

  return nav;
}

function shouldShowBottomNavigation(screenId, role) {
  if (!role || !state.token) return false;

  const hiddenScreens = new Set([
    "auth-screen",
    "pdf-viewer-screen"
  ]);

  return !hiddenScreens.has(screenId);
}

function getBottomNavActiveKey(screenId, role) {
  if (role === "student") {
    if (screenId === "student-home") return "home";

    if (["progress-subjects-screen", "progress-tasks-screen"].includes(screenId)) {
      return "progress";
    }

    if (String(screenId || "").startsWith("student-resources")) {
      return "library";
    }

    return "home";
  }

  if (role === "admin") {
    if (screenId === "admin-home") return "home";

    if (String(screenId || "").startsWith("attendance")) return "attendance";

    if (String(screenId || "").startsWith("admin-timetable")) return "admin";

    if (String(screenId || "").startsWith("student-resources")) return "resources";

    if ([
      "progress-report",
      "progress-subjects-screen",
      "progress-tasks-screen",
      "progress-task-students-screen",
      "teacher-student-tasks"
    ].includes(screenId)) {
      return "progress";
    }

    if (String(screenId || "").startsWith("manage-student")) return "admin";

    if (screenId === "placeholder-screen") {
      return "admin";
    }

    if (["admin-academics", "subjects-screen"].includes(screenId)) {
      return "admin";
    }

    return "home";
  }

  return "";
}

function handleBottomNavigationClick(role, key) {
  const item = getBottomNavItems(role).find(navItem => navItem.key === key);

  if (!isBottomNavItemAvailable(item)) return false;

  try {
    if (item.actionName) {
      const result = window[item.actionName]();
      if (result && typeof result.catch === "function") {
        result.catch(error => {
          console.error("Bottom nav action failed:", item.actionName, error);
        });
      }
      return true;
    }

    if (item.targetScreen) {
      return showScreen(item.targetScreen);
    }
  } catch (error) {
    console.error("Bottom nav action failed:", key, error);
  }

  return false;
}

function updateBottomNavigation(screenId) {
  const role = getBottomNavRole();
  const nav = renderBottomNavigation(role);
  if (!nav) return;

  const itemCount = nav.querySelectorAll(".bottom-nav__item").length;
  const isVisible = itemCount > 0 && shouldShowBottomNavigation(screenId, role);

  nav.classList.toggle("hidden", !isVisible);

  if (document.body) {
    document.body.classList.toggle("has-bottom-nav", isVisible);
  }

  const appShell = document.querySelector(".app-shell");
  if (appShell) {
    appShell.classList.toggle("has-bottom-nav", isVisible);
  }

  if (!isVisible) return;

  const activeKey = getBottomNavActiveKey(screenId, role);

  nav.querySelectorAll(".bottom-nav__item").forEach(item => {
    const isActive = item.dataset.bottomNavKey === activeKey;
    item.classList.toggle("is-active", isActive);
    item.setAttribute("aria-current", isActive ? "page" : "false");
  });

  const activeItem = nav.querySelector(".bottom-nav__item.is-active");
  if (activeItem && typeof activeItem.scrollIntoView === "function") {
    activeItem.scrollIntoView({ inline: "center", block: "nearest" });
  }
}

let currentPlaceholderTitle = "";

function showPlaceholder(title) {
  currentPlaceholderTitle = String(title || "").trim();
  document.getElementById("placeholder-title").innerText = currentPlaceholderTitle || "Screen";
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
        const clickAttr = canOpenSessionZoom
          ? ` type="button" onclick="openTimetableZoomLink('${escapeJsString(perSessionZoomLink)}')"`
          : "";

        if (canOpenSessionZoom) {
          return `<button class="${subjectClass}"${clickAttr}>${escapeHtml(entry.subjectname)}</button>`;
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

function setTimetableZoomButtonState(buttonId, zoomLink) {
  const button = document.getElementById(buttonId);

  if (!button) {
    return;
  }

  if (button.dataset.zoomDecorated !== "true") {
    button.dataset.zoomDecorated = "true";
    button.innerHTML = `
      <img src="/icons/zoom.svg" alt="" class="zoom-link-button__icon" aria-hidden="true" />
      <span>Join Zoom Class</span>
    `;
  }

  const hasLink = !!normalizeTimetableText(zoomLink);

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
          <button
            type="button"
            class="small-btn manual-refresh-btn icon-action-btn icon-action-btn-large"
            aria-label="Refresh timetable"
            title="Refresh timetable"
            onclick="refreshAdminHomeTimetable(this)"
          >
            ${getRefreshIconMarkup()}
          </button>
        </div>
        <div id="admin-home-timetable-content">
          <p class="helper-text">Loading timetable...</p>
        </div>
      </div>
      <button
        id="admin-home-zoom-link-btn"
        type="button"
        class="zoom-link-button"
        onclick="openTimetableZoomLink()"
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

function escapeJsString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}


/* =========================
   STUDENT TASK VIEW
========================= */

let studentSubjectTaskGroups = {};
let currentStudentSubjectKey = "";

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
      <button class="progress-list-button" onclick="openStudentSubjectTasks('${escapeForAttribute(subject.subjectid)}')">
        <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
        ${renderCompleteProgressBar(percentComplete)}
      </button>
    `;
  }).join(""));
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

      <div class="status-action task-status-control" onclick="toggleStudentSubjectTask('${escapeForAttribute(task.studenttaskid)}', ${isComplete ? "false" : "true"})">
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
let currentStudentResourceDetailReturnScreen = "";
let studentResourceViewMode = "student";
const PDFJS_VIEWER_PATH = "/pdf-viewer/web/viewer.html";

let previousPdfScreenId = "";
let currentPdfDirectLink = "";

const STUDENT_RESOURCE_CATEGORIES = [
  {
    key: "VIDEO",
    label: "Video",
    subtitle: "Movie and video resources"
  },
  {
    key: "AUDIO",
    label: "Audio",
    subtitle: "Listening resources"
  },
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
    key: "OTHER",
    label: "Other",
    subtitle: "Images, links, text and other files"
  }
];

function resetStudentResourceSelection() {
  currentStudentResourceMode = "";
  currentStudentResourceSubjectKey = "";
  currentStudentResourceSubjectName = "";
  currentStudentResourceSubjectCategoryCounts = {};
  currentStudentResourceModuleKey = "";
  currentStudentResourceModuleName = "";
  currentStudentResourceDetailReturnScreen = "";
  closeStudentResourceModulePicker();
}

async function showStudentResources() {
  studentResourceViewMode = "student";
  resetStudentResourceSelection();
  setResourceScreensForStudent();
  await loadResourceCategories("/api/resources/list", {});
}

async function showAdminResources() {
  studentResourceViewMode = "admin";
  resetStudentResourceSelection();
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
  if (listTitle) listTitle.innerText = "Library";

  const listBackButton = document.querySelector("#student-resources-subjects .small-btn");
  setHomeIconButton(listBackButton, "showScreen('student-home')");

  const mediaBackButton = document.querySelector("#student-resources-media .small-btn");
  setBackIconButton(mediaBackButton, "showScreen('student-resources-subjects')");

  const moduleBackButton = document.querySelector("#student-resources-modules .small-btn");
  setBackIconButton(moduleBackButton, "showScreen('student-resources-media')");

  const detailBackButton = document.querySelector("#student-resources-detail .small-btn");
  setBackIconButton(detailBackButton, "goBackFromStudentResourceDetail()");
}

function setResourceScreensForAdmin() {
  ["student-resources-subjects", "student-resources-media", "student-resources-modules", "student-resources-detail"].forEach(id => {
    const screen = document.getElementById(id);
    if (!screen) return;
    screen.classList.remove("student-theme");
    screen.classList.add("admin-theme");
  });

  const listTitle = document.querySelector("#student-resources-subjects h2");
  if (listTitle) listTitle.innerText = "Resources";

  const listBackButton = document.querySelector("#student-resources-subjects .small-btn");
  setHomeIconButton(listBackButton, "showScreen('admin-home')");

  const mediaBackButton = document.querySelector("#student-resources-media .small-btn");
  setBackIconButton(mediaBackButton, "showScreen('student-resources-subjects')");

  const moduleBackButton = document.querySelector("#student-resources-modules .small-btn");
  setBackIconButton(moduleBackButton, "showScreen('student-resources-media')");

  const detailBackButton = document.querySelector("#student-resources-detail .small-btn");
  setBackIconButton(detailBackButton, "goBackFromStudentResourceDetail()");
}

async function fetchResourceCategories(apiPath, body = {}) {
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
    throw new Error(result.error || "Failed to load resources");
  }

  // New backend response is grouped by media type: result.groups.
  // Older response shape used result.subjects. Keep both supported for safety.
  studentResourceSubjects = Array.isArray(result.subjects) ? result.subjects : [];
  studentResourceGroupsByType = normalizeStudentResourceGroups(result);

  return result;
}

async function loadResourceCategories(apiPath, body = {}) {
  if (!showScreen("student-resources-subjects")) {
    console.warn("Resources screen is missing; resource categories were not shown.");
    return;
  }

  const container = getDomElement("student-resource-subject-list");

  if (!container) {
    console.warn("Missing resource subject list container.");
    return;
  }

  setDomHtml(container, `<p class="helper-text">Loading resources...</p>`);

  try {
    await fetchResourceCategories(apiPath, body);
    renderStudentResourceSubjects();
  } catch (err) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(err.message || "Unable to load resources. Please try again.")}</p>`);
  }
}

async function openStudentResourceDirect(categoryKey) {
  const category = STUDENT_RESOURCE_CATEGORIES.find(item => item.key === String(categoryKey || "").toUpperCase());

  if (!category) {
    alert("Resource category not found. Please reload resources.");
    return;
  }

  studentResourceViewMode = "student";
  setResourceScreensForStudent();
  currentStudentResourceMode = category.key;
  currentStudentResourceSubjectKey = "";
  currentStudentResourceSubjectName = "";
  currentStudentResourceSubjectCategoryCounts = {};
  currentStudentResourceModuleKey = "";
  currentStudentResourceModuleName = "";

  const container = getDomElement("student-resource-detail-content");

  setDomText("student-resource-detail-title", category.label);
  setDomHtml(container, `<p class="helper-text">Loading ${escapeHtml(category.label)} resources...</p>`);

  if (!showScreen("student-resources-detail")) {
    console.warn("Resource detail screen is missing.");
    return;
  }

  try {
    await fetchResourceCategories("/api/resources/list", {});
    renderStudentResourceCategoryDetail(category);
  } catch (err) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(err.message || "Unable to load resources. Please try again.")}</p>`);
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

function getResourceCategoryIconPath(categoryKey) {
  const key = String(categoryKey || "").trim().toUpperCase();
  const iconMap = {
    EBOOKS: "/icons/ebook.svg",
    PRINTABLES: "/icons/printables.svg",
    AUDIO: "/icons/audio.svg",
    VIDEO: "/icons/video.svg",
    OTHER: "/icons/other.svg"
  };

  return iconMap[key] || "/icons/resources.svg";
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
  const container = getDomElement("student-resource-subject-list");
  if (!container) return;

  currentStudentResourceMode = "";
  currentStudentResourceSubjectKey = "";
  currentStudentResourceSubjectName = "";
  currentStudentResourceSubjectCategoryCounts = {};
  currentStudentResourceModuleKey = "";
  currentStudentResourceModuleName = "";
  currentStudentResourceDetailReturnScreen = "";
  closeStudentResourceModulePicker();

  const subjects = buildStudentResourceSubjectSummaries();

  if (subjects.length === 0) {
    setDomHtml(container, `<p class="helper-text">No resources are available yet.</p>`);
    return;
  }

  const visibleCategories = STUDENT_RESOURCE_CATEGORIES.filter(category => {
    return subjects.some(subject => Number(subject.categoryCounts[category.key] || 0) > 0);
  });

  if (visibleCategories.length === 0) {
    setDomHtml(container, `<p class="helper-text">No resources are available yet.</p>`);
    return;
  }

  const columnStyle = `--resource-media-columns: ${visibleCategories.length};`;

  setDomHtml(container, `
    <div class="resource-media-matrix-wrap" style="${columnStyle}">
      <div class="resource-media-matrix" role="table" aria-label="Resources by subject and media type">
        <div class="resource-media-row resource-media-header" role="row">
          <div class="resource-media-subject-cell" role="columnheader">Subject</div>
          ${visibleCategories.map(category => `
            <div class="resource-media-cell resource-media-heading-cell" role="columnheader">
              ${escapeHtml(category.label)}
            </div>
          `).join("")}
        </div>

        ${subjects.map(subject => `
          <div class="resource-media-row" role="row">
            <div class="resource-media-subject-cell" role="cell">
              <span class="resource-media-subject-name">${escapeHtml(subject.name)}</span>
            </div>
            ${visibleCategories.map(category => {
              const count = Number(subject.categoryCounts[category.key] || 0);

              if (count <= 0) {
                return `<div class="resource-media-cell resource-media-cell-empty" role="cell" aria-label="No ${escapeForAttribute(category.label)} resources"></div>`;
              }

              return `
                <div class="resource-media-cell" role="cell">
                  <button
                    type="button"
                    class="resource-media-icon-button"
                    data-resource-action="matrix-selection"
                    data-resource-subject-key="${escapeForAttribute(subject.key)}"
                    data-resource-category-key="${escapeForAttribute(category.key)}"
                    aria-label="Open ${escapeForAttribute(category.label)} resources for ${escapeForAttribute(subject.name)}"
                    title="${escapeForAttribute(category.label)}"
                  >
                    <span
                      class="resource-media-icon"
                      style="--resource-media-icon: url('${getResourceCategoryIconPath(category.key)}')"
                      aria-hidden="true"
                    ></span>
                  </button>
                </div>
              `;
            }).join("")}
          </div>
        `).join("")}
      </div>
    </div>
  `);

  bindResourceUiHandlers(container);
}

function openStudentResourceMatrixSelection(subjectKey, categoryKey) {
  const subjects = buildStudentResourceSubjectSummaries();
  const selectedSubject = subjects.find(subject => subject.key === subjectKey);
  const category = STUDENT_RESOURCE_CATEGORIES.find(item => item.key === String(categoryKey || "").toUpperCase());

  if (!selectedSubject || !category) {
    alert("Resource selection not found. Please reload resources.");
    return;
  }

  currentStudentResourceSubjectKey = selectedSubject.key;
  currentStudentResourceSubjectName = selectedSubject.name;
  currentStudentResourceSubjectCategoryCounts = { ...(selectedSubject.categoryCounts || {}) };
  currentStudentResourceMode = category.key;
  currentStudentResourceModuleKey = "";
  currentStudentResourceModuleName = "";
  currentStudentResourceDetailReturnScreen = "student-resources-subjects";

  const modules = buildCurrentResourceModuleSummaries(category);

  if (modules.length > 1) {
    showStudentResourceModulePicker(category, modules);
    return;
  }

  if (modules.length === 1) {
    currentStudentResourceModuleKey = modules[0].key;
    currentStudentResourceModuleName = modules[0].name;
  }

  setDomText("student-resource-detail-title", `${selectedSubject.name} - ${category.label}`);

  if (!showScreen("student-resources-detail")) {
    console.warn("Resource detail screen is missing.");
    return;
  }

  renderStudentResourceCategoryDetail(category);
}

function getStudentResourceModulePickerElement() {
  if (!document.body) {
    console.warn("Resource module picker could not be created because document.body is missing.");
    return null;
  }

  let picker = document.getElementById("resource-module-picker");

  if (!picker) {
    picker = document.createElement("div");
    picker.id = "resource-module-picker";
    picker.className = "resource-module-picker hidden";
    picker.setAttribute("aria-hidden", "true");
    document.body.appendChild(picker);
  }

  return picker;
}


function showStudentResourceModulePicker(category, modules) {
  const picker = getStudentResourceModulePickerElement();
  const safeModules = Array.isArray(modules) ? modules : [];

  if (!picker) {
    return;
  }

  const subjectName = currentStudentResourceSubjectName || "Subject";

  setDomHtml(picker, `
    <div class="resource-module-picker__backdrop" data-resource-action="close-module-picker"></div>
    <div class="resource-module-picker__panel" role="dialog" aria-modal="true" aria-labelledby="resource-module-picker-title">
      <div class="resource-module-picker__header">
        <div>
          <h3 id="resource-module-picker-title">Choose Module</h3>
          <p class="mini-text">${escapeHtml(subjectName)} - ${escapeHtml(category.label)}</p>
        </div>
        <button type="button" class="resource-module-picker__close" data-resource-action="close-module-picker" aria-label="Close module picker">×</button>
      </div>
      <div class="resource-module-picker__list">
        ${safeModules.map(module => `
          <button
            type="button"
            class="resource-module-picker__option"
            data-resource-action="module"
            data-resource-module-key="${escapeForAttribute(module.key)}"
            data-resource-return-screen="student-resources-subjects"
          >
            <span>${escapeHtml(module.name)}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `);

  bindResourceUiHandlers(picker);
  picker.classList.remove("hidden");
  picker.setAttribute("aria-hidden", "false");
  if (document.body) {
    document.body.classList.add("resource-module-picker-open");
  }
}

function closeStudentResourceModulePicker() {
  const picker = document.getElementById("resource-module-picker");

  if (!picker) return;

  picker.classList.add("hidden");
  picker.setAttribute("aria-hidden", "true");
  setDomHtml(picker, "");
  if (document.body) {
    document.body.classList.remove("resource-module-picker-open");
  }
}

function bindResourceUiHandlers(containerOrId) {
  const container = getDomElement(containerOrId);

  if (!container || typeof container.querySelectorAll !== "function") {
    return false;
  }

  container.querySelectorAll("[data-resource-action]").forEach(button => {
    if (button.dataset.resourceBound === "true") {
      return;
    }

    button.dataset.resourceBound = "true";
    button.addEventListener("click", handleResourceUiAction);
  });

  return true;
}

function handleResourceUiAction(event) {
  const button = event.target && event.target.closest
    ? event.target.closest("[data-resource-action]")
    : null;

  if (!button || button.disabled) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const action = button.getAttribute("data-resource-action") || "";

  if (action === "matrix-selection") {
    openStudentResourceMatrixSelection(
      button.getAttribute("data-resource-subject-key") || "",
      button.getAttribute("data-resource-category-key") || ""
    );
    return;
  }

  if (action === "category") {
    openStudentResourceCategory(
      button.getAttribute("data-resource-category-key") || "",
      Number(button.getAttribute("data-resource-count") || 0)
    );
    return;
  }

  if (action === "module") {
    openStudentResourceModule(
      button.getAttribute("data-resource-module-key") || "",
      button.getAttribute("data-resource-return-screen") || "student-resources-modules"
    );
    return;
  }

  if (action === "close-module-picker") {
    closeStudentResourceModulePicker();
    return;
  }

  if (action === "toggle-preview") {
    toggleInlineResourcePreview(
      button.getAttribute("data-resource-preview-id") || "",
      button.getAttribute("data-resource-link") || "",
      button.getAttribute("data-resource-type") || ""
    );
    return;
  }

  if (action === "open-link") {
    openStudentResourceLink(
      button.getAttribute("data-resource-link") || "",
      button.getAttribute("data-resource-type") || "",
      button.getAttribute("data-resource-title") || "PDF Viewer"
    );
  }
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

  setDomText("student-resource-media-title", selectedSubject.name);

  if (!showScreen("student-resources-media")) {
    console.warn("Resource media screen is missing.");
    return;
  }

  renderStudentResourceCategories(selectedSubject);
}

function renderStudentResourceCategories(selectedSubject = null) {
  const container = selectedSubject ? getDomElement("student-resource-media-list") : getDomElement("student-resource-subject-list");

  if (!container) return;

  const categoryButtons = STUDENT_RESOURCE_CATEGORIES.map(category => {
    const count = selectedSubject ? (selectedSubject.categoryCounts[category.key] || 0) : countResourcesForCategory(category);
    const disabledClass = count === 0 ? " is-empty" : "";
    const disabledAttr = count === 0 ? " disabled" : "";

    return `
      <button
        type="button"
        class="resource-category-button${disabledClass}"
        data-resource-action="category"
        data-resource-category-key="${escapeForAttribute(category.key)}"
        data-resource-count="${Number(count) || 0}"
        ${disabledAttr}
      >
        <span class="resource-category-main">
          <span class="resource-category-title">${escapeHtml(category.label)}</span>
          <span class="resource-category-subtitle">${escapeHtml(category.subtitle)}</span>
        </span>
      </button>
    `;
  }).join("");

  const total = STUDENT_RESOURCE_CATEGORIES.reduce((sum, category) => sum + (selectedSubject ? (selectedSubject.categoryCounts[category.key] || 0) : countResourcesForCategory(category)), 0);

  setDomHtml(container, `
    <div class="resource-category-grid">
      ${categoryButtons}
    </div>
    ${total === 0 ? `<p class="helper-text">No resources are available yet.</p>` : ""}
  `);

  bindResourceUiHandlers(container);
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
  currentStudentResourceDetailReturnScreen = currentStudentResourceSubjectKey ? "student-resources-media" : "";

  const availableModules = buildCurrentResourceModuleSummaries(category);

  if (availableModules.length > 1) {
    setDomText("student-resource-module-title", currentStudentResourceSubjectName ? `${currentStudentResourceSubjectName} - ${category.label}` : category.label);

    if (!showScreen("student-resources-modules")) {
      console.warn("Resource modules screen is missing.");
      return;
    }

    renderStudentResourceModules(category);
    return;
  }

  setDomText("student-resource-detail-title", currentStudentResourceSubjectName ? `${currentStudentResourceSubjectName} - ${category.label}` : category.label);

  if (!showScreen("student-resources-detail")) {
    console.warn("Resource detail screen is missing.");
    return;
  }

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
  const container = getDomElement("student-resource-module-list");
  if (!container) return;

  const modules = buildCurrentResourceModuleSummaries(category);

  if (modules.length === 0) {
    setDomHtml(container, `<p class="helper-text">No modules are available for this media type.</p>`);
    return;
  }

  setDomHtml(container, `
    <div class="resource-subject-button-grid">
      ${modules.map(module => `
        <button
          type="button"
          class="resource-subject-drill-button"
          data-resource-action="module"
          data-resource-module-key="${escapeForAttribute(module.key)}"
          data-resource-return-screen="student-resources-modules"
        >
          <span class="resource-subject-button-title">${escapeHtml(module.name)}</span>
        </button>
      `).join("")}
    </div>
  `);

  bindResourceUiHandlers(container);
}

function openStudentResourceModule(moduleKey, returnScreen = "student-resources-modules") {
  closeStudentResourceModulePicker();

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
  currentStudentResourceDetailReturnScreen = returnScreen;

  setDomText("student-resource-detail-title", `${selectedModule.name} - ${category.label}`);

  if (!showScreen("student-resources-detail")) {
    console.warn("Resource detail screen is missing.");
    return;
  }

  renderStudentResourceCategoryDetail(category);
}

function goBackFromStudentResourceDetail() {
  closeStudentResourceModulePicker();

  if (currentStudentResourceDetailReturnScreen) {
    showScreen(currentStudentResourceDetailReturnScreen);
    return;
  }

  if (currentStudentResourceModuleKey) {
    showScreen("student-resources-modules");
    return;
  }

  if (!currentStudentResourceSubjectKey) {
    if (studentResourceViewMode === "admin") {
      showAdminResources();
    } else {
      showStudentResources();
    }
    return;
  }

  showScreen("student-resources-media");
}

function renderStudentResourceCategoryDetail(category) {
  const container = getDomElement("student-resource-detail-content");
  if (!container) return;

  const subjectGroups = getCurrentSubjectGroupsForCategory(category);

  if (subjectGroups.length === 0) {
    setDomHtml(container, `<p class="helper-text">No ${escapeHtml(category.label)} resources are available yet.</p>`);
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
    setDomHtml(container, `<p class="helper-text">No ${escapeHtml(category.label)} resources are available for this module.</p>`);
    return;
  }

  setDomHtml(container, filteredSubjectGroups.map(subjectGroup => `
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
  `).join(""));

  bindResourceUiHandlers(container);
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

  const actionIconPath = getResourceCategoryIconPath(type);
  const actionIconMarkup = `<span class="resource-type-icon resource-action-icon" style="--app-icon-url: url('${actionIconPath}')" aria-hidden="true"></span>`;

  const actionHtml = (isAudio || isVideo)
    ? `
      <button
        type="button"
        class="resource-arrow-btn"
        data-resource-action="toggle-preview"
        data-resource-preview-id="${escapeForAttribute(rowId)}"
        data-resource-link="${escapeForAttribute(link)}"
        data-resource-type="${escapeForAttribute(type)}"
        ${disabled}
        aria-label="${escapeForAttribute(buttonLabel)}"
      >
        ${actionIconMarkup}
      </button>
    `
    : `
      <button
        type="button"
        class="resource-arrow-btn"
        data-resource-action="open-link"
        data-resource-link="${escapeForAttribute(link)}"
        data-resource-type="${escapeForAttribute(type)}"
        data-resource-title="${escapeForAttribute(title)}"
        ${disabled}
        aria-label="${escapeForAttribute(buttonLabel)}"
      >
        ${actionIconMarkup}
      </button>
    `;

  const previewHtml = (isAudio || isVideo)
    ? `<div id="${escapeForAttribute(rowId)}" class="inline-resource-preview hidden"></div>`
    : "";

  return `
    <div class="student-resource-row">
      <div class="student-resource-row-main">
        <div class="student-resource-title">${escapeHtml(title)}</div>
        ${format ? `<div class="student-resource-meta"><span class="resource-format-text">${escapeHtml(format)}</span></div>` : ""}
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

  const previewBox = getDomElement(playerId);

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
  studentDropdownOpen: false,
  registerSubmitting: false
};


let manageStudentsGlobalClickBound = false;
let managedStudentSaveLastTriggeredAt = 0;

function bindManageStudentsGlobalClickHandler() {
  if (manageStudentsGlobalClickBound === true) return true;
  if (!document || typeof document.addEventListener !== "function") return false;

  manageStudentsGlobalClickBound = true;
  document.addEventListener("click", handleManageStudentsUiClick);
  return true;
}

function bindManageStudentsUiHandlers(containerOrId) {
  const container = getDomElement(containerOrId);

  bindManageStudentsGlobalClickHandler();

  if (!container || container.__manageStudentsHandlersBound === true) {
    return !!container;
  }

  container.__manageStudentsHandlersBound = true;
  container.addEventListener("input", handleManageStudentsUiInput);
  container.addEventListener("keydown", handleManageStudentsUiKeydown);
  container.addEventListener("change", handleManageStudentsUiChange);
  return true;
}

function triggerManagedStudentSave() {
  const now = Date.now();
  if (now - managedStudentSaveLastTriggeredAt < 700) return;
  managedStudentSaveLastTriggeredAt = now;

  saveManagedStudentChanges();
}

function bindManagedStudentEditActionHandlers(containerOrId) {
  // Kept for compatibility with existing render calls.
  // Manage Students click actions are now handled by one document-level delegated handler,
  // so dynamically-rendered buttons such as Confirm Changes do not need per-button touch/click binding.
  bindManageStudentsGlobalClickHandler();
  return !!getDomElement(containerOrId);
}

function getManageStudentsActionElement(event) {
  const target = event && event.target;
  if (!target || typeof target.closest !== "function") return null;

  const actionEl = target.closest("[data-manage-action]");
  if (!actionEl) return null;

  const manageScope = actionEl.closest(
    "#manage-students-screen, #manage-student-edit-screen, #manage-students-result-screen, " +
    "#manage-students-content, #manage-student-edit-content, #manage-students-result-content"
  );

  return manageScope ? actionEl : null;
}

function isNativeManageStudentsInputAction(action) {
  return action === "set-active-status" ||
    action === "assignment-mode" ||
    action === "toggle-subject-modules";
}

function handleManageStudentsUiClick(event) {
  const actionEl = getManageStudentsActionElement(event);
  if (!actionEl) return;

  const action = actionEl.dataset.manageAction || "";
  if (!action) return;

  // Do not prevent the browser's native radio/checkbox behaviour.
  // The matching change handler will update state after the control changes.
  if (isNativeManageStudentsInputAction(action)) {
    return;
  }

  event.preventDefault();

  switch (action) {
    case "set-mode":
      setManageStudentsMode(actionEl.dataset.manageMode || "register");
      break;
    case "submit-register":
      submitRegisterStudent(actionEl.dataset.confirmDuplicate === "true");
      break;
    case "register-another":
      registerAnotherManagedStudent();
      break;
    case "exit-dashboard":
      showScreen("admin-home");
      break;
    case "back-to-list":
      backToManagedStudentList();
      break;
    case "toggle-dropdown":
      toggleManagedStudentDropdown();
      break;
    case "select-student":
      selectManagedStudentByUniqueId(actionEl.dataset.uniqueid || "");
      break;
    case "reset-pin":
      resetManagedStudentPin();
      break;
    case "save-student":
      triggerManagedStudentSave();
      break;
    case "copy-login-link":
      copyStudentLoginLink(actionEl.dataset.loginLink || "");
      break;
    case "copy-welcome-message":
      copyStudentWelcomeMessageFromBox(
        actionEl.dataset.messageBoxId || "",
        actionEl.dataset.loginLink || ""
      );
      break;
    case "open-whatsapp":
      openStudentWhatsAppMessageFromBox(
        actionEl.dataset.messageBoxId || "",
        actionEl.dataset.loginLink || ""
      );
      break;
    default:
      console.warn("Unknown Manage Students action:", action);
  }
}

function handleManageStudentsUiInput(event) {
  const target = event.target;

  if (target && target.id === "student-search-query") {
    filterManagedStudentsFromInput();
  }
}

function handleManageStudentsUiKeydown(event) {
  const target = event.target;

  if (target && target.id === "student-search-query" && event.key === "Enter") {
    event.preventDefault();
    searchManagedStudents();
  }
}

function handleManageStudentsUiChange(event) {
  const target = event.target;

  if (!target) return;

  if (target.name === "student-assignment-mode") {
    toggleStudentAssignmentMode();
    return;
  }

  if (target.dataset && target.dataset.manageAction === "toggle-subject-modules") {
    toggleStudentSubjectModules(target.dataset.subjectid || "", target.checked === true);
    return;
  }

  if (target.name === "student-edit-active") {
    setStudentEditActiveStatus(target.value === "true");
  }
}

function showManageStudents() {
  manageStudentsState.mode = "register";
  manageStudentsState.searchResults = [];
  manageStudentsState.searchQuery = "";
  manageStudentsState.selectedStudent = null;
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.selectedStudentActiveDraft = true;
  manageStudentsState.studentDropdownOpen = false;
  manageStudentsState.registerSubmitting = false;

  if (!showScreen("manage-students-screen")) return;

  renderManageStudentsScreen();
  loadStudentAssignmentOptions();
}

async function loadStudentAssignmentOptions() {
  if (manageStudentsState.assignmentOptions) {
    renderManageStudentsScreen();
    return;
  }

  try {
    const result = await apiPost("/api/admin/students/assignment-options", {}, state.token);

    if (result.success) {
      manageStudentsState.assignmentOptions = result.subjects || [];
    } else {
      manageStudentsState.assignmentOptions = [];
    }
  } catch (err) {
    console.error("Could not load student assignment options", err);
    manageStudentsState.assignmentOptions = [];
  }

  renderManageStudentsScreen();
}

function setManageStudentsMode(mode) {
  manageStudentsState.mode = mode === "modify" ? "modify" : "register";
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.registerSubmitting = false;

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
  const container = getDomElement("manage-students-content");
  if (!container) return;

  const isRegister = manageStudentsState.mode === "register";

  setDomHtml(container, `
    <div class="student-admin-mode-toggle" role="tablist" aria-label="Student management mode">
      <button
        type="button"
        class="student-admin-mode-btn ${isRegister ? "is-active" : ""}"
        data-manage-action="set-mode"
        data-manage-mode="register"
      >
        Register
      </button>
      <button
        type="button"
        class="student-admin-mode-btn ${!isRegister ? "is-active" : ""}"
        data-manage-action="set-mode"
        data-manage-mode="modify"
      >
        Modify
      </button>
    </div>

    ${isRegister ? renderRegisterStudentPanel() : renderModifyStudentPanel()}
  `);

  bindManageStudentsUiHandlers(container);
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
        <input type="radio" name="student-assignment-mode" value="all" checked data-manage-action="assignment-mode" />
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
      <button type="button" data-manage-action="submit-register">Register Student</button>
    </div>

    <div id="student-register-feedback" class="student-admin-feedback"></div>
  `;
}

function setRegisterStudentSubmitting(isSubmitting) {
  manageStudentsState.registerSubmitting = isSubmitting === true;

  const container = getDomElement("manage-students-content");
  if (!container) return;

  [
    "student-register-name",
    "student-register-whatsapp",
    "student-register-group"
  ].forEach((id) => {
    const input = getDomElement(id);
    if (input) {
      input.disabled = manageStudentsState.registerSubmitting;
    }
  });

  container.querySelectorAll('input[name="student-assignment-mode"], .student-module-checkbox, [data-manage-action="toggle-subject-modules"]').forEach((input) => {
    if (!input) return;
    if (input.dataset && input.dataset.permanentlyDisabled === "true") return;
    input.disabled = manageStudentsState.registerSubmitting;
  });

  const manualMode = container.querySelector('input[name="student-assignment-mode"][value="selected"]');
  if (manualMode) {
    manualMode.disabled = true;
    manualMode.dataset.permanentlyDisabled = "true";
  }

  const submitButton = container.querySelector('[data-manage-action="submit-register"]');
  if (submitButton) {
    submitButton.disabled = manageStudentsState.registerSubmitting;
    submitButton.setAttribute("aria-busy", manageStudentsState.registerSubmitting ? "true" : "false");
    submitButton.textContent = manageStudentsState.registerSubmitting ? "Registering..." : "Register Student";
  }
}

function clearRegisterStudentForm() {
  const nameInput = getDomElement("student-register-name");
  const whatsappInput = getDomElement("student-register-whatsapp");
  const groupInput = getDomElement("student-register-group");

  if (nameInput) nameInput.value = "";
  if (whatsappInput) whatsappInput.value = "";
  if (groupInput) groupInput.value = String(DEFAULT_STUDENT_GROUP);

  const assignmentAll = document.querySelector('input[name="student-assignment-mode"][value="all"]');
  if (assignmentAll) assignmentAll.checked = true;

  document.querySelectorAll(".student-module-checkbox").forEach((input) => {
    input.checked = false;
  });

  const optionsBox = getDomElement("student-assignment-options");
  if (optionsBox) {
    optionsBox.classList.add("hidden");
    optionsBox.setAttribute("aria-hidden", "true");
  }

  setDomText("student-register-feedback", "");
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
            data-subjectid="${escapeAttribute(subjectId)}"
            data-moduleid="${escapeAttribute(moduleId)}"
          />
          <span>${escapeHtml(moduleName)}</span>
          <small>${taskCount} task${taskCount === 1 ? "" : "s"}</small>
        </label>
      `;
    }).join("");

    return `
      <div class="student-assignment-subject-card">
        <label class="student-subject-check-row">
          <input type="checkbox" data-manage-action="toggle-subject-modules" data-subjectid="${escapeAttribute(subjectId)}" />
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
  const optionsBox = getDomElement("student-assignment-options");

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
  if (manageStudentsState.registerSubmitting === true) {
    return;
  }

  const nameInput = getDomElement("student-register-name");
  const whatsappInput = getDomElement("student-register-whatsapp");
  const groupInput = getDomElement("student-register-group");

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

  setRegisterStudentSubmitting(true);
  setDomText("student-register-feedback", "Registering student...");

  let result;

  try {
    result = await apiPost("/api/admin/register-student", {
      username,
      whatsapp6,
      classgroup,
      confirmDuplicate: confirmDuplicate === true,
      assignmentMode,
      selectedModules
    }, state.token);
  } catch (err) {
    console.error("Student registration failed", err);
    setRegisterStudentSubmitting(false);
    setDomText("student-register-feedback", "Registration failed. Please try again.");
    return;
  }

  if (result.duplicate) {
    setRegisterStudentSubmitting(false);
    setDomText("student-register-feedback", "Possible duplicate found.");

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
    setRegisterStudentSubmitting(false);
    setDomText("student-register-feedback", result.error || "Registration failed.");
    return;
  }

  manageStudentsState.lastRegisteredStudent = normalizeManagedStudent(result);

  clearRegisterStudentForm();

  if (!showScreen("manage-students-result-screen")) {
    setRegisterStudentSubmitting(false);
    return;
  }

  renderManageStudentResultScreen("registered");
  setRegisterStudentSubmitting(false);
}

function renderManageStudentResultScreen(context) {
  const container = getDomElement("manage-students-result-content");
  if (!container) return;

  const student = manageStudentsState.lastRegisteredStudent || manageStudentsState.selectedStudent;

  if (!student) {
    setDomHtml(container, `<p class="helper-text">No student selected.</p>`);
    return;
  }

  const actionButtons = context === "registered"
    ? `
      <div class="student-admin-action-grid two-col">
        <button type="button" data-manage-action="register-another">Register Another Student</button>
        <button type="button" class="home-text-action-btn" data-manage-action="exit-dashboard"><span class="home-text-action-btn__icon" aria-hidden="true"></span><span>Exit to Dashboard</span></button>
      </div>
    `
    : `
      <div class="student-admin-action-grid two-col">
        <button type="button" class="back-icon-btn icon-action-btn icon-action-btn-large" data-manage-action="back-to-list" aria-label="Back to student list" title="Back to student list"><span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/back.svg')" aria-hidden="true"></span><span class="header-icon-label">Back</span></button>
        <button type="button" class="home-text-action-btn" data-manage-action="exit-dashboard"><span class="home-text-action-btn__icon" aria-hidden="true"></span><span>Exit to Dashboard</span></button>
      </div>
    `;

  setDomHtml(container, `
    ${renderStudentMessageResult(student, context || "registered")}
    ${actionButtons}
  `);

  bindManageStudentsUiHandlers(container);
}

function registerAnotherManagedStudent() {
  manageStudentsState.mode = "register";
  manageStudentsState.lastRegisteredStudent = null;
  manageStudentsState.selectedStudent = null;
  manageStudentsState.registerSubmitting = false;

  if (!showScreen("manage-students-screen")) return;

  renderManageStudentsScreen();
}

function backToManagedStudentList() {
  manageStudentsState.mode = "modify";
  manageStudentsState.selectedStudent = null;

  if (!showScreen("manage-students-screen")) return;

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

        />
        <button
          type="button"
          class="student-search-arrow-btn"
          data-manage-action="toggle-dropdown"
          aria-label="Show student list"
        >${dropdownLabel}</button>
      </div>

      <p class="student-admin-help">Tap the arrow to open the student list, or type to filter.</p>
      <div id="student-search-feedback" class="student-admin-feedback">
        ${manageStudentsState.studentListLoaded ? `${shownCount} of ${totalCount} student${totalCount === 1 ? "" : "s"} shown.` : ""}
      </div>
      ${loadingText}

      <div class="student-search-dropdown managed-student-list ${manageStudentsState.studentDropdownOpen ? "is-open" : ""}">
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

  let result;

  try {
    result = await apiPost("/api/admin/students/search", {
      query: "",
      listAll: true
    }, state.token);
  } catch (err) {
    console.error("Could not load managed student list", err);
    result = { success: false, error: "Could not load student list." };
  }

  manageStudentsState.studentListLoading = false;

  if (!result.success) {
    manageStudentsState.allStudents = [];
    manageStudentsState.searchResults = [];
    manageStudentsState.studentListLoaded = true;
    renderManageStudentsScreen();
    setDomText("student-search-feedback", result.error || "Could not load student list.");
    return;
  }

  manageStudentsState.allStudents = sortManagedStudents((result.students || []).map(normalizeManagedStudent));
  manageStudentsState.studentListLoaded = true;
  applyManagedStudentFilter(manageStudentsState.searchQuery || "");
  renderManageStudentsScreen();
  setDomText("student-search-feedback", `${manageStudentsState.searchResults.length} student${manageStudentsState.searchResults.length === 1 ? "" : "s"} shown.`);
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
      <button type="button" class="student-search-row" data-manage-action="select-student" data-uniqueid="${escapeAttribute(student.uniqueid)}">
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
  const input = getDomElement("student-search-query");
  const query = input ? input.value : "";
  manageStudentsState.searchQuery = query;
  manageStudentsState.studentDropdownOpen = true;
  applyManagedStudentFilter(query);
  updateManagedStudentListOnly();
}

function updateManagedStudentListOnly() {
  const list = document.querySelector(".managed-student-list");

  if (list) {
    setDomHtml(list, renderManagedStudentList());
  }

  setDomText("student-search-feedback", `${manageStudentsState.searchResults.length} student${manageStudentsState.searchResults.length === 1 ? "" : "s"} shown.`);
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
  const input = getDomElement("student-search-query");
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

  if (!showScreen("manage-student-edit-screen")) return;

  renderManagedStudentEditScreen();
}

function selectManagedStudent(index) {
  const student = manageStudentsState.searchResults[index];

  if (!student) return;

  manageStudentsState.selectedStudent = normalizeManagedStudent(student);
  manageStudentsState.selectedStudentActiveDraft = manageStudentsState.selectedStudent.active === true;
  manageStudentsState.studentDropdownOpen = false;

  if (!showScreen("manage-student-edit-screen")) return;

  renderManagedStudentEditScreen();
}

function renderManagedStudentEditScreen() {
  const container = getDomElement("manage-student-edit-content");
  if (!container) return;

  if (!manageStudentsState.selectedStudent) {
    setDomHtml(container, `<p class="helper-text">No student selected.</p>`);
    return;
  }

  setDomHtml(container, renderSelectedStudentEditor());
  bindManageStudentsUiHandlers(container);
  bindManagedStudentEditActionHandlers(container);
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
      <button type="button" class="student-reset-pin-btn" data-manage-action="reset-pin">Reset PIN</button>
    </div>

    <div class="student-admin-card selected-student-edit-card">
      <div class="student-admin-card-title">Edit Student Details</div>

      <label class="student-admin-label" for="student-edit-name">Name</label>
      <input id="student-edit-name" class="student-prefilled-input" type="text" value="${escapeAttribute(student.username || "")}" />

      <label class="student-admin-label" for="student-edit-whatsapp">WhatsApp Number</label>
      <input id="student-edit-whatsapp" class="student-prefilled-input" type="tel" inputmode="tel" value="${escapeAttribute(student.whatsapp6 || "")}" />

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
          <div class="student-admin-radio-group student-edit-status-radio-group" role="radiogroup" aria-label="Active Status">
            <label class="student-admin-radio-row student-edit-status-radio ${manageStudentsState.selectedStudentActiveDraft === true ? "is-selected" : ""}">
              <input
                type="radio"
                name="student-edit-active"
                value="true"
                ${manageStudentsState.selectedStudentActiveDraft === true ? "checked" : ""}
              />
              <span>Active</span>
            </label>

            <label class="student-admin-radio-row student-edit-status-radio ${manageStudentsState.selectedStudentActiveDraft === true ? "" : "is-selected"}">
              <input
                type="radio"
                name="student-edit-active"
                value="false"
                ${manageStudentsState.selectedStudentActiveDraft === true ? "" : "checked"}
              />
              <span>Inactive</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="student-admin-action-grid">
      <button type="button" data-manage-action="save-student">Confirm Changes</button>
    </div>

    ${renderStudentMessageResult(student, "selected")}

    <div id="student-edit-feedback" class="student-admin-feedback"></div>
  `;
}

function setStudentEditActiveStatus(isActive) {
  manageStudentsState.selectedStudentActiveDraft = isActive === true;

  document.querySelectorAll(".student-edit-status-radio").forEach(option => {
    const input = option.querySelector("input");
    option.classList.toggle("is-selected", !!input && input.checked);
  });
}

function toggleSelectedStudentActive() {
  setStudentEditActiveStatus(!manageStudentsState.selectedStudentActiveDraft);
}

async function saveManagedStudentChanges() {
  const student = manageStudentsState.selectedStudent;
  const nameInput = getDomElement("student-edit-name");
  const whatsappInput = getDomElement("student-edit-whatsapp");
  const groupInput = getDomElement("student-edit-group");

  if (!student) return;

  const username = nameInput ? nameInput.value.trim() : "";
  const whatsappRaw = whatsappInput ? whatsappInput.value.trim() : "";
  const classgroup = groupInput && groupInput.value.trim() ? groupInput.value.trim() : String(DEFAULT_STUDENT_GROUP);
  const activeRadio = document.querySelector('input[name="student-edit-active"]:checked');
  const active = activeRadio
    ? activeRadio.value === "true"
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

  setDomText("student-edit-feedback", "Saving changes...");

  let result;

  try {
    result = await apiPost("/api/admin/update-student", payload, state.token);
  } catch (err) {
    console.error("Could not save managed student changes", err);
    setDomText("student-edit-feedback", "Could not save changes.");
    return;
  }

  if (!result.success) {
    setDomText("student-edit-feedback", result.error || "Could not save changes.");
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

  setDomText("student-edit-feedback", "Student changes saved.");
}

async function resetManagedStudentPin() {
  const student = manageStudentsState.selectedStudent;

  if (!student) return;

  const proceed = confirm("Reset this student's PIN? They will create a new 4-digit PIN on next login.");
  if (!proceed) return;

  setDomText("student-edit-feedback", "Resetting PIN...");

  let result;

  try {
    result = await apiPost("/api/admin/reset-pin", {
      uniqueid: student.uniqueid
    }, state.token);
  } catch (err) {
    console.error("PIN reset failed", err);
    setDomText("student-edit-feedback", "PIN reset failed.");
    return;
  }

  if (!result.success) {
    setDomText("student-edit-feedback", result.error || "PIN reset failed.");
    return;
  }

  setDomText("student-edit-feedback", "PIN reset successfully. The student can use the same link and create a new PIN.");
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

      <div class="student-link-box student-icon-field">
        <span class="student-link-text">${escapeHtml(loginLink)}</span>
        <button
          type="button"
          class="student-copy-icon-btn"
          data-manage-action="copy-login-link"
          data-login-link="${escapeAttribute(loginLink)}"
          aria-label="Copy student link"
          title="Copy student link"
        >
          <img src="/icons/copy.svg" alt="" class="student-copy-icon" />
        </button>
      </div>
      ${assignmentLine}

      <label class="student-admin-label" for="${messageBoxId}">WhatsApp Message</label>
      <div class="student-message-box-wrap">
        <textarea
          id="${messageBoxId}"
          class="student-message-textarea student-icon-field-textarea"
          rows="11"
        >${escapeHtml(message)}</textarea>
        <button
          type="button"
          class="student-copy-icon-btn student-message-copy-btn"
          data-manage-action="copy-welcome-message"
          data-message-box-id="${escapeAttribute(messageBoxId)}"
          data-login-link="${escapeAttribute(loginLink)}"
          aria-label="Copy WhatsApp message"
          title="Copy WhatsApp message"
        >
          <img src="/icons/copy.svg" alt="" class="student-copy-icon" />
        </button>
      </div>

      <button
        type="button"
        class="student-whatsapp-icon-btn"
        data-manage-action="open-whatsapp"
        data-message-box-id="${escapeAttribute(messageBoxId)}"
        data-login-link="${escapeAttribute(loginLink)}"
        aria-label="Open WhatsApp message"
        title="Open WhatsApp message"
      >
        <img src="/icons/whatsapp.svg" alt="WhatsApp" class="student-whatsapp-icon" />
      </button>
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
  const box = getDomElement(messageBoxId);
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

  if (!document.body) {
    window.prompt("Copy this text:", text);
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

    setDomHtml("progress-subjects-list", subjects.map(subject => `
      <button class="progress-list-button" onclick="openProgressSubject('${escapeForAttribute(subject.subjectid)}', '${escapeForAttribute(subject.subjectname)}')">
        <span class="progress-list-title">${escapeHtml(subject.subjectname)}</span>
        ${renderProgressBars(subject.completedPercent, subject.verifiedPercent)}
      </button>
    `).join(""));
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

    setDomHtml("progress-tasks-list", sortedTasks.map(task => `
      <button class="progress-list-button" onclick="openProgressTask('${escapeForAttribute(task.taskid)}', '${escapeForAttribute(task.taskname)}')">
        <span class="progress-list-title">${escapeHtml(task.taskname)}</span>
        ${renderProgressBars(task.completedPercent, task.verifiedPercent)}
      </button>
    `).join(""));
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

          <div class="status-action task-status-control is-muted-status" onclick="toggleProgressPending('${escapeForAttribute(row.studenttaskid)}', 'completeStatus', ${isComplete ? "false" : "true"})">
            ${renderTaskStatusIndicator("complete", isComplete, { muted: !isComplete })}
          </div>

          <div class="status-action task-status-control" onclick="toggleProgressPending('${escapeForAttribute(row.studenttaskid)}', 'verifyStatus', ${isVerified ? "false" : "true"})">
            ${renderTaskStatusIndicator("verify", isVerified)}
          </div>
        </div>
      `;
    });
  });

  setDomHtml(container, html);
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

            <div class="status-action task-status-control is-muted-status" onclick="toggleProgressPending('${escapeForAttribute(row.studenttaskid)}', 'completeStatus', ${isComplete ? "false" : "true"})">
              ${renderTaskStatusIndicator("complete", isComplete, { muted: !isComplete })}
            </div>

            <div class="status-action task-status-control" onclick="toggleProgressPending('${escapeForAttribute(row.studenttaskid)}', 'verifyStatus', ${isVerified ? "false" : "true"})">
              ${renderTaskStatusIndicator("verify", isVerified)}
            </div>
          </div>
        `;
      });
    });
  });

  setDomHtml(container, html);
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
