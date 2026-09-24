import { json } from '../lib/http.js';
import { timetableUser } from '../programs/timetable-context.js';
import { getPlatformSpreadsheetId } from '../lib/platform-sheet.js';
import { academySubjectRepository, academySubjectService } from '../programs/academy-subjects.js';
import { problem } from '../programs/model.js';
export function academySubjectsEndpoint(action) {
  return async(request,env)=>{
    if(request.method!=='POST')return json({success:false,error:'Use POST.'},405);
    try {
      await timetableUser(request,env);
      let size=0,raw='';const decoder=new TextDecoder(),reader=request.body?.getReader();
      if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw problem('Subject request is too large.',413);}raw+=decoder.decode(value,{stream:true});}
      raw+=decoder.decode();let input;try{input=JSON.parse(raw||'{}');}catch{throw problem('Invalid JSON request.');}
      if(!input||Array.isArray(input)||typeof input!=='object')throw problem('Invalid subject request.');
      if(['save','recover'].includes(action)) {
        if(!env.PROGRAM_TIMETABLE_COORDINATOR)throw problem('Subject saving needs the Program coordinator binding.',503);
        const result=await env.PROGRAM_TIMETABLE_COORDINATOR.getByName(`${getPlatformSpreadsheetId(env)}:academy-subjects`).catalogRun(action,input,request.headers.get('Authorization')||'');
        return json(result,result.success?200:result.status||503);
      }
      return json({success:true,...await academySubjectService(academySubjectRepository(env)).read(action)});
    }catch(error){return json({success:false,error:error.publicMessage||'Academy subjects could not be reached. Check backend spreadsheet access and retry.'},error.publicMessage?error.status:503);}
  };
}
