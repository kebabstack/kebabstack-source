import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareFlight } from '../src/result-board.js';
const row = (name, score) => ({name, score:BigInt(score), meters:BigInt(score), coins:0n});
const flight = score => ({name:'Pilot',score,meters:score,coins:0});
test('private result appears between the correct opponents without mutating the public data', () => {
  const rows=[row('First',1000),row('Next',500)]; const before=structuredClone(rows);
  const result=compareFlight(rows,flight(750));
  assert.equal(result.rank,'#2');assert.deepEqual(result.entries.map(r=>r.name),['First','Pilot','Next']);
  assert.equal(result.entries[1].preview,true);assert.deepEqual(rows,before);
});
test('equal points rank behind earlier submissions', () => {
  const result=compareFlight([row('Earlier',500),row('AlsoEarlier',500)],flight(500));
  assert.equal(result.rank,'#3');
});
test('a new best replaces the same pilot in the preview instead of ranking that pilot twice', () => {
  const result=compareFlight([row('First',1000),row('pILOt',500),row('Other',300)],flight(1200),'Pilot');
  assert.equal(result.rank,'#1');assert.equal(result.retained,false);
  assert.equal(result.entries.filter(r=>r.name.toLowerCase()==='pilot').length,1);
});
test('a lower or equal flight preserves the published best and labels the current flight separately', () => {
  for(const score of [900,1200]){
    const result=compareFlight([row('Pilot',1200),row('Other',1000)],flight(score),'Pilot');
    assert.equal(result.rank,'#1');assert.equal(result.retained,true);
    assert.equal(result.entries.find(r=>r.own).score,1200);
    assert.equal(result.entries.find(r=>r.preview).rank,'—');
  }
});
test('a typed but unowned callsign cannot remove another pilot from the comparison', () => {
  const result=compareFlight([row('Pilot',1000)],flight(1200),'');
  assert.equal(result.entries.length,2);assert.equal(result.entries[1].score,1000);
});
test('top100 limit is honest and a distant result still has visible neighbours', () => {
  const rows=Array.from({length:100},(_,i)=>row('Pilot'+i,1000-i));
  const result=compareFlight(rows,flight(100));
  assert.equal(result.rank,'100+');assert.ok(result.entries.some(r=>r.preview));
  assert.ok(result.entries.some(r=>r.name==='Pilot99'));assert.equal(result.condensed,true);
  assert.equal(compareFlight([],flight(0)).rank,'#1');
});
test('a published lower score shows the retained best and submitted flight without a fake new rank', () => {
  const result=compareFlight([row('Pilot',1200),row('Other',1000)],flight(900),'Pilot',true);
  assert.equal(result.retained,true);assert.equal(result.entries.find(r=>r.preview).submitted,true);
});
