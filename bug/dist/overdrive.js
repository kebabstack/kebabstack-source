export const OVERDRIVE_SECONDS = 3.2;
export const MOON_COMBO_SECONDS = 6;
export const newFlow = (moon = false) => ({charge:0, streak:0, lastCoin:-Infinity, active:0, cooldown:0,
  activations:0, nearMisses:0, lastNear:-Infinity, pending:new Map(), godCandle:false, moonActivations:0,
  moon:moon ? {coins:0, candle:false, expiresAt:0} : null});
function clearMoon(f) {
  if(f.moon) Object.assign(f.moon,{coins:0,candle:false,expiresAt:0});
}
function comboHit(run, candle) {
  const f=run.flow,m=f.moon;
  if(!m||run.phase!=='flying'||run.stillTime>0||f.active>0||f.cooldown>0)return;
  if(run.elapsed>=m.expiresAt)clearMoon(f);
  // One fixed window, in either order. Repeated hits cannot extend the deadline.
  if(!m.expiresAt)m.expiresAt=run.elapsed+MOON_COMBO_SECONDS;
  if(candle)m.candle=true;else m.coins=Math.min(3,m.coins+1);
}
export function flowCandle(run) { comboHit(run,true); }
export function flowCoin(run) {
  const f=run.flow;
  if(f.active>0||f.cooldown>0)return;
  comboHit(run,false);
  f.streak=run.elapsed-f.lastCoin<=2.5?f.streak+1:1;f.lastCoin=run.elapsed;
  f.charge=Math.min(100,f.charge+4+(f.streak%5===0?8:0));
}
export function breakFlow(run) {
  const f=run.flow;if(f.active>0)f.cooldown=5;f.charge=0;f.streak=0;f.active=0;f.godCandle=false;f.lastCoin=-Infinity;f.pending.clear();clearMoon(f);
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
  if(f.moon?.expiresAt&&run.elapsed>=f.moon.expiresAt)clearMoon(f);
  if(run.elapsed-f.lastCoin>2.5)f.streak=0;
  if(f.active>0) {
    f.active=Math.max(0,f.active-dt);
    if(!f.active){f.cooldown=5;f.godCandle=false;}
  } else if(f.cooldown>0)f.cooldown=Math.max(0,f.cooldown-dt);
  const moon=Boolean(f.moon?.coins>=3&&f.moon.candle);
  if((f.charge>=100||moon)&&f.active===0&&f.cooldown===0&&run.speed>=8) {
    const power=1/(1+Math.max(0,run.elapsed-50)/110);
    f.charge=0;f.streak=0;f.active=OVERDRIVE_SECONDS;f.activations++;f.pending.clear();
    f.godCandle=moon;if(moon)f.moonActivations++;clearMoon(f);
    run.speed=Math.min(150,run.speed+22*power);run.vy=Math.max(run.vy,(moon?24:10)*power);
    run.effects.push({kind:'overdrive',godCandle:moon,label:moon?'ICP TO THE MOON':'OVERDRIVE',
      sub:moon?'3 coins + red candle. Ride the God Candle!':'Clean flying pays off. Ride the energy!'});
  }
}
