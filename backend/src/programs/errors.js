import { GoogleSheetsApiError } from '../lib/google-sheets.js';

// Never expose upstream response bodies, account data or credentials in diagnostics.
export function programFailure(error, action, stage='request') {
  if(error.publicMessage)return {success:false,status:error.status,error:error.publicMessage,
    ...(error.code?{code:error.code}:{}),
    ...(typeof error.retryable==='boolean'?{retryable:error.retryable}:{}),
    ...(error.code==='ROW_CHANGED'?{currentRecord:error.currentRecord,rowRevision:error.rowRevision,...(error.entryKey?{entryKey:error.entryKey}:{})}:{})};
  const save=['save','submit','manage-save','publish','recover','prepare','prepare-library'].includes(action);
  const reference=crypto.randomUUID(),google=error instanceof GoogleSheetsApiError;
  const upstreamStatus=google?error.status:null;
  // An uncertain coordinated write may be retried once using its exact operation ID.
  let code='PROGRAM_BACKEND_ERROR',message='The program service encountered an unexpected error.',retryable=save,retryAfterMs=save?1500:0;
  if(google&&upstreamStatus===429){code='SHEETS_RATE_LIMITED';message='Google Sheets is temporarily limiting requests.';retryable=true;retryAfterMs=60000;}
  else if(google&&[401,403,404].includes(upstreamStatus)){code='SHEETS_ACCESS_FAILED';message='The backend could not access the required spreadsheet. An administrator needs to check its connection and sharing.';retryable=false;retryAfterMs=0;}
  else if(google&&error.retryable){code='SHEETS_UNAVAILABLE';message='Google Sheets is temporarily unavailable.';retryable=true;retryAfterMs=1500;}
  else if(google){code='SHEETS_REQUEST_FAILED';message='Google Sheets could not process the request. An administrator needs to check the spreadsheet setup.';retryable=false;retryAfterMs=0;}
  else if((/network connection|connection (closed|reset)|fetch failed|failed to fetch|networkerror/i.test(String(error.message))||error.name==='AbortError'||error.name==='TimeoutError')){
    code='BACKEND_CONNECTION_FAILED';message='The backend connection was interrupted.';retryable=true;retryAfterMs=1500;
  }
  console.error(JSON.stringify({event:'program_request_failed',reference,action,stage,code,upstreamStatus,
    errorType:error.name,location:[...String(error.stack||'').matchAll(/\b([A-Za-z0-9_.-]{1,80}\.m?js):(\d+):(\d+)/g)].slice(0,2).map(match=>`${match[1]}:${match[2]}:${match[3]}`)}));
  return {success:false,status:503,code,retryable,retryAfterMs,reference,
    error:`${message} ${save?'The save has not been confirmed; your entry is kept.':'Your displayed records and unfinished edits are kept.'} Reference: ${reference}`};
}
