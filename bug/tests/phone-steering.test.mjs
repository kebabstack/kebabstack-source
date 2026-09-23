import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { PhoneSteering } from '../src/phone-steering.js';

function rig(permission = async () => 'granted') {
  const w = new JSDOM(readFileSync(new URL('../src/index.html', import.meta.url), 'utf8')).window;
  let mobile = true, blocked = false, time = 0, watchdog, requests = 0;
  Object.assign(w, { isSecureContext: true, DeviceOrientationEvent: { requestPermission() { requests++; return permission(); } },
    setInterval(fn) { watchdog = fn; return 1; }, clearInterval() { watchdog = null; } });
  const $ = id => w.document.getElementById(id), notices = [];
  const close = id => { $(id).removeAttribute('open'); $(id).dispatchEvent(new w.Event('close')); };
  const phone = new PhoneSteering({ document:w.document, host:w, now:()=>time, isPhone:()=>mobile,
    canOffer:()=>!blocked && !w.document.querySelector('dialog[open]'),
    showModal:id=>$(id).setAttribute('open',''), closeModal:close, announce:text=>notices.push(text) });
  const sample = (beta=30, gamma=10) => { time+=100; const e=new w.Event('deviceorientation'); Object.assign(e,{beta,gamma}); w.dispatchEvent(e); };
  return { w,$,phone,sample,notices,requests:()=>requests,advance:ms=>{time+=ms;watchdog?.();},mobile:value=>mobile=value,blocked:value=>blocked=value };
}
test('phone setup precedes the first flight without requesting permission before a click', () => {
  const r=rig();r.mobile(false);assert.equal(r.phone.offer(),false);
  r.mobile(true);r.blocked(true);assert.equal(r.phone.offer(),false);
  r.blocked(false);assert.equal(r.phone.offer(),true);assert.equal(r.$('steeringDialog').open,true);
  assert.equal(r.requests(),0);assert.equal(r.phone.offer(),false);
  r.$('useArrowsBtn').click();assert.equal(r.$('steeringDialog').open,false);assert.equal(r.phone.offer(),false);
  assert.equal(r.requests(),0);assert.equal(r.phone.tilt.enabled,false);
});
test('tilt choice requests permission in the click and waits for a usable neutral sample', async () => {
  const r=rig();r.phone.offer();r.$('useTiltBtn').click();assert.equal(r.requests(),1);
  await Promise.resolve();assert.equal(r.$('steeringDialog').open,true);assert.equal(r.$('useTiltBtn').disabled,true);
  r.sample(null,null);assert.equal(r.$('steeringDialog').open,true);
  r.sample();assert.equal(r.$('steeringDialog').open,false);assert.equal(r.phone.tilt.enabled,true);
  assert.equal(r.phone.offer(),false);assert.equal(r.$('tiltBtn').getAttribute('aria-label'),'Disable tilt steering');
  assert.equal(r.$('tiltBtn').getAttribute('aria-pressed'),'true');assert.ok(r.$('tiltBtn').querySelector('svg'));
  assert.equal(r.$('tiltBtn').textContent,'');assert.equal(r.$('tiltStatus'),null);
});
test('edge switch disables immediately and re-enables from that same click', async () => {
  const r=rig();r.phone.offer();await r.phone.enable();r.sample();r.$('tiltBtn').click();
  assert.equal(r.phone.tilt.enabled,false);assert.equal(r.$('steeringDialog').open,false);
  r.$('tiltBtn').click();assert.equal(r.requests(),2);assert.equal(r.$('steeringDialog').open,true);
  await Promise.resolve();r.sample(30,30);assert.equal(r.$('steeringDialog').open,false);assert.equal(r.phone.tilt.value(),0);
});
test('permission denial stays in the chooser with an immediate arrow fallback', async () => {
  const r=rig(async()=>'denied');r.phone.offer();await r.phone.enable();
  assert.equal(r.$('steeringDialog').open,true);assert.match(r.$('steeringStatus').textContent,/not allowed/);
  assert.equal(r.$('useTiltBtn').disabled,false);assert.equal(r.$('useArrowsBtn').disabled,false);
  r.$('useArrowsBtn').click();assert.equal(r.$('steeringDialog').open,false);assert.equal(r.phone.tilt.enabled,false);
});
test('missing sensor data times out in setup and stale readings only announce briefly in play', async () => {
  const r=rig();r.phone.offer();await r.phone.enable();r.advance(3100);
  assert.equal(r.$('steeringDialog').open,true);assert.match(r.$('steeringStatus').textContent,/No motion/);
  assert.equal(r.$('useTiltBtn').disabled,false);await r.phone.enable();r.sample();r.advance(3100);
  assert.equal(r.$('steeringDialog').open,false);assert.equal(r.phone.tilt.enabled,false);
  assert.equal(r.$('tiltBtn').getAttribute('aria-pressed'),'false');assert.equal(r.notices.length,1);
});
test('arrow choice or Escape cancels a delayed OS permission without a later surprise enable', async () => {
  for (const escape of [false,true]) {
    let resolve;const r=rig(()=>new Promise(r=>resolve=r));r.phone.offer();const pending=r.phone.enable();
    if(escape) r.$('steeringDialog').dispatchEvent(new r.w.Event('cancel',{cancelable:true}));else r.$('useArrowsBtn').click();
    resolve('granted');await pending;r.sample();assert.equal(r.phone.tilt.enabled,false);assert.equal(r.$('steeringDialog').open,false);
    assert.equal(r.phone.offer(),false);
  }
});
test('interrupting the chooser cancels permission and allows the deferred initial question', async () => {
  let resolve;const r=rig(()=>new Promise(r=>resolve=r));r.phone.offer();const pending=r.phone.enable();
  r.phone.cancelEnable();r.$('steeringDialog').removeAttribute('open');r.blocked(true);
  resolve('granted');await pending;r.sample();assert.equal(r.phone.tilt.enabled,false);assert.equal(r.phone.offer(),false);
  r.blocked(false);assert.equal(r.phone.offer(),true);assert.equal(r.requests(),1);
});
