import { authorityRank, normalizePlatformIdentifier as key } from '../../lib/platform-schema.js';

export const rehearsalError = (message, status=503, code='ACADEMY_D1_UNAVAILABLE') => Object.assign(new Error(message), {status,code});
const publicAccount = row => ({AccountID:row.account_id,DisplayName:row.display_name,UniqueID:row.login_link_id,Active:Boolean(row.active),PlatformRole:row.global_admin?'GLOBAL_ADMIN':''});

// One primary-anchored session per HTTP request. Never cache account permissions,
// credentials or database handles in module-level request state.
export function academyD1Repository(env) {
  if (!['local','development'].includes(env.ENVIRONMENT) || env.ACADEMY_D1_MODE !== 'REHEARSAL' || !env.ACADEMY_DB)
    throw rehearsalError('Academy database rehearsal is not enabled.');
  const db=env.ACADEMY_DB.withSession('first-primary');
  const prepare=(sql,...values)=>db.prepare(sql).bind(...values);
  const accountSQL=`SELECT a.*,c.pin_hash,c.pin_setup,c.credential_epoch,
    EXISTS(SELECT 1 FROM global_role_assignments g WHERE g.account_id=a.account_id AND g.role='GLOBAL_ADMIN' AND g.active=1 AND g.review_state='CONFIRMED') AS global_admin
    FROM accounts a JOIN account_credentials c ON c.account_id=a.account_id`;
  async function stateFor(account) {
    if(!account)return null;
    const results=await db.batch([
      prepare(`SELECT a.*,cs.legacy_access_model FROM activities a LEFT JOIN course_settings cs USING(activity_key)
        WHERE a.active=1 AND a.lifecycle='ACTIVE' AND a.kind IN ('PROGRAM','COURSE')`),
      prepare(`SELECT r.activity_key,r.role FROM effective_activity_roles r JOIN activities a USING(activity_key)
        WHERE r.account_id=? AND a.active=1 AND a.lifecycle='ACTIVE'
        UNION SELECT e.activity_key,e.source_role AS role FROM legacy_access_evidence e
        JOIN activities a USING(activity_key) JOIN role_import_reviews v ON v.account_id=e.account_id AND v.activity_key=e.activity_key AND v.source_value=e.source_role
        WHERE e.account_id=? AND e.source_role IN ('ADMIN','SENIOR') AND e.source_effective=1 AND v.status='REQUIRED' AND a.active=1 AND a.lifecycle='ACTIVE'`,account.account_id,account.account_id),
      prepare(`SELECT activity_key FROM legacy_access_evidence WHERE account_id=? AND source_role='LEGACY_SUBSCRIPTION' AND source_effective=1`,account.account_id)
    ]);
    const [activities,roles,subscriptions]=results.map(r=>r.results);
    const contexts=[];
    if(account.global_admin)contexts.push({scope:'PLATFORM',courseId:'',courseName:'M4L Platform',role:'GLOBAL_ADMIN'});
    for(const activity of activities.filter(a=>a.kind==='PROGRAM')) {
      if(account.global_admin)continue;
      const assigned=roles.filter(r=>key(r.activity_key)===key(activity.activity_key)).map(r=>r.role);
      // PROGRAM_ADMIN is intentionally not inferred from legacy privileges. The
      // compatibility roles above apply only to the isolated rehearsal service.
      for(const role of [...new Set(assigned)].filter(r=>['GLOBAL_ADMIN','ADMIN','SENIOR','TEACHER','STUDENT'].includes(r)))
        contexts.push({scope:'COURSE',courseId:activity.activity_id,courseName:activity.name,role,programLibrary:true});
    }
    contexts.sort((a,b)=>authorityRank(a.role)-authorityRank(b.role)||a.courseName.localeCompare(b.courseName)||a.role.localeCompare(b.role));
    if(!account.global_admin&&activities.some(a=>a.kind==='COURSE'&&(a.legacy_access_model==='FREE'||subscriptions.some(s=>key(s.activity_key)===key(a.activity_key)))))
      contexts.push({scope:'GLOBAL',courseId:'',courseName:'Global Subjects',role:'STUDENT'});
    return {account,activities,roles,subscriptions,contexts};
  }
  function audit(actor,target,action,fields,conditional=false) {
    return prepare(`INSERT INTO audit_events(event_id,occurred_at,actor_account_id,authority,scope_key,action,record_kind,record_id,changed_fields_json)
      SELECT ?,?,?,?,?,?,?,?,? ${conditional?'WHERE changes()=1':''}`,crypto.randomUUID(),new Date().toISOString(),actor,'D1_REHEARSAL','ACADEMY',action,'USER_ACCOUNT',target,JSON.stringify(fields));
  }
  return {
    db,
    publicAccount,
    async ready(){
      const result=await prepare(`SELECT run_id FROM migration_runs WHERE state='IMPORTED' AND environment IN ('LOCAL','DEVELOPMENT')
        AND NOT EXISTS (SELECT 1 FROM activities a LEFT JOIN data_ownership o
          ON o.dataset_key='ACADEMY' AND o.scope_key=a.activity_key
          WHERE a.active=1 AND (o.scope_key IS NULL OR o.authoritative_store<>'SHEETS' OR o.phase<>'STAGING'))`).first();
      if(!result)throw rehearsalError('A development import is required.');
    },
    async byLogin(login){return stateFor(await prepare(`${accountSQL} WHERE a.login_link_id=? COLLATE NOCASE`,login).first());},
    async byId(accountId){return stateFor(await prepare(`${accountSQL} WHERE a.account_id=? COLLATE NOCASE`,accountId).first());},
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
      const row=await prepare(`SELECT s.session_id FROM account_sessions s JOIN accounts a USING(account_id) JOIN account_credentials c USING(account_id)
        WHERE s.session_id=? AND s.account_id=? AND s.credential_epoch=? AND c.credential_epoch=s.credential_epoch
        AND a.active=1 AND c.pin_setup=1 AND length(trim(c.pin_hash))>0 AND s.revoked_at IS NULL AND s.expires_at>?`,sid,accountId,epoch,now.toISOString()).first();
      return row?this.byId(accountId):null;
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
    async homeData(state,start,end) {
      const queries=[
        `SELECT a.*,p.timezone,p.duration_years,cs.legacy_access_model FROM activities a LEFT JOIN program_settings p USING(activity_key) LEFT JOIN course_settings cs USING(activity_key) WHERE a.active=1 AND a.lifecycle='ACTIVE'`,
        `SELECT p.* FROM timetable_publications p JOIN activities a USING(activity_key) WHERE a.active=1 AND a.lifecycle='ACTIVE' AND (p.pattern='COURSE' OR ((p.effective_from IS NULL OR p.effective_from<=?) AND (p.effective_until IS NULL OR p.effective_until>=?)))`,
        `SELECT p.*,s.subject_id,s.name AS subject_name FROM program_subjects p JOIN subject_catalog s USING(subject_key) WHERE p.active=1 AND s.active=1`,
        `SELECT * FROM modules WHERE active=1`, `SELECT * FROM classes WHERE active=1`,
        `SELECT * FROM class_memberships WHERE active=1 AND account_id=?`,
        `SELECT r.* FROM course_runs r JOIN activities a USING(activity_key) WHERE r.active=1 AND a.active=1 AND a.lifecycle='ACTIVE'`,
        `SELECT s.* FROM course_run_state s JOIN course_runs r USING(activity_key,run_id) WHERE r.active=1`,
        `SELECT * FROM lesson_lifecycle`
      ];
      const results=await db.batch(queries.map((sql,i)=>i===1?prepare(sql,end,start):i===5?prepare(sql,state?.account.account_id || ''):prepare(sql)));
      return results.map(r=>r.results);
    }
  };
}
