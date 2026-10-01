import * as T from 'three';

// GPU point-sprite particles. The CPU only writes a particle once at emission;
// the vertex shader integrates velocity, gravity, fade and shrink from a clock
// uniform. One additive system carries sparks and glow, one normal-blended
// system carries smoke. Both are a single draw call each.
const vertex = `
  attribute vec3 velocity; attribute vec3 tint; attribute float size; attribute float birth; attribute float life; attribute float drag;
  uniform float clock; uniform float ratio; uniform float gravity;
  varying vec3 color; varying float alpha;
  void main() {
    float age = clock - birth;
    if (age < 0. || age > life) { gl_Position = vec4(2., 2., 2., 1.); gl_PointSize = 0.; alpha = 0.; color = vec3(0.); return; }
    float t = clamp(age / max(life, .0001), 0., 1.);
    float slow = (1. - exp(-drag * age)) / max(drag, .0001);
    vec3 p = position + velocity * slow + vec3(0., -gravity * .5 * age * age, 0.);
    vec4 mv = modelViewMatrix * vec4(p, 1.);
    alpha = (1. - t) * smoothstep(0., .06, t);
    color = tint;
    float grow = mix(1., .25, t * t);
    gl_PointSize = size * grow * ratio * (190. / max(1., -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const sparkFragment = `
  varying vec3 color; varying float alpha;
  void main() {
    if (alpha <= 0.) discard;
    vec2 q = gl_PointCoord - .5; float r = length(q) * 2.;
    float core = exp(-r * r * 6.), halo = exp(-r * r * 1.6) * .35;
    gl_FragColor = vec4(color * (core * 1.6 + halo), (core + halo) * alpha);
  }`;
const smokeFragment = `
  varying vec3 color; varying float alpha;
  void main() {
    if (alpha <= 0.) discard;
    vec2 q = gl_PointCoord - .5; float r = length(q) * 2.;
    float puff = smoothstep(1., .15, r);
    gl_FragColor = vec4(color, puff * alpha * .55);
  }`;

class Pool {
  constructor(scene, capacity, additive) {
    this.capacity = capacity; this.head = 0; this.clock = 0;
    const g = new T.BufferGeometry();
    this.position = new T.Float32BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage);
    this.velocity = new T.Float32BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage);
    this.tint = new T.Float32BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage);
    this.size = new T.Float32BufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage);
    this.birth = new T.Float32BufferAttribute(new Float32Array(capacity).fill(-1e9), 1).setUsage(T.DynamicDrawUsage);
    this.life = new T.Float32BufferAttribute(new Float32Array(capacity).fill(1), 1).setUsage(T.DynamicDrawUsage);
    this.drag = new T.Float32BufferAttribute(new Float32Array(capacity).fill(1), 1).setUsage(T.DynamicDrawUsage);
    g.setAttribute('position', this.position); g.setAttribute('velocity', this.velocity); g.setAttribute('tint', this.tint);
    g.setAttribute('size', this.size); g.setAttribute('birth', this.birth); g.setAttribute('life', this.life); g.setAttribute('drag', this.drag);
    this.uniforms = { clock: { value: 0 }, ratio: { value: 1 }, gravity: { value: additive ? 9 : 2 } };
    this.material = new T.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: additive ? sparkFragment : smokeFragment,
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending });
    this.points = new T.Points(g, this.material); this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    this.color = new T.Color();
  }
  emit(x, y, z, { vx = 0, vy = 0, vz = 0, color = '#ffffff', size = 1, life = 1, drag = 1 }) {
    const i = this.head; this.head = (this.head + 1) % this.capacity;
    this.position.setXYZ(i, x, y, z); this.velocity.setXYZ(i, vx, vy, vz);
    this.color.set(color); this.tint.setXYZ(i, this.color.r, this.color.g, this.color.b);
    this.size.setX(i, size); this.birth.setX(i, this.clock); this.life.setX(i, life); this.drag.setX(i, drag);
    this.dirty = true;
  }
  update(dt, ratio) {
    this.clock += dt; this.uniforms.clock.value = this.clock; this.uniforms.ratio.value = ratio;
    if (!this.dirty) return; this.dirty = false;
    for (const a of [this.position, this.velocity, this.tint, this.size, this.birth, this.life, this.drag]) a.needsUpdate = true;
  }
  clear() { this.birth.array.fill(-1e9); this.birth.needsUpdate = true; }
}

const rnd = (a, b) => a + Math.random() * (b - a);
export class Particles {
  constructor(scene, reduced = false) {
    this.reduced = reduced;
    this.sparks = new Pool(scene, 1400, true);
    this.smoke = new Pool(scene, 320, false);
  }
  scale(n) { return this.reduced ? Math.ceil(n * .25) : n; }
  burst(x, y, z, { count = 16, color = '#ffe29a', color2 = color, speed = 14, size = 1.2, life = .7, up = 3, spread = 1, drag = 2.2 } = {}) {
    for (let i = 0; i < this.scale(count); i++) {
      const a = Math.random() * Math.PI * 2, b = (Math.random() - .5) * Math.PI * spread, v = speed * rnd(.35, 1);
      this.sparks.emit(x, y, z, { vx: Math.cos(a) * Math.cos(b) * v, vy: Math.sin(b) * v + up, vz: Math.sin(a) * Math.cos(b) * v,
        color: Math.random() < .5 ? color : color2, size: size * rnd(.6, 1.4), life: life * rnd(.6, 1.3), drag });
    }
  }
  coin(x, y, z) {
    this.burst(x, y, z, { count: 18, color: '#ffe9a6', color2: '#ffb347', speed: 11, size: 1.1, life: .6, up: 4 });
    this.sparks.emit(x, y, z, { color: '#fff7d6', size: 5, life: .28, drag: 0 });
  }
  explosion(x, y, z, scale = 1, hot = '#ffb27a', cold = '#ff5a3c') {
    this.burst(x, y, z, { count: 40, color: hot, color2: cold, speed: 22 * scale, size: 1.5 * scale, life: .85, up: 5, drag: 1.8 });
    this.burst(x, y, z, { count: 14, color: '#fff2c9', color2: '#ffd8a0', speed: 34 * scale, size: .8, life: .5, up: 2, drag: 1.2 });
    this.sparks.emit(x, y, z, { color: '#fff4e0', size: 16 * scale, life: .22, drag: 0 });
    for (let i = 0; i < this.scale(10); i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(2, 7) * scale;
      this.smoke.emit(x, y, z, { vx: Math.cos(a) * v, vy: rnd(2, 6), vz: Math.sin(a) * v, color: Math.random() < .5 ? '#3a2b33' : '#5a4448', size: rnd(4, 8) * scale, life: rnd(.9, 1.6), drag: 2.5 });
    }
  }
  thrust(x, y, z, vx, vy, vz, energy = 1, color = '#79efff') {
    // Engine exhaust: emitted every frame while boosting, trailing opposite to travel.
    for (let i = 0; i < this.scale(3); i++) {
      this.sparks.emit(x + rnd(-.3, .3), y + rnd(-.3, .3), z + rnd(-.2, .2), { vx: -vx * .15 + rnd(-3, 3), vy: -vy * .15 + rnd(-2, 2), vz: -vz * .15 + rnd(-3, 3),
        color: Math.random() < .3 ? '#ffffff' : color, size: rnd(.7, 1.6) * energy, life: rnd(.25, .55), drag: 3 });
    }
  }
  ambient(x, y, z, color) {
    // Slow drifting motes that sell depth in the cyberspace sections.
    this.sparks.emit(x, y, z, { vx: rnd(-1, 1), vy: rnd(-.5, 1), vz: rnd(-1, 1), color, size: rnd(.4, 1), life: rnd(1.5, 3), drag: .4 });
  }
  update(dt, ratio = 1) { this.sparks.update(dt, ratio); this.smoke.update(dt, ratio); }
  reset() { this.sparks.clear(); this.smoke.clear(); }
}
