import {TOP_BLUR} from './motion.js';
export function installScrollEffects(blur){

TOP_BLUR.radii.forEach((radius,i)=>{
  const layer=document.createElement('span');layer.style.setProperty('--blur',radius+'px');layer.style.height=(TOP_BLUR.heights[i])+'px';
  layer.style.setProperty('--mask',TOP_BLUR.mask);blur.append(layer);
});
const smoothstep=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
let blurCurrent=0,shadeCurrent=0,blurTarget=0,shadeTarget=0,effectFrame=0,lastEffectTime=0;
function animateScrollEffect(time){
  const dt=lastEffectTime?Math.min(50,time-lastEffectTime):16;lastEffectTime=time;
  blurCurrent+=(blurTarget-blurCurrent)*(1-Math.exp(-dt/TOP_BLUR.blurDamping));
  shadeCurrent+=(shadeTarget-shadeCurrent)*(1-Math.exp(-dt/TOP_BLUR.shadeDamping));
  blur.style.setProperty('--blur-strength',blurCurrent.toFixed(4));blur.style.setProperty('--shade-strength',shadeCurrent.toFixed(4));
  if(Math.abs(blurCurrent-blurTarget)+Math.abs(shadeCurrent-shadeTarget)>.001)effectFrame=requestAnimationFrame(animateScrollEffect);
  else{effectFrame=0;lastEffectTime=0;blur.style.setProperty('--blur-strength',String(blurTarget));blur.style.setProperty('--shade-strength',String(shadeTarget));}
}
function onScroll(){blur.dataset.active=scrollY>0?'true':'false';blurTarget=smoothstep(scrollY/TOP_BLUR.blurRange);shadeTarget=smoothstep(scrollY/TOP_BLUR.shadeRange);if(!effectFrame)effectFrame=requestAnimationFrame(animateScrollEffect);}
addEventListener('scroll',onScroll,{passive:true});onScroll();
 return ()=>{removeEventListener('scroll',onScroll);cancelAnimationFrame(effectFrame);};
}
