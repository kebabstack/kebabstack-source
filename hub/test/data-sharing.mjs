import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('const LANE_INFO'),html.indexOf('// ---------- policy editor'));
const turn=()=>new Promise(r=>setTimeout(r,0));
function fixture(){
 const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://hub.test/',runScripts:'outside-only'});const w=dom.window;
 w._connectors=[1,2].map(id=>({id,name:'App '+id,lanes:['identity'],canisterId:String(id)}));w._oidcIds=new Set([1,2]);
 w.api={setConnectorLanes:async()=>({ok:true}),probeApp:async()=>({manifest:[]})};
 w.eval('const $=id=>document.getElementById(id),backend=window.api,opt=x=>x?.[0],esc=x=>x;const handoffCall=p=>p;function setStatus(id,kind,text){$(id).textContent=text}async function refreshConnectors(){}'+code);return{dom,w};
}
function choose(w,lane){const el=w.document.querySelector('#laneSkewer [data-lane='+lane+']');el.checked=!el.checked;el.dispatchEvent(new w.Event('change',{bubbles:true}));}
test('data-sharing edits stay a draft; explicit save captures the selected app and blocks duplicate saves',async()=>{
 const{dom,w}=fixture();let calls=[];let resolve;w.api.setConnectorLanes=(id,lanes)=>{calls.push({id,lanes:[...lanes]});return new Promise(r=>resolve=r)};
 w.setLanes(1);choose(w,'profile');choose(w,'groups');assert.equal(calls.length,0);
 w.document.getElementById('laneSave').click();w.document.getElementById('laneSave').click();assert.equal(calls.length,1);assert.equal(calls[0].id,1n);assert.deepEqual(calls[0].lanes,['identity','profile','groups']);
 w.setLanes(2);resolve({ok:true});await turn();assert.equal(w.document.getElementById('laneName').textContent,'App 2');assert.equal(w.document.getElementById('laneStatus').textContent,'');dom.window.close();
});
test('failed data-sharing save keeps the draft for retry and required identity cannot be removed',async()=>{
 const{dom,w}=fixture();let count=0;w.api.setConnectorLanes=async()=>++count===1?{ok:false,detail:'Try again'}:{ok:true};
 w.setLanes(1);choose(w,'profile');assert.equal(w.document.querySelector('[data-lane=identity]').disabled,true);
 w.document.getElementById('laneSave').click();await turn();assert.equal(w.document.getElementById('laneStatus').textContent,'Try again');assert.equal(w.document.querySelector('[data-lane=profile]').checked,true);
 w.document.getElementById('laneSave').click();await turn();assert.equal(count,2);assert.equal(w.document.getElementById('laneStatus').textContent,'Saved');dom.window.close();
});
test('late requirement probes cannot overwrite the next app dialog',async()=>{
 const{dom,w}=fixture();w._oidcIds.clear();let resolve;w.api.probeApp=()=>new Promise(r=>resolve=r);w.setLanes(1);const old=resolve;
 assert.equal(w.document.getElementById('laneSave').disabled,true);
 w.setLanes(2);old({manifest:[{needs:['groups'],wants:['profile']}]});await turn();assert.equal(w.document.querySelector('[data-lane=groups]').checked,false);assert.equal(w.document.getElementById('laneSave').disabled,true);
 resolve({manifest:[{needs:['identity'],wants:[]}]});await turn();assert.equal(w.document.getElementById('laneSave').disabled,false);dom.window.close();
});
