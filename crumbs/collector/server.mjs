import http from 'node:http';
import {readFileSync,writeFileSync,existsSync,mkdirSync,realpathSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHmac,randomUUID} from 'node:crypto';
import {Actor,HttpAgent} from '@icp-sdk/core/agent';
import {Ed25519KeyIdentity} from '@icp-sdk/core/identity';
import {idlFactory} from '../dist/idl.js';
import {Store,flush} from './store.mjs';
import {normalize,clientIp,isBot,identifier} from './privacy.mjs';
import {api} from './api.mjs';
import {deadlineActor,rpcFetch} from './transport.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v);
async function body(req){let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>48*1024)throw Object.assign(new Error('Request exceeds 48 KiB'),{status:413});chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}}
export function createCollector({actor,store,trustedProxies=[],lookup=()=>({}),now=()=>Math.floor(Date.now()/1000),tracker=readFileSync(join(here,'../dist/tracker.js')),openapi=()=>readFileSync(join(here,'../dist/openapi.json'))}){
  actor=deadlineActor(actor);
  let sites=[],loadedAt=-Infinity,refreshing,flushing=false,lastError='Waiting for backend connectivity',lastSuccess=0;
  const rates=new Map();let rateMinute=-1;
  async function loadSites(){if(now()-loadedAt<15)return;if(!refreshing)refreshing=actor.collectorSites().then(s=>{sites=s;loadedAt=now();}).finally(()=>{refreshing=null;});await refreshing;}
  async function drain(){if(flushing)return;flushing=true;try{await loadSites();await flush(store,actor);lastSuccess=now();lastError='';store.maintain(now());}catch{lastError='Backend delivery unavailable';}finally{flushing=false;}}
  const server=http.createServer(async(req,res)=>{
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(json(data));};
    try{
      const url=new URL(req.url,'http://collector.local');
      if(req.method==='GET'&&url.pathname==='/tracker.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end(tracker);return;}
      if(req.method==='GET'&&url.pathname==='/openapi.json'){res.writeHead(200,{'Content-Type':'application/json'});res.end(openapi());return;}
      if(req.method==='GET'&&url.pathname==='/healthz'){send(lastError?503:200,{ready:!lastError});return;}
      if(url.pathname==='/api/event'||url.pathname==='/api/v1/events'){
        if(req.method==='OPTIONS'){await loadSites();const origin=req.headers.origin;let allowed=false;try{allowed=sites.some(s=>new URL(origin).hostname===s.domain&&new URL(origin).protocol==='https:');}catch{}if(!allowed){send(403,{error:'origin_not_allowed'});return;}send(204,null,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'});return;}
        if(req.method!=='POST'){send(405,{error:'method_not_allowed'});return;}
        await loadSites();
        const input=await body(req),batch=Array.isArray(input)?input:[input];if(!batch.length||batch.length>50)throw Object.assign(new Error('Send 1–50 events'),{status:400});
        const ip=clientIp(req,trustedProxies),ua=String(req.headers['user-agent']??'').slice(0,1024),time=now(),salt=store.salt(time);
        if(rateMinute!==Math.floor(time/60)){rates.clear();rateMinute=Math.floor(time/60);}
        const rateKey=createHmac('sha256',salt).update(ip).digest('hex');
        if(!rates.has(rateKey)&&rates.size>=10000|| (rates.get(rateKey)??0)+batch.length>300){send(429,{error:'rate_limited'},{'Retry-After':'60'});return;}
        rates.set(rateKey,(rates.get(rateKey)??0)+batch.length);
        let queued=0,ignored=0;const records=[];
        for(const raw of batch){
          if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Event must be an object');
          const site=sites.find(s=>s.id===raw.site||(!raw.site&&s.domain===(raw.domain??raw.d)));
          if(!site||!site.enabled)throw Object.assign(new Error('Unknown or paused site'),{status:404});
          if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.hostname!==site.domain||!['http:','https:'].includes(origin.protocol))throw Object.assign(new Error('Origin does not match website'),{status:403});res.setHeader('Access-Control-Allow-Origin',origin.origin);res.setHeader('Vary','Origin');}
          if(isBot(ua)||req.headers['sec-gpc']==='1'){ignored++;continue;}
          const id=raw.id??randomUUID();if(!identifier(id))throw new TypeError('Invalid event id');
          const prior=store.get(site.id,id);
          if(prior){if(prior.state==='rejected')throw Object.assign(new Error('Event previously rejected; inspect collector health'),{status:422});queued++;continue;}
          const record=normalize({...raw,id},site,{ip,ua,salt,now:time,geo:lookup(ip)});
          if(record)records.push(record);else ignored++;
        }
        for(const record of records){store.put(record);queued++;}
        send(202,{queued,ignored,durability:'collector',delivery:'asynchronous'});void drain();return;
      }
      const token=/^Bearer ([^\s]+)$/.exec(req.headers.authorization??'')?.[1]??'';
      if(url.pathname==='/api/v1/collector-health'&&req.method==='GET'){
        const auth=await actor.health(token);if('err'in auth){send(403,{error:'unauthorized'});return;}
        send(200,{pending:store.count('pending'),rejected:store.count('rejected'),oldestPendingAt:store.oldestPending(),lastSuccess,lastError});return;
      }
      const data=['POST','PUT','PATCH'].includes(req.method)?await body(req):null;
      const result=await api(actor,req.method,url.pathname,token,data,url.searchParams);send(200,result);
    }catch(error){const status=error.status??(error instanceof TypeError||error instanceof SyntaxError||error instanceof RangeError?400:503);send(status,{error:status<500&&typeof error.code==='string'?error.code:(status<500?'invalid_request':'service_unavailable'),message:status<500?error.message:'Service unavailable; retry with the same event id'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxRequestsPerSocket=100;
  const timer=setInterval(()=>void drain(),2000);timer.unref();server.on('close',()=>clearInterval(timer));
  return {server,drain};
}
export async function start(){
  const directory=resolve(process.env.CRUMBS_DATA_DIR??'./data');mkdirSync(directory,{recursive:true,mode:0o700});
  const identityFile=join(directory,'identity.json');let identity;
  if(existsSync(identityFile))identity=Ed25519KeyIdentity.fromJSON(readFileSync(identityFile,'utf8'));
  else{identity=Ed25519KeyIdentity.generate();writeFileSync(identityFile,JSON.stringify(identity.toJSON()),{mode:0o600,flag:'wx'});}
  if(process.argv.includes('--principal')){process.stdout.write(identity.getPrincipal().toText()+'\n');return;}
  if(!process.env.CRUMBS_CANISTER_ID)throw new Error('CRUMBS_CANISTER_ID is required');
  const host=process.env.CRUMBS_IC_HOST??'https://icp-api.io';
  const rootKey=process.env.CRUMBS_ROOT_KEY_FILE?new Uint8Array(readFileSync(process.env.CRUMBS_ROOT_KEY_FILE)):undefined;
  const agent=await HttpAgent.create({host,identity,fetch:rpcFetch,retryTimes:0,...(rootKey?{rootKey}:{})});
  const actor=Actor.createActor(idlFactory,{agent,canisterId:process.env.CRUMBS_CANISTER_ID});
  const {loadNetworkLookup}=await import('./network.mjs');
  const lookup=await loadNetworkLookup({geoPath:process.env.CRUMBS_GEO_DB,networkPath:process.env.CRUMBS_NETWORK_DB});
  const store=new Store(directory);
  const {server}=createCollector({actor,store,lookup,trustedProxies:(process.env.CRUMBS_TRUSTED_PROXIES??'').split(',').filter(Boolean)});
  server.listen(Number(process.env.PORT??8788),process.env.HOST??'127.0.0.1',()=>process.stdout.write('Crumbs collector listening; principal '+identity.getPrincipal().toText()+'\n'));
  const stop=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&existsSync(process.argv[1])&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href)start().catch(()=>{process.stderr.write('Crumbs collector startup failed. Check configuration, identity and local files.\n');process.exitCode=1;});
