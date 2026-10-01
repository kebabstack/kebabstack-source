// Small presentation helpers shared by both renderers: the chapter banner,
// animated number count-ups, a local personal best and the sound toggle.
export class ChapterBanner {
  constructor(doc = globalThis.document) {
    this.doc = doc; this.timer = 0;
    this.element = doc.getElementById('chapterBanner');
    if (!this.element) {
      this.element = doc.createElement('div'); this.element.id = 'chapterBanner'; this.element.className = 'chapter-banner'; this.element.setAttribute('aria-hidden', 'true');
      this.element.innerHTML = '<small></small><b></b><span></span><i></i>';
      doc.querySelector('main')?.append(this.element);
    }
  }
  show(eyebrow, title, sub, color, seconds = 2.6) {
    const [small, b, span] = this.element.children;
    small.textContent = eyebrow; b.textContent = title; span.textContent = sub || '';
    this.element.style.setProperty('--banner', color || '#a9ffdd');
    this.element.classList.remove('show'); void this.element.offsetWidth; this.element.classList.add('show');
    clearTimeout(this.timer); this.timer = setTimeout(() => this.hide(), seconds * 1000);
  }
  hide() { clearTimeout(this.timer); this.element.classList.remove('show'); }
}

export function countUp(element, target, format = String, seconds = 1, raf = globalThis.requestAnimationFrame, now = () => performance.now()) {
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !raf || target <= 0) { element.textContent = format(target); return; }
  const start = now();
  const step = () => {
    const t = Math.min(1, (now() - start) / (seconds * 1000)), eased = 1 - Math.pow(1 - t, 3);
    element.textContent = format(Math.round(target * eased));
    if (t < 1) raf(step); else element.textContent = format(target);
  };
  element.textContent = format(0); raf(step);
}

export function bestScoreStore(key, storage) {
  if (storage === undefined) try { storage = globalThis.localStorage; } catch { storage = null; }
  return {
    read() { try { const n = Number(storage?.getItem(key)); return Number.isFinite(n) && n > 0 ? n : 0; } catch { return 0; } },
    write(score) { try { storage?.setItem(key, String(Math.floor(score))); } catch { /* optional */ } }
  };
}

const ICON_ON = '<svg viewBox="0 0 24 24"><path d="m11 4-6 5H2v6h3l6 5ZM16 8q5 4 0 8m3-11q8 7 0 14"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="m11 4-6 5H2v6h3l6 5ZM16 8l6 8m0-8-6 8"/></svg>';
export function mountSoundButton(button, audio, onChange = () => {}) {
  const render = on => {
    button.setAttribute('aria-pressed', String(on)); button.setAttribute('aria-label', on ? 'Mute sound' : 'Enable sound');
    button.title = on ? 'Sound on (M)' : 'Sound off (M)'; button.innerHTML = on ? ICON_ON : ICON_OFF; button.classList.toggle('sound-on', on);
    onChange(on);
  };
  audio.subscribe(render); render(audio.enabled);
  // A remembered "on" preference shows as armed until the first gesture lets audio start.
  if (audio.preferred && !audio.enabled) button.classList.add('sound-armed');
  audio.subscribe(() => button.classList.remove('sound-armed'));
  const toggle = () => { audio.toggle(); if (audio.enabled) audio.ui(); };
  button.addEventListener('click', toggle);
  return toggle;
}
