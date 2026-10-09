import { problem } from './model.js';
import { scheduledLessons, classLesson, lessonRoster, validateExceptions, readRegisters, dayView } from './attendance-model.js';
import { programToday, TIMETABLE_TIMEZONE } from './weekly-timetable.js';

const registerKey=(date,lesson)=>`${date}|${lesson.publicationId}|${lesson.anchor}`;
const senior=user=>user?.role==='GLOBAL_ADMIN'||user?.programRoles?.some(role=>['ADMIN','SENIOR'].includes(role));

export function attendanceService(repository,program,now=()=>new Date()) {
  const today=()=>programToday(TIMETABLE_TIMEZONE,now());
  const publicProgram={id:program.id,name:program.name};
  async function context(data,date,user){
    if(!data.source.prepared)throw problem('Publish and prepare the Program timetable before taking attendance.',409);
    const scheduled=scheduledLessons(data.source.tables.ProgramTimetablePublications,program,date);
    const [catalog,accounts]=await Promise.all([repository.timetable.catalog(data.source),repository.accounts()]);
    const registers=readRegisters(data.tables.ProgramAttendanceRegisters||[],data.tables.ProgramAttendanceMarks||[],program.id);
    const classes=new Map(catalog.classes.filter(row=>row.active).map(row=>[row.id,row]));
    const allowed=(lesson,klass)=>senior(user)||!user||lesson.teacherIds.includes(user.accountid)||klass?.classTeacherId===user.accountid;
    const lessons=[];
    for(const lesson of scheduled){
      if(!lesson.classIds.length)continue;
      const previous=registers.byLesson.get(registerKey(date,lesson));
      if(lesson.classIds.length>1&&previous){
        // Earlier releases saved shared lessons as one register. Keep that roster together.
        if(senior(user)||!user||lesson.teacherIds.includes(user.accountid)||
          lesson.classIds.some(id=>classes.get(id)?.classTeacherId===user.accountid))
          lessons.push({...previous.lesson,classId:'COMBINED',className:'Combined earlier register',combined:true});
        continue;
      }
      for(let index=0;index<lesson.classIds.length;index++){
        const classId=lesson.classIds[index],klass=classes.get(classId);
        if(!allowed(lesson,klass))continue;
        const scoped=classLesson(lesson,classId,klass?.name||lesson.classNames[index]||classId);
        const saved=registers.byLesson.get(registerKey(date,scoped));
        lessons.push(saved?{...saved.lesson,classId,className:scoped.classNames[0]}:scoped);
      }
    }
    const classViews=[...classes.values()].filter(klass=>senior(user)||!user||klass.classTeacherId===user.accountid||lessons.some(row=>row.classId===klass.id))
      .map(row=>({id:row.id,name:row.name}));
    for(const lesson of lessons)if(lesson.classId!=='COMBINED'&&!classViews.some(row=>row.id===lesson.classId))
      classViews.push({id:lesson.classId,name:lesson.className||lesson.classNames?.[0]||lesson.classId});
    classViews.sort((a,b)=>a.name.localeCompare(b.name));
    if(lessons.some(row=>row.classId==='COMBINED'))classViews.push({id:'COMBINED',name:'Combined earlier register'});
    const rosterForLesson=lesson=>lessonRoster(lesson,catalog.enrollments,accounts,date);
    return {lessons,classes:classViews,registers,rosterForLesson};
  }
  return {
    prepare:()=>repository.prepare(),
    async read(date=today(),user=null){
      const data=await repository.load();
      if(!data.prepared)return {program:publicProgram,prepared:false,date,today:today(),complete:false,classes:[],lessons:[],learners:[]};
      const {lessons,classes,registers,rosterForLesson}=await context(data,date,user);
      return {program:publicProgram,prepared:true,today:today(),scope:senior(user)?'PROGRAM':'ASSIGNED',classes,
        ...dayView(date,lessons,registers.byLesson,date===today()?rosterForLesson:()=>[])};
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
      const data=await repository.load();
      if(!data.prepared)throw problem('Prepare Program attendance tables first.',409);
      const {lessons,registers,rosterForLesson}=await context(data,date,user);
      if(!lessons.length)throw problem('No published lessons are scheduled for this Program on this date.',409);
      if(!['lesson','day'].includes(input.scope))throw problem('Choose one lesson or all lessons.');
      const classId=input.classId||'';
      const visible=classId?lessons.filter(row=>row.classId===classId):lessons;
      const selected=input.scope==='day'?visible:visible.filter(row=>row.anchor===input.anchor);
      if(!selected.length)throw problem('That class or lesson is unavailable. Reload the register.',409);
      if(input.scope==='lesson'&&selected.length!==1)throw problem('Choose one lesson.');
      const baseIds=input.baseRegisterIds||{};
      if(!baseIds||typeof baseIds!=='object'||Array.isArray(baseIds))throw problem('Refresh the attendance register.');
      const requested=selected.filter(row=>(date===today()&&!registers.byLesson.has(registerKey(date,row)))||Object.hasOwn(baseIds,row.anchor));
      if(!requested.length)throw problem('The selected lesson registers have already been submitted.',409);
      if(date!==today()&&requested.some(row=>!registers.byLesson.has(registerKey(date,row))))throw problem('Only submitted attendance can be edited for a previous date.',409);
      const exceptions=validateExceptions(input.exceptions||{},requested);
      const items=[],timestamp=now().toISOString();let edited=0,submitted=0,unchanged=0;
      for(const lesson of requested){
        const previous=registers.byLesson.get(registerKey(date,lesson));
        if(previous&&baseIds[lesson.anchor]!==previous.id)throw problem('This attendance register changed. Refresh before editing.',409);
        if(!previous&&Object.hasOwn(baseIds,lesson.anchor)&&baseIds[lesson.anchor])throw problem('This attendance register changed. Refresh before submitting.',409);
        const roster=previous?previous.marks:rosterForLesson(lesson);
        const exception=exceptions.get(lesson.anchor),ids=new Set(roster.map(row=>row.accountId));
        if([...exception.keys()].some(id=>!ids.has(id)))throw problem('An attendance exception names a learner outside this lesson. Reload the register.',409);
        const marks=roster.map(learner=>({...learner,status:exception.get(learner.accountId)||'PRESENT'}));
        if(previous&&marks.every(mark=>previous.marks.some(old=>old.accountId===mark.accountId&&old.status===mark.status))){unchanged++;continue;}
        const registerId=`REG-${crypto.randomUUID()}`;
        items.push({table:'ProgramAttendanceRegisters',record:{RegisterID:registerId,CourseID:program.id,AttendanceDate:date,PublicationID:lesson.publicationId,
          LessonAnchor:lesson.anchor,LessonJSON:JSON.stringify(lesson),LearnerCount:marks.length,SubmittedDate:timestamp,SubmittedByAccountID:user.accountid,OperationID:input.operationId}});
        for(const mark of marks)items.push({table:'ProgramAttendanceMarks',record:{MarkID:`MARK-${crypto.randomUUID()}`,RegisterID:registerId,
          AccountID:mark.accountId,DisplayName:mark.name,Status:mark.status}});
        if(previous)edited++;else submitted++;
      }
      const result={date,submittedLessons:submitted,editedLessons:edited,unchangedLessons:unchanged,
        submittedAnchors:items.filter(row=>row.table==='ProgramAttendanceRegisters').map(row=>row.record.LessonAnchor),
        alreadySubmittedLessons:selected.length-requested.length};
      items.push({table:'ProgramAttendanceOperations',record:{OperationID:input.operationId,PayloadHash:hash,ResultJSON:JSON.stringify(result),DateStamp:timestamp,AccountID:user.accountid}});
      return {plan:repository.plan(data,items),result};
    },
    apply:plan=>repository.apply(plan)
  };
}
