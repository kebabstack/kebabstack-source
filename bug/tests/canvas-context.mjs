import assert from 'node:assert/strict';
// Validate Canvas geometry without depending on a browser or graphics driver.
export function context(onDraw=()=>{}) {
 const gradient={addColorStop(){}};
 return new Proxy({}, {get(target,name){
  if(name in target)return target[name];
  if(name==='createLinearGradient'||name==='createRadialGradient')return ()=>gradient;
  if(name==='measureText')return text=>({width:String(text).length*8});
  return (...args)=>{for(const value of args)if(typeof value==='number')assert.ok(Number.isFinite(value),`${String(name)} received ${value}`);onDraw(name,args);};
 }});
}
