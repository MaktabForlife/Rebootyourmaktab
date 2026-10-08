(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fields = ['title', 'subject', 'module', 'level', 'author', 'description'];
  const status = $('olm-status');
  const token = localStorage.getItem('m4l_account_token');
  const base = window.M4L_CONFIG?.API_BASE || '';
  let books = [];
  let saved = new Map();
  let localCoverPreview = '';

  function showCover() {
    const book = books.find(item => item.id === $('olm-book').value);
    const record = saved.get(book?.id) || {};
    const value = $('olm-remove-cover').checked ? book?.coverUrl || '' :
      localCoverPreview || $('olm-coverUrl').value.trim() || record.coverUrl || book?.coverUrl || '';
    const image = $('olm-cover-preview');
    image.hidden = !value;
    if (!image.hidden) image.src = value;
  }

  async function api(action, body = {}, file = null) {
    const headers = { Authorization: `Bearer ${token}` };
    let payload;
    if (file) {
      const form = new FormData();
      form.append('details', JSON.stringify(body));
      form.append('cover', file);
      payload = form;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${base}/api/academy/open-library/metadata/${action}`, {
      method: 'POST',
      headers, body: payload
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Book details are unavailable.');
    return data;
  }

  function showBook() {
    const book = books.find(item => item.id === $('olm-book').value);
    if (!book) return;
    const record = saved.get(book.id) || {};
    $('olm-source').textContent = `${book.source} · ${book.title}${book.volumes ? ` · ${book.volumes.length} volumes` : ''}`;
    for (const field of fields) $(`olm-${field}`).value = record[field] || '';
    $('olm-coverUrl').value = record.hasUploadedCover ? '' : record.coverUrl || '';
    $('olm-cover-file').value = '';
    $('olm-remove-cover').checked = false;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = '';
    $('olm-title').placeholder = book.title;
    $('olm-subject').placeholder = book.subject || 'Books';
    $('olm-author').placeholder = book.details || 'Use Archive.org creator';
    $('olm-coverUrl').placeholder = book.coverUrl || 'Use Archive.org cover image';
    showCover();
    status.textContent = record.revision ? 'Academy details saved for this book.' : 'This book is using Archive.org details.';
  }

  async function start() {
    if (!token) {
      status.textContent = 'Sign in through your Academy account to manage books.';
      return;
    }
    try {
      const metadata = await api('list');
      const response = await fetch('/academy/open-library/catalogue');
      if (!response.ok) throw new Error('Archive.org catalogue is unavailable. Try again later.');
      const catalogue = await response.json();
      books = Array.isArray(catalogue.books) ? catalogue.books : [];
      saved = new Map((Array.isArray(metadata.records) ? metadata.records : []).map(record => [record.id, record]));
      if (!books.length) { status.textContent = 'No Archive.org books are available to edit yet.'; return; }
      $('olm-book').replaceChildren(...books.map(book => {
        const option = document.createElement('option');
        option.value = book.id;
        option.textContent = book.title;
        return option;
      }));
      $('olm-form').hidden = false;
      showBook();
    } catch (error) { status.textContent = error.message; }
  }

  $('olm-book').addEventListener('change', showBook);
  $('olm-coverUrl').addEventListener('input', () => {
    $('olm-cover-file').value = '';
    $('olm-remove-cover').checked = false;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = '';
    showCover();
  });
  $('olm-cover-file').addEventListener('change', () => {
    const file = $('olm-cover-file').files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      status.textContent = 'Choose a JPG or PNG image up to 5 MB.';
      $('olm-cover-file').value = '';
      return;
    }
    $('olm-coverUrl').value = '';
    $('olm-remove-cover').checked = false;
    if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
    localCoverPreview = URL.createObjectURL(file);
    showCover();
  });
  $('olm-remove-cover').addEventListener('change', () => {
    if ($('olm-remove-cover').checked) {
      $('olm-coverUrl').value = '';
      $('olm-cover-file').value = '';
      if (localCoverPreview) URL.revokeObjectURL(localCoverPreview);
      localCoverPreview = '';
    }
    showCover();
  });
  $('olm-form').addEventListener('submit', async event => {
    event.preventDefault();
    const book = books.find(item => item.id === $('olm-book').value);
    if (!book) return;
    const button = $('olm-save');
    button.disabled = true;
    status.textContent = 'Saving Academy details…';
    try {
      const body = { id: book.id, baseRevision: saved.get(book.id)?.revision || 0,
        coverUrl: $('olm-coverUrl').value, removeCover: $('olm-remove-cover').checked };
      for (const field of fields) body[field] = $(`olm-${field}`).value;
      const result = await api('save', body, $('olm-cover-file').files?.[0] || null);
      saved.set(book.id, result.record);
      showBook();
      status.textContent = 'Academy details saved. They will appear in the public and signed-in Library when refreshed.';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  void start();
})();
