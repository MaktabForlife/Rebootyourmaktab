import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import worker,{assetPath,publicPdfTarget} from '../tools/browser-site/worker.mjs';
import {prepareBrowserSite,validateBrowserTarget} from '../tools/academy-d1-browser-site.mjs';

const siteName='academy-d1-browser-test-20261010-12345678',siteOrigin=`https://${siteName}.maktab4life.workers.dev`;
const input={syntheticOnly:true,accounts:Array.from({length:200},()=>({})),databaseId:'c5b96e84-f6ae-4fa6-ba7b-3ce91fe5c22c',workerName:'academy-d1-core-test-20261010-12345678',runId:'test-run'};
const backendConfig={name:input.workerName,account_id:'a'.repeat(32),d1_databases:[{binding:'ACADEMY_DB',database_id:input.databaseId}],
  vars:{ACADEMY_D1_MODE:'ACTIVE',ACADEMY_D1_RUN_ID:input.runId,ACADEMY_LIBRARY_MODE:'PUBLIC_ONLY',PLATFORM_SPREADSHEET_ID:'synthetic-fixture'}};
const target={input,backendConfig,siteName,siteOrigin};
validateBrowserTarget(target);
for(const bad of [
  {...target,input:{...input,databaseId:'7E732B79-A72F-4DA6-BE83-524919C49BA4'}},
  {...target,input:{...input,syntheticOnly:false}},
  {...target,siteName:'devrebootworker'},
  {...target,siteOrigin:'https://devrebootworker.maktab4life.workers.dev'},
  {...target,backendConfig:{...backendConfig,d1_databases:[{binding:'ACADEMY_DB',database_id:'7e732b79-a72f-4da6-be83-524919c49ba4'}]}},
  {...target,backendConfig:{...backendConfig,vars:{...backendConfig.vars,ACADEMY_D1_MODE:'OFF'}}},
  {...target,backendConfig:{...backendConfig,vars:{...backendConfig.vars,ACADEMY_LIBRARY_MODE:'PRIVATE'}}},
  {...target,backendConfig:{...backendConfig,vars:{...backendConfig.vars,ALLOWED_ORIGINS:'https://live.example'}}},
  {...target,backendConfig:{...backendConfig,services:[{binding:'LIVE',service:'devrebootworker'}]}}
])assert.throws(()=>validateBrowserTarget(bad));

let apiCalls=0,assetCalls=0,lastRequest;
const env={TEST_SITE_ORIGIN:siteOrigin,
  TEST_API:{async fetch(request){apiCalls++;lastRequest=request;return Response.json({success:true},{status:200});}},
  ASSETS:{async fetch(request){assetCalls++;lastRequest=request;return new Response('synthetic page',{headers:{'Content-Type':'text/html'}});}}};
const call=(path,options={})=>worker.fetch(new Request(siteOrigin+path,options),env);
let result=await call('/api/account/login',{method:'POST',headers:{Origin:siteOrigin,Authorization:'Bearer synthetic-token','Content-Type':'application/json'},body:'{"pin":"1234"}'});
assert.equal(result.status,200);assert.equal(apiCalls,1);assert.equal(lastRequest.url,siteOrigin+'/api/account/login');
assert.equal(lastRequest.headers.get('Authorization'),'Bearer synthetic-token');assert.equal(await lastRequest.text(),'{"pin":"1234"}');
assert.equal(lastRequest.redirect,'manual');assert.match(result.headers.get('Cache-Control'),/no-store/);
assert.match(result.headers.get('Content-Security-Policy'),/connect-src 'self'/);
assert.doesNotMatch(result.headers.get('Content-Security-Policy'),/devrebootworker|googleapis|maktabhelper/);
assert.equal((await call('/api/account/login',{method:'POST',headers:{Origin:'https://foreign.example'}})).status,403);
assert.equal((await worker.fetch(new Request('https://foreign.example/api/account/login'),env)).status,403);assert.equal(apiCalls,1);
assert.equal((await call('/account/synthetic-login?academy=1')).status,200);assert.equal(new URL(lastRequest.url).pathname,'/account/index.html');
assert.equal((await call('/programs/attendance.html')).status,200);
result=await call('/academy/',{method:'HEAD'});assert.equal(await result.text(),'');assert.equal(new URL(lastRequest.url).pathname,'/academy/index.html');
assert.equal((await call('/')).headers.get('Location'),siteOrigin+'/academy/');
const before=assetCalls;
for(const path of ['/backend/src/worker.js','/.academy-migration/test-secrets.json','/sources/reference','/.git/config','/academy/%2eprivate','/js/%5csecret','/js/%00secret'])assert.equal((await call(path)).status,404);
assert.equal(assetCalls,before);assert.equal((await call('/academy/',{method:'POST'})).status,405);
assert.equal(assetPath('/account/synthetic-login'),'/account/index.html');assert.equal(assetPath('/users'),'/users/index.html');
assert.equal(assetPath('/js/%ZZ'),null);assert.equal(assetPath('/js/../backend/secret'),null);
const encode=url=>Buffer.from(url).toString('base64url');
assert.equal(publicPdfTarget(encode('https://archive.org/download/book/file.pdf')),true);
for(const url of ['https://drive.google.com/file/d/private','https://secret.r2.dev/private.pdf','https://devrebootworker.maktab4life.workers.dev/api/library/drive/file/private?access=secret',
  'https://user:password@archive.org/download/book/file.pdf','https://archive.org:444/download/book/file.pdf','https://archive.org/download/book/file.pdf?private=1']) {
  assert.equal(publicPdfTarget(encode(url)),false);assert.equal((await call('/pdf-file/'+encode(url))).status,403);
}

const repo=realpathSync(mkdtempSync(join(tmpdir(),'academy-browser-package-')));
try {
  execFileSync('git',['init','-q'],{cwd:repo});
  for(const [path,content] of Object.entries({'account/index.html':'<head><title>Account</title></head>','academy/index.html':'<head><title>Academy</title></head>',
    'js/m4l-config.js':'window.M4L_CONFIG={API_BASE:"https://live.example"};','backend/private.json':'PRIVATE','sources/private.txt':'PRIVATE','.env':'PRIVATE','js/untracked.js':'UNTRACKED'})) {
    const file=join(repo,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,content);
    if(!path.includes('untracked'))execFileSync('git',['add','--',path],{cwd:repo});
  }
  mkdirSync(join(repo,'.academy-migration'));
  const directory=join(repo,'.academy-migration/site');const report=prepareBrowserSite({...target,repo,directory});
  assert.equal(report.assetFiles,3);assert.deepEqual(readdirSync(join(directory,'assets')).sort(),['academy','account','js']);
  assert.match(readFileSync(join(directory,'assets/academy/index.html'),'utf8'),/\[TEST\]/);
  const config=JSON.parse(readFileSync(join(directory,'wrangler.site.json')));assert.deepEqual(config.services,[{binding:'TEST_API',service:input.workerName}]);
  const browserBackend=JSON.parse(readFileSync(join(directory,'wrangler.backend-test.json')));assert.equal(browserBackend.vars.ALLOWED_ORIGINS,siteOrigin);assert.equal(browserBackend.name,input.workerName);
  assert.equal(config.d1_databases,undefined);assert.equal(config.assets.run_worker_first,true);
  const browserConfig=readFileSync(join(directory,'assets/js/m4l-config.js'),'utf8');assert.match(browserConfig,/synthetic-d1-test/);assert.doesNotMatch(browserConfig,/live.example/);
  assert.throws(()=>prepareBrowserSite({...target,repo,directory}));
  symlinkSync(join(repo,'backend/private.json'),join(repo,'js/link.json'));execFileSync('git',['add','js/link.json'],{cwd:repo});
  assert.throws(()=>prepareBrowserSite({...target,repo,directory:join(repo,'.academy-migration/symlink')}),/UNSAFE_OR_OVERSIZED_PUBLIC_ASSET/);
}finally{rmSync(repo,{recursive:true,force:true});}
console.log('D1 browser test site: target isolation, same-origin API, private-route rejection, public-only PDF and safe packaging PASS');
