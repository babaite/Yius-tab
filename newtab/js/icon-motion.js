const states=new WeakMap(),edgeSamples=new Map();
let edgeCanvas;
export function applyIconBoundary(next,image){
 const background=next.style.getPropertyValue('--tile-bg')||next.style.backgroundColor||'transparent',key=background+'|'+(image?.src||'');
 if(edgeSamples.has(key)){next.dataset.edge=edgeSamples.get(key);return;}
 let tone='none';try{
  edgeCanvas??=document.createElement('canvas');edgeCanvas.width=edgeCanvas.height=8;const ctx=edgeCanvas.getContext('2d',{willReadFrequently:true});
  ctx.clearRect(0,0,8,8);ctx.fillStyle=background;ctx.fillRect(0,0,8,8);
  if(ctx.getImageData(4,4,1,1).data[3]<230&&image)ctx.drawImage(image,0,0,8,8);
  const data=ctx.getImageData(0,0,8,8).data;let alpha=0,luma=0,count=0;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(x===0||x===7||y===0||y===7){const at=(y*8+x)*4,a=data[at+3]/255;alpha+=a;luma+=(data[at]*.2126+data[at+1]*.7152+data[at+2]*.0722)/255*a;count++;}

  if(alpha/count>.7){const luminance=luma/alpha;tone=luminance<.25?'dark':luminance>.72?'light':'none';}
 }catch{}next.dataset.edge=tone;edgeSamples.set(key,tone);if(edgeSamples.size>512)edgeSamples.delete(edgeSamples.keys().next().value);
}

export async function presentIcon(slot,next,key,{animate=true}={}){
 let state=states.get(slot);if(!state){state={version:0,key:null,timer:0};states.set(slot,state);}
 if(state.key===key)return;state.key=key;const version=++state.version;
 const image=next.querySelector('img');if(image)try{await image.decode();}catch{if(version===state.version)state.key=null;return;}
 if(version!==state.version)return;
 applyIconBoundary(next,image);
 clearTimeout(state.timer);slot.querySelectorAll('.icon-outgoing').forEach(el=>el.remove());
 const previous=slot.firstElementChild;
 if(!animate||!previous||matchMedia('(prefers-reduced-motion: reduce)').matches){slot.replaceChildren(next);slot.classList.remove('is-changing');return;}
 previous.classList.remove('icon-incoming');previous.classList.add('icon-outgoing');next.classList.add('icon-incoming');slot.append(next);slot.classList.remove('is-changing');

 void slot.offsetWidth;slot.classList.add('is-changing');
 state.timer=setTimeout(()=>{if(version!==state.version)return;slot.replaceChildren(next);next.classList.remove('icon-incoming');slot.classList.remove('is-changing');},360);
}

const fingerprints=new WeakMap();
export function artworkFingerprint(blob){if(!fingerprints.has(blob))fingerprints.set(blob,blob.arrayBuffer().then(bytes=>crypto.subtle.digest('SHA-256',bytes)).then(hash=>[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')));return fingerprints.get(blob);}
