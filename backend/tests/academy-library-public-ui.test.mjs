import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function element() {
  const listeners = {};
  return {
    listeners, children: [], value: '', hidden: false, open: false,
    addEventListener(type, handler) { listeners[type] = handler; },
    append(child) { this.children.push(child); },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    querySelectorAll() { return []; },
    setAttribute() {},
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close?.(); },
    get options() { return this.children; }
  };
}

const ids = ['al-search', 'al-type', 'al-source', 'al-content', 'al-status', 'al-preview',
  'al-results', 'al-media', 'al-open', 'al-volume-wrap', 'al-volume', 'al-preview-source',
  'al-preview-title', 'al-preview-details', 'al-preview-status', 'al-close'];
const nodes = Object.fromEntries(ids.map(id => [id, element()]));
nodes['al-type'].value = 'ALL';
nodes['al-source'].value = 'ALL';
const tabs = ['you', 'explore'].map(view => ({ ...element(), dataset: { view } }));
const calls = [];
const archiveVolumes = [1, 2, 3, 4].map(number => ({
  number, pdfUrl: `https://archive.org/download/IhyaVol${number}/Volume${number}.pdf`
}));
const fetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url === '/api/academy/library/catalogue') return {
    ok: true, json: async () => ({ success: true, resources: [{
      id: 'REBOOT:BOOK:1', name: 'Assigned book', source: 'REBOOT',
      sourceName: 'Reboot', subject: 'Fiqh', type: 'EBOOK', forYou: true
    }] })
  };
  if (url === '/academy/open-library/catalogue') return {
    ok: true, json: async () => ({ books: [{
      id: 'EXTERNAL:INTERNET_ARCHIVE:IHYA_ULUM_AD_DIN_SET', title: 'Ihya Ulum ad-Din',
      subject: 'Islamic studies', volumes: archiveVolumes
    }, {
      id: 'EXTERNAL:INTERNET_ARCHIVE:NewBook', title: 'New public book',
      subject: 'Quran', pdfUrl: 'https://archive.org/download/NewBook/NewBook.pdf'
    }] })
  };
  if (url === '/api/academy/library/access') return {
    ok: true, json: async () => ({ success: true, url: '/private-book.pdf', mimeType: 'application/pdf' })
  };
  throw new Error(`Unexpected request: ${url}`);
};
const document = {
  getElementById: id => nodes[id],
  querySelectorAll: selector => selector === '[data-view]' ? tabs : [],
  createElement: () => element()
};
const window = { M4L_CONFIG: {}, addEventListener() {} };
const script = await readFile(new URL('../../js/m4l-academy-library.js', import.meta.url), 'utf8');
runInNewContext(script, {
  document, window, fetch, TextEncoder, btoa, encodeURIComponent,
  localStorage: { getItem: () => 'signed-in-token' }, console, setTimeout
});
await new Promise(resolve => setImmediate(resolve));

assert.match(nodes['al-results'].innerHTML, /Assigned book/);
assert.doesNotMatch(nodes['al-results'].innerHTML, /Ihya Ulum/);
tabs[1].listeners.click();
assert.match(nodes['al-results'].innerHTML, /Ihya Ulum ad-Din/);
assert.match(nodes['al-results'].innerHTML, /New public book/);
assert.match(nodes['al-results'].innerHTML, /4 volumes · Choose volume/);
assert.match(nodes['al-results'].innerHTML, /Internet Archive/);
assert.ok(nodes['al-source'].options.some(option => option.textContent === 'Internet Archive'));

function clickResource(id) {
  nodes['al-results'].listeners.click({ target: { closest: () => ({ dataset: { resource: id } }) } });
}
function displayedPdf() {
  const viewer = nodes['al-media'].children[0];
  assert.match(viewer.src, /^\/pdf-viewer\/web\/viewer\.html\?file=/);
  const proxy = new URL(viewer.src, 'https://academy.example').searchParams.get('file');
  return Buffer.from(proxy.split('/').at(-1), 'base64url').toString('utf8');
}

clickResource('EXTERNAL:INTERNET_ARCHIVE:IHYA_ULUM_AD_DIN_SET');
assert.equal(nodes['al-preview'].open, true);
assert.equal(nodes['al-volume-wrap'].hidden, false);
assert.equal(displayedPdf(), archiveVolumes[0].pdfUrl);
assert.equal(nodes['al-open'].href, archiveVolumes[0].pdfUrl);
nodes['al-volume'].listeners.change({ target: { value: '4' } });
assert.equal(displayedPdf(), archiveVolumes[3].pdfUrl);
assert.equal(nodes['al-open'].href, archiveVolumes[3].pdfUrl);
assert.equal(calls.filter(call => call.url === '/api/academy/library/access').length, 0);

nodes['al-preview'].close();
clickResource('EXTERNAL:INTERNET_ARCHIVE:NewBook');
assert.equal(nodes['al-volume-wrap'].hidden, true);
assert.equal(displayedPdf(), 'https://archive.org/download/NewBook/NewBook.pdf');
assert.equal(calls.filter(call => call.url === '/api/academy/library/access').length, 0);

nodes['al-preview'].close();
clickResource('REBOOT:BOOK:1');
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls.filter(call => call.url === '/api/academy/library/access').length, 1);
assert.equal(nodes['al-media'].children[0].src, '/private-book.pdf');
console.log('academy-library-public-ui.test.mjs: PASS');
