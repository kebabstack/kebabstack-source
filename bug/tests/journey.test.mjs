import assert from 'node:assert/strict';
import test from 'node:test';
import { ZONES, POWERUPS } from '../src/ecosystem.js';
import * as flight3D from '../src/physics.js';
import * as flight2D from '../src/two-d/physics.js';

test('both modes cross each archive and mission boundary at the published distance', () => {
  const limits = [0, 200, 500, 900, 1350, 1850, 2400, 3000, 3700, 4400];
  for (const mode of [flight2D, flight3D]) {
    assert.equal(mode.ZONES, ZONES);
    assert.deepEqual(ZONES.map(zone => zone.at), limits);
    for (const [index, at] of limits.entries()) {
      assert.equal(mode.zoneIndex(at - 0.01), Math.max(0, index - 1));
      assert.equal(mode.zoneIndex(at), index);
    }
    assert.equal(mode.zoneIndex(100_000), limits.length - 1);
  }
  const archive = ZONES.filter(zone => zone.chapter === 'history');
  const missions = ZONES.filter(zone => zone.chapter === 'mission');
  assert.deepEqual(ZONES, [...archive, ...missions]);
  assert.deepEqual(archive.map(zone => zone.period), [
    'October 2016', '2019', 'September 2020', '10 May 2021', 'December 2022',
  ]);
  assert.deepEqual(missions.map(zone => zone.period), ['Mission 01', 'Mission 02', 'Mission 03', 'Mission 04', 'Mission 05']);
});

test('every stage has distinct cargo, a field-note source and an implemented special', () => {
  assert.equal(new Set(ZONES.map(zone => zone.token)).size, ZONES.length);
  assert.equal(new Set(ZONES.map(zone => zone.glyph)).size, ZONES.length);
  const specials = new Set(ZONES.map(zone => zone.pickup));
  assert.deepEqual(specials, new Set(Object.keys(POWERUPS)));
  for (const zone of ZONES) {
    assert.ok(zone.token && zone.glyph && zone.fact);
    assert.equal(new URL(zone.url).protocol, 'https:');
  }
  for (const mode of [flight2D, flight3D]) {
    for (const kind of specials) {
      const run = mode.createRun(42);
      run.phase = 'flying';
      assert.equal(mode.collect(run, { id: 'special', kind }), true);
      assert.ok(run.effects.some(effect => effect.kind === kind), kind);
      assert.equal(run.coins, 0);
      assert.equal(mode.collect(run, { id: 'special', kind }), false);
      assert.equal(mode.collect(run, { id: 'token', kind: 'cycle' }), true);
      assert.deepEqual(run.coinIds, ['token']);
      assert.equal(run.coins, 1);
    }
  }
});

for (const [name, game] of [['2D', flight2D], ['3D', flight3D]]) {
  test(name + ' completes a relay only once per chapter using three distinct tokens', () => {
    const run = game.createRun(42);
    run.phase = 'flying';
    const take = (id, d) => game.collect(run, {id, d, kind:'cycle'});
    take('a', 100);
    take('b', 114);
    assert.equal(take('b', 114), false);
    assert.equal(run.magnetTime, 0);
    run.magnetTime = 7;
    take('c', 120);
    assert.equal(run.magnetTime, 7, 'the relay preserves a longer active OISY orb');
    run.magnetTime = 0;
    take('d', 128);
    assert.equal(run.magnetTime, 0, 'a linked station cannot be farmed');
    run.weaponHeat = .8;
    run.speed = 149;
    for (let i = 0; i < 3; i++) take('copper' + i, 250 + i * 8);
    assert.ok(Math.abs(run.weaponHeat - .3) < 1e-6);
    assert.equal(run.speed, 150);
    run.vy = -10;
    for (let i = 0; i < 3; i++) take('sodium' + i, 550 + i * 8);
    assert.ok(run.vy > 0);
    assert.equal(run.coins, 10);
    assert.equal(run.coinIds.length, 10);
    assert.equal(run.effects.filter(e => e.kind === 'relay').length, 3);
    assert.deepEqual([...run.relayTokens.slice(0, 4)], [3, 3, 3, 0]);
    assert.deepEqual([...game.createRun(42).relayTokens], Array(10).fill(0));
  });
}
