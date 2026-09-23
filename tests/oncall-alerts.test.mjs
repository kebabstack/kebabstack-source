import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer} from '@dfinity/pic';
import {identity,setup,projectSetup,unwrap,key,view,step,renew,idl,open} from './helpers/oncall.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
const secret=r=>{assert.ok(r.ok,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.ok;};
async function source(c,pid,n=20){return secret(await c.desk.createOncallAlertSource(c.tokens.owner,key(n),{projectId:pid,name:'Health checks',service:'API',days:90n}));}
async function http(c,s,body={},kind='events',extra={}){const result=await c.desk.http_request_update({method:'POST',url:`/oncall/v1/sources/${s.id}/${kind}`,headers:[['Authorization','Bearer '+s.secret],['Content-Type','application/json']],body:new TextEncoder().encode(JSON.stringify(body)),...extra});return{code:result.status_code,...JSON.parse(new TextDecoder().decode(result.body))};}
async function enabled(c,pid,n){const s=await source(c,pid,n);assert.equal((await http(c,s,{},'test')).code,200);unwrap(await c.desk.setOncallAlertSource(c.tokens.owner,s.id,s.revision,{enable:null}));s.revision++;return s;}
const event=async(pic,extra={})=>({alertId:'outage-001',sequence:'1',occurredAt:String(await pic.getTime()),state:'firing',title:'API unavailable',detail:'Synthetic health check',severity:'major',...extra});
const sources=async(c,p)=>(await c.desk.oncallAlertSources(c.tokens.owner,p))[0];

test('source credentials are scoped, write-only, tested before enabling and centrally administered',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false}),s=await source(c,pid),d=c.desk,t=c.tokens,input={projectId:pid,name:'Health checks',service:'API',days:90n};
 for(const tok of ['',t.alpha,t.employee]){assert.deepEqual(await d.oncallAlertSources(tok,pid),[]);assert.ok((await d.createOncallAlertSource(tok,key(40),input)).err);assert.equal((await d.setOncallAlertSource(tok,s.id,1n,{enable:null})).err.denied,null);assert.ok((await d.rotateOncallAlertKey(tok,s.id,1n,90n)).err);}
 const publicSource=(await sources(c,pid))[0];assert.ok(!('hash'in publicSource));assert.ok(!('secret'in publicSource));assert.match(s.secret,/^[a-f0-9]{64}$/);
 assert.equal(secret(await d.createOncallAlertSource(t.owner,key(20),input)).secret,'','retries never disclose an existing key');
 assert.ok((await d.createOncallAlertSource(t.owner,key(20),{...input,service:'Other'})).err);
 assert.ok((await d.setOncallAlertSource(t.owner,s.id,1n,{enable:null})).err.invalid);
 const gateway=await d.http_request({method:'POST',url:`/oncall/v1/sources/${s.id}/events`,headers:[],body:new Uint8Array()});assert.deepEqual(gateway.upgrade,[true]);
 const e=await event(pic);assert.equal((await http(c,s,e)).code,409);assert.equal((await http(c,{...s,secret:'f'.repeat(64)},e)).code,401);
 assert.equal((await http(c,s,{},'test',{headers:[['Authorization','Bearer '+s.secret],['Content-Type','application/json; charset=utf-8']]})).code,200);assert.equal((await d.oncallResponse(t.owner,pid))[0].incidents.length,0,'test cannot create an incident');
 unwrap(await d.setOncallAlertSource(t.owner,s.id,1n,{enable:null}));
 const other=await source(c,pid,21);assert.equal((await http(c,{...other,secret:s.secret},e)).code,401,'key bound to its source');
 assert.equal((await http(c,s,e,'events',{headers:[['Authorization','Bearer '+s.secret],['Content-Type','application/json'],['Origin','https://site.test']]})).code,403);
 assert.equal((await http(c,s,{...e,projectId:999})).code,400);
 const created=await http(c,s,e);assert.equal(created.code,202);const v=await view(c,BigInt(created.incidentId));assert.equal(v.incident.projectId,pid);assert.equal(v.incident.service,'API');assert.equal(v.incident.openedBy,'source:'+s.id);
 assert.deepEqual(await d.oncallIncident(s.secret,v.incident.id),[],'ingest key grants no staff reads');
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,[],['beta@customer.test']);await c.refresh();assert.deepEqual(await d.oncallIncident(t.beta,v.incident.id),[]);
 }finally{await pic.tearDown();}});

test('concurrent key creation and rotation recheck idempotency and revisions after randomness',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false}),input={projectId:pid,name:'First sender',service:'API',days:90n};
 const raced=await Promise.all([c.desk.createOncallAlertSource(c.tokens.owner,key(77),input),c.desk.createOncallAlertSource(c.tokens.owner,key(77),{...input,name:'Other sender'})]);
 assert.equal(raced.filter(x=>x.ok).length,1);assert.equal((await sources(c,pid)).length,1);
 const s=raced.find(x=>x.ok).ok;
 const rotated=await Promise.all([c.desk.rotateOncallAlertKey(c.tokens.owner,s.id,s.revision,90n),c.desk.rotateOncallAlertKey(c.tokens.owner,s.id,s.revision,90n)]);
 assert.equal(rotated.filter(x=>x.ok).length,1);assert.equal(rotated.filter(x=>x.err).length,1);
 assert.equal((await http(c,rotated.find(x=>x.ok).ok,{},'test')).code,200);
 }finally{await pic.tearDown();}});

test('duplicates, out-of-order recovery and closed occurrences never create extra incidents or change ownership',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false}),s=await enabled(c,pid),e=await event(pic),first=await http(c,s,e),id=BigInt(first.incidentId);
 const concurrent=await Promise.all([http(c,s,e),http(c,s,e)]);assert.ok(concurrent.every(r=>r.code===200&&r.incidentId===String(id)));
 assert.equal((await http(c,s,{...e,title:'Changed retry'})).code,409);
 let v=await view(c,id);assert.equal(v.deliveries.length,1);unwrap(await c.desk.acknowledgeOncallIncident(c.tokens.alpha,id,v.incident.revision));
 const recovery={...e,sequence:'3',state:'recovered'};assert.equal((await http(c,s,recovery)).code,200);v=await view(c,id);assert.equal(v.monitoring[0].condition,'recovered');assert.equal(v.incident.status.acknowledged,null);assert.equal(v.incident.owner,c.ids.alpha);assert.ok(v.events.some(x=>x.kind==='monitoring_recovered'));
 assert.equal((await http(c,s,{...e,sequence:'2'})).code,200);assert.equal((await view(c,id)).monitoring[0].condition,'recovered');
 assert.equal((await http(c,s,{...e,sequence:'4'})).code,200);v=await view(c,id);assert.equal(v.deliveries.length,1);assert.equal(v.monitoring[0].condition,'firing');
 unwrap(await c.desk.resolveOncallIncident(c.tokens.alpha,id,v.incident.revision,'Verified recovery in synthetic test'));
 assert.equal((await http(c,s,{...e,sequence:'5'})).code,200);v=await view(c,id);assert.equal(v.incident.status.resolved,null);
 const early={...e,alertId:'recovery-first',sequence:'2',state:'recovered'};assert.equal((await http(c,s,early)).incidentId,null);assert.equal((await http(c,s,{...early,sequence:'1',state:'firing'})).incidentId,null);assert.equal((await http(c,s,{...early,sequence:'3',state:'firing'})).incidentId,null);
 assert.equal((await c.desk.oncallResponse(c.tokens.owner,pid))[0].incidents.length,1);
 assert.equal((await http(c,s,{...e,alertId:'new-outage'})).code,202,'a new occurrence starts new response');
 }finally{await pic.tearDown();}});

test('key rotation, pause, revocation and strict payload/rate bounds are enforced by HTTP update',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false}),s=await enabled(c,pid),e=await event(pic),d=c.desk;
 const malformed=['{','{"a":'.repeat(10)+'0'+'}'.repeat(10),JSON.stringify(e).replace('"sequence":"1"','"sequence":"1","sequence":"2"')];
 for(const text of malformed)assert.equal((await http(c,s,e,'events',{body:new TextEncoder().encode(text)})).code,400);
 for(const field of [{sequence:1},{state:'resolved'},{occurredAt:'1'},{sequence:'0'},{occurredAt:String(await pic.getTime()+3600000)},{alertId:'bad@id'},{title:'x'}])assert.equal((await http(c,s,{...e,...field})).code,400);
 assert.equal((await http(c,s,e,'events',{body:new Uint8Array(8001)})).code,413);
 assert.equal((await http(c,s,e,'events',{headers:[['Authorization','Bearer '+s.secret],['Authorization','Bearer '+s.secret],['Content-Type','application/json']]})).code,401);
 const rotated=secret(await d.rotateOncallAlertKey(c.tokens.owner,s.id,2n,1n));assert.notEqual(s.secret,rotated.secret);assert.equal((await http(c,s,e)).code,202);assert.equal((await http(c,rotated,e)).code,200);
 await pic.advanceTime(16*60000);await c.refresh();assert.equal((await http(c,s,{},'test')).code,401);assert.equal((await http(c,rotated,{},'test')).code,200);
 unwrap(await d.setOncallAlertSource(c.tokens.owner,s.id,3n,{pause:null}));assert.equal((await http(c,rotated,e)).code,409);unwrap(await d.setOncallAlertSource(c.tokens.owner,s.id,4n,{enable:null}));
 let limited=false;for(let n=0;n<61;n++){const r=await http(c,rotated,e);if(r.code===429){limited=true;break;}}assert.ok(limited);assert.match((await sources(c,pid))[0].lastError,/Rate limit/);
 unwrap(await d.setOncallAlertSource(c.tokens.owner,s.id,5n,{revoke:null}));assert.equal((await http(c,rotated,e)).code,401);assert.ok((await d.rotateOncallAlertKey(c.tokens.owner,s.id,6n,90n)).err);
 const exp=await enabled(c,pid,88);await pic.advanceTime(91*86400000);assert.equal((await http(c,exp,{},'test')).code,401);
 }finally{await pic.tearDown();}});

test('recovery leaves escalation running; intake remains available when Hub directory checks fail',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c),s=await enabled(c,pid),e=await event(pic),r=await http(c,s,e),id=BigInt(r.incidentId);
 await http(c,s,{...e,sequence:'2',state:'recovered'});let v=await view(c,id);assert.equal(v.incident.status.open,null);assert.ok(v.incident.nextEscalation>0n);
 await step(pic,c,61000);v=await view(c,id);assert.ok(v.deliveries.length>=2,'monitor recovery cannot suppress unacknowledged response');
 await pic.stopCanister({sender:identity.controller,canisterId:c.h.canisterId});await pic.advanceTime(70000);await pic.tick(35);
 assert.deepEqual(await c.desk.oncallIncident(c.tokens.owner,id),[],'protected reads fail closed with stale directory');
 const newEvent=await event(pic,{alertId:'hub-down'});const received=await http(c,s,newEvent);assert.equal(received.code,202,'scoped machine key still records an incident during directory outage');
 await pic.startCanister({sender:identity.controller,canisterId:c.h.canisterId});await step(pic,c);assert.ok(await view(c,BigInt(received.incidentId)));
 }finally{await pic.tearDown();}});

test('retention removes incident content while digest markers prevent recreation and old exact replays are rejected',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false}),s=await enabled(c,pid),e=await event(pic),r=await http(c,s,e),id=BigInt(r.incidentId);
 let v=await view(c,id);unwrap(await c.desk.acknowledgeOncallIncident(c.tokens.alpha,id,v.incident.revision));v=await view(c,id);unwrap(await c.desk.resolveOncallIncident(c.tokens.alpha,id,v.incident.revision,'Verified restored service'));
 await pic.advanceTime(31*86400000);await pic.tick(40);await renew(c);assert.deepEqual(await c.desk.oncallIncident(c.tokens.owner,id),[]);
 assert.equal((await http(c,s,e)).code,400,'old timestamps cannot recreate erased payload');
 const retry={...e,sequence:'2',occurredAt:String(await pic.getTime())};assert.match((await http(c,s,retry)).outcome,/closed/);assert.equal((await c.desk.oncallResponse(c.tokens.owner,pid))[0].incidents.length,0);
 }finally{await pic.tearDown();}});

test('populated 0.17 upgrade preserves response and a second upgrade preserves source credentials and deduplication',{skip:!process.env.KEBAB_ALERTS_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_ALERTS_BASELINE;const c=await setup(pic,true),pid=await projectSetup(pic,c,{plan:false}),manual=await open(c,pid);
 const prior=await view(c,manual.id);
 async function upgrade(){await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});c.desk=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),c.b.canisterId);await c.refresh();}
 await upgrade();const after=await view(c,manual.id);assert.deepEqual(after.incident,prior.incident);assert.deepEqual(after.events,prior.events);assert.deepEqual(after.monitoring,[]);
 const s=await enabled(c,pid),e=await event(pic),r=await http(c,s,e);await upgrade();const duplicate=await http(c,s,e);assert.equal(duplicate.incidentId,r.incidentId);assert.equal(duplicate.code,200);assert.equal((await sources(c,pid))[0].enabled,true);assert.equal((await c.desk.oncallResponse(c.tokens.owner,pid))[0].incidents.length,2);
 }finally{await pic.tearDown();}});
