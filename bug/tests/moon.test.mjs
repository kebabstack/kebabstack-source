import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun,collect,fire,stepRun,STEP } from '../src/physics.js';
import { createRun as retroRun,collect as retroCollect } from '../src/two-d/physics.js';
import { stepFlow,flowCandle,OVERDRIVE_SECONDS,MOON_COMBO_SECONDS } from '../src/overdrive.js';
import { weatherAt } from '../src/challenge.js';
import { candleHit,CANDLE_BODY,CANDLE_WICK } from '../src/candle.js';
import { createCandle } from '../src/candle-view.js';
import { FlightFX } from '../src/flight-fx.js';
import { stepGhostShots } from '../src/ghost.js';
import { Scene,Box3 } from 'three';
const flight=()=>Object.assign(createRun(38),{phase:'flying',d:2000,y:24,speed:60});
const coins=(r,n=3,prefix='coin')=>{for(let i=0;i<n;i++)collect(r,{id:prefix+i,kind:'cycle'});};
const advance=(r,n,objects=[])=>{for(let i=0;i<n;i++)stepRun(r,STEP,0,objects);};
const target=(r,extra={})=>({id:'red',kind:'hazard',x:r.x,y:r.y,d:r.d+60,radius:4,hp:1,...extra});

test('three distinct coins and a shot-down candle trigger the God Candle in either order',()=>{
 for(const coinFirst of [true,false]){
  const r=flight(),obj=target(r);
  if(coinFirst)coins(r);
  fire(r,[obj]);advance(r,35,[obj]);assert.ok(r.hits.has(obj.id));
  if(!coinFirst){coins(r);stepFlow(r,STEP);}
  assert.equal(r.flow.moonActivations,1);assert.equal(r.flow.godCandle,true);
  assert.ok(r.flow.active>2.8&&r.flow.active<=OVERDRIVE_SECONDS);
  assert.ok(r.vy>19);assert.equal(r.prompts,5);assert.equal(r.coins,3);
  assert.equal(r.effects.filter(e=>e.godCandle).length,1);
 }
});
test('duplicates, a partial armoured hit and shooting a floor mine do not complete the combination',()=>{
 const r=flight(),obj=target(r,{hp:2});coins(r,2);coins(r,2);
 fire(r,[obj]);advance(r,28,[obj]);assert.equal(r.wallDamage.get(obj.id),1);
 assert.equal(r.flow.moon.candle,false);assert.equal(r.flow.moon.coins,2);
 fire(r,[obj]);advance(r,30,[obj]);assert.equal(r.flow.moon.candle,true);assert.equal(r.flow.active,0);
 coins(r,1,'third');stepFlow(r,STEP);assert.equal(r.flow.moonActivations,1);
 const floor=flight(),mine=target(floor,{kind:'mine',airborne:false});coins(floor);
 fire(floor,[mine]);advance(floor,35,[mine]);assert.equal(floor.minesCleared,1);assert.equal(floor.flow.active,0);
 const air=flight(),floating=target(air,{kind:'mine',airborne:true});coins(air);
 fire(air,[floating]);advance(air,35,[floating]);assert.equal(air.flow.moonActivations,1);
});
test('the six-second combination expires at its deadline and repeated progress cannot extend it',()=>{
 const r=flight();coins(r,1);const deadline=r.flow.moon.expiresAt;
 r.elapsed=5;coins(r,2,'later');assert.equal(r.flow.moon.expiresAt,deadline);
 r.elapsed=MOON_COMBO_SECONDS;flowCandle(r);stepFlow(r,STEP);
 assert.equal(r.flow.moonActivations,0);assert.equal(r.flow.moon.coins,0);
 coins(r);r.elapsed+=MOON_COMBO_SECONDS;stepFlow(r,STEP);assert.equal(r.flow.active,0);
 assert.equal(r.flow.moon.candle,false);
});
test('shield protects progress; damage, landing and a new run clear it',()=>{
 const r=flight();coins(r);r.shield=1;collect(r,{id:'shield',kind:'hazard'});
 assert.equal(r.flow.moon.coins,3);collect(r,{id:'damage',kind:'hazard'});
 assert.equal(r.flow.moon.coins,0);flowCandle(r);stepFlow(r,STEP);assert.equal(r.flow.active,0);
 coins(r);r.stillTime=.01;stepFlow(r,STEP);assert.equal(r.flow.moon.coins,0);assert.equal(r.flow.active,0);
 assert.equal(createRun().flow.moon.expiresAt,0);
 const active=flight();coins(active);flowCandle(active);stepFlow(active,STEP);active.shield=1;
 const pulse=()=>{active.ghost.hitGrace=0;active.ghost.shots.push({x:active.x,y:active.y,d:active.d+1,vx:0,vy:0,vd:-120,life:1});stepGhostShots(active,STEP);};
 pulse();assert.equal(active.flow.godCandle,true);assert.equal(active.shield,0);
 pulse();assert.equal(active.flow.active,0);assert.equal(active.flow.cooldown,5);assert.equal(active.ghost.hits,1);
});
test('God Candle obeys speed cap, diminishing returns and shared cooldown without refilling manual boosts',()=>{
 const r=flight();r.speed=149;r.elapsed=160;r.prompts=1;coins(r);flowCandle(r);stepFlow(r,STEP);
 assert.equal(r.speed,150);assert.equal(r.vy,12);assert.equal(r.prompts,1);
 coins(r,3,'during');flowCandle(r);stepFlow(r,OVERDRIVE_SECONDS);
 assert.equal(r.flow.active,0);assert.equal(r.flow.godCandle,false);assert.equal(r.flow.cooldown,5);
 coins(r,3,'cooldown');flowCandle(r);stepFlow(r,5);assert.equal(r.flow.active,0);
 assert.equal(r.flow.moon.coins,0);assert.equal(r.flow.moon.candle,false);
 coins(r,3,'after');flowCandle(r);stepFlow(r,STEP);assert.equal(r.flow.moonActivations,2);
 const stalled=flight();stalled.speed=7;coins(stalled);flowCandle(stalled);stepFlow(stalled,STEP);assert.equal(stalled.flow.active,0);
});
test('2D retains its ordinary FLOW and has no candle combo',()=>{
 const r=Object.assign(retroRun(),{phase:'flying',speed:60});
 for(let i=0;i<20;i++)retroCollect(r,{kind:'cycle',id:'retro'+i});
 flowCandle(r);stepFlow(r,STEP);assert.equal(r.flow.moon,null);assert.equal(r.flow.godCandle,false);
 assert.equal(r.flow.activations,1);assert.equal(r.vy,10);
});
test('no input stays in the same 3D lane across both side winds, all weather cycles and released steering',()=>{
 const directions=new Set();
 for(let seed=0;seed<24;seed++){
  const r=flight();r.seed=seed;r.y=100000;r.x=7;
  for(let i=0;i<120*65;i++){
   const weather=weatherAt(seed,r.elapsed);if(weather.x)directions.add(Math.sign(weather.x));
   stepRun(r,STEP,0,[]);assert.equal(r.x,7);assert.equal(r.vx,0);assert.notEqual(r.wind.kind,'crosswind');
  }
 }
 assert.deepEqual([...directions].sort(),[-1,1]);
 const release=flight();release.y=10000;
 for(let i=0;i<60;i++)stepRun(release,STEP,1,[]);
 assert.ok(release.vx>20);advance(release,240);assert.ok(Math.abs(release.vx)<.003);
 const x=release.x;advance(release,120*30);assert.ok(Math.abs(release.x-x)<.001);
});
test('red candle sweep matches its body and thin wick, including safe gaps above the body',()=>{
 const center={x:0,y:0,d:5},sweep=(x,y)=>candleHit({x,y,d:0},{x,y,d:10},center,.5);
 assert.equal(sweep(0,0),true);assert.equal(sweep(0,4.5),true);
 assert.equal(sweep(2.2,0),false);assert.equal(sweep(1.2,4),false);assert.equal(sweep(0,5.2),false);
 const mesh=createCandle(),box=new Box3().setFromObject(mesh);
 assert.ok(Math.abs(box.max.x-CANDLE_BODY.x)<1e-6);assert.ok(Math.abs(box.max.y-CANDLE_WICK.y)<1e-6);
 const r=flight(),obj=target(r,{d:r.d+5});r.speed=150;stepRun(r,.05,0,[obj]);assert.ok(r.hitTime>0);
});
test('green candle is bounded, readable without bloom/reduced motion, and disappears on reset',()=>{
 const fx=new FlightFX(new Scene()),r=flight();coins(r);flowCandle(r);stepFlow(r,STEP);
 fx.update(r,.1,true,null);assert.equal(fx.godCandle.visible,true);assert.equal(fx.godCandle.scale.y,1.5);
 assert.equal(fx.godCandle.children.length,3);assert.equal(fx.godCandle.children[1].material.map,null);
 const before=fx.godCandle.position.x;r.x=12;fx.update(r,.1,true,null);assert.notEqual(fx.godCandle.position.x,before);
 stepFlow(r,OVERDRIVE_SECONDS);fx.update(r,.1,true,null);assert.equal(fx.godCandle.visible,false);
 r.flow.active=2;r.flow.godCandle=true;fx.update(r,.1,false,null);fx.reset();assert.equal(fx.godCandle.visible,false);
});
