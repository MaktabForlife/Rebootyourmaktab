#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {flowFixture} from '../tests/fixtures/academy-d1-fixture.mjs';
import {buildOperationalImport,importOperationalPlan,operationalSQL,migrations} from './academy-migration/operational.mjs';
import {buildCourseCalendarImport,courseCalendarSQL} from './academy-migration/course-calendar.mjs';
import {buildLearningImport,learningSQL} from './academy-migration/learning.mjs';
import {withLearningSource,subject,moduleId} from '../tests/fixtures/academy-d1-learning-fixture.mjs';
import {WEEKLY_SCHEMA,programToday} from '../src/programs/weekly-timetable.js';

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
  const {snapshot,policy}=await flowFixture(200);withLearningSource(snapshot);
  const plan=await buildOperationalImport(snapshot,policy),learning=buildLearningImport(snapshot,plan),courseCalendar=buildCourseCalendarImport(snapshot,plan);
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
  run(resolve('backend/migrations/academy/0004_management_transactions.sql'),'MANAGEMENT_RUNTIME_EXTENSION');
  run(resolve('backend/migrations/academy/0005_learning_workflows.sql'),'LEARNING_RUNTIME_EXTENSION');
  run(save('synthetic-learning.sql',learningSQL(learning)),'LEARNING_IMPORT');
  run(resolve('backend/migrations/academy/0006_course_calendar_workflows.sql'),'COURSE_CALENDAR_EXTENSION');
  run(save('synthetic-course-calendar.sql',courseCalendarSQL(courseCalendar)),'COURSE_CALENDAR_IMPORT');
  const bundle=join(directory,'worker.js');
  await build({entryPoints:['backend/src/worker-runtime.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers'],outfile:bundle,logLevel:'silent'});
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
  step='MANAGEMENT_SMOKE';
  const profiles='/api/admin/platform/user-profiles/',programs='/api/admin/platform/programs/',management='/api/admin/platform/program-timetable/';
  const registry=ensure(await post(programs+'list',{},admin)),program=registry.programs[0];
  const view=ensure(await post(management+'manage-get',{id:program.id},admin));
  const input={id:program.id,kind:'classes',record:{...view.rows.classes[0],Name:'Runtime updated class'},creating:false,baseRowRevision:view.rowRevisions.classes[view.rows.classes[0].ClassID],operationId:crypto.randomUUID()};
  const edits=await Promise.all(['First','Second'].map(name=>post(management+'manage-save',{...input,record:{...input.record,Name:name},operationId:crypto.randomUUID()},admin)));
  if(edits.map(r=>r.status).sort().join(',')!=='200,409')throw Error('Management concurrency guard failed');
  const current=ensure(await post(management+'manage-get',{id:program.id},admin));
  input.baseRowRevision=current.rowRevisions.classes[input.record.ClassID];
  ensure(await post(management+'manage-save',input,admin));
  if(!ensure(await post(management+'manage-save',input,admin)).replayed)throw Error('Management replay failed');
  const profilesView=ensure(await post(profiles+'get',{},admin)),accountId=crypto.randomUUID();
  ensure(await post(profiles+'save',{mode:'profile',accountId,displayName:'Runtime new learner',active:true,creating:true,baseRevision:profilesView.emptyRevision,operationId:crypto.randomUUID()},admin));
  const next=ensure(await post(profiles+'get',{},admin)),scope=next.scopes.find(s=>s.id===program.id),assignment=next.accounts.find(a=>a.accountId===accountId).assignments.find(a=>a.scopeId===program.id);
  ensure(await post(profiles+'save',{mode:'matrix-roles',accountId,scopeType:'PROGRAM',scopeId:program.id,roles:['STUDENT'],baseRevision:assignment.revision,scopeRevision:scope.revision,operationId:crypto.randomUUID()},admin));
  const classes=ensure(await post(management+'manage-get',{id:program.id},admin));
  const enrollment={id:program.id,kind:'student-classes',changes:[{AccountID:accountId,ClassID:input.record.ClassID,baseRowRevision:classes.studentClassRevisions[accountId]}],operationId:crypto.randomUUID()};
  ensure(await post(management+'manage-save',enrollment,admin));
  if(!ensure(await post(management+'manage-save',enrollment,admin)).replayed)throw Error('Enrollment replay failed');
  const membership=await db.prepare('SELECT count(*) AS n FROM class_memberships WHERE account_id=? AND active=1').bind(accountId).first();
  if(membership.n!==1)throw Error('Enrollment duplicated');
  ensure(await post(profiles+'get',{},tokens[2]),403);
  step='LEARNING_SMOKE';
  const today=programToday('Africa/Johannesburg'),scopedAdmin=tokens[3],teacher=tokens[2];
  const timetable=ensure(await post(management+'get',{id:program.id},scopedAdmin));
  const draft={format:WEEKLY_SCHEMA,timezone:'Africa/Johannesburg',rules:[{id:'RULE-runtime-learning',programSubjectId:subject,moduleId,teacherId:'account-0003',classIds:[input.record.ClassID],weekdays:[0,1,2,3,4,5,6],startTime:'10:00',endTime:'11:00',zoomLink:''}]};
  const publication={id:program.id,revision:timetable.revision,draft,effectiveFrom:today,operationId:crypto.randomUUID()};
  ensure(await post(management+'publish',publication,scopedAdmin));
  if(!ensure(await post(management+'publish',publication,scopedAdmin)).replayed)throw Error('Publication replay failed');
  const attendance='/api/program-attendance/',register=ensure(await post(attendance+'get',{id:program.id,date:today},teacher));
  if(register.lessons.length!==1||register.complete)throw Error('Attendance roster failed');
  const submit={id:program.id,date:today,scope:'day',exceptions:{},baseRegisterIds:{},operationId:crypto.randomUUID()};
  ensure(await post(attendance+'submit',submit,teacher));
  if(!ensure(await post(attendance+'submit',submit,teacher)).replayed)throw Error('Attendance replay failed');
  if(!ensure(await post(attendance+'get',{id:program.id,date:today},teacher)).complete)throw Error('Attendance completion failed');
  const catalogue=ensure(await post('/api/academy/library/catalogue',{},tokens[13]));
  if(catalogue.resources.length!==1||JSON.stringify(catalogue).includes('synthetic_file_1'))throw Error('Library catalogue privacy failed');
  ensure(await post('/api/admin/platform/program-library/manage',{id:program.id},teacher),403);
  ensure(await post('/api/admin/platform/program-library/manage',{id:program.id},scopedAdmin));
  const learningReadResults=await Promise.all(tokens.filter((_,i)=>![1,7,10,11].includes(i)).map(async token=>{
    const response=await post('/api/academy/library/catalogue',{},token);ensure(response);return response.status;
  }));
  if((await db.prepare('SELECT count(*) AS n FROM attendance_marks').first()).n<90)throw Error('Large attendance batch failed');
  step='COURSE_CALENDAR_SMOKE';
  const courses='/api/admin/platform/global/',calendar='/api/admin/platform/calendar/';
  let courseView=ensure(await post(courses+'delivery/get',{},admin));
  const courseSave={subjectId:'subject-1',runName:'Runtime course',startDate:'2026-10-10',endDate:'2026-10-17',active:true,accessModel:'PAID',scheduleMode:'DERIVED',
    scheduleDefinition:[{rulekey:'runtime-course-rule',days:['MON','TUE','WED','THU','FRI','SAT','SUN'],starttime:'12:00',endtime:'13:00',moduleid:'module-1',teacheraccountid:'account-0003',zoomlink:''}],workflowRevision:courseView.workflowRevision,operationId:crypto.randomUUID()};
  courseView=ensure(await post(courses+'run/save',courseSave,admin));
  const coursePublish={runId:courseView.run.runid,workflowRevision:courseView.workflowRevision,operationId:crypto.randomUUID()};
  const coursePublication=ensure(await post(courses+'timetable/publish',coursePublish,admin));
  if(!ensure(await post(courses+'timetable/publish',coursePublish,admin)).replayed)throw Error('Course publication replay failed');
  const courseHome=ensure(await post('/api/academy/entrance',{startDate:'2026-10-10'},tokens[13]));
  if(courseHome.personalTimetable.some(s=>s.offeringId===courseView.run.runid))throw Error('Paid Course leaked through free subject');
  const calendarView=ensure(await post(calendar+'get',{year:2026},admin));
  const calendarChanges=['First','Second'].map(description=>post(calendar+'batch-save',{changes:[{eventType:'TERM',description,startDate:'2026-10-10',endDate:'2026-10-17',active:true}],workflowRevision:calendarView.workflowRevision,operationId:crypto.randomUUID()},admin));
  const calendarResults=await Promise.all(calendarChanges);
  if(calendarResults.map(r=>r.status).sort().join(',')!=='200,409')throw Error('Calendar concurrency guard failed');
  ensure(await post(courses+'timetable/get',{},scopedAdmin),403);
  const publishedCourseCount=await db.prepare('SELECT count(*) AS n FROM published_lessons WHERE publication_id=?').bind(coursePublication.publication.publicationid).first();
  if(publishedCourseCount.n!==8)throw Error('Normalized Course publication failed');
  if((await db.prepare('SELECT count(*) AS n FROM academy_write_guards').first()).n!==0)throw Error('Management guard left behind');
  if(outboundRequests!==0)throw Error('Unexpected external request');
  const report={success:true,runtime:'LOCAL_WORKERS_D1',workerEntrypoint:'backend/src/worker-runtime.js',compatibilityDate,syntheticAccounts:true,...burst,securitySmokeChecks:'PASS',externalRequests:outboundRequests,
    managementSmokeChecks:'PASS',learningSmokeChecks:'PASS',courseCalendarSmokeChecks:'PASS',simultaneousLibraryReads:learningReadResults.length,cloudPerformanceMeasured:false,cutoverReady:false};
  save('report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({step:'COMPLETE',...report,privateReport:join(directory,'report.json')}));
}catch(error){console.error(JSON.stringify({success:false,step,code:'LOCAL_D1_FLOW_REHEARSAL_FAILED',status:error.status || null,message:error.message}));process.exitCode=1;}
finally{if(mf)await mf.dispose().catch(()=>{process.exitCode=1;});}
