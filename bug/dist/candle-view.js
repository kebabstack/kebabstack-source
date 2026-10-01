import * as T from 'three';
import { CANDLE_BODY, CANDLE_WICK } from './candle.js';

// Shared buffers/materials, no textures or point lights. Replaces each floating
// firewall's eleven meshes and label texture with three draws (four if armoured).
const box = size => new T.BoxGeometry(size.x*2,size.y*2,size.d*2);
const body = box(CANDLE_BODY), wick = box(CANDLE_WICK), edges = new T.EdgesGeometry(body);
const armor = new T.TorusGeometry(3.15,.09,5,24);
const red = new T.MeshStandardMaterial({color:'#d52e52',emissive:'#c21939',emissiveIntensity:.6,metalness:.3,roughness:.35});
const green = new T.MeshStandardMaterial({color:'#058b31',emissive:'#00a83a',emissiveIntensity:.25,metalness:.1,roughness:.5,fog:false});
const redWick = new T.MeshBasicMaterial({color:'#ff8da4'}), greenWick = new T.MeshBasicMaterial({color:'#baffd6'});
const redEdge = new T.LineBasicMaterial({color:'#ffadb7'}), greenEdge = new T.LineBasicMaterial({color:'#c9ffe0'});
const armorMat = new T.MeshBasicMaterial({color:'#ffcb7e'});

export function createCandle(god = false, armored = false) {
  const root = new T.Group();
  root.add(new T.Mesh(wick,god?greenWick:redWick));
  root.add(new T.Mesh(body,god?green:red));
  root.add(new T.LineSegments(edges,god?greenEdge:redEdge));
  if(armored) {
    const ring = new T.Mesh(armor,armorMat);
    ring.userData.armor=true;root.add(ring);
  }
  for(const piece of root.children)piece.userData.sharedGeometry=true;
  return root;
}
