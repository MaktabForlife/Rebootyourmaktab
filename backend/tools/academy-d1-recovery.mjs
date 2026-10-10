import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {captureRecoverySnapshot,restoreRecoverySnapshot,recoveryDelta,recoverySQL} from './academy-migration/recovery.mjs';

// Offline administration only; no remote writes or automatic Sheets rollback.
// Every output is new/private. Capture a restored/quiesced SQLite copy, never a
// live application file. Remote readback must separately prove all writers stop.
export function recoveryCommand(mode,options) {
  const required=name=>{if(!options[name])throw Error('REQUIRED_'+name.toUpperCase());return resolve(options[name]);};
  const read=name=>JSON.parse(readFileSync(required(name),'utf8'));
  const save=(name,value)=>writeFileSync(required(name),value,{mode:0o600,flag:'wx'});
  if(mode==='capture-local') {
    const db=new DatabaseSync(required('database'),{readOnly:true});
    try{const snapshot=captureRecoverySnapshot(db,{databaseId:options['database-id'],quiescenceReference:options['quiescence-reference']});save('output',JSON.stringify(snapshot));return {captured:true,tables:Object.keys(snapshot.tables).length,fingerprint:snapshot.fingerprint};}
    finally{db.close();}
  }
  if(mode==='restore-local') {
    const snapshot=read('snapshot'),path=required('database');closeSync(openSync(path,'wx',0o600));let db;
    try{db=new DatabaseSync(path);return restoreRecoverySnapshot(db,snapshot);}
    catch(error){db?.close();db=null;unlinkSync(path);throw error;}
    finally{db?.close();}
  }
  if(mode==='export-sql') {const snapshot=read('snapshot');save('output',recoverySQL(snapshot));return {exported:true,fingerprint:snapshot.fingerprint};}
  if(mode==='compare') {const report=recoveryDelta(read('baseline'),read('latest'));save('output',JSON.stringify(report,null,2));return report;}
  throw Error('EXPECTED_CAPTURE_LOCAL_RESTORE_LOCAL_EXPORT_SQL_OR_COMPARE');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const [mode,...flags]=process.argv.slice(2);if(flags.length%2||flags.some((flag,i)=>i%2===0&&!flag.startsWith('--')))throw Error('EXPECTED_FLAG_VALUE_PAIRS');
    const options=Object.fromEntries(Array.from({length:flags.length/2},(_,i)=>[flags[i*2].slice(2),flags[i*2+1]]));
    console.log(JSON.stringify(recoveryCommand(mode,options)));
  }catch(error){console.error(JSON.stringify({error:error.message,remoteDatabaseChanged:false}));process.exitCode=1;}
}
