import {webURL} from './transport.js';

export function iconDeclarations(html,pageURL){
  const tags=/<!--[\s\S]*?(?:-->|$)|<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi;
  const attributes=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const rawText=new Set(['script','style','textarea','title','xmp','iframe','noembed','noscript']);
  const decoder=document.createElement('textarea');
  const decode=value=>{decoder.innerHTML=value.replaceAll('<','&lt;');return decoder.value;};
  let base=pageURL,hasBase=false,tag;const links=[];
  while((tag=tags.exec(html))){
    if(!tag[1])continue;const name=tag[1].toLowerCase();
    if(rawText.has(name)){const closing=new RegExp('</'+name+'\\s*>','ig');closing.lastIndex=tags.lastIndex;const match=closing.exec(html);if(!match)break;tags.lastIndex=closing.lastIndex;continue;}
    if(name!=='base'&&name!=='link')continue;
    const attrs=new Map();attributes.lastIndex=0;let attr;
    while((attr=attributes.exec(tag[2]))){const key=attr[1].toLowerCase();if(!attrs.has(key))attrs.set(key,decode(attr[2]??attr[3]??attr[4]??''));}
    if(name==='base'&&!hasBase&&attrs.has('href')){base=webURL(attrs.get('href'),pageURL)||pageURL;hasBase=true;}
    if(name==='link'&&attrs.has('href')&&attrs.has('rel'))links.push({rel:attrs.get('rel').toLowerCase().split(/\s+/),href:attrs.get('href'),sizes:attrs.get('sizes')||''});
  }
  return {base,links};
}
