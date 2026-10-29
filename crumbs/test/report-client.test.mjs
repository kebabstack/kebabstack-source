import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyticsCall} from '../dist/report-client.js';
for(const method of ['report','reportBundle','goalRows','goalReport','funnel','journeys']) {
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

test('oversized bundles split dimensions, preserve intervals and return no partial results',async()=>{
 const token='private',request={site:'example',from:0n,until:2592000n},dimensions=[['',100n],['day',1000n],['path',100n],['source',100n]];
 const seen=[];const actor={reportBundle:async()=>{throw Error('instruction limit');},reportBundleFull:async(t,r,ds)=>{assert.equal(t,token);assert.equal(r,request);seen.push(ds);if(ds.length>1)throw Error('Canister exceeded instruction limit');return {ok:ds.map(([d])=>({dimension:d,totals:{visitors:6611n}}))};}};
 assert.deepEqual((await analyticsCall(actor,'reportBundle',token,request,dimensions)).ok.map(x=>x.dimension),dimensions.map(x=>x[0]));assert.equal(seen.length,7);
 actor.reportBundleFull=async(t,r,ds)=>{if(ds.length>1)throw Error('instruction limit');return ds[0][0]==='path'?{err:{unauthorized:null}}:{ok:[{}]};};
 assert.deepEqual(await analyticsCall(actor,'reportBundle',token,request,dimensions),{err:{unauthorized:null}});
 actor.reportBundleFull=async()=>{throw Error('offline');};await assert.rejects(analyticsCall(actor,'reportBundle',token,request,dimensions),/offline/);
});

test('declared bundle work budget splits without waiting for instruction traps',async()=>{
 const args=['token',{from:0n,until:100n},[['',1n],['path',1n],['day',1n]]];let calls=0;
 const actor={reportBundle:async()=>({err:{capacity:'Report bundle exceeds work budget. Split dimensions, not the date range.'}}),reportBundleFull:async(t,r,ds)=>{calls++;assert.equal(r,args[1]);return ds.length>2?{err:{capacity:'Report bundle exceeds work budget. Split dimensions, not the date range.'}}:{ok:ds.map(([dimension])=>dimension)};}};
 assert.deepEqual(await analyticsCall(actor,'reportBundle',...args),{ok:['','path','day']});assert.equal(calls,3);
});
