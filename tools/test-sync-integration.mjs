import assert from 'node:assert/strict';
import {createSyncEngine} from '../sync/engine.js';

const sleep=async()=>{};
const clone=value=>structuredClone(value);
const identity='11111111-1111-4111-8111-111111111111';
const markerURL=`https://yius-tab.invalid/folder/${identity}`;
const cloud={enabled:true,url:'https://dav.example/sync/tree.json',username:'',password:'',remember:true};

function makeStorage(initial={}){
 const data=clone(initial),listeners=[];
 return {
  data,
  local:{
   async get(keys){
    if(keys===undefined)return clone(data);
    if(typeof keys==='string')return Object.hasOwn(data,keys)?{[keys]:clone(data[keys])}:{};
    if(Array.isArray(keys))return Object.fromEntries(keys.filter(key=>Object.hasOwn(data,key)).map(key=>[key,clone(data[key])]));
    return Object.fromEntries(Object.entries(keys||{}).map(([key,fallback])=>[key,Object.hasOwn(data,key)?clone(data[key]):fallback]));
   },
   async set(patch){
    const changes={};
    for(const [key,value]of Object.entries(patch)){changes[key]={oldValue:data[key],newValue:clone(value)};data[key]=clone(value);}
    for(const listener of listeners)listener(changes,'local');
   }
  },
  onChanged:{addListener(listener){listeners.push(listener);}}
 };
}

function makeBrowser(name){
 let next=10;
 const marker={id:`${name}-marker`,title:"Yiu’s tab · ID "+identity,url:markerURL};
 const site={id:`${name}-site`,title:'Base title',url:'https://example.com/'};
 const folder={id:`${name}-folder`,title:"Yiu's tab",children:[marker,site]};
 const tree=[{id:'0',children:[{id:'1',title:'Bookmarks bar',children:[]},{id:'2',title:'Other bookmarks',children:[folder]}]}];
 const event=()=>({addListener(){}});
 const find=(id,nodes=tree)=>{for(const node of nodes){if(node.id===id)return node;const found=node.children&&find(id,node.children);if(found)return found;}return null;};
 const findParent=(id,nodes=tree)=>{for(const node of nodes){if((node.children||[]).some(child=>child.id===id))return node;const found=node.children&&findParent(id,node.children);if(found)return found;}return null;};
 const storage=makeStorage({
  settings:{cloud,iconTemplate:'https://www.google.com/s2/favicons?domain={domain}&sz={size}'},
  prefs:{[site.id]:{appearance:'image',color:null,customColor:false,scale:100,source:'auto',offsetX:0,offsetY:0}},
  order:[site.id],
  managedFolderId:folder.id,
  managedFolderIdentity:identity,
  managedFolderInitialized:true,
  managedFolderNameVersion:1,
  syncStatus:{state:'disabled',lastSynced:null}
 });
 const bookmarks={
  getTree:async()=>clone(tree),
  create:async({parentId,title,url})=>{const parent=find(parentId);const node={id:`${name}-${next++}`,title,...(url?{url}:{children:[]})};parent.children.push(node);return clone(node);},
  update:async(id,patch)=>{const node=find(id);Object.assign(node,patch);return clone(node);},
  remove:async(id)=>{const parent=findParent(id);if(parent)parent.children=parent.children.filter(node=>node.id!==id);}
 };
 for(const type of ['onCreated','onRemoved','onChanged','onMoved','onChildrenReordered'])bookmarks[type]=event();
 return {
  name,
  siteId:site.id,
  folderId:folder.id,
  tree,
  api:{storage,bookmarks,runtime:{id:'test-extension'}},
  rename(title){site.title=title;},
  site(){return find(site.id);},
  folder(){return find(folder.id);},
  storage
 };
}

function makeWebDAV(){
 const files=new Map(),conflicts=[];
 let revision=0,timeouts=0,emptyPropfind=false,logReads=0;
 const pathOf=value=>new URL(value).pathname;
 const etag=()=>`"v${++revision}"`;
 const xml=url=>`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${pathOf(url)}</d:href><d:propstat><d:prop><d:getetag>${files.get(pathOf(url))?.etag||''}</d:getetag></d:prop></d:propstat></d:response></d:multistatus>`;
 async function fetcher(url,{method='GET',body,headers={}}={}){
  if(timeouts>0){timeouts--;throw new Error('proxy timeout');}
  const path=pathOf(url);
  if(method==='PROPFIND'){
   if(path===pathOf(cloud.url)){
    if(emptyPropfind)return new Response('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>',{status:207});
    return files.has(path)?new Response(xml(url),{status:207}):new Response('',{status:404});
   }
   return new Response(xml(url),{status:files.has(path)?207:404});
  }
  if(method==='MKCOL')return new Response('',{status:201});
  if(method==='GET'){
   const file=files.get(path);if(!file)return new Response('',{status:404});
   if(path===pathOf(cloud.url))logReads++;
   if(headers['If-None-Match']===file.etag)return new Response(null,{status:304});
   return new Response(file.body,{status:200,headers:{ETag:file.etag}});
  }
  if(method==='PUT'){
   const current=files.get(path);
   if(headers['If-Match']&&headers['If-Match']!==current?.etag)return new Response('',{status:412});
   if(headers['If-None-Match']==='*'&&current)return new Response('',{status:412});
   if(path.includes('/_sync-conflicts/'))conflicts.push(JSON.parse(String(body)));
   const next=etag();files.set(path,{body:String(body),etag:next});
   return new Response('',{status:current?204:201,headers:{ETag:next}});
  }
  if(method==='DELETE'){files.delete(path);return new Response('',{status:204});}
  return new Response('',{status:405});
 }
 return {
  fetcher,files,conflicts,
  get logReads(){return logReads;},
  get log(){const file=files.get(pathOf(cloud.url));return file?JSON.parse(file.body):null;},
  failNext(count=1){timeouts=count;},
  clearRemote(){files.delete(pathOf(cloud.url));},
  setEmptyPropfind(value){emptyPropfind=value;}
 };
}

function makeEngine(browser,remote,clock){
 const records=new Map(),cache=new Map();
 return createSyncEngine({
  api:browser.api,
  fetcher:remote.fetcher,
  readRecords:async()=>[...records].map(([key,value])=>({key,value})),
  writeRecords:async entries=>{for(const entry of entries)records.set(entry.key,entry.value);},
  cache:{get:async key=>cache.get(key),put:async(key,value)=>{cache.set(key,value);}},
  now:()=>clock.value++,
  isOnline:()=>true,
  sleep,
  random:()=>0
 });
}

const remote=makeWebDAV();
const clock={value:1000};
const a=makeBrowser('a'),b=makeBrowser('b');
const engineA=makeEngine(a,remote,clock),engineB=makeEngine(b,remote,clock);

await engineA.run({force:true});
assert.equal(a.storage.data.syncStatus.state,'synced');
assert.equal(remote.log?.format,'yius-tab-change-log');
const readsAfterInitial=remote.logReads;
await engineA.run();
assert.equal(a.storage.data.syncStatus.state,'synced');
assert.equal(remote.logReads,readsAfterInitial);
await engineB.run({force:true});
assert.equal(b.storage.data.syncStatus.state,'synced');
assert.equal(b.site().title,'Base title');

a.rename('Edited on browser A');engineA.dirty();
b.rename('Edited on browser B');engineB.dirty();
await engineA.run({force:true});
await engineB.run({force:true});

assert.equal(b.site().title,'Edited on browser B');
assert.equal(b.storage.data.syncStatus.state,'conflict');
assert.equal(b.storage.data.syncStatus.conflictCount,1);
assert.equal(remote.conflicts.length,1);
assert.equal(remote.conflicts[0].local.change.payload.site.title,'Edited on browser B');
assert.equal(remote.conflicts[0].remote.entity.payload.site.title,'Edited on browser A');
assert.equal(remote.log.changes.at(-1).payload.site.title,'Edited on browser A');

remote.setEmptyPropfind(true);
await engineA.run({force:true});
assert.equal(a.site().title,'Edited on browser A');
assert.equal(a.storage.data.syncStatus.state,'error');
assert.equal(a.storage.data.syncStatus.errorKey,'syncIncompleteListing');

remote.setEmptyPropfind(false);
remote.failNext(3);
await engineA.run({force:true});
assert.equal(a.site().title,'Edited on browser A');
assert.equal(a.storage.data.syncStatus.state,'error');
assert.equal(a.storage.data.syncStatus.errorKey,'syncNetworkFailure');
await engineA.run({force:true});
assert.equal(a.storage.data.syncStatus.state,'synced');
assert.equal(a.site().title,'Edited on browser A');

{
 const deletionRemote=makeWebDAV(),deletionClock={value:5000};
 const c=makeBrowser('c'),d=makeBrowser('d');
 const engineC=makeEngine(c,deletionRemote,deletionClock),engineD=makeEngine(d,deletionRemote,deletionClock);
 await engineC.run({force:true});
 await engineD.run({force:true});
 await c.api.bookmarks.remove(c.siteId);engineC.dirty();
 await engineC.run({force:true});
 const tombstone=deletionRemote.log.changes.at(-1);
 assert.equal(tombstone.operation,'delete');
 assert.ok(Number.isFinite(tombstone.payload.deleted_at));
 await engineD.run({force:true});
 assert.equal(d.site(),null);
}

console.log('sync integration tests passed');
