import { getAuthUser } from '../lib/auth.js';
import { readAcademyLibraryPolicies, academyResourceDecision } from '../lib/academy-library-policy.js';
import { r2MediaFilename, r2MediaMimeType, createR2MediaToken,
  R2_MEDIA_TTL_SECONDS } from '../lib/academy-r2-media.js';
import { readPlatformSheets } from '../lib/platform-sheet.js';
import { accessibleGlobalSubjectIds } from '../lib/global-subject-delivery.js';
import { isActivePlatformValue, normalizePlatformIdentifier } from '../lib/platform-schema.js';
import { json } from '../lib/http.js';
import { buildGlobalLibrary } from './library-catalogue.js';
import { extractDriveFileId, getRootFolderId, requireItemInsideRoot,
  validateFileForResourceType, getResourceConfig, createDriveAccessToken,
  getDriveAccessTtlSeconds, deriveFileFormat } from './drive-library.js';
import { programService } from '../programs/service.js';
import { sheetsProgramRepository } from '../programs/sheets-repository.js';
import { timetableRepository } from '../programs/timetable-repository.js';
import { readProgramRoleAccountsForPrograms } from '../profiles/program-roles.js';
import { programViewerRole, visibleProgramResources } from '../programs/library-viewer.js';
import { programDisplayName } from '../academy/entrance.js';
import { managementState } from '../programs/management-model.js';

const TABLES = ['UserAccounts', 'GlobalSubjectAccessMatrix',
  'GlobalSubjectAccessPolicy', 'GlobalSubjectRuns', 'GlobalSubjectList', 'GlobalModuleList',
  'GlobalTaskList', 'GlobalResources', 'PlatformConfig'];
const TYPES = new Set(['EBOOK', 'PRINTABLE', 'AUDIO', 'VIDEO', 'OTHER']);
const clean = value => String(value ?? '').trim();
async function readBody(request) {
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let raw = '', bytes = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 4096) {
      await reader.cancel();
      throw Object.assign(new Error('Library request is too large'), { status: 413 });
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  try {
    const body = JSON.parse(raw || '{}');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw Object.assign(new Error('Invalid Library request'), { status: 400 }); }
}
const items = catalogue => {
  const output = [];
  for (const group of catalogue?.groups || []) for (const subject of group.subjects || []) {
    for (const module of subject.modules || []) for (const resource of module.resources || []) {
      output.push({ resource, subject, module });
    }
  }
  return output;
};

export async function academyLibraryEndpoint(action, request, env) {
  try {
    if (request.method !== 'POST') return json({ success: false, error: 'Use POST' }, 405);
    const user = await getAuthUser(request, env, { allowProgram: true });
    if (!user || user.type !== 'account') return json({ success: false, error: 'Sign in to your Academy account' }, 401);
    const body = await readBody(request);
    const requested = clean(body?.resourceId);
    if (action !== 'catalogue' && (!requested || requested.length > 180)) {
      return json({ success: false, error: 'Resource ID is required' }, 400);
    }
    const catalogue = await collectAcademyLibrary(env, user, action === 'catalogue' ? '' : requested);
    if (action === 'catalogue') return json({ success: true, resources: catalogue.rows,
      learningAreaRefs: catalogue.learningAreaRefs, warnings: catalogue.warnings }, 200, {
      'Cache-Control': 'private, no-store'
    });
    if (action !== 'access' && action !== 'cover') return json({ success: false, error: 'Unknown action' }, 404);
    const entry = catalogue.entries.find(row => row.id === requested);
    if (!entry || !entry.decision.open || (action === 'cover' && !entry.hasCover)) {
      return json({ success: false, error: 'This resource is unavailable' }, 403);
    }
    if (entry.r2Key) {
      if (!env.MEDIA_BUCKET) throw new Error('Media storage is unavailable');
      const object = await env.MEDIA_BUCKET.head(entry.r2Key);
      if (!object) return json({ success: false, error: 'This resource file is unavailable' }, 404);
      const filename = r2MediaFilename(entry.r2Key);
      const mimeType = r2MediaMimeType(filename, object);
      const validation = validateFileForResourceType({ name: filename, mimeType }, getResourceConfig(entry.type));
      if (!validation.ok && !(entry.type === 'OTHER' && mimeType === 'application/pdf')) {
        return json({ success: false, error: 'This resource file is unavailable' }, 409);
      }
      const token = await createR2MediaToken({ key: entry.r2Key, etag: object.etag,
        filename, mimeType }, env);
      return json({ success: true,
        url: `${new URL(request.url).origin}/api/academy/library/media?access=${encodeURIComponent(token)}`,
        expiresIn: R2_MEDIA_TTL_SECONDS, filename, mimeType,
        format: deriveFileFormat(filename, mimeType) }, 200, { 'Cache-Control': 'private, no-store' });
    }
    const file = await verifyFile(entry, action, env);
    const token = await createDriveAccessToken({
      fileId: file.id, resourceId: entry.id, resourceType: entry.type,
      filename: file.name, mimeType: file.mimeType
    }, env);
    return json({
      success: true,
      url: `${new URL(request.url).origin}/api/library/drive/file/${encodeURIComponent(file.id)}?access=${encodeURIComponent(token)}`,
      expiresIn: getDriveAccessTtlSeconds(env),
      filename: file.name, mimeType: file.mimeType,
      format: deriveFileFormat(file.name, file.mimeType)
    });
  } catch (error) {
    if (error?.status === 400 || error?.status === 413) {
      return json({ success: false, error: error.message }, error.status);
    }
    console.warn('Academy Library failed', { action, message: clean(error?.message).slice(0, 160) });
    return json({ success: false, error: 'The Academy Library is temporarily unavailable' }, 503);
  }
}

export async function collectAcademyLibrary(env, user, requested = '') {
  const [tables, policies] = await Promise.all([readPlatformSheets(env, TABLES), readAcademyLibraryPolicies(env)]);
  const account = tables.UserAccounts.find(row => normalizePlatformIdentifier(row.AccountID) ===
    normalizePlatformIdentifier(user.accountid));
  if (!account || !isActivePlatformValue(account.Active)) throw new Error('Inactive account');
  const entries = [], warnings = [];
  const add = entry => {
    if ((!requested || entry.id === requested) && entry.decision.visible) entries.push(entry);
  };
  // Academy integration only uses new Programs and Courses. Legacy services remain separate.
  const learningAreaRefs = new Set();
  for (const id of accessibleGlobalSubjectIds({ account, subjects: tables.GlobalSubjectList,
    policyRows: tables.GlobalSubjectAccessPolicy, accessRows: tables.GlobalSubjectAccessMatrix })) {
    learningAreaRefs.add(`GLOBAL:${id}`);
  }
  if (['GLOBAL_ADMIN', 'ADMIN'].includes(user.role)) {
    for (const subject of tables.GlobalSubjectList.filter(row => isActivePlatformValue(row.Active))) {
      learningAreaRefs.add(`GLOBAL:${normalizePlatformIdentifier(subject.SubjectID)}`);
    }
  }
  const syntheticId = '__ACADEMY_LIBRARY_CATALOGUE__';
  const syntheticMatrix = [{ AccountID: syntheticId, _subjectAccess: Object.fromEntries(
    tables.GlobalSubjectList.map(subject => [normalizePlatformIdentifier(subject.SubjectID), true])
  ) }];
  const global = buildGlobalLibrary({ accountid: syntheticId }, {
    ...tables, UserAccounts: [{ AccountID: syntheticId, Active: true }],
    GlobalSubjectAccessMatrix: syntheticMatrix
  }, new Date(), { includeProtectedLinks: true });
  for (const { resource, subject, module } of (requested && !requested.startsWith('GLOBAL:') ? [] : items(global.catalogue))) {
    const originId = clean(resource.originresourceid);
    const fileId = extractDriveFileId(resource.link);
    if (!originId || !fileId) continue;
    const id = `GLOBAL:${originId}`;
    const decision = academyResourceDecision({ key: id, source: 'GLOBAL', sourceActive: true,
      assigned: false, role: user.role, accountId: user.accountid, policy: policies.get(id),
      globalAccessModel: subject.accessmodel, globalSubjectId: clean(subject.originsubjectid),
      globalMatrix: tables.GlobalSubjectAccessMatrix, globalSubjects: tables.GlobalSubjectList });
    add({ id, source: 'GLOBAL', sourceName: 'Courses', type: resource.type,
      name: clean(resource.name), description: clean(resource.description),
      subject: clean(subject.subjectname), module: clean(module.modulename),
      fileId, hasCover: false, decision,
      globalRoot: globalRoot(tables.PlatformConfig) });
  }

  const { programs } = !requested || requested.startsWith('PROGRAM:')
    ? await programService(sheetsProgramRepository(env)).list() : { programs: [] };
  const allPrograms = programs.filter(row => row.mode === 'PROGRAM' && row.status === 'DRAFT');
  const candidates = allPrograms.filter(row => !requested || requested.startsWith(`PROGRAM:${row.id}:`));
  const roles = user.role === 'GLOBAL_ADMIN' ? {} :
    await readProgramRoleAccountsForPrograms(env, allPrograms.map(row => row.id));
  const academyStaff = user.role === 'GLOBAL_ADMIN' || allPrograms.some(program =>
    ['ADMIN', 'SENIOR', 'TEACHER'].includes(programViewerRole(user, roles[program.id])));
  for (const program of candidates) {
    try {
      const repository = timetableRepository(env, program);
      const data = await repository.load();
      const role = programViewerRole(user, roles[program.id]);
      if (role) learningAreaRefs.add(`PROGRAM:${program.id}`);
      if (!data.prepared || !data.libraryPrepared) continue;
      const shared = await repository.subjectReferences(data);
      const snapshot = managementState(data, program).snapshot;
      const byId = new Map(snapshot.ProgramResources.map(row => [clean(row.ResourceID), row]));
      for (const resource of visibleProgramResources(data, program, shared)) {
        const id = `PROGRAM:${program.id}:${resource.id}`;
        const decision = academyResourceDecision({ key: id, source: 'PROGRAM', sourceActive: true,
          assigned: Boolean(role || academyStaff), role: role || (academyStaff ? 'TEACHER' : 'USER'), accountId: user.accountid,
          policy: policies.get(id), globalMatrix: tables.GlobalSubjectAccessMatrix,
          globalSubjects: tables.GlobalSubjectList });
        add({ id, source: 'PROGRAM', sourceName: programDisplayName(program), type: resource.type,
          name: resource.name, description: resource.description, subject: resource.subjectName,
          module: resource.moduleName, author: resource.author, publisher: resource.publisher,
          hasCover: resource.hasCover, resource: byId.get(resource.id), repository,
          roots: snapshot.ProgramLibraryRoots, decision });
      }
    } catch (error) { warnings.push(`${program.name} Library is unavailable.`); }
  }
  const rows = entries.map(({ id, source, sourceName, type, name, description, subject, module,
    author, publisher, hasCover, decision }) => ({ id, source, sourceName, type, name,
    description, subject, module, author: author || '', publisher: publisher || '',
    hasCover, accessState: decision.state, locked: Boolean(decision.locked),
    forYou: Boolean(decision.forYou || decision.open) }));
  rows.sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.subject.localeCompare(b.subject) || a.name.localeCompare(b.name));
  return { rows, entries, warnings, learningAreaRefs: [...learningAreaRefs] };
}

function globalRoot(config) {
  const matches = config.filter(row => row.ConfigKey === 'GlobalResourceDriveRootFolderID');
  return matches.length === 1 ? clean(matches[0].ConfigValue) : '';
}

async function verifyFile(entry, action, env) {
  if (entry.source === 'PROGRAM') {
    return action === 'cover'
      ? entry.repository.verifyCover(entry.resource, entry.roots)
      : entry.repository.verifyResource(entry.resource, entry.roots);
  }
  if (!entry.fileId) throw new Error('Protected Drive file is not configured');
  const root = entry.source === 'GLOBAL' ? entry.globalRoot : getRootFolderId(entry.courseEnv);
  if (!root) throw new Error('Drive root is not configured');
  const file = await requireItemInsideRoot(env, entry.fileId, root, { requireFile: true });
  const validation = validateFileForResourceType(file, getResourceConfig(entry.type));
  if (!validation.ok) throw new Error(validation.error);
  return file;
}
