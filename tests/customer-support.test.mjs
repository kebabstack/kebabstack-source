import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
const names=['controller','owner','alpha','beta','employee'];
const identity=Object.fromEntries(names.map(n=>[n,createIdentity('customer-project-'+n).getPrincipal()]));
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>server?.stop());
async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
async function install(pic,name,baseline=false){const dir=baseline?process.env.KEBAB_CUSTOMER_BASELINE:resolve(name,'backend/dist');return pic.setupCanister({sender:identity.controller,controllers:[identity.controller],wasm:name==='desk'&&!baseline&&process.env.KEBAB_CUSTOMER_WASM?process.env.KEBAB_CUSTOMER_WASM:dir+'/backend.wasm',idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ac'.repeat(32)}]:[]});}
async function setup(pic,baseline=false){
 const h=await install(pic,'hub'),hub=h.actor;hub.setPrincipal(identity.owner);assert.equal((await hub.claimHubWithCode('ac'.repeat(32),{email:'owner@customer.test',displayName:'Owner',orgName:'Customer tests'})).ok,true);
 for(const n of ['alpha','beta','employee']){hub.setPrincipal(identity.owner);await hub.addLocalUser(n+'@customer.test',n,'','');const[code]=await hub.createInvite(n+'@customer.test');hub.setPrincipal(identity[n]);await hub.claimInvite(code);}
 hub.setPrincipal(identity.owner);const ids={};for(const n of names.slice(1))ids[n]=(await hub.personCard(n+'@customer.test'))[0].pid;
 const group=(await hub.addGroup('Product Alpha','')).id;await hub.setGroupMembers(group,['alpha@customer.test'],[]);
 const b=await install(pic,'desk',baseline),desk=b.actor;desk.setPrincipal(identity.controller);await desk.setHub(h.canisterId.toText());
 const conn=await hub.connectApp({name:'desk',canisterId:b.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name:'Desk',kind:'app',url:'https://desk.customer.test'}]});
 const[policy]=await hub.getAppPermissions(conn.id);assert.equal((await hub.setAppPermissions(conn.id,policy.revision,{app:'desk',defaultRole:'member',people:['alpha','beta'].map(n=>({id:ids[n],role:'agent'})),groups:[]})).ok,true);
 const tokens={};for(const n of ['owner','alpha','beta','employee']){hub.setPrincipal(identity[n]);const ticket=await hub.mintAppTicket('',conn.tileId);const[s]=await desk.loginWithTicket(ticket.ticket);assert.ok(s,n);tokens[n]=s.token;}
 hub.setPrincipal(identity.owner);await desk.updateSettings(tokens.owner,{appUrl:'https://desk.customer.test',orgName:'Customers',agentGroup:'',adminGroup:'',keyPrefix:'SUP',autoCloseDays:7n});
 const refresh=async()=>{hub.setPrincipal(identity.owner);assert.equal((await hub.checkAppPermissions(conn.id)).ok,true);};
 return{hub,desk,b,tokens,group,ids,refresh,conn};
}
const field={key:'order_id',title:'Order number',kind:'text',options:[],required:true,sensitive:false};
const input=(name='Alpha')=>({name,description:'Support for '+name,group:'Product Alpha',enabled:true,widgetEnabled:true,origins:['https://product.test'],fields:[field]});
async function project(d,t,name='Alpha'){const r=await d.saveCustomerProject(t,0n,0n,input(name));assert.equal(r.ok,true,r.detail);return(await d.listCustomerProjects(t)).find(p=>p.id===r.id);}
async function http(d,method,path,body,key,origin){const r=await d.http_request_update({method,url:'/support/v1/'+path,headers:[...(key?[['Authorization','Bearer '+key]]:[]),...(origin?[['Origin',origin]]:[])],body:Buffer.from(body===undefined?'':typeof body==='string'?body:JSON.stringify(body))});return{status:r.status_code,body:r.body.length?JSON.parse(Buffer.from(r.body).toString()):null,headers:r.headers};}
const payload=(p,extra={})=>({name:'External customer',email:'employee@customer.test',subject:'Product question',body:'Please help with the order',revision:Number(p.revision),clientToken:randomBytes(32).toString('hex'),fields:{order_id:'O-123'},...extra});
const create=async(d,p,body=payload(p))=>{const r=await http(d,'POST',`widgets/${p.widgetId}/tickets`,body,undefined,'https://product.test');assert.equal(r.status,201,JSON.stringify(r));return {...r.body,body};};
const filter={status:'',queue:'',assignee:'',q:'',view:'all'};

test('projects enforce Hub teams for reads, every ticket mutation, assignment, context and customer identity',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const{desk:d,tokens:t,hub,group,refresh}=await setup(pic);const p=await project(d,t.owner),x=await create(d,p),id=BigInt(x.id);
 assert.equal((await d.listCustomerProjects(t.alpha)).length,1);assert.equal((await d.listCustomerProjects(t.beta)).length,0);assert.equal((await d.listCustomerProjects(t.employee)).length,0);
 assert.equal((await d.customerProjectTickets(t.alpha,p.id,filter)).length,1);assert.deepEqual(await d.customerProjectTickets(t.beta,p.id,filter),[]);assert.deepEqual(await d.listTickets(t.owner,filter),[]);assert.deepEqual(await d.myTickets(t.employee),[]);assert.equal((await d.stats(t.owner)).total,0n);
 assert.deepEqual(await d.getTicket(t.beta,id),[]);assert.deepEqual(await d.getTicket(t.employee,id),[]);assert.ok((await d.getTicket(t.alpha,id))[0].customer.length);
 assert.deepEqual(await d.personOverview(t.owner,id),[]);assert.deepEqual(await d.personContextSources(t.owner,id),[]);assert.ok((await d.personContext(t.owner,id,1n)).state.denied===null);
 for(const [method,args] of Object.entries({comment:['stolen reply'],addNote:['stolen note'],setStatus:['open',''],requesterSetStatus:['open'],assign:['beta@customer.test'],setQueue:['Other'],setPriority:['urgent'],setSubject:['Hacked','body'],setFields:[[]],setDue:[[]],addLink:['url','https://evil.test'],setTask:[0n,'done'],addTask:['Injected'],decideApproval:[true,'yes']})){const r=await d[method](t.beta,id,...args);assert.equal(r.ok,false,method);}
 assert.equal(await d.removeLink(t.beta,id,'url','x'),false);assert.equal((await d.addFile(t.beta,id,'x','text/plain',Buffer.from('x'))).ok,false);assert.equal((await d.aiSummary(t.beta,id)).ok,false);assert.equal((await d.aiDraft(t.beta,id,'x')).ok,false);
 assert.equal((await d.assign(t.alpha,id,'beta@customer.test')).ok,false);assert.equal((await d.assign(t.alpha,id,'alpha@customer.test')).ok,true);
 assert.equal((await d.setPriority(t.alpha,id,'high')).ok,true);assert.equal((await d.addNote(t.alpha,id,'PRIVATE INTERNAL NOTE')).ok,true);assert.equal((await d.comment(t.alpha,id,'Happy to help')).ok,true);
 const external=await http(d,'GET',`customer/tickets/${id}`,undefined,x.body.clientToken,'https://desk.customer.test');assert.equal(external.status,200);assert.equal(external.body.comments[0].author,'Support team');assert.ok(!JSON.stringify(external.body).includes('PRIVATE'));assert.ok(!JSON.stringify(external.body).includes('alpha@'));
 const leak=(await d.getTicket(t.alpha,id))[0];assert.equal(leak.requester.known,false,'matching employee email never becomes Hub identity');
 hub.setPrincipal(identity.owner);await hub.setGroupMembers(group,[],['alpha@customer.test']);await refresh();assert.deepEqual(await d.getTicket(t.alpha,id),[]);assert.equal((await d.comment(t.alpha,id,'Revoked')).ok,false);assert.ok((await d.getTicket(t.owner,id)).length);
 }finally{await pic.tearDown();}});

test('API keys have explicit project scopes, expiry and revocation; private links expose one conversation only',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const{desk:d,tokens:t}=await setup(pic),p=await project(d,t.owner),q=await project(d,t.owner,'Beta');
 assert.equal((await d.createCustomerKey(t.alpha,p.id,'Forbidden',['tickets:create'],90n)).ok,false);
 const k=await d.createCustomerKey(t.owner,p.id,'Product API',['tickets:create'],90n);assert.equal(k.ok,true);assert.equal(k.secret.length,64);assert.ok(!JSON.stringify(await d.customerProjectKeys(t.owner,p.id),(_,v)=>typeof v==='bigint'?String(v):v).includes(k.secret));
 const b=payload(p);let r=await http(d,'POST',`projects/${p.id}/tickets`,b,k.secret);assert.equal(r.status,201);const id=r.body.id;
 assert.equal((await http(d,'GET',`projects/${p.id}/tickets/${id}`,undefined,k.secret)).status,403);assert.equal((await http(d,'POST',`projects/${q.id}/tickets`,payload(q),k.secret)).status,401);assert.equal((await http(d,'POST',`projects/${p.id}/tickets`,b,k.secret,'https://product.test')).status,403);
 const reader=await d.createCustomerKey(t.owner,p.id,'Read',['tickets:read'],1n);assert.equal((await http(d,'GET',`projects/${p.id}/tickets/${id}`,undefined,reader.secret)).status,200);assert.equal((await http(d,'POST',`projects/${p.id}/tickets`,payload(p),reader.secret)).status,403);
 const x=await create(d,q);assert.equal((await http(d,'GET',`projects/${p.id}/tickets/${x.id}`,undefined,reader.secret)).status,404);assert.equal((await http(d,'GET',`customer/tickets/${x.id}`,undefined,b.clientToken)).status,404);
 const keys=await d.customerProjectKeys(t.owner,p.id);await d.revokeCustomerKey(t.owner,keys.find(x=>x.name==='Product API').id);assert.equal((await http(d,'POST',`projects/${p.id}/tickets`,payload(p),k.secret)).status,401);
 const replacement=await d.customerTicketLink(t.alpha,BigInt(id),false);assert.equal(replacement.ok,true);assert.equal((await http(d,'GET',`customer/tickets/${id}`,undefined,b.clientToken)).status,404);const cap=replacement.url.split('/').at(-1);assert.equal((await http(d,'GET',`customer/tickets/${id}`,undefined,cap)).status,200);await d.customerTicketLink(t.owner,BigInt(id),true);assert.equal((await http(d,'GET',`customer/tickets/${id}`,undefined,cap)).status,404);
 await pic.advanceTime(2*86400*1000);await pic.tick();assert.equal((await http(d,'GET',`projects/${p.id}/tickets/${id}`,undefined,reader.secret)).status,401);
 }finally{await pic.tearDown();}});

test('public intake validates schema, rejects malformed input, safely retries and enforces quotas',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const{desk:d,tokens:t}=await setup(pic),p=await project(d,t.owner),path=`widgets/${p.widgetId}/tickets`;
 const schema=await http(d,'GET',`widgets/${p.widgetId}/schema`,undefined,undefined,'https://product.test');assert.equal(schema.status,200);assert.deepEqual(schema.body.fields.map(f=>f.key),['order_id']);assert.ok(schema.headers.some(([k,v])=>k==='Access-Control-Allow-Origin'&&v==='https://product.test'));
 assert.equal((await http(d,'GET',`widgets/${p.widgetId}/schema`,undefined,undefined,'https://evil.test')).status,403);
 for(const b of [payload(p,{fields:{}}),payload(p,{fields:{order_id:'1',person:'employee@customer.test'}}),payload(p,{revision:999}),payload(p,{clientToken:'weak'}),payload(p,{assignee:'owner'}),payload(p,{body:'x'.repeat(8001)}),'['.repeat(20)+']'.repeat(20)]){assert.ok([400,409].includes((await http(d,'POST',path,b)).status));}
 assert.equal((await http(d,'POST',path,'x'.repeat(32001))).status,413);
 const b=payload(p),first=await create(d,p,b),retry=await http(d,'POST',path,b);assert.equal(retry.status,200);assert.equal(retry.body.id,first.id);assert.equal((await http(d,'POST',path,{...b,subject:'Different'})).status,409);
 const reply=await http(d,'POST',`customer/tickets/${first.id}/replies`,{body:'Customer follow-up',requestId:'ac'.repeat(32)},b.clientToken);assert.equal(reply.status,201);const again=await http(d,'POST',`customer/tickets/${first.id}/replies`,{body:'Customer follow-up',requestId:'ac'.repeat(32)},b.clientToken);assert.equal(again.status,200);assert.equal(again.body.comments.length,1);assert.equal((await http(d,'POST',`customer/tickets/${first.id}/replies`,{body:'Spam',requestId:'bd'.repeat(32)},b.clientToken)).status,429);
 for(let i=1;i<30;i++)await create(d,p);assert.equal((await http(d,'POST',path,payload(p))).status,429);
 const saved=await d.saveCustomerProject(t.owner,p.id,p.revision,{...input(),enabled:false});assert.equal(saved.ok,true);assert.equal((await http(d,'POST',path,payload(p))).status,404);assert.equal((await http(d,'GET',`customer/tickets/${first.id}`,undefined,b.clientToken)).status,200,'pause leaves existing conversations available');
 }finally{await pic.tearDown();}});

test('populated 0.10 Desk upgrade preserves employee tickets and new project boundaries survive another upgrade',{skip:!process.env.KEBAB_CUSTOMER_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const ctx=await setup(pic,true),{tokens:t,b}=ctx;let d=ctx.desk;const type=(await d.catalog(t.owner)).find(x=>!x.fields.length);const original=await d.createRequest(t.employee,type.id,'Original internal ticket','Preserve this',[]);assert.equal(original.ok,true);
 async function upgrade(){await pic.upgradeCanister({sender:identity.controller,canisterId:b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});d=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),b.canisterId);}
 await upgrade();assert.equal((await d.getTicket(t.employee,original.id))[0].ticket.body,'Preserve this');assert.deepEqual(await d.listCustomerProjects(t.owner),[]);const p=await project(d,t.owner),x=await create(d,p);await upgrade();assert.equal((await d.customerProjectTickets(t.alpha,p.id,filter)).length,1);assert.deepEqual(await d.getTicket(t.beta,BigInt(x.id)),[]);assert.equal((await http(d,'GET',`customer/tickets/${x.id}`,undefined,x.body.clientToken)).status,200);assert.equal((await d.myTickets(t.employee)).length,1);
 }finally{await pic.tearDown();}});

const privacyInput=(extra={})=>({completedDays:7n,inactiveDays:21n,noticeUrl:'https://company.test/privacy',...extra});
async function renew(ctx){for(const n of ['owner','alpha','beta','employee']){ctx.hub.setPrincipal(identity[n]);const ticket=await ctx.hub.mintAppTicket('',ctx.conn.tileId);const[s]=await ctx.desk.loginWithTicket(ticket.ticket);assert.ok(s,'renew '+n);ctx.tokens[n]=s.token;}ctx.hub.setPrincipal(identity.owner);}
async function retentionProject(ctx){const p=await project(ctx.desk,ctx.tokens.owner);assert.equal((await ctx.desk.saveCustomerPrivacy(ctx.tokens.owner,p.id,0n,privacyInput(),true)).ok,true);return(await ctx.desk.listCustomerProjects(ctx.tokens.owner)).find(x=>x.id===p.id);}
async function sweepTime(pic,ctx,days){await pic.advanceTime(days*86400*1000);await pic.tick(4);await renew(ctx);for(let i=0;i<3;i++){await pic.advanceTime(31000);await pic.tick(3);}await renew(ctx);}

test('privacy is administered centrally, changes require explicit confirmation, exports separate private notes, erasure blocks replays',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const ctx=await setup(pic),{desk:d,tokens:t}=ctx,p=await project(d,t.owner),x=await create(d,p),id=BigInt(x.id);
 assert.deepEqual(await d.customerPrivacy(t.alpha,p.id),[]);assert.equal((await d.saveCustomerPrivacy(t.alpha,p.id,0n,privacyInput(),true)).ok,false);
 assert.equal((await d.saveCustomerPrivacy(t.owner,p.id,0n,privacyInput(),false)).ok,false);assert.equal((await d.saveCustomerPrivacy(t.owner,p.id,0n,privacyInput({noticeUrl:'javascript:alert(1)'}),true)).ok,false);
 assert.equal((await d.saveCustomerPrivacy(t.owner,p.id,0n,privacyInput(),true)).ok,true);assert.equal((await d.saveCustomerPrivacy(t.owner,p.id,0n,privacyInput(),true)).ok,false,'stale privacy revision');
 await pic.tick(4);ctx.hub.setPrincipal(identity.owner);const notices=(await ctx.hub.listRecentNotifications()).filter(n=>n.fromApp==='desk');assert.ok(notices.length>0);assert.ok(notices.every(n=>n.title==='Customer support · New activity'&&n.url.endsWith('#/customers/'+p.id)),'Hub copies contain no customer content or individual ticket URLs');
 const current=(await d.listCustomerProjects(t.owner))[0];assert.equal(current.revision,p.revision+1n);const schema=await http(d,'GET',`widgets/${p.widgetId}/schema`);assert.equal(schema.body.privacy.completedDays,7);assert.equal(schema.body.privacy.noticeUrl,'https://company.test/privacy');
 assert.equal((await http(d,'POST',`widgets/${p.widgetId}/tickets`,payload(p))).status,409,'outdated notice cannot be silently submitted');
 await d.addNote(t.alpha,id,'PERSONAL PRIVATE NOTE');await d.addTask(t.alpha,id,'Customer-specific action');await d.addLink(t.alpha,id,'case','private-ref');
 const exported=JSON.parse((await d.exportCustomerTicket(t.owner,id))[0]);assert.equal(exported.contact.email,x.body.email);assert.ok(JSON.stringify(exported).includes('PERSONAL PRIVATE NOTE'));assert.ok(JSON.stringify(exported).includes('Customer-specific action'));assert.ok(!JSON.stringify(exported).includes(x.body.clientToken));assert.deepEqual(await d.exportCustomerTicket(t.alpha,id),[]);
 const publicExport=await http(d,'GET',`customer/tickets/${id}/export`,undefined,x.body.clientToken);assert.equal(publicExport.status,200);assert.equal(publicExport.body.contact.email,x.body.email);assert.ok(!JSON.stringify(publicExport.body).includes('PERSONAL PRIVATE NOTE'));assert.equal((await http(d,'GET',`customer/tickets/${id}/export`,undefined,'ff'.repeat(32))).status,404);
 let full=(await d.getTicket(t.owner,id))[0];assert.equal((await d.eraseCustomerTicket(t.alpha,id,full.ticket.updatedAt,full.ticket.key)).ok,false);assert.equal((await d.eraseCustomerTicket(t.owner,id,full.ticket.updatedAt,'WRONG')).ok,false);
 await d.comment(t.alpha,id,'New update before confirmation');assert.equal((await d.eraseCustomerTicket(t.owner,id,full.ticket.updatedAt,full.ticket.key)).ok,false,'stale confirmation protects new replies');
 full=(await d.getTicket(t.owner,id))[0];assert.equal((await d.eraseCustomerTicket(t.owner,id,full.ticket.updatedAt,full.ticket.key)).ok,true);
 assert.deepEqual(await d.getTicket(t.owner,id),[]);assert.deepEqual(await d.exportCustomerTicket(t.owner,id),[]);assert.equal((await http(d,'GET',`customer/tickets/${id}`,undefined,x.body.clientToken)).status,404);assert.equal((await http(d,'POST',`widgets/${p.widgetId}/tickets`,x.body)).status,409,'an erased create retry cannot recreate PII');
 const journal=JSON.parse((await d.customerErasureJournal(t.owner,p.id,0n,0n))[0]);assert.equal(journal.entries.length,1);assert.equal(journal.entries[0].reason,'request');assert.ok(!JSON.stringify(journal).includes(x.body.email));assert.ok(!JSON.stringify(journal).includes('PERSONAL'));assert.equal((await d.customerPrivacy(t.owner,p.id))[0].tickets,0n);
 }finally{await pic.tearDown();}});

test('background retention deletes completed and abandoned requests, honours expiring holds and preserves internal tickets',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const ctx=await setup(pic),{desk:d,tokens:t}=ctx,p=await retentionProject(ctx),done=await create(d,p),held=await create(d,p),open=await create(d,p),reopened=await create(d,p);
 const type=(await d.catalog(t.owner)).find(x=>!x.fields.length),internal=await d.createRequest(t.employee,type.id,'Keep employee ticket','Not customer retention',[]);assert.equal(internal.ok,true);
 for(const x of [done,held,reopened])assert.equal((await d.setStatus(t.alpha,BigInt(x.id),'resolved','')).ok,true);
 assert.equal((await d.holdCustomerTicket(t.alpha,BigInt(held.id),10n,'Contract dispute')).ok,false);assert.equal((await d.holdCustomerTicket(t.owner,BigInt(held.id),366n,'Contract dispute')).ok,false);assert.equal((await d.holdCustomerTicket(t.owner,BigInt(held.id),10n,'Contract dispute')).ok,true);
 let full=(await d.getTicket(t.owner,BigInt(held.id)))[0];assert.equal((await d.eraseCustomerTicket(t.owner,BigInt(held.id),full.ticket.updatedAt,full.ticket.key)).ok,false,'manual erasure respects hold');
 await sweepTime(pic,ctx,6);assert.ok((await d.getTicket(t.owner,BigInt(done.id))).length);assert.equal((await d.setStatus(t.alpha,BigInt(reopened.id),'open','')).ok,true);
 await sweepTime(pic,ctx,2);assert.deepEqual(await d.getTicket(t.owner,BigInt(done.id)),[]);assert.equal((await http(d,'GET',`customer/tickets/${done.id}`,undefined,done.body.clientToken)).status,404);
 assert.ok((await d.getTicket(t.owner,BigInt(held.id))).length);assert.ok((await d.getTicket(t.owner,BigInt(open.id))).length);assert.ok((await d.getTicket(t.owner,BigInt(reopened.id))).length);
 let state=(await d.customerPrivacy(t.owner,p.id))[0];assert.equal(state.tickets,3n);assert.equal(state.journalEntries,1n);assert.equal(state.held,1n);assert.ok(state.lastSweep>0n);
 await sweepTime(pic,ctx,3);assert.deepEqual(await d.getTicket(t.owner,BigInt(held.id)),[],'hold expires automatically');
 await sweepTime(pic,ctx,11);assert.deepEqual(await d.getTicket(t.owner,BigInt(open.id)),[],'never-resolved request expires');assert.ok((await d.getTicket(t.owner,BigInt(reopened.id))).length,'reopening starts inactivity clock');assert.ok((await d.getTicket(t.employee,internal.id)).length);
 state=(await d.customerPrivacy(t.owner,p.id))[0];assert.equal(state.tickets,1n);assert.equal(state.journalEntries,3n);
 }finally{await pic.tearDown();}});

test('populated customer upgrade keeps settings and holds; restored deleted records can be erased by a matching journal',{skip:!process.env.KEBAB_RETENTION_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const dir=process.env.KEBAB_CUSTOMER_BASELINE;process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_RETENTION_BASELINE;
 const ctx=await setup(pic,true);process.env.KEBAB_CUSTOMER_BASELINE=dir||'';
 let d=ctx.desk;const{tokens:t,b}=ctx,p=await project(d,t.owner),x=await create(d,p);await d.addNote(t.alpha,BigInt(x.id),'Legacy personal note');
 async function upgrade(){await pic.upgradeCanister({sender:identity.controller,canisterId:b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});d=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),b.canisterId);ctx.desk=d;}
 await upgrade();let state=(await d.customerPrivacy(t.owner,p.id))[0];assert.equal(state.policy.completedDays,90n);assert.ok(state.policy.graceUntil>0n);assert.equal(state.tickets,1n);const grace=state.policy.graceUntil;
 assert.equal((await d.saveCustomerPrivacy(t.owner,p.id,0n,privacyInput(),true)).ok,true);assert.equal((await d.holdCustomerTicket(t.owner,BigInt(x.id),30n,'Documented dispute')).ok,true);await upgrade();assert.equal((await d.customerPrivacy(t.owner,p.id))[0].policy.graceUntil,grace,'upgrades do not renew transition grace');assert.equal((await d.getTicket(t.owner,BigInt(x.id)))[0].customer[0].hold[0].reason,'Documented dispute');
 const full=(await d.getTicket(t.owner,BigInt(x.id)))[0],entry={ticketId:BigInt(x.id),projectId:p.id,createdAt:full.ticket.createdAt,deletedAt:full.ticket.createdAt+1n,reason:'request'};
 assert.equal((await d.replayCustomerErasures(t.alpha,b.canisterId.toText(),p.id,[entry])).ok,false);assert.equal((await d.replayCustomerErasures(t.owner,'aaaaa-aa',p.id,[entry])).ok,false);assert.equal((await d.replayCustomerErasures(t.owner,b.canisterId.toText(),p.id,[{...entry,createdAt:0n}])).ok,false);
 assert.equal((await d.replayCustomerErasures(t.owner,b.canisterId.toText(),p.id,[entry])).ok,true,'restore replay honours the prior erasure over an old hold');assert.equal((await d.replayCustomerErasures(t.owner,b.canisterId.toText(),p.id,[entry])).ok,true,'replay is idempotent');await upgrade();assert.deepEqual(await d.getTicket(t.owner,BigInt(x.id)),[]);assert.equal((await d.customerPrivacy(t.owner,p.id))[0].journalEntries,1n);
 }finally{await pic.tearDown();}});

test('expired tickets are inaccessible while a bounded deletion backlog still contains their records',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const ctx=await setup(pic),{desk:d,tokens:t}=ctx,p=await retentionProject(ctx),q=await retentionProject(ctx);let last;
 for(const project of [p,q])for(let i=0;i<26;i++){last=await create(d,project);assert.equal((await d.setStatus(t.alpha,BigInt(last.id),'resolved','')).ok,true);}
 await pic.advanceTime(8*86400*1000);await pic.tick(4);await renew(ctx);
 const states=await Promise.all([d.customerPrivacy(t.owner,p.id),d.customerPrivacy(t.owner,q.id)]);const stored=states.reduce((n,s)=>n+s[0].tickets,0n),due=states.reduce((n,s)=>n+s[0].due,0n);assert.ok(stored>0n&&stored<=2n,'a batch purges at most 50 records');assert.equal(stored,due);
 assert.deepEqual(await d.getTicket(t.owner,BigInt(last.id)),[]);assert.deepEqual(await d.customerProjectTickets(t.owner,q.id,filter),[]);assert.equal((await d.setStatus(t.owner,BigInt(last.id),'open','')).ok,false);assert.equal((await d.holdCustomerTicket(t.owner,BigInt(last.id),30n,'Too late')).ok,false);assert.equal((await d.customerTicketLink(t.owner,BigInt(last.id),false)).ok,false);assert.equal((await http(d,'GET',`customer/tickets/${last.id}`,undefined,last.body.clientToken)).status,404);assert.equal((await http(d,'POST',`widgets/${q.widgetId}/tickets`,last.body)).status,409);
 await pic.advanceTime(31000);await pic.tick(4);assert.equal((await d.customerPrivacy(t.owner,q.id))[0].tickets,0n);
 }finally{await pic.tearDown();}});

const workflowInput=(extra={})=>({name:'Refund request',description:'Review a purchase',enabled:true,fields:[field],priority:'high',respondH:8n,resolveH:72n,steps:[{name:'Support review',instructions:'PRIVATE REFUND POLICY',group:'',approval:false,checklist:['Verify order']},{name:'Finance approval',instructions:'PRIVATE FINANCE',group:'Finance',approval:true,checklist:[]},{name:'Refund confirmation',instructions:'Record the refund in the payment system',group:'',approval:false,checklist:['Customer informed']}],...extra});
async function saveWorkflow(d,t,p,id=0n,input=workflowInput()) {const latest=(await d.listCustomerProjects(t)).find(x=>x.id===p.id);const saved=await d.saveCustomerType(t,p.id,latest.revision,id,input);assert.equal(saved.ok,true,saved.detail);return{p:(await d.listCustomerProjects(t)).find(x=>x.id===p.id),w:(await d.listCustomerTypes(t,p.id)).find(x=>x.id===saved.id)};}

test('project request types enforce schema, scope, defaults, revision, visibility and immutable ticket definitions',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const{desk:d,tokens:t}=await setup(pic),a=await project(d,t.owner),b=await project(d,t.owner,'Beta');
 assert.equal((await d.saveCustomerType(t.alpha,a.id,a.revision,0n,workflowInput())).ok,false);assert.deepEqual(await d.listCustomerTypes(t.beta,a.id),[]);assert.deepEqual(await d.customerWorkflowTeams(t.alpha,a.id),[]);assert.equal((await d.customerWorkflowTeams(t.owner,a.id)).find(x=>x.name==='Product Alpha').eligible,1n);
 assert.equal((await d.saveCustomerType(t.owner,a.id,a.revision,0n,workflowInput({steps:Array.from({length:9},(_,i)=>({name:String(i),instructions:'',group:'',approval:false,checklist:[]}))}))).ok,false);
 let{p,w}=await saveWorkflow(d,t.owner,a);assert.equal((await d.saveCustomerType(t.owner,p.id,a.revision,0n,workflowInput({name:'Stale'}))).ok,false);
 assert.equal((await d.saveCustomerType(t.owner,b.id,b.revision,w.id,workflowInput())).ok,false);
 const schema=(await http(d,'GET',`widgets/${p.widgetId}/schema`)).body;assert.equal(schema.requestTypes.length,2);assert.equal(schema.defaultTypeId,Number(p.typeId));assert.equal(schema.fields[0].key,'order_id');assert.doesNotMatch(JSON.stringify(schema),/PRIVATE|Finance|steps|checklist|group/);
 assert.equal((await http(d,'POST',`widgets/${b.widgetId}/tickets`,payload(b,{typeId:Number(w.id)}))).status,400);
 assert.equal((await http(d,'POST',`widgets/${p.widgetId}/tickets`,payload(p,{typeId:Number(w.id),fields:{}}))).status,400);
 assert.equal((await http(d,'POST',`widgets/${p.widgetId}/tickets`,payload(p,{typeId:'bogus'}))).status,400);
 const x=await create(d,p,payload(p,{typeId:Number(w.id)})),id=BigInt(x.id),ticket=(await d.getTicket(t.alpha,id))[0];assert.equal(ticket.row.typeName,'Refund request');assert.equal(ticket.ticket.priority,'high');assert.equal(ticket.ticket.respondBy[0]-ticket.ticket.createdAt,8n*3600000000000n);assert.equal(ticket.customerWorkflow[0].run.definition.revision,1n);
 assert.ok(!(await d.adminCatalog(t.owner)).find(r=>r.id===w.id));assert.ok(!(await d.catalog(t.owner)).find(r=>r.id===w.id));assert.equal((await d.createRequest(t.owner,w.id,'Bypass','body',[])).ok,false);
 const updated=await saveWorkflow(d,t.owner,p,w.id,workflowInput({name:'Changed name',enabled:false,fields:[],steps:[]}));p=updated.p;
 const old=(await d.getTicket(t.alpha,id))[0];assert.equal(old.row.typeName,'Refund request');assert.equal(old.requestType[0].fields[0].key,'order_id');assert.equal(old.customerWorkflow[0].run.definition.steps[0].name,'Support review');
 assert.equal((await http(d,'POST',`widgets/${p.widgetId}/tickets`,x.body)).status,200,'exact retries survive configuration edits');assert.equal((await http(d,'POST',`widgets/${p.widgetId}/tickets`,payload(p,{typeId:Number(w.id)}))).status,400);
 const fallback=await create(d,p);assert.equal((await d.getTicket(t.alpha,BigInt(fallback.id)))[0].ticket.typeId,p.typeId);
 assert.equal((await d.saveCustomerType(t.owner,p.id,p.revision,p.typeId,workflowInput({enabled:false}))).ok,false);
 const renamed=await saveWorkflow(d,t.owner,p,p.typeId,workflowInput({name:'Default questions',fields:[],steps:[]}));
 assert.equal((await http(d,'GET',`widgets/${p.widgetId}/schema`)).body.fields.length,0);
 assert.equal((await d.saveCustomerProject(t.owner,p.id,renamed.p.revision,{...input(),fields:[field]})).ok,true);assert.equal((await http(d,'GET',`widgets/${p.widgetId}/schema`)).body.fields.length,0,'project settings cannot overwrite a configured default type');
 const external=(await http(d,'GET',`customer/tickets/${id}`,undefined,x.body.clientToken)).body;assert.equal(external.requestType.name,'Refund request');assert.doesNotMatch(JSON.stringify(external),/PRIVATE|Finance|checklist|instructions/);
 }finally{await pic.tearDown();}});

test('workflow execution enforces step ownership, required checks, explicit approval, concurrency and reasoned rework',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const ctx=await setup(pic),{desk:d,tokens:t,hub}=ctx,a=await project(d,t.owner);hub.setPrincipal(identity.owner);const finance=(await hub.addGroup('Finance','')).id;await hub.setGroupMembers(finance,['beta@customer.test'],[]);await ctx.refresh();
 const{p,w}=await saveWorkflow(d,t.owner,a),x=await create(d,p,payload(p,{typeId:Number(w.id)})),id=BigInt(x.id);
 const run=async()=> (await d.getTicket(t.owner,id))[0].customerWorkflow[0].run;
 const move=async(token,action,reason='')=>d.moveCustomerStep(token,id,(await run()).revision,action,reason);
 assert.equal((await d.moveCustomerStep(t.beta,id,0n,'advance','')).ok,false,'Finance alone never grants project access');
 assert.equal((await move(t.alpha,'advance')).ok,false,'required checks gate progress');
 assert.equal((await d.setStatus(t.owner,id,'resolved','')).ok,false);assert.equal((await d.setStatus(t.owner,id,'closed','')).ok,false);
 assert.equal((await d.checkCustomerStep(t.alpha,id,0n,0n,true)).ok,true);assert.equal((await d.moveCustomerStep(t.alpha,id,0n,'advance','')).ok,false,'stale action cannot advance twice');
 assert.equal((await move(t.alpha,'advance')).ok,true);assert.equal((await run()).step,1n);assert.equal((await d.getTicket(t.alpha,id))[0].customerWorkflow[0].canProgress,false);
 assert.equal((await move(t.alpha,'approve')).ok,false);assert.equal((await move(t.owner,'advance')).ok,false,'approval cannot be a regular next step');assert.equal((await move(t.owner,'back','')).ok,false);
 assert.equal((await move(t.owner,'back','Need a receipt')).ok,true);assert.deepEqual((await run()).checked,[false]);
 assert.equal((await d.checkCustomerStep(t.alpha,id,(await run()).revision,0n,true)).ok,true);assert.equal((await move(t.alpha,'advance')).ok,true);
 assert.equal((await move(t.owner,'approve')).ok,true);assert.equal((await run()).step,2n);
 await d.setStatus(t.alpha,id,'waiting','requester');await http(d,'POST',`customer/tickets/${id}/replies`,{body:'Here is the receipt',requestId:'ef'.repeat(32)},x.body.clientToken);assert.equal((await run()).step,2n,'customer replies never skip a step');
 assert.equal((await d.checkCustomerStep(t.alpha,id,(await run()).revision,0n,true)).ok,true);assert.equal((await move(t.alpha,'advance')).ok,true);assert.equal((await run()).outcome,'completed');assert.equal((await d.getTicket(t.alpha,id))[0].ticket.status,'resolved');
 assert.equal((await d.setStatus(t.owner,id,'open','')).ok,false,'reopening must reset the workflow');assert.equal((await move(t.alpha,'reopen','Customer has new information')).ok,true);assert.equal((await run()).step,0n);assert.deepEqual((await run()).checked,[false]);
 assert.equal((await move(t.alpha,'cancel','Not eligible under the policy')).ok,true);assert.equal((await run()).outcome,'cancelled');const publicView=(await http(d,'GET',`customer/tickets/${id}`,undefined,x.body.clientToken)).body;assert.equal(publicView.outcome,'cancelled');assert.doesNotMatch(JSON.stringify(publicView),/eligible|policy|approval/i);
 const review=JSON.parse((await d.exportCustomerTicket(t.owner,id))[0]);assert.equal(review.workflow.outcome,'cancelled');assert.ok(review.internalReviewOnly.some(e=>e.body.includes('approve')));
 const ticket=(await d.getTicket(t.owner,id))[0].ticket;assert.equal((await d.eraseCustomerTicket(t.owner,id,ticket.updatedAt,ticket.key)).ok,true);assert.deepEqual(await d.getTicket(t.owner,id),[]);assert.equal((await d.moveCustomerStep(t.owner,id,0n,'reopen','Try resurrecting')).ok,false);assert.equal((await http(d,'GET',`customer/tickets/${id}`,undefined,x.body.clientToken)).status,404);
 }finally{await pic.tearDown();}});

test('populated 0.12 upgrade preserves existing intake and workflow snapshots survive another upgrade',{skip:!process.env.KEBAB_WORKFLOW_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const previous=process.env.KEBAB_CUSTOMER_BASELINE;process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_WORKFLOW_BASELINE;let ctx;try{ctx=await setup(pic,true);}finally{process.env.KEBAB_CUSTOMER_BASELINE=previous;}
 let d=ctx.desk;const{tokens:t,b}=ctx,a=await project(d,t.owner),x=await create(d,a);await d.addNote(t.alpha,BigInt(x.id),'Preserve existing note');
 async function upgrade(){await pic.upgradeCanister({sender:identity.controller,canisterId:b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});d=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),b.canisterId);}
 await upgrade();assert.equal((await d.getTicket(t.alpha,BigInt(x.id)))[0].customerWorkflow.length,0);assert.equal((await d.setStatus(t.alpha,BigInt(x.id),'resolved','')).ok,true);assert.equal((await http(d,'POST',`widgets/${a.widgetId}/tickets`,x.body)).status,200);
 const{p,w}=await saveWorkflow(d,t.owner,a),y=await create(d,p,payload(p,{typeId:Number(w.id)}));await d.checkCustomerStep(t.alpha,BigInt(y.id),0n,0n,true);await d.moveCustomerStep(t.alpha,BigInt(y.id),1n,'advance','');await upgrade();const restored=(await d.getTicket(t.owner,BigInt(y.id)))[0];assert.equal(restored.customerWorkflow[0].run.step,1n);assert.equal(restored.customerWorkflow[0].run.definition.name,'Refund request');assert.equal((await d.moveCustomerStep(t.alpha,BigInt(y.id),2n,'approve','')).ok,false);assert.equal((await d.moveCustomerStep(t.owner,BigInt(y.id),2n,'approve','')).ok,true);assert.ok((await d.getTicket(t.alpha,BigInt(x.id)))[0].events.some(e=>e.body==='Preserve existing note'));
 }finally{await pic.tearDown();}});
