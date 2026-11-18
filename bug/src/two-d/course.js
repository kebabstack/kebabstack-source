// A 2D score needs a 2D course: refuel, read one obstacle, recover.
// Each 2,400 m phrase includes a separate Motoko encounter and long open arcs.
export const ghostPatrolAt = d => d >= 500 && (d - 500) % 2400 < 650;
export const hazardChunk = chunk => [1, 7, 10].includes(chunk % 12);

export function courseObjects(seed, chunk, random, special) {
  const objects = [], start = chunk * 200;
  const add = (kind, y, offset, radius, extra = {}) => objects.push({
    id: `${seed}:${chunk}:${objects.length}`, kind, x: 0, y, d: start + offset, radius, ...extra
  });
  // IDs and distance slots are validated by the score service. Angle and charge
  // change altitude, so fan out the opening lanes along three real launch arcs.
  const rise = random() * 4;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
    const t = i / 6, bow = 4 * t * (1 - t);
    let y;
    if (chunk === 0) y = [45, 52, 63][row] + [1.5, 10, 16.5][row] * t + bow;
    else if (chunk === 1) y = [54, 77, 99][row] + (8 - row * 6) * t + bow * 2;
    else {
      const slope = chunk % 3 === 0 ? -1 : 1;
      y = [8, 32, 62][row] + rise + slope * (t - .5) * (4 + row * 3) + bow * (3 + row);
    }
    add('cycle', y, 50 + i * 8, 2.7);
  }
  if (chunk % 4 === 0) {
    // A tall visible current catches actual launch arcs, not just a tiny pickup
    // hidden far below the bug. Once per crossing, never a continuous motor.
    const top = chunk === 0 ? 130 : 104;
    // The launch current assists all starts. Later currents reward an airborne
    // approach; a slow ground bounce cannot repeatedly refill an unattended run.
    const bottom = chunk === 0 ? 10 : 38;
    add('updraft', (bottom + top) / 2, 160, 4, { bottom, top });
  } else {
    add(special, 18 + random() * 13, hazardChunk(chunk) ? 176 : 160, 5);
  }
  if (chunk % 4 === 3 || chunk % 4 === 1) add('pad', 1.5, 184, 5);
  if (hazardChunk(chunk)) {
    const phrase = Math.floor(chunk / 12), slot = chunk % 12;
    const mine = (phrase + slot) % 2 === 0;
    add(mine ? 'mine' : 'hazard', mine ? (slot === 10 ? 1.8 : 28) : 22 + random() * 12,
      116, 4, { hp: phrase > 1 && !mine ? 2 : 1, airborne: mine && slot !== 10 });
  }
  return objects;
}

// Swept narrow rectangle matches the current's visible vertical ribbon.
export function crossesCurrent(a, b, object, margin = 0) {
  let enter = 0, leave = 1;
  for (const [axis, low, high] of [
    ['d', object.d - object.radius - margin, object.d + object.radius + margin],
    ['y', object.bottom - margin, object.top + margin]
  ]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) { if (a[axis] < low || a[axis] > high) return false; }
    else {
      const t1 = (low - a[axis]) / delta, t2 = (high - a[axis]) / delta;
      enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave) return false;
    }
  }
  return true;
}
