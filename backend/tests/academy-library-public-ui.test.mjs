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

const ids = ['al-search', 'al-categories', 'al-source', 'al-content', 'al-status', 'al-preview',
  'al-results', 'al-media', 'al-open', 'al-volume-wrap', 'al-volume-label', 'al-volume', 'al-preview-source',
  'al-preview-title', 'al-preview-details', 'al-preview-status', 'al-close', 'al-manage-books'];
const nodes = Object.fromEntries(ids.map(id => [id, element()]));
nodes['al-source'].value = 'ALL';
const categoryButtons = ['ALL', 'PDF', 'AUDIOVISUAL', 'OTHER'].map(category => ({ dataset: { category }, setAttribute() {} }));
nodes['al-categories'].querySelectorAll = () => categoryButtons;
const chooseCategory = category => nodes['al-categories'].listeners.click({
  target: { closest: () => categoryButtons.find(button => button.dataset.category === category) }
});
const tabs = ['you', 'explore'].map(view => ({ ...element(), dataset: { view } }));
const calls = [];
const opened = [];
const linkId = 'EXTERNAL:ACADEMY_LINK:12345678-1234-1234-1234-123456789abc';
const archiveVolumes = [1, 2, 3, 4].map(number => ({
  number, pdfUrl: `https://archive.org/download/IhyaVol${number}/Volume${number}.pdf`
}));
const fetch = async (url, options = {}) => {
  calls.push({ url, options });
  if (url === '/api/academy/library/catalogue') return {
    ok: true, json: async () => ({ success: true, learningAreaRefs: ['PROGRAM:P1'], resources: [{
      id: 'PROGRAM:P1:BOOK1', name: 'Assigned book', source: 'PROGRAM',
      sourceName: 'Reboot', subject: 'Fiqh', type: 'EBOOK', forYou: true
    }, {
      id: 'PROGRAM:P2:AUDIO1', name: 'Second Program audio', source: 'PROGRAM',
      sourceName: 'Hifz', subject: 'Fiqh', type: 'AUDIO', forYou: true
    }, {
      id: 'PROGRAM:P2:VIDEO1', name: 'Assigned video', source: 'PROGRAM',
      sourceName: 'Hifz', subject: 'Quran', type: 'VIDEO', forYou: true
    }, {
      id: 'GLOBAL:BOOK1', name: 'Course book', source: 'GLOBAL',
      sourceName: 'Courses', subject: 'Arabic', type: 'PRINTABLE', forYou: true
    }] })
  };
  if (url === '/academy/open-library/catalogue') return {
    ok: true, json: async () => ({ books: [{
      id: 'EXTERNAL:INTERNET_ARCHIVE:IHYA_ULUM_AD_DIN_SET', title: 'Ihya Ulum ad-Din',
      subject: 'Islamic studies', volumes: archiveVolumes
    }, {
      id: 'EXTERNAL:INTERNET_ARCHIVE:NewBook', title: 'New public book',
      subject: 'Quran', pdfUrl: 'https://archive.org/download/NewBook/NewBook.pdf'
    }, {
      id: 'EXTERNAL:INTERNET_ARCHIVE:Audio1', title: 'Public audio', subject: 'Quran',
      resourceType: 'AUDIO', mediaUrl: 'https://archive.org/download/Audio1/track.mp3',
      mediaFiles: [{ number: 1, label: 'Track', mediaUrl: 'https://archive.org/download/Audio1/track.mp3' }]
    }, {
      id: 'EXTERNAL:INTERNET_ARCHIVE:Video1', title: 'Public video', subject: 'History',
      resourceType: 'VIDEO', mediaUrl: 'https://archive.org/download/Video1/film.mp4',
      mediaFiles: [{ number: 1, label: 'Film', mediaUrl: 'https://archive.org/download/Video1/film.mp4' }]
    }] })
  };
  if (url === '/api/academy/open-library/metadata/public') return {
    ok: true, json: async () => ({ success: true, records: [{
      id: 'EXTERNAL:INTERNET_ARCHIVE:NewBook', title: 'Academy Quran book',
      subject: 'Tafseer', module: 'Introduction', learningAreas: ['Aalimiya', 'Quran'],
      learningAreaRefs: ['PROGRAM:P1', 'GLOBAL:S2'],
      author: 'Academy author', description: 'Academy description',
      coverUrl: 'https://example.test/cover.png'
    }, {
      id: linkId, kind: 'LINK', resourceType: 'OTHER', active: true,
      title: 'Useful website', subject: 'Tafseer', linkUrl: 'https://example.org/learning',
      learningAreaRefs: ['PROGRAM:P1']
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
const window = { M4L_CONFIG: {}, addEventListener() {},
  open: (...args) => opened.push(args) };
const script = await readFile(new URL('../../js/m4l-academy-library.js', import.meta.url), 'utf8');
runInNewContext(script, {
  document, window, fetch, TextEncoder, btoa, encodeURIComponent,
  localStorage: { getItem: () => 'signed-in-token' }, console, setTimeout
});
await new Promise(resolve => setImmediate(resolve));

assert.match(nodes['al-results'].innerHTML, /Assigned book/);
assert.match(nodes['al-results'].innerHTML, /Second Program audio/);
assert.equal((nodes['al-results'].innerHTML.match(/<h2>Fiqh<\/h2>/g)||[]).length,1,'The same subject from two Programs shares one column');
assert.match(nodes['al-results'].innerHTML, /al-subject-books/);
assert.match(nodes['al-results'].innerHTML, /Course book/);
assert.equal(nodes['al-source'].value, 'ALL');
assert.deepEqual(JSON.parse(calls.find(call => call.url === '/api/academy/library/catalogue').options.body), {}, 'For You must not send a current Program filter');
assert.match(nodes['al-results'].innerHTML, /Academy Quran book/);
assert.match(nodes['al-results'].innerHTML, /Useful website/);
assert.doesNotMatch(nodes['al-results'].innerHTML, /Aalimiya|Quran \+1/);
assert.match(nodes['al-results'].innerHTML, /al-card-title"><img src="\/icons\/ebook\.svg"/);
assert.match(nodes['al-results'].innerHTML, /al-card-title"><img src="\/icons\/other\.svg"/);
assert.doesNotMatch(nodes['al-results'].innerHTML, /Ihya Ulum/);
const personalHtml = await readFile(new URL('../../academy/library/index.html', import.meta.url), 'utf8');
assert.match(personalHtml, /href="\/academy\/open-library\/">Explore/);
assert.match(personalHtml, /href="\/academy\/library\/" aria-current="page">For You/);
chooseCategory('OTHER');
assert.match(nodes['al-results'].innerHTML, /Useful website/);
assert.doesNotMatch(nodes['al-results'].innerHTML, /Assigned book|Academy Quran book/);
chooseCategory('PDF');
assert.match(nodes['al-results'].innerHTML, /Assigned book/);
assert.match(nodes['al-results'].innerHTML, /Course book/,'PDF includes Printables without changing their stored type');
assert.match(nodes['al-results'].innerHTML, /Academy Quran book/);
assert.doesNotMatch(nodes['al-results'].innerHTML,/Second Program audio|Public audio|Public video/);
assert.doesNotMatch(nodes['al-results'].innerHTML, /Useful website/);
chooseCategory('AUDIOVISUAL');
assert.match(nodes['al-results'].innerHTML,/Second Program audio/);
assert.match(nodes['al-results'].innerHTML,/Assigned video/);
assert.doesNotMatch(nodes['al-results'].innerHTML,/Public audio|Public video/,'Grouping filters must not grant extra For You entitlements');
assert.doesNotMatch(nodes['al-results'].innerHTML,/Assigned book|Course book|Useful website/);
chooseCategory('ALL');
assert.match(nodes['al-results'].innerHTML, /Introduction/);
assert.match(nodes['al-results'].innerHTML, /https:\/\/example\.test\/cover\.png/);
assert.match(nodes['al-results'].innerHTML, /<h2>Tafseer<\/h2>/);
clickResource(linkId);
assert.deepEqual(opened, [['https://example.org/learning', '_blank', 'noopener,noreferrer']]);

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
clickResource('PROGRAM:P1:BOOK1');
await new Promise(resolve => setImmediate(resolve));
assert.equal(calls.filter(call => call.url === '/api/academy/library/access').length, 1);
assert.equal(nodes['al-media'].children[0].src, '/private-book.pdf');
nodes['al-preview'].close();
clickResource('EXTERNAL:INTERNET_ARCHIVE:Audio1');
assert.equal(nodes['al-media'].children[0].src, 'https://archive.org/download/Audio1/track.mp3');
assert.equal(nodes['al-media'].children[0].controls, true);
assert.equal(nodes['al-open'].hidden, false);
nodes['al-preview'].close();
clickResource('EXTERNAL:INTERNET_ARCHIVE:Video1');
assert.equal(nodes['al-media'].children[0].src, 'https://archive.org/download/Video1/film.mp4');
assert.equal(nodes['al-preview-details'].textContent.startsWith('VIDEO'), true);
console.log('academy-library-public-ui.test.mjs: PASS');
