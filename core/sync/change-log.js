import {failure} from '../errors.js';
import {emptyData,equal,merge,stable,validateData} from '../../sync/model.js';

const ULID_ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_RE=/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SHA256_RE=/^[a-f\d]{64}$/;

export const ZERO_HASH='0'.repeat(64);
export const CHANGE_LOG_FORMAT='yius-tab-change-log';
export const CHANGE_LOG_SCHEMA=2;
export const TOMBSTONE_TTL=90*86400000;
export const DELETE_LIMIT_MIN=50;

function encodeTime(time){
 let value=time,out='';
 for(let i=0;i<10;i++){out=ULID_ALPHABET[value%32]+out;value=Math.floor(value/32);}
 return out;
}

export function newULID(time=Date.now()){
 if(!Number.isSafeInteger(time)||time<0)throw new TypeError('Invalid ULID time');
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 let random='';
 for(const byte of bytes)random+=ULID_ALPHABET[byte%32];
 return encodeTime(time)+random;
}

export function isULID(value){return typeof value==='string'&&ULID_RE.test(value);}
export function isHash(value){return typeof value==='string'&&SHA256_RE.test(value);}

export async function hashText(value){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function hashPayload(payload){return hashText(stable(payload));}
export async function hashChange(change){return hashText(stable(change));}
export async function hashEntity(operation,payload){return hashText(stable({operation,payload}));}

export function createChange({entity_id,operation,prev_hash=ZERO_HASH,payload,device_id,created_at=Date.now()}){
 const change={entity_id,operation,prev_hash,payload,device_id,created_at};
 validateChangeRecord(change);
 return change;
}

export function validateChangeRecord(change){
 if(!change||!isULID(change.entity_id)||!['upsert','delete'].includes(change.operation)||!String(change.prev_hash)||!isHash(change.prev_hash)||typeof change.device_id!=='string'||!change.device_id||change.device_id.length>128||!Number.isFinite(change.created_at)||change.created_at<0||!change.payload||typeof change.payload!=='object'||Array.isArray(change.payload))throw failure('syncInvalidData','change-record');
 const safe=(value,depth=0)=>{if(depth>32)throw failure('syncInvalidData','change-depth');if(value&&typeof value==='object'){if(Array.isArray(value)){if(value.length>10000)throw failure('syncInvalidData','change-array');for(const item of value)safe(item,depth+1);return;}for(const key of Object.keys(value)){if(['__proto__','constructor','prototype'].includes(key))throw failure('syncInvalidData','change-key');safe(value[key],depth+1);}}};
 safe(change.payload);
 if(change.operation==='delete'&&(!Number.isFinite(change.payload.deleted_at)||change.payload.deleted_at<0))throw failure('syncInvalidData','delete-timestamp');
 return change;
}

export function validateChangeLog(log){
 if(!log||log.format!==CHANGE_LOG_FORMAT||log.schema!==CHANGE_LOG_SCHEMA||!isULID(log.log_id)||!Number.isFinite(log.created_at)||!Array.isArray(log.changes)||log.changes.length>100000||!log.documents||!isULID(log.documents.settings)||!isULID(log.documents.order))throw failure('syncFormat');
 log.changes.forEach(validateChangeRecord);
 return log;
}

export async function appendChanges(entities,changes){
 const next={...entities};
 for(const change of changes){
  validateChangeRecord(change);
  const current=next[change.entity_id]?.hash||ZERO_HASH;
  if(change.prev_hash!==current)throw failure('syncInvalidData','change-chain');
  next[change.entity_id]={entity_id:change.entity_id,operation:change.operation,payload:change.payload,hash:await hashEntity(change.operation,change.payload),created_at:change.created_at,device_id:change.device_id};
 }
 return next;
}

export function projectEntities(entities){
 const data=emptyData(),siteIDs=[];
 let settings=null,order=null;
 for(const [entity_id,entity]of Object.entries(entities||{})){
  if(!entity||entity.operation!=='upsert')continue;
  const payload=entity.payload;
  if(payload.kind==='site'&&payload.site){
   data.sites[entity_id]=structuredClone(payload.site);siteIDs.push(entity_id);
  }else if(payload.kind==='icon'&&payload.url&&payload.record){
   data.records[payload.url]=structuredClone(payload.record);
  }else if(payload.kind==='settings'){
   settings=payload;
  }else if(payload.kind==='order'&&Array.isArray(payload.order)){
   order=payload.order;
  }
 }
 if(settings&&typeof settings.iconTemplate==='string')data.iconTemplate=settings.iconTemplate;
 if(order)data.order=[...new Set(order.filter(id=>data.sites[id]))];
 data.order=[...data.order,...siteIDs.filter(id=>!data.order.includes(id))];
 validateData(data);
 return data;
}

export async function snapshotToEntities(data,meta={},now=Date.now()){
 const iconIds={...(meta.iconIds||{})},entityIds={...(meta.entityIds||{})};
 entityIds.settings=isULID(entityIds.settings)?entityIds.settings:newULID(now);
 entityIds.order=isULID(entityIds.order)?entityIds.order:newULID(now+1);
 const entities={};
 for(const [entityId,site]of Object.entries(data.sites)){
  if(!isULID(entityId))throw failure('syncInvalidData','site-ulid');
  const payload={kind:'site',site};
  entities[entityId]={entity_id:entityId,operation:'upsert',payload,hash:await hashEntity('upsert',payload)};
 }
 for(const [url,record]of Object.entries(data.records)){
  let entityId=iconIds[url];
  if(!isULID(entityId)){entityId=newULID(now+2);iconIds[url]=entityId;}
  const payload={kind:'icon',url,record};
  entities[entityId]={entity_id:entityId,operation:'upsert',payload,hash:await hashEntity('upsert',payload)};
 }
 const settingsPayload={kind:'settings',iconTemplate:data.iconTemplate};
 entities[entityIds.settings]={entity_id:entityIds.settings,operation:'upsert',payload:settingsPayload,hash:await hashEntity('upsert',settingsPayload)};
 const orderPayload={kind:'order',order:[...data.order]};
 entities[entityIds.order]={entity_id:entityIds.order,operation:'upsert',payload:orderPayload,hash:await hashEntity('upsert',orderPayload)};
 return {entities,iconIds,entityIds};
}

export function collectEntityReferences(entities){
 const iconIds={},entityIds={};
 for(const entity of Object.values(entities||{})){
  if(entity?.operation!=='upsert')continue;
  if(entity.payload?.kind==='icon'&&entity.payload.url)iconIds[entity.payload.url]=entity.entity_id;
  if(entity.payload?.kind==='settings')entityIds.settings=entity.entity_id;
  if(entity.payload?.kind==='order')entityIds.order=entity.entity_id;
 }
 return {iconIds,entityIds};
}

export async function buildPendingChanges({currentEntities,baseEntities={},previousChanges=[],device_id,now=Date.now()}){
 const previous=new Map(previousChanges.map(change=>[change.entity_id,change]));
 const changes=[],ids=new Set([...Object.keys(currentEntities),...Object.keys(baseEntities)]);
 let sequence=0;
 for(const entity_id of ids){
  const current=currentEntities[entity_id],base=baseEntities[entity_id];
  if((current?.hash||ZERO_HASH)===(base?.hash||ZERO_HASH))continue;
  const old=previous.get(entity_id);
  if(current&&old&&old.operation==='upsert'&&old.prev_hash===(base?.hash||ZERO_HASH)&&await hashPayload(old.payload)===await hashPayload(current.payload)){changes.push(old);continue;}
  const operation=current?'upsert':'delete';
  const payload=current?current.payload:{deleted_at:now};
  if(old&&old.operation==='delete'&&operation==='delete'&&old.prev_hash===(base?.hash||ZERO_HASH)){changes.push(old);continue;}
  changes.push(createChange({entity_id,operation,prev_hash:base?.hash||ZERO_HASH,payload,device_id,created_at:now+sequence++}));
 }
 return changes;
}

export async function reconcileChanges({log,baseEntities={},localChanges=[],remoteCursor=0,resolution}){
 validateChangeLog(log);
 const remoteEntities=await appendChanges({},log.changes);
 const cursor=Number.isInteger(remoteCursor)&&remoteCursor>=0&&remoteCursor<=log.changes.length?remoteCursor:0;
 const unseen=log.changes.slice(cursor),byEntity=new Map();
 for(const change of unseen){if(!byEntity.has(change.entity_id))byEntity.set(change.entity_id,[]);byEntity.get(change.entity_id).push(change);}
 const outgoing=[],conflicts=[];
 for(const local of localChanges){
  const remote=byEntity.get(local.entity_id)||[];
  const head=remoteEntities[local.entity_id]?.hash||ZERO_HASH;
  if(!remote.length||local.prev_hash===head){outgoing.push(local);continue;}
  if(resolution==='remote')continue;
  if(resolution==='local'){
   outgoing.push(createChange({entity_id:local.entity_id,operation:local.operation,prev_hash:head,payload:local.payload,device_id:local.device_id,created_at:Date.now()}));
   continue;
  }
  if(local.prev_hash===remote[0].prev_hash){
   const remoteEntity=remoteEntities[local.entity_id];
   if(local.operation==='upsert'&&remoteEntity?.operation==='upsert'){
    const merged=merge(baseEntities[local.entity_id]?.payload||{},local.payload,remoteEntity.payload);
    if(!merged.conflicts.length){
     if(!equal(merged.data,remoteEntity.payload))outgoing.push(createChange({entity_id:local.entity_id,operation:'upsert',prev_hash:head,payload:merged.data,device_id:local.device_id,created_at:Math.max(local.created_at,...remote.map(change=>change.created_at))+1}));
     continue;
    }
   }else if(local.operation==='delete'&&remoteEntity?.operation==='delete')continue;
   conflicts.push({entity_id:local.entity_id,base_hash:local.prev_hash,remote_head:head,local,remote});
   continue;
  }
  conflicts.push({entity_id:local.entity_id,base_hash:local.prev_hash,remote_head:head,local,remote});
 }
 return {remoteEntities,outgoing,conflicts,unseen};
}

export function deleteGuardInfo(changes,entities){
 const count=new Set(changes.filter(change=>change.operation==='delete').map(change=>change.entity_id)).size,total=Object.values(entities||{}).filter(entity=>entity.operation==='upsert').length;
 const limit=Math.max(DELETE_LIMIT_MIN,Math.ceil(total*.05));
 return {count,total,limit,required:count>limit};
}

export async function deleteApprovalId(changes){
 const byEntity=new Map(changes.filter(change=>change.operation==='delete').map(change=>[change.entity_id,change.payload.deleted_at]));
 const deletes=[...byEntity].sort((a,b)=>a[0].localeCompare(b[0]));
 return hashPayload(deletes);
}

export async function logFromSnapshot(data,{device_id,now=Date.now()}={}){
 const emptyMeta={iconIds:{},entityIds:{}};
 const ids=new Map(Object.keys(data.sites).map((id,index)=>[id,isULID(id)?id:newULID(now+index)]));
 const normalized={...data,sites:Object.fromEntries(Object.entries(data.sites).map(([id,site])=>[ids.get(id),site])),order:data.order.map(id=>ids.get(id)).filter(Boolean)};
 const converted=await snapshotToEntities(normalized,emptyMeta,now);
 const changes=Object.values(converted.entities).map((entity,index)=>createChange({entity_id:entity.entity_id,operation:'upsert',prev_hash:ZERO_HASH,payload:entity.payload,device_id,created_at:now+index}));
 return {
  format:CHANGE_LOG_FORMAT,
  schema:CHANGE_LOG_SCHEMA,
  log_id:newULID(now),
  created_at:now,
  documents:{settings:converted.entityIds.settings,order:converted.entityIds.order},
  changes
 };
}
