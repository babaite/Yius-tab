import {failure} from '../errors.js';
import {clone} from '../errors.js';
import {equal,findFolder,webURL} from '../../sync/model.js';
import {isFolderMarker,ensureManagedFolder} from '../../sync/folder.js';
export function createSnapshotApplier({api,writeRecords,now,blobs,getGeneration,setApplying}){
 async function apply(data,local,meta,runGeneration){
  if(getGeneration()!==runGeneration)throw failure('syncLocalChanged');
  const saved=await api.storage.local.get(['prefs','order','settings','managedFolderId','managedFolderIdentity']);const currentSites=(findFolder(await api.bookmarks.getTree(),saved.managedFolderId,saved.managedFolderIdentity)?.children||[]).filter(b=>webURL(b.url)&&!isFolderMarker(b));
  if(!equal(currentSites.map(({id,title,url})=>({id,title,url})),local.sites.map(({id,title,url})=>({id,title,url}))))throw failure('syncLocalChanged');
  if(!equal(saved.order||[],local.rawOrder)||!equal(saved.prefs||{},local.rawPrefs))throw failure('syncLocalChanged');

  setApplying(true);
  try{
   const folder=local.folder||await ensureManagedFolder(api);
   const idMap={},reverse=new Map();for(const [id,uuid]of Object.entries(local.mapping).sort(([a],[b])=>Number(!!meta.idMap?.[b])-Number(!!meta.idMap?.[a])))if(!reverse.has(uuid))reverse.set(uuid,id);
   for(const [uuid,site]of Object.entries(data.sites)){
    let id=reverse.get(uuid);if(!id){const added=await api.bookmarks.create({parentId:folder.id,title:site.title,url:site.url});id=added.id;}
    else {const old=local.sites.find(s=>s.id===id);if(old.title!==site.title||old.url!==site.url)await api.bookmarks.update(id,{title:site.title,url:site.url});}idMap[id]=uuid;
   }
   for(const site of local.sites)if((!data.sites[local.mapping[site.id]]&&meta.base?.sites[local.mapping[site.id]])||(data.sites[local.mapping[site.id]]&&!idMap[site.id]))await api.bookmarks.remove(site.id);
   const entries=[];for(const [url,record]of Object.entries(data.records)){

    if(!local.cacheMissing&&equal(local.data.records[url],record))continue;
    const value={items:[],time:record.time,algorithm:record.algorithm||0,siteFailures:0,siteRetryAfter:0};
    const decode=item=>{const {asset,bytes,mime,...rest}=item;return {...rest,blob:blobs.get(asset)};};value.items=record.items.map(decode);
    for(const slot of ['upload','thirdParty','appStore'])if(record[slot])value[slot]=decode(record[slot]);
    if(value.appStore)value.appStoreTime=now();
    if(value.thirdParty){value.thirdPartyTime=now();value.thirdPartyEndpoint=value.thirdParty.url;value.thirdPartyRetryAfter=0;}
    entries.push({key:url,value});
   }if(entries.length)await writeRecords(entries);
   const fresh=await api.storage.local.get(['prefs','settings']);const prefs={...fresh.prefs},uuidToID=new Map(Object.entries(idMap).map(([id,uuid])=>[uuid,id]));
   for(const [id,uuid]of Object.entries(idMap))prefs[id]=clone(data.sites[uuid].preference);
   const order=[...data.order,...Object.keys(data.sites).filter(id=>!data.order.includes(id))].map(uuid=>uuidToID.get(uuid));
   const changed=local.cacheMissing||local.sites.length!==Object.keys(data.sites).length||!equal(local.data,data);await api.storage.local.set({managedFolderId:folder?.id,managedFolderLost:false,prefs,order,settings:{...fresh.settings,iconTemplate:data.iconTemplate},...(changed?{syncRevision:now()}:{} )});return idMap;
  }finally{setApplying(false);}
 }
 return {apply};
}
