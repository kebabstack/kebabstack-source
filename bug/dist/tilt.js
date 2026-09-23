// Screen-relative gravity avoids a left/right reversal when the phone rotates.
// No compass, motion recording or network access is needed.
export function screenTilt(beta, gamma, angle = 0) {
  if (![beta, gamma, angle].every(Number.isFinite)) return null;
  const rad = Math.PI / 180, b = beta * rad, g = gamma * rad, a = angle * rad;
  const right = Math.cos(b) * Math.sin(g) * Math.cos(a) + Math.sin(b) * Math.sin(a);
  return Math.asin(Math.max(-1, Math.min(1, right))) / rad;
}

export class TiltSteering {
  constructor({ host = window, now = () => performance.now(), onChange = () => {} } = {}) {
    this.host = host; this.now = now; this.onChange = onChange;
    this.enabled = false; this.pending = false; this.generation = 0;
    this.neutral = null; this.filtered = 0; this.lastAt = null;
    this.listener = event => this.sample(event);
  }
  notify(message) { this.onChange({ enabled: this.enabled, pending: this.pending, ready: this.enabled && this.neutral !== null, message }); }
  angle() { return this.host.screen?.orientation?.angle ?? this.host.orientation ?? 0; }
  async enable() {
    if (this.enabled || this.pending) return;
    const sensor = this.host.DeviceOrientationEvent;
    if (!sensor || !this.host.isSecureContext) { this.notify('Tilt unavailable here. Use the arrows.'); return; }
    const generation = ++this.generation;
    this.pending = true; this.notify('Allow motion, then hold your phone comfortably.');
    try {
      // Called directly by a click: Safari requires transient user activation.
      const permission = typeof sensor.requestPermission === 'function' ? await sensor.requestPermission() : 'granted';
      if (generation !== this.generation) return;
      if (permission !== 'granted') { this.disable('Motion not allowed. Arrow controls are ready.'); return; }
      this.pending = false; this.enabled = true; this.lastAt = null; this.startedAt = this.now();
      this.recenter(); this.host.addEventListener('deviceorientation', this.listener);
      this.watchdog = this.host.setInterval(() => {
        if (this.now() - (this.lastAt ?? this.startedAt) > 3000) this.disable('No motion signal. Use the arrows or retry tilt.');
      }, 250);
    } catch { if (generation === this.generation) this.disable('Motion unavailable. Arrow controls are ready.'); }
  }
  disable(message = 'Arrow controls ready.') {
    this.generation++; this.enabled = false; this.pending = false; this.filtered = 0; this.neutral = null;
    this.host.removeEventListener('deviceorientation', this.listener);
    this.host.clearInterval(this.watchdog); this.notify(message);
  }
  recenter() {
    this.neutral = null; this.filtered = 0; this.screenAngle = this.angle();
    if (this.enabled) this.notify('Hold comfortably. Setting your neutral position…');
  }
  sample(event) {
    if (!this.enabled) return;
    const angle = this.angle(), reading = screenTilt(event.beta, event.gamma, angle);
    if (reading === null) return;
    if (angle !== this.screenAngle) this.recenter();
    const time = this.now(), elapsed = Math.min(100, time - (this.lastAt ?? time));
    this.lastAt = time;
    if (this.neutral === null) {
      this.neutral = reading; this.filtered = 0; this.notify('Tilt steering ready.'); return;
    }
    const delta = reading - this.neutral;
    const target = Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 3) / 18);
    this.filtered += (target - this.filtered) * (1 - Math.exp(-elapsed / 85));
  }
  value() { return this.enabled && this.lastAt !== null && this.now() - this.lastAt < 1000 ? this.filtered : 0; }
}
