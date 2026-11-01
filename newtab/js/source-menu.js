import {focusMenuItem} from '../../ui/components/menu-focus.js';
import {applyIconBoundary} from './icon-motion.js';

import {t} from './i18n.js';
export function createSourceMenu({select,dialog,current,loadCandidates,onSelect,beforeOpen=()=>{}}){
 const categories=[['auto','bestQuality'],['website','candidateIcon'],['third-party','thirdParty'],['app-store','appStore'],['upload','localImage']];
 const branches=new Set(['website','third-party','app-store']),rootButtons=new Map(),urls=new WeakMap(),fades=new WeakMap();
 const wrap=document.createElement('div');wrap.className='dropdown source-dropdown';
 const trigger=document.createElement('button');trigger.type='button';trigger.id='source-trigger';trigger.className='select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-controls','source-menu');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-labelledby','source-label source-value');
 const label=document.createElement('span');label.id='source-value';
 function chevron(){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','m5 7.5 5 5 5-5');svg.append(path);return svg;}
 trigger.append(label,chevron());select.hidden=true;select.after(wrap);wrap.append(trigger);
 function panel(id,extra){const el=document.createElement('div');el.id=id;el.className='select-menu source-popover '+extra;el.setAttribute('role','menu');el.setAttribute('popover','manual');el.setAttribute('aria-labelledby','source-label');el.hidden=true;dialog.append(el);return el;}
 const menu=panel('source-menu','source-root'),child=panel('source-submenu','source-child');
 let opened=false,branch=null,request=0,rootExit=0,childExit=0;
 function category(){const value=current();return ['auto','upload','third-party','app-store'].includes(value)?value:'website';}
 function reveal(el){clearTimeout(el===menu?rootExit:childExit);fades.get(el)?.cancel();fades.delete(el);el.style.pointerEvents='';el.hidden=false;el.classList.remove('menu-closing');if(!el.matches(':popover-open'))el.showPopover();}
 function conceal(el,instant=false){if(el.hidden)return;const done=()=>{if(el.matches(':popover-open'))el.hidePopover();el.hidden=true;el.classList.remove('menu-closing');};if(instant){fades.get(el)?.cancel();fades.delete(el);done();return;}if(fades.has(el))return;el.style.pointerEvents='none';const fade=el.animate([{opacity:getComputedStyle(el).opacity},{opacity:0}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:140,easing:'ease-out',fill:'forwards'});fades.set(el,fade);fade.finished.catch(()=>{}).then(()=>{if(fades.get(el)===fade){done();fades.delete(el);fade.cancel();}});}
 function hideChild(focus=false){request++;if(branch)rootButtons.get(branch)?.setAttribute('aria-expanded','false');const old=branch;branch=null;conceal(child);menu.classList.remove('submenu-overlays');for(const button of rootButtons.values()){button.classList.remove('is-browsing','is-loading');button.removeAttribute('aria-busy');}if(focus)rootButtons.get(old)?.focus({preventScroll:true});}
 function close(focus=false){opened=false;trigger.setAttribute('aria-expanded','false');hideChild();conceal(menu);if(focus)trigger.focus({preventScroll:true});}
 function position(){if(!opened)return;
  const edge=12,gap=8,r=trigger.getBoundingClientRect();menu.style.width=Math.min(220,innerWidth-edge*2)+'px';menu.style.maxHeight=Math.max(150,innerHeight-edge*2)+'px';
  const height=menu.offsetHeight,x=Math.max(edge,Math.min(innerWidth-edge-menu.offsetWidth,r.right-menu.offsetWidth)),y=r.bottom+gap+height<=innerHeight-edge?r.bottom+gap:Math.max(edge,r.top-gap-height);
  menu.style.left=x+'px';menu.style.top=y+'px';
  if(branch&&!child.hidden){child.style.width=Math.min(228,innerWidth-edge*2)+'px';child.style.maxHeight=Math.max(120,Math.min(340,innerHeight-edge*2))+'px';const parent=menu.getBoundingClientRect(),row=rootButtons.get(branch).getBoundingClientRect(),width=child.offsetWidth;
   const right=innerWidth-edge-parent.right>=width+gap,left=parent.left-edge>=width+gap,stacked=!right&&!left;
   child.dataset.placement=right?'right':left?'left':'stacked';rootButtons.get(branch).dataset.placement=child.dataset.placement;menu.classList.toggle('submenu-overlays',stacked);child.querySelector('.source-back')?.classList.toggle('is-needed',stacked);
   child.style.left=(right?parent.right+gap:left?parent.left-width-gap:Math.min(parent.left,innerWidth-edge-width))+'px';child.style.top=Math.max(edge,Math.min(innerHeight-edge-child.offsetHeight,stacked?parent.top:row.top-6))+'px';
  }
 }
 function sync(){const selected=category();label.textContent=t(categories.find(([kind])=>kind===selected)[1]);select.value=selected;for(const [kind,key]of categories){const button=rootButtons.get(kind);if(!button)continue;button.querySelector('.source-name').textContent=t(key);button.setAttribute('aria-checked',String(kind===selected));}if(opened)position();}
 function navigate(event,buttons){const index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const i=event.key==='Home'?0:event.key==='End'?buttons.length-1:(Math.max(0,index)+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;focusMenuItem(buttons[i]);return true;}return false;}
 async function selectItem(kind,item){try{await onSelect(kind,item);close(true);sync();}catch(error){message(error.uiKey?t(error.uiKey,error.uiParams):t('fetchFailed'));}}
 for(const [kind,key]of categories){const button=document.createElement('button');button.type='button';button.className='source-option';button.dataset.source=kind;button.setAttribute('role','menuitemradio');button.tabIndex=-1;
  const name=document.createElement('span');name.className='source-name';name.textContent=t(key);const mark=document.createElement('span');mark.className='source-mark';mark.setAttribute('aria-hidden','true');button.append(name,mark);
  if(branches.has(kind)){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-controls','source-submenu');button.setAttribute('aria-expanded','false');mark.append(chevron());}
  button.onclick=()=>branches.has(kind)?browse(kind):selectItem(kind);
  button.onkeydown=e=>{if(navigate(e,[...rootButtons.values()]))return;if(e.key==='ArrowRight'&&branches.has(kind)){e.preventDefault();browse(kind,true);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(e.key==='Tab')close();};
  rootButtons.set(kind,button);menu.append(button);
 }
 function message(text,loading=false){child.replaceChildren();const back=document.createElement('button');back.className='source-back';back.type='button';back.textContent='‹ '+t(categories.find(([kind])=>kind===branch)?.[1]||'iconSource');back.onclick=()=>hideChild(true);child.append(back);const status=document.createElement('div');status.className='source-empty';status.setAttribute('role','status');status.textContent=text;if(loading)status.classList.add('is-loading');child.append(status);position();}
 function renderItems(items,kind){const previousHeight=child.offsetHeight,previousTop=child.getBoundingClientRect().top;const savedFocus=document.activeElement?.dataset.candidate;child.replaceChildren();const back=document.createElement('button');back.type='button';back.className='source-back';back.textContent='‹ '+t(categories.find(([value])=>value===kind)[1]);back.onclick=()=>hideChild(true);child.append(back);
  for(const [index,item]of items.entries()){const button=document.createElement('button');button.type='button';button.className='source-candidate';button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked',String(kind==='website'?current()===item.url:category()===kind&&item.selected));button.dataset.candidate=String(index);button.tabIndex=-1;
   const thumbnail=document.createElement('span');thumbnail.className='source-thumbnail';thumbnail.style.backgroundColor=item.background||'transparent';const img=new Image();img.alt='';img.draggable=false;img.referrerPolicy='no-referrer';if(item.blob){if(!urls.has(item.blob))urls.set(item.blob,URL.createObjectURL(item.blob));img.src=urls.get(item.blob);}else if(item.glyph){thumbnail.textContent=item.glyph;}thumbnail.append(img);img.decode().then(()=>applyIconBoundary(thumbnail,img)).catch(()=>applyIconBoundary(thumbnail,null));
   const text=document.createElement('span');text.className='source-candidate-text';const dimensions=`${item.width} × ${item.height}`;text.textContent=dimensions;
   if(kind==='app-store'){const app=document.createElement('span');app.className='source-app-name';app.textContent=item.appName||t('appStore');const size=document.createElement('span');size.className='source-dimensions';size.textContent=dimensions+(item.regions?.length?' · '+item.regions.map(region=>t(region==='cn'?'chinaStore':'usStore')).join(' / '):item.region?' · '+t(item.region==='cn'?'chinaStore':'usStore'):'');text.replaceChildren(app,size);}
   button.title=item.appName?item.appName+' · '+dimensions:dimensions;button.setAttribute('aria-label',button.title);button.append(thumbnail,text);button.onclick=()=>selectItem(kind,item);child.append(button);
  }
  if(!items.length){message(t(kind==='app-store'?'noAppStoreIcon':kind==='third-party'?'noThirdPartyIcon':'noWebsiteIcon'));return;}
  position();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)child.animate([{height:previousHeight+'px',top:previousTop+'px'},{height:child.offsetHeight+'px',top:child.getBoundingClientRect().top+'px'}],{duration:160,easing:'cubic-bezier(.2,.75,.2,1)'});if(savedFocus)child.querySelector(`[data-candidate="${savedFocus}"]`)?.focus({preventScroll:true});
 }
 async function browse(kind,focus=false){if(!opened)open();const token=++request;branch=kind;for(const [key,button]of rootButtons){button.classList.toggle('is-browsing',key===kind);button.classList.toggle('is-loading',key===kind);if(branches.has(key))button.setAttribute('aria-expanded',String(key===kind));}rootButtons.get(kind).setAttribute('aria-busy','true');reveal(child);message(t('loadingIcon'),true);
  try{const items=await loadCandidates(kind);if(token!==request||!opened)return;renderItems(items,kind);if(focus)focusMenuItem(child.querySelector('.source-candidate'));}
  catch(error){if(token===request&&opened)message(error.uiKey?t(error.uiKey,error.uiParams):t('fetchFailed'));}
  finally{if(token===request){rootButtons.get(kind).classList.remove('is-loading');rootButtons.get(kind).removeAttribute('aria-busy');}}
 }
 child.onkeydown=e=>{const buttons=[...child.querySelectorAll('.source-candidate')];if(navigate(e,buttons))return;if(['ArrowLeft','Escape'].includes(e.key)){e.preventDefault();e.stopPropagation();hideChild(true);}else if(e.key==='Tab')close();};
 function open(){beforeOpen();opened=true;sync();reveal(menu);position();trigger.setAttribute('aria-expanded','true');focusMenuItem(rootButtons.get(category()));}
 trigger.onclick=()=>opened?close():open();trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}else if(e.key==='Escape'&&opened){e.preventDefault();e.stopPropagation();close(true);}};
 document.addEventListener('pointerdown',e=>{if(opened&&!wrap.contains(e.target)&&!menu.contains(e.target)&&!child.contains(e.target))close();});
 addEventListener('resize',position);document.addEventListener('scroll',position,true);dialog.addEventListener('close',()=>{close();clearTimeout(rootExit);clearTimeout(childExit);conceal(menu,true);conceal(child,true);});
 sync();return {sync,close,browse,isOpen:()=>opened};
}
