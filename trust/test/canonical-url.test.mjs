import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalDestination} from '../dist/canonical-url.js';
test('Trust domain migration retains public routes without transferring credentials',()=>{
  const target='https://trust.example.test/';
  for(const route of ['devices','checks','ask','enroll','settings','docs','d/device-42'])
    assert.equal(canonicalDestination(target,'https://old.test/?secret=x#/'+route),target+'#/'+route);
  for(const hash of ['#uht='+'ab'.repeat(32),'#/d/'+'ab'.repeat(32),'#/d/device-1&uht=secret','#https://evil.test/','#/d/<script>'])
    assert.equal(canonicalDestination(target,'https://old.test/'+hash),target);
  assert.equal(canonicalDestination(target,target+'#/enroll'),'');
  for(const bad of ['', 'http://trust.test','https://user:secret@trust.test','https://trust.test/path','https://trust.test/?x=1','https://trust.test/#x','javascript:alert(1)'])
    assert.equal(canonicalDestination(bad,'https://old.test/#/enroll'),'');
});
