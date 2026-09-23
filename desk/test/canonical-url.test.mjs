import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDestination } from '../dist/canonical-url.js';

test('a custom origin keeps safe ticket routes, never tokens or queries', () => {
  const target = 'https://desk.example.test/';
  assert.equal(canonicalDestination(target, 'https://old.example.test/?secret=x#/t/4'), target + '#/t/4');
  assert.equal(canonicalDestination(target, 'https://old.example.test/#/new/17'), target + '#/new/17');
  for (const hash of ['#uht=' + 'ab'.repeat(32), '#/t/4&uht=secret', '#https://evil.test/', '#/t/<script>']) {
    assert.equal(canonicalDestination(target, 'https://old.example.test/' + hash), target);
  }
  assert.equal(canonicalDestination(target, target + '#/t/4'), '', 'no redirect on the canonical origin');
  for (const bad of ['', 'http://desk.test', 'https://user:secret@desk.test', 'https://desk.test/path', 'https://desk.test/?x=1', 'https://desk.test/#x', 'javascript:alert(1)']) {
    assert.equal(canonicalDestination(bad, 'https://old.example.test/#/t/4'), '', 'reject invalid configuration: ' + bad);
  }
});

// Payroll and on-call deep links must survive the canonical-domain handoff.
test('reporting and on-call routes survive a canonical redirect without carrying credentials',()=>{
 for(const route of ['#/reporting/2','#/reporting/project-1','#/reporting/new-1','#/oncall/1/incident-2']){
  assert.equal(canonicalDestination('https://desk.test','https://old.test/?ticket=secret'+route),'https://desk.test/'+route);
 }
});
