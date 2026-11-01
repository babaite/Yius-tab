export function shortcutModifier(platform=navigator.userAgentData?.platform||navigator.platform||navigator.userAgent){return /mac/i.test(platform)?{glyph:'⌥',label:'Option'}:{glyph:'Alt',label:'Alt'};}
export function installEmptyStateHint(status,{translate,platform}={}){
 if(!status)return;
 const section=document.createElement('section');section.className='empty-state-hint';section.hidden=true;
 status.before(section);section.append(status);
 const hints=document.createElement('div');hints.className='empty-state-shortcuts';hints.hidden=true;section.append(hints);
 function refresh(){
  section.hidden=!status.textContent;hints.hidden=status.dataset.messageKey!=='emptyFolder';
  const modifier=shortcutModifier(platform);const rows=[];
  for(const key of ['shortcutCanvas','shortcutIcon']){
   const row=document.createElement('div');row.className='shortcut-hint';
   const kbd=document.createElement('kbd');kbd.textContent=modifier.glyph;kbd.setAttribute('aria-label',modifier.label);
   const plus=document.createElement('span');plus.className='shortcut-plus';plus.textContent='+';plus.setAttribute('aria-hidden','true');
   const mouse=document.createElementNS('http://www.w3.org/2000/svg','svg');mouse.setAttribute('viewBox','0 0 24 28');mouse.setAttribute('aria-hidden','true');
   const path=document.createElementNS(mouse.namespaceURI,'path');path.setAttribute('d','M12 2a8 8 0 0 0-8 8v8a8 8 0 0 0 16 0v-8a8 8 0 0 0-8-8Zm0 0v9M4 11h8');mouse.append(path);
   const label=document.createElement('span');label.textContent=translate(key);row.append(kbd,plus,mouse,label);rows.push(row);
  }
  hints.replaceChildren(...rows);
 }
 const observer=new MutationObserver(refresh);observer.observe(status,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-message-key']});
 addEventListener('yiu-languagechange',refresh);refresh();
 return {element:section,refresh,destroy(){observer.disconnect();removeEventListener('yiu-languagechange',refresh);section.before(status);section.remove();}};
}
