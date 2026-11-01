import {ICON_ALGORITHM,siteRefreshDue,thirdPartyRefreshDue,retryDelay} from './policy.js';
export function createIconAcquisition({records,cached,store,discover,download,appStoreMatches,thirdPartyURL,uiError,getSource,getBookmarks,onRecord}){
 const jobs=new Map(),iconRetries=new Map();
async function getRecord(b,force=false,source=getSource(b)){

 if(jobs.has(b.url))await jobs.get(b.url).catch(()=>{});
 if(iconRetries.has(b.url)){clearTimeout(iconRetries.get(b.url));iconRetries.delete(b.url);}
 const work=(async()=>{
  let record=records.get(b.url)||await cached(b.url).catch(()=>null);
  if(record)records.set(b.url,record);
  const save=async patch=>{record={...record,...records.get(b.url),...patch};records.set(b.url,record);onRecord(b);await store(b.url,record);};
  if(source==='app-store'){
   if(force||!record?.appStore?.blob||Date.now()-(record.appStoreTime||0)>7*86400000||record?.appStoreRegions!==2){const matches=await appStoreMatches(b.url,b.title);if(!matches.length)throw uiError('noAppStoreIcon');const chosen=matches.find(item=>item.url===record?.appStore?.url)||matches[0],item=await download(chosen.url);await save({appStore:{...item,appName:chosen.name,type:'App Store'},appStoreTime:Date.now(),appStoreMatches:matches,appStoreRegions:2});}
  }else if(source==='third-party'){
   const endpoint=await thirdPartyURL(b.url);
   if(thirdPartyRefreshDue(record,endpoint,force)){
    try{const item=await download(endpoint);if(!item.vector&&Math.min(item.width,item.height)<16)throw uiError('noThirdPartyIcon');item.type='third-party';await save({thirdParty:item,thirdPartyTime:Date.now(),thirdPartyEndpoint:endpoint,thirdPartyRetryAfter:0,thirdPartyFailures:0});}
    catch(error){if(siteRefreshDue(record)){const items=await discover(b.url,{onUpdate:items=>{records.set(b.url,{...record,...records.get(b.url),items});onRecord(b);}});if(items.length)await save({items,time:Date.now(),algorithm:ICON_ALGORITHM,siteRetryAfter:0,siteFailures:0});}const failures=(record?.thirdPartyFailures||0)+1;await save({thirdPartyEndpoint:endpoint,thirdPartyFailures:failures,thirdPartyRetryAfter:Date.now()+retryDelay(failures)});throw error;}
   }
  }else if(source!=='upload'&&siteRefreshDue(record,force)){
   const items=await discover(b.url,{onUpdate:items=>{records.set(b.url,{...record,...records.get(b.url),items});onRecord(b);}}),failures=items.length?0:(record?.siteFailures||0)+1;
   await save({items:items.length?items:(record?.items||[]),time:items.length?Date.now():(record?.time||0),algorithm:ICON_ALGORITHM,siteFailures:failures,siteRetryAfter:items.length?0:Date.now()+retryDelay(failures)});
  }
  return record||{items:[],time:0};
 })();jobs.set(b.url,work);try{return await work;}finally{if(jobs.get(b.url)===work)jobs.delete(b.url);const record=records.get(b.url),due=source==='third-party'?record?.thirdPartyRetryAfter:record?.siteRetryAfter;if(due>Date.now()&&navigator.onLine&&!iconRetries.has(b.url))iconRetries.set(b.url,setTimeout(()=>{iconRetries.delete(b.url);const current=getBookmarks().find(x=>x.url===b.url);if(current)getRecord(current).catch(()=>{});},due-Date.now()+100));}
}
 return {getRecord,retryAll(){for(const timer of iconRetries.values())clearTimeout(timer);iconRetries.clear();},dispose(){for(const timer of iconRetries.values())clearTimeout(timer);iconRetries.clear();}};
}
