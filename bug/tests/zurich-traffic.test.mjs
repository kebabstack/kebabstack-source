import test from 'node:test';
import assert from 'node:assert/strict';
import {TRAFFIC_COUNT,trafficPose} from '../src/zurich-traffic.js';

test('city cars follow continuous rounded lanes without jumping, including loop boundaries',()=>{
  for(let i=0;i<TRAFFIC_COUNT;i++)for(let time=0;time<160;time+=.09) {
    const a=trafficPose(time,i),b=trafficPose(time+.001,i);
    const distance=Math.hypot(a.x-b.x,a.z-b.z);
    assert.ok(distance>.0053&&distance<.0063,`car ${i} jumps or stops at ${time}`);
    assert.ok(Math.cos(a.yaw-b.yaw)>.999,'heading must be continuous');
    assert.ok(Math.abs(a.x)<=27&&a.z>=-98&&a.z<=48);
    assert.ok(Math.abs(a.x)>20||a.z< -86||a.z>36,'traffic must stay outside the HQ footprint');
  }
});
test('opposing city lanes and same-lane spacing keep car bodies separated',()=>{
  for(let time=0;time<300;time+=.17) {
    const fleet=Array.from({length:TRAFFIC_COUNT},(_,i)=>trafficPose(time,i));
    for(let i=0;i<fleet.length;i++)for(let j=i+1;j<fleet.length;j++) {
      const a=fleet[i],b=fleet[j],dx=a.x-b.x,dz=a.z-b.z;
      // Oriented-box separating axes, including a small safety margin.
      const axes=[a.yaw,b.yaw].flatMap(y=>[[Math.sin(y),Math.cos(y)],[Math.cos(y),-Math.sin(y)]]);
      const radius=(p,x,z)=>1.9*Math.abs(Math.sin(p.yaw)*x+Math.cos(p.yaw)*z)+.95*Math.abs(Math.cos(p.yaw)*x-Math.sin(p.yaw)*z);
      assert.ok(axes.some(([x,z])=>Math.abs(dx*x+dz*z)>radius(a,x,z)+radius(b,x,z)),`cars ${i}/${j} overlap at ${time}`);
    }
  }
});
