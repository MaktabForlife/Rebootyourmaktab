import {readFileSync} from 'node:fs';
import {learningFixture} from './academy-d1-learning-fixture.mjs';
import {buildOperationalImport} from '../../tools/academy-migration/operational.mjs';
import {buildCourseCalendarImport,importCourseCalendarPlan} from '../../tools/academy-migration/course-calendar.mjs';
export async function courseFixture(edit=()=>{}) {
  const f=await learningFixture(edit);
  f.db.exec(readFileSync(new URL('../../migrations/academy/0006_course_calendar_workflows.sql',import.meta.url),'utf8'));
  f.course=buildCourseCalendarImport(f.snapshot,await buildOperationalImport(f.snapshot,f.policy));
  importCourseCalendarPlan(f.db,f.course);return f;
}
