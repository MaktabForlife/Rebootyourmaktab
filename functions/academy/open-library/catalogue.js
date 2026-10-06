import { archiveCatalogue } from '../../_lib/academy-archive-list.js';

export async function onRequestGet() {
  try {
    const books = await archiveCatalogue();
    return Response.json({ books }, {
      headers: { 'Cache-Control': 'public, max-age=300' }
    });
  } catch (error) {
    console.error('Archive.org list could not be loaded:', error);
    return Response.json({ error: 'Archive.org books are temporarily unavailable.' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
}
