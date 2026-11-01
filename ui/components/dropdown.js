import {focusMenuItem} from './menu-focus.js';
import {motionMs} from '../motion.js';
export function createDropdown(id,{dialog,dropdowns}) {
  const $=id=>document.getElementById(id);
  const select=$(id);select.hidden=true;
  const wrapper=document.createElement('div');wrapper.className='dropdown';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.id=id+'-trigger';
  trigger.setAttribute('role','combobox');trigger.setAttribute('aria-labelledby',id+'-label '+id+'-value');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls',id+'-menu');
  const text=document.createElement('span');text.id=id+'-value';
  const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.setAttribute('viewBox','0 0 20 20');arrow.setAttribute('aria-hidden','true');
  const path=document.createElementNS(arrow.namespaceURI,'path');path.setAttribute('d','m5 7.5 5 5 5-5');arrow.append(path);trigger.append(text,arrow);
  const menu=document.createElement('div');menu.id=id+'-menu';menu.className='select-menu';menu.setAttribute('role','listbox');menu.setAttribute('aria-labelledby',id+'-label');menu.hidden=true;
  select.after(wrapper);wrapper.append(trigger,menu);
  let buttons=[],exitAnimation;
  function close(focus=false){trigger.setAttribute('aria-expanded','false');if(!menu.hidden&&!exitAnimation){menu.style.pointerEvents='none';exitAnimation=menu.animate([{opacity:getComputedStyle(menu).opacity},{opacity:0}],{duration:motionMs('time-140',140),easing:'ease-out',fill:'forwards'});const fade=exitAnimation;fade.finished.catch(()=>{}).then(()=>{if(exitAnimation===fade){menu.hidden=true;exitAnimation=null;fade.cancel();}});}if(focus)trigger.focus({preventScroll:true});}
  function sync(){
    text.textContent=select.selectedOptions[0]?.textContent||'';menu.replaceChildren();buttons=[];
    for(const option of select.options){
      const button=document.createElement('button');button.type='button';button.className='select-option';button.setAttribute('role','option');button.setAttribute('aria-selected',String(option.selected));button.tabIndex=-1;
      const name=document.createElement('span');name.textContent=option.textContent;const check=document.createElement('span');check.className='option-check';check.setAttribute('aria-hidden','true');check.textContent=option.selected?'✓':'';button.append(name,check);
      button.onclick=()=>{select.value=option.value;close(true);select.dispatchEvent(new Event('input',{bubbles:true}));sync();};
      button.onkeydown=e=>{const index=buttons.indexOf(button);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;focusMenuItem(buttons[next]);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}else if(e.key==='Tab')close();};
      buttons.push(button);menu.append(button);
    }
  }
  function open(){for(const item of dropdowns.values())item.close();if(exitAnimation){exitAnimation.cancel();exitAnimation=null;}sync();menu.hidden=false;trigger.setAttribute('aria-expanded','true');const rect=trigger.getBoundingClientRect(),limit=Math.min(innerHeight-12,dialog.getBoundingClientRect().bottom-16);wrapper.classList.toggle('opens-up',rect.bottom+menu.offsetHeight+8>limit);focusMenuItem(buttons[select.selectedIndex]||buttons[0]);}
  trigger.onclick=()=>menu.hidden?open():close();trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}else if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();close(true);}};
  document.addEventListener('pointerdown',e=>{if(!wrapper.contains(e.target))close();});
  dialog.addEventListener('close',()=>{exitAnimation?.cancel();exitAnimation=null;menu.hidden=true;});const control={sync,close};dropdowns.set(id,control);sync();
}
