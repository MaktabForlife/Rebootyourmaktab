import { problem } from './model.js';
// Keep pasted meeting passcodes intact, but never render executable or credential-bearing URLs.
export function normalizeZoomLink(value) {
  if(value===undefined||value===null||value==='')return '';
  if(typeof value!=='string'||value.length>2048)throw problem('Enter a Zoom link of up to 2048 characters, or leave it blank.');
  const text=value.trim();if(!text)return '';
  try {
    const url=new URL(text);
    if(url.protocol!=='https:'||url.username||url.password||/[\u0000-\u001f\u007f]/.test(text))throw Error();
    return url.toString();
  } catch {throw problem('Enter a valid Zoom link starting with https://, or leave it blank.');}
}
export function lessonZoom(row,classes) {
  const override=normalizeZoomLink(row.zoomLink);
  if(override)return {zoomLink:override,zoomSource:'LESSON'};
  // A combined lesson needs one explicit shared meeting. Drafts may remain incomplete.
  if(row.classIds.length>1)throw problem('Enter a shared lesson Zoom link for lessons with multiple classes.');
  const fallback=row.classIds.length===1?normalizeZoomLink(classes.get(row.classIds[0])?.zoomLink):'';
  return {zoomLink:fallback,zoomSource:fallback?'CLASS':'NONE'};
}
