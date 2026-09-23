import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer} from '@dfinity/pic';
import {identity,setup,projectSetup,unwrap,key,step,renew,idl} from './helpers/oncall.mjs';
import {generateRegionalPlan} from '../desk/dist/oncall-regional.js';
let server;before(async()=>server=await PocketIcServer.start());after(async()=>server?.stop());
const HOUR=3600000000000n,DAY=24n*HOUR;
const reminderView=async(c,who='owner')=>(await c.desk.oncallReminders(c.tokens[who],1n))[0];
const revision=async c=>(await c.desk.oncallPlan(c.tokens.owner,1n))[0].plan.revision;
const settings=c=>({enabled:true,coordinators:[c.ids.owner]});
const recipeFor=(date,c)=>({startDate:date,weeks:1n,timezone:'UTC',rotationDays:7n,requirement:{continuous:null},regions:[{name:'Europe',timezone:'Europe/Zurich',startMinute:480n,endMinute:1200n,days:[0n,1n,2n,3n,4n,5n,6n],holidays:[],primary:[c.ids.alpha],backup:[],backupMode:{none:null}},{name:'Americas',timezone:'America/Los_Angeles',startMinute:480n,endMinute:1200n,days:[0n,1n,2n,3n,4n,5n,6n],holidays:[],primary:[c.ids.beta],backup:[],backupMode:{none:null}}]});
async function partial(pic,c,offset=48n*HOUR){const start=BigInt(await pic.getTime())*1000000n+offset;return unwrap(await c.desk.requestOncallInterval(c.tokens.alpha,1n,await revision(c),0n,start,start+HOUR,c.ids.owner,'Synthetic cover'));}

test('regional draft and reusable recipe are atomic, private and immutable after publication',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false,policy:false}),date=new Date(await pic.getTime()+86400000).toISOString().slice(0,10),recipe=recipeFor(date,c),input=generateRegionalPlan(pid,recipe).input,d=c.desk,t=c.tokens;
 assert.equal((await d.saveOncallRegionalPlan(t.alpha,0n,0n,key(30),input,recipe)).err.denied,null);
 const draft=unwrap(await d.saveOncallRegionalPlan(t.owner,0n,0n,key(30),input,recipe));assert.deepEqual((await d.oncallRegionalRecipe(t.owner,draft.id))[0].recipe,recipe);assert.deepEqual(await d.oncallRegionalRecipe(t.alpha,draft.id),[]);
 assert.equal(unwrap(await d.saveOncallRegionalPlan(t.owner,0n,0n,key(30),input,recipe)).id,draft.id);
 assert.equal((await d.saveOncallRegionalPlan(t.owner,0n,0n,key(30),input,{...recipe,rotationDays:1n})).err.stale,null);
 assert.ok((await d.publishOncallPlan(t.owner,draft.id,draft.revision,false)).err.invalid);
 const published=unwrap(await d.publishOncallPlan(t.owner,draft.id,draft.revision,true));assert.equal((await d.oncallRegionalRecipe(t.alpha,draft.id))[0].edited,false);
 assert.ok((await d.saveOncallRegionalPlan(t.owner,draft.id,published.revision,key(30),input,recipe)).err.invalid);
 assert.deepEqual(await d.oncallRegionalRecipe(t.employee,draft.id),[]);
 const second=unwrap(await d.saveOncallRegionalPlan(t.owner,0n,0n,key(31),input,recipe));unwrap(await d.saveOncallPlan(t.owner,second.id,second.revision,key(31),{...input,shifts:input.shifts.map((s,i)=>i? s:{...s,personId:''})}));assert.equal((await d.oncallRegionalRecipe(t.owner,second.id))[0].edited,true);
 }finally{await pic.tearDown();}});

test('reminders default off; central permissions, recipient privacy and daily deduplication are enforced',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{policy:false}),d=c.desk,t=c.tokens;await partial(pic,c);
 await step(pic,c);assert.equal((await reminderView(c)).jobs.length,0);
 assert.equal((await d.setOncallReminders(t.alpha,pid,0n,settings(c))).err.denied,null);
 assert.equal((await d.setOncallReminders(t.employee,pid,0n,settings(c))).err.denied,null);
 assert.ok((await d.setOncallReminders(t.owner,pid,0n,{enabled:true,coordinators:[c.ids.employee]})).err.invalid);
 unwrap(await d.setOncallReminders(t.owner,pid,0n,settings(c)));assert.equal((await d.setOncallReminders(t.owner,pid,0n,settings(c))).err.stale,null);
 await step(pic,c,70000);let v=await reminderView(c);assert.equal(v.jobs.length,2);assert.ok(v.jobs.every(j=>Object.hasOwn(j.status,'accepted')));assert.equal((await reminderView(c,'alpha')).jobs.length,0);assert.deepEqual(await d.oncallReminders(t.employee,pid),[]);
 c.hub.setPrincipal(identity.owner);let inbox=await c.hub.myNotifications('',100n);assert.equal(inbox.items.filter(n=>n.kind==='desk.oncall.planning').length,2);
 await step(pic,c,120000);assert.equal((await reminderView(c)).jobs.length,2);inbox=await c.hub.myNotifications('',100n);assert.equal(inbox.items.filter(n=>n.kind==='desk.oncall.planning').length,2);
 assert.ok(inbox.items.filter(n=>n.kind==='desk.oncall.planning').every(n=>!n.title.includes('Synthetic')));
 }finally{await pic.tearDown();}});

test('cover consent cancels queued retries; revoked contacts receive no later reminders',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{policy:false}),d=c.desk,t=c.tokens,cover=await partial(pic,c,12n*HOUR);
 c.hub.setPrincipal(identity.owner);await c.hub.setConnectorLanes(c.conn.id,['identity','profile','groups']);unwrap(await d.setOncallReminders(t.owner,pid,0n,{enabled:true,coordinators:[c.ids.beta]}));await step(pic,c,70000);
 let jobs=(await reminderView(c)).jobs;assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.attempts===1n&&Object.hasOwn(j.status,'pending')));
 unwrap(await d.decideOncallInterval(t.owner,1n,await revision(c),cover.id,{accept:null}));
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,[],['beta@customer.test']);await c.refresh();await c.hub.setConnectorLanes(c.conn.id,['identity','profile','groups','notify']);await step(pic,c,70000);
 jobs=(await reminderView(c)).jobs;assert.ok(jobs.every(j=>Object.hasOwn(j.status,'cancelled')));assert.deepEqual(await d.oncallReminders(t.beta,pid),[]);
 c.hub.setPrincipal(identity.owner);assert.equal((await c.hub.myNotifications('',100n)).items.filter(n=>n.kind==='desk.oncall.planning').length,0);
 }finally{await pic.tearDown();}});

test('failed reminders stop after three attempts and paused policies cancel pending work',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{plan:false,policy:false}),d=c.desk,t=c.tokens;
 c.hub.setPrincipal(identity.owner);await c.hub.setConnectorLanes(c.conn.id,['identity','profile','groups']);unwrap(await d.setOncallReminders(t.owner,pid,0n,settings(c)));
 await step(pic,c,70000);await step(pic,c,70000);await step(pic,c,130000);let [job]=(await reminderView(c)).jobs;assert.equal(job.attempts,3n);assert.equal(job.status.failed,null);
 await step(pic,c,300000);assert.equal((await reminderView(c)).jobs[0].attempts,3n);
 unwrap(await d.setOncallReminders(t.owner,pid,1n,{enabled:true,coordinators:[c.ids.alpha]}));await step(pic,c,70000);assert.ok((await reminderView(c)).jobs.some(j=>j.status.pending===null));
 unwrap(await d.setOncallReminders(t.owner,pid,2n,{enabled:false,coordinators:[c.ids.alpha]}));assert.ok((await reminderView(c)).jobs.some(j=>j.status.cancelled===null));
 await pic.advanceTime(9*86400000);await pic.tick(50);await renew(c);assert.equal((await reminderView(c)).jobs.length,0);
 }finally{await pic.tearDown();}});

test('one near-start follow-up, future coverage and resolved gaps are checked against published plans',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),pid=await projectSetup(pic,c,{policy:false}),d=c.desk,t=c.tokens;await partial(pic,c,26n*HOUR);unwrap(await d.setOncallReminders(t.owner,pid,0n,settings(c)));await step(pic,c,70000);
 await pic.advanceTime(3*3600000);await renew(c);await step(pic,c,70000);let jobs=(await reminderView(c)).jobs.filter(j=>j.source.cover);assert.equal(jobs.length,2);assert.ok(jobs.some(j=>j.source.cover.urgent));await step(pic,c,120000);assert.equal((await reminderView(c)).jobs.filter(j=>j.source.cover).length,2);
 const plan=(await d.oncallPlan(t.owner,1n))[0].plan,end=plan.input.endAt,window={startAt:end,endAt:end+7n*DAY,layer:0n};const next=unwrap(await d.saveOncallPlan(t.owner,0n,0n,key(70),{projectId:pid,timezone:'UTC',template:'Continuation',startAt:end,endAt:window.endAt,layers:['Primary'],windows:[window],shifts:[{...window,personId:c.ids.alpha}]}));unwrap(await d.publishOncallPlan(t.owner,next.id,next.revision,false));
 await pic.advanceTime(86400000);await renew(c);await step(pic,c,70000);assert.equal((await reminderView(c)).jobs.filter(j=>j.source.planning).length,1,'a contiguous published continuation stops the next daily reminder');
 }finally{await pic.tearDown();}});

test('populated 0.20 upgrade preserves calendar/status/payroll; regional rules and reminders survive a second upgrade',{skip:!process.env.KEBAB_REGIONAL_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_REGIONAL_BASELINE;const c=await setup(pic,true),pid=await projectSetup(pic,c,{policy:false}),d=c.desk,t=c.tokens;
 const cover=await partial(pic,c);unwrap(await d.setOncallStatus(t.owner,pid,0n,{title:'Status',description:'',slug:'upgrade',audience:{public:null},enabled:true,services:['API'],retentionDays:30n}));
 unwrap(await d.setReportingPolicy(t.owner,pid,0n,{currency:'CHF',decimals:2n,readinessRates:[100n,50n],workRate:0n,readinessCode:'READY',workCode:'WORK',costCenter:'OPS',retentionDays:400n}));const original=(await d.oncallPlan(t.owner,1n))[0];const report=unwrap(await d.prepareReportingPeriod(t.owner,key(80),{projectId:pid,title:'Before upgrade',startAt:original.plan.input.startAt,endAt:original.plan.input.endAt,timezone:'UTC'}));
 const before={plan:await d.oncallPlan(t.owner,1n),effective:await d.oncallEffectivePlan(t.owner,1n),report:await d.reportingPeriod(t.owner,report.id),status:await d.publicServiceStatus('upgrade')};
 const upgrade=async()=>{await pic.upgradeCanister({canisterId:c.b.canisterId,sender:identity.controller,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});c.desk=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),c.b.canisterId);};
 await upgrade();assert.deepEqual(await c.desk.oncallPlan(t.owner,1n),before.plan);assert.deepEqual(await c.desk.oncallEffectivePlan(t.owner,1n),before.effective);assert.deepEqual(await c.desk.reportingPeriod(t.owner,report.id),before.report.map(p=>({...p,calculation:[]})));const afterStatus=await c.desk.publicServiceStatus('upgrade');assert.ok(afterStatus[0].checkedAt>=before.status[0].checkedAt);assert.deepEqual(afterStatus.map(({checkedAt,...s})=>s),before.status.map(({checkedAt,...s})=>s));assert.deepEqual((await reminderView(c)).policy,[]);
 const date=new Date(await pic.getTime()+10*86400000).toISOString().slice(0,10),recipe=recipeFor(date,c),input=generateRegionalPlan(pid,recipe).input,saved=unwrap(await c.desk.saveOncallRegionalPlan(t.owner,0n,0n,key(81),input,recipe));unwrap(await c.desk.setOncallReminders(t.owner,pid,0n,settings(c)));await step(pic,c,70000);const jobs=(await reminderView(c)).jobs;
 await upgrade();assert.deepEqual((await c.desk.oncallRegionalRecipe(t.owner,saved.id))[0].recipe,recipe);assert.deepEqual((await reminderView(c)).jobs,jobs);await step(pic,c,70000);assert.equal((await reminderView(c)).jobs.length,jobs.length);assert.ok(cover.id);
 }finally{delete process.env.KEBAB_CUSTOMER_BASELINE;await pic.tearDown();}});
