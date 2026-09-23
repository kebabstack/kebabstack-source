import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, collect } from '../src/physics.js';
import { stepGhost, stepGhostShots, ghostTarget, hitGhost } from '../src/ghost.js';
import { WARNING_SECONDS } from '../src/dogfight.js';
import { scoreOf, burnRate } from '../src/scoring.js';
const run = () => Object.assign(createRun(20000), {phase:'flying', d:580, speed:80, y:25});
const tick = r => { const previous={x:r.x,y:r.y,d:r.d}; r.d+=r.speed*.01; r.vy-=10.5*.01; r.y=Math.max(1.15,r.y+r.vy*.01); if(r.y===1.15)r.vy=0; stepGhost(r,.01,previous); };
const advance = (r,n) => { for(let i=0;i<n;i++)tick(r); };
const until=(r,condition,limit=800)=>{let ticks=0;while(!condition(r)&&ticks++<limit)tick(r);assert.ok(condition(r),'phase or impact was not reached');return ticks*.01;};
test('score combines distance and real coin count; firewall cycles do not become coins', () => {
 const r=run(); collect(r,{id:'coin',kind:'cycle'}); collect(r,{id:'coin',kind:'cycle'});
 assert.equal(r.coins,1); assert.equal(scoreOf(r),630); r.cycles+=25000; assert.equal(scoreOf(r),630);
});
test('ghost gives a full visible warning, a faster two-shot burst and one momentum penalty',()=>{
 const r=run();until(r,r=>r.ghost.phase==='warning');assert.equal(r.ghost.hits,0);
 const warning=until(r,r=>r.ghost.shots.length>0);assert.ok(warning>=WARNING_SECONDS-.02);
 const first=r.ghost.shots[0];assert.ok((first.d-r.d)/(r.speed-first.vd)<=.5);
 advance(r,16);assert.equal(r.ghost.shotId,2);assert.ok(r.ghost.shots.length<=2);
 until(r,r=>r.ghost.hits>0);assert.equal(r.ghost.hits,1);assert.ok(Math.abs(r.speed-53.6)<1e-9);
 advance(r,120);assert.equal(r.ghost.hits,1);assert.equal(r.coins,0);
});
test('world-space attack paths move continuously, circle widely and turn towards a real strafing run',()=>{
 const r=run();let prev=null,minX=Infinity,maxX=-Infinity,backwardsPass=false,forwardPass=false;
 for(let i=0;i<650;i++){tick(r);const g=r.ghost;
  if(prev)assert.ok(Math.hypot(g.x-prev.x,g.y-prev.y,g.d-prev.d)<3,'path jumped between frames');
  prev={x:g.x,y:g.y,d:g.d};minX=Math.min(minX,g.x);maxX=Math.max(maxX,g.x);
  if(g.phase==='fire'&&g.vd<0)backwardsPass=true;if(g.vd>50)forwardPass=true;
 }
 assert.ok(maxX-minX>45);assert.ok(backwardsPass&&forwardPass);
 const g=r.ghost;const x=g.x;r.x+=20;tick(r);assert.ok(Math.abs(g.x-x)<3,'craft must not teleport with lane changes');
});
test('changing lanes after warning evades both shots without speed loss',()=>{
 const r=run();until(r,r=>r.ghost.phase==='warning');r.x=r.ghost.targetX+12;
 advance(r,250);assert.equal(r.ghost.hits,0);assert.equal(r.ghost.dodges,2);assert.equal(r.speed,80);
});
test('Motoko circles ahead in shootable space and needs two hits; banishment lasts eight seconds', () => {
 const r=run();r.speed=40;advance(r,160);assert.equal(r.ghost.phase,'orbit');assert.ok(r.ghost.d>r.d);
 const before=r.ghost.x;advance(r,40);assert.notEqual(r.ghost.x,before);assert.ok(ghostTarget(r));
 assert.equal(hitGhost(r),true);assert.equal(r.ghost.hp,1);assert.equal(r.ghost.kills,0);
 assert.equal(hitGhost(r),true);assert.equal(r.ghost.kills,1);assert.equal(r.cycles,75);
 assert.equal(hitGhost(r),false);assert.equal(ghostTarget(r),null);
 advance(r,750);assert.equal(r.ghost.phase,'banished');assert.equal(r.ghost.hits,0);
 advance(r,60);assert.equal(r.ghost.phase,'arrive');assert.equal(r.ghost.hp,2);
});
test('ghost begins in Motoko, follows through canister airspace and fades out instead of popping away', () => {
 const r=run();r.d=499;stepGhost(r,.01);assert.equal(r.ghost.active,false);
 r.d=500;advance(r,130);assert.equal(r.ghost.active,true);assert.equal(r.ghost.fade,1);
 r.d=950;stepGhost(r,.01);assert.equal(r.ghost.active,true);
 r.d=1600;stepGhost(r,.01);assert.equal(r.ghost.phase,'leaving');assert.ok(r.ghost.fade>.9);
 advance(r,80);assert.equal(r.ghost.fade,0);
 r.phase='done';stepGhost(r,.01);assert.equal(r.ghost.active,false);assert.equal(createRun().ghost.hits,0);
});
test('identity shield blocks the chaser once without costing coins or momentum', () => {
 const r=run();r.shield=1;advance(r,540);assert.equal(r.shield,0);assert.equal(r.speed,80);assert.equal(r.ghost.hits,0);
});
test('burn telemetry grows with speed, progress and boost without consuming coins', () => {
 const r=run(); const base=burnRate(r); r.speed=120;assert.ok(burnRate(r)>base);
 const fast=burnRate(r);r.d=2500;assert.ok(burnRate(r)>fast);
 const far=burnRate(r);r.boostTime=.5;assert.ok(burnRate(r)>far);assert.equal(r.coins,0);
 r.phase='ready';assert.equal(burnRate(r),0);
});

test('a pulse has a fixed lane after firing, can be dodged late, and the ghost body does not damage',()=>{
 const r=run();until(r,r=>r.ghost.shots.length===1);assert.equal(r.ghost.shots.length,1);
 const shot={...r.ghost.shots[0]};assert.ok(shot.d>r.d);r.x+=12;advance(r,20);
 assert.equal(r.ghost.shots[0].vx,shot.vx);assert.equal(r.ghost.shots[0].vy,shot.vy);advance(r,130);
 assert.equal(r.ghost.hits,0);assert.equal(r.speed,80);assert.equal(r.ghost.dodges,2);
 assert.ok(shot.life>0);
 const body=run();Object.assign(body.ghost,{active:true,fade:1,phase:'recover',x:body.x,y:body.y,d:body.d,offsetD:0,offsetY:0});
 stepGhost(body,.01);assert.equal(body.speed,80);assert.equal(body.ghost.hits,0);
});
test('swept relative pulse collisions catch a fast crossing, consume a shield once, and expire without damage',()=>{
 const r=run();r.d=605;r.y=10;
 r.ghost.shots=[{id:1,x:0,y:10,d:620,vx:0,vy:0,vd:-1000,life:1}];
 stepGhostShots(r,.05,{x:0,y:10,d:600});assert.equal(r.ghost.hits,1);assert.equal(r.ghost.shots.length,0);
 const shielded=run();shielded.shield=1;
 shielded.ghost.shots=[{id:1,x:0,y:25,d:shielded.d,vx:0,vy:0,vd:0,life:1}];
 stepGhostShots(shielded,.01);stepGhostShots(shielded,.01);assert.equal(shielded.shield,0);assert.equal(shielded.speed,80);assert.equal(shielded.ghost.hits,0);
 const miss=run();miss.ghost.shots=[{id:1,x:20,y:25,d:miss.d,vx:0,vy:0,vd:0,life:.005}];
 stepGhostShots(miss,.01);assert.equal(miss.ghost.dodges,1);assert.equal(miss.speed,80);assert.equal(miss.ghost.shots.length,0);
});
test('debugging Motoko cancels an incoming pulse; completion and stage exit clear shots',()=>{
 const r=run();until(r,r=>r.ghost.shots.length===1);assert.equal(r.ghost.shots.length,1);hitGhost(r);hitGhost(r);
 assert.equal(r.ghost.shots.length,0);advance(r,100);assert.equal(r.ghost.hits,0);
 for(const phase of ['done','flying']){const end=run();end.phase=phase;end.d=1600;end.ghost.shots=[{life:1}];stepGhost(end,.01);assert.equal(end.ghost.shots.length,0);}
});

test('later patrols resume the chase with warnings, while gaps clear all incoming shots',()=>{
 const r=run();
 for(const d of [0,499,1700,2199]){r.d=d;stepGhost(r,.01);assert.equal(r.ghost.active,false);}
 for(const start of [2200,4000,5800]){
  r.d=start;until(r,r=>r.ghost.phase==='fire');assert.equal(r.ghost.phase,'fire');assert.equal(r.ghost.shots.length,1);
  r.d=start+1100;advance(r,80);assert.equal(r.ghost.active,false);assert.equal(r.ghost.shots.length,0);
 }
 r.d=7600;advance(r,160);hitGhost(r);hitGhost(r);advance(r,750);assert.equal(r.ghost.phase,'banished');
 advance(r,60);assert.equal(r.ghost.phase,'arrive');
});
