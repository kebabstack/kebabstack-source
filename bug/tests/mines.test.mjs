import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMines, MINE_LANES } from '../src/mines.js';
import { createRun, collect, fire, findTarget, stepRun, STEP, makeObjects } from '../src/physics.js';
import { scoreOf } from '../src/scoring.js';
const flight=()=>Object.assign(createRun(38),{phase:'flying',d:2180,y:8,speed:80,vy:0});
const mine=(id,d,x=0,y=1.05)=>({id,kind:'mine',d,x,y,radius:3.3,hp:1,airborne:y>2});
test('deterministic minefields cover both edges, mostly guard the floor and preserve connected escape lanes',()=>{
  assert.deepEqual(makeMines(38,0),[]);
  for(let seed=0;seed<50;seed++) {
    let previous=null, covered=new Set();
    for(let chunk=1;chunk<30;chunk++) {
      const all=makeMines(seed,chunk); assert.deepEqual(all,makeMines(seed,chunk)); assert.ok(all.length<=5);
      assert.ok(all.filter(m=>!m.airborne).length>all.filter(m=>m.airborne).length);
      for(let row=0;row<2;row++) {
        const objects=all.filter(o=>o.d===chunk*200+25+row*100);
        const occupied=objects.filter(o=>!o.airborne).map(o=>o.x);
        const gap=MINE_LANES.filter(x=>!occupied.includes(x));
        assert.equal(gap.length,3); assert.ok(gap.some((x,i)=>i>0&&x-gap[i-1]===14));
        if(previous) assert.ok(gap.some(x=>previous.includes(x)), 'successive rows share a safe floor lane');
        previous=gap;
        for(const o of objects) {assert.ok(!gap.includes(o.x));covered.add(o.x);}
      }
      assert.equal(all.filter(m=>m.airborne).length,chunk>=2?1:0);
    }
    assert.equal(covered.size,5, "no lane is permanently immune to mines");
  }
});
test('mine IDs never collide with pickup IDs or another row and leave the first 21 coin IDs intact',()=>{
  const objects=Array.from({length:20},(_,i)=>makeObjects(38,i)).flat();
  assert.equal(new Set(objects.map(o=>o.id)).size,objects.length);
  for(let i=0;i<20;i++) assert.deepEqual(makeObjects(38,i).slice(0,21).map(o=>o.id),Array.from({length:21},(_,n)=>`38:${i}:${n}`));
});
test('one pulse clears a targeted air mine once, without firewall or leaderboard bonuses',()=>{
  const r=flight(),obj=mine('air',r.d+45,0,8);assert.equal(findTarget(r,[obj]),obj);fire(r,[obj]);
  for(let i=0;i<45;i++)stepRun(r,STEP,0,[obj]);
  assert.equal(r.minesCleared,1);assert.equal(r.mineHits,0);assert.equal(r.destroyed,0);assert.equal(r.cycles,15);
  assert.equal(scoreOf(r),Math.floor(r.d));assert.equal(collect(r,obj),false);
  assert.equal(r.effects.filter(e=>e.kind==='mine-destroy').length,1);
});
test('a ground mine can be shot along the rising flight corridor',()=>{
  const r=flight();r.d=480;r.y=8;const obj=mine('rise',r.d+40);fire(r,[obj]);
  for(let i=0;i<40;i++)stepRun(r,STEP,0,[obj]);
  assert.equal(r.minesCleared,1);assert.equal(r.mineHits,0);
});
test('a mine collision costs momentum only once, consumes a shield and never becomes a collectible seal',()=>{
  const r=flight(),obj=mine('contact',r.d);collect(r,obj);assert.equal(r.speed,48);assert.equal(r.mineHits,1);
  assert.equal(collect(r,obj),false);assert.equal(r.speed,48);assert.equal(r.seals.size,0);
  const shielded=flight();shielded.shield=1;collect(shielded,obj);
  assert.equal(shielded.speed,80);assert.equal(shielded.shield,0);assert.equal(shielded.mineHits,0);assert.equal(shielded.minesCleared,0);
});
test('fast floor collisions are swept, but flying clearly above the hull is safe',()=>{
  const hit=flight();hit.y=1.15;hit.speed=150;const obj=mine('swept',hit.d+5);
  stepRun(hit,.05,0,[obj]);assert.equal(hit.mineHits,1);
  const above=flight();above.y=6;above.speed=150;stepRun(above,.05,0,[obj]);assert.equal(above.mineHits,0);
  const edge=flight();edge.x=32;edge.y=1.15;edge.speed=150;stepRun(edge,.05,0,[mine('edge',edge.d+5,28)]);assert.equal(edge.mineHits,1);
});
