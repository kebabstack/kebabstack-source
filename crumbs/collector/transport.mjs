import {AsyncLocalStorage} from 'node:async_hooks';
const calls=new AsyncLocalStorage();
/** One deadline spans agent retries, subnet discovery and update polling. */
export function deadlineActor(actor,timeoutMs=15000){
 return new Proxy(actor,{get(target,method){
  if(typeof target[method]!=='function')return target[method];
  return (...args)=>{
   const controller=new AbortController();let timer;
   const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=Object.assign(new Error('Backend request deadline exceeded'),{status:503});controller.abort(error);reject(error);},timeoutMs);});
   const work=calls.run(controller.signal,async()=>target[method](...args));
   return Promise.race([work,expired]).finally(()=>clearTimeout(timer));
  };
 }});
}
export async function rpcFetch(url,options={}){
 const signal=calls.getStore()??AbortSignal.timeout(10000);
 signal.throwIfAborted();
 return fetch(url,{...options,signal:options.signal?AbortSignal.any([signal,options.signal]):signal});
}
