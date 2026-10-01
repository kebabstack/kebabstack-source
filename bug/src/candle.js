// Shared by the 3D model and collision checks. Half extents, in flight metres.
export const CANDLE_BODY = Object.freeze({x:1.6,y:2.8,d:1.6});
export const CANDLE_WICK = Object.freeze({x:.18,y:4.6,d:.18});
export const isRedCandle = obj => obj.kind === 'hazard' || (obj.kind === 'mine' && obj.airborne === true);

// Swept segment against the visible body/wick, expanded by the bug/pulse margin.
// A thin wick must not inherit a mine's wide, invisible collision hull.
export function candleHit(a, b, center, margin) {
  return [CANDLE_BODY,CANDLE_WICK].some(extent => {
    let enter=0,leave=1;
    for(const axis of ['x','y','d']) {
      const start=a[axis]-center[axis],delta=b[axis]-a[axis],reach=extent[axis]+margin;
      if(Math.abs(delta)<1e-10){if(Math.abs(start)>reach)return false;continue;}
      const t1=(-reach-start)/delta,t2=(reach-start)/delta;
      enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));
      if(enter>leave)return false;
    }
    return true;
  });
}
