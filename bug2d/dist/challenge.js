const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
// Diminishing returns make a lucky rescue valuable without permitting endless lift chains.
export const pickupPower = run => 1 / (1 + Math.max(0, run.elapsed - 50) / 110);
export const pressureOf = run => clamp(Math.max(run.d / 6200, run.elapsed / 130), 0, 2.2);
export function weatherAt(seed, elapsed) {
  if (elapsed < 12) return { kind: 'calm', label: 'CLEAR AIR', x: 0, forward: 0, lift: 0, warning: false };
  const cycle = Math.floor((elapsed - 12) / 13), time = (elapsed - 12) % 13;
  const hash = (Math.imul((seed >>> 0) ^ Math.imul(cycle + 1, 1597334677), 2654435761) >>> 0);
  const kind = ['tailwind', 'crosswind', 'headwind', 'updraft'][hash % 4], side = hash & 16 ? 1 : -1;
  const strength = time < 2 || time > 9 ? 0 : Math.sin((time - 2) / 7 * Math.PI);
  return { kind, warning: time < 2, label: (time < 2 ? 'INCOMING: ' : '') + ({tailwind:'TAILWIND ↗',crosswind:side > 0 ? 'CROSSWIND →' : 'CROSSWIND ←',headwind:'HEADWIND',updraft:'LUCKY UPDRAFT'})[kind],
    x: kind === 'crosswind' ? side * 9 * strength : 0, forward: (kind === 'tailwind' ? 2.6 : kind === 'headwind' ? -3 : 0) * strength,
    lift: kind === 'updraft' ? 4 * strength : 0 };
}
