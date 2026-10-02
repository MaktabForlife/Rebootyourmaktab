import assert from 'node:assert/strict';
import { legacyR2ObjectKey, r2MediaMimeType, createR2MediaToken,
  streamR2MediaEndpoint } from '../src/lib/academy-r2-media.js';

const base = 'https://pub-d0f00cecdced454598b794da754a3939.r2.dev/';
const key = 'Resources/video/Quran/Lesson 1.mp4';
assert.equal(legacyR2ObjectKey(`${base}Resources/video/Quran/Lesson%201.mp4`), key);
for (const link of [
  'https://other.r2.dev/Resources/video/Quran/Lesson%201.mp4',
  `${base}other/Lesson.mp4`, `${base}Resources/video/Lesson.mp4?download=1`,
  `${base}Resources/video/%5Cprivate.mp4`, `${base}Resources/video/%00bad.mp4`
]) assert.equal(legacyR2ObjectKey(link), '', `Reject untrusted R2 link: ${link}`);
assert.equal(r2MediaMimeType('Part 1.pdf', { httpMetadata: {} }), 'application/pdf');
assert.equal(r2MediaMimeType('Surah.mp3', { httpMetadata: {} }), 'audio/mpeg');
assert.equal(r2MediaMimeType('Lesson.mp4', { httpMetadata: {} }), 'video/mp4');

const bytes = new TextEncoder().encode('0123456789');
const metadata = { key, etag: 'version-one', size: bytes.length, httpMetadata: {} };
const env = { SESSION_SECRET: 'academy-r2-test-secret', MEDIA_BUCKET: {
  head: async requested => requested === key ? metadata : null,
  get: async (requested, options) => {
    if (requested !== key) return null;
    const range = options?.range?.get('Range');
    if (range === 'bytes=2-5') return { ...metadata, range: { offset: 2, length: 4 },
      body: new Response(bytes.slice(2, 6)).body };
    return { ...metadata, body: new Response(bytes).body };
  }
} };
const token = await createR2MediaToken({ key, etag: metadata.etag,
  filename: 'Lesson 1.mp4', mimeType: 'video/mp4' }, env);
assert(!token.includes('Resources') && !token.includes('Lesson'), 'The access link must not reveal the public R2 key');
const url = `https://worker.test/api/academy/library/media?access=${encodeURIComponent(token)}`;
const full = await streamR2MediaEndpoint(new Request(url), env);
assert.equal(full.status, 200);
assert.equal(full.headers.get('content-type'), 'video/mp4');
assert.equal(full.headers.get('content-length'), '10');
assert.equal(await full.text(), '0123456789');
const partial = await streamR2MediaEndpoint(new Request(url, { headers: { Range: 'bytes=2-5' } }), env);
assert.equal(partial.status, 206);
assert.equal(partial.headers.get('content-range'), 'bytes 2-5/10');
assert.equal(await partial.text(), '2345');
const head = await streamR2MediaEndpoint(new Request(url, { method: 'HEAD' }), env);
assert.equal(head.status, 200);
assert.equal(head.headers.get('content-length'), '10');
assert.equal((await streamR2MediaEndpoint(new Request(url, { headers: { Range: 'bytes=0-1,4-5' } }), env)).status, 416);
assert.equal((await streamR2MediaEndpoint(new Request(url.replace(token, `${token}x`)), env)).status, 401);
metadata.etag = 'version-two';
assert.equal((await streamR2MediaEndpoint(new Request(url), env)).status, 404,
  'Replacing an R2 object invalidates its previously issued link');

console.log('Academy R2 media links, encryption, byte ranges and revocation checks passed.');
