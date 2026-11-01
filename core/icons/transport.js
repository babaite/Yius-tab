import {iconError as uiError} from '../errors.js';
export const MAX_BYTES=3*1024*1024;
export function webURL(value, base) { if(typeof value!=='string'||!value.trim())return null;try { const u=new URL(value,base);return ['https:','http:'].includes(u.protocol)?u.href:null; } catch {return null;} }
export async function request(url,{signal,timeout=3500}={}) {
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)});
  if(!response.ok)throw uiError('httpError',{code:response.status});
  if(Number(response.headers.get('content-length'))>MAX_BYTES)throw uiError('fileTooLarge');
  if(!response.body)throw uiError('emptyResponse');
  const reader=response.body.getReader();let total=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES){await reader.cancel();throw uiError('fileTooLarge');}chunks.push(value);}
  return {blob:new Blob(chunks,{type:response.headers.get('content-type')||''}),url:response.url||url};
}
