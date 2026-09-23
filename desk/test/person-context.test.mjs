import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPersonContext,contextLink} from '../dist/person-context.js';
const now=BigInt(Date.now())*1000000n;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const tick=()=>new Promise(r=>setTimeout(r,0));
const ticket=id=>({canAct:true,ticket:{id:BigInt(id),fields:[['person','alice']]},requester:{id:'hr'}});
const overview=(name='Alice')=>({person:{id:'alice',displayName:name,email:'alice@example.test',department:'Engineering',active:false},related:[],lifecycle:[]});
const item=(i,historical=false)=>({id:String(i),title:`Computer ${i}`,kind:'laptop',detail:'Asset tag · Serial',status:historical?'returned':'assigned',path:`#/d/${i}`,historical});
function fixture(overrides={}) {
 const dom=new JSDOM('<aside id="context"></aside><section id="lifecycle"></section>',{url:'https://desk.test'}),d=dom.window.document;
 const root=d.getElementById('context'),lifecycleRoot=d.getElementById('lifecycle');let me={id:'agent',role:'agent'},reloads=[];
 const backend={personOverview:async()=>[overview()],personContextSources:async()=>[{cid:1n,name:'Assets',url:'https://assets.test'}],personContext:async()=>({state:{ready:null},items:[item(1)],total:1n,checkedAt:now}),decideLifecycle:async()=>({ok:true}),...overrides};
 const view=createPersonContext({root,lifecycleRoot,api:()=>backend,getMe:()=>me,session:{load:()=> 'session'},reload:async id=>{reloads.push(id);}});
 return {view,root,lifecycleRoot,backend,reloads,setMe:value=>{me=value;},dom};
}
test('affected person, bounded progressive disclosure, and safe source links',async()=>{
 const f=fixture({personOverview:async()=>[overview('<img src=x onerror=alert(1)>')],personContext:async()=>({state:{ready:null},items:[...Array.from({length:7},(_,i)=>item(i)),item(8,true)],total:101n,checkedAt:now})});
 await f.view.load(ticket(1));
 assert.match(f.root.textContent,/Affected person/);assert.match(f.root.textContent,/<img/);assert.equal(f.root.querySelector('img'),null);
 const details=f.root.querySelector('[data-source]');assert.equal(details.open,false);assert.equal(details.querySelectorAll('[data-items]>.context-item').length,5);
 assert.match(details.textContent,/2 more current items/);assert.match(details.textContent,/Previous & completed \(1\)/);assert.match(details.textContent,/Showing 8 of 101/);
 assert.equal(details.querySelector('a').href,'https://assets.test/#/d/0');assert.equal(details.querySelector('a').rel,'noopener noreferrer');
 details.open=true;await f.view.load(ticket(1),true);assert.equal(f.root.querySelector('[data-source]').open,true);
 assert.equal(contextLink('javascript:alert(1)','#/d/1'),'');assert.equal(contextLink('https://name:secret@assets.test','#/d/1'),'');assert.equal(contextLink('https://assets.test','//evil.test'),'');
});
test('restricted, unavailable, and empty sources remain distinct when one source fails',async()=>{
 const f=fixture({personContextSources:async()=>[1,2,3].map(cid=>({cid:BigInt(cid),name:'App '+cid,url:'https://app.test'})),personContext:async(_,__,cid)=>{if(cid===2n)throw Error('offline');return {state:cid===1n?{denied:null}:{ready:null},items:[],total:0n,checkedAt:now};}});
 await f.view.load(ticket(1));assert.match(f.root.querySelector('[data-source="1"]').textContent,/Restricted/);assert.match(f.root.querySelector('[data-source="2"]').textContent,/Unavailable/);assert.match(f.root.querySelector('[data-source="3"]').textContent,/No related records visible/);
});
test('late context responses cannot cross ticket navigation or sign-out',async()=>{
 const slow=deferred();const f=fixture({personOverview:async(_,id)=>id===1n?slow.promise:[overview('New person')]});
 const old=f.view.load(ticket(1));await f.view.load(ticket(2));slow.resolve([overview('Old private person')]);await old;assert.match(f.root.textContent,/New person/);assert.doesNotMatch(f.root.textContent,/Old private/);
 const pending=deferred();f.backend.personContext=()=>pending.promise;const refresh=f.view.load(ticket(2),true);await tick();f.setMe(null);f.view.reset();pending.resolve({state:{ready:null},items:[item(9)],total:1n,checkedAt:now});await refresh;assert.equal(f.root.textContent,'');assert.equal(f.lifecycleRoot.textContent,'');
});
test('downgrades clear privileged summaries and future loads stay empty',async()=>{
 const f=fixture();await f.view.load(ticket(1));assert.match(f.root.textContent,/Alice/);f.setMe({id:'agent',role:'requester'});await f.view.load({...ticket(1),canAct:false});assert.equal(f.root.textContent,'');assert.equal(f.lifecycleRoot.textContent,'');
});
test('decision requires an exception reason, preserves drafts, and carries event revision',async()=>{
 const c={personId:'alice',name:'Alice',email:'alice@example.test',lastEvent:42n,detectedAt:now,source:'Okta',effectiveActive:false,state:{review:null},note:''};let called=[];
 const f=fixture({personOverview:async()=>[{...overview(),lifecycle:[c]}],decideLifecycle:async(...args)=>{called.push(args);return {ok:true};}});
 await f.view.load(ticket(1));f.lifecycleRoot.querySelector('[data-lifecycle="no"]').click();assert.match(f.lifecycleRoot.textContent,/Add a reason/);assert.equal(called.length,0);
 f.lifecycleRoot.querySelector('textarea').value='Temporary suspension';await f.view.load(ticket(1),true);assert.equal(f.lifecycleRoot.querySelector('textarea').value,'Temporary suspension');
 f.lifecycleRoot.querySelector('[data-lifecycle="no"]').click();f.lifecycleRoot.querySelector('[data-lifecycle="no"]').click();await tick();assert.deepEqual(called,[['session',1n,42n,false,'Temporary suspension']]);assert.deepEqual(f.reloads,[1n]);
});
test('hardware cancellation carries the checked case revision and reloads the same ticket',async()=>{
 let args;
 const f=fixture({offboardingHardware:async()=>[{context:{state:'active',revision:42n},progress:{state:'ready',total:3n,open:2n,sources:1n}}],cancelOffboarding:async(...input)=>{args=input;return {ok:true,detail:'Cancelled'};}});
 await f.view.load(ticket(7));await tick();assert.match(f.root.textContent,/1 of 3 complete/);
 const form=f.root.querySelector('[data-cancel-offboarding]');assert.ok(form);form.elements.reason.value='HR entered the wrong person';await form.onsubmit({preventDefault(){}});
 assert.deepEqual(args,['session',7n,42n,'HR entered the wrong person']);assert.deepEqual(f.reloads,[7n]);
 f.setMe({id:'hr',role:'requester'});await f.view.load({...ticket(7),canAct:false});assert.equal(f.root.textContent,'');
});
