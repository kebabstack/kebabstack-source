/** Local UI preview using synthetic records only. Never contacts Brex or a live canister. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const port=4217,root=resolve('contracts/dist');
const smoke=await readFile('contracts/test/smoke.mjs','utf8');
let fixture=smoke.slice(smoke.indexOf('const now ='),smoke.indexOf('const dom =')).replace('process.argv[2] || "admin"','"admin"').replaceAll('orgName: "Acme"','orgName: "Synthetic preview"');
fixture+=await readFile('contracts/test/brex-preview-fixture.js','utf8');
const server=createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
 const path=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
 if(path==='/preview-fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
 if(path==='/agent-bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('contracts/test/agent-bundle.stub.js'));return;}
 const file=path==='/'?'index.html':decodeURIComponent(path).slice(1);if(!/^[a-zA-Z0-9_.\/-]+$/.test(file)||file.split('/').includes('..')){res.writeHead(404).end();return;}
 let body=await readFile(resolve(root,file));
 if(file==='index.html')body=body.toString().replace('<script type="module" src="./app.js"></script>','<script type="module">await import("./preview-fixture.js");await import("./app.js");</script>');
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.md':'text/plain'})[extname(file)]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404).end();}});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic Contracts preview: http://127.0.0.1:${port}/#/payments`));
