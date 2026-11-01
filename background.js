import {createMessageRouter} from './core/protocol.js';
import './sync/background.js';

let creating,lastTheme;
async function ensureThemeObserver(){
  const url=chrome.runtime.getURL('theme-observer.html');
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[url]});
  if(contexts.length)return;
  if(!creating)creating=chrome.offscreen.createDocument({url:'theme-observer.html',reasons:['MATCH_MEDIA'],justification:'Observe the system color scheme to keep the extension toolbar icon visible.'}).finally(()=>creating=null);
  await creating;
}
async function setTheme(dark){if(lastTheme==='planet')return;lastTheme='planet';const paths=Object.fromEntries([16,32,48,128].map(size=>[size,`icon/icon${size}.png`]));try{await chrome.action.setIcon({path:paths});}catch(error){lastTheme=undefined;throw error;}}
chrome.runtime.onMessage.addListener(createMessageRouter({api:chrome,handlers:{'yiu-theme':async({dark})=>{await setTheme(dark);return {ok:true};}}}));
chrome.runtime.onInstalled.addListener(()=>ensureThemeObserver().catch(()=>{}));
chrome.runtime.onStartup.addListener(()=>ensureThemeObserver().catch(()=>{}));
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('newtab/index.html')}));
ensureThemeObserver().catch(()=>{});

