// Fixed-size world-space history. Exhaust follows previous engine positions,
// rather than rotating the whole trail when a craft changes direction.
export class WakePath {
  constructor(capacity = 128) {
    this.capacity = capacity;
    this.points = new Float64Array(capacity * 3);
    this.reset();
  }
  reset() { this.head = -1; this.count = 0; }
  push(x, y, z) {
    this.head = (this.head + 1) % this.capacity;
    const i = this.head * 3;
    this.points[i] = x; this.points[i + 1] = y; this.points[i + 2] = z;
    this.count = Math.min(this.count + 1, this.capacity);
  }
  sample(distance, dx, dy, dz, out) {
    const p = this.points;
    let a = this.head * 3;
    for (let n = 1; n < this.count; n++) {
      const b = ((this.head - n + this.capacity) % this.capacity) * 3;
      const length = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
      if (length > distance) {
        const t = distance / length;
        for (let i = 0; i < 3; i++) out[i] = p[a + i] + (p[b + i] - p[a + i]) * t;
        return out;
      }
      if (length > .00001) { dx = (p[b]-p[a])/length; dy = (p[b+1]-p[a+1])/length; dz = (p[b+2]-p[a+2])/length; }
      distance -= length; a = b;
    }
    out[0] = p[a] + dx * distance;
    out[1] = p[a + 1] + dy * distance;
    out[2] = p[a + 2] + dz * distance;
    return out;
  }
}
