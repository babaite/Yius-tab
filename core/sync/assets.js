import {failure} from '../errors.js';
import {hashBlob,references} from '../../sync/model.js';
import {assetURL} from '../net/cloud-config.js';
import {parallel} from '../tasks/parallel.js';
async function imageMime(blob){
 const known=blob.type.split(';')[0].toLowerCase();if(/^image\/[\w.+-]+$/.test(known))return known;
 const b=new Uint8Array(await blob.slice(0,512).arrayBuffer()),text=new TextDecoder().decode(b);
 if(b[0]===137&&text.slice(1,4)==='PNG')return 'image/png';if(b[0]===255&&b[1]===216)return 'image/jpeg';if(text.startsWith('GIF8'))return 'image/gif';if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'image/webp';if(b[0]===0&&b[1]===0&&b[2]===1&&b[3]===0)return 'image/x-icon';if(text.startsWith('BM'))return 'image/bmp';if(text.slice(4,8)==='ftyp'&&/avif|avis/.test(text.slice(8,40)))return 'image/avif';if(/<svg[\s>]/i.test(text))return 'image/svg+xml';throw failure('syncInvalidData');
}
export function createAssetService({api,request,bytes,cache,now,blobs,recentUploads}){
 let touched=0;
 async function itemRef(item){
  if(!item?.blob)return null;if(now()-touched>10000){await api.storage.local.get('settings');touched=now();}let blob=item.blob;const mime=await imageMime(blob);if(blob.type!==mime)blob=new Blob([blob],{type:mime});if(blob.size<1||blob.size>12*1024*1024)throw failure('syncTooLarge');
  const asset=await hashBlob(blob);blobs.set(asset,blob);await cache.put(asset,blob);
  return {asset,bytes:blob.size,mime,width:item.width,height:item.height,background:item.background||'transparent',vector:!!item.vector||mime==='image/svg+xml',...(item.url?{url:item.url,type:item.type||'icon',...(item.appName?{appName:item.appName}:{})}:{})};
 }
 async function acquireAssets(config,data,known,meta){
  const hashes=[...references(data)],descriptors=new Map(Object.values(data.records).flatMap(r=>[...r.items,r.upload,r.thirdParty,r.appStore]).filter(Boolean).map(item=>[item.asset,item]));
  await parallel(hashes,async hash=>{
   if(!blobs.has(hash)){const cached=await cache.get(hash);if(cached&&await hashBlob(cached)===hash)blobs.set(hash,cached);}
   if(blobs.has(hash))return;
   const descriptor=descriptors.get(hash),response=await request(config,'GET',assetURL(config,hash),{limit:12*1024*1024});if(!response.ok)throw failure('syncAsset',response.status);
   const buffer=await bytes(response,12*1024*1024),blob=new Blob([buffer],{type:descriptor.mime});if(blob.size!==descriptor.bytes||await hashBlob(blob)!==hash)throw failure('syncInvalidData');blobs.set(hash,blob);await cache.put(hash,blob);
  });
  for(const [hash,time]of recentUploads)if(now()-time>=60000)recentUploads.delete(hash);
  const pending=hashes.filter(hash=>!known.has(hash)&&!recentUploads.has(hash));
  await parallel(pending,async hash=>{
   const response=await request(config,'PUT',assetURL(config,hash),{body:blobs.get(hash),headers:{'If-None-Match':'*'},limit:12*1024*1024});
   if(response.status===412){const existing=await request(config,'GET',assetURL(config,hash),{limit:12*1024*1024});if(!existing.ok||await hashBlob(new Blob([await bytes(existing,12*1024*1024)]))!==hash)throw failure('syncInvalidData');}
   else if(!response.ok)throw failure('syncHTTP',response.status);
   recentUploads.set(hash,now());
   meta.assets=[...new Set([...(meta.assets||[]),hash])];meta.garbage={...meta.garbage,[hash]:meta.garbage?.[hash]||now()};
  });
 }
 return {itemRef,acquireAssets};
}
