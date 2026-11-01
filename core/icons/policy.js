export const ICON_ALGORITHM=3;
export function siteRefreshDue(record,force=false,now=Date.now()){
 if(force||!record||record.algorithm!==ICON_ALGORITHM)return true;
 if(record.siteRetryAfter>now)return false;
 return record.algorithm!==ICON_ALGORITHM||!record.items?.length||now-(record.time||0)>7*86400000||record.items?.length&&record.items.every(i=>!i.vector&&Math.min(i.width||0,i.height||0)<72)&&now-(record.time||0)>15*60000;
}
export function thirdPartyRefreshDue(record,endpoint,force=false,now=Date.now()){
 if(force)return true;
 if(record?.thirdPartyEndpoint===endpoint&&record.thirdPartyRetryAfter>now)return false;
 return !record?.thirdParty?.blob||record.thirdParty.url!==endpoint||now-(record.thirdPartyTime||0)>7*86400000;
}
export function retryDelay(failures){return Math.min(30*60000,60000*2**Math.min(Math.max(0,failures-1),5));}
