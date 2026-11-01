export function googleProduct(pageURL){
 const u=new URL(pageURL),host=u.hostname.toLowerCase(),google=/^(?:www\.)?google\.(?:com|com\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2})$/.test(host);
 if(host==='mail.google.com')return 'gmail';
 if(host==='maps.google.com'||google&&/^\/maps(?:\/|$)/.test(u.pathname))return 'maps';
 if(host==='gemini.google.com')return 'gemini';
 if(host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtu.be')return 'youtube';
 if(google&&/^\/(?:search|webhp)?\/?$/.test(u.pathname))return 'google';
 return null;
}
export function officialIconURLs(pageURL){
 const assets={
  gmail:['https://www.gstatic.com/images/branding/productlogos/gmail_2026/v2/web/192px.svg'],
  maps:['https://www.gstatic.com/images/branding/productlogos/maps_2025/v1/web-96dp/logo_maps_2025_color_2x_web_96dp.png'],
  gemini:['https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg'],
  youtube:['https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png'],
  google:['https://www.gstatic.com/images/branding/product/2x/googleg_96dp.png']
 };return assets[googleProduct(pageURL)]||[];
}
