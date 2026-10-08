/* V105.4.2.7 · Read-only Program Library viewer, following Reboot's subject and resource ribbons. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const types = {EBOOK:'eBook', PRINTABLE:'Printable', AUDIO:'Audio', VIDEO:'Video', OTHER:'Other'};
  const icons = {EBOOK:'/icons/ebook.svg', PRINTABLE:'/icons/printable.svg', AUDIO:'/icons/audio.svg', VIDEO:'/icons/video.svg', OTHER:'/icons/other.svg'};
  const programId = new URLSearchParams(location.search).get('program') || '';
  const state = {resources:[], subject:'ALL', coverCache:new Map(), coverQueued:new Set(), coverRunning:false, coverTimer:0, observer:null, openResource:null};
  function clearPreviewMedia() {
    for (const player of $('lv-preview-media').children) {
      player.pause?.();
      player.removeAttribute?.('src');
      player.load?.();
    }
    $('lv-preview-media').replaceChildren();
  }
  const status = (message, error=false) => { $('lv-status').textContent=message; $('lv-status').classList.toggle('is-error', error); };

  async function api(action, body={}) {
    const token = localStorage.getItem('m4l_account_token');
    if (!token) throw new Error('Sign in through your personal Academy account link.');
    const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/program-library/${action}`, {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      body:JSON.stringify({id:programId,...body})
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'The Library could not be loaded.');
    return result;
  }

  function selectedResources() {
    const query = $('lv-search').value.trim().toLocaleLowerCase();
    const type = $('lv-type').value;
    return state.resources.filter(row =>
      (type === 'ALL' || row.type === type) &&
      (state.subject === 'ALL' || row.subjectId === state.subject) &&
      (!query || [row.name,row.author,row.publisher,row.description,row.subjectName,row.moduleName].some(value =>
        String(value || '').toLocaleLowerCase().includes(query)))
    );
  }

  function renderSubjects() {
    const subjects = [...new Map(state.resources.map(row => [row.subjectId,row.subjectName])).entries()]
      .sort((a,b) => a[1].localeCompare(b[1]));
    const button = (id,label) => `<button type="button" data-subject="${esc(id)}" aria-current="${state.subject===id}">${esc(label)}</button>`;
    $('lv-subjects').innerHTML = button('ALL','All subjects') + subjects.map(([id,name]) => button(id,name)).join('');
  }

  function card(row) {
    const cache = state.coverCache.get(row.id);
    const hasFreshCover = cache && cache.expiry > Date.now();
    const cover = row.publicBook && row.coverUrl
      ? `<img src="${esc(row.coverUrl)}" alt="Cover of ${esc(row.name)}" loading="lazy">`
      : row.hasCover && hasFreshCover
      ? `<img src="${esc(cache.url)}" alt="Cover of ${esc(row.name)}" loading="lazy">`
      : row.hasCover
        ? `<span class="lv-cover-placeholder" data-cover="${esc(row.id)}" aria-hidden="true">▣</span>`
        : `<span class="lv-cover-placeholder" aria-hidden="true"><img src="${esc(icons[row.type] || icons.OTHER)}" alt="" width="34" height="34"></span>`;
    const caption = row.hasCover
      ? `<span class="lv-card-caption"><img class="lv-media-icon" src="${esc(icons[row.type] || icons.OTHER)}" alt=""><strong>${esc(row.name)}</strong></span>`
      : `<small>${esc(types[row.type] || 'Resource')}</small><strong>${esc(row.name)}</strong>${row.author?`<span class="lv-author">${esc(row.author)}</span>`:''}`;
    return `<button type="button" class="lv-card" data-resource="${esc(row.id)}" aria-label="Open ${esc(row.name)}">${cover}${caption}</button>`;
  }

  function renderResults() {
    const rows = selectedResources();
    const subjects = new Map();
    for (const row of rows) {
      if (!subjects.has(row.subjectId)) subjects.set(row.subjectId,{name:row.subjectName,modules:new Map()});
      const subject = subjects.get(row.subjectId);
      const key = `${row.levelId}|${row.moduleId}`;
      if (!subject.modules.has(key)) subject.modules.set(key,{name:[row.levelName,row.moduleName].filter(Boolean).join(' · '),rows:[]});
      subject.modules.get(key).rows.push(row);
    }
    $('lv-results').innerHTML = subjects.size
      ? [...subjects.values()].map(subject => `<section class="lv-section"><h2>${esc(subject.name)}</h2>${[...subject.modules.values()].map(module =>
        `<div class="lv-module"><h3>${esc(module.name)}</h3><div class="lv-ribbon" aria-label="${esc(module.name)} resources">${module.rows.map(card).join('')}</div></div>`).join('')}</section>`).join('')
      : '<p class="lv-empty">No resources match this selection.</p>';
    observeCovers();
  }

  function observeCovers() {
    state.observer?.disconnect();
    if (!('IntersectionObserver' in window)) {
      $('lv-results').querySelectorAll('[data-cover]').forEach(node => queueCover(node.dataset.cover));
      return;
    }
    state.observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        state.observer.unobserve(entry.target);
        queueCover(entry.target.dataset.cover);
      }
    },{rootMargin:'160px'});
    $('lv-results').querySelectorAll('[data-cover]').forEach(node => state.observer.observe(node));
  }

  function queueCover(id) {
    if (!id || state.coverCache.get(id)?.expiry > Date.now()) return;
    state.coverQueued.add(id);
    if (!state.coverTimer) state.coverTimer=window.setTimeout(() => {
      state.coverTimer=0;
      void flushCovers();
    },60);
  }

  async function flushCovers() {
    if (state.coverRunning || !state.coverQueued.size) return;
    state.coverRunning=true;
    const ids=[...state.coverQueued].slice(0,16);
    ids.forEach(id=>state.coverQueued.delete(id));
    try {
      const result=await api('covers',{resourceIds:ids});
      for (const cover of result.covers||[]) {
        const entry={url:cover.url,expiry:Date.now()+Math.max(1,Number(result.expiresIn)||300)*1000-10000};
        state.coverCache.set(cover.id,entry);
        document.querySelectorAll('[data-cover]').forEach(placeholder => {
          if (placeholder.dataset.cover!==cover.id) return;
          const img=document.createElement('img');img.src=entry.url;img.alt=`Cover of ${state.resources.find(row=>row.id===cover.id)?.name||'book'}`;img.loading='lazy';
          placeholder.replaceWith(img);
        });
      }
    } catch { /* A cover request can fail without hiding the resource. */ }
    finally { state.coverRunning=false;if(state.coverQueued.size)void flushCovers(); }
  }

  function pdfProxy(url) {
    const bytes = new TextEncoder().encode(url);
    let binary='';
    for (const byte of bytes) binary+=String.fromCharCode(byte);
    return `/pdf-file/${btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}`;
  }

  function showPublicPdf(resource, volume) {
    const url = volume?.pdfUrl || resource.pdfUrl;
    const frame = document.createElement('iframe');
    frame.title = `${resource.name}${volume ? `, ${volume.label || `volume ${volume.number}`}` : ''} PDF`;
    frame.src = `/pdf-viewer/web/viewer.html?file=${encodeURIComponent(pdfProxy(url))}`;
    clearPreviewMedia();
    $('lv-preview-media').append(frame);
    $('lv-open-file').href = url;
    $('lv-open-file').textContent = 'Open original PDF at Archive.org ↗';
    $('lv-open-file').hidden = false;
  }

  function showPublicMedia(resource, file) {
    const url = file?.mediaUrl || resource.mediaUrl;
    const player = document.createElement(resource.type === 'AUDIO' ? 'audio' : 'video');
    player.controls = true;
    player.preload = 'metadata';
    player.src = url;
    clearPreviewMedia();
    $('lv-preview-media').append(player);
    $('lv-open-file').href = url;
    $('lv-open-file').textContent = `Open original ${resource.type === 'AUDIO' ? 'audio' : 'video'} at Archive.org ↗`;
    $('lv-open-file').hidden = false;
  }

  async function loadPublicBooks() {
    let catalogue = { books: [] };
    try {
      const response = await fetch('/academy/open-library/catalogue');
      if (response.ok) catalogue = await response.json();
    } catch { /* Public Academy links remain available if Archive.org is unavailable. */ }
    const metadataResponse = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/open-library/metadata/public`);
    if (!metadataResponse.ok) return;
    const metadata = await metadataResponse.json();
    const allRecords = Array.isArray(metadata.records) ? metadata.records : [];
    const records = new Map(allRecords.map(record => [record.id, record]));
    const existing = new Set(state.resources.map(row => row.id));
    const pdf = url => /^https:\/\/archive\.org\/download\/[^?#]+\.pdf$/i.test(url || '');
    const books = (Array.isArray(catalogue.books) ? catalogue.books : []).flatMap(book => {
      const record = records.get(book.id);
      if (!record?.learningAreaRefs?.includes(`PROGRAM:${programId}`) || existing.has(book.id)) return [];
      const volumes = Array.isArray(book.volumes) ? book.volumes.filter(volume =>
        Number.isInteger(volume.number) && pdf(volume.pdfUrl)) : [];
      const pdfUrl = pdf(book.pdfUrl) ? book.pdfUrl : '';
      const media = url => /^https:\/\/archive\.org\/download\/[^?#]+\.(?:mp3|m4a|ogg|mp4|webm)$/i.test(url || '');
      const mediaFiles = Array.isArray(book.mediaFiles) ? book.mediaFiles.filter(file =>
        Number.isInteger(file.number) && media(file.mediaUrl)) : [];
      const mediaUrl = media(book.mediaUrl) ? book.mediaUrl : '';
      const mediaType = book.resourceType === 'AUDIO' || book.resourceType === 'VIDEO' ? book.resourceType : '';
      if (!volumes.length && !pdfUrl && !(mediaType && (mediaFiles.length || mediaUrl))) return [];
      const subjectName = record.subject || book.subject || 'Books';
      const moduleName = record.module || 'General';
      const matchingSubject = state.resources.find(row => row.subjectName.toLocaleLowerCase() === subjectName.toLocaleLowerCase());
      const matchingModule = state.resources.find(row => row.subjectId === matchingSubject?.subjectId &&
        row.moduleName.toLocaleLowerCase() === moduleName.toLocaleLowerCase());
      return [{ id: book.id, type: mediaType || (record.resourceType === 'PRINTABLE' ? 'PRINTABLE' : 'EBOOK'), name: record.title || book.title,
        description: record.description || book.description || '', author: record.author || book.details || '',
        subjectId: matchingSubject?.subjectId || record.subjectRef || `OPEN:${subjectName}`,
        subjectName, levelId: matchingModule?.levelId || '', levelName: matchingModule?.levelName || '',
        moduleId: matchingModule?.moduleId || record.moduleRef || `OPEN:${moduleName}`, moduleName,
        hasCover: Boolean(record.coverUrl || book.coverUrl), coverUrl: record.coverUrl || book.coverUrl || '',
        publicBook: true, volumes, pdfUrl, mediaFiles, mediaUrl }];
    });
    for (const record of allRecords) {
      if (record.kind !== 'LINK' || record.resourceType !== 'OTHER' || record.active === false ||
          !record.id?.startsWith('EXTERNAL:ACADEMY_LINK:') ||
          !record.learningAreaRefs?.includes(`PROGRAM:${programId}`) || existing.has(record.id) ||
          typeof record.linkUrl !== 'string' || !/^https:\/\//i.test(record.linkUrl)) continue;
      const subjectName = record.subject || 'Other';
      const moduleName = record.module || 'General';
      const matchingSubject = state.resources.find(row => row.subjectName.toLocaleLowerCase() === subjectName.toLocaleLowerCase());
      const matchingModule = state.resources.find(row => row.subjectId === matchingSubject?.subjectId &&
        row.moduleName.toLocaleLowerCase() === moduleName.toLocaleLowerCase());
      books.push({ id: record.id, type: 'OTHER', name: record.title,
        description: record.description || '', author: record.author || '',
        subjectId: matchingSubject?.subjectId || record.subjectRef || `OPEN:${subjectName}`,
        subjectName, levelId: matchingModule?.levelId || '', levelName: matchingModule?.levelName || '',
        moduleId: matchingModule?.moduleId || record.moduleRef || `OPEN:${moduleName}`, moduleName,
        hasCover: Boolean(record.coverUrl), coverUrl: record.coverUrl || '',
        publicBook: true, publicLink: true, linkUrl: record.linkUrl, volumes: [] });
    }
    state.resources.push(...books);
    state.resources.sort((a, b) => a.subjectName.localeCompare(b.subjectName) ||
      a.moduleName.localeCompare(b.moduleName) || a.name.localeCompare(b.name));
    renderSubjects(); renderResults();
    status(`${state.resources.length} ${state.resources.length === 1 ? 'resource' : 'resources'} available`);
  }

  async function openResource(id) {
    const resource=state.resources.find(row=>row.id===id);
    if (!resource) return;
    if (resource.publicLink) { window.open(resource.linkUrl, '_blank', 'noopener,noreferrer'); return; }
    state.openResource=resource;
    const dialog=$('lv-preview');
    $('lv-preview-title').textContent=resource.name;
    $('lv-preview-type').textContent=types[resource.type]||'Resource';
    $('lv-preview-details').textContent=[resource.author&&`By ${resource.author}`,resource.publisher,
      resource.publicationYear,resource.isbn&&`ISBN ${resource.isbn}`,resource.description,resource.taskName]
      .filter(Boolean).join(' · ');
    $('lv-preview-status').textContent=resource.publicBook ? '' : 'Opening protected file…';
    clearPreviewMedia();
    $('lv-open-file').hidden=true;
    const mediaType = resource.type === 'AUDIO' || resource.type === 'VIDEO';
    const parts = mediaType ? resource.mediaFiles : resource.volumes;
    $('lv-volume-wrap').hidden=!resource.publicBook || !parts?.length || (parts.length < 2 && !resource.volumes?.length);
    $('lv-volume-label').textContent = resource.type === 'AUDIO' ? 'Track' : resource.type === 'VIDEO' ? 'Video' : 'Volume';
    $('lv-volume').replaceChildren();
    if (resource.publicBook && parts?.length) {
      for (const volume of parts) {
        const option=document.createElement('option');
        option.value=String(volume.number);
        option.textContent=volume.label || `Volume ${volume.number}`;
        $('lv-volume').append(option);
      }
    }
    dialog.showModal();
    if (resource.publicBook) {
      if (mediaType) showPublicMedia(resource, resource.mediaFiles?.[0]);
      else showPublicPdf(resource, resource.volumes?.[0]);
      return;
    }
    try {
      const result=await api('access',{resourceId:id});
      if (!dialog.open || $('lv-preview-title').textContent!==resource.name) return;
      $('lv-preview-status').textContent='';
      const mime=String(result.mimeType||'').toLowerCase();
      const file=$('lv-preview-media');
      if (mime==='application/pdf' || String(result.format||'').toUpperCase()==='PDF') {
        const frame=document.createElement('iframe');frame.title=`${resource.name} PDF`;frame.src=`/pdf-viewer/web/viewer.html?file=${encodeURIComponent(pdfProxy(result.url))}`;file.append(frame);
      } else if (mime.startsWith('audio/')) {
        const player=document.createElement('audio');player.controls=true;player.src=result.url;file.append(player);
      } else if (mime.startsWith('video/')) {
        const player=document.createElement('video');player.controls=true;player.src=result.url;file.append(player);
      } else if (mime.startsWith('image/')) {
        const image=document.createElement('img');image.src=result.url;image.alt=resource.name;file.append(image);
      } else $('lv-preview-status').textContent='Open this resource in a new tab.';
      $('lv-open-file').href=result.url;
      $('lv-open-file').hidden=false;
    } catch(error) { $('lv-preview-status').textContent=error.message; }
  }

  async function load() {
    status('Loading Library…');
    try {
      const result=await api('catalogue');
      state.resources=result.resources||[];
      $('lv-title').textContent=`${result.program.name} Library`;
      $('lv-account').href=result.accountPath||'/';
      $('lv-manage').hidden=!result.canManage;
      if (result.canManage) $('lv-manage').href=`/programs/library.html?program=${encodeURIComponent(programId)}`;
      $('lv-controls').hidden=false;
      renderSubjects();renderResults();
      status(`${state.resources.length} ${state.resources.length===1?'resource':'resources'} available`);
      if (result.role) {
        try { await loadPublicBooks(); } catch { /* Protected resources remain available. */ }
      }
    } catch(error) { state.resources=[];$('lv-controls').hidden=true;status(error.message,true); }
  }

  if (!/^PRG-[0-9a-f-]{36}$/i.test(programId)) status('Open a Program Library from your Academy account.',true);
  else {
    $('lv-refresh').addEventListener('click',load);
    $('lv-search').addEventListener('input',renderResults);
    $('lv-type').addEventListener('change',renderResults);
    $('lv-subjects').addEventListener('click',event => {
      const button=event.target.closest('[data-subject]');if(!button)return;
      state.subject=button.dataset.subject;renderSubjects();renderResults();
    });
    $('lv-results').addEventListener('click',event => {
      const button=event.target.closest('[data-resource]');if(button)void openResource(button.dataset.resource);
    });
    $('lv-close').addEventListener('click',() => $('lv-preview').close());
    $('lv-preview').addEventListener('close',() => { state.openResource=null;clearPreviewMedia(); });
    $('lv-volume').addEventListener('change',event => {
      const resource=state.openResource;
      const mediaType=resource?.type==='AUDIO'||resource?.type==='VIDEO';
      const volume=(mediaType?resource.mediaFiles:resource?.volumes)?.find(item => String(item.number)===event.target.value);
      if (resource?.publicBook && volume && mediaType) showPublicMedia(resource,volume);
      else if (resource?.publicBook && volume) showPublicPdf(resource,volume);
    });
    void load();
  }
})();
