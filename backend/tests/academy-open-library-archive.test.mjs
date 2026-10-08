import assert from 'node:assert/strict';
import { onRequestGet as catalogue } from '../../functions/academy/open-library/catalogue.js';
import { onRequestGet as pdfProxy } from '../../functions/pdf-file/[encoded].js';

const originalFetch = globalThis.fetch;
const listUrl = 'https://archive.org/services/users/@hbn_naidu/lists/1';
let members = ['IhyaUlumAlDinVol1_201503', 'IhyaUlumAlDinVol2', 'IhyaUlumAlDinVol4'];
let badRedirect = false;
let listRedirect = false;
const calls = [];
const metadata = Object.fromEntries(members.map((identifier, index) => [identifier, {
  metadata: { mediatype: 'texts', title: `Ihya volume ${[1, 2, 4][index]}`, subject: 'Sufism' },
  files: [{ name: `Ihya Ulum Al Din Vol ${[1, 2, 4][index]}.pdf`, source: 'original', private: false }]
}]));
metadata.GAZALIIhyaUlumAlDin4 = {
  metadata: { mediatype: 'texts', title: 'Ihya ulum al-din, vol. 4' },
  files: [{ name: 'GAZALI__-Ihya-Ulum-Al-Din-4.pdf', source: 'original' }]
};
metadata.IhyaUlumAlDinVol3 = {
  metadata: { mediatype: 'texts', title: 'Ihya volume 3' },
  files: [{ name: 'Ihya Ulum Al Din Vol 3.pdf', source: 'original' }]
};

globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  calls.push({ url, options });
  if (url === listUrl) {
    assert.equal(options.redirect, 'manual', 'Workers-compatible manual redirects keep list requests on Archive.org');
    if (listRedirect) return new Response(null, { status: 302, headers: { Location: 'https://evil.example/list' } });
    return Response.json({ value: { members: members.map(identifier => ({ identifier })) } });
  }
  if (url.startsWith('https://archive.org/metadata/')) {
    assert.equal(options.redirect, 'manual', 'Workers-compatible manual redirects keep metadata requests on Archive.org');
    const identifier = decodeURIComponent(url.split('/').at(-1));
    return metadata[identifier] ? Response.json(metadata[identifier]) : new Response('missing', { status: 404 });
  }
  if (url.startsWith('https://archive.org/download/')) {
    return new Response(null, {
      status: 302,
      headers: { Location: badRedirect ? 'https://evil.example/book.pdf' : url.replace('https://archive.org/', 'https://dn760103.eu.archive.org/') }
    });
  }
  if (url.startsWith('https://dn760103.eu.archive.org/')) {
    return new Response(new Uint8Array([37, 80, 68, 70]), {
      status: options.headers?.get('Range') ? 206 : 200,
      headers: { 'Content-Type': 'application/pdf', 'Set-Cookie': 'archive=1' }
    });
  }
  throw new Error(`Unexpected request: ${url}`);
};

function encodedUrl(url) {
  return Buffer.from(url, 'utf8').toString('base64url');
}

async function openProxy(url, range = '') {
  const encoded = encodedUrl(url);
  const headers = range ? { Range: range } : {};
  return pdfProxy({
    params: { encoded },
    request: new Request(`https://academy.example/pdf-file/${encoded}`, { headers })
  });
}

try {
  const first = await catalogue();
  assert.equal(first.status, 200);
  assert.match(first.headers.get('Cache-Control'), /max-age=300/);
  const firstBooks = (await first.json()).books;
  assert.equal(firstBooks.length, 1);
  assert.equal(firstBooks[0].id, 'EXTERNAL:INTERNET_ARCHIVE:IHYA_ULUM_AD_DIN_SET');
  assert.deepEqual(firstBooks[0].volumes.map(volume => volume.number), [1, 2, 3, 4]);
  assert.equal(firstBooks[0].volumes[0].pdfUrl, 'https://archive.org/download/IhyaUlumAlDinVol1_201503/Ihya%20Ulum%20Al%20Din%20Vol%201.pdf');
  assert.equal(firstBooks[0].volumes[2].pdfUrl, 'https://archive.org/download/IhyaUlumAlDinVol3/Ihya%20Ulum%20Al%20Din%20Vol%203.pdf');
  assert.equal(firstBooks[0].volumes[3].pdfUrl, 'https://archive.org/download/GAZALIIhyaUlumAlDin4/GAZALI__-Ihya-Ulum-Al-Din-4.pdf');

  listRedirect = true;
  assert.equal((await catalogue()).status, 502);
  listRedirect = false;

  members.push('NewBook', 'PrivateBook', 'NoDownloadBook');
  metadata.NewBook = {
    metadata: { mediatype: 'texts', title: 'New public book' },
    files: [{ name: 'New Book.pdf', source: 'original' }]
  };
  metadata.PrivateBook = {
    metadata: { mediatype: 'texts', title: 'Restricted book' },
    files: [{ name: 'Private.pdf', source: 'original', private: true }]
  };
  metadata.NoDownloadBook = {
    nodownload: true,
    metadata: { mediatype: 'texts', title: 'Download disabled' },
    files: [{ name: 'Blocked.pdf', source: 'original' }]
  };
  const refreshedBooks = (await (await catalogue()).json()).books;
  assert.equal(refreshedBooks.length, 2);
  assert.deepEqual(refreshedBooks[0].volumes.map(volume => volume.number), [1, 2, 3, 4]);
  assert.ok(refreshedBooks.some(book => book.title === 'New public book'));
  assert.ok(!refreshedBooks.some(book => book.title === 'Restricted book'));
  assert.ok(!refreshedBooks.some(book => book.title === 'Download disabled'));

  const rangeResponse = await openProxy(firstBooks[0].volumes[0].pdfUrl, 'bytes=0-3');
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('Content-Type'), 'application/pdf');
  assert.equal(rangeResponse.headers.get('Set-Cookie'), null);
  assert.match(rangeResponse.headers.get('Cache-Control'), /no-store/);
  assert.equal(calls.at(-1).options.headers.get('Range'), 'bytes=0-3');
  assert.equal(calls.at(-1).options.redirect, 'manual');
  assert.equal((await openProxy(firstBooks[0].volumes[2].pdfUrl)).status, 200);
  assert.equal((await openProxy(firstBooks[0].volumes[3].pdfUrl)).status, 200);

  assert.equal((await openProxy('https://archive.org/download/Unlisted/book.pdf')).status, 403);
  assert.equal((await openProxy('https://archive.org/download/PrivateBook/Private.pdf')).status, 403);
  assert.equal((await openProxy('https://archive.org/download/NoDownloadBook/Blocked.pdf')).status, 403);
  assert.equal((await openProxy(`${firstBooks[0].volumes[0].pdfUrl}?other=1`)).status, 403);

  metadata.GAZALIIhyaUlumAlDin4.nodownload = true;
  const restrictedBooks = (await (await catalogue()).json()).books;
  assert.deepEqual(restrictedBooks[0].volumes.map(volume => volume.number), [1, 2, 3]);
  assert.equal((await openProxy(firstBooks[0].volumes[3].pdfUrl)).status, 403);
  delete metadata.GAZALIIhyaUlumAlDin4.nodownload;

  badRedirect = true;
  assert.equal((await openProxy(firstBooks[0].volumes[0].pdfUrl)).status, 502);

  members = ['NewBook'];
  const afterRemoval = (await (await catalogue()).json()).books;
  assert.deepEqual(afterRemoval.map(book => book.id), ['EXTERNAL:INTERNET_ARCHIVE:NewBook']);
  assert.equal((await openProxy(firstBooks[0].volumes[2].pdfUrl)).status, 403);
  assert.equal((await openProxy(firstBooks[0].volumes[3].pdfUrl)).status, 403);

  badRedirect = false;
  members = ['NewBook', 'MultiPdf', 'JalalainVol2', 'JalalainVol3', 'JalalainVol1'];
  metadata.MultiPdf = {
    metadata: { mediatype: 'texts', title: 'One book with several files' },
    files: [
      { name: 'Book 10.pdf', source: 'original' },
      { name: 'Book 2.pdf', source: 'original' },
      { name: 'Book 1_text.pdf', source: 'derivative' },
      { name: 'Book 1.pdf', source: 'original' },
      { name: 'Private 4.pdf', source: 'original', private: true }
    ]
  };
  for (const number of [1, 2, 3]) {
    const suffix = number === 1 ? '' : '_COLOR';
    metadata[`JalalainVol${number}`] = {
      metadata: { mediatype: 'texts', title: `TAFSEER_UL_JALALAIN_VOL_${number}_AL_BUSHRA${suffix}.pdf` },
      files: [{ name: `Jalalain Volume ${number}.pdf`, source: 'original' }]
    };
  }
  const groupedBooks = (await (await catalogue()).json()).books;
  assert.deepEqual(groupedBooks.map(book => book.id), [
    'EXTERNAL:INTERNET_ARCHIVE:NewBook',
    'EXTERNAL:INTERNET_ARCHIVE:MultiPdf',
    'EXTERNAL:INTERNET_ARCHIVE:SERIES:TAFSEER_UL_JALALAIN_AL_BUSHRA'
  ]);
  assert.deepEqual(groupedBooks[1].volumes.map(volume => volume.number), [1, 2, 10]);
  assert.equal(groupedBooks[1].volumes[2].label, 'Volume 10');
  assert.deepEqual(groupedBooks[2].volumes.map(volume => volume.number), [1, 2, 3]);
  assert.equal((await openProxy(groupedBooks[1].volumes[1].pdfUrl)).status, 200);
  assert.equal((await openProxy(groupedBooks[2].volumes[2].pdfUrl)).status, 200);
  assert.equal((await openProxy('https://archive.org/download/MultiPdf/Book%201_text.pdf')).status, 403);
  assert.equal((await openProxy('https://archive.org/download/MultiPdf/Private%204.pdf')).status, 403);

  members = ['NewBook', 'MultiPdf'];
  assert.equal((await openProxy(groupedBooks[2].volumes[2].pdfUrl)).status, 403);

  console.log('academy-open-library-archive.test.mjs: PASS');
} finally {
  globalThis.fetch = originalFetch;
}
