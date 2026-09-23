import { createMine, updateMine } from './mine-view.js';
import { GhostView } from './ghost-view.js';
import { createZurich } from './zurich.js';
import { LaunchGuide } from './launch-guide.js';
import * as T from './vendor/three.module.js';
import { makeObjects, seededRandom, ZONES, clamp, ascentAt, altitudeAt } from './physics.js';

import { FlightFX } from './flight-fx.js';
import { createCosmosKit } from './cosmos.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const geometry = {
  box: new T.BoxGeometry(1, 1, 1), sphere: new T.SphereGeometry(1, 18, 12),
  cone: new T.ConeGeometry(1, 1, 6), cylinder: new T.CylinderGeometry(1, 1, 1, 20),
  ring: new T.TorusGeometry(1, 0.12, 7, 28), coin: new T.TorusGeometry(1, 0.16, 6, 18),
  diamond: new T.OctahedronGeometry(1, 0),
  // Rock ends at the snowline (77% of the peak height). A full rock cone
  // underneath the snow cone has identical faces and flickers from z-fighting.
  mountain: new T.CylinderGeometry(.23, 1, .77, 5, 1, true).translate(0, -.115, 0),
  snowcap: new T.ConeGeometry(1, 1, 5, 1, true), tetra: new T.IcosahedronGeometry(1, 0),
};
const materials = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: .8, ...opts }));
  return materials.get(key);
}
function shape(parent, type, material, x, y, z, sx = 1, sy = sx, sz = sx) {
  const mesh = new T.Mesh(geometry[type], typeof material === 'string' ? mat(material) : material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function bar(parent, from, to, radius, material) {
  const delta = to.clone().sub(from);
  const m = shape(parent, 'cylinder', material, ...from.clone().add(to).multiplyScalar(.5).toArray(), radius, delta.length(), radius);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize()); return m;
}
function label(parent, text, width, x, y, z, { bg = '#172726', fg = '#eff5e4', height = .25, font = 'bold', size = 68 } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 256); }
  ctx.fillStyle = fg; ctx.font = `${font} ${size}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 133, 960);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  const mesh = new T.Mesh(new T.PlaneGeometry(width, width * height), new T.MeshBasicMaterial({ map: texture, transparent: !bg, side: T.DoubleSide }));
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
function infinity(parent, x, y, z, scale = 1, neon = false) {
  const colors = ['#f15a24', '#ed1e79', '#522785', '#29abe2'];
  for (let n = 0; n < 4; n++) {
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const t = (n + i / 24) * Math.PI / 2;
      points.push(V(Math.cos(t) * 1.65, Math.sin(2 * t) * .77, 0));
    }
    const mesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), 24, .13, 6, false), mat(colors[n], { roughness: .5, emissive: colors[n], emissiveIntensity: neon ? 1.1 : .05 }));
    mesh.position.set(x, y, z); mesh.scale.setScalar(scale); parent.add(mesh);
  }
}

const cosmos = createCosmosKit({ V, shape, bar, label, mat, infinity });

function createBug() {
  const root = new T.Group(), animated = new T.Group(); root.add(animated);
  const ink = mat('#162625', { roughness: .36 }), red = mat('#ed6548', { roughness: .3, metalness: .08 });
  shape(animated, 'sphere', ink, 0, 0, .15, 1.05, .63, 1.65);
  const wings = [], shells = [];
  for (const side of [-1, 1]) {
    const shell = new T.Group(); shell.position.set(side * .13, .15, .18); animated.add(shell);
    shape(shell, 'sphere', red, side * .46, .17, 0, .65, .8, 1.46);
    for (const [px, py, pz, r] of [[.48, .88, -.48, .19], [.64, .75, .4, .23], [.32, .86, .83, .15]]) {
      const spot = shape(shell, 'sphere', ink, side * px, py, pz, r, .035, r * 1.2); spot.rotation.z = side * -.2;
    }
    shells.push(shell);
    const wing = new T.Group(); wing.position.set(side * .2, .1, -.1); animated.add(wing);
    shape(wing, 'sphere', mat('#edf9e4', { transparent: true, opacity: .65, roughness: .32, depthWrite: false }), side * 1.1, 0, .2, 1.42, .045, .7);
    wing.visible = false; wings.push(wing);
    for (let i = 0; i < 3; i++) {
      const a = V(side * .6, -.35, -.7 + i * .75), b = V(side * 1.35, -.65, -1 + i * .92), c = V(side * 1.65, -1, -.95 + i * 1.07);
      bar(animated, a, b, .075, ink); bar(animated, b, c, .06, ink);
    }
  }
  shape(animated, 'sphere', ink, 0, -.02, -1.28, .85, .67, .74);
  for (const side of [-1, 1]) {
    shape(animated, 'sphere', '#fffdf0', side * .43, .32, -1.82, .36, .44, .29);
    shape(animated, 'sphere', ink, side * .43 + .04, .33, -2.08, .145, .2, .09);
    shape(animated, 'sphere', '#ffffff', side * .43 + .085, .42, -2.15, .046);
    bar(animated, V(side * .4, .52, -1.25), V(side * .7, 1.12, -1.75), .055, ink);
    shape(animated, 'sphere', ink, side * .7, 1.12, -1.75, .11);
  }
  const engines = new T.Group(); animated.add(engines);
  const flames = [];
  for (const side of [-1, 1]) {
    const rocket = shape(engines, 'cylinder', mat('#8eaab3', { metalness: .7, roughness: .3 }), side * .88, .25, .9, .26, 1.2, .26); rocket.rotation.x = Math.PI / 2;
    const nozzle = shape(engines, 'ring', cosmos.glow('#79f8ff'), side * .88, .25, 1.5, .25);
    const flame = shape(engines, 'cone', mat('#85edff', { emissive: '#46bbff', emissiveIntensity: 1.7, transparent: true, opacity: .65 }), side * .88, .25, 2, .21, 1.3, .21); flame.rotation.x = Math.PI / 2; flames.push(flame);
  }
  return { root, animated, wings, shells, engines, flames };
}


function bake(instances, group) {
  for (const [key, values] of instances) {
    const [type, color] = key.split('|');
    const mesh = new T.InstancedMesh(geometry[type], mat(color), values.length);
    const dummy = new T.Object3D();
    values.forEach((v, i) => {
      dummy.position.set(v.x, v.y, v.z); dummy.scale.set(v.sx, v.sy, v.sz); dummy.rotation.set(0, v.rot || 0, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = type !== 'mountain' && type !== 'snowcap'; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh);
  }
}
function terrain(chunk, day) {
  const g = new T.Group(), batches = new Map(), random = seededRandom((chunk + 55) * 76319 + day);
  const put = (type, color, x, y, z, sx, sy = sx, sz = sx, rot = 0) => {
    const key = type + '|' + color;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push({ x, y, z, sx, sy, sz, rot });
  };
  const start = chunk * 200;
  put('box', '#4b665f', 0, -.7, -start - 100, 760, 1.3, 200.1);
  put('box', '#435366', 0, -.01, -start - 100, 20, .05, 200);
  put('box', '#8f9fa8', -11.7, .08, -start - 100, 3.3, .18, 200);
  put('box', '#8f9fa8', 11.7, .08, -start - 100, 3.3, .18, 200);
  for (let z = 0; z < 200; z += 14) put('box', '#d2d8bf', 0, .06, -start - z, .22, .02, 5);
  // Lake ribbon and bank, below the city skyline.
  put('box', '#568379', -105, -.04, -start - 100, 56, .1, 200);
  put('box', '#377f98', -105, .015, -start - 100, 46, .09, 200);
  for (let i = 0; i < 9; i++) {
    const z = -start - i * 23 - random() * 5;
    for (const side of [-1, 1]) {
      const x = side * (24 + random() * 27), city = start < 750;
      if (city && (chunk > 0 || i > 1) && random() < .78) {
        const height = 6 + random() * 17, width = 8 + random() * 7, depth = 11 + random() * 4;
        const color = ['#b2a4a2', '#bdc8c3', '#b7a399', '#e3d9c5'][Math.floor(random() * 4)];
        put('box', color, x, height / 2, z, width, height, depth);
        put('box', '#637774', x, height + .35, z, width + .5, .7, depth + .5);
        for (let floor = 0; floor < height - 3; floor += 3.6) put('box', '#738f90', x, 2.3 + floor, z + depth / 2 + .06, width - 1.5, 1.5, .1);
        put('box', '#93acac', x - side * (width / 2 + .05), height * .54, z, .12, height - 3, depth - 2);
      }
      const tx = side * (15 + random() * 8), th = 2.2 + random() * 2.2;
      put('cylinder', '#88795d', tx, 1.3, z, .22, 2.6, .22);
      put('sphere', ['#77976c', '#6f956b', '#89a678'][i % 3], tx, 2.8 + th / 2, z, th * .85, th, th * .85);
      if (i % 3 === 0 && start < 600) {
        put('cylinder', '#5d726c', side * 12, 3.1, z, .11, 6.2, .11);
        put('box', '#edf0d9', side * 12, 6.3, z, .9, .3, .9);
      }
      const px = side * (190 + random() * 180), ph = 55 + random() * 85, mountainRotation = random();
      // Mountains belong beyond the valley. Their base must never intrude into the flight corridor.
      if (chunk >= 0 && i % 3 === 0) {
        put('mountain', ['#90aaa3', '#9fb6af', '#829c99'][i % 3], px, ph * .5, z - 110, ph * .7, ph, ph * .7, mountainRotation);
        put('snowcap', '#e5e9dc', px, ph * .885, z - 110, ph * .161, ph * .23, ph * .161, mountainRotation);
      }
      if (start > 450) {
        for (let t = 0; t < 4; t++) {
          const fx = side * (32 + random() * 52), fz = z + random() * 17;
          put('cylinder', '#6d7960', fx, 1.6, fz, .24, 3.2, .24);
          put('cone', '#688c73', fx, 4.7, fz, 2.1, 6.5, 2.1);
          put('cone', '#82a17d', fx, 6.2, fz, 1.5, 4.6, 1.5);
        }
      }
    }
  }
  // Little Swiss chalets in the foothills.
  if (start > 650) for (let i = 0; i < 3; i++) {
    const x = (i % 2 ? -1 : 1) * (45 + random() * 24), z = -start - 30 - i * 61;
    put('box', '#e6dbc4', x, 2.5, z, 9, 5, 7);
    put('cone', '#957866', x, 6.5, z, 7, 4, 5, Math.PI / 4);
    put('box', '#8eaaac', x, 3, z + 3.55, 6, 1.3, .1);
  }
  // Roadside milestone.
  put('cylinder', '#60796a', 17, 2, -start - 12, .12, 4, .12);
  bake(batches, g);
  if (chunk >= 0) label(g, `${start} m`, 5.5, 17, 4.2, -start - 11.8, { bg: '#f0f1de', fg: '#3d5f4c', size: 99, height: .32 });
  return g;
}

function pickup(obj) {
  const g = obj.kind === 'mine' ? createMine() : new T.Group(); g.position.set(obj.x, obj.y + ascentAt(obj.d), -obj.d);
  if (obj.kind === 'mine') {
    if (!obj.airborne) g.rotation.x = Math.atan(ascentAt(obj.d + .5) - ascentAt(obj.d - .5));
    return g;
  }
  if (obj.kind === 'cycle') {
    shape(g, 'coin', mat('#f6c660', { metalness: .42, roughness: .3, emissive: '#b86713', emissiveIntensity: 1.3 }), 0, 0, 0, 1.65);
    shape(g, 'sphere', mat('#ffe8a3', { emissive: '#e3bb4d', emissiveIntensity: 1.2 }), 0, 0, 0, .24);
  } else if (obj.kind === 'coffee') {
    shape(g, 'cylinder', '#f6f0da', 0, 0, 0, 1.1, 1.8, 1.1);
    shape(g, 'cylinder', '#624738', 0, .95, 0, .95, .06, .95);
    const handle = shape(g, 'ring', '#f6f0da', 1.16, .15, 0, .6); handle.rotation.y = Math.PI / 2;
    shape(g, 'box', '#95ad77', 0, 0, 1.06, .8, .7, .1);
    for (let i = 0; i < 2; i++) shape(g, 'sphere', mat('#f5ffed', { transparent: true, opacity: .42 }), -.4 + i * .7, 1.8 + i * .5, 0, .18, .5, .18);
  } else if (obj.kind === 'portal') {
    shape(g, 'ring', mat('#59c7b4', { metalness: .4, roughness: .3, emissive: '#3da98c', emissiveIntensity: 1.4 }), 0, 0, 0, 5.3);
    const ring = shape(g, 'ring', mat('#c9ffe2', { emissive: '#a2f8c9', emissiveIntensity: 2 }), 0, 0, 0, 4.5); ring.scale.z = .4;
    for (let i = 0; i < 4; i++) shape(g, 'box', '#25534e', Math.sin(i * Math.PI / 2) * 5.3, Math.cos(i * Math.PI / 2) * 5.3, 0, 1.3, 1.3, 1.3);
  } else if (['compiler', 'canister', 'identity', 'oisy', 'fusion', 'neuron'].includes(obj.kind)) {
    cosmos.emblem(obj.kind, g);
  } else if (obj.kind === 'pad') {
    shape(g, 'box', '#465f55', 0, -.4, 0, 9, .7, 8);
    shape(g, 'box', mat('#c6fa7c', { emissive: '#a4da50', emissiveIntensity: .15 }), 0, 0, 0, 8, .2, 7);
    for (let i = 0; i < 3; i++) {
      const a = shape(g, 'box', '#3f6844', -.9, .15, -2 + i * 1.5, 2.5, .1, .35); a.rotation.y = -.5;
      const b = shape(g, 'box', '#3f6844', .9, .15, -2 + i * 1.5, 2.5, .1, .35); b.rotation.y = .5;
    }
  } else {
    shape(g, 'box', mat('#561d36', { emissive: '#9e234c', emissiveIntensity: .8 }), 0, 0, 0, 6, 5, 1.1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) shape(g, 'box', i % 2 ? '#e48767' : '#d7765d', -2 + j * 2 + (i % 2) * .25, -1.6 + i * 1.6, .7, 1.8, 1.4, .4);
    if (obj.hp > 1) {
      const armor=shape(g,'ring',mat('#ffba75',{emissive:'#ff753a',emissiveIntensity:1.4}),0,0,.9,4.2);
      armor.userData.armor=true;
    }
    label(g, '403', 3.5, 0, 0, 1, { bg: '#713b35', fg: '#ffe9c5', size: 135, height: .5 });
  }
  return g;
}

export class GameView {
  constructor(container, day, seed = day) {
    this.inspectGhost = false; this.day = day; this.seed = seed; this.container = container;
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.15 : 1.4));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.scene = new T.Scene(); this.scene.background = new T.Color('#273651');
    this.scene.fog = new T.Fog('#273651', 160, 620);
    this.camera = new T.PerspectiveCamera(48, innerWidth / innerHeight, .15, 1400);
    this.camera.position.set(62, 44, 66);
    this.look = V(-22, 12, -8); this.camera.lookAt(this.look);
    this.ambient = new T.HemisphereLight('#f2f3df', '#6a8478', 2); this.scene.add(this.ambient);
    this.sun = new T.DirectionalLight('#fff2d1', 2.4); this.sun.position.set(-35, 90, 40);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1536, 1536);
    Object.assign(this.sun.shadow.camera, { left: -60, right: 60, top: 65, bottom: -60, near: 1, far: 240 });
    this.sun.shadow.normalBias = .12; this.sun.shadow.bias = -.0001;
    this.scene.add(this.sun, this.sun.target);
    this.sky = cosmos.sky(this.scene);
    this.fx = new FlightFX(this.scene);
    this.ghost = new GhostView(this.scene);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), .55, .65, 1.15);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.zurich = createZurich({V,shape,bar,label,mat,infinity,bake});
    this.hq = this.zurich.root; this.scene.add(this.hq);
    this.bug = createBug(); this.scene.add(this.bug.root);
    this.bug.root.position.set(0, 21.2, 0);
    this.shieldMesh = shape(this.scene, 'sphere', mat('#72ffd4', { emissive: '#42d6b2', emissiveIntensity: 1, transparent: true, opacity: .17, wireframe: true }), 0, 0, 0, 3.3);
    this.magnetRing = shape(this.scene, 'ring', cosmos.glow('#b9a0ff'), 0, 0, 0, 4); this.magnetRing.rotation.x = Math.PI / 2;
    this.groundShadow = new T.Mesh(new T.CircleGeometry(2.1, 24), new T.MeshBasicMaterial({ color: '#2c5047', transparent: true, opacity: .2, depthWrite: false }));
    this.groundShadow.rotation.x = -Math.PI / 2; this.scene.add(this.groundShadow);
    this.chunks = new Map(); this.objects = []; this.pickups = new Map(); this.particles = [];
    this.trail = []; this.trailMesh = null;
    this.launchGuide = new LaunchGuide(this.scene);
    const trailGeom = new T.BufferGeometry(); trailGeom.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(75 * 3), 3));
    this.trailMesh = new T.Line(trailGeom, new T.LineBasicMaterial({ color: '#ecb676', transparent: true, opacity: .55 })); this.trailMesh.frustumCulled = false; this.scene.add(this.trailMesh);
    this.motionReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cameraMode = 'chase'; this.lastPhase = 'ready'; this.time = 0; this.cameraIntro = 1;
    this.ensureWorld(0);
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    this.snapCamera = true; // Reframe immediately even when rotation paused the flight.
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }
  ensureWorld(distance) {
    const first = Math.max(-1, Math.floor((distance - 180) / 200)), last = Math.floor((distance + 650) / 200);
    for (let i = first; i <= last; i++) if (!this.chunks.has(i)) {
      const group = cosmos.world(i, this.day);
      if (i >= 1 && i <= 3) group.add(terrain(i, this.day));
      this.scene.add(group); this.chunks.set(i, group);
      if (i >= 0) for (const obj of makeObjects(this.seed, i)) {
        const mesh = pickup(obj); this.scene.add(mesh); this.pickups.set(obj.id, { mesh, obj, phase: (obj.d % 11) }); this.objects.push(obj);
      }
    }
    for (const [i, group] of this.chunks) if (i < first || i > last) {
      this.disposeGroup(group); this.chunks.delete(i);
    }
    for (const [id, item] of this.pickups) if (item.obj.d < first * 200 || item.obj.d >= (last + 1) * 200) {
      this.disposeGroup(item.mesh); this.pickups.delete(id);
    }
    this.objects = this.objects.filter(o => this.pickups.has(o.id));
    this.hq.visible = distance < 750;
  }
  disposeGroup(group) {
    this.scene.remove(group);
    group.traverse(o => {
      if (!o.isMesh && !o.isLine) return;
      if (o.isInstancedMesh) o.dispose();
      if (!o.userData.sharedGeometry && !Object.values(geometry).includes(o.geometry)) o.geometry?.dispose();
      if (o.material?.map) { o.material.map.dispose(); o.material.dispose(); }
    });
  }
  reset(day, seed = day) {
    this.inspectGhost = false; this.day = day; this.seed = seed; this.trail.length = 0; this.fx.reset(); this.ghost.reset(); this.target = null;
    // Restart returns directly to the roof; no long backwards camera trip through the entire run.
    if (innerWidth < 650 && innerHeight > innerWidth) {
      this.camera.position.set(54, 44, 75); this.look.set(-12, 21, -8);
    } else {
      this.camera.position.set(62, 44, 66); this.look.set(-22, 12, -8);
    }
    this.camera.fov = innerWidth < 650 ? 54 : 48;
    this.camera.updateProjectionMatrix(); this.camera.lookAt(this.look);
    for (const group of this.chunks.values()) this.disposeGroup(group);
    for (const { mesh } of this.pickups.values()) this.disposeGroup(mesh);
    this.chunks.clear(); this.pickups.clear(); this.objects = [];
    for (const p of this.particles) this.scene.remove(p.mesh);
    this.particles.length = 0; this.ensureWorld(0);
  }
  burst(x, y, d, type) {
    const color = type === 'cycle' ? '#ffe29a' : ['hazard','destroy','mine','mine-destroy'].includes(type) ? '#ff956d' : type === 'boost' ? '#7eeaff' : '#bafaad';
    for (let i = 0; i < (this.motionReduced ? 3 : type === 'destroy' ? 28 : 12); i++) {
      if (this.particles.length > 120) break;
      const mesh = shape(this.scene, 'tetra', mat(color, { emissive: color, emissiveIntensity: .2 }), x, y, -d, (type === 'destroy' ? .5 : .12) + Math.random() * .25);
      mesh.castShadow = false;
      this.particles.push({ mesh, velocity: V((Math.random() - .5) * 24, Math.random() * 16, (Math.random() - .5) * 24), life: (type === 'destroy' ? 1 : .5) + Math.random() * .35 });
    }
  }
  event(e, run) {
    this.fx.event(e, run, this.motionReduced);
    if (['ghost-damage','ghost-destroy','wall-damage'].includes(e.kind)) this.burst(e.x,e.y+ascentAt(e.d),e.d,e.kind==='ghost-destroy'?'destroy':'boost');
    if (e.kind === 'wall-damage') { const found=this.pickups.get(e.id);if(found)found.mesh.traverse(m=>{if(m.userData.armor)m.visible=false;}); }
    if (e.kind === 'boost') this.burst(run.x, altitudeAt(run), run.d, 'boost');
    if (['collect','destroy','mine-destroy'].includes(e.kind)) {
      const found = this.pickups.get(e.id); if (found) found.mesh.visible = false;
      this.burst(e.x, e.y + ascentAt(e.d), e.d, ['destroy','mine-destroy'].includes(e.kind) ? 'destroy' : e.type);
    }
  }
  update(run, dt) {
    this.time += dt; const t = this.time;
    cosmos.update(t,this.motionReduced);
    const flying = run.phase === 'flying', ready = run.phase === 'ready' || run.phase === 'charging';
    this.ensureWorld(run.d);
    this.zurich.update(dt, this.motionReduced);
    for (const group of this.chunks.values()) for (const m of group.userData.floaters || []) {
      m.position.y = m.userData.float.y + (this.motionReduced ? 0 : Math.sin(t * .45 + m.userData.float.phase) * 1.4);
    }
    const sky = new T.Color(run.zone === 0 ? '#273651' : ZONES[run.zone].sky);
    this.scene.background.lerp(sky, 1 - Math.exp(-dt * 1.2)); this.scene.fog.color.copy(this.scene.background);
    const space = clamp((run.d - 160) / 600, 0, 1), height = altitudeAt(run), base = ascentAt(run.d);
    this.scene.fog.near = 180 + space * 180; this.scene.fog.far = 680 + space * 480;
    this.ambient.color.set(space > .6 ? '#91a6ff' : '#b4c5ef'); this.ambient.intensity = 1.55 - space * .05;
    this.sun.castShadow = run.d < 550;
    this.sun.intensity = 2.1 - space * .9; this.bloom.strength = .24 + space * .24;
    this.bug.root.position.set(run.x, height, -run.d);
    this.bug.engines.visible = flying && run.d > 200;
    this.bug.flames.forEach(f => { f.scale.y = run.flow.active > 0 ? 4 : run.boostTime > 0 ? 3 : 1 + run.speed / 140; });
    this.shieldMesh.visible = run.shield > 0; this.shieldMesh.position.copy(this.bug.root.position);
    this.shieldMesh.rotation.y = t * .25;
    this.magnetRing.visible = run.magnetTime > 0; this.magnetRing.position.copy(this.bug.root.position);
    this.magnetRing.scale.setScalar(4 + Math.sin(t * 3) * .3);
    this.magnetRing.rotation.z = t;
    const targetScale = ready ? 1.45 : 1.3; this.bug.root.scale.lerp(V(targetScale, targetScale, targetScale), 1 - Math.exp(-dt * 6));
    this.bug.animated.rotation.z = ready ? Math.sin(t * 1.3) * .035 : -run.vx * .02;
    const slope = ascentAt(run.d + .5) - ascentAt(run.d - .5);
    this.bug.animated.rotation.x = ready ? 0 : Math.atan2(run.vy + slope * run.speed, run.speed) * .7;
    this.bug.animated.rotation.y = ready ? Math.sin(t * .5) * .09 : -run.vx * .008;
    if (ready) this.bug.root.position.y += Math.sin(t * 2.1) * .09;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      this.bug.shells[i].rotation.z = T.MathUtils.lerp(this.bug.shells[i].rotation.z, flying ? -side * .38 : 0, 1 - Math.exp(-dt * 6));
      this.bug.wings[i].visible = flying && run.y > 2;
      this.bug.wings[i].rotation.z = side * (.22 + Math.sin(t * 64) * .5);
    }
    this.groundShadow.position.set(run.x, run.d < 3 ? 20.44 : base + .17, -run.d);
    const sh = 1 + Math.min(run.y, 60) * .023; this.groundShadow.scale.set(sh, sh, 1);
    this.groundShadow.material.opacity = .26 / (1 + run.y * .02);
    for (const { mesh, obj, phase } of this.pickups.values()) {
      if (!mesh.visible) continue;
      if (obj.kind === 'cycle') mesh.rotation.y = Math.sin(t * 1.8 + phase) * .55;
      if (obj.kind === 'coffee') mesh.rotation.y = t * .65;
      if (obj.kind === 'portal') mesh.rotation.z = Math.sin(t + phase) * .035;
      // Collision centers remain fixed. Mesh wobble is cosmetic and smaller than the pickup margin.
      if (obj.kind === 'mine') updateMine(mesh, obj, t, this.motionReduced);
      if (!['pad', 'hazard', 'mine'].includes(obj.kind)) mesh.position.y = obj.y + ascentAt(obj.d) + Math.sin(t * 1.4 + phase) * .2;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]; p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.mesh); this.particles.splice(i, 1); continue; }
      p.mesh.position.addScaledVector(p.velocity, dt); p.velocity.y -= 13 * dt;
      p.mesh.scale.multiplyScalar(Math.exp(-dt * 1.5)); p.mesh.rotation.x += dt * 3;
    }
    if (flying) {
      this.trail.unshift(V(run.x, height, -run.d)); this.trail.length = Math.min(75, this.trail.length);
      const attr = this.trailMesh.geometry.attributes.position;
      this.trail.forEach((p, i) => attr.setXYZ(i, p.x, p.y, p.z)); attr.needsUpdate = true;
      this.trailMesh.geometry.setDrawRange(0, this.trail.length);
      this.trailMesh.material.color.set(run.boostTime > 0 ? '#c6fa7c' : ZONES[run.zone].color);
    }
    this.trailMesh.visible = false; // Replaced by the two persistent energy ribbons.
    this.launchGuide.update(run, t, this.motionReduced, innerWidth, innerHeight);
    const cameraPos = V(), target = V();
    if (ready) {
      if (innerWidth < 650 && innerHeight > innerWidth) {
        cameraPos.set(54, 44, 75); target.set(-12, 21, -8);
      } else {
        cameraPos.set(62, 44, 66); target.set(-22, 12, -8);
      }
      if (!this.motionReduced) { cameraPos.x += Math.sin(t * .14) * 1.5; cameraPos.y += Math.sin(t * .19) * .5; }
    } else if (this.inspectGhost) {
      const g = run.ghost, y = g.y + ascentAt(g.d);
      const offset = V(7, 3, this.inspectGhost === 'rear' ? -12 : 12).applyQuaternion(this.ghost.craft.quaternion);
      cameraPos.set(g.x, y, -g.d).add(offset); target.set(g.x, y, -g.d);
    } else if (this.cameraMode === 'chase') {
      const behind = 24 + Math.min(run.speed * .035, 4);
      // Camera and look point follow the same rising path as the bug. A flat camera
      // would look into the uphill floor and hide the landmarks during the ascent.
      cameraPos.set(run.x + (innerWidth < 650 && innerHeight > innerWidth ? 2.8 : 7.5), height + 6.8 + ascentAt(run.d - behind) - base, -run.d + behind);
      target.set(run.x * .94, height - 3 + ascentAt(run.d + 32) - base, -run.d - 32);
    } else {
      cameraPos.set(run.x + 30, height + 15 + ascentAt(run.d - 14) - base, -run.d + 14); target.set(run.x - 3, height - 4 + ascentAt(run.d + 15) - base, -run.d - 15);
    }
    const blend = this.snapCamera ? 1 : 1 - Math.exp(-dt * (ready ? 2 : 6));
    this.camera.position.lerp(cameraPos, blend); this.look.lerp(target, blend); this.camera.lookAt(this.look);
    const desiredFov = ready ? (innerWidth < 650 ? 54 : 48) : 56 + Math.min(9, run.speed * .055) + (this.motionReduced ? 0 : run.boostTime * 6 + (run.flow.active>0?3:0));
    this.camera.fov = T.MathUtils.lerp(this.camera.fov, desiredFov, this.snapCamera ? 1 : 1 - Math.exp(-dt * 3)); this.camera.updateProjectionMatrix();
    this.snapCamera = false;
    this.sun.position.set(run.x - 40, height + 80, -run.d + 45); this.sun.target.position.set(run.x, height - 10, -run.d - 5);
    this.ghost.update(run, this.camera, this.time, this.motionReduced);
    this.sky.update(this.camera, run.d, this.time, this.motionReduced);
    this.fx.update(run, dt, this.motionReduced, this.target);
    this.renderer.info.reset(); this.composer.render(dt);
    this.lastPhase = run.phase;
  }
  stats() { const bug = this.bug.root.position.clone().project(this.camera), ghost = this.ghost.root.position.clone().project(this.camera); return { ...this.zurich.stats(), ghostX: Math.round((ghost.x+1)*innerWidth/2), ghostY: Math.round((1-ghost.y)*innerHeight/2), bugX: Math.round((bug.x+1)*innerWidth/2), bugY: Math.round((1-bug.y)*innerHeight/2), calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, chunks: this.chunks.size, objects: this.objects.length }; }
}
