import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../dist/operations.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
const desk={active:18,unassigned:3,breached:2,departureReview:1,offboarding:2,lifecycleUnverified:0};
function fixture(api){
 const dom=new JSDOM('<main></main>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://hub.test/#/operations'});
 const w=dom.window;w.eval(code);const root=w.document.querySelector('main');const ui=w.KebabOperations.create(root,()=>api);
 return {w,root,ui,close(){ui.destroy();w.close();}};
}
const source=(app='desk',cid=1n)=>({cid,app,name:'Team '+app,url:'https://'+app+'.test/?discard=secret'});
const result=(metrics=desk,at=Date.now())=>({schema:1n,state:{ready:null},checkedAt:BigInt(at)*1000000n,metrics:Object.entries(metrics).map(([k,v])=>[k,BigInt(v)])});
test('real totals, actionable links, escaped labels and no personal-data inputs',async()=>{
 const f=fixture({operationsSources:async()=>[{...source(),name:'Desk <img src=x onerror=bad()> '},source('trust',2n)],operationsSnapshot:async id=>id===1n?result():result({total:4,passing:0,attention:0,unverified:4,assessed:0,score:0})});
 try{await f.ui.start();assert.equal(f.root.querySelector('img'),null);assert.match(f.root.textContent,/18open requests/);assert.match(f.root.textContent,/—average verified score/);assert.match(f.root.textContent,/0 of 4 real devices fully assessed/);assert.match(f.root.textContent,/2 of 2 connected sources checked/);assert.equal(f.root.querySelector('a.ops-action').href,'https://desk.test/#/queue');assert.equal(f.root.querySelectorAll('[data-source]').length,2);}finally{f.close();}
});
test('failure, denial, expired and malformed snapshots never appear as healthy zero',async()=>{
 for(const fail of [async()=>{throw Error('offline')},async()=>({schema:1n,state:{denied:null}}),async()=>result(desk,Date.now()-100000),async()=>result({active:999}),async()=>({...result(),schema:2n})]){
  const f=fixture({operationsSources:async()=>[source()],operationsSnapshot:fail});try{await f.ui.start();assert.equal(f.root.dataset.complete,'false');assert.doesNotMatch(f.root.textContent,/0open requests|18open requests|No follow-up flags/);assert.equal(f.root.querySelectorAll('.ops-action').length,0);assert.match(f.root.textContent,/—/);}finally{f.close();}
 }
});
test('independent sources load while one waits; refresh cannot overlap; stopped view ignores late results',async()=>{
 let finish,calls=0;const pending=new Promise(r=>finish=r);
 const f=fixture({operationsSources:async()=>[source(),source('desk',2n)],operationsSnapshot:async id=>{calls++;return id===1n?pending:result();}});
 try{const first=f.ui.start();await tick();await f.ui.refresh();assert.equal(calls,2);assert.match(f.root.textContent,/1 of 2 connected sources checked/);assert.match(f.root.textContent,/18open requests/);f.ui.stop();finish(result());await first;assert.equal(f.root.querySelectorAll('[data-source]').length,0);}finally{f.close();}
});
test('access inventory failure and revocation clear previous totals',async()=>{
 let mode=0;const f=fixture({operationsSources:async()=>{if(mode===1)throw Error('revoked');return mode===2?[]:[source()];},operationsSnapshot:async()=>result()});
 try{await f.ui.start();mode=1;await f.ui.refresh();assert.doesNotMatch(f.root.textContent,/18open requests/);assert.match(f.root.textContent,/could not confirm your access/);mode=2;await f.ui.refresh();assert.match(f.root.textContent,/Connect your working stack/);assert.equal(f.root.querySelectorAll('[data-source]').length,0);}finally{f.close();}
});
test('unsafe destinations are never links; hiding a tab clears snapshots',async()=>{
 const f=fixture({operationsSources:async()=>[{...source(),url:'javascript:alert(1)'}],operationsSnapshot:async()=>result()});
 try{await f.ui.start();assert.equal(f.root.querySelector('.ops-open'),null);assert.equal(f.root.querySelector('a.ops-action'),null);Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});f.w.document.dispatchEvent(new f.w.Event('visibilitychange'));assert.doesNotMatch(f.root.textContent,/18open requests/);}finally{f.close();}
});

test('a partial outage stays unverified even when the responding source has no flags',async()=>{
 const f=fixture({operationsSources:async()=>[source(),source('desk',2n)],operationsSnapshot:async id=>{if(id===2n)throw Error('offline');return result(Object.fromEntries(Object.keys(desk).map(k=>[k,0])));}});
 try{await f.ui.start();assert.equal(f.root.dataset.complete,'false');assert.match(f.root.textContent,/Other sources are still unverified/);assert.match(f.root.textContent,/Source unavailable/);}finally{f.close();}
});
