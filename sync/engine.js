import {dbReadRecords,dbWriteRecords} from '../newtab/js/icon-db.js';
import {cloudFileURL} from '../core/config/settings.js';
import {equal,hashBlob,references,validateData} from './model.js';
import {failure,clone} from '../core/errors.js';
import {diskCache} from '../core/storage/asset-cache.js';
import {configKey,checkConfig} from '../core/net/cloud-config.js';
import {createWebDAV} from '../core/net/webdav.js';
import {createAssetService} from '../core/sync/assets.js';
import {createRemoteStore} from '../core/sync/remote.js';
import {createMaintenance} from '../core/sync/maintenance.js';
import {planSync} from '../core/sync/plan.js';
import {createBookmarkSnapshot} from '../core/bookmarks/snapshot.js';
import {createSnapshotApplier} from '../core/bookmarks/apply.js';
export function createSyncEngine({api=chrome,fetcher=(...args)=>fetch(...args),readRecords=dbReadRecords,writeRecords=entries=>dbWriteRecords(entries,false),cache=diskCache,now=()=>Date.now(),isOnline=()=>globalThis.navigator?.onLine!==false}={}){
 let running=null,applying=false,generation=0,rerun=false;
 const blobs=new Map(),recentUploads=new Map();let recentEndpoint,requestCount=0,published=false,operations=[];
 async function status(state,extra={}){const saved=await api.storage.local.get('syncStatus');await api.storage.local.set({syncStatus:{...saved.syncStatus,state,...extra}});}
 function dirty(){if(!applying){generation++;if(running)rerun=true;}return !applying;}
 const transport=createWebDAV({api,fetcher,isOnline,onRequest:()=>requestCount++,onResponse:operation=>operations.push(operation)});
 const {request,bytes,versionTag,probe}=transport;
 const {itemRef,acquireAssets}=createAssetService({api,request,bytes,cache,now,blobs,recentUploads});
 const {capture}=createBookmarkSnapshot({api,readRecords,itemRef});
 const {envelope,readRemote,writeState}=createRemoteStore({request,bytes,versionTag,now});
 const {apply}=createSnapshotApplier({api,writeRecords,now,blobs,getGeneration:()=>generation,setApplying:value=>{applying=value;}});
 const {collect}=createMaintenance({request,bytes,writeState,now});
 async function execute({force=false,resolution,foreground=false,recovery=false}={}){
  const saved=await api.storage.local.get(['settings','syncState','syncStatus']);const config={...saved.settings?.cloud};if(config.url)config.url=cloudFileURL(config.url);
  if(!config.enabled){await status('disabled');return;}
  const key=await hashBlob(new Blob([configKey(config)]));let meta=saved.syncState?.endpoint===config.url?clone(saved.syncState):{endpoint:config.url,idMap:{}};
  if(!force&&meta.configKey===key){if(saved.syncStatus?.paused||saved.syncStatus?.retryAt>now())return;if(!meta.dirty&&now()-(saved.syncStatus?.lastChecked||0)<(foreground?10000:60000))return;}
  if(meta.configKey!==key){meta.probed=null;meta.configKey=key;}
  const interactive=!!meta.dirty;checkConfig(config);if(recentEndpoint!==configKey(config)){recentUploads.clear();recentEndpoint=configKey(config);}await api.storage.local.set({syncState:meta});await status('checking',{paused:false,errorKey:null,lastChecked:now()});await probe(config,meta,configKey(config));

  let optimistic=null;const optimisticGeneration=generation;
  if(!recovery&&!resolution&&(meta.dirty||force)&&meta.remote&&meta.etag&&meta.base&&!meta.remote.maintenance){
   const local=await capture(meta,meta.remote.data);if(generation!==optimisticGeneration)throw failure('syncLocalChanged');
   if(!local.folderLost&&!equal(local.data,meta.base))optimistic=local;
  }
  for(let attempt=0;attempt<4;attempt++){
   const fast=attempt===0&&optimistic,runGeneration=fast?optimisticGeneration:generation,remote=fast?{state:meta.remote,etag:meta.etag}:await readRemote(config,meta);
   if(remote.state?.maintenance?.until>now())throw failure('syncBusy');
   const local=fast||await capture(meta,remote.state?.data);const result=planSync({local,remote,meta,recovery,resolution,saved});
   if(result.conflicts.length){await api.storage.local.set({syncState:meta,syncConflicts:result.conflicts});await status('conflict',{conflictCount:result.conflicts.length,conflictRevision:remote.state.revision,paused:true,noticeId:null});return;}
   validateData(result.data);await status('syncing');
   const state=remote.state&&equal(result.data,remote.state.data)&&!remote.state.maintenance?remote.state:envelope(result.data,remote.state?{revision:remote.state.revision,data:remote.state.data}:null);
   try{
    const known=remote.state?.maintenance?new Set():new Set([...references(remote.state?.data),...references(remote.state?.previous?.data)]);await acquireAssets(config,result.data,known,meta);
    if(generation!==runGeneration)throw failure('syncLocalChanged');
    let etag=remote.etag;if(state!==remote.state){
     etag=await writeState(config,state,remote.etag);published=true;

     meta={...meta,base:clone(local.data),idMap:local.mapping,etag,remote:state,dirty:true};await api.storage.local.set({syncState:meta});
    }
    const idMap=await apply(result.data,local,meta,runGeneration);meta={...meta,base:clone(result.data),idMap,etag,remote:state,dirty:false,failures:0};delete meta.dirtySince;
    await api.storage.local.set({syncState:meta,syncConflicts:[]});
    try{if(!interactive){const collected=await collect(config,meta,state,etag);meta.remote=collected.state;meta.etag=collected.etag;}}catch{                                                                            }
    await api.storage.local.set({syncState:meta,syncConflicts:[]});await status('synced',{lastSynced:now(),lastChecked:now(),retryAt:null,paused:false,conflictCount:0,errorKey:null,noticeId:null});return;
   }catch(error){if(error.message==='syncRace'&&attempt<3){recentUploads.clear();meta.etag=null;meta.remote=null;continue;}throw error;}
  }
 }
 async function run(options={}){
  if(running){await running;return options.force||options.resolution||options.recovery?run(options):undefined;}
  let changeAttempt=false,queuedAt;const started=performance.now();requestCount=0;published=false;operations=[];running=(async()=>{try{const initial=await api.storage.local.get('syncState');changeAttempt=!!initial.syncState?.dirty;queuedAt=initial.syncState?.dirtySince;await execute(options);}catch(error){const saved=await api.storage.local.get(['syncState','settings']);if(!saved.settings?.cloud?.enabled){await status('disabled');return;}const meta=saved.syncState||{endpoint:saved.settings?.cloud?.url,idMap:{}};meta.configKey=await hashBlob(new Blob([configKey(saved.settings?.cloud||{})]));meta.dirty=true;meta.failures=(meta.failures||0)+1;await api.storage.local.set({syncState:meta});const key=['syncEmptyGuard','syncNoRecovery','syncLocalChanged','syncOffline','syncNetworkFailure','syncUnsupported','syncAuth','invalidCloudURL','syncRemember','syncInvalidData','syncFormat','syncFolder','syncTooLarge','syncAsset','syncBusy','syncRace','syncHTTP'].includes(error.message)?error.message:'syncFailed',paused=['syncEmptyGuard','syncNoRecovery','syncUnsupported','syncAuth','invalidCloudURL','syncRemember','syncFormat','syncFolder'].includes(key);await status(key==='syncLocalChanged'?'pending':key==='syncOffline'?'offline':'error',{errorKey:key,errorCode:error.code||null,noticeId:null,paused,retryAt:now()+(key==='syncLocalChanged'?1000:Math.min(30,2**Math.min(meta.failures-1,5))*60000)});}finally{if(requestCount){const saved=await api.storage.local.get(['syncMetrics','syncStatus']);const previous=saved.syncMetrics||{},metric={durationMs:Math.round(performance.now()-started),totalDurationMs:queuedAt?Math.max(0,now()-queuedAt):null,requests:requestCount,completedAt:now(),state:saved.syncStatus?.state,operations};await api.storage.local.set({syncMetrics:{lastCommit:published&&metric.state==='synced'?metric:previous.lastCommit||null,lastChangeAttempt:changeAttempt||published?metric:previous.lastChangeAttempt||null,lastCheck:!published?metric:previous.lastCheck||null}});} running=null;blobs.clear();}})();
  const work=running;await work;if(rerun){rerun=false;const saved=await api.storage.local.get('syncState');await api.storage.local.set({syncState:{...saved.syncState,dirty:true}});}return work;
 }
 return {run,dirty,isApplying:()=>applying};
}
