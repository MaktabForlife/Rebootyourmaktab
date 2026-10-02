import { clean, problem } from '../programs/model.js';

const MAX_COVER_BYTES = 20 * 1024 * 1024;

function validCoverId(value) {
  const id = String(value ?? '');
  return /^[1-9]\d{0,14}$/.test(id) && Number.isSafeInteger(Number(id)) ? id : '';
}

async function readLimited(response, maximum, message) {
  if (Number(response.headers.get('Content-Length')) > maximum) throw problem(message, 413);
  const reader = response.body?.getReader();
  if (!reader) throw problem(message, 502);
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw problem(message, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function searchBookCovers(value) {
  const query = clean(value);
  if (query.length < 2 || query.length > 160) throw problem('Enter an ISBN, title or author to search (2–160 characters).');
  const compactIsbn = query.replace(/[\s-]/g, '');
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('q', /^(?:\d{10}|\d{13}|\d{9}X)$/i.test(compactIsbn) ? compactIsbn : query);
  url.searchParams.set('fields', 'key,title,author_name,cover_i,first_publish_year');
  url.searchParams.set('limit', '24');
  let response;
  try { response = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'manual' }); }
  catch { throw problem('Book cover search is unavailable. Try again later.', 503); }
  if (!response.ok) throw problem('Book cover search is unavailable. Try again later.', 503);
  let data;
  try {
    const bytes = await readLimited(response, 1024 * 1024, 'Book cover search returned too much data.');
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error.publicMessage) throw error;
    throw problem('Book cover search returned an unreadable response.', 503);
  }
  const covers = [];
  for (const entry of Array.isArray(data.docs) ? data.docs : []) {
    const coverId = validCoverId(entry?.cover_i);
    const title = clean(entry?.title).slice(0, 160);
    if (!coverId || !title || covers.some(item => item.coverId === coverId)) continue;
    const key = clean(entry.key);
    covers.push({
      coverId,
      title,
      author: clean(Array.isArray(entry.author_name) ? entry.author_name[0] : '').slice(0, 160),
      year: Number.isSafeInteger(entry.first_publish_year) ? entry.first_publish_year : null,
      imageUrl: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false`,
      sourceUrl: /^\/works\/OL\d+W$/.test(key) ? `https://openlibrary.org${key}` : 'https://openlibrary.org'
    });
    if (covers.length === 12) break;
  }
  return covers;
}

export async function downloadBookCover(value) {
  const coverId = validCoverId(value);
  if (!coverId) throw problem('Choose a cover from the search results.');
  let response;
  let url = new URL(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`);
  try {
    for (let redirects = 0; redirects < 5; redirects++) {
      response = await fetch(url, { headers: { Accept: 'image/jpeg' }, redirect: 'manual' });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const destination = new URL(response.headers.get('Location') || '', url);
      if (destination.protocol !== 'https:' || !['covers.openlibrary.org', 'archive.org'].includes(destination.hostname) && !destination.hostname.endsWith('.archive.org')) {
        throw problem('The cover source redirected to an unexpected site.', 502);
      }
      url = destination;
    }
  } catch (error) {
    if (error.publicMessage) throw error;
    throw problem('The selected cover could not be downloaded. Try again later.', 503);
  }
  if ([301, 302, 303, 307, 308].includes(response.status)) throw problem('The cover source redirected too many times.', 502);
  if (response.status === 404) throw problem('This cover is no longer available. Choose another cover.', 404);
  if (!response.ok) throw problem('The selected cover could not be downloaded. Try again later.', 503);
  if (clean(response.headers.get('Content-Type')).split(';')[0].toLowerCase() !== 'image/jpeg') throw problem('The cover source did not return a JPEG image.', 502);
  const bytes = await readLimited(response, MAX_COVER_BYTES, 'Choose a cover image up to 20 MB.');
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw problem('The cover source did not return a valid JPEG image.', 502);
  return bytes;
}
