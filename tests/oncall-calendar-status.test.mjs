import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer} from '@dfinity/pic';
import {setup,projectSetup,unwrap,key,renew,open,view,identity,idl} from './helpers/oncall.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
const HOUR=3600000000000n,DAY=24n*HOUR;
const revision=async(c)=>(await c.desk.oncallPlan(c.tokens.owner,1n))[0].plan.revision;
const config={title:'Orbit service status',description:'Updates from our response team',slug:'orbit-status',audience:{public:null},enabled:true,services:['API'],retentionDays:30n};
const notice=projectId=>({projectId,incidentId:0n,title:'API latency',message:'Requests may take longer than usual. We are investigating.',services:['API'],phase:{investigating:null},impact:{degraded:null},startsAt:0n,endsAt:0n});
test('partial cover requires recipient consent, respects absences and updates response plus reporting without duplicate duty',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c),d=c.desk,t=c.tokens,now=BigInt(await pic.getTime())*1000000n,start=now+2n*HOUR,end=start+HOUR;
 assert.equal((await d.setOncallAbsence(t.employee,pid,c.ids.alpha,start,end)).err.denied,null);
 unwrap(await d.setOncallAbsence(t.alpha,pid,c.ids.alpha,start,end));
 assert.ok((await d.oncallPlan(t.owner,1n))[0].issues.some(i=>i.kind.unavailable===null));
 const plan=(await d.oncallPlan(t.owner,1n))[0].plan;
 unwrap(await d.setReportingPolicy(t.owner,pid,0n,{currency:'CHF',decimals:2n,readinessRates:[400n,200n],workRate:0n,readinessCode:'READY',workCode:'WORK',costCenter:'OPS',retentionDays:400n}));
 const report=unwrap(await d.prepareReportingPeriod(t.owner,key(22),{projectId:pid,title:'Readiness',startAt:plan.input.startAt,endAt:plan.input.endAt,timezone:'UTC'}));
 const cover=unwrap(await d.requestOncallInterval(t.alpha,1n,await revision(c),0n,start,end,c.ids.owner,'Cover appointment'));
 assert.equal((await d.oncallEffectivePlan(t.owner,1n))[0].segments.length,2);
 assert.equal((await d.decideOncallInterval(t.alpha,1n,await revision(c),cover.id,{accept:null})).err.denied,null);
 unwrap(await d.decideOncallInterval(t.owner,1n,await revision(c),cover.id,{accept:null}));
 const segments=(await d.oncallEffectivePlan(t.owner,1n))[0].segments;
 assert.equal(segments.length,4);assert.equal(segments.find(s=>s.personId===c.ids.owner).endAt-segments.find(s=>s.personId===c.ids.owner).startAt,HOUR);
 assert.equal((await d.oncallPlan(t.owner,1n))[0].issues.length,0);
 assert.ok((await d.requestOncallCover(t.owner,1n,await revision(c),0n,c.ids.beta,'Whole-shift overwrite')).err);
 let r=(await d.reportingPeriod(t.owner,report.id))[0];assert.ok(r.blockers.some(s=>s.includes('Refresh')));unwrap(await d.refreshReportingPeriod(t.owner,report.id,r.period.revision));
 r=(await d.reportingPeriod(t.owner,report.id))[0];const live=r.records.filter(x=>x.state.excluded!==null);assert.equal(live.length,4);assert.equal(live.reduce((sum,x)=>sum+x.endAt-x.startAt,0n),14n*DAY);assert.ok(r.records.some(x=>x.sourceKey.startsWith('superseded:')));
 const again=unwrap(await d.refreshReportingPeriod(t.owner,report.id,r.period.revision));assert.equal((await d.reportingPeriod(t.owner,report.id))[0].records.length,r.records.length);
 await pic.advanceTime(2*3600000+1000);await c.refresh();await renew(c,'alpha');await renew(c,'owner');const incident=await open(c,pid);assert.equal((await view(c,incident.id)).deliveries[0].recipient,c.ids.owner);
 // A replacement already covering Backup cannot accept another layer.
 const other=unwrap(await d.requestOncallInterval(t.alpha,1n,await revision(c),0n,end+HOUR,end+2n*HOUR,c.ids.beta,'Later interval'));
 assert.ok((await d.decideOncallInterval(t.beta,1n,await revision(c),other.id,{accept:null})).err.invalid);
 }finally{await pic.tearDown();}});

test('ending a plan preserves elapsed duty; archive rejects active work and allows scoped history, restore and retention',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{policy:false}),d=c.desk,t=c.tokens,now=BigInt(await pic.getTime())*1000000n;
 assert.ok((await d.archiveOncallProject(t.owner,pid,0n,true)).err.invalid);
 assert.ok((await d.cancelOncallPlan(t.owner,1n,await revision(c),now-1n,'Retroactive cancellation')).err.invalid);
 unwrap(await d.cancelOncallPlan(t.owner,1n,await revision(c),now+HOUR,'Team migration'));
 assert.ok((await d.archiveOncallProject(t.owner,pid,0n,true)).err.invalid,'future cutoff still leaves active service');
 await pic.advanceTime(3601000);await c.refresh();await renew(c);unwrap(await d.archiveOncallProject(t.owner,pid,0n,true));
 assert.equal((await d.oncallPlan(t.alpha,1n)).length,1);assert.equal((await d.oncallEffectivePlan(t.employee,1n)).length,0);
 assert.ok((await d.setOncallResponse(t.owner,pid,0n,{enabled:true,ackMinutes:1n,fallback:c.ids.owner,retentionDays:30n})).err.invalid);
 const p=(await d.oncallPlan(t.owner,1n))[0].plan;assert.ok((await d.saveOncallPlan(t.owner,0n,0n,key(55),{...p.input,startAt:now+2n*DAY,endAt:now+3n*DAY})).err.denied===null);
 unwrap(await d.archiveOncallProject(t.owner,pid,1n,false));
 unwrap(await d.updateOncallProject(t.owner,pid,2n,'Response team','', ['API','Website'],400n));
 const before=(await d.oncallEffectivePlan(t.owner,1n))[0];assert.ok(before.segments.every(s=>s.endAt===now+HOUR));
 await pic.advanceTime(408*86400000);await c.refresh();await renew(c);await pic.advanceTime(11000);await pic.tick(10);assert.equal((await d.oncallPlan(t.owner,1n)).length,0);
 }finally{await pic.tearDown();}});

test('status publication has a strict public DTO, scoped writers, audience separation, fresh confirmations and explicit maintenance completion',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false}),d=c.desk,t=c.tokens;
 assert.equal((await d.setOncallStatus(t.alpha,pid,0n,config)).err.denied,null);
 unwrap(await d.setOncallStatus(t.owner,pid,0n,config));
 assert.equal((await d.publicServiceStatus(config.slug))[0].services[0].state,'unknown');
 assert.equal((await d.publishServiceNotice(t.employee,key(31),0n,0n,notice(pid))).err.denied,null);
 const incident=await open(c,pid,43);const n=unwrap(await d.publishServiceNotice(t.alpha,key(31),0n,0n,{...notice(pid),incidentId:incident.id}));
 assert.equal(unwrap(await d.publishServiceNotice(t.alpha,key(31),0n,0n,{...notice(pid),incidentId:incident.id})).id,n.id);
 let page=(await d.publicServiceStatus(config.slug))[0];assert.equal(page.services[0].state,'degraded');assert.equal(page.notices[0].incidentId,undefined);assert.equal(page.notices[0].by,undefined);assert.equal(page.notices[0].message,undefined);assert.ok(!JSON.stringify(page,(_,v)=>typeof v==='bigint'?String(v):v).includes(c.ids.alpha));
 const other=unwrap(await d.createOncallProject(t.owner,key(32),{name:'Other team',description:'',scope:{internal:''},services:['API']})).id;unwrap(await d.setOncallStatus(t.owner,other,0n,{...config,slug:'other-status'}));
 assert.equal((await d.publishServiceNotice(t.owner,key(33),0n,0n,{...notice(other),incidentId:incident.id})).err.denied,null);
 unwrap(await d.confirmServiceStatus(t.alpha,pid,1n,['API'],1n));assert.equal((await d.publicServiceStatus(config.slug))[0].services[0].state,'degraded','incident overrides green assertion');
 unwrap(await d.publishServiceNotice(t.alpha,key(34),n.id,n.revision,{...notice(pid),incidentId:incident.id,phase:{resolved:null},message:'Recovery verified.'}));assert.equal((await d.publicServiceStatus(config.slug))[0].services[0].state,'operational');
 await pic.advanceTime(3601000);await c.refresh();assert.equal((await d.publicServiceStatus(config.slug))[0].services[0].state,'unknown');
 unwrap(await d.setOncallStatus(t.owner,pid,2n,{...config,audience:{workspace:null}}));assert.deepEqual(await d.publicServiceStatus(config.slug),[]);assert.equal((await d.workspaceServiceStatus(t.employee)).find(p=>p.slug===config.slug).notices.length,0);
 unwrap(await d.publishServiceNotice(t.alpha,key(35),0n,0n,{...notice(pid),message:'INTERNAL_ONLY_SECRET'}));
 unwrap(await d.setOncallStatus(t.owner,pid,3n,config));page=(await d.publicServiceStatus(config.slug))[0];assert.equal(page.notices.length,0);assert.ok(!JSON.stringify(page,(_,v)=>typeof v==='bigint'?String(v):v).includes('INTERNAL_ONLY_SECRET'));
 const now=BigInt(await pic.getTime())*1000000n;unwrap(await d.publishServiceNotice(t.alpha,key(36),0n,0n,{...notice(pid),phase:{scheduled:null},impact:{maintenance:null},startsAt:now+HOUR,endsAt:now+2n*HOUR}));
 assert.equal((await d.publicServiceStatus(config.slug))[0].services[0].state,'unknown');await pic.advanceTime(3*3600000);await pic.tick();await c.refresh();assert.equal((await d.publicServiceStatus(config.slug))[0].services[0].state,'maintenance','maintenance does not silently turn green');
 const http=await d.http_request_update({method:'GET',url:'/status/v1/'+config.slug,headers:[],body:new Uint8Array()});assert.equal(http.status_code,200);assert.ok(!new TextDecoder().decode(http.body).includes('incidentId'));assert.ok(http.headers.some(([k,v])=>k==='Cache-Control'&&v==='no-store'));
 unwrap(await d.setOncallStatus(t.owner,pid,4n,{...config,enabled:false}));assert.deepEqual(await d.publicServiceStatus(config.slug),[]);
 }finally{await pic.tearDown();}});

test('populated 0.19 upgrade preserves plans and payroll, then partial cover/status survive a second candidate upgrade',{skip:!process.env.KEBAB_CALENDAR_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_CALENDAR_BASELINE;const c=await setup(pic,true),pid=await projectSetup(pic,c),d=c.desk,t=c.tokens;
 unwrap(await d.setReportingPolicy(t.owner,pid,0n,{currency:'CHF',decimals:2n,readinessRates:[400n,200n],workRate:0n,readinessCode:'READY',workCode:'WORK',costCenter:'OPS',retentionDays:400n}));const original=(await d.oncallPlan(t.owner,1n))[0];
 const r=unwrap(await d.prepareReportingPeriod(t.owner,key(61),{projectId:pid,title:'Existing draft',startAt:original.plan.input.startAt,endAt:original.plan.input.endAt,timezone:'UTC'}));const prior=(await d.reportingPeriod(t.owner,r.id))[0];
 const wasm=process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm');
 const upgrade=()=>pic.upgradeCanister({canisterId:c.b.canisterId,sender:identity.controller,wasm,upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 await upgrade();c.desk=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),c.b.canisterId);assert.deepEqual((await c.desk.oncallPlan(t.owner,1n))[0],original);assert.deepEqual((await c.desk.reportingPeriod(t.owner,r.id))[0],{...prior,calculation:[]});
 const now=BigInt(await pic.getTime())*1000000n;const cover=unwrap(await c.desk.requestOncallInterval(t.alpha,1n,original.plan.revision,0n,now+HOUR,now+2n*HOUR,c.ids.owner,'Upgrade cover'));unwrap(await c.desk.decideOncallInterval(t.owner,1n,await revision(c),cover.id,{accept:null}));unwrap(await c.desk.setOncallStatus(t.owner,pid,0n,config));unwrap(await c.desk.publishServiceNotice(t.alpha,key(62),0n,0n,notice(pid)));
 const segments=(await c.desk.oncallEffectivePlan(t.owner,1n))[0];await upgrade();assert.deepEqual((await c.desk.oncallEffectivePlan(t.owner,1n))[0],segments);assert.equal((await c.desk.publicServiceStatus(config.slug))[0].notices.length,1);
 }finally{delete process.env.KEBAB_CUSTOMER_BASELINE;await pic.tearDown();}});

test('customer widget exposes only a small public status banner; internal pages and their content remain absent',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),d=c.desk,t=c.tokens;
 const customer=await d.saveCustomerProject(t.owner,0n,0n,{name:'Product',description:'Support',group:'Product Alpha',enabled:true,widgetEnabled:true,origins:['https://product.test'],fields:[]});assert.equal(customer.ok,true);
 const project=(await d.listCustomerProjects(t.owner)).find(p=>p.id===customer.id);assert.ok(project.widgetId);
 const pid=unwrap(await d.createOncallProject(t.owner,key(81),{name:'Product response',description:'',scope:{customer:customer.id},services:['API']})).id;
 unwrap(await d.setOncallStatus(t.owner,pid,0n,{...config,audience:{workspace:null}}));
 unwrap(await d.publishServiceNotice(t.alpha,key(82),0n,0n,{...notice(pid),message:'PRIVATE_WORKSPACE_MESSAGE'}));
 const schema=async()=>{const r=await d.http_request_update({method:'GET',url:`/support/v1/widgets/${project.widgetId}/schema`,headers:[['Origin','https://product.test']],body:new Uint8Array()});assert.equal(r.status_code,200);return JSON.parse(new TextDecoder().decode(r.body));};
 assert.equal((await schema()).serviceStatus,null);
 unwrap(await d.setOncallStatus(t.owner,pid,1n,config));unwrap(await d.publishServiceNotice(t.alpha,key(83),0n,0n,notice(pid)));
 const value=(await schema()).serviceStatus;assert.deepEqual(Object.keys(value).sort(),['hasActiveNotice','slug','title']);assert.equal(value.hasActiveNotice,true);assert.ok(!JSON.stringify(await schema()).includes('PRIVATE_WORKSPACE_MESSAGE'));
 assert.ok((await d.archiveOncallProject(t.owner,pid,0n,true)).err.invalid);
 unwrap(await d.setOncallStatus(t.owner,pid,2n,{...config,enabled:false}));unwrap(await d.archiveOncallProject(t.owner,pid,0n,true));assert.equal((await schema()).serviceStatus,null);
 }finally{await pic.tearDown();}});
