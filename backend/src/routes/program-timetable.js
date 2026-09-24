import { json } from '../lib/http.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { problem } from '../programs/model.js';
import { timetableUser,timetableProgram } from '../programs/timetable-context.js';
import { timetableService } from '../programs/timetable-service.js';
import { timetableRepository } from '../programs/timetable-repository.js';
export function programTimetableEndpoint(action) {
  return async(request,env)=>{
    if (request.method!=='POST') return json({success:false,error:'Use POST for Program timetables.'},405);
    try {
      await timetableUser(request,env);
      const reader=request.body?.getReader();let raw='',length=0;
      const decoder=new TextDecoder();
      if (reader) while(true) {const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();throw problem('Timetable request is too large.',413);}raw+=decoder.decode(value,{stream:true});}
      raw+=decoder.decode();
      let input;try{input=JSON.parse(raw||'{}');}catch{throw problem('Invalid JSON request.');}
      if (!input||Array.isArray(input)||typeof input!=='object') throw problem('Invalid timetable request.');
      const program=await timetableProgram(env,input.id); input.id=program.id;
      const binding=env.PROGRAM_TIMETABLE_COORDINATOR;
      if (['save','publish','prepare','recover','manage-save'].includes(action)) {
        if (!binding) throw problem('Timetable saving needs the Program coordinator binding. Ask the administrator to complete V105.2 backend setup.',503);
        const result=await binding.getByName(`${getPlatformSpreadsheetId(env)}:${program.id}`).run(action,input,request.headers.get('Authorization')||'');
        return json(result,result.success?200:result.status||503);
      }
      const result=await timetableService(timetableRepository(env,program),program).read(action,input);
      return json({success:true,coordinatorAvailable:Boolean(binding),...result});
    } catch(error) {return json({success:false,error:error.publicMessage||'The timetable could not reach or validate its spreadsheets. Retry after checking backend access.'},error.publicMessage?error.status:503);}
  };
}
