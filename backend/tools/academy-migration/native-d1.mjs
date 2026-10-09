// Tool/test adapter only. Deployed Workers use the actual ACADEMY_DB binding.
export function nativeBinding(db,queries=[]) {
  function prepare(sql,values=[]) {
    const perform=()=>{queries.push(sql);const results=db.prepare(sql).all(...values);const changes=db.prepare('SELECT changes() AS n').get().n;return {success:true,results,meta:{changes,rows_read:0,rows_written:0}};};
    return {bind:(...next)=>prepare(sql,next),all:async()=>perform(),run:async()=>perform(),first:async column=>{const row=perform().results[0] || null;return column?row?.[column] ?? null:row;}};
  }
  const binding={prepare,batch:async statements=>{db.exec('BEGIN IMMEDIATE');try{const result=[];for(const s of statements)result.push(await s.all());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};
  return {...binding,withSession:()=>binding};
}
