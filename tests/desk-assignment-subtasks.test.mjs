import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {PocketIcServer} from '@dfinity/pic';
import {setup,identity,key,unwrap,projectInput,taskInput} from './helpers/workboard.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
const fails=(r,kind)=>assert.ok(kind in (r.err||{}),JSON.stringify(r,(_,x)=>typeof x==='bigint'?String(x):x));
for(const baseline of [false,true])test(`assignment and subtasks: ${baseline?'populated 0.25 upgrade':'fresh install'}`,{skip:baseline&&!process.env.KEBAB_WORKBOARD_BASELINE},async()=>{
 const x=await setup(server.getUrl(),baseline);try{
 let d=x.apps.desk.app;
 const p=unwrap(await d.saveWorkProject(x.tokens.alpha,0n,0n,key(501),projectInput));
 const input=taskInput(p.id,x.ids.alpha),original=unwrap(await d.saveWorkTask(x.tokens.alpha,0n,0n,key(502),input));
 const ticketBefore=await d.getTicket(x.tokens.owner,x.ticketId);
 if(baseline)await x.upgrade();d=x.apps.desk.app;
 assert.deepEqual(await d.getTicket(x.tokens.owner,x.ticketId),ticketBefore);
 assert.equal((await d.workboardTask(x.tokens.alpha,original.id))[0].task.title,input.title);
 assert.deepEqual((await d.workboardTask(x.tokens.alpha,original.id))[0].subtasks,[]);
 const cfg=(await d.getAutoAssignment(x.tokens.owner))[0];assert.equal(cfg.config.defaultAssignee,'');assert.equal(cfg.config.overrides.length,0);
 for(const tok of [x.tokens.employee,x.tokens.alpha,'forged']){assert.deepEqual(await d.getAutoAssignment(tok),[]);assert.equal((await d.saveAutoAssignment(tok,{...cfg.config,defaultAssignee:x.ids.alpha})).ok,false);}
 assert.equal((await d.saveAutoAssignment(x.tokens.owner,{...cfg.config,defaultAssignee:x.ids.employee})).ok,false);
 const type=(await d.catalog(x.tokens.owner)).find(t=>!t.fields.length);const type2=await d.upsertType(x.tokens.owner,0n,{...type,name:'General question',checklist:[]});assert.ok(type2.ok,type2.detail);
 const save=async changes=>{const [c]=await d.getAutoAssignment(x.tokens.owner);const r=await d.saveAutoAssignment(x.tokens.owner,{...c.config,...changes});assert.ok(r.ok,r.detail);};
 await save({defaultAssignee:x.ids.alpha});assert.equal((await d.saveAutoAssignment(x.tokens.owner,cfg.config)).ok,false);
 const create=async(typeId=type.id)=>{const r=await d.agentCreate(x.tokens.owner,{typeId,subject:'Synthetic request',body:'Test only',fields:[],requester:'employee@workboard.test',priority:'normal',channel:'agent'});assert.ok(r.ok,r.detail);return(await d.getTicket(x.tokens.owner,r.id))[0];};
 let row=await create();assert.equal(row.ticket.assignee,x.ids.alpha);assert.match(row.events.find(e=>e.kind==='assign').body,/Desk default/);
 const manual=row.ticket.id;assert.ok((await d.assign(x.tokens.owner,manual,x.ids.beta)).ok);
 await save({overrides:[{typeId:type.id,assignee:x.ids.beta}]});assert.equal((await create()).ticket.assignee,x.ids.beta);assert.equal((await create(type2.id)).ticket.assignee,x.ids.alpha);
 await save({defaultAssignee:x.ids.owner});assert.equal((await d.getTicket(x.tokens.owner,manual))[0].ticket.assignee,x.ids.beta,'saving rules does not reassign existing tickets');
 await save({overrides:[{typeId:type.id,assignee:''}]});assert.equal((await create()).ticket.assignee,'','explicit unassigned exception');
 await save({defaultAssignee:x.ids.alpha,overrides:[{typeId:type.id,assignee:x.ids.beta}]});
 // Same rule applies to employee intake.
 const request=await d.createRequest(x.tokens.employee,type.id,'Employee request','',[]);assert.ok(request.ok,request.detail);assert.equal((await d.getTicket(x.tokens.owner,request.id))[0].ticket.assignee,x.ids.beta);
 // A customer project cannot inherit the internal owner or override policy.
 const cp=await d.saveCustomerProject(x.tokens.owner,0n,0n,{name:'Product support',description:'Synthetic',group:'IT Operations',enabled:true,widgetEnabled:true,origins:['https://product.test'],fields:[]});assert.ok(cp.ok,cp.detail);
 const proj=(await d.listCustomerProjects(x.tokens.owner)).find(p=>p.id===cp.id);
 const response=await d.http_request_update({method:'POST',url:`/support/v1/widgets/${proj.widgetId}/tickets`,headers:[['Origin','https://product.test']],body:Buffer.from(JSON.stringify({name:'Example buyer',email:'buyer@example.test',subject:'Product question',body:'Help please',revision:Number(proj.revision),clientToken:'fe'.repeat(32),fields:{}}))});
 assert.equal(response.status_code,201,Buffer.from(response.body).toString());const customer=BigInt(JSON.parse(Buffer.from(response.body)).id);assert.equal((await d.getTicket(x.tokens.owner,customer))[0].ticket.assignee,'');
 // Revoked override falls back; disabled default leaves work unassigned, visibly.
 await x.policy('desk',[{id:x.ids.alpha,role:'agent'}]);row=await create();assert.equal(row.ticket.assignee,x.ids.alpha);assert.match(row.events.find(e=>e.kind==='assign').body,/unavailable; using Desk default/);assert.equal((await d.autoAssignmentHealth(x.tokens.owner)).length,1);
 x.hub.setPrincipal(identity.owner);await x.hub.setLocalUserActive('alpha@workboard.test',false);await x.refresh();row=await create();assert.equal(row.ticket.assignee,'');assert.match(row.events.find(e=>e.kind==='assign').body,/left unassigned/);assert.equal((await d.autoAssignmentHealth(x.tokens.owner)).length,2);
 // Directory-created review uses the same fallback without needing an HR ticket.
 await save({defaultAssignee:x.ids.owner,overrides:[]});assert.ok(await d.syncLifecycle(x.tokens.owner));
 x.hub.setPrincipal(identity.owner);await x.hub.setLocalUserActive('employee@workboard.test',false);await x.refresh();assert.ok(await d.syncLifecycle(x.tokens.owner));
 const reviews=await d.listTickets(x.tokens.owner,{status:'',queue:'',assignee:'',q:'Account deactivated',view:'all'});assert.ok(reviews.length);assert.ok(reviews.every(t=>t.assignee===x.ids.owner||t.assignee===''),'only new follow-ups use the updated default');assert.ok(reviews.some(t=>t.assignee===x.ids.owner));
 x.hub.setPrincipal(identity.owner);await x.hub.setLocalUserActive('alpha@workboard.test',true);await x.hub.setLocalUserActive('employee@workboard.test',true);await x.policy('desk',[{id:x.ids.alpha,role:'agent'},{id:x.ids.beta,role:'agent'}]);
 x.tokens.alpha=await x.login('desk','alpha');x.tokens.employee=await x.login('desk','employee');
 const children=[{id:0n,title:'Check room A',done:true},{id:0n,title:'Check room B',done:false}];
 fails(await d.saveWorkTaskWithSubtasks(x.tokens.employee,original.id,original.revision,key(503),input,children),'denied');fails(await d.saveWorkTaskWithSubtasks(x.tokens.beta,original.id,original.revision,key(503),input,children),'denied');
 let result=unwrap(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,original.revision,key(503),input,children));let detail=(await d.workboardTask(x.tokens.alpha,original.id))[0];assert.equal(detail.task.subtaskCount,2n);assert.equal(detail.task.subtasksDone,1n);assert.ok(detail.subtasks.every(s=>s.id>0n));
 fails(await d.saveWorkTask(x.tokens.alpha,original.id,result.revision,key(504),{...input,column:{done:null}}),'invalid');
 fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,original.revision,key(504),input,children),'stale');
 fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,result.revision,key(504),input,[{id:99999n,title:'Forged',done:false}]),'invalid');
 fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,result.revision,key(504),input,[detail.subtasks[0],detail.subtasks[0]]),'invalid');
 fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,result.revision,key(504),input,[{id:0n,title:' ',done:false}]),'invalid');
 fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,result.revision,key(504),input,Array.from({length:51},()=>children[0])),'invalid');
 const complete=detail.subtasks.map(s=>({...s,done:true}));result=unwrap(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,result.revision,key(505),{...input,column:{done:null}},complete));
 fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,result.revision,key(506),{...input,column:{done:null}},[...complete,{id:0n,title:'New step',done:false}]),'invalid');
 const created=unwrap(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,0n,0n,key(507),input,children));assert.deepEqual(unwrap(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,0n,0n,key(507),input,children)),created);fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,0n,0n,key(507),input,[]),'stale');
 // Archive / restore and a second upgrade retain the whole subtask list and rules.
 let archived=unwrap(await d.archiveWorkTask(x.tokens.alpha,original.id,result.revision,true));fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,archived.revision,key(508),input,complete),'invalid');unwrap(await d.archiveWorkTask(x.tokens.alpha,original.id,archived.revision,false));
 const before=await d.workboardTask(x.tokens.alpha,original.id),rules=(await d.getAutoAssignment(x.tokens.owner))[0].config;await x.upgrade();d=x.apps.desk.app;assert.deepEqual(await d.workboardTask(x.tokens.alpha,original.id),before);assert.deepEqual((await d.getAutoAssignment(x.tokens.owner))[0].config,rules);
 x.hub.setPrincipal(identity.owner);await x.hub.setGroupMembers(x.group,[],['alpha@workboard.test']);await x.refresh();assert.deepEqual(await d.workboardTask(x.tokens.alpha,original.id),[]);fails(await d.saveWorkTaskWithSubtasks(x.tokens.alpha,original.id,before[0].task.revision,key(509),input,complete),'denied');
 // Stale directory cannot configure automation or expose/check off project work.
 await x.pic.stopCanister({sender:identity.controller,canisterId:x.h.canisterId});await x.pic.advanceTime(61000);await x.pic.tick(3);assert.deepEqual(await d.getAutoAssignment(x.tokens.owner),[]);assert.deepEqual(await d.workboardTask(x.tokens.owner,original.id),[]);assert.equal((await d.saveAutoAssignment(x.tokens.owner,rules)).ok,false);
 }finally{await x.pic.tearDown();}
});
