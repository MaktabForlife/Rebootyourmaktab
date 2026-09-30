/* V105.3.4.2 — merge independent timetable changes from browser tabs. */
(()=>{'use strict';
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function merge(base,ours,theirs,path='draft'){
    if(same(ours,base))return structuredClone(theirs);
    if(same(theirs,base)||same(ours,theirs))return structuredClone(ours);
    if(path==='draft.rules'&&Array.isArray(ours)&&Array.isArray(theirs)){
      const old=new Map((base||[]).map(row=>[row.id,row])),left=new Map(ours.map(row=>[row.id,row])),right=new Map(theirs.map(row=>[row.id,row]));
      const ids=[...new Set([...old.keys(),...left.keys(),...right.keys()])];
      return ids.map(id=>merge(old.get(id),left.get(id),right.get(id),path+'.'+id)).filter(row=>row!==undefined);
    }
    if(base&&ours&&theirs&&typeof base==='object'&&typeof ours==='object'&&typeof theirs==='object'&&!Array.isArray(base)&&!Array.isArray(ours)&&!Array.isArray(theirs)){
      const result={};for(const key of new Set([...Object.keys(base),...Object.keys(ours),...Object.keys(theirs)])){const value=merge(base[key],ours[key],theirs[key],path+'.'+key);if(value!==undefined)result[key]=value;}return result;
    }
    throw Error('Two tabs changed the same timetable item. Download this draft before reloading the shared version.');
  }
  window.M4L_TIMETABLE_SYNC={merge};
})();
