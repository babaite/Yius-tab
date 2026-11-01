import {webURL,request} from './transport.js';
import {download} from './codec.js';
import {iconDeclarations} from './metadata.js';
import {googleProduct,officialIconURLs} from './official.js';
export async function discover(pageURL,{onUpdate=()=>{}}={}) {
 const url=webURL(pageURL);if(!url)return [];
 const signal=AbortSignal.timeout(8500),origin=new URL(url).origin,candidates=new Map(),found=new Map();let sequence=0;
 const ranked=()=>[...found.values()].sort((a,b)=>b.quality-a.quality||b.priority-a.priority||a.sequence-b.sequence).slice(0,8).map(({quality,priority,sequence,...item})=>item);
 function add(href,base,sizes='',type='icon',priority=2){const u=webURL(href,base);if(!u)return;const nums=[...sizes.matchAll(/(\d+)x\d+/g)].map(m=>Number(m[1])),score=sizes==='any'?1024:Math.max(0,...nums);const old=candidates.get(u);if(!old||priority>old.priority)candidates.set(u,{url:u,score,type,priority,sequence:sequence++});}
 async function fetchCandidates(list){let next=0;await Promise.all(Array.from({length:Math.min(3,list.length)},async()=>{while(next<list.length&&!signal.aborted){const c=list[next++];try{const item=await download(c.url,{signal});if(item.vector||Math.min(item.width,item.height)>=16){found.set(c.url,{...item,type:c.type,quality:item.vector?1024:Math.min(512,item.width,item.height),priority:c.priority,sequence:c.sequence});onUpdate(ranked());}}catch{}}}));}

 const official=officialIconURLs(url);for(const asset of official)add(asset,origin,'any','Official',4);
 await Promise.all([fetchCandidates(official.map(asset=>candidates.get(asset))),(async()=>{
  const product=googleProduct(url);if(!['gmail','maps'].includes(product))return;
  try{
   let latest;
   if(product==='gmail'){
    const page=await request('https://workspace.google.com/products/gmail/',{signal,timeout:2200}),html=await page.blob.text();
    const urls=[...html.matchAll(/(?:src|href)=["'](https:\/\/www\.gstatic\.com\/images\/branding\/productlogos\/gmail_[^"']+\.svg)["']/g)].map(m=>m[1]);latest=urls[0];
   }else{
    const page=await request('https://www.google.com/maps/preview/pwa/manifest?source=ttpwa&hl=en',{signal,timeout:2200}),manifest=JSON.parse(await page.blob.text());
    const icons=(manifest.icons||[]).filter(i=>typeof i.src==='string'&&webURL(i.src,page.url));latest=(icons.find(i=>!i.src.includes('_round/')&&/192|256/.test(i.sizes))||icons[0])?.src;
   }
   if(latest&&!candidates.has(latest)){add(latest,origin,'any','Official',5);await fetchCandidates([candidates.get(webURL(latest,origin))]);}
  }catch{}
 })()]);if(found.size)return ranked();
 const readMetadata=async page=>{
  const result=await request(page,{signal,timeout:2800});

  if(new URL(result.url).hostname.replace(/^www\./,'')!==new URL(page).hostname.replace(/^www\./,''))return null;
  const metadata=iconDeclarations(await result.blob.text(),result.url);
  for(const {rel,href,sizes}of metadata.links)if(rel.some(r=>['icon','apple-touch-icon','apple-touch-icon-precomposed'].includes(r)))add(href,metadata.base,sizes,rel.includes('apple-touch-icon')?'Apple Touch':'icon',3);
  return metadata;
 };
 let metadata;try{metadata=await readMetadata(url);}catch{}
 if(!metadata?.links.some(l=>l.rel.includes('icon')||l.rel.includes('apple-touch-icon'))&&new URL(url).pathname!=='/'&&!googleProduct(url))try{metadata=await readMetadata(origin+'/');}catch{}
 const declarations=[...candidates.values()].filter(c=>c.priority===3).sort((a,b)=>b.score-a.score||a.sequence-b.sequence).slice(0,12);

 await Promise.all([fetchCandidates(declarations),(async()=>{const link=metadata?.links.find(l=>l.rel.includes('manifest')),manifest=link&&webURL(link.href,metadata.base);if(!manifest)return;try{const result=await request(manifest,{signal,timeout:2200}),json=JSON.parse(await result.blob.text()),list=[];for(const item of (json.icons||[]).slice(0,12))if(typeof item.src==='string'){add(item.src,result.url,item.sizes||'','Manifest',3);list.push(candidates.get(webURL(item.src,result.url)));}await fetchCandidates(list.filter(Boolean).sort((a,b)=>b.score-a.score));}catch{}})()]);
 if([...found.values()].some(i=>i.vector||i.quality>=144))return ranked();
 const paths=['/apple-touch-icon.png','/apple-touch-icon-precomposed.png','/favicon.svg','/favicon.ico','/favicon.png'];
 for(const path of paths)add(path,origin,path.endsWith('.svg')?'any':path.includes('apple')?'180x180':'',path.includes('apple')?'Apple Touch':'icon',1);
 await fetchCandidates([...candidates.values()].filter(c=>c.priority===1).sort((a,b)=>b.score-a.score||a.sequence-b.sequence));return ranked();
}
