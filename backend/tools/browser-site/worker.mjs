import {onRequestGet as catalogue} from '../../../functions/academy/open-library/catalogue.js';
import {onRequestGet as publicPdf} from '../../../functions/pdf-file/[encoded].js';

const DIRECTORIES = new Set(['academy','account','admin','student','programs','users','js','css','icons','images','pdf-viewer','recorder']);
const ROOT_ASSET = /^(?:academy|ummabbadacademy|logo)\.png$|^(?:admin|student)-(?:apple-touch-icon\.png|favicon(?:-\d+x\d+\.png|\.ico)|icon-\d+\.png|manifest\.json)$|^(?:app\.js|styles\.css|version\.json)$/;
const DUAS = 'https://talimiboardkzn.org/wp-content/uploads/2018/10/essential_duas_for_muslims_gr_1-7.pdf';

export function publicPdfTarget(encoded) {
  try {
    if(!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded))return false;
    const bytes=Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
    const url=new URL(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
    return url.href===DUAS || (url.hostname==='archive.org' && url.pathname.startsWith('/download/') && !url.search && !url.hash);
  } catch {return false;}
}

export function assetPath(pathname) {
  let path;
  try {path=decodeURIComponent(pathname);} catch {return null;}
  if(/[\\\u0000-\u001f\u007f]/.test(path)||path.split('/').some(part=>part==='.'||part==='..'||part.startsWith('.')))return null;
  if(/^\/account\/[A-Za-z0-9._~-]{1,128}\/?$/.test(path))return '/account/index.html';
  const parts=path.split('/');
  if(DIRECTORIES.has(parts[1])) {
    if(parts.length===2||parts.at(-1)==='')return path.replace(/\/$/,'')+'/index.html';
    return path;
  }
  return parts.length===2&&ROOT_ASSET.test(parts[1])?path:null;
}

function protectedResponse(response,method) {
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','private, no-store, max-age=0');
  headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','no-referrer');
  // Public Archive.org media/CDN viewer assets remain usable. Browser API calls
  // cannot silently fall back to either main Academy backend or Google Sheets.
  headers.set('Content-Security-Policy',"connect-src 'self' https://archive.org https://*.archive.org https://cdnjs.cloudflare.com https://unpkg.com https://cdn.jsdelivr.net; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'");
  return new Response(method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url),method=request.method;
    const finish=response=>protectedResponse(response,method);
    if(url.origin!==env.TEST_SITE_ORIGIN)return finish(new Response('Test address required',{status:403}));
    if(url.pathname.startsWith('/api/')) {
      const origin=request.headers.get('Origin');
      if(origin&&origin!==env.TEST_SITE_ORIGIN)return finish(new Response('Test origin required',{status:403}));
      // Fixed service binding only: no caller-supplied upstream or fetch URL.
      return finish(await env.TEST_API.fetch(new Request(request,{redirect:'manual'})));
    }
    if(!['GET','HEAD'].includes(method))return finish(new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}}));
    if(url.pathname==='/')return finish(Response.redirect(new URL('/academy/',url).href,302));
    if(url.pathname==='/academy/open-library/catalogue')return finish(await catalogue());
    if(url.pathname.startsWith('/pdf-file/')) {
      const encoded=url.pathname.slice('/pdf-file/'.length);
      if(!publicPdfTarget(encoded))return finish(new Response('Public Archive.org media only',{status:403}));
      return finish(await publicPdf({request,params:{encoded}}));
    }
    const path=assetPath(url.pathname);
    if(!path)return finish(new Response('Not found',{status:404}));
    const assetUrl=new URL(url);assetUrl.pathname=path;
    return finish(await env.ASSETS.fetch(new Request(assetUrl,{method,headers:request.headers})));
  }
};
