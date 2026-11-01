import {motionMs} from '../../ui/motion.js';
let manager;

export function installScrollbars(){
 if(manager)return manager;
 const selector='dialog,.source-popover,.select-menu,.format-menu,[data-scroll-region]',entries=new Map();
 let refreshFrame=0;
 function attach(target){
  if(entries.has(target))return;
  const root=target===document.scrollingElement,bar=document.createElement('div'),thumb=document.createElement('div');
  bar.className='app-scrollbar';bar.dataset.root=String(root);bar.dataset.scrollOwner=target.id||(root?'page':target.tagName.toLowerCase());bar.setAttribute('aria-hidden','true');bar.setAttribute('popover','manual');thumb.className='app-scrollbar-thumb';bar.append(thumb);
  const host=root?document.body:target.closest('dialog')||document.body;host.append(bar);
  if(!target.classList.contains('app-scroll-region'))target.classList.add('app-scroll-region');
  let timer,drag;
  function hide(){bar.hidden=true;bar.classList.remove('is-active');if(bar.matches(':popover-open'))bar.hidePopover();}
  function measure(){
   const rect=root?{top:0,right:innerWidth,height:innerHeight}:target.getBoundingClientRect(),style=getComputedStyle(target),range=target.scrollHeight-target.clientHeight;
   const visible=range>1&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&(root?style.overflowY!=='hidden'&&!document.querySelector('dialog:modal'):!target.hidden&&(target.tagName!=='DIALOG'||target.open)&&(!target.hasAttribute('popover')||target.matches(':popover-open')));
   if(!visible){hide();return;}
   const height=root?innerHeight:target.clientHeight,top=rect.top+(root?0:parseFloat(style.borderTopWidth)||0),right=rect.right-(root?0:parseFloat(style.borderRightWidth)||0);
   const hit=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-hit-width'))||10,length=Math.min(height,Math.max(28,height*target.clientHeight/target.scrollHeight));
   bar.hidden=false;bar.style.top=top+'px';bar.style.left=(right-hit)+'px';bar.style.height=height+'px';thumb.style.height=length+'px';thumb.style.transform=`translateY(${(height-length)*Math.max(0,Math.min(range,target.scrollTop))/range}px)`;
   if(!bar.matches(':popover-open'))bar.showPopover();
  }
  function wake(){measure();if(bar.hidden)return;bar.classList.add('is-active');clearTimeout(timer);timer=setTimeout(()=>{if(!drag)bar.classList.remove('is-active');},motionMs('scroll-idle',900));}
  const scroll=()=>wake();(root?document:target).addEventListener('scroll',scroll,{passive:true});
  thumb.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();drag={id:e.pointerId,y:e.clientY,top:target.scrollTop};thumb.setPointerCapture(e.pointerId);wake();});
  thumb.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const travel=bar.clientHeight-thumb.clientHeight;if(travel>0)target.scrollTop=drag.top+(e.clientY-drag.y)*(target.scrollHeight-target.clientHeight)/travel;});
  const finish=()=>{drag=null;wake();};thumb.addEventListener('pointerup',finish);thumb.addEventListener('pointercancel',finish);
  bar.addEventListener('pointerdown',e=>{e.stopPropagation();if(e.target!==bar||e.button!==0)return;e.preventDefault();const rect=bar.getBoundingClientRect();target.scrollTop=(e.clientY-rect.top)/rect.height*(target.scrollHeight-target.clientHeight);wake();});

  bar.addEventListener('click',e=>e.stopPropagation());
  const resize=new ResizeObserver(schedule);resize.observe(root?document.body:target);if(root)resize.observe(document.documentElement);
  entries.set(target,{bar,measure,wake,destroy(){clearTimeout(timer);resize.disconnect();(root?document:target).removeEventListener('scroll',scroll);bar.remove();}});
 }
 function refresh(){refreshFrame=0;for(const [target,entry]of entries)if(!target.isConnected){entry.destroy();entries.delete(target);}attach(document.scrollingElement);for(const target of document.querySelectorAll(selector))attach(target);for(const entry of entries.values())entry.measure();}
 function schedule(){if(!refreshFrame)refreshFrame=requestAnimationFrame(refresh);}
 const observer=new MutationObserver(records=>{if(records.some(record=>!record.target.closest?.('.app-scrollbar')&&!(record.type==='childList'&&[...record.addedNodes,...record.removedNodes].every(n=>n.nodeType===1&&n.matches('.app-scrollbar')))))schedule();});
 observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open','class','style']});
 const rootObserver=new MutationObserver(schedule);rootObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 const toggle=e=>{if(entries.has(e.target))schedule();};document.addEventListener('toggle',toggle,true);
 const hover=e=>{for(const {bar,wake}of entries.values())if(!bar.hidden){const rect=bar.getBoundingClientRect();if(e.clientX>=rect.left-5&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom)wake();}};
 document.addEventListener('pointermove',hover,{passive:true});addEventListener('resize',schedule,{passive:true});refresh();
 manager={refresh:schedule,destroy(){observer.disconnect();rootObserver.disconnect();cancelAnimationFrame(refreshFrame);document.removeEventListener('toggle',toggle,true);document.removeEventListener('pointermove',hover);removeEventListener('resize',schedule);for(const entry of entries.values())entry.destroy();entries.clear();manager=null;}};
 return manager;
}
