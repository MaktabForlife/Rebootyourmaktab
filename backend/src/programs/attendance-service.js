import { problem } from './model.js';
import { scheduledLessons, lessonRoster, validateExceptions, readRegisters, dayView } from './attendance-model.js';
import { programToday, TIMETABLE_TIMEZONE } from './weekly-timetable.js';

export function attendanceService(repository,program,now=()=>new Date()) {
  const today=()=>programToday(TIMETABLE_TIMEZONE,now());
  const publicProgram={id:program.id,name:program.name};
  async function context(data,date){
    if(!data.source.prepared)throw problem('Publish and prepare the Program timetable before taking attendance.',409);
    const lessons=scheduledLessons(data.source.tables.ProgramTimetablePublications,program,date);
    const [catalog,accounts]=await Promise.all([repository.timetable.catalog(data.source),repository.accounts()]);
    const registers=readRegisters(data.tables.ProgramAttendanceRegisters||[],data.tables.ProgramAttendanceMarks||[],program.id);
    const rosterForLesson=lesson=>lessonRoster(lesson,catalog.enrollments,accounts,date);
    return {lessons,registers,rosterForLesson};
  }
  return {
    prepare:()=>repository.prepare(),
    async read(date=today(),user=null){
      const data=await repository.load();
      if(!data.prepared)return {program:publicProgram,prepared:false,date,today:today(),complete:false,lessons:[],learners:[]};
      const {lessons,registers,rosterForLesson}=await context(data,date);
      const admin=user?.role==='GLOBAL_ADMIN'||user?.programRoles?.some(role=>['ADMIN','SENIOR'].includes(role));
      const visible=admin||!user?lessons:lessons.filter(row=>row.teacherIds.includes(user.accountid));
      return {program:publicProgram,prepared:true,today:today(),scope:admin?'PROGRAM':'ASSIGNED',
        ...dayView(date,visible,registers.byLesson,date===today()?rosterForLesson:()=>[])};
    },
    async receipt(operationId,hash){
      const data=await repository.load();
      const row=(data.tables.ProgramAttendanceOperations||[]).find(item=>item.OperationID===operationId);
      if(!row)return null;
      if(row.PayloadHash!==hash)throw problem('This retry identifier was used for different attendance details.',409);
      return {...JSON.parse(row.ResultJSON),replayed:true};
    },
    async plan(action,input,user,hash){
      if(action!=='save')throw problem('Unknown attendance change.');
      if(program.status==='ARCHIVED')throw problem('Archived Programs cannot accept attendance.',409);
      const date=input.date;
      if(date!==today())throw problem('Take attendance for the current Program day. Historical registers are read only.',409);
      const data=await repository.load();
      if(!data.prepared)throw problem('Prepare Program attendance tables first.',409);
      const {lessons,registers,rosterForLesson}=await context(data,date);
      if(!lessons.length)throw problem('No published lessons are scheduled for this Program today.',409);
      if(!['lesson','day'].includes(input.scope))throw problem('Choose one lesson or all lessons today.');
      const permitted=user.role==='GLOBAL_ADMIN'||user.programRoles?.some(role=>['ADMIN','SENIOR'].includes(role));
      const visible=permitted?lessons:lessons.filter(row=>row.teacherIds.includes(user.accountid));
      const selected=input.scope==='day'?visible:visible.filter(row=>row.anchor===input.anchor);
      if(!selected.length)throw problem('That lesson is not scheduled today. Reload the register.',409);
      if(input.scope==='lesson'&&selected.length!==1)throw problem('Choose one lesson.');
      const pending=selected.filter(row=>!registers.byLesson.has(`${date}|${row.publicationId}|${row.anchor}`));
      if(!pending.length)throw problem('The selected lesson registers have already been submitted.',409);
      const exceptions=validateExceptions(input.exceptions||{},pending);
      const items=[],timestamp=now().toISOString();
      for(const lesson of pending){
        const roster=rosterForLesson(lesson),exception=exceptions.get(lesson.anchor),ids=new Set(roster.map(row=>row.accountId));
        if([...exception.keys()].some(id=>!ids.has(id)))throw problem('An attendance exception names a learner outside this lesson. Reload the register.',409);
        const registerId=`REG-${crypto.randomUUID()}`;
        items.push({table:'ProgramAttendanceRegisters',record:{RegisterID:registerId,CourseID:program.id,AttendanceDate:date,PublicationID:lesson.publicationId,
          LessonAnchor:lesson.anchor,LessonJSON:JSON.stringify(lesson),LearnerCount:roster.length,SubmittedDate:timestamp,SubmittedByAccountID:user.accountid,OperationID:input.operationId}});
        for(const learner of roster)items.push({table:'ProgramAttendanceMarks',record:{MarkID:`MARK-${crypto.randomUUID()}`,RegisterID:registerId,
          AccountID:learner.accountId,DisplayName:learner.name,Status:exception.get(learner.accountId)||'PRESENT'}});
      }
      const result={date,submittedLessons:pending.length,submittedAnchors:pending.map(row=>row.anchor),alreadySubmittedLessons:selected.length-pending.length};
      items.push({table:'ProgramAttendanceOperations',record:{OperationID:input.operationId,PayloadHash:hash,ResultJSON:JSON.stringify(result),DateStamp:timestamp,AccountID:user.accountid}});
      return {plan:repository.plan(data,items),result};
    },
    apply:plan=>repository.apply(plan)
  };
}
