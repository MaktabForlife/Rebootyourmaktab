(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const state = { home: null, activity: null, generation: 0, scheduleGeneration: 0, activityGeneration: 0, information: {}, startDate: '' };
  const titles = { overview: 'Academy home', timetable: 'Academy timetable', learning: 'Programs and Courses', activity: 'Activity',
    prospectus: '2026 Prospectus', about: 'About', contact: 'Contact', progress: 'Dua and Surah Progress', recorder: 'Voice Recorder', administration: 'Academy administration' };
  const activityHref = row => `#activity/${row.kind}/${encodeURIComponent(row.id)}`;
  const roleName = roles => roles.map(role => ({ GLOBAL_ADMIN: 'Global Admin', ADMIN: 'Program Admin', SENIOR: 'Senior', TEACHER: 'Teacher', STUDENT: 'Student' })[role]).filter(Boolean).join(' · ') || 'Visitor';
  const coming = (name, purpose) => `<article class="card card-pad coming-card"><h3>${esc(name)}</h3><span class="tag neutral">Coming soon</span><p>${esc(purpose)}</p></article>`;
  const safeLink = url => typeof url === 'string' && (/^https:\/\//.test(url) || /^\/(?!\/)/.test(url));
  const catalogueName = name => String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  const originalActivities = [
    { kind: 'PROGRAM', id: 'PRG-46c8576d-9fcf-4000-96b9-856b00a0218a', name: 'Reboot', image: 'learning-images/reboot.jpeg' },
    { kind: 'PROGRAM', name: 'Aalimiya', aliases: ['Aalimiya', 'Aalimiyyah', 'Alimiyyah', 'Alimiyah', 'Alimiya'], image: 'academy-logo.png' },
    { kind: 'PROGRAM', name: 'Ma’had Arwa · Hifz', aliases: ['Ma’had Arwa', 'Ma’had Arwa · Hifz'], image: 'course-images/HIFZ-CHALLENGES-MEMORIZING-WITH-LOVE.webp' },
    { kind: 'COURSE', name: 'Tafseer & Tadabbur', aliases: ['Tafseer & Tadabbur', 'Tafseer and Tadabbur', 'Tafseer'], image: 'learning-images/tafseer.jpeg' },
    { kind: 'COURSE', name: 'Classical & Conversational Arabic', aliases: ['Classical & Conversational Arabic', 'Classical and Conversational Arabic', 'Arabic'], image: 'learning-images/arabic.png' },
    { kind: 'COURSE', name: 'Mothers of the Ummah', aliases: ['Mothers of the Ummah'], image: 'learning-images/mothers.jpg' }
  ];

  function renderCatalogue(kind, rows) {
    const remaining = new Set(rows);
    const featured = originalActivities.filter(row => row.kind === kind).map(original => {
      const matches = rows.filter(row => original.id ? row.id.toUpperCase() === original.id.toUpperCase() :
        original.aliases.some(alias => catalogueName(alias) === catalogueName(row.name)));
      // Ambiguous names never select a Program or Course on the visitor's behalf.
      const activity = matches.length === 1 ? matches[0] : null;
      if (activity) remaining.delete(activity);
      return { ...original, activity };
    });
    return [...featured, ...[...remaining].map(activity => ({ name: activity.name, activity }))].map(row => {
      const activity = row.activity;
      const artwork = row.image ? `<a class="activity-art" href="https://ummabbadacademy.com/courses-uaa/" target="_blank" rel="noopener noreferrer" aria-label="View ${esc(row.name)} on the original Academy site"><img src="/academy/${esc(row.image)}" alt="Academy artwork for ${esc(row.name)}" loading="lazy"></a>` : '';
      return `<article class="card activity-card">${artwork}<div class="card-pad"><span class="eyebrow">${kind === 'PROGRAM' ? 'Program' : 'Course'}</span><h3>${esc(activity?.name || row.name)}</h3>${activity ? `<p class="muted">${activity.roles.length ? esc(roleName(activity.roles)) : 'Explore this Academy activity.'}</p><a class="button secondary" href="${activityHref(activity)}">Open ${esc(activity.name)} →</a>` : '<span class="tag neutral">Coming soon</span>'}${row.image ? '<p><a class="text-link" href="https://ummabbadacademy.com/courses-uaa/" target="_blank" rel="noopener noreferrer">View on original Academy site ↗</a></p>' : ''}</div></article>`;
    }).join('');
  }

  async function request(body) {
    const session = token();
    const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/entrance`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: JSON.stringify(body) });
    const result = await response.json();
    if (token() !== session) throw new Error('The Academy account has changed.');
    if (!response.ok || !result.success) {
      if (response.status === 401) window.dispatchEvent(new Event('m4l-academy-session-ended'));
      throw new Error(result.error || 'Academy information is temporarily unavailable.');
    }
    return result;
  }

  async function loadHome() {
    const generation = ++state.generation;
    $('entrance-message').textContent = 'Loading Academy information…';
    $('entrance-retry').hidden = true;
    try {
      const result = await request({});
      if (generation !== state.generation) return;
      state.home = result;
      state.startDate = result.startDate;
      $('schedule-date').value = result.startDate;
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}. Times are shown with their timezone.`;
      $('entrance-message').textContent = result.warnings.join(' ');
      $('entrance-retry').hidden = !result.warnings.length;
      renderHome();
      route();
    } catch (error) {
      if (generation !== state.generation) return;
      $('entrance-message').textContent = error.message;
      $('entrance-retry').hidden = false;
      if (!state.home) {
        $('academy-preview-sessions').textContent = 'The Academy timetable is currently unavailable.';
        $('academy-sessions').textContent = 'The Academy timetable is currently unavailable.';
        $('program-catalogue').textContent = 'Program information is currently unavailable.';
        $('course-catalogue').textContent = 'Course information is currently unavailable.';
      }
    }
  }

  async function loadSchedule() {
    const generation = ++state.scheduleGeneration;
    $('schedule-message').textContent = 'Loading Academy timetable…';
    try {
      const result = await request({ startDate: state.startDate });
      if (generation !== state.scheduleGeneration) return;
      state.startDate = result.startDate;
      $('schedule-date').value = result.startDate;
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}. Times are shown with their timezone.`;
      $('schedule-message').textContent = result.warnings.join(' ');
      renderSchedule('academy-sessions', result.timetable);
    } catch (error) {
      if (generation !== state.scheduleGeneration) return;
      $('schedule-message').textContent = error.message;
      $('academy-sessions').replaceChildren();
      state.information['academy-sessions'] = [];
    }
  }

  function renderHome() {
    const data = state.home;
    $('personal-activities').hidden = !data.signedIn;
    $('personal-empty').hidden = Boolean(data.personalActivities.length);
    $('personal-pills').innerHTML = data.personalActivities.map(row => `<a href="${activityHref(row)}">${esc(row.name)}<small>${esc(roleName(row.roles))}</small></a>`).join('') +
      (data.student ? '<a href="#progress">Dua and Surah Progress</a><a href="#recorder">Voice Recorder</a>' : '') +
      (data.globalAdmin ? '<a href="#administration">Academy administration</a>' : '');
    for (const [kind, id] of [['PROGRAM', 'program-catalogue'], ['COURSE', 'course-catalogue']]) {
      const rows = data.activities.filter(row => row.kind === kind);
      $(id).innerHTML = renderCatalogue(kind, rows);
    }
    const preview = upcomingItems(data.timetable);
    renderSchedule('academy-preview-sessions', preview, false, true);
    if (!preview.length) $('academy-preview-sessions').textContent = 'No upcoming published lessons in the next seven days.';
    $('preview-timetable-link').hidden = !data.signedIn;
    $('schedule-message').textContent = '';
    renderSchedule('academy-sessions', data.timetable);
  }

  function upcomingItems(rows, now = new Date()) {
    const clocks = new Map(), seen = new Set();
    return rows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .filter(row => {
        if (row.status && row.status !== 'SCHEDULED') return false;
        if (!clocks.has(row.timezone)) {
          const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: row.timezone,
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(now).map(part => [part.type, part.value]));
          clocks.set(row.timezone, { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` });
        }
        const clock = clocks.get(row.timezone);
        const endDate = row.endTime <= row.startTime
          ? new Date(Date.parse(`${row.date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : row.date;
        if (endDate < clock.date || endDate === clock.date && row.endTime <= clock.time) return false;
        const identity = `${row.kind}:${row.activityId}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  }

  function renderSchedule(id, rows, detailed = false, compact = false) {
    state.information[id] = rows;
    if (!rows.length) { $(id).textContent = 'No published lessons in this date range.'; return; }
    $(id).innerHTML = `<ol class="schedule-list${compact ? ' schedule-preview-list' : ''}">${rows.map((row, index) => {
      const info = row.information?.length ? index : -1;
      const title = detailed || !state.home?.signedIn ? esc(row.title) : `<a href="${activityHref({ kind: row.kind, id: row.activityId })}">${esc(row.title)}</a>`;
      const join = detailed && safeLink(row.joinUrl) ? `<a class="button small" href="${esc(row.joinUrl)}" target="_blank" rel="noopener noreferrer">Join lesson</a>` : '';
      const actions = `${info >= 0 ? `<button type="button" class="information-button" data-information="${id}:${info}" aria-label="More information about ${esc(row.title)}">i</button>` : ''}${join}`;
      if (compact) return `<li class="${row.involvement === 'teacher' ? 'teacher' : row.involvement === 'student' ? 'student' : ''}"><div class="lesson-name">${title}</div><div class="preview-when"><time datetime="${esc(row.date)}">${esc(formatDate(row.date))}</time> · ${esc(row.startTime)}–${esc(row.endTime)}<small>${esc(row.timezone)}</small></div><div class="lesson-actions">${actions}</div></li>`;
      return `<li class="${row.involvement === 'teacher' ? 'teacher' : row.involvement === 'student' ? 'student' : ''}"><time datetime="${esc(row.date)}">${esc(formatDate(row.date))}</time><div>${esc(row.startTime)}–${esc(row.endTime)}<small>${esc(row.timezone)}</small></div><div class="lesson-name">${title}${detailed ? `<small>${esc(row.activityName)}</small>` : ''}</div><div class="lesson-actions">${info >= 0 ? `<button type="button" class="information-button" data-information="${id}:${info}" aria-label="More information about ${esc(row.title)}">i</button>` : ''}${join}</div></li>`;
    }).join('')}</ol>`;
  }

  async function loadActivity(id) {
    const generation = ++state.activityGeneration;
    $('activity-title').textContent = 'Opening activity…';
    $('activity-role').textContent = '';
    $('activity-status').textContent = '';
    for (const target of ['activity-menu', 'activity-sessions', 'activity-coming', 'activity-curriculum', 'activity-classes']) $(target).replaceChildren();
    $('activity-classes-section').hidden = true;
    $('activity-curriculum-section').hidden = true;
    try {
      const result = await request({ id, startDate: state.startDate });
      if (generation !== state.activityGeneration) return;
      const row = state.activity = result.activity;
      $('activity-title').textContent = row.name;
      $('activity-kind').textContent = row.kind === 'PROGRAM' ? 'Program' : 'Course';
      $('activity-role').textContent = roleName(row.roles);
      $('current-view').textContent = row.name;
      $('activity-status').textContent = row.unavailable ? 'This activity is temporarily unavailable. Please try again.' :
        !row.roles.length ? 'Sign in with an authorised Academy account to open protected lessons and tools.' : '';
      const menu = [['Library', row.tools?.library], ['Attendance', row.tools?.attendance], ['Manage Program', row.tools?.manage],
        ['Timetable builder', row.tools?.timetableBuilder], ['Manage resources', row.tools?.resources]];
      $('activity-menu').innerHTML = menu.filter(([, href]) => safeLink(href)).map(([label, href]) => `<a href="${esc(href)}">${label}</a>`).join('') + '<a href="/academy/open-library/">Explore the Public Library</a>';
      renderSchedule('activity-sessions', row.timetable, true);
      if (row.classes.length) {
        $('activity-classes-section').hidden = false;
        $('activity-classes').innerHTML = row.classes.map(item => `<li>${esc(item.name)}</li>`).join('');
      }
      if (row.curriculum.length) {
        $('activity-curriculum-section').hidden = false;
        $('curriculum-title').textContent = row.kind === 'PROGRAM' ? 'Subjects and Modules' : 'Course Modules';
        $('activity-curriculum').innerHTML = row.curriculum.map(item => `<div class="curriculum-subject"><h3>${esc(item.name)}</h3>${item.modules?.length ? `<ul>${item.modules.map(module => `<li>${esc(module.name)}</li>`).join('')}</ul>` : ''}</div>`).join('');
      }
      $('activity-coming').innerHTML = coming('Announcements', 'Updates for this activity.') + coming('Assignments', 'Learning tasks and submissions.') +
        coming('Lesson preparation', 'Teaching notes shared within this activity.') + coming('Progress', 'Progress for this activity.') +
        (!row.tools?.attendance ? coming('Attendance', 'Registers for teachers and authorised administrators.') : '') +
        (row.kind === 'PROGRAM' && row.roles.includes('ADMIN') && !row.tools?.manage ? coming('Manage Program', 'Program management for the authorised HOD.') : '');
    } catch (error) {
      if (generation === state.activityGeneration) { $('activity-title').textContent = 'Activity unavailable'; $('activity-status').textContent = error.message; }
    }
  }

  function route() {
    const [requested, , encodedId] = location.hash.slice(1).split('/');
    const name = requested === 'learning' ? 'overview' : titles[requested] ? requested : 'overview';
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === name));
    document.querySelectorAll('[data-nav]').forEach(button => {
      const current = button.dataset.nav === requested || !requested && button.dataset.nav === 'overview';
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('current-view').textContent = titles[name];
    if (requested === 'learning') $('learning').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (name === 'activity' && encodedId) { try { void loadActivity(decodeURIComponent(encodedId)); } catch { $('activity-status').textContent = 'This activity link is invalid.'; } }
    if (name === 'recorder') $('recorder-card').innerHTML = state.home?.student ? '<p>Select an existing lesson image, record your voice, then preview and share your video.</p><a class="button" href="/recorder/?academy=1">Open Voice Recorder →</a>' : '<p>Voice Recorder is available to signed-in Academy students.</p>';
    if (name === 'administration') renderAdministration();
  }

  function renderAdministration() {
    let view = $('administration');
    if (!view) { view = document.createElement('section'); view.id = 'administration'; view.className = 'view active'; document.querySelector('.container').appendChild(view); }
    view.classList.add('active');
    view.innerHTML = '<div class="page-heading"><h1>Academy administration</h1></div>' + (state.home?.globalAdmin ? '<div class="activity-pills"><a href="/users/">User profiles</a><a href="/programs/">Manage Programs</a><a href="/academy/library/manage/">Manage Library</a></div>' : '<p>This page requires an authenticated Global Admin account.</p>');
  }

  function clearPersonal() {
    state.generation++;
    state.scheduleGeneration++;
    state.activityGeneration++;
    state.home = null;
    state.activity = null;
    state.information = {};
    $('personal-activities').hidden = true;
    for (const id of ['personal-pills', 'academy-preview-sessions', 'academy-sessions', 'activity-menu', 'activity-sessions', 'activity-coming', 'activity-classes', 'activity-curriculum', 'program-catalogue', 'course-catalogue', 'recorder-card']) $(id).replaceChildren();
    $('preview-timetable-link').hidden = true;
    $('schedule-message').textContent = '';
    $('activity-title').textContent = '';
    $('activity-role').textContent = '';
    $('activity-status').textContent = '';
    $('activity-kind').textContent = '';
    $('current-view').textContent = 'Academy home';
    $('activity-classes-section').hidden = true;
    $('activity-curriculum-section').hidden = true;
    if ($('administration')) $('administration').replaceChildren();
    if ($('lesson-information').open) $('lesson-information').close();
    $('lesson-information-body').replaceChildren();
  }

  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); location.hash = nav.dataset.nav; route(); }
    const info = event.target.closest('[data-information]');
    if (info) {
      const [group, index] = info.dataset.information.split(':');
      const row = state.information[group]?.[Number(index)];
      if (!row) return;
      $('lesson-information-title').textContent = row.title;
      $('lesson-information-body').innerHTML = row.information.map(text => `<p>${esc(text)}</p>`).join('');
      $('lesson-information').showModal();
    }
  });
  $('lesson-information-close').addEventListener('click', () => $('lesson-information').close());
  $('entrance-retry').addEventListener('click', () => void loadHome());
  $('schedule-date').addEventListener('change', () => { state.startDate = $('schedule-date').value; void loadSchedule(); });
  for (const [id, days] of [['schedule-previous', -7], ['schedule-next', 7]]) $(id).addEventListener('click', () => {
    if (!state.startDate) return;
    state.startDate = new Date(Date.parse(`${state.startDate}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    void loadSchedule();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('m4l-academy-session', () => { clearPersonal(); void loadHome(); });
  window.addEventListener('storage', event => { if (event.key === 'm4l_account_token') { clearPersonal(); void loadHome(); } });
  window.addEventListener('pageshow', () => { clearPersonal(); void loadHome(); });

  const film = $('film-track'), cards = [...film.querySelectorAll('.film-card')];
  let filmIndex = 0, paused = true;
  function moveFilm(index) {
    filmIndex = (index + cards.length) % cards.length;
    film.scrollTo({ left: cards[filmIndex].offsetLeft - cards[0].offsetLeft, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    $('film-status').textContent = `${filmIndex + 1} / ${cards.length}`;
    document.querySelectorAll('[data-film-page]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.filmPage) === Math.floor(filmIndex / 10))));
  }
  $('film-prev').addEventListener('click', () => moveFilm(filmIndex - 1));
  $('film-next').addEventListener('click', () => moveFilm(filmIndex + 1));
  $('film-toggle').textContent = 'Play';
  $('film-toggle').setAttribute('aria-label', 'Play course strip');
  $('film-toggle').addEventListener('click', () => { paused = !paused; $('film-toggle').textContent = paused ? 'Play' : 'Pause'; $('film-toggle').setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} course strip`); });
  document.querySelectorAll('[data-film-page]').forEach(button => button.addEventListener('click', () => moveFilm(Number(button.dataset.filmPage) * 10)));
  setInterval(() => { if (!paused && document.visibilityState === 'visible' && $('overview').classList.contains('active') && !film.contains(document.activeElement)) moveFilm(filmIndex + 1); }, 4800);
  route();
  void loadHome();
})();
