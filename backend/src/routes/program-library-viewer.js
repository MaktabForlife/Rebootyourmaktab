import { getAuthUser } from '../lib/auth.js';
import { json } from '../lib/http.js';
import { normalizePlatformIdentifier } from '../lib/platform-schema.js';
import { readProgramRoleAccounts, readProgramRoleAccountsForPrograms } from '../profiles/program-roles.js';
import { managementState } from '../programs/management-model.js';
import { clean, problem } from '../programs/model.js';
import { programViewerRole, requireVisibleProgramResource, visibleProgramResources } from '../programs/library-viewer.js';
import { programService } from '../programs/service.js';
import { sheetsProgramRepository } from '../programs/sheets-repository.js';
import { timetableProgram } from '../programs/timetable-context.js';
import { timetableRepository } from '../programs/timetable-repository.js';
import { programFailure } from '../programs/errors.js';
import { createDriveAccessToken, deriveFileFormat, getDriveAccessTtlSeconds } from './drive-library.js';
import { readAcademyLibraryPolicies, academyResourceDecision } from '../lib/academy-library-policy.js';
import { readPlatformSheet } from '../lib/platform-sheet.js';

async function requestBody(request) {
  if (request.method !== 'POST') throw problem('Use POST for the Program Library.', 405);
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let raw = '', bytes = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) { await reader.cancel(); throw problem('Library request is too large.', 413); }
    raw += decoder.decode(value, { stream:true });
  }
  raw += decoder.decode();
  let body;
  try { body = JSON.parse(raw || '{}'); } catch { throw problem('Invalid Library request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw problem('Invalid Library request.');
  return body;
}

export function programLibraryViewerEndpoint(action) {
  return async (request, env) => {
    try {
      const body = await requestBody(request);
      const user = await getAuthUser(request, env, { allowProgram: true });
      if (!user || user.type !== 'account') throw problem('Sign in through your personal Academy account link.', 401);
      if (action === 'available') {
        const { programs } = await programService(sheetsProgramRepository(env)).list();
        const candidates = programs.filter(row => row.mode === 'PROGRAM' && row.status === 'DRAFT');
        const roleAccounts = user.role === 'GLOBAL_ADMIN' ? {} :
          await readProgramRoleAccountsForPrograms(env, candidates.map(row => row.id));
        const visible = [];
        for (const program of candidates) {
          let role = user.role === 'GLOBAL_ADMIN' ? 'GLOBAL_ADMIN' : '';
          const account = roleAccounts[program.id]?.find(row =>
            normalizePlatformIdentifier(row.AccountID) === normalizePlatformIdentifier(user.accountid) && row.Active);
          if (!role) role = account?.Roles.find(value => ['ADMIN', 'SENIOR', 'TEACHER'].includes(value)) || '';
          if (!role && user.scope === 'COURSE' && user.courseid === program.id && user.role === 'STUDENT') role = 'STUDENT';
          if (!role && account?.Roles.includes('STUDENT')) role = 'STUDENT';
          if (role) visible.push({ id: program.id, name: program.name, role });
        }
        return json({ success: true, programs: visible });
      }

      const id = clean(body.id);
      const program = await timetableProgram(env, id);
      if (program.status !== 'DRAFT') throw problem('This Program Library is unavailable.', 404);
      const repository = timetableRepository(env, program);
      const data = await repository.load();
      if (!data.prepared || (!data.libraryPrepared && action !== 'catalogue'))
        throw problem('This Program Library is not ready.', 404);
      const snapshot = managementState(data, program).snapshot;
      const currentProgramSession = user.scope === 'COURSE' && user.courseid === program.id;
      const roleAccounts = user.role === 'GLOBAL_ADMIN' || currentProgramSession ? [] : await readProgramRoleAccounts(env, program.id);
      const role = currentProgramSession ? user.role : programViewerRole(user, roleAccounts);
      const sharedSubjects = await repository.subjectReferences(data);
      const policies = await readAcademyLibraryPolicies(env);
      const subscriptionPolicy = [...policies.entries()].some(([key, policy]) =>
        key.startsWith(`PROGRAM:${program.id}:`) && policy.state === 'SUBSCRIPTION');
      const [globalMatrix, globalSubjects] = subscriptionPolicy ? await Promise.all([
        readPlatformSheet(env, 'GlobalSubjectAccessMatrix'), readPlatformSheet(env, 'GlobalSubjectList')
      ]) : [[], []];
      const resources = (data.libraryPrepared ? visibleProgramResources(data, program, sharedSubjects) : []).filter(row => {
        const decision = academyResourceDecision({
          key: `PROGRAM:${program.id}:${row.id}`, source: 'PROGRAM', sourceActive: true,
          assigned: Boolean(role), role: role || user.role, accountId: user.accountid,
          policy: policies.get(`PROGRAM:${program.id}:${row.id}`), globalMatrix, globalSubjects
        });
        return decision.open;
      });
      if (!role && !resources.length) throw problem('This Program Library is not available to your account.', 403);

      if (action === 'catalogue') return json({
        success: true,
        program: { id: program.id, name: program.name },
        role,
        canManage: Boolean(role && role !== 'STUDENT'),
        accountPath: `/account/${encodeURIComponent(user.uniqueid)}`,
        resources
      });

      if (action === 'covers') {
        const ids = body.resourceIds;
        if (!Array.isArray(ids) || !ids.length || ids.length > 16 ||
          ids.some(value => typeof value !== 'string' || value.length > 100))
          throw problem('Choose up to 16 visible book covers.');
        const visible = new Set(resources
          .filter(row => row.type === 'EBOOK' && row.hasCover).map(row => row.id));
        const resourceRows = new Map(snapshot.ProgramResources.map(row => [row.ResourceID, row]));
        const covers = [];
        for (const id of new Set(ids)) {
          if (!visible.has(id)) continue;
          const resource = resourceRows.get(id);
          try {
            const file = await repository.verifyCover(resource, snapshot.ProgramLibraryRoots);
            const token = await createDriveAccessToken({
              fileId: file.id, resourceId: id, resourceType: resource.ResourceType,
              courseId: program.id, filename: file.name, mimeType: file.mimeType
            }, env);
            covers.push({ id, url: `${new URL(request.url).origin}/api/library/drive/file/${encodeURIComponent(file.id)}?access=${encodeURIComponent(token)}` });
          } catch { /* A removed or inaccessible cover leaves a placeholder. */ }
        }
        return json({ success:true, covers, expiresIn:getDriveAccessTtlSeconds(env) });
      }

      if (action === 'access' || action === 'cover') {
        const resource = requireVisibleProgramResource(data, program, sharedSubjects, body.resourceId);
        if (!resources.some(row => row.id === body.resourceId)) throw problem('This resource is unavailable.', 403);
        if (action === 'cover' && !resource.CoverDriveFileID) throw problem('This resource has no cover image.', 404);
        const file = action === 'cover'
          ? await repository.verifyCover(resource, snapshot.ProgramLibraryRoots)
          : await repository.verifyResource(resource, snapshot.ProgramLibraryRoots);
        const token = await createDriveAccessToken({
          fileId: file.id, resourceId: resource.ResourceID, resourceType: resource.ResourceType,
          courseId: program.id, filename: file.name, mimeType: file.mimeType
        }, env);
        return json({
          success: true,
          url: `${new URL(request.url).origin}/api/library/drive/file/${encodeURIComponent(file.id)}?access=${encodeURIComponent(token)}`,
          expiresIn: getDriveAccessTtlSeconds(env),
          filename: file.name, mimeType: file.mimeType, format: deriveFileFormat(file.name, file.mimeType)
        });
      }
      throw problem('Unknown Program Library action.', 404);
    } catch (error) {
      const failure = programFailure(error, `library-view-${action}`, 'library');
      return json(failure, failure.status);
    }
  };
}
