import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function element() {
  const listeners = {};
  return { listeners, value: '', textContent: '', innerHTML: '', hidden: false, children: [],
    classList: { toggle() {} }, addEventListener(name, fn) { listeners[name] = fn; },
    append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; },
    querySelectorAll() { return []; }, showModal() { this.open = true; }, close() { this.open = false; } };
}
const ids = ['lv-status', 'lv-search', 'lv-type', 'lv-subjects', 'lv-results', 'lv-title', 'lv-account',
  'lv-manage', 'lv-controls', 'lv-refresh', 'lv-preview', 'lv-preview-title', 'lv-preview-type',
  'lv-preview-details', 'lv-preview-status', 'lv-preview-media', 'lv-open-file', 'lv-volume-wrap',
  'lv-volume', 'lv-volume-label', 'lv-close'];
const nodes = Object.fromEntries(ids.map(id => [id, element()]));
nodes['lv-type'].value = 'ALL';
const programId = 'PRG-12345678-1234-1234-1234-123456789abc';
const book = { id: 'EXTERNAL:INTERNET_ARCHIVE:SERIES', title: 'Archive title', subject: 'Tafseer',
  volumes: [1, 2].map(number => ({ number, pdfUrl: `https://archive.org/download/Series/Book${number}.pdf` })) };
const audio = { id: 'EXTERNAL:INTERNET_ARCHIVE:AUDIO', title: 'Public audio', subject: 'Quran',
  resourceType: 'AUDIO', mediaUrl: 'https://archive.org/download/AUDIO/track.mp3',
  mediaFiles: [{ number: 1, label: 'Track', mediaUrl: 'https://archive.org/download/AUDIO/track.mp3' }] };
const video = { id: 'EXTERNAL:INTERNET_ARCHIVE:VIDEO', title: 'Public video', subject: 'History',
  resourceType: 'VIDEO', mediaUrl: 'https://archive.org/download/VIDEO/lesson.mp4',
  mediaFiles: [{ number: 1, label: 'Lesson', mediaUrl: 'https://archive.org/download/VIDEO/lesson.mp4' }] };
const linkId = 'EXTERNAL:ACADEMY_LINK:12345678-1234-1234-1234-123456789abc';
const calls = [];
const opened = [];
const fetch = async (url, options) => {
  calls.push(url);
  if (url.endsWith('/api/program-library/catalogue')) return { ok: true, json: async () => ({ success: true,
    program: { name: 'Aalimiya' }, accountPath: '/account/student', role: 'STUDENT', canManage: false, resources: [] }) };
  if (url === '/academy/open-library/catalogue') return { ok: true, json: async () => ({ books: [book, audio, video] }) };
  if (url.endsWith('/api/academy/open-library/metadata/public')) return { ok: true, json: async () => ({ records: [{
    id: book.id, title: 'Academy Tafseer', subject: 'Tafseer', module: 'Jalalain',
    coverUrl: 'https://example.test/cover.png', learningAreaRefs: [`PROGRAM:${programId}`]
  }, { id: audio.id, learningAreaRefs: [`PROGRAM:${programId}`]
  }, { id: video.id, learningAreaRefs: [`PROGRAM:${programId}`]
  }, {
    id: linkId, kind: 'LINK', resourceType: 'OTHER', active: true,
    title: 'Useful website', subject: 'Tafseer', linkUrl: 'https://example.org/learning',
    learningAreaRefs: [`PROGRAM:${programId}`]
  }] }) };
  throw new Error(`Unexpected request ${url}`);
};
const document = { getElementById: id => nodes[id], createElement: element,
  querySelectorAll: () => [] };
const window = { M4L_CONFIG: { API_BASE: 'https://worker.test' }, setTimeout,
  open: (...args) => opened.push(args) };
const script = await readFile(new URL('../../js/m4l-program-library-view.js', import.meta.url), 'utf8');
runInNewContext(script, { document, window, location: { search: `?program=${programId}` },
  localStorage: { getItem: () => 'token' }, fetch, URLSearchParams, TextEncoder, btoa,
  encodeURIComponent, Date, console });
await new Promise(resolve => setImmediate(resolve));
assert.match(nodes['lv-results'].innerHTML, /Academy Tafseer/);
assert.match(nodes['lv-results'].innerHTML, /Jalalain/);
assert.match(nodes['lv-results'].innerHTML, /cover\.png/);
assert.match(nodes['lv-results'].innerHTML, /Useful website/);
nodes['lv-results'].listeners.click({ target: { closest: () => ({ dataset: { resource: book.id } }) } });
assert.equal(nodes['lv-preview'].open, true);
assert.equal(nodes['lv-volume-wrap'].hidden, false);
assert.match(nodes['lv-preview-media'].children[0].src, /pdf-viewer\/web\/viewer\.html/);
assert.equal(nodes['lv-open-file'].href, book.volumes[0].pdfUrl);
nodes['lv-volume'].listeners.change({ target: { value: '2' } });
assert.equal(nodes['lv-open-file'].href, book.volumes[1].pdfUrl);
assert.equal(calls.filter(url => url.endsWith('/api/program-library/access')).length, 0);
nodes['lv-preview'].close();
nodes['lv-results'].listeners.click({ target: { closest: () => ({ dataset: { resource: linkId } }) } });
assert.deepEqual(opened, [['https://example.org/learning', '_blank', 'noopener,noreferrer']]);
assert.equal(nodes['lv-preview'].open, false);
nodes['lv-results'].listeners.click({ target: { closest: () => ({ dataset: { resource: audio.id } }) } });
assert.equal(nodes['lv-preview-media'].children[0].src, audio.mediaUrl);
assert.equal(nodes['lv-preview-media'].children[0].controls, true);
nodes['lv-preview'].close();
nodes['lv-results'].listeners.click({ target: { closest: () => ({ dataset: { resource: video.id } }) } });
assert.equal(nodes['lv-preview-media'].children[0].src, video.mediaUrl);
assert.equal(nodes['lv-preview-type'].textContent, 'Video');
console.log('Assigned public volumes appear in the Program Library and open in its PDF reader.');
