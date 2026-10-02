import { batchReadGoogleSheetValues, readGoogleSpreadsheetSheetProperties } from './google-sheets.js';
import { getPlatformSpreadsheetId } from './platform-sheet.js';
import { hasActiveGlobalSubjectSubscription } from './global-subject-delivery.js';
import { isActivePlatformValue, normalizePlatformIdentifier } from './platform-schema.js';

// This optional platform tab is a publication manifest, not a copy of Library data.
// A missing row keeps the source's current Assigned/Global access rule.
export const ACADEMY_LIBRARY_HEADERS = Object.freeze([
  'ResourceKey', 'Status', 'AccessState', 'EntitlementSource', 'SubscriptionScope'
]);
const STATES = new Set(['ASSIGNED', 'ACADEMY_LEARNERS', 'SUBSCRIPTION', 'STAFF_ONLY']);

export function canonicalCourseResourceType(type) {
  const value = normalizePlatformIdentifier(type);
  if (value === 'EBOOKS') return 'EBOOK';
  if (value === 'PRINTABLES') return 'PRINTABLE';
  return value;
}

export async function readAcademyLibraryPolicies(env) {
  const target = { spreadsheetId: getPlatformSpreadsheetId(env) };
  const sheets = await readGoogleSpreadsheetSheetProperties(env, target);
  if (!sheets.some(sheet => sheet.title === 'AcademyLibraryAccess')) return new Map();
  const [values] = await batchReadGoogleSheetValues(env, ["'AcademyLibraryAccess'!A:E"], target);
  if (JSON.stringify(values[0] || []) !== JSON.stringify(ACADEMY_LIBRARY_HEADERS)) {
    throw new Error('AcademyLibraryAccess headers do not match the publication manifest');
  }
  const policies = new Map();
  for (const row of values.slice(1)) {
    if (!row.some(value => String(value ?? '').trim())) continue;
    const key = String(row[0] ?? '').trim();
    if (!/^COURSE:[^:]+:(EBOOK|PRINTABLE|AUDIO|VIDEO|OTHER):[^:]+$|^PROGRAM:[^:]+:[^:]+$|^GLOBAL:[^:]+$/.test(key) || policies.has(key)) {
      throw new Error('AcademyLibraryAccess has an invalid or duplicate ResourceKey');
    }
    const status = normalizePlatformIdentifier(row[1]);
    const state = normalizePlatformIdentifier(row[2]);
    const source = normalizePlatformIdentifier(row[3]);
    const scope = String(row[4] ?? '').trim();
    // Invalid policy rows fail closed rather than broadening access.
    policies.set(key, {
      status: status === 'ACTIVE' ? 'ACTIVE' : 'ARCHIVED',
      state: STATES.has(state) ? state : 'INVALID',
      entitlementSource: source,
      subscriptionScope: scope
    });
  }
  return policies;
}

export function academyResourceDecision({ key, source, sourceActive, assigned, role, accountId,
  policy, globalAccessModel, globalSubjectId, globalMatrix, globalSubjects = [] }) {
  if (!sourceActive || policy?.status === 'ARCHIVED') return { visible: false, open: false };
  const isStaff = ['GLOBAL_ADMIN', 'ADMIN', 'SENIOR', 'TEACHER'].includes(normalizePlatformIdentifier(role));
  let state = policy?.state || (source === 'GLOBAL'
    ? globalAccessModel === 'FREE' ? 'ACADEMY_LEARNERS' : 'SUBSCRIPTION'
    : 'ASSIGNED');
  if (state === 'INVALID') return { visible: false, open: false };
  // Global delivery remains governed by its existing FREE/SUBSCRIPTION policy.
  if (source === 'GLOBAL' && !['STAFF_ONLY'].includes(state)) {
    state = globalAccessModel === 'FREE' ? 'ACADEMY_LEARNERS' : 'SUBSCRIPTION';
  }
  if (state === 'STAFF_ONLY') return { state, visible: isStaff, open: isStaff, forYou: isStaff };
  if (state === 'ASSIGNED') return { state, visible: assigned, open: assigned, forYou: assigned };
  if (state === 'ACADEMY_LEARNERS') return { state, visible: true, open: true, forYou: false };
  if (state === 'SUBSCRIPTION') {
    const subjectId = source === 'GLOBAL' ? globalSubjectId : policy?.subscriptionScope;
    const validSource = source === 'GLOBAL' || (policy?.entitlementSource === 'GLOBAL_SUBJECT' && subjectId &&
      globalSubjects.some(row => normalizePlatformIdentifier(row.SubjectID) === normalizePlatformIdentifier(subjectId) &&
        isActivePlatformValue(row.Active)));
    if (!validSource) return { visible: false, open: false };
    const entitled = Boolean(validSource && hasActiveGlobalSubjectSubscription(globalMatrix, accountId, subjectId));
    const admin = source === 'GLOBAL' && ['ADMIN', 'GLOBAL_ADMIN'].includes(normalizePlatformIdentifier(role));
    return { state, visible: true, open: entitled || admin, forYou: entitled || admin, locked: !entitled && !admin };
  }
  return { visible: false, open: false };
}
