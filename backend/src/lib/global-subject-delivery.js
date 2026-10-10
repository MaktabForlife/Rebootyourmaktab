/* M4L V104.5 - Global subject delivery plus Course access and scheduling metadata. */

import {
  isActivePlatformValue,
  normalizePlatformIdentifier
} from "./platform-schema.js";
import {
  COURSE_SCHEDULE_MODE_EXPLICIT,
  normalizeCourseScheduleMode,
  parseCourseScheduleDefinition
} from "./global-course-scheduling.js";

export const GLOBAL_SUBJECT_ACCESS_MODELS = Object.freeze(["FREE", "SUBSCRIPTION"]);
export const GLOBAL_SUBJECT_RUN_STATUSES = Object.freeze(["INACTIVE", "UPCOMING", "CURRENT", "ENDED"]);
export const GLOBAL_SUBJECT_DELIVERY_STATUSES = Object.freeze(["CURRENT", "UPCOMING", "PAST", "NOT SCHEDULED"]);

const ACCESS_MODEL_SET = new Set(GLOBAL_SUBJECT_ACCESS_MODELS);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveGlobalSubjectAccessPolicy(policyRows, subjectId) {
  const requestedSubjectId = normalizePlatformIdentifier(subjectId);
  if (!requestedSubjectId) {
    return Object.freeze({
      subjectId: "",
      accessModel: "SUBSCRIPTION",
      configured: false,
      valid: false,
      reason: "MISSING_SUBJECT"
    });
  }

  const activeMatches = (Array.isArray(policyRows) ? policyRows : []).filter(row => (
    normalizePlatformIdentifier(row.SubjectID) === requestedSubjectId &&
    isActivePlatformValue(row.Active)
  ));

  if (activeMatches.length !== 1) {
    return Object.freeze({
      subjectId: requestedSubjectId,
      accessModel: "SUBSCRIPTION",
      configured: false,
      valid: false,
      reason: activeMatches.length === 0 ? "MISSING_OR_INACTIVE_POLICY" : "DUPLICATE_ACTIVE_POLICY"
    });
  }

  const accessModel = normalizePlatformIdentifier(activeMatches[0].AccessModel);
  if (!ACCESS_MODEL_SET.has(accessModel)) {
    return Object.freeze({
      subjectId: requestedSubjectId,
      accessModel: "SUBSCRIPTION",
      configured: true,
      valid: false,
      reason: "INVALID_ACCESS_MODEL"
    });
  }

  return Object.freeze({
    subjectId: requestedSubjectId,
    subjectPolicyId: String(activeMatches[0].SubjectPolicyID || "").trim(),
    accessModel,
    configured: true,
    valid: true,
    reason: ""
  });
}

export function globalSubjectAccessMatrixColumns(matrixRows) {
  return Array.isArray(matrixRows?._subjectColumns) ? [...matrixRows._subjectColumns] : [];
}

export function globalSubjectAccessMatrixColumn(matrixRows, subjectId) {
  const requested = normalizePlatformIdentifier(subjectId);
  if (!requested) return null;
  return globalSubjectAccessMatrixColumns(matrixRows).find(column => (
    normalizePlatformIdentifier(column.normalizedSubjectId || column.subjectId) === requested
  )) || null;
}

export function hasActiveGlobalSubjectSubscription(matrixRows, accountId, subjectId) {
  const requestedAccountId = normalizePlatformIdentifier(accountId);
  const requestedSubjectId = normalizePlatformIdentifier(subjectId);
  if (!requestedAccountId || !requestedSubjectId) return false;

  const matches = (Array.isArray(matrixRows) ? matrixRows : []).filter(row => (
    normalizePlatformIdentifier(row.AccountID) === requestedAccountId
  ));
  if (matches.length !== 1) return false;
  return isActivePlatformValue(matches[0]?._subjectAccess?.[requestedSubjectId]);
}

export function countActiveGlobalSubjectSubscriptions(matrixRows, subjectId) {
  const requestedSubjectId = normalizePlatformIdentifier(subjectId);
  if (!requestedSubjectId) return 0;
  return (Array.isArray(matrixRows) ? matrixRows : []).filter(row => (
    row?._accountActive !== false && isActivePlatformValue(row?._subjectAccess?.[requestedSubjectId])
  )).length;
}

export function buildGlobalSubjectAccessMatrixPayload(matrixRows, accounts, subjects, policyRows = []) {
  const subjectIds = (Array.isArray(subjects) ? subjects : [])
    .map(subject => String(subject.SubjectID || "").trim())
    .filter(Boolean);
  const policies = Object.create(null);
  for (const subjectId of subjectIds) {
    policies[subjectId] = resolveGlobalSubjectAccessPolicy(policyRows, subjectId).accessModel;
  }
  return Object.freeze({
    subjects: subjectIds,
    policies,
    rows: (Array.isArray(accounts) ? accounts : []).map(account => {
      const accountId = String(account.AccountID || "").trim();
      const values = Object.create(null);
      for (const subjectId of subjectIds) {
        values[subjectId] = hasActiveGlobalSubjectSubscription(matrixRows, accountId, subjectId);
      }
      return Object.freeze({ accountid: accountId, values });
    })
  });
}

export function canAccountAccessGlobalSubject({
  account,
  subject,
  policyRows,
  accessRows
}) {
  if (!account || !subject) return false;
  if (!isActivePlatformValue(account.Active) || !isActivePlatformValue(subject.Active)) return false;

  const accountId = normalizePlatformIdentifier(account.AccountID);
  const subjectId = normalizePlatformIdentifier(subject.SubjectID);
  if (!accountId || !subjectId) return false;

  const policy = resolveGlobalSubjectAccessPolicy(policyRows, subjectId);
  if (policy.accessModel === "FREE") return true;
  return hasActiveGlobalSubjectSubscription(accessRows, accountId, subjectId);
}

export function accessibleGlobalSubjectIds({
  account,
  subjects,
  policyRows,
  accessRows
}) {
  return new Set((Array.isArray(subjects) ? subjects : [])
    .filter(subject => canAccountAccessGlobalSubject({ account, subject, policyRows, accessRows }))
    .map(subject => normalizePlatformIdentifier(subject.SubjectID))
    .filter(Boolean));
}

export function validateIsoDate(value) {
  const text = String(value || "").trim();
  if (!DATE_PATTERN.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidIanaTimezone(value) {
  const timezone = String(value || "").trim();
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch (error) {
    return false;
  }
}

export function dateInTimezone(now, timezone) {
  if (!isValidIanaTimezone(timezone)) {
    throw new Error("Global-subject run timezone is invalid");
  }
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error("Run status requires a valid current date");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isOngoingGlobalSubjectRun(run) {
  const startDate = String(run?.StartDate || run?.startdate || "").trim();
  const endDate = String(run?.EndDate || run?.enddate || "").trim();
  return !startDate && !endDate;
}

export function deriveGlobalSubjectRunStatus(run, now = new Date()) {
  if (!run || !isActivePlatformValue(run.Active)) return "INACTIVE";
  const startDate = String(run.StartDate || "").trim();
  const endDate = String(run.EndDate || "").trim();
  const timezone = String(run.Timezone || "").trim();
  if (!isValidIanaTimezone(timezone)) throw new Error("Global-subject run timezone is invalid");
  if (isOngoingGlobalSubjectRun(run)) return "CURRENT";
  if (!validateIsoDate(startDate) || !validateIsoDate(endDate) || endDate < startDate) {
    throw new Error("Global-subject run has invalid dates");
  }
  const today = dateInTimezone(now, timezone);
  if (today < startDate) return "UPCOMING";
  if (today > endDate) return "ENDED";
  return "CURRENT";
}

export function strongestGlobalSubjectDeliveryStatus(runRows, subjectId, now = new Date()) {
  const requestedSubjectId = normalizePlatformIdentifier(subjectId);
  const statuses = (Array.isArray(runRows) ? runRows : [])
    .filter(run => (
      normalizePlatformIdentifier(run.SubjectID) === requestedSubjectId &&
      isActivePlatformValue(run.Active)
    ))
    .map(run => deriveGlobalSubjectRunStatus(run, now));

  if (statuses.includes("CURRENT")) return "CURRENT";
  if (statuses.includes("UPCOMING")) return "UPCOMING";
  if (statuses.includes("ENDED")) return "PAST";
  return "NOT SCHEDULED";
}

export function mapGlobalSubjectRun(run, now = new Date()) {
  return Object.freeze({
    runid: String(run?.RunID || "").trim(),
    subjectid: String(run?.SubjectID || "").trim(),
    runname: String(run?.RunName || "").trim(),
    startdate: String(run?.StartDate || "").trim(),
    enddate: String(run?.EndDate || "").trim(),
    timezone: String(run?.Timezone || "").trim(),
    accessmodel: normalizePlatformIdentifier(run?.AccessModel),
    schedulemode: normalizeCourseScheduleMode(run?.ScheduleMode, COURSE_SCHEDULE_MODE_EXPLICIT),
    scheduledefinition: parseCourseScheduleDefinition(run?.ScheduleDefinition || "[]"),
    active: isActivePlatformValue(run?.Active),
    ongoing: isOngoingGlobalSubjectRun(run),
    status: deriveGlobalSubjectRunStatus(run, now)
  });
}
