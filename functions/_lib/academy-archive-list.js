const LIST_API = 'https://archive.org/services/users/@hbn_naidu/lists/1';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const MAX_ITEMS = 200;

async function readJson(response) {
  if (!response.ok) throw new Error(`Archive.org returned ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Archive.org returned an empty response');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new Error('Archive.org metadata exceeded the size limit');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function archiveJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error'
  });
  return readJson(response);
}

export async function listedIdentifiers() {
  const data = await archiveJson(LIST_API);
  const members = data?.value?.members;
  if (!Array.isArray(members)) throw new Error('Archive.org list format is unavailable');
  if (members.length > MAX_ITEMS) throw new Error('Archive.org list exceeds the supported size');
  return [...new Set(members
    .map(member => member?.identifier)
    .filter(identifier => typeof identifier === 'string' && IDENTIFIER.test(identifier)))];
}

async function itemMetadata(identifier) {
  return archiveJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
}

function publicPdf(data) {
  if (!data || data.is_dark === true || data.is_dark === 'true' ||
      data.nodownload === true || data.nodownload === 'true' ||
      data.metadata?.['access-restricted-item'] === 'true') return null;
  const files = Array.isArray(data.files) ? data.files : [];
  return files.find(file =>
    typeof file.name === 'string' &&
    /^[^/\\]+\.pdf$/i.test(file.name) &&
    file.private !== true && file.private !== 'true' &&
    file.source === 'original'
  ) || files.find(file =>
    typeof file.name === 'string' &&
    /^[^/\\]+\.pdf$/i.test(file.name) &&
    file.private !== true && file.private !== 'true'
  ) || null;
}

function archivePdfUrl(identifier, filename) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`;
}

function shortText(value, limit = 180) {
  const text = Array.isArray(value) ? value.find(item => typeof item === 'string') : value;
  return typeof text === 'string' ? text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function catalogueBook(identifier, data) {
  const file = publicPdf(data);
  if (!file || data.metadata?.mediatype !== 'texts') return null;
  const title = shortText(data.metadata?.title) || identifier;
  return {
    id: `EXTERNAL:INTERNET_ARCHIVE:${identifier}`,
    title,
    subject: shortText(data.metadata?.subject, 80) || 'Books',
    source: 'Internet Archive',
    details: shortText(data.metadata?.creator, 180),
    description: 'From the Ummabbablibrary Archive.org list.',
    pdfUrl: archivePdfUrl(identifier, file.name),
    coverUrl: `https://archive.org/download/${encodeURIComponent(identifier)}/__ia_thumb.jpg`
  };
}

export async function archiveCatalogue() {
  const identifiers = await listedIdentifiers();
  const books = [];
  let failures = 0;
  for (let index = 0; index < identifiers.length; index += 6) {
    const batch = await Promise.allSettled(identifiers.slice(index, index + 6).map(itemMetadata));
    batch.forEach((result, offset) => {
      if (result.status === 'rejected') {
        failures += 1;
        return;
      }
      const book = catalogueBook(identifiers[index + offset], result.value);
      if (book) books.push(book);
    });
  }
  if (failures && !books.length && identifiers.length) {
    throw new Error('Archive.org item metadata is unavailable');
  }
  return books;
}

export async function isListedArchivePdfUrl(url) {
  if (url.hostname !== 'archive.org' || url.search || url.hash) return false;
  const match = url.pathname.match(/^\/download\/([A-Za-z0-9_.-]+)\/([^/]+\.pdf)$/i);
  if (!match || !IDENTIFIER.test(match[1])) return false;
  let filename;
  try {
    filename = decodeURIComponent(match[2]);
  } catch (_error) {
    return false;
  }
  const identifiers = await listedIdentifiers();
  if (!identifiers.includes(match[1])) return false;
  const data = await itemMetadata(match[1]);
  const file = publicPdf(data);
  return data.metadata?.mediatype === 'texts' && !!file &&
    file.name === filename && archivePdfUrl(match[1], file.name) === url.href;
}
