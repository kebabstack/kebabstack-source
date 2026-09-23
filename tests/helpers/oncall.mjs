import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {PocketIc,PocketIcServer,createIdentity} from '@dfinity/pic';
const names=['controller','owner','alpha','beta','employee'];
const identity=Object.fromEntries(names.map(n=>[n,createIdentity('oncall-response-'+n).getPrincipal()]));

async function idl(path){const js=execFileSync('python3',['sdk/tools/did2idl.py',path],{encoding:'utf8'});return(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).idlFactory;}
async function install(pic,name,baseline=false){const dir=name==='hub'&&process.env.KEBAB_REPORTING_HUB_BASELINE?process.env.KEBAB_REPORTING_HUB_BASELINE:baseline?process.env.KEBAB_CUSTOMER_BASELINE:resolve(name,'backend/dist');return pic.setupCanister({sender:identity.controller,controllers:[identity.controller],wasm:name==='hub'&&!process.env.KEBAB_REPORTING_HUB_BASELINE&&process.env.KEBAB_REPORTING_HUB_WASM?process.env.KEBAB_REPORTING_HUB_WASM:name==='desk'&&!baseline&&process.env.KEBAB_CUSTOMER_WASM?process.env.KEBAB_CUSTOMER_WASM:dir+'/backend.wasm',idlFactory:await idl(dir+'/backend.did'),environmentVariables:name==='hub'?[{name:'KEBAB_CLAIM_CODE',value:'ac'.repeat(32)}]:[]});}
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
const unwrap=r=>{assert.ok(r.ok,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.ok;};
const key=n=>n.toString(16).padStart(32,'0');
async function projectSetup(pic,c,{plan=true,policy=true}={}){
 c.hub.setPrincipal(identity.owner);await c.hub.setGroupMembers(c.group,['beta@customer.test'],[]);await c.refresh();
 const id=unwrap(await c.desk.createOncallProject(c.tokens.owner,key(1),{name:'Response team',description:'Synthetic test',scope:{internal:'Product Alpha'},services:['API']})).id;
 if(plan){const startAt=BigInt(await pic.getTime()+60000)*1_000_000n,endAt=startAt+7n*86400000000000n,window={startAt,endAt,layer:0n};
  const p=unwrap(await c.desk.saveOncallPlan(c.tokens.owner,0n,0n,key(2),{projectId:id,startAt,endAt,timezone:'UTC',layers:['Primary','Backup'],windows:[window,{...window,layer:1n}],shifts:[{...window,personId:c.ids.alpha},{...window,layer:1n,personId:c.ids.beta}],template:'Test'}));
  unwrap(await c.desk.publishOncallPlan(c.tokens.owner,p.id,p.revision,false));await pic.advanceTime(61000);await c.refresh();}
 if(policy)unwrap(await c.desk.setOncallResponse(c.tokens.owner,id,0n,{enabled:true,ackMinutes:1n,fallback:c.ids.owner,retentionDays:30n}));
 return id;
}
const incidentInput=projectId=>({projectId,service:'API',title:'Synthetic outage',detail:'No customer data',severity:{major:null}});
async function open(c,pid,k=3){return unwrap(await c.desk.openOncallIncident(c.tokens.alpha,key(k),incidentInput(pid)));}
async function step(pic,c,ms=11000){await pic.advanceTime(ms);await c.refresh();await pic.advanceTime(11000);await pic.tick(35);}
async function renew(c,who='owner'){c.hub.setPrincipal(identity[who]);const t=await c.hub.mintAppTicket('',c.conn.tileId);c.tokens[who]=(await c.desk.loginWithTicket(t.ticket))[0].token;}
const view=async(c,id)=>(await c.desk.oncallIncident(c.tokens.owner,id))[0];


export {identity,setup,projectSetup,unwrap,key,view,step,renew,open,idl};
