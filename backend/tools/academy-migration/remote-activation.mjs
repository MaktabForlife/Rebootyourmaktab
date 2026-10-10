import {CORE_ACTIVATION_CHECKS} from '../../src/academy/d1/activation-policy.js';
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const activationArtifactDigest=digest;

// Administration library ONLY. Never imported by the Academy HTTP router.
// The caller supplies a fixed, reviewed artifact and its separately pinned hash;
// no browser/request body can supply SQL, evidence or an activation plan.
export async function applyCoreActivationD1(binding,plan,{expectedArtifactSha256}={}) {
  if(!/^[a-f0-9]{64}$/.test(expectedArtifactSha256||'')||await digest(plan)!==expectedArtifactSha256)throw Error('ACTIVATION_ARTIFACT_CHANGED');
  if(plan?.format!=='maktab-core-activation/v1'||!plan.readyToApply||plan.blockers?.length||!plan.statements?.length||
    CORE_ACTIVATION_CHECKS.some(check=>plan.evidence?.[check]?.status!=='PASS'||!plan.evidence[check].reference?.trim())||
    await digest(plan.statements)!==plan.statementsSha256||!plan.statements[0].sql.includes('json_group_array'))throw Error('ACTIVATION_REVIEW_INCOMPLETE');
  const db=binding.withSession('first-primary');
  const saved=async()=>{
    const receipt=await db.prepare("SELECT payload_sha256,result_json FROM operation_receipts WHERE dataset_key='CORE_ACTIVATION' AND scope_key='ACADEMY' AND operation_id=?").bind(plan.reviewId).first();
    if(!receipt)return null;if(receipt.payload_sha256!==plan.reviewSha256)throw Error('ACTIVATION_REVIEW_ID_REUSED');
    return JSON.parse(receipt.result_json);
  };
  const previous=await saved();if(previous)return {...previous,replayed:true};
  try{await db.batch(plan.statements.map(({sql,params})=>db.prepare(sql).bind(...params)));}
  catch {
    // A lost acknowledgement or simultaneous identical retry can follow a
    // committed transaction. Recheck its receipt; never repeat it piecemeal.
    const completed=await saved();if(completed)return {...completed,replayed:true};
    throw Error('ACTIVATION_BATCH_REJECTED');
  }
  const completed=await saved();if(!completed)throw Error('ACTIVATION_RECEIPT_UNAVAILABLE');return completed;
}

// Dedicated disposable test controller, never bound to the main database.
// Target identity is also checked by the deployment tool/config before upload.
export function syntheticTransitionWorker(plan,{databaseId,artifactSha256}) {
  if(databaseId==='7e732b79-a72f-4da6-be83-524919c49ba4'||!/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(databaseId))throw Error('SYNTHETIC_TARGET_REQUIRED');
  return {async fetch(request,env){
    const respond=(code,status)=>Response.json({success:false,code},{status,headers:{'Cache-Control':'no-store'}});
    if(env.TEST_DATABASE_ID!==databaseId||env.TRANSITION_ENABLED!=='SYNTHETIC_ONLY'||typeof env.TRANSITION_TOKEN!=='string'||env.TRANSITION_TOKEN.length<40)return respond('TRANSITION_DISABLED',503);
    if(request.headers.has('Origin'))return respond('FORBIDDEN',403);
    const header=request.headers.get('Authorization')||'';
    if(!header.startsWith('Bearer ')||header.length>256)return respond('UNAUTHORIZED',401);
    const a=await digest(header.slice(7)),b=await digest(env.TRANSITION_TOKEN);let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
    if(difference)return respond('UNAUTHORIZED',401);
    if(request.method!=='POST'||new URL(request.url).pathname!=='/activate')return respond('INVALID_TRANSITION_REQUEST',400);
    // Workers can represent an empty incoming POST as an empty stream. Read
    // only its first chunk; never accept or buffer caller-supplied plan bytes.
    if(request.body){const reader=request.body.getReader();const first=await reader.read();await reader.cancel();if(!first.done||first.value?.byteLength)return respond('INVALID_TRANSITION_REQUEST',400);}
    try{return Response.json({success:true,...await applyCoreActivationD1(env.ACADEMY_DB,plan,{expectedArtifactSha256:artifactSha256})},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return respond(error.message==='ACTIVATION_BATCH_REJECTED'?'ACTIVATION_BATCH_REJECTED':'ACTIVATION_NOT_CONFIRMED',error.message==='ACTIVATION_BATCH_REJECTED'?409:503);}
  }};
}
