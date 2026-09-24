import { problem } from './model.js';
import { payloadHash } from './timetable-model.js';
// One instance per Program. The journal survives eviction; canonical data stays in
// Sheets. State revisions are append-only so even a late external write cannot
// replace a newer draft or publication pointer.
export function timetableCoordinator(journal, open) {
  let tail=Promise.resolve();
  async function execute(action,input,credential) {
    const {service,user}=await open(input.id,credential); // Fresh authority INSIDE the queue.
    const pending=await journal.get();
    if (action==='recover') {
      if (!pending) return {recovered:false};
      return finish(service,pending);
    }
    if (action==='prepare') {
      if (pending&&pending.kind!=='prepare') throw problem('An earlier save or publication needs recovery first.',409);
      if (!pending) await journal.set({kind:'prepare'});
      await service.prepare(); await journal.clear(); return {prepared:true};
    }
    if (!['save','publish','manage-save'].includes(action)) throw problem('Unknown timetable change.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId||'')) throw problem('This change needs a valid retry identifier.');
    const hash=await payloadHash({action,input});
    if (pending) {
      if (pending.operationId!==input.operationId||pending.hash!==hash) throw problem('An earlier change needs recovery. Recover it before saving new edits.',409);
      return finish(service,pending);
    }
    const receipt=await service.receipt(input.operationId,hash);
    if (receipt) return receipt;
    const planned=await service.plan(action,input,user,hash);
    const intent={kind:'write',operationId:input.operationId,hash,...planned};
    await journal.set(intent); // Storage output gate persists intent before external I/O.
    return finish(service,intent);
  }
  async function finish(service,intent) {
    if (intent.kind==='prepare') {await service.prepare();await journal.clear();return {prepared:true,recovered:true};}
    const receipt=await service.receipt(intent.operationId,intent.hash);
    if (!receipt) await service.apply(intent.plan);
    await journal.clear();
    return {...(receipt||intent.result),recovered:true};
  }
  return {run(action,input,credential) {
    const result=tail.then(()=>execute(action,input,credential));
    tail=result.catch(()=>{});
    return result;
  }};
}
