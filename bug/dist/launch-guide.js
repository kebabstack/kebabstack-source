import * as T from 'three';
import { START_HEIGHT, GRAVITY, ascentAt } from './physics.js';

// A screen-width ribbon stays legible on a phone where native WebGL lines are 1px.
export class LaunchGuide {
  constructor(scene) {
    this.samples = 64;
    const geometry = new T.BufferGeometry(), uv = [], indices = [];
    for (const name of ['position', 'ahead']) geometry.setAttribute(name,
      new T.BufferAttribute(new Float32Array((this.samples + 1) * 6), 3).setUsage(T.DynamicDrawUsage));
    for (let i = 0; i <= this.samples; i++) {
      uv.push(-1, i / this.samples, 1, i / this.samples);
      if (i < this.samples) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    this.material = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { resolution: { value: new T.Vector2(1, 1) }, width: { value: 8 }, time: { value: 0 }, motion: { value: 1 } },
      vertexShader: `attribute vec3 ahead; uniform vec2 resolution; uniform float width; varying vec2 tex;
        void main() { tex=uv; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
          vec4 q=projectionMatrix*modelViewMatrix*vec4(ahead,1.);
          vec2 delta=(q.xy/q.w-p.xy/p.w)*resolution; vec2 normal=vec2(-delta.y,delta.x)/max(length(delta),.0001);
          p.xy+=normal*width/resolution*uv.x*p.w; gl_Position=p; }`,
      fragmentShader: `uniform float time; uniform float motion; varying vec2 tex;
        void main() { float edge=abs(tex.x); float core=1.-smoothstep(.42,.63,edge);
          float pulse=.5+.5*sin(tex.y*20.-time*4.*motion);
          vec3 ink=vec3(.003,.016,.04); vec3 light=mix(vec3(.08,.85,.9),vec3(.75,1.,.72),pulse*motion);
          float alpha=(1.-smoothstep(.84,1.,edge))*smoothstep(0.,.025,tex.y)*(1.-smoothstep(.92,1.,tex.y));
          gl_FragColor=vec4(mix(ink,light,core),alpha); }` });
    this.mesh = new T.Mesh(geometry, this.material); this.mesh.frustumCulled = false;
    this.mesh.name = 'Pulsing launch trajectory'; scene.add(this.mesh);
  }
  update(run, time, reduced, width, height) {
    this.mesh.visible = ['ready', 'charging'].includes(run.phase);
    if (!this.mesh.visible) return;
    this.material.uniforms.resolution.value.set(Math.max(1, width), Math.max(1, height));
    this.material.uniforms.width.value = width < 650 ? 10 : 8;
    this.material.uniforms.time.value = time; this.material.uniforms.motion.value = reduced ? 0 : 1;
    const charge = run.phase === 'charging' ? run.charge : .6;
    const power = 47 + 35 * charge + (charge >= .94 ? 7 : 0), angle = run.angle * Math.PI / 180;
    const point = t => { const d = Math.cos(angle) * power * t;
      return [0, START_HEIGHT + Math.sin(angle) * power * .72 * t - GRAVITY * .5 * t * t + ascentAt(d), -d]; };
    for (let i = 0; i <= this.samples; i++) {
      const t = i / this.samples * 2.1, p = point(t), q = point(t + .01);
      for (let side = 0; side < 2; side++) {
        this.mesh.geometry.attributes.position.setXYZ(i * 2 + side, ...p);
        this.mesh.geometry.attributes.ahead.setXYZ(i * 2 + side, ...q);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.ahead.needsUpdate = true;
  }
}
