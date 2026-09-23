import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, beginCharge, launch, fire, findTarget, stepRun, STEP, SHOT_INTERVAL, ascentAt, makeObjects } from '../src/physics.js';
function flight(d=1900) { const r=createRun(20703);beginCharge(r);r.charge=1;launch(r);r.d=d;r.y=12;r.vy=0;return r; }
const wall=(id,d,x=0,y=12)=>({id,kind:'hazard',d,x,y,radius:3.5});
function advance(r,sec,objects=[]){for(let i=0;i<Math.round(sec/STEP);i++)stepRun(r,STEP,0,objects);}
test('pulse is available only in flight and cooldown prevents click/repeat spam',()=>{
 const idle=createRun();assert.equal(fire(idle),false);const r=flight();assert.equal(fire(r),true);
 for(let i=0;i<100;i++)assert.equal(fire(r),false);
 assert.equal(r.shotsFired,1);advance(r,SHOT_INTERVAL+.01);assert.equal(fire(r),true);
 r.phase='done';assert.equal(fire(r),false);
});
test('aim assist ignores pickups, cleared walls, distant walls and off-screen angles',()=>{
 const r=flight(),near=wall('near',r.d+80,5),far=wall('far',r.d+220),behind=wall('behind',r.d-10),side=wall('side',r.d+30,40),high=wall('high',r.d+50,0,150);
 assert.equal(findTarget(r,[far,behind,side,high]),null);
 assert.equal(findTarget(r,[{...near,kind:'coffee'}]),null);
 assert.equal(findTarget(r,[near,far,side]),near);r.hits.add(near.id);assert.equal(findTarget(r,[near]),null);
});
test('world-space projectile hits a firewall on the rising path and scores only once',()=>{
 const r=flight(820),obj=wall('rise',r.d+100,7,20);
 assert.ok(ascentAt(obj.d)-ascentAt(r.d)>50);assert.equal(fire(r,[obj]),true);
 advance(r,.5,[obj]);assert.equal(r.destroyed,1);assert.equal(r.cycles,25);assert.ok(r.hits.has(obj.id));
 advance(r,1,[obj]);assert.equal(r.destroyed,1);assert.equal(r.projectiles.length,0);
 assert.equal(r.effects.filter(e=>e.kind==='destroy').length,1);
});
test('destroyed firewall cannot slow the bug when the bug reaches it',()=>{
 const r=flight();const obj=wall('clear',r.d+40);fire(r,[obj]);advance(r,.2,[obj]);assert.equal(r.destroyed,1);
 r.d=obj.d-1;r.x=obj.x;r.y=obj.y;r.vy=0;r.speed=100;
 stepRun(r,STEP,0,[obj]);assert.ok(r.speed>99);assert.equal(r.hitTime,0);
});
test('a pulse hits the first intersected firewall even if objects arrive in reverse order',()=>{
 const r=flight(),near=wall('first',r.d+18),far=wall('second',r.d+25);
 fire(r,[near]);const shot=r.projectiles[0];shot.vd=1500;shot.vy=0;
 stepRun(r,.04,0,[far,near]);assert.equal(r.destroyed,1);assert.ok(r.hits.has('first'));assert.equal(r.hits.has('second'),false);
});
test('unassisted misses expire, projectiles remain bounded, restart clears combat state',()=>{
 const r=flight();for(let i=0;i<120*5;i++){fire(r);stepRun(r,STEP);assert.ok(r.projectiles.length<=6);}
 advance(r,1.2);assert.equal(r.projectiles.length,0);assert.equal(r.cycles,0);
 const clean=createRun();assert.equal(clean.shotsFired,0);assert.equal(clean.destroyed,0);assert.equal(clean.shotCooldown,0);assert.deepEqual(clean.projectiles,[]);
});
test('holding fire across the daily world remains finite and never awards a wall twice',()=>{
 const r=flight(1350),cache=new Map();
 for(let i=0;i<120*35&&r.phase==='flying';i++){
  const k=Math.floor(r.d/200);for(const n of [k-1,k,k+1])if(!cache.has(n))cache.set(n,makeObjects(r.day,n));
  const objects=[...cache.get(k-1),...cache.get(k),...cache.get(k+1)];fire(r,objects);stepRun(r,STEP,Math.sin(i*STEP*.3),objects);
  assert.ok(r.projectiles.length<=6);assert.ok(r.projectiles.every(p=>Number.isFinite(p.x+p.y+p.d)));
 }
 const hits=r.effects.filter(e=>e.kind==='destroy');assert.equal(new Set(hits.map(h=>h.id)).size,hits.length);assert.equal(hits.length,r.destroyed);
});
test('sustained fire overheats, blocked pulses do not fire, and cooling restores the weapon',()=>{
 const r=flight();let count=0;
 while(!r.overheated&&count++<300){fire(r);stepRun(r,STEP);}
 assert.equal(r.overheated,true);assert.ok(r.weaponHeat>.9);const shots=r.shotsFired;
 for(let i=0;i<100;i++){assert.equal(fire(r),false);stepRun(r,STEP);}
 assert.equal(r.shotsFired,shots);advance(r,3);assert.equal(r.overheated,false);assert.equal(fire(r),true);
});
test('armored firewalls take two real impacts and award cycles only after destruction',()=>{
 const r=flight(),obj={...wall('armored',r.d+65),hp:2};
 fire(r,[obj]);advance(r,.19,[obj]);assert.equal(r.destroyed,0);assert.equal(r.wallDamage.get(obj.id),1);assert.equal(r.cycles,0);
 advance(r,.06,[obj]);fire(r,[obj]);advance(r,.25,[obj]);assert.equal(r.destroyed,1);assert.equal(r.cycles,25);
});
test('the same blaster can track and defeat the moving Motoko companion',async()=>{
 const {stepGhost}=await import('../src/ghost.js');const r=flight(580);r.speed=35;
 for(let i=0;i<170;i++)stepGhost(r,.01);
 for(let i=0;i<360&&r.ghost.kills===0;i++){if(findTarget(r,[]))fire(r,[]);stepRun(r,STEP);}
 assert.equal(r.ghost.kills,1);assert.equal(r.cycles,75);assert.equal(r.destroyed,0);
 assert.ok(r.effects.some(e=>e.kind==='ghost-destroy'));assert.equal(findTarget(r,[]),null);
});
