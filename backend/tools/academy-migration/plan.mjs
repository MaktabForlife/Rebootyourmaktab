import { isActivePlatformValue } from '../../src/lib/platform-schema.js';
import { key } from '../../src/programs/model.js';
import { TIMETABLE_HEADERS } from '../../src/programs/timetable-model.js';
import { managementState } from '../../src/programs/management-model.js';
import { programRoleAccounts } from '../../src/profiles/program-roles.js';
import { publicationRecord, publicationSchedule, programToday } from '../../src/programs/weekly-timetable.js';
import { validateSnapshot, sha256, requireCondition, SnapshotError } from './snapshot.mjs';

export const POLICY_FORMAT = 'maktab-academy-migration-policy/v1';
const objectRows = tab => {
  if (!tab) return [];
  const headers = tab.rows[0] || [];
  return tab.rows.slice(1).flatMap((row, i) => row.some(v => String(v ?? '').trim())
    ? [{ ...Object.fromEntries(headers.map((h,j) => [h, row[j] ?? ''])), _rowNumber: i+2 }] : []);
};
const inactive = row => Object.hasOwn(row, 'Active') && !isActivePlatformValue(row.Active)
  || ['ARCHIVED', 'INACTIVE'].includes(key(row.Status));
const reference = row => ({ sourceRow: row._rowNumber });

// This is an inclusion manifest, not a transformed live database. It contains
// source coordinates, never credentials or copied inactive records. Embedded
// publication/attendance history needs a domain conversion before import.
export async function planMigration(snapshot, policy) {
  const validated = await validateSnapshot(snapshot);
  requireCondition(policy && policy.format === POLICY_FORMAT && policy.environment === snapshot.environment
    && policy.accounts === 'ACTIVE_ONLY' && policy.records === 'ACTIVE_ONLY'
    && policy.archived === 'EXCLUDE' && policy.websiteVisibility === 'PUBLISHED_CONTENT_ONLY'
    && Array.isArray(policy.activeProgramIds) && Array.isArray(policy.excludedCourseIds), 'INVALID_MIGRATION_POLICY');
  const included = new Set(policy.activeProgramIds.map(key)), excluded = new Set(policy.excludedCourseIds.map(key));
  requireCondition(included.size === policy.activeProgramIds.length && excluded.size === policy.excludedCourseIds.length
    && ![...included].some(id => excluded.has(id)), 'AMBIGUOUS_PROGRAM_POLICY');
  const platform = Object.fromEntries(snapshot.workbooks[0].tabs.map(t => [t.title, objectRows(t)]));
  const sourceRegistry = platform.CourseRegistry, registered = new Set(sourceRegistry.map(r => key(r.CourseID)));
  requireCondition([...included, ...excluded].every(id => registered.has(id))
    && sourceRegistry.every(r => included.has(key(r.CourseID)) || excluded.has(key(r.CourseID))), 'PROGRAM_SCOPE_REQUIRES_EXPLICIT_DECISION');
  const accountRows = platform.UserAccounts.filter(r => !inactive(r));
  const accounts = new Set(accountRows.map(r => key(r.AccountID)));
  const subjectRows = platform.GlobalSubjectList.filter(r => !inactive(r));
  const subjects = new Set(subjectRows.map(r => key(r.SubjectID)));
  const runRows = platform.GlobalSubjectRuns.filter(r => !inactive(r) && subjects.has(key(r.SubjectID)));
  const runs = new Set(runRows.map(r => key(r.RunID)));
  const runState = platform.GlobalTimetableRunState.filter(r => !inactive(r) && runs.has(key(r.RunID)));
  const publicationIds = new Set(runState.map(r => key(r.CurrentPublicationID)).filter(Boolean));
  const scopes = (platform.AcademyAccessScopes || []).filter(r => !inactive(r)
    && (key(r.ScopeType) === 'PROGRAM' ? included.has(key(r.ScopeID)) : key(r.ScopeType) === 'SUBJECT' && subjects.has(key(r.ScopeID))));
  const scopeKeys = new Set(scopes.map(r => key(r.ScopeKey)));
  const selectors = {
    PlatformConfig: platform.PlatformConfig,
    UserAccounts: accountRows,
    CourseRegistry: sourceRegistry.filter(r => included.has(key(r.CourseID))),
    ProgramDefinitions: (platform.ProgramDefinitions || []).filter(r => included.has(key(r.CourseID))),
    UserCourseAccess: platform.UserCourseAccess.filter(r => !inactive(r) && accounts.has(key(r.AccountID)) && included.has(key(r.CourseID))),
    GlobalSubjectList: subjectRows,
    GlobalModuleList: platform.GlobalModuleList.filter(r => !inactive(r) && subjects.has(key(r.SubjectID))),
    GlobalSubjectAccessPolicy: platform.GlobalSubjectAccessPolicy.filter(r => !inactive(r) && subjects.has(key(r.SubjectID))),
    GlobalSubjectAccessMatrix: platform.GlobalSubjectAccessMatrix.filter(r => accounts.has(key(r.AccountID))),
    GlobalSubjectRuns: runRows,
    GlobalTimetableRunState: runState,
    GlobalTimetablePublications: platform.GlobalTimetablePublications.filter(r => publicationIds.has(key(r.PublicationID))),
    PublishedGlobalTimetableSessions: platform.PublishedGlobalTimetableSessions.filter(r => publicationIds.has(key(r.PublicationID))),
    GlobalTimetableSessionLifecycle: platform.GlobalTimetableSessionLifecycle.filter(r => publicationIds.has(key(r.PublicationID))),
    AcademyAccessScopes: scopes,
    AcademyAccessMatrix: (platform.AcademyAccessMatrix || []).filter(r => accounts.has(key(r.AccountID))),
    AcademyAccessReview: (platform.AcademyAccessReview || []).filter(r => accounts.has(key(r.AccountID)) && scopeKeys.has(key(r.ScopeKey))),
    AcademySubjectList: (platform.AcademySubjectList || []).filter(r => !inactive(r))
  };
  const platformRecords = Object.fromEntries(Object.entries(selectors).map(([name, rows]) => [name, rows.map(reference)]));
  // Matrix columns must be selected as well as rows, otherwise access to an
  // excluded Program/subject would survive a naive matrix copy.
  const matrixColumns = {
    AcademyAccessMatrix: snapshot.workbooks[0].tabs.find(t => t.title === 'AcademyAccessMatrix')?.rows[0]?.filter((h,i) => i < 3 || scopeKeys.has(key(h))) || [],
    GlobalSubjectAccessMatrix: snapshot.workbooks[0].tabs.find(t => t.title === 'GlobalSubjectAccessMatrix')?.rows[0]?.filter((h,i) => i === 0 || subjects.has(key(h))) || []
  };
  const definitions = new Map((platform.ProgramDefinitions || []).map(r => [key(r.CourseID), r]));
  const asOf = snapshot.completedAt.slice(0,10);
  const programs = [];
  let activeRecords = 0, inactiveRecords = 0, unresolvedReferences = 0, effectiveRoleGrants = 0;
  for (const [bookIndex, book] of snapshot.workbooks.entries()) {
    if (!bookIndex || !included.has(key(book.courseId))) continue;
    const definition = definitions.get(key(book.courseId));
    requireCondition(book.kind === 'PROGRAM' && definition && !inactive(definition), 'ARCHIVED_PROGRAM_CANNOT_BE_ACTIVATED', { book: bookIndex });
    const tables = {};
    for (const tab of book.tabs) if (Object.hasOwn(TIMETABLE_HEADERS, tab.title)) tables[tab.title] = objectRows(tab);
    const current = managementState({ tables }, { id: book.courseId }).snapshot;
    const records = {};
    for (const [name, rows] of Object.entries(current)) {
      // Preserve the snapshot's stable record ID in an inclusion manifest only.
      // No source record is copied into a target operational table at this step.
      const kept = rows.filter(r => !inactive(r));
      inactiveRecords += rows.length-kept.length;
      activeRecords += kept.length;
      const idField = { ProgramSubjects:'ProgramSubjectID', ProgramLevels:'LevelID', ProgramModules:'ProgramModuleID',
        ProgramTasks:'TaskID', ProgramResources:'ResourceID', ProgramClasses:'ClassID', ProgramEnrollments:'EnrollmentID',
        ProgramTeachers:'AccountID', ProgramModuleProgress:'ProgressID', ProgramLibraryRoots:'FolderID' }[name];
      requireCondition(idField, 'UNREVIEWED_MANAGEMENT_DATASET', { book: bookIndex });
      records[name] = kept.map(r => ({ sourceId: r[idField] }));
    }
    const classes = new Set(current.ProgramClasses.filter(r => !inactive(r)).map(r => key(r.ClassID)));
    const membership = current.ProgramEnrollments.filter(r => !inactive(r));
    // Active rows that depend on excluded records need an explicit conversion;
    // do not silently resurrect an inactive account/class or drop its lesson.
    unresolvedReferences += membership.filter(r => !accounts.has(key(r.AccountID)) || !classes.has(key(r.ClassID))).length;
    unresolvedReferences += current.ProgramTeachers.filter(r => !inactive(r) && !accounts.has(key(r.AccountID))).length;
    let publications;
    try { publications = (tables.ProgramTimetablePublications || []).map(r => publicationRecord(r, { id: book.courseId })); }
    catch { throw new SnapshotError('INVALID_PUBLISHED_TIMETABLE', { book: bookIndex }); }
    const publicationAsOf = programToday(definition.Timezone, new Date(snapshot.completedAt));
    const schedule = publicationSchedule(publications, publicationAsOf);
    const eligible = schedule.publications.filter(p => ['CURRENT','SCHEDULED'].includes(p.status));
    for (const p of eligible) for (const lesson of p.snapshot.rules || []) {
      const teachers = [lesson.teacherId, ...(lesson.additionalTeacherIds || []), ...(lesson.teacherIds || [])].filter(Boolean);
      if (teachers.some(id => !accounts.has(key(id))) || (lesson.classIds || []).some(id => !classes.has(key(id)))) unresolvedReferences++;
    }
    const prepared = Boolean(platform.AcademyAccessScopes);
    const roleRows = programRoleAccounts(platform, book.courseId, prepared);
    effectiveRoleGrants += roleRows.filter(r => accounts.has(key(r.AccountID))).reduce((n,r) => n+r.Roles.length, 0);
    programs.push({ sourceBook: bookIndex, sourceCourseId: book.courseId, targetStatus: 'ACTIVE',
      websiteVisibility: 'PUBLISHED_CONTENT_ONLY', publicationAsOf, currentlyPublished: Boolean(schedule.currentPublicationId),
      publicationIds: eligible.map(p => p.id), records });
  }
  requireCondition(programs.length === included.size, 'PROGRAM_SELECTION_INCOMPLETE');
  const summary = { sourceValidation: validated.snapshotValidation, cutoverReady: false,
    accountsIncluded: accountRows.length, inactiveAccountsExcluded: platform.UserAccounts.length-accountRows.length,
    programsIncluded: programs.length, programsExcluded: excluded.size,
    currentlyPublishedPrograms: programs.filter(p => p.currentlyPublished).length,
    activeManagementRecords: activeRecords, inactiveManagementRecordsExcluded: inactiveRecords,
    effectiveProgramRoleGrants: effectiveRoleGrants, pendingRoleReviews: validated.checks.pendingRoleReviews,
    referencesToExcludedRecords: unresolvedReferences,
    operationalImportReady: false };
  return { format: 'maktab-academy-inclusion-manifest/v1', snapshotSha256: validated.snapshotSha256,
    policySha256: sha256(policy), environment: snapshot.environment, asOf, summary,
    accounts: accountRows.map(reference), platformRecords, matrixColumns, programs };
}
