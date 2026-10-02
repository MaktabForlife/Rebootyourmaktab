import { isActivePlatformValue as active, normalizePlatformIdentifier } from '../lib/platform-schema.js';
import { clean, problem } from './model.js';
import { managementState } from './management-model.js';

const STAFF_ROLES = new Set(['ADMIN', 'SENIOR', 'TEACHER']);
const TYPES = new Set(['EBOOK', 'PRINTABLE', 'AUDIO', 'VIDEO', 'OTHER']);

export function programViewerRole(user, roleAccounts) {
  if (user.role === 'GLOBAL_ADMIN') return 'GLOBAL_ADMIN';
  const account = (roleAccounts || []).find(row =>
    normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(user.accountid) && row.Active);
  if (!account) return '';
  const staff = account.Roles.find(role => STAFF_ROLES.has(role));
  if (staff) return staff;
  return account.Roles.includes('STUDENT') ? 'STUDENT' : '';
}

export function visibleProgramResources(data, program, sharedSubjects) {
  const { snapshot } = managementState(data, program);
  const subjects = new Map((snapshot.ProgramSubjects || [])
    .filter(row => row.CourseID === program.id && active(row.Active))
    .map(row => [row.ProgramSubjectID, row]));
  const shared = new Map((sharedSubjects || [])
    .filter(row => active(row.Active))
    .map(row => [row.SubjectID, row]));
  const levels = new Map((snapshot.ProgramLevels || [])
    .filter(row => active(row.Active)).map(row => [row.LevelID, row]));
  const modules = new Map((snapshot.ProgramModules || [])
    .filter(row => active(row.Active)).map(row => [row.ProgramModuleID, row]));
  const tasks = new Map((snapshot.ProgramTasks || [])
    .filter(row => row.CourseID === program.id && active(row.Active))
    .map(row => [row.TaskID, row]));
  const output = [];
  for (const row of snapshot.ProgramResources || []) {
    const subject = subjects.get(row.ProgramSubjectID);
    const sharedSubject = shared.get(subject?.SubjectID);
    const level = row.LevelID ? levels.get(row.LevelID) : null;
    const module = row.ProgramModuleID ? modules.get(row.ProgramModuleID) : null;
    const task = row.TaskID ? tasks.get(row.TaskID) : null;
    if (!active(row.Active) || row.CourseID !== program.id || !TYPES.has(row.ResourceType) ||
      !subject || !sharedSubject || !clean(row.ResourceID) || !clean(row.DriveFileID) || !clean(row.Name) ||
      (row.LevelID && (!level || level.ProgramSubjectID !== subject.ProgramSubjectID)) ||
      (row.ProgramModuleID && (!module || module.ProgramSubjectID !== subject.ProgramSubjectID || module.LevelID !== row.LevelID)) ||
      (row.TaskID && (!task || task.ProgramSubjectID !== subject.ProgramSubjectID || task.ProgramModuleID !== row.ProgramModuleID))) continue;
    output.push({
      id: row.ResourceID, type: row.ResourceType, name: row.Name, description: row.Description || '',
      subjectId: subject.ProgramSubjectID, subjectName: sharedSubject.SubjectName,
      levelId: level?.LevelID || '', levelName: level?.Name || '',
      moduleId: module?.ProgramModuleID || '', moduleName: module?.Name || 'General',
      taskName: task?.Name || '', author: row.Author || '', publisher: row.Publisher || '',
      isbn: row.ISBN || '', publicationYear: row.PublicationYear || '', hasCover: Boolean(row.CoverDriveFileID)
    });
  }
  return output.sort((a,b) => a.subjectName.localeCompare(b.subjectName) ||
    a.levelName.localeCompare(b.levelName) || a.moduleName.localeCompare(b.moduleName) || a.name.localeCompare(b.name));
}

export function requireVisibleProgramResource(data, program, sharedSubjects, id) {
  const resource = visibleProgramResources(data, program, sharedSubjects).find(row => row.id === clean(id));
  if (!resource) throw problem('This resource is unavailable.', 404);
  return managementState(data, program).snapshot.ProgramResources.find(row => row.ResourceID === resource.id);
}
