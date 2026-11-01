import {isFolderMarker} from './folder.js';

export const equal=(a,b)=>stable(a)===stable(b);
export function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
export async function hashBlob(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function merge(base,local,remote,resolution){
 const conflicts=[];
 function visit(b,l,r,path){
  if(equal(l,r))return l;if(equal(l,b))return r;if(equal(r,b))return l;
  if(path.join('.')==='order'&&Array.isArray(l)&&Array.isArray(r)){
   const original=b||[],existing=new Set(original),project=arr=>arr.filter(id=>existing.has(id)),sameOrder=(x,y)=>equal(x.filter(id=>y.includes(id)),y.filter(id=>x.includes(id)));
   const lc=!sameOrder(project(l),original),rc=!sameOrder(project(r),original);
   if(!lc||!rc||sameOrder(project(l),project(r))){const first=lc?l:r;return [...first,...(first===l?r:l).filter(id=>!first.includes(id))];}
  }
  if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r)){
   const out={};for(const key of new Set([...Object.keys(b||{}),...Object.keys(l),...Object.keys(r)])){const value=visit(b?.[key],l[key],r[key],[...path,key]);if(value!==undefined)out[key]=value;}return out;
  }
  if(path.at(-1)==='time'&&typeof l==='number'&&typeof r==='number')return Math.max(l,r);
  if(resolution)return resolution==='local'?l:r;
  conflicts.push({path:path.join('.'),local:l,remote:r});return l;
 }
 const data=visit(base,local,remote,[]);return {data,conflicts};
}
export function references(data){const out=new Set();function visit(v){if(!v||typeof v!=='object')return;if(typeof v.asset==='string')out.add(v.asset);for(const child of Object.values(v))visit(child);}visit(data);return out;}
export {findFolder} from './folder.js';
export function webURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}
export const emptyData=()=>({sites:{},order:[],iconTemplate:'https://www.google.com/s2/favicons?domain={domain}&sz={size}',records:{}});
export function validateData(data){
 function safe(value,depth=0){if(depth>16)throw new Error('syncInvalidData');if(value&&typeof value==='object')for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('syncInvalidData');safe(value[key],depth+1);}}safe(data);
 if(!data||typeof data!=='object'||!data.sites||Array.isArray(data.sites)||!data.records||!Array.isArray(data.order)||Object.keys(data.sites).length>10000||data.order.length>10000)throw new Error('syncInvalidData');
 const safeID=id=>!['__proto__','constructor','prototype'].includes(id)&&typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 for(const [id,site]of Object.entries(data.sites)){
  if(!safeID(id)||!site||(!webURL(site.url)||isFolderMarker(site))||typeof site.title!=='string'||site.title.length>4096)throw new Error('syncInvalidData');
  const p=site.preference;if(!p||!['image','letter'].includes(p.appearance)||!Number.isFinite(p.scale)||p.scale<45||p.scale>125||!Number.isFinite(p.offsetX)||!Number.isFinite(p.offsetY)||Math.abs(p.offsetX)>200||Math.abs(p.offsetY)>200||!(p.color===null||typeof p.color==='string'&&/^(?:#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})|[a-z]{1,24}|(?:rgb|hsl)a?\([-\d.%\s,\/]+\))$/i.test(p.color))||!(['auto','upload','third-party','app-store'].includes(p.source)||webURL(p.source)))throw new Error('syncInvalidData');
 }
 if(data.order.some(id=>!safeID(id)||!Object.hasOwn(data.sites,id))||new Set(data.order).size!==data.order.length)throw new Error('syncInvalidData');
 if(typeof data.iconTemplate!=='string'||data.iconTemplate.length>2048)throw new Error('syncInvalidData');
 if(Object.keys(data.records).length>10000)throw new Error('syncInvalidData');
 for(const [url,record]of Object.entries(data.records)){
  if(!webURL(url)||!record||!Number.isFinite(record.time)||record.time<0||!Array.isArray(record.items)||record.items.length>8)throw new Error('syncInvalidData');
  for(const item of [...record.items,record.upload,record.thirdParty,record.appStore].filter(Boolean))if(!/^[a-f\d]{64}$/.test(item.asset)||!Number.isInteger(item.bytes)||item.bytes<1||item.bytes>12*1024*1024||!/^image\/[\w.+-]+$/.test(item.mime)||!Number.isFinite(item.width)||item.width<1||item.width>65536||!Number.isFinite(item.height)||item.height<1||item.height>65536||item.url&&!webURL(item.url))throw new Error('syncInvalidData');
 }
 return data;
}
