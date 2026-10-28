// Local visual review only. Never included in dist or release assets.
import http from 'node:http';
import {readFileSync} from 'node:fs';
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 try{
  let data,type='text/javascript';
  if(path==='/'){data=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').replace('src="app.js"','src="preview.js"');type='text/html';}
  else if(path==='/consent-demo'){data='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Consent test · sample website</title><h1>Sample website</h1><p>Local consent test. No production analytics.</p><link rel="stylesheet" href="/consent.css"><script defer src="/tracker.js" data-site="demo" data-mode="cookie" data-endpoint="/demo-events"></script><script defer src="/consent.js" data-site="demo" data-privacy-url="/consent.html"></script>';type='text/html';}
  else if(path==='/demo-events'){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"local preview does not store analytics"}');return;}
  else if(path==='/preview.js')data="import {start} from './app.js';import {fixture,person} from './fixture.mjs';const p=new URLSearchParams(location.search),role=p.get('role')||'admin';const f=fixture({role,empty:p.has('empty'),history:p.has('history'),many:p.has('many')});if(p.has('large'))for(const method of ['report','goalRows','goalReport','funnel','journeys']){f.actor[method+'Full']=f.actor[method];f.actor[method]=async()=>({err:{capacity:'Report exceeds 50000 events. Use the full report endpoint; totals were not sampled.'}});}await start(f.actor,{...person,role:role==='manager'?'viewer':role},{version:'"+version+" · sample data',hubId:''});";
  else if(path==='/fixture.mjs')data=readFileSync(new URL('./fixture.mjs',import.meta.url));
  else if(/^\/[\w.-]+$/.test(path)){data=readFileSync(new URL('../dist'+path,import.meta.url));if(path==='/app.js')data=data.toString().replace('void boot();','').replace('__BACKEND_CANISTER_ID__','aaaaa-aa');if(path.endsWith('.html'))type='text/html';if(path.endsWith('.css'))type='text/css';if(path.endsWith('.svg'))type='image/svg+xml';}
  else throw new Error();res.writeHead(200,{'Content-Type':type});res.end(data);
 }catch{res.writeHead(404);res.end();}
});const port=Number(process.env.PORT||8792);server.listen(port,'127.0.0.1',()=>console.log('Local Crumbs sample preview: http://127.0.0.1:'+port));
