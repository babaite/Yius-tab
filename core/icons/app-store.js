import {googleProduct} from './official.js';
import {request,webURL} from './transport.js';
export async function appStoreMatches(pageURL,title){
 const product=googleProduct(pageURL),ids={gmail:422689480,maps:585027354,youtube:544007664,google:284815942,gemini:6477489729};
 const results=await Promise.allSettled(['cn','us'].map(async region=>{
  const u=new URL(ids[product]?'https://itunes.apple.com/lookup':'https://itunes.apple.com/search');u.searchParams.set('country',region);u.searchParams.set('entity','software');
  if(ids[product])u.searchParams.set('id',String(ids[product]));else{u.searchParams.set('term',String(title||new URL(pageURL).hostname).slice(0,80));u.searchParams.set('limit','4');}
  const response=await request(u.href,{timeout:6000}),data=JSON.parse(await response.blob.text());return (data.results||[]).filter(item=>item.wrapperType==='software'&&webURL(item.artworkUrl512||item.artworkUrl100)).map(item=>({url:item.artworkUrl512||item.artworkUrl100,name:String(item.trackName||''),artist:String(item.artistName||''),id:item.trackId,region,regions:[region]})).slice(0,4);
 }));const matches=new Map();for(const result of results)if(result.status==='fulfilled')for(const item of result.value){const key=item.id+':'+item.url,old=matches.get(key);if(old)old.regions.push(item.region);else matches.set(key,item);}if(results.every(r=>r.status==='rejected'))throw results[0].reason;return [...matches.values()];
}
