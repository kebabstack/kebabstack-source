import { createMine, updateMine } from './mine-view.js';
import { createCandle } from './candle-view.js';
import { isRedCandle } from './candle.js';
import { GhostView } from './ghost-view.js';
import { nextPaint } from './loading.js';
import { FrameBudget } from './frame-budget.js';
import { CoinInstances } from './coin-instances.js';
import { createZurich } from './zurich.js';
import { LaunchGuide } from './launch-guide.js';
import * as T from './vendor/three.module.js';
import { makeObjects, seededRandom, ZONES, clamp, ascentAt, altitudeAt } from './physics.js';
import { POWERUPS } from './ecosystem.js';

import { FlightFX } from './flight-fx.js';
import { createCosmosKit } from './cosmos.js';
import { Particles } from './particles.js';
import { FloatingLabels } from './labels.js';
import { FlightPostFX } from './post-fx.js';
import { createEnvironment } from './environment.js';
import { EffectComposer } from './vendor/addons/postprocessing/EffectComposer.js';
import { TexturePass } from './vendor/addons/postprocessing/TexturePass.js';
import { UnrealBloomPass } from './vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/addons/postprocessing/OutputPass.js';

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const geometry = {
  box: new T.BoxGeometry(1, 1, 1), sphere: new T.SphereGeometry(1, 24, 16),
  cone: new T.ConeGeometry(1, 1, 6), cylinder: new T.CylinderGeometry(1, 1, 1, 20),
  ring: new T.TorusGeometry(1, 0.12, 7, 28), coin: new T.TorusGeometry(1, 0.17, 10, 36),
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
  ctx.fillStyle = fg; ctx.font = `${font} ${size}px "Space Grotesk", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 133, 960);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
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

// A soft radial sprite shared by engine glows, the shield core and clouds.
let glowTexture = null;
function softDisc() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  glowTexture = new T.CanvasTexture(canvas); glowTexture.colorSpace = T.SRGBColorSpace; return glowTexture;
}
function glowSprite(color, scale, opacity = .8) {
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: softDisc(), color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending }));
  sprite.scale.setScalar(scale); return sprite;
}

function createBug() {
  const root = new T.Group(), animated = new T.Group(); root.add(animated);
  const ink = new T.MeshPhysicalMaterial({ color: '#101a1c', roughness: .32, metalness: .1, clearcoat: .6, clearcoatRoughness: .25 });
  const red = new T.MeshPhysicalMaterial({ color: '#e63a2a', roughness: .28, metalness: .02, clearcoat: 1, clearcoatRoughness: .12, sheen: .3, sheenColor: new T.Color('#ff9a7a') });
  shape(animated, 'sphere', ink, 0, 0, .15, 1.05, .63, 1.65);
  const wings = [], shells = [];
  const wingMat = new T.MeshPhysicalMaterial({ color: '#dff6ff', transparent: true, opacity: .42, roughness: .15, metalness: 0, iridescence: .9, iridescenceIOR: 1.35, side: T.DoubleSide, depthWrite: false });
  for (const side of [-1, 1]) {
    const shell = new T.Group(); shell.position.set(side * .13, .15, .18); animated.add(shell);
    shape(shell, 'sphere', red, side * .46, .17, 0, .65, .8, 1.46);
    for (const [px, py, pz, r] of [[.48, .88, -.48, .19], [.64, .75, .4, .23], [.32, .86, .83, .15]]) {
      const spot = shape(shell, 'sphere', ink, side * px, py, pz, r, .035, r * 1.2); spot.rotation.z = side * -.2;
    }
    shells.push(shell);
    const wing = new T.Group(); wing.position.set(side * .2, .1, -.1); animated.add(wing);
    const blade = shape(wing, 'sphere', wingMat, side * 1.1, 0, .2, 1.42, .045, .7); blade.castShadow = false;
    wing.visible = false; wings.push(wing);
    for (let i = 0; i < 3; i++) {
      const a = V(side * .6, -.35, -.7 + i * .75), b = V(side * 1.35, -.65, -1 + i * .92), c = V(side * 1.65, -1, -.95 + i * 1.07);
      bar(animated, a, b, .075, ink); bar(animated, b, c, .06, ink);
    }
  }
  shape(animated, 'sphere', ink, 0, -.02, -1.28, .85, .67, .74);
  const eyeWhite = new T.MeshPhysicalMaterial({ color: '#fffdf0', roughness: .12, clearcoat: 1 });
  for (const side of [-1, 1]) {
    shape(animated, 'sphere', eyeWhite, side * .43, .32, -1.82, .36, .44, .29);
    shape(animated, 'sphere', ink, side * .43 + .04, .33, -2.08, .145, .2, .09);
    shape(animated, 'sphere', mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: .8 }), side * .43 + .085, .42, -2.15, .05);
    bar(animated, V(side * .4, .52, -1.25), V(side * .7, 1.12, -1.75), .055, ink);
    shape(animated, 'sphere', mat('#79f8ff', { emissive: '#3fd8ff', emissiveIntensity: 1.6 }), side * .7, 1.12, -1.75, .11);
  }
  const engines = new T.Group(); animated.add(engines);
  const flames = [], glows = [];
  const steel = new T.MeshStandardMaterial({ color: '#9fb6c2', metalness: .9, roughness: .25 });
  for (const side of [-1, 1]) {
    const rocket = shape(engines, 'cylinder', steel, side * .88, .25, .9, .26, 1.2, .26); rocket.rotation.x = Math.PI / 2;
    shape(engines, 'ring', cosmos.glow('#79f8ff'), side * .88, .25, 1.5, .25);
    const flame = shape(engines, 'cone', mat('#85edff', { emissive: '#46bbff', emissiveIntensity: 2.2, transparent: true, opacity: .7, depthWrite: false }), side * .88, .25, 2, .21, 1.3, .21);
    flame.rotation.x = Math.PI / 2; flame.castShadow = false; flames.push(flame);
    const glow = glowSprite('#5fe4ff', 1.6, .75); glow.position.set(side * .88, .25, 1.6); engines.add(glow); glows.push(glow);
  }
  return { root, animated, wings, shells, engines, flames, glows };
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
  put('box', '#4a6560', 0, -.7, -start - 100, 760, 1.3, 200.1);
  put('box', '#3d4b5e', 0, -.01, -start - 100, 20, .05, 200);
  put('box', '#8f9fa8', -11.7, .08, -start - 100, 3.3, .18, 200);
  put('box', '#8f9fa8', 11.7, .08, -start - 100, 3.3, .18, 200);
  for (let z = 0; z < 200; z += 14) put('box', '#d2d8bf', 0, .06, -start - z, .22, .02, 5);
  // Lake ribbon and bank, below the city skyline.
  put('box', '#4f7d74', -105, -.04, -start - 100, 56, .1, 200);
  put('box', '#3a86a3', -105, .015, -start - 100, 46, .09, 200);
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
        put('mountain', ['#7f9aa6', '#8ea7b0', '#74919c'][i % 3], px, ph * .5, z - 110, ph * .7, ph, ph * .7, mountainRotation);
        put('snowcap', '#eef2f4', px, ph * .885, z - 110, ph * .161, ph * .23, ph * .161, mountainRotation);
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

const coinGold = new T.MeshStandardMaterial({ color: '#ffcd5c', metalness: .95, roughness: .22, emissive: '#b86713', emissiveIntensity: .55 });
const coinCore = new T.MeshStandardMaterial({ color: '#fff1bd', emissive: '#ffcf63', emissiveIntensity: 1.6, roughness: .3 });
function pickup(obj) {
  if(isRedCandle(obj)) {
    const candle=createCandle(false,obj.hp>1);
    candle.position.set(obj.x,obj.y+ascentAt(obj.d),-obj.d);return candle;
  }
  const g = obj.kind === 'mine' ? createMine() : new T.Group(); g.position.set(obj.x, obj.y + ascentAt(obj.d), -obj.d);
  if (obj.kind === 'mine') {
    if (!obj.airborne) g.rotation.x = Math.atan(ascentAt(obj.d + .5) - ascentAt(obj.d - .5));
    return g;
  }
  if (obj.kind === 'cycle') {
    shape(g, 'coin', coinGold, 0, 0, 0, 1.65);
    shape(g, 'sphere', coinCore, 0, 0, 0, .26);
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
    shape(g, 'box', mat('#c6fa7c', { emissive: '#a4da50', emissiveIntensity: .35 }), 0, 0, 0, 8, .2, 7);
    for (let i = 0; i < 3; i++) {
      const a = shape(g, 'box', '#3f6844', -.9, .15, -2 + i * 1.5, 2.5, .1, .35); a.rotation.y = -.5;
      const b = shape(g, 'box', '#3f6844', .9, .15, -2 + i * 1.5, 2.5, .1, .35); b.rotation.y = .5;
    }
  }
  if (!['cycle', 'pad', 'hazard', 'mine', 'coffee'].includes(obj.kind)) {
    // Rare ecosystem artifacts get a soft halo so they read from far away.
    const halo = glowSprite(cosmos.colorOf(obj.kind), 9, .35); halo.position.y = .4; g.add(halo);
  }
  return g;
}

export class GameView {
  constructor(container, day, seed = day) {
    this.inspectGhost = false; this.day = day; this.seed = seed; this.container = container;
    this.renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    // Pixel ratio: sharp on retina, but capped so the multisampled scene buffer stays affordable on large screens.
    const pointerCoarse = matchMedia('(pointer: coarse)').matches;
    let ratio = Math.min(window.devicePixelRatio || 1, pointerCoarse ? 1.15 : 1.5);
    ratio = Math.min(ratio, Math.sqrt(4.2e6 / Math.max(1, innerWidth * innerHeight)));
    this.renderer.setPixelRatio(Math.max(.75, ratio));
    this.frameBudget = new FrameBudget();
    this.initialPixelRatio = this.renderer.getPixelRatio();
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.scene = new T.Scene(); this.scene.background = new T.Color('#6a5a7c');
    this.scene.fog = new T.Fog('#6a5a7c', 160, 620);
    this.envTexture = createEnvironment(this.renderer); this.scene.environment = this.envTexture; this.scene.environmentIntensity = .55;
    this.debug = { env: true, post: true, bloom: true, msaa: true, particles: true, labels: true, ghost: true, rim: true, shadows: true, fx: true };
    this.camera = new T.PerspectiveCamera(48, innerWidth / innerHeight, .15, 1400);
    this.camera.position.set(62, 44, 66);
    this.look = V(-22, 12, -8); this.camera.lookAt(this.look);
    this.ambient = new T.HemisphereLight('#f6ecd8', '#5d6f7d', 1.1); this.scene.add(this.ambient);
    this.sun = new T.DirectionalLight('#ffe7c4', 2.3); this.sun.position.set(-35, 90, 40);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -60, right: 60, top: 65, bottom: -60, near: 1, far: 240 });
    this.sun.shadow.normalBias = .1; this.sun.shadow.bias = -.00012; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    // Cool rim from behind-left separates the bug and candles from the sky.
    this.rim = new T.DirectionalLight('#7fb6ff', .9); this.scene.add(this.rim, this.rim.target);
    this.sky = cosmos.sky(this.scene);
    this.fx = new FlightFX(this.scene);
    this.ghost = new GhostView(this.scene);
    this.motionReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sparks = new Particles(this.scene, this.motionReduced);
    this.labels = new FloatingLabels(this.scene);
    this.post = new FlightPostFX();
    // The scene renders into its own multisampled HDR buffer, which is resolved once and
    // then copied into the (single-sample) post chain. Nothing ever blends back into the
    // multisampled buffer: tile-based GPUs discard its contents after the resolve, so an
    // additive composite there (as UnrealBloomPass does on the composer's own buffers)
    // would paint over undefined memory and flicker black.
    const samples = this.renderer.capabilities.isWebGL2 ? Math.min(4, this.renderer.capabilities.maxSamples || 0) : 0;
    this.sceneTarget = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples, depthBuffer: true, stencilBuffer: false });
    this.post.pass.uniforms.sceneTexture.value = this.sceneTarget.texture;
    this.composer = new EffectComposer(this.renderer);
    this.scenePass = new TexturePass(this.sceneTarget.texture);
    // Copy with a guard: a single NaN or infinite texel (an extrapolated multisample at a
    // shader edge, a driver quirk) would otherwise be smeared across the whole frame by
    // the bloom blur and show up as a black screen. Bad texels become black pixels instead.
    this.scenePass.material = new T.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, opacity: { value: 1 } }, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float opacity; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c)) || any(isinf(c))) c = vec4(0., 0., 0., 1.);
          gl_FragColor = vec4(clamp(c.rgb, 0., 4096.), 1.) * opacity; }` });
    this.scenePass.uniforms = this.scenePass.material.uniforms;
    this.composer.addPass(this.scenePass);
    this.bloom = new UnrealBloomPass(new T.Vector2(innerWidth, innerHeight), .55, .7, 1.05);
    this.composer.addPass(this.bloom); this.composer.addPass(this.post.pass); this.composer.addPass(new OutputPass());
    this.resizeTargets();
    this.zurich = createZurich({V,shape,bar,label,mat,infinity,bake});
    this.hq = this.zurich.root; this.scene.add(this.hq);
    this.bug = createBug(); this.scene.add(this.bug.root);
    this.bug.root.position.set(0, 21.2, 0);
    this.shieldMesh = shape(this.scene, 'sphere', new T.MeshPhysicalMaterial({ color: '#8dffe0', emissive: '#42d6b2', emissiveIntensity: .6, transparent: true, opacity: .22, roughness: .1, side: T.DoubleSide, depthWrite: false }), 0, 0, 0, 3.3);
    this.shieldMesh.castShadow = false;
    this.shieldWire = shape(this.scene, 'sphere', mat('#b9fff0', { emissive: '#8bffd9', emissiveIntensity: 1.2, transparent: true, opacity: .25, wireframe: true }), 0, 0, 0, 3.4);
    this.magnetRing = shape(this.scene, 'ring', cosmos.glow('#b9a0ff'), 0, 0, 0, 4); this.magnetRing.rotation.x = Math.PI / 2;
    this.groundShadow = new T.Mesh(new T.CircleGeometry(2.1, 24), new T.MeshBasicMaterial({ color: '#102a24', transparent: true, opacity: .2, depthWrite: false }));
    this.groundShadow.rotation.x = -Math.PI / 2; this.scene.add(this.groundShadow);
    this.chunks = new Map(); this.objects = []; this.pickups = new Map(); this.particles = [];
    this.coinInstances = new CoinInstances(this.scene, pickup({ kind: 'cycle', x: 0, y: 0, d: 0 }));
    this.trail = []; this.trailMesh = null;
    this.launchGuide = new LaunchGuide(this.scene);
    const trailGeom = new T.BufferGeometry(); trailGeom.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(75 * 3), 3));
    this.trailMesh = new T.Line(trailGeom, new T.LineBasicMaterial({ color: '#ecb676', transparent: true, opacity: .55 })); this.trailMesh.frustumCulled = false; this.scene.add(this.trailMesh);
    this.cameraMode = 'chase'; this.lastPhase = 'ready'; this.time = 0; this.cameraIntro = 1;
    this.shake = 0; this.roll = 0; this.hitStop = 0; this.moteClock = 0; this.lastBoostTime = 0;
    this.ensureWorld(0);
    this.coinInstances.update(this.pickups.values());
    window.addEventListener('resize', () => this.resize());
  }
  resizeTargets() {
    const ratio = this.renderer.getPixelRatio();
    this.sceneTarget.setSize(Math.max(1, Math.floor(innerWidth * ratio)), Math.max(1, Math.floor(innerHeight * ratio)));
    this.composer.setPixelRatio(ratio); this.composer.setSize(innerWidth, innerHeight);
  }
  renderFrame(dt = 0) {
    // Scene → multisampled buffer (resolved at the end of render) → post chain → canvas.
    this.renderer.setRenderTarget(this.sceneTarget); this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.composer.render(dt);
  }
  resize() {
    this.snapCamera = true; // Reframe immediately even when rotation paused the flight.
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.resizeTargets();
  }
  adaptQuality(ms, active = true) {
    if (!this.frameBudget.sample(ms, active)) return;
    const level = this.frameBudget.level;
    const ratio = Math.min(this.initialPixelRatio, level === 1 ? 1 : .75);
    this.renderer.setPixelRatio(ratio); this.resizeTargets();
    this.bloom.enabled = level < 2;
  }
  async warmUp(run, progress) {
    progress(25, 'Loading the space scenery…'); await nextPaint();
    const loaded = await this.sky.preload(this.renderer);
    progress(45, 'Preparing the course and flight effects…'); await nextPaint();
    // Sample every region and pickup once, without advancing or submitting a flight.
    const samples = new T.Group(); this.scene.add(samples);
    const visibility = [];
    try {
      for (const zone of ZONES) {
        samples.add(cosmos.world(Math.floor(zone.at / 200), this.day));
        await nextPaint();
      }
      for (const kind of ['cycle','coffee','portal','compiler','canister','identity','oisy','fusion','neuron','pad','hazard','mine']) {
        samples.add(pickup({ kind, x: 0, y: 4, d: 200, hp: 2 }));
      }
      this.sky.update(this.camera, 3500, 0, true);
      this.scene.traverse(object => { visibility.push([object, object.visible, object.frustumCulled]); object.visible = true; object.frustumCulled = false; });
      progress(65, 'Preparing graphics for a smoother first flight…'); await nextPaint();
      await this.renderer.compileAsync(this.scene, this.camera);
      // Compile both shadow configurations used by the rooftop and space regions.
      this.renderFrame(0); this.sun.castShadow = false;
      await this.renderer.compileAsync(this.scene, this.camera);
      this.renderFrame(0);
    } finally {
      for (const [object, visible, culled] of visibility) { object.visible = visible; object.frustumCulled = culled; }
      this.disposeGroup(samples);
    }
    progress(90, loaded === 3 ? 'Checking the launch scene…' : 'Space scenery unavailable; preparing the starfield…');
    await nextPaint(); this.update(run, 0); await nextPaint(); this.update(run, 0);
    progress(95, 'Tuning graphics for this device…');
    // A bounded preview catches sustained overload before launch. Further
    // adaptation uses only active foreground frames, not a paused game.
    // The early flight costs more than the static rooftop. Render a copy; never
    // advance physics, consume a boost, collect a coin or replace the real run.
    const preview = { ...run, phase: 'flying', d: 200, y: 30, speed: 80 };
    this.snapCamera = true; this.update(preview, 0);
    let previous = performance.now();
    for (let i = 0; i < 48; i++) {
      await nextPaint(); const now = performance.now();
      this.adaptQuality(now - previous, !document.hidden); previous = now;
      this.update(preview, 0);
    }
    this.frameBudget.clear();
    this.snapCamera = true; this.update(run, 0);
    progress(100, 'Ready to fly'); await nextPaint();
  }
  ensureWorld(distance) {
    const first = Math.max(-1, Math.floor((distance - 180) / 200)), last = Math.floor((distance + 650) / 200);
    // Physics runs at 120 Hz. Rebuild/filter only when the visible chunk range changes.
    if (this.worldFirst === first && this.worldLast === last) return;
    this.worldFirst = first; this.worldLast = last;
    for (let i = first; i <= last; i++) if (!this.chunks.has(i)) {
      const group = cosmos.world(i, this.day);
      if (i >= 1 && i <= 3) group.add(terrain(i, this.day));
      this.scene.add(group); this.chunks.set(i, group);
      if (i >= 0) for (const obj of makeObjects(this.seed, i)) {
        const mesh = pickup(obj);
        if (obj.kind !== 'cycle') this.scene.add(mesh);
        this.pickups.set(obj.id, { mesh, obj, phase: (obj.d % 11) }); this.objects.push(obj);
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
      if (!o.isMesh && !o.isLine && !o.isSprite) return;
      if (o.isInstancedMesh) o.dispose();
      if (o.isSprite) { o.material.dispose(); return; } // the glow texture itself is shared
      if (!o.userData.sharedGeometry && !Object.values(geometry).includes(o.geometry)) o.geometry?.dispose();
      if (o.material?.map && o.material.map !== glowTexture) { o.material.map.dispose(); o.material.dispose(); }
    });
  }
  reset(day, seed = day) {
    this.worldFirst = null; this.worldLast = null;
    this.inspectGhost = false; this.day = day; this.seed = seed; this.trail.length = 0; this.fx.reset(); this.ghost.reset(); this.target = null;
    this.sparks.reset(); this.labels.reset(); this.shake = 0; this.roll = 0; this.hitStop = 0; this.post.flash.a = 0;
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
    this.particles.length = 0; this.ensureWorld(0);
  }
  burst(x, y, d, type) {
    const z = -d;
    if (type === 'cycle') this.sparks.coin(x, y, z);
    else if (type === 'destroy') this.sparks.explosion(x, y, z, 1.1);
    else if (['hazard', 'mine', 'mine-destroy'].includes(type)) this.sparks.explosion(x, y, z, .8);
    else if (type === 'boost') this.sparks.burst(x, y, z, { count: 26, color: '#9df4ff', color2: '#ffffff', speed: 16, size: 1.3, life: .6, up: 2 });
    else this.sparks.burst(x, y, z, { count: 22, color: '#bafaad', color2: '#e8ffe0', speed: 13, size: 1.2, life: .7, up: 4 });
  }
  kick(amount) { this.shake = Math.min(1.6, this.shake + amount); }
  event(e, run) {
    this.fx.event(e, run, this.motionReduced);
    const y = (e.y ?? run.y) + ascentAt(e.d ?? run.d), x = e.x ?? run.x, d = e.d ?? run.d;
    if (['ghost-damage','ghost-destroy','wall-damage'].includes(e.kind)) {
      this.burst(x, y, d, e.kind === 'ghost-destroy' ? 'destroy' : 'boost');
      if (e.kind === 'ghost-destroy') { this.kick(.5); this.labels.show('DEBUGGED', x, y + 3, -d, { color: '#ff9ce8', scale: 1.2 }); }
    }
    if (e.kind === 'wall-damage') { const found=this.pickups.get(e.id);if(found)found.mesh.traverse(m=>{if(m.userData.armor)m.visible=false;}); }
    if (e.kind === 'boost') { this.burst(run.x, altitudeAt(run), run.d, 'boost'); this.kick(.18); }
    if (e.kind === 'launch') { this.kick(.35); if (e.label === 'PERFECT DEPLOY') this.labels.show('PERFECT!', run.x, altitudeAt(run) + 4, -run.d, { color: '#b7ffd6', scale: 1.5, duration: 1.2 }); }
    if (['collect','destroy','mine-destroy'].includes(e.kind)) {
      const found = this.pickups.get(e.id); if (found) found.mesh.visible = false;
      this.burst(e.x, e.y + ascentAt(e.d), e.d, ['destroy','mine-destroy'].includes(e.kind) ? 'destroy' : e.type);
      if (e.kind === 'collect' && e.type === 'cycle') this.labels.show('+50', e.x, y + 2.2, -e.d, { color: run.combo % 5 === 0 && run.combo > 0 ? '#fff6c8' : '#ffd36b', scale: run.combo % 5 === 0 && run.combo > 0 ? 1.2 : .85, duration: .8 });
      if (e.kind === 'collect' && !['cycle', 'pad', 'hazard', 'mine'].includes(e.type)) this.labels.show((POWERUPS[e.type]?.name || e.type).toUpperCase(), e.x, y + 3, -e.d, { color: cosmos.colorOf(e.type), scale: 1.1 });
      if (e.kind !== 'collect') { this.kick(.3); this.labels.show('CLEARED', e.x, y + 3, -e.d, { color: '#ffb27a', scale: 1 }); }
    }
    if (['hazard', 'mine-hit', 'ghost-hit'].includes(e.kind)) {
      this.kick(.9); this.hitStop = .07; this.post.hit('#ff4a3a', .32);
      this.sparks.explosion(run.x, altitudeAt(run), -run.d, .7, '#ffb27a', '#ff5a3c');
      this.labels.show(e.kind === 'ghost-hit' ? '−33%' : '−40%', run.x, altitudeAt(run) + 3, -run.d, { color: '#ff8c7a', scale: 1.15 });
    }
    if (e.kind === 'shield') { this.post.hit('#7dffd9', .2); this.labels.show('SHIELDED', run.x, altitudeAt(run) + 3, -run.d, { color: '#8dffe0', scale: 1.1 }); }
    if (e.kind === 'near-miss') this.labels.show('CLOSE CALL +20', run.x, altitudeAt(run) + 2.5, -run.d, { color: '#9df4ff', scale: .95 });
    if (e.kind === 'overdrive') { this.post.hit(e.godCandle ? '#38ff93' : '#ffd783', .22); this.kick(.25); }
    if (e.kind === 'zone') this.post.hit(ZONES[e.index].color, .12);
    if (e.kind === 'bounce') this.kick(.25 + (e.strength || 0) * .4);
  }
  update(run, dt) {
    // A brief hit-stop freezes the picture on impact. main.js also skips physics while hitStop > 0.
    if (this.hitStop > 0) { this.hitStop -= dt; dt = 0; }
    this.time += dt; const t = this.time;
    cosmos.update(t,this.motionReduced);
    const flying = run.phase === 'flying', ready = run.phase === 'ready' || run.phase === 'charging';
    this.ensureWorld(run.d);
    this.zurich.update(dt, this.motionReduced);
    for (const group of this.chunks.values()) for (const m of group.userData.floaters || []) {
      m.position.y = m.userData.float.y + (this.motionReduced ? 0 : Math.sin(t * .45 + m.userData.float.phase) * 1.4);
    }
    const sky = new T.Color(run.zone === 0 ? '#6a5a7c' : ZONES[run.zone].sky);
    this.scene.background.lerp(sky, 1 - Math.exp(-dt * 1.2)); this.scene.fog.color.copy(this.scene.background);
    const space = clamp((run.d - 160) / 600, 0, 1), height = altitudeAt(run), base = ascentAt(run.d);
    this.scene.fog.near = 170 + space * 200; this.scene.fog.far = 640 + space * 520;
    this.ambient.color.set(space > .6 ? '#8aa0ff' : '#f6ecd8'); this.ambient.intensity = 1.05 - space * .25;
    this.scene.environmentIntensity = .55 + space * .25;
    this.sun.castShadow = this.debug.shadows && this.frameBudget.level === 0 && run.d < 550;
    this.sun.intensity = 2.3 - space * 1.1; this.bloom.strength = .38 + space * .32;
    this.rim.intensity = .7 + space * .9;
    this.bug.root.position.set(run.x, height, -run.d);
    const energy = run.flow.active > 0 ? 1 : run.boostTime > 0 ? .8 : 0;
    this.bug.engines.visible = flying && run.d > 200;
    this.bug.flames.forEach(f => { f.scale.y = (run.flow.active > 0 ? 4 : run.boostTime > 0 ? 3 : 1 + run.speed / 140) * (this.motionReduced ? 1 : .9 + Math.sin(t * 40) * .1); });
    this.bug.glows.forEach(g => { g.scale.setScalar(1.3 + energy * 1.6 + run.speed / 150 * .5); g.material.opacity = .45 + energy * .4; g.material.color.set(run.flow.godCandle && run.flow.active > 0 ? '#5dffa9' : run.flow.active > 0 ? '#ffd36b' : '#5fe4ff'); });
    if (flying && (run.boostTime > 0 || run.flow.active > 0) && dt > 0) {
      const dir = V(run.vx, run.vy, -run.speed).normalize();
      for (const side of [-1, 1]) this.sparks.thrust(run.x + side * 1.1, height + .3, -run.d + 2.2, dir.x * 60, dir.y * 60, dir.z * 60, .8 + energy * .6, run.flow.godCandle && run.flow.active > 0 ? '#6dffb4' : run.flow.active > 0 ? '#ffd36b' : '#79efff');
    }
    this.shieldMesh.visible = run.shield > 0; this.shieldMesh.position.copy(this.bug.root.position);
    this.shieldMesh.rotation.y = t * .25; this.shieldMesh.material.opacity = .16 + Math.sin(t * 4) * .05;
    this.shieldWire.visible = run.shield > 0; this.shieldWire.position.copy(this.bug.root.position); this.shieldWire.rotation.set(t * .4, -t * .25, 0);
    this.magnetRing.visible = run.magnetTime > 0; this.magnetRing.position.copy(this.bug.root.position);
    this.magnetRing.scale.setScalar(4 + Math.sin(t * 3) * .3);
    this.magnetRing.rotation.z = t;
    const targetScale = ready ? 1.45 : 1.3; this.bug.root.scale.lerp(V(targetScale, targetScale, targetScale), 1 - Math.exp(-dt * 6));
    this.bug.animated.rotation.z = ready ? Math.sin(t * 1.3) * .035 : -run.vx * .028;
    const slope = ascentAt(run.d + .5) - ascentAt(run.d - .5);
    this.bug.animated.rotation.x = ready ? 0 : Math.atan2(run.vy + slope * run.speed, run.speed) * .7;
    this.bug.animated.rotation.y = ready ? Math.sin(t * .5) * .09 : -run.vx * .012;
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
      // Passed objects sit between the chase camera and the bug. Hide them once
      // fully cleared, rather than letting an oversized foreground candle block
      // the next lane. Derive visibility each frame so the warm-up resets safely.
      mesh.visible = !run.hits.has(obj.id) && obj.d >= run.d - obj.radius - 1.25;
      if (!mesh.visible) continue;
      if (obj.kind === 'cycle') mesh.rotation.y = t * 1.6 + phase;
      if (obj.kind === 'coffee') mesh.rotation.y = t * .65;
      if (obj.kind === 'portal') mesh.rotation.z = Math.sin(t + phase) * .035;
      // Collision centers remain fixed. Mesh wobble is cosmetic and smaller than the pickup margin.
      if (obj.kind === 'mine' && !obj.airborne) updateMine(mesh, obj, t, this.motionReduced);
      if (!['pad', 'hazard', 'mine'].includes(obj.kind)) mesh.position.y = obj.y + ascentAt(obj.d) + Math.sin(t * 1.4 + phase) * .2;
    }
    this.coinInstances.update(this.pickups.values());
    // Drifting motes give the cyberspace sections depth without geometry.
    if (flying && space > .2 && dt > 0 && !this.motionReduced) {
      this.moteClock += dt;
      while (this.moteClock > .05) { this.moteClock -= .05; this.sparks.ambient(run.x + (Math.random() - .5) * 90, height + (Math.random() - .3) * 50, -run.d - 40 - Math.random() * 160, Math.random() < .5 ? ZONES[run.zone].color : '#cfe6ff'); }
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
      if (run.phase === 'charging' && !this.motionReduced) { const c = run.charge; cameraPos.x -= c * 4; cameraPos.z -= c * 3; cameraPos.y -= c * 2; }
    } else if (this.inspectGhost) {
      const g = run.ghost, y = g.y + ascentAt(g.d);
      const offset = V(7, 3, this.inspectGhost === 'rear' ? -12 : 12).applyQuaternion(this.ghost.craft.quaternion);
      cameraPos.set(g.x, y, -g.d).add(offset); target.set(g.x, y, -g.d);
    } else if (this.cameraMode === 'chase') {
      const behind = 24 + Math.min(run.speed * .035, 4);
      // Camera and look point follow the same rising path as the bug. A flat camera
      // would look into the uphill floor and hide the landmarks during the ascent.
      cameraPos.set(run.x * .9 + (innerWidth < 650 && innerHeight > innerWidth ? 2.8 : 7.5), height + 6.8 + ascentAt(run.d - behind) - base, -run.d + behind);
      target.set(run.x * .94 + run.vx * .12, height - 3 + ascentAt(run.d + 32) - base, -run.d - 32);
    } else {
      cameraPos.set(run.x + 30, height + 15 + ascentAt(run.d - 14) - base, -run.d + 14); target.set(run.x - 3, height - 4 + ascentAt(run.d + 15) - base, -run.d - 15);
    }
    const blend = this.snapCamera ? 1 : 1 - Math.exp(-dt * (ready ? 2 : 6));
    this.camera.position.lerp(cameraPos, blend); this.look.lerp(target, blend);
    // Impact shake: decaying layered sine noise, never while reduced motion is on.
    this.shake = Math.max(0, this.shake - dt * 2.6);
    if (this.shake > 0 && !this.motionReduced) {
      const s = this.shake * this.shake * .9, k = t * 60;
      this.camera.position.x += Math.sin(k * 1.3) * s; this.camera.position.y += Math.sin(k * 1.7 + 1) * s * .7; this.camera.position.z += Math.sin(k * .9 + 2) * s * .4;
    }
    this.camera.lookAt(this.look);
    const rollTarget = flying && this.cameraMode === 'chase' && !this.motionReduced ? -run.vx * .004 : 0;
    this.roll += (rollTarget - this.roll) * (this.snapCamera ? 1 : 1 - Math.exp(-dt * 4)); this.camera.rotateZ(this.roll);
    const desiredFov = ready ? (innerWidth < 650 ? 54 : 48) : 56 + Math.min(9, run.speed * .055) + (this.motionReduced ? 0 : run.boostTime * 6 + (run.flow.active>0?3:0));
    this.camera.fov = T.MathUtils.lerp(this.camera.fov, desiredFov, this.snapCamera ? 1 : 1 - Math.exp(-dt * 3)); this.camera.updateProjectionMatrix();
    this.snapCamera = false;
    this.sun.position.set(run.x - 40, height + 80, -run.d + 45); this.sun.target.position.set(run.x, height - 10, -run.d - 5);
    this.rim.position.set(run.x + 30, height + 20, -run.d - 60); this.rim.target.position.set(run.x, height, -run.d);
    this.ghost.update(run, this.camera, this.time, this.motionReduced);
    if (!this.debug.ghost) this.ghost.root.visible = false;
    this.sky.update(this.camera, run.d, this.time, this.motionReduced);
    this.fx.update(run, dt, this.motionReduced, this.target);
    if (!this.debug.fx) for (const r of this.fx.ribbons) r.visible = false;
    this.sparks.update(dt, this.renderer.getPixelRatio()); this.labels.update(dt, this.motionReduced);
    const streak = flying ? clamp((run.speed - 95) / 55, 0, .45) + (run.boostTime > 0 ? .4 : 0) + (run.flow.active > 0 ? .5 : 0) : 0;
    this.post.update(dt, { streak: Math.min(1, streak), aberration: Math.min(1, streak * .7 + (run.hitTime > 0 ? .45 : 0)), reduced: this.motionReduced });
    this.renderer.info.reset(); this.renderFrame(dt);
    this.lastPhase = run.phase;
  }
  // Lab only (?test=1 or #lab): Shift+1..0 toggles a rendering feature to isolate GPU-specific issues.
  toggleDebug(n) {
    const keys = ['msaa', 'env', 'post', 'bloom', 'particles', 'labels', 'ghost', 'rim', 'shadows', 'fx'];
    const key = keys[(n + 9) % 10]; this.debug[key] = !this.debug[key]; const on = this.debug[key];
    if (key === 'env') this.scene.environment = on ? this.envTexture : null;
    if (key === 'post') this.post.enabledFlag = on;
    if (key === 'bloom') this.bloom.enabled = on;
    if (key === 'particles') { this.sparks.sparks.points.visible = on; this.sparks.smoke.points.visible = on; }
    if (key === 'labels') { this.labels.enabled = on; if (!on) this.labels.reset(); }
    if (key === 'rim') this.rim.visible = on;
    if (key === 'msaa') {
      const samples = on ? (this.renderer.capabilities.isWebGL2 ? Math.min(4, this.renderer.capabilities.maxSamples || 0) : 0) : 0;
      this.sceneTarget.dispose();
      this.sceneTarget = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples, depthBuffer: true, stencilBuffer: false });
      this.post.pass.uniforms.sceneTexture.value = this.sceneTarget.texture;
      this.scenePass.map = this.sceneTarget.texture; this.resizeTargets();
    }
    return keys.map((k, i) => `${(i + 1) % 10}:${k}=${this.debug[k] ? 'on' : 'OFF'}`).join(' ');
  }
  stats() { const bug = this.bug.root.position.clone().project(this.camera), ghost = this.ghost.root.position.clone().project(this.camera); return { quality: this.frameBudget.level, pixelRatio: this.renderer.getPixelRatio(), ...this.zurich.stats(), ghostX: Math.round((ghost.x+1)*innerWidth/2), ghostY: Math.round((1-ghost.y)*innerHeight/2), bugX: Math.round((bug.x+1)*innerWidth/2), bugY: Math.round((1-bug.y)*innerHeight/2), calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, chunks: this.chunks.size, objects: this.objects.length }; }
}
