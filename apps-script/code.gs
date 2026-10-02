/*
===============================================================================
MAKTABHELPER — GOOGLE DRIVE BRIDGE
Last updated: 2 October 2026
Library milestone: V105.4.1.2
===============================================================================

SOURCE OF TRUTH:
- This repository file is authoritative.
- Synchronize the complete file to the bound Apps Script project; do not
  maintain an independent dashboard copy.

V105.4.1.2 OWNERSHIP:
- All Google Sheets application reads and writes are owned by authenticated
  Cloudflare Worker routes and the M4L UI.
- Apps Script is retained for Weekly Planner PNG and Program Library uploads
  to the deploying account's Google Drive.
- The Weekly Planner reads WeeklyPlannerDriveFolderId and
  WeeklyPlannerDriveFolderLabel from the bound spreadsheet's SystemConfig sheet.
- The manual authorizeM4LServices check reads ProgramLibraryDriveFolderId from
  SystemConfig and verifies that the deploying account can add files there.
- Library uploads use the folder selected in the M4L UI and signed by the
  Worker. ProgramLibraryDriveFolderId is only for the manual access check.
- Apps Script does not administer Sheets data.

CALLABLE doPost ACTIONS:
- saveWeeklyPlannerPreviewToDrive
- startProgramLibraryUpload (signed Worker request only)

MANUAL DEPLOYMENT / AUTHORIZATION FUNCTION:
- authorizeM4LServices
  Run as the deploying Google account after adding or changing OAuth scopes.

Do not add Sheets administration, maintenance or compatibility actions back to
Apps Script. New Sheets features must be implemented through the UI and Worker.
===============================================================================
*/

const SYSTEM_CONFIG_SHEET_NAME = "SystemConfig";
const WEEKLY_PLANNER_DRIVE_FOLDER_ID_CONFIG_KEY = "WeeklyPlannerDriveFolderId";
const WEEKLY_PLANNER_DRIVE_FOLDER_LABEL_CONFIG_KEY = "WeeklyPlannerDriveFolderLabel";
const DEFAULT_WEEKLY_PLANNER_DRIVE_FOLDER_LABEL = "Weekly Planner";
const PROGRAM_LIBRARY_DRIVE_FOLDER_ID_CONFIG_KEY = "ProgramLibraryDriveFolderId";

/* =========================
   UI-MANAGED DRIVE CONFIGURATION
========================= */

function getSystemConfigValue_(key, required) {
  const configKey = String(key || "").trim();
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(SYSTEM_CONFIG_SHEET_NAME);

  if (!sheet) {
    throw new Error("SystemConfig sheet not found");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 1) {
    if (required) throw new Error("SystemConfig is empty");
    return "";
  }

  const rows = sheet.getRange(1, 1, lastRow, 2).getDisplayValues();
  const matches = rows.filter(function(row) {
    return String(row[0] || "").trim() === configKey;
  });

  if (matches.length > 1) {
    throw new Error("SystemConfig contains duplicate " + configKey + " rows");
  }

  const value = matches.length ? String(matches[0][1] || "").trim() : "";

  if (required && !value) {
    throw new Error(configKey + " is not configured in System Settings");
  }

  return value;
}

function getWeeklyPlannerDriveConfig_() {
  const folderId = getSystemConfigValue_(
    WEEKLY_PLANNER_DRIVE_FOLDER_ID_CONFIG_KEY,
    true
  );

  if (!/^[A-Za-z0-9_-]{10,128}$/.test(folderId)) {
    throw new Error("WeeklyPlannerDriveFolderId is invalid in System Settings");
  }

  const folderLabel = getSystemConfigValue_(
    WEEKLY_PLANNER_DRIVE_FOLDER_LABEL_CONFIG_KEY,
    false
  ) || DEFAULT_WEEKLY_PLANNER_DRIVE_FOLDER_LABEL;

  return {
    folderId: folderId,
    folderLabel: folderLabel,
    folderUrl: "https://drive.google.com/drive/folders/" + encodeURIComponent(folderId)
  };
}


/* =========================
   WEEKLY PLANNER PNG-TO-DRIVE BRIDGE
========================= */

function extractWeeklyPlannerPreviewBase64_(data) {
  const directBase64 = String(data.base64 || "").replace(/\s/g, "");

  if (directBase64) {
    return directBase64;
  }

  const dataUrl = String(data.dataUrl || "").trim();
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/);

  return match ? match[1].replace(/\s/g, "") : "";
}

function sanitizeWeeklyPlannerDriveFileName_(value) {
  let name = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!name) {
    return "";
  }

  if (!/\.png$/i.test(name)) {
    name += ".png";
  }

  return name.slice(0, 140);
}

function saveWeeklyPlannerPreviewToDrive(data) {
  data = data || {};

  const mimeType = String(data.mimeType || "image/png").trim();

  if (mimeType !== "image/png") {
    return { success: false, error: "Only PNG planner previews are supported" };
  }

  const fileName = sanitizeWeeklyPlannerDriveFileName_(data.fileName);

  if (!fileName) {
    return { success: false, error: "Missing fileName" };
  }

  const base64 = extractWeeklyPlannerPreviewBase64_(data);

  if (!base64) {
    return { success: false, error: "Missing preview image data" };
  }

  let driveConfig = {
    folderId: "",
    folderLabel: DEFAULT_WEEKLY_PLANNER_DRIVE_FOLDER_LABEL,
    folderUrl: ""
  };

  try {
    driveConfig = getWeeklyPlannerDriveConfig_();
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const folder = DriveApp.getFolderById(driveConfig.folderId);
    const file = folder.createFile(blob);

    return {
      success: true,
      message: "Weekly planner preview saved to Google Drive",
      fileName: file.getName(),
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      folderId: driveConfig.folderId,
      destinationLabel: driveConfig.folderLabel,
      destinationUrl: driveConfig.folderUrl,
      teacherName: String(data.teacherName || "").trim(),
      saveDate: String(data.saveDate || "").trim(),
      weekStart: String(data.weekStart || "").trim(),
      requestedBy: String(data.requestedBy || "").trim(),
      requestedByAdminId: String(data.requestedByAdminId || "").trim()
    };
  } catch (error) {
    console.error("Weekly planner Drive save failed", error);

    return {
      success: false,
      error: error && error.message
        ? error.message
        : "Unable to save Weekly Planner. Verify the configured Google Drive folder and Apps Script access.",
      destinationLabel: driveConfig.folderLabel,
      destinationUrl: driveConfig.folderUrl
    };
  }
}

/* The Worker validates the Program, folder and file before signing this request.
   The Apps Script token never leaves this deployment. */
function verifyProgramLibraryUploadRequest_(data) {
  const secret = PropertiesService.getScriptProperties().getProperty("M4L_LIBRARY_BRIDGE_SECRET") || "";
  if (secret.length < 32) throw new Error("Library upload secret is not configured in Apps Script");
  const payload = String(data && data.payload || "");
  const signature = String(data && data.signature || "");
  if (!/^[A-Za-z0-9_-]{20,2048}$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) throw new Error("Invalid Library upload request");
  const expected = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, "apps-script-library-start:" + secret)
  ).replace(/=+$/, "");
  let different = expected.length ^ signature.length;
  for (let i = 0; i < Math.max(expected.length, signature.length); i++) different |= (expected.charCodeAt(i) || 0) ^ (signature.charCodeAt(i) || 0);
  if (different) throw new Error("Invalid Library upload signature");
  const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
  const request = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString("UTF-8"));
  if (request.purpose !== "m4l-library-start" || !Number.isSafeInteger(request.issuedAt) || Math.abs(Date.now() - request.issuedAt) > 5 * 60 * 1000) throw new Error("Library upload request expired");
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(request.folderId || "") || !request.fileName || request.fileName.length > 160 || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(request.mimeType || "") || !Number.isSafeInteger(request.size) || request.size < 1 || request.size > 5 * 1024 * 1024 * 1024) throw new Error("Invalid Library upload details");
  return request;
}

function startProgramLibraryUpload(data) {
  const request = verifyProgramLibraryUploadRequest_(data);
  const folder = DriveApp.getFolderById(request.folderId);
  if (folder.isTrashed()) throw new Error("The selected Library folder is in Trash");
  const response = UrlFetchApp.fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,parents", {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    headers: {
      Authorization: "Bearer " + ScriptApp.getOAuthToken(),
      "X-Upload-Content-Type": request.mimeType,
      "X-Upload-Content-Length": String(request.size)
    },
    payload: JSON.stringify({name: request.fileName, mimeType: request.mimeType, parents: [request.folderId]}),
    followRedirects: false,
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("Google Drive could not start this upload (" + response.getResponseCode() + ")");
  const headers = response.getAllHeaders();
  const sessionUrl = String(headers.Location || headers.location || "");
  if (!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/.test(sessionUrl)) throw new Error("Google Drive did not return an upload session");
  return {success: true, sessionUrl: sessionUrl};
}

function authorizeM4LServices() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error("This Apps Script project is not bound to a Google Sheet");
  }

  const plannerConfig = getWeeklyPlannerDriveConfig_();
  const plannerFolder = DriveApp.getFolderById(plannerConfig.folderId);

  // This read-only check exercises the Drive API token used for uploads.
  const libraryFolderId = getSystemConfigValue_(
    PROGRAM_LIBRARY_DRIVE_FOLDER_ID_CONFIG_KEY,
    true
  );
  if (!/^[A-Za-z0-9_-]{10,128}$/.test(libraryFolderId)) {
    throw new Error("ProgramLibraryDriveFolderId is invalid in SystemConfig");
  }
  const libraryFolder = DriveApp.getFolderById(libraryFolderId);
  const libraryResponse = UrlFetchApp.fetch(
    "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(libraryFolderId) +
      "?fields=id,name,mimeType,trashed,capabilities(canAddChildren)",
    {
      method: "get",
      headers: {Authorization: "Bearer " + ScriptApp.getOAuthToken()},
      muteHttpExceptions: true
    }
  );
  if (libraryResponse.getResponseCode() !== 200) {
    let reason = "";
    try {
      const failure = JSON.parse(libraryResponse.getContentText());
      const rawReason = String((failure.error && failure.error.status) ||
        (failure.error && failure.error.errors && failure.error.errors[0] && failure.error.errors[0].reason) || "");
      if (/^[A-Za-z_]{3,60}$/.test(rawReason)) reason = "; " + rawReason;
    } catch (ignored) {}
    throw new Error("Library folder Drive API check failed (HTTP " + libraryResponse.getResponseCode() + reason + ")");
  }
  const libraryDetails = JSON.parse(libraryResponse.getContentText());
  if (libraryDetails.id !== libraryFolderId ||
      libraryDetails.mimeType !== "application/vnd.google-apps.folder" ||
      libraryDetails.trashed ||
      !libraryDetails.capabilities ||
      libraryDetails.capabilities.canAddChildren !== true) {
    throw new Error("The Apps Script account cannot add files to the configured Library folder");
  }

  const result = {
    success: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    plannerFolderId: plannerFolder.getId(),
    plannerFolderName: plannerFolder.getName(),
    libraryFolderId: libraryFolder.getId(),
    libraryFolderName: libraryFolder.getName(),
    libraryCanAddFiles: true
  };

  console.log(JSON.stringify(result));
  return result;
}

/* =========================
   WEB APP ENTRY POINTS
========================= */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === "saveWeeklyPlannerPreviewToDrive") {
      return jsonResponse(saveWeeklyPlannerPreviewToDrive(body.data));
    }
    if (body.action === "startProgramLibraryUpload") {
      return jsonResponse(startProgramLibraryUpload(body.data));
    }

    return jsonResponse({
      success: false,
      error: "Unknown action"
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err && err.message ? err.message : "Apps Script request failed"
    });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({
    status: "success",
    message: "Connected to M4L Google Drive bridge",
    milestone: "V105.4.1.2"
  });
}
