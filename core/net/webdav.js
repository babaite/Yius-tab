import {failure} from '../errors.js';
import {hashBlob} from '../../sync/model.js';
import {assetRoot,assetURL,configKey} from './cloud-config.js';
export const LIMIT=4*1024*1024;
export const strong=tag=>typeof tag==='string'&&tag.length<=512&&!tag.startsWith('W/')&&/^(?:"[^"\r\n]+"|[!#-~]+)$/.test(tag);
export const REQUEST_TIMEOUT_MS=10000;
export const MAX_RETRIES=3;
const transientStatus=status=>status===408||status===425||status===429||status>=500;
export function createWebDAV({api,fetcher,isOnline,onRequest=()=>{},onResponse=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random,requestTimeout=REQUEST_TIMEOUT_MS,maxRetries=MAX_RETRIES}){
 let consecutiveFailures=0;
 function retryDelay(retry){const base=1000*Math.pow(2,retry);return Math.round(base*(1+Math.min(.999,Math.max(0,random()))));}
 async function request(config,method,url=config.url,{body,headers={},limit=LIMIT,allowDisabled=false}={}){
  {const latest=(await api.storage.local.get('settings')).settings?.cloud;if(!latest||configKey(latest)!==configKey(config)||(!latest.enabled&&!allowDisabled))throw failure('syncLocalChanged');}
  const auth={...headers};if(body instanceof Blob)auth['Content-Type']=body.type||'application/octet-stream';else if(body!==undefined&&!auth['Content-Type'])auth['Content-Type']='application/json';
  if(config.username||config.password){let raw='';for(const b of new TextEncoder().encode((config.username||'')+':'+(config.password||'')))raw+=String.fromCharCode(b);auth.Authorization='Basic '+btoa(raw);}
  let lastError;
  for(let attempt=0;attempt<=maxRetries;attempt++){
   onRequest();const requestStarted=performance.now();
   let response=null,error=null;
   try{
    response=await fetcher(url,{method,body,headers:auth,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(requestTimeout)});
    onResponse({method,kind:url===config.url?'configuration':/[a-f0-9]{64}$/.test(url)?'image':'maintenance',status:response.status,durationMs:Math.round(performance.now()-requestStarted),attempt});
   }catch(caught){error=caught;}
   if(response){
    if([401,403].includes(response.status))throw failure('syncAuth',response.status);
    if(Number(response.headers.get('content-length'))>limit)throw failure('syncTooLarge');
    if(!transientStatus(response.status)){consecutiveFailures=0;return response;}
    lastError=failure('syncHTTP',response.status);
   }else{
    if(error?.message==='syncAuth'||error?.message==='syncTooLarge'||error?.message==='syncLocalChanged')throw error;
    lastError=error?.message?error:failure(!isOnline()?'syncOffline':'syncNetworkFailure');
   }
   consecutiveFailures++;
   if(consecutiveFailures>=3)throw failure(lastError?.message==='syncOffline'?'syncOffline':'syncNetworkFailure','3-consecutive');
   if(attempt<maxRetries)await sleep(retryDelay(attempt));
  }
  throw lastError||failure('syncNetworkFailure');
 }
 async function bytes(response,limit=LIMIT){if(!response.body)return new Uint8Array();const reader=response.body.getReader(),parts=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw failure('syncTooLarge');}parts.push(value);}const out=new Uint8Array(total);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.byteLength;}return out;}
 async function versionTag(config,response,url){
  let tag=response.headers.get('etag');if(strong(tag))return tag;

  const properties=await request(config,'PROPFIND',url,{body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>',headers:{Depth:'0','Content-Type':'application/xml'}});
  if(properties.ok){const xml=new TextDecoder().decode(await bytes(properties));const match=xml.match(/<(?:[\w-]+:)?getetag\b[^>]*>([^<]*)<\//i);if(match)tag=match[1].trim().replaceAll('&quot;','"').replaceAll('&amp;','&');}
  return tag;
 }
 async function readTag(config,url=config.url,options={}){
  const properties=await request(config,'PROPFIND',url,{body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/></d:prop></d:propfind>',headers:{Depth:'0','Content-Type':'application/xml'},...options});
  if(properties.status===404)return null;
  if(properties.status!==207)throw failure('syncHTTP',properties.status);
  const xml=new TextDecoder().decode(await bytes(properties,1024*1024));
  const responseCount=(xml.match(/<(?:[\w.-]+:)?response\b/gi)||[]).length;
  const hrefs=[...xml.matchAll(/<(?:[\w.-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?href>/gi)].map(match=>match[1].trim());
  const match=xml.match(/<(?:[\w.-]+:)?getetag\b[^>]*>([^<]*)<\/(?:[\w.-]+:)?getetag>/i);
  let hrefMatches=false;
  if(hrefs.length===1){
   try{const href=new URL(hrefs[0].replaceAll('&amp;','&'),url);hrefMatches=href.origin===new URL(url).origin&&decodeURIComponent(href.pathname)===decodeURIComponent(new URL(url).pathname);}catch{}
  }
  if(responseCount!==1||hrefs.length!==1||!hrefMatches||!match)throw failure('syncIncompleteListing');
  const tag=match[1].trim().replaceAll('&quot;','"').replaceAll('&amp;','&');
  if(!strong(tag))throw failure('syncUnsupported','propfind-etag');
  return tag;
 }
 async function probe(config,meta,key){
  const keyHash=await hashBlob(new Blob([key]));if(meta.probed===keyHash)return;
  if(new URL(config.url).hostname==='dav.jianguoyun.com'&&new URL(config.url).pathname.startsWith('/dav/YiusTab/')){const parent=await request(config,'MKCOL',new URL('/dav/YiusTab/',config.url).href);if(![201,204,405].includes(parent.status))throw failure('syncFolder',parent.status);}
  const directory=await request(config,'MKCOL',assetRoot(config).href);if(![201,204,301,405,501].includes(directory.status))throw failure('syncFolder',directory.status);
  const url=assetURL(config,'.probe-'+crypto.randomUUID()),body=JSON.stringify({probe:1});let tag;
  try{
   const created=await request(config,'PUT',url,{body,headers:{'If-None-Match':'*'}});if(![200,201,204].includes(created.status))throw failure('syncHTTP',created.status);
   const got=await request(config,'GET',url);tag=await versionTag(config,got,url);if(!got.ok||!strong(tag))throw failure('syncUnsupported','probe-etag');
   const collision=await request(config,'PUT',url,{body,headers:{'If-Match':'"yius-deliberately-wrong-etag"'}});if(collision.status!==412)throw failure('syncUnsupported','probe-if-match-HTTP-'+collision.status);
   const unchanged=await request(config,'GET',url,{headers:{'If-None-Match':tag}});if(unchanged.status!==304){if(!unchanged.ok||(await versionTag(config,unchanged,url))!==tag||new TextDecoder().decode(await bytes(unchanged))!==body)throw failure('syncUnsupported','probe-readback-HTTP-'+unchanged.status);}
   meta.probed=keyHash;
  }finally{try{await request(config,'DELETE',url);}catch{}}
 }
 return {request,bytes,versionTag,probe,readTag,consecutiveFailures:()=>consecutiveFailures};
}
