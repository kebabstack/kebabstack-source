export const SPACE_REGIONS = [
  { at: 160, art: 'star-nursery', title: 'THE STAR NURSERY', note: 'Every star starts somewhere. So did this bug.', color: '#ffd097' },
  { at: 1250, art: 'spiral-sea', title: 'THE SPIRAL SEA', note: 'The compiler is behind us. The galaxy is not.', color: '#bbaaff' },
  { at: 2600, art: 'deep-field', title: 'BEYOND THE DEEP FIELD', note: 'Tiny lights. Enormous possibilities. Keep shipping.', color: '#a9d9ec' }
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class SpaceSky {
  constructor() { this.images = new Map(); this.cache = new Map(); this.width = 0; }
  request(index) {
    const region = SPACE_REGIONS[index];
    if (!region || this.images.has(index) || typeof Image === 'undefined') return;
    const image = new Image(); this.images.set(index, { image, ready: false });
    image.decoding = 'async';
    image.onload = () => { this.images.get(index).ready = true; };
    // Keep the procedural sky if an image is unavailable. Never block a launch.
    image.onerror = () => { this.images.get(index).failed = true; };
    image.src = `./assets/two-d/${region.art}.webp`;
  }
  layer(index, view) {
    if (this.width !== view.w || this.height !== view.h) {
      this.cache.clear(); this.width = view.w; this.height = view.h;
    }
    const source = this.images.get(index);
    if (!source?.ready) return null;
    if (!this.cache.has(index)) {
      // Small, pre-scaled canvases keep per-frame work independent of bitmap size.
      const width = view.w + 48, height = view.h + 32;
      this.cache.set(index, view.surface(width, height, c => {
        const image = source.image, scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const iw = image.naturalWidth * scale, ih = image.naturalHeight * scale;
        // Phone framing keeps the dark flight corridor and the bright galaxy edge.
        c.drawImage(image, (width - iw) * .56, (height - ih) * .32, iw, ih);
        c.fillStyle = '#080c202c'; c.fillRect(0, 0, width, height);
      }));
    }
    return this.cache.get(index);
  }
  draw(view, run) {
    const c = view.ctx, d = run.d;
    let index = 0;
    for (let i = 1; i < SPACE_REGIONS.length; i++) if (d >= SPACE_REGIONS[i].at) index = i;
    this.request(index);
    if (d >= (SPACE_REGIONS[index + 1]?.at ?? Infinity) - 500) this.request(index + 1);
    const draw = (i, alpha) => {
      const layer = this.layer(i, view); if (!layer) return false;
      c.globalAlpha = alpha;
      const x = view.motionReduced ? -24 : -24 - Math.sin(d / 1700) * 20;
      const y = view.motionReduced ? -16 : -16 + Math.sin(d / 2300) * 12;
      c.drawImage(layer, Math.round(x / 2) * 2, Math.round(y / 2) * 2, view.w + 48, view.h + 32);
      return true;
    };
    c.save();
    const fade = clamp((d - SPACE_REGIONS[index].at) / 280, 0, 1);
    const ready = this.images.get(index)?.ready;
    if (index && (fade < 1 || !ready)) { if (!draw(index - 1, 1)) draw(0, 1); }
    draw(index, fade);
    c.restore();
    if (d < 250) return;
    // Foreground star parallax and one occasional silent comet give depth without
    // looking like coins or hazards. Reduced motion keeps these decorative lights still.
    c.save(); c.globalAlpha = .32;
    const shift = view.motionReduced ? 0 : d * .11;
    for (let i = 0; i < 16; i++) {
      const x = ((i * 157.7 - shift) % view.w + view.w) % view.w;
      const y = 85 + ((i * 73.1) % Math.max(60, view.baseGround - 105));
      c.fillStyle = i % 3 ? '#bcd8ff' : '#ffdbc0'; c.fillRect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 2, 2);
    }
    const comet = view.time % 21;
    if (!view.motionReduced && comet > 16 && comet < 18) {
      const p = (comet - 16) / 2, x = view.w * (.94 - p * .33), y = 96 + p * 65;
      for (let i = 0; i < 12; i++) { c.globalAlpha = (1 - i / 12) * .5; c.fillStyle = '#cddfff'; c.fillRect(Math.round((x + i * 5) / 2) * 2, Math.round((y - i * 2) / 2) * 2, 3, 2); }
    }
    c.restore();
  }
  discovery(view, run) {
    const region = SPACE_REGIONS.findLast(r => run.d >= r.at + 200);
    if (!region || view.h < 520 || run.phase !== 'flying') return;
    const elapsedDistance = run.d - region.at - 200;
    if (elapsedDistance > 580) return;
    const c = view.ctx; c.save(); c.globalAlpha = Math.min(1, elapsedDistance / 50, (580 - elapsedDistance) / 90);
    const width = Math.min(410, view.w - 32), x = view.w - width - 16;
    view.rect(x, 168, width, view.w < 700 ? 32 : 51, '#11152bc9');
    view.text(region.title, view.w - 27, 177, region.color, view.w < 700 ? 10 : 12, 'right');
    if (view.w >= 700) view.text(region.note, view.w - 27, 196, '#e1d5ed', 10, 'right');
    c.restore();
  }
}
