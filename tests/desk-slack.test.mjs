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

async function wire(pic){
 const c=await setup(pic);
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
  assert.match(text(ack.body),/https:\/\/desk\.customer\.test\/#\/t\/\d+\|Open request/,'the acknowledgement links to the request on the configured desk address');
  assert.match(text(ack.body),/\*SUP-\d+\* created/);
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
  assert.equal((await post(pic,c.desk,message('Ev6b','UALPHA','1700000000.000250','Nope, still broken.',anchor))).body,'ok');
  await quiet(pic);
  full=(await c.desk.getTicket(c.tokens.alpha,row.id))[0];
  assert.equal(full.ticket.status,'resolved','a reply alone never changes a finished request');
  assert.ok(full.events.some(e=>e.kind==='comment'&&e.body==='Nope, still broken.'),'the reply is on the request');
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
