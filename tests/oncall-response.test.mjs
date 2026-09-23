import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
const names=['controller','owner','alpha','beta','employee'];
const identity=Object.fromEntries(names.map(n=>[n,createIdentity('oncall-response-'+n).getPrincipal()]));
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
async function install(pic,name,baseline=false){const dir=baseline?process.env.KEBAB_CUSTOMER_BASELINE:resolve(name,'backend/dist');return pic.setupCanister({sender:identity.controller,controllers:[identity.controller],wasm:name==='desk'&&!baseline&&process.env.KEBAB_CUSTOMER_WASM?process.env.KEBAB_CUSTOMER_WASM:dir+'/backend.wasm',idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ac'.repeat(32)}]:[]});}
async function setup(pic,baseline=false){
 const h=await install(pic,'hub'),hub=h.actor;hub.setPrincipal(identity.owner);assert.equal((await hub.claimHubWithCode('ac'.repeat(32),{email:'owner@customer.test',displayName:'Owner',orgName:'Customer tests'})).ok,true);
 for(const n of ['alpha','beta','employee']){hub.setPrincipal(identity.owner);await hub.addLocalUser(n+'@customer.test',n,'','');const[code]=await hub.createInvite(n+'@customer.test');hub.setPrincipal(identity[n]);await hub.claimInvite(code);}
 hub.setPrincipal(identity.owner);const ids={};for(const n of names.slice(1))ids[n]=(await hub.personCard(n+'@customer.test'))[0].pid;
 const group=(await hub.addGroup('Product Alpha','')).id;await hub.setGroupMembers(group,['alpha@customer.test'],[]);
 const b=await install(pic,'desk',baseline),desk=b.actor;desk.setPrincipal(identity.controller);await desk.setHub(h.canisterId.toText());
 const conn=await hub.connectApp({name:'desk',canisterId:b.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Desk',kind:'app',url:'https://desk.customer.test'}]});
 const[policy]=await hub.getAppPermissions(conn.id);assert.equal((await hub.setAppPermissions(conn.id,policy.revision,{app:'desk',defaultRole:'member',people:['alpha','beta'].map(n=>({id:ids[n],role:'agent'})),groups:[]})).ok,true);
 const tokens={};for(const n of ['owner','alpha','beta','employee']){hub.setPrincipal(identity[n]);const ticket=await hub.mintAppTicket('',conn.tileId);const[s]=await desk.loginWithTicket(ticket.ticket);assert.ok(s,n);tokens[n]=s.token;}
 hub.setPrincipal(identity.owner);await desk.updateSettings(tokens.owner,{appUrl:'https://desk.customer.test',orgName:'Customers',agentGroup:'',adminGroup:'',keyPrefix:'SUP',autoCloseDays:7n});
 const refresh=async()=>{hub.setPrincipal(identity.owner);assert.equal((await hub.checkAppPermissions(conn.id)).ok,true);};
 return{h,hub,desk,b,tokens,group,ids,refresh,conn};
}
const unwrap=r=>{assert.ok(r.ok,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.ok;};
const key=n=>n.toString(16).padStart(32,'0');
async function projectSetup(pic,c,{plan=true,policy=true}={}){
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,['beta@customer.test'],[]);await c.refresh();
 const id=unwrap(await c.desk.createOncallProject(c.tokens.owner,key(1),{name:'Response team',description:'Synthetic test',scope:{internal:'Product Alpha'},services:['API']})).id;
 if(plan){const startAt=BigInt(await pic.getTime()+60000)*1_000_000n,endAt=startAt+7n*86400000000000n,window={startAt,endAt,layer:0n};
  const p=unwrap(await c.desk.saveOncallPlan(c.tokens.owner,0n,0n,key(2),{projectId:id,startAt,endAt,timezone:'UTC',layers:['Primary','Backup'],windows:[window,{...window,layer:1n}],shifts:[{...window,personId:c.ids.alpha},{...window,layer:1n,personId:c.ids.beta}],template:'Test'}));
  unwrap(await c.desk.publishOncallPlan(c.tokens.owner,p.id,p.revision,false));await pic.advanceTime(61000);await c.refresh();}
 if(policy)unwrap(await c.desk.setOncallResponse(c.tokens.owner,id,0n,{enabled:true,ackMinutes:1n,fallback:c.ids.owner,retentionDays:30n}));
 return id;
}
const incidentInput=projectId=>({projectId,service:'API',title:'Synthetic outage',detail:'No customer data',severity:{major:null}});
async function open(c,pid,k=3){return unwrap(await c.desk.openOncallIncident(c.tokens.alpha,key(k),incidentInput(pid)));}
async function step(pic,c,ms=11000){await pic.advanceTime(ms);await c.refresh();await pic.advanceTime(11000);await pic.tick(35);}
async function renew(c,who='owner'){c.hub.setPrincipal(identity[who]);const t=await c.hub.mintAppTicket('',c.conn.tileId);c.tokens[who]=(await c.desk.loginWithTicket(t.ticket))[0].token;}
const view=async(c,id)=>(await c.desk.oncallIncident(c.tokens.owner,id))[0];

test('response configuration and every incident action enforce central roles and project membership',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false,policy:false}),d=c.desk,t=c.tokens,policy={enabled:true,ackMinutes:1n,fallback:c.ids.owner,retentionDays:30n};
 assert.equal((await d.setOncallResponse(t.alpha,pid,0n,policy)).err.denied,null);
 assert.ok((await d.setOncallResponse(t.owner,pid,0n,{...policy,fallback:c.ids.employee})).err.invalid);
 unwrap(await d.setOncallResponse(t.owner,pid,0n,policy));assert.equal((await d.setOncallResponse(t.owner,pid,0n,policy)).err.stale,null);
 const i=await open(c,pid);assert.equal((await open(c,pid)).id,i.id,'safe creation retry');
 assert.equal((await d.openOncallIncident(t.employee,key(4),incidentInput(pid))).err.denied,null);
 for(const token of ['',t.employee]){assert.deepEqual(await d.oncallResponse(token,pid),[]);assert.deepEqual(await d.oncallIncident(token,i.id),[]);assert.equal((await d.acknowledgeOncallIncident(token,i.id,1n)).err.denied,null);assert.equal((await d.noteOncallIncident(token,i.id,1n,'Forbidden')).err.denied,null);assert.equal((await d.recordOncallWork(token,i.id,key(9),{startAt:0n,endAt:1n,breakMinutes:0n,note:'No'})).err.denied,null);}
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,[],['beta@customer.test']);await c.refresh();assert.deepEqual(await d.oncallIncident(t.beta,i.id),[]);assert.equal((await d.handoffOncallIncident(t.beta,i.id,1n,c.ids.alpha,'No')).err.denied,null);
 const v=await view(c,i.id);assert.equal(v.deliveries[0].recipient,c.ids.owner,'no plan routes directly to explicit fallback');
 }finally{await pic.tearDown();}});

test('durable escalation reaches Hub once per target, moves through layers, and stops at fallback',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c),i=await open(c,pid);await step(pic,c);
 let v=await view(c,i.id);assert.equal(v.deliveries[0].recipient,c.ids.alpha);assert.equal(v.deliveries[0].status.accepted,null);assert.equal(v.incident.status.open,null,'Hub receipt is not acknowledgement');
 c.hub.setPrincipal(identity.alpha);let inbox=await c.hub.myNotifications('',100n);assert.equal(inbox.items.filter(x=>x.kind==='desk.oncall').length,1);assert.ok(inbox.items[0].url.endsWith('/incident-'+i.id));assert.ok(!inbox.items[0].title.includes('Synthetic outage'),'no incident narrative in delivery');
 await step(pic,c,61000);v=await view(c,i.id);assert.equal(v.deliveries[1].recipient,c.ids.beta);assert.equal(v.deliveries[1].status.accepted,null);
 await step(pic,c,61000);v=await view(c,i.id);assert.equal(v.deliveries[2].recipient,c.ids.owner);
 await step(pic,c,61000);v=await view(c,i.id);assert.equal(v.incident.nextEscalation,0n);assert.match(v.incident.routeIssue,/exhausted/);assert.equal(v.deliveries.length,3);
 }finally{await pic.tearDown();}});

test('acknowledgement races have one winner; handoff requires consent and access loss reopens response',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c),i=await open(c,pid),d=c.desk,t=c.tokens;
 const raced=await Promise.all([d.acknowledgeOncallIncident(t.alpha,i.id,1n),d.acknowledgeOncallIncident(t.owner,i.id,1n)]);assert.equal(raced.filter(x=>x.ok).length,1);assert.equal(raced.filter(x=>x.err?.stale===null).length,1);
 await step(pic,c,70000);let v=await view(c,i.id);assert.equal(v.deliveries.length,1);assert.equal(v.deliveries[0].status.cancelled,null);const original=v.incident.owner;
 unwrap(await d.handoffOncallIncident(t.owner,i.id,v.incident.revision,c.ids.beta,'Investigating the cause; next check is deployment status.'));v=await view(c,i.id);assert.equal(v.incident.owner,original);
 assert.equal((await d.decideOncallHandoff(t.owner,i.id,v.incident.revision,{accept:null})).err.denied,null);
 unwrap(await d.decideOncallHandoff(t.beta,i.id,v.incident.revision,{accept:null}));v=await view(c,i.id);assert.equal(v.incident.owner,c.ids.beta);
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,[],['beta@customer.test']);await step(pic,c);v=await view(c,i.id);assert.equal(v.incident.status.open,null);assert.equal(v.incident.owner,'');assert.ok(v.events.some(e=>e.kind==='owner_unavailable'));assert.deepEqual(await d.oncallIncident(t.beta,i.id),[]);
 }finally{await pic.tearDown();}});

test('actual work is explicit, personal, retry-safe and corrected without overwriting evidence',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false}),i=await open(c,pid),d=c.desk,t=c.tokens,startAt=(await view(c,i.id)).incident.openedAt;
 unwrap(await d.acknowledgeOncallIncident(t.alpha,i.id,i.revision));await step(pic,c,120000);
 const input={startAt,endAt:startAt+60000000000n,breakMinutes:0n,note:'Checked error logs'},record=unwrap(await d.recordOncallWork(t.alpha,i.id,key(10),input));
 assert.equal(unwrap(await d.recordOncallWork(t.alpha,i.id,key(10),input)).id,record.id);assert.ok((await d.recordOncallWork(t.alpha,i.id,key(11),input)).err.invalid);
 assert.ok((await d.recordOncallWork(t.alpha,i.id,key(12),{...input,endAt:startAt+86400000000000n})).err.invalid);
 assert.equal((await d.voidOncallWork(t.owner,record.id,'Cannot invent somebody else’s time')).err.denied,null);
 unwrap(await d.voidOncallWork(t.alpha,record.id,'Wrong end time'));unwrap(await d.recordOncallWork(t.alpha,i.id,key(13),{...input,endAt:startAt+90000000000n}));
 let v=await view(c,i.id);assert.equal(v.work.length,2);assert.ok(v.work[0].voidedAt>0n);assert.equal(v.work[1].voidedAt,0n);
 unwrap(await d.resolveOncallIncident(t.alpha,i.id,v.incident.revision,'Service checks are passing after rollback'));v=await view(c,i.id);assert.equal(v.incident.status.resolved,null);assert.equal(v.work.length,2,'resolution never creates invented worked time');
 await pic.advanceTime(31*86400000);await pic.tick(40);await renew(c);assert.deepEqual(await d.oncallIncident(t.owner,i.id),[],'retention removes incident and associated work');
 }finally{await pic.tearDown();}});

test('pending delivery survives an upgrade and a populated planning upgrade preserves plans', {skip:!process.env.KEBAB_RESPONSE_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_RESPONSE_BASELINE;const c=await setup(pic,true),pid=await projectSetup(pic,c,{policy:false});
 const before=await c.desk.oncallWorkspace(c.tokens.owner,pid);
 async function upgrade(){await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});c.desk=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),c.b.canisterId);await c.refresh();}
 await upgrade();assert.deepEqual(await c.desk.oncallWorkspace(c.tokens.owner,pid),before);unwrap(await c.desk.setOncallResponse(c.tokens.owner,pid,0n,{enabled:true,ackMinutes:1n,fallback:c.ids.owner,retentionDays:30n}));
 const i=await open(c,pid);assert.equal((await view(c,i.id)).deliveries[0].status.pending,null);await upgrade();await step(pic,c);const v=await view(c,i.id);assert.equal(v.deliveries[0].status.accepted,null);assert.equal(v.deliveries.length,1);assert.equal(v.incident.status.open,null);
 }finally{await pic.tearDown();}});

test('Hub delivery failure stays visible, retries are bounded, and later recovery reuses the delivery key',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false});
 unwrap(await c.desk.setOncallResponse(c.tokens.owner,pid,1n,{enabled:true,ackMinutes:10n,fallback:c.ids.owner,retentionDays:30n}));
 c.hub.setPrincipal(identity.owner);assert.equal((await c.hub.setConnectorLanes(c.conn.id,['identity','profile','groups'])).ok,true);
 const i=await open(c,pid);await step(pic,c);let v=await view(c,i.id);assert.equal(v.deliveries[0].attempts,1n);assert.equal(v.deliveries[0].status.pending,null);assert.equal(v.deliveries[0].acceptedAt,0n);assert.match(v.deliveries[0].detail,/notify lane/,'provider rejection explains the operator action');
 await step(pic,c,21000);v=await view(c,i.id);assert.equal(v.deliveries[0].attempts,2n);
 c.hub.setPrincipal(identity.owner);await c.hub.setConnectorLanes(c.conn.id,['identity','profile','groups','notify']);await step(pic,c,41000);v=await view(c,i.id);assert.equal(v.deliveries[0].attempts,3n);assert.equal(v.deliveries[0].status.accepted,null);assert.equal(v.deliveries.length,1);
 const other=await open(c,pid,50);c.hub.setPrincipal(identity.owner);await c.hub.setConnectorLanes(c.conn.id,['identity','profile','groups']);
 await step(pic,c);await step(pic,c,21000);await step(pic,c,41000);v=await view(c,other.id);assert.equal(v.deliveries[0].status.failed,null);assert.equal(v.deliveries[0].attempts,3n);
 await step(pic,c,50000);assert.equal((await view(c,other.id)).deliveries[0].attempts,3n,'no unbounded retry loop');
 }finally{await pic.tearDown();}});
