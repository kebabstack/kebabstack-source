export const OVERDRIVE_SECONDS = 3.2;
export const newFlow = () => ({charge:0, streak:0, lastCoin:-Infinity, active:0, cooldown:0,
  activations:0, nearMisses:0, lastNear:-Infinity, pending:new Map()});
export function flowCoin(run) {
  const f=run.flow;
  if(f.active>0||f.cooldown>0)return;
  f.streak=run.elapsed-f.lastCoin<=2.5?f.streak+1:1;f.lastCoin=run.elapsed;
  f.charge=Math.min(100,f.charge+4+(f.streak%5===0?8:0));
}
export function breakFlow(run) {
  const f=run.flow;if(f.active>0)f.cooldown=5;f.charge=0;f.streak=0;f.active=0;f.lastCoin=-Infinity;f.pending.clear();
}
export function flowNearMiss(run,id) {
  const f=run.flow;f.pending.delete(id);
  if(f.active>0||f.cooldown>0||run.speed<15||run.elapsed-f.lastNear<.8)return false;
  f.lastNear=run.elapsed;f.nearMisses++;f.charge=Math.min(100,f.charge+20);
  run.effects.push({kind:'near-miss',label:'CLOSE CALL',sub:'+20 FLOW · Cleanly past the danger.'});return true;
}
export function stepFlow(run,dt) {
  const f=run.flow;
  if(run.phase!=='flying'||run.stillTime>0){breakFlow(run);return;}
  if(run.elapsed-f.lastCoin>2.5)f.streak=0;
  if(f.active>0) {
    f.active=Math.max(0,f.active-dt);
    if(!f.active)f.cooldown=5;
  } else if(f.cooldown>0)f.cooldown=Math.max(0,f.cooldown-dt);
  if(f.charge>=100&&f.active===0&&f.cooldown===0&&run.speed>=8) {
    const power=1/(1+Math.max(0,run.elapsed-50)/110);
    f.charge=0;f.streak=0;f.active=OVERDRIVE_SECONDS;f.activations++;f.pending.clear();
    run.speed=Math.min(150,run.speed+22*power);run.vy=Math.max(run.vy,10*power);
    run.effects.push({kind:'overdrive',label:'OVERDRIVE',sub:'Clean flying pays off. Ride the energy!'});
  }
}
