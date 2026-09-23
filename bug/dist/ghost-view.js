import * as T from 'three';
import { WARNING_SECONDS } from './dogfight.js';
import { ascentAt } from './physics.js';
import { WakePath } from './wake-path.js';

const clamp=T.MathUtils.clamp;
// Compact armoured shell from the supplied Motoko references: a round face,
// pink/violet housing and a recessed, scalloped rear opening around the thruster.
const profile=new T.CatmullRomCurve3([
  new T.Vector3(1.7,1.78,1.62),new T.Vector3(2.12,2.2,.95),
  new T.Vector3(2.4,2.48,-.05),new T.Vector3(2.34,2.45,-.9),new T.Vector3(2.05,2.15,-1.65)
]);
function shellGeometry() {
  const positions=[],colors=[],indices=[],rows=40,columns=64;
  const magenta=new T.Color('#ff49df'),violet=new T.Color('#9e0bcc');
  // One continuous surface folds around the rear lip into the inner shell.
  for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++) {
    const s=i/rows,inner=s>.82,u=clamp(inner?1-(s-.82)/.18:s/.82,0,1);
    const p=profile.getPoint(u),theta=j/columns*Math.PI*2;
    const inset=inner?.15:0,scallop=Math.cos(theta*2)*.62*T.MathUtils.smoothstep(u,.42,1);
    positions.push(Math.cos(theta)*(p.x-inset),Math.sin(theta)*(p.y-inset),p.z+scallop);
    const panel=(Math.sin(theta*2+u*3.5)+1)*.5;
    const color=magenta.clone().lerp(violet,.08+panel*.30+(inner?.15:0));
    colors.push(color.r,color.g,color.b);
    if(i<rows&&j<columns) {const a=i*(columns+1)+j,b=a+columns+1;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function exhaustGeometry() {
  const segments=48,lanes=12,positions=new Float32Array(lanes*(segments+1)*2*3),uv=[],indices=[],bands=[];
  for(let lane=0;lane<lanes;lane++)for(let i=0;i<=segments;i++)for(let side=0;side<2;side++) {
    uv.push(side,i/segments);bands.push(lane%2);
    if(side===0&&i<segments) {const a=(lane*(segments+1)+i)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('band',new T.Float32BufferAttribute(bands,1));g.setIndex(indices);
  g.boundingSphere=new T.Sphere(new T.Vector3(0,0,-13),23);g.userData.segments=segments;g.userData.lanes=lanes;return g;
}
export class GhostView {
  constructor(scene) {
    this.root=new T.Group();this.root.name='Motoko / armoured hover ghost';scene.add(this.root);
    this.craft=new T.Group();this.root.add(this.craft);
    const mesh=(geometry,material,x=0,y=0,z=0,sx=1,sy=sx,sz=sx,parent=this.craft)=>{
      const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
    };
    this.shellMaterial=new T.MeshPhysicalMaterial({vertexColors:true,roughness:.27,metalness:.18,clearcoat:.7,
      clearcoatRoughness:.2,emissive:'#c61594',emissiveIntensity:.32,side:T.DoubleSide});
    this.body=mesh(shellGeometry(),this.shellMaterial);
    const sphere=new T.SphereGeometry(1,32,24);
    const visorMaterial=new T.MeshPhysicalMaterial({color:'#211326',roughness:.21,metalness:.12,clearcoat:.8});
    mesh(sphere,visorMaterial,0,0,1.43,1.69,1.78,.58);
    mesh(new T.TorusGeometry(1,.035,8,64),new T.MeshStandardMaterial({color:'#680b91',roughness:.35}),0,0,1.64,1.72,1.8,1);
    this.eyesMaterial=new T.MeshBasicMaterial({color:new T.Color('#fff967').multiplyScalar(1.5)});
    for(const side of [-1,1]) mesh(sphere,this.eyesMaterial,side*.65,.12,1.98,.34,.44,.15);
    this.cannon = mesh(sphere,new T.MeshBasicMaterial({color:'#ff6ad5',transparent:true,depthWrite:false}),0,-.45,2.25,.25);
    this.cannon.visible = false;
    // The back is a recessed engine assembly, enclosed by the same solid armour.
    const metal=new T.MeshStandardMaterial({color:'#292b55',metalness:.65,roughness:.34,side:T.DoubleSide});
    mesh(new T.CircleGeometry(1.75,48),metal,0,0,-1.03);
    mesh(new T.TorusGeometry(1.65,.14,8,48),metal,0,0,-1.15);
    this.engineMaterial=new T.MeshBasicMaterial({color:new T.Color('#62edff').multiplyScalar(1.8)});
    this.engineRing=mesh(new T.TorusGeometry(1.32,.105,8,64),this.engineMaterial,0,0,-1.25);
    mesh(sphere,new T.MeshStandardMaterial({color:'#b92bab',emissive:'#f548de',emissiveIntensity:.7,metalness:.4,roughness:.23}),0,0,-1.23,.54,.54,.2);
    this.rotor=new T.Group();this.craft.add(this.rotor);
    const spokes=new T.InstancedMesh(new T.BoxGeometry(.74,.11,.12),metal,8);
    const bolts=new T.InstancedMesh(sphere,metal,8),lamps=new T.InstancedMesh(sphere,this.engineMaterial,8);
    this.rotor.add(spokes);this.craft.add(bolts,lamps);
    const placement=new T.Object3D();
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,x=Math.cos(a),y=Math.sin(a);
      placement.position.set(x*.9,y*.9,-1.14);placement.scale.setScalar(1);placement.rotation.z=a;placement.updateMatrix();spokes.setMatrixAt(i,placement.matrix);
      placement.rotation.z=0;placement.position.set(x*1.6,y*1.6,-1.33);placement.scale.set(.19,.19,.12);placement.updateMatrix();bolts.setMatrixAt(i,placement.matrix);
      placement.position.z=-1.43;placement.scale.set(.08,.08,.025);placement.updateMatrix();lamps.setMatrixAt(i,placement.matrix);
    }
    this.exhaustMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
      uniforms:{opacity:{value:1},power:{value:.7}},
      vertexShader:'attribute float band;varying vec2 tex;varying float hue;void main(){tex=uv;hue=band;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 tex;varying float hue;uniform float opacity;uniform float power;void main(){float edge=max(0.,1.-abs(tex.x*2.-1.));float light=.28*edge+.72*pow(edge,4.);float fade=pow(1.-tex.y,1.45)*smoothstep(0.,.045,tex.y);vec3 c=mix(vec3(.22,1.8,3.),vec3(2.9,.25,1.7),hue);gl_FragColor=vec4(c,light*fade*opacity*power*.82);}' });
    this.exhaust=mesh(exhaustGeometry(),this.exhaustMaterial,0,0,0,1,1,1,this.root);
    this.exhaust.frustumCulled=false;
    this.wake=new WakePath();this.engine=new T.Vector3();this.back=new T.Vector3();
    this.wakePoint=new Float64Array(3);this.wakeCenters=Array.from({length:49},()=>new T.Vector3());
    this.tangent=new T.Vector3();this.side=new T.Vector3();this.up=new T.Vector3();
    this.aura=mesh(new T.TorusGeometry(3.1,.025,6,64),new T.MeshBasicMaterial({color:'#ff67bd',transparent:true,depthWrite:false}),0,0,0,1,1,1,this.root);
    this.healthRoot=new T.Group();this.root.add(this.healthRoot);this.health=[];
    for(let i=0;i<2;i++)this.health.push(mesh(new T.BoxGeometry(.6,.1,.06),new T.MeshBasicMaterial({color:'#a7fff0'}),-.38+i*.76,3.2,0,1,1,1,this.healthRoot));
    this.materials=new Set();this.root.traverse(m=>{if(m.material&&m.material!==this.exhaustMaterial){m.material.transparent=true;this.materials.add(m.material);}});
    this.root.scale.setScalar(.88);this.root.visible=false;
    this.reset();
  }
  reset() {
    this.previous=null;this.lastTime=null;this.lastExhaust=null;this.encounter=0;this.power=.7;this.energyPhase=0;
    this.wake.reset();this.root.visible=false;
  }
  animateExhaust(time,reduced) {
    this.exhaust.visible=!reduced;
    if(reduced)return;
    const g=this.exhaust.geometry,p=g.attributes.position,{segments,lanes}=g.userData;
    const length=(15+this.power*10)*this.root.scale.x;
    for(let i=0;i<=segments;i++) {
      this.wake.sample(i/segments*length,this.back.x,this.back.y,this.back.z,this.wakePoint);
      this.wakeCenters[i].fromArray(this.wakePoint).sub(this.root.position).divideScalar(this.root.scale.x);
    }
    for(let i=0;i<=segments;i++) {
      const u=i/segments,center=this.wakeCenters[i];
      this.tangent.subVectors(this.wakeCenters[Math.min(segments,i+1)],this.wakeCenters[Math.max(0,i-1)]).normalize();
      this.side.set(0,Math.abs(this.tangent.y)>.94?0:1,Math.abs(this.tangent.y)>.94?1:0).cross(this.tangent).normalize();
      this.up.crossVectors(this.tangent,this.side).normalize();
      for(let lane=0;lane<lanes;lane++) {
        const angle=lane/lanes*Math.PI*2,r=.48+Math.sin(u*Math.PI)*1.35;
        const x=Math.cos(angle)*r+Math.sin(this.energyPhase+u*9+lane)*u*.35;
        const y=Math.sin(angle)*r+Math.cos(this.energyPhase*.8+u*8+lane)*u*.3;
        const width=(.25+.72*Math.sin(Math.PI*u))*(1-u*.8),at=(lane*(segments+1)+i)*2;
        for(let edge=0;edge<2;edge++) {
          const side=x+(edge?width:-width);
          p.setXYZ(at+edge,center.x+this.side.x*side+this.up.x*y,center.y+this.side.y*side+this.up.y*y,center.z+this.side.z*side+this.up.z*y);
        }
      }
    }
    p.needsUpdate=true;this.rotor.rotation.z=time*.7;
  }
  update(run,camera,time,reduced) {
    const g=run.ghost,visible=g.active&&g.fade>.001&&run.phase==='flying';this.root.visible=visible;
    if(!visible){this.wake.reset();this.previous=null;this.lastTime=time;return;}
    const dt=this.lastTime===null?0:Math.min(.1,Math.max(0,time-this.lastTime));this.lastTime=time;
    const fresh=!this.previous||this.encounter!==g.encounter;
    const slope=ascentAt(g.d+.5)-ascentAt(g.d-.5);
    const velocity=new T.Vector3(g.vx||0,(g.vy||0)+(g.vd||0)*slope,-(g.vd||1));
    const heading=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),velocity.normalize());
    const bank=clamp(-(g.vx||0)*.013,-.65,.65);
    heading.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));
    if(fresh){this.craft.quaternion.copy(heading);this.encounter=g.encounter;}
    else if(dt>0)this.craft.quaternion.slerp(heading,1-Math.exp(-12*dt));
    this.previous={x:g.x,y:g.offsetY};this.root.position.set(g.x,g.y+ascentAt(g.d),-g.d);
    this.back.set(0,0,-1).applyQuaternion(this.craft.quaternion);
    this.engine.copy(this.root.position).addScaledVector(this.back,1.38*this.root.scale.x);
    if(fresh || (!reduced && this.wasReduced)) this.wake.reset();
    if(fresh || dt>0 || this.wake.count===0) this.wake.push(this.engine.x,this.engine.y,this.engine.z);
    this.healthRoot.quaternion.copy(camera.quaternion);this.aura.quaternion.copy(camera.quaternion);
    const attacking=['warning','fire'].includes(g.phase);
    this.cannon.visible = attacking;
    this.cannon.scale.setScalar(g.phase === 'warning' ? .18 + Math.min(1,g.time/WARNING_SECONDS) * .65 : .2);
    this.power=T.MathUtils.lerp(this.power,attacking?1.35:g.phase==='recover'?1.15:.9,1-Math.exp(-4*dt));this.energyPhase+=(3+this.power*2)*dt;
    if(fresh||this.lastExhaust!==time||this.wasReduced!==reduced){this.animateExhaust(time,reduced);this.lastExhaust=time;this.wasReduced=reduced;}
    this.eyesMaterial.color.set(g.flash>0?'#ffffff':attacking?'#ff63c8':'#fff967').multiplyScalar(1.5);
    this.shellMaterial.emissiveIntensity=g.flash>0?1.1:.32+(reduced?0:Math.sin(time*2.8)*.035);
    this.engineMaterial.color.set('#62edff').multiplyScalar(reduced?1.8:1.8+Math.sin(time*4)*.22+this.power*.2);
    this.exhaustMaterial.uniforms.opacity.value=g.fade;this.exhaustMaterial.uniforms.power.value=this.power;
    for(const material of this.materials)material.opacity=g.fade;
    this.health.forEach((m,i)=>m.visible=i<g.hp&&g.phase!=='banished');
    this.aura.visible=attacking;this.aura.scale.setScalar(1+(reduced?0:Math.sin(time*7)*.04));
  }
}
