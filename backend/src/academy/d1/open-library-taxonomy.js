import {academyD1Repository} from './repository.js';

// Preserve existing public reference IDs, including GLOBAL for current Courses.
// Only active Academy records enter these editor options; old Reboot is absent.
export async function d1OpenLibraryTaxonomySource(env) {
  const repository=academyD1Repository(env);await repository.ready();
  const result=await repository.db.batch([
    repository.db.prepare("SELECT * FROM subject_catalog WHERE active=1 AND source_namespace='ACADEMY'"),
    repository.db.prepare("SELECT * FROM activities WHERE active=1 AND lifecycle='ACTIVE' AND kind IN ('PROGRAM','COURSE')"),
    repository.db.prepare('SELECT p.*,s.subject_id FROM program_subjects p JOIN subject_catalog s USING(subject_key) WHERE p.active=1 AND s.active=1'),
    repository.db.prepare('SELECT * FROM modules WHERE active=1')
  ]);
  const [subjects,activities,links,modules]=result.map(r=>r.results);
  return {
    academy:subjects.map(s=>({SubjectID:s.subject_id,SubjectName:s.name,Active:true})),
    globalSubjects:activities.filter(a=>a.kind==='COURSE').map(a=>({SubjectID:a.activity_id,SubjectName:a.name,Active:true})),
    globalModules:modules.filter(m=>m.activity_key.startsWith('COURSE:')).map(m=>({ModuleID:m.module_id,SubjectID:m.activity_key.slice(7),ModuleName:m.name,Active:true})),
    programs:activities.filter(a=>a.kind==='PROGRAM').map(a=>({id:a.activity_id,name:a.name,
      subjects:links.filter(s=>s.activity_key===a.activity_key).map(s=>({ProgramSubjectID:s.program_subject_id,SubjectID:s.subject_id,Active:true})),
      modules:modules.filter(m=>m.activity_key===a.activity_key).map(m=>({ProgramModuleID:m.module_id,ProgramSubjectID:m.program_subject_id,Name:m.name,Active:true}))}))
  };
}
