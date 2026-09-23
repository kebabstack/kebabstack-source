import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { TiltSteering, screenTilt } from '../src/tilt.js';
import { bindPress, protectGameSurface } from '../src/touch-controls.js';

function rig(permission = async () => 'granted') {
  let time = 0, watchdog, requests = 0;
  const host = new EventTarget(), messages = [];
  Object.assign(host, { isSecureContext: true, screen: { orientation: { angle: 0 } },
    DeviceOrientationEvent: { requestPermission() { requests++; return permission(); } },
    setInterval(fn) { watchdog = fn; return 1; }, clearInterval() { watchdog = null; }
  });
  const tilt = new TiltSteering({host, now: () => time, onChange: state => messages.push(state)});
  const sample = (beta, gamma, ms = 100) => { time += ms; const event = new Event('deviceorientation'); Object.assign(event, {beta,gamma}); host.dispatchEvent(event); };
  return {host, tilt, sample, messages, advance: ms => { time += ms; watchdog?.(); }, requests: () => requests};
}
test('screen-relative tilt keeps both landscape orientations and upside-down portrait consistent', () => {
  assert.ok(screenTilt(0,20,0)>19);
  assert.ok(screenTilt(20,0,90)>19);
  assert.ok(screenTilt(-20,0,270)>19);
  assert.ok(screenTilt(0,-20,180)>19);
  assert.equal(screenTilt(null,10),null); assert.equal(screenTilt(10,NaN),null);
  assert.ok(Number.isFinite(screenTilt(89.9,89.9,90)));
});
test('tilt requests access only on activation, calibrates to current grip, filters jitter and recenters', async () => {
  const r = rig(); assert.equal(r.requests(),0); assert.equal(r.tilt.value(),0);
  const enabling = r.tilt.enable(); assert.equal(r.requests(),1); await enabling;
  r.sample(30,10); r.sample(30,11); assert.equal(r.tilt.value(),0);
  for(let i=0;i<8;i++) r.sample(30,40);
  assert.ok(r.tilt.value()>.9);
  r.tilt.recenter(); assert.equal(r.tilt.value(),0); r.sample(30,40); assert.equal(r.tilt.value(),0);
  for(let i=0;i<8;i++) r.sample(30,0);
  assert.ok(r.tilt.value()<-.9);
});
test('screen rotation recalibrates instead of producing a violent steering jump', async () => {
  const r=rig(); await r.tilt.enable(); r.sample(30,0); r.sample(30,40);
  assert.ok(r.tilt.value()>0); r.host.screen.orientation.angle=90;
  r.sample(40,30); assert.equal(r.tilt.value(),0); r.sample(60,30); assert.ok(r.tilt.value()>0);
});
test('denied, rejected and unavailable sensors leave the arrow fallback usable', async () => {
  for(const permission of [async()=>'denied',async()=>{throw Error('refused');}]) {
    const r=rig(permission); await r.tilt.enable(); assert.equal(r.tilt.enabled,false);
    assert.match(r.messages.at(-1).message,/Arrow/); assert.equal(r.tilt.value(),0);
  }
  const r=rig(); delete r.host.DeviceOrientationEvent; await r.tilt.enable(); assert.equal(r.requests(),0);
  assert.match(r.messages.at(-1).message,/unavailable/);
});
test('a delayed permission response cannot reenable controls after cancellation', async () => {
  let resolve; const r=rig(()=>new Promise(r=>resolve=r)); const promise=r.tilt.enable();
  r.tilt.disable(); resolve('granted'); await promise; r.sample(0,30); assert.equal(r.tilt.enabled,false);
});
test('no sensor events, null data or a stale sensor stop steering and explain the fallback', async () => {
  const r=rig(); await r.tilt.enable(); r.sample(null,null); r.advance(3100);
  assert.equal(r.tilt.enabled,false); assert.match(r.messages.at(-1).message,/No motion signal/);
  await r.tilt.enable(); r.sample(0,0); r.sample(0,30); assert.ok(r.tilt.value()>0);
  r.advance(1100); assert.equal(r.tilt.value(),0); r.advance(2000); assert.equal(r.tilt.enabled,false);
});
test('browsers without a permission method can receive orientation; insecure origins cannot', async () => {
  const r=rig(); delete r.host.DeviceOrientationEvent.requestPermission; await r.tilt.enable();
  r.sample(0,0); r.sample(0,30); assert.ok(r.tilt.value()>0);
  r.tilt.disable(); r.host.isSecureContext=false; await r.tilt.enable(); assert.equal(r.tilt.enabled,false);
});

function controls() {
  const dom=new JSDOM('<main><button id="left"><span>←</span></button><button id="fire">FIRE</button></main><dialog><input value="Pilot"></dialog>');
  const w=dom.window, doc=w.document;
  function send(el,type,id=1) {
    const event=new w.Event(type,{bubbles:true,cancelable:true}); Object.assign(event,{pointerId:id,button:0});
    el.dispatchEvent(event); return event;
  }
  return {w,doc,send,left:doc.querySelector('#left'),fire:doc.querySelector('#fire')};
}
test('held arrow and fire have independent pointer lifetimes and cancel without sticking', () => {
  const r=controls(); let steer=0,firing=false,ends=0;
  bindPress(r.left,{start:()=>{steer=-1;},end:()=>{steer=0;ends++;}},r.w);
  bindPress(r.fire,{start:()=>{firing=true;},end:()=>{firing=false;}},r.w);
  r.send(r.left,'pointerdown',1);r.send(r.fire,'pointerdown',2);
  assert.equal(steer,-1); assert.equal(firing,true);
  r.send(r.left,'pointerup',2);assert.equal(steer,-1);
  r.send(r.left,'pointercancel',1);assert.equal(steer,0);assert.equal(firing,true);
  r.send(r.left,'lostpointercapture',1);assert.equal(ends,1);
  r.w.dispatchEvent(new r.w.Event('blur')); assert.equal(firing,false);
  r.send(r.fire,'pointerdown',3);assert.equal(firing,true);r.send(r.fire,'pointerup',3);assert.equal(firing,false);
});
test('cancelled launch never triggers release/launch; reset allows the next touch immediately', () => {
  const r=controls(); let launches=0,cancels=0;
  const reset=bindPress(r.left,{start:()=>{},end:()=>launches++,cancel:()=>cancels++},r.w);
  r.send(r.left,'pointerdown');reset();r.send(r.left,'pointerup');assert.equal(launches,0);assert.equal(cancels,1);
  r.send(r.left,'pointerdown',2);r.send(r.left,'pointerup',2);assert.equal(launches,1);
});
test('touch defaults and game callouts are suppressed while dialog fields stay editable', () => {
  const r=controls(); protectGameSurface(r.doc.querySelector('main'));bindPress(r.left,{start:()=>{}},r.w);
  for(const type of ['touchstart','touchmove','contextmenu','selectstart','dragstart']) assert.equal(r.send(r.left.firstChild,type).defaultPrevented,true,type);
  const input=r.doc.querySelector('input');assert.equal(r.send(input,'selectstart').defaultPrevented,false);
  input.value='New Pilot';assert.equal(input.value,'New Pilot');
});
