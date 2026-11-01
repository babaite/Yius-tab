import {failure,clone} from '../errors.js';
import {merge,emptyData} from '../../sync/model.js';
export function planSync({local,remote,meta,recovery,resolution,saved}){
let result;
   if(recovery){
    const candidate=[remote.state?.data,remote.state?.previous?.data].find(data=>data&&Object.keys(data.sites).length);
    if(!candidate)throw failure('syncNoRecovery');result={data:clone(candidate),conflicts:[]};
   }else if(local.folderLost&&!local.sites.length&&remote.state&&Object.keys(remote.state.data.sites).length){result={data:clone(remote.state.data),conflicts:[]};}
   else result=remote.state?merge(meta.base||emptyData(),local.data,remote.state.data,resolution&&saved.syncStatus?.conflictRevision===remote.state.revision?resolution:undefined):{data:local.data,conflicts:[]};

   if(!Object.keys(result.data.sites).length&&(Object.keys(meta.base?.sites||{}).length||local.sites.length))throw failure('syncEmptyGuard');

   const urls=new Set(Object.values(result.data.sites).map(s=>s.url));for(const url of Object.keys(result.data.records))if(!urls.has(url))delete result.data.records[url];result.data.order=result.data.order.filter(id=>result.data.sites[id]);
 return result;
}
