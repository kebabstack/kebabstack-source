import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createHandoverPanel,caseLink,renderFormerBuyer} from '../dist/handover.js';
const base={plan:{assetId:1n,caseKey:'desk:1',person:'alice',choice:'return',stage:'pending',owner:'owner',dueOn:'2026-09-30',recipient:'',note:'',revision:1n,saleId:0n},context:{ticket:1n,key:'IT-0001',url:'https://desk.example.test',state:'active'},personName:'Alice <script>',ownerName:'IT',recipientEmail:'',progress:'Awaiting return',done:false,device:'Laptop',identifier:'SERIAL-1'};
function dom(){const d=new JSDOM('<div id="root"></div>',{url:'https://assets.example.test/#/d/1'});globalThis.FormData=d.window.FormData;return d;}
test('hardware controls confirm custody and use the displayed revision; employee and stale views stay hidden',async()=>{
 const d=dom(),root=d.window.document.querySelector('#root');let me={id:'owner',role:'admin'},received=null,reloaded=0,view=base;
 const api={handoverOf:async()=>[view],handoverOwners:async()=>[{id:'owner',name:'IT'}],updateHandover:async(...args)=>{received=args;return {ok:true,detail:'Received'};}};
 const panel=createHandoverPanel({root,api:()=>api,token:()=> 'session',viewer:()=>me,reload:async()=>reloaded++,startSale:()=>{}});
 await panel.load({id:1n});assert.equal(root.querySelector('h3').textContent,'Alice <script>');assert.equal(root.querySelectorAll('script').length,0);
 const form=root.querySelector('[data-confirm-form]');form.elements.confirmation.value='SERIAL-1';form.elements.note.value='At IT';await form.onsubmit({preventDefault(){}});
 assert.equal(received[2],1n);assert.equal(received[3],'receive');assert.equal(received[5],'SERIAL-1');assert.equal(reloaded,1);
 view={...base,context:{...base.context,state:'paused'}};await panel.load({id:1n});assert.equal(root.querySelector('[data-confirm-form]'),null);assert.equal(root.querySelector('button[type=submit]').disabled,true);
 me={id:'hr',role:'member'};await panel.load({id:1n});assert.equal(root.classList.contains('hidden'),true);assert.equal(root.children.length,0);
 me={id:'owner',role:'admin'};let finish;api.handoverOf=()=>new Promise(resolve=>finish=resolve);const pending=panel.load({id:1n});panel.reset();finish([base]);await pending;assert.equal(root.children.length,0,'late response cannot reopen the old device');
 d.window.close();
});
test('a private-contact continuation explains invoice preservation and requires a private email',async()=>{
 const d=dom(),root=d.window.document.querySelector('#root');let args;
 renderFormerBuyer({root,info:{eligible:true,privateEmail:''},sale:{id:4n,invoiceNo:'IT-2026-1'},api:()=>({continueFormerBuyerSale:async(...v)=>{args=v;return {ok:true,detail:''};}}),token:()=> 'session',reload:async()=>{}});
 assert.match(root.textContent,/issued invoice.*unchanged/);const form=root.querySelector('form');assert.equal(form.elements.email.type,'email');assert.equal(form.elements.email.required,true);form.elements.email.value='alice@private.test';await form.onsubmit({preventDefault(){}});assert.deepEqual(args,['session',4n,'alice@private.test']);
 assert.equal(caseLink({url:'javascript:alert(1)',ticket:1n}),'');assert.equal(caseLink({url:'https://user:secret@example.test',ticket:1n}),'');assert.equal(caseLink(base.context),'https://desk.example.test/#/t/1');d.window.close();
});
