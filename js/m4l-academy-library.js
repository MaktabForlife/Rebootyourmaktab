(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const icons = { EBOOK: '/icons/ebook.svg', PRINTABLE: '/icons/printable.svg',
    AUDIO: '/icons/audio.svg', VIDEO: '/icons/video.svg', OTHER: '/icons/other.svg' };
  const typeNames = { EBOOK: 'eBook', PRINTABLE: 'Printable', AUDIO: 'Audio',
    VIDEO: 'Video', OTHER: 'Other' };
  const state = { rows: [], view: 'you', covers: new Map(), observer: null, openRow: null,
    learningAreaRefs: new Set() };

  function clearMedia() {
    for (const player of $('al-media').children) {
      player.pause?.();
      player.removeAttribute?.('src');
      player.load?.();
    }
    $('al-media').replaceChildren();
  }

  function pdfProxy(url) {
    const bytes = new TextEncoder().encode(url);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `/pdf-file/${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
  }

  function archiveRow(book) {
    if (!book || typeof book.id !== 'string' ||
        !book.id.startsWith('EXTERNAL:INTERNET_ARCHIVE:') ||
        typeof book.title !== 'string') return null;
    const volumes = Array.isArray(book.volumes) ? book.volumes.filter(volume =>
      Number.isInteger(volume.number) && /^https:\/\/archive\.org\/download\/[^?#]+\.pdf$/i.test(volume.pdfUrl)) : [];
    const pdfUrl = typeof book.pdfUrl === 'string' &&
      /^https:\/\/archive\.org\/download\/[^?#]+\.pdf$/i.test(book.pdfUrl) ? book.pdfUrl : '';
    const mediaFiles = Array.isArray(book.mediaFiles) ? book.mediaFiles.filter(file =>
      Number.isInteger(file.number) && /^https:\/\/archive\.org\/download\/[^?#]+\.(?:mp3|m4a|ogg|mp4|webm)$/i.test(file.mediaUrl)) : [];
    const mediaUrl = /^https:\/\/archive\.org\/download\/[^?#]+\.(?:mp3|m4a|ogg|mp4|webm)$/i.test(book.mediaUrl || '') ? book.mediaUrl : '';
    const mediaType = book.resourceType === 'AUDIO' || book.resourceType === 'VIDEO' ? book.resourceType : '';
    if (!volumes.length && !pdfUrl && !(mediaType && (mediaFiles.length || mediaUrl))) return null;
    return {
      id: book.id, name: book.title, subject: book.subject || 'Books', module: book.module || '',
      learningAreas: Array.isArray(book.learningAreas) ? book.learningAreas : [],
      source: 'EXTERNAL', sourceName: 'Open Library', type: mediaType || (book.resourceType === 'PRINTABLE' ? 'PRINTABLE' : 'EBOOK'),
      description: book.description || '', author: book.details || '',
      forYou: (book.learningAreaRefs || []).some(ref => state.learningAreaRefs.has(ref)),
      publicBook: true, volumes, pdfUrl, mediaFiles, mediaUrl, coverUrl: book.coverUrl || ''
    };
  }

  function linkRow(record) {
    if (record?.kind !== 'LINK' || record.resourceType !== 'OTHER' || record.active === false ||
        !record.id?.startsWith('EXTERNAL:ACADEMY_LINK:') ||
        typeof record.linkUrl !== 'string' || !/^https:\/\//i.test(record.linkUrl)) return null;
    return { id: record.id, name: record.title, subject: record.subject || 'Other',
      module: record.module || '', learningAreas: record.learningAreas || [],
      source: 'EXTERNAL', sourceName: 'Website', type: 'OTHER',
      description: record.description || '', author: record.author || '',
      forYou: (record.learningAreaRefs || []).some(ref => state.learningAreaRefs.has(ref)),
      publicBook: true, publicLink: true, linkUrl: record.linkUrl,
      coverUrl: record.coverUrl || '' };
  }

  async function api(action, body = {}) {
    const token = localStorage.getItem('m4l_account_token');
    if (!token) throw new Error('Sign in through your personal Academy account link.');
    const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/library/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Library access is unavailable.');
    return result;
  }

  function filtered() {
    const query = $('al-search').value.trim().toLocaleLowerCase();
    const type = $('al-type').value;
    const source = $('al-source').value;
    return state.rows.filter(row =>
      (state.view === 'you' ? row.forYou : !row.forYou) &&
      (type === 'ALL' || row.type === type) &&
      (source === 'ALL' || `${row.source}:${row.sourceName}` === source) &&
      (!query || [row.name, row.subject, row.module, row.level, ...(row.learningAreas || []), row.sourceName, row.description, row.author]
        .some(value => String(value || '').toLocaleLowerCase().includes(query))));
  }

  function showSignedOut() {
    state.rows = [];
    state.openRow = null;
    state.covers.clear();
    $('al-content').hidden = true;
    $('al-manage-books').hidden = true;
    $('al-status').innerHTML = 'Signed out. <a href="/academy/#overview">Sign in to Academy →</a> You can still <a href="/academy/open-library/">browse public books</a>.';
    if ($('al-preview').open) $('al-preview').close();
  }

  window.addEventListener('storage', event => {
    if (event.key === 'm4l_account_token' && !event.newValue) showSignedOut();
  });
  window.addEventListener('pageshow', () => {
    if (!localStorage.getItem('m4l_account_token')) showSignedOut();
  });

  function card(row) {
    const cover = state.covers.get(row.id);
    const art = row.publicBook && row.coverUrl
      ? `<img src="${esc(row.coverUrl)}" alt="Cover of ${esc(row.name)}" loading="lazy">`
      : cover && cover.expires > Date.now()
      ? `<img src="${esc(cover.url)}" alt="Cover of ${esc(row.name)}">`
      : row.hasCover && !row.locked
        ? `<span data-cover="${esc(row.id)}" aria-hidden="true">▣</span>`
        : `<img src="${esc(icons[row.type] || icons.OTHER)}" alt="" width="48" height="48">`;
    return `<button type="button" class="al-card" data-resource="${esc(row.id)}" aria-label="${row.locked ? 'Locked: ' : 'Open '}${esc(row.name)} (${esc(typeNames[row.type] || 'Resource')})"><span class="al-art">${art}</span><small>${esc(row.subject)}</small><span class="al-card-title"><img src="${esc(icons[row.type] || icons.OTHER)}" alt="" width="18" height="18"><strong>${esc(row.name)}</strong></span>${row.volumes?.length ? `<span class="al-volume-count">${row.volumes.length} volumes</span>` : ''}${row.locked ? '<span class="al-lock">Subscription required</span>' : ''}</button>`;
  }

  function render() {
    const rows = filtered().sort((a, b) => String(a.subject || '').localeCompare(String(b.subject || '')) ||
      String(a.sourceName || '').localeCompare(String(b.sourceName || '')) ||
      String(a.module || '').localeCompare(String(b.module || '')) ||
      String(a.name || '').localeCompare(String(b.name || '')));
    const groups = new Map();
    for (const row of rows) {
      const sourceName = row.sourceName;
      const key = `${sourceName}|${row.subject}`;
      if (!groups.has(key)) groups.set(key, { label: `${row.subject} · ${sourceName}`, modules: new Map() });
      const modules = groups.get(key).modules;
      const module = row.module || 'General';
      if (!modules.has(module)) modules.set(module, []);
      modules.get(module).push(row);
    }
    $('al-results').innerHTML = groups.size
      ? [...groups.values()].map(group => `<section class="al-section"><h2>${esc(group.label)}</h2>${[...group.modules.entries()].map(([module, entries]) => `<div class="al-module"><h3>${esc(module)}</h3><div class="al-ribbon" aria-label="${esc(module)} resources">${entries.map(card).join('')}</div></div>`).join('')}</section>`).join('')
      : `<p class="al-empty">${state.view === 'you' ? 'No resources are assigned to you yet.' : 'No resources match this selection.'}</p>`;
    state.observer?.disconnect();
    if ('IntersectionObserver' in window) {
      state.observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          state.observer.unobserve(entry.target);
          void loadCover(entry.target.dataset.cover);
        }
      }, { rootMargin: '160px' });
      $('al-results').querySelectorAll('[data-cover]').forEach(node => state.observer.observe(node));
    } else $('al-results').querySelectorAll('[data-cover]').forEach(node => void loadCover(node.dataset.cover));
  }

  async function loadCover(id) {
    try {
      const result = await api('cover', { resourceId: id });
      state.covers.set(id, { url: result.url, expires: Date.now() + (result.expiresIn - 15) * 1000 });
      const slot = [...$('al-results').querySelectorAll('[data-cover]')].find(node => node.dataset.cover === id);
      if (slot) slot.outerHTML = `<img src="${esc(result.url)}" alt="Cover" loading="lazy">`;
    } catch { /* A missing cover keeps the icon. */ }
  }

  function showArchivePdf(row, volume) {
    const url = volume?.pdfUrl || row.pdfUrl;
    const media = document.createElement('iframe');
    media.src = `/pdf-viewer/web/viewer.html?file=${encodeURIComponent(pdfProxy(url))}`;
    media.title = `${row.name}${volume ? `, ${volume.label || `volume ${volume.number}`}` : ''} PDF`;
    clearMedia();
    $('al-media').append(media);
    $('al-open').href = url;
    $('al-open').textContent = 'Open original PDF at Archive.org ↗';
    $('al-open').hidden = false;
  }

  function showArchiveMedia(row, file) {
    const url = file?.mediaUrl || row.mediaUrl;
    const player = document.createElement(row.type === 'AUDIO' ? 'audio' : 'video');
    player.controls = true;
    player.preload = 'metadata';
    player.src = url;
    clearMedia();
    $('al-media').append(player);
    $('al-open').href = url;
    $('al-open').textContent = `Open original ${row.type === 'AUDIO' ? 'audio' : 'video'} at Archive.org ↗`;
    $('al-open').hidden = false;
  }

  async function open(row) {
    state.openRow = row;
    $('al-preview-source').textContent = `${row.sourceName} · ${row.subject}`;
    $('al-preview-title').textContent = row.name;
    $('al-preview-details').textContent = [row.type === 'EBOOK' ? 'eBook' : row.type,
      row.author, row.publisher, row.module, row.description,
      row.learningAreas?.length ? `Used in ${row.learningAreas.join(', ')}` : ''].filter(Boolean).join(' · ');
    $('al-preview-status').textContent = row.locked ? 'An active subscription is required to open this resource.' : row.publicBook ? '' : 'Checking access…';
    clearMedia();
    $('al-open').hidden = true;
    const volumeSelect = $('al-volume');
    volumeSelect.replaceChildren();
    const parts = row.type === 'AUDIO' || row.type === 'VIDEO' ? row.mediaFiles : row.volumes;
    $('al-volume-wrap').hidden = !row.publicBook || !parts?.length || (parts.length < 2 && !row.volumes?.length);
    $('al-volume-label').textContent = row.type === 'AUDIO' ? 'Track' : row.type === 'VIDEO' ? 'Video' : 'Volume';
    if (row.publicBook && parts?.length) {
      for (const volume of parts) {
        const option = document.createElement('option');
        option.value = String(volume.number);
        option.textContent = volume.label || `Volume ${volume.number}`;
        volumeSelect.append(option);
      }
      volumeSelect.value = String(parts[0].number);
    }
    $('al-preview').showModal();
    if (row.publicBook) {
      if (row.type === 'AUDIO' || row.type === 'VIDEO') showArchiveMedia(row, row.mediaFiles?.[0]);
      else showArchivePdf(row, row.volumes?.[0]);
      return;
    }
    if (row.locked) return;
    try {
      const result = await api('access', { resourceId: row.id });
      $('al-preview-status').textContent = '';
      const mime = String(result.mimeType || '').toLowerCase();
      let media;
      if (mime === 'application/pdf') media = document.createElement('iframe');
      else if (mime.startsWith('audio/')) { media = document.createElement('audio'); media.controls = true; }
      else if (mime.startsWith('video/')) { media = document.createElement('video'); media.controls = true; }
      else if (mime.startsWith('image/')) media = document.createElement('img');
      if (media) { media.src = result.url; media.title = row.name; $('al-media').appendChild(media); }
      $('al-open').href = result.url;
      $('al-open').textContent = 'Open file in new tab ↗';
      $('al-open').hidden = false;
    } catch (error) { $('al-preview-status').textContent = error.message; }
  }

  function refreshSources() {
    const select = $('al-source');
    const selected = select.value;
    select.replaceChildren();
    const all = document.createElement('option');
    all.value = 'ALL';
    all.textContent = 'All sources';
    select.append(all);
    for (const source of new Set(state.rows.map(row => `${row.source}:${row.sourceName}`))) {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source.slice(source.indexOf(':') + 1);
      select.append(option);
    }
    select.value = [...select.options].some(option => option.value === selected) ? selected : 'ALL';
  }

  async function loadArchiveBooks() {
    let archiveBooks = [];
    let archiveUnavailable = false;
    try {
      const response = await fetch('/academy/open-library/catalogue');
      if (!response.ok) throw new Error('Archive.org catalogue unavailable');
      const data = await response.json();
      if (!Array.isArray(data.books)) throw new Error('Invalid Archive.org catalogue');
      archiveBooks = data.books;
    } catch (_error) {
      archiveUnavailable = true;
    }
    let records = [];
    try {
      const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/open-library/metadata/public`);
      if (response.ok) records = (await response.json()).records || [];
    } catch { /* Archive books remain available if Academy details cannot load. */ }
    if (!localStorage.getItem('m4l_account_token')) return;
    const byId = new Map(records.map(record => [record.id, record]));
    const edited = archiveBooks.map(book => {
      const record = byId.get(book.id);
      return record ? { ...book, title: record.title || book.title,
        subject: record.subject || book.subject, module: record.module || '',
        learningAreas: record.learningAreas || [], learningAreaRefs: record.learningAreaRefs || [],
        details: record.author || book.details, description: record.description || book.description,
        coverUrl: record.coverUrl || book.coverUrl,
        resourceType: (!book.resourceType || book.resourceType === 'EBOOK') && record.resourceType === 'PRINTABLE' ?
          'PRINTABLE' : book.resourceType || 'EBOOK' } : book;
    });
    const existing = new Set(state.rows.filter(row => !row.publicBook).map(row => row.id));
    state.rows = [...state.rows.filter(row => !row.publicBook),
      ...[...edited.map(archiveRow), ...records.map(linkRow)].filter(row => row && !existing.has(row.id))];
    refreshSources();
    render();
    if (archiveUnavailable) $('al-status').textContent = `${$('al-status').textContent} Public Archive.org books are temporarily unavailable.`.trim();
  }

  async function showManageBooksForAdmin() {
    const token = localStorage.getItem('m4l_account_token');
    if (!token) return;
    try {
      const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/open-library/metadata/list`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}'
      });
      if (response.ok && (await response.json()).success) $('al-manage-books').hidden = false;
    } catch { /* Management stays hidden when unavailable. */ }
  }

  async function start() {
    try {
      const result = await api('catalogue');
      if (!localStorage.getItem('m4l_account_token')) return showSignedOut();
      state.rows = Array.isArray(result.resources) ? result.resources : [];
      state.learningAreaRefs = new Set(Array.isArray(result.learningAreaRefs) ? result.learningAreaRefs : []);
      refreshSources();
      $('al-content').hidden = false;
      $('al-status').textContent = result.warnings?.length ? result.warnings.join(' ') : '';
      render();
      void loadArchiveBooks();
      void showManageBooksForAdmin();
    } catch (error) {
      $('al-status').innerHTML = `${esc(error.message)} <a href="/academy/#overview">Sign in to Academy →</a>`;
    }
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
    render();
  }));
  for (const id of ['al-search', 'al-type', 'al-source']) $(id).addEventListener('input', render);
  $('al-volume').addEventListener('change', event => {
    const row = state.openRow;
    const mediaType = row?.type === 'AUDIO' || row?.type === 'VIDEO';
    const volume = (mediaType ? row.mediaFiles : row?.volumes)?.find(item => String(item.number) === event.target.value);
    if (row?.publicBook && volume && mediaType) showArchiveMedia(row, volume);
    else if (row?.publicBook && volume) showArchivePdf(row, volume);
  });
  $('al-results').addEventListener('click', event => {
    const id = event.target.closest('[data-resource]')?.dataset.resource;
    const row = state.rows.find(item => item.id === id);
    if (row?.publicLink) window.open(row.linkUrl, '_blank', 'noopener,noreferrer');
    else if (row) void open(row);
  });
  $('al-close').addEventListener('click', () => $('al-preview').close());
  $('al-preview').addEventListener('close', () => {
    state.openRow = null;
    clearMedia();
  });
  void start();
})();
