import {setStatusText} from '../ui/components/status-feedback.js';
import {shakeField} from '../ui/components/field-feedback.js';
import {runAction} from '../ui/components/action-feedback.js';
import {sendRequest} from '../core/protocol.js';
import {installScrollbars} from '../newtab/js/scrollbars.js';
import {createSyncNotices} from '../newtab/js/notices.js';
import {t,applyTranslations,language} from '../newtab/js/i18n.js';
import {DEFAULT_ICON_TEMPLATE,iconURL} from '../newtab/js/settings.js';
import {makeBackup,prepareBackup,applyBackup,MAX_BACKUP} from './backup.js';
const $=id=>document.getElementById(id);let pending=null,settings={},savedJSON='',writeQueue=Promise.resolve();const timers={},errorTimers=new Map();
const syncNoticeUI=createSyncNotices({api:chrome});
applyTranslations();document.title='Yiu‘s tab · '+t('extensionSettings');
function status(key,error=false,params={}){$('status').textContent=t(key,params);$('status').dataset.error=String(error);}
function clearError(id){const input=$(id);input.removeAttribute('aria-invalid');const hint=$(id+'-error');if(hint){hint.classList.remove('is-visible');clearTimeout(errorTimers.get(id));errorTimers.set(id,setTimeout(()=>{if(!hint.classList.contains('is-visible'))hint.textContent='';},140));}}
function fieldError(id,key,force=false){const input=$(id),hint=$(id+'-error'),fresh=input.getAttribute('aria-invalid')!=='true'||hint.textContent!==t(key);input.setAttribute('aria-invalid','true');clearTimeout(errorTimers.get(id));hint.textContent=t(key);hint.classList.add('is-visible');status('fixFields',true);if(fresh||force)shakeField(input);return false;}
function report(error){const known=['invalidBackup','backupTooLarge','invalidTemplate','invalidCloudURL','bookmarksFailed'];status(known.includes(error.message)?error.message:'operationFailed',true,{detail:error.message||''});}
async function busy(button,task){status('working');return runAction(button,task,{onError:report}).finally(()=>{if(button.id==='sync-recover')button.disabled=!settings.cloud?.enabled;});}
function readGroup(group,force=false,required=false){
 if(group==='icon'){
  const iconTemplate=$('icon-template').value.trim();try{iconURL(iconTemplate,'https://example.com/');}catch{return fieldError('icon-template','invalidTemplate',force);}
  clearError('icon-template');return {iconTemplate};
 }
 let url=$('cloud-url').value.trim();
 if(url||required||$('sync-enabled').checked){try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hash)throw new Error();}catch{return fieldError('cloud-url','invalidCloudURL',force);}}
 clearError('cloud-url');return {cloud:{url,username:$('cloud-user').value.trim(),password:$('cloud-password').value,remember:$('remember-secret').checked,enabled:$('sync-enabled').checked}};
}
async function persist(group,force=false){
 const patch=readGroup(group,force);if(!patch)return false;
 if(patch.cloud)patch.cloud={...patch.cloud,username:patch.cloud.remember?patch.cloud.username:'',password:patch.cloud.remember?patch.cloud.password:''};
 const next={...settings,...patch};if(JSON.stringify(next)===savedJSON)return true;
 settings=next;const snapshot=structuredClone(next);
 const write=writeQueue.catch(()=>{}).then(()=>chrome.storage.local.set({settings:snapshot}));writeQueue=write;
 try{await write;savedJSON=JSON.stringify(snapshot);if(!$('icon-template').hasAttribute('aria-invalid')&&!$('cloud-url').hasAttribute('aria-invalid'))status('settingsSaved');return true;}catch(error){report(error);return false;}
}
function schedule(group){clearTimeout(timers[group]);timers[group]=setTimeout(()=>persist(group),500);}
function cancelScheduled(){for(const group of ['icon','cloud'])clearTimeout(timers[group]);}
async function flush(){cancelScheduled();const icon=await persist('icon',true),cloud=await persist('cloud',true);await writeQueue.catch(()=>{});return icon&&cloud;}
function fillSettings(){
 $('icon-template').value=settings.iconTemplate||DEFAULT_ICON_TEMPLATE;const cloud=settings.cloud||{};
 $('cloud-url').value=cloud.url==='https://dav.jianguoyun.com/dav/YiusTab/yius-tab.json'?'https://dav.jianguoyun.com/dav/':cloud.url||'';$('cloud-user').value=cloud.username||'';$('cloud-password').value=cloud.password||'';$('remember-secret').checked=!!cloud.remember;$('sync-enabled').checked=!!cloud.enabled;clearError('icon-template');clearError('cloud-url');
}
function review(b){pending=b;$('import-summary').textContent=t('importSummary',{count:b.sites.length,images:b.records.length});$('import-review').hidden=false;$('import-review').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'});status('readyToImport');}
$('export').onclick=()=>busy($('export'),async()=>{if(!await flush())return false;const {text}=await makeBackup(),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Yius-tab-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);status('exported');});
$('import').onclick=()=>$('backup-file').click();
$('backup-file').onchange=()=>busy($('import'),async()=>{const file=$('backup-file').files[0];if(!file)return;if(file.size>MAX_BACKUP)throw new Error('backupTooLarge');review(await prepareBackup(await file.text()));$('backup-file').value='';});
$('cancel-import').onclick=()=>{pending=null;$('import-review').hidden=true;status('importCancelled');};
$('apply-import').onclick=()=>busy($('apply-import'),async()=>{if(!pending)return;cancelScheduled();await writeQueue.catch(()=>{});await applyBackup(pending);pending=null;$('import-review').hidden=true;const saved=await chrome.storage.local.get('settings');settings=saved.settings||{};savedJSON=JSON.stringify(settings);fillSettings();status('imported');});
for(const button of document.querySelectorAll('[data-preset]'))button.onclick=()=>busy(button,async()=>{$('icon-template').value=button.dataset.preset==='favicon'?'https://a.favicon.im/{domain}?larger=true':DEFAULT_ICON_TEMPLATE;clearError('icon-template');clearTimeout(timers.icon);return persist('icon');});
async function requestSync(type,resolution){if(!await flush())return false;if(type==='yiu-sync-resolve')syncNoticeUI.arm();const result=await sendRequest(chrome,type,{resolution});if(result)renderSyncStatus(result);return result;}
$('sync-recover').onclick=()=>busy($('sync-recover'),()=>requestSync('yiu-sync-recover'));
$('sync-local').onclick=()=>busy($('sync-local'),()=>requestSync('yiu-sync-resolve','local'));
$('sync-remote').onclick=()=>busy($('sync-remote'),()=>requestSync('yiu-sync-resolve','remote'));
$('sync-enabled').onchange=async()=>{if($('sync-enabled').checked){if(!readGroup('cloud',true,true)){$('sync-enabled').checked=false;return;}$('remember-secret').checked=true;}if(await persist('cloud',true))await requestSync('yiu-sync-check');};
function renderSyncStatus(value={state:'disabled'}){$('sync-recover').disabled=!settings.cloud?.enabled;const state=value.state||'disabled';$('sync-feedback').dataset.state=state;let message=t(value.errorKey||({disabled:'syncDisabled',checking:'syncChecking',syncing:'syncWorking',synced:'syncComplete',pending:'syncPending',offline:'syncOffline',conflict:'syncConflict'}[state]||'syncFailed'));if(value.errorCode)message+=' ['+value.errorCode+']';setStatusText($('sync-status'),message);$('sync-time').textContent=value.lastSynced?t('syncLastTime',{time:new Date(value.lastSynced).toLocaleString(language())}):'';$('sync-conflicts').classList.toggle('is-visible',state==='conflict');}
try{const saved=await chrome.storage.local.get('settings');settings=saved.settings||{};savedJSON=JSON.stringify(settings);fillSettings();}catch(error){report(error);}
for(const [id,group]of [['icon-template','icon'],['cloud-url','cloud'],['cloud-user','cloud'],['cloud-password','cloud']]){
 $(id).addEventListener('input',()=>{if(id==='icon-template'||id==='cloud-url')clearError(id);schedule(group);});
 $(id).addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$(id).blur();}});
 $(id).addEventListener('blur',()=>{clearTimeout(timers[group]);persist(group);});
}
$('remember-secret').addEventListener('change',()=>{if(!$('remember-secret').checked)$('sync-enabled').checked=false;clearTimeout(timers.cloud);persist('cloud');});
addEventListener('pagehide',()=>{cancelScheduled();persist('icon');persist('cloud');});

document.addEventListener('pointerdown',event=>{if(!event.target.closest('input,button,label')){const focused=document.activeElement;if(focused?.matches('input'))focused.blur();}});

renderSyncStatus((await chrome.storage.local.get('syncStatus')).syncStatus);
chrome.storage.onChanged?.addListener((changes,area)=>{if(area!=='local')return;if(changes.syncStatus)renderSyncStatus(changes.syncStatus.newValue);if(changes.settings){settings=changes.settings.newValue||{};savedJSON=JSON.stringify(settings);if(!document.activeElement?.matches('input'))fillSettings();}});

setInterval(()=>{if(document.visibilityState==='visible'&&globalThis.chrome?.runtime?.id)sendRequest(chrome,'yiu-sync-check',{foreground:true}).catch(()=>{});},10000);

$('sync-diagnostics').onclick=()=>busy($('sync-diagnostics'),async()=>{
 const saved=await chrome.storage.local.get(['syncState','syncStatus','syncMetrics','settings']);
 const state=saved.syncState||{},cloud=saved.settings?.cloud||{};
 const report={version:chrome.runtime.getManifest().version,time:new Date().toISOString(),enabled:!!cloud.enabled,status:saved.syncStatus||null,metrics:saved.syncMetrics||null,queue:{dirty:!!state.dirty,failures:state.failures||0,hasBase:!!state.base,hasRemote:!!state.remote,remoteImages:state.assets?.length||0}};
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='Yius-tab-sync-diagnostics.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
});

installScrollbars();
