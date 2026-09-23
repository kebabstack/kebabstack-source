import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
const ids=Object.fromEntries(['controller','owner','alice','bob','global','outsider','collector'].map(n=>[n,createIdentity('crumbs-test-'+n).getPrincipal()]));
const wasmPath=name=>process.env["CRUMBS_PACKAGED_"+name.toUpperCase()+"_WASM"]??resolve(name,"backend/dist/backend.wasm");
let server;
before(async()=>server=await PocketIcServer.start());after(async()=>server?.stop());
async function install(pic,name,baseline=false){const dir=baseline==='native'?process.env.CRUMBS_NATIVE_BASELINE:baseline?process.env.CRUMBS_ACCESS_BASELINE:resolve(name,'backend/dist');const js=execFileSync('python3',['sdk/tools/did2idl.py',dir+'/backend.did'],{encoding:'utf8'});const {idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));return {...await pic.setupCanister({sender:ids.controller,controllers:[ids.controller],wasm:baseline?dir+'/backend.wasm':wasmPath(name),idlFactory,environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'cd'.repeat(32)}]:[]}),idlFactory};}
async function setup(live=false,baseline=false){const pic=await PocketIc.create(server.getUrl(),live?{nns:{state:{type:'new'}},application:[{state:{type:'new'}}]}:undefined);await pic.setTime(live?new Date():new Date('2026-09-19T12:00:00Z'));const h=await install(pic,'hub'),c=await install(pic,'crumbs',baseline),hub=h.actor,app=c.actor;
 hub.setPrincipal(ids.owner);assert.equal((await hub.claimHubWithCode('cd'.repeat(32),{email:'owner@crumbs.test',displayName:'Owner',orgName:'Crumbs test'})).ok,true);
 for(const name of ['alice','bob','global']){hub.setPrincipal(ids.owner);assert.equal(await hub.addLocalUser(name+'@crumbs.test',name,'',''),true);const [invite]=await hub.createInvite(name+'@crumbs.test');hub.setPrincipal(ids[name]);assert.equal(await hub.claimInvite(invite),true);}hub.setPrincipal(ids.owner);assert.equal((await hub.setPersonRole('global@crumbs.test','admin')).ok,true);await pic.tick(2);
 const alice=(await hub.personCard('alice@crumbs.test'))[0].pid,bob=(await hub.personCard('bob@crumbs.test'))[0].pid;
 app.setPrincipal(ids.controller);await app.setHub(h.canisterId.toText());await app.configureCollectors([ids.collector]);
 const conn=await hub.connectApp({name:'Crumbs',canisterId:c.canisterId.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Crumbs',kind:'app',url:'https://crumbs.test'}]});assert.equal(conn.ok,true,conn.detail);
 async function login(who){hub.setPrincipal(ids[who]);const t=await hub.mintAppTicket('',conn.tileId);return t.ok?(await app.loginWithTicket(t.ticket))[0]:undefined;}
 assert.equal(await login('owner'),undefined,'unconfigured central policy fails closed');hub.setPrincipal(ids.owner);
 assert.equal((await hub.setAppPermissions(conn.id,0n,{app:'crumbs',defaultRole:'none',people:[{id:alice,role:'viewer'},{id:bob,role:'viewer'}],groups:[]})).ok,true);
 const owner=await login('owner'),viewer=await login('alice');assert.ok(owner,'owner login');assert.ok(viewer,'viewer login');
 const site={id:'main',name:'Example',domain:'example.test',timezone:'UTC',retentionDays:365n,enabled:true,allowedProperties:['plan'],excludedPaths:['/private'],viewers:[]};assert.ok('ok'in await app.saveSite(owner.token,site));
 if(baseline!==true){const p=ok(await app.getSiteAccess(owner.token,'main'));ok(await app.setSiteAccess(owner.token,'main',p.revision,[alice],[]));}
 const now=BigInt(Math.floor(Number(await pic.getTime())/1000));
 const event=(id,extra={})=>({id,site:'main',visitor:'a'.repeat(64),at:now-100n,order:1n,kind:{pageview:null},path:'/',hostname:'example.test',source:'google.com',medium:'',campaign:'',content:'',term:'',country:'CH',region:'',city:'',device:'Desktop',browser:'Firefox',os:'Linux',name:'',props:[],interactive:true,revenueMinor:0n,currency:'',engagementMs:0n,scrollDepth:0n,...extra});
 const request=(extra={})=>({site:'main',from:now-1000n,until:now+100n,filters:[],dimension:'',limit:100n,...extra});
 return {pic,h,c,hub,app,owner,viewer,site,now,event,request,conn,alice,bob,login};}
function ok(r){assert.ok('ok'in r,JSON.stringify(r,(_,v)=>typeof v==='bigint'?v.toString():v));return r.ok;}
test('Crumbs: exact metrics, signed collection, atomic validation, deduplication and site authorization',async()=>{const s=await setup();const {pic,app,owner,viewer,event,request}=s;try{
 app.setPrincipal(ids.outsider);assert.ok('unauthorized'in(await app.ingestBatch([event('p1')])).err);await assert.rejects(app.configureCollectors([ids.outsider]));await assert.rejects(app.setHub(s.h.canisterId.toText()));assert.ok('unauthorized'in(await app.report('',request())).err);
 app.setPrincipal(ids.collector);const batch=[event('p1'),event('p2',{path:'/pricing',at:s.now-90n,order:2n}),event('signup',{kind:{event:null},name:'Signup',at:s.now-70n,order:3n,props:[['plan','team']],currency:'CHF',revenueMinor:1900n}),event('bounce',{visitor:'b'.repeat(64),order:4n})];
 assert.equal(ok(await app.ingestBatch(batch)).accepted,4n);assert.equal(ok(await app.ingestBatch(batch)).duplicates,4n);
 assert.ok('conflict'in(await app.ingestBatch([event('p1',{path:'/changed'})])).err);
 assert.ok('invalid'in(await app.ingestBatch([event('valid'),event('bad',{path:'/private/x'})])).err);
 const m=ok(await app.report(owner.token,request())).totals;
 assert.deepEqual([m.visitors,m.visits,m.pageviews,m.events,m.bounces,m.durationSeconds],[2n,2n,3n,1n,1n,30n]);assert.deepEqual(m.revenue,[['CHF',1900n]]);
 const filtered=ok(await app.report(viewer.token,request({filters:[{dimension:'path',values:['/pricing'],exclude:false}]}))).totals;assert.deepEqual([filtered.visitors,filtered.pageviews,filtered.bounces],[1n,1n,0n]);
 assert.deepEqual(ok(await app.funnel(owner.token,request(),[{kind:{page:null},value:'/'},{kind:{page:null},value:'/pricing'},{kind:{event:null},value:'Signup'}])),[2n,1n,1n]);
 assert.ok(ok(await app.journeys(owner.token,request())).some(([a,b,n])=>a==='/'&&b==='/pricing'&&n===1n));
 assert.ok('unauthorized'in(await app.saveSite(viewer.token,s.site)).err);assert.ok('unauthorized'in(await app.exportEvents(viewer.token,'main','',100n)).err);
 ok(await app.saveSite(owner.token,{...s.site,id:'private',domain:'private.test',viewers:[]}));assert.ok('unauthorized'in(await app.report(viewer.token,request({site:'private'}))).err);
 assert.equal((await app.listSites(viewer.token)).length,1);assert.equal((await app.listSites(owner.token)).length,2);
 const health=ok(await app.health(owner.token));assert.equal(health.storedEvents,4n);
 }finally{await pic.tearDown();}});
test('Crumbs: same-second ordering, session boundary, non-interactive events and report limits',async()=>{const s=await setup();try{const {app,event,owner,request,now}=s;app.setPrincipal(ids.collector);
 const at=now-3600n;
 ok(await app.ingestBatch([event('z-first',{at,order:1n}),event('a-second',{at,order:2n,path:'/second'}),event('event',{at,order:3n,kind:{event:null},name:'Done',interactive:false}),event('later',{order:4n,at:now-1800n})]));
 const r=request({from:now-4000n});const m=ok(await app.report(owner.token,r)).totals;
 assert.deepEqual([m.visitors,m.visits,m.pageviews,m.events,m.bounces],[1n,2n,3n,1n,1n]);
 assert.deepEqual(ok(await app.funnel(owner.token,r,[{kind:{page:null},value:'/'},{kind:{page:null},value:'/second'},{kind:{event:null},value:'Done'}])),[1n,1n,1n]);
 assert.ok('invalid'in(await app.report(owner.token,{...r,from:now-1828n*86400n})).err);
 assert.ok('invalid'in(await app.report(owner.token,{...r,dimension:'password'})).err);

 }finally{await s.pic.tearDown();}});
test('Crumbs: populated upgrade, scoped keys, sharing revocation, Hub outage and permanent site deletion',async()=>{const s=await setup();try{const {pic,app,owner,event,request}=s;app.setPrincipal(ids.collector);ok(await app.ingestBatch([event('one')]));
 const read=ok(await app.createKey(owner.token,'main','CI',{read:null},30n));assert.equal(ok(await app.report(read.token,request())).totals.pageviews,1n);assert.ok('unauthorized'in(await app.saveGoal(read.token,{id:'x',site:'main',name:'x',kind:{event:null},value:'x'})).err);
 assert.ok('unauthorized'in(await app.report(read.token,request({site:'other'}))).err);
 const share=ok(await app.createKey(owner.token,'main','Partner',{share:null},1n));assert.equal(ok(await app.report(share.token,request())).totals.pageviews,1n);ok(await app.revokeKey(owner.token,share.key.id));assert.ok('unauthorized'in(await app.report(share.token,request())).err);
 const before=ok(await app.report(owner.token,request()));await pic.upgradeCanister({sender:ids.controller,canisterId:s.c.canisterId,wasm:wasmPath('crumbs'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 assert.deepEqual(await app.whoami(owner.token),[],'upgrade resets authorization lease');await pic.advanceTime(31000);await pic.tick(4);assert.deepEqual(ok(await app.report(owner.token,request())),before,'records and credentials survive populated upgrade');
 await pic.stopCanister({sender:ids.controller,canisterId:s.h.canisterId});await pic.advanceTime(61000);await pic.tick(2);assert.ok('unauthorized'in(await app.report(owner.token,request())).err);assert.ok('unauthorized'in(await app.report(read.token,request())).err);
 assert.equal(ok(await app.ingestBatch([event('during-outage',{at:s.now+90n,order:2n})])).accepted,1n,'collection independent of Hub');
 await pic.startCanister({sender:ids.controller,canisterId:s.h.canisterId});await pic.advanceTime(31000);await pic.tick(4);ok(await app.deleteSite(owner.token,'main'));assert.ok('conflict'in(await app.saveSite(owner.token,s.site)).err);assert.ok('unauthorized'in(await app.report(read.token,request())).err);
 }finally{await s.pic.tearDown();}});
test('Crumbs: acquisition attribution, engagement isolation, import conflicts and retention sweeping',async()=>{const s=await setup();try{const {pic,app,event,request,owner,now}=s;app.setPrincipal(ids.collector);
 ok(await app.ingestBatch([event('landing',{source:'campaign',campaign:'launch'}),event('next',{at:now-90n,order:2n,path:'/pricing',source:'',campaign:''}),event('orphan',{visitor:'c'.repeat(64),kind:{engagement:null},engagementMs:1000n,order:3n})]));
 const source=ok(await app.report(owner.token,request({dimension:'source'})));assert.deepEqual(source.rows.map(r=>[r.value,r.metrics.pageviews]),[['campaign',2n]]);assert.equal(source.totals.visitors,1n);assert.equal(source.totals.engagementMs,0n);
 const entry=ok(await app.report(owner.token,request({dimension:'entryPath'})));assert.equal(entry.rows[0].value,'/');const exit=ok(await app.report(owner.token,request({dimension:'exitPath'})));assert.equal(exit.rows[0].value,'/pricing');
 const m=source.totals,row={id:'history',site:'main',day:(now/86400n-2n)*86400n,dimension:'import:visitors',value:'{}',metrics:m};
 assert.ok('conflict'in(await app.importAggregates(owner.token,[row,{...row,metrics:{...m,pageviews:9n}}])).err);assert.equal(ok(await app.imported(owner.token,'main',now-86400n*4n,now)).length,0);
 assert.equal(ok(await app.importAggregates(owner.token,[row,row])),1n);assert.equal(ok(await app.importAggregates(owner.token,[row])),0n);
 ok(await app.saveSite(owner.token,{...s.site,retentionDays:1n}));assert.equal(ok(await app.imported(owner.token,'main',now-86400n*4n,now)).length,0,'expired history immediately hidden');
 await pic.advanceTime(86400*1000+1000);await pic.tick(5);await pic.advanceTime(31000);await pic.tick(5);
 const fresh=await s.login('owner');assert.ok(fresh);assert.equal(ok(await app.health(fresh.token)).storedEvents,0n);assert.equal(ok(await app.health(fresh.token)).storageChargeBytes,0n);
 }finally{await s.pic.tearDown();}});
test('Crumbs: multi-batch dataset preserves exact unique counts and ordering',async()=>{const s=await setup();try{const {app,owner,event,request,now}=s;app.setPrincipal(ids.collector);const count=Number(process.env.CRUMBS_LOAD_EVENTS??5000),start=performance.now();assert.ok(Number.isInteger(count)&&count>=1000&&count<=50000);
 for(let offset=0;offset<count;offset+=50){const batch=Array.from({length:Math.min(50,count-offset)},(_,j)=>{const i=offset+j;return event('load-'+i,{visitor:(i%1000).toString(16).padStart(64,'0'),order:BigInt(i+1),at:now-300n,path:i%2?'/pricing':'/'});});assert.equal(ok(await app.ingestBatch(batch)).accepted,BigInt(batch.length));}
 const queryStart=performance.now(),r=ok(await app.report(owner.token,request({dimension:'path'})));assert.equal(r.totals.visitors,1000n);assert.equal(r.totals.pageviews,BigInt(count));assert.equal(r.totals.visits,1000n);assert.equal(r.rows.reduce((n,row)=>n+row.metrics.pageviews,0n),BigInt(count));
 console.log(JSON.stringify({environment:'local PocketIC, not a production SLA',events:count,ingestMs:Math.round(queryStart-start),reportMs:Math.round(performance.now()-queryStart)}));
 }finally{await s.pic.tearDown();}});

test('Crumbs: changing the Hub trust binding revokes all report and share capabilities',async()=>{const s=await setup();try{const {app,owner,request}=s;const key=ok(await app.createKey(owner.token,'main','Review',{share:null},7n));ok(await app.report(key.token,request()));app.setPrincipal(ids.controller);await app.setHub(s.h.canisterId.toText());assert.ok('unauthorized'in(await app.report(key.token,request())).err);assert.deepEqual(await app.whoami(owner.token),[]);
 }finally{await s.pic.tearDown();}});

test('Crumbs end-to-end: real signed HTTP agent, durable collector, Candid delivery and report',async()=>{
 const s=await setup(true);const {HttpAgent,Actor}=await import('@icp-sdk/core/agent');const {createCollector}=await import('../crumbs/collector/server.mjs');const {Store}=await import('../crumbs/collector/store.mjs');const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {once}=await import('node:events');
 const dir=mkdtempSync(resolve(tmpdir(),'crumbs-http-real-')),store=new Store(dir);let httpServer;
 try{
 const rawRoot=await s.pic.getPubKey((await s.pic.getNnsSubnet()).id);assert.equal(rawRoot.length,133);const rootKey=new Uint8Array(rawRoot),port=await s.pic.makeLive();
 const {rpcFetch}=await import('../crumbs/collector/transport.mjs');const agent=await HttpAgent.create({host:'http://127.0.0.1:'+port,identity:createIdentity('crumbs-test-collector'),rootKey,retryTimes:0,fetch:rpcFetch});
 const actor=Actor.createActor(s.c.idlFactory,{agent,canisterId:s.c.canisterId});
 const service=createCollector({actor,store,now:()=>Number(s.now)});httpServer=service.server;httpServer.listen(0,'127.0.0.1');await once(httpServer,'listening');const url='http://127.0.0.1:'+httpServer.address().port;
 const request={id:'real-http',site:'main',url:'https://example.test/pricing',kind:'pageview'};
 const response=await fetch(url+'/api/v1/events',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json','user-agent':'CrumbsIntegration/1.0',origin:'https://example.test'},body:JSON.stringify(request)});assert.equal(response.status,202,await response.text());
 // The queue is polled while the independently running delivery worker completes.
 for(let i=0;i<60&&store.count('accepted')!==1;i++){await service.drain();await new Promise(r=>setTimeout(r,100));}
 assert.equal(store.count('accepted'),1);assert.equal(ok(await s.app.report(s.owner.token,s.request())).totals.pageviews,1n);
 const read=await fetch(url+'/api/v1/query',{method:'POST',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+s.owner.token},body:JSON.stringify({site:'main',from:Number(s.now)-1000,until:Number(s.now)+100})});assert.equal(read.status,200,await read.clone().text());assert.equal((await read.json()).totals.pageviews,'1');
 const httpCall=(path,token,method='GET',body)=>fetch(url+'/api/v1'+path,{method,signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const listing=await httpCall('/sites',s.owner.token);assert.equal((await listing.json())[0].accessRole,'admin');
 assert.equal((await httpCall('/sites/main/access',s.viewer.token)).status,403);
 const accessResponse=await httpCall('/sites/main/access',s.owner.token);assert.equal(accessResponse.status,200);const policy=await accessResponse.json();assert.equal(typeof policy.revision,'string');
 const directoryResponse=await httpCall('/sites/main/people?search=bob',s.owner.token);assert.equal((await directoryResponse.json()).people[0].id,s.bob);
 const savedAccess=await httpCall('/sites/main/access',s.owner.token,'PUT',{revision:policy.revision,readers:[s.bob],managers:[s.alice]});assert.equal(savedAccess.status,200,await savedAccess.clone().text());assert.equal((await savedAccess.json()).managers[0].id,s.alice);
 assert.equal((await httpCall('/sites/main/access',s.viewer.token)).status,200,'new Manager can read membership through REST');

 }finally{if(httpServer)await new Promise(r=>(httpServer.close(r),httpServer.closeAllConnections()));store.close();rmSync(dir,{recursive:true,force:true});await s.pic.stopLive();await s.pic.tearDown();}
});

test('Crumbs: explicit website readers/managers, default-private sites and Hub administrator override',async()=>{const s=await setup();try{
 const {app,owner,viewer,site,alice,bob}=s,bobLogin=await s.login('bob'),global=await s.login('global');
 ok(await app.saveSite(owner.token,{...site,id:'private',domain:'private.test'}));
 assert.deepEqual((await app.listSites(viewer.token)).map(x=>x.id),['main']);assert.deepEqual(await app.listSites(bobLogin.token),[]);
 for(const t of [owner.token,global.token])assert.equal((await app.listSites(t)).length,2,'Hub owners/admins always see every website');
 const p=ok(await app.getSiteAccess(owner.token,'main'));assert.ok('unauthorized'in(await app.getSiteAccess(viewer.token,'main')).err);assert.ok('unauthorized'in(await app.accessPeople(viewer.token,'main','')).err);
 assert.ok('invalid'in(await app.setSiteAccess(owner.token,'main',p.revision,[alice],[alice])).err);assert.ok('invalid'in(await app.setSiteAccess(owner.token,'main',p.revision,[],['p_forged'])).err);
 const access=ok(await app.setSiteAccess(owner.token,'main',p.revision,[bob],[alice]));assert.equal(access.managers[0].id,alice);assert.equal(access.readers[0].email,'bob@crumbs.test');
 assert.ok('conflict'in(await app.setSiteAccess(owner.token,'main',p.revision,[],[])).err);
 assert.equal(Object.keys((await app.listSites(viewer.token))[0].accessRole)[0],'manage');assert.equal(Object.keys((await app.listSites(bobLogin.token))[0].accessRole)[0],'read');
 assert.ok('unauthorized'in(await app.saveSite(bobLogin.token,site)).err);ok(await app.saveSite(viewer.token,{...site,name:'Managed website'}));
 assert.ok('unauthorized'in(await app.saveSite(viewer.token,{...site,id:'private',domain:'private.test'})).err);assert.ok('unauthorized'in(await app.saveSite(viewer.token,{...site,id:'new',domain:'new.test'})).err);assert.ok('unauthorized'in(await app.deleteSite(viewer.token,'main')).err);assert.ok('unauthorized'in(await app.health(viewer.token)).err);
 assert.ok('unauthorized'in(await app.setSiteAccess(viewer.token,'private',1n,[alice],[])).err);
 const people=ok(await app.accessPeople(viewer.token,'main','bob'));assert.equal(people.people[0].id,bob);assert.equal(people.truncated,false);
 ok(await app.setSiteAccess(global.token,'main',access.revision,[],[]));assert.deepEqual(await app.listSites(viewer.token),[]);assert.equal((await app.listSites(global.token)).length,2);
 }finally{await s.pic.tearDown();}});

test('Crumbs: manager keys stay site-scoped, cannot grant membership and are revoked on demotion',async()=>{const s=await setup();try{
 const {app,owner,viewer,alice,site,event,request}=s,p=ok(await app.getSiteAccess(owner.token,'main'));let acl=ok(await app.setSiteAccess(owner.token,'main',p.revision,[],[alice]));
 ok(await app.saveSite(owner.token,{...site,id:'private',domain:'private.test'}));app.setPrincipal(ids.collector);ok(await app.ingestBatch([event('managed')]));
 const keys=[];for(const scope of ['read','manage','share'])keys.push(ok(await app.createKey(viewer.token,'main',scope,{[scope]:null},7n)));
 for(const key of keys){assert.equal(ok(await app.report(key.token,request())).totals.pageviews,1n);assert.ok('unauthorized'in(await app.report(key.token,request({site:'private'}))).err);assert.deepEqual((await app.listSites(key.token)).map(x=>x.id),['main']);assert.deepEqual((await app.listSites(key.token))[0].viewers,[]);assert.ok('unauthorized'in(await app.setSiteAccess(key.token,'main',acl.revision,[alice],[])).err);}
 const goal={id:'signup',site:'main',name:'Signup',kind:{event:null},value:'Signup'};ok(await app.saveGoal(viewer.token,goal));ok(await app.saveGoal(keys[1].token,goal));assert.ok('unauthorized'in(await app.saveGoal(keys[0].token,goal)).err);assert.ok('unauthorized'in(await app.saveGoal(keys[1].token,{...goal,site:'private'})).err);assert.equal(ok(await app.exportEvents(viewer.token,'main','',100n)).events.length,1);
 const unrelated=ok(await app.createKey(owner.token,'private','Private',{read:null},7n));assert.equal(ok(await app.listKeys(viewer.token)).length,3);assert.ok('unauthorized'in(await app.revokeKey(viewer.token,unrelated.key.id)).err);
 acl=ok(await app.setSiteAccess(owner.token,'main',acl.revision,[alice],[]));assert.ok('unauthorized'in(await app.saveGoal(viewer.token,goal)).err);
 for(const key of keys)assert.ok('unauthorized'in(await app.report(key.token,request())).err);
 ok(await app.setSiteAccess(owner.token,'main',acl.revision,[],[alice]));for(const key of keys)assert.ok('unauthorized'in(await app.report(key.token,request())).err,'regrant does not resurrect revoked credentials');
 }finally{await s.pic.tearDown();}});

test('Crumbs: Hub revocation invalidates site-manager sessions and shares, while collection continues',async()=>{const s=await setup();try{
 const {app,owner,viewer,alice,hub,pic,request,event}=s,p=ok(await app.getSiteAccess(owner.token,'main'));ok(await app.setSiteAccess(owner.token,'main',p.revision,[],[alice]));
 const share=ok(await app.createKey(viewer.token,'main','Partner',{share:null},7n));
 await pic.stopCanister({sender:ids.controller,canisterId:s.h.canisterId});await pic.advanceTime(61000);await pic.tick(3);assert.ok('unauthorized'in(await app.report(share.token,request())).err);assert.ok('unauthorized'in(await app.saveGoal(viewer.token,{id:'x',site:'main',name:'x',kind:{event:null},value:'x'})).err);app.setPrincipal(ids.collector);ok(await app.ingestBatch([event('still-collecting',{at:s.now+60n})]));
 await pic.startCanister({sender:ids.controller,canisterId:s.h.canisterId});await pic.advanceTime(31000);await pic.tick(4);assert.equal(ok(await app.report(share.token,s.request({until:s.now+200n}))).totals.pageviews,1n);
 hub.setPrincipal(ids.owner);const [saved]=await hub.getAppPermissions(s.conn.id);assert.equal((await hub.setAppPermissions(s.conn.id,saved.revision,{app:'crumbs',defaultRole:'none',people:[],groups:[]})).ok,true);await pic.advanceTime(31000);await pic.tick(4);
 assert.deepEqual(await app.whoami(viewer.token),[]);assert.ok('unauthorized'in(await app.report(share.token,request())).err);assert.equal((await app.listSites(owner.token)).length,1);
 }finally{await s.pic.tearDown();}});

test('Crumbs: 0.1.0 populated upgrade preserves reports and legacy visibility, then persists named access', {skip:!process.env.CRUMBS_ACCESS_BASELINE},async()=>{const s=await setup(false,true);try{
 const {app:old,pic,owner,viewer,alice,event,request,site}=s;old.setPrincipal(ids.collector);ok(await old.ingestBatch([event('before-upgrade')]));ok(await old.saveSite(owner.token,{...site,id:'restricted',domain:'restricted.test',viewers:[alice]}));
 const key=ok(await old.createKey(owner.token,'main','Existing',{read:null},7n));const before=ok(await old.report(owner.token,request()));
 await pic.upgradeCanister({sender:ids.controller,canisterId:s.c.canisterId,wasm:wasmPath('crumbs'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 const js=execFileSync('python3',['sdk/tools/did2idl.py','crumbs/backend/dist/backend.did'],{encoding:'utf8'}),{idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64')),app=pic.createActor(idlFactory,s.c.canisterId);await pic.advanceTime(31000);await pic.tick(4);
 assert.deepEqual(ok(await app.report(key.token,request())),before);assert.equal((await app.listSites(viewer.token)).length,2);
 const legacy=ok(await app.getSiteAccess(owner.token,'main'));assert.equal(legacy.legacyAllReaders,true);assert.equal(legacy.revision,0n);const restricted=ok(await app.getSiteAccess(owner.token,'restricted'));assert.equal(restricted.legacyAllReaders,false);assert.equal(restricted.readers[0].id,alice);
 ok(await app.saveSite(owner.token,{...site,id:'restricted',domain:'restricted.test',viewers:[],name:'Edited configuration'}));assert.equal(ok(await app.getSiteAccess(owner.token,'restricted')).readers[0].id,alice,'configuration edit preserves legacy access');
 const named=ok(await app.setSiteAccess(owner.token,'main',0n,[],[alice]));assert.equal(named.legacyAllReaders,false);await pic.upgradeCanister({sender:ids.controller,canisterId:s.c.canisterId,wasm:wasmPath('crumbs'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});await pic.advanceTime(31000);await pic.tick(4);
 assert.deepEqual(ok(await app.getSiteAccess(owner.token,'main')),named);assert.equal(Object.keys((await app.listSites(viewer.token)).find(x=>x.id==='main').accessRole)[0],'manage');assert.deepEqual(ok(await app.report(owner.token,request())),before);
 }finally{await s.pic.tearDown();}});

test('Crumbs: stable Hub person grants survive email rename and never transfer to a replacement person',async()=>{const s=await setup();try{
 const {hub,app,owner,viewer,alice,pic,request}=s,p=ok(await app.getSiteAccess(owner.token,'main'));ok(await app.setSiteAccess(owner.token,'main',p.revision,[],[alice]));
 hub.setPrincipal(ids.owner);assert.equal((await hub.renameLocalUser('alice@crumbs.test','renamed@crumbs.test')).ok,true);assert.equal((await hub.checkAppPermissions(s.conn.id)).ok,true);await pic.tick(3);
 const renamed=await s.login('alice');assert.ok(renamed);assert.equal((await app.whoami(renamed.token))[0].id,alice);assert.equal(Object.keys((await app.listSites(renamed.token))[0].accessRole)[0],'manage');
 hub.setPrincipal(ids.owner);assert.equal(await hub.addLocalUser('alice@crumbs.test','Replacement','',''),true);const [invite]=await hub.createInvite('alice@crumbs.test');hub.setPrincipal(ids.outsider);assert.equal(await hub.claimInvite(invite),true);hub.setPrincipal(ids.owner);const replacement=(await hub.personCard('alice@crumbs.test'))[0].pid;assert.notEqual(replacement,alice);
 const [policy]=await hub.getAppPermissions(s.conn.id);assert.equal((await hub.setAppPermissions(s.conn.id,policy.revision,{...policy.policy,people:[...policy.policy.people,{id:replacement,role:'viewer'}]})).ok,true);await pic.tick(3);
 const fresh=await s.login('outsider');assert.ok(fresh);assert.deepEqual(await app.listSites(fresh.token),[]);assert.ok('unauthorized'in(await app.report(fresh.token,request())).err);assert.ok('unauthorized'in(await app.getSiteAccess(fresh.token,'main')).err);
 assert.equal(ok(await app.getSiteAccess(owner.token,'main')).managers[0].email,'renamed@crumbs.test');
 }finally{await s.pic.tearDown();}});

// The HTTP gateway first asks the query entrypoint, then executes its certified
// update response. Direct Candid callers can forge headers; none grants access.
function nativeRequest(url,method='GET',body,headers=[]){return {url,method,headers,body:Buffer.from(body===undefined?'':typeof body==='string'?body:JSON.stringify(body,(_,v)=>typeof v==='bigint'?v.toString():v)),certificate_version:[]};}
async function nativeHttp(s,url,method='GET',body,headers=[]){const req=nativeRequest(url,method,body,headers);assert.deepEqual((await s.app.http_request(req)).upgrade,[true]);const r=await s.app.http_request_update(req);return {status:r.status_code,headers:Object.fromEntries(r.headers),data:r.body.length?JSON.parse(Buffer.from(r.body).toString()):null};}
const nativeHeaders=[['X-Real-IP','203.0.113.42'],['User-Agent','Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0'],['Origin','https://example.test']];
const nativeEvent=(id,extra={})=>({id,site:'main',url:'https://example.test/pricing',kind:'pageview',...extra});
const nativePost=(s,body,headers=nativeHeaders)=>nativeHttp(s,'/api/v1/events','POST',body,headers);
const nativeApi=(s,path,token,method='GET',body)=>nativeHttp(s,'/api/v1'+path,method,body,token?[['Authorization','Bearer '+token]]:[]);

test('Crumbs native: durable acceptance, privacy normalization, attribution and atomic retries',async()=>{const s=await setup();try{
 s.app.setPrincipal(ids.outsider);
 assert.equal((await nativeHttp(s,'/healthz')).status,200);
 const raw=nativeEvent('native-first',{url:'https://example.test/customer/alice%40example.test/123456?secret=never-store&utm_source=newsletter#private',props:{plan:'alice@example.test'},visitor:'FORGED',at:1,order:0});
 const a=await nativePost(s,[raw,nativeEvent('native-event',{kind:'event',name:'Signup',revenueMinor:1900,currency:'CHF',props:{plan:'team'}}),nativeEvent('native-time',{kind:'engagement',engagementMs:600,scrollDepth:50})]);
 assert.equal(a.status,202,JSON.stringify(a));assert.deepEqual(a.data,{accepted:3,duplicates:0,ignored:0,durability:'canister',delivery:'committed'});
 const stored=ok(await s.app.exportEvents(s.owner.token,'main','',100n)).events,one=stored.find(e=>e.id===raw.id);
 assert.equal(one.path,'/customer/:email/:id');assert.equal(one.source,'newsletter');assert.deepEqual(one.props,[['plan','(redacted)']]);assert.match(one.visitor,/^[a-f0-9]{64}$/);assert.equal(one.at,s.now);assert.ok(one.order>0n);assert.equal(new Set(stored.map(e=>e.visitor)).size,1);assert.equal(one.country,'');
 const wire=JSON.stringify(stored,(_,v)=>typeof v==='bigint'?v.toString():v);for(const privateValue of ['203.0.113.42','Mozilla/','never-store','alice@example.test','FORGED'])assert.ok(!wire.includes(privateValue),privateValue);
 const report=ok(await s.app.report(s.owner.token,s.request())).totals;assert.equal(report.pageviews,1n);assert.equal(report.events,1n);assert.deepEqual(report.revenue,[['CHF',1900n]]);
 await s.pic.advanceTime(2000);const retry=await nativePost(s,raw,nativeHeaders.map(([k,v])=>[k,k==='X-Real-IP'?'203.0.113.99':v]));assert.equal(retry.data.duplicates,1);assert.deepEqual(ok(await s.app.exportEvents(s.owner.token,'main','',100n)).events,stored);
 assert.equal((await nativePost(s,{...raw,url:'https://example.test/changed'})).status,409);
 assert.equal((await nativePost(s,[nativeEvent('atomic-good'),nativeEvent('atomic-bad',{props:{password:'bad'}})])).status,400);assert.equal(ok(await s.app.health(s.owner.token)).storedEvents,3n);
 assert.equal((await nativePost(s,[nativeEvent('batch-same'),nativeEvent('batch-same')])).data.duplicates,1);
 }finally{await s.pic.tearDown();}});

test('Crumbs native: HTTP bounds, privacy signals, excluded routes, validation and throttling',async()=>{const s=await setup();try{
 const before=ok(await s.app.health(s.owner.token)).storedEvents;
 for(const headers of [nativeHeaders.concat([['Sec-GPC','1']]),nativeHeaders.concat([['DNT','1']]),[['User-Agent','ExampleBot/1.0']]]){const r=await nativePost(s,nativeEvent('ignored'),headers);assert.equal(r.status,202);assert.equal(r.data.ignored,1);}
 assert.equal((await nativePost(s,nativeEvent('excluded',{url:'https://example.test/private/account'}))).data.ignored,1);
 for(const headers of [[],[['X-Forwarded-For','203.0.113.3']],nativeHeaders.concat([['x-real-ip','203.0.113.42']]),[['X-Real-IP','not-an-ip']],nativeHeaders.map(([k,v])=>[k,k==='Origin'?'https://other.test':v])])assert.equal((await nativePost(s,nativeEvent('invalid-header'),headers)).status,400);
 for(const body of [[],Array(51).fill(nativeEvent('too-many')),null,'{bad',nativeEvent('bad-url',{url:'https://other.test/'}),nativeEvent('bad-path',{url:'https://example.test/%zz'}),nativeEvent('bad-money',{kind:'event',name:'Buy',revenueMinor:1,currency:'chf'}),nativeEvent('bad-scroll',{scrollDepth:101}),nativeEvent('bad-bool',{interactive:'false'}),nativeEvent('bad-prop',{props:{plan:{nested:true}}}),{...nativeEvent(''),id:undefined}])assert.equal((await nativePost(s,body)).status,400,JSON.stringify(body));
 assert.equal((await nativePost(s,'['.repeat(17)+'0'+']'.repeat(17))).status,400);
 assert.equal((await nativePost(s,' '.repeat(49153))).status,413);
 assert.equal((await nativePost(s,nativeEvent('headers'),Array.from({length:65},()=>['x','y']))).status,431);
 assert.equal(ok(await s.app.health(s.owner.token)).storedEvents,before);
 const options=await nativeHttp(s,'/api/v1/events','OPTIONS');assert.equal(options.status,204);assert.equal(options.data,null);assert.equal(options.headers['Access-Control-Allow-Origin'],'*');
 // Invalid payload attempts also consume the bounded IP budget. A fresh minute
 // permits exactly 300 events, and the following minute allows collection again.
 await s.pic.advanceTime(61000);await s.pic.tick(4);
 const batch=Array.from({length:50},(_,i)=>nativeEvent('rate-'+i));for(let i=0;i<6;i++)assert.equal((await nativePost(s,batch)).status,202);
 const limited=await nativePost(s,nativeEvent('rate-301'));assert.equal(limited.status,429);assert.equal(limited.headers['Retry-After'],'60');
 await s.pic.advanceTime(61000);await s.pic.tick(4);assert.equal((await nativePost(s,nativeEvent('after-limit'))).data.accepted,1);
 }finally{await s.pic.tearDown();}});

test('Crumbs native: daily/site pseudonyms, populated restart and collection during Hub outages',async()=>{const s=await setup();try{
 await nativePost(s,nativeEvent('day-one'));const first=ok(await s.app.exportEvents(s.owner.token,'main','',100n)).events[0];
 ok(await s.app.saveSite(s.owner.token,{...s.site,id:'second',domain:'second.test'}));assert.equal((await nativePost(s,nativeEvent('site-two',{site:'second',url:'https://second.test/'}),nativeHeaders.filter(([k])=>k!=='Origin'))).status,202);const second=ok(await s.app.exportEvents(s.owner.token,'second','',100n)).events[0];assert.notEqual(first.visitor,second.visitor);
 await s.pic.upgradeCanister({sender:ids.controller,canisterId:s.c.canisterId,wasm:wasmPath('crumbs'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});await s.pic.advanceTime(31000);await s.pic.tick(4);
 assert.equal((await nativePost(s,nativeEvent('day-one'))).data.duplicates,1);await nativePost(s,nativeEvent('same-day'));assert.equal(ok(await s.app.exportEvents(s.owner.token,'main','',100n)).events.find(e=>e.id==='same-day').visitor,first.visitor,'salt survives upgrade within UTC day');
 await s.pic.advanceTime(86400000);await s.pic.tick(5);const owner=await s.login('owner');assert.ok(owner);await nativePost(s,nativeEvent('day-two'));const dayTwo=ok(await s.app.exportEvents(owner.token,'main','',100n)).events.find(e=>e.id==='day-two');assert.notEqual(dayTwo.visitor,first.visitor);
 assert.equal((await nativePost(s,nativeEvent('day-one'))).data.duplicates,1,'cross-day retry preserves original visitor and timestamp');
 await s.pic.stopCanister({sender:ids.controller,canisterId:s.h.canisterId});await s.pic.advanceTime(61000);await s.pic.tick(4);
 assert.equal((await nativePost(s,nativeEvent('identity-outage'))).data.accepted,1);assert.equal((await nativeApi(s,'/query',owner.token,'POST',s.request({until:s.now+90000n}))).status,403);
 }finally{await s.pic.tearDown();}});

test('Crumbs native REST: website authorization, read/manage keys and all documented resources',async()=>{const s=await setup();try{
 const owner=s.owner.token,reader=s.viewer.token;const call=(path,token=owner,method='GET',body)=>nativeApi(s,path,token,method,body);
 assert.equal((await call('/sites','')).status,401);assert.deepEqual((await call('/sites','forged')).data,[]);
 assert.equal((await call('/sites',owner,'POST',{...s.site,enabled:'false'})).status,400);assert.equal((await call('/query',owner,'POST',{...s.request(),filters:'bad'})).status,400);assert.equal((await call('/sites')).data[0].accessRole,'admin');assert.equal((await call('/sites',reader)).data[0].accessRole,'read');
 assert.equal((await call('/sites/main/access',reader)).status,403);const access=(await call('/sites/main/access')).data;
 assert.equal((await call('/sites/main/people?search=bob')).data.people[0].id,s.bob);
 assert.equal((await call('/sites/main/access',owner,'PUT',{revision:access.revision,readers:'bad',managers:[]})).status,400);
 assert.equal((await call('/sites/main/access',owner,'PUT',{revision:access.revision,readers:[s.bob],managers:[s.alice]})).status,200);
 assert.equal((await call('/sites/main/access',reader)).status,200);assert.equal((await call('/sites/main/access',owner,'PUT',{revision:access.revision,readers:[],managers:[]})).status,409);
 assert.equal((await call('/sites',reader,'POST',{...s.site,id:'forbidden'})).status,403);
 assert.equal((await call('/sites',reader,'POST',{...s.site,name:'Updated by Manager'})).data.name,'Updated by Manager');
 const read=(await call('/keys',reader,'POST',{site:'main',name:'Reader',scope:'read',days:30})).data;const manage=(await call('/keys',reader,'POST',{site:'main',name:'Manager',scope:'manage',days:30})).data;
 assert.ok(read.token);assert.ok(manage.token);assert.equal((await call('/keys',manage.token,'POST',{site:'main',name:'No',scope:'read',days:30})).status,403);
 assert.equal((await call('/sites/main/access',manage.token)).status,403);assert.equal((await call('/export?site=main',read.token)).status,403);
 await nativePost(s,[nativeEvent('rest-page'),nativeEvent('rest-next',{url:'https://example.test/done'}),nativeEvent('rest-event',{kind:'event',name:'Signup'})]);
 const report=await call('/query',read.token,'POST',s.request());assert.equal(report.status,200,JSON.stringify(report));assert.equal(report.data.totals.pageviews,'2');
 assert.deepEqual((await call('/funnels',read.token,'POST',{...s.request(),steps:[{kind:'page',value:'/pricing'},{kind:'page',value:'/done'}]})).data,['1','1']);assert.deepEqual((await call('/journeys',read.token,'POST',s.request())).data,[['(entry)','/pricing','1'],['/done','(exit)','1'],['/pricing','/done','1']]);
 const goal={id:'signup',site:'main',name:'Signup',kind:'event',value:'Signup'};assert.equal((await call('/goals',read.token,'POST',goal)).status,403);assert.equal((await call('/goals',manage.token,'POST',goal)).status,200);assert.equal((await call('/goals?site=main',read.token)).data[0].kind,'event');assert.equal((await call('/goals?site=main&id=signup',manage.token,'DELETE')).status,200);
 assert.equal((await call('/annotations',manage.token,'POST',{id:'launch',site:'main',text:'Launch',at:s.now})).status,200);assert.equal((await call('/annotations?site=main',read.token)).data[0].at,s.now.toString());
 const exported=(await call('/export?site=main&limit=2',manage.token)).data;assert.equal(exported.events.length,2);assert.ok(exported.cursor);assert.deepEqual(exported.events[0].kind,{pageview:null});
 const row={id:'old',site:'main',day:(s.now/86400n-1n)*86400n,dimension:'import:visitors',value:'{}',metrics:report.data.totals};assert.equal((await call('/imports',manage.token,'POST',[row])).data,'1');assert.equal((await call('/imports?site=main&from=0&until='+s.now,read.token)).data[0].id,'old');
 assert.equal((await call('/health',reader)).status,403);assert.equal((await call('/health')).data.storedEvents,'3');assert.equal((await call('/collector-health',reader)).status,403);const health=(await call('/collector-health')).data;assert.equal(health.mode,'canister');assert.equal(health.pending,0);assert.ok(health.lastSuccess>0);
 assert.equal((await call('/keys',reader)).data.length,2);assert.equal((await call('/keys?id='+read.key.id,reader,'DELETE')).status,200);assert.equal((await call('/query',read.token,'POST',s.request())).status,403);
 assert.equal((await call('/sites',owner,'POST',{...s.site,id:'delete-me',domain:'delete.test'})).status,200);assert.equal((await call('/sites/delete-me',reader,'DELETE')).status,403);assert.equal((await call('/sites/delete-me',owner,'DELETE')).status,200);
 const p=(await call('/sites/main/access')).data;assert.equal((await call('/sites/main/access',owner,'PUT',{revision:p.revision,readers:[s.alice],managers:[]})).status,200);assert.equal((await call('/query',manage.token,'POST',s.request())).status,403,'demotion revokes keys through REST too');
 }finally{await s.pic.tearDown();}});

test('Crumbs native: actual populated prior release upgrades with website grants, keys and metrics', {skip:!process.env.CRUMBS_NATIVE_BASELINE},async()=>{const s=await setup(false,'native');try{
 const p=ok(await s.app.getSiteAccess(s.owner.token,'main'));const access=ok(await s.app.setSiteAccess(s.owner.token,'main',p.revision,[],[s.alice]));const key=ok(await s.app.createKey(s.viewer.token,'main','Before upgrade',{read:null},30n));s.app.setPrincipal(ids.collector);ok(await s.app.ingestBatch([s.event('before-release-upgrade')]));const before=ok(await s.app.report(key.token,s.request()));const oldGoal={id:'legacy-goal',site:'main',name:'Landing',kind:{page:null},value:'/'};ok(await s.app.saveGoal(s.owner.token,oldGoal));
 await s.pic.upgradeCanister({sender:ids.controller,canisterId:s.c.canisterId,wasm:wasmPath('crumbs'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 const js=execFileSync('python3',['sdk/tools/did2idl.py','crumbs/backend/dist/backend.did'],{encoding:'utf8'}),{idlFactory}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));s.app=s.pic.createActor(idlFactory,s.c.canisterId);await s.pic.advanceTime(31000);await s.pic.tick(4);
 assert.deepEqual(ok(await s.app.goals(s.owner.token,'main')),[oldGoal]);assert.equal(ok(await s.app.goalReport(key.token,s.request(),oldGoal.id)).completions,1n);
 assert.deepEqual(ok(await s.app.getSiteAccess(s.owner.token,'main')),access);assert.deepEqual(ok(await s.app.report(key.token,s.request())),before);assert.equal((await nativePost(s,nativeEvent('after-release-upgrade'))).data.accepted,1);assert.equal((await nativeApi(s,'/query',key.token,'POST',s.request())).data.totals.pageviews,'2');
 }finally{await s.pic.tearDown();}});

test('Crumbs native end-to-end: HTTP gateway query upgrade and authenticated REST over real transport',async()=>{const s=await setup(true);try{
 const {request:httpRequest}=await import('node:http');
 const port=await s.pic.makeLive(),host=s.c.canisterId.toText()+'.localhost';
 // Node fetch may override Host. Use a real canister subdomain with local DNS.
 const http=(path,method='GET',body,headers={})=>new Promise((resolve,reject)=>{
  const r=httpRequest({hostname:host,port,path,method,lookup:(_name,_options,cb)=>cb(null,[{address:'127.0.0.1',family:4}]),headers},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:res.statusCode,text,headers:res.headers,json:()=>JSON.parse(text)});});});
  r.on('error',reject);r.setTimeout(20000,()=>r.destroy(new Error('Gateway timeout')));r.end(body===undefined?undefined:JSON.stringify(body,(_,v)=>typeof v==='bigint'?v.toString():v));
 });
 const health=await http('/healthz');assert.equal(health.status,200,health.text);assert.equal(health.json().mode,'canister');
 // PocketIC's embedded gateway does not inject X-Real-IP; fail closed without
 // it, then provide deterministic gateway metadata to exercise the full HTTP path.
 const missing=await http('/api/v1/events','POST',nativeEvent('missing-gateway-ip'),{'user-agent':'CrumbsIntegration/1.0'});assert.equal(missing.status,400);
 const sent=await http('/api/v1/events','POST',nativeEvent('actual-native-http'),{'x-real-ip':'203.0.113.42','user-agent':'CrumbsIntegration/1.0','content-type':'text/plain',origin:'https://example.test'});assert.equal(sent.status,202,sent.text);assert.equal(sent.json().durability,'canister');
 const report=await http('/api/v1/query','POST',s.request(),{authorization:'Bearer '+s.owner.token,'content-type':'application/json'});assert.equal(report.status,200,report.text);assert.equal(report.json().totals.pageviews,'1');
 }finally{await s.pic.stopLive();await s.pic.tearDown();}});

test('Crumbs business: scroll goal deduplication, attribution, currencies, REST and permission boundaries',async()=>{const s=await setup();try{const {app,owner,viewer,event,request}=s;app.setPrincipal(ids.collector);
 ok(await app.ingestBatch([
 event('ai-landing',{source:'chatgpt.com'}),
 event('depth-70',{kind:{engagement:null},source:'',at:s.now-95n,order:2n,scrollDepth:70n,engagementMs:1000n,interactive:false}),
 event('depth-90',{kind:{engagement:null},source:'',at:s.now-90n,order:3n,scrollDepth:90n,engagementMs:1000n,interactive:false}),
 event('checkout',{kind:{event:null},name:'Purchase',source:'',at:s.now-85n,order:4n,currency:'CHF',revenueMinor:1200n}),
 event('paid',{visitor:'b'.repeat(64),source:'google.com',medium:'cpc',campaign:'launch'}),
 event('paid-purchase',{visitor:'b'.repeat(64),source:'',kind:{event:null},name:'Purchase',at:s.now-80n,order:5n,currency:'EUR',revenueMinor:500n}),
 event('lookalike',{visitor:'c'.repeat(64),source:'evilchatgpt.com'})]));
 const goal={id:'read-page',site:'main',name:'Read 60%',kind:{scroll:60n},value:'/'};
 assert.ok('unauthorized'in(await app.saveGoal(viewer.token,goal)).err);ok(await app.saveGoal(owner.token,goal));
 assert.deepEqual(ok(await app.goalReport(viewer.token,request(),goal.id)),{visitors:1n,completions:1n,revenue:[]});
 assert.equal(ok(await app.goalReport(viewer.token,request({filters:[{dimension:'channel',values:['Paid search'],exclude:false}]}),goal.id)).completions,0n);
 const channels=ok(await app.report(owner.token,request({dimension:'channel'}))).rows;
 assert.deepEqual(channels.find(r=>r.value==='AI assistants').metrics.revenue,[['CHF',1200n]]);assert.deepEqual(channels.find(r=>r.value==='Paid search').metrics.revenue,[['EUR',500n]]);
 const ai=ok(await app.report(owner.token,request({dimension:'aiSource',filters:[{dimension:'aiSource',values:[''],exclude:true}]})));assert.equal(ai.totals.visitors,1n);assert.equal(ai.rows[0].value,'ChatGPT');
 assert.ok(ok(await app.report(viewer.token,request({dimension:'minute'}))).rows.every(r=>BigInt(r.value)%60n===0n));
 const rest=await nativeApi(s,'/goals/report',viewer.token,'POST',{...request(),id:goal.id});assert.equal(rest.status,200);assert.equal(rest.data.completions,'1');
 assert.equal((await nativeApi(s,'/goals?site=main',viewer.token)).data[0].scrollDepth,'60');
 ok(await app.saveSite(owner.token,{...s.site,retentionDays:1827n}));assert.ok('invalid'in(await app.saveSite(owner.token,{...s.site,retentionDays:1828n})).err);
 assert.equal(ok(await app.report(owner.token,request({from:s.now-1826n*86400n}))).totals.pageviews,3n);
 }finally{await s.pic.tearDown();}});

test('Crumbs business: saved views and SEO are scoped, revision protected, bounded and deleted with a site',async()=>{const s=await setup();try{const {app,owner,viewer}=s;
 const item={id:'campaign',site:'main',name:'Campaign',filters:[{dimension:'channel',values:['Paid search'],exclude:false}],steps:[],revision:0n,updatedAt:0n};
 assert.ok('unauthorized'in(await app.saveReport(viewer.token,item)).err);const saved=ok(await app.saveReport(owner.token,item));assert.equal(saved.revision,1n);assert.deepEqual(ok(await app.savedReports(viewer.token,'main')),[saved]);
 assert.ok('conflict'in(await app.saveReport(owner.token,item)).err);assert.ok('unauthorized'in(await app.savedReports(viewer.token,'private')).err);
 assert.ok('invalid'in(await app.saveReport(owner.token,{...item,id:'bad',filters:[{dimension:'password',values:['x'],exclude:false}]})).err);
 assert.ok('capacity'in(await app.saveReport(owner.token,{...item,id:'huge',filters:[{dimension:'path',values:Array(50).fill('x'.repeat(500)),exclude:false}]})).err);
 assert.ok('conflict'in(await app.deleteReport(owner.token,'main',saved.id,0n)).err);
 assert.ok('unauthorized'in(await app.searchConnection(viewer.token,'main')).err);
 const config={clientId:'123-test.apps.googleusercontent.com',property:'sc-domain:example.test',revision:0n};
 assert.ok('invalid'in(await app.saveSearchConnection(owner.token,'main',{...config,property:'sc-domain:someone-else.test'})).err);
 const connection=ok(await app.saveSearchConnection(owner.token,'main',config));const row={value:'',clicks:5n,impressions:100n,positionMilli:10000n};
 const snap={site:'main',property:config.property,from:s.now-86400n,until:s.now,totals:row,queries:[],pages:[{...row,value:'/pricing'}],fetchedAt:999999999999n,truncated:false};
 assert.ok('unauthorized'in(await app.saveSearchSnapshot(viewer.token,connection.revision,snap)).err);
 assert.ok('invalid'in(await app.saveSearchSnapshot(owner.token,connection.revision,{...snap,queries:[{...row,value:'someone@example.test'}]})).err);
 ok(await app.saveSearchSnapshot(owner.token,connection.revision,snap));assert.equal(ok(await app.searchSnapshot(viewer.token,'main'))[0].fetchedAt,s.now);
 await s.pic.upgradeCanister({sender:ids.controller,canisterId:s.c.canisterId,wasm:wasmPath('crumbs'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});await s.pic.advanceTime(31000);await s.pic.tick(4);assert.deepEqual(ok(await app.savedReports(owner.token,'main')),[saved]);assert.equal(ok(await app.searchSnapshot(viewer.token,'main'))[0].totals.clicks,5n);
 const disconnected=ok(await app.saveSearchConnection(owner.token,'main',{clientId:'',property:'',revision:connection.revision}));assert.equal(disconnected.revision,2n);assert.deepEqual(ok(await app.searchSnapshot(viewer.token,'main')),[]);
 assert.ok('conflict'in(await app.saveSearchSnapshot(owner.token,connection.revision,snap)).err);
 ok(await app.deleteSite(owner.token,'main'));assert.ok('unauthorized'in(await app.savedReports(owner.token,'main')).err);
 }finally{await s.pic.tearDown();}});
