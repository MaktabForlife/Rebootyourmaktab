import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateHostedCoreTarget} from './academy-d1-hosted-core.mjs';

const stages=['check','login','session','home'];
const distribution=values=>{
  values=[...values].sort((a,b)=>a-b);
  return Object.fromEntries([['p50',.5],['p95',.95],['p99',.99],['max',1]].map(([name,p])=>[name,Number((values[Math.ceil(values.length*p)-1]||0).toFixed(2))]));
};
export async function exercisePeak(origin,input,{counts=[100,200]}={}) {
  validateHostedCoreTarget(input);const url=new URL(origin);
  if(url.protocol!=='https:'||url.username||url.password||url.hostname.split('.')[0]!==input.workerName||!url.hostname.endsWith('.workers.dev')||url.pathname!=='/')throw Error('DEDICATED_TEST_ORIGIN_REQUIRED');
  if(input.syntheticOnly!==true||input.fixture!=='peak'||input.accounts?.length!==200||counts.some(n=>![100,200].includes(n)))throw Error('PEAK_SYNTHETIC_FIXTURE_REQUIRED');
  const flow=async account=>{
    const at=performance.now(),measurements={};let token='',stage='check';
    try {
      for(const [name,path,body] of [
        ['check','/api/account/check',{uniqueid:account.login}],['login','/api/account/login',{uniqueid:account.login,pin:'1234'}],
        ['session','/api/account/session',{}],['home','/api/academy/entrance',{startDate:'2026-10-01'}]]) {
        stage=name;const start=performance.now(),response=await fetch(new URL(path,url),{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)}),data=await response.json();
        const numeric=name=>{const value=response.headers.get(name);return value===null?null:Number(value);};
        const timing=name=>Number(new RegExp('(?:^|, )'+name+';dur=([0-9.]+)').exec(response.headers.get('Server-Timing')||'')?.[1]||0);
        measurements[name]={clientMs:performance.now()-start,workerMs:timing('worker'),databaseMs:timing('d1'),calls:numeric('X-Test-D1-Calls'),statements:numeric('X-Test-D1-Statements')};
        if(response.status!==200||!data.success)throw Object.assign(Error('FLOW_FAILED'),{status:response.status,code:data.code});
        if(measurements[name].calls===null||measurements[name].statements===null)throw Error('TEST_PROFILING_REQUIRED');
        if(name==='login'){token=data.token;if(data.sessionStore!=='D1')throw Error('WRONG_SESSION_STORE');}
        if(name==='home'&&(!data.signedIn||data.sessionStore!=='D1'||JSON.stringify(data).includes('zoom.us')||JSON.stringify(data).includes('pin_hash')))throw Error('PRIVACY_FAILED');
      }
      return {success:true,milliseconds:performance.now()-at,measurements};
    }catch(error){return {success:false,stage,status:error.status||0,code:error.code||error.message,milliseconds:performance.now()-at,measurements};}
  };
  const summarize=flows=>({succeeded:flows.filter(f=>f.success).length,failed:flows.filter(f=>!f.success).length,flowLatencyMs:distribution(flows.map(f=>f.milliseconds)),
    stages:Object.fromEntries(stages.map(stage=>[stage,Object.fromEntries(['clientMs','workerMs','databaseMs','calls','statements'].map(metric=>[metric,distribution(flows.map(f=>f.measurements[stage]?.[metric]).filter(v=>v!=null))]))])),
    failures:flows.filter(f=>!f.success).map(({measurements,milliseconds,...rest})=>rest)});
  const sequential=[];for(const account of input.accounts.slice(-3))sequential.push(await flow(account));
  const report={runtime:'HOSTED_CLOUDFLARE_WORKERS_D1',syntheticOnly:true,fixture:'5 Programs, 2 Courses, 200 accounts, shared first-Program lesson',
    client:'Node fetch from one workspace; includes network; not distributed browsers',checkedAt:new Date().toISOString(),sequential:summarize(sequential),bursts:{},mainDatabaseChanged:false};
  for(const count of counts)report.bursts[count]=summarize(await Promise.all(input.accounts.slice(0,count).map(flow)));
  return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const [origin,inputPath,reportPath]=process.argv.slice(2),report=await exercisePeak(origin,JSON.parse(readFileSync(inputPath,'utf8')));
  writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));
  if(report.sequential.failed||Object.values(report.bursts).some(r=>r.failed))process.exitCode=1;
}
