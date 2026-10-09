#!/usr/bin/env node
import {readFile,open,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {buildOperationalImport,importOperationalPlan} from './academy-migration/operational.mjs';
import {nativeBinding} from './academy-migration/native-d1.mjs';
import {stableJSON,requireCondition,SnapshotError} from './academy-migration/snapshot.mjs';
import {academyD1Repository} from '../src/academy/d1/repository.js';
import {d1Entrance} from '../src/academy/d1/entrance.js';
import {buildEntrance,lessonTimes} from '../src/academy/entrance.js';
import {programRoleAccounts} from '../src/profiles/program-roles.js';
import {validatePlatformSheetRows,isActivePlatformValue as active,authorityRank} from '../src/lib/platform-schema.js';
import {accessibleGlobalSubjectIds,dateInTimezone} from '../src/lib/global-subject-delivery.js';

const key=v=>String(v || '').trim().toUpperCase();
const tableRows=book=>Object.fromEntries(book.tabs.map(t=>[t.title,t.rows.slice(1).flatMap((r,i)=>r.some(v=>String(v??'').trim())?[{...Object.fromEntries(t.rows[0].map((h,j)=>[h,r[j]??''])),_rowNumber:i+2}]:[])]));
const compare=(a,b,code)=>{const field=Object.keys(a).find(k=>stableJSON(a[k])!==stableJSON(b[k]));requireCondition(stableJSON(a)===stableJSON(b),code,{field});};
export async function compareSnapshotFlow(snapshot,policy) {
  const plan=await buildOperationalImport(snapshot,policy),db=new DatabaseSync(':memory:');
  try {
    importOperationalPlan(db,plan);
    const env={ACADEMY_DB:nativeBinding(db),ENVIRONMENT:'local',ACADEMY_D1_MODE:'REHEARSAL'};
    const tables=tableRows(snapshot.workbooks[0]);
    tables.GlobalSubjectAccessMatrix=validatePlatformSheetRows('GlobalSubjectAccessMatrix',snapshot.workbooks[0].tabs.find(t=>t.title==='GlobalSubjectAccessMatrix').rows);
    const sourcePrograms=plan.tables.program_settings.map(p=>{
      const activity=plan.tables.activities.find(a=>a.activity_key===p.activity_key);
      return {id:activity.activity_id,name:activity.name,timezone:p.timezone,status:'DRAFT',mode:'PROGRAM',capabilities:{attendance:true}};
    });
    const roleAccounts=Object.fromEntries(sourcePrograms.map(p=>[p.id,programRoleAccounts(tables,p.id,Boolean(tables.AcademyAccessScopes))]));
    const programData=Object.fromEntries(sourcePrograms.map(p=>[p.id,{prepared:true,tables:tableRows(snapshot.workbooks.find(b=>key(b.courseId)===key(p.id))),subjects:[...(tables.AcademySubjectList||[]),...tables.GlobalSubjectList]}]));
    const baseline=async(user,input,now)=>buildEntrance({tables,programs:sourcePrograms,rolesByProgram:roleAccounts,user,input,now,loadProgram:async p=>programData[p.id]});
    const now=new Date(snapshot.completedAt),timezone=plan.tables.academy_settings.find(r=>r.setting_key==='PlatformTimezone')?.setting_value;
    requireCondition(timezone,'PLATFORM_TIMEZONE_REQUIRED');
    const startDate=dateInTimezone(now,timezone),ids=['',...plan.tables.activities.map(a=>a.activity_id)];
    const visitor=await baseline(null,{startDate},now);
    const firstLesson=visitor.timetable.find(e=>Number.isFinite(lessonTimes(e).startsAt));
    const clocks=[now,...(firstLesson?[new Date(lessonTimes(firstLesson).startsAt-4*60000)]:[])];
    let accountsChecked=0,contextsChecked=0,pageComparisons=0,roleGrantsChecked=0;
    for(const clock of clocks)for(const id of ids) {
      const repo=academyD1Repository(env);
      compare(await baseline(null,{startDate,...(id?{id}:{})},clock),await d1Entrance(repo,null,null,{startDate,...(id?{id}:{})},clock),'ANONYMOUS_HOME_PARITY_FAILED');
      pageComparisons++;
    }
    for(const sourceAccount of tables.UserAccounts.filter(a=>active(a.Active))) {
      const repo=academyD1Repository(env),state=await repo.byId(sourceAccount.AccountID);
      requireCondition(state,'ACTIVE_ACCOUNT_MISSING');
      compare([state.account.account_id,state.account.display_name,state.account.login_link_id,state.account.pin_hash,Boolean(state.account.pin_setup)],
        [sourceAccount.AccountID,sourceAccount.DisplayName,sourceAccount.UniqueID,String(sourceAccount.PINHash || ''),active(sourceAccount.PINSetup)],'ACCOUNT_CREDENTIAL_PARITY_FAILED');
      const expected=[];
      if(key(sourceAccount.PlatformRole)==='GLOBAL_ADMIN')expected.push({scope:'PLATFORM',courseId:'',courseName:'M4L Platform',role:'GLOBAL_ADMIN'});
      for(const p of sourcePrograms)for(const role of roleAccounts[p.id].find(a=>key(a.AccountID)===key(sourceAccount.AccountID)).Roles) {
        roleGrantsChecked++;
        if(key(sourceAccount.PlatformRole)!=='GLOBAL_ADMIN')expected.push({scope:'COURSE',courseId:p.id,courseName:p.name,role,programLibrary:true});
      }
      expected.sort((a,b)=>authorityRank(a.role)-authorityRank(b.role)||a.courseName.localeCompare(b.courseName)||a.role.localeCompare(b.role));
      if(key(sourceAccount.PlatformRole)!=='GLOBAL_ADMIN'&&accessibleGlobalSubjectIds({account:sourceAccount,subjects:tables.GlobalSubjectList,policyRows:tables.GlobalSubjectAccessPolicy,accessRows:tables.GlobalSubjectAccessMatrix}).size)
        expected.push({scope:'GLOBAL',courseId:'',courseName:'Global Subjects',role:'STUDENT'});
      compare(state.contexts,expected,'ACCOUNT_CONTEXT_PARITY_FAILED');
      requireCondition(state.contexts.length,'ACCOUNT_HAS_NO_CONTEXT');
      for(const context of state.contexts) {
        const user={type:'account',accountid:sourceAccount.AccountID,role:context.role,scope:context.scope,courseid:context.courseId};
        for(const clock of clocks)for(const id of ids) {
          const input={startDate,...(id?{id}:{})};
          compare(await baseline(user,input,clock),await d1Entrance(repo,state,user,input,clock),'SIGNED_IN_HOME_PARITY_FAILED');
          pageComparisons++;
        }
        contextsChecked++;
      }
      accountsChecked++;
    }
    return {success:true,accountIdentityAndCredentials:'PASS',permissionContexts:'PASS',homeProjection:'PASS',accountsChecked,contextsChecked,roleGrantsChecked,
      activitiesChecked:plan.tables.activities.length,clockScenarios:clocks.length,pageComparisons,externalRequests:0,
      realAccountPinsUsed:false,cutoverReady:false};
  } finally {db.close();}
}
if(process.argv[1]===new URL(import.meta.url).pathname) {
  try {
    const options=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2],process.argv[3+i*2]]));
    requireCondition(options['--snapshot']&&options['--policy']&&options['--output'],'INVALID_ARGUMENTS');
    const report=await compareSnapshotFlow(JSON.parse(await readFile(options['--snapshot'],'utf8')),JSON.parse(await readFile(options['--policy'],'utf8')));
    await mkdir(dirname(options['--output']),{recursive:true,mode:0o700});
    const file=await open(options['--output'],'wx',0o600);try{await file.writeFile(JSON.stringify(report,null,2));}finally{await file.close();}
    console.log(JSON.stringify(report,null,2));
  }catch(error){console.error(JSON.stringify({success:false,code:error instanceof SnapshotError?error.code:'D1_PARITY_CHECK_FAILED'}));process.exitCode=1;}
}
