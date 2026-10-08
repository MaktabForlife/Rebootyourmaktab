import { problem } from '../programs/model.js';

const ARCHIVE_ID = /^EXTERNAL:INTERNET_ARCHIVE:[A-Za-z0-9_.:-]{1,220}$/;
export const isArchiveOpenLibraryId = value => typeof value === 'string' && ARCHIVE_ID.test(value);
const ACADEMY_LINK_ID = /^EXTERNAL:ACADEMY_LINK:[0-9a-f-]{36}$/;
export const isAcademyLinkId = value => typeof value === 'string' && ACADEMY_LINK_ID.test(value);
export const isOpenLibraryMetadataId = value => isArchiveOpenLibraryId(value) || isAcademyLinkId(value);
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
      !isOpenLibraryMetadataId(input.id)) {
    throw problem('Choose a Library resource or add a new link.');
  }
  const record = { id: input.id };
  if (isAcademyLinkId(input.id)) {
    if (input.kind !== 'LINK' || input.resourceType !== 'OTHER' ||
        typeof input.linkUrl !== 'string' || input.linkUrl.length > 2048 ||
        typeof input.active !== 'boolean') {
      throw problem('Choose a category and a public HTTPS website link.');
    }
    let link;
    try { link = new URL(input.linkUrl.trim()); } catch { throw problem('Enter a public HTTPS website link.'); }
    if (link.protocol !== 'https:' || !link.hostname.includes('.') || link.username || link.password) {
      throw problem('Enter a public HTTPS website link.');
    }
    record.kind = 'LINK';
    record.resourceType = input.resourceType;
    record.linkUrl = link.href;
    record.active = input.active;
  } else {
    if (input.resourceType !== undefined &&
        !['EBOOK', 'PRINTABLE', 'AUDIO', 'VIDEO'].includes(input.resourceType)) {
      throw problem('Choose a valid Archive.org resource category.');
    }
    if (input.resourceType) record.resourceType = input.resourceType;
  }
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    const value = input[field] ?? '';
    if (typeof value !== 'string' || value.length > limit * 2) {
      throw problem(`${field} must be text up to ${limit} characters.`);
    }
    const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (normalized.length > limit) throw problem(`${field} must be text up to ${limit} characters.`);
    record[field] = normalized;
  }
  if (isAcademyLinkId(input.id) && (!record.title || !record.subjectRef)) {
    throw problem('Enter a title and choose a subject for this resource.');
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
