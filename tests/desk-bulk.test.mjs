import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {PocketIcServer} from '@dfinity/pic';
import {setup,identity} from './helpers/workboard.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
const filter={view:'all',status:'',queue:'',assignee:'',q:''};
for(const baseline of [false,true])test(`internal bulk: ${baseline?'populated production upgrade':'fresh install'}`,{skip:baseline&&!process.env.KEBAB_WORKBOARD_BASELINE},async()=>{
 const x=await setup(server.getUrl(),baseline);try{
  const original=(await x.apps.desk.app.getTicket(x.tokens.owner,x.ticketId))[0];
  if(baseline)await x.upgrade();const d=x.apps.desk.app;
  assert.deepEqual((await d.getTicket(x.tokens.owner,x.ticketId))[0],original);
  const get=async id=>(await d.getTicket(x.tokens.owner,id))[0];
  const target=async id=>{const f=await get(id);return {id,updatedAt:f.ticket.updatedAt};};
  const apply=async(ids,action,tok=x.tokens.alpha)=>d.bulkInternalTickets(tok,await Promise.all(ids.map(target)),action);
  const rt=(await d.catalog(x.tokens.owner)).find(t=>!t.fields.length);
  const makeType=async patch=>{const r=await d.upsertType(x.tokens.owner,0n,{...rt,name:'Bulk verification',checklist:[],...patch});assert.ok(r.ok,r.detail);return r.id;};
  const typeId=await makeType({});
  const create=async (type=typeId,subject='Bulk fixture')=>{const r=await d.agentCreate(x.tokens.owner,{typeId:type,subject,body:'Synthetic only',fields:[],requester:'employee@workboard.test',priority:'normal',channel:'agent'});assert.ok(r.ok,r.detail);return r.id;};
  const a=await create(),b=await create(),ids=[a,b];
  for(const token of ['', 'forged',x.tokens.employee]){assert.deepEqual(await d.internalQueuePage(token,filter,[]),[]);assert.ok('denied'in await apply(ids,{assign:x.ids.alpha},token));}
  const before=await get(a),ta=await target(a);
  assert.ok('invalid'in await d.bulkInternalTickets(x.tokens.owner,[ta,ta],{assign:x.ids.alpha}));
  assert.ok('invalid'in await d.bulkInternalTickets(x.tokens.owner,Array.from({length:51},(_,i)=>({id:BigInt(i+1),updatedAt:0n})),{assign:x.ids.alpha}));
  assert.ok('invalid'in await apply(ids,{status:{status:'done',waitingOn:''}}));
  assert.ok('invalid'in await apply(ids,{status:{status:'waiting',waitingOn:'approval'}}));
  assert.ok('invalid'in await apply(ids,{due:[-1n]}));assert.deepEqual(await get(a),before);
  let r=await apply(ids,{assign:x.ids.employee});assert.ok(r.ok.every(x=>'skipped'in x.result));
  r=await apply(ids,{assign:x.ids.alpha});assert.ok(r.ok.every(x=>'updated'in x.result));assert.equal((await get(a)).ticket.assignee,x.ids.alpha);
  r=await apply(ids,{assign:x.ids.alpha});assert.ok(r.ok.every(x=>'unchanged'in x.result));
  r=await apply(ids,{assign:x.ids.beta});assert.ok(r.ok.every(x=>'updated'in x.result));
  const date=BigInt(Date.parse('2026-10-05T00:00:00Z'))*1000000n;
  const retryTargets=await Promise.all(ids.map(target));r=await d.bulkInternalTickets(x.tokens.alpha,retryTargets,{due:[date]});assert.ok(r.ok.every(x=>'updated'in x.result));assert.deepEqual((await get(a)).ticket.dueAt,[date]);
  const afterDate=await get(a);await d.bulkInternalTickets(x.tokens.alpha,retryTargets,{due:[date]});assert.deepEqual(await get(a),afterDate,'retry cannot duplicate history');
  assert.ok((await apply(ids,{due:[]})).ok.every(x=>'updated'in x.result));
  const old=await target(a);await d.assign(x.tokens.owner,a,x.ids.owner);
  r=await d.bulkInternalTickets(x.tokens.alpha,[old,await target(b)],{status:{status:'waiting',waitingOn:'requester'}});
  assert.match(r.ok[0].result.skipped,/changed/);assert.ok('updated'in r.ok[1].result);assert.equal((await get(a)).ticket.assignee,x.ids.owner);
  const tasks=await create(await makeType({checklist:['Verify access removal']}));
  const approval=await create(await makeType({approval:'group:IT Operations'}));
  r=await apply([tasks,approval,b],{status:{status:'resolved',waitingOn:''}});assert.match(r.ok[0].result.skipped,/checklist/);assert.match(r.ok[1].result.skipped,/approval/);assert.ok('updated'in r.ok[2].result);
  r=await apply([approval],{status:{status:'closed',waitingOn:''}});assert.ok('updated'in r.ok[0].result);assert.equal((await get(approval)).approval[0].state,'cancelled');
  const cp=await d.saveCustomerProject(x.tokens.owner,0n,0n,{name:'Separate product',description:'Synthetic',group:'IT Operations',enabled:true,widgetEnabled:true,origins:['https://product.test'],fields:[]});assert.ok(cp.ok,cp.detail);
  const project=(await d.listCustomerProjects(x.tokens.owner)).find(p=>p.id===cp.id);
  const response=await d.http_request_update({method:'POST',url:`/support/v1/widgets/${project.widgetId}/tickets`,headers:[['Origin','https://product.test']],body:Buffer.from(JSON.stringify({name:'Example buyer',email:'buyer@example.test',subject:'Private customer request',body:'Help',revision:Number(project.revision),clientToken:'af'.repeat(32),fields:{}}))});assert.equal(response.status_code,201);const customer=BigInt(JSON.parse(Buffer.from(response.body)).id);
  const customerBefore=await get(customer);r=await apply([customer],{due:[date]},x.tokens.owner);assert.match(r.ok[0].result.skipped,/unavailable/);assert.deepEqual(await get(customer),customerBefore);
  // Selection crosses the first page without silently stopping at the old 500-row UI cap.
  for(let i=0;i<501;i++)await create(typeId,'Paging fixture '+i);
  const f={...filter,q:'Paging fixture'},first=(await d.internalQueuePage(x.tokens.alpha,f,[]))[0];assert.equal(first.total,501n);assert.equal(first.rows.length,100);assert.equal(first.next.length,1);
  const pages=[...first.rows];let cursor=first.next;while(cursor.length){const page=(await d.internalQueuePage(x.tokens.alpha,f,cursor))[0];assert.ok(page.rows.length<=100);pages.push(...page.rows);cursor=page.next;}assert.equal(new Set(pages.map(r=>String(r.id))).size,501);
  assert.ok(!(await d.internalQueuePage(x.tokens.owner,filter,[]))[0].rows.some(r=>r.id===customer));
  const saved=await get(a);await x.upgrade();assert.deepEqual((await x.apps.desk.app.getTicket(x.tokens.owner,a))[0],saved);
  x.hub.setPrincipal(identity.lunch);assert.deepEqual(await x.hub.team_members(),x.lunch);
  await x.policy('desk',[{id:x.ids.beta,role:'agent'}]);assert.ok('denied'in await x.apps.desk.app.bulkInternalTickets(x.tokens.alpha,[await target(a)],{assign:x.ids.beta}));
  await x.pic.stopCanister({sender:identity.controller,canisterId:x.h.canisterId});await x.pic.advanceTime(61000);await x.pic.tick(3);assert.ok('denied'in await x.apps.desk.app.bulkInternalTickets(x.tokens.owner,[ta],{due:[]}));
 }finally{await x.pic.tearDown();}
});
