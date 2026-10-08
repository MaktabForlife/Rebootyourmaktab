(() => {
  'use strict';

  // Curated public links. Add each book once, even when its source lists it for several grades.
  let books = [
    {
      id: 'EXTERNAL:TALIMI_BOARD_KZN:ESSENTIAL_DUAS_GR_1_7',
      title: 'Essential Duas for Muslims (Grades 1–7)',
      subject: 'Duas',
      source: 'Ta’limi Board KZN',
      details: 'Jamiatul Ulama (KZN) Ta’limi Board',
      description: 'Duas for learners in Grades 1–7.',
      pdfUrl: 'https://talimiboardkzn.org/wp-content/uploads/2018/10/essential_duas_for_muslims_gr_1-7.pdf'
    }
  ];

  const $ = id => document.getElementById(id);
  const results = $('ol-results');
  const dialog = $('ol-preview');
  const viewer = $('ol-viewer');
  const status = $('ol-status');
  let openBook = null;

  function pdfProxy(url) {
    const bytes = new TextEncoder().encode(url);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `/pdf-file/${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
  }

  function render() {
    const query = $('ol-search').value.trim().toLocaleLowerCase();
    const matches = books.filter(book => [book.title, book.subject, book.module, ...(book.learningAreas || []), book.source, book.details, book.description]
      .some(value => String(value || '').toLocaleLowerCase().includes(query)))
      .sort((a, b) => (a.subject || 'Books').localeCompare(b.subject || 'Books') ||
        (a.module || '').localeCompare(b.module || '') || a.title.localeCompare(b.title));
    results.replaceChildren();
    const groups = new Map();
    for (const book of matches) {
      const subject = book.subject || 'Books';
      if (!groups.has(subject)) groups.set(subject, { subject, modules: new Map() });
      const modules = groups.get(subject).modules;
      const module = book.module || 'General';
      if (!modules.has(module)) modules.set(module, []);
      modules.get(module).push(book);
    }
    for (const group of groups.values()) {
      const section = document.createElement('section');
      section.className = 'al-section';
      const heading = document.createElement('h2');
      heading.textContent = group.subject;
      section.append(heading);
      for (const [module, entries] of group.modules) {
        const block = document.createElement('div');
        block.className = 'al-module';
        const label = document.createElement('h3');
        label.textContent = module;
        const ribbon = document.createElement('div');
        ribbon.className = 'al-ribbon';
        ribbon.setAttribute('aria-label', `${module} books`);
        for (const book of entries) {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'ol-card';
          card.dataset.resource = book.id;
          card.setAttribute('aria-label', `Read ${book.title}`);
          const art = document.createElement('div');
          art.className = 'ol-card-art';
          const icon = document.createElement('img');
          icon.src = book.coverUrl || '/icons/ebook.svg';
          icon.alt = '';
          if (book.coverUrl) {
            icon.className = 'ol-cover';
            icon.loading = 'lazy';
            icon.addEventListener('error', () => {
              icon.src = '/icons/ebook.svg';
              icon.className = '';
            }, { once: true });
          }
          art.append(icon);
          const source = document.createElement('small');
          const areas = book.learningAreas || [];
          source.textContent = areas.length ?
            `${areas[0]}${areas.length > 1 ? ` +${areas.length - 1}` : ''} · ${book.subject}` : `Open Library · ${book.subject}`;
          const title = document.createElement('strong');
          title.textContent = book.title;
          const action = document.createElement('span');
          action.textContent = book.volumes ? `${book.volumes.length} volumes →` : 'Read book →';
          card.append(art, source, title, action);
          ribbon.append(card);
        }
        block.append(label, ribbon);
        section.append(block);
      }
      results.append(section);
    }
    $('ol-empty').hidden = matches.length > 0;
  }

  function showPdf(book, volume) {
    const selected = volume || book;
    $('ol-original').href = selected.pdfUrl;
    viewer.title = `${book.title}${volume ? `, ${volume.label || `volume ${volume.number}`}` : ''} PDF`;
    viewer.src = `/pdf-viewer/web/viewer.html?file=${encodeURIComponent(pdfProxy(selected.pdfUrl))}`;
    const url = new URL(window.location.href);
    url.searchParams.set('resource', book.id);
    if (volume) url.searchParams.set('volume', String(volume.number));
    else url.searchParams.delete('volume');
    history.replaceState(null, '', url);
  }

  function open(book, requestedVolume) {
    openBook = book;
    $('ol-source').textContent = `${book.subject}${book.module ? ` · ${book.module}` : ''}`;
    $('ol-title').textContent = book.title;
    $('ol-details').textContent = [book.details, book.description,
      book.learningAreas?.length ? `Used in ${book.learningAreas.join(', ')}` : ''].filter(Boolean).join(' · ');
    const volumeWrap = $('ol-volume-wrap');
    const volumeSelect = $('ol-volume');
    volumeSelect.replaceChildren();
    volumeWrap.hidden = !book.volumes;
    let volume = null;
    if (book.volumes?.length) {
      for (const item of book.volumes) {
        const option = document.createElement('option');
        option.value = String(item.number);
        option.textContent = item.label || `Volume ${item.number}`;
        volumeSelect.append(option);
      }
      volume = book.volumes.find(item => String(item.number) === String(requestedVolume)) || book.volumes[0];
      volumeSelect.value = String(volume.number);
    }
    showPdf(book, volume);
    dialog.showModal();
  }

  results.addEventListener('click', event => {
    const id = event.target.closest('[data-resource]')?.dataset.resource;
    const book = books.find(item => item.id === id);
    if (book) open(book);
  });
  $('ol-search').addEventListener('input', render);
  $('ol-volume').addEventListener('change', event => {
    const volume = openBook?.volumes?.find(item => String(item.number) === event.target.value);
    if (volume) showPdf(openBook, volume);
  });
  $('ol-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    openBook = null;
    viewer.src = 'about:blank';
    const url = new URL(window.location.href);
    url.searchParams.delete('resource');
    url.searchParams.delete('volume');
    history.replaceState(null, '', url);
  });

  render();
  async function loadAcademyMetadata() {
    try {
      const base = window.M4L_CONFIG?.API_BASE || '';
      const response = await fetch(`${base}/api/academy/open-library/metadata/public`);
      if (!response.ok) return {};
      const data = await response.json();
      return Object.fromEntries((Array.isArray(data.records) ? data.records : [])
        .filter(record => typeof record.id === 'string')
        .map(record => [record.id, record]));
    } catch { return {}; }
  }
  async function loadArchiveBooks() {
    status.textContent = 'Loading books from Internet Archive…';
    try {
      const response = await fetch('/academy/open-library/catalogue');
      if (!response.ok) throw new Error('Archive.org catalogue unavailable');
      const data = await response.json();
      if (!Array.isArray(data.books)) throw new Error('Invalid Archive.org catalogue');
      books = [...books, ...data.books];
      status.textContent = data.books.length ? '' : 'No public PDFs are available in the Archive.org list yet.';
      render();
      const metadata = await loadAcademyMetadata();
      books = books.map(book => {
        const record = metadata[book.id];
        if (!record) return book;
        return {
          ...book,
          title: record.title || book.title,
          subject: record.subject || book.subject,
          module: record.module || '',
          learningAreas: Array.isArray(record.learningAreas) ? record.learningAreas : [],
          details: record.author || book.details,
          description: record.description || book.description,
          coverUrl: record.coverUrl || book.coverUrl
        };
      });
      render();
    } catch (_error) {
      status.textContent = 'Archive.org books are temporarily unavailable. Please try again later.';
    }
    const linkedBook = books.find(book => book.id === new URLSearchParams(window.location.search).get('resource'));
    if (linkedBook) open(linkedBook, new URLSearchParams(window.location.search).get('volume'));
  }

  loadArchiveBooks();
})();
