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
 // The operator's standalone task must appear even without a project; another person's must not.
 const ownTask=unwrap(await d.saveWorkTask(x.tokens.owner,0n,0n,key(k++),{...taskInput(p.id,x.ids.owner),projectId:[],title:'PRIVATE OWNER TASK',dueOn:'2026-09-28'}));
 // Payment confirmed by Finance remains a distinct IT follow-up.
 const finance=await x.login('assets','alpha');
 unwrap(await x.apps.assets.app.markPaid(finance,x.saleId,'Synthetic Finance reconciliation'));
 const catalog=await d.catalog(x.tokens.owner);
 const request=async(name,fields)=>unwrap(await d.agentCreate(x.tokens.owner,{typeId:catalog.find(t=>t.name===name).id,subject:'PRIVATE '+name,body:'Synthetic lifecycle request',fields,requester:'employee@workboard.test',priority:'normal',channel:'agent'}));
 await request('Onboarding',[['firstName','New'],['lastName','Person'],['startDate','2026-10-01'],['department','Engineering'],['manager','owner@workboard.test'],['hardware','None']]);
 await request('Offboarding',[['person','employee@workboard.test'],['lastDay','2026-10-02'],['manager','owner@workboard.test']]);
 // An approval made through the old API never silently gains Workboard totals.
 x.hub.setPrincipal(identity.owner);const secret='21'.repeat(32);await x.hub.operationsDisplayPair('123456abcd',hash(secret));assert.ok('ok' in await x.hub.operationsDisplayApprove('123456abcd','Test room',[x.apps.desk.conn.id],7n));
 const beforeLegacy=metrics(await x.hub.operationsDisplaySnapshot(secret,x.apps.desk.conn.id));
 if(baseline){await x.upgrade();d=x.apps.desk.app;}
 x.hub.setPrincipal(identity.owner);const read=async()=>metrics(await x.hub.operationsSnapshot(x.apps.desk.conn.id));
 const m=await read();assert.deepEqual(Object.fromEntries(Object.entries(m).filter(([k])=>k.startsWith('work'))),{workProjects:1n,workOpen:3n,workWaiting:1n,workOverdue:1n,workUnowned:1n,workSteps:0n,workStepsDone:0n});
 assert.equal(m.onboarding,1n);assert.equal(m.offboardingOpen,1n);
 for(const view of ['onboarding','offboarding']) {
  const [page]=await d.internalQueuePage(x.tokens.owner,{view,status:'',queue:'',assignee:'',q:''},[]);
  assert.equal(page.total,1n);assert.equal(page.rows[0].typeName.toLowerCase(),view);
 }
 assert.equal(m.personalOpen,1n);assert.equal(m.personalOverdue,1n);assert.equal(m.personalUnowned,0n);
 x.apps.desk.app.setPrincipal(x.h.canisterId);
 assert.ok('denied' in (await x.apps.desk.app.hub_operations(x.ids.alpha)).state,'agent cannot read operations metrics');
 const oldPolicy=x.apps.desk.policy.people;
 await x.policy('desk',[{id:x.ids.alpha,role:'admin'},{id:x.ids.beta,role:'agent'}]);
 d.setPrincipal(x.h.canisterId);const alphaMetrics=metrics(await d.hub_operations(x.ids.alpha));assert.equal(alphaMetrics.personalOpen,2n,'viewer sees their own standalone and personal-project work, not the owner task');
 await x.policy('desk',oldPolicy);x.hub.setPrincipal(identity.owner);
 const saleMetrics=()=>x.hub.operationsSnapshot(x.apps.assets.conn.id).then(metrics);
 let sm=await saleMetrics();assert.equal(sm.salesPaid,1n);assert.equal(sm.salesPreparation,1n);assert.equal(sm.salesInvoice,0n);
 unwrap(await x.apps.assets.app.setSaleChecks(x.assetToken,x.saleId,true,true));
 sm=await saleMetrics();assert.equal(sm.salesPaid,1n);assert.equal(sm.salesHandover,1n);assert.equal(sm.salesPreparation,0n);
 assert.equal((await x.apps.assets.app.salesBoard(x.assetToken,'paid','',0n)).matched,sm.salesPaid);
 // An existing paired screen gains these sensitive aggregates only through its approving owner.
 const detailedSecret='ab'.repeat(32),opts={workboard:true,lifecycle:true,sales:true,personal:true,personalEmail:[]};
 await x.hub.operationsDisplayPair('abcdef1234',hash(detailedSecret));
 const detailed=await x.hub.operationsDisplayApprove('abcdef1234','Detailed room',[x.apps.desk.conn.id,x.apps.assets.conn.id],7n);assert.ok('ok' in detailed);
 const newSecret='cd'.repeat(32);await x.hub.operationsDisplayPair('abcdef5678',hash(newSecret));
 assert.ok('invalid' in await x.hub.operationsDisplayApproveWithOptions('abcdef5678','New room',[x.apps.assets.conn.id],7n,opts));
 assert.ok('ok' in await x.hub.operationsDisplayApproveWithOptions('abcdef5678','New room',[x.apps.desk.conn.id,x.apps.assets.conn.id],7n,opts));
 assert.equal((await x.hub.operationsDisplayState(newSecret)).ready.sources[0].app,'desk-workboard-lifecycle-personal');
 const oldState=(await x.hub.operationsDisplayState(detailedSecret)).ready;
 const legacySales=metrics(await x.hub.operationsDisplaySnapshot(detailedSecret,x.apps.assets.conn.id));assert.equal(legacySales.salesPaid,undefined);
 x.hub.setPrincipal(identity.employee);assert.ok('denied' in await x.hub.operationsDisplayConfigure(detailed.ok,opts));
 x.hub.setPrincipal(identity.owner);assert.ok((await x.hub.setPersonRole('alpha@workboard.test','owner')).ok);
 x.hub.setPrincipal(identity.alpha);assert.ok('denied' in await x.hub.operationsDisplayConfigure(detailed.ok,opts),'another owner cannot expose the original owner personal tasks');
 x.hub.setPrincipal(identity.owner);assert.ok((await x.hub.setPersonRole('alpha@workboard.test','')).ok);
 assert.ok('invalid' in await x.hub.operationsDisplayConfigure(detailed.ok,{...opts,workboard:false}));
 assert.ok('ok' in await x.hub.operationsDisplayConfigure(detailed.ok,opts));
 const newState=(await x.hub.operationsDisplayState(detailedSecret)).ready;
 assert.equal(newState.expiresAt,oldState.expiresAt);assert.equal(newState.id,oldState.id);assert.deepEqual(newState.sources.map(s=>s.app),['desk-workboard-lifecycle-personal','assets-sales']);
 await x.pic.advanceTime(11000);await x.refresh();x.hub.setPrincipal(identity.owner);
 let detailedDesk=metrics(await x.hub.operationsDisplaySnapshot(detailedSecret,x.apps.desk.conn.id));
 assert.equal(detailedDesk.personalOpen,1n);assert.equal(detailedDesk.workOpen,3n);assert.equal(detailedDesk.onboarding,1n);assert.equal(detailedDesk.offboardingOpen,1n);
 const detailedSales=metrics(await x.hub.operationsDisplaySnapshot(detailedSecret,x.apps.assets.conn.id));assert.equal(detailedSales.salesPaid,1n);assert.equal(detailedSales.salesHandover,1n);
 assert.doesNotMatch(JSON.stringify([detailedDesk,detailedSales],(_,v)=>typeof v==='bigint'?String(v):v),/PRIVATE|@|title|serial/);
 assert.ok('ok' in await x.hub.operationsDisplayConfigure(detailed.ok,{...opts,personal:false}));await x.pic.advanceTime(11000);await x.refresh();x.hub.setPrincipal(identity.owner);
 detailedDesk=metrics(await x.hub.operationsDisplaySnapshot(detailedSecret,x.apps.desk.conn.id));assert.equal(detailedDesk.personalOpen,undefined);assert.equal(detailedDesk.onboarding,1n);
 assert.ok('ok' in await x.hub.operationsDisplayConfigure(detailed.ok,opts));
 // A separate administrator account supplies only its explicitly selected totals.
 const selectedOpts={...opts,personalEmail:['alpha@workboard.test']};
 assert.ok('denied' in await x.hub.operationsDisplayConfigure(detailed.ok,selectedOpts),'a non-admin cannot supply Operations totals');
 assert.ok('denied' in await x.hub.operationsDisplayConfigure(detailed.ok,{...opts,personalEmail:['missing@workboard.test']}));
 await x.policy('desk',[{id:x.ids.alpha,role:'admin'},{id:x.ids.beta,role:'agent'}]);x.hub.setPrincipal(identity.owner);
 assert.ok('ok' in await x.hub.operationsDisplayConfigure(detailed.ok,selectedOpts));
 await x.pic.advanceTime(11000);await x.refresh();x.hub.setPrincipal(identity.owner);
 assert.equal(metrics(await x.hub.operationsDisplaySnapshot(detailedSecret,x.apps.desk.conn.id)).personalOpen,2n);
 assert.deepEqual((await x.hub.operationsDisplayAdmin()).displays.find(g=>g.id===detailed.ok).personalEmail,['alpha@workboard.test']);
 assert.doesNotMatch(JSON.stringify(await x.hub.operationsDisplayState(detailedSecret),(_,v)=>typeof v==='bigint'?String(v):v),/alpha|@|personId|personalEmail/);
 await x.policy('desk',oldPolicy);x.hub.setPrincipal(identity.owner);
 assert.ok('denied' in (await x.hub.operationsDisplaySnapshot(detailedSecret,x.apps.desk.conn.id)).state,'revoked source access blocks selected totals');
 await x.policy('desk',[{id:x.ids.alpha,role:'admin'},{id:x.ids.beta,role:'agent'}]);x.hub.setPrincipal(identity.owner);
 unwrap(await x.apps.assets.app.completeSaleHandover(x.assetToken,x.saleId,true,'Synthetic physical handover'));
 sm=await saleMetrics();assert.equal(sm.salesPaid,0n);assert.equal(sm.sales,0n);assert.equal(sm.salesHandover,0n);
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
 await x.policy('desk',oldPolicy);x.hub.setPrincipal(identity.owner);
 const tv=await x.hub.operationsDisplaySnapshot(s2,x.apps.desk.conn.id);assert.equal(metrics(tv).workOpen,3n);assert.equal(tv.metrics.length,10);assert.doesNotMatch(JSON.stringify(tv,(_,v)=>typeof v==='bigint'?String(v):v),/PRIVATE|departure|offboarding|onboarding|personal|lifecycle|@/);
 await x.policy('desk',[{id:x.ids.alpha,role:'admin'},{id:x.ids.beta,role:'agent'}]);x.hub.setPrincipal(identity.owner);
 // Both approvals and subtasks survive the same candidate upgrade.
 await x.upgrade();d=x.apps.desk.app;x.hub.setPrincipal(identity.owner);assert.equal((await x.hub.operationsDisplayState(detailedSecret)).ready.sources[0].app,'desk-workboard-lifecycle-personal');assert.equal(metrics(await x.hub.operationsDisplaySnapshot(s2,x.apps.desk.conn.id)).workStepsDone,1n);assert.deepEqual(metrics(await x.hub.operationsDisplaySnapshot(secret,x.apps.desk.conn.id)),beforeLegacy);
 assert.equal(metrics(await x.hub.operationsDisplaySnapshot(detailedSecret,x.apps.desk.conn.id)).personalOpen,2n,'selected personal account survives upgrade');
 await x.policy('desk',oldPolicy);x.hub.setPrincipal(identity.owner);
 await x.hub.setGroupMembers(x.group,[],['alpha@workboard.test']);await x.refresh();x.hub.setPrincipal(identity.owner);assert.equal((await read()).workUnowned,3n);
 unwrap(await d.archiveWorkProject(x.tokens.owner,p.id,p.revision,true));assert.equal((await read()).workOpen,0n);assert.equal((await read()).workProjects,0n);assert.equal((await read()).workSteps,0n);assert.equal((await read()).personalOpen,1n);
 unwrap(await d.archiveWorkTask(x.tokens.owner,ownTask.id,ownTask.revision,true));assert.equal((await read()).personalOpen,0n);
 assert.ok(await x.hub.operationsDisplayRevoke(grant.ok));assert.ok('denied' in (await x.hub.operationsDisplaySnapshot(s2,x.apps.desk.conn.id)).state);
 x.hub.setPrincipal(identity.employee);assert.ok('denied' in (await x.hub.operationsSnapshot(x.apps.desk.conn.id)).state);d.setPrincipal(identity.alpha);await assert.rejects(()=>d.hub_operations(x.ids.owner));
 x.hub.setPrincipal(identity.lunch);assert.deepEqual(await x.hub.team_members(),x.lunch);
 }finally{await x.pic.tearDown();}
});

test('Operations counts all 1,000 shared tasks beyond board pagination',async()=>{
 const x=await setup(server.getUrl());try{
  const d=x.apps.desk.app,p=unwrap(await d.saveWorkProject(x.tokens.alpha,0n,0n,key(9000),projectInput));
  for(let i=0;i<1000;i++) unwrap(await d.saveWorkTask(x.tokens.alpha,0n,0n,key(10000+i),{...taskInput(p.id,x.ids.alpha),title:'Capacity fixture '+i,dueOn:i%2?'':'2026-09-28',column:i%4?{planned:null}:{waiting:null},waitingFor:i%4?'':'Delivery'}));
  x.hub.setPrincipal(identity.owner);await x.refresh();
  const m=metrics(await x.hub.operationsSnapshot(x.apps.desk.conn.id));assert.equal(m.workOpen,1000n);assert.equal(m.workOverdue,500n);assert.equal(m.workWaiting,250n);assert.equal(m.personalOpen,0n);
  const [page]=await d.workboardTasks(x.tokens.owner,{projectId:[p.id],mine:false,completed:false,search:'',offset:900n},false);assert.equal(page.total,1000n);assert.equal(page.rows.length,100);
 }finally{await x.pic.tearDown();}
});
