import {managementError} from './management-store.js';
export async function learningAvailable(db) {
  if(!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='learning_imports'").first())return false;
  return Boolean(await db.prepare(`SELECT 1 FROM learning_imports l JOIN migration_runs m ON m.run_id=l.base_run_id
    WHERE l.singleton=1 AND m.state IN ('IMPORTED','VERIFIED','CUTOVER') AND m.source_snapshot_sha256=l.source_sha256`).first());
}
export async function requireLearning(db) {
  if(!await learningAvailable(db))throw managementError('Learning records need their verified database import.',503,'LEARNING_IMPORT_REQUIRED');
}
