import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const redirects = readFileSync(new URL('../../_redirects', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../academy/member/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../../js/m4l-academy-member.js', import.meta.url), 'utf8');
assert.match(redirects, /^\/academy\/library \/academy\/library\/ 301$/m);
assert.match(redirects, /^\/academy\/:uniqueid \/academy\/member\/ 200$/m);
assert.match(html, /href="\/academy\/library\/"/);

async function view({ path = '/academy/TEST-USER', token = 'SESSION', accountId = 'TEST-USER' } = {}) {
  const elements = new Map();
  for (const id of ['member-loading', 'member-denied', 'member-denied-message', 'member-home',
    'member-name', 'member-maktab-link', 'member-sign-out']) {
    elements.set(id, { hidden: id !== 'member-loading', textContent: '', href: '', handlers: {},
      addEventListener(type, callback) { this.handlers[type] = callback; } });
  }
  let requests = 0;
  const context = {
    window: { location: { pathname: path, assign() {} }, M4L_CONFIG: { API_BASE: 'https://test.example' } },
    document: { getElementById(id) { return elements.get(id); } },
    localStorage: { getItem() { return token; }, removeItem() {} },
    fetch: async () => { requests += 1; return { ok: true, json: async () => ({
      success: true, account: { uniqueid: accountId, displayName: 'Test Learner' }
    }) }; },
    decodeURIComponent,
    encodeURIComponent
  };
  vm.runInNewContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, requests };
}

const signedIn = await view();
assert.equal(signedIn.requests, 1);
assert.equal(signedIn.elements.get('member-home').hidden, false);
assert.equal(signedIn.elements.get('member-maktab-link').href, '/account/TEST-USER');

const noToken = await view({ token: '' });
assert.equal(noToken.requests, 0);
assert.equal(noToken.elements.get('member-home').hidden, true);

const wrongAccount = await view({ accountId: 'OTHER-USER' });
assert.equal(wrongAccount.elements.get('member-home').hidden, true);
assert.equal(wrongAccount.elements.get('member-denied').hidden, false);

console.log('Academy member routing and session checks passed.');
