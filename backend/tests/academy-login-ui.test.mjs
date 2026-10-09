import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../academy/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../js/m4l-academy-login.js', import.meta.url), 'utf8');
const redirects = readFileSync(new URL('../../_redirects', import.meta.url), 'utf8');
assert.match(html, /placeholder="Enter your account ID"/);
assert.match(html, /id="academy-home-card" hidden/);
assert.match(html, /id="academy-sign-out" type="button" hidden/);
assert.match(html, /id="academy-library-nav" href="\/academy\/open-library\/"/);
assert.doesNotMatch(html, /academy-personal-library-nav|>My Library<\/a>/);
assert.doesNotMatch(html, /Open Academy Library/);
assert.match(html, /Website V105\.4\.3\.14/);
assert.doesNotMatch(html, /ABCDEFG/);
assert.match(redirects, /^\/academy\/:uniqueid \/academy\/#overview 302$/m);

async function loadPage({ id = '', pin = '', replies = {}, storedToken = '', academyId = '' } = {}) {
  const elements = new Map();
  for (const name of ['login-preview', 'demo-username', 'demo-pin', 'demo-pin-toggle', 'login-status',
    'academy-session-loading', 'academy-session-message', 'academy-session-retry', 'academy-home-card', 'academy-account-name', 'academy-maktab-link',
    'academy-sign-out', 'academy-avatar', 'academy-library-nav']) {
    elements.set(name, {
      value: '', textContent: '', href: '', hidden: ['academy-home-card', 'academy-sign-out',
        'academy-session-loading', 'login-status'].includes(name),
      disabled: false, type: name === 'demo-pin' ? 'password' : 'text', handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute() {}, focus() {},
      querySelector() { return elements.get('submit'); }
    });
  }
  elements.get('academy-library-nav').href = '/academy/open-library/';
  elements.set('submit', { disabled: false });
  elements.get('demo-username').value = id;
  elements.get('demo-pin').value = pin;
  const storage = new Map(storedToken ? [['m4l_account_token', storedToken]] : []);
  const session = new Map(academyId ? [['m4l_academy_signed_in', academyId]] : []);
  const calls = [];
  const windowHandlers = {};
  let destination = '';
  let now = Date.parse('2026-10-09T12:00:00Z');
  class FixtureDate extends Date { static now() { return now; } }
  const context = {
    Event, Date: FixtureDate,
    window: { M4L_CONFIG: { API_BASE: 'https://test.example' }, location: { hash: '', assign(path) { destination = path; } },
      addEventListener(type, handler) { windowHandlers[type] = handler; },
      dispatchEvent(event) { windowHandlers[event.type]?.(event); } },
    document: { getElementById(name) { return elements.get(name); }, body: { classList: { add() {}, remove() {} } } },
    localStorage: {
      get length() { return storage.size; },
      key(index) { return [...storage.keys()][index] || null; },
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    sessionStorage: {
      get length() { return session.size; },
      key(index) { return [...session.keys()][index] || null; },
      getItem(key) { return session.get(key) || null; },
      setItem(key, value) { session.set(key, value); },
      removeItem(key) { session.delete(key); }
    },
    fetch: async (url, options) => {
      const path = url.slice('https://test.example'.length);
      calls.push({ path, body: JSON.parse(options.body) });
      const configuredReply = replies[path];
      const reply = Array.isArray(configuredReply) ? configuredReply.shift() : configuredReply;
      assert.ok(reply, `Unexpected request: ${path}`);
      return { ok: reply.ok !== false, status: reply.status || 200, json: async () => reply.body };
    }
  };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    elements, storage, session, calls,
    advance(milliseconds) { now += milliseconds; },
    get destination() { return destination; },
    get hash() { return context.window.location.hash; },
    async submit() { await elements.get('login-preview').handlers.submit({ preventDefault() {} }); },
    async retrySession() { elements.get('academy-session-retry').handlers.click(); await new Promise(resolve => setImmediate(resolve)); },
    signOut() { elements.get('academy-sign-out').handlers.click(); },
    storageChanged(event) { windowHandlers.storage(event); },
    async pageshow(persisted) { windowHandlers.pageshow({ persisted }); await new Promise(resolve => setImmediate(resolve)); }
  };
}

const oldMaktabSession = await loadPage();
assert.equal(oldMaktabSession.calls.length, 0, 'Visitors must not trigger an account request');
assert.equal(oldMaktabSession.elements.get('login-preview').hidden, false);
assert.equal(oldMaktabSession.elements.get('academy-library-nav').href, '/academy/open-library/');
await oldMaktabSession.submit();
assert.equal(oldMaktabSession.destination, '');
assert.equal(oldMaktabSession.calls.length, 0);

const missingPin = await loadPage({ id: 'TEST-USER', replies: {
  '/api/account/check': { body: { success: true, account: { uniqueid: 'TEST-USER', pinsetup: true } } }
} });
await missingPin.submit();
assert.equal(missingPin.destination, '');
assert.deepEqual(missingPin.calls.map(call => call.path), ['/api/account/check']);

const validLogin = await loadPage({ id: 'TEST-USER', pin: '1234', replies: {
  '/api/account/login': { body: { success: true, token: 'NEW_SESSION', account: { uniqueid: 'TEST-USER' } } }
} });
await validLogin.submit();
assert.deepEqual(validLogin.calls.map(call => call.path), ['/api/account/login']);
assert.equal(validLogin.destination, '');
assert.equal(validLogin.hash, 'overview');
assert.equal(validLogin.storage.get('m4l_account_token'), 'NEW_SESSION');
assert.equal(validLogin.session.get('m4l_academy_signed_in'), 'TEST-USER');
assert.equal(validLogin.elements.get('demo-pin').value, '');
assert.equal(validLogin.elements.get('login-preview').hidden, true);
assert.equal(validLogin.elements.get('academy-home-card').hidden, false);
assert.equal(validLogin.elements.get('academy-sign-out').hidden, false);
assert.equal(validLogin.elements.get('academy-library-nav').href, '/academy/library/');

const signedIn = await loadPage({ academyId: 'TEST-USER', storedToken: 'NEW_SESSION', replies: {
  '/api/account/session': { body: { success: true, account: { uniqueid: 'TEST-USER', displayName: 'Test Learner' } } }
} });
assert.equal(signedIn.elements.get('login-preview').hidden, true, 'Signed-in users must not see ID and PIN fields');
assert.equal(signedIn.elements.get('academy-home-card').hidden, false);
assert.equal(signedIn.elements.get('academy-sign-out').hidden, false);
assert.doesNotMatch(html, /id="academy-maktab-link"/, 'The home must not link to a legacy account screen');
assert.equal(signedIn.elements.get('academy-library-nav').href, '/academy/library/');
await signedIn.pageshow(false);
assert.equal(signedIn.calls.length, 1, 'The initial pageshow does not repeat session validation');
await signedIn.pageshow(true);
assert.equal(signedIn.calls.length, 2, 'Returning from the browser cache revalidates the account');
signedIn.signOut();
assert.equal(signedIn.storage.get('m4l_account_token'), undefined);
assert.equal(signedIn.session.get('m4l_academy_signed_in'), undefined);
assert.equal(signedIn.destination, '');
assert.equal(signedIn.hash, 'overview');
assert.equal(signedIn.elements.get('login-preview').hidden, false);
assert.equal(signedIn.elements.get('academy-home-card').hidden, true);
assert.equal(signedIn.elements.get('academy-sign-out').hidden, true);
assert.equal(signedIn.elements.get('academy-library-nav').href, '/academy/open-library/');

const otherTab = await loadPage({ academyId: 'TEST-USER', storedToken: 'NEW_SESSION', replies: {
  '/api/account/session': { body: { success: true, account: { uniqueid: 'TEST-USER' } } }
} });
otherTab.storage.delete('m4l_account_token');
otherTab.storageChanged({ key: 'm4l_account_token', newValue: null });
assert.equal(otherTab.elements.get('login-preview').hidden, false);
assert.equal(otherTab.elements.get('academy-home-card').hidden, true);
assert.equal(otherTab.elements.get('academy-library-nav').href, '/academy/open-library/');

const wrongAccount = await loadPage({ academyId: 'TEST-USER', storedToken: 'NEW_SESSION', replies: {
  '/api/account/session': { body: { success: true, account: { uniqueid: 'OTHER-USER' } } }
} });
assert.equal(wrongAccount.elements.get('login-preview').hidden, false);
assert.equal(wrongAccount.elements.get('academy-home-card').hidden, true);
assert.equal(wrongAccount.elements.get('academy-library-nav').href, '/academy/open-library/');

const temporaryOutage = await loadPage({ academyId: 'TEST-USER', storedToken: 'NEW_SESSION', replies: {
  '/api/account/session': [
    { ok: false, status: 503, body: { success: false, error: 'Central account service is not ready' } },
    { body: { success: true, account: { uniqueid: 'TEST-USER' } } }
  ]
} });
assert.equal(temporaryOutage.elements.get('login-preview').hidden, true);
assert.equal(temporaryOutage.session.get('m4l_academy_signed_in'), 'TEST-USER');
assert.equal(temporaryOutage.elements.get('academy-session-retry').hidden, false);
await temporaryOutage.retrySession();
assert.equal(temporaryOutage.elements.get('academy-home-card').hidden, false);
assert.equal(temporaryOutage.elements.get('academy-session-retry').hidden, true);

const firstSetup = await loadPage({ id: 'TEST-USER', replies: {
  '/api/account/check': { body: { success: true, account: { uniqueid: 'TEST-USER', pinsetup: false } } }
} });
await firstSetup.submit();
assert.equal(firstSetup.destination, '/account/TEST-USER?academy=1');

const newTab = await loadPage({ storedToken: 'NEW_SESSION', replies: {
  '/api/account/session': { body: { success: true, account: { uniqueid: 'TEST-USER' } } }
} });
assert.equal(newTab.elements.get('academy-home-card').hidden, false, 'A new Academy tab reuses a server-validated account session');
assert.equal(newTab.elements.get('academy-library-nav').href, '/academy/library/');
assert.equal(newTab.session.get('m4l_academy_signed_in'), 'TEST-USER');

const busyLogin = await loadPage({ id: 'TEST-USER', pin: '1234', replies: {
  '/api/account/login': [
    { ok: false, status: 503, body: { success: false, code: 'SHEETS_RATE_LIMITED',
      retryAfterMs: 60000, error: 'The account service is temporarily busy. Please wait one minute and try again.' } },
    { body: { success: true, token: 'RECOVERED_SESSION', account: { uniqueid: 'TEST-USER' } } }
  ]
} });
await busyLogin.submit();
assert.match(busyLogin.elements.get('login-status').textContent, /temporarily busy/);
assert.equal(busyLogin.storage.get('m4l_account_token'), undefined);
busyLogin.elements.get('demo-pin').value='1234';await busyLogin.submit();
assert.equal(busyLogin.calls.length,1,'The quota cooldown prevents repeated PIN submissions from reaching Sheets');
busyLogin.advance(60001);
busyLogin.elements.get('demo-pin').value='1234';await busyLogin.submit();
assert.equal(busyLogin.calls.length,2,'Sign-in can retry once the quota cooldown expires');
assert.equal(busyLogin.storage.get('m4l_account_token'),'RECOVERED_SESSION');
assert.equal(busyLogin.elements.get('academy-home-card').hidden,false);
const limitedSession = await loadPage({ academyId: 'TEST-USER', storedToken: 'NEW_SESSION', replies: {
  '/api/account/session': { ok: false, status: 429, body: { success: false, error: 'Please wait one minute and try again.' } }
} });
assert.equal(limitedSession.storage.get('m4l_account_token'),'NEW_SESSION','Temporary throttling does not sign the learner out');
assert.equal(limitedSession.elements.get('academy-session-retry').hidden,false);
assert.equal(limitedSession.elements.get('academy-home-card').hidden,true,'A failed validation does not grant access');
const quotaSession = await loadPage({ academyId: 'TEST-USER', storedToken: 'NEW_SESSION', replies: {
  '/api/account/session': [
    { ok: false, status: 503, body: { success: false, code: 'SHEETS_RATE_LIMITED', retryAfterMs: 60000,
      error: 'The account service is temporarily busy. Please wait one minute and try again.' } },
    { body: { success: true, account: { uniqueid: 'TEST-USER' } } }
  ]
} });
assert.match(quotaSession.elements.get('academy-session-message').textContent,/temporarily busy.*sign-in is saved/);
await quotaSession.retrySession();
assert.equal(quotaSession.calls.length,1,'Session retry also observes the quota cooldown');
assert.equal(quotaSession.storage.get('m4l_account_token'),'NEW_SESSION');
quotaSession.advance(60001);await quotaSession.retrySession();
assert.equal(quotaSession.calls.length,2);
assert.equal(quotaSession.elements.get('academy-home-card').hidden,false);
console.log('Academy overview sign-in, session, sign-out, quota cooldown and page restoration checks passed.');
