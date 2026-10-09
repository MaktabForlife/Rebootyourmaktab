import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function element(tagName = '') {
  const listeners = {};
  return {
    listeners, children: [], value: '', textContent: '', hidden: false, dataset: {}, tagName,
    addEventListener(type, listener) { listeners[type] = listener; },
    setAttribute() {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    showModal() { this.open = true; }, close() { this.open = false; this.listeners.close?.(); }
  };
}
const ids = ['ol-results', 'ol-preview', 'ol-viewer', 'ol-status', 'ol-search', 'ol-empty',
  'ol-original', 'ol-source', 'ol-title', 'ol-details', 'ol-volume-wrap', 'ol-volume-label', 'ol-volume', 'ol-close', 'ol-media', 'ol-categories'];
const nodes = Object.fromEntries(ids.map(id => [id, element()]));
const categoryButtons = ['ALL', 'EBOOK', 'PRINTABLE', 'AUDIO', 'VIDEO', 'OTHER'].map(category => ({ dataset: { category }, setAttribute() {} }));
nodes['ol-categories'].querySelectorAll = () => categoryButtons;
const chooseCategory = category => nodes['ol-categories'].listeners.click({
  target: { closest: () => categoryButtons.find(button => button.dataset.category === category) }
});
const archiveBook = {
  id: 'EXTERNAL:INTERNET_ARCHIVE:Book1', title: 'Archive title', subject: 'Books',
  source: 'Internet Archive', details: 'Archive author', description: 'Archive description',
  coverUrl: 'https://archive.org/download/Book1/__ia_thumb.jpg',
  volumes: [1, 2].map(number => ({ number, pdfUrl: `https://archive.org/download/Book1/Book${number}.pdf` }))
};
const archiveAudio = { id: 'EXTERNAL:INTERNET_ARCHIVE:Audio1', title: 'Recitation lessons',
  subject: 'Quran', source: 'Internet Archive', resourceType: 'AUDIO',
  mediaUrl: 'https://archive.org/download/Audio1/lesson1.mp3', mediaFiles: [1, 2].map(number => ({
    number, label: `Lesson ${number}`, mediaUrl: `https://archive.org/download/Audio1/lesson${number}.mp3` })) };
const archiveVideo = { id: 'EXTERNAL:INTERNET_ARCHIVE:Video1', title: 'History lesson',
  subject: 'History', source: 'Internet Archive', resourceType: 'VIDEO',
  mediaUrl: 'https://archive.org/download/Video1/history.mp4', mediaFiles: [1, 2].map(number => ({
    number, label: `History ${number}`, mediaUrl: `https://archive.org/download/Video1/history${number}.mp4` })) };
const calls = [];
const fetch = async url => {
  calls.push(url);
  if (url === '/academy/open-library/catalogue') return { ok: true, json: async () => ({ books: [archiveBook, archiveAudio, archiveVideo] }) };
  if (url === 'https://worker.test/api/academy/open-library/metadata/public') return {
    ok: true, json: async () => ({ success: true, records: [{
      id: archiveBook.id, title: 'Academy title', subject: 'Tafseer',
      resourceType: 'PRINTABLE',
      module: 'Jalalain', learningAreas: ['Aalimiya', 'Quran'], author: 'Academy author',
      description: 'Academy description', coverUrl: 'https://worker.test/cover?id=Book1'
    }, {
      id: 'EXTERNAL:ACADEMY_LINK:12345678-1234-1234-1234-123456789abc',
      kind: 'LINK', resourceType: 'OTHER', active: true, title: 'Learning website',
      subject: 'Websites', linkUrl: 'https://example.org/learning', coverUrl: ''
    }] })
  };
  throw new Error(`Unexpected URL: ${url}`);
};
const document = { getElementById: id => nodes[id], createElement: element };
const window = { M4L_CONFIG: { API_BASE: 'https://worker.test' }, location: { href: 'https://academy.test/academy/open-library/' } };
const script = await readFile(new URL('../../js/m4l-open-library.js', import.meta.url), 'utf8');
runInNewContext(script, { document, window, fetch, URL, URLSearchParams, TextEncoder, btoa, history: { replaceState() {} } });
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(calls, ['/academy/open-library/catalogue', 'https://worker.test/api/academy/open-library/metadata/public']);
const sections = nodes['ol-results'].children;
assert.deepEqual(sections.map(section => section.children[0].textContent), ['Duas', 'History', 'Quran', 'Tafseer', 'Websites']);
assert(sections.every(section => section.className === 'ol-subject'));
const card = sections[3].children[1].children[0];
assert(card);
assert.equal(card.dataset.resource, archiveBook.id);
assert.equal(card.children[1].children[0].children[0].src, '/icons/printable.svg');
assert.equal(card.children[1].children[0].children[1].textContent, 'Academy title');
assert.equal(card.children[1].children[1].textContent, '2 volumes →');
assert.equal(card.children[0].children[0].src, 'https://worker.test/cover?id=Book1');
const linkCard = sections[4].children[1].children[0];
assert.equal(linkCard.tagName, 'a');
assert.equal(linkCard.href, 'https://example.org/learning');
assert.equal(linkCard.target, '_blank');
assert.equal(linkCard.rel, 'noopener noreferrer');
assert.equal(linkCard.children[0].children[0].src, '/icons/other.svg');
assert.equal(linkCard.children[1].children[0].children[0].src, '/icons/other.svg');
assert.equal(linkCard.children[1].children.at(-1).textContent, 'Visit website ↗');
assert.equal(sections[0].children[1].children[0].children[1].children.length, 2,
  'Each card shows an icon with its title and reading action');
assert.equal(sections[0].children[1].children[0].children[1].children[0].children[0].src, '/icons/ebook.svg');
assert.equal(sections[1].children[1].children[0].children[1].children[0].children[0].src, '/icons/video.svg');
assert.equal(sections[2].children[1].children[0].children[1].children[0].children[0].src, '/icons/audio.svg');
assert.equal(JSON.stringify(sections).includes('Aalimiya'), false);
assert.equal(JSON.stringify(sections).includes('Quran +1'), false);
assert.equal(JSON.stringify(sections).includes('Internet Archive'), false);
assert.equal(JSON.stringify(sections).includes('Open Library'), false);
assert.equal(JSON.stringify(sections).includes('Jalalain'), false);
assert.equal(JSON.stringify(sections).includes('Choose volume'), false);
const css = await readFile(new URL('../../css/m4l-open-library.css', import.meta.url), 'utf8');
assert.match(css, /#ol-results\{[^}]*grid-auto-flow:column/);
assert.match(css, /\.ol-subject-books\{[^}]*display:grid/);
nodes['ol-search'].value = 'Jalalain';
nodes['ol-search'].listeners.input();
assert.deepEqual(nodes['ol-results'].children.map(section => section.children[0].textContent), ['Tafseer']);
assert.equal(nodes['ol-status'].textContent, '');
nodes['ol-search'].value = '';
chooseCategory('PRINTABLE');
assert.deepEqual(nodes['ol-results'].children.map(section => section.children[0].textContent), ['Tafseer']);
chooseCategory('AUDIO');
assert.deepEqual(nodes['ol-results'].children.map(section => section.children[0].textContent), ['Quran']);
assert.equal(nodes['ol-results'].children[0].children[1].children[0].children[1].children.at(-1).textContent, '2 recordings · Listen →');
nodes['ol-results'].listeners.click({ target: { closest: () => ({ dataset: { resource: archiveAudio.id } }) } });
assert.equal(nodes['ol-preview'].open, true);
assert.equal(nodes['ol-viewer'].hidden, true);
assert.equal(nodes['ol-media'].children[0].tagName, 'audio');
assert.equal(nodes['ol-volume-label'].textContent, 'Track');
nodes['ol-volume'].listeners.change({ target: { value: '2' } });
assert.equal(nodes['ol-media'].children[0].src, archiveAudio.mediaFiles[1].mediaUrl);
nodes['ol-preview'].close();
assert.equal(nodes['ol-media'].children.length, 0, 'Closing the preview stops playback');
chooseCategory('VIDEO');
assert.deepEqual(nodes['ol-results'].children.map(section => section.children[0].textContent), ['History']);
assert.equal(nodes['ol-results'].children[0].children[1].children[0].children[1].children.at(-1).textContent, '2 recordings · Watch →');
nodes['ol-results'].listeners.click({ target: { closest: () => ({ dataset: { resource: archiveVideo.id } }) } });
assert.equal(nodes['ol-media'].children[0].tagName, 'video');
assert.equal(nodes['ol-original'].href, archiveVideo.mediaFiles[0].mediaUrl);
chooseCategory('OTHER');
assert.deepEqual(nodes['ol-results'].children.map(section => section.children[0].textContent), ['Websites']);
const html = await readFile(new URL('../../academy/open-library/index.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /Selected public books, audio and video|appear here automatically/);
assert.match(html, /data-category="PRINTABLE"/);
console.log('Public Open Library applies Academy metadata while retaining the Archive PDF.');
