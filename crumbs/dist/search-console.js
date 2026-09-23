// Google credentials stay in this browser invocation; only report aggregates are saved.
const scope='https://www.googleapis.com/auth/webmasters.readonly';
let sdk;
export function loadGoogle(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();
 return sdk??=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=resolve;script.onerror=()=>{sdk=null;script.remove();reject(new Error('Google sign-in could not load. Check whether your browser blocks accounts.google.com.'));};document.head.append(script);});
}
export function authorize(clientId){
 if(!window.google?.accounts?.oauth2)return Promise.reject(new Error('Prepare Google sign-in first, then continue.'));
 // requestAccessToken must run synchronously from the user's click, especially in Safari.
 return new Promise((resolve,reject)=>{const client=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope,include_granted_scopes:false,callback:r=>r.error?reject(new Error('Google did not grant read access. Try again or check the OAuth app configuration.')):resolve(r.access_token),error_callback:()=>reject(new Error('Google sign-in was cancelled or the popup was blocked. Allow this sign-in popup and try again.'))});client.requestAccessToken({prompt:''});});
}
const text=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,512);
export function safeSearchText(value){const v=text(value);return /@|eyJ[A-Za-z0-9_-]{15,}|\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/i.test(v)?'(redacted)':v;}
export function searchPath(value,domain){try{const u=new URL(value);if(u.hostname!==domain)return '';return decodeURI(u.pathname).replace(/[^/\s]+@[^/\s]+/g,':email').replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,':id').replace(/\/\d{5,}(?=\/|$)/g,'/:id').replace(/[?#]/g,'_').slice(0,512);}catch{return '';}}
export async function fetchSearchReport({token,site,connection,from,until,includeQueries=false,fetcher=fetch}){
 const iso=n=>new Date(Number(n)*1000).toISOString().slice(0,10),startDate=iso(from),endDate=iso(BigInt(until)-1n);
 const endpoint='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(connection.property)+'/searchAnalytics/query';
 const get=async dimensions=>{const response=await fetcher(endpoint,{method:'POST',credentials:'omit',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate,dimensions,type:'web',dataState:'final',rowLimit:1001})});if(!response.ok)throw new Error(response.status===403?'Google denied access. Verify this property and enable the Search Console API in your Google project.':response.status===401?'Google authorization expired. Connect again.':'Search Console could not return this report ('+response.status+').');return (await response.json()).rows??[];};
 const [totals,queries,pages]=await Promise.all([get([]),includeQueries?get(['query']):[],get(['page'])]);
 const metric=(r,value)=>({value,clicks:BigInt(Math.max(0,Math.round(r?.clicks??0))),impressions:BigInt(Math.max(0,Math.round(r?.impressions??0))),positionMilli:BigInt(Math.max(0,Math.round((r?.position??0)*1000)))});
 // URL variants can normalize to the same path. Merge with impression-weighted position.
 const grouped=new Map();for(const r of pages.slice(0,1000)){const path=searchPath(r.keys?.[0],site.domain);if(!path)continue;const row=metric(r,path),old=grouped.get(path);if(old){const impressions=old.impressions+row.impressions;grouped.set(path,{value:path,clicks:old.clicks+row.clicks,impressions,positionMilli:impressions?(old.positionMilli*old.impressions+row.positionMilli*row.impressions)/impressions:0n});}else grouped.set(path,row);}
 return {site:site.id,property:connection.property,from:BigInt(from),until:BigInt(until),fetchedAt:0n,totals:metric(totals[0],''),queries:queries.slice(0,1000).filter(r=>safeSearchText(r.keys?.[0])!=='(redacted)').map(r=>metric(r,safeSearchText(r.keys?.[0]))),pages:[...grouped.values()],truncated:queries.length>1000||pages.length>1000};
}
