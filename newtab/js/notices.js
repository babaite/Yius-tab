import {t} from './i18n.js';
import '../vendor/simple-liquid-glass.js';

export function createSyncNotices({api=globalThis.chrome,clock=()=>Date.now(),duration=4600}={}){
 const card=document.createElement('aside');card.className='sync-notice';card.setAttribute('popover','manual');card.setAttribute('role','status');card.setAttribute('aria-live','polite');card.setAttribute('aria-atomic','true');
 const glass=document.createElement('liquid-glass');glass.className='sync-notice-glass';glass.setAttribute('aria-hidden','true');
 for(const [key,value]of Object.entries({renderer:'svg','effect-mode':'svg',reveal:'immediate',radius:String(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--radius-notification'))||23),frost:'.12',blur:'12',saturation:'125',strength:'.08',dispersion:'8','lens-profile':'material','border-color':'rgba(180,180,180,.35)'}))glass.setAttribute(key,value);
 const icon=document.createElement('span');icon.className='sync-notice-icon';icon.setAttribute('aria-hidden','true');
 icon.innerHTML='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 24h14a6 6 0 0 0 1-11.9A8.5 8.5 0 0 0 7.5 11 6.5 6.5 0 0 0 9 24Z"/><path d="m12 18 4-4 4 4m-4-4v9"/></svg>';
 const content=document.createElement('div'),title=document.createElement('p'),detail=document.createElement('p');content.className='sync-notice-content';title.className='sync-notice-title';detail.className='sync-notice-detail';content.append(title,detail);
 const indicator=document.createElement('span');indicator.className='sync-notice-indicator';indicator.setAttribute('aria-hidden','true');
 indicator.innerHTML='<svg class="sync-notice-spinner" viewBox="0 0 36 36"><circle class="spinner-track" cx="18" cy="18" r="14"/><circle class="spinner-arc" cx="18" cy="18" r="14"/></svg><svg class="sync-notice-check" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" pathLength="1"/><path d="m11.5 18 4.5 4.5 8.5-9" pathLength="1"/></svg>';
 card.append(glass,icon,content,indicator);document.body.append(card);

 if(glass.shadowRoot){const geometry=document.createElement('style');geometry.textContent='.lg-holder,.lg-glass,.lg-border,.lg-content{border-radius:var(--radius-notification)!important;corner-shape:var(--corner-g2)}';glass.shadowRoot.append(geometry);}

 let hideTimer,exitTimer,enterFrame,enterFrame2,visible=false,kind=null,active=false,lastNoticeId=null,settings={},lastOutcome=null;
 const seen=new Map();
 function dismiss(){clearTimeout(hideTimer);cancelAnimationFrame(enterFrame);cancelAnimationFrame(enterFrame2);if(!visible)return;card.classList.remove('is-visible');visible=false;clearTimeout(exitTimer);exitTimer=setTimeout(()=>{if(!visible){if(card.matches(':popover-open'))card.hidePopover();card.hidden=true;kind=null;}},230);}
 function complete(){if(!visible||kind!=='syncing')return;kind='success';card.dataset.kind='success';clearTimeout(hideTimer);hideTimer=setTimeout(dismiss,1050);}
 function show(next,{persistent=next==='syncing',dedupe=false}={}){
  if(next==='success'){if(!visible||kind!=='syncing')show('syncing');complete();return;}
  if(dedupe){const previous=seen.get(next)||0;if(clock()-previous<10*60000){if(kind==='syncing')dismiss();return;}seen.set(next,clock());}
  clearTimeout(hideTimer);clearTimeout(exitTimer);kind=next;
  const keys={syncing:['noticeSyncing',null],offline:['noticeOffline','noticeLocalRetry'],failed:['noticeFailed','noticeLocalRetry'],error:['noticeError','noticeUsingLocal']};const [headline,description]=keys[next]||keys.error;
  if(title.textContent!==t(headline))title.textContent=t(headline);const descriptionText=description?t(description):'';if(detail.textContent!==descriptionText)detail.textContent=descriptionText;detail.hidden=!description;card.dataset.kind=next;card.hidden=false;
  if(!card.matches(':popover-open'))card.showPopover();
  if(!visible){visible=true;cancelAnimationFrame(enterFrame);cancelAnimationFrame(enterFrame2);enterFrame=requestAnimationFrame(()=>{enterFrame2=requestAnimationFrame(()=>{if(visible)card.classList.add('is-visible');});});}
  if(!persistent)hideTimer=setTimeout(dismiss,duration);
 }
 function enabled(){return !!settings.cloud?.enabled;}
 function present(){return document.visibilityState!=='hidden';}
 function arm(){if(!enabled()||!present())return;active=true;lastOutcome=null;show('syncing');}
 function receive(value={},initial=false){
  if(initial){lastNoticeId=value.noticeId||null;if(enabled()&&value.noticeId&&['checking','syncing','pending'].includes(value.state)){active=true;if(present())show('syncing');}return;}
  const newNotice=value.noticeId&&value.noticeId!==lastNoticeId;lastNoticeId=value.noticeId||lastNoticeId;
  if(!enabled()||value.state==='disabled'){active=false;dismiss();return;}
  if(newNotice&&present()){active=true;lastOutcome=null;}
  if(value.state==='synced'){active=false;lastOutcome=null;complete();return;}
  if(['checking','syncing','pending'].includes(value.state)||['syncBusy','syncRace','syncLocalChanged'].includes(value.errorKey)){
   if(active&&present())show('syncing');return;
  }
  let outcome;
  if(value.state==='offline'||value.errorKey==='syncOffline')outcome='offline';
  else if(['syncNetworkFailure','syncHTTP','syncAsset'].includes(value.errorKey))outcome='failed';
  else if(value.state==='error'||value.state==='conflict')outcome='error';
  if(outcome&&!present()){active=false;lastOutcome=outcome;dismiss();return;}
  if(outcome&&present()){

   if(active||outcome!==lastOutcome)show(outcome,{dedupe:true});lastOutcome=outcome;active=false;
  }
 }
 const ready=(async()=>{if(!api?.storage)return;const saved=await api.storage.local.get(['settings','syncStatus']);settings=saved.settings||{};receive(saved.syncStatus,true);
  api.storage.onChanged?.addListener((changes,area)=>{if(area!=='local')return;if(changes.settings)settings=changes.settings.newValue||{};
   const different=key=>changes[key]&&JSON.stringify(changes[key].oldValue)!==JSON.stringify(changes[key].newValue);
   if(!changes.syncRevision&&!changes.restoreRevision&&(different('prefs')||different('order')||different('settings')&&enabled()))arm();
   if(changes.syncStatus)receive(changes.syncStatus.newValue);if(changes.settings&&!enabled()){active=false;dismiss();}
  });
 })();
 const offline=()=>{if(enabled()&&active&&present()){lastOutcome='offline';active=false;show('offline',{dedupe:true});}};addEventListener('offline',offline);
 addEventListener('yiu-languagechange',()=>{if(visible&&kind==='success'){title.textContent=t('noticeSyncing');return;}if(visible&&kind)show(kind,{persistent:kind==='syncing'});});
 return {ready,show,dismiss,receive,arm,complete,element:card,destroy(){dismiss();removeEventListener('offline',offline);card.remove();}};
}
