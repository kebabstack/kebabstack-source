import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { LaunchGuide } from '../src/launch-guide.js';
import { createRun, makeObjects } from '../src/physics.js';
import { FlightFX } from '../src/flight-fx.js';

test('launch ribbon adapts to portrait and angle without reallocating its buffers; hidden in flight',()=>{
 const guide=new LaunchGuide(new T.Scene()),run=createRun();
 guide.update(run,1,false,393,740);const attr=guide.mesh.geometry.attributes.position,initial=Array.from(attr.array);
 assert.ok(guide.mesh.visible);assert.deepEqual(guide.material.uniforms.resolution.value.toArray(),[393,740]);
 run.angle=60;run.phase='charging';run.charge=1;guide.update(run,2,false,844,390);
 assert.equal(guide.mesh.geometry.attributes.position,attr);assert.ok(attr.array.every(Number.isFinite));assert.notDeepEqual(Array.from(attr.array),initial);
 guide.update(run,3,true,393,740);assert.equal(guide.material.uniforms.motion.value,0);
 run.phase='flying';guide.update(run,4,false,393,740);assert.equal(guide.mesh.visible,false);
});
test('balanced routes keep reward opportunities and bounded hazards without changing coin reach IDs',()=>{
 let coffee=0,pads=0;
 for(let seed=1;seed<=200;seed++){
  const objects=makeObjects(seed,3),mines=objects.filter(o=>o.kind==='mine');
  assert.equal(mines.length,5);assert.equal(mines.filter(m=>m.airborne).length,1);
  coffee+=objects.filter(o=>o.kind==='coffee').length;pads+=objects.filter(o=>o.kind==='pad').length;
  const special=objects.filter(o=>!['cycle','mine','pad','hazard'].includes(o.kind));
  assert.ok(special.length>=1);assert.ok(special.every(o=>o.y<=28));
 }
 assert.ok(coffee>=120&&coffee<=160,`coffee frequency ${coffee}/200`);
 assert.ok(pads>=145&&pads<=185,`pad frequency ${pads}/200`);
});
test('enemy pulse meshes follow shot positions, remain visible with reduced motion, and reset cleanly',()=>{
 const view=new FlightFX(new T.Scene()),run=createRun();run.phase='flying';
 run.ghost.shots.push({x:3,y:7,d:80,vx:0,vy:0,vd:-20,life:1});
 view.update(run,.016,true,null);assert.equal(view.enemyBolts[0].visible,true);
 assert.deepEqual(view.enemyBolts[0].position.toArray(),[3,7,-80]);assert.equal(view.enemyBolts[1].visible,false);
 view.reset();assert.ok(view.enemyBolts.every(b=>!b.visible));
 run.ghost.shots.length=0;view.update(run,.016,false,null);assert.ok(view.enemyBolts.every(b=>!b.visible));
});
