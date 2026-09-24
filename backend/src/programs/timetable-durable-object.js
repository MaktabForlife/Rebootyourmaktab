import { DurableObject } from 'cloudflare:workers';
import { createRequestEnvironment } from '../lib/request-context.js';
import { timetableCoordinator } from './timetable-coordination.js';
import { timetableUser, timetableProgram } from './timetable-context.js';
import { timetableService } from './timetable-service.js';
import { timetableRepository } from './timetable-repository.js';
export class ProgramTimetableCoordinator extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    const sql=ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS pending (id INTEGER PRIMARY KEY CHECK(id=1), intent TEXT NOT NULL)');
    const journal={
      get:async()=>{const row=sql.exec('SELECT intent FROM pending WHERE id=1').toArray()[0];return row?JSON.parse(row.intent):null;},
      set:async value=>{sql.exec('INSERT OR REPLACE INTO pending(id,intent) VALUES(1,?)',JSON.stringify(value));},
      clear:async()=>{sql.exec('DELETE FROM pending WHERE id=1');}
    };
    this.coordinator=timetableCoordinator(journal,async(id,authorization)=>{
      const fresh=createRequestEnvironment(env);
      const user=await timetableUser(new Request('https://internal.invalid/timetable',{headers:{Authorization:authorization}}),fresh);
      const program=await timetableProgram(fresh,id);
      return {user,service:timetableService(timetableRepository(fresh,program),program)};
    });
  }
  async run(action,input,authorization) {
    try {return {success:true,...await this.coordinator.run(action,input,authorization)};}
    catch(error) {return {success:false,status:error.publicMessage?error.status:503,error:error.publicMessage||'The change could not be confirmed. Keep your edits and retry the same action, or use Recover interrupted change.'};}
  }
}
