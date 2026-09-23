import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const extract=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const code=extract('// A handoff owns','let portalPoller').replace('location.replace(dest.href)','window.destination = dest.href');
function fixture(){
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://hub.test/',runScripts:'outside-only'});const w=dom.window;
 w.api={portalApps:async()=>[{id:3n,kind:'app',url:'https://assets.test/'}],mintAppTicket:async()=>({ok:true,url:'https://assets.test/',ticket:'a'.repeat(64)})};
 w.eval('var $=id=>document.getElementById(id);var opt=x=>x?.[0];const pActor=()=>window.api;const pTok=()=>"session";'+code);return{w,dom};
}
for(const target of ['3','https://assets.test/'])test('app handoff '+target+' keeps the console inert until redirect',async()=>{
 const{w,dom}=fixture();w.sessionStorage.setItem('uh-jump',target);
 let resolve;w.api.mintAppTicket=()=>new Promise(r=>resolve=r);
 const pending=w.resumeAppJump({active:true});await new Promise(r=>setTimeout(r,0));
 for(const id of ['layout','portal','login']){assert.equal(w.document.getElementById(id).inert,true);assert.ok(w.document.getElementById(id).classList.contains('hidden'));}
 assert.equal(w.document.getElementById('handoff').classList.contains('hidden'),false);assert.equal(w.destination,undefined);
 resolve({ok:true,url:'https://assets.test/',ticket:'a'.repeat(64)});await pending;
 assert.match(w.destination,/^https:\/\/assets.test\/#uht=/);assert.equal(w.sessionStorage.getItem('uh-jump'),null);dom.window.close();
});
test('a rejected app remains on a recoverable error screen and retries the same app once',async()=>{
 const{w,dom}=fixture();w.sessionStorage.setItem('uh-jump','3');let calls=0;
 w.api.mintAppTicket=async()=>{calls++;return{ok:false,detail:'No access to Assets.'}};
 await w.resumeAppJump({active:true});assert.match(w.document.getElementById('handoffStatus').textContent,/No access/);
 assert.equal(w.document.getElementById('handoffRetry').classList.contains('hidden'),false);assert.equal(w.document.getElementById('layout').inert,true);
 w.api.mintAppTicket=async()=>{calls++;return{ok:true,url:'https://assets.test/',ticket:'b'.repeat(64)}};
 w.document.getElementById('handoffRetry').click();w.document.getElementById('handoffRetry').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls,2);assert.ok(w.destination);dom.window.close();
});
test('unregistered targets, websites and inactive identities never mint an app ticket',async()=>{
 for(const target of ['https://outside.test/','javascript:alert(1)','https://assets.test/OtherPath']){
  const{w,dom}=fixture();w.sessionStorage.setItem('uh-jump',target);w.api.mintAppTicket=()=>{throw Error('must not mint')};await w.resumeAppJump({active:true});assert.equal(w.destination,undefined);assert.equal(w.document.getElementById('handoff').getAttribute('aria-busy'),'false');dom.window.close();
 }
 const{w,dom}=fixture();w.sessionStorage.setItem('uh-jump','3');let called=false;w.api.mintAppTicket=async()=>{called=true};await w.resumeAppJump({active:false});assert.equal(called,false);dom.window.close();
});
test('passkey owner arriving from a tool is handed off before console initialization',async()=>{
 const{w,dom}=fixture();w.sessionStorage.setItem('uh-jump','3');let adminChecked=false;
 w.api.portalWhoami=async()=>[{active:true}];w.api.amIAdmin=async()=>{adminChecked=true;return true};
 w.authClient={getIdentity:()=>({getPrincipal:()=>({toText:()=> 'aaaaa-aa'})})};w.HttpAgent={create:async()=>({})};w.Actor={createActor:()=>w.api};
 w.eval('var backend,portalMode,IC_HOST="",BACKEND_CANISTER_ID="",idlFactory={};function loginState(){}function oidcPending(){return false}'+extract('async function afterLogin()','(async () => {'));
 await w.afterLogin();assert.equal(adminChecked,false);assert.ok(w.destination);assert.equal(w.document.getElementById('layout').inert,true);dom.window.close();
});
test('network failure can be cancelled and a late response cannot navigate',async()=>{
 const{w,dom}=fixture();w.sessionStorage.setItem('uh-jump','3');let resolve;w.api.mintAppTicket=()=>new Promise(r=>resolve=r);
 const pending=w.resumeAppJump({active:true});w.leaveHandoff();resolve({ok:true,url:'https://assets.test/',ticket:'c'.repeat(64)});await pending;assert.equal(w.destination,undefined);assert.equal(w.document.getElementById('layout').inert,false);dom.window.close();
});

test('retry refreshes an initially unavailable identity before opening the app',async()=>{
 const{w,dom}=fixture();w.sessionStorage.setItem('uh-jump','3');await w.resumeAppJump(null);assert.match(w.document.getElementById('handoffStatus').textContent,/could not be confirmed/);w.api.portalWhoami=async()=>[{active:true}];w.document.getElementById('handoffRetry').click();await new Promise(r=>setTimeout(r,0));assert.ok(w.destination);dom.window.close();
});
test('a stalled Hub call times out with a retry and never exposes the console',async()=>{
 const{w,dom}=fixture();w.setTimeout=fn=>setTimeout(fn,0);w.clearTimeout=clearTimeout;w.sessionStorage.setItem('uh-jump','3');w.api.mintAppTicket=()=>new Promise(()=>{});await w.resumeAppJump({active:true});assert.match(w.document.getElementById('handoffStatus').textContent,/too long/);assert.equal(w.document.getElementById('layout').inert,true);assert.equal(w.document.getElementById('handoffRetry').classList.contains('hidden'),false);dom.window.close();
});
