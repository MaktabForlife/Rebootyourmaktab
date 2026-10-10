/* Shared adapter for the existing Course editors; authority comes from the server. */
const state = { token: '', user: null };
const courseAccountToken = () => localStorage.getItem('m4l_account_token') || '';
let courseAccessGeneration = 0;

function lockCourseWorkspace(message) {
  state.user = null;
  state.token = '';
  document.getElementById('global-curriculum-screen').hidden = true;
  document.getElementById('global-curriculum-content').replaceChildren();
  document.getElementById('course-account-name').textContent = '';
  document.getElementById('course-access-message').textContent = message;
}

async function apiPost(path, input = {}, token = state.token) {
  const generation = courseAccessGeneration;
  if (!token || token !== courseAccountToken() || (path !== '/api/account/session' && !state.user)) {
    throw new Error('Sign in with an authorised Academy administrator account to manage Courses.');
  }
  const response = await fetch(`${String(window.M4L_CONFIG?.API_BASE || '').replace(/\/$/, '')}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input)
  });
  const result = await response.json();
  if (generation !== courseAccessGeneration || token !== courseAccountToken()) throw new Error('Your Academy account changed. Open this page again.');
  if (!response.ok || !result.success) {
    if ([401,403].includes(response.status)) lockCourseWorkspace('Course administration requires a current Global Admin or assigned Course Program Admin account. Return to Academy home to sign in.');
    throw Object.assign(new Error(result.error || 'The Course request could not be completed.'), result, { status: response.status });
  }
  if (path.startsWith('/api/admin/platform/global/') && !path.endsWith('/get') && !path.endsWith('/browse')) window.M4LGlobalCourseScheduler?.invalidate();
  return result;
}

window.showScreen = id => id === 'global-curriculum-screen' && Boolean(state.user);

async function openCourseWorkspace() {
  const generation = ++courseAccessGeneration, token = courseAccountToken();
  lockCourseWorkspace('Checking your Academy account…');
  const retry = document.getElementById('course-access-retry');
  retry.hidden = true;
  if (!token) { lockCourseWorkspace('Sign in with an authorised Academy administrator account, then open Course administration.'); return; }
  try {
    const session = await apiPost('/api/account/session', {}, token);
    if (generation !== courseAccessGeneration) return;
    const globalAdmin=session.contexts?.some(context => context.scope === 'PLATFORM' && context.role === 'GLOBAL_ADMIN');
    if (!globalAdmin && !session.courseManagement) {
      lockCourseWorkspace('Course administration is available to Global Admins and assigned Course Program Admins.'); return;
    }
    state.token = token;
    state.user = { type: 'account', role: globalAdmin?'GLOBAL_ADMIN':'PROGRAM_ADMIN', platformrole: globalAdmin?'GLOBAL_ADMIN':'' };
    const back=document.getElementById('course-management-back');
    back.textContent=globalAdmin?'← Academy administration':'← My Courses';
    back.href=globalAdmin?'/academy/#administration':'/academy/#workshops';
    document.getElementById('course-account-name').textContent = session.account?.displayName || '';
    document.getElementById('course-access-message').textContent = '';
    document.getElementById('global-curriculum-screen').hidden = false;
    window.M4LGlobalCurriculum.invalidate();
    window.M4LGlobalCourseScheduler.invalidate();
    await window.M4LGlobalCurriculum.show();
    if (generation !== courseAccessGeneration || !state.user) return;
    if (new URLSearchParams(location.search).get('view') === 'scheduling') {
      document.getElementById('global-curriculum-title').textContent = 'Course scheduling';
      await window.M4LGlobalCourseScheduler.show();
    }
  } catch (error) {
    if (generation !== courseAccessGeneration) return;
    lockCourseWorkspace(error.message);
    retry.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('course-access-retry').addEventListener('click', () => { void openCourseWorkspace(); });
  document.addEventListener('click', event => {
    const scheduling = event.target?.closest?.('#global-curriculum-screen [data-gcm-course-action="show"]');
    const refresh = event.target?.closest?.('#global-curriculum-screen [data-gcm-action="reload"]');
    // The scheduler's existing capture handler reviews unsaved scheduling
    // changes first. Keep its refresh in scheduling rather than the other editor.
    if (refresh && document.getElementById('global-curriculum-title').textContent === 'Course scheduling') {
      event.preventDefault(); event.stopImmediatePropagation();
      void window.M4LGlobalCourseScheduler.load(true); return;
    }
    if (!window.M4LGlobalCurriculum.hasUnsavedChanges()) return;
    if (scheduling || (refresh && !window.confirm('Discard unsaved Course and Module changes and refresh?'))) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (scheduling) document.getElementById('global-curriculum-message').textContent = 'Save your Course and Module changes, or use Refresh to discard them, before opening Course scheduling.';
    }
  }, true);
  document.addEventListener('click', event => {
    const target = event.target?.closest?.('#global-curriculum-screen .global-curriculum-tabs button');
    if (!target) return;
    document.getElementById('global-curriculum-title').textContent = target.dataset.gcmCourseAction === 'show' ? 'Course scheduling' : 'Course management';
  });
  void openCourseWorkspace();
});

function courseSessionChanged() {
  if (courseAccountToken() === state.token && state.user) return;
  ++courseAccessGeneration;
  lockCourseWorkspace('Your Academy account changed. Return to Academy home and open Course administration again.');
}
window.addEventListener('storage', event => { if (event.key === 'm4l_account_token' || event.key === null) courseSessionChanged(); });
window.addEventListener('m4l-academy-session', courseSessionChanged);
window.addEventListener('pageshow', event => { if (event.persisted) { courseSessionChanged(); if (state.user) void openCourseWorkspace(); } });
window.addEventListener('beforeunload', event => {
  if (window.M4LGlobalCurriculum?.hasUnsavedChanges() || window.M4LGlobalCourseScheduler?.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
});
