import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';
const principal=Object.fromEntries(['controller','owner','agent','alice','hr'].map(n=>[n,createIdentity('operations-'+n).getPrincipal()]));
let server;
before(async()=>{server=await PocketIcServer.start();});
after(async()=>{await server?.stop();});
async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
async function install(pic,name,baseline=false){const dir=baseline?resolve(process.env.KEBAB_OPERATIONS_BASELINE,name,'backend/dist'):(process.env.KEBAB_OPERATIONS_CANDIDATE?resolve(process.env.KEBAB_OPERATIONS_CANDIDATE,name):resolve(name,'backend/dist'));return pic.setupCanister({sender:principal.controller,controllers:[principal.controller],wasm:dir+'/backend.wasm',idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ad'.repeat(32)}]:[]});}
async function setup(pic,baseline=false){const h=await install(pic,'hub',baseline),hub=h.actor;hub.setPrincipal(principal.owner);assert.equal((await hub.claimHubWithCode('ad'.repeat(32),{email:'owner@operations.test',displayName:'Owner',orgName:'Operations'})).ok,true);for(const n of ['agent','alice','hr']){hub.setPrincipal(principal.owner);assert.equal(await hub.addLocalUser(n+'@operations.test',n,'',''),true);const[code]=await hub.createInvite(n+'@operations.test');hub.setPrincipal(principal[n]);assert.equal(await hub.claimInvite(code),true);}hub.setPrincipal(principal.owner);await pic.tick(3);const ids={};for(const n of ['owner','agent','alice','hr'])ids[n]=(await hub.personCard(n+'@operations.test'))[0].pid;return {...h,hub,ids};}
async function connect(pic,h,name,baseline=false){const f=await install(pic,name,baseline);f.app=f.actor;f.app.setPrincipal(principal.controller);await f.app.setHub(h.canisterId.toText());h.hub.setPrincipal(principal.owner);f.c=await h.hub.connectApp({name,canisterId:f.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name,kind:'app',url:`https://${name}.operations.test`}]});assert.equal(f.c.ok,true,f.c.detail);f.policy={app:name,defaultRole:name==='watch'?'none':'member',people:name==='desk'?[{id:h.ids.agent,role:'agent'}]:[],groups:[]};await save(h,f);f.login=async who=>{h.hub.setPrincipal(principal[who]);const t=await h.hub.mintAppTicket('',f.c.tileId);assert.equal(t.ok,true,t.detail);const [s]=await f.app.loginWithTicket(t.ticket);assert.ok(s,`${name} login ${who}`);return s.token;};return f;}
async function save(h,f){h.hub.setPrincipal(principal.owner);const[v]=await h.hub.getAppPermissions(f.c.id);assert.equal((await h.hub.setAppPermissions(f.c.id,v.revision,f.policy)).ok,true);}
async function refresh(h,...apps){h.hub.setPrincipal(principal.owner);for(const f of apps)assert.equal((await h.hub.checkAppPermissions(f.c.id)).ok,true);}
async function upgrade(pic,h,name){await pic.upgradeCanister({sender:principal.controller,canisterId:h.canisterId,wasm:(process.env.KEBAB_OPERATIONS_CANDIDATE?resolve(process.env.KEBAB_OPERATIONS_CANDIDATE,name,'backend.wasm'):resolve(name,'backend/dist/backend.wasm')),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});const app=pic.createActor(await idl((process.env.KEBAB_OPERATIONS_CANDIDATE?resolve(process.env.KEBAB_OPERATIONS_CANDIDATE,name,'backend.did'):resolve(name,'backend/dist/backend.did'))),h.canisterId);h.app=app;if(name==='hub')h.hub=app;return app;}

const modules=['desk','assets','trust','contracts','watch'];
const metrics=r=>{assert.ok('ready' in r.state,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));assert.equal(r.schema,1n);return Object.fromEntries(r.metrics);};
for(const baseline of [false,true])test(`Operations: ${baseline?'populated upgrade':'fresh install'} preserves scopes, records and Lunch`,{skip:baseline&&!process.env.KEBAB_OPERATIONS_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  await pic.setTime(new Date('2026-09-18T12:00:00Z'));
  const h=await setup(pic,baseline),apps={},tokens={};
  for(const m of modules){apps[m]=await connect(pic,h,m,baseline);tokens[m]=await apps[m].login('owner');}
  const desk=apps.desk.app,assets=apps.assets.app,trust=apps.trust.app,contracts=apps.contracts.app,watch=apps.watch.app;
  const rt=(await desk.catalog(tokens.desk)).find(t=>t.fields.length===0);
  const ticket=await desk.agentCreate(tokens.desk,{typeId:rt.id,subject:'PRIVATE TICKET SUBJECT',body:'PRIVATE TICKET BODY',fields:[],requester:'alice@operations.test',priority:'normal',channel:'agent'});assert.equal(ticket.ok,true,ticket.detail);
  for(const [kind,action] of [['monitor','handed_out'],['laptop','returned']]){
   const r=await assets.intakeCommit(tokens.assets,{assetId:[],create:[{tag:kind,serial:'SECRET-SERIAL-'+kind,vendor:'Example',model:kind,kind,note:'PRIVATE INVENTORY NOTE'}],action,to:action==='handed_out'?'alice@operations.test':'',note:'PRIVATE EVENT',photo:[],mime:''});assert.equal(r.ok,true,r.detail);
  }
  assert.equal((await trust.setEnroll(tokens.trust,'ops-test-only-secret')).ok,true);
  const enrollment=await trust.http_request_update({method:'POST',url:'/enroll',headers:[],body:Buffer.from(JSON.stringify({enroll_secret:'ops-test-only-secret',host_identifier:'PRIVATE HOST ID',host_details:{system_info:{hostname:'PRIVATE HOSTNAME',hardware_serial:'SECRET-SERIAL-laptop'},os_version:{version:'15',platform:'darwin',name:'macOS'}}}))});assert.equal(enrollment.status_code,200);
  const c=await contracts.createContract(tokens.contracts,{title:'PRIVATE CONTRACT TITLE',vendor:'PRIVATE VENDOR',product:'App',customerRef:'SECRET REFERENCE',responsible:h.ids.alice,deputy:'',visibility:'restricted',viewers:[],seats:[3n],holders:[h.ids.alice],tags:[]});assert.equal(c.ok,true,c.detail);
  const terms={amountMinor:[150000n],currency:'EUR',taxBasis:'net',interval:'year',quantity:[],unitMinor:[],start:'2025-01-01',end:'',renewalRule:'auto',renewalDate:'2026-12-31',noticeDays:[],noticeMonths:[3n],noticeDate:'2026-09-30',decideBy:'2026-09-25',note:'PRIVATE TERMS'};
  assert.equal((await contracts.setTerms(tokens.contracts,c.id,1n,terms,'confirmed')).ok,true);assert.equal((await contracts.setStatus(tokens.contracts,c.id,2n,'active','signed')).ok,true);
  assert.equal((await watch.addDomain(tokens.watch,{name:'ops.test',types:['A'],watchers:['alice@operations.test'],note:'PRIVATE DOMAIN NOTE'})).ok,true);
  // An external customer request must not leak into internal workforce totals.
  h.hub.setPrincipal(principal.owner);await h.hub.addGroup('Support','');
  assert.equal((await desk.updateSettings(tokens.desk,{appUrl:'https://desk.operations.test',orgName:'Operations',agentGroup:'',adminGroup:'',keyPrefix:'SUP',autoCloseDays:7n})).ok,true);
  const pr=await desk.saveCustomerProject(tokens.desk,0n,0n,{name:'Product',description:'PRIVATE PROJECT',group:'Support',enabled:true,widgetEnabled:true,origins:['https://product.test'],fields:[]});assert.equal(pr.ok,true,pr.detail);
  const project=(await desk.listCustomerProjects(tokens.desk)).find(p=>p.id===pr.id);
  const customer=await desk.http_request_update({method:'POST',url:'/support/v1/widgets/'+project.widgetId+'/tickets',headers:[['Origin','https://product.test']],body:Buffer.from(JSON.stringify({name:'PRIVATE CUSTOMER',email:'private@customer.test',subject:'PRIVATE CUSTOMER REQUEST',body:'Support please',revision:Number(project.revision),clientToken:'12'.repeat(32),fields:{}}))});assert.equal(customer.status_code,201,Buffer.from(customer.body).toString());
  h.hub.setPrincipal(principal.owner);
  const lunch=createIdentity('operations-lunch').getPrincipal();assert.equal((await h.hub.connectApp({name:'Lunch',canisterId:lunch.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]})).ok,true);
  h.hub.setPrincipal(lunch);const beforeLunch=await h.hub.team_members();
  if(baseline){await upgrade(pic,h,'hub');h.hub.setPrincipal(principal.owner);assert.ok('unavailable' in (await h.hub.operationsSnapshot(apps.assets.c.id)).state,'old source never becomes a zero snapshot');for(const m of modules)await upgrade(pic,apps[m],m);}
  h.hub.setPrincipal(lunch);assert.deepEqual(await h.hub.team_members(),beforeLunch);
  await refresh(h,...Object.values(apps));
  assert.equal((await h.hub.operationsSources()).length,5);
  const snaps={};for(const m of modules)snaps[m]=metrics(await h.hub.operationsSnapshot(apps[m].c.id));
  assert.equal(snaps.desk.active,1n,'external request excluded');assert.equal(snaps.assets.total,2n);assert.equal(snaps.assets.assigned,1n);assert.equal(snaps.assets.stock,1n);assert.equal(snaps.trust.total,1n);assert.equal(snaps.trust.assessed,0n);assert.equal(snaps.trust.unverified,1n,'enrolled without evidence is not green');assert.equal(snaps.contracts.due,1n);assert.equal(snaps.contracts.total,1n);assert.equal(snaps.watch.enabled,1n);assert.equal(snaps.watch.stale,1n);assert.equal(snaps.watch.unknown,1n);
  const encoded=JSON.stringify(snaps,(_,v)=>typeof v==='bigint'?String(v):v);assert.doesNotMatch(encoded,/PRIVATE|SECRET|@|150000|node_key/);
  assert.equal((await apps.desk.app.getTicket(tokens.desk,ticket.id))[0].ticket.body,'PRIVATE TICKET BODY','records survive summary reads and upgrades');
  h.hub.setPrincipal(lunch);assert.deepEqual(await h.hub.team_members(),beforeLunch);
  // Ordinary users cannot call the console endpoint, even with a forged viewer.
  h.hub.setPrincipal(principal.alice);await assert.rejects(()=>h.hub.operationsSources());assert.ok('denied' in (await h.hub.operationsSnapshot(apps.assets.c.id)).state);
  const anon=pic.createActor(await idl(resolve('hub/backend/dist/backend.did')),h.canisterId);await assert.rejects(()=>anon.operationsSources());
  for(const m of modules){apps[m].app.setPrincipal(principal.alice);await assert.rejects(()=>apps[m].app.hub_operations(h.ids.owner));apps[m].app.setPrincipal(h.canisterId);assert.ok('denied' in (await apps[m].app.hub_operations(h.ids.alice)).state);}
  // Global Hub administration is inherited, then revoked without app-local changes.
  h.hub.setPrincipal(principal.owner);assert.equal((await h.hub.setPersonRole('alice@operations.test','admin')).ok,true);await refresh(h,...Object.values(apps));
  h.hub.setPrincipal(principal.alice);assert.equal((await h.hub.operationsSources()).length,5);assert.equal(metrics(await h.hub.operationsSnapshot(apps.assets.c.id)).total,2n);
  h.hub.setPrincipal(principal.owner);assert.equal((await h.hub.setPersonRole('alice@operations.test','')).ok,true);h.hub.setPrincipal(principal.alice);assert.ok('denied' in (await h.hub.operationsSnapshot(apps.assets.c.id)).state);
  // Helpdesk is a Hub console role, not administration of every source.
  h.hub.setPrincipal(principal.owner);assert.equal((await h.hub.setPersonRole('agent@operations.test','helpdesk')).ok,true);
  apps.assets.policy.people=[{id:h.ids.agent,role:'admin'}];await save(h,apps.assets);await refresh(h,apps.assets);
  h.hub.setPrincipal(principal.agent);assert.deepEqual((await h.hub.operationsSources()).map(x=>x.app),['assets']);assert.equal(metrics(await h.hub.operationsSnapshot(apps.assets.c.id)).total,2n);assert.ok('denied' in (await h.hub.operationsSnapshot(apps.desk.c.id)).state);
  apps.assets.policy.people=[];await save(h,apps.assets);h.hub.setPrincipal(principal.agent);assert.ok('denied' in (await h.hub.operationsSnapshot(apps.assets.c.id)).state,'Hub revokes before an old app cache can grant access');
  // A fresh source rejects the old viewer after removal; a stale lease rejects everybody.
  await refresh(h,...Object.values(apps));for(const m of modules){apps[m].app.setPrincipal(h.canisterId);assert.ok('denied' in (await apps[m].app.hub_operations('invented-person-id')).state);}
  await pic.stopCanister({sender:principal.controller,canisterId:h.canisterId});await pic.advanceTime(61000);await pic.tick(2);
  for(const m of modules)assert.ok('denied' in (await apps[m].app.hub_operations(h.ids.owner)).state,'stale '+m+' directory');
 }finally{await pic.tearDown();}
});
