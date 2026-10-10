import {academyD1Repository,rehearsalError} from './repository.js';
import {d1Entrance} from './entrance.js';

export function publicTimetableDay(now=new Date()) {
  const start=new Date(now);start.setUTCHours(0,0,0,0);
  return {startDate:start.toISOString().slice(0,10),expiresAt:new Date(start.getTime()+86400000).toISOString()};
}
export const publicTimetableKey=(env,period)=>`academy-public-timetable/v1/${encodeURIComponent(env.ENVIRONMENT)}/${encodeURIComponent(env.ACADEMY_D1_RUN_ID||'rehearsal')}/${period.startDate}.json`;

// This is a marketing snapshot, never a copy of an authenticated response.
// Whitelist on both creation and retrieval; no accounts, classes, teachers,
// memberships, media, meeting IDs, links or permission metadata are stored.
export function publicTimetableSnapshot(data,period,now=new Date()) {
  return {success:true,snapshotVersion:1,snapshotDate:period.startDate,expiresAt:period.expiresAt,generatedAt:data.generatedAt||now.toISOString(),
    signedIn:false,globalAdmin:false,student:false,startDate:data.startDate,endDate:data.endDate,timezone:data.timezone,
    activities:[],personalActivities:[],activityPages:[],personalTimetable:[],activity:null,warnings:[],calendarEvents:[],
    timetable:data.timetable.filter(row=>row.status==='SCHEDULED').map(row=>({kind:row.kind,activityId:row.activityId,
      activityName:row.activityName,title:row.activityName||row.title,date:row.date,startTime:row.startTime,endTime:row.endTime,timezone:row.timezone,status:'SCHEDULED'}))};
}

export async function publicTimetable(request,env,now=new Date(),edgeCache=globalThis.caches?.default) {
  if(request.method!=='GET')throw rehearsalError('Use GET.',405,'METHOD_NOT_ALLOWED');
  if(request.headers.has('Authorization'))throw rehearsalError('Open the public timetable without an account session.',400,'PUBLIC_SNAPSHOT_ONLY');
  if(!['local','development'].includes(env.ENVIRONMENT)||!['REHEARSAL','ACTIVE'].includes(env.ACADEMY_D1_MODE)||
    env.ACADEMY_D1_MODE==='ACTIVE'&&(!env.ACADEMY_D1_RUN_ID||env.ACADEMY_LIBRARY_MODE!=='PUBLIC_ONLY'))
    throw rehearsalError('Academy activation configuration is incomplete.',503,'ACTIVATION_REQUIRED');
  const period=publicTimetableDay(now),key=publicTimetableKey(env,period);
  const cacheKey=new Request(new URL('/api/academy/entrance/public-snapshot/'+key,new URL(request.url).origin),{method:'GET'});
  const valid=data=>data?.snapshotVersion===1&&data.snapshotDate===period.startDate&&data.signedIn===false&&Array.isArray(data.timetable);
  let snapshot,edgeHit=false;
  if(edgeCache)try { const cached=await edgeCache.match(cacheKey);if(cached){const data=await cached.json();if(valid(data)){snapshot=publicTimetableSnapshot(data,period,now);edgeHit=true;}} }catch { /* R2 remains the durable snapshot. */ }
  if(!snapshot&&env.MEDIA_BUCKET){
    const stored=await env.MEDIA_BUCKET.get(key);
    if(stored){const data=await stored.json();if(valid(data))snapshot=publicTimetableSnapshot(data,period,now);}
  }
  if(!snapshot){
    if(!env.MEDIA_BUCKET&&env.ENVIRONMENT!=='local')throw rehearsalError('The public timetable snapshot store is unavailable.');
    const repository=academyD1Repository(env);await repository.ready();
    // The public preview covers the next seven days.
    const data=await d1Entrance(repository,null,null,{startDate:period.startDate},now,{days:7});
    if(data.warnings.some(warning=>warning.endsWith('timetable is unavailable.')))throw rehearsalError('The public timetable snapshot could not be prepared.');
    snapshot=publicTimetableSnapshot(data,period,now);
    if(env.MEDIA_BUCKET){
      const written=await env.MEDIA_BUCKET.put(key,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'},onlyIf:{etagDoesNotMatch:'*'}});
      if(!written){const existing=await env.MEDIA_BUCKET.get(key);const winner=existing&&await existing.json();if(valid(winner))snapshot=publicTimetableSnapshot(winner,period,now);}
    }
  }
  const maxAge=Math.max(0,Math.floor((Date.parse(period.expiresAt)-now.getTime())/1000));
  const response=new Response(JSON.stringify(snapshot),{headers:{'Content-Type':'application/json','Cache-Control':`public, max-age=${maxAge}`}});
  if(edgeCache&&!edgeHit)try { await edgeCache.put(cacheKey,response.clone()); }catch { /* Serving R2 does not require an edge-cache write. */ }
  return response;
}
