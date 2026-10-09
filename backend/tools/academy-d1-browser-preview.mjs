#!/usr/bin/env node
// Local browser integration only. The database, accounts and secrets are all
// synthetic, and the Worker cannot make outbound requests.
import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {flowFixture} from '../tests/fixtures/academy-d1-fixture.mjs';
import {fixtureTab} from '../tests/fixtures/academy-migration-fixture.mjs';
import {buildOperationalImport,importOperationalPlan,operationalSQL,migrations} from './academy-migration/operational.mjs';

const options=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
const runtime=resolve(options['--runtime-root'] || 'backend/node_modules');
const compatibilityDate=options['--compatibility-date'] || '2026-10-09';
const port=Number(options['--port'] || '3400');
if(!/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid preview options');
const root=await realpath('.'),origin=`http://127.0.0.1:${port}`;
const privateRoot=join(root,'.academy-migration');mkdirSync(privateRoot,{recursive:true,mode:0o700});
const directory=mkdtempSync(join(privateRoot,'d1-browser-'));
const save=(name,value)=>{const path=join(directory,name);writeFileSync(path,value,{mode:0o600});return path;};
let mf,server,externalRequests=0;
const apiRequests=[];
async function report() {
  const db=await mf.getD1Database('ACADEMY_DB');
  const sessions=await db.prepare('SELECT count(*) AS total, coalesce(sum(revoked_at IS NOT NULL),0) AS revoked FROM account_sessions').first();
  return {success:true,runtime:'LOCAL_WORKERS_D1_BROWSER',workerEntrypoint:'backend/src/worker-runtime.js',compatibilityDate,
    syntheticAccounts:true,cloudDatabaseAccessed:false,externalRequests,apiRequests,sessions,cutoverReady:false};
}
async function stop() {
  try{if(mf)save('browser-preview-report.json',JSON.stringify(await report(),null,2));}
  finally{if(server)await new Promise(resolve=>server.close(resolve));if(mf)await mf.dispose();}
}
try {
  const {build}=await import(pathToFileURL(join(runtime,'esbuild/lib/main.js')));
  const miniflare=await import(pathToFileURL(join(runtime,'miniflare/dist/src/index.js')));
  const {snapshot,policy}=await flowFixture(12);
  const accounts=fixtureTab(snapshot,'UserAccounts'),head=accounts.rows[0];
  const setup=accounts.rows.find(row=>row[head.indexOf('AccountID')]==='account-0012');
  setup[head.indexOf('PINHash')]='';setup[head.indexOf('PINSetup')]=false;
  const plan=await buildOperationalImport(snapshot,policy);
  const native=new DatabaseSync(':memory:');try{importOperationalPlan(native,plan);}finally{native.close();}
  const databaseId='00000000-0000-4000-8000-000000000004';
  const config=save('wrangler.json',JSON.stringify({name:'academy-d1-browser-local',compatibility_date:compatibilityDate,
    d1_databases:[{binding:'ACADEMY_DB',database_name:'academy-browser-local',database_id:databaseId}]}));
  const state=join(directory,'state');
  for(const file of [...migrations.map(m=>resolve('backend/migrations/academy',m.name)),save('synthetic.sql',operationalSQL(plan))]) {
    const results=JSON.parse(execFileSync(process.execPath,[join(runtime,'wrangler/bin/wrangler.js'),'d1','execute','academy-browser-local','--local','--config',config,'--persist-to',state,'--file',file,'--json'],
      {encoding:'utf8',maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_LOG_PATH:join(directory,'wrangler.log'),WRANGLER_SEND_METRICS:'false'}}));
    if(!Array.isArray(results)||results.some(r=>!r.success))throw Error('Local import failed');
  }
  const bundle=join(directory,'worker.js');
  await build({entryPoints:['backend/src/worker-runtime.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers'],outfile:bundle,logLevel:'silent'});
  mf=new miniflare.Miniflare(miniflare.convertV4MiniflareOptions({name:'academy-d1-browser-local',modules:true,scriptPath:bundle,compatibilityDate,
    resourcePersistencePath:join(state,'v3'),d1Databases:{ACADEMY_DB:databaseId},
    bindings:{ENVIRONMENT:'local',ACADEMY_D1_MODE:'REHEARSAL',ALLOWED_ORIGINS:origin,PIN_SECRET:'synthetic-pin-secret',SESSION_SECRET:'synthetic-session-secret'},
    ratelimits:{AUTH_LOGIN_RATE_LIMITER:{namespace_id:'100103',simple:{limit:5,period:60}}},
    outboundService:()=>{externalRequests++;return new Response('External requests are disabled.',{status:503});}}));
  await mf.ready;
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
  server=createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    try {
      if(request.headers.host!==`127.0.0.1:${port}`){response.writeHead(403).end();return;}
      const url=new URL(request.url,origin);
      if(url.origin!==origin){response.writeHead(403).end();return;}
      if(url.pathname.startsWith('/api/')) {
        let size=0;const chunks=[];
        for await(const chunk of request){size+=chunk.length;if(size>4096){response.writeHead(413).end();return;}chunks.push(chunk);}
        const result=await mf.dispatchFetch(url.href,{method:request.method,headers:request.headers,
          ...(!['GET','HEAD'].includes(request.method)?{body:Buffer.concat(chunks)}:{})});
        apiRequests.push({method:request.method,path:url.pathname,status:result.status});
        response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));return;
      }
      if(request.method!=='GET'&&request.method!=='HEAD'){response.writeHead(405).end();return;}
      if(url.pathname==='/__preview/report') {
        const result=await report();save('browser-preview-report.json',JSON.stringify(result,null,2));
        response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));return;
      }
      if(url.pathname==='/js/m4l-config.js') {
        response.writeHead(200,{'Content-Type':'text/javascript'}).end(`window.M4L_CONFIG=Object.freeze(${JSON.stringify({API_BASE:origin,ENV_NAME:'local-d1-preview',IS_DEVELOPMENT:true,IS_PRODUCTION:false})});`);return;
      }
      let path=decodeURIComponent(url.pathname);
      if(path==='/')path='/academy/';
      if(/^\/account\/[^/]+\/?$/.test(path))path='/account/';
      if(!/^\/(academy|account|js|css)(\/|$)/.test(path)&&!['/academy.png','/ummabbadacademy.png','/logo.png'].includes(path)) {response.writeHead(404).end();return;}
      let filename=resolve(root,`.${path}`);
      if(!filename.startsWith(`${root}/`)){response.writeHead(404).end();return;}
      if((await stat(filename)).isDirectory())filename=join(filename,'index.html');
      if(await realpath(filename)!==filename||!types[extname(filename)]){response.writeHead(404).end();return;}
      response.writeHead(200,{'Content-Type':types[extname(filename)]});
      response.end(request.method==='HEAD'?undefined:await readFile(filename));
    }catch(error){response.writeHead(error.code==='ENOENT'?404:500).end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  console.log(JSON.stringify({success:true,url:`${origin}/academy/`,syntheticLogin:'login-0002',syntheticPin:'1234',syntheticSetupLogin:'login-0012',privateEvidence:directory}));
  await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}catch(error){console.error(JSON.stringify({success:false,code:'LOCAL_BROWSER_PREVIEW_FAILED',detail:error.message}));process.exitCode=1;}
finally{await stop();}
