import { getAuthUser } from '../lib/auth.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { json } from '../lib/http.js';
import { problem } from '../programs/model.js';
import { programFailure } from '../programs/errors.js';
import { profileRepository } from '../profiles/repository.js';
import { profileService } from '../profiles/service.js';
export async function profileUser(request,env){
  const user=await getAuthUser(request,env);
  if(!user)throw problem('Sign in through your personal academy account link.',401);
  if(user.type!=='account'||user.role!=='GLOBAL_ADMIN')throw problem('Managing shared profiles requires an academy administrator.',403);
  return user;
}
export function userProfilesEndpoint(action){return async(request,env)=>{
  if(request.method!=='POST')return json({success:false,error:'Use POST.'},405);
  try{
    await profileUser(request,env);
    let size=0,raw='';const decoder=new TextDecoder(),reader=request.body?.getReader();
    if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();throw problem('The profile request is too large.',413);}raw+=decoder.decode(value,{stream:true});}
    raw+=decoder.decode();let input;try{input=JSON.parse(raw||'{}');}catch{throw problem('Invalid profile request.');}
    if(!input||typeof input!=='object'||Array.isArray(input))throw problem('Invalid profile request.');
    if(['save','recover'].includes(action)){
      if(!env.PROGRAM_TIMETABLE_COORDINATOR)throw problem('Profile saving needs the academy coordinator connection.',503);
      const result=await env.PROGRAM_TIMETABLE_COORDINATOR.getByName(`${getPlatformSpreadsheetId(env)}:user-profiles`).profilesRun(action,input,request.headers.get('Authorization')||'');
      return json(result,result.success?200:result.status||503);
    }
    return json({success:true,...await profileService(profileRepository(env)).read(action,input)});
  }catch(error){const result=programFailure(error,action,'user-profiles');return json(result,result.status);}
};}
