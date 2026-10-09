(function () {
  "use strict";

  const apiBase = String(window.M4L_CONFIG?.API_BASE || "").replace(/\/$/, "");
  const tokenKey = "m4l_account_token";
  const academySessionKey = "m4l_academy_signed_in";
  const form = document.getElementById("login-preview");
  const linkInput = document.getElementById("demo-username");
  const pinInput = document.getElementById("demo-pin");
  const pinToggle = document.getElementById("demo-pin-toggle");
  const status = document.getElementById("login-status");
  const sessionLoading = document.getElementById("academy-session-loading");
  const sessionMessage = document.getElementById("academy-session-message");
  const sessionRetry = document.getElementById("academy-session-retry");
  const homeCard = document.getElementById("academy-home-card");
  const accountName = document.getElementById("academy-account-name");
  const signOutButton = document.getElementById("academy-sign-out");
  const libraryNav = document.getElementById("academy-library-nav");
  const avatar = document.getElementById("academy-avatar");
  let activeToken = "";
  let sessionGeneration = 0;

  if (!form || !linkInput || !pinInput || !apiBase) return;

  form.addEventListener("submit", signIn);
  pinInput.addEventListener("input", () => {
    pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
  });
  pinToggle.addEventListener("click", () => {
    const showing = pinInput.type === "password";
    pinInput.type = showing ? "text" : "password";
    pinToggle.textContent = showing ? "Hide" : "Show";
    pinToggle.setAttribute("aria-label", `${showing ? "Hide" : "Show"} PIN`);
  });
  signOutButton.addEventListener("click", () => {
    clearStoredAccountState();
    showSignedOut();
  });
  sessionRetry.addEventListener("click", () => { void restoreAcademySession(); });
  window.addEventListener("storage", event => {
    if (event.key === tokenKey) {
      sessionStorage.removeItem(academySessionKey);
      showSignedOut();
      if (localStorage.getItem(tokenKey)) void restoreAcademySession();
    }
  });
  window.addEventListener("m4l-academy-session-ended", () => {
    clearStoredAccountState();
    showSignedOut();
  });
  window.addEventListener("pageshow", () => {
    if (activeToken && localStorage.getItem(tokenKey) !== activeToken) showSignedOut();
    if (localStorage.getItem(tokenKey)) void restoreAcademySession();
  });
  void restoreAcademySession();

  function showSignedOut() {
    sessionGeneration++;
    activeToken = "";
    homeCard.hidden = true;
    signOutButton.hidden = true;
    sessionLoading.hidden = true;
    sessionRetry.hidden = true;
    form.hidden = false;
    linkInput.value = "";
    pinInput.value = "";
    pinInput.type = "password";
    pinToggle.textContent = "Show";
    pinToggle.setAttribute("aria-label", "Show PIN");
    accountName.textContent = "";
    avatar.textContent = "A";
    avatar.setAttribute("aria-label", "Academy account");
    document.body.classList.remove("academy-signed-in");
    libraryNav.href = "/academy/open-library/";
    showStatus("");
    setBusy(false);
    window.location.hash = "overview";
    linkInput.focus();
    window.dispatchEvent(new Event("m4l-academy-session"));
  }

  async function restoreAcademySession() {
    const expectedId = sessionStorage.getItem(academySessionKey);
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      if (!token) sessionStorage.removeItem(academySessionKey);
      return;
    }
    const generation = ++sessionGeneration;
    form.hidden = true;
    sessionLoading.hidden = false;
    sessionMessage.textContent = "Opening your Academy home…";
    sessionRetry.hidden = true;
    setBusy(true);
    try {
      const result = await api("/api/account/session", {}, token);
      if (generation !== sessionGeneration || localStorage.getItem(tokenKey) !== token) return;
      const account = result.account;
      if (!account?.uniqueid || (expectedId && String(account.uniqueid).trim().toUpperCase() !== expectedId.toUpperCase())) {
        throw Object.assign(new Error("The signed-in account has changed."), { status: 401 });
      }
      sessionStorage.setItem(academySessionKey, account.uniqueid);
      showSignedIn(account);
    } catch (error) {
      if (generation !== sessionGeneration || localStorage.getItem(tokenKey) !== token) return;
      if (isTemporaryServiceError(error) &&
        localStorage.getItem(tokenKey) === token &&
        sessionStorage.getItem(academySessionKey) === expectedId) {
        sessionMessage.textContent = "The account service is temporarily unavailable. Your sign-in is saved.";
        sessionRetry.hidden = false;
      } else {
        clearStoredAccountState();
        showSignedOut();
      }
    } finally {
      setBusy(false);
    }
  }

  function showSignedIn(account) {
    activeToken = localStorage.getItem(tokenKey) || "";
    const uniqueId = String(account.uniqueid || "").trim();
    const name = String(account.displayName || "Academy member").trim();
    accountName.textContent = name;
    avatar.textContent = name.charAt(0).toUpperCase();
    avatar.setAttribute("aria-label", `Signed in as ${name}`);
    form.hidden = true;
    sessionLoading.hidden = true;
    homeCard.hidden = false;
    signOutButton.hidden = false;
    document.body.classList.add("academy-signed-in");
    libraryNav.href = "/academy/library/";
    window.dispatchEvent(new Event("m4l-academy-session"));
  }

  async function signIn(event) {
    event.preventDefault();
    const uniqueId = String(linkInput.value || "").trim();
    if (!/^[A-Za-z0-9._~-]{1,128}$/.test(uniqueId)) {
      showStatus("Enter your account ID.");
      linkInput.focus();
      return;
    }

    const generation = ++sessionGeneration;
    setBusy(true);
    try {
      const pin = pinInput.value;
      if (pin && !/^\d{4}$/.test(pin)) {
        showStatus("Enter your complete 4-digit PIN.");
        pinInput.focus();
        return;
      }
      if (!pin) {
        showStatus("Checking your account…");
        const check = await api("/api/account/check", { uniqueid: uniqueId });
        const accountId = check.account?.uniqueid || uniqueId;
        if (check.account?.pinsetup !== true) {
          clearStoredAccountState();
          window.location.assign(`/account/${encodeURIComponent(accountId)}?academy=1`);
          return;
        }
        showStatus("Enter your complete 4-digit PIN.");
        pinInput.focus();
        return;
      }
      showStatus("Signing you in…");
      let result;
      try {
        result = await api("/api/account/login", { uniqueid: uniqueId, pin });
      } catch (error) {
        if (error.status === 403 && error.message === "Account PIN not set up yet") {
          clearStoredAccountState();
          window.location.assign(`/account/${encodeURIComponent(uniqueId)}?academy=1`);
          return;
        }
        throw error;
      }
      if (generation !== sessionGeneration) return;
      if (!result.token) throw new Error("Sign-in did not return an account session.");
      clearStoredAccountState();
      localStorage.setItem(tokenKey, result.token);
      sessionStorage.setItem(academySessionKey, result.account?.uniqueid || uniqueId);
      pinInput.value = "";
      showStatus("");
      showSignedIn(result.account || { uniqueid: uniqueId });
      window.location.hash = "overview";
    } catch (error) {
      pinInput.value = "";
      showStatus(error.message || "Sign-in could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function clearStoredAccountState() {
    sessionStorage.removeItem(academySessionKey);
    for (const key of [tokenKey, "m4l_account_context", "m4l_account_contexts", "m4l_account_workspace", "maktab_token", "maktab_user_type"]) {
      localStorage.removeItem(key);
    }
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && ["m4l_app_cache_", "maktab_timetable_cache_", "m4l_academy_timetable_"].some(prefix => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith("m4l_admin_progress_dashboard_")) sessionStorage.removeItem(key);
    }
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function setBusy(busy) {
    form.querySelector('button[type="submit"]').disabled = busy;
    linkInput.disabled = busy;
    pinInput.disabled = busy;
  }

  async function api(path, payload, token = "") {
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });
    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error("The account service returned an unreadable response.");
    }
    if (!response.ok || !result.success) {
      const error = new Error(result.error || "The account request could not be completed.");
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function isTemporaryServiceError(error) {
    return !error?.status || error.status >= 500;
  }
})();
