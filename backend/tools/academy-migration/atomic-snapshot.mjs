export const identifier=name=>'"'+name.replaceAll('"','""')+'"';
export const schemaQuery="SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND sql IS NOT NULL ORDER BY type,name";

// SQL-side comparison inside the SAME transaction as activation. Nested arrays
// preserve nulls/types and stay below D1's 32-argument SQL-function limit.
// No hash extension, table-wide JSON object or extra per-table round trip.
export function atomicSnapshotGuard(db) {
  const schema=db.prepare(schemaQuery).all(),names=schema.filter(r=>r.type==='table').map(r=>r.name);
  const aggregate=(table,columns)=>{
    const chunks=[];for(let i=0;i<columns.length;i+=32)chunks.push(`json_array(${columns.slice(i,i+32).map(identifier).join(',')})`);
    if(chunks.length>32)throw Error('ATOMIC_SNAPSHOT_LIMIT_EXCEEDED');
    return `SELECT json_group_array(json(row_value)) FROM (SELECT json_array(${chunks.join(',')}) AS row_value FROM ${table} ORDER BY row_value COLLATE BINARY)`;
  };
  const queries=[aggregate(`(${schemaQuery})`,['type','name','tbl_name','sql']),...names.map(name=>aggregate(identifier(name),db.prepare(`PRAGMA table_info(${identifier(name)})`).all().map(c=>c.name)))];
  const params=queries.map(sql=>Object.values(db.prepare(sql).get())[0]);
  const condition=queries.map(sql=>`(${sql})=?`).join(' AND ');
  if(params.length+1>100||new TextEncoder().encode(condition).length>95000||params.some(value=>new TextEncoder().encode(value).length>1900000))throw Error('ATOMIC_SNAPSHOT_LIMIT_EXCEEDED');
  return {condition,params,tables:names.length,format:'sqlite-json-array/v1'};
}
