import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {formatMessage,readableSubject} from '../dist/message-format.js';
import {createTicketView} from '../dist/ticket-view.js';
const dom = new JSDOM(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'https://desk.test/',pretendToBeVisual:true});
const {window}=dom;globalThis.window=window;globalThis.document=window.document;
globalThis.setInterval=()=>0;
const $=id=>document.getElementById(id);
const now=BigInt(Date.now())*1000000n;
let me={id:'agent',email:'agent@example.com',role:'agent',aiOn:true};
const full=id=>({ticket:{id:BigInt(id),key:`IT-${id}`,subject:'Hi IT,',body:'Hi IT,\n\nPlease fix the wireless network',status:'open',waitingOn:'',requester:'person',assignee:'',priority:'normal',queue:'IT',fields:[],links:[],createdAt:now,dueAt:[]},row:{typeName:'Question / how do I…',assigneeName:''},requester:{id:'person',displayName:'Ana',email:'ana@example.com'},events:[{id:1n,at:now,who:'person',kind:'comment',body:'Hello'},{id:2n,at:now,who:'agent',kind:'note',body:'Internal secret'},{id:3n,at:now,who:'ai',kind:'ai',body:'Internal AI analysis'}],tasks:[],files:[],people:[],requestType:[],approval:[],slack:[],canAct:true});
let get=async id=>[full(id)],send=async()=>({ok:true}),draft=async()=>({ok:true,text:'AI draft'}),comments=0;
const api={getTicket:(_,id)=>get(id),comment:async(...args)=>{comments++;return send(...args);},addNote:(...args)=>send(...args),aiDraft:(...args)=>draft(...args)};
const view=createTicketView({$,getBackend:()=>api,getMe:()=>me,session:{load:()=> 'test'},loadAgents:async()=>[],renderFields:()=>{},collectFields:()=>[],setStatus:(id,cls,text)=>{$(id).textContent=text;}});
const type=text=>{$('cBody').value=text;$('cBody').dispatchEvent(new window.Event('input'));};
const tick=()=>new Promise(r=>setTimeout(r,10));
function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});return{promise,resolve,reject};}

test('message formatting: Slack links, lists, code, long text and no active HTML',()=>{
 const html=formatMessage('See <https://example.com/docs|the guide>\n\n1) First\n2) Second\n\n```\n<img onerror=evil()>\n```');
 const area=document.createElement('div');area.innerHTML=html;
 assert.equal(area.querySelector('a').textContent,'the guide');assert.equal(area.querySelectorAll('ol li').length,2);assert.match(area.querySelector('pre').textContent,/<img/);assert.equal(area.querySelector('img'),null);
 area.innerHTML=formatMessage('[click](javascript:alert) <img src=x onerror=evil()> <@U123ABC|Ana> <https://example.com/?x="onclick="evil|link>');
 assert.equal(area.querySelector('img,script,[onclick],[onerror]'),null);assert.ok([...area.querySelectorAll('a')].every(a=>['https:','http:','mailto:'].includes(a.protocol)));assert.match(area.textContent,/@Ana/);
 const long='Exact full sentence. '.repeat(500);assert.equal(JSDOM.fragment(formatMessage(long)).textContent,long.trim());
 assert.equal(readableSubject('Hi IT,','Hi IT,\n\nPlease verify DNS'),'Please verify DNS');
});

test('refresh and navigation preserve separate public and internal drafts',async()=>{
 await view.load(1);type('Public draft');$('cNoteBtn').click();type('Private draft');
 await view.load(1);assert.equal($('cBody').value,'Private draft');
 $('cSeg').querySelector('[data-k=comment]').click();assert.equal($('cBody').value,'Public draft');
 view.leave();await view.load(2);assert.equal($('cBody').value,'');view.leave();await view.load(1);assert.equal($('cBody').value,'Public draft');
 $('tAddChecklist').click();assert.equal($('tTasksCard').classList.contains('hidden'),false);
});

test('double click sends once; typing during a save survives; rejection keeps the draft',async()=>{
 type('Send this');const pending=deferred();send=()=>pending.promise;const before=comments;
 $('cSend').click();$('cSend').click();assert.equal(comments,before+1);assert.equal($('cSend').disabled,true);
 type('Next thought');pending.resolve({ok:true});await tick();assert.equal($('cBody').value,'Next thought');assert.equal($('cSend').disabled,false);
 send=async()=>{throw Error('offline');};$('cSend').click();await tick();assert.equal($('cBody').value,'Next thought');assert.match($('cStatus').textContent,/not been confirmed/);
 send=async()=>({ok:false,detail:'Session expired'});$('cSend').click();await tick();assert.equal($('cBody').value,'Next thought');assert.match($('cStatus').textContent,/Session expired/);
});

test('a late AI draft never overwrites new typing',async()=>{
 const pending=deferred();draft=()=>pending.promise;type('My start');$('aiDraft').click();type('My revised reply');pending.resolve({ok:true,text:'A different suggestion'});await tick();
 assert.equal($('cBody').value,'My revised reply');assert.equal($('aiDraftReview').classList.contains('hidden'),false);assert.match($('aiDraftText').textContent,/different suggestion/);
});

test('out-of-order ticket responses cannot show a previous request',async()=>{
 const slow=deferred();get=id=>String(id)==='3'?slow.promise:Promise.resolve([full(id)]);
 const old=view.load(3);await view.load(4);slow.resolve([full(3)]);await old;assert.equal($('tKey').textContent,'IT-4');
});

test('role downgrade and sign-out clear privileged content and drafts',async()=>{
 get=async id=>[full(id)];await view.load(4);$('cNoteBtn').click();type('Private pending note');
 me={...me,id:'person',role:'requester'};get=async id=>[{...full(id),canAct:false}];await view.load(4);
 assert.equal($('cBody').value,'');assert.equal($('cNoteBtn').classList.contains('hidden'),true);assert.doesNotMatch($('tTimeline').textContent,/Internal secret|Internal AI analysis/);assert.equal($('tActions').classList.contains('hidden'),true);
 type('Personal draft');view.reset();await view.load(4);assert.equal($('cBody').value,'');
});


test('an AI response started as an agent is discarded after losing agent access',async()=>{
 me={id:'agent',email:'agent@example.com',role:'agent',aiOn:true};get=async id=>[full(id)];view.reset();await view.load(5);
 const pending=deferred();draft=()=>pending.promise;type('');$('aiDraft').click();
 me={...me,role:'requester'};get=async id=>[{...full(id),canAct:false}];await view.load(5);
 pending.resolve({ok:true,text:'Private AI context'});await tick();assert.equal($('cBody').value,'');assert.equal($('aiDraftReview').classList.contains('hidden'),true);
});


test('directory reviews use internal notes and hide premature completion actions',async()=>{
 me={id:'agent',email:'agent@example.com',role:'agent',aiOn:true};get=async id=>[{...full(id),internal:true,lifecycle:[{state:{review:null}}],tasks:[{title:'Reclaim device',state:'open',by:'',at:0n}]}];view.reset();await view.load(6);
 assert.equal($('cSeg').querySelector('[data-k=comment]').classList.contains('hidden'),true);assert.equal($('cSend').textContent,'Save internal note');assert.equal($('tNextStep').classList.contains('hidden'),true);assert.equal($('tStatusBtns').textContent,'');assert.equal($('tTasks').querySelector('select').disabled,true);assert.equal($('tState').querySelector('[value=resolved]').disabled,true);
});

test('customer tickets do not load employee context; newly issued private links survive polling and clear on navigation',async()=>{
 me={id:'agent',email:'agent@example.com',role:'admin',aiOn:true};view.reset();
 const sample=full(808);sample.customer=[{projectId:1n,projectName:'Product',name:'Customer',email:'customer@example.test',linkExpiresAt:now}];
 let issued;api.customerProjectAgents=async()=>[];api.customerTicketLink=()=>new Promise(r=>issued=r);get=async()=>[sample];
 await view.load(808);assert.ok($('tPersonContext').classList.contains('hidden'));assert.ok($('aiBtns').classList.contains('hidden'));assert.ok($('cAttach').classList.contains('hidden'));
 $('tCustomerLink').click();await tick();assert.equal($('tCustomerRevoke').disabled,true);view.refresh();
 issued({ok:true,url:'https://desk.test/support.html#ticket/808/PRIVATE',detail:'Link replaced'});await tick();assert.match($('tCustomerLinkResult').textContent,/Link replaced/);
 sample.customer[0].linkExpiresAt+=1000n;await view.load(808,{background:true});assert.equal($('tCustomerLinkResult').querySelector('input').value,'https://desk.test/support.html#ticket/808/PRIVATE');
 view.leave();assert.equal($('tCustomer').textContent,'');
});

test('a removed customer request clears rendered content, edit fields and both reply drafts',async()=>{
 me={id:'agent',email:'agent@example.com',role:'admin',aiOn:false};view.reset();const sample=full(909);sample.role='admin';sample.customer=[{projectId:1n,projectName:'Product',name:'Private customer',email:'private@example.test',linkExpiresAt:now,deleteAt:now+86400000000000n,hold:[]}];api.customerProjectAgents=async()=>[];get=async()=>[sample];await view.load(909);type('Personal public draft');$('cNoteBtn').click();type('Personal internal draft');$('tEditBtn').click();assert.ok($('teBody').value);
 get=async()=>[];await view.load(909,{background:true});assert.equal($('tTimeline').textContent,'');assert.equal($('tCustomer').textContent,'');assert.equal($('tBody').textContent,'');assert.equal($('teBody').value,'');assert.equal($('cBody').value,'');
 // Even if a fixture restores the record, discarded drafts cannot reappear.
 view.leave();get=async()=>[sample];await view.load(909);assert.equal($('cBody').value,'');$('cNoteBtn').click();assert.equal($('cBody').value,'');view.reset();
});

test('customer workflow keeps reason drafts during polling, blocks generic completion, and clears on leaving',async()=>{
 me={id:'agent',email:'agent@example.com',role:'admin',aiOn:false};view.reset();
 const sample=full(909);sample.customer=[{projectId:1n,projectName:'Product',name:'Customer',email:'customer@example.test',linkExpiresAt:now}];sample.customerWorkflow=[{canProgress:true,run:{revision:3n,step:1n,outcome:'',checked:[],definition:{name:'Refund',steps:[{name:'Review',group:'',instructions:'',approval:false,checklist:[]},{name:'Finance approval',group:'Finance',instructions:'Confirm eligibility',approval:true,checklist:[]}]}}}];api.customerProjectAgents=async()=>[];get=async()=>[sample];await view.load(909);
 assert.equal($('tNextStep').classList.contains('hidden'),true);assert.equal($('tState').querySelector('[value=resolved]').disabled,true);assert.equal($('tState').querySelector('[value=closed]').disabled,true);assert.match($('tWorkflow').textContent,/Approve & complete/);
 $('workflowReason').value='Please provide the receipt';await view.refresh();assert.equal($('workflowReason').value,'Please provide the receipt');let submitted;api.moveCustomerStep=async(...args)=>{submitted=args;return{ok:false,detail:'Permission changed'};};$('tWorkflow').querySelector('[data-workflow-action=back]').click();await tick();assert.equal(submitted[2],3n);assert.equal(submitted[3],'back');assert.equal(submitted[4],'Please provide the receipt');assert.match($('workflowStatus').textContent,/Permission changed/);
 sample.customerWorkflow[0].canProgress=false;await view.refresh();assert.equal($('tWorkflow').querySelector('[data-workflow-action=approve]').disabled,true);assert.equal($('workflowReason'),null);view.leave();assert.equal($('tWorkflow').textContent,'');
});
