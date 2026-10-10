// Preparing an empty projection validates a schema object without reading its
// records or scanning sqlite_schema. Only absent optional schema is suppressed.
export async function optionalSchema(db,sql) {
  try { await db.prepare(sql).all();return true; }
  catch(error) {
    if(/no such (?:table|column):/i.test(error.message))return false;
    throw error;
  }
}
