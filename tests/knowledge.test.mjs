import assert from 'node:assert/strict';
import {test,before,after} from 'node:test';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
import {resolve} from 'node:path';
import {idl} from './helpers/oncall.mjs';
import {manualAndSharing} from './helpers/knowledge-sharing.mjs';
import {candidateBackend} from './packaged-wasm.mjs';
let server;before(async()=>{server=await PocketIcServer.start();});after(async()=>{await server?.stop();});
const identities=Object.fromEntries(['controller','owner','author','reviewer','reader','outsider','lunch'].map(n=>[n,createIdentity('knowledge-test-'+n).getPrincipal()]));
const ok=r=>{assert.ok('ok'in r,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.ok;};
const denied=r=>assert.ok('err'in r,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));
const document=text=>JSON.stringify({type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Verified solution'}]},{type:'paragraph',content:[{type:'text',text}]},{type:'orderedList',attrs:{start:1,type:null},content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'Check the result'}]}]}]},{type:'blockquote',content:[{type:'heading',attrs:{level:3},content:[{type:'text',text:'Evidence'}]},{type:'paragraph',content:[{type:'text',text:'Record the verification.'}]}]},{type:'codeBlock',attrs:{language:null},content:[{type:'text',text:'status = verified'}]}]});
for(const upgrade of [false,true])test(`Doku ${upgrade?'populated published upgrade':'fresh'}: permissions, reviewed source, conflicts, history and retries`,{skip:upgrade&&!process.env.KEBAB_KNOWLEDGE_BASELINE},async()=>{
 const pic=await PocketIc.create(server.getUrl());await pic.setTime(Date.parse('2026-10-21T08:00:00Z'));
 try{
 const apps={},ids={},tokens={};
 async function install(name,baseline=false){const dir=baseline?resolve(process.env.KEBAB_KNOWLEDGE_BASELINE,name):resolve(name,'backend/dist');return pic.setupCanister({sender:identities.controller,controllers:[identities.controller],wasm:baseline?dir+'/backend.wasm':candidateBackend(name),idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ad'.repeat(32)}]:[]});}
 const h=await install('hub',upgrade);let hub=h.actor;hub.setPrincipal(identities.owner);assert.ok((await hub.claimHubWithCode('ad'.repeat(32),{email:'owner@knowledge.test',displayName:'Owner',orgName:'Synthetic knowledge tests'})).ok);
 for(const n of ['author','reviewer','reader','outsider']){hub.setPrincipal(identities.owner);await hub.addLocalUser(n+'@knowledge.test',n,'','');const [code]=await hub.createInvite(n+'@knowledge.test');hub.setPrincipal(identities[n]);assert.ok(await hub.claimInvite(code));}
 hub.setPrincipal(identities.owner);for(const n of ['owner','author','reviewer','reader','outsider'])ids[n]=(await hub.personCard(n+'@knowledge.test'))[0].pid;
 async function policy(name,people){hub.setPrincipal(identities.owner);const [p]=await hub.getAppPermissions(apps[name].conn.id);assert.ok((await hub.setAppPermissions(apps[name].conn.id,p?.revision??0n,{app:name,defaultRole:name==='desk'?'member':'none',people,groups:[]})).ok);assert.ok((await hub.checkAppPermissions(apps[name].conn.id)).ok);}
 async function connect(name,baseline=false){const f=await install(name,baseline);f.app=f.actor;f.app.setPrincipal(identities.controller);await f.app.setHub(h.canisterId.toText());hub.setPrincipal(identities.owner);f.conn=await hub.connectApp({name,canisterId:f.canisterId.toText(),note:'Synthetic fixture',lanes:['identity','profile','groups','roles'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name,kind:'app',url:`https://${name}.knowledge.test`}]});assert.ok(f.conn.ok);apps[name]=f;}
 async function login(name,who){hub.setPrincipal(identities[who]);const ticket=await hub.mintAppTicket('',apps[name].conn.tileId);assert.ok(ticket.ok);const [s]=await apps[name].app.loginWithTicket(ticket.ticket);assert.ok(s);return s.token;}
 await connect('desk',upgrade);const deskRoles=['author','reviewer'].map(n=>({id:ids[n],role:'agent'}));await policy('desk',deskRoles);for(const n of ['owner','author','reviewer','reader'])tokens[n]=await login('desk',n);
 let d=apps.desk.app;const type=(await d.catalog(tokens.owner)).find(t=>!t.fields.length);
 const t=await d.agentCreate(tokens.author,{typeId:type.id,subject:'Restore meeting-room Wi-Fi',body:'PRIVATE: employee details must stay in Desk',fields:[],requester:'reader@knowledge.test',priority:'normal',channel:'agent'});assert.ok(t.ok);
 hub.setPrincipal(identities.owner);assert.ok((await hub.connectApp({name:'Lunch',canisterId:identities.lunch.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]})).ok);hub.setPrincipal(identities.lunch);const lunch=await hub.team_members();
 const before=await d.getTicket(tokens.author,t.id);
 if(upgrade){for(const [name,f] of [['hub',h],['desk',apps.desk]]){await pic.upgradeCanister({sender:identities.controller,canisterId:f.canisterId,wasm:candidateBackend(name),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});const a=pic.createActor(await idl(resolve(name,'backend/dist/backend.did')),f.canisterId);if(name==='hub')hub=a;else{d=a;f.app=a;}}hub.setPrincipal(identities.owner);assert.ok((await hub.checkAppPermissions(apps.desk.conn.id)).ok);assert.deepEqual(await d.getTicket(tokens.author,t.id),before);}
 await connect('knowledge',upgrade);const grants=[{id:ids.author,role:'author'},{id:ids.reviewer,role:'reviewer'},{id:ids.reader,role:'reader'},{id:ids.outsider,role:'reviewer'}];await policy('knowledge',grants);
 let k=apps.knowledge.app;const kt={};for(const n of ['owner','author','reviewer','reader','outsider'])kt[n]=await login('knowledge',n);
 denied(await d.confirmKnowledgeSolution(tokens.reader,t.id,0n,'Restart the access point and verify all rooms.'));
 denied(await d.confirmKnowledgeSolution(tokens.author,t.id,0n,'Restart the access point and verify all rooms.'));
 assert.ok((await d.setStatus(tokens.author,t.id,'resolved','')).ok);
 const solution=ok(await d.confirmKnowledgeSolution(tokens.author,t.id,0n,'Restart the access point and verify all rooms.'));assert.equal(solution.revision,1n);
 denied(await d.confirmKnowledgeSolution(tokens.author,t.id,0n,'Conflicting replacement solution.'));
 const input={desk:apps.desk.conn.id,ticket:t.id,article:[],requestId:'knowledge-request-0001'};
 denied(await k.createProposal(kt.reader,input));denied(await k.createProposal(kt.outsider,input));denied(await k.createProposal('forged',input));
 const proposal=ok(await k.createProposal(kt.author,input));assert.equal(ok(await k.createProposal(kt.author,input)),proposal);denied(await k.createProposal(kt.author,{...input,ticket:t.id+1n}));
 assert.deepEqual((await k.articles(kt.reader,'',0n)).rows,[]);assert.deepEqual(await k.proposals(kt.reader,0n),[]);
 denied(await k.proposal(kt.reader,proposal));denied(await k.proposal(kt.outsider,proposal));
 const detail=ok(await k.proposal(kt.reviewer,proposal));assert.doesNotMatch(JSON.stringify(detail,(_,v)=>typeof v==='bigint'?String(v):v),/PRIVATE/);
 denied(await k.publishProposal(kt.author,proposal,1n));
 const content={title:'Restore meeting-room Wi-Fi',document:document('Restart the access point. Verify every meeting room, then record the result.')};
 denied(await k.saveProposal(kt.author,proposal,1n,{...content,document:JSON.stringify({type:'doc',content:[{type:'image',attrs:{src:'https://outside.invalid/tracker'}}]})}));
 denied(await k.saveProposal(kt.author,proposal,1n,{...content,document:'{"type":"doc","type":"paragraph","content":[{"type":"paragraph","content":[{"type":"text","text":"Ambiguous document"}]}]}'}));
 const simultaneous=await Promise.all([k.saveProposal(kt.author,proposal,1n,content),k.saveProposal(kt.reviewer,proposal,1n,content)]);assert.equal(simultaneous.filter(r=>'ok'in r).length,1);const revision=ok(simultaneous.find(r=>'ok'in r));denied(await k.saveProposal(kt.author,proposal,1n,{...content,title:'Stale title'}));
 const publishes=await Promise.all([k.publishProposal(kt.reviewer,proposal,revision),k.publishProposal(kt.owner,proposal,revision)]);assert.ok(publishes.some(r=>'ok'in r));const article=ok(publishes.find(r=>'ok'in r));assert.equal(ok(await k.publishProposal(kt.reviewer,proposal,revision)),article);assert.equal((await k.history(kt.reader,article)).length,1);
 assert.equal((await k.article(kt.reader,article))[0].document,content.document);
 const p2=ok(await k.createProposal(kt.author,{...input,article:[article],requestId:'knowledge-request-0002'}));const p3=ok(await k.createProposal(kt.author,{...input,article:[article],requestId:'knowledge-request-0003'}));
 await k.saveProposal(kt.author,p2,1n,{...content,document:document('Updated documented solution.')});ok(await k.publishProposal(kt.reviewer,p2,2n));denied(await k.publishProposal(kt.reviewer,p3,1n));assert.equal((await k.history(kt.reader,article)).length,2);assert.equal((await k.articleVersion(kt.reader,article,1n))[0].document,content.document);
 const p4=ok(await k.createProposal(kt.author,{...input,article:[article],requestId:'knowledge-request-0004'}));assert.ok((await d.setStatus(tokens.author,t.id,'open','')).ok);denied(await k.publishProposal(kt.reviewer,p4,1n));
 assert.ok((await d.setStatus(tokens.author,t.id,'resolved','')).ok);ok(await d.confirmKnowledgeSolution(tokens.author,t.id,1n,'A new confirmed resolution replaces the original evidence.'));denied(await k.publishProposal(kt.reviewer,p4,1n));
 const p5=ok(await k.createProposal(kt.author,{...input,article:[article],requestId:'knowledge-request-0005'}));await policy('desk',[{id:ids.author,role:'agent'}]);denied(await k.publishProposal(kt.reviewer,p5,1n));await policy('desk',deskRoles);
 const large='Network verification '.repeat(2000);const p6=ok(await k.createProposal(kt.author,{...input,requestId:'knowledge-request-0006'}));ok(await k.saveProposal(kt.author,p6,1n,{title:'Large operational guide',document:document(large)}));ok(await k.publishProposal(kt.reviewer,p6,2n));assert.equal((await k.articles(kt.reader,'operational',0n)).rows.length,1);
 for(let i=0;i<32;i++){const p=ok(await k.createProposal(kt.author,{...input,requestId:'knowledge-pagination-'+String(i).padStart(4,'0')}));ok(await k.saveProposal(kt.author,p,1n,{title:'Procedure '+i,document:document(i===31?'A unique final search marker.':'Check the room network.')}));ok(await k.publishProposal(kt.reviewer,p,2n));}
 const page1=await k.articles(kt.reader,'',0n);assert.equal(page1.rows.length,30);const page2=await k.articles(kt.reader,'',page1.next[0]);assert.equal(page2.rows.length,4);assert.deepEqual(page2.next,[]);assert.equal(new Set([...page1.rows,...page2.rows].map(a=>String(a.article))).size,34);
 const search1=await k.articles(kt.reader,'unique final search',0n);assert.equal(search1.rows.length,0);assert.ok(search1.next.length);const search2=await k.articles(kt.reader,'unique final search',search1.next[0]);assert.equal(search2.rows.length,1);
 const saved=await k.article(kt.reader,article);await pic.upgradeCanister({sender:identities.controller,canisterId:apps.knowledge.canisterId,wasm:candidateBackend('knowledge'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});k=pic.createActor(await idl(resolve('knowledge/backend/dist/backend.did')),apps.knowledge.canisterId);hub.setPrincipal(identities.owner);assert.ok((await hub.checkAppPermissions(apps.knowledge.conn.id)).ok);assert.deepEqual(await k.article(kt.reader,article),saved);assert.equal((await k.history(kt.reader,article)).length,2);
 assert.equal(ok(await k.proposal(kt.author,p5)).proposal.source.length,1);denied(await k.proposal(kt.outsider,p5));
 await manualAndSharing({k,kt,pic,article,refresh:async()=>{await policy('knowledge',grants);for(const n of Object.keys(kt))kt[n]=await login('knowledge',n);},upgrade:async()=>{await pic.upgradeCanister({sender:identities.controller,canisterId:apps.knowledge.canisterId,wasm:candidateBackend('knowledge'),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});await policy('knowledge',grants);}});
 await policy('knowledge',grants.filter(g=>g.id!==ids.reader));assert.deepEqual(await k.article(kt.reader,article),[]);
 hub.setPrincipal(identities.lunch);assert.deepEqual(await hub.team_members(),lunch);
 hub.setPrincipal(identities.reader);denied(await hub.hub_knowledgeEvidence(ids.owner,apps.desk.conn.id,t.id));
 }finally{await pic.tearDown();}
});
