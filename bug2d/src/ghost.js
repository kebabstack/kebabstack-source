import { breakFlow } from './overdrive.js';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
// Motoko's original debut stays at 500 m. Later patrols alternate with quiet
// stretches, so a long flight has encounters without an uninterrupted chase.
export const ghostPatrolAt = d => d >= 500 && (d < 1600 || (d >= 2200 && (d - 2200) % 1800 < 1100));
export function newGhost() {
  return { active: false, phase: 'waiting', time: 0, age: 0, fade: 0, x: 0, y: 0, d: 0,
    offsetD: 80, offsetY: 38, targetX: 0, hits: 0, dodges: 0, kills: 0, hp: 2, flash: 0, encounter: 0, shots: [], shotId: 0 };
}
export function ghostTarget(run) {
  const g = run.ghost;
  if (!g?.active || g.fade < .65 || !['orbit', 'warning', 'fire', 'recover'].includes(g.phase)) return null;
  return { id: `ghost:${g.encounter}`, kind: 'ghost', x: g.x, y: g.y, d: g.d, radius: 5 };
}
export function hitGhost(run) {
  const g = run.ghost;
  if (!ghostTarget(run)) return false;
  g.hp--; g.flash = .22;
  if (g.hp <= 0) {
    g.phase = 'banished'; g.time = 0; g.kills++; g.shots.length = 0; run.cycles += 75;
    run.effects.push({ kind: 'ghost-destroy', x: g.x, y: g.y, d: g.d, label: 'GHOST DEBUGGED', sub: '+75 K simulated cycles. Eight seconds of breathing room.' });
  } else run.effects.push({ kind: 'ghost-damage', x: g.x, y: g.y, d: g.d });
  return true;
}
function shoot(run) {
  const g = run.ghost, flightTime = 1.05;
  // Aimed once at the warned lane. Pulses travel independently along the flight
  // corridor; they cannot home onto a player who dodges after the shot is fired.
  const x = g.x, y = g.y + .2, d = g.d - 1.8;
  const targetY = Math.max(1.15, run.y + run.vy * flightTime - 7 * flightTime ** 2);
  g.shots.push({id: ++g.shotId, x, y, d, life: 2,
    vx: (g.targetX - x) / flightTime, vy: (targetY - y) / flightTime,
    vd: run.speed - (d - run.d) / flightTime});
  run.effects.push({kind: 'ghost-shot', x, y, d, label: 'INCOMING PULSE', sub: 'Boost past the pink shot — or debug Motoko with two hits.'});
}
export function stepGhostShots(run, dt, previous = run) {
  const g = run.ghost;
  for (const shot of g.shots) {
    const a = {x: shot.x - previous.x, y: shot.y - previous.y, d: shot.d - previous.d};
    const travel = Math.min(dt, shot.life);
    shot.x += shot.vx * travel; shot.y += shot.vy * travel; shot.d += shot.vd * travel; shot.life -= dt;
    const fraction = travel / dt;
    const b = {x: shot.x - (previous.x + (run.x - previous.x) * fraction),
      y: shot.y - (previous.y + (run.y - previous.y) * fraction), d: shot.d - (previous.d + (run.d - previous.d) * fraction)};
    const dx = b.x - a.x, dy = b.y - a.y, dd = b.d - a.d;
    const t = clamp(-(a.x * dx + a.y * dy + a.d * dd) / (dx * dx + dy * dy + dd * dd || 1), 0, 1);
    if ((a.x + t * dx) ** 2 + (a.y + t * dy) ** 2 + (a.d + t * dd) ** 2 <= 2.5 ** 2) {
      shot.life = 0;
      if (run.shield) { run.shield = 0; run.effects.push({kind: 'shield', label: 'PULSE BLOCKED', sub: 'Identity shield absorbed the shot.'}); }
      else {
        breakFlow(run);
        run.speed *= .67; run.vy = Math.min(run.vy, 3); run.hitTime = .45; run.combo = 0; g.hits++;
        run.effects.push({kind: 'ghost-hit', x: run.x, y: run.y, d: run.d, label: 'MOTOKO PULSE HIT', sub: '33% momentum lost. Boost past the pink projectiles or shoot back.'});
      }
    } else if (shot.life <= 0 || shot.d < run.d - 12) {
      shot.life = 0; g.dodges++;
      run.effects.push({kind: 'ghost-dodge', label: 'CLEAN COMPILE', sub: 'Pulse evaded. Your momentum is safe.'});
    }
  }
  g.shots = g.shots.filter(s => s.life > 0);
}
export function stepGhost(run, dt, previous = run) {
  const g = run.ghost;
  if (run.phase !== 'flying') { g.active = false; g.fade = 0; g.shots.length = 0; return; }
  if (!(dt > 0) || dt > .05) return;
  const patrol = ghostPatrolAt(run.d);
  if (!patrol) g.shots.length = 0;
  stepGhostShots(run, dt, previous);
  if (!g.active) {
    if (!patrol) return;
    g.active = true; g.phase = 'arrive'; g.time = 0; g.age = 0; g.fade = 0;
    g.hp = 2; g.encounter++; g.offsetD = 80; g.offsetY = 38; g.x = 0;
    run.effects.push({ kind: 'ghost-arrive', label: 'MOTOKO HAS FOUND YOU', sub: 'Watch its cannon charge. Boost past the pink pulses or shoot back!' });
  }
  g.time += dt; g.age += dt; g.flash = Math.max(0, g.flash - dt);
  if (!patrol && !['leaving','banished'].includes(g.phase)) { g.phase = 'leaving'; g.time = 0; }
  let x = run.x, ahead = 60, height = 28;
  if (g.phase === 'arrive') {
    x = clamp(run.x + 12, -27, 27); ahead = 64; height = 32; g.fade = Math.min(1, g.time / 1.1);
    if (g.time >= 1.2) { g.phase = 'orbit'; g.time = 0; }
  } else if (g.phase === 'orbit') {
    x = clamp(run.x + Math.sin(g.age * 2.15) * 12, -28, 28);
    ahead = 58 + Math.cos(g.age * .95) * 16; height = 29 + Math.sin(g.age * 1.25) * 9;
    if (g.time >= 1.8) {
      g.phase = 'warning'; g.time = 0; g.targetX = run.x;
      run.effects.push({ kind: 'ghost-warning', label: 'MOTOKO CHARGING', sub: 'Its pink cannon is locked on this lane. Boost at the flash or land two hits.' });
    }
  } else if (g.phase === 'warning') {
    x = g.targetX; ahead = 64; height = 27;
    if (g.time >= 1.25) { shoot(run); g.phase = 'fire'; g.time = 0; }
  } else if (g.phase === 'fire') {
    x = g.targetX; ahead = 72; height = 33;
    if (g.time >= .45) { g.phase = 'recover'; g.time = 0; }
  } else if (g.phase === 'recover') {
    x = clamp(run.x + (Math.sin(g.age) > 0 ? -13 : 13), -28, 28); ahead = 56; height = 36;
    if (g.time >= 3.5) { g.phase = 'orbit'; g.time = 0; }
  } else if (g.phase === 'banished' || g.phase === 'leaving') {
    x = g.x + 10; ahead = 88; height = 48; g.fade = Math.max(0, 1 - g.time / .65);
    if ((g.phase === 'banished' && g.time >= 8) || (g.phase === 'leaving' && g.time >= .65)) { g.active = false; return; }
  }
  // Positions are continuous across phase changes. The companion follows the same
  // altitude-relative flight corridor as the bug, rather than teleporting behind it.
  g.x = 0; // No invisible depth axis in the 2D game.
  g.offsetD = lerp(g.offsetD, ahead, 2.5, dt);
  g.offsetY = lerp(g.offsetY, height, 4, dt);
  g.d = run.d + g.offsetD; g.y = run.y + g.offsetY;
}
