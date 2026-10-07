import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const intake=app.slice(app.indexOf('// ---------- intake ----------'),app.indexOf('let registerOptions = null;'));
const result={ok:true,retryable:[false],detail:'',reads:[{kind:'serial',value:'TEST-123',confidence:1}],vendor:'Example',model:'Laptop',kind:'laptop',sticker:'current',notes:''};
const tick=()=>new Promise(r=>setTimeout(r,10));
function fixture(read){
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://assets.test/#/intake',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.Element.prototype.scrollIntoView=()=>{};w.URL.revokeObjectURL=()=>{};
 w.setTimeout=(fn,ms)=>setTimeout(fn,ms===1200?0:ms);w.clearTimeout=clearTimeout;
 w.eval(`var $=id=>document.getElementById(id),me={aiOn:true},session={load:()=>"fixture-token"},STATUS_WORD={};
 var backend,shrink=async()=>({bytes:new Uint8Array([1,2,3]),mime:"image/jpeg",url:"blob:fixture"});
 function setStatus(id,cls,text){$(id).textContent=text}function esc(s){return String(s)}function toRowFor(){}function ikStep2(){}function deviceName(){return "Device"}function loadRegisterOptions(){}var intakeLabels={close(){}};
 `+intake+";window.draftPhoto=()=>ik.photo;");
 const calls=[];w.backend={intakeRead:async(...args)=>{calls.push(args);return read(calls.length)},intakeMatch:async()=>[]};
 w.eval('ikReset()');return{w,dom,calls,el:id=>w.document.getElementById(id)};
}
test('503 recovers with one bounded retry of the same photo and no device creation',async()=>{
 const f=fixture(n=>n===1?{ok:false,detail:'Unavailable',retryable:[true]}:result);
 try{await f.w.ikPhoto({});assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.el('nSerial').value,'TEST-123');assert.equal(f.el('readRecovery').classList.contains('hidden'),true);assert.equal(f.w.draftPhoto().url,'blob:fixture');}finally{f.dom.window.close()}
});
test('persistent outage keeps photo and enables explicit retry or manual entry',async()=>{
 const f=fixture(()=>({ok:false,detail:'Service unavailable (HTTP 503)',retryable:[true]}));
 try{await f.w.ikPhoto({});assert.equal(f.calls.length,2);assert.equal(f.el('ikRetryRead').disabled,false);assert.match(f.el('readStatus').textContent,/photo is kept/);f.el('ikManual').click();assert.equal(f.el('ikNewCard').classList.contains('hidden'),false);assert.equal(f.w.draftPhoto().url,'blob:fixture');assert.equal(f.calls.length,2);f.el('nSerial').value='MANUAL';f.w.backend.intakeRead=async()=>result;await f.w.ikReadPhoto();assert.equal(f.el('nSerial').value,'MANUAL');}finally{f.dom.window.close()}
});
test('late photo-reading results never overwrite manual entry, restart or another session',async()=>{
 for(const action of ['manual','restart','session']){let finish;const f=fixture(()=>new Promise(r=>finish=r));
 try{const pending=f.w.ikPhoto({});await tick();assert.equal(f.el('ikRetryRead').disabled,true);await f.w.ikReadPhoto();assert.equal(f.calls.length,1,'double click is suppressed');if(action==='manual'){f.el('ikManual').click();f.el('nSerial').value='MANUAL';}if(action==='restart')f.w.ikReset();if(action==='session')f.w.session.load=()=> 'another-user';finish(result);await pending;assert.equal(f.el('nSerial').value,action==='manual'?'MANUAL':'');}finally{f.dom.window.close()}}
});
test('authentication/configuration failures and ambiguous transport failure are not automatically retried',async()=>{
 for(const response of ['auth','network','old-backend']){const f=fixture(()=>{if(response==='network')throw Error('raw private gateway error');return {ok:false,detail:response==='auth'?'Access denied':'the AI vendor answered 503: secret-body',retryable:[false]}});
 try{await f.w.ikPhoto({});assert.equal(f.calls.length,1);assert.doesNotMatch(f.el('readStatus').textContent,/secret-body|private gateway/);assert.equal(f.el('ikRetryRead').disabled,false);}finally{f.dom.window.close()}}
});
test('stale device search cannot replace a newer result or manual form',async()=>{
 const f=fixture(()=>result);try{let finish;f.w.backend.intakeMatch=()=>new Promise(r=>finish=r);const p=f.w.ikSearch(['OLD']);f.el('ikNew').click();finish([]);await p;assert.doesNotMatch(f.el('cands').textContent,/OLD/);assert.equal(f.el('ikNewCard').classList.contains('hidden'),false);}finally{f.dom.window.close()}
});
