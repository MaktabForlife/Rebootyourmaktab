import assert from 'node:assert/strict';
import { searchBookCovers, downloadBookCover } from '../src/lib/book-cover-search.js';

const originalFetch = globalThis.fetch;
const jpeg = new Uint8Array([0xff, 0xd8, 0x12, 0x34, 0xff, 0xd9]);
let requests = [];
try {
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).startsWith('https://openlibrary.org/search.json')) {
      return Response.json({ docs: [
        { key: '/works/OL123W', title: 'A Book', author_name: ['An Author'], cover_i: 12345, first_publish_year: 2020 },
        { key: '/works/OL456W', title: 'No Cover' },
        { key: '/works/OL789W', title: 'Duplicate', cover_i: 12345 }
      ] });
    }
    assert.equal(String(url), 'https://covers.openlibrary.org/b/id/12345-L.jpg?default=false');
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
  };
  const covers = await searchBookCovers('978-0-14-032872-1');
  assert.equal(new URL(requests[0].url).searchParams.get('q'), '9780140328721');
  assert.equal(covers.length, 1);
  assert.deepEqual(covers[0], {
    coverId: '12345', title: 'A Book', author: 'An Author', year: 2020,
    imageUrl: 'https://covers.openlibrary.org/b/id/12345-M.jpg?default=false',
    sourceUrl: 'https://openlibrary.org/works/OL123W'
  });
  assert.deepEqual(await downloadBookCover('12345'), jpeg);
  assert.equal(requests[1].options.redirect, 'manual');
  let hop = 0;
  globalThis.fetch = async () => {
    hop++;
    if (hop === 1) return new Response(null, { status: 302, headers: { Location: 'https://archive.org/download/olcovers24/olcovers24-L.zip/12345-L.jpg' } });
    if (hop === 2) return new Response(null, { status: 302, headers: { Location: 'https://ia600603.us.archive.org/view_archive.php?file=12345-L.jpg' } });
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
  };
  assert.deepEqual(await downloadBookCover('12345'), jpeg);
  assert.equal(hop, 3, 'The cover follows the known Archive.org image hosts');
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } });
  await assert.rejects(downloadBookCover('12345'), /unexpected site/);
  await assert.rejects(downloadBookCover('https://other.example/cover.jpg'), /Choose a cover/);
  await assert.rejects(searchBookCovers('x'), /at least|2–160/);

  globalThis.fetch = async () => new Response('not an image', { headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(downloadBookCover('12345'), /JPEG image/);
  globalThis.fetch = async () => new Response(null, { status: 404 });
  await assert.rejects(downloadBookCover('12345'), /no longer available/);
  globalThis.fetch = async () => new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(20 * 1024 * 1024 + 1) } });
  await assert.rejects(downloadBookCover('12345'), /20 MB/);
} finally {
  globalThis.fetch = originalFetch;
}
console.log('Online book cover search validates results and downloads only a selected JPEG image.');
