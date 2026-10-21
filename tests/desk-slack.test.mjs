// Slack intake, end to end against the real Hub and Desk Wasm: signed Events API calls create and
// update requests, replies flow both ways in order, ✅ is honoured only from the requester or staff,
// and nothing is lost across an upgrade. Slack itself is mocked at the HTTPS outcall boundary.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {PocketIc,PocketIcServer,SubnetStateType,CanisterCyclesCostSchedule} from '@dfinity/pic';
import {identity,setup,unwrap,idl} from './helpers/oncall.mjs';

let server;
test.before(async()=>{server=await PocketIcServer.start();});
test.after(async()=>{await server?.stop();});

const SECRET='fixture-signing-secret',TOKEN='xoxb-fixture-token',CHANNEL='C0123ABCDEF';
const text=b=>Buffer.from(b).toString();
async function outcall(pic,match){for(let i=0;i<80;i++){await pic.tick(2);const r=await pic.getPendingHttpsOutcalls();const hit=r.find(x=>!match||x.url.includes(match));if(hit)return hit;}assert.fail('expected a Slack outcall '+(match||''));}
async function answer(pic,match,body){const r=await outcall(pic,match);await pic.mockPendingHttpsOutcall({requestId:r.requestId,subnetId:r.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from(JSON.stringify(body))}});return r;}
async function quiet(pic,n=5){for(let i=0;i<n;i++){await pic.advanceTime(1000);await pic.tick();}}
async function noOutcall(pic){await pic.tick(3);assert.equal((await pic.getPendingHttpsOutcalls()).length,0,'no outcall expected');}
async function post(pic,desk,body,secret=SECRET){
 const raw=JSON.stringify(body),ts=Math.floor((await pic.getTime())/1000);
 const sig='v0='+createHmac('sha256',secret).update(`v0:${ts}:${raw}`).digest('hex');
 const req={method:'POST',url:'/slack/events',headers:[['X-Slack-Request-Timestamp',String(ts)],['X-Slack-Signature',sig],['Content-Type','application/json']],body:Buffer.from(raw)};
 assert.deepEqual((await desk.http_request(req)).upgrade,[true]);
 const r=await desk.http_request_update(req);
 return {status:r.status_code,body:text(r.body)};
}
const message=(id,user,ts,txt,thread)=>({type:'event_callback',event_id:id,event:{type:'message',user,channel:CHANNEL,ts,text:txt,...(thread?{thread_ts:thread}:{})}});
const reaction=(id,user,ts,added=true)=>({type:'event_callback',event_id:id,event:{type:added?'reaction_added':'reaction_removed',user,reaction:'white_check_mark',item:{type:'message',channel:CHANNEL,ts}}});
async function flushOne(pic,desk,match){await pic.advanceTime(11000);return answer(pic,match,{ok:true});}

async function wire(pic,baseline=false){
 const c=await setup(pic,baseline);
 // Calls that wait for a Slack answer are submitted deferred, so the outcall can be mocked while they run.
 const hubDeferred=pic.createDeferredActor(await idl('hub/backend/dist/backend.did'),c.h.canisterId);hubDeferred.setPrincipal(identity.owner);
 const deskDeferred=pic.createDeferredActor(await idl('desk/backend/dist/backend.did'),c.b.canisterId);
 c.hub.setPrincipal(identity.owner);
 const finishBot=await hubDeferred.addSlackBot({name:'Support bot',token:TOKEN,signingSecret:SECRET});
 await answer(pic,'auth.test',{ok:true,team:'Fixture Co',user_id:'UBOT'});
 const bot=await finishBot();assert.equal(bot.ok,true,bot.detail);
 assert.equal(await c.hub.setConnectorBots(c.conn.id,[bot.id]),true);
 const finishRefresh=await deskDeferred.slackRefresh(c.tokens.owner);
 await answer(pic,'auth.test',{ok:true,team:'Fixture Co',user_id:'UBOT'});
 const refreshed=await finishRefresh();assert.equal(refreshed.ok,true,refreshed.detail);assert.equal(refreshed.count,1n);
 const type=(await c.desk.catalog(c.tokens.owner)).find(t=>t.enabled&&t.approval==='none');
 const added=await c.desk.addSlackIntake(c.tokens.owner,{name:'',hubBotId:bot.id,channel:CHANNEL,channelName:'it-support',typeId:type.id});
 assert.equal(added.ok,true,added.detail);
 const status=(await c.desk.slackStatus(c.tokens.owner))[0];
 assert.equal(status.intakes.length,1);assert.equal(status.bots[0].botKnown,true);assert.equal(status.appUrlSet,true);
 return {...c,bot,intakeId:added.id};
}

test('slack: a channel message becomes a request for the Slack user, the bot answers in order, replies and ✅ follow the requester',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]}); // outcalls need a funded (free) cost schedule
 try{
  const c=await wire(pic);
  // 1 · an unsigned or mis-signed event is refused before any parsing
  assert.equal((await post(pic,c.desk,message('EvBad','UALPHA','1700000000.000001','nope'),'wrong-secret')).status,401);
  // 2 · a signed top-level message creates a request for the person behind the Slack id
  const anchor='1700000000.000100';
  assert.equal((await post(pic,c.desk,message('Ev1','UALPHA',anchor,'Wifi drops in meeting room B\nsince Monday'))).body,'ok');
  const lookup=await answer(pic,'users.info',{ok:true,user:{profile:{email:'alpha@customer.test'}}});
  assert.match(lookup.url,/users\.info\?user=UALPHA$/);
  await quiet(pic);
  const mine=await c.desk.myTickets(c.tokens.alpha);
  assert.equal(mine.length,1,'alpha owns the request created from their Slack message');
  const row=mine[0];assert.equal(row.channel,'slack');assert.equal(row.subject,'Wifi drops in meeting room B');assert.equal(row.requester,c.ids.alpha);
  // Slack retries of the same event are no-ops
  assert.equal((await post(pic,c.desk,message('Ev1','UALPHA',anchor,'Wifi drops in meeting room B'))).body,'duplicate');
  await noOutcall(pic);assert.equal((await c.desk.myTickets(c.tokens.alpha)).length,1);
  // 3 · the bot acknowledges in the thread first, then marks the message with 👀 — in that order, with a working link
  const ack=await flushOne(pic,c.desk,'chat.postMessage');
  assert.match(text(ack.body),new RegExp(`"thread_ts":"${anchor}"`));
  assert.match(text(ack.body),/https:\/\/desk\.customer\.test\/#\/t\/\d+\|SUP-\d+/,'the acknowledgement links to the request on the configured desk address');
  assert.match(text(ack.body),/\|SUP-\d+>\* created/);
  assert.doesNotMatch(text(ack.body),/_\.\./,'no double period after a subject that ends with one');
  const eyes=await answer(pic,'reactions.add',{ok:true});assert.match(text(eyes.body),/"name":"eyes"/);
  await noOutcall(pic);
  // 4 · two agent replies from Desk reach the thread in the order they were written (the outbox is FIFO)
  unwrap(await c.desk.comment(c.tokens.beta,row.id,'First: can you reboot the access point?'));
  unwrap(await c.desk.comment(c.tokens.beta,row.id,'Second: and tell me the room number.'));
  await pic.advanceTime(11000);
  const first=await outcall(pic,'chat.postMessage');assert.match(text(first.body),/First: can you reboot/);
  assert.match(text(first.body),/"username":"beta"/,'a Desk reply is posted under the agent\'s name');assert.doesNotMatch(text(first.body),/\*beta\*:/);
  await pic.mockPendingHttpsOutcall({requestId:first.requestId,subnetId:first.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('{"ok":true}')}});
  const second=await outcall(pic,'chat.postMessage');assert.match(text(second.body),/Second: and tell me/);assert.match(text(second.body),/"username":"beta"/);
  // Slack app without chat:write.customize: the override is refused, the reply is re-sent once with the name in the text, the intake says what to add
  await pic.mockPendingHttpsOutcall({requestId:second.requestId,subnetId:second.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('{"ok":false,"error":"missing_scope"}')}});
  const plain=await outcall(pic,'chat.postMessage');assert.match(text(plain.body),/\*beta\*: Second: and tell me/);assert.doesNotMatch(text(plain.body),/"username"/);
  await pic.mockPendingHttpsOutcall({requestId:plain.requestId,subnetId:plain.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('{"ok":true}')}});
  assert.match((await c.desk.slackStatus(c.tokens.owner))[0].intakes[0].lastResult,/chat:write.customize/);
  await noOutcall(pic);
  // 5 · the requester's thread reply lands on the request as their comment (the Slack id is cached, no lookup)
  assert.equal((await post(pic,c.desk,message('Ev2','UALPHA','1700000000.000200','Rebooted, still broken. Room 2.14.',anchor))).body,'ok');
  await quiet(pic);await noOutcall(pic);
  let full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];
  const reply=full.events.find(e=>e.kind==='comment'&&e.body.startsWith('Rebooted'));
  assert.ok(reply,'thread reply recorded');assert.equal(reply.actorKind,'requester');assert.equal(reply.who,c.ids.alpha);
  // 6 · a bystander's ✅ changes nothing; the intake records why
  assert.equal((await post(pic,c.desk,reaction('Ev3','UEMP',anchor))).body,'ok');
  await answer(pic,'users.info',{ok:true,user:{profile:{email:'employee@customer.test'}}});
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];
  assert.notEqual(full.ticket.status,'resolved','a colleague who merely reacted cannot resolve someone else’s request');
  assert.match((await c.desk.slackStatus(c.tokens.owner))[0].intakes[0].lastResult,/someone other than the requester ignored/);
  // 7 · the requester's ✅ resolves, removing it reopens; Desk mirrors both without re-adding the reaction
  assert.equal((await post(pic,c.desk,reaction('Ev4','UALPHA',anchor))).body,'ok');
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];assert.equal(full.ticket.status,'resolved');
  const resolvedPost=await flushOne(pic,c.desk,'chat.postMessage');assert.match(text(resolvedPost.body),/resolved/);await noOutcall(pic);
  assert.equal((await post(pic,c.desk,reaction('Ev5','UALPHA',anchor,false))).body,'ok');
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];assert.equal(full.ticket.status,'open');
  // the person removed ✅ themselves, so only a stale 🔒 is taken off before the thread is told
  await pic.advanceTime(11000);const unlock=await answer(pic,'reactions.remove',{ok:true});assert.match(text(unlock.body),/"name":"lock"/);
  const reopened=await answer(pic,'chat.postMessage',{ok:true});assert.match(text(reopened.body),/reopened/);await noOutcall(pic);
  // 8 · staff may resolve from Slack too
  assert.equal((await post(pic,c.desk,reaction('Ev6','UBETA',anchor))).body,'ok');
  await answer(pic,'users.info',{ok:true,user:{profile:{email:'beta@customer.test'}}});
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.owner,row.id))[0];assert.equal(full.ticket.status,'resolved');
  await flushOne(pic,c.desk,'chat.postMessage');await noOutcall(pic);
  // 8b · the requester writes again after the resolve: the reply is kept, nothing reopens by itself, the owners are asked
  assert.equal((await post(pic,c.desk,message('Ev6b','UALPHA','1700000000.000250','Nope, still broken. <@UBETA> please check.',anchor))).body,'ok');
  // the mentioned member is looked up once (e-mail was cached at step 8, the name was not) so the request shows a name, not an id
  await answer(pic,'users.info',{ok:true,user:{real_name:'Beta Tester',profile:{email:'beta@customer.test',display_name:''}}});
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];
  assert.equal(full.ticket.status,'resolved','a reply alone never changes a finished request');
  assert.ok(full.events.some(e=>e.kind==='comment'&&e.body==='Nope, still broken. <@UBETA|Beta Tester> please check.'),'the reply is on the request with the mention resolved: '+JSON.stringify(full.events.filter(e=>e.kind==='comment').map(e=>e.body)));
  await noOutcall(pic);
  assert.ok((await c.desk.notifyHealth(c.tokens.owner))[0].recent.some(r=>/replied after resolution .* reopen\?/.test(r.title)),'the owners are asked whether to reopen');
  // 8b2 · ↩️ on the first message is the explicit "not done": it reopens whoever had set the ✅
  assert.equal((await post(pic,c.desk,{type:'event_callback',event_id:'Ev6r',event:{type:'reaction_added',user:'UALPHA',reaction:'leftwards_arrow_with_hook',item:{type:'message',channel:CHANNEL,ts:anchor}}})).body,'ok');
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];assert.equal(full.ticket.status,'open','↩️ reopens');
  await pic.advanceTime(11000);
  const afterReply=[];for(let i=0;i<3;i++){const r=await outcall(pic);afterReply.push(r.url.split('/').at(-1)+' '+text(r.body));await pic.mockPendingHttpsOutcall({requestId:r.requestId,subnetId:r.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('{"ok":true}')}});}
  assert.ok(afterReply.some(x=>x.startsWith('reactions.remove')&&/white_check_mark/.test(x)),'the bot takes its ✅ off the first message');
  assert.ok(afterReply.some(x=>x.startsWith('chat.postMessage')&&/reopened/.test(x)),'the thread is told');
  await noOutcall(pic);
  // 8c · closing from Desk marks the first message with 🔒; a staff reply in the thread is kept without reopening
  unwrap(await c.desk.setStatus(c.tokens.beta,row.id,'closed',''));
  await pic.advanceTime(11000);
  const afterClose=[];for(let i=0;i<2;i++){const r=await outcall(pic);afterClose.push(r.url.split('/').at(-1)+' '+text(r.body));await pic.mockPendingHttpsOutcall({requestId:r.requestId,subnetId:r.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('{"ok":true}')}});}
  assert.ok(afterClose.some(x=>x.startsWith('reactions.add')&&/"name":"lock"/.test(x)),'🔒 on the first message');
  assert.ok(afterClose.some(x=>x.startsWith('chat.postMessage')&&/closed/.test(x)));
  await noOutcall(pic);
  assert.equal((await post(pic,c.desk,message('Ev6c','UBETA','1700000000.000260','For the record: replaced the AP.',anchor))).body,'ok');
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.owner,row.id))[0];
  assert.equal(full.ticket.status,'closed','a staff reply does not reopen');
  assert.ok(full.events.some(e=>e.kind==='comment'&&e.body==='For the record: replaced the AP.'),'the staff reply on a closed request is kept');
  // 8d · with an AI key the late reply is assessed: a follow-up reopens with a visible note, thanks leave the request alone
  unwrap(await c.desk.setAi(c.tokens.owner,{provider:'openai',url:'https://ai.example.test/v1/chat/completions',key:'fixture-key',model:'fixture-model'}));
  assert.equal((await post(pic,c.desk,message('Ev6d','UALPHA','1700000000.000270','It is broken again, same error.',anchor))).body,'ok');
  const ask=await outcall(pic,'ai.example.test');
  assert.match(text(ask.body),/Late reply: It is broken again/);assert.doesNotMatch(text(ask.body),/For the record/,'only the late reply and the subject go to the model');
  await pic.mockPendingHttpsOutcall({requestId:ask.requestId,subnetId:ask.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from(JSON.stringify({choices:[{message:{content:'{"kind":"followup","reason":"The problem persists."}'}}]}))}});
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];
  assert.equal(full.ticket.status,'open','the assistant reopened a genuine follow-up');
  assert.ok(full.events.some(e=>e.kind==='ai'&&/Reopened: the late reply reads as a follow-up. The problem persists./.test(e.body)),'the decision is a visible AI note');
  await pic.advanceTime(11000);
  const afterAi=[];for(let i=0;i<3;i++){const r=await outcall(pic);afterAi.push(r.url.split('/').at(-1)+' '+text(r.body));await pic.mockPendingHttpsOutcall({requestId:r.requestId,subnetId:r.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('{"ok":true}')}});}
  assert.ok(afterAi.some(x=>x.startsWith('reactions.remove')&&/"name":"lock"/.test(x)),'🔒 is taken off');
  assert.ok(afterAi.some(x=>x.startsWith('chat.postMessage')&&/reopened by the AI assistant/.test(x)));
  await noOutcall(pic);
  unwrap(await c.desk.setStatus(c.tokens.beta,row.id,'resolved',''));await pic.advanceTime(11000);await answer(pic,'reactions.add',{ok:true});await answer(pic,'chat.postMessage',{ok:true});await noOutcall(pic);
  assert.equal((await post(pic,c.desk,message('Ev6e','UALPHA','1700000000.000280','Thanks, works now!',anchor))).body,'ok');
  const ask2=await outcall(pic,'ai.example.test');
  await pic.mockPendingHttpsOutcall({requestId:ask2.requestId,subnetId:ask2.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from(JSON.stringify({choices:[{message:{content:'{"kind":"closing","reason":"Confirms it works."}'}}]}))}});
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];
  assert.equal(full.ticket.status,'resolved','thanks leave the request resolved');
  assert.ok(full.events.some(e=>e.kind==='ai'&&/reads as thanks or confirmation; left resolved/.test(e.body)));
  await noOutcall(pic);
  // 9 · every Hub notification attempt is on record for the administrator
  const health=(await c.desk.notifyHealth(c.tokens.owner))[0];
  assert.ok(health.total>0n,'deliveries recorded');assert.equal(health.failed,0n,JSON.stringify(health.recent,(_,v)=>typeof v==='bigint'?String(v):v));
  assert.equal((await c.desk.notifyHealth(c.tokens.alpha)).length,0,'agents do not see the delivery log');
  // 10 · an upgrade keeps intakes, credentials, thread anchors and the request; the thread keeps working
  await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:'desk/backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  await quiet(pic,3);
  const after=(await c.desk.slackStatus(c.tokens.owner))[0];
  assert.equal(after.intakes.length,1);assert.equal(after.bots.length,1);assert.equal(after.bots[0].botKnown,true,'the bot user id survives the upgrade');
  assert.equal((await post(pic,c.desk,message('Ev7','UALPHA','1700000000.000300','Still here after the upgrade.',anchor))).body,'ok');
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];
  assert.ok(full.events.some(e=>e.kind==='comment'&&e.body==='Still here after the upgrade.'),'the thread still maps to the request after the upgrade');
 }finally{await pic.tearDown();}
});

test('slack: a message from a Slack user without a known e-mail still becomes a request and says so; a request type with manager approval does not trap the only administrator',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]}); // outcalls need a funded (free) cost schedule
 try{
  const c=await wire(pic);
  assert.equal((await post(pic,c.desk,message('Ev1','UGUEST','1700000001.000100','Printer on floor 3 is jammed.'))).body,'ok');
  await answer(pic,'users.info',{ok:true,user:{profile:{}}});
  await quiet(pic);
  const ack=await flushOne(pic,c.desk,'chat.postMessage');
  assert.match(text(ack.body),/Slack profile shows no e-mail we know/);
  assert.match(text(ack.body),/jammed\._/);assert.doesNotMatch(text(ack.body),/jammed\.\._/,'a subject ending in a period gets no second period');
  await answer(pic,'reactions.add',{ok:true});
  const intake=(await c.desk.slackStatus(c.tokens.owner))[0].intakes[0];
  assert.match(intake.lastResult,/created from a message$/,'no e-mail suffix when the person is unknown');
  // the only administrator files a request whose type needs manager approval and has no manager attribute
  const types=await c.desk.catalog(c.tokens.owner);
  const managed=types.find(t=>t.approval==='manager');
  assert.ok(managed,'the default catalog has a manager-approval type');
  const fill=t=>t.fields.filter(f=>f.required).map(f=>[f.key,f.kind==='select'?f.options[0]:f.kind==='person'?'owner@customer.test':f.kind==='date'?'2026-10-10':f.kind==='bool'?'yes':'Synthetic']);
  const created=await c.desk.createRequest(c.tokens.owner,managed.id,'A laptop for myself','Synthetic',fill(managed));
  assert.equal(created.ok,true,created.detail);
  const full=(await c.desk.getTicket(c.tokens.owner,created.id))[0];
  assert.notEqual(full.ticket.waitingOn,'approval','the sole administrator is not blocked by an approval only they could give');
  assert.ok(full.events.some(e=>e.kind==='approval'&&/only administrator/.test(e.body)),'the activity explains why no approval was required');
  assert.equal(full.approval.length,0);
  // with a second administrator the normal approval rule applies again
  c.hub.setPrincipal(identity.owner);
  const [policy]=await c.hub.getAppPermissions(c.conn.id);
  unwrap(await c.hub.setAppPermissions(c.conn.id,policy.revision,{app:'desk',defaultRole:'member',people:[{id:c.ids.alpha,role:'admin'},{id:c.ids.beta,role:'agent'}],groups:[]}));
  await pic.advanceTime(31000);await quiet(pic,3);await c.refresh();await pic.advanceTime(31000);await quiet(pic,3);
  const again=await c.desk.createRequest(c.tokens.owner,managed.id,'Another laptop','Synthetic',fill(managed));
  assert.equal(again.ok,true,again.detail);
  const second=(await c.desk.getTicket(c.tokens.owner,again.id))[0];
  assert.equal(second.ticket.waitingOn,'approval','with another administrator the request waits for approval');
 }finally{await pic.tearDown();}
});

const aiResult=content=>({choices:[{message:{content:JSON.stringify(content)}}]});
async function enableAI(c){unwrap(await c.desk.setAi(c.tokens.owner,{provider:'openai',url:'https://ai.example.test/v1/chat/completions',key:'fixture-key',model:'fixture-model'}));}
async function createSlackFixture(pic,c,anchor='1700000010.000100'){
 await post(pic,c.desk,message('start'+anchor,'UEMP',anchor,'TablePlus subscription expired. Please renew it.'));
 await answer(pic,'users.info',{ok:true,user:{profile:{email:'employee@customer.test'}}});await quiet(pic);
 const row=(await c.desk.myTickets(c.tokens.employee))[0];assert.ok(row);
 return {row,anchor};
}
test('slack AI: summarized title, authorized completion, uncertainty, stale decisions and checklist guard',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await wire(pic);await enableAI(c);
  const anchor='1700000020.000100';
  await post(pic,c.desk,message('title','UEMP',anchor,'Hi, looks like our TablePlus subscription expired. Could we get that again?'));
  await answer(pic,'users.info',{ok:true,user:{profile:{email:'employee@customer.test'}}});
  // The independent triage and title calls may arrive in either order.
  for(let i=0;i<2;i++){
   const r=await outcall(pic,'ai.example.test');const title=text(r.body).includes('short, specific ticket title');
   await pic.mockPendingHttpsOutcall({requestId:r.requestId,subnetId:r.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from(JSON.stringify(aiResult(title?{title:'Renew TablePlus subscription'}:{summary:'Subscription expired',priority:'normal',suggestedType:'',questions:[],sensitive:false})))}});
  }
  await quiet(pic);const row=(await c.desk.myTickets(c.tokens.employee))[0];assert.equal(row.subject,'Renew TablePlus subscription');
  const ack=await flushOne(pic,c.desk,'chat.postMessage');assert.match(text(ack.body),/\|SUP-\d+>\* created: _Renew TablePlus subscription_/);assert.doesNotMatch(text(ack.body),/Open request/);await answer(pic,'reactions.add',{ok:true});
  await post(pic,c.desk,message('notstaff','UEMP','1700000020.000110','Done, renewed.',anchor));await quiet(pic);await noOutcall(pic);
  await post(pic,c.desk,message('maybe','UBETA','1700000020.000120','I will renew it tomorrow.',anchor));await answer(pic,'users.info',{ok:true,user:{profile:{email:'beta@customer.test'}}});
  await answer(pic,'ai.example.test',aiResult({kind:'keep',evidence:''}));await quiet(pic);assert.notEqual((await c.desk.getTicket(c.tokens.owner,row.id))[0].ticket.status,'resolved');
  await post(pic,c.desk,message('stale','UBETA','1700000020.000130','Renewed, it works again.',anchor));
  const stale=await outcall(pic,'ai.example.test');
  await post(pic,c.desk,message('newproblem','UEMP','1700000020.000140','Still cannot log in.',anchor));await quiet(pic);
  await pic.mockPendingHttpsOutcall({requestId:stale.requestId,subnetId:stale.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from(JSON.stringify(aiResult({kind:'resolved',evidence:'Renewed, it works again.'})))}});
  await quiet(pic);assert.notEqual((await c.desk.getTicket(c.tokens.owner,row.id))[0].ticket.status,'resolved','late AI decision must not override newer reply');
  await post(pic,c.desk,message('invalidjson','UBETA','1700000020.000145','Done.',anchor));await answer(pic,'ai.example.test',{choices:[{message:{content:'not JSON'}}]});await quiet(pic);assert.notEqual((await c.desk.getTicket(c.tokens.owner,row.id))[0].ticket.status,'resolved');
  await post(pic,c.desk,message('inventedevidence','UBETA','1700000020.000146','Still investigating.',anchor));await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Fixed everything.'}));await quiet(pic);assert.notEqual((await c.desk.getTicket(c.tokens.owner,row.id))[0].ticket.status,'resolved');
  const task=await c.desk.addTask(c.tokens.beta,row.id,'Verify license');assert.equal(task.ok,true);
  await post(pic,c.desk,message('blocked','UBETA','1700000020.000150','Renewed, it works again.',anchor));await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Renewed, it works again.'}));await quiet(pic);
  let full=(await c.desk.getTicket(c.tokens.owner,row.id))[0];assert.notEqual(full.ticket.status,'resolved');assert.ok(full.events.some(e=>e.kind==='ai'&&/checklist/.test(e.body)));
  for(let i=0;i<full.tasks.length;i++)unwrap(await c.desk.setTask(c.tokens.beta,row.id,BigInt(i),'done'));
  await post(pic,c.desk,message('done','UBETA','1700000020.000160','Renewed and verified, everything works now.',anchor));await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Renewed and verified, everything works now.'}));await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.owner,row.id))[0];assert.equal(full.ticket.status,'resolved');assert.ok(full.events.some(e=>e.kind==='ai'&&/completion comment/.test(e.body)));
  unwrap(await c.desk.setStatus(c.tokens.beta,row.id,'open',''));
  await c.desk.setAiTriage(c.tokens.owner,false);
  await post(pic,c.desk,message('disabled','UBETA','1700000020.000170','Everything is fixed.',anchor));await quiet(pic);
  assert.ok(!(await pic.getPendingHttpsOutcalls()).some(r=>r.url.includes('ai.example.test')));
  assert.equal((await c.desk.getTicket(c.tokens.owner,row.id))[0].ticket.status,'open');
  await c.desk.setAiTriage(c.tokens.owner,true);
  await post(pic,c.desk,message('revoke','UBETA','1700000020.000180','Everything is fixed.',anchor));const revoked=await outcall(pic,'ai.example.test');
  c.hub.setPrincipal(identity.owner);const [policy]=await c.hub.getAppPermissions(c.conn.id);
  unwrap(await c.hub.setAppPermissions(c.conn.id,policy.revision,{app:'desk',defaultRole:'member',people:[{id:c.ids.alpha,role:'agent'}],groups:[]}));await c.refresh();
  await pic.mockPendingHttpsOutcall({requestId:revoked.requestId,subnetId:revoked.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from(JSON.stringify(aiResult({kind:'resolved',evidence:'Everything is fixed.'})))}});await quiet(pic);
  assert.equal((await c.desk.getTicket(c.tokens.owner,row.id))[0].ticket.status,'open','revoked agent cannot resolve through an in-flight AI call');

 }finally{await pic.tearDown();}
});

test('slack images: private download, dedupe, upload to original thread, retries and no credential forwarding',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await wire(pic);const {row,anchor}=await createSlackFixture(pic,c);
  await flushOne(pic,c.desk,'chat.postMessage');await answer(pic,'reactions.add',{ok:true});
  const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
  const event=message('image','UEMP','1700000010.000110','Here is the screenshot',anchor);event.event.files=[{id:'F001'}];event.event.subtype='file_share';
  await post(pic,c.desk,event);await quiet(pic);await pic.advanceTime(11000);
  await answer(pic,'files.info',{ok:true,file:{id:'F001',name:'screenshot.png',mimetype:'image/png',size:png.length,url_private:'https://files.slack.com/files-pri/T1-F001/screenshot.png'}});
  const dl=await outcall(pic,'files-pri');assert.ok(dl.headers.some(h=>h[0].toLowerCase()==='authorization'&&h[1]==='Bearer '+TOKEN));
  await pic.mockPendingHttpsOutcall({requestId:dl.requestId,subnetId:dl.subnetId,response:{type:'success',statusCode:200,headers:[['Content-Type','image/png']],body:png}});await quiet(pic);
  let full=(await c.desk.getTicket(c.tokens.owner,row.id))[0];assert.equal(full.files.length,1);assert.equal(full.files[0].name,'screenshot.png');
  assert.deepEqual(Buffer.from((await c.desk.fileData(c.tokens.employee,full.files[0].id))[0].data),png);
  assert.equal((await post(pic,c.desk,event)).body,'duplicate');event.event_id='duplicate-file';await post(pic,c.desk,event);await quiet(pic);await pic.advanceTime(11000);await noOutcall(pic);assert.equal((await c.desk.getTicket(c.tokens.owner,row.id))[0].files.length,1);
  const uploaded=await c.desk.addFile(c.tokens.beta,row.id,'fixed.png','image/png',png);assert.equal(uploaded.ok,true);await pic.advanceTime(11000);
  await answer(pic,'files.getUploadURLExternal',{ok:true,file_id:'F002',upload_url:'https://files.slack.com/upload/v1/fixture'});
  const upload=await outcall(pic,'upload/v1');assert.deepEqual(Buffer.from(upload.body),png);assert.ok(!upload.headers.some(h=>h[0].toLowerCase()==='authorization'),'signed upload URL needs no bot token');
  await pic.mockPendingHttpsOutcall({requestId:upload.requestId,subnetId:upload.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from('OK')}});
  const completed=await answer(pic,'files.completeUploadExternal',{ok:true});const completion=JSON.parse(text(completed.body));assert.equal(completion.thread_ts,anchor);assert.equal(completion.channel_id,CHANNEL);assert.equal(completion.files[0].id,'F002');await quiet(pic);
  const bad=message('badimage','UEMP','1700000010.000120','image',anchor);bad.event.files=[{id:'F003'}];await post(pic,c.desk,bad);await quiet(pic);await pic.advanceTime(11000);
  await answer(pic,'files.info',{ok:true,file:{id:'F003',name:'bad.png',mimetype:'image/png',size:100,url_private:'https://files.slack.com.evil.test/files-pri/x'}});await quiet(pic);await noOutcall(pic);
  full=(await c.desk.getTicket(c.tokens.owner,row.id))[0];assert.equal(full.files.length,2);assert.ok(full.events.some(e=>/Unsupported private Slack image URL/.test(e.body)));
  assert.equal((await c.desk.retrySlackImages(c.tokens.employee,row.id)).ok,false,'requester cannot restart transfer jobs');
  await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||'desk/backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  assert.equal((await c.desk.getTicket(c.tokens.owner,row.id))[0].files.length,2,'imported image persists across upgrade');
  unwrap(await c.desk.retrySlackImages(c.tokens.beta,row.id));await pic.advanceTime(11000);
  await answer(pic,'files.info',{ok:false,error:'missing_scope'});await quiet(pic);assert.match((await c.desk.slackStatus(c.tokens.owner))[0].intakes[0].lastResult,/missing_scope/);
 }finally{await pic.tearDown();}
});

test('slack upgrade: published baseline retains ticket, file, thread and central role policy',{skip:!process.env.KEBAB_CUSTOMER_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await wire(pic,true);const {row,anchor}=await createSlackFixture(pic,c);
  const file=await c.desk.addFile(c.tokens.beta,row.id,'existing.txt','text/plain',Buffer.from('existing attachment'));assert.equal(file.ok,true);
  const before=(await c.desk.getTicket(c.tokens.owner,row.id))[0];
  await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||'desk/backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  const after=(await c.desk.getTicket(c.tokens.owner,row.id))[0];assert.deepEqual(after.ticket,before.ticket);assert.deepEqual(after.files,before.files);
  assert.equal((await c.desk.whoami(c.tokens.beta))[0].role,'agent');assert.equal((await c.desk.whoami(c.tokens.employee))[0].role,'requester');
  await post(pic,c.desk,message('upgraded-thread','UEMP','1700000010.000170','Still in the original thread',anchor));await quiet(pic);
  assert.ok((await c.desk.getTicket(c.tokens.owner,row.id))[0].events.some(e=>e.body==='Still in the original thread'));
  assert.deepEqual(Buffer.from((await c.desk.fileData(c.tokens.employee,file.id))[0].data),Buffer.from('existing attachment'));
 }finally{await pic.tearDown();}
});

// Advance real canister timers while the Hub directory refresh continues normally.
async function completionCycle(pic){for(let i=0;i<47;i++){await pic.advanceTime(20000);await pic.tick(12);if((await pic.getPendingHttpsOutcalls()).some(r=>r.url.includes("ai.example.test")))return;}}
async function completionFixture(pic,baseline=false){
 const c=await setup(pic,baseline);await c.desk.setAiTriage(c.tokens.owner,false);
 const type=(await c.desk.catalog(c.tokens.owner)).find(t=>t.enabled&&t.approval==='none'&&t.fields.every(f=>!f.required));assert.ok(type);
 c.newRequest=async(body='Please renew the subscription.')=>{
  const r=await c.desk.agentCreate(c.tokens.beta,{typeId:type.id,subject:'Renew subscription',body,fields:[],requester:'employee@customer.test',priority:'normal',channel:'agent'});unwrap(r);return r.id;
 };
 return c;
}
const ticket=async(c,id)=>(await c.desk.getTicket(c.tokens.owner,id))[0];

test('periodic AI: old Desk replies resolve without browser or new Slack event; reopen and later messages are respected',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await completionFixture(pic);const good=await c.newRequest(),later=await c.newRequest(),privateNote=await c.newRequest(),requester=await c.newRequest();
  for(const id of [good,later,privateNote])unwrap(await c.desk.comment(c.tokens.beta,id,'Renewed and verified, everything works now.'));
  unwrap(await c.desk.comment(c.tokens.employee,later,'Still broken.'));
  unwrap(await c.desk.addNote(c.tokens.beta,privateNote,'PRIVATE: still investigating.'));
  unwrap(await c.desk.comment(c.tokens.employee,requester,'Everything is fixed.'));
  await enableAI(c);await c.desk.setAiTriage(c.tokens.owner,true);await completionCycle(pic);
  const req=await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Renewed and verified, everything works now.'}));assert.doesNotMatch(text(req.body),/PRIVATE/);await quiet(pic);
  assert.equal((await ticket(c,good)).ticket.status,'resolved');
  for(const id of [later,privateNote,requester])assert.notEqual((await ticket(c,id)).ticket.status,'resolved');
  unwrap(await c.desk.setStatus(c.tokens.beta,good,'open',''));
  await completionCycle(pic);await noOutcall(pic);assert.equal((await ticket(c,good)).ticket.status,'open','manual reopen must not recycle old completion evidence');
 }finally{await pic.tearDown();}
});

test('periodic AI: invalid response retries after upgrade; unchanged keep decisions do not spend again',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await completionFixture(pic);const id=await c.newRequest();unwrap(await c.desk.comment(c.tokens.beta,id,'I will try tomorrow.'));
  await enableAI(c);await c.desk.setAiTriage(c.tokens.owner,true);await completionCycle(pic);
  await answer(pic,'ai.example.test',{choices:[{message:{content:'invalid'}}]});await quiet(pic);assert.notEqual((await ticket(c,id)).ticket.status,'resolved');
  await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||'desk/backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  await completionCycle(pic);await answer(pic,'ai.example.test',aiResult({kind:'keep',evidence:''}));await quiet(pic);
  await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||'desk/backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  await completionCycle(pic);await noOutcall(pic);
  unwrap(await c.desk.comment(c.tokens.beta,id,'Renewed and verified.'));await completionCycle(pic);
  const pending=await outcall(pic,'ai.example.test');unwrap(await c.desk.comment(c.tokens.employee,id,'The license still fails.'));
  await pic.mockPendingHttpsOutcall({requestId:pending.requestId,subnetId:pending.subnetId,response:{type:'success',statusCode:200,headers:[],body:Buffer.from(JSON.stringify(aiResult({kind:'resolved',evidence:'Renewed and verified.'})))}});await quiet(pic);
  assert.notEqual((await ticket(c,id)).ticket.status,'resolved','periodic review must discard stale evidence');await completionCycle(pic);await noOutcall(pic);
 }finally{await pic.tearDown();}
});

test('periodic AI: bounded batches rotate fairly, checklist blocks and disabled assistance stops work',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await completionFixture(pic);const ids=[];
  for(let i=0;i<6;i++){const id=await c.newRequest();ids.push(id);unwrap(await c.desk.comment(c.tokens.beta,id,'Done, renewed.'));}
  unwrap(await c.desk.addTask(c.tokens.beta,ids[0],'Verify license'));
  await enableAI(c);await c.desk.setAiTriage(c.tokens.owner,true);await completionCycle(pic);
  for(let i=0;i<4;i++){await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Done, renewed.'}));await quiet(pic);}
  await noOutcall(pic);assert.notEqual((await ticket(c,ids[0])).ticket.status,'resolved');assert.ok((await ticket(c,ids[0])).events.some(e=>/checklist/.test(e.body)));
  for(const id of ids.slice(1,4))assert.equal((await ticket(c,id)).ticket.status,'resolved');
  for(const id of ids.slice(4))assert.notEqual((await ticket(c,id)).ticket.status,'resolved','four-review budget');
  await completionCycle(pic);for(let i=0;i<2;i++){await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Done, renewed.'}));await quiet(pic);}
  unwrap(await c.desk.setTask(c.tokens.beta,ids[0],0n,'done'));await c.desk.setAiTriage(c.tokens.owner,false);await completionCycle(pic);await noOutcall(pic);
  await c.desk.setAiTriage(c.tokens.owner,true);await completionCycle(pic);await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Done, renewed.'}));await quiet(pic);assert.equal((await ticket(c,ids[0])).ticket.status,'resolved');
 }finally{await pic.tearDown();}
});

test('periodic AI upgrade: published Desk retains an old public completion and reviews it after upgrade',{skip:!process.env.KEBAB_CUSTOMER_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await completionFixture(pic,true);const id=await c.newRequest();unwrap(await c.desk.comment(c.tokens.beta,id,'Renewed and verified.'));await enableAI(c);await c.desk.setAiTriage(c.tokens.owner,true);
  const before=await ticket(c,id);
  await pic.upgradeCanister({sender:identity.controller,canisterId:c.b.canisterId,wasm:process.env.KEBAB_CUSTOMER_WASM||'desk/backend/dist/backend.wasm',upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});
  assert.deepEqual((await ticket(c,id)).ticket,before.ticket);assert.equal((await c.desk.whoami(c.tokens.beta))[0].role,'agent');
  await completionCycle(pic);await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Renewed and verified.'}));await quiet(pic);assert.equal((await ticket(c,id)).ticket.status,'resolved');
 }finally{await pic.tearDown();}
});

test('periodic AI: scan continues beyond the 200-ID boundary without sending requester-only tickets',async()=>{
 const pic=await PocketIc.create(server.getUrl(),{application:[{state:{type:SubnetStateType.New},costSchedule:CanisterCyclesCostSchedule.Free}]});
 try{
  const c=await completionFixture(pic);let target;
  for(let i=0;i<201;i++)target=await c.newRequest();
  unwrap(await c.desk.comment(c.tokens.beta,target,'Renewed and verified.'));
  await enableAI(c);await c.desk.setAiTriage(c.tokens.owner,true);
  await completionCycle(pic);await noOutcall(pic);assert.notEqual((await ticket(c,target)).ticket.status,'resolved');
  await completionCycle(pic);await answer(pic,'ai.example.test',aiResult({kind:'resolved',evidence:'Renewed and verified.'}));await quiet(pic);assert.equal((await ticket(c,target)).ticket.status,'resolved');
 }finally{await pic.tearDown();}
});
