(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const icons = { EBOOK: '/icons/ebook.svg', PRINTABLE: '/icons/printable.svg',
    AUDIO: '/icons/audio.svg', VIDEO: '/icons/video.svg', OTHER: '/icons/other.svg' };
  const state = { rows: [], view: 'you', covers: new Map(), observer: null };

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
      (!query || [row.name, row.subject, row.sourceName, row.description, row.author]
        .some(value => String(value || '').toLocaleLowerCase().includes(query))));
  }

  function card(row) {
    const cover = state.covers.get(row.id);
    const art = cover && cover.expires > Date.now()
      ? `<img src="${esc(cover.url)}" alt="Cover of ${esc(row.name)}">`
      : row.hasCover && !row.locked
        ? `<span data-cover="${esc(row.id)}" aria-hidden="true">▣</span>`
        : `<img src="${esc(icons[row.type] || icons.OTHER)}" alt="" width="48" height="48">`;
    return `<button type="button" class="al-card" data-resource="${esc(row.id)}" aria-label="${row.locked ? 'Locked: ' : 'Open '}${esc(row.name)}"><span class="al-art">${art}</span><small>${esc(row.sourceName)} · ${esc(row.subject)}</small><strong>${esc(row.name)}</strong>${row.locked ? '<span class="al-lock">Subscription required</span>' : ''}</button>`;
  }

  function render() {
    const rows = filtered();
    const groups = new Map();
    for (const row of rows) {
      const key = `${row.sourceName}|${row.subject}`;
      if (!groups.has(key)) groups.set(key, { label: `${row.subject} · ${row.sourceName}`, modules: new Map() });
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

  async function open(row) {
    $('al-preview-source').textContent = `${row.sourceName} · ${row.subject}`;
    $('al-preview-title').textContent = row.name;
    $('al-preview-details').textContent = [row.type === 'EBOOK' ? 'eBook' : row.type,
      row.author, row.publisher, row.module, row.description].filter(Boolean).join(' · ');
    $('al-preview-status').textContent = row.locked ? 'An active subscription is required to open this resource.' : 'Checking access…';
    $('al-media').replaceChildren();
    $('al-open').hidden = true;
    $('al-preview').showModal();
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
      $('al-open').hidden = false;
    } catch (error) { $('al-preview-status').textContent = error.message; }
  }

  async function start() {
    try {
      const result = await api('catalogue');
      state.rows = Array.isArray(result.resources) ? result.resources : [];
      const sources = [...new Set(state.rows.map(row => `${row.source}:${row.sourceName}`))];
      for (const source of sources) {
        const option = document.createElement('option');
        option.value = source;
        option.textContent = source.slice(source.indexOf(':') + 1);
        $('al-source').appendChild(option);
      }
      $('al-content').hidden = false;
      $('al-status').textContent = result.warnings?.length ? result.warnings.join(' ') : '';
      render();
    } catch (error) {
      $('al-status').innerHTML = `${esc(error.message)} <a href="/account/">Open your account →</a>`;
    }
  }

  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
    render();
  }));
  for (const id of ['al-search', 'al-type', 'al-source']) $(id).addEventListener('input', render);
  $('al-results').addEventListener('click', event => {
    const id = event.target.closest('[data-resource]')?.dataset.resource;
    const row = state.rows.find(item => item.id === id);
    if (row) void open(row);
  });
  $('al-close').addEventListener('click', () => $('al-preview').close());
  $('al-preview').addEventListener('close', () => $('al-media').replaceChildren());
  void start();
})();
