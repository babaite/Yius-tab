import {findFolder as managedFolder,ensureManagedFolder,isFolderMarker} from '../../sync/folder.js';
import {dbReadRecords as readRecords,dbWriteRecords as writeRecords} from '../storage/icon-records.js';
import {imageInfo} from '../icons/codec.js';
import {iconURL,DEFAULT_ICON_TEMPLATE} from './settings.js';
export const MAX_BACKUP=64*1024*1024;
const validURL=value=>{try{return ['https:','http:'].includes(new URL(value).protocol);}catch{return false;}};
export const findFolder=managedFolder;
async function pack(value){
  if(value instanceof Blob)return {$image:await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(value);})};
  if(Array.isArray(value))return Promise.all(value.map(pack));
  if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await pack(v)])));
  return value;
}
async function unpack(value,depth=0){
  if(depth>12)throw new Error('invalidBackup');
  if(value&&typeof value==='object'&&Object.hasOwn(value,'$image')){
    if(typeof value.$image!=='string'||value.$image.length>17*1024*1024||!/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]*$/.test(value.$image))throw new Error('invalidBackup');
    const [meta,data]=value.$image.split(','),raw=atob(data);return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:meta.slice(5,-7)});
  }
  if(Array.isArray(value)){if(value.length>10000)throw new Error('invalidBackup');return Promise.all(value.map(v=>unpack(v,depth+1)));}
  if(value&&typeof value==='object'){const out={};for(const [key,v]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('invalidBackup');out[key]=await unpack(v,depth+1);}return out;}
  return value;
}
function preference(p={}){
  const color=typeof p.color==='string'&&p.color.length<128&&CSS.supports('color',p.color)?p.color:null;
  const source=['auto','upload','third-party','app-store'].includes(p.source)||validURL(p.source)?p.source:'auto';
  const bounded=(x,min,max,fallback)=>Number.isFinite(x)?Math.max(min,Math.min(max,x)):fallback;
  return {appearance:p.appearance==='letter'?'letter':'image',color,customColor:!!p.customColor,scale:bounded(p.scale,45,125,100),source,offsetX:bounded(p.offsetX,-200,200,0),offsetY:bounded(p.offsetY,-200,200,0)};
}
export async function makeBackup(){
  const local=await chrome.storage.local.get(['prefs','order','settings','managedFolderId']),folder=await ensureManagedFolder(),sites=(folder?.children||[]).filter(b=>validURL(b.url)&&!isFolderMarker(b));
  const ids=new Set(sites.map(s=>s.id)),urls=new Set(sites.map(s=>s.url));
  const data={format:'yius-tab',schema:1,version:chrome.runtime.getManifest().version,createdAt:new Date().toISOString(),sites:sites.map(({id,title,url})=>({id,title,url})),prefs:Object.fromEntries(Object.entries(local.prefs||{}).filter(([id])=>ids.has(id))),order:(local.order||[]).filter(id=>ids.has(id)),settings:{iconTemplate:local.settings?.iconTemplate||DEFAULT_ICON_TEMPLATE,cloud:{url:local.settings?.cloud?.url||''}},records:await pack((await readRecords()).filter(r=>urls.has(r.key)))};
  const text=JSON.stringify(data);if(new Blob([text]).size>MAX_BACKUP)throw new Error('backupTooLarge');return {data,text};
}
export async function prepareBackup(text){
  if(new Blob([text]).size>MAX_BACKUP)throw new Error('backupTooLarge');
  let b;try{b=JSON.parse(text);}catch{throw new Error('invalidBackup');}
  if(b?.format!=='yius-tab'||b.schema!==1||!Array.isArray(b.sites)||b.sites.length>10000||!Array.isArray(b.records)||b.records.length>10000||!Array.isArray(b.order)||!b.prefs||typeof b.prefs!=='object')throw new Error('invalidBackup');
  const ids=new Set();for(const site of b.sites){if(typeof site.id!=='string'||ids.has(site.id)||(!validURL(site.url)||isFolderMarker(site))||typeof site.title!=='string'||site.title.length>4096)throw new Error('invalidBackup');ids.add(site.id);}
  b.prefs=Object.fromEntries(b.sites.map(site=>[site.id,preference(b.prefs[site.id])]));b.order=b.order.filter(id=>ids.has(id));
  const template=b.settings?.iconTemplate||DEFAULT_ICON_TEMPLATE;iconURL(template,'https://example.com/');const cloudURL=b.settings?.cloud?.url||'';
  if(cloudURL){let url;try{url=new URL(cloudURL);}catch{throw new Error('invalidCloudURL');}if(url.protocol!=='https:'||url.username||url.password)throw new Error('invalidCloudURL');}
  b.settings={iconTemplate:template,cloud:{url:cloudURL,username:'',password:'',remember:false}};
  const urls=new Set(b.sites.map(s=>s.url));const records=await unpack(b.records);
  for(const r of records){
    if(!r||!urls.has(r.key)||!r.value||!Array.isArray(r.value.items)||r.value.items.length>8)throw new Error('invalidBackup');
    const clean={items:[],time:Number.isFinite(r.value.time)?r.value.time:0};
    async function item(v,upload=false){if(!v||!(v.blob instanceof Blob)||(!upload&&!validURL(v.url)))throw new Error('invalidBackup');const dimensions=await imageInfo(v.blob,upload?12*1024*1024:3*1024*1024);return {blob:v.blob,...dimensions,...(!upload?{url:v.url,type:String(v.type||'icon').slice(0,40)}:{})};}
    clean.items=await Promise.all(r.value.items.map(v=>item(v)));if(r.value.upload)clean.upload=await item(r.value.upload,true);if(r.value.thirdParty)clean.thirdParty=await item(r.value.thirdParty);if(r.value.appStore)clean.appStore=await item(r.value.appStore);clean.algorithm=r.value.algorithm||0;r.value=clean;
  }
  b.records=records;return b;
}
export async function applyBackup(b){

  const folder=await ensureManagedFolder();
  const existing=folder.children||[],used=new Set(),mapping=new Map();
  for(const site of b.sites){let target=existing.find(n=>n.url===site.url&&!used.has(n.id));if(!target)target=await chrome.bookmarks.create({parentId:folder.id,title:site.title,url:site.url});used.add(target.id);mapping.set(site.id,target.id);}
  await writeRecords(b.records);
  const local=await chrome.storage.local.get(['prefs','order','settings']);const prefs={...local.prefs};for(const [id,p]of Object.entries(b.prefs))prefs[mapping.get(id)]={...p};
  const order=[...new Set([...b.order.map(id=>mapping.get(id)),...b.sites.map(s=>mapping.get(s.id)),...(local.order||[])])];
  await chrome.storage.local.set({managedFolderId:folder.id,prefs,order,settings:{...local.settings,...b.settings},restoreRevision:Date.now()});
}
