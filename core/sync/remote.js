import {failure} from '../errors.js';
import {validateData} from '../../sync/model.js';
import {iconURL} from '../config/settings.js';
import {strong} from '../net/webdav.js';
import {
  CHANGE_LOG_FORMAT,
  CHANGE_LOG_SCHEMA,
  logFromSnapshot,
  newULID,
  validateChangeLog
} from './change-log.js';

export const CHANGE_LOG_LIMIT=12*1024*1024;

export function conflictDirectory(config){
 const url=new URL('_sync-conflicts/',config.url);
 url.hash='';
 return url;
}

export function createRemoteStore({request,bytes,readTag,now=()=>Date.now()}){
 function emptyLog(){const time=now();return {format:CHANGE_LOG_FORMAT,schema:CHANGE_LOG_SCHEMA,log_id:newULID(time),created_at:time,documents:{settings:newULID(time+1),order:newULID(time+2)},changes:[]};}

 async function decodeLog(response,device_id){
  let value;
  try{value=JSON.parse(new TextDecoder().decode(await bytes(response,CHANGE_LOG_LIMIT)));}catch{throw failure('syncInvalidData','change-log-json');}
  if(value?.format==='yius-tab-sync'&&value.schema===1){
   validateData(value.data);iconURL(value.data.iconTemplate,'https://example.com/');
   return {log:await logFromSnapshot(value.data,{device_id}),migrated:true};
  }
  return {log:validateChangeLog(value),migrated:false};
 }

 async function readLog(config,device_id,knownEtag){
  const etag=knownEtag!==undefined?knownEtag:await readTag(config);
  if(!etag)return {log:null,etag:null,missing:true,migrated:false};
  const response=await request(config,'GET',config.url,{limit:CHANGE_LOG_LIMIT});
  if(response.status===404)return {log:null,etag:null,missing:true,migrated:false};
  if(!response.ok)throw failure('syncHTTP',response.status);
  const decoded=await decodeLog(response,device_id);
  return {etag,...decoded};
 }

 async function writeLog(config,log,etag){
  validateChangeLog(log);
  const body=JSON.stringify(log);
  if(new Blob([body]).size>CHANGE_LOG_LIMIT)throw failure('syncTooLarge');
  const response=await request(config,'PUT',config.url,{body,headers:etag?{'If-Match':etag}:{'If-None-Match':'*'}});
  if(response.status===412)throw failure('syncRace');
  if(!response.ok)throw failure('syncHTTP',response.status);
  let next=response.headers.get('etag');
  if(!strong(next))next=await readTag(config);
  if(!strong(next))throw failure('syncUnsupported','write-etag');
  return next;
 }

 async function writeConflict(config,conflict,device_id){
  const directory=conflictDirectory(config);
  const directoryResponse=await request(config,'MKCOL',directory.href);
  if(![201,204,301,405].includes(directoryResponse.status))throw failure('syncFolder',directoryResponse.status);
  const id=newULID(now());
  const target=new URL(encodeURIComponent(id)+'.json',directory);
  const body=JSON.stringify({format:'yius-tab-conflict',schema:1,id,device_id,detected_at:now(),...conflict});
  const response=await request(config,'PUT',target.href,{body,headers:{'If-None-Match':'*'},limit:CHANGE_LOG_LIMIT});
  if(![200,201,204].includes(response.status))throw failure('syncHTTP',response.status);
  return target.href;
 }

 async function testConnection(config){
  const started=performance.now();
  try{
   const etag=await readTag(config,config.url,{allowDisabled:true});
   return {reachable:true,latencyMs:Math.round(performance.now()-started),hasRemoteFile:Boolean(etag)};
  }catch(error){
   return {reachable:false,latencyMs:Math.round(performance.now()-started),errorKey:error.uiKey||error.message||'syncNetworkFailure'};
  }
 }

 return {emptyLog,readLog,writeLog,writeConflict,testConnection};
}
