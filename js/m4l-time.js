/* Shared clock input: store and display HH:mm, regardless of browser locale. */
(() => {
  'use strict';
  function parse(value) {
    const text=String(value??'').trim().toLowerCase().replace(/\s+/g,'');
    const match=/^(\d{1,2})(?:[:h]([0-5]\d))?(am|pm)$/.exec(text);
    let hour,minute;
    if(match){
      hour=Number(match[1]);minute=Number(match[2]||0);
      if(hour<1||hour>12)return '';
      hour=hour%12+(match[3]==='pm'?12:0);
    }else{
      const parts=/^(\d{1,2})[:h]([0-5]\d)$/.exec(text)||/^(\d{1,2})([0-5]\d)$/.exec(text)||/^(\d{1,2})$/.exec(text);
      if(!parts)return '';
      hour=Number(parts[1]);minute=Number(parts[2]||0);
      if(hour>23)return '';
    }
    return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
  }
  function normalize(input) {
    const value=parse(input.value);
    if(value)input.value=value;
    input.setCustomValidity?.(input.value&&!value?'Enter a valid time, for example 745, 07:45 or 4pm.':'');
    return value;
  }
  window.M4L_TIME={parse,normalize};
  if(typeof document==='undefined')return;
  // Capture change before each workspace reads its edited field. Invalid entries
  // remain visible for correction and are still rejected by server validation.
  document.addEventListener('change',event=>{
    if(event.target.hasAttribute?.('data-time24'))normalize(event.target);
  },true);
  document.addEventListener('input',event=>{
    if(event.target.hasAttribute?.('data-time24'))event.target.setCustomValidity?.('');
  },true);
})();
