import assert from 'node:assert/strict';
import { academyResourceDecision } from '../src/lib/academy-library-policy.js';

const matrix = [{ AccountID: 'learner', _subjectAccess: { SUBJECT1: true } }];
const subjects = [{ SubjectID: 'SUBJECT1', Active: true }];
const base = { key: 'PROGRAM:program:resource', source: 'PROGRAM', sourceActive: true,
  assigned: false, role: 'STUDENT', accountId: 'learner', globalMatrix: matrix, globalSubjects: subjects };
const decide = changes => academyResourceDecision({ ...base, ...changes });

assert.deepEqual(decide({}), { state: 'ASSIGNED', visible: false, open: false, forYou: false });
assert.equal(decide({ assigned: true }).forYou, true);
assert.equal(decide({ policy: { status: 'ACTIVE', state: 'ACADEMY_LEARNERS' } }).open, true);
assert.equal(decide({ policy: { status: 'ARCHIVED', state: 'ACADEMY_LEARNERS' } }).visible, false);
assert.equal(decide({ policy: { status: 'ACTIVE', state: 'STAFF_ONLY' } }).open, false);
assert.equal(decide({ role: 'TEACHER', policy: { status: 'ACTIVE', state: 'STAFF_ONLY' } }).open, true);
assert.equal(decide({ policy: { status: 'ACTIVE', state: 'SUBSCRIPTION' } }).visible, false,
  'A non-Global subscription needs an entitlement source and scope');
const subscription = { status: 'ACTIVE', state: 'SUBSCRIPTION', entitlementSource: 'GLOBAL_SUBJECT',
  subscriptionScope: 'SUBJECT1' };
assert.equal(decide({ policy: subscription }).open, true);
assert.equal(decide({ accountId: 'other', policy: subscription }).locked, true);
assert.equal(decide({ accountId: 'other', policy: subscription }).open, false);
assert.equal(decide({ globalSubjects: [{ SubjectID: 'SUBJECT1', Active: false }], policy: subscription }).visible, false);
assert.equal(decide({ source: 'GLOBAL', globalAccessModel: 'FREE', policy: null }).open, true);
assert.equal(decide({ source: 'GLOBAL', globalAccessModel: 'SUBSCRIPTION', globalSubjectId: 'SUBJECT1',
  accountId: 'other', policy: null }).locked, true);
assert.equal(decide({ source: 'GLOBAL', globalAccessModel: 'SUBSCRIPTION', globalSubjectId: 'SUBJECT1',
  role: 'TEACHER', accountId: 'other', policy: null }).open, false,
  'Keep the current Global Teacher decision pending');
assert.equal(decide({ source: 'GLOBAL', globalAccessModel: 'SUBSCRIPTION', globalSubjectId: 'SUBJECT1',
  role: 'ADMIN', accountId: 'other', policy: null }).open, true);

console.log('Academy Library access-state decisions passed.');
