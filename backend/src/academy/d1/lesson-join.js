import {d1Entrance} from './entrance.js';
import {rehearsalError} from './repository.js';

// Cached schedules contain a lesson reference, never a meeting URL. Resolve the
// immutable publication again using current account, enrolment and lifecycle data.
export async function d1LessonJoin(repository,auth,input,now=new Date()) {
  if(typeof input.joinKey!=='string'||!input.joinKey||input.joinKey.length>1200||
    typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    throw rehearsalError('Refresh the timetable and select a lesson.',400,'INVALID_LESSON');
  const current=await d1Entrance(repository,auth.state,auth.user,{startDate:input.date},now,{days:1});
  const lesson=current.personalTimetable.find(row=>row.joinKey===input.joinKey);
  if(!lesson)throw rehearsalError('This lesson has changed or is no longer available to you. Refresh the timetable.',403,'LESSON_UNAVAILABLE');
  if(!lesson.joinUrl||!/^https:\/\//i.test(lesson.joinUrl))
    throw rehearsalError('Joining is available from 5 minutes before the lesson until it ends.',409,'LESSON_NOT_OPEN');
  return {joinUrl:lesson.joinUrl};
}

export function websiteEntrance(result) {
  const withoutLink=({joinUrl:_,...row})=>row;
  return {...result,timetable:result.timetable.map(withoutLink),personalTimetable:result.personalTimetable.map(withoutLink),
    activity:result.activity?{...result.activity,timetable:result.activity.timetable.map(withoutLink)}:null};
}
