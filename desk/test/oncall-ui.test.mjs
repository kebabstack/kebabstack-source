import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createOncall} from '../dist/oncall.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
function context(role='admin'){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://desk.test/#/oncall',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location});
 let me={id:'a',role},startAt=BigInt(Date.now()+86400000)*1_000_000n,endAt=startAt+86400000000000n;
 const project={id:1n,name:'Operations <img src=x>',description:'Synthetic example',services:['API'],scope:{internal:'Team'}},plan={id:1n,revision:1n,requestKey:'aa'.repeat(16),createdBy:'a',input:{projectId:1n,startAt,endAt,timezone:'UTC',layers:['Primary'],windows:[{startAt,endAt,layer:0n}],shifts:[{startAt,endAt,layer:0n,personId:'a'}]},publication:[]};
 const workspace={project,members:[{id:'a',name:'Alex'},{id:'b',name:'Blair'}],canManage:role==='admin',plans:[{id:1n,revision:1n,startAt,endAt,timezone:'UTC',published:false}]},view={plan,swaps:[],issues:[]};
 const api={oncallRegionalRecipe:async()=>[],oncallCalendar:async()=>[{settings:{revision:0n,archivedAt:0n,retentionDays:730n},absences:[]}],oncallEffectivePlan:async()=>[{segments:view.plan.input.shifts.map((s,i)=>({...s,shift:BigInt(i),key:'shift:1:'+i})),covers:[],cancellation:[]}],oncallProjects:async()=>[project],oncallWorkspace:async()=>[workspace],oncallPlan:async()=>[structuredClone(view)],listCustomerProjects:async()=>[]},root=document.getElementById('root'),ui=createOncall({root,api:()=>api,session:{load:()=> 'token'},getMe:()=>me});
 return{root,ui,api,view,workspace,setMe:m=>{me=m;},cleanup:()=>{ui.clear();dom.window.close();}};
}
test('project cards escape content and requester cannot load the planning area',async()=>{const c=context();try{await c.ui.show();assert.match(c.root.textContent,/Operations <img/);assert.equal(c.root.querySelector('img'),null);c.setMe({id:'a',role:'requester'});await c.ui.show();assert.equal(c.root.textContent,'');}finally{c.cleanup();}});
test('draft edits must be saved and rechecked before publication',async()=>{const c=context();try{await c.ui.show('1','1');const select=c.root.querySelector('[data-assign]');select.value='';select.dispatchEvent(new window.Event('change'));assert.equal(c.root.querySelector('#ocPublish').disabled,true);assert.match(c.root.textContent,/recalculate coverage/);let saved;c.api.saveOncallPlan=async(...args)=>{saved=args;return{err:{stale:null}};};c.root.querySelector('#ocSaveAssignments').click();await tick();assert.equal(saved[4].shifts[0].personId,'');assert.match(c.root.textContent,/plan changed/);}finally{c.cleanup();}});
test('published plans expose consent rather than an administrator accept button',async()=>{const c=context();try{c.view.plan.publication=[{at:c.view.plan.input.startAt,by:'a',names:c.workspace.members,acceptedGaps:false}];c.workspace.plans[0].published=true;c.view.swaps=[{id:1n,shift:0n,fromPersonId:'a',toPersonId:'b',toName:'Blair',requestedBy:'a',requestedAt:c.view.plan.input.startAt,state:{pending:null},reason:'Cover needed'}];await c.ui.show('1','1');assert.equal(c.root.querySelector('[data-decision="accept"]'),null);assert.match(c.root.textContent,/remains assigned until acceptance/);assert.ok(c.root.querySelector('[data-decision="cancel"]'));c.setMe({id:'b',role:'agent'});c.workspace.canManage=false;await c.ui.show('1','1');assert.ok(c.root.querySelector('[data-decision="accept"]'));}finally{c.cleanup();}});
test('late responses cannot rebuild content after sign-out or an account change',async()=>{const c=context();try{let finish;c.api.oncallWorkspace=()=>new Promise(r=>finish=r);const load=c.ui.show('1');c.ui.clear();finish([c.workspace]);await load;assert.equal(c.root.textContent,'');}finally{c.cleanup();}});
test('simulation labels missing coverage and sends no mutation',async()=>{const c=context();try{c.view.plan.input.shifts[0].personId='';await c.ui.show('1','1');c.root.querySelector('#ocSim').click();assert.match(c.root.querySelector('#ocSimResult').textContent,/Coverage missing/);assert.match(c.root.textContent,/Simulation sends no messages/);}finally{c.cleanup();}});
test('the next period starts after existing coverage instead of overlapping tomorrow',async()=>{const c=context();try{c.workspace.plans[0].published=true;c.workspace.plans[0].endAt=BigInt(Date.UTC(2029,3,5,13,45))*1_000_000n;await c.ui.show('1','new');assert.equal(c.root.querySelector('#ocStart').value,'2029-04-05');assert.equal(c.root.querySelector('#ocHandoff').value,'13:45');assert.equal(c.root.querySelector('#ocZone').value,'UTC');}finally{c.cleanup();}});
test('a late response is discarded when the account changes without a host clear',async()=>{const c=context();try{let finish;c.api.oncallWorkspace=()=>new Promise(r=>finish=r);const load=c.ui.show('1');c.setMe({id:'b',role:'admin'});finish([c.workspace]);await load;assert.equal(c.root.textContent,'');}finally{c.cleanup();}});
test('background checks preserve inputs but access loss clears even an open cover form',async(t)=>{
 const c=context();t.mock.timers.enable({apis:['setTimeout']});
 const drain=()=>new Promise(r=>setImmediate(r));
 try{
  c.view.plan.publication=[{at:c.view.plan.input.startAt,by:'a',names:c.workspace.members,acceptedGaps:false}];c.workspace.plans[0].published=true;
  await c.ui.show('1','1');const input=c.root.querySelector('#ocSimTime');input.value='2030-01-02T12:00';
  t.mock.timers.tick(30000);await drain();assert.equal(c.root.querySelector('#ocSimTime'),input);assert.equal(input.value,'2030-01-02T12:00');
  c.root.querySelector('[data-cover]').click();const reason=c.root.querySelector('#ocReason');reason.value='Keep this reason';
  c.api.oncallWorkspace=async()=>[];t.mock.timers.tick(30000);await drain();
  assert.equal(c.root.querySelector('#ocCoverForm'),null);assert.match(c.root.textContent,/no longer has access/);
 }finally{c.cleanup();t.mock.timers.reset();}
});
test('regional preview preserves a review step and invalidates it after input changes',async()=>{const c=context();try{
 await c.ui.show('1','regional-new');c.root.querySelector('[data-region="0"] [data-roster="primary"] [data-person="a"]').click();c.root.querySelector('[data-region="1"] [data-roster="primary"] [data-person="b"]').click();
 const form=c.root.querySelector('#regionalForm');form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));assert.ok(c.root.querySelector('#saveRegional'));assert.match(c.root.textContent,/primary hours need coverage/);
 const title=c.root.querySelector('[data-region="0"] [data-field="name"]');title.value='Updated region';title.dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(c.root.querySelector('#saveRegional'),null);
 form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));let saved;c.api.saveOncallRegionalPlan=async(...args)=>{saved=args;return{ok:{id:2n,revision:1n}};};c.root.querySelector('#saveRegional').click();await tick();assert.equal(saved[5].regions[0].name,'Updated region');assert.equal(saved[4].projectId,1n);assert.match(location.hash,/oncall\/1\/2/);
 }finally{c.cleanup();}});
test('incomplete regional times show a correction without losing selected responders',async()=>{const c=context();try{
 await c.ui.show('1','regional-new');c.root.querySelector('[data-region="0"] [data-field="start"]').value='';c.root.querySelector('[data-region="0"] [data-person="a"]').click();assert.match(c.root.querySelector('[data-oc-status]').textContent,/Complete the regional/);assert.equal(c.root.querySelector('[data-region="0"] [data-person="a"]').getAttribute('aria-pressed'),'false');
 }finally{c.cleanup();}});
test('responders can inspect reminder receipts without local policy controls',async()=>{const c=context('agent');try{
 c.api.oncallReminders=async()=>[{policy:[{enabled:true,coordinators:['a'],revision:1n}],jobs:[{title:'Cover <img>',recipient:'a',createdAt:BigInt(Date.now())*1000000n,status:{accepted:null},attempts:1n,detail:'Hub receipt only'}],ready:true,full:false}];await c.ui.show('1','reminders');assert.equal(c.root.querySelector('#reminderForm'),null);assert.match(c.root.textContent,/Hub accepted/);assert.equal(c.root.querySelector('img'),null);
 }finally{c.cleanup();}});
test('configuration routes stay together and missing periods do not pretend to be an empty project',async()=>{const c=context();try{await c.ui.show('1','project-settings');assert.ok(c.root.querySelector('nav[aria-label="Project settings"] a[href$="response-settings"]'));assert.ok(c.root.querySelector('nav[aria-label="Project settings"] a[href$="sources"]'));await c.ui.show('1','999');assert.match(c.root.textContent,/planning period is unavailable/);assert.equal(c.root.querySelector('#ocPublish'),null);}finally{c.cleanup();}});
