import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {PocketIc,createIdentity} from '@dfinity/pic';
import {idl} from './oncall.mjs';
import {candidateBackend} from '../packaged-wasm.mjs';
export const identity=Object.fromEntries(['controller','owner','alpha','beta','employee','lunch'].map(n=>[n,createIdentity('workboard-'+n).getPrincipal()]));
export const key=n=>'workboard-request-'+String(n).padStart(6,'0');
export const unwrap=r=>{assert.ok(r.ok,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.ok;};
export async function setup(serverUrl,baseline=false){
 const pic=await PocketIc.create(serverUrl);await pic.setTime(Date.parse('2026-09-29T12:00:00Z'));
 const x={pic,apps:{},tokens:{},ids:{}};
 const install=async name=>{const dir=baseline?resolve(process.env.KEBAB_WORKBOARD_BASELINE,name):resolve(name,'backend/dist');return pic.setupCanister({sender:identity.controller,controllers:[identity.controller],wasm:baseline?dir+'/backend.wasm':candidateBackend(name),idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ab'.repeat(32)}]:[]});};
 x.h=await install('hub');x.hub=x.h.actor;x.hub.setPrincipal(identity.owner);assert.ok((await x.hub.claimHubWithCode('ab'.repeat(32),{email:'owner@workboard.test',displayName:'Morgan',orgName:'Example company'})).ok);
 for(const n of ['alpha','beta','employee']){x.hub.setPrincipal(identity.owner);assert.ok(await x.hub.addLocalUser(n+'@workboard.test',n==='alpha'?'Alex':n==='beta'?'Sam':'Taylor','',''));const [code]=await x.hub.createInvite(n+'@workboard.test');x.hub.setPrincipal(identity[n]);assert.ok(await x.hub.claimInvite(code));}
 x.hub.setPrincipal(identity.owner);for(const n of ['owner','alpha','beta','employee'])x.ids[n]=(await x.hub.personCard(n+'@workboard.test'))[0].pid;
 x.group=(await x.hub.addGroup('IT Operations','')).id;await x.hub.setGroupMembers(x.group,['alpha@workboard.test'],[]);
 for(const name of ['desk','assets']){const f=await install(name);f.app=f.actor;f.app.setPrincipal(identity.controller);await f.app.setHub(x.h.canisterId.toText());x.hub.setPrincipal(identity.owner);f.conn=await x.hub.connectApp({name,canisterId:f.canisterId.toText(),note:'',lanes:['identity','profile','groups','notify'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[{name,kind:'app',url:'https://'+name+'.workboard.test'}]});assert.ok(f.conn.ok);f.policy={app:name,defaultRole:'member',people:name==='desk'?['alpha','beta'].map(n=>({id:x.ids[n],role:'agent'})):[],groups:[]};assert.ok((await x.hub.setAppPermissions(f.conn.id,0n,f.policy)).ok);x.apps[name]=f;}
 x.refresh=async()=>{x.hub.setPrincipal(identity.owner);for(const f of Object.values(x.apps))assert.ok((await x.hub.checkAppPermissions(f.conn.id)).ok);};
 x.policy=async(name,people)=>{const f=x.apps[name];x.hub.setPrincipal(identity.owner);const [p]=await x.hub.getAppPermissions(f.conn.id);f.policy={...f.policy,people};assert.ok((await x.hub.setAppPermissions(f.conn.id,p.revision,f.policy)).ok);await x.refresh();};
 x.login=async(name,who)=>{x.hub.setPrincipal(identity[who]);const t=await x.hub.mintAppTicket('',x.apps[name].conn.tileId);assert.ok(t.ok);const [s]=await x.apps[name].app.loginWithTicket(t.ticket);assert.ok(s);return s.token;};
 for(const n of ['owner','alpha','beta','employee'])x.tokens[n]=await x.login('desk',n);
 x.assetToken=await x.login('assets','owner');x.hub.setPrincipal(identity.owner);
 const cfg=await x.hub.getFinanceTeam();assert.ok((await x.hub.setFinanceTeam({...cfg.config,mode:'team',people:[x.ids.alpha],groups:[],apps:[{cid:x.apps.assets.conn.id,canisterId:x.apps.assets.canisterId}]})).ok);
 await x.refresh();
 await x.apps.desk.app.updateSettings(x.tokens.owner,{appUrl:'https://desk.workboard.test',orgName:'Example company',agentGroup:'',adminGroup:'',keyPrefix:'IT',autoCloseDays:7n});
 const a=x.apps.assets.app;await a.setSettings(x.assetToken,{orgName:'Example company',appUrl:'https://assets.workboard.test',tagPrefix:'HW-',adminGroup:''});
 await a.setBilling(x.assetToken,{legalName:'Example AG',street:'Example street',houseNo:'1',postalCode:'8000',town:'Zurich',country:'CH',uid:'CHE-123.456.789',vatRegistered:true,vatRateBp:810n,iban:'CH9300762011623852957',currency:'CHF',prefix:'TEST-',yearInNumber:true,paymentDays:14n,lang:'en',depreciationMonths:36n,floorPct:10n,minPriceMinor:5000n,waiverText:'Synthetic fixture terms.',waiverVersion:1n,footer:'TEST ONLY'});
 const asset=await a.createAsset(x.assetToken,{tag:'HW-104',serial:'TEST-SERIAL',vendor:'Example',model:'Laptop',kind:'laptop',note:'PRIVATE TECHNICAL NOTE'});assert.ok(asset.ok);x.assetId=asset.id;
 const sale=await a.createSale(x.assetToken,asset.id,{pid:'',name:'PRIVATE BUYER',email:'private@outside.test',street:'PRIVATE ADDRESS',houseNo:'2',postalCode:'8001',town:'Zurich',country:'CH'},10000n,'PRIVATE SALE NOTE');assert.ok(sale.ok);x.saleId=sale.id;
 assert.ok((await a.offerSale(x.assetToken,sale.id)).ok);assert.ok((await a.recordWaiver(x.assetToken,sale.id,'Signed offline')).ok);assert.ok((await a.issueInvoice(x.assetToken,sale.id)).ok);
 const d=x.apps.desk.app,type=(await d.catalog(x.tokens.owner)).find(t=>!t.fields.length);const t=await d.agentCreate(x.tokens.owner,{typeId:type.id,subject:'Prepare meeting room for the new team',body:'PRIVATE BODY',fields:[],requester:'employee@workboard.test',priority:'normal',channel:'agent'});assert.ok(t.ok);x.ticketId=t.id;
 x.hub.setPrincipal(identity.owner);assert.ok((await x.hub.connectApp({name:'Lunch',canisterId:identity.lunch.toText(),note:'',lanes:['identity'],access:{mode:'everyone',groups:[],roles:[],people:[]},tile:[]})).ok);x.hub.setPrincipal(identity.lunch);x.lunch=await x.hub.team_members();
 x.upgrade=async()=>{for(const [name,f] of [['hub',x.h],...Object.entries(x.apps)]){await pic.upgradeCanister({sender:identity.controller,canisterId:f.canisterId,wasm:candidateBackend(name),upgradeModeOptions:{skip_pre_upgrade:[],wasm_memory_persistence:[{keep:null}]}});const actor=pic.createActor(await idl(resolve(name,'backend/dist/backend.did')),f.canisterId);if(name==='hub')x.hub=actor;else f.app=actor;}await x.refresh();};
 await x.refresh();return x;
}
export const projectInput={name:'Office network refresh',description:'Test each meeting room before the new team arrives.',scope:{group:'IT Operations'},dueOn:'2026-10-09'};
export const taskInput=(pid,owner)=>({projectId:[pid],title:'Validate meeting room Wi-Fi',note:'Walk through the rooms after the access points are installed.',assignee:owner,dueOn:'2026-10-02',column:{planned:null},waitingFor:''});
