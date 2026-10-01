import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CoinInstances } from '../src/coin-instances.js';
function rig(capacity) {
  const scene=new T.Scene(),template=new T.Group();
  for(const scale of [1.65,.24]) { const mesh=new T.Mesh(new T.SphereGeometry(),new T.MeshStandardMaterial());mesh.scale.setScalar(scale);mesh.castShadow=true;template.add(mesh); }
  return {scene,template,batch:new CoinInstances(scene,template,capacity)};
}
const coin=x=>{const mesh=new T.Group();mesh.position.set(x,12,-400);mesh.rotation.y=.4;return {obj:{kind:'cycle'},mesh}};
test('batched coins preserve their position, rotation and original component sizes',()=>{
  const {batch,template}=rig(),items=[coin(-8),coin(6)];batch.update(items);
  const actual=new T.Matrix4(),expected=new T.Matrix4();
  for(let part=0;part<2;part++)for(let i=0;i<items.length;i++){
    batch.parts[part].mesh.getMatrixAt(i,actual);
    expected.multiplyMatrices(items[i].mesh.matrix,template.children[part].matrix);
    actual.elements.forEach((n,j)=>assert.ok(Math.abs(n-expected.elements[j])<1e-5));
  }
});
test('collected coins disappear, hazards stay separate and new flights restore visible coins',()=>{
  const {batch}=rig(),first=coin(0),second=coin(10);first.mesh.visible=false;
  batch.update([first,second,{obj:{kind:'mine'},mesh:new T.Group()}]);
  assert.equal(batch.parts[0].mesh.count,1);
  batch.update([]);assert.equal(batch.parts[0].mesh.count,0);
  const fresh=coin(-40);batch.update([fresh]);assert.equal(batch.parts[0].mesh.count,1);
  assert.ok(batch.parts[0].mesh.boundingSphere.containsPoint(fresh.mesh.position));
});
test('capacity growth replaces only instance buffers and keeps scene resource count bounded',()=>{
  const {batch,scene,template}=rig(1);let disposed=0;batch.parts[0].mesh.addEventListener('dispose',()=>disposed++);
  batch.update([coin(0),coin(1),coin(2)]);assert.equal(disposed,1);assert.equal(scene.children.length,2);
  assert.equal(batch.parts[0].mesh.geometry,template.children[0].geometry);
  assert.equal(batch.parts[0].mesh.count,3);
});
