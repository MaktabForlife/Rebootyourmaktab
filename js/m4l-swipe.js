/* M4L v63 - Shared Home swipe controls
   Load after /js/m4l-shell.js and before modules that may create/bind Home panels.
   This is a classic script, not type=module.

   Owns Home swipe behaviour only:
   - Student Home
   - Admin Home
   - Home swipe dots
   - Home panel scroll/dot sync

   Attendance keeps its own swipe logic for now and can be migrated safely later.
*/

(function () {
  "use strict";

  let homeSwipeResizeHandlerBound = false;

  function getHomeSwipeElements(screenId) {
    const screen = document.getElementById(screenId);

    if (!screen) {
      return { screen: null, track: null, dots: [] };
    }

    const track = screen.querySelector("[data-home-swipe-track]");
    const dots = Array.from(screen.querySelectorAll("[data-home-swipe-dots] [data-home-panel-index]"));

    return { screen, track, dots };
  }

  function isHomeSwipeScreen(screenId) {
    const { track, dots } = getHomeSwipeElements(screenId);
    return Boolean(track && dots.length);
  }

  function getPanelStep(track) {
    if (!track || !track.children || !track.children.length) {
      return 1;
    }

    const firstPanel = track.children[0];
    const secondPanel = track.children.length > 1 ? track.children[1] : null;

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

  function getHomeSwipeActiveIndex(track) {
    if (!track) return 0;

    const panelCount = track.children ? track.children.length : 0;
    if (panelCount <= 1) return 0;

    /*
      On large screens the Home panels become a grid and the dots are hidden.
      In that mode scrollLeft should stay 0; returning 0 keeps state stable.
    */
    const step = getPanelStep(track);
    const index = Math.round((track.scrollLeft || 0) / step);

    return Math.max(0, Math.min(panelCount - 1, index));
  }

  function updateHomeSwipeDots(screenId) {
    const { track, dots } = getHomeSwipeElements(screenId);

    if (!track || !dots.length) {
      return false;
    }

    const activeIndex = getHomeSwipeActiveIndex(track);

    dots.forEach((dot, index) => {
      const isActive = index === activeIndex;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-current", isActive ? "true" : "false");
    });

    return true;
  }

  function scrollHomeSwipeToPanel(screenId, panelIndex) {
    const { track } = getHomeSwipeElements(screenId);
    const index = Number(panelIndex || 0);

    if (!track || !track.children || !track.children[index]) {
      return false;
    }

    track.children[index].scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "start"
    });

    window.setTimeout(() => updateHomeSwipeDots(screenId), 0);
    return true;
  }

  function bindHomeSwipeResizeHandler() {
    if (homeSwipeResizeHandlerBound === true) return true;
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return false;

    homeSwipeResizeHandlerBound = true;

    window.addEventListener("resize", () => {
      bindHomeSwipePanels();
      document.querySelectorAll(".screen").forEach(screen => {
        if (screen && screen.id && screen.querySelector("[data-home-swipe-track]")) {
          updateHomeSwipeDots(screen.id);
        }
      });
    }, { passive: true });

    return true;
  }

  function bindHomeSwipeControls(screenId) {
    const { track, dots } = getHomeSwipeElements(screenId);

    if (!track || !dots.length) {
      return false;
    }

    bindHomeSwipeResizeHandler();

    if (track.dataset.homeSwipeBound !== "true") {
      track.dataset.homeSwipeBound = "true";

      let pendingFrame = 0;

      track.addEventListener("scroll", () => {
        if (pendingFrame) return;

        pendingFrame = window.requestAnimationFrame(() => {
          pendingFrame = 0;
          updateHomeSwipeDots(screenId);
        });
      }, { passive: true });
    }

    dots.forEach(dot => {
      if (dot.dataset.homeSwipeDotBound === "true") return;

      dot.dataset.homeSwipeDotBound = "true";
      dot.addEventListener("click", event => {
        event.preventDefault();
        const index = Number(dot.dataset.homePanelIndex || 0);
        scrollHomeSwipeToPanel(screenId, index);
      });
    });

    window.setTimeout(() => updateHomeSwipeDots(screenId), 0);
    return true;
  }

  function bindHomeSwipePanels() {
    let didBind = false;

    document.querySelectorAll("[data-home-swipe]").forEach(shell => {
      const screen = shell.closest ? shell.closest(".screen") : null;
      const screenId = screen && screen.id ? screen.id : (shell.dataset.homeSwipe || "");

      if (screenId) {
        didBind = bindHomeSwipeControls(screenId) || didBind;
      }
    });

    return didBind;
  }

  window.M4LSwipe = {
    getHomeSwipeElements,
    isHomeSwipeScreen,
    getHomeSwipeActiveIndex,
    updateHomeSwipeDots,
    scrollHomeSwipeToPanel,
    bindHomeSwipeResizeHandler,
    bindHomeSwipeControls,
    bindHomeSwipePanels
  };

  /*
    Compatibility globals for existing classic-script calls.
    These intentionally cover Home only.
  */
  window.getHomeSwipeElements = getHomeSwipeElements;
  window.getHomeSwipeActiveIndex = getHomeSwipeActiveIndex;
  window.updateHomeSwipeDots = updateHomeSwipeDots;
  window.scrollHomeSwipeToPanel = scrollHomeSwipeToPanel;
  window.bindHomeSwipeResizeHandler = bindHomeSwipeResizeHandler;
  window.bindHomeSwipeControls = bindHomeSwipeControls;
  window.bindHomeSwipePanels = bindHomeSwipePanels;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHomeSwipePanels, { once: true });
  } else {
    bindHomeSwipePanels();
  }
})();
