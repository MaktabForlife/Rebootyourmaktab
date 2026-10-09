import { createAuthRateLimitKey, createSaltedPinHash, createSessionToken, verifySessionToken, isValidFourDigitPin, verifyPin } from '../../lib/auth.js';
import { academyD1Repository, rehearsalError } from './repository.js';
import { d1Entrance } from './entrance.js';

const audience='academy-d1-rehearsal';
const contextEqual=(a,b)=>a.scope===b.scope&&a.courseId.toUpperCase()===b.courseId.toUpperCase()&&a.role===b.role;
const publicAccount=state=>({displayName:state.account.display_name,uniqueid:state.account.login_link_id});
const sessionResponse=(state,context,token)=>({account:publicAccount(state),context,contexts:state.contexts,operationalAccessActive:['COURSE','GLOBAL'].includes(context.scope),...(token?{token}:{})});
const requireActive=state=>{if(!state)throw rehearsalError('Invalid account link',404,'ACCOUNT_NOT_FOUND');if(!state.account.active)throw rehearsalError('Account disabled',403,'ACCOUNT_DISABLED');};

async function boundedBody(request) {
  const reader=request.body?.getReader();let size=0,raw='';const decoder=new TextDecoder();
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>4096){await reader.cancel();throw rehearsalError('Request is too large.',413,'REQUEST_TOO_LARGE');}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();
  let body;try{body=JSON.parse(raw || '{}');}catch{throw rehearsalError('Invalid request.',400,'INVALID_REQUEST');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw rehearsalError('Invalid request.',400,'INVALID_REQUEST');
  return body;
}
async function authenticated(request,env,repository) {
  const header=request.headers.get('Authorization') || '';
  if(!header.startsWith('Bearer ')||header.length>4096)throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
  const token=await verifySessionToken(header.slice(7),env);
  if(!token||token.aud!==audience||token.sv!==3||typeof token.sid!=='string'||typeof token.accountid!=='string'||!Number.isInteger(token.epoch))throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
  const state=await repository.session(token.sid,token.accountid,token.epoch);
  const context=state?.contexts.find(c=>contextEqual(c,{scope:String(token.scope || ''),courseId:String(token.courseid || ''),role:String(token.role || '')}));
  if(!state||!context)throw rehearsalError('Your Academy session has ended.',401,'SESSION_ENDED');
  // Name, account identity and authority always come from fresh database state.
  return {state,sid:token.sid,context,user:{type:'account',accountid:state.account.account_id,uniqueid:state.account.login_link_id,username:state.account.display_name,role:state.account.global_admin?'GLOBAL_ADMIN':context.role,scope:context.scope,courseid:context.courseId}};
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
  const repository=academyD1Repository(env);
  const path=new URL(request.url).pathname;
  if(path==='/api/health'&&request.method==='GET')return {success:true,store:'D1_REHEARSAL',cutoverReady:false};
  if(request.method!=='POST')throw rehearsalError('Use POST.',405,'METHOD_NOT_ALLOWED');
  await repository.ready();
  const input=await boundedBody(request);
  if(['/api/account/check','/api/account/login','/api/account/setup-pin'].includes(path)) {
    const login=String(input.uniqueid || '').trim();
    if(!login||login.length>160)throw rehearsalError('Missing or invalid account link.',400,'INVALID_ACCOUNT_LINK');
    if(path!=='/api/account/check') {
      if(!isValidFourDigitPin(input.pin))throw rehearsalError('PIN must contain four digits.',400,'INVALID_PIN');
      if(path==='/api/account/setup-pin'&&input.pinConfirmation!==input.pin)throw rehearsalError('PIN confirmation must match the 4-digit PIN.',400,'PIN_CONFIRMATION_MISMATCH');
      await rateLimit(env,login);
    }
    let state=await repository.byLogin(login);requireActive(state);
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
    return {success:true,...await d1Entrance(repository,auth?.state,auth?.user,input)};
  }
  const auth=await authenticated(request,env,repository);
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
      'Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'};
    if(origin&&allowed.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    if(origin&&!allowed.includes(origin))return new Response(JSON.stringify({success:false,error:'Origin is not allowed.'}),{status:403,headers});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    try{return new Response(JSON.stringify(await dispatch(request,env)),{headers});}
    catch(error){const status=Number.isInteger(error.status)?error.status:503;
      const unavailable=status>=500&&status!==501;
      if(status===429)headers['Retry-After']='60';
      return new Response(JSON.stringify({success:false,error:unavailable?'Academy information is temporarily unavailable. Please try again.':error.message,
        code:unavailable?'ACADEMY_D1_UNAVAILABLE':error.code,retryable:unavailable||status===429,...(status===429?{retryAfterMs:60000}:{})}),{status,headers});}
  }
};
