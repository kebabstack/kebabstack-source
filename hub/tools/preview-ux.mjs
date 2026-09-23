// Local fixture server. Never calls or mutates a production backend.
import {createServer} from 'node:http';import{readFile}from'node:fs/promises';import{resolve,extname}from'node:path';import{fileURLToPath}from'node:url';
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));const port=Number(process.env.HUB_PREVIEW_PORT||4181);
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname);let file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+'/'))throw Error('path');let data;
 if(path==='/mobile'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta name=viewport content=width=device-width,initial-scale=1><title>Hub mobile preview</title><style>body{margin:0;background:#e5e9e2;display:grid;place-items:center}iframe{width:390px;height:840px;border:0;background:white}</style><iframe title="Hub at 390 pixels" src="/?mobile=1"></iframe>');return;}
 if(path==='/preview-fixture.js'){file=fileURLToPath(new URL('../test/preview-fixture.js',import.meta.url));data=await readFile(file);}
 else if(path==='/app-signin'){
   const app=url.searchParams.get('app')||'assets';if(!['assets','contracts','desk','forms','trust','watch'].includes(app))throw Error('app');
   file=resolve(root,'../../'+app+'/dist/index.html');let html=await readFile(file,'utf8');
   html=html.replace(/<script[^>]*src=["'][^"']*app\.js["'][^>]*><\/script>/g,'');
   html=html.replace('<head>','<head><base href="/preview-app/'+app+'/">').replace(/(href|src)="\/(?!\/|preview-app)/g,'$1="/preview-app/'+app+'/');
   data=html.replace('</body>','<script type="module">import{appSignIn}from"./hub-client.js";const s=appSignIn({name:'+JSON.stringify(app)+',hubUrl:"https://hub.example.test",navigate:()=>{}});s.ready();document.getElementById("loginBtn").onclick=()=>s.continue();</script></body>');
 }
 else if(path.startsWith('/preview-app/')){const [, ,app,...parts]=path.split('/');if(!['assets','contracts','desk','forms','trust','watch'].includes(app))throw Error('app');const appRoot=resolve(root,'../../'+app+'/dist');file=resolve(appRoot,parts.join('/'));if(!file.startsWith(appRoot+'/'))throw Error('path');data=await readFile(file);}


 else{data=await readFile(file);if(file.endsWith('/index.html')){let html=data.toString();const a=html.lastIndexOf('(async () => {'),b=html.lastIndexOf('</script>');html=html.slice(0,a)+'import("./preview-fixture.js");\n'+html.slice(b);data=html;}}
 res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.md':'text/plain'}[extname(file)]||'application/octet-stream'));res.setHeader('Cache-Control','no-store');res.end(data);
}catch(e){res.statusCode=404;res.end('Not found');}}).listen(port,'127.0.0.1',()=>console.log('Sample-only Hub preview http://127.0.0.1:'+port));
