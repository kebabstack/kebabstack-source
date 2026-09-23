import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
import {identity,setup,projectSetup,unwrap,key,renew,idl} from './helpers/oncall.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
const extras=['hr','reviewer','finance','exporter'];for(const n of extras)identity[n]=createIdentity('compensation-'+n).getPrincipal();
const ns=s=>BigInt(Date.parse(s))*1000000n,H=3600000000000n;
const START=ns('2026-10-01T00:00:00+02:00'),END=ns('2026-11-01T00:00:00+01:00');
const rates=(weekday,weekend=weekday,holiday=weekend)=>({weekday:BigInt(weekday),weekend:BigInt(weekend),holiday:BigInt(holiday)});
const input={policy:{currency:'CHF',decimals:2n,readinessRates:[10000n,5000n],workRate:60n,readinessCode:'READY',workCode:'TIME',costCenter:'OPS',retentionDays:90n},effectiveAt:START,timezone:'Europe/Zurich',holidays:['2026-10-25'],readinessBasis:{day:null},readinessUnit:{money:null},readiness:[rates(10000,15000,20000),rates(5000,7500,10000)],workUnit:{minutes:null},work:rates(60,90,120),minimumMinutes:60n,roundingMinutes:15n};
const report=async(c,id,n='owner')=>(await c.desk.reportingPeriod(c.tokens[n],id))[0];
const rev=async(c,id)=>(await report(c,id)).period.revision;
async function fresh(pic,baseline=false){await pic.setTime(Date.parse('2026-09-30T12:00:00Z'));if(baseline)process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_COMPENSATION_BASELINE;const c=await setup(pic,baseline);delete process.env.KEBAB_CUSTOMER_BASELINE;c.pid=await projectSetup(pic,c,{plan:false,policy:false});
 for(const n of extras){c.hub.setPrincipal(identity.owner);await c.hub.addLocalUser(n+'@customer.test',n,'','');const[code]=await c.hub.createInvite(n+'@customer.test');c.hub.setPrincipal(identity[n]);await c.hub.claimInvite(code);c.hub.setPrincipal(identity.owner);c.ids[n]=(await c.hub.personCard(n+'@customer.test'))[0].pid;await renew(c,n);}
 c.hub.setPrincipal(identity.owner);const rights=await c.hub.getDeskReportingAccess(c.conn.id);assert.equal((await c.hub.setDeskReportingAccess(c.conn.id,rights.revision,[['hr',['compensation']],['reviewer',['time_review']],['finance',['release','export']],['exporter',['export']]].map(([n,capabilities])=>({subject:{person:c.ids[n]},projectId:c.pid,capabilities})))).ok,true);await c.refresh();return c;
}
async function clock(pic,c,stamp){await pic.setTime(stamp);await pic.tick(3);await c.refresh();for(const n of ['owner','alpha','beta','employee',...extras])if(n!=='beta'||!c.departed)await renew(c,n);}
async function month(pic,{departed=false}={}){const c=await fresh(pic),d=c.desk,t=c.tokens;unwrap(await d.activateReportingCompensation(t.hr,c.pid,0n,input));
 const windows=[0n,1n].map(layer=>({startAt:START,endAt:END,layer})),plan=unwrap(await d.saveOncallPlan(t.owner,0n,0n,key(410),{projectId:c.pid,startAt:START,endAt:END,timezone:input.timezone,layers:['Primary','Backup'],windows,shifts:windows.map((w,i)=>({...w,personId:c.ids[i?'beta':'alpha']})),template:'Monthly fixture'}));
 unwrap(await d.publishOncallPlan(t.owner,plan.id,plan.revision,false));c.plan=plan.id;
 const day=ns('2026-10-25T00:00:00+02:00'),cover=unwrap(await d.requestOncallInterval(t.alpha,plan.id,2n,0n,day,day+12n*H,c.ids.owner,'Agreed cover'));
 unwrap(await d.decideOncallInterval(t.owner,plan.id,(await d.oncallPlan(t.owner,plan.id))[0].plan.revision,cover.id,{accept:null}));
 await clock(pic,c,Date.parse('2026-11-02T12:00:00Z'));
 if(departed){c.hub.setPrincipal(identity.owner);const users=await c.hub.listUsers({activeOnly:false,conn:[],limit:100n,offset:0n,search:''});await c.hub.deactivateUser(users.items.find(x=>x.email==='beta@customer.test').key,'Left company');await c.refresh();c.departed=true;}
 c.period=unwrap(await d.prepareReportingPeriod(t.hr,key(411),{projectId:c.pid,title:'October 2026',startAt:START,endAt:END,timezone:input.timezone})).id;
 for(const [i,date,minutes]of [[0,'2026-10-02T10:00:00+02:00',17],[1,'2026-10-03T10:00:00+02:00',10],[2,'2026-10-03T12:00:00+02:00',7],[3,'2026-10-25T12:00:00+01:00',17]]){const startAt=ns(date);unwrap(await d.addReportingWork(t.alpha,c.period,await rev(c,c.period),key(420+i),{startAt,endAt:startAt+BigInt(minutes)*60000000000n,breakMinutes:0n,note:'Synthetic completed work'}));}
 for(const r of (await report(c,c.period)).records){let review='reviewer';if('pending'in r.state){const n=Object.keys(c.ids).find(n=>c.ids[n]===r.personId);if(departed&&n==='beta'){unwrap(await d.attestDepartedService(t.reviewer,c.period,r.id,await rev(c,c.period),'Documented handover'));review='owner';}else unwrap(await d.confirmReportingRecord(t[n],c.period,r.id,await rev(c,c.period),true,''));}unwrap(await d.reviewReportingRecord(t[review],c.period,r.id,await rev(c,c.period),true,''));}
 for(const n of ['alpha','beta','owner'])unwrap(await d.setReportingMapping(t.hr,c.period,await rev(c,c.period),c.ids[n],n==='alpha'?'=PAYROLL':'PAY-'+n));return c;
}

test('rules: scoped access, server preview, validation, future replacement and effective boundaries',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await fresh(pic),d=c.desk,t=c.tokens;
 assert.deepEqual(await d.reportingCompensationRules(t.reviewer,c.pid),[]);assert.ok((await d.previewReportingCompensation(t.reviewer,c.pid,input)).err);assert.ok((await d.activateReportingCompensation(t.employee,c.pid,0n,input)).err);
 for(const changed of [{holidays:['2026-02-30']},{effectiveAt:START+H},{minimumMinutes:1441n},{work:rates(2000)},{roundingMinutes:7n}])assert.ok((await d.previewReportingCompensation(t.hr,c.pid,{...input,...changed})).err);
 const examples=(await d.previewReportingCompensation(t.hr,c.pid,input)).ok;assert.equal(examples.length,9);assert.equal(examples[0].amount,3333n);assert.equal(examples[2].amount,60n);assert.equal(examples[5].amount,90n);assert.equal(examples[8].amount,120n);
 unwrap(await d.activateReportingCompensation(t.hr,c.pid,0n,input));assert.ok((await d.activateReportingCompensation(t.hr,c.pid,0n,input)).err.stale===null);assert.ok((await d.setReportingPolicy(t.hr,c.pid,1n,input.policy)).err.invalid);
 unwrap(await d.withdrawReportingCompensation(t.hr,c.pid,1n,1n));unwrap(await d.activateReportingCompensation(t.hr,c.pid,2n,input));
 const next={...input,effectiveAt:ns('2026-10-15T00:00:00+02:00')};unwrap(await d.activateReportingCompensation(t.hr,c.pid,3n,next));
 assert.ok((await d.prepareReportingPeriod(t.hr,key(430),{projectId:c.pid,title:'Crossing rule',startAt:START,endAt:END,timezone:input.timezone})).err.invalid);
 const p=unwrap(await d.prepareReportingPeriod(t.hr,key(431),{projectId:c.pid,title:'First rule',startAt:START,endAt:next.effectiveAt,timezone:input.timezone}));assert.equal((await report(c,p.id)).calculation[0].rule[0].revision,3n);
 assert.ok((await d.withdrawReportingCompensation(t.hr,c.pid,4n,3n)).err.invalid);unwrap(await d.withdrawReportingCompensation(t.hr,c.pid,4n,4n));
 for(const [n,startAt,timezone]of [[432,next.effectiveAt,'UTC'],[433,next.effectiveAt+H,input.timezone]])assert.ok((await d.prepareReportingPeriod(t.hr,key(n),{projectId:c.pid,title:'Bad boundary',startAt,endAt:END,timezone})).err.invalid);
 }finally{await pic.tearDown();}});

test('October month: holiday, DST, shared allowance, departed evidence, time credits and immutable corrections',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await month(pic,{departed:true}),d=c.desk,t=c.tokens,id=c.period;let v=await report(c,id),ls=v.calculation[0].lines;
 assert.deepEqual(v.blockers,[]);assert.equal(ls.filter(l=>'money'in l.unit).reduce((a,l)=>a+l.amount,0n),540000n);
 const holiday=ls.filter(l=>l.date==='2026-10-25'&&'readiness'in l.kind);assert.equal(holiday.length,3);assert.ok(holiday.every(l=>l.divisorSeconds===90000n&&'holiday'in l.dayKind));assert.equal(holiday.find(l=>l.personId===c.ids.alpha).amount,10400n);assert.equal(holiday.find(l=>l.personId===c.ids.owner).amount,9600n);assert.equal(holiday.find(l=>l.personId===c.ids.beta).amount,10000n);
 assert.equal(ls.filter(l=>'minutes'in l.unit).reduce((a,l)=>a+l.amount,0n),270n);const saturday=ls.find(l=>l.date==='2026-10-03'&&'work'in l.kind);assert.equal(saturday.recordIds.length,2);assert.equal(saturday.seconds,1020n);assert.equal(saturday.payableSeconds,3600n);assert.equal(saturday.amount,90n);
 assert.equal((await report(c,id,'reviewer')).calculation[0].rule.length,0);assert.equal((await report(c,id,'reviewer')).calculation[0].lines.length,0);assert.equal((await report(c,id,'alpha')).calculation[0].lines.length,0);assert.deepEqual(await d.reportingPeriod(t.exporter,id),[]);
 assert.ok((await d.releaseReportingPeriod(t.hr,id,await rev(c,id))).err.denied===null);unwrap(await d.releaseReportingPeriod(t.finance,id,await rev(c,id)));
 const csv=(await d.exportReportingPeriod(t.exporter,id)).ok.csv;assert.match(csv,/amount_minor,credit_minutes/);assert.match(csv,/"'=PAYROLL"/);await pic.upgradeCanister({canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),sender:identity.controller,upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});assert.equal((await d.exportReportingPeriod(t.finance,id)).ok.csv,csv);assert.ok((await report(c,id,'alpha')).calculation[0].lines.every(l=>l.personId===c.ids.alpha));assert.deepEqual(await d.reportingPeriod(t.beta,id),[]);
 const correction=unwrap(await d.prepareReportingAdjustment(t.hr,id,key(440),'Reviewed payroll correction')).id;
 unwrap(await d.addReportingAdjustmentWithUnit(t.hr,correction,await rev(c,correction),key(441),c.ids.alpha,-30n,{minutes:null},'Reduce time credit'));assert.ok((await d.addReportingAdjustmentWithUnit(t.hr,correction,1n,key(441),c.ids.alpha,-30n,{money:null},'Reduce time credit')).err.stale===null);
 unwrap(await d.addReportingAdjustment(t.hr,correction,await rev(c,correction),key(442),c.ids.alpha,-500n,'Reduce cash allowance'));assert.ok((await d.addReportingAdjustmentWithUnit(t.hr,correction,await rev(c,correction),key(443),c.ids.owner,30n,{minutes:null},'Wrong original unit')).err.invalid);
 for(const r of (await report(c,correction)).records)unwrap(await d.reviewReportingRecord(t.owner,correction,r.id,await rev(c,correction),true,''));unwrap(await d.releaseReportingPeriod(t.finance,correction,await rev(c,correction)));const adjusted=await report(c,correction);assert.equal(adjusted.calculation[0].lines.find(l=>'minutes'in l.unit).amount,-30n);assert.equal(adjusted.lines[0].amount,-500n);
 unwrap(await d.activateReportingCompensation(t.hr,c.pid,1n,{...input,effectiveAt:ns('2026-12-01T00:00:00+01:00')}));assert.equal((await d.exportReportingPeriod(t.finance,id)).ok.csv,csv);
 await clock(pic,c,Date.parse('2027-03-01T00:00:00Z'));await pic.tick(40);assert.deepEqual(await d.reportingPeriod(t.finance,id),[]);assert.deepEqual(await d.reportingPeriod(t.finance,correction),[]);
 }finally{await pic.tearDown();}});

test('breaks across midnight block release rather than guessing holiday allocation',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await month(pic),d=c.desk,t=c.tokens,id=c.period,startAt=ns('2026-10-09T23:30:00+02:00');unwrap(await d.addReportingWork(t.alpha,id,await rev(c,id),key(450),{startAt,endAt:startAt+H,breakMinutes:10n,note:'Cross-midnight break'}));const r=(await report(c,id)).records.at(-1);unwrap(await d.reviewReportingRecord(t.reviewer,id,r.id,await rev(c,id),true,''));assert.ok((await report(c,id)).blockers.some(x=>x.includes('local midnight')));assert.ok((await d.releaseReportingPeriod(t.finance,id,await rev(c,id))).err.invalid);
 }finally{await pic.tearDown();}});

test('populated 0.21 upgrade preserves legacy CSV and grants; dated snapshot survives second upgrade',{skip:!process.env.KEBAB_COMPENSATION_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await fresh(pic,true),d=c.desk,t=c.tokens;unwrap(await d.setReportingPolicy(t.hr,c.pid,0n,{...input.policy,readinessRates:[]}));
 const id=unwrap(await d.prepareReportingPeriod(t.hr,key(460),{projectId:c.pid,title:'Legacy September',startAt:ns('2026-09-01T00:00:00Z'),endAt:ns('2026-09-30T00:00:00Z'),timezone:'UTC'})).id,startAt=ns('2026-09-10T10:00:00Z');unwrap(await d.addReportingWork(t.alpha,id,await rev(c,id),key(461),{startAt,endAt:startAt+H,breakMinutes:0n,note:'Legacy service'}));let v=await report(c,id);unwrap(await d.reviewReportingRecord(t.reviewer,id,v.records[0].id,v.period.revision,true,''));unwrap(await d.setReportingMapping(t.hr,id,await rev(c,id),c.ids.alpha,'PAY-ALPHA'));unwrap(await d.releaseReportingPeriod(t.finance,id,await rev(c,id)));const csv=(await d.exportReportingPeriod(t.exporter,id)).ok.csv;
 const wasm=process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm');await pic.upgradeCanister({canisterId:c.b.canisterId,wasm,sender:identity.controller,upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});c.desk=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),c.b.canisterId);assert.equal((await c.desk.exportReportingPeriod(t.exporter,id)).ok.csv,csv);assert.deepEqual((await report(c,id)).calculation,[]);
 unwrap(await c.desk.activateReportingCompensation(t.hr,c.pid,0n,input));const next=unwrap(await c.desk.prepareReportingPeriod(t.hr,key(462),{projectId:c.pid,title:'October',startAt:START,endAt:END,timezone:input.timezone})).id;
 await pic.upgradeCanister({canisterId:c.b.canisterId,wasm,sender:identity.controller,upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});assert.equal((await report(c,next)).calculation[0].rule[0].timezone,'Europe/Zurich');assert.equal((await c.desk.exportReportingPeriod(t.exporter,id)).ok.csv,csv);assert.equal((await c.desk.reportingProjects(t.hr))[0].capabilities.prepare,true);
 }finally{await pic.tearDown();}});

test('server calendar: spring-forward, half-hour DST and quarter-hour UTC offsets preserve one full-day allowance',async()=>{
 for(const [timezone,start,end,seconds]of [
  ['Europe/Zurich','2027-03-28T00:00:00+01:00','2027-03-29T00:00:00+02:00',82800n],
  ['Australia/Lord_Howe','2027-04-04T00:00:00+11:00','2027-04-05T00:00:00+10:30',88200n],
  ['Asia/Katmandu','2026-10-01T00:00:00+05:45','2026-10-02T00:00:00+05:45',86400n]
 ]){const pic=await PocketIc.create(server.getUrl());try{
  const c=await fresh(pic),d=c.desk,t=c.tokens,startAt=ns(start),endAt=ns(end),rule={...input,effectiveAt:startAt,timezone,holidays:[],readiness:[rates(24000)],policy:{...input.policy,readinessRates:[24000n]}};
  unwrap(await d.activateReportingCompensation(t.hr,c.pid,0n,rule));const window={startAt,endAt,layer:0n},plan=unwrap(await d.saveOncallPlan(t.owner,0n,0n,key(470),{projectId:c.pid,startAt,endAt,timezone,layers:['Primary'],windows:[window],shifts:[{...window,personId:c.ids.alpha}],template:'Calendar fixture'}));unwrap(await d.publishOncallPlan(t.owner,plan.id,plan.revision,false));
  await clock(pic,c,Number(endAt/1000000n)+3600000);const id=unwrap(await d.prepareReportingPeriod(t.hr,key(471),{projectId:c.pid,title:'Calendar test',startAt,endAt,timezone})).id;let v=await report(c,id);unwrap(await d.confirmReportingRecord(t.alpha,id,v.records[0].id,v.period.revision,true,''));v=await report(c,id);unwrap(await d.reviewReportingRecord(t.reviewer,id,v.records[0].id,v.period.revision,true,''));const lines=(await report(c,id)).calculation[0].lines;assert.equal(lines.length,1,timezone);assert.equal(lines[0].divisorSeconds,seconds,timezone);assert.equal(lines[0].amount,24000n,timezone);
 }finally{await pic.tearDown();}}
});
