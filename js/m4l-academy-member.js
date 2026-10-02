(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const path = /^\/academy\/([^/?#]+)\/?$/.exec(window.location.pathname);
  let id = '';
  try { id = path ? decodeURIComponent(path[1]) : ''; } catch { /* Invalid path fails closed. */ }
  const token = localStorage.getItem('m4l_account_token');
  const base = String(window.M4L_CONFIG?.API_BASE || '').replace(/\/$/, '');

  function denied(message) {
    $('member-loading').hidden = true;
    $('member-denied-message').textContent = message;
    $('member-denied').hidden = false;
  }

  $('member-sign-out').addEventListener('click', () => {
    for (const key of ['m4l_account_token', 'm4l_account_context', 'm4l_account_contexts',
      'm4l_account_workspace', 'maktab_token', 'maktab_user_type']) localStorage.removeItem(key);
    window.location.assign('/academy/');
  });

  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(id) || ['library', 'member'].includes(id.toLowerCase())) {
    denied('This Academy link is not available.');
  } else if (!token || !base) {
    denied('Enter your account ID and PIN on the Academy page.');
  } else {
    void fetch(`${base}/api/account/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}'
    }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error('Your session has ended. Please sign in again.');
      if (String(result.account?.uniqueid || '').trim().toUpperCase() !== id.toUpperCase()) {
        throw new Error('This link belongs to another account. Sign in with the correct ID.');
      }
      $('member-name').textContent = result.account.displayName || 'Learner';
      $('member-maktab-link').href = `/account/${encodeURIComponent(result.account.uniqueid)}`;
      $('member-loading').hidden = true;
      $('member-home').hidden = false;
      $('member-sign-out').hidden = false;
    }).catch(error => denied(error.message || 'Please sign in again.'));
  }
})();
