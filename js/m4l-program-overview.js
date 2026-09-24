/* Shared presentation model for the desktop grid and mobile cards. */
(() => {
  'use strict';
  const active=value=>value===true||String(value).toUpperCase()==='TRUE';
  function build(data,timetable,preview){
    const rows=data.rows,subjects=new Map(rows.subjects.map(r=>[r.ProgramSubjectID,r]));
    const names=new Map(data.sharedSubjects.map(r=>[r.SubjectID,r.SubjectName]));
    const levels=new Map(rows.levels.map(r=>[r.LevelID,r]));
    const accounts=new Map(data.accounts.map(r=>[r.AccountID,r.DisplayName]));
    const classes=new Map(rows.classes.map(r=>[r.ClassID,r]));
    const make=(subject,module,level)=>{
      const rules=(timetable?.draft.rules||[]).filter(r=>r.moduleId===module?.ProgramModuleID);
      const classIds=[...new Set(rules.flatMap(r=>r.classIds))],teacherIds=[...new Set(rules.map(r=>r.teacherId).filter(Boolean))];
      const occurrences=(preview?.occurrences||[]).filter(r=>r.moduleId===module?.ProgramModuleID&&r.status!=='CANCELLED');
      // A learner is counted once, even when they belong to two combined classes.
      const learnerIds=new Set();
      for(const enrollment of rows.enrollments){
        if(active(enrollment.Active)&&occurrences.some(o=>o.classIds.includes(enrollment.ClassID)&&enrollment.StartDate<=o.date&&(!enrollment.EndDate||enrollment.EndDate>=o.date)))learnerIds.add(enrollment.AccountID);
      }
      return {subjectId:subject?.ProgramSubjectID||module?.ProgramSubjectID||'',moduleId:module?.ProgramModuleID||'',levelId:level?.LevelID||module?.LevelID||'',
        subject:names.get(subject?.SubjectID)||'Unavailable subject',level:level?.Name||(module?.LevelID?'Unavailable level':'No level'),module:module?.Name||'',
        archived:!active(subject?.Active)||(module&&!active(module.Active))||(level&&!active(level.Active)),
        classes:classIds.map(id=>classes.get(id)?.Name||'Unavailable class'),teachers:teacherIds.map(id=>accounts.get(id)||'Unavailable teacher'),
        learners:[...learnerIds].map(id=>({id,name:accounts.get(id)||'Unavailable learner'})),
        rosterReady:Boolean(timetable)&&(!rules.length||Boolean(preview)&&!preview.issues?.length),hasLessons:rules.length>0};
    };
    const result=[];
    for(const subject of rows.subjects){
      const modules=rows.modules.filter(r=>r.ProgramSubjectID===subject.ProgramSubjectID);
      for(const module of modules)result.push(make(subject,module,levels.get(module.LevelID)));
      for(const level of rows.levels.filter(r=>r.ProgramSubjectID===subject.ProgramSubjectID&&!modules.some(m=>m.LevelID===r.LevelID)))result.push(make(subject,null,level));
      if(!modules.length&&!rows.levels.some(r=>r.ProgramSubjectID===subject.ProgramSubjectID))result.push(make(subject,null,null));
    }
    // Keep broken references visible for repair instead of silently hiding modules.
    for(const module of rows.modules.filter(r=>!subjects.has(r.ProgramSubjectID)))result.push(make(null,module,levels.get(module.LevelID)));
    return result;
  }
  window.M4L_PROGRAM_OVERVIEW={build};
})();
