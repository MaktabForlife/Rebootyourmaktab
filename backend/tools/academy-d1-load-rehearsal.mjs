#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {flowFixture} from '../tests/fixtures/academy-d1-fixture.mjs';
import {buildOperationalImport,importOperationalPlan,operationalSQL,migrations} from './academy-migration/operational.mjs';

// Synthetic accounts only, private local storage and no permitted network egress.
// This measures the local Workers/D1 runtime, not Cloudflare edge performance.
const options=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
const runtime=resolve(options['--runtime-root'] || 'backend/node_modules');
const compatibilityDate=options['--compatibility-date'] || '2026-10-09';
if(!/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate))throw Error('Invalid compatibility date');
const root=resolve('.academy-migration');mkdirSync(root,{recursive:true,mode:0o700});
const directory=mkdtempSync(join(root,'d1-load-'));
const save=(name,value)=>{const path=join(directory,name);writeFileSync(path,value,{mode:0o600,flag:'wx'});return path;};
let mf,step='PREPARE';
try {
  const {build}=await import(pathToFileURL(join(runtime,'esbuild/lib/main.js')));
  const miniflare=await import(pathToFileURL(join(runtime,'miniflare/dist/src/index.js')));
  const {snapshot,policy}=await flowFixture(200),plan=await buildOperationalImport(snapshot,policy);
  const native=new DatabaseSync(':memory:');try{importOperationalPlan(native,plan);}finally{native.close();}
  const config=save('wrangler.json',JSON.stringify({name:'academy-d1-load-local',compatibility_date:compatibilityDate,d1_databases:[{binding:'ACADEMY_DB',database_name:'academy-load-local',database_id:'00000000-0000-4000-8000-000000000003'}]}));
  const state=join(directory,'state');
  const run=(file,label)=>{
    step=label;
    const result=JSON.parse(execFileSync(process.execPath,[join(runtime,'wrangler/bin/wrangler.js'),'d1','execute','academy-load-local','--local','--config',config,'--persist-to',state,'--file',file,'--json'],
      {encoding:'utf8',maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_LOG_PATH:join(directory,'wrangler.log'),WRANGLER_SEND_METRICS:'false'}}));
    if(!Array.isArray(result)||result.some(r=>!r.success))throw Error('Local setup failed');
  };
  for(const migration of migrations)run(resolve('backend/migrations/academy',migration.name),migration.name);
  run(save('synthetic.sql',operationalSQL(plan)),'SYNTHETIC_IMPORT');
  const bundle=join(directory,'worker.js');
  await build({entryPoints:['backend/src/academy/d1/worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:bundle,logLevel:'silent'});
  let outboundRequests=0;
  step='START_LOCAL_WORKER';
  mf=new miniflare.Miniflare(miniflare.convertV4MiniflareOptions({name:'academy-d1-load-local',modules:true,scriptPath:bundle,compatibilityDate,
    resourcePersistencePath:join(state,'v3'),d1Databases:{ACADEMY_DB:'00000000-0000-4000-8000-000000000003'},
    bindings:{ENVIRONMENT:'local',ACADEMY_D1_MODE:'REHEARSAL',PIN_SECRET:'synthetic-pin-secret',SESSION_SECRET:'synthetic-session-secret'},
    ratelimits:{AUTH_LOGIN_RATE_LIMITER:{namespace_id:'100102',simple:{limit:5,period:60}}},
    outboundService:()=>{outboundRequests++;return new Response('External requests are disabled in this rehearsal.',{status:503});}}));
  await mf.ready;
  async function post(path,body={},token='') {
    const response=await mf.dispatchFetch(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),retryAfter:response.headers.get('Retry-After')};
  }
  const ensure=(response,status=200)=>{if(response.status!==status){const error=Error('Unexpected flow response');error.status=response.status;error.code=response.body.code;throw error;}return response.body;};
  step='BURST_200';
  const started=performance.now(),tokens=[];
  const results=await Promise.all(Array.from({length:200},async(_,index)=>{
    const at=performance.now(),suffix=String(index+1).padStart(4,'0');let stage='check';
    try {
      ensure(await post('/api/account/check',{uniqueid:`login-${suffix}`}));
      stage='login';const signed=ensure(await post('/api/account/login',{uniqueid:`login-${suffix}`,pin:'1234'}));tokens[index]=signed.token;
      stage='session';ensure(await post('/api/account/session',{},signed.token));
      stage='home';const home=ensure(await post('/api/academy/entrance',{startDate:'2026-10-09'},signed.token));
      if(!home.signedIn||JSON.stringify(home).includes('zoom.us'))throw Error('Privacy check failed');
      return {success:true,milliseconds:performance.now()-at};
    }catch(error){return {success:false,stage,status:error.status || 0,code:error.code || 'FLOW_FAILED',milliseconds:performance.now()-at};}
  }));
  const elapsed=performance.now()-started,times=results.map(r=>r.milliseconds).sort((a,b)=>a-b);
  const percentile=p=>Math.round(times[Math.ceil(p*times.length)-1]);
  const failures=results.filter(r=>!r.success);
  const burst={simultaneousFlows:200,requestsPerSuccessfulFlow:4,succeededFlows:results.length-failures.length,failedFlows:failures.length,
    elapsedMs:Math.round(elapsed),flowLatencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:Math.round(times.at(-1))},failures:failures.map(({milliseconds,...r})=>r)};
  console.log(JSON.stringify({step:'BURST_200',...burst}));
  if(failures.length)throw Error('Burst failed');
  step='SECURITY_SMOKE';const admin=tokens[0],student=tokens[1];
  const detail=ensure(await post('/api/academy/d1/accounts/read',{accountId:'account-0002'},admin));
  ensure(await post('/api/academy/d1/accounts/reset-pin',{accountId:'account-0002',credentialEpoch:detail.account.credentialEpoch},admin));
  ensure(await post('/api/account/session',{},student),401);
  const replacement=ensure(await post('/api/account/setup-pin',{uniqueid:'login-0002',pin:'2345',pinConfirmation:'2345'}));
  ensure(await post('/api/account/session',{},replacement.token));
  ensure(await post('/api/academy/d1/accounts/update',{accountId:'account-0002',displayName:'Synthetic updated learner',active:false,revision:1},admin));
  ensure(await post('/api/account/session',{},replacement.token),401);
  ensure(await post('/api/academy/d1/accounts/update',{accountId:'account-0002',displayName:'Synthetic updated learner',active:true,revision:2},admin));
  ensure(await post('/api/account/session',{},replacement.token),401);
  ensure(await post('/api/account/logout',{},tokens[10]));ensure(await post('/api/account/session',{},tokens[10]),401);
  const other=ensure(await post('/api/academy/d1/accounts/read',{accountId:'account-0008'},admin));
  ensure(await post('/api/academy/d1/accounts/reset-pin',{accountId:'account-0008',credentialEpoch:other.account.credentialEpoch},admin));
  const races=await Promise.all([post('/api/account/setup-pin',{uniqueid:'login-0008',pin:'2345',pinConfirmation:'2345'}),post('/api/account/setup-pin',{uniqueid:'login-0008',pin:'2345',pinConfirmation:'2345'})]);
  if(races.map(r=>r.status).sort().join(',')!=='200,409')throw Error('Concurrent credential guard failed');
  for(let i=0;i<4;i++)ensure(await post('/api/account/login',{uniqueid:'LOGIN-0010',pin:'1234'}));
  const limited=await post('/api/account/login',{uniqueid:'login-0010',pin:'1234'});ensure(limited,429);if(limited.retryAfter!=='60')throw Error('Rate-limit response failed');
  const db=await mf.getD1Database('ACADEMY_DB');
  await db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0012'").run();
  ensure(await post('/api/account/session',{},tokens[11]),401);
  if(outboundRequests!==0)throw Error('Unexpected external request');
  const report={success:true,runtime:'LOCAL_WORKERS_D1',compatibilityDate,syntheticAccounts:true,...burst,securitySmokeChecks:'PASS',externalRequests:outboundRequests,
    cloudPerformanceMeasured:false,cutoverReady:false};
  save('report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({step:'COMPLETE',...report,privateReport:join(directory,'report.json')}));
}catch(error){console.error(JSON.stringify({success:false,step,code:'LOCAL_D1_FLOW_REHEARSAL_FAILED',status:error.status || null}));process.exitCode=1;}
finally{if(mf)await mf.dispose().catch(()=>{process.exitCode=1;});}
