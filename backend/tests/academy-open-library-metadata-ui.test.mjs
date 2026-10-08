import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function element() {
  const listeners = {};
  return {
    listeners, children: [], value: '', textContent: '', hidden: false, dataset: {},
    addEventListener(type, listener) { listeners[type] = listener; },
    setAttribute() {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    showModal() { this.open = true; }
  };
}
const ids = ['ol-results', 'ol-preview', 'ol-viewer', 'ol-status', 'ol-search', 'ol-empty',
  'ol-original', 'ol-source', 'ol-title', 'ol-details', 'ol-volume-wrap', 'ol-volume', 'ol-close'];
const nodes = Object.fromEntries(ids.map(id => [id, element()]));
const archiveBook = {
  id: 'EXTERNAL:INTERNET_ARCHIVE:Book1', title: 'Archive title', subject: 'Books',
  source: 'Internet Archive', details: 'Archive author', description: 'Archive description',
  coverUrl: 'https://archive.org/download/Book1/__ia_thumb.jpg',
  pdfUrl: 'https://archive.org/download/Book1/Book1.pdf'
};
const calls = [];
const fetch = async url => {
  calls.push(url);
  if (url === '/academy/open-library/catalogue') return { ok: true, json: async () => ({ books: [archiveBook] }) };
  if (url === 'https://worker.test/api/academy/open-library/metadata/public') return {
    ok: true, json: async () => ({ success: true, records: [{
      id: archiveBook.id, title: 'Academy title', subject: 'Tafseer',
      module: 'Jalalain', level: 'Intermediate', author: 'Academy author',
      description: 'Academy description', coverUrl: 'https://worker.test/cover?id=Book1'
    }] })
  };
  throw new Error(`Unexpected URL: ${url}`);
};
const document = { getElementById: id => nodes[id], createElement: element };
const window = { M4L_CONFIG: { API_BASE: 'https://worker.test' }, location: { href: 'https://academy.test/academy/open-library/' } };
const script = await readFile(new URL('../../js/m4l-open-library.js', import.meta.url), 'utf8');
runInNewContext(script, { document, window, fetch, URLSearchParams, TextEncoder, btoa, history: { replaceState() {} } });
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(calls, ['/academy/open-library/catalogue', 'https://worker.test/api/academy/open-library/metadata/public']);
const card = nodes['ol-results'].children.find(child => child.dataset.resource === archiveBook.id);
assert(card);
assert.equal(card.children[1].textContent, 'Internet Archive · Tafseer · Jalalain');
assert.equal(card.children[2].textContent, 'Academy title');
assert.equal(card.children[0].children[0].src, 'https://worker.test/cover?id=Book1');
assert.equal(nodes['ol-status'].textContent, '');
console.log('Public Open Library applies Academy metadata while retaining the Archive PDF.');
