import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
import {identity,setup,projectSetup,unwrap,key,step,renew,open,idl} from './helpers/oncall.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
const DAY=86400000000000n,extras=['hr','reviewer','finance','exporter'];
for(const n of extras)identity[n]=createIdentity('reporting-'+n).getPrincipal();
const policy={currency:'CHF',decimals:2n,readinessRates:[400n,200n],workRate:6000n,readinessCode:'READY',workCode:'WORK',costCenter:'OPS',retentionDays:90n};
const revision=async(c,id)=>(await c.desk.reportingPeriod(c.tokens.owner,id))[0].period.revision;
const report=async(c,id,n='owner')=>(await c.desk.reportingPeriod(c.tokens[n],id))[0];
async function grants(c,pid,override){c.hub.setPrincipal(identity.owner);const a=await c.hub.getDeskReportingAccess(c.conn.id);assert.equal(a.ok,true,a.detail);const g=override||[['hr',['compensation']],['reviewer',['time_review']],['finance',['release','export']],['exporter',['export']]].map(([n,capabilities])=>({subject:{person:c.ids[n]},projectId:pid,capabilities}));assert.equal((await c.hub.setDeskReportingAccess(c.conn.id,a.revision,g)).ok,true);await c.refresh();return g;}
async function fixture(pic,{period=true,retention=90n}={}){
 const c=await setup(pic),pid=await projectSetup(pic,c);c.pid=pid;
 for(const n of extras){c.hub.setPrincipal(identity.owner);await c.hub.addLocalUser(n+'@customer.test',n,'','');const[code]=await c.hub.createInvite(n+'@customer.test');c.hub.setPrincipal(identity[n]);await c.hub.claimInvite(code);c.hub.setPrincipal(identity.owner);c.ids[n]=(await c.hub.personCard(n+'@customer.test'))[0].pid;await renew(c,n);}
 await grants(c,pid);unwrap(await c.desk.setReportingPolicy(c.tokens.hr,pid,0n,{...policy,retentionDays:retention}));
 if(!period)return c;
 const plan=(await c.desk.oncallPlan(c.tokens.owner,1n))[0].plan,incident=await open(c,pid,71);c.incident=incident.id;
 const startAt=(await c.desk.oncallIncident(c.tokens.owner,incident.id))[0].incident.openedAt;await step(pic,c,3600000);
 c.work=unwrap(await c.desk.recordOncallWork(c.tokens.alpha,incident.id,key(72),{startAt,endAt:startAt+3600_000_000_000n,breakMinutes:15n,note:'PRIVATE INCIDENT NARRATIVE NEVER IN PAYROLL'})).id;
 await pic.advanceTime(8*86400000);await c.refresh();for(const n of ['owner','alpha','beta','employee',...extras])await renew(c,n);
 c.input={projectId:pid,title:'September fixture',startAt:plan.input.startAt,endAt:plan.input.endAt,timezone:'UTC'};
 c.period=unwrap(await c.desk.prepareReportingPeriod(c.tokens.hr,key(73),c.input)).id;return c;
}
async function approve(c){let v=await report(c,c.period);for(const r of v.records){if(r.state.pending!==undefined){const n=Object.keys(c.ids).find(n=>c.ids[n]===r.personId);unwrap(await c.desk.confirmReportingRecord(c.tokens[n],c.period,r.id,await revision(c,c.period),true,''));}unwrap(await c.desk.reviewReportingRecord(c.tokens.reviewer,c.period,r.id,await revision(c,c.period),true,''));}
 for(const r of v.records)unwrap(await c.desk.setReportingMapping(c.tokens.hr,c.period,await revision(c,c.period),r.personId,r.personId===c.ids.alpha?'=IMPORT("unsafe")':'PAY-BETA'));
}
async function release(c){await approve(c);unwrap(await c.desk.releaseReportingPeriod(c.tokens.finance,c.period,await revision(c,c.period)));return(await c.desk.exportReportingPeriod(c.tokens.exporter,c.period)).ok;}

test('Hub grants scoped reporting without Agent access; project boundaries, groups, revocation and No access hold',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await fixture(pic,{period:false}),d=c.desk,t=c.tokens;
 assert.equal((await d.whoami(t.hr))[0].role,'requester');assert.equal((await d.whoami(t.hr))[0].reporting,true);
 assert.deepEqual(await d.oncallProjects(t.hr),[]);assert.deepEqual(await d.oncallResponse(t.hr,c.pid),[]);assert.deepEqual(await d.listCustomerProjects(t.hr),[]);
 assert.equal((await d.reportingProjects(t.reviewer))[0].policy.length,0);assert.equal((await d.reportingProjects(t.hr))[0].policy[0].workRate,6000n);
 assert.ok((await d.setReportingPolicy(t.reviewer,c.pid,1n,policy)).err.denied===null);
 const other=unwrap(await d.createOncallProject(t.owner,key(90),{name:'Unrelated team',description:'Private',scope:{internal:''},services:['Product']})).id;
 assert.ok(!(await d.reportingProjects(t.hr)).some(p=>p.id===other));assert.ok((await d.setReportingPolicy(t.hr,other,0n,policy)).err.denied===null);
 c.hub.setPrincipal(identity.hr);assert.equal((await c.hub.getDeskReportingAccess(c.conn.id)).ok,false);assert.equal((await c.hub.setDeskReportingAccess(c.conn.id,1n,[])).ok,false);
 await grants(c,c.pid,[{subject:{group:c.group},projectId:c.pid,capabilities:['export']}]);
 assert.equal((await d.reportingProjects(t.alpha))[0].capabilities.export,true);assert.equal((await d.reportingProjects(t.hr)).length,0);
 c.hub.setPrincipal(identity.owner);assert.equal((await c.hub.setPersonRole('employee@customer.test','admin')).ok,true);c.hub.setPrincipal(identity.employee);assert.equal((await c.hub.setGroupMembers(c.group,['employee@customer.test'],[])).ok,false,'reporting-bearing manual group requires Hub Owner');c.hub.setPrincipal(identity.owner);const summary=(await c.hub.personAppPermissions(c.ids.alpha)).find(x=>x.app==='desk');assert.ok(summary.can.some(x=>x.includes('Export approved payroll')));
 const app=(await c.hub.getAppPermissions(c.conn.id))[0];assert.equal((await c.hub.setAppPermissions(c.conn.id,app.revision,{...app.policy,people:app.policy.people.filter(x=>x.id!==c.ids.alpha).concat([{id:c.ids.alpha,role:'none'}])})).ok,true);await c.refresh();assert.deepEqual(await d.whoami(t.alpha),[]);assert.deepEqual(await d.reportingProjects(t.alpha),[]);
 }finally{await pic.tearDown();}});

test('service evidence requires independent confirmation, review and release; amounts and exported snapshots are exact and immutable',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await fixture(pic),d=c.desk,t=c.tokens,id=c.period;
 assert.equal(unwrap(await d.prepareReportingPeriod(t.hr,key(73),c.input)).id,id);
 assert.ok((await d.prepareReportingPeriod(t.hr,key(74),c.input)).err.invalid);
 let v=await report(c,id);assert.equal(v.records.length,3);assert.ok(!JSON.stringify(v,(_,v)=>typeof v==='bigint'?String(v):v).includes('PRIVATE INCIDENT'));
 const own=await report(c,id,'alpha');assert.equal(own.records.length,2);assert.equal(own.policy.length,0);assert.equal(own.audit.length,0);assert.equal((await report(c,id,'reviewer')).lines.length,0);assert.deepEqual(await d.reportingPeriod(t.employee,id),[]);assert.deepEqual(await d.reportingPeriod(t.exporter,id),[]);
 assert.ok((await d.exportReportingPeriod(t.hr,id)).err);assert.ok((await d.exportReportingPeriod(t.exporter,id)).err);
 const r=own.records[0];assert.ok((await d.reviewReportingRecord(t.alpha,id,r.id,v.period.revision,true,'')).err.denied===null);assert.ok((await d.confirmReportingRecord(t.owner,id,r.id,v.period.revision,true,'')).err.denied===null);
 assert.ok((await d.releaseReportingPeriod(t.finance,id,v.period.revision)).err.invalid);
 await approve(c);assert.ok((await d.releaseReportingPeriod(t.hr,id,await revision(c,id))).err.denied===null);
 unwrap(await d.setReportingPolicy(t.hr,c.pid,1n,{...policy,workRate:999999n}));
 v=await report(c,id);assert.equal(v.lines.find(l=>l.kind.work!==undefined).amount,4500n);assert.deepEqual(v.lines.filter(l=>l.kind.readiness!==undefined).map(l=>l.amount),[67200n,33600n]);assert.equal(v.policy[0].workRate,6000n);
 const stale=v.period.revision;unwrap(await d.setReportingMapping(t.hr,id,stale,c.ids.beta,'PAY-BETA-2'));assert.ok((await d.releaseReportingPeriod(t.finance,id,stale)).err.stale===null);
 unwrap(await d.releaseReportingPeriod(t.finance,id,await revision(c,id)));const a=(await d.exportReportingPeriod(t.exporter,id)).ok,b=(await d.exportReportingPeriod(t.finance,id)).ok;assert.ok(a);assert.equal(a.csv,b.csv);assert.match(a.csv,/"'=IMPORT/);assert.match(a.csv,/,0.750000,60.00,45.00,/);assert.ok(!a.csv.includes('PRIVATE INCIDENT'));assert.equal((await report(c,id,'exporter')).policy.length,1);
 assert.ok((await d.setReportingMapping(t.hr,id,await revision(c,id),c.ids.alpha,'DIFFERENT')).err.stale===null);
 const lateStart=c.input.startAt+2n*DAY;unwrap(await d.recordOncallWork(t.beta,c.incident,key(97),{startAt:lateStart,endAt:lateStart+3600_000_000_000n,breakMinutes:0n,note:'Late entered actual work'}));assert.equal((await report(c,id)).period.sourceChanged,true,'late source evidence is visible without rewriting the statement');assert.equal((await d.exportReportingPeriod(t.finance,id)).ok.csv,a.csv);
 unwrap(await d.voidOncallWork(t.alpha,c.work,'Incorrect elapsed time'));assert.equal((await report(c,id)).period.sourceChanged,true);assert.equal((await d.exportReportingPeriod(t.finance,id)).ok.csv,a.csv,'late void must not change approval revision or CSV');
 const adj=unwrap(await d.prepareReportingAdjustment(t.hr,id,key(80),'Correct work interval')).id;unwrap(await d.addReportingAdjustment(t.hr,adj,await revision(c,adj),key(81),c.ids.alpha,-500n,'Five currency units less'));
 assert.equal(unwrap(await d.addReportingAdjustment(t.hr,adj,1n,key(81),c.ids.alpha,-500n,'Five currency units less')).id,adj,'retry returns original correction');assert.equal((await report(c,adj)).records.length,1);assert.deepEqual(await d.reportingPeriod(t.reviewer,adj),[]);assert.deepEqual(await d.reportingPeriod(t.exporter,adj),[]);
 const ar=(await report(c,adj)).records[0];assert.ok((await d.reviewReportingRecord(t.hr,adj,ar.id,await revision(c,adj),true,'')).err.denied===null);
 unwrap(await d.reviewReportingRecord(t.owner,adj,ar.id,await revision(c,adj),true,''));unwrap(await d.releaseReportingPeriod(t.finance,adj,await revision(c,adj)));const correction=(await d.exportReportingPeriod(t.exporter,adj)).ok;assert.match(correction.csv,/,amount,1,0.00,-5.00,/);assert.notEqual(correction.batchId,a.batchId);assert.equal((await d.exportReportingPeriod(t.exporter,id)).ok.csv,a.csv);
 }finally{await pic.tearDown();}});

test('revoked users and stale directory cannot export; voided source evidence cannot be approved',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await fixture(pic),d=c.desk,t=c.tokens,id=c.period;let v=await report(c,id);const wr=v.records.find(r=>r.kind.work!==undefined);
 unwrap(await d.voidOncallWork(t.alpha,c.work,'Fix the work record'));v=await report(c,id);assert.ok(v.records.find(r=>r.id===wr.id).state.disputed!==undefined);assert.ok((await d.confirmReportingRecord(t.alpha,id,wr.id,v.period.revision,true,'')).err.invalid);assert.ok((await d.reviewReportingRecord(t.reviewer,id,wr.id,v.period.revision,true,'')).err.invalid);
 unwrap(await d.reviewReportingRecord(t.reviewer,id,wr.id,v.period.revision,false,'Voided original evidence'));
 for(const r of (await report(c,id)).records.filter(r=>r.kind.readiness!==undefined)){const n=r.personId===c.ids.alpha?'alpha':'beta';unwrap(await d.confirmReportingRecord(t[n],id,r.id,await revision(c,id),true,''));unwrap(await d.reviewReportingRecord(t.reviewer,id,r.id,await revision(c,id),true,''));unwrap(await d.setReportingMapping(t.hr,id,await revision(c,id),r.personId,n));}
 unwrap(await d.releaseReportingPeriod(t.finance,id,await revision(c,id)));assert.ok((await d.exportReportingPeriod(t.exporter,id)).ok);
 await grants(c,c.pid,[]);assert.ok((await d.exportReportingPeriod(t.exporter,id)).err);assert.deepEqual(await d.reportingPeriod(t.hr,id),[]);
 await pic.advanceTime(61000);assert.ok((await d.exportReportingPeriod(t.owner,id)).err,'stale cache denies even admin');
 }finally{await pic.tearDown();}});

test('departed-person attestations need another reviewer; overlapping actual work is blocked',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await fixture(pic),d=c.desk,t=c.tokens,id=c.period;let v=await report(c,id),r=v.records.find(r=>r.personId===c.ids.alpha&&r.kind.readiness!==undefined);
 c.hub.setPrincipal(identity.owner);const {items:users}=await c.hub.listUsers({activeOnly:false,conn:[],limit:100n,offset:0n,search:''});assert.equal(await c.hub.deactivateUser(users.find(x=>x.email==='alpha@customer.test').key,'Left company'),true);await c.refresh();
 assert.deepEqual(await d.reportingPeriod(t.alpha,id),[]);unwrap(await d.attestDepartedService(t.reviewer,id,r.id,await revision(c,id),'Confirmed by the team handover record'));assert.ok((await d.reviewReportingRecord(t.reviewer,id,r.id,await revision(c,id),true,'')).err.denied===null);unwrap(await d.reviewReportingRecord(t.owner,id,r.id,await revision(c,id),true,''));
 r=(await report(c,id)).records.find(r=>r.kind.work!==undefined);assert.equal(r.personId,c.ids.alpha);assert.equal(r.name,'alpha','historical identity preserved');
 const beta=(await report(c,id)).records.find(r=>r.personId===c.ids.beta);const work={startAt:beta.startAt,endAt:beta.startAt+3600_000_000_000n,breakMinutes:0n,note:'Completed operations work'};
 unwrap(await d.addReportingWork(t.beta,id,await revision(c,id),key(85),work));unwrap(await d.addReportingWork(t.beta,id,await revision(c,id),key(86),work));
 for(const r of (await report(c,id)).records.filter(r=>r.kind.work!==undefined&&r.personId===c.ids.beta))unwrap(await d.reviewReportingRecord(t.reviewer,id,r.id,await revision(c,id),true,''));
 assert.ok((await report(c,id)).blockers.some(x=>x.includes('Overlapping service records')));
 }finally{await pic.tearDown();}});

test('automatic retention deletes payroll data but prevents re-creating a paid period',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await fixture(pic,{retention:30n}),id=c.period;await release(c);await pic.advanceTime(33*86400000);await pic.tick(30);await c.refresh();for(const n of ['owner',...extras])await renew(c,n);
 assert.deepEqual(await c.desk.reportingPeriod(c.tokens.owner,id),[]);assert.ok((await c.desk.exportReportingPeriod(c.tokens.owner,id)).err);
 unwrap(await c.desk.setReportingPolicy(c.tokens.hr,c.pid,1n,{...policy,retentionDays:365n}));assert.ok((await c.desk.prepareReportingPeriod(c.tokens.hr,key(95),c.input)).err.invalid,'minimal project/time marker prevents double reporting after payload deletion');
 }finally{await pic.tearDown();}});


test('populated Hub 0.29 / Desk 0.18 upgrade preserves operations; released statements and grants survive another upgrade',{skip:!process.env.KEBAB_REPORTING_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 process.env.KEBAB_CUSTOMER_BASELINE=resolve(process.env.KEBAB_REPORTING_BASELINE,'desk');process.env.KEBAB_REPORTING_HUB_BASELINE=resolve(process.env.KEBAB_REPORTING_BASELINE,'hub');
 const c=await setup(pic,true);delete process.env.KEBAB_REPORTING_HUB_BASELINE;delete process.env.KEBAB_CUSTOMER_BASELINE;
 const pid=await projectSetup(pic,c),incident=await open(c,pid,99);c.pid=pid;
 const before=(await c.desk.oncallPlan(c.tokens.owner,1n))[0];const source=unwrap(await c.desk.createOncallAlertSource(c.tokens.owner,key(98),{projectId:pid,name:'Kept source',service:'API',days:90n}));
 async function upgrade(){for(const [module,target]of [['hub',c.h],['desk',c.b]])await pic.upgradeCanister({sender:identity.controller,canisterId:target.canisterId,wasm:module==='hub'?(process.env.KEBAB_REPORTING_HUB_WASM||resolve('hub/backend/dist/backend.wasm')):(process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm')),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});c.hub=pic.createActor(await idl(resolve('hub/backend/dist/backend.did')),c.h.canisterId);c.desk=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),c.b.canisterId);await c.refresh();}
 await upgrade();assert.deepEqual((await c.desk.oncallPlan(c.tokens.owner,1n))[0],before);assert.equal((await c.desk.oncallIncident(c.tokens.owner,incident.id))[0].incident.title,'Synthetic outage');assert.equal((await c.desk.oncallAlertSources(c.tokens.owner,pid))[0][0].id,source.id);
 for(const n of extras){c.hub.setPrincipal(identity.owner);await c.hub.addLocalUser(n+'@customer.test',n,'','');const[code]=await c.hub.createInvite(n+'@customer.test');c.hub.setPrincipal(identity[n]);await c.hub.claimInvite(code);c.hub.setPrincipal(identity.owner);c.ids[n]=(await c.hub.personCard(n+'@customer.test'))[0].pid;await renew(c,n);}
 await grants(c,pid);unwrap(await c.desk.setReportingPolicy(c.tokens.hr,pid,0n,policy));await pic.advanceTime(8*86400000);await c.refresh();for(const n of ['owner','alpha','beta',...extras])await renew(c,n);
 c.period=unwrap(await c.desk.prepareReportingPeriod(c.tokens.hr,key(99),{projectId:pid,title:'Upgrade period',startAt:before.plan.input.startAt,endAt:before.plan.input.endAt,timezone:'UTC'})).id;
 const exported=await release(c),prior=await report(c,c.period);await upgrade();assert.equal((await c.desk.exportReportingPeriod(c.tokens.exporter,c.period)).ok.csv,exported.csv);assert.deepEqual((await report(c,c.period)).lines,prior.lines);c.hub.setPrincipal(identity.owner);assert.equal((await c.hub.getDeskReportingAccess(c.conn.id)).grants.length,4);
 }finally{delete process.env.KEBAB_REPORTING_HUB_BASELINE;delete process.env.KEBAB_CUSTOMER_BASELINE;await pic.tearDown();}});

test('payroll uses elapsed DST hours and rounds each work line once in integer minor units',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 await pic.setTime(Date.UTC(2026,2,20,0));const c=await fixture(pic,{period:false}),{generatePlan}=await import('../desk/dist/oncall-planning.js');
 const input=generatePlan({projectId:c.pid,startDate:'2026-03-28',weeks:1,timezone:'Europe/Zurich',primary:[c.ids.alpha],backup:[],rotationDays:1});
 const plan=unwrap(await c.desk.saveOncallPlan(c.tokens.owner,0n,0n,key(111),input));unwrap(await c.desk.publishOncallPlan(c.tokens.owner,plan.id,plan.revision,false));
 await pic.setTime(Date.UTC(2026,3,5,0));await c.refresh();for(const n of ['owner','alpha',...extras])await renew(c,n);
 unwrap(await c.desk.setReportingPolicy(c.tokens.hr,c.pid,1n,{...policy,readinessRates:[1n],workRate:20n}));
 c.period=unwrap(await c.desk.prepareReportingPeriod(c.tokens.hr,key(112),{projectId:c.pid,title:'DST fixture',startAt:input.startAt,endAt:input.endAt,timezone:input.timezone})).id;
 const work={startAt:input.startAt,endAt:input.startAt+90000000000n,breakMinutes:0n,note:'Rounding boundary fixture'};unwrap(await c.desk.addReportingWork(c.tokens.alpha,c.period,1n,key(113),work));assert.equal(unwrap(await c.desk.addReportingWork(c.tokens.alpha,c.period,1n,key(113),work)).id,c.period);
 await approve(c);const v=await report(c,c.period);assert.deepEqual(v.lines.filter(l=>l.kind.readiness!==undefined).map(l=>l.amount),[23n,24n,24n,24n,24n,24n,24n]);assert.equal(v.lines.find(l=>l.kind.work!==undefined).amount,1n,'90 seconds at 20 minor units/hour is half a minor unit, rounded once');
 }finally{await pic.tearDown();}});
