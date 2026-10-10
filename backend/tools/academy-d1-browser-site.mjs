// Offline packaging only. Deployment requires the explicitly generated test config.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateHostedCoreTarget} from './academy-d1-hosted-core.mjs';

const DIRECTORIES=['academy','account','admin','student','programs','users','js','css','icons','images','pdf-viewer','recorder'];
const ROOT_FILES=['academy.png','ummabbadacademy.png','logo.png','app.js','styles.css','version.json',
  ...['admin','student'].flatMap(role=>[`${role}-apple-touch-icon.png`,`${role}-favicon.ico`,`${role}-favicon-16x16.png`,`${role}-favicon-32x32.png`,`${role}-icon-192.png`,`${role}-icon-512.png`,`${role}-manifest.json`])];
const EXTENSIONS=new Set(['.html','.js','.mjs','.css','.json','.png','.jpg','.jpeg','.gif','.webp','.svg','.ico','.pdf','.woff','.woff2','.ttf','.otf','.bcmap','.wasm','.pfb','.map','.mp3','.mp4','.webm','.ogg','.txt','.ftl','.icc']);

export function validateBrowserTarget({input,backendConfig,siteName,siteOrigin}) {
  validateHostedCoreTarget(input);
  if(input.syntheticOnly!==true||input.accounts?.length!==200)throw Error('SYNTHETIC_FIXTURE_REQUIRED');
  if(!/^academy-d1-browser-test-\d{8}-[a-f0-9]{8}$/.test(siteName||''))throw Error('DEDICATED_BROWSER_SITE_REQUIRED');
  const origin=new URL(siteOrigin);
  if(origin.protocol!=='https:'||origin.origin!==siteOrigin||origin.hostname!==siteName+'.maktab4life.workers.dev')throw Error('DEDICATED_BROWSER_ORIGIN_REQUIRED');
  const bindings=backendConfig.d1_databases;
  if(backendConfig.name!==input.workerName||bindings?.length!==1||bindings[0].binding!=='ACADEMY_DB'||bindings[0].database_id.toLowerCase()!==input.databaseId.toLowerCase()||
    backendConfig.vars?.ACADEMY_D1_MODE!=='ACTIVE'||backendConfig.vars?.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY'||backendConfig.vars?.ACADEMY_D1_RUN_ID!==input.runId||
    !backendConfig.vars?.PLATFORM_SPREADSHEET_ID?.startsWith('synthetic-')||!/^[a-f0-9]{32}$/.test(backendConfig.account_id||''))throw Error('ISOLATED_ACTIVE_BACKEND_REQUIRED');
  if(['services','r2_buckets','kv_namespaces','queues','workflows','hyperdrive','dispatch_namespaces'].some(key=>backendConfig[key]))throw Error('UNEXPECTED_BACKEND_BINDING');
  if(backendConfig.vars.ALLOWED_ORIGINS&&backendConfig.vars.ALLOWED_ORIGINS!==siteOrigin)throw Error('UNEXPECTED_BROWSER_ORIGIN');
}

export function prepareBrowserSite({repo,directory,input,backendConfig,siteName,siteOrigin}) {
  validateBrowserTarget({input,backendConfig,siteName,siteOrigin});
  repo=realpathSync(repo);directory=resolve(directory);
  const privateParent=join(repo,'.academy-migration');
  if(dirname(directory)!==privateParent||realpathSync(privateParent)!==privateParent)throw Error('PRIVATE_SITE_DIRECTORY_REQUIRED');
  mkdirSync(directory,{mode:0o700});
  const assets=join(directory,'assets');mkdirSync(assets,{mode:0o700});
  const files=execFileSync('git',['ls-files','-z','--',...DIRECTORIES,...ROOT_FILES],{cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean);
  const manifest=[];
  for(const relative of files) {
    if(!EXTENSIONS.has(extname(relative).toLowerCase()))continue;
    const source=join(repo,relative),info=lstatSync(source);
    if(!info.isFile()||realpathSync(source)!==source||info.size>25*1024*1024)throw Error('UNSAFE_OR_OVERSIZED_PUBLIC_ASSET');
    let bytes=readFileSync(source);
    if(relative==='js/m4l-config.js')bytes=Buffer.from(`window.M4L_CONFIG=Object.freeze(${JSON.stringify({API_BASE:siteOrigin,ENV_NAME:'synthetic-d1-test',IS_DEVELOPMENT:true,IS_PRODUCTION:false})});\n`);
    if(relative.endsWith('.html'))bytes=Buffer.from(bytes.toString('utf8').replace(/<head(\s[^>]*)?>/i,match=>match+'\n<meta name="robots" content="noindex,nofollow">').replace(/<title>/i,'<title>[TEST] '));
    const destination=join(assets,relative);mkdirSync(dirname(destination),{recursive:true,mode:0o700});
    writeFileSync(destination,bytes,{mode:0o600,flag:'wx'});
    manifest.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  if(!manifest.some(f=>f.path==='account/index.html')||!manifest.some(f=>f.path==='js/m4l-config.js'))throw Error('INCOMPLETE_PUBLIC_ASSETS');
  const config={name:siteName,account_id:backendConfig.account_id,main:join(repo,'backend/tools/browser-site/worker.mjs'),compatibility_date:'2026-10-10',workers_dev:true,preview_urls:false,
    observability:{enabled:true,head_sampling_rate:1},vars:{TEST_SITE_ORIGIN:siteOrigin},
    services:[{binding:'TEST_API',service:input.workerName}],
    assets:{directory:assets,binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'}};
  writeFileSync(join(directory,'wrangler.site.json'),JSON.stringify(config,null,2),{mode:0o600,flag:'wx'});
  const browserBackend={...backendConfig,vars:{...backendConfig.vars,ALLOWED_ORIGINS:siteOrigin}};
  writeFileSync(join(directory,'wrangler.backend-test.json'),JSON.stringify(browserBackend,null,2),{mode:0o600,flag:'wx'});
  writeFileSync(join(directory,'asset-manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  return {syntheticOnly:true,siteName,siteOrigin,backendWorker:input.workerName,assetFiles:manifest.length,assetBytes:manifest.reduce((sum,f)=>sum+f.bytes,0),mainDatabaseChanged:false};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const args=process.argv.slice(2);if(args.length%2)throw Error('EXPECTED_FLAG_VALUE_PAIRS');
    const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[2*i],args[2*i+1]]));
    const result=prepareBrowserSite({repo:process.cwd(),directory:options['--directory'],siteName:options['--site-name'],siteOrigin:options['--site-origin'],
      input:JSON.parse(readFileSync(options['--input'],'utf8')),backendConfig:JSON.parse(readFileSync(options['--backend-config'],'utf8'))});
    console.log(JSON.stringify(result));
  }catch(error){console.error(JSON.stringify({error:error.message,mainDatabaseChanged:false}));process.exitCode=1;}
}
