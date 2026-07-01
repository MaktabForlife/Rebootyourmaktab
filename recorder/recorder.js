(() => {
  "use strict";

  const MAX_RECORDING_MS = 2 * 60 * 1000;
  const CANVAS_FPS = 1;
  const OUTPUT_BASENAME = "reader-recording";

  const els = {
    statusPill: document.getElementById("status-pill"),
    pageSelectScreen: document.getElementById("page-select-screen"),
    recordScreen: document.getElementById("record-screen"),
    previewScreen: document.getElementById("preview-screen"),
    pageUpload: document.getElementById("page-upload"),
    pageGrid: document.getElementById("page-grid"),
    pageEmptyState: document.getElementById("page-empty-state"),
    backToPagesBtn: document.getElementById("back-to-pages-btn"),
    selectedPageLabel: document.getElementById("selected-page-label"),
    readerCanvas: document.getElementById("reader-canvas"),
    countdownTimer: document.getElementById("countdown-timer"),
    recordBtn: document.getElementById("record-btn"),
    stopBtn: document.getElementById("stop-btn"),
    recordHelper: document.getElementById("record-helper"),
    previewVideo: document.getElementById("preview-video"),
    rerecordBtn: document.getElementById("rerecord-btn"),
    shareBtn: document.getElementById("share-btn"),
    downloadLink: document.getElementById("download-link"),
    recordingMeta: document.getElementById("recording-meta")
  };

  const state = {
    pages: [],
    selectedPage: null,
    selectedImage: null,
    canvasContext: null,
    mediaRecorder: null,
    audioStream: null,
    canvasStream: null,
    combinedStream: null,
    chunks: [],
    startedAt: 0,
    timerId: 0,
    stopTimeoutId: 0,
    recordingBlob: null,
    recordingFile: null,
    recordingUrl: "",
    selectedMimeType: ""
  };

  function setStatus(text, isRecording = false) {
    els.statusPill.textContent = text;
    els.statusPill.classList.toggle("recording", isRecording);
  }

  function showScreen(screen) {
    [els.pageSelectScreen, els.recordScreen, els.previewScreen].forEach(item => {
      item.classList.toggle("active", item === screen);
    });
  }

  function formatTime(msRemaining) {
    const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function resetTimer() {
    els.countdownTimer.textContent = formatTime(MAX_RECORDING_MS);
  }

  function updateTimer() {
    if (!state.startedAt) {
      resetTimer();
      return;
    }

    const elapsed = Date.now() - state.startedAt;
    const remaining = MAX_RECORDING_MS - elapsed;
    els.countdownTimer.textContent = formatTime(remaining);

    if (remaining <= 0) {
      stopRecording("limit");
    }
  }

  function clearTimers() {
    if (state.timerId) window.clearInterval(state.timerId);
    if (state.stopTimeoutId) window.clearTimeout(state.stopTimeoutId);
    state.timerId = 0;
    state.stopTimeoutId = 0;
  }

  function getSupportedMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
      return "";
    }

    const candidates = [
      "video/mp4;codecs=h264,aac",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
  }

  function getFileExtension(mimeType) {
    if (String(mimeType || "").includes("mp4")) return "mp4";
    if (String(mimeType || "").includes("webm")) return "webm";
    return "webm";
  }

  function cleanObjectUrl(url) {
    if (url) {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn("Could not revoke object URL", error);
      }
    }
  }

  function isAbsoluteAssetUrl(value) {
    return /^(https?:|blob:|data:|\/)/i.test(String(value || ""));
  }

  function joinManifestPath(basePath, filePath) {
    const cleanFilePath = String(filePath || "").trim();
    if (!cleanFilePath) return "";
    if (isAbsoluteAssetUrl(cleanFilePath)) return cleanFilePath;

    const cleanBasePath = String(basePath || "").trim();
    if (!cleanBasePath) return cleanFilePath;

    const normalizedBase = cleanBasePath.endsWith("/") ? cleanBasePath : `${cleanBasePath}/`;
    return `${normalizedBase}${cleanFilePath}`.replace(/\\/g, "/");
  }

  function resolveManifestImageUrl(imagePath, manifestDirectoryUrl) {
    const cleanPath = String(imagePath || "").trim();
    if (!cleanPath) return "";

    if (isAbsoluteAssetUrl(cleanPath)) {
      return cleanPath;
    }

    try {
      return new URL(cleanPath, manifestDirectoryUrl).href;
    } catch (error) {
      console.warn("Could not resolve image path from manifest", cleanPath, error);
      return cleanPath;
    }
  }

  function normalizeManifestPage(page, index, manifest, manifestDirectoryUrl) {
    const pageNo = page.pageNo || page.page || index + 1;
    const lessonNo = page.lesson || page.lessonNo || null;
    const rawImagePath = page.src || page.imageUrl || page.image || page.file || page.filename || "";
    const imagePath = joinManifestPath(
      rawImagePath && rawImagePath.includes("/") ? "" : manifest.imageBasePath,
      rawImagePath
    );

    const title = page.title
      || (lessonNo ? `Lesson ${lessonNo}` : "")
      || (page.type === "cover" ? "Cover" : "")
      || `Page ${pageNo}`;

    return {
      id: String(page.id || page.pageId || pageNo || index + 1),
      title: String(title),
      pageNo: Number(pageNo) || index + 1,
      lesson: lessonNo === null ? null : Number(lessonNo),
      type: String(page.type || (lessonNo ? "lesson" : "page")),
      src: resolveManifestImageUrl(imagePath, manifestDirectoryUrl),
      source: "manifest"
    };
  }

  async function loadStaticManifest() {
    try {
      const manifestUrl = new URL("./pages/manifest.json", window.location.href);
      const manifestDirectoryUrl = new URL("./", manifestUrl).href;
      const response = await fetch(manifestUrl.href, { cache: "no-store" });
      if (!response.ok) return;

      const manifest = await response.json();
      const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
      const normalized = pages
        .map((page, index) => normalizeManifestPage(page || {}, index, manifest || {}, manifestDirectoryUrl))
        .filter(page => page.src);

      if (normalized.length) {
        state.pages = normalized;
        renderPageGrid();
        setStatus(`${manifest.bookTitle || manifest.title || "Pages"} loaded`);
      }
    } catch (error) {
      // The manifest is optional. Upload still works when this file is absent.
      console.info("No static pages manifest loaded", error);
    }
  }

  function addUploadedPages(fileList) {
    const files = Array.from(fileList || []).filter(file => file && file.type && file.type.startsWith("image/"));
    if (!files.length) return;

    const uploadedPages = files.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      title: file.name.replace(/\.[^.]+$/, "") || `Page ${state.pages.length + index + 1}`,
      src: URL.createObjectURL(file),
      objectUrl: true,
      source: "upload"
    }));

    state.pages = [...state.pages, ...uploadedPages];
    renderPageGrid();
    setStatus("Pages ready");
  }

  function renderPageGrid() {
    els.pageGrid.innerHTML = "";
    els.pageEmptyState.classList.toggle("hidden", state.pages.length > 0);

    state.pages.forEach((page, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-card";
      button.dataset.pageIndex = String(index);
      button.setAttribute("aria-label", `Select ${page.title}`);
      button.innerHTML = `
        <span class="page-thumb-wrap"><img src="${escapeAttribute(page.src)}" alt="" loading="lazy"></span>
        <span class="page-title">${escapeHtml(page.title)}</span>
      `;
      els.pageGrid.appendChild(button);
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  async function selectPage(pageIndex) {
    const page = state.pages[pageIndex];
    if (!page) return;

    setStatus("Loading page");
    state.selectedPage = page;
    state.selectedImage = await loadImage(page.src);
    els.selectedPageLabel.textContent = page.title;
    drawSelectedPage();
    resetTimer();
    showScreen(els.recordScreen);
    setStatus("Ready");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load selected image."));
      image.crossOrigin = "anonymous";
      image.src = src;
    });
  }

  function drawSelectedPage() {
    const image = state.selectedImage;
    if (!image) return;

    const canvas = els.readerCanvas;
    const maxWidth = 1440;
    const maxHeight = 1920;
    const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));

    canvas.width = width;
    canvas.height = height;
    state.canvasContext = canvas.getContext("2d", { alpha: false });
    state.canvasContext.fillStyle = "#ffffff";
    state.canvasContext.fillRect(0, 0, width, height);
    state.canvasContext.drawImage(image, 0, 0, width, height);
  }

  async function startRecording() {
    if (!state.selectedImage) {
      alert("Select a page before recording.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      alert("This browser does not support video recording. Please try a newer Safari or Chrome browser.");
      return;
    }

    if (!els.readerCanvas.captureStream) {
      alert("This browser does not support recording from a page image canvas.");
      return;
    }

    try {
      cleanupRecording({ keepSelectedPage: true });
      drawSelectedPage();

      setStatus("Starting");
      els.recordHelper.textContent = "Allow microphone access if prompted.";

      state.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      state.canvasStream = els.readerCanvas.captureStream(CANVAS_FPS);
      const tracks = [
        ...state.canvasStream.getVideoTracks(),
        ...state.audioStream.getAudioTracks()
      ];
      state.combinedStream = new MediaStream(tracks);
      state.chunks = [];
      state.selectedMimeType = getSupportedMimeType();

      const recorderOptions = state.selectedMimeType ? { mimeType: state.selectedMimeType } : undefined;
      state.mediaRecorder = new MediaRecorder(state.combinedStream, recorderOptions);
      state.mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          state.chunks.push(event.data);
        }
      };
      state.mediaRecorder.onstop = finalizeRecording;
      state.mediaRecorder.onerror = event => {
        console.error("Recorder error", event.error || event);
        stopRecording("error");
      };

      state.mediaRecorder.start(1000);
      state.startedAt = Date.now();
      els.recordBtn.classList.add("hidden");
      els.stopBtn.classList.remove("hidden");
      els.recordHelper.textContent = "Recording. Read from the selected page.";
      setStatus("Recording", true);
      updateTimer();
      state.timerId = window.setInterval(updateTimer, 250);
      state.stopTimeoutId = window.setTimeout(() => stopRecording("limit"), MAX_RECORDING_MS + 250);
    } catch (error) {
      console.error(error);
      cleanupRecording({ keepSelectedPage: true });
      setStatus("Ready");
      alert(error && error.name === "NotAllowedError"
        ? "Microphone permission was not allowed. Please allow microphone access to record."
        : "Recording could not start on this device/browser.");
    }
  }

  function stopRecording(reason = "manual") {
    clearTimers();
    if (!state.mediaRecorder || state.mediaRecorder.state === "inactive") {
      return;
    }

    els.stopBtn.disabled = true;
    els.recordHelper.textContent = reason === "limit" ? "Two-minute limit reached." : "Preparing preview...";
    setStatus("Saving");

    try {
      state.mediaRecorder.stop();
    } catch (error) {
      console.error("Could not stop recorder", error);
      finalizeRecording();
    }
  }

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach(track => track.stop());
  }

  function finalizeRecording() {
    clearTimers();
    const durationMs = state.startedAt ? Date.now() - state.startedAt : 0;
    state.startedAt = 0;

    stopTracks(state.audioStream);
    stopTracks(state.canvasStream);
    stopTracks(state.combinedStream);
    state.audioStream = null;
    state.canvasStream = null;
    state.combinedStream = null;
    state.mediaRecorder = null;

    els.recordBtn.classList.remove("hidden");
    els.stopBtn.classList.add("hidden");
    els.stopBtn.disabled = false;
    resetTimer();

    const mimeType = state.selectedMimeType || "video/webm";
    state.recordingBlob = new Blob(state.chunks, { type: mimeType });
    const extension = getFileExtension(mimeType);
    const safeTitle = String(state.selectedPage && state.selectedPage.title || "page")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "page";
    const fileName = `${OUTPUT_BASENAME}-${safeTitle}.${extension}`;

    cleanObjectUrl(state.recordingUrl);
    state.recordingUrl = URL.createObjectURL(state.recordingBlob);
    state.recordingFile = new File([state.recordingBlob], fileName, { type: mimeType });

    els.previewVideo.src = state.recordingUrl;
    els.downloadLink.href = state.recordingUrl;
    els.downloadLink.download = fileName;
    els.recordingMeta.textContent = `${state.selectedPage ? state.selectedPage.title : "Selected page"} • ${Math.min(120, Math.round(durationMs / 1000))} seconds • ${extension.toUpperCase()}`;

    setStatus("Preview");
    showScreen(els.previewScreen);
  }

  function cleanupRecording(options = {}) {
    clearTimers();
    stopTracks(state.audioStream);
    stopTracks(state.canvasStream);
    stopTracks(state.combinedStream);
    state.audioStream = null;
    state.canvasStream = null;
    state.combinedStream = null;
    state.mediaRecorder = null;
    state.chunks = [];
    state.startedAt = 0;
    state.selectedMimeType = "";

    if (!options.keepRecordingFile) {
      cleanObjectUrl(state.recordingUrl);
      state.recordingUrl = "";
      state.recordingBlob = null;
      state.recordingFile = null;
      els.previewVideo.removeAttribute("src");
      els.previewVideo.load();
      els.downloadLink.href = "#";
      els.downloadLink.removeAttribute("download");
    }

    if (!options.keepSelectedPage) {
      state.selectedPage = null;
      state.selectedImage = null;
    }

    els.recordBtn.classList.remove("hidden");
    els.stopBtn.classList.add("hidden");
    els.stopBtn.disabled = false;
    els.recordHelper.textContent = "Microphone permission will be requested when you tap Record.";
    resetTimer();
  }

  async function shareRecording() {
    if (!state.recordingFile) {
      alert("No recording is ready to share.");
      return;
    }

    try {
      if (navigator.canShare && navigator.canShare({ files: [state.recordingFile] }) && navigator.share) {
        await navigator.share({
          title: "Reader recording",
          text: "Reader recording",
          files: [state.recordingFile]
        });
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: "Reader recording",
          text: "Download the recording from this page."
        });
        return;
      }

      alert("Sharing files is not supported in this browser. Use the Download button, then share the file from your device.");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      console.error(error);
      alert("The recording could not be shared. Use Download as a fallback.");
    }
  }

  function bindEvents() {
    els.pageUpload.addEventListener("change", event => addUploadedPages(event.target.files));

    els.pageGrid.addEventListener("click", event => {
      const card = event.target.closest(".page-card");
      if (!card) return;
      selectPage(Number(card.dataset.pageIndex)).catch(error => {
        console.error(error);
        alert("Could not open this page image.");
        setStatus("Ready");
      });
    });

    els.backToPagesBtn.addEventListener("click", () => {
      cleanupRecording({ keepSelectedPage: false });
      setStatus("Ready");
      showScreen(els.pageSelectScreen);
    });

    els.recordBtn.addEventListener("click", startRecording);
    els.stopBtn.addEventListener("click", () => stopRecording("manual"));
    els.rerecordBtn.addEventListener("click", () => {
      cleanupRecording({ keepSelectedPage: true });
      drawSelectedPage();
      setStatus("Ready");
      showScreen(els.recordScreen);
    });
    els.shareBtn.addEventListener("click", shareRecording);

    window.addEventListener("pagehide", () => cleanupRecording({ keepSelectedPage: true }));
    window.addEventListener("resize", () => {
      if (state.selectedImage && els.recordScreen.classList.contains("active")) {
        drawSelectedPage();
      }
    });
  }

  function init() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      els.recordHelper.textContent = "This browser cannot access the microphone for recording.";
    }
    state.canvasContext = els.readerCanvas.getContext("2d", { alpha: false });
    resetTimer();
    bindEvents();
    loadStaticManifest();
  }

  init();
})();




