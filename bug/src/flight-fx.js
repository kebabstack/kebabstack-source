import * as T from 'three';
import { ascentAt, altitudeAt } from './physics.js';

const MAX = 90;
export class FlightFX {
  constructor(scene) {
    this.scene = scene; this.time = 0; this.history = []; this.boostUntil = 0; this.clock = 0;
    this.ribbons = [];
    for (const color of ['#58e7ff', '#ed80ff']) {
      const geo = new T.BufferGeometry(), uv = [], indices = [];
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(MAX * 2 * 3), 3));
      geo.setAttribute('power', new T.BufferAttribute(new Float32Array(MAX * 2), 1));
      for (let i = 0; i < MAX; i++) { uv.push(0, i / (MAX - 1), 1, i / (MAX - 1)); if (i < MAX - 1) { const a = i * 2; indices.push(a,a+1,a+2,a+1,a+3,a+2); } }
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.setDrawRange(0, 0);
      const material = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
        uniforms: { color: { value: new T.Color(color) } },
        vertexShader: 'attribute float power; varying vec2 tex;varying float energy;void main(){tex=uv;energy=power;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'varying vec2 tex;varying float energy;uniform vec3 color;void main(){float crossFade=pow(max(0.,1.-abs(tex.x*2.-1.)),1.5);float core=pow(crossFade,5.);vec3 light=mix(color*1.6,vec3(2.2),core*.75);gl_FragColor=vec4(light,crossFade*energy*.85);}' });
      const mesh = new T.Mesh(geo, material); mesh.frustumCulled = false; scene.add(mesh); this.ribbons.push(mesh);
    }
    const boltGeometry = new T.CylinderGeometry(1, 1, 1, 6);
    const beamMaterial = new T.MeshBasicMaterial({ color: new T.Color('#79efff').multiplyScalar(2.4) });
    const shellMaterial = new T.MeshBasicMaterial({ color: '#51caff', transparent: true, opacity: .25, depthWrite: false, blending: T.AdditiveBlending });
    this.bolts = [];
    for (let i = 0; i < 6; i++) {
      const g = new T.Group();
      const beam = new T.Mesh(boltGeometry, beamMaterial); beam.scale.set(.105, 7, .105); g.add(beam);
      const halo = new T.Mesh(boltGeometry, shellMaterial); halo.scale.set(.3, 9, .3); g.add(halo);
      g.visible = false; scene.add(g); this.bolts.push(g);
    }
    this.enemyBolts = [];
    const pulseGeo = new T.SphereGeometry(1,16,12), pulseRing = new T.TorusGeometry(.65,.07,6,32);
    const pink = new T.MeshBasicMaterial({color:new T.Color('#ff3cbd').multiplyScalar(1.5)});
    const core = new T.MeshBasicMaterial({color:'#fff0fb'});
    const haze = new T.MeshBasicMaterial({color:'#ff47c5',transparent:true,opacity:.18,depthWrite:false});
    for (let i=0;i<4;i++) {
      const group=new T.Group();
      const shell=new T.Mesh(pulseGeo,pink);shell.scale.set(.48,.48,3.2);group.add(shell);
      const center=new T.Mesh(pulseGeo,core);center.position.z=2.8;center.scale.setScalar(.4);group.add(center);
      const halo=new T.Mesh(pulseGeo,haze);halo.scale.set(.85,.85,4.2);group.add(halo);
      group.add(new T.Mesh(pulseRing,pink));group.visible=false;scene.add(group);this.enemyBolts.push(group);
    }
    this.waves = [];
    const waveGeo = new T.TorusGeometry(1, .035, 6, 80);
    for (let i = 0; i < 4; i++) {
      const material = new T.MeshBasicMaterial({ color: '#6ff8ff', transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
      const mesh = new T.Mesh(waveGeo, material); mesh.visible = false; scene.add(mesh); this.waves.push({ mesh, life: 0, duration: 1 });
    }
    const reticleGeo = new T.BufferGeometry(); const points = [];
    for (let sx of [-1, 1]) for (let sy of [-1, 1]) points.push(sx*4,sy*3.5,0, sx*2.5,sy*3.5,0, sx*4,sy*3.5,0, sx*4,sy*2,0);
    reticleGeo.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    this.reticle = new T.LineSegments(reticleGeo, new T.LineBasicMaterial({ color: '#94ffe2', transparent: true, opacity: .9 })); this.reticle.visible = false; scene.add(this.reticle);
  }
  reset() {
    this.history.length = 0; this.boostUntil = 0; this.clock = 0;
    for (const r of this.ribbons) { r.visible = false; r.geometry.setDrawRange(0, 0); }
    for (const b of this.bolts) b.visible = false;
    for (const b of this.enemyBolts) b.visible = false;
    for (const wave of this.waves) { wave.life = 0; wave.mesh.visible = false; }
    this.reticle.visible = false;
  }
  wave(x, y, d, color, duration) {
    const wave = this.waves.find(w => w.life <= 0) || this.waves[0];
    wave.life = duration; wave.duration = duration; wave.mesh.position.set(x, y, -d);
    wave.mesh.material.color.set(color); wave.mesh.visible = true;
  }
  event(e, run, reduced) {
    if (e.kind === 'boost' || e.kind === 'fusion' || e.kind === 'overdrive') {
      this.boostUntil = this.time + 2.2;
      if (!reduced) this.wave(run.x, altitudeAt(run), run.d + 2, e.kind==='overdrive'?'#ffd783':'#70f2ff', .7);
    }
    if (['destroy','ghost-destroy','mine-destroy','mine-hit'].includes(e.kind) && !reduced) this.wave(e.x, e.y + ascentAt(e.d), e.d, e.kind==='ghost-destroy'?'#ff79e5':'#ff946d', .55);
    if (['ghost-shot','ghost-hit'].includes(e.kind) && !reduced) this.wave(e.x,e.y+ascentAt(e.d),e.d,'#ff4cc8',e.kind==='ghost-hit'?.4:.22);
  }
  update(run, dt, reduced, target) {
    this.time += dt;
    const driving=run.flow.active>0;
    const energy = driving?1.12:Math.max(0, Math.min(1, (this.boostUntil - this.time) / .6));
    if (run.phase === 'flying' && dt > 0) {
      this.clock += dt;
      if (this.clock >= 1 / 60) {
        this.clock %= 1 / 60;
        this.history.unshift({ x: run.x, y: altitudeAt(run) + .3, z: -run.d + 1.4, time: this.time, energy });
      }
    }
    this.history = this.history.filter(p => this.time - p.time < 1.45).slice(0, MAX);
    this.ribbons.forEach((mesh, side) => {
      mesh.material.uniforms.color.value.set(driving?(side?'#ffae57':'#6effe9'):(side?'#ed80ff':'#58e7ff'));
      mesh.visible = run.phase === 'flying' && this.history.length > 1;
      const position = mesh.geometry.attributes.position, power = mesh.geometry.attributes.power;
      this.history.forEach((p, i) => {
        const age = this.time - p.time, taper = Math.max(0, 1 - age / 1.45), sign = side ? 1 : -1;
        const width = (.09 + p.energy * (reduced ? .35 : .85)) * taper;
        const x = p.x + sign * (1.12 + (reduced ? 0 : age * p.energy * 2.1));
        const y = p.y + (reduced ? 0 : Math.sin(age * 8 + side) * age * p.energy * .65);
        position.setXYZ(i * 2, x - width, y, p.z); position.setXYZ(i * 2 + 1, x + width, y, p.z);
        const intensity = (p.energy * .92 + .08) * taper * taper;
        power.setX(i * 2, intensity); power.setX(i * 2 + 1, intensity);
      });
      position.needsUpdate = true; power.needsUpdate = true; mesh.geometry.setDrawRange(0, Math.max(0, this.history.length - 1) * 6);
    });
    for (let i = 0; i < this.bolts.length; i++) {
      const mesh = this.bolts[i], shot = run.projectiles[i]; mesh.visible = Boolean(shot);
      if (!shot) continue;
      mesh.position.set(shot.x, shot.y, -shot.d);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0), new T.Vector3(shot.vx,shot.vy,-shot.vd).normalize());
    }
    for (let i=0;i<this.enemyBolts.length;i++) {
      const mesh=this.enemyBolts[i],shot=run.ghost.shots[i];mesh.visible=Boolean(shot)&&run.phase==='flying';
      if(!shot)continue;
      mesh.position.set(shot.x,shot.y+ascentAt(shot.d),-shot.d);
      // The pulse faces along the route towards the bug, remaining readable even
      // when both combatants move forward quickly.
      const slope=ascentAt(shot.d+.5)-ascentAt(shot.d-.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(shot.vx,shot.vy+shot.vd*slope,-shot.vd).normalize());
    }
    this.reticle.visible = Boolean(target) && run.phase === 'flying' && !run.hits.has(target.id);
    this.reticle.material.color.set(target?.kind==='ghost'?'#ff9ce8':target?.kind==='mine'?'#ff795a':'#94ffe2');
    if (this.reticle.visible) this.reticle.position.set(target.x, target.y + ascentAt(target.d), -target.d + 1.4);
    for (const wave of this.waves) {
      wave.life = Math.max(0, wave.life - dt); wave.mesh.visible = wave.life > 0 && !reduced;
      if (!wave.mesh.visible) continue;
      const t = 1 - wave.life / wave.duration; wave.mesh.scale.setScalar(2 + t * 16);
      wave.mesh.material.opacity = (1 - t) ** 2 * .8;
    }
  }
}
