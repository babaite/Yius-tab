import {installEmptyStateHint} from '../../ui/components/empty-state-hint.js';
import {installScrollEffects} from '../../ui/scroll-effects.js';
import {createDropdown} from '../../ui/components/dropdown.js';
import {createIconEditor} from '../../core/icons/editor.js';
import {motionMs} from '../../ui/motion.js';
import {sendRequest} from '../../core/protocol.js';
import {installScrollbars} from './scrollbars.js';
import {ensureManagedFolder,isFolderMarker} from '../../sync/folder.js';
import {createSourceMenu} from './source-menu.js';
import {presentIcon,artworkFingerprint} from './icon-motion.js';
import {createIconAcquisition} from '../../core/icons/acquisition.js';
import {createSyncNotices} from './notices.js';
import {thirdPartyURL} from './settings.js';
import {t,uiError,setText,applyTranslations} from './i18n.js';
import {updateThemeIcons} from './theme.js';
import {cached,store,readRecords,discover,download,localIcon,appStoreMatches,fallbackColor} from './icons.js';
import {createColorPicker} from './color-picker.js';
import {observeGridReflow,observeGridScroll} from './layout.js';
const $=id=>document.getElementById(id);
const grid=$('grid'),dialog=$('settings');
installEmptyStateHint($('status'),{translate:t});

document.addEventListener('click',e=>{
 if(!e.altKey||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||dialog.open)return;
 if(e.target.closest?.('.tile,dialog,button,input,select,textarea,a,[contenteditable="true"],#demo-controls,#demo-show'))return;
 e.preventDefault();chrome.runtime?.openOptionsPage?.().catch(()=>{});
});

let managedFolderId;
let bookmarks=[],prefs={},order=[],active=null,draft=null,choices=[],loadVersion=0,session=0;
let dialogMessageTimer,cacheHydrated=false,cloudBusy=false,bookmarkTimer,renderVersion=0;
const records=new Map(),artworkVersions=new WeakMap(),objectURLs=new WeakMap();
function blobURL(blob){if(!objectURLs.has(blob))objectURLs.set(blob,URL.createObjectURL(blob));return objectURLs.get(blob);}

function sorted(items){const ranks=new Map(order.map((id,i)=>[id,i]));return [...items].sort((a,b)=>(ranks.get(a.id)??Infinity)-(ranks.get(b.id)??Infinity));}
function defaults(b){return {appearance:'image',color:null,scale:100,source:'auto',offsetX:0,offsetY:0};}
function selectedItem(p,record){return p.source==='upload'?record?.upload:p.source==='app-store'?record?.appStore:p.source==='third-party'?(record?.thirdParty||record?.items?.[0]):record?.items?.find(i=>i.url===p.source)||record?.items?.[0];}
function icon(b,p=prefs[b.id]||defaults(b),record=records.get(b.url)) {
  const el=document.createElement('span');el.className='icon';
  el.style.setProperty('--scale-factor',String((p.scale??100)/100));if(p.source==='upload'){el.style.setProperty('--offset-x',String(p.offsetX||0));el.style.setProperty('--offset-y',String(p.offsetY||0));}
  const selected=selectedItem(p,record);
  const letter=p.appearance==='letter'||!selected;
  el.style.setProperty('--tile-bg',p.color||(letter?fallbackColor(b.url):selected.background||'transparent'));
  if(letter||selected?.glyph){
    const text=document.createElement('span');text.className='letter';
    text.textContent=letter?([...b.title.trim()][0]?.toUpperCase()||'?'):selected.glyph;
    el.style.setProperty('--glyph-color',letter?'#ffffff':selected.foreground||'#ffffff');
    if(!letter&&selected.glyph.length>1)el.style.setProperty('--glyph-size','26px');
    el.append(text);
  }else{const img=new Image();img.alt='';img.draggable=false;img.src=blobURL(selected.blob);el.append(img);}
  return el;
}
function colorInputValue(b,p) {
  const record=records.get(b.url);
  const selected=selectedItem(p,record);
  const value=p.color||(p.appearance==='letter'||!selected?fallbackColor(b.url):selected.background||'#ffffff');

  if(/^#[\da-f]{6}([\da-f]{2})?$/i.test(value))return value;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const ctx=canvas.getContext('2d');ctx.fillStyle=value;ctx.fillRect(0,0,1,1);
  const channels=[...ctx.getImageData(0,0,1,1).data];return '#'+channels.slice(0,channels[3]<255?4:3).map(n=>n.toString(16).padStart(2,'0')).join('');
}
function syncControls() {
  $('appearance').value=draft.appearance;colorPicker.setValue(colorInputValue(active,draft));
  $('scale').value=draft.scale;$('scale').style.setProperty('--scale-progress',((draft.scale-45)/80*100)+'%');$('scale-value').textContent=draft.scale+'%';dropdowns.get('appearance')?.sync();syncUpload();
}
async function showArtwork(slot,b,p=prefs[b.id]||defaults(b),record=records.get(b.url),animate=true){
 const version=(artworkVersions.get(slot)||0)+1;artworkVersions.set(slot,version);
 const selected=selectedItem(p,record),content=p.appearance==='letter'||!selected?b.title[0]:selected.blob?await artworkFingerprint(selected.blob):JSON.stringify([selected.glyph,selected.background,selected.foreground]);
 if(artworkVersions.get(slot)!==version)return;
 const key=JSON.stringify([b.title,p,selected?.url,selected?.background,content]),changed=slot.dataset.artwork!==content;slot.dataset.artwork=content;
 return presentIcon(slot,icon(b,p,record),key,{animate:animate&&changed});
}
function redrawIcon(b){for(const other of bookmarks.filter(x=>x.url===b.url)){const tile=grid.querySelector(`[data-id="${CSS.escape(other.id)}"]`);if(tile)showArtwork(tile.querySelector('.icon-slot'),other);}}
async function render(){const version=++renderVersion;
 const old=new Map([...grid.children].map(el=>[el.dataset.id,el])),next=[],ready=[];
 for(const b of bookmarks){let a=old.get(b.id);old.delete(b.id);
  if(!a){a=document.createElement('button');a.type='button';a.className='tile';a.dataset.id=b.id;a.draggable=false;
   const slot=document.createElement('span');slot.className='icon-slot';const label=document.createElement('span');label.className='label';a.append(slot,label);
   a.addEventListener('click',e=>{const current=bookmarks.find(x=>x.id===a.dataset.id);if(!current)return;if(e.altKey){e.preventDefault();openSettings(current);return;}e.preventDefault();navigate(current.url,e.metaKey||e.ctrlKey||e.shiftKey,e.shiftKey);});
   a.addEventListener('auxclick',e=>{const current=bookmarks.find(x=>x.id===a.dataset.id);if(current&&e.button===1){e.preventDefault();navigate(current.url,true,false);}});
   a.addEventListener('keydown',e=>{const current=bookmarks.find(x=>x.id===a.dataset.id);if(!current)return;if(e.altKey&&e.key==='Enter'){e.preventDefault();openSettings(current);}if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(current.id,e.key==='ArrowLeft'?-1:1);}});
   a.addEventListener('dragstart',e=>e.preventDefault());
  }
  a.title=b.title;a.setAttribute('aria-label',b.title+t('iconActionHint'));a.querySelector('.label').textContent=b.title;
  ready.push(showArtwork(a.querySelector('.icon-slot'),b,undefined,undefined,a.isConnected));next.push(a);
 }
 await Promise.all(ready);if(version!==renderVersion)return;for(const el of old.values())el.remove();
 next.forEach((el,i)=>{if(grid.children[i]!==el)grid.insertBefore(el,grid.children[i]||null);});
}
async function navigate(url,newTab=false,active=false){try{if(newTab)await chrome.tabs.create({url,active});else await chrome.tabs.update({url});}catch{setText('status','openFailed');}}
function animateOrder(ids) {
  const tiles=[...grid.children],before=new Map(tiles.map(el=>[el,el.getBoundingClientRect()]));
  const nodes=new Map(tiles.map(el=>[el.dataset.id,el]));
  for(const el of tiles)for(const animation of el.getAnimations())animation.cancel();
  for(const id of ids){const node=nodes.get(id);if(node)grid.append(node);}
  const map=new Map(bookmarks.map(b=>[b.id,b]));bookmarks=ids.map(id=>map.get(id)).filter(Boolean);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  for(const el of tiles){if(el.classList.contains('drag-placeholder'))continue;const old=before.get(el),now=el.getBoundingClientRect(),dx=old.left-now.left,dy=old.top-now.top;
    if(Math.abs(dx)+Math.abs(dy)>.5)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
}
async function saveOrder(ids){order=[...ids];animateOrder(ids);try{await chrome.storage.local.set({order});}catch{setText('status','orderFailed');}}
let pointerDrag=null,suppressDragClick=false;
grid.addEventListener('click',e=>{if(suppressDragClick){e.preventDefault();e.stopImmediatePropagation();suppressDragClick=false;}},true);
grid.addEventListener('pointerdown',e=>{
  suppressDragClick=false;
  if(e.button!==0||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.pointerType==='touch')return;
  const tile=e.target.closest('.tile');if(!tile)return;suppressDragClick=false;
  const rect=tile.getBoundingClientRect();pointerDrag={tile,id:tile.dataset.id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,original:bookmarks.map(b=>b.id),active:false,frame:0};
});
function dragFrame() {
  const d=pointerDrag;if(!d?.active)return;
  const edge=64,viewport=innerHeight;
  const speed=d.y<edge?-Math.min(16,(edge-d.y)/4):d.y>viewport-edge?Math.min(16,(d.y-viewport+edge)/4):0;
  if(speed)scrollBy(0,speed);
  d.ghost.style.transform=`translate(${d.x-d.offsetX}px,${d.y-d.offsetY}px)`;
  const x=d.x-d.offsetX+72,y=d.y-d.offsetY+52,tiles=[...grid.children];
  let nearest=0,distance=Infinity;
  const gridBounds=grid.getBoundingClientRect();tiles.forEach((el,i)=>{const cx=gridBounds.left+el.offsetLeft+72,cy=gridBounds.top+el.offsetTop+52,dist=(cx-x)**2+(cy-y)**2;if(dist<distance){distance=dist;nearest=i;}});
  const ids=bookmarks.map(b=>b.id),from=ids.indexOf(d.id);
  if(nearest!==from){ids.splice(from,1);ids.splice(nearest,0,d.id);animateOrder(ids);}
  d.frame=requestAnimationFrame(dragFrame);
}
addEventListener('pointermove',e=>{
  const d=pointerDrag;if(!d||d.pointer!==e.pointerId)return;d.x=e.clientX;d.y=e.clientY;
  if(!d.active&&Math.hypot(d.x-d.startX,d.y-d.startY)>6){
    d.active=true;suppressDragClick=true;grid.setPointerCapture(e.pointerId);
    d.ghost=d.tile.cloneNode(true);d.ghost.removeAttribute('data-id');d.ghost.removeAttribute('href');d.ghost.setAttribute('aria-hidden','true');d.ghost.classList.add('drag-ghost');
    document.body.append(d.ghost);d.tile.classList.add('drag-placeholder');document.body.classList.add('drag-active');
    d.frame=requestAnimationFrame(dragFrame);
  }
  if(d.active)e.preventDefault();
},{passive:false});
function finishDrag(cancel=false) {
  const d=pointerDrag;if(!d)return;pointerDrag=null;
  if(d.active){cancelAnimationFrame(d.frame);document.body.classList.remove('drag-active');
    if(grid.hasPointerCapture(d.pointer))grid.releasePointerCapture(d.pointer);
    if(cancel)animateOrder(d.original);else saveOrder(bookmarks.map(b=>b.id));
    const reveal=()=>{d.ghost.remove();d.tile.classList.remove('drag-placeholder');};
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){reveal();return;}
    const target=d.tile.getBoundingClientRect();
    d.ghost.animate([{transform:d.ghost.style.transform},{transform:`translate(${target.left}px,${target.top}px)`}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'}).finished.catch(()=>{}).finally(reveal);
  }
}
addEventListener('pointerup',()=>finishDrag());addEventListener('pointercancel',()=>finishDrag(true));
addEventListener('keydown',e=>{if(e.key==='Escape'&&pointerDrag){e.preventDefault();finishDrag(true);}});
addEventListener('blur',()=>finishDrag(true));
function move(id,delta){const ids=bookmarks.map(b=>b.id),i=ids.indexOf(id),j=i+delta;if(j<0||j>=ids.length)return;[ids[i],ids[j]]=[ids[j],ids[i]];saveOrder(ids).then(()=>grid.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus());}
const acquisitionService=createIconAcquisition({records,cached,store,discover,download,appStoreMatches,thirdPartyURL,uiError,getSource:b=>prefs[b.id]?.source||'auto',getBookmarks:()=>bookmarks,onRecord:redrawIcon});
const {getRecord}=acquisitionService;
const iconEditor=createIconEditor({records,store,localIcon});

async function load({refreshRecords=false}={}){const v=++loadVersion;try{
 const folder=await ensureManagedFolder();if(v!==loadVersion)return;bookmarks=sorted((folder?.children||[]).filter(n=>n.url&&!isFolderMarker(n)));
 if(!cacheHydrated||refreshRecords){const all=await readRecords().catch(()=>[]);if(v!==loadVersion)return;for(const {key,value}of all)records.set(key,value);cacheHydrated=true;}
 setText('status',!folder?'missingFolder':!bookmarks.length?'emptyFolder':null);await render();if(v!==loadVersion)return;
 const pending=[...new Map(bookmarks.map(b=>[b.url,b])).values()];let i=0;
 await Promise.all(Array.from({length:6},async()=>{while(i<pending.length&&v===loadVersion){try{await getRecord(pending[i++]);}catch{}}}));
 }catch{setText('status','bookmarksFailed');}}
async function refreshFromSync(){pendingSyncRefresh=false;const saved=await chrome.storage.local.get(['prefs','order','managedFolderId']);managedFolderId=saved.managedFolderId;prefs=saved.prefs||{};order=saved.order||[];await load({refreshRecords:true});}
function bookmarkReload(){clearTimeout(bookmarkTimer);if(cloudBusy){pendingSyncRefresh=true;return;}bookmarkTimer=setTimeout(()=>load(),80);}

const dropdowns=new Map();

createDropdown('appearance',{dialog,dropdowns});dropdowns.set('source',createSourceMenu({select:$('source'),dialog,current:()=>draft?.source||'auto',loadCandidates:loadSourceCandidates,onSelect:chooseSource,beforeOpen:()=>dropdowns.get('appearance')?.close()}));
const colorPicker=createColorPicker({input:$('color'),trigger:$('color-swatch'),panel:$('color-panel'),onChange:()=>{$('color').dispatchEvent(new Event('input',{bubbles:true}));}});
function syncUpload(){const enabled=draft?.source==='upload';$('upload').disabled=!enabled;$('upload-button').disabled=!enabled;$('upload-row').classList.toggle('is-disabled',!enabled);}
const previewAlpha=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
function updatePreview(animate=true){if(!active)return;const tile=icon(active,draft,{...records.get(active.url),items:choices});$('preview-art').classList.add('icon-slot');showArtwork($('preview-art'),active,draft,{...records.get(active.url),items:choices},animate);previewAlpha.clearRect(0,0,1,1);previewAlpha.fillStyle=tile.style.getPropertyValue('--tile-bg');previewAlpha.fillRect(0,0,1,1);$('preview').classList.toggle('is-transparent',previewAlpha.getImageData(0,0,1,1).data[3]===0);const movable=draft.source==='upload'&&Boolean(records.get(active.url)?.upload);$('preview').classList.toggle('can-position',movable);}
let imageDrag=null;
$('preview').addEventListener('pointerdown',e=>{
  if(e.button!==0||draft?.source!=='upload'||!records.get(active?.url)?.upload||$('preview').classList.contains('is-loading'))return;
  e.preventDefault();const rect=$('preview').getBoundingClientRect();imageDrag={id:e.pointerId,x:e.clientX,y:e.clientY,offsetX:draft.offsetX||0,offsetY:draft.offsetY||0,width:rect.width,height:rect.height};$('preview').setPointerCapture(e.pointerId);$('preview').classList.add('positioning');
});
$('preview').addEventListener('pointermove',e=>{if(!imageDrag||imageDrag.id!==e.pointerId||!draft)return;draft.offsetX=Math.max(-100,Math.min(100,imageDrag.offsetX+(e.clientX-imageDrag.x)/imageDrag.width*100));draft.offsetY=Math.max(-100,Math.min(100,imageDrag.offsetY+(e.clientY-imageDrag.y)/imageDrag.height*100));const tile=$('preview-art').firstElementChild;if(tile){tile.style.setProperty('--offset-x',String(draft.offsetX));tile.style.setProperty('--offset-y',String(draft.offsetY));}});
function finishImageDrag(){imageDrag=null;$('preview').classList.remove('positioning');}
$('preview').addEventListener('pointerup',finishImageDrag);$('preview').addEventListener('pointercancel',finishImageDrag);
function fillSources(){
 const select=$('source');select.replaceChildren(...[['bestQuality','auto'],['candidateIcon','website'],['thirdParty','third-party'],['appStore','app-store'],['localImage','upload']].map(([key,value])=>new Option(t(key),value)));
 dropdowns.get('source').sync();syncUpload();
}
async function loadSourceCandidates(kind){
 const site=active,token=session;if(!site)return [];
 const record=await getRecord(site,false,kind==='website'?'auto':kind);if(token!==session||active!==site)return [];
 if(kind==='website'){choices=record.items||[];return choices;}
 if(kind==='third-party')return record.thirdParty?[{...record.thirdParty,selected:draft.source==='third-party'}]:[];
 const matches=record.appStoreMatches?.length?record.appStoreMatches:[{url:record.appStore?.url,name:record.appStore?.appName}];const items=new Array(matches.length);let index=0;
 await Promise.all(Array.from({length:Math.min(3,matches.length)},async()=>{while(index<matches.length){const at=index++,match=matches[at];try{const item=match.url===record.appStore?.url?record.appStore:await download(match.url);items[at]={...item,appName:match.name||record.appStore?.appName,region:match.region,regions:match.regions,selected:match.url===record.appStore?.url&&draft?.source==='app-store',type:'App Store'};}catch{}}}));
 return items.filter(Boolean);
}
async function chooseSource(kind,item){
 if(!active||!draft)return;const token=session;
 if(kind==='app-store'&&item)await iconEditor.selectAppStore(active,item);
 if(token!==session||!draft)return;
 draft.source=kind==='website'?item.url:kind;draft.appearance='image';setDialogStatus(null);fillSources();syncControls();updatePreview();
 if(kind==='auto')acquire(()=>getRecord(active,false,'auto'),record=>{choices=record.items||[];});
}
let acquisition=0,loadingTimer=0,loadingStarted=0;
function setLoading(loading){
  clearTimeout(loadingTimer);
  if(loading){dialog.querySelector('.save-button').disabled=true;loadingStarted=performance.now();$('preview').classList.add('is-loading');$('preview').setAttribute('aria-busy','true');setText('icon-loading-status','loadingIcon');}
  else {const finish=()=>{dialog.querySelector('.save-button').disabled=false;$('preview').classList.remove('is-loading');$('preview').setAttribute('aria-busy','false');setText('icon-loading-status',null);};loadingTimer=setTimeout(finish,Math.max(0,280-(performance.now()-loadingStarted)));}
}
async function acquire(task,apply){
  const request=++acquisition,token=session;setLoading(true);setDialogStatus(null);
  try{const result=await task();if(request!==acquisition||token!==session||!dialog.open)return;apply(result);fillSources();syncControls();updatePreview();}
  catch(error){if(request===acquisition&&token===session)setDialogStatus(error.uiKey||'fetchFailed',error.uiParams||{});}
  finally{if(request===acquisition&&token===session)setLoading(false);}
}
let settingsClosing=false,pendingSyncRefresh=false;
function closeSettings(){
  if(!dialog.open||settingsClosing)return;settingsClosing=true;session++;acquisition++;dialog.classList.add('is-closing');
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:motionMs('time-160',160);
  const fade=dialog.animate([{opacity:getComputedStyle(dialog).opacity},{opacity:0}],{duration,easing:'ease-out',fill:'forwards'});
  fade.finished.catch(()=>{}).finally(()=>{dialog.close();fade.cancel();dialog.classList.remove('is-closing');settingsClosing=false;});
}
async function openSettings(b){
  if(settingsClosing)return;
  active=b;draft={...defaults(b),...prefs[b.id]};choices=records.get(b.url)?.items||[];session++;
  colorPicker.close(true);for(const control of dropdowns.values())control.close();
  $('reset').textContent=t('resetButton');$('reset').disabled=false;$('reset').classList.remove('reset-done');$('site-name').textContent=b.title;syncControls();$('upload').value='';setDialogStatus(null);fillSources();updatePreview(false);dialog.classList.remove('is-closing');document.documentElement.classList.add('modal-open');dialog.showModal();dialog.scrollTop=0;dialog.animate([{opacity:0},{opacity:1}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:motionMs('time-180',180),easing:'ease-out'});

  if(draft.appearance!=='letter'){const token=session,initialRecord=records.get(b.url);getRecord(b,false,draft.source).then(record=>{if(token!==session||active!==b||!dialog.open||record===initialRecord)return;choices=record?.items||[];fillSources();updatePreview();}).catch(()=>{});}

}
let backdropPress=null;
document.addEventListener('pointerdown',e=>{if(!dialog.open)return;const rect=dialog.getBoundingClientRect(),outside=e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom;backdropPress={id:e.pointerId,outside,blocked:colorPicker.isOpen()||[...dropdowns.values()].some(c=>c.isOpen?.())||Boolean(dialog.querySelector('.select-menu:not([hidden])'))};},true);
document.addEventListener('pointerup',e=>{const press=backdropPress;backdropPress=null;if(!press||press.id!==e.pointerId||!press.outside||press.blocked)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSettings();});
$('close').onclick=closeSettings;
dialog.addEventListener('cancel',e=>{e.preventDefault();if(colorPicker.isOpen()){colorPicker.close();return;}if(dialog.querySelector('.select-menu:not([hidden])')){for(const control of dropdowns.values())control.close();return;}closeSettings();});
dialog.addEventListener('close',()=>{document.documentElement.classList.remove('modal-open');colorPicker.close(true);finishImageDrag();session++;acquisition++;clearTimeout(loadingTimer);$('preview').classList.remove('is-loading');$('preview').setAttribute('aria-busy','false');dialog.querySelector('.save-button').disabled=false;for(const control of dropdowns.values())control.close();active=null;if(pendingSyncRefresh)refreshFromSync();});
for(const key of ['appearance','color','scale'])$(key).addEventListener('input',()=>{if(!draft)return;draft[key]=key==='scale'?Number($(key).value):$(key).value;if(key==='color')draft.customColor=true;syncControls();updatePreview();});
$('source').addEventListener('input',async()=>{
  if(!draft)return;if($('source').value==='website'){dropdowns.get('source').browse('website');return;}acquisition++;setLoading(false);draft.source=$('source').value;setDialogStatus(null);syncControls();if(!['third-party','auto','app-store'].includes(draft.source))updatePreview();
  const b=active;
  if(['third-party','auto','app-store'].includes(draft.source))await acquire(()=>getRecord(b,true,draft.source),record=>{choices=record?.items||[];});
});
$('upload-button').onclick=()=>{if(draft?.source==='upload')$('upload').click();};
$('upload').onchange=async()=>{
  const file=$('upload').files[0],b=active;if(!file||draft?.source!=='upload')return;
  await acquire(()=>iconEditor.importImage(b,file),()=>{draft.source='upload';draft.appearance='image';draft.offsetX=draft.offsetY=0;setDialogStatus('imageLoaded');});
};
$('reset').onclick=async()=>{
  const button=$('reset'),b=active,token=session;button.disabled=true;button.classList.remove('reset-done');button.textContent=t('resetting');
  draft=defaults(b);colorPicker.close();syncControls();fillSources();updatePreview();
  await acquire(()=>getRecord(b,true,'auto'),record=>{choices=record.items||[];});
  if(token!==session){button.disabled=false;button.textContent=t('resetButton');return;}
  button.disabled=false;button.textContent=t('resetDone');button.classList.add('reset-done');setDialogStatus(null);
  setTimeout(()=>{if(token===session){button.textContent=t('resetButton');button.classList.remove('reset-done');}},1600);
};
$('form').onsubmit=async e=>{e.preventDefault();const b=active;const next={...prefs,[b.id]:{...draft}};try{await chrome.storage.local.set({prefs:next});prefs=next;redrawIcon(b);closeSettings();}catch{setDialogStatus('saveFailed');}};
installScrollEffects(document.querySelector('.top-blur'));
observeGridReflow(grid,()=>Boolean(pointerDrag?.active));
observeGridScroll(grid);
applyTranslations();updateThemeIcons();const syncNoticeUI=createSyncNotices({api:chrome});
addEventListener('yiu-languagechange',()=>{
  applyTranslations();render();colorPicker.refreshLocale();
  if(active){fillSources();syncControls();updatePreview();$('reset').textContent=t($('reset').classList.contains('reset-done')?'resetDone':$('reset').disabled?'resetting':'resetButton');}
});
try{const saved=await chrome.storage.local.get(['prefs','order','syncStatus','managedFolderId']);managedFolderId=saved.managedFolderId;cloudBusy=['checking','syncing'].includes(saved.syncStatus?.state);prefs=saved.prefs||{};for(const value of Object.values(prefs))if(value.color==='#ffffff'&&!value.customColor)value.color=null;order=saved.order||[];for(const event of ['onCreated','onRemoved','onChanged','onMoved','onChildrenReordered'])chrome.bookmarks[event].addListener(bookmarkReload);chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.syncStatus)cloudBusy=['checking','syncing'].includes(changes.syncStatus.newValue?.state);if(changes.restoreRevision){if(dialog.open)pendingSyncRefresh=true;else refreshFromSync();return;}if(changes.syncRevision){if(dialog.open){prefs=changes.prefs?.newValue||prefs;order=changes.order?.newValue||order;pendingSyncRefresh=true;return;}refreshFromSync();return;}if(changes.settings&&changes.settings.newValue?.iconTemplate!==changes.settings.oldValue?.iconTemplate)load();if(changes.prefs){prefs=changes.prefs.newValue||{};render();}if(changes.order){const next=changes.order.newValue||[];if(JSON.stringify(next)!==JSON.stringify(order)){order=next;animateOrder(sorted(bookmarks).map(b=>b.id));}}});await load();}catch{setText('status','extensionOnly');}

function checkCloudSync(){if(globalThis.chrome?.runtime?.id)sendRequest(chrome,'yiu-sync-check').catch(()=>{});}
addEventListener('online',checkCloudSync);checkCloudSync();

function setDialogStatus(key,params={}){
 const el=document.getElementById('dialog-status');clearTimeout(dialogMessageTimer);
 if(!key){el.classList.remove('has-message');dialogMessageTimer=setTimeout(()=>setText('dialog-status',null),140);return;}
 setText('dialog-status',key,params);requestAnimationFrame(()=>el.classList.add('has-message'));
}

addEventListener('online',()=>{for(const record of records.values()){record.siteRetryAfter=0;record.thirdPartyRetryAfter=0;}load();});

setInterval(()=>{if(document.visibilityState==='visible'&&globalThis.chrome?.runtime?.id)sendRequest(chrome,'yiu-sync-check',{foreground:true}).catch(()=>{});},10000);

installScrollbars();
