// Approval evidence is recorded by the offline cutover tool, never a browser.
// The main database remains staging until that separately reviewed transition.
export const CORE_ACTIVATION_CHECKS=Object.freeze([
  'SOURCE_FREEZE_RECONCILIATION','EXACT_CONTENT_AND_AUTHORITY','BACKUP_RESTORE',
  'HOSTED_CORE_WORKFLOWS','HOSTED_PEAK_FLOWS','BROWSER_ACCEPTANCE',
  'SHEETS_WRITES_STOPPED','OWNER_RELEASE_APPROVAL'
]);

export function newActivityOwnership(activity,env) {
  return {dataset_key:'ACADEMY',scope_key:activity,
    authoritative_store:env.ACADEMY_D1_MODE==='ACTIVE'?'D1':'SHEETS',
    phase:env.ACADEMY_D1_MODE==='ACTIVE'?'ACTIVE':'STAGING',
    verified_run_id:env.ACADEMY_D1_MODE==='ACTIVE'?env.ACADEMY_D1_RUN_ID:null,
    switched_at:env.ACADEMY_D1_MODE==='ACTIVE'?new Date().toISOString():null,revision:1};
}
