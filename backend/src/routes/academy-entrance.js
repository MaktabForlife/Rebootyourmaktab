import { getAuthUser } from '../lib/auth.js';
import { readPlatformSheets } from '../lib/platform-sheet.js';
import { json } from '../lib/http.js';
import { programService } from '../programs/service.js';
import { sheetsProgramRepository } from '../programs/sheets-repository.js';
import { timetableRepository } from '../programs/timetable-repository.js';
import { readProgramRoleAccountsForPrograms } from '../profiles/program-roles.js';
import { buildEntrance } from '../academy/entrance.js';
import { GoogleSheetsApiError } from '../lib/google-sheets.js';

const TABLES = ['UserAccounts', 'PlatformConfig', 'GlobalSubjectList', 'GlobalModuleList',
  'GlobalSubjectAccessPolicy', 'GlobalSubjectAccessMatrix', 'GlobalSubjectRuns', 'GlobalTimetableRunState',
  'GlobalTimetablePublications', 'GlobalTimetableSessionLifecycle', 'PublishedGlobalTimetableSessions'];

export async function academyEntranceEndpoint(request, env) {
  if (request.method !== 'POST') return json({ success: false, error: 'Use POST.' }, 405);
  try {
    const user = request.headers.has('Authorization') ? await getAuthUser(request, env, { allowProgram: true }) : null;
    if (request.headers.has('Authorization') && (!user || user.type !== 'account'))
      return json({ success: false, error: 'Your Academy session has ended.' }, 401);
    const reader = request.body?.getReader(), decoder = new TextDecoder();
    let raw = '', size = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return json({ success: false, error: 'Academy request is too large.' }, 413); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    let input;
    try { input = JSON.parse(raw || '{}'); }
    catch { return json({ success: false, error: 'Invalid Academy request.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return json({ success: false, error: 'Invalid Academy request.' }, 400);
    const programRepository = sheetsProgramRepository(env);
    const names = user ? TABLES : TABLES.filter(name => !['UserAccounts', 'GlobalSubjectAccessMatrix'].includes(name));
    const [readTables, { programs }] = await Promise.all([
      readPlatformSheets(env, names), programService(programRepository).list()
    ]);
    const tables = Object.fromEntries(TABLES.map(name => [name, readTables[name] || []]));
    const candidates = programs.filter(row => row.mode === 'PROGRAM' && row.status === 'DRAFT');
    const rolesByProgram = user && user.role !== 'GLOBAL_ADMIN'
      ? await readProgramRoleAccountsForPrograms(env, candidates.map(row => row.id)) : {};
    const result = await buildEntrance({ tables, programs, rolesByProgram, user, input,
      loadProgram: async (program, needsCurriculum) => {
        if (programRepository.protectedIds.includes(program.spreadsheetId)) throw new Error('Invalid Program mapping');
        const target = await programRepository.inspectTarget(program.spreadsheetId);
        if (target.identity.length !== 1 || target.identity[0].CourseID !== program.id ||
          target.identity[0].SchemaVersion !== '105.1-program') throw new Error('Invalid Program identity');
        const repository = timetableRepository(env, program);
        const data = await repository.load();
        if (needsCurriculum) data.subjects = await repository.subjectReferences(data);
        return data;
      } });
    const response = json({ success: true, ...result });
    if (result.retryAfterMs) response.headers.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    return response;
  } catch (error) {
    console.warn('Academy entrance unavailable', { status: error.status || 503 });
    if (error instanceof GoogleSheetsApiError && error.status === 429) {
      const response = json({ success: false,
        error: 'Academy information is temporarily busy. Please wait one minute and try again.',
        code: 'SHEETS_RATE_LIMITED', retryable: true, retryAfterMs: 60000 }, 429);
      response.headers.set('Retry-After', '60');
      return response;
    }
    return json({ success: false, error: error.publicMessage || 'Academy information is temporarily unavailable. Please try again.',
      retryable: !error.publicMessage }, error.status || 503, { 'Cache-Control': 'private, no-store' });
  }
}
