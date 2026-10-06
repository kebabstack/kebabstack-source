import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {resolve} from 'node:path';
import {PocketIc,PocketIcServer} from '@dfinity/pic';
import {setup,identity,idl} from './helpers/oncall.mjs';
let server;before(async()=>server=await PocketIcServer.start());after(async()=>server?.stop());
const schema=JSON.stringify({v:1,askName:'optional',askEmail:'required',sections:[{id:1,questions:[{id:1,type:'short',title:'Resource',req:true},{id:2,type:'choice',title:'Reason',opts:['Mistake','Other'],req:true}]}]});
const answers=JSON.stringify({1:'product.example.test',2:'Mistake'});
const request=n=>n.toString(16).padStart(64,'0');
async function fixture(){
 const pic=await PocketIc.create(server.getUrl());const x=await setup(pic);x.pic=pic;
 const installed=await pic.setupCanister({sender:identity.controller,controllers:[identity.controller],wasm:resolve('forms/backend/dist/backend.wasm'),idlFactory:await idl(resolve('forms/backend/dist/backend.did'))});x.f=installed.actor;x.installed=installed;x.f.setPrincipal(identity.controller);await x.f.setHub(x.h.canisterId.toText());x.hub.setPrincipal(identity.owner);
 const conn=await x.hub.connectApp({name:'forms',canisterId:installed.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Forms',kind:'app',url:'https://forms.example.test'}]});assert.ok(conn.ok);
 const p=(await x.hub.getAppPermissions(conn.id))[0];assert.ok((await x.hub.setAppPermissions(conn.id,p.revision,{app:'forms',defaultRole:'member',people:[],groups:[]})).ok);
 const login=async who=>{x.hub.setPrincipal(identity[who]);const ticket=await x.hub.mintAppTicket('',conn.tileId);return(await x.f.loginWithTicket(ticket.ticket))[0].token;};x.owner=await login('owner');x.employee=await login('employee');
 x.form=(await x.f.createForm(x.owner,'Suspension appeal'))[0];assert.ok((await x.f.updateForm(x.owner,x.form.id,{title:'Suspension appeal',description:'Synthetic test',schema,allowEdit:false,cap:0n})).ok);
 assert.ok((await x.f.saveIntake(x.owner,x.form.id,0n,['https://product.example.test'],['domain'],'https://example.test/privacy',7n)).ok);
 assert.ok((await x.f.setFormStatus(x.owner,x.form.id,{open:null})).ok);
 x.submit=(n,body=answers,ctx=[['domain','product.example.test']],mail='external@example.test')=>x.f.submitIntake(x.form.slug,'Alex',mail,body,request(n),ctx,'');
 return x;
}
test('public intake validates server-side, rejects legacy bypass, protects settings and deduplicates exact retries',async()=>{const x=await fixture();try{
 const {f,form,owner,employee}=x;
 assert.equal((await f.saveIntake(employee,form.id,1n,[],[],'',0n)).ok,false);
 assert.deepEqual(await f.getIntake(employee,form.id),[]);
 assert.ok((await f.setShares(owner,form.id,[['employee@customer.test','editor']])).ok);
 assert.equal((await f.saveIntake(employee,form.id,1n,[],[],'',0n)).ok,false,'editor cannot disable deletion policy');
 assert.ok((await f.setShares(owner,form.id,[])).ok);
 assert.equal((await f.submitPublic(form.slug,'Alex','external@example.test',answers,request(1))).ok,false);
 assert.equal((await x.submit(1,'{}')).ok,false);assert.equal((await x.submit(1,answers,[],'bad')).ok,false);
 assert.equal((await x.submit(1,answers,[['secret','private']])).ok,false);
 assert.equal((await x.submit(1,JSON.stringify({1:'example',2:'Unknown'}))).ok,false);
 assert.equal((await f.submitIntake(form.slug,'Alex','external@example.test',answers,request(1),[],'spam')).ok,false);
 const first=await x.submit(1);assert.ok(first.ok,first.detail);assert.equal((await x.submit(1)).num,first.num);
 assert.equal((await x.submit(1,JSON.stringify({1:'different',2:'Mistake'}))).ok,false);
 const rows=await f.listSubmissions(owner,form.id);assert.equal(rows.length,1);assert.deepEqual(await f.submissionContext(employee,rows[0].id),[]);
 assert.deepEqual(await f.mySubmission(form.slug,request(1)),[],'editing disabled also denies retrieval');
 assert.ok((await f.deleteSubmission(owner,rows[0].id)).ok);assert.deepEqual(await f.submissionContext(owner,rows[0].id),[]);
 assert.ok((await x.submit(1)).ok);assert.equal((await f.listSubmissions(owner,form.id)).length,0,'receipt prevents recreation after deletion');
 }finally{await x.pic.tearDown();}});
test('Forms to Desk is caller-scoped, durable, private and survives populated upgrades without duplicate tickets',async()=>{const x=await fixture();try{
 const d=x.desk;const p=await d.saveCustomerProject(x.tokens.owner,0n,0n,{name:'Appeals',description:'Synthetic',group:'Product Alpha',enabled:true,widgetEnabled:false,origins:[],fields:[]});assert.ok(p.ok,p.detail);
 const project=(await d.listCustomerProjects(x.tokens.owner)).find(item=>item.id===p.id);assert.ok(project);
 assert.equal((await d.addFormsSource(x.tokens.employee,project.id,project.typeId,x.form.id,x.installed.canisterId.toText())).ok,false);
 const source=await d.addFormsSource(x.tokens.owner,project.id,project.typeId,x.form.id,x.installed.canisterId.toText());assert.ok(source.ok,source.detail);
 assert.deepEqual(await d.formsSourceInfo(source.ticketId,x.form.id),[]);
 assert.equal((await d.receiveForms(source.ticketId,x.form.id,1n,'{}')).ok,false);
 assert.equal((await x.f.connectDesk(x.employee,x.form.id,x.b.canisterId.toText(),source.ticketId)).ok,false);
 assert.ok((await x.f.connectDesk(x.owner,x.form.id,x.b.canisterId.toText(),source.ticketId)).ok);
 assert.ok((await x.submit(2)).ok);const [sub]=await x.f.listSubmissions(x.owner,x.form.id);
 await x.pic.upgradeCanister({sender:identity.controller,canisterId:x.installed.canisterId,wasm:resolve('forms/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 await x.pic.advanceTime(61000);await x.pic.tick(20);
 let delivery=(await x.f.deliveryStatus(x.owner,sub.id))[0];assert.equal(delivery.state,'delivered',delivery.detail);assert.ok(delivery.ticketId>0n);assert.ok(!delivery.url.includes('token'));
 const ticket=(await d.getTicket(x.tokens.alpha,delivery.ticketId))[0];assert.ok(ticket);assert.equal(ticket.ticket.channel,'forms');assert.match(delivery.url,/\/#\/t\/\d+$/);assert.equal((await x.f.setSubmissionStatus(x.owner,sub.id,{accepted:null})).ok,false,'Desk owns the workflow');assert.match(ticket.ticket.body,/unverified/);assert.match(ticket.ticket.body,/product.example.test/);
 assert.deepEqual(await d.getTicket(x.tokens.employee,delivery.ticketId),[]);
 assert.deepEqual(await x.f.deliveryStatus(x.employee,sub.id),[]);
 assert.ok((await x.submit(2)).ok);
 for(const [name,cid] of [['forms',x.installed.canisterId],['desk',x.b.canisterId]])await x.pic.upgradeCanister({sender:identity.controller,canisterId:cid,wasm:resolve(name,'backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
 await x.pic.advanceTime(61000);await x.pic.tick(12);
 assert.equal((await d.customerProjectTickets(x.tokens.owner,project.id,{view:'all',status:'',queue:'',assignee:'',q:''})).length,1);
 assert.equal((await x.f.deliveryStatus(x.owner,sub.id))[0].ticketId,delivery.ticketId);
 d.setPrincipal(x.installed.canisterId);
 const probe=JSON.stringify({name:'External probe',email:'probe@example.test',subject:'Deletion check',body:'Synthetic',clientToken:'bc'.repeat(32)});
 assert.deepEqual(await d.formsSourceInfo(source.ticketId,x.form.id+1n),[]);
 const native=await d.receiveForms(source.ticketId,x.form.id,9000n,probe);assert.ok(native.ok,native.detail);
 assert.equal((await d.receiveForms(source.ticketId,x.form.id,9000n,probe)).ticketId,native.ticketId);
 const [erasing]=await d.getTicket(x.tokens.owner,native.ticketId);assert.ok((await d.eraseCustomerTicket(x.tokens.owner,native.ticketId,erasing.ticket.updatedAt,erasing.ticket.key)).ok);
 assert.equal((await d.receiveForms(source.ticketId,x.form.id,9000n,probe)).ok,false,'erased native delivery cannot recreate the ticket');
 assert.ok(await x.f.pauseDesk(x.owner,x.form.id));assert.ok((await x.submit(3)).ok);await x.pic.advanceTime(61000);await x.pic.tick(12);assert.equal((await d.customerProjectTickets(x.tokens.owner,project.id,{view:'all',status:'',queue:'',assignee:'',q:''})).length,1);
 }finally{await x.pic.tearDown();}});

test('committed release upgrades preserve responses; retention stays off until configured and respects grace',{skip:!process.env.KEBAB_FORMS_BASELINE},async()=>{
 const x=await fixture();try{
  // Install the committed release separately and seed real legacy content before upgrade.
  const dir=process.env.KEBAB_FORMS_BASELINE;
  const c=await x.pic.setupCanister({sender:identity.controller,controllers:[identity.controller],wasm:resolve(dir,'backend.wasm'),idlFactory:await idl(resolve(dir,'backend.did'))});
  c.actor.setPrincipal(identity.controller);await c.actor.setHub(x.h.canisterId.toText());x.hub.setPrincipal(identity.owner);
  const conn=await x.hub.connectApp({name:'legacy forms',canisterId:c.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Forms legacy',kind:'app',url:'https://legacy.example.test'}]});assert.ok(conn.ok);
  const policy=(await x.hub.getAppPermissions(conn.id))[0];assert.ok((await x.hub.setAppPermissions(conn.id,policy.revision,{app:'forms',defaultRole:'member',people:[],groups:[]})).ok);
  const login=async()=>{x.hub.setPrincipal(identity.owner);const t=await x.hub.mintAppTicket('',conn.tileId);return(await c.actor.loginWithTicket(t.ticket))[0].token;};let tok=await login();
  const form=(await c.actor.createForm(tok,'Legacy response'))[0];assert.ok((await c.actor.setFormStatus(tok,form.id,{open:null})).ok);assert.ok((await c.actor.submitPublic(form.slug,'Legacy','old@example.test','{"q":"preserve"}','a'.repeat(64))).ok);
  const before=await c.actor.listSubmissions(tok,form.id);
  await x.pic.upgradeCanister({sender:identity.controller,canisterId:c.canisterId,wasm:resolve('forms/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  c.actor=x.pic.createActor(await idl(resolve('forms/backend/dist/backend.did')),c.canisterId);
  assert.deepEqual(await c.actor.listSubmissions(tok,form.id),before);
  assert.equal((await c.actor.getIntake(tok,form.id))[0].retentionDays,0n,'upgrade never enables erasure');
  assert.ok((await c.actor.saveIntake(tok,form.id,0n,[],[],'',7n)).ok);
  await x.pic.advanceTime(6*86400000);await x.pic.tick(10);tok=await login();assert.equal((await c.actor.listSubmissions(tok,form.id)).length,1);
  await x.pic.advanceTime(2*86400000);await x.pic.tick(10);tok=await login();assert.equal((await c.actor.listSubmissions(tok,form.id)).length,0);
 }finally{await x.pic.tearDown();}
});
