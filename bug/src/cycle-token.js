// Stamped cycle tokens share a brass edge. The chapter emblem, stripe and cut
// corners stay readable from the chase camera against both the roof and space.
import * as T from 'three';
import { CoinInstances } from './coin-instances.js';

const rim = new T.CylinderGeometry(1.73, 1.73, .28, 12).rotateX(Math.PI / 2);
const face = new T.CircleGeometry(1.59, 48);
const brass = new T.MeshStandardMaterial({ color: '#edb967', metalness: .68, roughness: .36 });

function drawEmblem(ctx, key) {
  function line(...points) {
    ctx.beginPath(); ctx.moveTo(...points[0]);
    for (const p of points.slice(1)) ctx.lineTo(...p);
    ctx.stroke();
  }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); }
  function rect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); }
  function path(data) { ctx.stroke(new Path2D(data)); }
  switch (key) {
    case 'zurich': // blueprint crystal
      line([0,-28],[29,0],[0,28],[-29,0],[0,-28]); line([-25,0],[25,0]); break;
    case 'motoko':
      path('M-10 -24 Q-20 -24 -20 -13 Q-19 -3 -28 0 Q-19 3 -20 13 Q-20 24 -10 24 M10 -24 Q20 -24 20 -13 Q19 -3 28 0 Q19 3 20 13 Q20 24 10 24'); break;
    case 'nns': // governance ballot
      line([-24,4],[-24,25],[25,25],[25,4]); line([-12,-8],[-3,1],[17,-19]); break;
    case 'mainnet':
      path('M0 0 C-33 -42 -42 27 -16 16 C-8 13 -4 5 0 0 C33 -42 42 27 16 16 C8 13 4 5 0 0Z'); break;
    case 'fusion':
      ctx.rotate(-Math.PI / 4); rect(-8,-31,16,34,8); rect(-8,-3,16,34,8); break;
    case 'identity':
      path('M0 -27 L24 -17 V-3 Q23 14 0 28 Q-23 14 -24 -3 V-17Z'); line([-9,-1],[-3,6],[10,-8]); break;
    case 'oisy':
      rect(-27,-19,52,39,6); line([-24,-17],[11,-27],[17,-19]); line([24,-5],[9,-5],[9,7],[24,7]); break;
    case 'caffeine':
      rect(-27,-22,54,44,6); line([-16,-9],[-7,0],[-16,9]); line([1,9],[14,9]); break;
    case 'engines':
      line([0,-29],[25,-15],[25,15],[0,29],[-25,15],[-25,-15],[0,-29]);
      circle(0,0,10); break;
    case 'canisters':
      line([0,-28],[26,-14],[26,14],[0,28],[-26,14],[-26,-14],[0,-28]);
      line([-23,-13],[0,0],[23,-13]); line([0,0],[0,24]); break;
  }
}

export function cycleToken(zone) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 192;
  const ctx = canvas.getContext('2d'); ctx.translate(96, 96); ctx.scale(1.5, 1.5);
  ctx.fillStyle = '#1c2630'; ctx.fillRect(-64,-64,128,128);
  ctx.strokeStyle = zone.color; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0,0,57,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle = '#fcebc1'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 6.5;
  drawEmblem(ctx, zone.key);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 2;
  const stamp = new T.Mesh(face, new T.MeshBasicMaterial({ map: texture, toneMapped: false }));
  stamp.position.z = .151;
  const template = new T.Group(); template.name = zone.token;
  template.add(new T.Mesh(rim, brass), stamp);
  return template;
}

export class CourseTokens {
  constructor(scene) { this.scene = scene; this.batches = new Map(); }
  update(pickups) {
    for (const group of this.batches.values()) group.items.length = 0;
    for (const item of pickups) {
      if (!item.zone || !item.mesh.visible) continue;
      let group = this.batches.get(item.zone.key);
      if (!group) {
        group = { batch: new CoinInstances(this.scene, cycleToken(item.zone), 64), items: [] };
        this.batches.set(item.zone.key, group);
      }
      group.items.push(item);
    }
    for (const { batch, items } of this.batches.values()) {
      if (items.length || batch.parts[0].mesh.count) batch.update(items);
    }
  }
}
