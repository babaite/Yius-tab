import {sendRequest} from '../../core/protocol.js';
let schemeQuery;
export function updateThemeIcons(){
  if(!schemeQuery){schemeQuery=matchMedia('(prefers-color-scheme: dark)');schemeQuery.addEventListener('change',()=>updateThemeIcons());}
  const override=document.documentElement.dataset.theme;
  const dark=override==='dark'||(override!=='light'&&schemeQuery.matches);
  const link=document.getElementById('tab-favicon');
  if(link){const next=override==='dark'?link.dataset.dark:override==='light'?link.dataset.light:link.dataset.system||link.dataset.light;
   if(link.getAttribute('href')!==next){link.type=override==='dark'||override==='light'?'image/png':'image/svg+xml';link.href=next;}}
  document.documentElement.dataset.iconTheme=dark?'moon':'earth';
  updateConfirmationContrast();
  if(globalThis.chrome?.runtime?.id)sendRequest(chrome,'yiu-theme',{dark}).catch(()=>{});
}

function updateConfirmationContrast(){
  const button=document.querySelector('.save-button');if(!button)return;
  const rgb=getComputedStyle(button).backgroundColor.match(/[\d.]+/g)?.slice(0,3).map(Number);if(!rgb||rgb.length<3)return;
  const luminance=values=>values.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const bg=luminance(rgb),ink=luminance([15,23,37]);
  button.style.setProperty('--confirm-icon-color',(1.05/(bg+.05))>=((bg+.05)/(ink+.05))?'#ffffff':'#0f1725');
}
