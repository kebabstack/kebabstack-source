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

test('chapter stamps differ and batch counts follow collection, chapter changes and restart', async t => {
  const { context } = await import('./canvas-context.mjs');
  const { CourseTokens } = await import('../src/cycle-token.js');
  const { ZONES } = await import('../src/ecosystem.js');
  const traces = [];
  const previous = [globalThis.document, globalThis.Path2D];
  t.after(() => {
    if (previous[0] === undefined) delete globalThis.document; else globalThis.document = previous[0];
    if (previous[1] === undefined) delete globalThis.Path2D; else globalThis.Path2D = previous[1];
  });
  globalThis.Path2D = class { constructor(data) { this.data = data; } };
  globalThis.document = {createElement() {
    const commands = [];
    traces.push(commands);
    return {getContext: () => context((name,args) => commands.push([name,args]))};
  }};
  const scene = new T.Scene(), course = new CourseTokens(scene);
  const items = ZONES.map((zone,i) => ({...coin(i*8),zone}));
  course.update(items);
  assert.equal(new Set(traces.map(commands => JSON.stringify(commands))).size, ZONES.length);
  assert.equal(scene.children.length, ZONES.length * 2);
  items[0].mesh.visible = false;
  course.update(items.slice(0,2));
  for (const [i,zone] of ZONES.entries()) {
    const { batch } = course.batches.get(zone.key);
    assert.equal(batch.template.name, zone.token);
    assert.ok(batch.parts.every(({mesh}) => mesh.count === (i === 1 ? 1 : 0)));
  }
  items[0].mesh.visible = true; course.update([items[0]]);
  assert.equal(course.batches.get(ZONES[0].key).batch.parts[0].mesh.count, 1);
  assert.equal(traces.length, ZONES.length, 'no repeated texture generation');
});
