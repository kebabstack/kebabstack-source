// Reduce visual cost only after sustained slow rendering; never oscillate during
// a flight. Hidden tabs, pauses and isolated scheduling spikes are not benchmarks.
export class FrameBudget {
  constructor() { this.level = 0; this.clear(); }
  clear() { this.frames = []; this.elapsed = 0; }
  sample(ms, active = true) {
    if (!active || !Number.isFinite(ms) || ms <= 0 || ms > 250) { this.clear(); return false; }
    if (this.level >= 2) return false;
    this.frames.push(ms); this.elapsed += ms;
    if (this.frames.length < 24 || this.elapsed < 800) return false;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const slow = sorted[Math.floor(sorted.length / 2)] > 30;
    this.clear();
    if (slow) { this.level++; return true; }
    return false;
  }
}
