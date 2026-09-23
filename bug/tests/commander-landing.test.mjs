import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {Commander} from '../src/commander.js';
import {createRun,stepRun,boost,STEP,needsBoost,RESCUE_SECONDS,fire} from '../src/physics.js';
function rig() {
 const document=new JSDOM('<aside id="commander"><b id="commanderTitle"></b><p id="commanderMessage"></p></aside>').window.document;
 let time=0;const commander=new Commander({document,now:()=>time});
 return {commander,element:document.getElementById('commander'),clock:ms=>{time=ms;}};
}
const landing=prompts=>Object.assign(createRun(1),{phase:'flying',d:1850,y:1.15,vy:0,speed:5.5,prompts});
function advance(r,seconds,steer=0){for(let i=0;i<Math.ceil(seconds/STEP);i++)stepRun(r,STEP,steer);}
test('commander is quiet on the roof, speaks once at an epoch change and stays gone after expiry',()=>{
 const {commander:c,element:e,clock}=rig(),r=createRun();c.update(r);assert.equal(e.dataset.visible,'false');
 r.phase='flying';r.zone=1;c.update(r);assert.equal(e.dataset.visible,'true');clock(4600);c.update(r);assert.equal(e.dataset.visible,'false');assert.equal(e.getAttribute('aria-hidden'),'true');
 clock(15000);c.update(r);assert.equal(e.dataset.visible,'false');r.zone=2;c.update(r);assert.equal(e.dataset.visible,'true');
 r.phase='done';c.update(r);assert.equal(e.dataset.visible,'false');
});
test('near landing gives one boost reminder per rescue opportunity and hides immediately after boosting',()=>{
 const {commander:c,element:e,clock}=rig(),r=landing(2);c.update(r);assert.equal(e.dataset.visible,'true');assert.match(e.textContent,/2 boosts/);
 clock(4000);c.update(r);assert.equal(e.dataset.visible,'false');clock(5000);c.update(r);assert.equal(e.dataset.visible,'false');
 boost(r);c.update(r);assert.equal(e.dataset.visible,'false');Object.assign(r,{y:1.15,vy:0,speed:7});c.update(r);assert.match(e.textContent,/1 boost\./);assert.equal(e.dataset.visible,'true');
});
test('no reminder with spent boosts or a healthy airborne flight',()=>{
 const {commander:c,element:e}=rig(),r=landing(0);c.update(r);assert.equal(e.dataset.visible,'false');assert.equal(needsBoost(r),false);
 r.prompts=2;r.y=30;c.update(r);assert.equal(e.dataset.visible,'false');
});
test('settling locks the landing position against held steering and wind, then finishes once',()=>{
 const r=landing(0);r.vx=24;r.elapsed=17;stepRun(r,STEP,1);const {x,d}=r;
 assert.equal(r.speed,0);assert.equal(r.vx,0);assert.ok(r.stillTime>0);assert.equal(fire(r),false);
 advance(r,.4,1);assert.equal(r.phase,'done');assert.equal(r.x,x);assert.equal(r.d,d);assert.equal(r.effects.filter(e=>e.kind==='done').length,1);
});
test('unused boosts preserve a short rescue window and a successful boost restores normal flight',()=>{
 const r=landing(2);stepRun(r,STEP,-1);const {x,d}=r;advance(r,RESCUE_SECONDS-.2,-1);
 assert.equal(r.phase,'flying');assert.equal(r.x,x);assert.equal(r.d,d);assert.equal(boost(r),true);
 advance(r,.5,1);assert.ok(r.y>8);assert.ok(r.d>d+10);assert.equal(r.stillTime,0);assert.equal(r.phase,'flying');
 const ignored=landing(1);advance(ignored,RESCUE_SECONDS+.1,1);assert.equal(ignored.phase,'done');assert.equal(ignored.prompts,1);
});
test('slow airtime and a real bounce are not prematurely cut short',()=>{
 const airborne=landing(0);airborne.y=20;advance(airborne,.1);assert.equal(airborne.phase,'flying');assert.equal(airborne.stillTime,0);
 const bounce=landing(0);bounce.y=1.2;bounce.vy=-20;stepRun(bounce,STEP);assert.ok(bounce.vy>5);assert.equal(bounce.stillTime,0);
});
test('an epoch boundary cannot replace an active last-chance boost reminder',()=>{
 const {commander:c,element:e}=rig(),r=landing(1);c.update(r);r.zone=1;c.update(r);
 assert.equal(e.dataset.visible,'true');assert.match(e.textContent,/Tap BOOST now/);assert.equal(c.kind,'boost');
});
