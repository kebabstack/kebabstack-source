import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createBulk,rowFromReading} from '../dist/bulk.js';
const reading = (serial='ABC1234') => ({ok:true,reads:[{kind:'serial',value:'CN-123456789',confidence:.9},{kind:'service_tag',value:serial,confidence:.95}],vendor:'Dell',model:'Monitor',kind:'monitor'});
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
function fixture(overrides={}) {
 const dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.querySelector('#root'),calls=[];
 const api={registerOptions:async()=>[{locations:[],nextTag:'001'}],intakeRead:async()=>reading(),intakeMatch:async()=>[],registerDevice:async(t,r)=>{calls.push(r);return {ok:true,assetId:BigInt(calls.length),tag:String(calls.length)}} ,...overrides};
 const previous=URL.createObjectURL,previousRevoke=URL.revokeObjectURL; URL.createObjectURL=()=> 'blob:test'; URL.revokeObjectURL=()=>{};
 let review;
 const bulk=createBulk({root,api:()=>api,token:()=> 'local-test',shrink:async()=>({bytes:new Uint8Array([1,2,3]),mime:'image/png',url:'blob:small'}),review:r=>{review=r;},...overrides.options});bulk.show();
 const q=s=>root.querySelector(s),click=s=>q(s).click();
 async function add(n=1){Object.defineProperty(q('#bulkFiles'),'files',{value:Array.from({length:n},(_,i)=>({name:`photo-${i}.png`}))});q('#bulkFiles').dispatchEvent(new dom.window.Event('change'));await settle();}
 return {root,api,calls,bulk,q,click,add,review:()=>review,change(s,v){const e=q(s);e.value=v;e.dispatchEvent(new dom.window.Event('input'));},close(){URL.createObjectURL=previous;URL.revokeObjectURL=previousRevoke;dom.window.close();}};
}
test('Dell Service Tag takes precedence; no readable codes are not confident',()=>{assert.equal(rowFromReading(reading()).serial,'ABC1234');assert.match(rowFromReading(reading()).note,/CN-123456789/);assert.equal(rowFromReading({reads:[]}).confidence,0);});
test('batch preserves corrected drafts on navigation, attaches photos, and does not repeat successful writes',async()=>{
 let n=0;const f=fixture({intakeRead:async()=>reading(`TAG000${++n}`)});
 try{await f.add(2);f.click('[data-read]');await settle();assert.equal(f.root.querySelectorAll('tbody tr').length,2);
 f.change('[data-f="serial"]','FIXED01');f.bulk.show();assert.equal(f.q('[data-f="serial"]').value,'FIXED01');
 f.click('[data-review="0"]');f.review().onSave({...f.review().values,serial:'FIXED02',tag:'FOREIGN-99'});assert.equal(f.q('[data-f="serial"]').value,'FIXED02');
 let attempts=0;f.api.registerDevice=async(t,r)=>{f.calls.push(r);return ++attempts===2?{ok:false,detail:'Try again'}:{ok:true,assetId:BigInt(attempts),tag:String(attempts)}};
 f.click('[data-import]');await settle();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0].photo,[[1,2,3]]);assert.equal(f.calls[0].create.serial,'FIXED02');assert.equal(f.calls[0].create.tag,'');assert.equal(f.q('[data-f="tag"]'),null);
 f.click('[data-review]');assert.equal(f.root.querySelectorAll('tr.saved').length,1);f.click('[data-import]');await settle();assert.equal(f.calls.length,3);assert.match(f.root.textContent,/2 devices registered/);
 }finally{f.close();}
});
test('AI configuration failure keeps photos; permanent read failure is not retried or silently registered',async()=>{
 let ready=false,reads=0;const f=fixture({options:{ensureAi:async()=>({ok:ready,detail:'AI unavailable'})},intakeRead:async()=>{reads++;return {ok:false,detail:'Check the key',retryable:[false]}}});
 try{await f.add();f.click('[data-read]');await settle();assert.equal(reads,0);assert.match(f.root.textContent,/AI unavailable/);ready=true;f.click('[data-read]');await settle();assert.equal(reads,1);assert.match(f.root.textContent,/Check the key/);f.click('[data-import]');await settle();assert.equal(f.calls.length,0);assert.match(f.root.textContent,/Enter the serial/);}finally{f.close();}
});
test('retry proposes new data without overwriting manual corrections until accepted',async()=>{
 const f=fixture();try{await f.add();f.click('[data-read]');await settle();f.change('[data-f="serial"]','MANUAL');f.click('[data-retry="0"]');await settle();assert.equal(f.q('[data-f="serial"]').value,'MANUAL');assert.equal(f.review().values.serial,'ABC1234');f.review().onSave({...f.review().values,serial:'APPROVED'});assert.equal(f.q('[data-f="serial"]').value,'APPROVED');}finally{f.close();}
});

test('clearing a previously chosen recipient never assigns devices to that person',async()=>{
 const f=fixture();try{await f.add();f.click('[data-read]');await settle();
 f.q('#bulkTo').dataset.email='old@example.test';f.q('#bulkTo').value='Old recipient';
 f.click('[data-review="0"]');f.review().onSave(f.review().values);
 f.q('#bulkTo').dataset.email='';f.change('#bulkTo','');
 f.click('[data-review="0"]');f.review().onSave(f.review().values);
 assert.equal(f.q('#bulkTo').value,'');f.click('[data-import]');await settle();assert.equal(f.calls[0].assignee,'');
 }finally{f.close();}
});
test('unresolved recipient text blocks registration until selected or cleared',async()=>{
 const f=fixture();try{await f.add();f.click('[data-read]');await settle();f.change('#bulkTo','Unknown person');f.click('[data-import]');await settle();assert.equal(f.calls.length,0);assert.match(f.root.textContent,/Pick the person/);f.change('#bulkTo','');f.click('[data-import]');await settle();assert.equal(f.calls.length,1);}finally{f.close();}
});
