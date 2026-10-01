import * as T from 'three';
import { ShaderPass } from './vendor/addons/postprocessing/ShaderPass.js';

// One full-screen pass after bloom: speed streaks toward the horizon while
// boosting, a touch of chromatic aberration at high energy, a soft vignette
// and a short tinted flash on hits or pickups. Everything is driven from
// uniforms, so the HUD and physics never know about it.
export const FlightShader = {
  uniforms: {
    tDiffuse: { value: null },
    streak: { value: 0 },      // 0..1 radial blur strength
    aberration: { value: 0 },  // 0..1 channel split
    vignette: { value: .22 },
    flash: { value: new T.Vector4(1, 1, 1, 0) }, // rgb + alpha
    center: { value: new T.Vector2(.5, .46) },
    clock: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float streak; uniform float aberration; uniform float vignette; uniform vec4 flash; uniform vec2 center; uniform float clock;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 toCenter = center - vUv; float dist = length(toCenter);
      vec3 color;
      if (streak > .002) {
        // Radial samples biased outward: the edges smear, the bug stays sharp.
        float amount = streak * .075 * smoothstep(.12, .6, dist);
        float jitter = hash(vUv * 900. + clock) * .5;
        color = vec3(0.);
        for (int i = 0; i < 8; i++) {
          float t = (float(i) + jitter) / 8.;
          color += texture2D(tDiffuse, vUv + toCenter * amount * t).rgb;
        }
        color /= 8.;
      } else color = texture2D(tDiffuse, vUv).rgb;
      if (aberration > .002) {
        vec2 shift = toCenter * aberration * .011 * dist;
        color.r = mix(color.r, texture2D(tDiffuse, vUv - shift).r, .85);
        color.b = mix(color.b, texture2D(tDiffuse, vUv + shift).b, .85);
      }
      float v = smoothstep(.95, .25, dist * (1. + vignette * .4));
      color *= mix(1. - vignette, 1., v);
      color = mix(color, flash.rgb, flash.a);
      gl_FragColor = vec4(color, 1.);
    }`
};

export class FlightPostFX {
  constructor() {
    this.pass = new ShaderPass(FlightShader);
    this.streak = 0; this.aberration = 0; this.flash = { r: 1, g: 1, b: 1, a: 0 }; this.enabledFlag = true;
    this.targetStreak = 0; this.time = 0;
  }
  hit(color = '#ff5a3c', strength = .35) { const c = new T.Color(color); this.flash = { r: c.r, g: c.g, b: c.b, a: strength }; }
  update(dt, { streak = 0, aberration = 0, reduced = false }) {
    this.time += dt;
    const k = 1 - Math.exp(-dt * 7);
    this.streak += ((reduced ? 0 : streak) - this.streak) * k;
    this.aberration += ((reduced ? 0 : aberration) - this.aberration) * k;
    this.flash.a = Math.max(0, this.flash.a - dt * 2.4);
    const u = this.pass.uniforms;
    u.streak.value = this.streak; u.aberration.value = this.aberration; u.clock.value = this.time;
    u.flash.value.set(this.flash.r, this.flash.g, this.flash.b, this.flash.a);
    this.pass.enabled = this.enabledFlag;
  }
}
