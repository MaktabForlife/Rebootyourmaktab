import {d1Subjects} from './subjects.js';
import {d1AccountTimetable} from './account-timetable.js';
import { createAuthRateLimitKey, createSaltedPinHash, createSessionToken, isValidFourDigitPin, verifyPin } from '../../lib/auth.js';
import { academyD1Repository, rehearsalError } from './repository.js';
import { d1Entrance } from './entrance.js';
import { d1Profiles } from './profiles.js';
import { d1Programs } from './programs.js';
import {d1Learning} from './learning.js';
import {learningAvailable} from './learning-state.js';
import {d1Library,d1LibraryStream,d1LibraryAreaRefs} from './library.js';
import {d1CourseCalendar} from './course-calendar.js';
import {d1CourseManagement} from './course-management.js';
import {d1CourseCatalogue} from './course-catalogue.js';
import {d1CourseSubscriptions} from './course-subscriptions.js';
import {managedCourseScopes} from './course-authority.js';
import {authenticatedD1Account as authenticated,d1Audience as audience,d1ContextEqual as contextEqual} from './session.js';
import {openLibraryMetadataEndpoint} from '../../routes/open-library-metadata.js';

const publicAccount=state=>({displayName:state.account.display_name,uniqueid:state.account.login_link_id});
const sessionResponse=(state,context,token)=>({account:publicAccount(state),context,contexts:state.contexts,courseManagement:state.account.global_admin||managedCourseScopes(state).length>0,sessionStore:'D1',operationalAccessActive:['COURSE','GLOBAL'].includes(context.scope),...(token?{token}:{})});
const requireActive=state=>{if(!state)throw rehearsalError('Invalid account link',404,'ACCOUNT_NOT_FOUND');if(!state.account.active)throw rehearsalError('Account disabled',403,'ACCOUNT_DISABLED');};

async function boundedBody(request,limit=4096) {
  const reader=request.body?.getReader();let size=0,raw='';const decoder=new TextDecoder();
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>limit){await reader.cancel();throw rehearsalError('Request is too large.',413,'REQUEST_TOO_LARGE');}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();
  let body;try{body=JSON.parse(raw || '{}');}catch{throw rehearsalError('Invalid request.',400,'INVALID_REQUEST');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw rehearsalError('Invalid request.',400,'INVALID_REQUEST');
  return body;
}
async function issueSession(env,repository,state,context) {
  if(!context)throw rehearsalError('No authorised Academy context is available.',403,'NO_CONTEXT');
  const session=await repository.createSession(state,context);
  const token=await createSessionToken({type:'account',aud:audience,sv:3,sid:session.sid,accountid:state.account.account_id,epoch:state.account.credential_epoch,scope:context.scope,courseid:context.courseId,role:context.role},env);
  return {success:true,...sessionResponse(state,context,token)};
}
async function rateLimit(env,login) {
  if(!env.AUTH_LOGIN_RATE_LIMITER?.limit)throw rehearsalError('Account service is temporarily unavailable.');
  const key=await createAuthRateLimitKey('account-d1',login.toUpperCase(),env);
  const result=await env.AUTH_LOGIN_RATE_LIMITER.limit({key});
  if(!result.success)throw rehearsalError('Too many sign-in attempts. Please wait one minute.',429,'LOGIN_RATE_LIMITED');
}
async function dispatch(request,env) {
  if (![env.PIN_SECRET,env.SESSION_SECRET].every(value=>typeof value==='string'&&value.trim()))
    throw rehearsalError('Academy authentication is not configured.');
  const repository=academyD1Repository(env);
  const path=new URL(request.url).pathname;
  await repository.ready();
  const publicLibraryOnly=env.ACADEMY_LIBRARY_MODE==='PUBLIC_ONLY';
  if(['/','/api/health'].includes(path)&&request.method==='GET')return {success:true,service:'rebootworker',version:'106.9',
    store:env.ACADEMY_D1_MODE==='ACTIVE'?'D1_ACTIVE':'D1_REHEARSAL',cutoverReady:env.ACADEMY_D1_MODE==='ACTIVE',
    libraryMode:publicLibraryOnly?'PUBLIC_ONLY':'COMPATIBILITY',mediaSubscriptionsAvailable:false};
  const openLibraryAction=path.match(/^\/api\/academy\/open-library\/metadata\/(public|cover|list|save|options)$/)?.[1];
  if(openLibraryAction)return openLibraryMetadataEndpoint(openLibraryAction)(request,env);
  // Account/attendance screens reuse this authenticated Program selector. It
  // returns only assigned Program names/roles, never media or file access.
  const programSelector=path==='/api/program-library/available'||path==='/api/admin/platform/program-library/available';
  if(publicLibraryOnly&&!programSelector&&path!=='/api/academy/library/catalogue'&&(
    /^\/api\/(?:admin\/platform\/program-library|program-library|academy\/library|academy\/d1\/library)\//.test(path)||
    path==='/api/platform/global/resources/access'||path==='/api/admin/platform/program-timetable/prepare-library'||
    /^\/api\/admin\/platform\/global\/(?:resources?|drive(?:-root)?)\//.test(path)))
    throw rehearsalError('Private Academy media is not available yet.',403,'PRIVATE_MEDIA_NOT_ENABLED');
  if(path==='/api/academy/d1/library/file'&&['GET','HEAD'].includes(request.method))return d1LibraryStream(request,repository,env);
  if(request.method!=='POST')throw rehearsalError('Use POST.',405,'METHOD_NOT_ALLOWED');
  if(path==='/api/admin/platform/program-library/upload-chunk') {
    const auth=await authenticated(request,env,repository);
    return {success:true,...await d1Library(repository,auth,env).uploadChunk(request)};
  }
  const managementPath=path.startsWith('/api/admin/platform/');
  const input=await boundedBody(request,managementPath?131072:path.startsWith('/api/program-attendance/')?65536:4096);
  if(['/api/account/check','/api/account/login','/api/account/setup-pin'].includes(path)) {
    const login=String(input.uniqueid || '').trim();
    if(!login||login.length>160)throw rehearsalError('Missing or invalid account link.',400,'INVALID_ACCOUNT_LINK');
    if(path!=='/api/account/check') {
      if(!isValidFourDigitPin(input.pin))throw rehearsalError('PIN must contain four digits.',400,'INVALID_PIN');
      if(path==='/api/account/setup-pin'&&input.pinConfirmation!==input.pin)throw rehearsalError('PIN confirmation must match the 4-digit PIN.',400,'PIN_CONFIRMATION_MISMATCH');
      await rateLimit(env,login);
    }
    let state=await (path==='/api/account/check'?repository.accountByLogin(login):repository.byLogin(login));requireActive(state);
    if(path==='/api/account/check')return {success:true,account:{...publicAccount(state),pinsetup:Boolean(state.account.pin_setup)},unifiedLoginStage:'CENTRAL_CONTEXT_VERIFICATION'};
    if(path==='/api/account/setup-pin') {
      if(state.account.pin_setup||String(state.account.pin_hash || '').trim())throw rehearsalError('PIN is already set. An authorised administrator must reset it before a new PIN can be created.',409,'PIN_ALREADY_SET');
      if(!state.contexts.length)throw rehearsalError('No authorised Academy context is available.',403,'NO_CONTEXT');
      state=await repository.setCredential(state,await createSaltedPinHash(input.pin,env.PIN_SECRET),'ACCOUNT_PIN_SETUP_SELF');
    } else {
      if(!state.account.pin_setup||!String(state.account.pin_hash || '').trim())throw rehearsalError('Account PIN not set up yet',403,'PIN_NOT_SET');
      const verification=await verifyPin(input.pin,state.account.pin_hash,env.PIN_SECRET);
      if(!verification.valid)throw rehearsalError('Incorrect PIN',401,'INCORRECT_PIN');
      if(verification.needsMigration)state=await repository.setCredential(state,verification.upgradedHash,'ACCOUNT_PIN_HASH_UPGRADE');
    }
    return issueSession(env,repository,state,state.contexts[0]);
  }
  if(path==='/api/academy/entrance') {
    const auth=request.headers.has('Authorization')?await authenticated(request,env,repository):null;
    return {success:true,sessionStore:'D1',...await d1Entrance(repository,auth?.state,auth?.user,input)};
  }
  const auth=await authenticated(request,env,repository);
  if(path==='/api/academy/courses/catalogue')return {success:true,...await d1CourseCatalogue(repository,auth)};
  if(publicLibraryOnly&&path==='/api/academy/library/catalogue')return {success:true,resources:[],
    warnings:['Private Academy media will appear when Module subscriptions are available.'],learningAreaRefs:d1LibraryAreaRefs(auth.state),
    libraryMode:'PUBLIC_ONLY',mediaSubscriptionsAvailable:false,store:'D1'};
  if(path==='/api/academy/timetable')return {success:true,...await d1AccountTimetable(repository,auth,input)};
  if(['/api/account/workspace','/api/account/global-workspace'].includes(path)){
    const expected=path.endsWith('/global-workspace')?'GLOBAL':'COURSE';
    if(auth.context.scope!==expected)throw rehearsalError('Choose an authorised Academy context.',403,'FORBIDDEN_CONTEXT');
    return {success:true,sessionStore:'D1',workspace:{portalType:'academy',path:expected==='GLOBAL'?'/academy/'+(auth.context.courseId?'#activity/COURSE/'+encodeURIComponent(auth.context.courseId):''):'/academy/#activity/PROGRAM/'+encodeURIComponent(auth.context.courseId)}};
  }
  const subjectAction=path.match(/^\/api\/admin\/platform\/academy-subjects\/(get|save|recover|import-preview)$/)?.[1];
  if(subjectAction)return {success:true,...await d1Subjects(repository,auth).run(subjectAction,input)};
  if(path==='/api/admin/platform/global/access/save')return {success:true,...await d1CourseSubscriptions(repository,auth).save(input)};
  if(path==='/api/platform/global/resources/access')return {success:true,...await d1Library(repository,auth,env).run('course-access',input,request)};
  const courseEditorAction=path.match(/^\/api\/admin\/platform\/courses\/(list|get|save|validate|accept|publish|status|repeat|participants|participants-save|participant-create)$/)?.[1];
  if(courseEditorAction)return {success:true,...await d1CourseManagement(repository,auth,env).run(courseEditorAction,input)};
  const courseAction=path==='/api/admin/platform/global/get'?'get':path.match(/^\/api\/admin\/platform\/global\/((?:subject|subjects|module|task|resource|resources|drive-root|drive|delivery|policy|run|timetable)(?:\/[a-z-]+){1,2})$/)?.[1];
  const calendarAction=path.match(/^\/api\/admin\/platform\/calendar\/(get|save|batch-save)$/)?.[1];
  if(courseAction||calendarAction)return {success:true,...await d1CourseCalendar(repository,auth,env).run(calendarAction?`calendar/${calendarAction}`:courseAction,input,request)};
  const timetableAction=path.match(/^\/api\/admin\/platform\/program-timetable\/(get|save|publish|history|published|preview|validate|prepare|prepare-library)$/)?.[1];
  const attendanceAction=path.match(/^\/api\/program-attendance\/(get|submit|prepare|recover)$/)?.[1];
  if(timetableAction||attendanceAction) {
    const learning=d1Learning(repository,auth);
    return {success:true,...await (timetableAction?learning.timetable(timetableAction,input):learning.attendance(attendanceAction,input))};
  }
  const libraryAction=path.match(/^\/api\/(admin\/platform\/program-library|program-library|academy\/library)\/(available|manage|save|recover|prepare-library|folder-set|browse|access|cover|covers|catalogue|upload-start)$/);
  if(libraryAction)return {success:true,...await d1Library(repository,auth,env).run(libraryAction[2],input,request,{admin:libraryAction[1].startsWith('admin/'),academy:libraryAction[1]==='academy/library'})};
  const profileAction=path.match(/^\/api\/admin\/platform\/user-profiles\/(get|link|save|recover)$/)?.[1];
  const registryAction=path.match(/^\/api\/admin\/platform\/programs\/(list|create|save|readiness|prepare)$/)?.[1];
  const managementAction=path.match(/^\/api\/admin\/platform\/program-timetable\/(manage-get|manage-save|recover)$/)?.[1];
  if(publicLibraryOnly&&managementAction==='manage-save'&&['resources','library-root'].includes(input.kind))
    throw rehearsalError('Private Academy media is not available yet.',403,'PRIVATE_MEDIA_NOT_ENABLED');
  if(profileAction||registryAction||managementAction) {
    const programAdmin=(managementAction||registryAction==='list')&&auth.state.roles.some(r=>r.role==='PROGRAM_ADMIN'&&(registryAction==='list'||r.activity_key.toUpperCase()===`PROGRAM:${String(input.id||'')}`.toUpperCase()));
    if(!auth.state.account.global_admin&&!programAdmin)throw rehearsalError('This action requires an authorised administrator.',403,'FORBIDDEN');
    const learningView=managementAction==='manage-get'&&await learningAvailable(repository.db);
    const result=profileAction?await d1Profiles(repository,auth).run(profileAction,input):registryAction?await d1Programs(repository,auth).registry(registryAction,input):learningView?await d1Learning(repository,auth).timetable('manage-get',input):await d1Programs(repository,auth).management(managementAction,input);
    return {success:true,...result};
  }
  if(path==='/api/account/session')return {success:true,...sessionResponse(auth.state,auth.context)};
  if(path==='/api/account/logout') {await repository.revoke(auth.sid,auth.state.account.account_id);return {success:true};}
  if(path==='/api/account/switch-context') {
    const context=auth.state.contexts.find(c=>contextEqual(c,{scope:String(input.scope || 'COURSE').toUpperCase(),courseId:String(input.courseId || ''),role:String(input.role || '').toUpperCase()}));
    if(!context)throw rehearsalError('Requested course or role is not authorised',403,'FORBIDDEN_CONTEXT');
    const result=await issueSession(env,repository,auth.state,context);
    await repository.revoke(auth.sid,auth.state.account.account_id);
    return result;
  }
  if(path.startsWith('/api/academy/d1/accounts/')) {
    if(!auth.state.account.global_admin)throw rehearsalError('Forbidden',403,'FORBIDDEN');
    const target=await repository.byId(String(input.accountId || ''));
    if(!target)throw rehearsalError('Account not found.',404,'ACCOUNT_NOT_FOUND');
    if(path.endsWith('/read'))return {success:true,account:{accountId:target.account.account_id,displayName:target.account.display_name,active:Boolean(target.account.active),revision:target.account.revision,pinSetup:Boolean(target.account.pin_setup),credentialEpoch:target.account.credential_epoch}};
    if(path.endsWith('/reset-pin')) {
      if(input.credentialEpoch!==target.account.credential_epoch)throw rehearsalError('Account changed. Please refresh.',409,'ACCOUNT_CHANGED');
      await repository.setCredential(target,'','ACCOUNT_PIN_RESET',auth.state.account.account_id);return {success:true};
    }
    if(path.endsWith('/update')) {
      if(typeof input.displayName!=='string'||!input.displayName.trim()||input.displayName.trim().length>160||typeof input.active!=='boolean'||!Number.isInteger(input.revision))throw rehearsalError('Invalid account change.',400,'INVALID_REQUEST');
      await repository.updateAccount(auth.state.account.account_id,target,{...input,displayName:input.displayName.trim()});return {success:true};
    }
  }
  throw rehearsalError('This operation is not available in the database rehearsal.',501,'OPERATION_NOT_MIGRATED');
}
export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    const allowed=(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
    const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Origin',
      'Access-Control-Allow-Methods':'POST, GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, Range, X-Library-Upload-Ticket, X-Library-Upload-Offset'};
    if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    if(origin&&!allowed.includes(origin))return new Response(JSON.stringify({success:false,error:'Origin is not allowed.'}),{status:403,headers});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{const result=await dispatch(request,env);
      if(result instanceof Response){const mediaHeaders=new Headers(result.headers);for(const name of ['Vary','Access-Control-Allow-Methods','Access-Control-Allow-Headers'])mediaHeaders.set(name,headers[name]);
        mediaHeaders.set('X-Content-Type-Options','nosniff');
        mediaHeaders.delete('Access-Control-Allow-Origin');if(headers['Access-Control-Allow-Origin'])mediaHeaders.set('Access-Control-Allow-Origin',headers['Access-Control-Allow-Origin']);
        return new Response(result.body,{status:result.status,headers:mediaHeaders});}
      return new Response(JSON.stringify(result),{headers});}
    catch(error){const status=Number.isInteger(error.status)?error.status:503;
      const unavailable=status>=500&&status!==501;
      if(status===429)headers['Retry-After']='60';
      return new Response(JSON.stringify({success:false,error:unavailable?'Academy information is temporarily unavailable. Please try again.':error.message,
        code:unavailable?(['ACTIVATION_REQUIRED','MANAGEMENT_SCHEMA_REQUIRED','LEARNING_IMPORT_REQUIRED','COURSE_IMPORT_REQUIRED','COURSE_ACCESS_SCHEMA_REQUIRED','COURSE_MANAGEMENT_SCHEMA_REQUIRED','UPLOAD_BRIDGE_REQUIRED'].includes(error.code)?error.code:'ACADEMY_D1_UNAVAILABLE'):error.code,retryable:unavailable||status===429,...(status===429?{retryAfterMs:60000}:{}),
        ...(status===409?Object.fromEntries(['currentRecord','rowRevision','entryKey'].filter(k=>error[k]!==undefined).map(k=>[k,error[k]])):{} )}),{status,headers});}
  }
};
