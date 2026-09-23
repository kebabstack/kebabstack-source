import assert from 'node:assert/strict';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
import {execFileSync} from 'node:child_process';
import {SCORE_VERSION,VERSION} from '../src/physics.js';
import {fileURLToPath} from 'node:url';
import {idlFactory} from '../src/generated/backend.did.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const base=process.env.KEBAB_LEGACY_BASELINE_DIR,publicBase=process.env.KEBAB_EARLY_PUBLIC_BASELINE_DIR;
if(!base||!publicBase){
 console.log('SKIP: historical 0.2.1 and early-public migrations need KEBAB_LEGACY_BASELINE_DIR and KEBAB_EARLY_PUBLIC_BASELINE_DIR (backend.wasm + backend.did). No private Git history is required.');
 execFileSync(process.execPath,[root+'tests/modes.backend.mjs'],{stdio:'inherit',env:process.env});
 process.exit(0);
}
async function idl(path){const code=execFileSync('python3',[root+'../sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).idlFactory;}
const legacyIdl=await idl(base+'/backend.did'),hubIdl=await idl(root+'../hub/backend/dist/backend.did'),publicIdl=await idl(publicBase+'/backend.did');
const server=await PocketIcServer.start(),pic=await PocketIc.create(server.getUrl());
const controller=createIdentity('bug-upgrade-controller').getPrincipal(),owner=createIdentity('bug-upgrade-owner').getPrincipal(),guest=createIdentity('bug-guest-a').getPrincipal(),guestB=createIdentity('bug-guest-b').getPrincipal();
const ok=r=>{assert.ok('ok' in r,r.err);return r.ok;};let checks=0;const pass=s=>{checks++;console.log('✓ '+s);},pause=()=>pic.advanceTime(600);
try{
 await pic.setTime(Date.now());const code='ab'.repeat(32);
 const {actor:hub,canisterId:hubId}=await pic.setupCanister({sender:controller,controllers:[controller],wasm:root+'../hub/backend/dist/backend.wasm',idlFactory:hubIdl,environmentVariables:[{name:'KEBAB_CLAIM_CODE',value:code}]});
 hub.setPrincipal(owner);assert.equal((await hub.claimHubWithCode(code,{orgName:'Upgrade Test',displayName:'Owner',email:'owner@example.test'})).ok,true);
 const {actor:old,canisterId}=await pic.setupCanister({sender:controller,controllers:[controller],wasm:process.env.KEBAB_BASELINE_WASM||base+'/backend.wasm',idlFactory:legacyIdl});
 old.setPrincipal(controller);assert.equal(await old.setHub(hubId.toText()),true);
 const connector=await hub.connectApp({name:'bug',canisterId:canisterId.toText(),note:'',lanes:['identity','roles','groups'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Bug',kind:'app',url:'https://bug.example.test'}]});assert.equal(connector.ok,true);
 const ticket=async()=>{hub.setPrincipal(owner);const t=await hub.mintAppTicket('',connector.tileId);assert.equal(t.ok,true);return t.ticket;};
 const session=(await old.loginWithTicket(await ticket()))[0];assert.ok(session);await pic.tick();
 assert.equal((await old.setPlayerName(session.token,false,'OriginalCaptain')).ok,true);
 assert.equal((await old.setSettings(session.token,{adminGroup:'flight-admins',appUrl:'https://bug.example.test',orgName:'Keep Our Company'})).ok,true);
 assert.equal((await old.submitScore(session.token,{dm:5000n,zone:'dev',publish:true,durMs:10000n,trace:[]})).ok,true);
 const archived=(await old.leaderboard(session.token))[0];assert.equal(archived.allTime[0].name,'OriginalCaptain');
 const upgrade=()=>pic.upgradeCanister({sender:controller,canisterId,wasm:process.env.KEBAB_CANDIDATE_WASM||root+'backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});await upgrade();
 const a=pic.createActor(idlFactory,canisterId);a.setPrincipal(guest);
 assert.equal((await a.info()).version,VERSION);assert.equal((await a.info()).hubId,hubId.toText());assert.equal((await a.info()).orgName,'Keep Our Company');assert.equal((await a.getSettings(session.token))[0].adminGroup,'flight-admins');
 assert.deepEqual((await a.leaderboard(session.token))[0].allTime,archived.allTime);assert.deepEqual(await a.leaderboard(''),[]);assert.deepEqual(await a.arcadeLeaderboard(),[]);pass('0.2.1 upgrade preserves settings, Hub, names and PRIVATE scores; public board starts empty');
 const anon=pic.createActor(idlFactory,canisterId);assert.ok('err' in await anon.arcadeSetName('Anonymous'));pass('anonymous cannot reserve guest identity');
 assert.ok('err' in await a.arcadeSetName('OriginalCaptain'));pass('guest cannot steal existing Hub callsign');await pause();
 ok(await a.arcadeSetName('PilotAlpha'));await pause();const ra=ok(await a.arcadeBegin());await pic.advanceTime(10000);
 const claim={runId:ra.id,meters:500n,coins:[0n,1n,2n,3n,4n,5n,6n,7n,8n,9n],durationMs:10000n,version:SCORE_VERSION};
 for(const [patch,name]of[[{coins:[0n,0n]},'duplicate coin'],[{meters:20000n},'impossible speed'],[{coins:[9999n]},'unreachable coin'],[{durationMs:100000n},'clock ahead of server'],[{version:'0.2.1'},'wrong version']]){assert.ok('err' in await a.arcadeSubmit({...claim,...patch}));pass(name+' rejected');await pause();}
 assert.equal(ok(await a.arcadeSubmit(claim)).score,1000n);pass('server computes metres + 50 points per coin');await pause();assert.ok('err' in await a.arcadeSubmit(claim));pass('single-use flight ticket');
 const b=pic.createActor(idlFactory,canisterId);b.setPrincipal(guestB);assert.ok('err' in await b.arcadeSetName('pilotalpha'));await pause();ok(await b.arcadeSetName('PilotBeta'));await pause();const rb=ok(await b.arcadeBegin());await pic.advanceTime(10000);ok(await b.arcadeSubmit({...claim,runId:rb.id,meters:800n,coins:[]}));assert.deepEqual((await anon.arcadeLeaderboard()).map(r=>r.name),['PilotAlpha','PilotBeta']);pass('all guests share public board; coins reward shorter flight');
 const t=await ticket();await pause();const pilot=ok(await a.arcadeLogin(t));assert.equal(pilot.hub,true);assert.equal(pilot.name,'OriginalCaptain');assert.ok(pilot.suiteToken);pass('real Hub ticket restores existing handle and topbar token');
 await pause();assert.ok('err' in await b.arcadeLogin(t));pass('ticket cannot sign in another browser');await pause();const rh=ok(await a.arcadeBegin());await pic.advanceTime(10000);ok(await a.arcadeSubmit({...claim,runId:rh.id,meters:900n,coins:[]}));assert.deepEqual((await anon.arcadeLeaderboard()).map(r=>r.name),['PilotAlpha','OriginalCaptain','PilotBeta']);pass('Hub player and guests share public board without old private entries');
 assert.ok(!JSON.stringify(await anon.arcadeLeaderboard(),(_,v)=>typeof v==='bigint'?String(v):v).match(/owner@example|suiteToken|token|owner|h:/));pass('public rows contain no email, person ID or token');await pause();assert.ok('err' in await a.arcadeLogin('bad-ticket'));pass('unverified ticket rejected');
 await pause();const h2=ok(await a.arcadeBeginMode({twoD:null}));await pic.advanceTime(10000);ok(await a.arcadeSubmitMode({twoD:null},{...claim,runId:h2.id,meters:500n}));assert.equal((await a.arcadeLeaderboardMode({twoD:null}))[0].name,'OriginalCaptain');assert.deepEqual(await a.arcadeArchive(),[]);pass('the same Hub profile publishes into an independent 2D board');
 await pause();const outage3=ok(await a.arcadeBegin());await pause();const outage2=ok(await a.arcadeBeginMode({twoD:null}));
 await pic.stopCanister({sender:controller,canisterId:hubId});await pic.advanceTime(61000);await pic.tick();
 const offlinePilot=ok(await a.arcadeProfile());assert.equal(offlinePilot.name,'OriginalCaptain');assert.equal(offlinePilot.hub,false);assert.equal(offlinePilot.suiteToken,'');ok(await b.arcadeProfile());
 assert.deepEqual(await a.whoami(session.token),[]);assert.deepEqual(await a.getSettings(session.token),[]);assert.deepEqual(await a.leaderboard(session.token),[]);assert.equal((await a.resetBoards(session.token)).ok,false);
 ok(await a.arcadePublish({threeD:null},{...claim,runId:outage3.id,meters:300n,coins:[]}));await pause();
 ok(await a.arcadePublish({twoD:null},{...claim,runId:outage2.id,meters:300n,coins:[]}));
 pass('Hub outage expires company access but preserves the callsign and both in-flight public submissions');
 await pic.advanceTime(10*60*60*1000);await pic.tick();
 assert.equal(ok(await a.arcadeProfile()).name,'OriginalCaptain');
 for(const mode of [{threeD:null},{twoD:null}]) {
   await pause();const nextDay=ok(await a.arcadeBeginMode(mode));await pic.advanceTime(10000);
   const receipt=ok(await a.arcadePublish(mode,{...claim,runId:nextDay.id,meters:300n,coins:[]}));assert.equal(receipt.flight.name,'OriginalCaptain');
 }
 await upgrade();const remembered=ok(await a.arcadeProfile());assert.equal(remembered.name,'OriginalCaptain');assert.equal(remembered.hub,false);assert.equal(remembered.suiteToken,'');
 await assert.rejects(()=>b.hub_deactivate(['owner@example.test']));a.setPrincipal(hubId);await a.hub_deactivate(['owner@example.test']);a.setPrincipal(guest);await pause();
 assert.equal(ok(await a.arcadeProfile()).name,'OriginalCaptain');assert.deepEqual(await a.whoami(session.token),[]);
 pass('next-day public publication and repeat upgrade retain identity without restoring revoked Hub privileges');
 await assert.rejects(()=>b.hub_deactivate(['owner@example.test']));await assert.rejects(()=>b.setHub(hubId.toText()));assert.equal((await b.resetBoards('')).ok,false);pass('guests cannot alter directory, Hub config or reset boards');
 await a.arcadeLogout();await pause();assert.equal(ok(await a.arcadeProfile()).name,'PilotAlpha');pass('logout returns original guest profile');await upgrade();assert.equal((await anon.arcadeLeaderboard()).length,3);assert.equal(ok(await a.arcadeProfile()).name,'PilotAlpha');pass('subsequent upgrade preserves public profiles and scores');
 await pause();ok(await a.arcadeRemove());assert.deepEqual((await anon.arcadeLeaderboard()).map(r=>r.name),['OriginalCaptain','PilotBeta']);pass('remove only own public score');
 const fresh=await pic.setupCanister({sender:controller,controllers:[controller],wasm:process.env.KEBAB_CANDIDATE_WASM||root+'backend/dist/backend.wasm',idlFactory});fresh.actor.setPrincipal(guest);ok(await fresh.actor.arcadeProfile());ok(await fresh.actor.arcadeSetName('FreshPilot'));ok(await fresh.actor.arcadeBegin());pass('fresh guest can load profile, pick name and launch immediately');
 // A populated 0.3.1 upgrade proves the new board cannot inherit easier records.
 const prior=await pic.setupCanister({sender:controller,controllers:[controller],wasm:publicBase+'/backend.wasm',idlFactory:publicIdl});
 prior.actor.setPrincipal(guest);ok(await prior.actor.arcadeSetName('EarlyPilot'));
 const early=ok(await prior.actor.arcadeBegin());await pic.advanceTime(20000);
 ok(await prior.actor.arcadeSubmit({runId:early.id,meters:2000n,coins:[],durationMs:20000n,version:'0.3.1'}));await pause();
 const stale=ok(await prior.actor.arcadeBegin());
 prior.actor.setPrincipal(guestB);ok(await prior.actor.arcadeSetName('OtherEarlyPilot'));
 const other=ok(await prior.actor.arcadeBegin());await pic.advanceTime(10000);
 ok(await prior.actor.arcadeSubmit({runId:other.id,meters:500n,coins:[],durationMs:10000n,version:'0.3.1'}));
 const past=await prior.actor.arcadeLeaderboard();assert.equal(past.length,2);
 const promote=()=>pic.upgradeCanister({sender:controller,canisterId:prior.canisterId,wasm:process.env.KEBAB_CANDIDATE_WASM||root+'backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 await promote();const next=pic.createActor(idlFactory,prior.canisterId);next.setPrincipal(guest);
 assert.deepEqual(await next.arcadeLeaderboard(),[]);assert.deepEqual(await next.arcadeArchive(),past);
 assert.equal(ok(await next.arcadeProfile()).name,'EarlyPilot');pass('populated 0.3.1 public scores survive in the archive; Season 2 starts separately');
 assert.ok('err' in await next.arcadeSubmit({...claim,runId:stale.id}));await pause();pass('an old in-flight ticket cannot submit into the new season');
 const nowRun=ok(await next.arcadeBegin());await pic.advanceTime(10000);
 ok(await next.arcadeSubmit({...claim,runId:nowRun.id,meters:300n,coins:[]}));
 assert.equal((await next.arcadeLeaderboard())[0].meters,300n);assert.deepEqual(await next.arcadeArchive(),past);pass('a harder, shorter new run ranks independently of an easier old record');
 await promote();assert.equal((await next.arcadeLeaderboard())[0].meters,300n);assert.deepEqual(await next.arcadeArchive(),past);pass('repeat upgrade retains both current and archived public boards');
 ok(await next.arcadeSetName('RenamedPilot'));assert.equal((await next.arcadeArchive())[0].name,'RenamedPilot');
 ok(await next.arcadeRemove());assert.deepEqual(await next.arcadeLeaderboard(),[]);assert.deepEqual((await next.arcadeArchive()).map(r=>r.name),['OtherEarlyPilot']);pass('own-score removal covers both seasons without deleting another pilot');
 console.log(`${checks} backend integration checks passed.`);
}finally{await pic.tearDown();await server.stop();}
