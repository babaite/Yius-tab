import {failure} from '../errors.js';
import {stable} from '../../sync/model.js';
import {cloudFileURL} from '../config/settings.js';
export function assetRoot(config){const u=new URL(config.url);u.pathname+='.assets/';u.hash='';return u;}
export function assetURL(config,key){const u=assetRoot(config);u.pathname+=key;return u.href;}
export function configKey(config){return stable({protocol:5,url:config.url?cloudFileURL(config.url):config.url,username:config.username||'',password:config.password||''});}
export function checkConfig(config){let u;try{u=new URL(config.url);}catch{throw failure('invalidCloudURL');}if(u.protocol!=='https:'||u.username||u.password||u.hash)throw failure('invalidCloudURL');if((config.username||config.password)&&!config.remember)throw failure('syncRemember');}
