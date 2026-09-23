import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';
const principal=Object.fromEntries(['controller','owner','agent','alice','hr'].map(n=>[n,createIdentity('hardware-'+n).getPrincipal()]));
let server;
before(async()=>{server=await PocketIcServer.start();});
after(async()=>{await server?.stop();});
async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
async function install(pic,name,baseline=false){const dir=baseline?resolve(process.env.KEBAB_HARDWARE_BASELINE,name,'backend/dist'):resolve(name,'backend/dist');return pic.setupCanister({sender:principal.controller,controllers:[principal.controller],wasm:!baseline&&process.env.KEBAB_HARDWARE_WASM_DIR?resolve(process.env.KEBAB_HARDWARE_WASM_DIR,name,'backend.wasm'):dir+'/backend.wasm',idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ad'.repeat(32)}]:[]});}
async function setup(pic,baseline=false){const h=await install(pic,'hub',baseline),hub=h.actor;hub.setPrincipal(principal.owner);assert.equal((await hub.claimHubWithCode('ad'.repeat(32),{email:'owner@lifecycle.test',displayName:'Owner',orgName:'Lifecycle'})).ok,true);for(const n of ['agent','alice','hr']){hub.setPrincipal(principal.owner);assert.equal(await hub.addLocalUser(n+'@lifecycle.test',n,'',''),true);const[code]=await hub.createInvite(n+'@lifecycle.test');hub.setPrincipal(principal[n]);assert.equal(await hub.claimInvite(code),true);}hub.setPrincipal(principal.owner);await pic.tick(3);const ids={};for(const n of ['owner','agent','alice','hr'])ids[n]=(await hub.personCard(n+'@lifecycle.test'))[0].pid;return {...h,hub,ids};}
async function connect(pic,h,name,baseline=false){const f=await install(pic,name,baseline);f.app=f.actor;f.app.setPrincipal(principal.controller);await f.app.setHub(h.canisterId.toText());h.hub.setPrincipal(principal.owner);f.c=await h.hub.connectApp({name,canisterId:f.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name,kind:'app',url:`https://${name}.lifecycle.test`}]});assert.equal(f.c.ok,true,f.c.detail);f.policy={app:name,defaultRole:name==='watch'?'none':'member',people:name==='desk'?[{id:h.ids.agent,role:'agent'}]:[],groups:[]};await save(h,f);f.login=async who=>{h.hub.setPrincipal(principal[who]);const t=await h.hub.mintAppTicket('',f.c.tileId);assert.equal(t.ok,true,t.detail);const [s]=await f.app.loginWithTicket(t.ticket);assert.ok(s,`${name} login ${who}`);return s.token;};return f;}
async function save(h,f){h.hub.setPrincipal(principal.owner);const[v]=await h.hub.getAppPermissions(f.c.id);assert.equal((await h.hub.setAppPermissions(f.c.id,v.revision,f.policy)).ok,true);}
const decide=async(desk,tok,id,departure,note)=>desk.app.decideLifecycle(tok,id,(await desk.app.personOverview(tok,id))[0].lifecycle[0].lastEvent,departure,note);
const list=(desk,tok)=>desk.app.listTickets(tok,{status:'',queue:'',assignee:'',q:'',view:'all'});
async function scim(h,token,method,url,body){h.hub.setPrincipal(principal.owner);const r=await h.hub.http_request_update({method,url,headers:[['Authorization','Bearer '+token]],body:Buffer.from(body?JSON.stringify(body):'')});assert.ok(r.status_code>=200&&r.status_code<300,Buffer.from(r.body).toString());return r.body.length?JSON.parse(Buffer.from(r.body).toString()):null;}
async function refresh(h,...apps){h.hub.setPrincipal(principal.owner);for(const f of apps)assert.equal((await h.hub.checkAppPermissions(f.c.id)).ok,true);}
async function upgrade(pic,h,name){await pic.upgradeCanister({sender:principal.controller,canisterId:h.canisterId,wasm:process.env.KEBAB_HARDWARE_WASM_DIR?resolve(process.env.KEBAB_HARDWARE_WASM_DIR,name,'backend.wasm'):resolve(name,'backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});const app=pic.createActor(await idl(resolve(name,'backend/dist/backend.did')),h.canisterId);h.app=app;if(name==='hub')h.hub=app;return app;}

const ok = r => { assert.equal(r.ok,true,r.detail); return r; };
const billing = {legalName:'Test company AG',street:'Musterstrasse',houseNo:'11',postalCode:'8002',town:'Zurich',country:'CH',uid:'CHE-123.456.789',vatRegistered:true,vatRateBp:810n,iban:'CH9300762011623852957',currency:'CHF',prefix:'IT-',yearInNumber:true,paymentDays:14n,lang:'en',depreciationMonths:36n,floorPct:10n,minPriceMinor:5000n,waiverText:'Used equipment, wiped before handover.',waiverVersion:1n,footer:'TEST ONLY'};
const buyer = {pid:'alice@lifecycle.test',name:'',email:'',street:'Seestrasse',houseNo:'7',postalCode:'8802',town:'Kilchberg',country:'CH'};
async function fixture(pic, baseline=false) {
 const h=await setup(pic,baseline),desk=await connect(pic,h,'desk',baseline),assets=await connect(pic,h,'assets',baseline);
 const owner=await desk.login('owner'),hr=await desk.login('hr'),admin=await assets.login('owner'),member=await assets.login('hr');
 await pic.tick(4);
 const ids=[];
 for(const kind of ['laptop','phone','monitor','tablet','accessory']){
  const a=ok(await assets.app.createAsset(admin,{tag:'HW-'+kind,serial:'SERIAL-'+kind,vendor:'Example',model:kind,kind,note:''}));
  ok(await assets.app.addEventTo(admin,a.id,'handed_out','alice@lifecycle.test','Received by Alice'));ids.push(a.id);
 }
 ok(await assets.app.setSettings(admin,{adminGroup:'',appUrl:'https://assets.lifecycle.test',tagPrefix:'HW-',orgName:'Test company'}));ok(await assets.app.setBilling(admin,billing));
 return {h,desk,assets,owner,hr,admin,member,ids};
}
async function departure(f) {
 f.h.hub.setPrincipal(principal.owner);await f.h.hub.setLocalUserActive('alice@lifecycle.test',false);await f.desk.app.syncLifecycle(f.owner);await refresh(f.h,f.assets);
 const [ticket]=await list(f.desk,f.owner);assert.ok(ticket);return ticket.id;
}
const planInput = (p, changes={}) => ({choice:p.choice,owner:p.owner,dueOn:p.dueOn,recipient:p.recipient,note:p.note,...changes});
async function act(f,id,action,changes={},confirmation) {
 const p=(await f.assets.app.handoverOf(f.admin,id))[0].plan;
 return f.assets.app.updateHandover(f.admin,id,p.revision,action,planInput(p,changes),confirmation??'');
}
async function clearChecklist(f,id) {const [v]=await f.desk.app.getTicket(f.owner,id);for(let i=0;i<v.tasks.length;i++)if(v.tasks[i].by!=='system:assets')ok(await f.desk.app.setTask(f.owner,id,BigInt(i),'done'));}

test('hardware offboarding: custody, permissions, deduplication, reactivation, sale, outage and closure',{timeout:240000},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await fixture(pic),{h,desk,assets,owner,hr,admin,member,ids}=f;
  const [returned,transfer,missing,sell,cancelledSale]=ids;
  const id=await departure(f);
  assert.equal((await assets.app.getAsset(admin,returned))[0].asset.assignee,h.ids.alice,'deactivation does not fake a return');
  assert.equal((await desk.app.offboardingHardware(owner,id))[0].progress.total,0n,'review is not confirmed departure');
  assert.deepEqual(await desk.app.offboardingHardware(hr,id),[]);
  assert.deepEqual(await assets.app.pendingHandovers(member),[]);
  ok(await decide(desk,owner,id,true,'Departure confirmed by HR'));
  let summary=(await desk.app.offboardingHardware(owner,id))[0];assert.equal(summary.progress.total,5n);assert.equal(summary.progress.open,5n);
  assert.equal((await desk.app.offboardingHardware(owner,id))[0].progress.total,5n,'repeated sync is idempotent');
  const [tasks]=await desk.app.getTicket(owner,id);const hardwareIndex=tasks.tasks.findIndex(t=>t.title==='Reclaim devices');assert.equal(tasks.tasks[hardwareIndex].by,'system:assets');assert.equal((await desk.app.setTask(owner,id,BigInt(hardwareIndex),'done')).ok,false,'hardware checkbox cannot be checked manually');
  assert.equal((await assets.app.listAssets(admin,'','offboarding',false)).length,5);
  const view=(await assets.app.handoverOf(admin,returned))[0];
  assert.deepEqual(await assets.app.handoverOf(member,returned),[]);
  assert.equal((await assets.app.updateHandover(member,returned,view.plan.revision,'receive',planInput(view.plan),'SERIAL-laptop')).ok,false);
  assets.app.setPrincipal(principal.hr);await assert.rejects(()=>assets.app.hub_syncHardware(view.context));
  h.hub.setPrincipal(principal.hr);assert.equal((await h.hub.hub_syncHardware(view.context)).state,'unavailable');
  h.hub.setPrincipal(principal.owner);assert.equal((await h.hub.reassignOwned(assets.c.id,[String(returned)],'alice@lifecycle.test','')).ok,false,'Hub transfer cannot manufacture physical receipt');
  assert.equal((await assets.app.addEventTo(admin,returned,'returned','','')).ok,false,'generic event cannot bypass custody workflow');
  assert.equal((await assets.app.intakeCommit(admin,{assetId:[returned],create:[],action:'sold',to:'Unknown buyer',note:'',photo:[],mime:''})).ok,false,'scan cannot bypass sale completion');
  assets.policy.people=[{id:h.ids.agent,role:'admin'}];await save(h,assets);await refresh(h,assets);const temporaryAdmin=await assets.login('agent');assets.policy.people=[];await save(h,assets);
  assert.equal((await assets.app.updateHandover(temporaryAdmin,returned,view.plan.revision,'receive',planInput(view.plan),'SERIAL-laptop')).ok,false,'Hub revocation applies even while the local admin lease is still fresh');
  assert.equal((await act(f,returned,'receive',{},'wrong serial')).ok,false);
  ok(await act(f,returned,'receive',{},'SERIAL-laptop'));
  let device=(await assets.app.getAsset(admin,returned))[0];assert.equal(device.asset.status,'preparing');assert.equal(device.asset.assignee,'');
  h.hub.setPrincipal(principal.owner);let ops=Object.fromEntries((await h.hub.operationsSnapshot(assets.c.id)).metrics);assert.equal(ops.preparing,1n);assert.equal(ops.stock,0n);assert.equal(ops.handover,5n,'pending handovers never become available stock');
  assert.equal((await desk.app.offboardingHardware(owner,id))[0].progress.open,5n,'receipt is not readiness');
  const context=await desk.app.personContext(owner,id,assets.c.id);assert.ok(context.items.some(x=>x.id==='asset:'+returned&&!x.historical&&x.status.includes('prepare')));
  assert.equal((await assets.app.updateHandover(admin,returned,view.plan.revision,'receive',planInput(view.plan),'SERIAL-laptop')).ok,false,'old clicks cannot repeat custody changes');
  assert.equal((await act(f,returned,'ready',{note:''},'SERIAL-laptop')).ok,false);
  ok(await act(f,returned,'ready',{note:'Wiped, enrollment checked, condition verified'},'SERIAL-laptop'));
  assert.equal((await assets.app.getAsset(admin,returned))[0].asset.status,'in_stock');
  ops=Object.fromEntries((await h.hub.operationsSnapshot(assets.c.id)).metrics);assert.equal(ops.stock,1n);assert.equal(ops.handover,4n);
  ok(await act(f,transfer,'plan',{choice:'transfer',recipient:'hr@lifecycle.test',owner:h.ids.owner,dueOn:'2026-09-30'}));
  assert.equal((await assets.app.getAsset(admin,transfer))[0].asset.assignee,h.ids.alice,'planning does not transfer');
  h.hub.setPrincipal(principal.owner);await h.hub.setLocalUserActive('alice@lifecycle.test',true);await desk.app.syncLifecycle(owner);await refresh(h,assets);
  assert.equal((await act(f,transfer,'transfer',{},'SERIAL-phone')).ok,false,'fresh Desk check pauses even before background hardware sync');
  assert.equal((await desk.app.offboardingHardware(owner,id))[0].context.state,'paused');
  ok(await decide(desk,owner,id,true,'Account temporarily reactivated to finish other work'));
  ok(await act(f,transfer,'transfer',{note:'Received by HR'},'SERIAL-phone'));
  device=(await assets.app.getAsset(member,transfer))[0];assert.equal(device.asset.assignee,h.ids.hr);assert.ok(device.events.every(e=>e.kind!=='offboarding'),'staff follow-up notes stay private after transfer');
  assert.equal((await act(f,missing,'exception',{note:'x'},'SERIAL-monitor')).ok,false);
  ok(await act(f,missing,'exception',{note:'Lost monitor; IT owner will handle the documented loss'},'SERIAL-monitor'));
  device=(await assets.app.getAsset(admin,missing))[0];assert.equal(device.asset.status,'lost');assert.equal(device.asset.assignee,h.ids.alice,'exception does not invent a return');
  const sale=ok(await assets.app.createSale(admin,sell,{...buyer,pid:'',name:'Alice',email:'alice@private.test'},20000n,''));
  let privateLink=ok(await assets.app.createDealLink(admin,sale.id));const secret=privateLink.url.split('.').at(-1);
  const [deal]=await assets.app.getDeal(sale.id,secret);ok(await assets.app.acceptDeal(sale.id,secret,deal.quote,buyer));
  const doc=(await assets.app.dealDocument(sale.id,secret))[0],issued=(await assets.app.getSale(admin,sale.id))[0];
  ok(await assets.app.confirmDeal(sale.id,secret,issued.sale.invoiceNo,doc.hash));ok(await assets.app.markPaid(admin,sale.id,'Received'));ok(await assets.app.setSaleChecks(admin,sale.id,true,true));
  assert.equal((await desk.app.offboardingHardware(owner,id))[0].progress.open,2n,'paid still awaits physical handover');
  ok(await assets.app.completeSaleHandover(admin,sale.id,true,'Buyer received it'));
  const cancelled=ok(await assets.app.createSale(admin,cancelledSale,{...buyer,pid:'',name:'Alice',email:'alice@private.test'},10000n,''));ok(await assets.app.cancelSale(admin,cancelled.id,'Buyer declined'));
  assert.equal((await desk.app.offboardingHardware(owner,id))[0].progress.open,1n,'cancelled sale remains outstanding');
  ok(await act(f,cancelledSale,'plan',{choice:'return'}));ok(await act(f,cancelledSale,'receive',{},'SERIAL-accessory'));ok(await act(f,cancelledSale,'ready',{note:'Condition checked; no data or management on this accessory'},'SERIAL-accessory'));
  await clearChecklist(f,id);
  await pic.stopCanister({sender:principal.controller,canisterId:assets.canisterId});assert.equal((await desk.app.setStatus(owner,id,'resolved','')).ok,false,'unavailable source is never zero work');await pic.startCanister({sender:principal.controller,canisterId:assets.canisterId});
  await refresh(h,assets);assert.equal((await desk.app.offboardingHardware(owner,id))[0].progress.open,0n);
  assert.equal((await desk.app.getTicket(owner,id))[0].tasks.find(t=>t.title==='Reclaim devices').state,'done','default hardware checklist follows Assets without a second click');
  const summaryContext=await desk.app.personContext(owner,id,assets.c.id);assert.ok(summaryContext.items.some(i=>i.id==='sale:'+sale.id),'outside sale retains employee context');
  ok(await desk.app.setStatus(owner,id,'resolved',''));
  h.hub.setPrincipal(principal.owner);assert.equal(await h.hub.removeConnector(assets.c.id),true);assert.equal((await desk.app.offboardingHardware(owner,id))[0].progress.state,'unavailable','removing an app must not become zero outstanding work');assert.equal((await desk.app.setStatus(owner,id,'closed','')).ok,false);
 }finally{await pic.tearDown();}
});

test('hardware upgrade: preserves Lunch, central roles, held devices and issued colleague invoices',{timeout:240000,skip:!process.env.KEBAB_HARDWARE_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await fixture(pic,true),{h,desk,assets,owner,admin,ids}=f;
  const sale=ok(await assets.app.createSale(admin,ids[0],buyer,30000n,''));
  const alice=await assets.login('alice');ok(await assets.app.offerSale(admin,sale.id));const [offer]=await assets.app.getSale(admin,sale.id);ok(await assets.app.acceptOffer(alice,sale.id,offer.waiverVersion,[buyer]));
  ok(await assets.app.setSaleChecks(admin,sale.id,true,true));ok(await assets.app.issueInvoice(admin,sale.id));
  const bytes=Buffer.from('%PDF-1.4\n'+'Existing invoice document '.repeat(20));ok(await assets.app.attachSaleDocument(admin,sale.id,'invoice',bytes));
  const before=(await assets.app.getSale(admin,sale.id))[0];
  const offered=ok(await assets.app.createSale(admin,ids[1],buyer,20000n,''));ok(await assets.app.offerSale(admin,offered.id));const [pending]=await assets.app.getSale(admin,offered.id);ok(await assets.app.acceptOffer(alice,offered.id,pending.waiverVersion,[buyer]));
  const lunch=createIdentity('hardware-lunch').getPrincipal();h.hub.setPrincipal(principal.owner);await h.hub.connectApp({name:'Lunch',canisterId:lunch.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]});h.hub.setPrincipal(lunch);const lunchBefore=await h.hub.team_members();
  h.hub.setPrincipal(principal.owner);const policy=await h.hub.getAppPermissions(assets.c.id);
  await upgrade(pic,h,'hub');await upgrade(pic,desk,'desk');await upgrade(pic,assets,'assets');
  h.hub.setPrincipal(lunch);assert.deepEqual(await h.hub.team_members(),lunchBefore);h.hub.setPrincipal(principal.owner);assert.deepEqual(await h.hub.getAppPermissions(assets.c.id),policy);
  assert.deepEqual((await assets.app.getSale(admin,sale.id))[0].sale,before.sale);
  const id=await departure(f);ok(await decide(desk,owner,id,true,'Confirmed'));await desk.app.offboardingHardware(owner,id);
  ok(await assets.app.continueFormerBuyerSale(admin,offered.id,'alice@private.test'));const converted=(await assets.app.getSale(admin,offered.id))[0].sale;assert.equal(converted.status,'draft');assert.equal(converted.acceptedAt,0n);assert.equal(converted.buyer.pid,'');
  assert.equal((await assets.app.continueFormerBuyerSale(admin,sale.id,'alice@lifecycle.test')).ok,false);
  ok(await assets.app.continueFormerBuyerSale(admin,sale.id,'alice@private.test'));
  const link=ok(await assets.app.createDealLink(admin,sale.id)),key=link.url.split('.').at(-1);
  const view=(await assets.app.getSale(admin,sale.id))[0];assert.deepEqual(view.sale.buyer,before.sale.buyer);assert.equal(view.sale.invoiceNo,before.sale.invoiceNo);assert.equal(view.sale.acceptedHow,before.sale.acceptedHow);assert.equal(view.sale.pdfHash,before.sale.pdfHash);
  assert.deepEqual(Buffer.from((await assets.app.dealDocument(sale.id,key))[0].bytes),bytes,'existing invoice bytes unchanged');
  assert.deepEqual(await assets.app.getDeal(sale.id,key.replace(/^./,key[0]==='a'?'b':'a')),[]);
  await upgrade(pic,assets,'assets');await upgrade(pic,desk,'desk');
  assert.equal((await assets.app.pendingHandovers(admin)).length,5);assert.equal((await assets.app.getDeal(sale.id,key)).length,1,'scoped access and plans survive a populated upgrade');
  await pic.advanceTime(14*86400000+1000);await pic.tick(25);const freshAdmin=await assets.login('owner');await pic.tick(5);assert.equal((await assets.app.formerBuyerStatus(freshAdmin,sale.id))[0].privateEmail,'','additional private contact expires with its access window');assert.deepEqual(await assets.app.getDeal(sale.id,key),[]);assert.deepEqual(Buffer.from((await assets.app.saleDocument(freshAdmin,before.sale.pdfId))[0].bytes),bytes,'financial archive survives contact cleanup');
 }finally{await pic.tearDown();}
});

test('an incorrect planned departure can be cancelled without fake returns or loss records',{timeout:120000},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await fixture(pic),{h,desk,assets,owner,admin,hr,ids}=f;
  const rt=(await desk.app.catalog(owner)).find(t=>t.name==='Offboarding');
  const request=ok(await desk.app.agentCreate(owner,{typeId:rt.id,subject:'Wrong departure date',body:'Entered by mistake',fields:[['person','alice@lifecycle.test'],['lastDay','2026-09-30'],['manager','owner@lifecycle.test']],requester:'hr@lifecycle.test',priority:'normal',channel:'agent'}));
  const [work]=await desk.app.offboardingHardware(owner,request.id);assert.equal(work.progress.total,5n);
  const oldPlan=(await assets.app.handoverOf(admin,ids[1]))[0].plan;
  assert.equal((await desk.app.cancelOffboarding(hr,request.id,work.context.revision,'Entered by mistake')).ok,false);
  assert.equal((await desk.app.cancelOffboarding(owner,request.id,work.context.revision-1n,'Entered by mistake')).ok,false);
  ok(await desk.app.cancelOffboarding(owner,request.id,work.context.revision,'Employment continues; HR entered the wrong person'));
  assert.equal((await act(f,ids[0],'receive',{},'SERIAL-laptop')).ok,false);
  await desk.app.offboardingHardware(owner,request.id);assert.equal((await assets.app.pendingHandovers(admin)).length,0);
  for(const id of ids){const [v]=await assets.app.getAsset(admin,id);assert.equal(v.asset.assignee,h.ids.alice);assert.equal(v.asset.status,'assigned');}
  assert.equal((await desk.app.setStatus(owner,request.id,'open','')).ok,false,'cancelled decisions are not silently reused');
  const sale=ok(await assets.app.createSale(admin,ids[0],{...buyer,pid:'',name:'Outside Buyer',email:'outside@example.test'},20000n,''));ok(await assets.app.offerSale(admin,sale.id));ok(await assets.app.recordWaiver(admin,sale.id,'Signed paper retained'));ok(await assets.app.setSaleChecks(admin,sale.id,true,true));ok(await assets.app.issueInvoice(admin,sale.id));ok(await assets.app.attachSaleDocument(admin,sale.id,'invoice',Buffer.from('%PDF-1.4\n'+'Test document '.repeat(30))));ok(await assets.app.markPaid(admin,sale.id,'Confirmed'));ok(await assets.app.completeSaleHandover(admin,sale.id,true,'Ordinary sale after the incorrect departure was cancelled'));
  const next=ok(await desk.app.agentCreate(owner,{typeId:rt.id,subject:'Later confirmed departure',body:'A new decision',fields:[['person','alice@lifecycle.test'],['lastDay','2026-10-31'],['manager','owner@lifecycle.test']],requester:'hr@lifecycle.test',priority:'normal',channel:'agent'}));await desk.app.offboardingHardware(owner,next.id);const newPlan=(await assets.app.handoverOf(admin,ids[1]))[0].plan;assert.ok(newPlan.revision>oldPlan.revision);assert.equal((await assets.app.updateHandover(admin,ids[1],oldPlan.revision,'receive',planInput(oldPlan),'SERIAL-phone')).ok,false,'a stale browser from a previous case cannot operate the new handover');
 }finally{await pic.tearDown();}
});
