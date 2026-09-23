import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,collect,stepRun,STEP,fire} from '../src/physics.js';
import {stepFlow,breakFlow,OVERDRIVE_SECONDS} from '../src/overdrive.js';
import {scoreOf} from '../src/scoring.js';
const flying=()=>Object.assign(createRun(38),{phase:'flying',d:2180,y:12,speed:60});
const coin=(r,id)=>collect(r,{id,kind:'cycle'});
test('coin streaks fill FLOW once per coin, trigger automatic bounded drive and keep scoring unchanged',()=>{
 const r=flying();for(let i=0;i<20;i++){coin(r,'c'+i);coin(r,'c'+i);}
 assert.equal(r.coins,20);assert.equal(r.flow.charge,100);assert.equal(r.speed,60);
 stepFlow(r,STEP);assert.equal(r.flow.active,OVERDRIVE_SECONDS);assert.equal(r.flow.activations,1);
 assert.equal(r.speed,82);assert.equal(r.prompts,5);assert.equal(scoreOf(r),3180);
 for(let i=20;i<100;i++)coin(r,'c'+i);
 assert.equal(r.flow.charge,0);stepFlow(r,4);assert.equal(r.flow.active,0);assert.equal(r.flow.cooldown,5);
 coin(r,'later');assert.equal(r.flow.charge,0);stepFlow(r,5);coin(r,'next');assert.equal(r.flow.charge,4);
});
test('a long coin gap resets its streak; real damage loses FLOW while a shield preserves it',()=>{
 const r=flying();for(let i=0;i<4;i++)coin(r,'c'+i);r.elapsed=3;coin(r,'gap');assert.equal(r.flow.streak,1);assert.equal(r.flow.charge,20);
 r.shield=1;collect(r,{id:'wall1',kind:'hazard'});assert.equal(r.flow.charge,20);
 collect(r,{id:'wall2',kind:'hazard'});assert.equal(r.flow.charge,0);
 r.flow.active=2;breakFlow(r);assert.equal(r.flow.active,0);assert.equal(r.flow.cooldown,5);
});
const mine={id:'close',kind:'mine',x:0,y:1.05,d:2200,radius:3.3,hp:1};
test('a close pass pays only after clearing the hazard, once; collisions and patched mines do not pay',()=>{
 const pass=flying();pass.x=5.5;pass.y=1.15;pass.speed=90;
 for(let i=0;i<60;i++)stepRun(pass,STEP,0,[mine]);
 assert.equal(pass.mineHits,0);assert.equal(pass.flow.nearMisses,1);assert.equal(pass.flow.charge,20);
 for(let i=0;i<120;i++)stepRun(pass,STEP,0,[mine]);assert.equal(pass.flow.nearMisses,1);
 const hit=flying();hit.x=3;hit.y=1.15;for(let i=0;i<100;i++)stepRun(hit,STEP,0,[mine]);
 assert.equal(hit.mineHits,1);assert.equal(hit.flow.nearMisses,0);
 const patched=flying();patched.x=5.5;patched.y=5;fire(patched,[mine]);
 for(let i=0;i<140;i++)stepRun(patched,STEP,0,[mine]);assert.equal(patched.minesCleared,1);assert.equal(patched.flow.nearMisses,0);
});
test('far flyovers and low-speed crawling cannot charge FLOW, and a stopped run cannot activate',()=>{
 for(const y of [30,1.15]){const r=flying();r.y=y;r.x=5.5;r.speed=y===30?90:9;
  for(let i=0;i<240;i++)stepRun(r,STEP,0,[mine]);assert.equal(r.flow.nearMisses,0);}
 const stopped=flying();stopped.stillTime=.1;stopped.flow.charge=100;stepFlow(stopped,STEP);
 assert.equal(stopped.flow.active,0);assert.equal(stopped.flow.charge,0);
 const fresh=createRun();assert.equal(fresh.flow.activations,0);assert.equal(fresh.flow.pending.size,0);
});
