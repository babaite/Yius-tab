import {motionMs} from '../motion.js';
export function shakeField(input){
 if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
 input.getAnimations().forEach(animation=>animation.cancel());
 return input.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(5px)'},{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'translateX(0)'}],{duration:motionMs('time-260',260),easing:'ease-out'});
}
