import { getAuthUser } from '../lib/auth.js';
import { json } from '../lib/http.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { problem } from '../programs/model.js';
import { programFailure } from '../programs/errors.js';
import { isArchiveOpenLibraryId, openLibraryMetadataForClient } from '../lib/open-library-metadata.js';

const MAX_COVER_BYTES = 5 * 1024 * 1024;
async function limitedBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw problem('Book details or cover image are too large.', 413); }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function imageType(bytes) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  throw problem('Choose a JPG or PNG cover image.');
}

export async function openLibraryMetadataUser(request, env) {
  const user = await getAuthUser(request, env, { allowProgram: true });
  if (!user) throw problem('Sign in through your personal Academy account link.', 401);
  if (user.type !== 'account' ||
      !(user.role === 'GLOBAL_ADMIN' || (user.role === 'TEACHER' && user.scope === 'COURSE'))) {
    throw problem('Only Academy administrators and teachers can edit Open Library details.', 403);
  }
  return user;
}

export function openLibraryMetadataEndpoint(action) {
  return async (request, env) => {
    const publicRead = action === 'public' || action === 'cover';
    if (request.method !== (publicRead ? 'GET' : 'POST')) {
      return json({ success: false, error: `Use ${publicRead ? 'GET' : 'POST'}.` }, 405);
    }
    try {
      if (!env.PROGRAM_TIMETABLE_COORDINATOR) throw problem('Open Library storage is unavailable.', 503);
      if (!publicRead) await openLibraryMetadataUser(request, env);
      const stub = env.PROGRAM_TIMETABLE_COORDINATOR.getByName(`${getPlatformSpreadsheetId(env)}:open-library-metadata`);
      if (action === 'cover') {
        const id = new URL(request.url).searchParams.get('id');
        if (!isArchiveOpenLibraryId(id)) throw problem('This cover is unavailable.', 404);
        const key = await stub.openLibraryMetadataCoverKey(id);
        if (!key || !/^AcademyOpenLibrary\/Covers\/[0-9a-f-]{36}\.(?:jpg|png)$/.test(key)) throw problem('This cover is unavailable.', 404);
        if (!env.MEDIA_BUCKET) throw problem('Cover image storage is unavailable.', 503);
        const object = await env.MEDIA_BUCKET.get(key);
        if (!object) throw problem('This cover is unavailable.', 404);
        const mime = object.httpMetadata?.contentType;
        if (!['image/jpeg', 'image/png'].includes(mime)) throw problem('This cover is unavailable.', 404);
        return new Response(object.body, { headers: {
          'Content-Type': mime, 'Content-Length': String(object.size),
          'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff',
          'Access-Control-Allow-Origin': '*'
        } });
      }
      if (action === 'public' || action === 'list') {
        const origin = new URL(request.url).origin;
        const records = (await stub.openLibraryMetadataList()).map(record => openLibraryMetadataForClient(record, origin));
        return json({ success: true, records });
      }
      if (action !== 'save') throw problem('Unknown Open Library action.', 404);
      const multipart = /^multipart\/form-data(?:;|$)/i.test(request.headers.get('Content-Type') || '');
      const bodyBytes = await limitedBytes(request, multipart ? MAX_COVER_BYTES + 32768 : 8192);
      let input;
      let coverFile = null;
      try {
        if (multipart) {
          const form = await new Response(bodyBytes, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData();
          const details = form.get('details');
          if (typeof details !== 'string' || details.length > 8192 || form.getAll('cover').length !== 1) {
            throw problem('Invalid book details.');
          }
          input = JSON.parse(details);
          coverFile = form.get('cover');
        } else input = JSON.parse(new TextDecoder().decode(bodyBytes));
      } catch { throw problem('Invalid book details.'); }
      let key = '';
      if (coverFile) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw problem('Invalid book details.');
        input.coverUrl = '';
        if (typeof coverFile.arrayBuffer !== 'function' || coverFile.size < 1 || coverFile.size > MAX_COVER_BYTES) {
          throw problem('Choose a JPG or PNG cover image up to 5 MB.');
        }
        if (!env.MEDIA_BUCKET) throw problem('Cover image storage is unavailable.', 503);
        const bytes = new Uint8Array(await coverFile.arrayBuffer());
        const type = imageType(bytes);
        key = `AcademyOpenLibrary/Covers/${crypto.randomUUID()}.${type.extension}`;
        await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: type.mime } });
      }
      let result;
      try { result = await stub.openLibraryMetadataSave(input, request.headers.get('Authorization') || '', key); }
      catch (error) {
        if (key && error?.status === 409) await env.MEDIA_BUCKET.delete(key);
        throw error;
      }
      if (result.previousCoverKey) {
        try { await env.MEDIA_BUCKET?.delete(result.previousCoverKey); } catch { /* Saved details stay valid. */ }
      }
      return json({ success: true, record: openLibraryMetadataForClient(result, new URL(request.url).origin) });
    } catch (error) {
      const result = programFailure(error, action, 'open-library-metadata');
      return json(result, result.status);
    }
  };
}
