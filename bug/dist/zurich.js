import * as T from './vendor/three.module.js';
import { trafficPose, TRAFFIC_COUNT } from './zurich-traffic.js';

// An authored arcade interpretation of Genferstrasse, not a geographic replica.
// Repeated facade details, trees, parking and the complete fleet are instanced.
export function createZurich({V,shape,bar,label,mat,infinity,bake}) {
  const root=new T.Group(), batches=new Map();
  const put=(type,color,x,y,z,sx,sy=sx,sz=sx,rot=0)=>{
    const key=type+'|'+color;if(!batches.has(key))batches.set(key,[]);
    batches.get(key).push({x,y,z,sx,sy,sz,rot});
  };
  const box=(...a)=>put('box',...a);
  box('#435664',0,-.45,-35,230,.7,330);
  // Two narrow parallel streets, a lakeside cross street and the far junction.
  for(const x of [-25,25]) {
    box('#232f43',x,.015,-48,11,.08,300);
    for(const side of [-1,1]) box('#7b8a9a',x+side*6.2,.14,-48,1.8,.3,300);
  }
  for(const z of [-96,-31,46]) {
    box('#232f43',0,.04,z,210,.12,11);
    for(const side of [-1,1]) {
      for(const [x,w] of [[-65,62],[0,36],[66,64]]) box('#7b8a9a',x,.18,z+side*6.2,w,.35,1.8);
    }
    for(let x=-98;x<101;x+=10) if(Math.abs(Math.abs(x)-25)>9)box('#b5bbad',x,.11,z,.9,.025,.13);
    // Swiss yellow crossings, with the lane junction kept clear.
    for(const x of [-25,25]) for(const dz of [-10,10]) for(let s=-3;s<=3;s++)box('#e8bd61',x+s,.12,z+dz,.55,.035,2.7);
  }
  function tree(x,z,size=1) {
    box('#68756a',x,.25,z,3.6,.35,3.6);
    put('cylinder','#625448',x,2,z,.17,4,.17);
    put('sphere','#3e7567',x,4.8,z,1.8*size,2.4*size,1.7*size);
    put('sphere','#548977',x-.65,5.3,z+.2,1.25*size,1.8*size,1.2*size);
    for(const dx of [-1.3,1.3])box('#ab9878',x+dx,1.05,z,.12,2.1,.12);
    box('#ab9878',x,1.65,z,2.8,.12,.12);
  }
  for(const x of [-33,33])for(const z of [-117,-78,-53,-8,14,32,67])tree(x,z,.9);
  // Park and a blue ribbon of lake, visible between blocks.
  box('#3d695f',-80,-.03,-80,35,.2,230);
  box('#276c83',-121,-.05,-70,43,.2,340);
  for(let i=0;i<13;i++) {tree(-74-(i%3)*7,65-i*17,1.15);box('#7b968f',-91,.1,65-i*18,2.6,.12,17);}
  for(let i=0;i<15;i++)box('#63a2b2',-110-(i%3)*9,.075,60-i*22,7,.03,.12);

  function building(x,z,w,d,h,historic=false,color='#a8a7a4') {
    box(color,x,h/2,z,w,h,d);
    box('#414e62',x,h+.25,z,w+.7,.5,d+.7);
    if(historic) {
      box('#6b5260',x,h+1.2,z,w+.2,2,d+.2);
      box('#d1b99c',x,h-1,z,w+.5,.4,d+.5);
    }
    for(let y=3;y<h-1;y+=3.1) {
      for(let wx=-w/2+2;wx<w/2-1;wx+=2.6) {
        box(historic?'#cbb595':'#d1d7d9',x+wx,y,z+d/2+.07,1.7,2.15,.18);
        box((Math.round(wx+y)%5===0)?'#efc28c':'#527287',x+wx,y,z+d/2+.19,1.3,1.72,.1);
        if(historic)box('#a07769',x+wx,y-1.12,z+d/2+.23,2,.16,.4);
      }
      for(let wz=-d/2+2;wz<d/2-1;wz+=2.8)for(const side of [-1,1]) {
        box(historic?'#cfb89b':'#d1d7d9',x+side*(w/2+.06),y,z+wz,.18,2.15,1.8);
        box('#527287',x+side*(w/2+.17),y,z+wz,.1,1.72,1.35);
      }
    }
    if(historic)for(let wx=-w/2+2;wx<w/2;wx+=4)box('#273444',x+wx,2.1,z+d/2+.5,2.8,.25,1.3);
  }
  // DFINITY: graphite bands, bright vertical frames and warm occupied offices.
  box('#343e50',0,10,18,31,20,29);
  box('#bdc6cc',0,1.1,18,31.3,2.2,29.2);
  box('#283544',0,20.15,18,32,.45,30);
  box('#6d7d88',0,20.43,18,30,.16,28);
  for(let f=0;f<5;f++) {
    const y=4+f*3.05;
    for(let j=0;j<13;j++) {
      const x=-13.5+j*2.25;
      box('#dbe0df',x,y,32.57,2.08,2.12,.16);
      box((j+f*3)%7===0?'#f3c897':'#6690a7',x,y,32.68,1.72,1.82,.09);
      box('#dbe0df',x-.38,y,32.76,.07,1.85,.06);
      if((j+f)%6===0)box('#aabcc5',x,y+.55,32.8,1.72,.65,.05);
    }
    for(const side of [-1,1])for(let j=0;j<11;j++) {
      const z=5.1+j*2.55;
      box('#dbe0df',side*15.59,y,z,.18,2.12,2.36);
      box((j+f)%8===0?'#efc58a':'#7c9db2',side*15.72,y,z,.09,1.82,2.04);
      box('#dbe0df',side*15.8,y,z-.6,.06,1.84,.08);
    }
  }
  // Signs sit in the solid band, as on the real facade.
  label(root,'D F I N I T Y',13,4.5,18.13,32.86,{bg:null,fg:'#eef7ff',size:83,height:.14});
  infinity(root,-5.3,18.15,32.89,1.1,true);
  const sideSign=new T.Group();sideSign.position.set(15.85,18.13,17);sideSign.rotation.y=Math.PI/2;root.add(sideSign);
  label(sideSign,'D F I N I T Y',11,0,0,0,{bg:null,size:79,height:.14});
  box('#162b3d',0,1.3,32.9,5,2.6,.2);
  for(const x of [-1.3,1.3])box('#7ea7b5',x,1.25,33.03,2.2,2.3,.1);
  box('#e1e6de',5.3,1.3,34.2,1.6,2.6,.45);
  infinity(root,5.3,1.6,34.48,.33);
  for(const x of [-14.5,14.5])box('#adbac2',x,20.75,18,.35,.75,29);
  box('#adbac2',0,20.75,32.2,29,.75,.35);
  box('#718492',-7,21.1,20,5,1.2,3);
  for(let i=0;i<6;i++)box('#263849',-9+i*.8,21.76,20,.3,.08,2.6);
  bar(root,V(10,20.5,26),V(10,26,26),.07,'#9eafc6');
  shape(root,'sphere',mat('#ff8968',{emissive:'#ff5533',emissiveIntensity:1.8}),10,26,26,.19);
  // Same physical pad and spawn height as the existing game.
  box('#172c42',0,20,-.1,10,.5,9);
  box('#487b81',0,20.29,-.1,9.6,.09,8.6);
  const glow=mat('#9affe4',{emissive:'#4cfed2',emissiveIntensity:1.3});
  for(const x of [-4.6,4.6])shape(root,'box',glow,x,20.38,0,.12,.08,8.4);
  const ring=shape(root,'ring',glow,0,20.39,0,2.3);ring.rotation.x=-Math.PI/2;
  const pad=label(root,'LAUNCH / 01',5.6,0,20.42,2.8,{bg:null,fg:'#d1fff4',size:90});pad.rotation.x=-Math.PI/2;
  for(const x of [-4,4])bar(root,V(x,14,5),V(x,20,-3.4),.16,'#647888');
  // A red sandstone neighbour and its pointed roof recall the real block.
  building(-46, -16, 23,23,23,true,'#b4998f');
  put('cylinder','#c9b3a0',-53,23,-9,2.1,5,2.1);
  put('cone','#52676f',-53,28,-9,2.7,6,2.7);
  building(-45,20,21,27,23,true,'#c4b49b');
  building(53,11,22,25,15,false,'#a4b2b8');
  for(const z of [-58,-125,-159])for(const side of [-1,1])building(side*48,z,25,26,19+(z%3)*-2,true,side<0?'#b6a9a5':'#b69d87');
  box('#384e61',0,.02,-104,35,.05,188);
  for(let z=-17;z>-192;z-=9)box('#62979e',0,.065,z,.12,.02,3);
  // Parking bays and parked cars are offset from the moving lanes.
  const colors=['#d7e1e7','#354d67','#ad6259','#9eaaa8'];
  for(const side of [-1,1])for(let j=0;j<5;j++) {
    const x=side*18.2,z=5+j*5.7;
    box('#b3b9ac',x,.12,z-2.4,4.9,.025,.08);
    box(colors[j%4],x,.7,z,2.1,1,4.1);
    box('#26394e',x,1.4,z-.1,1.8,.7,2.1);
  }
  for(const z of [-69,3,31]) {
    bar(root,V(18,7,z),V(34,7,z),.025,'#526377');
    for(const x of [18,34])put('cylinder','#64738b',x,3.5,z,.09,7,.09);
    shape(root,'box',mat('#ffd9a4',{emissive:'#ffbd77',emissiveIntensity:1.8}),26,6.85,z,1.5,.15,.45);
  }
  const street=label(root,'GENFERSTRASSE',9,32,3.7,41,{bg:'#203e63',fg:'#f1f6fa',size:78,height:.19});street.rotation.y=-.25;
  bake(batches,root);

  const fleet=new T.Group();root.add(fleet);
  const carParts=[
    {color:'#d6e1e9',at:[0,.65,0],size:[1.7,.65,3.6]},
    {color:'#293f59',at:[0,1.2,-.15],size:[1.48,.62,1.85]},
    {color:'#93b3c8',at:[0,1.21,.82],size:[1.35,.45,.06]},
    ...[-.85,.85].flatMap(x=>[-1.12,1.12].map(z=>({color:'#182430',at:[x,.39,z],size:[.18,.55,.55]}))),
    ...[-.55,.55].map(x=>({color:'#ffdfaa',at:[x,.64,1.82],size:[.38,.18,.08],emissive:true})),
    {color:'#ed646c',at:[0,.63,-1.82],size:[1.25,.13,.08],emissive:true},
  ];
  const dummy=new T.Object3D(), meshes=carParts.map(p=>{
    const m=new T.InstancedMesh(new T.BoxGeometry(1,1,1),mat(p.color,p.emissive?{emissive:p.color,emissiveIntensity:1.5}:{}),TRAFFIC_COUNT);
    m.castShadow=!p.emissive;m.receiveShadow=true;m.instanceMatrix.setUsage(T.DynamicDrawUsage);m.frustumCulled=false;fleet.add(m);return m;
  });
  // Different paint colours, with the same shared geometry and draw call.
  for(let i=0;i<TRAFFIC_COUNT;i++)meshes[0].setColorAt(i,new T.Color(colors[i%colors.length]));
  let streetTime=0,lastRendered=-1;
  function update(dt,reduced=false) {
    if(!root.visible)return;
    if(!reduced)streetTime+=dt;
    if(streetTime===lastRendered)return;
    lastRendered=streetTime;
    for(let i=0;i<TRAFFIC_COUNT;i++) {
      const p=trafficPose(streetTime,i),sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
      carParts.forEach((part,j)=>{
        const [x,y,z]=part.at;
        dummy.position.set(p.x+x*cos+z*sin,y,p.z-x*sin+z*cos);
        dummy.rotation.set(0,p.yaw,0);dummy.scale.set(...part.size);dummy.updateMatrix();meshes[j].setMatrixAt(i,dummy.matrix);
      });
    }
    for(const m of meshes)m.instanceMatrix.needsUpdate=true;
  }
  update(0);
  return {root,update,stats:()=>({cars:TRAFFIC_COUNT,streetTime:Math.round(streetTime*10)/10})};
}
