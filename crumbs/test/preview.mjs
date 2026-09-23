// Local visual review only. Never included in dist or release assets.
import http from 'node:http';
import {readFileSync} from 'node:fs';
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 try{
  let data,type='text/javascript';
  if(path==='/'){data=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').replace('src="app.js"','src="preview.js"');type='text/html';}
  else if(path==='/preview.js')data="import {start} from './app.js';import {fixture,person} from './fixture.mjs';const p=new URLSearchParams(location.search),role=p.get('role')||'admin';await start(fixture({role,empty:p.has('empty')}).actor,{...person,role:role==='manager'?'viewer':role},{version:'0.6.1 · sample data',hubId:''});";
  else if(path==='/fixture.mjs')data=readFileSync(new URL('./fixture.mjs',import.meta.url));
  else if(/^\/[\w.-]+$/.test(path)){data=readFileSync(new URL('../dist'+path,import.meta.url));if(path==='/app.js')data=data.toString().replace('void boot();','').replace('__BACKEND_CANISTER_ID__','aaaaa-aa');if(path.endsWith('.css'))type='text/css';if(path.endsWith('.svg'))type='image/svg+xml';}
  else throw new Error();res.writeHead(200,{'Content-Type':type});res.end(data);
 }catch{res.writeHead(404);res.end();}
});server.listen(8792,'127.0.0.1',()=>console.log('Local Crumbs sample preview: http://127.0.0.1:8792'));
