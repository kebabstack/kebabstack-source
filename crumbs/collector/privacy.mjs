import {createHmac, randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
export const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function cleanText(value, max=160) {
  if (typeof value !== 'string') return '';
  const s=value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max);
  return /[^\s/@]+@[^\s/]+\.[^\s/]+|eyJ[A-Za-z0-9_-]{15,}/.test(s) ? '(redacted)' : s;
}
export function pathOnly(url) {
  let path=decodeURI(url.pathname);
  path=path.replace(/[^/\s]+@[^/\s]+\.[^/\s]+/g,':email')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,':id')
    .replace(/\/\d{5,}(?=\/|$)/g,'/:id');
  // Never retain decoded query/fragment delimiters or control characters.
  return cleanText(path.replace(/[?#]/g,'_'),512);
}
export function clientIp(req,trustedProxies=[]) {
  let peer=req.socket.remoteAddress || '';
  if(peer.startsWith('::ffff:')) peer=peer.slice(7);
  if(trustedProxies.includes(peer)) {
    const forwarded=req.headers['x-crumbs-client-ip'];
    if(typeof forwarded!=='string' || !isIP(forwarded)) throw Object.assign(new Error('Trusted proxy must overwrite X-Crumbs-Client-IP'),{status:400});
    return forwarded;
  }
  if(!isIP(peer)) throw Object.assign(new Error('Client address unavailable'),{status:400});
  return peer;
}
export function browser(ua) {
  const name=/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Firefox\//.test(ua)?'Firefox':/Chrome\/|CriOS\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
  const os=/Android/.test(ua)?'Android':/iPhone|iPad|iPod/.test(ua)?'iOS':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Other';
  return {browser:name,os,device:/iPad|Tablet/.test(ua)?'Tablet':/Mobi|iPhone|Android/.test(ua)?'Mobile':'Desktop'};
}
export const isBot=ua=>/bot\b|spider|crawler|HeadlessChrome|curl\/|wget\/|python-requests/i.test(ua);
export function normalize(input,site,{ip,ua,salt,now,geo={}}) {
  const url=new URL(input.url??input.u);
  if(!['https:','http:'].includes(url.protocol)||url.hostname!==site.domain||url.username||url.password) throw new TypeError('URL does not match the registered website');
  if(geo.isHostingProvider===true)return null;
  const path=pathOnly(url);
  if(site.excludedPaths.some(p=>path.startsWith(p))) return null;
  const kind=input.kind??((input.name??input.n)==='pageview'?'pageview':'event');
  if(!['pageview','event','engagement'].includes(kind)) throw new TypeError('Unknown event kind');
  const props=input.props??input.p??{};
  if(!props||typeof props!=='object'||Array.isArray(props)||Object.keys(props).length>20) throw new TypeError('Invalid event properties');
  for(const [key,value] of Object.entries(props)) if(!site.allowedProperties.includes(key)||!['string','number','boolean'].includes(typeof value)) throw new TypeError('Property is not allowed: '+key);
  let source='';
  try{const ref=new URL(input.referrer??input.r??'');if(['http:','https:'].includes(ref.protocol)&&ref.hostname!==site.domain)source=ref.hostname;}catch{}
  const campaign=key=>cleanText(url.searchParams.get(key)??'');
  source=campaign('utm_source')||campaign('ref')||campaign('source')||source;
  if(['semalt.com','darodar.com','buttons-for-website.com'].some(d=>source.toLowerCase()===d||source.toLowerCase().endsWith('.'+d)))return null;
  const revenue=Number(input.revenueMinor??0), engagement=Number(input.engagementMs??0),scroll=Number(input.scrollDepth??0);
  if(!Number.isSafeInteger(revenue)||revenue<0||revenue>1e12||!Number.isSafeInteger(engagement)||engagement<0||engagement>3_600_000||!Number.isSafeInteger(scroll)||scroll<0||scroll>100)throw new TypeError('Invalid measurement');
  const currency=String(input.currency??'');if(currency!==''&&!/^[A-Z]{3}$/.test(currency))throw new TypeError('Use ISO currency code');
  if(revenue>0&&!currency)throw new TypeError('Revenue requires a currency');
  const name=kind==='event'?cleanText(input.name??input.n??''):'';if(kind==='event'&&!name)throw new TypeError('Event name is required');
  const id=input.id??randomUUID();if(!identifier(id))throw new TypeError('Invalid event id');
  return {id,site:site.id,visitor:createHmac('sha256',salt).update(JSON.stringify([site.id,ip,ua])).digest('hex'),at:now,order:0,
    kind:{[kind]:null},path,hostname:url.hostname,source,medium:campaign('utm_medium'),campaign:campaign('utm_campaign'),content:campaign('utm_content'),term:campaign('utm_term'),
    country:/^[A-Z]{2}$/.test(geo.country??'')?geo.country:'',region:cleanText(geo.region??''),city:cleanText(geo.city??''),...browser(ua),name,
    props:Object.entries(props).map(([k,v])=>[k,cleanText(String(v))]),interactive:input.interactive!==false,
    revenueMinor:kind==='event'?revenue:0,currency:kind==='event'?currency:'',engagementMs:kind==='engagement'?engagement:0,scrollDepth:kind==='engagement'?scroll:0};
}
