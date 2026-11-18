// Readable at sprite scale, including on platforms without symbol or emoji fonts.
export function drawInsignia(c, key, ink, weight=1.6) {
  c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=weight;c.lineJoin='round';c.lineCap='round';
  const path=(points,close=false)=>{
    c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
    if(close)c.closePath();c.stroke();
  };
  const dot=(x,y,r=1.45)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();};
  switch(key) {
    case 'zurich': path([[-4,-5],[2,-5],[4,-3],[4,5],[-4,5]],true);path([[-2,2],[-2,-1],[2,-1],[2,2]],true);break;
    case 'compiler':case 'motoko': path([[-2,-4],[-5,0],[-2,4]]);path([[2,-4],[5,0],[2,4]]);break;
    case 'nns': path([[-4,-4],[4,-4],[4,4],[-4,4]],true);path([[-2,0],[0,2],[3,-2]]);break;
    case 'neuron': path([[-4,3],[0,-3],[4,3],[-4,3]]);dot(-4,3);dot(0,-3);dot(4,3);break;
    case 'mainnet': path([[-5,0],[-4,-2],[-2,-2],[2,2],[4,2],[5,0],[4,-2],[2,-2],[-2,2],[-4,2]],true);break;
    case 'canister': path([[-4,-3],[0,-5],[4,-3],[4,3],[0,5],[-4,3]],true);path([[-4,-3],[0,-1],[4,-3]]);path([[0,-1],[0,5]]);break;
    case 'fusion': path([[-5,1],[-1,-3],[2,-3],[3,-2],[2,0],[0,2]]);path([[5,-1],[1,3],[-2,3],[-3,2],[-2,0],[0,-2]]);break;
    case 'identity': path([[0,-5],[4,-3],[4,0],[3,3],[0,5],[-3,3],[-4,0],[-4,-3]],true);path([[-2,0],[0,2],[3,-2]]);break;
    case 'oisy': path([[-4,-4],[4,-4],[4,4],[-4,4]],true);path([[4,-1],[1,-1],[1,1],[4,1]]);break;
    case 'magnet': path([[-4,-4],[-4,1],[-2,4],[2,4],[4,1],[4,-4]]);path([[-4,-1],[-4,-4]]);path([[4,-1],[4,-4]]);break;
    case 'caffeine': path([[-5,-4],[5,-4],[5,3],[-2,3],[-4,5],[-4,3],[-5,3]],true);path([[-2,-1],[0,0],[-2,1]]);break;
    case 'coffee': path([[-4,-2],[3,-2],[3,2],[1,4],[-2,4],[-4,2]],true);path([[3,-1],[5,-1],[5,1],[3,2]]);path([[-2,-4],[0,-5]]);break;
    case 'engines': path([[-5,0],[-3,-4],[2,-4],[5,0],[2,4],[-3,4]],true);dot(0,0);break;
    case 'portal': path([[-5,3],[-2,-3],[3,-5],[5,-2],[1,3],[-4,4]],true);dot(1,-1);break;
    case 'canisters': path([[-5,-1],[0,-5],[5,-1],[0,3]],true);path([[-5,2],[0,5],[5,2]]);break;
    default: path([[-5,0],[-3,-3],[0,0],[3,3],[5,0],[3,-3],[0,0],[-3,3]],true);
  }
}
