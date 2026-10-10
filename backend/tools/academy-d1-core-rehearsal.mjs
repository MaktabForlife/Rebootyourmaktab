#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {prepareHostedCore,exerciseHostedCore} from './academy-d1-hosted-core.mjs';

// Local Workers runtime only. Synthetic accounts, dedicated local D1 and no
// external traffic. This does not measure hosted Cloudflare capacity.
const options=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
const repo=resolve('.'),runtime=resolve(options['--runtime-root']||'backend/node_modules');
const compatibilityDate=options['--compatibility-date']||'2026-06-01';
if(!/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate))throw Error('INVALID_COMPATIBILITY_DATE');
const root=resolve('.academy-migration');mkdirSync(root,{recursive:true,mode:0o700});
const directory=mkdtempSync(join(root,'core-active-local-'));
const workerName='academy-d1-core-test-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(4).toString('hex');
const databaseId='00000000-0000-4000-8000-000000000009';
const save=(name,value)=>writeFileSync(join(directory,name),value,{mode:0o600,flag:'wx'});
let mf,outboundRequests=0,step='PREPARE';
try {
  const prepared=await prepareHostedCore({directory,databaseId,workerName,accountId:'0'.repeat(32),repo,fixture:options['--fixture']||'core'});
  const config=JSON.parse(readFileSync(join(directory,'wrangler.json'),'utf8'));
  const secrets=JSON.parse(readFileSync(join(directory,'test-secrets.json'),'utf8'));
  const input=JSON.parse(readFileSync(join(directory,'test-input.json'),'utf8'));
  const state=join(directory,'state');step='INSTALL_LOCAL_SYNTHETIC_DATABASE';
  const install=JSON.parse(execFileSync(process.execPath,[join(runtime,'wrangler/bin/wrangler.js'),'d1','execute',workerName,'--local','--config',join(directory,'wrangler.json'),
    '--persist-to',state,'--file',join(directory,'synthetic-install.sql'),'--json'],{encoding:'utf8',maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe'],
    env:{...process.env,WRANGLER_LOG_PATH:join(directory,'wrangler.log'),WRANGLER_SEND_METRICS:'false'}}));
  if(!Array.isArray(install)||install.some(result=>!result.success))throw Error('LOCAL_INSTALL_FAILED');
  const {build}=await import(pathToFileURL(join(runtime,'esbuild/lib/main.js')));
  const {Miniflare,convertV4MiniflareOptions}=await import(pathToFileURL(join(runtime,'miniflare/dist/src/index.js')));
  const bundle=join(directory,'worker.js');
  await build({entryPoints:[resolve('backend/src/worker-runtime.js')],bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers'],outfile:bundle,logLevel:'silent'});
  step='START_LOCAL_ACTIVE_WORKER';
  // Default to the current application's compatibility date; the installed
  // local binary can lag today's hosted-test configuration date.
  mf=new Miniflare(convertV4MiniflareOptions({name:workerName,modules:true,scriptPath:bundle,compatibilityDate,
    resourcePersistencePath:join(state,'v3'),d1Databases:{ACADEMY_DB:databaseId},
    durableObjects:{PROGRAM_TIMETABLE_COORDINATOR:{className:'ProgramTimetableCoordinator',useSQLite:true}},
    bindings:{...config.vars,...secrets},ratelimits:{AUTH_LOGIN_RATE_LIMITER:{namespace_id:config.ratelimits[0].namespace_id,simple:{limit:5,period:60}}},
    outboundService:()=>{outboundRequests++;return new Response('External traffic disabled.',{status:503});}}));
  await mf.ready;
  step='ACTIVE_CORE_FLOWS';const original=globalThis.fetch;
  let result;
  try {
    globalThis.fetch=(url,init)=>{
      if(new URL(url).hostname!==workerName+'.local.workers.dev')throw Error('UNEXPECTED_TEST_TARGET');
      return mf.dispatchFetch(url,init);
    };
    result=await exerciseHostedCore('https://'+workerName+'.local.workers.dev',input);
  }finally{globalThis.fetch=original;}
  result.runtime='LOCAL_WORKERS_D1';result.compatibilityDate=compatibilityDate;result.outboundRequests=outboundRequests;result.syntheticTables=prepared.tables;
  result.mainDatabaseChanged=false;result.hostedCapacityVerified=false;result.fixture=input.fixture;
  if(result.failedFlows||outboundRequests||result.coreRoleAndSecurityChecks!=='PASS')throw Error('LOCAL_ACTIVE_CORE_FAILED');
  save('verification.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({directory,...result}));
}catch(error){
  const report={runtime:'LOCAL_WORKERS_D1',step,error:error.message,mainDatabaseChanged:false,hostedCapacityVerified:false};
  save('failure.json',JSON.stringify(report,null,2));console.error(JSON.stringify({directory,...report}));process.exitCode=1;
}finally{await mf?.dispose().catch(()=>{});}
