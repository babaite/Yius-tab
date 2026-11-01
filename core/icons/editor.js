export function createIconEditor({records,store,localIcon,now=()=>Date.now()}){
 async function selectAppStore(site,item){const record=records.get(site.url)||{items:[],time:now()},next={...record,appStore:item,appStoreTime:now()};await store(site.url,next);records.set(site.url,next);}
 async function importImage(site,file){const item=await localIcon(file),record=records.get(site.url)||{items:[],time:now()},next={...record,upload:item};await store(site.url,next);records.set(site.url,next);return item;}
 return {selectAppStore,importImage};
}
