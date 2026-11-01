const MARKER_ROOT='https://yius-tab.invalid/folder/';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function markerIdentity(node){const value=node?.url;if(typeof value!=='string'||!value.startsWith(MARKER_ROOT))return null;const id=value.slice(MARKER_ROOT.length);return UUID.test(id)?id.toLowerCase():null;}
export function isFolderMarker(node){return Boolean(markerIdentity(node));}
function folders(nodes){const out=[];for(const node of nodes||[]){if(!node.url){out.push(node);out.push(...folders(node.children));}}return out;}
export function findFolder(nodes,preferredID,identity){
 const all=folders(nodes),marked=all.filter(n=>!n.folderType&&(n.children||[]).some(c=>markerIdentity(c)===identity&&identity));
 if(marked.length)return marked.find(n=>n.id===preferredID)||marked[0];
 const preferred=preferredID&&all.find(n=>n.id===preferredID&&!n.folderType);if(preferred)return preferred;
 if(!identity){const candidates=all.filter(n=>!n.folderType&&(n.children||[]).some(isFolderMarker));if(candidates.length===1)return candidates[0];}
 return null;
}
async function ensure(api){
 const saved=await api.storage.local.get(['managedFolderId','managedFolderIdentity','managedFolderInitialized','managedFolderNameVersion','prefs','order','syncState']);
 const tree=await api.bookmarks.getTree();let folder=findFolder(tree,saved.managedFolderId,saved.managedFolderIdentity);
 if(!folder&&!saved.managedFolderInitialized){

  const ids=new Set([...Object.keys(saved.prefs||{}),...(saved.order||[]),...Object.keys(saved.syncState?.idMap||{})]);
  const legacy=folders(tree).filter(n=>!n.folderType&&['new tab',"yiu's tab"].includes(n.title?.toLowerCase()));
  folder=legacy.find(n=>(n.children||[]).some(c=>ids.has(c.id)))||((ids.size||saved.syncState?.base)&&legacy.length===1?legacy[0]:null);
 }
 let identity=saved.managedFolderIdentity||(folder?.children||[]).map(markerIdentity).find(Boolean)||crypto.randomUUID();
 if(!folder){
  if(saved.managedFolderInitialized)await api.storage.local.set({managedFolderLost:true});
  const roots=(tree[0]?.children||[]).filter(n=>!n.url&&!n.unmodifiable);
  const other=roots.filter(n=>n.folderType==='other').sort((a,b)=>Number(b.syncing===false)-Number(a.syncing===false))[0]||roots.find(n=>n.id==='2');

  folder=await api.bookmarks.create({...(other?{parentId:other.id}:{}),title:"Yiu's tab"});folder={...folder,children:[]};
 }
 if(!saved.managedFolderNameVersion&&folder.title==='New tab'&&api.bookmarks.update){await api.bookmarks.update(folder.id,{title:"Yiu's tab"});folder={...folder,title:"Yiu's tab"};}

 if(saved.managedFolderId!==folder.id||saved.managedFolderIdentity!==identity||!saved.managedFolderInitialized||!saved.managedFolderNameVersion)await api.storage.local.set({managedFolderId:folder.id,managedFolderIdentity:identity,managedFolderInitialized:true,managedFolderNameVersion:1});
 if(!(folder.children||[]).some(n=>markerIdentity(n)===identity)){
  const marker=await api.bookmarks.create({parentId:folder.id,title:'Yiu’s tab · ID '+identity,url:MARKER_ROOT+identity});folder={...folder,children:[...(folder.children||[]),marker]};
 }
 return folder;
}
export async function ensureManagedFolder(api=chrome){

 return globalThis.navigator?.locks? navigator.locks.request('yius-tab-managed-folder',()=>ensure(api)):ensure(api);
}
