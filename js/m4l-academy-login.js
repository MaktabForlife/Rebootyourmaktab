(function () {
  "use strict";

  const apiBase = String(window.M4L_CONFIG?.API_BASE || "").replace(/\/$/, "");
  const tokenKey = "m4l_account_token";
  const form = document.getElementById("login-preview");
  const linkInput = document.getElementById("demo-username");
  const pinInput = document.getElementById("demo-pin");
  const pinToggle = document.getElementById("demo-pin-toggle");
  const status = document.getElementById("login-status");

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
      pinInput.value = "";
      window.location.assign(academyPath(result.account?.uniqueid || accountId));
    } catch (error) {
      pinInput.value = "";
      showStatus(error.message || "Sign-in could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function academyPath(uniqueId) {
    return `/academy/${encodeURIComponent(uniqueId)}`;
  }

  function clearStoredAccountState() {
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
