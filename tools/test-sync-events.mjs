import assert from 'node:assert/strict';
import {
 CHANGE_LOG_FORMAT,
 CHANGE_LOG_SCHEMA,
 TOMBSTONE_TTL,
 ZERO_HASH,
 appendChanges,
 createChange,
 deleteApprovalId,
 deleteGuardInfo,
 hashEntity,
 logFromSnapshot,
 newULID,
 reconcileChanges
} from '../core/sync/change-log.js';
import {createWebDAV,REQUEST_TIMEOUT_MS} from '../core/net/webdav.js';

const settings=newULID(1),order=newULID(2),siteId=newULID(3),deviceA=newULID(4),deviceB=newULID(5);
const preference={appearance:'image',color:null,customColor:false,scale:100,source:'auto',offsetX:0,offsetY:0};
const site={title:'Example',url:'https://example.com/',preference};
const basePayload={kind:'site',site};
const baseEntry={entity_id:siteId,operation:'upsert',payload:basePayload,hash:await hashEntity('upsert',basePayload)};
const initialChange=createChange({entity_id:siteId,operation:'upsert',prev_hash:ZERO_HASH,payload:basePayload,device_id:deviceB,created_at:1});
const log=(changes)=>({format:CHANGE_LOG_FORMAT,schema:CHANGE_LOG_SCHEMA,log_id:newULID(),created_at:1,documents:{settings,order},changes});

{
 const localPayload={kind:'site',site:{...site,preference:{...preference,color:'#ff0000'}}};
 const remotePayload={kind:'site',site:{...site,title:'Example renamed'}};
 const local=createChange({entity_id:siteId,operation:'upsert',prev_hash:baseEntry.hash,payload:localPayload,device_id:deviceA,created_at:20});
 const remote=createChange({entity_id:siteId,operation:'upsert',prev_hash:baseEntry.hash,payload:remotePayload,device_id:deviceB,created_at:10});
 const result=await reconcileChanges({log:log([initialChange,remote]),remoteCursor:1,baseEntities:{[siteId]:baseEntry},localChanges:[local]});
 assert.equal(result.conflicts.length,0);
 assert.equal(result.outgoing.length,1);
 assert.equal(result.outgoing[0].payload.site.title,'Example renamed');
 assert.equal(result.outgoing[0].payload.site.preference.color,'#ff0000');
}

{
 const legacyID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const legacyData={sites:{[legacyID]:site},order:[legacyID],iconTemplate:'https://www.google.com/s2/favicons?domain={domain}&sz={size}',records:{}};
 const migrated=await logFromSnapshot(legacyData,{device_id:deviceA,now:1000});
 assert.equal(migrated.format,CHANGE_LOG_FORMAT);
 assert.equal(migrated.changes.length,3);
 assert.equal(migrated.changes.some(change=>change.entity_id===legacyID),false);
 assert.ok(migrated.changes.every(change=>/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(change.entity_id)));
}

{
 const localPayload={kind:'site',site:{...site,title:'Local title'}};
 const remotePayload={kind:'site',site:{...site,title:'Remote title'}};
 const local=createChange({entity_id:siteId,operation:'upsert',prev_hash:baseEntry.hash,payload:localPayload,device_id:deviceA,created_at:20});
 const remote=createChange({entity_id:siteId,operation:'upsert',prev_hash:baseEntry.hash,payload:remotePayload,device_id:deviceB,created_at:10});
 const result=await reconcileChanges({log:log([initialChange,remote]),remoteCursor:1,baseEntities:{[siteId]:baseEntry},localChanges:[local]});
 assert.equal(result.conflicts.length,1);
 assert.equal(result.outgoing.length,0);
 assert.equal(result.conflicts[0].local.payload.site.title,'Local title');
 assert.equal(result.conflicts[0].remote[0].payload.site.title,'Remote title');
}

{
 const local=createChange({entity_id:siteId,operation:'upsert',prev_hash:'a'.repeat(64),payload:basePayload,device_id:deviceA,created_at:20});
 const remote=createChange({entity_id:siteId,operation:'upsert',prev_hash:ZERO_HASH,payload:basePayload,device_id:deviceB,created_at:10});
 const result=await reconcileChanges({log:log([remote]),baseEntities:{},localChanges:[local]});
 assert.equal(result.conflicts.length,1);
}

{
 const old=createChange({entity_id:siteId,operation:'delete',prev_hash:baseEntry.hash,payload:{deleted_at:100},device_id:deviceA,created_at:100});
 assert.ok(TOMBSTONE_TTL>=90*86400000);
 const broken={...old,prev_hash:'b'.repeat(64)};
 await appendChanges({[siteId]:baseEntry},[broken]).then(
  ()=>assert.fail('expected broken log chain'),
  error=>assert.equal(error.message,'syncInvalidData')
 );
 const deleted=await appendChanges({},[createChange({entity_id:siteId,operation:'upsert',prev_hash:ZERO_HASH,payload:basePayload,device_id:deviceA,created_at:1})]);
 const tombstone=createChange({entity_id:siteId,operation:'delete',prev_hash:deleted[siteId].hash,payload:{deleted_at:2},device_id:deviceA,created_at:2});
 const afterDelete=await appendChanges(deleted,[tombstone]);
 assert.equal(afterDelete[siteId].operation,'delete');
}

{
 const entities={};const changes=[];
 for(let index=0;index<60;index++){
  const id=newULID(100+index);
  const payload={kind:'settings',value:index};
  entities[id]={entity_id:id,operation:'upsert',payload,hash:await hashEntity('upsert',payload)};
  changes.push(createChange({entity_id:id,operation:'delete',prev_hash:entities[id].hash,payload:{deleted_at:200},device_id:deviceA,created_at:200+index}));
 }
 const guard=deleteGuardInfo(changes,entities);
 assert.equal(guard.count,60);
 assert.equal(guard.limit,50);
 assert.equal(guard.required,true);
 assert.match(await deleteApprovalId(changes),/^[a-f\d]{64}$/);
}

{
 const api={storage:{local:{get:async()=>({settings:{cloud:{enabled:true,url:'https://dav.example/sync.json',username:'',password:''}}})}}};
 let attempts=0;
 const fetcher=async()=>{attempts++;if(attempts===1)throw new Error('proxy timeout');return new Response('ok',{status:200});};
 const dav=createWebDAV({api,fetcher,isOnline:()=>true,sleep:async()=>{},random:()=>0,requestTimeout:10000,maxRetries:3});
 const response=await dav.request({enabled:true,url:'https://dav.example/sync.json',username:'',password:''},'GET','https://dav.example/sync.json');
 assert.equal(response.status,200);
 assert.equal(attempts,2);
 assert.equal(REQUEST_TIMEOUT_MS,10000);
}

{
 const api={storage:{local:{get:async()=>({settings:{cloud:{enabled:true,url:'https://dav.example/sync.json',username:'',password:''}}})}}};
 let attempts=0;
 const fetcher=async()=>{attempts++;throw new Error('proxy timeout');};
 const dav=createWebDAV({api,fetcher,isOnline:()=>true,sleep:async()=>{},random:()=>0,maxRetries:3});
 await assert.rejects(
  ()=>dav.request({enabled:true,url:'https://dav.example/sync.json',username:'',password:''},'GET','https://dav.example/sync.json'),
  error=>error.code==='3-consecutive'
 );
 assert.equal(attempts,3);
}

{
 const api={storage:{local:{get:async()=>({settings:{cloud:{enabled:true,url:'https://dav.example/sync.json',username:'',password:''}}})}}};
 let attempts=0;
 const fetcher=async()=>{
  attempts++;
  return new Response('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>',{status:207});
 };
 const dav=createWebDAV({api,fetcher,isOnline:()=>true,sleep:async()=>{},random:()=>0,maxRetries:0});
 await assert.rejects(
  ()=>dav.readTag({enabled:true,url:'https://dav.example/sync.json',username:'',password:''}),
  error=>error.message==='syncIncompleteListing'
 );
 assert.equal(attempts,1);
}

{
 const api={storage:{local:{get:async()=>({settings:{cloud:{enabled:false,url:'https://dav.example/sync.json',username:'',password:''}}})}}};
 const fetcher=async()=>new Response('',{status:404});
 const dav=createWebDAV({api,fetcher,isOnline:()=>true,sleep:async()=>{}});
 const config={enabled:false,url:'https://dav.example/sync.json',username:'',password:''};
 await assert.rejects(()=>dav.readTag(config),error=>error.message==='syncLocalChanged');
 assert.equal(await dav.readTag(config,config.url,{allowDisabled:true}),null);
}

console.log('sync event tests passed');
