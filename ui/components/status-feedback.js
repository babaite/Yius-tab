import {motionMs} from '../motion.js';
const transitions=new WeakMap();
export function setStatusText(element,text){
 if((transitions.get(element)?.text??element.textContent)===text)return;
 const previous=transitions.get(element);previous?.animation?.cancel();
 const state={text,animation:null};transitions.set(element,state);
 const apply=()=>{if(transitions.get(element)!==state)return;element.textContent=text;if(text&&!matchMedia('(prefers-reduced-motion:reduce)').matches){state.animation=element.animate([{opacity:0},{opacity:1}],{duration:motionMs('time-140',140),easing:'ease-out'});}};
 if(!element.textContent||matchMedia('(prefers-reduced-motion:reduce)').matches){apply();return;}
 state.animation=element.animate([{opacity:getComputedStyle(element).opacity},{opacity:0}],{duration:motionMs('time-100',100),easing:'ease-out'});state.animation.finished.then(apply).catch(()=>{});
}
