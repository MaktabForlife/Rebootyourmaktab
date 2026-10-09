import { json } from './http.js';

// Legacy Reboot rows use this public address for objects in MEDIA_BUCKET.
// Match the exact origin so an arbitrary URL cannot select a bucket key.
const LEGACY_R2_ORIGIN = 'https://pub-d0f00cecdced454598b794da754a3939.r2.dev';
const PURPOSE = 'academy-r2-media-v1';
const TTL_SECONDS = 60 * 60;
const encoder = new TextEncoder();
const clean = value => String(value ?? '').trim();

export function legacyR2ObjectKey(link, env = {}) {
  try {
    const url = new URL(clean(link));
    const allowed = new URL(clean(env.M4L_R2_PUBLIC_ORIGIN) || LEGACY_R2_ORIGIN);
    if (url.origin !== allowed.origin || allowed.protocol !== 'https:' || url.protocol !== 'https:' ||
      url.username || url.password ||
      url.search || url.hash) return '';
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key.startsWith('Resources/') || key.length > 1024 ||
      key.split('/').some(part => !part || part === '.' || part === '..') ||
      /[\u0000-\u001f\\]/.test(key)) return '';
    return key;
  } catch { return ''; }
}

export function r2MediaFilename(key) {
  return clean(key).split('/').at(-1) || 'resource';
}

export function r2MediaMimeType(name, object) {
  const stored = clean(object?.httpMetadata?.contentType).split(';')[0].toLowerCase();
  if (stored && !['application/octet-stream', 'binary/octet-stream'].includes(stored)) return stored;
  const extension = clean(name).split('.').at(-1).toLowerCase();
  return ({ pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
    mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    zip: 'application/zip' })[extension] || 'application/octet-stream';
}

export async function createR2MediaToken({ key, etag, filename, mimeType }, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify({ purpose: PURPOSE, key, etag, filename, mimeType,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv },
    await encryptionKey(env), data));
  return `${encodeBytes(iv)}.${encodeBytes(ciphertext)}`;
}

async function verifyR2MediaToken(token, env) {
  try {
    const parts = clean(token).split('.');
    if (parts.length !== 2 || parts.some(part => !part || part.length > 4096)) return null;
    const iv = decodeBytes(parts[0]);
    if (iv.length !== 12) return null;
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv },
      await encryptionKey(env), decodeBytes(parts[1]));
    const claims = JSON.parse(new TextDecoder().decode(plaintext));
    if (claims.purpose !== PURPOSE || !claims.key || !claims.etag ||
      Number(claims.exp) <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch { return null; }
}

async function encryptionKey(env) {
  const secret = clean(env.SESSION_SECRET);
  if (!secret) throw new Error('Missing SESSION_SECRET Worker secret');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${PURPOSE}:${secret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function encodeBytes(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBytes(value) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export async function streamR2MediaEndpoint(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ success: false, error: 'Method not allowed' }, 405);
  const claims = await verifyR2MediaToken(new URL(request.url).searchParams.get('access'), env);
  if (!claims) return json({ success: false, error: 'Invalid or expired media access' }, 401);
  if (!env.MEDIA_BUCKET) return json({ success: false, error: 'Media storage is unavailable' }, 503);

  const range = request.headers.get('Range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
    return json({ success: false, error: 'Invalid media range' }, 416);
  }
  const object = request.method === 'HEAD'
    ? await env.MEDIA_BUCKET.head(claims.key)
    : await env.MEDIA_BUCKET.get(claims.key, range ? { range: new Headers({ Range: range }) } : undefined);
  if (!object || object.etag !== claims.etag) return json({ success: false, error: 'Media is unavailable' }, 404);
  if (range && !object.range && request.method === 'GET') {
    return json({ success: false, error: 'Media range is unavailable' }, 416);
  }

  const headers = new Headers({
    'Content-Type': claims.mimeType,
    'Content-Disposition': `${/^(?:application\/pdf|audio\/[\w.+-]+|video\/[\w.+-]+|image\/(?:png|jpeg|webp|gif))$/.test(claims.mimeType) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(claims.filename)}`,
    'Cache-Control': 'private, no-store, max-age=0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff'
  });
  if (object.range) {
    headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    headers.set('Content-Length', String(object.range.length));
  } else headers.set('Content-Length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: object.range ? 206 : 200, headers
  });
}

export const R2_MEDIA_TTL_SECONDS = TTL_SECONDS;
