import {liveRoles,same,managementError} from './management-store.js';

export function managedCourseScopes(state) {
  return state.activities.filter(a=>a.kind==='COURSE'&&(state.account.global_admin||
    state.roles.some(r=>same(r.activity_key,a.activity_key)&&r.role==='PROGRAM_ADMIN'))).map(a=>a.activity_key);
}

export function courseManagementData(data,auth) {
  if(auth.state.account.global_admin)return data;
  const scopes=data.activities.filter(a=>a.kind==='COURSE'&&a.active&&a.lifecycle==='ACTIVE'&&
    liveRoles(data,auth.user.accountid,a.activity_key).includes('PROGRAM_ADMIN')).map(a=>a.activity_key);
  if(!scopes.length)throw managementError('This action requires a Global Admin or an assigned Course Program Admin.',403,'FORBIDDEN');
  // The existing Course domain services see only the verified Course scopes.
  // Account names remain available for choosing teachers and learners.
  return Object.fromEntries(Object.entries(data).map(([name,value])=>[name,
    Array.isArray(value)?value.filter(row=>!row.activity_key||scopes.some(s=>same(s,row.activity_key))):value]));
}
