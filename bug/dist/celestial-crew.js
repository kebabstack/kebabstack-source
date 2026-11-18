import * as T from 'three';
import { createAstronaut, poseAstronaut } from './astronaut.js';
export { createAstronaut, poseAstronaut } from './astronaut.js';
export class CelestialCrew {
  constructor(scene) {
    this.astronaut=createAstronaut();scene.add(this.astronaut.root);
    this.satellites=[];
    const metal=new T.MeshStandardMaterial({color:'#9cabbe',metalness:.65,roughness:.45,fog:false});
    const panel=new T.MeshStandardMaterial({color:'#20466b',emissive:'#2589aa',emissiveIntensity:.14,metalness:.3,roughness:.52,fog:false});
    const glow=new T.MeshBasicMaterial({color:'#b8e9ff',fog:false});
    const box=new T.BoxGeometry(1,1,1);
    for(let i=0;i<2;i++) {
      const root=new T.Group();root.name='Distant satellite';scene.add(root);
      const part=(mat,x,y,z,sx,sy,sz)=>{const m=new T.Mesh(box,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);root.add(m);};
      part(metal,0,0,0,1.3,1.9,1.3);part(metal,0,0,0,7,.13,.13);
      for(const side of [-1,1]) {part(panel,side*2.7,0,0,3.5,2.35,.09);for(let n=0;n<3;n++)part(metal,side*(1.6+n*1.05),0,.06,.04,2.35,.03);}
      part(glow,0,1.8,0,.1,1.8,.1);this.satellites.push(root);
    }
    this.pose = new T.Quaternion().setFromEuler(new T.Euler(-.035, -.16, .08));
    this.place = new T.Vector3();
    this.greetingAt = null;
    this.materials = new Map();
    for (const root of [this.astronaut.root, ...this.satellites]) root.traverse(mesh => {
      if (!mesh.material) return;
      const source = mesh.material;
      if (!this.materials.has(source)) this.materials.set(source, source.clone());
      mesh.material = this.materials.get(source);
    });
  }
  update(camera,distance,clock,reduced=false) {
    const fade=T.MathUtils.smoothstep(distance,750,1100),root=this.astronaut.root;
    root.visible=fade>0;
    if (!root.visible) this.greetingAt = null;
    if (distance >= 950 && this.greetingAt === null) this.greetingAt = clock;
    for (const [source, material] of this.materials) {
      const transparent = source.transparent || fade < 1;
      if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
      material.opacity = fade * source.opacity;
    }
    const halfH=Math.tan(camera.fov*Math.PI/360)*820,halfW=halfH*camera.aspect;
    const drift=reduced?0:Math.sin(clock*.15)*.016;
    const sway=reduced?0:Math.sin(clock*.12)*.012;
    root.position.copy(this.place.set(halfW*(.64+sway),halfH*(.23+drift),-820).applyQuaternion(camera.quaternion).add(camera.position));
    root.scale.setScalar(halfH*Math.min(.064,camera.aspect*.065));
    root.quaternion.copy(camera.quaternion).multiply(this.pose);
    poseAstronaut(this.astronaut,clock,reduced,this.greetingAt === null ? -1 : clock - this.greetingAt);
    this.satellites.forEach((sat,i)=>{
      sat.visible=distance>650;
      const travel=reduced?0:Math.sin(clock*.032+i*2)*.08;
      sat.position.copy(this.place.set(halfW*(-.78+travel),halfH*(i===0?.38:-.47),-820).applyQuaternion(camera.quaternion).add(camera.position));
      sat.scale.setScalar(halfH*.0045);sat.quaternion.copy(camera.quaternion);
      sat.rotateZ((i?-.4:.32)+(reduced?0:Math.sin(clock*.07+i)*.12));sat.rotateY(.55);
    });
  }
}
