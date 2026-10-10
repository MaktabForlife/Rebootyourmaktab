import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {courseFixture} from './academy-d1-course-fixture.mjs';

// Execute the actual coordinator with only the platform base class/SQL cursor
// adapted for Node. The Workers rehearsal separately verifies real DO RPC/R2.
const path=new URL('../../src/programs/timetable-durable-object.js',import.meta.url);
let source=readFileSync(path,'utf8').replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env;} }');
source=source.replace(/from '([.][^']+)'/g,(_,relative)=>`from '${new URL(relative,path).href}'`);
const {ProgramTimetableCoordinator}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

export async function openLibraryFixture(){
  const f=await courseFixture(),metadata=new DatabaseSync(':memory:'),objects=new Map(),namespaceNames=[];
  f.db.exec(readFileSync(new URL('../../migrations/academy/0007_course_subscriptions.sql',import.meta.url),'utf8'));
  const sql={exec:(query,...args)=>{const rows=metadata.prepare(query).all(...args),rowsWritten=metadata.prepare('SELECT changes() n').get().n;return {toArray:()=>rows,rowsWritten};}};
  f.env.PLATFORM_SPREADSHEET_ID='synthetic-existing-platform';
  const coordinator=new ProgramTimetableCoordinator({storage:{sql}},f.env);
  f.env.PROGRAM_TIMETABLE_COORDINATOR={getByName:name=>{namespaceNames.push(name);return coordinator;}};
  const deleted=[];
  f.env.MEDIA_BUCKET={
    put:async(key,bytes,options)=>objects.set(key,{bytes:new Uint8Array(bytes),mime:options.httpMetadata.contentType}),
    get:async key=>{const o=objects.get(key);return o?{body:o.bytes,size:o.bytes.length,httpMetadata:{contentType:o.mime}}:null;},
    delete:async key=>{deleted.push(key);objects.delete(key);}
  };
  return {...f,metadata,objects,coordinator,namespaceNames,deleted};
}
