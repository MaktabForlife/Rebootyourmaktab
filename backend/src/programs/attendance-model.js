import { problem, clean } from './model.js';
import { validDate } from './timetable-model.js';
import { publicationRecord, publicationSchedule } from './weekly-timetable.js';

export const ATTENDANCE_HEADERS = Object.freeze({
  ProgramAttendanceRegisters: ['RegisterID','CourseID','AttendanceDate','PublicationID','LessonAnchor','LessonJSON','LearnerCount','SubmittedDate','SubmittedByAccountID','OperationID'],
  ProgramAttendanceMarks: ['MarkID','RegisterID','AccountID','DisplayName','Status'],
  ProgramAttendanceOperations: ['OperationID','PayloadHash','ResultJSON','DateStamp','AccountID']
});
export const LESSON_STATUSES = Object.freeze(['PRESENT','ABSENT','EXCUSED']);

export function classLesson(lesson, classId, className) {
  return {...lesson, sourceAnchor:lesson.anchor,
    anchor:lesson.classIds.length>1?`${lesson.anchor}::${classId}`:lesson.anchor,
    classId,classIds:[classId],classNames:[className]};
}

export function scheduledLessons(publicationRows, program, date) {
  if (!validDate(date)) throw problem('Choose a valid attendance date.');
  const history=publicationRows.map(row=>publicationRecord(row,program));
  const schedule=publicationSchedule(history,date);
  const publication=schedule.publications.find(row=>row.id===schedule.currentPublicationId);
  if(!publication)return [];
  const weekday=new Date(`${date}T00:00:00Z`).getUTCDay();
  return publication.occurrences.filter(row=>row.kind!=='BREAK'&&row.status!=='CANCELLED' &&
    (publication.pattern==='WEEKLY'?row.weekday===weekday:row.date===date))
    .map(row=>({publicationId:publication.id,anchor:row.anchor,date,ruleId:row.ruleId,
      moduleId:row.moduleId||'',moduleName:row.moduleName||'',subjectName:row.subjectName||'',
      startTime:row.startTime,endTime:row.endTime,teacherId:row.teacherId||'',teacherName:row.teacherName||'',
      teacherIds:row.teacherIds||[row.teacherId].filter(Boolean),
      teacherNames:row.teacherNames||[row.teacherName].filter(Boolean),
      classIds:row.classIds||[],classNames:row.classNames||[]}));
}

export function lessonRoster(lesson, enrollments, accounts, date) {
  const students=new Map(accounts.filter(row=>row.Active&&(row.Roles||[]).includes('STUDENT')).map(row=>[row.AccountID,row]));
  const roster=new Map();
  for(const row of enrollments){
    if(!row.active||!lesson.classIds.includes(row.classId)||row.startDate&&row.startDate>date||row.endDate&&row.endDate<date)continue;
    const account=students.get(row.accountId);
    if(account)roster.set(row.accountId,{accountId:row.accountId,name:account.DisplayName||row.accountId});
  }
  return [...roster.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.accountId.localeCompare(b.accountId));
}

export function validateExceptions(input, lessons) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw problem('Choose attendance exceptions.');
  const keys=new Set(lessons.map(row=>row.anchor));
  if(Object.keys(input).some(anchor=>!keys.has(anchor)))throw problem('An exception refers to an unscheduled lesson. Reload the register.');
  const result=new Map();
  for(const lesson of lessons){
    const rows=input[lesson.anchor]||[];
    if(!Array.isArray(rows)||rows.length>1000)throw problem('Choose valid attendance exceptions.');
    const marks=new Map();
    for(const row of rows){
      const accountId=clean(row?.accountId),status=clean(row?.status).toUpperCase();
      if(!accountId||marks.has(accountId)||!['ABSENT','EXCUSED'].includes(status))throw problem('Each exception must name one learner and Absent or Excused.');
      marks.set(accountId,status);
    }
    result.set(lesson.anchor,marks);
  }
  return result;
}

export function readRegisters(registers, marks, programId) {
  const byId=new Map(),byLesson=new Map();
  for(const row of registers){
    if(row.CourseID!==programId||!validDate(row.AttendanceDate)||!row.RegisterID||byId.has(row.RegisterID))throw problem('Program attendance registers need repair.',409);
    const key=`${row.AttendanceDate}|${row.PublicationID}|${row.LessonAnchor}`;
    let lesson;try{lesson=JSON.parse(row.LessonJSON);}catch{throw problem('A submitted lesson snapshot is unreadable.',409);}
    if(lesson.anchor!==row.LessonAnchor||lesson.publicationId!==row.PublicationID||lesson.date!==row.AttendanceDate)throw problem('A submitted lesson snapshot does not match its register.',409);
    const count=Number(row.LearnerCount);
    if(!Number.isSafeInteger(count)||count<0)throw problem('A submitted register has an invalid learner count.',409);
    const register={id:row.RegisterID,date:row.AttendanceDate,lesson,learnerCount:count,submittedAt:row.SubmittedDate,submittedBy:row.SubmittedByAccountID,marks:[]};
    byId.set(row.RegisterID,register);byLesson.set(key,register);
  }
  const seen=new Set();
  for(const row of marks){
    const register=byId.get(row.RegisterID),key=`${row.RegisterID}|${row.AccountID}`;
    if(!register||!row.AccountID||seen.has(key)||!LESSON_STATUSES.includes(row.Status))throw problem('Program attendance marks need repair.',409);
    seen.add(key);register.marks.push({accountId:row.AccountID,name:row.DisplayName,status:row.Status});
  }
  if([...byId.values()].some(register=>register.marks.length!==register.learnerCount))throw problem('A submitted register is missing learner marks.',409);
  return {byLesson,registers:[...byId.values()]};
}

export function dayView(date, lessons, registerIndex, rosterForLesson, excusedPolicy='EXCUSED') {
  const rows=lessons.map(lesson=>{
    const register=registerIndex.get(`${date}|${lesson.publicationId}|${lesson.anchor}`);
    return {lesson,submitted:Boolean(register),registerId:register?.id||'',submittedAt:register?.submittedAt||'',
      marks:register?register.marks:rosterForLesson(lesson).map(row=>({...row,status:null}))};
  });
  const learners=new Map();
  for(const row of rows)for(const mark of row.marks){
    if(!learners.has(mark.accountId))learners.set(mark.accountId,{accountId:mark.accountId,name:mark.name,scheduled:0,submitted:0,present:0,absent:0,excused:0});
    const learner=learners.get(mark.accountId);learner.scheduled++;
    if(row.submitted){learner.submitted++;learner[mark.status.toLowerCase()]++;}
  }
  const summaries=[...learners.values()].map(row=>{
    let status='UNKNOWN';
    if(rows.every(item=>item.submitted)&&row.submitted===row.scheduled){
      if(row.present===row.scheduled)status='PRESENT';
      else if(row.present>0)status='PARTIAL';
      else if(row.excused===row.scheduled)status=excusedPolicy;
      else status='ABSENT';
    }
    return {...row,status,complete:rows.every(item=>item.submitted)&&row.submitted===row.scheduled};
  }).sort((a,b)=>a.name.localeCompare(b.name)||a.accountId.localeCompare(b.accountId));
  return {date,complete:rows.length>0&&rows.every(row=>row.submitted),scheduledLessons:rows.length,submittedLessons:rows.filter(row=>row.submitted).length,lessons:rows,learners:summaries};
}
