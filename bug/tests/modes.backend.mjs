import assert from 'node:assert/strict';import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';import {idlFactory} from '../src/generated/backend.did.js';
const baselineVersion=process.env.KEBAB_MODES_BASELINE_VERSION||'0.11.0';
const wasm=new URL('../backend/dist/backend.wasm',import.meta.url).pathname,baseline=process.env.KEBAB_MODES_BASELINE_WASM;if(!baseline)throw Error('Set KEBAB_MODES_BASELINE_WASM to the built 0.11.0 backend.');
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const previousTmp=process.env.TMPDIR,testTmp=mkdtempSync(join(tmpdir(),'stb-modes-'));process.env.TMPDIR=testTmp;
const server=await PocketIcServer.start(),pic=await PocketIc.create(server.getUrl()),controller=createIdentity('modes-controller').getPrincipal(),pilot=createIdentity('modes-pilot').getPrincipal(),other=createIdentity('modes-other').getPrincipal();
const ok=r=>{assert.ok('ok'in r,r.err);return r.ok;},twoD={twoD:null},threeD={threeD:null},pause=()=>pic.advanceTime(600);
try{
 await pic.setTime(Date.now());const {actor:a,canisterId}=await pic.setupCanister({sender:controller,controllers:[controller],wasm:baseline,idlFactory});a.setPrincipal(pilot);
 ok(await a.arcadeSetName('SharedPilot'));const old=ok(await a.arcadeBegin());await pic.advanceTime(10000);
 const submission=(runId,meters,version='0.17.0')=>({runId,meters:BigInt(meters),coins:[0n,1n],durationMs:10000n,version});
 ok(await a.arcadeSubmit(submission(old.id,900,baselineVersion)));const previous=await a.arcadeLeaderboard();
 if(baselineVersion!=='0.11.0'){await pause();const legacy2d=ok(await a.arcadeBeginMode(twoD));await pic.advanceTime(10000);ok(await a.arcadeSubmitMode(twoD,submission(legacy2d.id,400,baselineVersion)));}
 const previous2d=baselineVersion==='0.11.0'?[]:await a.arcadeLeaderboardMode(twoD);
 const upgrade=()=>pic.upgradeCanister({sender:controller,canisterId,wasm,upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});await upgrade();
 assert.equal((await a.info()).version,'0.17.0');assert.deepEqual(await a.arcadeLeaderboard(),previous);assert.deepEqual(await a.arcadeLeaderboardMode(twoD),previous2d);assert.equal(ok(await a.arcadeProfile()).name,'SharedPilot');
 await pause();const t3=ok(await a.arcadeBeginMode(threeD));await pause();const t2=ok(await a.arcadeBeginMode(twoD));await pic.advanceTime(10000);
 assert.ok('err'in await a.arcadeSubmit(submission(t2.id,500)));await pause();assert.ok('err'in await a.arcadeSubmitMode(twoD,submission(t3.id,500)));await pause();
 for(const patch of [{version:'0.2.0'},{coins:[0n,0n]},{meters:90000n},{durationMs:100000n}]){assert.ok('err'in await a.arcadeSubmitMode(twoD,{...submission(t2.id,700),...patch}));await pause();}
 assert.equal(ok(await a.arcadeSubmitMode(twoD,submission(t2.id,700))).score,800n);await pause();assert.ok('err'in await a.arcadeSubmitMode(twoD,submission(t2.id,700)));await pause();
 assert.equal(ok(await a.arcadeSubmit(submission(t3.id,1200))).score,1300n);assert.equal((await a.arcadeLeaderboard())[0].score,1300n);assert.equal((await a.arcadeLeaderboardMode(twoD))[0].score,800n);assert.deepEqual(await a.arcadeArchive(),[]);
 const anon=pic.createActor(idlFactory,canisterId);assert.ok('err'in await anon.arcadeBeginMode(twoD));assert.ok('err'in await anon.arcadeRemoveMode(twoD));
 const b=pic.createActor(idlFactory,canisterId);b.setPrincipal(other);assert.ok('err'in await b.arcadeSetName('SharedPilot'));await pause();ok(await b.arcadeSetName('OtherPilot'));const tb=ok(await b.arcadeBeginMode(twoD));await pic.advanceTime(10000);ok(await b.arcadeSubmitMode(twoD,submission(tb.id,500)));
 // The publication receipt differentiates this flight from the pilot's retained best.
 await pause();const lower=ok(await a.arcadeBeginMode(threeD));await pic.advanceTime(10000);
 const lowSubmission=submission(lower.id,300);const receipt=ok(await a.arcadePublish(threeD,lowSubmission));
 assert.equal(receipt.improved,false);assert.equal(receipt.flight.score,400n);assert.equal(receipt.best.score,1300n);assert.deepEqual(receipt.mode,threeD);
 await pause();assert.deepEqual(ok(await a.arcadePublish(threeD,lowSubmission)),receipt,'retry returns the same acknowledgement');
 await pause();assert.ok('err'in await a.arcadePublish(twoD,lowSubmission),'receipt is mode-bound');
 await pause();assert.ok('err'in await b.arcadePublish(threeD,lowSubmission),'receipt is owner-bound');
 await pause();assert.ok('err'in await a.arcadePublish(threeD,{...lowSubmission,meters:1200n}),'changed payload cannot reuse a consumed flight');
 const fresh=pic.createActor(idlFactory,canisterId);fresh.setPrincipal(createIdentity('unnamed-at-launch').getPrincipal());
 const freshRun=ok(await fresh.arcadeBeginMode(threeD));await pic.advanceTime(10000);ok(await fresh.arcadeSetName('GuestAtFinish'));
 const newReceipt=ok(await fresh.arcadePublish(threeD,submission(freshRun.id,100)));
 assert.equal(newReceipt.improved,true);assert.equal(newReceipt.flight.name,'GuestAtFinish');assert.deepEqual(newReceipt.flight,newReceipt.best);
 assert.equal((await a.arcadeLeaderboard()).length,2);await pause();ok(await fresh.arcadeRemove());
 await pause();ok(await a.arcadeSetName('BothDimensions'));assert.equal((await a.arcadeLeaderboard())[0].name,'BothDimensions');assert.equal((await a.arcadeLeaderboardMode(twoD))[0].name,'BothDimensions');
 await pause();assert.equal(ok(await a.arcadePublish(threeD,lowSubmission)).best.name,'BothDimensions','retry reflects current callsign');
 await upgrade();assert.equal((await a.arcadeLeaderboard())[0].score,1300n);assert.equal((await a.arcadeLeaderboardMode(twoD)).length,2);
 ok(await a.arcadeRemoveMode(twoD));assert.deepEqual((await a.arcadeLeaderboardMode(twoD)).map(r=>r.name),['OtherPilot']);assert.equal((await a.arcadeLeaderboard())[0].score,1300n);
 await pause();ok(await b.arcadeRemove());assert.equal((await a.arcadeLeaderboard())[0].score,1300n);assert.equal((await a.arcadeLeaderboardMode(twoD)).length,1);
 console.log('PASS: populated '+baselineVersion+' upgrade, shared callsign, independent 2D/3D records, mode-bound tickets, invalid payloads, replay protection, archive isolation, anonymous rejection, scoped removal, repeat upgrade, accurate publication receipts, lost-ack retries, late guest callsign, retained best, changed-payload and cross-owner/mode replay rejection.');
}finally{await pic.tearDown();await server.stop();if(previousTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=previousTmp;rmSync(testTmp,{recursive:true,force:true});}
