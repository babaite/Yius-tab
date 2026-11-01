import {dbCached,dbStore,dbReadRecords,dbWriteRecords} from './icon-db.js';
export async function cached(key){return dbCached(key);}
export async function store(key,value){return dbStore(key,value);}
export async function readRecords(){return dbReadRecords();}
export async function writeRecords(entries){return dbWriteRecords(entries);}
export {iconDeclarations} from '../../core/icons/metadata.js';
export {imageInfo,normalizeIcon,download,localIcon,fallbackColor} from '../../core/icons/codec.js';
export {googleProduct,officialIconURLs} from '../../core/icons/official.js';
export {discover} from '../../core/icons/website.js';
export {appStoreMatches} from '../../core/icons/app-store.js';
