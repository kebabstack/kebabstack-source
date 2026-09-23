import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GhostView } from '../src/ghost-view.js';
import { createRun } from '../src/physics.js';
function setup() {
 const scene=new T.Scene(),view=new GhostView(scene),camera=new T.PerspectiveCamera(),run=createRun();run.phase='flying';run.d=650;
 Object.assign(run.ghost,{active:true,phase:'orbit',fade:1,x:0,y:30,d:675,offsetY:4,offsetD:25,encounter:1});
 return {scene,view,camera,run};
}
test('armour retains its rigid compact shape while a bounded energy wake animates',()=>{
 const {view,camera,run}=setup();view.update(run,camera,1,false);
 const body=Array.from(view.body.geometry.attributes.position.array),buffer=view.exhaust.geometry.attributes.position.array,first=Array.from(buffer);
 for(let i=0;i<120;i++){run.ghost.x=Math.sin(i/30)*8;run.ghost.vx=Math.cos(i/30)*16;run.ghost.vd=45;view.update(run,camera,1+i/60,false);}
 assert.deepEqual(Array.from(view.body.geometry.attributes.position.array),body);
 assert.equal(view.exhaust.geometry.attributes.position.array,buffer);assert.ok(buffer.every(Number.isFinite));assert.notDeepEqual(Array.from(buffer),first);
 const bounds=view.body.geometry.boundingBox.getSize(new T.Vector3());assert.ok(bounds.z<5 && bounds.x<5 && bounds.y<5);
 assert.ok(Math.abs(view.craft.rotation.y)>.01);
});
test('changing camera cannot billboard the spacecraft, while health indicators follow it',()=>{
 const {view,camera,run}=setup();view.update(run,camera,1,false);const q=view.craft.quaternion.clone();
 camera.rotation.set(.4,1.8,.2);view.update(run,camera,1,false);
 assert.ok(view.craft.quaternion.equals(q));assert.ok(view.root.quaternion.equals(new T.Quaternion()));assert.ok(view.healthRoot.quaternion.equals(camera.quaternion));
});
test('pause freezes the wake and reduced motion removes it; lifecycle hides the whole craft',()=>{
 const {view,camera,run}=setup();view.update(run,camera,1,false);const p=Array.from(view.exhaust.geometry.attributes.position.array);
 view.update(run,camera,1,false);assert.deepEqual(Array.from(view.exhaust.geometry.attributes.position.array),p);
 view.update(run,camera,2,true);assert.equal(view.exhaust.visible,false);
 run.ghost.hp=1;view.update(run,camera,4,true);assert.equal(view.health[1].visible,false);
 run.ghost.fade=0;view.update(run,camera,5,true);assert.equal(view.root.visible,false);
 run.phase='done';run.ghost.fade=1;view.update(run,camera,6,true);assert.equal(view.root.visible,false);
});
test('attack ignition ramps continuously instead of snapping the plume or rigid body',()=>{
 const {view,camera,run}=setup();view.update(run,camera,20,false);view.update(run,camera,20.1,false);
 const before=Array.from(view.exhaust.geometry.attributes.position.array);
 run.ghost.phase='warning';view.update(run,camera,20.1001,false);const after=view.exhaust.geometry.attributes.position.array;
 assert.ok(before.every((n,i)=>Math.abs(n-after[i])<.003));
});

test('turning leaves a curved world-space wake attached to the engine, without growing buffers',()=>{
 const {view,camera,run}=setup(),g=run.ghost;
 for(let i=0;i<=120;i++) {
   const angle=i/120*Math.PI*.8;
   Object.assign(g,{x:22*Math.sin(angle),d:675+22*(1-Math.cos(angle)),vx:22*Math.cos(angle),vd:22*Math.sin(angle)});
   view.update(run,camera,1+i/60,false);
 }
 assert.equal(view.exhaust.parent,view.root,'old exhaust does not rotate with the armour');
 const centres=view.wakeCenters,first=centres[0].clone().multiplyScalar(view.root.scale.x).add(view.root.position);
 assert.ok(first.distanceTo(view.engine)<1e-8,'wake originates at the engine nozzle');
 const chord=centres.at(-1).clone().sub(centres[0]).normalize();
 const middle=centres[24].clone().sub(centres[0]);
 assert.ok(middle.clone().cross(chord).length()>1,'the wake follows the curved flown path');
 assert.ok(view.wake.count<=128);assert.equal(view.wake.points.length,128*3);
 g.active=false;view.update(run,camera,5,false);g.active=true;g.encounter++;g.x=-50;
 view.update(run,camera,6,false);assert.equal(view.wake.count,1,'a new encounter cannot inherit the previous trail');
});
