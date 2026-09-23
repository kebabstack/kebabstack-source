import assert from 'node:assert/strict';
import {SCORE_VERSION} from '../src/physics.js';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
const releaseVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
import {idlFactory} from '../src/generated/backend.did.js';
const wasm=new URL('../backend/dist/backend.wasm',import.meta.url).pathname;
const server=await PocketIcServer.start(),pic=await PocketIc.create(server.getUrl());
const ctrl=createIdentity('2d-test-controller').getPrincipal(),p1=createIdentity('2d-pilot-a').getPrincipal(),p2=createIdentity('2d-pilot-b').getPrincipal();
const ok=r=>{assert.ok('ok'in r,r.err);return r.ok;};
try{
 await pic.setTime(Date.now());
 const baseline=process.env.KEBAB_BASELINE_WASM;
 const a=await pic.setupCanister({sender:ctrl,controllers:[ctrl],wasm:baseline||wasm,idlFactory});
 const initialVersion=baseline?'0.1.0':releaseVersion;
 const b=await pic.setupCanister({sender:ctrl,controllers:[ctrl],wasm,idlFactory});
 a.actor.setPrincipal(p1);b.actor.setPrincipal(p1);
 assert.equal((await a.actor.info()).version,initialVersion);ok(await a.actor.arcadeSetName('PixelPilot'));await pic.advanceTime(600);
 const run=ok(await a.actor.arcadeBegin());await pic.advanceTime(10000);
 const score={runId:run.id,meters:500n,coins:[0n,1n,2n],durationMs:10000n,version:baseline?initialVersion:SCORE_VERSION};
 for(const change of [{version:'0.11.0'},{meters:90000n},{coins:[0n,0n]},{coins:[9000n]},{durationMs:100000n}]){assert.ok('err'in await a.actor.arcadeSubmit({...score,...change}));await pic.advanceTime(600);}
 assert.equal(ok(await a.actor.arcadeSubmit(score)).score,650n);await pic.advanceTime(600);assert.ok('err'in await a.actor.arcadeSubmit(score));
 assert.equal((await a.actor.arcadeLeaderboard()).length,1);assert.equal((await b.actor.arcadeLeaderboard()).length,0);
 ok(await b.actor.arcadeSetName('PixelPilot'));assert.equal(ok(await b.actor.arcadeProfile()).name,'PixelPilot');
 a.actor.setPrincipal(p2);assert.ok('err'in await a.actor.arcadeSetName('PixelPilot'));await assert.rejects(()=>a.actor.setHub(b.canisterId.toText()));assert.equal((await a.actor.resetBoards('')).ok,false);
 ok(await a.actor.arcadeRemove());assert.equal((await a.actor.arcadeLeaderboard()).length,1);
 await pic.upgradeCanister({sender:ctrl,canisterId:a.canisterId,wasm,upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 assert.equal((await a.actor.info()).version,releaseVersion);
 a.actor.setPrincipal(p1);assert.equal((await a.actor.arcadeLeaderboard())[0].score,650n);assert.equal(ok(await a.actor.arcadeProfile()).name,'PixelPilot');await pic.advanceTime(600);ok(await a.actor.arcadeRemove());assert.equal((await a.actor.arcadeLeaderboard()).length,0);
 const hubWasm=new URL('../../hub/backend/dist/backend.wasm',import.meta.url).pathname;
 if(existsSync(hubWasm)){
  const did=new URL('../../hub/backend/dist/backend.did',import.meta.url).pathname;
  const idl=execFileSync('python3',[new URL('../../sdk/tools/did2idl.py',import.meta.url).pathname,did],{encoding:'utf8'});
  const hubIdl=(await import('data:text/javascript;base64,'+Buffer.from(idl).toString('base64'))).idlFactory;
  const code='ab'.repeat(32),owner=createIdentity('2d-hub-owner').getPrincipal();
  const h=await pic.setupCanister({sender:ctrl,controllers:[ctrl],wasm:hubWasm,idlFactory:hubIdl,environmentVariables:[{name:'KEBAB_CLAIM_CODE',value:code}]});
  h.actor.setPrincipal(owner);assert.equal((await h.actor.claimHubWithCode(code,{orgName:'Pixel Test',displayName:'Owner',email:'owner@example.test'})).ok,true);
  a.actor.setPrincipal(ctrl);assert.equal(await a.actor.setHub(h.canisterId.toText()),true);
  const c=await h.actor.connectApp({name:'Ship the Bug 2D',canisterId:a.canisterId.toText(),note:'',lanes:['identity','roles','groups'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Ship the Bug 2D',kind:'app',url:'https://pixel.example.test/'}]});assert.equal(c.ok,true);
  const t=await h.actor.mintAppTicket('',c.tileId);assert.equal(t.ok,true);
  a.actor.setPrincipal(p1);const profile=ok(await a.actor.arcadeLogin(t.ticket));assert.equal(profile.hub,true);assert.ok(profile.suiteToken);
  b.actor.setPrincipal(p2);assert.ok('err'in await b.actor.arcadeLogin(t.ticket));
  await pic.stopCanister({sender:ctrl,canisterId:h.canisterId});await pic.advanceTime(61000);await pic.tick();assert.ok('err'in await a.actor.arcadeProfile());
  b.actor.setPrincipal(p1);assert.equal(ok(await b.actor.arcadeProfile()).name,'PixelPilot');
  console.log('PASS: real Hub setup, separate 2D connector, SSO ticket, replay rejection and 60-second access expiry.');
 }
 console.log('PASS: independent boards/profiles, 3D version rejection, valid score, invalid payloads, single-use ticket, permissions, own-score removal and populated upgrade.');
}finally{await pic.tearDown();await server.stop();}
