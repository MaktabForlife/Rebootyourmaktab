import assert from 'node:assert/strict';
import { validateOpenLibraryMetadata } from '../src/lib/open-library-metadata.js';
import { openLibraryMetadataEndpoint } from '../src/routes/open-library-metadata.js';
import { setRequestAuthUser } from '../src/lib/request-context.js';
import { problem } from '../src/programs/model.js';

const book = {
  id: 'EXTERNAL:INTERNET_ARCHIVE:SERIES:TAFSEER_UL_JALALAIN',
  title: 'Tafseer ul Jalalain', subject: 'Tafseer', module: 'Quran commentary',
  level: 'Intermediate', author: 'Imam Jalaluddin', description: 'Three volumes', coverUrl: ''
};
assert.deepEqual(validateOpenLibraryMetadata(book), { ...book, subjectRef: '', moduleRef: '' });
assert.throws(() => validateOpenLibraryMetadata({ ...book, id: 'PROGRAM:BOOK:1' }), /Choose an Archive.org book/);
assert.throws(() => validateOpenLibraryMetadata({ ...book, title: 'x'.repeat(181) }), /title must be text/);
assert.throws(() => validateOpenLibraryMetadata({ ...book, description: { html: '<script>' } }), /description must be text/);
assert.equal(validateOpenLibraryMetadata({ ...book, coverUrl: 'https://archive.org/download/book/cover.png' }).coverUrl,
  'https://archive.org/download/book/cover.png');
assert.throws(() => validateOpenLibraryMetadata({ ...book, coverUrl: 'http://example.com/cover.jpg' }), /public HTTPS/);
assert.throws(() => validateOpenLibraryMetadata({ ...book, coverUrl: 'https://example.com/file.svg' }), /public HTTPS/);

const calls = [];
const covers = new Map();
let saveError = null;
const env = {
  PLATFORM_SPREADSHEET_ID: 'platform-sheet',
  MEDIA_BUCKET: {
    async put(key, bytes, options) { covers.set(key, { bytes, mime: options.httpMetadata.contentType }); },
    async get(key) { const item = covers.get(key); return item && { body: item.bytes, size: item.bytes.length, httpMetadata: { contentType: item.mime } }; },
    async delete(key) { covers.delete(key); }
  },
  PROGRAM_TIMETABLE_COORDINATOR: {
    getByName(name) {
      assert.equal(name, 'platform-sheet:open-library-metadata');
      return {
        async openLibraryMetadataList() { calls.push('list'); return [book]; },
        async openLibraryMetadataSave(input, auth, coverKey) {
          calls.push(['save', input, auth, coverKey]);
          if (saveError) throw saveError;
          return { ...input, coverKey, revision: 1 };
        },
        async openLibraryMetadataCoverKey() { return [...covers.keys()][0] || ''; }
      };
    }
  }
};
function request(action, user, body = {}) {
  const publicRead = action === 'public';
  const value = new Request(`https://example.test/api/academy/open-library/metadata/${action}`, {
    method: publicRead ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer test-account', 'Content-Type': 'application/json' },
    ...(publicRead ? {} : { body: JSON.stringify(body) })
  });
  if (user) setRequestAuthUser(value, user);
  return value;
}
const admin = { type: 'account', role: 'GLOBAL_ADMIN', accountid: 'ADMIN-1', scope: 'PLATFORM' };
const teacher = { type: 'account', role: 'TEACHER', accountid: 'TEACHER-1', scope: 'COURSE' };
const learner = { type: 'account', role: 'STUDENT', accountid: 'LEARNER-1', scope: 'COURSE' };

let result = await openLibraryMetadataEndpoint('public')(request('public'), env);
assert.equal(result.status, 200);
assert.deepEqual((await result.json()).records, [{ ...book, hasUploadedCover: false }]);
result = await openLibraryMetadataEndpoint('list')(request('list'), env);
assert.equal(result.status, 401);
result = await openLibraryMetadataEndpoint('save')(request('save', learner, book), env);
assert.equal(result.status, 403);
result = await openLibraryMetadataEndpoint('list')(request('list', teacher), env);
assert.equal(result.status, 200);
result = await openLibraryMetadataEndpoint('save')(request('save', admin, { ...book, baseRevision: 0 }), env);
assert.equal(result.status, 200);
assert.deepEqual(calls.at(-1)[0], 'save');
assert.equal(calls.at(-1)[2], 'Bearer test-account');
assert.equal((await result.json()).record.revision, 1);
result = await openLibraryMetadataEndpoint('save')(request('save', teacher, { ...book, baseRevision: 1 }), env);
assert.equal(result.status, 200);
assert.equal(calls.at(-1)[1].baseRevision, 1);

const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
const form = new FormData();
form.append('details', JSON.stringify({ ...book, baseRevision: 1 }));
form.append('cover', new Blob([png], { type: 'image/png' }), 'cover.png');
const upload = new Request('https://example.test/api/academy/open-library/metadata/save', {
  method: 'POST', headers: { Authorization: 'Bearer test-account' }, body: form
});
setRequestAuthUser(upload, teacher);
result = await openLibraryMetadataEndpoint('save')(upload, env);
assert.equal(result.status, 200);
const uploaded = (await result.json()).record;
assert.equal(uploaded.hasUploadedCover, true);
assert.match(uploaded.coverUrl, /\/api\/academy\/open-library\/metadata\/cover\?id=/);
assert.equal(Object.hasOwn(uploaded, 'coverKey'), false);
assert.equal(covers.size, 1);
saveError = problem('Choose an active subject from the Academy list.');
const rejected = new Request('https://example.test/api/academy/open-library/metadata/save', {
  method: 'POST', headers: { Authorization: 'Bearer test-account' }, body: form
});
setRequestAuthUser(rejected, teacher);
assert.equal((await openLibraryMetadataEndpoint('save')(rejected, env)).status, 400);
assert.equal(covers.size, 1, 'Failed metadata saves remove their newly uploaded cover');
saveError = null;
result = await openLibraryMetadataEndpoint('cover')(new Request(`https://example.test/api/academy/open-library/metadata/cover?id=${encodeURIComponent(book.id)}`), env);
assert.equal(result.status, 200);
assert.equal(result.headers.get('Content-Type'), 'image/png');
assert.deepEqual(new Uint8Array(await result.arrayBuffer()), png);

const badForm = new FormData();
badForm.append('details', JSON.stringify({ ...book, baseRevision: 1 }));
badForm.append('cover', new Blob(['<svg></svg>'], { type: 'image/png' }), 'cover.png');
const badUpload = new Request('https://example.test/api/academy/open-library/metadata/save', {
  method: 'POST', headers: { Authorization: 'Bearer test-account' }, body: badForm
});
setRequestAuthUser(badUpload, admin);
assert.equal((await openLibraryMetadataEndpoint('save')(badUpload, env)).status, 400);
console.log('Open Library metadata validation, public read and teacher/admin editing access passed.');
