import assert from 'node:assert/strict';
import { PocketIc, PocketIcServer, createIdentity } from '@dfinity/pic';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { idlFactory } from '../src/generated/backend.did.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=process.env.KEBAB_PUBLIC_BASELINE_WASM;
if(!baseline)throw Error('Set KEBAB_PUBLIC_BASELINE_WASM to the released 0.16.0 Wasm.');
const source=execFileSync('python3',[root+'../sdk/tools/did2idl.py',root+'../hub/backend/backend.did'],{encoding:'utf8'});
const hubIdl=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).idlFactory;
const savedTmp=process.env.TMPDIR,testTmp=mkdtempSync(join(tmpdir(),'bug-public-session-'));process.env.TMPDIR=testTmp;
const server=await PocketIcServer.start(),pic=await PocketIc.create(server.getUrl());
const controller=createIdentity('public-session-controller').getPrincipal(),owner=createIdentity('public-session-owner').getPrincipal();
const returning=createIdentity('returning-public-browser').getPrincipal(),linked=createIdentity('known-public-browser').getPrincipal(),stranger=createIdentity('unrelated-public-browser').getPrincipal();
const ok=r=>{assert.ok('ok' in r,r.err);return r.ok},pause=()=>pic.advanceTime(600),modes=[{threeD:null},{twoD:null}];
try{
 await pic.setTime(Date.now());const code='cd'.repeat(32);
 const {actor:hub,canisterId:hubId}=await pic.setupCanister({sender:controller,controllers:[controller],wasm:root+'../hub/backend/dist/backend.wasm',idlFactory:hubIdl,environmentVariables:[{name:'KEBAB_CLAIM_CODE',value:code}]});
 hub.setPrincipal(owner);assert.equal((await hub.claimHubWithCode(code,{orgName:'Public play',displayName:'Owner',email:'player@example.test'})).ok,true);
 const {actor:a,canisterId}=await pic.setupCanister({sender:controller,controllers:[controller],wasm:baseline,idlFactory});
 a.setPrincipal(controller);await a.setHub(hubId.toText());
 const conn=await hub.connectApp({name:'bug',canisterId:canisterId.toText(),note:'',lanes:['identity','roles','groups'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Bug',kind:'app',url:'https://public.example.test'}]});assert.equal(conn.ok,true);
 const ticket=async()=>{const r=await hub.mintAppTicket('',conn.tileId);assert.equal(r.ok,true);return r.ticket};
 // Reproduce an already expired, pruned 0.16.0 link with an existing browser guest.
 a.setPrincipal(returning);ok(await a.arcadeSetName('ReturningGuest'));ok(await a.arcadeLogin(await ticket()));await pause();ok(await a.arcadeSetName('DDA'));
 await pic.advanceTime(10*60*60*1000+1000);await pic.tick(10);
 assert.ok('err' in await a.arcadeProfile(),'the released version reproduces the expiry blocker');
 // A second browser has a still-provable legacy login and both flights in progress.
 a.setPrincipal(linked);ok(await a.arcadeLogin(await ticket()));
 const flights=[];for(const mode of modes){await pause();flights.push(ok(await a.arcadeBeginMode(mode)))}
 const upgrade=async()=>{await pic.stopCanister({sender:controller,canisterId});try{await pic.upgradeCanister({sender:controller,canisterId,wasm:root+'backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}})}finally{await pic.startCanister({sender:controller,canisterId})}};
 await upgrade();a.setPrincipal(returning);assert.equal(ok(await a.arcadeProfile()).name,'ReturningGuest');
 const b=pic.createActor(idlFactory,canisterId);b.setPrincipal(stranger);
 assert.ok('err' in await b.arcadeSetName('DDA'),'unrelated browser cannot claim linked player name');
 a.setPrincipal(linked);await pic.stopCanister({sender:controller,canisterId:hubId});await pic.advanceTime(61000);await pic.tick();
 const pilot=ok(await a.arcadeProfile());assert.equal(pilot.name,'DDA');assert.equal(pilot.hub,false);assert.equal(pilot.suiteToken,'');
 for(let i=0;i<modes.length;i++){
   await pause();const s={runId:flights[i].id,meters:500n,coins:[],durationMs:10000n,version:'0.16.0'};
   assert.equal(ok(await a.arcadePublish(modes[i],s)).flight.name,'DDA');
   await pause();assert.equal(ok(await a.arcadePublish(modes[i],s)).best.score,500n);
 }
 await pic.advanceTime(11*60*60*1000);await pic.tick();await upgrade();
 assert.equal(ok(await a.arcadeProfile()).name,'DDA');
 const retryRun=ok(await a.arcadeBegin());await pic.advanceTime(10000);
 assert.equal(ok(await a.arcadePublish(modes[0],{runId:retryRun.id,meters:600n,coins:[],durationMs:10000n,version:'0.17.0'})).best.score,600n);
 await a.arcadeLogout();await pause();assert.equal(ok(await a.arcadeProfile()).name,'');
 await pause();assert.ok('err' in await a.arcadeSetName('DDA'),'explicit logout drops only that browser association');
 assert.equal((await b.arcadeLeaderboard())[0].name,'DDA');assert.equal((await b.arcadeLeaderboardMode(modes[1]))[0].name,'DDA');
 console.log('PASS: real 0.16.0 expired-session reproduction, automatic guest recovery, verified legacy ownership upgrade, Hub outage during both flights, old-client receipt retries, next-day/repeat-upgrade publication, callsign protection and explicit logout.');
}finally{await pic.tearDown();await server.stop();if(savedTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=savedTmp;rmSync(testTmp,{recursive:true,force:true})}
