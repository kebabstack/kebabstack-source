// Procedural arcade audio. No samples are loaded: every sound is synthesised
// from oscillators and one shared noise buffer, so the game stays offline and
// a few kilobytes. The engine and wind beds run continuously while flying and
// follow airspeed; everything else is a short one-shot voice.
const PREF_KEY = 'ship-the-bug-sound-v2';
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (semi, base = 440) => base * 2 ** (semi / 12);

export class ArcadeAudio {
  constructor({ storage } = {}) {
    if (storage === undefined) try { storage = globalThis.localStorage; } catch { storage = null; }
    this.storage = storage; this.ctx = null; this.enabled = false; this.wanted = false;
    try { this.wanted = storage?.getItem(PREF_KEY) === 'on'; } catch { /* storage is optional */ }
    this.listeners = new Set(); this.engineLevel = 0; this.lastCoinAt = -1; this.flying = false;
  }
  get preferred() { return this.wanted; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { for (const fn of this.listeners) fn(this.enabled); }
  // Call from a user gesture. Returns the new state.
  toggle() { return this.set(!this.enabled); }
  set(on) {
    this.wanted = on;
    try { this.storage?.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* optional */ }
    if (on) this.start(); else this.stop();
    return this.enabled;
  }
  // Resume a remembered preference on the first gesture of a new page.
  resumeIfWanted() { if (this.wanted && !this.enabled) this.start(); }
  start() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
        const ctx = this.ctx = new Ctx();
        this.master = ctx.createGain(); this.master.gain.value = 0;
        this.limiter = ctx.createDynamicsCompressor();
        Object.assign(this.limiter, {}); this.limiter.threshold.value = -14; this.limiter.knee.value = 18; this.limiter.ratio.value = 6; this.limiter.attack.value = .004; this.limiter.release.value = .18;
        this.master.connect(this.limiter); this.limiter.connect(ctx.destination);
        const seconds = 2, buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buffer;
        this.buildBeds();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.enabled = true;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(.9, this.ctx.currentTime, .08);
      this.notify();
    } catch { this.enabled = false; }
  }
  stop() {
    this.enabled = false;
    if (this.ctx) { this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .05); }
    this.notify();
  }
  buildBeds() {
    const ctx = this.ctx;
    // Engine: two detuned saws and a sub sine through a resonant low-pass.
    this.engine = { gain: ctx.createGain(), filter: ctx.createBiquadFilter(), oscs: [] };
    this.engine.filter.type = 'lowpass'; this.engine.filter.Q.value = 4; this.engine.filter.frequency.value = 300;
    this.engine.gain.gain.value = 0; this.engine.filter.connect(this.engine.gain); this.engine.gain.connect(this.master);
    for (const [type, detune, level] of [['sawtooth', -7, .5], ['sawtooth', 7, .5], ['sine', 0, 1.2]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.detune.value = detune; g.gain.value = level;
      o.connect(g); g.connect(this.engine.filter); o.start(); this.engine.oscs.push(o);
    }
    // Wind: band-passed noise that opens up with airspeed.
    this.wind = { gain: ctx.createGain(), filter: ctx.createBiquadFilter() };
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    this.wind.filter.type = 'bandpass'; this.wind.filter.Q.value = .7; this.wind.filter.frequency.value = 500;
    this.wind.gain.gain.value = 0; src.connect(this.wind.filter); this.wind.filter.connect(this.wind.gain); this.wind.gain.connect(this.master); src.start();
  }
  // Per-frame bed control. `speed` in m/s, `energy` 0..1 for boost/overdrive.
  flight(flying, speed = 0, energy = 0, dt = .016) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime, k = Math.min(1, dt * 6);
    const target = flying ? .028 + Math.min(.07, speed / 150 * .06) + energy * .05 : 0;
    this.engineLevel += (target - this.engineLevel) * k;
    this.engine.gain.gain.setTargetAtTime(this.engineLevel, t, .05);
    const pitch = 42 + speed * .55 + energy * 40;
    for (const o of this.engine.oscs) o.frequency.setTargetAtTime(o.type === 'sine' ? pitch : pitch * 2, t, .08);
    this.engine.filter.frequency.setTargetAtTime(220 + speed * 9 + energy * 900, t, .08);
    this.wind.gain.gain.setTargetAtTime(flying ? Math.min(.11, speed / 150 * .1) : 0, t, .1);
    this.wind.filter.frequency.setTargetAtTime(380 + speed * 7, t, .1);
  }
  voice(type, freq, { duration = .2, volume = .05, slide = 0, attack = .005, delay = 0, detune = 0, filter = null } = {}) {
    if (!this.enabled || !this.ctx) return null;
    const ctx = this.ctx, at = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, freq), at); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), at + duration);
    g.gain.setValueAtTime(.0001, at); g.gain.linearRampToValueAtTime(volume, at + attack); g.gain.exponentialRampToValueAtTime(.0001, at + duration);
    let tail = g;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; g.connect(f); tail = f; }
    o.connect(g); tail.connect(this.master); o.start(at); o.stop(at + duration + .05);
    o.onended = () => { o.disconnect(); g.disconnect(); tail.disconnect(); };
    return o;
  }
  hiss({ duration = .3, volume = .06, from = 1200, to = 300, q = 1, delay = 0, type = 'lowpass' } = {}) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, at = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; src.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), at + duration);
    g.gain.setValueAtTime(.0001, at); g.gain.linearRampToValueAtTime(volume, at + .012); g.gain.exponentialRampToValueAtTime(.0001, at + duration);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(at); src.stop(at + duration + .05);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }
  // ---- one-shots -----------------------------------------------------------
  ui() { this.voice('triangle', 620, { duration: .07, volume: .03 }); }
  chargeTick(progress) {
    // A rising click train while holding: faster and brighter near the sweet spot.
    this.voice('square', 180 + progress * 520, { duration: .035, volume: .018 + progress * .02, filter: { type: 'lowpass', freq: 1800 } });
  }
  launch(perfect) {
    this.hiss({ duration: .9, volume: .14, from: 300, to: 3200, q: .8, type: 'bandpass' });
    this.voice('sine', 70, { duration: .55, volume: .16, slide: -40 });
    this.voice('sawtooth', 160, { duration: .7, volume: .05, slide: 420, filter: { type: 'lowpass', freq: 1400 } });
    if (perfect) for (let i = 0; i < 4; i++) this.voice('triangle', note([0, 4, 7, 12][i], 660), { duration: .3, volume: .05, delay: .12 + i * .07 });
  }
  boost() {
    this.hiss({ duration: .6, volume: .12, from: 400, to: 4500, q: 1.2, type: 'bandpass' });
    this.voice('sawtooth', 110, { duration: .55, volume: .06, slide: 330, filter: { type: 'lowpass', freq: 1200 } });
    this.voice('sine', 55, { duration: .4, volume: .12, slide: -20 });
  }
  coin(combo = 0, elapsed = 0) {
    // Repeated pickups climb a pentatonic ladder, resetting after a pause.
    if (elapsed - this.lastCoinAt > 1.4) this.coinStep = 0; else this.coinStep = Math.min(PENTATONIC.length - 1, (this.coinStep || 0) + 1);
    this.lastCoinAt = elapsed;
    const f = note(PENTATONIC[this.coinStep], 880);
    this.voice('sine', f, { duration: .16, volume: .07, attack: .002 });
    this.voice('triangle', f * 2, { duration: .1, volume: .025, delay: .02 });
  }
  pickup() {
    for (let i = 0; i < 3; i++) this.voice('triangle', note([0, 7, 12][i], 523), { duration: .28, volume: .055, delay: i * .055 });
    this.hiss({ duration: .35, volume: .04, from: 2000, to: 6000, type: 'highpass' });
  }
  shot() { this.voice('square', 1500, { duration: .09, volume: .035, slide: -1100 }); this.hiss({ duration: .06, volume: .03, from: 5000, to: 1500, type: 'highpass' }); }
  hit() {
    this.hiss({ duration: .32, volume: .18, from: 2500, to: 150, q: .6 });
    this.voice('square', 120, { duration: .25, volume: .07, slide: -70 });
    this.voice('sine', 48, { duration: .35, volume: .18, slide: -20 });
  }
  explosion(big = false) {
    this.hiss({ duration: big ? .9 : .55, volume: big ? .22 : .16, from: 3000, to: 120, q: .5 });
    this.voice('sine', 60, { duration: .5, volume: .2, slide: -35 });
    this.voice('sawtooth', 220, { duration: .3, volume: .04, slide: -160, filter: { type: 'lowpass', freq: 900 } });
  }
  bounce(strength = .5) { this.voice('sine', 90, { duration: .18, volume: .08 + strength * .08, slide: -50 }); this.hiss({ duration: .12, volume: .05, from: 900, to: 200 }); }
  zone() { for (let i = 0; i < 3; i++) this.voice('triangle', note([0, 4, 7][i], 587), { duration: .5, volume: .06, delay: i * .11 }); this.voice('sine', 587 / 2, { duration: .9, volume: .04, delay: .22 }); }
  overdrive(god = false) {
    const root = god ? 392 : 329;
    for (let i = 0; i < 6; i++) this.voice('sawtooth', note([0, 4, 7, 12, 16, 19][i], root), { duration: .32, volume: .035, delay: i * .06, filter: { type: 'lowpass', freq: 2200 } });
    this.hiss({ duration: 1.2, volume: .08, from: 300, to: 5000, q: 1.5, type: 'bandpass' });
    this.voice('sine', root / 4, { duration: 1.4, volume: .12 });
  }
  nearMiss() { this.hiss({ duration: .28, volume: .09, from: 600, to: 4000, q: 2.5, type: 'bandpass' }); this.voice('sine', 1200, { duration: .14, volume: .035, slide: 500 }); }
  warning() { for (let i = 0; i < 2; i++) this.voice('square', i ? 440 : 330, { duration: .16, volume: .035, delay: i * .18, filter: { type: 'lowpass', freq: 1600 } }); }
  overheat() { this.voice('sawtooth', 160, { duration: .4, volume: .05, slide: -90, filter: { type: 'lowpass', freq: 700, q: 6 } }); }
  shield() { this.voice('triangle', 740, { duration: .35, volume: .06, slide: 300 }); this.hiss({ duration: .3, volume: .05, from: 1500, to: 6000, type: 'highpass' }); }
  finish(good) {
    const chord = good ? [0, 4, 7, 12] : [0, 3, 7, 10];
    chord.forEach((s, i) => this.voice('triangle', note(s, 392), { duration: 1.1, volume: .05, delay: i * .09 }));
  }
  ghostShot() { this.voice('sawtooth', 700, { duration: .2, volume: .04, slide: -480, filter: { type: 'lowpass', freq: 2000 } }); }
}
