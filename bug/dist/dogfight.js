import { breakFlow } from './overdrive.js';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const point=(x,y,d)=>({x,y,d});
const mix=(a,b,t)=>point(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.d+(b.d-a.d)*t);
export const WARNING_SECONDS=.8;
// Every leg is a world-space flight path. The craft never follows the camera or
// gets reattached to the player's position each frame; its nose follows velocity.
export function createDogfight({patrol,flat=false,gravity=10.5}) {
 const durations={arrive:.85,orbit:1.15,warning:WARNING_SECONDS,fire:.24,recover:1.8};
 function newGhost(){return {active:false,phase:'waiting',time:0,age:0,fade:0,x:0,y:0,d:0,offsetD:0,offsetY:0,
  targetX:0,hits:0,dodges:0,kills:0,hp:2,flash:0,encounter:0,shots:[],shotId:0,hitGrace:0,pass:0,
  vx:0,vy:0,vd:1,path:null,side:1};}
 function ghostTarget(run){const g=run.ghost;
  if(!g?.active||g.fade<.65||!['arrive','orbit','warning','fire','recover'].includes(g.phase))return null;
  return {id:`ghost:${g.encounter}`,kind:'ghost',x:g.x,y:g.y,d:g.d,radius:flat?5:2.8,vx:g.vx,vy:g.vy,vd:g.vd};}
 function hitGhost(run){const g=run.ghost;if(!ghostTarget(run))return false;
  g.hp--;g.flash=.22;
  if(g.hp<=0){g.phase='banished';g.time=0;g.path=null;g.kills++;g.shots.length=0;run.cycles+=75;
   run.effects.push({kind:'ghost-destroy',x:g.x,y:g.y,d:g.d,label:'GHOST DEBUGGED',sub:'+75 K simulated cycles. Eight seconds of breathing room.'});
  }else run.effects.push({kind:'ghost-damage',x:g.x,y:g.y,d:g.d});return true;}
 function leg(run,phase){const g=run.ghost,T=durations[phase];g.phase=phase;g.time=0;
  const side=g.side,base=Math.max(2,run.y+run.vy*Math.min(T,.5)),strike=40+run.speed*(flat?.42:.48),wide=strike+50+run.speed*WARNING_SECONDS;
  let ahead=wide,dx=side*27,height=flat?32:26;
  if(phase==='warning'){g.targetX=run.x;ahead=strike;dx=side*3;height=flat?14:9;
   run.effects.push({kind:'ghost-warning',label:'MOTOKO ATTACK RUN',sub:flat?'Boost or fire — incoming burst!':'Pink cannon charging. Change lane or shoot back!'});}
  if(phase==='fire'){ahead=15;dx=-side*12;height=flat?12:7;}
  if(phase==='recover'){ahead=wide*.65;dx=-side*35;height=flat?48:34;}
  if(phase==='arrive'){ahead=wide*.7;dx=side*24;height=flat?36:30;}
  const start=point(g.x,g.y,g.d),end=point(flat?0:clamp(run.x+dx,-42,42),base+height,run.d+run.speed*T+ahead);
  const p1=g.age>.02?point(start.x+clamp(g.vx*T/3,-32,32),Math.max(4,start.y+clamp(g.vy*T/3,-28,28)),start.d+clamp(g.vd*T/3,-55,55)):mix(start,end,.3);
  const p2=mix(start,end,.7);
  // End the strafing leg facing the approaching bug, ready to fire forwards.
  if(phase==='warning'){p2.d=end.d+18;p2.y=end.y+6;p2.x=flat?0:end.x+side*8;}
  if(phase==='fire'){p2.d=end.d+12;p2.x=flat?0:end.x+side*5;}
  if(phase==='recover'){p1.d=start.d-28;p1.x=flat?0:clamp(start.x-side*28,-58,58);p1.y=start.y+30;p2.y=end.y+20;}
  g.path={start,p1,p2,end,duration:T};
 }
 function shoot(run){const g=run.ghost,flightTime=flat?.42:.48;
  const x=g.x,y=g.y,d=g.d;
  const targetY=Math.max(1.15,run.y+run.vy*flightTime-gravity*.5*flightTime**2);
  g.shots.push({id:++g.shotId,x,y,d,life:1.3,vx:(g.targetX-x)/flightTime,vy:(targetY-y)/flightTime,vd:run.speed-(d-run.d)/flightTime});
  run.effects.push({kind:'ghost-shot',x,y,d,label:'INCOMING BURST',sub:flat?'Boost through the gap or shoot back.':'Dodge the pink tracers — they cannot follow you.'});
 }
function stepGhostShots(run, dt, previous = run) {
  const g = run.ghost;
  for (const shot of g.shots) {
    const a = {x: shot.x - previous.x, y: shot.y - previous.y, d: shot.d - previous.d};
    const travel = Math.min(dt, shot.life);
    shot.x += shot.vx * travel; shot.y += shot.vy * travel; shot.d += shot.vd * travel; shot.life -= dt;
    const fraction = travel / dt;
    const b = {x: shot.x - (previous.x + (run.x - previous.x) * fraction),
      y: shot.y - (previous.y + (run.y - previous.y) * fraction), d: shot.d - (previous.d + (run.d - previous.d) * fraction)};
    const dx = b.x - a.x, dy = b.y - a.y, dd = b.d - a.d;
    const t = clamp(-(a.x * dx + a.y * dy + a.d * dd) / (dx * dx + dy * dy + dd * dd || 1), 0, 1);
    if (g.hitGrace > 0) { if (shot.life <= 0) shot.life=0; continue; }
    if ((a.x + t * dx) ** 2 + (a.y + t * dy) ** 2 + (a.d + t * dd) ** 2 <= 2.5 ** 2) {
      shot.life = 0; g.hitGrace=.38;
      if (run.shield) { run.shield = 0; run.effects.push({kind: 'shield', label: 'PULSE BLOCKED', sub: 'Identity shield absorbed the shot.'}); }
      else {
        breakFlow(run);
        run.speed *= .67; run.vy = Math.min(run.vy, 3); run.hitTime = .45; run.combo = 0; g.hits++;
        run.effects.push({kind: 'ghost-hit', x: run.x, y: run.y, d: run.d, label: 'MOTOKO PULSE HIT', sub: '33% momentum lost. Dodge the pink projectiles or shoot back.'});
      }
    } else if (shot.life <= 0 || shot.d < run.d - 12) {
      shot.life = 0; g.dodges++;
      run.effects.push({kind: 'ghost-dodge', label: 'CLEAN COMPILE', sub: 'Pulse evaded. Your momentum is safe.'});
    }
  }
  g.shots = g.shots.filter(s => s.life > 0);
}

 function stepGhost(run,dt,previous=run){const g=run.ghost;
  if(run.phase!=='flying'){g.active=false;g.fade=0;g.shots.length=0;return;}
  if(!(dt>0)||dt>.05)return;
  const active=patrol(run.d);if(!active)g.shots.length=0;
  g.hitGrace=Math.max(0,(g.hitGrace||0)-dt);stepGhostShots(run,dt,previous);
  if(!g.active){if(!active)return;
   g.active=true;g.age=0;g.fade=0;g.hp=2;g.encounter++;g.side=(g.encounter+(run.seed||0))%2?1:-1;g.pass=0;
   g.x=flat?0:clamp(run.x+g.side*42,-50,50);g.y=run.y+(flat?70:48);g.d=run.d+90;g.vx=0;g.vy=-15;g.vd=run.speed;
   leg(run,'arrive');run.effects.push({kind:'ghost-arrive',label:'MOTOKO INBOUND',sub:'An attack run is coming. Two hits will clear the sky.'});
  }
  g.time+=dt;g.age+=dt;g.flash=Math.max(0,g.flash-dt);
  if(!active&&!['leaving','banished'].includes(g.phase)){g.phase='leaving';g.time=0;}
  if(['leaving','banished'].includes(g.phase)){
   g.fade=Math.max(0,1-g.time/.65);g.x+=g.vx*dt;g.y+=12*dt;g.d+=g.vd*dt;
   if(g.time>=(g.phase==='banished'?8:.65)){g.active=false;g.fade=0;}return;
  }
  if(!g.path)leg(run,g.phase in durations?g.phase:'orbit');
  const p=g.path,t=clamp(g.time/p.duration,0,1),a=mix(p.start,p.p1,t),b=mix(p.p1,p.p2,t),c=mix(p.p2,p.end,t),ab=mix(a,b,t),bc=mix(b,c,t),at=mix(ab,bc,t);
  g.vx=3*(bc.x-ab.x)/p.duration;g.vy=3*(bc.y-ab.y)/p.duration;g.vd=3*(bc.d-ab.d)/p.duration;
  g.x=at.x;g.y=Math.max(2,at.y);g.d=at.d;g.offsetD=g.d-run.d;g.offsetY=g.y-run.y;
  g.fade=Math.min(1,g.age/.75);
  if(g.phase==='fire'&&!g.secondShot&&g.time>=.15){shoot(run);g.secondShot=true;}
  if(g.time>=p.duration){
   if(g.phase==='arrive')leg(run,'orbit');
   else if(g.phase==='orbit')leg(run,'warning');
   else if(g.phase==='warning'){shoot(run);g.secondShot=false;leg(run,'fire');}
   else if(g.phase==='fire')leg(run,'recover');
   else {g.pass++;g.side*=-1;leg(run,'orbit');}
  }
 }
 return {newGhost,ghostTarget,hitGhost,stepGhostShots,stepGhost};
}
