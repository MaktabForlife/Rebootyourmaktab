/* M4L v82 - Shell / Navigation / User Band module.
   Owns Home native scroll dot binding, app browser-back history handling, and cover-home navigation.
   /js/m4l-swipe.js is no longer required. */

function showScreen(screenId) {
  const previousScreenId = typeof getActiveScreenId === "function" ? getActiveScreenId() : "";
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

  if (typeof updateActiveSectionBodyClasses === "function") {
    updateActiveSectionBodyClasses(screenId);
  }

  if (typeof updateBottomNavigation === "function") {
    updateBottomNavigation(screenId);
  }

  if (typeof bindCoverHomeNavigation === "function") {
    bindCoverHomeNavigation();
  }

  if (typeof hydrateCoverHomeNavigationButtons === "function") {
    hydrateCoverHomeNavigationButtons(document.getElementById(screenId) || document);
  }

  if (typeof bindHomeNativeScrollControls === "function") {
    bindHomeNativeScrollControls(screenId);
  }

  if (screenId === "student-home" && typeof scheduleStudentHomeTimetableLoad === "function") {
    scheduleStudentHomeTimetableLoad();
  }

  if (screenId === "admin-home" && typeof scheduleAdminHomeTimetableLoad === "function") {
    scheduleAdminHomeTimetableLoad();
  }

  if (typeof recordM4LAppHistoryScreen === "function") {
    recordM4LAppHistoryScreen(screenId, { from: previousScreenId });
  }

  return true;
}



/* =========================
   APP BROWSER BACK HISTORY - V80
   Keeps Android/Samsung/iPhone browser Back inside the app where possible.
========================= */

const M4L_APP_HISTORY_FLAG = "maktab4life";
const M4L_APP_HISTORY_VERSION = 82;
const M4L_APP_HISTORY_EXIT_WINDOW_MS = 1800;

let m4lAppHistoryBound = false;
let m4lAppHistoryHandlingPopState = false;
let m4lAppHistoryExitArmed = false;
let m4lAppHistoryLastExitPromptAt = 0;

function isM4LAppHistorySupported() {
  return typeof window !== "undefined" &&
    window.history &&
    typeof window.history.pushState === "function" &&
    typeof window.history.replaceState === "function";
}

function getM4LAppHistoryCurrentState() {
  return isM4LAppHistorySupported() ? (window.history.state || null) : null;
}

function isM4LAppHistoryState(candidate) {
  return !!candidate && candidate.app === M4L_APP_HISTORY_FLAG;
}

function getM4LAppHomeScreenId(roleValue) {
  const role = String(roleValue || (typeof getBottomNavRole === "function" ? getBottomNavRole() : "") || "").toLowerCase();
  return role === "admin" ? "admin-home" : "student-home";
}

function isM4LAppHomeScreen(screenId) {
  const id = String(screenId || "");
  return id === "student-home" || id === "admin-home";
}

function isM4LAppAuthScreen(screenId) {
  return String(screenId || "") === "auth-screen";
}

function isM4LAppLayerScreen(screenId) {
  return String(screenId || "") === "pdf-viewer-screen";
}

function getM4LAppHistoryRole() {
  return typeof getBottomNavRole === "function" ? String(getBottomNavRole() || "") : "";
}

function getM4LAppHistoryToken() {
  if (typeof state !== "undefined" && state && state.token) {
    return String(state.token || "");
  }

  try {
    return String(localStorage.getItem("maktab_token") || "");
  } catch (error) {
    return "";
  }
}

function getM4LAppHistoryStateForScreen(screenId, options = {}) {
  const id = String(screenId || "");
  const role = getM4LAppHistoryRole();
  const kind = isM4LAppLayerScreen(id)
    ? "layer"
    : (isM4LAppHomeScreen(id) ? "home" : (isM4LAppAuthScreen(id) ? "auth" : "screen"));

  const stateData = {
    app: M4L_APP_HISTORY_FLAG,
    version: M4L_APP_HISTORY_VERSION,
    screenId: id,
    role,
    kind
  };

  if (kind === "layer") {
    const from = String(options.from || "");
    stateData.returnTo = from && from !== id ? from : getM4LAppHomeScreenId(role);
  }

  if (options.guard === true) {
    stateData.guard = true;
  }

  return stateData;
}

function bindM4LAppHistoryBackHandler() {
  if (m4lAppHistoryBound === true) return true;
  if (!isM4LAppHistorySupported() || typeof window.addEventListener !== "function") return false;

  m4lAppHistoryBound = true;
  window.addEventListener("popstate", handleM4LAppHistoryPopState);
  return true;
}

function replaceM4LAppHistoryState(screenId, options = {}) {
  if (!isM4LAppHistorySupported()) return false;
  window.history.replaceState(getM4LAppHistoryStateForScreen(screenId, options), "", window.location.href);
  return true;
}

function pushM4LAppHistoryState(screenId, options = {}) {
  if (!isM4LAppHistorySupported()) return false;
  window.history.pushState(getM4LAppHistoryStateForScreen(screenId, options), "", window.location.href);
  return true;
}

function ensureM4LAppHomeHistory(screenId) {
  const id = String(screenId || getM4LAppHomeScreenId());
  const currentState = getM4LAppHistoryCurrentState();

  if (isM4LAppHistoryState(currentState) &&
      currentState.screenId === id &&
      currentState.kind === "home" &&
      currentState.guard === true) {
    return true;
  }

  replaceM4LAppHistoryState(id);
  pushM4LAppHistoryState(id, { guard: true });
  return true;
}

function shouldSkipM4LAppHistoryDuplicate(screenId) {
  const currentState = getM4LAppHistoryCurrentState();
  if (!isM4LAppHistoryState(currentState)) return false;

  return currentState.screenId === String(screenId || "") &&
    currentState.kind !== "layer" &&
    currentState.guard !== true;
}

function recordM4LAppHistoryScreen(screenId, options = {}) {
  const id = String(screenId || "");

  if (!id || !isM4LAppHistorySupported()) return false;
  bindM4LAppHistoryBackHandler();

  if (m4lAppHistoryHandlingPopState === true) {
    return false;
  }

  if (isM4LAppAuthScreen(id)) {
    replaceM4LAppHistoryState(id);
    return true;
  }

  if (!getM4LAppHistoryToken()) {
    return false;
  }

  const currentState = getM4LAppHistoryCurrentState();

  // If an in-app close button closes a temporary layer, replace the layer entry
  // instead of pushing a new duplicate return screen. This prevents Back from
  // reopening the resource that was just closed.
  if (isM4LAppHistoryState(currentState) &&
      currentState.kind === "layer" &&
      String(currentState.returnTo || "") === id) {
    replaceM4LAppHistoryState(id);
    return true;
  }

  if (isM4LAppHomeScreen(id)) {
    ensureM4LAppHomeHistory(id);
    return true;
  }

  if (shouldSkipM4LAppHistoryDuplicate(id)) {
    return false;
  }

  pushM4LAppHistoryState(id, { from: options.from });
  return true;
}

function showM4LAppBackExitHint() {
  if (!document || !document.body) return false;

  let hint = document.getElementById("m4l-back-exit-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "m4l-back-exit-hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    hint.style.position = "fixed";
    hint.style.left = "50%";
    hint.style.bottom = "calc(var(--bottom-nav-height, 76px) + var(--bottom-nav-safe-area, 0px) + 14px)";
    hint.style.transform = "translateX(-50%)";
    hint.style.zIndex = "9999";
    hint.style.maxWidth = "min(92vw, 360px)";
    hint.style.padding = "10px 14px";
    hint.style.borderRadius = "999px";
    hint.style.background = "rgba(34, 43, 23, 0.92)";
    hint.style.color = "#fff";
    hint.style.font = "600 0.9rem system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    hint.style.textAlign = "center";
    hint.style.boxShadow = "0 8px 20px rgba(0, 0, 0, 0.20)";
    hint.style.pointerEvents = "none";
    hint.style.opacity = "0";
    hint.style.transition = "opacity 160ms ease";
    document.body.appendChild(hint);
  }

  hint.textContent = "Press Back again to exit";
  hint.style.opacity = "1";

  window.clearTimeout(showM4LAppBackExitHint.hideTimer || 0);
  showM4LAppBackExitHint.hideTimer = window.setTimeout(() => {
    const activeHint = document.getElementById("m4l-back-exit-hint");
    if (activeHint) activeHint.style.opacity = "0";
  }, 1500);

  return true;
}

function handleM4LAppHomeBackAttempt(targetScreenId) {
  const now = Date.now();

  if (now - m4lAppHistoryLastExitPromptAt <= M4L_APP_HISTORY_EXIT_WINDOW_MS) {
    m4lAppHistoryExitArmed = true;
    window.history.back();
    return true;
  }

  m4lAppHistoryLastExitPromptAt = now;
  showM4LAppBackExitHint();
  pushM4LAppHistoryState(targetScreenId || getM4LAppHomeScreenId(), { guard: true });
  return true;
}

function handleM4LAppHistoryPopState(event) {
  if (m4lAppHistoryExitArmed === true) {
    m4lAppHistoryExitArmed = false;
    return;
  }

  const targetState = event ? event.state : null;

  if (!isM4LAppHistoryState(targetState)) {
    return;
  }

  const targetScreenId = String(targetState.screenId || getM4LAppHomeScreenId(targetState.role));
  const activeScreenId = typeof getActiveScreenId === "function" ? getActiveScreenId() : "";

  if (targetState.kind === "home" && isM4LAppHomeScreen(activeScreenId)) {
    handleM4LAppHomeBackAttempt(targetScreenId);
    return;
  }

  if (!document.getElementById(targetScreenId)) {
    return;
  }

  m4lAppHistoryHandlingPopState = true;
  try {
    showScreen(targetScreenId);
  } finally {
    m4lAppHistoryHandlingPopState = false;
  }
}

function closeM4LAppHistoryLayer(returnToScreenId) {
  const currentState = getM4LAppHistoryCurrentState();
  const target = String(returnToScreenId || (isM4LAppHistoryState(currentState) ? currentState.returnTo : "") || getM4LAppHomeScreenId());

  if (isM4LAppHistoryState(currentState) && currentState.kind === "layer") {
    window.history.back();
    return true;
  }

  if (target && typeof showScreen === "function") {
    showScreen(target);
    return true;
  }

  return false;
}

function initM4LAppHistory() {
  bindM4LAppHistoryBackHandler();

  const activeScreenId = typeof getActiveScreenId === "function" ? getActiveScreenId() : "";
  if (activeScreenId) {
    recordM4LAppHistoryScreen(activeScreenId);
  }

  return true;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initM4LAppHistory, { once: true });
  } else {
    initM4LAppHistory();
  }
}


let homeNativeScrollResizeHandlerBound = false;

function isHomeNativeScrollScreen(screenId) {
  const { track, dots } = getHomeNativeScrollElements(screenId);
  return Boolean(track && dots.length);
}

function getHomeNativeScrollElements(screenId) {
  const screen = document.getElementById(screenId);

  if (!screen) {
    return { screen: null, track: null, dots: [] };
  }

  const track = screen.querySelector("[data-home-swipe-track]");
  const dots = Array.from(screen.querySelectorAll("[data-home-swipe-dots] [data-home-panel-index]"));

  return { screen, track, dots };
}

function getHomeNativeScrollPanels(track) {
  if (!track || !track.children) {
    return [];
  }

  const children = Array.from(track.children);
  const panels = children.filter(child => {
    return child &&
      child.matches &&
      child.matches("[data-home-swipe-panel], .home-swipe-panel");
  });

  return panels.length ? panels : children;
}

function getHomeNativeScrollPanelStep(track) {
  const panels = getHomeNativeScrollPanels(track);

  if (!track || panels.length <= 1) {
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

  return track.clientWidth || 1;
}

function getHomeNativeScrollActiveIndex(track) {
  if (!track) return 0;

  const panels = getHomeNativeScrollPanels(track);
  const panelCount = panels.length;

  if (panelCount <= 1) return 0;

  /*
    On large desktop the Home panels become a grid and the dots are hidden.
    In that mode there should be no meaningful horizontal scroll; returning
    zero keeps the state stable while CSS owns the layout.
  */
  if ((track.scrollWidth || 0) <= (track.clientWidth || 0) + 2) {
    return 0;
  }

  const step = getHomeNativeScrollPanelStep(track);
  const index = Math.round((track.scrollLeft || 0) / step);

  return Math.max(0, Math.min(panelCount - 1, index));
}

function updateHomeNativeScrollDots(screenId) {
  const { track, dots } = getHomeNativeScrollElements(screenId);

  if (!track || !dots.length) {
    return false;
  }

  const activeIndex = getHomeNativeScrollActiveIndex(track);

  dots.forEach((dot, fallbackIndex) => {
    const dotIndex = Number(dot.dataset.homePanelIndex || fallbackIndex || 0);
    const isActive = dotIndex === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });

  return true;
}

function scrollHomeNativeScrollToPanel(screenId, panelIndex) {
  const { track } = getHomeNativeScrollElements(screenId);
  const panels = getHomeNativeScrollPanels(track);
  const index = Number(panelIndex || 0);

  if (!track || !panels[index]) {
    return false;
  }

  panels[index].scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "start"
  });

  updateHomeNativeScrollDots(screenId);

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => updateHomeNativeScrollDots(screenId));
  } else {
    window.setTimeout(() => updateHomeNativeScrollDots(screenId), 0);
  }

  return true;
}

function bindHomeNativeScrollResizeHandler() {
  if (homeNativeScrollResizeHandlerBound === true) return true;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return false;

  homeNativeScrollResizeHandlerBound = true;

  window.addEventListener("resize", () => {
    bindHomeNativeScrollPanels();
    document.querySelectorAll(".screen").forEach(screen => {
      if (screen && screen.id && screen.querySelector("[data-home-swipe-track]")) {
        updateHomeNativeScrollDots(screen.id);
      }
    });
  }, { passive: true });

  return true;
}

function bindHomeNativeScrollControls(screenId) {
  const { track, dots } = getHomeNativeScrollElements(screenId);

  if (!track || !dots.length) {
    return false;
  }

  bindHomeNativeScrollResizeHandler();

  if (track.dataset.homeNativeScrollBound !== "true") {
    track.dataset.homeNativeScrollBound = "true";

    let pendingFrame = 0;

    track.addEventListener("scroll", () => {
      if (pendingFrame) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        updateHomeNativeScrollDots(screenId);
      });
    }, { passive: true });
  }

  dots.forEach(dot => {
    if (dot.dataset.homeNativeDotBound === "true") return;

    dot.dataset.homeNativeDotBound = "true";
    dot.addEventListener("click", event => {
      event.preventDefault();
      const index = Number(dot.dataset.homePanelIndex || 0);
      scrollHomeNativeScrollToPanel(screenId, index);
    });
  });

  window.setTimeout(() => updateHomeNativeScrollDots(screenId), 0);
  return true;
}

function bindHomeNativeScrollPanels() {
  let didBind = false;

  document.querySelectorAll("[data-home-swipe]").forEach(shell => {
    const screen = shell.closest ? shell.closest(".screen") : null;
    const screenId = screen && screen.id ? screen.id : (shell.dataset.homeSwipe || "");

    if (screenId) {
      didBind = bindHomeNativeScrollControls(screenId) || didBind;
    }
  });

  return didBind;
}

/* Compatibility names kept for existing classic-script calls. */
function shouldUseSharedHomeSwipeModule(screenId) {
  return isHomeNativeScrollScreen(screenId);
}

function getSectionSwipeElements(screenId) {
  return getHomeNativeScrollElements(screenId);
}

function getSectionSwipeActiveIndex(track) {
  return getHomeNativeScrollActiveIndex(track);
}

function updateSectionSwipeDots(screenId) {
  return updateHomeNativeScrollDots(screenId);
}

function scrollSectionSwipeToPanel(screenId, panelIndex) {
  return scrollHomeNativeScrollToPanel(screenId, panelIndex);
}

function bindSectionSwipeResizeHandler() {
  return bindHomeNativeScrollResizeHandler();
}

function bindSectionSwipeControls(screenId) {
  return bindHomeNativeScrollControls(screenId);
}

function getHomeSwipeElements(screenId) {
  return getHomeNativeScrollElements(screenId);
}

function getHomeSwipeActiveIndex(track) {
  return getHomeNativeScrollActiveIndex(track);
}

function updateHomeSwipeDots(screenId) {
  return updateHomeNativeScrollDots(screenId);
}

function scrollHomeSwipeToPanel(screenId, panelIndex) {
  return scrollHomeNativeScrollToPanel(screenId, panelIndex);
}

function bindHomeSwipeResizeHandler() {
  return bindHomeNativeScrollResizeHandler();
}

function bindHomeSwipeControls(screenId) {
  return bindHomeNativeScrollControls(screenId);
}

function bindHomeSwipePanels() {
  return bindHomeNativeScrollPanels();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHomeNativeScrollPanels, { once: true });
  } else {
    bindHomeNativeScrollPanels();
  }
}

let headerIconActionHandlersBound = false;

function getHeaderIconActionDescriptor(actionValue = "goHome()") {
  const value = String(actionValue || "").trim();

  if (!value || value === "goHome()") {
    return { action: "home", target: "" };
  }

  const showScreenMatch = value.match(/^showScreen\(['"]([^'"]+)['"]\)$/);
  if (showScreenMatch) {
    return { action: "screen", target: showScreenMatch[1] };
  }

  const functionMatch = value.match(/^([A-Za-z_$][\w$]*)\(\)$/);
  if (functionMatch) {
    const functionName = functionMatch[1];
    if (functionName === "goBackFromStudentResourceDetail") {
      return { action: "function", target: functionName };
    }
  }

  console.warn("Unsupported header icon action:", value);
  return { action: "home", target: "" };
}

function applyHeaderIconAction(button, actionValue) {
  if (!button) return false;

  const descriptor = getHeaderIconActionDescriptor(actionValue);
  button.removeAttribute("onclick");
  button.dataset.headerAction = descriptor.action;

  if (descriptor.target) {
    button.dataset.headerTarget = descriptor.target;
  } else {
    delete button.dataset.headerTarget;
  }

  return true;
}

function bindHeaderIconActionHandlers() {
  if (headerIconActionHandlersBound === true) return true;
  if (!document || typeof document.addEventListener !== "function") return false;

  headerIconActionHandlersBound = true;
  document.addEventListener("click", handleHeaderIconActionClick);
  return true;
}

function handleHeaderIconActionClick(event) {
  const button = event.target && event.target.closest
    ? event.target.closest("[data-header-action]")
    : null;

  if (!button || button.disabled) return;

  event.preventDefault();

  const action = button.dataset.headerAction || "home";
  const target = button.dataset.headerTarget || "";

  if (action === "home") {
    goHome();
    return;
  }

  if (action === "screen") {
    showScreen(target || "student-home");
    return;
  }

  if (action === "function" && target && typeof window[target] === "function") {
    window[target]();
  }
}

function setHomeIconButton(button, actionValue = "goHome()") {
  if (!button) return;
  bindHeaderIconActionHandlers();

  button.classList.remove("back-icon-btn", "save-return-btn");
  button.classList.add("home-icon-btn", "icon-action-btn", "icon-action-btn-large");
  applyHeaderIconAction(button, actionValue);
  button.setAttribute("aria-label", "Home");
  button.setAttribute("title", "Home");
  button.innerHTML = `
    <span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/home.svg')" aria-hidden="true"></span>
    <span class="header-icon-label">Home</span>
  `;
}

function setBackIconButton(button, actionValue = "goHome()") {
  if (!button) return;
  bindHeaderIconActionHandlers();

  button.classList.remove("home-icon-btn", "save-return-btn");
  button.classList.add("back-icon-btn", "icon-action-btn", "icon-action-btn-large");
  applyHeaderIconAction(button, actionValue);
  button.setAttribute("aria-label", "Back");
  button.setAttribute("title", "Back");
  button.innerHTML = `
    <span class="app-icon app-icon-large" style="--app-icon-url: url('/icons/back.svg')" aria-hidden="true"></span>
    <span class="header-icon-label">Back</span>
  `;
}

function getHeaderIconButtonMarkup(type, actionValue, label) {
  const safeType = type === "back" ? "back" : "home";
  const iconPath = safeType === "back" ? "/icons/back.svg" : "/icons/home.svg";
  const className = safeType === "back" ? "back-icon-btn" : "home-icon-btn";
  const safeLabel = escapeHtml(label || (safeType === "back" ? "Back" : "Home"));
  const descriptor = getHeaderIconActionDescriptor(actionValue);
  const targetAttr = descriptor.target
    ? ` data-header-target="${escapeForAttribute(descriptor.target)}"`
    : "";

  return `
    <button
      type="button"
      class="small-btn ${className} icon-action-btn icon-action-btn-large"
      data-header-action="${escapeForAttribute(descriptor.action)}"${targetAttr}
      aria-label="${safeLabel}"
      title="${safeLabel}"
    >
      <span class="app-icon app-icon-large" style="--app-icon-url: url('${iconPath}')" aria-hidden="true"></span>
      <span class="header-icon-label">${safeLabel}</span>
    </button>
  `;
}

function getHomeIconButtonMarkup(actionValue = "goHome()") {
  return getHeaderIconButtonMarkup("home", actionValue, "Home");
}

function getBackIconButtonMarkup(actionValue = "goHome()") {
  return getHeaderIconButtonMarkup("back", actionValue, "Back");
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

function getStudentResourceViewModeSafe() {
  return typeof studentResourceViewMode !== "undefined"
    ? String(studentResourceViewMode || "")
    : "";
}

function isOptionalFunctionLoaded(functionName) {
  return typeof window[String(functionName || "")] === "function";
}

async function refreshCurrentResourceView(button) {
  await runManualRefresh(button, async () => {
    const role = getBottomNavRole();
    const resourceMode = getStudentResourceViewModeSafe();
    const shouldUseAdminResources = resourceMode === "admin" || role === "admin";

    if (shouldUseAdminResources && isOptionalFunctionLoaded("showAdminResources")) {
      await window.showAdminResources();
      return;
    }

    if (isOptionalFunctionLoaded("showStudentResources")) {
      await window.showStudentResources();
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

  if (activeScreenId === "attendance-screen") {
    if (typeof refreshCurrentAttendancePanel === "function") {
      return { label: "Refresh", title: "Refresh attendance", handler: refreshCurrentAttendancePanel };
    }

    return typeof openMarkRegister === "function"
      ? { label: "Refresh", title: "Refresh attendance", handler: openMarkRegister }
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
    const safeProgressState = typeof progressState !== "undefined" ? progressState : null;

    if (safeProgressState && safeProgressState.contextType === "student" && typeof refreshIndividualStudentTaskList === "function") {
      return { label: "Refresh", title: "Refresh student tasks", handler: refreshIndividualStudentTaskList };
    }

    if (typeof refreshProgressTaskStudents === "function") {
      return { label: "Refresh", title: "Refresh student progress", handler: refreshProgressTaskStudents };
    }
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

function setTextActionButton(button, text, actionValue) {
  if (!button) return;

  button.classList.remove("home-icon-btn", "back-icon-btn", "icon-action-btn", "icon-action-btn-large");
  button.removeAttribute("aria-label");
  button.removeAttribute("title");
  button.removeAttribute("onclick");
  button.textContent = text;

  if (actionValue) {
    applyHeaderIconAction(button, actionValue);
  } else {
    delete button.dataset.headerAction;
    delete button.dataset.headerTarget;
  }
}

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
    },
    {
      key: "record",
      label: "Record",
      icon: "/icons/navrecord.svg",
      targetScreen: "record-lesson-screen"
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
      targetScreen: "attendance-screen",
      actionName: "openMarkRegister"
    },
    {
      key: "admin",
      label: "Admin",
      icon: "/icons/admin.svg",
      targetScreen: "admin-academics",
      actionName: "showAdminAcademics"
    },
    {
      key: "record",
      label: "Record",
      icon: "/icons/navrecord.svg",
      targetScreen: "record-lesson-screen"
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



function getCoverHomeNavigationRole(button) {
  return String(
    (button && button.dataset ? button.dataset.coverHomeRole : "") ||
    (typeof getBottomNavRole === "function" ? getBottomNavRole() : "") ||
    ""
  ).trim();
}

function getCoverHomeNavigationItem(button) {
  if (!button) return null;

  const role = getCoverHomeNavigationRole(button);
  const key = String(button.dataset.coverHomeNav || "").trim();

  if (!role || !key) return null;

  return getBottomNavItems(role).find(navItem => navItem.key === key) || null;
}

function hydrateCoverHomeNavigationButtons(scope) {
  if (!document) return false;

  const root = scope && typeof scope.querySelectorAll === "function" ? scope : document;
  const buttons = Array.from(root.querySelectorAll("[data-cover-home-nav]"));

  buttons.forEach(button => {
    const item = getCoverHomeNavigationItem(button);
    if (!item) return;

    button.style.setProperty("--cover-home-icon", `url('${item.icon}')`);

    if (!button.getAttribute("aria-label")) {
      button.setAttribute("aria-label", `Open ${item.label}`);
    }

    const label = button.querySelector(".home-cover-icon-label");
    if (label && !label.textContent.trim()) {
      label.textContent = item.label;
    }
  });

  return true;
}

let coverHomeNavigationBound = false;

function isCoverHomeScreen(screenId) {
  return isM4LAppHomeScreen(screenId);
}

function bindCoverHomeNavigation() {
  if (coverHomeNavigationBound === true) return true;
  if (!document || typeof document.addEventListener !== "function") return false;

  coverHomeNavigationBound = true;
  hydrateCoverHomeNavigationButtons(document);
  document.addEventListener("click", handleCoverHomeNavigationClick);
  return true;
}

function handleCoverHomeNavigationClick(event) {
  const button = event.target && event.target.closest
    ? event.target.closest("[data-cover-home-nav]")
    : null;

  if (!button || button.disabled) return;

  const key = String(button.dataset.coverHomeNav || "").trim();
  if (!key) return;

  event.preventDefault();

  const role = String(button.dataset.coverHomeRole || getBottomNavRole() || "").trim();

  if (!role) {
    console.warn("Cover Home navigation could not determine role.");
    return;
  }

  handleBottomNavigationClick(role, key);
}


let bottomNavigationViewportHandlerBound = false;

function isDesktopBottomNavigationLayout() {
  if (!window || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(min-width: 768px)").matches;
}

function setBottomNavigationDesktopPlacement(nav) {
  if (!nav || !document.body) return false;

  /*
    Large-screen nav layout is controlled by styles.css.
    Keep the nav as a fixed-position body child so it is not treated as a
    flex item beside .app-shell. V45 inserted it immediately after the fixed
    user band and applied sticky inline positioning; because body is a flex
    container, that made the nav occupy the left side of the desktop layout.
  */
  if (nav.parentNode !== document.body || nav.nextSibling) {
    document.body.appendChild(nav);
  }

  clearBottomNavigationDesktopPlacement(nav);
  return true;
}

function clearBottomNavigationDesktopPlacement(nav) {
  if (!nav) return false;

  [
    "position",
    "top",
    "bottom",
    "left",
    "right",
    "width",
    "max-width",
    "height",
    "min-height",
    "display",
    "flex-direction",
    "align-items",
    "justify-content",
    "gap",
    "overflow-x",
    "overflow-y",
    "box-sizing",
    "margin",
    "padding",
    "transform",
    "border-radius",
    "z-index"
  ].forEach(propertyName => {
    nav.style.removeProperty(propertyName);
  });

  nav.querySelectorAll(".bottom-nav__item").forEach(item => {
    ["flex", "width", "min-width"].forEach(propertyName => {
      item.style.removeProperty(propertyName);
    });
  });

  return true;
}

function placeBottomNavigationForViewport(nav) {
  if (!nav || !document.body) return false;

  const isDesktop = isDesktopBottomNavigationLayout();
  nav.classList.toggle("bottom-nav--desktop-top", isDesktop);
  nav.classList.toggle("bottom-nav--mobile-bottom", !isDesktop);
  document.body.classList.toggle("has-desktop-top-nav", isDesktop);
  document.body.classList.toggle("has-mobile-bottom-nav", !isDesktop);

  if (isDesktop) {
    return setBottomNavigationDesktopPlacement(nav);
  }

  if (nav.parentNode !== document.body || nav.nextSibling) {
    document.body.appendChild(nav);
  }

  clearBottomNavigationDesktopPlacement(nav);
  return true;
}

function bindBottomNavigationViewportHandler(nav) {
  if (bottomNavigationViewportHandlerBound === true) return true;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return false;

  bottomNavigationViewportHandlerBound = true;

  const handleViewportChange = () => {
    const currentNav = document.getElementById("bottom-nav");
    if (currentNav) {
      placeBottomNavigationForViewport(currentNav);
    }
  };

  window.addEventListener("resize", handleViewportChange, { passive: true });

  if (typeof window.matchMedia === "function") {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleViewportChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleViewportChange);
    }
  }

  placeBottomNavigationForViewport(nav);
  return true;
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
  bindBottomNavigationViewportHandler(nav);
  placeBottomNavigationForViewport(nav);
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

  /*
    Keep nav rendering independent from optional module load timing.
    Some nav items use actionName helpers that are defined by later classic scripts.
    The screen target is the stable availability check; the click handler will call
    the action when it exists and otherwise fall back to showScreen(targetScreen).
  */
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
    "student-home",
    "admin-home",
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

    if (screenId === "record-lesson-screen") return "record";

    return "home";
  }

  if (role === "admin") {
    if (screenId === "admin-home") return "home";

    if (String(screenId || "").startsWith("attendance")) return "attendance";

    if (screenId === "record-lesson-screen") return "record";

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
    if (item.actionName && typeof window[item.actionName] === "function") {
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

  placeBottomNavigationForViewport(nav);

  const itemCount = nav.querySelectorAll(".bottom-nav__item").length;
  const isVisible = itemCount > 0 && shouldShowBottomNavigation(screenId, role);
  const isCoverHome = isCoverHomeScreen(screenId) && !!state.token;

  nav.classList.toggle("hidden", !isVisible);

  if (document.body) {
    document.body.classList.toggle("has-bottom-nav", isVisible);
    document.body.classList.toggle("is-cover-home", isCoverHome);
  }

  const appShell = document.querySelector(".app-shell");
  if (appShell) {
    appShell.classList.toggle("has-bottom-nav", isVisible);
    appShell.classList.toggle("is-cover-home", isCoverHome);
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

window.M4LShell = {
  showScreen: typeof showScreen === "function" ? showScreen : undefined,
  bindHeaderIconActionHandlers: typeof bindHeaderIconActionHandlers === "function" ? bindHeaderIconActionHandlers : undefined,
  setHomeIconButton: typeof setHomeIconButton === "function" ? setHomeIconButton : undefined,
  setBackIconButton: typeof setBackIconButton === "function" ? setBackIconButton : undefined,
  getHeaderIconButtonMarkup: typeof getHeaderIconButtonMarkup === "function" ? getHeaderIconButtonMarkup : undefined,
  getHomeIconButtonMarkup: typeof getHomeIconButtonMarkup === "function" ? getHomeIconButtonMarkup : undefined,
  getBackIconButtonMarkup: typeof getBackIconButtonMarkup === "function" ? getBackIconButtonMarkup : undefined,
  getCurrentUserName: typeof getCurrentUserName === "function" ? getCurrentUserName : undefined,
  getCurrentUserLevelText: typeof getCurrentUserLevelText === "function" ? getCurrentUserLevelText : undefined,
  getActiveScreenId: typeof getActiveScreenId === "function" ? getActiveScreenId : undefined,
  updateUserBand: typeof updateUserBand === "function" ? updateUserBand : undefined,
  setTextActionButton: typeof setTextActionButton === "function" ? setTextActionButton : undefined,
  getBottomNavRole: typeof getBottomNavRole === "function" ? getBottomNavRole : undefined,
  updateBottomNavigation: typeof updateBottomNavigation === "function" ? updateBottomNavigation : undefined,
  bindCoverHomeNavigation: typeof bindCoverHomeNavigation === "function" ? bindCoverHomeNavigation : undefined,
  bindHomeSwipeControls: typeof bindHomeSwipeControls === "function" ? bindHomeSwipeControls : undefined,
  bindHomeNativeScrollControls: typeof bindHomeNativeScrollControls === "function" ? bindHomeNativeScrollControls : undefined,
  bindHomeNativeScrollPanels: typeof bindHomeNativeScrollPanels === "function" ? bindHomeNativeScrollPanels : undefined,
  updateHomeNativeScrollDots: typeof updateHomeNativeScrollDots === "function" ? updateHomeNativeScrollDots : undefined,
  scrollHomeNativeScrollToPanel: typeof scrollHomeNativeScrollToPanel === "function" ? scrollHomeNativeScrollToPanel : undefined,
  bindHomeSwipePanels: typeof bindHomeSwipePanels === "function" ? bindHomeSwipePanels : undefined,
  placeBottomNavigationForViewport: typeof placeBottomNavigationForViewport === "function" ? placeBottomNavigationForViewport : undefined,
  runUserBandRefresh: typeof runUserBandRefresh === "function" ? runUserBandRefresh : undefined,
  refreshCurrentResourceView: typeof refreshCurrentResourceView === "function" ? refreshCurrentResourceView : undefined,
  getStudentResourceViewModeSafe: typeof getStudentResourceViewModeSafe === "function" ? getStudentResourceViewModeSafe : undefined,
  isOptionalFunctionLoaded: typeof isOptionalFunctionLoaded === "function" ? isOptionalFunctionLoaded : undefined,
  getUserBandRefreshAction: typeof getUserBandRefreshAction === "function" ? getUserBandRefreshAction : undefined,
  recordAppHistoryScreen: typeof recordM4LAppHistoryScreen === "function" ? recordM4LAppHistoryScreen : undefined,
  closeAppHistoryLayer: typeof closeM4LAppHistoryLayer === "function" ? closeM4LAppHistoryLayer : undefined,
  initAppHistory: typeof initM4LAppHistory === "function" ? initM4LAppHistory : undefined
};

window.M4LAppHistory = {
  recordScreen: typeof recordM4LAppHistoryScreen === "function" ? recordM4LAppHistoryScreen : undefined,
  closeLayer: typeof closeM4LAppHistoryLayer === "function" ? closeM4LAppHistoryLayer : undefined,
  init: typeof initM4LAppHistory === "function" ? initM4LAppHistory : undefined
};
