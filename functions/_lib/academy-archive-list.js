const LIST_API = 'https://archive.org/services/users/@hbn_naidu/lists/1';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const MAX_ITEMS = 200;
const IHYA_VOLUMES = [
  { number: 1, listedId: 'IhyaUlumAlDinVol1_201503', sourceId: 'IhyaUlumAlDinVol1_201503' },
  { number: 2, listedId: 'IhyaUlumAlDinVol2', sourceId: 'IhyaUlumAlDinVol2' },
  { number: 3, listedId: 'IhyaUlumAlDinVol3', sourceId: 'IhyaUlumAlDinVol3' },
  // The list's Vol4 scan has a Vol. III title page. Use the matching Vol. IV scan.
  { number: 4, listedId: 'IhyaUlumAlDinVol4', sourceId: 'GAZALIIhyaUlumAlDin4' }
];
const IHYA_LIST_IDS = new Set(IHYA_VOLUMES.map(volume => volume.listedId));
IHYA_LIST_IDS.add('GAZALIIhyaUlumAlDin4');

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
    redirect: 'manual'
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
  const listed = await listedIdentifiers();
  const hasIhya = listed.some(identifier => IHYA_LIST_IDS.has(identifier));
  const identifiers = [...new Set([
    ...listed,
    ...(hasIhya ? IHYA_VOLUMES.map(volume => volume.sourceId) : [])
  ])];
  const byId = new Map();
  let failures = 0;
  for (let index = 0; index < identifiers.length; index += 6) {
    const batch = await Promise.allSettled(identifiers.slice(index, index + 6).map(itemMetadata));
    batch.forEach((result, offset) => {
      if (result.status === 'rejected') {
        failures += 1;
        return;
      }
      const book = catalogueBook(identifiers[index + offset], result.value);
      if (book) byId.set(identifiers[index + offset], book);
    });
  }
  if (failures && !byId.size && identifiers.length) {
    throw new Error('Archive.org item metadata is unavailable');
  }
  const volumes = IHYA_VOLUMES
    .map(volume => {
      const book = byId.get(volume.sourceId);
      return book && { number: volume.number, pdfUrl: book.pdfUrl };
    })
    .filter(Boolean);
  const series = volumes.length ? {
    id: 'EXTERNAL:INTERNET_ARCHIVE:IHYA_ULUM_AD_DIN_SET',
    title: 'Ihya Ulum ad-Din',
    subject: 'Islamic studies',
    source: 'Internet Archive',
    details: 'Imam al-Ghazali · translated by Fazl-ul-Karim',
    description: 'The Revival of Religious Learnings, in separate volumes.',
    coverUrl: byId.get(IHYA_VOLUMES[0].sourceId)?.coverUrl || byId.get(IHYA_VOLUMES[1].sourceId)?.coverUrl,
    volumes
  } : null;
  const books = [];
  let seriesAdded = false;
  for (const identifier of listed) {
    if (IHYA_LIST_IDS.has(identifier)) {
      if (series && !seriesAdded) {
        books.push(series);
        seriesAdded = true;
      }
    } else if (byId.has(identifier)) {
      books.push(byId.get(identifier));
    }
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
  if (!identifiers.includes(match[1]) &&
      !(IHYA_VOLUMES.some(volume => volume.sourceId === match[1]) &&
        identifiers.some(identifier => IHYA_LIST_IDS.has(identifier)))) return false;
  const data = await itemMetadata(match[1]);
  const file = publicPdf(data);
  return data.metadata?.mediatype === 'texts' && !!file &&
    file.name === filename && archivePdfUrl(match[1], file.name) === url.href;
}
