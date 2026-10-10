import {same} from './management-store.js';
import {optionalSchema} from './schema-probe.js';
import {dateInTimezone} from '../../lib/global-subject-delivery.js';

// Read-only, account-scoped Course history. Never return editor drafts, meeting
// links or file locations to learners, or use this list as a media entitlement.
export async function d1CourseCatalogue(repository,auth,now=new Date()) {
  const db=repository.db,p=(sql,...values)=>db.prepare(sql).bind(...values);
  const editor=await optionalSchema(db,'SELECT activity_key FROM course_management_drafts WHERE 0');
  const subscriptions=await repository.subscriptionSource();
  const results=await db.batch([
    p(`SELECT a.activity_key,a.activity_id,a.name,a.active,a.lifecycle,a.website_visible,
      ${editor?'coalesce(r.run_id,d.run_id)':'r.run_id'} AS run_id,r.name AS run_name,coalesce(r.timezone,p.timezone) AS timezone,coalesce(r.start_date,p.effective_from) AS start_date,coalesce(r.end_date,p.effective_until) AS end_date,r.active AS run_active,
      s.current_publication_id,cs.legacy_access_model,
      ${editor?"d.stage,d.completed_at,json_extract(d.details_json,'$.name') AS draft_name,json_extract(d.details_json,'$.startDate') AS draft_start,json_extract(d.details_json,'$.endDate') AS draft_end":"NULL AS stage,NULL AS completed_at,NULL AS draft_name,NULL AS draft_start,NULL AS draft_end"}
      FROM activities a JOIN course_settings cs USING(activity_key)
      LEFT JOIN course_runs r USING(activity_key)
      LEFT JOIN course_run_state s ON s.activity_key=r.activity_key AND s.run_id=r.run_id
      LEFT JOIN timetable_publications p ON p.activity_key=s.activity_key AND p.publication_id=s.current_publication_id
      ${editor?"LEFT JOIN course_management_drafts d ON d.activity_key=a.activity_key AND (d.run_id=r.run_id OR r.run_id IS NULL)":""}
      WHERE a.kind='COURSE'`),
    p("SELECT activity_key,role FROM effective_activity_roles WHERE account_id=?",auth.user.accountid),
    p(`SELECT activity_key FROM ${subscriptions} WHERE account_id=?`,auth.user.accountid)
  ]);
  const [rows,assignments,paid]=results.map(r=>r.results),globalAdmin=Boolean(auth.state.account.global_admin);
  const courses=[];
  for(const r of rows) {
    const roles=[...new Set([...assignments,...auth.state.roles].filter(a=>same(a.activity_key,r.activity_key)).map(a=>a.role))];
    const subscribed=paid.some(a=>same(a.activity_key,r.activity_key));
    const canManage=globalAdmin||Boolean(r.active&&r.lifecycle==='ACTIVE'&&roles.includes('PROGRAM_ADMIN'));
    const personal=subscribed||roles.some(role=>['STUDENT','TEACHER','PROGRAM_ADMIN'].includes(role));
    if(!canManage&&!personal)continue;
    let stage=r.stage||(!r.active||r.lifecycle==='ARCHIVED'?'ARCHIVED':r.current_publication_id?'PUBLISHED':'DRAFT');
    // A saved revision must not hide or expose changes to its current publication.
    if(stage==='DRAFT'&&r.current_publication_id&&r.run_active)stage='PUBLISHED';
    if(!canManage&&(!r.current_publication_id||!['PUBLISHED','COMPLETE','ARCHIVED'].includes(stage)))continue;
    const draft=stage==='DRAFT',startDate=(draft?r.draft_start:r.start_date)||'',endDate=(draft?r.draft_end:r.end_date)||'';
    if(stage==='PUBLISHED'&&startDate&&endDate){
      const today=dateInTimezone(now,r.timezone||'Africa/Johannesburg');
      if(today>=startDate&&today<=endDate)stage='ACTIVE';
    }
    courses.push({id:r.activity_id,runId:r.run_id||'',name:(draft?r.draft_name:r.run_name)||r.name,
      stage,startDate,endDate,accessModel:r.legacy_access_model,personal,canManage,
      canOpenActivity:Boolean(r.active&&r.lifecycle==='ACTIVE'&&r.website_visible&&r.run_active),
      mediaAvailable:false,mediaMessage:['COMPLETE','ARCHIVED'].includes(stage)
        ? 'Course media is not available yet.' : 'Course media becomes available after completion.'});
  }
  courses.sort((a,b)=>(b.startDate||'').localeCompare(a.startDate||'')||a.name.localeCompare(b.name));
  return {courses,canViewAll:globalAdmin,privateMedia:false,store:'D1'};
}
