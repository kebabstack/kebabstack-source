import assert from 'node:assert/strict';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';
import { Actor, HttpAgent } from '@icp-sdk/core/agent';
import { DelegationChain, DelegationIdentity, Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { idlFactory } from '../src/generated/backend.did.js';
import { RULESET, RULESET_3D } from '../src/ruleset.js';
import { APP_VERSION } from '../src/app.js';
const baseline=process.env.KEBAB_STANDALONE_BASELINE_WASM;
if(!baseline)throw Error('Set KEBAB_STANDALONE_BASELINE_WASM to the committed 0.17.4/0.17.5 baseline Wasm.');
const candidate=process.env.KEBAB_CANDIDATE_WASM || new URL('../backend/dist/backend.wasm',import.meta.url).pathname;
const server=await PocketIcServer.start(),pic=await PocketIc.create(server.getUrl());
const controller=createIdentity('standalone-controller').getPrincipal();
const guest=createIdentity('existing-browser-pilot').getPrincipal(), ii=createIdentity('independent-identity-pilot').getPrincipal();
const modes=[{threeD:null},{twoD:null}],ok=r=>{assert.ok('ok' in r,r.err);return r.ok;};
const wait=()=>pic.advanceTime(600);
const submission=(ticket,version,meters=500n)=>({runId:ticket.id,version,meters,coins:[0n,1n],durationMs:10000n});
try {
 await pic.setTime(Date.now());
 const {actor:a,canisterId}=await pic.setupCanister({sender:controller,controllers:[controller],wasm:baseline,idlFactory});
 a.setPrincipal(guest);ok(await a.arcadeSetName('ExistingGuest'));
 for(const mode of modes){await wait();const r=ok(await a.arcadeBeginMode(mode));await pic.advanceTime(10000);ok(await a.arcadePublish(mode,submission(r,'0.17.0')));}
 const boards=await Promise.all(modes.map(mode=>a.arcadeLeaderboardMode(mode)));
 const failed=[];
 for(const mode of modes){await wait();const r=ok(await a.arcadeBeginMode(mode));await pic.advanceTime(10000);const payload=submission(r,'0.17.5',600n);assert.match((await a.arcadePublish(mode,payload)).err,/old game version/);failed.push(payload);}
 const upgrade=async()=>{await pic.stopCanister({sender:controller,canisterId});try{await pic.upgradeCanister({sender:controller,canisterId,wasm:candidate,upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}})}finally{await pic.startCanister({sender:controller,canisterId})}};
 await upgrade();assert.equal((await a.info()).version,APP_VERSION);assert.equal((await a.info()).hubSet,false);
 assert.deepEqual(await Promise.all(modes.map(mode=>a.arcadeLeaderboardMode(mode))),boards);
 assert.equal(ok(await a.arcadeProfile()).name,'ExistingGuest');
 for(let i=0;i<modes.length;i++){await wait();assert.equal(ok(await a.arcadePublish(modes[i],failed[i])).best.score,700n);}
 // Every shipped compatible UI version stays valid. Unknown or different gameplay stays rejected.
 for(const version of ['0.16.0','0.16.1','0.17.0','0.17.1','0.17.2','0.17.3','0.17.4','0.17.5',RULESET,RULESET_3D]){
  await wait();const r=ok(await a.arcadeBegin());await pic.advanceTime(10000);assert.equal(ok(await a.arcadePublish(modes[0],submission(r,version))).flight.score,600n);
 }
 await wait();const r=ok(await a.arcadeBegin());await pic.advanceTime(10000);
 for(const version of ['0.15.0','0.18.0','arbitrary-future-rules']){await wait();assert.match((await a.arcadePublish(modes[0],submission(r,version))).err,/incompatible game rules/);}
 // A separate signed caller needs no Hub setup, company profile, admin claim or name transfer.
 const b=pic.createActor(idlFactory,canisterId);b.setPrincipal(ii);assert.equal(ok(await b.arcadeProfile()).name,'');
 assert.ok('err' in await b.arcadeSetName('ExistingGuest'));await wait();ok(await b.arcadeSetName('IdentityPilot'));
 for(const mode of modes){await wait();const r=ok(await b.arcadeBeginMode(mode));await pic.advanceTime(10000);assert.equal(ok(await b.arcadePublish(mode,submission(r,RULESET,800n))).best.name,'IdentityPilot');}
 const otherDevice=pic.createActor(idlFactory,canisterId);otherDevice.setPrincipal(ii);await wait();assert.equal(ok(await otherDevice.arcadeProfile()).name,'IdentityPilot');
 await upgrade();await wait();assert.equal(ok(await a.arcadeProfile()).name,'ExistingGuest');assert.equal(ok(await b.arcadeProfile()).name,'IdentityPilot');
 for(const mode of modes)assert.deepEqual((await a.arcadeLeaderboardMode(mode)).map(x=>x.name),['IdentityPilot','ExistingGuest']);
 await wait();ok(await b.arcadeRemoveMode(modes[1]));assert.deepEqual((await a.arcadeLeaderboardMode(modes[1])).map(x=>x.name),['ExistingGuest']);assert.equal((await a.arcadeLeaderboard()).length,2);
 const anon=pic.createActor(idlFactory,canisterId);assert.ok('err' in await anon.arcadeBegin());assert.ok('err' in await anon.arcadeSetName('Anonymous'));assert.ok('err' in await anon.arcadeRemove());
 assert.equal((await b.resetBoards('')).ok,false);assert.deepEqual(await b.getSettings(''),[]);await assert.rejects(()=>b.setHub('aaaaa-aa'));
 // Exercise real HTTP signatures and independently renewed session keys. This is
 // an isolated delegation test, not a claim of testing a real II passkey ceremony.
 const port=await pic.makeLive(), root=Ed25519KeyIdentity.generate();
 const rootKey=Uint8Array.from(await pic.getPubKey(await pic.getCanisterSubnetId(canisterId)));
 const delegated=async()=>{
  const key=Ed25519KeyIdentity.generate();
  const chain=await DelegationChain.create(root,key.getPublicKey(),new Date(Date.now()+600000),{targets:[canisterId]});
  const identity=DelegationIdentity.fromDelegation(key,chain);
  const agent=await HttpAgent.create({host:`http://127.0.0.1:${port}`,identity,rootKey});
  return Actor.createActor(idlFactory,{agent,canisterId});
 };
 const deviceA=await delegated();ok(await deviceA.arcadeSetName('DelegatedPilot'));
 const ticket=ok(await deviceA.arcadeBegin());
 ok(await deviceA.arcadePublish(modes[0],{runId:ticket.id,meters:200n,coins:[],durationMs:2000n,version:RULESET}));
 const deviceB=await delegated();assert.equal(ok(await deviceB.arcadeProfile()).name,'DelegatedPilot');
 assert.ok((await deviceB.arcadeLeaderboard()).some(row=>row.name==='DelegatedPilot'&&row.score===200n));
 console.log('PASS: real signed HTTP delegation, renewed session key and profile/score recovery without Hub.');
 console.log('PASS: exact old-version failure reproduced in both modes; populated upgrade retains names, scores and rejected in-flight tickets; all shipped compatible versions and independent ruleset accepted; unknown rules rejected; standalone signed callers without Hub; same-principal profile recovery; no callsign theft; anonymous/admin isolation; scoped deletion; repeat upgrade.');
} finally {await pic.tearDown();await server.stop();}
