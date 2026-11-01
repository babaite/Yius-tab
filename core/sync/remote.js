import {failure} from '../errors.js';
import {validateData} from '../../sync/model.js';
import {iconURL} from '../config/settings.js';
import {strong,LIMIT} from '../net/webdav.js';
export function createRemoteStore({request,bytes,versionTag,now}){
 function envelope(data,previous=null){return {format:'yius-tab-sync',schema:1,revision:crypto.randomUUID(),updatedAt:now(),data,previous};}
 function validateEnvelope(value){
  if(value?.format!=='yius-tab-sync'||value.schema!==1||typeof value.revision!=='string')throw failure('syncFormat');validateData(value.data);iconURL(value.data.iconTemplate,'https://example.com/');
  if(value.previous){validateData(value.previous.data);if(typeof value.previous.revision!=='string')throw failure('syncInvalidData');}return value;
 }
 async function readRemote(config,meta){
  const response=await request(config,'GET',config.url,{headers:meta.etag?{'If-None-Match':meta.etag}:{}});
  if(response.status===304){if(!meta.remote)throw failure('syncInvalidData');return {state:meta.remote,etag:meta.etag,unchanged:true};}
  if(response.status===404)return {state:null,etag:null};if(!response.ok)throw failure('syncHTTP',response.status);
  const etag=await versionTag(config,response,config.url);if(!strong(etag))throw failure('syncUnsupported','read-etag');
  let state;try{state=JSON.parse(new TextDecoder().decode(await bytes(response)));}catch{throw failure('syncInvalidData');}
  return {state:validateEnvelope(state),etag};
 }
 async function writeState(config,state,etag){const body=JSON.stringify(state);if(new Blob([body]).size>LIMIT)throw failure('syncTooLarge');const response=await request(config,'PUT',config.url,{body,headers:etag?{'If-Match':etag}:{'If-None-Match':'*'}});if(response.status===412)throw failure('syncRace');if(!response.ok)throw failure('syncHTTP',response.status);let next=response.headers.get('etag');if(!strong(next)){const got=await request(config,'GET');if(!got.ok)throw failure('syncHTTP',got.status);const actual=JSON.parse(new TextDecoder().decode(await bytes(got)));if(actual.revision!==state.revision||stable(actual.maintenance)!==stable(state.maintenance))throw failure('syncRace');next=await versionTag(config,got,config.url);}if(!strong(next))throw failure('syncUnsupported','write-etag');return next;}
 return {envelope,validateEnvelope,readRemote,writeState};
}
