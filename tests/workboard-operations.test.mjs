import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {createHash} from 'node:crypto';
import {PocketIcServer} from '@dfinity/pic';
import {setup,identity,key,unwrap,projectInput,taskInput} from './helpers/workboard.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>{await server?.stop();});
const hash=s=>createHash('sha256').update(s).digest('hex');
const metrics=s=>{assert.ok('ready' in s.state);return Object.fromEntries(s.metrics);};
for(const baseline of [false,true])test(`Workboard Operations ${baseline?'populated upgrade':'fresh'}: shared totals, explicit TV consent and revocation`,{skip:baseline&&!process.env.KEBAB_WORKBOARD_BASELINE},async()=>{
 const x=await setup(server.getUrl(),baseline);try{
 let d=x.apps.desk.app;let k=600;const p=unwrap(await d.saveWorkProject(x.tokens.alpha,0n,0n,key(k++),projectInput));
 const personal=unwrap(await d.saveWorkProject(x.tokens.alpha,0n,0n,key(k++),{...projectInput,name:'PRIVATE PROJECT',scope:{personal:null}}));
 const add=async(change={})=>unwrap(await d.saveWorkTask(x.tokens.alpha,0n,0n,key(k++),{...taskInput(p.id,x.ids.alpha),...change}));
 const overdue=await add({dueOn:'2026-09-28',column:{waiting:null},waitingFor:'PRIVATE REASON'});
 await add({dueOn:'2026-09-29',assignee:''});await add({dueOn:'',column:{active:null}});
 await add({dueOn:'2026-09-20',column:{done:null}});
 await add({projectId:[],title:'PRIVATE PERSONAL',dueOn:'2026-09-20'});
 await add({projectId:[personal.id],title:'PRIVATE PROJECT TASK',dueOn:'2026-09-20'});
 const archived=await add({dueOn:'2026-09-20'});unwrap(await d.archiveWorkTask(x.tokens.alpha,archived.id,archived.revision,true));
 // An approval made through the old API never silently gains Workboard totals.
 x.hub.setPrincipal(identity.owner);const secret='21'.repeat(32);await x.hub.operationsDisplayPair('123456abcd',hash(secret));assert.ok('ok' in await x.hub.operationsDisplayApprove('123456abcd','Test room',[x.apps.desk.conn.id],7n));
 const beforeLegacy=metrics(await x.hub.operationsDisplaySnapshot(secret,x.apps.desk.conn.id));
 if(baseline){await x.upgrade();d=x.apps.desk.app;}
 x.hub.setPrincipal(identity.owner);const read=async()=>metrics(await x.hub.operationsSnapshot(x.apps.desk.conn.id));
 const m=await read();assert.deepEqual(Object.fromEntries(Object.entries(m).filter(([k])=>k.startsWith('work'))),{workProjects:1n,workOpen:3n,workWaiting:1n,workOverdue:1n,workUnowned:1n,workSteps:0n,workStepsDone:0n});
 const t=(await d.workboardTask(x.tokens.alpha,overdue.id))[0].task;
 unwrap(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,t.id,t.revision,key(k++),t,[{id:0n,title:'PRIVATE STEP',done:true},{id:0n,title:'OTHER PRIVATE STEP',done:false}]));
 assert.equal((await read()).workSteps,2n);assert.equal((await read()).workStepsDone,1n);
 await x.pic.advanceTime(11000);await x.refresh();x.hub.setPrincipal(identity.owner);
 assert.deepEqual(metrics(await x.hub.operationsDisplaySnapshot(secret,x.apps.desk.conn.id)),beforeLegacy);
 const s2='34'.repeat(32);await x.hub.operationsDisplayPair('234567abcd',hash(s2));
 assert.ok('invalid' in await x.hub.operationsDisplayApproveWithWorkboard('234567abcd','Test room',[x.apps.assets.conn.id],7n,true));
 x.hub.setPrincipal(identity.alpha);assert.ok('denied' in await x.hub.operationsDisplayApproveWithWorkboard('234567abcd','Test room',[x.apps.desk.conn.id],7n,true));
 x.hub.setPrincipal(identity.owner);const grant=await x.hub.operationsDisplayApproveWithWorkboard('234567abcd','Test room',[x.apps.desk.conn.id],7n,true);assert.ok('ok' in grant);
 assert.equal((await x.hub.operationsDisplayState(s2)).ready.sources[0].app,'desk-workboard');
 const tv=await x.hub.operationsDisplaySnapshot(s2,x.apps.desk.conn.id);assert.equal(metrics(tv).workOpen,3n);assert.equal(tv.metrics.length,10);assert.doesNotMatch(JSON.stringify(tv,(_,v)=>typeof v==='bigint'?String(v):v),/PRIVATE|departure|offboarding|lifecycle|@/);
 // Both approvals and subtasks survive the same candidate upgrade.
 await x.upgrade();d=x.apps.desk.app;x.hub.setPrincipal(identity.owner);assert.equal(metrics(await x.hub.operationsDisplaySnapshot(s2,x.apps.desk.conn.id)).workStepsDone,1n);assert.deepEqual(metrics(await x.hub.operationsDisplaySnapshot(secret,x.apps.desk.conn.id)),beforeLegacy);
 await x.hub.setGroupMembers(x.group,[],['alpha@workboard.test']);await x.refresh();x.hub.setPrincipal(identity.owner);assert.equal((await read()).workUnowned,3n);
 unwrap(await d.archiveWorkProject(x.tokens.owner,p.id,p.revision,true));assert.equal((await read()).workOpen,0n);assert.equal((await read()).workProjects,0n);assert.equal((await read()).workSteps,0n);
 assert.ok(await x.hub.operationsDisplayRevoke(grant.ok));assert.ok('denied' in (await x.hub.operationsDisplaySnapshot(s2,x.apps.desk.conn.id)).state);
 x.hub.setPrincipal(identity.employee);assert.ok('denied' in (await x.hub.operationsSnapshot(x.apps.desk.conn.id)).state);d.setPrincipal(identity.alpha);await assert.rejects(()=>d.hub_operations(x.ids.owner));
 x.hub.setPrincipal(identity.lunch);assert.deepEqual(await x.hub.team_members(),x.lunch);
 }finally{await x.pic.tearDown();}
});
