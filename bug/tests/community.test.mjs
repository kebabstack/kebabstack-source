import { compareFlight } from '../src/result-board.js';
import { scoreOf } from '../src/scoring.js';
import { SCORE_VERSION } from '../src/physics.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/community.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
async function setup(actor,hash='',deployment={}){
 if(!actor.arcadePublish)actor.arcadePublish=async(mode,s)=>{const r=await ('twoD' in mode?actor.arcadeSubmitMode(mode,s):actor.arcadeSubmit(s));return 'err' in r?r:{ok:{flight:r.ok,best:r.ok,improved:true,mode}};};
 const dom=new JSDOM(html,{url:(deployment.origin||'https://game.example.test/')+hash});
 const w=dom.window;let run={phase:'done',practice:false,d:460,coins:2,coinIds:['1:0:0','1:0:1'],elapsed:17,ranking:Promise.resolve({id:1n})};
 const Community=new Function('document','location','history','connect','SCORE_VERSION','mountSuite','topbarIdlFactory','compareFlight','scoreOf',source.replace('export class Community','class Community')+';return Community')(w.document,w.location,w.history,async()=>({actor,hubUrl:'https://hub.example.test',hubActor:()=>({}),hubTileId:deployment.hubTileId}),SCORE_VERSION,()=>({destroy(){}}),()=>({}),compareFlight,scoreOf);
 const c=new Community({mode:deployment.mode,showModal:id=>w.document.getElementById(id).setAttribute('open',''),closeModal:id=>w.document.getElementById(id).removeAttribute('open'),getRun:()=>run});
 return {c,w,getRun:()=>run,setRun:r=>{run=r},$:id=>w.document.getElementById(id)};
}
test('custom and original domains sign in through the same bound Hub tile',async()=>{
 for(const origin of ['https://play.example.test/','https://original.example.test/']) {
  const {c}=await setup({},'',{origin,hubTileId:6});await c.api();
  assert.equal(c.hubLoginUrl(),'https://hub.example.test/?jump=6');
 }
});
test('unconfigured or invalid tile IDs retain the normal origin-based Hub return',async()=>{
 for(const hubTileId of [undefined,0,-1,1.5,'https://untrusted.example',Number.MAX_SAFE_INTEGER+1]) {
  const {c}=await setup({},'',{hubTileId});await c.api();
  assert.equal(new URL(c.hubLoginUrl()).searchParams.get('jump'),'https://game.example.test/');
 }
 const {c}=await setup({});await c.api();c.hubUrl='https://user:password@hub.example.test';assert.throws(()=>c.hubLoginUrl());
});
test('public guest names, publishes explicit coin bonus, and reads shared board without Hub',async()=>{
 let submits=0;const row={name:'GuestOne',meters:460n,coins:2n,score:560n};
 const {c,$}=await setup({arcadeProfile:async()=>({ok:{name:'',hub:false}}),arcadeSetName:async name=>({ok:{name,hub:false}}),arcadeSubmit:async s=>{submits++;assert.deepEqual(s.coins,[0n,1n]);return{ok:row}},arcadeLeaderboard:async()=>[row]});
 await c.boot();assert.equal(submits,0);$('playerName').value='GuestOne';await c.saveName();assert.equal($('playerChip').textContent,'GuestOne');assert.equal(submits,0);
 $('resultName').value='GuestOne';await c.publish();assert.equal(submits,1);assert.match($('saveNote').textContent,/560 points saved/);await c.global();assert.match($('scoreList').textContent,/GuestOne/);assert.match($('scoreList').textContent,/460 m/);
});
test('Hub ticket is removed from URL and restored callsign renders without blocking public play',async()=>{
 const {c,$,w}=await setup({arcadeLogin:async t=>{assert.equal(t,'abcdefabcdefabcd');return{ok:{name:'OldCaptain',hub:true,hubId:'aaaaa-aa',suiteToken:'suite'}}}},'#uht=abcdefabcdefabcd');
 await c.boot();assert.equal(w.location.hash,'');assert.equal($('playerChip').textContent,'OldCaptain');assert.equal($('hubLoginBtn').hidden,true);assert.equal($('suiteTopbar').hidden,false);
});
test('practice flights never submit and backend failure leaves publication retry available',async()=>{
 let submits=0;const {c,$,getRun}=await setup({arcadeSubmit:async()=>{submits++;throw Error('offline')}});c.pilot={name:'Pilot'};$('resultName').value='Pilot';getRun().practice=true;await c.publish();assert.equal(submits,0);getRun().practice=false;await c.publish();assert.equal(submits,1);assert.equal($('publishBtn').disabled,false);assert.match($('saveNote').textContent,/offline/);
});
test('late publish reply cannot overwrite a newly started flight',async()=>{
 let reply;const {c,$,setRun}=await setup({arcadeSubmit:()=>new Promise(r=>reply=r)});c.pilot={name:'Pilot'};$('resultName').value='Pilot';const pending=c.publish();await new Promise(r=>setTimeout(r,0));setRun({phase:'flying'});c.reset();reply({ok:{name:'Pilot',score:500n}});await pending;assert.equal($('publishBtn').textContent,'PUBLISH 3D SCORE');
});
test('archive and current leaderboard cannot replace each other through a late response',async()=>{
 let archiveReply;
 const old={name:'EarlyPilot',score:9000n,meters:9000n,coins:0n};
 const current={name:'NewPilot',score:500n,meters:400n,coins:2n};
 const {c,$}=await setup({arcadeArchive:()=>new Promise(r=>archiveReply=r),arcadeLeaderboard:async()=>[current]});
 const pending=c.global(true);await new Promise(r=>setTimeout(r,0));await c.global();archiveReply([old]);await pending;
 assert.match($('scoreList').textContent,/NewPilot/);assert.doesNotMatch($('scoreList').textContent,/EarlyPilot/);
 assert.equal($('archiveTab').getAttribute('aria-pressed'),'false');assert.match($('boardStatus').textContent,/Season 2/);
});

test('finishing automatically compares the private flight and never writes a name or score',async()=>{
 let writes=0,reads=0;const {c,$}=await setup({arcadeLeaderboard:async()=>{reads++;return[{name:'First',score:1000n,meters:1000n,coins:0n}]},arcadeSetName:async()=>writes++,arcadeSubmit:async()=>writes++});
 await c.finish();assert.equal(reads,1);assert.equal(writes,0);assert.equal($('resultRank').textContent,'#2');
 assert.match($('resultScoreList').textContent,/YOU · PRIVATE FLIGHT/);assert.equal($('profileDialog').hasAttribute('open'),false);
});
test('unnamed guests choose and publish inline with one action and no profile dialog',async()=>{
 let names=0,submits=0;let rows=[];
 const {c,$}=await setup({arcadeLeaderboard:async()=>rows,arcadeSetName:async name=>{names++;return{ok:{name,hub:false}}},arcadeSubmit:async()=>{submits++;rows=[{name:'InlinePilot',score:560n,meters:460n,coins:2n}];return{ok:rows[0]}}});
 await c.finish();$('resultName').value='InlinePilot';await c.publish();
 assert.equal(names,1);assert.equal(submits,1);assert.equal($('profileDialog').hasAttribute('open'),false);
 assert.equal($('publishBtn').textContent,'3D BEST SAVED ✓');assert.equal($('againBtn').textContent,'PLAY AGAIN');
 assert.equal($('resultRank').textContent,'#1');assert.match($('resultScoreList').textContent,/YOUR PUBLISHED BEST/);
 await c.publish();assert.equal(submits,1);
});
test('invalid or taken callsigns stay in the result sheet and allow an inline correction',async()=>{
 let submits=0;
 const {c,$}=await setup({arcadeLeaderboard:async()=>[],arcadeSetName:async name=> name==='Taken'?{err:'That callsign is already taken.'}:{ok:{name,hub:false}},arcadeSubmit:async()=>{submits++;return{ok:{name:'FreePilot',score:560n}}}});
 await c.finish();await c.publish();assert.equal(submits,0);assert.match($('saveNote').textContent,/Choose a callsign/);
 $('resultName').value='Taken';await c.publish();assert.equal(submits,0);assert.match($('saveNote').textContent,/already taken/);
 assert.equal($('resultName').disabled,false);assert.equal($('againBtn').disabled,false);assert.equal($('profileDialog').hasAttribute('open'),false);
 $('resultName').value='FreePilot';await c.publish();assert.equal(submits,1);
});
test('offline comparison keeps the private result visible and retry fetches into the same sheet',async()=>{
 let fail=true;const {c,$}=await setup({arcadeLeaderboard:async()=>{if(fail)throw Error('offline');return[]}});
 await c.finish();assert.equal($('resultRank').textContent,'—');assert.match($('resultScoreList').textContent,/560/);assert.equal($('resultBoardRetry').hidden,false);
 fail=false;await c.loadResult(c.getRun());assert.equal($('resultRank').textContent,'#1');assert.equal($('resultBoardRetry').hidden,true);
});
test('late result fetch cannot overwrite the next flight or result',async()=>{
 let reply;const {c,$,setRun}=await setup({arcadeLeaderboard:()=>new Promise(r=>reply=r)});
 const pending=c.finish();await new Promise(r=>setTimeout(r,0));setRun({phase:'flying'});c.reset();reply([{name:'StalePilot',score:999n}]);await pending;
 assert.equal(c.resultRows,null);assert.doesNotMatch($('resultScoreList').textContent,/StalePilot/);
});
test('publication locks its action during the write and an error makes correction possible again',async()=>{
 let reject;const {c,$,getRun}=await setup({arcadeSubmit:()=>new Promise((_,r)=>reject=r)});
 c.pilot={name:'Pilot'};$('resultName').value='Pilot';const pending=c.publish();await new Promise(r=>setTimeout(r,0));
 assert.equal(getRun().publishing,true);assert.equal($('againBtn').disabled,true);assert.equal($('resultName').disabled,true);
 reject(Error('Connection lost. Check the board before retrying.'));await pending;
 assert.equal(getRun().publishing,false);assert.equal($('againBtn').disabled,false);assert.equal($('publishBtn').disabled,false);
 assert.equal($('againBtn').textContent,'PLAY AGAIN');
});

test('2D result uses only the 2D board and publishes the same shared callsign with a mode-bound ticket',async()=>{
 let started=0,submitted=0,wrong=0;const row={name:'SharedPilot',score:560n,meters:460n,coins:2n};
 const {c,$,getRun}=await setup({arcadeProfile:async()=>({ok:{name:'SharedPilot',hub:false}}),arcadeBeginMode:async mode=>{assert.deepEqual(mode,{twoD:null});started++;return{ok:{id:1n,day:20704n}};},arcadeLeaderboardMode:async mode=>{assert.deepEqual(mode,{twoD:null});return[row];},arcadeSubmitMode:async(mode,s)=>{assert.deepEqual(mode,{twoD:null});assert.equal(s.version,'0.17.0');submitted++;return{ok:row};},arcadeLeaderboard:async()=>{wrong++;return[];},arcadeSubmit:async()=>{wrong++;}},'',{mode:'2d'});
 getRun().day=20704;await c.boot();c.begin(getRun());await getRun().ranking;await c.finish();$('resultName').value='SharedPilot';await c.publish();
 assert.equal(started,1);assert.equal(submitted,1);assert.equal(wrong,0);assert.match($('resultBoardStatus').textContent,/2D/);
});
test('late 2D leaderboard responses cannot replace a newly selected 3D board',async()=>{
 let reply;const {c,$}=await setup({arcadeLeaderboardMode:()=>new Promise(r=>reply=r),arcadeLeaderboard:async()=>[{name:'ThreeD',score:500n,meters:500n,coins:0n}]});
 const old=c.global(false,'2d');await new Promise(r=>setTimeout(r,0));await c.global(false,'3d');reply([{name:'TwoD',score:1000n,meters:1000n,coins:0n}]);await old;
 assert.match($('scoreList').textContent,/ThreeD/);assert.doesNotMatch($('scoreList').textContent,/TwoD/);assert.equal($('board3dBtn').getAttribute('aria-pressed'),'true');
});
test('removing a selected 2D score never calls the 3D deletion endpoint',async()=>{
 let removed=0;const {c,$}=await setup({arcadeRemoveMode:async mode=>{assert.deepEqual(mode,{twoD:null});removed++;return{ok:true};},arcadeRemove:async()=>assert.fail('3D score must survive'),arcadeLeaderboardMode:async()=>[]});
 await c.global(false,'2d');assert.equal($('archiveTab').hidden,true);await c.remove();assert.equal(removed,1);assert.match($('boardStatus').textContent,/2D/);
});

for(const mode of ['2d','3d'])test(`${mode} publication reports retained best honestly and keeps it after switching boards`,async()=>{
 const best={name:'DDA',score:8151n,meters:7601n,coins:11n,at:1n};
 const flight={name:'DDA',score:560n,meters:460n,coins:2n,at:2n};
 const api={arcadeProfile:async()=>({ok:{name:'DDA',hub:false}}),arcadePublish:async m=>({ok:{flight,best,improved:false,mode:m}}),arcadeLeaderboard:async()=>mode==='3d'?[best]:[],arcadeLeaderboardMode:async()=>mode==='2d'?[best]:[]};
 const {c,$,getRun}=await setup(api,'',{mode});await c.boot();await c.finish();await c.publish();
 assert.equal(getRun().published,true);assert.equal($('publishBtn').textContent,'BEST SCORE RETAINED ✓');
 assert.match($('saveNote').textContent,/560 points.*8,151 stays/);assert.match($('resultScoreList').textContent,/8,151/);
 await c.global(false,mode==='2d'?'3d':'2d');assert.doesNotMatch($('scoreList').textContent,/DDA/);
 await c.global(false,mode);assert.match($('scoreList').textContent,/DDA · YOU/);assert.match($('scoreList').textContent,/8,151/);
});
test('a lost acknowledgement can retry the exact flight; an unavailable refresh does not erase confirmation',async()=>{
 let calls=0;const attempts=[];const row={name:'Pilot',score:560n,meters:460n,coins:2n,at:1n};
 const {c,$,getRun}=await setup({arcadeProfile:async()=>({ok:{name:'Pilot',hub:false}}),arcadeLeaderboard:async()=>{throw Error('offline')},arcadePublish:async(mode,s)=>{attempts.push(s);if(++calls===1)throw Error('Response lost');return{ok:{flight:row,best:row,improved:true,mode}}}});
 await c.boot();await c.finish();await c.publish();assert.equal(getRun().published,undefined);assert.equal($('saveNote').dataset.state,'error');assert.equal($('publishBtn').disabled,false);
 await c.publish();assert.deepEqual(attempts[0],attempts[1]);assert.equal(getRun().published,true);assert.equal($('saveNote').dataset.state,'success');assert.match($('saveNote').textContent,/560 points saved/);assert.match($('resultScoreList').textContent,/YOUR PUBLISHED BEST/);assert.equal($('resultRank').textContent,'—');
});

for (const mode of ['2d','3d']) test(`${mode} returning public player publishes without any Hub login or logout`, async()=>{
 let published=0,logins=0,logouts=0;
 const row={name:'DDA',score:560n,meters:460n,coins:2n,at:1n};
 const {c,$,getRun}=await setup({
  arcadeProfile:async()=>({ok:{name:'DDA',hub:false,hubId:'aaaaa-aa',suiteToken:''}}),
  arcadeBegin:async()=>({ok:{id:1n}}),arcadeBeginMode:async()=>({ok:{id:1n}}),
  arcadeLogin:async()=>{logins++;throw Error('Hub is unavailable')},arcadeLogout:async()=>{logouts++},
  arcadePublish:async m=>{published++;return{ok:{flight:row,best:row,improved:true,mode:m}}},
  arcadeLeaderboard:async()=>published?[row]:[],arcadeLeaderboardMode:async()=>published?[row]:[],
 },'',{mode});
 await c.boot();c.begin(getRun());await getRun().ranking;await c.finish();
 assert.equal($('resultName').value,'DDA');assert.equal($('suiteTopbar').hidden,true);
 assert.equal($('logoutBtn').hidden,true);assert.match($('profileDescription').textContent,/without signing in/);
 await c.publish();assert.equal(published,1);assert.equal(logins,0);assert.equal(logouts,0);
 assert.equal(getRun().published,true);assert.match($('saveNote').textContent,/560 points saved as DDA/);
});
test('an expired optional Hub ticket still restores the browser public profile',async()=>{
 const {c,$}=await setup({arcadeLogin:async()=>({err:'Ticket expired'}),arcadeProfile:async()=>({ok:{name:'DDA',hub:false}})},'#uht=expired-optional-ticket');
 await c.boot();assert.equal(c.pilot.name,'DDA');assert.equal($('logoutBtn').hidden,true);
 assert.equal($('profileDialog').hasAttribute('open'),false);
});

test('score publication uses the gameplay protocol across cosmetic releases',async()=>{
 let payload;const {c,$}=await setup({arcadeSubmit:async s=>{payload=s;return{ok:{name:'Pilot',score:560n}}}});
 c.pilot={name:'Pilot'};$('resultName').value='Pilot';await c.publish();
 assert.equal(payload.version,SCORE_VERSION);
});
