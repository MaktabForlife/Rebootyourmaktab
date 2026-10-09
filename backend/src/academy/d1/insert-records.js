// Callers supply fixed schema names and normalized records, never request keys.
// One bound JSON value avoids one D1 query per learner or published lesson.
export function insertRecords(prepare,table,records) {
  if(!records.length)return [];
  const columns=Object.keys(records[0]);
  return [prepare(`INSERT INTO ${table}(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)`,JSON.stringify(records))];
}
