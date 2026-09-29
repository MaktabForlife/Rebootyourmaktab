import assert from 'node:assert/strict';
import { programFailure } from '../src/programs/errors.js';
import { GoogleSheetsApiError } from '../src/lib/google-sheets.js';
import { problem } from '../src/programs/model.js';
const entries=[],old=console.error;console.error=entry=>entries.push(JSON.parse(entry));
try{
  for(const [status,code,retryable] of [[429,'SHEETS_RATE_LIMITED',true],[403,'SHEETS_ACCESS_FAILED',false],[404,'SHEETS_ACCESS_FAILED',false],[503,'SHEETS_UNAVAILABLE',true],[400,'SHEETS_REQUEST_FAILED',false]]){
    const result=programFailure(new GoogleSheetsApiError(status,'PRIVATE_GOOGLE_RESPONSE\nPRIVATE_SECOND_LINE'),'manage-save','test');
    assert.equal(result.code,code);assert.equal(result.retryable,retryable);assert.equal(result.status,503);
    assert.match(result.error,/save has not been confirmed/);assert(result.reference);
    assert(!JSON.stringify(result).includes('PRIVATE_GOOGLE_RESPONSE'));
    assert.equal(entries.at(-1).upstreamStatus,status);
    if(status===429)assert.equal(result.retryAfterMs,60000);
  }
  const fault=programFailure(new TypeError('Cannot read private user payload'),'manage-get');
  assert.equal(fault.code,'PROGRAM_BACKEND_ERROR');assert.equal(fault.retryable,false);
  const connection=programFailure(new TypeError('fetch failed'),'manage-save');
  assert.equal(connection.code,'BACKEND_CONNECTION_FAILED');assert.equal(connection.retryable,true);
  const count=entries.length;
  const conflict=programFailure(Object.assign(problem('The row changed',409),{code:'ROW_CHANGED',currentRecord:{Name:'Current'},rowRevision:'revision'}),'manage-save');
  assert.equal(conflict.code,'ROW_CHANGED');assert.equal(conflict.currentRecord.Name,'Current');assert.equal(entries.length,count);
  assert(!JSON.stringify(entries).includes('PRIVATE_GOOGLE_RESPONSE'));assert(!JSON.stringify(entries).includes('PRIVATE_SECOND_LINE')); assert(!JSON.stringify(entries).includes('private user payload'));
}finally{console.error=old;}
console.log('Program failures: rate/access/service/unknown distinctions, safe correlation logs and conflict preservation passed.');
