// Test-only, request-scoped binding instrumentation. No SQL, parameters,
// credentials, learner identifiers or result bodies are retained.
export function profileD1(binding) {
  const metrics={calls:0,statements:0,milliseconds:0},originals=new WeakMap();
  async function measure(count,operation) {
    const at=performance.now();metrics.calls++;metrics.statements+=count;
    try{return await operation();}finally{metrics.milliseconds+=performance.now()-at;}
  }
  function wrap(session) {
    function statement(raw) {
      const result={bind:(...values)=>statement(raw.bind(...values)),
        first:column=>measure(1,()=>raw.first(column)),all:()=>measure(1,()=>raw.all()),run:()=>measure(1,()=>raw.run())};
      originals.set(result,raw);return result;
    }
    return {prepare:sql=>statement(session.prepare(sql)),batch:statements=>measure(statements.length,()=>session.batch(statements.map(s=>originals.get(s))))};
  }
  return {metrics,binding:{...wrap(binding),withSession:constraint=>wrap(binding.withSession(constraint))}};
}
