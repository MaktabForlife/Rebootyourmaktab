import {liveRoles,same} from './management-store.js';

export async function teacherDesignations(repository) {
  const db=repository.db;
  const available=Boolean(await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='academy_teacher_designations'").first());
  return {available,statement:db.prepare(available?'SELECT * FROM academy_teacher_designations':'SELECT account_id FROM accounts WHERE 0')};
}

export const academyTeacher=(data,accountId)=>Boolean(data.teachers?.some(t=>same(t.account_id,accountId)&&t.active));
export function eligibleTeacher(data,accountId) {
  return Boolean(data.accounts.some(a=>same(a.account_id,accountId)&&a.active)&&
    (academyTeacher(data,accountId)||data.activities.some(a=>a.active&&a.lifecycle==='ACTIVE'&&liveRoles(data,accountId,a.activity_key).includes('TEACHER'))));
}
export const teacherDirectory=data=>data.accounts.filter(a=>eligibleTeacher(data,a.account_id)).map(a=>({accountId:a.account_id,name:a.display_name})).sort((a,b)=>a.name.localeCompare(b.name));
