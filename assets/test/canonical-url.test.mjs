import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDestination } from '../dist/canonical-url.js';

test('a custom origin keeps safe offer routes, never tokens or queries', () => {
  const target = 'https://assets.example.test/';
  assert.equal(canonicalDestination(target, 'https://old.example.test/?secret=x#/offers/4'), target + '#/offers/4');
  assert.equal(canonicalDestination(target, 'https://old.example.test/#/d/17'), target + '#/d/17');
  for (const hash of ['#uht=' + 'ab'.repeat(32), '#/offers/4&uht=secret', '#https://evil.test/', '#/offers/<script>']) {
    assert.equal(canonicalDestination(target, 'https://old.example.test/' + hash), target);
  }
  assert.equal(canonicalDestination(target, target + '#/offers/4'), '', 'no redirect on the canonical origin');
  for (const bad of ['', 'http://assets.test', 'https://user:secret@assets.test', 'https://assets.test/path', 'https://assets.test/?x=1', 'https://assets.test/#x', 'javascript:alert(1)']) {
    assert.equal(canonicalDestination(bad, 'https://old.example.test/#/offers/4'), '', 'reject invalid configuration: ' + bad);
  }
});
