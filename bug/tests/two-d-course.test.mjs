import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { makeObjects, createRun, beginCharge, launch, stepRun, STEP } from '../src/two-d/physics.js';
import { ghostPatrolAt, crossesCurrent } from '../src/two-d/course.js';
import { bindLaunchAim, pointerAngle } from '../src/two-d/launch-aim.js';

test('2D course has separate encounters, recovery pickups and no stacked hazards across chunk boundaries', () => {
 for(let seed=0;seed<80;seed++) {
  const objects=Array.from({length:120},(_,chunk)=>makeObjects(seed,chunk)).flat();
  const hazards=objects.filter(o=>['mine','hazard'].includes(o.kind)).sort((a,b)=>a.d-b.d);
  assert.equal(hazards[0].d,316);
  for(let i=0;i<hazards.length;i++) {
   const o=hazards[i];if(i)assert.ok(o.d-hazards[i-1].d>=600);
   for(let d=o.d-180;d<=o.d+180;d+=10)assert.equal(ghostPatrolAt(d),false);
   assert.ok(objects.some(p=>!['cycle','hazard','mine'].includes(p.kind)&&p.d-o.d>=50&&p.d-o.d<=90),'a readable recovery follows each obstacle');
   assert.ok(objects.every(p=>p===o||Math.abs(p.d-o.d)>=18),'no coin or pickup conceals a hazard');
  }
  assert.ok(objects.filter(o=>!['cycle','mine','hazard'].includes(o.kind)).length>hazards.length*4);
 }
});

test('solar current gives one swept, visible lift and does not catch a flight outside its ribbon',()=>{
 const o=makeObjects(3,0).find(o=>o.kind==='updraft');
 assert.equal(crossesCurrent({d:140,y:60},{d:180,y:60},o),true);
 assert.equal(crossesCurrent({d:140,y:o.top+8},{d:180,y:o.top+8},o),false);
 assert.equal(crossesCurrent({d:159,y:1},{d:159,y:9},o),false);
 const r=createRun(1,3);beginCharge(r);r.charge=1;launch(r);r.d=155;r.y=65;r.vy=-18;r.speed=120;
 for(let i=0;i<20;i++)stepRun(r,STEP,0,[o]);
 assert.ok(r.hits.has(o.id));assert.equal(r.effects.filter(e=>e.kind==='updraft').length,1);assert.ok(r.vy>22);assert.equal(r.prompts,5);
});

test('all launch angles and charge strengths can reach the first free current',()=>{
 for(const angle of [25,38,50,60])for(const charge of [.25,.65,1]) {
  const r=createRun(1,3);r.angle=angle;beginCharge(r);r.charge=charge;launch(r);
  const objects=makeObjects(3,0),current=objects.find(o=>o.kind==='updraft');
  while(r.d<180&&r.phase==='flying')stepRun(r,STEP,0,objects);
  assert.ok(r.hits.has(current.id),`angle ${angle}, charge ${charge}`);
 }
});

test('mouse aim, touch drag, cancellation and flight click work without accidental relaunch',()=>{
 const dom=new JSDOM('<canvas></canvas>',{pretendToBeVisual:true}),w=dom.window,canvas=w.document.querySelector('canvas');
 let run=createRun(), launches=0, shots=0;
 const origin=[200,300];
 const clean=bindLaunchAim(canvas,{getRun:()=>run,origin:()=>origin,allowed:()=>true,setAngle:a=>run.angle=a,start:()=>beginCharge(run),end:()=>{if(launch(run))launches++;},cancel:()=>{run.phase='ready';},shoot:()=>shots++},w);
 const send=(type,x,y,id=1,pointerType='mouse')=>{const e=new w.Event(type);Object.assign(e,{clientX:x,clientY:y,button:0,pointerId:id,pointerType});canvas.dispatchEvent(e);};
 assert.equal(pointerAngle(400,260,origin),27);
 send('pointermove',400,200);assert.equal(run.angle,51);
 send('pointerdown',400,270);assert.equal(run.phase,'charging');send('pointermove',400,170);assert.equal(run.angle,58);
 send('pointerup',400,170);assert.equal(launches,1);send('pointerdown',400,170);send('pointerup',400,170);assert.equal(shots,1);assert.equal(launches,1);
 run=createRun();send('pointerdown',400,280,2,'touch');send('pointermove',400,150,3,'touch');assert.equal(run.angle,25);
 send('pointermove',400,150,2,'touch');assert.equal(run.angle,60);send('pointercancel',400,150,2,'touch');assert.equal(run.phase,'ready');send('pointerup',400,150,2,'touch');assert.equal(launches,1);
 send('pointerdown',400,200);w.dispatchEvent(new w.Event('blur'));send('pointerup',400,200);assert.equal(run.phase,'ready');assert.equal(launches,1);clean();w.close();
});

test('using the five boosts matters: the currents cannot carry an idle pilot through a long flight', async()=>{
 const {boost,fire}=await import('../src/two-d/physics.js');
 let coast=0,active=0;
 for(let seed=0;seed<12;seed++)for(const pilot of ['coast','active']) {
  const r=createRun(1,seed);beginCharge(r);r.charge=.97;launch(r);let chunk=-1,objects=[];
  for(let i=0;i<36000&&r.phase==='flying';i++){
   const next=Math.floor(r.d/200);if(next!==chunk){chunk=next;objects=[...makeObjects(seed,Math.max(0,chunk-1)),...makeObjects(seed,chunk),...makeObjects(seed,chunk+1)];}
   if(pilot==='active'){if(r.y<12&&r.vy<0&&r.prompts)boost(r);if(i%40===0)fire(r,objects);}
   stepRun(r,STEP,0,objects);r.effects.length=0;
  }
  assert.equal(r.phase,'done');if(pilot==='coast'){coast+=r.d;assert.ok(r.elapsed<50);}else active+=r.d;
 }
 assert.ok(active>coast*1.7);
});
