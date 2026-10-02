import { callAppsScript } from "../lib/apps-script.js";
import { getAuthUser } from "../lib/auth.js";
import { readGoogleSheetValues } from "../lib/google-sheets.js";
import { json } from "../lib/http.js";

const RESOURCE_SHEET_RANGE = "A:ZZ";

export const RESOURCE_TAB_DEFINITIONS = Object.freeze([
  resourceTab({
    sheetName: "eBooks",
    type: "EBOOKS",
    key: "ebooks",
    label: "eBooks",
    description: "Books and reading resources",
    idHeaders: ["eBookId", "eBookID", "EBookId", "EBookID", "ResourceID"],
    nameHeaders: ["eBookName", "EBookName", "ResourceName"],
    formatHeaders: ["eBookFormat", "ebookFormat", "EBookFormat", "Format"],
    descriptionHeaders: ["eBookDescription", "EBookDescription", "ResourceDescription", "Description"],
    linkHeaders: ["eBookLink", "EBookLink", "ResourceLink", "Link"]
  }),
  resourceTab({
    sheetName: "Printable",
    type: "PRINTABLES",
    key: "printables",
    label: "Printables",
    description: "Worksheets and printable files",
    idHeaders: ["PrintableId", "PrintableID", "ResourceID"],
    nameHeaders: ["PrintableName", "ResourceName"],
    formatHeaders: ["PrintableFormat", "Format"],
    descriptionHeaders: ["PrintableDescription", "PrintableDescrip", "ResourceDescription", "Description"],
    linkHeaders: ["PrintableLink", "ResourceLink", "Link"]
  }),
  resourceTab({
    sheetName: "Audio",
    type: "AUDIO",
    key: "audio",
    label: "Audio",
    description: "Listening resources",
    idHeaders: ["AudioId", "AudioID", "ResourceID"],
    nameHeaders: ["AudioName", "ResourceName"],
    formatHeaders: ["AudioFormat", "Format"],
    descriptionHeaders: ["AudioDescription", "ResourceDescription", "Description"],
    linkHeaders: ["AudioLink", "ResourceLink", "Link"]
  }),
  resourceTab({
    sheetName: "Video",
    type: "VIDEO",
    key: "video",
    label: "Video",
    description: "Movie and video resources",
    idHeaders: ["VideoId", "VideoID", "ResourceID"],
    nameHeaders: ["VideoName", "ResourceName"],
    formatHeaders: ["VideoFormat", "Format"],
    descriptionHeaders: ["VideoDescription", "ResourceDescription", "Description"],
    linkHeaders: ["VideoLink", "ResourceLink", "Link"]
  }),
  resourceTab({
    sheetName: "OtherResource",
    type: "OTHER",
    key: "other",
    label: "Other",
    description: "Images, links, text and other files",
    idHeaders: ["OtherResourceID", "OtherResourceId", "ResourceID"],
    nameHeaders: ["OtherResourceName", "ResourceName"],
    formatHeaders: ["OtherResourceFormat", "OtherResouceFormat", "OtherFormat", "ResourceFormat", "Format"],
    descriptionHeaders: ["OtherResourceDescription", "OtherResourceDescrip", "ResourceDescription", "Description"],
    linkHeaders: ["OtherResourceLink", "ResourceLink", "OtherLink", "Link"]
  })
]);

export async function getResourcesAppsScriptEndpoint(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const result = await callAppsScript(env, {
    action: "getStudentResources",
    data: {}
  });

  return json(result);
}

// Retained for modules that imported the original V96 route name.
export const getResourcesEndpoint = getResourcesAppsScriptEndpoint;

export async function getResourcesGoogleSheetsEndpoint(request, env) {
  const authUser = await getAuthUser(request, env);

  if (!authUser) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  return json(await readResourcesGoogleSheetsCatalogue(env, authUser));
}

export async function readResourcesGoogleSheetsCatalogue(env, authUser) {
  if (!authUser) {
    throw new Error("Authenticated Library user is required");
  }

  const sheets = {};

  await Promise.all(RESOURCE_TAB_DEFINITIONS.map(async config => {
    try {
      sheets[config.sheetName] = {
        rows: await readGoogleSheetValues(
          env,
          `${config.sheetName}!${RESOURCE_SHEET_RANGE}`
        )
      };
    } catch (error) {
      if (!isMissingResourceSheetError(error, config.sheetName)) {
        throw error;
      }

      sheets[config.sheetName] = { missing: true, rows: [] };
    }
  }));

  // V100.4: the current credential-bound account record is authoritative.
  // Students receive only resources for ALL/their current group, while Admin
  // users retain the complete Library catalogue.
  const options = authUser.type === "student"
    ? {
        studentid: authUser.studentid,
        classgroup: authUser.classgroup
      }
    : {};

  return buildResourcesResponse(sheets, options);
}

export function buildResourcesResponse(sheets = {}, options = {}) {
  const studentId = clean(options.studentid || options.studentId);
  const studentGroup = clean(options.classgroup || options.groupNo || options.group);
  const groups = [];
  const result = {
    success: true,
    studentid: studentId,
    classgroup: studentGroup,
    groups,
    count: 0
  };

  RESOURCE_TAB_DEFINITIONS.forEach(config => {
    const group = makeGroup(config);
    groups.push(group);
    result[config.key] = group;

    const sheet = sheets[config.sheetName];

    if (!sheet || sheet.missing) {
      group.warning = `Missing sheet: ${config.sheetName}`;
      return;
    }

    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];

    if (rows.length < 2) {
      return;
    }

    const headerMap = buildHeaderMap(rows[0]);
    const columns = {
      id: findColumn(headerMap, config.idHeaders),
      name: findColumn(headerMap, config.nameHeaders),
      subjectId: findColumn(headerMap, config.subjectIdHeaders),
      subjectName: findColumn(headerMap, config.subjectNameHeaders),
      moduleId: findColumn(headerMap, config.moduleIdHeaders),
      moduleName: findColumn(headerMap, config.moduleNameHeaders),
      taskId: findColumn(headerMap, config.taskIdHeaders),
      groupNo: findColumn(headerMap, config.groupNoHeaders),
      format: findColumn(headerMap, config.formatHeaders),
      description: findColumn(headerMap, config.descriptionHeaders),
      link: findColumn(headerMap, config.linkHeaders),
      active: findColumn(headerMap, config.activeHeaders),
      date: findColumn(headerMap, config.dateHeaders)
    };

    if (columns.name < 0 || columns.link < 0) {
      group.warning = `Missing required name or link column in sheet: ${config.sheetName}`;
      return;
    }

    const subjectMap = {};

    rows.slice(1).forEach(row => {
      const activeValue = columns.active >= 0 ? getCell(row, columns.active) : true;

      if (!isActive(activeValue)) {
        return;
      }

      const resourceName = clean(getCell(row, columns.name));
      const link = clean(getCell(row, columns.link));

      if (!resourceName || !link) {
        return;
      }

      const rowGroupNo = clean(getCell(row, columns.groupNo));

      if ((options.filterByGroup ?? Boolean(studentId || studentGroup)) && !groupMatches(rowGroupNo, studentGroup)) {
        return;
      }

      const subjectName = clean(getCell(row, columns.subjectName)) || "Unassigned Subject";
      const moduleName = clean(getCell(row, columns.moduleName)) || "General";
      const subjectKey = normalizeMatch(subjectName);
      const moduleKey = normalizeMatch(moduleName);

      if (!subjectMap[subjectKey]) {
        subjectMap[subjectKey] = {
          subjectid: clean(getCell(row, columns.subjectId)),
          subjectname: subjectName,
          modules: [],
          _moduleMap: {}
        };
      }

      const subject = subjectMap[subjectKey];

      if (!subject._moduleMap[moduleKey]) {
        subject._moduleMap[moduleKey] = {
          moduleid: clean(getCell(row, columns.moduleId)),
          modulename: moduleName,
          resources: []
        };
        subject.modules.push(subject._moduleMap[moduleKey]);
      }

      subject._moduleMap[moduleKey].resources.push({
        resourceid: clean(getCell(row, columns.id)),
        name: resourceName,
        resourcename: resourceName,
        type: config.type,
        label: config.label,
        subjectid: clean(getCell(row, columns.subjectId)),
        subjectname: subjectName,
        moduleid: clean(getCell(row, columns.moduleId)),
        modulename: moduleName,
        taskid: clean(getCell(row, columns.taskId)),
        groupno: rowGroupNo,
        format: clean(getCell(row, columns.format)),
        description: clean(getCell(row, columns.description)),
        link,
        date: clean(getCell(row, columns.date))
      });

      group.count += 1;
      result.count += 1;
    });

    group.subjects = Object.values(subjectMap).map(subject => {
      subject.modules.sort((a, b) => compareText(a.modulename, b.modulename));
      subject.modules.forEach(module => {
        module.resources.sort((a, b) => compareText(a.name, b.name));
      });
      delete subject._moduleMap;
      return subject;
    });
    group.subjects.sort((a, b) => compareText(a.subjectname, b.subjectname));
  });

  return result;
}

function resourceTab(config) {
  return Object.freeze({
    ...config,
    subjectIdHeaders: ["SubjectId", "SubjectID"],
    subjectNameHeaders: ["SubjectName", "Subject"],
    moduleIdHeaders: ["ModuleId", "ModuleID", "ModuletID"],
    moduleNameHeaders: ["ModuleName", "Module"],
    taskIdHeaders: ["TaskId", "TaskID"],
    groupNoHeaders: ["GroupNo", "Group", "ClassGroup", "classgroup"],
    activeHeaders: ["Active"],
    dateHeaders: ["Date", "CreatedDate"]
  });
}

function clean(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeMatch(value) {
  return clean(value).toLowerCase().replace(/\s+/g, "");
}

function isActive(value) {
  const text = clean(value).toUpperCase();
  return value === true || ["TRUE", "YES", "Y", "ACTIVE", "1"].includes(text);
}

function buildHeaderMap(headers) {
  return headers.reduce((map, header, index) => {
    const key = normalizeHeader(header);
    if (key) {
      map[key] = index;
    }
    return map;
  }, {});
}

function findColumn(headerMap, possibleHeaders) {
  for (const header of possibleHeaders) {
    const key = normalizeHeader(header);
    if (headerMap[key] !== undefined) {
      return headerMap[key];
    }
  }
  return -1;
}

function getCell(row, columnIndex) {
  return columnIndex >= 0 ? row[columnIndex] : "";
}

function compareText(a, b) {
  return clean(a).localeCompare(clean(b), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function groupMatches(rowGroup, studentGroup) {
  const rowValue = normalizeMatch(rowGroup);
  const studentValue = normalizeMatch(studentGroup);

  // V100.8: StudentRecords ClassGroup 0 is the student-side ALL-groups
  // designation. Resource rows still use the explicit ALL value when the
  // resource is intended for every student.
  return studentValue === "0" ||
    !rowValue ||
    rowValue === "all" ||
    rowValue === studentValue;
}

function makeGroup(config) {
  return {
    type: config.type,
    key: config.key,
    label: config.label,
    description: config.description,
    count: 0,
    subjects: []
  };
}

function isMissingResourceSheetError(error, sheetName) {
  const message = error && error.message ? error.message : String(error || "");
  return message.includes("Google Sheets API error 400:") &&
    message.includes("Unable to parse range") &&
    message.toLowerCase().includes(sheetName.toLowerCase());
}
