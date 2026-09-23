import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
const ids=Object.fromEntries(['controller','owner','alice','bob','viewer'].map(n=>[n,createIdentity('trust-workspace-'+n).getPrincipal()]));
const code='da'.repeat(32);let server;
before(async()=>{server=await PocketIcServer.start();});after(async()=>{await server?.stop();});
async function factory(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return (await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
const currentPath=name=>process.env.KEBAB_TEST_WASM_DIR?resolve(process.env.KEBAB_TEST_WASM_DIR,name):resolve(name,'backend/dist');
async function install(pic,name,path=currentPath(name)){
 const idlFactory=await factory(path+'/backend.did');
 return {...await pic.setupCanister({sender:ids.controller,controllers:[ids.controller],wasm:path+'/backend.wasm',idlFactory,environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:code}]:[]}),idlFactory};
}
async function setup(pic,{baseline=false,baselinePath}={}){
 const h=await install(pic,'hub'),hub=h.actor;hub.setPrincipal(ids.owner);
 assert.equal((await hub.claimHubWithCode(code,{email:'owner@trust.test',displayName:'Owner',orgName:'Trust test'})).ok,true);
 for(const n of ['alice','bob','viewer']){hub.setPrincipal(ids.owner);assert.equal(await hub.addLocalUser(n+'@trust.test',n,'',''),true);const [invite]=await hub.createInvite(n+'@trust.test');hub.setPrincipal(ids[n]);assert.equal(await hub.claimInvite(invite),true);}
 hub.setPrincipal(ids.owner);const viewerPid=(await hub.personCard('viewer@trust.test'))[0].pid;
 const f=await install(pic,'trust',baseline?process.env.KEBAB_TRUST_BASELINE:baselinePath||currentPath('trust'));f.actor.setPrincipal(ids.controller);await f.actor.setHub(h.canisterId.toText());
 const c=await hub.connectApp({name:'Trust',canisterId:f.canisterId.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Trust',kind:'app',url:'https://trust.test'}]});assert.equal(c.ok,true,c.detail);
 assert.equal((await hub.setAppPermissions(c.id,0n,{app:'trust',defaultRole:'member',people:[{id:viewerPid,role:'viewer'}],groups:[]})).ok,true);
 const ctx={...f,hub,connector:c};ctx.login=async(n)=>{hub.setPrincipal(ids[n]);const t=await hub.mintAppTicket('',c.tileId);assert.equal(t.ok,true,t.detail);return (await ctx.actor.loginWithTicket(t.ticket))[0].token;};
 ctx.admin=await ctx.login('owner');ctx.alice=await ctx.login('alice');ctx.bob=await ctx.login('bob');ctx.viewer=await ctx.login('viewer');
 assert.equal((await ctx.actor.setEnroll(ctx.admin,'local-test-enrol-secret')).ok,true);await pic.tick(5);
 ctx.http=async(url,body)=>{const r=await ctx.actor.http_request_update({method:'POST',url,headers:[],body:Buffer.from(JSON.stringify(body))});assert.equal(r.status_code,200);return JSON.parse(Buffer.from(r.body).toString());};
 ctx.enroll=async(host,os='darwin')=>(await ctx.http('/enroll',{enroll_secret:'local-test-enrol-secret',host_identifier:'UUID-'+host,host_details:{system_info:{hostname:host,hardware_serial:'SERIAL-'+host},os_version:{version:'fixture',platform:os,name:os}}})).node_key;
 ctx.wire=async(key,id)=>{await ctx.http('/config',{node_key:key});const q=await ctx.http('/distributed/read',{node_key:key});const name=Object.keys(q.queries).find(x=>x==='cis:'+id||x.startsWith('cis:'+id+'~'));assert.ok(name,'query queued: '+id);return name;};
 ctx.report=async(key,id,rows,status=0)=>{const wire=await ctx.wire(key,id);return ctx.http('/distributed/write',{node_key:key,queries:{[wire]:rows},statuses:{[wire]:status}});};
 return ctx;
}
const custom=(over={})=>({id:'empty_check',title:'No forbidden rows',category:'Custom',os:'macos',level:1n,sql:'SELECT name FROM apps WHERE name = \'Forbidden.app\'',rule:'empty',...over});
test('Trust: public agent status routes use verified HTTP updates and never change device state',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await setup(pic);await f.enroll('Status Mac');
  const before=await f.actor.devices(f.admin),removals=await f.actor.removalRecords(f.admin);
  for(const [url,body] of [['/agent/health','trust-agent-v2'],['/agent/health?probe=1','trust-agent-v2'],['/agent/version',''],['/agent/decommissioned','']]){
   const req={method:'GET',url,headers:[],body:Buffer.alloc(0)};
   const query=await f.actor.http_request(req);assert.deepEqual(query.upgrade,[true],url+' must not return an uncertified query body');assert.equal(query.body.length,0);
   const update=await f.actor.http_request_update(req);assert.equal(update.status_code,200);assert.equal(Buffer.from(update.body).toString(),body);assert.deepEqual(update.upgrade,[]);
  }
  assert.deepEqual((await f.actor.http_request({method:'GET',url:'/agent/health-other',headers:[],body:Buffer.alloc(0)})).upgrade,[],'unknown health paths are not accepted');
  assert.deepEqual(await f.actor.devices(f.admin),before);assert.deepEqual(await f.actor.removalRecords(f.admin),removals);
 }finally{await pic.tearDown();}
});
test('Trust: populated 0.7 patch upgrade preserves removal evidence and agent revocation',{skip:!process.env.KEBAB_TRUST_MANAGED_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await setup(pic,{baselinePath:process.env.KEBAB_TRUST_MANAGED_BASELINE});
  const key=await f.enroll('Retired Mac'),device=(await f.actor.devices(f.admin))[0];
  assert.equal((await f.actor.removeDevices(f.admin,[device.nodeKey])).removed,1n);
  const pending=(await f.actor.removalRecords(f.admin))[0];assert.equal((await f.actor.verifyRemoval(f.admin,pending.id,'Iru cleanup job 987654')).ok,true);
  const before=await f.actor.removalRecords(f.admin);
  await pic.upgradeCanister({sender:ids.controller,canisterId:f.canisterId,wasm:currentPath('trust')+'/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  f.actor=pic.createActor(await factory(currentPath('trust')+'/backend.did'),f.canisterId);await pic.tick(5);f.admin=await f.login('owner');
  assert.deepEqual(await f.actor.removalRecords(f.admin),before);assert.deepEqual(await f.actor.devices(f.admin),[]);
  assert.equal((await f.http('/config',{node_key:key})).node_invalid,true);
  assert.ok(!(await f.enroll('Retired Mac')),'removed device cannot enrol after the upgrade');
  assert.equal((await f.actor.allowAgain(f.admin,[pending.id])).ok,true);assert.ok(await f.enroll('Retired Mac'),'explicitly allowing the device enables enrolment');
 }finally{await pic.tearDown();}
});
test('Trust: missing, failed, stale and superseded checks cannot be counted as verified passing',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await setup(pic),a=f.actor,t=f.admin,key=await f.enroll('Mac');
  assert.equal((await a.setChecks(t,['filevault','firewall'])).ok,true);
  const view=async()=>(await a.devices(f.admin))[0];
  const ops=async()=>{f.hub.setPrincipal(ids.owner);const r=await f.hub.operationsSnapshot(f.connector.id);assert.ok('ready' in r.state);return Object.fromEntries(r.metrics);};
  assert.equal((await view()).assessment.state,'pending');
  await f.report(key,'filevault',[{encrypted:'1'}]);
  assert.equal((await view()).assessment.state,'pending');assert.equal((await view()).score,50n);assert.equal((await a.fleetStats(t))[0].compliant,0n);
  await f.report(key,'firewall',[{global_state:'1'}]);assert.equal((await view()).assessment.state,'passing');assert.equal((await a.fleetStats(t))[0].compliant,1n);assert.equal((await ops()).score,100n);assert.equal((await ops()).assessed,1n);
  await f.report(key,'firewall',[{global_state:'0'}]);assert.equal((await view()).assessment.state,'attention');assert.deepEqual((await view()).failingChecks,['firewall']);assert.equal((await ops()).score,50n);assert.equal((await ops()).attention,1n);
  await f.report(key,'firewall',[],1);assert.equal((await view()).assessment.state,'error');assert.deepEqual((await view()).failingChecks,[]);assert.equal((await a.fleetStats(t))[0].failingByCheck.some(x=>x[2]>0n),false);
  assert.equal((await a.addCheck(t,custom())).ok,true);await a.setChecks(t,['empty_check']);
  const errorWire=await f.wire(key,'empty_check');await f.http('/distributed/write',{node_key:key,statuses:{[errorWire]:1}});
  assert.equal((await view()).assessment.state,'error','status-only error must not pass an empty-result rule');
  await f.report(key,'empty_check',[]);assert.equal((await view()).assessment.state,'passing','successful empty result is legitimate for an empty rule');
  const oldWire=await f.wire(key,'empty_check');assert.equal((await a.addCheck(t,custom({sql:'SELECT name FROM apps',rule:'nonEmpty'}))).ok,true);
  await f.http('/distributed/write',{node_key:key,queries:{[oldWire]:[{name:'old query'}]},statuses:{[oldWire]:0}});
  assert.equal((await view()).assessment.state,'pending','late result for old SQL cannot verify the replacement');
  await f.report(key,'empty_check',[{name:'App'}]);assert.equal((await view()).assessment.state,'passing');
  await a.setChecks(t,['filevault','empty_check']);await f.report(key,'filevault',[{encrypted:'1'}]);
  await pic.advanceTime(86_401_000);await pic.tick(10);f.admin=await f.login('owner');
  await f.report(key,'filevault',[{encrypted:'1'}]);
  const stale=await view();assert.equal(stale.assessment.state,'stale');assert.equal(stale.assessment.stale,1n);assert.equal(stale.score,50n,'one new check does not refresh the other check');assert.equal((await ops()).assessed,0n);assert.equal((await ops()).unverified,1n);
  const detail=(await a.deviceDetail(f.admin,stale.nodeKey))[0];assert.equal(detail.checks.find(c=>c.id==='empty_check').state,'stale');
  await f.report(key,'filevault',[{encrypted:'0'}]);assert.equal((await view()).assessment.state,'attention','a current known failure stays actionable alongside stale checks');
  await f.wire(key,'filevault');await a.setChecks(f.admin,[]);assert.equal(Object.keys((await f.http('/distributed/read',{node_key:key})).queries).some(q=>q.startsWith('cis:')),false,'disabled checks are removed from pending work');assert.equal((await view()).assessment.state,'no_checks');assert.equal((await a.fleetStats(f.admin))[0].compliant,0n);
 }finally{await pic.tearDown();}
});
test('Trust: device handles do not authenticate agents; Hub roles, ownership and query scopes are enforced',async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await setup(pic),a=f.actor,t=f.admin;
  const macInstaller=(await a.deploymentFile(t,'macos','install',false))[0],winInstaller=(await a.deploymentFile(t,'windows','install',false))[0];
  assert.equal(macInstaller.name,'trust-macos-install.sh');assert.match(macInstaller.body,/SHA-256 mismatch/);assert.doesNotMatch(macInstaller.body,/@@[A-Z_]+@@/);
  assert.equal(winInstaller.name,'trust-windows-install.ps1');assert.match(winInstaller.body,/Get-AuthenticodeSignature/);assert.equal((await a.deploymentFile(f.viewer,'macos','install',false)).length,0,'deployment files stay admin-only');
  const mac=await f.enroll('Mac'),win=await f.enroll('PC','windows');const all=await a.devices(t),m=all.find(d=>d.hostname==='Mac'),w=all.find(d=>d.hostname==='PC');
  assert.match(m.nodeKey,/^device-/);assert.notEqual(m.nodeKey,mac);assert.notEqual(w.nodeKey,win);
  assert.equal((await f.http('/config',{node_key:m.nodeKey})).node_invalid,true);assert.equal((await f.http('/config',{node_key:mac})).node_invalid,false);
  assert.equal((await a.setDeviceOwner(t,m.nodeKey,'alice@trust.test')).ok,true);
  assert.equal((await a.devices(f.alice)).length,1);assert.equal((await a.devices(f.viewer)).length,2);assert.deepEqual(await a.devices(f.bob),[]);
  assert.equal((await a.deviceDetail(f.alice,m.nodeKey)).length,1);assert.deepEqual(await a.deviceDetail(f.alice,w.nodeKey),[]);
  assert.equal((await a.setDeviceOwner(f.alice,w.nodeKey,'alice@trust.test')).ok,false);assert.equal((await a.removeDevices(f.viewer,[m.nodeKey])).ok,false);
  const args={sql:'SELECT version FROM osquery_info',title:'Versions',source:'admin',nodeKey:''};
  assert.equal((await a.createScopedQuery(f.alice,args,'all')).ok,false);assert.equal((await a.createScopedQuery(f.viewer,args,'all')).ok,false);
  await a.seedDemo(t);const r=await a.createScopedQuery(t,args,'macos');assert.equal(r.ok,true);assert.equal(r.targeted,1n,'only the real Mac is queried');
  assert.equal(Object.hasOwn((await f.http('/distributed/read',{node_key:win})).queries,r.id),false);
  await f.http('/distributed/write',{node_key:mac,queries:{[r.id]:[{version:'test'}]},statuses:{[r.id]:0}});
  const results=(await a.queryResults(t,r.id))[0];assert.equal(results.rows[0][0],m.nodeKey);assert.deepEqual(await a.queryResults(f.alice,r.id),[]);assert.deepEqual(await a.queryResults(f.viewer,r.id),[]);
  assert.equal((await a.createQuery(t,args)).targeted,2n,'legacy API still targets real devices');
  assert.equal((await a.createScopedQuery(t,args,'invalid')).ok,false);
  assert.equal((await a.removeDevices(t,[w.nodeKey])).removed,1n);assert.equal((await f.http('/config',{node_key:win})).node_invalid,true);
  const pending=(await a.removalRecords(t))[0];assert.equal(pending.hostname,'PC');assert.equal(pending.verifiedAt,0n);
  assert.equal((await a.verifyRemoval(f.viewer,pending.id,'Iru job 123456')).ok,false,'fleet viewers cannot attest removal');
  assert.equal((await a.verifyRemoval(t,pending.id,'job')).ok,false,'short removal evidence is rejected');
  assert.equal((await a.verifyRemoval(t,pending.id,'Iru job 123456')).ok,true);
  const verified=(await a.removalRecords(t))[0];assert.notEqual(verified.verifiedAt,0n);assert.equal(verified.evidence,'Iru job 123456');
  assert.equal((await a.allowAgain(t,[pending.id])).ok,true);assert.deepEqual(await a.removalRecords(t),[],'allowing enrolment clears the pending removal record');
 }finally{await pic.tearDown();}
});
test('Trust: populated 0.5 upgrade preserves agent keys, ownership, checks, results, tuning and central roles', {skip:!process.env.KEBAB_TRUST_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());try{
  const f=await setup(pic,{baseline:true}),a=f.actor,t=f.admin,key=await f.enroll('Existing Mac');
  await a.setChecks(t,['filevault','firewall']);await f.report(key,'filevault',[{encrypted:'1'}]);await f.report(key,'firewall',[{global_state:'1'}]);
  assert.equal((await a.setDeviceOwner(t,key,'alice@trust.test')).ok,true);await a.setTuning(t,{distInterval:45n,watchdogMem:200n,watchdogUtil:25n,splay:20n});
  const before=(await a.devices(t))[0],settings=(await a.getSettings(t))[0];assert.equal(before.nodeKey,key,"baseline demonstrates the previously exposed agent key");
  const lunch=createIdentity('trust-upgrade-lunch').getPrincipal();f.hub.setPrincipal(ids.owner);
  assert.equal((await f.hub.connectApp({name:'Lunch',canisterId:lunch.toText(),note:'existing roster consumer',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]})).ok,true);
  const policyBefore=(await f.hub.getAppPermissions(f.connector.id))[0].policy;
  const readLunch=async()=>{f.hub.setPrincipal(lunch);return {members:await f.hub.team_members(),info:await f.hub.team_info()};};
  const lunchBefore=await readLunch();
  const upgrade=async()=>{await pic.upgradeCanister({sender:ids.controller,canisterId:f.canisterId,wasm:currentPath('trust')+'/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});f.actor=pic.createActor(await factory(currentPath('trust')+'/backend.did'),f.canisterId);await pic.tick(5);f.admin=await f.login('owner');};
  await upgrade();const after=(await f.actor.devices(f.admin))[0];
  assert.notEqual(after.nodeKey,key);assert.equal(after.hardwareSerial,before.hardwareSerial);assert.equal(after.owner,before.owner);assert.deepEqual(after.posture,before.posture);assert.equal(after.assessment.state,'pending','old aggregate timestamps cannot prove freshness');
  const afterSettings=(await f.actor.getSettings(f.admin))[0];for(const k of ['tuneDistInterval','tuneWatchdogMem','tuneWatchdogUtil','tuneScheduleSplay','enrollFingerprint','assetsId','configVersion'])assert.deepEqual(afterSettings[k],settings[k],k+' preserved');
  assert.equal((await f.actor.deviceDetail(await f.login('alice'),after.nodeKey)).length,1);assert.equal((await f.actor.whoami(await f.login('viewer')))[0].role,'helpdesk');assert.deepEqual(await f.actor.devices(await f.login('bob')),[]);
  assert.equal((await f.http('/config',{node_key:key})).node_invalid,false);await f.report(key,'filevault',[{encrypted:'1'}]);await f.report(key,'firewall',[{global_state:'1'}]);assert.equal((await f.actor.devices(f.admin))[0].assessment.state,'passing');
  assert.deepEqual(await readLunch(),lunchBefore,'Trust upgrade does not change the Lunch roster contract');f.hub.setPrincipal(ids.owner);assert.deepEqual((await f.hub.getAppPermissions(f.connector.id))[0].policy,policyBefore,'central permission policy is preserved');
  await upgrade();assert.equal((await f.actor.devices(f.admin))[0].nodeKey,after.nodeKey,'public ID persists across another real upgrade');assert.equal((await f.http('/config',{node_key:key})).node_invalid,false);
 }finally{await pic.tearDown();}
});
