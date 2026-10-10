import {managementStore,managementError,same,liveRoles} from './management-store.js';
import {requireCourseCalendar} from './course-calendar.js';
import {managedCourseScopes,courseManagementData} from './course-authority.js';

// Preserve the current per-account/per-Course subscription control. Admission,
// Program enrolment, Module subscriptions and completion grants are separate.
export function d1CourseSubscriptions(repository,auth) {
  const store=managementStore(repository,auth),p=store.p;
  return {async save(input){
    if(!auth.state.account.global_admin&&!managedCourseScopes(auth.state).some(s=>same(s,'COURSE:'+input.subjectId)))
      throw managementError('This action requires an authorised Course administrator.',403,'FORBIDDEN');
    await requireCourseCalendar(repository.db);
    if(await repository.subscriptionSource()!=='effective_course_subscriptions')throw managementError('Course subscription management needs its database upgrade.',503,'COURSE_ACCESS_SCHEMA_REQUIRED');
    if(typeof input.active!=='boolean'||typeof input.accountId!=='string'||typeof input.subjectId!=='string')throw managementError('Choose an account, Course and subscription state.');
    return store.change('COURSE_SUBSCRIPTIONS','ACADEMY','access/save',input,async()=>{
      const data=await store.load({coursePolicies:p('SELECT * FROM course_settings'),subscriptions:p('SELECT * FROM effective_course_subscriptions')});
      const scoped=courseManagementData(data,auth);
      if(input.workflowRevision!==String(data.version))throw managementError('Course access changed elsewhere. Your draft is kept; refresh and review the saved access.',409,'WORKFLOW_CHANGED');
      const account=data.accounts.find(a=>same(a.account_id,input.accountId)),course=scoped.activities.find(a=>a.kind==='COURSE'&&same(a.activity_id,input.subjectId));
      if(!account||!course)throw managementError('Choose an existing account and Course.',404);
      const policy=data.coursePolicies.find(p=>same(p.activity_key,course.activity_key));
      if(!policy||policy.legacy_access_model==='UNKNOWN')throw managementError('Review this Course’s access model before changing subscriptions.',409,'COURSE_POLICY_REQUIRED');
      if(policy.legacy_access_model==='FREE')throw managementError('Free Courses use implicit access and do not accept per-account subscription changes.',409,'FREE_COURSE_ACCESS');
      if(input.active&&(!account.active||!course.active||course.lifecycle!=='ACTIVE'))throw managementError('Reactivate the account and Course before granting access.',409,'INACTIVE_COURSE_ACCOUNT');
      const current=data.subscriptions.some(s=>same(s.account_id,account.account_id)&&same(s.activity_key,course.activity_key))||liveRoles(data,account.account_id,course.activity_key).includes('STUDENT'),now=new Date().toISOString();
      const statement=p(`INSERT INTO course_subscription_decisions(account_id,activity_key,active,updated_at,updated_by_account_id)
        VALUES(?,?,?,?,?) ON CONFLICT(account_id,activity_key) DO UPDATE SET active=excluded.active,
        updated_at=excluded.updated_at,updated_by_account_id=excluded.updated_by_account_id,revision=course_subscription_decisions.revision+1`,account.account_id,course.activity_key,Number(input.active),now,auth.user.accountid);
      const statements=[statement];
      if(!input.active)statements.push(p("UPDATE role_assignments SET active=0,revision=revision+1 WHERE account_id=? AND activity_key=? AND role='STUDENT' AND active=1",account.account_id,course.activity_key));
      return {data,authorityScopes:[course.activity_key],statements,result:{success:true,access:{accountid:account.account_id,subjectid:course.activity_id,active:input.active},
        changed:current!==input.active,message:input.active?'Course subscription activated.':'Course subscription deactivated.',workflowStore:'D1',workflowRevision:String(data.version+1)},fields:['CourseSubscription']};
    });
  }};
}
