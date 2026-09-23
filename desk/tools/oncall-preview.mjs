/** Disposable, loopback-only preview backed by real local Hub/Desk Wasm.
 * Synthetic people only. Requires mops builds for hub and desk, then run:
 *   node desk/tools/oncall-preview.mjs
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFileSync,fork} from 'node:child_process';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
import {generateRegionalPlan} from '../dist/oncall-regional.js';
import {generatePlan,addDays,localAt} from '../dist/oncall-planning.js';
// PocketIC 0.23 keys its port file by parent PID. A dedicated parent avoids
// collisions with parallel test processes and stale files from a previous run.
if(!process.env.KEBAB_ONCALL_PREVIEW_CHILD){
 const child=fork(fileURLToPath(import.meta.url),[],{env:{...process.env,KEBAB_ONCALL_PREVIEW_CHILD:'1'},stdio:'inherit'});
 process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
 process.exit(await new Promise(resolve=>child.once('exit',code=>resolve(code||0))));
}
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),port=Number(process.env.KEBAB_PREVIEW_PORT||4186),origin=`http://127.0.0.1:${port}`;
const server=await PocketIcServer.start(),pic=await PocketIc.create(server.getUrl());await pic.setTime(Date.now()-32*86400000);
const people=[['owner','Morgan Lee'],['alex','Alex Rivera'],['blair','Blair Chen'],['casey','Casey Kim'],['hr','Taylor Brooks'],['reviewer','Robin Ellis'],['finance','Jordan Quinn']],principal=Object.fromEntries(people.map(([key])=>[key,createIdentity('oncall-preview-'+key).getPrincipal()]));
const controller=createIdentity('oncall-preview-controller').getPrincipal();
async function install(module){const path=resolve(root,module,'backend/dist'),js=execFileSync('python3',[resolve(root,'sdk/tools/did2idl.py'),path+'/backend.did'],{encoding:'utf8'}),{idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));return pic.setupCanister({sender:controller,controllers:[controller],wasm:path+'/backend.wasm',idlFactory,environmentVariables:module==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'aa'.repeat(32)}]:[]});}
const h=await install('hub'),hub=h.actor;hub.setPrincipal(principal.owner);await hub.claimHubWithCode('aa'.repeat(32),{email:'owner@example.test',displayName:'Morgan Lee',orgName:'Orbit Labs'});
for(const[key,name]of people.slice(1)){hub.setPrincipal(principal.owner);await hub.addLocalUser(key+'@example.test',name,'','');const[code]=await hub.createInvite(key+'@example.test');hub.setPrincipal(principal[key]);await hub.claimInvite(code);}
hub.setPrincipal(principal.owner);const ids={};for(const[key]of people)ids[key]=(await hub.personCard(key+'@example.test'))[0].pid;
const group=(await hub.addGroup('Operations','')).id;await hub.setGroupMembers(group,people.slice(1,4).map(([key])=>key+'@example.test'),[]);
const b=await install('desk'),desk=b.actor;desk.setPrincipal(controller);await desk.setHub(h.canisterId.toText());
const conn=await hub.connectApp({name:'desk',canisterId:b.canisterId.toText(),note:'Disposable local preview',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Desk',kind:'app',url:'https://desk.example.test'}]});
if(!conn.ok)throw Error(conn.detail);
const[policy]=await hub.getAppPermissions(conn.id);await hub.setAppPermissions(conn.id,policy.revision,{app:'desk',defaultRole:'member',people:people.slice(1,4).map(([key])=>({id:ids[key],role:'agent'})),groups:[]});
const tokens={};for(const[key]of people){hub.setPrincipal(principal[key]);const t=await hub.mintAppTicket('',conn.tileId);tokens[key]=(await desk.loginWithTicket(t.ticket))[0].token;}hub.setPrincipal(principal.owner);
function ok(r){if(!r.ok)throw Error(JSON.stringify(r));return r.ok;}
const pid=ok(await desk.createOncallProject(tokens.owner,'11'.repeat(16),{name:'Platform operations',description:'Keep the product running, with a clear owner for every handoff.',scope:{internal:'Operations'},services:['API','Website','Sign-in']})).id;
const zone='Europe/Zurich',firstDay=addDays(localAt(Date.now(),zone).slice(0,10),-1);
const histories=[];
for(const [offset,request]of [[28,'77'],[21,'88']]){
 const old=generatePlan({projectId:pid,startDate:addDays(localAt(Date.now(),zone).slice(0,10),-offset),weeks:1,timezone:zone,primary:[ids.alex,ids.blair,ids.casey],backup:[ids.owner],rotationDays:1});
 const draft=ok(await desk.saveOncallPlan(tokens.owner,0n,0n,request.repeat(16),old));ok(await desk.publishOncallPlan(tokens.owner,draft.id,draft.revision,false));histories.push(old);
}
// One complete synthetic week for the dated allowance/time-credit review.
const compensationPlan=generatePlan({projectId:pid,startDate:addDays(localAt(Date.now(),zone).slice(0,10),-13),weeks:1,timezone:zone,handoff:'00:00',primary:[ids.alex,ids.blair,ids.casey],backup:[ids.owner],rotationDays:1});
const compensationDraft=ok(await desk.saveOncallPlan(tokens.owner,0n,0n,'a1'.repeat(16),compensationPlan));ok(await desk.publishOncallPlan(tokens.owner,compensationDraft.id,compensationDraft.revision,false));
const input=generatePlan({projectId:pid,startDate:firstDay,weeks:4,timezone:zone,primary:[ids.alex,ids.blair,ids.casey],backup:[ids.owner]});
const planned=ok(await desk.saveOncallPlan(tokens.owner,0n,0n,'22'.repeat(16),input));const published=ok(await desk.publishOncallPlan(tokens.owner,planned.id,planned.revision,false));
ok(await desk.requestOncallCover(tokens.blair,planned.id,published.revision,1n,ids.casey,'Cover requested for planned leave.'));
const cp=await desk.saveCustomerProject(tokens.owner,0n,0n,{name:'Orbit Cloud',description:'Customer support for the product.',group:'Operations',enabled:true,widgetEnabled:false,origins:[],fields:[]});
ok(await desk.createOncallProject(tokens.owner,'33'.repeat(16),{name:'Orbit Cloud',description:'Customer support, connected to the response team.',scope:{customer:cp.id},services:['Customer API','Customer portal']}));
await pic.setTime(Date.now());await pic.tick(6);await hub.checkAppPermissions(conn.id);
for(const[key]of people){hub.setPrincipal(principal[key]);const ticket=await hub.mintAppTicket('',conn.tileId);tokens[key]=(await desk.loginWithTicket(ticket.ticket))[0].token;}hub.setPrincipal(principal.owner);
await desk.updateSettings(tokens.owner,{appUrl:'https://desk.example.test/',orgName:'Orbit Labs',agentGroup:'',adminGroup:'',keyPrefix:'OPS',autoCloseDays:7n});
ok(await desk.setOncallResponse(tokens.owner,pid,0n,{enabled:true,ackMinutes:5n,fallback:ids.owner,retentionDays:90n}));
const source=ok(await desk.createOncallAlertSource(tokens.owner,'55'.repeat(16),{projectId:pid,name:'Production health checks',service:'API',days:90n}));
async function alertRequest(s,mode,payload){return desk.http_request_update({method:'POST',url:`/oncall/v1/sources/${s.id}/${mode}`,headers:[['Authorization','Bearer '+s.secret],['Content-Type','application/json']],body:new TextEncoder().encode(JSON.stringify(payload))});}
await alertRequest(source,'test',{});ok(await desk.setOncallAlertSource(tokens.owner,source.id,source.revision,{enable:null}));
const alertResult=await alertRequest(source,'events',{alertId:'demo-outage-001',sequence:'1',occurredAt:String(await pic.getTime()),state:'firing',title:'API requests are timing out',detail:'Synthetic exercise: health checks fail in one region. Investigate the latest deployment and confirm recovery before closing.',severity:'major'});
if(alertResult.status_code!==202)throw Error('Synthetic alert seed failed');
ok(await desk.createOncallAlertSource(tokens.owner,'66'.repeat(16),{projectId:pid,name:'Website availability',service:'Website',days:90n}));

hub.setPrincipal(principal.owner);
const rights=await hub.getDeskReportingAccess(conn.id);
const granted=await hub.setDeskReportingAccess(conn.id,rights.revision,[['hr',['compensation']],['reviewer',['time_review']],['finance',['release','export']]].map(([who,capabilities])=>({subject:{person:ids[who]},projectId:pid,capabilities})));
if(!granted.ok)throw Error(granted.detail);await hub.checkAppPermissions(conn.id);
ok(await desk.setReportingPolicy(tokens.hr,pid,0n,{currency:'CHF',decimals:2n,readinessRates:[400n,200n],workRate:6000n,readinessCode:'ONCALL',workCode:'CALL_OUT',costCenter:'PRODUCT',retentionDays:365n}));
for(const[index,old]of histories.entries()){
 const statement=ok(await desk.prepareReportingPeriod(tokens.hr,(index?'aa':'99').repeat(16),{projectId:pid,title:index?'Service review · September':'Previous period · released',startAt:old.startAt,endAt:old.endAt,timezone:zone}));
 const period=async()=>(await desk.reportingPeriod(tokens.owner,statement.id))[0];
 let n=0;
 for(const r of (await period()).records){
  const who=people.find(([who])=>ids[who]===r.personId)[0];
  if(index&&n++<2)continue;
  ok(await desk.confirmReportingRecord(tokens[who],statement.id,r.id,(await period()).period.revision,true,''));
  if(!index||n>4)ok(await desk.reviewReportingRecord(tokens.reviewer,statement.id,r.id,(await period()).period.revision,true,''));
 }
 for(const id of new Set((await period()).records.map(r=>r.personId)))ok(await desk.setReportingMapping(tokens.hr,statement.id,(await period()).period.revision,id,'DEMO-'+people.findIndex(([who])=>ids[who]===id)));
 if(!index)ok(await desk.releaseReportingPeriod(tokens.finance,statement.id,(await period()).period.revision));
}

const rate=(weekday,weekend,holiday)=>({weekday:BigInt(weekday),weekend:BigInt(weekend),holiday:BigInt(holiday)});
const datedRules={policy:{currency:'CHF',decimals:2n,readinessRates:[10000n,5000n],workRate:60n,readinessCode:'READINESS',workCode:'TIME_CREDIT',costCenter:'PRODUCT',retentionDays:365n},effectiveAt:compensationPlan.startAt,timezone:zone,holidays:[addDays(localAt(Number(compensationPlan.startAt/1000000n),zone).slice(0,10),3)],readinessBasis:{day:null},readinessUnit:{money:null},readiness:[rate(10000,15000,20000),rate(5000,7500,10000)],workUnit:{minutes:null},work:rate(60,90,120),minimumMinutes:60n,roundingMinutes:15n};
ok(await desk.activateReportingCompensation(tokens.hr,pid,0n,datedRules));
const compensationStatement=ok(await desk.prepareReportingPeriod(tokens.hr,'a2'.repeat(16),{projectId:pid,title:'Allowance & time credit · example',startAt:compensationPlan.startAt,endAt:compensationPlan.endAt,timezone:zone}));
const compensationView=async()=>(await desk.reportingPeriod(tokens.owner,compensationStatement.id))[0];
const workStart=compensationPlan.startAt+10n*3600000000000n;
ok(await desk.addReportingWork(tokens.alex,compensationStatement.id,(await compensationView()).period.revision,'a3'.repeat(16),{startAt:workStart,endAt:workStart+17n*60000000000n,breakMinutes:0n,note:'Synthetic 17-minute response, minimum applied once for the day'}));
for(const r of (await compensationView()).records){if('pending'in r.state){const who=people.find(([who])=>ids[who]===r.personId)[0];ok(await desk.confirmReportingRecord(tokens[who],compensationStatement.id,r.id,(await compensationView()).period.revision,true,''));}ok(await desk.reviewReportingRecord(tokens.reviewer,compensationStatement.id,r.id,(await compensationView()).period.revision,true,''));}
for(const id of new Set((await compensationView()).records.map(r=>r.personId)))ok(await desk.setReportingMapping(tokens.hr,compensationStatement.id,(await compensationView()).period.revision,id,'DEMO-'+people.findIndex(([who])=>ids[who]===id)));

// Synthetic calendar and publication data only; this server never targets production.
const effectiveShift=input.shifts.find(s=>s.layer===0n&&s.personId===ids.casey),coverStart=effectiveShift.startAt+4n*3600000000000n,coverEnd=coverStart+3n*3600000000000n;
ok(await desk.setOncallAbsence(tokens.casey,pid,ids.casey,coverStart,coverEnd));
let coverPlan=(await desk.oncallPlan(tokens.owner,planned.id))[0].plan;
const partial=ok(await desk.requestOncallInterval(tokens.casey,planned.id,coverPlan.revision,BigInt(input.shifts.indexOf(effectiveShift)),coverStart,coverEnd,ids.blair,'Afternoon appointment'));
coverPlan=(await desk.oncallPlan(tokens.owner,planned.id))[0].plan;
ok(await desk.decideOncallInterval(tokens.blair,planned.id,coverPlan.revision,partial.id,{accept:null}));
ok(await desk.setOncallStatus(tokens.owner,pid,0n,{title:'Orbit platform',description:'Service updates from the team behind your workspace.',slug:'orbit-platform',audience:{public:null},enabled:true,services:['API','Website','Sign-in'],retentionDays:90n}));
ok(await desk.confirmServiceStatus(tokens.alex,pid,1n,['API','Website','Sign-in'],24n));
ok(await desk.publishServiceNotice(tokens.alex,'cd'.repeat(16),0n,0n,{projectId:pid,incidentId:1n,title:'Some API requests are taking longer',message:'We are investigating elevated response times in one region. Existing data is safe. Our next update will follow after the recovery checks.',services:['API'],phase:{investigating:null},impact:{degraded:null},startsAt:0n,endsAt:0n}));
const nextDay=BigInt(Date.now()+86400000)*1000000n;
ok(await desk.publishServiceNotice(tokens.owner,'de'.repeat(16),0n,0n,{projectId:pid,incidentId:0n,title:'Scheduled sign-in maintenance',message:'We are updating the sign-in service. New sign-ins may be briefly unavailable; existing sessions will continue.',services:['Sign-in'],phase:{scheduled:null},impact:{maintenance:null},startsAt:nextDay,endsAt:nextDay+3600000000000n}));

const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?{$bigint:String(v)}:v),parse=x=>JSON.parse(x,(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&'$bigint'in v?BigInt(v.$bigint):v);
// Regional demo is a separate synthetic team; its future plan does not overlap other duty.
const regionalProject=ok(await desk.createOncallProject(tokens.owner,'c1'.repeat(16),{name:'Global product support',description:'Follow the sun with regional hours, clear handoffs and weekend backups.',scope:{internal:'Operations'},services:['Cloud API']})).id;
const regionalRecipe={startDate:addDays(localAt(Number(input.endAt/1000000n),'UTC').slice(0,10),1),weeks:2n,timezone:'UTC',rotationDays:7n,requirement:{continuous:null},regions:[
 {name:'Europe',timezone:'Europe/Zurich',startMinute:480n,endMinute:1200n,days:[0n,1n,2n,3n,4n,5n,6n],holidays:[],primary:[ids.alex,ids.casey],backup:[ids.owner],backupMode:{nonworking:null}},
 {name:'Americas',timezone:'America/Los_Angeles',startMinute:480n,endMinute:1200n,days:[0n,1n,2n,3n,4n,5n,6n],holidays:[],primary:[ids.blair],backup:[],backupMode:{none:null}}
]};
const regionalDraft=ok(await desk.saveOncallRegionalPlan(tokens.owner,0n,0n,'c2'.repeat(16),generateRegionalPlan(regionalProject,regionalRecipe).input,regionalRecipe));
ok(await desk.publishOncallPlan(tokens.owner,regionalDraft.id,regionalDraft.revision,true));
ok(await desk.setOncallReminders(tokens.owner,pid,0n,{enabled:true,coordinators:[ids.owner]}));

const allowed=new Set(['oncallRegionalRecipe','saveOncallRegionalPlan','oncallReminders','setOncallReminders','oncallCalendar','oncallEffectivePlan','updateOncallProject','archiveOncallProject','cancelOncallPlan','setOncallAbsence','cancelOncallAbsence','requestOncallInterval','decideOncallInterval','discardOncallDraft','oncallStatus','setOncallStatus','publishServiceNotice','withdrawServiceNotice','confirmServiceStatus','workspaceServiceStatus','reportingProjects','reportingPeriods','reportingPeriod','setReportingPolicy','reportingCompensationRules','previewReportingCompensation','activateReportingCompensation','withdrawReportingCompensation','addReportingAdjustmentWithUnit','prepareReportingPeriod','refreshReportingPeriod','confirmReportingRecord','attestDepartedService','reviewReportingRecord','addReportingWork','setReportingMapping','explainReportingCoverage','releaseReportingPeriod','exportReportingPeriod','prepareReportingAdjustment','addReportingAdjustment','oncallProjects','oncallWorkspace','oncallPlan','createOncallProject','saveOncallPlan','publishOncallPlan','requestOncallCover','decideOncallCover','listCustomerProjects','oncallResponse','setOncallResponse','openOncallIncident','oncallIncident','acknowledgeOncallIncident','resolveOncallIncident','noteOncallIncident','handoffOncallIncident','decideOncallHandoff','recordOncallWork','voidOncallWork','oncallAlertSources','createOncallAlertSource','rotateOncallAlertKey','setOncallAlertSource']);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const http=createServer(async(req,res)=>{try{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.url?.startsWith('/oncall/v1/')&&req.method==='POST'){
  if(req.headers.origin){res.writeHead(403);res.end();return;}
  const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>8000){res.writeHead(413);res.end();return;}chunks.push(part);}
  const result=await desk.http_request_update({method:'POST',url:req.url,headers:Object.entries(req.headers).map(([k,v])=>[k,String(v)]),body:Buffer.concat(chunks)});
  res.writeHead(result.status_code,Object.fromEntries(result.headers));res.end(Buffer.from(result.body));return;
 }
 if(req.url?.startsWith('/status/v1/')&&req.method==='GET'){const result=await desk.http_request_update({method:'GET',url:req.url,headers:[],body:new Uint8Array()});res.writeHead(result.status_code,Object.fromEntries(result.headers));res.end(Buffer.from(result.body));return;}
 if(req.url==='/session'){res.setHeader('Content-Type','application/json');res.end(stringify(people.map(([key,name])=>({key,id:ids[key],displayName:name,role:key==='owner'?'admin':['hr','reviewer','finance'].includes(key)?'requester':'agent',reporting:true,previewRole:({hr:'Compensation',reviewer:'Time review',finance:'Finance'})[key]}))));return;}
 if(req.url==='/rpc'&&req.method==='POST'){
  if(req.headers.origin!==origin){res.writeHead(403);res.end();return;}
  let body='';for await(const part of req){body+=part;if(body.length>250000){res.writeHead(413);res.end();return;}}
  const {role,method,args}=parse(body);if(!tokens[role]||!allowed.has(method)||!Array.isArray(args)){res.writeHead(400);res.end();return;}
  const result=await desk[method](tokens[role],...args);res.setHeader('Content-Type','application/json');res.end(stringify(result));return;
 }
 if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');res.end(await readFile(resolve(root,'desk/tools/oncall-preview.html')));return;}
 const relative=decodeURIComponent((req.url||'').split('?')[0]).replace(/^\//,'');if(!/^[a-zA-Z0-9_.\/-]+$/.test(relative)||relative.split('/').includes('..')){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',mime[extname(relative)]||'application/octet-stream');let content=await readFile(resolve(root,'desk/dist',relative));if(relative==='support.js')content=content.toString().replace('`https://${BACKEND_CANISTER_ID}.icp.net/support/v1`',JSON.stringify(origin+'/support/v1'));res.end(content);
 }catch(e){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
await new Promise(resolve=>http.listen(port,'127.0.0.1',resolve));console.log(`Local preview with synthetic data: ${origin}/?review=compensation-022#/reporting/3`);
let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{await pic.setTime(Date.now());await pic.tick(6);hub.setPrincipal(principal.owner);await hub.checkAppPermissions(conn.id);}catch(e){console.error('Preview directory refresh:',e.message);}finally{busy=false;}},15000);
async function close(){clearInterval(timer);http.close();await pic.tearDown();await server.stop();process.exit(0);}process.on('SIGINT',close);process.on('SIGTERM',close);
