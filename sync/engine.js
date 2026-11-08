import {dbReadRecords,dbWriteRecords} from '../newtab/js/icon-db.js';
import {cloudFileURL} from '../core/config/settings.js';
import {hashBlob,references} from './model.js';
import {failure,clone} from '../core/errors.js';
import {diskCache} from '../core/storage/asset-cache.js';
import {configKey,checkConfig} from '../core/net/cloud-config.js';
import {createWebDAV} from '../core/net/webdav.js';
import {createAssetService} from '../core/sync/assets.js';
import {createRemoteStore} from '../core/sync/remote.js';
import {createBookmarkSnapshot} from '../core/bookmarks/snapshot.js';
import {createSnapshotApplier} from '../core/bookmarks/apply.js';
import {
 appendChanges,
 buildPendingChanges,
 collectEntityReferences,
 deleteApprovalId,
 deleteGuardInfo,
 newULID,
 projectEntities,
 reconcileChanges,
 snapshotToEntities,
 validateChangeLog
} from '../core/sync/change-log.js';

export function createSyncEngine({
 api=chrome,
 fetcher=(...args)=>fetch(...args),
 readRecords=dbReadRecords,
 writeRecords=entries=>dbWriteRecords(entries,false),
 cache=diskCache,
 now=()=>Date.now(),
 isOnline=()=>globalThis.navigator?.onLine!==false,
 sleep,
 random
}={}){
 let running=null,applying=false,generation=0,rerun=false;
 const blobs=new Map(),recentUploads=new Map();
 let recentEndpoint,requestCount=0,published=false,operations=[];

 async function status(state,extra={}){
  const saved=await api.storage.local.get('syncStatus');
  await api.storage.local.set({syncStatus:{...saved.syncStatus,state,...extra}});
 }
 function dirty(){if(!applying){generation++;if(running)rerun=true;}return !applying;}

 const transport=createWebDAV({api,fetcher,isOnline,onRequest:()=>requestCount++,onResponse:operation=>operations.push(operation),sleep,random});
 const {request,bytes,readTag,probe}=transport;
 const {itemRef,acquireAssets}=createAssetService({api,request,bytes,cache,now,blobs,recentUploads});
 const {capture}=createBookmarkSnapshot({api,readRecords,itemRef});
 const {apply}=createSnapshotApplier({api,writeRecords,now,blobs,getGeneration:()=>generation,setApplying:value=>{applying=value;}});
 const remote=createRemoteStore({request,bytes,readTag,now});
 const {emptyLog,readLog,writeLog,writeConflict,testConnection}=remote;

 function configFrom(saved){
  const config={...saved.settings?.cloud};
  if(config.url)config.url=cloudFileURL(config.url);
  return config;
 }
 async function deviceId(){
  const saved=await api.storage.local.get('syncDeviceId');
  if(saved.syncDeviceId)return saved.syncDeviceId;
  const id=newULID(now());await api.storage.local.set({syncDeviceId:id});return id;
 }
 function newMeta(endpoint,key,id){
  return {
   endpoint,
   configKey:key,
   deviceId:id,
   idMap:{},
   iconIds:{},
   entityIds:{},
   entities:{},
   pendingChanges:[],
   remoteCursor:0,
   last_remote_etag:null,
   logId:null,
   dirty:true,
   failures:0
  };
 }
 function siteCount(entities){return Object.values(entities||{}).filter(entity=>entity.operation==='upsert'&&entity.payload?.kind==='site').length;}
 function mergeEntityReferences(meta,entities,documents){
  const refs=collectEntityReferences(entities);
  return {
   ...meta,
   iconIds:{...meta.iconIds,...refs.iconIds},
   entityIds:{...meta.entityIds,...refs.entityIds,settings:documents?.settings||refs.entityIds.settings||meta.entityIds?.settings,order:documents?.order||refs.entityIds.order||meta.entityIds?.order}
  };
 }
 async function persistConflicts(meta,conflicts,remoteEntities,config,id){
  const saved=[];
  for(const conflict of conflicts){
   const remotePath=await writeConflict(config,{
    entity_id:conflict.entity_id,
    base_hash:conflict.base_hash,
    local:{
     device_id:id,
     change:conflict.local,
     entity:meta.entities[conflict.entity_id]||null
    },
    remote:{
     head:conflict.remote_head,
     changes:conflict.remote,
     entity:remoteEntities[conflict.entity_id]||null
    }
   },id);
   saved.push({entity_id:conflict.entity_id,remotePath,baseHash:conflict.base_hash,remoteHead:conflict.remote_head,detectedAt:now(),local:conflict.local,remote:conflict.remote});
  }
  return saved;
 }
 async function execute(options={}){
  const saved=await api.storage.local.get(['settings','syncState','syncStatus']);
  const config=configFrom(saved);
  if(!config.enabled){await status('disabled',{conflictCount:0,pendingDeletes:0});return;}
  checkConfig(config);
  const id=await deviceId();
  const key=await hashBlob(new Blob([configKey(config)]));
  let meta=saved.syncState?.endpoint===config.url?clone(saved.syncState):newMeta(config.url,key,id);
  meta.deviceId=id;
  if(meta.configKey!==key){meta=newMeta(config.url,key,id);}
  if(saved.syncStatus?.paused&&!options.force&&!options.resolution&&!options.deleteApproval)return;
  if(!options.force&&saved.syncStatus?.retryAt>now())return;

  if(recentEndpoint!==configKey(config)){recentUploads.clear();recentEndpoint=configKey(config);}
  await api.storage.local.set({syncState:meta});
  await status('checking',{errorKey:null,lastChecked:now()});

  for(let cycle=0;cycle<4;cycle++){
   try{
    const runGeneration=generation;
    const remoteTag=await readTag(config);
    if(!options.force&&meta.last_remote_etag&&remoteTag===meta.last_remote_etag&&!meta.dirty&&!(meta.pendingChanges||[]).length){
     await status('synced',{lastChecked:now(),errorKey:null,retryAt:null,paused:false});
     return;
    }
    if(!remoteTag&&(meta.logId||siteCount(meta.entities)))throw failure('syncRemoteMissing');
    await status('syncing',{errorKey:null,paused:false});
    await probe(config,meta,configKey(config));

    const pulled=remoteTag?await readLog(config,id,remoteTag):{log:null,etag:null,migrated:false,missing:true};
    let log=pulled.log||meta.log||emptyLog();
    if(meta.logId&&log.log_id!==meta.logId&&log.changes.length)throw failure('syncRemoteReset');
    if(meta.logId&&!log.changes.length)throw failure('syncRemoteReset');
    if((meta.remoteCursor||0)>log.changes.length)throw failure('syncRemoteReset');
    validateChangeLog(log);
    const remoteEntities=await appendChanges({},log.changes);
    meta=mergeEntityReferences(meta,remoteEntities,log.documents);
    const remoteData=projectEntities(remoteEntities);
    if(!meta.base&&siteCount(remoteEntities))meta.base=clone(remoteData);
    const local=await capture(meta,remoteData);
    if(local.folderLost&&siteCount(meta.entities))throw failure('syncEmptyGuard');

    const current=await snapshotToEntities(local.data,meta,now());
    meta={...meta,idMap:local.mapping,iconIds:current.iconIds,entityIds:current.entityIds};
    if(!log.changes.length)log={...log,documents:{settings:current.entityIds.settings,order:current.entityIds.order}};
    const pending=options.recovery?[]:await buildPendingChanges({
     currentEntities:current.entities,
     baseEntities:meta.entities||{},
     previousChanges:meta.pendingChanges||[],
     device_id:id,
     now:now()
    });
    meta={...meta,pendingChanges:pending,dirty:Boolean(pending.length)};
    const reconciled=await reconcileChanges({
     log,
     baseEntities:meta.entities||{},
     localChanges:pending,
     remoteCursor:meta.remoteCursor||0,
     resolution:options.resolution
    });

    if(reconciled.conflicts.length){
     const conflicts=await persistConflicts(meta,reconciled.conflicts,reconciled.remoteEntities,config,id);
     meta={...meta,conflicts,pendingChanges:pending,dirty:true};
     await api.storage.local.set({syncState:meta,syncConflicts:conflicts});
     await status('conflict',{conflictCount:conflicts.length,paused:true,errorKey:null,noticeId:null,lastChecked:now()});
     return;
    }

    const deleteChanges=[...reconciled.outgoing,...reconciled.unseen.filter(change=>change.operation==='delete')];
    const guard=deleteGuardInfo(deleteChanges,{...reconciled.remoteEntities,...current.entities});
    if(guard.required){
     const approvalId=await deleteApprovalId(deleteChanges);
     if(meta.deleteApproval!==approvalId&&options.deleteApproval!==approvalId){
      meta={...meta,deleteGuard:{id:approvalId,count:guard.count,total:guard.total,limit:guard.limit},dirty:true};
      await api.storage.local.set({syncState:meta});
      await status('deleteGuard',{pendingDeletes:guard.count,deleteLimit:guard.limit,paused:true,errorKey:null,noticeId:null,lastChecked:now()});
      return;
     }
     meta={...meta,deleteGuard:null,deleteApproval:null};
    }

    const nextLog={...log,changes:[...log.changes,...reconciled.outgoing]};
    const resultEntities=await appendChanges(reconciled.remoteEntities,reconciled.outgoing);
    const data=projectEntities(resultEntities);
    await status('syncing',{conflictCount:0,paused:false,errorKey:null});
    const known=new Set(references(remoteData));
    await acquireAssets(config,data,known,meta);
    if(generation!==runGeneration)throw failure('syncLocalChanged');

    let nextTag=pulled.etag;
    if(reconciled.outgoing.length||pulled.migrated||pulled.missing||!pulled.log){
     nextTag=await writeLog(config,nextLog,pulled.etag);
     published=true;
    }
    const idMap=await apply(data,local,meta,runGeneration);
    meta={
     ...meta,
     base:clone(data),
     idMap,
     entities:resultEntities,
     pendingChanges:[],
     remoteCursor:nextLog.changes.length,
     last_remote_etag:nextTag,
     logId:nextLog.log_id,
     dirty:false,
     failures:0,
     deleteGuard:null,
     deleteApproval:null,
     conflicts:null
    };
    delete meta.remote;delete meta.etag;
    await api.storage.local.set({syncState:meta,syncConflicts:[]});
    await status('synced',{lastSynced:now(),lastChecked:now(),retryAt:null,paused:false,conflictCount:0,pendingDeletes:0,errorKey:null,noticeId:null});
    return;
   }catch(error){
    if(error.message==='syncRace'&&cycle<3){meta.last_remote_etag=null;continue;}
    throw error;
   }
  }
  throw failure('syncRace');
 }

 async function run(options={}){
  if(running){await running;return options.force||options.resolution||options.recovery||options.deleteApproval?run(options):undefined;}
  let changeAttempt=false,queuedAt;const started=performance.now();requestCount=0;published=false;operations=[];
  running=(async()=>{
   try{
    const initial=await api.storage.local.get('syncState');
    changeAttempt=!!(initial.syncState?.dirty||initial.syncState?.pendingChanges?.length);
    queuedAt=initial.syncState?.dirtySince;
    await execute(options);
   }catch(error){
    const saved=await api.storage.local.get(['syncState','settings']);
    if(!saved.settings?.cloud?.enabled){await status('disabled',{conflictCount:0});return;}
    const meta=saved.syncState||newMeta(configFrom(saved).url,'',await deviceId());
    meta.dirty=true;meta.failures=(meta.failures||0)+1;
    meta.lastError=error.message||'syncFailed';meta.lastErrorCode=error.code||null;
    await api.storage.local.set({syncState:meta});
    const known=['syncEmptyGuard','syncNoRecovery','syncLocalChanged','syncOffline','syncNetworkFailure','syncUnsupported','syncAuth','invalidCloudURL','syncRemember','syncInvalidData','syncFormat','syncFolder','syncTooLarge','syncAsset','syncBusy','syncRace','syncHTTP','syncRemoteMissing','syncIncompleteListing','syncRemoteReset'];
    const key=known.includes(error.message)?error.message:'syncFailed';
    const paused=['syncEmptyGuard','syncNoRecovery','syncUnsupported','syncAuth','invalidCloudURL','syncRemember','syncFormat','syncFolder','syncRemoteMissing','syncIncompleteListing','syncRemoteReset'].includes(key);
    await status(key==='syncLocalChanged'?'pending':key==='syncOffline'?'offline':'error',{
     errorKey:key,
     errorCode:error.code||null,
     noticeId:null,
     paused,
     retryAt:now()+(key==='syncLocalChanged'?1000:Math.min(30,2**Math.min(meta.failures-1,5))*60000)
    });
   }finally{
    if(requestCount){
     const saved=await api.storage.local.get(['syncMetrics','syncStatus']);
     const previous=saved.syncMetrics||{},metric={durationMs:Math.round(performance.now()-started),totalDurationMs:queuedAt?Math.max(0,now()-queuedAt):null,requests:requestCount,completedAt:now(),state:saved.syncStatus?.state,operations};
     await api.storage.local.set({syncMetrics:{lastCommit:published&&metric.state==='synced'?metric:previous.lastCommit||null,lastChangeAttempt:changeAttempt||published?metric:previous.lastChangeAttempt||null,lastCheck:!published?metric:previous.lastCheck||null}});
    }
    running=null;blobs.clear();
   }
  })();
  const work=running;await work;
  if(rerun){rerun=false;const saved=await api.storage.local.get('syncState');await api.storage.local.set({syncState:{...saved.syncState,dirty:true}});}
  return work;
 }

 async function connectionTest(){
  const saved=await api.storage.local.get('settings'),config=configFrom(saved);
  checkConfig(config);
  const result=await testConnection(config);
  const current=await api.storage.local.get('syncStatus');
  await status(current.syncStatus?.state||'disabled',{lastChecked:now(),connectionTest:result});
  return result;
 }
 return {run,dirty,isApplying:()=>applying,connectionTest};
}
