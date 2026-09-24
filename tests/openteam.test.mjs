import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
import {candidateBackend} from './packaged-wasm.mjs';
const P=Object.fromEntries(['controller','owner','admin','employee','lunch'].map(n=>[n,createIdentity('openteam-'+n).getPrincipal()]));
const hubWasm=()=>process.env.KEBAB_OPENTEAM_WASM || candidateBackend('hub');
const claim='be'.repeat(32);let server,dir,fixtureIdl;
async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return (await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
before(async()=>{
 dir=mkdtempSync(join(tmpdir(),'kebab-openteam-test-'));
 const mops=resolve('node_modules/.bin/mops'),cwd=resolve('hub');
 const moc=execFileSync(mops,['toolchain','bin','moc'],{cwd,encoding:'utf8'}).trim();
 const sources=execFileSync(mops,['sources'],{cwd,encoding:'utf8'}).trim().split(/\s+/);
 execFileSync(moc,[...sources,'--idl',resolve('tests/fixtures/openteam/Provider.mo'),'-o',join(dir,'provider.wasm')],{cwd,stdio:'pipe'});
 fixtureIdl=await idl(join(dir,'provider.did'));server=await PocketIcServer.start();
});
after(async()=>{await server?.stop();if(dir)rmSync(dir,{recursive:true,force:true});});
const member=(id,extra={})=>({memberId:String(id),firstName:'Sample '+id,lastName:'Person',email:`person${id}@openteam.test`,title:'Engineer',departmentId:['engineering'],managerId:[],active:[true],protected:[true],version:[1n],erased:[],locale:['en'],kind:['employee'],avatarHash:[],...extra});
async function setup(baseline=false){
 const pic=await PocketIc.create(server.getUrl());await pic.setTime(Date.parse('2026-09-24T14:00:00Z'));
 const hubIdl=await idl('hub/backend/dist/backend.did');
 const h=await pic.setupCanister({sender:P.controller,controllers:[P.controller],wasm:baseline?process.env.KEBAB_OPENTEAM_BASELINE:hubWasm(),idlFactory:hubIdl,environmentVariables:[{name:'KEBAB_CLAIM_CODE',value:claim}]});
 const source=await pic.setupCanister({sender:P.controller,controllers:[P.controller],wasm:join(dir,'provider.wasm'),idlFactory:fixtureIdl});source.actor.setPrincipal(P.controller);
 let hub=h.actor;hub.setPrincipal(P.owner);assert.ok((await hub.claimHubWithCode(claim,{email:'owner@openteam.test',displayName:'Owner',orgName:'Synthetic company'})).ok);
 for(const n of ['admin','employee']){assert.ok(await hub.addLocalUser(n+'@openteam.test',n,'',''));const [invite]=await hub.createInvite(n+'@openteam.test');hub.setPrincipal(P[n]);assert.ok(await hub.claimInvite(invite));hub.setPrincipal(P.owner);}
 assert.ok((await hub.setPersonRole('admin@openteam.test','admin')).ok);await pic.tick(15);
 const x={pic,hub,h,source};
 x.configure=(rows,mode='ok')=>source.actor.configure(rows,mode);
 x.add=async(extra={})=>{hub.setPrincipal(P.owner);const r=await hub.addOpenTeamSource({name:'OpenTeam fixture',provider:source.canisterId,includeExternal:false,excludeIds:[],...extra});assert.ok(r.ok,r.detail);return r.id;};
 x.review=async id=>{hub.setPrincipal(P.owner);return hub.previewOpenTeamSource(id);};
 x.activate=async id=>{const r=await x.review(id);assert.ok(r.ok,r.detail+' '+r.conflicts);const a=await hub.applyOpenTeamSource(id,r.token);assert.ok(a.ok,a.detail);return a;};
 x.person=async email=>(await hub.personCard(email))[0];
 x.access=async email=>hub.checkAccess(email);
 x.upgrade=async()=>{await pic.upgradeCanister({sender:P.controller,canisterId:h.canisterId,wasm:hubWasm(),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});hub=pic.createActor(hubIdl,h.canisterId);hub.setPrincipal(P.owner);x.hub=hub;await pic.tick(15);};
 return x;
}
test('owner reviews a paginated source; roles are not imported; identities survive rename and upgrade',async()=>{const x=await setup();try{
 const rows=Array.from({length:205},(_,i)=>member(i));rows.push(member('external',{kind:['contractor']}),member('agent',{kind:['agent'],email:''}));await x.configure(rows);
 const id=await x.add(),r=await x.review(id);assert.ok(r.ok,r.detail);assert.equal(r.created,205n);assert.equal(r.skipped,2n);assert.equal(r.rows.length,50);assert.deepEqual(await x.access(rows[0].email),{unknown:null});
 x.hub.setPrincipal(P.admin);await assert.rejects(x.hub.applyOpenTeamSource(id,r.token));await assert.rejects(x.hub.previewOpenTeamSource(id));x.hub.setPrincipal(P.employee);await assert.rejects(x.hub.listOpenTeamSources());x.hub.setPrincipal(P.owner);
 assert.ok((await x.hub.applyOpenTeamSource(id,r.token)).ok);assert.equal((await x.hub.applyOpenTeamSource(id,r.token)).ok,false);
 assert.deepEqual(await x.access(rows[0].email),{active:null});assert.deepEqual(await x.access('personexternal@openteam.test'),{unknown:null});
 const before=await x.person(rows[0].email);assert.ok(before.pid);
 // OpenTeam protected=true is not a Hub role. Inspect projected effective hubRole.
 const app=await x.hub.connectApp({name:'Lunch',canisterId:P.lunch.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]});assert.ok(app.ok);x.hub.setPrincipal(P.lunch);const roster=await x.hub.team_members();assert.notEqual(roster.find(p=>p.email===rows[0].email).protected[0],true);x.hub.setPrincipal(P.owner);assert.equal((await x.hub.listPersonRoles()).some(p=>p.email===rows[0].email),false);
 assert.ok((await x.hub.setPersonRole(rows[0].email,'helpdesk')).ok);
 rows[0]={...rows[0],email:'renamed@openteam.test',firstName:'Renamed'};await x.configure(rows);assert.ok((await x.hub.syncNow(id)).ok);assert.equal((await x.person(rows[0].email)).pid,before.pid);assert.ok((await x.hub.listPersonRoles()).some(p=>p.email===rows[0].email&&p.role==='helpdesk'));
 rows[0]={...rows[0],active:[false]};await x.configure(rows);assert.ok((await x.hub.syncNow(id)).ok);assert.deepEqual(await x.access(rows[0].email),{inactive:null});
 await x.upgrade();assert.equal((await x.person(rows[0].email)).pid,before.pid);assert.equal((await x.hub.listOpenTeamSources()).length,1);assert.deepEqual(await x.access(rows[0].email),{inactive:null});await x.hub.pauseOpenTeamSource(id);assert.equal((await x.hub.discardOpenTeamSource(id)).ok,false,'cannot discard a paused source with imported records');
}finally{await x.pic.tearDown();}});
test('incomplete, inconsistent, duplicate and unsupported snapshots never partially apply',async()=>{const x=await setup();try{
 await x.configure([member(1),member(2)]);const id=await x.add();await x.activate(id);const before=await x.person(member(1).email);
 for(const mode of ['offline','truncated','changed','cursor','wrong','future']){await x.configure([member(1,{active:[false]})],mode);const r=await x.hub.syncNow(id);assert.equal(r.ok,false,mode);assert.deepEqual(await x.access(member(1).email),{active:null},mode);assert.equal((await x.person(member(1).email)).pid,before.pid);}
 for(const rows of [[member(1),member(1)],[member(1),member(2,{email:member(1).email})],[member(1,{active:[]})],[member(1,{kind:['unknown']})]]){await x.configure(rows);assert.equal((await x.hub.syncNow(id)).ok,false);assert.deepEqual(await x.access(member(1).email),{active:null});}
 await x.configure([member(1,{active:[false]}),member(2)]);assert.ok((await x.hub.syncNow(id)).ok);assert.deepEqual(await x.access(member(1).email),{inactive:null});
}finally{await x.pic.tearDown();}});
test('preview becomes stale on source or Hub changes; identity conflicts cannot grant an existing account',async()=>{const x=await setup();try{
 await x.configure([member(1,{email:'owner@openteam.test'})]);const id=await x.add();let r=await x.review(id);assert.equal(r.ok,false);assert.match(r.conflicts[0],/already belongs/);assert.equal((await x.hub.applyOpenTeamSource(id,r.token)).ok,false);
 let cfg=(await x.hub.listOpenTeamSources())[0].config;assert.ok((await x.hub.setOpenTeamScope(id,cfg,{...cfg,excludeIds:['1']})).ok);await x.activate(id);assert.deepEqual(await x.access('owner@openteam.test'),{active:null});
 await x.configure([member(2)]);r=await x.review(id);await x.configure([member(3)]);assert.equal((await x.hub.applyOpenTeamSource(id,r.token)).ok,false);assert.deepEqual(await x.access(member(2).email),{unknown:null});
 r=await x.review(id);await x.hub.addLocalUser('other@openteam.test','Other','','');assert.equal((await x.hub.applyOpenTeamSource(id,r.token)).ok,false);
 r=await x.review(id);await x.hub.pauseOpenTeamSource(id);assert.equal((await x.hub.applyOpenTeamSource(id,r.token)).ok,false);
 r=await x.review(id);await x.pic.advanceTime(301000);assert.equal((await x.hub.applyOpenTeamSource(id,r.token)).ok,false);
 assert.equal((await x.hub.updateConnection(id,{name:'overwrite',baseUrl:'https://example.test',clientId:'x',clientSecret:'x',enabled:true})).ok,false);
 assert.equal(await x.hub.regenHookSecret(id),'');assert.equal(await x.hub.regenSigningKey(id),'');assert.ok((await x.hub.discardOpenTeamSource(id)).ok);assert.deepEqual(await x.hub.listOpenTeamSources(),[]);
}finally{await x.pic.tearDown();}});
test('bulk departures require review; tombstones scrub the source profile and cannot reactivate',async()=>{const x=await setup();try{
 const rows=Array.from({length:10},(_,i)=>member(i));await x.configure(rows);const id=await x.add();await x.activate(id);
 const departed=rows.map(r=>({...r,active:[false]}));await x.configure(departed);const result=await x.hub.syncNow(id);assert.equal(result.ok,false);assert.match(result.detail,/Many source accounts/);assert.deepEqual(await x.access(rows[0].email),{active:null});await x.activate(id);assert.deepEqual(await x.access(rows[0].email),{inactive:null});
 const erased=member(0,{firstName:'',lastName:'',email:'',title:'',active:[false],erased:[true],kind:[]});await x.configure([erased,...departed.slice(1)]);assert.ok((await x.hub.syncNow(id)).ok);
 const stored=(await x.hub.listUsers({offset:0n,limit:100n,conn:[id],search:'',activeOnly:false})).items.find(u=>u.key.endsWith(':0'));assert.equal(stored.email,'');assert.equal(stored.displayName,'');
 await x.configure(rows);assert.equal((await x.hub.syncNow(id)).ok,false);assert.deepEqual(await x.access(rows[0].email),{unknown:null});
}finally{await x.pic.tearDown();}});
test('five-minute polling is independent of Okta interval; pause retains access',async()=>{const x=await setup();try{
 await x.configure([member(1)]);const id=await x.add();await x.activate(id);await x.hub.setAutoSync(0n);await x.configure([member(1,{active:[false]})]);await x.pic.advanceTime(301000);await x.pic.tick(60);assert.deepEqual(await x.access(member(1).email),{inactive:null});
 await x.configure([member(1)]);await x.activate(id);assert.ok(await x.hub.pauseOpenTeamSource(id));await x.configure([member(1,{active:[false]})]);await x.pic.advanceTime(301000);await x.pic.tick(60);assert.deepEqual(await x.access(member(1).email),{active:null});
}finally{await x.pic.tearDown();}});
test('populated Hub 0.34 upgrade preserves Lunch, Finance and owner permissions without enabling any source',{skip:!process.env.KEBAB_OPENTEAM_BASELINE},async()=>{const x=await setup(true);try{
 const finance=await x.hub.getFinanceTeam();assert.ok((await x.hub.setFinanceTeam({...finance.config,mode:'it'})).ok);
 const lunch=await x.hub.connectApp({name:'Lunch',canisterId:P.lunch.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]});assert.ok(lunch.ok);x.hub.setPrincipal(P.lunch);const roster=await x.hub.team_members();x.hub.setPrincipal(P.owner);const owner=await x.person('owner@openteam.test');
 await x.upgrade();assert.deepEqual(await x.hub.listOpenTeamSources(),[]);assert.equal((await x.hub.getFinanceTeam()).config.mode,'it');assert.equal((await x.person('owner@openteam.test')).pid,owner.pid);x.hub.setPrincipal(P.lunch);assert.deepEqual(await x.hub.team_members(),roster);x.hub.setPrincipal(P.owner);
 await x.configure([member(1)]);const id=await x.add();await x.activate(id);assert.deepEqual(await x.access(member(1).email),{active:null});
}finally{await x.pic.tearDown();}});

test('OpenTeam departures feed the existing Desk lifecycle once, and initial inactive rows stay quiet',async()=>{const x=await setup();try{
 const deskP=x.source.canisterId;
 const c=await x.hub.connectApp({name:'desk',canisterId:deskP.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]});assert.ok(c.ok);
 assert.ok((await x.hub.setAppPermissions(c.id,0n,{app:'desk',defaultRole:'member',people:[],groups:[]})).ok);
 await x.configure([member(1),member(2,{active:[false]})]);const id=await x.add();await x.activate(id);
 x.hub.setPrincipal(deskP);const baseline=await x.hub.hub_lifecycleEvents(0n);assert.equal(baseline.events.length,0);x.hub.setPrincipal(P.owner);
 await x.configure([member(1,{active:[false]}),member(2,{active:[false]})]);assert.ok((await x.hub.syncNow(id)).ok);assert.ok((await x.hub.syncNow(id)).ok);
 x.hub.setPrincipal(deskP);const events=await x.hub.hub_lifecycleEvents(baseline.cursor);assert.equal(events.events.length,1);assert.equal(events.events[0].email,member(1).email);assert.deepEqual(events.events[0].kind,{deactivated:null});
}finally{await x.pic.tearDown();}});
test('a queued apply cannot override a subsequent pause of an already-paused draft',async()=>{const x=await setup();try{
 await x.configure([member(1)]);const id=await x.add(),review=await x.review(id);
 const deferred=x.pic.createDeferredActor(await idl('hub/backend/dist/backend.did'),x.h.canisterId);deferred.setPrincipal(P.owner);
 const finish=await deferred.applyOpenTeamSource(id,review.token);const paused=await deferred.pauseOpenTeamSource(id);
 assert.ok(await paused());const result=await finish();assert.equal(result.ok,false,result.detail);
 assert.deepEqual(await x.access(member(1).email),{unknown:null});assert.equal((await x.hub.listConnections()).find(c=>c.id===id).enabled,false);
}finally{await x.pic.tearDown();}});

test('erased IDs seen before an import cannot return as new people',async()=>{const x=await setup();try{
 await x.configure([member('gone',{firstName:'',lastName:'',email:'',title:'',active:[false],erased:[true],kind:[]})]);const id=await x.add();await x.activate(id);await x.configure([member('gone')]);
 const r=await x.hub.syncNow(id);assert.equal(r.ok,false);assert.deepEqual(await x.access('persongone@openteam.test'),{unknown:null});
}finally{await x.pic.tearDown();}});
