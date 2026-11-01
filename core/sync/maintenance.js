import {failure} from '../errors.js';
import {references} from '../../sync/model.js';
import {assetRoot,assetURL} from '../net/cloud-config.js';
const GRACE=30*86400000;
export function createMaintenance({request,bytes,writeState,now}){
 async function collect(config,meta,state,etag){
  if(now()-(meta.lastInventory||0)>7*86400000){
   try{const listing=await request(config,'PROPFIND',assetRoot(config).href,{headers:{Depth:'1'}});if(listing.status===207){const xml=new TextDecoder().decode(await bytes(listing)),pattern=/<(?:[\w.-]+:)?href\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?href>/gi;let m;const keys=[];while((m=pattern.exec(xml))){const href=m[1].replaceAll('&amp;','&'),url=new URL(href,config.url),root=assetRoot(config);if(url.origin===root.origin&&url.pathname.startsWith(root.pathname)){const hash=decodeURIComponent(url.pathname.slice(root.pathname.length));if(/^[a-f\d]{64}$/.test(hash))keys.push(hash);}}meta.assets=[...new Set([...(meta.assets||[]),...keys])];}meta.lastInventory=now();}catch{}
  }
  const retained=new Set([...references(state.data),...references(state.previous?.data)]),candidates=meta.garbage||{};
  for(const hash of meta.assets||[])if(!retained.has(hash)&&!candidates[hash])candidates[hash]=now();
  for(const hash of retained)delete candidates[hash];meta.garbage=candidates;meta.assets=[...new Set([...(meta.assets||[]),...retained])];
  const expired=Object.keys(candidates).filter(hash=>/^[a-f\d]{64}$/.test(hash)&&now()-candidates[hash]>GRACE).slice(0,10);if(!expired.length)return {state,etag};

  const lease=crypto.randomUUID(),leased={...state,maintenance:{token:lease,until:now()+120000}};let leaseTag=await writeState(config,leased,etag);
  try{for(const hash of expired){if(now()>leased.maintenance.until-15000)break;const response=await request(config,'DELETE',assetURL(config,hash));if(response.ok||response.status===404){delete candidates[hash];meta.assets=meta.assets.filter(h=>h!==hash);}}}
  finally{try{leaseTag=await writeState(config,state,leaseTag);}catch{throw failure('syncRace');}}
  return {state,etag:leaseTag};
 }
 return {collect};
}
