import * as T from 'three';

// A small authored light studio baked once into a PMREM cube map. Metals and
// glossy shells pick up real reflections instead of flat shading; no HDR file
// is loaded and the result is a few hundred kilobytes of GPU memory.
export function createEnvironment(renderer) {
  const scene = new T.Scene();
  const sky = new T.Mesh(new T.SphereGeometry(40, 32, 16), new T.ShaderMaterial({ side: T.BackSide,
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 d; void main(){ vec3 v = normalize(d); float h = v.y * .5 + .5;
      vec3 zenith = vec3(.10, .16, .36), horizon = vec3(.78, .52, .46), floor = vec3(.05, .07, .12);
      vec3 c = mix(floor, mix(horizon, zenith, smoothstep(.45, 1., h)), smoothstep(.3, .52, h));
      c += vec3(1., .82, .6) * pow(max(0., dot(v, normalize(vec3(-.5, .35, .6)))), 48.) * 3.5;
      gl_FragColor = vec4(c, 1.); }` }));
  scene.add(sky);
  const panel = (x, y, z, w, h, color, intensity) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(intensity), side: T.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m);
  };
  panel(-10, 14, 8, 10, 6, '#fff1dc', 6);   // warm key
  panel(12, 9, -6, 8, 8, '#8fc8ff', 2.2);   // cool fill
  panel(0, -8, 12, 14, 3, '#7af0ff', 1.4);  // cyan floor bounce
  panel(9, 4, 12, 5, 9, '#ff8fd0', 1.1);    // magenta rim
  const pmrem = new T.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, .02).texture;
  pmrem.dispose(); scene.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  return texture;
}
