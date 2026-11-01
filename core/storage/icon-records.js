import {sendRequest} from '../protocol.js';

let database;
function open(){if(!database)database=new Promise((resolve,reject)=>{const r=indexedDB.open('bliphome-icons',1);r.onupgradeneeded=()=>r.result.createObjectStore('icons');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return database;}
function changed(){if(globalThis.chrome?.runtime?.id)sendRequest(chrome,'yiu-icons-changed').catch(()=>{});}
export async function dbCached(key){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('icons').objectStore('icons').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function dbStore(key,value){await dbWriteRecords([{key,value}],false);changed();}
export async function dbReadRecords(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('icons'),out=[],r=tx.objectStore('icons').openCursor();r.onsuccess=()=>{const c=r.result;if(c){out.push({key:c.key,value:c.value});c.continue();}};tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);});}
export async function dbWriteRecords(entries,notify=true){const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('icons','readwrite');for(const entry of entries)tx.objectStore('icons').put(entry.value,entry.key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});if(notify)changed();}
