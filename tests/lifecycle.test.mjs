import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';
const principal=Object.fromEntries(['controller','owner','agent','alice','hr'].map(n=>[n,createIdentity('lifecycle-'+n).getPrincipal()]));
let server;
before(async()=>{server=await PocketIcServer.start();});
after(async()=>{await server?.stop();});
async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
async function install(pic,name,baseline=false){const dir=baseline?resolve(process.env.KEBAB_LIFECYCLE_BASELINE,name,'backend/dist'):resolve(name,'backend/dist');return pic.setupCanister({sender:principal.controller,controllers:[principal.controller],wasm:dir+'/backend.wasm',idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ad'.repeat(32)}]:[]});}
async function setup(pic,baseline=false){const h=await install(pic,'hub',baseline),hub=h.actor;hub.setPrincipal(principal.owner);assert.equal((await hub.claimHubWithCode('ad'.repeat(32),{email:'owner@lifecycle.test',displayName:'Owner',orgName:'Lifecycle'})).ok,true);for(const n of ['agent','alice','hr']){hub.setPrincipal(principal.owner);assert.equal(await hub.addLocalUser(n+'@lifecycle.test',n,'',''),true);const[code]=await hub.createInvite(n+'@lifecycle.test');hub.setPrincipal(principal[n]);assert.equal(await hub.claimInvite(code),true);}hub.setPrincipal(principal.owner);await pic.tick(3);const ids={};for(const n of ['owner','agent','alice','hr'])ids[n]=(await hub.personCard(n+'@lifecycle.test'))[0].pid;return {...h,hub,ids};}
async function connect(pic,h,name,baseline=false){const f=await install(pic,name,baseline);f.app=f.actor;f.app.setPrincipal(principal.controller);await f.app.setHub(h.canisterId.toText());h.hub.setPrincipal(principal.owner);f.c=await h.hub.connectApp({name,canisterId:f.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name,kind:'app',url:`https://${name}.lifecycle.test`}]});assert.equal(f.c.ok,true,f.c.detail);f.policy={app:name,defaultRole:name==='watch'?'none':'member',people:name==='desk'?[{id:h.ids.agent,role:'agent'}]:[],groups:[]};await save(h,f);f.login=async who=>{h.hub.setPrincipal(principal[who]);const t=await h.hub.mintAppTicket('',f.c.tileId);assert.equal(t.ok,true,t.detail);const [s]=await f.app.loginWithTicket(t.ticket);assert.ok(s,`${name} login ${who}`);return s.token;};return f;}
async function save(h,f){h.hub.setPrincipal(principal.owner);const[v]=await h.hub.getAppPermissions(f.c.id);assert.equal((await h.hub.setAppPermissions(f.c.id,v.revision,f.policy)).ok,true);}
const decide=async(desk,tok,id,departure,note)=>desk.app.decideLifecycle(tok,id,(await desk.app.personOverview(tok,id))[0].lifecycle[0].lastEvent,departure,note);
const list=(desk,tok)=>desk.app.listTickets(tok,{status:'',queue:'',assignee:'',q:'',view:'all'});
async function scim(h,token,method,url,body){h.hub.setPrincipal(principal.owner);const r=await h.hub.http_request_update({method,url,headers:[['Authorization','Bearer '+token]],body:Buffer.from(body?JSON.stringify(body):'')});assert.ok(r.status_code>=200&&r.status_code<300,Buffer.from(r.body).toString());return r.body.length?JSON.parse(Buffer.from(r.body).toString()):null;}
async function refresh(h,...apps){h.hub.setPrincipal(principal.owner);for(const f of apps)assert.equal((await h.hub.checkAppPermissions(f.c.id)).ok,true);}
async function upgrade(pic,h,name){await pic.upgradeCanister({sender:principal.controller,canisterId:h.canisterId,wasm:resolve(name,'backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});const app=pic.createActor(await idl(resolve(name,'backend/dist/backend.did')),h.canisterId);h.app=app;if(name==='hub')h.hub=app;return app;}

test('SCIM follow-up is private, deduplicated, durable, and reactivation pauses completion',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),desk=await connect(pic,h,'desk'),owner=await desk.login('owner'),hr=await desk.login('hr');
  h.hub.setPrincipal(principal.owner);const token=await h.hub.genScimToken();
  const u=await scim(h,token,'POST','/scim/v2/Users',{userName:'departing@lifecycle.test',displayName:'Departing Person',active:true});
  await scim(h,token,'POST','/scim/v2/Users',{userName:'old@lifecycle.test',displayName:'Historical inactive',active:false});
  assert.equal(await desk.app.syncLifecycle(owner),true);assert.equal((await list(desk,owner)).length,0,'first inactive import is not a departure');
  await pic.stopCanister({sender:principal.controller,canisterId:desk.canisterId});
  for(let i=0;i<2;i++)await scim(h,token,'PATCH','/scim/v2/Users/'+u.id,{Operations:[{op:'replace',path:'active',value:false}]});
  h.hub.setPrincipal(principal.owner);assert.equal(Object.keys(await h.hub.checkAccess('departing@lifecycle.test'))[0],'inactive','Desk availability never gates revocation');
  await pic.startCanister({sender:principal.controller,canisterId:desk.canisterId});await desk.app.syncLifecycle(owner);
  let rows=await list(desk,owner);assert.equal(rows.length,1);const id=rows[0].id;
  assert.deepEqual(await desk.app.getTicket(hr,id),[]);assert.deepEqual(await desk.app.personOverview(hr,id),[]);assert.deepEqual(await desk.app.personContextSources(hr,id),[]);
  assert.equal((await desk.app.setStatus(owner,id,'resolved','')).ok,false,'unreviewed changes cannot disappear into resolved');
  const view=(await desk.app.personOverview(owner,id))[0];assert.equal(view.person.displayName,'Departing Person');assert.equal(Object.keys(view.lifecycle[0].state)[0],'review');
  assert.equal((await decide(desk,owner,id,true,'Confirmed with HR')).ok,true);
  await scim(h,token,'PATCH','/scim/v2/Users/'+u.id,{Operations:[{op:'replace',path:'active',value:true}]});await desk.app.syncLifecycle(owner);
  assert.equal((await list(desk,owner)).length,1);assert.equal((await desk.app.getTicket(owner,id))[0].ticket.status,'waiting');
  assert.equal((await desk.app.setStatus(owner,id,'closed','')).ok,false);
  await upgrade(pic,desk,'desk');await desk.app.syncLifecycle(owner);assert.equal((await list(desk,owner)).length,1,'cursor and case survive upgrade');
  assert.equal((await decide(desk,owner,id,false,'Temporary suspension')).ok,true);
  h.hub.setPrincipal(principal.hr);await assert.rejects(()=>h.hub.hub_lifecycleEvents(0n));
 }finally{await pic.tearDown();}
});

test('person context follows the affected employee, includes every hardware kind, and preserves source permissions',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),desk=await connect(pic,h,'desk'),assets=await connect(pic,h,'assets',!!process.env.KEBAB_LIFECYCLE_BASELINE),forms=await connect(pic,h,'forms',!!process.env.KEBAB_LIFECYCLE_BASELINE),contracts=await connect(pic,h,'contracts',!!process.env.KEBAB_LIFECYCLE_BASELINE),watch=await connect(pic,h,'watch',!!process.env.KEBAB_LIFECYCLE_BASELINE),trust=await connect(pic,h,'trust',!!process.env.KEBAB_LIFECYCLE_BASELINE);
  watch.policy.people=[{id:h.ids.alice,role:'viewer'}];await save(h,watch);
  const owner=await desk.login('owner'),agent=await desk.login('agent'),hr=await desk.login('hr'),a=await assets.login('owner'),fo=await forms.login('alice'),co=await contracts.login('alice'),wo=await watch.login('owner'),to=await trust.login('owner');
  assert.equal((await trust.app.setEnroll(to,'test-only-enroll-secret')).ok,true);
  const enrollment=await trust.app.http_request_update({method:'POST',url:'/enroll',headers:[],body:Buffer.from(JSON.stringify({enroll_secret:'test-only-enroll-secret',host_identifier:'alice-device',host_details:{system_info:{hostname:'Alice Mac',hardware_serial:'laptop-serial'},os_version:{version:'15',platform:'darwin',name:'macOS'}}}))});
  const node=JSON.parse(Buffer.from(enrollment.body).toString());assert.ok(node.node_key);assert.equal((await trust.app.setDeviceOwner(to,node.node_key,'alice@lifecycle.test')).ok,true);
  for(const kind of ['laptop','phone','tablet','monitor','accessory','other']){const r=await assets.app.intakeCommit(a,{assetId:[],create:[{tag:kind,serial:kind+'-serial',vendor:'Example',model:kind,kind,note:'SECRET INVENTORY NOTE'}],action:'handed_out',to:'alice@lifecycle.test',note:'PRIVATE HANDOVER',photo:[],mime:''});assert.equal(r.ok,true,r.detail);}
  assert.ok((await forms.app.createForm(fo,'Alice form')).length);
  assert.equal((await contracts.app.createContract(co,{title:'Alice license',vendor:'Vendor',product:'Tool',customerRef:'PRIVATE CUSTOMER REF',responsible:'',deputy:'',visibility:'restricted',viewers:[],seats:[1n],holders:[h.ids.alice],tags:[]})).ok,true);
  assert.equal((await watch.app.addDomain(wo,{name:'lifecycle.test',types:['A'],watchers:['alice@lifecycle.test'],note:'SECRET DOMAIN NOTE'})).ok,true);
  if(process.env.KEBAB_LIFECYCLE_BASELINE)for(const [name,app] of Object.entries({assets,forms,contracts,watch,trust}))await upgrade(pic,app,name);
  const rt=(await desk.app.catalog(owner)).find(t=>t.name==='Offboarding');
  const req={typeId:rt.id,subject:'Alice departure',body:'Please arrange the handover',fields:[['person','alice@lifecycle.test'],['lastDay','2026-09-30'],['manager','owner@lifecycle.test']],requester:'hr@lifecycle.test',priority:'high',channel:'agent'};
  const ticket=await desk.app.agentCreate(owner,req);assert.equal(ticket.ok,true,ticket.detail);
  assert.equal((await desk.app.personOverview(owner,ticket.id))[0].person.id,h.ids.alice,'affected employee, not HR requester');
  assert.equal((await desk.app.personContextSources(owner,ticket.id)).length,5);
  const ctx=await desk.app.personContext(owner,ticket.id,assets.c.id);assert.equal(ctx.items.length,6);assert.deepEqual(new Set(ctx.items.map(i=>i.kind)),new Set(['laptop','phone','tablet','monitor','accessory','other']));assert.ok(!JSON.stringify(ctx,(_,v)=>typeof v==='bigint'?String(v):v).includes('SECRET'));
  assert.equal((await desk.app.personContext(owner,ticket.id,forms.c.id)).items[0].title,'Alice form');
  const cc=await desk.app.personContext(owner,ticket.id,contracts.c.id);assert.equal(cc.items[0].title,'Alice license');assert.ok(cc.items[0].path.includes('/s/personal:'));
  assert.equal((await desk.app.personContext(owner,ticket.id,watch.c.id)).items[0].title,'lifecycle.test');
  const tc=await desk.app.personContext(owner,ticket.id,trust.c.id);assert.equal(tc.items[0].title,'Alice Mac');assert.equal(tc.items[0].status,'not fully assessed');assert.ok(!JSON.stringify(tc,(_,v)=>typeof v==='bigint'?String(v):v).includes(node.node_key),'device authentication key never leaves Trust');
  assert.equal(Object.keys((await desk.app.personContext(agent,ticket.id,assets.c.id)).state)[0],'denied','Desk agent does not become Assets admin');
  assert.deepEqual(await desk.app.personOverview(hr,ticket.id),[],'requester cannot read support context');
  assets.app.setPrincipal(principal.hr);await assert.rejects(()=>assets.app.hub_personContext(h.ids.owner,h.ids.alice,'admin'));
  assets.policy.people=[{id:h.ids.agent,role:'admin'}];await save(h,assets);await refresh(h,assets);assert.equal((await desk.app.personContext(agent,ticket.id,assets.c.id)).total,6n);
  assets.policy.people=[];await save(h,assets);assert.equal(Object.keys((await desk.app.personContext(agent,ticket.id,assets.c.id)).state)[0],'denied','Hub blocks a stale elevated source cache immediately');
  assert.equal((await assets.app.intakeCommit(a,{assetId:[1n],create:[],action:'returned',to:'',note:'Returned hardware',photo:[],mime:''})).ok,true);
  const sale=await assets.app.createSale(a,1n,{pid:h.ids.alice,email:'alice@lifecycle.test',name:'Alice',street:'PRIVATE ADDRESS',houseNo:'12',postalCode:'8000',town:'Zurich',country:'CH'},30000n,'PRIVATE PRICE NOTE');assert.equal(sale.ok,true,sale.detail);
  const history=await desk.app.personContext(owner,ticket.id,assets.c.id);assert.ok(history.items.some(i=>i.kind==='laptop'&&i.historical));assert.ok(history.items.some(i=>i.kind==='sale'));assert.ok(!JSON.stringify(history,(_,v)=>typeof v==='bigint'?String(v):v).includes('PRIVATE'));
  h.hub.setPrincipal(principal.owner);await h.hub.setLocalUserActive('alice@lifecycle.test',false);await desk.app.syncLifecycle(owner);
  assert.equal((await list(desk,owner)).length,1,'pre-existing HR request receives the event');
  const linked=await desk.app.agentCreate(owner,req);assert.equal(linked.id,ticket.id,'repeated HR requests use one case');
  assert.equal((await desk.app.personContext(owner,ticket.id,assets.c.id)).total,7n,'deactivation retains hardware associations');
 }finally{await pic.tearDown();}
});

test('upgrade baselines do not backfill departures and preserve Lunch and ticket data',{skip:!process.env.KEBAB_LIFECYCLE_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic,true),desk=await connect(pic,h,'desk',true),owner=await desk.login('owner');
  const rt=(await desk.app.catalog(owner)).find(t=>t.fields.length===0);const saved=await desk.app.agentCreate(owner,{typeId:rt.id,subject:'Preserved ticket',body:'Original record',fields:[],requester:'hr@lifecycle.test',priority:'normal',channel:'agent'});assert.equal(saved.ok,true,saved.detail);
  h.hub.setPrincipal(principal.owner);await h.hub.setLocalUserActive('alice@lifecycle.test',false);
  const lunch=createIdentity('lifecycle-lunch').getPrincipal();await h.hub.connectApp({name:'Lunch',canisterId:lunch.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]});
  h.hub.setPrincipal(lunch);const before=await h.hub.team_members();
  await upgrade(pic,h,'hub');await upgrade(pic,desk,'desk');h.hub.setPrincipal(lunch);assert.deepEqual(await h.hub.team_members(),before);
  await desk.app.syncLifecycle(owner);assert.equal((await list(desk,owner)).length,1,'historically inactive people stay quiet');assert.equal((await desk.app.getTicket(owner,saved.id))[0].ticket.body,'Original record');
  h.hub.setPrincipal(principal.owner);await h.hub.setLocalUserActive('alice@lifecycle.test',true);await h.hub.setLocalUserActive('alice@lifecycle.test',false);await desk.app.syncLifecycle(owner);assert.equal((await list(desk,owner)).length,2);
 }finally{await pic.tearDown();}
});

test('late HR requests join one case; renamed templates retain approvals and stale decisions are rejected',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),desk=await connect(pic,h,'desk'),owner=await desk.login('owner'),hr=await desk.login('hr');
  h.hub.setPrincipal(principal.owner);await h.hub.setLocalUserActive('alice@lifecycle.test',false);await desk.app.syncLifecycle(owner);
  const[id]=await list(desk,owner);assert.ok(id);const original=(await desk.app.personOverview(owner,id.id))[0].lifecycle[0];
  let rt=(await desk.app.catalog(owner)).find(t=>t.name==='Offboarding');
  assert.equal((await desk.app.removeType(owner,rt.id)).ok,true);const restored=await desk.app.upsertType(owner,0n,rt);assert.equal(restored.ok,true);rt={...rt,id:restored.id};
  assert.equal((await desk.app.upsertType(owner,rt.id,{...rt,name:'Employee departure',approval:'manager'})).ok,true);
  assert.equal((await desk.app.offboardingEntry(owner,h.ids.alice))[0].typeId[0],rt.id);
  const fields=[['person','alice@lifecycle.test'],['lastDay','2026-09-30'],['manager','owner@lifecycle.test']];
  assert.equal((await desk.app.createRequest(hr,rt.id,'Typo','',fields.map(([k,v])=>[k,k==='person'?'unknown@lifecycle.test':v]))).ok,false,'offboarding must target a known stable identity');
  const req=await desk.app.createRequest(hr,rt.id,'Alice handover','HR confirmation',fields);assert.equal(req.ok,true,req.detail);assert.equal(req.id,id.id);assert.equal((await list(desk,owner)).length,1);assert.equal((await desk.app.createRequest(hr,rt.id,'Alice handover','Repeated click',fields)).ok,false,'merged requests still respect the rate limit');
  const publicView=(await desk.app.getTicket(hr,id.id))[0];assert.ok(publicView);assert.deepEqual(publicView.lifecycle,[]);assert.equal(publicView.ticket.body,'HR confirmation');assert.ok(publicView.events.every(e=>e.kind!=='lifecycle'&&e.kind!=='note'));assert.deepEqual(await desk.app.personOverview(hr,id.id),[]);
  assert.equal((await decide(desk,owner,id.id,true,'Confirmed')).ok,true);
  let view=(await desk.app.getTicket(owner,id.id))[0];assert.equal(view.approval[0].state,'pending');assert.equal(view.ticket.waitingOn,'approval');assert.equal(view.tasks.length,rt.checklist.length);
  assert.equal((await desk.app.setStatus(owner,id.id,'resolved','')).ok,false);assert.equal((await desk.app.decideApproval(owner,id.id,true,'Confirmed manager approval')).ok,true);
  h.hub.setPrincipal(principal.owner);await h.hub.setLocalUserActive('alice@lifecycle.test',true);await desk.app.syncLifecycle(owner);
  assert.equal((await desk.app.decideLifecycle(owner,id.id,original.lastEvent,true,'Stale browser')).ok,false);
  assert.equal((await desk.app.setTask(owner,id.id,0n,'done')).ok,false,'reactivation pauses destructive-work checklist');
  assert.equal((await desk.app.setFields(owner,id.id,fields.map(([k,v])=>[k,k==='person'?'hr@lifecycle.test':v]))).ok,false,'event identity cannot be replaced');
 }finally{await pic.tearDown();}
});

test('other active accounts are reported; source deletion and service accounts do not create departures',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),desk=await connect(pic,h,'desk'),owner=await desk.login('owner');h.hub.setPrincipal(principal.owner);
  const src=await h.hub.addScimSource('Test IdP',[]);assert.equal(src.ok,true);
  await scim(h,src.token,'POST','/scim/v2/Users',{userName:'alice@lifecycle.test',displayName:'Alice',active:true});
  await h.hub.setLocalUserActive('alice@lifecycle.test',false);await desk.app.syncLifecycle(owner);
  const rows=await list(desk,owner);assert.equal(rows.length,1);const c=(await desk.app.personOverview(owner,rows[0].id))[0].lifecycle[0];assert.equal(c.effectiveActive,true,'another account still grants Hub access');
  await scim(h,src.token,'POST','/scim/v2/Users',{userName:'source-only@lifecycle.test',displayName:'Source only',active:true});
  h.hub.setPrincipal(principal.owner);assert.equal((await h.hub.removeScimSource(src.id)).ok,true);await desk.app.syncLifecycle(owner);assert.equal((await list(desk,owner)).length,1,'removing a whole source is not individual offboarding');
  const user=(await h.hub.listUsers({offset:0n,limit:10n,conn:[],search:'hr@lifecycle.test',activeOnly:false})).items[0];assert.ok(user);assert.equal(await h.hub.setUserKinds([user.key],'service'),1n);await h.hub.setLocalUserActive('hr@lifecycle.test',false);await desk.app.syncLifecycle(owner);assert.equal((await list(desk,owner)).length,1);
 }finally{await pic.tearDown();}
});
