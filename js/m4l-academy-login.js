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
  const homeCard = document.getElementById("academy-home-card");
  const accountName = document.getElementById("academy-account-name");
  const maktabLink = document.getElementById("academy-maktab-link");
  const signOutButton = document.getElementById("academy-sign-out");
  const avatar = document.getElementById("academy-avatar");

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
    window.location.assign("/academy/#overview");
  });
  void restoreAcademySession();

  async function restoreAcademySession() {
    const expectedId = sessionStorage.getItem(academySessionKey);
    const token = localStorage.getItem(tokenKey);
    if (!expectedId || !token) {
      if (!token) sessionStorage.removeItem(academySessionKey);
      return;
    }
    form.hidden = true;
    sessionLoading.hidden = false;
    setBusy(true);
    try {
      const result = await api("/api/account/session", {}, token);
      const account = result.account;
      if (String(account?.uniqueid || "").trim().toUpperCase() !== expectedId.toUpperCase()) {
        throw new Error("The signed-in account has changed.");
      }
      showSignedIn(account);
    } catch (_) {
      sessionStorage.removeItem(academySessionKey);
      form.hidden = false;
      sessionLoading.hidden = true;
    } finally {
      setBusy(false);
    }
  }

  function showSignedIn(account) {
    const uniqueId = String(account.uniqueid || "").trim();
    const name = String(account.displayName || "Academy member").trim();
    accountName.textContent = name;
    maktabLink.href = `/account/${encodeURIComponent(uniqueId)}`;
    avatar.textContent = name.charAt(0).toUpperCase();
    avatar.setAttribute("aria-label", `Signed in as ${name}`);
    form.hidden = true;
    sessionLoading.hidden = true;
    homeCard.hidden = false;
    signOutButton.hidden = false;
    document.body.classList.add("academy-signed-in");
  }

  async function signIn(event) {
    event.preventDefault();
    const uniqueId = String(linkInput.value || "").trim();
    if (!/^[A-Za-z0-9._~-]{1,128}$/.test(uniqueId)) {
      showStatus("Enter your account ID.");
      linkInput.focus();
      return;
    }

    setBusy(true);
    showStatus("Checking your account…");
    try {
      const check = await api("/api/account/check", { uniqueid: uniqueId });
      const accountId = check.account?.uniqueid || uniqueId;
      if (check.account?.pinsetup !== true) {
        pinInput.value = "";
        clearStoredAccountState();
        window.location.assign(`/account/${encodeURIComponent(accountId)}?academy=1`);
        return;
      }

      const pin = pinInput.value;
      if (!/^\d{4}$/.test(pin)) {
        showStatus("Enter your complete 4-digit PIN.");
        pinInput.focus();
        return;
      }

      showStatus("Signing you in…");
      const result = await api("/api/account/login", { uniqueid: accountId, pin });
      if (!result.token) throw new Error("Sign-in did not return an account session.");
      clearStoredAccountState();
      localStorage.setItem(tokenKey, result.token);
      sessionStorage.setItem(academySessionKey, result.account?.uniqueid || accountId);
      pinInput.value = "";
      window.location.assign("/academy/#overview");
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
      throw new Error(result.error || "The account request could not be completed.");
    }
    return result;
  }
})();
