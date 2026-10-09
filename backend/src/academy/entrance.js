import { isActivePlatformValue as active, normalizePlatformIdentifier as key } from '../lib/platform-schema.js';
import { canAccountAccessGlobalSubject, dateInTimezone } from '../lib/global-subject-delivery.js';
import { buildGlobalCourseEvents, isAcademySessionCurrent } from '../routes/academy-timetable.js';
import { resolveCurrentPublishedGlobalTimetable } from '../lib/global-timetable.js';
import { publicationRecord, publicationSchedule } from '../programs/weekly-timetable.js';
import { managementState } from '../programs/management-model.js';
import { problem, clean } from '../programs/model.js';

// Verified against Development CourseRegistry and the new ProgramIdentity sheet.
// A missing/mismatched record is unavailable; there is deliberately no legacy fallback.
export const REBOOT_PILOT_PROGRAM_ID = 'PRG-46c8576d-9fcf-4000-96b9-856b00a0218a';
export const programDisplayName = program => key(program.id) === key(REBOOT_PILOT_PROGRAM_ID) ? 'Reboot' : program.name;
export const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && addDays(date, 0) === date;
const staff = roles => roles.some(role => ['ADMIN', 'SENIOR', 'TEACHER', 'GLOBAL_ADMIN'].includes(role));
const globalAdmin = user => user?.role === 'GLOBAL_ADMIN';
const participant = (row, accountId, date, classIds) => active(row.Active) && key(row.AccountID) === key(accountId) &&
  classIds.includes(row.ClassID) && (!row.StartDate || row.StartDate <= date) && (!row.EndDate || row.EndDate >= date);

export function programRoles(user, accounts = []) {
  if (!user) return [];
  if (globalAdmin(user)) return ['GLOBAL_ADMIN'];
  const matches = accounts.filter(row => key(row.AccountID) === key(user.accountid) && row.Active);
  return matches.length === 1 ? matches[0].Roles.filter(role => ['ADMIN', 'SENIOR', 'TEACHER', 'STUDENT'].includes(role)) : [];
}

export function programProjection(program, data, user, roles, start, end, now, detailed = false) {
  const name = programDisplayName(program);
  const snapshot = data.prepared ? managementState(data, program).snapshot : {};
  const classes = (snapshot.ProgramClasses || []).filter(row => row.CourseID === program.id && active(row.Active));
  const enrolments = (snapshot.ProgramEnrollments || []).filter(row => row.CourseID === program.id);
  const timetable = [];
  const history = (data.tables?.ProgramTimetablePublications || []).map(row => publicationRecord(row, program));
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const schedule = publicationSchedule(history, date);
    const publication = schedule.publications.find(row => row.id === schedule.currentPublicationId);
    if (!publication) continue;
    const publishedTimezone = publication.snapshot.timezone || program.timezone;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const row of publication.occurrences.filter(row => row.kind !== 'BREAK' && row.status !== 'CANCELLED' &&
      (publication.pattern === 'WEEKLY' ? row.weekday === weekday : row.date === date))) {
      const classIds = row.classIds || [];
      const teaching = staff(roles) && (row.teacherIds || [row.teacherId]).some(id => key(id) === key(user?.accountid));
      const enrolled = roles.includes('STUDENT') && enrolments.some(item => participant(item, user?.accountid, date, classIds));
      const oversight = roles.some(role => ['GLOBAL_ADMIN', 'ADMIN', 'SENIOR'].includes(role));
      const involved = Boolean(teaching || enrolled);
      const mayView = Boolean(user && roles.length && (staff(roles) || enrolled));
      const event = { kind: 'PROGRAM', activityId: program.id, activityName: name, date,
        startTime: row.startTime, endTime: row.endTime, timezone: publishedTimezone,
        title: detailed && mayView ? row.moduleName || row.subjectName || name : name,
        relevant: involved, involvement: teaching ? 'teacher' : enrolled ? 'student' : '',
        status: row.status || 'SCHEDULED' };
      if (mayView) event.information = [row.subjectName, row.moduleName,
        ...(row.classNames || []), ...(row.teacherNames || [row.teacherName])].filter(Boolean);
      if (detailed && mayView && (involved || oversight)) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: publishedTimezone,
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
        const currentDate = dateInTimezone(now, publishedTimezone);
        if (isAcademySessionCurrent(event, currentDate, Number(parts.hour) * 60 + Number(parts.minute)) && row.zoomLink)
          event.joinUrl = row.zoomLink;
      }
      timetable.push(event);
    }
  }
  const ownClasses = classes.filter(row => staff(roles) || roles.includes('STUDENT') &&
    enrolments.some(item => participant(item, user?.accountid, start, [row.ClassID])));
  const curriculum = roles.length ? (snapshot.ProgramSubjects || []).filter(row => row.CourseID === program.id && active(row.Active)).map(subject => ({
    id: subject.ProgramSubjectID,
    name: data.subjects?.find(row => row.SubjectID === subject.SubjectID)?.SubjectName || 'Subject',
    modules: (snapshot.ProgramModules || []).filter(row => row.ProgramSubjectID === subject.ProgramSubjectID && active(row.Active))
      .map(row => ({ id: row.ProgramModuleID, name: row.Name }))
  })) : [];
  return { id: program.id, name, kind: 'PROGRAM', roles,
    timetable, classes: ownClasses.map(row => ({ id: row.ClassID, name: row.Name })), curriculum,
    tools: { library: '/academy/library/',
      attendance: staff(roles) && program.capabilities?.attendance ? `/programs/attendance.html?id=${encodeURIComponent(program.id)}` : '',
      manage: globalAdmin(user) ? `/programs/manage.html?id=${encodeURIComponent(program.id)}` : '',
      timetableBuilder: globalAdmin(user) ? `/programs/timetable.html?id=${encodeURIComponent(program.id)}` : '',
      resources: staff(roles) ? `/programs/library.html?id=${encodeURIComponent(program.id)}` : '' } };
}

export async function buildEntrance({ tables, programs, rolesByProgram, loadProgram, user, input = {}, now = new Date() }) {
  const timezone = tables.PlatformConfig.find(row => key(row.ConfigKey) === 'PLATFORMTIMEZONE')?.ConfigValue || 'Africa/Johannesburg';
  const start = clean(input.startDate) || dateInTimezone(now, timezone);
  if (!validDate(start)) throw problem('Choose a valid timetable date.');
  const end = addDays(start, 6);
  const warnings = [], activities = [], timetable = [];
  const candidates = programs.filter(row => row.mode === 'PROGRAM' && row.status === 'DRAFT');
  const requestedId = clean(input.id);
  const account = user ? tables.UserAccounts.find(row => key(row.AccountID) === key(user.accountid) && active(row.Active)) : null;
  if (user && !account) throw problem('Your Academy session has ended.', 401);
  const selected = requestedId ? candidates.filter(row => key(row.id) === key(requestedId)) : candidates;
  const programViews = await Promise.all(selected.map(async program => {
    const roles = programRoles(user, rolesByProgram[program.id]);
    const basic = { id: program.id, name: programDisplayName(program), kind: 'PROGRAM', roles };
    try {
      const data = await loadProgram(program, Boolean(user && roles.length));
      return programProjection(program, data, user, roles, start, end, now, Boolean(requestedId));
    } catch {
      warnings.push(`${basic.name} timetable is unavailable.`);
      return { ...basic, timetable: [], classes: [], curriculum: [], tools: {}, unavailable: true };
    }
  }));
  activities.push(...programViews.map(({ timetable: _, classes, curriculum, tools, ...row }) => row));
  timetable.push(...programViews.flatMap(row => row.timetable));

  const subjects = tables.GlobalSubjectList.filter(row => active(row.Active));
  const platform = { subjects, policies: tables.GlobalSubjectAccessPolicy, matrix: tables.GlobalSubjectAccessMatrix,
    runs: tables.GlobalSubjectRuns, GlobalTimetableRunState: tables.GlobalTimetableRunState,
    GlobalTimetablePublications: tables.GlobalTimetablePublications, GlobalTimetableSessionLifecycle: tables.GlobalTimetableSessionLifecycle,
    PublishedGlobalTimetableSessions: tables.PublishedGlobalTimetableSessions };
  const courseViews = [];
  for (const subject of subjects.filter(row => !requestedId || key(row.SubjectID) === key(requestedId))) {
    const allowed = Boolean(user && (globalAdmin(user) || canAccountAccessGlobalSubject({ account, subject,
      policyRows: platform.policies, accessRows: platform.matrix })));
    const sessions = [];
    let unavailable = false;
    for (const run of platform.runs.filter(row => key(row.SubjectID) === key(subject.SubjectID) && active(row.Active))) {
      const resolved = resolveCurrentPublishedGlobalTimetable(platform, run.RunID, { startDate: start, endDate: end });
      if (!resolved.ok && tables.GlobalTimetableRunState.some(row => key(row.RunID) === key(run.RunID) && key(row.Stage) === 'PUBLISHED')) {
        unavailable = true;
        warnings.push(`${subject.SubjectName} timetable is unavailable.`);
      }
      const published = (resolved.sessions || []).filter(row => row.sessiondate >= start && row.sessiondate <= end);
      const runTimezone = resolved.sessions?.[0]?.timezone || run.Timezone || timezone;
      const events = buildGlobalCourseEvents({ ...platform, runs: [run] }, account || { AccountID: '', Active: true }, {
        isGlobalAdmin: globalAdmin(user), week: { start, end, today: dateInTimezone(now, timezone) },
        currentDate: dateInTimezone(now, runTimezone), currentMinutes: nowInMinutes(now, runTimezone) });
      for (const [index, event] of events.entries()) {
        const teaching = Boolean(user && key(published[index]?.teacheraccountid) === key(user.accountid));
        const relevant = Boolean(user && event.relevant);
        const projected = { kind: 'COURSE', activityId: subject.SubjectID, offeringId: run.RunID,
          activityName: subject.SubjectName, date: event.date, startTime: event.startTime, endTime: event.endTime,
          timezone: runTimezone, title: event.title, status: event.status,
          relevant, involvement: relevant ? teaching ? 'teacher' : 'student' : '' };
        if (user && event.visibilityLevel === 'DETAIL') projected.information = [event.subjectName, event.moduleName, event.teacherName].filter(Boolean);
        if (requestedId && user && event.canOpenZoom && event.zoomLink) projected.joinUrl = event.zoomLink;
        sessions.push(projected);
      }
    }
    const teacher = Boolean(user && sessions.some(row => row.relevant && row.involvement === 'teacher'));
    const learner = allowed || Boolean(user && sessions.some(row => row.involvement === 'student'));
    const roles = globalAdmin(user) ? ['GLOBAL_ADMIN'] : [...(learner ? ['STUDENT'] : []), ...(teacher ? ['TEACHER'] : [])];
    const view = { id: subject.SubjectID, name: subject.SubjectName, kind: 'COURSE', roles, timetable: sessions, unavailable,
      curriculum: roles.length ? tables.GlobalModuleList.filter(row => key(row.SubjectID) === key(subject.SubjectID) && active(row.Active))
        .map(row => ({ id: row.ModuleID, name: row.ModuleName, modules: [] })) : [], classes: [],
      tools: { library: '/academy/library/' } };
    courseViews.push(view);
    activities.push({ id: view.id, name: view.name, kind: view.kind, roles });
    timetable.push(...sessions);
  }
  if (!programs.some(row => key(row.id) === key(REBOOT_PILOT_PROGRAM_ID) && row.mode === 'PROGRAM' && row.status === 'DRAFT'))
    warnings.push('Reboot is coming soon. Its new Program registration is unavailable.');
  const activity = requestedId ? [...programViews, ...courseViews].find(row => key(row.id) === key(requestedId)) : null;
  if (requestedId && !activity) throw problem('This Academy activity is unavailable.', 404);
  return { signedIn: Boolean(user), globalAdmin: globalAdmin(user), startDate: start, endDate: end, timezone,
    activities, personalActivities: user ? activities.filter(row => row.roles.length) : [],
    student: Boolean(user && activities.some(row => row.roles.includes('STUDENT'))),
    timetable: timetable.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    activity, warnings };
}

function nowInMinutes(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}
