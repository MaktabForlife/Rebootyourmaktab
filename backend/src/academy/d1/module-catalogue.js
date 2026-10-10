import {optionalSchema} from './schema-probe.js';
export async function moduleCatalogueQueries(repository) {
  const available=await optionalSchema(repository.db,'SELECT module_id FROM academy_module_catalogue WHERE 0');
  return {available,queries:{academyModules:repository.db.prepare(available?'SELECT * FROM academy_module_catalogue ORDER BY name,module_id':'SELECT module_id FROM modules WHERE 0'),
    moduleUsage:repository.db.prepare(available?'SELECT * FROM academy_module_usage':'SELECT module_id FROM modules WHERE 0')}};
}
export const catalogueNameKey=value=>String(value??'').trim().toLowerCase();
export const academyModuleCategory=id=>'MODULE:ACADEMY:'+id;
export function resolveModuleCategory(data,key) {
  if(!key?.startsWith('MODULE:')||key.startsWith('MODULE:ACADEMY:'))return key;
  const use=data.moduleUsage?.find(u=>key==='MODULE:'+u.activity_key+':'+u.module_id);
  return use?academyModuleCategory(use.academy_module_id):key;
}
