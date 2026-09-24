import { getAuthUser } from '../lib/auth.js';
import { programService } from './service.js';
import { sheetsProgramRepository } from './sheets-repository.js';
import { problem, programId } from './model.js';
export async function timetableUser(request,env) {
  const user=await getAuthUser(request,env);
  if (!user) throw problem('Sign in through your personal Academy account link.',401);
  if (user.type!=='account'||user.role!=='GLOBAL_ADMIN') throw problem('Timetable building requires a platform GLOBAL_ADMIN account.',403);
  return user;
}
export async function timetableProgram(env,id) {
  programId(id);
  const repository=sheetsProgramRepository(env);
  const {programs}=await programService(repository).list();
  const program=programs.find(p=>p.id.toUpperCase()===id.toUpperCase());
  if (!program||program.mode!=='PROGRAM') throw problem('Select a new Program. Existing Reboot timetables stay in their current workspace.',404);
  if (repository.protectedIds.includes(program.spreadsheetId)) throw problem('Invalid Program spreadsheet mapping.',409);
  const target=await repository.inspectTarget(program.spreadsheetId);
  if (target.identity.length!==1||target.identity[0].CourseID!==program.id||target.identity[0].SchemaVersion!=='105.1-program') throw problem('Complete Program spreadsheet preparation in Program setup first.',409);
  return program;
}
