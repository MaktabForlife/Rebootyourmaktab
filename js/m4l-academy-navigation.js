(() => {
  'use strict';
  // The standalone recorder remains unchanged outside its Academy entry point.
  if (location.pathname.startsWith('/recorder/') && new URLSearchParams(location.search).get('academy') !== '1') return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const roles = values => (values || []).map(role => ({ GLOBAL_ADMIN: 'Global Admin', PROGRAM_ADMIN: 'Program Admin', ADMIN: 'Program Admin', SENIOR: 'Senior', TEACHER: 'Teacher', STUDENT: 'Student' })[role]).filter(Boolean).join(' · ');
  const token = () => localStorage.getItem('m4l_account_token') || '';
  const side = document.createElement('aside');
  side.className = 'academy-connected-sidebar';
  side.setAttribute('aria-label', 'Academy');
  side.innerHTML = `<a class="academy-connected-brand" href="/academy/#overview"><img src="/ummabbadacademy.png" alt=""><span><strong>Umm Abbad<br>Academy</strong><small>Learning together</small></span></a>
    <nav aria-label="Academy navigation"><a href="/academy/#overview">Academy home</a><a id="ac-progress" href="/academy/#progress" hidden>Dua and Surah Progress</a><a id="ac-recorder" href="/academy/#recorder" hidden>Voice Recorder</a><a id="ac-library" href="/academy/open-library/">Library</a><a href="/academy/#prospectus">2026 Prospectus</a><a href="/academy/#about">About</a><a href="/academy/#contact">Contact</a></nav>
    <div class="academy-connected-footer"><a href="https://ummabbadacademy.com" target="_blank" rel="noopener noreferrer">Original Academy site ↗</a><button id="ac-signout" type="button" hidden>Sign out</button></div>`;
  const strip = document.createElement('nav');
  strip.className = 'academy-connected-activities';
  strip.setAttribute('aria-label', 'Your subscribed Programs and Courses');
  strip.hidden = true;
  document.body.classList.add('academy-connected');
  document.body.prepend(side, strip);
  const $ = id => document.getElementById(id);
  const currentProgram = new URLSearchParams(location.search).get('program');
  const isLibrary = location.pathname.includes('/library/') || location.pathname.startsWith('/academy/open-library/');
  if (isLibrary) $('ac-library').setAttribute('aria-current', 'page');
  if (location.pathname.startsWith('/recorder/')) $('ac-recorder').setAttribute('aria-current', 'page');
  let generation = 0;

  function clear() {
    strip.replaceChildren();
    strip.hidden = true;
    $('ac-library').href = '/academy/open-library/';
    $('ac-progress').hidden = true;
    $('ac-recorder').hidden = true;
    $('ac-signout').hidden = true;
    if ($('library-for-you')) $('library-for-you').hidden = true;
  }

  async function refresh() {
    const pending = ++generation, session = token();
    clear();
    if (!session) return;
    try {
      const response = await fetch(`${window.M4L_CONFIG?.API_BASE || ''}/api/academy/entrance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` }, body: '{}'
      });
      const result = await response.json();
      if (pending !== generation || session !== token() || !response.ok || !result.success || !result.signedIn) return;
      $('ac-library').href = '/academy/library/';
      $('ac-progress').hidden = !result.student;
      $('ac-recorder').hidden = !result.student;
      $('ac-signout').hidden = false;
      if ($('library-for-you')) $('library-for-you').hidden = false;
      const activities = (result.personalActivities || []).filter(row => ['PROGRAM', 'COURSE'].includes(row.kind) && row.id && row.roles?.length);
      const programs = activities.filter(row => row.kind === 'PROGRAM');
      const courses = activities.filter(row => row.kind === 'COURSE');
      strip.innerHTML = programs.map(row => `<a href="/academy/#activity/${row.kind}/${encodeURIComponent(row.id)}"${row.kind === 'PROGRAM' && row.id === currentProgram ? ' aria-current="page"' : ''}><span>${esc(row.name)}</span><small>${esc(roles(row.roles))}</small></a>`).join('') +
        (courses.length ? `<a href="/academy/#workshops"><span>Workshops</span><small>${esc(roles([...new Set(courses.flatMap(row => row.roles))]))}</small></a>` : '');
      strip.hidden = !activities.length;
    } catch { /* Public navigation stays available while account information is unavailable. */ }
  }

  $('ac-signout').addEventListener('click', () => {
    ++generation;
    clear();
    sessionStorage.removeItem('m4l_academy_signed_in');
    for (const key of ['m4l_account_token', 'm4l_account_context', 'm4l_account_contexts', 'm4l_account_workspace', 'maktab_token', 'maktab_user_type']) localStorage.removeItem(key);
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key && ['m4l_app_cache_', 'maktab_timetable_cache_', 'm4l_academy_timetable_'].some(prefix => key.startsWith(prefix))) localStorage.removeItem(key);
    }
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith('m4l_admin_progress_dashboard_')) sessionStorage.removeItem(key);
    }
    window.dispatchEvent(new Event('m4l-academy-session'));
    location.href = '/academy/#overview';
  });
  window.addEventListener('storage', event => { if (event.key === 'm4l_account_token' || event.key === null) void refresh(); });
  window.addEventListener('m4l-academy-session', () => { void refresh(); });
  window.addEventListener('pageshow', () => { void refresh(); });
  void refresh();
})();
