import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../academy/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../js/m4l-academy-login.js', import.meta.url), 'utf8');

assert.match(html, /placeholder="Enter your account ID"/);
assert.doesNotMatch(html, /academy-signed-in/);
assert.doesNotMatch(html, /ABCDEFG/);

async function loadPage({ id = '', pin = '', replies = {}, storedToken = 'OLD_SESSION' } = {}) {
  const elements = new Map();
  for (const name of ['login-preview', 'demo-username', 'demo-pin', 'demo-pin-toggle', 'login-status']) {
    elements.set(name, {
      value: '', hidden: false, disabled: false, type: name === 'demo-pin' ? 'password' : 'text',
      handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute() {}, focus() {},
      querySelector() { return elements.get('submit'); }
    });
  }
  elements.set('submit', { disabled: false });
  elements.get('demo-username').value = id;
  elements.get('demo-pin').value = pin;
  const storage = new Map(storedToken ? [['m4l_account_token', storedToken]] : []);
  const calls = [];
  let destination = '';
  const context = {
    window: { M4L_CONFIG: { API_BASE: 'https://test.example' }, location: { assign(path) { destination = path; } } },
    document: { getElementById(name) { return elements.get(name); } },
    localStorage: {
      get length() { return storage.size; },
      key(index) { return [...storage.keys()][index] || null; },
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); }
    },
    sessionStorage: { length: 0, key() { return null; }, removeItem() {} },
    fetch: async (url, options) => {
      const path = url.slice('https://test.example'.length);
      calls.push({ path, body: JSON.parse(options.body) });
      const reply = replies[path];
      assert.ok(reply, `Unexpected request: ${path}`);
      return { ok: reply.ok !== false, json: async () => reply.body };
    }
  };
  vm.runInNewContext(script, context);
  return {
    elements, storage, calls,
    get destination() { return destination; },
    async submit() { await elements.get('login-preview').handlers.submit({ preventDefault() {} }); }
  };
}

const page = await loadPage();
assert.equal(page.destination, '', 'A saved session must not open an account from the Academy page');
assert.equal(page.calls.length, 0, 'A saved session must not trigger account restoration');
await page.submit();
assert.equal(page.destination, '', 'An empty form must not open an account');
assert.equal(page.calls.length, 0);

const missingPin = await loadPage({ id: 'TEST-USER', replies: {
  '/api/account/check': { body: { success: true, account: { uniqueid: 'TEST-USER', pinsetup: true } } }
} });
await missingPin.submit();
assert.equal(missingPin.destination, '');
assert.deepEqual(missingPin.calls.map(call => call.path), ['/api/account/check']);

const validLogin = await loadPage({ id: 'TEST-USER', pin: '1234', replies: {
  '/api/account/check': { body: { success: true, account: { uniqueid: 'TEST-USER', pinsetup: true } } },
  '/api/account/login': { body: { success: true, token: 'NEW_SESSION', account: { uniqueid: 'TEST-USER' } } }
} });
await validLogin.submit();
assert.equal(validLogin.destination, '/account/TEST-USER');
assert.equal(validLogin.storage.get('m4l_account_token'), 'NEW_SESSION');
assert.equal(validLogin.elements.get('demo-pin').value, '');

console.log('Academy ID and PIN entry checks passed.');
