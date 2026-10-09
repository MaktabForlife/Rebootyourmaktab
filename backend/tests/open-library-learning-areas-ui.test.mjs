import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const book = { id: 'EXTERNAL:INTERNET_ARCHIVE:Book1', title: 'Public Tafseer', subject: 'Tafseer',
  pdfUrl: 'https://archive.org/download/Book1/Book1.pdf' };
const audio = { id: 'EXTERNAL:INTERNET_ARCHIVE:Audio1', title: 'Public recitation', subject: 'Quran',
  resourceType: 'AUDIO', mediaUrl: 'https://archive.org/download/Audio1/track.mp3',
  mediaFiles: [1, 2].map(number => ({ number, mediaUrl: `https://archive.org/download/Audio1/track${number}.mp3` })) };
const video = { id: 'EXTERNAL:INTERNET_ARCHIVE:Video1', title: 'Public lesson', subject: 'History',
  resourceType: 'VIDEO', mediaUrl: 'https://archive.org/download/Video1/lesson.mp4' };
const record = { id: book.id, title: 'Academy Tafseer', subject: 'Tafseer', module: 'Jalalain',
  learningAreaRefs: ['REBOOT:R1', 'GLOBAL:G1', 'PROGRAM:P1'] };
const mediaRecords = [audio, video].map(item => ({ id: item.id, learningAreaRefs: ['REBOOT:R1'] }));
const link = { id: 'EXTERNAL:ACADEMY_LINK:12345678-1234-1234-1234-123456789abc',
  kind: 'LINK', resourceType: 'OTHER', title: 'Public website', subject: 'Tafseer',
  module: 'General', linkUrl: 'https://example.org/learning', active: true,
  learningAreaRefs: ['REBOOT:R1', 'GLOBAL:G1'] };
const opened = [];
const context = createContext({
  window: { M4L_CONFIG: { API_BASE: 'https://worker.test' }, location: { href: '' },
    open: (...args) => opened.push(args) },
  state: { token: 'session-token', uniqueid: 'student' },
  localStorage: { getItem: key => ({ m4l_account_workspace: 'true',
    m4l_account_token: 'session-token' })[key] || '' },
  fetch: async url => ({ ok: true, json: async () => url === '/academy/open-library/catalogue'
    ? { books: [book, audio, video] } : { records: [record, ...mediaRecords, link] } }),
  document: {}, console, encodeURIComponent,
  escapeForAttribute: value => String(value), escapeHtml: value => String(value)
});
const script = await readFile(new URL('../../js/m4l-resources.js', import.meta.url), 'utf8');
runInContext(script, context);
runInContext('applyLibrarySourceSelection = () => true', context);
const original = { sources: [{ id: 'ALL', label: 'All' }, { id: 'COURSE:R1', label: 'Reboot' }],
  learningAreaRefs: ['REBOOT:R1', 'GLOBAL:G1'], libraries: [{ id: 'COURSE:R1', label: 'Reboot',
    available: true, catalogue: { count: 0, groups: [] } }] };
context.input = original;
await runInContext('loadAssignedPublicBooks(input, 0)', context);
const linked = runInContext('libraryCatalogueResult', context);
assert.equal(original.libraries[0].catalogue.count, 0, 'The cached protected catalogue stays unchanged');
assert.deepEqual(linked.libraries.map(library => library.id), ['COURSE:R1', 'GLOBAL']);
for (const library of linked.libraries) {
  const item = library.catalogue.groups[0].subjects[0].modules[0].resources[0];
  assert.equal(item.name, 'Academy Tafseer');
  assert.equal(item.publicBook, true);
  assert.equal(item.link, `/academy/open-library/?resource=${encodeURIComponent(book.id)}`);
  const other = library.catalogue.groups.find(group => group.type === 'OTHER');
  assert.equal(other.subjects[0].modules[0].resources[0].link, link.linkUrl);
  assert.equal(other.subjects[0].modules[0].resources[0].type, 'OTHER');
}
const reboot = linked.libraries.find(library => library.id === 'COURSE:R1');
assert.equal(reboot.catalogue.groups.find(group => group.type === 'AUDIO').subjects[0].modules[0].resources[0].format, 'AUDIO');
assert.equal(reboot.catalogue.groups.find(group => group.type === 'AUDIO').subjects[0].modules[0].resources[0].partCount, 2);
assert.equal(reboot.catalogue.groups.find(group => group.type === 'VIDEO').subjects[0].modules[0].resources[0].format, 'VIDEO');
for (const [category, included, excluded] of [
  ['PDF', ['EBOOK', 'PRINTABLE'], ['AUDIO', 'VIDEO', 'OTHER']],
  ['AUDIO_VISUAL', ['AUDIO', 'VIDEO'], ['EBOOK', 'PRINTABLE', 'OTHER']],
  ['OTHER', ['OTHER'], ['EBOOK', 'PRINTABLE', 'AUDIO', 'VIDEO']]
]) {
  runInContext(`selectedLibraryCategory = ${JSON.stringify(category)}`, context);
  for (const type of included) assert.equal(runInContext(`matchesLibraryCategory(${JSON.stringify(type)})`, context), true);
  for (const type of excluded) assert.equal(runInContext(`matchesLibraryCategory(${JSON.stringify(type)})`, context), false);
}
context.card = { id: audio.id, type: 'AUDIO', typeLabel: 'Audio', typeClass: 'audio',
  previewId: 'preview', title: audio.title, icon: '/icons/audio.svg',
  source: { partCount: 2, partLabel: 'recordings' } };
assert.match(runInContext('renderLibraryResourceCard(card)', context), /2 recordings/);
assert.equal(linked.libraries.some(library => library.id === 'COURSE:P1'), false);
runInContext(`libraryResourceMap.set('public', { link: '/academy/open-library/?resource=Book1',
  source: { publicBook: true } })`, context);
await context.window.M4LResources.openLibraryResourceById('public');
assert.equal(context.window.location.href, '/academy/open-library/?resource=Book1');
runInContext(`libraryResourceMap.set('site', { link: 'https://example.org/learning',
  source: { publicBook: true } })`, context);
await context.window.M4LResources.openLibraryResourceById('site');
assert.deepEqual(opened, [['https://example.org/learning', '_blank', 'noopener,noreferrer']]);
console.log('Assigned public books appear in authorised Reboot and Global libraries and open in Academy.');
