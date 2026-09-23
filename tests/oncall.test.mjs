import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
const names=['controller','owner','alpha','beta','employee'];
const identity=Object.fromEntries(names.map(n=>[n,createIdentity('oncall-foundation-'+n).getPrincipal()]));
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
 return{h,hub,desk,b,tokens,group,ids,refresh,conn};
}
const field={key:'order_id',title:'Order number',kind:'text',options:[],required:true,sensitive:false};
const input=(name='Alpha')=>({name,description:'Support for '+name,group:'Product Alpha',enabled:true,widgetEnabled:true,origins:['https://product.test'],fields:[field]});
async function project(d,t,name='Alpha'){const r=await d.saveCustomerProject(t,0n,0n,input(name));assert.equal(r.ok,true,r.detail);return(await d.listCustomerProjects(t)).find(p=>p.id===r.id);}
async function http(d,method,path,body,key,origin){const r=await d.http_request_update({method,url:'/support/v1/'+path,headers:[...(key?[['Authorization','Bearer '+key]]:[]),...(origin?[['Origin',origin]]:[])],body:Buffer.from(body===undefined?'':typeof body==='string'?body:JSON.stringify(body))});return{status:r.status_code,body:r.body.length?JSON.parse(Buffer.from(r.body).toString()):null,headers:r.headers};}
const payload=(p,extra={})=>({name:'External customer',email:'employee@customer.test',subject:'Product question',body:'Please help with the order',revision:Number(p.revision),clientToken:randomBytes(32).toString('hex'),fields:{order_id:'O-123'},...extra});
const create=async(d,p,body=payload(p))=>{const r=await http(d,'POST',`widgets/${p.widgetId}/tickets`,body,undefined,'https://product.test');assert.equal(r.status,201,JSON.stringify(r));return {...r.body,body};};
const filter={status:'',queue:'',assignee:'',q:'',view:'all'};

const unwrap=r=>{assert.ok(r.ok,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.ok;};
const newProject=async(ctx,scope={internal:'Product Alpha'})=>{const r=unwrap(await ctx.desk.createOncallProject(ctx.tokens.owner,'a1'.repeat(16),{name:'Operations',description:'Synthetic planning',services:['API'],scope}));return r.id;};
async function planInput(pic,pid,person){const startAt=BigInt(await pic.getTime())*1_000_000n+86_400_000_000_000n,endAt=startAt+7n*86_400_000_000_000n;return{projectId:pid,startAt,endAt,timezone:'Europe/Zurich',template:'weekly',layers:['Primary'],windows:[{startAt,endAt,layer:0n}],shifts:[{startAt,endAt,layer:0n,personId:person}]};}
async function draft(ctx,pic,pid,extra={}){const input={...await planInput(pic,pid,ctx.ids.alpha),...extra};const r=unwrap(await ctx.desk.saveOncallPlan(ctx.tokens.owner,0n,0n,'b1'.repeat(16),input));return{...r,input};}

test('on-call project and draft boundaries use Hub roles, customer scopes and fresh directory access',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),{desk:d,tokens:t}=c;const pid=await newProject(c),p=await draft(c,pic,pid);
 assert.equal((await d.oncallProjects(t.owner)).length,1);assert.equal((await d.oncallProjects(t.alpha)).length,1);assert.deepEqual(await d.oncallProjects(t.beta),[]);assert.deepEqual(await d.oncallProjects(t.employee),[]);assert.deepEqual(await d.oncallProjects(''),[]);
 assert.deepEqual(await d.oncallPlan(t.alpha,p.id),[],'draft hidden from ordinary participants');assert.deepEqual(await d.oncallWorkspace(t.beta,pid),[]);
 assert.ok((await d.createOncallProject(t.alpha,'bb'.repeat(16),{name:'Bypass',description:'',scope:{internal:'Product Alpha'},services:['API']})).err.denied===null);
 assert.ok((await d.saveOncallPlan(t.alpha,p.id,p.revision,'',p.input)).err.denied===null);
 unwrap(await d.publishOncallPlan(t.owner,p.id,p.revision,false));assert.equal((await d.oncallPlan(t.alpha,p.id))[0].plan.publication.length,1);
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,[],['alpha@customer.test']);await c.refresh();assert.deepEqual(await d.oncallWorkspace(t.alpha,pid),[]);assert.deepEqual(await d.oncallPlan(t.alpha,p.id),[]);
 assert.equal((await d.oncallPlan(t.owner,p.id))[0].issues[0].kind.unavailable,null,'revoked responder is an explicit coverage gap');
 const cp=await project(d,t.owner);const customerId=unwrap(await d.createOncallProject(t.owner,'cc'.repeat(16),{name:'Customer operations',description:'',scope:{customer:cp.id},services:['Product']})).id;
 assert.deepEqual(await d.oncallWorkspace(t.beta,customerId),[]);assert.ok((await d.oncallWorkspace(t.owner,customerId)).length);
 await pic.stopCanister({canisterId:c.h.canisterId,sender:identity.controller});await pic.advanceTime(61_000);await pic.tick(3);assert.deepEqual(await d.oncallProjects(t.owner),[],'stale directory fails closed');
 }finally{await pic.tearDown();}});

test('draft validation, idempotent create, gap review and publication revisions protect planning integrity',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),{desk:d,tokens:t}=c,pid=await newProject(c);assert.equal(await newProject(c),pid,'creation retry reuses project');
 const p=await draft(c,pic,pid);assert.equal((await draft(c,pic,pid,{...p.input})).id,p.id,'creation retry reuses plan');
 const invalid=async(extra)=>assert.ok((await d.saveOncallPlan(t.owner,p.id,p.revision,'',{...p.input,...extra})).err);
 await invalid({timezone:'Somewhere/Invalid'});await invalid({layers:[]});await invalid({windows:[...p.input.windows,...p.input.windows]});await invalid({shifts:[...p.input.shifts,...p.input.shifts]});await invalid({shifts:[{...p.input.shifts[0],personId:c.ids.beta}]});await invalid({shifts:[{...p.input.shifts[0],endAt:p.input.endAt+1n}]});await invalid({endAt:p.input.startAt+94n*86_400_000_000_000n});
 const gap={...p.input,shifts:[{...p.input.shifts[0],personId:''}]};unwrap(await d.saveOncallPlan(t.owner,p.id,p.revision,'',gap));assert.ok((await d.publishOncallPlan(t.owner,p.id,p.revision,false)).err.stale===null);
 let view=(await d.oncallPlan(t.owner,p.id))[0];assert.equal(view.issues.length,1);assert.ok((await d.publishOncallPlan(t.owner,p.id,view.plan.revision,false)).err.invalid);
 unwrap(await d.publishOncallPlan(t.owner,p.id,view.plan.revision,true));view=(await d.oncallPlan(t.owner,p.id))[0];assert.equal(view.plan.publication[0].acceptedGaps,true);
 assert.ok((await d.saveOncallPlan(t.owner,p.id,view.plan.revision,'',p.input)).err.invalid,'published snapshots cannot be rewritten');
 const overlapping=unwrap(await d.saveOncallPlan(t.owner,0n,0n,'b2'.repeat(16),p.input));assert.ok((await d.publishOncallPlan(t.owner,overlapping.id,overlapping.revision,false)).err.invalid);
 }finally{await pic.tearDown();}});

test('replacement needs recipient acceptance, rejects races and duplicates, and retains original evidence',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),{desk:d,tokens:t}=c;c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,['beta@customer.test'],[]);await c.refresh();const pid=await newProject(c),p=await draft(c,pic,pid);let revision=unwrap(await d.publishOncallPlan(t.owner,p.id,p.revision,false)).revision;
 const req=unwrap(await d.requestOncallCover(t.alpha,p.id,revision,0n,c.ids.beta,'Annual leave'));revision=req.revision;
 let view=(await d.oncallPlan(t.alpha,p.id))[0];assert.equal(view.swaps[0].state.pending,null);assert.equal(view.plan.input.shifts[0].personId,c.ids.alpha);assert.equal(view.swaps[0].toName,'beta');
 assert.ok((await d.decideOncallCover(t.owner,p.id,revision,req.id,{accept:null})).err.denied===null,'admin cannot impersonate consent');
 assert.ok((await d.requestOncallCover(t.alpha,p.id,revision,0n,c.ids.owner,'Duplicate')).err.invalid);
 const decisions=await Promise.all([d.decideOncallCover(t.beta,p.id,revision,req.id,{accept:null}),d.decideOncallCover(t.beta,p.id,revision,req.id,{accept:null})]);assert.equal(decisions.filter(x=>x.ok).length,1);assert.equal(decisions.filter(x=>x.err?.stale===null).length,1);
 view=(await d.oncallPlan(t.owner,p.id))[0];assert.equal(view.plan.input.shifts[0].personId,c.ids.alpha,'original planned assignment stays intact');assert.equal(view.swaps[0].state.accepted,null);
 assert.ok((await d.requestOncallCover(t.alpha,p.id,view.plan.revision,0n,c.ids.owner,'Not mine')).err.denied===null);
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,[],['beta@customer.test']);await c.refresh();view=(await d.oncallPlan(t.owner,p.id))[0];assert.equal(view.issues[0].kind.unavailable,null);assert.equal(view.swaps[0].state.accepted,null,'revocation does not rewrite historical consent');
 }finally{await pic.tearDown();}});

test('cover cannot double-book a layer or rewrite a shift after it starts',async()=>{const pic=await PocketIc.create(server.getUrl());try{
 const c=await setup(pic),{desk:d,tokens:t}=c;c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,['beta@customer.test'],[]);await c.refresh();
 const pid=await newProject(c),input=await planInput(pic,pid,c.ids.alpha);input.layers.push('Backup');input.windows.push({...input.windows[0],layer:1n});input.shifts.push({...input.shifts[0],layer:1n,personId:c.ids.beta});
 const p=await draft(c,pic,pid,input);let revision=unwrap(await d.publishOncallPlan(t.owner,p.id,p.revision,false)).revision;
 const req=unwrap(await d.requestOncallCover(t.alpha,p.id,revision,0n,c.ids.beta,'Need cover'));revision=req.revision;
 assert.ok((await d.decideOncallCover(t.beta,p.id,revision,req.id,{accept:null})).err.invalid,'backup cannot simultaneously take primary');
 revision=unwrap(await d.decideOncallCover(t.alpha,p.id,revision,req.id,{cancel:null})).revision;
 const later=unwrap(await d.requestOncallCover(t.alpha,p.id,revision,0n,c.ids.owner,'New request'));revision=later.revision;
 await pic.advanceTime(Number(input.startAt/1_000_000n)-await pic.getTime()+1000);await c.refresh();
 c.hub.setPrincipal(identity.owner);const renewed=await c.hub.mintAppTicket('',c.conn.tileId);t.owner=(await d.loginWithTicket(renewed.ticket))[0].token;
 assert.ok((await d.decideOncallCover(t.owner,p.id,revision,later.id,{accept:null})).err.invalid,'cannot backdate acceptance');
 assert.ok((await d.requestOncallCover(t.owner,p.id,revision,1n,c.ids.alpha,'Already started')).err.invalid);
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,[],['alpha@customer.test']);await c.refresh();
 const now=BigInt(await pic.getTime())*1_000_000n,view=(await d.oncallPlan(t.owner,p.id))[0];assert.equal(view.issues[0].kind.unavailable,null);assert.ok(view.issues[0].startAt>=now,'current ineligibility does not invent a past gap');
 await pic.advanceTime(Number(input.endAt/1_000_000n)-await pic.getTime()+1000);await c.refresh();
 // Sessions expire during the long time advance; renew through the real Hub ticket path.
 c.hub.setPrincipal(identity.owner);const ticket=await c.hub.mintAppTicket('',c.conn.tileId);const [session]=await d.loginWithTicket(ticket.ticket);
 assert.ok(session);assert.deepEqual((await d.oncallPlan(session.token,p.id))[0].issues,[],'past assignments are not recast using current membership');
 }finally{await pic.tearDown();}});

test('populated Desk upgrade preserves tickets, permissions and new planning history',{skip:!process.env.KEBAB_ONCALL_BASELINE},async()=>{const pic=await PocketIc.create(server.getUrl());try{
 process.env.KEBAB_CUSTOMER_BASELINE=process.env.KEBAB_ONCALL_BASELINE;const c=await setup(pic,true);let d=c.desk;const t=c.tokens;
 const typ=(await d.catalog(t.owner)).find(x=>!x.fields.length),internal=await d.createRequest(t.employee,typ.id,'Keep this request','Existing employee content',[]),cp=await project(d,t.owner),customer=await create(d,cp);assert.equal(internal.ok,true);
 const settings=(await d.getSettings(t.owner))[0],policy=await c.hub.getAppPermissions(c.conn.id);
 async function upgrade(){await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||resolve('desk/backend/dist/backend.wasm'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});d=pic.createActor(await idl(resolve('desk/backend/dist/backend.did')),c.b.canisterId);c.desk=d;await c.refresh();}
 await upgrade();assert.deepEqual(await d.oncallProjects(t.owner),[]);assert.equal((await d.getTicket(t.employee,internal.id))[0].ticket.body,'Existing employee content');assert.equal((await d.getTicket(t.alpha,BigInt(customer.id)))[0].customer[0].projectId,cp.id);assert.deepEqual(await d.getTicket(t.beta,BigInt(customer.id)),[]);
 assert.equal((await d.getSettings(t.owner))[0].appUrl,settings.appUrl);const afterPolicy=await c.hub.getAppPermissions(c.conn.id);for(const field of ['policy','revision','people','roles'])assert.deepEqual(afterPolicy[0][field],policy[0][field]);
 const pid=await newProject(c),plan=await draft(c,pic,pid);unwrap(await d.publishOncallPlan(t.owner,plan.id,plan.revision,false));const before=await d.oncallPlan(t.owner,plan.id);await upgrade();assert.deepEqual(await d.oncallPlan(t.owner,plan.id),before);assert.deepEqual(await d.listCustomerProjects(t.owner),[cp]);
 }finally{await pic.tearDown();}});
