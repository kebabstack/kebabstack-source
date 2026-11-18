// Parallax artwork is rasterized when the viewport or chapter changes. Coordinates
// are CSS pixels on the game's two-pixel grid; playfield geometry stays in metres.
const TAU = Math.PI * 2;
const palettes = [
  ['#10152f','#333465','#a85882','#ffb779'], ['#111634','#342956','#c05f8d','#ffa879'],
  ['#10162f','#222650','#564385','#9f86bd'], ['#081a32','#144260','#32687c','#8fd6bd'],
  ['#12142e','#2f2c60','#5e467e','#bb92bb'], ['#171332','#3b2857','#7a4777','#d59a96'],
  ['#081c30','#114057','#286b7e','#88c6d3'], ['#1c1433','#493362','#805781','#deb8a0'],
  ['#0e1734','#303665','#69578c','#a9bccf'], ['#100f29','#30215a','#704971','#db849e']
];
function polygon(c, pts, fill) {
  c.beginPath(); pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
  c.closePath(); c.fillStyle=fill; c.fill();
}
function line(c, pts, color, width=2) {
  c.beginPath(); pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
  c.strokeStyle=color; c.lineWidth=width; c.stroke();
}
function circle(c,x,y,r,color) {
  c.beginPath();c.arc(x,y,r,0,TAU);c.fillStyle=color;c.fill();
}
function box(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function glow(c,x,y,r,center,edge) {
  const g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,center);g.addColorStop(1,edge);
  c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}
function sky(c,w,h,horizon,zone,random) {
  const palette=palettes[zone%palettes.length],g=c.createLinearGradient(0,0,0,horizon+30);
  [0,.38,.76,1].forEach((t,i)=>g.addColorStop(t,palette[i]));
  box(c,0,0,w,h,g);
  glow(c,w*.84,horizon*.64,Math.max(130,horizon*.7),zone<2?'#ff93772a':'#7757c448','#7762aa00');
  // High clouds follow the airflow. Their contrast drops toward the flight corridor.
  for(let i=0;i<38;i++){
    const x=random()*w,y=32+random()*horizon*.78,length=18+random()*w*.14;
    polygon(c,[[x,y],[x+length*.7,y-3],[x+length,y-5],[x+length*.79,y-1],[x+3,y+1]],
      y>horizon*.55?'#ffd3ae24':'#a4b5e316');
  }
  for(let i=0;i<w*.15;i++){
    const x=Math.floor(random()*w/2)*2,y=Math.floor(random()*horizon*.9/2)*2;
    const s=i%17===0?3:2;
    box(c,x,y,s,s,i%9===0?'#f5d4beaa':'#d5e5fc66');
    if(i%47===0){box(c,x-3,y+1,8,1,'#d5e5fc66');box(c,x+1,y-3,1,8,'#d5e5fc66');}
  }
}
function planet(c,w,horizon,zone) {
  const near=zone<2,ringed=!near&&zone%3===0,rocky=!near&&zone%3===2;
  const radius=Math.max(32,Math.min(w*(near?.073:.091),horizon*.17,103));
  const x=w*(near?.77:.76),y=Math.max(82,horizon*(near?.63:.47));
  const palette=palettes[zone%palettes.length];
  glow(c,x,y,radius*2.5,near?'#ffaa6b74':'#9075df56','#c49ac900');
  if(ringed){c.save();c.translate(x,y);c.rotate(-.35);c.beginPath();c.ellipse(0,0,radius*1.7,radius*.35,0,Math.PI,TAU);c.strokeStyle='#b8a9ff88';c.lineWidth=7;c.stroke();c.restore();}
  c.save();c.beginPath();c.arc(x,y,radius,0,TAU);c.clip();
  const g=c.createLinearGradient(x-radius,y-radius,x+radius*.8,y+radius);
  g.addColorStop(0,near?'#fff9cd':'#e1f3f5');g.addColorStop(.5,near?'#ffbf78':palette[3]);g.addColorStop(1,near?'#ea636f':palette[1]);
  box(c,x-radius,y-radius,radius*2,radius*2,g);
  for(let i=0;i<9;i++){
    const yy=y+radius*(i/13-.04),s=2+Math.floor(i/3);
    if(near)box(c,x-radius,yy,radius*2,s,'#9c598843');
    else if(ringed){c.beginPath();c.ellipse(x-radius*.17,yy-radius*.3,radius*1.4,radius*.23,-.25,0,TAU);c.strokeStyle=i%3?'#65518c55':'#e2dbd644';c.lineWidth=s;c.stroke();}
  }
  if(rocky){
    for(const [dx,dy,size] of [[-.46,-.16,.15],[-.16,-.43,.09],[.4,.35,.2],[.07,.49,.11],[.68,-.12,.09],[-.34,.35,.06]]){
      circle(c,x+dx*radius,y+dy*radius,size*radius,'#54456f6b');
      circle(c,x+(dx+.024)*radius,y+(dy+.025)*radius,size*radius*.8,'#9c81a970');
    }
    circle(c,x+radius*.87,y+radius*.2,radius*1.07,'#18253caa');
  }else if(!near&&!ringed){
    circle(c,x+radius*.47,y-radius*.28,radius*.99,'#252346');
    circle(c,x+radius*.44,y-radius*.25,radius*.91,'#292749');
  }
  c.restore();
  if(ringed){
    c.save();c.translate(x,y);c.rotate(-.35);
    for(const [scale,stroke] of [[1,'#e2cbd4'],[1.09,'#c7b6ec77']]){
      c.beginPath();c.ellipse(0,0,radius*1.7*scale,radius*.35*scale,0,0,Math.PI);c.strokeStyle=stroke;c.lineWidth=scale===1?4:2;c.stroke();
    }c.restore();
    circle(c,x+radius*1.67,y-radius*.87,Math.max(4,radius*.09),'#c3d7e7');
  }else if(!near){
    const moonRadius=radius*(rocky?.13:.25),mx=x-radius*1.4,my=y-radius*.61;
    circle(c,mx,my,moonRadius,rocky?'#bed2d8':'#ffca83');
    if(!rocky)glow(c,mx,my,moonRadius*2,'#ffba794d','#ffba7900');
  }
}
// A seamless Alpine ridge. Each illuminated face and cleft is attached to its actual peak.
function alps(c,w,h,random,near){
  const color=near?'#343559':'#655179',light=near?'#695772':'#c1949b',shade=near?'#292d50':'#564667';
  const peaks=[[0,h*.76]];for(let x=40;x<w-32;x+=60+random()*69)peaks.push([x,h*(.22+random()*.38)]);
  peaks.push([w,h*.76]);
  polygon(c,[[0,h],...peaks,[w,h]],color);
  for(let i=1;i<peaks.length-1;i++){
    const [x,y]=peaks[i], [next,nY]=peaks[i+1], [prev,pY]=peaks[i-1];if(y>=nY||y>=pY)continue;
    const left=Math.min(42,x-prev),right=Math.min(67,next-x);
    polygon(c,[[x-left*.7,y+24],[x,y],[x+right*.33,y+11],[x+right*.17,y+9],[x+right*.40,y+28],[x+3,y+14],[x-left*.15,y+19],[x-left*.19,y+13]],light);
    polygon(c,[[x,y],[x+right*.53,y+24],[x+right*.95,y+58],[x+right*.4,y+38],[x+right*.44,y+47]],shade);
  }
}
function town(c,w,h,random){
  const water=h-30, back='#3c3e64',front='#242e4b';
  for(let x=0;x<w;){
    const width=15+Math.floor(random()*16),height=13+random()*36,top=water-height;
    box(c,x,top,width,height,back);polygon(c,[[x-1,top],[x+width*.55,top-7],[x+width+1,top]],'#50465d');
    for(let iy=top+6;iy<water-2;iy+=9)for(let ix=x+3;ix<x+width-2;ix+=7)if(random()>.5)box(c,ix,iy,3,3,'#c7a49599');
    x+=width+1;
  }
  const landmark=w*.64;
  for(const offset of [0,20]){
    const x=landmark+offset;box(c,x,water-56,14,56,front);
    box(c,x+1,water-60,12,5,'#5f6577');polygon(c,[[x-1,water-60],[x+2,water-69],[x+7,water-74],[x+12,water-69],[x+15,water-60]],front);
    line(c,[[x+7,water-74],[x+7,water-82]],'#586780',2);
    box(c,x+5,water-50,4,10,'#8a8393');
  }
  for(let i=0;i<10;i++){const x=(i+.3)*w/10,wy=water-8;box(c,x,wy,7,11,front);box(c,x,wy-3,3,3,'#f7d4a6');}
  box(c,0,water,w,31,'#303a57');box(c,0,water,w,2,'#f7bd9e77');
  for(let i=0;i<w*.32;i++){const x=random()*w,y=water+3+random()*26;box(c,x,y,4+random()*20,1,random()>.5?'#91a4b54d':'#f3ab8d4f');}
}
function viaduct(c,w,h) {
  box(c,0,14,w,4,'#8e8092');box(c,0,18,w,9,'#232941');
  for(let x=0;x<w;x+=44){box(c,x,7,2,8,'#32354f');box(c,x+1,25,5,h-25,'#282c47');}
  box(c,0,8,w,2,'#4d5570');
}
// A distant relay changes silhouette as the journey moves from network history
// to delivery missions. Its cool, muted lights are distinct from collectible gold.
function orbitalRelay(c,key) {
  const steel='#425575', plate='#76859b', shade='#263652', glow='#b2d8db';
  const pipe=(a,b,width=4)=>line(c,[a,b],steel,width);
  function panel(x,y,side){
    for(let i=0;i<3;i++){
      const a=x+side*i*18,b=a+side*16;
      polygon(c,[[a,y],[b,y-3],[b-6,y+16],[a-6,y+19]],'#3a5275');
      line(c,[[a,y],[b,y-3],[b-6,y+16]],'#96a8bd',1.5);
      pipe([a-3,y+9],[b-3,y+6],1);
    }
  }
  function module(x,y,w=30){
    polygon(c,[[x-w/2,y-7],[x-w/2+6,y-14],[x+w/2-4,y-14],[x+w/2,y-7],[x+w/2,y+9],[x+w/2-5,y+13],[x-w/2+3,y+13],[x-w/2,y+8]],plate);
    box(c,x-w/2,y+3,w,6,shade);
    for(let xx=x-w/2+5;xx<x+w/2-2;xx+=9){box(c,xx,y-8,5,3,'#c5c8c6');box(c,xx,y+4,3,2,glow);}
  }
  if(key==='nns'){
    const nodes=[[68,94],[118,54],[169,88],[214,47],[185,112]];
    for(const [a,b] of [[0,1],[1,2],[0,2],[2,3],[3,4],[2,4]]){
      pipe(nodes[a],nodes[b],3);line(c,[[nodes[a][0],nodes[a][1]-2],[nodes[b][0],nodes[b][1]-2]],plate,1);
    }
    nodes.forEach(([x,y],i)=>{circle(c,x,y,i===2?13:9,shade);circle(c,x-1,y-2,i===2?9:6,steel);circle(c,x-2,y-3,2,glow);});
  } else if(key==='fusion'||key==='identity'){
    for(const offset of (key==='fusion'?[-31,31]:[0])){
      c.save();c.translate(146+offset,76);c.rotate(-.3+offset/200);
      c.beginPath();c.ellipse(0,0,22,54,0,0,TAU);c.strokeStyle=steel;c.lineWidth=11;c.stroke();
      c.strokeStyle=glow;c.lineWidth=2;c.stroke();c.restore();
    }
    pipe([60,94],[225,70],5);module(95,88,29);module(197,74,20);
    panel(88,94,-1);panel(204,72,1);
  } else if(key==='mainnet'){
    panel(119,83,-1);panel(170,72,1);pipe([83,90],[212,67],5);module(146,75,42);
    pipe([146,63],[135,50],5);polygon(c,[[111,37],[163,44],[145,55],[131,55]],plate);
    pipe([127,42],[141,24],2);circle(c,141,24,3,glow);
  } else if(key==='engines'||key==='canisters'){
    pipe([55,82],[234,82],8);panel(82,76,-1);panel(207,76,1);
    for(let i=0;i<3;i++){const x=105+i*39,y=76+(i%2)*10;
      module(x,y,32);box(c,x-10,y+13,20,8,shade);
      if(key==='engines')polygon(c,[[x-6,y+21],[x+6,y+21],[x,y+36]],'#86d9da83');
      else module(x,y-21,26);
    }
  } else {
    pipe([65,85],[214,65],5);panel(105,74,-1);panel(183,62,1);
    module(140,77,64);module(145,57,34);pipe([144,48],[144,29],3);circle(c,144,28,2,glow);
    if(key==='caffeine')for(let i=0;i<3;i++)line(c,[[153+i*5,46-i*8],[158+i*5,41-i*8],[153+i*5,34-i*8]],'#cda69577',2);
  }
}
export function makePanorama(view,zone,chapter,seededRandom){
  const {w,h,baseGround:horizon}=view,width=720,surface=(a,b,draw)=>view.surface(a,b,draw);
  const skyLayer=surface(w,h,c=>sky(c,w,h,horizon,zone,seededRandom(6243+zone)));
  const celestial=surface(w,h,c=>planet(c,w,horizon,zone));
  const layers=zone>=2?[]:[
    {height:176,offset:28,speed:.035,art:surface(width,176,c=>alps(c,width,176,seededRandom(51),false))},
    {height:113,offset:21,speed:.075,art:surface(width,113,c=>alps(c,width,113,seededRandom(91),true))},
    {height:122,offset:0,speed:.16,art:surface(width,122,c=>town(c,width,122,seededRandom(22)))},
    {height:34,offset:0,speed:.3,art:surface(width,34,c=>viaduct(c,width,34))}
  ];
  const relay=zone<2?null:surface(295,145,c=>orbitalRelay(c,chapter.key));
  return {zone,width,skyLayer,celestial,layers,relay};
}
export function drawPanorama(view,run){
  const {ctx:c,background:b,w,h}=view;c.drawImage(b.skyLayer,0,0,w,h);
  view.space.draw(view,run);c.drawImage(b.celestial,0,0,w,h);
  if(b.relay){
    const size=Math.max(.58,Math.min(1,w/880)),drift=view.motionReduced?0:Math.sin(run.d/430)*26;
    const x=w*(b.zone%2?.23:.48)-70*size-drift,y=view.baseGround-145*size-24;
    c.save();c.globalAlpha=.78;c.drawImage(b.relay,x,y,295*size,145*size);c.restore();
  }
  if(!b.layers.length)return;
  c.save();c.globalAlpha=Math.max(0,Math.min(1,1-(run.d-320)/520));
  for(const l of b.layers){const offset=run.d*view.scale*l.speed%b.width;
    for(let x=-offset;x<w;x+=b.width)c.drawImage(l.art,Math.floor(x/2)*2,view.baseGround-l.height-l.offset,b.width,l.height);
  }c.restore();
}
