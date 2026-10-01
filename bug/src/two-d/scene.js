import { WakePath } from '../wake-path.js';
import { buildingLayout, drawDfinityBuilding } from './hq-building.js';
export { buildingLayout };
import { SpaceSky } from './space-sky.js';
import { makeObjects, seededRandom, ZONES, clamp, GRAVITY, START_HEIGHT, launchVelocity } from './physics.js';

const C = {ink:'#151525', cream:'#fff1cf', red:'#ff535b', orange:'#ff994d', gold:'#ffd45c', mint:'#76e6a7', cyan:'#62d9ec', purple:'#9c79e8', pink:'#f28dcd'};
const TAU = Math.PI * 2;
const PIXEL = '"Silkscreen","JetBrains Mono",ui-monospace,monospace';
function ellipse(c,x,y,rx,ry,color,rotation=0) { c.beginPath(); c.ellipse(x,y,rx,ry,rotation,0,TAU); c.fillStyle=color; c.fill(); }
function line(c,points,color,width=2) { c.beginPath(); points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.strokeStyle=color; c.lineWidth=width; c.lineCap='round'; c.lineJoin='round'; c.stroke(); }
function box(c,x,y,w,h,color,r=0) { c.fillStyle=color; if(r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}else c.fillRect(x,y,w,h); }
function gradient(c,x,y,x2,y2,stops) { const g=c.createLinearGradient(x,y,x2,y2); stops.forEach(([at,color])=>g.addColorStop(at,color)); return g; }
const snap = v => Math.round(v / 2) * 2;

// Pixel shapes are authored on a two-CSS-pixel grid, then cached once.
// These keep distinct eyes, shell spots and thruster details at phone sizes.
function pixelOval(c,x,y,rx,ry,color) {
 c.fillStyle=color;
 for(let py=Math.floor((y-ry)/2)*2;py<y+ry;py+=2) {
  const half=rx*Math.sqrt(Math.max(0,1-((py+1-y)/ry)**2));
  const left=Math.round((x-half)/2)*2,right=Math.round((x+half)/2)*2;
  if(right>left)c.fillRect(left,py,right-left,2);
 }
}
function pixels(c,color,rects) { c.fillStyle=color;for(const rect of rects)c.fillRect(...rect); }
// The ladybug: dark outline, two-tone shell, shaded spots, a bright eye and twin
// cyan thrusters. `wing` selects the flutter frame (0 = folded, 1 = up, 2 = down).
export function drawBug(c, wing = 0) {
 if(wing){
  const lift=wing===1?-6:2;
  pixelOval(c,-6,-16+lift,18,7,'#fff3da66');pixelOval(c,-8,-15+lift,14,4,'#ffffff55');
  pixelOval(c,2,-18+lift,14,6,'#d8f4ff55');
 }
 pixels(c,C.ink,[[-26,-10,4,14],[-30,-12,8,4],[-24,4,4,12],[-30,14,10,4],[-8,8,4,14],[-8,20,10,4],[10,6,4,14],[10,18,12,4],[22,-18,4,16],[24,-20,8,4]]);
 pixelOval(c,-4,0,27,19,C.ink);
 pixelOval(c,-4,-2,22,16,'#b72b4e');
 pixelOval(c,-6,-6,20,12,'#ff535b');
 pixels(c,'#ff9570',[[-18,-16,16,4],[-22,-12,8,4],[-4,-14,8,4]]);
 pixels(c,'#ffd1b8',[[-16,-16,6,2]]);
 pixels(c,'#6c2543',[[-28,-2,44,2]]);
 pixels(c,C.ink,[[-18,-10,8,6],[-20,-8,8,6],[-6,4,8,8],[2,-10,8,6],[-22,6,6,6]]);
 pixels(c,'#2a2238',[[-16,-10,2,2],[-4,4,2,2],[4,-10,2,2]]);
 pixelOval(c,18,0,12,12,C.ink);
 pixels(c,C.cream,[[20,-8,8,12],[18,-6,4,8]]);
 pixels(c,C.ink,[[24,-6,4,8]]);
 pixels(c,'#ffffff',[[24,-6,2,2]]);
 pixels(c,C.gold,[[28,-22,6,4]]);
 pixels(c,'#ff535b',[[24,8,6,2]]);
 // Thrusters on the back of the shell.
 pixels(c,'#5a6b7a',[[-34,-6,8,4],[-34,2,8,4]]);
 pixels(c,'#9fb3c0',[[-34,-6,2,4],[-34,2,2,4]]);
 pixels(c,C.cyan,[[-38,-6,4,4],[-38,2,4,4]]);
}
export function drawMotoko(c) {
 pixels(c,'#30203f',[[-24,8,48,14],[-20,20,12,8],[-6,20,14,14],[12,18,10,10]]);
 pixels(c,'#9064d4',[[-20,8,40,14],[-18,20,8,4],[-2,20,8,10],[14,18,6,6]]);
 pixelOval(c,0,-4,34,26,'#30203f');
 pixelOval(c,0,-6,30,22,'#ba58bd');
 pixelOval(c,-2,-12,28,16,'#f28dcd');
 pixels(c,'#ffd0ea',[[-18,-26,26,4],[-24,-22,12,4]]);
 pixels(c,'#231f3b',[[-28,-10,54,14],[-24,-14,46,22],[-18,8,34,4]]);
 pixels(c,'#635485',[[-24,-12,44,2],[-28,-8,4,12]]);
 pixels(c,C.gold,[[-18,-6,8,10],[-2,-6,8,10]]);
 pixels(c,'#fff7cc',[[-18,-6,4,4],[-2,-6,4,4]]);
 pixels(c,'#9d4ca8',[[26,-12,8,20],[30,-8,6,12]]);
 pixels(c,'#fbb8df',[[28,-8,4,10]]);
 pixels(c,C.ink,[[8,-34,4,10],[10,-36,10,4],[-36,8,20,8]]);
 pixels(c,C.cyan,[[18,-38,6,6],[-34,10,6,4]]);
}
function drawCoin(c, frame) {
 // Eight spin frames of a 16-bit coin; frame 0 is face-on, frame 4 edge-on.
 const squash=Math.abs(Math.cos(frame/8*Math.PI)), rx=Math.max(3,Math.round(9*squash));
 pixelOval(c,0,0,rx+1,11,'#6e453f');pixelOval(c,0,-1,rx,9,squash>.5?C.gold:'#e9b659');
 if(rx>5){pixelOval(c,0,-1,rx-3,6,'#e8a968');pixelOval(c,0,-1,Math.max(1,rx-5),4,C.gold);pixels(c,'#986543',[[-1,-5,2,8]]);}
 else pixels(c,'#fff4c5',[[-1,-7,2,4]]);
 pixels(c,'#fff4c5',[[-Math.min(rx-1,4),-6,2,2]]);
}
function drawCloud(c,w,h,color) {
 const r=seededRandom(w*7+h);
 for(let i=0;i<5;i++){const x=w*(.15+i*.17),y=h*.62-(i===2?h*.3:i%2?h*.12:0),rx=w*.16+r()*w*.05,ry=h*.3+r()*h*.1;pixelOval(c,x,y,rx,ry,color);}
 c.fillStyle=color;c.fillRect(Math.round(w*.08/2)*2,Math.round(h*.62/2)*2,Math.round(w*.84/2)*2,Math.round(h*.3/2)*2);
}

export function viewScale(width,height) {
 return height<520 ? 3 : width<700 ? 2.8 : clamp(width/240,4.2,6);
}
export class GameView {
 constructor(container,day,seed=day) {
  this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label','Ship the Bug 2D: 16-bit side-scrolling pixel world');
  this.ctx=this.canvas.getContext('2d',{alpha:false});if(!this.ctx)throw Error('Canvas2D unavailable');
  this.renderer={domElement:this.canvas};container.append(this.canvas);this.motionReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.space = new SpaceSky(); this.shake=0; this.shakeX=0; this.shakeY=0; this.resize();window.addEventListener('resize',()=>this.resize());this.reset(day,seed);
 }
 surface(w,h,draw) { const a=document.createElement('canvas');a.width=Math.ceil(w*this.dpr);a.height=Math.ceil(h*this.dpr);const c=a.getContext('2d');c.scale(this.dpr,this.dpr);c.imageSmoothingEnabled=false;draw(c);return a; }
 resize() {
  this.w=Math.max(320,innerWidth);this.h=Math.max(240,innerHeight);this.dpr=.5; // One scene pixel is 2 CSS pixels on every screen density.
  this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.ctx.imageSmoothingEnabled=false;
  this.art={
   bug:[0,1,2].map(wing=>this.surface(96,72,c=>{c.translate(52,36);drawBug(c,wing);})),
   ghost:this.surface(100,90,c=>{c.translate(50,45);drawMotoko(c);}),
   coin:[0,1,2,3,4,5,6,7].map(frame=>this.surface(28,28,c=>{c.translate(14,14);drawCoin(c,frame);})),
   clouds:[[150,46,'#8d6a8bcc'],[110,36,'#a37b98bb'],[190,52,'#7a5d80cc']].map(([w,h,color])=>this.surface(w,h,c=>drawCloud(c,w,h,color)))
  };
  this.background=null;
 }
 reset(day,seed=day) { this.day=day;this.seed=seed;this.chunks=new Set();this.objects=[];this.particles=[];this.labels=[];this.trail=[];this.streaks=[];this.ghostWake=new WakePath();this.ghostWakePoint=new Float64Array(3);this.ghostEncounter=-1;this.target=null;this.flash=0;this.flashColor=C.red;this.time=0;this.shake=0;this.shakeX=0;this.shakeY=0;this.exhaustClock=0;this.worldRange='';this.ensureWorld(0); }
 ensureWorld(d) {
  const first=Math.max(0,Math.floor((d-150)/200)),last=Math.floor((d+650)/200),key=`${first}:${last}`;
  if(key===this.worldRange)return;this.worldRange=key;
  for(let i=first;i<=last;i++)if(!this.chunks.has(i)){this.chunks.add(i);this.objects.push(...makeObjects(this.seed,i));}
  this.objects=this.objects.filter(o=>o.d>=first*200&&o.d<(last+1)*200);
  for(const i of this.chunks)if(i<first||i>last)this.chunks.delete(i);
 }
 rect(x,y,w,h,color,r=0) { if(w>0&&h>0)box(this.ctx,x,y,w,h,color,r); }
 text(text,x,y,color=C.cream,size=12,align='left',pixel=false) { const c=this.ctx;c.fillStyle=color;c.font=pixel?`700 ${size}px ${PIXEL}`:`600 ${size}px "JetBrains Mono", ui-monospace, monospace`;c.textAlign=align;c.textBaseline='top';c.fillText(text,x,y); }
 ring(x,y,r,color,width=2) { const c=this.ctx;c.beginPath();c.arc(x,y,r,0,TAU);c.strokeStyle=color;c.lineWidth=width;c.stroke(); }
 screen(d,y) { return [this.bx+(d-this.run.d)*this.scale,this.ground-y*this.scale]; }
 kick(amount) { this.shake=Math.min(1.4,this.shake+amount); }
 spark(d,y,color,count,spread=32,life=.5,up=0) {
  for(let i=0;i<(this.motionReduced?Math.ceil(count/4):count);i++)this.particles.push({d,y,vd:(Math.random()-.5)*spread,vy:(Math.random()-.4)*spread+up,life:life+Math.random()*.3,color,size:Math.random()<.3?6:4});
 }
 event(e,r) {
  const d=e.d??r.d,y=e.y??r.y;
  if(e.kind==='collect'&&e.type==='cycle'){
   this.spark(d,y,C.gold,10,26,.4,8);this.spark(d,y,'#fff4c5',4,14,.3,10);
   const combo=r.combo>0&&r.combo%5===0;
   this.labels.push({d,y:y+2,text:combo?`+50 x${r.combo}`:'+50',life:combo?1:.7,color:combo?'#fff4c5':C.gold,size:combo?14:11});
  } else if(e.kind==='collect'&&!['pad','hazard','mine'].includes(e.type)){
   this.spark(d,y,C.mint,18,40,.6,10);this.labels.push({d,y:y+3,text:e.type.toUpperCase(),life:1,color:C.mint,size:11});this.flash=.1;this.flashColor=C.mint;
  } else if(['destroy','mine-destroy','ghost-destroy'].includes(e.kind)){
   this.spark(d,y,C.orange,22,54,.6,6);this.spark(d,y,'#fff4c5',10,30,.4,12);this.spark(d,y,'#51364a',8,18,.9,14);this.kick(.5);
   this.labels.push({d,y:y+3,text:e.kind==='ghost-destroy'?'DEBUGGED':'CLEARED',life:.9,color:e.kind==='ghost-destroy'?C.pink:C.orange,size:12});
  } else if(['hazard','mine-hit','ghost-hit'].includes(e.kind)){
   this.spark(r.d,r.y,C.red,16,46,.5,4);this.spark(r.d,r.y,'#51364a',8,20,.8,10);this.flash=.18;this.flashColor=C.red;this.kick(1);
   this.labels.push({d:r.d,y:r.y+3,text:e.kind==='ghost-hit'?'-33%':'-40%',life:.9,color:'#ff8c7a',size:12});
  } else if(e.kind==='boost'){this.spark(r.d,r.y,C.cyan,14,36,.5,-4);this.kick(.18);}
  else if(e.kind==='launch'){this.spark(r.d,r.y,'#fff4c5',16,40,.6,8);this.kick(.3);if(e.label==='PERFECT DEPLOY')this.labels.push({d:r.d,y:r.y+5,text:'PERFECT!',life:1.2,color:C.mint,size:16});}
  else if(e.kind==='overdrive'){this.spark(r.d,r.y,C.gold,20,50,.7,6);this.flash=.14;this.flashColor=C.gold;this.kick(.3);}
  else if(e.kind==='near-miss'){this.labels.push({d:r.d,y:r.y+3,text:'CLOSE CALL +20',life:.9,color:C.cyan,size:11});}
  else if(e.kind==='shield'){this.spark(r.d,r.y,C.mint,14,36,.5,4);this.labels.push({d:r.d,y:r.y+3,text:'SHIELDED',life:.9,color:C.mint,size:12});}
  else if(e.kind==='bounce'){this.spark(r.d,0,'#c6b8b8',8,22,.4,10);this.kick(.2+(e.strength||0)*.3);}
  this.particles=this.particles.slice(-160);this.labels=this.labels.slice(-12);
 }
 makeBackground(zone) {
  const w=this.w,h=this.h,horizon=this.baseGround,earth=zone<2;
  const sky=this.surface(w,h,c=>{
   const bands=earth?['#15152b','#201d38','#322443','#4c2e51','#723b62','#a54e6b','#d57878','#f5ac83']:['#0c142b','#131c3b','#20274a','#303158','#433766','#584071','#724777','#925282'];
   bands.forEach((color,i)=>box(c,0,Math.floor(i*horizon/bands.length),w,Math.ceil(horizon/bands.length)+1,color));box(c,0,horizon,w,h-horizon,bands.at(-1));
   const rand=seededRandom(8215);for(let i=0;i<75;i++){const x=rand()*w,y=70+rand()*Math.max(60,horizon-120);ellipse(c,x,y,i%13===0?1.5:.8,i%13===0?1.5:.8,'#fff0ce70');}
   const sx=w*.76,sy=Math.max(150,horizon-210),radius=w<700?48:70;
   ellipse(c,sx,sy,radius+34,radius+34,earth?'#ffcd970c':'#b998ed0c');
   ellipse(c,sx,sy,radius+20,radius+20,earth?'#ffcd9714':'#b998ed14');
   ellipse(c,sx,sy,radius,radius,gradient(c,0,sy-radius,0,sy+radius,[[0,earth?'#ffe8af':'#cdb3ef'],[1,earth?'#f18e85':'#807dd0']]));
   if(earth){c.fillStyle='#7d587340';for(let i=0;i<4;i++)c.fillRect(sx-radius,sy+12+i*12,radius*2,2+i);}
   else {c.save();c.translate(sx,sy);c.rotate(-.3);c.beginPath();c.ellipse(0,0,radius*1.6,radius*.32,0,0,TAU);c.strokeStyle='#b5ccef80';c.lineWidth=5;c.stroke();c.restore();}
  });
  // Soft Alpine silhouettes, two depths, scroll slowest of all.
  const mountains=earth?[0,1].map(layer=>this.surface(w+240,170,c=>{
   const rand=seededRandom(901+layer),color=layer?'#56475f':'#473a55';
   c.beginPath();c.moveTo(0,170);for(let x=-60;x<w+300;x+=layer?70:110)c.lineTo(x,170-(layer?55:95)-rand()*(layer?50:70));c.lineTo(w+240,170);c.closePath();c.fillStyle=color;c.fill();
   if(!layer){c.fillStyle='#8d7a92';c.beginPath();c.moveTo(0,170);for(let x=-60;x<w+300;x+=110){const peak=170-95-rand()*70;c.lineTo(x,peak);c.lineTo(x+14,peak+16);c.lineTo(x-14,peak+16);c.lineTo(x,peak);}c.closePath();c.fill();}
  })):[];
  const layers=[0,1,2].map(layer=>this.surface(w+240,210,c=>{
   const rand=seededRandom(48+layer),step=layer===2?66:93;
   for(let x=0;x<w+240;x+=step){const height=35+rand()*(75+layer*18),y=210-height,color=['#4e425b','#37364e','#292c40'][layer];
    box(c,x,y,step-8,height,color,2);box(c,x+8,y-5,step-24,6,color,1);
    if(layer>0){for(let wy=y+13;wy<204;wy+=18)for(let wx=x+10;wx<x+step-14;wx+=16)if(rand()>(layer===2?.3:.55))box(c,wx,wy,5,7,rand()>.6?(layer===2?'#f8c79499':'#f8c79455'):(layer===2?'#87939c66':'#87939c33'),1);}
    if(layer===2&&rand()>.7)box(c,x+step/2-5,y-16,3,12,'#6b6478');
   }
  }));
  this.background={zone,sky,layers,mountains};
 }
 skyline(r) {
  if(this.background?.zone!==r.zone)this.makeBackground(r.zone);
  const c=this.ctx,b=this.background;c.drawImage(b.sky,0,0,this.w,this.h);
  this.space.draw(this,r);
  c.save(); c.globalAlpha=clamp(1-(r.d-250)/550,0,1);
  if(r.zone<2){
   const width=this.w+240;
   b.mountains.forEach((layer,i)=>{const offset=(r.d*this.scale*(.03+i*.03))%width,y=this.baseGround-170-20+i*22;c.drawImage(layer,-offset,y,width,170);c.drawImage(layer,width-offset,y,width,170);});
   // Drifting pixel clouds between the mountains and the city.
   {const drift=this.motionReduced?0:this.time*6;for(let i=0;i<5;i++){const art=this.art.clouds[i%3],cw=art.width*2,x=((i*331+this.w*.2-r.d*this.scale*.05-drift)%(this.w+cw)+this.w+cw)%(this.w+cw)-cw,y=this.baseGround-250-(i%3)*34-(i%2)*18;c.drawImage(art,snap(x),snap(y),cw,art.height*2);}}
   b.layers.forEach((layer,i)=>{const offset=(r.d*this.scale*(.12+i*.15))%width,y=this.baseGround-210+i*15;c.drawImage(layer,-offset,y,width,210);c.drawImage(layer,width-offset,y,width,210);});
  }
  c.restore();
 }
 building(r) { if(r.d<=300)drawDfinityBuilding(this); }
 terrain(r) {
  const g=this.ground,c=this.ctx,space=r.zone>=2;
  // Façade ends at the sidewalk, road begins below it; no window can cross this seam.
  this.building(r);
  if(g<this.h){
   const edge=r.zone<2?'#e6b596':ZONES[r.zone].color;
   this.rect(0,g,this.w,this.h-g,space?'#121428':'#232535');
   if(space){c.save();c.globalAlpha=.35;this.rect(0,g-6,this.w,6,edge);c.globalAlpha=.14;this.rect(0,g-14,this.w,8,edge);c.restore();}
   this.rect(0,g,this.w,3,edge);this.rect(0,g+3,this.w,8,space?'#1d2a46':'#4b4856');this.rect(0,g+11,this.w,1,'#191c2b');
   const off=(r.d*this.scale)%110;for(let x=-110;x<this.w+110;x+=110)this.rect(x-off,g+33,48,3,space?'#3b4f7a77':'#8c819077',1);
   if(space){const grid=(r.d*this.scale*.6)%44;for(let x=-44;x<this.w+44;x+=44)this.rect(snap(x-grid),g+14,2,this.h-g-14,'#2a3a6040');for(let y=g+20;y<this.h;y+=18)this.rect(0,y,this.w,1,'#2a3a6035');}
  }
  const start=Math.floor((r.d-120)/100)*100;
  for(let d=start;d<r.d+600;d+=100){if(d<0)continue;const [x,y]=this.screen(d,0);line(c,[[x,y+1],[x,y+10]],'#b1a0a3',1);this.text(`${d}m`,x+5,y+13,'#d0bec2',8,'left',true);}
 }
 current(o) {
  const [x,top]=this.screen(o.d,o.top),bottom=this.screen(o.d,o.bottom)[1];
  if(x<-30||x>this.w+30)return;
  const c=this.ctx,y1=Math.max(75,top),y2=Math.min(this.h,bottom),half=o.radius*this.scale;
  if(y2<=y1)return;
  c.save(); c.globalAlpha=.85;
  this.rect(x-half,y1,half*2,y2-y1,'#163541a8');
  for(let y=y1;y<y2;y+=18){this.rect(x-half,y,2,8,C.cyan);this.rect(x+half-2,y,2,8,C.cyan);}
  const offset=this.motionReduced?0:(this.time*32)%32;
  for(let y=y1+20-offset;y<y2-6;y+=32) if(y>y1+5)line(c,[[x-5,y+4],[x,y],[x+5,y+4]],'#a6f3dc',2);
  this.text('+ LIFT',x,y1-15,C.mint,9,'center',true); c.restore();
 }
 pickup(o,r) {
  if(r.hits.has(o.id))return;
  if(o.kind==='updraft'){this.current(o);return;}
  const [x,y]=this.screen(o.d,o.y);if(x<-35||x>this.w+35||y<-35||y>this.h+30)return;
  const c=this.ctx,s=this.w<700?.85:1;c.save();c.translate(x,y);c.scale(s,s);
  if(o.kind==='cycle') {
   const frame=this.motionReduced?0:Math.floor((this.time*9+o.d*.37)%8);
   c.drawImage(this.art.coin[frame],-14,-14,28,28);
   if(!this.motionReduced&&(this.time*2+o.d*.11)%3<.25){pixels(c,'#fff8e0',[[6,-12,2,6],[4,-10,6,2]]);}
  }
  else if(o.kind==='hazard') {const armor=(o.hp||1)-(r.wallDamage.get(o.id)||0)>1;this.rect(-12,-17,24,34,'#3c293d',2);this.rect(-10,-15,20,30,armor?C.orange:C.red,2);for(let i=0;i<4;i++){this.rect(-9,-9+i*7,18,2,'#85495a');this.rect(i%2?-9:-1,-9+i*7+2,8,5,'#ff7d7d33');}line(c,[[-1,-14],[-3,-4],[3,0],[-2,12]],C.ink,2);if(!this.motionReduced&&Math.floor(this.time*3)%2===0)this.rect(-10,-15,20,2,'#ffd2d2');}
  else if(o.kind==='mine') {const blink=Math.floor(this.time*4+o.d)%2===0;this.ring(0,0,16,'#fa655c35',2);this.ring(0,0,13+Math.sin(this.time*3)*1.5,'#fa655c55',1);for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[[Math.cos(a)*7,Math.sin(a)*7],[Math.cos(a)*12,Math.sin(a)*12]],'#d37084',3);}ellipse(c,0,0,8,8,'#49283f');ellipse(c,0,0,4,4,blink?'#ff8a86':C.red);ellipse(c,-1,-1,1.5,1.5,'#ffce9a');}
  else if(o.kind==='pad') {this.rect(-15,0,30,6,'#355c56',3);this.rect(-12,-3,24,4,C.mint,2);if(!this.motionReduced){const p=(this.time*2)%1;this.rect(-10,-4-p*6,20,1,`rgba(118,230,167,${1-p})`);}}
  else if(o.kind==='coffee') {this.rect(-8,-9,16,19,C.cream,3);this.rect(-8,-2,16,10,'#b77569',2);this.ring(10,-2,5,C.cream,2);const w=this.motionReduced?0:Math.sin(this.time*4)*2;line(c,[[-3+w,-15],[-1+w,-18]],'#fff3da88',1.5);line(c,[[3-w,-13],[5-w,-17]],'#fff3da88',1.5);}
  else if(o.kind==='canister') {this.rect(-10,-13,20,26,'#447e91',4);this.rect(-8,-11,16,8,C.cyan,2);this.rect(-8,1,16,9,C.cyan,2);ellipse(c,4,-7,1.6,1.6,C.cream);ellipse(c,4,5,1.6,1.6,C.cream);}
  else if(o.kind==='identity') {this.ring(-2,-5,7,C.mint,3);line(c,[[-2,2],[-2,14],[3,14],[-2,10],[3,10]],C.mint,3);}
  else if(o.kind==='oisy') {c.beginPath();c.arc(0,-2,9,0,Math.PI);c.lineTo(-9,-10);c.strokeStyle=C.purple;c.lineWidth=5;c.stroke();line(c,[[9,-2],[9,-10]],C.purple,5);line(c,[[-9,-10],[-9,-6]],C.cream,5);line(c,[[9,-10],[9,-6]],C.cream,5);}
  else {const color=o.kind==='fusion'?C.orange:C.cyan;if(['portal','fusion','neuron'].includes(o.kind))this.ring(0,0,16+(this.motionReduced?0:Math.sin(this.time*3)*2),color,2);c.beginPath();c.moveTo(0,-12);c.lineTo(9,0);c.lineTo(0,12);c.lineTo(-9,0);c.closePath();c.fillStyle=color;c.fill();line(c,[[0,-8],[0,7]],C.cream,2);}
  if(!['cycle','pad','hazard','mine','coffee'].includes(o.kind)){c.save();c.globalAlpha=.18+(this.motionReduced?0:Math.sin(this.time*3)*.08);ellipse(c,0,0,24,24,C.mint);c.restore();}
  if(this.target?.id===o.id){const p=this.motionReduced?0:Math.sin(this.time*10)*2;line(c,[[-16-p,-9],[-16-p,-18],[-7,-18]],C.cream,1.5);line(c,[[16+p,9],[16+p,18],[7,18]],C.cream,1.5);line(c,[[16+p,-9],[16+p,-18],[7,-18]],C.cream,1.5);line(c,[[-16-p,9],[-16-p,18],[-7,18]],C.cream,1.5);}
  c.restore();
 }
 update(r,dt) {
  this.run=r;this.time+=dt;this.ensureWorld(r.d);this.scale=viewScale(this.w,this.h);this.bx=this.w*(r.phase==='ready'||r.phase==='charging'?.46:.24);
  const short=this.h<520;this.baseGround=this.h-(short?126:this.w<700?184:188);
  const follow=Math.max(START_HEIGHT,Math.min(92,(this.baseGround-(short?125:230))/this.scale-38));this.ground=this.baseGround+Math.max(0,r.y-follow)*this.scale;
  const c=this.ctx;
  // Screen shake: decaying pixel-stepped offset, applied to the whole scene.
  this.shake=Math.max(0,this.shake-dt*2.8);
  if(this.shake>0&&!this.motionReduced){const s=this.shake*this.shake*8;this.shakeX=snap(Math.sin(this.time*61)*s);this.shakeY=snap(Math.sin(this.time*47+1)*s*.7);}else{this.shakeX=0;this.shakeY=0;}
  c.save();c.translate(this.shakeX,this.shakeY);
  this.skyline(r);this.terrain(r);for(const o of this.objects)this.pickup(o,r);
  if(r.phase==='charging'||r.phase==='ready') {const v=launchVelocity(r.phase==='charging'?r.charge:.65,r.angle);let last=null;for(let i=1;i<24;i++){const t=i*.085,[x,y]=this.screen(v.speed*t,START_HEIGHT+v.vy*t-GRAVITY*t*t/2);const big=i%3===0;this.rect(snap(x)-(big?3:1),snap(y)-(big?3:1),big?6:3,big?6:3,big?C.cream:'#bbecce88');last=[x,y];}
   if(r.phase==='charging'){const [bx0,by0]=this.screen(r.d,r.y);c.save();c.globalAlpha=.25+r.charge*.35;this.ring(bx0,by0-11,30+r.charge*18,r.charge>=.94?C.mint:C.gold,2+r.charge*3);c.restore();}}
  const g=r.ghost;
  if(g.active&&g.fade>.1){const [x,y]=this.screen(g.d,g.y),size=this.w<700?.6:.78;
   const heading=Math.atan2(-(g.vy||0),g.vd||1),backD=-Math.cos(heading),backY=Math.sin(heading);
   if(this.ghostEncounter!==g.encounter){this.ghostWake.reset();this.ghostEncounter=g.encounter;}
   if(dt>0||this.ghostWake.count===0)this.ghostWake.push(g.d+backD*7,g.y+backY*7,0);
   // Retro tracer blocks follow the world-space turn, retaining the pixel silhouette.
   if(!this.motionReduced)for(let i=17;i>=0;i--){
    this.ghostWake.sample(i*1.1,backD,backY,0,this.ghostWakePoint);
    const [tx,ty]=this.screen(this.ghostWakePoint[0],this.ghostWakePoint[1]),fade=1-i/18,width=(7-i*.28)*size;
    c.save();c.globalAlpha=g.fade*fade;
    this.rect(Math.round(tx/2)*2-5,Math.round(ty/2)*2-width*.9,10,width*1.8,i%2?'#ed86d33a':'#65dfff3a',2);
    this.rect(Math.round(tx/2)*2-3,Math.round(ty/2)*2-width*.35,6,width*.7,i%2?'#f39cde':'#8aefff',1);c.restore();
   }
   c.save();c.translate(x,y);c.globalAlpha=g.fade;
   c.save();c.rotate(heading-Math.PI);
   c.drawImage(this.art.ghost,-50*size,-45*size,100*size,90*size);c.restore();
   for(let i=0;i<g.hp;i++)this.rect(-10+i*12,-37*size,8,3,C.pink,1.5);
   if(g.phase==='warning'){this.ring(-27*size,10*size,5+g.time*8,C.pink,1.5);this.text('!',-43*size,-12*size,C.gold,17,'left',true);}
   if(this.target?.kind==='ghost')this.ring(0,-1,38*size,'#fff3da65',1);
   c.restore();
  }else this.ghostWake.reset();
  for(const p of r.projectiles){const [x,y]=this.screen(p.d,p.y);const a=Math.atan2(-p.vy,p.vd);line(c,[[x-Math.cos(a)*22,y-Math.sin(a)*22],[x,y]],'#62d9ec55',7);line(c,[[x-Math.cos(a)*15,y-Math.sin(a)*15],[x,y]],C.cyan,4);ellipse(c,x,y,3,3,C.cream);}
  for(const p of g.shots){const [x,y]=this.screen(p.d,p.y),angle=Math.atan2(-p.vy,p.vd);line(c,[[x-Math.cos(angle)*22,y-Math.sin(angle)*22],[x,y]],'#f1a0d255',8);line(c,[[x-Math.cos(angle)*15,y-Math.sin(angle)*15],[x,y]],C.pink,4);ellipse(c,x,y,2.5,2.5,C.cream);}
  const [bx,physicsY]=this.screen(r.d,r.y),by=Math.min(physicsY,this.ground-11),size=this.w<700?.66:.9;
  const energy=r.flow.active>0?1:r.boostTime>0?.75:0;
  if(r.phase==='flying'&&dt>0){
   this.trail.push({d:r.d,y:r.y,energy});if(this.trail.length>26)this.trail.shift();
   // Exhaust pixels: a steady trickle, a torrent while boosting.
   this.exhaustClock+=dt*(14+energy*40+r.speed*.08);
   while(this.exhaustClock>=1){this.exhaustClock-=1;if(!this.motionReduced)this.particles.push({d:r.d-5,y:r.y-.5+(Math.random()-.5)*2,vd:-18-Math.random()*20,vy:(Math.random()-.5)*8,life:.25+energy*.35+Math.random()*.2,color:energy?(r.flow.godCandle?'#6dffb4':Math.random()<.5?C.gold:C.orange):Math.random()<.6?C.cyan:'#fff3da',size:energy?6:4});}
   // Speed streaks at high airspeed.
   if(!this.motionReduced&&(r.speed>105||energy>0)&&Math.random()<.5)this.streaks.push({y:Math.random()*(this.ground-60)+40,x:this.w+20,speed:900+Math.random()*700+r.speed*4,length:40+Math.random()*90,life:1});
  }
  if(this.trail.length>1){for(let i=1;i<this.trail.length;i++){const a=this.trail[i-1],b=this.trail[i],[x1,y1]=this.screen(a.d,a.y),[x2,y2]=this.screen(b.d,b.y),f=i/this.trail.length;c.save();c.globalAlpha=f*(b.energy?.9:.45);line(c,[[x1,y1],[x2,y2]],b.energy?(r.flow.godCandle&&r.flow.active>0?'#6dffb4':C.gold):r.boostTime>0?C.mint:'#d6c4e3',b.energy?2+f*4:1+f*2);c.restore();}}
  for(const s of this.streaks){s.x-=s.speed*dt;s.life=s.x>-s.length?1:0;c.save();c.globalAlpha=.22;this.rect(snap(s.x),snap(s.y),s.length,2,'#fff3da');c.restore();}this.streaks=this.streaks.filter(s=>s.life>0).slice(-40);
  if(r.y<16){const [x,y]=this.screen(r.d,0);ellipse(c,x,y-1,18*(1-r.y/18),3,'#12152250');}
  if(r.shield){c.save();c.globalAlpha=.5+Math.sin(this.time*5)*.2;this.ring(bx,by,31*size,C.mint,2);c.restore();}if(r.magnetTime>0)this.ring(bx,by,37*size,'#a799ed90',1.5);
  c.save();c.translate(bx,by);c.rotate(r.phase==='flying'?clamp(-Math.atan2(r.vy,r.speed||1)*.35,-.35,.35):0);
  if(energy>0){const flick=this.motionReduced?0:Math.sin(this.time*50)*3;ellipse(c,-34*size,0,(22+flick)*size,7*size,r.flow.godCandle&&r.flow.active>0?'#6dffb480':'#fa655c70');ellipse(c,-29*size,0,(15+flick)*size,4*size,r.flow.godCandle&&r.flow.active>0?'#c8ffd9':C.gold);}
  const wing=r.phase==='flying'?(this.motionReduced?1:Math.floor(this.time*22)%2+1):0;
  if(!r.hitTime||Math.floor(r.hitTime*20)%2===0)c.drawImage(this.art.bug[wing],-52*size,-36*size,96*size,72*size);c.restore();
  for(const p of this.particles){p.life-=dt;p.d+=p.vd*dt;p.y+=p.vy*dt;p.vy-=20*dt;const [x,y]=this.screen(p.d,p.y);c.save();c.globalAlpha=Math.min(1,p.life*3);this.rect(snap(x),snap(y),p.size||4,p.size||4,p.color);c.restore();}this.particles=this.particles.filter(p=>p.life>0);
  for(const p of this.labels){p.life-=dt;p.y+=9*dt;const [x,y]=this.screen(p.d,p.y);c.save();c.globalAlpha=Math.min(1,p.life*2.5);this.text(p.text,snap(x)+1,snap(y)+1,'#15152599',p.size||11,'center',true);this.text(p.text,snap(x),snap(y),p.color,p.size||11,'center',true);c.restore();}this.labels=this.labels.filter(p=>p.life>0);
  if(r.phase==='flying'&&!short){this.text(ZONES[r.zone].name.toUpperCase(),this.w-22,145,ZONES[r.zone].color,this.w<700?9:11,'right',true);if(r.flow.active>0)this.text(r.flow.godCandle?'TO THE MOON':'OVERDRIVE',bx,by-42,C.gold,12,'center',true);}
  this.space.discovery(this,r);
  c.restore();
  this.flash=Math.max(0,this.flash-dt);if(this.flash>0&&!this.motionReduced){c.globalAlpha=Math.min(.14,this.flash*.9);this.rect(0,0,this.w,this.h,this.flashColor);c.globalAlpha=1;}
 }
 stats() { return {renderer:'Canvas2D',width:this.w,height:this.h,pixelRatio:this.dpr,scenePixelCss:2,objects:this.objects.length,chunks:this.chunks.size,particles:this.particles.length}; }
}
