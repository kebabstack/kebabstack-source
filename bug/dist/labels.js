import * as T from 'three';

// Pooled floating score labels drawn as camera-facing sprites. Textures are
// cached per text/colour pair, so repeated "+50" pickups cost no new uploads.
export class FloatingLabels {
  constructor(scene, capacity = 10) {
    this.scene = scene; this.cache = new Map(); this.pool = []; this.enabled = true;
    for (let i = 0; i < capacity; i++) {
      const sprite = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
      sprite.visible = false; sprite.renderOrder = 20; scene.add(sprite);
      this.pool.push({ sprite, life: 0, duration: 1, vy: 0 });
    }
  }
  texture(text, color) {
    const key = text + '|' + color;
    if (this.cache.has(key)) return this.cache.get(key);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.font = '700 92px "Space Grotesk", "JetBrains Mono", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(6,10,24,.85)'; ctx.strokeText(text, 256, 84);
    ctx.fillStyle = color; ctx.fillText(text, 256, 84);
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 2;
    this.cache.set(key, texture); return texture;
  }
  show(text, x, y, z, { color = '#ffe9a6', scale = 1, duration = .9 } = {}) {
    if (!this.enabled) return;
    const slot = this.pool.find(s => s.life <= 0) || this.pool.reduce((a, b) => a.life < b.life ? a : b);
    slot.sprite.material.map = this.texture(text, color); slot.sprite.material.needsUpdate = true;
    slot.sprite.position.set(x, y, z); slot.sprite.scale.set(6.4 * scale, 2 * scale, 1);
    slot.sprite.visible = true; slot.life = duration; slot.duration = duration; slot.vy = 5.5; slot.base = scale;
  }
  update(dt, reduced = false) {
    for (const slot of this.pool) {
      if (slot.life <= 0) continue;
      slot.life -= dt; const t = 1 - Math.max(0, slot.life) / slot.duration;
      if (!reduced) { slot.sprite.position.y += slot.vy * dt; slot.vy *= Math.exp(-dt * 3); }
      const pop = 1 + Math.sin(Math.min(1, t * 4) * Math.PI) * .25;
      slot.sprite.scale.set(6.4 * slot.base * pop, 2 * slot.base * pop, 1);
      slot.sprite.material.opacity = t < .75 ? 1 : 1 - (t - .75) / .25;
      if (slot.life <= 0) slot.sprite.visible = false;
    }
  }
  reset() { for (const slot of this.pool) { slot.life = 0; slot.sprite.visible = false; } }
}
