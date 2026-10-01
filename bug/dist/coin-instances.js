import * as T from 'three';

// Coins share geometry/materials. Draw each part once for the whole visible
// course instead of issuing hundreds of otherwise identical draw calls.
export class CoinInstances {
  constructor(scene, template, capacity = 256) {
    this.scene = scene; this.template = template; this.capacity = capacity;
    this.matrix = new T.Matrix4(); this.create();
  }
  create() {
    this.parts = this.template.children.map(part => {
      part.updateMatrix();
      const mesh = new T.InstancedMesh(part.geometry, part.material, this.capacity);
      mesh.castShadow = part.castShadow; mesh.receiveShadow = part.receiveShadow;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.count = 0;
      this.scene.add(mesh);
      return { mesh, local: part.matrix.clone() };
    });
  }
  update(pickups) {
    const coins = [];
    for (const item of pickups) if (item.obj.kind === 'cycle' && item.mesh.visible) coins.push(item.mesh);
    if (coins.length > this.capacity) {
      for (const { mesh } of this.parts) { this.scene.remove(mesh); mesh.dispose(); }
      this.capacity = 2 ** Math.ceil(Math.log2(coins.length)); this.create();
    }
    for (const coin of coins) coin.updateMatrix();
    for (const { mesh, local } of this.parts) {
      mesh.count = coins.length;
      coins.forEach((coin, i) => mesh.setMatrixAt(i, this.matrix.multiplyMatrices(coin.matrix, local)));
      mesh.instanceMatrix.needsUpdate = true;
      // Recompute after movement, collection or restart: stale bounds can hide
      // valid coins when the camera moves into the next section.
      mesh.computeBoundingSphere();
    }
  }
}
