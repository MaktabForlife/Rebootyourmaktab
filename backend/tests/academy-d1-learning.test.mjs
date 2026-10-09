import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {learningFixture,subject,level,moduleId,resource,root,fileId,coverId,withLearningSource} from './fixtures/academy-d1-learning-fixture.mjs';
import {PROGRAM_IDS,fixtureTab} from './fixtures/academy-migration-fixture.mjs';
import {fixtureDatabase} from './fixtures/academy-d1-fixture.mjs';
import {buildOperationalImport} from '../tools/academy-migration/operational.mjs';
import {buildLearningImport,importLearningPlan} from '../tools/academy-migration/learning.mjs';
import {ATTENDANCE_HEADERS} from '../src/programs/attendance-model.js';
import {ACADEMY_LIBRARY_HEADERS} from '../src/lib/academy-library-policy.js';
import {programToday,WEEKLY_SCHEMA} from '../src/programs/weekly-timetable.js';
import worker from '../src/worker.js';
const timetablePath='/api/admin/platform/program-timetable/',attendancePath='/api/program-attendance/',libraryPath='/api/admin/platform/program-library/';
const id=PROGRAM_IDS[0],activity=`PROGRAM:${id}`,today=()=>programToday('Africa/Johannesburg');
const post=async(env,path,input={},token='')=>{const response=await worker.fetch(new Request(`http://localhost${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input)}),env);return {status:response.status,body:await response.json()};};
const login=async(env,suffix='0001')=>{const result=await post(env,'/api/account/login',{uniqueid:`login-${suffix}`,pin:'1234'});assert.equal(result.status,200,JSON.stringify(result.body));return result.body.token;};
const ok=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
const draft=()=>({format:WEEKLY_SCHEMA,timezone:'Africa/Johannesburg',rules:[{id:'RULE-d1-publish',programSubjectId:subject,moduleId,teacherId:'account-0003',classIds:['class-1'],weekdays:[0,1,2,3,4,5,6],startTime:'10:00',endTime:'11:00',zoomLink:'https://zoom.us/j/12345678901'}]});
async function use(fn,edit) {
  const f=await learningFixture(edit),original=globalThis.fetch;let outbound=0;
  globalThis.fetch=async()=>{outbound++;throw Error('Unexpected external request');};
  try{await fn(f);assert.equal(outbound,0);assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM academy_write_guards').get().n,0);}
  finally{globalThis.fetch=original;f.db.close();}
}
test('learning workflows fail closed until the matching import is verified',async()=>{
  const f=await fixtureDatabase();f.db.exec(readFileSync(new URL('../migrations/academy/0004_management_transactions.sql',import.meta.url),'utf8'));
  try{const token=await login(f.env);assert.equal((await post(f.env,timetablePath+'get',{id},token)).body.code,'LEARNING_IMPORT_REQUIRED');
    f.db.exec(readFileSync(new URL('../migrations/academy/0005_learning_workflows.sql',import.meta.url),'utf8'));
    assert.equal((await post(f.env,attendancePath+'get',{id,date:today()},token)).status,503);
  }finally{f.db.close();}
});
test('published timetable writes are atomic, immutable and replayable, and Home uses the new version',()=>use(async({env,db,queries})=>{
  const token=await login(env,'0004'),initial=ok(await post(env,timetablePath+'get',{id},token));
  assert.equal(initial.managementEditable,true);assert.equal(initial.program.status,'ACTIVE');
  const preview=ok(await post(env,timetablePath+'preview',{id,draft:draft(),effectiveFrom:today()},token));assert.equal(preview.valid,true,JSON.stringify(preview));
  const input={id,revision:initial.revision,draft:draft(),effectiveFrom:today(),operationId:crypto.randomUUID()};
  const before=queries.length,result=ok(await post(env,timetablePath+'publish',input,token));assert.equal(result.version,2);
  assert.ok(queries.length-before<=50,`Publication used ${queries.length-before} queries`);
  assert.equal(ok(await post(env,timetablePath+'publish',input,token)).replayed,true);
  assert.equal(db.prepare('SELECT count(*) n FROM timetable_publications WHERE activity_key=?').get(activity).n,2);
  assert.equal(db.prepare('SELECT count(*) n FROM published_lessons WHERE publication_id=?').get(result.publicationId).n,7);
  assert.throws(()=>db.prepare('DELETE FROM timetable_publications WHERE publication_id=?').run(result.publicationId),/immutable/);
  assert.equal((await post(env,timetablePath+'save',{...input,operationId:crypto.randomUUID()},token)).status,409);
  assert.equal((await post(env,timetablePath+'get',{id:PROGRAM_IDS[1]},token)).status,403);
  const student=await login(env,'0002');assert.equal((await post(env,timetablePath+'publish',{...input,operationId:crypto.randomUUID()},student)).status,403);
  const home=ok(await post(env,'/api/academy/entrance',{id,startDate:today(),dayCount:1},student));
  assert.ok(JSON.stringify(home).includes('First module'));
  const management=ok(await post(env,timetablePath+'manage-get',{id,includeOverview:true},token));assert.equal(management.learningWorkflowsReady,true);assert.equal(management.overview.error,null);
}));
test('competing timetable publishes cannot overwrite one another; invalid conflicts leave no writes',()=>use(async({env,db})=>{
  const token=await login(env),initial=ok(await post(env,timetablePath+'get',{id},token));
  const input={id,revision:initial.revision,draft:draft(),effectiveFrom:today(),operationId:crypto.randomUUID()};
  const conflict={...draft(),rules:[...draft().rules,{...draft().rules[0],id:'RULE-overlap'}]};
  assert.equal((await post(env,timetablePath+'publish',{...input,draft:conflict},token)).status,409);
  assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
  const competing=await Promise.all([post(env,timetablePath+'publish',input,token),post(env,timetablePath+'publish',{...input,operationId:crypto.randomUUID()},token)]);
  assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
}));
test('teachers submit only assigned lessons; retries and edits preserve roster history',()=>use(async({env,db})=>{
  const teacher=await login(env,'0003'),student=await login(env,'0002'),other=await login(env,'0005');
  const initial=ok(await post(env,attendancePath+'get',{id,date:today()},teacher));assert.equal(initial.lessons.length,1);assert.equal(initial.complete,false);
  assert.equal(ok(await post(env,attendancePath+'get',{id,date:today()},other)).lessons.length,0);
  assert.equal((await post(env,attendancePath+'get',{id,date:today()},student)).status,403);
  const anchor=initial.lessons[0].lesson.anchor,input={id,date:today(),scope:'lesson',anchor,exceptions:{[anchor]:[{accountId:'account-0002',status:'ABSENT'}]},baseRegisterIds:{},operationId:crypto.randomUUID()};
  assert.equal((await post(env,attendancePath+'submit',input,other)).status,409);
  ok(await post(env,attendancePath+'submit',input,teacher));assert.equal(ok(await post(env,attendancePath+'submit',input,teacher)).replayed,true);
  assert.equal(db.prepare('SELECT count(*) n FROM attendance_registers').get().n,1);
  const saved=ok(await post(env,attendancePath+'get',{id,date:today()},teacher));assert.equal(saved.complete,true);
  const register=saved.lessons[0].registerId;assert.ok(register);
  const roster=db.prepare('SELECT count(*) n FROM attendance_marks').get().n;
  db.prepare('UPDATE class_memberships SET active=0 WHERE account_id=?').run('account-0008');
  ok(await post(env,attendancePath+'submit',{...input,baseRegisterIds:{[anchor]:register},exceptions:{[anchor]:[]},operationId:crypto.randomUUID()},teacher));
  assert.equal(db.prepare('SELECT count(*) n FROM attendance_marks').get().n,roster*2);
  assert.equal((await post(env,attendancePath+'submit',{...input,baseRegisterIds:{[anchor]:register},operationId:crypto.randomUUID()},teacher)).status,409);
  assert.throws(()=>db.exec('DELETE FROM attendance_marks'),/append-only/);
  const admin=await login(env),tt=ok(await post(env,timetablePath+'get',{id},admin));
  assert.equal((await post(env,timetablePath+'publish',{id,draft:draft(),revision:tt.revision,effectiveFrom:today(),operationId:crypto.randomUUID()},admin)).status,409);
  const tomorrow=new Date(Date.parse(today()+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  ok(await post(env,timetablePath+'publish',{id,draft:draft(),revision:tt.revision,effectiveFrom:tomorrow,operationId:crypto.randomUUID()},admin));
}));
test('attendance batches roll back on a failed mark and recover a lost acknowledgement',()=>use(async({env,db})=>{
  const token=await login(env,'0003'),data=ok(await post(env,attendancePath+'get',{id,date:today()},token)),anchor=data.lessons[0].lesson.anchor;
  const input={id,date:today(),scope:'day',exceptions:{},operationId:crypto.randomUUID()};
  db.exec("CREATE TRIGGER fail_mark BEFORE INSERT ON attendance_marks BEGIN SELECT RAISE(ABORT,'injected failure'); END");
  assert.equal((await post(env,attendancePath+'submit',input,token)).status,503);assert.equal(db.prepare('SELECT count(*) n FROM attendance_registers').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM operation_receipts').get().n,0);
  db.exec('DROP TRIGGER fail_mark');
  const session=env.ACADEMY_DB.withSession(),sql=new WeakMap();let lost=false;
  function tag(stmt,source){sql.set(stmt,source);const bind=stmt.bind;stmt.bind=(...args)=>tag(bind(...args),source);return stmt;}
  env.ACADEMY_DB={withSession:()=>({...session,prepare:source=>tag(session.prepare(source),source),batch:async statements=>{const result=await session.batch(statements);if(!lost&&sql.get(statements[0])?.includes('INSERT INTO academy_write_guards')){lost=true;throw Error('Lost acknowledgement');}return result;}})};
  assert.equal(ok(await post(env,attendancePath+'submit',input,token)).replayed,true);assert.equal(ok(await post(env,attendancePath+'submit',input,token)).replayed,true);
  assert.ok(anchor);
}));
test('Library catalogue contains metadata only and respects scoped roles, exclusions and archived parents',()=>use(async({env,db,queries})=>{
  const student=await login(env,'0002'),teacher=await login(env,'0003'),admin=await login(env,'0004');
  const before=queries.length,catalogue=ok(await post(env,'/api/academy/library/catalogue',{},student));assert.equal(catalogue.resources.length,1);assert.equal(catalogue.resources[0].id,`${activity}:${resource}`);
  assert.ok(queries.length-before<=50,`Catalogue used ${queries.length-before} queries`);
  assert.ok(!JSON.stringify(catalogue).includes(fileId));assert.ok(!JSON.stringify(catalogue).includes(coverId));
  assert.equal(ok(await post(env,'/api/program-library/catalogue',{id},teacher)).canManage,false);
  assert.equal((await post(env,libraryPath+'manage',{id},teacher)).status,403);
  assert.equal(ok(await post(env,libraryPath+'manage',{id},admin)).managementEditable,true);
  assert.equal((await post(env,libraryPath+'manage',{id:PROGRAM_IDS[1]},admin)).status,403);
  db.prepare('INSERT INTO library_access_policies VALUES(?,?,?,?)').run(`${activity}:${resource}`,'STAFF_ONLY','','');
  assert.equal(ok(await post(env,'/api/academy/library/catalogue',{},student)).resources.length,0);
  assert.equal(ok(await post(env,'/api/academy/library/catalogue',{},teacher)).resources.length,1);
  db.prepare('INSERT INTO library_exclusions VALUES(?)').run(`${activity}:${resource}`);
  assert.equal(ok(await post(env,'/api/academy/library/catalogue',{},teacher)).resources.length,0);
  db.exec('DELETE FROM library_exclusions');db.exec('DELETE FROM library_access_policies');
  db.prepare('UPDATE modules SET active=0 WHERE activity_key=?').run(activity);
  assert.equal(ok(await post(env,'/api/academy/library/catalogue',{},teacher)).resources.length,0);
}));
test('learning import excludes legacy workspaces and inactive account marks, validates source, and cannot run twice',async()=>{
  const f=await fixtureDatabase(12,s=>{
    withLearningSource(s);const book=s.workbooks[1],date='2026-10-08',pub='program-publication-1',anchor='RULE-flow-1@4';
    const publications=fixtureTab(s,'ProgramTimetablePublications',1),old=Object.fromEntries(publications.rows[0].map((h,i)=>[h,publications.rows[1][i]]));
    const current={...old,PublicationID:'current-publication',VersionNo:2,SnapshotJSON:JSON.stringify({...JSON.parse(old.SnapshotJSON),effectiveFrom:'2026-10-09'})};
    publications.rows.push(publications.rows[0].map(h=>current[h]??''));
    const state=fixtureTab(s,'ProgramTimetableState',1);state.rows[1][state.rows[0].indexOf('CurrentPublicationID')]='current-publication';
    const lesson={date,publicationId:pub,anchor,classIds:['class-1'],teacherIds:['account-0003']};
    const add=(name,record)=>{const headers=ATTENDANCE_HEADERS[name];book.tabs.push({title:name,rows:[headers,headers.map(h=>record[h]??'')]});};
    add('ProgramAttendanceRegisters',{RegisterID:'historical-1',CourseID:id,AttendanceDate:date,PublicationID:pub,LessonAnchor:anchor,LessonJSON:JSON.stringify(lesson),LearnerCount:2,SubmittedDate:s.completedAt,SubmittedByAccountID:'account-0003',OperationID:'historical-operation'});
    add('ProgramAttendanceMarks',{MarkID:'old-1',RegisterID:'historical-1',AccountID:'account-0002',DisplayName:'Active learner',Status:'PRESENT'});
    const marks=book.tabs.find(t=>t.title==='ProgramAttendanceMarks');marks.rows.push(marks.rows[0].map(h=>({MarkID:'old-2',RegisterID:'historical-1',AccountID:'account-0013',DisplayName:'Inactive learner',Status:'ABSENT'})[h]??''));
    s.workbooks[0].tabs.push({title:'AcademyLibraryAccess',rows:[ACADEMY_LIBRARY_HEADERS,[`${activity}:${resource}`,'ARCHIVED','ASSIGNED','',''],['COURSE:legacy-1:EBOOK:old','ACTIVE','ACADEMY_LEARNERS','','']]});
    s.workbooks.at(-1).tabs.push({title:'ProgramAttendanceRegisters',rows:[['invalid legacy header']]});
    for(const b of s.workbooks){b.tabs.forEach((t,i)=>t.sheetId=i);b.inventory=b.tabs.map(t=>({title:t.title,sheetId:t.sheetId}));}
  });
  try{const base=await buildOperationalImport(f.snapshot,f.policy),plan=buildLearningImport(f.snapshot,base);assert.equal(plan.summary.registers,1);assert.equal(plan.summary.marks,1);assert.equal(plan.summary.referencedHistoricalPublications,1);assert.equal(plan.summary.excludedInactiveAccountMarks,1);assert.equal(plan.summary.legacyWorkspacesImported,0);assert.equal(plan.policies.length,0);assert.equal(plan.exclusions.length,1);
    const invalid=structuredClone(f.snapshot),publications=fixtureTab(invalid,'ProgramTimetablePublications',1),column=publications.rows[0].indexOf('SnapshotJSON'),value=JSON.parse(publications.rows[1][column]);value.rules[0].moduleId='inactive-module';publications.rows[1][column]=JSON.stringify(value);
    assert.throws(()=>buildLearningImport(invalid,base),/ATTENDANCE_HISTORY_INACTIVE_MODULE/);
    for(const n of ['0004_management_transactions.sql','0005_learning_workflows.sql'])f.db.exec(readFileSync(new URL('../migrations/academy/'+n,import.meta.url),'utf8'));
    assert.throws(()=>importLearningPlan(f.db,{...plan,sourceSha256:'0'.repeat(64)}),/LEARNING_BASE_MISMATCH/);
    importLearningPlan(f.db,plan);assert.throws(()=>importLearningPlan(f.db,plan),/LEARNING_ALREADY_IMPORTED/);
    assert.equal(f.db.prepare('SELECT learner_count FROM attendance_registers').get().learner_count,1);
  }finally{f.db.close();}
});
test('the existing timetable, attendance and Library screens use the D1 contracts',()=>use(async({env,db})=>{
  const admin=await login(env,'0004'),teacher=await login(env,'0003');
  const initial=ok(await post(env,timetablePath+'get',{id},admin));
  ok(await post(env,timetablePath+'save',{id,revision:initial.revision,draft:draft(),operationId:crypto.randomUUID()},admin));
  db.prepare("UPDATE program_resources SET metadata_json=json_set(metadata_json,'$.CoverDriveFileID','')").run();
  const settle=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setTimeout(resolve,2));};
  function screen(markupPath,scriptPath,token,helpers=[]) {
    const markup=readFileSync(new URL(markupPath,import.meta.url),'utf8'),ids=new Set([...markup.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),elements=new Map(),storage=new Map(),requests=[];
    const element=id=>{assert.ok(ids.has(id),`Missing element ${id}`);if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',dataset:{},listeners:{},classList:{toggle(){},add(){},remove(){}},focus(){},removeAttribute(){},setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},querySelectorAll:()=>[],querySelector:()=>null,addEventListener(type,fn){this.listeners[type]=fn;}});return elements.get(id);};
    const context={console,URL,URLSearchParams,structuredClone,crypto,setTimeout,clearTimeout,Image:class{},
      location:{search:`?program=${id}`,host:'localhost',origin:'http://localhost'},history:{replaceState(){}},window:{M4L_CONFIG:{API_BASE:''},addEventListener(){}},
      localStorage:{getItem:k=>k==='m4l_account_token'?token:storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
      document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}},
      fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return worker.fetch(new Request(new URL(url,'http://localhost'),options),env);}};
    vm.createContext(context);for(const file of [...helpers,scriptPath])vm.runInContext(readFileSync(new URL(file,import.meta.url),'utf8'),context);
    return {element,requests};
  }
  const timetable=screen('../../programs/timetable.html','../../js/m4l-program-timetable.js',admin,['../../js/m4l-timetable-sync.js']);await settle();
  assert.equal(timetable.element('tt-planner').disabled,false,timetable.element('tt-message').textContent);
  timetable.element('tt-effective-from').value=today();await timetable.element('tt-publish').onclick();await settle();
  assert.match(timetable.element('tt-message').textContent,/Version 2 published/);
  assert.equal(db.prepare('SELECT max(version_no) v FROM timetable_publications WHERE activity_key=?').get(activity).v,2);
  const attendance=screen('../../programs/attendance.html','../../js/m4l-program-attendance.js',teacher);await settle();
  assert.match(attendance.element('pa-classes').innerHTML,/Synthetic class/);
  attendance.element('pa-classes').listeners.click({target:{closest:()=>({dataset:{submit:'class-1'}})}});await settle();
  assert.equal(db.prepare('SELECT count(*) n FROM attendance_registers').get().n,1,attendance.element('pa-message').textContent);
  const library=screen('../../programs/library.html','../../js/m4l-program-library.js',admin);await settle();
  assert.equal(library.element('pl-add-drive').disabled,false,library.element('pl-message').textContent);
  assert.equal(library.element('pl-add-device').disabled,true,'Device upload awaits explicit bridge setup');
  library.element('pl-list').onclick({target:{closest:()=>({dataset:{edit:resource}})}});
  assert.equal(library.element('pl-save').disabled,false);assert.equal(library.element('pl-name').value,'Synthetic book');
  assert.ok([...timetable.requests,...attendance.requests,...library.requests].every(r=>r.url.startsWith('/api/')));
}));
