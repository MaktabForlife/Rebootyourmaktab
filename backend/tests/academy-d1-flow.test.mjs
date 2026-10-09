import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {createSessionToken,hashPin,isSaltedPinHash} from '../src/lib/auth.js';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import {compareSnapshotFlow} from '../tools/academy-d1-parity.mjs';
import {readFileSync} from 'node:fs';

async function call(env,path,body={},token='',extra={}) {
  const r=await worker.fetch(new Request(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...extra},body:JSON.stringify(body)}),env);
  return {status:r.status,body:await r.json(),headers:r.headers};
}
const login=(env,id='0002')=>call(env,'/api/account/login',{uniqueid:`login-${id}`,pin:'1234'});
const use=async fn=>{const f=await fixtureDatabase();try{await fn(f);}finally{f.db.close();}};

test('login, session, context switching and home use D1 and keep private links gated',()=>use(async({env,db,queries})=>{
  const check=await call(env,'/api/account/check',{uniqueid:'LOGIN-0002'});assert.equal(check.status,200);assert.equal(check.body.account.pinsetup,true);
  const signed=await login(env);assert.equal(signed.status,200);assert.ok(signed.body.token);assert.equal(signed.body.context.role,'STUDENT');
  const session=await call(env,'/api/account/session',{},signed.body.token);assert.equal(session.status,200);assert.ok(!session.body.token);
  const home=await call(env,'/api/academy/entrance',{startDate:'2026-10-09'},signed.body.token);assert.equal(home.status,200);assert.equal(home.body.signedIn,true);assert.ok(home.body.personalTimetable.length);
  assert.ok(!JSON.stringify(home.body).includes('pin_hash'));assert.ok(!JSON.stringify(home.body).includes('zoom.us'));
  assert.ok(queries.filter(q=>/FROM accounts a JOIN account_credentials/.test(q)).every(q=>/WHERE a\.(account_id|login_link_id)=\?/.test(q)));
  assert.equal(db.prepare("SELECT count(*) AS n FROM role_assignments WHERE role='PROGRAM_ADMIN'").get().n,0);
  const switched=await call(env,'/api/account/switch-context',{scope:'GLOBAL',role:'STUDENT'},signed.body.token);assert.equal(switched.status,200);
  assert.equal((await call(env,'/api/account/session',{},signed.body.token)).status,401);
  assert.equal((await call(env,'/api/account/session',{},switched.body.token)).status,200);
  await call(env,'/api/account/logout',{},switched.body.token);assert.equal((await call(env,'/api/account/session',{},switched.body.token)).status,401);
}));

test('pending roles stay ineffective; legacy Admin/Senior remains scoped and a rejected review ends that context',()=>use(async({env,db})=>{
  const pending=await login(env,'0006');assert.equal(pending.body.context.scope,'GLOBAL');
  const senior=await login(env,'0005');assert.equal(senior.body.context.role,'SENIOR');
  assert.equal((await call(env,'/api/academy/d1/accounts/read',{accountId:'account-0002'},senior.body.token)).status,403);
  db.prepare("UPDATE role_import_reviews SET status='REJECTED',reviewed_by_account_id='account-0001',reviewed_at='2026-10-09' WHERE account_id='account-0005'").run();
  assert.equal((await call(env,'/api/account/session',{},senior.body.token)).status,401);
}));

test('PIN reset, setup, credential upgrades and account edits never write to Sheets',()=>use(async({env,db})=>{
  const admin=await login(env,'0001'),student=await login(env);
  const detail=await call(env,'/api/academy/d1/accounts/read',{accountId:'account-0002'},admin.body.token);
  const epoch=detail.body.account.credentialEpoch;
  assert.equal((await call(env,'/api/academy/d1/accounts/reset-pin',{accountId:'account-0002',credentialEpoch:epoch},admin.body.token)).status,200);
  assert.equal((await call(env,'/api/account/session',{},student.body.token)).status,401);
  const setup=await call(env,'/api/account/setup-pin',{uniqueid:'login-0002',pin:'1234',pinConfirmation:'1234'});assert.equal(setup.status,200);
  assert.equal((await call(env,'/api/account/setup-pin',{uniqueid:'login-0002',pin:'1234',pinConfirmation:'1234'})).status,409);
  const row=db.prepare("SELECT * FROM accounts WHERE account_id='account-0002'").get();
  assert.equal((await call(env,'/api/academy/d1/accounts/update',{accountId:row.account_id,displayName:'New synthetic name',active:false,revision:row.revision},admin.body.token)).status,200);
  assert.equal((await call(env,'/api/account/session',{},setup.body.token)).status,401);
  assert.equal((await call(env,'/api/academy/d1/accounts/update',{accountId:row.account_id,displayName:'New synthetic name',active:true,revision:row.revision+1},admin.body.token)).status,200);
  assert.equal((await call(env,'/api/account/session',{},setup.body.token)).status,401);
  db.prepare("UPDATE account_credentials SET pin_hash=? WHERE account_id='account-0003'").run(await hashPin('1234',env.PIN_SECRET));
  assert.equal((await login(env,'0003')).status,200);assert.ok(isSaltedPinHash(db.prepare("SELECT pin_hash FROM account_credentials WHERE account_id='account-0003'").get().pin_hash));
  const audit=JSON.stringify(db.prepare("SELECT changed_fields_json FROM audit_events").all());assert.ok(!audit.includes('pbkdf2'));assert.ok(!audit.includes('1234'));
}));

test('concurrent PIN setup and stale profile changes cannot overwrite a newer account',()=>use(async({env,db})=>{
  db.prepare("UPDATE account_credentials SET pin_hash='',pin_setup=0 WHERE account_id='account-0002'").run();
  const body={uniqueid:'login-0002',pin:'1234',pinConfirmation:'1234'};
  const results=await Promise.all([call(env,'/api/account/setup-pin',body),call(env,'/api/account/setup-pin',body)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM audit_events WHERE action='ACCOUNT_PIN_SETUP_SELF'").get().n,1);
  const admin=await login(env,'0001');const body2={accountId:'account-0002',displayName:'First synthetic name',active:true,revision:1};
  assert.equal((await call(env,'/api/academy/d1/accounts/update',body2,admin.body.token)).status,200);
  assert.equal((await call(env,'/api/academy/d1/accounts/update',{...body2,displayName:'Stale name'},admin.body.token)).status,409);
}));

test('incorrect PIN, throttling, invalid sessions and unavailable D1 remain distinct',()=>use(async({env})=>{
  assert.equal((await call(env,'/api/account/login',{uniqueid:'login-0002',pin:'9999'})).body.code,'INCORRECT_PIN');
  for(let i=0;i<4;i++)await login(env);
  const limited=await login(env);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
  const oldToken=await createSessionToken({type:'account',accountid:'account-0002',scope:'GLOBAL',role:'STUDENT'},env);
  assert.equal((await call(env,'/api/account/session',{},oldToken)).status,401);
  const fail={...env,ACADEMY_DB:{withSession:()=>{throw Error('PRIVATE_DATABASE_DETAILS');}}};
  const r=await call(fail,'/api/account/login',{uniqueid:'login-0003',pin:'1234'});assert.equal(r.status,503);assert.ok(!JSON.stringify(r.body).includes('PRIVATE_DATABASE_DETAILS'));
  assert.equal((await call({...env,ENVIRONMENT:'production'},'/api/account/check',{uniqueid:'login-0002'})).status,503);
  assert.equal((await call(env,'/api/account/check',{uniqueid:'login-0002'},'',{Origin:'https://untrusted.invalid'})).status,403);
  const admin=await login(env,'0001');
  const unsupported=await call(env,'/api/unmigrated-operation',{},admin.body.token);
  assert.equal(unsupported.status,501);assert.equal(unsupported.body.code,'OPERATION_NOT_MIGRATED');assert.equal(unsupported.body.retryable,false);
}));

test('session checks use current permissions, account state and credential epochs',()=>use(async({env,db})=>{
  const first=await login(env);db.prepare("UPDATE role_assignments SET active=0 WHERE account_id='account-0002'").run();
  assert.equal((await call(env,'/api/account/session',{},first.body.token)).status,401);
  const second=await login(env);db.prepare("UPDATE account_credentials SET credential_epoch=credential_epoch+1 WHERE account_id='account-0002'").run();
  assert.equal((await call(env,'/api/account/session',{},second.body.token)).status,401);
  const third=await login(env);db.prepare("UPDATE account_sessions SET expires_at='2000-01-02',created_at='2000-01-01'").run();
  assert.equal((await call(env,'/api/account/session',{},third.body.token)).status,401);
}));

test('credential changes and their audits roll back together on storage failure',()=>use(async({env,db})=>{
  const repository=academyD1Repository(env),state=await repository.byId('account-0002');
  db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  await assert.rejects(repository.setCredential(state,'','ACCOUNT_PIN_RESET','account-0001'));
  const after=db.prepare("SELECT pin_hash,credential_epoch FROM account_credentials WHERE account_id='account-0002'").get();
  assert.equal(after.pin_hash,state.account.pin_hash);assert.equal(after.credential_epoch,state.account.credential_epoch);
}));

test('a Course current publication remains resolvable after its effective window has passed',async()=>{
  const {setCell}=await import('./fixtures/academy-d1-fixture.mjs');
  const f=await fixtureDatabase(12,s=>setCell(s,'GlobalTimetablePublications',1,'PublishEndDate','2026-09-30'));
  try {
    const r=await call(f.env,'/api/academy/entrance',{startDate:'2026-10-09'});
    assert.equal(r.status,200);assert.ok(!r.body.warnings.some(w=>w.includes('Synthetic subject timetable')));
  }finally{f.db.close();}
});

test('derived Course schedules retain immutable labels and recurrence after import',async()=>{
  const {setCell}=await import('./fixtures/academy-d1-fixture.mjs');
  const f=await fixtureDatabase(12,s=>{
    setCell(s,'GlobalTimetablePublications',1,'ScheduleMode','DERIVED');
    setCell(s,'GlobalTimetablePublications',1,'ScheduleDefinition',JSON.stringify([{rulekey:'RULE-derived',days:['FRI'],starttime:'10:00',endtime:'11:00',moduleid:'module-1',teacheraccountid:'account-0003',modulename:'Published synthetic module',teachername:'Published synthetic teacher',zoomlink:'https://zoom.us/j/11111111111'}]));
  });
  try {
    const signed=await login(f.env,'0003');
    const response=await call(f.env,'/api/academy/entrance',{id:'subject-1',startDate:'2026-10-09'},signed.body.token);
    assert.equal(response.status,200);assert.ok(response.body.activity.timetable.some(e=>e.moduleName==='Published synthetic module'));
    assert.ok(!response.body.warnings.some(w=>w.includes('Synthetic subject timetable')));
  }finally{f.db.close();}
});

test('the snapshot comparison checks every active account context and every public and signed-in activity',async()=>{
  const {flowFixture}=await import('./fixtures/academy-d1-fixture.mjs');
  const {snapshot,policy}=await flowFixture(12),report=await compareSnapshotFlow(snapshot,policy);
  assert.equal(report.accountsChecked,12);assert.equal(report.contextsChecked,23);
  assert.equal(report.activitiesChecked,3);assert.equal(report.clockScenarios,2);assert.equal(report.pageComparisons,192);
});

test('the application entrypoint keeps rehearsals isolated and fails closed on an invalid mode',()=>use(async({env,db})=>{
  const originalFetch=globalThis.fetch;
  let outbound=0;
  globalThis.fetch=async()=>{outbound++;throw Error('Sheets must not be contacted');};
  try {
    const admin=await login(env,'0001');assert.equal(admin.body.sessionStore,'D1');
    assert.equal((await call({...env,ACADEMY_D1_MODE:'OFF'},'/api/account/session',{},admin.body.token)).status,401);
    const unmigrated=await call(env,'/api/admin/platform/programs/create',{name:'Blocked'},admin.body.token);
    assert.equal(unmigrated.status,501);
    assert.equal((await call({...env,ACADEMY_D1_MODE:'TYPO'},'/api/account/check',{uniqueid:'login-0002'})).body.code,'ACADEMY_STORAGE_MODE_INVALID');
    assert.equal((await call({...env,ACADEMY_DB:undefined},'/api/account/check',{uniqueid:'login-0002'})).status,503);
    const before=db.prepare('SELECT count(*) AS n FROM account_sessions').get().n;
    assert.equal((await login({...env,SESSION_SECRET:''})).status,503);
    assert.equal(db.prepare('SELECT count(*) AS n FROM account_sessions').get().n,before);
    db.exec("UPDATE data_ownership SET phase='RECOVERY'");
    assert.equal((await login(env)).status,503);
    assert.equal(outbound,0);
    const regular=await worker.fetch(new Request('http://localhost/'),{ACADEMY_D1_MODE:'OFF'});
    assert.equal((await regular.json()).service,'rebootworker');
  }finally{globalThis.fetch=originalFetch;}
}));

test('only the current development Worker configuration binds the main Academy database',()=>{
  const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.equal(config.d1_databases,undefined);
  assert.equal(config.env.development.name,'devrebootworker');
  assert.deepEqual(config.env.development.d1_databases,[{binding:'ACADEMY_DB',database_name:'maktab-academy',database_id:'7e732b79-a72f-4da6-be83-524919c49ba4',migrations_dir:'migrations/academy'}]);
  assert.equal(config.env.development.vars,undefined);
});
