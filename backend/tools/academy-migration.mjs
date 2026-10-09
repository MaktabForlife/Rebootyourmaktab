#!/usr/bin/env node
import { readFile, open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { validateSnapshot, SnapshotError, requireCondition } from './academy-migration/snapshot.mjs';
import { importSnapshot, verifyArchive } from './academy-migration/archive.mjs';
import { captureSnapshot } from './academy-migration/export.mjs';
import { planMigration } from './academy-migration/plan.mjs';

const help = `Academy migration rehearsal (Node 24+). Local/development only.
  export   --platform-id ID --credential-file FILE --output FILE [--environment development|local]
  validate --snapshot FILE
  plan     --snapshot FILE --policy FILE --output FILE
  archive-source --snapshot FILE --database FILE
  verify-archive --snapshot FILE --database FILE
Reports contain counts and diagnostic coordinates, never account names, IDs or PIN hashes.
Export is a values snapshot; live online capture is not an atomic cutover backup.`;
function argumentsFor(argv) {
  const [command, ...args] = argv;
  if (!command || command === '--help' || command === 'help') return { command: 'help', options: {} };
  const allowed = {
    export: ['platform-id', 'credential-file', 'output', 'environment'],
    validate: ['snapshot'], plan: ['snapshot', 'policy', 'output'], 'archive-source': ['snapshot', 'database'], 'verify-archive': ['snapshot', 'database']
  }[command];
  requireCondition(allowed && args.length % 2 === 0, 'INVALID_ARGUMENTS');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i].replace(/^--/, '');
    requireCondition(args[i].startsWith('--') && allowed.includes(name) && !Object.hasOwn(options, name)
      && args[i+1] && !args[i+1].startsWith('--'), 'INVALID_ARGUMENTS');
    options[name] = args[i+1];
  }
  requireCondition(allowed.filter(n => n !== 'environment').every(n => options[n]), 'MISSING_ARGUMENTS');
  return { command, options };
}
async function privateFile(path) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  return open(path, 'wx', 0o600);
}
async function main() {
  const { command, options } = argumentsFor(process.argv.slice(2));
  if (command === 'help') { console.log(help); return; }
  if (command === 'export') {
    const env = { PLATFORM_SPREADSHEET_ID: options['platform-id'],
      GOOGLE_SERVICE_ACCOUNT_JSON: await readFile(options['credential-file'], 'utf8') };
    const snapshot = await captureSnapshot(env, { environment: options.environment || 'development' });
    // Preserve a complete source capture even when data validation reports an
    // existing source defect. A partial/failed Google capture is never written.
    const output = await privateFile(options.output);
    try { await output.writeFile(JSON.stringify(snapshot)); } finally { await output.close(); }
    const report = await validateSnapshot(snapshot);
    console.log(JSON.stringify({ ...report, exported: true }, null, 2));
    return;
  }
  const snapshot = JSON.parse(await readFile(options.snapshot, 'utf8'));
  // Preflight runs before opening or creating a destination file.
  const report = await validateSnapshot(snapshot);
  if (command === 'validate') { console.log(JSON.stringify(report, null, 2)); return; }
  if (command === 'plan') {
    const policy = JSON.parse(await readFile(options.policy, 'utf8'));
    const manifest = await planMigration(snapshot, policy);
    const output = await privateFile(options.output);
    try { await output.writeFile(JSON.stringify(manifest)); } finally { await output.close(); }
    console.log(JSON.stringify({ ...manifest.summary, snapshotSha256: manifest.snapshotSha256, policySha256: manifest.policySha256 }, null, 2));
    return;
  }
  if (command === 'archive-source') {
    try { const handle = await privateFile(options.database); await handle.close(); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const db = new DatabaseSync(options.database, { readOnly: command === 'verify-archive' });
  try {
    const result = command === 'archive-source' ? await importSnapshot(db, snapshot) : await verifyArchive(db, snapshot);
    console.log(JSON.stringify(result, null, 2));
  } finally { db.close(); }
}
try { await main(); }
catch (error) {
  const safe = error instanceof SnapshotError ? { code: error.code, location: error.location }
    : { code: error?.status === 429 ? 'SHEETS_RATE_LIMITED_CAPTURE_ABORTED'
      : error?.status ? 'SOURCE_CAPTURE_FAILED' : 'MIGRATION_COMMAND_FAILED' };
  console.error(JSON.stringify({ success: false, ...safe }));
  process.exitCode = 1;
}
