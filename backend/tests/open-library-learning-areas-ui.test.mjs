import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const book = { id: 'EXTERNAL:INTERNET_ARCHIVE:Book1', title: 'Public Tafseer', subject: 'Tafseer',
  pdfUrl: 'https://archive.org/download/Book1/Book1.pdf' };
const record = { id: book.id, title: 'Academy Tafseer', subject: 'Tafseer', module: 'Jalalain',
  learningAreaRefs: ['REBOOT:R1', 'GLOBAL:G1', 'PROGRAM:P1'] };
const context = createContext({
  window: { M4L_CONFIG: { API_BASE: 'https://worker.test' }, location: { href: '' } },
  state: { token: 'session-token', uniqueid: 'student' },
  localStorage: { getItem: key => ({ m4l_account_workspace: 'true',
    m4l_account_token: 'session-token' })[key] || '' },
  fetch: async url => ({ ok: true, json: async () => url === '/academy/open-library/catalogue'
    ? { books: [book] } : { records: [record] } }),
  document: {}, console, encodeURIComponent
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
}
assert.equal(linked.libraries.some(library => library.id === 'COURSE:P1'), false);
runInContext(`libraryResourceMap.set('public', { link: '/academy/open-library/?resource=Book1',
  source: { publicBook: true } })`, context);
await context.window.M4LResources.openLibraryResourceById('public');
assert.equal(context.window.location.href, '/academy/open-library/?resource=Book1');
console.log('Assigned public books appear in authorised Reboot and Global libraries and open in Academy.');
