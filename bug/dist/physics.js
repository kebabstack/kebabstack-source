import { pickupPower, pressureOf, weatherAt } from './challenge.js';
import { newGhost, stepGhost, ghostTarget, hitGhost } from './ghost.js';
import { burnRate } from './scoring.js';
import { makeMines } from './mines.js';
import { newFlow, flowCoin, breakFlow, flowNearMiss, stepFlow } from './overdrive.js';
export const VERSION = '0.17.5';
export const PROMPT_BOOSTS = 5;
export const STEP = 1 / 120;
export const START_HEIGHT = 21.2;
export const GRAVITY = 10.5;
export const needsBoost = run => run.phase === 'flying' && run.prompts > 0 && run.y <= 3 && run.vy <= 2 && run.speed < 12;
export const RESCUE_SECONDS = 1.6;
function settle(run, dt) {
  breakFlow(run);
  run.speed = 0; run.vx = 0; run.vy = 0; run.stillTime += dt;
  run.projectiles.length = 0; run.ghost.shots.length = 0; run.ghost.active = false; run.ghost.fade = 0;
  if (run.stillTime >= (run.prompts > 0 ? RESCUE_SECONDS : .25)) {
    run.phase = 'done'; run.effects.push({kind: 'done'});
  }
}
export { ZONES } from './ecosystem.js';
import { ZONES } from './ecosystem.js';
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function ascentAt(distance) {
  const t = clamp((distance - 120) / 1480, 0, 1);
  return 640 * t * t * (3 - 2 * t) + Math.max(0, distance - 1600) * .065;
}
export const altitudeAt = run => run.y + ascentAt(run.d);
export function zoneIndex(distance) {
  let i = 0;
  for (let n = 1; n < ZONES.length; n++) if (distance >= ZONES[n].at) i = n;
  return i;
}
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function createRun(day = Math.floor(Date.now() / 86400000), seed = day) {
  return { phase: 'ready', day, seed, chargeTime: 0, weaponHeat: 0, overheated: false, overheats: 0, wind: weatherAt(seed, 0), wallDamage: new Map(), x: 0, y: START_HEIGHT, d: 0, vx: 0, vy: 0, speed: 0,
    charge: 0, angle: 38, elapsed: 0, prompts: PROMPT_BOOSTS, cycles: 0, coins: 0, coinIds: [], burnTotal: 0, ghost: newGhost(), flow: newFlow(), combo: 0,
    bounces: 0, highest: START_HEIGHT, zone: 0, stillTime: 0, effects: [], hits: new Set(), minesCleared: 0, mineHits: 0, mineWarning: false,
    trail: [], trailClock: 0, boostTime: 0, hitTime: 0, shield: 0, magnetTime: 0, anchor: 0, seals: new Set(), projectiles: [], shotCooldown: 0, shotsFired: 0, destroyed: 0 };
}
export function beginCharge(run) {
  if (run.phase !== 'ready') return false;
  run.phase = 'charging'; run.charge = 0; run.chargeTime = 0;
  return true;
}
export function cancelCharge(run) {
  if (run.phase === 'charging') { run.phase = 'ready'; run.charge = 0; }
}
export function launch(run) {
  if (run.phase !== 'charging') return false;
  const power = 47 + 35 * run.charge + (run.charge >= .94 ? 7 : 0);
  const angle = clamp(run.angle, 25, 60) * Math.PI / 180;
  run.speed = Math.cos(angle) * power;
  run.vy = Math.sin(angle) * power * 0.72;
  run.phase = 'flying';
  run.effects.push({ kind: 'launch', label: run.charge >= .94 ? 'PERFECT DEPLOY' : 'DEPLOYING BUG…', sub: run.charge >= .94 ? 'You nailed the release. Extra launch momentum!' : 'Read the route. Save your boosts.' });
  return true;
}
export function boost(run) {
  if (run.phase !== 'flying' || run.prompts <= 0) return false;
  run.prompts--;
  run.speed = Math.min(150, run.speed + 31);
  run.vy = Math.max(run.vy, 7) + 19;
  run.boostTime = 0.65;
  run.stillTime = 0;
  run.effects.push({ kind: 'boost', label: 'PROMPT ACCEPTED', sub: ['Make it fly.', 'More ambition.', 'Make it better.', 'One more prompt…', 'Ship it!'][PROMPT_BOOSTS - 1 - run.prompts] });
  return true;
}
export function segmentDistanceSq(a, b, point) {
  const dx = b.x - a.x, dy = b.y - a.y, dd = b.d - a.d;
  const denom = dx * dx + dy * dy + dd * dd;
  const t = denom > 0 ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy + (point.d - a.d) * dd) / denom, 0, 1) : 0;
  return (a.x + t * dx - point.x) ** 2 + (a.y + t * dy - point.y) ** 2 + (a.d + t * dd - point.d) ** 2;
}
export const SHOT_INTERVAL = .22;
function objectHit(a, b, obj, margin, world = false) {
  const point = {x:obj.x, y:obj.y + (world ? ascentAt(obj.d) : 0), d:obj.d};
  const reach = obj.radius + margin;
  // Mines are broad, low hulls. Flying clearly above one must be a real escape,
  // not a hit against an invisible sphere much taller than the visible model.
  if (obj.kind === 'mine') {
    const scale = reach / (1.5 + margin);
    return segmentDistanceSq({...a,y:a.y*scale}, {...b,y:b.y*scale}, {...point,y:point.y*scale}) <= reach ** 2;
  }
  return segmentDistanceSq(a,b,point) <= reach ** 2;
}
export function findTarget(run, objects = []) {
  if (run.phase !== 'flying' || run.stillTime > 0) return null;
  let target = null, best = Infinity;
  for (const obj of [...objects, ghostTarget(run)].filter(Boolean)) {
    if (!['hazard', 'ghost', 'mine'].includes(obj.kind) || run.hits.has(obj.id)) continue;
    const d = obj.d - run.d, dx = Math.abs(obj.x - run.x), dy = Math.abs(obj.y - run.y);
    if (d < 3 || d > (obj.kind==='ghost'?160:105) || dx > (obj.kind==='ghost'?8+d*.22:5+d*.12) || dy > (obj.kind==='ghost'?14+d*.5:8+d*.32)) continue;
    const rank = d + dx * 2 + dy;
    if (rank < best) { target = obj; best = rank; }
  }
  return target;
}
function ghostAim(run, shot, ghost, speed) {
  // Lead the craft's actual flight, not the bug's motion. Short prediction plus
  // limited homing leaves a real projectile and makes a fast strafing pass hittable.
  const gx=ghost.x-shot.x,gy=ghost.y+ascentAt(ghost.d)-shot.y,gd=ghost.d-shot.d;
  const vx=ghost.vx||0,vd=ghost.vd||0,vy=(ghost.vy||0)+vd*(ascentAt(ghost.d+1)-ascentAt(ghost.d));
  const a=vx*vx+vy*vy+vd*vd-speed*speed,b=2*(gx*vx+gy*vy+gd*vd),c=gx*gx+gy*gy+gd*gd;
  const disc=b*b-4*a*c,roots=disc>=0&&Math.abs(a)>1e-6?[(-b+Math.sqrt(disc))/(2*a),(-b-Math.sqrt(disc))/(2*a)]:[];
  const positive=roots.filter(t=>t>0);const time=clamp(positive.length?Math.min(...positive):Math.sqrt(c)/speed,0,.35);
  return {dx:gx+vx*time,dy:gy+vy*time,dd:gd+vd*time};
}
export function fire(run, objects = []) {
  if (run.phase !== 'flying' || run.stillTime > 0 || run.shotCooldown > 0 || run.overheated || run.projectiles.length >= 6) return false;
  const target = findTarget(run, objects), height = altitudeAt(run) + .4;
  let dx = 0, dy = ascentAt(run.d + 1) - ascentAt(run.d), dd = 1;
  if (target) { dx = target.x - run.x; dy = target.y + ascentAt(target.d) - height; dd = target.d - run.d; }
  const speed = 290 + run.speed;
  if (target?.kind === 'ghost') ({dx,dy,dd}=ghostAim(run,{x:run.x,d:run.d,y:height},target,speed));
  const length = Math.hypot(dx, dy, dd);
  run.shotsFired++; run.shotCooldown = SHOT_INTERVAL;
  run.weaponHeat = Math.min(1, run.weaponHeat + .24);
  if (run.weaponHeat >= .99) { run.overheated = true; run.overheats++; run.effects.push({kind:'overheat',label:'BLASTER OVERHEATED',sub:'Let it cool. Steer around the next threat.'}); }
  run.projectiles.push({ id: run.shotsFired, x: run.x, y: height, d: run.d,
    vx: dx / length * speed, vy: dy / length * speed, vd: dd / length * speed, life: 1.05, targetId: target?.kind === 'ghost' ? target.id : null });
  run.effects.push({ kind: 'shot', x: run.x, y: height, d: run.d });
  return true;
}
export function stepProjectiles(run, dt, objects) {
  for (const shot of run.projectiles) {
    const before = { x: shot.x, y: shot.y, d: shot.d };
    const ghost = ghostTarget(run);
    // Only pulses already aimed at Motoko track its motion; ordinary shots cannot
    // turn into auto-hits. Modest homing keeps a visible moving target shootable.
    if (ghost && shot.targetId === ghost.id && ghost.d > shot.d) {
      const speed = 290 + run.speed, {dx,dy,dd}=ghostAim(run,shot,ghost,speed);
      const length = Math.hypot(dx, dy, dd), blend = 1 - Math.exp(-18 * dt);
      shot.vx += (dx / length * speed - shot.vx) * blend;
      shot.vy += (dy / length * speed - shot.vy) * blend;
      shot.vd += (dd / length * speed - shot.vd) * blend;
    }
    const travelTime = Math.min(dt, shot.life);
    shot.x += shot.vx * travelTime; shot.y += shot.vy * travelTime; shot.d += shot.vd * travelTime;
    shot.life -= dt;
    let hit = null;
    for (const obj of [...objects, ghost].filter(Boolean)) {
      if (!['hazard', 'ghost', 'mine'].includes(obj.kind) || run.hits.has(obj.id) || obj.d < before.d - 5 || obj.d > shot.d + 5) continue;
      if (objectHit(before, shot, obj, .5, true) && (!hit || obj.d < hit.d)) hit = obj;
    }
    if (hit) {
      shot.life = 0;
      if (hit.kind === 'ghost') hitGhost(run);
      else if (hit.kind === 'mine') {
        run.hits.add(hit.id); run.minesCleared++; run.cycles += 15;
        run.effects.push({ kind: 'mine-destroy', id: hit.id, x: hit.x, y: hit.y, d: hit.d, label: 'EXPLOIT DEFUSED', sub: '+15 K simulated cycles. One less nasty surprise.' });
      } else {
        const damage = (run.wallDamage.get(hit.id) || 0) + 1; run.wallDamage.set(hit.id, damage);
        if (damage >= (hit.hp || 1)) {
          run.hits.add(hit.id); run.destroyed++; run.cycles += 25;
          run.effects.push({ kind: 'destroy', id: hit.id, x: hit.x, y: hit.y, d: hit.d, label: 'FIREWALL PATCHED', sub: '+25 K simulated cycles. Corridor clear.' });
        } else run.effects.push({ kind: 'wall-damage', id: hit.id, x: hit.x, y: hit.y, d: hit.d });
      }
    }
  }
  run.projectiles = run.projectiles.filter(s => s.life > 0);
}
export function collect(run, obj) {
  if (run.hits.has(obj.id) || run.phase !== 'flying') return false;
  run.hits.add(obj.id);
  const power = pickupPower(run);
  if (!['cycle', 'pad', 'hazard', 'mine'].includes(obj.kind)) run.seals.add(obj.kind);
  if (obj.kind === 'cycle') {
    run.coins++; run.coinIds.push(obj.id); run.cycles += 10; run.combo++;
    flowCoin(run);
  } else if (obj.kind === 'coffee') {
    run.speed = Math.min(150, run.speed + 15 * power); run.vy = Math.max(8 * power, run.vy) + 7 * power;
    run.effects.push({ kind: 'coffee', label: 'CAFFEINE BOOST', sub: '+200% productivity. Allegedly.' });
  } else if (obj.kind === 'portal') {
    run.speed = Math.min(150, run.speed + 24 * power); run.vy = Math.max(12 * power, run.vy); run.cycles += 50;
    run.effects.push({ kind: 'portal', label: 'CLOUD ENGINE ONLINE', sub: '+50 K cycles. Infinite ambition.' });
  } else if (obj.kind === 'compiler') {
    run.speed = Math.min(150, run.speed + 22 * power); run.vy = Math.max(23 * power, run.vy);
    run.effects.push({ kind: 'compiler', label: 'MOTOKO COMPILED', sub: 'Zero errors. One very persistent bug.' });
  } else if (obj.kind === 'canister') {
    run.anchor = 1; run.speed = Math.min(150, run.speed + 12 * power);
    run.effects.push({ kind: 'canister', label: 'STATE PRESERVED', sub: 'One emergency bounce stored.' });
  } else if (obj.kind === 'identity') {
    run.shield = 1; run.speed = Math.min(150, run.speed + 12 * power);
    run.effects.push({ kind: 'identity', label: 'IDENTITY SHIELD', sub: 'Your next hazard collision is covered.' });
  } else if (obj.kind === 'oisy') {
    run.magnetTime = 8; run.speed = Math.min(150, run.speed + 14 * power);
    run.effects.push({ kind: 'oisy', label: 'OISY MAGNET', sub: 'Nearby cycles come to you. For 8 seconds.' });
  } else if (obj.kind === 'fusion') {
    run.speed = Math.min(150, run.speed + 35 * power); run.vy = Math.max(24 * power, run.vy); run.boostTime = 1;
    run.effects.push({ kind: 'fusion', label: 'CHAIN FUSION', sub: 'BTC × ETH × ICP. Crossing complete.' });
  } else if (obj.kind === 'neuron') {
    run.cycles += 50; run.speed = Math.min(150, run.speed + 18 * power); run.vy = Math.max(15 * power, run.vy);
    run.effects.push({ kind: 'neuron', label: 'PROPOSAL ADOPTED', sub: 'The bug is officially a feature. +50 K.' });
  } else if (obj.kind === 'pad') {
    run.speed = Math.min(150, run.speed + 13 * power); run.vy = 25 * power;
    run.effects.push({ kind: 'pad', label: 'HOTFIX DEPLOYED', sub: 'Introduced two new bugs.' });
  } else if (obj.kind === 'hazard' || obj.kind === 'mine') {
    if (run.shield) {
      run.shield = 0;
      run.effects.push({ kind: 'shield', label: 'SHIELD ABSORBED THE HIT', sub: 'Access granted. Carry on.' });
    } else {
      breakFlow(run);
      run.speed *= obj.kind === 'mine' ? .6 : .55; run.vy = Math.min(2, run.vy); run.combo = 0; run.hitTime = 0.4;
      if (obj.kind === 'mine') { run.mineHits++; run.effects.push({ kind: 'mine-hit', x: obj.x, y: obj.y, d: obj.d, label: 'EXPLOIT MINE', sub: '40% momentum lost. Find the gap or fire one pulse.' }); }
      else run.effects.push({ kind: 'hazard', label: 'FIREWALL', sub: 'Have you tried opening port 443?' });
    }
  }
  run.effects.push({ kind: 'collect', id: obj.id, type: obj.kind, x: obj.x, y: obj.y, d: obj.d });
  return true;
}
export function stepRun(run, dt, steering = 0, objects = []) {
  if (!(dt > 0) || dt > 0.05 || !Number.isFinite(dt)) return;
  if (run.phase === 'charging') { run.chargeTime += dt; run.charge = (1 - Math.cos(run.chargeTime / 1.15 * Math.PI)) / 2; return; }
  if (run.phase !== 'flying') return;
  run.elapsed += dt;
  run.shotCooldown = Math.max(0, run.shotCooldown - dt);
  run.weaponHeat = Math.max(0, run.weaponHeat - (run.overheated ? .34 : .26) * dt);
  if (run.overheated && run.weaponHeat <= .16) run.overheated = false;
  run.wind = weatherAt(run.seed, run.elapsed);
  const pressure = pressureOf(run);
  run.boostTime = Math.max(0, run.boostTime - dt);
  run.hitTime = Math.max(0, run.hitTime - dt);
  run.magnetTime = Math.max(0, run.magnetTime - dt);
  // Once the grounded bug has spent its useful momentum, hold a fixed landing
  // position. Wind and held steering cannot stretch this into a sideways crawl.
  if (run.stillTime > 0) { run.burnTotal += burnRate(run) * dt; settle(run, dt); return; }
  const before = { x: run.x, y: run.y, d: run.d };
  run.vx += (clamp(steering, -1, 1) * 24 + run.wind.x - run.vx) * (1 - Math.exp(-4.5 * dt));
  run.x = clamp(run.x + run.vx * dt, -32, 32);
  const drive=run.flow.active>0?pickupPower(run):0;
  run.vy -= (GRAVITY - run.wind.lift - drive*2) * dt;
  run.speed = clamp(run.speed * Math.exp(-(.011 + pressure * .014) * dt) + (run.wind.forward+drive*4)*dt, 0, 150);
  run.d += run.speed * dt;
  run.y += run.vy * dt;
  if (run.y <= 1.15) {
    run.y = 1.15;
    if (run.anchor && run.vy < -5) {
      run.anchor = 0; run.vy = 30 * pickupPower(run); run.speed = Math.min(150, run.speed + 16 * pickupPower(run));
      run.bounces++;
      run.effects.push({ kind: 'canister', label: 'STATE RESTORED', sub: 'Your canister saved the flight.' });
    } else if (run.vy < -5) {
      run.vy *= -0.59; run.speed *= Math.max(.7, .91 - pressure * .07); run.bounces++;
      run.effects.push({ kind: 'bounce', strength: Math.min(1, run.vy / 20) });
    } else {
      run.vy = 0; run.speed = Math.max(0, run.speed * Math.exp(-0.8 * dt) - 2 * dt);
    }
  }
  stepProjectiles(run, dt, objects);
  if (!run.mineWarning && objects.some(obj => obj.kind === 'mine' && obj.d > run.d && obj.d < run.d + 90)) {
    run.mineWarning = true;
    run.effects.push({kind: 'mine-warning', label: 'EXPLOIT MINES AHEAD', sub: 'Red rings mark danger. Find a gap, fly over or clear one with a pulse.'});
  }
  for (const obj of objects) {
    const reach = obj.kind === 'cycle' && run.magnetTime > 0 ? 18 : obj.radius + 1.25;
    if (run.hits.has(obj.id) || obj.d < before.d - reach || obj.d > run.d + reach) continue;
    if (obj.kind === 'mine' ? objectHit(before, run, obj, 1.25) : segmentDistanceSq(before, run, obj) <= reach ** 2) collect(run, obj);
  }
  stepGhost(run, dt, before);
  // Track the near edge, but award only after the whole hazard has been passed.
  // Hits and shot-down objects cannot be farmed as clean dodges.
  for(const obj of objects) {
    if(!['mine','hazard'].includes(obj.kind))continue;
    if(run.hits.has(obj.id)){run.flow.pending.delete(obj.id);continue;}
    if(run.speed>=15&&run.flow.active===0&&run.flow.cooldown===0&&objectHit(before,run,obj,3.5)&&!objectHit(before,run,obj,1.25))
      run.flow.pending.set(obj.id,obj.d+obj.radius+4);
  }
  for(const [id,end] of run.flow.pending)if(run.d>end)flowNearMiss(run,id);
  stepFlow(run,dt);
  run.burnTotal += burnRate(run) * dt;
  run.highest = Math.max(run.highest, altitudeAt(run));
  const zi = zoneIndex(run.d);
  if (zi > run.zone) { run.zone = zi; run.effects.push({ kind: 'zone', index: zi }); }
  if (run.y <= 1.2 && run.vy <= 0 && run.speed < 6) settle(run, dt);
  run.trailClock += dt;
  if (run.trailClock > 0.22) {
    run.trailClock = 0;
    if (run.trail.length < 16000) run.trail.push([+run.d.toFixed(1), +run.x.toFixed(1), +run.y.toFixed(1)]);
  }
}
export function makeObjects(day, chunk) {
  const random = seededRandom(Math.imul(day + 1, 2654435761) ^ Math.imul(chunk + 11, 1597334677));
  const objects = [], start = chunk * 200;
  let id = 0;
  const add = (kind, x, y, d, radius) => objects.push({ id: `${day}:${chunk}:${id++}`, kind, x, y, d, radius });
  for (let lane = -1; lane <= 1; lane++) {
    const x = lane * 17 + (random() - 0.5) * 4;
    const baseY = chunk === 0 ? 26 + (lane + 1) * 8 : 9 + random() * 32;
    for (let i = 0; i < 7; i++) add('cycle', x, baseY + Math.sin(i / 6 * Math.PI) * 9, start + 50 + i * 8, 2.7);
  }
  const zone = zoneIndex(start + 176);
  const special = ['portal', 'coffee', 'compiler', 'canister', 'identity', 'oisy', 'fusion', 'portal', 'neuron', 'fusion'][zone];
  if (random() < .84) add('coffee', (random() - .5) * 40, 6 + random() * 22, start + 123, 3.3);
  add(special, (random() - .5) * 38, 6 + random() * 22, start + 176, 4.2);
  if (chunk > 1 && chunk < 20 && random() < .35) add(special, (random() - .5) * 44, 5, start + 112, 4);
  // A visible low route offers recovery choices, without replenishing manual boosts.
  const floorLane = [-17,0,17][Math.floor(random()*3)];
  if (random() < .8) add('pad', floorLane, 1.5, start + 140, 5);
  if (chunk > 0 && chunk % 3 === 1) add('coffee', -floorLane, 3.2, start + 182, 4.3);
  if (chunk > 0) {
    const rows = chunk < 4 ? 1 : chunk < 12 ? 2 : 3;
    for (let i = 0; i < rows; i++) {
      const lane = Math.floor(random() * 3) - 1;
      add('hazard', lane * 17 + (random() - .5) * 5, 5 + random() * 23, start + 32 + i * 55, 4);
      objects.at(-1).hp = chunk >= 7 ? 2 : 1;
    }
  }
  // Coins are generated first: their IDs and forward positions remain valid on the server.
  return objects.concat(makeMines(day, chunk));
}
