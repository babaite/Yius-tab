import {motionMs} from '../motion.js';
const actions=new WeakMap();

export async function runAction(button,task,{onError=()=>{},isSuccess=value=>value!==false&&!['error','offline','conflict','disabled','preview'].includes(value?.state)}={}){
 if(actions.get(button)?.running)return;
 const previous=actions.get(button);clearTimeout(previous?.timer);
 const state={running:true,timer:null},disabled=button.disabled;actions.set(button,state);
 button.dataset.action='';button.dataset.actionState='working';button.disabled=true;button.setAttribute('aria-busy','true');
 try{const value=await task();button.dataset.actionState=isSuccess(value)?'done':'error';return value;}
 catch(error){button.dataset.actionState='error';onError(error);}
 finally{state.running=false;button.disabled=disabled;button.removeAttribute('aria-busy');state.timer=setTimeout(()=>{if(actions.get(button)===state)button.dataset.actionState='idle';},motionMs('action-feedback-hold',1100));}
}
