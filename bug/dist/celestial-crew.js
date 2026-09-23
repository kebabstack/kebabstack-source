import * as T from 'three';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
// Articulated, handed suit built around the supplied DFINITY mascot reference.
// Rigid details share geometry and are instanced per joint; the rig stays small.
export function createAstronaut() {
  const root=new T.Group();root.name='DFINITY / horizon companion';
  const sphere=new T.SphereGeometry(1,32,24);
  const outline=new T.Shape();outline.moveTo(-.4,-.5);outline.lineTo(.4,-.5);outline.quadraticCurveTo(.5,-.5,.5,-.4);outline.lineTo(.5,.4);outline.quadraticCurveTo(.5,.5,.4,.5);outline.lineTo(-.4,.5);outline.quadraticCurveTo(-.5,.5,-.5,.4);outline.lineTo(-.5,-.4);outline.quadraticCurveTo(-.5,-.5,-.4,-.5);
  const panel=new T.ExtrudeGeometry(outline,{depth:.84,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.045,bevelThickness:.08,curveSegments:6});panel.translate(0,0,-.42);
  const white=new T.MeshStandardMaterial({color:'#eeecf6',roughness:.58,metalness:.06,emissive:'#8c83ad',emissiveIntensity:.045,fog:false});
  const trim=new T.MeshStandardMaterial({color:'#c4c8da',roughness:.48,metalness:.2,fog:false});
  const seam=new T.MeshStandardMaterial({color:'#8994ae',roughness:.62,metalness:.12,fog:false});
  const dark=new T.MeshPhysicalMaterial({color:'#080e19',roughness:.13,metalness:.25,clearcoat:1,clearcoatRoughness:.08,fog:false});
  const light=new T.MeshBasicMaterial({color:'#a9d8f5',fog:false});
  const add=(parent,geo,mat,x,y,z,sx,sy=sx,sz=sx)=>{
    const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
  };
  const ring=(parent,x,y,z,r,thickness,mat=trim)=>{const m=add(parent,new T.TorusGeometry(r,thickness,8,48),mat,x,y,z,1);m.rotation.x=Math.PI/2;return m;};
  add(root,panel,trim,0,.38,-1.1,2.62,2.9,.95);
  add(root,panel,white,0,.44,-1.55,2.34,2.65,.22);
  for(const side of [-1,1])add(root,sphere,trim,side*1.23,.28,-1.18,.32,1.45,.42);
  add(root,sphere,white,0,0,0,1.62,1.94,1.12);
  add(root,sphere,white,0,-1.32,0,1.5,.65,1.04);
  // Soft white chest controller with raised pockets, latches and recessed seams.
  add(root,panel,trim,0,.5,1.03,1.83,1.7,.28);
  add(root,panel,white,0,.52,1.23,1.74,1.6,.25);
  for(let i=0;i<3;i++) {
    add(root,panel,trim,0,.98-i*.42,1.39,1.35,.32,.055);
    add(root,panel,white,0,1.01-i*.42,1.44,1.24,.26,.075);
  }
  for(const x of [-.74,.74])for(const y of [.99,-.02])add(root,panel,white,x,y,1.43,.14,.28,.12);
  add(root,panel,seam,-.45,1.49,.85,.45,.19,.05);
  add(root,panel,light,-.45,1.49,.89,.28,.05,.015);
  for(const side of [-1,1]) {
    const leg=new T.Group();leg.name=side<0?'Right boot':'Left boot';leg.position.set(side*.78,-1.55,-.02);leg.rotation.set(side*.055,0,side*.13);root.add(leg);
    add(leg,sphere,white,0,-.76,0,.7,1.06,.72);
    for(let i=0;i<3;i++)add(leg,sphere,trim,0,-1.37-i*.12,.03,.59,.10,.64);
    add(leg,sphere,white,0,-1.98,.16,.64,.65,.74);
    add(leg,sphere,white,0,-2.36,.48,.7,.44,.94);
    add(leg,panel,trim,0,-2.64,.38,1.22,.14,1.47);
    add(leg,panel,white,0,-2.11,.83,.78,.38,.14);
  }
  ring(root,0,1.8,0,1.08,.17,seam);ring(root,0,1.96,0,1.16,.16,white);
  const head=new T.Group();head.name='Helmet';head.position.set(0,3.28,.04);head.rotation.z=-.045;root.add(head);
  add(head,sphere,white,0,0,0,2.3,2.22,2.08);
  const visorZ=(x,y)=>2.08*Math.sqrt(Math.max(.015,1-(x/2.3)**2-(y/2.22)**2))+.075;
  const positions=[0,-.36,visorZ(0,-.36)],indices=[],rimPoints=[];
  const rows=24,columns=80;
  for(let row=1;row<=rows;row++)for(let col=0;col<=columns;col++) {
    const a=col/columns*Math.PI*2,r=row/rows,x=1.94*r*Math.cos(a),y=1.50*r*Math.sin(a)-.36;
    positions.push(x,y,visorZ(x,y));
    if(row===rows)rimPoints.push(V(x,y,visorZ(x,y)));
    if(col<columns){const n=1+(row-1)*(columns+1)+col;if(row===1)indices.push(0,n,n+1);else{const prev=n-columns-1;indices.push(prev,n,n+1,prev,n+1,prev+1);}}
  }
  const glass=new T.BufferGeometry();glass.setAttribute('position',new T.Float32BufferAttribute(positions,3));glass.setIndex(indices);glass.computeVertexNormals();head.add(new T.Mesh(glass,dark));
  head.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rimPoints),128,.085,8,false),trim));
  // A soft reflection sweeps over the glass without obscuring the infinity mark.
  const reflection=[];
  for(let i=0;i<=24;i++){const y=.35+i/24*.86,x=-1.37+i/24*.29;reflection.push(V(x,y,visorZ(x,y)+.012));}
  head.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(reflection),24,.065,6,false),new T.MeshBasicMaterial({color:'#adcde4',transparent:true,opacity:.18,depthWrite:false,fog:false})));
  add(head,panel,white,0,1.79,1.18,.47,.55,.12).rotation.x=-.48;
  add(head,sphere,light,0,1.67,1.39,.10,.10,.035);
  add(head,sphere,white,0,-1.9,1.1,.7,.31,.40);
  add(head,panel,seam,0,-1.92,1.44,.55,.11,.06);
  for(const side of [-1,1]) {
    add(head,sphere,trim,side*2.16,.05,0,.29,.77,.6);
    add(head,panel,white,side*2.2,.10,.38,.22,.88,.35).rotation.y=side*.32;
    add(head,sphere,white,side*1.9,.97,1.0,.17,.20,.22);
    add(head,sphere,seam,side*1.91,.97,1.19,.10,.12,.07);
  }
  const points=[],colors=['#ff9c25','#f26830','#e42c8a','#7338ba','#28bdea','#28bdea'].map(c=>new T.Color(c));
  for(let i=0;i<=160;i++) {
    const t=i/160*Math.PI*2,x=Math.cos(t)*1.48,y=Math.sin(2*t)*.64-.28;
    points.push(V(x,y,visorZ(x,y)+.10+Math.sin(t)*.035));
  }
  const logo=new T.TubeGeometry(new T.CatmullRomCurve3(points),160,.155,8,false),tints=[];
  for(let i=0;i<=160;i++) {
    const at=i/160*colors.length,section=Math.floor(at)%colors.length,c=colors[section].clone().lerp(colors[(section+1)%colors.length],at%1);
    for(let j=0;j<=8;j++)tints.push(c.r,c.g,c.b);
  }
  logo.setAttribute('color',new T.Float32BufferAttribute(tints,3));
  head.add(new T.Mesh(logo,new T.MeshBasicMaterial({vertexColors:true,fog:false})));
  const hands=[];let waveArm,waveElbow,waveWrist,restArm;
  for(const side of [-1,1]) {
    const arm=new T.Group();arm.name=side<0?'Right shoulder · waving':'Left shoulder';arm.position.set(side*1.46,1.18,0);root.add(arm);
    add(arm,sphere,white,0,-.34,0,.66,.69,.66);
    add(arm,sphere,white,0,-.94,0,.55,.92,.58);
    for(let i=0;i<3;i++)add(arm,sphere,trim,0,-1.48-i*.12,0,.49,.10,.52);
    const elbow=new T.Group();elbow.name='Elbow';elbow.position.set(0,-1.7,0);arm.add(elbow);
    add(elbow,sphere,white,0,-.60,.02,.49,.79,.52);
    add(elbow,sphere,trim,0,-1.18,.02,.45,.13,.47);
    add(elbow,sphere,white,0,-1.32,.02,.46,.16,.47);
    const wrist=new T.Group();wrist.name=side<0?'Right glove':'Left glove';wrist.position.set(0,-1.44,.05);elbow.add(wrist);
    add(wrist,sphere,white,0,-.31,0,.43,.48,.24);
    add(wrist,sphere,trim,0,-.27,-.20,.31,.32,.06);
    // In a front-facing palm, the thumb is lateral with the fingers pointing down.
    // Mirror the anatomy, not a second copy of the same right-handed glove.
    const fingers=[];
    for(let i=0;i<4;i++) {
      const length=[.58,.68,.63,.48][i],x=side*(.30-i*.20),fan=side*(.12-i*.075);
      const top=V(x,-.55,.005),mid=V(x-Math.sin(fan)*length*.52,-.55-Math.cos(fan)*length*.52,.045),tip=V(mid.x-Math.sin(fan)*length*.48,mid.y-Math.cos(fan)*length*.48,.10);
      for(const [a,b] of [[top,mid],[mid,tip]]) {const p=a.clone().add(b).multiplyScalar(.5),finger=add(wrist,sphere,white,p.x,p.y,p.z,.105,a.distanceTo(b)*.5+.095,.115);finger.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());}
      fingers.push(tip);
    }
    const thumbBase=V(side*.35,-.21,.025),thumbJoint=V(side*.56,-.38,.09),thumbTip=V(side*.65,-.60,.17);
    for(const [a,b] of [[thumbBase,thumbJoint],[thumbJoint,thumbTip]]){const p=a.clone().add(b).multiplyScalar(.5),m=add(wrist,sphere,white,p.x,p.y,p.z,.15,a.distanceTo(b)*.5+.11,.15);m.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());}
    wrist.userData.anatomy={side,thumb:thumbTip.toArray(),fingers:fingers.map(p=>p.toArray())};hands.push(wrist);
    if(side===-1){waveArm=arm;waveElbow=elbow;waveWrist=wrist;}else{restArm=arm;elbow.rotation.set(-.16,0,.28);wrist.rotation.set(.12,Math.PI,0);}
  }
  const groups=[];root.traverse(g=>{if(g.isGroup)groups.push(g);});
  for(const g of groups) {
    const batches=new Map();
    for(const m of [...g.children])if(m.isMesh&&!m.material.transparent){const k=m.geometry.uuid+m.material.uuid;const list=batches.get(k)||[];list.push(m);batches.set(k,list);}
    for(const meshes of batches.values())if(meshes.length>1){
      const batch=new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);
      meshes.forEach((m,i)=>{m.updateMatrix();batch.setMatrixAt(i,m.matrix);g.remove(m);});g.add(batch);
    }
  }
  const astronaut={root,head,waveArm,waveElbow,waveWrist,restArm,hands};poseAstronaut(astronaut,0,true);return astronaut;
}

export function poseAstronaut(a,clock,reduced=false) {
  const phase=((clock%10)+10)%10;
  const ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
  const raised=reduced?0:ease(phase/.95)*(1-ease((phase-3.3)/1.35));
  const greeting=reduced?0:ease((phase-.7)/.6)*(1-ease((phase-3.0)/.55));
  const sway=Math.sin((phase-.7)*Math.PI*2/1.0)*greeting;
  a.waveArm.rotation.set(-.16-raised*.1,.04,-1.05-raised*.42+sway*.018);
  a.waveElbow.rotation.set(-.10-raised*.16,raised*.08,-.30-raised*.80+sway*.055);
  a.waveWrist.rotation.set(.13+raised*.05,greeting*.10,-.08+sway*.22);
  a.restArm.rotation.set(-.08,0,.95+(reduced?0:Math.sin(clock*.5)*.025));
  a.head.rotation.y=reduced?0:Math.sin(clock*.22)*.035;
  a.head.rotation.z=-.045-raised*.025;
}

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
    this.pose=new T.Quaternion();this.materials=new Set();
    for(const root of [this.astronaut.root,...this.satellites])root.traverse(m=>{if(m.material){m.material.transparent=true;this.materials.add(m.material);}});
  }
  update(camera,distance,clock,reduced=false) {
    const fade=T.MathUtils.smoothstep(distance,750,1100),root=this.astronaut.root;
    root.visible=fade>0;
    for(const m of this.materials){m.userData.baseOpacity??=m.opacity;m.opacity=fade*.94*m.userData.baseOpacity;}
    const halfH=Math.tan(camera.fov*Math.PI/360)*820,halfW=halfH*camera.aspect;
    const drift=reduced?0:Math.sin(clock*.15)*.012;
    const horizonY=T.MathUtils.lerp(.38,-.02,T.MathUtils.smoothstep(camera.aspect,.75,1.3));
    root.position.copy(V(halfW*.64,halfH*(horizonY+drift),-820).applyQuaternion(camera.quaternion).add(camera.position));
    root.scale.setScalar(halfH*Math.min(.064,camera.aspect*.065));
    this.pose.setFromEuler(new T.Euler(-.035,-.16,.08));root.quaternion.copy(camera.quaternion).multiply(this.pose);
    poseAstronaut(this.astronaut,clock,reduced);
    this.satellites.forEach((sat,i)=>{
      sat.visible=distance>650;
      const travel=reduced?0:Math.sin(clock*.032+i*2)*.08;
      sat.position.copy(V(halfW*(-.78+travel),halfH*(i===0?.38:-.47),-820).applyQuaternion(camera.quaternion).add(camera.position));
      sat.scale.setScalar(halfH*.0045);sat.quaternion.copy(camera.quaternion);
      sat.rotateZ((i?-.4:.32)+(reduced?0:Math.sin(clock*.07+i)*.12));sat.rotateY(.55);
    });
  }
}
