(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function exists(id) {
    return Boolean(byId(id));
  }

  function setText(id, value) {
    const el = byId(id);
    if (!el) return false;
    el.innerText = value == null ? "" : String(value);
    return true;
  }

  function setHtml(id, value) {
    const el = byId(id);
    if (!el) return false;
    el.innerHTML = value == null ? "" : String(value);
    return true;
  }

  function clearHtml(id) {
    return setHtml(id, "");
  }

  function show(id) {
    const el = byId(id);
    if (!el) return false;
    el.classList.remove("hidden");
    return true;
  }

  function hide(id) {
    const el = byId(id);
    if (!el) return false;
    el.classList.add("hidden");
    return true;
  }

  function enable(id) {
    const el = byId(id);
    if (!el) return false;
    el.disabled = false;
    return true;
  }

  function disable(id) {
    const el = byId(id);
    if (!el) return false;
    el.disabled = true;
    return true;
  }

  function safeShowScreen(screenId) {
    const target = byId(screenId);
    if (!target) {
      console.warn("Missing screen:", screenId);
      return false;
    }

    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.remove("active");
    });

    target.classList.add("active");
    return true;
  }

  window.M4LDom = {
    byId,
    exists,
    setText,
    setHtml,
    clearHtml,
    show,
    hide,
    enable,
    disable,
    safeShowScreen
  };
})();