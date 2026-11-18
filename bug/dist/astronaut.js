// An articulated pressure suit. Each joint carries one baked shell; the display,
// polished glass and repeated tread/knuckle details keep their own materials.
import * as T from 'three';

const fabric='#d3d5d1', ceramic='#f2f1e6', shell='#b6babe', gasket='#343b44', steel='#75828a';
const sphere=new T.SphereGeometry(1,20,14), box=new T.BoxGeometry(1,1,1);
const suit=new T.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:.07,fog:false});
const graphite=new T.MeshStandardMaterial({color:gasket,roughness:.65,fog:false});
const V=(x,y,z)=>new T.Vector3(x,y,z);

function joint(parent,name,x=0,y=0,z=0) {
  const node=new T.Group();node.name=name;node.position.set(x,y,z);parent.add(node);return node;
}

// Elliptical cross-sections follow the chest, hip or limb. Sculpted changes in
// circumference form the pressure folds instead of stacking balls at each joint.
function contour(rows,segments=28) {
  const pos=[],indices=[];
  for(const [y,rx,rz,z=0] of rows) for(let i=0;i<segments;i++){
    const angle=i*2*Math.PI/segments;
    pos.push(rx*Math.cos(angle),y,z+rz*Math.sin(angle));
  }
  for(let row=0;row<rows.length-1;row++) for(let i=0;i<segments;i++){
    const a=row*segments+i,b=row*segments+(i+1)%segments;
    indices.push(a,a+segments,b,b,a+segments,b+segments);
  }
  for(let i=1;i<segments-1;i++){
    const last=(rows.length-1)*segments;indices.push(0,i,i+1,last,last+i+1,last+i);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

const plateShape=new T.Shape();
plateShape.moveTo(-.40,-.5);plateShape.lineTo(.40,-.5);plateShape.quadraticCurveTo(.5,-.5,.5,-.40);
plateShape.lineTo(.5,.40);plateShape.quadraticCurveTo(.5,.5,.40,.5);plateShape.lineTo(-.40,.5);
plateShape.quadraticCurveTo(-.5,.5,-.5,.40);plateShape.lineTo(-.5,-.40);plateShape.quadraticCurveTo(-.5,-.5,-.40,-.5);
const panel=new T.ExtrudeGeometry(plateShape,{depth:.76,bevelEnabled:true,bevelSize:.05,bevelThickness:.12,bevelSegments:3,curveSegments:5}).translate(0,0,-.38);
const ring=new T.TorusGeometry(1,.085,8,44).rotateX(Math.PI/2);
function surface(node,geometry,color,x=0,y=0,z=0,sx=1,sy=sx,sz=sx,rotation=[0,0,0]){
  const m=new T.Object3D();m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(...rotation);m.updateMatrix();
  (node.userData.surfaces??=[]).push({geometry,color:new T.Color(color),matrix:m.matrix});return m;
}
function bake(node){
  const parts=node.userData.surfaces;if(!parts)return;
  const positions=[],normals=[],colors=[],p=new T.Vector3(),n=new T.Vector3(),normal=new T.Matrix3();
  for(const {geometry:g,color,matrix} of parts){
    normal.getNormalMatrix(matrix);
    const a=g.attributes.position,b=g.attributes.normal,idx=g.index;
    for(let i=0;i<(idx?.count??a.count);i++){
      const k=idx?idx.getX(i):i;p.fromBufferAttribute(a,k).applyMatrix4(matrix);n.fromBufferAttribute(b,k).applyNormalMatrix(normal);
      positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);colors.push(color.r,color.g,color.b);
    }
  }
  const g=new T.BufferGeometry();
  for(const [name,values] of [['position',positions],['normal',normals],['color',colors]])g.setAttribute(name,new T.Float32BufferAttribute(values,3));
  g.computeBoundingSphere();node.add(new T.Mesh(g,suit));delete node.userData.surfaces;
}
function repeated(node,geo,material,transforms){
  const mesh=new T.InstancedMesh(geo,material,transforms.length),o=new T.Object3D();
  transforms.forEach(([x,y,z,sx,sy,sz,rx=0,ry=0,rz=0],i)=>{
    o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
  });mesh.computeBoundingSphere();node.add(mesh);return mesh;
}
function cable(node,color,points,radius) {
  const curve=new T.CatmullRomCurve3(points.map(p=>V(...p)));
  surface(node,new T.TubeGeometry(curve,20,radius,6,false),color);
}
function folded(node,length,wide,deep,color=fabric) {
  const profile=[[0,.73],[.08,.88],[.21,1],[.38,.96],[.46,.89],[.49,.95],[.54,.88],[.65,.91],[.75,.88],[.81,.78],[.84,.85],[.88,.78],[1,.68]];
  surface(node,contour(profile.reverse().map(([t,r])=>[-t*length,r*wide,r*deep,-.06*Math.sin(t*Math.PI)]),24),color);
}
function cuff(node,y,rx,rz) {
  surface(node,contour([[-.11,.88,.85],[-.09,1,1],[.055,1,1],[.09,.90,.91]],24),gasket,0,y,0,rx,1,rz);
  surface(node,ring,shell,0,y+.059,0,rx,1,rz);
}
const visorDepth=(x,y)=>1.28*Math.sqrt(Math.max(.015,1-(x/1.55)**2-(y/1.50)**2))+.045;

function helmet(head){
  surface(head,sphere,ceramic,0,0,0,1.55,1.50,1.28);
  // Chin guard and pressure seal extend over the suit collar.
  surface(head,panel,shell,0,-1.22,.66,1.12,.37,.42,[-.20,0,0]);
  surface(head,panel,ceramic,0,-1.24,.85,.88,.28,.27,[-.22,0,0]);
  surface(head,panel,gasket,0,-1.20,1.00,.43,.075,.05);
  const outline=[],positions=[],indices=[],rings=22,slices=72;
  function point(angle,r) {
    const c=Math.cos(angle),s=Math.sin(angle);
    // A wide brow and tapered jaw follow the silhouette of a pressure visor.
    const x=1.43*r*Math.sign(c)*Math.abs(c)**.79*(.97+.045*s);
    const y=-.005+1.23*r*Math.sign(s)*Math.abs(s)**.87;
    return V(x,y,visorDepth(x,y));
  }
  for(let row=0;row<=rings;row++)for(let i=0;i<=slices;i++){
    const p=point(i/slices*Math.PI*2,row/rings);positions.push(p.x,p.y,p.z);
    if(row===rings&&i<slices)outline.push(p);
    if(row<rings&&i<slices){const a=row*(slices+1)+i,b=a+slices+1;indices.push(a,b,b+1,a,b+1,a+1);}
  }
  const glass=new T.BufferGeometry();glass.setAttribute('position',new T.Float32BufferAttribute(positions,3));glass.setIndex(indices);glass.computeVertexNormals();
  const lens=new T.Mesh(glass,new T.MeshPhysicalMaterial({color:'#090d13',metalness:.16,roughness:.17,clearcoat:1,clearcoatRoughness:.12,fog:false}));head.add(lens);
  surface(head,new T.TubeGeometry(new T.CatmullRomCurve3(outline,true),96,.047,8,true),gasket);
  for(const s of [-1,1]){
    surface(head,sphere,steel,s*1.46,-.02,-.02,.18,.51,.48);
    surface(head,panel,ceramic,s*1.53,-.01,.04,.17,.84,.67,[0,s*.15,s*.06]);
    surface(head,panel,gasket,s*1.57,-.16,.23,.12,.24,.10);
  }
  // The visor's LED matrix follows the actual glass rather than floating on a
  // flat card. A thin underglow preserves the familiar mark at horizon scale.
  const path=[],tints=[],stops=['#ffb642','#ff883e','#fc506f','#f347a7','#a15df5','#34d1ed','#32dfbe','#ffb642'].map(c=>new T.Color(c));
  const tint=t=>{const v=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(v));return stops[i].clone().lerp(stops[i+1],v-i);};
  for(let i=0;i<=180;i++){const t=i/180*Math.PI*2,x=1.08*Math.cos(t),y=.42*Math.sin(2*t)-.035;path.push(V(x,y,visorDepth(x,y)+.026));}
  const stroke=new T.TubeGeometry(new T.CatmullRomCurve3(path),180,.042,6,false);
  for(let i=0;i<=180;i++){const c=tint(i/180);for(let j=0;j<7;j++)tints.push(c.r,c.g,c.b);}
  stroke.setAttribute('color',new T.Float32BufferAttribute(tints,3));
  head.add(new T.Mesh(stroke,new T.MeshBasicMaterial({vertexColors:true,fog:false})));
  const dots=[],step=.050;
  for(let j=-12;j<=11;j++)for(let i=-24;i<=24;i++){
    const x=i*step,y=j*step;let dist=Infinity,closest=0;
    for(let k=0;k<180;k++){const dx=x-path[k].x,dy=y-path[k].y,d=dx*dx+dy*dy;if(d<dist){dist=d;closest=k;}}
    if(dist<.011)dots.push({x,y,c:tint(closest/180)});
  }
  const pixels=new T.InstancedMesh(new T.CircleGeometry(1,8),new T.MeshBasicMaterial({color:'#ffffff',toneMapped:false,fog:false}),dots.length);
  const cell=new T.Object3D(),front=V(0,0,1),normal=V(0,0,1);
  dots.forEach(({x,y,c},i)=>{const z=visorDepth(x,y);normal.set(x/1.55**2,y/1.50**2,(z-.045)/1.28**2).normalize();cell.position.set(x,y,z+.063);cell.quaternion.setFromUnitVectors(front,normal);cell.scale.setScalar(step*.44);cell.updateMatrix();pixels.setMatrixAt(i,cell.matrix);pixels.setColorAt(i,c);});
  pixels.computeBoundingSphere();head.add(pixels);
}
function glove(wrist,s){
  surface(wrist,sphere,ceramic,0,-.17,0,.29,.31,.16);
  surface(wrist,panel,shell,0,-.13,-.14,.40,.29,.06);
  const tips=[],knuckles=[];
  function digit(a,b,r){
    const delta=b.clone().sub(a),m=surface(wrist,sphere,fabric,...a.clone().add(b).multiplyScalar(.5).toArray(),r,delta.length()*.5+r*.57,r);
    m.quaternion.setFromUnitVectors(V(0,1,0),delta.normalize());m.updateMatrix();
  }
  for(let i=0;i<4;i++){
    const x=s*(.19-i*.126),l=[.34,.39,.35,.27][i],a=V(x,-.32,.01),b=V(x+s*(1.2-i)*.027,-.32-l*.58,.042),c=V(b.x+s*(1-i)*.018,-.32-l,.105);
    digit(a,b,.072);digit(b,c,.064);tips.push(c.toArray());knuckles.push([b.x,b.y,b.z-.035,.071,.037,.057]);
  }
  const a=V(s*.22,-.12,.014),b=V(s*.34,-.23,.11),c=V(s*.39,-.34,.17);digit(a,b,.090);digit(b,c,.077);
  repeated(wrist,sphere,graphite,knuckles);
  wrist.userData.anatomy={side:s,thumb:c.toArray(),fingers:tips};
}

export function createAstronaut(){
  const root=new T.Group();root.name='DFINITY / horizon companion';
  const body=joint(root,'Pressure garment'),head=joint(body,'Helmet',0,2.13,.06);
  surface(body,contour([[-1.25,.63,.44],[-1.10,.82,.55],[-.82,.92,.61],[-.50,.85,.57],[-.36,.81,.59],[-.22,.87,.63],[.16,1.01,.72],[.63,1.08,.75],[.9,1.02,.67],[1.08,.77,.54],[1.14,.64,.48]],36),fabric);
  surface(body,contour([[-.08,.91,.66],[.085,.89,.65]],28),shell,0,-.47);
  cuff(body,1.12,.70,.65);
  surface(body,panel,shell,0,.42,.64,.96,.76,.20,[-.06,0,0]);
  surface(body,panel,ceramic,0,.42,.75,.85,.65,.12,[-.06,0,0]);
  surface(body,panel,gasket,-.12,.53,.827,.40,.13,.036);
  surface(body,panel,'#7dcac7',-.14,.54,.85,.26,.043,.014);
  for(let i=0;i<3;i++)surface(body,panel,i===2?'#db824b':steel,-.22+i*.22,.30,.837,.12,.11,.027);
  for(const s of [-1,1]){
    surface(body,panel,shell,s*.63,-.77,.46,.37,.33,.14,[0,s*.23,-s*.08]);
    cable(body,steel,[[s*.74,.84,.49],[s*.75,.64,.61],[s*.74,.20,.60],[s*.62,-.38,.52]],.041);
  }
  surface(body,panel,shell,0,.02,-.68,1.46,1.78,.61);
  surface(body,panel,ceramic,0,.11,-1.00,1.30,1.57,.17);
  for(let i=0;i<4;i++)surface(body,panel,steel,0,.47-i*.18,-1.11,.86,.044,.05);
  cable(body,gasket,[[.92,.70,-.67],[1.15,.33,-.63],[1.11,-.12,-.33],[.90,-.28,.20]],.065);
  helmet(head);
  const arms=[],legs=[];
  for(const s of [-1,1]){
    const shoulder=joint(body,'Shoulder',s*1.00,.73,.01),elbow=joint(shoulder,'Elbow',0,-1.10,0),wrist=joint(elbow,'Glove',0,-1.02,0);
    surface(shoulder,sphere,shell,0,-.07,0,.39,.39,.38);
    folded(shoulder,1.13,.38,.35);surface(shoulder,panel,ceramic,s*.28,-.34,.06,.16,.44,.32,[0,0,-s*.13]);
    cuff(shoulder,0,.365,.365);
    surface(elbow,sphere,shell,0,-.015,.01,.285,.26,.28);
    folded(elbow,.99,.33,.32);cuff(elbow,-.90,.295,.295);
    surface(elbow,sphere,shell,0,-.03,-.18,.25,.21,.18);
    glove(wrist,s);arms.push({shoulder,elbow,wrist});
    const hip=joint(body,'Hip',s*.50,-1.04,-.03),knee=joint(hip,'Knee',0,-1.39,0),ankle=joint(knee,'Boot',0,-1.28,.00);
    folded(hip,1.43,.49,.46);surface(hip,panel,shell,s*.36,-.61,.17,.18,.54,.41,[0,s*.15,0]);
    surface(knee,sphere,shell,0,.005,-.07,.345,.32,.36);
    folded(knee,1.27,.405,.39);surface(knee,panel,shell,0,-.07,.32,.56,.51,.16,[-.12,0,0]);
    surface(knee,panel,ceramic,0,-.10,.41,.45,.36,.10,[-.12,0,0]);
    cuff(knee,-1.19,.37,.37);
    surface(ankle,contour([[-.40,.38,.51,.15],[-.30,.39,.55,.16],[-.18,.39,.51,.14],[.02,.35,.41,.08],[.16,.28,.31,0]],24),fabric);
    surface(ankle,contour([[-.51,.30,.45,.16],[-.49,.36,.52,.16],[-.39,.40,.55,.15],[-.35,.365,.53,.15]],28),gasket);
    repeated(ankle,box,graphite,Array.from({length:5},(_,i)=>[0,-.505,-.19+i*.16,.50,.035,.065,.02,0,0]));
    legs.push({hip,knee,ankle});
  }
  root.traverse(bake);
  const a={root,body,head,arms,legs,hands:arms.map(a=>a.wrist),waveArm:arms[0].shoulder,waveElbow:arms[0].elbow,waveWrist:arms[0].wrist,restArm:arms[1].shoulder};
  poseAstronaut(a,0,true);return a;
}
const ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
export function poseAstronaut(a,time,reduced=false,greetingTime=time){
  // A floating neutral posture: flexed knees, relaxed wrists and bent elbows.
  // The wave starts at the shoulder and reaches the hand a moment later.
  const t=reduced?0:time,p=greetingTime;
  const lift=reduced?0:ease(p/1.8)*(1-ease((p-3.7)/2.0));
  const bend=reduced?0:ease((p-.22)/1.72)*(1-ease((p-3.82)/1.98));
  const wave=reduced?0:Math.sin((p-1.50)*3.35)*ease((p-1.35)/.65)*(1-ease((p-3.20)/.75));
  const breath=reduced?0:Math.sin(t*.54),drift=reduced?0:Math.sin(t*.33);
  a.body.rotation.set(-.13+drift*.06,.13+breath*.065,-.14+drift*.045);
  a.head.rotation.set(.09+lift*.06,-.14+.07*breath,-.035-.09*lift);
  a.waveArm.rotation.set(.02-.13*lift+.035*drift,-.10+lift*.02,-.47-.56*lift+.035*breath);
  a.waveElbow.rotation.set(-.52+.22*bend-.04*breath,.14*bend,-.32-.88*bend+wave*.05);
  a.waveWrist.rotation.set(.08+.16*bend,-.06+.27*bend,-.09+wave*.15);
  a.restArm.rotation.set(-.20+.085*breath,.08,.48+.095*drift);
  a.arms[1].elbow.rotation.set(-.67-.075*drift,-.17,.14);
  a.arms[1].wrist.rotation.set(.14+breath*.065,-.26,.10);
  a.legs.forEach(({hip,knee,ankle},i)=>{
    const s=i?1:-1,cycle=reduced?0:Math.sin(t*.38+i*1.8);
    hip.rotation.set((i?-.94:-.26)+cycle*.14,s*(.13+cycle*.06),s*((i?.33:.18)+.065*drift));
    knee.rotation.set((i?1.46:.62)-cycle*.16,s*.035,0);
    ankle.rotation.set((i?-.27:-.12)+cycle*.085,s*.045,s*.065);
  });
}
