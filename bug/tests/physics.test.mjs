import test from 'node:test';
import assert from 'node:assert/strict';
import { STEP, ZONES, createRun, beginCharge, cancelCharge, launch, boost, stepRun, makeObjects, collect, segmentDistanceSq, zoneIndex } from '../src/physics.js';
const DAY = 20703;
function advance(run, seconds, steering = 0, objects = []) { for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(run, STEP, steering, objects); }
function fired(power = 1) { const r = createRun(DAY); beginCharge(r); r.charge = power; launch(r); return r; }

test('hold and release controls launch power; cancelling never launches', () => {
  const low = fired(0), high = fired(1);
  assert.ok(high.speed > low.speed && high.vy > low.vy);
  const r = createRun(DAY); assert.equal(launch(r), false);
  beginCharge(r); advance(r, 1.15); assert.ok(r.charge > .99);
  advance(r, 1.15); assert.ok(r.charge < .01, "holding forever loses the perfect-release window");
  cancelCharge(r); assert.equal(r.phase, 'ready'); assert.equal(r.d, 0);
  assert.equal(boost(r), false); assert.equal(r.prompts, 5);
});
test('exactly five boosts, with no depletion before launch or after completion', () => {
  const r = fired();
  for (let i = 0; i < 5; i++) assert.equal(boost(r), true);
  assert.equal(boost(r), false); assert.equal(r.prompts, 0);
  const speed = r.speed; r.phase = 'done'; assert.equal(boost(r), false); assert.equal(r.speed, speed);
});
test('the UTC seed freezes a complete run and chunks are independent of request order', () => {
  assert.deepEqual(makeObjects(DAY, 7), makeObjects(DAY, 7));
  const chunk = makeObjects(DAY, 2); makeObjects(DAY, 8); makeObjects(DAY, 0);
  assert.deepEqual(chunk, makeObjects(DAY, 2));
  assert.notDeepEqual(chunk, makeObjects(DAY + 1, 2));
  assert.equal(new Set([...chunk, ...makeObjects(DAY, 3)].map(o => o.id)).size, chunk.length + makeObjects(DAY, 3).length);
});
test('fast collisions use the travelled segment and a collectible can only score once', () => {
  assert.equal(segmentDistanceSq({ x: 0, y: 10, d: 0 }, { x: 0, y: 10, d: 100 }, { x: 0, y: 10, d: 50 }), 0);
  const r = fired(); r.speed = 150; r.y = 10; r.vy = 0;
  const object = { id: 'sweep', kind: 'cycle', x: 0, y: 10, d: .65, radius: .15 };
  stepRun(r, STEP, 0, [object]); assert.equal(r.cycles, 10);
  assert.equal(collect(r, object), false); assert.equal(r.cycles, 10);
});
test('steering changes depth-plane position, stays in the corridor, and slows when released', () => {
  const r = fired(); advance(r, 2, 1); assert.ok(r.x > 10); assert.ok(r.x <= 32);
  const initialVx = r.vx; advance(r, .5, 0); assert.ok(Math.abs(r.vx) < Math.abs(initialVx) * .2);
  const left = fired(); advance(left, 2, -1); assert.ok(left.x < -10); assert.ok(left.x >= -32);
});
test('an unassisted run bounces, loses speed and ends instead of rolling forever', () => {
  const r = fired(); advance(r, 100);
  assert.equal(r.phase, 'done'); assert.ok(r.bounces > 0); assert.ok(r.d > 300 && r.d < 1600); assert.ok(r.elapsed < 60);
  const { d, elapsed } = r; advance(r, 20); assert.equal(r.d, d); assert.equal(r.elapsed, elapsed);
});
test('prompt rescues a grounded slowing bug', () => {
  const r = fired(); r.y = 1.15; r.vy = 0; r.speed = .2;
  advance(r, 1); assert.equal(r.phase, 'flying');
  boost(r); advance(r, .5); assert.ok(r.y > 8); assert.ok(r.speed > 20); assert.equal(r.stillTime, 0);
});
test('coffee, portal, hotfix and firewall effects have the documented direction', () => {
  for (const kind of ['coffee', 'portal', 'pad']) {
    const r = fired(); const before = r.speed;
    collect(r, { id: kind, kind }); assert.ok(r.speed > before); assert.ok(r.vy > 0);
  }
  const r = fired(), before = r.speed; r.combo = 4;
  collect(r, { id: 'wall', kind: 'hazard' }); assert.ok(r.speed < before); assert.equal(r.combo, 0);
});
test('all ten story milestones remain ordered and mainnet continues indefinitely', () => {
  assert.equal(ZONES.length, 10); assert.equal(zoneIndex(199.9), 0); assert.equal(zoneIndex(200), 1);
  assert.equal(zoneIndex(4400), 9); assert.equal(zoneIndex(1000000), 9);
  const r = fired(); r.d = 4399.5; stepRun(r, STEP);
  assert.equal(r.zone, 9); assert.ok(r.effects.some(e => e.kind === 'zone' && e.index === 9));
});
test('run restart starts with fresh counters and no collected object state', () => {
  const old = fired(); boost(old); collect(old, { id: 'coin', kind: 'cycle' }); advance(old, 2);
  const fresh = createRun(DAY); assert.equal(fresh.cycles, 0); assert.equal(fresh.prompts, 5); assert.equal(fresh.hits.size, 0); assert.equal(fresh.d, 0);
});
test('invalid wall-clock spikes cannot advance simulation', () => {
  const r = fired(); for (const dt of [NaN, Infinity, -1, 10]) stepRun(r, dt);
  assert.equal(r.d, 0); assert.equal(r.elapsed, 0);
});
test('bounded speed and finite coordinates hold across varied daily worlds', () => {
  for (const day of [DAY, DAY + 1, DAY + 2]) {
    const r = createRun(day); beginCharge(r); r.charge = 1; launch(r);
    const chunks = new Map();
    for (let i = 0; i < 120 * 90 && r.phase === 'flying'; i++) {
      const chunk = Math.floor(r.d / 200);
      for (const n of [chunk - 1, chunk, chunk + 1]) if (n >= 0 && !chunks.has(n)) chunks.set(n, makeObjects(day, n));
      if (i === 480 || i === 1080 || i === 1680) boost(r);
      const objects = [...(chunks.get(chunk - 1) || []), ...chunks.get(chunk), ...chunks.get(chunk + 1)];
      stepRun(r, STEP, Math.sin(i * STEP * .5), objects);
      assert.ok(Number.isFinite(r.d + r.x + r.y + r.speed)); assert.ok(r.y >= 1.15); assert.ok(r.speed >= 0 && r.speed <= 150);
    }
    assert.ok(r.d > 400);
  }
});

test('the ascent starts in Zürich and climbs continuously through the cyber corridor', async () => {
  const { ascentAt, altitudeAt } = await import('../src/physics.js');
  assert.equal(ascentAt(0), 0); assert.equal(ascentAt(120), 0);
  let previous = 0;
  for (let d = 0; d <= 6000; d++) {
    const h = ascentAt(d); assert.ok(h >= previous && h - previous < 1); previous = h;
  }
  assert.equal(ascentAt(1600), 640);
  assert.ok(altitudeAt({ d: 2000, y: 15 }) > 640);
  assert.ok(Math.abs(ascentAt(1600.001) - ascentAt(1599.999)) < .001);
});
test('identity protects exactly one collision and resets cleanly', () => {
  const r = fired(); collect(r, { id: 'key', kind: 'identity' });
  const speed = r.speed; r.combo = 6;
  collect(r, { id: 'first', kind: 'hazard' });
  assert.equal(r.shield, 0); assert.equal(r.speed, speed); assert.equal(r.combo, 6);
  collect(r, { id: 'second', kind: 'hazard' });
  assert.ok(r.speed < speed); assert.equal(r.combo, 0);
  assert.equal(createRun(DAY).shield, 0);
});
test('OISY pulls nearby cycles once, ignores distant ones, and expires', () => {
  const r = fired(); r.y = 20; r.vy = 0; r.speed = 50;
  collect(r, { id: 'wallet', kind: 'oisy' });
  const near = { id: 'near', kind: 'cycle', x: 15, y: 20, d: 2, radius: 2.7 };
  const far = { id: 'far', kind: 'cycle', x: 30, y: 20, d: 2, radius: 2.7 };
  stepRun(r, STEP, 0, [near, far]); assert.equal(r.cycles, 10);
  stepRun(r, STEP, 0, [near, far]); assert.equal(r.cycles, 10);
  advance(r, 8.1); assert.equal(r.magnetTime, 0);
  const plain = fired(); plain.y = 20; plain.vy = 0; plain.speed = 50;
  stepRun(plain, STEP, 0, [near]); assert.equal(plain.cycles, 0);
});
test('a canister stores one rescue, consumes it on landing, and cannot stack', () => {
  const r = fired(); collect(r, { id: 'c1', kind: 'canister' }); collect(r, { id: 'c2', kind: 'canister' });
  assert.equal(r.anchor, 1); r.y = 1.2; r.vy = -20; r.speed = 20;
  stepRun(r, STEP); assert.equal(r.anchor, 0); assert.ok(r.vy >= 30); assert.ok(r.speed > 30 && r.speed < 40, "a rescue adds momentum without restoring a high minimum");
  r.y = 1.2; r.vy = -20; stepRun(r, STEP); assert.ok(r.vy < 15);
  assert.deepEqual([...r.seals], ['canister']);
});
test('each ecosystem sector offers its own collectible mechanic', () => {
  for (const [chunk, kind] of [[2, 'compiler'], [5, 'canister'], [7, 'identity'], [10, 'oisy'], [12, 'fusion'], [15, 'portal'], [19, 'neuron']]) {
    assert.ok(makeObjects(DAY, chunk).some(o => o.kind === kind), `${chunk}: ${kind}`);
  }
  for (const kind of ['compiler', 'fusion', 'neuron']) {
    const r = fired(); collect(r, { id: kind, kind });
    assert.ok(r.speed > fired().speed); assert.ok(r.seals.has(kind));
  }
});
