import * as T from 'three';

// Static pieces share three merged buffers across the entire course. A mine is
// three draw calls, including its warning ring; no per-mine texture or light.
function combine(parts) {
  const positions=[], normals=[];
  for(const {geometry, matrix} of parts) {
    const g=(geometry.index?geometry.toNonIndexed():geometry.clone()).applyMatrix4(matrix);
    positions.push(...g.attributes.position.array); normals.push(...g.attributes.normal.array); g.dispose(); geometry.dispose();
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  geometry.computeBoundingSphere(); return geometry;
}
const parts = [], lights = [], dummy=new T.Object3D();
function part(list,geometry,x,y,z,sx=1,sy=sx,sz=sx,rotation=0) {
  dummy.position.set(x,y,z); dummy.scale.set(sx,sy,sz); dummy.rotation.set(0,0,rotation); dummy.updateMatrix();
  list.push({geometry,matrix:dummy.matrix.clone()});
}
part(parts,new T.CylinderGeometry(1.9,2.35,1.1,10),0,0,0);
part(parts,new T.SphereGeometry(1,16,10),0,.4,0,1.65,.75,1.65);
part(lights,new T.TorusGeometry(1.98,.14,6,32),0,.25,0,1,1,1,0);
// The light belt lies around the hull, rather than standing upright.
lights.at(-1).matrix.multiply(new T.Matrix4().makeRotationX(Math.PI/2));
for(let i=0;i<8;i++) {
  const a=i*Math.PI/4, x=Math.cos(a), z=Math.sin(a);
  const spike=new T.ConeGeometry(.3,1.3,5);
  const object=new T.Object3D(); object.position.set(x*2.25,.15,z*2.25);
  object.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(x,.4,z).normalize()); object.updateMatrix();
  parts.push({geometry:spike,matrix:object.matrix.clone()});
  part(lights,new T.SphereGeometry(.14,6,5),x*2.82,.36,z*2.82);
}
part(lights,new T.OctahedronGeometry(.62),0,1.1,0,1,1.15,1);
const hullGeometry=combine(parts), lightGeometry=combine(lights);
const ringGeometry=new T.RingGeometry(3.2,3.45,48);
ringGeometry.rotateX(-Math.PI/2);
const hullMaterial=new T.MeshStandardMaterial({color:'#573441',emissive:'#8d1631',emissiveIntensity:.65,metalness:.48,roughness:.36});
const lightMaterial=new T.MeshBasicMaterial({color:new T.Color('#ff493e').multiplyScalar(2.3)});
const ringMaterial=new T.MeshBasicMaterial({color:'#ff634f',transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide});
export function createMine() {
  const root=new T.Group();
  for(const [geometry,material] of [[hullGeometry,hullMaterial],[lightGeometry,lightMaterial],[ringGeometry,ringMaterial]]) {
    const mesh=new T.Mesh(geometry,material); mesh.userData.sharedGeometry=true; root.add(mesh);
  }
  root.children[2].position.y=-.91;
  return root;
}
export function updateMine(mesh, obj, time, reduced) {
  const ring=mesh.children[2];
  const pulse=reduced?1:1+Math.sin(time*2.6+obj.d)*.065;
  ring.scale.set(pulse,1,pulse);
  if(obj.airborne) { ring.position.y=-.9; mesh.rotation.y=reduced?0:time*.28+obj.d; }
}
