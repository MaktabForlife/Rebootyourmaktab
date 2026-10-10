import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {buildOperationalImport,importOperationalPlan,verifyOperationalRows} from './academy-migration/operational.mjs';
import {buildLearningImport,importLearningPlan,verifyLearningPlan} from './academy-migration/learning.mjs';
import {buildCourseCalendarImport,importCourseCalendarPlan,verifyCourseCalendarPlan} from './academy-migration/course-calendar.mjs';
import {captureRecoverySnapshot,snapshotFromReadback,restoreRecoverySnapshot,recoverySQL} from './academy-migration/recovery.mjs';
import {buildStagingUpgradePlan,applyStagingUpgradeLocally} from './academy-migration/staging-upgrade.mjs';
import {activationFacts,buildCoreActivationPlan} from './academy-migration/activation.mjs';
import {sha256,stableJSON} from './academy-migration/snapshot.mjs';

const mainDatabaseId='7e732b79-a72f-4da6-be83-524919c49ba4';
const extensions=['0004_management_transactions.sql','0005_learning_workflows.sql','0006_course_calendar_workflows.sql','0007_course_subscriptions.sql'].map(name=>({name,sql:readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8')}));
const save=(directory,name,value)=>writeFileSync(join(directory,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const localDatabase=path=>{closeSync(openSync(path,'wx',0o600));return new DatabaseSync(path);};

// This command is intentionally offline. It cannot invoke Wrangler, deploy a
// controller, contact Sheets, set live flags, or apply any main database SQL.
export async function prepareMainDatabase({source,policy,readback,directory,codeCommit}) {
  if(!/^[a-f0-9]{40}$/i.test(codeCommit||''))throw Error('REVIEWABLE_CODE_COMMIT_REQUIRED');
  const base=await buildOperationalImport(source,policy),learning=buildLearningImport(source,base),courses=buildCourseCalendarImport(source,base);
  verifyOperationalRows(base,readback.records);
  const backup=snapshotFromReadback(readback.schema,readback.records,{databaseId:mainDatabaseId,capturedAt:readback.capturedAt,
    quiescenceReference:'Exact readback of independently verified unused Sheets/staging baseline; source freeze NOT established'});
  mkdirSync(directory,{mode:0o700});
  save(directory,'baseline-backup.json',backup);save(directory,'baseline-restore.sql',recoverySQL(backup));
  const before=localDatabase(join(directory,'baseline-restored.sqlite')),candidate=localDatabase(join(directory,'upgraded-candidate.sqlite'));
  try {
    restoreRecoverySnapshot(before,backup);restoreRecoverySnapshot(candidate,backup);
    const expected=new DatabaseSync(':memory:');
    try {
      importOperationalPlan(expected,base);
      if(activationFacts(expected).fingerprint!==activationFacts(before).fingerprint)throw Error('MAIN_BASELINE_SCHEMA_OR_CONTENT_MISMATCH');
    }finally{expected.close();}
    candidate.exec(extensions[0].sql);candidate.exec(extensions[1].sql);importLearningPlan(candidate,learning);
    candidate.exec(extensions[2].sql);importCourseCalendarPlan(candidate,courses);candidate.exec(extensions[3].sql);
    verifyLearningPlan(candidate,learning);verifyCourseCalendarPlan(candidate,courses);
    const plan=buildStagingUpgradePlan(before,candidate,{databaseId:mainDatabaseId,codeCommit,sourceSha256:sha256(source)});
    save(directory,'private-additive-upgrade.json',plan);
    const upgraded=captureRecoverySnapshot(candidate,{databaseId:mainDatabaseId,quiescenceReference:'Offline candidate only'});
    save(directory,'candidate-backup.json',upgraded);save(directory,'candidate-restore.sql',recoverySQL(upgraded));
    const trials=[];
    for(let i=1;i<=2;i++) {
      const trial=localDatabase(join(directory,'upgrade-trial-'+i+'.sqlite'));
      try {
        if(i===1)restoreRecoverySnapshot(trial,backup);
        else{trial.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE');trial.exec(recoverySQL(backup));trial.exec('COMMIT');}
        if(activationFacts(trial).fingerprint!==backup.fingerprint)throw Error('MAIN_BASELINE_RESTORE_MISMATCH');
        applyStagingUpgradeLocally(trial,plan);
        if(activationFacts(trial).fingerprint!==upgraded.fingerprint)throw Error('MAIN_UPGRADE_TRIAL_MISMATCH');
        const replay=applyStagingUpgradeLocally(trial,plan);
        if(!replay.replayed)throw Error('MAIN_UPGRADE_REPLAY_MISMATCH');
        trials.push({trial:i,baselineRestore:i===1?'JSON':'SQL',upgrade:'PASS',replay:'PASS',exactCandidate:'PASS'});
      }finally{trial.close();}
      const restore=localDatabase(join(directory,'candidate-sql-restore-'+i+'.sqlite'));
      try {
        restore.exec('PRAGMA foreign_keys=ON;BEGIN IMMEDIATE');restore.exec(recoverySQL(upgraded));restore.exec('COMMIT');
        if(activationFacts(restore).fingerprint!==upgraded.fingerprint||restore.prepare('PRAGMA foreign_key_check').all().length||restore.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('MAIN_CANDIDATE_RESTORE_MISMATCH');
      }finally{restore.close();}
    }
    const activation=buildCoreActivationPlan(candidate,{reviewId:randomUUID(),sourceSha256:sha256(source),codeCommit,libraryMode:'PUBLIC_ONLY'});
    if(activation.readyToApply||activation.statements.length)throw Error('UNAPPROVED_MAIN_ACTIVATION');
    save(directory,'pending-activation.json',activation);
    const report={format:'maktab-main-d1-preparation/v1',preparedAt:new Date().toISOString(),databaseId:mainDatabaseId,
      sourceCompletedAt:source.completedAt,sourceSha256:sha256(source),policySha256:sha256(policy),codeCommit,
      mainReadbackAt:readback.capturedAt,mainBackupFingerprint:backup.fingerprint,candidateFingerprint:upgraded.fingerprint,
      beforeTables:plan.beforeTables,afterTables:plan.afterTables,preservedTables:Object.keys(plan.preservedCounts).length,
      preservedRows:Object.values(plan.preservedCounts).reduce((a,b)=>a+b,0),
      accounts:base.tables.accounts.length,credentialHashes:base.tables.account_credentials.filter(r=>r.pin_hash.trim()).length,
      programs:base.tables.program_settings.length,courses:base.tables.course_settings.length,addedRows:plan.addedRows,
      trials,baselineSqlRestores:1,candidateSqlRestores:2,integrity:'PASS',foreignKeys:'PASS',authorityMapping:'EXISTING_SOURCE_ROWS_PRESERVED; ADMIN=PROGRAM_ADMIN; SENIOR=TEACHER',
      libraryMode:'PUBLIC_ONLY',mainDatabaseChanged:false,mainDeploymentChanged:false,sourceFrozen:false,
      liveExecutionApproved:false,activationReady:false,executableActivationStatements:0,activationBlockers:activation.blockers,
      extensions:extensions.map(m=>({name:m.name,sha256:sha256(m.sql)})),privateUpgradeSha256:plan.artifactSha256};
    const protectedTables=['accounts','account_credentials','global_role_assignments','role_assignments','legacy_access_evidence','data_ownership'];
    for(const table of protectedTables)if(stableJSON(before.prepare('SELECT * FROM '+table).all())!==stableJSON(candidate.prepare('SELECT * FROM '+table).all()))throw Error('MAIN_IDENTITY_AUTHORITY_OR_OWNERSHIP_CHANGED');
    save(directory,'preparation-report.json',report);
    return report;
  }finally{before.close();candidate.close();chmodSync(directory,0o700);}
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const args=process.argv.slice(2),allowed=['source','policy','readback','directory','code-commit'],options={};
    if(args.length!==allowed.length*2)throw Error('EXPECTED_SOURCE_POLICY_READBACK_DIRECTORY_AND_CODE_COMMIT');
    for(let i=0;i<args.length;i+=2){const key=args[i].slice(2);if(!args[i].startsWith('--')||!allowed.includes(key)||Object.hasOwn(options,key)||!args[i+1])throw Error('INVALID_PREPARATION_ARGUMENT');options[key]=args[i+1];}
    const cwd=fileURLToPath(new URL('../../',import.meta.url));
    const git=args=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    if(git(['rev-parse','HEAD'])!==options['code-commit']||git(['status','--porcelain']))throw Error('CLEAN_PINNED_CODE_COMMIT_REQUIRED');
    const read=key=>JSON.parse(readFileSync(resolve(options[key]),'utf8'));
    const report=await prepareMainDatabase({source:read('source'),policy:read('policy'),readback:read('readback'),directory:resolve(options.directory),codeCommit:options['code-commit']});
    console.log(JSON.stringify(report));
  }catch{console.error(JSON.stringify({success:false,code:'MAIN_PREPARATION_FAILED',mainDatabaseChanged:false}));process.exitCode=1;}
}
