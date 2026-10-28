import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyticsCall} from '../dist/report-client.js';
for(const method of ['report','goalRows','goalReport','funnel','journeys']) {
 test(method+': fallback retains credentials/request and returns full result',async()=>{
  const args=['private-token',{site:'example',from:0n,until:1n},'goal'];let called=0;
  const actor={[method]:async()=>({err:{capacity:'Report exceeds 50000 events. Use the full report endpoint; totals were not sampled.'}}),[method+'Full']:async(...actual)=>{assert.deepEqual(actual,args);called++;return {ok:{visitors:70000n}};}};
  assert.deepEqual(await analyticsCall(actor,method,...args),{ok:{visitors:70000n}});assert.equal(called,1);
 });
}
test('fast successes and authorization failures do not invoke full reports',async()=>{
 for(const result of [{ok:{visitors:0n}},{err:{unauthorized:null}},{err:{invalid:'Bad interval'}},{err:{capacity:'Other capacity'}}]){
  const actor={report:async()=>result,reportFull:()=>assert.fail('unexpected fallback')};assert.equal(await analyticsCall(actor,'report','token',{}),result);
 }
});
test('instruction-limit fallback is serialized and does not swallow failures',async()=>{
 let running=0,maximum=0;
 const actor={report:async()=>{throw Error('IC0522: Canister exceeded instruction limit');},reportFull:async()=>{running++;maximum=Math.max(running,maximum);await new Promise(r=>setTimeout(r,5));running--;return {ok:1};}};
 await Promise.all(Array.from({length:4},()=>analyticsCall(actor,'report','token',{})));assert.equal(maximum,1);
 actor.reportFull=async()=>{throw Error('offline');};await assert.rejects(analyticsCall(actor,'report','token',{}),/offline/);
 actor.report=async()=>{throw Error('network timeout');};actor.reportFull=()=>assert.fail();await assert.rejects(analyticsCall(actor,'report','token',{}),/network timeout/);
});
