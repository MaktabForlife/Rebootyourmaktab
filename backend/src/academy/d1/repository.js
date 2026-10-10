import { authorityRank, normalizePlatformIdentifier as key } from '../../lib/platform-schema.js';
import {CORE_ACTIVATION_CHECKS,newActivityOwnership} from './activation-policy.js';

export const rehearsalError = (message, status=503, code='ACADEMY_D1_UNAVAILABLE') => Object.assign(new Error(message), {status,code});
const publicAccount = row => ({AccountID:row.account_id,DisplayName:row.display_name,UniqueID:row.login_link_id,Active:Boolean(row.active),PlatformRole:row.global_admin?'GLOBAL_ADMIN':''});

// One primary-anchored session per HTTP request. Never cache account permissions,
// credentials or database handles in module-level request state.
export function academyD1Repository(env) {
  if (!['local','development'].includes(env.ENVIRONMENT) || !['REHEARSAL','ACTIVE'].includes(env.ACADEMY_D1_MODE) || !env.ACADEMY_DB)
    throw rehearsalError('Academy database rehearsal is not enabled.');
  if(env.ACADEMY_D1_MODE==='ACTIVE'&&(!String(env.ACADEMY_D1_RUN_ID||'').trim()||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY'))
    throw rehearsalError('Academy activation configuration is incomplete.',503,'ACTIVATION_REQUIRED');
  const db=env.ACADEMY_DB.withSession('first-primary');
  const prepare=(sql,...values)=>db.prepare(sql).bind(...values);
  let schemas,activation;
  async function schemaNames(){
    schemas??=prepare("SELECT name FROM sqlite_schema WHERE name IN ('role_mapping_decisions','effective_course_subscriptions') AND type IN ('table','view')").all();
    return (await schemas).results.map(r=>r.name);
  }
  async function subscriptionSource(){
    return (await schemaNames()).includes('effective_course_subscriptions')?'effective_course_subscriptions':"(SELECT account_id,activity_key FROM legacy_access_evidence WHERE source_role='LEGACY_SUBSCRIPTION' AND source_effective=1)";
  }
  const accountSQL=`SELECT a.*,c.pin_hash,c.pin_setup,c.credential_epoch,
    EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') AS global_admin
    FROM accounts a JOIN account_credentials c ON c.account_id=a.account_id`;
  async function stateFor(where,values) {
    const mapped=(await schemaNames()).includes('role_mapping_decisions');
    const subscriptionsTable=await subscriptionSource();
    const target=`(SELECT a.account_id FROM accounts a JOIN account_credentials c USING(account_id) WHERE ${where})`;
    const results=await db.batch([
      prepare(`${accountSQL} WHERE ${where}`,...values),
      prepare(`SELECT a.*,cs.legacy_access_model FROM activities a LEFT JOIN course_settings cs USING(activity_key)
        WHERE a.active=1 AND a.lifecycle='ACTIVE' AND a.kind IN ('PROGRAM','COURSE')`),
      prepare(`SELECT r.activity_key,r.role FROM effective_activity_roles r JOIN activities a USING(activity_key)
        WHERE r.account_id=${target} AND a.active=1 AND a.lifecycle='ACTIVE'
        UNION SELECT e.activity_key,${mapped?'m.target_role':'e.source_role'} AS role FROM legacy_access_evidence e
        JOIN activities a USING(activity_key) JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role
        ${mapped?'JOIN role_mapping_decisions m ON m.source_role=e.source_role':''}
        WHERE e.account_id=${target} AND e.source_role IN ('ADMIN','SENIOR') AND e.source_effective=1 AND v.status='REQUIRED' AND a.active=1 AND a.lifecycle='ACTIVE'`,...values,...values),
      prepare(`SELECT activity_key FROM ${subscriptionsTable} WHERE account_id=${target}`,...values)
    ]);
    const [accounts,activities,roles,subscriptions]=results.map(r=>r.results),account=accounts[0];
    if(!account)return null;
    const contexts=[];
    if(account.global_admin)contexts.push({scope:'PLATFORM',courseId:'',courseName:'M4L Platform',role:'GLOBAL_ADMIN'});
    for(const activity of activities.filter(a=>a.kind==='PROGRAM')) {
      if(account.global_admin)continue;
      const assigned=roles.filter(r=>key(r.activity_key)===key(activity.activity_key)).map(r=>r.role);
      // Mapping requires the explicit owner-approved decision records. Older
      // three-migration imports keep their original isolated compatibility view.
      for(const role of [...new Set(assigned)].filter(r=>['PROGRAM_ADMIN','ADMIN','SENIOR','TEACHER','STUDENT'].includes(r)))
        contexts.push({scope:'COURSE',courseId:activity.activity_id,courseName:activity.name,role,programLibrary:true});
    }
    if(!account.global_admin)for(const activity of activities.filter(a=>a.kind==='COURSE')) {
      for(const role of [...new Set(roles.filter(r=>key(r.activity_key)===key(activity.activity_key)).map(r=>r.role))].filter(r=>['PROGRAM_ADMIN','TEACHER','STUDENT'].includes(r)))
        contexts.push({scope:'GLOBAL',courseId:activity.activity_id,courseName:activity.name,role,activityKind:'COURSE'});
    }
    const rank=role=>role==='PROGRAM_ADMIN'?1:authorityRank(role);
    contexts.sort((a,b)=>rank(a.role)-rank(b.role)||a.courseName.localeCompare(b.courseName)||a.role.localeCompare(b.role));
    if(!account.global_admin&&activities.some(a=>a.kind==='COURSE'&&(a.legacy_access_model==='FREE'||subscriptions.some(s=>key(s.activity_key)===key(a.activity_key)))))
      contexts.push({scope:'GLOBAL',courseId:'',courseName:'Global Subjects',role:'STUDENT'});
    return {account,activities,roles,subscriptions,contexts};
  }
  function audit(actor,target,action,fields,conditional=false) {
    return prepare(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json)
      SELECT ?,?,?,?,?,?,?,?,? ${conditional?'WHERE changes()=1':''}`,crypto.randomUUID(),new Date().toISOString(),actor,env.ACADEMY_D1_MODE==='ACTIVE'?'D1_ACCOUNT':'D1_REHEARSAL','ACADEMY',action,'USER_ACCOUNT',target,JSON.stringify(fields));
  }
  return {
    db,
    ownershipForNewActivity:activity=>newActivityOwnership(activity,env),
    subscriptionSource,
    publicAccount,
    async homeConfiguration(){
      if(activation)return {setting_value:activation.timezone,courseWorkflows:true};
      return prepare("SELECT setting_value FROM academy_settings WHERE setting_key='PlatformTimezone'").first();
    },
    async ready(){
      if(env.ACADEMY_D1_MODE==='ACTIVE') {
        // WHERE 0 validates that required schema objects compile without scanning
        // sqlite_schema or subscription rows. All live ownership/evidence guards remain.
        const result=await prepare(`SELECT m.run_id,
          1 AS mapped_roles,
          (SELECT setting_value FROM academy_settings WHERE setting_key='PlatformTimezone') AS timezone FROM migration_runs m
          JOIN learning_imports l ON l.base_run_id=m.run_id AND l.singleton=1 AND l.source_sha256=m.source_snapshot_sha256
          JOIN course_workflow_imports c ON c.base_run_id=m.run_id AND c.singleton=1 AND c.source_sha256=m.source_snapshot_sha256
          WHERE m.run_id=? AND m.state='CUTOVER' AND m.environment IN ('LOCAL','DEVELOPMENT')
            AND EXISTS(SELECT 1 FROM academy_write_state WHERE singleton=1)
            AND (SELECT count(*) FROM role_mapping_decisions WHERE 0)=0
            AND (SELECT count(*) FROM effective_course_subscriptions WHERE 0)=0
            AND (SELECT count(*) FROM migration_checks WHERE run_id=m.run_id AND dataset_key='ACTIVATION' AND scope_key='ACADEMY'
              AND check_name IN (SELECT value FROM json_each(?)) AND status='PASS' AND findings_count=0 AND checked_at IS NOT NULL)=?
            AND NOT EXISTS(SELECT 1 FROM migration_checks WHERE run_id=m.run_id AND status='FAIL')
            AND EXISTS(SELECT 1 FROM activities)
            AND NOT EXISTS(SELECT 1 FROM activities a LEFT JOIN data_ownership o ON o.dataset_key='ACADEMY' AND o.scope_key=a.activity_key
              WHERE o.scope_key IS NULL OR o.authoritative_store<>'D1' OR o.phase<>'ACTIVE' OR o.verified_run_id<>m.run_id OR o.switched_at IS NULL)
            AND NOT EXISTS(SELECT 1 FROM data_ownership o WHERE o.dataset_key='ACADEMY' AND
              (o.authoritative_store<>'D1' OR o.phase<>'ACTIVE' OR o.verified_run_id<>m.run_id OR o.switched_at IS NULL))`,
          env.ACADEMY_D1_RUN_ID,JSON.stringify(CORE_ACTIVATION_CHECKS),CORE_ACTIVATION_CHECKS.length).first();
        if(!result)throw rehearsalError('Academy activation has not been verified.',503,'ACTIVATION_REQUIRED');
        // Reuse only facts verified in THIS request. Never retain readiness,
        // account permissions or subscriptions across requests.
        activation=result;
        schemas=Promise.resolve({results:[...(result.mapped_roles?[{name:'role_mapping_decisions'}]:[]),{name:'effective_course_subscriptions'}]});
        return;
      }
      const result=await prepare(`SELECT run_id FROM migration_runs WHERE state='IMPORTED' AND environment IN ('LOCAL','DEVELOPMENT')
        AND NOT EXISTS (SELECT 1 FROM activities a LEFT JOIN data_ownership o
          ON o.dataset_key='ACADEMY' AND o.scope_key=a.activity_key
          WHERE a.active=1 AND (o.scope_key IS NULL OR o.authoritative_store<>'SHEETS' OR o.phase<>'STAGING'))`).first();
      if(!result)throw rehearsalError('A development import is required.');
    },
    async accountByLogin(login){const account=await prepare(`${accountSQL} WHERE a.login_link_id=? COLLATE NOCASE`,login).first();return account?{account}:null;},
    async byLogin(login){return stateFor('a.login_link_id=? COLLATE NOCASE',[login]);},
    async byId(accountId){return stateFor('a.account_id=? COLLATE NOCASE',[accountId]);},
    async createSession(state,context,now=new Date()) {
      const sid=crypto.randomUUID(),created=now.toISOString(),expires=new Date(now.getTime()+7*86400000).toISOString();
      const result=await db.batch([
        prepare(`UPDATE accounts SET last_login_at=? WHERE account_id=? AND active=1 AND EXISTS(SELECT 1 FROM account_credentials WHERE account_id=? AND credential_epoch=?)`,created,state.account.account_id,state.account.account_id,state.account.credential_epoch),
        prepare(`INSERT INTO account_sessions(session_id,account_id,credential_epoch,created_at,expires_at)
          SELECT ?,a.account_id,c.credential_epoch,?,? FROM accounts a JOIN account_credentials c USING(account_id)
          WHERE a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=?`,sid,created,expires,state.account.account_id,state.account.credential_epoch)
      ]);
      if(result[1].meta.changes!==1)throw rehearsalError('Account changed. Please sign in again.',401,'SESSION_ENDED');
      return {sid,expires,context};
    },
    async session(sid,accountId,epoch,now=new Date()) {
      return stateFor(`a.account_id=? AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND c.credential_epoch=?
        AND EXISTS(SELECT 1 FROM account_sessions s WHERE s.session_id=? AND s.account_id=a.account_id AND s.credential_epoch=c.credential_epoch
          AND s.revoked_at IS NULL AND s.expires_at>?)`,[accountId,epoch,sid,now.toISOString()]);
    },
    async revoke(sid,accountId){await prepare('UPDATE account_sessions SET revoked_at=? WHERE session_id=? AND account_id=?',new Date().toISOString(),sid,accountId).run();},
    async setCredential(state,newHash,action,actor=state.account.account_id) {
      const row=state.account;
      const result=await db.batch([
        prepare(`UPDATE account_credentials SET pin_hash=?,pin_setup=?,credential_epoch=credential_epoch+1,updated_at=?
          WHERE account_id=? AND credential_epoch=? AND pin_hash IS ? AND pin_setup=?
          AND EXISTS(SELECT 1 FROM accounts WHERE account_id=? AND active=1)`,newHash,Number(Boolean(newHash)),new Date().toISOString(),row.account_id,row.credential_epoch,row.pin_hash,row.pin_setup,row.account_id),
        audit(actor,row.account_id,action,['AuthenticationCredential'],true)
      ]);
      if(result[0].meta.changes!==1)throw rehearsalError('Account changed. Please refresh and try again.',409,'ACCOUNT_CHANGED');
      return this.byId(row.account_id);
    },
    async updateAccount(actor,target,input) {
      const result=await db.batch([
        prepare(`UPDATE accounts SET display_name=?,active=?,revision=revision+1,updated_at=?,modified_by_source_id=? WHERE account_id=? AND revision=?`,input.displayName,Number(input.active),new Date().toISOString(),actor,target.account.account_id,input.revision),
        audit(actor,target.account.account_id,'ACCOUNT_PROFILE_UPDATE',['DisplayName','Active'],true),
        prepare(`UPDATE account_sessions SET revoked_at=? WHERE account_id=? AND changes()=1
          AND EXISTS(SELECT 1 FROM accounts WHERE account_id=? AND active=0 AND revision=?)`,new Date().toISOString(),target.account.account_id,target.account.account_id,input.revision+1)
      ]);
      if(result[0].meta.changes!==1)throw rehearsalError('Account changed. Please refresh and try again.',409,'ACCOUNT_CHANGED');
      return this.byId(target.account.account_id);
    },
    async homeData(state,start,end,courseWorkflows=false) {
      const queries=[
        `SELECT a.*,p.timezone,p.duration_years,cs.legacy_access_model FROM activities a LEFT JOIN program_settings p USING(activity_key) LEFT JOIN course_settings cs USING(activity_key) WHERE a.active=1 AND a.lifecycle='ACTIVE' AND a.website_visible=1`,
        `SELECT p.* FROM timetable_publications p JOIN activities a USING(activity_key) WHERE a.active=1 AND a.lifecycle='ACTIVE' AND (p.pattern='COURSE' OR ((p.effective_from IS NULL OR p.effective_from<=?) AND (p.effective_until IS NULL OR p.effective_until>=?)))`,
        `SELECT p.*,s.subject_id,s.name AS subject_name FROM program_subjects p JOIN subject_catalog s USING(subject_key) WHERE p.active=1 AND s.active=1`,
        `SELECT * FROM modules WHERE active=1`, `SELECT * FROM classes WHERE active=1`,
        `SELECT * FROM class_memberships WHERE active=1 AND account_id=?`,
        `SELECT r.*${courseWorkflows?',ca.access_model AS run_access_model':''} FROM course_runs r JOIN activities a USING(activity_key) ${courseWorkflows?'JOIN course_run_access ca USING(activity_key,run_id)':''} WHERE r.active=1 AND a.active=1 AND a.lifecycle='ACTIVE'`,
        `SELECT s.* FROM course_run_state s JOIN course_runs r USING(activity_key,run_id) WHERE r.active=1`,
        `SELECT * FROM lesson_lifecycle`,
        ...(courseWorkflows?[`SELECT * FROM academy_calendar_events`,`SELECT * FROM academy_calendar_suppressions`]:[])
      ];
      const results=await db.batch(queries.map((sql,i)=>i===1?prepare(sql,end,start):i===5?prepare(sql,state?.account.account_id || ''):prepare(sql)));
      return results.map(r=>r.results);
    }
  };
}
