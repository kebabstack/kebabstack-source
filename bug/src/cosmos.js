import { createStellarSky } from './stellar.js';
import * as T from './vendor/three.module.js';
import { ascentAt, seededRandom, zoneIndex, ZONES, clamp } from './physics.js';

// All landmarks are authored geometry. Nothing is loaded from an image CDN.
export function createCosmosKit({ V, shape, bar, label, mat, infinity }) {
  const edgeClock={value:0};
  const edgeMaterial=new T.ShaderMaterial({fog:true,uniforms:{clock:edgeClock,...T.UniformsUtils.clone(T.UniformsLib.fog)},
    vertexShader:`varying float distanceAlong;
      #include <fog_pars_vertex>
      void main(){vec4 mvPosition=modelViewMatrix*vec4(position,1.);distanceAlong=-position.z;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float clock;varying float distanceAlong;
      #include <fog_pars_fragment>
      void main(){float phase=distanceAlong*.011-clock*.32;vec3 spectrum=.5+.5*cos(phase+vec3(0.,2.094,4.188));
        vec3 color=mix(vec3(.015,.10,.16),pow(spectrum,vec3(3.)),.9);float breathe=1.20+.10*sin(clock*.9-distanceAlong*.008);
        gl_FragColor=vec4(color*breathe,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`});
  const update=(clock,reduced)=>{edgeClock.value=reduced?0:clock;};
  const glow = (color, intensity = 1.25) => mat(color, { emissive: color, emissiveIntensity: intensity, roughness: .36, metalness: .35 });
  const tube = (g, points, color, radius = .15) => {
    const mesh = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), Math.max(16, points.length * 3), radius, 5, false), glow(color));
    g.add(mesh); return mesh;
  };
  function capsule(g, x, y, z, s = 1) {
    const unit = new T.Group(); unit.position.set(x, y, z); unit.scale.setScalar(s); g.add(unit);
    shape(unit, 'cylinder', mat('#263d61', { metalness: .7, roughness: .25 }), 0, 0, 0, 2.5, 6, 2.5);
    for (const h of [-3, 3]) {
      shape(unit, 'sphere', '#42618a', 0, h, 0, 2.5, .8, 2.5);
      const rim = shape(unit, 'ring', glow('#56defb'), 0, h, 0, 2.55); rim.rotation.x = Math.PI / 2;
    }
    for (const x of [-1, 0, 1]) shape(unit, 'box', glow('#6dfcce', 1.3), x, 0, 2.47, .3, 2.4, .09);
    unit.userData.float = { y, phase: x }; return unit;
  }
  function key(g, size = 1) {
    const ink = glow('#85ffcc');
    shape(g, 'ring', ink, 0, 1.6, 0, 1.3);
    shape(g, 'box', ink, 0, -.8, 0, .45, 3, .45);
    shape(g, 'box', ink, .6, -1.1, 0, 1.2, .4, .45);
    shape(g, 'box', ink, .6, -2, 0, 1.2, .4, .45);
    g.scale.setScalar(size);
  }
  function chain(g, s = 1) {
    const nodes = [V(-5, 0, 0), V(0, 4, 0), V(5, 0, 0)];
    for (let i = 0; i < 3; i++) bar(g, nodes[i], nodes[(i + 1) % 3], .13, glow('#78cfff'));
    const btc = shape(g, 'cylinder', glow('#f49b48', 1.1), -5, 0, 0, 1.6, .3, 1.6); btc.rotation.x = Math.PI / 2;
    label(g, '₿', 2.2, -5, 0, .25, { bg: null, size: 160, height: 1, fg: '#fff5de' });
    shape(g, 'diamond', glow('#b3c1ff', 1.2), 0, 4, 0, 1.2, 2, .9);
    infinity(g, 5, 0, .1, .85, true);
    g.scale.setScalar(s);
  }
  function neuron(g, s = 1) {
    const points = [V(0, 0, 0), V(-3, 2, 0), V(3, 2, -1), V(0, 4, 1), V(-2, -3, -1), V(3, -2, 1)];
    for (let i = 1; i < points.length; i++) {
      bar(g, points[0], points[i], .11, glow('#ff77bb'));
      shape(g, 'sphere', glow('#fface1'), ...points[i].toArray(), .45);
    }
    shape(g, 'sphere', glow('#ffe0f4'), 0, 0, 0, 1);
    g.scale.setScalar(s);
  }
  function emblem(kind, g) {
    if (kind === 'compiler') {
      shape(g, 'tetra', mat('#8456d4', { emissive: '#45248c', emissiveIntensity: .5, metalness: .55, roughness: .3 }), 0, 0, 0, 2.7);
      label(g, '{ }', 4, 0, 0, 2.6, { bg: null, fg: '#e9d3ff', size: 150, height: .7 });
      const r = shape(g, 'ring', glow('#c998ff'), 0, 0, 0, 3.6); r.rotation.y = .35;
    } else if (kind === 'canister') capsule(g, 0, 0, 0, .6);
    else if (kind === 'identity') key(g);
    else if (kind === 'oisy') {
      shape(g, 'sphere', mat('#695aad', { metalness: .75, roughness: .16, emissive: '#6752bc', emissiveIntensity: .6 }), 0, 0, 0, 2);
      const ring = shape(g, 'ring', glow('#cabaff'), 0, 0, 0, 2.9); ring.rotation.x = .65;
      label(g, 'OISY', 3.5, 0, 0, 2.2, { bg: null, size: 105, height: .4 });
    } else if (kind === 'fusion') chain(g, .62);
    else if (kind === 'neuron') neuron(g, .8);
  }
  function world(chunk, day) {
    const g = new T.Group(), start = chunk * 200, random = seededRandom(day ^ (chunk + 100) * 9257);
    const zone = ZONES[zoneIndex(start + 100)], color = zone.color;
    const landmark = zoneIndex(start + 100) !== zoneIndex(start - 100);
    // The rising data stream is also the collision floor: simulation y is height above it.
    if (chunk >= 0) {
      const positions = [];
      for (let i = 0; i < 20; i++) {
        const a = Math.max(105, start + i * 10), b = start + (i + 1) * 10;
        if (b <= 105) continue;
        const ay = ascentAt(a) - .08, by = ascentAt(b) - .08;
        positions.push(-37, ay, -a, 37, ay, -a, -37, by, -b, 37, ay, -a, 37, by, -b, -37, by, -b);
      }
      const floor = new T.BufferGeometry(); floor.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); floor.computeVertexNormals();
      g.add(new T.Mesh(floor, mat('#151935', { roughness: .52, metalness: .3, transparent: true, opacity: .88, side: T.DoubleSide })));
      for (const x of [-37, -18.5, 0, 18.5, 37]) {
        const pts = [];
        for (let i = 0; i <= 20; i++) { const d = Math.max(105, start + i * 10); pts.push(V(x, ascentAt(d) + .12, -d)); }
        const edge=tube(g, pts, Math.abs(x) === 37 ? color : '#3d628e', Math.abs(x) === 37 ? .16 : .065);
        if(Math.abs(x)===37)edge.material=edgeMaterial;
      }
      for (let i = 0; i < 10; i++) {
        const d = start + i * 20;
        if (d < 110) continue;
        bar(g, V(-37, ascentAt(d), -d), V(37, ascentAt(d), -d), .045, glow('#3b719b', .8));
      }
    }
    if (chunk < 1) return g;
    // A constellation of compute nodes accompanies the corridor; never an obstacle.
    for (let side of [-1, 1]) {
      const nodes = [];
      for (let i = 0; i < 5; i++) {
        const d = start + i * 44, p = V(side * (52 + random() * 55), ascentAt(d) + 15 + random() * 70, -d);
        nodes.push(p);
        shape(g, 'tetra', glow(i % 2 ? color : '#63b9fa', 1.15), ...p.toArray(), 1.2 + random() * 1.7);
        if (i) bar(g, nodes[i - 1], p, .085, glow(color, .8));
      }
    }
    if (chunk < 4) {
      // Rounded clouds surround the ascent; the city remains below them.
      for (let i = 0; i < 5; i++) {
        const d = start + random() * 200, side = i % 2 ? -1 : 1;
        const x = side * (85 + random() * 100), y = 90 + random() * 45;
        for (let p = 0; p < 3; p++) shape(g, 'sphere', mat('#e7dbea', { transparent: true, opacity: .55, depthWrite: false }), x + p * 13, y + random() * 6, -d, 25, 9, 15);
      }
    }
    const d = start + 205, h = ascentAt(d);
    // Large chapter-specific architecture, offset from the playable lane.
    if (landmark) {
    if (zone.key === 'caffeine') {
      const cup = new T.Group(); cup.position.set(-63, h + 28, -d); g.add(cup);
      shape(cup, 'cylinder', '#f2dac1', 0, 0, 0, 13, 20, 13);
      shape(cup, 'cylinder', '#442635', 0, 10.2, 0, 11.5, .3, 11.5);
      const handle = shape(cup, 'ring', glow('#ffc581', .8), 14, 1, 0, 8); handle.rotation.y = Math.PI / 2;
      label(cup, 'caffeine', 23, 0, 1, 13.1, { bg: null, fg: '#664127', size: 110 });
      for (let i = 0; i < 3; i++) tube(cup, [V(-5 + i * 5, 12, 0), V(-8 + i * 5, 23, 0), V(-3 + i * 5, 33, 0)], '#ffc581', .45);
    } else if (zone.key === 'motoko') {
      for (let side of [-1, 1]) {
        const prism = shape(g, 'tetra', mat('#443075', { metalness: .55, roughness: .3, emissive: '#432466', emissiveIntensity: .7 }), side * 73, h + 38, -d, 24, 36, 24);
        prism.rotation.z = side * .3;
        label(g, side < 0 ? 'persistent actor' : 'async { await }', 38, side * 73, h + 38, -d + 24, { bg: null, fg: '#ddbcff', size: 84 });
      }
      label(g, 'M O T O K O', 47, 0, h + 64, -d, { bg: null, fg: '#d9b7ff' });
    } else if (zone.key === 'canisters') {
      for (let i = 0; i < 3; i++) {
        const c = capsule(g, (i % 2 ? -1 : 1) * (60 + i * 16), h + 30 + i * 22, -d - i * 26, 3.5 + i * .6); c.rotation.z = (i - 1) * .2;
      }
      label(g, 'CODE + STATE', 38, -72, h + 53, -d + 4, { bg: null, fg: '#b8faff' });
    } else if (zone.key === 'identity') {
      for (let side of [-1, 1]) {
        shape(g, 'box', '#153848', side * 48, h + 31, -d, 8, 66, 9);
        shape(g, 'box', glow('#87ffcd', 1.5), side * 48, h + 31, -d + 4.7, .55, 60, .25);
      }
      bar(g, V(-48, h + 64, -d), V(48, h + 64, -d), .5, glow('#87ffcd'));
      const k = new T.Group(); k.position.set(0, h + 76, -d); g.add(k); key(k, 4);
      label(g, 'INTERNET IDENTITY', 58, 0, h + 59, -d + 1, { bg: null, fg: '#bbffdf' });
    } else if (zone.key === 'oisy') {
      shape(g, 'sphere', mat('#59529a', { metalness: .6, roughness: .3 }), -100, h + 52, -d - 25, 38);
      const orbit = shape(g, 'ring', glow('#b9a8ff', 1), -100, h + 52, -d - 25, 55); orbit.rotation.x = 1.05; orbit.rotation.y = .3;
      label(g, 'OISY', 43, -100, h + 55, -d + 14, { bg: null, fg: '#e6dfff', size: 110, height: .4 });
      for (let i = 0; i < 6; i++) shape(g, 'coin', glow('#ead4ff'), 65 + Math.sin(i) * 13, h + 20 + i * 8, -d + i * 9, 5);
    } else if (zone.key === 'fusion') {
      const c = new T.Group(); c.position.set(0, h + 26, -d); g.add(c); chain(c, 9);
      label(g, 'CHAIN FUSION', 52, 0, h + 10, -d + 2, { bg: null, fg: '#ffd8b3' });
    } else if (zone.key === 'engines') {
      for (let side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const body = shape(g, 'box', '#1d354e', side * 63, h + 15 + i * 20, -d, 29, 14, 28); body.rotation.y = .2;
          shape(g, 'box', glow('#56d4ff'), side * 63, h + 15 + i * 20, -d + 15, 23, .7, .5);
        }
        const exhaust = shape(g, 'cone', glow('#579ef7', 1.4), side * 63, h - 6, -d, 5, 23, 5); exhaust.rotation.x = Math.PI;
      }
      label(g, 'OPEN CLOUD', 47, 0, h + 72, -d, { bg: null, fg: '#a8ecff' });
    } else if (zone.key === 'nns') {
      const n = new T.Group(); n.position.set(-80, h + 55, -d); g.add(n); neuron(n, 11);
      label(g, 'N N S', 40, 68, h + 48, -d + 10, { bg: null, fg: '#ffc8e4' });
      label(g, 'PROPOSAL #BUG', 43, 68, h + 39, -d + 10, { bg: null, fg: '#ff99c5' });
    } else if (zone.key === 'mainnet') {
      infinity(g, 0, h + 43, -d - 100, 32, true);
      label(g, 'INTERNET COMPUTER', 69, 0, h + 9, -d - 99, { bg: null, fg: '#d5efff', size: 80 });
      for (let side of [-1, 1]) {
        const r = shape(g, 'ring', glow(side < 0 ? '#ff6dbf' : '#5edfff', .6), side * 145, h + 22, -d - 50, 23); r.rotation.y = side * .4;
      }
    }
    }
    // Curved orbital arches give depth and a visible route through the world.
    if (chunk >= 3) {
      const pts = [];
      for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI; pts.push(V(Math.cos(a) * 43, h + Math.sin(a) * 57 - 2, -d)); }
      tube(g, pts, color, .23);
    }
    g.userData.floaters = []; g.traverse(m => { if (m.userData.float) g.userData.floaters.push(m); });
    return g;
  }
  const sky = createStellarSky;
  return { glow, world, sky, emblem, update };
}
