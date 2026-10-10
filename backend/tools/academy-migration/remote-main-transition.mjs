import {CORE_ACTIVATION_CHECKS} from '../../src/academy/d1/activation-policy.js';

export const mainTransitionDigest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
const mainId='7e732b79-a72f-4da6-be83-524919c49ba4';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const upgradeIntact=async upgrade=>{const {artifactSha256,...basis}=upgrade||{};return await mainTransitionDigest(canonical(basis))===artifactSha256;};

function reviewed(upgrade,activation) {
  return upgrade?.format==='maktab-staging-upgrade/v1'&&upgrade.databaseId===mainId&&upgrade.localPreparationOnly===true&&upgrade.liveExecutionApproved===false&&
    activation?.format==='maktab-core-activation/v1'&&activation.readyToApply===true&&!activation.blockers?.length&&
    upgrade.afterFingerprint===activation.databaseFingerprint&&upgrade.codeCommit===activation.codeCommit&&upgrade.sourceSha256===activation.sourceSha256&&
    activation.libraryMode==='PUBLIC_ONLY'&&CORE_ACTIVATION_CHECKS.every(check=>activation.evidence?.[check]?.status==='PASS'&&activation.evidence[check].reference?.trim())&&
    upgrade.statements?.[0]?.sql.startsWith('CREATE TABLE academy_staging_upgrade_guard(')&&activation.statements?.[0]?.sql.includes('json_group_array');
}

// Called only by offline administration tooling after all final review checks.
// Preparation with pending evidence produces no main transition artifact.
export async function buildMainTransitionArtifact(upgrade,activation) {
  if(!reviewed(upgrade,activation))throw Error('MAIN_TRANSITION_REVIEW_INCOMPLETE');
  if(!await upgradeIntact(upgrade))throw Error('MAIN_TRANSITION_UPGRADE_CHANGED');
  if(await mainTransitionDigest(activation.statements)!==activation.statementsSha256)throw Error('MAIN_TRANSITION_ACTIVATION_CHANGED');
  return {format:'maktab-main-transition/v1',databaseId:mainId,upgrade,activation};
}

// Never imported by an application route. The caller pins the entire private
// artifact separately. Upgrade AND activation execute in ONE binding batch;
// a late failure leaves the original base schema/data/ownership intact.
export async function applyMainTransitionD1(binding,artifact,{expectedArtifactSha256}={}) {
  if(!/^[a-f0-9]{64}$/.test(expectedArtifactSha256||'')||await mainTransitionDigest(artifact)!==expectedArtifactSha256)throw Error('MAIN_TRANSITION_ARTIFACT_CHANGED');
  const {upgrade,activation}=artifact||{};
  if(artifact.format!=='maktab-main-transition/v1'||artifact.databaseId!==mainId||!reviewed(upgrade,activation)||
    !await upgradeIntact(upgrade)||
    await mainTransitionDigest(activation.statements)!==activation.statementsSha256)throw Error('MAIN_TRANSITION_REVIEW_INCOMPLETE');
  const db=binding.withSession('first-primary');
  const receipt=async()=>{
    const row=await db.prepare("SELECT payload_sha256,result_json FROM operation_receipts WHERE dataset_key='CORE_ACTIVATION' AND scope_key='ACADEMY' AND operation_id=?").bind(activation.reviewId).first();
    if(!row)return null;if(row.payload_sha256!==activation.reviewSha256)throw Error('MAIN_TRANSITION_REVIEW_ID_REUSED');return JSON.parse(row.result_json);
  };
  const previous=await receipt();if(previous)return {...previous,replayed:true};
  try{await db.batch([...upgrade.statements,...activation.statements].map(({sql,params})=>db.prepare(sql).bind(...params)));}
  catch{const saved=await receipt();if(saved)return {...saved,replayed:true};throw Error('MAIN_TRANSITION_BATCH_REJECTED');}
  const saved=await receipt();if(!saved)throw Error('MAIN_TRANSITION_RECEIPT_UNAVAILABLE');return saved;
}

// The future short-lived controller has a fixed compiled artifact and no SQL
// request body. Generating or importing this factory does not deploy a Worker.
export function reviewedMainTransitionWorker(artifact,{artifactSha256}={}) {
  if(!reviewed(artifact?.upgrade,artifact?.activation)||artifact.databaseId!==mainId)throw Error('MAIN_TRANSITION_REVIEW_INCOMPLETE');
  return {async fetch(request,env){
    const reject=(code,status)=>Response.json({success:false,code},{status,headers:{'Cache-Control':'no-store'}});
    if(env.MAIN_DATABASE_ID!==mainId||env.MAIN_TRANSITION_ENABLED!=='OWNER_REVIEWED'||typeof env.MAIN_TRANSITION_TOKEN!=='string'||env.MAIN_TRANSITION_TOKEN.length<40)return reject('TRANSITION_DISABLED',503);
    if(request.headers.has('Origin'))return reject('FORBIDDEN',403);
    const header=request.headers.get('Authorization')||'';
    if(!header.startsWith('Bearer ')||header.length>256)return reject('UNAUTHORIZED',401);
    const a=await mainTransitionDigest(header.slice(7)),b=await mainTransitionDigest(env.MAIN_TRANSITION_TOKEN);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
    if(diff)return reject('UNAUTHORIZED',401);
    if(request.method!=='POST'||new URL(request.url).pathname!=='/activate')return reject('INVALID_TRANSITION_REQUEST',400);
    if(request.body){const reader=request.body.getReader();const first=await reader.read();await reader.cancel();if(!first.done||first.value?.byteLength)return reject('INVALID_TRANSITION_REQUEST',400);}
    try{return Response.json({success:true,...await applyMainTransitionD1(env.ACADEMY_DB,artifact,{expectedArtifactSha256:artifactSha256})},{headers:{'Cache-Control':'no-store'}});}
    catch(error){return reject(error.message==='MAIN_TRANSITION_BATCH_REJECTED'?'MAIN_TRANSITION_BATCH_REJECTED':'MAIN_TRANSITION_NOT_CONFIRMED',error.message==='MAIN_TRANSITION_BATCH_REJECTED'?409:503);}
  }};
}
