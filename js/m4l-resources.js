/* M4L V102.10 - Policy-aware Global Library badges, Profile context and Student split PDF support.
   M4L v100.4.1 - Private Drive PDF.js compatibility
   Routes signed M4L Drive PDF URLs through the existing same-origin /pdf-file proxy.

   M4L v100.4 - Private Google Drive Library access
   Resolves private Drive-backed resource rows to short-lived Worker delivery URLs.

   M4L v99.1 - Large-screen split PDF viewer
   Adds an authorised-user second PDF.js pane at 1024px and wider.
   Reuses the existing PDF Library drawer, preserves independent PDF.js state,
   and coordinates split mode with the Teaching Panel.

   M4L v98.0 - PDF Teaching Panel integration
   Closes/resets the local teaching panel when the PDF viewer closes or changes.

   M4L v97.1.8 - All-subject PDF Library navigation (frontend only)
   Adds same-subject/module PDF switching, Previous/Next controls, and a Library drawer.

   M4L v94.6 - Session-stable Library cache and mobile rail scrolling
   Uses the seven-day persistent resource cache once per app session, refreshes
   only when missing, stale, or manually requested, and avoids repeat DOM builds.

   M4L v93.0 - Resources order + shared cache integration
   Baseline: V83.1 Resources JS legacy compatibility quarantine.
   Scope: change Library module rail resource order to eBook → Video → Audio → Printable → Other.
   Protected: active direct Library ribbon cards, PDF viewer, inline audio/video preview, resource opening, and V83 quarantine markers.
*/

/* =========================
   LIBRARY RESOURCE VIEW
========================= */

let studentResourceSubjects = [];
let libraryResourceSubjects = [];
let libraryResourceMap = new Map();
let libraryResourceSequence = 0;
let studentResourceViewMode = "student";
let libraryResourceSessionReady = false;
let libraryCatalogueResult = null;
let selectedLibrarySourceId = "ALL";
let libraryPublicLoadSequence = 0;

const PDFJS_VIEWER_PATH = "/pdf-viewer/web/viewer.html";
const PDFJS_VIEWER_VERSION = "99.0";

let previousPdfScreenId = "";
let currentPdfDirectLink = "";
let currentPdfResourceId = "";
let currentPdfTitle = "";
let currentPdfLibraryItems = [];

const PDF_SPLIT_MIN_WIDTH = 1024;
const pdfSplitState = {
  enabled: false,
  selectingSecondary: false,
  secondaryResourceId: "",
  secondaryDirectLink: "",
  secondaryTitle: "",
  primaryRatio: 0.5
};

const LIBRARY_RESOURCE_TYPES = [
  {
    key: "EBOOK",
    label: "eBook",
    icon: "/icons/ebook.svg",
    className: "ebook"
  },
  {
    key: "VIDEO",
    label: "Video",
    icon: "/icons/video.svg",
    className: "video"
  },
  {
    key: "AUDIO",
    label: "Audio",
    icon: "/icons/audio.svg",
    className: "audio"
  },
  {
    key: "PRINTABLE",
    label: "Printable",
    icon: "/icons/printable.svg",
    className: "printable"
  },
  {
    key: "OTHER",
    label: "Other",
    icon: "/icons/other.svg",
    className: "other"
  }
];

const LIBRARY_RESOURCE_TYPE_ALIASES = {
  VIDEO: "VIDEO",
  VIDEOS: "VIDEO",
  MOVIE: "VIDEO",
  MOVIES: "VIDEO",
  AUDIO: "AUDIO",
  AUDIOS: "AUDIO",
  EBOOK: "EBOOK",
  EBOOKS: "EBOOK",
  E_BOOK: "EBOOK",
  E_BOOKS: "EBOOK",
  PDF: "EBOOK",
  PDFS: "EBOOK",
  PRINTABLE: "PRINTABLE",
  PRINTABLES: "PRINTABLE",
  PRINT: "PRINTABLE",
  WORKSHEET: "PRINTABLE",
  WORKSHEETS: "PRINTABLE",
  OTHER: "OTHER",
  OTHERS: "OTHER",
  LINK: "OTHER",
  LINKS: "OTHER",
  IMAGE: "OTHER",
  IMAGES: "OTHER"
};

function resetStudentResourceSelection() {
  libraryResourceSubjects = [];
  libraryResourceMap = new Map();
  libraryResourceSequence = 0;
}

const LIBRARY_CACHE_KEY = "resources:catalogue:v3";
const LIBRARY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hasUnifiedLibraryAccount() {
  try {
    return localStorage.getItem("m4l_account_workspace") === "true" &&
      !!String(localStorage.getItem("m4l_account_token") || "") &&
      String(localStorage.getItem("m4l_account_token") || "") === String(state.token || "");
  } catch (error) {
    return false;
  }
}

function getLibraryCacheScope() {
  const uniqueId = String(state.uniqueid || "").trim().toUpperCase();
  return `account-library:${uniqueId || "legacy"}`;
}

function isPrivateDriveResourceLink(link) {
  const value = String(link || "").trim();
  if (!value) return false;

  try {
    const url = new URL(value, window.location.origin);
    return /^\/api\/library\/drive\/file\/[A-Za-z0-9_-]+$/.test(url.pathname);
  } catch (error) {
    return false;
  }
}

async function resolveLibraryResourceLink(resource) {
  if (!resource || !resource.link || !isPrivateDriveResourceLink(resource.link)) {
    return resource ? String(resource.link || "").trim() : "";
  }

  const accessScope = String(resource.accessScope || resource.source?.accessscope || "").trim().toUpperCase();
  const originResourceId = String(
    resource.originResourceId ||
    resource.source?.originresourceid ||
    getExistingResourceId(resource.source) ||
    resource.source?.resourceid ||
    ""
  ).trim();
  const endpoint = accessScope === "GLOBAL"
    ? "/api/platform/global/resources/access"
    : (accessScope === "COURSE" ? "/api/library/course-resource/access" : "/api/library/drive/access");
  const result = await apiPost(endpoint, {
    resourceType: resource.type,
    resourceId: originResourceId,
    ...(accessScope === "COURSE" ? { courseId: resource.courseId || resource.source?.courseid || "" } : {})
  }, state.token);

  if (!result.success || !result.url) {
    throw new Error(result.error || "Unable to open the private Drive resource.");
  }

  return String(result.url);
}

function invalidateLibraryResourceCache() {
  libraryResourceSessionReady = false;
  resetStudentResourceSelection();
  studentResourceSubjects = [];
  libraryCatalogueResult = null;
  selectedLibrarySourceId = "ALL";
  if (window.M4LCache && typeof window.M4LCache.remove === "function") {
    window.M4LCache.remove(LIBRARY_CACHE_KEY, { scope: getLibraryCacheScope() });
  }
  return true;
}

async function showStudentResources(options = {}) {
  studentResourceViewMode = "student";
  setResourceScreensForStudent();
  await loadResourceCategories(
    hasUnifiedLibraryAccount() ? "/api/library/catalogue" : "/api/resources/list",
    {},
    options
  );
}

async function showAdminResources(options = {}) {
  studentResourceViewMode = "admin";
  setResourceScreensForAdmin();
  await loadResourceCategories(
    hasUnifiedLibraryAccount() ? "/api/library/catalogue" : "/api/resources/list",
    {},
    options
  );
}

function setResourceScreensForStudent() {
  const screen = document.getElementById("student-resources-subjects");
  if (screen) {
    screen.classList.remove("admin-theme");
    screen.classList.add("student-theme");
  }

  const listTitle = document.querySelector("#student-resources-subjects h2");
  if (listTitle) listTitle.innerText = "Library";

  removeLibraryHeaderActionButton();
}

function setResourceScreensForAdmin() {
  const screen = document.getElementById("student-resources-subjects");
  if (screen) {
    screen.classList.remove("student-theme");
    screen.classList.add("admin-theme");
  }

  const listTitle = document.querySelector("#student-resources-subjects h2");
  if (listTitle) listTitle.innerText = "Library";

  removeLibraryHeaderActionButton();
}

function removeLibraryHeaderActionButton() {
  const listBackButton = document.querySelector("#student-resources-subjects .small-btn");

  if (!listBackButton) {
    return;
  }

  listBackButton.remove();
}

async function fetchResourceCategories(apiPath, body = {}) {
  let result = await apiPost(apiPath, body, state.token);

  /* V83_LEGACY_QUARANTINE_START: fetchResourceCategories fallback route probing
     V83.1 reason: old multi-route API probing should not be needed once active resource routes are stable.
     Original fallback preserved for rollback.
  // Compatibility fallback while routes are stabilised.
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
  V83_LEGACY_QUARANTINE_END: fetchResourceCategories fallback route probing */

  if (!result.success) {
    throw new Error(result.error || "Failed to load resources");
  }

  return result;
}

async function loadResourceCategories(apiPath, body = {}, options = {}) {
  if (!showScreen("student-resources-subjects")) {
    console.warn("Resources screen is missing; resource ribbons were not shown.");
    return;
  }

  const container = getDomElement("student-resource-subject-list");

  if (!container) {
    console.warn("Missing resource subject list container.");
    return;
  }

  bindResourceUiHandlers();
  bindMediaViewerHandlers();

  const forceRefresh = options.force === true;

  if (libraryResourceSessionReady && !forceRefresh) {
    return;
  }

  const applyResult = result => {
    const sequence = ++libraryPublicLoadSequence;
    libraryCatalogueResult = result || {};
    const availableSourceIds = new Set((result?.sources || []).map(source => String(source.id || "")));
    if (!availableSourceIds.has(selectedLibrarySourceId)) selectedLibrarySourceId = "ALL";
    renderLibrarySourceSelector(result || {});
    applyLibrarySourceSelection();
    libraryResourceSessionReady = true;
    if (hasUnifiedLibraryAccount() && Array.isArray(result?.libraries)) {
      void loadAssignedPublicBooks(result, sequence);
    }
  };

  const fetchFresh = async () => {
    const result = await fetchResourceCategories(apiPath, body);
    return result;
  };

  try {
    if (!window.M4LCache) {
      setDomHtml(container, `<p class="helper-text">Loading resources...</p>`);
      const result = await fetchFresh();
      applyResult(result);
      return;
    }

    const cached = window.M4LCache.getEntry(LIBRARY_CACHE_KEY, {
      scope: getLibraryCacheScope(),
      ttl: LIBRARY_CACHE_TTL_MS,
      allowStale: true
    });

    if (cached && !forceRefresh) {
      applyResult(cached.data);

      // V100.4: keep the fast cached render, but revalidate once per app session
      // whenever the device is online so newly added Drive resources do not wait
      // for the seven-day offline cache TTL.
      if (navigator.onLine !== false) {
        window.M4LCache.fetchAndStore(LIBRARY_CACHE_KEY, fetchFresh, {
          scope: getLibraryCacheScope(),
          ttl: LIBRARY_CACHE_TTL_MS,
          onUpdate: fresh => applyResult(fresh)
        }).catch(error => {
          console.warn("The Library background refresh failed; cached resources were retained.", error);
        });
      }
      return;
    }

    if (!cached || forceRefresh) {
      setDomHtml(container, `<p class="helper-text">Loading resources...</p>`);
    }

    let freshResultApplied = false;
    const result = await window.M4LCache.fetchAndStore(LIBRARY_CACHE_KEY, fetchFresh, {
      scope: getLibraryCacheScope(),
      ttl: LIBRARY_CACHE_TTL_MS,
      onUpdate: fresh => {
        applyResult(fresh);
        freshResultApplied = true;
      }
    });

    if (!libraryResourceSessionReady || (forceRefresh && !freshResultApplied)) {
      applyResult(result);
    }
  } catch (err) {
    if (!libraryResourceSessionReady) {
      setDomHtml(container, `<p class="error-message">${escapeHtml(err.message || "Unable to load resources. Please try again.")}</p>`);
    } else {
      console.warn("The Library refresh failed; the existing cached screen was retained.", err);
    }
  }
}

async function loadAssignedPublicBooks(result, sequence) {
  try {
    let catalogue = { books: [] };
    try {
      const response = await fetch('/academy/open-library/catalogue');
      if (response.ok) catalogue = await response.json();
    } catch { /* Public Academy links remain available if Archive.org is unavailable. */ }
    const metadataResponse = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/open-library/metadata/public`);
    if (!metadataResponse.ok) return;
    const metadata = await metadataResponse.json();
    if (!hasUnifiedLibraryAccount() || sequence !== libraryPublicLoadSequence) return;
    const available = new Set(Array.isArray(result.learningAreaRefs) ? result.learningAreaRefs : []);
    const records = new Map((Array.isArray(metadata.records) ? metadata.records : [])
      .filter(row => typeof row.id === 'string').map(row => [row.id, row]));
    const additions = new Map();
    const pdf = url => /^https:\/\/archive\.org\/download\/[^?#]+\.pdf$/i.test(url || '');
    const media = url => /^https:\/\/archive\.org\/download\/[^?#]+\.(?:mp3|m4a|ogg|mp4|webm)$/i.test(url || '');
    for (const book of Array.isArray(catalogue.books) ? catalogue.books : []) {
      const record = records.get(book.id);
      if (!record || !book.id?.startsWith('EXTERNAL:INTERNET_ARCHIVE:') ||
          !(pdf(book.pdfUrl) || book.volumes?.some(volume => pdf(volume.pdfUrl)) ||
            ((book.resourceType === 'AUDIO' || book.resourceType === 'VIDEO') &&
              (media(book.mediaUrl) || book.mediaFiles?.some(file => media(file.mediaUrl)))))) continue;
      for (const ref of Array.isArray(record.learningAreaRefs) ? record.learningAreaRefs : []) {
        if (!available.has(ref) || (!ref.startsWith('REBOOT:') && !ref.startsWith('GLOBAL:'))) continue;
        const libraryId = ref.startsWith('REBOOT:') ? `COURSE:${ref.slice(7)}` : 'GLOBAL';
        if (!additions.has(libraryId)) additions.set(libraryId, []);
        if (additions.get(libraryId).some(item => item.id === book.id)) continue;
        additions.get(libraryId).push({ id: book.id, name: record.title || book.title,
          type: book.resourceType === 'AUDIO' || book.resourceType === 'VIDEO' ? book.resourceType :
            record.resourceType === 'PRINTABLE' ? 'PRINTABLE' : 'EBOOK',
          subject: record.subject || book.subject || 'Books', module: record.module || 'General',
          subjectRef: record.subjectRef || '', moduleRef: record.moduleRef || '' });
      }
    }
    for (const record of Array.isArray(metadata.records) ? metadata.records : []) {
      if (record.kind !== 'LINK' || record.resourceType !== 'OTHER' || record.active === false ||
          !record.id?.startsWith('EXTERNAL:ACADEMY_LINK:') ||
          typeof record.linkUrl !== 'string' || !/^https:\/\//i.test(record.linkUrl)) continue;
      for (const ref of Array.isArray(record.learningAreaRefs) ? record.learningAreaRefs : []) {
        if (!available.has(ref) || (!ref.startsWith('REBOOT:') && !ref.startsWith('GLOBAL:'))) continue;
        const libraryId = ref.startsWith('REBOOT:') ? `COURSE:${ref.slice(7)}` : 'GLOBAL';
        if (!additions.has(libraryId)) additions.set(libraryId, []);
        if (additions.get(libraryId).some(item => item.id === record.id)) continue;
        additions.get(libraryId).push({ id: record.id, name: record.title, type: 'OTHER',
          subject: record.subject || 'Other', module: record.module || 'General',
          subjectRef: record.subjectRef || '', moduleRef: record.moduleRef || '',
          linkUrl: record.linkUrl });
      }
    }
    if (!additions.size) return;
    const libraries = result.libraries.map(library => ({ ...library,
      catalogue: { ...library.catalogue,
        groups: [...(library.catalogue?.groups || [])] } }));
    const sources = [...(result.sources || [])];
    if (additions.has('GLOBAL') && !libraries.some(library => library.id === 'GLOBAL')) {
      libraries.push({ id: 'GLOBAL', label: 'Global Subjects', scope: 'GLOBAL', available: true,
        catalogue: { count: 0, groups: [] } });
      sources.push({ id: 'GLOBAL', label: 'Global Subjects', scope: 'GLOBAL' });
    }
    for (const library of libraries) {
      const books = additions.get(library.id);
      if (!books?.length || library.available === false) continue;
      const subjects = new Map();
      for (const book of books) {
        const key = book.subjectRef || book.subject;
        const nativeSubject = library.catalogue.groups.flatMap(group => group.subjects || [])
          .find(subject => String(subject.subjectname || '').toLocaleLowerCase() === book.subject.toLocaleLowerCase());
        if (!subjects.has(key)) subjects.set(key, { subjectid: nativeSubject?.subjectid || `OPEN:${key}`, subjectname: book.subject,
          modules: new Map() });
        const subject = subjects.get(key);
        const moduleKey = book.moduleRef || book.module;
        const nativeModule = nativeSubject?.modules?.find(module =>
          String(module.modulename || '').toLocaleLowerCase() === book.module.toLocaleLowerCase());
        if (!subject.modules.has(moduleKey)) subject.modules.set(moduleKey, {
          moduleid: nativeModule?.moduleid || book.moduleRef || '', modulename: book.module, resources: [] });
        subject.modules.get(moduleKey).resources.push({ id: book.id, resourceid: book.id,
          name: book.name, type: book.type, format: book.linkUrl ? 'LINK' :
            book.type === 'AUDIO' ? 'AUDIO' : book.type === 'VIDEO' ? 'VIDEO' : 'PDF', publicBook: true,
          link: book.linkUrl || `/academy/open-library/?resource=${encodeURIComponent(book.id)}` });
      }
      for (const type of ['EBOOK', 'PRINTABLE', 'AUDIO', 'VIDEO', 'OTHER']) {
        const count = books.filter(book => book.type === type).length;
        if (!count) continue;
        const groupedSubjects = [...subjects.values()].map(subject => ({ ...subject,
          modules: [...subject.modules.values()].map(module => ({ ...module,
            resources: module.resources.filter(resource => resource.type === type) }))
            .filter(module => module.resources.length) })).filter(subject => subject.modules.length);
        const labels = { EBOOK: ['ebooks', 'eBooks'], PRINTABLE: ['printables', 'Printables'],
          AUDIO: ['audio', 'Audio'], VIDEO: ['video', 'Video'], OTHER: ['other', 'Other'] };
        library.catalogue.groups.push({ key: labels[type][0], type,
          label: labels[type][1], count, subjects: groupedSubjects });
      }
      library.catalogue.count = Number(library.catalogue.count || 0) + books.length;
    }
    libraryCatalogueResult = { ...result, libraries, sources };
    applyLibrarySourceSelection();
  } catch { /* Existing course resources remain available if public books cannot load. */ }
}

function renderLibrarySourceSelector(result) {
  const container = getDomElement("library-source-selector");
  if (!container) return false;
  const sources = Array.isArray(result?.sources) ? result.sources : [];
  if (!sources.length) {
    container.classList.add("hidden");
    setDomHtml(container, "");
    return false;
  }

  container.classList.remove("hidden");
  setDomHtml(container, `
    <div
      class="library-source-menu"
      role="tablist"
      aria-label="Select a Library source"
      style="--library-source-count: ${sources.length}"
    >
      ${sources.map(source => {
        const sourceId = String(source.id || "");
        const selected = sourceId === selectedLibrarySourceId;
        return `
          <button
            type="button"
            class="library-source-menu__item${selected ? " is-active" : ""}"
            data-library-source-id="${escapeForAttribute(sourceId)}"
            role="tab"
            aria-selected="${selected ? "true" : "false"}"
          >${escapeHtml(source.label || sourceId)}</button>
        `;
      }).join("")}
    </div>
  `);
  return true;
}

function applyLibrarySourceSelection() {
  resetStudentResourceSelection();
  const result = buildSelectedLibraryCatalogue(libraryCatalogueResult || {}, selectedLibrarySourceId);
  studentResourceSubjects = Array.isArray(result.subjects) ? result.subjects : [];
  libraryResourceSubjects = buildLibraryResourceSubjects(result);
  renderLibrarySourceSelector(libraryCatalogueResult || {});
  renderStudentResourceSubjects();
  return true;
}

function selectLibrarySource(sourceId) {
  const requested = String(sourceId || "").trim();
  const sources = Array.isArray(libraryCatalogueResult?.sources) ? libraryCatalogueResult.sources : [];
  if (!sources.some(source => String(source.id || "") === requested)) return false;
  selectedLibrarySourceId = requested;
  clearInlineResourcePreviews();
  applyLibrarySourceSelection();
  return true;
}

function buildSelectedLibraryCatalogue(result, sourceId) {
  const libraries = Array.isArray(result?.libraries) ? result.libraries : [];
  if (!libraries.length) return result || {};
  const selected = String(sourceId || "ALL") === "ALL"
    ? libraries.filter(library => library?.available !== false)
    : libraries.filter(library => library?.available !== false && String(library.id || "") === String(sourceId || ""));
  const groupMap = new Map();
  const output = { success: true, count: 0, groups: [] };

  selected.forEach((library, sourceOrder) => {
    const catalogue = library?.catalogue || {};
    output.count += Number(catalogue.count || 0);
    (Array.isArray(catalogue.groups) ? catalogue.groups : []).forEach(group => {
      const key = String(group.key || group.type || "OTHER").trim().toLowerCase();
      if (!groupMap.has(key)) {
        const target = {
          type: group.type || key,
          key,
          label: group.label || key,
          description: group.description || "",
          count: 0,
          subjects: []
        };
        groupMap.set(key, target);
        output.groups.push(target);
        output[key] = target;
      }
      const target = groupMap.get(key);
      target.count += Number(group.count || 0);
      target.subjects.push(...(Array.isArray(group.subjects) ? group.subjects.map(subject => ({
        ...subject,
        sourceorder: sourceOrder,
        sourceid: subject.sourceid || library.id,
        sourcelabel: subject.sourcelabel || library.label,
        sourcescope: subject.sourcescope || library.scope
      })) : []));
    });
  });
  return output;
}

// Compatibility wrapper for older callers. V65 always opens the full direct-resource Library.
/* V83_LEGACY_QUARANTINE_START: openStudentResourceDirect
   V83.1 reason: compatibility wrapper for older callers; active nav should call showStudentResources/showAdminResources directly.
   Original implementation preserved for rollback.

async function openStudentResourceDirect() {
  if (studentResourceViewMode === "admin") {
    await showAdminResources();
    return;
  }

  await showStudentResources();
}
V83_LEGACY_QUARANTINE_END: openStudentResourceDirect */

async function openStudentResourceDirect() {
  console.warn("V83.1 legacy openStudentResourceDirect wrapper is quarantined; routing to the active Library screen.");
  if (studentResourceViewMode === "admin") {
    await showAdminResources();
    return;
  }

  await showStudentResources();
}

function normalizeLibraryResourceType(type, fallbackType = "OTHER") {
  const raw = String(type || fallbackType || "OTHER")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();

  return LIBRARY_RESOURCE_TYPE_ALIASES[raw] || "OTHER";
}

function getLibraryResourceTypeConfig(type) {
  const key = normalizeLibraryResourceType(type);
  return LIBRARY_RESOURCE_TYPES.find(item => item.key === key) || LIBRARY_RESOURCE_TYPES[LIBRARY_RESOURCE_TYPES.length - 1];
}

function getLibraryResourceTypeLabel(type) {
  return getLibraryResourceTypeConfig(type).label;
}

function getResourceCategoryIconPath(type) {
  return getLibraryResourceTypeConfig(type).icon;
}

function getLibraryResourceClassName(type) {
  return getLibraryResourceTypeConfig(type).className;
}

function buildLibraryResourceSubjects(result) {
  const subjectMap = new Map();
  const seenResources = new Set();

  libraryResourceMap = new Map();
  libraryResourceSequence = 0;

  collectResourcesFromTypedGroups(result, subjectMap, seenResources);

  if (subjectMap.size === 0 && Array.isArray(result.subjects)) {
    collectResourcesFromLegacySubjects(result.subjects, subjectMap, seenResources);
  }

  return Array.from(subjectMap.values()).sort(compareLibrarySubjectGroups).map(subject => {
    subject.modules = buildLibraryModuleRowsForSubject(subject);

    delete subject.moduleMap;
    return subject;
  }).filter(subject => subject.modules.length > 0);
}

function buildLibraryModuleRowsForSubject(subject) {
  const modules = Array.from(subject.moduleMap.values()).sort(compareLibraryModuleGroups);

  if (modules.length === 0) {
    return [];
  }

  const genericModules = modules.filter(isGenericLibraryModule);
  const namedModules = modules.filter(module => !isGenericLibraryModule(module));

  if (genericModules.length > 0 && namedModules.length > 0) {
    const targetModule = namedModules[0];

    genericModules.forEach(genericModule => {
      mergeLibraryModuleResourcesIntoTarget(genericModule, targetModule);
    });
  }

  if (genericModules.length > 1 && namedModules.length === 0) {
    const targetModule = genericModules[0];

    genericModules.slice(1).forEach(genericModule => {
      mergeLibraryModuleResourcesIntoTarget(genericModule, targetModule);
    });
  }

  const visibleModules = namedModules.length > 0 ? namedModules : genericModules;

  return visibleModules.map(module => {
    module.resources.sort(compareLibraryResourceRecords);
    delete module.resourceDedupe;
    return module;
  }).filter(module => module.resources.length > 0);
}

function mergeLibraryModuleResourcesIntoTarget(sourceModule, targetModule) {
  if (!sourceModule || !targetModule || sourceModule === targetModule) {
    return;
  }

  sourceModule.resources.forEach(resource => {
    resource.moduleKey = targetModule.key;
    resource.moduleName = targetModule.name;
    resource.previewId = targetModule.previewId;
  });

  targetModule.resources.push(...sourceModule.resources);
}

function isGenericLibraryModule(module) {
  const moduleName = String(module && module.name || "").trim();

  return !moduleName || moduleName.toLowerCase() === "general";
}

function getLibraryModuleRowTitle(subject, module) {
  const subjectName = String(subject && subject.name || "Subject").trim() || "Subject";
  const moduleName = String(module && module.name || "").trim();

  if (!moduleName || moduleName.toLowerCase() === "general") {
    return subjectName;
  }

  return `${subjectName} ${moduleName}`;
}

function buildLibraryModuleGroupingKey(moduleName) {
  return `name:${normalizeLibraryModuleNameForGrouping(moduleName)}`;
}

function normalizeLibraryModuleNameForGrouping(moduleName) {
  const cleanedName = String(moduleName || "General")
    .trim()
    .normalize("NFKC")
    .replace(/[‐-―−]/g, "-")
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (cleanedName || "General").toUpperCase();
}

function collectResourcesFromTypedGroups(result, subjectMap, seenResources) {
  const groups = [];

  if (Array.isArray(result.groups)) {
    result.groups.forEach(group => groups.push({ group, fallbackType: group.type || group.key || "OTHER" }));
  }

  [
    [result.video, "VIDEO"],
    [result.audio, "AUDIO"],
    [result.ebooks, "EBOOK"],
    [result.ebook, "EBOOK"],
    [result.pdf, "EBOOK"],
    [result.printables, "PRINTABLE"],
    [result.printable, "PRINTABLE"],
    [result.other, "OTHER"]
  ].forEach(([group, fallbackType]) => {
    if (group) groups.push({ group, fallbackType });
  });

  groups.forEach(({ group, fallbackType }) => {
    const groupType = normalizeLibraryResourceType(group && (group.type || group.key), fallbackType);
    const subjects = Array.isArray(group && group.subjects) ? group.subjects : [];

    subjects.forEach(subject => {
      const modules = getSubjectModules(subject);

      modules.forEach(module => {
        getModuleResources(module).forEach(resource => {
          addLibraryResourceRecord({
            subject,
            module,
            task: null,
            resource,
            fallbackType: groupType,
            subjectMap,
            seenResources
          });
        });
      });
    });
  });
}

/* V83_LEGACY_QUARANTINE_START: collectResourcesFromLegacySubjects
   V83.1 reason: old Subject -> task/resource response-shape collector; active Library should be populated from typed resource groups.
   Original implementation preserved for rollback.

function collectResourcesFromLegacySubjects(subjects, subjectMap, seenResources) {
  getSortedResourceSubjects(subjects).forEach(subject => {
    getSubjectResourceArray(subject).forEach(resource => {
      addLibraryResourceRecord({
        subject,
        module: buildLegacyModuleGroup(resource, null, "General"),
        task: null,
        resource,
        fallbackType: getResourceType(resource, "OTHER"),
        subjectMap,
        seenResources
      });
    });

    getTaskGroups(subject).forEach(task => {
      getTaskResourceArray(task).forEach(resource => {
        addLibraryResourceRecord({
          subject,
          module: buildLegacyModuleGroup(resource, task, task.taskname || task.TaskName || "General"),
          task,
          resource,
          fallbackType: getResourceType(resource, "OTHER"),
          subjectMap,
          seenResources
        });
      });
    });
  });
}
V83_LEGACY_QUARANTINE_END: collectResourcesFromLegacySubjects */

function collectResourcesFromLegacySubjects(subjects, subjectMap, seenResources) {
  console.warn("V83.1 legacy subject/task resource collector is quarantined.", {
    subjects: Array.isArray(subjects) ? subjects.length : 0,
    subjectMapSize: subjectMap && typeof subjectMap.size === "number" ? subjectMap.size : 0
  });
  return false;
}

function addLibraryResourceRecord({ subject, module, task, resource, fallbackType, subjectMap, seenResources }) {
  const link = getResourceLink(resource);

  // V65 cards represent real resource links. Rows without a link are not rendered.
  if (!link) {
    return;
  }

  const type = normalizeLibraryResourceType(getResourceType(resource, fallbackType), fallbackType);
  const title = getResourceName(resource);
  const subjectId = getResourceSubjectId(subject);
  const subjectName = getResourceSubjectName(subject);
  const sourceId = String(
    resource?.sourceid || subject?.sourceid || "CURRENT_COURSE"
  ).trim() || "CURRENT_COURSE";
  const sourceLabel = String(
    resource?.sourcelabel ||
    subject?.sourcelabel ||
    state.accountContext?.courseName ||
    "Course Library"
  ).trim();
  const sourceScope = String(resource?.sourcescope || subject?.sourcescope || "COURSE").trim().toUpperCase();
  const sourceOrder = Number(subject?.sourceorder ?? resource?.sourceorder ?? 0);
  const subjectIdentity = subjectId ? `id:${subjectId.toUpperCase()}` : `name:${subjectName.toUpperCase()}`;
  const subjectKey = `${sourceId.toUpperCase()}|${subjectIdentity}`;
  const moduleId = getResourceModuleId(module) || getResourceModuleId(resource) || getResourceModuleId(task);
  const moduleName = getResourceModuleName(module) || getResourceModuleName(resource) || getResourceModuleName(task) || "General";
  const moduleKey = buildLibraryModuleGroupingKey(moduleName);
  const dedupeKey = buildLibraryResourceDedupeKey({ subjectKey, moduleKey, type, title, link, resource });

  if (seenResources.has(dedupeKey)) {
    return;
  }

  seenResources.add(dedupeKey);

  if (!subjectMap.has(subjectKey)) {
    subjectMap.set(subjectKey, {
      key: subjectKey,
      id: subjectId,
      name: subjectName,
      sourceId,
      sourceLabel,
      sourceScope,
      sourceOrder: Number.isFinite(sourceOrder) ? sourceOrder : 0,
      accessModel: String(subject?.accessmodel || resource?.accessmodel || "").trim().toUpperCase(),
      deliveryStatus: String(subject?.deliverystatus || resource?.deliverystatus || "").trim().toUpperCase(),
      headingId: `library-subject-${makeDomSafeId(subjectKey)}`,
      moduleMap: new Map()
    });
  }

  const subjectGroup = subjectMap.get(subjectKey);

  if (!subjectGroup.moduleMap.has(moduleKey)) {
    const previewId = `library-preview-${makeDomSafeId(`${subjectKey}-${moduleKey}`)}`;

    subjectGroup.moduleMap.set(moduleKey, {
      key: moduleKey,
      id: moduleId,
      name: moduleName,
      headingId: `library-module-${makeDomSafeId(`${subjectKey}-${moduleKey}`)}`,
      previewId,
      sortOrder: Math.min(
        getResourceModuleSortOrder(module),
        getResourceModuleSortOrder(resource),
        getResourceModuleSortOrder(task)
      ),
      resources: [],
      resourceDedupe: new Set()
    });
  }

  const moduleGroup = subjectGroup.moduleMap.get(moduleKey);
  const resourceId = makeLibraryResourceId(resource, type);
  const record = {
    id: resourceId,
    title,
    type,
    typeLabel: getLibraryResourceTypeLabel(type),
    typeClass: getLibraryResourceClassName(type),
    icon: getResourceCategoryIconPath(type),
    link,
    accessScope: String(resource?.accessscope || sourceScope).trim().toUpperCase(),
    courseId: String(resource?.courseid || "").trim(),
    originResourceId: String(resource?.originresourceid || "").trim(),
    format: getResourceFormat(resource, type),
    subjectKey,
    subjectId,
    subjectName,
    moduleKey,
    moduleId,
    moduleName,
    previewId: moduleGroup.previewId,
    sequence: libraryResourceSequence,
    source: resource
  };

  moduleGroup.resources.push(record);
  libraryResourceMap.set(resourceId, record);
}

function buildLibraryResourceDedupeKey({ subjectKey, moduleKey, type, title, link, resource }) {
  const existingId = getExistingResourceId(resource);

  if (existingId) {
    return [type, subjectKey, moduleKey, existingId.toUpperCase()].join("|");
  }

  return [type, subjectKey, moduleKey, String(link || "").trim(), String(title || "").trim().toUpperCase()].join("|");
}

function makeLibraryResourceId(resource, type) {
  const existingId = getExistingResourceId(resource);
  const base = existingId ? `${type.toLowerCase()}_${existingId}` : `${type.toLowerCase()}_${libraryResourceSequence + 1}`;
  let resourceId = makeDomSafeId(base);

  if (!resourceId) {
    resourceId = `${type.toLowerCase()}_${libraryResourceSequence + 1}`;
  }

  while (libraryResourceMap.has(resourceId)) {
    libraryResourceSequence += 1;
    resourceId = `${makeDomSafeId(base)}_${libraryResourceSequence}`;
  }

  libraryResourceSequence += 1;
  return resourceId;
}

function getExistingResourceId(resource) {
  return String(
    resource && (
      resource.id ||
      resource.resourceid ||
      resource.resourceId ||
      resource.ResourceId ||
      resource.ResourceID ||
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
      resource.otherresourceid
    ) ||
    ""
  ).trim();
}

/* V83_LEGACY_QUARANTINE_START: buildLegacyModuleGroup
   V83.1 reason: helper used only by the quarantined legacy subject/task collector.
   Original implementation preserved for rollback.

function buildLegacyModuleGroup(resource, task, fallbackName) {
  return {
    moduleid: getResourceModuleId(resource) || getResourceModuleId(task),
    modulename: getResourceModuleName(resource) || getResourceModuleName(task) || fallbackName || "General",
    modulesortorder: Math.min(getResourceModuleSortOrder(resource), getResourceModuleSortOrder(task))
  };
}
V83_LEGACY_QUARANTINE_END: buildLegacyModuleGroup */

function buildLegacyModuleGroup(resource, task, fallbackName) {
  console.warn("V83.1 legacy module group builder is quarantined.", resource, task, fallbackName);
  return {
    moduleid: "",
    modulename: fallbackName || "General",
    modulesortorder: Number.POSITIVE_INFINITY
  };
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
      const moduleId = getResourceModuleId(resource) || getResourceModuleId(subject);
      const moduleName = getResourceModuleName(resource) || getResourceModuleName(subject) || "General";
      const moduleKey = buildLibraryModuleGroupingKey(moduleName);
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

    return Array.from(moduleMap.values()).sort(compareResourceModuleGroups);
  }

  return [];
}

function getDirectSubjectResources(subject) {
  if (!subject) return [];

  if (Array.isArray(subject.resources)) return subject.resources;
  if (Array.isArray(subject.Resources)) return subject.Resources;
  if (Array.isArray(subject.resourceList)) return subject.resourceList;
  if (Array.isArray(subject.items)) return subject.items;

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

function renderStudentResourceSubjects() {
  const container = getDomElement("student-resource-subject-list");
  if (!container) return;

  if (libraryResourceSubjects.length === 0) {
    setDomHtml(container, `<p class="helper-text">No resources are available yet.</p>`);
    return;
  }

  const sourceGroups = [];
  const sourceMap = new Map();
  libraryResourceSubjects.forEach(subject => {
    const sourceId = String(subject.sourceId || "CURRENT_COURSE");
    if (!sourceMap.has(sourceId)) {
      const group = {
        id: sourceId,
        label: subject.sourceLabel || "Course Library",
        scope: subject.sourceScope || "COURSE",
        subjects: []
      };
      sourceMap.set(sourceId, group);
      sourceGroups.push(group);
    }
    sourceMap.get(sourceId).subjects.push(subject);
  });

  setDomHtml(container, `
    <div class="library-resource-browser" aria-label="Library resources">
      ${sourceGroups.map(source => `
        <section class="library-source-section" aria-labelledby="library-source-${escapeForAttribute(makeDomSafeId(source.id))}">
          <div class="library-source-section__header">
            <h3 id="library-source-${escapeForAttribute(makeDomSafeId(source.id))}">${escapeHtml(source.label)}</h3>
            ${String(source.scope).toUpperCase() === "GLOBAL" ? '<span class="library-global-badge">GLOBAL</span>' : ""}
          </div>
          ${source.subjects.map(subject => (
            subject.modules.map(module => renderLibraryModuleSection(subject, module)).join("")
          )).join("")}
        </section>
      `).join("")}
    </div>
  `);

  bindLibraryResourceRibbonScrollHandlers(container);
}

function renderLibraryModuleSection(subject, module) {
  const rowTitle = getLibraryModuleRowTitle(subject, module);
  const resources = Array.isArray(module.resources) ? module.resources : [];

  return `
    <section class="library-module-section m4l-ribbon-section" aria-labelledby="${escapeForAttribute(module.headingId)}" data-library-ribbon-section>
      <div class="library-module-header m4l-ribbon-header">
        <div class="library-module-title-wrap">
          <h4 id="${escapeForAttribute(module.headingId)}" class="library-module-title m4l-ribbon-title">${escapeHtml(rowTitle)}</h4>
          ${renderGlobalSubjectBadges(subject)}
        </div>
        ${renderLibraryResourceDots(resources, rowTitle)}
      </div>
      <div class="library-resource-row m4l-ribbon-track" role="list" aria-label="${escapeForAttribute(`${rowTitle} resources`)}" data-library-resource-row>
        ${resources.map(renderLibraryResourceCard).join("")}
      </div>
      <div id="${escapeForAttribute(module.previewId)}" class="library-inline-preview hidden" aria-live="polite"></div>
    </section>
  `;
}

function renderGlobalSubjectBadges(subject) {
  if (String(subject?.sourceScope || "").toUpperCase() !== "GLOBAL") return "";
  const accessModel = ["FREE", "SUBSCRIPTION"].includes(String(subject?.accessModel || "").toUpperCase())
    ? String(subject.accessModel).toUpperCase()
    : "SUBSCRIPTION";
  const deliveryStatus = ["CURRENT", "UPCOMING", "PAST", "NOT SCHEDULED"].includes(String(subject?.deliveryStatus || "").toUpperCase())
    ? String(subject.deliveryStatus).toUpperCase()
    : "NOT SCHEDULED";
  return `
    <span class="library-global-subject-badges" aria-label="${escapeForAttribute(`${accessModel}; ${deliveryStatus}`)}">
      <span class="library-subject-badge library-subject-badge--access">${escapeHtml(accessModel)}</span>
      <span class="library-subject-badge library-subject-badge--delivery">${escapeHtml(deliveryStatus)}</span>
    </span>
  `;
}

function renderLibraryResourceDots(resources, rowTitle) {
  const list = Array.isArray(resources) ? resources : [];

  if (list.length <= 1) {
    return "";
  }

  return `
    <div class="library-resource-dots m4l-ribbon-dots" data-library-resource-dots aria-label="${escapeForAttribute(rowTitle || "Resource")} cards">
      ${list.map((resource, index) => `
        <button
          type="button"
          class="admin-progress-task-dot library-resource-dot m4l-ribbon-dot${index === 0 ? " is-active" : ""}"
          data-library-ribbon-index="${index}"
          aria-label="Show ${escapeForAttribute(resource.title || `resource ${index + 1}`)}"
          aria-current="${index === 0 ? "true" : "false"}"
        ></button>
      `).join("")}
    </div>
  `;
}

function getLibraryRibbonSectionFromElement(element) {
  return element && typeof element.closest === "function"
    ? element.closest("[data-library-ribbon-section], .library-module-section")
    : null;
}

function getLibraryResourceRowFromSection(section) {
  return section ? section.querySelector("[data-library-resource-row], .library-resource-row") : null;
}

function getLibraryResourceCards(row) {
  if (!row || !row.children) return [];

  return Array.from(row.children).filter(child => {
    return child && child.matches && child.matches(".library-resource-card");
  });
}

function getLibraryResourceRowActiveIndex(row) {
  if (!row) return 0;

  const cards = getLibraryResourceCards(row);
  if (cards.length <= 1) return 0;

  const firstCard = cards[0];
  const secondCard = cards[1];
  let step = firstCard ? firstCard.getBoundingClientRect().width : (row.clientWidth || 1);

  if (firstCard && secondCard) {
    const firstRect = firstCard.getBoundingClientRect();
    const secondRect = secondCard.getBoundingClientRect();
    const measuredStep = Math.abs(secondRect.left - firstRect.left);

    if (measuredStep > 1) {
      step = measuredStep;
    }
  }

  const index = Math.round((row.scrollLeft || 0) / Math.max(1, step));
  return Math.max(0, Math.min(cards.length - 1, index));
}

function updateLibraryResourceRibbonDots(row) {
  const targetRow = row || null;
  const section = targetRow ? getLibraryRibbonSectionFromElement(targetRow) : null;

  if (!section || !targetRow) return false;

  const dots = Array.from(section.querySelectorAll("[data-library-resource-dots] [data-library-ribbon-index]"));
  if (!dots.length) return false;

  const activeIndex = getLibraryResourceRowActiveIndex(targetRow);

  dots.forEach((dot, fallbackIndex) => {
    const dotIndex = Number(dot.dataset.libraryRibbonIndex || fallbackIndex || 0);
    const isActive = dotIndex === activeIndex;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-current", isActive ? "true" : "false");
  });

  return true;
}

function scrollLibraryResourceRibbonToIndex(dot, index, options = {}) {
  const section = getLibraryRibbonSectionFromElement(dot);
  const row = getLibraryResourceRowFromSection(section);
  const cards = getLibraryResourceCards(row);
  const targetIndex = Number(index || 0);

  if (!row || !cards[targetIndex]) {
    return false;
  }

  cards[targetIndex].scrollIntoView({
    behavior: options.behavior || "smooth",
    block: "nearest",
    inline: "start"
  });

  updateLibraryResourceRibbonDots(row);

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => updateLibraryResourceRibbonDots(row));
  } else {
    window.setTimeout(() => updateLibraryResourceRibbonDots(row), 0);
  }

  return true;
}

function bindLibraryResourceRibbonScrollHandlers(container) {
  const root = getDomElement(container) || document;
  const rows = root.querySelectorAll ? root.querySelectorAll("[data-library-resource-row], .library-resource-row") : [];

  rows.forEach(row => {
    if (!row || row.dataset.libraryRibbonScrollBound === "true") return;

    row.dataset.libraryRibbonScrollBound = "true";
    let pendingFrame = 0;

    row.addEventListener("scroll", () => {
      if (pendingFrame) return;

      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = 0;
        updateLibraryResourceRibbonDots(row);
      });
    }, { passive: true });

    window.setTimeout(() => updateLibraryResourceRibbonDots(row), 0);
  });
}

function renderLibraryResourceCard(resource) {
  const cardClass = getLibraryResourceCardClassName(resource);

  return `
    <button
      type="button"
      class="${escapeForAttribute(cardClass)}"
      data-resource-id="${escapeForAttribute(resource.id)}"
      data-resource-preview-id="${escapeForAttribute(resource.previewId)}"
      aria-label="${escapeForAttribute(`${resource.typeLabel} resource: ${resource.title}`)}"
    >
      <span class="library-resource-icon-wrap">
        <span
          class="library-resource-icon"
          style="--library-resource-icon-url: url('${escapeForAttribute(resource.icon)}')"
          aria-hidden="true"
        ></span>
      </span>
      <span class="library-resource-title">${escapeHtml(resource.title)}</span>
    </button>
  `;
}

function getLibraryResourceCardClassName(resource) {
  const classes = ["library-resource-card", `type-${resource.typeClass}`];

  if (isPartVideoResource(resource)) {
    classes.push("library-resource-card--part-video");
  }

  return classes.join(" ");
}

function isPartVideoResource(resource) {
  if (!resource || resource.type !== "VIDEO") {
    return false;
  }

  return /\bpart[\s\-_–—]*[12]\b/i.test(String(resource.title || ""));
}

function bindResourceUiHandlers() {
  if (!document || typeof document.addEventListener !== "function") {
    return false;
  }

  if (document.body && document.body.dataset.libraryResourceHandlersBound === "true") {
    return true;
  }

  if (document.body) {
    document.body.dataset.libraryResourceHandlersBound = "true";
  }

  document.addEventListener("click", event => {
    const sourceButton = event.target && event.target.closest
      ? event.target.closest("[data-library-source-id]")
      : null;

    if (sourceButton) {
      event.preventDefault();
      selectLibrarySource(sourceButton.dataset.librarySourceId || "ALL");
      return;
    }

    const ribbonDot = event.target && event.target.closest
      ? event.target.closest("[data-library-ribbon-index]")
      : null;

    if (ribbonDot) {
      event.preventDefault();
      scrollLibraryResourceRibbonToIndex(
        ribbonDot,
        Number(ribbonDot.dataset.libraryRibbonIndex || 0)
      );
      return;
    }

    const card = event.target && event.target.closest
      ? event.target.closest(".library-resource-card")
      : null;

    if (!card || card.disabled) {
      return;
    }

    event.preventDefault();
    openLibraryResourceById(card.dataset.resourceId || "");
  });

  return true;
}

async function openLibraryResourceById(resourceId) {
  const resource = libraryResourceMap.get(String(resourceId || ""));

  if (!resource) {
    alert("Resource not found. Please reload the Library.");
    return false;
  }

  if (!resource.link) {
    alert("This resource does not have a link yet.");
    return false;
  }

  if (resource.source?.publicBook && /^\/academy\/open-library\/\?resource=/.test(resource.link)) {
    window.location.href = resource.link;
    return true;
  }
  if (resource.source?.publicBook && /^https:\/\//i.test(resource.link)) {
    window.open(resource.link, '_blank', 'noopener,noreferrer');
    return true;
  }

  try {
    const accessLink = await resolveLibraryResourceLink(resource);

    if (resource.type === "AUDIO" || resource.type === "VIDEO") {
      return openInlineResourcePreview(resource.previewId, resource.id, accessLink, resource.type, resource.title);
    }

    return openStudentResourceLink(accessLink, resource.type, resource.title, resource.id);
  } catch (error) {
    alert(error.message || "Unable to open this resource.");
    return false;
  }
}

function openInlineResourcePreview(playerId, resourceId, link, type, title = "Resource") {
  const cleanLink = String(link || "").trim();

  if (!cleanLink) {
    return false;
  }

  const previewBox = getDomElement(playerId);

  if (!previewBox) {
    console.warn("Missing resource preview container:", playerId);
    return false;
  }

  const isOpenForSameResource = previewBox.dataset.currentResourceId === String(resourceId || "") &&
    previewBox.classList &&
    !previewBox.classList.contains("hidden");

  clearInlineResourcePreviews(playerId);

  if (isOpenForSameResource) {
    previewBox.classList.add("hidden");
    previewBox.dataset.currentResourceId = "";
    setDomHtml(previewBox, "");
    return true;
  }

  const resourceType = normalizeLibraryResourceType(type);
  const typeLabel = getLibraryResourceTypeLabel(resourceType);

  const mediaMarkup = resourceType === "VIDEO"
    ? `
      <video class="resource-video-control" controls controlsList="nodownload" preload="metadata" playsinline>
        <source src="${escapeForAttribute(cleanLink)}" />
        Your browser cannot play this video file.
      </video>
    `
    : `
      <audio class="resource-audio-control" controls controlsList="nodownload" preload="none">
        <source src="${escapeForAttribute(cleanLink)}" />
        Your browser cannot play this audio file.
      </audio>
    `;

  setDomHtml(previewBox, `
    <div class="library-inline-preview__header">
      <strong>${escapeHtml(title || "Resource")}</strong>
      <span>${escapeHtml(typeLabel)}</span>
    </div>
    ${mediaMarkup}
  `);

  previewBox.dataset.currentResourceId = String(resourceId || "");
  previewBox.classList.remove("hidden");
  return true;
}

function compareResourceIds(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function compareLibrarySubjectGroups(a, b) {
  const sourceOrderA = Number.isFinite(Number(a?.sourceOrder)) ? Number(a.sourceOrder) : 0;
  const sourceOrderB = Number.isFinite(Number(b?.sourceOrder)) ? Number(b.sourceOrder) : 0;
  if (sourceOrderA !== sourceOrderB) return sourceOrderA - sourceOrderB;
  const sourceComparison = String(a?.sourceLabel || "").localeCompare(String(b?.sourceLabel || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
  if (sourceComparison !== 0) return sourceComparison;

  if (a.id || b.id) {
    return compareResourceIds(a.id, b.id);
  }

  return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function compareLibraryModuleGroups(a, b) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  if (a.id || b.id) {
    return compareResourceIds(a.id, b.id);
  }

  return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function compareLibraryResourceRecords(a, b) {
  const typeOrderA = LIBRARY_RESOURCE_TYPES.findIndex(item => item.key === a.type);
  const typeOrderB = LIBRARY_RESOURCE_TYPES.findIndex(item => item.key === b.type);

  if (typeOrderA !== typeOrderB) {
    return typeOrderA - typeOrderB;
  }

  const sequenceA = Number.isFinite(Number(a.sequence)) ? Number(a.sequence) : Number.MAX_SAFE_INTEGER;
  const sequenceB = Number.isFinite(Number(b.sequence)) ? Number(b.sequence) : Number.MAX_SAFE_INTEGER;

  return sequenceA - sequenceB;
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

function getResourceSubjectId(subjectGroup) {
  return String(subjectGroup && (
    subjectGroup.subjectid ||
    subjectGroup.subjectId ||
    subjectGroup.SubjectId ||
    subjectGroup.SubjectID ||
    subjectGroup.id
  ) || "").trim();
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

function getResourceModuleName(moduleGroup) {
  return String(moduleGroup && (
    moduleGroup.modulename ||
    moduleGroup.moduleName ||
    moduleGroup.ModuleName ||
    moduleGroup.name
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

function clearInlineResourcePreviews(exceptPlayerId = "") {
  if (!document || typeof document.querySelectorAll !== "function") {
    return;
  }

  document.querySelectorAll(".library-inline-preview").forEach(player => {
    if (!player || player.id === exceptPlayerId) {
      return;
    }

    try {
      player.querySelectorAll("audio, video").forEach(media => {
        try {
          media.pause();
          media.removeAttribute("src");
          media.querySelectorAll("source").forEach(source => source.removeAttribute("src"));
          if (typeof media.load === "function") media.load();
        } catch (error) {
          console.warn("Could not clear inline media element:", error);
        }
      });
    } catch (error) {
      console.warn("Could not clear inline media preview:", error);
    }

    if (player.classList) {
      player.classList.add("hidden");
    }

    player.dataset.currentResourceId = "";
    setDomHtml(player, "");
  });
}

function safeOpenExternalLink(link) {
  const cleanLink = String(link || "").trim();

  if (!cleanLink) {
    return false;
  }

  try {
    window.open(cleanLink, "_blank", "noopener,noreferrer");
    return true;
  } catch (error) {
    console.warn("Could not open external link:", error);
    return false;
  }
}

/* V83_LEGACY_QUARANTINE_START: toggleInlineResourcePreview
   V83.1 reason: older inline-preview wrapper; active resource cards call openInlineResourcePreview/openLibraryResourceById.
   Original implementation preserved for rollback.

function toggleInlineResourcePreview(playerId, link, type) {
  return openInlineResourcePreview(playerId, `${playerId}-${link}`, link, type, getLibraryResourceTypeLabel(type));
}
V83_LEGACY_QUARANTINE_END: toggleInlineResourcePreview */

function toggleInlineResourcePreview(playerId, link, type) {
  console.warn("V83.1 legacy toggleInlineResourcePreview wrapper is quarantined; routing to active inline preview.");
  return openInlineResourcePreview(playerId, `${playerId}-${link}`, link, type, getLibraryResourceTypeLabel(type));
}

/* V83_LEGACY_QUARANTINE_START: toggleInlineAudioPlayer
   V83.1 reason: older audio-only wrapper; active resource cards call openInlineResourcePreview/openLibraryResourceById.
   Original implementation preserved for rollback.

function toggleInlineAudioPlayer(playerId, link) {
  return toggleInlineResourcePreview(playerId, link, "AUDIO");
}
V83_LEGACY_QUARANTINE_END: toggleInlineAudioPlayer */

function toggleInlineAudioPlayer(playerId, link) {
  console.warn("V83.1 legacy toggleInlineAudioPlayer wrapper is quarantined; routing to active inline preview.");
  return openInlineResourcePreview(playerId, `${playerId}-${link}`, link, "AUDIO", getLibraryResourceTypeLabel("AUDIO"));
}

function openStudentResourceLink(link, type, title = "PDF Viewer", resourceId = "") {
  const cleanLink = String(link || "").trim();

  if (!cleanLink) {
    return false;
  }

  const resourceType = normalizeLibraryResourceType(type);

  if (resourceType === "EBOOK" || resourceType === "PRINTABLE" || isPdfLink(cleanLink)) {
    return openPdfResource(cleanLink, title || "PDF Viewer", resourceId);
  }

  return safeOpenExternalLink(cleanLink);
}

function getPdfViewerFileParam(link) {
  const cleanLink = String(link || "").trim();

  if (!cleanLink) {
    return "";
  }

  if (cleanLink.startsWith("http://") || cleanLink.startsWith("https://")) {
    // V100.4.1: PDF.js must load absolute PDFs through the same-origin Pages
    // proxy. This includes short-lived private Drive Worker URLs.
    return `/pdf-file/${base64UrlEncode(cleanLink)}`;
  }

  return cleanLink;
}

function openPdfResource(link, title = "PDF Viewer", resourceId = "") {
  const cleanLink = String(link || "").trim();

  if (!cleanLink) {
    return false;
  }

  const viewerScreen = getDomElement("pdf-viewer-screen");
  const viewerFrame = getDomElement("pdf-viewer-frame");

  if (!viewerScreen || !viewerFrame) {
    return safeOpenExternalLink(cleanLink);
  }

  const activeScreen = document && typeof document.querySelector === "function"
    ? document.querySelector(".screen.active")
    : null;
  previousPdfScreenId = activeScreen ? activeScreen.id : "";
  resetPdfSplitView({ clearSecondary: true });
  currentPdfDirectLink = cleanLink;
  currentPdfResourceId = String(resourceId || "");
  currentPdfTitle = title || "PDF Viewer";
  currentPdfLibraryItems = buildCurrentPdfLibraryItems(currentPdfResourceId, cleanLink);

  viewerScreen.classList.remove("student-theme", "admin-theme");
  if (activeScreen && activeScreen.classList && activeScreen.classList.contains("admin-theme")) {
    viewerScreen.classList.add("admin-theme");
  } else {
    viewerScreen.classList.add("student-theme");
  }

  setDomText("pdf-viewer-title", currentPdfTitle);
  updatePdfSplitPaneLabels();
  renderPdfLibraryNavigation();

  const pdfFileForViewer = getPdfViewerFileParam(cleanLink);

  if (!pdfFileForViewer) {
    return safeOpenExternalLink(cleanLink);
  }

  clearInlineResourcePreviews();
  window.M4LTeachingPanel?.prepareForPdf?.({
    resourceId: currentPdfResourceId,
    title: title || "PDF Viewer"
  });
  viewerFrame.src = `${PDFJS_VIEWER_PATH}?v=${PDFJS_VIEWER_VERSION}&file=${pdfFileForViewer}`;

  if (document.body) {
    document.body.classList.add("pdf-viewer-open");
  }

  if (!showScreen("pdf-viewer-screen")) {
    viewerFrame.src = "";
    if (document.body) {
      document.body.classList.remove("pdf-viewer-open");
    }
    return safeOpenExternalLink(cleanLink);
  }

  return true;
}


function isPdfLibraryResource(resource) {
  if (!resource || !resource.link) return false;
  return resource.type === "EBOOK" || resource.type === "PRINTABLE" || isPdfLink(resource.link);
}

function comparePdfLibraryResources(a, b) {
  const subjectCompare = compareResourceIds(a.subjectId || a.subjectName, b.subjectId || b.subjectName);
  if (subjectCompare !== 0) return subjectCompare;

  const moduleCompare = compareResourceIds(a.moduleId || a.moduleName, b.moduleId || b.moduleName);
  if (moduleCompare !== 0) return moduleCompare;

  return compareLibraryResourceRecords(a, b);
}

function buildCurrentPdfLibraryItems(resourceId, link) {
  const active = libraryResourceMap.get(String(resourceId || ""));

  if (!active) {
    return [];
  }

  return Array.from(libraryResourceMap.values())
    .filter(isPdfLibraryResource)
    .sort(comparePdfLibraryResources);
}

function getCurrentPdfLibraryIndex() {
  return currentPdfLibraryItems.findIndex(resource => resource.id === currentPdfResourceId);
}

function isPdfSplitLargeScreen() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(`(min-width: ${PDF_SPLIT_MIN_WIDTH}px)`).matches;
  }
  return Number(window.innerWidth || 0) >= PDF_SPLIT_MIN_WIDTH;
}

function hasPdfSplitUi() {
  return !!(
    getDomElement("pdf-split-toggle") &&
    getDomElement("m4l-pdf-split-container") &&
    getDomElement("pdf-viewer-frame-secondary")
  );
}

function canUsePdfSplitView() {
  return hasPdfSplitUi() && isPdfSplitLargeScreen() && currentPdfLibraryItems.length > 1;
}

function getPdfViewerUrl(link) {
  const pdfFileForViewer = getPdfViewerFileParam(link);
  return pdfFileForViewer
    ? `${PDFJS_VIEWER_PATH}?v=${PDFJS_VIEWER_VERSION}&file=${pdfFileForViewer}`
    : "";
}

function updatePdfSplitPaneLabels() {
  setDomText("m4l-pdf-primary-title", currentPdfTitle || "PDF A");
  setDomText("m4l-pdf-secondary-title", pdfSplitState.secondaryTitle || "PDF B");
}

function applyPdfSplitRatio() {
  const container = getDomElement("m4l-pdf-split-container");
  const divider = getDomElement("m4l-pdf-split-divider");
  if (!container || !divider) return false;

  const availableWidth = Math.max(0, container.clientWidth - (divider.offsetWidth || 10));
  if (!availableWidth) return false;

  const minPaneWidth = Math.min(320, Math.floor(availableWidth / 2));
  const minimumRatio = availableWidth ? minPaneWidth / availableWidth : 0.3;
  const maximumRatio = 1 - minimumRatio;
  pdfSplitState.primaryRatio = Math.max(minimumRatio, Math.min(maximumRatio, pdfSplitState.primaryRatio));

  const primaryWidth = Math.round(availableWidth * pdfSplitState.primaryRatio);
  container.style.setProperty("--m4l-pdf-primary-width", `${primaryWidth}px`);
  divider.setAttribute("aria-valuenow", String(Math.round(pdfSplitState.primaryRatio * 100)));
  return true;
}

function renderPdfSplitControls() {
  const button = getDomElement("pdf-split-toggle");
  const buttonLabel = getDomElement("pdf-split-toggle-label");
  const container = getDomElement("m4l-pdf-split-container");
  const primaryHeader = getDomElement("m4l-pdf-primary-header");
  const divider = getDomElement("m4l-pdf-split-divider");
  const secondaryPane = getDomElement("m4l-pdf-secondary-pane");
  const available = canUsePdfSplitView();
  const enabled = available && pdfSplitState.enabled && !!pdfSplitState.secondaryDirectLink;

  if (button) {
    button.hidden = !available;
    button.setAttribute("aria-expanded", enabled ? "true" : "false");
    button.setAttribute(
      "aria-label",
      enabled
        ? "Choose a different second PDF"
        : pdfSplitState.secondaryDirectLink
          ? "Restore split PDF view"
          : "Open split PDF view"
    );
    button.title = enabled
      ? "Change PDF B"
      : pdfSplitState.secondaryDirectLink
        ? "Restore split PDF view"
        : "Split PDF view";
  }

  if (buttonLabel) {
    buttonLabel.textContent = enabled
      ? "CHANGE"
      : pdfSplitState.secondaryDirectLink
        ? "RESTORE"
        : "SPLIT";
  }

  container?.classList.toggle("is-split-open", enabled);
  if (primaryHeader) primaryHeader.hidden = !enabled;
  if (divider) divider.hidden = !enabled;
  if (secondaryPane) secondaryPane.hidden = !enabled;
  document.body?.classList.toggle("pdf-split-view-open", enabled);

  updatePdfSplitPaneLabels();
  if (enabled) requestAnimationFrame(applyPdfSplitRatio);
  return enabled;
}

function renderPdfLibraryNavigation() {
  const previousButton = getDomElement("pdf-library-previous");
  const nextButton = getDomElement("pdf-library-next");
  const libraryButton = getDomElement("pdf-library-toggle");
  const libraryCount = getDomElement("pdf-library-count");
  const drawerList = getDomElement("pdf-library-list");
  const drawerHeading = getDomElement("pdf-library-heading");
  const index = getCurrentPdfLibraryIndex();
  const hasLibrary = currentPdfLibraryItems.length > 1 && index >= 0;

  [previousButton, nextButton, libraryButton].forEach(button => {
    if (button) button.hidden = !hasLibrary;
  });

  if (previousButton) previousButton.disabled = !hasLibrary || index <= 0;
  if (nextButton) nextButton.disabled = !hasLibrary || index >= currentPdfLibraryItems.length - 1;
  if (libraryCount) libraryCount.textContent = hasLibrary ? `${index + 1}/${currentPdfLibraryItems.length}` : "";
  renderPdfSplitControls();

  if (!drawerList) return;

  if (!hasLibrary) {
    drawerList.innerHTML = "";
    closePdfLibraryDrawer({ cancelSplitSelection: true, rerender: false });
    return;
  }

  if (drawerHeading) {
    drawerHeading.textContent = pdfSplitState.selectingSecondary
      ? "Choose second PDF"
      : "PDF Library";
  }

  let currentSubjectKey = "";
  drawerList.innerHTML = currentPdfLibraryItems.map((resource, itemIndex) => {
    const subjectHeading = resource.subjectKey !== currentSubjectKey
      ? `<h4 class="pdf-library-subject-heading">${escapeHtml(resource.subjectName || "Subject")}</h4>`
      : "";

    currentSubjectKey = resource.subjectKey;
    const isPrimary = resource.id === currentPdfResourceId;
    const isSecondary = resource.id === pdfSplitState.secondaryResourceId;
    const isActive = pdfSplitState.selectingSecondary ? isSecondary : isPrimary;
    const disablePrimary = pdfSplitState.selectingSecondary && isPrimary;
    const paneBadge = isPrimary
      ? '<span class="pdf-library-item-pane-badge">A</span>'
      : isSecondary
        ? '<span class="pdf-library-item-pane-badge">B</span>'
        : "";

    return `${subjectHeading}
      <button
        type="button"
        class="pdf-library-item${isActive ? " is-active" : ""}"
        data-pdf-library-resource-id="${escapeForAttribute(resource.id)}"
        aria-current="${isActive ? "true" : "false"}"
        ${disablePrimary ? 'disabled aria-label="Already open as PDF A"' : ""}
      >
        <span class="pdf-library-item-number">${itemIndex + 1}</span>
        <span class="pdf-library-item-title">${escapeHtml(resource.title)}</span>
        ${paneBadge}
      </button>`;
  }).join("");
}

async function loadPrimaryPdfResource(resource) {
  if (!resource) return false;

  try {
    const accessLink = await resolveLibraryResourceLink(resource);
    const viewerUrl = getPdfViewerUrl(accessLink);
    const viewerFrame = getDomElement("pdf-viewer-frame");
    if (!viewerUrl || !viewerFrame) return false;

    currentPdfResourceId = resource.id;
    currentPdfDirectLink = accessLink;
    currentPdfTitle = resource.title || "PDF Viewer";
    window.M4LTeachingPanel?.prepareForPdf?.({
      resourceId: resource.id,
      title: currentPdfTitle
    });
    setDomText("pdf-viewer-title", currentPdfTitle);
    viewerFrame.src = viewerUrl;
    updatePdfSplitPaneLabels();
    renderPdfLibraryNavigation();
    closePdfLibraryDrawer({ cancelSplitSelection: false, rerender: false });
    return true;
  } catch (error) {
    alert(error.message || "Unable to open this PDF.");
    return false;
  }
}

async function loadSecondaryPdfResource(resource) {
  if (!resource || !isPdfLibraryResource(resource) || !canUsePdfSplitView()) return false;

  try {
    const accessLink = await resolveLibraryResourceLink(resource);
    const viewerUrl = getPdfViewerUrl(accessLink);
    const viewerFrame = getDomElement("pdf-viewer-frame-secondary");
    if (!viewerUrl || !viewerFrame) return false;

    window.M4LTeachingPanel?.close?.();
    pdfSplitState.secondaryResourceId = resource.id;
    pdfSplitState.secondaryDirectLink = accessLink;
    pdfSplitState.secondaryTitle = resource.title || "PDF B";
    pdfSplitState.selectingSecondary = false;
    pdfSplitState.enabled = true;
    viewerFrame.src = viewerUrl;

    closePdfLibraryDrawer({ cancelSplitSelection: false, rerender: false });
    renderPdfLibraryNavigation();
    return true;
  } catch (error) {
    alert(error.message || "Unable to open the second PDF.");
    return false;
  }
}

async function openPdfLibraryResource(resourceId) {
  const resource = libraryResourceMap.get(String(resourceId || ""));
  if (!resource || !isPdfLibraryResource(resource)) return false;

  if (pdfSplitState.selectingSecondary) {
    return loadSecondaryPdfResource(resource);
  }

  return loadPrimaryPdfResource(resource);
}

async function stepPdfLibrary(direction) {
  const index = getCurrentPdfLibraryIndex();
  const nextIndex = index + Number(direction || 0);
  if (index < 0 || nextIndex < 0 || nextIndex >= currentPdfLibraryItems.length) return false;
  return openPdfLibraryResource(currentPdfLibraryItems[nextIndex].id);
}

function openPdfLibraryDrawer() {
  const drawer = getDomElement("pdf-library-drawer");
  const toggle = getDomElement("pdf-library-toggle");
  if (!drawer) return false;
  drawer.hidden = false;
  if (toggle) toggle.setAttribute("aria-expanded", "true");
  const activeItem = drawer.querySelector(".pdf-library-item.is-active");
  if (activeItem) activeItem.scrollIntoView({ block: "nearest" });
  return true;
}

function togglePdfLibraryDrawer() {
  const drawer = getDomElement("pdf-library-drawer");
  if (!drawer || drawer.hidden === false) {
    closePdfLibraryDrawer();
    return false;
  }

  pdfSplitState.selectingSecondary = false;
  renderPdfLibraryNavigation();
  return openPdfLibraryDrawer();
}

function closePdfLibraryDrawer(options = {}) {
  const drawer = getDomElement("pdf-library-drawer");
  const toggle = getDomElement("pdf-library-toggle");
  const cancelSplitSelection = options.cancelSplitSelection !== false;
  const shouldRerender = options.rerender !== false;

  if (drawer) drawer.hidden = true;
  if (toggle) toggle.setAttribute("aria-expanded", "false");

  if (cancelSplitSelection && pdfSplitState.selectingSecondary) {
    pdfSplitState.selectingSecondary = false;
    if (shouldRerender) renderPdfLibraryNavigation();
  }
}

function chooseSecondaryPdf() {
  if (!canUsePdfSplitView()) return false;
  window.M4LTeachingPanel?.close?.();
  pdfSplitState.selectingSecondary = true;
  renderPdfLibraryNavigation();
  return openPdfLibraryDrawer();
}

function togglePdfSplitView() {
  if (!canUsePdfSplitView()) return false;

  if (pdfSplitState.enabled) {
    return chooseSecondaryPdf();
  }

  if (pdfSplitState.secondaryDirectLink) {
    window.M4LTeachingPanel?.close?.();
    pdfSplitState.enabled = true;
    pdfSplitState.selectingSecondary = false;
    renderPdfLibraryNavigation();
    return true;
  }

  return chooseSecondaryPdf();
}

function closePdfSplitView(options = {}) {
  const preserveSecondary = options.preserveSecondary === true;
  const viewerFrame = getDomElement("pdf-viewer-frame-secondary");

  pdfSplitState.enabled = false;
  pdfSplitState.selectingSecondary = false;

  if (!preserveSecondary) {
    pdfSplitState.secondaryResourceId = "";
    pdfSplitState.secondaryDirectLink = "";
    pdfSplitState.secondaryTitle = "";
    if (viewerFrame) {
      viewerFrame.src = "";
      viewerFrame.removeAttribute("src");
    }
  }

  closePdfLibraryDrawer({ cancelSplitSelection: false, rerender: false });
  renderPdfLibraryNavigation();
  return true;
}

function suspendPdfSplitForTeachingPanel() {
  if (!pdfSplitState.enabled && !pdfSplitState.selectingSecondary) return false;
  return closePdfSplitView({ preserveSecondary: true });
}

function resetPdfSplitView(options = {}) {
  const clearSecondary = options.clearSecondary !== false;
  const viewerFrame = getDomElement("pdf-viewer-frame-secondary");
  pdfSplitState.enabled = false;
  pdfSplitState.selectingSecondary = false;
  pdfSplitState.primaryRatio = 0.5;

  if (clearSecondary) {
    pdfSplitState.secondaryResourceId = "";
    pdfSplitState.secondaryDirectLink = "";
    pdfSplitState.secondaryTitle = "";
    if (viewerFrame) {
      viewerFrame.src = "";
      viewerFrame.removeAttribute("src");
    }
  }

  const container = getDomElement("m4l-pdf-split-container");
  container?.style.removeProperty("--m4l-pdf-primary-width");
  renderPdfSplitControls();
  return true;
}

function openSecondaryPdfDirect() {
  return safeOpenExternalLink(pdfSplitState.secondaryDirectLink);
}

function bindPdfSplitDivider() {
  const divider = getDomElement("m4l-pdf-split-divider");
  const container = getDomElement("m4l-pdf-split-container");
  if (!divider || !container || divider.dataset.pdfSplitBound === "true") return false;
  divider.dataset.pdfSplitBound = "true";

  const updateFromClientX = clientX => {
    const rect = container.getBoundingClientRect();
    const dividerWidth = divider.offsetWidth || 10;
    const availableWidth = Math.max(1, rect.width - dividerWidth);
    const minPaneWidth = Math.min(320, Math.floor(availableWidth / 2));
    const rawWidth = Number(clientX) - rect.left;
    const width = Math.max(minPaneWidth, Math.min(availableWidth - minPaneWidth, rawWidth));
    pdfSplitState.primaryRatio = width / availableWidth;
    applyPdfSplitRatio();
  };

  divider.addEventListener("pointerdown", event => {
    if (!pdfSplitState.enabled || !isPdfSplitLargeScreen()) return;
    event.preventDefault();
    divider.setPointerCapture?.(event.pointerId);

    const move = moveEvent => updateFromClientX(moveEvent.clientX);
    const stop = stopEvent => {
      divider.releasePointerCapture?.(stopEvent.pointerId);
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", stop);
      divider.removeEventListener("pointercancel", stop);
    };

    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", stop);
    divider.addEventListener("pointercancel", stop);
  });

  divider.addEventListener("keydown", event => {
    if (!pdfSplitState.enabled || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    pdfSplitState.primaryRatio += event.key === "ArrowLeft" ? -0.025 : 0.025;
    applyPdfSplitRatio();
  });

  divider.addEventListener("dblclick", () => {
    pdfSplitState.primaryRatio = 0.5;
    applyPdfSplitRatio();
  });
  return true;
}

function bindPdfSplitResize() {
  if (typeof window === "undefined" || document.body?.dataset.pdfSplitResizeBound === "true") return false;
  if (document.body) document.body.dataset.pdfSplitResizeBound = "true";

  window.addEventListener("resize", () => {
    if (!isPdfSplitLargeScreen() && (pdfSplitState.enabled || pdfSplitState.selectingSecondary)) {
      closePdfSplitView({ preserveSecondary: true });
      return;
    }
    renderPdfSplitControls();
    if (pdfSplitState.enabled) requestAnimationFrame(applyPdfSplitRatio);
  });
  return true;
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
  window.M4LTeachingPanel?.close?.({ reset: true });
  resetPdfSplitView({ clearSecondary: true });
  const viewerFrame = getDomElement("pdf-viewer-frame");

  if (viewerFrame) {
    viewerFrame.src = "";
    viewerFrame.removeAttribute("src");
  }

  currentPdfDirectLink = "";
  currentPdfResourceId = "";
  currentPdfTitle = "";
  currentPdfLibraryItems = [];
  closePdfLibraryDrawer();
  renderPdfLibraryNavigation();

  if (document.body) {
    document.body.classList.remove("pdf-viewer-open");
  }

  if (previousPdfScreenId && getDomElement(previousPdfScreenId)) {
    showScreen(previousPdfScreenId);
    previousPdfScreenId = "";
    return true;
  }

  previousPdfScreenId = "";
  goHome();
  return true;
}

function openCurrentPdfDirect() {
  return safeOpenExternalLink(currentPdfDirectLink);
}

function bindMediaViewerHandlers() {
  if (!document || typeof document.addEventListener !== "function") {
    return false;
  }

  if (document.body && document.body.dataset.mediaViewerHandlersBound === "true") {
    return true;
  }

  if (document.body) {
    document.body.dataset.mediaViewerHandlersBound = "true";
  }

  bindPdfSplitDivider();
  bindPdfSplitResize();
  renderPdfSplitControls();

  document.addEventListener("click", event => {
    const libraryItem = event.target && event.target.closest
      ? event.target.closest("[data-pdf-library-resource-id]")
      : null;

    if (libraryItem) {
      event.preventDefault();
      openPdfLibraryResource(libraryItem.dataset.pdfLibraryResourceId || "");
      return;
    }

    const actionButton = event.target && event.target.closest
      ? event.target.closest("[data-media-viewer-action]")
      : null;

    if (!actionButton || actionButton.disabled) {
      return;
    }

    const action = actionButton.getAttribute("data-media-viewer-action") || "";

    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action === "close-pdf") {
      closePdfViewer();
      return;
    }

    if (action === "open-pdf-direct") {
      openCurrentPdfDirect();
    }
  });

  return true;
}

function isPdfLink(link) {
  return /\.pdf($|[?#])/i.test(String(link || ""));
}

function getDisplayResourceType(type) {
  return getLibraryResourceTypeLabel(type).toUpperCase();
}

function getSortedResourceSubjects(subjects = studentResourceSubjects) {
  return [...(Array.isArray(subjects) ? subjects : [])].sort((a, b) => {
    const idA = getResourceSubjectId(a);
    const idB = getResourceSubjectId(b);

    if (idA || idB) {
      return compareResourceIds(idA, idB);
    }

    return String(getResourceSubjectName(a) || "").localeCompare(String(getResourceSubjectName(b) || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });
}

/* V83_LEGACY_QUARANTINE_START: getTaskGroups
   V83.1 reason: helper used only by the quarantined legacy subject/task collector.
   Original implementation preserved for rollback.

function getTaskGroups(subject) {
  if (!subject || !Array.isArray(subject.tasks)) return [];

  return [...subject.tasks].sort((a, b) => {
    if (typeof sortByTaskId === "function") {
      return sortByTaskId(a, b);
    }

    return compareResourceIds(a && (a.taskid || a.TaskID), b && (b.taskid || b.TaskID));
  });
}
V83_LEGACY_QUARANTINE_END: getTaskGroups */

function getTaskGroups(subject) {
  console.warn("V83.1 legacy task group reader is quarantined.", subject);
  return [];
}

/* V83_LEGACY_QUARANTINE_START: getSubjectResourceArray
   V83.1 reason: helper used only by the quarantined legacy subject-level resource collector.
   Original implementation preserved for rollback.

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
V83_LEGACY_QUARANTINE_END: getSubjectResourceArray */

function getSubjectResourceArray(subject) {
  console.warn("V83.1 legacy subject resource array reader is quarantined.", subject);
  return [];
}

/* V83_LEGACY_QUARANTINE_START: getTaskResourceArray
   V83.1 reason: helper used only by the quarantined legacy task-level resource collector.
   Original implementation preserved for rollback.

function getTaskResourceArray(task) {
  if (!task) return [];

  if (Array.isArray(task.resources)) return task.resources;
  if (Array.isArray(task.taskResources)) return task.taskResources;
  if (Array.isArray(task.taskresources)) return task.taskresources;
  if (Array.isArray(task.task_resources)) return task.task_resources;
  if (Array.isArray(task.TaskResources)) return task.TaskResources;

  return [];
}
V83_LEGACY_QUARANTINE_END: getTaskResourceArray */

function getTaskResourceArray(task) {
  console.warn("V83.1 legacy task resource array reader is quarantined.", task);
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
  return normalizeLibraryResourceType(
    resource && (resource.type || resource.resourcetype || resource.resourceType),
    fallbackType || "OTHER"
  );
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

function makeDomSafeId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

window.M4LResources = {
  showStudentResources: typeof showStudentResources === "function" ? showStudentResources : undefined,
  showAdminResources: typeof showAdminResources === "function" ? showAdminResources : undefined,
  loadResourceCategories: typeof loadResourceCategories === "function" ? loadResourceCategories : undefined,
  openStudentResourceDirect: typeof openStudentResourceDirect === "function" ? openStudentResourceDirect : undefined,
  openLibraryResourceById: typeof openLibraryResourceById === "function" ? openLibraryResourceById : undefined,
  bindResourceUiHandlers: typeof bindResourceUiHandlers === "function" ? bindResourceUiHandlers : undefined,
  bindMediaViewerHandlers: typeof bindMediaViewerHandlers === "function" ? bindMediaViewerHandlers : undefined,
  clearInlineResourcePreviews: typeof clearInlineResourcePreviews === "function" ? clearInlineResourcePreviews : undefined,
  toggleInlineResourcePreview: typeof toggleInlineResourcePreview === "function" ? toggleInlineResourcePreview : undefined,
  toggleInlineAudioPlayer: typeof toggleInlineAudioPlayer === "function" ? toggleInlineAudioPlayer : undefined,
  openStudentResourceLink: typeof openStudentResourceLink === "function" ? openStudentResourceLink : undefined,
  openPdfResource: typeof openPdfResource === "function" ? openPdfResource : undefined,
  closePdfViewer: typeof closePdfViewer === "function" ? closePdfViewer : undefined,
  openCurrentPdfDirect: typeof openCurrentPdfDirect === "function" ? openCurrentPdfDirect : undefined,
  openPdfLibraryResource: typeof openPdfLibraryResource === "function" ? openPdfLibraryResource : undefined,
  stepPdfLibrary: typeof stepPdfLibrary === "function" ? stepPdfLibrary : undefined,
  togglePdfLibraryDrawer: typeof togglePdfLibraryDrawer === "function" ? togglePdfLibraryDrawer : undefined,
  closePdfLibraryDrawer: typeof closePdfLibraryDrawer === "function" ? closePdfLibraryDrawer : undefined,
  togglePdfSplitView: typeof togglePdfSplitView === "function" ? togglePdfSplitView : undefined,
  chooseSecondaryPdf: typeof chooseSecondaryPdf === "function" ? chooseSecondaryPdf : undefined,
  closePdfSplitView: typeof closePdfSplitView === "function" ? closePdfSplitView : undefined,
  openSecondaryPdfDirect: typeof openSecondaryPdfDirect === "function" ? openSecondaryPdfDirect : undefined,
  getResourceName: typeof getResourceName === "function" ? getResourceName : undefined,
  getResourceType: typeof getResourceType === "function" ? getResourceType : undefined,
  getResourceFormat: typeof getResourceFormat === "function" ? getResourceFormat : undefined,
  getResourceLink: typeof getResourceLink === "function" ? getResourceLink : undefined,
  invalidateCache: typeof invalidateLibraryResourceCache === "function" ? invalidateLibraryResourceCache : undefined
};

window.M4LPdfSplitView = Object.freeze({
  canUse: canUsePdfSplitView,
  toggle: togglePdfSplitView,
  chooseSecondary: chooseSecondaryPdf,
  close: closePdfSplitView,
  suspendForTeachingPanel: suspendPdfSplitForTeachingPanel,
  reset: resetPdfSplitView,
  isOpen: () => pdfSplitState.enabled
});
