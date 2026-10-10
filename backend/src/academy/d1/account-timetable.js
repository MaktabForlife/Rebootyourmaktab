import {d1Entrance} from './entrance.js';
import {addDays,lessonTimes} from '../entrance.js';
import {dateInTimezone} from '../../lib/global-subject-delivery.js';
import {managementError} from './management-store.js';

const monday=date=>addDays(date,-((new Date(date+'T12:00:00Z').getUTCDay()+6)%7));
// The older account screen gets the same filtered publications, memberships
// and private-link gate as Academy Home, with its original response shape.
export async function d1AccountTimetable(repository,auth,input,now=new Date()) {
  const days=input.days===undefined?2:Number(input.days);
  if(!Number.isInteger(days)||days<1||days>14)throw managementError('Choose between 1 and 14 timetable days.');
  const result=await d1Entrance(repository,auth.state,auth.user,{startDate:input.startDate},now,{days,detailed:true});
  const sessions=result.timetable.map((row,index)=>{
    const detail=Array.isArray(row.information),times=lessonTimes(row),current=row.status==='SCHEDULED'&&now.getTime()>=times.startsAt&&now.getTime()<times.endsAt;
    return {eventKey:'AE'+String(index+1).padStart(4,'0'),kind:row.kind==='COURSE'?'GLOBAL':'PROGRAM',
      programId:row.activityId,programName:row.activityName,subjectId:row.kind==='COURSE'?row.activityId:'',runId:row.offeringId||'',
      date:row.date,startTime:row.startTime,endTime:row.endTime,timezone:row.timezone,title:row.title,status:row.status,
      relevant:row.relevant,visibilityLevel:detail?'DETAIL':'LABEL',isCurrent:current,canOpenZoom:Boolean(current&&row.joinUrl),
      ...(detail?{subjectName:row.subjectName||'',moduleName:row.moduleName||'',teacherName:row.teacherName||'',group:row.group||''}:{}),
      ...(current&&row.joinUrl?{zoomLink:row.joinUrl}:{})};
  });
  return {version:'D1',store:'D1',timezone:result.timezone,weekStart:monday(result.startDate),weekEnd:addDays(monday(result.endDate),6),
    viewStart:result.startDate,viewEnd:result.endDate,viewDays:days,today:dateInTimezone(now,result.timezone),sessions,
    calendarEvents:result.calendarEvents||[],warnings:result.warnings.map(message=>({code:'ACADEMY_TIMETABLE_WARNING',message})),count:sessions.length};
}
