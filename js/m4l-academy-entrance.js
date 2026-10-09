(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const state = { home: null, activity: null, personalTimetable: [], personalStartDate: '', activityTimer: null, generation: 0, scheduleGeneration: 0, activityGeneration: 0, information: {}, startDate: '' };
  const titles = { overview: 'Academy home', timetable: 'Academy timetable', learning: 'Programs and Courses', workshops: 'Workshops', activity: 'Activity',
    prospectus: '2026 Prospectus', about: 'About', contact: 'Contact', progress: 'Dua and Surah Progress', recorder: 'Voice Recorder', administration: 'Academy administration' };
  const activityHref = row => `#activity/${row.kind}/${encodeURIComponent(row.id)}`;
  const roleName = roles => roles.map(role => ({ GLOBAL_ADMIN: 'Global Admin', ADMIN: 'Program Admin', SENIOR: 'Senior', TEACHER: 'Teacher', STUDENT: 'Student' })[role]).filter(Boolean).join(' · ') || 'Visitor';
  const activityPill = (href, name, roles, current = false) => `<a href="${href}"${current ? ' aria-current="page"' : ''}><span>${esc(name)}</span><small>${esc(roleName(roles))}</small></a>`;
  const coming = (name, purpose) => `<article class="card card-pad coming-card"><h3>${esc(name)}</h3><span class="tag neutral">Coming soon</span><p>${esc(purpose)}</p></article>`;
  const safeLink = url => typeof url === 'string' && (/^https:\/\//.test(url) || /^\/(?!\/)/.test(url));
  const scheduleRows = data => {
    const rows = data.signedIn ? data.personalTimetable : data.timetable;
    if (!Array.isArray(rows)) throw new Error('Your Academy timetable is temporarily unavailable. Please try again.');
    return rows;
  };
  const originalActivities = [
    { kind: 'PROGRAM', name: 'Reboot', image: '/academy/learning-images/reboot.jpeg' },
    { kind: 'PROGRAM', name: 'Aalimiya', image: '/ummabbadacademy.png' },
    { kind: 'PROGRAM', name: 'Ma’had Arwa · Hifz', image: '/academy/course-images/HIFZ-CHALLENGES-MEMORIZING-WITH-LOVE.webp' },
    { kind: 'COURSE', name: 'Tafseer & Tadabbur', image: '/academy/learning-images/tafseer.jpeg' },
    { kind: 'COURSE', name: 'Classical & Conversational Arabic', image: '/academy/learning-images/arabic.png' },
    { kind: 'COURSE', name: 'Mothers of the Ummah', image: '/academy/learning-images/mothers.jpg' }
  ];

  function renderCatalogue() {
    $('learning-catalogue').innerHTML = `<ul class="learning-cards">${originalActivities.map(row => `<li class="card activity-card"><div class="activity-art"><img src="${esc(row.image)}" alt="Academy artwork for ${esc(row.name)}" loading="lazy"></div><div class="card-pad"><span class="eyebrow">${row.kind === 'PROGRAM' ? 'Program' : 'Course'}</span><h3>${esc(row.name)}</h3></div></li>`).join('')}</ul>`;
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
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
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
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
      $('schedule-message').textContent = result.warnings.join(' ');
      renderSchedule('academy-sessions', scheduleRows(result));
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
    $('academy-progress-nav').hidden = !(data.signedIn && data.student);
    $('academy-recorder-nav').hidden = !(data.signedIn && data.student);
    const activities = data.signedIn ? data.personalActivities : [];
    const courses = activities.filter(row => row.kind === 'COURSE');
    $('personal-empty').hidden = Boolean(activities.length || data.globalAdmin);
    $('personal-pills').innerHTML = activities.filter(row => row.kind === 'PROGRAM')
      .map(row => activityPill(activityHref(row), row.name, row.roles)).join('') +
      (courses.length ? activityPill('#workshops', 'Workshops', [...new Set(courses.flatMap(row => row.roles))]) : '') +
      (data.globalAdmin ? activityPill('#administration', 'Academy administration', ['GLOBAL_ADMIN']) : '');
    renderSubscriptions(activities);
    renderWorkshops();
    const personalSchedule = scheduleRows(data);
    $('schedule-title').textContent = data.signedIn && !data.globalAdmin ? 'My Academy timetable' : 'Academy timetable';
    $('full-timetable-title').textContent = data.signedIn && !data.globalAdmin ? 'My Academy timetable' : 'Full Academy timetable';
    const preview = upcomingItems(data.timetable);
    renderSchedule('academy-preview-sessions', preview, false, true);
    if (!preview.length) $('academy-preview-sessions').textContent = 'No upcoming published lessons in the next seven days.';
    $('preview-timetable-link').hidden = !data.signedIn;
    $('schedule-message').textContent = '';
    renderSchedule('academy-sessions', personalSchedule);
  }

  function renderSubscriptions(activities, current) {
    const view = location.hash.slice(1).split('/')[0];
    const strip = $('activity-switcher');
    if (!titles[view] || view === 'overview' || view === 'learning') {
      strip.replaceChildren();
      strip.hidden = true;
      return;
    }
    const programs = activities.filter(item => item.kind === 'PROGRAM');
    const courses = activities.filter(item => item.kind === 'COURSE');
    strip.innerHTML = programs.map(item => activityPill(activityHref(item), item.name, item.roles,
      Boolean(current && item.id === current.id && current.kind === 'PROGRAM'))).join('') +
      (courses.length ? activityPill('#workshops', 'Workshops', [...new Set(courses.flatMap(item => item.roles))],
        view === 'workshops' || current?.kind === 'COURSE') : '');
    strip.hidden = !activities.length;
  }

  function renderWorkshops() {
    const courses = state.home?.signedIn ? state.home.personalActivities.filter(row => row.kind === 'COURSE') : [];
    $('workshop-pills').innerHTML = courses.map(row => activityPill(activityHref(row), row.name, row.roles)).join('');
    $('workshops-message').textContent = courses.length ? '' : state.home?.signedIn
      ? 'No workshops are currently assigned to your account.' : 'Sign in to open your workshops.';
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
        const identity = `${row.date}:${row.kind}:${row.activityId}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      });
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  }

  function renderSchedule(id, rows, detailed = false, compact = false) {
    state.information[id] = rows.slice();
    const personal = detailed || id === 'academy-sessions' && state.home?.signedIn;
    if (!rows.length) { $(id).textContent = personal && !state.home?.globalAdmin ? 'No lessons are scheduled for you in this date range.' : 'No published lessons in this date range.'; return; }
    const now = new Date().getTime();
    const next = detailed ? rows.findIndex(row => row.status === 'SCHEDULED' && row.endsAt > now) : -1;
    if (personal) { renderPersonalWeek(id, rows, detailed, next, now); return; }
    if (compact) {
      const days = new Map();
      rows.forEach((row, index) => {
        if (!days.has(row.date)) days.set(row.date, []);
        days.get(row.date).push({ row, index });
      });
      $(id).innerHTML = `<ol class="upcoming-days">${[...days].map(([date, lessons]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items">${lessons.map(({ row, index }) => {
        const label = esc(row.activityName || row.title);
        const title = state.home?.signedIn ? `<a href="${activityHref({ kind: row.kind, id: row.activityId })}">${label}</a>` : label;
        const info = state.home?.signedIn && row.information?.length ? `<button type="button" class="information-button" data-information="${id}:${index}" aria-label="More information about ${label}">i</button>` : '';
        return `<li class="upcoming-item ${row.involvement === 'teacher' ? 'teacher' : row.involvement === 'student' ? 'student' : ''}"><div class="upcoming-name">${title}${info}</div><span class="upcoming-time">${esc(row.startTime)}–${esc(row.endTime)}</span></li>`;
      }).join('')}</ul></li>`).join('')}</ol>`;
      return;
    }
    $(id).innerHTML = `<ol class="schedule-list">${rows.map(row => `<li><time datetime="${esc(row.date)}">${esc(formatDate(row.date))}</time><div>${esc(row.startTime)}–${esc(row.endTime)}</div><div class="lesson-name">${esc(row.title)}</div></li>`).join('')}</ol>`;
  }

  function renderPersonalWeek(id, rows, detailed, next, now) {
    const timezone = state.home?.timezone || rows[0].timezone;
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const clock = instant => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
      return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
    };
    const days = new Map();
    const start = (id === 'academy-sessions' ? state.startDate : state.personalStartDate) || rows[0].date;
    for (let offset = 0; offset < 7; offset++)
      days.set(new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10), new Map());
    rows.map((original, index) => ({ original, index })).sort((a, b) => a.original.startsAt - b.original.startsAt).forEach(({ original, index }) => {
      const begins = clock(original.startsAt), ends = clock(original.endsAt);
      const row = { ...original, date: begins.date, startTime: begins.time, endTime: ends.time, endDate: ends.date };
      if (!days.has(row.date)) days.set(row.date, new Map());
      const groups = days.get(row.date);
      // Missing room information must never combine unrelated lessons.
      const key = row.meetingGroup ? `room:${row.meetingGroup}` : `lesson:${index}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ row, index });
    });
    const participation = entries => {
      const roles = [...new Set(entries.map(entry => entry.row.involvement).filter(Boolean))];
      return roles.length > 1 ? 'mixed' : roles[0] || '';
    };
    const renderGroup = entries => {
      const first = entries[0].row;
      const activities = [...new Set(entries.map(entry => entry.row.activityName))];
      const subjects = [...new Set(entries.map(entry => entry.row.subjectName || entry.row.title))];
      const label = esc(activities.join(' · '));
      const singleActivity = entries.every(entry => entry.row.kind === first.kind && entry.row.activityId === first.activityId);
      const title = !detailed && singleActivity ? `<a href="${activityHref({ kind: first.kind, id: first.activityId })}">${label}</a>` : label;
      const nextEntry = entries.find(entry => entry.index === next);
      const infoIndex = state.information[id].push({ title: activities.join(' · '), lessons: entries.map(entry => entry.row) }) - 1;
      const joinable = entries.find(({ row }) => detailed && row.status === 'SCHEDULED' && now >= row.joinAvailableAt && now < row.endsAt && safeLink(row.joinUrl));
      const join = joinable ? `<a class="button small" href="${esc(joinable.row.joinUrl)}" target="_blank" rel="noopener noreferrer">Join lesson</a>` : '';
      return `<li class="upcoming-item ${nextEntry ? 'next-lesson ' : ''}${participation(entries)}">${nextEntry ? `<span class="next-lesson-label">${nextEntry.row.startsAt <= now ? 'In progress' : 'Next lesson'}</span>` : ''}<div class="upcoming-name">${title}</div>${entries.length > 1 ? `<small>${entries.length} lessons</small>` : subjects[0] !== activities[0] ? `<small>${esc(subjects[0])}</small>` : ''}${entries.length === 1 ? `<span class="upcoming-time">${esc(first.startTime)}–${esc(first.endTime)}${first.endDate !== first.date ? ' (+1 day)' : ''}</span>` : ''}<div class="upcoming-actions"><button type="button" class="information-button" data-information="${id}:${infoIndex}" aria-label="Lesson details for ${label}">i</button>${join}</div></li>`;
    };
    $(id).innerHTML = `<ol class="upcoming-days timetable-days">${[...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, groups]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items">${groups.size ? [...groups.values()].map(renderGroup).join('') : '<li class="timetable-empty">No lessons</li>'}</ul></li>`).join('')}</ol>`;
  }

  async function loadActivity(id, refresh = false) {
    clearTimeout(state.activityTimer);
    const generation = ++state.activityGeneration;
    if (!refresh) {
      $('activity-title').textContent = 'Opening activity…';
      $('activity-role').textContent = '';
      $('activity-status').textContent = '';
      for (const target of ['activity-menu', 'activity-sessions', 'activity-coming', 'activity-curriculum', 'activity-classes']) $(target).replaceChildren();
      state.information['activity-sessions'] = [];
      $('activity-classes-section').hidden = true;
      $('activity-curriculum-section').hidden = true;
    }
    try {
      const result = await request({ id });
      if (generation !== state.activityGeneration) return;
      const row = state.activity = result.activity;
      $('activity-back-link').href = row.kind === 'COURSE' ? '#workshops' : '#overview';
      $('activity-back-link').textContent = row.kind === 'COURSE' ? '← Workshops' : '← My Academy';
      $('activity-title').textContent = row.name;
      $('activity-kind').textContent = row.kind === 'PROGRAM' ? 'Program' : 'Course';
      $('activity-role').textContent = roleName(row.roles);
      const subscriptions = result.signedIn ? result.personalActivities : [];
      renderSubscriptions(subscriptions, row);
      $('current-view').textContent = row.name;
      const activityMessage = row.unavailable ? 'This activity is temporarily unavailable. Please try again.' :
        !row.roles.length ? 'Sign in with an authorised Academy account to open protected lessons and tools.' : '';
      $('activity-status').textContent = [activityMessage, ...result.warnings].filter(Boolean).join(' ');
      const staff = row.roles.some(role => ['TEACHER', 'ADMIN', 'SENIOR', 'GLOBAL_ADMIN'].includes(role));
      const administrator = row.kind === 'PROGRAM' && row.roles.some(role => ['ADMIN', 'GLOBAL_ADMIN'].includes(role));
      const globalAdmin = row.roles.includes('GLOBAL_ADMIN');
      const resources = globalAdmin ? row.tools?.resources : '';
      const manage = globalAdmin ? row.tools?.manage : '';
      const users = globalAdmin ? row.tools?.users : '';
      const menu = [['Library', row.tools?.library], ['Mark attendance', staff && row.tools?.attendance], ['Program management', manage],
        ['User management', users], ['Timetable builder', globalAdmin && row.tools?.timetableBuilder], ['Library management', resources]];
      $('activity-menu').innerHTML = menu.filter(([, href]) => safeLink(href)).map(([label, href]) => `<a href="${esc(href)}">${label}</a>`).join('') + '<a href="/academy/open-library/">Explore the Public Library</a>';
      $('activity-timetable-title').textContent = result.globalAdmin ? 'Academy timetable' : 'My Academy timetable';
      state.personalStartDate = result.startDate;
      state.personalTimetable = result.signedIn ? scheduleRows(result) : [];
      renderSchedule('activity-sessions', state.personalTimetable, true);
      if (!state.personalTimetable.length) $('activity-sessions').textContent = result.globalAdmin
        ? 'No published lessons in this date range.' : result.signedIn
          ? 'No lessons are scheduled for you in this date range.' : 'Sign in to view your personal Academy timetable.';
      if (result.signedIn) armActivityRefresh(id);

      $('activity-classes-section').hidden = true;
      $('activity-curriculum-section').hidden = true;
      $('activity-classes').replaceChildren();
      $('activity-curriculum').replaceChildren();
      if (staff && row.classes.length) {
        $('activity-classes-section').hidden = false;
        $('activity-classes').innerHTML = row.classes.map(item => `<li>${esc(item.name)}</li>`).join('');
      }
      if (staff && row.curriculum.length) {
        $('activity-curriculum-section').hidden = false;
        $('curriculum-title').textContent = row.kind === 'PROGRAM' ? 'Subjects and Modules' : 'Course Modules';
        $('activity-curriculum').innerHTML = row.curriculum.map(item => `<div class="curriculum-subject"><h3>${esc(item.name)}</h3>${item.modules?.length ? `<ul>${item.modules.map(module => `<li>${esc(module.name)}</li>`).join('')}</ul>` : ''}</div>`).join('');
      }
      $('activity-coming').innerHTML = coming('Announcements', 'Updates for this activity.') +
        (row.kind === 'PROGRAM' ? coming('Calendar', 'Program dates and events.') : '') +
        coming('Assignments', staff ? 'Create and manage assignments for your assigned classes.' : 'Learning tasks and submissions.') +
        (staff ? coming('Make announcement', 'Announcements for your assigned classes.') +
          coming('Class preparation', 'Preparation for your assigned teaching levels and classes.') +
          coming('Progress', 'Progress for this activity.') : '') +
        (staff && !safeLink(resources) ? coming('Library management', 'Manage resources for your assigned teaching levels and classes.') : '') +
        (staff && !safeLink(row.tools?.attendance) ? coming('Mark attendance', 'Registers for your authorised classes.') : '') +
        (administrator && !safeLink(manage) ? coming('Program management', 'Manage your authorised Program.') : '') +
        (administrator && !safeLink(users) ? coming('User management', 'Manage users within your authorised Program.') : '') +
        (administrator ? coming('Calendar management', 'Manage dates and events for your authorised Program.') : '');
    } catch (error) {
      if (generation === state.activityGeneration) {
        $('activity-title').textContent = 'Activity unavailable'; $('activity-status').textContent = error.message;
        for (const target of ['activity-menu', 'activity-sessions', 'activity-coming', 'activity-curriculum', 'activity-classes']) $(target).replaceChildren();
        $('activity-classes-section').hidden = true;
        $('activity-curriculum-section').hidden = true;
        state.information['activity-sessions'] = [];
        state.personalTimetable = [];
        if (token()) armActivityRefresh(id);
      }
    }
  }

  function armActivityRefresh(id) {
    clearTimeout(state.activityTimer);
    if (document.visibilityState !== 'visible' || !location.hash.startsWith('#activity/')) return;
    const generation = state.activityGeneration, session = token(), hash = location.hash;
    const now = new Date().getTime();
    const transitions = state.personalTimetable.flatMap(row => [row.joinAvailableAt, row.startsAt, row.endsAt]).filter(time => time > now);
    const delay = Math.max(250, Math.min(60000, ...transitions.map(time => time - now)));
    state.activityTimer = setTimeout(() => {
      if (!session || token() !== session || document.visibilityState !== 'visible' || generation !== state.activityGeneration || location.hash !== hash) return;
      // Remove expired links immediately, then ask the server to recheck membership and the opening window.
      renderSchedule('activity-sessions', state.personalTimetable, true);
      void loadActivity(id, true);
    }, delay);
  }

  function route() {
    const [requested, , encodedId] = location.hash.slice(1).split('/');
    if (requested !== 'activity') { clearTimeout(state.activityTimer); state.activityGeneration++; renderSubscriptions(state.home?.signedIn ? state.home.personalActivities : []); }
    const name = requested === 'learning' ? 'overview' : titles[requested] ? requested : 'overview';
    document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === name));
    document.querySelectorAll('[data-nav]').forEach(button => {
      const current = button.dataset.nav === requested || !requested && button.dataset.nav === 'overview';
      button.classList.toggle('active', current);
      if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    $('current-view').textContent = titles[name];
    if (requested === 'learning') $('learning').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (name === 'workshops') renderWorkshops();
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
    state.personalTimetable = [];
    state.personalStartDate = '';
    clearTimeout(state.activityTimer);
    state.information = {};
    $('personal-activities').hidden = true;
    $('academy-progress-nav').hidden = true;
    $('academy-recorder-nav').hidden = true;
    for (const id of ['personal-pills', 'workshop-pills', 'academy-preview-sessions', 'academy-sessions', 'activity-switcher', 'activity-menu', 'activity-sessions', 'activity-coming', 'activity-classes', 'activity-curriculum', 'recorder-card']) $(id).replaceChildren();
    $('activity-switcher').hidden = true;
    $('schedule-title').textContent = 'Academy timetable';
    $('activity-timetable-title').textContent = 'My Academy timetable';
    $('full-timetable-title').textContent = 'Full Academy timetable';
    $('workshops-message').textContent = '';
    $('activity-back-link').href = '#overview';
    $('activity-back-link').textContent = '← My Academy';
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

  document.addEventListener('visibilitychange', () => {
    clearTimeout(state.activityTimer);
    if (document.visibilityState === 'visible' && token() && location.hash.startsWith('#activity/')) route();
  });

  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); location.hash = nav.dataset.nav; route(); }
    const info = event.target.closest('[data-information]');
    if (info) {
      const [group, index] = info.dataset.information.split(':');
      const row = state.information[group]?.[Number(index)];
      if (!row) return;
      $('lesson-information-title').textContent = row.title;
      $('lesson-information-body').innerHTML = row.lessons ? row.lessons.map(lesson => `<section class="combined-lesson"><h3>${esc(lesson.subjectName || lesson.title)}</h3><p>${esc(lesson.activityName)} · ${esc(lesson.startTime)}–${esc(lesson.endTime)}${lesson.endDate !== lesson.date ? ` · ends ${esc(formatDate(lesson.endDate))}` : ''}</p>${(lesson.information || []).map(text => `<p>${esc(text)}</p>`).join('')}</section>`).join('')
        : row.information.map(text => `<p>${esc(text)}</p>`).join('');
      $('lesson-information').showModal();
    }
  });
  $('lesson-information-close').addEventListener('click', () => $('lesson-information').close());
  for (const [id, direction, target] of [['upcoming-previous', -1, 'academy-preview-sessions'], ['upcoming-next', 1, 'academy-preview-sessions'], ['learning-previous', -1, 'learning-catalogue'], ['learning-next', 1, 'learning-catalogue'], ['personal-previous', -1, 'activity-sessions'], ['personal-next', 1, 'activity-sessions']]) $(id).addEventListener('click', () => {
    const strip = $(target);
    strip.scrollBy({ left: direction * strip.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
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

  route();
  renderCatalogue();
  void loadHome();
})();
