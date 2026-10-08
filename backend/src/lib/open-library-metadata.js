import { problem } from '../programs/model.js';

const ARCHIVE_ID = /^EXTERNAL:INTERNET_ARCHIVE:[A-Za-z0-9_.:-]{1,220}$/;
export const isArchiveOpenLibraryId = value => typeof value === 'string' && ARCHIVE_ID.test(value);
const FIELD_LIMITS = Object.freeze({
  title: 180,
  subject: 160,
  module: 160,
  subjectRef: 300,
  moduleRef: 300,
  author: 180,
  description: 1000
});

export function validateOpenLibraryMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !isArchiveOpenLibraryId(input.id)) {
    throw problem('Choose an Archive.org book from the current Open Library catalogue.');
  }
  const record = { id: input.id };
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > limit * 2) {
      throw problem(`${field} must be text up to ${limit} characters.`);
    }
    const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (normalized.length > limit) throw problem(`${field} must be text up to ${limit} characters.`);
    record[field] = normalized;
  }
  for (const [field, limit] of [['learningAreaRefs', 300], ['learningAreas', 160]]) {
    const values = input[field] ?? [];
    if (!Array.isArray(values) || values.length > 100 ||
        values.some(value => typeof value !== 'string' || !value.trim() || value.length > limit)) {
      throw problem(`Choose valid ${field === 'learningAreaRefs' ? 'learning areas' : 'learning area names'}.`);
    }
    record[field] = values.map(value => value.normalize('NFC').trim());
  }
  const coverUrl = input.coverUrl ?? '';
  if (typeof coverUrl !== 'string' || coverUrl.length > 2048) throw problem('Cover must be a JPG or PNG image link.');
  if (coverUrl.trim()) {
    let url;
    try { url = new URL(coverUrl.trim()); } catch { throw problem('Cover must be a public HTTPS JPG or PNG image link.'); }
    if (url.protocol !== 'https:' || url.username || url.password ||
        !/\.(?:jpe?g|png)$/i.test(url.pathname)) {
      throw problem('Cover must be a public HTTPS JPG or PNG image link.');
    }
    record.coverUrl = url.href;
  } else record.coverUrl = '';
  return record;
}

export function publicOpenLibraryMetadata(row) {
  const record = JSON.parse(row.metadata);
  return { ...record, revision: Number(row.revision) };
}

export function openLibraryMetadataForClient(record, origin) {
  const { coverKey, previousCoverKey, ...safe } = record;
  return {
    ...safe,
    hasUploadedCover: Boolean(coverKey),
    coverUrl: coverKey
      ? `${origin}/api/academy/open-library/metadata/cover?id=${encodeURIComponent(record.id)}&v=${record.revision}`
      : safe.coverUrl || ''
  };
}
