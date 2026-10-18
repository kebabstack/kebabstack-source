import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';
const principal=Object.fromEntries(['controller','owner','agent','alice','hr'].map(n=>[n,createIdentity('seat-'+n).getPrincipal()]));
let server;
before(async()=>{server=await PocketIcServer.start();});
after(async()=>{await server?.stop();});
async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
async function install(pic,name){const dir=resolve(name,'backend/dist');return pic.setupCanister({sender:principal.controller,controllers:[principal.controller],wasm:dir+'/backend.wasm',idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ad'.repeat(32)}]:[]});}
async function setup(pic){const h=await install(pic,'hub'),hub=h.actor;hub.setPrincipal(principal.owner);assert.equal((await hub.claimHubWithCode('ad'.repeat(32),{email:'owner@seat.test',displayName:'Owner',orgName:'Seat'})).ok,true);for(const n of ['agent','alice','hr']){hub.setPrincipal(principal.owner);assert.equal(await hub.addLocalUser(n+'@seat.test',n,'',''),true);const[code]=await hub.createInvite(n+'@seat.test');hub.setPrincipal(principal[n]);assert.equal(await hub.claimInvite(code),true);}hub.setPrincipal(principal.owner);await pic.tick(3);const ids={};for(const n of ['owner','agent','alice','hr'])ids[n]=(await hub.personCard(n+'@seat.test'))[0].pid;return {...h,hub,ids};}
async function connect(pic,h,name){const f=await install(pic,name);f.app=f.actor;f.app.setPrincipal(principal.controller);await f.app.setHub(h.canisterId.toText());h.hub.setPrincipal(principal.owner);f.c=await h.hub.connectApp({name,canisterId:f.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name,kind:'app',url:`https://${name}.seat.test`}]});assert.equal(f.c.ok,true,f.c.detail);f.policy={app:name,defaultRole:'member',people:name==='desk'?[{id:h.ids.agent,role:'agent'}]:[],groups:[]};await save(h,f);f.login=async who=>{h.hub.setPrincipal(principal[who]);const t=await h.hub.mintAppTicket('',f.c.tileId);assert.equal(t.ok,true,t.detail);const [s]=await f.app.loginWithTicket(t.ticket);assert.ok(s,`${name} login ${who}`);return s.token;};return f;}
async function save(h,f){h.hub.setPrincipal(principal.owner);const[v]=await h.hub.getAppPermissions(f.c.id);assert.equal((await h.hub.setAppPermissions(f.c.id,v.revision,f.policy)).ok,true);}
async function refresh(h,...apps){h.hub.setPrincipal(principal.owner);for(const f of apps)assert.equal((await h.hub.checkAppPermissions(f.c.id)).ok,true);}
const decide=async(desk,tok,id,departure,note)=>desk.app.decideLifecycle(tok,id,(await desk.app.personOverview(tok,id))[0].lifecycle[0].lastEvent,departure,note);
const list=(desk,tok)=>desk.app.listTickets(tok,{status:'',queue:'',assignee:'',q:'',view:'all'});
const ok=r=>{assert.equal(r.ok,true,r.detail);return r;};
const contractInput=(title,holders,responsible)=>({title,vendor:'Example Vendor',product:'Seat tool',customerRef:'',responsible,deputy:'',visibility:'team',viewers:[],seats:[5n],holders,tags:[]});
async function clearManual(f,id){const [v]=await f.desk.app.getTicket(f.owner,id);for(let i=0;i<v.tasks.length;i++)if(!String(v.tasks[i].by).startsWith('system:'))ok(await f.desk.app.setTask(f.owner,id,BigInt(i),'done'));}
const seatTask=async(desk,tok,id)=>(await desk.app.getTicket(tok,id))[0].tasks.find(t=>t.title==='Revoke licenses & seats');

test('seat offboarding: Contracts reports held seats, Desk binds the checklist item, owners are told once, release completes it',{timeout:240000},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),desk=await connect(pic,h,'desk'),contracts=await connect(pic,h,'contracts');
  const owner=await desk.login('owner'),hr=await desk.login('hr'),co=await contracts.login('owner');
  await pic.tick(4);
  const a=ok(await contracts.app.createContract(co,contractInput('Design suite',[h.ids.alice],h.ids.owner)));
  const b=ok(await contracts.app.createContract(co,contractInput('Chat tool',[h.ids.alice,h.ids.hr],h.ids.owner)));
  ok(await contracts.app.createContract(co,contractInput('Only responsible',[],h.ids.alice)));
  const f={desk,owner};
  h.hub.setPrincipal(principal.owner);await h.hub.setLocalUserActive('alice@seat.test',false);await desk.app.syncLifecycle(owner);await refresh(h,contracts);
  const [ticket]=await list(desk,owner);assert.ok(ticket);const id=ticket.id;
  assert.deepEqual(await desk.app.offboardingSeats(hr,id),[],'requesters never read seat follow-up');
  let seats=(await desk.app.offboardingSeats(owner,id))[0];assert.equal(seats.context.state,'review');assert.equal(seats.progress.state,'ready');assert.equal(seats.progress.open,2n,'review already shows the held seats');
  ok(await decide(desk,owner,id,true,'Departure confirmed by HR'));
  seats=(await desk.app.offboardingSeats(owner,id))[0];assert.equal(seats.context.state,'active');assert.equal(seats.progress.total,2n);assert.equal(seats.progress.open,2n);
  const task=await seatTask(desk,owner,id);assert.equal(task.state,'open');assert.equal(task.by,'system:contracts');
  const idx=(await desk.app.getTicket(owner,id))[0].tasks.findIndex(t=>t.title==='Revoke licenses & seats');
  assert.equal((await desk.app.setTask(owner,id,BigInt(idx),'done')).ok,false,'seat checkbox cannot be ticked by hand');
  await desk.app.offboardingHardware(owner,id);await clearManual(f,id);
  const blocked=await desk.app.setStatus(owner,id,'resolved','');assert.equal(blocked.ok,false);assert.match(blocked.detail,/checklist item/);
  // The contract owner is told once per case and contract, through the Hub's notify lane.
  await pic.advanceTime(70000);await pic.tick(12);
  h.hub.setPrincipal(principal.owner);let notes=(await h.hub.myNotifications('',50n)).items.filter(n=>n.kind==='contracts.seat');
  assert.equal(notes.length,2,JSON.stringify(notes.map(n=>n.title)));assert.ok(notes.every(n=>/is leaving \(/.test(n.title)&&n.title.includes('release the seat in')));
  await desk.app.offboardingSeats(owner,id);await pic.advanceTime(70000);await pic.tick(12);
  notes=(await h.hub.myNotifications('',50n)).items.filter(n=>n.kind==='contracts.seat');assert.equal(notes.length,2,'repeated syncs never notify twice');
  contracts.app.setPrincipal(principal.hr);await assert.rejects(()=>contracts.app.hub_syncSeats(seats.context),'only the Hub may ask');
  h.hub.setPrincipal(principal.hr);assert.equal((await h.hub.hub_syncSeats(seats.context)).state,'unavailable','only the registered Desk may ask');
  // Releasing the seats in Contracts completes the item without a second click.
  for(const cid of [a.id,b.id]){const [rec]=await contracts.app.getContract(co,cid);ok(await contracts.app.setLicenseAssignments(co,cid,rec.contract.revision,rec.contract.holders.filter(p=>p!==h.ids.alice),[]));}
  seats=(await desk.app.offboardingSeats(owner,id))[0];assert.equal(seats.progress.total,2n,'released seats stay counted');assert.equal(seats.progress.open,0n);
  assert.equal((await seatTask(desk,owner,id)).state,'done');
  // An unreachable Contracts app keeps the last known state instead of blocking the offboarding.
  await pic.stopCanister({sender:principal.controller,canisterId:contracts.canisterId});
  seats=(await desk.app.offboardingSeats(owner,id))[0];assert.equal(seats.progress.state,'unavailable');assert.equal((await seatTask(desk,owner,id)).state,'done');
  await pic.startCanister({sender:principal.controller,canisterId:contracts.canisterId});
  ok(await desk.app.setStatus(owner,id,'resolved',''));
 }finally{await pic.tearDown();}
});

test('seat offboarding: a cancelled departure marks the item not needed and never notifies',{timeout:120000},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const h=await setup(pic),desk=await connect(pic,h,'desk'),contracts=await connect(pic,h,'contracts');
  const owner=await desk.login('owner'),co=await contracts.login('owner');await pic.tick(4);
  ok(await contracts.app.createContract(co,contractInput('Design suite',[h.ids.alice],h.ids.owner)));
  const rt=(await desk.app.catalog(owner)).find(t=>t.name==='Offboarding');
  const request=ok(await desk.app.agentCreate(owner,{typeId:rt.id,subject:'Wrong departure',body:'Entered by mistake',fields:[['person','alice@seat.test'],['lastDay','2026-10-30'],['manager','owner@seat.test']],requester:'hr@seat.test',priority:'normal',channel:'agent'}));
  const [work]=await desk.app.offboardingSeats(owner,request.id);assert.equal(work.progress.open,1n);
  ok(await desk.app.cancelOffboarding(owner,request.id,work.context.revision,'Employment continues; HR entered the wrong person'));
  const [after]=await desk.app.offboardingSeats(owner,request.id);assert.equal(after.context.state,'cancelled');
  assert.equal((await seatTask(desk,owner,request.id)).state,'na');
  const [rec]=await contracts.app.getContract(co,1n);assert.ok(rec.contract.holders.includes(h.ids.alice),'Desk never edits seat assignments');
 }finally{await pic.tearDown();}
});
