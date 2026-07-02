(() => {
  "use strict";

  const MAX_RECORDING_MS = 2 * 60 * 1000;
  const CANVAS_FPS = 1;
  const OUTPUT_BASENAME = "reader-recording";

  const els = {
    statusPill: document.getElementById("status-pill"),
    contextTitle: document.getElementById("recorder-context-title"),
    pagePill: document.getElementById("page-pill"),
    pageSelectScreen: document.getElementById("page-select-screen"),
    recordScreen: document.getElementById("record-screen"),
    previewScreen: document.getElementById("preview-screen"),
    imageSelectorBtn: document.getElementById("image-selector-btn"),
    imageSelectorCurrent: document.getElementById("image-selector-current"),
    imagePickerSheet: document.getElementById("image-picker-sheet"),
    imagePickerOptions: document.getElementById("image-picker-options"),
    imagePickerBackdrop: document.getElementById("image-picker-backdrop"),
    imagePickerClose: document.getElementById("image-picker-close"),
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
    books: [],
    selectedBookId: "",
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
    updateHeaderContext(screen);
  }

  function getSelectedPageTitle(prefix) {
    const page = state.selectedPage || {};
    const bookTitle = String(page.bookTitle || "").trim();
    const pageTitle = String(page.title || "Selected page").trim();
    return `${prefix} ${bookTitle} ${pageTitle}`.replace(/\s+/g, " ").trim();
  }

  function updateHeaderContext(screen) {
    if (!els.contextTitle) return;

    if (screen === els.recordScreen) {
      els.contextTitle.textContent = getSelectedPageTitle("Record");
      return;
    }

    if (screen === els.previewScreen) {
      els.contextTitle.textContent = getSelectedPageTitle("Preview");
      return;
    }

    els.contextTitle.textContent = "Select a page";
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
    if (!cleanBasePath || cleanFilePath.includes("/")) return cleanFilePath.replace(/\\/g, "/");

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

  function normalizeManifestPage(page, index, book, manifestDirectoryUrl) {
    const pageNo = page.pageNo || page.page || index + 1;
    const lessonNo = page.lesson || page.lessonNo || null;
    const rawImagePath = page.src || page.imageUrl || page.image || page.file || page.filename || "";
    const imagePath = joinManifestPath(book.imageBasePath || book.folder || "", rawImagePath);

    const title = page.title
      || (lessonNo ? `Lesson ${lessonNo}` : "")
      || (page.type === "cover" ? "Cover" : "")
      || `Page ${pageNo}`;

    return {
      id: String(page.id || page.pageId || `${book.id || book.bookTitle || "book"}-${pageNo || index + 1}`),
      title: String(title),
      pageNo: Number(pageNo) || index + 1,
      lesson: lessonNo === null ? null : Number(lessonNo),
      type: String(page.type || (lessonNo ? "lesson" : "page")),
      src: resolveManifestImageUrl(imagePath, manifestDirectoryUrl),
      source: "manifest",
      bookTitle: book.bookTitle || book.title || "Reader Pages"
    };
  }

  function normalizeBook(rawBook, index, manifestDirectoryUrl) {
    const bookTitle = String(rawBook.bookTitle || rawBook.title || rawBook.name || `Image Set ${index + 1}`);
    const pages = Array.isArray(rawBook.pages) ? rawBook.pages : [];
    const id = String(rawBook.id || rawBook.bookId || rawBook.folder || bookTitle).trim() || `book-${index + 1}`;
    const normalizedBook = {
      ...rawBook,
      id,
      bookTitle,
      pages: []
    };

    normalizedBook.pages = pages
      .map((page, pageIndex) => normalizeManifestPage(page || {}, pageIndex, normalizedBook, manifestDirectoryUrl))
      .filter(page => page.src);

    return normalizedBook;
  }

  function normalizeManifest(manifest, manifestDirectoryUrl) {
    if (Array.isArray(manifest.books)) {
      return manifest.books
        .map((book, index) => normalizeBook(book || {}, index, manifestDirectoryUrl))
        .filter(book => book.pages.length);
    }

    const singleBook = {
      ...manifest,
      id: manifest.id || manifest.bookTitle || manifest.title || "default-book",
      bookTitle: manifest.bookTitle || manifest.title || "Reader Pages",
      pages: Array.isArray(manifest.pages) ? manifest.pages : []
    };

    return normalizeBook(singleBook, 0, manifestDirectoryUrl).pages.length
      ? [normalizeBook(singleBook, 0, manifestDirectoryUrl)]
      : [];
  }

  function getSelectedBook() {
    return state.books.find(book => book.id === state.selectedBookId) || null;
  }

  function setImageSelectorLabel(text) {
    els.imageSelectorCurrent.textContent = text || "Select image set";
  }

  async function loadStaticManifest() {
    try {
      const manifestUrl = new URL("./pages/manifest.json", window.location.href);
      const manifestDirectoryUrl = new URL("./", manifestUrl).href;
      const response = await fetch(manifestUrl.href, { cache: "no-store" });
      if (!response.ok) {
        setImageSelectorLabel("Select your own image");
        renderImagePickerOptions();
        return;
      }

      const manifest = await response.json();
      state.books = normalizeManifest(manifest || {}, manifestDirectoryUrl);
      renderImagePickerOptions();

      if (state.books.length) {
        const defaultBook = state.books.find(book => book.bookTitle === manifest.defaultBook || book.id === manifest.defaultBook) || state.books[0];
        selectBook(defaultBook.id, { closePicker: false });
      } else {
        setImageSelectorLabel("Select your own image");
        setStatus("Ready");
      }
    } catch (error) {
      console.info("No static pages manifest loaded", error);
      setImageSelectorLabel("Select your own image");
      renderImagePickerOptions();
    }
  }

  function renderImagePickerOptions() {
    els.imagePickerOptions.innerHTML = "";

    state.books.forEach(book => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `picker-option${book.id === state.selectedBookId ? " is-selected" : ""}`;
      button.dataset.bookId = book.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", book.id === state.selectedBookId ? "true" : "false");
      button.innerHTML = `
        <span>
          <span class="picker-option-title">${escapeHtml(book.bookTitle)}</span>
          <span class="picker-option-meta">${book.pages.length} pages</span>
        </span>
        <span class="picker-option-check" aria-hidden="true">${book.id === state.selectedBookId ? "✓" : "›"}</span>
      `;
      els.imagePickerOptions.appendChild(button);
    });

    const ownButton = document.createElement("button");
    ownButton.type = "button";
    ownButton.className = `picker-option${state.selectedBookId === "upload" ? " is-selected" : ""}`;
    ownButton.dataset.action = "upload";
    ownButton.setAttribute("role", "option");
    ownButton.setAttribute("aria-selected", state.selectedBookId === "upload" ? "true" : "false");
    ownButton.innerHTML = `
      <span>
        <span class="picker-option-title">Select your own image</span>
        <span class="picker-option-meta">Choose image files from this device</span>
      </span>
      <span class="picker-option-check" aria-hidden="true">${state.selectedBookId === "upload" ? "✓" : "›"}</span>
    `;
    els.imagePickerOptions.appendChild(ownButton);
  }

  function openImagePicker() {
    renderImagePickerOptions();
    els.imagePickerSheet.classList.remove("hidden");
    document.body.classList.add("picker-open");
  }

  function closeImagePicker() {
    els.imagePickerSheet.classList.add("hidden");
    document.body.classList.remove("picker-open");
  }

  function selectBook(bookId, options = {}) {
    const book = state.books.find(item => item.id === bookId);
    if (!book) return;

    cleanupUploadedObjectUrls();
    state.selectedBookId = book.id;
    state.pages = book.pages;
    setImageSelectorLabel(book.bookTitle);
    renderImagePickerOptions();
    renderPageGrid();
    setStatus(`${book.bookTitle} loaded`);

    if (options.closePicker !== false) {
      closeImagePicker();
    }
  }

  function cleanupUploadedObjectUrls() {
    state.pages
      .filter(page => page.objectUrl)
      .forEach(page => cleanObjectUrl(page.src));
  }

  function addUploadedPages(fileList) {
    const files = Array.from(fileList || []).filter(file => file && file.type && file.type.startsWith("image/"));
    if (!files.length) return;

    cleanupUploadedObjectUrls();
    const uploadedPages = files.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      title: file.name.replace(/\.[^.]+$/, "") || `Image ${index + 1}`,
      pageNo: index + 1,
      src: URL.createObjectURL(file),
      objectUrl: true,
      source: "upload",
      bookTitle: "Own image"
    }));

    state.selectedBookId = "upload";
    state.pages = uploadedPages;
    setImageSelectorLabel("Own image");
    renderImagePickerOptions();
    renderPageGrid();
    setStatus("Image ready");
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
      const subtitle = page.type === "cover"
        ? "Cover"
        : page.lesson
          ? `Lesson ${page.lesson}`
          : `Page ${page.pageNo || index + 1}`;
      button.innerHTML = `
        <span class="page-thumb-wrap"><img src="${escapeAttribute(page.src)}" alt="" loading="lazy"></span>
        <span class="page-title">${escapeHtml(page.title)}</span>
        <span class="page-subtitle">${escapeHtml(subtitle)}</span>
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
    if (els.selectedPageLabel) els.selectedPageLabel.textContent = `${page.bookTitle ? `${page.bookTitle} ` : ""}${page.title}`;
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
      els.recordHelper.textContent = "";
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
    if (els.recordingMeta) els.recordingMeta.textContent = `${state.selectedPage ? state.selectedPage.title : "Selected page"} • ${Math.min(120, Math.round(durationMs / 1000))} seconds • ${extension.toUpperCase()}`;

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


  function goToPageSelection() {
    if (state.mediaRecorder && state.mediaRecorder.state === "recording") {
      alert("Stop the recording before changing page.");
      return;
    }

    cleanupRecording({ keepSelectedPage: false });
    setStatus("Ready");
    showScreen(els.pageSelectScreen);
  }

  function bindEvents() {
    if (els.pagePill) els.pagePill.addEventListener("click", goToPageSelection);
    els.imageSelectorBtn.addEventListener("click", openImagePicker);
    els.imagePickerBackdrop.addEventListener("click", closeImagePicker);
    els.imagePickerClose.addEventListener("click", closeImagePicker);

    els.imagePickerOptions.addEventListener("click", event => {
      const option = event.target.closest(".picker-option");
      if (!option) return;

      if (option.dataset.action === "upload") {
        closeImagePicker();
        els.pageUpload.click();
        return;
      }

      if (option.dataset.bookId) {
        selectBook(option.dataset.bookId);
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !els.imagePickerSheet.classList.contains("hidden")) {
        closeImagePicker();
      }
    });

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

    if (els.backToPagesBtn) els.backToPagesBtn.addEventListener("click", goToPageSelection);

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
    updateHeaderContext(els.pageSelectScreen);
    bindEvents();
    loadStaticManifest();
  }

  init();
})();
