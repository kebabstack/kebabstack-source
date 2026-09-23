import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
globalThis.__watchRole=process.argv[2]||'admin';
const {calls,controls,row1,row2}=await import('./fixture.js');
const html=fs.readFileSync('index.html','utf8').replace('<script type="module" src="./app.js"></script>','');
const dom=new JSDOM(html,{url:'https://watch.test/#uht='+'ab'.repeat(20),runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom;
for(const k of ['window','document','location','history','localStorage'])globalThis[k]=k==='window'?window:window[k];
globalThis.setInterval=()=>0;window.scrollTo=()=>{};globalThis.confirm=()=>true;globalThis.URL=window.URL;URL.createObjectURL=()=> 'blob:smoke';URL.revokeObjectURL=()=>{};
Object.defineProperty(globalThis,'navigator',{value:{clipboard:{writeText:async()=>{}}},configurable:true});
const errors=[];window.addEventListener('error',e=>errors.push(e.message));process.on('unhandledRejection',e=>errors.push(String(e)));
await import(pathToFileURL(path.resolve('app.js')).href);
const tick=()=>new Promise(r=>setTimeout(r,35));const settle=async()=>{for(let i=0;i<5;i++)await tick();};
const $=id=>document.getElementById(id);const go=async h=>{location.hash=h;await settle();};
await settle();assert.ok($('layout').classList.contains('on'));assert.equal(localStorage.getItem('ks-watch-session-suite'),'su1te');
assert.equal(document.querySelectorAll('#board .dom').length,2);assert.equal(document.querySelector('#board .dom').dataset.id,'1');assert.equal(document.querySelectorAll('#compFacts .fact').length,4);
assert.equal(document.querySelector('[data-filter="attention"] .n').textContent,'1','a domain with several findings counts once');
$('domainSearch').value='app.';$('domainSearch').dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('#board .dom').length,1);$('domainSearch').value='';$('domainSearch').dispatchEvent(new window.Event('input'));
assert.ok(!document.querySelector('[data-view="add"]'),'add belongs in the Domains action');
await go('#/activity');assert.equal(document.querySelectorAll('#activityRows .ev').length,2);$('activityFilter').value='attention';$('activityFilter').dispatchEvent(new window.Event('change'));assert.equal(document.querySelectorAll('#activityRows .ev').length,1);
await go('#/d/1');assert.equal($('dName').textContent,'example.com');assert.equal(document.querySelectorAll('#dRecords details.rec').length,3);assert.equal(document.querySelectorAll('#dRecords details.rec[open]').length,1);assert.ok(!$('dAcceptAll'));assert.match($('dPosture').textContent,/does not verify/);
if(globalThis.__watchRole==='admin'){
 assert.ok(document.querySelector('[data-accept="MX"]'));document.querySelector('[data-accept="MX"]').click();await settle();assert.ok(calls.includes('acceptChange'));
 const old=row1.records[1].status;row1.records[1].status='dangling';await go('#/overview');await go('#/d/1');assert.ok(!document.querySelector('[data-accept="MX"]'));assert.match($('dRecords').textContent,/cannot be accepted/);row1.records[1].status=old;
 $('dEdit').click();assert.match($('eWatchTags').textContent,/ana@example.com/);$('eSave').click();await settle();assert.ok(calls.includes('updateDomain'));assert.ok($('dEditCard').classList.contains('hidden'));
 await go('#/settings');assert.equal($('sInterval').value,'17');assert.equal($('sExpiry').value,'45','nonstandard saved values are preserved');assert.ok(!$('sSave1')&&!$('sSave2'));assert.ok($('sSave').disabled);
 $('sInterval').value='19';$('sInterval').dispatchEvent(new window.Event('input',{bubbles:true}));assert.ok(!$('sSave').disabled);controls.settingsFailure=true;$('sSave').click();await settle();assert.equal($('sInterval').value,'19');assert.match($('sStatus').textContent,/Synthetic save failure/);assert.ok(!$('sSave').disabled);controls.settingsFailure=false;
 globalThis.confirm=()=>false;await go('#/overview');assert.equal(location.hash,'#/settings');assert.equal($('sInterval').value,'19');globalThis.confirm=()=>true;
 $('sSave').click();await settle();assert.match($('sStatus').textContent,/Changes saved/);assert.ok($('sSave').disabled);
 await go('#/add');assert.equal(document.querySelectorAll('#aTypes .chip.on').length,7);$('aName').value='shop.example.com';$('aSave').click();await settle();assert.ok(calls.includes('addDomain')&&calls.includes('checkNow'));assert.equal(location.hash,'#/d/5');
}else{
 assert.ok(!$('dEdit')&&!document.querySelector('[data-accept]')&&!document.querySelector('[data-ignore]'));await go('#/settings');assert.ok(!$('v-settings').classList.contains('active'));await go('#/add');assert.ok(!$('v-add').classList.contains('active'));
}
await go('#/evidence');assert.equal(document.querySelectorAll('#repRows details').length,1);assert.match($('evStatement').textContent,globalThis.__watchRole==='admin'?/3 active domains/:/2 active domains/);assert.equal($('evExport').classList.contains('hidden'),globalThis.__watchRole!=='admin');
await go('#/d/999');assert.equal($('dName').textContent,'Domain unavailable');assert.ok($('dContent').classList.contains('hidden'));assert.ok(!$('dEdit')&&!$('dCheck'));
// A slow response from the previous domain cannot replace the next domain's state.
let finish;controls.delayDomain=async(_tok,id)=>id===1n?new Promise(r=>finish=r):[{row:row2,watcherNames:[],watcherEmails:[],events:[],posture:[],cert:[],owners:[],lookalikes:[],apex:false}];
await go('#/d/1');await go('#/d/2');assert.equal($('dName').textContent,'app.example.com');finish([{row:row1}]);await settle();assert.equal($('dName').textContent,'app.example.com');controls.delayDomain=null;
assert.deepEqual(errors,[]);console.log(globalThis.__watchRole.toUpperCase(),'SMOKE OK | navigation, drafts, access, missing records, async races');window.close();
