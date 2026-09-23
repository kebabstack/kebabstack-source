import { makeObjects, seededRandom, ZONES, clamp, GRAVITY, START_HEIGHT, launchVelocity } from './physics.js';

const C = {ink:'#151525', cream:'#fff3da', red:'#fa655c', orange:'#ffa46b', gold:'#ffdb88', mint:'#99e6c1', cyan:'#84deed', purple:'#a799ed', pink:'#f1a0d2'};
const TAU = Math.PI * 2;
function ellipse(c,x,y,rx,ry,color,rotation=0) { c.beginPath(); c.ellipse(x,y,rx,ry,rotation,0,TAU); c.fillStyle=color; c.fill(); }
function line(c,points,color,width=2) { c.beginPath(); points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.strokeStyle=color; c.lineWidth=width; c.lineCap='round'; c.lineJoin='round'; c.stroke(); }
function box(c,x,y,w,h,color,r=0) { c.fillStyle=color; if(r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}else c.fillRect(x,y,w,h); }
function gradient(c,x,y,x2,y2,stops) { const g=c.createLinearGradient(x,y,x2,y2); stops.forEach(([at,color])=>g.addColorStop(at,color)); return g; }

// Draw once at device resolution, then reuse the sprite surface each frame.
// The silhouette, eyes and shell remain legible at mobile sizes.
export function drawBug(c) {
 line(c,[[-13,0],[-24,-7],[-29,-4]],C.ink,3); line(c,[[-13,5],[-24,12],[-29,10]],C.ink,3);
 line(c,[[0,7],[-4,17],[1,18]],C.ink,3); line(c,[[9,5],[16,14],[21,12]],C.ink,3);
 ellipse(c,-3,1,24,17,C.ink,-.05);
 ellipse(c,-4,-2,21,15,gradient(c,0,-20,0,16,[[0,'#ff9a7e'],[.45,'#fa625b'],[1,'#c83f55']]),-.06);
 line(c,[[-25,-1],[-9,-2],[12,0]],'#813648',1.7);
 for(const [x,y,rx,ry] of [[-14,-9,3.8,3],[-5,7,4,3.6],[3,-8,3.6,3.2],[-19,4,3,2.7]]) ellipse(c,x,y,rx,ry,'#362637');
 ellipse(c,-10,-12,6,1.8,'#ffd1a4',-.18);
 ellipse(c,18,0,11,10,C.ink,-.1);
 line(c,[[21,-6],[23,-16],[29,-19]],C.ink,2); ellipse(c,29,-19,2.2,2.2,C.gold);
 ellipse(c,23,-2,5,5.5,'#fff5d9'); ellipse(c,25,-2,2.2,3,'#171827'); ellipse(c,25,-3.5,.8,1,'#fff');
 line(c,[[24,6],[28,5]],C.red,1.3);
}
export function drawMotoko(c) {
 // Motoko's recognisable pink shell, dark visor, gold eyes and soft ghost tail.
 c.beginPath(); c.moveTo(-22,9);c.bezierCurveTo(-25,28,-12,31,-8,24);c.bezierCurveTo(-2,38,7,34,8,23);c.bezierCurveTo(16,32,24,22,20,10);c.closePath();c.fillStyle='#9b84dc';c.fill();
 ellipse(c,1,-1,33,25,'#302440');
 ellipse(c,1,-4,30,23,gradient(c,0,-26,0,20,[[0,'#ffcfdf'],[.45,'#eb9dce'],[1,'#a877bc']]));
 c.beginPath();c.moveTo(-27,-5);c.bezierCurveTo(-21,-21,8,-21,26,-10);c.lineTo(24,6);c.bezierCurveTo(9,17,-20,14,-27,4);c.closePath();c.fillStyle='#20243b';c.fill();
 c.beginPath();c.moveTo(-23,-7);c.bezierCurveTo(-11,-16,10,-14,21,-9);c.strokeStyle='#627993';c.lineWidth=2;c.stroke();
 box(c,-17,-3,8,8,C.gold,3);box(c,-3,-3,8,8,C.gold,3);box(c,-16,-2,3,3,'#fff4c5',1);box(c,-2,-2,3,3,'#fff4c5',1);
 ellipse(c,28,-1,7,11,'#b280ba');ellipse(c,29,-2,3.5,6,'#f5c0d7');
 line(c,[[8,-26],[11,-33],[17,-35]],'#72567c',2);ellipse(c,17,-35,3,3,C.cyan);
 ellipse(c,-15,-23,9,2.5,'#ffe3ed',-.18);
 box(c,-33,8,17,7,'#453858',3);box(c,-36,9,6,5,C.pink,2);
}

// All façade details derive from the same roof and street baseline.
export function buildingLayout(x,ground,scale) {
 const height=34*scale,width=55*scale,roof=ground-height,left=x-width*.79;
 return {left,roof,width,height,ground,windows:Array.from({length:12},(_,i)=>({x:left+width*(.09+(i%4)*.22),y:roof+height*(.36+Math.floor(i/4)*.19),w:width*.14,h:height*.115}))};
}
export class GameView {
 constructor(container,day,seed=day) {
  this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label','Ship the Bug 2D: modern retro side-scrolling world');
  this.ctx=this.canvas.getContext('2d',{alpha:false});if(!this.ctx)throw Error('Canvas2D unavailable');
  this.renderer={domElement:this.canvas};container.append(this.canvas);this.motionReduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.resize();window.addEventListener('resize',()=>this.resize());this.reset(day,seed);
 }
 surface(w,h,draw) { const a=document.createElement('canvas');a.width=Math.ceil(w*this.dpr);a.height=Math.ceil(h*this.dpr);const c=a.getContext('2d');c.scale(this.dpr,this.dpr);draw(c);return a; }
 resize() {
  this.w=Math.max(320,innerWidth);this.h=Math.max(240,innerHeight);this.dpr=Math.min(2,window.devicePixelRatio||1);
  this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.ctx.imageSmoothingEnabled=true;
  this.art={bug:this.surface(80,60,c=>{c.translate(40,30);drawBug(c);}),ghost:this.surface(100,90,c=>{c.translate(50,45);drawMotoko(c);})};
  this.background=null;
 }
 reset(day,seed=day) { this.day=day;this.seed=seed;this.chunks=new Set();this.objects=[];this.particles=[];this.labels=[];this.trail=[];this.target=null;this.flash=0;this.time=0;this.worldRange='';this.ensureWorld(0); }
 ensureWorld(d) {
  const first=Math.max(0,Math.floor((d-150)/200)),last=Math.floor((d+650)/200),key=`${first}:${last}`;
  if(key===this.worldRange)return;this.worldRange=key;
  for(let i=first;i<=last;i++)if(!this.chunks.has(i)){this.chunks.add(i);this.objects.push(...makeObjects(this.seed,i));}
  this.objects=this.objects.filter(o=>o.d>=first*200&&o.d<(last+1)*200);
  for(const i of this.chunks)if(i<first||i>last)this.chunks.delete(i);
 }
 rect(x,y,w,h,color,r=0) { if(w>0&&h>0)box(this.ctx,x,y,w,h,color,r); }
 text(text,x,y,color=C.cream,size=12,align='left') { const c=this.ctx;c.fillStyle=color;c.font=`600 ${size}px ui-monospace, monospace`;c.textAlign=align;c.textBaseline='top';c.fillText(text,x,y); }
 ring(x,y,r,color,width=2) { const c=this.ctx;c.beginPath();c.arc(x,y,r,0,TAU);c.strokeStyle=color;c.lineWidth=width;c.stroke(); }
 screen(d,y) { return [this.bx+(d-this.run.d)*this.scale,this.ground-y*this.scale]; }
 event(e,r) {
  if(['collect','destroy','mine-destroy','ghost-destroy','boost','hazard','mine-hit','ghost-hit','overdrive'].includes(e.kind)){
   const color=['hazard','mine-hit','ghost-hit','destroy'].includes(e.kind)?C.red:e.kind==='collect'?C.gold:C.mint;
   for(let i=0;i<(this.motionReduced?3:14);i++)this.particles.push({d:e.d??r.d,y:e.y??r.y,vd:(Math.random()-.5)*32,vy:(Math.random()-.4)*32,life:.45+Math.random()*.3,color});
   if(e.kind==='collect'&&e.type==='cycle')this.labels.push({d:e.d,y:e.y,text:'+50',life:.7,color:C.gold});
   if(['hazard','mine-hit','ghost-hit'].includes(e.kind))this.flash=.16;
  }
  this.particles=this.particles.slice(-120);this.labels=this.labels.slice(-12);
 }
 makeBackground(zone) {
  const w=this.w,h=this.h,horizon=this.baseGround,earth=zone<2;
  const sky=this.surface(w,h,c=>{
   c.fillStyle=gradient(c,0,0,0,horizon,earth?[[0,'#191c34'],[.35,'#403451'],[.66,'#995c70'],[1,'#e7a17d']]:[[0,'#10182e'],[.6,'#2c3155'],[1,'#654678']]);c.fillRect(0,0,w,h);
   const rand=seededRandom(8215);for(let i=0;i<75;i++){const x=rand()*w,y=70+rand()*Math.max(60,horizon-120);ellipse(c,x,y,i%13===0?1.5:.8,i%13===0?1.5:.8,'#fff0ce70');}
   const sx=w*.76,sy=Math.max(150,horizon-210),radius=w<700?48:70;
   ellipse(c,sx,sy,radius+20,radius+20,earth?'#ffcd9710':'#b998ed10');
   ellipse(c,sx,sy,radius,radius,gradient(c,0,sy-radius,0,sy+radius,[[0,earth?'#ffe8af':'#cdb3ef'],[1,earth?'#f18e85':'#807dd0']]));
   if(earth){c.fillStyle='#7d587340';for(let i=0;i<4;i++)c.fillRect(sx-radius,sy+12+i*12,radius*2,2+i);}
   else {c.save();c.translate(sx,sy);c.rotate(-.3);c.beginPath();c.ellipse(0,0,radius*1.6,radius*.32,0,0,TAU);c.strokeStyle='#b5ccef80';c.lineWidth=5;c.stroke();c.restore();}
   // Soft Alpine silhouette gives the Zürich horizon a place and a sense of depth.
   if(earth){c.beginPath();c.moveTo(0,horizon);for(let x=-60;x<w+100;x+=80)c.lineTo(x,horizon-90-rand()*65);c.lineTo(w,horizon);c.closePath();c.fillStyle='#56475f';c.fill();}
  });
  const layers=[0,1,2].map(layer=>this.surface(w+240,210,c=>{
   const rand=seededRandom(48+layer),step=layer===2?66:93;
   for(let x=0;x<w+240;x+=step){const height=35+rand()*(75+layer*18),y=210-height,color=['#4e425b','#37364e','#292c40'][layer];
    box(c,x,y,step-8,height,color,2);box(c,x+8,y-5,step-24,6,color,1);
    if(layer===2){for(let wy=y+13;wy<204;wy+=18)for(let wx=x+10;wx<x+step-14;wx+=16)if(rand()>.3)box(c,wx,wy,5,7,rand()>.6?'#f8c79499':'#87939c66',1);}
   }
  }));
  this.background={zone,sky,layers};
 }
 skyline(r) {
  if(this.background?.zone!==r.zone)this.makeBackground(r.zone);
  const c=this.ctx,b=this.background;c.drawImage(b.sky,0,0,this.w,this.h);
  if(r.zone<2) b.layers.forEach((layer,i)=>{const width=this.w+240,offset=(r.d*(.16+i*.18))%width,y=this.baseGround-210+i*15;c.drawImage(layer,-offset,y,width,210);c.drawImage(layer,width-offset,y,width,210);});
  if(r.d>=1800){const x=this.w*.17,y=Math.max(165,this.baseGround-230);this.ring(x,y,37,C.purple,2);this.ring(x,y,31,C.orange,3);ellipse(c,x,y,27,27,'#0d1124');line(c,[[x-53,y+8],[x+53,y-8]],'#f6b68380',3);}
 }
 building(r) {
  if(r.d>300)return;
  const x=this.screen(0,0)[0],b=buildingLayout(x,this.ground,this.scale),c=this.ctx;
  const {left,roof,width,height,ground}=b;
  this.rect(left+7,roof+4,width,height-4,'#15172555',4);
  this.rect(left,roof,width,height,gradient(c,left,roof,left+width,ground,[[0,'#d9c6b6'],[1,'#ad9ba0']]),2);
  this.rect(left+width*.73,roof,width*.27,height,'#a38f94');
  this.rect(left-5,roof-4,width+10,7,C.cream,2);
  this.rect(left+width*.06,roof+height*.075,width*.88,height*.21,'#2a3044',3);
  this.text('∞',left+width*.14,roof+height*.083,C.mint,Math.max(16,this.scale*6));
  this.text('DFINITY',left+width*.33,roof+height*.117,C.cream,Math.max(11,this.scale*4));
  for(const win of b.windows){this.rect(win.x-1,win.y-1,win.w+2,win.h+3,'#8f8991',1);this.rect(win.x,win.y,win.w,win.h,'#364458',1);this.rect(win.x+2,win.y+2,win.w*.3,win.h-3,'#a3c4c5');this.rect(win.x,win.y+win.h-2,win.w,2,'#f5d3a3');}
  this.rect(left+width*.43,roof+height*.9,width*.18,height*.1,'#485061');
  this.rect(left-8,ground-5,width+16,5,'#ddd1c2',1);
  line(c,[[x+16,roof-4],[x+16,roof-45]],'#e1ceba',2);
  c.beginPath();c.moveTo(x+17,roof-44);c.quadraticCurveTo(x+32,roof-50,x+48,roof-42);c.lineTo(x+48,roof-25);c.quadraticCurveTo(x+34,roof-33,x+17,roof-27);c.closePath();c.fillStyle=C.red;c.fill();
  this.text('∞',x+25,roof-45,C.cream,18);
 }
 terrain(r) {
  const g=this.ground,c=this.ctx;
  // Façade ends at the sidewalk, road begins below it; no window can cross this seam.
  this.building(r);
  if(g<this.h){this.rect(0,g,this.w,this.h-g,'#232535');this.rect(0,g,this.w,3,r.zone<2?'#e6b596':ZONES[r.zone].color);this.rect(0,g+3,this.w,8,'#4b4856');this.rect(0,g+11,this.w,1,'#191c2b');
   const off=(r.d*this.scale)%110;for(let x=-110;x<this.w+110;x+=110)this.rect(x-off,g+33,48,3,'#8c819077',1);
  }
  const start=Math.floor((r.d-120)/100)*100;
  for(let d=start;d<r.d+600;d+=100){if(d<0)continue;const [x,y]=this.screen(d,0);line(c,[[x,y+1],[x,y+10]],'#b1a0a3',1);this.text(`${d}m`,x+5,y+13,'#d0bec2',10);}
 }
 pickup(o,r) {
  if(r.hits.has(o.id))return;
  const [x,y]=this.screen(o.d,o.y);if(x<-35||x>this.w+35||y<-35||y>this.h+30)return;
  const c=this.ctx,s=this.w<700?.85:1;c.save();c.translate(x,y);c.scale(s,s);
  if(o.kind==='cycle') {ellipse(c,0,0,9,10,'#6e453f');ellipse(c,0,-1,7.4,8.5,C.gold);this.ring(0,-1,5,'#e8a968',1);line(c,[[0,-5],[0,3]],'#986543',1.5);ellipse(c,-3,-5,1.5,1,'#fff4c5');}
  else if(o.kind==='hazard') {const armor=(o.hp||1)-(r.wallDamage.get(o.id)||0)>1;this.rect(-10,-15,20,30,'#3c293d',4);this.rect(-8,-13,16,26,armor?C.orange:C.red,3);for(let i=0;i<4;i++)line(c,[[-7,-8+i*6],[7,-8+i*6]],'#85495a',1);line(c,[[-1,-12],[-3,-4],[3,0],[-2,10]],C.ink,2);}
  else if(o.kind==='mine') {this.ring(0,0,15,'#fa655c35',2);for(let i=0;i<8;i++){const a=i*TAU/8;line(c,[[Math.cos(a)*7,Math.sin(a)*7],[Math.cos(a)*12,Math.sin(a)*12]],'#d37084',3);}ellipse(c,0,0,8,8,'#49283f');ellipse(c,0,0,4,4,C.red);ellipse(c,-1,-1,1.5,1.5,'#ffce9a');}
  else if(o.kind==='pad') {this.rect(-15,0,30,6,'#355c56',3);this.rect(-12,-3,24,4,C.mint,2);}
  else if(o.kind==='coffee') {this.rect(-8,-9,16,19,C.cream,3);this.rect(-8,-2,16,10,'#b77569',2);this.ring(10,-2,5,C.cream,2);line(c,[[-3,-15],[-1,-18]],'#fff3da88',1.5);line(c,[[3,-13],[5,-17]],'#fff3da88',1.5);}
  else if(o.kind==='canister') {this.rect(-10,-13,20,26,'#447e91',4);this.rect(-8,-11,16,8,C.cyan,2);this.rect(-8,1,16,9,C.cyan,2);ellipse(c,4,-7,1.6,1.6,C.cream);ellipse(c,4,5,1.6,1.6,C.cream);}
  else if(o.kind==='identity') {this.ring(-2,-5,7,C.mint,3);line(c,[[-2,2],[-2,14],[3,14],[-2,10],[3,10]],C.mint,3);}
  else if(o.kind==='oisy') {c.beginPath();c.arc(0,-2,9,0,Math.PI);c.lineTo(-9,-10);c.strokeStyle=C.purple;c.lineWidth=5;c.stroke();line(c,[[9,-2],[9,-10]],C.purple,5);line(c,[[-9,-10],[-9,-6]],C.cream,5);line(c,[[9,-10],[9,-6]],C.cream,5);}
  else {const color=o.kind==='fusion'?C.orange:C.cyan;if(['portal','fusion','neuron'].includes(o.kind))this.ring(0,0,16,color,2);c.beginPath();c.moveTo(0,-12);c.lineTo(9,0);c.lineTo(0,12);c.lineTo(-9,0);c.closePath();c.fillStyle=color;c.fill();line(c,[[0,-8],[0,7]],C.cream,2);}
  if(this.target?.id===o.id){line(c,[[-16,-9],[-16,-18],[-7,-18]],C.cream,1.5);line(c,[[16,9],[16,18],[7,18]],C.cream,1.5);}
  c.restore();
 }
 update(r,dt) {
  this.run=r;this.time+=dt;this.ensureWorld(r.d);this.scale=this.h<520?2.2:this.w<700?2.5:3.4;this.bx=this.w*(r.phase==='ready'||r.phase==='charging'?.46:.24);
  const short=this.h<520;this.baseGround=this.h-(short?126:this.w<700?184:188);
  const follow=Math.max(START_HEIGHT,Math.min(92,(this.baseGround-(short?125:230))/this.scale-38));this.ground=this.baseGround+Math.max(0,r.y-follow)*this.scale;
  this.skyline(r);this.terrain(r);for(const o of this.objects)this.pickup(o,r);
  const c=this.ctx;
  if(r.phase==='charging'||r.phase==='ready') {const v=launchVelocity(r.phase==='charging'?r.charge:.65,r.angle);for(let i=1;i<24;i++){const t=i*.085,[x,y]=this.screen(v.speed*t,START_HEIGHT+v.vy*t-GRAVITY*t*t/2);ellipse(c,x,y,i%3===0?2.7:1.5,i%3===0?2.7:1.5,i%3===0?C.cream:'#bbecce88');}}
  const g=r.ghost;
  if(g.active&&g.fade>.1){const [x,y]=this.screen(g.d,g.y),size=this.w<700?.6:.78;c.save();c.translate(x,y);c.globalAlpha=g.fade;
   const flame=7+(this.motionReduced?3:Math.sin(this.time*18)*3);ellipse(c,17*size,22*size,7*size,flame*size,'#84deed60');ellipse(c,17*size,20*size,3*size,flame*size,C.cyan);
   c.drawImage(this.art.ghost,-50*size,-45*size,100*size,90*size);
   for(let i=0;i<g.hp;i++)this.rect(-10+i*12,-37*size,8,3,C.pink,1.5);
   if(g.phase==='warning'){this.ring(-27*size,10*size,5+g.time*8,C.pink,1.5);this.text('!',-43*size,-12*size,C.gold,17);}
   if(this.target?.kind==='ghost')this.ring(0,-1,38*size,'#fff3da65',1);
   c.restore();
  }
  for(const p of r.projectiles){const [x,y]=this.screen(p.d,p.y);const a=Math.atan2(-p.vy,p.vd);line(c,[[x-Math.cos(a)*15,y-Math.sin(a)*15],[x,y]],C.cyan,4);ellipse(c,x,y,3,3,C.cream);}
  for(const p of g.shots){const [x,y]=this.screen(p.d,p.y);ellipse(c,x,y,9,9,'#f1a0d230');ellipse(c,x,y,4,4,C.pink);ellipse(c,x,y,2,2,C.cream);}
  const [bx,physicsY]=this.screen(r.d,r.y),by=Math.min(physicsY,this.ground-11),size=this.w<700?.6:.78;
  if(r.phase==='flying'&&dt>0){this.trail.push({d:r.d,y:r.y});if(this.trail.length>22)this.trail.shift();}
  if(this.trail.length>1){c.beginPath();this.trail.forEach((p,i)=>{const [x,y]=this.screen(p.d,p.y);i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle=r.flow.active>0?'#ffdb8880':r.boostTime>0?'#99e6c180':'#d6c4e330';c.lineWidth=r.boostTime>0?4:1.5;c.stroke();}
  if(r.y<16){const [x,y]=this.screen(r.d,0);ellipse(c,x,y-1,18,3,'#12152250');}
  if(r.shield)this.ring(bx,by,29*size,C.mint,1.5);if(r.magnetTime>0)this.ring(bx,by,35*size,'#a799ed90',1.5);
  c.save();c.translate(bx,by);c.rotate(r.phase==='flying'?clamp(-Math.atan2(r.vy,r.speed||1)*.35,-.35,.35):0);
  if(r.boostTime>0||r.flow.active>0){ellipse(c,-32*size,0,22*size,6*size,'#fa655c60');ellipse(c,-28*size,0,16*size,4*size,C.gold);}
  if(r.phase==='flying'){const wing=this.motionReduced?6:6+Math.sin(this.time*65)*4;ellipse(c,-4,-9,13,wing,'#fff3da55',-.2);}
  if(!r.hitTime||Math.floor(r.hitTime*20)%2===0)c.drawImage(this.art.bug,-40*size,-30*size,80*size,60*size);c.restore();
  for(const p of this.particles){p.life-=dt;p.d+=p.vd*dt;p.y+=p.vy*dt;p.vy-=20*dt;const [x,y]=this.screen(p.d,p.y);ellipse(c,x,y,2,2,p.color);}this.particles=this.particles.filter(p=>p.life>0);
  for(const p of this.labels){p.life-=dt;p.y+=9*dt;const [x,y]=this.screen(p.d,p.y);this.text(p.text,x,y,p.color,12,'center');}this.labels=this.labels.filter(p=>p.life>0);
  if(r.phase==='flying'&&!short){this.text(ZONES[r.zone].name.toUpperCase(),this.w-22,145,ZONES[r.zone].color,this.w<700?10:12,'right');if(r.flow.active>0)this.text('OVERDRIVE',bx,by-39,C.gold,12,'center');}
  this.flash=Math.max(0,this.flash-dt);if(this.flash>0&&!this.motionReduced){c.globalAlpha=.09;this.rect(0,0,this.w,this.h,C.red);c.globalAlpha=1;}
 }
 stats() { return {renderer:'Canvas2D',width:this.w,height:this.h,pixelRatio:this.dpr,objects:this.objects.length,chunks:this.chunks.size,particles:this.particles.length}; }
}
