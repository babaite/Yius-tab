import {ensureManagedFolder} from '../../sync/folder.js';
export function createSyncScheduler({engine,api}){
let timer;
async function execute(options){clearTimeout(timer);timer=null;await api.alarms.clear('yiu-sync-work');await engine.run(options);const saved=await api.storage.local.get(['syncState','syncStatus','settings']);if(saved.settings?.cloud?.enabled&&saved.syncState?.dirty&&!saved.syncStatus?.paused){const retry=saved.syncStatus?.retryAt||0;if(saved.syncStatus?.errorKey==='syncLocalChanged'){timer=setTimeout(()=>execute(),Math.max(100,retry-Date.now()));}await api.alarms.create('yiu-sync-work',{when:Math.max(Date.now()+30000,retry)});}}
async function queue(notify=false){if(!engine.dirty())return;const saved=await api.storage.local.get(['settings','syncState']);if(!saved.settings?.cloud?.enabled)return;await api.storage.local.set({syncState:{...saved.syncState,dirty:true,dirtySince:saved.syncState?.dirtySince||Date.now()},...(notify?{syncStatus:await pendingNotice()}:{})});if(!timer)timer=setTimeout(()=>execute(),150);await api.alarms.create('yiu-sync-work',{when:Date.now()+30000});}
async function pendingNotice(){const old=(await api.storage.local.get('syncStatus')).syncStatus||{};return {...old,state:old.paused||old.retryAt>Date.now()?old.state:'pending',noticeId:crypto.randomUUID()};}
async function setup(){await ensureManagedFolder(api);const {settings}=await api.storage.local.get('settings');if(settings?.cloud?.enabled){if(!await api.alarms.get('yiu-sync-poll'))await api.alarms.create('yiu-sync-poll',{periodInMinutes:5});await execute();}else{clearTimeout(timer);await api.alarms.clear('yiu-sync-poll');await api.alarms.clear('yiu-sync-work');await api.storage.local.set({syncStatus:{state:'disabled'}});}}
 return {execute,queue,setup};
}
