import {createMessageRouter} from '../core/protocol.js';
import {createSyncScheduler} from '../core/tasks/sync-scheduler.js';
import {findFolder,ensureManagedFolder,isFolderMarker} from './folder.js';
import {createSyncEngine} from './engine.js';
const engine=createSyncEngine();
const {execute,queue,setup}=createSyncScheduler({engine,api:chrome});
chrome.alarms.onAlarm.addListener(alarm=>{if(['yiu-sync-poll','yiu-sync-work'].includes(alarm.name))execute().catch(()=>{});});
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local'||engine.isApplying()||changes.syncRevision)return;if(changes.settings){const before=changes.settings.oldValue||{},after=changes.settings.newValue||{};if(JSON.stringify(before.cloud)!==JSON.stringify(after.cloud)){engine.dirty();if(!after.cloud?.enabled)setup().catch(()=>{});else{chrome.alarms.get('yiu-sync-poll').then(alarm=>{if(!alarm)return chrome.alarms.create('yiu-sync-poll',{periodInMinutes:5});}).catch(()=>{});queue(true).catch(()=>{});}return;}if(before.iconTemplate!==after.iconTemplate)queue(true).catch(()=>{});}if(['prefs','order'].some(key=>changes[key]&&JSON.stringify(changes[key].oldValue)!==JSON.stringify(changes[key].newValue)))queue(true).catch(()=>{});});
async function bookmarkChanged(id,info={}){
 if(engine.isApplying()||isFolderMarker(info))return;const saved=await chrome.storage.local.get(['syncState','managedFolderId','managedFolderIdentity']),folder=findFolder(await chrome.bookmarks.getTree(),saved.managedFolderId,saved.managedFolderIdentity);
 if(saved.syncState?.idMap?.[id]||folder?.id===id||folder?.children?.some(site=>site.id===id)||folder&&[info.parentId,info.oldParentId].includes(folder.id))await queue(true);
}
for(const event of ['onCreated','onRemoved','onChanged','onMoved','onChildrenReordered'])chrome.bookmarks[event].addListener((id,info)=>bookmarkChanged(id,info).catch(()=>{}));
chrome.runtime.onStartup.addListener(()=>setup().catch(()=>{}));chrome.runtime.onInstalled.addListener(()=>setup().catch(()=>{}));
const handlers={'yiu-icons-changed':async()=>{await queue();return {ok:true};}};
for(const type of ['yiu-sync-check','yiu-sync-now','yiu-sync-resolve','yiu-sync-recover'])handlers[type]=async payload=>{
 await execute({force:type!=='yiu-sync-check',recovery:type==='yiu-sync-recover',resolution:type==='yiu-sync-resolve'?payload.resolution:undefined,foreground:payload.foreground===true});
 return (await chrome.storage.local.get('syncStatus')).syncStatus;
};
chrome.runtime.onMessage.addListener(createMessageRouter({api:chrome,handlers}));

addEventListener('online',()=>execute().catch(()=>{}));
setup().catch(()=>{});
