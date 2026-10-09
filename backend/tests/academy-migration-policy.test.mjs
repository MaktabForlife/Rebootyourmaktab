import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMigration, POLICY_FORMAT } from '../tools/academy-migration/plan.mjs';
import { SnapshotError } from '../tools/academy-migration/snapshot.mjs';
import { migrationFixture, fixtureTab, PROGRAM_IDS } from './fixtures/academy-migration-fixture.mjs';

const policy = () => ({ format: POLICY_FORMAT, environment:'local', accounts:'ACTIVE_ONLY', records:'ACTIVE_ONLY',
  archived:'EXCLUDE', websiteVisibility:'PUBLISHED_CONTENT_ONLY', activeProgramIds:[...PROGRAM_IDS], excludedCourseIds:['legacy-1'] });
test('explicit user mapping overrides misleading registry flags and excludes inactive accounts and the old workspace', async () => {
  const snapshot = migrationFixture();
  const manifest = await planMigration(snapshot, policy());
  assert.equal(manifest.summary.accountsIncluded, 199);
  assert.equal(manifest.summary.inactiveAccountsExcluded, 1);
  assert.equal(manifest.summary.programsIncluded, 2);
  assert.equal(manifest.summary.programsExcluded, 1);
  assert.equal(manifest.summary.cutoverReady, false);
  assert.equal(manifest.summary.operationalImportReady, false);
  assert.ok(manifest.programs.every(p => p.targetStatus === 'ACTIVE'));
  assert.ok(!JSON.stringify(manifest).includes('SYNTHETIC-HASH'));
  assert.equal(manifest.platformRecords.CourseRegistry.length, 2);
});
test('an active Program without publication stays active but has no public timetable', async () => {
  const snapshot = migrationFixture();
  fixtureTab(snapshot,'ProgramTimetablePublications',1).rows.length = 1;
  const state = fixtureTab(snapshot,'ProgramTimetableState',1);
  state.rows[1][state.rows[0].indexOf('CurrentPublicationID')] = '';
  const manifest = await planMigration(snapshot, policy());
  assert.equal(manifest.programs[0].targetStatus, 'ACTIVE');
  assert.equal(manifest.programs[0].currentlyPublished, false);
  assert.equal(manifest.programs[0].websiteVisibility, 'PUBLISHED_CONTENT_ONLY');
  assert.equal(manifest.summary.currentlyPublishedPrograms, 1);
});
test('inactive embedded management rows are omitted, while references to excluded records require conversion', async () => {
  const snapshot = migrationFixture(), table = fixtureTab(snapshot,'ProgramManagementState',1);
  const column = table.rows[0].indexOf('SnapshotJSON'), current = JSON.parse(table.rows[1][column]);
  current.ProgramClasses[0].Active = false;
  table.rows[1][column] = JSON.stringify(current);
  const manifest = await planMigration(snapshot, policy());
  assert.equal(manifest.programs[0].records.ProgramClasses.length, 0);
  assert.equal(manifest.summary.inactiveManagementRecordsExcluded, 1);
  assert.ok(manifest.summary.referencesToExcludedRecords > 0);
  assert.equal(manifest.summary.operationalImportReady, false);
});
test('an archived Program or an unclassified/new Program cannot be silently included', async () => {
  const snapshot = migrationFixture(), definitions = fixtureTab(snapshot,'ProgramDefinitions');
  definitions.rows[1][definitions.rows[0].indexOf('Status')] = 'ARCHIVED';
  await assert.rejects(planMigration(snapshot, policy()), e => e instanceof SnapshotError && e.code === 'ARCHIVED_PROGRAM_CANNOT_BE_ACTIVATED');
  const missing = policy(); missing.activeProgramIds.pop();
  await assert.rejects(planMigration(migrationFixture(),missing), e => e.code === 'PROGRAM_SCOPE_REQUIRES_EXPLICIT_DECISION');
  const overlap = policy(); overlap.excludedCourseIds.push(PROGRAM_IDS[0]);
  await assert.rejects(planMigration(migrationFixture(),overlap), e => e.code === 'AMBIGUOUS_PROGRAM_POLICY');
});
test('unreviewed roles do not become effective grants', async () => {
  const snapshot = migrationFixture();
  const before = await planMigration(snapshot, policy());
  const review = fixtureTab(snapshot,'AcademyAccessReview');
  review.rows[1][review.rows[0].indexOf('ReviewStatus')] = 'CONFIRMED';
  const after = await planMigration(snapshot, policy());
  assert.equal(after.summary.effectiveProgramRoleGrants-before.summary.effectiveProgramRoleGrants, 2);
  assert.equal(before.summary.pendingRoleReviews, 1);
  assert.equal(after.summary.pendingRoleReviews, 0);
});
test('publication eligibility uses each Program timezone at the capture instant', async () => {
  const snapshot = migrationFixture(); snapshot.completedAt = '2026-10-09T23:30:00.000Z';
  for (const book of [1,2]) {
    const tab = fixtureTab(snapshot,'ProgramTimetablePublications',book), column = tab.rows[0].indexOf('SnapshotJSON');
    const published = JSON.parse(tab.rows[1][column]); published.effectiveFrom = '2026-10-10';
    tab.rows[1][column] = JSON.stringify(published);
  }
  const manifest = await planMigration(snapshot, policy());
  assert.equal(manifest.summary.currentlyPublishedPrograms, 2);
  assert.ok(manifest.programs.every(p => p.publicationAsOf === '2026-10-10'));
});
