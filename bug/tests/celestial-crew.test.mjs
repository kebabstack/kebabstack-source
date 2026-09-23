import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {CelestialCrew} from '../src/celestial-crew.js';

test('the horizon astronaut is articulated, waves gently, freezes on pause and rests with reduced motion',()=>{
 const scene=new T.Scene(),crew=new CelestialCrew(scene),camera=new T.PerspectiveCamera(65,1.6,.1,1400);
 crew.update(camera,0,0,false);assert.equal(crew.astronaut.root.visible,false);
 crew.update(camera,1600,0,false);const first=crew.astronaut.waveElbow.rotation.z;
 crew.update(camera,1600,1,false);assert.notEqual(crew.astronaut.waveElbow.rotation.z,first);
 const paused=crew.astronaut.waveElbow.rotation.z;crew.update(camera,1600,1,false);assert.equal(crew.astronaut.waveElbow.rotation.z,paused);
 crew.update(camera,1600,2,true);const reduced=crew.astronaut.waveElbow.rotation.z;
 crew.update(camera,1600,19,true);assert.equal(crew.astronaut.waveElbow.rotation.z,reduced);
 let instances=0,meshes=0;crew.astronaut.root.traverse(m=>{if(m.isMesh)meshes++;if(m.isInstancedMesh)instances++;});
 assert.ok(instances>=5);assert.ok(meshes<45,`astronaut draws ${meshes} meshes`);
});
test('the distant companion stays to the side of the flight corridor at phone and desktop aspects',()=>{
 const scene=new T.Scene(),crew=new CelestialCrew(scene);
 for(const aspect of [393/740,844/390,1280/800]) for(const clock of [0,1,2.5,4.5,8]) {
  const camera=new T.PerspectiveCamera(65,aspect,.1,1400);camera.position.set(7,700,70);camera.lookAt(0,720,0);camera.updateMatrixWorld();
  crew.update(camera,2000,clock,false);const root=crew.astronaut.root;root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(root),xs=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
    xs.push(new T.Vector3(x,y,z).project(camera).x);
  assert.ok(Math.min(...xs)>.17,`astronaut encroaches on centre at ${aspect}: ${xs}`);
  assert.ok(Math.max(...xs)<1.13,`astronaut clipped at ${aspect}: ${xs}`);
  assert.ok(root.position.distanceTo(camera.position)>800);
 }
});

test('the event horizon stays outside the flight centre, fades in late and freezes with reduced motion',async()=>{
 const {EventHorizon}=await import('../src/event-horizon.js');const h=new EventHorizon(new T.Scene());
 for(const aspect of [393/740,844/390,1280/800]){
  const c=new T.PerspectiveCamera(65,aspect,.1,1400);c.position.set(8,600,15);c.lookAt(0,600,-80);c.updateMatrixWorld();
  h.update(c,1500,10);assert.equal(h.mesh.visible,false);
  h.update(c,2250,12);assert.equal(h.uniforms.fade.value,1);h.mesh.updateMatrixWorld(true);
  for(const x of [-1,1])for(const y of [-1,1]){const p=new T.Vector3(x,y,0).applyMatrix4(h.mesh.matrixWorld).project(c);assert.ok(p.x<-.25&&p.x>-.97);assert.ok(Math.abs(p.y)<.55);}
  h.update(c,3000,22,true);assert.equal(h.uniforms.clock.value,0);
  h.update(c,3000,28,true);assert.equal(h.uniforms.clock.value,0);
 }
});

test('both gloves are handed, and a complete wave returns smoothly every ten seconds',async()=>{
 const {createAstronaut,poseAstronaut}=await import('../src/celestial-crew.js');const a=createAstronaut();
 const [right,left]=a.hands.map(h=>h.userData.anatomy);
 assert.equal(right.fingers.length,4);assert.equal(left.fingers.length,4);
 assert.ok(right.thumb[0]<Math.min(...right.fingers.map(f=>f[0])));
 assert.ok(left.thumb[0]>Math.max(...left.fingers.map(f=>f[0])));
 const pose=t=>{poseAstronaut(a,t);return [a.waveArm,a.waveElbow,a.waveWrist].flatMap(j=>j.rotation.toArray().slice(0,3));};
 for(const t of [0,.9,1.5,2.8,4.4,7]) {const p=pose(t),next=pose(t+10);p.forEach((v,i)=>assert.ok(Math.abs(v-next[i])<1e-10));}
 assert.notDeepEqual(pose(1.5),pose(7));
 const before=pose(9.9999),after=pose(10.0001);before.forEach((v,i)=>assert.ok(Math.abs(v-after[i])<.0001,'no snap across the loop'));
});
