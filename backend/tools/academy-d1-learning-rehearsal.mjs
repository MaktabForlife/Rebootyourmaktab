#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,chmodSync,constants} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {buildOperationalImport,verifyOperationalPlan} from './academy-migration/operational.mjs';
import {buildLearningImport,importLearningPlan,verifyLearningPlan,learningSQL} from './academy-migration/learning.mjs';
import {requireCondition,sha256} from './academy-migration/snapshot.mjs';
// Always creates a private local copy. No remote or in-place import option.
const args=process.argv.slice(2),options={};
try {
  const allowed=['--snapshot','--policy','--base-database','--output-directory'];
  requireCondition(args.length===8,'INVALID_ARGUMENTS');
  for(let i=0;i<args.length;i+=2){requireCondition(allowed.includes(args[i])&&!Object.hasOwn(options,args[i])&&args[i+1]&&!args[i+1].startsWith('--'),'INVALID_ARGUMENTS');options[args[i]]=resolve(args[i+1]);}
  const snapshot=JSON.parse(readFileSync(options['--snapshot'],'utf8')),policy=JSON.parse(readFileSync(options['--policy'],'utf8'));
  const base=await buildOperationalImport(snapshot,policy),plan=buildLearningImport(snapshot,base);
  const original=new DatabaseSync(options['--base-database'],{readOnly:true});
  try{verifyOperationalPlan(original,base);}finally{original.close();}
  const directory=options['--output-directory'];mkdirSync(dirname(directory),{recursive:true,mode:0o700});mkdirSync(directory,{mode:0o700});
  const database=join(directory,'candidate.sqlite');copyFileSync(options['--base-database'],database,constants.COPYFILE_EXCL);chmodSync(database,0o600);
  const extensions=['0004_management_transactions.sql','0005_learning_workflows.sql'].map(name=>({name,sql:readFileSync(new URL('../migrations/academy/'+name,import.meta.url),'utf8')}));
  const db=new DatabaseSync(database);let verification;
  try{db.exec('PRAGMA foreign_keys=ON');for(const {sql} of extensions)db.exec(sql);importLearningPlan(db,plan);verification=verifyLearningPlan(db,plan);}finally{db.close();}
  writeFileSync(join(directory,'learning-import.sql'),learningSQL(plan),{mode:0o600,flag:'wx'});
  writeFileSync(join(directory,'report.json'),JSON.stringify({...verification,baseVerification:'PASS',localOnly:true,mainDatabaseChanged:false,extensions:extensions.map(({name,sql})=>({name,sha256:sha256(sql)}))},null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({...verification,baseVerification:'PASS',localOnly:true,mainDatabaseChanged:false}));
}catch(error){console.error(JSON.stringify({success:false,code:error.code||'LEARNING_REHEARSAL_FAILED',location:error.location||{}}));process.exitCode=1;}
