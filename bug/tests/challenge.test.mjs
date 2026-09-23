import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,collect,makeObjects,beginCharge,launch,stepRun,STEP} from '../src/physics.js';
import {weatherAt,pickupPower,pressureOf} from '../src/challenge.js';
test('coins are score incentives, not an unlimited source of flight energy',()=>{
 const r=createRun();r.phase='flying';r.speed=8;
 for(let i=0;i<100;i++)collect(r,{id:'coin'+i,kind:'cycle'});
 assert.equal(r.speed,8);assert.equal(r.coins,100);
});
test('late floor rescues cannot reset a stalled bug to cruising speed',()=>{
 const r=createRun();r.phase='flying';r.speed=.1;r.elapsed=160;
 collect(r,{id:'late',kind:'pad'});assert.ok(r.speed<10);assert.ok(r.vy<15);
 assert.ok(pickupPower(r)<pickupPower({...r,elapsed:0}));assert.ok(pressureOf(r)>pressureOf({...r,elapsed:0}));
});
test('weather has an early calm period and announces gusts before applying force',()=>{
 for(let seed=1;seed<=30;seed++){
  assert.equal(weatherAt(seed,5).kind,'calm');
  const warning=weatherAt(seed,13);assert.equal(warning.warning,true);assert.equal(warning.x+warning.forward+warning.lift,0);
  const gust=weatherAt(seed,17);assert.equal(gust.warning,false);assert.ok(Math.abs(gust.x)+Math.abs(gust.forward)+Math.abs(gust.lift)>0);
  assert.deepEqual(gust,weatherAt(seed,17));
 }
});
test('new route seeds vary positions while preserving coin numbering and backend reach checks',()=>{
 assert.notDeepEqual(makeObjects(33,4),makeObjects(34,4));
 for(let seed=0;seed<50;seed++)for(let chunk=0;chunk<25;chunk++){
  const objects=makeObjects(seed,chunk),coins=objects.filter(o=>o.kind==='cycle');assert.equal(coins.length,21);
  coins.forEach((o,i)=>{assert.equal(o.id,`${seed}:${chunk}:${i}`);assert.equal(o.d,chunk*200+50+(i%7)*8);});
  const walls=objects.filter(o=>o.kind==='hazard');assert.ok(walls.length<=3);assert.ok(walls.every(o=>Math.abs(o.x)<24),'route leaves an escape lane');
 }
});
test('even lucky, unmanned seeded flights end rather than farming a floor pad chain',()=>{
 for(let seed=20000;seed<20020;seed++){
  const r=createRun(seed);beginCharge(r);r.charge=1;launch(r);const objects=Array.from({length:20},(_,i)=>makeObjects(seed,i)).flat();
  for(let i=0;i<120*180&&r.phase==='flying';i++){stepRun(r,STEP,0,objects);r.effects.length=0;}
  assert.equal(r.phase,'done');assert.ok(r.elapsed<90,`seed ${seed} sustained an idle run`);
 }
});
