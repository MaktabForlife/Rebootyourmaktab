import { json } from '../lib/http.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { problem } from '../programs/model.js';
import { programAttendanceUser, timetableProgram } from '../programs/timetable-context.js';
import { attendanceRepository } from '../programs/attendance-repository.js';
import { attendanceService } from '../programs/attendance-service.js';
import { programFailure } from '../programs/errors.js';

async function requestInput(request){
  if(request.method!=='POST')throw problem('Use POST for Program attendance.',405);
  const reader=request.body?.getReader(),decoder=new TextDecoder();let raw='',size=0;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw problem('Attendance request is too large.',413);}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();
  let input;try{input=JSON.parse(raw||'{}');}catch{throw problem('Invalid JSON request.');}
  if(!input||typeof input!=='object'||Array.isArray(input))throw problem('Invalid attendance request.');
  return input;
}

export function programAttendanceEndpoint(action){
  return async(request,env)=>{
    let stage='input';
    try{
      const input=await requestInput(request);
      stage='program';const program=await timetableProgram(env,input.id);input.id=program.id;
      const user=await programAttendanceUser(request,env,program.id,{prepare:action==='prepare'||action==='recover'});
      if(action==='get'){
        stage='read';return json({success:true,canPrepare:user.role==='GLOBAL_ADMIN',...await attendanceService(attendanceRepository(env,program),program).read(input.date,user)});
      }
      if(!['prepare','submit','recover'].includes(action))throw problem('Unknown attendance action.',404);
      const binding=env.PROGRAM_TIMETABLE_COORDINATOR;
      if(!binding)throw problem('Program attendance needs the coordinator binding.',503);
      stage='coordinator';const result=await binding.getByName(`${getPlatformSpreadsheetId(env)}:${program.id}`)
        .attendanceRun(action==='submit'?'save':action,input,request.headers.get('Authorization')||'');
      return json(result,result.success?200:result.status||503);
    }catch(error){const result=programFailure(error,action,stage);return json(result,result.status);}
  };
}
