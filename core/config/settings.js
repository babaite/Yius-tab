export const DEFAULT_ICON_TEMPLATE='https://www.google.com/s2/favicons?domain={domain}&sz={size}';
export function iconURL(template,pageURL){
  if(typeof template!=='string'||template.length>2048||!/(\{domain\}|\{url\})/.test(template))throw new Error('invalidTemplate');
  const page=new URL(pageURL);if(!['http:','https:'].includes(page.protocol))throw new Error('invalidTemplate');
  const result=template.replaceAll('{domain}',encodeURIComponent(page.hostname)).replaceAll('{url}',encodeURIComponent(page.href)).replaceAll('{size}','256');
  const url=new URL(result);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||/[{}]/.test(result))throw new Error('invalidTemplate');return url.href;
}
export async function thirdPartyURL(pageURL){const {settings}=await chrome.storage.local.get('settings');return iconURL(settings?.iconTemplate||DEFAULT_ICON_TEMPLATE,pageURL);}

export function cloudFileURL(value){const url=new URL(value);if(url.hostname==='dav.jianguoyun.com'&&['/dav','/dav/','/dav/yius-tab.json'].includes(url.pathname))url.pathname='/dav/YiusTab/yius-tab.json';else if(url.pathname.endsWith('/'))url.pathname+='yius-tab.json';return url.href;}
