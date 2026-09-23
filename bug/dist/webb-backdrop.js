import * as T from 'three';

export const WEBB_REGIONS = [
  { at: 280, file: 'carina.jpg', aspect: 1920 / 1200 },
  { at: 1500, file: 'phantom-galaxy.jpg', aspect: 1977 / 1130 },
  { at: 2900, file: 'deep-field.jpg', aspect: 1920 / 1200 }
];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

// One distant photographic layer, behind the existing 3D stars and planets.
// Texture reads happen only in 3D and never hold up a launch or a scene update.
export class WebbBackdrop {
  constructor(scene, loader = new T.TextureLoader()) {
    this.scene = scene; this.loader = loader; this.images = new Map(); this.disposed = false;
    this.uniforms = {
      imageA: {value: null}, imageB: {value: null}, aspectA: {value: 1.6}, aspectB: {value: 1.6},
      screenAspect: {value: 1}, blend: {value: 0}, opacity: {value: 0}, offset: {value: new T.Vector2()}
    };
    const material = new T.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, fog: false,
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 photoUV; void main(){photoUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 photoUV;
        uniform sampler2D imageA; uniform sampler2D imageB;
        uniform float aspectA; uniform float aspectB; uniform float screenAspect;
        uniform float blend; uniform float opacity; uniform vec2 offset;
        vec2 coverUV(float aspect){
          vec2 crop=vec2(min(1.,screenAspect/aspect),min(1.,aspect/screenAspect));
          return (photoUV-.5)*crop*.95+.5+offset;
        }
        void main(){
          vec3 a=texture2D(imageA,coverUV(aspectA)).rgb;
          vec3 b=texture2D(imageB,coverUV(aspectB)).rgb;
          float corridor=mix(.65,.92,smoothstep(.04,.38,abs(photoUV.x-.5)));
          gl_FragColor=vec4(mix(a,b,blend)*corridor,opacity);
        }`
    });
    this.mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material);
    this.mesh.name = 'Webb photographic sky'; this.mesh.renderOrder = -19;
    this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
    this.position = new T.Vector3();
  }
  request(index) {
    if (this.disposed || !WEBB_REGIONS[index] || this.images.has(index)) return;
    const entry = {ready: false, failed: false, texture: null}; this.images.set(index, entry);
    entry.texture = this.loader.load(`./assets/webb/${WEBB_REGIONS[index].file}`, texture => {
      if(this.disposed){texture.dispose();return;}
      texture.colorSpace = T.SRGBColorSpace;
      texture.minFilter = T.LinearMipmapLinearFilter; texture.magFilter = T.LinearFilter;
      entry.texture = texture; entry.ready = true;
    }, undefined, () => { entry.failed = true; });
  }
  update(camera, distance, clock, reduced = false) {
    if(this.disposed)return;
    let index = 0;
    for(let i=1;i<WEBB_REGIONS.length;i++)if(distance>=WEBB_REGIONS[i].at)index=i;
    if(distance>100)this.request(index);
    if(distance>=(WEBB_REGIONS[index+1]?.at??Infinity)-500)this.request(index+1);
    const ready=[...this.images.keys()].filter(i=>i<=index&&this.images.get(i).ready).sort((a,b)=>a-b);
    const current=ready.at(-1),previous=ready.at(-2)??current;
    const fade=clamp((distance-WEBB_REGIONS[0].at)/650,0,1);
    this.mesh.visible=current!==undefined&&fade>0;
    this.uniforms.opacity.value=this.mesh.visible?fade*.92:0;
    if(!this.mesh.visible)return;
    const entry=this.images.get(current);entry.visibleSince??=clock;
    const loadFade=reduced?1:clamp((clock-entry.visibleSince)/1.2,0,1);
    if(previous===current)this.uniforms.opacity.value*=loadFade;
    this.uniforms.imageA.value=this.images.get(previous).texture;
    this.uniforms.imageB.value=this.images.get(current).texture;
    this.uniforms.aspectA.value=WEBB_REGIONS[previous].aspect;
    this.uniforms.aspectB.value=WEBB_REGIONS[current].aspect;
    this.uniforms.blend.value=previous===current?0:Math.min(loadFade,clamp((distance-WEBB_REGIONS[current].at)/450,0,1));
    this.uniforms.screenAspect.value=camera.aspect;
    this.uniforms.offset.value.set(reduced?0:Math.sin(distance/2400)*.012,reduced?0:Math.sin(clock*.025)*.007);
    // Stay within the far plane in every camera mode. Depth testing prevents this
    // transparent background from painting over the bug, street or obstacles.
    const depth=camera.far*.9,halfH=Math.tan(camera.fov*Math.PI/360)*depth*1.01;
    this.mesh.scale.set(halfH*camera.aspect,halfH,1);
    this.position.set(0,0,-depth).applyQuaternion(camera.quaternion).add(camera.position);
    this.mesh.position.copy(this.position);this.mesh.quaternion.copy(camera.quaternion);
  }
  dispose() {
    this.disposed=true;this.scene.remove(this.mesh);
    for(const entry of this.images.values())entry.texture?.dispose();
    this.images.clear();this.mesh.geometry.dispose();this.mesh.material.dispose();
  }
}
