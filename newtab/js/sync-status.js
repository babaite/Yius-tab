import {sendRequest} from '../../core/protocol.js';
import {t,language} from './i18n.js';

export function installSyncStatus({api=globalThis.chrome}={}){
 if(!api?.storage)return null;
 const root=document.createElement('aside');
 root.id='sync-dock';
 root.hidden=true;
 root.setAttribute('aria-live','polite');
 const text=document.createElement('span'),conflicts=document.createElement('span');
 text.id='sync-dock-state';conflicts.id='sync-dock-conflicts';
 const syncButton=document.createElement('button'),deleteButton=document.createElement('button');
 syncButton.type=deleteButton.type='button';
 syncButton.dataset.action='sync-now';deleteButton.dataset.action='sync-delete';
 syncButton.textContent=t('syncNowAction');deleteButton.textContent=t('syncConfirmDelete');
 const actions=document.createElement('span');actions.className='sync-dock-actions';actions.append(syncButton,deleteButton);
 root.append(text,conflicts,actions);document.body.append(root);

 let settings={},status={state:'disabled'},busy=false,deleteApproval=null;
 const stateKey=state=>({disabled:'syncDisabled',checking:'syncChecking',syncing:'syncWorking',synced:'syncComplete',pending:'syncPending',offline:'syncOffline',conflict:'syncConflict',deleteGuard:'syncDeleteGuard'}[state]||status.errorKey||'syncFailed');
 function render(){
  const enabled=!!settings.cloud?.enabled;root.hidden=!enabled;if(!enabled)return;
  const state=status.state||'disabled',count=Number(status.conflictCount||status.conflicts?.length||0);
  root.dataset.state=state;
  text.textContent=t(status.errorKey||stateKey(state),state==='deleteGuard'?{count:status.pendingDeletes||0,limit:status.deleteLimit||0}:{});
  const last=status.lastSynced?t('syncLastTime',{time:new Date(status.lastSynced).toLocaleString(language())}):'';
  conflicts.textContent=[count?t('syncConflictCount',{count}):'',last].filter(Boolean).join(' · ');
  syncButton.disabled=busy||['checking','syncing'].includes(state);
  deleteButton.hidden=state!=='deleteGuard'||!deleteApproval;
 }
 async function syncNow(){if(busy)return;busy=true;render();try{await sendRequest(api,'yiu-sync-now');}catch{}finally{busy=false;render();}}
 async function confirmDelete(){if(!deleteApproval||busy)return;busy=true;render();try{await sendRequest(api,'yiu-sync-confirm-delete',{approvalId:deleteApproval});}catch{}finally{busy=false;render();}}
 syncButton.addEventListener('click',syncNow);deleteButton.addEventListener('click',confirmDelete);
 addEventListener('yiu-languagechange',()=>{syncButton.textContent=t('syncNowAction');deleteButton.textContent=t('syncConfirmDelete');render();});
 (async()=>{const saved=await api.storage.local.get(['settings','syncStatus','syncState']);settings=saved.settings||{};status=saved.syncStatus||{state:'disabled'};deleteApproval=saved.syncState?.deleteGuard?.id||null;render();api.storage.onChanged?.addListener((changes,area)=>{if(area!=='local')return;if(changes.settings)settings=changes.settings.newValue||{};if(changes.syncStatus)status=changes.syncStatus.newValue||{state:'disabled'};if(changes.syncState)deleteApproval=changes.syncState.newValue?.deleteGuard?.id||null;render();});})();
 return {element:root,render};
}
