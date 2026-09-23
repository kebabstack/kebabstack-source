import * as T from './vendor/three.module.js';
import { seededRandom, clamp } from './physics.js';
import { CelestialCrew } from './celestial-crew.js';
import { EventHorizon } from './event-horizon.js';
import { WebbBackdrop } from './webb-backdrop.js';

const noise = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.27,.41));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float f=0.;f+=.5*n3(p);p=p*2.03+7.;f+=.25*n3(p);p=p*2.01+13.;f+=.125*n3(p);return f;}`;
const sphereVertex = `varying vec3 p; varying vec3 vn; varying vec3 vp;
void main(){p=position;vn=normalize(normalMatrix*normal);vp=(modelViewMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*vec4(vp,1.);}`;

// Procedural 3D surfaces and particles over locally bundled Webb photographs.
export function createStellarSky(scene) {
  const webb = new WebbBackdrop(scene);
  const crew = new CelestialCrew(scene);
  const horizon = new EventHorizon(scene);
  const phase = { value: 0 }, time = { value: 0 };
  const skyMat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false,
    uniforms: { phase, time }, vertexShader: 'varying vec3 d; void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `${noise} varying vec3 d; uniform float phase; uniform float time;
    void main(){vec3 v=normalize(d);float h=smoothstep(-.25,.8,v.y);
      vec3 day=mix(vec3(.28,.29,.42),vec3(.035,.075,.17),h);
      day+=vec3(.20,.085,.045)*pow(max(0.,1.-abs(v.y+.035)*4.),4.);
      vec3 q=v*4.;float warp=fbm(q*1.4+1.5);float cloud=fbm(q*3.+warp*4.);
      float spine=abs(v.y*.82+v.x*.45+.02+(warp-.4)*.45);
      float band=exp(-spine*spine*20.);float dust=smoothstep(.22,.65,cloud);
      float filaments=pow(max(0.,1.-abs(cloud-.46)*6.),5.);
      vec3 color=vec3(.006,.009,.032);
      color+=band*(mix(vec3(.10,.025,.25),vec3(.02,.21,.31),smoothstep(-.5,.55,v.x))*dust*2.1);
      color+=band*filaments*mix(vec3(.24,.04,.23),vec3(.09,.20,.3),warp)*.22;
      color+=pow(max(0.,1.-length(v-vec3(-.6,.27,-.8))*.9),5.)*vec3(.19,.035,.21);
      color*=1.-smoothstep(.52,.72,fbm(q*4.))*band*.55;
      vec3 dusk=mix(day,vec3(.35,.17,.35),.5);
      gl_FragColor=vec4(mix(mix(day,dusk,smoothstep(0.,.45,phase)),color,smoothstep(.15,1.,phase)),1.);
    }` });
  const dome = new T.Mesh(new T.SphereGeometry(1250, 32, 16), skyMat); dome.renderOrder = -20; scene.add(dome);
  const rng = seededRandom(30102026), positions = [], colors = [], sizes = [], twinkles = [];
  for (let i = 0; i < 4700; i++) {
    const a = rng() * Math.PI * 2; let y = rng() * 2 - 1;
    if (i > 3200) y = Math.sin(a) * -.3 + (rng() - .5) * .18;
    const r = Math.sqrt(1 - y * y) * 1150;
    positions.push(Math.cos(a) * r, y * 1150, Math.sin(a) * r);
    const c = new T.Color(i % 11 === 0 ? '#ffbbad' : i % 3 ? '#d1e5ff' : '#a29cff'); colors.push(c.r, c.g, c.b);
    sizes.push(i % 127 === 0 ? 12 + rng() * 7 : 1.1 + rng() * 3); twinkles.push(rng() * 6.28);
  }
  const starsGeo = new T.BufferGeometry();
  starsGeo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); starsGeo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  starsGeo.setAttribute('size', new T.Float32BufferAttribute(sizes, 1)); starsGeo.setAttribute('seed', new T.Float32BufferAttribute(twinkles, 1));
  const stars = new T.Points(starsGeo, new T.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true, blending: T.AdditiveBlending,
    uniforms: { phase, time, webbFade: webb.uniforms.opacity, ratio: { value: Math.min(devicePixelRatio, 1.4) } },
    vertexShader: `attribute float size;attribute float seed; varying vec3 tint;varying float brightness;uniform float time;uniform float ratio;
      void main(){tint=color;brightness=.72+.28*sin(time*.5+seed);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*ratio;}`,
    fragmentShader: `varying vec3 tint;varying float brightness;uniform float phase;uniform float webbFade;
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p);float star=exp(-r*r*60.)+.22*exp(-r*r*9.);
        star+=max(0.,1.-abs(p.x)*55.)*max(0.,1.-abs(p.y)*2.)*.33;
        star+=max(0.,1.-abs(p.y)*55.)*max(0.,1.-abs(p.x)*2.)*.33;
        gl_FragColor=vec4(tint*1.7,star*brightness*phase*(1.-webbFade*.65));}` }));
  scene.add(stars);

  const bodies = new T.Group(); scene.add(bodies);
  const sphere = new T.SphereGeometry(1, 64, 40);
  function planet(radius, palette, rocky = false) {
    const group = new T.Group(); bodies.add(group);
    const surface = new T.Mesh(sphere, new T.ShaderMaterial({ transparent: true, uniforms: { phase, time, low: { value: new T.Color(palette[0]) }, high: { value: new T.Color(palette[1]) }, rocky: { value: rocky ? 1 : 0 } }, vertexShader: sphereVertex,
      fragmentShader: `${noise} varying vec3 p;varying vec3 vn;varying vec3 vp;uniform float phase;uniform float time;uniform vec3 low;uniform vec3 high;uniform float rocky;
      void main(){vec3 n=normalize(p);float angle=time*.014;vec3 q=vec3(n.x*cos(angle)+n.z*sin(angle),n.y,-n.x*sin(angle)+n.z*cos(angle));
        float turbulence=fbm(q*7.);float bands=sin(q.y*42.+turbulence*4.+sin(q.x*9.)*.18)*.5+.5;
        float storms=fbm(q*17.+turbulence*3.);float pattern=mix(bands*.65+storms*.35,storms,rocky);
        vec3 color=mix(low,high,smoothstep(.05,.98,.22+pattern*.62));
        float light=clamp(dot(n,normalize(vec3(-.6,.45,.7))),0.,1.);
        color*=.07+.93*pow(light,.68);
        float cracks=pow(max(0.,1.-abs(storms-.42)*32.),3.)*rocky;
        color+=cracks*vec3(.62,.06,.17)*(1.-light)*.65;
        float rim=pow(1.-max(0.,dot(normalize(vn),normalize(-vp))),3.);
        color+=high*rim*.33;gl_FragColor=vec4(color,phase);
      }` })); surface.scale.setScalar(radius); group.add(surface);
    const air = new T.Mesh(sphere, new T.ShaderMaterial({ side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { phase, color: { value: new T.Color(palette[1]) } }, vertexShader: sphereVertex,
      fragmentShader: 'varying vec3 vn;varying vec3 vp;uniform vec3 color;uniform float phase;void main(){float rim=pow(1.-abs(dot(normalize(vn),normalize(-vp))),2.8);gl_FragColor=vec4(color*1.7,rim*phase*.85);}' }));
    air.scale.setScalar(radius * 1.035); group.add(air); return group;
  }
  function disk(inner, outer, color, blackHole = false) {
    return new T.Mesh(new T.RingGeometry(inner, outer, 160), new T.ShaderMaterial({ side: T.DoubleSide, transparent: true, depthWrite: false,
      uniforms: { phase, time, color: { value: new T.Color(color) }, inner: { value: inner }, outer: { value: outer }, hot: { value: blackHole ? 1 : 0 } },
      vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 p;uniform float phase;uniform float time;uniform vec3 color;uniform float inner;uniform float outer;uniform float hot;
      void main(){float r=length(p.xy);float t=(r-inner)/(outer-inner);float a=atan(p.y,p.x);
      float stripe=.42+.58*pow(.5+.5*sin(r*1.8+sin(r*.27)*4.),2.);
      float gap=1.-smoothstep(.43,.46,t)*(1.-smoothstep(.49,.52,t));
      float edge=smoothstep(0.,.07,t)*(1.-smoothstep(.88,1.,t));
      float swirl=.75+.25*sin(a*3.-time*.17+r*.12);
      vec3 c=mix(color,color*2.8+vec3(.6,.18,.04),hot*pow(1.-t,2.));
      gl_FragColor=vec4(c,stripe*gap*edge*phase*mix(.8,swirl,hot));}` }));
  }
  const giant = planet(170, ['#48335c', '#e9bd97']);
  const rings = disk(212, 326, '#bcabd9'); rings.rotation.set(1.13, -.17, .17); giant.add(rings);
  giant.rotation.z = -.18;
  const moon = planet(65, ['#160f38', '#ca6dba'], true);
  const earth = planet(105, ['#0b3b53', '#70cabc'], true);

  const comets = [];
  for (let i = 0; i < 3; i++) {
    const geo = new T.BufferGeometry(); const p = new Float32Array(24 * 3), c = [];
    for (let j = 0; j < 24; j++) { const strength = (1 - j / 24) ** 2; c.push(.5 * strength, .8 * strength, strength); }
    geo.setAttribute('position', new T.BufferAttribute(p, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(c, 3));
    const line = new T.Line(geo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false })); line.frustumCulled = false; scene.add(line); comets.push(line);
  }
  return { update(camera, distance, clock, reduced = false) {
    phase.value = clamp((distance - 150) / 580, 0, 1); time.value = reduced ? 0 : clock;
    dome.position.copy(camera.position); stars.position.copy(camera.position); bodies.position.copy(camera.position);
    bodies.visible = phase.value > .01;
    // Slight parallax as you travel, with the center of the route kept clear.
    const drift = Math.sin(distance / 2400) * 35;
    giant.position.set(-420 + drift, 160, -900);
    // Keep the right horizon reserved for the waving astronaut's silhouette.
    moon.position.set(-570 + drift, -180, -1030);
    earth.position.set(-240, -380, -1030);
    comets.forEach((line, i) => {
      const t = ((clock + i * 12) % 36) / 1.8;
      line.visible = !reduced && phase.value > .5 && t < 1;
      if (!line.visible) return;
      const attr = line.geometry.attributes.position;
      const halfH=Math.tan(camera.fov*Math.PI/360)*900,halfW=halfH*camera.aspect,side=i%2?1:-1;
      for (let j = 0; j < 24; j++) { const u = t - j * .006; attr.setXYZ(j, side*(.96-u*.38)*halfW, (.72-u*.18)*halfH, -900); }
      attr.needsUpdate = true; line.position.copy(camera.position);line.quaternion.copy(camera.quaternion);
      line.material.opacity = Math.sin(t * Math.PI) * phase.value*.65;
    });
    webb.update(camera,distance,clock,reduced);
    crew.update(camera,distance,clock,reduced);
    horizon.update(camera,distance,clock,reduced);
  }, dispose(){webb.dispose();} };
}
