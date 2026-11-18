import { WakePath } from '../wake-path.js';
import { buildingLayout, drawDfinityBuilding } from './hq-building.js';
export { buildingLayout };
import { drawInsignia } from './insignia.js';
import { SpaceSky } from './space-sky.js';
import { makePanorama, drawPanorama } from './panorama.js';
import { makeObjects, seededRandom, ZONES, zoneIndex, clamp, GRAVITY, START_HEIGHT, launchVelocity } from './physics.js';

const C = {ink:'#151525', cream:'#fff1cf', red:'#ff535b', orange:'#ff994d', gold:'#ffd45c', mint:'#76e6a7', cyan:'#62d9ec', purple:'#9c79e8', pink:'#f28dcd'};
const TAU = Math.PI * 2;
const PIXEL = '"Silkscreen","JetBrains Mono",ui-monospace,monospace';
function ellipse(c,x,y,rx,ry,color,rotation=0) { c.beginPath(); c.ellipse(x,y,rx,ry,rotation,0,TAU); c.fillStyle=color; c.fill(); }
function line(c,points,color,width=2) { c.beginPath(); points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.strokeStyle=color; c.lineWidth=width; c.lineCap='round'; c.lineJoin='round'; c.stroke(); }
function box(c,x,y,w,h,color,r=0) { c.fillStyle=color; if(r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}else c.fillRect(x,y,w,h); }
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
export function drawBug(c,wing=0) {
 const dark='#151a32',metal='#a5bbc6',white='#fff7db';
 // Articulated wings and folded beetle legs frame the two-tone shell.
 if(wing){const lift=wing===1?-10:-1;
  pixelOval(c,-10,-13+lift,15,6,'#c7f2ed88');pixelOval(c,-3,-14+lift,11,5,'#e3fffa99');}
 pixels(c,dark,[[-24,3,5,12],[-29,13,10,4],[-6,8,4,10],[-10,17,11,4],[12,7,4,9],[12,15,10,4]]);
 pixels(c,metal,[[-25,13,6,2],[-7,17,6,2],[14,15,6,2]]);
 pixelOval(c,-9,-2,24,16,dark);pixelOval(c,-9,-4,21,13,'#96384f');pixelOval(c,-10,-7,19,10,'#f46165');
 pixels(c,'#ffac84',[[-22,-12,12,3],[-17,-15,10,3]]);pixels(c,dark,[[-23,-7,6,5],[-14,0,6,5],[-7,-12,5,5]]);
 pixels(c,'#556482',[[-35,-5,8,8],[-34,6,9,4]]);pixels(c,'#8fece8',[[-37,-4,4,4],[-35,5,3,3]]);
 // Porcelain helmet and smoked visor; the rainbow weave stays clear at one-device-pixel scale.
 pixelOval(c,13,-5,18,17,dark);pixelOval(c,13,-6,17,15,metal);
 pixelOval(c,12,-9,16,12,white);pixelOval(c,16,-8,13,11,'#11172a');
 pixels(c,'#526579',[[6,-15,6,2],[4,-12,3,3],[21,-17,4,2]]);
 pixels(c,'#d6e9e5',[[0,-6,4,10],[6,5,15,3],[25,-1,3,4]]);
 pixels(c,'#595f77',[[7,5,6,2],[25,-5,3,4]]);
 const led=['#ed72a6','#e873b6','#ab85ec','#64d9ed','#58e7e1','#72e0ed','#ffc873','#f49a6d'];
 for(let i=0;i<32;i++){
  const t=i*Math.PI/16,x=16+Math.sin(t)*9,y=-7+Math.sin(t*2)*3.5;
  c.fillStyle=led[Math.floor(i/4)];c.fillRect(Math.round(x),Math.round(y),2.1,2.1);
 }
 pixels(c,dark,[[0,-20,2,8],[2,-22,6,3]]);pixels(c,'#f8cc76',[[6,-23,4,4]]);
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
function drawCoin(c,frame,zone) {
 const depth=Math.cos(frame*Math.PI/8),rx=Math.max(3,Math.abs(depth)*10);
 // A cut rim retains its silhouette edge-on. Each chapter mints its own die.
 c.save();c.scale(rx/10,1);
 const rim=[[-6,-10],[4,-10],[9,-6],[10,4],[5,9],[-5,10],[-10,5],[-10,-5]];
 c.beginPath();rim.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();
 c.fillStyle='#261b3a';c.lineWidth=3.8;c.strokeStyle='#30243d';c.stroke();c.fill();
 c.lineWidth=2.4;c.strokeStyle='#ffc666';c.stroke();
 line(c,[[-8,-6],[-5,-9],[3,-9]],'#ffedac',2);
 if(rx>4.5){c.scale(1.12,1.12);drawInsignia(c,zone.key,zone.color||'#ffe6a7',1.8);}
 c.restore();
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
   ghost:this.surface(100,90,c=>{c.translate(50,45);drawMotoko(c);})
  };
  this.background=null; this.coinArt=new Map();
 }
 reset(day,seed=day) { this.day=day;this.seed=seed;this.chunks=new Set();this.objects=[];this.particles=[];this.labels=[];this.ripples=[];this.coinLabel=null;this.lastCoinChapter=null;this.trail=[];this.streaks=[];this.ghostWake=new WakePath();this.ghostWakePoint=new Float64Array(3);this.ghostEncounter=-1;this.target=null;this.flash=0;this.flashColor=C.red;this.time=0;this.shake=0;this.shakeX=0;this.shakeY=0;this.exhaustClock=0;this.worldRange='';this.ensureWorld(0); }
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
   const chapter=ZONES[zoneIndex(d)];
   const color=chapter.color;
   this.spark(d,y,C.gold,5,21,.28,6);
   if(!this.motionReduced)this.ripples.push({d,y,color,life:.26,duration:.26,radius:19});
   // Consecutive coins belong to one arc. One accumulating label leaves the next target visible.
   if(this.coinLabel&&this.coinLabel.life>.30&&this.coinLabel.chapter===chapter.key){
    Object.assign(this.coinLabel,{d,y:y+4,points:this.coinLabel.points+50,life:.65});
   }else{
    this.coinLabel={chapter:chapter.key,d,y:y+4,points:50,life:.65,color:'#fff2b5',size:12};this.labels.push(this.coinLabel);
   }
   if(this.lastCoinChapter!==chapter.key){
    this.lastCoinChapter=chapter.key;
    this.coinLabel.motif=chapter.token;
   }
   this.coinLabel.text='+'+this.coinLabel.points+(this.coinLabel.motif?' '+this.coinLabel.motif:'');
  } else if(e.kind==='collect'&&!['pad','hazard','mine','updraft'].includes(e.type)){
   const color=ZONES[zoneIndex(d)].color;
   this.spark(d,y,color,14,35,.45,10);
   if(!this.motionReduced)this.ripples.push({d,y,color,life:.38,duration:.38,radius:32});
   this.labels.push({d,y:y+3,text:e.type.toUpperCase(),life:.8,color:C.cream,size:12});
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
  this.particles=this.particles.slice(-160);this.labels=this.labels.slice(-12);if(this.ripples.length>10)this.ripples.shift();
 }
 skyline(r) {
  if (this.background?.zone !== r.zone) this.background = makePanorama(this, r.zone, ZONES[r.zone], seededRandom);
  drawPanorama(this,r);
 }
 building(r) { if(r.d<=300)drawDfinityBuilding(this); }
 terrain(r) {
  const g=this.ground,c=this.ctx,space=r.zone>=2;
  // Façade ends at the sidewalk, road begins below it; no window can cross this seam.
  if(r.zone<2&&g>this.baseGround+2){
   const top=this.baseGround,bottom=Math.min(g,this.h),water=c.createLinearGradient(0,top,0,bottom);
   water.addColorStop(0,'#554965');water.addColorStop(.25,'#4b4864');water.addColorStop(1,'#293651');
   this.rect(0,top,this.w,bottom-top,water);
   for(let i=0;i<42;i++){
    const t=(i*.61803398875)%1,y=top+3+t*(bottom-top-3);
    const drift=this.motionReduced?0:this.time*(4+5*t);
    const x=((i*173-r.d*this.scale*.18+drift)%(this.w+62)+this.w+62)%(this.w+62)-38;
    this.rect(snap(x),snap(y),8+Math.round(t*34),2,i%4?'#8e91a94d':'#dc9c9680');
   }
  }
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
  c.save();
  const air=c.createLinearGradient(x-half*1.4,0,x+half*1.4,0);
  air.addColorStop(0,'#62dfef00');air.addColorStop(.38,'#78e9e22b');air.addColorStop(.55,'#abffe743');air.addColorStop(1,'#69cbe800');
  this.rect(x-half*1.4,y1,half*2.8,y2-y1,air);
  const offset=this.motionReduced?0:(this.time*32)%46;
  for(let yy=y1+25-offset;yy<y2-5;yy+=46)if(yy>y1+5){
   line(c,[[x-7,yy+4],[x,yy-2],[x+7,yy+4]],'#95edddae',2);
   this.rect(x-half,yy+9,2,15,'#a0f5ed78');this.rect(x+half,yy-4,2,10,'#a0f5ed78');
  }
  this.text('↑ LIFT',x,Math.max(y1+5,84),C.mint,11,'center',true); c.restore();
 }
 pickup(o,r) {
  if(r.hits.has(o.id))return;
  if(o.kind==='updraft'){this.current(o);return;}
  const [x,y]=this.screen(o.d,o.y);if(x<-35||x>this.w+35||y<-35||y>this.h+30)return;
  const c=this.ctx,s=this.w<700?.85:1;c.save();c.translate(x,y);c.scale(s,s);
  if(o.kind==='cycle') {
   const frame=this.motionReduced?0:Math.floor((this.time*9+o.d*.37)%8);
   const period=ZONES[zoneIndex(o.d)],cache=this.coinArt;
   if(!cache.has(period.key)){
    cache.set(period.key,Array.from({length:8},(_,i)=>this.surface(28,28,sprite=>{sprite.translate(14,14);drawCoin(sprite,i,period);})));
   }
   c.drawImage(cache.get(period.key)[frame],-14,-14,28,28);
   if(!this.motionReduced&&(this.time*2+o.d*.11)%3<.25){pixels(c,'#fff8e0',[[6,-12,2,6],[4,-10,6,2]]);}
  }
  else if(o.kind==='hazard') {const armor=(o.hp||1)-(r.wallDamage.get(o.id)||0)>1;this.rect(-12,-17,24,34,'#3c293d',2);this.rect(-10,-15,20,30,armor?C.orange:C.red,2);for(let i=0;i<4;i++){this.rect(-9,-9+i*7,18,2,'#85495a');this.rect(i%2?-9:-1,-9+i*7+2,8,5,'#ff7d7d33');}line(c,[[-1,-14],[-3,-4],[3,0],[-2,12]],C.ink,2);if(!this.motionReduced&&Math.floor(this.time*3)%2===0)this.rect(-10,-15,20,2,'#ffd2d2');}
  else if(o.kind==='mine') {const blink=Math.floor(this.time*4+o.d)%2===0;this.ring(0,0,16,'#fa655c35',2);this.ring(0,0,13+Math.sin(this.time*3)*1.5,'#fa655c55',1);for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[[Math.cos(a)*7,Math.sin(a)*7],[Math.cos(a)*12,Math.sin(a)*12]],'#d37084',3);}ellipse(c,0,0,8,8,'#49283f');ellipse(c,0,0,4,4,blink?'#ff8a86':C.red);ellipse(c,-1,-1,1.5,1.5,'#ffce9a');}
  else if(o.kind==='pad') {this.rect(-15,0,30,6,'#355c56',3);this.rect(-12,-3,24,4,C.mint,2);if(!this.motionReduced){const p=(this.time*2)%1;this.rect(-10,-4-p*6,20,1,`rgba(118,230,167,${1-p})`);}}
  else {
   const accent=({coffee:'#ffae73',canister:'#79e9fa',identity:'#a0f2bd',oisy:'#c99dff',fusion:'#ff9c91',portal:'#78dfec',compiler:'#ef9ff1',neuron:'#efd278'})[o.kind]||C.cyan;
   const pulse=this.motionReduced?0:(1+Math.sin(this.time*3+o.d))*.5;
   c.save();c.rotate(Math.PI*.25);
   this.rect(-15,-15,30,30,'#0d1834',5);
   c.strokeStyle=accent;c.lineWidth=2.4;c.strokeRect(-12,-12,24,24);
   this.rect(-13,-13,8,3,'#fff2d6');
   c.restore();c.save();c.scale(1.9,1.9);drawInsignia(c,o.kind==='oisy'?'magnet':o.kind,accent,1.7);c.restore();
   if(!this.motionReduced){c.globalAlpha=.16+.12*pulse;this.ring(0,0,22+pulse*3,accent,1.5);c.globalAlpha=1;}
  }
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
  const [bx,physicsY]=this.screen(r.d,r.y),by=Math.min(physicsY,this.ground-11),size=this.w<700?.8:1;
  const energy=r.flow.active>0?1:r.boostTime>0?.75:0;
  if(r.phase==='flying'&&dt>0){
   this.trail.push({d:r.d,y:r.y,energy});if(this.trail.length>26)this.trail.shift();
   // Exhaust pixels: a steady trickle, a torrent while boosting.
   this.exhaustClock+=dt*(14+energy*40+r.speed*.08);
   while(this.exhaustClock>=1){this.exhaustClock-=1;if(!this.motionReduced)this.particles.push({d:r.d-5,y:r.y-.5+(Math.random()-.5)*2,vd:-18-Math.random()*20,vy:(Math.random()-.5)*8,life:.25+energy*.35+Math.random()*.2,color:energy?(r.flow.godCandle?'#6dffb4':Math.random()<.5?C.gold:C.orange):Math.random()<.6?C.cyan:'#fff3da',size:energy?6:4});}
   // Speed streaks at high airspeed.
   if(!this.motionReduced&&(r.speed>105||energy>0)&&Math.random()<.5)this.streaks.push({y:Math.random()*(this.ground-60)+40,x:this.w+20,speed:900+Math.random()*700+r.speed*4,length:40+Math.random()*90,life:1});
  }
  if(this.trail.length>1){for(let i=1;i<this.trail.length;i++){const a=this.trail[i-1],b=this.trail[i],[x1,y1]=this.screen(a.d,a.y),[x2,y2]=this.screen(b.d,b.y),f=i/this.trail.length;c.save();c.globalAlpha=f*(b.energy?.9:.45);line(c,[[x1,y1],[x2,y2]],b.energy?(r.flow.godCandle&&r.flow.active>0?'#6dffb4':C.gold):r.boostTime>0?C.mint:'#8ed9e6',b.energy?3+f*4:1+f*2);c.restore();}}
  for(const s of this.streaks){s.x-=s.speed*dt;s.life=s.x>-s.length?1:0;c.save();c.globalAlpha=.22;this.rect(snap(s.x),snap(s.y),s.length,2,'#fff3da');c.restore();}this.streaks=this.streaks.filter(s=>s.life>0).slice(-40);
  if(r.y<16){const [x,y]=this.screen(r.d,0);ellipse(c,x,y-1,18*(1-r.y/18),3,'#12152250');}
  if(r.shield){c.save();c.globalAlpha=.5+Math.sin(this.time*5)*.2;this.ring(bx,by,31*size,C.mint,2);c.restore();}if(r.magnetTime>0)this.ring(bx,by,37*size,'#a799ed90',1.5);
  c.save();c.translate(bx,by);c.rotate(r.phase==='flying'?clamp(-Math.atan2(r.vy,r.speed||1)*.35,-.35,.35):0);
  if(energy>0){const flick=this.motionReduced?0:Math.sin(this.time*50)*3;ellipse(c,-34*size,0,(22+flick)*size,7*size,r.flow.godCandle&&r.flow.active>0?'#6dffb480':'#fa655c70');ellipse(c,-29*size,0,(15+flick)*size,4*size,r.flow.godCandle&&r.flow.active>0?'#c8ffd9':C.gold);}
  const wing=r.phase==='flying'?(this.motionReduced?1:Math.floor(this.time*22)%2+1):0;
  if(!r.hitTime||Math.floor(r.hitTime*20)%2===0)c.drawImage(this.art.bug[wing],-52*size,-36*size,96*size,72*size);c.restore();
  for(const p of this.particles){p.life-=dt;p.d+=p.vd*dt;p.y+=p.vy*dt;p.vy-=20*dt;const [x,y]=this.screen(p.d,p.y);c.save();c.globalAlpha=Math.min(1,p.life*3);this.rect(snap(x),snap(y),p.size||4,p.size||4,p.color);c.restore();}this.particles=this.particles.filter(p=>p.life>0);
  for(const ripple of this.ripples){
   ripple.life-=dt;if(ripple.life<=0)continue;
   const progress=1-ripple.life/ripple.duration,[x,y]=this.screen(ripple.d,ripple.y);
   c.save();c.globalAlpha=(1-progress)*.8;this.ring(x,y,6+progress*ripple.radius,ripple.color,2);c.restore();
  }
  this.ripples=this.ripples.filter(ripple=>ripple.life>0);
  for(const label of this.labels){
   label.life-=dt;label.y+=9*dt;
   const [lx,ly]=this.screen(label.d,label.y);
   c.save();c.globalAlpha=Math.max(0,Math.min(1,label.life*3));
   if(label.points){
    // Keep the reward clear of the visor, also when the collected coin has scrolled off-screen.
    const size=this.w<700?14:16;c.font=`600 ${size}px ui-monospace, monospace`;
    const width=c.measureText(label.text).width+14;
    const x=clamp(bx-width/2,6,this.w-width-6),y=by-(this.w<700?51:59)-(1-label.life/.65)*7;
    this.rect(snap(x),snap(y),width,22,'#152037e6',3);
    this.text(label.text,snap(x)+width/2,snap(y)+3,'#ffe8aa',size,'center');
   }else{
    this.text(label.text,snap(lx)+1,snap(ly)+1,'#15152599',label.size||11,'center',true);
    this.text(label.text,snap(lx),snap(ly),label.color,label.size||11,'center',true);
   }
   c.restore();
  }
  this.labels=this.labels.filter(label=>label.life>0);
  if(r.phase==='flying'&&!short&&r.flow.active>0)this.text(r.flow.godCandle?'TO THE MOON':'OVERDRIVE',bx,by-42,C.gold,12,'center',true);
  this.space.discovery(this,r);

  c.restore();
  this.flash=Math.max(0,this.flash-dt);if(this.flash>0&&!this.motionReduced){c.globalAlpha=Math.min(.14,this.flash*.9);this.rect(0,0,this.w,this.h,this.flashColor);c.globalAlpha=1;}
 }
 stats() { return {renderer:'Canvas2D',width:this.w,height:this.h,pixelRatio:this.dpr,scenePixelCss:2,objects:this.objects.length,chunks:this.chunks.size,particles:this.particles.length}; }
}
