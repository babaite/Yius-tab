import {iconError as uiError} from '../errors.js';
import {request,MAX_BYTES} from './transport.js';
export async function imageInfo(blob,maxBytes=MAX_BYTES) {
  if(blob.size>maxBytes)throw uiError('imageTooLarge',{max:Math.round(maxBytes/1024/1024)});
  const url=URL.createObjectURL(blob);
  try {return await new Promise((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>{img.src='';reject(uiError('imageTimeout'));},5000);img.onload=()=>{clearTimeout(timer);let background='transparent';
    try {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(img,0,0,24,24);
      const points=[[12,0],[23,12],[12,23],[0,12]],colors=points.map(([x,y])=>[...context.getImageData(x,y,1,1).data]);
      if(colors.every(c=>c[3]>245)&&colors.every(c=>c.slice(0,3).every((v,i)=>Math.abs(v-colors[0][i])<24)))background='#'+colors[0].slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
    } catch {}
    resolve({width:img.naturalWidth,height:img.naturalHeight,background,vector:blob.type.split(';')[0].toLowerCase()==='image/svg+xml'});};img.onerror=()=>{clearTimeout(timer);reject(uiError('imageUnreadable'));};img.src=url;});} finally {URL.revokeObjectURL(url);}
}

export async function normalizeIcon(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());let type=blob.type;
 if(bytes.length>=6&&bytes[0]===0&&bytes[1]===0&&bytes[2]===1&&bytes[3]===0){
  const view=new DataView(bytes.buffer),count=view.getUint16(4,true),entries=[];
  for(let i=0;i<Math.min(count,256)&&6+(i+1)*16<=bytes.length;i++){
   const at=6+i*16,size=view.getUint32(at+8,true),offset=view.getUint32(at+12,true);
   if(size&&offset>=6+count*16&&offset+size<=bytes.length)entries.push({at,size,offset,edge:Math.min(bytes[at]||256,bytes[at+1]||256)});
  }
  entries.sort((a,b)=>b.edge-a.edge||b.size-a.size);
  if(entries.length){const best=entries[0],frame=bytes.slice(best.offset,best.offset+best.size);
   if(frame[0]===137&&frame[1]===80&&frame[2]===78&&frame[3]===71)return new Blob([frame],{type:'image/png'});
   const header=new Uint8Array(22);header.set([0,0,1,0,1,0]);header.set(bytes.slice(best.at,best.at+16),6);new DataView(header.buffer).setUint32(18,22,true);return new Blob([header,frame],{type:'image/x-icon'});
  }
 }
 const prefix=new TextDecoder().decode(bytes.slice(0,4096));
 if(/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(prefix))type='image/svg+xml';
 else if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)type='image/png';
 else if(bytes[0]===255&&bytes[1]===216)type='image/jpeg';
 else if(prefix.startsWith('GIF8'))type='image/gif';
 else if(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP')type='image/webp';
 else if(prefix.slice(4,8)==='ftyp'&&/avif|avis/.test(prefix.slice(8,40)))type='image/avif';
 return type!==blob.type?new Blob([bytes],{type}):blob;
}
export async function download(url,options) { const result=await request(url,options),blob=await normalizeIcon(result.blob);const size=await imageInfo(blob);return {blob,...size,url}; }
export async function localIcon(file){
 if(file.size>12*1024*1024)throw uiError('imageTooLarge',{max:12});
 const blob=await normalizeIcon(file);return {blob,...await imageInfo(blob,12*1024*1024)};
}
export function fallbackColor(value) {let hash=0;for(const char of value)hash=(hash*31+char.charCodeAt(0))|0;return `hsl(${Math.abs(hash)%360} 58% 48%)`;}
