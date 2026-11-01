import {clone} from '../errors.js';
import {emptyData,validateData,webURL} from '../../sync/model.js';
import {ensureManagedFolder,isFolderMarker} from '../../sync/folder.js';
import {DEFAULT_ICON_TEMPLATE,iconURL} from '../config/settings.js';
export function createBookmarkSnapshot({api,readRecords,itemRef}){
 function preference(value={}){return {appearance:value.appearance==='letter'?'letter':'image',color:value.color||null,customColor:!!value.customColor,scale:value.scale??100,source:value.source||'auto',offsetX:value.offsetX||0,offsetY:value.offsetY||0};}
 async function capture(meta,remote){
  const saved=await api.storage.local.get(['prefs','order','settings','managedFolderId']),folder=await ensureManagedFolder(api),sites=(folder?.children||[]).filter(b=>webURL(b.url)&&!isFolderMarker(b));
  const data=emptyData(),mapping={},used=new Set(),known={...remote?.sites,...meta.base?.sites};
  const prioritized=[...sites].sort((a,b)=>Number(!!meta.idMap?.[b.id])-Number(!!meta.idMap?.[a.id]));
  for(const site of prioritized){let id=meta.idMap?.[site.id];if(!id){id=Object.keys(known).find(id=>known[id].url===site.url&&!used.has(id));if(!id){const alias=Object.keys(known).find(id=>used.has(id)&&known[id].url===site.url&&known[id].title===site.title&&data.sites[id]?.title===site.title);if(alias){mapping[site.id]=alias;continue;}}id=id||crypto.randomUUID();}used.add(id);mapping[site.id]=id;data.sites[id]={title:site.title,url:site.url,preference:preference(saved.prefs?.[site.id]||(!meta.base?known[id]?.preference:undefined))};}
  const ranks=new Map((saved.order||[]).map((id,i)=>[id,i]));data.order=[...sites].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity)).map(site=>mapping[site.id]);data.order=[...new Set(data.order)];
  if(!meta.base&&!saved.order?.length&&remote?.order)data.order=[...remote.order.filter(id=>data.sites[id]),...data.order.filter(id=>!remote.order.includes(id))];
  data.iconTemplate=saved.settings?.iconTemplate||(!meta.base?remote?.iconTemplate:null)||DEFAULT_ICON_TEMPLATE;
  const urls=new Set(sites.map(site=>site.url));
  for(const {key,value}of await readRecords())if(urls.has(key)){
   const record={items:[],time:value.time||0,algorithm:value.algorithm||0};for(const item of value.items||[]){const ref=await itemRef(item);if(ref)record.items.push(ref);}
   for(const slot of ['upload','thirdParty','appStore']){const ref=await itemRef(value[slot]);if(ref)record[slot]=ref;}data.records[key]=record;
  }
  const fallback=meta.base?.records||remote?.records||{},cacheMissing=[...urls].some(url=>fallback[url]&&(!data.records[url]||fallback[url].upload&&!data.records[url].upload||fallback[url].thirdParty&&!data.records[url].thirdParty||fallback[url].appStore&&!data.records[url].appStore));
  for(const url of urls)if(fallback[url]){const current=data.records[url];data.records[url]=current?{...fallback[url],...current,items:current.items.length?current.items:fallback[url].items,...(!current.upload&&fallback[url].upload?{upload:fallback[url].upload}:{}),...(!current.thirdParty&&fallback[url].thirdParty?{thirdParty:fallback[url].thirdParty}:{})}:clone(fallback[url]);}
  validateData(data);iconURL(data.iconTemplate,'https://example.com/');return {data,mapping,sites,folder,cacheMissing,rawOrder:saved.order||[],rawPrefs:saved.prefs||{},folderLost:(await api.storage.local.get('managedFolderLost')).managedFolderLost===true};
 }
 return {capture};
}
