import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {flowFixture} from '../tests/fixtures/academy-d1-fixture.mjs';
import {peakFixture} from '../tests/fixtures/academy-d1-peak-fixture.mjs';
import {withLearningSource} from '../tests/fixtures/academy-d1-learning-fixture.mjs';
import {fixtureTab} from '../tests/fixtures/academy-migration-fixture.mjs';
import {buildOperationalImport,importOperationalPlan,operationalSQL,migrations} from './academy-migration/operational.mjs';
import {buildLearningImport,importLearningPlan,learningSQL} from './academy-migration/learning.mjs';
import {buildCourseCalendarImport,importCourseCalendarPlan,courseCalendarSQL} from './academy-migration/course-calendar.mjs';
import {buildCoreActivationPlan,applyCoreActivationLocally,activationFacts} from './academy-migration/activation.mjs';
import {CORE_ACTIVATION_CHECKS} from '../src/academy/d1/activation-policy.js';
import {createSaltedPinHash} from '../src/lib/auth.js';

const MAIN_DATABASE='7e732b79-a72f-4da6-be83-524919c49ba4';
export function validateHostedCoreTarget({databaseId,workerName}) {
  if(databaseId===MAIN_DATABASE||!/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(databaseId||''))throw Error('DEDICATED_TEST_DATABASE_REQUIRED');
  if(!/^academy-d1-core-test-\d{8}-[a-f0-9]{8}$/.test(workerName||''))throw Error('DEDICATED_TEST_WORKER_REQUIRED');
}

// Prepares an already activated, locally verified SYNTHETIC fixture. This is
// installation into a new empty test DB, never an activation of an existing DB.
export async function prepareHostedCore({directory,databaseId,workerName,accountId,repo=process.cwd(),fixture='core'}) {
  validateHostedCoreTarget({databaseId,workerName});
  if(!['core','peak'].includes(fixture))throw Error('UNKNOWN_SYNTHETIC_FIXTURE');
  if(!/^[a-f0-9]{32}$/.test(accountId||''))throw Error('TEST_ACCOUNT_REQUIRED');
  directory=resolve(directory);mkdirSync(directory,{recursive:true,mode:0o700});
  const save=(name,value)=>writeFileSync(join(directory,name),value,{mode:0o600,flag:'wx'});
  const secrets={PIN_SECRET:randomBytes(32).toString('base64url'),SESSION_SECRET:randomBytes(32).toString('base64url')};
  const {snapshot,policy}=await (fixture==='peak'?peakFixture(200):flowFixture(200));snapshot.environment='development';policy.environment='development';if(fixture==='core')withLearningSource(snapshot);
  const accounts=fixtureTab(snapshot,'UserAccounts'),headers=accounts.rows[0],prefix=randomUUID();
  const hash=await createSaltedPinHash('1234',secrets.PIN_SECRET);
  for(const row of accounts.rows.slice(1).filter(r=>r.length)) {row[headers.indexOf('PINHash')]=hash;row[headers.indexOf('UniqueID')]=prefix+'-'+row[headers.indexOf('UniqueID')];}
  const base=await buildOperationalImport(snapshot,policy),learning=buildLearningImport(snapshot,base),course=buildCourseCalendarImport(snapshot,base);
  const databasePath=join(directory,'synthetic.sqlite');closeSync(openSync(databasePath,'wx',0o600));
  const db=new DatabaseSync(databasePath);
  try {
    importOperationalPlan(db,base);
    const migration=name=>readFileSync(resolve(repo,'backend/migrations/academy',name),'utf8');
    for(const name of ['0004_management_transactions.sql','0005_learning_workflows.sql'])db.exec(migration(name));
    importLearningPlan(db,learning);db.exec(migration('0006_course_calendar_workflows.sql'));importCourseCalendarPlan(db,course);db.exec(migration('0007_course_subscriptions.sql'));
    const review={reviewId:randomUUID(),sourceSha256:base.tables.migration_runs[0].source_snapshot_sha256,codeCommit:'0'.repeat(40),libraryMode:'PUBLIC_ONLY',
      evidence:Object.fromEntries(CORE_ACTIVATION_CHECKS.map(check=>[check,{status:'PASS',reference:'SYNTHETIC FIXTURE ONLY; NOT LIVE APPROVAL: '+check}]))};
    applyCoreActivationLocally(db,buildCoreActivationPlan(db,review));
    const finalBase={...base,tables:{...base.tables}};
    for(const table of ['migration_runs','data_ownership','audit_events','migration_checks'])finalBase.tables[table]=db.prepare('SELECT * FROM '+table).all();
    // Operational imports deliberately exclude runtime receipts. Preserve the
    // synthetic activation receipt separately after all schema extensions.
    const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
    const receipts=db.prepare('SELECT * FROM operation_receipts').all().map(row=>
      `INSERT INTO operation_receipts (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(literal).join(',')});`).join('\n');
    const sql=[...migrations.map(m=>m.sql),operationalSQL(finalBase),migration('0004_management_transactions.sql'),
      'UPDATE academy_write_state SET version=1 WHERE singleton=1;',migration('0005_learning_workflows.sql'),learningSQL(learning),
      migration('0006_course_calendar_workflows.sql'),courseCalendarSQL(course),migration('0007_course_subscriptions.sql'),receipts].join('\n');
    const roundtrip=new DatabaseSync(':memory:');
    try{roundtrip.exec('PRAGMA foreign_keys=ON');roundtrip.exec(sql);if(activationFacts(roundtrip).fingerprint!==activationFacts(db).fingerprint)throw Error('SYNTHETIC_INSTALL_ROUNDTRIP_FAILED');}
    finally{roundtrip.close();}
    save('synthetic-install.sql',sql);save('test-secrets.json',JSON.stringify(secrets));
    const config={name:workerName,account_id:accountId,main:resolve(repo,'backend/src/worker-runtime.js'),compatibility_date:'2026-10-10',workers_dev:true,preview_urls:false,
      observability:{enabled:true,head_sampling_rate:1},secrets:{required:['PIN_SECRET','SESSION_SECRET']},
      vars:{ENVIRONMENT:'development',ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:base.runId,ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',PLATFORM_SPREADSHEET_ID:'synthetic-'+prefix},
      d1_databases:[{binding:'ACADEMY_DB',database_name:workerName,database_id:databaseId}],
      durable_objects:{bindings:[{name:'PROGRAM_TIMETABLE_COORDINATOR',class_name:'ProgramTimetableCoordinator'}]},
      migrations:[{tag:'core-test-only-v1',new_sqlite_classes:['ProgramTimetableCoordinator']}],
      ratelimits:[{name:'AUTH_LOGIN_RATE_LIMITER',namespace_id:String(1000000+randomBytes(3).readUIntBE(0,3)),simple:{limit:5,period:60}}]};
    save('wrangler.json',JSON.stringify(config,null,2));
    save('test-input.json',JSON.stringify({databaseId,workerName,runId:base.runId,fixture,accounts:base.tables.accounts.map(a=>({id:a.account_id,login:a.login_link_id})),syntheticOnly:true},null,2));
    return {prepared:true,syntheticAccounts:base.tables.accounts.length,tables:activationFacts(db).names.length,workerName,databaseId,mainDatabaseChanged:false};
  }finally{db.close();chmodSync(databasePath,0o600);}
}

export async function exerciseHostedCore(origin,input) {
  validateHostedCoreTarget(input);
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.username||url.password||url.hostname.split('.')[0]!==input.workerName||!url.hostname.endsWith('.workers.dev')||url.pathname!=='/')throw Error('DEDICATED_TEST_ORIGIN_REQUIRED');
  if(input.syntheticOnly!==true||input.accounts?.length!==200)throw Error('SYNTHETIC_FIXTURE_REQUIRED');
  const request=async(path,body,token='')=>{
    const response=await fetch(new URL(path,url),{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(60000)});
    const data=await response.json();return {status:response.status,data};
  };
  const ensure=(result,status=200)=>{if(result.status!==status||(status===200&&!result.data.success))throw Object.assign(Error('HOSTED_CORE_RESPONSE'),{status:result.status,code:result.data.code||'UNKNOWN'});return result.data;};
  const started=performance.now(),tokens=[];
  const flows=await Promise.all(input.accounts.map(async(account,i)=>{
    const at=performance.now();let stage='check';
    try {
      ensure(await request('/api/account/check',{uniqueid:account.login}));
      stage='login';const signed=ensure(await request('/api/account/login',{uniqueid:account.login,pin:'1234'}));tokens[i]=signed.token;
      if(signed.sessionStore!=='D1')throw Error('WRONG_SESSION_STORE');
      stage='session';ensure(await request('/api/account/session',{},signed.token));
      stage='home';const home=ensure(await request('/api/academy/entrance',{startDate:'2026-10-01'},signed.token));
      if(!home.signedIn||home.sessionStore!=='D1'||JSON.stringify(home).includes('zoom.us')||JSON.stringify(home).includes('pin_hash'))throw Error('HOSTED_PRIVACY_FAILED');
      return {success:true,milliseconds:performance.now()-at};
    }catch(error){return {success:false,stage,status:error.status||0,code:error.code||error.message,milliseconds:performance.now()-at};}
  }));
  const times=flows.map(f=>f.milliseconds).sort((a,b)=>a-b),percentile=p=>Math.round(times[Math.ceil(p*times.length)-1]);
  const report={runtime:'HOSTED_CLOUDFLARE_WORKERS_D1',syntheticOnly:true,simultaneousFlows:200,requestsPerSuccessfulFlow:4,
    succeededFlows:flows.filter(f=>f.success).length,failedFlows:flows.filter(f=>!f.success).length,elapsedMs:Math.round(performance.now()-started),
    flowLatencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:Math.round(times.at(-1))},
    failures:flows.filter(f=>!f.success).map(({milliseconds,...failure})=>failure),mainDatabaseChanged:false};
  if(report.failedFlows)return report;
  const admin=tokens[0],student=tokens[1],teacher=tokens[2],programAdmin=tokens[3];
  ensure(await request('/api/admin/platform/programs/list',{},admin));
  ensure(await request('/api/admin/platform/programs/list',{},programAdmin));
  ensure(await request('/api/admin/platform/programs/list',{},teacher),403);
  ensure(await request('/api/admin/platform/user-profiles/get',{},student),403);
  const library=ensure(await request('/api/academy/library/catalogue',{},student));
  if(library.resources.length||library.mediaSubscriptionsAvailable!==false)throw Error('PRIVATE_MEDIA_EXPOSED');
  ensure(await request('/api/academy/library/access',{resourceId:'private'},admin),403);
  const publicResponse=await fetch(new URL('/api/academy/open-library/metadata/public',url));
  if(publicResponse.status!==200||(await publicResponse.json()).records.length!==0)throw Error('HOSTED_PUBLIC_LIBRARY_FAILED');
  ensure(await request('/api/account/login',{uniqueid:input.accounts[1].login,pin:'9999'}),401);
  const account=ensure(await request('/api/academy/d1/accounts/read',{accountId:input.accounts[1].id},admin)).account;
  ensure(await request('/api/academy/d1/accounts/reset-pin',{accountId:account.accountId,credentialEpoch:account.credentialEpoch},admin));
  ensure(await request('/api/account/session',{},student),401);
  const replacement=ensure(await request('/api/account/setup-pin',{uniqueid:input.accounts[1].login,pin:'2345',pinConfirmation:'2345'}));
  ensure(await request('/api/account/logout',{},replacement.token));ensure(await request('/api/account/session',{},replacement.token),401);
  report.coreRoleAndSecurityChecks='PASS';report.publicLibrary='PASS';report.privateMedia='BLOCKED';return report;
}

// No creation, deployment or main-database activation is performed by this CLI.
// Prepare only after an empty, disposable hosted test database exists. Deploy
// with its explicit private config and private secret file before exercising.
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const [mode,...args]=process.argv.slice(2);
    if(args.length%2)throw Error('EXPECTED_FLAG_VALUE_PAIRS');
    const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]));
    if(mode==='prepare') {
      if(!options['--directory'])throw Error('PRIVATE_DIRECTORY_REQUIRED');
      console.log(JSON.stringify(await prepareHostedCore({directory:options['--directory'],databaseId:options['--database-id'],workerName:options['--worker-name'],accountId:options['--account-id'],fixture:options['--fixture']||'core'})));
    }else if(mode==='exercise') {
      if(!options['--input']||!options['--report'])throw Error('INPUT_AND_PRIVATE_REPORT_REQUIRED');
      const report=await exerciseHostedCore(options['--origin'],JSON.parse(readFileSync(options['--input'],'utf8')));
      writeFileSync(resolve(options['--report']),JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
      console.log(JSON.stringify(report));if(report.failedFlows)process.exitCode=1;
    }else throw Error('EXPECTED_PREPARE_OR_EXERCISE');
  }catch(error){console.error(JSON.stringify({error:error.message,mainDatabaseChanged:false}));process.exitCode=1;}
}
