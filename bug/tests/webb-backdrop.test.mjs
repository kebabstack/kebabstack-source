import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {WebbBackdrop} from '../src/webb-backdrop.js';
function setup(){const jobs=[],scene=new T.Scene(),camera=new T.PerspectiveCamera(48,1.6,.15,1400);const loader={load(url,done,_progress,error){const texture=new T.Texture();jobs.push({url,done,error,texture});return texture;}};return{sky:new WebbBackdrop(scene,loader),jobs,scene,camera};}
test('Webb imagery loads progressively without blocking, crossfades late loads and remains bounded across resets',()=>{
 const {sky,jobs,camera}=setup();sky.update(camera,0,0);assert.equal(jobs.length,0);assert.equal(sky.mesh.visible,false);
 sky.update(camera,120,1);assert.equal(jobs.length,1);assert.ok(jobs[0].url.startsWith('./assets/webb/'));assert.equal(sky.mesh.visible,false);
 jobs[0].done(jobs[0].texture);sky.update(camera,950,8);assert.equal(sky.uniforms.opacity.value,0);sky.update(camera,950,10);assert.equal(sky.uniforms.opacity.value,.92);assert.equal(jobs[0].texture.colorSpace,T.SRGBColorSpace);
 sky.update(camera,1700,11);assert.equal(jobs.length,2);assert.equal(sky.uniforms.imageB.value,jobs[0].texture);
 jobs[1].done(jobs[1].texture);sky.update(camera,2000,12);assert.equal(sky.uniforms.blend.value,0);sky.update(camera,2000,12.6);assert.ok(sky.uniforms.blend.value>.45&&sky.uniforms.blend.value<.55);sky.update(camera,2000,14);assert.equal(sky.uniforms.blend.value,1);
 sky.update(camera,3000,20);assert.equal(jobs.length,3);jobs[2].error();sky.update(camera,5000,30);assert.equal(sky.uniforms.imageB.value,jobs[1].texture);
 const offset=sky.uniforms.offset.value.clone();sky.update(camera,5000,30);assert.ok(sky.uniforms.offset.value.equals(offset));
 sky.update(camera,5000,40,true);assert.deepEqual(sky.uniforms.offset.value.toArray(),[0,0]);
 for(let i=0;i<10;i++){sky.update(camera,0,0);assert.equal(sky.mesh.visible,false);sky.update(camera,6000,45);}
 assert.equal(jobs.length,3);assert.equal(sky.images.size,3);assert.equal(sceneCount(sky),1);sky.dispose();assert.equal(sky.images.size,0);
});
function sceneCount(sky){return sky.scene.children.filter(o=>o===sky.mesh).length;}
test('photographic layer covers all camera aspects inside the far plane and cannot paint over foreground geometry',()=>{
 const {sky,jobs,camera}=setup();sky.update(camera,120,1);jobs[0].done(jobs[0].texture);
 assert.equal(sky.mesh.material.depthTest,true);assert.equal(sky.mesh.material.depthWrite,false);assert.equal(sky.mesh.material.fog,false);assert.equal(sky.mesh.renderOrder,-19);
 for(const aspect of [390/844,844/390,1440/900])for(const fov of [48,65])for(const x of [-90,0,80]) {
  camera.aspect=aspect;camera.fov=fov;camera.updateProjectionMatrix();camera.position.set(x,740,900);camera.lookAt(0,765,700);camera.updateMatrixWorld();
  sky.update(camera,1200,10,true);sky.mesh.updateMatrixWorld(true);
  for(const sx of [-1,1])for(const sy of [-1,1]){const p=new T.Vector3(sx,sy,0).applyMatrix4(sky.mesh.matrixWorld).project(camera);assert.ok(Math.abs(Math.abs(p.x)-1.01)<1e-6);assert.ok(Math.abs(Math.abs(p.y)-1.01)<1e-6);assert.ok(p.z<1&&p.z>0);}
 }
});
