/** Local-only integration preview. All records are synthetic; no production credentials. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PocketIcServer} from '@dfinity/pic';
import {setup,key,unwrap,projectInput,taskInput} from '../../tests/helpers/workboard.mjs';
if(!process.env.KEBAB_WORKBOARD_PREVIEW_CHILD){const child=fork(fileURLToPath(import.meta.url),[],{env:{...process.env,KEBAB_WORKBOARD_PREVIEW_CHILD:'1'},stdio:'inherit'});process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));process.exit(await new Promise(r=>child.once('exit',c=>r(c||0))));}
const previewRole=process.env.KEBAB_PREVIEW_ROLE==='owner'?'owner':'alpha';
const port=Number(process.env.KEBAB_PREVIEW_PORT||4204),origin=`http://127.0.0.1:${port}`,server=await PocketIcServer.start(),x=await setup(server.getUrl()),d=x.apps.desk.app;
const p=unwrap(await d.saveWorkProject(x.tokens.alpha,0n,0n,key(1),projectInput));
const examples=[['Validate meeting room Wi-Fi','planned','','2026-10-02'],['Install the access points','active','','2026-10-01'],['Confirm the switch delivery','waiting','Supplier confirmation','2026-10-02'],['Agree the maintenance window','done','','2026-09-29']];
for(const [i,[title,column,waitingFor,dueOn]] of examples.entries())unwrap(await d.saveWorkTask(x.tokens.alpha,0n,0n,key(10+i),{...taskInput(p.id,x.ids.alpha),title,column:{[column]:null},waitingFor,dueOn}));
let rev=unwrap(await d.linkWorkItem(x.tokens.alpha,p.id,p.revision,{ticket:x.ticketId},true));unwrap(await d.linkWorkItem(x.tokens.alpha,p.id,rev.revision,{sale:{cid:x.apps.assets.conn.id,id:x.saleId}},true));
const first=(await d.workboardTask(x.tokens.alpha,1n))[0];unwrap(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,1n,first.task.revision,key(900),first.task,[{id:0n,title:'Measure signal in meeting room A',done:true},{id:0n,title:'Check calls in meeting room B',done:false},{id:0n,title:'Confirm guest network isolation',done:false}]));
const [assignment]=await d.getAutoAssignment(x.tokens.owner);await d.saveAutoAssignment(x.tokens.owner,{...assignment.config,defaultAssignee:x.ids.alpha,overrides:[]});
await d.saveWorkboardPreferences(x.tokens[previewRole],{projectId:[p.id],mine:false,tickets:true,sales:true,completed:true});
const serialize=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?{$bigint:String(x)}:x),parse=s=>JSON.parse(s,(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.$bigint==='string'?BigInt(v.$bigint):v);
const allowed=new Set(['getAutoAssignment','saveAutoAssignment','autoAssignmentHealth','saveWorkTaskWithSubtasks','getTicket','personOverview','personContextSources','personContext','offboardingHardware','profilePictures','listTickets','myTickets','myApprovals','stats','lifecycleHealth','setStatus','assign','whoami','agents','directory','catalog','workboardHome','saveWorkboardPreferences','workboardProject','saveWorkProject','archiveWorkProject','workboardTasks','workboardTask','saveWorkTask','archiveWorkTask','workboardTickets','workboardSources','workboardSales','linkWorkItem']);
const proxy=`export const HttpAgent={create:async()=>({})};export const Actor={createActor:()=>new Proxy({}, {get:(_,method)=>async(...args)=>{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args},(_,v)=>typeof v==='bigint'?{$bigint:String(v)}:v)});if(!response.ok)throw Error('Local preview request failed');return JSON.parse(await response.text(),(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&typeof v.$bigint==='string'?BigInt(v.$bigint):v);}})};`;
const root=resolve('desk/dist'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.md':'text/plain'};
const http=createServer(async(req,res)=>{try{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403).end();return;}
 res.setHeader('Cache-Control','no-store');
 const path=(req.url||'/').split('?')[0];
 if(path==='/rpc'&&req.method==='POST'){
  if(req.headers.origin!==origin){res.writeHead(403).end();return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>32000){res.writeHead(413).end();return;}}
  const {method,args}=parse(body);if(!Array.isArray(args)){res.writeHead(400).end();return;}
  let result;
  if(method==='info')result={hubId:'',hubSet:true,orgName:'Example company · synthetic preview',appUrl:''};
  else if(method==='profilePictures')result=[];
  else if(method==='signOut')result=true;
  else if(!allowed.has(method)){res.writeHead(403).end();return;}
  else {result=await d[method](x.tokens[previewRole],...args.slice(1));if(method==='whoami')result=result.map(person=>({...person,orgName:'Example company · synthetic preview'}));}
  res.setHeader('Content-Type','application/json');res.end(serialize(result));return;
 }
 if(path==='/agent-bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(proxy);return;}
 const file=decodeURIComponent(path==='/'?'/index.html':path).slice(1);if(!/^[a-zA-Z0-9_.\/-]+$/.test(file)||file.split('/').includes('..')){res.writeHead(404).end();return;}
 let content=await readFile(resolve(root,file));
 if(file==='index.html')content=content.toString().replace('<head>','<head><script>localStorage.setItem("ks-desk-session","local-preview");if(!location.hash)location.hash="#/workboard/1";</script>');
 res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(content);
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>http.listen(port,'127.0.0.1',r));console.log('Synthetic integration preview: '+origin+'/#/workboard/1');
let refreshing=false;const timer=setInterval(async()=>{if(refreshing)return;refreshing=true;try{await x.pic.advanceTime(15000);await x.pic.tick(3);await x.refresh();}finally{refreshing=false;}},15000);
async function close(){clearInterval(timer);http.close();await x.pic.tearDown();await server.stop();process.exit(0);}process.on('SIGINT',close);process.on('SIGTERM',close);
