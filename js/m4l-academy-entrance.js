(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const state = { home: null, activity: null, personalTimetable: [], scheduleTimetable: [], personalStartDate: '', activityTimer: null, generation: 0, scheduleGeneration: 0, activityGeneration: 0, information: {}, startDate: '', courseCatalogue: null, courseCatalogueAt: 0, coursePending: null, courseGeneration: 0 };
  const pageCache = { epoch: 0, snapshot: null, pending: new Map() };
  const PAGE_CACHE_MS = 60000;
  const titles = { overview: 'Academy home', timetable: 'Academy timetable', learning: 'Programs and Courses', workshops: 'Courses', activity: 'Activity',
    prospectus: '2026 Prospectus', about: 'About', contact: 'Contact', progress: 'Dua and Surah Progress', recorder: 'Voice Recorder', administration: 'Academy administration' };
  const activityHref = row => `#activity/${row.kind}/${encodeURIComponent(row.id)}`;
  const staffRoles = roles => roles.some(role => ['TEACHER', 'PROGRAM_ADMIN', 'ADMIN', 'SENIOR', 'GLOBAL_ADMIN'].includes(role));
  const roleName = roles => roles.map(role => ({ GLOBAL_ADMIN: 'Global Admin', PROGRAM_ADMIN: 'Program Admin', ADMIN: 'Program Admin', SENIOR: 'Senior', TEACHER: 'Teacher', STUDENT: 'Student' })[role]).filter(Boolean).join(' · ') || 'None';
  const activityPill = (href, name, roles, current = false) => `<a href="${href}"${current ? ' aria-current="page"' : ''}><span>${esc(name)}</span><small>${esc(roleName(roles))}</small></a>`;
  const coming = (name, purpose, id = '') => `<article${id ? ` id="${esc(id)}"` : ''} class="card card-pad coming-card"><h3>${esc(name)}</h3><span class="tag neutral">Coming soon</span><p>${esc(purpose)}</p></article>`;
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
    const session = token(), epoch = pageCache.epoch, key = JSON.stringify([session, body]);
    if (pageCache.pending.has(key)) return pageCache.pending.get(key);
    const pending = (async () => {
      const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/entrance`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: JSON.stringify(body) });
      const result = await response.json();
      if (token() !== session || pageCache.epoch !== epoch) throw new Error('The Academy account has changed.');
      if (!response.ok || !result.success) {
        pageCache.snapshot = null;
        if (response.status === 401) window.dispatchEvent(new Event('m4l-academy-session-ended'));
        throw new Error(result.error || 'Academy information is temporarily unavailable.');
      }
      return result;
    })();
    pageCache.pending.set(key, pending);
    try { return await pending; }
    catch (error) {
      if (pageCache.epoch === epoch && token() === session) pageCache.snapshot = null;
      throw error;
    }
    finally { if (pageCache.pending.get(key) === pending) pageCache.pending.delete(key); }
  }

  function rememberPages(result) {
    pageCache.snapshot = result.signedIn && Array.isArray(result.activityPages) && !result.warnings.length
      ? { session: token(), at: new Date().getTime(), result } : null;
  }

  function cachedActivity(id) {
    const snapshot = pageCache.snapshot, now = new Date().getTime();
    if (!snapshot || snapshot.session !== token() || now < snapshot.at || now - snapshot.at >= PAGE_CACHE_MS) return null;
    const result = snapshot.result;
    const clock = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: result.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
    if (result.startDate !== `${clock.year}-${clock.month}-${clock.day}` || result.personalTimetable.some(row =>
      [row.joinAvailableAt, row.startsAt, row.endsAt].some(time => time > snapshot.at && time <= now))) return null;
    const activity = result.activityPages.find(row => row.id === id && !row.unavailable);
    return activity ? { ...result, activity } : null;
  }

  async function loadHome() {
    const generation = ++state.generation;
    $('entrance-message').textContent = 'Loading Academy information…';
    $('entrance-retry').hidden = true;
    try {
      const result = await request({});
      if (generation !== state.generation) return;
      rememberPages(result);
      state.home = result;
      state.startDate = result.startDate;
      state.scheduleTimetable = scheduleRows(result);
      $('schedule-date').value = result.startDate;
      $('schedule-range').textContent = `${formatDate(result.startDate)} – ${formatDate(result.endDate)}`;
      renderCalendar(result);
      $('entrance-message').textContent = result.warnings.join(' ');
      $('entrance-retry').hidden = !result.warnings.length;
      renderHome();
      route();
    } catch (error) {
      if (generation !== state.generation) return;
      $('entrance-message').textContent = error.message;
      $('entrance-retry').hidden = false;
      if (!state.home || state.home.signedIn) {
        clearTimeout(state.activityTimer);
        state.scheduleTimetable = [];
        state.information['academy-preview-sessions'] = [];
        state.information['academy-sessions'] = [];
        if (state.home) state.home = { ...state.home, personalTimetable: [] };
        $('academy-preview-sessions').replaceChildren();
        $('academy-sessions').replaceChildren();
        $('workshops-sessions').replaceChildren();
        state.information['workshops-sessions'] = [];
        $('lesson-information').close();
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
      renderCalendar(result);
      $('schedule-message').textContent = result.warnings.join(' ');
      renderSchedule('academy-sessions', scheduleRows(result));
      state.scheduleTimetable = scheduleRows(result);
      armScheduleRefresh();
    } catch (error) {
      if (generation !== state.scheduleGeneration) return;
      $('schedule-message').textContent = error.message;
      $('academy-sessions').replaceChildren();
      renderCalendar({});
      state.information['academy-sessions'] = [];
      state.scheduleTimetable = [];
    }
  }

  function renderCalendar(data) {
    const target = $('academy-calendar-context');
    if (!target) return;
    const events = Array.isArray(data.calendarEvents) ? data.calendarEvents : [];
    target.hidden = !events.length;
    target.innerHTML = events.map(event => {
      const dates = event.startDate === event.endDate ? formatDate(event.startDate) : `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;
      return `<li><strong>${esc(event.description)}</strong> · ${esc(dates)}${event.islamicDate ? ` · ${esc(event.islamicDate)}` : ''}${event.teachingImpact === 'NO_TEACHING' ? ' · No teaching' : ''}</li>`;
    }).join('');
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
      (data.signedIn ? activityPill('#workshops', 'Courses', data.globalAdmin ? ['GLOBAL_ADMIN', 'PROGRAM_ADMIN'] : [...new Set(courses.flatMap(row => row.roles))]) : '') +
      (data.globalAdmin ? activityPill('#administration', 'Academy administration', ['GLOBAL_ADMIN']) : '');
    renderSubscriptions(activities);
    renderWorkshops();
    const personalSchedule = scheduleRows(data);
    $('schedule-title').textContent = data.signedIn && !data.globalAdmin ? 'My Academy timetable' : 'Academy timetable';
    $('full-timetable-title').textContent = data.signedIn && !data.globalAdmin ? 'My Academy timetable' : 'Full Academy timetable';
    const preview = data.signedIn ? personalSchedule : upcomingItems(data.timetable);
    renderSchedule('academy-preview-sessions', preview, false, true);
    if (!preview.length) $('academy-preview-sessions').textContent = data.signedIn
      ? 'No lessons are scheduled for you in this date range.' : 'No upcoming published lessons in the next seven days.';
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
      (state.home?.signedIn ? activityPill('#workshops', 'Courses', state.home.globalAdmin ? ['GLOBAL_ADMIN', 'PROGRAM_ADMIN'] : [...new Set(courses.flatMap(item => item.roles))],
        view === 'workshops' || current?.kind === 'COURSE') : '');
    strip.hidden = !state.home?.signedIn;
  }

  function adminMenu(links, tools = '') {
    const available = links.filter(([, href]) => safeLink(href));
    return available.length || tools ? `<details class="academy-admin-menu"><summary>Admin <span aria-hidden="true">⌄</span></summary><nav aria-label="Management">${available.map(([name, href]) => `<a href="${esc(href)}">${esc(name)}</a>`).join('')}${tools}</nav></details>` : '';
  }

  function pageTools(prefix, row) {
    const staff = staffRoles(row.roles);
    return (staff && safeLink(row.tools?.attendance) ? `<a href="${esc(row.tools.attendance)}">Attendance</a>` : '') +
      `<a href="#workshops">Courses</a><button type="button" data-activity-panel="${prefix}-progress">Progress</button>` +
      (staff ? `<button type="button" data-activity-panel="${prefix}-preparation">Lesson prep</button>` : '') +
      `<button type="button" data-activity-panel="${prefix}-calendar">Calendar</button><button type="button" data-activity-panel="${prefix}-announcements">Announcements</button>`;
  }

  function renderWorkshops() {
    const signedIn = state.home?.signedIn, activities = signedIn ? state.home.personalActivities : [];
    const administered = activities.filter(a => a.kind === 'COURSE' && a.roles.includes('PROGRAM_ADMIN'));
    const admin = Boolean(state.home?.globalAdmin || administered.length);
    const roles = state.home?.globalAdmin ? ['GLOBAL_ADMIN', 'PROGRAM_ADMIN'] : [...new Set(activities.filter(a => a.kind === 'COURSE').flatMap(a => a.roles))];
    $('workshop-management').innerHTML = adminMenu([
      ['Courses', admin && '/academy/courses/manage/'],
      ['Users', state.home?.globalAdmin && '/users/'],
      ['Library', state.home?.globalAdmin && '/academy/library/manage/']
    ], signedIn && staffRoles(roles) ? pageTools('workshops', {roles, tools:{}}).replace('<a href="#workshops">Courses</a>', '') : '');
    $('workshop-management').hidden = !$('workshop-management').innerHTML;
    $('workshop-tools').innerHTML = signedIn && !staffRoles(roles) ? pageTools('workshops', {roles, tools:{}}).replace('<a href="#workshops">Courses</a>', '') : '';
    $('workshops-panels').innerHTML = signedIn ? activityPanels('workshops', roles, state.home.calendarEvents) : '';
    $('workshops-message').textContent = signedIn ? '' : 'Sign in to open your Courses.';
    $('workshops-timetable-title').textContent = state.home?.globalAdmin ? 'Academy timetable' : 'My Academy timetable';
    renderSchedule('workshops-sessions', signedIn ? scheduleRows(state.home) : [], true);
    renderCourseList();
    if (signedIn && location.hash === '#workshops' && (!state.courseCatalogue || Date.now() - state.courseCatalogueAt >= PAGE_CACHE_MS)) void loadCourses();
  }

  async function loadCourses() {
    if (state.coursePending) return state.coursePending;
    const session = token(), generation = ++state.courseGeneration;
    if (!session) return;
    $('course-list-message').textContent = 'Loading Courses…';
    $('course-list-retry').hidden = true;
    const pending = (async () => {
      try {
        const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/courses/catalogue`, {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${session}`}, body:'{}'});
        const result = await response.json();
        if (session !== token() || generation !== state.courseGeneration) return;
        if (!response.ok || !result.success || !Array.isArray(result.courses)) throw new Error(result.error || 'Courses are temporarily unavailable.');
        const first = !state.courseCatalogue;
        state.courseCatalogue = result;
        state.courseCatalogueAt = Date.now();
        if (first && result.canViewAll) $('course-list-scope').value = 'ALL';
        renderCourseList();
      } catch (error) {
        if (session !== token() || generation !== state.courseGeneration) return;
        state.courseCatalogue = null;
        $('workshop-pills').replaceChildren();
        $('course-list-message').textContent = error.message;
        $('course-list-retry').hidden = false;
      } finally { if (state.coursePending === pending) state.coursePending = null; }
    })();
    state.coursePending = pending;
    return pending;
  }

  function renderCourseList() {
    const data = state.courseCatalogue;
    $('course-list-scope-wrap').hidden = !data?.canViewAll;
    if (!state.home?.signedIn || !data) { $('workshop-pills').replaceChildren(); return; }
    const all = data.canViewAll && $('course-list-scope').value === 'ALL';
    const query = $('course-list-search').value.trim().toLocaleLowerCase(), stage = $('course-list-stage').value;
    const rows = data.courses.filter(row => (all || row.personal) && (stage === 'ALL' || row.stage === stage) && (!query || row.name.toLocaleLowerCase().includes(query)));
    const stages = {PUBLISHED:'Scheduled',ACTIVE:'Active',COMPLETE:'Complete',ARCHIVED:'Archived',DRAFT:'Draft',CANCELLED:'Cancelled'};
    $('course-list-title').textContent = all ? 'All Courses' : 'My Courses';
    $('course-list-message').textContent = rows.length ? `${rows.length} ${rows.length === 1 ? 'Course' : 'Courses'}` : 'No Courses match this view.';
    $('workshop-pills').innerHTML = rows.map(row => {
      const name = row.canOpenActivity ? `<a class="course-list-name" href="${activityHref({kind:'COURSE',id:row.id})}">${esc(row.name)}</a>` : `<strong class="course-list-name">${esc(row.name)}</strong>`;
      const dates = row.startDate ? `${formatDate(row.startDate)}${row.endDate && row.endDate !== row.startDate ? ` – ${formatDate(row.endDate)}` : ''}` : 'Dates to be confirmed';
      return `<article class="course-list-row">${name}<span class="course-stage">${esc(stages[row.stage] || row.stage)}</span><span class="course-list-dates">${esc(dates)}</span><div class="course-list-actions"><button type="button" disabled title="${esc(row.mediaMessage)}">Media${['COMPLETE','ARCHIVED'].includes(row.stage) ? ' · coming soon' : ' · after completion'}</button>${row.canManage ? `<a href="/academy/courses/manage/?course=${encodeURIComponent(row.id)}${row.runId ? `&amp;run=${encodeURIComponent(row.runId)}` : ''}">Manage</a>` : ''}</div></article>`;
    }).join('');
  }

  function activityPanels(prefix, roles, calendar) {
    const staff = staffRoles(roles);
    const events = (calendar || []).map(event => `<li><strong>${esc(event.description)}</strong> · ${esc(formatDate(event.startDate))}${event.endDate !== event.startDate ? ` – ${esc(formatDate(event.endDate))}` : ''}${event.teachingImpact === 'NO_TEACHING' ? ' · No teaching' : ''}</li>`).join('');
    return coming('Announcements', 'Updates for this learning area will appear here.', prefix + '-announcements') +
      `<article id="${prefix}-calendar" class="card card-pad"><h3>Calendar</h3>${events ? `<ul class="activity-calendar-list">${events}</ul>` : '<p class="muted">No Academy events in this week.</p>'}</article>` +
      coming('Progress', 'Learning progress for this learning area is coming soon.', prefix + '-progress') +
      (staff ? coming('Lesson prep', 'Preparation for your assigned lessons is coming soon.', prefix + '-preparation') : '');
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

  function previewTime(value) {
    const clock = String(value).slice(0, 5);
    return `<time class="preview-clock" datetime="${esc(value)}" aria-label="${esc(clock)}"><span>${esc(clock)}</span></time>`;
  }

  function summarizeLesson(row) {
    if (typeof row.summarize === 'boolean') return row.summarize;
    // Retain the same presentation during a staggered frontend/backend release.
    return Boolean(state.home?.globalAdmin || state.home?.personalActivities.some(activity =>
      row.kind === activity.kind && activity.id === row.activityId &&
      activity.roles.some(role => ['PROGRAM_ADMIN', 'ADMIN'].includes(role))));
  }

  function renderSchedule(id, rows, detailed = false, compact = false) {
    state.information[id] = rows.slice();
    const personal = detailed || state.home?.signedIn;
    if (!rows.length) { $(id).textContent = personal && !state.home?.globalAdmin ? 'No lessons are scheduled for you in this date range.' : 'No published lessons in this date range.'; return; }
    const now = new Date().getTime();
    const next = personal ? rows.findIndex(row => row.status === 'SCHEDULED' && row.endsAt > now) : -1;
    if (personal) { renderPersonalWeek(id, rows, detailed, next, now); return; }
    if (compact || !personal) {
      const days = new Map();
      rows.forEach(row => {
        if (!days.has(row.date)) days.set(row.date, []);
        days.get(row.date).push(row);
      });
      $(id).innerHTML = `<ol class="upcoming-days preview-days">${[...days].map(([date, lessons]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items">${lessons.map(row => {
        const label = esc(row.activityName || row.title);
        return `<li class="preview-pill">${previewTime(row.startTime)}<span class="preview-name" title="${label}">${label}</span></li>`;
      }).join('')}</ul></li>`).join('')}</ol>`;
      return;
    }
    $(id).innerHTML = `<ol class="schedule-list">${rows.map(row => `<li><time datetime="${esc(row.date)}">${esc(formatDate(row.date))}</time><div>${esc(row.startTime)}–${esc(row.endTime)}</div><div class="lesson-name">${esc(row.title)}</div></li>`).join('')}</ol>`;
  }

  function renderPersonalWeek(id, rows, detailed, next, now) {
    const scrollLeft = $(id).scrollLeft || 0;
    const timezone = state.home?.timezone || rows[0].timezone;
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const clock = instant => {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
      return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
    };
    const days = new Map();
    const start = (id === 'academy-sessions' ? state.startDate : ['academy-preview-sessions', 'workshops-sessions'].includes(id) ? state.home?.startDate : state.personalStartDate) || rows[0].date;
    for (let offset = 0; offset < 7; offset++)
      days.set(new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10), new Map());
    rows.map((original, index) => ({ original, index })).sort((a, b) => a.original.startsAt - b.original.startsAt).forEach(({ original, index }) => {
      const begins = clock(original.startsAt), ends = clock(original.endsAt);
      const row = { ...original, date: begins.date, startTime: begins.time, endTime: ends.time, endDate: ends.date };
      if (!days.has(row.date)) days.set(row.date, new Map());
      const groups = days.get(row.date);
      // Missing room information must never combine unrelated lessons.
      const key = summarizeLesson(row) && row.meetingGroup ? `room:${row.meetingGroup}` : `lesson:${index}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ row, index });
    });
    const participation = entries => {
      const roles = [...new Set(entries.map(entry => entry.row.involvement).filter(Boolean))];
      return roles.length > 1 ? 'mixed' : roles[0] || '';
    };
    const renderGroup = entries => {
      const first = entries[0].row;
      const summary = summarizeLesson(first);
      const activities = [...new Set(entries.map(entry => entry.row.activityName))];
      const label = activities.join(' · ');
      const lessonTitle = first.moduleName || first.subjectName || first.title || first.activityName;
      const nextEntry = entries.find(entry => entry.index === next);
      const infoIndex = state.information[id].push({ title: label, lessons: entries.map(entry => entry.row) }) - 1;
      const joinable = entries.find(({ row }) => row.status === 'SCHEDULED' && now >= row.joinAvailableAt && now < row.endsAt && safeLink(row.joinUrl));
      const join = joinable ? `<a class="timetable-join" href="${esc(joinable.row.joinUrl)}" target="_blank" rel="noopener noreferrer">Join lesson</a>` : '';
      const status = nextEntry ? nextEntry.row.startsAt <= now ? 'In progress' : 'Next lesson' : '';
      const subtitle = summary && entries.length > 1 ? `${entries.length} lessons` : lessonTitle !== label ? lessonTitle : '';
      return `<li class="preview-pill timetable-pill ${nextEntry ? 'next-lesson ' : ''}${participation(entries)}${joinable ? ' join-open' : ''}"><button type="button" class="timetable-pill-details" data-information="${id}:${infoIndex}" aria-label="${esc(label)}${subtitle ? ' · ' + esc(subtitle) : ''}, ${esc(first.startTime)}–${esc(first.endTime)}${status ? ', ' + status : ''}. View lesson details">${previewTime(first.startTime)}<span class="timetable-pill-copy"><strong class="preview-name">${esc(label)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}${status ? `<small class="timetable-pill-status">${status}</small>` : ''}</span></button>${join}</li>`;
    };
    $(id).innerHTML = `<ol class="upcoming-days preview-days timetable-days">${[...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, groups]) => `<li class="upcoming-day"><time datetime="${esc(date)}">${esc(formatDate(date))}</time><ul class="upcoming-items">${groups.size ? [...groups.values()].map(renderGroup).join('') : '<li class="timetable-empty">No lessons</li>'}</ul></li>`).join('')}</ol>`;
    $(id).scrollLeft = scrollLeft;
  }

  async function loadActivity(id, refresh = false) {
    clearTimeout(state.activityTimer);
    const generation = ++state.activityGeneration;
    $('personal-refresh').disabled = true;
    const cached = !refresh && cachedActivity(id);
    const scrollLeft = $('activity-sessions').scrollLeft || 0;
    if (!refresh && !cached) {
      $('activity-title').textContent = 'Opening activity…';
      $('activity-role').textContent = '';
      $('activity-status').textContent = '';
      for (const target of ['activity-menu', 'activity-admin', 'activity-sessions', 'activity-coming', 'activity-curriculum', 'activity-classes']) $(target).replaceChildren();
      state.information['activity-sessions'] = [];
      $('activity-classes-section').hidden = true;
      $('activity-curriculum-section').hidden = true;
    }
    try {
      const result = cached || await request({ id });
      if (generation !== state.activityGeneration) return;
      if (!cached) rememberPages(result);
      const row = state.activity = result.activity;
      $('personal-refresh').hidden = !result.signedIn;
      $('activity-back-link').href = row.kind === 'COURSE' ? '#workshops' : '#overview';
      $('activity-back-link').textContent = row.kind === 'COURSE' ? '← Courses' : '← My Academy';
      $('activity-title').textContent = row.name;
      $('activity-kind').textContent = row.kind === 'PROGRAM' ? 'Program' : 'Course';
      $('activity-role').textContent = roleName(row.roles);
      const subscriptions = result.signedIn ? result.personalActivities : [];
      renderSubscriptions(subscriptions, row);
      $('current-view').textContent = row.name;
      const activityMessage = row.unavailable ? 'This activity is temporarily unavailable. Please try again.' :
        !row.roles.length ? 'Sign in with an authorised Academy account to open protected lessons and tools.' : '';
      $('activity-status').textContent = [activityMessage, ...result.warnings].filter(Boolean).join(' ');
      const staff = staffRoles(row.roles);
      const administrator = row.roles.some(role => ['PROGRAM_ADMIN', 'ADMIN', 'GLOBAL_ADMIN'].includes(role));
      const globalAdmin = row.roles.includes('GLOBAL_ADMIN');
      $('activity-admin').innerHTML = adminMenu([
        [row.kind === 'PROGRAM' ? 'Program' : 'Course', administrator && (row.kind === 'PROGRAM' ? row.tools?.manage : '/academy/courses/manage/?course=' + encodeURIComponent(row.id))],
        ['Users', globalAdmin && '/users/'],
        ['Courses', (globalAdmin || subscriptions.some(a => a.kind === 'COURSE' && a.roles.includes('PROGRAM_ADMIN'))) && '/academy/courses/manage/'],
        ['Timetable', globalAdmin && row.tools?.timetableBuilder],
        ['Library', globalAdmin && (row.kind === 'PROGRAM' ? row.tools?.resources : '/academy/library/manage/')]
      ], staff ? pageTools('activity', row).replace('<a href="#workshops">Courses</a>', '') : '');
      $('activity-menu').innerHTML = row.roles.length && !staff ? pageTools('activity', row) : '';
      $('activity-timetable-title').textContent = result.globalAdmin ? 'Academy timetable' : 'My Academy timetable';
      state.personalStartDate = result.startDate;
      state.personalTimetable = result.signedIn ? scheduleRows(result) : [];
      renderSchedule('activity-sessions', state.personalTimetable, true);
      $('activity-sessions').scrollLeft = scrollLeft;
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
      $('activity-coming').innerHTML = row.roles.length ? activityPanels('activity', row.roles, result.calendarEvents) : '';
    } catch (error) {
      if (generation === state.activityGeneration) {
        pageCache.snapshot = null;
        $('activity-title').textContent = 'Activity unavailable'; $('activity-status').textContent = error.message;
        for (const target of ['activity-menu', 'activity-admin', 'activity-sessions', 'activity-coming', 'activity-curriculum', 'activity-classes']) $(target).replaceChildren();
        $('activity-classes-section').hidden = true;
        $('activity-curriculum-section').hidden = true;
        state.information['activity-sessions'] = [];
        state.personalTimetable = [];
        if (token()) armActivityRefresh(id);
      }
    } finally {
      if (generation === state.activityGeneration) $('personal-refresh').disabled = false;
    }
  }

  function armActivityRefresh(id) {
    if (!location.hash.startsWith('#activity/')) return;
    armTimetableRefresh(state.personalTimetable, () => loadActivity(id, true), () => {
      renderSchedule('activity-sessions', state.personalTimetable, true);
    });
  }

  function armScheduleRefresh() {
    const view = location.hash.slice(1).split('/')[0];
    if (view === 'timetable') {
      armTimetableRefresh(state.scheduleTimetable, () => loadSchedule(), () => {
        renderSchedule('academy-sessions', state.scheduleTimetable);
      });
    } else if (view === 'workshops') {
      armTimetableRefresh(state.home?.signedIn ? scheduleRows(state.home) : [], () => loadHome(), () => renderSchedule('workshops-sessions', state.home?.signedIn ? scheduleRows(state.home) : [], true));
    } else if (!view || ['overview', 'learning'].includes(view)) {
      const rows = state.home?.signedIn ? scheduleRows(state.home) : [];
      armTimetableRefresh(rows, () => loadHome(), () => {
        renderSchedule('academy-preview-sessions', rows, false, true);
        renderSchedule('academy-sessions', rows);
      });
    }
  }

  function armTimetableRefresh(rows, refresh, render) {
    clearTimeout(state.activityTimer);
    if (document.visibilityState !== 'visible' || !token() || !rows.length) return;
    const generation = state.activityGeneration, epoch = pageCache.epoch, session = token(), hash = location.hash;
    const now = new Date().getTime();
    const transitions = rows.flatMap(row => [row.joinAvailableAt, row.startsAt, row.endsAt]).filter(time => time > now);
    const delay = Math.max(250, Math.min(60000, ...transitions.map(time => time - now)));
    state.activityTimer = setTimeout(() => {
      if (token() !== session || epoch !== pageCache.epoch || document.visibilityState !== 'visible' || generation !== state.activityGeneration || location.hash !== hash) return;
      // Remove expired links immediately, then ask the server to recheck membership and the opening window.
      render();
      void refresh();
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
    if (name === 'activity' && encodedId && state.home) { try { void loadActivity(decodeURIComponent(encodedId)); } catch { $('activity-status').textContent = 'This activity link is invalid.'; } }
    if (name === 'recorder') $('recorder-card').innerHTML = state.home?.student ? '<p>Select an existing lesson image, record your voice, then preview and share your video.</p><a class="button" href="/recorder/?academy=1">Open Voice Recorder →</a>' : '<p>Voice Recorder is available to signed-in Academy students.</p>';
    if (name === 'administration') renderAdministration();
    if (requested !== 'activity') armScheduleRefresh();
  }

  function renderAdministration() {
    let view = $('administration');
    if (!view) { view = document.createElement('section'); view.id = 'administration'; view.className = 'view active'; document.querySelector('.container').appendChild(view); }
    view.classList.add('active');
    view.innerHTML = '<div class="page-heading"><h1>Academy administration</h1></div>' + (state.home?.globalAdmin ? '<div class="activity-pills"><a href="/users/">User profiles</a><a href="/programs/">Manage Programs</a><a href="/academy/courses/manage/">Course management</a><a href="/academy/courses/manage/?view=scheduling">Course scheduling</a><a href="/academy/library/manage/">Manage Library</a></div>' : '<p>This page requires an authenticated Global Admin account.</p>');
  }

  function clearPersonal() {
    pageCache.epoch++;
    pageCache.snapshot = null;
    pageCache.pending.clear();
    state.generation++;
    state.scheduleGeneration++;
    state.activityGeneration++;
    state.home = null;
    state.activity = null;
    state.courseCatalogue = null;
    state.courseCatalogueAt = 0;
    state.courseGeneration++;
    state.coursePending = null;
    state.personalTimetable = [];
    state.scheduleTimetable = [];
    state.personalStartDate = '';
    clearTimeout(state.activityTimer);
    state.information = {};
    $('personal-activities').hidden = true;
    $('academy-progress-nav').hidden = true;
    $('academy-recorder-nav').hidden = true;
    for (const id of ['personal-pills', 'workshop-pills', 'academy-preview-sessions', 'academy-sessions', 'activity-switcher', 'activity-menu', 'activity-admin', 'workshops-sessions', 'workshops-panels', 'workshop-management', 'workshop-tools', 'activity-sessions', 'activity-coming', 'activity-classes', 'activity-curriculum', 'recorder-card']) $(id).replaceChildren();
    $('activity-switcher').hidden = true;
    $('schedule-title').textContent = 'Academy timetable';
    $('activity-timetable-title').textContent = 'My Academy timetable';
    $('full-timetable-title').textContent = 'Full Academy timetable';
    $('workshops-message').textContent = '';
    $('course-list-message').textContent = '';
    $('course-list-search').value = '';
    $('course-list-stage').value = 'ALL';
    $('course-list-scope').value = 'MINE';
    $('course-list-scope-wrap').hidden = true;
    $('course-list-retry').hidden = true;
    $('activity-back-link').href = '#overview';
    $('activity-back-link').textContent = '← My Academy';
    $('preview-timetable-link').hidden = true;
    $('personal-refresh').hidden = true;
    $('personal-refresh').disabled = false;
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
    if (document.visibilityState === 'visible' && token()) {
      if (location.hash.startsWith('#activity/')) route();
      else if (location.hash === '#timetable') void loadSchedule();
      else if (['#overview', '#workshops', ''].includes(location.hash)) void loadHome();
    }
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.academy-admin-menu')) document.querySelectorAll('.academy-admin-menu[open]').forEach(menu => menu.open = false);
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); location.hash = nav.dataset.nav; route(); }
    const panel = event.target.closest('[data-activity-panel]');
    if (panel) $(panel.dataset.activityPanel)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
    const info = event.target.closest('[data-information]');
    if (info) {
      const [group, index] = info.dataset.information.split(':');
      const row = state.information[group]?.[Number(index)];
      if (!row) return;
      $('lesson-information-title').textContent = row.title;
      $('lesson-information-body').innerHTML = row.lessons ? row.lessons.map(lesson => `<section class="combined-lesson"><h3>${esc(lesson.subjectName || lesson.title)}</h3><p>${esc(lesson.activityName)} · ${esc(lesson.startTime)}–${esc(lesson.endTime)}${lesson.endDate !== lesson.date ? ` · ends ${esc(formatDate(lesson.endDate))}` : ''}</p>${(lesson.information || []).map(text => `<p>${esc(text)}</p>`).join('')}<p class="tiny muted">${Date.now() >= lesson.endsAt ? 'Lesson ended' : 'Joining opens 5 minutes before the lesson.'}</p></section>`).join('')
        : row.information.map(text => `<p>${esc(text)}</p>`).join('');
      $('lesson-information').showModal();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.academy-admin-menu[open]').forEach(menu => {menu.open = false; menu.querySelector('summary')?.focus();});
  });
  $('lesson-information-close').addEventListener('click', () => $('lesson-information').close());
  for (const [id, direction, target] of [['upcoming-previous', -1, 'academy-preview-sessions'], ['upcoming-next', 1, 'academy-preview-sessions'], ['learning-previous', -1, 'learning-catalogue'], ['learning-next', 1, 'learning-catalogue'], ['personal-previous', -1, 'activity-sessions'], ['personal-next', 1, 'activity-sessions'], ['workshops-previous', -1, 'workshops-sessions'], ['workshops-next', 1, 'workshops-sessions']]) $(id).addEventListener('click', () => {
    const strip = $(target);
    strip.scrollBy({ left: direction * strip.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  for (const id of ['course-list-search', 'course-list-stage', 'course-list-scope']) $(id).addEventListener('input', renderCourseList);
  $('course-list-retry').addEventListener('click', () => void loadCourses());
  $('workshops-refresh').addEventListener('click', () => { state.courseCatalogueAt = 0; void loadHome(); });
  $('entrance-retry').addEventListener('click', () => void loadHome());
  $('personal-refresh').addEventListener('click', () => { if (token() && state.activity) void loadActivity(state.activity.id, true); });
  $('schedule-date').addEventListener('change', () => { state.startDate = $('schedule-date').value; void loadSchedule(); });
  for (const [id, days] of [['schedule-previous', -7], ['schedule-next', 7]]) $(id).addEventListener('click', () => {
    if (!state.startDate) return;
    state.startDate = new Date(Date.parse(`${state.startDate}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    void loadSchedule();
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('m4l-academy-session', () => { clearPersonal(); void loadHome(); });
  window.addEventListener('storage', event => { if (event.key === 'm4l_account_token') { clearPersonal(); void loadHome(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearPersonal(); void loadHome(); } });

  route();
  renderCatalogue();
  void loadHome();
})();
