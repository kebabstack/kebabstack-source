import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../dist/permissions.js',import.meta.url),'utf8');
const clone=structuredClone;
const tick=()=>new Promise(r=>setTimeout(r,0));
async function fixture({role='owner',enforced=true,app='forms'}={}) {
 const dom=new JSDOM('<main id="permissions"></main>',{runScripts:'outside-only',url:'https://hub.test/#/permissions'});
 const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.eval(source);const root=w.document.querySelector('main');
 const roles=[{id:'none',name:'No access',can:[],cannot:['Open the app']},{id:'member',name:'Employee',can:['Own and shared forms'],cannot:['Unshared forms']},{id:'admin',name:'Admin',can:['All app content'],cannot:['Assign Hub roles']}];
 let saved={app,defaultRole:'member',people:[],groups:[]},revision=1n,now=BigInt(Date.now())*1000000n;
 const calls=[];
 const view=p=>({id:1n,name:'Forms',configured:true,revision,policy:clone(p),roles,canManage:role==='owner',checkedAt:now,enforced,status:[{app:'forms',model:1n,revision:'snapshot',directoryAt:now,legacy:[],legacyGroups:[]}],people:[{id:'owner',name:'Owner',email:'owner@test',role:'admin',source:'Global Hub owner',active:true,inherited:true,assigned:[],previouslyAllowed:true},{id:'alice',name:'Alice <script>bad()</script>',email:'alice@test',role:p.people.find(x=>x.id==='alice')?.role||p.defaultRole,source:p.people.some(x=>x.id==='alice')?'Individual assignment':'App default',active:true,inherited:false,assigned:[],previouslyAllowed:true}]});
 const api={
  listConnectors:async()=>[{id:1n,name:'Forms',permissionApp:'forms',canisterId:'aaaaa-aa'}],listGroups:async()=>[],
  getAppPermissions:async()=>[view(saved)],previewAppPermissions:async(_,p)=>[view(p)],
  checkAppPermissions:async()=>({ok:true,detail:'Confirmed'}),
  setAppPermissions:async(id,rev,p)=>{calls.push({id,rev,p:clone(p)});if(rev!==revision)return {ok:false,detail:'Permissions changed'};saved=clone(p);revision++;enforced=false;return {ok:true,detail:'Saved'};},
  personAppPermissions:async()=>[{cid:1n,name:'Forms',app:'forms',configured:true,role:'member',source:'App default',can:['Own forms'],cannot:['Other forms']}]
 };
 const ui=w.KebabPermissions.create(root,()=>api,{role:()=>role});await ui.load();
 return {dom,w,root,ui,api,calls,close:()=>{ui.destroy();w.close();},q:s=>root.querySelector(s),setOld:()=>{now=BigInt(Date.now()-61000)*1000000n;}};
}
test('effective roles, escaped names, inherited owner and read-only admin view',async()=>{
 for(const role of ['owner','admin']){const f=await fixture({role});try{
  assert.equal(f.root.querySelectorAll('script').length,0);assert.match(f.root.textContent,/Alice <script>/);
  assert.equal(f.q('[data-grant="owner"]'),null);assert.equal(f.q('[data-grant="alice"]').disabled,role!=='owner');
  assert.equal(!!f.q('[data-p="review-button"]'),role==='owner');
  f.q('[data-person="alice"]').click();await tick();assert.match(f.q('[data-p="person"]').textContent,/Saved Hub policy/);
 }finally{f.close();}}
});
test('preview is visibly unsaved; only a reviewed checked policy can be saved',async()=>{
 const f=await fixture();try{
  assert.match(f.root.textContent,/Confirmed by app/);
  const select=f.q('[data-grant="alice"]');select.value='admin';await select.onchange();
  assert.match(f.root.textContent,/Unsaved preview/);assert.doesNotMatch(f.root.textContent,/Confirmed by app/);assert.equal(f.calls.length,0);
  await f.q('[data-p="review-button"]').onclick();assert.equal(f.q('[data-p="save"]').disabled,true);
  await f.q('[data-p="save"]').onclick();assert.equal(f.calls.length,0);
  const checkbox=f.q('[data-p="confirm"]');checkbox.checked=true;checkbox.dispatchEvent(new f.w.Event('change'));
  await f.q('[data-p="save"]').onclick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].rev,1n);assert.equal(f.calls[0].p.people[0].role,'admin');
  assert.match(f.root.textContent,/Confirmation needed/);
 }finally{f.close();}
});
test('failed preview and concurrent revision never expose an apply action',async()=>{
 const f=await fixture();try{
  f.api.previewAppPermissions=async()=>[];await f.q('[data-p="review-button"]').onclick();assert.equal(f.q('[data-p="save"]'),null);assert.match(f.root.textContent,/could not be evaluated/);
  const base=(await f.api.getAppPermissions())[0];f.api.previewAppPermissions=async()=>[{...base,revision:2n}];await f.q('[data-p="review-button"]').onclick();
  assert.equal(f.q('[data-p="save"]'),null);assert.match(f.root.textContent,/Someone changed/);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
test('stale app response cannot overwrite a later app selection',async()=>{
 const f=await fixture();try{
  const original=f.api.getAppPermissions;let release;f.api.getAppPermissions=()=>new Promise(r=>release=r);
  const old=f.ui.open(1n);f.api.getAppPermissions=async()=>{const [v]=await original();return [{...v,name:'Latest selection'}];};await f.ui.open(1n);
  release(await original());await old;assert.match(f.root.textContent,/Latest selection/);assert.equal(f.ui.getState().busy,false);
 }finally{f.close();}
});
test('expired confirmation is not shown as applied',async()=>{
 const f=await fixture();try{f.setOld();await f.ui.load();assert.doesNotMatch(f.root.textContent,/Confirmed by app/);assert.match(f.root.textContent,/Confirmation needed/);}finally{f.close();}
});


test('Desk reporting grants stay separate from base roles and require a concrete scoped review',async()=>{const c=await fixture({app:'desk'});try{
 let saved;c.api.getDeskReportingAccess=async()=>({ok:true,revision:3n,grants:[],scopes:[{id:7n,name:'Operations'}],capabilities:[{id:'export',name:'Export approved payroll',can:['Download approved CSV'],cannot:[]}]});c.api.setDeskReportingAccess=async(...args)=>{saved=args;return{ok:true,detail:'Saved reporting grants'};};
 c.q('[data-r-open]').click();await tick();const f=c.q('[data-r-add]');assert.ok(f);f.querySelector('[name=subject]').value='p:alice';f.querySelector('[name=cap]').checked=true;f.requestSubmit(f.querySelector('button'));assert.match(c.root.textContent,/Export approved payroll/);assert.equal(c.calls.length,0);
 c.q('[data-r-review]').click();assert.equal(c.q('[data-r-save]').disabled,true);c.q('[data-r-accept]').checked=true;c.q('[data-r-accept]').dispatchEvent(new c.w.Event('change'));c.q('[data-r-save]').click();await tick();assert.equal(saved[0],1n);assert.equal(saved[1],3n);assert.equal(saved[2][0].projectId,7n);assert.equal(saved[2][0].subject.person,'alice');assert.equal(c.calls.length,0,'reporting UI must not promote the requester role');
 }finally{c.close();}});
