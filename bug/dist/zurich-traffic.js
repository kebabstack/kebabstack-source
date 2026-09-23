// A closed, rounded city block. Cars use disjoint lanes and fixed spacing;
// the clock is supplied by the view so pausing freezes the entire street.
export const TRAFFIC_COUNT = 10;
export function trafficPose(time, index) {
  const inner = index >= 6, minX = inner ? -23 : -27, maxX = inner ? 23 : 27;
  const minZ = inner ? -94 : -98, maxZ = inner ? 44 : 48, r = 7;
  const w = maxX - minX - 2*r, h = maxZ - minZ - 2*r, arc = Math.PI*r/2;
  const length = 2*w + 2*h + 4*arc, count = inner ? 4 : 6;
  const speed = inner ? 5.4 : -6.2;
  let d = ((time*speed + (inner ? index-6 : index)*length/count) % length + length) % length;
  const pieces = [w,arc,h,arc,w,arc,h,arc];
  let section = 0;
  while (section < 7 && d >= pieces[section]) d -= pieces[section++];
  let x,z,dx,dz;
  if(section===0) {x=minX+r+d;z=minZ;dx=1;dz=0;}
  else if(section===2) {x=maxX;z=minZ+r+d;dx=0;dz=1;}
  else if(section===4) {x=maxX-r-d;z=maxZ;dx=-1;dz=0;}
  else if(section===6) {x=minX;z=maxZ-r-d;dx=0;dz=-1;}
  else {
    const corner=(section-1)/2, a=-Math.PI/2+corner*Math.PI/2+d/r;
    const cx=corner<2?maxX-r:minX+r, cz=corner===0||corner===3?minZ+r:maxZ-r;
    x=cx+r*Math.cos(a);z=cz+r*Math.sin(a);dx=-Math.sin(a);dz=Math.cos(a);
  }
  if(speed<0) {dx=-dx;dz=-dz;}
  return {x,z,yaw:Math.atan2(dx,dz)};
}
