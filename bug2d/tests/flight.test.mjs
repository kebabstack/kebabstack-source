import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,beginCharge,launch,boost,stepRun,makeObjects,STEP,fire,VERSION,findTarget} from '../src/physics.js';
import {GameView,buildingLayout} from '../src/scene.js';
import {stepGhost} from '../src/ghost.js';
import {context} from './canvas-context.mjs';
const launched=()=>{const r=createRun(20704,38);beginCharge(r);r.charge=1;launch(r);return r;};
test('one visible collision plane and unchanged coin identifiers',()=>{
 for(let seed=0;seed<40;seed++)for(let chunk=0;chunk<35;chunk++){
  const objects=makeObjects(seed,chunk);assert.ok(objects.every(o=>o.x===0));
  const coins=objects.filter(o=>o.kind==='cycle');assert.equal(coins.length,21);
  coins.forEach(o=>{const id=Number(o.id.split(':')[2]);assert.equal(o.d,chunk*200+50+(id%7)*8);});
  const floor=objects.filter(o=>o.kind==='mine'&&!o.airborne);assert.equal(new Set(floor.map(o=>o.d)).size,floor.length);
 }
});
test('automatic flight ignores old steering inputs and reaches 100m in one second',()=>{
 const up=launched(),down=launched();assert.ok(up.speed>100);
 for(let i=0;i<120;i++){stepRun(up,STEP,1,[]);stepRun(down,STEP,-1,[]);}
 assert.equal(up.y,down.y);assert.equal(up.d,down.d);assert.ok(up.d>100);assert.equal(up.x,0);
 const speed=up.speed;boost(up);assert.ok(up.speed>=Math.min(150,speed+39));
});
test('Motoko keeps a wide aerial orbit and remains reachable with automatic aim',()=>{
 const r=launched();r.d=600;r.y=45;r.vy=0;
 for(let i=0;i<1200;i++){stepGhost(r,STEP);assert.ok(r.ghost.y-r.y>=19);assert.ok(r.ghost.d-r.d>=41);}
 assert.equal(findTarget(r,[])?.kind,'ghost');
 let shots=0;
 for(let i=0;i<800&&r.ghost.kills===0;i++){if(i%35===0){fire(r,[]);shots++;}stepRun(r,STEP,0,[]);}
 assert.equal(r.ghost.kills,1);assert.ok(shots<=8,'larger orbit must not make Motoko unshootable');
});
test('every DFINITY window stays inside the façade above its street foundation',()=>{
 for(const scale of [2.2,2.5,3.4]){
  const b=buildingLayout(190,660,scale);assert.equal(b.roof+b.height,b.ground);
  for(const w of b.windows){assert.ok(w.y>b.roof);assert.ok(w.y+w.h<b.ground-5);assert.ok(w.x>=b.left&&w.x+w.w<b.left+b.width);}
 }
});
test('five boosts, mine defusal, ghost alignment and settling',()=>{
 const r=launched();for(let i=0;i<5;i++)assert.equal(boost(r),true);assert.equal(boost(r),false);
 const mine={id:'m',kind:'mine',x:0,y:r.y,d:40,radius:3.3,hp:1};fire(r,[mine]);for(let i=0;i<40;i++)stepRun(r,STEP,0,[mine]);assert.equal(r.minesCleared,1);
 r.d=650;for(let i=0;i<1000;i++){stepRun(r,STEP,0,[]);assert.equal(r.ghost.x,0);}
 const end=launched();end.y=1.15;end.vy=0;end.speed=1;end.prompts=0;for(let i=0;i<45;i++)stepRun(end,STEP,1,[]);assert.equal(end.phase,'done');
});
test('twenty seeded flights terminate with finite positions and bounded speeds',()=>{
 for(let seed=0;seed<20;seed++){
  const r=createRun(20704,seed);beginCharge(r);r.charge=.97;launch(r);let objects=[],chunk=-1;
  for(let i=0;i<72000&&r.phase==='flying';i++){
   if(Math.floor(r.d/200)!==chunk){chunk=Math.floor(r.d/200);objects=[...makeObjects(seed,Math.max(0,chunk-1)),...makeObjects(seed,chunk),...makeObjects(seed,chunk+1)];}
   if(r.y<12&&r.vy<0&&r.prompts)boost(r);if(i%60===0)fire(r,objects);stepRun(r,STEP,Math.sin(i/300),objects);
   assert.ok(Number.isFinite(r.y+r.d+r.speed));assert.equal(r.x,0);assert.ok(r.speed<=150);
  }
  assert.equal(r.phase,'done',`seed ${seed}`);
 }
});
test('Canvas2D renders every chapter with bounded resources across viewport sizes',()=>{
 let calls=0;const ctx=context(()=>calls++);
 const canvas={getContext:()=>ctx,setAttribute(){}};globalThis.document={createElement:()=>canvas};globalThis.matchMedia=()=>({matches:false});globalThis.window={addEventListener(){}};
 for(const [width,height]of[[1440,900],[390,844],[844,390]]){
  globalThis.innerWidth=width;globalThis.innerHeight=height;const v=new GameView({append(){}},20704,38);const r=launched();
  for(const d of [0,200,650,1500,2450,4500,50000]){r.d=d;r.y=d>1000?85:21;r.zone=Math.min(9,Math.floor(d/500));v.update(r,STEP);const objects=v.objects;v.update(r,0);assert.equal(v.objects,objects);assert.ok(v.objects.length<250);assert.ok(v.chunks.size<=6);}
  v.reset(1,2);v.update(createRun(),0);assert.equal(v.particles.length,0);
 }
 assert.ok(calls>1000);assert.equal(VERSION,'0.2.0');
});
