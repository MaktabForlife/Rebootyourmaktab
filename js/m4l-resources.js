/* M4L v65.4.1 - Library / Resources ribbon module
   Load after /app.js, /js/m4l-auth.js, /js/m4l-shell.js, and /js/m4l-timetable.js.
   This is a classic script, not type=module, so existing global function calls remain safe.
   Owns the Library resource ribbons plus PDF/audio/video resource viewing.
*/

/* =========================
   LIBRARY RESOURCE VIEW
========================= */

let studentResourceSubjects = [];
let studentResourceGroupsByType = {};
let libraryResourceSubjects = [];
let libraryResourceMap = new Map();
let libraryResourceSequence = 0;
let studentResourceViewMode = "student";

const PDFJS_VIEWER_PATH = "/pdf-viewer/web/viewer.html";

let previousPdfScreenId = "";
let currentPdfDirectLink = "";

const LIBRARY_RESOURCE_TYPES = [
  {
    key: "VIDEO",
    label: "Video",
    icon: "/icons/video.svg",
    className: "video"
  },
  {
    key: "EBOOK",
    label: "eBook",
    icon: "/icons/ebook.svg",
    className: "ebook"
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
  closeStudentResourceModulePicker();
}

async function showStudentResources() {
  studentResourceViewMode = "student";
  setResourceScreensForStudent();
  await loadResourceCategories("/api/resources/list", {});
}

async function showAdminResources() {
  studentResourceViewMode = "admin";
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

  removeLibraryHeaderActionButton();

  const mediaBackButton = document.querySelector("#student-resources-media .small-btn");
  setBackIconButton(mediaBackButton, "showScreen('student-resources-subjects')");

  const moduleBackButton = document.querySelector("#student-resources-modules .small-btn");
  setBackIconButton(moduleBackButton, "showScreen('student-resources-subjects')");

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
  if (listTitle) listTitle.innerText = "Library";

  removeLibraryHeaderActionButton();

  const mediaBackButton = document.querySelector("#student-resources-media .small-btn");
  setBackIconButton(mediaBackButton, "showScreen('student-resources-subjects')");

  const moduleBackButton = document.querySelector("#student-resources-modules .small-btn");
  setBackIconButton(moduleBackButton, "showScreen('student-resources-subjects')");

  const detailBackButton = document.querySelector("#student-resources-detail .small-btn");
  setBackIconButton(detailBackButton, "goBackFromStudentResourceDetail()");
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

  if (!result.success) {
    throw new Error(result.error || "Failed to load resources");
  }

  studentResourceSubjects = Array.isArray(result.subjects) ? result.subjects : [];
  studentResourceGroupsByType = normalizeStudentResourceGroups(result);
  libraryResourceSubjects = buildLibraryResourceSubjects(result);

  return result;
}

async function loadResourceCategories(apiPath, body = {}) {
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
  setDomHtml(container, `<p class="helper-text">Loading resources...</p>`);

  try {
    resetStudentResourceSelection();
    await fetchResourceCategories(apiPath, body);
    renderStudentResourceSubjects();
  } catch (err) {
    setDomHtml(container, `<p class="error-message">${escapeHtml(err.message || "Unable to load resources. Please try again.")}</p>`);
  }
}

// Compatibility wrapper for older callers. V65 always opens the full direct-resource Library.
async function openStudentResourceDirect() {
  if (studentResourceViewMode === "admin") {
    await showAdminResources();
    return;
  }

  await showStudentResources();
}

function normalizeStudentResourceGroups(result) {
  const map = {};

  function addGroup(group, fallbackType) {
    if (!group) return;

    const type = normalizeLibraryResourceType(group.type || group.key || fallbackType || "");
    if (!type) return;

    const subjects = Array.isArray(group.subjects) ? group.subjects : [];

    map[type] = {
      type,
      label: getLibraryResourceTypeLabel(type),
      count: Number(group.count || 0),
      subjects
    };
  }

  if (Array.isArray(result.groups)) {
    result.groups.forEach(group => addGroup(group));
  }

  addGroup(result.video, "VIDEO");
  addGroup(result.audio, "AUDIO");
  addGroup(result.ebooks, "EBOOK");
  addGroup(result.ebook, "EBOOK");
  addGroup(result.pdf, "EBOOK");
  addGroup(result.printables, "PRINTABLE");
  addGroup(result.printable, "PRINTABLE");
  addGroup(result.other, "OTHER");

  Object.keys(map).forEach(type => {
    const calculatedCount = countResourcesInSubjects(map[type].subjects);

    if (!map[type].count && calculatedCount) {
      map[type].count = calculatedCount;
    }
  });

  return map;
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
  const subjectKey = subjectId ? `id:${subjectId.toUpperCase()}` : `name:${subjectName.toUpperCase()}`;
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
    format: getResourceFormat(resource, type),
    subjectKey,
    subjectName,
    moduleKey,
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

function buildLegacyModuleGroup(resource, task, fallbackName) {
  return {
    moduleid: getResourceModuleId(resource) || getResourceModuleId(task),
    modulename: getResourceModuleName(resource) || getResourceModuleName(task) || fallbackName || "General",
    modulesortorder: Math.min(getResourceModuleSortOrder(resource), getResourceModuleSortOrder(task))
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

  setDomHtml(container, `
    <div class="library-resource-browser" aria-label="Library resources">
      ${libraryResourceSubjects.map(subject => {
        return subject.modules.map(module => renderLibraryModuleSection(subject, module)).join("");
      }).join("")}
    </div>
  `);
}

function renderLibraryModuleSection(subject, module) {
  const rowTitle = getLibraryModuleRowTitle(subject, module);
  const displayResources = getLibraryModuleDisplayResources(module.resources);
  const rowClass = module.resources.length < 3
    ? "library-resource-row library-resource-row--loop-fill"
    : "library-resource-row";

  return `
    <section class="library-module-section" aria-labelledby="${escapeForAttribute(module.headingId)}">
      <h3 id="${escapeForAttribute(module.headingId)}" class="library-module-title">${escapeHtml(rowTitle)}</h3>
      <div class="${rowClass}" role="list" aria-label="${escapeForAttribute(`${rowTitle} resources`)}">
        ${displayResources.map(item => renderLibraryResourceCard(item.resource, { isClone: item.isClone })).join("")}
      </div>
      <div id="${escapeForAttribute(module.previewId)}" class="library-inline-preview hidden" aria-live="polite"></div>
    </section>
  `;
}

function getLibraryModuleDisplayResources(resources) {
  const safeResources = Array.isArray(resources) ? resources : [];

  if (safeResources.length === 0) {
    return [];
  }

  if (safeResources.length >= 3) {
    return safeResources.map(resource => ({ resource, isClone: false }));
  }

  const targetCount = safeResources.length === 1 ? 6 : 6;
  const displayResources = [];

  while (displayResources.length < targetCount) {
    safeResources.forEach(resource => {
      if (displayResources.length < targetCount) {
        displayResources.push({
          resource,
          isClone: displayResources.length >= safeResources.length
        });
      }
    });
  }

  return displayResources;
}

function renderLibraryResourceCard(resource, options = {}) {
  const cardClass = getLibraryResourceCardClassName(resource, options);
  const cloneAttribute = options.isClone ? ' data-library-card-clone="true"' : "";

  return `
    <button
      type="button"
      class="${escapeForAttribute(cardClass)}"
      data-resource-id="${escapeForAttribute(resource.id)}"
      data-resource-preview-id="${escapeForAttribute(resource.previewId)}"${cloneAttribute}
      aria-label="${escapeForAttribute(`${resource.typeLabel} resource: ${resource.title}`)}"
    >
      <span class="library-resource-icon-wrap">
        <span
          class="library-resource-icon"
          style="--library-resource-icon-url: url('${escapeForAttribute(resource.icon)}')"
          aria-hidden="true"
        ></span>
        <span class="library-resource-type-label">${escapeHtml(resource.typeLabel)}</span>
      </span>
      <span class="library-resource-title">${escapeHtml(resource.title)}</span>
    </button>
  `;
}

function getLibraryResourceCardClassName(resource, options = {}) {
  const classes = ["library-resource-card", `type-${resource.typeClass}`];

  if (isPartVideoResource(resource)) {
    classes.push("library-resource-card--part-video");
  }

  if (options.isClone) {
    classes.push("library-resource-card--clone");
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

function openLibraryResourceById(resourceId) {
  const resource = libraryResourceMap.get(String(resourceId || ""));

  if (!resource) {
    alert("Resource not found. Please reload the Library.");
    return false;
  }

  if (!resource.link) {
    alert("This resource does not have a link yet.");
    return false;
  }

  if (resource.type === "AUDIO" || resource.type === "VIDEO") {
    return openInlineResourcePreview(resource.previewId, resource.id, resource.link, resource.type, resource.title);
  }

  return openStudentResourceLink(resource.link, resource.type, resource.title);
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

function openStudentResourceSubject() {
  renderStudentResourceSubjects();
  showScreen("student-resources-subjects");
}

function openStudentResourceCategory() {
  renderStudentResourceSubjects();
  showScreen("student-resources-subjects");
}

function openStudentResourceModule() {
  renderStudentResourceSubjects();
  showScreen("student-resources-subjects");
}

function goBackFromStudentResourceDetail() {
  closeStudentResourceModulePicker();
  showScreen("student-resources-subjects");
}

function countResourcesInSubjects(subjects) {
  if (!Array.isArray(subjects)) return 0;

  return subjects.reduce((subjectTotal, subject) => {
    const moduleTotal = getSubjectModules(subject).reduce((sum, module) => {
      return sum + getModuleResources(module).filter(resource => getResourceLink(resource)).length;
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

function compareLibrarySubjectGroups(a, b) {
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

  document.querySelectorAll(".library-inline-preview, .inline-resource-preview, .inline-audio-player").forEach(player => {
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

function toggleInlineResourcePreview(playerId, link, type) {
  return openInlineResourcePreview(playerId, `${playerId}-${link}`, link, type, getLibraryResourceTypeLabel(type));
}

function toggleInlineAudioPlayer(playerId, link) {
  return toggleInlineResourcePreview(playerId, link, "AUDIO");
}

function openStudentResourceLink(link, type, title = "PDF Viewer") {
  const cleanLink = String(link || "").trim();

  if (!cleanLink) {
    return false;
  }

  const resourceType = normalizeLibraryResourceType(type);

  if (resourceType === "EBOOK" || resourceType === "PRINTABLE" || isPdfLink(cleanLink)) {
    return openPdfResource(cleanLink, title || "PDF Viewer");
  }

  return safeOpenExternalLink(cleanLink);
}

function getPdfViewerFileParam(link) {
  const cleanLink = String(link || "").trim();

  if (!cleanLink) {
    return "";
  }

  if (cleanLink.startsWith("http://") || cleanLink.startsWith("https://")) {
    return `/pdf-file/${base64UrlEncode(cleanLink)}`;
  }

  return cleanLink;
}

function openPdfResource(link, title = "PDF Viewer") {
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
  currentPdfDirectLink = cleanLink;

  viewerScreen.classList.remove("student-theme", "admin-theme");
  if (activeScreen && activeScreen.classList && activeScreen.classList.contains("admin-theme")) {
    viewerScreen.classList.add("admin-theme");
  } else {
    viewerScreen.classList.add("student-theme");
  }

  setDomText("pdf-viewer-title", title || "PDF Viewer");

  const pdfFileForViewer = getPdfViewerFileParam(cleanLink);

  if (!pdfFileForViewer) {
    return safeOpenExternalLink(cleanLink);
  }

  clearInlineResourcePreviews();
  viewerFrame.src = `${PDFJS_VIEWER_PATH}?file=${pdfFileForViewer}`;

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
  const viewerFrame = getDomElement("pdf-viewer-frame");

  if (viewerFrame) {
    viewerFrame.src = "";
    viewerFrame.removeAttribute("src");
  }

  currentPdfDirectLink = "";

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

  document.addEventListener("click", event => {
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

function getSmallResourceButtonLabel(type) {
  const resourceType = normalizeLibraryResourceType(type);

  if (resourceType === "EBOOK") return "Open eBook";
  if (resourceType === "PRINTABLE") return "Open Printable";
  if (resourceType === "AUDIO") return "Play Audio";
  if (resourceType === "VIDEO") return "Watch Video";

  return "Open Resource";
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

function getTaskGroups(subject) {
  if (!subject || !Array.isArray(subject.tasks)) return [];

  return [...subject.tasks].sort((a, b) => {
    if (typeof sortByTaskId === "function") {
      return sortByTaskId(a, b);
    }

    return compareResourceIds(a && (a.taskid || a.TaskID), b && (b.taskid || b.TaskID));
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

function countResourcesForCategory(category) {
  if (!category) return 0;

  const type = normalizeLibraryResourceType(category.key || category.type || category);

  return libraryResourceSubjects.reduce((subjectTotal, subject) => {
    return subjectTotal + subject.modules.reduce((moduleTotal, module) => {
      return moduleTotal + module.resources.filter(resource => resource.type === type).length;
    }, 0);
  }, 0);
}

function countResourcesForSubject(subject) {
  const subjectResources = getSubjectResourceArray(subject).filter(resource => getResourceLink(resource)).length;

  const taskResources = Array.isArray(subject && subject.tasks)
    ? subject.tasks.reduce((sum, task) => {
        return sum + getTaskResourceArray(task).filter(resource => getResourceLink(resource)).length;
      }, 0)
    : 0;

  return subjectResources + taskResources;
}

window.M4LResources = {
  showStudentResources: typeof showStudentResources === "function" ? showStudentResources : undefined,
  showAdminResources: typeof showAdminResources === "function" ? showAdminResources : undefined,
  loadResourceCategories: typeof loadResourceCategories === "function" ? loadResourceCategories : undefined,
  openStudentResourceDirect: typeof openStudentResourceDirect === "function" ? openStudentResourceDirect : undefined,
  openLibraryResourceById: typeof openLibraryResourceById === "function" ? openLibraryResourceById : undefined,
  openStudentResourceSubject: typeof openStudentResourceSubject === "function" ? openStudentResourceSubject : undefined,
  openStudentResourceCategory: typeof openStudentResourceCategory === "function" ? openStudentResourceCategory : undefined,
  openStudentResourceModule: typeof openStudentResourceModule === "function" ? openStudentResourceModule : undefined,
  goBackFromStudentResourceDetail: typeof goBackFromStudentResourceDetail === "function" ? goBackFromStudentResourceDetail : undefined,
  closeStudentResourceModulePicker: typeof closeStudentResourceModulePicker === "function" ? closeStudentResourceModulePicker : undefined,
  bindResourceUiHandlers: typeof bindResourceUiHandlers === "function" ? bindResourceUiHandlers : undefined,
  bindMediaViewerHandlers: typeof bindMediaViewerHandlers === "function" ? bindMediaViewerHandlers : undefined,
  clearInlineResourcePreviews: typeof clearInlineResourcePreviews === "function" ? clearInlineResourcePreviews : undefined,
  toggleInlineResourcePreview: typeof toggleInlineResourcePreview === "function" ? toggleInlineResourcePreview : undefined,
  toggleInlineAudioPlayer: typeof toggleInlineAudioPlayer === "function" ? toggleInlineAudioPlayer : undefined,
  openStudentResourceLink: typeof openStudentResourceLink === "function" ? openStudentResourceLink : undefined,
  openPdfResource: typeof openPdfResource === "function" ? openPdfResource : undefined,
  closePdfViewer: typeof closePdfViewer === "function" ? closePdfViewer : undefined,
  openCurrentPdfDirect: typeof openCurrentPdfDirect === "function" ? openCurrentPdfDirect : undefined,
  getResourceName: typeof getResourceName === "function" ? getResourceName : undefined,
  getResourceType: typeof getResourceType === "function" ? getResourceType : undefined,
  getResourceFormat: typeof getResourceFormat === "function" ? getResourceFormat : undefined,
  getResourceLink: typeof getResourceLink === "function" ? getResourceLink : undefined
};
